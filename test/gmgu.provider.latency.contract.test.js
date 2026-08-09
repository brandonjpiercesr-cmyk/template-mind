'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const toolLoop=require('../pai/core/tool.loop.js');

function freshLadder(){
  const path=require.resolve('../pai/core/model.ladder.js');
  delete require.cache[path];
  return require(path);
}

function response(content){
  return {ok:true,status:200,async json(){return {choices:[{message:{content:content}}]};}};
}

test('the final C3 fetch preserves the GMGU contract on primary and fallback',async function(){
  const calls=[];
  const signal=new AbortController().signal;
  const fetchImpl=async function(url,init){
    calls.push({url:url,init:init,body:JSON.parse(init.body)});
    return response('bounded tutor answer');
  };
  const request={messages:[{role:'user',content:'Teach this lesson.'}],temperature:0.2,
    reasoning:{enabled:false},chat_template_kwargs:{enable_thinking:false},
    provider:{require_parameters:false}};
  const primary={seat:{seat:'c3_mind',model:'x-ai/grok-4.5'},key:'primary-test-key'};
  const fallback={seat:{seat:'c3_mind.fallback',
    model:'qwen/qwen3-235b-a22b-2507'},key:'fallback-test-key'};

  await toolLoop._test.fetchPaiSeatCandidate(request,primary,'gmgu',{signal:signal},fetchImpl,
    {SELF_BASE_URL:'https://mind.example.test'});
  await toolLoop._test.fetchPaiSeatCandidate(request,fallback,'gmgu',{signal:signal},fetchImpl,
    {SELF_BASE_URL:'https://mind.example.test'});

  assert.deepEqual(calls.map(function(call){return call.body.model;}),
    ['x-ai/grok-4.5','qwen/qwen3-235b-a22b-2507']);
  calls.forEach(function(call){
    assert.equal(call.url,'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(call.init.signal,signal);
    assert.equal(call.body.max_tokens,640);
    assert.deepEqual(call.body.reasoning,{effort:'minimal',exclude:true});
    assert.equal(Object.hasOwn(call.body,'chat_template_kwargs'),false);
    assert.deepEqual(call.body.provider,{sort:'latency',require_parameters:true});
  });
});

test('the Qwen rung forwards the bounded GMGU Penny latency contract to OpenRouter',async function(){
  const previous=global.fetch;
  const oldKey=process.env.OR_KEY_C1_CELLM;
  const oldModel=process.env.SEAT_C1_MODEL;
  let body;
  process.env.OR_KEY_C1_CELLM='test-c1-key-that-is-long-enough-for-seat-resolution';
  process.env.SEAT_C1_MODEL='qwen/qwen3.5-flash-02-23';
  global.fetch=async function(url,init){
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
    body=JSON.parse(init.body);
    return response('bounded answer');
  };
  try {
    const out=await freshLadder().deliberate('system','user',{seat:'c1_cellm',order:'qwen',
      max_tokens:640,temperature:0.2,reasoning:{effort:'none',exclude:true},
      chat_template_kwargs:{enable_thinking:false},
      provider:{sort:'latency',require_parameters:true}});
    assert.equal(out.content,'bounded answer');
    assert.equal(body.max_tokens,640);
    assert.deepEqual(body.reasoning,{effort:'none',exclude:true});
    assert.deepEqual(body.chat_template_kwargs,{enable_thinking:false});
    assert.deepEqual(body.provider,{sort:'latency',require_parameters:true});
  } finally {
    global.fetch=previous;
    if(oldKey===undefined)delete process.env.OR_KEY_C1_CELLM;
    else process.env.OR_KEY_C1_CELLM=oldKey;
    if(oldModel===undefined)delete process.env.SEAT_C1_MODEL;
    else process.env.SEAT_C1_MODEL=oldModel;
  }
});

test('hostile provider extension values are dropped instead of reaching OpenRouter',async function(){
  const previous=global.fetch;
  const oldKey=process.env.OR_KEY_C1_CELLM;
  const oldModel=process.env.SEAT_C1_MODEL;
  let body;
  process.env.OR_KEY_C1_CELLM='test-c1-key-that-is-long-enough-for-seat-resolution';
  process.env.SEAT_C1_MODEL='qwen/qwen3.5-flash-02-23';
  global.fetch=async function(url,init){body=JSON.parse(init.body);return response('safe answer');};
  try {
    await freshLadder().deliberate('system','user',{seat:'c1_cellm',order:'qwen',max_tokens:100,
      reasoning:{effort:'invented',exclude:'yes',secret:'no'},
      chat_template_kwargs:{enable_thinking:'no',secret:true},
      provider:{sort:'attacker',require_parameters:'yes',only:['attacker']}});
    assert.equal(body.reasoning,undefined);
    assert.equal(body.chat_template_kwargs,undefined);
    assert.equal(body.provider,undefined);
  } finally {
    global.fetch=previous;
    if(oldKey===undefined)delete process.env.OR_KEY_C1_CELLM;
    else process.env.OR_KEY_C1_CELLM=oldKey;
    if(oldModel===undefined)delete process.env.SEAT_C1_MODEL;
    else process.env.SEAT_C1_MODEL=oldModel;
  }
});
