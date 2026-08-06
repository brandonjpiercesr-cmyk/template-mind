'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const council=require('../pai/core/pai.outbound.council.js');
const loop=require('../pai/core/tool.loop.js')._test;

function clone(value){return JSON.parse(JSON.stringify(value));}

function harness(){
  const rows=new Map();
  let id=100;
  const stages={};
  for(const name of council.STAGE_ORDER){
    stages[name]=async function(ctx){return{ok:true,answer:ctx.answer,
      evidence:{stage:name,witnessed:true}};};
  }
  return{rows:rows,deps:{stages:stages,
    persistReceipt:async function(row){
      const stored=Object.assign({id:id++,created_at:'2026-08-06T12:00:00.000Z'},clone(row));
      rows.set(stored.source,stored);return[clone(stored)];
    },
    readReceipt:async function(query){
      const row=rows.get(query.source);return row?[clone(row)]:[];
    },
    now:function(){return new Date('2026-08-06T12:00:00.000Z');}
  }};
}

const effects=[
  {name:'submit_job',args:{subject:'Plan tonight',detail:'Keep it humane.',
    acceptance:['A short plan exists'],include_project_context:true}},
  {name:'create_reminder',args:{title:'Look at the plan',when:'2026-08-07T09:00:00-04:00'}}
];

function input(){return{hamUid:'HAM.ONE',requestId:'ordinary.turn.effects.0001',
  cycleId:'cycle.ordinary.turn.effects.0001',question:'Please carry this work forward.',
  deliberationInput:'Please carry this work forward.',
  answer:'I will carry the plan and reminder forward.',channel:'cara',
  delivery:{external:false},context:{mode:'default',pending_effects:clone(effects)}};}

test('Template inherits the exact pending-effect final receipt and STAMP binding',async function(){
  const run=harness();
  const exact=input();
  const result=await council.runOutboundCouncil(exact,run.deps);
  assert.equal(result.ok,true,result.reason);
  const binding=council.createPendingEffectsBinding(effects);
  assert.deepEqual(binding,{count:2,digest:binding.digest});
  assert.match(binding.digest,/^[a-f0-9]{64}$/);
  assert.equal(result.council_receipt.pending_effects_count,binding.count);
  assert.equal(result.council_receipt.pending_effects_digest,binding.digest);
  assert.equal(result.stamp_proof.pending_effects_count,binding.count);
  assert.equal(result.stamp_proof.pending_effects_digest,binding.digest);
  assert.equal(result.stamp_proof.commit.pending_effects_count,binding.count);
  assert.equal(result.stamp_proof.commit.pending_effects_digest,binding.digest);
  assert.deepEqual(loop.pendingEffectSetCheck(result,effects),{
    ok:true,binding:binding,proof:council.compactCouncilProof(result)
  });
});

test('Template refuses a changed project-context judgment before execution',async function(){
  const run=harness();
  const exact=input();
  const result=await council.runOutboundCouncil(exact,run.deps);
  assert.equal(result.ok,true,result.reason);
  const changed=clone(effects);
  changed[0].args.include_project_context=false;
  assert.notEqual(council.createPendingEffectsBinding(changed).digest,
    council.createPendingEffectsBinding(effects).digest);
  assert.equal(council.verifyCouncilReceipt(result.council_receipt,
    Object.assign({},exact,{pendingEffects:changed})),false);
  assert.equal(loop.pendingEffectSetCheck(result,changed).ok,false);
  const source=fs.readFileSync(require.resolve('../pai/core/tool.loop.js'),'utf8');
  assert.ok((source.match(/pendingEffectSetCheck\(_council,_effectRuntime\.pendingEffects\)/g)||[])
    .length>=3,'the inherited executor must verify before planning, effect, and commit');
});

test('Template refuses malformed pending effects before durable writes',async function(){
  const run=harness();
  const malformed=input();
  malformed.context.pending_effects=[{name:'submit_job',args:null}];
  const result=await council.runOutboundCouncil(malformed,run.deps);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'pending_effects_invalid');
  assert.equal(run.rows.size,0);
});
