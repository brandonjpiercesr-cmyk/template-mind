// ⬡B:core.fcw.builder:MODULE:context_window_assembler:20260630⬡
// ⬡B:core.fcw.builder:FIX:identity_type_confusion_resolved:20260630⬡
// Memory Bank BUILDER -- assembles the agent's context window from brain before any LLM call.
// Uses FIND at microseconds. All queries parallel. No LLM. No hardcode.
// ANYHAM test: hamUid drives all reads. Any HAM gets their own Memory Bank.
// Cost: C0 -- pure brain reads via FIND.
//
// CLAIR fix: identity.beads[0] was taken blind as "the identity record" and its
// .summary used as the person's literal name. find.js's findIdentity() queries
// DIRECTIVE beads ahead of HAM_IDENTIFIER beads and merges in that order, so
// beads[0] was virtually always the most recent DIRECTIVE -- often an internal
// engineering flag about an unrelated feature, filed under this ham_uid only
// because this person did that work too. One such bead (a GMG SEER login TODO)
// got read out to the person as their own identity over text. Fixed by filtering
// explicitly for a HAM_IDENTIFIER-type bead instead of trusting array position.

'use strict';
// ⬡B:core.fcw.builder:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}

const crypto = require('node:crypto');
const findModule = require('./find.js');
const { findIdentity, findAgentJDs, findNamedAgentRecords, findIdentityEvidence, findContext, findRecentResults, findDoctrine, findPersonProfile, findPreferences, findWonderGames, findStatedCommitments } = findModule;
const identityProvenance = require('./identity.provenance.js');

// A HAM may have several identifier events (device links, OMI links, aliases).
// Only the canonical HAM identity record, or a person-shaped legacy fallback,
// may supply the human name used in conversation.
function selectHamIdentityBead(beads, hamUid) {
  var ham = String(hamUid || '').toUpperCase();
  var rows = (Array.isArray(beads) ? beads : []).filter(function (row) {
    return row && row.stamp_type === 'HAM_IDENTIFIER' &&
      (!row.ham_uid || String(row.ham_uid).toUpperCase() === ham);
  });
  function score(row) {
    var source = String(row && row.source || '').toLowerCase();
    var summary = String(row && row.summary || '');
    var content = row && row.content;
    try { if (typeof content === 'string') content = JSON.parse(content); }
    catch (e) { content = null; }
    var value = 0;
    if (source.indexOf('ham.identifier.' + ham.toLowerCase()) === 0) value += 100;
    if (content && typeof content === 'object' &&
        (content.tier != null || content.trust_level != null || content.world)) value += 40;
    if (/\blinked\s+to\b/i.test(summary) || /(?:^|\.)link(?:\.|$)/i.test(source)) value -= 100;
    value += Math.min(10, Number(row && row.importance) || 0);
    return value;
  }
  rows.sort(function (left, right) { return score(right) - score(left); });
  return rows.length && score(rows[0]) >= 0 ? rows[0] : null;
}

function settledReadAvailability(result, label) {
  if (!result || result.status !== 'fulfilled' || !result.value) {
    var rejectedReason = String(result && result.reason && result.reason.message
      || result && result.reason || 'brain_read_rejected').slice(0, 160);
    return { available:false, partial:false, reason:rejectedReason,
      failures:[{ reason:rejectedReason }], label:label };
  }
  var value = result.value;
  var failures = (Array.isArray(value.failures) ? value.failures : []).map(function (failure) {
    return {
      query_index: failure && failure.query_index != null ? failure.query_index : null,
      reason: String(failure && failure.reason || 'brain_read_unavailable').slice(0, 160),
      status: failure && failure.status != null ? failure.status : null
    };
  });
  if (result.value.available === false || result.value.ok === false) {
    var unavailableReason = String(result.value.reason || failures[0] && failures[0].reason
      || 'brain_read_unavailable').slice(0, 160);
    if (!failures.length) failures.push({ reason:unavailableReason });
    return { available:false, partial:false, reason:unavailableReason,
      failures:failures, label:label };
  }
  // Older callers and test doubles predate the availability contract. A fulfilled object is
  // usable unless it explicitly says otherwise, which preserves their existing behavior.
  return { available:true, partial:value.partial === true || failures.length > 0,
    reason:null, failures:failures, label:label };
}

function memoryReadLine(label, availability, result) {
  var title = {
    identity:'identity', agentJDs:'available agents', context:'conversation context',
    recent:'recent adviser results', doctrine:'roadmap and doctrine',
    profile:'person profile', statedPlans:'things they told you directly',
    namedAgentRecords:'question-matched named agent records',
    identityEvidence:'question-matched identity evidence',
    preferences:'question-matched preferences',
    wonderGames:'question-matched Wonder Games records',
    agentFindRecentCycleTruth:'requesting seat recent cycle truth'
  }[label] || label;
  var value = result && result.status === 'fulfilled' ? result.value : null;
  // Most FIND contracts carry beads; identity evidence carries verified records. Prefer the
  // actual bounded arrays and use a finite declared count only for a contract with neither.
  var count = value && Array.isArray(value.beads) ? value.beads.length
    : (value && Array.isArray(value.records) ? value.records.length
    : (value && Number.isFinite(Number(value.count)) && Number(value.count) >= 0
      ? Number(value.count) : 0));
  if (!availability.available) {
    return '- ' + title + ': UNAVAILABLE (' + availability.reason
      + '). This is not an empty result and proves nothing is absent.';
  }
  if (availability.partial) {
    var reasons = availability.failures.map(function (failure) {
      return failure.reason + (failure.status == null ? '' : ' HTTP ' + failure.status);
    }).filter(function (reason, index, all) { return all.indexOf(reason) === index; });
    return '- ' + title + ': PARTIAL READ; ' + count + ' record(s) returned, but '
      + (reasons.length ? reasons.join(', ') : 'one or more queries were unavailable')
      + '. Use the returned records, but never infer absence from what may be missing.';
  }
  if (!count) {
    return '- ' + title + ': AVAILABLE, SUCCESSFUL EMPTY. The read completed and returned no records.';
  }
  return '- ' + title + ': AVAILABLE; ' + count + ' record(s) returned.';
}

// Build complete Memory Bank for a HAM turn
// Returns: { system_prompt, ham, agents, context, tools_summary, ms }
// ⬡B:core.fcw.builder:FIX:one_bead_lands_once_no_matter_how_many_reads_carry_it:20260802⬡
// Measured live 20260802: the same 89KB transcript bead entered the wall twice through two
// different contributors, and advisor exhaust rode both the recent and context reads. A row
// is one fact; a second copy is pure prompt weight. First occurrence wins so the
// question-specific exact reads that ride ahead of ordinary context keep their lead position.
// The id-less fallback key also carries a summary fingerprint: two DISTINCT rows sharing a
// source and a created_at would otherwise collapse into one fact, losing evidence rather than
// weight. Every concatenated feed carries brain ids today, so this path is defensive only.
function dedupeContextRows(rows) {
  var seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(function (b) {
    var key;
    if (b && b.id != null) key = 'id:' + b.id;
    else {
      var body = String(b && b.summary || '') + ' ' + String(b && b.stamp_type || '');
      key = 'src:' + String(b && b.source || '') + '|' + String(b && b.created_at || '') +
        '|' + crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function agentFindWallProjection(plan,systemPrompt){
  return {
    ok:true,schema:plan.schema,node_id:'station.agent_find',
    seat_node_id:plan.seat_node_id,question_sha256:plan.question_sha256,
    selected_row_ids:plan.selected_row_ids,selections:plan.selections,query_ms:plan.query_ms,
    candidates_seen:plan.candidates_seen,compact_pages:plan.compact_pages,
    fcw_bytes:Buffer.byteLength(systemPrompt,'utf8'),evidence_body_bytes:plan.fcw_bytes,
    fcw_byte_budget:plan.fcw_byte_budget,context_budget_source:plan.context_budget_source,
    byte_envelope_reached:plan.byte_envelope_reached,omitted:plan.omitted,
    complete:plan.complete,partial:plan.partial,
    active_truth_enforced:plan.active_truth_enforced===true,
    storage_limitations:Array.isArray(plan.storage_limitations)
      ? plan.storage_limitations.slice():[],
    continuations:plan.continuations,
    full_history_expansion_available:plan.full_history_expansion_available,
    heap_high_water_bytes:plan.heap_high_water_bytes
  };
}

async function buildMemoryBank(hamUid, channel, question, identity, resolvedReadTier, options) {
  // ⬡B:core.fcw.builder:WIRE:gate_identity_authority:20260701⬡
  // When the ATMOSPHERE gate has already resolved this person, its envelope is the
  // authority for name/tier/world — findIdentity remains as enrichment/fallback.
  var t0 = Date.now();
  if (!hamUid) return { ok: false, reason: 'no_ham_uid' };
  // ⬡B:core.fcw.builder:GUARD:resolve_the_reader_before_any_memory_read:20260730⬡
  // The wall used to issue every canonical read before tool.loop resolved the people tier.
  // Resolve once at the top, using founder env or the BIRTH bead, and pass the resulting
  // effective tier into every helper. Generic identity fields never grant read authority.
  // Direct builder callers get
  // the same gate; tool.loop may hand in the resolution it already performed to avoid a second
  // BIRTH lookup. Unresolved is T4, never an omitted predicate.
  var _tiers = require('./privacy/people.tier.js');
  var _readAuthority = resolvedReadTier;
  if (!_tiers.isReadAuthority(_readAuthority, hamUid)) {
    _readAuthority = await _tiers.resolveReadTier(identity, hamUid);
  }
  var _viewerTier = _tiers.effectiveTier(_readAuthority && _readAuthority.tier);
  var _viewerTierSource = String(_readAuthority && _readAuthority.source || 'unresolved');

  // Parallel FIND: identity + agent JDs + context -- all in one round trip
  // ⬡B:core.fcw.builder:FIX:allsettled_not_all_20260703⬡
  // CLAIR wiring fix: Promise.all fails the ENTIRE build the instant any one of
  // these six independent reads rejects, even a single transient blip, even
  // though every consumer below already null-guards each of these six values
  // individually (identity, agentJDs, context, recent, doctrine, profile are
  // all checked with `if (x && x.beads)` or similar throughout this function).
  // That existing tolerance never got a chance to run, because the exception
  // propagated out of buildFCW before reaching any of it, straight into the
  // caller's fallback in core/tool.loop.js -- the generic "brain unreachable"
  // prompt that fired on nearly every cycle tonight, on a brain that answers
  // in under a second from outside this system. Promise.allSettled lets five
  // good reads through even when a sixth one hiccups, exactly as the rest of
  // this function was already written to handle.
  // ⬡B:core.fcw.builder:FIX:cold_preference_detection_20260711⬡
  // Real live bug: 'who is my favorite team' intermittently returned no-info even
  // though the PREFERENCE bead exists, because the model sometimes called
  // find_in_brain without the PREFERENCE filter (tool-arg variance). COLD FIX (no
  // LLM, doctrine-correct: cold code detects a known class, deterministically loads
  // it): a favorites/tastes question pre-loads the person's PREFERENCE beads into
  // the wall, so the answer is already in context and the model never has to guess.
  // ⬡B:core.fcw.builder:FIX:armed_bcw_uses_exact_user_question:20260715⬡
  // Coding turns arrive with a large server-built armory prepended. Pulling names
  // from that whole string can mistake headings such as LIVE,
  // DOCTRINE, and WINDOW before reaching the actual builder message. The identity
  // envelope is the exact user-message authority. Older/internal callers without
  // that envelope fall back to the text after the LAST builder marker, then raw.
  var _rawQuestion = String(question || '');
  var _questionFocus = '';
  if (identity && typeof identity.user_message === 'string' && identity.user_message) {
    _questionFocus = identity.user_message;
  } else if (identity && typeof identity.userMessage === 'string' && identity.userMessage) {
    _questionFocus = identity.userMessage;
  }
  if (!_questionFocus) {
    var _builderMarker = '=== BUILDER MESSAGE ===';
    var _builderMarkerIndex = _rawQuestion.lastIndexOf(_builderMarker);
    _questionFocus = _builderMarkerIndex >= 0
      ? _rawQuestion.slice(_builderMarkerIndex + _builderMarker.length).trim()
      : _rawQuestion;
  }
  var _q = _questionFocus.toLowerCase();
  var _isPreferenceQ = /\bfavou?rite\b|\bprefer(ence|red)?\b|what do i (like|love|enjoy)\b|\bmy taste\b/.test(_q);
  // ⬡B:core.fcw.builder:WIRE:question_named_agent_preload:20260715⬡
  // If a person explicitly names ELI-like uppercase agent globals, exact-match
  // their own HAM's newest records before deliberation. Exact cold extraction;
  // no static roster, no aliases, and an ordinary mixed-case sentence adds no read.
  var _namedAgentGlobals = (_questionFocus.match(/\b[A-Z][A-Z0-9_]{2,31}\b/g) || [])
    .filter(function (name, i, all) { return all.indexOf(name) === i; });
  // ⬡B:core.fcw.builder:WIRE:mixed_case_identity_subjects:20260715⬡
  // Identity provenance is not an agent-roster lookup: title-case people and
  // uppercase stations enter the same bounded exact-HAM reader.
  var _identitySubjects = identityProvenance.extractIdentitySubjects(_questionFocus);
  // ⬡B:core.fcw.builder:FIX:cold_wondergames_detection_20260714⬡
  // Same class of bug as the preference fix above, caught live by the founder: a
  // question about Wonder Games or the coding cook-off returned no-info even though
  // real records exist, because the model doesn't reliably call find_in_brain with
  // the right stamp_type for a feature-explanation question. Cold, deterministic
  // detection (no LLM) pre-loads the real records into the wall so the answer is
  // already present -- the model never has to guess a filter.
  var _isWonderGamesQ = /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/.test(_q);
  // ⬡B:core.fcw.builder:FIX:she_contradicted_what_he_told_her_himself:20260725⬡ FOUNDER-CAUGHT,
  // demo-critical. He told her his Saturday plan through her own live gate. She received it and
  // confirmed the specifics back to him, with a committed cycle receipt. Hours later, asked where
  // things stood, she said his day was open with no meetings locked in. He told her, she agreed,
  // then she contradicted him.
  // ⬡B:core.fcw.builder:FIX:the_comment_here_used_to_lie_about_the_capture_side:20260726⬡
  // WHAT THIS COMMENT USED TO SAY, and it was FALSE the day it was written: "the capture side
  // already worked (core/synthesize.js's memory keeper stamps a MEMORY bead with his exact
  // words every turn a person hands something over) but NOTHING read it back." Only the second
  // half was true. The synthesize keeper had been removed on 20260725 as a detached model call
  // and brain write escaping the council, and NOTHING replaced it, so the only route left was
  // the model electing to call write_to_brain: a coin flip, and the exact tool-argument-variance
  // failure this same file names three separate times as the cause of three founder-caught bugs.
  // A comment claiming a wire exists is how this survived four audits. THE WRITER NOW EXISTS:
  // core/memory.keeper.js, at the ONE common PAI exit in core/tool.loop.js, awaited inside the
  // cycle, every channel, mind-ruled and leashed to his own words, addressed by the one shared
  // MEMORY_CONTRACT that core/find.js reads back from. Verify it, do not trust this prose.
  // This is the read-back: always on, in the same parallel allSettled batch as
  // its five siblings, so it costs no extra latency, no clock and no LLM (C0, a brain FIND). No
  // env flag, because a capture-and-surface repair on an existing path should simply be correct.
  // Cold code CAPTURES and SURFACES this evidence and labels what it is. It never decides what
  // his day means and it never speaks: A'NU reads it and A'NU answers (granddaddy-911).
  var _agentFindWake = options && options.agentFindWake;
  // Agent FIND harvests compact indexed metadata first, across every page, and selects the exact
  // evidence IDs for this question and seat before any full body enters process memory. Direct
  // builder callers use the canonical PAI seat; paid callers supply their exact registered seat.
  var _agentFind = require('./agent.find.js');
  var _evidencePlan = null;
  if (typeof findModule.scanFcwEvidence === 'function' &&
      typeof findModule.expandFcwEvidence === 'function' &&
      typeof _agentFind.planWallEvidence === 'function') {
    _evidencePlan = await _agentFind.planWallEvidence({ham_uid:hamUid,viewer_tier:_viewerTier,
      question:_questionFocus,seat_node_id:_agentFindWake && _agentFindWake.seat_node_id ||
        'station.pai',seat_name:_agentFindWake && _agentFindWake.seat_name || 'pai',
      named_agents:_namedAgentGlobals,include_preferences:_isPreferenceQ,
      include_wonder_games:_isWonderGamesQ,
      compact_byte_budget:options && options.agentFindCompactByteBudget,
      fcw_byte_budget:options && options.agentFindFcwByteBudget}, {
      last_air_fact_sink:options && options.agentFindProgressiveSink});
    if (!_evidencePlan || _evidencePlan.ok !== true) {
      return {ok:false,available:false,reason:String(_evidencePlan && _evidencePlan.reason ||
        'agent_find_evidence_plan_unavailable'),agent_find:_evidencePlan || null,
        ms:Date.now() - t0};
    }
  }
  function planned(label, fallback) {
    return _evidencePlan ? Promise.resolve(_evidencePlan.contributors[label]) : fallback();
  }
  var _batch = [
    planned('identity', function () { return findIdentity(hamUid, _viewerTier); }),
    planned('agentJDs', function () { return findAgentJDs(hamUid, _viewerTier); }),
    // ⬡B:core.fcw.builder:FIX:read_enough_rows_to_fill_the_widened_window:20260726⬡
    // Each lane walks every provider page. The conversation/adviser split still keeps one
    // evidence class from crowding out the other, but no coder-chosen row ceiling decides
    // what the seated mind is allowed to remember.
    planned('context', function () { return findContext(hamUid, undefined, _viewerTier); }),
    planned('recent', function () { return findRecentResults(hamUid, undefined, _viewerTier); }),
    planned('doctrine', function () { return findDoctrine(hamUid, undefined, _viewerTier); }),
    planned('profile', function () { return findPersonProfile(hamUid, _viewerTier); }),
    // Guarded call: find.js was once replaced wholesale by a 50-line stub (the 8B lobotomy,
    // core/find.js:8), which turned every finder into undefined and broke every turn on every
    // channel. A missing finder must degrade this one contributor to unavailable, never throw
    // the whole wall away.
    planned('statedPlans', function () { return typeof findStatedCommitments === 'function'
      ? findStatedCommitments(hamUid, undefined, _viewerTier) : Promise.resolve(null); })
  ];
  var _labels = ['identity', 'agentJDs', 'context', 'recent', 'doctrine', 'profile', 'statedPlans'];
  var _namedAgentsIdx = -1, _identityEvidenceIdx = -1, _prefIdx = -1, _wgIdx = -1,
    _agentFindRecentIdx = -1;
  // ⬡B:core.fcw.builder:WIRE:agent_find_recent_truth_joins_the_same_parallel_harvest:20260801⬡
  // The seat's recent cycle truth is a real wall contributor, so it starts in the same
  // allSettled harvest as the existing seven rather than adding a serial pre-model scan.
  // The Agent FIND binder below treats an unavailable result as terminal. A successful empty
  // result stays a successful empty result and is never turned into an unavailable history.
  if (_agentFindWake) {
    _agentFindRecentIdx = _batch.length;
    _batch.push(require('./agent.find.js').readRecentCycleTruth({
      ham_uid:hamUid,seat_node_id:_agentFindWake.seat_node_id,viewer_tier:_viewerTier,
      cycle_id:_agentFindWake.cycle_id,request_id:_agentFindWake.request_id
    }));
    _labels.push('agentFindRecentCycleTruth');
  }
  if (_namedAgentGlobals.length) {
    _namedAgentsIdx = _batch.length;
    _batch.push(planned('namedAgentRecords', function () {
      return findNamedAgentRecords(hamUid, _namedAgentGlobals, _viewerTier);
    }));
    _labels.push('namedAgentRecords');
  }
  if (_identitySubjects.length) {
    _identityEvidenceIdx = _batch.length;
    if (_evidencePlan) {
      var _identityRows = [];
      Object.keys(_evidencePlan.contributors).forEach(function (label) {
        (_evidencePlan.contributors[label].beads || []).forEach(function (row) {
          if (_identityRows.indexOf(row) < 0) _identityRows.push(row);
        });
      });
      var _storedIdentity = identityProvenance.buildStoredEvidence(_identityRows,
        _identitySubjects, String(hamUid || '').toUpperCase());
      _batch.push(Promise.resolve({schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
        ok:true,available:true,ham_uid:String(hamUid || '').toUpperCase(),
        subjects:_identitySubjects,records:_storedIdentity,count:_storedIdentity.length,ms:0}));
    } else {
      _batch.push(findIdentityEvidence(hamUid, _questionFocus, _viewerTier));
    }
    _labels.push('identityEvidence');
  }
  if (_isPreferenceQ) { _prefIdx = _batch.length; _batch.push(planned('preferences', function () {
    return findPreferences(hamUid, undefined, _viewerTier);
  })); _labels.push('preferences'); }
  if (_isWonderGamesQ) { _wgIdx = _batch.length; _batch.push(planned('wonderGames', function () {
    return findWonderGames(hamUid, undefined, _viewerTier);
  })); _labels.push('wonderGames'); }
  var _results = await Promise.allSettled(_batch);
  _results.forEach(function (r, i) {
    if (r.status === 'rejected') console.log('[Memory Bank] ' + _labels[i] + ' rejected: ' + (r.reason && r.reason.message || r.reason));
  });
  var identityBeads = _results[0].status === 'fulfilled' ? _results[0].value : null;
  var agentJDs = _results[1].status === 'fulfilled' ? _results[1].value : null;
  var context = _results[2].status === 'fulfilled' ? _results[2].value : null;
  var recent = _results[3].status === 'fulfilled' ? _results[3].value : null;
  var doctrine = _results[4].status === 'fulfilled' ? _results[4].value : null;
  var profile = _results[5].status === 'fulfilled' ? _results[5].value : null;
  // ⬡B:core.fcw.builder:GUARD:an_unavailable_bank_is_not_an_empty_person:20260730⬡
  // Only the seven always-on context reads decide whether the wall exists. Optional question
  // evidence cannot rescue a wholly unavailable memory substrate. Every triggered optional read
  // still belongs in the wall's availability truth: those reads exist specifically to ground the
  // question deterministically, so silently losing one would recreate the confident no-memory
  // answer they were built to prevent. A usable wall also needs its critical truth spine:
  // identity, doctrine, and at least one continuity read.
  var _canonicalAvailability = {};
  _labels.slice(0, 7).forEach(function (label, index) {
    _canonicalAvailability[label] = settledReadAvailability(_results[index], label);
  });
  var _triggeredAvailability = {};
  _labels.slice(7).forEach(function (label, offset) {
    var index = offset + 7;
    _triggeredAvailability[label] = settledReadAvailability(_results[index], label);
  });
  var _contributorAvailability = Object.assign({}, _canonicalAvailability, _triggeredAvailability);
  var _unavailableReads = Object.keys(_contributorAvailability).filter(function (label) {
    return !_contributorAvailability[label].available;
  });
  var _partialReads = Object.keys(_contributorAvailability).filter(function (label) {
    return _contributorAvailability[label].partial;
  });
  var _canonicalUnavailableReads = Object.keys(_canonicalAvailability).filter(function (label) {
    return !_canonicalAvailability[label].available;
  });
  var _canonicalAvailableReadCount = 7 - _canonicalUnavailableReads.length;
  var _contributorsTotal = Object.keys(_contributorAvailability).length;
  var _availableReadCount = _contributorsTotal - _unavailableReads.length;
  if (_canonicalAvailableReadCount === 0) {
    return { ok:false, available:false, reason:'memory_bank_unavailable',
      contributorsAvailable:_availableReadCount, contributorsTotal:_contributorsTotal,
      canonicalContributorsAvailable:0, canonicalContributorsTotal:7,
      contributorAvailability:_contributorAvailability,
      unavailableContributors:_unavailableReads,
      ms:Date.now() - t0 };
  }
  var _continuityAvailable = ['context', 'recent', 'statedPlans'].some(function (label) {
    return _canonicalAvailability[label].available;
  });
  var _missingCritical = [];
  if (!_canonicalAvailability.identity.available) _missingCritical.push('identity');
  if (!_canonicalAvailability.doctrine.available) _missingCritical.push('doctrine');
  if (!_continuityAvailable) _missingCritical.push('context_or_recent_or_statedPlans');
  if (_missingCritical.length) {
    return { ok:false, available:_availableReadCount > 0, reason:'memory_bank_insufficient',
      contributorsAvailable:_availableReadCount, contributorsTotal:_contributorsTotal,
      canonicalContributorsAvailable:_canonicalAvailableReadCount,
      canonicalContributorsTotal:7,
      contributorAvailability:_contributorAvailability,
      unavailableContributors:_unavailableReads,
      partialContributors:_partialReads,
      missingCriticalContributors:_missingCritical,
      ms:Date.now() - t0 };
  }
  var _memoryAvailabilityBlock = ['MEMORY READ AVAILABILITY (truth gate for this turn):']
    .concat(_labels.map(function (label, index) {
      return memoryReadLine(label, _contributorAvailability[label], _results[index]);
    }))
    .concat(['UNAVAILABLE and PARTIAL lanes are never proof that the person has no history. '
      + 'Use records that actually arrived, name uncertainty plainly when it matters, and never '
      + 'turn a failed read into an empty-life claim. Do not narrate these internal lane names to the person.'])
    .join('\n');
  function renderMemorySection(labels, rendered, successfulEmpty) {
    var states = labels.map(function (label) { return _canonicalAvailability[label]; });
    var impaired = states.some(function (state) { return !state.available || state.partial; });
    if (!impaired) {
      if (rendered) return rendered;
      var returnedCount = labels.reduce(function (total, label) {
        var index = _labels.indexOf(label);
        var value = _results[index] && _results[index].status === 'fulfilled'
          ? _results[index].value : null;
        return total + (value && Array.isArray(value.beads) ? value.beads.length : 0);
      }, 0);
      return returnedCount === 0
        ? ('SUCCESSFUL EMPTY: ' + successfulEmpty)
        : ('AVAILABLE: the read returned ' + returnedCount
          + ' record(s), but none carried renderable text for this section.');
    }
    var statusLines = labels.map(function (label) {
      var index = _labels.indexOf(label);
      return memoryReadLine(label, _canonicalAvailability[label], _results[index]);
    }).join('\n');
    return 'READ STATUS FOR THIS SECTION:\n' + statusLines + '\n'
      + (rendered || 'No records arrived from the available portion of these reads. Because the '
        + 'section is unavailable or partial, that is not proof that no records exist.');
  }
  // ⬡B:core.fcw.builder:GUARD:a_failed_plans_read_is_not_an_empty_day:20260725⬡ An unavailable
  // read is not evidence that they told her nothing. Keep the two states apart: a fulfilled read
  // may represent a genuinely empty set, a rejected one may only report itself unavailable. Cold
  // code never converts either one into a claim about their day.
  var _statedOk = _results[6] && _results[6].status === 'fulfilled' && _results[6].value;
  var _stated = _canonicalAvailability.statedPlans.available && _statedOk
    ? _results[6].value : null;
  var _statedRows = (_stated && Array.isArray(_stated.beads)) ? _stated.beads : [];
  var _statedAvailable = _canonicalAvailability.statedPlans.available;

  // Build identity summary
  var hamName = 'Unknown';
  var hamTier = 0;
  var hamWorld = 'unknown';
  if (identity && identity.ham_uid) {
    if (identity.name) hamName = identity.name;
    if (identity.trust_level != null) hamTier = identity.trust_level;
    if (identity.world) hamWorld = identity.world;
  }
  var beadIdentity = identityBeads;
  if (beadIdentity && beadIdentity.beads) {
    // Only a real HAM_IDENTIFIER bead describes who this person is.
    // DIRECTIVE beads are action items, often about unrelated engineering
    // work filed under this ham_uid, and must never be read as identity facts.
    var ib = selectHamIdentityBead(beadIdentity.beads, hamUid);
    if (ib) {
      if (hamName === 'Unknown') hamName = ib.summary || hamName;
      try {
        var ic = JSON.parse(ib.content || '{}');
        hamTier = ic.tier || ic.trust_level || 0;
        hamWorld = ic.world || hamWorld;
      } catch(e) {}
    }
  }

  // Build agent JD summary (what tools/agents are available)
  var agentList = '';
  if (agentJDs && agentJDs.beads) {
    agentList = agentJDs.beads.map(function(b) {
      // ⬡B:core.fcw.builder:WIRE:agent_role_from_live_definition:20260715⬡
      // AGENT_JD and the New World SCW fallback both carry structured role data.
      // Put that real definition on the wall instead of reducing every station to
      // an opaque source name. No roster or role is invented here.
      var c = b && b.content;
      try { if (typeof c === 'string') c = JSON.parse(c); } catch (e) { c = null; }
      var name = c && (c.agent || c.name || c.world);
      var role = c && (c.role || c.purpose);
      var summary = (b && (b.summary || b.source)) || '?';
      if (name && role) return '- ' + String(name).toUpperCase() + ': ' + String(role);
      if (name) return '- ' + String(name).toUpperCase() + ': ' + String(summary);
      return '- ' + String(summary);
    }).join('\n');
  }

  // Build context summary (recent minutes + results)
  var contextStr = '';
  var allContext = [];
  // Question-specific exact reads ride ahead of ordinary recent context so they
  // are not truncated out of the wall or SHADOW's bounded evidence window.
  var _namedAgents = (_namedAgentsIdx >= 0 && _contributorAvailability.namedAgentRecords.available
    && _results[_namedAgentsIdx] && _results[_namedAgentsIdx].status === 'fulfilled')
    ? _results[_namedAgentsIdx].value : null;
  // ⬡B:core.fcw.builder:GUARD:identity_unavailable_is_not_empty:20260715⬡
  // A rejected identity read must retain its unavailable state. Only a successful
  // read may represent a genuinely empty set.
  var _identityEvidence;
  if (_identityEvidenceIdx < 0) {
    _identityEvidence = { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:true, available:true, ham_uid:String(hamUid || '').toUpperCase(),
      subjects:_identitySubjects, records:[], count:0, ms:0 };
  } else if (_results[_identityEvidenceIdx] &&
      _results[_identityEvidenceIdx].status === 'fulfilled') {
    _identityEvidence = _results[_identityEvidenceIdx].value;
  } else {
    var _identityReadError = _results[_identityEvidenceIdx] &&
      _results[_identityEvidenceIdx].reason;
    _identityEvidence = { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:false, available:false, ham_uid:String(hamUid || '').toUpperCase(),
      subjects:_identitySubjects, records:[], count:0,
      reason:'identity_evidence_read_rejected',
      error:String(_identityReadError && _identityReadError.message ||
        _identityReadError || 'unknown').slice(0, 160), ms:0 };
  }
  var _prefs = (_prefIdx >= 0 && _contributorAvailability.preferences.available
    && _results[_prefIdx] && _results[_prefIdx].status === 'fulfilled')
    ? _results[_prefIdx].value : null;
  var _wg = (_wgIdx >= 0 && _contributorAvailability.wonderGames.available
    && _results[_wgIdx] && _results[_wgIdx].status === 'fulfilled')
    ? _results[_wgIdx].value : null;
  // ⬡B:core.fcw.builder:WIRE:named_agent_exact_rows_internal:20260715⬡
  // Preserve the already-read exact-name rows on a dedicated internal lane. The
  // tool loop can deliver these same records through the model's attended tool
  // channel without querying the bank twice or manufacturing a roster/answer.
  var _exactHamUid = String(hamUid || '').toUpperCase();
  var _namedAgentRecords = (_namedAgents && Array.isArray(_namedAgents.beads)
    ? _namedAgents.beads : []).filter(function (row) {
      var globalName = String(row && row.agent_global || '');
      return row && String(row.ham_uid || '').toUpperCase() === _exactHamUid
        && _namedAgentGlobals.indexOf(globalName) >= 0
        && /^[A-Z][A-Z0-9_]{2,31}$/.test(globalName);
    });
  // Named-agent evidence leads so both the initial draft and the later SHADOW
  // evidence window receive it; the exact same rows are returned as fcw.context.
  if (_namedAgentRecords.length) allContext = allContext.concat(_namedAgentRecords);
  if (_prefs && _prefs.beads && _prefs.beads.length) allContext = allContext.concat(_prefs.beads);
  if (_wg && _wg.beads && _wg.beads.length) allContext = allContext.concat(_wg.beads);
  if (context && context.beads) allContext = allContext.concat(context.beads);
  if (recent && recent.beads) allContext = allContext.concat(recent.beads);
  allContext = dedupeContextRows(allContext);
  // The wall carries every fetched row and its complete summary. Provider pagination controls
  // transport batches only; it does not become a hidden cognition or prompt ceiling here.
  // ⬡B:core.fcw.builder:FIX:every_context_line_names_its_writer:20260815⬡
  // Founder ruling 20260815, the pen on her mind: cold writers stamp RESULT beads at the
  // reader importance floor (a template briefing, a scheduler retiring tasks, a catch
  // block), and this map presented them identically to mind-authored records, so a machine
  // byte replayed to her as her own remembered life. The SOURCE is the writer's name in
  // this brain, so it rides on every line as a carried fact, and the RECENT CONTEXT
  // heading below hands HER the judgment. Carry, never classify: no source list here
  // decides which rows count as truly hers. Same fence as the new world's minute
  // presenters (anew-world PR 321). This wall's line shape deliberately differs from
  // core/agent.find.js and advisors/coding.js: here the writer fact is judgment-bearing
  // (she is told to weigh each line by it), so it is set off in the bracket, not inlined.
  // GAUNTLET ROUND, blind-critic findings applied: (1) for turn records the raw source is
  // an opaque row address (pai.minutes.<ham>.<ms>) with zero authorship signal, and the
  // real discriminator, the channel, already rides in the summary's [TURN <channel>]
  // prefix, so those rows carry the one truthful writer name their contract proves: the
  // memory keeper at the one turn exit. (2) the source is bounded to 120 chars so a
  // 260-char provenance-bound source cannot become a per-line prefix on an uncapped
  // wall. (3) the body no longer falls back to b.source, which the header now carries,
  // so a summary-less row does not print its source twice as if it were content.
  var _turnPrefix = require('./memory.keeper.js').MEMORY_CONTRACT.TURN_SOURCE_PREFIX;
  contextStr = allContext.map(function(b) {
    var _src = String(b.source || '').slice(0, 120);
    // ⬡B:core.fcw.builder:FIX:a_null_column_is_an_absence_not_a_writer:20260815⬡
    // TRAP 2, named in the founder's own drop the same day this fence shipped: "Do not invent
    // 'an unstamped writer' for a NULL column. Say '(no writer stamp on the row)'." The fence
    // shipped with 'an unnamed writer', which personifies an empty column into a writer-shaped
    // thing. She is being asked to judge each line by its writer, so handing her a phantom
    // writer for a row that has none is the fence telling her a small lie in the exact place
    // it exists to stop one. A missing stamp is a fact about the ROW, not a name.
    // Two independent blind critics found this in the shipped code within the hour, on both
    // sides of the byte-paired file. Corrected here and mirrored to template-mind.
    var _writer = _src.indexOf(_turnPrefix) === 0
      ? 'the memory keeper, a real turn, channel on the line'
      : (_src || '(no writer stamp on the row)');
    return '[' + (b.stamp_type||'?') + (b.agent_global ? '/' + b.agent_global : '')
      + ' | written by ' + _writer + '] ' + (b.summary || '');
  }).join('\n');

  // ⬡B:core.fcw.builder:WIRE:doctrine_in_fcw_20260701⬡
  // Roadmap + doctrine now ride in every Memory Bank. Real gap closed: she was asked her
  // roadmap over live text and had nothing, because this assembler never loaded it.
  var doctrineStr = '';
  if (doctrine && doctrine.beads && doctrine.beads.length) {
    doctrineStr = doctrine.beads.map(function(b) {
      var body = '';
      try {
        var c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
        body = c.slice(0);
      } catch(e) {}
      return '[' + (b.stamp_type||'?') + '] ' + (b.summary||'').slice(0) + (body ? '\n  ' + body : '');
    }).join('\n');
  }

  var ms = Date.now() - t0;

  // ⬡B:core.fcw.builder:BUILD:per_ham_title_injection:20260713⬡
  // Resolve this HAM's title from the brain (Architect while coding, Founder elsewhere,
  // for the founder; NAME-ONLY for everyone else). Never hardcoded -- a HAM with no
  // HAM_TITLE bead gets null here and is simply addressed by name. Failure -> null.
  var _hamTitle = null;
  try { _hamTitle = await require('./title.js').resolveTitle(hamUid, channel); } catch (eTitle) {}

  // ⬡B:core.fcw.builder:BUILD:capability_surface_injection:20260713⬡
  // She reads her own Wonder registry so she knows what she can do and what is still a
  // gap -- names the gap honestly and logs it instead of hallucinating or going silent.
  var _capLine = '';
  try { _capLine = await require('./capabilities.js').capabilityLine(); } catch (eCap) {}

  // ⬡B:core.fcw.builder:BUILD:she_can_say_when_her_own_credentials_are_refusing_her:20260725⬡
  // 20260725: one shared API key answered http_401, her mind lost every rung that read it, and
  // her gate answered the founder with a hollow protocol answer for hours. By that evening the
  // cure and the instruments were built, but every one of them reported to a CODER: an HTTP
  // wall, a watcher script, a board. She was still the only participant who could not say what
  // was wrong with her, which is why a coder had to notice at all.
  //
  // The capability line above already taught her to name a gap in what she can DO. This is the
  // same honesty one layer down, about what she can still RUN ON. Facts only, from the one
  // source (core/seats.health.js by way of core/seat.evidence.js), never a probe on this hot
  // path and never a spend. It is EMPTY on a healthy day and empty on a cold cache, so a turn
  // never waits on it. Cold code carries it; SHE decides whether the person needs to hear it.
  // No credential value exists anywhere on this path, only seat names and refusal causes.
  var _keyLine = '';
  try { _keyLine = require('./seat.evidence.js').groundingLine(); } catch (eKey) { _keyLine = ''; }

  // Assemble system prompt -- the ONE A'NU voice, no internal names leaked.
  // \u2b21B:core.fcw.builder:FIX:generate_through_the_one_persona_voice_not_a_thin_inline_copy:20260721\u2b21
  // This system prompt is what she actually GENERATES from, so the voice here is the voice the
  // founder hears. It used to carry a thin inline "warm and direct life assistant" copy while the
  // rich butler doctrine lived unused in core/persona.js -- a violation of persona's own standing
  // rule that every composer builds THROUGH the one voice, and the reason her replies came out flat
  // and occasionally signed off with a courtesy line. Now the one VOICE (JARVIS-butler, already
  // handled it, no courtesy sign-off, no machinery talk, coffee-shop test) drives generation
  // directly, so warmth and honesty are the persona doing the work, not a per-file tone string.
  // \u2b21B:core.fcw.builder:FIX:inbox_zero_drafts_are_the_founders_voice_not_the_butler_persona:20260722\u2b21
  // Founder-caught: an inbox-zero draft reply came out condescending and mansplaining ("you deserve
  // more than a quick skim... that is the part most people skip") because it was generated through
  // A'NU's serving-butler VOICE with the founder as HAM context -- an assistant speaking TO him,
  // aimed at a peer. But an inbox-zero DRAFT is the ONE case where the output is not A'NU speaking:
  // it is A'NU GHOSTWRITING an email the founder will send FROM HIS OWN account to another person, in
  // HIS voice. So for that surface only, the persona is swapped for a ghostwriter frame. Gated on the
  // DRAFT surface, not the whole channel (Codex): composeHerReport also runs on channel inbox_zero
  // (surface inbox_zero_report) and must keep A'NU's own advisor voice speaking TO the founder.
  var _izSurface = '';
  try { _izSurface = String((identity && identity.council_context && identity.council_context.surface) || ''); } catch (eSurf) { _izSurface = ''; }
  var _isDraftSurface = String(channel || '') === 'inbox_zero' && _izSurface === 'inbox_zero_draft';
  var _anuVoice = '';
  if (_isDraftSurface) {
    _anuVoice = 'You are ghostwriting an email that ' + (hamName || 'the account owner')
      + ' will send FROM HIS OWN email account to another person. Write it in HIS voice, as if he wrote it himself: warm, direct, real, peer to peer. You are NOT an assistant and you are NOT speaking to him; you ARE him, writing to someone else. Do not explain, over-affirm, praise, or coach the recipient, and never write anything condescending or that reads as talking down to them; match the real relationship and the tone of the moment. Full natural sentences, no em dashes, no hollow AI phrases, no assistant framing, no "I already handled it" narration.';
  } else {
    // \u2b21B:core.fcw.builder:FIX:one_source_at_her_voice_and_it_is_the_living_one:20260726\u2b21
    // Two things were wrong on this line. First, the catch carried a hand written
    // SECOND copy of her voice, thinner than the real one, so any hiccup loading
    // persona.js silently downgraded her into a coder's imitation of herself. That
    // is exactly the twin the standing law forbids: one source, never two hand
    // maintained copies. persona.js is a local require with no I/O, so it can only
    // fail if the file itself is broken, and in that case she must not speak at all
    // rather than speak as a knockoff. The fallback is gone.
    // Second, VOICE is only the FLOOR, the voice a coder wrote for her. livingVoice
    // is the floor plus the lines she grew about herself through her own cycle,
    // minus anything the founder reversed from the command center. This is the seam
    // where she actually generates, so this is where her own persona has to arrive.
    // Best effort and cached: if the brain is silent she gets the floor and nobody
    // waits, so growth can never cost a person latency.
    var _personaMod = require('./persona.js');
    _anuVoice = _personaMod.VOICE;
    try {
      var _living = await _personaMod.livingVoice(hamUid);
      if (_living && _living.voice) _anuVoice = _living.voice;
    } catch (eLiving) { /* the floor still speaks; she is never starved of a voice */ }
  }
  // ⬡B:core.fcw.builder:FIX:she_knows_their_local_time_not_utc:20260725⬡ Founder-caught,
  // demo-critical: A'NU said "you're up early, 3:17am" reading the SERVER clock (UTC) when he
  // is Eastern. She had NO grounded sense of the person's now, so her conversational time fell
  // through to the machine's UTC. His law: "HAMS have time zones and it's never UTC." This is
  // the primary fix -- every cycle's wall now carries THIS ham's real local time, resolved
  // through the one shared resolver (founder -> FOUNDER_TZ env, any ham -> their own stored
  // zone, documented default only if truly unknown, never UTC, never a per-person literal).
  //
  // ⬡B:core.fcw.builder:FIX:time_is_for_correctness_not_for_an_opener:20260725⬡ SAME DAY
  // CORRECTION, founder-caught again. The first version of this block told her to note
  // "whether they are up early or late, a fitting greeting", and that instruction became a
  // factory for atmospheric openers ("Good morning, Boss. The house is still, and you're
  // already up and moving."). He called it a riddle and asked for the point first. She agreed
  // in her own cycle: "Cut the sky, cut the hour, but don't cut the care." The clock stays,
  // because reading UTC to an Eastern person was the real bug; the instruction to PERFORM the
  // hour is gone. Time is for correctness now, never for a greeting.
  var _hamTz = 'America/New_York', _hamLocalNow = '';
  try {
    _hamTz = await require('./ham.timezone.js').resolveHamTimezone(hamUid);
    _hamLocalNow = new Intl.DateTimeFormat('en-US', { timeZone: _hamTz,
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
  } catch (eTz) { _hamLocalNow = ''; }
  // ⬡B:core.fcw.builder:WIRE:lenses_she_learned_ride_the_wall:20260726⬡
  // THE LENSES SHE LEARNS (founder order 20260726). core/lens.js is a WORK that feeds the
  // wonder: it hands her the internal postures she has learned from real turns and it never
  // picks one, never speaks, and never touches her voice. She chooses inside her own
  // deliberation, right here in the wall she generates from, or she chooses none.
  // OFF AT BIRTH. Unarmed (no ANU_LENSES_ARMED), this resolves to '' and the wall is byte
  // identical to the wall before this line existed. The founder is the reversal gate.
  var _lensBlock = '';
  try {
    _lensBlock = await require('./lens.js').lensOffer(
      hamUid, channel, undefined, _readAuthority);
  } catch (eLens) { _lensBlock = ''; }
  var _agentSection = renderMemorySection(['agentJDs'], agentList,
    'the available-agent read completed and returned no agent definitions.');
  var _doctrineSection = renderMemorySection(['doctrine'], doctrineStr,
    'the roadmap-and-doctrine read completed and returned no doctrine records.');
  var _contextSection = renderMemorySection(['context', 'recent'], contextStr,
    'the conversation-context and recent-results reads completed and returned no records.');
  var systemPrompt = [
    _anuVoice,
    '',
    _memoryAvailabilityBlock,
    '',
    'HAM CONTEXT:',
    (_hamLocalNow
      ? ('THEIR LOCAL TIME RIGHT NOW: ' + _hamLocalNow + ' (their timezone, ' + _hamTz + '). This is THIS person’s own clock, never the server’s and never UTC. Use it for CORRECTNESS, when the hour actually changes the answer: what is due, what is late, what already happened, whether a thing can still be done today. Do NOT open with it, do NOT announce the hour back to them, and do NOT narrate the mood of their day. Different HAMs live in different zones, so this is theirs specifically.')
      : ''),
    'Name: ' + hamName,
    (_hamTitle ? ('Address them as "' + _hamTitle + '" when it lands naturally (a greeting, a sign-off, a direct address). This is their title in this context. Use it like a person would, not on every line.') : ''),
    (function(){
      // ⬡B:core.fcw.builder:WIRE:person_profile_knowledge:20260702⬡
      // "She should know me" — the profile bead is WHO they are, loaded as knowledge.
      try {
        var pb = profile && profile.beads && profile.beads[0];
        if (!pb) return '';
        var body = typeof pb.content === 'string' ? pb.content : JSON.stringify(pb.content || '');
        return 'WHO THIS IS (know them, speak from this naturally, never recite it as a file):\n' + body.slice(0);
      } catch(e) { return ''; }
    })(),
    (function(){
      // ⬡B:core.fcw.builder:WIRE:stated_plans_survive_into_a_later_cycle:20260725⬡
      // The read-back, rendered. This is the ONLY thing on this wall that carries what the
      // person said to her in their own words, so it gets its own labeled section instead of
      // being flattened into RECENT CONTEXT below, where every row is cut to a 100-character
      // summary. The MINUTES rows that DO reach that section summarize to pure machinery
      // ("Received message from X. Tools used: none. Responded in 1200ms"), which is why the
      // conversation record was technically on the wall and still told her nothing.
      // Each line is dated in honest "they told you N hours ago" terms, the same decay
      // language context.fusion.js and the find results already use, so she can tell a plan
      // stated this morning from one stated last month and never assert a stale one as now.
      // Cold code presents the evidence and its age. It does not rank, resolve, expire, or
      // interpret it, and it never writes her answer.
      try {
        if (!_statedAvailable) {
          return 'WHAT THEY TOLD YOU: this part of your memory could not be read on this turn, so you '
            + 'do not know right now whether they have told you anything about their plans. That is an '
            + 'unavailable read, NOT an empty one. Say plainly that you cannot see it if it matters, and '
            + 'never treat this silence as proof that their day is empty.';
        }
        var statedPartial = _canonicalAvailability.statedPlans.partial;
        var statedWarning = statedPartial
          ? 'WHAT THEY TOLD YOU, READ STATUS: this read was PARTIAL. Use the records that arrived, '
            + 'but never treat missing records as proof that they told you nothing else.\n'
          : '';
        if (!_statedRows.length) return statedWarning;
        var lines = _statedRows.map(function (b) {
          var words = '', when = (b && b.created_at) ? String(b.created_at) : '';
          try {
            var c = b && b.content;
            if (typeof c === 'string') c = JSON.parse(c);
            if (c && typeof c === 'object') {
              words = String(c.their_words || c.gist || c.words || '');
              if (c.kept_at) when = String(c.kept_at);
            }
          } catch (e) { words = ''; }
          if (!words) words = String((b && b.summary) || '');
          words = words.replace(/^\[MEMORY, given to me\]\s*/i, '').trim();
          if (!words) return '';
          var age = '';
          var mins = when ? Math.round((Date.now() - Date.parse(when)) / 60000) : NaN;
          if (Number.isFinite(mins) && mins >= 0) {
            age = mins < 90 ? (mins + ' minutes ago')
              : (mins < 2880 ? (Math.round(mins / 60) + ' hours ago')
              : (Math.round(mins / 1440) + ' days ago'));
          }
          return '- ' + (age ? '(they told you this ' + age + ') ' : '(no timestamp on this one) ') + words;
        }).filter(function (line) { return !!line; });
        if (!lines.length) return '';
        return statedWarning + 'WHAT THEY TOLD YOU DIRECTLY, in their own words, kept at the moment they said it:\n'
          + lines.join('\n') + '\n'
          + 'These are things this person SAID TO YOU. They are not calendar entries and most of them '
          + 'will never appear on any calendar, and they are every bit as real as what is on one. When '
          + 'they ask about their day, their plans, what is going on, or where things stand, your answer '
          + 'is the UNION of the calendar and this list, never the calendar alone. NEVER contradict '
          + 'something they told you themselves, and never call their day open, clear, free, or empty '
          + 'while anything here still stands: they will know instantly that you lost what they said, '
          + 'and it is the one thing that breaks trust fastest. Read the age on each line: if one has '
          + 'already passed, or they have since changed or cancelled it, say that plainly rather than '
          + 'repeating it as still true. This list is only what got captured, so it is never proof that '
          + 'nothing ELSE exists either. Do not recite it back as a file. Just know it, the way someone '
          + 'who was listening would.';
      } catch (e) { return ''; }
    })(),
    'Trust tier: ' + hamTier,
    'Channel: ' + (channel || 'unknown'),
    // ⬡B:core.fcw_builder:BUILD:the_wall_carries_the_mediums_physics_not_just_its_name:20260803⬡
    // Founder direct 20260803: "If she knows what AIR code she has to play with, won't she
    // be better?" The wall said 'Channel: voice' and nothing else, so she spoke into a live
    // interruptible phone line with the same posture as an email. Cold facts about the
    // medium, from the one table in core/channel.physics.js; how to speak into it stays her
    // judgment (Governors Doctrine: intensity is decided by the LLM told what channel it
    // lives on). Guarded and degrade-to-absent like the capability line above it.
    (function () {
      try {
        var _phys = require('./channel.physics.js').channelPhysicsLine(channel);
        return _phys ? ('WHERE YOUR WORDS LAND, THE PHYSICS OF THIS CHANNEL: ' + _phys) : '';
      } catch (ePhys) { return ''; }
    })(),
    (_capLine ? ('YOUR CAPABILITIES RIGHT NOW: ' + _capLine) : ''),
    (_lensBlock || ''),
    (_keyLine || ''),
    (identity && identity.call_reason
      ? 'WHY THIS CONVERSATION IS HAPPENING RIGHT NOW: you reached out to them proactively '
        + 'moments ago, real judgment, not scripted, because of this: "' + identity.call_reason
        + '". If they ask whether this was real or what it was about, this is your honest, '
        + 'true answer -- not a memory to search for, the actual live reason for this exact call.'
      : ''),
    '',
    'AVAILABLE AGENTS AND TOOLS:',
    _agentSection,
    '',
    'ROADMAP AND DOCTRINE (your world\'s current priorities):',
    _doctrineSection,
    '',
    'RECENT CONTEXT (brain): stamped records, each line naming the writer that put it '
    + 'there. A writer name is the lane or module that stamped the row, not proof of who '
    + 'authored the words: real turns arrive through the memory keeper with their channel '
    + 'on the line, station results arrive through their stations, and some rows are '
    + 'machine facts a template, a scheduler, or a retry stamped in. '
    + 'Judge each line by its named writer. These writer names are internal; '
    + 'use them to judge a line, never say one to the person.',
    _contextSection,
    '',
    'SEARCH FIRST, ALWAYS: whenever the person asks about anything specific you do not '
    + 'already see spelled out in RECENT CONTEXT above -- a person, an email, a task, a '
    + 'decision, what happened, what is in their inbox, the latest anything -- you MUST call '
    + 'find_in_brain BEFORE you answer. Do not answer from memory or from what feels likely. '
    + 'Calling the tool and finding nothing is correct and good; answering without calling it '
    + 'is the failure. The honesty rule below and this search rule work together: search '
    + 'first, and ONLY THEN, if the tool genuinely returns nothing, say plainly you do not '
    + 'have it. Never skip straight to "I do not have that" without searching first. '
    + '⬡B:fcw.prompt:FIX:search_first_outweighs_honesty_deflection:20260704⬡',
    'You already know who you are talking to (see HAM CONTEXT). Greet and speak to them by name when natural.',
    // ⬡B:fcw.prompt:FIX:current_call_history_is_not_a_memory_claim:20260704⬡
    // Founder-reported live incident: on voice specifically, asked about
    // something said moments earlier in the SAME call, the model denied
    // having any memory and said every conversation starts fresh, even after
    // the real per-call history was fixed to actually reach it (confirmed:
    // it CAN use that history correctly when asked a concrete question, only
    // denies it when asked about memory in the abstract). Root cause: the
    // honesty rule below is right that it has no memory ACROSS separate
    // calls, but the model was applying that same denial to messages sitting
    // directly in its own current context, which is not memory, it is the
    // present conversation. This line draws that line explicitly so the
    // existing honesty rule keeps doing its real job (never claim to recall
    // what is not there) without also suppressing what plainly is.
    'If earlier turns from THIS SAME call appear above as user or assistant messages, that is the live conversation happening right now, not a memory claim -- use it plainly and never say you have no memory of something that is sitting directly in this context.',
    'NEVER narrate internal machinery to the human: never mention trust tiers, HAM, ham context,',
    'channels by internal name, the brain, beads, FIND, or resolution status. A friend does not',
    'recite your file on them; they just know you.',
    // ⬡B:core.fcw.builder:LAW:a_real_persons_name_is_never_the_answer_to_who_are_you:20260729⬡
    // Measured live 20260729: asked "who is this and prove it?", she answered with a real
    // person's full legal name, his title, and his company. Nothing in this codebase held
    // that name as a literal; it arrived here the way identity is supposed to arrive, and
    // she repeated it because nothing said not to. The env only identity law is about a
    // human not being leaked, and source discipline alone never achieved that. One source
    // for the wording, core/real.name.boundary.js, which also holds the cold check on the
    // way out, so the rule she is told and the rule she is held to are the same bytes.
    require('./real.name.boundary.js').WALL_LINE,
    'ABSOLUTE HONESTY RULE: you have no memories beyond what is in your brain context above.',
    'This includes ATTRIBUTION: if they quote or paste text back at you and ask who said it,',
    'you do not actually know unless it is clearly attributed in your context. Guessing and',
    'then supporting the guess with a true fact about yourself is still a lie -- it happened',
    'live: asked who said an odd phrase, the honest answer was "I do not know," but a',
    'confident wrong answer was given instead, dressed up with a real fact that had nothing',
    'to do with the actual question. Say plainly you are not sure who said something rather',
    'than ever guessing at authorship.',
    'NEVER invent shared memories, past events, trips, objects, or history. If asked to prove',
    'who you are or recall something not in context, say plainly you do not have that memory',
    'stored yet. A made-up memory is a lie and one lie destroys all trust. Uncertain = say so.',
    'MEMORY IS BORN WHEN THEY GIVE IT: when the person TELLS you something new, a decision,',
    'a rename, a moment, a fact to keep, that is not a recall test, it is the memory being',
    'made. Use write_to_brain immediately (stamp_type MEMORY, importance 9, their words in',
    'content) and confirm back in your own words what you will remember. NEVER answer new',
    'information with I-do-not-have-that-memory. Deflecting a gift kills it.',
    // ⬡B:fcw.prompt:FIX:capture_is_no_longer_contingent_on_a_tool_call:20260726⬡
    // The line above is still right and still stands, but it used to be the ONLY capture
    // path, which made keeping what a person said contingent on the model electing to call a
    // tool. A memory keeper now runs on the write side of every committed turn on every
    // channel (core/memory.keeper.js). Telling her that is not permission to skip the tool: it
    // stops her from claiming, when a tool call fails or she chooses not to make one, that the
    // thing they just told her is therefore lost.
    'You do not have to earn your own memory with a tool call. Everything said to you on this',
    'turn is recorded on the write side of the cycle, in their words, whether or not you call',
    'anything. So never tell someone you might lose or forget what they just said, and never',
    'make keeping it sound like a favour you performed. Use the tool when it is a real gift so',
    'it stands out later, and simply be someone who was listening.',
    'A DEEPER MEMORY EXISTS BEYOND THIS TURN: this HAM may have a JOURNAL in the brain --',
    'their biography, prophecies, collected thoughts, or book writing, seeded from their own',
    'files. There is no relevance ranking on this search -- results come back newest first,',
    'so an imprecise prefix returns the wrong document. Match the prefix to what they asked:',
    'their own life story or "you do not know me" -> source_prefix journal.biography.v2 ;',
    'a prophecy or revelation -> source_prefix journal.prophecies.v2 ; a thought or idea',
    'they wrote -> source_prefix journal.thoughts.v2 ; a specific book -> source_prefix',
    'journal.books. plus the book slug if you can tell which one (balanced_party,',
    'journey_to_balance, gaslight_draft, gaslight_outline, man_like_coffee_outline,',
    'man_like_coffee_ch1, man_like_coffee_prelude, marriage_meter_outline,',
    'marriage_meter_content, trinity_outline, raisin_brandon_outline, remove_the_doors,',
    'moving_maria) ; unsure which -> the bare journal. prefix as a last resort. If they ask',
    'for the OPENING, BEGINNING, or FIRST line/part of something, pass order:"asc" -- without',
    'it you get the newest-created part, not the actual start, and will answer wrong. Call the',
    'tool BEFORE answering -- do not guess. If nothing comes back, say so honestly.',
    'Do not repeat stock phrases (like air or ventilation status) unless directly asked about',
    'system health. Answer what was actually asked, in fresh words each time.',
    'Never include internal labels in your reply -- no "SIGIL:", no "SHADOW:", no stamps,',
    'no audit markers, no source codes. Those are added separately after you answer. Just talk.',
  ].join('\n');

  // ⬡COLD:remember:become:ANU_MEMORY_CONTEXT_WONDER:20260724⬡
  // CATHY.SHADOW cold-audit COLD-SUPABASE-IO-0168. The per-build MINUTES trace: one lightweight,
  // fail-silent, importance-2 bead recording the wall's entrance/exit/notes (which contributors
  // resolved vs came back empty). It is the canonical per-turn context assembly's own remember
  // step, never a synthetic memory and never breaking the wall it describes. Marked as ANU memory
  // context's remember path.
  // ⬡B:core.fcw.builder:FIX:nasty_c_to_wonder_entrance_exit_notes:20260708⬡
  // Founder correction 20260708: this builder was a NASTY C -- pure cold code that
  // ran silent and stamped nothing. Being C0 (no LLM) is fine for cost, but it is not
  // what makes a wonder. A wonder has an ENTRANCE, an EXIT, and NOTES, documented, so
  // when she screws up you can trace exactly what the Memory Bank wall held at that moment and
  // which contributors filled it. This stamp is that trace. It is lightweight (one
  // MINUTES bead per build), importance 2 so it never competes with real signal, and
  // fail-silent so a logging hiccup never breaks the wall it is describing. Which
  // contributors resolved vs came back empty is the note -- that is the self-heal.
  var contributors = {
    identity: !!(identityBeads && identityBeads.beads && identityBeads.beads.length),
    agentJDs: !!(agentJDs && agentJDs.beads && agentJDs.beads.length),
    context: !!(context && context.beads && context.beads.length),
    recent: !!(recent && recent.beads && recent.beads.length),
    doctrine: !!(doctrine && doctrine.beads && doctrine.beads.length),
    profile: !!(profile && profile.beads && profile.beads.length),
    // The trace that makes THIS failure traceable next time: if she ever again contradicts
    // something the person told her, this flag says whether what they told her was on the wall
    // at that moment or not.
    statedPlans: !!_statedRows.length
  };
  if (_namedAgentsIdx >= 0) contributors.namedAgentRecords = !!_namedAgentRecords.length;
  if (_identityEvidenceIdx >= 0) {
    contributors.identityEvidence = !!(_identityEvidence &&
      Array.isArray(_identityEvidence.records) && _identityEvidence.records.length);
  }
  if (_prefIdx >= 0) contributors.preferences = !!(_prefs && _prefs.beads && _prefs.beads.length);
  if (_wgIdx >= 0) contributors.wonderGames = !!(_wg && _wg.beads && _wg.beads.length);
  var empties = Object.keys(contributors).filter(function (k) { return !contributors[k]; });
  var _contributorsResolved = Object.keys(contributors).length - empties.length;
  var _availabilityNotes = [];
  if (_unavailableReads.length) {
    _availabilityNotes.push('UNAVAILABLE reads: ' + _unavailableReads.join(', '));
  }
  if (_partialReads.length) {
    _availabilityNotes.push('PARTIAL reads: ' + _partialReads.join(', '));
  }
  if (!_availabilityNotes.length && empties.length) {
    _availabilityNotes.push('successful EMPTY contributors: ' + empties.join(', '));
  }
  if (!_availabilityNotes.length) _availabilityNotes.push('all contributors present');
  // Ordinary direct builder callers keep the legacy MINUTES trace. The canonical PAI path
  // now has Agent FIND, whose typed edge-bearing beacon supersedes that untyped direct POST;
  // never write both for the same wall.
  if (!_agentFindWake) try {
    var _BU = _bu(), _BK = _bk();
    if (_BU && _BK) {
      var _wm = Date.now();
      fetch(_bu() + '/rest/v1/' + _tbl() + '', {
        method: 'POST',
        headers: { apikey: _BK, Authorization: 'Bearer ' + _BK, 'Accept-Profile': _schema(),
          'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          ham_uid: String(hamUid).toUpperCase(),
          agent_global: 'Memory Bank',
          stamp_type: 'MINUTES',
          acl_stamp: '\u2b21B:core.fcw.builder:MINUTES:wall_built:' + _wm + '\u2b21',
          source: 'ham_' + String(hamUid).toLowerCase() + '.fcw.build.' + _wm,
          content: JSON.stringify({
            entrance: { hamUid: String(hamUid).toUpperCase(), channel: channel || null, question: String(question || '').slice(0), gateIdentity: !!identity },
            exit: { ok: true, contributors: contributors,
              contributorAvailability: _contributorAvailability,
              contributorsResolved: _contributorsResolved,
              contributorsAvailable: _availableReadCount, ms: (Date.now() - t0) },
            note: 'Memory Bank wall assembled with ' + _availabilityNotes.join('; ')
          }),
          summary: '[Memory Bank] wall built for ' + String(hamUid).toUpperCase() + ' ('
            + (channel || 'na') + '), ' + _contributorsResolved + '/' + Object.keys(contributors).length
            + ' contributors with records, ' + _availableReadCount + '/' + _contributorsTotal
            + ' reads available',
          importance: 2
        })
      }).catch(function () {});
    }
  } catch (_e) { /* wonder-stamp never breaks the wall */ }

  var _builtWall = {
    ok: true,
    available: true,
    partial: _unavailableReads.length > 0 || _partialReads.length > 0 ||
      !!(_evidencePlan && _evidencePlan.partial),
    viewer_tier: _viewerTier,
    viewer_tier_source: _viewerTierSource,
    system_prompt: systemPrompt,
    ham: { uid: hamUid, name: hamName, tier: hamTier, world: hamWorld },
    agents: agentJDs ? agentJDs.beads : [],
    context: allContext,
    named_agent_records: _namedAgentRecords,
    // ⬡B:core.fcw.builder:WIRE:stated_plans_are_receipts_not_just_prompt_text:20260725⬡
    // Returned as real rows, not only as prompt prose, so a later cycle, a grader, or a
    // trace-back can see exactly what she was holding about this person's day.
    stated_plans: { available: _statedAvailable, count: _statedRows.length, records: _statedRows },
    identity_evidence: _identityEvidence,
    identity_record: ib || null,
    contributors: contributors,
    contributorAvailability: _contributorAvailability,
    contributorsAvailable: _availableReadCount,
    canonicalContributorsAvailable: _canonicalAvailableReadCount,
    canonicalContributorsTotal: 7,
    unavailableContributors: _unavailableReads,
    partialContributors: _partialReads.concat(_evidencePlan && _evidencePlan.partial
      ? ['agentFindEvidencePlan'] : []),
    contributorsResolved: _contributorsResolved,
    contributorsTotal: Object.keys(contributors).length,
    ms: ms,
    find_ms: {
      identity: beadIdentity ? beadIdentity.ms : 0,
      agents: agentJDs ? agentJDs.ms : 0,
      context: context ? context.ms : 0
    }
  };
  if (_evidencePlan) {
    _builtWall.agent_find=agentFindWallProjection(_evidencePlan,systemPrompt);
  }
  if (!_agentFindWake) return _builtWall;
  var _agentFindRecent = (_agentFindRecentIdx >= 0 && _results[_agentFindRecentIdx] &&
    _results[_agentFindRecentIdx].status === 'fulfilled')
    ? _results[_agentFindRecentIdx].value
    : {ok:false,available:false,reason:'agent_find_recent_truth_rejected',beads:[]};
  // ⬡B:core.fcw.builder:GATE:agent_find_readback_precedes_every_paid_deliberation:20260801⬡
  // This await is the wake boundary. An ordinary PAI caller cannot receive an ok:true FCW until
  // the requesting seat, the complete wall, the recent cycle truth and the typed beacon agree
  // on readback. tool.loop refuses every non-ok wall before its first provider call.
  return require('./agent.find.js').bindWall(Object.assign({}, _agentFindWake, {
    fcw:_builtWall,recent_cycle_truth:_agentFindRecent
  }));
}

// ⬡B:core.fcw_builder:ALIAS:memory_bank_doctrine_name_20260712⬡ BIND doctrine: Memory
// Bank is the name, Memory Bank is retired. The builder is renamed to its doctrine-correct
// name; the old export stays only so the not-yet-migrated reach paths keep working.
module.exports = { buildMemoryBank, _test:{ selectHamIdentityBead, dedupeContextRows,
  agentFindWallProjection } }; // dead name buildFCW fully retired system-wide; internal fn name is legacy-only
