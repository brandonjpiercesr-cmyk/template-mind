'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = require('../pai/core/ham.world.builder.contract.js');

function decision(overrides) {
  return JSON.stringify(Object.assign({
    disposition:'PROPOSE_HUMAN_DECISION',
    summary:'A bounded founder decision is ready.',
    next_action:'Surface the exact choices through the command center.',
    human_decision:{
      prompt:'Choose the approved execution scope.',
      action:'approve_scope',
      scope:'one repository change',
      evidence_refs:['brain.result.world.builder.example'],
      options:[
        {id:'APPROVE',label:'Approve this exact scope'},
        {id:'DECLINE',label:'Decline this exact scope'}
      ]
    }
  },overrides||{}));
}

test('World Builder contract preserves one exact typed human decision', function () {
  const parsed=contract.canonicalize(decision());
  assert.equal(parsed.ok,true);
  assert.equal(parsed.text,JSON.stringify(parsed.decision));
  assert.equal(parsed.decision.human_decision.options.length,2);
  assert.deepEqual(Object.keys(parsed.decision).sort(),
    ['disposition','human_decision','next_action','summary']);
});

test('World Builder contract rejects prose, extra authority, and incomplete choices', function () {
  assert.equal(contract.canonicalize('I think a human should decide.').ok,false);
  assert.equal(contract.canonicalize(decision({authority:'invented'})).ok,false);
  assert.equal(contract.canonicalize(decision({human_decision:{
    prompt:'Choose.',action:'approve_scope',scope:'one change',
    evidence_refs:['brain.result.example'],options:[{id:'ONLY',label:'Only option'}]
  }})).ok,false);
});

test('World Builder JSON schema keeps the same strict top level contract', function () {
  const schema=contract.responseFormat();
  assert.equal(schema.type,'json_schema');
  assert.equal(schema.json_schema.strict,true);
  assert.equal(schema.json_schema.schema.additionalProperties,false);
  assert.deepEqual(schema.json_schema.schema.required,
    ['disposition','human_decision','next_action','summary']);
});

test('every provider ladder call crosses the common World Builder budget fence', function () {
  const source=fs.readFileSync(path.join(__dirname,'..','pai','core','tool.loop.js'),'utf8');
  const code=source.split('\n').filter(function (line) {
    return !/^\s*\/\//.test(line);
  }).join('\n');
  const start=code.indexOf('async function _callPaiLadder(');
  const end=code.indexOf('async function callPAIPlain(',start);
  assert.ok(start > -1 && end > start);
  const door=code.slice(start,end);
  assert.match(door,/paiVoiceDeadlineExhausted/);
  assert.doesNotMatch(door,/_worldBuilderProviderFence/);
  assert.match(door,/callPaiLadderNetwork/);
  assert.doesNotMatch(door,/executeCurrentProviderRequest/);
  assert.match(door,/_worldBuilderProviderCalls >= _worldBuilderMaxProviderCalls/);
  assert.match(door,/Object\.assign\(\{seat:_providerSeat \|\| _paiSeatName\(\)\}/,
    'the common ladder door owns the exact paid seat when a caller omits it');
  assert.equal((code.match(/\.deliberate\(/g)||[]).length,1,
    'branch local ladder calls must not bypass the shared fence');
});
