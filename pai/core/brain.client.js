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
function beadTable() { return process.env.BEAD_TABLE || 'aibe_brain'; }
function brainSchema() { return process.env.BRAIN_SCHEMA || 'abacia_core'; }

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
async function writeBead({ hamUid, agentGlobal, source, type, content, summary, importance, edges }) {
    if (!edges || !Array.isArray(edges) || edges.length === 0) {
        throw new Error('Orphan bead: edges array must contain at least one typed edge.');
    }

    if (!source) {
        throw new Error('writeBead requires a canonical source address in the form AGENT.hamUid.capability');
    }

    // Embed edges inside content (legacy aibe_brain has no edges column; the graph lived in content.edges)
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

    // new bank ('beads' table) requires a spawned_by column legacy never had; set it
    // only when writing to a schema that expects it, so legacy writes stay unchanged.
    if (beadTable() !== 'aibe_brain' && bead.spawned_by === undefined) {
        bead.spawned_by = (source && String(source).split('.')[0]) || 'brain.client';
    }
    // ⬡B:core.brain_client:WIRE:the_door_was_writing_to_the_old_house:20260717⬡
    // Founder-caught 20260717. This is THE door: the only writer that validates a
    // canonical source address, and the one ~56 raw-fetch callers are meant to be
    // redirected through. It has been writing the graph into content.edges since the
    // 20260713 cutover, because of the true-then-false comment above it: legacy
    // aibe_brain genuinely had no edges column. memory_bank.beads DOES. Verified live:
    // columns are id, ham_uid, agent_global, stamp_type, acl_stamp, source, summary,
    // content, importance, spawned_by, superseded_by, created_at, edges.
    // So every bead written through the door landed with edges COLUMN [] and the real
    // edge buried in a JSON blob no query can reach. Proof, bead 368796 by FUSION:
    //   edges column  : []
    //   content.edges : [{"type":"grounds","target":"DC499D0C.judgment_turns"}]
    // Counted live: 337,987 beads, 0 null, 328,003 with edges = [], only 9,984 (2.95%)
    // with a real edges column -- and every one of those 9,984 belongs to council
    // internals (PAI_OUTBOUND_COUNCIL, SHADOW, PAI_REQUEST_GATE, META_COMMENTARY,
    // WRIT, PAM) written by stageEdges() at pai.outbound.council.js:1907, which only
    // ever describes the cycle's own plumbing. The knowledge had no graph. The door
    // was not skipped because it was inconvenient. It was skipped because it was
    // pointed at the old house, same as ANEW_OWN_CODE_REPOS, same as the /cycle door
    // dropping identity, same as eanew's watermark. The 20260713 cutover left pointers
    // behind and this is the fourth one found today.
    // Same bank-detection pattern as spawned_by directly above. content.edges is kept
    // exactly as-is so legacy readers and every current caller are unchanged.
    if (beadTable() !== 'aibe_brain') {
        bead.edges = edges;
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

module.exports = {
    buildStamp,
    writeBead,
    readBead,
    findBySource,
    parseEdges
};