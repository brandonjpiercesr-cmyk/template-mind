// ⬡B:test.founder_bcw_door:PIN:the_seed_must_refuse_before_a_stranger_inherits_it:20260815⬡
//
// GET /founder-bcw served the assembled founder armory, real contact details and family and
// money context included, to any unauthenticated caller. Verified live on the sibling
// deployment before the fix: HTTP 200, 5868 bytes, zero credentials sent. Verified live after
// the fix and after deploy: HTTP 401, 41 bytes, {"ok":false,"reason":"ccwa_key_required"}.
//
// WHY THIS FILE EXISTS AT ALL. The gate was fixed in the sibling repo with a test, and shipped
// HERE with no test and, worse, with the first draft's already-retracted defects still in it
// for ninety minutes. The PR that fixed the sibling claimed this file was "fixed identically".
// It was not. A tenth-seat audit caught the false claim. This pin is the half that was missing:
// the sibling's own PR argues "a security gate nothing pins is a gate the next edit reopens for
// free", and then left this repo unpinned.
//
// This door is not mounted in this repo today. That is exactly why it needs a pin rather than
// why it does not: an unmounted seed defect is invisible until the day someone mounts it, and
// by then it has already shipped to every inherited world.
//
// BOTH DIRECTIONS ARE PINNED ON PURPOSE. A refusal-only suite lets someone "fix" a regression
// by turning the door into a wall, which breaks every legitimate lane and still looks green.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', 'pai', 'core', 'founder_context.js');

function fakeApp() {
  const handlers = {};
  return { get: (p, fn) => { handlers[p] = fn; }, handlers };
}

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

// Fresh mount per case, so nothing can be captured at load time.
async function callDoor(env, headers, query) {
  const saved = {};
  for (const k of ['FOUNDER_BCW_KEY', 'CCWA_KEY', 'FOUNDER_HAM_UID', 'DEFAULT_HAM_UID',
                   'MEMORY_BANK_URL', 'MEMORY_BANK_KEY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env || {});
  delete require.cache[require.resolve(MODULE)];
  const app = fakeApp();
  require(MODULE)(app);
  const res = fakeRes();
  await app.handlers['/founder-bcw']({ headers: headers || {}, query: query || {} }, res);
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return res;
}

const servedArmory = (res) => !!(res.body && res.body.fcx !== undefined);

test('an unauthenticated stranger gets nothing, which is the whole point of this file', async () => {
  const res = await callDoor({ CCWA_KEY: 'configured-key-1', FOUNDER_HAM_UID: 'HAM_TEST_1' }, {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.reason, 'ccwa_key_required');
  assert.equal(servedArmory(res), false, 'the armory must not ride in a refusal body');
});

test('an unconfigured key FAILS CLOSED and serves nothing, never falling open', async () => {
  // This is the case the board's coderKeyOk() gets wrong on purpose for a public coder wall:
  // it returns true when its env var is unset. On one real person's private context that is
  // the hole, and an inherited world is exactly where an unset var is most likely.
  const res = await callDoor({ FOUNDER_HAM_UID: 'HAM_TEST_1' }, { 'x-ccwa-key': 'anything' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.reason, 'founder_bcw_key_unconfigured');
  assert.equal(servedArmory(res), false);
});

test('a wrong key is refused, including one that differs only in length', async () => {
  for (const bad of ['wrong-key-entirely', 'c', '', 'configured-key-', 'configured-key-11']) {
    const res = await callDoor(
      { CCWA_KEY: 'configured-key-1', FOUNDER_HAM_UID: 'HAM_TEST_1' },
      { 'x-ccwa-key': bad });
    assert.equal(res.statusCode, 401, 'must refuse: ' + JSON.stringify(bad));
    assert.equal(servedArmory(res), false);
  }
});

test('the caller may not choose WHOSE armory: a supplied ham is ignored, not honored', async () => {
  // Authenticating a caller is not authorizing which person they may read. The first draft
  // passed req.query.ham straight through, so any holder of the shared coder key could name
  // another world's ham and read that founder. That is the cross-world hole this repo carried
  // after the sibling had already closed it.
  //
  // The ham reaches the brain in the Accept-Profile header as 'ham_<uid>', so the outbound
  // request is the only honest place to watch. Asserting on the response body would be a
  // blindfold: the body never echoes a ham, so such a test passes while the door is wide open.
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push(String(((opts || {}).headers || {})['Accept-Profile'] || ''));
    return { ok: true, json: async () => [] };
  };
  try {
    const res = await callDoor(
      { CCWA_KEY: 'configured-key-1', FOUNDER_HAM_UID: 'HAM_THIS_WORLD',
        MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'test-key' },
      { 'x-ccwa-key': 'configured-key-1' },
      { ham: 'HAM_SOMEBODY_ELSE' });
    assert.notEqual(res.statusCode, 401, 'an authorized lane still gets through');
    assert.ok(seen.length > 0, 'the door must actually have read the brain for this to prove anything');
    const joined = seen.join(' | ');
    assert.equal(joined.indexOf('ham_ham_somebody_else'), -1,
      'the caller-supplied ham reached the brain: ' + joined);
    assert.ok(joined.indexOf('ham_ham_this_world') !== -1,
      'the door must read THIS deploy own founder: ' + joined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('with no founder ham configured the door refuses rather than reading a blank world', async () => {
  const res = await callDoor({ CCWA_KEY: 'configured-key-1' }, { 'x-ccwa-key': 'configured-key-1' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.reason, 'founder_ham_unconfigured');
  assert.equal(servedArmory(res), false);
});

test('an authorized lane actually REACHES the armory, so the gate is a gate and not a wall', async () => {
  // The sibling repo's version of this test asserted only "not 401 and not 503", which is
  // presence and not behavior: it would pass against a door that authorized correctly and then
  // returned nothing. This one watches the brain read actually happen.
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push(String(((opts || {}).headers || {})['Accept-Profile'] || ''));
    return { ok: true, json: async () => [] };
  };
  try {
    const res = await callDoor(
      { CCWA_KEY: 'configured-key-1', FOUNDER_HAM_UID: 'HAM_TEST_1',
        MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'test-key' },
      { 'x-ccwa-key': 'configured-key-1' });
    assert.notEqual(res.statusCode, 401, 'a correct key must not be refused');
    assert.notEqual(res.statusCode, 503, 'a configured door must not report unconfigured');
    assert.ok(seen.length > 0, 'an authorized lane must actually reach the armory read');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('every answer, including the refusals, forbids caching the armory', async () => {
  const cases = [
    [{ CCWA_KEY: 'k1', FOUNDER_HAM_UID: 'H1' }, {}],
    [{ FOUNDER_HAM_UID: 'H1' }, { 'x-ccwa-key': 'k1' }],
    [{ CCWA_KEY: 'k1', FOUNDER_HAM_UID: 'H1' }, { 'x-ccwa-key': 'k1' }]
  ];
  for (const [env, headers] of cases) {
    const res = await callDoor(env, headers);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('the retracted claim survives only as a quoted retraction, never as an assertion', async () => {
  // A doctrine pin, not a behavior pin. The claim "its own sibling doors on this service
  // already refuse properly" was false, was retracted in the sibling repo, and survived here
  // for ninety minutes as a live assertion.
  //
  // MY FIRST VERSION OF THIS TEST WAS WRONG AND THE RUN CAUGHT IT. It asserted the phrase was
  // absent from the file. But the correction QUOTES the false claim in order to document what
  // was wrong, which is exactly what a supersede-never-delete record should do. A naive string
  // check cannot tell a quotation from an assertion, so it failed against a correct file.
  //
  // What actually matters is that the phrase never appears again WITHOUT its retraction beside
  // it. So this pins the pairing, not the absence.
  const fs = require('node:fs');
  const src = fs.readFileSync(MODULE, 'utf8');
  const claim = 'already refuse properly';
  const at = src.indexOf(claim);
  if (at === -1) return; // fine: the quote may be dropped once the history stops mattering
  const window = src.slice(Math.max(0, at - 1200), at + 1200);
  assert.ok(/That is FALSE|CORRECTION/.test(window),
    'the retracted claim appears without its retraction beside it, which reads as an assertion');
});
