// ⬡B:core.outreach:WIRE:funneled_20260713⬡
// DOCTRINE (entry): outreach is A'NU's own outward reach, not a side gate. The Overseer
// decides it at the end of the one PAI cycle whose entry is always A'NEW through the
// ABAHAM door, and it only ever reaches the HAM the cycle already resolved.
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}
function ymd() { return new Date().toISOString().slice(0,10).replace(/-/g,''); } // ACL date slot = YYYYMMDD, not epoch ms
// ⬡B:core.outreach:MODULE:autonomous_founder_reach:20260701⬡
// A'NEW reaching the founder on her own — the everyday voice, distinct from
// life_flex's ceremonial six-condition fire. Runs on aibebase (always-on, owns the
// Blooio key). Each pass: gather REAL recent facts from brain → judge with her FULL
// Memory Bank (doctrine + roadmap now ride in it) whether anything genuinely merits reaching
// out → if yes, compose in her own voice and send through the proven tapSend path →
// stamp an OUTREACH bead with the receipt and the reasoning.
//
// Guards, learned the hard way tonight:
// - The min-gap check reads the last OUTREACH bead from BRAIN, never process memory —
//   an in-memory flag cannot guard across Render's multiple instances (proven live
//   20260701, 50+ beads in one second through an in-memory guard).
// - Judgment can override the gap only at importance >= 9 (real urgency), so she can
//   always reach him when it matters but can never become the flood.
// - Silence over hollow: if the judgment says hold, or composition comes back empty,
//   nothing sends. No "just checking in" spam, ever.
// ANYHAM: founder identity comes from env (FOUNDER_HAM_UID/OVERSEER_HAM_UID,
// FOUNDER_PHONE) — a second world sets its own env and this file works unchanged.

const { buildMemoryBank } = require('./fcw.builder.js'); // Memory Bank (BIND doctrine)
const { tapSend } = require('./wren/reply.js');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const voiceProviderAcceptance = require('./voice.provider.acceptance.js');
const reachContext = new AsyncLocalStorage();
let voiceDeliveryReconciler = null;
let voiceProviderAcceptanceRecorder = null;
const VOICE_AUTONOMOUS_ATTEMPT_VERSION =
  'anew.reach.voice.autonomous-attempt.v1';
const VOICE_AUTONOMOUS_ATTEMPT_STAMP = 'REACH_VOICE_ATTEMPT';
// This module-private capability is the authority boundary. Public/manual call
// routes can invoke placeCall, but only outreachPass can identify a call as an
// autonomous REACH attempt and cause the durable provenance row to be minted.
const AUTONOMOUS_VOICE_ATTEMPT_CAPABILITY = Symbol('autonomous_voice_attempt');

// The mounted signed voice route owns interpretation of its durable transport
// receipt. Register that owner once at boot so every later autonomous pass can
// close a delivery that survived a worker/network race before judging another
// reach. The callback performs no provider or PAI effect.
function registerVoiceDeliveryReconciler(reconciler) {
  if (typeof reconciler !== 'function') {
    throw new Error('voice_delivery_reconciler_invalid');
  }
  voiceDeliveryReconciler = reconciler;
  return true;
}

function registerVoiceProviderAcceptanceRecorder(recorder) {
  if (typeof recorder !== 'function') {
    throw new Error('voice_provider_acceptance_recorder_invalid');
  }
  voiceProviderAcceptanceRecorder = recorder;
  return true;
}

async function recordReturnedVoiceProviderAcceptance(body) {
  if (!voiceProviderAcceptanceRecorder) return { ok:false,
    reason:'voice_provider_acceptance_recorder_unavailable' };
  try {
    var result = await voiceProviderAcceptanceRecorder(body);
    return result && result.ok === true && result.accepted === true &&
      result.readbackVerified === true ? result : { ok:false,
        reason:result && result.reason || 'voice_provider_acceptance_unverified' };
  } catch (eRecord) {
    return { ok:false, reason:'voice_provider_acceptance_unverified' };
  }
}

async function reconcileVoiceDeliveryTruth(hamUid) {
  if (!voiceDeliveryReconciler) return { ok:true, configured:false, reconciled:0 };
  try {
    var result = await voiceDeliveryReconciler(hamUid);
    return result && result.ok === true ? result
      : { ok:false, reason:result && result.reason ||
        'voice_delivery_reconciliation_unverified' };
  } catch (eReconcile) {
    return { ok:false, reason:'voice_delivery_reconciliation_unverified' };
  }
}

function voiceDigest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function voiceSessionBindingMessage(attemptSource, attemptDigest) {
  var source = typeof attemptSource === 'string' ? attemptSource : '';
  var digest = typeof attemptDigest === 'string' ? attemptDigest : '';
  if (!source && !digest) return 'voice_session_bind';
  return JSON.stringify(['voice_session_bind', source, digest]);
}

function voiceAutonomousAttemptShape(input) {
  input = input || {};
  var hamUid = String(input.hamUid || '').trim().toUpperCase();
  var requestId = String(input.requestId || '').trim();
  var cycleId = String(input.cycleId || '').trim();
  var sessionId = String(input.sessionId || '').trim();
  var receiptDigest = String(input.receiptDigest || '').trim().toLowerCase();
  var finalSource = String(input.finalSource || '').trim();
  var targetDigest = String(input.deliveryTargetDigest || '').trim().toLowerCase();
  var targetBytes = Number(input.deliveryTargetBytes);
  var claimSource = String(input.deliveryClaimSource || '').trim();
  var claimDigest = String(input.deliveryClaimDigest || '').trim().toLowerCase();
  var exactClaimPrefix = 'outreach_delivery:priority:' + hamUid + ':';
  if (!/^[A-Z0-9._:-]{2,160}$/.test(hamUid) ||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(requestId) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(cycleId) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(sessionId) ||
      !/^[a-f0-9]{64}$/.test(receiptDigest) || !finalSource ||
      finalSource.length > 500 || !/^[a-f0-9]{64}$/.test(targetDigest) ||
      !Number.isInteger(targetBytes) || targetBytes <= 0 ||
      !claimSource.startsWith(exactClaimPrefix) ||
      !/^[a-f0-9]{64}$/.test(claimDigest) ||
      claimSource !== exactClaimPrefix + claimDigest) return null;
  var content = {
    version:VOICE_AUTONOMOUS_ATTEMPT_VERSION,
    autonomous_reach:true,
    provider_effect_pending:true,
    ham_uid:hamUid,
    request_id:requestId,
    cycle_id:cycleId,
    session_id:sessionId,
    council_receipt_digest:receiptDigest,
    council_final_source:finalSource,
    delivery_target_digest:targetDigest,
    delivery_target_bytes:targetBytes,
    outreach_delivery_claim_source:claimSource,
    outreach_delivery_claim_digest:claimDigest
  };
  var contentText = JSON.stringify(content);
  var bindingDigest = voiceDigest(contentText);
  return { content:content, contentText:contentText, digest:bindingDigest,
    source:'reach.voice_autonomous_attempt.' + bindingDigest };
}

function voiceAutonomousAttemptRow(input) {
  var shape = voiceAutonomousAttemptShape(input);
  if (!shape) return null;
  return { row:{
    ham_uid:shape.content.ham_uid,
    agent_global:'ANEW',
    stamp_type:VOICE_AUTONOMOUS_ATTEMPT_STAMP,
    acl_stamp:'⬡B:core.outreach:REACH_VOICE_ATTEMPT:before_provider:20260717⬡',
    source:shape.source,
    summary:'[REACH VOICE ATTEMPT] autonomous provider seam authorized for ' +
      shape.content.request_id,
    content:shape.contentText,
    importance:6
  }, proof:{ source:shape.source, digest:shape.digest } };
}

function sameVoiceAutonomousAttemptRow(row, expected) {
  return !!(row && expected && row.ham_uid === expected.ham_uid &&
    row.agent_global === expected.agent_global &&
    row.stamp_type === expected.stamp_type && row.acl_stamp === expected.acl_stamp &&
    row.source === expected.source && row.summary === expected.summary &&
    String(row.content) === String(expected.content) &&
    Number(row.importance) === Number(expected.importance));
}

async function readVoiceAutonomousAttemptRows(hamUid, source) {
  if (!_bu() || !_bk()) return { ok:false,
    reason:'voice_autonomous_attempt_bank_unconfigured' };
  var response;
  try {
    response = await fetch(_bu().replace(/\/$/, '') + '/rest/v1/' + _tbl() +
      '?ham_uid=eq.' + encodeURIComponent(hamUid) +
      '&stamp_type=eq.' + VOICE_AUTONOMOUS_ATTEMPT_STAMP +
      '&source=eq.' + encodeURIComponent(source) +
      '&select=id,ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,importance,created_at',
    { headers:bh() });
  } catch (eRead) {
    return { ok:false, reason:'voice_autonomous_attempt_readback_failed' };
  }
  if (!response || response.ok !== true) return { ok:false,
    reason:'voice_autonomous_attempt_readback_failed' };
  var rows = await response.json().catch(function () { return null; });
  return Array.isArray(rows) ? { ok:true, rows:rows }
    : { ok:false, reason:'voice_autonomous_attempt_readback_invalid' };
}

// Read-only verifier exported to the signed voice route. Absence means a normal
// manual/proof call; a supplied proof that cannot be read exactly is a hard hold.
async function verifyVoiceAutonomousAttempt(call) {
  call = call || {};
  var source = String(call.autonomousReachAttemptSource || '').trim();
  var digest = String(call.autonomousReachAttemptDigest || '').trim().toLowerCase();
  if (!source && !digest) return { ok:true, applicable:false };
  if (source !== 'reach.voice_autonomous_attempt.' + digest ||
      !/^[a-f0-9]{64}$/.test(digest)) return { ok:false, applicable:true,
    reason:'voice_autonomous_attempt_binding_invalid' };
  var read = await readVoiceAutonomousAttemptRows(
    String(call.hamUid || '').trim().toUpperCase(), source);
  if (!read.ok) return Object.assign({ applicable:true }, read);
  if (read.rows.length !== 1) return { ok:false, applicable:true,
    reason:read.rows.length ? 'voice_autonomous_attempt_readback_mismatch'
      : 'voice_autonomous_attempt_missing' };
  var row = read.rows[0];
  var content;
  try { content = JSON.parse(row.content); }
  catch (eContent) { content = null; }
  var expected = content && voiceAutonomousAttemptRow({
    hamUid:content.ham_uid,
    requestId:content.request_id,
    cycleId:content.cycle_id,
    sessionId:content.session_id,
    receiptDigest:content.council_receipt_digest,
    finalSource:content.council_final_source,
    deliveryTargetDigest:content.delivery_target_digest,
    deliveryTargetBytes:content.delivery_target_bytes,
    deliveryClaimSource:content.outreach_delivery_claim_source,
    deliveryClaimDigest:content.outreach_delivery_claim_digest
  });
  var attemptCreatedAt = canonicalDeliveryTime(row.created_at);
  var exact = !!(expected && expected.proof.source === source &&
    expected.proof.digest === digest && row.content === JSON.stringify(content) &&
    sameVoiceAutonomousAttemptRow(row, expected.row) &&
    content.ham_uid === String(call.hamUid || '').trim().toUpperCase() &&
    content.request_id === call.requestId && content.cycle_id === call.cycleId &&
    content.session_id === call.sessionId &&
    content.council_receipt_digest === call.receiptDigest && attemptCreatedAt);
  return exact ? { ok:true, applicable:true, source:source, digest:digest,
    rowId:row.id || null, readbackVerified:true,
    attemptCreatedAt:attemptCreatedAt }
    : { ok:false, applicable:true,
      reason:'voice_autonomous_attempt_readback_mismatch' };
}

async function persistVoiceAutonomousAttempt(input) {
  var expected = voiceAutonomousAttemptRow(input);
  if (!expected) return { ok:false, reason:'voice_autonomous_attempt_binding_invalid' };
  var before = await readVoiceAutonomousAttemptRows(
    expected.row.ham_uid, expected.row.source);
  if (!before.ok) return before;
  if (before.rows.length) return before.rows.length === 1 &&
    sameVoiceAutonomousAttemptRow(before.rows[0], expected.row)
    ? { ok:true, duplicate:true, source:expected.proof.source,
      digest:expected.proof.digest, rowId:before.rows[0].id || null,
      readbackVerified:true }
    : { ok:false, reason:'voice_autonomous_attempt_readback_mismatch' };
  var response;
  try {
    response = await fetch(_bu().replace(/\/$/, '') + '/rest/v1/' + _tbl(), {
      method:'POST', headers:Object.assign({}, bh(), {
        'Content-Profile':_schema(), 'Content-Type':'application/json',
        Prefer:'return=representation'
      }), body:JSON.stringify(expected.row)
    });
  } catch (eWrite) { response = null; }
  var represented = response && response.ok
    ? await response.json().catch(function () { return null; }) : null;
  var after = await readVoiceAutonomousAttemptRows(
    expected.row.ham_uid, expected.row.source);
  if (!after.ok) return after;
  if (after.rows.length === 1 && sameVoiceAutonomousAttemptRow(after.rows[0], expected.row)) {
    return { ok:true, duplicate:false, recovered:!(Array.isArray(represented) &&
      represented.length === 1 &&
      sameVoiceAutonomousAttemptRow(represented[0], expected.row)),
      source:expected.proof.source, digest:expected.proof.digest,
      rowId:after.rows[0].id || null, readbackVerified:true };
  }
  return { ok:false, reason:after.rows.length
    ? 'voice_autonomous_attempt_readback_mismatch'
    : (response && response.ok ? 'voice_autonomous_attempt_write_unrepresented'
      : 'voice_autonomous_attempt_write_failed') };
}

// ⬡B:core.outreach:WIRE:ornith_primary_groq_fallback:20260705⬡
// Same board-settled ladder as core/deliberationCouncil.js (clair.threeray.
// model_rotation_final, importance 10): Ornith primary, Groq real fallback.
// Every call in this file is a plain text-in-text-out judgment or compose
// step, no tool-calling involved, so nothing blocks moving off Groq today.
// Proven live on the council file first, including the real gap found and
// fixed there (ORNITH_URL/RUNPOD_API_KEY only existed on canew, not here) --
// same env vars now added to this service too, so this is not starting cold.
const ORNITH_URL = process.env.ORNITH_URL;
const RUNPOD_KEY = process.env.RUNPOD_API_KEY;
const ORNITH_MODEL = process.env.ORNITH_MODEL || 'maxwell1500/ornith-35b:Q4_K_M';

async function callOrnith(system, userContent, maxTokens) {
  // ⬡B:core.outreach:KILL:ornith_retired_founder_911:20260722⬡ FOUNDER 911: Ornith
  // retired, RunPod out. Null falls to the next provider exactly like a timeout.
  if (process.env.ORNITH_ENABLED !== 'on') return null;
  if (!ORNITH_URL || !RUNPOD_KEY) return null;
  try {
    const payload = { input: { mode: 'chat', model: ORNITH_MODEL,
      options: { num_predict: maxTokens || 1500, temperature: 0.3 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] } };
    const jobResp = await fetch(ORNITH_URL.replace(/\/$/, '') + '/run', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RUNPOD_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(x => x.json()).catch(() => null);
    const jobId = jobResp && jobResp.id;
    if (!jobId) return null;
    for (let i = 0; i < 8; i++) {
      await new Promise(res => setTimeout(res, 8000));
      const statusResp = await fetch(ORNITH_URL.replace(/\/$/, '') + '/status/' + jobId, {
        headers: { Authorization: 'Bearer ' + RUNPOD_KEY }
      }).then(x => x.json()).catch(() => null);
      if (statusResp && statusResp.status === 'COMPLETED') {
        const out = statusResp.output;
        const msg = Array.isArray(out) ? (out[0] && out[0].choices && out[0].choices[0] && out[0].choices[0].message)
          : (out && out.choices && out.choices[0] && out.choices[0].message);
        return (msg && msg.content) || null;
      }
      if (statusResp && statusResp.status === 'FAILED') return null;
    }
    return null;
  } catch (e) { return null; }
}

// ⬡B:core.outreach:FIX:glm_first_ornith_real_fallback:20260710⬡
// Founder found this live via the real RunPod balance dropping fast even
// after the deliberationCouncil.js fix -- this file has its own separate
// callOrnith(), never touched by that fix, called on the two most
// frequently-fired judgment steps in the whole system (real-time outreach
// judgment and the daily digest). Same real fix, same reason: RunPod bills
// GPU wall-clock time per call, GLM-5.2 (Together, hosted, token-billed)
// costs a fraction of a cent for the same call. GLM tried first now, Ornith
// stays as the real fallback, not removed.
async function callGLM(system, userContent, maxTokens) {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'zai-org/GLM-5.2', max_tokens: maxTokens || 3000, temperature: 0.3,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }] })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
  } catch (e) { return null; }
}

// ⬡B:core.outreach:WIRE:real_phone_call:20260702⬡
// Founder, verbatim: "she still never calls me." Reach was text-only. Now: when her
// judgment says importance >= 9, she CALLS through the owned Pipecat worker:
// telephony carries media, Deepgram hears, PAI judges, and ElevenLabs renders TTS.
// Below 9, a text. A provider receipt ID is required before a call is accepted.
async function placeCall(toPhone, callReason, councilResult, options) {
  // ⬡B:core.outreach:GUARD:provider_call_requires_full_council_pair:20260715⬡
  // This exported provider boundary used to accept any caller-supplied words.
  // Require the full receipt and STAMP pair here too, then bind the opener to
  // the exact approved answer bytes before ElevenLabs can be reached.
  var providerProof = null;
  var committedDelivery = null;
  var receipt = councilResult && (councilResult.council_receipt || councilResult.councilReceipt);
  var recipientEnvelope = null;
  try {
    recipientEnvelope = await require('./atmosphere.gate.js').resolveAtmosphere({ phone:toPhone });
  } catch (eRecipient) { recipientEnvelope = null; }
  if (!recipientEnvelope || !recipientEnvelope.ham_uid) {
    return { ok:false, reason:'recipient_identity_unresolved' };
  }
  if (!receipt || String(receipt.ham_uid || '').toUpperCase() !==
      String(recipientEnvelope.ham_uid).toUpperCase()) {
    return { ok:false, reason:'recipient_ham_mismatch' };
  }
  try {
    var outboundCouncil = require('./pai.outbound.council.js');
    committedDelivery = outboundCouncil.requireVerifiedCouncilDelivery(councilResult,
      { kind:'phone', value:toPhone }, callReason);
    providerProof = committedDelivery && committedDelivery.ok
      ? outboundCouncil.compactCouncilProof(councilResult) : null;
  } catch (eProof) { providerProof = null; }
  if (!committedDelivery || !committedDelivery.ok || !providerProof ||
      providerProof.committed !== true || providerProof.row_count !== 9) {
    return { ok:false, reason:'pai_council_result_required' };
  }
  options = options || {};
  var isAutonomousReach =
    options.autonomousVoiceCapability === AUTONOMOUS_VOICE_ATTEMPT_CAPABILITY;
  var autonomousAttemptInput = null;
  var autonomousAttemptProof = null;
  // ⬡B:core.outreach:GUARD:provider_edge_kill_switch_recheck:20260715⬡
  // Every caller, including OMI and scheduled sessions, reaches this raw edge.
  // Recheck the shared switch here so no upstream path can bypass it and so a
  // switch flipped during council deliberation still prevents the provider call.
  try {
    if (!_bu() || !_bk()) return { ok:false, reason:'kill_switch_unverified' };
    var killState = await require('./killswitch.js').isActive(recipientEnvelope.ham_uid);
    if (!killState || typeof killState.active !== 'boolean' || killState.error) {
      return { ok:false, reason:'kill_switch_unverified' };
    }
    if (killState.active) return { ok:false, reason:'kill_switch_active' };
  } catch (eKill) { return { ok:false, reason:'kill_switch_unverified' }; }
  // \u2b21B:core.outreach:FIX:outbound_call_carries_atmosphere:20260702\u2b21
  // Founder screenshot: three missed calls, every voicemail "I need to verify who
  // you are first." Root cause read directly from this function: the outbound body
  // carried agent, phone, to_number and NOTHING else -- no
  // conversation_initiation_client_data, so the custom LLM received no ham_uid on
  // any proactive call and fell to GUEST every time. Founder law, verbatim: "the
  // atmosphere should be decided and detected based on what number she dialed...
  // she went in and got the number to dial." The gate already exists
  // (core/atmosphere.gate.js) and the /vara/llm handler already reads
  // dynamic_variables.ham_uid -- this call path just never carried the gate's
  // output. Same shape /vara/personalize returns for inbound; one gate, both
  // directions. UNIVERSALITY: resolved per-call from the dialed number, nothing hardcoded.
  var dv = { ham_uid: recipientEnvelope.ham_uid,
    ham_name: recipientEnvelope.name || 'there',
    trust_level: String(recipientEnvelope.trust_level != null ? recipientEnvelope.trust_level : 0),
    world: recipientEnvelope.world || 'guest' };
  // ⬡B:core.outreach:FIX:call_reason_threaded_to_live_turn:20260703⬡
  // Founder finding, live on a real call tonight: he was called for a real
  // reason, real judgment, real receipts, and when he asked mid-call "was
  // this real or manufactured," the answering side had zero access to what
  // it had just called about seconds earlier and asked him to re-explain
  // from scratch. The save happened, the recall into the live moment didn't.
  // This is the same dynamic_variables/custom_llm_extra_body path that
  // already carries identity -- carrying the actual reason for this specific
  // call alongside it closes the gap without inventing a new mechanism.
  if (callReason) {
    var handoffSessionId = 'vara.handoff.' + crypto.randomUUID();
    // Keep the exact-call lease valid for a real conversation, not only for a
    // short demo. Twilio's canonical media stream can remain open for 60
    // minutes; the five-minute setup margin matches the authorization cap.
    var handoffExpiresAt = Date.now() + 65 * 60 * 1000;
    var handoffNonce = crypto.randomUUID();
    var handoffInput = { hamUid:dv.ham_uid, message:String(callReason),
      receiptDigest:providerProof.receipt_digest,
      requestId:providerProof.request_id, cycleId:providerProof.cycle_id,
      deliveryTarget:{ kind:'phone', value:toPhone },
      sessionId:handoffSessionId, expiresAt:handoffExpiresAt,
      nonce:handoffNonce, purpose:'initial_message' };
    dv.call_reason = String(callReason).slice(0);
    dv.initial_message = String(callReason);
    dv.initial_message_receipt_digest = providerProof.receipt_digest;
    dv.initial_message_authorization = require('./pai.outbound.authorization.js')
      .signInitialMessage(handoffInput);
    if (!dv.initial_message_authorization) {
      return { ok:false, reason:'provider_handoff_authorization_unavailable' };
    }
    dv.initial_message_request_id = handoffInput.requestId;
    dv.initial_message_cycle_id = handoffInput.cycleId;
    dv.initial_message_target_kind = 'phone';
    dv.initial_message_target_value = toPhone;
    dv.initial_message_session_id = handoffSessionId;
    dv.initial_message_expires_at = handoffExpiresAt;
    dv.initial_message_nonce = handoffNonce;

    // Prepare the exact durable autonomous-attempt row before signing the
    // Pipecat lease. The private Symbol above means only outreachPass can enter
    // this branch; a public/manual caller cannot manufacture autonomous origin
    // by choosing an outreach-looking request ID.
    if (isAutonomousReach) {
      var deliveryClaim = options.deliveryClaim || {};
      autonomousAttemptInput = {
        hamUid:dv.ham_uid,
        requestId:providerProof.request_id,
        cycleId:providerProof.cycle_id,
        sessionId:handoffSessionId,
        receiptDigest:providerProof.receipt_digest,
        finalSource:providerProof.final_source,
        deliveryTargetDigest:providerProof.delivery_target_digest,
        deliveryTargetBytes:providerProof.delivery_target_bytes,
        deliveryClaimSource:deliveryClaim.source,
        deliveryClaimDigest:deliveryClaim.digest
      };
      var preparedAttempt = voiceAutonomousAttemptRow(autonomousAttemptInput);
      if (!preparedAttempt) {
        return { ok:false, reason:'voice_autonomous_attempt_binding_invalid' };
      }
      autonomousAttemptProof = preparedAttempt.proof;
      dv.autonomous_reach_attempt_source = autonomousAttemptProof.source;
      dv.autonomous_reach_attempt_digest = autonomousAttemptProof.digest;
    }

    // ⬡B:core.outreach:GUARD:pipecat_voice_session_bound_to_exact_ham:20260716⬡
    // The signed opener authorizes one exact sentence for one phone target; it
    // does not authorize later caller transcripts to select a HAM. Mint the
    // existing voice-session binding beside it, using the same verified council
    // receipt and logical call session but a HAM delivery target and independent
    // nonce. Pipecat forwards these fields unchanged and /voice/pai-turn verifies
    // them before any Memory Bank read or model call.
    var voiceSessionNonce = crypto.randomUUID();
    var voiceSessionInput = { hamUid:dv.ham_uid,
      message:voiceSessionBindingMessage(dv.autonomous_reach_attempt_source,
        dv.autonomous_reach_attempt_digest),
      receiptDigest:providerProof.receipt_digest,
      requestId:providerProof.request_id, cycleId:providerProof.cycle_id,
      deliveryTarget:{ kind:'ham', value:dv.ham_uid },
      sessionId:handoffSessionId, expiresAt:handoffExpiresAt,
      nonce:voiceSessionNonce, purpose:'voice_session_bind' };
    dv.voice_session_receipt_digest = providerProof.receipt_digest;
    dv.voice_session_request_id = voiceSessionInput.requestId;
    dv.voice_session_cycle_id = voiceSessionInput.cycleId;
    dv.voice_session_target_kind = 'ham';
    dv.voice_session_target_value = dv.ham_uid;
    dv.voice_session_id = handoffSessionId;
    dv.voice_session_expires_at = handoffExpiresAt;
    dv.voice_session_nonce = voiceSessionNonce;
    dv.voice_session_authorization = require('./pai.outbound.authorization.js')
      .signInitialMessage(voiceSessionInput);
    if (!dv.voice_session_authorization) {
      return { ok:false, reason:'voice_session_bind_unavailable' };
    }
  }
  const pipecatUrl = String(process.env.PIPECAT_CALL_URL || '').replace(/\/$/, '');
  if (!pipecatUrl) return { ok:false, reason:'provider_not_configured' };
  // This read-back-verified row is the last internal step before the external
  // provider-attempt claim and provider seam. A crash after this write is
  // recoverable; a write/read race is held before the permanent effect claim,
  // so it remains retryable without ever dialing from unproven origin.
  if (autonomousAttemptInput) {
    var persistedAttempt = await persistVoiceAutonomousAttempt(autonomousAttemptInput);
    if (!persistedAttempt.ok || persistedAttempt.readbackVerified !== true ||
        persistedAttempt.source !== autonomousAttemptProof.source ||
        persistedAttempt.digest !== autonomousAttemptProof.digest) {
      return { ok:false, reason:persistedAttempt.reason ||
        'voice_autonomous_attempt_unverified' };
    }
  }
  var effectClaim = await require('./outbound.effect.js').claimProviderAttempt({
    hamUid:recipientEnvelope.ham_uid, channel:'vara_call',
    deliveryTarget:{ kind:'phone', value:toPhone }, artifact:String(callReason),
    requestId:providerProof.request_id, cycleId:providerProof.cycle_id,
    sessionId:dv.initial_message_session_id
  });
  if (!effectClaim.ok) return { ok:false, reason:effectClaim.reason,
    effectKey:effectClaim.effectKey || null };
  const pipecatHandoffBody = {
    ham_uid:dv.ham_uid, ham_name:dv.ham_name, world:dv.world,
    initial_message:dv.initial_message || '', call_reason:dv.call_reason || '',
    request_id:providerProof.request_id, cycle_id:providerProof.cycle_id,
    receipt_digest:providerProof.receipt_digest,
    session_id:dv.voice_session_id,
    initial_message_receipt_digest:dv.initial_message_receipt_digest,
    initial_message_authorization:dv.initial_message_authorization,
    initial_message_request_id:dv.initial_message_request_id,
    initial_message_cycle_id:dv.initial_message_cycle_id,
    initial_message_target_kind:dv.initial_message_target_kind,
    initial_message_target_value:dv.initial_message_target_value,
    initial_message_session_id:dv.initial_message_session_id,
    initial_message_expires_at:dv.initial_message_expires_at,
    initial_message_nonce:dv.initial_message_nonce,
    voice_session_receipt_digest:dv.voice_session_receipt_digest,
    voice_session_request_id:dv.voice_session_request_id,
    voice_session_cycle_id:dv.voice_session_cycle_id,
    voice_session_target_kind:dv.voice_session_target_kind,
    voice_session_target_value:dv.voice_session_target_value,
    voice_session_id:dv.voice_session_id,
    voice_session_expires_at:dv.voice_session_expires_at,
    voice_session_nonce:dv.voice_session_nonce,
    voice_session_authorization:dv.voice_session_authorization,
    provider_effect_idempotency_key:effectClaim.idempotencyKey,
    autonomous_reach_attempt_source:dv.autonomous_reach_attempt_source || '',
    autonomous_reach_attempt_digest:dv.autonomous_reach_attempt_digest || ''
  };
  // Pipecat is the only REACH conversation owner: telephony carries media,
  // Deepgram is the ear, A'NEW/PAI owns every response, and ElevenLabs is TTS
  // only inside the worker. Fail closed here instead of reviving ConvAI when
  // the owned service is missing or rejects its route; a second conversation
  // owner would make both identity and same-call proof ambiguous.
  try {
    const pipecatHeaders = { 'Content-Type':'application/json',
      'Idempotency-Key':effectClaim.idempotencyKey };
    if (process.env.PIPECAT_BRIDGE_KEY) {
      pipecatHeaders.Authorization = 'Bearer ' + process.env.PIPECAT_BRIDGE_KEY;
    }
    const pipecatResponse = await fetch(pipecatUrl + '/start', {
      method:'POST', headers:pipecatHeaders,
      body:JSON.stringify({ phone_number:toPhone, body:pipecatHandoffBody })
    });
    const pipecatBody = await pipecatResponse.json().catch(function(){ return {}; });
    const pipecatDetail = pipecatBody && pipecatBody.detail &&
      typeof pipecatBody.detail === 'object' ? pipecatBody.detail : {};
    const pipecatReceipt = Object.assign({}, pipecatBody, pipecatDetail);
    const pipecatId = pipecatReceipt.call_control_id || pipecatReceipt.call_sid || null;
    const acceptance = pipecatId ? voiceProviderAcceptance.shape({
      hamUid:dv.ham_uid, sessionId:dv.voice_session_id,
      requestId:providerProof.request_id, cycleId:providerProof.cycle_id,
      receiptDigest:providerProof.receipt_digest,
      provider:pipecatReceipt.provider, providerCallId:pipecatId,
      providerEffectIdempotencyKey:effectClaim.idempotencyKey,
      autonomousReachAttemptSource:dv.autonomous_reach_attempt_source || '',
      autonomousReachAttemptDigest:dv.autonomous_reach_attempt_digest || ''
    }) : null;
    const acceptanceVerified = !!(acceptance &&
      pipecatReceipt.provider_acceptance_readback_verified === true &&
      pipecatReceipt.provider_acceptance_source === acceptance.source);
    if (pipecatResponse.ok && pipecatId && acceptanceVerified) {
      return { ok:true, via:'pipecat_' + (pipecatReceipt.provider || 'telephony'),
        conversation_id:pipecatId, providerStatus:pipecatResponse.status };
    }
    const returnedAcceptanceSigned = !!(acceptance &&
      pipecatReceipt.provider_acceptance_source === acceptance.source &&
      voiceProviderAcceptance.verify(acceptance,
        process.env.PIPECAT_BRIDGE_KEY || '',
        pipecatReceipt.provider_acceptance_authorization));
    if (pipecatId && returnedAcceptanceSigned) {
      const recovered = await recordReturnedVoiceProviderAcceptance(Object.assign({},
        pipecatHandoffBody, {
          provider:pipecatReceipt.provider,
          provider_call_id:pipecatId,
          provider_acceptance_source:acceptance.source,
          provider_acceptance_authorization:
            pipecatReceipt.provider_acceptance_authorization
        }));
      if (recovered.ok) return { ok:true,
        via:'pipecat_' + (pipecatReceipt.provider || 'telephony'),
        conversation_id:pipecatId, providerStatus:pipecatResponse.status };
    }
    if (pipecatResponse.ok) return { ok:false, reason:'provider_unverified',
      providerStatus:pipecatResponse.status };
    return Object.assign({ ok:false, reason:pipecatResponse.status >= 500 ||
      [408,425,429].indexOf(pipecatResponse.status) !== -1
      ? 'provider_uncertain' : 'provider_rejected',
      providerStatus:pipecatResponse.status }, pipecatId
      ? { conversation_id:pipecatId } : {});
  } catch (ePipecat) { return { ok:false, reason:'provider_uncertain' }; }
}

// A provider dial receipt proves that one call attempt was accepted. It does
// not prove the HAM answered, that media connected, or that A'NU spoke. Those
// facts belong to the signed call lifecycle and turn-delivery receipts. Keep
// the immediate outreach result honest while that asynchronous evidence is
// still pending.
function applyVoiceDialResult(result, callResult) {
  var dialed = !!(callResult && callResult.ok === true && callResult.conversation_id);
  result.dialed = dialed;
  result.pendingAnswer = dialed;
  result.providerAccepted = dialed;
  result.pendingDelivery = dialed;
  result.delivered = false;
  result.called = false;
  result.sent = false;
  result.call_receipt = callResult && callResult.conversation_id || null;
  result.call_via = callResult && (callResult.via || callResult.reason) || null;
  if (dialed) result.reason = 'voice_dialed_pending_answer';
  return dialed;
}

const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;
const GROQ = process.env.GROQ_API_KEY;

function bh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function founderUid() { const c=reachContext.getStore(); return String(c&&c.hamUid || process.env.FOUNDER_HAM_UID || process.env.OVERSEER_HAM_UID || '').toUpperCase(); }
function founderPhone() { const c=reachContext.getStore(); return c&&c.phone || process.env.FOUNDER_PHONE || process.env.BRANDON_PHONE || ''; }
function founderEmail() { const c=reachContext.getStore(); return c&&c.email || process.env.FOUNDER_EMAIL || process.env.BRANDON_EMAIL || ''; }
function minGapMs() { return parseInt(process.env.OUTREACH_MIN_GAP_MS || '', 10) || 4 * 60 * 60 * 1000; }
function gapHeldSinceSent(lastSent, nowMs) {
  if (!lastSent || !lastSent.created_at) return false;
  return ((nowMs == null ? Date.now() : nowMs) - new Date(lastSent.created_at).getTime()) < minGapMs();
}

// Terminal receipt time governs interruption cadence. The original provider
// attempt time governs which facts were considered. Keeping them separate
// prevents a late email-open webhook from erasing facts created after send.
function canonicalDeliveryTime(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  var millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : '';
}
function deliveredFactWatermark(row) {
  if (!row) return '';
  if (row.stamp_type === 'OUTREACH' || row.stamp_type === 'DIGEST') {
    return canonicalDeliveryTime(row.created_at);
  }
  if (row.stamp_type !== 'OUTREACH_DELIVERY') return '';
  var content;
  try { content = JSON.parse(row.content || '{}'); }
  catch (e) { return ''; }
  return canonicalDeliveryTime(content.providerAttemptAt ||
    content.autonomous_reach_attempt_at);
}

// Upgrade compatibility: pre-v2 terminal rows already bind the durable
// attempt source, but do not carry its timestamp inline. Resolve that one exact
// same-HAM row. Never substitute the later webhook/terminal timestamp.
async function resolveDeliveredFactWatermark(row, knownAttemptRows) {
  var uid = founderUid();
  if (!row || !uid || row.ham_uid !== uid || row.agent_global !== 'ANEW') return '';
  if (row.stamp_type === 'OUTREACH' || row.stamp_type === 'DIGEST') {
    return deliveredFactWatermark(row);
  }
  if (row.stamp_type !== 'OUTREACH_DELIVERY') return '';
  var embedded = deliveredFactWatermark(row);
  var terminal;
  try { terminal = JSON.parse(row.content || '{}'); }
  catch (eTerminal) { return ''; }
  var source = '';
  var stamp = '';
  var isVoice = terminal.version === 'anew.reach.voice.outreach-delivery.v1';
  if (isVoice) {
    source = String(terminal.autonomous_reach_attempt_source || '');
    stamp = VOICE_AUTONOMOUS_ATTEMPT_STAMP;
    if (terminal.delivered !== true || terminal.channel !== 'voice' ||
        terminal.ham_uid !== uid ||
        !/^outreach\.sent\.voice\.[a-f0-9]{64}$/.test(String(row.source || '')) ||
        !/^[a-f0-9]{64}$/.test(String(terminal.autonomous_reach_attempt_digest || '')) ||
        source !== 'reach.voice_autonomous_attempt.' +
          terminal.autonomous_reach_attempt_digest) return '';
  } else {
    var provider = String(terminal.provider || '');
    var providerMessageId = String(terminal.providerMessageId || '');
    source = String(terminal.providerAttemptSource || '');
    stamp = 'REACH_PROVIDER_ATTEMPT';
    var expectedMessageSource = 'outreach.sent.' + terminal.requestId + '.' +
      terminal.channel + '.' + voiceDigest(providerMessageId).slice(0, 32);
    if (terminal.version !== 2 || terminal.terminal !== true ||
        terminal.delivered !== true || terminal.failed !== false ||
        !/^(text|email)$/.test(String(terminal.channel || '')) ||
        row.source !== expectedMessageSource ||
        !/^(blooio|nylas)$/.test(provider) || !providerMessageId ||
        source !== 'reach.provider_attempt.' + provider + '.' +
          voiceDigest(providerMessageId)) return '';
  }
  var rows = Array.isArray(knownAttemptRows) ? knownAttemptRows.filter(function (candidate) {
    return candidate && candidate.ham_uid === uid && candidate.agent_global === 'ANEW' &&
      candidate.stamp_type === stamp && candidate.source === source;
  }) : null;
  if (!rows) {
    var response;
    try {
      response = await fetch(_bu().replace(/\/$/, '') + '/rest/v1/' + _tbl() +
        '?ham_uid=eq.' + encodeURIComponent(uid) +
        '&agent_global=eq.ANEW&stamp_type=eq.' + encodeURIComponent(stamp) +
        '&source=eq.' + encodeURIComponent(source) +
        '&select=id,ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,importance,created_at' +
        '&limit=2', { headers:bh() });
    } catch (eRead) { return ''; }
    if (!response || response.ok !== true) return '';
    rows = await response.json().catch(function () { return null; });
  }
  if (!Array.isArray(rows) || rows.length !== 1) return '';
  var attemptRow = rows[0];
  if (attemptRow.ham_uid !== uid || attemptRow.agent_global !== 'ANEW' ||
      attemptRow.stamp_type !== stamp || attemptRow.source !== source) return '';
  var attempt;
  try { attempt = JSON.parse(attemptRow.content || '{}'); }
  catch (eAttempt) { return ''; }
  if (isVoice) {
    var expected = voiceAutonomousAttemptRow({
      hamUid:attempt.ham_uid,
      requestId:attempt.request_id,
      cycleId:attempt.cycle_id,
      sessionId:attempt.session_id,
      receiptDigest:attempt.council_receipt_digest,
      finalSource:attempt.council_final_source,
      deliveryTargetDigest:attempt.delivery_target_digest,
      deliveryTargetBytes:attempt.delivery_target_bytes,
      deliveryClaimSource:attempt.outreach_delivery_claim_source,
      deliveryClaimDigest:attempt.outreach_delivery_claim_digest
    });
    if (!expected || expected.proof.source !== source ||
        !sameVoiceAutonomousAttemptRow(attemptRow, expected.row) ||
        attempt.request_id !== terminal.request_id ||
        attempt.cycle_id !== terminal.cycle_id) return '';
  } else if (attempt.version !== 2 || attempt.provider !== terminal.provider ||
      attempt.providerMessageId !== terminal.providerMessageId ||
      attempt.requestId !== terminal.requestId || attempt.cycleId !== terminal.cycleId ||
      attempt.pendingFamily !== terminal.pendingFamily ||
      attempt.providerAccepted !== true || attempt.pendingDelivery !== true ||
      attempt.delivered !== false || attempt.providerIntentSource !==
        terminal.providerIntentSource) return '';
  var resolved = canonicalDeliveryTime(attemptRow.created_at);
  return resolved && (!embedded || embedded === resolved) ? resolved : '';
}

const DELIVERY_HISTORY_PAGE = 500;
const DELIVERY_HISTORY_MAX = 10000;
async function readDeliveryHistory(query) {
  var rows = [];
  for (var offset = 0; offset < DELIVERY_HISTORY_MAX; offset += DELIVERY_HISTORY_PAGE) {
    var response;
    try {
      response = await fetch(_bu().replace(/\/$/, '') + '/rest/v1/' + _tbl() +
        '?' + query + '&limit=' + DELIVERY_HISTORY_PAGE + '&offset=' + offset,
      { headers:bh() });
    } catch (eRead) { return { ok:false, rows:[] }; }
    if (!response || response.ok !== true) return { ok:false, rows:[] };
    var page = await response.json().catch(function () { return null; });
    if (!Array.isArray(page)) return { ok:false, rows:[] };
    rows = rows.concat(page);
    if (page.length < DELIVERY_HISTORY_PAGE) return { ok:true, rows:rows };
  }
  return { ok:false, rows:[], reason:'delivery_history_unbounded' };
}

async function lastDeliveredAcrossHistory(family) {
  var uid = founderUid();
  if (!uid) return { created_at:null, fact_watermark_at:'',
    watermark_error:'delivery_history_identity_unresolved' };
  var digest = family === 'digest';
  var prefix = digest ? 'outreach.digest.sent.' : 'outreach.sent.';
  var stamps = digest ? 'in.(DIGEST,OUTREACH_DELIVERY)'
    : 'in.(OUTREACH,OUTREACH_DELIVERY)';
  var selected = 'id,ham_uid,agent_global,stamp_type,source,created_at,summary,content';
  var delivered = await readDeliveryHistory(
    'ham_uid=eq.' + encodeURIComponent(uid) + '&agent_global=eq.ANEW' +
    '&stamp_type=' + stamps + '&source=like.' + encodeURIComponent(prefix + '*') +
    '&order=created_at.desc&select=' + selected);
  if (!delivered.ok) return { created_at:null, fact_watermark_at:'',
    watermark_error:delivered.reason || 'delivery_history_read_unverified' };
  if (!delivered.rows.length) return null;
  var attempts = await readDeliveryHistory(
    'ham_uid=eq.' + encodeURIComponent(uid) + '&agent_global=eq.ANEW' +
    '&stamp_type=in.(REACH_PROVIDER_ATTEMPT,REACH_VOICE_ATTEMPT)' +
    '&order=created_at.desc&select=' +
      'id,ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,importance,created_at');
  if (!attempts.ok) return Object.assign({}, delivered.rows[0], {
    fact_watermark_at:'', watermark_error:attempts.reason ||
      'delivery_attempt_history_read_unverified'
  });
  var latestAttemptMs = -1;
  for (const row of delivered.rows) {
    var watermark = await resolveDeliveredFactWatermark(row, attempts.rows);
    var millis = watermark ? Date.parse(watermark) : NaN;
    if (!Number.isFinite(millis)) return Object.assign({}, delivered.rows[0], {
      fact_watermark_at:'', watermark_error:'delivery_attempt_history_unverified'
    });
    latestAttemptMs = Math.max(latestAttemptMs, millis);
  }
  return Object.assign({}, delivered.rows[0], {
    fact_watermark_at:new Date(latestAttemptMs).toISOString()
  });
}

// One immediate provider receipt proves only that the provider accepted an
// attempt. Delivery belongs to a later provider/webhook lifecycle receipt.
// Command Center persistence is a separate success state again: it surfaced
// the judgment inside the product, but did not contact the HAM.
function classifyReachTruth(result) {
  result = result || {};
  var delivered = result.delivered === true;
  var surfaced = !delivered && (result.surfaced === true || result.funneled === true);
  var persisted = surfaced && (result.persisted !== false);
  var providerAccepted = !delivered && !surfaced && (result.providerAccepted === true ||
    result.pendingDelivery === true || result.dialed === true || result.sent === true ||
    result.called === true);
  return {
    delivered:delivered,
    surfaced:surfaced,
    persisted:persisted,
    providerAccepted:providerAccepted,
    pendingDelivery:providerAccepted,
    disposition:delivered ? 'sent' : (surfaced ? 'surfaced' :
      (providerAccepted ? 'pending' : 'held'))
  };
}

function isRecipientIdentityFailure(reason) {
  return /(?:^|:)(?:no_contact_for_ham|reach_delivery_target_invalid|recipient_(?:phone_|email_)?identity_unresolved|recipient_ham_mismatch)$/.test(String(reason || ''));
}

async function verifyReachDeliveryOwnership(channel, hamUid, exactTargetValue) {
  var uid = String(hamUid || founderUid() || '').trim().toUpperCase();
  var normalizedChannel = String(channel || '').trim().toLowerCase();
  if (!/^(text|sms|voice|email)$/.test(normalizedChannel)) {
    return { ok:true, deliveryTarget:null, recipientEnvelope:null, targetValue:null };
  }
  if (!uid) return { ok:false, reason:'recipient_identity_unresolved' };
  var kind = normalizedChannel === 'email' ? 'email' : 'phone';
  var targetValue = exactTargetValue || (kind === 'phone' ? founderPhone() : founderEmail());
  if (!targetValue) {
    try {
      var contact = await require('../agents/ham-contact.js').getContact(uid);
      targetValue = contact && contact[kind] || '';
    } catch (eContact) { targetValue = ''; }
  }
  var council = require('./pai.outbound.council.js');
  var canonicalTarget = council.canonicalizeDeliveryTarget({ kind:kind, value:targetValue });
  if (!canonicalTarget) {
    return { ok:false, reason:kind === 'email'
      ? 'recipient_email_identity_unresolved' : 'recipient_identity_unresolved' };
  }
  targetValue = kind === 'email' ? canonicalTarget.value[0] : canonicalTarget.value;
  var recipientEnvelope = null;
  try {
    var identifiers = kind === 'email' ? { email:targetValue } : { phone:targetValue };
    recipientEnvelope = await require('./atmosphere.gate.js').resolveAtmosphere(identifiers);
  } catch (eAtmosphere) { recipientEnvelope = null; }
  if (!recipientEnvelope || !recipientEnvelope.ham_uid) {
    return { ok:false, reason:kind === 'email'
      ? 'recipient_email_identity_unresolved' : 'recipient_identity_unresolved' };
  }
  if (String(recipientEnvelope.ham_uid).trim().toUpperCase() !== uid) {
    return { ok:false, reason:'recipient_ham_mismatch' };
  }
  return { ok:true, deliveryTarget:{ kind:kind, value:targetValue },
    recipientEnvelope:recipientEnvelope, targetValue:targetValue };
}

function applyMessageProviderResult(result, providerResult, receiptField, acceptedReason) {
  var receipt = providerResult && providerResult[receiptField] || null;
  // These call sites are all autonomous REACH/DIGEST edges. A provider ID is
  // only an accepted attempt after its durable intent + provider binding read
  // back exactly; otherwise a later webhook has nothing trustworthy to close.
  var exactAccepted = !!(providerResult && providerResult.ok === true && receipt &&
    providerResult.deliveryTruthReady === true);
  var recoveryAccepted = !!(providerResult && receipt &&
    providerResult.providerAccepted === true && providerResult.providerIntentSource &&
    providerResult.providerAcceptanceRecovery === true);
  var accepted = exactAccepted || recoveryAccepted;
  result.providerAccepted = accepted;
  result.pendingDelivery = accepted;
  result.delivered = false;
  result.sent = false;
  result.send_receipt = receipt;
  if (providerResult) {
    ['provider','providerIntentSource','providerAttemptSource',
      'providerAcceptanceRecovery','providerRecoverySource','providerRecoveryKind',
      'providerRecoveryStatus','providerRecoveryReason'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(providerResult,key)) result[key]=providerResult[key];
    });
    if (providerResult.deliveryTruthReason) {
      result.deliveryTruthReason=providerResult.deliveryTruthReason;
    }
  }
  if (accepted) result.reason = recoveryAccepted
    ? 'provider_accepted_binding_recovery_pending' : acceptedReason;
  return accepted;
}

// ⬡B:core.outreach:GUARD:autonomous_words_commit_through_pai:20260715⬡
// The post-cycle PAI/council owns whether, timing, channel, and the proposed
// exact message. This target-bound finalizer does not re-judge those fields. It
// proves that the same exact bytes are safe for one resolved provider target.
async function commitReachMessage(kind, proposedMessage, facts, channel, options) {
  options = options || {};
  var hamUid = founderUid();
  if (!hamUid || !proposedMessage) return { ok:false, reason:'reach_commit_input_missing' };
  // ATMOSPHERE owns recipient identity. Resolve the exact phone/email and prove
  // it belongs to this HAM before Memory Bank facts enter the final PAI cycle.
  // A contact record is routing data, never authority on its own.
  var ownership = await verifyReachDeliveryOwnership(channel, hamUid);
  if (!ownership.ok) return ownership;
  var deliveryTarget = ownership.deliveryTarget;
  var factRows = (facts || []).slice(0, 12).map(function (fact) {
    return formatReachFact(fact);
  });
  var question = 'Autonomous A\u2019NU ' + String(kind || 'reach')
    + ' event from these exact verified Memory Bank facts:\n'
    + (factRows.join('\n') || '(none)');
  var voiceOpenerRule = /^voice$/i.test(channel || '')
    ? ' This is spoken after the person answers and reused verbatim if they ask why you called. '
      + 'Return one concise first-person purpose statement. Do not ask the recipient a question or direct them to say, repeat, send, call, or do anything in the opener. '
      + 'Do not mention a phone number, authorization mechanics, Memory Bank, journals, proof-writing, '
      + 'provider actions, or anything you are about to do.'
    : '';
  var cycleDecision = options.cycleDecision || null;
  var exactCycleMessage = !!(cycleDecision && cycleDecision.artifactDigest &&
    cycleDecision.councilProof && cycleDecision.decision);
  var prompt = exactCycleMessage
    ? 'Finalize the exact message already committed by A\u2019NU\u2019s post-cycle REACH council for one resolved delivery target. '
      + 'Return the EXACT_MESSAGE byte-for-byte, including whitespace and Unicode. Do not rewrite, trim, prefix, explain, or call any tool.'
      + voiceOpenerRule + '\n\nPOST-CYCLE DECISION ARTIFACT DIGEST:\n'
      + String(cycleDecision.artifactDigest) + '\n\nVERIFIED FACTS:\n'
      + (factRows.join('\n') || '(none)') + '\n\nEXACT_MESSAGE:\n' + String(proposedMessage)
    : 'Finalize one human-facing A\u2019NU message for this autonomous reach event. '
      + 'Use only the verified facts below. Return only the exact message the person should receive. '
      + 'Do not narrate the process, do not call a send/write/deploy tool, and do not add unsupported facts.'
      + voiceOpenerRule + '\n\nVERIFIED FACTS:\n' + (factRows.join('\n') || '(none)')
      + '\n\nREACH PROPOSAL:\n' + String(proposedMessage);
  var requestId = exactCycleMessage
    ? 'outreach.finalize.' + String(cycleDecision.artifactDigest).slice(0,32)
      + '.' + String(channel || 'portal').replace(/[^a-z0-9_-]/gi,'_')
    : 'outreach.' + Date.now() + '.' + require('crypto').randomBytes(6).toString('hex');
  var evidence = (facts || []).slice(0, 8).map(function (fact) {
    return { ham_uid:hamUid, provenance:'memory_bank.exact_ham',
      source:fact.source || null, stamp_type:fact.stamp_type || null,
      summary:String(fact.summary || '').slice(0,500),
      evidence:formatReachFact(fact) };
  });
  if (exactCycleMessage) evidence.unshift({ ham_uid:hamUid,
    provenance:'reach.post_cycle_decision.council_verified',
    source:cycleDecision.source, artifact_digest:cycleDecision.artifactDigest,
    receipt_digest:cycleDecision.councilProof.receipt_digest,
    final_source:cycleDecision.councilProof.final_source });
  evidence = evidence.slice(0, 8);
  try {
    var { runPAI } = require('./tool.loop.js');
    var council = require('./pai.outbound.council.js');
    var identity = { uid:hamUid, request_id:requestId, user_message:question,
      outbound_finalize:true, delivery:{ external:/^(text|sms|voice|email)$/i.test(channel || ''),
        longForm:channel === 'portal' },
      council_context:{ mode:exactCycleMessage?'outreach_exact_cycle_message':'outreach',
        event_kind:String(kind || 'reach'),
        reach_decision_artifact_digest:exactCycleMessage?cycleDecision.artifactDigest:null,
        delivery_target:deliveryTarget,
        verified_evidence:evidence } };
    var result = await runPAI(hamUid, prompt, channel || 'text', identity);
    var expected = { hamUid:hamUid, requestId:requestId, cycleId:result&&result.cycleId,
      question:question, deliberationInput:prompt, answer:result&&result.answer };
    if (deliveryTarget) expected.deliveryTarget = deliveryTarget;
    var committed = council.requireVerifiedCouncilResult(result, expected);
    var proof = committed && committed.ok ? council.compactCouncilProof(result) : null;
    if (!committed || !committed.ok || committed.answer !== result.answer || !proof
        || proof.committed !== true || proof.readback_verified !== true || proof.row_count !== 9) {
      return { ok:false, reason:committed&&committed.reason || 'reach_council_unverified' };
    }
    if (exactCycleMessage && result.answer !== proposedMessage) {
      return { ok:false, reason:'reach_exact_cycle_message_mismatch' };
    }
    if (/^voice$/i.test(channel || '') &&
        !require('./voice.conversation.policy.js')
          .isReusableCallPurposeStatement(result.answer)) {
      return { ok:false, reason:'voice_opener_not_reusable_as_purpose' };
    }
    var committedReach = { ok:true, message:result.answer, councilProof:proof,
      cycleId:result.cycleId, requestId:requestId };
    Object.defineProperty(committedReach, '_councilResult', { enumerable:false, value:result });
    Object.defineProperty(committedReach, '_deliveryOwnership', {
      enumerable:false, value:ownership
    });
    return committedReach;
  } catch (eCommit) {
    return { ok:false, reason:'reach_council_threw:' + eCommit.message };
  }
}

// Last time she reached out — from brain, cross-instance safe.
// ⬡B:core.outreach:FIX:sent_watermark_20260701⬡ Real incident: one urgent drill bead
// produced THREE texts, minutes apart, on the founder's phone — every pass re-read the
// same still-hot fact, judged >=9, and the importance bypass sailed past the gap guard.
// Fix: the SENT outreach is a watermark; only facts strictly NEWER than the last sent
// outreach are ever judged. A fact gets one shot at reaching him, never three.
async function lastOutreach(sentOnly) {
  try {
    if (sentOnly) return await lastDeliveredAcrossHistory('outreach');
    const filter = sentOnly ? '&source=like.outreach.sent.*' : '';
    // An autonomous voice call is pending when the provider accepts the dial.
    // The signed live-exchange route later appends OUTREACH_DELIVERY after a
    // person has spoken and the exact council-authorized answer has completed.
    // Both historical OUTREACH sent rows and that immutable transition own the
    // delivered watermark; pending provider receipts never do.
    const stampFilter = '&stamp_type=eq.OUTREACH';
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + encodeURIComponent(founderUid()) + '&agent_global=eq.ANEW' + stampFilter + filter + '&order=created_at.desc&limit=1&select=ham_uid,agent_global,stamp_type,source,created_at,summary,content', { headers: bh() });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows || !rows[0]) return null;
    return Object.assign({}, rows[0], {
      fact_watermark_at:null
    });
  } catch (e) { return null; }
}

// Provider acceptance is an external attempt, even when the later delivery
// receipt has not arrived yet. Keep that clock separate from lastOutreach(true):
// only confirmed delivery may advance the fact watermark, while both pending
// and delivered OUTREACH truth prevent a second autonomous provider effect.
// The status wrapper is deliberate -- an unreadable attempt clock must hold,
// not look like a fresh HAM with no prior attempt.
async function lastExternalAttempt() {
  try {
    var uid = founderUid();
    if (!uid) return { ok:false, reason:'outreach_attempt_identity_unresolved', row:null };
    var url = _bu() + '/rest/v1/' + _tbl()
      + '?ham_uid=eq.' + encodeURIComponent(uid)
      + '&stamp_type=eq.OUTREACH'
      + '&or=(source.like.outreach.pending.*,source.like.outreach.sent.*)'
      + '&order=created_at.desc&limit=1&select=created_at,source';
    var response = await fetch(url, { headers:bh() });
    if (!response || !response.ok) {
      return { ok:false, reason:'outreach_attempt_read_unverified', row:null };
    }
    var rows = await response.json();
    if (!Array.isArray(rows)) {
      return { ok:false, reason:'outreach_attempt_read_unverified', row:null };
    }
    return { ok:true, row:rows[0] || null };
  } catch (e) {
    return { ok:false, reason:'outreach_attempt_read_unverified', row:null };
  }
}

const HARD_EXTERNAL_ATTEMPT_FLOOR_MS = 60 * 60 * 1000;
function externalAttemptFloorHeld(lastAttempt, nowMs) {
  if (!lastAttempt || !lastAttempt.created_at) return false;
  var attemptedAt = new Date(lastAttempt.created_at).getTime();
  if (!Number.isFinite(attemptedAt)) return true;
  return ((nowMs == null ? Date.now() : nowMs) - attemptedAt)
    < HARD_EXTERNAL_ATTEMPT_FLOOR_MS;
}

function externalAttemptReservationSource(hamUid) {
  return 'reach.outreach.external_attempt:' + String(hamUid || '').trim().toUpperCase();
}

// The durable OUTREACH pending/sent read above is the cheap historical clock.
// This lease is the atomic provider-edge arbiter: every process and every fact
// set for one HAM competes for the same row, and Postgres admits one winner for
// the rolling hour. The owner is intentionally never released here. Once this
// seam is crossed, a crash, ambiguous provider response, or failed OUTREACH
// audit must still suppress a second external effect.
async function reserveExternalAttempt() {
  var uid = founderUid();
  if (!uid) return { ok:false, held:false,
    reason:'outreach_attempt_identity_unresolved' };
  var source = externalAttemptReservationSource(uid);
  var claimant = source + ':' + crypto.randomUUID();
  var claims;
  try {
    claims = require('./claim_lock.js');
    var won = await claims.claimTask(source, claimant,
      HARD_EXTERNAL_ATTEMPT_FLOOR_MS);
    if (won) return { ok:true, reserved:true, source:source,claimant:claimant,
      leaseMs:HARD_EXTERNAL_ATTEMPT_FLOOR_MS };
    if (typeof claims.inspectClaim !== 'function') {
      return { ok:false, held:false,
        reason:'outreach_attempt_reservation_unverified', source:source };
    }
    var existing = await claims.inspectClaim(source);
    var expiresAt = existing && new Date(existing.lease_expires_at).getTime();
    if (existing && existing.claimed_by === claimant &&
        Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return { ok:true, reserved:true, recovered:true, source:source,claimant:claimant,
        leaseMs:HARD_EXTERNAL_ATTEMPT_FLOOR_MS };
    }
    if (existing && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return { ok:false, held:true, reason:'held_hard_rate_cap', source:source };
    }
    return { ok:false, held:false,
      reason:'outreach_attempt_reservation_unverified', source:source };
  } catch (e) {
    return { ok:false, held:false,
      reason:'outreach_attempt_reservation_unverified', source:source };
  }
}

// ⬡B:core.outreach:FIX:same_alert_called_every_tick_real_incident:20260706⬡
// Real, live, severe incident: the importance>=9 override exists to let one
// genuinely new urgent thing punch through the quiet-gap once. Once the
// outreach check stopped being cycle-blocking (tonight's own fire-and-forget
// fix) it started running every real tick again, and the SAME unresolved
// fact (admin.thelegacyinstitute security alert) kept scoring 9 every time,
// so it called and texted the founder three times in six minutes, ten calls
// by his own count. The override was never meant to mean "call again every
// three minutes until the underlying thing gets manually resolved." Real
// fix: if the new message is substantially the SAME alert as the last one
// actually sent, and that send was recent, hold even at importance>=9 --
// only genuinely new information, or real time passing, earns a repeat.
function sameAlertRecently(lastSentSummary, newMessage, withinMs) {
  if (!lastSentSummary || !newMessage) return false;
  var norm = function (s) { return (s || '').toLowerCase().match(/[a-z0-9@._-]{4,}/g) || []; };
  var a = new Set(norm(lastSentSummary));
  var b = norm(newMessage);
  if (!a.size || !b.length) return false;
  var shared = b.filter(function (w) { return a.has(w); }).length;
  return (shared / b.length) > 0.4;
}

// Real facts worth judging: high-importance beads since the last look.
async function gatherFacts(sinceIso, throughIso) {
  const uid = founderUid();
  const url = _bu() + '/rest/v1/' + _tbl() + ''
    + '?ham_uid=eq.' + encodeURIComponent(uid)
    + '&importance=gte.8'
    + '&created_at=gte.' + encodeURIComponent(sinceIso)
    + (throughIso ? '&created_at=lte.' + encodeURIComponent(throughIso) : '')
    // ⬡B:core.outreach:FIX:three_ray_chatter_leaking_into_real_alerts:20260706⬡
    // Real, live, severe incident: 139+ missed calls. Same disease as the
    // 20260703 fix right below, a stamp_type that came into heavy use after
    // that exclusion list was written and was never added to it. CHATTER is
    // the inter-Claude-session coordination stream (Three Ray) -- every
    // high-importance sync message between chats, including CLAIR's own
    // rally stamps tonight, has been eligible to become "a fact worth
    // calling the founder about." ROADMAP, MILESTONE, and DIRECTIVE are the
    // same category: real, but meant for the build/other chats to read, not
    // a founder-facing alert. Extending the exact pattern already decided
    // and proven on 20260703, not deciding a new one.
    + '&stamp_type=not.in.(OUTREACH,OUTREACH_DELIVERY,OUTREACH_FAILURE,LOGFUL,MINUTES,AIR_START,AIR_CYCLE,CYCLE_LOCK,RESULT,GAP_FLAGS,TASK,TASK_DONE,TASK_INCOMPLETE,GIVE_UP_TRY,SEAL,KEY_BACKUP,LESSON,CHATTER,ROADMAP,MILESTONE,DIRECTIVE,DECISION,EXIT_DECISION,CYCLE_STEP,PAI_STAGE,REQUEST_CLAIM,CYCLE_RECEIPT,RESPEC,CONTRIBUTION,ENRICHED,DIGEST,UNRESOLVED_INBOUND,REACH_AUDIT,REACH_CANDIDATE,REACH_CANDIDATE_DONE,REACH_CYCLE_DECISION,REACH_PROVIDER_INTENT,REACH_PROVIDER_ATTEMPT,REACH_PROVIDER_ORPHAN,REACH_PROVIDER_FINALIZATION,REACH_VOICE_ATTEMPT,RECOMMENDATION_RULED)'
    // ⬡B:core.outreach:FIX:exit_decision_ops_chatter_leaking_into_reach:20260712⬡
    // Same recurring disease, caught live by the founder: everything reaching him was
    // importance 9. Cause was NOT the judge inflating (its rubric is fine) -- it was
    // OVERSEER EXIT_DECISION beads (25 in 6h, confidence 0.20, raw advisor-status like
    // "[GMG] Acknowledged", "[BDIF] STATUS") flooding gatherFacts as imp8+ "facts." Those
    // are internal Overseer routing chatter with their OWN dedicated consumer
    // (core/reach/screen.consumer.js reads EXIT_DECISION directly), so scraping them here
    // is pure redundant leakage; three-ray already classifies EXIT_DECISION/CYCLE_STEP/
    // CONTRIBUTION/ENRICHED/DIGEST/UNRESOLVED_INBOUND as ops. Excluded, same mechanism as
    // the CHATTER and RESULT fixes above. The Overseer's real reach path is untouched.
    // \u2b21B:core.outreach:FIX:build_narration_excluded_from_reach:20260703\u2b21
    // Live incident 20260702-03, founder screenshots: unprompted texts on his real
    // phone reading like build diary entries ("This code enables the dynamic
    // adjustment of scenario triggers...", "It enables the system to generate
    // human-like responses..."). Cause: RESULT beads (build reflections, CANON
    // passes at importance 8) qualified as "facts worth judging," and the composer
    // faithfully wrote him a sentence about them. Internal build chatter -- RESULT,
    // GAP_FLAGS, task-state beads, seals, lessons, key backups -- is now excluded
    // at the source query, same mechanism that already excluded MINUTES. What
    // remains reachable: genuinely founder-facing beads (ALERT, MILESTONE, DRAFT,
    // OUTREACH-worthy findings) at importance >= 8. Internal chatter stays internal.
    + '&order=created_at.desc&limit=12&select=id,source,stamp_type,summary,content,created_at,importance';
  try {
    const r = await fetch(url, { headers: bh() });
    if (!r.ok) throw new Error('reach_fact_read_failed:' + r.status);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error('reach_fact_read_invalid');
    return rows;
  } catch (e) {
    if (/^reach_fact_read_/.test(String(e&&e.message||''))) throw e;
    throw new Error('reach_fact_read_failed:network');
  }
}

function safeLearningFact(row){
  if(!row||!row.stamp_type)return null;
  var stamp=String(row.stamp_type).toUpperCase();
  var content='';
  if(stamp==='CORRECTION'){
    var raw=row.content;
    if(raw&&typeof raw!=='string')try{raw=JSON.stringify(raw);}catch(eRaw){raw='';}
    content=String(raw||'').slice(0);
  }
  else{
    var parsed={};try{parsed=JSON.parse(row.content||'{}');}catch(e){}
    content=JSON.stringify({status:parsed.status||null,channel:parsed.channel||null,
      reason:parsed.reason||null,delivered:parsed.delivered===true,
      surfaced:parsed.surfaced===true,providerAccepted:parsed.providerAccepted===true});
  }
  return{id:row.id,source:row.source,stamp_type:stamp,
    summary:String(row.summary||'').slice(0,500),content:content,
    created_at:row.created_at,importance:Number(row.importance)||0};
}

function exactObjectKeys(value,keys){
  return !!(value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).sort().join(',')===keys.slice().sort().join(','));
}

function sha256(value){
  return crypto.createHash('sha256').update(String(value||''),'utf8').digest('hex');
}

// Feedback is founder-authenticated evidence about a prior, already committed
// REACH policy. Re-validate its complete stored shape and the decision-source
// digest linkage before allowing even a bounded projection into a later PAI
// council. It remains evidence only; cycle.decision is still the sole policy
// authority for the new cycle.
function safeDecisionFeedbackFact(row,hamUid){
  var uid=String(hamUid||'').trim().toUpperCase();
  if(!row||row.ham_uid!==uid||row.agent_global!=='REACH'||
      row.stamp_type!=='REACH_DECISION_FEEDBACK'||Number(row.importance)!==7||
      row.acl_stamp!=='⬡B:reach.decision_feedback:REACH_DECISION_FEEDBACK:immutable:20260717⬡')return null;
  var content;try{content=typeof row.content==='string'?JSON.parse(row.content):row.content;}
  catch(e){return null;}
  if(!exactObjectKeys(content,['version','feedback_id','feedback_digest','decision','feedback','authority'])||
      content.version!=='anew.reach.command-center-feedback.v1'||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(String(content.feedback_id||''))||
      !/^[a-f0-9]{64}$/.test(String(content.feedback_digest||'')))return null;
  var decision=content.decision,feedback=content.feedback,authority=content.authority;
  if(!exactObjectKeys(decision,['source','source_digest','evidence_digest','facts_digest',
      'policy_digest','council_final_source','council_receipt_digest','observed'])||
      !exactObjectKeys(feedback,['kind','desired_when','desired_channel','reason'])||
      !exactObjectKeys(authority,['surface','authenticated_ham_uid',
        'exact_ham_session_required','decision_readback_verified'])||
      !exactObjectKeys(decision.observed,['reach','when','channel','importance']))return null;
  var hex=/^[a-f0-9]{64}$/;
  var prefix='reach.cycle_decision.'+uid+'.'+String(decision.evidence_digest||'')+'.';
  if(typeof decision.source!=='string'||decision.source.length>500||
      !decision.source.startsWith(prefix)||
      !hex.test(String(decision.source_digest||''))||
      decision.source_digest!==sha256(decision.source)||
      !hex.test(String(decision.evidence_digest||''))||
      !hex.test(String(decision.facts_digest||''))||
      !hex.test(String(decision.policy_digest||''))||
      decision.source.slice(prefix.length)!==decision.policy_digest||
      typeof decision.council_final_source!=='string'||
      !decision.council_final_source||decision.council_final_source.length>500||
      !hex.test(String(decision.council_receipt_digest||'')))return null;
  var observed=decision.observed;
  if(typeof observed.reach!=='boolean'||
      !/^(NOW|HOLD|DEFER)$/.test(String(observed.when||''))||
      !/^(voice|text|email|command_center|none)$/.test(String(observed.channel||''))||
      !Number.isInteger(observed.importance)||observed.importance<0||observed.importance>10||
      (observed.when==='NOW'&&observed.channel==='none')||
      (observed.when!=='NOW'&&observed.channel!=='none'))return null;
  if(!/^(correction|outcome)$/.test(String(feedback.kind||''))||
      !/^(NOW|HOLD|DEFER)$/.test(String(feedback.desired_when||''))||
      !/^(voice|text|email|command_center|none)$/.test(String(feedback.desired_channel||''))||
      (feedback.desired_when==='NOW'&&feedback.desired_channel==='none')||
      (feedback.desired_when!=='NOW'&&feedback.desired_channel!=='none')||
      typeof feedback.reason!=='string'||feedback.reason.length<3||feedback.reason.length>500||
      /[\u0000-\u001f\u007f]/.test(feedback.reason)||
      authority.surface!=='command_center'||authority.authenticated_ham_uid!==uid||
      authority.exact_ham_session_required!==true||
      authority.decision_readback_verified!==true)return null;
  var digestBasis={version:content.version,feedback_id:content.feedback_id,
    decision:decision,feedback:feedback,authority:authority};
  if(content.feedback_digest!==sha256(JSON.stringify(digestBasis)))return null;
  var expectedSource='reach.decision_feedback.'+uid+'.'+
    sha256(JSON.stringify([uid,content.feedback_id]));
  if(row.source!==expectedSource)return null;
  var projection={feedback_digest:content.feedback_digest,
    prior_decision:{source_digest:decision.source_digest,
      evidence_digest:decision.evidence_digest,facts_digest:decision.facts_digest,
      policy_digest:decision.policy_digest,observed:observed},
    feedback:{kind:feedback.kind,desired_when:feedback.desired_when,
      desired_channel:feedback.desired_channel,reason:feedback.reason},
    authority:{surface:'command_center',exact_ham_session_required:true,
      decision_readback_verified:true}};
  return{id:row.id||row.source,source:row.source,
    stamp_type:'REACH_DECISION_FEEDBACK',
    summary:'Verified Command Center feedback on a prior REACH decision',
    content:JSON.stringify(projection).slice(0),created_at:row.created_at,
    importance:7};
}

async function verifiedDecisionFeedbackFact(row,hamUid){
  var fact=safeDecisionFeedbackFact(row,hamUid);
  if(!fact)return null;
  var content;try{content=typeof row.content==='string'?JSON.parse(row.content):row.content;}
  catch(e){return null;}
  var source=content.decision.source;
  var url=_bu()+'/rest/v1/'+_tbl()+'?ham_uid=eq.'+encodeURIComponent(hamUid)+
    '&agent_global=eq.REACH&stamp_type=eq.REACH_CYCLE_DECISION&source=eq.'+
    encodeURIComponent(source)+'&limit=2&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at';
  var response=await fetch(url,{headers:bh()}).catch(function(){return null;});
  if(!response||!response.ok)throw new Error('reach_feedback_decision_read_failed');
  var rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('reach_feedback_decision_read_invalid');
  if(rows.length!==1)return null;
  var decision=require('./reach/lifecycle.view.js')._test
    .decisionCandidate(rows[0],hamUid);
  if(!decision||decision.decisionSource!==source||
      decision.evidenceDigest!==content.decision.evidence_digest||
      decision.factsDigest!==content.decision.facts_digest||
      decision.councilFinalSource!==content.decision.council_final_source||
      decision.councilReceiptDigest!==content.decision.council_receipt_digest)return null;
  var prefix='reach.cycle_decision.'+hamUid+'.'+decision.evidenceDigest+'.';
  if(!source.startsWith(prefix)||source.slice(prefix.length)!==content.decision.policy_digest||
      decision.reach!==content.decision.observed.reach||
      decision.when!==content.decision.observed.when||
      decision.channel!==content.decision.observed.channel||
      decision.importance!==content.decision.observed.importance)return null;
  return fact;
}

function recentLearningFloor(){
  return new Date(Date.now()-30*24*60*60*1000).toISOString();
}

// Corrections are intentionally importance 6, below the urgent-fact floor.
// Read them and prior terminal outcomes through their own exact-HAM lane so the
// next PAI policy council learns before deciding, never by mutating its answer
// after commitment.
async function gatherReachLearning(sinceIso,throughIso){
  const uid=founderUid();
  const url=_bu()+'/rest/v1/'+_tbl()+'?ham_uid=eq.'+encodeURIComponent(uid)+
    '&stamp_type=in.(CORRECTION,REACH_CANDIDATE_DONE,OUTREACH_DELIVERY,OUTREACH_FAILURE)'+
    '&created_at=gte.'+encodeURIComponent(recentLearningFloor())+
    (throughIso?'&created_at=lte.'+encodeURIComponent(throughIso):'')+
    '&order=created_at.desc&limit=12&select=id,source,stamp_type,summary,content,created_at,importance';
  const response=await fetch(url,{headers:bh()}).catch(function(){return null;});
  if(!response||!response.ok)throw new Error('reach_learning_read_failed');
  const rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('reach_learning_read_invalid');
  return rows.map(safeLearningFact).filter(Boolean);
}

async function gatherReachDecisionFeedback(throughIso){
  const uid=founderUid();
  const url=_bu()+'/rest/v1/'+_tbl()+'?ham_uid=eq.'+encodeURIComponent(uid)+
    '&agent_global=eq.REACH&stamp_type=eq.REACH_DECISION_FEEDBACK'+
    '&created_at=gte.'+encodeURIComponent(recentLearningFloor())+
    (throughIso?'&created_at=lte.'+encodeURIComponent(throughIso):'')+
    '&order=created_at.desc&limit=6&select=id,ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,created_at,importance';
  const response=await fetch(url,{headers:bh()}).catch(function(){return null;});
  if(!response||!response.ok)throw new Error('reach_feedback_read_failed');
  const rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('reach_feedback_read_invalid');
  const facts=await Promise.all(rows.map(function(row){
    return verifiedDecisionFeedbackFact(row,uid);
  }));
  return facts.filter(Boolean);
}

async function gatherDecisionFacts(sinceIso,throughIso){
  const pair=await Promise.all([gatherFacts(sinceIso,throughIso),
    gatherReachLearning(sinceIso,throughIso),
    gatherReachDecisionFeedback(throughIso)]);
  const seen=new Set();
  return pair[2].slice(0,4).concat(pair[1].slice(0,4),pair[0]).filter(function(fact){
    const key=String(fact.id||fact.source||'');
    if(!key||seen.has(key))return false;seen.add(key);return true;
  }).slice(0,12);
}

// ⬡B:core.outreach:WIRE:seer_advisor_handshake:20260711⬡
// THE TIGHT HANDSHAKE. Independent thinking stations (starting with the SEER
// advisor) submit REACH_RECOMMENDATION beads BACKWARD to this cycle. They are
// scoped to the LEARNER's uid, not the founder's, and sit below the importance
// floor gatherFacts uses -- deliberately, so a friendly nudge can never
// masquerade as an urgent founder alert. But A'NEW must still SEE them and
// decide. This gatherer pulls pending recommendations explicitly and hands
// them to the judge as first-class candidates. A'NEW remains the only door to
// the human: it can promote, downgrade, reword, or ignore any recommendation.
// The station recommended; the vowel decides. A recommendation is marked acted
// once A'NEW rules on it, so it is considered exactly once.
async function gatherReachRecommendations() {
  try {
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + ''
      + '?stamp_type=eq.REACH_RECOMMENDATION'
      + '&ham_uid=eq.' + encodeURIComponent(founderUid())
      + '&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      + '&order=created_at.desc&limit=20&select=ham_uid,source,summary,content,created_at,importance',
      { headers: bh() });
    if (!r.ok) return [];
    const raw = await r.json();
    const pending = [];
    for (const rec of raw) {
      // has A'NEW already ruled on this exact recommendation?
      const ruled = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.RECOMMENDATION_RULED&source=eq.'
        + encodeURIComponent('anew.ruled.' + rec.source) + '&limit=1&select=source', { headers: bh() })
        .then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; });
      if (!ruled.length) pending.push(rec);
    }
    return pending;
  } catch (e) { return []; }
}

// Mark a recommendation as ruled on, so it is never re-judged. Records A'NEW's
// verdict for the audit trail and for the station to learn from.
async function ruleOnRecommendation(rec, verdict) {
  try {
    await fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST',
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Profile': _schema(), 'Accept-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ham_uid: rec.ham_uid, agent_global: 'ANEW', stamp_type: 'RECOMMENDATION_RULED',
        source: 'anew.ruled.' + rec.source, summary: 'A\u2019NEW ruled ' + verdict + ' on SEER advisor recommendation for learner ' + rec.ham_uid + '.',
        content: JSON.stringify({ recommendation: rec.source, verdict: verdict, learner: rec.ham_uid }), importance: 4 }) });
  } catch (e) { /* audit-only, never blocks the decision */ }
}

// The summary is an index label; the content is the fact. REACH previously handed
// the judge only labels, so a durable ALERT whose content said "call him now" was
// reduced to its generic title and could be misclassified as routine work. Keep the
// bounded 12-fact window and a bounded detail excerpt, but give judgment the actual
// evidence it is supposed to judge.
function formatReachFact(fact) {
  var summary = String(fact && fact.summary || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  var rawContent = fact && fact.content;
  if (rawContent && typeof rawContent !== 'string') {
    try { rawContent = JSON.stringify(rawContent); } catch (e) { rawContent = ''; }
  }
  var detail = String(rawContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  var line = '[' + String(fact && fact.stamp_type || 'FACT') + ' imp'
    + Number(fact && fact.importance || 0) + '] ' + summary;
  if (detail && detail !== summary) line += ' | DETAIL: ' + detail;
  return line;
}

function explicitCallRequestFact(facts) {
  return (facts || []).find(function (fact) {
    if (String(fact && fact.stamp_type || '').toUpperCase() !== 'ALERT' ||
        Number(fact && fact.importance || 0) < 8) return false;
    var text = String(fact.summary || '') + ' ' + String(fact.content || '');
    return /\b(call|ring|phone) (?:me|you|him|her)\b|\bgiv(?:e|ing) (?:me|you|him|her) (?:\w+ ){0,3}call\b|\bcan you call\b/i.test(text);
  }) || null;
}

// Her judgment + her voice, on her real Memory Bank. Returns { reach, importance, message, reason }.
async function judgeAndCompose(facts, gapHeld) {
  if (!GROQ) return { reach: false, reason: 'no_groq_key' };
  const fcw = await buildMemoryBank(founderUid(), 'outreach', 'autonomous outreach check');
  const sys = (fcw && fcw.ok ? fcw.system_prompt : 'You are A\u2019NU, a warm and direct life assistant.')
    + '\n\nYou are deciding, on your own, whether anything below genuinely merits texting your founder right now.'
    + '\nHold the bar high: reach only for real progress, real problems, or something he would actually want to know now.'
    + (gapHeld ? '\nYou reached him recently. Only importance 9 or higher justifies reaching again this soon.' : '')
    + '\nSTAY GROUNDED: the message may only state what the facts below actually say. Never invent capabilities,'
    + ' behavior, or specifics the facts do not mention -- a fact saying a file was committed is not license to'
    + ' describe what that file supposedly does unless the fact itself says so. When unsure what something does,'
    + ' say that it was built, not what it accomplishes.'
    + '\nDELIVERY TARGETS ARE PRIVATE PROVIDER STATE: never put a phone number or email address in MESSAGE.'
    + ' If the right channel is voice, MESSAGE is what you say after the person answers, never a promise that you'
    + ' are about to call and never an instruction to call a number.'
    // \u2b21B:core.outreach:FIX:importance_score_had_zero_real_calibration:20260708\u2b21
    // Real, live, severe incident, 4:20 AM: the same routine backlog kept
    // scoring importance 9+ and firing every few minutes because nothing
    // ever told the model what a 9 actually means versus routine content --
    // it was free-floating, ungrounded, and self-inflating to justify
    // whatever REACH decision it had already made. Real fix: an explicit,
    // concrete anchor with the exact false-positive pattern named directly,
    // so "a pile of pending drafts" can never again read as urgent no
    // matter how large the pile gets.
    + '\nIMPORTANCE CALIBRATION, read carefully before scoring: 9-10 is reserved for something genuinely'
    + ' urgent right now -- a real deadline in the next few hours, a real security exposure, something'
    + ' actively breaking. 4-6 is routine, worth mentioning in a normal update, never worth waking anyone or'
    + ' calling. 1-3 is background noise. A pile of pending drafts, however many there are, however many orgs'
    + ' they span, is NEVER above a 5 on its own -- more pending drafts is not more urgent, it is just more'
    + ' pending. Do not inflate the number to justify a REACH: YES you already decided on; score the actual'
    + ' urgency of the content, independently, every time.'
    + '\nAnswer in EXACTLY this shape:\nREACH: YES or REACH: NO\nIMPORTANCE: 1-10\nREASON: one sentence\nMESSAGE: the exact text to send, in your own voice, as long as the real substance actually requires, or NONE';
  const user = facts.length
    ? 'Recent facts from your world:\n' + facts.map(formatReachFact).join('\n')
    : 'No high-importance facts in the window.';
  try {
    let out = await callGLM(sys, user, 1200);
    if (!out) out = await callOrnith(sys, user, 1200);
    if (!out) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: (process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b'), messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 3000, temperature: 0.4 })
      });
      if (!r.ok) return { reach: false, reason: 'groq_http_' + r.status };
      const d = await r.json();
      out = (d.choices && d.choices[0] && d.choices[0].message.content) || '';
    }
    const reach = /REACH:\s*YES/i.test(out);
    const impM = out.match(/IMPORTANCE:\s*(\d+)/i);
    const reasonM = out.match(/REASON:\s*(.+)/i);
    const msgM = out.match(/MESSAGE:\s*([\s\S]+)/i);
    let message = msgM ? msgM[1].trim() : '';
    if (/^NONE$/i.test(message)) message = '';
    // \u2b21B:core.outreach:FIX:grounding_check_before_send:20260702\u2b21
    // Live incident: the founder screenshotted a text claiming a committed file
    // "enables the system to automatically review and grade feature code written
    // by specific team members" -- the real source fact was just "committed a new
    // file called master-advisor.js... [UNWIRED]." The compose step invented
    // capability the facts never stated, and nothing checked it before send. Same
    // missing-gate shape as messages.index.js's old stub SHADOW, different file.
    // One real LLM call, same pattern already proven there: does this message
    // stay inside what the facts actually say.
    if (reach && message && GROQ) {
      try {
        const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: (process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b'), max_tokens: 60, temperature: 0, messages: [
            { role: 'system', content: 'Compare a drafted text message against the facts it claims to summarize. Reply EXACTLY: OK or FAIL, then a reason. FAIL only if the message states a specific capability, behavior, or detail that the facts do not support -- not for reasonable paraphrase or warmth.' },
            { role: 'user', content: 'FACTS:\n' + user + '\n\nDRAFTED MESSAGE:\n' + message }
          ] })
        });
        const gd = gr.ok ? await gr.json() : null;
        const gout = gd?.choices?.[0]?.message?.content?.trim() || '';
        if (/^FAIL/i.test(gout)) {
          return { reach: false, reason: 'grounding_check_failed: ' + gout.replace(/^FAIL\s*/i, '').slice(0, 150) };
        }
      } catch (eGround) { /* check failure never blocks -- fail open, matches every other gate tonight */ }
    }
    return { reach, importance: impM ? parseInt(impM[1], 10) : 0,
      reason: reasonM ? reasonM[1].trim() : '', message };
  } catch (e) { return { reach: false, reason: 'groq_threw:' + e.message }; }
}

async function stampOutreach(result) {
  try {
    var truth = classifyReachTruth(result);
    // ⬡B:core.outreach:WIRE:reach_bead_carries_lineage:20260712⬡
    // Founder doctrine: the CLAIR command center shows LINEAGE on every message -- who
    // ultimately decided, read backwards from A'NU to A'NEW to the cycle. The lineage
    // system existed (core/lineage.js) but beads never carried it, so the view had
    // nothing to show. Every reach now carries its full lineage in its content.
    var lineage = {
      delivered_by: 'A\u2019NU (' + (result.proposedChannel || 'held') + ')',
      channel_decided_by:'A\u2019NU committed REACH policy PAI',
      judged_by:'A\u2019NU committed REACH policy PAI',
      chain:['provider or Command Center','target-bound artifact council',
        'REACH policy PAI','originating PAI cycle'],
      why: (result.proposedWhy || result.reason || '').slice(0, 200),
      channel: result.proposedChannel,
      importance: result.importance,
      fired: truth.providerAccepted || truth.delivered,
      surfaced: truth.surfaced,
      at: Date.now()
    };
    var delivered = truth.delivered;
    var pending = truth.providerAccepted;
    var surfaced = truth.surfaced;
    var disposition = truth.disposition;
    var withLineage = Object.assign({}, result, truth, {
      sent:truth.delivered, lineage:lineage
    });
    var stampKey = String(result.requestId || '').replace(/[^A-Za-z0-9._:-]/g, '');
    if (!stampKey) stampKey = crypto.createHash('sha256').update(JSON.stringify({
      reason:result.reason || '', factIds:result.factIds || [],
      facts_count:result.facts_count || 0, sent:!!result.sent,
      funneled:!!result.funneled, judgment:result.judgment || null
    }), 'utf8').digest('hex');
    var source = 'outreach.' + disposition + '.' + stampKey;
    var exactContent = JSON.stringify(withLineage);
    var payload = {
      ham_uid: founderUid(), agent_global: 'ANEW', stamp_type: 'OUTREACH',
      acl_stamp: '\u2b21B:core.outreach:OUTREACH:' + disposition + ':' + ymd() + '\u2b21',
      source: source,
      summary: '[OUTREACH] ' + (delivered
        ? 'reached founder via ' + (result.proposedChannel || '') + ', '
        : surfaced ? 'surfaced and persisted in Command Center, not delivered, '
          : pending ? 'provider accepted, delivery unconfirmed, ' : 'held, ') +
        (result.reason || '').slice(0, 110),
      content: exactContent,
      importance: delivered ? 8 : (surfaced ? 5 : (pending ? 5 : 3))
    };
    var response = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST',
      headers: Object.assign({}, bh(), { 'Content-Profile': _schema(),
        'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(payload)
    });
    var rows = response && response.ok
      ? await response.json().catch(function(){return null;}) : null;
    if (!response || !response.ok || !Array.isArray(rows) || rows.length !== 1 ||
        rows[0].source !== source || rows[0].ham_uid !== founderUid() ||
        rows[0].stamp_type !== 'OUTREACH' || String(rows[0].content) !== exactContent) {
      return { ok:false, reason:'outreach_stamp_unverified', source:source };
    }
    return { ok:true, source:source, row:rows[0] };
  } catch (e) { return { ok:false, reason:'outreach_stamp_unverified' }; }
}

function factDeliveryKeys(facts) {
  return (facts || []).map(function(fact) {
    return String(fact.id || fact.source || crypto.createHash('sha256').update(JSON.stringify({
      stamp_type:fact.stamp_type || '', summary:fact.summary || '',
      created_at:fact.created_at || ''
    }), 'utf8').digest('hex'));
  }).sort();
}

async function claimOutreachDelivery(kind, facts) {
  var keys = factDeliveryKeys(facts);
  var digest = crypto.createHash('sha256').update(JSON.stringify({
    ham_uid:founderUid(), kind:String(kind), facts:keys
  }), 'utf8').digest('hex');
  var source = 'outreach_delivery:' + String(kind) + ':' + founderUid() + ':' + digest;
  var claimant = source + ':' + crypto.randomUUID();
  try {
    var won = await require('./claim_lock.js').claimTask(source, claimant,
      100 * 365 * 24 * 60 * 60 * 1000);
    return won ? { ok:true, source:source, claimant:claimant,
      digest:digest, factIds:keys }
      : { ok:false, reason:'outreach_delivery_claim_denied', source:source,
        digest:digest, factIds:keys };
  } catch (e) {
    return { ok:false, reason:'outreach_delivery_claim_unverified', source:source,
      digest:digest, factIds:keys };
  }
}

async function releaseOwnedReachClaim(claim){
  if(!claim||!claim.source||!claim.claimant)return false;
  try{return await require('./claim_lock.js')
    .releaseTaskIfOwned(claim.source,claim.claimant);}
  catch(e){return false;}
}

function definitiveProviderPreflightFailure(reason){
  return /^(?:provider_not_configured|no_text_channel_configured|autonomous_text_terminal_provider_unavailable|provider_truth_store_unavailable|nylas_terminal_webhook_unready|no_nylas_config_for_world:|email_world_unresolved|REACH_SEND_MODE is |kill_switch_(?:active|unavailable|uncertain|unverified)|recipient_|email_delivery_target_unverified|approved_email_(?:artifact_invalid|pam_hold|pam_uncertain)|voice_(?:provider|preflight|session_bind|autonomous_attempt|handoff_authorization)[a-z0-9_:-]*)/i.test(String(reason||''));
}

function ambiguousProviderOutcome(reason){
  return /^(?:provider_(?:unverified|uncertain)|(?:voice|text|email)_delivery_unverified|voice_outreach_pending_not_visible)$/i
    .test(String(reason||''));
}

function availabilityReason(required){
  for(var i=0;i<required.length;i++)if(required[i][0]!==true)return required[i][1];
  return'available';
}

// Target-free capability truth for the policy council. Only booleans and a
// bounded reason enter evidence; phone/email/grant/key bytes remain behind the
// later exact-target resolver. Sandbox/default Nylas applications are not
// advertised because autonomous terminal tracking is production-only.
async function buildReachChannelAvailability(hamUid,contact,world){
  var uid=String(hamUid||'').trim().toUpperCase();
  contact=contact||{};
  var phonePresent=typeof contact.phone==='string'&&contact.phone.trim().length>0;
  var emailPresent=typeof contact.email==='string'&&contact.email.trim().length>0;
  var voiceProvider=String(process.env.PIPECAT_CALL_URL||'').trim().length>0;
  var textProvider=String(process.env.BLOOIO_API_KEY||'').trim().length>0;
  var voiceAvailable=phonePresent&&voiceProvider;
  var textAvailable=phonePresent&&textProvider;
  var normalizedWorld=typeof world==='string'?world.trim().toLowerCase():'';
  var worldResolved=!!normalizedWorld;
  var sender=null;
  try{
    var iman=require('../reach/iman.js');
    sender=typeof iman.resolveAnuProductionSender==='function'
      ?iman.resolveAnuProductionSender():null;
  }catch(eIman){}
  // REACH is A'NU speaking to a HAM. The HAM world remains part of policy/PAM
  // evidence, but it cannot choose the sender mailbox; GMG and other founder
  // worlds may legitimately be sandbox grants. The canonical A'NU sender helper
  // proves its grant and key belong to the production Nylas application.
  var productionApplication=!!(sender&&sender.ok===true);
  var providerConfigured=!!(productionApplication&&sender.grant&&sender.key);
  var sendModeLive=(process.env.REACH_SEND_MODE||'PAUSED')==='LIVE';
  var terminalTruthReady=false;
  var emailReadinessReason=availabilityReason([
    [emailPresent,'email_target_absent'],[worldResolved,'email_world_unresolved'],
    [productionApplication,'nylas_production_application_required'],
    [providerConfigured,'nylas_production_config_missing'],
    [sendModeLive,'reach_send_mode_not_live']]);
  if(emailPresent&&worldResolved&&productionApplication&&providerConfigured&&sendModeLive){
    var ready;
    try{ready=await require('../reach/iman.webhook.js').requireReadyForKey(sender.key);}
    catch(eReady){ready=null;}
    terminalTruthReady=!!(ready&&ready.ok===true);
    emailReadinessReason=terminalTruthReady?'available':
      String(ready&&ready.reason||'nylas_terminal_truth_unverified').slice(0,120);
  }
  var emailAvailable=emailPresent&&worldResolved&&productionApplication&&
    providerConfigured&&sendModeLive&&terminalTruthReady;
  return{version:1,ham_uid:uid,command_center:{available:true},
    voice:{target_present:phonePresent,provider_configured:voiceProvider,
      available:voiceAvailable,reason:voiceAvailable?'available':
        phonePresent?'pipecat_not_configured':'phone_target_absent'},
    text:{target_present:phonePresent,provider_configured:textProvider,
      available:textAvailable,reason:textAvailable?'available':
        phonePresent?'blooio_not_configured':'phone_target_absent'},
    email:{target_present:emailPresent,world_resolved:worldResolved,
      production_application:productionApplication,
      provider_configured:providerConfigured,send_mode_live:sendModeLive,
      terminal_truth_ready:terminalTruthReady,available:emailAvailable,
      reason:emailReadinessReason}};
}

// One full autonomous pass. Exported so a route can force it on demand.
async function outreachPass(force) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var passContext = reachContext.getStore() || {};
  var cycleCandidate = passContext.candidate || null;
  async function candidateConsumerLeaseOwned(){
    if(typeof passContext.leaseGuard!=='function')return true;
    try{return await passContext.leaseGuard()===true;}
    catch(eLease){return false;}
  }
  // Terminal text/email events can commit before outreach.pending becomes
  // visible. Reconcile those durable same-HAM receipts before another judgment;
  // unreadable truth is never permission for a new provider effect.
  var terminalReconciliation;
  try {
    terminalReconciliation = await require('./reach/provider.delivery.saga.js')
      .reconcileHam(founderUid());
  } catch (eTerminal) {
    terminalReconciliation = { ok:false,
      reason:'provider_delivery_reconciliation_unverified' };
  }
  if (!terminalReconciliation || terminalReconciliation.ok !== true) {
    var terminalReason = terminalReconciliation && terminalReconciliation.reason ||
      'unknown';
    return { ok:false, reason:'provider_delivery_reconciliation_unverified:' +
      terminalReason };
  }
  // A durable voice turn may win the race before its outreach.pending audit
  // becomes visible. Reconcile those exact transport receipts before reading
  // the delivered watermark or judging any new facts. If truth cannot be read,
  // hold the next external effect rather than risk contacting the HAM twice.
  var voiceReconciliation = await reconcileVoiceDeliveryTruth(founderUid());
  if (!voiceReconciliation.ok) return { ok:false,
    reason:voiceReconciliation.reason || 'voice_delivery_reconciliation_unverified' };
  // ⬡B:core.outreach:WIRE:unified_kill_switch:20260707⬡
  // span.task.unified_kill_switch -- checked before any real call or text
  // goes out, same brain-backed flag every reach path now shares.
  var killGate={kill_switch:'unverified'};
  try {
    const killswitch = require('./killswitch.js');
    const ks = await killswitch.isActive(founderUid());
    killGate.kill_switch=ks&&typeof ks.active==='boolean'
      ?(ks.active?'active':'clear'):'unverified';
  } catch (eKs) { killGate.kill_switch='unverified'; }
  const attemptRead = await lastExternalAttempt();
  var attemptFloorHeld=attemptRead.ok&&externalAttemptFloorHeld(attemptRead.row);
  var attemptAtMs=attemptRead.row&&Date.parse(attemptRead.row.created_at);
  var attemptFloorEndsAt=attemptFloorHeld&&Number.isFinite(attemptAtMs)
    ?new Date(attemptAtMs+HARD_EXTERNAL_ATTEMPT_FLOOR_MS).toISOString():null;
  // This is a provider safety floor, not the delivered-fact watermark and not
  // a model judgment. A public/manual force hint cannot bypass it.
  const lastSent = await lastOutreach(true);
  if (lastSent && !lastSent.fact_watermark_at) return { ok:false, sent:false,
    delivered:false, providerAccepted:false, pendingDelivery:false,
    reason:'delivered_fact_watermark_unverified' };
  if(cycleCandidate&&lastSent&&Number.isFinite(Date.parse(cycleCandidate.committedAt))&&
      Number.isFinite(Date.parse(lastSent.created_at))&&
      Date.parse(cycleCandidate.committedAt)<=Date.parse(lastSent.created_at)){
    return{ok:true,sent:false,delivered:false,providerAccepted:false,
      pendingDelivery:false,redundant:true,
      reason:'candidate_superseded_by_later_delivery'};
  }
  // A held judgment is not contact. Only a real delivery may start the quiet
  // gap; otherwise frequent PAI cycles can reset this clock forever and
  // mechanically prevent the first actual reach.
  const gapHeld = gapHeldSinceSent(lastSent);
  // Facts window: strictly newer than the last SENT outreach — the watermark — capped
  // at a 6h lookback for the very first pass of a fresh world.
  const floorIso = lastSent ? lastSent.fact_watermark_at
    : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  var facts;
  try { facts = await gatherDecisionFacts(floorIso, cycleCandidate&&cycleCandidate.committedAt); }
  catch (eFacts) { return { ok:false, sent:false, delivered:false,
    providerAccepted:false, pendingDelivery:false,
    reason:eFacts.message || 'reach_fact_read_failed' }; }
  // ⬡B:core.outreach:WIRE:post_cycle_council_owns_priority_reach:20260717⬡
  // Every autonomous priority pass enters the committed REACH policy PAI. A
  // NOW artifact then receives one target-bound release council. Direct
  // GLM/Groq composition and the department ladder have no authority here.
  var quietGapEndsAt=gapHeld&&lastSent&&lastSent.created_at
    ?new Date(new Date(lastSent.created_at).getTime()+minGapMs()).toISOString():null;
  var presence;
  try { presence=await require('./reach/presence.snapshot.js')
    .readPresenceSnapshot(founderUid()); }
  catch(ePresence){presence=null;}
  if(!presence||presence.ok!==true){
    var unavailable={version:1,ham_uid:founderUid(),observed:false,status:'unknown',
      heartbeat_at:null,age_ms:null,activity:null,source:'circle.presence',
      unavailable_reason:presence&&presence.reason||'presence_read_failed'};
    presence=Object.assign({ok:true,readback_verified:false,
      snapshot_digest:crypto.createHash('sha256')
        .update(JSON.stringify(unavailable),'utf8').digest('hex')},unavailable);
  }
  async function currentChannelAvailability(){
    var currentContact=null;
    try{currentContact=await require('../agents/ham-contact.js').getContact(founderUid());}
    catch(eContact){currentContact=null;}
    var currentWorld=currentContact&&currentContact.world||passContext.world||null;
    return buildReachChannelAvailability(founderUid(),currentContact,currentWorld);
  }
  var channelAvailability;
  try{channelAvailability=await currentChannelAvailability();}
  catch(eAvailability){return{ok:false,pending:true,
    reason:'reach_channel_availability_failed'};}
  var governedDecision = await require('./reach/cycle.decision.js').decide({
    hamUid:founderUid(),candidate:cycleCandidate,facts:facts,gapHeld:gapHeld,
    quietGapEndsAt:quietGapEndsAt,presence:presence,
    channelAvailability:channelAvailability,
    mechanical:{kill_switch:killGate.kill_switch,
      attempt_floor_held:attemptFloorHeld,attempt_floor_ends_at:attemptFloorEndsAt,
      attempt_floor_verified:attemptRead.ok===true},
    refreshFacts:async function(){return gatherDecisionFacts(floorIso,new Date().toISOString());},
    refreshChannelAvailability:currentChannelAvailability,
    resolveTarget:async function(channel,when){
      if(when!=='NOW'||channel==='command_center'||channel==='none'){
        return{ok:true,deliveryTarget:{kind:'ham',value:founderUid()},
          recipientEnvelope:{ham_uid:founderUid()},targetValue:founderUid()};
      }
      return verifyReachDeliveryOwnership(channel,founderUid());
    }
  });
  if (!governedDecision || governedDecision.ok !== true || !governedDecision.decision) {
    return { ok:false, sent:false, delivered:false, providerAccepted:false,
      pendingDelivery:false, reason:governedDecision&&governedDecision.reason ||
        'reach_cycle_decision_unverified' };
  }
  const judgment = { reach:governedDecision.decision.reach,
    importance:governedDecision.decision.importance,
    message:governedDecision.decision.message,
    reason:governedDecision.decision.reason };
  const result = { facts_count: facts.length, gapHeld, judgment, sent:false,
    delivered:false, providerAccepted:false, pendingDelivery:false,
    surfaced:false, persisted:false,
    cycleDecision:{ source:governedDecision.source,
      artifactDigest:governedDecision.artifactDigest,
      evidenceDigest:governedDecision.evidenceDigest,
      factsDigest:governedDecision.factsDigest,
      parentCandidateSource:governedDecision.policy&&
        governedDecision.policy.candidate_source||null,
      parentCycleId:governedDecision.policy&&governedDecision.policy.parent_cycle_id||null,
      decision:{reach:governedDecision.decision.reach,
        when:governedDecision.decision.when,recheck_at:governedDecision.decision.recheck_at,
        channel:governedDecision.decision.channel,
        importance:governedDecision.decision.importance,
        reason:governedDecision.decision.reason},
      decisionReceipt:{requestId:governedDecision.councilProof.request_id,
        cycleId:governedDecision.councilProof.cycle_id,
        finalSource:governedDecision.councilProof.final_source,
        receiptDigest:governedDecision.councilProof.receipt_digest} } };

  // THE HANDSHAKE: rule on every pending station recommendation. A'NEW is the
  // decider. It reads the station's draft and its own bar; a nudge stays a
  // nudge (routine, learner-facing), never inflated into a founder alarm.
  const recs = await gatherReachRecommendations();
  result.recommendations_seen = recs.length;
  result.recommendations_ruled = [];
  for (const rec of recs) {
    const c = (function () { try { return JSON.parse(rec.content || '{}'); } catch (e) { return {}; } })();
    // A'NEW's rule: a well-formed learner nudge with a message and a sane
    // importance is promoted to that learner's channel; anything malformed or
    // over-importance for a nudge is downgraded. The station cannot force a send.
    const wellFormed = !!(c.message && c.state && (c.importance || rec.importance) <= 6);
    const verdict = wellFormed ? 'PROMOTE' : 'DOWNGRADE';
    await ruleOnRecommendation(rec, verdict);
    result.recommendations_ruled.push({ learner: rec.ham_uid, verdict: verdict, channel: c.channel_hint || 'text' });
    // NOTE: the actual learner-facing send rides the learner's own reach path
    // (their birthed world's channel) once it exists; until birth, PROMOTE
    // means the nudge is queued as ruled-ready. A'NEW never sends to a learner
    // through the founder's channel. Founder's own reach is judged separately
    // above and remains the only thing that can reach THIS phone tonight.
  }

  const SAME_ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 real hours before repeating the same alert
  const repeatingSameAlert = lastSent
    && (Date.now() - new Date(lastSent.created_at).getTime()) < SAME_ALERT_COOLDOWN_MS
    && sameAlertRecently(lastSent.summary, judgment.message);

  // ⬡B:core.outreach:FIX:same_condition_reworded_every_time:20260708⬡
  // Real, researched fix. sameAlertRecently catches literal text repeats,
  // but a live incident tonight showed the real gap: the SAME underlying
  // backlog (the same set of pending drafts, the same unresolved items)
  // kept re-alerting every cycle because the compose step worded it
  // differently each time -- "8 pending Mediators drafts" one tick,
  // "unresolved inbound messages" the next -- so the text-similarity check
  // never matched, even though nothing real had changed. The established,
  // real pattern for this (alert-fatigue tooling, industry-standard):
  // "when the same condition triggers again without a meaningful state
  // change, update the existing alert instead of sending a new one." Real
  // fix: track the actual set of underlying fact ids the alert was built
  // from, not the wording. If every fact behind the current judgment was
  // already present in the last SENT alert's fact set, nothing has genuinely
  // changed -- hold, regardless of how differently it's phrased this time.
  const parentContentDigest = cycleCandidate ? crypto.createHash('sha256')
    .update(JSON.stringify([cycleCandidate.question,cycleCandidate.answer]),'utf8').digest('hex') : null;
  // A new cycle ID is not a new real-world condition. Nonempty fact sets keep
  // their stable fact identity across cycles. Only a genuinely factless parent
  // uses the stable question+answer digest as its dedupe condition.
  const deliveryFacts = facts.length ? facts : (cycleCandidate ? [{
    id:'reach.parent.content.'+parentContentDigest,
    source:'reach.parent.content.'+parentContentDigest,
    stamp_type:'REACH_PARENT_CONTENT',summary:'Committed parent-cycle content',
    content:'digest:'+parentContentDigest,importance:judgment.importance }] : []);
  const currentFactIds = factDeliveryKeys(deliveryFacts);
  result.factIds = currentFactIds;
  let lastSentFactIds = [];
  try {
    const lastSentContent = lastSent && lastSent.content ? JSON.parse(lastSent.content) : null;
    lastSentFactIds = (lastSentContent && lastSentContent.factIds) || [];
  } catch (eParse) {}
  const noGenuinelyNewFacts = currentFactIds.length > 0
    && currentFactIds.every(function (id) { return lastSentFactIds.indexOf(id) !== -1; });
  const repeatingSameCondition = lastSent
    && (Date.now() - new Date(lastSent.created_at).getTime()) < SAME_ALERT_COOLDOWN_MS
    && noGenuinelyNewFacts;

  // The committed policy is the execution authority. DEFER never carries stale
  // bytes to a provider; the durable candidate remains pending until a fresh
  // fact read and a fresh council at or after recheck_at.
  result.proposedChannel = governedDecision.decision.channel;
  result.proposedWhy = judgment.reason || '';
  result.importance = judgment.importance;
  result.reachSource = 'pai_outbound_council';
  result.councilProof = governedDecision.councilProof;
  result.cycleId = governedDecision.councilProof.cycle_id;
  result.requestId = governedDecision.councilProof.request_id;
  if(governedDecision.decision.when==='NOW'&&killGate.kill_switch!=='clear'){
    return{ok:false,pending:true,sent:false,delivered:false,providerAccepted:false,
      pendingDelivery:false,reason:killGate.kill_switch==='active'
        ?'kill_switch_active':'kill_switch_unverified',cycleDecision:result.cycleDecision,
      proposedChannel:result.proposedChannel};
  }
  if(governedDecision.decision.when==='NOW'&&(!attemptRead.ok||attemptFloorHeld)){
    return{ok:false,pending:true,sent:false,delivered:false,providerAccepted:false,
      pendingDelivery:false,reason:attemptFloorHeld?'held_hard_rate_cap':
        attemptRead.reason||'outreach_attempt_read_unverified',
      recheckAt:attemptFloorEndsAt,cycleDecision:result.cycleDecision,
      proposedChannel:result.proposedChannel};
  }
  if (governedDecision.decision.when === 'DEFER') {
    return { ok:false, pending:true, sent:false, delivered:false,
      providerAccepted:false, pendingDelivery:false,
      reason:'deferred_by_pai_cycle_decision', recheckAt:governedDecision.decision.recheck_at,
      cycleDecision:result.cycleDecision, proposedChannel:'none' };
  }
  const allowed = governedDecision.decision.when === 'NOW' && judgment.reach &&
    judgment.message && !repeatingSameAlert && !repeatingSameCondition &&
    (!gapHeld || judgment.importance >= 9);

  if (allowed) {
    var commitChannel = /voice/i.test(result.proposedChannel) ? 'voice'
      : result.proposedChannel === 'text' ? 'text'
      : result.proposedChannel === 'email' ? 'email' : 'portal';
    var reachFunnel;
    var funnelState;
    try {
      reachFunnel=require('./reachFunnel.js');
      funnelState=await reachFunnel.isActive(founderUid());
    } catch (eFunnelState) {
      return { ok:false,pending:true,reason:'reach_funnel_state_unverified',
        cycleDecision:result.cycleDecision };
    }
    if(!funnelState||typeof funnelState.active!=='boolean'){
      return { ok:false,pending:true,reason:'reach_funnel_state_unverified',
        cycleDecision:result.cycleDecision };
    }
    var committedMessage = { ok:true, message:judgment.message,
      councilProof:governedDecision.councilProof,
      cycleId:governedDecision.councilProof.cycle_id,
      requestId:governedDecision.councilProof.request_id,
      _councilResult:governedDecision.councilResult,
      _deliveryOwnership:governedDecision.deliveryOwnership };
    var deliveryClaim=null;
    var attemptReservation=null;
    async function acquirePriorityClaim(){
      deliveryClaim=await claimOutreachDelivery('priority',deliveryFacts);
      result.deliveryClaim={source:deliveryClaim.source,digest:deliveryClaim.digest,
        factIds:deliveryClaim.factIds};
      return deliveryClaim.ok===true;
    }
    // ⬡B:core.outreach:WIRE:reach_funnel_redirect:20260708⬡
    // Reach funnel (pt1/pt6): when the founder flips the funnel ON, a decision that
    // WOULD have fired does not call or text -- the full what/how/why lands in the
    // CLAIR Command Center instead, so he judges her channel judgment and corrects the
    // wall. Reversible flag, auto-expires in 7 days, NOT a credential strip. When the
    // flag is off (default), this block is a no-op and reach behaves exactly as before.
    if (funnelState.active) {
        if(!await acquirePriorityClaim())return{ok:false,pending:true,...result,
          reason:deliveryClaim.reason};
        if(!await candidateConsumerLeaseOwned()){
          await releaseOwnedReachClaim(deliveryClaim);
          return{ok:false,pending:true,...result,
            reason:'candidate_consumer_claim_lost'};
        }
        var funnelResult = await reachFunnel.funnelInsteadOfSend(founderUid(), judgment, result.proposedChannel,
          { councilProof:result.councilProof, cycleId:result.cycleId, requestId:result.requestId,
            facts_count: facts.length, factIds: currentFactIds, pass: 'outreachPass' });
        result.funneled = !!(funnelResult && funnelResult.ok === true);
        result.surfaced = result.funneled;
        result.persisted = result.funneled;
        result.delivered = false;
        result.providerAccepted = false;
        result.pendingDelivery = false;
        result.sent = false;
        result.reason = result.funneled ? 'funneled_to_command_center'
          : 'command_center_write_failed';
        if(!result.funneled)await releaseOwnedReachClaim(deliveryClaim);
        var funnelStamp = await stampOutreach(result);
        if (!funnelStamp.ok) {
          result.stampReason = funnelStamp.reason;
          return { ok:false, providerAccepted:false, ...result };
        }
        return { ok:result.funneled, ...result };
    }
    // Recheck the exact committed target immediately before the provider edge.
    // The first ownership check protected PAI; this closes a contact/Atmosphere
    // change while the council and durable claim were running.
    var committedOwnership = committedMessage._deliveryOwnership;
    var providerOwnership = await verifyReachDeliveryOwnership(commitChannel,
      founderUid(), committedOwnership && committedOwnership.targetValue);
    if (!providerOwnership.ok) {
      result.reason = providerOwnership.reason;
      var ownershipHeldStamp = await stampOutreach(result);
      if (!ownershipHeldStamp.ok) result.stampReason = ownershipHeldStamp.reason;
      return { ok:false, ...result };
    }
    let toPhone = providerOwnership.deliveryTarget &&
      providerOwnership.deliveryTarget.kind === 'phone'
      ? providerOwnership.targetValue : founderPhone();
    if (providerOwnership.recipientEnvelope) {
      result.founder_ham = providerOwnership.recipientEnvelope.ham_uid;
    }
    // Council and identity verification can take long enough for another
    // instance to reach this same seam with a different fact set. The one
    // rolling-hour HAM claim is the atomic arbiter immediately before any
    // external provider edge; force never bypasses it.
    if (/^(voice|text|email)$/i.test(commitChannel)) {
      attemptReservation = await reserveExternalAttempt();
      if (!attemptReservation.ok) {
        result.reason = attemptReservation.reason ||
          'outreach_attempt_reservation_unverified';
        var attemptReservationStamp = await stampOutreach(result);
        if (!attemptReservationStamp.ok) {
          result.stampReason = attemptReservationStamp.reason;
          return { ok:false, ...result };
        }
        return { ok:attemptReservation.held === true, ...result };
      }
      result.attemptReservation = { source:attemptReservation.source,
        leaseMs:attemptReservation.leaseMs, recovered:attemptReservation.recovered === true };
    }
    // All target, funnel, and rolling-rate preflights have passed. Take the
    // permanent fact-set claim only at the last safe seam before a provider or
    // Command Center effect. If another fact claim won, release our still-unused
    // hourly reservation so it cannot suppress unrelated work.
    if(!await acquirePriorityClaim()){
      if(attemptReservation)await releaseOwnedReachClaim(attemptReservation);
      return{ok:false,pending:true,...result,reason:deliveryClaim.reason};
    }
    // This is the last application-owned seam before the provider or Command
    // Center effect. A long PAI/council pass renews in the background; verify
    // the distributed candidate lease again here so a superseded worker can
    // never cross the effect boundary. Permanent fact/provider claims remain
    // the database-level exactly-once authority after this point.
    if(!await candidateConsumerLeaseOwned()){
      await releaseOwnedReachClaim(deliveryClaim);
      if(attemptReservation)await releaseOwnedReachClaim(attemptReservation);
      return{ok:false,pending:true,...result,
        reason:'candidate_consumer_claim_lost'};
    }
    // One channel per committed message. Text fallback is permitted only when
    // voice was definitively rejected or no provider request was made. Ambiguous
    // provider results never trigger a second channel.
    if (/voice/i.test(result.proposedChannel)) {
      const callResult = await placeCall(toPhone, judgment.message,
        committedMessage._councilResult, {
          autonomousVoiceCapability:AUTONOMOUS_VOICE_ATTEMPT_CAPABILITY,
          deliveryClaim:result.deliveryClaim
      });
      const dialed = applyVoiceDialResult(result, callResult);
      if (!dialed) {
        result.reason = callResult && callResult.reason || 'voice_delivery_unverified';
      }
    } else if (result.proposedChannel === 'text') {
      const sendResult = await tapSend(toPhone, judgment.message, founderUid(),
        committedMessage._councilResult, { providerDelivery:{
          kind:'autonomous_reach', source:'core.outreach', pendingFamily:'outreach'
        } });
      const textAccepted = applyMessageProviderResult(result, sendResult,
        'message_id', 'text_provider_accepted_pending_delivery');
      if (!textAccepted) result.reason = sendResult && sendResult.reason || 'text_delivery_unverified';
    } else if (result.proposedChannel === 'email') {
      const context = reachContext.getStore() || {};
      const emailWorld = providerOwnership.recipientEnvelope &&
        providerOwnership.recipientEnvelope.world || context.world;
      const emailResult = emailWorld
        ? await require('../reach/iman.js').sendCommittedToHam(founderUid(),
          providerOwnership.targetValue, judgment.message, emailWorld,
          { councilResult:committedMessage._councilResult,
            councilProof:committedMessage.councilProof },
          { hamUid:founderUid(), providerDelivery:{
            kind:'autonomous_reach', source:'core.outreach', pendingFamily:'outreach'
          } })
        : { ok:false, reason:'email_world_unresolved' };
      // The one REACH council owns the complete RFC822-like artifact. IMAN
      // parses and sends its exact subject/body without starting another PAI.
      const emailProof = emailResult && emailResult.councilProof;
      const emailLineageOk = !!(emailResult && emailResult.ok === true &&
        typeof emailResult.requestId === 'string' && emailResult.requestId &&
        typeof emailResult.cycleId === 'string' && emailResult.cycleId &&
        typeof emailResult.approvedSubject === 'string' && emailResult.approvedSubject &&
        typeof emailResult.approvedBody === 'string' && emailResult.approvedBody &&
        emailProof && emailProof.committed === true &&
        emailProof.readback_verified === true && emailProof.row_count === 9 &&
        emailProof.request_id === emailResult.requestId &&
        emailProof.cycle_id === emailResult.cycleId);
      if (emailLineageOk) {
        result.requestId = emailResult.requestId;
        result.cycleId = emailResult.cycleId;
        result.councilProof = emailProof;
        result.emailSubject = emailResult.approvedSubject;
        result.message = emailResult.approvedBody;
        judgment.message = emailResult.approvedBody;
      }
      const emailAccepted = emailLineageOk && applyMessageProviderResult(result,
        emailResult, 'messageId', 'email_provider_accepted_pending_delivery');
      if (!emailAccepted) result.reason = emailResult && emailResult.reason || 'email_delivery_unverified';
    } else {
      const portalResult = await require('./reachFunnel.js').funnelInsteadOfSend(
        founderUid(), judgment, result.proposedChannel,
        { councilProof:result.councilProof, cycleId:result.cycleId, requestId:result.requestId,
          facts_count:facts.length, factIds:currentFactIds, pass:'outreachPass' });
      result.funneled = !!(portalResult && portalResult.ok);
      result.surfaced = result.funneled;
      result.persisted = result.funneled;
      result.delivered = false;
      result.providerAccepted = false;
      result.pendingDelivery = false;
      result.sent = false;
      result.reason = result.funneled ? 'routed_to_command_center' : 'command_center_write_failed';
      if(!result.funneled)await releaseOwnedReachClaim(deliveryClaim);
    }
    if(!result.providerAccepted&&!result.delivered&&!result.surfaced&&
        ambiguousProviderOutcome(result.reason)){
      // The permanent semantic/effect claims stay held. A missing or uncertain
      // provider response is recovery work, never a terminal HOLD and never
      // permission to call a second channel.
      return{ok:false,pending:true,reconciliationPending:true,...result};
    }
    if(!result.providerAccepted&&!result.delivered&&!result.surfaced&&
        definitiveProviderPreflightFailure(result.reason)){
      await releaseOwnedReachClaim(deliveryClaim);
      if(attemptReservation)await releaseOwnedReachClaim(attemptReservation);
      return{ok:false,pending:true,...result};
    }
    if (!result.reason || result.reason === 'routed_to_command_center') {
      result.reason = result.reason || judgment.reason;
    }
    result.message = judgment.message;
  } else {
    result.reason = repeatingSameAlert ? 'held_repeating_same_alert' : repeatingSameCondition ? 'held_repeating_same_condition_reworded' : (judgment.reach ? (gapHeld ? 'held_min_gap' : 'no_message_composed') : (judgment.reason || 'judged_hold'));
    if(result.reason==='held_min_gap')result.recheckAt=quietGapEndsAt;
  }
  var finalStamp = await stampOutreach(result);
  if (!finalStamp.ok) {
    result.stampReason = finalStamp.reason;
    return { ok:false, providerAccepted:classifyReachTruth(result).providerAccepted, ...result };
  }
  return { ok: true, ...result };
}

function startOutreach(intervalMs) {
  const ms = intervalMs || parseInt(process.env.OUTREACH_INTERVAL_MS || '', 10) || 30 * 60 * 1000;
  // Autonomous priority work now exists only as durable post-cycle candidates.
  // The timer drains that queue; it cannot invent a candidate-less judgment.
  const timer=require('./reach/cycle.handoff.js').startConsumer(ms);
  console.log('[OUTREACH] durable REACH candidate consumer started, every', ms / 60000, 'minutes');
  return timer;
}

// ANYHAM entry for the cycle handoff. AsyncLocalStorage keeps the extensive,
// battle-tested REACH gates intact while scoping every brain query, claim,
// provider target, and audit stamp to the HAM whose PAI cycle just completed.
async function outreachPassForHam(hamUid, force, options) {
  var uid = String(hamUid || '').toUpperCase();
  if (!uid) return { ok:false, reason:'ham_uid_required' };
  var contact = null;
  try { contact = await require('../agents/ham-contact.js').getContact(uid); }
  catch (eContact) { contact=null; }
  // Contact data is routing, not decision authority. HOLD, DEFER, and Command
  // Center decisions need no phone/email at all; the selected external channel
  // resolves and proves only its own exact target inside resolveTarget.
  var world = options&&options.world || contact&&contact.world || null;
  return reachContext.run({ hamUid:uid, phone:contact&&contact.phone || '',
    email:contact&&contact.email || '', world:world,
    candidate:options&&options.candidate||null,
    leaseGuard:options&&options.leaseGuard||null },
    // A public/manual force hint may request a check, but never changes the
    // council timing or mechanical cadence gates.
    function () { return outreachPass(false); });
}

// ⬡B:core.outreach:WIRE:daily_digest_second_reach_kind:20260705⬡
// Founder's real, repeated ask, confirmed twice: a second kind of reach that
// isn't gated by "is this alarming" at all -- a real "here's what actually
// happened today," once a day, built from the real day's routine work
// (CONTRIBUTION, RESULT, TASK_DONE), not just the rare importance>=8 alert
// facts the existing gatherFacts() deliberately narrows to (that narrowing
// stays exactly as it is -- it's the correct fix for a real build-diary-spam
// incident, not touched here).
// What's CLAIR's to wire: when this checks (once per real cycle tick, same
// as the alarm path), whether a digest already went out today, and what raw
// facts get handed over. What stays real judgment, not CLAIR's to write: the
// actual words. composeDigest below makes the same real Groq call
// judgeAndCompose already proves out, same grounding-check-after-compose gate
// so it can't invent a capability the facts don't support, just a different
// question asked of it -- summarize the real day, don't judge alarm-worthiness.
async function lastDigest(sentOnly) {
  try {
    if (sentOnly) return await lastDeliveredAcrossHistory('digest');
    const deliveryFilter = sentOnly ? '&source=like.outreach.digest.sent.*' : '';
    const stampFilter = '&stamp_type=eq.DIGEST';
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + founderUid()
      + '&agent_global=eq.ANEW'
      + stampFilter + deliveryFilter
      + '&order=created_at.desc&limit=1&select=stamp_type,source,created_at,content', { headers: bh() });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows || !rows[0]) return null;
    return Object.assign({}, rows[0], {
      fact_watermark_at:null
    });
  } catch (e) { return null; }
}

// ⬡B:core.outreach:FIX:proactive_not_scheduled_founder_direct:20260705⬡
// Founder's direct words, overriding CLAIR's earlier framing: "I am not
// looking for digest on schedule - i am looking for Proactive Assisting
// Intelligence so life assistant! so as much as it takes!!" This is no
// longer a once-a-day snapshot of a rolling 24h window -- it gathers
// everything real since the last time she actually reached him, the same
// watermark pattern the alarm path already proves out (lastSent.created_at
// as the floor). First-ever pass for a fresh world falls back to a 24h
// lookback so it has something real to start from.
async function gatherDigestFacts(sinceIso) {
  const url = _bu() + '/rest/v1/' + _tbl() + ''
    + '?ham_uid=eq.' + founderUid()
    + '&stamp_type=in.(CONTRIBUTION,RESULT,TASK_DONE)'
    + '&created_at=gte.' + encodeURIComponent(sinceIso)
    + '&order=created_at.desc&limit=200&select=id,source,stamp_type,summary,created_at';
  try {
    const r = await fetch(url, { headers: bh() });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

async function composeDigest(facts) {
  if (!GROQ || !facts.length) return { ok: false, message: '' };
  const fcw = await buildMemoryBank(founderUid(), 'outreach', 'daily digest');
  // ⬡B:core.outreach:FIX:quiet_day_recap_should_never_have_been_a_text:20260708⬡
  // Real, live incident, founder's own words: "still more reaching out for
  // nothing, how is this supposed to be intelligent or helpful at all."
  // Both messages he flagged were correctly rate-capped (over an hour
  // apart) -- the real, deeper gap was never frequency, it was that a
  // routine "quiet day, nothing needs you" recap texted him every time
  // regardless, because the old instruction only ever asked "did anything
  // happen," never "does anything here actually need him." Command Center
  // is the real, settled default (founder intent, stamped 20260705); text
  // is earned by something genuinely requiring his attention, not by the
  // mere existence of routine activity. Real fix, mirrors the actionability
  // gate judgeAndCompose already has: a real REACH decision before MESSAGE,
  // not composing prose first and hoping NONE catches the quiet ones.
  const sys = (fcw && fcw.ok ? fcw.system_prompt : 'You are A\u2019NU, a warm and direct life assistant.')
    + '\n\nDeciding whether today\'s real activity actually earns a text to your founder, or belongs in Command Center instead.'
    + '\nSTAY GROUNDED: state only what the facts below literally say. Do NOT invent or dramatize. Never turn a feature name, a label, or a roadmap item into a person. Never say anyone or anything "fired herself", "quit", "left", or "is out of the loop", and never attach a status, a motive, or an event that is not written in the fact itself. If a fact is cryptic or you are not sure what it refers to, either leave it out or say plainly that you are not certain what it means. Never build a story around it. (A real example of the failure to avoid: a roadmap feature named "Life Flex" got narrated as a team member who fired herself. That is exactly the invention that is banned.)'
    + '\nVOICE: write the way a warm, direct friend actually talks, in flowing sentences joined with commas, not clipped punchy fragments and not a headline. Never use an em dash or an en dash. No hollow phrases. Plain, grounded, and real.'
    + '\nCommand Center is the real default for routine activity -- inbox reviews with nothing pending on him,'
    + ' routine drafts sitting for his normal review cadence, low-balance warnings needing no action, code'
    + ' fixes and internal build work, a plainly quiet day. None of that earns a text on its own, no matter how'
    + ' much of it there is. REACH: YES only for something that actually needs his attention now -- a real'
    + ' decision only he can make, something time-sensitive, something genuinely outside the routine.'
    + '\nAnswer in EXACTLY this shape:\nREACH: YES or REACH: NO\nMESSAGE: if YES, the real update, in your own voice, as long as it actually requires. If NO, write CC_SUMMARY: a one-line real note of what happened, for Command Center only, never sent as a text.';
  const user = 'Real activity from the last 24 hours:\n' + facts.map(f => '[' + f.stamp_type + '] ' + (f.summary || '').slice(0, 140)).join('\n');
  try {
    let out = await callGLM(sys, user, 1500);
    if (!out) out = await callOrnith(sys, user, 1500);
    if (!out) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: (process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b'), messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 3000, temperature: 0.4 })
      });
      if (!r.ok) return { ok: false, message: '' };
      const d = await r.json();
      out = (d.choices && d.choices[0] && d.choices[0].message.content) || '';
    }
    const reachesFounder = /REACH:\s*YES/i.test(out);
    const msgM = out.match(/MESSAGE:\s*([\s\S]+)/i);
    let message = reachesFounder && msgM ? msgM[1].trim() : '';
    if (/^NONE$/i.test(message) || /^CC_SUMMARY/i.test(message)) message = '';
    if (!reachesFounder) {
      // Real Command Center note instead of a text -- routine activity is
      // still logged somewhere real, it just does not interrupt him for it.
      const ccM = out.match(/CC_SUMMARY:\s*([\s\S]+)/i);
      var ccNote = ccM ? ccM[1].trim().slice(0) : 'Routine day, nothing requiring attention.';
      // \u2b21B:core.outreach:WIRE:chatter_report_upgrade:20260710\u2b21
      // Kill the lot-of-nothing: enrich the digest into a real report -- what moved,
      // what she sees, one number that matters. Additive; falls back to ccNote.
      try {
        // \u2b21B:core.outreach:FIX:buildreport_real_field_names:20260710\u2b21
        // buildReport reads sees/count/directive -- the call passed seen/oneNumber and
        // 'cycle ran', so it fell back to 'nothing notable, no directive' every time.
        // Feed the REAL fields: what actually moved (the fact summaries), the real
        // count, what she sees (the CC note), and the active directive if present.
        var movedFacts = facts.slice(0, 3).map(function (f) { return (f.summary || '').replace(/^\[[^\]]*\]\s*/, '').slice(0, 40); }).filter(Boolean);
        var activeDirective = null;
        try {
          var dq = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.CORE_DIRECTIVE&order=created_at.desc&limit=1&select=summary', { headers: bh() }).then(function (r) { return r.ok ? r.json() : []; });
          if (dq && dq[0]) activeDirective = (dq[0].summary || '').replace(/^\[[^\]]*\]\s*/, '').slice(0, 60);
        } catch (eD) {}
        var _rep = require('./chatterReport.js').buildReport({ name: 'Your day' }, { moved: movedFacts, sees: ccNote.slice(0, 80), count: facts.length, directive: activeDirective });
        if (_rep && typeof _rep === 'string' && _rep.length > 10) ccNote = _rep.slice(0, 400);
        else if (_rep && _rep.line) ccNote = String(_rep.line).slice(0, 400);
      } catch (eRep) {}
      var ccCommitted = await commitReachMessage('daily command center update', ccNote, facts, 'portal');
      if (!ccCommitted.ok) {
        return { ok:false, message:'', routedToCommandCenter:false,
          reason:'pai_council_held_chatter:' + ccCommitted.reason };
      }
      ccNote = ccCommitted.message;
      try {
        var ccSource = 'outreach.digest.cc_only.' + ccCommitted.requestId;
        var ccContent = JSON.stringify({ note: ccNote, factsCount: facts.length,
          factIds:factDeliveryKeys(facts), councilProof:ccCommitted.councilProof,
          cycleId:ccCommitted.cycleId, requestId:ccCommitted.requestId });
        var ccPayload = {
          ham_uid: founderUid(), agent_global: 'ANEW', stamp_type: 'CHATTER',
          acl_stamp: '\u2b21B:core.outreach:CHATTER:digest_command_center_only:' + ymd() + '\u2b21',
          source:ccSource,
          summary: '[COMMAND CENTER, routine, not texted] ' + ccNote.slice(0, 500),
          content:ccContent, importance:3
        };
        var ccWrite = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
          method: 'POST',
          headers: Object.assign({}, bh(), { 'Content-Profile': _schema(),
            'Content-Type': 'application/json', Prefer: 'return=representation' }),
          body: JSON.stringify(ccPayload)
        });
        var ccRows = ccWrite.ok ? await ccWrite.json().catch(function(){return null;}) : null;
        if (!ccWrite.ok || !Array.isArray(ccRows) || ccRows.length !== 1 ||
            ccRows[0].source !== ccSource || ccRows[0].ham_uid !== founderUid() ||
            String(ccRows[0].content) !== ccContent) {
          return { ok:false, message:'', routedToCommandCenter:false,
            reason:'command_center_write_unverified', requestId:ccCommitted.requestId,
            cycleId:ccCommitted.cycleId, councilProof:ccCommitted.councilProof };
        }
      } catch (eCC) {
        return { ok:false, message:'', routedToCommandCenter:false,
          reason:'command_center_write_unverified', requestId:ccCommitted.requestId,
          cycleId:ccCommitted.cycleId, councilProof:ccCommitted.councilProof };
      }
      return { ok:false, message:'', routedToCommandCenter:true, funneled:true,
        requestId:ccCommitted.requestId, cycleId:ccCommitted.cycleId,
        councilProof:ccCommitted.councilProof };
    }
    if (message) {
      // ⬡B:core.outreach:FIX:digest_grounding_check_too_narrow_and_silent:20260705⬡
      // Real, live incident: this exact gate let a real fabrication through --
      // the real fact named the sender "sweintrop", the sent message said
      // "Intropia" (a company that does not exist anywhere in the brain); the
      // real fact said "Runpod" (the founder's own GPU hosting bill), the sent
      // message said "Runpay"; a claim of "three months of missing money that
      // finally logged" had zero support in any real fact at all. Two real
      // bugs found reading this code, not guessed: (1) the check's instruction
      // only asked about invented CAPABILITY claims, never named entities,
      // vendors, or specific facts as something to verify -- sharpened below
      // to say so explicitly. (2) catch (eGround) {} was completely silent --
      // if the check itself failed (network, rate limit, anything), the
      // message went out UNCHECKED with zero trace anywhere that it happened.
      // A safety gate that can fail silently is not a safety gate. Now stamps
      // a real GAP_FLAGS bead on any check failure so a future silent miss is
      // at least visible, and fails CLOSED (holds the message) rather than
      // open, since this gate's whole job is exactly what just failed.
      try {
        const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: (process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b'), max_tokens: 80, temperature: 0, messages: [
            { role: 'system', content: 'Compare a drafted daily update against the real facts it claims to summarize. Reply EXACTLY: OK or FAIL, then a reason. FAIL if it states a specific capability the facts do not support, OR if it names a person, company, vendor, dollar figure, or specific detail that does not appear in the facts, even approximately -- a fact naming "sweintrop" does not license a reply naming a different company, a fact naming "Runpod" does not license "Runpay". Do not pass close-sounding substitutions.' },
            { role: 'user', content: 'FACTS:\n' + user + '\n\nDRAFTED MESSAGE:\n' + message }
          ] })
        });
        if (!gr.ok) {
          await stampGroundingCheckFailure('digest_grounding_http_' + gr.status, message);
          return { ok: false, message: '' };
        }
        const gd = await gr.json();
        const gout = gd?.choices?.[0]?.message?.content?.trim() || '';
        if (!gout) {
          await stampGroundingCheckFailure('digest_grounding_empty_response', message);
          return { ok: false, message: '' };
        }
        if (/^FAIL/i.test(gout)) return { ok: false, message: '' };
      } catch (eGround) {
        await stampGroundingCheckFailure('digest_grounding_exception: ' + eGround.message, message);
        return { ok: false, message: '' };
      }
    }
    var digestCommitted = message
      ? await commitReachMessage('daily digest outreach', message, facts, 'text') : null;
    if (message && (!digestCommitted || !digestCommitted.ok)) {
      return { ok:false, message:'',
        reason:'pai_council_held_digest:' + (digestCommitted&&digestCommitted.reason || 'unknown') };
    }
    var composedDigest = { ok: !!message, message:digestCommitted ? digestCommitted.message : '',
      councilProof:digestCommitted&&digestCommitted.councilProof || null,
      cycleId:digestCommitted&&digestCommitted.cycleId || null,
      requestId:digestCommitted&&digestCommitted.requestId || null };
    Object.defineProperty(composedDigest, '_councilResult', { enumerable:false,
      value:digestCommitted&&digestCommitted._councilResult || null });
    Object.defineProperty(composedDigest, '_deliveryOwnership', { enumerable:false,
      value:digestCommitted&&digestCommitted._deliveryOwnership || null });
    return composedDigest;
  } catch (e) { return { ok: false, message: '' }; }
}

async function stampGroundingCheckFailure(reason, heldMessage) {
  if (!_bu() || !_bk()) return;
  try {
    await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST',
      headers: Object.assign({}, bh(), { 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        ham_uid: founderUid(), agent_global: 'CLAIR', stamp_type: 'GAP_FLAGS',
        acl_stamp: '\u2b21B:core.outreach:GAP_FLAGS:grounding_check_failed_held:' + ymd() + '\u2b21',
        source: 'outreach.digest.grounding_failed.' + Date.now(),
        summary: '[GAP_FLAGS] Digest grounding check failed, message HELD not sent -- ' + reason,
        content: JSON.stringify({ reason: reason, held_message: (heldMessage || '').slice(0) }),
        importance: 7
      })
    });
  } catch (e) {}
}

// ⬡B:core.outreach:FIX:digest_day_boundary_was_utc_not_founders_day:20260705⬡
// Real bug, real founder report: "new morning, I ain't got nothing." The one
// digest that ever sent went out at 1:35am Eastern during CLAIR's own live
// test -- superseded now that the gate is substance-based, not calendar-based
// (founder's direct correction: proactive, not scheduled). Kept only the
// quiet-hours piece below, which is a real thing, not a schedule.

// ⬡B:core.outreach:FIX:quiet_hours_a_1am_send_should_not_count:20260705⬡
// Real, sharper version of the same founder report. The math: 1:35am and
// 9am Eastern are the same calendar day either way, UTC or local, so a pure
// day-boundary fix alone would not have explained this morning. The actual
// problem is that the one real send that ever went out landed at 1:35am,
// during CLAIR's own test, while Brandon was almost certainly asleep, and
// then correctly locked the gate for the rest of that calendar day -- the
// boundary wasn't wrong, the TIME it fired was useless to a real person. A
// digest that lands before reasonable waking hours should not count as
// having satisfied the day. This is a quiet-hours floor, the same kind of
// thing any real notification system has, not a content decision about
// what to say -- just about not letting an accidental middle-of-the-night
// check use up the day's one real chance to actually be seen.
function localHour(iso) {
  var tz = process.env.FOUNDER_TZ || 'America/New_York';
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(iso)), 10); }
  catch (e) { return new Date(iso).getUTCHours(); }
}

async function stampDigest(result) {
  try {
    var truth = classifyReachTruth(result);
    var delivered = truth.delivered;
    var disposition = truth.disposition;
    var key = String(result.requestId || result.deliveryClaim && result.deliveryClaim.digest || '')
      .replace(/[^A-Za-z0-9._:-]/g, '');
    if (!key) key = crypto.createHash('sha256').update(JSON.stringify(result), 'utf8').digest('hex');
    var source = 'outreach.digest.' + disposition + '.' + key;
    var exactContent = JSON.stringify(Object.assign({}, result, truth, {
      sent:truth.delivered
    }));
    var payload = {
      ham_uid:founderUid(), agent_global:'ANEW', stamp_type:'DIGEST',
      acl_stamp:'\u2b21B:core.outreach:DIGEST:' + disposition + ':' + ymd() + '\u2b21',
      source:source,
      summary:'[DIGEST] ' + (delivered ? 'delivered real update'
        : truth.surfaced ? 'surfaced in Command Center, not delivered'
          : truth.providerAccepted ? 'provider accepted, delivery unconfirmed' : 'held') +
        ' -- ' + (result.facts_count || 0) + ' real facts in window',
      content:exactContent, importance:delivered ? 6
        : (truth.surfaced || truth.providerAccepted ? 5 : 2)
    };
    var response = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method:'POST', headers:Object.assign({}, bh(), { 'Content-Profile':_schema(),
        'Content-Type':'application/json', Prefer:'return=representation' }),
      body:JSON.stringify(payload)
    });
    var rows = response.ok ? await response.json().catch(function(){return null;}) : null;
    if (!response.ok || !Array.isArray(rows) || rows.length !== 1 ||
        rows[0].source !== source || rows[0].ham_uid !== founderUid() ||
        rows[0].stamp_type !== 'DIGEST' || String(rows[0].content) !== exactContent) {
      return { ok:false, reason:'digest_stamp_unverified', source:source };
    }
    return { ok:true, source:source, row:rows[0] };
  } catch (e) { return { ok:false, reason:'digest_stamp_unverified' }; }
}

async function checkDailyDigest() {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  const lastAttempt = await lastDigest(false);
  const lastDelivered = await lastDigest(true);
  if (lastDelivered && !lastDelivered.fact_watermark_at) {
    return { ok:false, reason:'delivered_fact_watermark_unverified' };
  }
  // Quiet hours still real -- a life assistant does not wake him at 2am to
  // narrate routine work. That is not the same thing as a once-a-day cap;
  // real urgency already has its own path through the alarm/OUTREACH gate,
  // which importance>=9 can fire through at any hour. This is only about
  // not letting an accidental middle-of-the-night check use up a real
  // report on a useless hour, same as before -- but it no longer locks out
  // the rest of the day once one real report has gone out.
  if (localHour(new Date().toISOString()) < 7) return { ok: true, skipped: 'quiet_hours' };
  // ⬡B:core.outreach:FIX:digest_had_zero_hard_floor:20260708⬡
  // Real, live incident, confirmed by real records: two real digest sends,
  // 11:10 and 11:46 UTC, 36 minutes apart -- this path only ever checked
  // "is there anything new since the watermark," which any single new fact
  // satisfies, same class of gap the alarm path had before tonight's hard
  // cap. This is a daily update; it does not need to fire twice an hour.
  // Same real, mechanical floor as the alarm path, not just better wording.
  const DIGEST_HARD_FLOOR_MS = 60 * 60 * 1000;
  if (lastAttempt && (Date.now() - new Date(lastAttempt.created_at).getTime()) < DIGEST_HARD_FLOOR_MS) {
    return { ok: true, skipped: 'held_hard_rate_cap' };
  }
  // Only confirmed delivery advances the human-contact facts watermark.
  // Surfacing and provider acceptance still count for rate limiting above,
  // but cannot erase facts the HAM has not been proven to receive.
  const floorIso = lastDelivered ? lastDelivered.fact_watermark_at
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const facts = await gatherDigestFacts(floorIso);
  if (!facts.length) return { ok: true, skipped: 'nothing_new_since_last_update' };
  // Claim the real fact set before composeDigest can write a Command Center
  // report or the provider edge can send a text. A failed/ambiguous attempt
  // keeps this permanent claim, preventing a later tick from narrating and
  // delivering the same facts again under different wording.
  const digestClaim = await claimOutreachDelivery('digest', facts);
  if (!digestClaim.ok) {
    var duplicateResult = { facts_count:facts.length, factIds:digestClaim.factIds,
      sent:false, delivered:false, providerAccepted:false, pendingDelivery:false,
      funneled:false, surfaced:false, persisted:false, reason:digestClaim.reason,
      deliveryClaim:{ source:digestClaim.source, digest:digestClaim.digest } };
    var duplicateDigestStamp = await stampDigest(duplicateResult);
    if (!duplicateDigestStamp.ok) duplicateResult.stampReason = duplicateDigestStamp.reason;
    return Object.assign({ ok:false }, duplicateResult);
  }
  const composed = await composeDigest(facts);
  const result = { facts_count:facts.length, sent:false, delivered:false,
    providerAccepted:false, pendingDelivery:false, surfaced:false, persisted:false,
    councilProof:composed.councilProof || null, cycleId:composed.cycleId || null,
    requestId:composed.requestId || null,
    reason:composed.reason || null, factIds:digestClaim.factIds,
    deliveryClaim:{ source:digestClaim.source, digest:digestClaim.digest } };
  if (composed.routedToCommandCenter === true && composed.funneled === true) {
    result.funneled = true;
    result.surfaced = true;
    result.persisted = true;
    result.reason = 'routed_to_command_center';
  }
  if (composed.ok && composed.message && !result.surfaced) {
    // DIGEST is a Command Center surface only. It has no independent authority
    // to choose an external channel or call a provider outside the post-cycle
    // REACH council.
    var digestFunnelResult=await require('./reachFunnel.js').funnelInsteadOfSend(
      founderUid(),{message:composed.message,reason:'daily digest',importance:5},
      'command_center',{councilProof:result.councilProof,cycleId:result.cycleId,
        requestId:result.requestId,facts_count:facts.length,pass:'checkDailyDigest'});
    result.funneled=!!(digestFunnelResult&&digestFunnelResult.ok===true);
    result.surfaced=result.funneled;
    result.persisted=result.funneled;
    result.delivered=false;
    result.providerAccepted=false;
    result.pendingDelivery=false;
    result.sent=false;
    result.message=composed.message;
    result.reason=result.funneled?'routed_to_command_center':'command_center_write_failed';
  }
  var digestStamp = await stampDigest(result);
  if (!digestStamp.ok) {
    result.stampReason = digestStamp.reason;
    return Object.assign({ ok:false,
      providerAccepted:classifyReachTruth(result).providerAccepted }, result);
  }
  return result;
}

module.exports = { outreachPass, outreachPassForHam, startOutreach, placeCall,
  registerVoiceDeliveryReconciler, registerVoiceProviderAcceptanceRecorder,
  checkDailyDigest, classifyReachTruth, verifyVoiceAutonomousAttempt,
  voiceSessionBindingMessage,
  _test:{ gapHeldSinceSent, formatReachFact, explicitCallRequestFact,
    applyVoiceDialResult, applyMessageProviderResult, verifyReachDeliveryOwnership,
    commitReachMessage, stampOutreach, stampDigest, lastOutreach, lastDigest,
    lastExternalAttempt, externalAttemptFloorHeld, externalAttemptReservationSource,
    deliveredFactWatermark,
    resolveDeliveredFactWatermark,
    lastDeliveredAcrossHistory,
    reserveExternalAttempt, reconcileVoiceDeliveryTruth,
    recordReturnedVoiceProviderAcceptance,
    voiceAutonomousAttemptRow, voiceSessionBindingMessage,
    ambiguousProviderOutcome, definitiveProviderPreflightFailure,
    safeLearningFact, safeDecisionFeedbackFact, verifiedDecisionFeedbackFact,
    gatherReachDecisionFeedback, buildReachChannelAvailability } };
