'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const webhookGuard = require('../pai/core/webhook.guard.js');
const atmosphere = require('../pai/core/atmosphere.gate.js');
const handoffAuthorization = require('../pai/core/pai.outbound.authorization.js');
const registerVaraRoutes = require('../pai/routes/vara.llm.routes.js');

const ENV_NAMES = [
  'ELEVENLABS_INIT_WEBHOOK_TOKEN',
  'ELEVENLABS_AGENT_ID',
  'HAM_UID',
  'MEMORY_BANK_KEY',
  'AIBE_BRAIN_KEY'
];

function saveEnvironment() {
  const saved = {};
  ENV_NAMES.forEach(function (name) {
    saved[name] = Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name] : undefined;
  });
  return saved;
}

function restoreEnvironment(saved) {
  ENV_NAMES.forEach(function (name) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  });
}

function registeredPersonalizeHandler() {
  const handlers = {};
  registerVaraRoutes({
    post:function (path, handler) { handlers[path] = handler; }
  });
  assert.equal(typeof handlers['/vara/personalize'], 'function');
  return handlers['/vara/personalize'];
}

function responseRecorder() {
  return {
    statusCode:200,
    body:null,
    status:function (code) { this.statusCode = code; return this; },
    json:function (body) { this.body = body; return this; }
  };
}

async function post(handler, body, headers, query) {
  const req = {
    body:body || {},
    headers:headers || {},
    query:query || {},
    rawBody:Buffer.from(JSON.stringify(body || {}), 'utf8')
  };
  const res = responseRecorder();
  await handler(req, res);
  return res;
}

function validBody() {
  return {
    caller_id:'provider-caller-reference',
    agent_id:'agent_test_voice_1234',
    called_number:'provider-destination-reference',
    call_sid:'call.test.voice.12345678'
  };
}

test('a forged caller phone cannot mint a voice session without provider proof', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  const originalResolve = atmosphere.resolveAtmosphere;
  const originalSign = handoffAuthorization.signInitialMessage;
  let claims = 0, resolutions = 0, signatures = 0;
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_test_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    process.env.MEMORY_BANK_KEY = 'test-memory-bank-signing-key';
    webhookGuard.claimWebhook = async function () { claims += 1; return {ok:true, claimed:true}; };
    atmosphere.resolveAtmosphere = async function () {
      resolutions += 1;
      return { ham_uid:'HAM_TEST_VOICE', name:'Test', trust_level:2, world:'test' };
    };
    handoffAuthorization.signInitialMessage = function () { signatures += 1; return 'should-not-mint'; };

    const res = await post(registeredPersonalizeHandler(), validBody(), {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.reason, 'elevenlabs_init_authorization_invalid');
    assert.equal(claims, 0);
    assert.equal(resolutions, 0);
    assert.equal(signatures, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, 'voice_session_authorization'), false);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    atmosphere.resolveAtmosphere = originalResolve;
    handoffAuthorization.signInitialMessage = originalSign;
    restoreEnvironment(saved);
  }
});

test('the provider proof must arrive in a configured request header, never the URL', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  let claims = 0;
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_test_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    webhookGuard.claimWebhook = async function () { claims += 1; return {ok:true, claimed:true}; };

    const res = await post(registeredPersonalizeHandler(), validBody(), {},
      { token:'test-init-provider-secret' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.reason, 'elevenlabs_init_authorization_invalid');
    assert.equal(claims, 0);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    restoreEnvironment(saved);
  }
});

test('a valid provider initiation is claimed before identity resolution and works once', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  const originalResolve = atmosphere.resolveAtmosphere;
  const originalSign = handoffAuthorization.signInitialMessage;
  const seen = new Set();
  const events = [];
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_test_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    process.env.MEMORY_BANK_KEY = 'test-memory-bank-signing-key';
    webhookGuard.claimWebhook = async function (channel, key) {
      events.push('claim:' + channel);
      assert.equal(channel, 'elevenlabs_init');
      assert.equal(key, validBody().call_sid);
      if (seen.has(key)) return {ok:true, claimed:false, duplicate:true};
      seen.add(key);
      return {ok:true, claimed:true, source:'webhook:' + channel + ':' + key};
    };
    atmosphere.resolveAtmosphere = async function (input) {
      events.push('resolve');
      assert.deepEqual(input, {phone:validBody().caller_id});
      return { ham_uid:'HAM_TEST_VOICE', name:'Test', trust_level:2, world:'test' };
    };
    handoffAuthorization.signInitialMessage = function (input, env) {
      events.push('sign');
      return originalSign(input, env);
    };

    const handler = registeredPersonalizeHandler();
    const headers = { authorization:'Bearer test-init-provider-secret' };
    const first = await post(handler, validBody(), headers);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.type, 'conversation_initiation_client_data');
    assert.equal(first.body.dynamic_variables.ham_uid, 'HAM_TEST_VOICE');
    assert.match(first.body.dynamic_variables.voice_session_authorization, /^[a-f0-9]{64}$/);
    assert.deepEqual(events, ['claim:elevenlabs_init', 'resolve', 'sign']);

    const second = await post(handler, validBody(), headers);
    assert.equal(second.statusCode, 409);
    assert.equal(second.body.reason, 'elevenlabs_init_replayed');
    assert.deepEqual(events, ['claim:elevenlabs_init', 'resolve', 'sign',
      'claim:elevenlabs_init']);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    atmosphere.resolveAtmosphere = originalResolve;
    handoffAuthorization.signInitialMessage = originalSign;
    restoreEnvironment(saved);
  }
});

test('a provider proof for another configured agent cannot claim or resolve this world', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  const originalResolve = atmosphere.resolveAtmosphere;
  let claims = 0, resolutions = 0;
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_expected_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    webhookGuard.claimWebhook = async function () { claims += 1; return {ok:true, claimed:true}; };
    atmosphere.resolveAtmosphere = async function () { resolutions += 1; return null; };

    const res = await post(registeredPersonalizeHandler(), validBody(),
      { 'x-elevenlabs-init-token':'test-init-provider-secret' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'elevenlabs_agent_mismatch');
    assert.equal(claims, 0);
    assert.equal(resolutions, 0);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    atmosphere.resolveAtmosphere = originalResolve;
    restoreEnvironment(saved);
  }
});

test('an authenticated provider cannot use caller_id to mint for another world', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  const originalResolve = atmosphere.resolveAtmosphere;
  const originalSign = handoffAuthorization.signInitialMessage;
  let signatures = 0;
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_test_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    process.env.MEMORY_BANK_KEY = 'test-memory-bank-signing-key';
    webhookGuard.claimWebhook = async function () { return {ok:true, claimed:true}; };
    atmosphere.resolveAtmosphere = async function () {
      return { ham_uid:'HAM_ANOTHER_WORLD', name:'Other', trust_level:2, world:'other' };
    };
    handoffAuthorization.signInitialMessage = function () {
      signatures += 1;
      return 'must-not-mint';
    };

    const res = await post(registeredPersonalizeHandler(), validBody(),
      { 'x-elevenlabs-init-token':'test-init-provider-secret' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'elevenlabs_voice_world_mismatch');
    assert.equal(signatures, 0);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    atmosphere.resolveAtmosphere = originalResolve;
    handoffAuthorization.signInitialMessage = originalSign;
    restoreEnvironment(saved);
  }
});

test('an uncertain durable initiation claim fails before identity resolution', async function () {
  const saved = saveEnvironment();
  const originalClaim = webhookGuard.claimWebhook;
  const originalResolve = atmosphere.resolveAtmosphere;
  let resolutions = 0;
  try {
    process.env.ELEVENLABS_INIT_WEBHOOK_TOKEN = 'test-init-provider-secret';
    process.env.ELEVENLABS_AGENT_ID = 'agent_test_voice_1234';
    process.env.HAM_UID = 'HAM_TEST_VOICE';
    webhookGuard.claimWebhook = async function () {
      return {ok:false, reason:'webhook_claim_unavailable'};
    };
    atmosphere.resolveAtmosphere = async function () { resolutions += 1; return null; };

    const res = await post(registeredPersonalizeHandler(), validBody(),
      { 'x-elevenlabs-init-token':'test-init-provider-secret' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.reason, 'webhook_claim_unavailable');
    assert.equal(resolutions, 0);
  } finally {
    webhookGuard.claimWebhook = originalClaim;
    atmosphere.resolveAtmosphere = originalResolve;
    restoreEnvironment(saved);
  }
});
