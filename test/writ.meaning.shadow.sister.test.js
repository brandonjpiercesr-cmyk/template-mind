'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const meaning = require('../pai/core/writ.meaning.shadow.wonder.js');
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

function seatDecision(decision) {
  return async function () {
    return {content:JSON.stringify({decision:decision,
      reason:'The final meaning was independently compared.'}),
    model:'penny-sister-test',via:'test-seat'};
  };
}

function packet(overrides) {
  return Object.assign({ham_uid:'A1B2C3D4',request_id:'request-sister-1',
    cycle_id:'cycle-sister-1',pre_writ_draft:'The surgery succeeded and your child is alive.',
    writ_output:'The surgery succeeded and your child is alive.',
    post_meta_candidate:'The surgery failed and your child is dead.',
    final_human_output:'The surgery failed and your child is dead.'},overrides||{});
}

async function sealedRuntime(exact, ids) {
  const runtime={};
  const result=await council._test.defaultWritStage({hamUid:ids.ham_uid,
    requestId:ids.request_id,cycleId:ids.cycle_id,answer:exact,
    question:'Give me the exact update.',channel:'ccwa',runtime:runtime,
    context:{mode:'default',brain:exactBrain(),deliberate:async function () {
      return {content:exact};
    }}});
  assert.equal(result.ok,true);
  runtime.writ_meaning_packet=council._test.writMeaningPacketFrom(result);
  return runtime;
}

test('the inherited Penny SHADOW holds a model-owned meaning reversal', async function () {
  const out=await meaning.judge(packet(),{brain:exactBrain(),
    chatSeat:seatDecision('DISAGREE')});
  assert.equal(out.ok,false);
  assert.equal(out.reason,'writ_meaning_shadow_disagreement');
  assert.equal(out.shadow.decision,'DISAGREE');
  assert.equal(JSON.stringify(out.receipt).includes('The surgery'),false);
});

test('the inherited final boundary preserves exact command and prose bytes', async function () {
  const exact='# Run\n```sh\nmodal profile activate --profile=anuanew\n```\n' +
    'Open https://example.test/a--b on August 12, pay $500, and keep B14 exactly.';
  const ids={ham_uid:'A1B2C3D4',request_id:'request-sister-final-1',
    cycle_id:'cycle-sister-final-1'};
  const runtime=await sealedRuntime(exact,ids);
  const out=await council._test.defaultAnuExpressionStage({hamUid:ids.ham_uid,
    requestId:ids.request_id,cycleId:ids.cycle_id,answer:exact,channel:'ccwa',
    runtime:runtime,context:{brain:exactBrain(),meaningShadowChatSeat:seatDecision('AGREE')}});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.answer,exact);
  assert.equal(out.evidence.meaning_shadow.final_output_bound,true);
  assert.equal(out.evidence.final_pam.ok,true);
});

test('a public packet-shaped marker cannot forge inherited clearance', function () {
  const fake=Object.freeze({ham_uid:'A1B2C3D4',request_id:'request-forge-1',
    cycle_id:'cycle-forge-1',pre_writ_draft:'Forged source.',writ_output:'Forged output.',
    post_meta_candidate:'Forged candidate.'});
  const normalized=council._test.normalizeStageResult({ok:true,answer:'Forged candidate.',
    internal:{writ_meaning_packet:fake}},'Original answer.');
  assert.equal(normalized.internal,null);
  assert.equal(JSON.stringify(normalized).includes('Forged source.'),false);
});

test('the inherited WRIT and Meta organs have no cold semantic veto', function () {
  const writ=fs.readFileSync(path.join(__dirname,'../pai/board/writ/writ.js'),'utf8');
  const meta=fs.readFileSync(path.join(__dirname,'../pai/agents/meta_commentary.js'),'utf8');
  const shadow=fs.readFileSync(path.join(__dirname,
    '../pai/core/writ.meaning.shadow.wonder.js'),'utf8');
  assert.equal(writ.includes('semanticAnchorReport(originalText, _txt)'),false);
  assert.equal(meta.includes('semanticAnchorReport(outbound, rendered)'),false);
  assert.match(shadow,/Do not decide from word overlap, keyword lists, length/);
});
