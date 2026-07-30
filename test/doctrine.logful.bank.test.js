// ⬡B:tests.logful.bank:TEST:the_backbone_lands_in_the_selected_bank_not_a_hardcoded_dead_one:20260722⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// LOGFUL is the memory-of-work backbone (57 callers funnel through logfulStore). These tests
// pin the bug fix: table + schema must derive from the SAME selected-bank signal as the URL,
// so an inherited world that sets only MEMORY_BANK_URL/KEY still lands its beads, instead of
// silently POSTing them to a abacia_core.aibe_brain table that does not exist in its project.

const logful = require('../pai/logful/index.js');

const BANK_KEYS = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY', 'BEAD_TABLE', 'BRAIN_SCHEMA'];

function withEnv(env, fn, response) {
  const saved = {};
  BANK_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.keys(env).forEach((k) => { process.env[k] = env[k]; });
  const savedFetch = global.fetch;
  const captured = {};
  global.fetch = function (url, opts) {
    captured.url = url;
    captured.headers = (opts && opts.headers) || {};
    captured.body = opts && opts.body;
    // logfulStore correctly treats a non-2xx Response as a failed write. Keep
    // this test double faithful to the Fetch Response contract so these tests
    // exercise bank selection instead of accidentally simulating an HTTP error.
    return Promise.resolve(response || { ok:true, status:201,
      json: function () { return Promise.resolve([{ id: 'test-id' }]); } });
  };
  return Promise.resolve()
    .then(() => fn(captured))
    .finally(() => {
      global.fetch = savedFetch;
      BANK_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    });
}

test('MEMORY_BANK_URL set, no table/schema env -> lands in the live bank (memory_bank.beads)', async () => {
  await withEnv({ MEMORY_BANK_URL: 'https://live.example.co', MEMORY_BANK_KEY: 'k' }, async (cap) => {
    const out = await logful.logfulStore({ hamUid: 'HAMTEST01', data: 'a work happened', summary: 'x' });
    assert.equal(out.ok, true);
    assert.ok(/\/rest\/v1\/beads(\?|$)/.test(cap.url), 'must POST to the live beads table, got ' + cap.url);
    assert.equal(cap.headers['Content-Profile'], 'memory_bank', 'must target the live schema');
    const bead = JSON.parse(cap.body);
    const content = JSON.parse(bead.content);
    assert.equal(bead.acl_tier, 4, 'unresolved readers must never become founder T0');
    assert.equal(content.privacy.tier, 4);
    assert.equal(bead.spawned_by, 'logful');
  });
});

test('only the retired AIBE_BRAIN_* set -> stays in the retired bank (abacia_core.aibe_brain)', async () => {
  await withEnv({ AIBE_BRAIN_URL: 'https://dead.example.co', AIBE_BRAIN_KEY: 'k' }, async (cap) => {
    const out = await logful.logfulStore({ hamUid: 'HAMTEST01', data: 'a work happened' });
    assert.equal(out.ok, true);
    assert.ok(/\/rest\/v1\/aibe_brain(\?|$)/.test(cap.url), 'retired world keeps its table, got ' + cap.url);
    assert.equal(cap.headers['Content-Profile'], 'abacia_core');
  });
});

test('explicit BEAD_TABLE / BRAIN_SCHEMA still win over the derived default', async () => {
  await withEnv({ MEMORY_BANK_URL: 'https://live.example.co', MEMORY_BANK_KEY: 'k', BEAD_TABLE: 'ham_deleteme01', BRAIN_SCHEMA: 'ham_deleteme01' }, async (cap) => {
    const out = await logful.logfulStore({ hamUid: 'HAMTEST01', data: 'seed' });
    assert.equal(out.ok, true);
    assert.ok(/\/rest\/v1\/ham_deleteme01(\?|$)/.test(cap.url), 'explicit table must win, got ' + cap.url);
    assert.equal(cap.headers['Content-Profile'], 'ham_deleteme01', 'explicit schema must win');
  });
});

test('no bank wired at all -> honest {ok:false, reason:"no brain"}, never a silent loss', async () => {
  await withEnv({}, async () => {
    const out = await logful.logfulStore({ hamUid: 'HAMTEST01', data: 'x' });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no brain');
  });
});

test('a bank HTTP failure stays an honest failed write', async () => {
  await withEnv({ MEMORY_BANK_URL:'https://live.example.co', MEMORY_BANK_KEY:'k' },
    async () => {
      const out = await logful.logfulStore({ hamUid:'HAMTEST01', data:'x' });
      assert.deepEqual(out, { ok:false, error:'brain_write_http_503' });
    }, { ok:false, status:503,
      json:function () { return Promise.resolve({ message:'unavailable' }); } });
});
