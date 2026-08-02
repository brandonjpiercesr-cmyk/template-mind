// ⬡B:test.shadow_model_hold_same_cycle:TEST:model_only_hold_never_mints_a_second_cycle:20260802⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const council = require('../pai/core/pai.outbound.council.js');

const INPUT = Object.freeze({
  hamUid: 'HAM.TEST',
  requestId: 'request.shadow.same-cycle.1',
  cycleId: 'HAM.TEST.1785640000000.shadow',
  question: 'What can you establish from this turn?',
  deliberationInput: 'Bound evidence for this exact test turn.',
  answer: 'The transfer cleared this morning.',
  channel: 'portal',
  delivery: { longForm: false, external: false },
  context: {}
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function modelOnlyHold(answer) {
  return {
    ok: false,
    reason: 'shadow_model_hold',
    answer,
    evidence: {
      deterministic: { verdict: 'PASS', flags: [], claims_checked: 1 },
      judgment: { approved: false, reason: 'Unsupported by the bound evidence.',
        claim: answer, model: 'shadow-test', via: 'test' },
      review_judgment: { approved: false, reason: 'The claim remains unsupported.',
        claim: answer, model: 'shadow-review-test', via: 'test' }
    }
  };
}

function makeHarness(shadowResults, healedAnswers) {
  const calls = [];
  const healCalls = [];
  const rows = new Map();
  let shadowIndex = 0;
  let healIndex = 0;
  let nextId = 8100;
  const stages = {};
  for (const stage of council.STAGE_ORDER) {
    stages[stage] = async function (ctx) {
      calls.push({ stage, cycleId: ctx.cycleId, answer: ctx.answer });
      if (stage === 'SHADOW') {
        const planned = shadowResults[Math.min(shadowIndex++, shadowResults.length - 1)];
        return typeof planned === 'function' ? planned(ctx.answer) : clone(planned);
      }
      return { ok: true, answer: ctx.answer, reason: stage + '_PASS', evidence: {} };
    };
  }
  return {
    calls,
    healCalls,
    deps: {
      stages,
      modelLadder: { async deliberate() {
        healCalls.push(true);
        const content = healedAnswers[Math.min(healIndex++, healedAnswers.length - 1)];
        return content == null ? null : { content };
      } },
      async persistReceipt(row) {
        const stored = Object.assign({ id: nextId++,
          created_at: '2026-08-02T06:30:00.000Z' }, clone(row));
        rows.set(stored.source, stored);
        return [clone(stored)];
      },
      async readReceipt(query) {
        const row = rows.get(query.source);
        return row ? [clone(row)] : [];
      },
      now: () => new Date('2026-08-02T06:30:00.000Z')
    }
  };
}

test('the repaired candidate crosses one council cycle without another runPAI turn',
  { concurrency: false }, async function () {
    const repaired = 'The available record does not establish whether the transfer cleared.';
    const h = makeHarness([modelOnlyHold(INPUT.answer),
      answer => modelOnlyHold(answer)], [repaired]);
    const result = await council.runOutboundCouncil(clone(INPUT), h.deps);

    assert.equal(result.ok, true, result.reason);
    assert.equal(result.cycle_id, INPUT.cycleId);
    assert.equal(result.answer, repaired);
    assert.equal(h.healCalls.length, 1);
    assert.deepEqual(h.calls.filter(call => call.stage === 'SHADOW').map(call => call.cycleId),
      [INPUT.cycleId, INPUT.cycleId]);
    const shadow = result.councilReceipt.stages.find(stage => stage.stage === 'SHADOW');
    assert.equal(shadow.reason, 'SHADOW_PASS_MODEL_ONLY_HOLD_CARRIED');
    assert.equal(shadow.evidence.model_only_hold_carried, true);
  });

test('a deterministic hold still fails closed after the same bounded repair',
  { concurrency: false }, async function () {
    const deterministic = answer => ({ ok: false,
      reason: 'shadow_deterministic_hold:preference', answer,
      evidence: { deterministic: { verdict: 'FLAG',
        flags: [{ reason: 'preference_provenance_missing' }] },
        judgment: { approved: true, reason: 'No model may overrule the board.' } } });
    const h = makeHarness([deterministic, deterministic], ['A revised unsupported claim.']);
    const result = await council.runOutboundCouncil(clone(INPUT), h.deps);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'shadow_deterministic_hold:preference');
    assert.equal(h.healCalls.length, 1);
    assert.equal(h.calls.some(call => call.stage === 'META_COMMENTARY'), false);
  });

test('a structured reach policy decision never carries a model-only hold, even with clean typed evidence',
  { concurrency: false }, async function () {
    // Codex review, live, on the anew-side companion: this carry path only re-validates the
    // deterministic board and the model's own quoted claim, never core/reach's closed-world
    // evidence check. A structured reach_policy_decision turn whose SHADOW hold names an
    // unsupported claim must stay fail-closed even with otherwise-clean typed evidence, or
    // an unevidenced reach decision could still be committed.
    const reachAnswer = JSON.stringify({
      action: 'send', channel: 'sms', importance: 5,
      message: 'The transfer cleared this morning.', reach: 'now',
      reason: 'unsupported reach decision', recheck_at: null
    });
    const reachInput = Object.assign({}, INPUT, { answer: reachAnswer, channel: 'reach',
      context: { mode: 'reach_policy_decision', outbound_finalize: true } });
    const h = makeHarness([modelOnlyHold(reachAnswer), answer => modelOnlyHold(answer)],
      [reachAnswer]);
    const result = await council.runOutboundCouncil(clone(reachInput), h.deps);

    assert.equal(result.ok, false,
      'a structured reach policy decision carried a model-only SHADOW hold as if evidenced');
    assert.equal(result.reason, 'shadow_model_hold');
  });

test('a forged bare reason cannot enter the clean-board exception',
  { concurrency: false }, async function () {
    const forged = answer => ({ ok: false, reason: 'shadow_model_hold', answer,
      evidence: { deterministic: { verdict: 'FLAG',
        flags: [{ reason: 'named_context' }] },
        judgment: { approved: false, claim: answer } } });
    const h = makeHarness([forged, forged], ['A repaired candidate that is still forged.']);
    const result = await council.runOutboundCouncil(clone(INPUT), h.deps);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'shadow_model_hold');
  });
