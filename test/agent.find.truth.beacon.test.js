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

test('template registry resolves one executable Agent FIND capability for every paid seat', () => {
  assert.equal(registry.validateRegistry().ok, true);
  assert.equal(registry.resolveCapability('tool.brain.find').owner_node_id,
    'station.agent_find');
  for (const id of ['station.pai','station.coda','station.advisors','station.press']) {
    assert.ok(registry.resolve(id).toolbelt.includes('tool.brain.find'));
  }
});

test('the TRUE ZERO keeps external closure injectable without an A NEW-only owner', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'agent.find.js'), 'utf8');
  assert.equal(source.includes("require('./coda/repair.delivery.proof.js')"), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'pai', 'core', 'coda',
    'repair.delivery.proof.js')), false);
  const absent = await agentFind.recordExternalClosureVerification({}, {}, {});
  assert.equal(absent.ok, false);
  assert.equal(absent.reason, 'agent_find_external_closure_delivery_proof_missing');
  const callers = [];
  function walk(dir) {
    fs.readdirSync(dir, {withFileTypes:true}).forEach(function (entry) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.js') &&
          file !== path.join(ROOT, 'pai', 'core', 'agent.find.js') &&
          file !== path.join(ROOT, 'pai', 'core', 'truth.beacon.js') &&
          fs.readFileSync(file, 'utf8').includes('recordExternalClosureVerification')) callers.push(file);
    });
  }
  walk(path.join(ROOT, 'pai'));
  assert.deepEqual(callers, []);
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
