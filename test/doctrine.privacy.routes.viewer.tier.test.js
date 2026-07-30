// ⬡B:tests.privacy_routes_viewer_tier:TEST:the_reader_does_not_get_to_state_its_own_tier:20260727⬡
// FOUND BY CODEX on anew #1174, confirmed by hand. routes/privacy.routes.js derived the
// world-read viewer tier from b.identity / b.peopleTier, both caller-controlled. A caller
// submitted peopleTier:0 (the founder's own tier), findForWorld applied no structural filter,
// pamRelease released everything: total privilege escalation with no credential at all. The
// sibling /privacy/mark had the same shape, writing a privacy record into any HAM's world
// with an arbitrary tier on nothing but a body field.
//
// The cure: the tier comes from the VERIFIED session identity, never the body. The signed
// session is bound to the exact HAM, the tier is read off the atmosphere envelope resolved
// server-side, and an unresolvable tier lands on STRICTEST, never the most permissive.
//
// IDENTITY ENV-ONLY: every HAM is an invented test string; FOUNDER_HAM_UID is set to a test
// literal only for the duration of the founder case and restored after.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ROUTE_PATH = require.resolve(path.join(ROOT, 'pai', 'routes', 'privacy.routes.js'));
const GATE_PATH = require.resolve(path.join(ROOT, 'pai', 'core', 'atmosphere.gate.js'));
const FIND_PATH = require.resolve(path.join(ROOT, 'pai', 'core', 'find.js'));
const PAM_PATH = require.resolve(path.join(ROOT, 'pai', 'board', 'pam', 'pam.js'));
const WONDER_PATH = require.resolve(path.join(ROOT, 'pai', 'core', 'privacy.WONDER.classification.20260726.js'));
const BRAIN_CLIENT_PATH = require.resolve(path.join(ROOT, 'pai', 'core', 'brain.client.js'));
const session = require(path.join(ROOT, 'pai', 'core', 'ham.session.authorization.js'));

const READER_HAM = 'HAM.WORLDREAD.READER';
const OTHER_HAM = 'HAM.WORLDREAD.OTHER';
const FOUNDER_HAM = 'HAM.WORLDREAD.FOUNDER';
const TEST_SECRET = 'test-signing-secret-not-a-real-key';
const STRICTEST = require(path.join(ROOT, 'pai', 'core', 'privacy', 'people.tier.js')).STRICTEST;

function fakeApp() {
  const routes = {};
  return { routes: routes,
    get: function (p, h) { routes['GET ' + p] = h; },
    post: function (p, h) { routes['POST ' + p] = h; } };
}
function response() {
  return { statusCode: 200, body: null, headers: {},
    status: function (c) { this.statusCode = c; return this; },
    set: function (k, v) { this.headers[k] = v; return this; },
    json: function (b) { this.body = b; return this; } };
}
function request(headers, body) {
  const normalized = {};
  Object.keys(headers || {}).forEach(function (k) { normalized[k.toLowerCase()] = headers[k]; });
  return { headers: normalized, params: {}, query: {}, body: body || {} };
}
function bearer(ham) { return { authorization: 'Bearer ' + session.signHamSession(ham) }; }
function weakBearer(ham) { return { authorization: 'Bearer ' + session.signWorldIdSession(ham) }; }

// Records of what the read/gate/mark organs were handed, so the test can prove the tier the
// route CHOSE, and prove that an unauthenticated request never reached them at all.
let seen;
function installStubs() {
  seen = { findTier: undefined, findCalled: false, pamCalled: false,
    markCalled: false, markArg: null };
  // resolveAtmosphere: the explicit-uid behaviour. It echoes the UID and carries NO tier,
  // which is exactly why a non-founder reader must fall closed to STRICTEST.
  require.cache[GATE_PATH] = { id: GATE_PATH, filename: GATE_PATH, loaded: true,
    exports: { resolveAtmosphere: async function (ids) { return { ham_uid: ids.hamUid, people_tier: null, via: 'explicit_uid' }; } } };
  require.cache[FIND_PATH] = { id: FIND_PATH, filename: FIND_PATH, loaded: true,
    exports: { findForWorld: async function (viewerTier) {
      seen.findCalled = true; seen.findTier = viewerTier;
      return { ok: true, beads: [], count: 0, ms: 0, viewer_tier: viewerTier }; } } };
  require.cache[PAM_PATH] = { id: PAM_PATH, filename: PAM_PATH, loaded: true,
    exports: { pamRelease: async function (beads, ctx) {
      seen.pamCalled = true;
      return { ok: true, verdict: 'PAM_HOLD', released: [], withheld: 0, toned: 0,
        viewer_tier: ctx.viewerTier, gate_ms: 0 }; } } };
  require.cache[WONDER_PATH] = { id: WONDER_PATH, filename: WONDER_PATH, loaded: true,
    exports: { mark: async function (input) {
      seen.markCalled = true; seen.markArg = input;
      return { ok: true, envelope: {}, target: input.target, source: 'founder_mark' }; } } };
  delete require.cache[ROUTE_PATH];
}
function clearStubs() {
  [GATE_PATH, FIND_PATH, PAM_PATH, WONDER_PATH, ROUTE_PATH].forEach(function (p) { delete require.cache[p]; });
}

// A fake BIRTH bead reader, so the born-tier path can be proven without a live brain. Only
// stubbed when a test explicitly asks for it (birthRows !== undefined), so every other test
// keeps exercising the real core/brain.client.js (which fails closed to null with no
// AIBE_BRAIN_URL configured, exactly as the tests above already rely on).
function installBrainClientStub(birthRows) {
  require.cache[BRAIN_CLIENT_PATH] = { id: BRAIN_CLIENT_PATH, filename: BRAIN_CLIENT_PATH,
    loaded: true, exports: { readBead: async function () { return birthRows; } } };
}

function withEnv(values, fn, birthRows) {
  const prior = {};
  Object.keys(values).forEach(function (k) {
    prior[k] = process.env[k];
    if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k];
  });
  installStubs();
  if (birthRows !== undefined) installBrainClientStub(birthRows);
  return Promise.resolve().then(fn).finally(function () {
    Object.keys(prior).forEach(function (k) {
      if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k];
    });
    delete require.cache[BRAIN_CLIENT_PATH];
    clearStubs();
  });
}
const BASE_ENV = { AIBE_BRAIN_KEY: TEST_SECRET, MEMORY_BANK_KEY: undefined, FOUNDER_HAM_UID: undefined };

test('world-read: an unauthenticated caller stating peopleTier:0 is refused and never reaches the read', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request({}, { hamUid: READER_HAM, peopleTier: 0, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    // Pre-fix this answered 200 with viewer_tier 0 and released the whole world.
    assert.equal(res.statusCode, 401, 'no credential must mean no read');
    assert.equal(res.body.ok, false);
    assert.equal(seen.findCalled, false, 'the escalated read must never have run');
    assert.equal(seen.pamCalled, false);
  });
});

test('world-read: an authenticated non-founder cannot escalate via a body peopleTier:0', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, peopleTier: 0, identity: { people_tier: 0 },
        queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    // The body screamed tier 0. The verified envelope carried no tier. It must land STRICTEST.
    assert.equal(seen.findTier, STRICTEST, 'a caller-stated tier must be ignored, fail closed to STRICTEST');
    assert.equal(res.body.viewer_tier, STRICTEST);
    assert.notEqual(res.body.viewer_tier, 0, 'the body must never buy tier 0');
  });
});

test('world-read: the founder\'s own world resolves to T0 through FOUNDER_HAM_UID, not the body', async function () {
  await withEnv(Object.assign({}, BASE_ENV, { FOUNDER_HAM_UID: FOUNDER_HAM }), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(FOUNDER_HAM), { hamUid: FOUNDER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.findTier, 0, 'the founder holds everything, T0, and it comes from env not the body');
    assert.equal(res.body.tier_source, 'founder_env');
  });
});

test('world-read: a world born at a real tier reads at that tier, not STRICTEST', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.findTier, 2, 'a world genuinely born at T2 must read at T2, not fall to STRICTEST for no reason');
    assert.equal(res.body.viewer_tier, 2);
    assert.equal(res.body.tier_source, 'birth', 'the tier came from the BIRTH bead, name the source honestly');
  }, [{ content: JSON.stringify({ people_tier: 2 }) }]);
});

test('world-read: a caller-supplied tier still cannot override a real BIRTH tier', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, peopleTier: 0, identity: { people_tier: 0 },
        queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.findTier, 2, 'the body screaming tier 0 must not beat the real born tier of 2');
  }, [{ content: JSON.stringify({ people_tier: 2 }) }]);
});

test('world-read: no BIRTH bead at all still falls closed to STRICTEST, not to a guess', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.findTier, STRICTEST, 'no BIRTH bead means no proven tier, and that still means STRICTEST');
    assert.equal(res.body.tier_source, 'unresolved');
  }, []);
});

test('world-read: a malformed BIRTH tier is rejected, never coerced into a number that happens to parse', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.findTier, STRICTEST, 'a tier outside 0..4 must not be honored just because Number() parsed it');
  }, [{ content: JSON.stringify({ people_tier: 99 }) }]);
});

test('world-read: null-like BIRTH tiers never coerce into founder T0', async function () {
  for (const invalidTier of [null, false, '   ']) {
    await withEnv(BASE_ENV, async function () {
      const app = fakeApp();
      require(ROUTE_PATH)(app);
      const res = response();
      await app.routes['POST /privacy/world-read'](
        request(bearer(READER_HAM), { hamUid:READER_HAM,
          queries:[{stamp_type:'DOCTRINE'}] }), res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(seen.findTier, STRICTEST,
        'BIRTH tier ' + JSON.stringify(invalidTier) + ' must fail closed to T4');
      assert.notEqual(seen.findTier, 0);
    }, [{content:JSON.stringify({people_tier:invalidTier})}]);
  }
});

test('world-read: the founder still resolves via env, never via a BIRTH bead lookup', async function () {
  await withEnv(Object.assign({}, BASE_ENV, { FOUNDER_HAM_UID: FOUNDER_HAM }), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(FOUNDER_HAM), { hamUid: FOUNDER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.tier_source, 'founder_env', 'founder_env must win before a BIRTH lookup is ever attempted');
    assert.equal(seen.findTier, 0);
  }, [{ content: JSON.stringify({ people_tier: 4 }) }]);
});

test('world-read: a session for one HAM cannot read a different HAM\'s world', async function () {
  await withEnv(BASE_ENV, async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/world-read'](
      request(bearer(READER_HAM), { hamUid: OTHER_HAM, queries: [{ stamp_type: 'DOCTRINE' }] }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(seen.findCalled, false);
  });
});

test('mark: an unauthenticated caller cannot write a privacy mark into a world', async function () {
  await withEnv(Object.assign({}, BASE_ENV, {FOUNDER_HAM_UID:FOUNDER_HAM}), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/mark'](
      request({}, { hamUid: READER_HAM, target: 'fact.1', text: 'x', mark: 'private' }), res);
    assert.equal(res.statusCode, 401, 'marking a world private must require that world\'s session');
    assert.equal(seen.markCalled, false, 'no mark may be filed without a proof');
  });
});

test('mark: a non-founder session cannot mark any world', async function () {
  await withEnv(Object.assign({}, BASE_ENV, {FOUNDER_HAM_UID:FOUNDER_HAM}), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/mark'](
      request(bearer(READER_HAM), { hamUid: READER_HAM, target: 'fact.1', text: 'x', mark: 'private' }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(seen.markCalled, false);
  });
});

test('mark: the founder world-id weak tier cannot write even with the right identity', async function () {
  await withEnv(Object.assign({}, BASE_ENV, {FOUNDER_HAM_UID:FOUNDER_HAM}), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/mark'](
      request(weakBearer(FOUNDER_HAM), { hamUid: READER_HAM, target: 'fact.1', text: 'x', mark: 'private' }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'sign_in_required_for_this');
    assert.equal(seen.markCalled, false);
  });
});

test('mark: the exact full-sign-in founder may mark a target world, which never supplies authority', async function () {
  await withEnv(Object.assign({}, BASE_ENV, {FOUNDER_HAM_UID:FOUNDER_HAM}), async function () {
    const app = fakeApp();
    require(ROUTE_PATH)(app);
    const res = response();
    await app.routes['POST /privacy/mark'](
      request(bearer(FOUNDER_HAM), { hamUid: READER_HAM, target: 'fact.1', text: 'x', mark: 'private' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(seen.markCalled, true);
    assert.equal(seen.markArg.hamUid, READER_HAM, 'the body selects only the target world');
  });
});
