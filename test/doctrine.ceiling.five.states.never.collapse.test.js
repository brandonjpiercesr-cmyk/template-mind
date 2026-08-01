// ⬡B:tests.ceiling_five_states:LAW:the_state_space_is_the_invariant_not_the_four_sites:20260801⬡
// Mirror of anew#1494's tests/ceiling.five.states.never.collapse.test.js, scoped to what this
// repo actually carries: pai/core/ceiling.owner.js and pai/core/spend.guard.js#describeCeiling(),
// the ONE shared classifier every reporting surface must delegate to rather than re-deriving
// its own branching. The reporting surfaces themselves (routes/launch.state.routes.js,
// routes/spend.ceiling.routes.js, core/autonomy.governor.js) are anew-only and are not mirrored
// here; this pins the classifier's own contract, which both worlds inherit identically.
//
// THE FIVE STATES a daily call ceiling can genuinely be in:
//   1. UNSET                   nobody ever configured this setting.
//   2. CONFIGURED               a real, finite, safe value is in force.
//   3. CONFIGURED_ABOVE_RANGE   configured, but larger than this process can represent
//                               exactly (or an overflowed digit run): a deliberate ask for
//                               MORE, needs_review, not the same as UNSET or UNREADABLE.
//   4. UNREADABLE               configured but unparseable; fails closed by design.
//   5. LANE_DEFAULT             a coder's baked default stands in (seat caps, not the call
//                               ceiling, which never passes a lane_value).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SENTINEL = String(Number.MAX_SAFE_INTEGER);

function withCeilEnv(env, fn) {
  const path = require.resolve('../pai/core/spend.guard.js');
  delete require.cache[path];
  const prior = process.env.DAILY_MODEL_CALL_CEIL;
  if (env.DAILY_MODEL_CALL_CEIL === undefined) delete process.env.DAILY_MODEL_CALL_CEIL;
  else process.env.DAILY_MODEL_CALL_CEIL = env.DAILY_MODEL_CALL_CEIL;
  try {
    const guard = require(path);
    return fn(guard);
  } finally {
    if (prior === undefined) delete process.env.DAILY_MODEL_CALL_CEIL;
    else process.env.DAILY_MODEL_CALL_CEIL = prior;
  }
}

const CASES = [
  { label: 'unset', env: {}, state: 'unset' },
  { label: 'configured', env: { DAILY_MODEL_CALL_CEIL: '500' }, state: 'configured' },
  { label: 'configured_above_range', env: { DAILY_MODEL_CALL_CEIL: '9'.repeat(309) },
    state: 'configured_above_range' },
  { label: 'unreadable', env: { DAILY_MODEL_CALL_CEIL: 'two thousand' }, state: 'unreadable' }
];

function describedFor(c) {
  return withCeilEnv(c.env, function (g) { return g.describeCeiling(g.ceilDetail('text')); });
}

test('describeCeiling() classifies all four reachable call-ceiling states distinctly, never collapsing a pair', function () {
  const guard = require('../pai/core/spend.guard.js');
  const seen = new Map();
  const byState = {};
  for (const c of CASES) {
    const described = describedFor(c);
    byState[c.state] = described;
    assert.equal(described.state, c.state, c.label + ' must classify as ' + c.state);
    assert.ok(!seen.has(described.state) || seen.get(described.state) === c.label,
      'two different inputs produced the same state label, a real collapse');
    seen.set(described.state, c.label);
  }
  assert.equal(seen.size, 4, 'all four cases must produce four DISTINCT states');

  for (const c of CASES) {
    assert.notEqual(String(byState[c.state].value), SENTINEL,
      c.label + ' must never report the raw admission sentinel as its value');
  }
  assert.equal(byState.configured.in_force, true);
  assert.equal(byState.unset.in_force, false);
  assert.equal(byState.configured_above_range.in_force, false);
  assert.equal(byState.unreadable.in_force, false);

  assert.equal(byState.configured_above_range.needs_review, true);
  assert.equal(byState.unreadable.needs_review, true);
  assert.equal(byState.configured.needs_review, false);

  assert.notEqual(byState.unset.note, byState.configured_above_range.note,
    'UNSET and CONFIGURED_ABOVE_RANGE are both unlimited but are not the same event, and ' +
    'must not share one note');
  assert.equal(byState.unset.unlimited, true);
  assert.equal(byState.configured_above_range.unlimited, true);

  const laneDetail = require('../pai/core/ceiling.owner.js').readCeiling('X',
    { decimals: 4, lane_value: 6 }, {});
  const laneDescribed = guard.describeCeiling(laneDetail);
  assert.equal(laneDescribed.state, 'lane_default');
  assert.equal(laneDescribed.in_force, true, 'a working coder default IS in force, just not his');
  assert.notEqual(laneDescribed.value, null);
});
