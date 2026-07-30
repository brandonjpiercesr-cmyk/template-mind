// ⬡B:tests.tool_loop_write_to_brain_verified:TEST:one_exact_ham_writer_with_readback:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const HAM = crypto.createHash('sha256').update('write.to.brain.verified.fixture')
  .digest('hex').slice(0, 8).toUpperCase();
const toolLoop = require('../pai/core/tool.loop.js');

const ENV_KEYS = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'BEAD_TABLE', 'BRAIN_SCHEMA'];

async function withBank(fetchImpl, run) {
  const saved = {};
  for (const key of ENV_KEYS) { saved[key] = process.env[key]; delete process.env[key]; }
  process.env.MEMORY_BANK_URL = 'https://bank.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key';
  const priorFetch = global.fetch;
  global.fetch = fetchImpl;
  try { return await run(); }
  finally {
    global.fetch = priorFetch;
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

test('write_to_brain binds the active HAM, stamps T2, and proves an independent readback', async () => {
  const calls = [];
  let stored = null;
  await withBank(async function (url, opts) {
    calls.push({ url:String(url), opts:opts || {} });
    if (opts && opts.method === 'POST') {
      stored = JSON.parse(opts.body);
      return { ok:true, status:201, json:async () => [Object.assign({ id:'bead-1' }, stored)] };
    }
    return { ok:true, status:200, json:async () => [Object.assign({ id:'bead-1' }, stored)] };
  }, async function () {
    const raw = await toolLoop._test.executeTool('write_to_brain', {
      ham_uid:HAM, stamp_type:'LENS', summary:'A learned posture',
      content:JSON.stringify({ posture:'read the real evidence first' }), importance:8
    }, HAM, '', { phase:'commit', viewerTier:2, cycleId:'cycle-1', requestId:'request-1' });
    const out = JSON.parse(raw);
    assert.equal(out.ok, true);
    assert.equal(out.readback_verified, true);
    assert.equal(out.acl_tier, 2);
    assert.equal(calls.filter((call) => call.opts.method === 'POST').length, 1);
    assert.equal(calls.filter((call) => !call.opts.method).length, 1);
    assert.equal(stored.ham_uid, HAM);
    assert.equal(stored.acl_tier, 2);
    assert.equal(JSON.parse(stored.content).privacy.tier, 2);
    assert.ok(stored.edges.some((edge) => edge.target === 'pai.cycle.cycle-1'));
    assert.ok(stored.edges.some((edge) => edge.target === 'pai.request.request-1'));
  });
});

test('write_to_brain cannot redirect a committed effect into another HAM', async () => {
  let touched = false;
  await withBank(async function () { touched = true; throw new Error('must not fetch'); }, async function () {
    const out = JSON.parse(await toolLoop._test.executeTool('write_to_brain', {
      ham_uid:'OTHERHAM', stamp_type:'MEMORY', summary:'wrong room', content:'x'
    }, HAM, '', { phase:'commit', viewerTier:2 }));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'ham_uid_mismatch');
    assert.equal(touched, false);
  });
});

test('a POST representation without the exact durable GET remains a failed write', async () => {
  let stored = null;
  await withBank(async function (_url, opts) {
    if (opts && opts.method === 'POST') {
      stored = JSON.parse(opts.body);
      return { ok:true, status:201, json:async () => [Object.assign({ id:'bead-2' }, stored)] };
    }
    return { ok:true, status:200, json:async () => [] };
  }, async function () {
    const out = JSON.parse(await toolLoop._test.executeTool('write_to_brain', {
      ham_uid:HAM, stamp_type:'MEMORY', summary:'must read back', content:'exact fact'
    }, HAM, '', { phase:'commit', viewerTier:3, cycleId:'cycle-2' }));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'brain_write_unverified');
    assert.equal(out.detail, 'memory_readback_unverified');
  });
});
