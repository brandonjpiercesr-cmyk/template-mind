// ⬡B:board.writ.dash_ruling:MODULE:cold_flags_the_mind_rules:20260808⬡
// THE EM DASH RULING. Cold code DETECTS. A woken mind DECIDES. Nothing here ever
// blocks, and nothing here ever takes the pen on its own.
//
// WHY THIS FILE EXISTS, in the founder's own recorded words. He mentions the em
// dash exactly three times in the whole doctrine corpus, and all three times he is
// describing WHO GETS TO DECIDE, never a ban:
//
//   "it is truly a wonder because it's an LLM really deciding they saw everything
//    that it has and the knowledge and all of the other components. So, no C O L D
//    C O D E that checks for E M dashes is running by itself. It just flags and
//    alerts the L O M so they can make intelligent decisions."
//   Phase 2 DOCTRINES/Pre governor doctrine, specific how to build Advisor Strategy
//   Improvement_otter.ai.txt @3883
//
//   "if you take a W R I T and the things that you had as cold code, those are the
//    different LLMs that are waking up to decide, and then one master one looking at
//    the master thing and saying yes, no, actually we needed to have a EM dash in this"
//   Phase 2 DOCTRINES/The Cycle doctrine.txt @2976
//
// That second quote is the whole contract of this file: KEEP has to be a reachable
// verdict. A converter that only ever chose between "replace now" and "replace later"
// would not be an implementation of what he said, it would be the same ban wearing a
// hint's clothing.
//
// STATUS, and read this before citing this file as authority: PROPOSED-RG, pending
// founder conversion. The two quotes above are his. The sentence "no em dashes in
// output or code strings" that stands in CLAUDE.md, AGENTS.md, and the writ and
// human-voice-style skills is NOT his; a corpus search over 96 unique transcripts
// found zero occurrences of any sentence banning em dashes. This module implements
// what he is recorded saying. It does not implement, and does not endorse, the ban.
//
// WHAT THIS IS NOT. It is not a gate. flagDashes never mutates its input and never
// returns a blocking verdict; the shape of its return makes blocking impossible to
// express. Compare board/writ/writ.js removeEmDash, the cold path this supersedes,
// which rewrites every em dash to a comma with no model anywhere in the loop. That
// function is a NASTY C by the definition in docs/NASTY_C_AUDIT.md ("cold code that
// makes a real judgment... with no model"), and it is still wired into applyVoiceLaw
// for legacy callers. This file is the door out of it, per caller, not a silent
// estate-wide behavior change on a shared branch.
//
// Pattern copied from agents/meta_commentary.js (the 20260724 conversion) and
// scripts/checks/reader-copy-hints.js (the clean-flagger reference).

'use strict';

// Built by code point, never typed. tests/a.new.person.can.have.a.world.test.js learned this
// the hard way: the first version of that guard typed the character into its own failure
// message and promptly failed itself. A file about em dashes is the last place that should
// happen, and spelling them this way also keeps this module readable to the estate's scanners.
var EM_DASH = String.fromCharCode(0x2014);
var EN_DASH = String.fromCharCode(0x2013);

// The three shapes the estate has historically treated as "an em dash". They are
// listed separately because they are not the same fact and a mind may rule on them
// differently: a real em dash in prose is a typographic choice, an ASCII double
// hyphen is very often a CLI flag, and an en dash is usually a number range.
var DASH_RULES = [
  {
    rule: 'em_dash',
    pattern: new RegExp(EM_DASH, 'g'),
    why: 'A literal em dash (U+2014). Typography, not a fact. Whether it belongs is a taste call about this specific sentence and this specific reader.'
  },
  {
    rule: 'en_dash',
    pattern: new RegExp(EN_DASH, 'g'),
    why: 'A literal en dash (U+2013). Usually a number or date range, where it is correct. Flagged so a mind can look, not because it is wrong.'
  },
  {
    rule: 'ascii_double_hyphen',
    pattern: /--/g,
    why: 'An ASCII double hyphen. Frequently a real command line flag (--json, --strict) rather than prose punctuation. Replacing it inside a command breaks the command.'
  }
];

function lineAndColumn(text, index) {
  var before = text.slice(0, index);
  var line = before.split('\n').length;
  var lastBreak = before.lastIndexOf('\n');
  return { line: line, column: index - lastBreak };
}

function excerpt(text, index, width) {
  var pad = typeof width === 'number' ? width : 40;
  var start = Math.max(0, index - pad);
  var end = Math.min(text.length, index + pad);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}

/**
 * COLD DETECTION. Returns facts about characters on disk and nothing else.
 *
 * It cannot block: there is no field in the return value that means "reject". A
 * caller that wants to stop shipping has to go get a ruling first, which is the
 * point. `blocked` is present and hard-wired to false so that any caller reading
 * it as a gate reads the honest answer forever.
 *
 * @param {string} text
 * @returns {{ok:boolean, blocked:boolean, flags:Array, ruled:boolean}}
 */
function flagDashes(text) {
  var source = typeof text === 'string' ? text : '';
  var flags = [];

  DASH_RULES.forEach(function (spec) {
    var pattern = new RegExp(spec.pattern.source, 'g');
    var match;
    while ((match = pattern.exec(source)) !== null) {
      var where = lineAndColumn(source, match.index);
      flags.push({
        rule: spec.rule,
        index: match.index,
        length: match[0].length,
        span: match[0],
        line: where.line,
        column: where.column,
        evidence: excerpt(source, match.index),
        why: spec.why,
        // Named so no future reader mistakes a flag for a verdict.
        verdict: null,
        decided_by: null
      });
    }
  });

  flags.sort(function (a, b) { return a.index - b.index; });

  return {
    ok: true,              // detection succeeded; says nothing about the text
    blocked: false,        // structurally always false. A flag is not a block.
    ruled: false,          // no mind has looked yet
    flags: flags,
    text: source           // returned unchanged, always
  };
}

/**
 * APPLY A MIND'S RULING. The ruling is authoritative, including "keep".
 *
 * @param {string} text
 * @param {Array} flags        the flags from flagDashes
 * @param {Object} ruling      { decider, verdicts: [{index, verdict:'keep'|'replace', replacement?, why?}] }
 * @returns {{text:string, ruled:boolean, decider:string|null, kept:number, replaced:number, unruled:number, flags:Array}}
 */
function applyRuling(text, flags, ruling) {
  var source = typeof text === 'string' ? text : '';
  var list = Array.isArray(flags) ? flags.slice() : [];
  var verdicts = (ruling && Array.isArray(ruling.verdicts)) ? ruling.verdicts : [];
  var decider = (ruling && ruling.decider) ? String(ruling.decider) : null;

  var byIndex = {};
  verdicts.forEach(function (v) {
    if (v && typeof v.index === 'number') byIndex[v.index] = v;
  });

  var kept = 0, replaced = 0, unruled = 0;

  // Rebuild right to left so earlier indices stay valid.
  var ordered = list.slice().sort(function (a, b) { return b.index - a.index; });
  var out = source;

  ordered.forEach(function (flag) {
    var v = byIndex[flag.index];
    if (!v) {
      // NO RULING MEANS NO CHANGE. Silence from the mind is never consent to edit.
      flag.verdict = 'unruled';
      flag.decided_by = null;
      unruled++;
      return;
    }
    if (v.verdict === 'keep') {
      // THE VERDICT THIS WHOLE FILE EXISTS FOR.
      flag.verdict = 'keep';
      flag.decided_by = decider;
      flag.ruling_why = v.why || null;
      kept++;
      return;
    }
    if (v.verdict === 'replace') {
      var replacement = typeof v.replacement === 'string' ? v.replacement : ', ';
      out = out.slice(0, flag.index) + replacement + out.slice(flag.index + flag.length);
      flag.verdict = 'replace';
      flag.decided_by = decider;
      flag.replacement = replacement;
      flag.ruling_why = v.why || null;
      replaced++;
      return;
    }
    flag.verdict = 'unruled';
    flag.decided_by = null;
    unruled++;
  });

  return {
    text: out,
    ruled: !!decider,
    decider: decider,
    kept: kept,
    replaced: replaced,
    unruled: unruled,
    flags: list
  };
}

/**
 * THE FULL FLAG AND WAKE PATH.
 *
 * Cold scan, then wake a mind, then apply what the mind ruled. If no mind is
 * reachable, the text ships UNCHANGED with the flags on the receipt. That is the
 * same fail-open-on-taste posture agents/meta_commentary.js already took and for
 * the same reason: punctuation is taste, and a phrase list must never get the pen
 * just because a model was busy.
 *
 * @param {string} text
 * @param {Object} opts { deliberate, context, reason }
 */
async function decideDashes(text, opts) {
  var options = opts || {};
  var scan = flagDashes(text);

  if (scan.flags.length === 0) {
    return {
      ok: true, blocked: false, text: scan.text, ruled: false,
      decider: 'cold_pass_no_flags', flags: [],
      why: 'No dash of any kind was present. No model was spent.'
    };
  }

  var deliberate = typeof options.deliberate === 'function'
    ? options.deliberate
    : null;

  if (!deliberate) {
    try {
      deliberate = require('../../core/model.ladder.js').deliberate;
    } catch (error) {
      deliberate = null;
    }
  }

  if (typeof deliberate !== 'function') {
    return {
      ok: true, blocked: false, text: scan.text, ruled: false,
      failed_open: true, decider: null, flags: scan.flags,
      why: 'No mind was reachable. The draft ships unchanged with the flags on the receipt, because cold code does not get the pen on punctuation.'
    };
  }

  var system = 'You are the master pass WRIT wakes to rule on punctuation, and you are the '
    + 'only thing here allowed to decide. A cold scan found the dashes listed below. The scan '
    + 'reports facts about characters; it has no opinion and no authority. You have both. '
    + 'For each flag reply KEEP or REPLACE. KEEP is a real and expected answer: the founder '
    + 'himself said the master pass looks at the work and says "yes, no, actually we needed to '
    + 'have a EM dash in this." An ASCII double hyphen inside a command line flag is almost '
    + 'always KEEP, and an en dash between two numbers is almost always KEEP. Judge the '
    + 'sentence, the reader, and the surface, not the character. '
    + 'Reply with ONLY a JSON array of {"index":<number>,"verdict":"keep"|"replace",'
    + '"replacement":<string, only when replacing>,"why":<short reason>}.';

  var payload = scan.flags.map(function (f) {
    return { index: f.index, rule: f.rule, span: f.span, evidence: f.evidence, line: f.line };
  });

  var raw = null;
  try {
    // ⬡B:board.writ.dash_ruling:FIX:the_wake_call_spoke_a_signature_no_ladder_has:20260808⬡
    // CAUGHT BY CATHY (Codex) on #2045, P2: this call used to pass a single options
    // object, but core/model.ladder.js deliberate() is (system, user, opts), so the
    // whole ruling path could never actually wake a mind against the real ladder.
    // Called in the ladder's own shape now. json mode is deliberately NOT requested:
    // the ladder's json cleanup extracts outer braces and this reply is a JSON ARRAY,
    // which brace extraction would corrupt. The fence strip below handles wrapping.
    raw = await deliberate(system, JSON.stringify(payload),
      { max_tokens: 800, temperature: 0, purpose: 'writ.dash_ruling' });
  } catch (error) {
    raw = null;
  }

  var body = raw && typeof raw === 'object'
    ? (typeof raw.content === 'string' ? raw.content
      : (typeof raw.text === 'string' ? raw.text : null))
    : (typeof raw === 'string' ? raw : null);

  var verdicts = null;
  if (body) {
    try {
      var trimmed = body.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) verdicts = parsed;
    } catch (parseError) {
      verdicts = null;
    }
  }

  if (!verdicts) {
    return {
      ok: true, blocked: false, text: scan.text, ruled: false,
      failed_open: true, decider: null, flags: scan.flags,
      why: 'The mind was woken but returned nothing rulable. The draft ships unchanged, flags on the receipt.'
    };
  }

  var decider = (raw && raw.model) ? String(raw.model) : 'woken_mind';
  var applied = applyRuling(scan.text, scan.flags, { decider: decider, verdicts: verdicts });

  return {
    ok: true,
    blocked: false,
    text: applied.text,
    ruled: true,
    decider: applied.decider,
    kept: applied.kept,
    replaced: applied.replaced,
    unruled: applied.unruled,
    flags: applied.flags,
    why: 'A woken mind ruled on each flag. Kept ' + applied.kept + ', replaced ' + applied.replaced + '.'
  };
}

module.exports = {
  EM_DASH: EM_DASH,
  EN_DASH: EN_DASH,
  DASH_RULES: DASH_RULES,
  flagDashes: flagDashes,
  applyRuling: applyRuling,
  decideDashes: decideDashes
};
