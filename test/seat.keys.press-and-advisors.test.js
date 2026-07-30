// ⬡B:test.seat_keys.press_and_advisors:TEST:no_station_spends_an_anonymous_shared_wallet:20260725⬡
// FOUNDER 20260725: "Why the fuck are we using a shared key. Remove it. And code everything
// (run this deep extensive audit) towards the per seat model. Bitch it helps us audit bleeds
// and switch shit easy! Per key isn't a backup it's a necessary!"
//
// This is the mind-template every world inherits, so a shared wallet here is a shared wallet
// in every world. These grade the real behavior that changed: the advisor web search now
// spends the ADVISORS seat's own key, while the unattended PRESS scan requires a named,
// provisioned seat and refuses the shared floor. Neither can be tricked into authenticating
// with a seat NAME or another provider's key. No real provider is ever touched.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dispatch = require('../pai/advisors/dispatch.js');
const press = require('../pai/stations/press.station.js');

// Env set before the await and restored only after it, so an async rung never reads a key
// that was already put back.
async function withEnvAsync(env, fn) {
  const saved = {};
  Object.keys(env).forEach(function (k) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  });
  try { return await fn(); } finally {
    Object.keys(saved).forEach(function (k) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  }
}

// Capture the Authorization header every call sends, and answer with a shape both callers
// accept, so we can prove which wallet actually went on the wire.
function captureFetch(payload) {
  const sent = [];
  const savedFetch = global.fetch;
  global.fetch = function (url, opts) {
    if (/openrouter\.ai\/api\/v1\/key(?:[/?]|$)/.test(String(url))) {
      return Promise.resolve({ ok:true, status:200,
        json:function () { return Promise.resolve({data:{usage_daily:0}}); } });
    }
    sent.push({ url: String(url), key: String(((opts && opts.headers) || {}).Authorization || '').replace(/^Bearer /, '') });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(payload); } });
  };
  return { sent: sent, restore: function () { global.fetch = savedFetch; } };
}

function receiptStoreFixture() {
  return {
    prepare:function (spec) {
      assert.equal(spec.attribution.ham_uid,'HAM.PRESS.TEST');
      assert.equal(spec.attribution.component,'press.scan');
      return {ok:true,receipt:{attempt_id:'press-scan-fixture'}};
    },
    claimIntent:async function () { return {ok:true}; },
    terminalFromResponse:async function (response) {
      return {status_code:response.status,disposition:'PROVIDER_RESPONSE'};
    },
    terminalFromError:function () {
      return {status_code:null,disposition:'NETWORK_ERROR'};
    },
    writeTerminal:async function () { return {ok:true}; }
  };
}

const CHAT_OK = { choices: [{ message: { content: 'headline one\nheadline two\nheadline three' } }] };

const CLEAR = {
  OR_KEY_ADVISORS: undefined, OR_KEY_CANON: undefined, OR_KEY_C4_WATCH: undefined,
  OR_KEY_C1_CELLM: undefined, TOGETHER_API_KEY: undefined,
  ADVISOR_SEARCH_SEAT: undefined, PRESS_SCAN_SEAT: undefined
};
function env(extra) { return Object.assign({}, CLEAR, extra); }

test('the advisor web search spends the ADVISORS seat key, so the board bleed has a name', async function () {
  const f = captureFetch(CHAT_OK);
  try {
    const out = await withEnvAsync(env({ OR_KEY_ADVISORS: 'sk-advisors-named', OPENROUTER_API_KEY: 'sk-shared' }), function () {
      return dispatch._test.realSearch('who is this org', 'a hint');
    });
    assert.equal(out.ok, true);
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0].url, /openrouter\.ai/);
    assert.equal(f.sent[0].key, 'sk-advisors-named', 'the wire carried the advisors seat key, not the shared wallet');
  } finally { f.restore(); }
});

test('an unprovisioned advisors seat refuses instead of borrowing the shared wallet', async function () {
  const f = captureFetch(CHAT_OK);
  try {
    const out = await withEnvAsync(env({ OPENROUTER_API_KEY: 'sk-shared' }), function () {
      return dispatch._test.realSearch('query');
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no_openrouter_key');
    assert.equal(f.sent.length, 0, 'the exact advisors seat must be provisioned');
  } finally { f.restore(); }
});

test('ADVISOR_SEARCH_SEAT re-seats the search with no code edit', async function () {
  const f = captureFetch(CHAT_OK);
  try {
    await withEnvAsync(env({ ADVISOR_SEARCH_SEAT: 'canon', OR_KEY_CANON: 'sk-canon-named', OR_KEY_ADVISORS: 'sk-advisors-named', OPENROUTER_API_KEY: 'sk-shared' }), function () {
      return dispatch._test.realSearch('query');
    });
    assert.equal(f.sent[0].key, 'sk-canon-named', 'one env change moved the whole bleed');
  } finally { f.restore(); }
});

test('a seat name that resolves to nothing never becomes the key', async function () {
  const key = await withEnvAsync(env({ ADVISOR_SEARCH_SEAT: 'not_a_seat', OPENROUTER_API_KEY: 'sk-shared' }), function () {
    return dispatch._test.advisorSearchKey();
  });
  assert.equal(key, '', 'a typo fails closed and borrows no wallet');
  assert.notEqual(key, 'not_a_seat', 'a seat NAME must never be sent as a credential');
});

test('with no key at all the advisor search refuses instead of dialing naked', async function () {
  const f = captureFetch(CHAT_OK);
  try {
    const out = await withEnvAsync(env({ OPENROUTER_API_KEY: undefined }), function () {
      return dispatch._test.realSearch('query');
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no_openrouter_key');
    assert.equal(f.sent.length, 0, 'zero HTTP calls with no key');
  } finally { f.restore(); }
});

test('the PRESS scan spends the seat named by PRESS_SCAN_SEAT', async function () {
  const f = captureFetch(CHAT_OK);
  const priorInstalled=global.__providerBoundaryInstalled;
  try {
    delete global.__providerBoundaryInstalled;
    delete require.cache[require.resolve('../pai/core/provider.boundary.js')];
    delete require.cache[require.resolve('../pai/core/spend.guard.js')];
    const out = await withEnvAsync(env({ PRESS_SCAN_SEAT: 'c4_watch', OR_KEY_C4_WATCH: 'sk-watch-named', OPENROUTER_API_KEY: 'sk-shared' }), function () {
      return press.scanExternal(['news'],{hamUid:'HAM.PRESS.TEST',
        cycleId:'press.scan.cycle.0001',requestId:'press.scan.request.0001',
        receiptStore:receiptStoreFixture(),env:{RENDER_SERVICE_ID:'srv-template-test'}});
    });
    assert.ok(Array.isArray(out) && out.length > 0, 'the scan still returns candidates');
    assert.equal(f.sent[0].key, 'sk-watch-named', 'a background tick bleeds onto the seat it was pointed at');
  } finally {
    f.restore();
    if(priorInstalled===undefined)delete global.__providerBoundaryInstalled;
    else global.__providerBoundaryInstalled=priorInstalled;
    delete require.cache[require.resolve('../pai/core/provider.boundary.js')];
    delete require.cache[require.resolve('../pai/core/spend.guard.js')];
  }
});

test('an unnamed PRESS seat refuses the shared wallet and makes no HTTP call', async function () {
  const f = captureFetch(CHAT_OK);
  try {
    const out = await withEnvAsync(env({ OPENROUTER_API_KEY: 'sk-shared' }), function () {
      return press.scanExternal(['news']);
    });
    assert.deepEqual(out, []);
    assert.equal(f.sent.length, 0, 'an unattended scanner never borrows the shared wallet');
  } finally { f.restore(); }
});

test('no station or advisor file outside pai/core spells the shared key out loud', function () {
  const roots = ['pai/stations', 'pai/advisors'];
  const offenders = [];
  roots.forEach(function (rel) {
    const dir = path.join(__dirname, '..', rel);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function (n) { return n.endsWith('.js'); }).forEach(function (n) {
      const src = fs.readFileSync(path.join(dir, n), 'utf8');
      const code = src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
      if (/process\.env\.OPENROUTER_API_KEY/.test(code)) offenders.push(rel + '/' + n);
    });
  });
  assert.deepEqual(offenders, [], 'every one of these call sites resolves its key through pai/core/seat.map.js');
});
