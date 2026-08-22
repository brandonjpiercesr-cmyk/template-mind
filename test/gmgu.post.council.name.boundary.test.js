'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const C2_CANONICAL_MODEL = require('../pai/core/seat.map.js').SEATS.c2_organ.model;
const VOICE_CANONICAL_MODEL = require('../pai/core/seat.map.js').SEATS.voice_fast.model;

function at() {
  return require.resolve(path.join.apply(path, [ROOT].concat(Array.from(arguments))));
}

function cacheModule(filename, exports) {
  require.cache[filename] = {id:filename,filename:filename,loaded:true,exports:exports};
}

function pendingEffectsBinding(value) {
  const exact = Array.isArray(value) ? value : [];
  return {count:exact.length,digest:'post-council.test.' + JSON.stringify(exact)};
}

function normalCouncilSuccess(input) {
  const pending = pendingEffectsBinding(input.context && input.context.pending_effects);
  return {ok:true,answer:input.answer,
    stages:Array.from({length:7},function(_, index){return {stage:'test-stage-' + index,ok:true};}),
    council_receipt:{source:'template.post-council.test',row_count:9,stage_count:7,
      readback_verified:true,pending_effects_count:pending.count,
      pending_effects_digest:pending.digest},
    stamp_proof:{committed:true,row_count:9,readback_verified:true,
      final_source:'template.post-council.test.final',
      pending_effects_count:pending.count,pending_effects_digest:pending.digest}};
}

function runPaiHarness(t, options) {
  options = options || {};
  const paths = {
    tool:at('pai','core','tool.loop.js'),
    builder:at('pai','core','fcw.builder.js'),
    council:at('pai','core','pai.outbound.council.js'),
    fusion:at('pai','core','context.fusion.js'),
    screen:at('pai','core','stream','screen.awareness.js'),
    format:at('pai','core','format.matrix.js'),
    synthesize:at('pai','core','synthesize.js'),
    persona:at('pai','core','persona.js'),
    ladder:at('pai','core','model.ladder.js'),
    tracker:at('pai','core','tracker.js'),
    policy:at('pai','core','reach','policy.contract.js'),
    keeper:at('pai','core','memory.keeper.js'),
    agentFind:at('pai','core','agent.find.js'),
    gateway:at('pai','core','world.builder.gateway.js')
  };
  const files = Object.values(paths);
  const priorModules = new Map(files.map(function(filename) {
    return [filename,require.cache[filename]];
  }));
  const envNames = ['TOGETHER_API_KEY','TOGETHER_MODEL','OPENROUTER_API_KEY',
    'OR_KEY_C2_ORGAN','SEAT_C2_MODEL','OR_KEY_VOICE_QWEN','SEAT_VOICE_MODEL',
    'TRY_ORNITH_CONVERSATIONAL','ORNITH_URL','RUNPOD_API_KEY','MEMORY_BANK_URL',
    'MEMORY_BANK_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY','BEAD_TABLE','BRAIN_SCHEMA',
    'GRANDMOTHER_LEDGER'];
  const priorEnv = Object.fromEntries(envNames.map(function(name) {
    return [name,process.env[name]];
  }));
  const priorFetch = global.fetch;
  const hadPaiLastError = Object.prototype.hasOwnProperty.call(global,'_paiLastError');
  const priorPaiLastError = global._paiLastError;
  t.after(function() {
    global.fetch = priorFetch;
    envNames.forEach(function(name) {
      if (priorEnv[name] === undefined) delete process.env[name];
      else process.env[name] = priorEnv[name];
    });
    files.forEach(function(filename) {
      const prior = priorModules.get(filename);
      if (prior) require.cache[filename] = prior;
      else delete require.cache[filename];
    });
    if (hadPaiLastError) global._paiLastError = priorPaiLastError;
    else delete global._paiLastError;
  });

  const calls = {council:[],ladder:[],keeper:[],steps:[],brain:[]};
  cacheModule(paths.builder,{buildMemoryBank:async function() {
    return {ok:true,system_prompt:'Exact template test wall.',
      ham:{uid:'HAM.ONE',name:'Template test world',tier:10},context:[],
      identity_evidence:{schema:'anew.identity.evidence.result.v1',ok:true,
        available:true,ham_uid:'HAM.ONE',subjects:[],records:[],count:0,ms:0},
      contributors:{},contributorsResolved:0,contributorsTotal:0,ms:1};
  }});
  cacheModule(paths.agentFind,{bindClosedWorld:async function() {
    return {ok:true,available:true,partial:false,system_prompt:'closed_world_context_bound',
      contributors:{closedWorldEvidence:true,registryContextPolicy:true,
        agentFindSeat:true,agentFindContextPolicy:true},contributorsResolved:4,
      contributorsTotal:4,agent_find:{prompt_appendix:'TEMPLATE VERIFIED AGENT FIND',
        truth_beacon:{source:'agent.find.HAM.ONE.' + 'a'.repeat(64),row_id:91,
          readback_verified:true}}};
  }});
  cacheModule(paths.council,{
    runOutboundCouncil:async function(input, injected) {
      calls.council.push(input);
      if (typeof options.council === 'function') {
        return options.council(input,injected || {},calls.council.length,calls);
      }
      return normalCouncilSuccess(input);
    },
    requireVerifiedCouncilResult:function(result) {
      return result && result.ok === true
        ? {ok:true,answer:result.answer,stamp_proof:result.stamp_proof}
        : {ok:false,reason:(result && result.reason) || 'outbound_council_failed'};
    },
    requireVerifiedCouncilDelivery:function(){return {ok:false};},
    compactCouncilProof:function(result){return result && result.stamp_proof;},
    createPendingEffectsBinding:pendingEffectsBinding,
    canonicalizeDeliveryTarget:function(value){return value || null;},
    extractNamedContextEvidence:function(){return [];},
    namedContextContradictions:function(){return [];},
    currentAssistantPreferenceRequest:function(){return false;},
    preferenceJudgmentFindings:function(){return [];},
    boundedCouncilFailureCodes:function(result) {
      return result && result.reason ? String(result.reason) : '';
    },
    isHumanFacingAnswer:function(value) {
      return typeof value === 'string' && !!value.trim() &&
        !/<(?:tool_call|function)\b/i.test(value);
    }
  });
  cacheModule(paths.fusion,{getLatestSummary:async function(){return '';}});
  cacheModule(paths.screen,{
    promptAddendum:function(){return '';},hasLiveScreen:function(){return true;},
    extract:function(answer){return {answer:answer,block:null};},
    push:async function(){return {pushed:1};}
  });
  cacheModule(paths.format,{formatForDestination:function(answer){return answer;}});
  cacheModule(paths.synthesize,{
    shadowAudit:function(answer){return {clean:answer};},
    pamGate:function(){return {gated:false};}
  });
  cacheModule(paths.persona,{applyPersona:function(answer){return answer;}});
  cacheModule(paths.ladder,{deliberate:async function(system,user,request) {
    calls.ladder.push({system:system,user:user,request:request});
    const out = options.ladder
      ? await options.ladder(system,user,request,calls.ladder.length,calls)
      : {content:''};
    return typeof out === 'string' ? {content:out} : out;
  }});
  cacheModule(paths.tracker,{
    looksLikeActionRequest:function(){return false;},
    stampTrack:async function(){return {ok:true};}
  });
  cacheModule(paths.keeper,{keepTurn:async function(input) {
    calls.keeper.push(input);
    return {ok:true,turn_record:{ok:true,readback_verified:true},
      gift:{kept:false,reason:'not_a_gift'}};
  }});
  cacheModule(paths.gateway,{submitJob:async function(){return {ok:true,queued:true};}});
  cacheModule(paths.policy,{});

  process.env.OR_KEY_C2_ORGAN = 'template-post-council-test-key';
  process.env.SEAT_C2_MODEL = C2_CANONICAL_MODEL;
  process.env.OR_KEY_VOICE_QWEN = 'template-post-council-voice-key';
  process.env.SEAT_VOICE_MODEL = VOICE_CANONICAL_MODEL;
  process.env.GRANDMOTHER_LEDGER = 'off';
  ['TOGETHER_API_KEY','TOGETHER_MODEL','OPENROUTER_API_KEY','TRY_ORNITH_CONVERSATIONAL',
    'ORNITH_URL','RUNPOD_API_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY','BEAD_TABLE',
    'BRAIN_SCHEMA'].forEach(function(name){delete process.env[name];});
  if (options.telemetry) {
    process.env.MEMORY_BANK_URL = 'https://template-post-council.test';
    process.env.MEMORY_BANK_KEY = 'template-post-council-key';
  } else {
    delete process.env.MEMORY_BANK_URL;
    delete process.env.MEMORY_BANK_KEY;
  }
  global.fetch = async function(url, init) {
    const href = String(url);
    if (href.includes('openrouter.ai/api')) {
      return {ok:true,status:200,json:async function() {
        return {choices:[{finish_reason:'stop',message:{role:'assistant',
          content:options.draft || 'Initial human-facing draft.'}}]};
      }};
    }
    if (href.startsWith('https://template-post-council.test/')) {
      const body = JSON.parse(init.body);
      calls.brain.push(body);
      if (body.stamp_type === 'CYCLE_STEP') {
        const content = JSON.parse(body.content);
        calls.steps.push({step:content.step,detail:content.detail});
      }
      return {ok:true,status:201,json:async function(){return [];}};
    }
    throw new Error('unexpected_template_test_fetch:' + href);
  };
  delete require.cache[paths.tool];
  const loop = require(paths.tool);
  return {calls:calls,run:function() {
    const message = options.message || 'What can you help us do next?';
    const identity = Object.assign({request_id:'template.post.council.request.0001',
      user_message:message,delivery:{external:true},
      council_context:{mode:'template_post_council'}},options.identity || {});
    return loop.runPAI('HAM.ONE',message,'text',identity,[]);
  }};
}

test('a council-injected creator attribution returns once to A NU and then commits the clean answer',
  {concurrency:false},async function(t) {
    const inventedName = 'Harriet Vole';
    const nameReason =
      'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
    const cleanDraft = 'I can help you take the next practical step with your group.';
    const cleanRewrite = 'I am here to help you work through the next practical step.';
    const harness = runPaiHarness(t,{
      draft:cleanDraft,telemetry:true,
      ladder:async function(system,user) {
        assert.doesNotMatch(system,new RegExp(inventedName));
        assert.doesNotMatch(user,new RegExp(inventedName));
        return {content:cleanRewrite};
      },
      council:async function(input,injected,attempt) {
        assert.equal(typeof injected.preCommitNameBoundary,'function');
        const candidate = attempt === 1
          ? 'I was created by ' + inventedName + ' to support this work.' : input.answer;
        const finding = await injected.preCommitNameBoundary({hamUid:input.hamUid,
          requestId:input.requestId,cycleId:input.cycleId,question:input.question,
          answer:candidate,channel:input.channel,activeWorld:input.activeWorld});
        if (attempt === 1) {
          assert.equal(input.answer,cleanDraft);
          assert.deepEqual(finding,{ok:false,reason:nameReason});
          return {ok:false,reason:nameReason,blocked_by:'STAMP',stages:[],
            pre_commit_name_boundary:true,pre_commit_name_boundary_reason:nameReason};
        }
        assert.equal(input.answer,cleanRewrite);
        assert.deepEqual(finding,{ok:true});
        return normalCouncilSuccess(Object.assign({},input,{answer:candidate}));
      }
    });
    const result = await harness.run();
    assert.equal(result.ok,true,result.reason);
    assert.equal(result.answer,cleanRewrite);
    assert.equal(harness.calls.council.length,2);
    assert.equal(harness.calls.ladder.length,1);
    assert.equal(harness.calls.keeper.length,1);
    assert.ok(harness.calls.steps.some(function(step) {
      return step.step === 'outbound_council_name_boundary_healing' &&
        step.detail === nameReason;
    }));
    assert.ok(harness.calls.steps.some(function(step) {
      return step.step === 'outbound_council_name_boundary_heal_outcome' &&
        step.detail === 'passed';
    }));
  });

test('a second council-injected creator attribution stays held with no durable learner turn',
  {concurrency:false},async function(t) {
    const inventedName = 'Harriet Vole';
    const nameReason =
      'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
    const harness = runPaiHarness(t,{
      draft:'I can help you take the next practical step with your group.',telemetry:true,
      ladder:async function(system,user) {
        assert.doesNotMatch(system,new RegExp(inventedName));
        assert.doesNotMatch(user,new RegExp(inventedName));
        return {content:'I am here to help you work through the next practical step.'};
      },
      council:async function(input,injected,attempt) {
        assert.ok(attempt === 1 || attempt === 2);
        const finding = await injected.preCommitNameBoundary({answer:
          'I was created by ' + inventedName + ' to support this work.'});
        assert.deepEqual(finding,{ok:false,reason:nameReason});
        return {ok:false,reason:nameReason,blocked_by:'STAMP',stages:[],
          pre_commit_name_boundary:true,pre_commit_name_boundary_reason:nameReason};
      }
    });
    const result = await harness.run();
    assert.equal(result.ok,false);
    assert.equal(result.reason,nameReason);
    assert.equal(harness.calls.council.length,2);
    assert.equal(harness.calls.ladder.length,1);
    assert.equal(harness.calls.keeper.length,0);
  });
