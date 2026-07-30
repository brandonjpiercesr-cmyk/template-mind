// ⬡B:tests.privacy_canonical_storage:TEST:the_structural_people_ladder_closes_end_to_end:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TIERS_PATH = path.join(ROOT, 'pai', 'core', 'privacy', 'people.tier.js');
const BRAIN_PATH = path.join(ROOT, 'pai', 'core', 'brain.client.js');
const MIGRATION = path.join(ROOT, 'migrations', '0004_acl_tier_structural_people_ladder.sql');
const HAM = 'HAM.PRIVACY.CANONICAL.TEST';

function restoreEnv(t, keys) {
  const prior = {};
  keys.forEach(function (key) { prior[key] = process.env[key]; });
  t.after(function () {
    keys.forEach(function (key) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    });
  });
}

test('null-like tiers are never founder T0 and migration 0004 targets only canonical Memory Bank', function () {
  const tiers = require(TIERS_PATH);
  [null, undefined, false, true, '', '   '].forEach(function (value) {
    assert.equal(tiers.parseTier(value), null, JSON.stringify(value) + ' became a tier');
  });
  assert.equal(tiers.envelopeOf({acl_tier:null,content:{}}), null);
  assert.equal(tiers.buildEnvelope('sanctioned', null, '', 'test').tier, 1);

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /memory_bank\.beads add column if not exists acl_tier smallint/);
  assert.doesNotMatch(sql, /abacia_core\.aibe_brain add column if not exists acl_tier smallint/);
  assert.match(sql, /drop function if exists public\.acl_tier_from_content\(text\)/);
  assert.doesNotMatch(sql, /update\s+memory_bank\.beads/i);
  assert.doesNotMatch(sql, /where\s+acl_tier\s+is\s+null/i);
});

test('the canonical brain writer maps only a real privacy tier into acl_tier', async function (t) {
  restoreEnv(t, ['MEMORY_BANK_URL','MEMORY_BANK_KEY','BEAD_TABLE','BRAIN_SCHEMA']);
  process.env.MEMORY_BANK_URL = 'https://memory.test.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key-not-a-real-secret';
  delete process.env.BEAD_TABLE;
  delete process.env.BRAIN_SCHEMA;
  const oldFetch = global.fetch;
  t.after(function () { global.fetch = oldFetch; delete require.cache[BRAIN_PATH]; });
  const posted = [];
  global.fetch = async function (url, init) {
    posted.push(JSON.parse(init.body));
    return {ok:true,status:201,text:async function () { return ''; }};
  };
  delete require.cache[BRAIN_PATH];
  const brain = require(BRAIN_PATH);
  for (const tier of [2, null, false, '   ']) {
    await brain.writeBead({hamUid:HAM,agentGlobal:'PRIVACY_TEST',type:'DOCTRINE',
      source:'privacy.canonical.' + posted.length,summary:'privacy write',
      content:{text:'x',privacy:{mark:'sanctioned',tier:tier}},
      edges:[{type:'PROVES',target:'privacy.canonical.storage'}]});
  }
  assert.equal(posted[0].acl_tier, 2);
  posted.slice(1).forEach(function (row) {
    assert.equal(row.acl_tier, undefined, 'invalid tier crossed the canonical write boundary');
  });
});

test('read authority ignores raw identity privilege, uses BIRTH, and fails closed to T4', async function (t) {
  restoreEnv(t, ['FOUNDER_HAM_UID']);
  delete process.env.FOUNDER_HAM_UID;
  const priorBrain = require.cache[BRAIN_PATH];
  let rows = [{content:JSON.stringify({people_tier:2})}];
  let reads = 0;
  require.cache[BRAIN_PATH] = {id:BRAIN_PATH,filename:BRAIN_PATH,loaded:true,exports:{
    readBead:async function () { reads += 1; return rows; }
  }};
  t.after(function () {
    delete require.cache[BRAIN_PATH];
    if (priorBrain) require.cache[BRAIN_PATH] = priorBrain;
  });
  const tiers = require(TIERS_PATH);
  assert.deepEqual(tiers.resolveViewerTier({ham_uid:HAM,people_tier:0}, HAM),
    {tier:null,source:'unresolved'}, 'raw identity must not be a read authority API');
  let authority = await tiers.resolveReadTier(
    {ham_uid:HAM,people_tier:0}, HAM);
  assert.equal(authority.tier, 2, 'raw identity T0 must not outrank the durable BIRTH tier');
  assert.equal(authority.source, 'birth');
  assert.equal(tiers.isReadAuthority(authority, HAM), true);

  rows = [{content:JSON.stringify({people_tier:null})}];
  authority = await tiers.resolveReadTier({ham_uid:HAM,people_tier:0}, HAM);
  assert.equal(authority.tier, 4);
  assert.equal(authority.source, 'unresolved');

  const readsBeforeFounder = reads;
  process.env.FOUNDER_HAM_UID = HAM;
  authority = await tiers.resolveReadTier({ham_uid:HAM,people_tier:4}, HAM);
  assert.equal(authority.tier, 0);
  assert.equal(authority.source, 'founder_env');
  assert.equal(reads, readsBeforeFounder, 'founder env resolves before any BIRTH read');
});
