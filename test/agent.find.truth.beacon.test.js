// ⬡B:test.agent_find_truth_beacon:PROOF:template_paid_seats_wake_with_executable_find:20260801⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../pai/core/wonders/registry.js');
const agentFind = require('../pai/core/agent.find.js');

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

test('template registry resolves one executable Agent FIND capability for every paid seat', () => {
  assert.equal(registry.validateRegistry().ok, true);
  assert.equal(registry.resolveCapability('tool.brain.find').owner_node_id,
    'station.agent_find');
  for (const id of ['station.pai','station.coda','station.advisors','station.press']) {
    assert.ok(registry.resolve(id).toolbelt.includes('tool.brain.find'));
  }
});

test('template provider request is seat-bound before paid bytes can leave', async () => {
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
  assert.match(JSON.parse(result.init.body).messages[0].content,
    /AGENT FIND WAKE RECORD/);
  assert.equal(h.writes.length, 1);
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
