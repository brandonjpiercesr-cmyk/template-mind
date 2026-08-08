'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loop = require('../pai/core/tool.loop.js');
const council = require('../pai/core/pai.outbound.council.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function exactBrain() {
  const rows = new Map();
  return {
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

function gmguDeliberation(calls, response) {
  const callerValue=async function () { throw new Error('caller function must be replaced'); };
  const context={mode:'default',deliberate:callerValue};
  const bound=loop._test.bindGmguCouncilDeliberation('gmgu',context,
    async function(system,user,options){
      calls.push({system:system,user:user,options:clone(options||{})});
      return {content:typeof response==='function'?response(calls.length):response,
        model:'penny-test',via:'test'};
    });
  assert.equal(bound,context);
  assert.equal(Object.keys(bound).includes('deliberate'),false);
  assert.equal(JSON.stringify(bound).includes('deliberate'),false);
  return bound;
}

test('GMGU mints an invisible server council function and pins every call to Penny',async function(){
  const calls=[];
  const context=gmguDeliberation(calls,'Penny rendered this answer.');
  const out=await context.deliberate('judge','draft',{seat:'c3_mind',max_tokens:240});
  assert.equal(out.content,'Penny rendered this answer.');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.seat,'c1_cellm');
  assert.equal(calls[0].options.max_tokens,240);
  const ordinary={};
  assert.equal(loop._test.bindGmguCouncilDeliberation('cara',ordinary,
    async function(){}),ordinary);
  assert.equal(typeof ordinary.deliberate,'undefined');
});

test('GMGU SHADOW executes its model judgment on Penny without changing the verdict',async function(){
  const calls=[];
  const context=gmguDeliberation(calls,JSON.stringify({approved:true,
    reason:'The teaching answer is supported.',claim:'',decision_approved:true,
    decision_reason:'The answer directly serves the learner.',recommended_hand:'no_hand',
    escalate:false}));
  context.pending_effects=[];
  context.verified_evidence=[];
  context.tools_used=[];
  context.available_hands=[];
  const out=await council._test.defaultShadowStage({hamUid:'A1B2C3D4',
    requestId:'request-gmgu-penny-1',cycleId:'cycle-gmgu-penny-1',
    question:'What does a learning agreement protect?',
    deliberationInput:'A learning agreement protects shared expectations.',
    answer:'A learning agreement protects shared expectations.',channel:'gmgu',
    context:context},
  {boardShadow:{async shadow(){return{ok:true,verdict:'PASS',flags:[],claimsChecked:1};}},
    actionClaimHold:{enabled(){return false;},detect(){return{hold:false,claims:[]};}},
    modelLadder:{async deliberate(){throw new Error('general ladder must not run');}},
    env:{}});
  assert.equal(out.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.seat,'c1_cellm');
  assert.equal(calls[0].options.json,true);
});

test('GMGU META, WRIT, and post-Meta execute serially on the same Penny function',async function(){
  const answer='A learning agreement names how people will work and repair trust together.';
  const metaCalls=[];
  const metaContext=gmguDeliberation(metaCalls,answer);
  const meta=await council._test.defaultMetaCommentaryStage({hamUid:'A1B2C3D4',
    requestId:'request-gmgu-penny-2',cycleId:'cycle-gmgu-penny-2',
    question:'Explain our agreement.',answer:'I will now explain our agreement clearly.',
    channel:'gmgu',context:metaContext});
  assert.equal(meta.ok,true);
  assert.equal(metaCalls.length,1);
  assert.equal(metaCalls[0].options.seat,'c1_cellm');

  const writCalls=[];
  const writContext=gmguDeliberation(writCalls,answer);
  writContext.brain=exactBrain();
  const writ=await council._test.defaultWritStage({hamUid:'A1B2C3D4',
    requestId:'request-gmgu-penny-3',cycleId:'cycle-gmgu-penny-3',
    question:'Explain our agreement.',answer:answer,channel:'gmgu',runtime:{},
    context:writContext});
  assert.equal(writ.ok,true);
  assert.equal(writCalls.length,2);
  assert.deepEqual(writCalls.map(function(call){return call.options.seat;}),
    ['c1_cellm','c1_cellm']);
  assert.match(writCalls[0].system,/WRIT is the role/);
  assert.match(writCalls[1].system,/META COMMENTARY is the role/);
});

test('the production source carries the server seam into every intended council call',function(){
  const toolLoop=fs.readFileSync(path.join(__dirname,'..','pai','core','tool.loop.js'),'utf8');
  const outbound=fs.readFileSync(
    path.join(__dirname,'..','pai','core','pai.outbound.council.js'),'utf8');
  const writ=fs.readFileSync(
    path.join(__dirname,'..','pai','board','writ','writ.js'),'utf8');
  assert.match(toolLoop,/bindGmguCouncilDeliberation\(channel, _councilContext,[\s\S]{0,80}_callPaiLadder\)/);
  assert.match(toolLoop,/Object\.assign\(\{\}, options \|\| \{\}, \{seat:'c1_cellm'\}\)/);
  assert.match(outbound,/judgment = await deliberate\(system, user,/);
  assert.match(outbound,/reviewJudgment = await deliberate\(reviewSystem, reviewUser,/);
  assert.match(outbound,/hamUid: ctx\.hamUid,[\s\S]{0,100}deliberate:ctx\.context && ctx\.context\.deliberate/);
  assert.match(writ,/var _deliberate = typeof context\.deliberate === 'function'/);
  assert.match(outbound,/forceModel:true, deliberate:ctx\.context && ctx\.context\.deliberate/);
  assert.match(outbound,/var deliberate = input && input\.context &&[\s\S]{0,100}input\.context\.deliberate/);
  assert.deepEqual(council.STAGE_ORDER,
    ['PAM','SHADOW','META_COMMENTARY','QUILL','WRIT','ANU_EXPRESSION','STAMP']);
});
