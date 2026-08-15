// ⬡B:core.clean_speech:DETECTOR:cold_detects_and_wakes_the_mind_decides:20260814⬡
// ⬡B:core.clean_speech:SUPERSEDES:she_never_curses_anywhere_in_the_ecosystem:20260719⬡
//
// CONVERTED 20260814 on founder authority, from a cold rewriter into a detector.
//
// What this file used to be: fifteen regular expressions that silently substituted
// words inside her finished sentence at eight call sites. Her mouth was edited by a
// word list she never saw, on every channel that imported it, with no record that it
// had happened and no mind involved in the decision.
//
// Why that had to end (docs/RULINGS.md 20260808, founder 911, verbatim intent):
// "you TELL her, you do not CODE her." Her behavior is governed by INSTRUCTION she
// reads and verified by a woken reviewer that ensures she followed. Cold code may
// DETECT and WAKE. It may never DECIDE or rewrite her mouth. The same ruling names
// this exact file as "a detector to convert, not the control."
//
// The founder law itself is unchanged and is not weakened by this conversion: she
// never curses at the person, and never at the founder. That law now lives where the
// ruling says it belongs, in two places that both involve a mind:
//   1. her generation floor, core/persona.js#VOICE, superseded by her own
//      PERSONA-stamped brain lines through livingVoice(); and
//   2. the post-write reviewer, board/writ/writ.law.js BEHAVIORAL_RULES[0] CLEAN
//      MOUTH, which carries the law as instruction and closes with the reason this
//      file exists in its new shape: "enforced by your judgment, never by a cold
//      filter on her words."
//
// So: detectUncleanSpeech() looks and reports. reviewCleanSpeech() wakes the reviewer
// that already holds the law and hands the DECISION to her. Neither one edits a
// sentence on its own authority. When the reviewer cannot run, this file returns her
// original words together with the flag and refuses to guess, because a silent cold
// swap is the precise defect being removed and re-adding it in a fallback branch would
// only move it one indirection deeper.
//
// The term list below is a WAKE LIST, not a filter. It decides nothing. Its only job
// is to answer "is it worth spending a reviewer call on this line," and it is
// deliberately over-eager: a false positive costs one cheap review, a false negative
// costs nothing that the reviewer would not have caught anyway on the drafts that do
// run through her council. Judgment about quoted titles, place names, profanity aimed
// at a situation rather than a person, and heat that belongs in the sentence is the
// reviewer's, explicitly, per CLEAN MOUTH.
'use strict';

// Wake terms only. Never a substitution table. There is no replacement column here
// on purpose: nothing in this file may know what a "corrected" sentence looks like.
var WAKE_TERMS = [
  /\bshit(?:ty|s)?\b/gi,
  /\bbullshit\b/gi,
  /\bfuck(?:ing|ed|er|ers|s)?\b/gi,
  /\bmotherfucker(?:s)?\b/gi,
  /\bass(?:hole|holes)\b/gi,
  /\bbitch(?:es|ing)?\b/gi,
  /\bdamn(?:ed|it)?\b/gi,
  /\bgoddamn(?:ed|it)?\b/gi,
  /\bhell\b(?!o)/gi,
  /\bpiss(?:ed|es|ing)?\b/gi,
  /\bcrap(?:py)?\b/gi,
  /\bdick(?:head|heads|s)?\b/gi,
  /\bbastard(?:s)?\b/gi,
  /\bcunt(?:s)?\b/gi,
  /\bprick(?:s)?\b/gi
];

// DETECT. Pure. Returns what was seen and nothing else. No mutation, no verdict,
// no opinion about whether the line should change. `hits` carries the matched terms
// so the woken reviewer and the durable record both see exactly what tripped the
// wake, rather than a bare boolean nobody can audit later.
function detectUncleanSpeech(text) {
  if (typeof text !== 'string' || !text) {
    return { clean: true, hits: [], count: 0, scanned: false };
  }
  var hits = [];
  for (var i = 0; i < WAKE_TERMS.length; i++) {
    var re = new RegExp(WAKE_TERMS[i].source, WAKE_TERMS[i].flags);
    var m;
    while ((m = re.exec(text)) !== null) {
      hits.push(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++;
      if (hits.length >= 32) break; // bounded: this is a wake signal, not a census
    }
    if (hits.length >= 32) break;
  }
  return { clean: hits.length === 0, hits: hits, count: hits.length, scanned: true };
}

// The flag record cold code is allowed to produce: the fact that a wake fired, the
// terms that fired it, and where. It carries no judgment and no rewritten text, so it
// is safe to stamp into the durable record and hand into the reviewer's context.
function cleanSpeechFlag(text, context) {
  var d = detectUncleanSpeech(text);
  var ctx = context || {};
  return {
    flag: 'clean_speech_wake',
    fired: !d.clean,
    hits: d.hits,
    count: d.count,
    surface: ctx.surface || null,
    channel: ctx.channel || null,
    ham_uid: ctx.hamUid || null,
    decided_by: 'pending_reviewer',
    acl_stamp: '⬡B:core.clean_speech:FLAG:wake_only_no_decision:20260814⬡'
  };
}

// WAKE. Detects, and when the wake fires, hands the whole line to the reviewer that
// already carries CLEAN MOUTH as instruction. The reviewer decides. This function
// never edits a sentence itself on any branch, including the failure branches.
//
// Returns, always:
//   { ok, text, flagged, hits, woke, reason }
// `text` is her words on every path. On ok:true after a wake it is the reviewer's
// rendering of her words; on ok:false it is her original, untouched, with the flag
// attached so the caller records rather than guesses.
async function reviewCleanSpeech(text, context) {
  var ctx = context || {};
  var detected = detectUncleanSpeech(text);

  // Clean line: no wake, no reviewer call, no cost. The overwhelmingly common path.
  if (detected.clean) {
    return { ok: true, text: text, flagged: false, hits: [], woke: false, reason: null };
  }

  var flag = cleanSpeechFlag(text, ctx);

  var writ;
  try {
    writ = require('../board/writ/writ.js');
  } catch (e) {
    return { ok: false, text: text, flagged: true, hits: detected.hits, woke: false,
      reason: 'clean_speech_reviewer_unreachable', flag: flag };
  }
  if (!writ || typeof writ.writCheck !== 'function') {
    return { ok: false, text: text, flagged: true, hits: detected.hits, woke: false,
      reason: 'clean_speech_reviewer_unreachable', flag: flag };
  }

  var verdict;
  try {
    verdict = await writ.writCheck(text, {
      channel: ctx.channel || 'portal',
      surface: ctx.surface || null,
      hamUid: ctx.hamUid || null,
      deliberate: ctx.deliberate,
      // Named so the reviewer knows why she was woken and can weigh the terms
      // rather than obey them. CLEAN MOUTH already tells her what to do with this.
      clean_speech_wake: flag
    });
  } catch (e) {
    return { ok: false, text: text, flagged: true, hits: detected.hits, woke: true,
      reason: 'clean_speech_review_threw', flag: flag };
  }

  // The reviewer answered and rendered. Her judgment stands, including the judgment
  // that a term should remain because it was aimed at a situation and not a person.
  if (verdict && verdict.ok === true && typeof verdict.content === 'string' && verdict.content.trim()) {
    flag.decided_by = 'writ';
    return { ok: true, text: verdict.content, flagged: true, hits: detected.hits,
      woke: true, reason: null, flag: flag };
  }

  // The reviewer ran and declined to render. Her words survive, the flag is returned,
  // and the caller decides what its own surface does. Cold code does not fill this in.
  return { ok: false, text: text, flagged: true, hits: detected.hits, woke: true,
    reason: 'clean_speech_review_no_render', flag: flag };
}

// ONE SOURCE for the sentence cold code is allowed to carry. Both the pre-write council
// and the tool loop's ineligible path read this, so the wording cannot drift between the
// channel that buys the paid briefs and the channel that does not. Zero model calls: this
// is a string and a boolean, which is why it is safe to run outside the eligibility gate
// that exists to avoid paid pre-write passes.
function cleanSpeechWakeBlock(text, context) {
  var flag = cleanSpeechFlag(text, context);
  if (!flag.fired) return { fired: false, flag: flag, block: '' };
  return {
    fired: true,
    flag: flag,
    block: 'CLEAN SPEECH WAKE (fact carried by cold code, no judgment attached): the '
      + 'inbound contains profanity. The standing floor is that she never curses at the '
      + 'person and never at the founder, no matter how they speak to her. How that is '
      + 'carried here is hers to decide; heat aimed at a situation is not heat aimed at a '
      + 'person, and sanitizing the warmth out of a true answer is its own failure.'
  };
}

// The durable receipt line the cycle record carries when a wake fires. Split out of the
// tool loop so it is a pure function with a real behavioral test, rather than a string
// built inline where the only possible check is a grep. This estate has a ruling that a
// test which greps for the fix is not a test of the fix; that ruling applies to my own
// work here, so the content of the receipt is proved by calling it.
function cleanSpeechWakeReceipt(flag, carriedBy) {
  var f = flag || {};
  return 'fired terms:' + (f.count || 0)
    + ' surface:' + (f.surface || 'unknown')
    + ' carried_by:' + (carriedBy || 'unknown')
    + ' decided_by:' + (f.decided_by || 'unknown');
}

module.exports = {
  detectUncleanSpeech: detectUncleanSpeech,
  cleanSpeechWakeBlock: cleanSpeechWakeBlock,
  cleanSpeechWakeReceipt: cleanSpeechWakeReceipt,
  cleanSpeechFlag: cleanSpeechFlag,
  reviewCleanSpeech: reviewCleanSpeech
};
