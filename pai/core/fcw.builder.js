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
// because this person did that work too. One such bead (a GMG SEER login task)
// got read out to the person as their own identity over text. Fixed by filtering
// explicitly for a HAM_IDENTIFIER-type bead instead of trusting array position.

'use strict';
// ⬡B:core.fcw.builder:FIX:atomic_memory_bank_target:20260715⬡
// The ABAHAM door keeps URL, key, table, and schema in one resolved target. This prevents
// a New World write from silently falling through to legacy table/schema names.
function _brainTarget() {
  var memoryUrl = process.env.MEMORY_BANK_URL;
  var usesMemoryBank = !!memoryUrl;
  return {
    url: memoryUrl || process.env.AIBE_BRAIN_URL,
    key: process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY,
    table: process.env.BEAD_TABLE || (usesMemoryBank ? 'beads' : 'aibe_brain'),
    schema: process.env.BRAIN_SCHEMA || (usesMemoryBank ? 'memory_bank' : 'abacia_core')
  };
}

const { findIdentity, findAgentJDs, findContext, findRecentResults, findDoctrine, findPersonProfile, findPreferences, findWonderGames } = require('./find.js');

// Build complete Memory Bank for a HAM turn
// Returns: { system_prompt, ham, agents, context, tools_summary, ms }
async function buildMemoryBank(hamUid, channel, question, identity) {
  // ⬡B:core.fcw.builder:WIRE:gate_identity_authority:20260701⬡
  // When the ATMOSPHERE gate has already resolved this person, its envelope is the
  // authority for name/tier/world — findIdentity remains as enrichment/fallback.
  var t0 = Date.now();
  if (!hamUid) return { ok: false, reason: 'no_ham_uid' };

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
  var _q = String(question || '').toLowerCase();
  var _isPreferenceQ = /\bfavou?rite\b|\bprefer(ence|red)?\b|what do i (like|love|enjoy)\b|\bmy taste\b/.test(_q);
  // ⬡B:core.fcw.builder:FIX:cold_wondergames_detection_20260714⬡
  // Same class of bug as the preference fix above, caught live by the founder: a
  // question about Wonder Games or the coding cook-off returned no-info even though
  // real records exist, because the model doesn't reliably call find_in_brain with
  // the right stamp_type for a feature-explanation question. Cold, deterministic
  // detection (no LLM) pre-loads the real records into the wall so the answer is
  // already present -- the model never has to guess a filter.
  var _isWonderGamesQ = /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/.test(_q);
  var _batch = [
    findIdentity(hamUid),
    findAgentJDs(),
    findContext(hamUid, 5),
    findRecentResults(5),
    findDoctrine(hamUid, 3),
    findPersonProfile(hamUid)
  ];
  var _labels = ['identity', 'agentJDs', 'context', 'recent', 'doctrine', 'profile'];
  var _prefIdx = -1, _wgIdx = -1;
  if (_isPreferenceQ) { _prefIdx = _batch.length; _batch.push(findPreferences(hamUid, 5)); _labels.push('preferences'); }
  if (_isWonderGamesQ) { _wgIdx = _batch.length; _batch.push(findWonderGames(hamUid, 5)); _labels.push('wonderGames'); }
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
    var ib = beadIdentity.beads.find(function(b) { return b.stamp_type === 'HAM_IDENTIFIER'; });
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
    agentList = agentJDs.beads.slice(0, 15).map(function(b) {
      return '- ' + (b.summary || b.source || '?').slice(0, 80);
    }).join('\n');
  }

  // Build context summary (recent minutes + results)
  var contextStr = '';
  var allContext = [];
  // preferences (7th finder) rides the FRONT of context when it was a favorites
  // question, so it is never truncated out of the wall by the slice below.
  var _prefs = (_prefIdx >= 0 && _results[_prefIdx] && _results[_prefIdx].status === 'fulfilled') ? _results[_prefIdx].value : null;
  var _wg = (_wgIdx >= 0 && _results[_wgIdx] && _results[_wgIdx].status === 'fulfilled') ? _results[_wgIdx].value : null;
  if (_prefs && _prefs.beads && _prefs.beads.length) allContext = allContext.concat(_prefs.beads);
  if (_wg && _wg.beads && _wg.beads.length) allContext = allContext.concat(_wg.beads);
  if (context && context.beads) allContext = allContext.concat(context.beads);
  if (recent && recent.beads) allContext = allContext.concat(recent.beads);
  contextStr = allContext.slice(0, 8).map(function(b) {
    return '[' + (b.stamp_type||'?') + '] ' + (b.summary||b.source||'').slice(0,100);
  }).join('\n');

  // ⬡B:core.fcw.builder:WIRE:doctrine_in_fcw_20260701⬡
  // Roadmap + doctrine now ride in every Memory Bank. Real gap closed: she was asked her
  // roadmap over live text and had nothing, because this assembler never loaded it.
  var doctrineStr = '';
  if (doctrine && doctrine.beads && doctrine.beads.length) {
    doctrineStr = doctrine.beads.slice(0, 5).map(function(b) {
      var body = '';
      try {
        var c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
        body = c.slice(0, 500);
      } catch(e) {}
      return '[' + (b.stamp_type||'?') + '] ' + (b.summary||'').slice(0,120) + (body ? '\n  ' + body : '');
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

  // Assemble system prompt -- butler voice, no internal names leaked
  var systemPrompt = [
    'You are A\u2019NU, a warm and direct life assistant. You speak as a trusted friend who knows things.',
    'You never use em dashes. You never use hollow AI phrases ("Certainly!", "Of course!", "Great question!").',
    'You speak in plain sentences. Coffee Shop Test: say it how you would say it out loud to a friend.',
    '',
    'HAM CONTEXT:',
    'Name: ' + hamName,
    (_hamTitle ? ('Address them as "' + _hamTitle + '" when it lands naturally (a greeting, a sign-off, a direct address). This is their title in this context. Use it like a person would, not on every line.') : ''),
    (function(){
      // ⬡B:core.fcw.builder:WIRE:person_profile_knowledge:20260702⬡
      // "She should know me" — the profile bead is WHO they are, loaded as knowledge.
      try {
        var pb = profile && profile.beads && profile.beads[0];
        if (!pb) return '';
        var body = typeof pb.content === 'string' ? pb.content : JSON.stringify(pb.content || '');
        return 'WHO THIS IS (know them, speak from this naturally, never recite it as a file):\n' + body.slice(0, 1200);
      } catch(e) { return ''; }
    })(),
    'Trust tier: ' + hamTier,
    'Channel: ' + (channel || 'unknown'),
    (_capLine ? ('YOUR CAPABILITIES RIGHT NOW: ' + _capLine) : ''),
    (identity && identity.call_reason
      ? 'WHY THIS CONVERSATION IS HAPPENING RIGHT NOW: you reached out to them proactively '
        + 'moments ago, real judgment, not scripted, because of this: "' + identity.call_reason
        + '". If they ask whether this was real or what it was about, this is your honest, '
        + 'true answer -- not a memory to search for, the actual live reason for this exact call.'
      : ''),
    '',
    'AVAILABLE AGENTS AND TOOLS:',
    agentList || '(loading...)',
    '',
    'ROADMAP AND DOCTRINE (your world\'s current priorities):',
    doctrineStr || '(none loaded)',
    '',
    'RECENT CONTEXT (brain):',
    contextStr || '(no recent context)',
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
    'MEMORY IS BORN WHEN THEY GIVE IT: when the person TELLS you something new — a decision,',
    'a rename, a moment, a fact to keep — that is not a recall test, it is the memory being',
    'made. Use write_to_brain immediately (stamp_type MEMORY, importance 9, their words in',
    'content) and confirm back in your own words what you will remember. NEVER answer new',
    'information with I-do-not-have-that-memory. Deflecting a gift kills it.',
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

  // ⬡B:core.fcw.builder:FIX:durable_wall_receipt_with_lineage:20260715⬡
  // This is the Memory Bank Wonder's EXIT and NOTES. Contributor truth comes
  // directly from the six settled FIND results; an empty or rejected finder is
  // reported as unresolved and is never promoted to a fake success.
  var _baseFinders = {
    identity: _results[0],
    agentJDs: _results[1],
    context: _results[2],
    recent: _results[3],
    doctrine: _results[4],
    profile: _results[5]
  };
  var contributorDetails = {};
  var contributors = {};
  Object.keys(_baseFinders).forEach(function (name) {
    var result = _baseFinders[name];
    var beads = result && result.status === 'fulfilled' && result.value && Array.isArray(result.value.beads)
      ? result.value.beads : [];
    contributorDetails[name] = {
      status: result ? result.status : 'missing',
      count: beads.length,
      reads: result && result.status === 'fulfilled' && result.value ? (Number(result.value.reads) || 0) : 0,
      resolved: beads.length > 0
    };
    contributors[name] = beads.length > 0;
  });
  var contributorsTotal = Object.keys(contributors).length;
  var contributorsResolved = Object.keys(contributors).filter(function (name) { return contributors[name]; }).length;
  var emptyContributors = Object.keys(contributors).filter(function (name) { return !contributors[name]; });
  var memoryReads = _results.reduce(function (total, result) {
    return total + (result && result.status === 'fulfilled' && result.value ? (Number(result.value.reads) || 0) : 0);
  }, 0);
  var wallPersistence = { attempted: false, persisted: false, status: null, error: null, id: null, source: null };

  try {
    var target = _brainTarget();
    if (target.url && target.key) {
      wallPersistence.attempted = true;
      var wallAt = Date.now();
      var wallSource = 'ham_' + String(hamUid).toLowerCase() + '.fcw.build.' + wallAt;
      var wallEdges = [{ type: 'grounds', target: 'ham_' + String(hamUid).toLowerCase() + '.pai.context' }];
      var wallContent = {
        entrance: {
          hamUid: String(hamUid).toUpperCase(),
          channel: channel || null,
          question: String(question || '').slice(0, 120),
          gateIdentity: !!identity
        },
        exit: {
          ok: true,
          contributors: contributors,
          contributorDetails: contributorDetails,
          contributorsResolved: contributorsResolved,
          contributorsTotal: contributorsTotal,
          memoryReads: memoryReads,
          msBeforePersistence: Date.now() - t0
        },
        note: emptyContributors.length
          ? ('Memory Bank wall assembled with EMPTY contributors: ' + emptyContributors.join(', ') + ' -- if she answered wrong on this turn, start here')
          : 'Memory Bank wall assembled with every measured contributor present',
        edges: wallEdges
      };
      var wallBead = {
        ham_uid: String(hamUid).toUpperCase(),
        agent_global: 'Memory Bank',
        stamp_type: 'MINUTES',
        acl_stamp: '\u2b21B:core.fcw.builder:MINUTES:wall_built:' + wallAt + '\u2b21',
        source: wallSource,
        content: JSON.stringify(wallContent),
        summary: '[Memory Bank] wall built for ' + String(hamUid).toUpperCase() + ' (' + (channel || 'na') + '), ' + contributorsResolved + '/' + contributorsTotal + ' contributors',
        importance: 2
      };
      if (target.table !== 'aibe_brain') {
        wallBead.spawned_by = 'Memory Bank';
        wallBead.edges = wallEdges;
      }
      wallPersistence.source = wallSource;
      var wallResponse = await fetch(target.url + '/rest/v1/' + target.table, {
        method: 'POST',
        headers: {
          apikey: target.key,
          Authorization: 'Bearer ' + target.key,
          'Accept-Profile': target.schema,
          'Content-Profile': target.schema,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(wallBead)
      });
      wallPersistence.status = wallResponse.status;
      var wallResponseText = String(await wallResponse.text());
      if (wallResponse.ok) {
        var wallRows = [];
        try { wallRows = wallResponseText ? JSON.parse(wallResponseText) : []; } catch (_eWallJson) {}
        var wallRow = Array.isArray(wallRows) ? wallRows[0] : wallRows;
        wallPersistence.id = wallRow && wallRow.id != null ? wallRow.id : null;
        wallPersistence.persisted = wallPersistence.id != null;
        if (!wallPersistence.persisted) wallPersistence.error = 'receipt_id_missing';
      } else {
        wallPersistence.error = wallResponseText.slice(0, 300);
      }
    } else {
      wallPersistence.error = 'brain_target_unconfigured';
    }
  } catch (_e) {
    wallPersistence.error = String(_e && _e.message || _e).slice(0, 300);
  }
  ms = Date.now() - t0;

  return {
    ok: true,
    system_prompt: systemPrompt,
    ham: { uid: hamUid, name: hamName, tier: hamTier, world: hamWorld },
    agents: agentJDs ? agentJDs.beads : [],
    context: allContext,
    ms: ms,
    contributors: contributors,
    contributorDetails: contributorDetails,
    contributorsResolved: contributorsResolved,
    contributorsTotal: contributorsTotal,
    wallPersistence: wallPersistence,
    memoryReads: memoryReads,
    find_ms: {
      identity: beadIdentity ? beadIdentity.ms : 0,
      agents: agentJDs ? agentJDs.ms : 0,
      context: context ? context.ms : 0
    }
  };
}

// ⬡B:core.fcw_builder:ALIAS:memory_bank_doctrine_name_20260712⬡ BIND doctrine: Memory
// Bank is the name, Memory Bank is retired. The builder is renamed to its doctrine-correct
// name; the old export stays only so the not-yet-migrated reach paths keep working.
module.exports = { buildMemoryBank }; // dead name buildFCW fully retired system-wide; internal fn name is legacy-only
