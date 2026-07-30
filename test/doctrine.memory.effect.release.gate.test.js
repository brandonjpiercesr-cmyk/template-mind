// ⬡B:tests.memory_effect_release_gate:GUARD:no_user_effect_before_memory_readback:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function at() { return require.resolve(path.join.apply(path, [ROOT].concat(Array.from(arguments)))); }
function cache(file, exports) {
  require.cache[file] = {id:file, filename:file, loaded:true, exports:exports};
}

function councilStub() {
  return {
    runOutboundCouncil:async function (input) {
      return {ok:true, answer:input.answer,
        council_receipt:{persistence:{final_source:'memory.gate.test.council'},
          source:'memory.gate.test.council', row_count:9, stage_count:7,
          readback_verified:true},
        stages:Array.from({length:7}, function (_, index) {
          return {stage:'stage-' + index, ok:true};
        }),
        stamp_proof:{committed:true,row_count:9,readback_verified:true}};
    },
    runPreWriteCouncil:async function () { return {ok:false,reason:'test_no_brief'}; },
    requireVerifiedCouncilResult:function (result) {
      return {ok:true,answer:result.answer,stamp_proof:result.stamp_proof};
    },
    requireVerifiedCouncilDelivery:function () { return {ok:false}; },
    compactCouncilProof:function (result) { return result && result.stamp_proof; },
    canonicalizeDeliveryTarget:function (value) { return value || null; },
    extractNamedContextEvidence:function () { return []; },
    namedContextContradictions:function () { return []; },
    currentAssistantPreferenceRequest:function () { return false; },
    preferenceJudgmentFindings:function () { return []; },
    boundedCouncilFailureCodes:function () { return ''; },
    isHumanFacingAnswer:function (value) {
      return typeof value === 'string' && !!value.trim();
    }
  };
}

test('cara, turn, omi, and voice never release an effect before exact memory readback',
  {concurrency:false}, async function (t) {
    const files = {
      tool:at('pai', 'core', 'tool.loop.js'),
      builder:at('pai', 'core', 'fcw.builder.js'),
      council:at('pai', 'core', 'pai.outbound.council.js'),
      fusion:at('pai', 'core', 'context.fusion.js'),
      screen:at('pai', 'core', 'stream', 'screen.awareness.js'),
      keeper:at('pai', 'core', 'memory.keeper.js'),
      find:at('pai', 'core', 'find.js'),
      tracker:at('pai', 'core', 'tracker.js')
    };
    const priorModules = new Map(Object.values(files).map(function (file) {
      return [file, require.cache[file]];
    }));
    const envNames = ['MEMORY_BANK_URL','MEMORY_BANK_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY',
      'OR_KEY_C2_ORGAN','OR_KEY_VOICE_QWEN','SEAT_C2_MODEL','SEAT_VOICE_MODEL',
      'OS_API_BASE','SELF_BASE_URL','GRANDMOTHER_LEDGER'];
    const priorEnv = Object.fromEntries(envNames.map(function (name) {
      return [name, process.env[name]];
    }));
    const priorFetch = global.fetch;
    t.after(function () {
      global.fetch = priorFetch;
      Object.values(files).forEach(function (file) {
        if (priorModules.get(file)) require.cache[file] = priorModules.get(file);
        else delete require.cache[file];
      });
      envNames.forEach(function (name) {
        if (priorEnv[name] == null) delete process.env[name];
        else process.env[name] = priorEnv[name];
      });
    });

    cache(files.builder, {buildMemoryBank:async function () {
      return {ok:true,system_prompt:'Exact test Memory Bank wall.',
        ham:{uid:'ABCD1234',name:'Test Person',tier:10},context:[],
        identity_evidence:{schema:'anew.identity.evidence.result.v1',ok:true,
          available:true,ham_uid:'ABCD1234',subjects:[],records:[],count:0,ms:0},
        contributors:{},contributorsResolved:0,contributorsTotal:0,ms:1};
    }});
    cache(files.council, councilStub());
    cache(files.fusion, {getLatestSummary:async function () { return ''; }});
    cache(files.screen, {
      promptAddendum:function () { return ''; },
      hasLiveScreen:function () { return false; },
      extract:function (answer) { return {answer:answer,block:null}; },
      push:async function () { return {pushed:0}; }
    });
    cache(files.find, {
      find:async function () { return {ok:true,available:true,beads:[],count:0,ms:0}; },
      findIdentityEvidence:async function () {
        return {ok:true,available:true,ham_uid:'ABCD1234',subjects:[],records:[],count:0,ms:0};
      }
    });
    cache(files.tracker, {
      looksLikeActionRequest:function () { return false; },
      stampTrack:async function () { return {ok:true}; }
    });

    let keeperReceipt = null;
    let keeperCalls = 0;
    cache(files.keeper, {
      keepTurn:async function () { keeperCalls += 1; return keeperReceipt; },
      MEMORY_CONTRACT:{TURN_SOURCE_PREFIX:'pai.minutes.',GIFT_SOURCE_PREFIX:'memory.gifted.',
        READER_IMPORTANCE_FLOOR:7}
    });

    ['MEMORY_BANK_URL','MEMORY_BANK_KEY','AIBE_BRAIN_URL','AIBE_BRAIN_KEY'].forEach(
      function (name) { delete process.env[name]; });
    process.env.OR_KEY_C2_ORGAN = 'memory-gate-test-c2';
    process.env.OR_KEY_VOICE_QWEN = 'memory-gate-test-voice';
    process.env.OS_API_BASE = 'https://surface.test.invalid';
    process.env.GRANDMOTHER_LEDGER = 'off';

    let modelCalls = 0;
    let effectCalls = 0;
    global.fetch = async function (url, init) {
      const href = String(url);
      if (href.includes('openrouter.ai/api/v1/chat/completions')) {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {ok:true,status:200,json:async function () { return {choices:[{
            finish_reason:'tool_calls',message:{role:'assistant',content:null,
              tool_calls:[{id:'set_background_once',type:'function',function:{
                name:'set_background',arguments:JSON.stringify({mode:'scene',scene:'lake'})}}]}
          }]}; }};
        }
        return {ok:true,status:200,json:async function () { return {choices:[{
          finish_reason:'stop',message:{role:'assistant',content:'The lake is ready.'}
        }]}; }};
      }
      if (href.includes('openrouter.ai/api/')) {
        return {ok:true,status:200,json:async function () {
          return {data:{limit:null,usage:0,limit_remaining:null,total_credits:1000,total_usage:0}};
        }};
      }
      if (href.startsWith('https://surface.test.invalid/os/background/ABCD1234')) {
        effectCalls += 1;
        return {ok:true,status:200,json:async function () {
          return {ok:true,background:{mode:'scene',scene:'lake'}};
        }};
      }
      throw new Error('unexpected fetch in memory effect gate test: ' + href);
    };

    delete require.cache[files.tool];
    const loop = require(files.tool);
    const failures = [
      {name:'failed write',receipt:{ok:false,reason:'memory_write_unverified',
        turn_record:{ok:false,readback_verified:false,reason:'memory_write_unverified'}}},
      {name:'mismatched readback',receipt:{ok:false,reason:'memory_readback_unverified',
        turn_record:{ok:false,readback_verified:false,reason:'memory_readback_unverified'}}},
      {name:'duplicate readback',receipt:{ok:false,reason:'memory_readback_unverified',
        turn_record:{ok:false,readback_verified:false,reason:'memory_readback_unverified',
          row_count:2}}},
      {name:'readback timeout',receipt:{ok:false,reason:'memory_readback_timeout',
        turn_record:{ok:false,readback_verified:false,reason:'memory_readback_timeout'}}}
    ];

    for (const channel of ['cara','turn','omi','voice']) {
      for (const failure of failures) {
        keeperReceipt = failure.receipt;
        keeperCalls = 0;
        modelCalls = 0;
        effectCalls = 0;
        const result = await loop.runPAI('ABCD1234', 'Put the lake on my background.', channel,
          {request_id:'memory.gate.' + channel + '.' + failure.name.replace(/\s+/g, '_'),
            user_message:'Put the lake on my background.',delivery:{external:true},
            council_context:{mode:'conversation'}}, []);
        assert.equal(result.ok, false, channel + ' / ' + failure.name);
        assert.equal(result.reason, 'memory_turn_record_unverified',
          channel + ' / ' + failure.name);
        assert.equal(result.blocked_by, 'MEMORY_KEEPER', channel + ' / ' + failure.name);
        assert.equal(keeperCalls, 1, channel + ' / ' + failure.name);
        assert.equal(effectCalls, 0, channel + ' / ' + failure.name + ' leaked the effect');
      }

      keeperReceipt = {ok:true,turn_record:{ok:true,readback_verified:true},
        gift:{kept:false,reason:'not_a_gift'}};
      keeperCalls = 0;
      modelCalls = 0;
      effectCalls = 0;
      const valid = await loop.runPAI('ABCD1234', 'Put the lake on my background.', channel,
        {request_id:'memory.gate.' + channel + '.valid',
          user_message:'Put the lake on my background.',delivery:{external:true},
          council_context:{mode:'conversation'}}, []);
      assert.equal(valid.ok, true, channel + ' / valid: ' + valid.reason);
      assert.equal(keeperCalls, 1, channel + ' / valid keeper count');
      assert.equal(effectCalls, 1, channel + ' / valid effect count');
      assert.equal(valid.side_effects.length, 1, channel + ' / valid side-effect receipt');
      assert.equal(valid.side_effects[0].ok, true, channel + ' / valid side-effect result');
    }
  });
