// ⬡B:core.pai_public_finalizer:MODULE:one_public_pai_exit:20260715⬡
// entered through the ABAHAM door, serving human-facing portal and advisor channels
//
// Public specialist surfaces may collect local evidence, but they do not own a
// second voice. This is the shared exit: resolve the HAM through ATMOSPHERE,
// run the canonical PAI once, verify all nine durable council rows and the
// exact answer digest/byte count, then expose only the compact proof.
'use strict';

var crypto = require('node:crypto');
var runPAI = require('./tool.loop.js').runPAI;
var council = require('./pai.outbound.council.js');
var resolveAtmosphere = require('./atmosphere.gate.js').resolveAtmosphere;

function cleanRequestId(value) {
  value = typeof value === 'string' ? value.trim() : '';
  return value && /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : '';
}

function requestIdFor(req, body) {
  body = body || Object.create(null);
  var headers = req && req.headers || Object.create(null);
  return cleanRequestId(body.requestId || body.request_id
    || headers['x-anu-request-id'] || headers['idempotency-key'])
    || crypto.randomUUID();
}

function identityHints(body) {
  body = body || Object.create(null);
  var hint = body.hamHint && typeof body.hamHint === 'object'
    ? body.hamHint : Object.create(null);
  var hamUid = body.hamUid || body.ham_uid || hint.hamUid || hint.ham_uid;
  if (typeof hamUid === 'string' && hamUid.trim()) return { hamUid:hamUid.trim() };
  var email = body.email || hint.email;
  var phone = body.phone || hint.phone;
  var identifiers = Object.create(null);
  if (typeof email === 'string' && email.trim()) identifiers.email = email.trim();
  if (typeof phone === 'string' && phone.trim()) identifiers.phone = phone.trim();
  return identifiers;
}

async function resolveBodyHam(body) {
  var hints = identityHints(body);
  if (!hints.hamUid && !hints.email && !hints.phone) {
    return { ok:false, reason:'ham_uid_required' };
  }
  var envelope = await resolveAtmosphere(hints);
  if (!envelope || typeof envelope.ham_uid !== 'string' || !envelope.ham_uid.trim()) {
    return { ok:false, reason:'identity_unresolved' };
  }
  return { ok:true, hamUid:envelope.ham_uid, envelope:envelope };
}

function verifiedTurn(pai, expected) {
  var committed = council.requireVerifiedCouncilResult(pai, expected);
  var proof = committed && committed.ok ? council.compactCouncilProof(pai) : null;
  var answer = committed && committed.answer;
  if (!committed || committed.ok !== true || typeof answer !== 'string' || !answer.trim()
      || !proof || proof.committed !== true || proof.readback_verified !== true
      || proof.row_count !== 9 || proof.representation_count !== 9
      || proof.stage_count !== 7 || proof.request_id !== expected.requestId
      || proof.cycle_id !== expected.cycleId
      || typeof proof.receipt_digest !== 'string'
      || !/^[a-f0-9]{64}$/.test(proof.receipt_digest)
      || proof.answer_digest !== council.digestText(answer)
      || proof.answer_bytes !== Buffer.byteLength(answer, 'utf8')) {
    return { ok:false,
      reason:committed && committed.reason || 'pai_council_commit_unverified' };
  }
  if (expected.deliveryTarget) {
    var targetBinding;
    try { targetBinding = council.createDeliveryTargetBinding(expected.deliveryTarget); }
    catch (eTarget) { targetBinding = null; }
    if (!targetBinding
        || proof.delivery_target_digest !== targetBinding.delivery_target_digest
        || proof.delivery_target_bytes !== targetBinding.delivery_target_bytes) {
      return { ok:false, reason:'pai_council_target_unverified' };
    }
  }
  return { ok:true, answer:answer, councilProof:proof };
}

async function finalizePublicTurn(options) {
  options = options || Object.create(null);
  var hamUid = String(options.hamUid || '').trim();
  var question = typeof options.question === 'string' ? options.question : '';
  var deliberationInput = typeof options.deliberationInput === 'string'
    ? options.deliberationInput : '';
  if (!hamUid || !question.trim() || !deliberationInput.trim()) {
    return { ok:false, reason:'pai_finalizer_input_invalid' };
  }
  var requestId = cleanRequestId(options.requestId) || crypto.randomUUID();
  var envelope = options.envelope || Object.create(null);
  var deliveryTarget = { kind:'ham', value:hamUid };
  var context = Object.assign({}, options.councilContext || Object.create(null), {
    original_user_message:question,
    delivery_target:deliveryTarget
  });
  var identity = {
    uid:hamUid,
    name:envelope.name || null,
    trust_level:envelope.trust_level || 0,
    world:options.world || envelope.world || null,
    request_id:requestId,
    user_message:question,
    outbound_finalize:true,
    delivery:{ external:true },
    council_context:context
  };
  var pai;
  try {
    pai = await runPAI(hamUid, deliberationInput, options.channel || 'portal', identity,
      Array.isArray(options.priorTurns) ? options.priorTurns : [], null);
  } catch (ePai) {
    return { ok:false, reason:'pai_cycle_unavailable', requestId:requestId };
  }
  var cycleId = pai && (pai.cycleId || pai.cycle_id);
  var verified = verifiedTurn(pai, {
    hamUid:hamUid,
    requestId:requestId,
    cycleId:cycleId,
    question:question,
    deliberationInput:deliberationInput,
    answer:pai && pai.answer,
    deliveryTarget:deliveryTarget
  });
  // ⬡B:core.pai_public_finalizer:FIX:retry_a_flaky_clean_board_hold_before_silencing_the_advisor:20260722⬡
  // Every founder-facing advisor answer (finance/legal/life/jobs/business, the budget read he asks
  // for) is composed HERE, and this path had no retry -- so a single unlucky flip of SHADOW's
  // known-flaky MODEL judge (documented: the same clean answer holds once and passes once, ~30s
  // apart) silenced the whole advisor, which reads to him as "she stopped answering me". wren/reply.js
  // already gives the exact same clean-board holds one real re-run before going silent; the public
  // finalizer, which reaches him just as directly, was missing it. Mirror it: ONLY a bare
  // probabilistic hold on an otherwise clean board (shadow_model_hold, shadow_wonder_hold, writ_hold,
  // content_too_short) gets ONE more real cycle. A genuine deterministic integrity hold
  // (shadow_deterministic_hold, a named-evidence contradiction, a fabrication catch) is NOT in the
  // set and still goes silent, exactly as the hollow-reply rule requires. This does not weaken any
  // gate; it only gives the flaky judge a second look before her voice is silenced.
  if (!verified.ok) {
    var _holdReason = String((pai && pai.reason) || verified.reason || '');
    var _cleanBoardHold = ['shadow_model_hold','shadow_wonder_hold','writ_hold','content_too_short']
      .indexOf(_holdReason) !== -1;
    if (_cleanBoardHold) {
      var retryRequestId = cleanRequestId(options.requestId) || crypto.randomUUID();
      var retryIdentity = Object.assign({}, identity, { request_id:retryRequestId });
      var retryPai;
      try {
        retryPai = await runPAI(hamUid, deliberationInput, options.channel || 'portal', retryIdentity,
          Array.isArray(options.priorTurns) ? options.priorTurns : [], null);
      } catch (eRetry) { retryPai = null; }
      if (retryPai && typeof retryPai === 'object') {
        var retryCycleId = retryPai.cycleId || retryPai.cycle_id;
        var retryVerified = verifiedTurn(retryPai, {
          hamUid:hamUid,
          requestId:retryRequestId,
          cycleId:retryCycleId,
          question:question,
          deliberationInput:deliberationInput,
          answer:retryPai.answer,
          deliveryTarget:deliveryTarget
        });
        // The retry replaces the first attempt outright; its result is authoritative.
        pai = retryPai; cycleId = retryCycleId; requestId = retryRequestId; verified = retryVerified;
      }
    }
  }
  if (!verified.ok) {
    return { ok:false, reason:pai && pai.reason || verified.reason,
      requestId:requestId, cycleId:cycleId || null };
  }
  return { ok:true, answer:verified.answer, requestId:requestId,
    cycleId:cycleId, councilProof:verified.councilProof };
}

module.exports = {
  requestIdFor:requestIdFor,
  resolveBodyHam:resolveBodyHam,
  verifiedTurn:verifiedTurn,
  finalizePublicTurn:finalizePublicTurn
};
