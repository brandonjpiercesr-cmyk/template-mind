'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const receipt=require('../pai/core/provider.spend.receipt.js');
const ladder=require('../pai/core/model.ladder.js');

function response(status,body){return new Response(JSON.stringify(body),
  {status:status,headers:{'Content-Type':'application/json'}});}

test('OpenRouter generation readback carries provider reported dollars, never an estimate',
  async function(){
    const id='gen-template-provider-fact';
    const out=await receipt.recoverOpenRouterUsage({provider:'openrouter'},
      {status_code:200,disposition:'SUCCEEDED',provider_request_id:id,
        provider_tokens:null,actual_cost_usd:null,cost_source:null},
      {headers:{Authorization:'Bearer opaque-seat-key'}},{fetchImpl:async function(url){
        assert.equal(new URL(url).searchParams.get('id'),id);
        return response(200,{data:{id:id,tokens_prompt:18025,tokens_completion:484,
          native_tokens_prompt:19565,native_tokens_completion:1514,
          native_tokens_cached:128,total_cost:0.0479964,provider_name:'xAI',
          model:'x-ai/grok-4.5-20260708'}});
      }});
    assert.equal(out.actual_cost_usd,0.0479964);
    assert.equal(out.cost_source,'provider_reported');
    assert.equal(out.provider_tokens.native_cached_tokens,128);
    assert.match(out.provider_fact_digest,/^[a-f0-9]{64}$/);
    assert.equal(out.provider_fact_digest,receipt._test.providerFactDigest({
      provider_request_id:id,provider_tokens:out.provider_tokens,
      actual_cost_usd:0.0479964,cost_source:'provider_reported',
      provider_model:'x-ai/grok-4.5-20260708',provider_name:'xAI'}));
  });

test('the canonical ladder invents no deadline when the caller supplied none',function(){
  assert.equal(ladder._test.requestSignal({},null),undefined);
  const source=fs.readFileSync(path.join(__dirname,'../pai/core/model.ladder.js'),'utf8');
  assert.doesNotMatch(source,/requestSignal\(opts,\s*opts\.timeout\s*\|\|\s*\d+/);
  assert.doesNotMatch(source,/requestSignal\(opts,\s*Math\.(?:min|max)\(opts\.timeout/);
});
