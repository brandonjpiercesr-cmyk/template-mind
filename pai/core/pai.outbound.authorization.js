// ⬡B:core.pai_outbound_authorization:MODULE:provider_handoff_auth:20260715⬡
// A compact provider handoff is not the council proof itself. This HMAC only
// authorizes an already-verified exact message across the ElevenLabs webhook
// boundary so a configured or caller-injected first_message cannot bypass PAI.
// The ABAHAM identity door resolves the HAM before this channel authorization
// can bind an exact committed opener to its provider handoff.
'use strict';

var crypto = require('crypto');

var VERSION = 'anew.pai.provider-handoff.v2';
var MAX_LIFETIME_MS = 30 * 60 * 1000;

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
  payload:payload
};
