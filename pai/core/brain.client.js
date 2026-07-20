// ⬡B:core.brain.client:MODULE:acl_header_added_in_audit:20260711⬡
// Header added during the July 11 full audit; file predates the ACL law.
// core/brain.client.js
// entered via the ABAHAM door, serving channel MESSAGES (every bead written or read
// for a HAM flows through here; the canonical brain client for all bead operations).
// CommonJS, uses global fetch (Node 18+), no ESM, no node-fetch.

'use strict';

// ⬡B:core.brain_client:WIRE:world_agnostic_boundary_20260711⬡
// PHASE 1 of the port (founder-authorized). This is the ONE canonical boundary every
// bead read/write is meant to flow through. Made world-agnostic here, ONCE, so the
// port never becomes a 265-file rewrite: a world supplies MEMORY_BANK_* + BEAD_TABLE
// + BRAIN_SCHEMA and this client becomes that world; supply nothing and it is
// byte-identical to the legacy behavior it always had (AIBE_BRAIN_* / aibe_brain /
// abacia_core). Env is read at CALL time, never cached at module load, so a world's
// identity is never frozen to whatever was set the instant this file was required.
// Not a wonder: a REST boundary makes no judgment call, so it is correctly cold code
// (env-driven, deterministic) -- forcing an LLM in here would be theater.
function brainUrl() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function brainKey() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function beadTable() { return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function brainSchema() { return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

/**
 * Build a four‑colon ACL stamp wrapped in hex B markers.
 * @param {string} source - resource address
 * @param {string} type - bead type (e.g. 'page', 'log')
 * @param {string} suffix - additional suffix (e.g. timestamp)
 * @returns {string} stamp in format B:source:type:suffix:dateB
 */
function buildStamp(source, type, suffix) {
    const date = new Date().toISOString();
    // ⬡B ... ⬡ markers (U+2B21 hexagon glyph + capital B)
    const openGlyph = '⬡B';
    const closeGlyph = '⬡';
    return `${openGlyph}:${source}:${type}:${suffix}:${date}${closeGlyph}`;
}

/**
 * Write a bead to the brain database.
 * @param {Object} params
 * @param {string} params.hamUid - unique ham identifier
 * @param {string} params.agentGlobal - global agent name (e.g. 'canew')
 * @param {string} [params.source] - ignored; source is dynamically built
 * @param {string} params.type - bead type
 * @param {Object} params.content - bead payload (edges will be embedded inside)
 * @param {string} params.summary - human summary
 * @param {number} params.importance - numeric importance
 * @param {Array} params.edges - array of edge objects {type, target} (MUST have at least one)
 * @returns {Promise<{source: string, ok: boolean}>}
 */
async function writeBead({ hamUid, agentGlobal, source, type, content, summary, importance, edges, abcdTag }) {
    if (!edges || !Array.isArray(edges) || edges.length === 0) {
        throw new Error('Orphan bead: edges array must contain at least one typed edge.');
    }

    if (!source) {
        throw new Error('writeBead requires a canonical source address in the form AGENT.hamUid.capability');
    }

    // Embed edges inside content (aibe_brain has no edges column; the graph lives in content.edges)
    const payloadContent = (content && typeof content === 'object') ? Object.assign({}, content, { edges: edges }) : { data: content, edges: edges };

    const acl_stamp = buildStamp(source, type, '');

    // Real aibe_brain columns: ham_uid, agent_global, acl_stamp, stamp_type, source, content, summary, importance
    const bead = {
        ham_uid: hamUid,
        agent_global: agentGlobal,
        acl_stamp: acl_stamp,
        stamp_type: type,
        source: source,
        content: payloadContent,
        summary: summary || '',
        importance: importance || 0
    };
    // STAMP's ABCD tag half: only set when the caller supplies one (or derives one from
    // agentGlobal+type as a sane default), never overwrites a caller's explicit choice.
    if (abcdTag) { bead.abcd_tag = abcdTag; }
    else if (agentGlobal && type) { bead.abcd_tag = buildAbcdTag(agentGlobal, type); }

    // new bank ('beads' table) requires a spawned_by column legacy never had; set it
    // only when writing to a schema that expects it, so legacy writes stay unchanged.
    if (beadTable() !== 'aibe_brain' && bead.spawned_by === undefined) {
        bead.spawned_by = (source && String(source).split('.')[0]) || 'brain.client';
    }
    const url = `${brainUrl()}/rest/v1/${beadTable()}`;
    const headers = {
        'apikey': brainKey(),
        'Authorization': `Bearer ${brainKey()}`,
        'Content-Profile': brainSchema(),
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bead)
    });

    const ok = response.status === 201 || response.status === 200 || response.status === 204;
    if (!ok) {
        const errText = await response.text();
        throw new Error(`writeBead failed: ${response.status} ${errText}`);
    }
    return { source, ok };
}

/**
 * Read beads matching the given filter.
 * @param {Object} filter - key‑value pairs for query parameters
 * @returns {Promise<Array>} array of bead objects
 */
async function readBead(filter = {}) {
    const params = new URLSearchParams(filter);
    const url = `${brainUrl()}/rest/v1/${beadTable()}?${params}`;
    const headers = {
        'apikey': brainKey(),
        'Authorization': `Bearer ${brainKey()}`,
        'Accept-Profile': brainSchema()
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`readBead failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // Assume the response body is an array of rows
    return Array.isArray(data) ? data : (data.rows || []);
}

/**
 * Find a bead by its source address.
 * @param {string} source - bead source address
 * @returns {Promise<Object|null>} first matching bead or null
 */
async function findBySource(source) {
    // ⬡B:core.brain_client:FIX:findBySource_missing_eq_operator:20260709⬡
    // This passed the raw value as the filter, producing ?source=<value> — PostgREST
    // requires an operator (?source=eq.<value>) and 400s without one. Found live when
    // the idempotency layer's first real claim failed. Every caller gets the fix here.
    const results = await readBead({ source: 'eq.' + source, limit: '1' });
    return results.length > 0 ? results[0] : null;
}

/**
 * Extract edges array from a bead's content.
 * @param {Object} bead - bead object with content.edges
 * @returns {Array} edges array or empty array
 */
function parseEdges(bead) {
    if (bead && bead.content && Array.isArray(bead.content.edges)) {
        return bead.content.edges;
    }
    return [];
}


// ⬡B:core.brain_client:BUILD:stamp_abcd_tag_validate_audit_the_missing_half_of_stamp:20260719⬡
// STAMP (Systematic Tagging and Archival Management Protocol), per the founder's own
// documented spec across multiple sessions: every brain entry gets BOTH an ACL stamp
// (namespace/type/date, already covered by buildStamp above) AND an ABCD tag
// (AGENT_TYPE, e.g. DAWN_BRIEFING, HUNCH_TIP, SHADOW_AUDIT) so FIND can filter by exact
// agent+category instead of a full-text scan across the whole brain. The ABCD tag half
// was never built anywhere in this world -- not one station this session set one. This
// closes that gap. STAMP is intentionally COLD (documented "zero LLM cost, pure string
// ops" across the founder's own history): tagging is mechanical once the calling agent
// has already decided the content, so no organ belongs here; forcing an LLM in would be
// theater, the same call already made for the REST boundary above.
//
// Format: AGENT_CATEGORY, uppercase, underscore-joined. Examples: DAWN_BRIEFING,
// HUNCH_TIP, SHADOW_AUDIT, GHOST_WATCH.
function buildAbcdTag(agent, category) {
  var a = String(agent || 'unknown').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  var c = String(category || 'note').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return a + '_' + c;
}

// validate_stamp: does this bead's acl_stamp match the real hexagon-wrapped four-colon
// shape? Cold, mechanical, no judgment about content, only shape.
function validateStamp(aclStamp) {
  var s = String(aclStamp || '');
  var ok = /^⬡B:[^:]+:[^:]+:[^:]+:.+⬡$/.test(s);
  return { ok: ok, acl_stamp: s };
}

// audit_unstamped: find recent beads missing an abcd_tag, so STAMP can self-review its
// own coverage (the exit/rally shape for a cold utility: it looks back at its own prior
// work and reports the gap, rather than firing once and never checking itself again).
async function auditUnstamped(limitCount) {
  try {
    var lim = isFinite(parseInt(limitCount, 10)) ? parseInt(limitCount, 10) : 50;
    var rows = await readBead({ select: 'id,source,stamp_type,abcd_tag', order: 'id.desc', limit: String(lim) });
    var unstamped = (Array.isArray(rows) ? rows : []).filter(function (b) { return !b.abcd_tag; });
    return { checked: (Array.isArray(rows) ? rows.length : 0), unstamped_count: unstamped.length, unstamped: unstamped.slice(0, 20) };
  } catch (e) { return { checked: 0, unstamped_count: 0, unstamped: [], error: e.message }; }
}

// stamp_stats: cold counts by stamp_type over the most recent window, for a quick health
// read of what is actually being written, no LLM needed.
async function stampStats(limitCount) {
  try {
    var lim = isFinite(parseInt(limitCount, 10)) ? parseInt(limitCount, 10) : 200;
    var rows = await readBead({ select: 'stamp_type', order: 'id.desc', limit: String(lim) });
    var counts = {};
    (Array.isArray(rows) ? rows : []).forEach(function (b) {
      var t = b.stamp_type || 'UNKNOWN';
      counts[t] = (counts[t] || 0) + 1;
    });
    return { sample_size: (Array.isArray(rows) ? rows.length : 0), counts: counts };
  } catch (e) { return { sample_size: 0, counts: {}, error: e.message }; }
}

module.exports = {
    buildStamp,
    buildAbcdTag,
    validateStamp,
    auditUnstamped,
    stampStats,
    writeBead,
    readBead,
    findBySource,
    parseEdges
};