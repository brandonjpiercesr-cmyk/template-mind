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

const { findIdentity, findAgentJDs, findNamedAgentRecords, findIdentityEvidence, findContext, findRecentResults, findDoctrine, findPersonProfile, findPreferences, findWonderGames } = require('./find.js');
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
  // ⬡B:core.fcw.builder:FIX:armed_bcw_uses_exact_user_question:20260715⬡
  // Coding turns arrive with a large server-built armory prepended. Pulling names
  // from that whole string spends the eight-name budget on headings such as LIVE,
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
  // their own HAM's newest records before deliberation. Bounded cold extraction;
  // no static roster, no aliases, and an ordinary mixed-case sentence adds no read.
  var _namedAgentGlobals = (_questionFocus.match(/\b[A-Z][A-Z0-9_]{2,31}\b/g) || [])
    .filter(function (name, i, all) { return all.indexOf(name) === i; }).slice(0, 8);
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
  var _batch = [
    findIdentity(hamUid),
    findAgentJDs(hamUid),
    findContext(hamUid, 5),
    findRecentResults(hamUid, 5),
    findDoctrine(hamUid, 3),
    findPersonProfile(hamUid)
  ];
  var _labels = ['identity', 'agentJDs', 'context', 'recent', 'doctrine', 'profile'];
  var _namedAgentsIdx = -1, _identityEvidenceIdx = -1, _prefIdx = -1, _wgIdx = -1;
  if (_namedAgentGlobals.length) {
    _namedAgentsIdx = _batch.length;
    _batch.push(findNamedAgentRecords(hamUid, _namedAgentGlobals));
    _labels.push('namedAgentRecords');
  }
  if (_identitySubjects.length) {
    _identityEvidenceIdx = _batch.length;
    _batch.push(findIdentityEvidence(hamUid, _questionFocus));
    _labels.push('identityEvidence');
  }
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
    agentList = agentJDs.beads.slice(0, 15).map(function(b) {
      // ⬡B:core.fcw.builder:WIRE:agent_role_from_live_definition:20260715⬡
      // AGENT_JD and the New World SCW fallback both carry structured role data.
      // Put that real definition on the wall instead of reducing every station to
      // an opaque source name. No roster or role is invented here.
      var c = b && b.content;
      try { if (typeof c === 'string') c = JSON.parse(c); } catch (e) { c = null; }
      var name = c && (c.agent || c.name || c.world);
      var role = c && (c.role || c.purpose);
      var summary = (b && (b.summary || b.source)) || '?';
      if (name && role) return '- ' + String(name).toUpperCase().slice(0, 40) + ': ' + String(role).slice(0, 160);
      if (name) return '- ' + String(name).toUpperCase().slice(0, 40) + ': ' + String(summary).slice(0, 160);
      return '- ' + String(summary).slice(0, 160);
    }).join('\n');
  }

  // Build context summary (recent minutes + results)
  var contextStr = '';
  var allContext = [];
  // Question-specific exact reads ride ahead of ordinary recent context so they
  // are not truncated out of the wall or SHADOW's bounded evidence window.
  var _namedAgents = (_namedAgentsIdx >= 0 && _results[_namedAgentsIdx] && _results[_namedAgentsIdx].status === 'fulfilled') ? _results[_namedAgentsIdx].value : null;
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
  var _prefs = (_prefIdx >= 0 && _results[_prefIdx] && _results[_prefIdx].status === 'fulfilled') ? _results[_prefIdx].value : null;
  var _wg = (_wgIdx >= 0 && _results[_wgIdx] && _results[_wgIdx].status === 'fulfilled') ? _results[_wgIdx].value : null;
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
    }).slice(0, 8);
  // Named-agent evidence leads so both the initial draft and the later SHADOW
  // evidence window receive it; the exact same rows are returned as fcw.context.
  if (_namedAgentRecords.length) allContext = allContext.concat(_namedAgentRecords);
  if (_prefs && _prefs.beads && _prefs.beads.length) allContext = allContext.concat(_prefs.beads);
  if (_wg && _wg.beads && _wg.beads.length) allContext = allContext.concat(_wg.beads);
  if (context && context.beads) allContext = allContext.concat(context.beads);
  if (recent && recent.beads) allContext = allContext.concat(recent.beads);
  contextStr = allContext.slice(0, 8).map(function(b) {
    return '[' + (b.stamp_type||'?') + (b.agent_global ? '/' + b.agent_global : '') + '] ' + (b.summary||b.source||'').slice(0,100);
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
    try { _anuVoice = require('./persona.js').VOICE; } catch (eVoice) { _anuVoice = "You are A\u2019NU, a warm, sharp butler in the spirit of JARVIS, a Black woman, never Siri. You speak in full natural sentences, you already did the work and lead with what you handled, you never sign off with a courtesy line, you never use em dashes or hollow AI phrases."; }
  }
  var systemPrompt = [
    _anuVoice,
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
        return 'WHO THIS IS (know them, speak from this naturally, never recite it as a file):\n' + body.slice(0);
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
    profile: !!(profile && profile.beads && profile.beads.length)
  };
  var empties = Object.keys(contributors).filter(function (k) { return !contributors[k]; });
  try {
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
            exit: { ok: true, contributors: contributors, contributorsResolved: Object.keys(contributors).length - empties.length, ms: (Date.now() - t0) },
            note: empties.length ? ('Memory Bank wall assembled with EMPTY contributors: ' + empties.join(', ') + ' -- if she answered wrong on this turn, start here')
                                  : 'Memory Bank wall assembled with all contributors present'
          }),
          summary: '[Memory Bank] wall built for ' + String(hamUid).toUpperCase() + ' (' + (channel || 'na') + '), ' + (Object.keys(contributors).length - empties.length) + '/6 contributors',
          importance: 2
        })
      }).catch(function () {});
    }
  } catch (_e) { /* wonder-stamp never breaks the wall */ }

  return {
    ok: true,
    system_prompt: systemPrompt,
    ham: { uid: hamUid, name: hamName, tier: hamTier, world: hamWorld },
    agents: agentJDs ? agentJDs.beads : [],
    context: allContext,
    named_agent_records: _namedAgentRecords,
    identity_evidence: _identityEvidence,
    identity_record: ib || null,
    contributors: contributors,
    contributorsResolved: Object.keys(contributors).length - empties.length,
    contributorsTotal: Object.keys(contributors).length,
    ms: ms,
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
module.exports = { buildMemoryBank, _test:{ selectHamIdentityBead } }; // dead name buildFCW fully retired system-wide; internal fn name is legacy-only
