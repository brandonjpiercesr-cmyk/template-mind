// ⬡B:core.ceiling_owner:LAW:a_ceiling_has_an_owner:20260731⬡
// THE ONE SOURCE for reading a CEILING, the kind of number that decides how much of something
// this estate will do before it stops. Founder order, 20260731, in his words: remove all the
// bullshit limits, also in the code.
//
// THE RULE, and it is the same rule as `core/judgment.SETTING.a_threshold_has_an_owner`, applied
// to the other half of the estate. Cold code may ENFORCE a ceiling. It may never PICK one.
//   ENFORCING (legitimate, and this module exists to do it well): a configured value is read,
//   validated for SHAPE, and the exact number a human chose is put in force.
//   PICKING (never): inventing the number, capping what a human is allowed to ask for, or
//   quietly substituting something else for what he typed.
//
// THE FOUR ANSWERS, and there is deliberately no fifth. Every read reports `chosen_by`:
//   'the founder'        a real value is configured and a human chose it. ENFORCE it exactly.
//   'nobody_yet'         nothing is configured and no value stands. There is NO ceiling, and
//                        this module will not invent one to fill the hole.
//   'unreadable_setting' something IS configured and it cannot be used. ANNOUNCE it. Never read
//                        as working, never silently swapped for a fallback, never quietly null.
//   'this_lane'          a value baked into code is standing in. Recorded as such so it can
//                        never be mistaken on a receipt for a human's decision.
//
// THE TRAP CLASS THIS EXISTS TO END, which is worse than a missing setting and is why this
// module is written the way it is. On 20260731 the founder set a seat cap generously and got
// LESS than a founder who set nothing at all, and nothing told him. The reader was
//   value > 0 && value <= <a hundred> ? value : null
// so a generous number returned null, null already meant INVALID everywhere downstream, and the
// seat went dead while he believed his edit had taken. A value a human set that is silently not
// in force is the worst defect shape in this estate, because he has no reason to look again.
// So, held here and provable from outside:
//   1. NO MAXIMUM. This module cannot express a coder chosen upper bound. There is no `maximum`
//      in any spec it accepts, so no lane can reintroduce one without adding the concept back
//      and tripping the suite that forbids it. Whatever a human asks for is what is enforced.
//   2. A NULL VALUE ALWAYS CARRIES A REASON. `value === null` happens only with
//      'unreadable_setting' or 'nobody_yet', and both set `needs_review`. There is no branch
//      anywhere in this file that returns a bare null.
//   3. NOTHING IS EVER SILENTLY SUBSTITUTED. A configured value either goes into force exactly
//      or is announced as unusable. It is never trimmed, clamped, rounded, or replaced quietly.
//
// WHY THERE IS NO BUILT IN DEFAULT. `process.env.X || 300` is the defect wearing an env var's
// clothes: the literal is still there, still chosen by nobody, and now it is harder to find. Her
// image work ran for weeks on a number that was never configured anywhere and that no human ever
// picked. A caller that genuinely holds an in code value passes it as `lane_value`, and it is
// stamped 'this_lane' so every surface says out loud that a coder chose it, not him.
//
// THIS FILE DECIDES NOTHING AND REACHES NOBODY. It reads a setting, validates its shape, and
// reports the number with its owner attached. No network, no bank, no model, no person. It is
// byte identical across anew (core/) and template-mind (pai/core/), so every inherited world
// reads one source. ANYHAM: no identity, no personal fact, no hardcoded person here.
'use strict';

// The four answers. Exported so a caller compares against a name rather than retyping a string,
// and so a test can assert on the vocabulary instead of on spelling.
var CHOSEN_BY = Object.freeze({
  FOUNDER: 'the founder',
  NOBODY: 'nobody_yet',
  UNREADABLE: 'unreadable_setting',
  LANE: 'this_lane'
});

// The largest integer this process can count EXACTLY. It is an arithmetic fact about JavaScript,
// not a threshold anyone picked, and it is the only number this module will ever supply that was
// not typed by a human. It is used in exactly one place: when a caller declares that an absent
// setting means NO CEILING, and a downstream contract (the durable spend claim's RPC, for one)
// requires an integer to be passed rather than an absence. Every read that reaches for it sets
// `unlimited:true` beside it, so no surface can report it as a decision.
var EXACT_INTEGER_EDGE = Number.MAX_SAFE_INTEGER;

function _isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

function _out(setting, fields) {
  var base = { setting: setting, value: null, chosen_by: CHOSEN_BY.NOBODY, configured: false,
    requested: null, reason: null, unlimited: false, limited_by: null, needs_review: false };
  return Object.assign(base, fields || {});
}

// Read one named ceiling and report who chose it. Never throws, never invents, never caps.
//
// name    the env setting name, e.g. 'DAILY_IMAGE_CALL_CEIL'. Named, never anonymous: a setting
//         a human cannot find is a setting a human cannot own.
// spec    { integer, decimals, lane_value, unlimited_when_unset }
//           integer               the value must be a whole number. A SHAPE fact about what the
//                                 number counts (calls are whole), never an opinion about size.
//           decimals              how many fractional digits are accepted when it is not an
//                                 integer. Money in this estate is written to four places.
//           lane_value            a value baked into code that stands when nothing is
//                                 configured. Stamped 'this_lane', never 'the founder'.
//           unlimited_when_unset  with nothing configured and no lane value, there is NO
//                                 ceiling. Reports unlimited:true with 'nobody_yet'.
//         There is deliberately no `maximum`, no `max`, and no `clamp`. See rule 1 above.
// runtime the environment to read. Defaults to process.env. Injected in tests so a suite never
//         depends on the machine it runs on.
function readCeiling(name, spec, runtime) {
  var s = spec || {};
  var setting = String(name || '');
  if (!setting) {
    return _out(null, { chosen_by: CHOSEN_BY.UNREADABLE, reason: 'setting_name_missing',
      needs_review: true });
  }

  var env = runtime || process.env;
  var raw = env ? env[setting] : undefined;

  // NOTHING CONFIGURED. Blank, or blank once trimmed, is the same as unset: treating a stray
  // space from a paste as a typo would be one more way to go quiet over nothing.
  if (_isBlank(raw)) {
    if (Number.isFinite(s.lane_value) && s.lane_value > 0) {
      // A coder's number is standing in. It is honored so nothing that works today breaks, and
      // it is labelled so no receipt can ever call it his.
      return _out(setting, { value: s.lane_value, chosen_by: CHOSEN_BY.LANE, configured: false,
        requested: null, needs_review: true,
        reason: 'no human has chosen this ceiling, a value baked into code is standing in' });
    }
    if (s.unlimited_when_unset === true) {
      // NO CEILING. Not a large ceiling, not a default ceiling: none. The number handed back is
      // the arithmetic edge so a caller whose downstream contract demands an integer still has
      // one, and `unlimited` says out loud that nothing is being enforced.
      return _out(setting, { value: EXACT_INTEGER_EDGE, chosen_by: CHOSEN_BY.NOBODY,
        configured: false, unlimited: true, needs_review: true,
        reason: 'no human has chosen this ceiling, so no ceiling is in force' });
    }
    return _out(setting, { chosen_by: CHOSEN_BY.NOBODY, configured: false, needs_review: true,
      reason: 'no human has chosen this ceiling' });
  }

  var text = String(raw).trim();

  // SHAPE VALIDATION, and only shape. Every refusal below is about whether the characters can be
  // read as the kind of number this setting holds, never about whether the number is too big.
  //
  // Strict on purpose, because a loose parse here is the whole danger. Number('2,000') is NaN but
  // parseInt('2,000') is 2, which turns a raised ceiling into a tighter one with no symptom but
  // an earlier silence. Only a plain run of digits, optionally with a bounded decimal part, is a
  // number a human meant to type.
  var decimals = Number.isInteger(s.decimals) && s.decimals > 0 ? s.decimals : 0;
  var pattern = s.integer === true || decimals === 0
    ? /^[0-9]+$/
    : new RegExp('^[0-9]+(?:\\.[0-9]{1,' + decimals + '})?$');
  if (!pattern.test(text)) {
    return _out(setting, { chosen_by: CHOSEN_BY.UNREADABLE, configured: true, needs_review: true,
      reason: s.integer === true ? 'not_a_plain_whole_number' : 'not_a_plain_number' });
  }

  var asked = Number(text);
  if (!Number.isFinite(asked)) {
    return _out(setting, { chosen_by: CHOSEN_BY.UNREADABLE, configured: true, needs_review: true,
      reason: 'not_a_finite_number' });
  }
  // Zero and below are not ceilings. A ceiling of zero is a MUTE, and nobody types zero into a
  // budget box meaning "stop everything", so it is announced rather than obeyed.
  if (asked <= 0) {
    return _out(setting, { chosen_by: CHOSEN_BY.UNREADABLE, configured: true, needs_review: true,
      requested: asked, reason: 'not_above_zero' });
  }

  // A digit run too long to be an exact JavaScript number is NOT a typo and never fails closed.
  // Refusing one muted her live on 20260726 while the founder was RAISING the budget, which is
  // the guard doing the exact harm it exists to prevent. The meaning is never in doubt: MORE.
  // What is in force is the largest number this process can count exactly, which is a fact about
  // arithmetic rather than a limit anybody chose, and `limited_by` names it so nobody reads the
  // result as a coder trimming his edit.
  if (s.integer === true && !Number.isSafeInteger(asked)) {
    return _out(setting, { value: EXACT_INTEGER_EDGE, chosen_by: CHOSEN_BY.FOUNDER,
      configured: true, requested: null, unlimited: true, needs_review: true,
      limited_by: 'exact_integer_range', reason: 'above_exact_integer_range' });
  }

  // HIS NUMBER, WHATEVER IT IS. No upper bound is applied here, ever.
  return _out(setting, { value: asked, chosen_by: CHOSEN_BY.FOUNDER, configured: true,
    requested: asked, needs_review: false });
}

module.exports = {
  CHOSEN_BY: CHOSEN_BY,
  EXACT_INTEGER_EDGE: EXACT_INTEGER_EDGE,
  readCeiling: readCeiling
};
