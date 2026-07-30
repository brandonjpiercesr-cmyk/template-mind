// ⬡B:test.mind_entry_cycle_auth:TEST:server_owned_exact_ham_cycle_boundary:20260730⬡
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const auth = require(path.join(root, 'pai', 'core', 'ham.session.authorization.js'));
const registerCycleRoute = require(path.join(root, 'pai', 'routes', 'cycle.routes.js'));
const TEST_HAM = 'HAM.TEST.CYCLE';
const OTHER_HAM = 'HAM.TEST.OTHER';
const SECRET = 'test-only-cycle-session-secret';

let cycleHandler;
let calls;
let oldEnv;
let consumedProofs;

test.before(function () {
  oldEnv = {
    MEMORY_BANK_KEY:process.env.MEMORY_BANK_KEY,
    AIBE_BRAIN_KEY:process.env.AIBE_BRAIN_KEY,
    FOUNDER_HAM_UID:process.env.FOUNDER_HAM_UID
  };
  process.env.MEMORY_BANK_KEY = SECRET;
  delete process.env.AIBE_BRAIN_KEY;
  process.env.FOUNDER_HAM_UID = OTHER_HAM;
  calls = [];
  consumedProofs = new Set();

  const app = { post:function (route, handler) {
    if (route === '/cycle') cycleHandler = handler;
  } };
  registerCycleRoute(app, {
    hamUid:TEST_HAM,
    bankUrl:'https://bank.invalid',
    bankKey:SECRET,
    authorization:auth,
    resolveAtmosphere:async function (input) {
      return { ham_uid:String(input.hamUid).toUpperCase(), name:'Test Person',
        world:'TEST', trust_level:7, via:'test_atmosphere' };
    },
    peopleTier:{
      resolveViewerTier:function () { return { tier:null, source:'unresolved' }; },
      bornPeopleTier:async function () { return 3; },
      effectiveTier:function (tier) {
        return Number.isInteger(tier) && tier >= 0 && tier <= 4 ? tier : 4;
      }
    },
    consumeInternalCycleProof:async function (proof) {
      const nonce = proof && proof.payload && proof.payload.nonce;
      if (!nonce) return { ok:false, status:503, reason:'internal_cycle_nonce_claim_unavailable' };
      if (consumedProofs.has(nonce)) {
        return { ok:false, status:409, reason:'internal_cycle_proof_replayed' };
      }
      consumedProofs.add(nonce);
      return { ok:true };
    },
    runPAI:async function () {
      calls.push(Array.from(arguments));
      return { ok:true, answer:'authenticated answer', tools_used:[] };
    },
    expressTurn:async function (_world, compiled) {
      return { ok:true, text:compiled.text };
    }
  });
  assert.equal(typeof cycleHandler, 'function');
});

test.after(function () {
  Object.keys(oldEnv).forEach(function (name) {
    if (oldEnv[name] === undefined) delete process.env[name];
    else process.env[name] = oldEnv[name];
  });
});

async function post(body, headers) {
  const requestHeaders = {};
  Object.keys(headers || {}).forEach(function (name) {
    requestHeaders[name.toLowerCase()] = headers[name];
  });
  const result = { status:200, body:null, headers:{} };
  const response = {
    status:function (status) { result.status = status; return response; },
    set:function (name, value) { result.headers[name.toLowerCase()] = value; return response; },
    json:function (value) { result.body = value; return value; }
  };
  await cycleHandler({ body:body, headers:requestHeaders, method:'POST', path:'/cycle' }, response);
  return result;
}

function sessionHeader(hamUid) {
  return { Authorization:'Bearer ' + auth.signHamSession(hamUid) };
}

test('mind.entry reaches only the canonical authenticated cycle route', function () {
  const entry = fs.readFileSync(path.join(root, 'mind.entry.js'), 'utf8');
  assert.match(entry, /require\('\.\/pai\/routes\/cycle\.routes\.js'\)\(app,/);
  assert.equal(entry.includes("app.post('/cycle'"), false,
    'the former caller-owned inline route must not remain reachable');
});

test('missing and invalid authentication fail before PAI', async function () {
  const before = calls.length;
  const missing = await post({ message:'hello' });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.reason, 'ham_session_required');
  assert.match(missing.headers['www-authenticate'] || '', /Bearer/);

  const invalid = await post({ message:'hello' }, { Authorization:'Bearer forged.token' });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.reason, 'ham_session_invalid');
  assert.equal(calls.length, before);
});

test('a session for another HAM cannot enter this world', async function () {
  const before = calls.length;
  const result = await post({ message:'hello' }, sessionHeader(OTHER_HAM));
  assert.equal(result.status, 403);
  assert.equal(result.body.reason, 'ham_session_forbidden');
  assert.equal(calls.length, before);
});

test('the weaker typed-world credential cannot run a paid/write cycle', async function () {
  const before = calls.length;
  const token = auth.signWorldIdSession(TEST_HAM);
  const result = await post({ message:'hello' }, { Authorization:'Bearer ' + token });
  assert.equal(result.status, 403);
  assert.equal(result.body.reason, 'sign_in_required_for_this');
  assert.equal(calls.length, before);
});

test('valid exact-HAM auth builds identity from the server', async function () {
  const result = await post({ message:'hello' }, sessionHeader(TEST_HAM));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  const call = calls.at(-1);
  assert.equal(call[0], TEST_HAM);
  assert.equal(call[1], 'hello');
  assert.equal(call[2], 'new_world');
  assert.equal(call[3].ham_uid, TEST_HAM);
  assert.equal(call[3].uid, TEST_HAM);
  assert.equal(call[3].people_tier, 3);
  assert.equal(call[3].name, 'Test Person');
  assert.equal(call[3].authenticated_cycle, true);
});

test('forged T0 and gate-bypass body fields are ignored without server proof', async function () {
  const result = await post({
    message:'ordinary browser turn',
    channel:'system',
    identity:{
      uid:TEST_HAM,
      people_tier:0,
      peopleTier:0,
      outbound_finalize:true,
      council_context:{
        mode:'internal_deliberation',
        internal_deliberation:true,
        outbound_finalize:true
      }
    }
  }, sessionHeader(TEST_HAM));
  assert.equal(result.status, 200);
  const call = calls.at(-1);
  assert.equal(call[2], 'new_world');
  assert.equal(call[3].people_tier, 3);
  assert.equal(call[3].outbound_finalize, undefined);
  assert.equal(call[3].council_context, undefined);
});

test('a body cannot select cross-HAM authority even with a valid local session', async function () {
  const before = calls.length;
  const result = await post({ message:'wrong world',
    identity:{ uid:OTHER_HAM, people_tier:0 } }, sessionHeader(TEST_HAM));
  assert.equal(result.status, 409);
  assert.equal(result.body.reason, 'cycle_identity_ham_mismatch');
  assert.equal(calls.length, before);
});

test('presented but invalid internal proof fails instead of downgrading', async function () {
  const before = calls.length;
  const headers = Object.assign({}, sessionHeader(TEST_HAM), {
    'X-ANEW-Cycle-Expires':String(Date.now() + 60000),
    'X-ANEW-Cycle-Nonce':'invalid.proof.nonce.1234',
    'X-ANEW-Cycle-Authorization':'0'.repeat(64)
  });
  const result = await post({ message:'hello' }, headers);
  assert.equal(result.status, 401);
  assert.equal(result.body.reason, 'internal_cycle_authorization_invalid_or_expired');
  assert.equal(calls.length, before);
});

test('only an exact-body server proof preserves legitimate internal context', async function () {
  const body = {
    message:'server composition turn',
    channel:'coding',
    identity:{
      uid:TEST_HAM,
      people_tier:0,
      outbound_finalize:true,
      council_context:{ mode:'coding', internal_deliberation:true }
    }
  };
  const headers = auth.internalCycleHeaders(TEST_HAM, body,
    { nonce:'test.internal.cycle.nonce.1234' });
  const result = await post(body, headers);
  assert.equal(result.status, 200);
  const call = calls.at(-1);
  assert.equal(call[2], 'coding');
  assert.equal(call[3].outbound_finalize, true);
  assert.equal(call[3].council_context.mode, 'coding');
  assert.equal(call[3].council_context.internal_deliberation, true);
  assert.equal(call[3].people_tier, 3,
    'even a server proof cannot replace server-derived privacy authority');

  const before = calls.length;
  const tampered = Object.assign({}, body, { channel:'system' });
  const denied = await post(tampered, headers);
  assert.equal(denied.status, 401);
  assert.equal(denied.body.reason, 'internal_cycle_authorization_invalid_or_expired');
  assert.equal(calls.length, before);
});

test('an exact signed internal request is durable single use', async function () {
  const body = { message:'single use machine turn', channel:'coding',
    identity:{ outbound_finalize:true, council_context:{ mode:'coding' } } };
  const headers = auth.internalCycleHeaders(TEST_HAM, body,
    { nonce:'test.internal.single.use.nonce.1234' });
  const first = await post(body, headers);
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  const beforeReplay = calls.length;
  const replay = await post(body, headers);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.reason, 'internal_cycle_proof_replayed');
  assert.equal(calls.length, beforeReplay);
});
