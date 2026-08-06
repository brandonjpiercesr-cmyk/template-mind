// ⬡B:tests.model_control_central_adapter:TEST:one_signed_central_owner:20260805⬡
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const adapter=require('../pai/core/model.control.js');
const toolLoop=require('../pai/core/tool.loop.js');

function response(status,payload){
  return {ok:status >= 200 && status < 300,status:status,
    text:async function(){return JSON.stringify(payload);}};
}

test('the inherited hand sends exact lineage to the one central owner',async function(){
  let signed=null,request=null;
  const proof={committed:true,readback_verified:true,row_count:9,
    cycle_id:'cycle.model.0001',request_id:'request.model.0001'};
  const decision={seat:'coda',proposed_model:'model.two',reasoning:'It tested better.'};
  const out=await adapter.writeReasonedIntent(decision,{
    env:{ANEW_MODEL_CONTROL_URL:'https://anew.test'},ham_uid:'ham.one',
    request_id:'request.model.0001',cycle_id:'cycle.model.0001',
    request_text:'Compare the coding seat.',council_proof:proof,
    effectAuthorization:{internalEffectHeaders:function(path,body){
      signed={path:path,body:body};return {'X-ANEW-Effect-Authorization':'signed'};
    }},
    fetch:async function(url,init){request={url:url,init:init};
      return response(201,{ok:true,proposal_id:'proposal.one'});}
  });
  assert.equal(out.ok,true);
  assert.equal(signed.path,'/model-control/internal/intents');
  assert.deepEqual(signed.body,{hamUid:'HAM.ONE',requestId:'request.model.0001',
    cycle_id:'cycle.model.0001',request_text:'Compare the coding seat.',
    council_proof:proof,decision:decision});
  assert.equal(request.url,'https://anew.test/model-control/internal/intents');
  assert.equal(request.init.method,'POST');
  assert.deepEqual(JSON.parse(request.init.body),signed.body);
});

test('missing lineage, central URL, or signed authority refuses before fetch',async function(){
  let calls=0;
  const base={ham_uid:'HAM.ONE',request_id:'request.model.0001',
    cycle_id:'cycle.model.0001',request_text:'Compare the coding seat.',
    council_proof:{committed:true},fetch:async function(){calls++;return response(201,{ok:true});}};
  const noLineage=await adapter.writeReasonedIntent({},Object.assign({},base,{request_id:''}));
  assert.equal(noLineage.reason,'model_control_central_lineage_required');
  const noAuth=await adapter.writeReasonedIntent({},Object.assign({},base,{
    env:{ANEW_MODEL_CONTROL_URL:'https://anew.test'},
    effectAuthorization:{internalEffectHeaders:function(){return null;}}}));
  assert.equal(noAuth.reason,'model_control_central_authorization_unconfigured');
  const noUrl=await adapter.writeReasonedIntent({},Object.assign({},base,{env:{},
    effectAuthorization:{internalEffectHeaders:function(){return {authorization:'signed'};}}}));
  assert.equal(noUrl.reason,'model_control_central_url_unconfigured');
  assert.equal(calls,0);
});

test('central refusal stays exact and no local business logic substitutes for it',async function(){
  const out=await adapter.writeReasonedIntent({seat:'unknown'},{
    env:{ANEW_MODEL_CONTROL_URL:'https://anew.test'},ham_uid:'HAM.ONE',
    request_id:'request.model.0001',cycle_id:'cycle.model.0001',
    request_text:'Compare the coding seat.',council_proof:{committed:true},
    effectAuthorization:{internalEffectHeaders:function(){return {authorization:'signed'};}},
    fetch:async function(){return response(400,{ok:false,
      reason:'model_control_seat_unknown'});}
  });
  assert.equal(out.ok,false);
  assert.equal(out.status,400);
  assert.equal(out.reason,'model_control_seat_unknown');
});

test("A'NU's inherited conversation hand reaches the central adapter after council",async function(){
  const definition=toolLoop._test.TOOLS.find(function(row){
    return row && row.function && row.function.name === 'propose_model_change';
  });
  assert.ok(definition);
  const args={seat:'coda',proposed_model:'model.two',
    provider_profile:'managed_openai',reasoning:'The measured result is stronger.',
    acceptance:['Preserve exact receipts']};
  const pending=[];
  const offered=Object.create(null);offered.propose_model_change=true;
  const raw=await toolLoop._test.executeTool('propose_model_change',args,'HAM.ONE',
    'Compare the coding seat.',{phase:'deliberation',pendingEffects:pending,
      effectKeys:{},offeredToolNames:Object.freeze(offered)},true);
  assert.equal(JSON.parse(raw).accepted_for_commit,true);
  assert.equal(pending.length,1);
  assert.equal(typeof adapter.writeReasonedIntent,'function');
});
