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
// Resolve URL, key, table, and schema as one target. A partial MEMORY_BANK pair
// must never borrow the other half from the legacy archive: that is how readers and
// writers silently split across worlds. Explicit BEAD_TABLE/BRAIN_SCHEMA values remain
// supported for a deliberate cutover using the AIBE credential pair.
function getBrainTarget() {
    const memoryUrl = process.env.MEMORY_BANK_URL || '';
    const memoryKey = process.env.MEMORY_BANK_KEY || '';
    const wantsMemoryPair = !!(memoryUrl || memoryKey);
    if (wantsMemoryPair && (!memoryUrl || !memoryKey)) {
        return { ok: false, reason: 'incomplete_memory_bank_credentials' };
    }

    const url = wantsMemoryPair ? memoryUrl : (process.env.AIBE_BRAIN_URL || '');
    const key = wantsMemoryPair ? memoryKey : (process.env.AIBE_BRAIN_KEY || '');
    const table = process.env.BEAD_TABLE || (wantsMemoryPair ? 'beads' : 'aibe_brain');
    const schema = process.env.BRAIN_SCHEMA
        || (table === 'beads' || wantsMemoryPair ? 'memory_bank' : 'abacia_core');
    if (!url || !key) return { ok: false, reason: 'brain_target_unconfigured' };
    return {
        ok: true,
        url,
        key,
        table,
        schema,
        world: (table === 'beads' || schema === 'memory_bank') ? 'new_world' : 'legacy'
    };
}

function requireBrainTarget() {
    const target = getBrainTarget();
    if (!target.ok) throw new Error(target.reason);
    return target;
}

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

    const target = requireBrainTarget();
    // New-world beads carry graph lineage in the real top-level columns as well as
    // content.edges. Legacy aibe_brain has no such columns, so its shape stays intact.
    if (target.world === 'new_world') {
        bead.spawned_by = (source && String(source).split('.')[0]) || 'brain.client';
        bead.edges = edges;
    }
    const url = `${target.url}/rest/v1/${target.table}`;
    const headers = {
        'apikey': target.key,
        'Authorization': `Bearer ${target.key}`,
        'Content-Profile': target.schema,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bead)
    });

    const ok = response.status === 201 || response.status === 200 || response.status === 204;
    const responseText = response.status === 204 ? '' : await response.text();
    if (!ok) {
        throw new Error(`writeBead failed: ${response.status} ${responseText}`);
    }
    let rows = [];
    if (responseText) {
        try {
            const parsed = JSON.parse(responseText);
            rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) { rows = []; }
    }
    const receiptId = rows[0] && rows[0].id != null ? rows[0].id : null;
    if (receiptId == null) {
        return { source, ok: false, id: null, status: response.status,
            target: target.world, error: 'receipt_id_missing' };
    }
    return { source, ok: true, id: receiptId, status: response.status, target: target.world };
}

/**
 * Read beads matching the given filter.
 * @param {Object} filter - key‑value pairs for query parameters
 * @returns {Promise<Array>} array of bead objects
 */
async function readBead(filter = {}) {
    const target = requireBrainTarget();
    const params = new URLSearchParams(filter);
    const url = `${target.url}/rest/v1/${target.table}?${params}`;
    const headers = {
        'apikey': target.key,
        'Authorization': `Bearer ${target.key}`,
        'Accept-Profile': target.schema
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
    // This passed the raw value as the filter, producing ?source=<value> , PostgREST
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
    parseEdges,
    getBrainTarget
};