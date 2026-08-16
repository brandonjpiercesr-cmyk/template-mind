// ⬡B:board.writ:MODULE:voice_law:20260617⬡
// ⬡B:board.writ:BUILD:cookoff_unified_ruleset:20260713⬡
// WRIT -- Voice Law Module (Canonical, unified)
//
// Consolidated per a real head-to-head cook-off (opus-4-8 won, judged by Fable
// 5, EDGE stamp ⬡B:wonder.cookoff:RESULT:run:20260713⬡): board/writ.js (File
// A, sync, the richer ruleset -- banned words, super bans, CTA endings, banned
// headers, process narration, internal-system-leak, cold greeting, choppy
// density) and this file (File B, async, narrower, but the ONLY one that
// stripped emoji) are merged here. Winning call, taken as-given: writCheck is
// ASYNC -- File B was already async and async is the safe superset (an await
// on a sync return works fine; the reverse does not). Nothing from either
// file is dropped. board/writ.js becomes a thin re-export of this file.
//
// Cold witnesses plus a model Wonder. Cold code records exact facts and formatting bytes.
// The model owns every judgment about meaning, tone, and expression.

var crypto = require('crypto');

var BANNED_WORDS = [
  'flag', 'land', 'landing on', 'land on', 'drawn to', 'was drawn', "i'm drawn",
  'nail down', 'walk you through', "let me walk you through", "that's exactly how",
  'leverage', 'utilize', 'touch base', 'circle back', 'deep dive', 'bandwidth',
  'deliverables', 'stakeholders', 'reach out', 'moving forward', 'robust',
  'furthermore', 'moreover', 'nevertheless'
];

var SUPER_BANS = [
  'walked away feeling energized', 'left our call excited', 'left our conversation feeling',
  'genuinely appreciate', 'really appreciate', 'truly appreciate', 'deeply resonated',
  'thoughtful note', 'thoughtful feedback', 'thoughtful question', 'hope you and yours',
  "here's the thing", 'at its core', 'simply put', 'that said', 'make no mistake',
  "it's worth noting", 'engine is taking shape', 'i appreciate you both',
  'the alignment on your end', 'build together', 'on your end', 'on my side',
  'game-changer', 'synergy', 'thought leadership'
];

var CTA_ENDINGS = [
  'let me know if you have any questions', 'looking forward to hearing from you',
  "please don't hesitate to reach out", 'happy to hop on a call',
  'feel free to reach out anytime', 'i would love to discuss this further'
];

var BANNED_HEADERS = [
  'overview', 'introduction', 'background', 'purpose of this document',
  'what success looks like', 'the arrangement', 'key takeaways',
  'executive summary', 'next steps'
];

var PROCESS_NARRATION = [
  "i've updated this to reflect", 'per your instructions', 'this document follows the structure',
  'based on the conversation, i', "i've organized this into", 'just to recap',
  'as i mentioned earlier', 'below you will find', 'this document outlines'
];

var INTERNAL_SYSTEM_TERMS = [
  'abacia', 'abaham', 'acl stamp', 'cellm', 'ham uid',
  '\u2b21b:', 'writgate', 'clabav', 'aibe_brain', 'logful', 'abacia_core', 'stamp_type',
  'cara chat portal', 'coding department', 'thinking stream', 'council stage',
  'model ladder', 'run of show'
];

var META_PATTERNS = [
  /as an ai[^.]*\.?/gi,
  /as a language model[^.]*\.?/gi,
  /i was trained[^.]*\.?/gi
];

// From File B: strips emoji (pictographs, variation selectors, ZWJ, regional
// indicators). File A never had this step -- kept, not dropped.
function stripEmoji(content) {
  var emojiRe = /(\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{1F1E6}-\u{1F1FF}])/gu;
  var count = (content.match(emojiRe) || []).length;
  return { cleaned: content.replace(emojiRe, ''), count: count };
}

function removeEmDash(content, options) {
  var preserveAsciiDoubleDash = options === true ||
    !!(options && options.preserveAsciiDoubleDash);
  content = content.replace(/\u2014/g, ', ');
  return preserveAsciiDoubleDash ? content : content.replace(/--/g, ', ');
}

function stripMeta(content) {
  var removed = 0;
  META_PATTERNS.forEach(function (pattern) {
    var before = content;
    content = content.replace(pattern, '');
    if (content !== before) removed++;
  });
  return { cleaned: content, removed: removed };
}

function coffeeshopTest(content) {
  var jargon = ['ABACIA', 'ABAHAM', 'ACL stamp', 'CELLM', 'HAM UID', 'BEAD', 'LOGFUL'];
  var flags = jargon.filter(function (j) { return content.indexOf(j) >= 0; });
  return { ok: flags.length === 0, flags: flags };
}

function isInternalContext(context) {
  context = context || {};
  var channel = String(context.channel || '').toLowerCase();
  var mode = String(context.mode || '').toLowerCase();
  return channel === 'coding' || channel === 'internal' ||
    mode === 'coding' || mode === 'internal' || context.internal === true;
}

// WRIT may polish a draft, but it may never replace exact facts. This witness
// is deliberately mechanical: it compares concrete values and named subjects.
// It does not use word overlap or output length as a proxy for meaning. Those
// are semantic judgments and belong to the two model Wonders, WRIT and the
// mandatory post-WRIT Meta Commentary pass.
function semanticAnchorReport(original, rewritten) {
  original = String(original || '').trim();
  rewritten = String(rewritten || '').trim();
  if (!original || !rewritten) return { preserves:false, verdict:'REVISE', changes:[{type:'empty_text'}] };
  if (original === rewritten) return { preserves:true, verdict:'PASS', changes:[] };
  function multiset(text, pattern, normalize) {
    var values = String(text).match(pattern) || [];
    return values.map(normalize || function (value) { return value; }).sort();
  }
  function properNames(text) {
    return (String(text).match(/\b[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*\b/g) || [])
      .filter(function (value) { return !/^(The|This|That|As|Let|Here|Where|What|How|Thanks|Everything|Nothing|Project|Calendar|My|I|We|You|He|She|They|August|September|October|November|December|January|February|March|April|May|June|July)$/i.test(value); });
  }
  function ordered(text, values) {
    return values.map(function (value) { return String(text).indexOf(value); });
  }
  var factKinds = [
    { type:'money', pattern:/\$\s?\d[\d,]*(?:\.\d+)?/g, normalize:function(v){return v.replace(/\s/g,'');} },
    { type:'date', pattern:/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi, normalize:function(v){return v.toLowerCase();} },
    { type:'time', pattern:/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, normalize:function(v){return v.toLowerCase().replace(/[.\s]/g,'');} },
    { type:'email', pattern:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, normalize:function(v){return v.toLowerCase();} },
    { type:'url', pattern:/https?:\/\/[^\s)]+/gi, normalize:function(v){return v;} },
    { type:'phone', pattern:/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/g, normalize:function(v){return v.replace(/\D/g,'');} },
    { type:'identifier', pattern:/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{2,}\b/gi, normalize:function(v){return v.toUpperCase();} },
    { type:'number', pattern:/\b\d+(?:\.\d+)?%?\b/g, normalize:function(v){return v;} },
    { type:'status', pattern:/\b(?:approved|rejected|accepted|declined|cancelled|canceled|completed|held|unavailable|pending)\b/gi, normalize:function(v){return v.toLowerCase();} },
    { type:'action', pattern:/\b(?:sign|signed|send|sent|cancel|cancelled|canceled|approve|approved|reject|rejected|pay|paid|schedule|scheduled|call|called)\b/gi, normalize:function(v){return v.toLowerCase();} },
    { type:'quote', pattern:/["“][^"”\n]{2,}["”]/g, normalize:function(v){return v;} }
  ];
  var changes = [];
  factKinds.forEach(function (kind) {
    var beforeFacts = multiset(original, kind.pattern, kind.normalize);
    var afterFacts = multiset(rewritten, kind.pattern, kind.normalize);
    if (JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts)) {
      changes.push({ type:kind.type, before:beforeFacts, after:afterFacts });
    }
  });
  var beforeNames = properNames(original), afterNames = properNames(rewritten);
  if (JSON.stringify(beforeNames.slice().sort()) !== JSON.stringify(afterNames.slice().sort())) {
    changes.push({ type:'name', before:beforeNames, after:afterNames });
  } else if (beforeNames.length > 1 && JSON.stringify(ordered(original, beforeNames)) !== JSON.stringify(ordered(rewritten, beforeNames))) {
    changes.push({ type:'order', before:beforeNames, after:afterNames });
  }
  return { preserves:changes.length === 0, verdict:changes.length ? 'REVISE' : 'PASS', changes:changes };
}

function preservesSemanticAnchors(original, rewritten) {
  return semanticAnchorReport(original, rewritten).preserves;
}

// Preserve every byte between a Markdown fence and its matching close. The
// transform receives only contiguous prose segments, never fence or code lines.
function transformOutsideFences(content, transform) {
  var lines = String(content).split('\n');
  var output = [];
  var prose = [];
  var fence = null;

  function flushProse() {
    if (!prose.length) return;
    output.push(transform(prose.join('\n')));
    prose = [];
  }

  lines.forEach(function (line) {
    var bare = line.endsWith('\r') ? line.slice(0, -1) : line;
    var marker = bare.match(/^[ \t]*(`{3,}|~{3,})/);
    if (!fence && marker) {
      flushProse();
      fence = { character: marker[1][0], length: marker[1].length };
      output.push(line);
      return;
    }
    if (fence) {
      output.push(line);
      var trimmed = bare.trim();
      var isMatchingClose = trimmed.length >= fence.length &&
        trimmed.split('').every(function (character) { return character === fence.character; });
      if (isMatchingClose) fence = null;
      return;
    }
    prose.push(line);
  });
  flushProse();
  return output.join('\n');
}

// ⬡B:board.writ:BUILD:dash_ruling_channel_so_a_mind_can_keep_one:20260808⬡
// THE RULING CHANNEL. Until today there was no way for anything, model or human,
// to decide that a dash belonged: removeEmDash below rewrote every one of them to
// a comma with no mind anywhere in the loop. That is a NASTY C by this repo's own
// definition (docs/NASTY_C_AUDIT.md: "cold code that makes a real judgment... with
// no model"), and it contradicts the only three things the founder is recorded
// saying about em dashes, all three of which put the call with an LLM:
//   "no C O L D C O D E that checks for E M dashes is running by itself. It just
//    flags and alerts the L O M so they can make intelligent decisions."
//   "one master one looking at the master thing and saying yes, no, actually we
//    needed to have a EM dash in this"
// Pass context.dashRuling (see board/writ/dash.ruling.js) and the mind's verdicts
// decide, KEEP included. Pass nothing and the legacy cold rewrite still runs, so
// no existing caller changes behavior on a shared branch. That legacy default is
// NOT converted and should not be cited as founder law: a search of 96 unique
// transcripts found zero occurrences of any sentence banning em dashes. Converting
// the default is the founder's call, not a coder's, which is why this is a door
// and not a demolition.
function applyVoiceLaw(content, context) {
  var ruling = context && context.dashRuling;
  if (ruling && Array.isArray(ruling.verdicts)) {
    var dashRuling = require('./dash.ruling.js');
    var scan = dashRuling.flagDashes(content);
    var applied = dashRuling.applyRuling(content, scan.flags, ruling);
    // Whitespace normalization still runs; the dashes are now the mind's business.
    return transformOutsideFences(applied.text, function (proseContent) {
      return proseContent.split('\n').map(function (line) {
        var cr = line.endsWith('\r') ? '\r' : '';
        var raw = cr ? line.slice(0, -1) : line;
        var lead = (raw.match(/^[ \t]*/) || [''])[0];
        return lead + raw.slice(lead.length).replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, '') + cr;
      }).join('\n');
    });
  }
  var preserveAsciiDoubleDash = isInternalContext(context);
  // ⬡B:board.writ:FIX:preserve_multiline_coding_structure:20260715⬡
  // Voice cleanup is horizontal and prose-only. Newlines and leading indentation
  // carry list/code structure; fenced code bypasses dash and spacing transforms.
  var voiced = transformOutsideFences(content, function (proseContent) {
    return proseContent.split('\n').map(function (line) {
      var carriageReturn = line.endsWith('\r') ? '\r' : '';
      var raw = carriageReturn ? line.slice(0, -1) : line;
      raw = removeEmDash(raw, { preserveAsciiDoubleDash: preserveAsciiDoubleDash });
      var leading = (raw.match(/^[ \t]*/) || [''])[0];
      var body = raw.slice(leading.length).replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, '');
      return leading + body + carriageReturn;
    }).join('\n');
  });
  var lines = voiced.split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

function findPhrases(lowerContent, list, label) {
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (lowerContent.indexOf(list[i]) >= 0) hits.push({ type: label, phrase: list[i] });
  }
  return hits;
}

// ⬡B:board.writ:BUILD:overrule_receipt_helper:20260728⬡
// Which of the phrase hints handed to the organ are still present in the text
// the organ chose to return. Pure observation, decides nothing, moves no
// verdict: it exists so a receipt can PROVE the mind overruled the scanner
// rather than merely asserting that it may. Bounded and deduped, phrases only,
// never answer bytes, so this can ride an internal receipt safely.
// ⬡B:board.writ:HEAL:a_name_hint_IS_an_answer_byte_and_this_banked_it:20260815⬡
// THE SENTENCE ABOVE STOPPED BEING TRUE THE DAY I ADDED THE NAME WAKE, and a blind critic
// named it. Every other hint here is a fixed phrase from a fixed list ("just to recap"), so
// "phrases only, never answer bytes" held. A name hint is a SUBSTRING LIFTED OUT OF HER ANSWER,
// and for the wake it exists for, that substring is a real person's first name. It rode
// overruled_hints into the durable bank through writCheckAndBank, so every turn where WRIT kept
// a reader's daughter's name wrote that name into a bead as a flag code.
// WORSE, I MADE IT CERTAIN. Ranking name hints FIRST into a list capped at 8, which was the
// right fix for the proof being evicted, also guaranteed the name is always the thing banked.
// I named this in the commit and deferred it. Deferring it was wrong: it is one function.
//
// THE PROOF SURVIVES WITHOUT THE NAME. A name hint now lands as the CLASS token
// `internal_name_kept`, which says exactly what the receipt needs to say, that a mind read the
// sentence and chose to keep a name a word list flagged. Which name is not the receipt's
// business, it is hers, and dedupe collapses every kept name to that one token so names can
// never crowd the other proof out of the cap either. Nothing is filtered and nothing is capped
// on HER side: the organ still sees every name in its prompt and still decides.
function survivingHints(hintPhrases, renderedText) {
  var lower = String(renderedText || '').toLowerCase();
  var seen = {};
  var survivors = [];
  (hintPhrases || []).forEach(function (entry) {
    var phrase = String((entry && (entry.phrase || entry.type)) || entry || '').trim().toLowerCase();
    if (!phrase || phrase.length < 3) return;
    if (lower.indexOf(phrase) < 0) return;
    // The one hint family whose phrase is her answer rather than a fixed list entry.
    // clean_speech: the phrase is from a closed wake list and leaks nobody, but this receipt is
    // banked and then read BACK to her by the presenters, and a bank row that replays profanity
    // under a heading about her own recent words is the read-back hazard the 20260815 doctrine
    // drop names. The full terms already ride the clean_speech_wake flag for audit; the receipt
    // only has to prove a mind read the sentence and made the call.
    var token = (entry && entry.type === 'internal_name') ? 'internal_name_kept'
      : (entry && entry.type === 'clean_speech') ? 'clean_speech_kept'
        : phrase;
    if (seen[token]) return;
    seen[token] = true;
    survivors.push(token);
  });
  return survivors.slice(0, 8);
}

function checkBannedHeaders(content) {
  var hits = [];
  var lines = content.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].trim();
    var stripped = raw.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/:$/, '').trim().toLowerCase();
    if (BANNED_HEADERS.indexOf(stripped) >= 0) hits.push({ type: 'banned_header', phrase: stripped, line: i });
  }
  return hits;
}

// ⬡B:board.writ:FIX:the_greeting_and_rhythm_checks_were_dead_code:20260726⬡
// Found 20260726: checkColdGreeting and approximateChoppyDensity were DEFINED here,
// described in the header comment as part of the unified ruleset, and CALLED BY NOTHING.
// Not by writCheck, not by any caller, not exported. So two of the five failure modes the
// founder named by hand in his email doctrine were detected by nothing at all:
//   "Will," instead of "Hey Will," and a lowercase "hey will"   -> the greeting register
//   "short, mean, punchy and direct"                            -> the rhythm
// They are wired now, and wired the ONLY way the standing law allows: as HINTS handed to
// the render organ, exactly like the CTA, process-narration and filler lists beside them.
// A greeting is a judgment about a relationship, not a fact about characters, so cold code
// gathers the observation and the LLM rules on it. Nothing here rewrites one of his words.
function checkColdGreeting(content) {
  var firstLine = (content.split('\n')[0] || '').trim();
  var nameAlone = /^[A-Z][a-zA-Z]{1,20},?\s*$/.test(firstLine);
  var hasGreetingWord = /\b(hey|hi|hello|greetings)\b/i.test(firstLine);
  if (nameAlone && !hasGreetingWord) return { ok: false, flag: { type: 'cold_greeting', line: firstLine } };
  // His second named shape: the greeting word is there but it is lowercase, so it reads
  // typed rather than said. Same posture, an observation for the organ, never a verdict.
  if (hasGreetingWord && /^(hey|hi|hello|greetings)\b/.test(firstLine)) {
    return { ok: false, flag: { type: 'lowercase_greeting', line: firstLine } };
  }
  return { ok: true };
}

// Honest approximation, not a rhythm judgment -- see File A's original note.
function approximateChoppyDensity(content) {
  var sentences = content.split(/(?<=[.!?])\s+/).filter(function (s) { return s.trim().length > 0; });
  if (sentences.length < 3) return { ok: true, ratio: 0 };
  var subjectPattern = /\b(i|we|you|the|a|an|it|they|he|she)\b/i;
  var choppy = sentences.filter(function (s) {
    var words = s.trim().split(/\s+/);
    return words.length <= 4 && !subjectPattern.test(s);
  });
  var ratio = choppy.length / sentences.length;
  return { ok: ratio < 0.3, ratio: ratio, choppyCount: choppy.length, totalSentences: sentences.length };
}

/**
 * The unified, canonical WRIT check. ASYNC (the cook-off's winning call: File
 * B was already async, and async is the safe superset for every caller).
 * Return shape covers BOTH files' original fields so no existing caller
 * silently loses something it used to read.
 * @param {string} text
 * @param {object} [context]
 * @returns {Promise<{ok, verdict, content, cleaned, hardFails, advisoryFlags,
 *   emojis_removed, em_dashes_removed, meta_removed, jargon_flags}>}
 */
async function writCheck(text, context) {
  context = context || {};
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      ok: false, verdict: 'WRIT_HOLD', reason: 'No text provided. Supply a non-empty string.',
      content: text || '', cleaned: text || '', hardFails: [], advisoryFlags: [],
      emojis_removed: 0, em_dashes_removed: 0, meta_removed: 0, jargon_flags: []
    };
  }

  // ⬡B:board.writ:GUARD:fenced_code_is_not_prose:20260715⬡
  // Establish internal context before cleanup. Code fences bypass every prose
  // transform, and coding/internal CLI flags retain their literal ASCII `--`.
  var isInternal = isInternalContext(context);
  var originalText = text;
  var emoji = { cleaned: text, count: 0 };
  var dashCount = 0;
  var meta = { cleaned: text, removed: 0 };
  var cleaned = text;
  var lower = cleaned.toLowerCase();

  var hardFails = [];
  var advisoryFlags = [];
  // ⬡B:board.writ:FIX:internal_terms_allowed_for_internal_channels:20260715⬡
  // Coding/internal work must be able to name its own machinery. Determine that
  // context before the leak law; every other WRIT law remains active.

  // ⬡B:board.writ:FIX:verdict_is_an_organ_not_a_phrase_list:20260718⬡
  // Founder correction 20260718, A'NU agreed via the cycle door ("fix the mold
  // first"): cold code can HELP, never RESULT. WRIT used to DECIDE its HOLD
  // verdict by phrase-list matching (PROCESS_NARRATION, SUPER_BANS, CTA_ENDINGS,
  // coffee-shop, choppy) -- a semantic quality judgment made in cold code. That
  // is exactly what silenced her on real questions: a phrase list, not a mind,
  // ruled her words un-shippable.
  //
  // The split now honors the law:
  //  - MECHANICAL HELPERS stay cold, because they detect FACTS not judgments:
  //    an actual leaked secret (a real key literal), an actual internal-system
  //    term leaking to an external channel. Those are deterministic truths.
  //  - The QUALITY VERDICT (is this process narration, a weak CTA ending,
  //    jargon, choppy, off-voice) is now an LLM organ, like SHADOW already is.
  //    The old phrase lists survive only as HINTS handed to the organ, never as
  //    the decider.
  var mechanicalLeaks = [];
  // ⬡B:board.writ:FIX:filler_bans_are_render_hints_not_kills_20260718⬡ Founder
  // doctrine, A'NU agreed via cycle: banned AI-filler phrases (SUPER_BANS,
  // CTA_ENDINGS, banned headers) are FIXABLE STYLE, not leaks. They were
  // mechanical hard-fails that killed the whole answer -- so a build recap
  // containing "build together" got silenced. Now they are HINTS the render
  // organ strips, and the answer ships cleaned. Only a genuine secret leak (a
  // real key literal, another world's private data) stays a mechanical
  // hard-fail, because that is an unfixable fact, not taste.
  if (!isInternal) {
    mechanicalLeaks = mechanicalLeaks.concat(findPhrases(lower, INTERNAL_SYSTEM_TERMS, 'internal_system_leak'));
  }
  // hints for the organ (not verdicts)
  var _hintCTA = findPhrases(lower, CTA_ENDINGS, 'cta_ending');
  var _hintProc = findPhrases(lower, PROCESS_NARRATION, 'process_narration');
  var _hintBans = findPhrases(lower, SUPER_BANS, 'ai_filler');
  var _hintHeaders = checkBannedHeaders(cleaned);
  // ⬡B:board.writ:PEN:the_internal_name_wake_is_a_hint_you_may_overrule:20260815⬡
  // core/persona.js used to REPLACE an internal organ name found in her finished answer. That
  // word list also renamed the reader's own daughter, because it cannot tell NOVA the organ from
  // Nova the child, and it ran BEFORE this council, so the receipt vouched for the rename. The
  // detection now arrives here as a HINT, in the same shape as every other hint on this line,
  // and YOU decide by reading the sentence. survivingHints below then records what you kept.
  var _wakeNames = (context.internal_name_wake &&
    Array.isArray(context.internal_name_wake.hits))
    ? context.internal_name_wake.hits.slice(0, 8) : [];
  var _hintNames = _wakeNames.map(function (n) { return { type:'internal_name', phrase:n }; });
  // ⬡B:board.writ:FIX:the_clean_speech_wake_never_reached_the_prompt_it_named:20260816⬡
  // core/clean.speech.js#reviewCleanSpeech hands writCheck a `clean_speech_wake` flag and its
  // own comment says it is "named so the reviewer knows why she was woken and can weigh the
  // terms rather than obey them." Nothing in this file has ever read that key. Grepped: the
  // string appears in clean.speech.js, tool.loop.js, veer.director.js and two route files, and
  // in ZERO lines of board/writ/*. So the detector woke the reviewer, the reviewer was handed
  // the raw draft with no idea why, and CLEAN MOUTH was judged blind. A wake nobody reads is
  // the same defect as the internal-name forwarding line a critic proved could be deleted with
  // every test green, and it sat one screen away from where I fixed that one.
  //
  // Same shape as the name hint deliberately: HINTS, never verdicts. The terms come from a
  // closed wake list, not from her bytes, so naming them in the prompt leaks nothing of hers.
  var _wakeCurses = (context.clean_speech_wake &&
    Array.isArray(context.clean_speech_wake.hits))
    ? context.clean_speech_wake.hits.slice(0, 8) : [];
  var _hintCurses = _wakeCurses.map(function (t) { return { type:'clean_speech', phrase:t }; });
  var _greeting = checkColdGreeting(cleaned);
  var _hintGreeting = _greeting.ok ? null : _greeting.flag;
  var _rhythm = approximateChoppyDensity(cleaned);
  var _hintChoppy = _rhythm.ok ? null : _rhythm;
  var coffee = coffeeshopTest(cleaned);
  var _hintJargon = (!coffee.ok && !isInternal) ? coffee.flags.slice(0, 6) : [];

  var jargonPattern = /\b(BEAD|LOGFUL|abacia_core|acl_stamp|stamp_type)\b/g;
  var jargonFlags = Array.from(new Set(cleaned.match(jargonPattern) || []));

  // THE ORGAN: an LLM decides the quality verdict. Runs only when a mechanical
  // leak has not already hard-failed (a real secret leak is not a matter of
  // taste). Fails OPEN on any organ error, because a broken judge must never
  // silence her -- silence is worse than a rare soft ending slipping through.
  //
  // ⬡B:board.writ:FIX:render_not_kill_fixable_style_20260718⬡ Founder doctrine
  // "decides-vs-renders is the line": WRIT must RENDER, not KILL. Live receipts
  // proved the cycle generated a real 154-char answer, then WRIT held the WHOLE
  // thing because it opened with a "let me check" narration preamble -- silencing
  // her over fixable style. Now the organ REPAIRS fixable style (returns the
  // cleaned answer with the preamble/narration removed) and only truly HOLDs for
  // an unfixable violation. A held answer that can be fixed is fixed and shipped,
  // never killed.
  var qualityVerdict = 'WRIT_PASS';
  var organReason = null;
  var lawSource = null;
  var overruledHints = [];
  var organDecider = isInternal ? 'internal_bypass' : 'model_pending';
  var organFailedOpen = false;
  var semanticChanges = [];
  // The phrase hints the organ is handed, gathered once so the overrule receipt
  // is derived against exactly what the prompt named, never a second list.
  // ⬡B:board.writ:HEAL:the_name_overrule_was_first_out_of_a_capped_receipt:20260815⬡
  // A BLIND CRITIC BROKE MY OWN HEADLINE CLAIM. I wrote that a name WRIT chose to KEEP lands in
  // overruled_hints, so "the LLM decided, the regex did not" is PROVABLE rather than asserted.
  // survivingHints ends in .slice(0, 8), and _hintNames was concatenated LAST, so name overrules
  // were the first thing evicted. Measured on a long chatty answer carrying six real weak-ending
  // phrases and three real process-narration phrases plus "Your daughter Nova has a recital":
  //   overruled_hints -> eight filler phrases, and "nova" NOWHERE on the receipt
  // WRIT kept the daughter's name and the receipt did not say so. The claim held only on short
  // answers, and her normal register is not short.
  // Names go FIRST now. If a cap has to drop something, it drops a filler phrase whose absence
  // costs an audit nothing, never the one hint that proves a mind made the call.
  var _hintsForReceipt = []
    .concat(_hintNames, _hintCurses, _hintCTA, _hintProc, _hintBans, _hintHeaders || []);
  if (!isInternal) {
    try {
      var _ladder = require('../../core/model.ladder.js');
      // \u2b21B:board.writ:BUILD:the_organ_judges_against_the_whole_law_not_a_summary:20260728\u2b21
      // Spec gap 5. This prompt used to carry a hand-written paragraph holding
      // roughly a fifth of the actual WRIT law: it named process narration and
      // weak endings and nothing else. The kill list, the super bans, the
      // behavioral rules, the green lights and the risk posture existed only in
      // a Claude-side skill document that does not run inside her system, so
      // the organ was judging her words against a summary while the real law
      // sat somewhere it could not read. One source now: board/writ/writ.law.js,
      // brain-superseded (doctrine.writ.persona.v1) with the embedded floor.
      var _lawMod = require('./writ.law.js');
      var _law = await _lawMod.writLaw(context.hamUid);
      lawSource = _law.source;
      var _sys = 'You are A\u2019NU editing your own words before they leave the house. WRIT is the role, not your name. '
        + 'Your job is to RENDER, not to kill. Fix the writing to obey the law below and return the FIXED text.\n\n'
        + _law.text + '\n\n'
        + 'These are HINTS from a rough pre-scan, they may be wrong, use judgment: '
        + 'possible process-narration=' + JSON.stringify(_hintProc.map(function(f){return f.phrase||f;}).slice(0,4)) + ', '
        + 'possible weak-ending=' + JSON.stringify(_hintCTA.map(function(f){return f.phrase||f;}).slice(0,4)) + ', '
        + 'possible AI-filler to remove=' + JSON.stringify(_hintBans.map(function(f){return f.phrase||f;}).slice(0,6)) + ', '
        + 'possible banned headers to remove=' + JSON.stringify((_hintHeaders||[]).map(function(f){return f.phrase||f;}).slice(0,4)) + ', '
        + 'possible cold or lowercase greeting=' + JSON.stringify(_hintGreeting ? { kind:_hintGreeting.type, first_line:String(_hintGreeting.line||'').slice(0,80) } : null) + ', '
        + 'possible short punchy rhythm=' + JSON.stringify(_hintChoppy ? { ratio:Number(_hintChoppy.ratio.toFixed(2)), short_sentences:_hintChoppy.choppyCount, of:_hintChoppy.totalSentences } : null) + '. '
        + 'On the greeting hint: he opens warm and by name, Hey Will, not a bare Will, and not a lowercase hey will. Judge whether this reader and this channel want that; it is a relationship call, not a rule. '
        + 'On the rhythm hint: short mean punchy direct sentences are not his voice, he talks in flowing comma prose. Only smooth it if it actually reads clipped. '
        + 'possible internal organ name in her mouth=' + JSON.stringify(_wakeNames) + '. '
        + 'On the internal-name hint: there is one voice, so an internal organ, adviser or coder name never appears in something she said, as if a second assistant were speaking. '
        + 'That list is a raw word match and it cannot tell an organ from a person. Several of those words are ordinary human first names, and saying who called, who texted, or whose recital is on Friday is the whole job. '
        + 'Read the sentence. If the word is a person in this reader\'s life, leave it exactly as it is. Rewrite only if the draft is genuinely handing a reader an internal name. '
        + 'possible unclean speech in her mouth=' + JSON.stringify(_wakeCurses) + '. '
        + 'On the unclean-speech hint: CLEAN MOUTH above is the founder floor and it is yours to apply, and it is not this word list that applies it. '
        + 'That list is a raw word match with no idea who the word is aimed at. A quoted title, a place name, a word inside something the reader themselves said, or heat aimed at a situation rather than at the person is yours to keep. '
        + 'Rewrite only if the draft aims a curse at the reader or at the founder, and when you do keep the full meaning and heat of the sentence rather than gutting the point to sanitize it. '
        + 'Reply with ONLY the corrected answer text, nothing else. If the text already obeys every law, return it unchanged. '
        + 'Return the single word HOLD only if the text cannot be fixed because it leaks a real secret or another world\'s private data.';
      var _deliberate = typeof context.deliberate === 'function' ? context.deliberate : _ladder.deliberate;
      var _out = await _deliberate(_sys, originalText, { maxTokens: 800, temperature: 0 });
      var _txt = String((_out && (_out.text || _out.answer || _out.content)) || '').trim();
      if (/^HOLD\s*$/i.test(_txt)) {
        organDecider = 'model';
        // genuinely unfixable (real leak) -> hold
        qualityVerdict = 'WRIT_HOLD';
        organReason = 'unfixable_leak';
        hardFails.push({ type: 'quality_hold', reason: organReason });
      } else if (_txt) {
        organDecider = 'model';
        // ⬡B:board.writ:BUILD:the_overrule_is_on_the_record:20260728⬡
        // Spec gap 8: "every organ decision that overrules a cold flag gets
        // stamped into the stage receipt, so 'the LLM decided' is provable, not
        // asserted." Derived cold and deterministically instead of asking the
        // organ to append a marker, because a marker the parser misses becomes
        // stray bytes inside her answer, and this is a hot path. A hint phrase
        // the organ was explicitly handed, that is still present in the text it
        // chose to return, was overruled. That is a fact, not a guess, and it
        // needs no cooperation from the model to be true.
        overruledHints = survivingHints(_hintsForReceipt, _txt);
        // The WRIT Wonder owns this expression candidate. Cold word overlap,
        // length, and regex witnesses do not decide whether its meaning survived.
        // Penny SHADOW compares the exact source and final chain before release.
        cleaned = _txt;
        qualityVerdict = 'WRIT_PASS';
      } else {
        organDecider = 'model_unavailable';
        organFailedOpen = true;
        qualityVerdict = mechanicalLeaks.length ? 'WRIT_UNAVAILABLE_HOLD' : 'WRIT_UNAVAILABLE';
        if (mechanicalLeaks.length) hardFails = hardFails.concat(mechanicalLeaks);
      }
    } catch (eOrgan) {
      organDecider = 'model_unavailable';
      organFailedOpen = true;
      qualityVerdict = mechanicalLeaks.length ? 'WRIT_UNAVAILABLE_HOLD' : 'WRIT_UNAVAILABLE';
      if (mechanicalLeaks.length) hardFails = hardFails.concat(mechanicalLeaks);
    }
  }

  // WRIT owns the rendered bytes. Cold transport does not get a second editing
  // pass after the model has spoken because whitespace, punctuation, flags,
  // URLs, emoji, identifiers, and code can all carry meaning. Downstream Penny
  // SHADOW receives these exact bytes and owns the final meaning challenge.
  emoji.count = Math.max(0,(originalText.match(
    /(\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{1F1E6}-\u{1F1FF}])/gu)||[]).length-
    (cleaned.match(/(\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{1F1E6}-\u{1F1FF}])/gu)||[]).length);
  dashCount = Math.max(0,(originalText.match(/\u2014/g)||[]).length-
    (cleaned.match(/\u2014/g)||[]).length);

  advisoryFlags = advisoryFlags.concat(_hintJargon.map(function (f) { return { type: 'jargon_leak', phrase: f }; }));
  // ⬡B:board.writ:AUDIT:a_wake_no_mind_could_judge_says_so_on_the_receipt:20260815⬡
  // The organ fails OPEN when it is unreachable, which is correct: a broken judge must never
  // silence her. But that means a genuine internal name CAN ship on that branch, which is the
  // founder's original 20260726 complaint reappearing. So the unjudged fact rides the receipt
  // instead of vanishing, and the complaint stays auditable rather than being quietly
  // reintroduced. It is a flag, not a hold: nothing here stops her.
  if (_hintNames.length && organFailedOpen) {
    advisoryFlags = advisoryFlags.concat(_hintNames.map(function (f) {
      return { type: 'internal_name_unjudged', phrase: f.phrase };
    }));
  }

  var verdict = hardFails.length > 0 ? qualityVerdict :
    (qualityVerdict === 'WRIT_UNAVAILABLE' ? qualityVerdict :
      (advisoryFlags.length > 0 ? 'WRIT_ADVISORY' : qualityVerdict));

  return {
    ok: hardFails.length === 0,
    verdict: verdict,
    content: cleaned,
    cleaned: cleaned,
    hardFails: hardFails,
    advisoryFlags: advisoryFlags,
    organ_reason: organReason,
    why_changed: cleaned === originalText ? 'The original wording was preserved.' : 'WRIT adjusted presentation while preserving the draft facts.',
    semantic_changes: semanticChanges,
    semantic_verdict: semanticChanges.length ? 'REVISE' : 'PASS',
    organ_decider: organDecider,
    failed_open: organFailedOpen,
    // Which law actually judged these words, 'brain' or 'embedded', null when
    // the organ did not run. A receipt that cannot name its own law is not a
    // receipt, and this is how a supersede from the brain becomes provable.
    law_source: lawSource,
    // ⬡B:board.writ:BUILD:overrule_receipt_surfaced:20260728⬡ Spec gap 8. The
    // cold hints the organ was handed and kept anyway: proof the mind decided.
    overruled_hints: overruledHints,
    // The observations the organ was handed, surfaced so a caller can see them
    // without re-deriving. Additive: they are HINTS, they never move the verdict.
    voiceHints: { greeting: _hintGreeting, rhythm: _hintChoppy,
      cta: _hintCTA, process_narration: _hintProc, filler: _hintBans, headers: _hintHeaders },
    emojis_removed: emoji.count,
    em_dashes_removed: dashCount,
    meta_removed: meta.removed,
    jargon_flags: jargonFlags
  };
}

// ⬡B:board.writ:BUILD:writ_names_its_own_hold_once_for_every_consumer:20260725⬡
// WRIT holds without ever setting `reason` on the hard-fail path, so every consumer has had
// to reconstruct the named cause out of hardFails by hand. Two of them did it differently:
// core/pai.outbound.council.js defaultWritStage rebuilds 'WRIT_HOLD:internal_system_leak',
// while core/council.js writ() reads result.reason (always undefined here) and falls back to
// the bare word 'writ_hold', dropping the cause on the floor. A downstream gate that reads
// the cause to decide whether a re-run can win therefore sees nothing through that second
// door and grants a retry that is terminal. Two hand-maintained copies of one law is the
// thing the standing laws forbid, so the producer names its own hold, once, here.
// Returns bounded machine codes only, deduped, capped, never answer bytes.
function writHoldCauses(result) {
  var fails = (result && Array.isArray(result.hardFails)) ? result.hardFails : [];
  var codes = fails
    .map(function (f) { return String((f && (f.type || f.reason)) || '').trim().toLowerCase(); })
    .filter(function (code) { return /^[a-z][a-z0-9_.-]{0,47}$/.test(code); });
  return codes.filter(function (code, index) { return codes.indexOf(code) === index; }).slice(0, 2);
}

// ⬡B:board.writ:BUILD:the_post_draft_verdict_finally_gets_banked:20260802⬡
// W4-L4's receipt is "one draft carrying WRIT's LLM verdict bead PRE and POST". The pre half
// landed in core/prose.quality.js#writProse. This is the post half, and it exists because
// writCheck has always RETURNED a verdict and never RECORDED one: every ruling it has ever
// made died in the caller's local variable. That is the exact shape RULINGS keeps catching,
// a roadmap receipt naming a bead being read as a promise about what gets CALLED when it is
// a promise about what gets BANKED.
//
// ONE SOURCE, DELIBERATELY. This does not grow a second banker beside writProse; it calls it.
// The verdict banked is the exact verdict writCheck already reached. The old wrapper asked a
// second model to judge the same draft again, which could bank a different ruling and charged
// for two minds where the council had only one seat. The injected judge below only carries the
// existing verdict into the one banker. It makes no new judgment and spends no second model call.
//
// BEST EFFORT ON PURPOSE. A failed bank returns a named reason and NEVER converts into a
// passing grade or blocks a real answer, matching bankVerdict in agents/meta_commentary.js.
// Cold code may fail to write; it may not decide the writing was fine because it did.
async function writCheckAndBank(hamUid, text, context, options) {
  var opts = options || {};
  var result = await writCheck(text, context);
  var writ = opts.writProse || require('../../core/prose.quality.js').writProse;
  function code(value, fallback) {
    var normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 48);
    return normalized || fallback;
  }
  function flagCodes(entries, fallback) {
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      return code(entry && (entry.type || entry.reason || entry.phrase) || entry, fallback);
    }).filter(Boolean);
  }
  var flags = [];
  flagCodes(result && result.hardFails, 'hard_fail').forEach(function (value) {
    flags.push({ type: 'hard_fail', code: value });
  });
  flagCodes(result && result.advisoryFlags, 'advisory').forEach(function (value) {
    flags.push({ type: 'advisory', code: value });
  });
  flagCodes(result && result.overruled_hints, 'overruled_hint').forEach(function (value) {
    flags.push({ type: 'overruled_hint', code: value });
  });
  if (result && result.failed_open) flags.push({ type: 'failed_open', code: 'model_unavailable' });
  flags = flags.slice(0, 16);

  var exactOutput = result && typeof result.cleaned === 'string' ? result.cleaned : text;
  var exactVerdict = {
    stage: 'post_draft',
    passes: !!(result && result.ok === true),
    state: result && result.failed_open ? 'unavailable' :
      (result && result.ok === true ? 'completed' : 'held'),
    reasoning: [
      code(result && result.verdict, 'writ_verdict_unavailable'),
      code(result && result.organ_decider, 'decider_unavailable'),
      code(result && result.organ_reason, '')
    ].filter(Boolean).join(':').slice(0, 160),
    flags: flags,
    why_changed: result && result.why_changed || null,
    output_digest: crypto.createHash('sha256').update(String(exactOutput), 'utf8').digest('hex'),
    output_bytes: Buffer.byteLength(String(exactOutput), 'utf8')
  };
  var banked;
  try {
    banked = await writ(hamUid, 'post_draft',
      exactOutput,
      Object.assign({}, opts, { judgeProse: async function () { return exactVerdict; } }));
  } catch (error) {
    banked = { ok: false, reason: 'writ_bank_threw' };
  }
  return { ok: result && result.ok === true, check: result, bank: banked || { ok: false, reason: 'writ_bank_unavailable' } };
}

module.exports = { writCheck: writCheck, writCheckAndBank: writCheckAndBank,
  removeEmDash: removeEmDash, coffeeshopTest: coffeeshopTest,
  writHoldCauses: writHoldCauses,
  checkColdGreeting: checkColdGreeting, approximateChoppyDensity: approximateChoppyDensity,
  applyVoiceLaw: applyVoiceLaw, stripEmoji: stripEmoji, BANNED_WORDS: BANNED_WORDS,
  SUPER_BANS: SUPER_BANS, CTA_ENDINGS: CTA_ENDINGS, BANNED_HEADERS: BANNED_HEADERS,
  preservesSemanticAnchors: preservesSemanticAnchors, semanticAnchorReport: semanticAnchorReport,
  survivingHints: survivingHints };
