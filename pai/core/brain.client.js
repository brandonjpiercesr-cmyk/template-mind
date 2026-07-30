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
// ⬡COLD:remember:remove:ONE_BRAIN_IO:20260723⬡
// CATHY.SHADOW cold-audit COLD-ANEW-BRAIN-0009. Auditor read the aibe_brain/abacia_core
// fallback as a retired path. Founder/CODA confirmed live: aibe_brain/abacia_core is the
// CURRENT canonical brain, not retired, so this fallback is NOT repointed here (removing it
// would sever the live world). The boundary stays cold/deterministic; the audited relationship
// is stamped rather than altered. One brain IO, env-driven, read at call time.
function brainUrl() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function brainKey() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function beadTable() { return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function brainSchema() { return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }
function normalizeHamUid(value) { return String(value || '').trim().toUpperCase(); }

// ⬡B:core.brain_client:911:stamp_law_four_colons_yyyymmdd_never_a_hollow_descriptor:20260726⬡
// GRANDMOTHER 911 pass. buildStamp was breaking the stamp law on EVERY bead this
// client has ever written, two ways at once:
//   1. it dated stamps with toISOString(), and an ISO timestamp carries two colons
//      of its own, so the stamp shipped SIX colons instead of the lawful four;
//   2. its only live caller (writeBead, below) passes suffix '', so the descriptor
//      field was empty and every stamp read as ⬡B:source:TYPE::<date>⬡.
// The law is exact: hex glyph, namespace, TYPE, descriptor, YYYYMMDD, four colons.
// core/decoder.js had NOTICED this and widened its own canon regex to tolerate both
// (empty descriptor, colons in the date). That is scaffolding around a defect. The
// defect is fixed here at the one source, and the decoder's tolerance is removed in
// the same pass; pre-fix beads are still readable there, but they are labelled as
// the legacy drift they are instead of being blessed as canon.
function stampDate(when) {
    const d = when instanceof Date ? when : new Date();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}${mm}${dd}`;
}

// A stamp field may never carry a colon (it would forge a fifth field) and may
// never be empty (a hollow descriptor is what the founder read as a broken stamp).
// Mechanical, no judgment: same class as buildAbcdTag below.
function stampField(value, fallback) {
    const cleaned = String(value == null ? '' : value)
        .trim().replace(/[:⬡]+/g, '_').replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || fallback;
}

// When a caller supplies no descriptor, derive one from the capability tail of the
// source address (the address IS the ACL, so its last named segment is the truest
// descriptor available). Trailing numeric segments are call timestamps, not names.
function descriptorFor(source, type, suffix) {
    const given = stampField(suffix, '');
    if (given) return given.toLowerCase();
    const parts = String(source || '').split('.').filter(Boolean);
    while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
    const tail = parts.length ? parts[parts.length - 1] : '';
    return stampField(tail, stampField(type, 'bead')).toLowerCase().slice(0, 64);
}

// ⬡B:core.brain_client:FIX:every_brain_call_gets_a_bounded_ceiling:20260727⬡
// COLD-ANEW-CODA-HANG (CLAIR). writeBead had no signal at all and readBead only bounded
// itself when a caller happened to supply one -- and across the whole CODA wake path
// (wall.js, sensor.store.js, result.store.js, wake.outbox.js, mind.js, lanes.js,
// fix.pipeline.js...) not one caller ever does. A brain/Postgrest connection that stalls
// mid-response (not an error, not a refusal, just silence) hung the fetch forever, which
// hung whatever CODA cycle was awaiting it forever: durable CCWA_CHECKIN with zero
// CCWA_CHECKOUT, zero CODA_WONDER_RESULT, exactly the liveness gap PR #1173 armed a
// watchdog for without curing. This is the cure for one shape of that hang: the same
// bounded-timeout idiom already standing in core/model.ladder.js's combinedSignal and
// core/openrouter.seat.spend.js's usageSignal, applied to the ONE boundary every bead
// read and write in this codebase flows through. A caller-supplied signal (readBead
// already accepted one; the abort test below still holds) is preserved and combined,
// never overridden -- an explicit caller abort still wins, it just no longer has to be
// the ONLY thing standing between a stalled socket and an infinite await.
var DEFAULT_BRAIN_HTTP_TIMEOUT_MS = 8000;
function brainTimeoutMs(env) {
    var raw = Number((env || process.env).BRAIN_HTTP_TIMEOUT_MS);
    return Number.isFinite(raw) ? Math.max(500, Math.min(30000, Math.floor(raw))) : DEFAULT_BRAIN_HTTP_TIMEOUT_MS;
}
function boundedSignal(callerSignal, env) {
    var timeout = AbortSignal.timeout(brainTimeoutMs(env));
    if (!callerSignal) return timeout;
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([callerSignal, timeout]);
    var controller = new AbortController();
    [callerSignal, timeout].forEach(function (signal) {
        if (signal.aborted && !controller.signal.aborted) controller.abort(signal.reason);
        else signal.addEventListener('abort', function () {
            if (!controller.signal.aborted) controller.abort(signal.reason);
        }, { once: true });
    });
    return controller.signal;
}

/**
 * Build a four-colon ACL stamp wrapped in hex B markers.
 * @param {string} source - resource address (becomes the namespace field)
 * @param {string} type - bead type (e.g. 'page', 'log')
 * @param {string} suffix - the descriptor; derived from the source when empty
 * @param {Date} [when] - stamp date, defaults to now (UTC)
 * @returns {string} stamp in format B:namespace:TYPE:descriptor:YYYYMMDDB
 */
function buildStamp(source, type, suffix, when) {
    // ⬡B ... ⬡ markers (U+2B21 hexagon glyph + capital B)
    const openGlyph = '⬡B';
    const closeGlyph = '⬡';
    const namespace = stampField(source, 'unknown');
    const stampType = stampField(type, 'BEAD');
    const descriptor = descriptorFor(source, type, suffix);
    return `${openGlyph}:${namespace}:${stampType}:${descriptor}:${stampDate(when)}${closeGlyph}`;
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
async function writeBead({ hamUid, agentGlobal, source, type, content, summary, importance, edges, abcdTag, signal, env }) {
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
    // ⬡B:core.brain_client:FIX:abcd_tag_is_not_a_legacy_column_gate_it_like_its_neighbours:20260729⬡
    // FOUNDER 911, 20260729: verified live against this environment's own aibe_brain table
    // (PGRST204, "Could not find the 'abcd_tag' column of 'aibe_brain' in the schema cache"):
    // every writeBead call supplying both agentGlobal and type, with no explicit abcdTag
    // override, was failing outright against the legacy table, not just the graphic
    // designer's seeder that first surfaced it. spawned_by and edges right below this already
    // gate on beadTable() !== 'aibe_brain' for the identical reason (a column the new bank
    // has and the legacy table never did); abcd_tag gets the same gate rather than a special
    // case, since the caller still supplies its own abcdTag to opt in on legacy if it ever
    // needs to.
    if (abcdTag) { bead.abcd_tag = abcdTag; }
    else if (agentGlobal && type && beadTable() !== 'aibe_brain') { bead.abcd_tag = buildAbcdTag(agentGlobal, type); }

    // new bank ('beads' table) requires a spawned_by column legacy never had; set it
    // only when writing to a schema that expects it, so legacy writes stay unchanged.
    if (beadTable() !== 'aibe_brain' && bead.spawned_by === undefined) {
        bead.spawned_by = (source && String(source).split('.')[0]) || 'brain.client';
    }
    // ⬡B:core.brain_client:FIX:populate_the_real_edges_column_so_the_graph_is_queryable:20260722⬡
    // The Phase 9 never-wired audit found every writeBead bead's edges were embedded
    // ONLY inside content.edges, while the beads table's real, indexed `edges` column
    // sat empty ([]) — so the lineage/decoder graph was invisible to any containment
    // query and EVERY canon doctrine read as "never wired" even when the Keeper's own
    // receipt cited it. The new bank has a real edges column (other writers like the
    // PAI cycle already use it); populate it too. content.edges stays for backward
    // compatibility and for legacy aibe_brain, which has no edges column.
    if (beadTable() !== 'aibe_brain') {
        bead.edges = edges;
    }
    // ⬡B:core.brain_client:WIRE:a_privacy_envelope_populates_the_real_acl_tier_column:20260726⬡
    // The people ladder has to be a COLUMN to be a predicate, and a predicate is the only
    // kind of privacy ceiling that cannot be forgotten by a caller (see
    // migrations/0004_acl_tier_structural_people_ladder.sql and core/privacy/people.tier.js).
    // So the one canonical write mirrors content.privacy.tier out to acl_tier. A bead with no
    // privacy envelope leaves the column NULL, which is invisible to every reader above T0:
    // silence here means closed, never open. Still cold code and still no judgment; it copies
    // a number the founder or a mind already decided.
    try {
        var _priv = payloadContent && payloadContent.privacy;
        var _privTier = require('./privacy/people.tier.js')
          .parseTier(_priv && _priv.tier);
        if (_privTier != null) {
            bead.acl_tier = _privTier;
        }
    } catch (ePrivTier) {}
    // ⬡COLD:remember:tag:ONE_BRAIN_WRITE:20260723⬡
    // CATHY.SHADOW cold-audit COLD-ANEW-BRAIN-0012. The one canonical bead write. Cold code:
    // a REST write makes no judgment call, so it is correctly deterministic and env-driven.
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
        body: JSON.stringify(bead),
        signal: boundedSignal(signal, env)
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
function readLimit(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function readTooLarge(limit, actual) {
    const error = new Error('brain_read_response_too_large');
    error.code = 'brain_read_response_too_large';
    error.max_bytes = limit;
    error.response_bytes = actual;
    return error;
}

function readAborted() {
    const error = new Error('brain_read_aborted');
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}

function readStreamUnavailable() {
    const error = new Error('brain_read_stream_unavailable');
    error.code = 'brain_read_stream_unavailable';
    return error;
}

async function cancelResponseBody(body) {
    if (!body) return;
    try {
        if (typeof body.cancel === 'function') { await body.cancel(); return; }
        if (typeof body.getReader === 'function') {
            const reader = body.getReader();
            if (reader && typeof reader.cancel === 'function') await reader.cancel();
        }
    } catch (error) {}
}

async function boundedResponseJson(response, maxBytes, signal) {
    const limit = readLimit(maxBytes);
    if (!limit) return response.json();
    const declared = Number(response.headers && response.headers.get &&
        response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) {
        await cancelResponseBody(response.body);
        throw readTooLarge(limit, declared);
    }
    if (signal && signal.aborted) throw readAborted();
    if (!response.body || typeof response.body.getReader !== 'function') {
        throw readStreamUnavailable();
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            if (signal && signal.aborted) throw readAborted();
            const part = await reader.read();
            if (part.done) break;
            const chunk = Buffer.from(part.value);
            total += chunk.length;
            if (total > limit) throw readTooLarge(limit, total);
            chunks.push(chunk);
        }
    } catch (error) {
        if (typeof reader.cancel === 'function') {
            try { await reader.cancel(); } catch (cancelError) {}
        }
        throw error;
    }
    if (signal && signal.aborted) throw readAborted();
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

async function readBead(filter = {}, options = {}) {
    const params = new URLSearchParams(filter);
    const url = `${brainUrl()}/rest/v1/${beadTable()}?${params}`;
    const headers = {
        'apikey': brainKey(),
        'Authorization': `Bearer ${brainKey()}`,
        'Accept-Profile': brainSchema()
    };

    const response = await fetch(url, { headers,
        signal: boundedSignal(options && options.signal, options && options.env) });
    if (!response.ok) {
        throw new Error(`readBead failed: ${response.status} ${response.statusText}`);
    }
    const data = await boundedResponseJson(response, options && options.maxBytes,
        options && options.signal);
    // Assume the response body is an array of rows
    return Array.isArray(data) ? data : (data.rows || []);
}

/**
 * Find a bead by its source address.
 * @param {string} source - bead source address
 * @returns {Promise<Object|null>} first matching bead or null
 */
async function findBySource(source, hamUid, options) {
    // ⬡B:core.brain_client:FIX:findBySource_missing_eq_operator:20260709⬡
    // This passed the raw value as the filter, producing ?source=<value> — PostgREST
    // requires an operator (?source=eq.<value>) and 400s without one. Found live when
    // the idempotency layer's first real claim failed. Every caller gets the fix here.
    // ⬡B:core.brain_client:GUARD:source_reads_bind_exact_ham:20260720⬡
    // A source is an address inside one HAM world, not a global identity. The
    // STAMP synchronization briefly removed this filter; CODA sensor receipts
    // restore it before any source can authorize a cross-HAM readback.
    const filter = { source: 'eq.' + source, limit: '1' };
    const exactHam = normalizeHamUid(hamUid);
    if (exactHam) filter.ham_uid = 'eq.' + exactHam;
    const results = await readBead(filter, options);
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
// ⬡B:core.brain_client:911:validator_counts_the_colons_it_claims_to_count:20260726⬡
// The old pattern ended in `.+`, which accepts an ISO date and therefore accepts a
// SIX colon stamp: the validator would have passed every malformed stamp buildStamp
// wrote. It now holds the exact law: four colons, no empty field, YYYYMMDD date (an
// optional single trailing letter is real in the corpus, e.g. 20260617b).
var CANON_STAMP_RE = /^⬡B:([^:⬡]+):([^:⬡]+):([^:⬡]+):(\d{8}[a-z]?)⬡$/;
function validateStamp(aclStamp) {
  var s = String(aclStamp || '');
  return { ok: CANON_STAMP_RE.test(s), acl_stamp: s };
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
    stampDate,
    CANON_STAMP_RE,
    buildAbcdTag,
    validateStamp,
    auditUnstamped,
    stampStats,
    writeBead,
    readBead,
    findBySource,
    parseEdges,
    // Promoted to a real export (not just _test) so any OTHER module making its own raw
    // fetch() call to the same brain can bound it with the exact same default-timeout
    // policy instead of hand-rolling (or worse, skipping) a second one. One source, per
    // this codebase's own standing law: "Supersede, never delete. One source -- never two
    // hand-maintained copies." First real caller: advisors/coding.js, which duplicates
    // this file's URL/key/table/schema helpers on purpose (documented in its own header)
    // but had no bounded-timeout equivalent of its own.
    boundedSignal,
    brainTimeoutMs,
    // Promoted the same way boundedSignal/brainTimeoutMs were: any OTHER module deciding
    // whether a new-bank-only column (edges, spawned_by, abcd_tag, superseded_by, ...) is
    // safe to reference against the live table needs this same one fact, and this file is
    // its one source. First real callers: coding-department/contractors/graphic.designer.js
    // and brand.guide.reader.js, which both filtered on superseded_by unconditionally.
    beadTable,
    _test: { normalizeHamUid, readLimit, readTooLarge, readAborted, readStreamUnavailable,
        cancelResponseBody, boundedResponseJson, brainTimeoutMs, boundedSignal,
        DEFAULT_BRAIN_HTTP_TIMEOUT_MS }
};
