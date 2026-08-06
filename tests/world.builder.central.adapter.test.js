'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const adapter=require('../pai/core/world.builder.gateway.js');
const auth=require('../pai/core/pai.outbound.authorization.js');

const ENV={ANEW_URL:'https://anew.test',MEMORY_BANK_KEY:'test-internal-key'};
const REF='vault.ham.one.0123456789abcdef01234567.aabbccddeeff';
function response(status,payload){return{ok:status>=200&&status<300,status:status,
  text:async function(){return JSON.stringify(payload);}};}

test('inherited current Knowledge uses one signed env-owned upstream and strips machine provenance',async function(){
  let request=null;
  const out=await adapter.readKnowledge({hamUid:'ham.one',requestId:'ordinary.turn.0001',
    includeHistory:true,baseUrl:'https://caller.invalid'}, {env:ENV,baseUrl:'https://caller.invalid',
    fetch:async function(url,init){request={url:url,init:init};return response(200,{ok:true,
      title:'Your knowledge',items:[{title:'Plan',status:'Current',body:'Keep Friday open.',
        claims:[{text:'Friday is open.',note:'A detail differs.',sources:[REF]}],
        provenance:[{label:'Source file 1',artifact_ref:REF}],schema:'machine'}],
      graph:{nodes:[{source:REF}]},more_available:false});}});
  assert.equal(request.url,'https://anew.test'+adapter._test.PATHS.readKnowledge);
  assert.equal(request.init.method,'POST');
  const body=JSON.parse(request.init.body);
  assert.deepEqual(body,{hamUid:'HAM.ONE',requestId:'ordinary.turn.0001',includeHistory:true});
  const headers=Object.fromEntries(Object.entries(request.init.headers).map(function(row){
    return[row[0].toLowerCase(),row[1]];
  }));
  assert.equal(auth.verifyInternalEffectRequest({body:body,headers:headers},
    adapter._test.PATHS.readKnowledge,ENV).ok,true);
  assert.equal(out.items[0].provenance[0].label,'Source file 1');
  assert.doesNotMatch(JSON.stringify(out),/vault\.|schema|graph|nodes|artifact_ref|COMPILED_FROM|receipt|provider|coder/i);
});

test('commission and job bodies carry exact lineage while cross-person refs stay behind',async function(){
  const requests=[];
  const options={env:ENV,fetch:async function(url,init){requests.push({url:url,body:JSON.parse(init.body)});
    return response(201,url.includes('commission')?{ok:true,status:'complete',disposition:'no_change',
      why:'Nothing changed.',result_source:'internal'}:{ok:true,status:'TASK',queued:true,
      source:'internal'});}};
  const base={hamUid:'HAM.ONE',requestId:'ordinary.turn.0001',cycleId:'cycle.ordinary.turn.0001',
    councilProof:{committed:true},artifactRefs:[REF,'vault.ham.two.bad']};
  const knowledge=await adapter.commissionKnowledge(Object.assign({},base,{title:'Review'}),options);
  const job=await adapter.submitJob(Object.assign({},base,{subject:'Plan',detail:'Plan it.',
    acceptance:['Usable'],level:1}),options);
  assert.equal(knowledge.disposition,'no_change');
  assert.doesNotMatch(JSON.stringify(knowledge),/result_source|internal/);
  assert.equal(job.queued,true);
  assert.deepEqual(requests[0].body.artifactRefs,[REF]);
  assert.deepEqual(requests[1].body.artifactRefs,[REF]);
});

test('missing env authority and transport timeout fail closed with consequence truth',async function(){
  let calls=0;
  const input={hamUid:'HAM.ONE',requestId:'ordinary.turn.0001',cycleId:'cycle.ordinary.turn.0001',
    councilProof:{committed:true},artifactRefs:[REF],title:'Review'};
  const noUrl=await adapter.commissionKnowledge(input,{env:{MEMORY_BANK_KEY:'key'},
    fetch:async function(){calls++;}});
  assert.equal(noUrl.reason,'world_builder_gateway_url_unconfigured');
  const noAuth=await adapter.commissionKnowledge(input,{env:{ANEW_URL:'https://anew.test'},
    fetch:async function(){calls++;}});
  assert.equal(noAuth.reason,'world_builder_gateway_authorization_unconfigured');
  const timeout=await adapter.commissionKnowledge(input,{env:ENV,fetch:async function(){
    const error=new Error('timed out');error.name='TimeoutError';throw error;}});
  assert.deepEqual(timeout,{ok:false,status:'outcome_unknown',
    reason:'world_builder_gateway_timeout',recoverable:true});
  assert.equal(calls,0);
});

test('shared tool loop loads with the adapter and has no A NEW local Knowledge imports',function(){
  const loop=require('../pai/core/tool.loop.js');
  assert.equal(typeof loop.runPAI,'function');
  const source=require('node:fs').readFileSync(require.resolve('../pai/core/tool.loop.js'),'utf8');
  assert.doesNotMatch(source,/require\('\.\/(?:knowledge\.projection|knowledge\.compiler\.handoff|cara\.artifact\.bridge|ham\.world\.builder\.intake)\.js'\)/);
  assert.match(source,/require\('\.\/world\.builder\.gateway\.js'\)/);
});

test('the existing Template CI job carries both central gateway adapter proofs',function(){
  const workflow=fs.readFileSync(require.resolve('../.github/workflows/doctrine-demo-parity.yml'),'utf8');
  assert.match(workflow,/tests\/model\.control\.central\.adapter\.test\.js/);
  assert.match(workflow,/tests\/world\.builder\.central\.adapter\.test\.js/);
});
