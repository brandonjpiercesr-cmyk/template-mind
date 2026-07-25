// ⬡B:tests.provider_boundary_shared_keys:TEST:shared_provider_wallets_cannot_spend:20260725⬡
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('Together RunPod and Anthropic shared keys are blocked before paid egress',async function(){
  const saved={fetch:global.fetch,installed:global.__providerBoundaryInstalled,
    together:process.env.TOGETHER_API_KEY,runpod:process.env.RUNPOD_API_KEY,
    anthropic:process.env.ANTHROPIC_API_KEY,ceil:process.env.DAILY_MODEL_CALL_CEIL};
  process.env.TOGETHER_API_KEY='shared-together-fixture';
  process.env.RUNPOD_API_KEY='shared-runpod-fixture';
  process.env.ANTHROPIC_API_KEY='shared-anthropic-fixture';
  process.env.DAILY_MODEL_CALL_CEIL='100';
  let network=0;
  global.fetch=async function(){network++;return new Response('{}',{status:200});};
  delete global.__providerBoundaryInstalled;
  delete require.cache[require.resolve('../pai/core/provider.boundary.js')];
  require('../pai/core/spend.guard.js')._test.reset();
  const boundary=require('../pai/core/provider.boundary.js');
  boundary.install();
  try {
    const probes=[
      ['https://api.together.xyz/v1/chat/completions',{Authorization:'Bearer shared-together-fixture'}],
      ['https://api.runpod.ai/v2/endpoint/runsync',{Authorization:'Bearer shared-runpod-fixture'}],
      ['https://api.anthropic.com/v1/messages',{'x-api-key':'shared-anthropic-fixture'}]
    ];
    for(const probe of probes){
      const response=await global.fetch(probe[0],{method:'POST',headers:probe[1],body:'{}'});
      assert.equal(response.status,429);
      const body=await response.json();
      assert.equal(body.error.reason,'anonymous_shared_provider_key_forbidden');
      assert.doesNotMatch(JSON.stringify(body),/fixture/);
    }
    assert.equal(network,0);
  } finally {
    global.fetch=saved.fetch;
    if(saved.installed===undefined)delete global.__providerBoundaryInstalled;
    else global.__providerBoundaryInstalled=saved.installed;
    for(const pair of [['TOGETHER_API_KEY',saved.together],['RUNPOD_API_KEY',saved.runpod],
      ['ANTHROPIC_API_KEY',saved.anthropic],['DAILY_MODEL_CALL_CEIL',saved.ceil]]){
      if(pair[1]===undefined)delete process.env[pair[0]];else process.env[pair[0]]=pair[1];
    }
  }
});

test('component-specific provider credentials remain eligible for the bounded boundary',function(){
  const boundary=require('../pai/core/provider.boundary.js');
  const env={TOGETHER_API_KEY:'shared-together',RUNPOD_API_KEY:'shared-runpod',
    ANTHROPIC_API_KEY:'shared-anthropic'};
  assert.equal(boundary.sharedProviderCredential('https://api.together.xyz/v1/chat/completions',
    {headers:{Authorization:'Bearer component-together'}},env),null);
  assert.equal(boundary.sharedProviderCredential('https://api.runpod.ai/v2/x/runsync',
    {headers:{Authorization:'Bearer component-runpod'}},env),null);
  assert.equal(boundary.sharedProviderCredential('https://api.anthropic.com/v1/messages',
    {headers:{'x-api-key':'component-anthropic'}},env),null);
});
