// ⬡B:tests.provider_boundary_coda_budget:TEST:one_wake_caps_actual_paid_egress:20260725⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const BOUNDARY_PATH = require.resolve('../pai/core/provider.boundary.js');
const SPEND_PATH = require.resolve('../pai/core/spend.guard.js');
const budget = require('../pai/core/coda/model.budget.js');

function makeTicket(cap) {
  const env = {CODA_MODEL_CALL_BUDGET:'1',
    CODA_PAID_PROVIDER_ATTEMPT_BUDGET:String(cap)};
  return {env:env,ticket:budget.ensure(null,1,env)};
}

function installHarness(options) {
  const opts = options || {};
  const previousFetch = global.fetch;
  const hadInstalled = Object.prototype.hasOwnProperty.call(global,
    '__providerBoundaryInstalled');
  const previousInstalled = global.__providerBoundaryInstalled;
  const hadDeny = Object.prototype.hasOwnProperty.call(global,
    '__providerBoundaryDenyPaidEgress');
  const previousDeny = global.__providerBoundaryDenyPaidEgress;
  const previousCeil = process.env.DAILY_MODEL_CALL_CEIL;
  const previousImageCeil = process.env.DAILY_IMAGE_CALL_CEIL;
  const previousBoundaryModule = require.cache[BOUNDARY_PATH];
  const previousSpendModule = require.cache[SPEND_PATH];
  const calls = [];
  const receiptEvents = [];
  const receiptStore = {
    prepare:function(spec){return{ok:true,receipt:{attempt_id:'fixture-' +
      String(spec.attempt_order),attempt_order:spec.attempt_order,ham_uid:'HAM.FIXTURE',
      cycle_id:'cycle.fixture',request_id:'request.fixture'}};},
    reconcileUnresolved:async function(){return{ok:true,unresolved:0,
      resolved_unknown:0,outcome_unknown:0};},
    claimIntent:async function(receipt){receiptEvents.push({phase:'INTENT',receipt:receipt});
      if(opts.dailyCeil===0)return{ok:false,reason:'daily_spend_ceiling_reached',
        admissions:1,ceiling:1};
      return opts.intentFailure ? {ok:false,reason:'provider_spend_intent_write_failed'} : {ok:true};},
    terminalFromResponse:async function(response){return{status_code:response.status,
      disposition:response.ok?'SUCCEEDED':'HTTP_ERROR'};},
    terminalFromError:function(){return{status_code:null,disposition:'OUTCOME_UNKNOWN'};},
    writeTerminal:async function(receipt,outcome){receiptEvents.push({phase:'TERMINAL',
      receipt:receipt,outcome:outcome});return opts.terminalFailure
        ? {ok:false,reason:'provider_spend_terminal_write_failed'} : {ok:true};}
  };

  process.env.DAILY_MODEL_CALL_CEIL = String(opts.dailyCeil === 0 ? 1 :
    (opts.dailyCeil == null ? 100 : opts.dailyCeil));
  if (opts.imageCeil == null) delete process.env.DAILY_IMAGE_CALL_CEIL;
  else process.env.DAILY_IMAGE_CALL_CEIL=String(opts.imageCeil === 0 ? 1 : opts.imageCeil);
  delete require.cache[BOUNDARY_PATH];
  delete require.cache[SPEND_PATH];
  delete global.__providerBoundaryInstalled;
  delete global.__providerBoundaryDenyPaidEgress;
  global.fetch = async function (url, init) {
    calls.push({url:String(url && url.url || url),init:init});
    if (opts.throwFetch) throw new Error('scripted_network_failure');
    return new Response(JSON.stringify({ok:true}), {
      status:200,headers:{'Content-Type':'application/json'}
    });
  };

  const boundary = require(BOUNDARY_PATH);
  boundary.install({denyPaidEgress:opts.denyPaidEgress === true,
    providerBudgetAuthority:budget,receiptStore:receiptStore});
  const spend = require(SPEND_PATH);

  return {boundary:boundary,spend:spend,calls:calls,receiptEvents:receiptEvents,
    restore:function () {
    global.fetch = previousFetch;
    if (hadInstalled) global.__providerBoundaryInstalled = previousInstalled;
    else delete global.__providerBoundaryInstalled;
    if (hadDeny) global.__providerBoundaryDenyPaidEgress = previousDeny;
    else delete global.__providerBoundaryDenyPaidEgress;
    if (previousCeil === undefined) delete process.env.DAILY_MODEL_CALL_CEIL;
    else process.env.DAILY_MODEL_CALL_CEIL = previousCeil;
    if (previousImageCeil === undefined) delete process.env.DAILY_IMAGE_CALL_CEIL;
    else process.env.DAILY_IMAGE_CALL_CEIL=previousImageCeil;
    delete require.cache[BOUNDARY_PATH];
    delete require.cache[SPEND_PATH];
    if (previousBoundaryModule) require.cache[BOUNDARY_PATH] = previousBoundaryModule;
    if (previousSpendModule) require.cache[SPEND_PATH] = previousSpendModule;
  }};
}

test('one CODA wake permits exactly N actual paid requests across concurrent provider fallbacks',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    try {
      const value = makeTicket(3);
      const urls = [
        'https://openrouter.ai/api/v1/chat/completions',
        'https://api.together.xyz/v1/chat/completions',
        'https://api.anthropic.com/v1/messages',
        'https://openrouter.ai/api/v1/chat/completions',
        'https://api.together.ai/v1/chat/completions'
      ];
      const responses = await budget.runProviderScope(value.ticket,
        {component:'coda.sensor',intent_source:'github.webhook'}, async function () {
          return Promise.all(urls.map(function (url) {
            return global.fetch(url,{method:'POST',body:'{}'});
          }));
        }, value.env);

      assert.equal(h.calls.length,3,'N+1 and later never reach realFetch');
      assert.deepEqual(responses.map(function (response) { return response.status; }),
        [200,200,200,429,429]);
      const firstRefusal = await responses[3].json();
      assert.equal(firstRefusal.error.reason,
        'coda_paid_provider_attempt_budget_exhausted');
      assert.equal(value.ticket.used_paid_provider_attempts,3);
      assert.equal(value.ticket.remaining_paid_provider_attempts,0);
      assert.equal(value.ticket.provider_attempts.length,3);
      assert.ok(value.ticket.provider_attempts.every(function (attempt) {
        return attempt.ok === true && attempt.status_code === 200 && attempt.completed_at;
      }));
      assert.equal(h.spend.usageToday(),3,
        'only requests admitted to real egress consume a daily slot');
    } finally { h.restore(); }
  });

test('durable daily refusal preserves Coda reservation and terminal settlement semantics',
  {concurrency:false},async function () {
    const h=installHarness({dailyCeil:0});
    try{
      const value=makeTicket(1);
      const response=await budget.runProviderScope(value.ticket,
        {component:'coda.sensor',intent_source:'render.deploy'},function(){
          return global.fetch('https://api.anthropic.com/v1/messages',{method:'POST',body:'{}'});
        },value.env);
      assert.equal(response.status,429);
      assert.equal(h.calls.length,0);
      assert.equal(value.ticket.used_paid_provider_attempts,1);
      assert.equal(value.ticket.remaining_paid_provider_attempts,0);
      assert.equal(value.ticket.provider_attempts[0].ok,false);
      assert.equal(value.ticket.provider_attempts[0].error,'daily_spend_ceiling_reached');
      assert.ok(value.ticket.provider_attempts[0].completed_at);
    }finally{h.restore();}
  });

test('scoped non-egress guard checks are no-ops and actual egress counts once',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    try {
      const value = makeTicket(3);
      await budget.runProviderScope(value.ticket,
        {component:'coda.sensor',intent_source:'render.deploy'}, async function () {
          for (let i = 0; i < 3; i += 1) {
            assert.equal(h.spend.allow('text'),true,
              'ladder or tool-loop admission must not double count');
            const response = await global.fetch(
              'https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}'});
            assert.equal(response.status,200);
          }
        }, value.env);
      assert.equal(h.calls.length,3);
      assert.equal(h.spend.usageToday(),3,
        'three real scoped egresses consume exactly three daily slots');
    } finally { h.restore(); }
  });

test('Anthropic messages are metered at the paid boundary',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:0});
    try {
      assert.equal(h.boundary.isMeteredPaidCall(
        'https://api.anthropic.com/v1/messages'),true);
      const response = await global.fetch('https://api.anthropic.com/v1/messages',
        {method:'POST',body:'{}'});
      assert.equal(response.status,429);
      assert.equal(h.calls.length,0,'the daily brake stops Anthropic before realFetch');
      const body = await response.json();
      assert.equal(body.error.message,'daily_spend_ceiling_reached_at_boundary');
    } finally { h.restore(); }
  });

test('paid transcription and embedding egress are recognized and stopped at the boundary',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:0});
    try {
      const paths = [
        ['https://api.together.xyz/v1/audio/transcriptions','audio'],
        ['https://openrouter.ai/api/v1/embeddings','embedding'],
        ['https://api.elevenlabs.io/v1/speech-to-text','audio'],
        ['https://api.elevenlabs.io/v1/text-to-speech/voice123','audio'],
        ['https://api.elevenlabs.io/v1/text-to-dialogue','audio'],
        ['https://api.deepgram.com/v1/listen?model=nova-2','audio']
      ];
      for (const [url,kind] of paths) {
        assert.equal(h.boundary.paidCallKind(url),kind);
        assert.equal(h.boundary.isMeteredPaidCall(url),true);
        const response = await global.fetch(url,{method:'POST',body:'{}'});
        assert.equal(response.status,429);
      }
      assert.equal(h.calls.length,0,'neither paid non-chat request reaches realFetch');
    } finally { h.restore(); }
  });

test('paid image and video submissions are counted only at actual egress',
  {concurrency:false},async function(){
    const h=installHarness({dailyCeil:100});
    try{
      const paths=[
        ['https://api.together.xyz/v1/images/generations','image'],
        ['https://fal.run/fal-ai/flux/schnell','image'],
        ['https://queue.fal.run/fal-ai/kling-video/v2.5/text-to-video','video'],
        ['https://api.replicate.com/v1/models/acme/video/predictions','video'],
        ['https://api.simli.ai/static/audio','video'],
        ['https://api.liveavatar.com/v1/sessions/token','video']
      ];
      assert.equal(h.spend.allow('image'),true);
      assert.equal(h.spend.allow('video'),true);
      assert.equal(h.spend.usageToday(),0,'image/video admission does not pre-spend a slot');
      for(const [url,kind] of paths){
        assert.equal(h.boundary.paidCallKind(url),kind);
        const response=await global.fetch(url,{method:'POST',body:'{}'});
        assert.equal(response.status,200);
      }
      assert.equal(h.calls.length,paths.length);
      assert.equal(h.spend.usageToday(),paths.length,'every actual provider submission counts once');
      assert.equal(h.boundary.paidCallKind(
        'https://queue.fal.run/fal-ai/kling-video/v2.5/requests/id/status'),null,
        'free status polling is not charged as a new generation');
    }finally{h.restore();}
  });

test('the face deny mode blocks LiveAvatar and ElevenLabs before provider egress',
  {concurrency:false},async function(){
    const h=installHarness({dailyCeil:100,denyPaidEgress:true});
    try{
      for(const url of ['https://api.liveavatar.com/v1/sessions/token',
        'https://api.elevenlabs.io/v1/text-to-speech/voice123']){
        const response=await global.fetch(url,{method:'POST',body:'{}'});
        assert.equal(response.status,403);
        const body=await response.json();
        assert.equal(body.error.reason,'face_paid_provider_egress_forbidden');
      }
      assert.equal(h.calls.length,0);
      assert.equal(h.spend.usageToday(),0);
    }finally{h.restore();}
  });

test('image and video ceilings stop Together, FAL, and Replicate before egress',
  {concurrency:false},async function(){
    const h=installHarness({dailyCeil:0,imageCeil:0});
    try{
      const urls=['https://api.together.xyz/v1/images/generations',
        'https://fal.run/fal-ai/flux/schnell',
        'https://queue.fal.run/fal-ai/kling-video/v2.5/text-to-video',
        'https://api.replicate.com/v1/models/acme/video/predictions'];
      for(const url of urls){
        const response=await global.fetch(url,{method:'POST',body:'{}'});
        assert.equal(response.status,429);
      }
      assert.equal(h.calls.length,0);
      assert.equal(h.spend.usageToday(),0);
    }finally{h.restore();}
  });

test('an invalid active provider scope fails closed before network egress',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    try {
      const value = makeTicket(2);
      const response = await budget.runProviderScope(value.ticket,
        {component:'coda.sensor',intent_source:'github.webhook'}, async function () {
          value.ticket.remaining_paid_provider_attempts = 'forged';
          return global.fetch('https://api.together.xyz/v1/chat/completions',
            {method:'POST',body:'{}'});
        }, value.env);
      assert.equal(response.status,429);
      assert.equal(h.calls.length,0);
      const body = await response.json();
      assert.equal(body.error.reason,'coda_paid_provider_attempt_budget_invalid');
      assert.equal(h.spend.usageToday(),0);
    } finally { h.restore(); }
  });

test('a throwing CODA scope API cannot fail open onto a paid provider',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    const original = budget.currentProviderScope;
    try {
      budget.currentProviderScope = function () { throw new Error('scope_unavailable'); };
      const response = await global.fetch(
        'https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}'});
      assert.equal(response.status,429);
      assert.equal(h.calls.length,0);
      const body = await response.json();
      assert.equal(body.error.reason,'coda_paid_provider_attempt_budget_invalid');
    } finally {
      budget.currentProviderScope = original;
      h.restore();
    }
  });

test('a throwing spend guard fails closed outside CODA before paid network egress',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    const original = h.spend.ceilDetail;
    try {
      h.spend.ceilDetail = function () { throw new Error('guard_unavailable'); };
      const response = await global.fetch(
        'https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}'});
      assert.equal(response.status,503);
      assert.equal(h.calls.length,0);
      const body = await response.json();
      assert.equal(body.error.reason,'spend_guard_unavailable_at_boundary');
    } finally {
      h.spend.ceilDetail = original;
      h.restore();
    }
  });

test('a scoped network failure settles the admitted attempt as an error',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100,throwFetch:true});
    try {
      const value = makeTicket(1);
      const response = await budget.runProviderScope(value.ticket,
        {component:'coda.sensor',intent_source:'render.deploy'}, async function () {
          return global.fetch('https://api.anthropic.com/v1/messages',
            {method:'POST',body:'{}'});
        }, value.env);
      assert.equal(response.status,503);
      assert.equal(h.calls.length,1);
      assert.equal(value.ticket.used_paid_provider_attempts,1);
      assert.equal(value.ticket.provider_attempts[0].ok,false);
      assert.equal(value.ticket.provider_attempts[0].status_code,null);
      assert.match(value.ticket.provider_attempts[0].error,/scripted_network_failure/);
      assert.ok(value.ticket.provider_attempts[0].completed_at);
      assert.equal(h.spend.usageToday(),1);
    } finally { h.restore(); }
  });

test('outside CODA admission is read-only and only actual paid egress is counted',
  {concurrency:false}, async function () {
    const h = installHarness({dailyCeil:100});
    try {
      assert.equal(h.spend.allow('text'),true);
      assert.equal(h.spend.usageToday(),0,
        'an ordinary non-egress consultation is admission, not spend');
      const response = await global.fetch(
        'https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}'});
      assert.equal(response.status,200);
      assert.equal(h.calls.length,1);
      assert.equal(h.spend.usageToday(),1,
        'the actual provider request consumes exactly one daily slot');
    } finally { h.restore(); }
  });
