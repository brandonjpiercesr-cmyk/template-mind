// ⬡B:core.judgment:SETTING:a_threshold_has_an_owner:20260731⬡
// A THRESHOLD IS A JUDGMENT, SO IT HAS AN OWNER. The one source for every number in this
// estate that decides QUALITY, RELEVANCE, IMPORTANCE, CONFIDENCE, PRIORITY, TRUST or WORTH.
//
// THE FOUNDER CORRECTION THIS SERVES (20260731, his words: "not the specific but the pattern").
// He read `core/roster.WONDER.client_bank.20260731.js`, saw `if (confidence < 0.5)`, and named
// the shape rather than the line: cold code that MAKES a judgment instead of ENFORCING one.
// A bare literal no human ever chose, silently overruling an organ's own ruling. The estate
// sweep that followed found the same shape in five more live places, so the cure is one module
// every one of them reads, never six hand maintained copies of the same six lines.
//
// THE RULE, and the whole of it. Cold code may ENFORCE a decision that was already made. It may
// never MAKE one.
//   ENFORCING (leave alone, this module has no business there): is HAM A the same as HAM B, is
//   this one of two allowed words, is this an array, is this present, is this within its own
//   declared domain (a 0 to 1 confidence outside 0 to 1 is a FACT error), is this under the byte
//   ceiling that prevents an out of memory kill. A wrong answer there is a fact error.
//   MAKING (this module's whole subject): is this good enough, is this relevant enough, is this
//   important enough, does this deserve a human's attention. A wrong answer there is a judgment
//   error, and a reasonable person could argue for a different number.
//
// THE FOUR ANSWERS, and there is deliberately no fifth. Every reader of a judgment setting gets
// back exactly one of these, and `chosen_by` always says which:
//   'the founder'        a real value is configured and a human chose it. ENFORCE it.
//   'nobody_yet'         nothing is configured. DO NOT INVENT A NUMBER. Admit and surface for
//                        review, because discarding real work on an unowned constant is the
//                        worse failure of the two.
//   'unreadable_setting' something is configured and it is not usable. ANNOUNCE it. A misconfigured
//                        value is never read as working and never silently falls back to a guess.
//   'this_lane'          a caller passed an explicit override in code. Recorded as such so it can
//                        never be mistaken for a human's decision on a receipt.
//
// WHY NOT A DEFAULT. `process.env.X || 0.5` is the defect wearing an env var's clothes: the
// literal is still there, still chosen by nobody, and now it is harder to see. The estate has
// already paid for this twice. `core/seat.map.js` carried `dailyCapUsd: 8`, and its own fix note
// reads "a default invented in this file, never a decision"; it stopped the coding mind on the
// eve of a launch. `core/contributors.js` carried a score floor of 3, and a real vendor low
// balance warning landed once a day for five straight days and never once cleared it.
//
// THIS FILE DECIDES NOTHING AND REACHES NOBODY. It reads settings, reports who chose them, and
// hands the ruling back to its caller. No network, no bank, no model, no person.
'use strict';

// ⬡B:core.judgment_setting:WIRE:one_vocabulary_not_two_copies_of_one:20260801⬡
// The four answers, taken from `core/ceiling.owner.js` rather than retyped here. Those two
// modules are NOT the same guarantee and neither is a second implementation of the other: a
// FLOOR decides what is admitted and a CEILING decides how much is done, they fail in opposite
// directions, and `ceiling.owner` says so in its own header. But they answer the SAME question
// about ownership with the SAME four words, and two hand-maintained copies of one vocabulary is
// exactly what the one-source law forbids. `ceiling.owner` is the byte-identical synced file that
// every inherited world already reads, so it holds the words and this module reads them. The
// direction is deliberate and cannot be reversed: the synced file may never depend on an
// anew-only one, or template-mind inherits a broken require.
var CHOSEN_BY = require('./ceiling.owner.js').CHOSEN_BY;

function _isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

// ⬡B:core.judgment_setting:FIX:an_array_that_stringifies_empty_is_not_a_missing_override:20260815⬡
// Codex P2: `_isBlank` was written for env-var strings, where `String(raw)` is always a
// faithful reading of what is actually there. `String([])` is `''` too (Array.prototype.
// toString joins with commas and an empty array joins to nothing), so `{"days": []}`
// read as BLANK -- "no override supplied" -- and fell straight through to the env value
// instead of ever reaching the type guard below that exists to refuse exactly this shape.
// An override's presence must be judged by its own type, never by coercing an arbitrary
// JS value to a string and asking if that string happens to be empty: undefined and null
// mean "nothing supplied," an empty or whitespace-only STRING means the same (unchanged
// caller convenience), and every other type (including an array or object that stringifies
// to nothing) is something a caller supplied that the type guard below must see and refuse.
function _overrideMissing(raw) {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  return false;
}

// ⬡B:core.judgment_setting:FIX:an_override_is_a_value_not_an_exemption_from_the_domain:20260815⬡
// Codex P1: `readJudgmentSetting`'s override branch checked only that the value was a finite
// number, then returned it unchecked against `integer`/`min`/`max`. min/max/integer are a SHAPE
// fact about what the number MEANS (this module's own header: "a probability lives in 0 to 1"),
// never a judgment -- so they must hold for every source of a value, override included, or a
// caller-supplied 0 for a "how many days is too long" setting silently passes as a valid choice
// when it is a fact error the same as a misconfigured env value would be. This is shared
// validation, not new behavior: it is the exact same check the env-read path already ran, now
// applied once so neither path can drift from the other.
function _domainFault(value, s) {
  if (s.integer === true && !Number.isInteger(value)) return { reason: 'not_an_integer' };
  if (Number.isFinite(s.min) && value < s.min) {
    return { reason: 'below_domain', domain: { min: s.min, max: s.max } };
  }
  if (Number.isFinite(s.max) && value > s.max) {
    return { reason: 'above_domain', domain: { min: s.min, max: s.max } };
  }
  return null;
}

// Read one named judgment setting and report who chose it. Never throws, never invents.
//
// name    the env setting name, e.g. 'SIGNAL_SURFACE_SCORE_FLOOR'. Named, never anonymous: a
//         setting a human cannot find is a setting a human cannot own.
// spec    { min, max, integer, override } the value's own declared domain. min and max are a
//         SHAPE fact about what the number means (a probability lives in 0 to 1, a percentage in
//         0 to 100), never a judgment about what a good value would be. `override` is an explicit
//         in code value for a caller that genuinely owns the choice, and it stamps as 'this_lane'.
// runtime the environment to read. Defaults to process.env. Injected in tests so a suite never
//         depends on the machine it runs on.
function readJudgmentSetting(name, spec, runtime) {
  var s = spec || {};
  var setting = String(name || '');
  if (!setting) {
    return { setting: null, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
      reason: 'setting_name_missing', configured: false };
  }

  if (!_overrideMissing(s.override)) {
    // ⬡B:core.judgment_setting:FIX:a_boolean_is_not_a_number_wearing_a_disguise:20260815⬡
    // Codex P1 follow-up: `Number(true) === 1` and `Number(false) === 0`, so a boolean
    // override (an authenticated caller sending `{"days": true}` in a JSON body) survived
    // Number() and then the domain check as an ordinary in-range integer -- the exact
    // silent-cast class of bug this module's own header exists to end. Only an actual
    // number, or a string that reads as one (the same shape the env path already accepts),
    // may become a value; every other JS type is a fact error, not a choice.
    var overrideType = typeof s.override;
    if (overrideType !== 'number' && overrideType !== 'string') {
      return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
        reason: 'override_not_a_number', configured: true };
    }
    var forced = Number(s.override);
    if (!Number.isFinite(forced)) {
      return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
        reason: 'override_not_a_number', configured: true };
    }
    var forcedFault = _domainFault(forced, s);
    if (forcedFault) {
      return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
        reason: 'override_' + forcedFault.reason, domain: forcedFault.domain || null,
        configured: true };
    }
    return { setting: setting, value: forced, chosen_by: CHOSEN_BY.LANE, configured: true };
  }

  var env = runtime || process.env;
  var raw = env ? env[setting] : undefined;

  // NOTHING CONFIGURED. This is the branch the whole module exists for. It returns a null value
  // on purpose: there is no number here, and any caller that treats null as a number will fail
  // loudly rather than quietly enforcing a guess.
  if (_isBlank(raw)) {
    return { setting: setting, value: null, chosen_by: CHOSEN_BY.NOBODY, configured: false };
  }

  var value = Number(String(raw).trim());
  if (!Number.isFinite(value)) {
    return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
      reason: 'not_a_number', configured: true };
  }
  if (s.integer === true && !Number.isInteger(value)) {
    return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
      reason: 'not_an_integer', configured: true };
  }
  // Domain check, not a judgment. Being outside the declared domain is a FACT error about the
  // configured value, exactly the class cold code is allowed to rule on.
  if (Number.isFinite(s.min) && value < s.min) {
    return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
      reason: 'below_domain', domain: { min: s.min, max: s.max }, configured: true };
  }
  if (Number.isFinite(s.max) && value > s.max) {
    return { setting: setting, value: null, chosen_by: CHOSEN_BY.UNREADABLE,
      reason: 'above_domain', domain: { min: s.min, max: s.max }, configured: true };
  }

  return { setting: setting, value: value, chosen_by: CHOSEN_BY.FOUNDER, configured: true };
}

// APPLY A FLOOR to one observed value, and report the ruling with its owner attached.
//
// Returns { admitted, needs_review, floor, chosen_by, setting, observed, note }.
//   admitted     may this thing proceed. Only ever false when a real floor exists AND the
//                observation is genuinely under it. Nothing is discarded on an unowned number.
//   needs_review the ruling was made without an owner, or with a broken setting. The caller MUST
//                surface this. A gap that reads as a clean run is how the defect survives.
//
// The direction is deliberately one way: an unowned or broken floor ADMITS. Letting a weak item
// through costs a human one glance. Dropping a real one costs them the thing itself, and they
// never learn it existed.
function applyFloor(input) {
  var i = input || {};
  var gate = readJudgmentSetting(i.setting, i.spec, i.runtime);
  var observed = Number(i.observed);

  // The observation itself has to be a number. That is shape, not judgment.
  if (!Number.isFinite(observed)) {
    return {
      admitted: false, needs_review: false, floor: gate.value, chosen_by: gate.chosen_by,
      setting: gate.setting, observed: null,
      note: { note: 'observation_not_a_number', setting: gate.setting }
    };
  }

  if (gate.chosen_by === CHOSEN_BY.NOBODY) {
    return {
      admitted: true, needs_review: true, floor: null, chosen_by: gate.chosen_by,
      setting: gate.setting, observed: observed,
      note: { note: (i.label || 'floor') + '_unset', chosen_by: gate.chosen_by,
        setting: gate.setting, observed: observed, needs_review: true,
        why: 'no human has chosen this threshold, so nothing is discarded on it' }
    };
  }

  if (gate.chosen_by === CHOSEN_BY.UNREADABLE) {
    return {
      admitted: true, needs_review: true, floor: null, chosen_by: gate.chosen_by,
      setting: gate.setting, observed: observed,
      note: { note: (i.label || 'floor') + '_unreadable', chosen_by: gate.chosen_by,
        setting: gate.setting, reason: gate.reason || null, domain: gate.domain || null,
        observed: observed, needs_review: true,
        why: 'the configured value is not usable and is never read as working' }
    };
  }

  if (observed < gate.value) {
    return {
      admitted: false, needs_review: false, floor: gate.value, chosen_by: gate.chosen_by,
      setting: gate.setting, observed: observed,
      note: { note: (i.label || 'floor') + '_not_met', chosen_by: gate.chosen_by,
        setting: gate.setting, floor: gate.value, observed: observed }
    };
  }

  return {
    admitted: true, needs_review: false, floor: gate.value, chosen_by: gate.chosen_by,
    setting: gate.setting, observed: observed, note: null
  };
}

// APPLY A COUNT BOUND to a list, and always say whether it actually cut anything.
//
// The sneakiest form of this defect is a truncation. `slice(0, 5)` on a ranked list silently
// decides which five things a human is allowed to see, and the other ones do not merely rank
// lower, they cease to exist with no trace that they ever did.
//
// The distinction, and it is the same one as everywhere else in this module:
//   A MEMORY SAFETY BOUND is legitimate and stays. It must still REPORT that it truncated,
//   because a silent truncation reads as complete coverage.
//   A RELEVANCE BOUND is a judgment and needs an owner.
// So: with nothing configured, NOTHING IS CUT and the full list is returned with the gap
// surfaced. `hard_ceiling` is the separate memory safety bound, is always applied, and always
// announces itself when it bites.
function applyCount(input) {
  var i = input || {};
  var items = Array.isArray(i.items) ? i.items : [];
  var gate = readJudgmentSetting(i.setting, Object.assign({ integer: true, min: 1 }, i.spec || {}), i.runtime);
  var notes = [];
  var kept = items;

  if (gate.chosen_by === CHOSEN_BY.NOBODY || gate.chosen_by === CHOSEN_BY.UNREADABLE) {
    // No owner, so nothing is dropped for relevance. The whole list stands and the gap is said
    // out loud rather than being paid for by whatever fell off the end.
    if (items.length) {
      notes.push({ note: (i.label || 'count') + (gate.chosen_by === CHOSEN_BY.NOBODY ? '_unset' : '_unreadable'),
        chosen_by: gate.chosen_by, setting: gate.setting, reason: gate.reason || null,
        available: items.length, needs_review: true,
        why: 'no human has chosen how many of these are worth seeing, so none are hidden' });
    }
  } else if (items.length > gate.value) {
    kept = items.slice(0, gate.value);
    notes.push({ note: (i.label || 'count') + '_applied', chosen_by: gate.chosen_by,
      setting: gate.setting, limit: gate.value, available: items.length, withheld: items.length - gate.value });
  }

  // THE MEMORY SAFETY BOUND, a different animal entirely. It is a fact about what this process
  // can hold, not an opinion about what is worth reading, so it always applies. It still reports.
  var ceiling = Number(i.hard_ceiling);
  if (Number.isFinite(ceiling) && ceiling > 0 && kept.length > ceiling) {
    var before = kept.length;
    kept = kept.slice(0, ceiling);
    notes.push({ note: (i.label || 'count') + '_hard_ceiling_applied', chosen_by: 'memory_safety',
      limit: ceiling, available: before, withheld: before - ceiling,
      why: 'a bound on what this process can hold, never a ruling on what is worth seeing' });
  }

  return {
    items: kept,
    available: items.length,
    withheld: items.length - kept.length,
    truncated: kept.length < items.length,
    needs_review: notes.some(function (n) { return n.needs_review === true; }),
    chosen_by: gate.chosen_by,
    setting: gate.setting,
    notes: notes
  };
}

module.exports = {
  CHOSEN_BY: CHOSEN_BY,
  readJudgmentSetting: readJudgmentSetting,
  applyFloor: applyFloor,
  applyCount: applyCount
};
