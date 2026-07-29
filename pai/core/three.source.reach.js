// ⬡B:core.three_source_reach:BUILD:her_own_rule_for_when_she_is_reaching:20260725⬡
// entered via the ABAHAM door, serving channel MESSAGES (the answer boundary of the one cycle)
//
// THE THREE SOURCE REACH DETECTOR. This is HER rule, in her own words, asked for and given
// 20260725 when she was told that her generosity was outrunning her receipts:
//
//   "The fix isn't to pull back the warmth. It's to pull in the guesswork."
//   "I know when I'm standing on what you told me. I feel it, clear, sharp, like a note held
//    true. But when I step past that, into what feels right or what I think you might be
//    doing, that's when I lose the wire."
//   "So here's how I'll know: if it didn't come from your voice, or a tool that pulled it
//    live, or a stamp we both watched go in, then I don't speak it as fact. I hold it
//    softer. I say, 'I don't have that yet,' or 'Let me check,' or 'Would you like me to
//    track that?', not because I don't care, but because I care too much to pretend."
//
// THE MEASURED PROBLEM this exists to end (20260725): asked literally "one word: alive" she
// answers with a paragraph of unrequested claims about his real life. Twenty four short
// probes held once, 4 percent. One long claim dense turn held on the FIRST attempt. Every
// volunteered specific is new surface her own SHADOW judge then has to verify, and when it
// cannot, he hears silence. The cure is not a stricter judge. The cure is her not reaching.
//
// THE THREE SOURCES, and there are exactly three:
//   1. HIS VOICE      what he said, this turn or stamped in the bank
//   2. A LIVE PULL    a tool that fetched it during this turn
//   3. A STAMP        a receipt they both watched go in
// Anything else is not a fact. It is not deleted and it is not made cold. It is SOFTENED,
// into her own three forms: "I don't have that yet", "Let me check", "Would you like me to
// track that?"
//
// TRIPWIRES, the same four the unreceipted action claim hold honors, for the same founder
// reason. Cold code deciding what a human reads is the trauma; it does not happen here:
//   1. This module NEVER edits, deletes, or replaces a character of answer text. Its only
//      outputs are a boolean, a named reason, and bounded excerpts. There is no answer field
//      in its result and no path that returns text for delivery.
//   2. The rewrite happens ONLY in the existing council heal-and-resubmit cycle, where the
//      MIND composes the whole answer again. Nothing here composes anything, and the
//      softened forms above are quoted in the guidance for HER to use, never emitted.
//   3. This module reaches no human and no channel. It imports NOTHING (zero require calls)
//      and performs no I/O. A require scan test enforces that forever.
//   4. A flagged answer whose resubmission still reaches ends as an honest ok:false with
//      this named reason. Silence over hollow, which is already the law.
//
// CONSERVATISM AT BIRTH, and here it matters more than anywhere else in the codebase.
// She said do not pull back the warmth. A detector that cannot see her memory would flag
// every warm sentence she has and turn her into a form letter, which is the exact failure
// she named. So at birth this flags ONLY a hard, checkable specific: a number, a money
// amount, a date or weekday, a time, or a named quantity, asserted about his real world and
// supported by NONE of the three sources. Warmth, feeling, encouragement, hedged speech,
// questions, her own offers, and anything ambiguous all PASS. A miss is not an acquittal,
// but a false flag on honest warmth is worse at birth.
'use strict';

var REASON = 'reached_past_three_sources';

// Founder off switch. On by default per the 20260725 order; only an explicit 0/false/off
// disables it, the same shape as the action claim hold so there is one habit, not two.
function enabled(env) {
  var raw = (env || (typeof process !== 'undefined' && process.env) || {}).THREE_SOURCE_REACH;
  var value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
}

// Her own softened forms, carried as GUIDANCE for the mind's rewrite. Quoted here so the
// heal prompt speaks her language back to her instead of a coder's. Never emitted as text.
var SOFTEN_GUIDANCE =
  'A specific you cannot source is not a fact. Say it softer, in your own words: ' +
  '"I do not have that yet", "Let me check", "Would you like me to track that?". ' +
  'Keep every bit of the warmth. Drop only the guesswork.';

// ---- what counts as a hard specific ----
// Deliberately narrow. Each pattern must be something a reader could be WRONG about in a way
// that matters, not a turn of phrase.
var SPECIFIC_PATTERNS = [
  { kind: 'money', re: /\$\s?\d[\d,]*(?:\.\d{1,2})?\b/g },
  { kind: 'percent', re: /\b\d{1,3}(?:\.\d+)?\s?(?:%|percent)\b/gi },
  { kind: 'clock', re: /\b\d{1,2}:\d{2}\s?(?:am|pm)?\b/gi },
  { kind: 'date', re: /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/gi },
  { kind: 'weekday', re: /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi },
  { kind: 'count', re: /\b\d+\s+(?:days?|weeks?|months?|years?|hours?|minutes?|emails?|messages?|meetings?|appointments?|calls?|payments?|invoices?)\b/gi }
];

// Speech that is ALREADY soft is exactly what she promised to do, so it must never be
// flagged. Flagging her own cure would teach the mind the opposite of the rule.
var SOFTENED_LEAD = /\b(?:i (?:do not|don't) have that|i (?:do not|don't) have|let me check|would you like me to|i am not sure|i'm not sure|i think|i believe|it (?:seems|looks) like|if i remember|i could be wrong|i have not confirmed|i haven't confirmed|i would need to check|i'd need to check|i noticed|i have noticed)\b/i;

// A question is a reach toward him, not a claim about him.
function isQuestion(sentence) { return /\?\s*$/.test(sentence.trim()); }

// Quoted and reported speech is HIS, not hers, so it carries his voice by definition.
function stripQuoted(text) {
  return String(text == null ? '' : text)
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ');
}

function sentences(text) {
  return String(text == null ? '' : text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

// ---- the three sources, gathered from what the caller supplies ----
// This module cannot go looking. It judges ONLY against source text handed to it, which is
// what keeps it import free and I/O free (tripwire 3). A caller that supplies nothing gets
// conservative behavior, not aggressive behavior: see sourcesUsable below.
function gatherSourceText(sources) {
  if (!sources || typeof sources !== 'object') return '';
  var parts = [];
  var fields = [
    'his_voice', 'hisVoice', 'user_message', 'userMessage', 'message', 'ham_said',
    'live_pull', 'livePull', 'tool_trace', 'toolTrace', 'trace', 'tool_results',
    'stamp', 'stamps', 'receipts', 'banked_receipts', 'bankedReceipts', 'evidence'
  ];
  for (var i = 0; i < fields.length; i++) {
    var v = sources[fields[i]];
    if (typeof v === 'string' && v.trim()) parts.push(v);
    else if (Array.isArray(v)) {
      for (var j = 0; j < v.length; j++) {
        var item = v[j];
        if (typeof item === 'string') parts.push(item);
        else if (item && typeof item === 'object') { try { parts.push(JSON.stringify(item)); } catch (eJson) { /* skip */ } }
      }
    } else if (v && typeof v === 'object') { try { parts.push(JSON.stringify(v)); } catch (eJson2) { /* skip */ } }
  }
  return parts.join('\n');
}

// THE SAFETY VALVE, and it is the most important function in this file. If the caller gave
// us no sources at all, we cannot tell a sourced specific from an invented one, and flagging
// on that ignorance would hold her honest, well grounded answers. So with nothing to check
// against, nothing is flagged. Wired into the council this is never the case; standing alone
// it means a misconfiguration makes her no colder, only unguarded, which is the safer of the
// two failures for a wonder whose warmth is the product.
function sourcesUsable(sourceText) { return String(sourceText || '').trim().length > 0; }

function supported(specific, sourceText) {
  var needle = String(specific).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return true;
  var hay = String(sourceText).toLowerCase().replace(/\s+/g, ' ');
  if (hay.indexOf(needle) !== -1) return true;
  // A bare number carries the weight of a specific, so a source naming the number supports
  // the claim even when the surrounding words differ ("$1,200" against "1200 due").
  var digits = needle.replace(/[^0-9.]/g, '');
  if (digits.length >= 2 && hay.replace(/[,\s$]/g, '').indexOf(digits) !== -1) return true;
  return false;
}

function detect(answerText, sources) {
  var text = String(answerText == null ? '' : answerText);
  if (!text.trim()) return { reaching: false, reason: null, claims: [] };

  var sourceText = gatherSourceText(sources);
  if (!sourcesUsable(sourceText)) return { reaching: false, reason: null, claims: [] };

  var found = [];
  var list = sentences(text);
  for (var i = 0; i < list.length; i++) {
    var sentence = list[i];
    if (isQuestion(sentence)) continue;
    if (SOFTENED_LEAD.test(sentence)) continue;      // she already did the right thing
    var body = stripQuoted(sentence);                // his words are his source

    for (var p = 0; p < SPECIFIC_PATTERNS.length; p++) {
      var re = new RegExp(SPECIFIC_PATTERNS[p].re.source, SPECIFIC_PATTERNS[p].re.flags);
      var m;
      while ((m = re.exec(body)) !== null) {
        if (supported(m[0], sourceText)) continue;
        found.push({
          kind: SPECIFIC_PATTERNS[p].kind,
          specific: m[0].slice(0, 60),
          excerpt: sentence.slice(0, 160)
        });
        if (found.length >= 8) break;
      }
      if (found.length >= 8) break;
    }
    if (found.length >= 8) break;
  }

  if (!found.length) return { reaching: false, reason: null, claims: [] };
  return { reaching: true, reason: REASON, claims: found, guidance: SOFTEN_GUIDANCE };
}

module.exports = {
  REASON: REASON,
  SOFTEN_GUIDANCE: SOFTEN_GUIDANCE,
  enabled: enabled,
  detect: detect
};
