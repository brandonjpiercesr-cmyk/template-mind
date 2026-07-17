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
var identityProvenance = require('./identity.provenance.js');


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

// ⬡B:core.find:GUARD:identity_read_availability_is_explicit:20260715⬡
// Generic FIND intentionally fails soft for ordinary context. Identity provenance
// cannot: an unavailable bank is not evidence of an empty bank. This strict lane
// reports configuration, timeout, HTTP, payload, and transport failures explicitly.
function identityBq(path, timeoutMs) {
  var b = bh();
  if (!b.url || !b.hdrs.apikey) return Promise.resolve({
    ok:false, available:false, reason:'identity_brain_unconfigured', rows:[]
  });
  var wait = Number(timeoutMs);
  if (!Number.isFinite(wait) || wait <= 0) wait = 2500;
  return new Promise(function(resolve) {
    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }
    var timer = setTimeout(function() {
      finish({ ok:false, available:false, reason:'identity_brain_timeout', rows:[] });
    }, wait);
    Promise.resolve().then(function() {
      return fetch(b.url + '/rest/v1/' + _tbl() + '?' + path, { headers:b.hdrs });
    }).then(function(response) {
      if (!response || response.ok !== true) {
        finish({ ok:false, available:false, reason:'identity_brain_http_error',
          status:response && response.status || null, rows:[] });
        return null;
      }
      return Promise.resolve(response.json()).then(function(rows) {
        if (!Array.isArray(rows)) {
          finish({ ok:false, available:false, reason:'identity_brain_payload_invalid', rows:[] });
          return;
        }
        finish({ ok:true, available:true, rows:rows });
      });
    }).catch(function(error) {
      finish({ ok:false, available:false, reason:'identity_brain_error',
        error:String(error && error.message || error || 'unknown').slice(0, 160), rows:[] });
    });
  });
}

function identityQueryPath(query) {
  var q = query || {};
  var parts = [];
  if (q.stamp_type) parts.push('stamp_type=eq.' + encodeURIComponent(q.stamp_type));
  if (q.source_prefix) parts.push('source=like.' + encodeURIComponent(q.source_prefix) + '*');
  if (q.ham_uid) parts.push('ham_uid=eq.' + encodeURIComponent(q.ham_uid));
  if (q.agent_global) parts.push('agent_global=eq.' + encodeURIComponent(q.agent_global));
  if (q.importance_gte != null) parts.push('importance=gte.' + q.importance_gte);
  parts.push('order=' + (q.order === 'asc' ? 'source.asc' : 'created_at.desc'));
  parts.push('limit=' + (q.limit || 10));
  return parts.join('&');
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

// Agent JDs: all agent definitions available to this HAM.
async function findAgentJDs(hamUid) {
  // ⬡B:core.find:FIX:new_world_agent_jds_from_ham_scw:20260715⬡
  // Live New World Bank proof: AGENT_JD and agent.jd are empty there, while the
  // same HAM's real adviser births live as SCW rows (scw.<world>.<hamUid>).
  // Keep the historical definitions when present, and read the already-wired,
  // per-HAM station records in the same parallel FIND. This is a schema bridge,
  // not a static roster: the HAM owns which worlds appear. Non-station SCWs such
  // as person profiles and feature inventories are excluded because they do not
  // declare content.world. Repeated snapshots of one world collapse to the newest.
  var queries = [
    { stamp_type: 'AGENT_JD', limit: 30 },
    { source_prefix: 'agent.jd', limit: 20 }
  ];
  if (hamUid) queries.push({ stamp_type: 'SCW', ham_uid: hamUid, limit: 100 });
  var result = await find(queries);
  var seenWorld = {};
  result.beads = (result.beads || []).filter(function (bead) {
    if (bead && (bead.stamp_type === 'AGENT_JD' || String(bead.source || '').indexOf('agent.jd') === 0)) return true;
    if (!bead || bead.stamp_type !== 'SCW' || String(bead.source || '').indexOf('scw.') !== 0) return false;
    var content = bead.content;
    try { if (typeof content === 'string') content = JSON.parse(content); } catch (e) { return false; }
    var world = content && String(content.world || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!world || seenWorld[world]) return false;
    seenWorld[world] = true;
    return true;
  });
  result.count = result.beads.length;
  return result;
}

// Exact records for bounded agent names explicitly present in the current ask.
async function findNamedAgentRecords(hamUid, agentGlobals) {
  // ⬡B:core.find:WIRE:question_named_agents_exact_ham_read:20260715⬡
  // The model cannot reliably invent the right tool arguments for a name it has
  // never seen. The builder supplies only literal uppercase tokens from this turn;
  // this finder keeps the read deterministic: exact agent_global, exact HAM, one
  // newest row per name, eight names maximum. No alias map or roster lives here.
  var seen = {};
  var names = (Array.isArray(agentGlobals) ? agentGlobals : []).map(function (name) {
    return String(name || '').trim();
  }).filter(function (name) {
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(name) || seen[name]) return false;
    seen[name] = true;
    return true;
  }).slice(0, 8);
  if (!hamUid || !names.length) return { beads: [], ms: 0, count: 0 };
  return find(names.map(function (name) {
    return { agent_global: name, ham_uid: hamUid, limit: 1 };
  }));
}

// ⬡B:core.find:WONDER:bounded_identity_provenance_read:20260715⬡
// A who-is turn needs more than the newest operational row for an uppercase
// agent. Read bounded exact-HAM definition classes plus recent role-bearing
// memory, then classify only exact question subjects. Mixed-case names travel
// through the same path. No roster, alias map, fuzzy scan, or answer lives here.
async function findIdentityEvidence(hamUid, question) {
  var started = Date.now();
  var exactHam = String(hamUid || '').toUpperCase();
  var subjects = identityProvenance.extractIdentitySubjects(question);
  if (!exactHam || !subjects.length) return {
    schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
    ok:true, available:true, ham_uid:exactHam || null, subjects:subjects, records:[],
    count:0, ms:Date.now() - started
  };
  var queries = subjects.filter(function (subject) {
    return /^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(subject);
  }).map(function (subject) {
    return { agent_global:subject.toUpperCase(), ham_uid:exactHam, limit:3 };
  });
  queries = queries.concat([
    { stamp_type:'HAM_IDENTIFIER', ham_uid:exactHam, limit:5 },
    { source_prefix:'scw.person_profile.' + exactHam, ham_uid:exactHam, limit:2 },
    { stamp_type:'AGENT_JD', ham_uid:exactHam, limit:24 },
    { stamp_type:'SCW', ham_uid:exactHam, limit:48 },
    { stamp_type:'DOCTRINE', ham_uid:exactHam, limit:48 },
    { stamp_type:'LOGFUL', ham_uid:exactHam, limit:48 }
  ]);
  try {
    var reads = await Promise.all(queries.map(function (query) {
      return identityBq(identityQueryPath(query));
    }));
    var unavailable = reads.find(function (read) { return !read || read.ok !== true; });
    if (unavailable) return {
      schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:false, available:false, ham_uid:exactHam, subjects:subjects, records:[],
      count:0, reason:String(unavailable.reason || 'identity_brain_error'),
      status:unavailable.status == null ? null : unavailable.status,
      error:unavailable.error || null, ms:Date.now() - started
    };
    var seen = Object.create(null);
    var rows = [];
    reads.forEach(function (read) {
      read.rows.forEach(function (row) {
        var key = String(row && row.id == null
          ? (row && row.source || '') + '|' + (row && row.stamp_type || '')
          : row.id);
        if (seen[key]) return;
        seen[key] = true;
        rows.push(row);
      });
    });
    var records = identityProvenance.buildStoredEvidence(rows, subjects, exactHam);
    return { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:true, available:true, ham_uid:exactHam, subjects:subjects,
      records:records, count:records.length, ms:Date.now() - started };
  } catch (error) {
    return { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:false, available:false, ham_uid:exactHam, subjects:subjects,
      records:[], count:0, reason:'identity_brain_error',
      error:String(error && error.message || error || 'unknown').slice(0, 160),
      ms:Date.now() - started };
  }
}

// Recent context: last N minutes + results for a HAM
async function findContext(hamUid, limit) {
  // ⬡B:core.find:FIX:conversation_context_not_machinery:20260702⬡
  // Was: all MINUTES for the ham — which is dominated by Overseer's every-3-minute
  // "air flowed through the ventilation system" machinery stamps. Her MEMORY_BANK context was
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
// PREFERENCE filter (tool-argument variance). Cold fix: MEMORY_BANK pre-loads these into
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
// Cold fix, same pattern as preferences: MEMORY_BANK pre-loads these into the wall so the
// answer is already present and the model never has to guess a filter.
// UNIVERSALITY: keyed by ham_uid, works for any HAM, no hardcoded content.
async function findWonderGames(hamUid, limit) {
  return find([
    { stamp_type: 'WONDER_GAMES', ham_uid: hamUid, limit: limit || 3 },
    { source_prefix: 'wonder_games.', ham_uid: hamUid, limit: limit || 3 },
    { stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: 8, limit: limit || 3 }
  ]);
}

module.exports = { find, findIdentity, findAgentJDs, findNamedAgentRecords, findIdentityEvidence, findContext, findBySource, findRecentResults, findDoctrine, findPersonProfile, findPreferences, findWonderGames,
  _test:{ identityBq:identityBq, identityQueryPath:identityQueryPath } };
