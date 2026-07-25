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

test('malformed ceilings fail closed rather than becoming unlimited spend', function () {
  process.env.DAILY_MODEL_CALL_CEIL='99999999';
  const guard=freshGuard();
  assert.equal(guard.allow('text'),false);
  assert.equal(guard.lastDenial().reason,'daily_call_ceiling_configuration_invalid');
  assert.equal(guard.usageToday(),0);
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
  const realFetch=global.fetch;
  const priorInstalled=global.__providerBoundaryInstalled;
  let network=0;
  global.fetch=async function () { network++; return new Response('{}',{status:200}); };
  delete global.__providerBoundaryInstalled;
  delete require.cache[require.resolve('../pai/core/spend.guard.js')];
  delete require.cache[require.resolve('../pai/core/provider.boundary.js')];
  const guard=require('../pai/core/spend.guard.js');
  const boundary=require('../pai/core/provider.boundary.js');
  boundary.install();
  try {
    const first=await global.fetch('https://openrouter.ai/api/v1/chat/completions',
      {method:'POST',body:'{}'});
    const second=await global.fetch('https://openrouter.ai/api/v1/chat/completions',
      {method:'POST',body:'{}'});
    assert.equal(first.status,200);
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
