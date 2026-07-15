// ⬡B:core.find:MODULE:microsecond_brain_search:20260630⬡
// FIND — Mount Rushmore. Always on. Stamp-based precision queries.
// No ilike wildcards. No full-table scans. Filter by stamp_type, source prefix, ham_uid.
// Runs in parallel via Promise.all. Target: <100ms for any query set.
// ANYHAM test: ham_uid parameter drives all reads. No HAM hardcoded here.
// Cost: C0 — pure Supabase REST, zero LLM calls.

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
// ⬡B:core.find:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


function bh() {
  var BU = _bu();
  var BK = _bk();
  return {
    url: BU,
    hdrs: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }
  };
}

function bq(path) {
  var b = bh();
  if (!b.url || !b.hdrs.apikey) return Promise.resolve([]);
  // Hard timeout — a slow brain can never hang the Memory Bank build.
  // If the new brain is paused/slow, FIND returns [] fast instead of blocking the turn.
  return new Promise(function(resolve) {
    var settled = false;
    var timer = setTimeout(function() {
      if (!settled) { settled = true; resolve([]); }
    }, 2500);
    fetch(b.url + '/rest/v1/' + _tbl() + '?' + path, { headers: b.hdrs })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(rows) {
        if (!settled) { settled = true; clearTimeout(timer); resolve(rows || []); }
      })
      .catch(function() {
        if (!settled) { settled = true; clearTimeout(timer); resolve([]); }
      });
  });
}

// FIND entry point — run multiple queries in parallel, merge, dedupe by id
// queries: array of { stamp_type?, source_prefix?, ham_uid?, importance_gte?, limit? }
async function find(queries) {
  if (!Array.isArray(queries)) queries = [queries];
  var t0 = Date.now();

  var promises = queries.map(function(q) {
    var parts = [];
    if (q.stamp_type) parts.push('stamp_type=eq.' + encodeURIComponent(q.stamp_type));
    if (q.source_prefix) parts.push('source=like.' + encodeURIComponent(q.source_prefix) + '*');
    if (q.ham_uid) parts.push('ham_uid=eq.' + encodeURIComponent(q.ham_uid));
    // \u2b21B:core.find:FIX:agent_global_exact_match_topic_search:20260711\u2b21
    // FOUNDER, most important question of all time: 'whenever I talk to her I never
    // get the amazing results you seem to get -- why?' Traced it live: find_in_brain
    // has NO way to search by topic/org (mediators, bdif, gmg...), only six rigid
    // stamp_type buckets, none of which fit an ordinary 'how's X going' question.
    // Real content existed; the tool structurally could not find it. This is the
    // fix: agent_global is an EXACT known set of values (MEDIATORS_ADVISOR,
    // BDIF_ADVISOR, ELI...) -- an equality filter, same performance class as
    // stamp_type=eq., NOT an ilike scan. The no-wildcards law is honored.
    if (q.agent_global) parts.push('agent_global=eq.' + encodeURIComponent(q.agent_global));
    if (q.importance_gte != null) parts.push('importance=gte.' + q.importance_gte);
    // ⬡B:core.find:FIX:order_parameter:20260702⬡
    // Live incident: asked for the OPENING line of a multi-part journal document,
    // every retrieval returned a middle-or-later chunk because created_at.desc was
    // the only order this function could ever produce -- there was no way to ask
    // for the earliest match, so "the beginning of anything" was structurally
    // unreachable. Source names are lexicographically ordered within a document
    // (part01, part02...), so source.asc genuinely means "from the start."
    // Generic capability, not a one-off patch: any caller, any HAM, any document.
    parts.push('order=' + (q.order === 'asc' ? 'source.asc' : 'created_at.desc'));
    parts.push('limit=' + (q.limit || 10));
    return bq(parts.join('&'));
  });

  var results = await Promise.all(promises);

  // Merge + dedupe by id
  var seen = {};
  var merged = [];
  results.forEach(function(rows) {
    (rows || []).forEach(function(row) {
      if (!seen[row.id]) {
        seen[row.id] = true;
        merged.push(row);
      }
    });
  });

  return { beads: merged, ms: Date.now() - t0, count: merged.length };
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
async function findAgentJDs() {
  return find([
    { stamp_type: 'AGENT_JD', limit: 30 },
    { source_prefix: 'agent.jd', limit: 20 }
  ]);
}

// Recent context: last N minutes + results for a HAM
async function findContext(hamUid, limit) {
  // ⬡B:core.find:FIX:conversation_context_not_machinery:20260702⬡
  // Was: all MINUTES for the ham — which is dominated by Overseer's every-3-minute
  // "air flowed through the ventilation system" machinery stamps. Her FCW context was
  // wall-to-wall ventilation, so she parroted it in every reply (screenshot evidence:
  // same phrase repeated across texts and emails). Now: conversation minutes
  // (pai.minutes.*) and high-importance results — what was actually said and done.
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
async function findRecentResults(limit) {
  return find([{ stamp_type: 'RESULT', importance_gte: 7, limit: limit || 10 }]);
}

// ⬡B:core.find:WIRE:findDoctrine_20260701⬡
// ROADMAP + DOCTRINE beads for a HAM's world. Added after a real live gap: asked
// "what is the most important thing on our roadmap" over text, she answered
// "I don't have any information on our roadmap" — the Memory Bank loaded identity, agent
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
// someone. UNIVERSALITY: keyed by ham_uid — any HAM gets their own profile.
async function findPersonProfile(hamUid) {
  return find([{ source_prefix: 'scw.person_profile.' + hamUid, limit: 1 }]);
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
