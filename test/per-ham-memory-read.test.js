// ⬡B:test.per_ham_memory_read:TEST:template_pai_reads_stay_inside_one_ham_world:20260720⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const BRAIN_PATH = require.resolve('../pai/core/brain.client.js');
const FIND_PATH = require.resolve('../pai/core/find.js');
const ROADMAP_PATH = require.resolve('../pai/core/roadmap.activation.js');
const ENV_KEYS = [
  'MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'BEAD_TABLE', 'BRAIN_SCHEMA',
  'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY'
];

function response(rows) {
  return {
    ok:true, status:200, statusText:'OK',
    json:async function () { return rows; },
    text:async function () { return JSON.stringify(rows); }
  };
}

function isolate(t, modulePaths) {
  const savedEnv = {};
  ENV_KEYS.forEach(function (key) { savedEnv[key] = process.env[key]; });
  const savedFetch = global.fetch;
  const savedModules = modulePaths.map(function (modulePath) {
    return [modulePath, require.cache[modulePath]];
  });
  t.after(function () {
    global.fetch = savedFetch;
    ENV_KEYS.forEach(function (key) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    savedModules.forEach(function (saved) {
      if (saved[1]) require.cache[saved[0]] = saved[1];
      else delete require.cache[saved[0]];
    });
  });
}

test('source readback uses Memory Bank defaults and exact HAM on every retry', async function (t) {
  isolate(t, [BRAIN_PATH]);
  Object.assign(process.env, {
    MEMORY_BANK_URL:'https://template.memory.test',
    MEMORY_BANK_KEY:'template-memory-key',
    AIBE_BRAIN_URL:'https://template.legacy.test',
    AIBE_BRAIN_KEY:'template-legacy-key'
  });
  delete process.env.BEAD_TABLE;
  delete process.env.BRAIN_SCHEMA;
  const rows = [
    { id:1, source:'roadmap.shared', ham_uid:'HAM.ALPHA', stamp_type:'ROADMAP' },
    { id:2, source:'roadmap.shared', ham_uid:'HAM.BETA', stamp_type:'ROADMAP' }
  ];
  const calls = [];
  global.fetch = async function (input, init) {
    const url = new URL(String(input));
    calls.push({ url:url, init:init || {} });
    const source = String(url.searchParams.get('source') || '').replace(/^eq\./, '');
    const ham = String(url.searchParams.get('ham_uid') || '').replace(/^eq\./, '');
    return response(rows.filter(function (row) {
      return row.source === source && row.ham_uid === ham;
    }).slice(0, 1));
  };

  delete require.cache[BRAIN_PATH];
  const brain = require(BRAIN_PATH);
  const alpha = await brain.findBySource('roadmap.shared', ' ham.alpha ');
  const alphaRetry = await brain.findBySource('roadmap.shared', 'HAM.ALPHA');
  const beta = await brain.findBySource('roadmap.shared', 'ham.beta');
  assert.equal(alpha.id, 1);
  assert.equal(alphaRetry.id, 1);
  assert.equal(beta.id, 2);
  assert.deepEqual(calls.map(function (call) {
    return call.url.searchParams.get('ham_uid');
  }), ['eq.HAM.ALPHA', 'eq.HAM.ALPHA', 'eq.HAM.BETA']);
  calls.forEach(function (call) {
    assert.equal(call.url.pathname, '/rest/v1/beads');
    assert.equal(call.init.headers['Accept-Profile'], 'memory_bank');
  });
  const beforeMissing = calls.length;
  assert.equal(await brain.findBySource('roadmap.shared'), null);
  assert.equal(calls.length, beforeMissing, 'missing HAM fails before a global source read');
});

test('recent RESULT retries never mix HAM worlds and missing HAM does not fetch', async function (t) {
  isolate(t, [FIND_PATH]);
  Object.assign(process.env, {
    MEMORY_BANK_URL:'https://template.results.test',
    MEMORY_BANK_KEY:'template-results-key'
  });
  delete process.env.BEAD_TABLE;
  delete process.env.BRAIN_SCHEMA;
  const rows = [
    { id:11, ham_uid:'HAM.ALPHA', stamp_type:'RESULT', importance:9 },
    { id:12, ham_uid:'HAM.BETA', stamp_type:'RESULT', importance:9 }
  ];
  const calls = [];
  global.fetch = async function (input) {
    const url = new URL(String(input));
    calls.push(url);
    const ham = String(url.searchParams.get('ham_uid') || '').replace(/^eq\./, '');
    return response(rows.filter(function (row) { return row.ham_uid === ham; }));
  };

  delete require.cache[FIND_PATH];
  const find = require(FIND_PATH);
  assert.deepEqual(await find.findRecentResults('', 5), { beads:[], ms:0, count:0 });
  assert.equal(calls.length, 0);
  const alpha = await find.findRecentResults('ham.alpha', 5);
  const alphaRetry = await find.findRecentResults('HAM.ALPHA', 5);
  const beta = await find.findRecentResults('ham.beta', 5);
  assert.deepEqual(alpha.beads.map(function (row) { return row.id; }), [11]);
  assert.deepEqual(alphaRetry.beads.map(function (row) { return row.id; }), [11]);
  assert.deepEqual(beta.beads.map(function (row) { return row.id; }), [12]);
  assert.deepEqual(calls.map(function (url) { return url.searchParams.get('ham_uid'); }),
    ['eq.HAM.ALPHA', 'eq.HAM.ALPHA', 'eq.HAM.BETA']);
});

test('template roadmap activation binds read and task identity to the exact HAM', async function (t) {
  isolate(t, [ROADMAP_PATH]);
  delete require.cache[ROADMAP_PATH];
  const activation = require(ROADMAP_PATH);
  const reads = [];
  const queued = [];
  const deps = {
    brain:{ findBySource:async function (source, hamUid) {
      reads.push([source, hamUid]);
      return { source:source, ham_uid:hamUid, stamp_type:'ROADMAP' };
    } },
    queue:{ enqueueTask:async function (bead) {
      queued.push(bead);
      return { ok:true, id:queued.length, state:'TASK' };
    } }
  };
  const spec = {
    roadmap_source:'roadmap.shared', repository:'owner/template-mind',
    task:'Run bounded work', allowed_paths:['pai/core/find.js'],
    acceptance:['Exact HAM reads pass.']
  };
  const alpha = await activation.activate(Object.assign({ ham_uid:'ham.alpha' }, spec), deps);
  const alphaRetry = await activation.activate(Object.assign({ ham_uid:'HAM.ALPHA' }, spec), deps);
  const beta = await activation.activate(Object.assign({ ham_uid:'ham.beta' }, spec), deps);
  assert.equal(alpha.task_source, alphaRetry.task_source);
  assert.notEqual(alpha.task_source, beta.task_source);
  assert.deepEqual(reads, [
    ['roadmap.shared', 'HAM.ALPHA'],
    ['roadmap.shared', 'HAM.ALPHA'],
    ['roadmap.shared', 'HAM.BETA']
  ]);
  assert.deepEqual(queued.map(function (bead) { return bead.ham_uid; }),
    ['HAM.ALPHA', 'HAM.ALPHA', 'HAM.BETA']);
  const beforeMissing = reads.length;
  const missing = await activation.activate(spec, deps);
  assert.equal(missing.reason, 'ham_uid_required');
  assert.equal(reads.length, beforeMissing);
});
