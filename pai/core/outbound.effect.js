// ⬡B:core.outbound_effect:MODULE:durable_at_most_once_provider_claim:20260715⬡
// The ABAHAM door and PAI council establish who may act and which exact bytes
// may leave. This module is the final transactional leg: one deterministic key
// binds that committed artifact to its canonical target and council lineage,
// then the shared Postgres claim registry selects exactly one provider attempt.
'use strict';

var crypto = require('node:crypto');
var council = require('./pai.outbound.council.js');
var claimLock = require('./claim_lock.js');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
}

function canonicalEffect(input) {
  input = input || {};
  var target = council.canonicalizeDeliveryTarget(input.deliveryTarget);
  var artifact = input.artifact;
  if (!target || typeof artifact !== 'string' || !artifact.length ||
      typeof input.hamUid !== 'string' || !input.hamUid.trim() ||
      typeof input.requestId !== 'string' || !input.requestId.trim() ||
      typeof input.cycleId !== 'string' || !input.cycleId.trim() ||
      typeof input.channel !== 'string' || !input.channel.trim()) return null;
  return {
    version: 'anew.outbound.effect.v1',
    ham_uid: input.hamUid.trim().toUpperCase(),
    channel: input.channel.trim().toLowerCase(),
    request_id: input.requestId.trim(),
    cycle_id: input.cycleId.trim(),
    // The signed voice session is a transport lease minted afresh for every
    // handoff. It must not change the identity of the logical dial, otherwise
    // replaying one committed request with a new lease can call the person
    // again. Request, cycle, HAM, target, channel, and exact artifact remain
    // the durable effect identity. Non-VARA callers keep legacy behavior.
    session_id: input.channel.trim().toLowerCase() === 'vara_call' ? '' :
      (typeof input.sessionId === 'string' ? input.sessionId.trim() : ''),
    delivery_target: target,
    artifact_bytes: Buffer.byteLength(artifact, 'utf8'),
    artifact_digest: crypto.createHash('sha256').update(Buffer.from(artifact, 'utf8')).digest('hex')
  };
}

function effectKey(input) {
  var canonical = canonicalEffect(input);
  if (!canonical) return null;
  return crypto.createHash('sha256')
    .update(Buffer.from(stableStringify(canonical), 'utf8')).digest('hex');
}

async function claimProviderAttempt(input, options) {
  var key = effectKey(input);
  if (!key) return { ok:false, claimed:false, reason:'provider_effect_binding_invalid' };
  var leaseMs = options && Number(options.leaseMs) > 0
    ? Number(options.leaseMs) : 100 * 365 * 24 * 60 * 60 * 1000;
  var claimant = 'outbound.' + key + '.' + crypto.randomUUID();
  var claimed;
  try {
    claimed = await claimLock.claimTask('outbound_effect:' + key, claimant, leaseMs);
  } catch (eClaim) {
    return { ok:false, claimed:false, reason:'provider_effect_claim_uncertain', effectKey:key };
  }
  return claimed
    ? { ok:true, claimed:true, effectKey:key, idempotencyKey:'anew-' + key }
    : { ok:false, claimed:false, reason:'provider_effect_already_claimed', effectKey:key };
}

module.exports = {
  stableStringify: stableStringify,
  canonicalEffect: canonicalEffect,
  effectKey: effectKey,
  claimProviderAttempt: claimProviderAttempt
};
