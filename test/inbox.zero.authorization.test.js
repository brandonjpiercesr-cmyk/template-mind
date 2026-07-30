'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inboxZero = require('../pai/core/inbox.zero.js');

function harness(options) {
  const routes = {};
  const app = {
    post(path, handler) { routes['POST ' + path] = handler; },
    get(path, handler) { routes['GET ' + path] = handler; }
  };
  inboxZero.registerInboxZero(app, Object.assign({ skipMountStamps:true,
    hamUid:'HAM.TEMPLATE' }, options || {}));
  return routes;
}

function response() {
  return {
    statusCode:200,
    body:null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('direct inbox run proves an exact-HAM session before any mailbox or model work', async () => {
  let ran = 0;
  const routes = harness({
    requireExactHamSession:async (_req, res, expected) => {
      assert.equal(expected, 'HAM.TEMPLATE');
      res.status(401).json({ ok:false, reason:'ham_session_required' });
      return null;
    },
    runInboxZero:async () => { ran += 1; return { ok:true }; }
  });
  const res = response();
  await routes['POST /inbox-zero/:world/run']({ body:{}, params:{ world:'life' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(ran, 0);
});

test('caller HAM cannot redirect a valid session into another world', async () => {
  let ran = 0;
  const routes = harness({
    requireExactHamSession:async () => ({ hamUid:'HAM.TEMPLATE' }),
    runInboxZero:async () => { ran += 1; return { ok:true }; }
  });
  const res = response();
  await routes['POST /inbox-zero/:world/run']({
    body:{ hamUid:'HAM.OTHER' }, params:{ world:'life' }
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.reason, 'inbox_zero_ham_mismatch');
  assert.equal(ran, 0);
});

test('valid run receives only the server-owned HAM', async () => {
  let options = null;
  const routes = harness({
    requireExactHamSession:async () => ({ hamUid:'HAM.TEMPLATE' }),
    runInboxZero:async (value) => { options = value; return { ok:true, reviewed:0 }; }
  });
  const res = response();
  await routes['POST /inbox-zero/:world/run']({
    body:{ hamUid:'ham.template', limit:3 }, params:{ world:'life' }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(options.hamUid, 'HAM.TEMPLATE');
  assert.equal(options.world, 'life');
});

test('pending read rejects cross-HAM query before touching the brain', async () => {
  let fetched = 0;
  const routes = harness({
    requireExactHamSession:async () => ({ hamUid:'HAM.TEMPLATE' }),
    fetch:async () => { fetched += 1; return { ok:true, json:async () => [] }; }
  });
  const res = response();
  await routes['GET /inbox-zero/:world/pending']({
    query:{ hamUid:'HAM.OTHER' }, params:{ world:'life' }
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(fetched, 0);
});

test('pending read is bound to the configured world HAM', async (t) => {
  const oldUrl = process.env.MEMORY_BANK_URL;
  const oldKey = process.env.MEMORY_BANK_KEY;
  process.env.MEMORY_BANK_URL = 'https://bank.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.MEMORY_BANK_URL;
    else process.env.MEMORY_BANK_URL = oldUrl;
    if (oldKey === undefined) delete process.env.MEMORY_BANK_KEY;
    else process.env.MEMORY_BANK_KEY = oldKey;
  });
  let seenUrl = '';
  const routes = harness({
    requireExactHamSession:async () => ({ hamUid:'HAM.TEMPLATE' }),
    fetch:async (url) => { seenUrl = url; return { ok:true, json:async () => [] }; }
  });
  const res = response();
  await routes['GET /inbox-zero/:world/pending']({
    query:{}, params:{ world:'life' }
  }, res);
  assert.equal(res.body.ok, true);
  assert.match(seenUrl, /ham_uid=eq\.HAM\.TEMPLATE/);
  assert.doesNotMatch(seenUrl, /HAM\.OTHER/);
});
