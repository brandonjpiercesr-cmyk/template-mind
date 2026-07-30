// ⬡B:tests.find_in_brain_availability:TEST:a_failed_read_never_becomes_an_empty_memory:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'pai', 'core', 'tool.loop.js');
const FIND = path.join(ROOT, 'pai', 'core', 'find.js');
const FUSION = path.join(ROOT, 'pai', 'core', 'context.fusion.js');
const ENV_KEYS = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY'];

function harness(t, findImpl, fetchImpl) {
  const prior = new Map([TOOL, FIND, FUSION].map(function (file) {
    return [file, require.cache[file]];
  }));
  const oldFetch = global.fetch;
  const oldEnv = Object.fromEntries(ENV_KEYS.map(function (key) {
    return [key, process.env[key]];
  }));
  t.after(function () {
    global.fetch = oldFetch;
    ENV_KEYS.forEach(function (key) {
      if (oldEnv[key] == null) delete process.env[key];
      else process.env[key] = oldEnv[key];
    });
    [TOOL, FIND, FUSION].forEach(function (file) {
      delete require.cache[file];
      if (prior.get(file)) require.cache[file] = prior.get(file);
    });
  });
  process.env.MEMORY_BANK_URL = 'https://memory.test.invalid';
  process.env.MEMORY_BANK_KEY = 'fixture-key';
  global.fetch = fetchImpl || (async function () {
    throw new Error('unexpected direct keyword fetch');
  });
  require.cache[FIND] = {id:FIND,filename:FIND,loaded:true,exports:{
    find:findImpl,
    findIdentityEvidence:async function () {
      return {ok:true,available:true,records:[],count:0};
    }
  }};
  require.cache[FUSION] = {id:FUSION,filename:FUSION,loaded:true,exports:{
    getLatestSummary:async function () { return ''; }
  }};
  delete require.cache[TOOL];
  return require(TOOL)._test.executeTool;
}

function unavailable(reason, status) {
  return {ok:false,available:false,partial:false,reason:reason,beads:[],count:0,
    failures:[{query_index:0,reason:reason,status:status == null ? null : status}],ms:2};
}

function empty() {
  return {ok:true,available:true,partial:false,reason:null,beads:[],count:0,
    failures:[],ms:2};
}

test('an all-503 requested read returns unavailable and runs zero fallback queries', async function (t) {
  let findCalls = 0;
  let directFetches = 0;
  const execute = harness(t, async function () {
    findCalls += 1;
    return unavailable('brain_http_error', 503);
  }, async function () { directFetches += 1; throw new Error('must not fetch'); });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'PREFERENCE'}, 'HAM.ONE',
    'What team do I prefer?', {exactHamReads:true,channel:'cara'}));
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.reason, 'brain_http_error');
  assert.deepEqual(out.beads, []);
  assert.equal(out.failures[0].stage, 'requested_query');
  assert.equal(out.failures[0].status, 503);
  assert.equal(findCalls, 1, 'ALERT and Wonder fallbacks must not run after an outage');
  assert.equal(directFetches, 0, 'keyword fallback must not run after an outage');
});

test('a requested timeout stays unavailable rather than looking like a successful empty', async function (t) {
  let findCalls = 0;
  const execute = harness(t, async function () {
    findCalls += 1;
    return unavailable('brain_timeout', null);
  });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'MEMORY'}, 'HAM.ONE',
    'What did I tell you?', {exactHamReads:true,channel:'voice'}));
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.reason, 'brain_timeout');
  assert.equal(findCalls, 1);
  assert.match(out.recency_instruction, /unavailable/i);
});

test('a successful empty requested query remains explicitly available and empty', async function (t) {
  const execute = harness(t, async function () { return empty(); });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'DOCTRINE'}, 'HAM.ONE',
    'Read my doctrine.', {exactHamReads:true,channel:'advisor',outboundFinalize:true}));
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.partial, false);
  assert.deepEqual(out.failures, []);
  assert.deepEqual(out.beads, []);
});

test('partial requested evidence preserves its rows and named failure metadata', async function (t) {
  const row = {id:'one',stamp_type:'MEMORY',summary:'real memory',content:'real',
    created_at:new Date().toISOString()};
  const execute = harness(t, async function () {
    return {ok:true,available:true,partial:true,reason:null,beads:[row],count:1,
      failures:[{query_index:1,reason:'brain_http_error',status:503}],ms:2};
  });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'MEMORY'}, 'HAM.ONE',
    'What did I tell you?', {exactHamReads:true,channel:'turn'}));
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.partial, true);
  assert.equal(out.beads.length, 1);
  assert.equal(out.beads[0].summary, 'real memory');
  assert.equal(out.failures[0].stage, 'requested_query');
  assert.equal(out.failures[0].status, 503);
});

test('an unavailable ALERT fallback is named partial and blocks the keyword fallback', async function (t) {
  let findCalls = 0;
  let directFetches = 0;
  const execute = harness(t, async function () {
    findCalls += 1;
    return findCalls === 1 ? empty() : unavailable('brain_http_error', 503);
  }, async function () { directFetches += 1; throw new Error('must not fetch'); });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'PREFERENCE'}, 'HAM.ONE',
    'What orchids have I collected?', {exactHamReads:true,channel:'cara'}));
  assert.equal(out.ok, true, 'the requested exact query itself completed');
  assert.equal(out.available, true);
  assert.equal(out.partial, true, 'the additional coverage read was unavailable');
  assert.deepEqual(out.beads, []);
  assert.equal(out.failures[0].stage, 'alert_fallback');
  assert.equal(findCalls, 2);
  assert.equal(directFetches, 0);
});

test('keyword HTTP and payload failures are never swallowed into empty arrays', async function (t) {
  let findCalls = 0;
  const execute = harness(t, async function () { findCalls += 1; return empty(); },
    async function () { return {ok:false,status:503,json:async function () { return []; }}; });
  const out = JSON.parse(await execute('find_in_brain',
    {ham_uid:'HAM.ONE',stamp_type:'ALERT'}, 'HAM.ONE',
    'What orchids have I collected?', {exactHamReads:true,channel:'cara'}));
  assert.equal(out.ok, true);
  assert.equal(out.partial, true);
  assert.equal(out.failures[0].stage, 'keyword_fallback');
  assert.equal(out.failures[0].reason, 'brain_keyword_http_error');
  assert.equal(out.failures[0].status, 503);
  assert.equal(findCalls, 1);
});
