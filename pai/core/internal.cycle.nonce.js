// ⬡B:core.internal_cycle_nonce:GUARD:one_signed_machine_request_runs_once:20260730⬡
'use strict';

var crypto = require('node:crypto');

function claimSource(payload) {
  if (!payload || !payload.ham_uid || !payload.nonce) return null;
  var digest = crypto.createHash('sha256').update(String(payload.nonce), 'utf8').digest('hex');
  return 'internal.cycle.nonce.' + String(payload.ham_uid).toLowerCase() + '.' + digest;
}

async function consume(proof, options) {
  options = options || {};
  var payload = proof && proof.ok === true && proof.payload;
  var source = claimSource(payload);
  var expiresAt = Number(payload && payload.expires_at);
  if (!source || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return { ok:false, status:401, reason:'internal_cycle_authorization_invalid_or_expired' };
  }
  var claimant = 'internal-cycle:' + crypto.randomUUID();
  var claimTask = options.claimTask || require('./claim_lock.js').claimTask;
  try {
    // The lease outlives the proof. Once the proof has expired, replay is already rejected by
    // its signature envelope; while it is valid, Postgres is the atomic single-use arbiter.
    var leaseMs = Math.max(1000, expiresAt - Date.now() + 60 * 1000);
    var won = await claimTask(source, claimant, leaseMs);
    if (!won) return { ok:false, status:409, reason:'internal_cycle_proof_replayed' };
    return { ok:true, source:source, claimant:claimant, expires_at:expiresAt };
  } catch (error) {
    return { ok:false, status:503, reason:'internal_cycle_nonce_claim_unavailable' };
  }
}

module.exports = { consume:consume, _test:{ claimSource:claimSource } };
