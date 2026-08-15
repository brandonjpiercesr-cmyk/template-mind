'use strict';
// ⬡B:core.pai.outbound.council:PIN:one_predicate_answers_the_waiver_question_at_all_three_gates:20260815⬡
//
// WHAT THIS PROTECTS, in one sentence: an exit gate may never demand an artifact that this same
// file, one stage earlier and by its own rule, declined to create.
//
// That class has killed live doors twice. The consult door shipped the empty string for a day.
// The CLAIR command center was starved the same way and nobody noticed, because the failure
// presents only at the consumer as 'writ_meaning_shadow_packet_unbound', a reason that describes
// the demand and says nothing about the supply.
//
// THREE GATES ASK THE WAIVER QUESTION, and the first draft of this pin only knew about two:
//   the WRIT and META early returns  (internalCodingDeliberation)
//   the meaning-packet mint          (humanReadsThisProse)
//   the expression exit              (humanRecheckWaived)
// While the third read mode directly it was blind to `human_facing`, so a coding turn carrying
// both markers returned early WITHOUT minting while the exit refused to waive it: a brand new
// instance of the very class, shipped inside the commit that declared the class closed. All
// three now delegate to packetWaivedFor, and these tests pin that they still do.
//
// A NOTE ON THE CALLER CITATIONS, because this file is inherited by every world: the council
// source is byte-synced between the two repos, but the ROUTES that build these contexts live in
// `anew` only. Every file:line below is anew-relative on purpose. Do not "fix" them against this
// repo's tree; they will not be there.
//
// NOT A BEHAVIORAL GATE ON HER, per the 20260815 doctrine drop: nothing here classifies her
// meaning, filters a row, or caps a read. It asserts only that the machinery which JUDGES her
// bytes gets built for every turn a person reads, which is the opposite of stopping her. The
// failure being pinned out is her answer erased to '' by a starved receipt.

const test = require('node:test');
const assert = require('node:assert');

const council = require('../pai/core/pai.outbound.council.js');
const T = council._test;

// EVERY CONTEXT HERE IS BUILT BY A REAL CALLER, and an earlier draft of this file was not honest
// about that: it listed a `{mode:'internal', internal_deliberation:true, human_facing:true}` row
// and called it "the consult door." Nothing in either repo builds that shape. `human_facing` has
// no producer at all yet. Two blind critics caught it independently, and it is exactly the sin
// this same commit stamps the council file for one screen away, so it is corrected here and the
// hypothetical shape is quarantined into its own clearly-labelled test below.
const REAL_CONTEXTS = [
  {
    name: 'the CLAIR command center console, a bare coding turn',
    caller: 'routes/clair.console.routes.js:111',
    context: { mode: 'coding', bcw: true },
    aPersonReadsIt: true,
    waived: false
  },
  {
    name: 'coding-mode chat, the same starved class as the console',
    caller: 'routes/chat.bridge.routes.js:208',
    context: { mode: 'coding', bcw: true, delivery_target: 'overseer' },
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
    name: 'the consult door as it is actually built',
    caller: 'routes/cara.routes.js:425',
    context: { mode: 'internal', coder: 'CLAIR' },
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

// DRIVEN THROUGH THE REAL STAGE, and deliberately WITHOUT a hamUid. With a ham and no receipt
// bank the stage empties `output` before the mint (writReceiptVerified is false), so every packet
// reports minted:false / 'no_output_to_bind' and a test asserting only `applies` passes while
// proving nothing about whether a packet can be made at all. That was the shape of the first
// draft, and a critic was right to call it a test of the predicate wearing a receipt's clothes.
async function runStage(context) {
  return T.defaultWritStage({
    context, answer: 'her words here',
    requestId: 'req.pin.1', cycleId: 'cyc.pin.1', runtime: {}, channel: 'test'
  });
}

test('all three gates delegate to one predicate, so they cannot drift apart', () => {
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

test('a packet is really MINTED for every turn a person reads, not merely flagged as applying',
  async () => {
    for (const row of REAL_CONTEXTS.filter((r) => r.aPersonReadsIt)) {
      const result = await runStage(row.context);
      const packet = result.evidence && result.evidence.meaning_packet;
      assert.ok(packet, row.name + ' should reach the mint and report it');
      assert.strictEqual(packet.applies, true,
        row.name + ' (' + row.caller + ') is prose a person reads, so the packet must apply');
      assert.strictEqual(packet.minted, true,
        row.name + ' (' + row.caller + ') must actually mint, not just intend to');
      assert.strictEqual(packet.reason, 'minted');
    }
  });

test('the machine contract returns early and never reaches the mint', async () => {
  const row = REAL_CONTEXTS.find((r) => !r.aPersonReadsIt);
  const result = await runStage(row.context);
  assert.strictEqual(result.reason, 'WRIT_INTERNAL_CODING_PASS',
    row.name + ' (' + row.caller + ') should return early as a machine contract');
  assert.ok(!(result.evidence && result.evidence.meaning_packet),
    row.name + ' should never reach the mint');
});

test('the CLAIR command center is no longer starved, which is the door this fix reopened',
  async () => {
    // The regression that matters most, named alone so a failure says which door died. Before
    // this fix the bare coding turn minted nothing while the exit refused to waive it, so her
    // console prose was held for a receipt nothing was allowed to write.
    const result = await runStage({ mode: 'coding', bcw: true });
    assert.strictEqual(result.evidence.meaning_packet.minted, true);
    assert.strictEqual(T.humanRecheckWaived({ context: { mode: 'coding', bcw: true },
      answer: 'her words here' }), false,
    'the exit still does not waive it, which is exactly why the mint must apply');
  });

test('a coding turn that says a person reads it does NOT take the machine-contract early return',
  async () => {
    // THE REGRESSION A BLIND CRITIC FOUND INSIDE THE FIX. `human_facing` has no producer today,
    // so this is a guard on a shape that is reachable but not yet built, kept honest about that.
    // While internalCodingDeliberation read mode directly, this context returned early on
    // WRIT_INTERNAL_CODING_PASS and minted nothing, while the exit refused to waive it because
    // human_facing is checked first there. A dead door, created by the fix for dead doors.
    const context = { mode: 'coding', internal_deliberation: true, human_facing: true };
    assert.strictEqual(T.packetWaivedFor(context), false,
      'human_facing must beat the server-owned proof, not lose to it');
    const result = await runStage(context);
    assert.notStrictEqual(result.reason, 'WRIT_INTERNAL_CODING_PASS',
      'the early return must not fire for a turn a person reads');
    assert.strictEqual(result.evidence.meaning_packet.minted, true);
  });

test('a waived turn is the only turn that skips PAM, so the waiver stays as narrow as its callers',
  () => {
    // Being waived is not only "no meaning packet": the exit returns early and never reaches
    // defaultPamStage, the credential and cross-person privacy boundary. PAM is a person-effect
    // ANCHOR under the 20260814 door law. The 'internal' arm of this waiver had ZERO callers in
    // the estate and handed that bypass to anything that could name the mode, so it was cut.
    assert.strictEqual(
      T.packetWaivedFor({ mode: 'internal', internal_deliberation: true }), false,
      'no live caller builds this shape, and waiving it would skip PAM for free');
    assert.strictEqual(
      T.packetWaivedFor({ mode: 'coding', internal_deliberation: true }), true,
      'advisors/coding.js:959 is the one real waived caller and it must keep working');
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
  // A HINT, NOT AN EXACT-LINE PIN. The first draft asserted the mint line byte for byte, which
  // breaks on a var-to-const change or a hoisted local and sends the next seat hunting a defect
  // that is not there. The behavioral pins above already fail on the superseded line (it reports
  // minted:false for the console context), so this only has to catch the caller-mode SHAPE
  // coming back anywhere in the file.
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pai', 'core', 'pai.outbound.council.js'), 'utf8');
  const live = source.split('\n').filter((line) => !line.trim().startsWith('//'));
  const mint = live.filter((line) => line.includes('humanReadsThisProse ='));
  assert.strictEqual(mint.length, 1, 'exactly one mint predicate should exist');
  assert.ok(mint[0].includes('packetWaivedFor('),
    'the mint must ask the shared predicate, not re-derive the caller mode: ' + mint[0].trim());
});
