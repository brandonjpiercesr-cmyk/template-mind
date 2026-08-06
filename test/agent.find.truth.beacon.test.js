// ⬡B:test.agent_find_truth_beacon:PROOF:template_paid_seats_wake_with_executable_find:20260801⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../pai/core/wonders/registry.js');
const agentFind = require('../pai/core/agent.find.js');

const ROOT = path.join(__dirname, '..');
const HAM = 'HAM.TEST';

function brainHarness() {
  let row = null;
  const writes = [];
  return {writes:writes,brain:{
    async findBySource(source) { return row && row.source === source ? row : null; },
    async writeBead(spec) {
      writes.push(spec);
      row = {id:91,ham_uid:spec.hamUid,agent_global:spec.agentGlobal,
        stamp_type:spec.type,source:spec.source,summary:spec.summary,
        content:Object.assign({},spec.content,{edges:spec.edges}),edges:spec.edges};
      return {ok:true,source:spec.source};
    }
  }};
}

function externalClosureCallers(root) {
  const callers=[];
  function walk(dir) {
    fs.readdirSync(dir,{withFileTypes:true}).forEach(function (entry) {
      const file=path.join(dir,entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()&&entry.name.endsWith('.js')&&
          !file.endsWith(path.join('core','agent.find.js'))&&
          !file.endsWith(path.join('core','truth.beacon.js'))&&
          /\brecordExternalClosureVerification\s*\(/.test(fs.readFileSync(file,'utf8'))) {
        callers.push(file);
      }
    });
  }
  walk(root);
  return callers;
}

test('template registry resolves one executable Agent FIND capability for every paid seat', () => {
  assert.equal(registry.validateRegistry().ok, true);
  assert.equal(registry.resolveCapability('tool.brain.find').owner_node_id,
    'station.agent_find');
  for (const id of ['station.pai','station.coda','station.advisors','station.press']) {
    assert.ok(registry.resolve(id).toolbelt.includes('tool.brain.find'));
  }
  const press=registry.resolve('station.press');
  const finder=registry.resolve('station.agent_find');
  assert.equal(press.lifecycle,'active');
  assert.equal(press.owner_wonder_id,'wonder.anu');
  assert.equal(press.reports_to,'station.pai');
  assert.ok(press.metadata.wiring.some(function (edge) {
    return edge.target==='stations/press.station.js';
  }));
  assert.deepEqual(press.metadata.agent_find.recent_truth,
    [{source_prefix:'press.',limit:12}]);
  assert.ok(finder.wakes.includes('station.press'));
  assert.ok(finder.hands_to.includes('station.press'));
  assert.ok(press.hands_to.includes('station.pai'));
});

test('the TRUE ZERO keeps external closure injectable without an A NEW-only owner', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'agent.find.js'), 'utf8');
  assert.equal(source.includes("require('./coda/repair.delivery.proof.js')"), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'pai', 'core', 'coda',
    'repair.delivery.proof.js')), false);
  const absent = await agentFind.recordExternalClosureVerification({}, {}, {});
  assert.equal(absent.ok, false);
  assert.equal(absent.reason, 'agent_find_external_closure_delivery_proof_missing');
  assert.deepEqual(externalClosureCallers(path.join(ROOT,'pai')),[]);
});

test('closure metadata is inert while a physical invocation remains detectable', (t) => {
  const fixture=fs.mkdtempSync(path.join(require('node:os').tmpdir(),
    'template-external-closure-callers-'));
  t.after(function () { fs.rmSync(fixture,{recursive:true,force:true}); });
  fs.writeFileSync(path.join(fixture,'metadata.js'),
    "module.exports={entrypoint:'recordExternalClosureVerification'};\n");
  assert.deepEqual(externalClosureCallers(fixture),[]);
  const caller=path.join(fixture,'caller.js');
  fs.writeFileSync(caller,
    "module.exports=(agentFind)=>agentFind.recordExternalClosureVerification({}, {}, {});\n");
  assert.deepEqual(externalClosureCallers(fixture),[caller]);
});

test('template bounded provider request is seat-bound before paid bytes can leave', async () => {
  const h = brainHarness();
  const result = await agentFind.bindProviderRequest({
    init:{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({
      model:'fixture/model',messages:[{role:'user',content:'governed prompt'}]})},
    attribution:{ham_uid:HAM,cycle_id:'HAM.TEST.1',request_id:'HAM.TEST.1.request',
      seat:'coda',component:'coda.mind',owner_node_id:'station.coda'}
  },{registry:registry,brain:h.brain,find:async function () {
    return {ok:true,available:true,partial:false,beads:[],count:0,ms:1,
      queries:[],failures:[]};
  },peopleTier:{resolveViewerTier:function(){return{tier:2};},
    effectiveTier:function(value){return value;}}});
  assert.equal(result.ok, true);
  assert.equal(result.bound, true);
  assert.equal(JSON.parse(result.init.body).messages[0].content,'governed prompt');
  assert.match(result.prompt_appendix,/AGENT FIND WAKE RECORD/);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].content.wall.wall_scope,'closed_world');
  assert.equal(h.writes[0].content.recent_cycle_truth.policy_excluded,true);
  assert.ok(h.writes[0].edges.some(function (edge) {
    return edge.type === 'SERVES' && edge.target === 'station.coda';
  }));
});

test('template provider request fails closed for an unregistered paid owner', async () => {
  const result = await agentFind.bindProviderRequest({
    init:{body:JSON.stringify({messages:[{role:'user',content:'must not leave'}]})},
    attribution:{ham_uid:HAM,cycle_id:'HAM.TEST.1',request_id:'HAM.TEST.1.request',
      seat:'rogue',owner_node_id:'station.rogue'}
  },{registry:registry});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agent_find_provider_binding_invalid');
});

test('template simultaneous same-HAM cycle reads never exchange raw model draft bytes',
  async () => {
    const cycleA='HAM.TEST.1.life',cycleB='HAM.TEST.1.fun';
    const sentinelA='TEMPLATE_PRIVATE_LIFE_DRAFT_a91f';
    const sentinelB='TEMPLATE_PRIVATE_FUN_DRAFT_b72e';
    function row(id,cycleId,sentinel) {
      return {id:id,ham_uid:HAM,stamp_type:'CYCLE_STEP',source:'pai.cycle.'+cycleId,
        summary:'[CYCLE '+cycleId.slice(-8)+'] model_rung_result: '+sentinel,
        content:{cycleId:cycleId,step:'model_rung_result',channel:'cara',detail:sentinel,
          atMs:id*10},created_at:'2026-08-06T10:00:0'+id+'.000Z',importance:3};
    }
    const contaminated=[row(1,cycleA,sentinelA),row(2,cycleB,sentinelB)];
    async function sameHamRead() {
      await Promise.resolve();
      return {ok:true,available:true,partial:false,beads:contaminated,
        count:contaminated.length,ms:1,failures:[]};
    }
    const results=await Promise.all([
      agentFind.readRecentCycleTruth({ham_uid:HAM,seat_node_id:'station.pai',viewer_tier:2,
        cycle_id:cycleA,request_id:cycleA+'.request'},{registry:registry,find:sameHamRead}),
      agentFind.readRecentCycleTruth({ham_uid:HAM,seat_node_id:'station.pai',viewer_tier:2,
        cycle_id:cycleB,request_id:cycleB+'.request'},{registry:registry,find:sameHamRead})
    ]);
    assert.equal(JSON.stringify(results[0]).includes(sentinelA),true);
    assert.equal(JSON.stringify(results[0]).includes(sentinelB),false);
    assert.equal(JSON.stringify(results[1]).includes(sentinelB),true);
    assert.equal(JSON.stringify(results[1]).includes(sentinelA),false);
    results.forEach(function (result) {
      assert.equal(result.ok,true);
      assert.ok(result.beads.some(function (item) {
        return item.summary==='prior cycle fact: model_rung_result' &&
          item.content.cross_cycle_fact_only===true;
      }));
    });
  });
