// ⬡B:test.openrouter_seat_spend:TEST:exact_seat_daily_dollars_stop_before_egress:20260725⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GUARD_PATH = require.resolve('../pai/core/openrouter.seat.spend.js');
const BOUNDARY_PATH = require.resolve('../pai/core/provider.boundary.js');
const ENV_NAMES = [
  'OR_KEY_CANON','OR_KEY_ADVISORS','OPENROUTER_API_KEY',
  'SEAT_CANON_DAILY_CAP_USD','DAILY_MODEL_CALL_CEIL'
];

function preserveEnv() {
  return Object.fromEntries(ENV_NAMES.map(function (name) {
    return [name,process.env[name]];
  }));
}

function restoreEnv(saved) {
  ENV_NAMES.forEach(function (name) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  });
}

function keyResponse(usage) {
  return new Response(JSON.stringify({data:{usage_daily:usage}}), {
    status:200,headers:{'Content-Type':'application/json'}
  });
}

test('exact named seat owns its key and shared or duplicate keys fail closed',
  {concurrency:false}, function () {
    const saved = preserveEnv();
    try {
      process.env.OR_KEY_CANON = 'canon-seat-key';
      process.env.OPENROUTER_API_KEY = 'anonymous-shared-key';
      delete process.env.OR_KEY_ADVISORS;
      const guard = require(GUARD_PATH);
      assert.equal(guard.keyOwner('canon-seat-key').seat.seat,'canon');
      assert.equal(guard.keyOwner('anonymous-shared-key').reason,
        'anonymous_shared_openrouter_key_forbidden');
      assert.equal(guard.keyOwner('unknown-key').reason,
        'openrouter_key_has_no_named_seat');

      process.env.OR_KEY_ADVISORS = 'canon-seat-key';
      const duplicate = guard.keyOwner('canon-seat-key');
      assert.equal(duplicate.ok,false);
      assert.equal(duplicate.reason,'openrouter_key_shared_across_seats');
      assert.deepEqual(duplicate.seats.sort(),['advisors','canon']);
    } finally { restoreEnv(saved); }
  });

test('provider-reported daily usage blocks the exact seat before paid egress',
  {concurrency:false}, async function () {
    const saved = preserveEnv();
    try {
      process.env.OR_KEY_CANON = 'canon-seat-key';
      process.env.SEAT_CANON_DAILY_CAP_USD = '2';
      delete process.env.OR_KEY_ADVISORS;
      delete process.env.OPENROUTER_API_KEY;
      delete require.cache[GUARD_PATH];
      const guard = require(GUARD_PATH);
      let paid = 0;
      const result = await guard.run(
        'https://openrouter.ai/api/v1/chat/completions',
        {headers:{Authorization:'Bearer canon-seat-key'}},
        async function () { return keyResponse(2.01); },
        async function () { paid += 1; return new Response('paid'); });
      assert.equal(result.blocked,true);
      assert.equal(result.reason,'openrouter_seat_daily_dollar_cap_reached');
      assert.equal(result.seat,'canon');
      assert.equal(result.usageDailyUsd,2.01);
      assert.equal(result.capUsd,2);
      assert.equal(paid,0);
    } finally {
      require(GUARD_PATH)._test.reset();
      restoreEnv(saved);
    }
  });

test('same-seat calls serialize so a concurrent retry sees the first call spend',
  {concurrency:false}, async function () {
    const saved = preserveEnv();
    try {
      process.env.OR_KEY_CANON = 'canon-seat-key';
      process.env.SEAT_CANON_DAILY_CAP_USD = '2';
      delete process.env.OR_KEY_ADVISORS;
      delete process.env.OPENROUTER_API_KEY;
      delete require.cache[GUARD_PATH];
      const guard = require(GUARD_PATH);
      let usage = 1.99;
      let executing = 0;
      let maxExecuting = 0;
      let paid = 0;
      const fetchImpl = async function () { return keyResponse(usage); };
      const execute = async function () {
        paid += 1;
        executing += 1;
        maxExecuting = Math.max(maxExecuting,executing);
        await new Promise(function (resolve) { setTimeout(resolve,20); });
        usage = 2.01;
        executing -= 1;
        return new Response('paid',{status:200});
      };
      const args = ['https://openrouter.ai/api/v1/chat/completions',
        {headers:{Authorization:'Bearer canon-seat-key'}},fetchImpl,execute];
      const results = await Promise.all([guard.run(...args),guard.run(...args)]);
      assert.equal(results[0].blocked,false);
      assert.equal(results[1].blocked,true);
      assert.equal(results[1].reason,'openrouter_seat_daily_dollar_cap_reached');
      assert.equal(paid,1);
      assert.equal(maxExecuting,1);
    } finally {
      require(GUARD_PATH)._test.reset();
      restoreEnv(saved);
    }
  });

test('invalid seat cap and unavailable provider usage cannot authorize spending',
  {concurrency:false}, async function () {
    const saved = preserveEnv();
    try {
      process.env.OR_KEY_CANON = 'canon-seat-key';
      process.env.SEAT_CANON_DAILY_CAP_USD = 'not-money';
      delete process.env.OR_KEY_ADVISORS;
      delete process.env.OPENROUTER_API_KEY;
      delete require.cache[GUARD_PATH];
      let guard = require(GUARD_PATH);
      let out = await guard.run('https://openrouter.ai/api/v1/chat/completions',
        {headers:{Authorization:'Bearer canon-seat-key'}},
        async function () { throw new Error('must_not_read'); },
        async function () { throw new Error('must_not_spend'); });
      assert.equal(out.blocked,true);
      assert.equal(out.reason,'openrouter_seat_daily_cap_invalid');

      process.env.SEAT_CANON_DAILY_CAP_USD = '2';
      out = await guard.run('https://openrouter.ai/api/v1/chat/completions',
        {headers:{Authorization:'Bearer canon-seat-key'}},
        async function () { throw new Error('network_down'); },
        async function () { throw new Error('must_not_spend'); });
      assert.equal(out.blocked,true);
      assert.equal(out.reason,'openrouter_seat_usage_unavailable');
    } finally {
      require(GUARD_PATH)._test.reset();
      restoreEnv(saved);
    }
  });

test('the installed provider boundary returns a typed seat-cap hold without chat egress',
  {concurrency:false}, async function () {
    const saved = preserveEnv();
    const previousFetch = global.fetch;
    const previousInstalled = global.__providerBoundaryInstalled;
    const priorBoundary = require.cache[BOUNDARY_PATH];
    const priorGuard = require.cache[GUARD_PATH];
    try {
      process.env.OR_KEY_CANON = 'canon-seat-key';
      process.env.SEAT_CANON_DAILY_CAP_USD = '2';
      process.env.DAILY_MODEL_CALL_CEIL = '100';
      delete process.env.OR_KEY_ADVISORS;
      delete process.env.OPENROUTER_API_KEY;
      delete global.__providerBoundaryInstalled;
      delete require.cache[BOUNDARY_PATH];
      delete require.cache[GUARD_PATH];
      let chatCalls = 0;
      global.fetch = async function (url) {
        if (String(url).endsWith('/api/v1/key')) return keyResponse(2.05);
        chatCalls += 1;
        return new Response(JSON.stringify({choices:[]}),{status:200});
      };
      require(BOUNDARY_PATH).install();
      const response = await global.fetch(
        'https://openrouter.ai/api/v1/chat/completions',{
          method:'POST',headers:{Authorization:'Bearer canon-seat-key'},body:'{}'});
      assert.equal(response.status,429);
      const body = await response.json();
      assert.equal(body.error.reason,'openrouter_seat_daily_dollar_cap_reached');
      assert.equal(body.error.seat,'canon');
      assert.equal(body.error.usage_daily_usd,2.05);
      assert.equal(body.error.daily_cap_usd,2);
      assert.equal(chatCalls,0);
    } finally {
      global.fetch = previousFetch;
      if (previousInstalled === undefined) delete global.__providerBoundaryInstalled;
      else global.__providerBoundaryInstalled = previousInstalled;
      delete require.cache[BOUNDARY_PATH];
      delete require.cache[GUARD_PATH];
      if (priorBoundary) require.cache[BOUNDARY_PATH] = priorBoundary;
      if (priorGuard) require.cache[GUARD_PATH] = priorGuard;
      restoreEnv(saved);
    }
  });
