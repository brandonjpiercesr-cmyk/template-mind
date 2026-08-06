// ⬡B:tests.r1e_silence_boundary:TEST:healable_gates_resubmit_once_terminal_silence_is_truthful:20260719⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const C2_CANONICAL_MODEL = require('../pai/core/seat.map.js').SEATS.c2_organ.model;

function at() {
  return require.resolve(path.join.apply(path, [ROOT].concat(Array.from(arguments))));
}

function cacheModule(filename, exports) {
  require.cache[filename] = { id:filename, filename:filename, loaded:true, exports:exports };
}

function runPaiHarness(t, options) {
  options = options || {};
  const paths = {
    tool:at('pai', 'core', 'tool.loop.js'),
    builder:at('pai', 'core', 'fcw.builder.js'),
    council:at('pai', 'core', 'pai.outbound.council.js'),
    fusion:at('pai', 'core', 'context.fusion.js'),
    screen:at('pai', 'core', 'stream', 'screen.awareness.js'),
    format:at('pai', 'core', 'format.matrix.js'),
    synthesize:at('pai', 'core', 'synthesize.js'),
    persona:at('pai', 'core', 'persona.js'),
    ladder:at('pai', 'core', 'model.ladder.js'),
    tracker:at('pai', 'core', 'tracker.js'),
    policy:at('pai', 'core', 'reach', 'policy.contract.js'),
    keeper:at('pai', 'core', 'memory.keeper.js')
  };
  const files = Object.values(paths);
  const priorModules = new Map(files.map(function (filename) {
    return [filename, require.cache[filename]];
  }));
  const envNames = ['TOGETHER_API_KEY','TOGETHER_MODEL','OPENROUTER_API_KEY',
    'OR_KEY_C2_ORGAN','SEAT_C2_MODEL',
    'TRY_ORNITH_CONVERSATIONAL','ORNITH_URL','RUNPOD_API_KEY','MEMORY_BANK_URL',
    'MEMORY_BANK_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY','BEAD_TABLE','BRAIN_SCHEMA'];
  const priorEnv = Object.fromEntries(envNames.map(function (name) {
    return [name, process.env[name]];
  }));
  const priorFetch = global.fetch;
  const hadPaiLastError = Object.prototype.hasOwnProperty.call(global, '_paiLastError');
  const priorPaiLastError = global._paiLastError;
  t.after(function () {
    global.fetch = priorFetch;
    envNames.forEach(function (name) {
      if (priorEnv[name] === undefined) delete process.env[name];
      else process.env[name] = priorEnv[name];
    });
    files.forEach(function (filename) {
      const prior = priorModules.get(filename);
      if (prior) require.cache[filename] = prior;
      else delete require.cache[filename];
    });
    if (hadPaiLastError) global._paiLastError = priorPaiLastError;
    else delete global._paiLastError;
  });

  const calls = { provider:[], council:[], ladder:[], extract:[], format:[],
    shadow:[], pam:[], persona:[], push:[], track:[], keeper:[], brain:[], steps:[] };
  const humanFacing = options.isHumanFacing || function (value) {
    return typeof value === 'string' && !!value.trim() &&
      !/<(?:tool_call|function)\b/i.test(value);
  };
  const pendingEffectsBinding=function (value) {
    const exact=Array.isArray(value)?value:[];
    return{count:exact.length,digest:'template.pending.'+JSON.stringify(exact)};
  };
  cacheModule(paths.builder, { buildMemoryBank:async function () {
    return { ok:true, system_prompt:'Exact test-only HAM wall.',
      ham:{ uid:'HAM.ONE', name:'Test HAM', tier:10 }, context:[],
      identity_evidence:{ schema:'anew.identity.evidence.result.v1', ok:true,
        available:true, ham_uid:'HAM.ONE', subjects:[], records:[], count:0, ms:0 },
      contributors:{}, contributorsResolved:0, contributorsTotal:0, ms:1 };
  } });
  cacheModule(paths.council, {
    runOutboundCouncil:async function (input) {
      calls.council.push(input);
      const pendingBinding=pendingEffectsBinding(input.context&&input.context.pending_effects);
      return { ok:true, answer:input.answer,
        stages:Array.from({ length:7 }, function (_, index) {
          return { stage:'test-stage-' + index, ok:true };
        }),
        council_receipt:{ source:'r1e.test.council', row_count:9,
          stage_count:7, readback_verified:true,
          pending_effects_count:pendingBinding.count,
          pending_effects_digest:pendingBinding.digest },
        stamp_proof:{ committed:true, row_count:9, readback_verified:true,
          pending_effects_count:pendingBinding.count,
          pending_effects_digest:pendingBinding.digest } };
    },
    requireVerifiedCouncilResult:function (result) {
      return { ok:true, answer:result.answer, stamp_proof:result.stamp_proof };
    },
    requireVerifiedCouncilDelivery:function () { return { ok:false }; },
    compactCouncilProof:function (result) { return result && result.stamp_proof; },
    createPendingEffectsBinding:pendingEffectsBinding,
    canonicalizeDeliveryTarget:function (value) { return value || null; },
    extractNamedContextEvidence:function () { return []; },
    namedContextContradictions:function () { return []; },
    currentAssistantPreferenceRequest:function () { return false; },
    preferenceJudgmentFindings:function () { return []; },
    boundedCouncilFailureCodes:function () { return ''; },
    isHumanFacingAnswer:humanFacing
  });
  cacheModule(paths.fusion, { getLatestSummary:async function () { return ''; } });
  cacheModule(paths.screen, {
    promptAddendum:function () { return ''; },
    hasLiveScreen:function () { return true; },
    extract:function (answer) {
      calls.extract.push(answer);
      return options.extract ? options.extract(answer, calls.extract.length, calls)
        : { answer:answer, block:null };
    },
    push:async function (hamUid, block) {
      calls.push.push({ hamUid:hamUid, block:block });
      return { pushed:1 };
    }
  });
  cacheModule(paths.format, { formatForDestination:function (answer, destination) {
    calls.format.push({ answer:answer, destination:destination });
    return options.format ? options.format(answer, calls.format.length, calls) : answer;
  } });
  cacheModule(paths.synthesize, {
    shadowAudit:function (answer) {
      calls.shadow.push(answer);
      return options.shadow ? options.shadow(answer, calls.shadow.length, calls)
        : { clean:answer };
    },
    pamGate:function (answer, tier) {
      calls.pam.push({ answer:answer, tier:tier });
      return options.pam ? options.pam(answer, tier, calls.pam.length, calls)
        : { gated:false };
    }
  });
  cacheModule(paths.persona, { applyPersona:function (answer, context) {
    calls.persona.push({ answer:answer, context:context });
    return options.persona ? options.persona(answer, context, calls.persona.length, calls)
      : answer;
  } });
  cacheModule(paths.ladder, { deliberate:async function (system, user, request) {
    calls.ladder.push({ system:system, user:user, request:request });
    const result = options.ladder
      ? await options.ladder(system, user, request, calls.ladder.length, calls)
      : { content:'' };
    return typeof result === 'string' ? { content:result } : result;
  } });
  cacheModule(paths.tracker, {
    looksLikeActionRequest:function (message) {
      return options.looksLikeAction ? options.looksLikeAction(message, calls) : false;
    },
    stampTrack:async function (input) {
      calls.track.push(input);
      return { ok:true };
    }
  });
  cacheModule(paths.keeper, { keepTurn:async function (input) {
    calls.keeper.push(input);
    return {ok:true,turn_record:{ok:true,readback_verified:true},
      gift:{kept:false,reason:'not_a_gift'}};
  } });
  if (options.policy) cacheModule(paths.policy, options.policy);

  // seatKey:null reproduces the live 20260727 world exactly: the PAI seat has no named key,
  // so the completion door refuses before any fetch and the ladder has nothing either. Every
  // other test in this file wants a working seat, so the key stays on by default.
  if (options.seatKey === null) delete process.env.OR_KEY_C2_ORGAN;
  else process.env.OR_KEY_C2_ORGAN = 'r1e-test-key';
  // Use the canonical seat model rather than an invented test slug. Capability resolution
  // intentionally fails closed for unknown overrides, so a fake model would stop at
  // pai_seat_cannot_call_tools and never exercise the provider result this harness owns.
  process.env.SEAT_C2_MODEL = C2_CANONICAL_MODEL;
  delete process.env.TOGETHER_API_KEY;
  delete process.env.TOGETHER_MODEL;
  ['OPENROUTER_API_KEY','TRY_ORNITH_CONVERSATIONAL','ORNITH_URL','RUNPOD_API_KEY',
    'AIBE_BRAIN_URL','AIBE_BRAIN_KEY','BEAD_TABLE','BRAIN_SCHEMA'].forEach(function (name) {
    delete process.env[name];
  });
  if (options.telemetry) {
    process.env.MEMORY_BANK_URL = 'https://r1e-brain.test';
    process.env.MEMORY_BANK_KEY = 'r1e-brain-key';
  } else {
    delete process.env.MEMORY_BANK_URL;
    delete process.env.MEMORY_BANK_KEY;
  }
  global.fetch = async function (url, init) {
    const href = String(url);
    if (href.includes('openrouter.ai/api')) {
      calls.provider.push({ url:href, body:JSON.parse(init.body) });
      const payload = options.providerPayload || { choices:[{ finish_reason:'stop',
        message:{ role:'assistant', content:options.draft === undefined
          ? 'Initial human-facing draft.' : options.draft } }] };
      return { ok:true, status:200, json:async function () { return payload; } };
    }
    if (href.startsWith('https://r1e-brain.test/')) {
      const body = JSON.parse(init.body);
      calls.brain.push(body);
      if (body.stamp_type === 'CYCLE_STEP') {
        const content = JSON.parse(body.content);
        calls.steps.push({ step:content.step, detail:content.detail });
      }
      return { ok:true, status:201, json:async function () { return []; } };
    }
    throw new Error('unexpected_test_fetch:' + href);
  };

  delete require.cache[paths.tool];
  const loop = require(paths.tool);
  return {
    calls:calls,
    run:function () {
      const message = options.message || 'Respond plainly to this request.';
      const channel = options.channel || 'text';
      const identity = Object.assign({ request_id:'r1e.acceptance.request.0001',
        user_message:message, delivery:{ external:true },
        council_context:{ mode:'r1e_acceptance' } }, options.identity || {});
      return loop.runPAI('HAM.ONE', message, channel, identity, []);
    }
  };
}
test('runPAI tracker recovery returns an honest fallback without a false silent stamp',
  { concurrency:false }, async function (t) {
    const harness = runPaiHarness(t, {
      telemetry:true,
      message:'Can you send the update?',
      draft:'<noop>{}</noop>',
      ladder:async function () { return { content:'' }; },
      looksLikeAction:function () { return true; }
    });
    const result = await harness.run();
    const steps = harness.calls.steps.map(function (entry) { return entry.step; });

    assert.equal(result.ok, true, result.reason);
    assert.match(result.answer, /logged your full request so nothing is lost/);
    // ⬡B:tests.r1e_silence:SUPERSEDE:the_last_word_gets_its_own_budget:20260726⬡
    // This was 1, and that single shared budget is why the founder met a canned sentence.
    // exhaustion_forced_synthesis, the full-cap "answer the whole ask, do not narrow"
    // recovery, was gated on the SAME flag the earlier bounded repair sets, so on the exact
    // path it was written for it could never run. One flag was doing two jobs: bounding
    // repair spend, and bounding the last word before a canned line goes to a human. The
    // exhaustion synthesis has its own single-attempt budget now, so this turn makes two
    // bounded ladder attempts before the honest limit line, not one. Both still return
    // empty here, so the honest fallback asserted above is unchanged (#uncap, CLAIR).
    assert.equal(harness.calls.ladder.length, 2);
    assert.equal(harness.calls.track.length, 1);
    assert.equal(harness.calls.track[0].status, 'BLOCKED');
    assert.equal(harness.calls.keeper.length, 1,
      'the working-limit answer cannot claim the request was logged without a verified keeper');
    assert.equal(harness.calls.keeper[0].question, 'Can you send the update?');
    assert.equal(harness.calls.keeper[0].answer, result.answer);
    assert.equal(result.memory_keeper.turn_record.readback_verified, true);
    assert.equal(harness.calls.council.length, 1);
    assert.equal(steps.includes('cycle_end_silent'), false,
      'a tracker-recovered answer was stamped as terminal silence');
    assert.equal(steps.includes('cycle_end'), true);
  });
