// ⬡B:tests.doctrine_no_coder_may_pick_a_ceiling:MIRROR:the_inherited_world_gets_the_same_law:20260731⬡
// The mirror of anew tests/no.coder.may.pick.a.ceiling.test.js, loading the template runtime
// through pai/core. This repository is the mind every world inherits, so a world born from it
// must inherit the law itself and not merely the file: a threshold has an owner, cold code may
// enforce one and may never pick or cap one, and a value a human set is never silently not in
// force. The two anew only assertions (its spend ceiling route wall) are the only ones dropped;
// everything the shared engine can be held to is held to here.
// ⬡B:tests.no_coder_may_pick_a_ceiling:LAW:a_ceiling_has_an_owner_and_a_trap_has_none:20260731⬡
// FOUNDER ORDER 20260731, his words: remove all the bullshit limits, also in the code.
//
// THE TWO DEFECTS THIS SUITE EXISTS TO KEEP DEAD, both measured, neither inferred.
//
// ONE, THE TRAP, and it is the priority because it is the worse of the two. He hit it himself
// on 20260731. `core/seat.map.js` read a seat's daily dollar cap and ended with a comparison
// against a hundred; anything above it returned null. null already meant INVALID everywhere
// downstream, so `core/openrouter.seat.spend.js` refused the seat outright. A founder who typed
// a generous number to be GENEROUS got a dead seat. A founder who typed nothing got a working
// one. Nothing anywhere told him which had happened, so he had no reason to look again. A value
// a human set that is silently not in force is the worst shape in this estate.
//
// TWO, THE NUMBERS NOBODY CHOSE. `core/spend.guard.js` carried four literals: two built in
// defaults and two upper bounds. He was told the upper two were hard maximums. They were not.
// They were typed by a lane in pull request #1080: not GitHub, not a provider, not physics. And
// one of the defaults had never been configured anywhere at all, so her image work ran for
// weeks on a number no human ever picked.
//
// WHAT IS PROVED HERE, and every one of these was checked to BITE by putting the literal back
// and watching this suite go red before it was restored:
//   1. No maximum exists anywhere on these paths. A table of values from just over the old
//      bounds to absurd is enforced EXACTLY, never trimmed.
//   2. Nothing configured never becomes a number. It reports 'nobody_yet' and admits.
//   3. A null value ALWAYS carries a named reason and needs_review. Null can never again mean
//      "invalid" without saying so, which is the whole trap.
//   4. The source files themselves no longer contain the removed literals, so a lane cannot
//      quietly restore one under a new name.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const owner = require('../pai/core/ceiling.owner.js');
const seatMap = require('../pai/core/seat.map.js');
const GUARD = require.resolve('../pai/core/spend.guard.js');

function freshGuard(env) {
  const saved = {};
  Object.keys(env).forEach(function (key) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  });
  delete require.cache[GUARD];
  const guard = require(GUARD);
  return { guard: guard, restore: function () {
    Object.keys(saved).forEach(function (key) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
    delete require.cache[GUARD];
  } };
}

// The values that used to be refused, trimmed, or turned into null. 101 and 500 are above the
// seat cap bound he hit. 10001 and 2001 are one past each of the two call ceiling bounds. 35000
// is the exact number he set on his phone on 20260726 and had trimmed without being told.
const ONCE_REFUSED_OR_TRIMMED = ['101', '500', '2001', '10001', '35000', '999999', '4000000000'];

// ---------------------------------------------------------------------------
// 1. THERE IS NO MAXIMUM, ANYWHERE ON THESE PATHS
// ---------------------------------------------------------------------------

test('the one source cannot express a maximum, so no lane can smuggle one in', function () {
  // Every spec key this module honors is named in its own signature. There is no maximum, max,
  // cap, ceiling_max or clamp among them, and passing one changes nothing, so a lane that tries
  // to reintroduce an upper bound by configuration alone gets no effect at all.
  const withAnAttemptedCap = owner.readCeiling('X_CEIL',
    { integer: true, maximum: 10, max: 10, cap: 10, clamp: 10 }, { X_CEIL: '99999' });
  assert.equal(withAnAttemptedCap.value, 99999, 'no spec key may cap what a human asked for');
  assert.equal(withAnAttemptedCap.chosen_by, owner.CHOSEN_BY.FOUNDER);
  assert.equal(withAnAttemptedCap.limited_by, null);
});

test('every value that used to be refused or trimmed is now enforced exactly', function () {
  ONCE_REFUSED_OR_TRIMMED.forEach(function (value) {
    const read = owner.readCeiling('X_CEIL', { integer: true }, { X_CEIL: value });
    assert.equal(read.value, Number(value), value + ' must be enforced at his size');
    assert.equal(read.chosen_by, owner.CHOSEN_BY.FOUNDER);
    assert.equal(read.limited_by, null, value + ' must not be limited by anything');
    assert.equal(read.requested, Number(value));
  });
});

test('the daily call ceilings honor any size he sets, on both kinds', function () {
  ONCE_REFUSED_OR_TRIMMED.forEach(function (value) {
    const fixture = freshGuard({ DAILY_MODEL_CALL_CEIL: value, DAILY_IMAGE_CALL_CEIL: value });
    try {
      assert.equal(fixture.guard.ceilDetail('text').value, Number(value));
      assert.equal(fixture.guard.ceilDetail('image').value, Number(value));
      assert.equal(fixture.guard.ceilDetail('text').chosen_by, 'the founder');
      assert.equal(fixture.guard.allow('text'), true, 'a raised ceiling never mutes her');
    } finally { fixture.restore(); }
  });
});

// ⬡B:tests.no_coder_may_pick_a_ceiling:911:the_generous_cap_bought_him_less_than_nothing:20260731⬡
// THE TRAP, held dead here. Every one of these was a dead seat before tonight.
test('a seat cap above the old bound is HIS number now, not null', function () {
  const saved = process.env.SEAT_CANON_DAILY_CAP_USD;
  try {
    ONCE_REFUSED_OR_TRIMMED.forEach(function (value) {
      process.env.SEAT_CANON_DAILY_CAP_USD = value;
      const seat = seatMap.seat('canon');
      assert.equal(seat.dailyCapUsd, Number(value),
        value + ' dollars must be the cap he set, not null');
      assert.equal(seat.capChosenBy, 'the founder');
      assert.notEqual(seat.dailyCapUsd, null,
        'a generous cap returning null is the exact trap that killed the seat');
    });
    // And the failover half of the same seat has to agree with the primary, or one seat is
    // running two different caps depending on which attempt is asking.
    process.env.SEAT_JUDGE_DAILY_CAP_USD = '750';
    assert.equal(seatMap.seat('judge').dailyCapUsd, 750);
    assert.equal(seatMap.fallback('judge').dailyCapUsd, 750);
    assert.equal(seatMap.fallback('judge').capChosenBy, 'the founder');
  } finally {
    if (saved === undefined) delete process.env.SEAT_CANON_DAILY_CAP_USD;
    else process.env.SEAT_CANON_DAILY_CAP_USD = saved;
    delete process.env.SEAT_JUDGE_DAILY_CAP_USD;
  }
});

// ---------------------------------------------------------------------------
// 2. NOTHING CONFIGURED NEVER BECOMES A NUMBER SOMEBODY INVENTED
// ---------------------------------------------------------------------------

test('an unconfigured image ceiling can no longer silently become a coder number', function () {
  const fixture = freshGuard({ DAILY_IMAGE_CALL_CEIL: undefined });
  try {
    const detail = fixture.guard.ceilDetail('image');
    assert.equal(detail.chosen_by, 'nobody_yet',
      'nobody chose this, so nobody may be told a coder did');
    assert.equal(detail.configured, false);
    assert.equal(detail.unlimited, true, 'there is NO image call ceiling in force');
    assert.equal(detail.needs_review, true, 'the gap is surfaced, never read as a clean run');
    assert.equal(detail.requested, null);
    assert.equal(fixture.guard.allow('image'), true,
      'an unowned ceiling admits; it never mutes her image work');
  } finally { fixture.restore(); }
});

test('an unconfigured ceiling with no lane value hands back no number at all', function () {
  const read = owner.readCeiling('X_CEIL', { integer: true }, {});
  assert.equal(read.value, null);
  assert.equal(read.chosen_by, owner.CHOSEN_BY.NOBODY);
  assert.equal(read.needs_review, true);
  assert.ok(read.reason, 'even the empty case names why there is nothing');
});

test('a value baked into code is stamped as the lane it came from, never as his', function () {
  const read = owner.readCeiling('X_CEIL', { decimals: 4, lane_value: 6 }, {});
  assert.equal(read.value, 6);
  assert.equal(read.chosen_by, owner.CHOSEN_BY.LANE);
  assert.equal(read.configured, false);
  assert.equal(read.needs_review, true, 'a number nobody chose is always up for review');
  assert.notEqual(read.chosen_by, owner.CHOSEN_BY.FOUNDER,
    'a receipt may never call a lane number the founder decision');
});

// ---------------------------------------------------------------------------
// 3. A NULL ALWAYS CARRIES ITS REASON, WHICH IS WHAT KILLS THE TRAP CLASS
// ---------------------------------------------------------------------------

test('a null value can never be silent: it always names who and why', function () {
  const configuredAndBroken = ['2,000', 'two thousand', 'unbounded', '-1', '0', '1e3', '1.5.2',
    'Infinity', 'NaN', '12abc', '  '];
  configuredAndBroken.forEach(function (value) {
    const read = owner.readCeiling('X_CEIL', { integer: true }, { X_CEIL: value });
    if (read.value !== null) return;
    assert.ok(read.chosen_by === owner.CHOSEN_BY.UNREADABLE
      || read.chosen_by === owner.CHOSEN_BY.NOBODY,
    'a null with no owner is exactly the trap: ' + JSON.stringify(value));
    assert.ok(read.reason, 'a null must name why: ' + JSON.stringify(value));
    assert.equal(read.needs_review, true, 'a null must always be surfaced: ' + JSON.stringify(value));
  });
});

test('a configured value that is not in force is never reported as working', function () {
  const saved = process.env.SEAT_CANON_DAILY_CAP_USD;
  try {
    process.env.SEAT_CANON_DAILY_CAP_USD = 'unbounded';
    const seat = seatMap.seat('canon');
    assert.equal(seat.dailyCapUsd, null, 'unreadable still fails closed when money is the stake');
    assert.equal(seat.capChosenBy, 'unreadable_setting',
      'this is the difference between a dead seat and a silently dead seat');
    assert.ok(seat.capReason, 'the shape fault is named so it is fixed in thirty seconds');
    assert.equal(seat.capNeedsReview, true);
  } finally {
    if (saved === undefined) delete process.env.SEAT_CANON_DAILY_CAP_USD;
    else process.env.SEAT_CANON_DAILY_CAP_USD = saved;
  }
});

test('a malformed call ceiling still fails closed, and still names the configuration', function () {
  const fixture = freshGuard({ DAILY_MODEL_CALL_CEIL: 'two thousand' });
  try {
    assert.equal(fixture.guard.allow('text'), false,
      'unreadable is the one case that must never admit, because money is the stake');
    const denial = fixture.guard.lastDenial(120000);
    assert.equal(denial.reason, 'daily_call_ceiling_configuration_invalid');
    assert.equal(denial.chosen_by, 'unreadable_setting');
    assert.ok(denial.why, 'the denial names the shape fault, not just the fact of refusal');
  } finally { fixture.restore(); }
});

test('every answer is one of the estate four words, and there is no fifth', function () {
  const allowed = Object.values(owner.CHOSEN_BY);
  assert.equal(allowed.length, 4);
  ['', '   ', '5', '0', 'x', '99999999999999999999999'].forEach(function (value) {
    [{ integer: true }, { decimals: 4, lane_value: 2 }, { integer: true, unlimited_when_unset: true }]
      .forEach(function (spec) {
        const read = owner.readCeiling('X_CEIL', spec, { X_CEIL: value });
        assert.ok(allowed.indexOf(read.chosen_by) !== -1,
          'unknown answer ' + read.chosen_by + ' for ' + JSON.stringify(value));
      });
  });
});

// ---------------------------------------------------------------------------
// 4. THE LITERALS THEMSELVES ARE GONE FROM THE SOURCE
// ---------------------------------------------------------------------------
// The behavioral tests above are the real guarantee. These are the tripwire: they fail the
// instant a lane reintroduces one of the removed constants under its old name, which is how the
// same defect shape came back four times in one day earlier this week.

test('the removed spend guard constants cannot come back by name', function () {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'spend.guard.js'), 'utf8');
  assert.doesNotMatch(src, /DEFAULT_TEXT_CEIL/, 'a built in default nobody chose may not return');
  assert.doesNotMatch(src, /DEFAULT_IMAGE_CEIL/, 'this is the one her image work ran on');
  assert.doesNotMatch(src, /MAX_TEXT_CEIL/, 'he was told this was a hard maximum; it was a literal');
  assert.doesNotMatch(src, /MAX_IMAGE_CEIL/);
  assert.match(src, /require\('\.\/ceiling\.owner\.js'\)/,
    'the guard must read the one source, not its own parse');
});

test('the seat cap reader holds no upper bound on what he may set', function () {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'seat.map.js'), 'utf8');
  const reader = src.slice(src.indexOf('function capDetail'), src.indexOf('function envUsd') + 200);
  assert.doesNotMatch(reader, /<=\s*\d/, 'no upper bound comparison may live in the cap reader');
  assert.doesNotMatch(reader, />=\s*\d/);
  assert.match(src, /require\('\.\/ceiling\.owner\.js'\)/,
    'the seat map must read the one source, not its own parse');
});

test('the one source itself holds no numeric upper bound of any kind', function () {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'ceiling.owner.js'), 'utf8');
  const code = src.split('\n').filter(function (line) {
    return !/^\s*\/\//.test(line);
  }).join('\n');
  assert.doesNotMatch(code, /\bs\.maximum\b/, 'no spec may carry a maximum');
  assert.doesNotMatch(code, /\bs\.max\b/);
  assert.doesNotMatch(code, /Math\.min\s*\(/, 'nothing here may trim a human number down');
  assert.doesNotMatch(code, /\bclamp\b/i);
});
