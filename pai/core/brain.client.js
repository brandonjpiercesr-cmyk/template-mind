// core/brain.client.js
// entered via the ABAHAM door, serving channel MESSAGES (every bead written or read
// for a HAM flows through here; the canonical brain client for all bead operations).
// CommonJS, uses global fetch (Node 18+), no ESM, no node-fetch.

'use strict';

// ⬡B:core.brain_client:WIRE:per_ham_new_world_boundary:20260715⬡
// This template is a per-HAM New World, so MEMORY_BANK_URL + MEMORY_BANK_KEY are
// its birth certificate. Missing or partial New World credentials fail closed even
// when shared legacy credentials happen to exist in the process environment.
// URL, key, table, and schema resolve together at call time; no world is cached.
function getBrainTarget() {
    const configuredHam = String(process.env.HAM_UID || '').trim().toUpperCase();
    const memoryUrl = String(process.env.MEMORY_BANK_URL || '').trim();
    const memoryKey = String(process.env.MEMORY_BANK_KEY || '').trim();
    if (!configuredHam) {
        return { ok: false, reason: 'ham_uid_unconfigured' };
    }
    if (!memoryUrl && !memoryKey) {
        return { ok: false, reason: 'memory_bank_target_unconfigured' };
    }
    if (!memoryUrl || !memoryKey) {
        return { ok: false, reason: 'incomplete_memory_bank_credentials' };
    }
    return {
        ok: true,
        url: memoryUrl,
        key: memoryKey,
        table: String(process.env.BEAD_TABLE || 'beads').trim() || 'beads',
        schema: String(process.env.BRAIN_SCHEMA || 'memory_bank').trim() || 'memory_bank',
        world: 'new_world',
        hamUid: configuredHam
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
 * @param {string} params.source - canonical source address
 * @param {string} params.type - bead type
 * @param {Object} params.content - bead payload (edges will be embedded inside)
 * @param {string} params.summary - human summary
 * @param {number} params.importance - numeric importance
 * @param {Array} params.edges - array of edge objects {type, target} (MUST have at least one)
 * @returns {Promise<{source: string, ok: boolean}>}
 */
async function writeBead({ hamUid, agentGlobal, source, type, content, summary, importance, edges }) {
    const target = requireBrainTarget();
    const requestedHam = String(hamUid || '').trim().toUpperCase();
    if (!requestedHam || requestedHam !== target.hamUid) {
        throw new Error('cross_world_write_denied');
    }
    if (!edges || !Array.isArray(edges) || edges.length === 0) {
        throw new Error('Orphan bead: edges array must contain at least one typed edge.');
    }

    if (!source) {
        throw new Error('writeBead requires a canonical source address in the form AGENT.hamUid.capability');
    }

    // Embed edges in content as a portable receipt and in the New World graph columns below.
    const payloadContent = (content && typeof content === 'object') ? Object.assign({}, content, { edges: edges }) : { data: content, edges: edges };

    const acl_stamp = buildStamp(source, type, '');

    // Canonical New World bead shape.
    const bead = {
        ham_uid: requestedHam,
        agent_global: agentGlobal,
        acl_stamp: acl_stamp,
        stamp_type: type,
        source: source,
        content: payloadContent,
        summary: summary || '',
        importance: importance || 0
    };

    // Every template-mind bead is New World graph material: lineage is both
    // top-level for graph queries and embedded in content for portable receipts.
    bead.spawned_by = (source && String(source).split('.')[0]) || 'brain.client';
    bead.edges = edges;
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
        return { source, acl_stamp, ok: false, id: null, status: response.status,
            target: { table: target.table, schema: target.schema, world: target.world },
            error: 'receipt_id_missing' };
    }
    return { source, acl_stamp, ok: true, id: receiptId, status: response.status,
        target: { table: target.table, schema: target.schema, world: target.world } };
}

/**
 * Read beads matching the given filter.
 * @param {Object} filter - key‑value pairs for query parameters
 * @returns {Promise<Array>} array of bead objects
 */
async function readBeadWithReceipt(filter = {}, options = {}) {
    let target;
    try {
        target = requireBrainTarget();
    } catch (error) {
        return {
            ok: false,
            attempted: false,
            rows: [],
            status: null,
            target: null,
            error: String(error && error.message || error).slice(0, 300)
        };
    }

    filter = filter && typeof filter === 'object' ? Object.assign({}, filter) : {};
    const requestedHamFilter = String(filter.ham_uid || '');
    const requestedHam = requestedHamFilter.replace(/^eq\./i, '').toUpperCase();
    const requestedStamp = String(filter.stamp_type || '').replace(/^eq\./i, '').toUpperCase();
    const unresolvedSystemInbox = requestedHam === 'UNKNOWN'
        && requestedStamp === 'UNRESOLVED_INBOUND';
    if (!requestedHamFilter) {
        return {
            ok: false, attempted: false, rows: [], status: null,
            target: { table: target.table, schema: target.schema, world: target.world },
            error: 'ham_uid_filter_required'
        };
    }
    if (requestedHam !== target.hamUid && !unresolvedSystemInbox) {
        return {
            ok: false, attempted: false, rows: [], status: null,
            target: { table: target.table, schema: target.schema, world: target.world },
            error: 'cross_world_read_denied'
        };
    }

    const params = new URLSearchParams(filter);
    const url = `${target.url}/rest/v1/${target.table}?${params}`;
    const headers = {
        'apikey': target.key,
        'Authorization': `Bearer ${target.key}`,
        'Accept-Profile': target.schema
    };
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || 5000);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

    try {
        const response = await fetch(url, {
            headers,
            signal: controller ? controller.signal : undefined
        });
        const responseText = typeof response.text === 'function' ? await response.text() : '';
        if (!response.ok) {
            return {
                ok: false,
                attempted: true,
                rows: [],
                status: response.status,
                target: { table: target.table, schema: target.schema, world: target.world },
                error: String(responseText || response.statusText || 'brain_read_failed').slice(0, 300)
            };
        }
        let parsed = [];
        try { parsed = responseText ? JSON.parse(responseText) : []; }
        catch (error) {
            return {
                ok: false,
                attempted: true,
                rows: [],
                status: response.status,
                target: { table: target.table, schema: target.schema, world: target.world },
                error: 'brain_read_invalid_json'
            };
        }
        const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rows) ? parsed.rows : []);
        return {
            ok: true,
            attempted: true,
            rows,
            status: response.status,
            target: { table: target.table, schema: target.schema, world: target.world },
            error: null
        };
    } catch (error) {
        const timedOut = error && error.name === 'AbortError';
        return {
            ok: false,
            attempted: true,
            rows: [],
            status: null,
            target: { table: target.table, schema: target.schema, world: target.world },
            error: timedOut ? 'brain_read_timeout' : String(error && error.message || error).slice(0, 300)
        };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function readBead(filter = {}, options = {}) {
    const receipt = await readBeadWithReceipt(filter, options);
    if (!receipt.ok) {
        const error = new Error(receipt.error || 'brain_read_failed');
        error.status = receipt.status;
        error.receipt = receipt;
        throw error;
    }
    return receipt.rows;
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
    const target = requireBrainTarget();
    const results = await readBead({
        source: 'eq.' + source,
        ham_uid: 'eq.' + target.hamUid,
        limit: '1'
    });
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
    readBeadWithReceipt,
    findBySource,
    parseEdges,
    getBrainTarget
};