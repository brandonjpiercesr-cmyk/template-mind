'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const gate = require('../pai/core/founder.mutation.claim.js');

function response() {
  return { statusCode:200, payload:null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    set() { return this; } };
}

test('founder mutation gate authenticates before acquiring one permanent durable claim', async function () {
  const order = [];
  const res = response();
  const out = await gate.requireFounderMutation({
    headers:{ 'idempotency-key':'demo.state.change.0001' }, body:{}
  }, res, 'code_submit', {
    requireFounder:async function () { order.push('founder'); return { hamUid:'ham.founder' }; },
    claimTask:async function (source, claimant, leaseMs) {
      order.push('claim');
      assert.match(source, /^founder_mutation:HAM\.FOUNDER:[a-f0-9]{64}$/);
      assert.match(claimant, /^founder\.mutation\./);
      assert.equal(leaseMs, gate.ONE_USE_LEASE_MS);
      return true;
    },
    inspectClaim:async function () { throw new Error('winner must not inspect'); }
  });
  assert.deepEqual(order, ['founder', 'claim']);
  assert.equal(out.ok, true);
  assert.equal(out.requestId, 'demo.state.change.0001');
  assert.equal(out.purpose, 'code_submit');
});

test('anonymous, malformed, duplicate and uncertain mutation claims fail closed', async function (t) {
  await t.test('anonymous caller never reaches claim registry', async function () {
    var claimed = false, res = response();
    var out = await gate.requireFounderMutation({ headers:{}, body:{} }, res, 'wash_listen', {
      requireFounder:async function (_req, reply) {
        reply.status(401).json({ ok:false, reason:'ham_session_required' }); return null;
      }, claimTask:async function () { claimed = true; return true; }
    });
    assert.equal(out, null);
    assert.equal(claimed, false);
    assert.equal(res.statusCode, 401);
  });

  await t.test('request id is required after founder authentication', async function () {
    var res = response();
    var out = await gate.requireFounderMutation({ headers:{}, body:{} }, res, 'wash_listen', {
      requireFounder:async function () { return { hamUid:'HAM.FOUNDER' }; }
    });
    assert.equal(out, null);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.reason, 'mutation_request_id_required');
  });

  await t.test('conflicting request identities are refused', async function () {
    var res = response();
    var out = await gate.requireFounderMutation({
      headers:{ 'idempotency-key':'mutation.key.0001' }, body:{ request_id:'mutation.key.0002' }
    }, res, 'wash_listen', { requireFounder:async function () { return { hamUid:'HAM.FOUNDER' }; } });
    assert.equal(out, null);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.reason, 'mutation_request_id_conflict');
  });

  await t.test('existing durable claim is a replay conflict', async function () {
    var res = response();
    var out = await gate.requireFounderMutation({
      headers:{ 'x-anu-request-id':'mutation.key.0003' }, body:{}
    }, res, 'downtime_run', {
      requireFounder:async function () { return { hamUid:'HAM.FOUNDER' }; },
      claimTask:async function () { return false; },
      inspectClaim:async function () { return { claimed_by:'first-winner' }; }
    });
    assert.equal(out, null);
    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.reason, 'founder_mutation_already_claimed');
  });

  await t.test('unreadable claim truth is unavailable, never permission', async function () {
    var res = response();
    var out = await gate.requireFounderMutation({
      headers:{ 'idempotency-key':'mutation.key.0004' }, body:{}
    }, res, 'downtime_run', {
      requireFounder:async function () { return { hamUid:'HAM.FOUNDER' }; },
      claimTask:async function () { return false; },
      inspectClaim:async function () { throw new Error('bank down'); }
    });
    assert.equal(out, null);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.reason, 'founder_mutation_claim_unavailable');
  });
});

test('one request id maps to one cross-door claim identity', function () {
  var first = gate.claimSource('HAM.FOUNDER', 'same.request.0001');
  var second = gate.claimSource('HAM.FOUNDER', 'same.request.0001');
  var other = gate.claimSource('HAM.FOUNDER', 'different.request.0001');
  assert.equal(first, second);
  assert.notEqual(first, other);
});

test('all state-changing Template doors claim before their mutation organ runs', function () {
  var entry = fs.readFileSync(path.join(ROOT, 'mind.entry.js'), 'utf8');
  [
    ['/code/submit', "requireFounderMutation(req, res, 'code_submit')", "require('./coding.js').submitForReview"],
    ['/downtime/run', "requireFounderMutation(req, res, 'downtime_run')", "require('./downtime.js').downtimeCycle"],
    ['/wash/listen', "requireFounderMutation(req, res, 'wash_listen')", "require('./wash.js').washListen"]
  ].forEach(function (door) {
    var route = entry.indexOf("app.post('" + door[0] + "'");
    var auth = entry.indexOf(door[1], route);
    var effect = entry.indexOf(door[2], route);
    assert.ok(route >= 0 && auth > route && effect > auth, door[0] + ' must claim before mutation');
  });

  var inbox = fs.readFileSync(path.join(ROOT, 'pai/core/inbox.zero.js'), 'utf8');
  var route = inbox.indexOf("app.post('/inbox-zero/:world/run'");
  var auth = inbox.indexOf("requireMutation(req, res, 'inbox_zero_run'", route);
  var effect = inbox.indexOf('await runner({', route);
  assert.ok(route >= 0 && auth > route && effect > auth,
    '/inbox-zero/:world/run must claim before mutation');
  assert.ok(inbox.indexOf("process.env.HAM_UID", route) < effect,
    'inbox mutation must use the server-owned template HAM');
});

test('inbox mutation route uses founder authority and server-owned HAM', async function () {
  var routes = {};
  var app = {
    post:function (name, handler) { routes['POST ' + name] = handler; },
    get:function (name, handler) { routes['GET ' + name] = handler; }
  };
  var inbox = require('../pai/core/inbox.zero.js');
  var oldHam = process.env.HAM_UID;
  process.env.HAM_UID = 'HAM.TEMPLATE';
  var received = null;
  inbox.registerInboxZero(app, {
    requireFounderMutation:async function () { return { ok:true, hamUid:'HAM.FOUNDER' }; },
    runInboxZero:async function (input) { received = input; return { ok:true }; }
  });
  var res = response();
  await routes['POST /inbox-zero/:world/run']({
    params:{ world:'bdif' }, headers:{}, body:{ hamUid:'HAM.TEMPLATE', intent:'review' }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok:true });
  assert.equal(received.hamUid, 'HAM.TEMPLATE');
  assert.equal(received.world, 'bdif');
  if (oldHam === undefined) delete process.env.HAM_UID; else process.env.HAM_UID = oldHam;
});
