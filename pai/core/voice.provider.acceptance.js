// ⬡B:core.voice_provider_acceptance:MODULE:exact_provider_receipt_binding:20260717⬡
// Shared A'NEW/Pipecat contract for the first durable fact created after a
// telephony provider accepts a voice call.  The provider ID is inseparable from
// the exact HAM, signed voice session, council request/cycle, provider-effect
// identity, and autonomous REACH provenance (when present).
'use strict';

const crypto = require('node:crypto');

const VERSION = 'anew.reach.voice.provider-acceptance.v1';
const SOURCE_PREFIX = 'reach.voice_provider_acceptance.';

function bounded(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function shape(input) {
  input = input || {};
  const value = {
    version:VERSION,
    hamUid:bounded(input.hamUid, 160).toUpperCase(),
    sessionId:bounded(input.sessionId, 220),
    requestId:bounded(input.requestId, 180),
    cycleId:bounded(input.cycleId, 220),
    receiptDigest:bounded(input.receiptDigest, 64).toLowerCase(),
    provider:bounded(input.provider, 40).toLowerCase(),
    providerCallId:bounded(input.providerCallId, 180),
    providerEffectIdempotencyKey:bounded(input.providerEffectIdempotencyKey, 180),
    autonomousReachAttemptSource:bounded(input.autonomousReachAttemptSource, 180),
    autonomousReachAttemptDigest:bounded(input.autonomousReachAttemptDigest, 64)
      .toLowerCase()
  };
  const attemptAbsent = !value.autonomousReachAttemptSource &&
    !value.autonomousReachAttemptDigest;
  const attemptExact = value.autonomousReachAttemptSource ===
    'reach.voice_autonomous_attempt.' + value.autonomousReachAttemptDigest &&
    /^[a-f0-9]{64}$/.test(value.autonomousReachAttemptDigest);
  if (!/^[A-Z0-9._:-]{2,160}$/.test(value.hamUid) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(value.sessionId) ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(value.requestId) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(value.cycleId) ||
      !/^[a-f0-9]{64}$/.test(value.receiptDigest) ||
      (value.provider !== 'twilio' && value.provider !== 'telnyx') ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(value.providerCallId) ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(value.providerEffectIdempotencyKey) ||
      (!attemptAbsent && !attemptExact)) return null;
  const canonical = JSON.stringify([
    value.version, value.hamUid, value.sessionId, value.requestId,
    value.cycleId, value.receiptDigest, value.provider, value.providerCallId,
    value.providerEffectIdempotencyKey, value.autonomousReachAttemptSource,
    value.autonomousReachAttemptDigest
  ]);
  const digest = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return Object.assign(value, { canonical:canonical, digest:digest,
    source:SOURCE_PREFIX + digest });
}

function authorization(input, key) {
  const value = shape(input);
  const secret = typeof key === 'string' ? key : '';
  return value && secret ? crypto.createHmac('sha256', secret)
    .update(value.canonical, 'utf8').digest('hex') : '';
}

function verify(input, key, signature) {
  const expected = authorization(input, key);
  const actual = bounded(signature, 64).toLowerCase();
  return !!(expected && /^[a-f0-9]{64}$/.test(actual) &&
    crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex')));
}

module.exports = { VERSION, SOURCE_PREFIX, shape, authorization, verify };
