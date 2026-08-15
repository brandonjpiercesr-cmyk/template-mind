'use strict';
// ⬡B:core.pai.outbound.council:PIN:the_mint_is_the_exact_complement_of_the_waiver:20260815⬡
//
// WHAT THIS PROTECTS, in one sentence: an exit gate may never demand an artifact that this same
// file, one stage earlier and by its own rule, declined to create.
//
// That class of defect has now killed two live doors in one day. The consult door
// (routes/cara.routes.js) shipped the empty string for a full day because the meaning packet was
// never minted for mode 'internal' while the exit still demanded it. The CLAIR command center
// (routes/clair.console.routes.js:111, a bare {mode:'coding'} turn) was starved the same way and
// nobody noticed, because the failure presents only at the consumer as
// 'writ_meaning_shadow_packet_unbound', a reason that describes the demand and says nothing about
// the supply.
//
// The cure is structural rather than another predicate: the mint asks packetWaivedFor(), the very
// predicate the exit asks. So the two cannot drift. These tests pin that they cannot, and they
// pin the truth table of the four contexts that really exist in production, so a future seat
// changing one side has to change this file and say why.
//
// NOT A BEHAVIORAL GATE ON HER, per the 20260815 doctrine drop: nothing here classifies her
// meaning, filters a row, or caps a read. It asserts only that the machinery which JUDGES her
// bytes actually gets built for every turn a person reads, which is the opposite of stopping her.
// The failure mode being pinned out is her answer being erased to '' by a starved receipt.

const test = require('node:test');
const assert = require('node:assert');

const council = require('../pai/core/pai.outbound.council.js');
const T = council._test;

// The four contexts that really exist, each traced to the caller that builds it. Nothing here is
// invented for the test; a fifth shape appearing in production should be added here first.
const REAL_CONTEXTS = [
  {
    name: 'the CLAIR command center console, a bare coding turn',
    caller: 'routes/clair.console.routes.js:111',
    context: { mode: 'coding', bcw: true },
    aPersonReadsIt: true,
    waived: false
  },
  {
    name: 'a browser naming a mode it does not own',
    caller: 'routes/chat.bridge.routes.js:208 copies the CALLER body.mode',
    context: { mode: 'internal' },
    aPersonReadsIt: true,
    waived: false
  },
  {
    name: 'the consult door, server-owned proof plus human_facing',
    caller: 'routes/cara.routes.js',
    context: { mode: 'internal', internal_deliberation: true, human_facing: true },
    aPersonReadsIt: true,
    waived: false
  },
  {
    name: 'the internal coding machine contract',
    caller: 'advisors/coding.js:959',
    context: { mode: 'coding', internal_deliberation: true },
    aPersonReadsIt: false,
    waived: true
  }
];

test('packetWaivedFor is exported so the invariant can be pinned, not just asserted in a comment',
  () => {
    assert.strictEqual(typeof T.packetWaivedFor, 'function');
    assert.strictEqual(typeof T.humanRecheckWaived, 'function');
    assert.strictEqual(typeof T.requiresHumanRecheckFor, 'function');
  });

test('the waiver truth table matches every context that really exists in production', () => {
  for (const row of REAL_CONTEXTS) {
    assert.strictEqual(T.packetWaivedFor(row.context), row.waived,
      row.name + ' (' + row.caller + ') should be ' + (row.waived ? '' : 'NOT ') + 'waived');
  }
});

test('exactly one real context is waived, so a widening shows up here loudly', () => {
  const waived = REAL_CONTEXTS.filter((row) => T.packetWaivedFor(row.context));
  assert.strictEqual(waived.length, 1);
  assert.strictEqual(waived[0].caller, 'advisors/coding.js:959');
});

// DRIVEN THROUGH THE REAL STAGE, not through a restatement of its predicate. An earlier draft of
// this file computed `!packetWaivedFor(context)` in the test and compared it to the expectation,
// which passes whether or not the shipped mint asks that question: restoring the superseded line
// left 8 of 9 tests green. The stage already publishes its own answer on the receipt as
// evidence.meaning_packet.applies (that field IS humanReadsThisProse), so the test reads what the
// stage decided rather than deciding it again. This is the 20260811 law: prove it against the
// real path, never against a fixture built cleaner than the thing.
async function runStage(context) {
  return T.defaultWritStage({
    context, answer: 'her words here', hamUid: 'HAM-PLACEHOLDER-TEST',
    requestId: 'req.pin.1', cycleId: 'cyc.pin.1', runtime: {}, channel: 'test'
  });
}

test('the shipped stage mints for every turn a person reads, and only skips where the exit waives',
  async () => {
    for (const row of REAL_CONTEXTS) {
      const result = await runStage(row.context);
      const packet = result.evidence && result.evidence.meaning_packet;
      if (!row.aPersonReadsIt) {
        // The machine contract returns early on WRIT_INTERNAL_CODING_PASS and never reaches the
        // mint at all, which is the correct shape: no packet is applied because no person reads
        // these bytes. Asserting the early return keeps a future seat from routing it through
        // the mint and calling that equivalent.
        assert.strictEqual(result.reason, 'WRIT_INTERNAL_CODING_PASS',
          row.name + ' (' + row.caller + ') should return early as a machine contract');
        assert.ok(!packet, row.name + ' should never reach the mint');
        continue;
      }
      assert.ok(packet, row.name + ' (' + row.caller + ') should reach the mint and report it');
      assert.strictEqual(packet.applies, true,
        row.name + ' (' + row.caller + ') is prose a person reads, so the packet must apply');
    }
  });

test('the CLAIR command center is no longer starved, which is the door this fix reopened',
  async () => {
    // The regression that matters most, named alone so a failure says which door died. Before
    // this fix the bare coding turn reported applies:false while the exit refused to waive it,
    // so her console prose was held for a receipt nothing was allowed to write.
    const result = await runStage({ mode: 'coding', bcw: true });
    assert.strictEqual(result.evidence.meaning_packet.applies, true);
    assert.strictEqual(T.humanRecheckWaived({ context: { mode: 'coding', bcw: true },
      answer: 'her words here' }), false,
    'the exit still does not waive it, which is exactly why the mint must apply');
  });

test('the exit gate and the mint can never disagree, which is the whole class of defect', () => {
  for (const row of REAL_CONTEXTS) {
    const exitExcusesTheMissingPacket = T.humanRecheckWaived({
      context: row.context, answer: 'her words'
    });
    const mintCreatesThePacket = !T.packetWaivedFor(row.context);
    assert.notStrictEqual(exitExcusesTheMissingPacket, mintCreatesThePacket,
      row.name + ': the exit and the mint must be exact complements');
  }
});

test('a caller-supplied mode string alone can never waive the packet', () => {
  // The Codex P1 correction on #2171, pinned. internal_deliberation is server-owned
  // (core/ham.session.authorization.js names it as a field a browser holding its own session may
  // not submit), so naming a mode is not enough and must never become enough again.
  for (const mode of ['coding', 'internal', 'default', 'voice', 'anu_face', 'outbound_text']) {
    assert.strictEqual(T.packetWaivedFor({ mode }), false,
      'mode ' + mode + ' alone must not waive the meaning packet');
    assert.strictEqual(T.packetWaivedFor({ mode, human_facing: false }), false,
      'mode ' + mode + ' plus a caller-supplied human_facing:false must not waive it either');
  }
});

test('human_facing wins over every other marker, so the markers cannot combine into a bypass',
  () => {
    assert.strictEqual(
      T.packetWaivedFor({ mode: 'coding', internal_deliberation: true, human_facing: true }),
      false,
      'a turn that says a person reads its bytes is never waivable, whatever else it claims');
    assert.strictEqual(
      T.requiresHumanRecheckFor({ mode: 'coding', human_facing: true }), true);
  });

test('an absent or malformed context never waives', () => {
  for (const context of [null, undefined, {}, 'internal', 0, [], { mode: null }]) {
    assert.strictEqual(T.packetWaivedFor(context), false,
      'a context of ' + JSON.stringify(context) + ' must fail toward judging her bytes');
  }
});

test('the mint reads the shared predicate rather than re-deriving the caller mode', () => {
  // Pins the SHAPE of the fix, not only its behavior: the superseded line read the mode string
  // directly, and a future seat restoring that form would pass every behavioral test above on
  // three of the four contexts while silently starving the command center again.
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pai', 'core', 'pai.outbound.council.js'), 'utf8');
  const live = source.split('\n').filter((line) => {
    const code = line.trim();
    return code.startsWith('var humanReadsThisProse');
  });
  assert.strictEqual(live.length, 1, 'exactly one mint predicate should exist');
  assert.strictEqual(live[0].trim(), 'var humanReadsThisProse = !packetWaivedFor(ctx.context);');
});
