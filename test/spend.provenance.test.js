// ⬡B:test.spend_provenance:CONTRACT:one_exact_component_one_real_egress:20260725⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINALS = {
  model:process.env.DAILY_MODEL_CALL_CEIL,
  image:process.env.DAILY_IMAGE_CALL_CEIL,
  shared:process.env.OPENROUTER_API_KEY,
  seat:process.env.OR_KEY_C2_ORGAN,
  together:process.env.TOGETHER_API_KEY,
  monitor:process.env.OR_KEY_ACCOUNT_MONITOR
};

function restore(name,value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function freshGuard() {
  delete require.cache[require.resolve('../pai/core/spend.guard.js')];
  return require('../pai/core/spend.guard.js');
}

function receiptStoreFixture() {
  return {
    prepare:function (spec) {
      assert.equal(spec.attribution.ham_uid,'HAM.SPEND.TEST');
      return {ok:true,receipt:{attempt_id:'spend-provenance-fixture'}};
    },
    claimIntent:async function () { return {ok:true}; },
    terminalFromResponse:async function (response) {
      return {status_code:response.status,disposition:'PROVIDER_RESPONSE'};
    },
    terminalFromError:function () {
      return {status_code:null,disposition:'NETWORK_ERROR'};
    },
    writeTerminal:async function () { return {ok:true}; }
  };
}

test.afterEach(function () {
  restore('DAILY_MODEL_CALL_CEIL',ORIGINALS.model);
  restore('DAILY_IMAGE_CALL_CEIL',ORIGINALS.image);
  restore('OPENROUTER_API_KEY',ORIGINALS.shared);
  restore('OR_KEY_C2_ORGAN',ORIGINALS.seat);
  restore('TOGETHER_API_KEY',ORIGINALS.together);
  restore('OR_KEY_ACCOUNT_MONITOR',ORIGINALS.monitor);
});

test('admission is free and only real egress consumes the bounded daily slot', function () {
  process.env.DAILY_MODEL_CALL_CEIL='2';
  const guard=freshGuard();
  assert.equal(guard.allow('text'),true);
  assert.equal(guard.usageToday(),0);
  assert.equal(guard.allow('text',{egress:true}),true);
  assert.equal(guard.allow('text',{egress:true}),true);
  assert.equal(guard.allow('text'),false);
  assert.equal(guard.usageToday(),2);
});

// The fixture was '99999999'. An OVERSIZED value now clamps to the maximum instead of
// refusing: refusing one muted the founder's mind live on 20260726 while he was RAISING the
// budget, which is the guard causing the exact harm it exists to prevent. Unreadable still
// fails closed, so this uses a value nobody can read.
test('malformed ceilings fail closed rather than becoming unlimited spend', function () {
  process.env.DAILY_MODEL_CALL_CEIL='two thousand';
  const guard=freshGuard();
  assert.equal(guard.allow('text'),false);
  assert.equal(guard.lastDenial().reason,'daily_call_ceiling_configuration_invalid');
  assert.equal(guard.usageToday(),0);
});

test('an oversized ceiling clamps to the maximum and she keeps speaking', function () {
  process.env.DAILY_MODEL_CALL_CEIL='99999999';
  const guard=freshGuard();
  const detail=guard._test.ceilDetail('text');
  assert.equal(detail.value,10000,'the brake still exists, at the number this system chose');
  assert.equal(detail.source,'env_clamped');
  assert.equal(detail.requested,99999999,'what was asked for is kept, so nobody thinks the edit vanished');
  assert.equal(guard.allow('text'),true,'she can speak; refusing here was the bug');
});

test('concurrent denials stay bound to exact HAM cycle request seat and component', async function () {
  process.env.DAILY_MODEL_CALL_CEIL='1';
  const guard=freshGuard();
  assert.equal(guard.allow('text',{egress:true}),true);
  const scopes=['one','two'].map(function (name) { return {
    ham_uid:'HAM.'+name.toUpperCase(),cycle_id:'cycle.'+name,request_id:'request.'+name,
    seat:'c2_organ',component:'template.cycle'}; });
  await Promise.all(scopes.map(function (scope) {
    return guard.withAttribution(scope,async function () {
      await Promise.resolve();
      assert.equal(guard.allow('text'),false);
    });
  }));
  scopes.forEach(function (scope) {
    const denial=guard.lastDenial(120000,scope);
    assert.ok(denial);
    assert.equal(denial.attribution.request_id,scope.request_id);
  });
  assert.equal(guard.lastDenial(120000,{ham_uid:'HAM.OTHER',cycle_id:'cycle.other',
    request_id:'request.other',seat:'c2_organ',component:'template.cycle'}),null);
});

test('a seat never borrows the shared OpenRouter key', function () {
  process.env.OPENROUTER_API_KEY='shared-key-must-not-be-used';
  delete process.env.OR_KEY_C2_ORGAN;
  delete require.cache[require.resolve('../pai/core/seat.map.js')];
  const seats=require('../pai/core/seat.map.js');
  assert.equal(seats.resolveKey(seats.seat('c2_organ')),'');
  process.env.OR_KEY_C2_ORGAN=' seat-key\n';
  assert.equal(seats.resolveKey(seats.seat('c2_organ')),'seat-key');
});

test('the provider boundary meters each paid HTTP egress exactly once and fails closed', async function () {
  process.env.DAILY_MODEL_CALL_CEIL='1';
  process.env.OR_KEY_C2_ORGAN='seat-key-fixture';
  const realFetch=global.fetch;
  const priorInstalled=global.__providerBoundaryInstalled;
  let network=0;
  global.fetch=async function (url) {
    if(String(url).indexOf('/api/v1/key')>=0)return new Response(JSON.stringify({
      data:{usage_daily:0}}),{status:200,headers:{'Content-Type':'application/json'}});
    network++;return new Response('{}',{status:200});
  };
  delete global.__providerBoundaryInstalled;
  delete require.cache[require.resolve('../pai/core/spend.guard.js')];
  delete require.cache[require.resolve('../pai/core/provider.boundary.js')];
  const guard=require('../pai/core/spend.guard.js');
  const boundary=require('../pai/core/provider.boundary.js');
  boundary.install({receiptStore:receiptStoreFixture(),
    env:{RENDER_SERVICE_ID:'srv-template-test'}});
  try {
    const responses=await guard.withAttribution({ham_uid:'HAM.SPEND.TEST',
      cycle_id:'cycle.spend.test.0001',request_id:'request.spend.test.0001',
      component:'template.cycle',seat:'c2_organ',owner_node_id:'station.pai',
      target_wonder_id:'wonder.anu',service_id:'srv-template-test'},async function () {
      const request={method:'POST',headers:{Authorization:'Bearer seat-key-fixture',
        'Content-Type':'application/json'},body:JSON.stringify({model:'fixture/model-v1'})};
      return [await global.fetch('https://openrouter.ai/api/v1/chat/completions',request),
        await global.fetch('https://openrouter.ai/api/v1/chat/completions',request)];
    });
    const first=responses[0],second=responses[1];
    const firstFailure=first.status===200?null:await first.clone().json();
    assert.equal(first.status,200,JSON.stringify(firstFailure));
    assert.equal(second.status,429);
    assert.equal(network,1);
    assert.equal(guard.usageToday(),1);
    assert.equal(boundary.paidCallKind('https://api.deepgram.com/v1/listen'),'audio');
    assert.equal(boundary.paidCallKind('https://fal.run/flux/dev'),'image');
  } finally {
    global.fetch=realFetch;
    if (priorInstalled === undefined) delete global.__providerBoundaryInstalled;
    else global.__providerBoundaryInstalled=priorInstalled;
  }
});

test('balance monitoring never manufactures a paid Together completion', async function () {
  process.env.TOGETHER_API_KEY='present-but-unused';
  delete process.env.OR_KEY_ACCOUNT_MONITOR;
  const guard=freshGuard();
  const realFetch=global.fetch;
  let calls=0;
  global.fetch=async function () { calls++; throw new Error('network must stay quiet'); };
  try {
    assert.deepEqual(await guard.checkBalances(),[]);
    assert.equal(calls,0);
  } finally { global.fetch=realFetch; }
});
