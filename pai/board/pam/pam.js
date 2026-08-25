// ⬡B:board.pam:MODULE:privacy_gate_canonical:20260630⬡
// ⬡B:board.pam:FIX:merged_from_board_pam_root:20260630⬡
// PAM -- Privacy Gate. Canonical. Merged from board/pam.js + board/pam/pam.js.
// board/pam.js (root) had: credential check + meta-commentary check
// board/pam/pam.js had: EBC WORLD_PATTERNS + more complete credential set
// This file merges both. board/pam.js root is now a re-export of this file.
// Cold regex only. No LLM. No async. ANYHAM: no hardcoded identity.

// ⬡B:board.pam:FIX:the_world_patterns_come_from_configuration_by_name_never_literals:20260825⬡
// World domain patterns for the EBC firewall. Until 20260825 this was a frozen literal object
// carrying a real, named human being and three real organizations in shippable code, which the
// identity law (founder, 20260722) forbids outright: every world is someone else's, and a
// hardcoded person is a real human leaked into every stranger's deploy. It also carried common
// English words ("mediator") that a substring compare then ruled to BE a cross-world leak,
// killing turns on plain conversation. Both defects end here.
// The patterns now come from configuration BY NAME: the EBC_WORLD_PATTERNS env var carries a
// JSON object mapping a world name to its token list, e.g. {"worldname":["token", ...]}.
// Nothing is hardcoded; a deployment that configures nothing polices nothing, which is the
// true-zero shape the template law demands. A present-but-unreadable configuration is a
// carried fact (ebc_patterns_unreadable, an advisory below), never a silent open and never an
// invented verdict.
// One cache keyed on the raw env string so a hot path never re-parses the same bytes; tests
// that swap the env in-process get a fresh parse the moment the bytes change.
var _ebcPatternsCacheKey = null;
var _ebcPatternsCache = null;
var _ebcPatternsUnreadable = false;
function worldPatterns(env) {
  var raw = ((env || process.env) || {}).EBC_WORLD_PATTERNS;
  raw = typeof raw === 'string' ? raw : '';
  if (raw === _ebcPatternsCacheKey && _ebcPatternsCache) return _ebcPatternsCache;
  var out = {};
  var unreadable = false;
  if (raw.trim()) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (var world in parsed) {
          var key = String(world).trim().toLowerCase();
          var list = Array.isArray(parsed[world]) ? parsed[world] : [];
          var tokens = [];
          for (var i = 0; i < list.length; i++) {
            var token = String(list[i] == null ? '' : list[i]).trim().toLowerCase();
            if (token) tokens.push(token);
          }
          if (key && tokens.length) out[key] = Object.freeze(tokens);
        }
      } else {
        unreadable = true;
      }
    } catch (e) {
      unreadable = true;
    }
  }
  _ebcPatternsCacheKey = raw;
  _ebcPatternsCache = Object.freeze(out);
  _ebcPatternsUnreadable = unreadable;
  return _ebcPatternsCache;
}
function worldPatternsUnreadable(env) {
  worldPatterns(env);
  return _ebcPatternsUnreadable;
}

// ⬡B:board.pam:PEN:a_fact_about_a_person_is_not_a_credential:20260815⬡
// CREDENTIAL_PATTERNS is an ANCHOR list and it stays one: every entry is a provider SECRET, a
// thing that hands someone else's hands real power, and a leak is an irreversible person-effect.
// That is why a match here is a hard hold with no negotiation. Two entries were never that.
//
// `/\+1[0-9]{10}/` named `phone_number` was a fact ABOUT A PERSON wearing a credential's name.
// MEASURED before this change, via checkCredentials:
//   "Your mom called from +1XXXXXXXXXX this morning."
//     -> {ok:false, reason:'credential_in_outbound', credential_type:'phone_number'}
// In the council that heals into an LLM rewrite that DELETES the number from her mouth, and at
// STAMP, which is deliberately excluded from healing, it kills the turn outright. Telling a
// person who called is a life assistant's whole job.
//
// WHO MAY SEE A FACT ABOUT A PERSON IS THE PEOPLE-TIER QUESTION, and the first version of this
// paragraph OVERSTATED where that is enforced. A blind critic counted instead of believing it,
// so here is the honest split across all five callers of pamCheck:
//   pamRelease, just below (a banked bead row)   THE TIER LADDER GOVERNS IT.
//     core/privacy/people.tier.js#structuralFilter turns the viewer's ceiling into an acl_tier
//     DATABASE predicate, so a row above that ceiling is never selected and never travels; it
//     fails closed to STRICTEST for an unresolved reader and takes T0 only from env; and
//     pamRelease re-applies the tier and mark gates before any mind is spent.
//   the two council stages                       NOT the ladder. These are bytes she composed.
//   the two outbound email edges                 NOT the ladder. people.tier is not required
//                                                anywhere in that file.
// A number arriving from a tool result, a calendar event or an inbound email never passes
// through a bead SELECT, so it never meets the predicate.
// SO THE CLAIM IS TWO CLAIMS, and both are true where they apply. On the banked-row path this
// deletes a DUPLICATE WEARING THE WRONG NAME, and a broken one, since pamRelease already rules
// the owner holds everything in his own world and this regex was overruling that with a
// substring match. On the other four paths it deletes a COLD GATE DECIDING WHAT SHE MAY SAY, and
// what governs those is the outbound council: a woken mind, which is the correct decider.
// ONE NARROW BEHAVIOR CHANGE, named rather than left for someone to find. pamCheck runs BEFORE
// the SANCTIONED branch below, and a SANCTIONED row is released verbatim with no mind spent. So
// for that one row type this scan was the only content gate, and a sanctioned row carrying a
// phone number was withheld from a lower-tier reader before this change and is released now.
// It needs an explicit founder mark to reach that state, so it is narrow, but it is real.
//
// The supabase URL was the second. A HOSTNAME IS NOT A SECRET. The key is, and the key is still
// caught by jwt_token below, which matches the exact HS256 header every Supabase anon and
// service key carries. Naming infrastructure is worth a FLAG on the receipt, never a held turn.
// Regex wakes, regex never decides (20260807): an advisory DETECTS and rides the receipt, and
// the mind reading the receipt decides what it means.
var CREDENTIAL_PATTERNS = [
  { pattern: /gsk_[A-Za-z0-9]{20,}/, name: 'groq_key' },
  { pattern: /ghp_[A-Za-z0-9]{20,}/, name: 'github_token' },
  { pattern: /github_pat_[A-Za-z0-9]{30,}/, name: 'github_fine_grained_pat' },
  { pattern: /rnd_[A-Za-z0-9]{20,}/, name: 'render_key' },
  { pattern: /sk-or-v1-[a-z0-9]{40,}/, name: 'openrouter_key' },
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, name: 'jwt_token' },
  // Provider keys the CATHY.SHADOW audit found leaked across the repos. The
  // outbound firewall must catch every family, not only the original seven. The
  // sk- and sk_ families carry a word boundary so ordinary hyphenated words like
  // "task-management" cannot trip them; the distinctive prefixes stand alone.
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/, name: 'anthropic_key' },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}/, name: 'openai_project_key' },
  { pattern: /\bsk-[A-Za-z0-9]{32,}/, name: 'openai_key' },
  { pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}/, name: 'stripe_key' },
  { pattern: /\bsk_[A-Za-z0-9]{40,}/, name: 'elevenlabs_key' },
  { pattern: /\bnyk_[A-Za-z0-9]{2,6}_[A-Za-z0-9]{20,}/, name: 'nylas_key' },
  { pattern: /\bAIza[A-Za-z0-9_-]{30,}/, name: 'google_api_key' },
  { pattern: /\bpplx-[A-Za-z0-9]{20,}/, name: 'perplexity_key' },
  { pattern: /\bxai-[A-Za-z0-9]{20,}/, name: 'xai_key' },
  { pattern: /\bAKIA[0-9A-Z]{16}/, name: 'aws_access_key' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, name: 'slack_token' }
];

// DETECTED AND CARRIED, NEVER DECIDED. An advisory never flips ok and never holds a turn. It
// exists so the fact that she named infrastructure reaches a receipt a mind can read, which is
// the whole difference between a regex that wakes and a regex that decides.
var ADVISORY_PATTERNS = [
  { pattern: /https:\/\/[a-z]{15,}\.supabase\.co/, name: 'infrastructure_hostname' }
];

function safeContentText(content) {
  try {
    if (typeof content === 'string') return { ok:true, text:content };
    if (content == null) return { ok:true, text:'' };
    var encoded = JSON.stringify(content);
    return typeof encoded === 'string' ? { ok:true, text:encoded }
      : { ok:false, text:'' };
  } catch (e) {
    return { ok:false, text:'' };
  }
}

function checkCredentials(content) {
  try {
    var scan = safeContentText(content);
    if (!scan.ok) return { ok:false, reason:'credential_scan_unavailable' };
    var str = scan.text;
    for (var i = 0; i < CREDENTIAL_PATTERNS.length; i++) {
      var p = CREDENTIAL_PATTERNS[i];
      if (p.pattern.test(str)) {
        return { ok: false, reason: 'credential_in_outbound', credential_type: p.name };
      }
    }
    var advisories = [];
    for (var j = 0; j < ADVISORY_PATTERNS.length; j++) {
      if (ADVISORY_PATTERNS[j].pattern.test(str)) advisories.push(ADVISORY_PATTERNS[j].name);
    }
    // Present only when non-empty, so a clean scan keeps its exact historical {ok:true} shape
    // and the two deepEqual pins on this return value stay true without being touched.
    if (advisories.length) return { ok:true, advisories:advisories };
  } catch (e) {
    return { ok:false, reason:'credential_scan_unavailable' };
  }
  return { ok: true };
}

// ⬡B:board.pam:BOUNDARY:meta_commentary_belongs_to_its_council_stage:20260719⬡
// Compatibility only. PAM owns deterministic privacy facts; the dedicated
// META_COMMENTARY council stage owns the meaning judgment and its healer.
function checkMetaCommentary() {
  return { ok: true, advisory: true, stage: 'META_COMMENTARY',
    reason: 'meta_commentary_deferred' };
}

// The DETECTOR. It reports a fact ({ok:false, reason:'ebc_cross_world_leak', from_world}) and
// decides nothing about what the fact means: each consumer owns that. pamCheck below carries a
// token match as an ADVISORY for the mind that rules (the SHADOW judge reads it as
// privacy_advisories); pamRelease keeps it a hard withhold because there a bead row is
// physically crossing worlds; the inbound mail edge keeps its own hold for the same reason.
function checkEbcFirewall(content, activeWorld) {
  try {
    if (typeof activeWorld !== 'string') return { ok:true };
    var normalizedWorld = activeWorld.trim().toLowerCase();
    var patterns = worldPatterns();
    if (!Object.prototype.hasOwnProperty.call(patterns, normalizedWorld)) return { ok:true };
    var scan = safeContentText(content);
    if (!scan.ok) return { ok:false, reason:'ebc_scan_unavailable',
      active_world:normalizedWorld };
    var str = scan.text.toLowerCase();
    for (var world in patterns) {
      if (world === normalizedWorld) continue;
      var otherPatterns = patterns[world];
      for (var i = 0; i < otherPatterns.length; i++) {
        if (str.indexOf(otherPatterns[i]) >= 0) {
          return { ok: false, reason: 'ebc_cross_world_leak', from_world: world,
            active_world: normalizedWorld };
        }
      }
    }
  } catch (e) {
    return { ok:false, reason:'ebc_scan_unavailable', active_world:
      typeof activeWorld === 'string' ? activeWorld.trim().toLowerCase() : null };
  }
  return { ok: true };
}

/**
 * PAM Privacy Check
 * @param {string|object} content - outbound content to check
 * @param {string} [activeWorld] - active EBC world (bdif, mediators, mh_action, gmg) or null
 * @returns {{ ok: boolean, verdict: string, flags: Array }}
 */
function pamCheck(content, activeWorld) {
  try {
    var flags = [];
    var advisories = [];
    var advisoryFindings = [];
    var credCheck = checkCredentials(content);
    if (!credCheck.ok) flags.push(credCheck);
    else if (Array.isArray(credCheck.advisories)) advisories = credCheck.advisories.slice();
    // ⬡B:board.pam:FIX:a_token_match_on_her_sentence_is_a_detection_never_a_verdict:20260825⬡
    // Proven by execution before this change: "You could ask a mediator about the dispute"
    // in the bdif world returned PAM_HOLD, the heal had a mind delete the word from her mouth,
    // and at STAMP (excluded from healing) the turn died outright. A substring cannot read a
    // sentence. The token MATCH is now an advisory that rides this receipt to the SHADOW
    // judge (privacy_advisories), and the mind rules on what the word means. The two
    // INABILITY facts stay holds, because a scan that could not run cleared nothing: a
    // content shape that cannot be scanned (ebc_scan_unavailable) and a configured pattern
    // set that cannot be read (ebc_patterns_unreadable, carried as an advisory when no world
    // was policed at all so a pass never silently claims a scan that never happened).
    var ebcCheck = checkEbcFirewall(content, activeWorld);
    if (!ebcCheck.ok) {
      if (ebcCheck.reason === 'ebc_cross_world_leak') {
        advisories.push('ebc_cross_world_leak');
        advisoryFindings.push({ reason: 'ebc_cross_world_leak',
          from_world: ebcCheck.from_world, active_world: ebcCheck.active_world });
      } else {
        flags.push(ebcCheck);
      }
    }
    if (worldPatternsUnreadable()) advisories.push('ebc_patterns_unreadable');
    var out = { ok: flags.length === 0,
      verdict: flags.length === 0 ? 'PAM_PASS' : 'PAM_HOLD', flags: flags };
    // Advisory only, and only when present: a clean answer keeps the exact three-key shape two
    // existing deepEqual pins assert on, so nothing had to be loosened to carry this fact.
    if (advisories.length) out.advisories = advisories;
    if (advisoryFindings.length) out.advisory_findings = advisoryFindings;
    return out;
  } catch (e) {
    return { ok:false, verdict:'PAM_HOLD',
      flags:[{ ok:false, reason:'pam_security_check_fault' }] };
  }
}

// ⬡B:board.pam:WONDER:pam_gets_the_mind_it_was_always_supposed_to_have_and_fails_closed:20260726⬡
// PAM IS THE PRIVACY GATE AND IT WAS COLD, AND IT FAILED OPEN. Everything above this line
// is a regex sweep: it catches a credential shaped like a credential and a world name
// spelled the way somebody once spelled it, and it returns ok:true for absolutely
// everything else. A privacy gate whose default answer is "release" is not a gate. It is a
// door with a sign on it. That was survivable while exactly one world existed and one
// person read it. It stops being survivable the moment four personalised worlds are open
// in one room, because the failure mode is not an abstraction any more: it is the founder's
// job hunt or his fellowship money appearing on a teammate's screen while he is standing
// there.
//
// So PAM gets the second half it was always specified to have. pamCheck above stays exactly
// as it is: it holds DETERMINISTIC facts (this string contains a provider key; this text
// names another EBC world) and deterministic facts are correctly cold, sync, and unchanged
// for every existing caller. pamRelease below holds the JUDGMENT, and judgment is a mind's
// job: it decides whether a piece of the owner's memory may travel to the world that is
// reading, and when the shape of a fact is fine but the detail is not, it writes the
// toned-down version rather than refusing. See the three behaviours in
// core/privacy.WONDER.classification.20260726.js.
//
// FAIL CLOSED, EVERY PATH. If the tier cannot be resolved, the reader is treated as the
// least privileged person in the system. If the mind cannot be reached, nothing
// unclassified is released. If anything at all throws, the verdict is PAM_HOLD with an
// empty release set. There is no branch in this function that answers "I don't know, ship it".
//
// AND IT NEVER ANNOUNCES. A candidate marked private is dropped before the mind ever sees
// it, its id is never returned, its summary is never quoted, and no reason string ever
// names it. The count of withheld items is an aggregate integer and nothing else, because
// "there are 3 things I can't tell you about" is the exact leak the founder is testing for.
var _tiers = require('../../core/privacy/people.tier.js');

var RELEASE_SYSTEM = [
  'You are the release gate of a personal intelligence system. One piece of the owner\'s',
  'stored memory is about to be shown to somebody who is NOT the owner. Nobody has',
  'classified this piece. You decide what happens to it.',
  '',
  'Three outcomes, and you must pick one:',
  '  "open"      it is genuinely fine as written. Show it unchanged.',
  '  "tone_down" the shape of it is fine but some detail is not. Write a version that is',
  '              TRUE, natural, and specific enough to be worth saying, with the private',
  '              detail simply absent. Do not hedge, do not hint that you removed anything,',
  '              do not write "certain details" or "some matters". Just say the safe thing',
  '              as though it were the whole thing.',
  '  "withhold"  there is no honest version of this that is safe for this reader.',
  '',
  'The owner is deliberately watching for one failure: an answer that announces a boundary.',
  '"That is private", "I am not able to discuss that", "there are things I cannot share"',
  'all fail, because they tell the reader that something exists. Toning down is the right',
  'answer far more often than withholding. Withhold only when there is nothing true left.',
  '',
  'Consider WHO is reading. A lower tier number means a closer, more trusted circle:',
  '0 is the owner himself, 1 his highest circle, 2 his company only, 3 early testers,',
  '4 the wider collective. Judge the content, never the vocabulary.',
  '',
  'Return STRICT JSON only, no prose, no code fence:',
  '{"decision":"open"|"tone_down"|"withhold","text":"<the exact text to show when decision',
  'is open or tone_down, else empty string>"}'
].join('\n');

function _text(candidate) {
  if (candidate == null) return '';
  if (typeof candidate === 'string') return candidate;
  var parts = [];
  if (candidate.summary) parts.push(String(candidate.summary));
  if (candidate.text) parts.push(String(candidate.text));
  if (!parts.length && candidate.content != null) {
    var c = candidate.content;
    parts.push(typeof c === 'string' ? c : (function () {
      try { return JSON.stringify(c); } catch (e) { return ''; }
    })());
  }
  return parts.join('\n').slice(0, 6000);
}

function _extractJson(text) {
  if (!text) return null;
  var m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

function _completionText(completion) {
  try {
    var c = completion && completion.choices && completion.choices[0];
    var t = c && c.message && c.message.content;
    return typeof t === 'string' ? t : '';
  } catch (e) { return ''; }
}

// The mind. Returns null on ANY failure, which the caller reads as WITHHOLD.
async function _judgeRelease(body, viewerTier, chatSeat) {
  var completion;
  try {
    completion = await chatSeat('c1_cellm', [
      { role: 'system', content: RELEASE_SYSTEM },
      { role: 'user', content: 'The reader is at tier ' + viewerTier +
        '.\n\nThe stored memory:\n\n' + body }
    ], { temperature: 0.1, maxTokens: 800, timeoutMs: 20000 });
  } catch (e) { return null; }
  var parsed = _extractJson(_completionText(completion));
  if (!parsed) return null;
  var decision = String(parsed.decision || '').trim().toLowerCase();
  if (decision !== 'open' && decision !== 'tone_down' && decision !== 'withhold') return null;
  var out = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  if (decision !== 'withhold' && !out) return null;
  return { decision: decision, text: out };
}

function _transportPrivacyEnvelope(row) {
  if (!row || !row.privacy || typeof row.privacy !== 'object') return null;
  var mark = _tiers.normalizeMark(row.privacy.mark) || _tiers.MARKS.UNCLASSIFIED;
  var parsedTier = _tiers.parseTier(row.privacy.tier);
  return { mark:mark,
    tier:parsedTier != null ? parsedTier : _tiers.MARK_DEFAULT_TIER[mark] };
}

/**
 * PAM RELEASE GATE. The world-facing half of PAM.
 *
 * @param {Array} candidates  bead rows or {id, summary, text, content} objects that already
 *                            survived the structural tier filter at the query
 * @param {object} ctx        { viewerTier, viewerWorld, hamUid }
 * @param {object} [options]  { chatSeat } test seam only; production passes nothing
 * @returns {Promise<{ok:boolean, verdict:string, released:Array, withheld:number, toned:number, gate_ms:number}>}
 */
async function pamRelease(candidates, ctx, options) {
  var t0 = Date.now();
  var o = options || {};
  var chatSeat = o.chatSeat || require('../../core/model.router.js').chatSeat;
  var c = ctx || {};
  // Fail closed on the reader: an unresolved tier is the least privileged reader alive.
  var viewerTier = _tiers.effectiveTier(c.viewerTier);
  var list = Array.isArray(candidates) ? candidates : (candidates == null ? [] : [candidates]);

  var released = [];
  var withheld = 0;
  var toned = 0;

  try {
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var env = _tiers.envelopeOf(row) || _transportPrivacyEnvelope(row);

      // The owner reading his own world holds everything, by the ladder. No mind is spent.
      if (viewerTier <= _tiers.T0) { released.push(row); continue; }

      // Marked private: dropped here, silently, before anything else touches it. No id, no
      // summary, no reason. It is not counted separately from any other withheld item, so
      // even the shape of the response cannot be read as "a private thing exists".
      if (env && env.mark === _tiers.MARKS.PRIVATE) { withheld++; continue; }

      // Above the reader's ceiling by tier. Also silent, for the same reason.
      if (env && _tiers.isTier(env.tier) && env.tier < viewerTier) { withheld++; continue; }

      var body = _text(row);
      if (!body.trim()) { withheld++; continue; }

      // Deterministic facts still hold: a credential is never released no matter what any
      // mind thinks about it.
      var hard = pamCheck(body, c.viewerWorld || null);
      if (!hard.ok) { withheld++; continue; }

      // ⬡B:board.pam:KEEP:a_bead_row_physically_crossing_worlds_stays_a_hard_fact_here:20260825⬡
      // On the council stages the same token match became an advisory a mind rules on,
      // because there the bytes are HER OWN sentence to the person in the room. Here the
      // bytes are a BANKED ROW of one world's memory about to travel into another world's
      // read, a privacy boundary with an irreversible person-effect on the other side, and
      // this path already fails closed by design on every uncertainty. So a cross-world
      // token match stays a silent withhold on this path, exactly as before the demotion.
      var ebcRow = checkEbcFirewall(body, c.viewerWorld || null);
      if (!ebcRow.ok) { withheld++; continue; }

      // Sanctioned: the founder wants this found. Released verbatim, no mind spent, because
      // a model quietly softening something he deliberately opened is its own failure.
      if (env && env.mark === _tiers.MARKS.SANCTIONED) { released.push(row); continue; }

      // Unclassified. THE MIND DECIDES.
      var verdict = await _judgeRelease(body, viewerTier, chatSeat);
      if (!verdict) { withheld++; continue; }       // FAIL CLOSED: no mind, no release.
      if (verdict.decision === 'withhold') { withheld++; continue; }
      if (verdict.decision === 'tone_down') {
        toned++;
        released.push(Object.assign({}, row, {
          summary: verdict.text, text: verdict.text, content: verdict.text,
          pam_toned: true
        }));
        continue;
      }
      released.push(row);
    }
  } catch (e) {
    // Anything at all throwing means the gate did not complete. Release nothing.
    return { ok: false, verdict: 'PAM_HOLD', released: [], withheld: list.length,
      toned: 0, gate_ms: Date.now() - t0, fault: 'pam_release_fault' };
  }

  return {
    ok: true,
    verdict: released.length ? 'PAM_RELEASE' : 'PAM_HOLD',
    released: released,
    withheld: withheld,
    toned: toned,
    viewer_tier: viewerTier,
    gate_ms: Date.now() - t0
  };
}

module.exports = { pamCheck: pamCheck, checkCredentials: checkCredentials, checkMetaCommentary: checkMetaCommentary, checkEbcFirewall: checkEbcFirewall,
  worldPatterns: worldPatterns, ADVISORY_PATTERNS: ADVISORY_PATTERNS,
  pamRelease: pamRelease, RELEASE_SYSTEM: RELEASE_SYSTEM,
  _test: { _extractJson: _extractJson, _text: _text, _judgeRelease: _judgeRelease } };

// WORLD_PATTERNS keeps its historical name for every existing reader (the council resolves a
// scoped world through it, tests read it), but it is now a live view of the configuration by
// name, never a literal. A getter, so a changed env is seen without a module reload.
Object.defineProperty(module.exports, 'WORLD_PATTERNS', {
  enumerable: true,
  get: function () { return worldPatterns(); }
});
