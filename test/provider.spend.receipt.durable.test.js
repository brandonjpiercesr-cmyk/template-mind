// ⬡B:tests.provider_spend_receipt:TEST:one_durable_attempt_one_paid_egress:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const childProcess = require('node:child_process');
const util = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const migrate = require('../pai/core/migrate.js');
const execFile = util.promisify(childProcess.execFile);

const RECEIPT_PATH = require.resolve('../pai/core/provider.spend.receipt.js');
const BOUNDARY_PATH = require.resolve('../pai/core/provider.boundary.js');
const SPEND_PATH = require.resolve('../pai/core/spend.guard.js');

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {status:status,headers:Object.assign({
    'Content-Type':'application/json'},headers || {})});
}

function fakeBank(options) {
  const opts = options || {};
  const rows = new Map();
  const calls = [];
  let lostIntentAck = false;
  let lostTerminalAck = false;
  async function fetchImpl(url, init) {
    const parsed = new URL(String(url));
    calls.push({url:parsed.toString(),init:init || {}});
    if (parsed.pathname.includes('/rest/v1/rpc/')) {
      const rpc=parsed.pathname.split('/').pop();
      const body=JSON.parse(init.body || '{}');
      if (opts.schemaMissing) return json(404,{error:'missing'});
      if (rpc === 'claim_anew_provider_spend_intent') {
        const row=body.p_receipt;
        if (opts.intentFailure) return json(503,{error:'fixture'});
        const key=row.attempt_id+':INTENT';
        const admissions=Array.from(rows.values()).filter(item=>item.phase==='INTENT').length;
        if (rows.has(key)) return json(200,{ok:true,admitted:false,duplicate:true,
          reason:'provider_spend_attempt_already_admitted',attempt_id:row.attempt_id,
          admissions:admissions,ceiling:body.p_ceiling});
        // p_ceiling null means unlimited (mirrors anew migrations/0008_provider_spend_unlimited_ceiling.sql):
        // the admission count check is skipped entirely, never compared against null.
        if (body.p_ceiling !== null && admissions >= body.p_ceiling) return json(200,{ok:true,
          admitted:false,duplicate:false,reason:'daily_spend_ceiling_reached',
          attempt_id:row.attempt_id,admissions:admissions,ceiling:body.p_ceiling});
        rows.set(key,Object.assign({created_at:opts.intentCreatedAt || new Date().toISOString()},row));
        if (opts.lostIntentAck && !lostIntentAck) { lostIntentAck=true; return json(503,{error:'lost_ack'}); }
        return json(200,{ok:true,admitted:true,duplicate:false,reason:null,
          attempt_id:row.attempt_id,admissions:admissions+1,ceiling:body.p_ceiling});
      }
      if (rpc === 'write_anew_provider_spend_terminal') {
        const row=body.p_terminal;
        if (opts.terminalFailure) return json(503,{error:'fixture'});
        const key=row.attempt_id+':TERMINAL';
        const inserted=!rows.has(key);
        if(inserted)rows.set(key,Object.assign({created_at:new Date().toISOString()},row));
        if (opts.lostTerminalAck && !lostTerminalAck) {
          lostTerminalAck=true; return json(503,{error:'lost_ack'});
        }
        return json(200,{ok:true,stored:true,inserted:inserted,
          attempt_id:row.attempt_id,disposition:rows.get(key).disposition});
      }
      if (rpc === 'reconcile_anew_provider_spend_unknown') {
        if(opts.reconcileFailure)return json(503,{error:'fixture'});
        const cutoff=Date.now()-Number(body.p_grace_seconds)*1000;
        let resolved=0;
        const stale=Array.from(rows.values()).filter(row=>row.phase==='INTENT'&&
          !rows.has(row.attempt_id+':TERMINAL')&&Date.parse(row.created_at)<=cutoff)
        .sort((left,right)=>String(left.created_at).localeCompare(String(right.created_at))||
          String(left.attempt_id).localeCompare(String(right.attempt_id))).slice(0,100);
        for(const row of stale){
          rows.set(row.attempt_id+':TERMINAL',Object.assign({},row,{phase:'TERMINAL',
            disposition:'OUTCOME_UNKNOWN',response_digest:null,provider_request_id:null,
            status_code:null,provider_tokens:null,actual_cost_usd:null,cost_source:null,
            created_at:new Date().toISOString()}));resolved++;
        }
        const staleRemaining=Array.from(rows.values()).some(row=>row.phase==='INTENT'&&
          !rows.has(row.attempt_id+':TERMINAL')&&Date.parse(row.created_at)<=cutoff);
        const matching=Array.from(rows.values()).filter(row=>row.ham_uid===body.p_ham_uid&&
          row.cycle_id===body.p_cycle_id&&row.request_id===body.p_request_id);
        const unresolved=matching.filter(row=>row.phase==='INTENT'&&
          !rows.has(row.attempt_id+':TERMINAL')).length;
        const unknown=matching.filter(row=>row.phase==='TERMINAL'&&
          row.disposition==='OUTCOME_UNKNOWN').length;
        return json(200,{ok:true,ham_uid:body.p_ham_uid,cycle_id:body.p_cycle_id,
          request_id:body.p_request_id,resolved_unknown:resolved,unresolved:unresolved,
          outcome_unknown:unknown,stale_remaining:staleRemaining});
      }
      throw new Error('unexpected_bank_rpc:' + rpc);
    }
    if (!parsed.pathname.endsWith('/provider_spend_receipts')) {
      throw new Error('unexpected_bank_path:' + parsed.pathname);
    }
    if ((init && init.method) === 'POST') {
      const row = JSON.parse(init.body);
      if ((row.phase === 'INTENT' && opts.intentFailure) ||
          (row.phase === 'TERMINAL' && opts.terminalFailure)) return json(503,{error:'fixture'});
      if (opts.schemaMissing) return json(404,{error:'missing'});
      const key = row.attempt_id + ':' + row.phase;
      if (rows.has(key)) return json(201,[]);
      const stored = Object.assign({created_at:new Date().toISOString()},row);
      rows.set(key,stored);
      return json(201,[stored]);
    }
    if (opts.readFailure) return json(503,{error:'fixture'});
    if (opts.schemaMissing) return json(404,{error:'missing'});
    const attempt = String(parsed.searchParams.get('attempt_id') || '').replace(/^eq\./,'');
    const phase = String(parsed.searchParams.get('phase') || '').replace(/^eq\./,'');
    if (attempt) {
      const row = rows.get(attempt + ':' + phase);
      if (!row) return json(200,[]);
      const represented = Object.assign({},row);
      if (opts.readbackMismatch) represented.component = 'forged.component';
      return json(200,[represented]);
    }
    const since = String(parsed.searchParams.get('created_at') || '').replace(/^gte\./,'');
    const selected = Array.from(rows.values()).filter(function (row) {
      return (!phase || row.phase === phase) && (!since || row.created_at >= since);
    }).map(function (row) {
      return {attempt_id:row.attempt_id,phase:row.phase,provider:row.provider,kind:row.kind,
        key_alias:row.key_alias,component:row.component,disposition:row.disposition,
        status_code:row.status_code,created_at:row.created_at};
    });
    return json(200,selected);
  }
  return {rows:rows,calls:calls,fetch:fetchImpl};
}

async function listenBank() {
  const rows = new Map();
  const server = http.createServer(function (req,res) {
    const parsed = new URL(req.url,'http://127.0.0.1');
    function send(status,value){res.writeHead(status,{'Content-Type':'application/json'});
      res.end(JSON.stringify(value));}
    if(req.method==='POST'&&parsed.pathname.includes('/rest/v1/rpc/')){
      const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',function(){
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const rpc=parsed.pathname.split('/').pop();
        if(rpc==='claim_anew_provider_spend_intent'){
          const row=body.p_receipt,key=row.attempt_id+':INTENT';
          const count=Array.from(rows.values()).filter(item=>item.phase==='INTENT').length;
          if(rows.has(key))return send(200,{ok:true,admitted:false,duplicate:true,
            attempt_id:row.attempt_id,admissions:count,ceiling:body.p_ceiling});
          if(count>=body.p_ceiling)return send(200,{ok:true,admitted:false,duplicate:false,
            reason:'daily_spend_ceiling_reached',attempt_id:row.attempt_id,
            admissions:count,ceiling:body.p_ceiling});
          rows.set(key,Object.assign({created_at:new Date().toISOString()},row));
          return send(200,{ok:true,admitted:true,duplicate:false,attempt_id:row.attempt_id,
            admissions:count+1,ceiling:body.p_ceiling});
        }
        if(rpc==='write_anew_provider_spend_terminal'){
          const row=body.p_terminal,key=row.attempt_id+':TERMINAL',inserted=!rows.has(key);
          if(inserted)rows.set(key,Object.assign({created_at:new Date().toISOString()},row));
          return send(200,{ok:true,stored:true,inserted:inserted,
            attempt_id:row.attempt_id,disposition:row.disposition});
        }
        if(rpc==='reconcile_anew_provider_spend_unknown')return send(200,{ok:true,
          ham_uid:body.p_ham_uid,cycle_id:body.p_cycle_id,request_id:body.p_request_id,
          resolved_unknown:0,unresolved:0,outcome_unknown:0,stale_remaining:false});
        send(404,{error:'unknown_rpc'});
      });return;
    }
    const attempt=String(parsed.searchParams.get('attempt_id')||'').replace(/^eq\./,'');
    const phase=String(parsed.searchParams.get('phase')||'').replace(/^eq\./,'');
    if(attempt){const row=rows.get(attempt+':'+phase);return send(200,row?[row]:[]);}
    const selected=Array.from(rows.values()).filter(row=>!phase||row.phase===phase).map(row=>({
      attempt_id:row.attempt_id,phase:row.phase,provider:row.provider,kind:row.kind,
      key_alias:row.key_alias,component:row.component,disposition:row.disposition,
      status_code:row.status_code,created_at:row.created_at}));send(200,selected);
  });
  await new Promise(function(resolve,reject){server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);});
  return {rows:rows,url:'http://127.0.0.1:'+server.address().port,
    close:function(){return new Promise(resolve=>server.close(resolve));}};
}

function fixtureEnv() {
  return {MEMORY_BANK_URL:'https://memory.fixture',MEMORY_BANK_KEY:'bank-secret-fixture',
    BRAIN_SCHEMA:'memory_bank',TOGETHER_COMPONENT_KEY:'together-secret-fixture',
    RENDER_SERVICE_ID:'srv-anew-fixture'};
}
function attribution() {
  return {ham_uid:'HAM.RECEIPT',cycle_id:'cycle.receipt.0001',
    request_id:'request.receipt.0001',component:'pai.cycle',seat:'c2_organ',
    owner_node_id:'station.pai',target_wonder_id:'wonder.anu',service_id:'srv-anew-fixture'};
}
function prepared(store, overrides) {
  const spec = Object.assign({url:'https://api.together.xyz/v1/chat/completions',kind:'text',
    init:{method:'POST',headers:{Authorization:'Bearer together-secret-fixture'},
      body:JSON.stringify({model:'fixture/model-v1',messages:[{role:'user',content:'private prompt fixture'}]})},
    attribution:attribution(),attempt_order:1,env:fixtureEnv()},overrides || {});
  return store.prepare(spec);
}

test('prepare fails closed on missing lineage, model, or named credential alias', function () {
  const store = require(RECEIPT_PATH);
  const noHam = attribution(); delete noHam.ham_uid;
  assert.equal(prepared(store,{attribution:noHam}).reason,
    'provider_spend_attribution_missing_ham_uid');
  assert.equal(prepared(store,{init:{method:'POST',headers:{Authorization:
    'Bearer together-secret-fixture'},body:'{}'}}).reason,
    'provider_spend_attribution_missing_model');
  assert.equal(prepared(store,{init:{method:'POST',headers:{Authorization:'Bearer unknown-key'},
    body:JSON.stringify({model:'fixture/model-v1'})}}).reason,
    'provider_spend_key_alias_missing');
});

test('atomic intent claim survives module reload and a duplicate never authorizes resend',
  async function () {
    const bank = fakeBank();
    const env = fixtureEnv();
    const firstStore = require(RECEIPT_PATH);
    const receipt = prepared(firstStore).receipt;
    const first = await firstStore.claimIntent(receipt,{fetchImpl:bank.fetch,env:env,ceiling:100});
    assert.equal(first.ok,true);
    const duplicate = await firstStore.claimIntent(receipt,{fetchImpl:bank.fetch,env:env,ceiling:100});
    assert.equal(duplicate.ok,false);
    assert.equal(duplicate.reason,'provider_spend_attempt_already_admitted');
    assert.equal(Array.from(bank.rows.values()).filter(row=>row.phase==='INTENT').length,1);

    delete require.cache[RECEIPT_PATH];
    const reloaded = require(RECEIPT_PATH);
    const summary = await reloaded.readSummary({fetchImpl:bank.fetch,env:env});
    assert.equal(summary.readable,true);
    assert.equal(summary.total,1,'a new module instance reads the same durable attempt');
  });

test('a fresh Node process reads the same durable rolling-day total after the writer exits',
  async function () {
    const live=await listenBank();
    try{
      const store=require(RECEIPT_PATH);
      const env=Object.assign({},fixtureEnv(),{MEMORY_BANK_URL:live.url});
      const receipt=prepared(store).receipt;
      assert.equal((await store.claimIntent(receipt,{fetchImpl:fetch,env:env,ceiling:100})).ok,true);
      const script="const s=require(process.argv[1]);s.readSummary().then(v=>process.stdout.write(JSON.stringify(v))).catch(e=>{console.error(e);process.exit(1)})";
      const child=await execFile(process.execPath,['-e',script,RECEIPT_PATH],{
        env:Object.assign({},process.env,env)});
      const summary=JSON.parse(child.stdout);
      assert.equal(summary.readable,true);
      assert.equal(summary.total,1);
    }finally{await live.close();}
  });

test('terminal extraction preserves the original response and stores provider facts, never content',
  async function () {
    const bank = fakeBank();
    const store = require(RECEIPT_PATH);
    const receipt = prepared(store).receipt;
    assert.equal((await store.claimIntent(receipt,{fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:100})).ok,true);
    const response = json(200,{id:'provider-private-id',choices:[{message:{content:'private answer fixture'}}],
      usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16,cost:0.00125}},
    {'x-request-id':'req-provider-001'});
    const terminal = await store.terminalFromResponse(response);
    assert.equal(terminal.actual_cost_usd,0.00125);
    assert.equal(terminal.cost_source,'provider_reported');
    assert.deepEqual(terminal.provider_tokens,{input_tokens:12,output_tokens:4,total_tokens:16});
    assert.equal((await response.json()).choices[0].message.content,'private answer fixture',
      'reading the clone cannot consume or alter the caller response');
    assert.equal((await store.writeTerminal(receipt,terminal,
      {fetchImpl:bank.fetch,env:fixtureEnv()})).ok,true);
    const serialized = JSON.stringify(Array.from(bank.rows.values()));
    assert.doesNotMatch(serialized,/bank-secret-fixture|together-secret-fixture/);
    assert.doesNotMatch(serialized,/private prompt fixture|private answer fixture/);
    assert.match(serialized,/provider_reported/);
  });

// ⬡B:tests.provider_spend_receipt:911:an_unlimited_ceiling_must_not_reject_a_real_paid_call:20260801⬡
// Mirror of the anew#1494 CATHY (Codex) review fix: core/ceiling.owner.js and
// core/spend.guard.js report an unconfigured daily call ceiling as unlimited:true, and this
// door used to forward that as a giant sentinel integer this function's own 1..10000 bound
// rejected outright. These prove the actual fix, not merely that it compiles.
test('an explicitly unlimited ceiling admits a call no matter how many admissions already exist',
  async function () {
    const bank = fakeBank();
    const store = require(RECEIPT_PATH);
    for (let i = 0; i < 5; i++) {
      const seeded = prepared(store,{attribution:Object.assign({},attribution(),
        {request_id:'request.receipt.seed.' + i})}).receipt;
      const seededOut = await store.claimIntent(seeded,
        {fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:null,unlimited:true});
      assert.equal(seededOut.ok,true,'seeding admission ' + i + ' must itself succeed unlimited');
    }
    const receipt = prepared(store,{attribution:Object.assign({},attribution(),
      {request_id:'request.receipt.real.call'})}).receipt;
    const out = await store.claimIntent(receipt,
      {fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:null,unlimited:true});
    assert.equal(out.ok,true,'an unlimited ceiling must admit a real paid call');
    assert.equal(out.ceiling,null,'the ceiling it reports back must be the true null, not a sentinel number');
  });

test('a null ceiling with no explicit unlimited flag is still refused, never silently unlimited',
  async function () {
    const store = require(RECEIPT_PATH);
    const out = await store.claimIntent(prepared(store).receipt,
      {fetchImpl:fakeBank().fetch,env:fixtureEnv(),ceiling:null});
    assert.equal(out.ok,false);
    assert.equal(out.reason,'provider_spend_ceiling_invalid',
      'a caller that forgets to pass a ceiling is a bug, not a decision, and must not read as unlimited');
  });

test('a real founder-chosen ceiling above the old 10000 literal is honored, not rejected',
  async function () {
    const bank = fakeBank();
    const store = require(RECEIPT_PATH);
    const out = await store.claimIntent(prepared(store).receipt,
      {fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:50000});
    assert.equal(out.ok,true,
      'a founder can type a real number above 10000 and this door must not treat it as invalid');
    assert.equal(out.ceiling,50000);
  });

// ⬡B:tests.provider_spend_receipt:911:the_trap_came_back_one_layer_down:20260801⬡
// Mirror of anew#1494's second CATHY (Codex) review: the first fix raised this file's bound
// to 2147483647 (Postgres integer's own physical max) and called that a hardware fact, but
// pai/core/ceiling.owner.js publishes any safe JavaScript integer up to Number.MAX_SAFE_INTEGER
// (~9.007e15) as a real, enforced founder number. A founder who set
// DAILY_MODEL_CALL_CEIL=4000000000 (4 billion, above the old bound, well under the JS safe
// integer edge) would still have been rejected. This is Codex's own named reproduction case.
test('a founder ceiling of four billion, above the old Postgres integer bound, is publishable and admits a real call',
  async function () {
    const ceilingOwner = require('../pai/core/ceiling.owner.js');
    const bank = fakeBank();
    const store = require(RECEIPT_PATH);
    const published = ceilingOwner.readCeiling('DAILY_MODEL_CALL_CEIL',
      {integer:true,unlimited_when_unset:true},{DAILY_MODEL_CALL_CEIL:'4000000000'});
    assert.equal(published.chosen_by,'the founder',
      'the guard must publish this as a real founder-chosen number, not clamp or refuse it');
    assert.equal(published.value,4000000000);
    const out = await store.claimIntent(prepared(store).receipt,
      {fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:published.value});
    assert.equal(out.ok,true,
      'a ceiling the guard publishes as real and enforced must be admitted here');
    assert.equal(out.ceiling,4000000000);
  });

test('this file\'s accepted maximum is never lower than what pai/core/ceiling.owner.js will publish',
  async function () {
    const ceilingOwner = require('../pai/core/ceiling.owner.js');
    const store = require(RECEIPT_PATH);
    assert.equal(store.JS_SAFE_INTEGER_MAX,ceilingOwner.EXACT_INTEGER_EDGE,
      'the claim function\'s own accepted maximum must equal the exact edge the ceiling '+
      'owner module publishes to, not merely be close to it');
    assert.equal(ceilingOwner.EXACT_INTEGER_EDGE,Number.MAX_SAFE_INTEGER);
  });

test('a ceiling above the JavaScript safe integer edge is still refused, that bound is physical',
  async function () {
    const store = require(RECEIPT_PATH);
    const out = await store.claimIntent(prepared(store).receipt,
      {fetchImpl:fakeBank().fetch,env:fixtureEnv(),ceiling:Number.MAX_SAFE_INTEGER * 2});
    assert.equal(out.ok,false);
    assert.equal(out.reason,'provider_spend_ceiling_invalid');
  });

test('intent schema/write/readback failures are typed and cannot look committed', async function () {
  const store = require(RECEIPT_PATH);
  for (const entry of [
    [fakeBank({intentFailure:true}),'provider_spend_intent_write_failed'],
    [fakeBank({schemaMissing:true}),'provider_spend_schema_unavailable'],
    [fakeBank({readbackMismatch:true}),'provider_spend_intent_readback_mismatch']
  ]) {
    const out = await store.claimIntent(prepared(store).receipt,
      {fetchImpl:entry[0].fetch,env:fixtureEnv(),ceiling:100});
    assert.equal(out.ok,false);
    assert.equal(out.reason,entry[1]);
  }
});

test('summary failure is unreadable null, never zero', async function () {
  const store = require(RECEIPT_PATH);
  const out = await store.readSummary({fetchImpl:fakeBank({readFailure:true}).fetch,
    env:fixtureEnv()});
  assert.equal(out.readable,false);
  assert.equal(out.total,null);
  assert.notEqual(out.reason,null);
});

function installBoundaryHarness(options) {
  const opts = options || {};
  const prior = {fetch:global.fetch,installed:global.__providerBoundaryInstalled,
    deny:global.__providerBoundaryDenyPaidEgress,ceil:process.env.DAILY_MODEL_CALL_CEIL,
    together:process.env.TOGETHER_COMPONENT_KEY};
  const bank = opts.bank || fakeBank();
  let providerCalls = 0;
  process.env.DAILY_MODEL_CALL_CEIL = String(opts.dailyCeil == null ? 100 : opts.dailyCeil);
  process.env.TOGETHER_COMPONENT_KEY = 'together-secret-fixture';
  delete global.__providerBoundaryInstalled;
  delete global.__providerBoundaryDenyPaidEgress;
  delete require.cache[BOUNDARY_PATH];
  delete require.cache[SPEND_PATH];
  const realFetch = async function (url) {
    if (String(url).startsWith('https://memory.fixture/')) return bank.fetch.apply(null,arguments);
    if (String(url).startsWith('https://api.together.xyz/')) {
      providerCalls += 1;
      if (opts.networkFailure) throw new Error('provider_network_fixture');
      return json(200,{choices:[{message:{content:'provider answer'}}],
        usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}},
      {'x-request-id':'provider-request-fixture'});
    }
    throw new Error('unexpected_fetch:' + String(url));
  };
  global.fetch = realFetch;
  const boundary = require(BOUNDARY_PATH);
  const spend = require(SPEND_PATH);
  spend._test.reset();
  boundary.install({providerBudgetAuthority:opts.budget || null,
    receiptStore:require(RECEIPT_PATH),env:fixtureEnv()});
  return {bank:bank,boundary:boundary,spend:spend,providerCalls:function(){return providerCalls;},
    restore:function(){
      global.fetch=prior.fetch;
      if(prior.installed===undefined)delete global.__providerBoundaryInstalled;
      else global.__providerBoundaryInstalled=prior.installed;
      if(prior.deny===undefined)delete global.__providerBoundaryDenyPaidEgress;
      else global.__providerBoundaryDenyPaidEgress=prior.deny;
      if(prior.ceil===undefined)delete process.env.DAILY_MODEL_CALL_CEIL;
      else process.env.DAILY_MODEL_CALL_CEIL=prior.ceil;
      if(prior.together===undefined)delete process.env.TOGETHER_COMPONENT_KEY;
      else process.env.TOGETHER_COMPONENT_KEY=prior.together;
      delete require.cache[BOUNDARY_PATH];delete require.cache[SPEND_PATH];
    }};
}
function paidRequest() {
  return global.fetch('https://api.together.xyz/v1/chat/completions',{method:'POST',
    headers:{Authorization:'Bearer together-secret-fixture','Content-Type':'application/json'},
    body:JSON.stringify({model:'fixture/model-v1',messages:[{role:'user',content:'private'}]})});
}
function ambientAttribution() {
  return {ham_uid:'HAM.RECEIPT',cycle_id:'cycle.receipt.0001',
    request_id:'request.receipt.0001',component:'pai.cycle',seat:'c2_organ'};
}

test('production boundary commits intent before one provider call and terminal after it',
  {concurrency:false},async function () {
    const h = installBoundaryHarness();
    try {
      const response = await h.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,200);
      assert.equal(h.providerCalls(),1);
      assert.equal(h.spend.usageToday(),1);
      const phases = Array.from(h.bank.rows.values()).map(row=>row.phase).sort();
      assert.deepEqual(phases,['INTENT','TERMINAL']);
    } finally { h.restore(); }
  });

test('missing attribution and failed intent both stop before provider and local count',
  {concurrency:false},async function () {
    const h=installBoundaryHarness();
    try{
      const response=await paidRequest();
      assert.equal(response.status,503);
      assert.equal(h.providerCalls(),0);
      assert.equal(h.spend.usageToday(),0);
      assert.equal(h.bank.calls.length,0,'unsafe attribution is rejected before receipt I/O');
    }finally{h.restore();}

    const failed=installBoundaryHarness({bank:fakeBank({intentFailure:true})});
    try{
      const response=await failed.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,503);
      assert.equal(failed.providerCalls(),0);
      assert.equal(failed.spend.usageToday(),0);
      assert.equal((await response.json()).error.reason,'provider_spend_intent_write_failed');
    }finally{failed.restore();}
  });

test('an uncertain reconciliation fails closed before provider traffic',
  {concurrency:false},async function () {
    const h=installBoundaryHarness({bank:fakeBank({reconcileFailure:true})});
    try{
      const response=await h.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,503);
      assert.equal((await response.json()).error.reason,'provider_spend_reconcile_failed');
      assert.equal(h.providerCalls(),0);
      assert.equal(h.spend.usageToday(),0);
    }finally{h.restore();}
  });

test('a Coda reservation refusal no longer creates a phantom process-local egress',
  {concurrency:false},async function () {
    const scope={ticket:{used_paid_provider_attempts:0,remaining_paid_provider_attempts:1,
      remaining_llm_calls:1},count_model_calls:false};
    const budget={currentProviderScope:function(){return scope;},
      reserveProviderAttempt:function(){return{ok:false,scoped:true,
        reason:'paid_provider_attempt_budget_invalid'};},settleProviderAttempt:function(){}};
    const h=installBoundaryHarness({budget:budget});
    try{
      const response=await h.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,429);
      assert.equal(h.providerCalls(),0);
      assert.equal(h.spend.usageToday(),0);
      assert.equal(h.bank.rows.size,0,'reservation refusal happens before durable intent');
    }finally{h.restore();}
  });

test('terminal failure returns an exact hold and blocks the same-cycle fallback',
  {concurrency:false},async function () {
    const h=installBoundaryHarness({bank:fakeBank({terminalFailure:true})});
    try{
      const responses=await h.spend.withAttribution(ambientAttribution(),async function(){
        return [await paidRequest(),await paidRequest()];
      });
      assert.equal(responses[0].status,503);
      assert.equal((await responses[0].json()).error.reason,'provider_spend_terminal_unverified');
      assert.equal(responses[1].status,503);
      assert.equal((await responses[1].json()).error.reason,'provider_spend_terminal_unverified');
      assert.equal(h.providerCalls(),1,'no paid fallback leaves after terminal truth is lost');
      assert.equal(h.spend.usageToday(),1,'the one request that really left is still counted');
    }finally{h.restore();}
  });

test('provider network ambiguity receives OUTCOME_UNKNOWN and holds the request',
  {concurrency:false},async function () {
    const h=installBoundaryHarness({networkFailure:true});
    try{
      const response=await h.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,503);
      assert.equal((await response.json()).error.reason,'provider_spend_outcome_unknown_hold');
      assert.equal(h.providerCalls(),1);
      assert.equal(h.spend.usageToday(),1);
      const terminal=Array.from(h.bank.rows.values()).find(row=>row.phase==='TERMINAL');
      assert.equal(terminal.disposition,'OUTCOME_UNKNOWN');
    }finally{h.restore();}
  });

test('two replica claims at ceiling one admit a total of one durable INTENT', async function () {
  const bank=fakeBank();
  const store=require(RECEIPT_PATH);
  const one=prepared(store,{attribution:Object.assign({},attribution(),{
    cycle_id:'cycle.replica.one',request_id:'request.replica.one'})}).receipt;
  const two=prepared(store,{attribution:Object.assign({},attribution(),{
    cycle_id:'cycle.replica.two',request_id:'request.replica.two'})}).receipt;
  const results=await Promise.all([one,two].map(receipt=>store.claimIntent(receipt,
    {fetchImpl:bank.fetch,env:fixtureEnv(),ceiling:1})));
  assert.equal(results.filter(result=>result.ok).length,1);
  const refused=results.find(result=>!result.ok);
  assert.equal(refused.reason,'daily_spend_ceiling_reached');
  assert.equal(refused.admissions,1);
  assert.equal(Array.from(bank.rows.values()).filter(row=>row.phase==='INTENT').length,1);
});

test('parallel live fallbacks share one reconciliation snapshot and do not orphan each other',
  {concurrency:false},async function () {
    const bank=fakeBank();
    const h=installBoundaryHarness({bank:bank});
    try{
      const responses=await h.spend.withAttribution(ambientAttribution(),function(){
        return Promise.all([paidRequest(),paidRequest()]);
      });
      assert.deepEqual(responses.map(response=>response.status),[200,200]);
      assert.equal(h.providerCalls(),2);
      const reconciliationCalls=bank.calls.filter(call=>
        call.url.includes('/rpc/reconcile_anew_provider_spend_unknown'));
      assert.equal(reconciliationCalls.length,1);
      assert.equal(Array.from(bank.rows.values()).filter(row=>row.phase==='INTENT').length,2);
    }finally{h.restore();}
  });

test('lost INTENT acknowledgment never authorizes provider traffic or a resend',
  {concurrency:false},async function () {
    const bank=fakeBank({lostIntentAck:true});
    const h=installBoundaryHarness({bank:bank});
    try{
      const responses=await h.spend.withAttribution(ambientAttribution(),async function(){
        return [await paidRequest(),await paidRequest()];
      });
      assert.equal(responses[0].status,503);
      assert.equal((await responses[0].json()).error.reason,'provider_spend_intent_ack_lost');
      assert.equal(responses[1].status,503);
      assert.equal((await responses[1].json()).error.reason,'provider_spend_intent_ack_lost');
      assert.equal(h.providerCalls(),0);
      assert.equal(Array.from(bank.rows.values()).filter(row=>row.phase==='INTENT').length,1);
    }finally{h.restore();}
  });

test('lost TERMINAL acknowledgment is recovered by exact readback without provider replay',
  {concurrency:false},async function () {
    const h=installBoundaryHarness({bank:fakeBank({lostTerminalAck:true})});
    try{
      const response=await h.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,200);
      assert.equal(h.providerCalls(),1);
      assert.equal(h.spend.usageToday(),1);
    }finally{h.restore();}
  });

test('a stale crash-window INTENT becomes OUTCOME_UNKNOWN and holds after process restart',
  {concurrency:false},async function () {
    const bank=fakeBank({intentCreatedAt:'2020-01-01T00:00:00.000Z'});
    const store=require(RECEIPT_PATH);
    const receipt=prepared(store).receipt;
    assert.equal((await store.claimIntent(receipt,{fetchImpl:bank.fetch,
      env:fixtureEnv(),ceiling:100})).ok,true);

    const first=installBoundaryHarness({bank:bank});
    try{
      const response=await first.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,503);
      assert.equal((await response.json()).error.reason,'provider_spend_outcome_unknown_hold');
      assert.equal(first.providerCalls(),0,'reconciliation never repeats provider traffic');
    }finally{first.restore();}

    delete require.cache[RECEIPT_PATH];
    const restarted=installBoundaryHarness({bank:bank});
    try{
      const response=await restarted.spend.withAttribution(ambientAttribution(),paidRequest);
      assert.equal(response.status,503);
      assert.equal((await response.json()).error.reason,'provider_spend_outcome_unknown_hold');
      assert.equal(restarted.providerCalls(),0,'the exact request hold survives module restart');
      const terminal=Array.from(bank.rows.values()).find(row=>row.phase==='TERMINAL');
      assert.equal(terminal.disposition,'OUTCOME_UNKNOWN');
    }finally{restarted.restore();}
  });

test('a different request after restart globally closes a stale orphan before paid egress',
  {concurrency:false},async function () {
    const bank=fakeBank({intentCreatedAt:'2020-01-01T00:00:00.000Z'});
    const store=require(RECEIPT_PATH);
    const orphanAttribution=Object.assign({},attribution(),{
      cycle_id:'cycle.orphan.old',request_id:'request.orphan.old'});
    const orphan=prepared(store,{attribution:orphanAttribution}).receipt;
    assert.equal((await store.claimIntent(orphan,{fetchImpl:bank.fetch,
      env:fixtureEnv(),ceiling:100})).ok,true);

    delete require.cache[RECEIPT_PATH];
    const restarted=installBoundaryHarness({bank:bank});
    try{
      const nextAttribution=Object.assign({},ambientAttribution(),{
        cycle_id:'cycle.after.restart',request_id:'request.after.restart'});
      const held=await restarted.spend.withAttribution(nextAttribution,paidRequest);
      assert.equal(held.status,503);
      const heldBody=await held.json();
      assert.equal(heldBody.error.reason,'provider_spend_outcome_unknown_hold');
      assert.doesNotMatch(JSON.stringify(heldBody),/request\.orphan\.old|cycle\.orphan\.old/,
        'global reconciliation returns counts, never another receipt identity');
      assert.equal(restarted.providerCalls(),0);
      assert.equal(bank.rows.get(orphan.attempt_id+':TERMINAL').disposition,'OUTCOME_UNKNOWN');
      assert.equal(bank.rows.has(orphan.attempt_id+':INTENT'),true);
      assert.equal(Array.from(bank.rows.values()).some(row=>row.phase==='INTENT'&&
        row.request_id==='request.after.restart'),false,
      'the discovering request is held before it can claim or call a provider');

      const laterAttribution=Object.assign({},ambientAttribution(),{
        cycle_id:'cycle.after.drain',request_id:'request.after.drain'});
      const later=await restarted.spend.withAttribution(laterAttribution,paidRequest);
      assert.equal(later.status,200,
        'a historical unknown does not permanently hold an unrelated later request');
      assert.equal(restarted.providerCalls(),1);
    }finally{restarted.restore();}
  });

test('global stale reconciliation drains at most one hundred rows per admission check',
  {concurrency:false},async function () {
    const bank=fakeBank({intentCreatedAt:'2020-01-01T00:00:00.000Z'});
    const store=require(RECEIPT_PATH);
    for(let index=0;index<101;index+=1){
      const exact=Object.assign({},attribution(),{
        cycle_id:'cycle.stale.'+index,request_id:'request.stale.'+index});
      const receipt=prepared(store,{attribution:exact}).receipt;
      assert.equal((await store.claimIntent(receipt,{fetchImpl:bank.fetch,
        env:fixtureEnv(),ceiling:1000})).ok,true);
    }

    const h=installBoundaryHarness({bank:bank,dailyCeil:1000});
    try{
      for(const suffix of ['first','second']){
        const exact=Object.assign({},ambientAttribution(),{
          cycle_id:'cycle.drain.'+suffix,request_id:'request.drain.'+suffix});
        const response=await h.spend.withAttribution(exact,paidRequest);
        assert.equal(response.status,503);
        assert.equal((await response.json()).error.reason,'provider_spend_outcome_unknown_hold');
        assert.equal(h.providerCalls(),0);
      }
      const unknowns=Array.from(bank.rows.values()).filter(row=>
        row.phase==='TERMINAL'&&row.disposition==='OUTCOME_UNKNOWN');
      assert.equal(unknowns.length,101);
      const finalAttribution=Object.assign({},ambientAttribution(),{
        cycle_id:'cycle.drain.final',request_id:'request.drain.final'});
      const final=await h.spend.withAttribution(finalAttribution,paidRequest);
      assert.equal(final.status,200);
      assert.equal(h.providerCalls(),1);
    }finally{h.restore();}
  });

test('durable summary separates admission, terminal, failure, unresolved, and proven egress',
  async function () {
    const bank=fakeBank();
    const store=require(RECEIPT_PATH);
    function make(number){return prepared(store,{attribution:Object.assign({},attribution(),{
      cycle_id:'cycle.summary.'+number,request_id:'request.summary.'+number})}).receipt;}
    const success=make(1),unresolved=make(2),unknown=make(3),httpFailure=make(4);
    for(const receipt of [success,unresolved,unknown,httpFailure]){
      assert.equal((await store.claimIntent(receipt,{fetchImpl:bank.fetch,
        env:fixtureEnv(),ceiling:100})).ok,true);
    }
    assert.equal((await store.writeTerminal(success,{status_code:200,disposition:'SUCCEEDED'},
      {fetchImpl:bank.fetch,env:fixtureEnv()})).ok,true);
    assert.equal((await store.writeTerminal(unknown,{status_code:null,disposition:'OUTCOME_UNKNOWN'},
      {fetchImpl:bank.fetch,env:fixtureEnv()})).ok,true);
    assert.equal((await store.writeTerminal(httpFailure,{status_code:429,disposition:'HTTP_ERROR'},
      {fetchImpl:bank.fetch,env:fixtureEnv()})).ok,true);
    const summary=await store.readSummary({fetchImpl:bank.fetch,env:fixtureEnv()});
    assert.equal(summary.admissions,4);
    assert.equal(summary.terminal,3);
    assert.equal(summary.succeeded,1);
    assert.equal(summary.failed,1);
    assert.equal(summary.unresolved,1);
    assert.equal(summary.outcome_unknown,1);
    assert.equal(summary.proven_egress,2);
    assert.equal(summary.total,summary.admissions,'legacy total is admissions, never egress');
  });

test('migration extends the canonical ledger with one atomic RPC and private writes', function () {
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/0007_provider_spend_atomic_admission.sql'),'utf8');
  assert.doesNotMatch(sql,/create\s+table/i,'the repair must not create a competing spend ledger');
  assert.match(sql,/claim_anew_provider_spend_intent\s*\(\s*p_receipt jsonb,p_ceiling integer/i);
  assert.match(sql,/pg_advisory_xact_lock[\s\S]*select count\(\*\)[\s\S]*insert into memory_bank\.provider_spend_receipts/i);
  assert.match(sql,/reconcile_anew_provider_spend_unknown[\s\S]*OUTCOME_UNKNOWN/i);
  assert.match(sql,/with stale_intents as[\s\S]*order by intent\.created_at,intent\.attempt_id[\s\S]*limit 100[\s\S]*from stale_intents intent/i);
  assert.match(sql,/'stale_remaining',stale_remaining/i);
  assert.match(sql,/revoke insert,update,delete,truncate,references,trigger[\s\S]*service_role/i);
  assert.match(sql,/\$provider_spend_atomic_grant_and_acl_assert\$[\s\S]*claim_anew_provider_spend_intent[\s\S]*execute format\('grant execute on function %s to service_role'/i);
  const statements=migrate._test.splitStatements(sql);
  const finalGrant=statements.findIndex(statement=>
    statement.includes('$provider_spend_atomic_grant_and_acl_assert$'));
  const firstCreate=statements.findIndex(statement=>
    /^create or replace function public\.claim_anew_provider_spend_intent/i.test(statement));
  const reconcileCreate=statements.find(statement=>
    /^create or replace function public\.reconcile_anew_provider_spend_unknown/i.test(statement));
  const defaultRevoke=statements.findIndex(statement=>
    /^alter default privileges revoke execute on functions from public/i.test(statement));
  assert.ok(finalGrant>firstCreate&&firstCreate>defaultRevoke);
  assert.match(reconcileCreate,/security definer[\s\S]*set search_path=pg_catalog,pg_temp/i);
  const reconcileReturns=Array.from(reconcileCreate.matchAll(/return jsonb_build_object\([\s\S]*?\);/gi));
  assert.ok(reconcileReturns.length>=2);
  const reconcileReturn=reconcileReturns.at(-1)[0];
  assert.doesNotMatch(reconcileReturn,/attempt_id|component|provider|key_alias/i,
    'the global sweep may return counts and the caller scope, never stale receipt identity');
  assert.match(statements[finalGrant],/reconcile_anew_provider_spend_unknown\(text,text,text,integer\)/i);
  assert.equal(statements.slice(0,finalGrant).some(statement=>
    /grant execute on function[^;]*to service_role/i.test(statement)),false,
  'no paid RPC is reachable until the final atomic grant and ACL assertion');
});
