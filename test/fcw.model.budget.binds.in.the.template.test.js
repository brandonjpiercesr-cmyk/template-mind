// ⬡B:test.fcw_model_budget:LOCK:the_inherited_world_carries_the_guard_not_only_the_fix:20260815⬡
//
// WHY THIS FILE EXISTS, and it is not the same reason the anew copy exists.
//
// The 20260802 repair of the live founder outage lives in this repo too, byte-identically:
// pai/core/agent.find.js derives the default wall budget from the MODEL WINDOW
// (FCW_MODEL_CONTEXT_BYTES, default 786432) instead of from the Node V8 heap. Before it, the
// default was Math.floor(headroom / 32), which on a multi-GB box is a budget in the tens of
// megabytes: a bound that never binds. Measured live on 20260802: 2,012 beads and a 3,076,009
// character prompt sailed past the builder and died downstream at the provider window. Every
// ordinary turn came back memory_bank_build_failed. She was mute for days.
//
// THE FIX SHIPPED HERE. THE GUARD DID NOT. anew carries
// tests/fcw.partial.binds.and.model.budget.test.js, wired into ci-guard-suite. This repo, the
// mind-template every world inherits, carried the repaired line and nothing that would notice
// if it regressed. The byte-identity sync check protects the pair only while the pair is
// actually compared; it says nothing about whether the VALUE is still correct. A fix with no
// pin is a fix that can silently come back, and this is the seed every stranger's world grows
// from, so an unpinned regression here would ship the outage to all of them at once.
//
// THIS IS NOT A CAP AND MUST NEVER BECOME ONE. The assertion below is not "she may only read
// N bytes". It is "the DEFAULT may not promise a wall no provider can accept". The distinction
// is the whole point and it is pinned in the second test: an explicit seat context policy still
// names its own budget and is never touched. If someone later changes this file to assert a
// ceiling on what a SEAT may request, they have turned a guard into a cap, which is the reflex
// the founder banned, and this comment is the evidence that it was deliberate rather than drift.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const agentFind = require(path.join(__dirname, '..', 'pai', 'core', 'agent.find.js'));

// A finder that returns one small row. Nothing here reaches a network, a provider, or a brain.
function stubFinder() {
  return {
    walkFcwEvidence: async function () { return { ok: true, available: true }; },
    scanFcwEvidence: async function (_input, options) {
      await options.onPage(
        [{ id: 'row-1', source: 'pai.minutes.calendar', stamp_type: 'RESULT',
           summary: 'calendar note', importance: 7, created_at: '2026-08-02T00:00:00.000Z' }],
        { contributor: 'context', page: 0 });
      return { ok: true, available: true, partial: false, pages: 1, rows_seen: 1, failures: [] };
    },
    expandFcwEvidence: async function (_selections, _viewerTier, options) {
      return { ok: true, available: true, by_contributor: { context: [] }, retained_bytes: 0,
        max_bytes: options && options.max_bytes, envelope_reached: false, omitted: [] };
    }
  };
}

test('the inherited default budget binds to the model window, not to this machine heap', async function () {
  const out = await agentFind.planWallEvidence(
    { ham_uid: 'HAM.TEMPLATE.BUDGET', seat_node_id: 'station.pai', seat_name: 'pai',
      question: 'what is on my calendar' },
    { findModule: stubFinder() });

  assert.equal(out.ok, true, 'the wall still binds');
  // The regression this catches: a budget derived from heap headroom. On a large-heap runner
  // that value is tens of megabytes and this assertion is the only thing that would notice.
  assert.ok(out.fcw_byte_budget <= 786432,
    'default budget ' + out.fcw_byte_budget + ' exceeds the model window ceiling, '
    + 'which is the exact shape of the 20260802 outage');
  assert.ok(out.fcw_byte_budget >= 16384, 'the floor still holds, the wall is not starved');
});

test('an explicit seat context policy still names its own budget, so this is a guard and not a cap', async function () {
  const explicit = await agentFind.planWallEvidence(
    { ham_uid: 'HAM.TEMPLATE.BUDGET', seat_node_id: 'station.pai', seat_name: 'pai',
      question: 'what is on my calendar', fcw_byte_budget: 5000000 },
    { findModule: stubFinder() });

  assert.equal(explicit.ok, true);
  // Deliberately far above the default ceiling. A seat that names its own budget is honored
  // exactly. The moment this assertion changes to clamp the seat, the guard has become a cap.
  assert.equal(explicit.fcw_byte_budget, 5000000,
    'an explicit seat budget must pass through untouched');
  assert.equal(explicit.context_budget_source, 'requesting_seat_context_policy');
});

test('the env name is the one the repair actually reads, so a rename cannot silently unbind it', async function () {
  const before = process.env.FCW_MODEL_CONTEXT_BYTES;
  process.env.FCW_MODEL_CONTEXT_BYTES = '32768';
  try {
    const out = await agentFind.planWallEvidence(
      { ham_uid: 'HAM.TEMPLATE.BUDGET', seat_node_id: 'station.pai', seat_name: 'pai',
        question: 'what is on my calendar' },
      { findModule: stubFinder() });
    assert.equal(out.ok, true);
    // If the code stopped reading this env name, the budget would fall back to the heap-derived
    // number and sail past 32768. This is what proves the wiring, not just the arithmetic.
    assert.ok(out.fcw_byte_budget <= 32768,
      'FCW_MODEL_CONTEXT_BYTES is not being read: got ' + out.fcw_byte_budget);
  } finally {
    if (before === undefined) delete process.env.FCW_MODEL_CONTEXT_BYTES;
    else process.env.FCW_MODEL_CONTEXT_BYTES = before;
  }
});
