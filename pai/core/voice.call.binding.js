// ⬡B:core.voice_call_binding:MODULE:canonical_signed_call_context:20260717⬡
'use strict';

var crypto = require('node:crypto');

var SCHEMA = 'anew.reach.voice.call-binding.v2';

function exactAttemptPair(source, digest) {
  source = typeof source === 'string' ? source : '';
  digest = typeof digest === 'string' ? digest : '';
  if (!source && !digest) return true;
  return /^[a-f0-9]{64}$/.test(digest) &&
    source === 'reach.voice_autonomous_attempt.' + digest;
}

function digest(binding) {
  binding = binding || {};
  var attemptSource = typeof binding.autonomousReachAttemptSource === 'string'
    ? binding.autonomousReachAttemptSource : '';
  var attemptDigest = typeof binding.autonomousReachAttemptDigest === 'string'
    ? binding.autonomousReachAttemptDigest : '';
  if (!exactAttemptPair(attemptSource, attemptDigest)) return '';
  return crypto.createHash('sha256').update(JSON.stringify([
    SCHEMA,
    binding.hamUid,
    binding.sessionId,
    binding.callId,
    binding.turnId,
    binding.callPurpose,
    binding.opener,
    binding.requestId,
    binding.cycleId,
    binding.receiptDigest,
    attemptSource,
    attemptDigest
  ]), 'utf8').digest('hex');
}

function fromEvidence(expectedHam, item, result) {
  item = item || {};
  result = result || {};
  if (item.call_binding_schema !== SCHEMA ||
      result.call_binding_schema !== SCHEMA) return '';
  var source = typeof item.autonomous_reach_attempt_source === 'string'
    ? item.autonomous_reach_attempt_source : '';
  var attemptDigest = typeof item.autonomous_reach_attempt_digest === 'string'
    ? item.autonomous_reach_attempt_digest : '';
  if (result.autonomous_reach_attempt_source !== source ||
      result.autonomous_reach_attempt_digest !== attemptDigest) return '';
  return digest({
    hamUid:expectedHam,
    sessionId:item.session_id,
    callId:item.call_id,
    turnId:item.turn_id,
    callPurpose:result.call_purpose,
    opener:result.committed_opener,
    requestId:item.request_id,
    cycleId:item.cycle_id,
    receiptDigest:item.receipt_digest,
    autonomousReachAttemptSource:source,
    autonomousReachAttemptDigest:attemptDigest
  });
}

module.exports = {
  SCHEMA:SCHEMA,
  digest:digest,
  fromEvidence:fromEvidence,
  exactAttemptPair:exactAttemptPair
};
