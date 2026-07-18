// ⬡B:core.pai_outbound_authorization:MODULE:provider_handoff_auth:20260715⬡
// A compact provider handoff is not the council proof itself. This HMAC only
// authorizes an already-verified exact message across the ElevenLabs webhook
// boundary so a configured or caller-injected first_message cannot bypass PAI.
// The ABAHAM identity door resolves the HAM before this channel authorization
// can bind an exact committed opener to its provider handoff.
'use strict';

var crypto = require('crypto');

var VERSION = 'anew.pai.provider-handoff.v2';
var INTERNAL_EFFECT_VERSION = 'anew.pai.internal-effect-request.v1';
var INTERNAL_EFFECT_MAX_LIFETIME_MS = 2 * 60 * 1000;
var INTERNAL_EFFECT_CLAIM_MS = 24 * 60 * 60 * 1000;
// Twilio keeps the canonical media stream open for at most 60 minutes. Give
// the signed handoff five bounded minutes for dial/setup so authorization can
// never expire while the provider is still carrying the same verified call.
var MAX_LIFETIME_MS = 65 * 60 * 1000;

function key(env) {
  env = env || process.env;
  return env.MEMORY_BANK_KEY || env.AIBE_BRAIN_KEY || '';
}

function canonicalTarget(value) {
  try {
    return require('./pai.outbound.council.js').canonicalizeDeliveryTarget(value);
  } catch (eTarget) { return null; }
}

function normalized(input, now) {
  input = input || {};
  now = Number.isFinite(now) ? now : Date.now();
  var target = canonicalTarget(input.deliveryTarget);
  var expiresAt = Number(input.expiresAt);
  if (typeof input.hamUid !== 'string' || !input.hamUid.trim() ||
      typeof input.message !== 'string' || !input.message.length ||
      typeof input.receiptDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.receiptDigest) ||
      typeof input.requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(input.requestId) ||
      typeof input.cycleId !== 'string' || !/^[A-Za-z0-9._:-]{8,220}$/.test(input.cycleId) ||
      typeof input.sessionId !== 'string' || !/^[A-Za-z0-9._:-]{8,220}$/.test(input.sessionId) ||
      typeof input.nonce !== 'string' || !/^[A-Za-z0-9._:-]{16,220}$/.test(input.nonce) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > MAX_LIFETIME_MS ||
      !target) return null;
  return {
    version: VERSION,
    purpose: String(input.purpose || 'initial_message'),
    ham_uid: input.hamUid.trim().toUpperCase(),
    request_id: input.requestId,
    cycle_id: input.cycleId,
    session_id: input.sessionId,
    expires_at: expiresAt,
    nonce: input.nonce,
    delivery_target: target,
    message_bytes: Buffer.byteLength(input.message, 'utf8'),
    message_digest: crypto.createHash('sha256').update(Buffer.from(input.message, 'utf8')).digest('hex'),
    receipt_digest: input.receiptDigest
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (name) {
    return JSON.stringify(name) + ':' + stableStringify(value[name]);
  }).join(',') + '}';
}

function internalEffectPayload(input, now) {
  input = input || {};
  now = Number.isFinite(now) ? now : Date.now();
  var body = input.body;
  var path = String(input.path || '');
  var requestId = body && String(body.requestId || body.request_id || '').trim();
  var hamUid = body && String(body.hamUid || body.ham_uid || '').trim().toUpperCase();
  var nonce = String(input.nonce || '');
  var expiresAt = Number(input.expiresAt);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !/^\/(?:reach\/out|vara\/call|iman\/send|lina\/send|lina\/call)$/.test(path) ||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(requestId) ||
      !/^[A-Z0-9._:-]{2,160}$/.test(hamUid) ||
      !/^[A-Za-z0-9._:-]{16,220}$/.test(nonce) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= now ||
      expiresAt - now > INTERNAL_EFFECT_MAX_LIFETIME_MS) return null;
  return { version:INTERNAL_EFFECT_VERSION, purpose:'internal_effect_request',
    method:'POST', path:path, request_id:requestId, ham_uid:hamUid,
    expires_at:expiresAt, nonce:nonce,
    body_digest:crypto.createHash('sha256')
      .update(Buffer.from(stableStringify(body), 'utf8')).digest('hex') };
}

function signInternalEffectRequest(input, env) {
  var secret = key(env);
  var payloadValue = internalEffectPayload(input);
  if (!secret || !payloadValue) return null;
  return crypto.createHmac('sha256', secret)
    .update(Buffer.from(stableStringify(payloadValue), 'utf8')).digest('hex');
}

function internalEffectHeaders(path, body, env, now) {
  now = Number.isFinite(now) ? now : Date.now();
  var expiresAt = now + 60 * 1000;
  var nonce = crypto.randomUUID();
  var signature = signInternalEffectRequest({ path:path, body:body,
    expiresAt:expiresAt, nonce:nonce }, env);
  return signature ? { 'X-ANEW-Effect-Expires':String(expiresAt),
    'X-ANEW-Effect-Nonce':nonce, 'X-ANEW-Effect-Authorization':signature } : null;
}

function internalEffectInput(req, path) {
  var headers = req && req.headers || {};
  return { path:path, body:req && req.body,
    expiresAt:Number(headers['x-anew-effect-expires']),
    nonce:String(headers['x-anew-effect-nonce'] || '') };
}

function verifyInternalEffectRequest(req, path, env, now) {
  if (!key(env)) return { ok:false, reason:'internal_effect_authorization_unconfigured' };
  var input = internalEffectInput(req, path);
  var payloadValue = internalEffectPayload(input, now);
  var signature = String(req && req.headers &&
    req.headers['x-anew-effect-authorization'] || '').toLowerCase();
  var expected = payloadValue ? crypto.createHmac('sha256', key(env))
    .update(Buffer.from(stableStringify(payloadValue), 'utf8')).digest('hex') : null;
  if (!expected || !/^[a-f0-9]{64}$/.test(signature) ||
      !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
    return { ok:false, reason:'internal_effect_authorization_invalid_or_expired' };
  }
  return { ok:true, payload:payloadValue };
}

async function consumeInternalEffectRequest(req, path, env, now) {
  var verified = verifyInternalEffectRequest(req, path, env, now);
  if (!verified.ok) return verified;
  var stableEffect = { version:INTERNAL_EFFECT_VERSION, method:'POST',
    path:verified.payload.path, request_id:verified.payload.request_id,
    ham_uid:verified.payload.ham_uid, body_digest:verified.payload.body_digest };
  var digest = crypto.createHash('sha256')
    .update(Buffer.from(stableStringify(stableEffect), 'utf8')).digest('hex');
  try {
    var claimed = await require('./claim_lock.js').claimTask('internal_effect:' + digest,
      'internal_effect.' + digest + '.' + crypto.randomUUID(), INTERNAL_EFFECT_CLAIM_MS);
    return claimed ? { ok:true, consumed:true, digest:digest,
      requestId:verified.payload.request_id, hamUid:verified.payload.ham_uid }
      : { ok:false, consumed:false, reason:'internal_effect_request_replayed', digest:digest };
  } catch (eClaim) {
    return { ok:false, consumed:false, reason:'internal_effect_request_claim_uncertain',
      digest:digest };
  }
}

function payload(input, now) {
  var value = normalized(input, now);
  return value ? stableStringify(value) : null;
}

function signInitialMessage(input, env) {
  var secret = key(env);
  var serialized = payload(input);
  if (!secret || !serialized) return null;
  return crypto.createHmac('sha256', secret)
    .update(Buffer.from(serialized, 'utf8')).digest('hex');
}

function verifyInitialMessage(input, signature, env, now) {
  var secret = key(env);
  var serialized = payload(input, now);
  var expected = secret && serialized ? crypto.createHmac('sha256', secret)
    .update(Buffer.from(serialized, 'utf8')).digest('hex') : null;
  if (!expected || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

async function consumeInitialMessage(input, signature, env, now) {
  now = Number.isFinite(now) ? now : Date.now();
  if (!verifyInitialMessage(input, signature, env, now)) {
    return { ok:false, reason:'provider_handoff_invalid_or_expired' };
  }
  var serialized = payload(input, now);
  var digest = crypto.createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
  var claimant = 'pai.handoff.' + digest + '.' + crypto.randomUUID();
  var remaining = Math.max(1000, Number(input.expiresAt) - now + 1000);
  try {
    var claimed = await require('./claim_lock.js').claimTask(
      'pai_handoff:' + digest, claimant, remaining);
    return claimed ? { ok:true, consumed:true, digest:digest }
      : { ok:false, consumed:false, reason:'provider_handoff_replayed', digest:digest };
  } catch (eClaim) {
    return { ok:false, consumed:false, reason:'provider_handoff_consume_uncertain', digest:digest };
  }
}

module.exports = {
  VERSION: VERSION,
  signInitialMessage:signInitialMessage,
  verifyInitialMessage:verifyInitialMessage,
  consumeInitialMessage:consumeInitialMessage,
  payload:payload,
  INTERNAL_EFFECT_VERSION:INTERNAL_EFFECT_VERSION,
  internalEffectPayload:internalEffectPayload,
  signInternalEffectRequest:signInternalEffectRequest,
  internalEffectHeaders:internalEffectHeaders,
  verifyInternalEffectRequest:verifyInternalEffectRequest,
  consumeInternalEffectRequest:consumeInternalEffectRequest
};
