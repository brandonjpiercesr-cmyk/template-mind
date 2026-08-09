'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const meaning = require('../pai/core/writ.meaning.shadow.wonder.js');
const council = require('../pai/core/pai.outbound.council.js');
const router = require('../pai/core/model.router.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function exactBrain() {
  const rows = new Map();
  return {
    rows:rows,
    async writeBead(spec) {
      const row=Object.assign({id:'row-'+rows.size,ham_uid:spec.hamUid,
        agent_global:spec.agentGlobal,stamp_type:spec.type},clone(spec));
      rows.set(row.source,row);
      return [clone(row)];
    },
    async findBySource(source) {
      const row=rows.get(source);
      return row?clone(row):null;
    }
  };
}

function lostAcknowledgementBrain() {
  const brain=exactBrain();
  const write=brain.writeBead;
  let writes=0,reads=0;
  brain.writeBead=async function(spec){writes++;await write.call(brain,spec);
    throw new Error('acknowledgement_lost_after_commit');};
  const find=brain.findBySource;
  brain.findBySource=async function(source){reads++;return find.call(brain,source);};
  brain.counts=function(){return{writes:writes,reads:reads};};
  return brain;
}

function seatDecision(decision) {
  return async function () {
    return {content:JSON.stringify({decision:decision,
      reason:'The final meaning was independently compared.'}),
    model:'penny-sister-test',via:'test-seat'};
  };
}

async function withEnvAsync(values, fn) {
  const saved={};
  Object.keys(values).forEach(function(key){saved[key]=process.env[key];
    if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];});
  try{return await fn();}finally{Object.keys(values).forEach(function(key){
    if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];});}
}

function packet(overrides) {
  return Object.assign({ham_uid:'A1B2C3D4',request_id:'request-sister-1',
    cycle_id:'cycle-sister-1',pre_writ_draft:'The surgery succeeded and your child is alive.',
    writ_output:'The surgery succeeded and your child is alive.',
    post_meta_candidate:'The surgery failed and your child is dead.',
    final_human_output:'The surgery failed and your child is dead.'},overrides||{});
}

async function sealedRuntime(exact, ids) {
  const runtime={};
  const result=await council._test.defaultWritStage({hamUid:ids.ham_uid,
    requestId:ids.request_id,cycleId:ids.cycle_id,answer:exact,
    question:'Give me the exact update.',channel:'ccwa',runtime:runtime,
    context:{mode:'default',brain:exactBrain(),deliberate:async function () {
      return {content:exact};
    }}});
  assert.equal(result.ok,true);
  runtime.writ_meaning_packet=council._test.writMeaningPacketFrom(result);
  return runtime;
}

test('the inherited Penny SHADOW holds a model-owned meaning reversal', async function () {
  const out=await meaning.judge(packet(),{brain:exactBrain(),
    chatSeat:seatDecision('DISAGREE')});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_disagreement');
  assert.equal(out.shadow.decision,'DISAGREE');
  assert.equal(JSON.stringify(out.receipt).includes('The surgery'),false);
});

test('the inherited Penny seat carries validated reasoning controls through the real router',async function(){
  await withEnvAsync({OR_KEY_C1_CELLM:'template-penny-test-key'},async function(){
    const priorFetch=global.fetch;let body;
    global.fetch=async function(_url,init){body=JSON.parse(init.body);return{ok:true,
      async json(){return{choices:[{message:{content:
        '{"decision":"AGREE","reason":"Meaning stayed exact."}'}}]};}};};
    try{
      await router.chatSeat('c1_cellm',[{role:'user',content:'judge'}],{
        maxTokens:320,temperature:0,reasoning:{effort:'none',exclude:true},
        requireParameters:true,allowFallback:false});
      assert.deepEqual(body.reasoning,{effort:'none',exclude:true});
      assert.deepEqual(body.provider,{require_parameters:true});
      assert.equal(body.max_tokens,320);
      assert.equal(body.temperature,0);
    }finally{global.fetch=priorFetch;}
  });
});

test('the inherited router drops malformed reasoning controls instead of forwarding them',async function(){
  await withEnvAsync({OR_KEY_C1_CELLM:'template-penny-test-key'},async function(){
    const priorFetch=global.fetch;let body;
    global.fetch=async function(_url,init){body=JSON.parse(init.body);return{ok:true,
      async json(){return{choices:[{message:{content:'{}'}}]};}};};
    try{
      await router.chatSeat('c1_cellm',[{role:'user',content:'judge'}],{
        reasoning:{effort:'invented',exclude:'yes',enabled:'yes',max_tokens:-5},
        allowFallback:false});
      assert.equal(Object.prototype.hasOwnProperty.call(body,'reasoning'),false);
      assert.equal(Object.prototype.hasOwnProperty.call(body,'provider'),false);
    }finally{global.fetch=priorFetch;}
  });
});

test('the inherited Penny SHADOW holds a length-truncated transport and receipts the attempt',async function(){
  const brain=exactBrain();
  const out=await meaning.judge(packet(),{brain:brain,chatSeat:async function(){
    return{model:'qwen/penny',provider:'Alibaba',choices:[{finish_reason:'length',
      message:{content:'Thinking Process: compare the four texts before answering'}}]};
  }});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_incomplete_verdict');
  assert.equal(brain.rows.size,1);
  const stored=[...brain.rows.values()][0];
  assert.equal(stored.stamp_type,meaning.ATTEMPT_TYPE);
  assert.equal(stored.content.finish_reason,'length');
  assert.equal(stored.content.transport_bytes,57);
  assert.equal(stored.content.verdict_valid,false);
  assert.equal(stored.content.decision,null);
  assert.equal(JSON.stringify(stored).includes('Thinking Process'),false);
});

test('the inherited invalid-attempt receipt binds the exact packet without storing raw text',async function(){
  const brain=exactBrain();
  const exact=packet();
  const rawPrefix='{"decision":"AGREE","reason":"This prefix looks complete."}';
  const out=await meaning.judge(exact,{brain:brain,chatSeat:async function(){
    return{id:'generation-truncated-template-1',model:'qwen/penny',provider:'Alibaba',
      usage:{prompt_tokens:1139,completion_tokens:320,
        completion_tokens_details:{reasoning_tokens:0},cost:0.000157235},
      choices:[{finish_reason:'length',native_finish_reason:'length',
        message:{content:rawPrefix}}]};
  }});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_incomplete_verdict');
  assert.equal(out.shadow,undefined);
  assert.equal(out.receipt,undefined);
  const stored=[...brain.rows.values()][0];
  assert.equal(stored.content.schema,meaning.ATTEMPT_SCHEMA);
  assert.deepEqual(stored.content.binding,{ham_uid:exact.ham_uid,
    request_id:exact.request_id,cycle_id:exact.cycle_id});
  assert.equal(stored.content.transport_digest,meaning._test.digest(rawPrefix));
  assert.equal(stored.content.transport_bytes,Buffer.byteLength(rawPrefix,'utf8'));
  assert.equal(stored.content.pre_writ_draft.digest,meaning._test.digest(exact.pre_writ_draft));
  assert.equal(stored.content.final_human_output.digest,
    meaning._test.digest(exact.final_human_output));
  assert.deepEqual(stored.content.usage,{prompt_tokens:1139,completion_tokens:320,
    reasoning_tokens:0,reported_cost:'0.000157235'});
  const serialized=JSON.stringify(stored);
  [exact.pre_writ_draft,exact.writ_output,exact.post_meta_candidate,
    exact.final_human_output,rawPrefix].forEach(function(raw){assert.equal(serialized.includes(raw),false);});
});

test('a lost invalid-attempt write acknowledgement is recovered by exact readback without a second model call',async function(){
  const brain=lostAcknowledgementBrain();let modelCalls=0;
  const rawText='Thinking Process that must never enter the attempt receipt.';
  const out=await meaning.judge(packet(),{brain:brain,chatSeat:async function(){
    modelCalls++;return{id:'generation-lost-ack-1',model:'qwen/penny',provider:'Alibaba',
      choices:[{finish_reason:'length',native_finish_reason:'length',
        message:{content:rawText}}]};}});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_incomplete_verdict');
  assert.equal(out.attempt.recovered_after_write_uncertainty,true);
  assert.equal(modelCalls,1);
  assert.deepEqual(brain.counts(),{writes:1,reads:1});
  assert.equal(brain.rows.size,1);
  assert.equal(JSON.stringify([...brain.rows.values()][0]).includes(rawText),false);
});

test('a lost valid-verdict write acknowledgement is recovered by exact readback without a second model call',async function(){
  const brain=lostAcknowledgementBrain();let modelCalls=0;
  const out=await meaning.judge(packet(),{brain:brain,chatSeat:async function(){
    modelCalls++;return{model:'qwen/penny',provider:'Alibaba',choices:[{finish_reason:'stop',
      native_finish_reason:'stop',message:{content:
        '{"decision":"DISAGREE","reason":"The final outcome was reversed."}'}}]};}});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_disagreement');
  assert.equal(out.receipt.recovered_after_write_uncertainty,true);
  assert.equal(modelCalls,1);
  assert.deepEqual(brain.counts(),{writes:1,reads:1});
  assert.equal(brain.rows.size,1);
});

test('the inherited final boundary preserves exact command and prose bytes', async function () {
  const exact='# Run\n```sh\nmodal profile activate --profile=anuanew\n```\n' +
    'Open https://example.test/a--b on August 12, pay $500, and keep B14 exactly.';
  const ids={ham_uid:'A1B2C3D4',request_id:'request-sister-final-1',
    cycle_id:'cycle-sister-final-1'};
  const runtime=await sealedRuntime(exact,ids);
  const out=await council._test.defaultAnuExpressionStage({hamUid:ids.ham_uid,
    requestId:ids.request_id,cycleId:ids.cycle_id,answer:exact,channel:'ccwa',
    runtime:runtime,context:{brain:exactBrain(),meaningShadowChatSeat:seatDecision('AGREE')}});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.answer,exact);
  assert.equal(out.evidence.meaning_shadow.final_output_bound,true);
  assert.equal(out.evidence.final_pam.ok,true);
});

test('an inherited cancelled meaning judgment releases C1 for the next turn',
  {timeout:5000,concurrency:false},async function(t){
  const seatSpend=require('../pai/core/openrouter.seat.spend.js');
  seatSpend._test.reset();
  t.after(function(){seatSpend._test.reset();});
  const seatEnv={OR_KEY_C1_CELLM:'template-meaning-cancel-key',
    SEAT_C1_CELLM_DAILY_CAP_USD:'2'};
  const starts=[];
  let firstEnteredResolve;
  const firstEntered=new Promise(function(resolve){firstEnteredResolve=resolve;});
  const chatSeat=async function(_seat,_messages,options){
    const requestId=options.attribution.request_id;
    if(requestId.indexOf('request-template-cancel-first')===0)firstEnteredResolve();
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal,requestId.indexOf('request-template-cancel-first')===0
      ?firstController.signal:secondController.signal);
    const guarded=await seatSpend.run('https://openrouter.ai/api/v1/chat/completions',{
      headers:{Authorization:'Bearer template-meaning-cancel-key'},signal:options.signal
    },async function(){return new Response(JSON.stringify({data:{usage_daily:0.01}}),{
      status:200,headers:{'Content-Type':'application/json'}});},async function(){
      starts.push(requestId);
      if(requestId.indexOf('request-template-cancel-first')===0){
        await new Promise(function(_resolve,reject){
          if(options.signal.aborted){const error=new Error('cancelled');error.name='AbortError';
            return reject(error);}
          options.signal.addEventListener('abort',function(){
            const error=new Error('cancelled');error.name='AbortError';reject(error);
          },{once:true});
        });
      }
      return{content:JSON.stringify({decision:'AGREE',consequential:false,
        reason:'The meaning is preserved.'}),model:'penny-test',via:'test'};
    },seatEnv);
    if(guarded.blocked)throw new Error(guarded.reason);
    return guarded.response;
  };
  const exact='A learning agreement protects shared expectations.';
  const firstIds={ham_uid:'A1B2C3D4',request_id:'request-template-cancel-first',
    cycle_id:'cycle-template-cancel-first'};
  const secondIds={ham_uid:'A1B2C3D4',request_id:'request-template-cancel-second',
    cycle_id:'cycle-template-cancel-second'};
  const firstRuntime=await sealedRuntime(exact,firstIds);
  const secondRuntime=await sealedRuntime(exact,secondIds);
  const firstController=new AbortController();
  const secondController=new AbortController();
  const first=council._test.defaultAnuExpressionStage({hamUid:firstIds.ham_uid,
    requestId:firstIds.request_id,cycleId:firstIds.cycle_id,answer:exact,channel:'gmgu',
    runtime:firstRuntime,signal:firstController.signal,
    context:{brain:exactBrain(),meaningShadowChatSeat:chatSeat}});
  await firstEntered;
  const second=council._test.defaultAnuExpressionStage({hamUid:secondIds.ham_uid,
    requestId:secondIds.request_id,cycleId:secondIds.cycle_id,answer:exact,channel:'gmgu',
    runtime:secondRuntime,signal:secondController.signal,
    context:{brain:exactBrain(),meaningShadowChatSeat:chatSeat}});
  await new Promise(function(resolve){setImmediate(resolve);});
  assert.equal(starts.length,1);
  firstController.abort();
  const firstOut=await first;
  const secondOut=await second;
  assert.equal(firstOut.reason,'writ_meaning_shadow_unavailable');
  assert.equal(secondOut.ok,true,JSON.stringify(secondOut));
  assert.deepEqual(starts,[
    'request-template-cancel-first.writ-meaning-shadow',
    'request-template-cancel-second.writ-meaning-shadow'
  ]);
});

test('a public packet-shaped marker cannot forge inherited clearance', function () {
  const fake=Object.freeze({ham_uid:'A1B2C3D4',request_id:'request-forge-1',
    cycle_id:'cycle-forge-1',pre_writ_draft:'Forged source.',writ_output:'Forged output.',
    post_meta_candidate:'Forged candidate.'});
  const normalized=council._test.normalizeStageResult({ok:true,answer:'Forged candidate.',
    internal:{writ_meaning_packet:fake}},'Original answer.');
  assert.equal(normalized.internal,null);
  assert.equal(JSON.stringify(normalized).includes('Forged source.'),false);
});

test('the inherited WRIT and Meta organs have no cold semantic veto', function () {
  const writ=fs.readFileSync(path.join(__dirname,'../pai/board/writ/writ.js'),'utf8');
  const meta=fs.readFileSync(path.join(__dirname,'../pai/agents/meta_commentary.js'),'utf8');
  const shadow=fs.readFileSync(path.join(__dirname,
    '../pai/core/writ.meaning.shadow.wonder.js'),'utf8');
  assert.equal(writ.includes('semanticAnchorReport(originalText, _txt)'),false);
  assert.equal(meta.includes('semanticAnchorReport(outbound, rendered)'),false);
  assert.match(shadow,/Do not decide from word overlap, keyword lists, length/);
});
