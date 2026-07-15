// ⬡B:core.find:MODULE:microsecond_brain_search:20260630⬡
// FIND -- Mount Rushmore. Always on. Stamp-based precision queries.
// Entered only through the ABAHAM door's authenticated per-HAM PAI cycle; serves MESSAGES.
// No ilike wildcards. No full-table scans. Filter by stamp_type, source prefix, ham_uid.
// Runs in parallel via Promise.all. Target: <100ms for any query set.
// ANYHAM test: ham_uid parameter drives all reads. No HAM hardcoded here.
// Cost: C0 -- pure Supabase REST, zero LLM calls.

// ⬡B:core.find:FIX:restore_organ_after_8b_lobotomy:20260703⬡
// Commit a66c148 (an 8B fallback build, pre model-chain fix fa58b0a) REPLACED this
// entire file with a 50-line generic stub, severing all six named finders from 34+
// dependents; every Memory Bank assembly then threw 'findIdentity is not a function' and
// every turn on every channel ran on a generic prompt -- caught live by a test-HAM
// regression turn (logful pai.memorybank_fallback regression turn, source ts 1783039989311). This is the
// last good version restored verbatim from f8cfe19 (which already carried the
// order:asc capability and the findContext/findPersonProfile work). Restoration of
// lost code, zero new behavior.
'use strict';
// ⬡B:core.find:WIRE:canonical_new_world_brain_client:20260715⬡
// FIND owns query semantics; the canonical brain client owns the one authenticated
// New World transport boundary and fails unborn when MEMORY_BANK_* is unavailable.
const { getBrainTarget, readBeadWithReceipt } = require('./brain.client.js');

async function bq(filter) {
  return readBeadWithReceipt(filter, { timeoutMs: 2500 });
}

// FIND entry point -- run multiple queries in parallel, merge, dedupe by id
// queries: array of { stamp_type?, source_prefix?, ham_uid?, importance_gte?, limit? }
async function find(queries) {
  if (!Array.isArray(queries)) queries = [queries];
  var t0 = Date.now();
  var target = getBrainTarget();
  var targetReady = !!(target && target.ok);

  var promises = queries.map(function(q) {
    q = q && typeof q === 'object' ? q : {};
    var filter = {};
    if (q.stamp_type) filter.stamp_type = 'eq.' + String(q.stamp_type);
    if (q.source_prefix) filter.source = 'like.' + String(q.source_prefix) + '*';
    if (q.ham_uid) filter.ham_uid = 'eq.' + String(q.ham_uid);
    // Exact equality only: no fuzzy topic scans.
    if (q.agent_global) filter.agent_global = 'eq.' + String(q.agent_global);
    if (q.importance_gte != null) filter.importance = 'gte.' + Number(q.importance_gte);
    // Source names are lexicographically ordered within multi-part documents.
    filter.order = q.order === 'asc' ? 'source.asc' : 'created_at.desc';
    filter.limit = String(Math.max(1, Math.min(50, Number(q.limit) || 10)));
    return bq(filter);
  });

  var results = await Promise.all(promises);

  // Merge + dedupe by id
  var seen = {};
  var merged = [];
  results.forEach(function(result) {
    (result && result.rows || []).forEach(function(row) {
      if (!seen[row.id]) {
        seen[row.id] = true;
        merged.push(row);
      }
    });
  });
  var readFailures = results.filter(function(result) { return !result || !result.ok; }).map(function(result) {
    return { status: result ? result.status : null, error: result ? result.error : 'missing_read_result' };
  });

  return {
    beads: merged,
    ms: Date.now() - t0,
    count: merged.length,
    reads: targetReady ? promises.length : 0,
    read_ok: targetReady && readFailures.length === 0,
    read_failures: readFailures
  };
}

// Named FIND patterns used by the Memory Bank builder
// Identity: who is this HAM, their context and trust
async function findIdentity(hamUid) {
  return find([
    { stamp_type: 'DIRECTIVE', ham_uid: hamUid, limit: 3 },
    { stamp_type: 'HAM_IDENTIFIER', ham_uid: hamUid, limit: 5 }
  ]);
}

// Agent JDs: all agent definitions available as tools
async function findAgentJDs(hamUid) {
  return find([
    { stamp_type: 'AGENT_JD', ham_uid: hamUid, limit: 30 },
    { source_prefix: 'agent.jd', ham_uid: hamUid, limit: 20 }
  ]);
}

// Recent context: last N minutes + results for a HAM
async function findContext(hamUid, limit) {
  // ⬡B:core.find:FIX:conversation_context_not_machinery:20260702⬡
  // Was: all MINUTES for the ham -- which is dominated by Overseer's every-3-minute
  // "air flowed through the ventilation system" machinery stamps. Her FCW context was
  // wall-to-wall ventilation, so she parroted it in every reply (screenshot evidence:
  // same phrase repeated across texts and emails). Now: conversation minutes
  // (pai.minutes.*) and high-importance results -- what was actually said and done.
  return find([
    { source_prefix: 'pai.minutes.', ham_uid: hamUid, limit: limit || 5 },
    { stamp_type: 'RESULT', ham_uid: hamUid, importance_gte: 7, limit: limit || 5 }
  ]);
}

// Semantic search: topic-specific brain reads
async function findBySource(sourcePrefix, limit) {
  return find([{ source_prefix: sourcePrefix, limit: limit || 10 }]);
}

// Recent RESULT BEADs across all activity (for meeting minutes context)
async function findRecentResults(hamUid, limit) {
  return find([{ stamp_type: 'RESULT', ham_uid: hamUid, importance_gte: 7, limit: limit || 10 }]);
}

// ⬡B:core.find:WIRE:findDoctrine_20260701⬡
// ROADMAP + DOCTRINE beads for a HAM's world. Added after a real live gap: asked
// "what is the most important thing on our roadmap" over text, she answered
// "I don't have any information on our roadmap" -- the Memory Bank loaded identity, agent
// JDs, and recent minutes but never doctrine or roadmap. ANYHAM test: hamUid drives
// the read, any HAM gets their own doctrine.
async function findDoctrine(hamUid, limit) {
  return find([
    { stamp_type: 'ROADMAP', ham_uid: hamUid, limit: limit || 2 },
    { stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: 8, limit: limit || 4 }
  ]);
}

// ⬡B:core.find:WIRE:findPersonProfile:20260702⬡
// Rich identity: who this person actually IS, from their scw.person_profile bead.
// Founder said, verbatim: "she should know me bro". Name + tier is not knowing
// someone. UNIVERSALITY: keyed by ham_uid -- any HAM gets their own profile.
async function findPersonProfile(hamUid) {
  return find([{ source_prefix: 'scw.person_profile.' + hamUid, ham_uid: hamUid, limit: 1 }]);
}

// ⬡B:core.find:WIRE:findPreferences_20260711⬡
// The person's own tastes/favorites (favorite team, food, etc). Real live bug:
// 'who is my favorite team' intermittently returned no-info even though the
// PREFERENCE bead exists -- the model sometimes called find_in_brain without the
// PREFERENCE filter (tool-argument variance). Cold fix: FCW pre-loads these into
// the wall so the answer is already in context and the model never has to guess a
// filter. UNIVERSALITY: keyed by ham_uid, any HAM gets their own preferences.
async function findPreferences(hamUid, limit) {
  return find([{ stamp_type: 'PREFERENCE', ham_uid: hamUid, limit: limit || 5 }]);
}

// ⬡B:core.find:WIRE:findWonderGames_20260714⬡
// The same class of bug as findPreferences, caught by the founder live: 'what is
// Wonder Games / the coding cook-off' returned no-info even though 11+ real
// WONDER_GAMES/DOCTRINE/DIRECTIVE beads exist, because the model doesn't reliably
// call find_in_brain with the right stamp_type for a feature-explanation question.
// Cold fix, same pattern as preferences: FCW pre-loads these into the wall so the
// answer is already present and the model never has to guess a filter.
// UNIVERSALITY: keyed by ham_uid, works for any HAM, no hardcoded content.
async function findWonderGames(hamUid, limit) {
  return find([
    { stamp_type: 'WONDER_GAMES', ham_uid: hamUid, limit: limit || 3 },
    { source_prefix: 'wonder_games.', ham_uid: hamUid, limit: limit || 3 },
    { stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: 8, limit: limit || 3 }
  ]);
}

module.exports = { find, findIdentity, findAgentJDs, findContext, findBySource, findRecentResults, findDoctrine, findPersonProfile, findPreferences, findWonderGames };
