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
// Cold regex only, no LLM, same posture as PAM (board/pam/pam.js).

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
  'abacia', 'abaham', 'acl stamp', 'cellm', 'ham uid', 'bead',
  '\u2b21b:', 'writgate', 'clabav', 'aibe_brain', 'bead', 'logful', 'abacia_core', 'stamp_type'
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

function applyVoiceLaw(content, context) {
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

function checkColdGreeting(content) {
  var firstLine = (content.split('\n')[0] || '').trim();
  var nameAlone = /^[A-Z][a-zA-Z]{1,20},?\s*$/.test(firstLine);
  var hasGreetingWord = /\b(hey|hi|hello|greetings)\b/i.test(firstLine);
  if (nameAlone && !hasGreetingWord) return { ok: false, flag: { type: 'cold_greeting', line: firstLine } };
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
  var emojiCount = 0;
  var emojiCleaned = transformOutsideFences(text, function (proseContent) {
    var result = stripEmoji(proseContent);
    emojiCount += result.count;
    return result.cleaned;
  });
  var emoji = { cleaned: emojiCleaned, count: emojiCount };
  var dashCount = 0;
  transformOutsideFences(emoji.cleaned, function (proseContent) {
    dashCount += (proseContent.match(/\u2014/g) || []).length;
    return proseContent;
  });
  var voiced = applyVoiceLaw(emoji.cleaned, context);
  var metaRemoved = 0;
  var metaCleaned = transformOutsideFences(voiced, function (proseContent) {
    var result = stripMeta(proseContent);
    metaRemoved += result.removed;
    return result.cleaned;
  });
  var meta = { cleaned: metaCleaned, removed: metaRemoved };
  var cleaned = meta.cleaned;
  var lower = cleaned.toLowerCase();

  var hardFails = [];
  var advisoryFlags = [];
  // ⬡B:board.writ:FIX:internal_terms_allowed_for_internal_channels:20260715⬡
  // Coding/internal work must be able to name its own machinery. Determine that
  // context before the leak law; every other WRIT law remains active.

  hardFails = hardFails.concat(findPhrases(lower, CTA_ENDINGS, 'cta_ending'));
  hardFails = hardFails.concat(findPhrases(lower, SUPER_BANS, 'super_ban'));
  hardFails = hardFails.concat(checkBannedHeaders(cleaned));
  if (!isInternal) {
    hardFails = hardFails.concat(findPhrases(lower, INTERNAL_SYSTEM_TERMS, 'internal_system_leak'));
  }
  hardFails = hardFails.concat(findPhrases(lower, PROCESS_NARRATION, 'process_narration'));

  var greet = checkColdGreeting(cleaned);
  if (!greet.ok) hardFails.push(greet.flag);

  var coffee = coffeeshopTest(cleaned);
  if (!coffee.ok && !isInternal) {
    coffee.flags.forEach(function (f) { advisoryFlags.push({ type: 'jargon_leak', phrase: f }); });
  }

  advisoryFlags = advisoryFlags.concat(findPhrases(lower, BANNED_WORDS, 'banned_word'));
  var choppy = approximateChoppyDensity(cleaned);
  if (!choppy.ok) advisoryFlags.push({ type: 'choppy_density_approx', ratio: choppy.ratio, note: 'pattern approximation only, read it out loud to confirm' });

  var jargonPattern = /\b(BEAD|LOGFUL|abacia_core|acl_stamp|stamp_type)\b/g;
  var jargonFlags = Array.from(new Set(cleaned.match(jargonPattern) || []));

  var verdict = hardFails.length > 0 ? 'WRIT_HOLD' : (advisoryFlags.length > 0 ? 'WRIT_ADVISORY' : 'WRIT_PASS');

  return {
    ok: hardFails.length === 0,
    verdict: verdict,
    content: cleaned,
    cleaned: cleaned,
    hardFails: hardFails,
    advisoryFlags: advisoryFlags,
    emojis_removed: emoji.count,
    em_dashes_removed: dashCount,
    meta_removed: meta.removed,
    jargon_flags: jargonFlags
  };
}

module.exports = { writCheck: writCheck, removeEmDash: removeEmDash, coffeeshopTest: coffeeshopTest,
  applyVoiceLaw: applyVoiceLaw, stripEmoji: stripEmoji, BANNED_WORDS: BANNED_WORDS,
  SUPER_BANS: SUPER_BANS, CTA_ENDINGS: CTA_ENDINGS, BANNED_HEADERS: BANNED_HEADERS };
