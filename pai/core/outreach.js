// ⬡B:core.outreach:WIRE:funneled_20260713⬡
// DOCTRINE (entry): outreach is A'NU's own outward reach, not a side gate. The Overseer
// decides it at the end of the one PAI cycle whose entry is always A'NEW through the
// ABAHAM door, and it only ever reaches the HAM the cycle already resolved.
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
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
const reachContext = new AsyncLocalStorage();

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
  if (!ORNITH_URL || !RUNPOD_KEY) return null;
  try {
    const payload = { input: { mode: 'chat', model: ORNITH_MODEL,
      options: { num_predict: maxTokens || 300, temperature: 0.3 },
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
      body: JSON.stringify({ model: 'zai-org/GLM-5.2', max_tokens: maxTokens || 1200, temperature: 0.3,
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
async function placeCall(toPhone, callReason, councilResult) {
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
    dv.call_reason = String(callReason).slice(0, 300);
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

    // ⬡B:core.outreach:GUARD:pipecat_voice_session_bound_to_exact_ham:20260716⬡
    // The signed opener authorizes one exact sentence for one phone target; it
    // does not authorize later caller transcripts to select a HAM. Mint the
    // existing voice-session binding beside it, using the same verified council
    // receipt and logical call session but a HAM delivery target and independent
    // nonce. Pipecat forwards these fields unchanged and /voice/pai-turn verifies
    // them before any Memory Bank read or model call.
    var voiceSessionNonce = crypto.randomUUID();
    var voiceSessionInput = { hamUid:dv.ham_uid, message:'voice_session_bind',
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
  var effectClaim = await require('./outbound.effect.js').claimProviderAttempt({
    hamUid:recipientEnvelope.ham_uid, channel:'vara_call',
    deliveryTarget:{ kind:'phone', value:toPhone }, artifact:String(callReason),
    requestId:providerProof.request_id, cycleId:providerProof.cycle_id,
    sessionId:dv.initial_message_session_id
  });
  if (!effectClaim.ok) return { ok:false, reason:effectClaim.reason,
    effectKey:effectClaim.effectKey || null };
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
      body:JSON.stringify({ phone_number:toPhone, body:{
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
        voice_session_authorization:dv.voice_session_authorization
      } })
    });
    const pipecatBody = await pipecatResponse.json().catch(function(){ return {}; });
    const pipecatId = pipecatBody.call_control_id || pipecatBody.call_sid || null;
    if (pipecatResponse.ok && pipecatId) {
      return { ok:true, via:'pipecat_' + (pipecatBody.provider || 'telephony'),
        conversation_id:pipecatId, providerStatus:pipecatResponse.status };
    }
    if (pipecatResponse.ok) return { ok:false, reason:'provider_unverified',
      providerStatus:pipecatResponse.status };
    return { ok:false, reason:pipecatResponse.status >= 500 ||
      [408,425,429].indexOf(pipecatResponse.status) !== -1
      ? 'provider_uncertain' : 'provider_rejected',
      providerStatus:pipecatResponse.status };
  } catch (ePipecat) { return { ok:false, reason:'provider_uncertain' }; }
}

const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;
const GROQ = process.env.GROQ_API_KEY;

function bh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function founderUid() { const c=reachContext.getStore(); return String(c&&c.hamUid || process.env.FOUNDER_HAM_UID || process.env.OVERSEER_HAM_UID || '').toUpperCase(); }
function founderPhone() { const c=reachContext.getStore(); return c&&c.phone || process.env.FOUNDER_PHONE || process.env.BRANDON_PHONE || ''; }
function minGapMs() { return parseInt(process.env.OUTREACH_MIN_GAP_MS || '', 10) || 4 * 60 * 60 * 1000; }
function gapHeldSinceSent(lastSent, nowMs) {
  if (!lastSent || !lastSent.created_at) return false;
  return ((nowMs == null ? Date.now() : nowMs) - new Date(lastSent.created_at).getTime()) < minGapMs();
}

// ⬡B:core.outreach:GUARD:autonomous_words_commit_through_pai:20260715⬡
// Direct models may recommend whether and how to reach. They never author the
// bytes a person receives. The proposed message and its Memory Bank facts enter
// the one PAI cycle here; only the committed answer and compact proof leave.
async function commitReachMessage(kind, proposedMessage, facts, channel) {
  var hamUid = founderUid();
  if (!hamUid || !proposedMessage) return { ok:false, reason:'reach_commit_input_missing' };
  var deliveryTarget = null;
  if (/^(text|sms|voice)$/i.test(channel || '')) {
    var targetPhone = founderPhone();
    var councilForTarget = require('./pai.outbound.council.js');
    deliveryTarget = { kind:'phone', value:targetPhone };
    if (!targetPhone || !councilForTarget.canonicalizeDeliveryTarget(deliveryTarget)) {
      return { ok:false, reason:'reach_delivery_target_invalid' };
    }
  } else if (/^email$/i.test(channel || '')) {
    var emailContact = await require('../agents/ham-contact.js').getContact(hamUid);
    var targetEmail = emailContact && emailContact.email;
    var councilForEmail = require('./pai.outbound.council.js');
    deliveryTarget = { kind:'email', value:targetEmail };
    if (!targetEmail || !councilForEmail.canonicalizeDeliveryTarget(deliveryTarget)) {
      return { ok:false, reason:'reach_delivery_target_invalid' };
    }
  }
  var factRows = (facts || []).slice(0, 12).map(function (fact) {
    return formatReachFact(fact);
  });
  var question = 'Autonomous A\u2019NU ' + String(kind || 'reach')
    + ' event from these exact verified Memory Bank facts:\n'
    + (factRows.join('\n') || '(none)');
  var voiceOpenerRule = /^voice$/i.test(channel || '')
    ? ' This is spoken after the person answers. State the verified purpose and ask one grounded question. '
      + 'Do not mention a phone number, authorization mechanics, Memory Bank, journals, proof-writing, '
      + 'provider actions, or anything you are about to do.'
    : '';
  var prompt = 'Finalize one human-facing A\u2019NU message for this autonomous reach event. '
    + 'Use only the verified facts below. Return only the exact message the person should receive. '
    + 'Do not narrate the process, do not call a send/write/deploy tool, and do not add unsupported facts.'
    + voiceOpenerRule + '\n\n'
    + 'VERIFIED FACTS:\n' + (factRows.join('\n') || '(none)')
    + '\n\nREACH DEPARTMENT PROPOSAL:\n' + String(proposedMessage);
  var requestId = 'outreach.' + Date.now() + '.' + require('crypto').randomBytes(6).toString('hex');
  var evidence = (facts || []).slice(0, 8).map(function (fact) {
    return { ham_uid:hamUid, provenance:'memory_bank.exact_ham',
      source:fact.source || null, stamp_type:fact.stamp_type || null,
      summary:String(fact.summary || '').slice(0,500),
      evidence:formatReachFact(fact) };
  });
  try {
    var { runPAI } = require('./tool.loop.js');
    var council = require('./pai.outbound.council.js');
    var identity = { uid:hamUid, request_id:requestId, user_message:question,
      outbound_finalize:true, delivery:{ external:/^(text|sms|voice|email)$/i.test(channel || ''),
        longForm:channel === 'portal' },
      council_context:{ mode:'outreach', event_kind:String(kind || 'reach'),
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
    var committedReach = { ok:true, message:result.answer, councilProof:proof,
      cycleId:result.cycleId, requestId:requestId };
    Object.defineProperty(committedReach, '_councilResult', { enumerable:false, value:result });
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
    const filter = sentOnly ? '&source=like.outreach.sent.*' : '';
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + encodeURIComponent(founderUid()) + '&stamp_type=eq.OUTREACH' + filter + '&order=created_at.desc&limit=1&select=created_at,summary,content', { headers: bh() });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
  } catch (e) { return null; }
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
async function gatherFacts(sinceIso) {
  const uid = founderUid();
  const url = _bu() + '/rest/v1/' + _tbl() + ''
    + '?ham_uid=eq.' + encodeURIComponent(uid)
    + '&importance=gte.8'
    + '&created_at=gte.' + encodeURIComponent(sinceIso)
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
    + '&stamp_type=not.in.(OUTREACH,LOGFUL,MINUTES,AIR_START,AIR_CYCLE,CYCLE_LOCK,RESULT,GAP_FLAGS,TASK,TASK_DONE,TASK_INCOMPLETE,GIVE_UP_TRY,SEAL,KEY_BACKUP,LESSON,CHATTER,ROADMAP,MILESTONE,DIRECTIVE,DECISION,EXIT_DECISION,CYCLE_STEP,PAI_STAGE,RESPEC,CONTRIBUTION,ENRICHED,DIGEST,UNRESOLVED_INBOUND)'
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
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
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
        body: JSON.stringify({ model: (process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b'), messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 1200, temperature: 0.4 })
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
    // ⬡B:core.outreach:WIRE:reach_bead_carries_lineage:20260712⬡
    // Founder doctrine: the CLAIR command center shows LINEAGE on every message -- who
    // ultimately decided, read backwards from A'NU to A'NEW to the cycle. The lineage
    // system existed (core/lineage.js) but beads never carried it, so the view had
    // nothing to show. Every reach now carries its full lineage in its content.
    var lineage = {
      delivered_by: 'A\u2019NU (' + (result.proposedChannel || 'held') + ')',
      channel_decided_by: result.reachSource === 'deliberated' ? 'REACH department (deliberated the channel within its purposes)' : 'REACH cold ladder',
      judged_by: 'A\u2019NEW (judged whether to reach, the importance, and composed the message)',
      // backward chain: A'NU reads from REACH reads from A'NEW reads from the cycle
      chain: ['A\u2019NU', 'REACH', 'A\u2019NEW', 'PAI cycle'],
      why: (result.proposedWhy || result.reason || '').slice(0, 200),
      channel: result.proposedChannel,
      importance: result.importance,
      fired: !!(result.sent || result.funneled),
      at: Date.now()
    };
    var delivered = !!(result.sent || result.funneled);
    var withLineage = Object.assign({}, result, { lineage: lineage });
    var stampKey = String(result.requestId || '').replace(/[^A-Za-z0-9._:-]/g, '');
    if (!stampKey) stampKey = crypto.createHash('sha256').update(JSON.stringify({
      reason:result.reason || '', factIds:result.factIds || [],
      facts_count:result.facts_count || 0, sent:!!result.sent,
      funneled:!!result.funneled, judgment:result.judgment || null
    }), 'utf8').digest('hex');
    var source = 'outreach.' + (delivered ? 'sent' : 'held') + '.' + stampKey;
    var exactContent = JSON.stringify(withLineage);
    var payload = {
      ham_uid: founderUid(), agent_global: 'ANEW', stamp_type: 'OUTREACH',
      acl_stamp: '\u2b21B:core.outreach:OUTREACH:' + (delivered ? 'sent' : 'held') + ':' + ymd() + '\u2b21',
      source: source,
      summary: '[OUTREACH] ' + (delivered ? 'reached founder via ' + (result.proposedChannel || '') + ', ' : 'held, ') + (result.reason || '').slice(0, 110),
      content: exactContent,
      importance: delivered ? 8 : 3
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
    return won ? { ok:true, source:source, digest:digest, factIds:keys }
      : { ok:false, reason:'outreach_delivery_claim_denied', source:source,
        digest:digest, factIds:keys };
  } catch (e) {
    return { ok:false, reason:'outreach_delivery_claim_unverified', source:source,
      digest:digest, factIds:keys };
  }
}

// One full autonomous pass. Exported so a route can force it on demand.
async function outreachPass(force) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  // ⬡B:core.outreach:WIRE:unified_kill_switch:20260707⬡
  // span.task.unified_kill_switch -- checked before any real call or text
  // goes out, same brain-backed flag every reach path now shares.
  try {
    const killswitch = require('./killswitch.js');
    const ks = await killswitch.isActive(founderUid());
    if (ks.active) return { ok: true, sent: false, reason: 'kill_switch_active: ' + (ks.reason || '') };
  } catch (eKs) { return { ok:false, sent:false, reason:'kill_switch_unverified' }; }
  const lastSent = await lastOutreach(true);
  // A held judgment is not contact. Only a real delivery may start the quiet
  // gap; otherwise frequent PAI cycles can reset this clock forever and
  // mechanically prevent the first actual reach.
  const gapHeld = gapHeldSinceSent(lastSent);
  // Facts window: strictly newer than the last SENT outreach — the watermark — capped
  // at a 6h lookback for the very first pass of a fresh world.
  const floorIso = lastSent ? lastSent.created_at : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const facts = await gatherFacts(floorIso);
  const judgment = await judgeAndCompose(facts, gapHeld && !force);
  // COLD doctrine: an explicit, durable ask wins. The judgment model may still
  // paraphrase "call now" while contradictorily emitting REACH:NO or MESSAGE:NONE.
  // Correct only that mechanical contradiction here; the fact remains an uncommitted
  // proposal and the canonical PAI/council still authors every delivered byte.
  const explicitCallFact = explicitCallRequestFact(facts);
  if (explicitCallFact) {
    judgment.reach = true;
    judgment.importance = Math.max(9, Number(judgment.importance || 0),
      Number(explicitCallFact.importance || 0));
    if (!judgment.message || /^none\b/i.test(String(judgment.message).trim())) {
      judgment.message = String(explicitCallFact.content || explicitCallFact.summary || '');
    }
  }
  const result = { facts_count: facts.length, gapHeld, judgment, sent: false };

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
  const currentFactIds = factDeliveryKeys(facts);
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

  // ⬡B:core.outreach:FIX:hard_mechanical_rate_cap:20260708⬡
  // Real, live, severe incident, 4:20 AM: four real sends in under twenty
  // minutes despite the gap and despite the dedup, because importance>=9
  // kept getting self-scored regardless. The calibration fix above should
  // stop the scoring itself, but a prompt instruction is not provably
  // reliable under whatever pressure produced this in the first place --
  // a real, mechanical backstop that does not depend on the model
  // following a new instruction correctly. HARD_SEND_FLOOR_MS: never more
  // than one real send per real hour, full stop, no importance override,
  // UNLESS this is genuinely the first alert ever (last is null). This is
  // deliberately blunt on purpose -- it trades a small chance of a slightly
  // delayed genuine emergency against a proven, repeated, real harm
  // tonight. force still bypasses it, matching every other real override
  // in this file.
  const HARD_SEND_FLOOR_MS = 60 * 60 * 1000;
  const hardFloorHeld = lastSent
    && (Date.now() - new Date(lastSent.created_at).getTime()) < HARD_SEND_FLOOR_MS;

  const allowed = judgment.reach && judgment.message && !repeatingSameAlert && !repeatingSameCondition
    && (!hardFloorHeld || force)
    && (!gapHeld || force || judgment.importance >= 9);

  // ⬡B:core.outreach:FIX:record_proposed_channel_pt1:20260708⬡
  // pt1 doctrine: on EVERY reach decision (sent or held), record WHICH channel she
  // judged this warranted and WHY, so the CLAIR Command Center can show "she wanted to
  // CALL you about X because Y (importance 9)" and the founder can correct her channel
  // judgment against the wall. Purely additive -- it labels the decision, it does not
  // change what fires. Voice for real urgency, text for time-sensitive, command center
  // (logged, no interruption) for everything else -- her phone-calls-are-sacred rule.
  // ⬡B:core.outreach:WIRE:reach_segmentation_formula:20260711b⬡
  // Re-applied. This was shipped once and then LOST when another lane rewrote these
  // same lines back to the flat ladder during a rebase. Kept inline (no separate
  // function) so it stays contiguous and cannot be silently orphaned again.
  // Scored surface: importance + time-sensitivity + whether it needs an answer.
  var _rtxt = ((judgment.reason || '') + ' ' + (judgment.message || '')).toLowerCase();
  var _rTime = /(today|tonight|right now|urgent|deadline|due |overdue|asap|expires|by (mon|tue|wed|thu|fri|sat|sun|tomorrow)|within \d+ ?(h|hour|min))/.test(_rtxt);
  var _rAns = /\?|confirm|approve|decide|which one|should i|do you want|your call|need you/.test(_rtxt);
  result.reachScore = Math.round((((judgment.importance || 0)) + (_rTime ? 1.5 : 0) + (_rAns ? 1 : 0)) * 10) / 10;
  // \u2b21B:core.outreach:FIX:call_and_text_get_real_separate_purposes:20260711\u2b21
  // Founder doctrine pt6, direct: 'she's about to call AND text -- why would you do
  // both? They have to find purposes, but it's up to us to define the purposes.'
  // Prior rule: importance>=9 alone fired BOTH simultaneously, no distinction.
  // Real purposes, defined: CALL (direct, interruptive) is reserved for the narrow
  // true drop-everything case -- high importance AND time-sensitive AND needs an
  // actual decision from him now. TEXT alone covers 'needs to know soon' without
  // requiring a live interruption. A call is never paired with a simultaneous text
  // blast -- if the call is the right channel, the call IS the message; text is only
  // ever the FALLBACK when a call attempt goes unanswered (a separate, later event,
  // not fired here).
  var _dropEverything = judgment.importance >= 9 && _rTime && _rAns;
  var _ladderChannel =
      _dropEverything ? 'voice'
    : (_rTime && judgment.importance >= 5) ? 'text'
    : (_rAns && judgment.importance >= 5) ? 'command_center'
    : (judgment.importance >= 6) ? 'text'
    : (judgment.importance >= 3) ? 'command_center'
    : 'portal';
  // \u2b21B:core.outreach:WIRE:correction_loop_applied:20260711\u2b21
  // Founder doctrine: 'she indicates what SHOULD have been... we correct the wall the
  // LLM reads from.' The static ladder above is the cold default; a founder's own
  // standing correction for this shape of decision overrides it. Read-side is pure
  // lookup (cold), the judgment on whether a correction generalizes already happened
  // when it was recorded (reach/correctionLoop.js).
  result.proposedChannel = _ladderChannel;
  try {
    result.proposedChannel = await require('../reach/correctionLoop.js').applyCorrections(founderUid(), judgment, _ladderChannel);
  } catch (eCorr) { /* never blocks a decision if the correction lookup fails */ }
  result.proposedWhy = judgment.reason || '';
  result.importance = judgment.importance;
  // ⬡B:core.outreach:WIRE:reach_department_deliberation:20260711⬡
  // The Reach department (wonder) refines the cold ladder where it matters: honors an
  // explicit ask, and deliberates the one right channel within the defined purposes.
  // Additive and fail-open, the cold ladder stands if the department cannot run.
  try {
    var _rd = await require('../reach/reach.department.js').decideReach(judgment,
      result.proposedChannel, { verifiedEvidence:facts.map(formatReachFact).join('\n') });
    if (_rd && _rd.channel) { result.proposedChannel = _rd.channel; result.proposedWhy = _rd.why || result.proposedWhy; result.reachSource = _rd.source; }
  } catch (eRd) { /* fail open: cold ladder decision stands */ }

  if (allowed) {
    var commitChannel = /voice/i.test(result.proposedChannel) ? 'voice'
      : result.proposedChannel === 'text' ? 'text'
      : result.proposedChannel === 'email' ? 'email' : 'portal';
    var committedMessage = await commitReachMessage('priority outreach', judgment.message,
      facts, commitChannel);
    if (!committedMessage.ok) {
      result.reason = 'pai_council_held_outreach:' + committedMessage.reason;
      result.judgment.message = '';
      var councilHeldStamp = await stampOutreach(result);
      if (!councilHeldStamp.ok) result.stampReason = councilHeldStamp.reason;
      return { ok:false, ...result };
    }
    judgment.message = committedMessage.message;
    result.councilProof = committedMessage.councilProof;
    result.cycleId = committedMessage.cycleId;
    result.requestId = committedMessage.requestId;
    // ⬡B:core.outreach:GUARD:durable_fact_set_single_flight:20260715⬡
    // The durable claim is keyed by the real underlying fact set, never the
    // model's wording. Once acquired it is not released after an ambiguous
    // provider result or a failed audit stamp, so the next alarm tick cannot
    // resend the same condition under fresh prose.
    var deliveryClaim = await claimOutreachDelivery('priority', facts);
    result.deliveryClaim = { source:deliveryClaim.source,
      digest:deliveryClaim.digest, factIds:deliveryClaim.factIds };
    if (!deliveryClaim.ok) {
      result.reason = deliveryClaim.reason;
      var duplicateStamp = await stampOutreach(result);
      if (!duplicateStamp.ok) result.stampReason = duplicateStamp.reason;
      return { ok:false, ...result };
    }
    // ⬡B:core.outreach:WIRE:reach_funnel_redirect:20260708⬡
    // Reach funnel (pt1/pt6): when the founder flips the funnel ON, a decision that
    // WOULD have fired does not call or text -- the full what/how/why lands in the
    // CLAIR Command Center instead, so he judges her channel judgment and corrects the
    // wall. Reversible flag, auto-expires in 7 days, NOT a credential strip. When the
    // flag is off (default), this block is a no-op and reach behaves exactly as before.
    try {
      const funnel = require('./reachFunnel.js');
      const ff = await funnel.isActive(founderUid());
      if (ff.active) {
        var funnelResult = await funnel.funnelInsteadOfSend(founderUid(), judgment, result.proposedChannel,
          { councilProof:result.councilProof, cycleId:result.cycleId, requestId:result.requestId,
            facts_count: facts.length, factIds: currentFactIds, pass: 'outreachPass' });
        result.funneled = !!(funnelResult && funnelResult.ok === true);
        result.reason = result.funneled ? 'funneled_to_command_center'
          : 'command_center_write_failed';
        var funnelStamp = await stampOutreach(result);
        if (!funnelStamp.ok) {
          result.stampReason = funnelStamp.reason;
          return { ok:false, providerAccepted:result.funneled, ...result };
        }
        return { ok:result.funneled, ...result };
      }
    } catch (eFn) { /* fail open: a broken funnel check must never block real reach */ }
    // Outbound passes the same gate as inbound — resolve the founder's phone through
    // ATMOSPHERE so the send is stamped against the right world, never a bare number.
    let toPhone = founderPhone();
    try {
      const { resolveAtmosphere } = require('./atmosphere.gate.js');
      const founderEnv = await resolveAtmosphere({ phone: toPhone });
      if (founderEnv && founderEnv.ham_uid) result.founder_ham = founderEnv.ham_uid;
    } catch (e) {}
    // One channel per committed message. Text fallback is permitted only when
    // voice was definitively rejected or no provider request was made. Ambiguous
    // provider results never trigger a second channel.
    if (/voice/i.test(result.proposedChannel)) {
      const callResult = await placeCall(toPhone, judgment.message, committedMessage._councilResult);
      result.called = !!callResult.ok;
      result.call_receipt = callResult.conversation_id || null;
      result.call_via = callResult.via || callResult.reason;
      result.sent = result.called;
      const safeTextFallback = callResult &&
        /^(provider_rejected|provider_not_configured)$/.test(callResult.reason || '');
      if (!result.called && safeTextFallback) {
        const fallbackSend = await tapSend(toPhone, judgment.message, founderUid(),
          committedMessage._councilResult);
        result.sent = !!(fallbackSend && fallbackSend.ok === true && fallbackSend.message_id);
        result.send_receipt = fallbackSend && (fallbackSend.message_id || null);
        result.fallback_channel = 'text';
        if (!result.sent) result.reason = fallbackSend && fallbackSend.reason || 'text_delivery_unverified';
      } else if (!result.called) {
        result.reason = callResult && callResult.reason || 'voice_delivery_unverified';
      }
    } else if (result.proposedChannel === 'text') {
      const sendResult = await tapSend(toPhone, judgment.message, founderUid(),
        committedMessage._councilResult);
      result.sent = !!(sendResult && sendResult.ok === true && sendResult.message_id);
      result.send_receipt = sendResult && (sendResult.message_id || null);
      if (!result.sent) result.reason = sendResult && sendResult.reason || 'text_delivery_unverified';
    } else if (result.proposedChannel === 'email') {
      const context = reachContext.getStore() || {};
      const emailSubject = String(judgment.reason || 'A\u2019NU reached out')
        .replace(/[\r\n\0]+/g, ' ').trim().slice(0, 160) || 'A\u2019NU reached out';
      const emailResult = context.world
        ? await require('../reach/iman.js').sendToHam(founderUid(),
          emailSubject, judgment.message,
          context.world, { hamUid:founderUid() })
        : { ok:false, reason:'email_world_unresolved' };
      result.sent = !!(emailResult && emailResult.ok && emailResult.messageId);
      result.send_receipt = emailResult && emailResult.messageId || null;
      if (!result.sent) result.reason = emailResult && emailResult.reason || 'email_delivery_unverified';
    } else {
      const portalResult = await require('./reachFunnel.js').funnelInsteadOfSend(
        founderUid(), judgment, result.proposedChannel,
        { councilProof:result.councilProof, cycleId:result.cycleId, requestId:result.requestId,
          facts_count:facts.length, factIds:currentFactIds, pass:'outreachPass' });
      result.funneled = !!(portalResult && portalResult.ok);
      result.reason = result.funneled ? 'routed_to_command_center' : 'command_center_write_failed';
    }
    if (!result.reason || result.reason === 'routed_to_command_center') {
      result.reason = result.reason || judgment.reason;
    }
    result.message = judgment.message;
  } else {
    result.reason = repeatingSameAlert ? 'held_repeating_same_alert' : repeatingSameCondition ? 'held_repeating_same_condition_reworded' : hardFloorHeld ? 'held_hard_rate_cap' : (judgment.reach ? (gapHeld ? 'held_min_gap' : 'no_message_composed') : (judgment.reason || 'judged_hold'));
  }
  var finalStamp = await stampOutreach(result);
  if (!finalStamp.ok) {
    result.stampReason = finalStamp.reason;
    return { ok:false, providerAccepted:!!(result.sent || result.funneled), ...result };
  }
  return { ok: true, ...result };
}

function startOutreach(intervalMs) {
  const ms = intervalMs || parseInt(process.env.OUTREACH_INTERVAL_MS || '', 10) || 30 * 60 * 1000;
  const timer = setInterval(function () {
    outreachPass(false).catch(function (e) { console.log('[OUTREACH] pass error:', e.message); });
  }, ms);
  if (timer.unref) timer.unref();
  console.log('[OUTREACH] autonomous founder-reach started, every', ms / 60000, 'minutes');
  return timer;
}

// ANYHAM entry for the cycle handoff. AsyncLocalStorage keeps the extensive,
// battle-tested REACH gates intact while scoping every brain query, claim,
// provider target, and audit stamp to the HAM whose PAI cycle just completed.
async function outreachPassForHam(hamUid, force, options) {
  var uid = String(hamUid || '').toUpperCase();
  if (!uid) return { ok:false, reason:'ham_uid_required' };
  var contact = await require('../agents/ham-contact.js').getContact(uid);
  if (!contact || (!contact.phone && !contact.email)) return { ok:false, reason:'no_contact_for_ham' };
  var world = options&&options.world || contact.world || null;
  if (contact.phone) {
    try {
      var atmosphere = await require('./atmosphere.gate.js').resolveAtmosphere({ phone:contact.phone });
      if (atmosphere && atmosphere.world) world = atmosphere.world;
      if (atmosphere && atmosphere.ham_uid && String(atmosphere.ham_uid).toUpperCase() !== uid) {
        return { ok:false, reason:'recipient_ham_mismatch' };
      }
    } catch (eAtmosphere) { return { ok:false, reason:'recipient_identity_unresolved' }; }
  }
  return reachContext.run({ hamUid:uid, phone:contact.phone || '', email:contact.email || '', world:world },
    function () { return outreachPass(!!force); });
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
async function lastDigest() {
  try {
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + founderUid()
      + '&stamp_type=eq.DIGEST&order=created_at.desc&limit=1&select=created_at', { headers: bh() });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
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
        body: JSON.stringify({ model: (process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b'), messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 1500, temperature: 0.4 })
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
      var ccNote = ccM ? ccM[1].trim().slice(0, 300) : 'Routine day, nothing requiring attention.';
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
        content: JSON.stringify({ reason: reason, held_message: (heldMessage || '').slice(0, 300) }),
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
    var delivered = !!(result.sent || result.funneled);
    var key = String(result.requestId || result.deliveryClaim && result.deliveryClaim.digest || '')
      .replace(/[^A-Za-z0-9._:-]/g, '');
    if (!key) key = crypto.createHash('sha256').update(JSON.stringify(result), 'utf8').digest('hex');
    var source = 'outreach.digest.' + (delivered ? 'sent' : 'held') + '.' + key;
    var exactContent = JSON.stringify(result);
    var payload = {
      ham_uid:founderUid(), agent_global:'ANEW', stamp_type:'DIGEST',
      acl_stamp:'\u2b21B:core.outreach:DIGEST:' + (delivered ? 'sent' : 'held') + ':' + ymd() + '\u2b21',
      source:source,
      summary:'[DIGEST] ' + (delivered ? 'delivered real update' : 'held') +
        ' -- ' + (result.facts_count || 0) + ' real facts in window',
      content:exactContent, importance:delivered ? 6 : 2
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
  const last = await lastDigest();
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
  if (last && (Date.now() - new Date(last.created_at).getTime()) < DIGEST_HARD_FLOOR_MS) {
    return { ok: true, skipped: 'held_hard_rate_cap' };
  }
  const floorIso = last ? last.created_at : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const facts = await gatherDigestFacts(floorIso);
  if (!facts.length) return { ok: true, skipped: 'nothing_new_since_last_update' };
  // Claim the real fact set before composeDigest can write a Command Center
  // report or the provider edge can send a text. A failed/ambiguous attempt
  // keeps this permanent claim, preventing a later tick from narrating and
  // delivering the same facts again under different wording.
  const digestClaim = await claimOutreachDelivery('digest', facts);
  if (!digestClaim.ok) {
    var duplicateResult = { facts_count:facts.length, factIds:digestClaim.factIds,
      sent:false, funneled:false, reason:digestClaim.reason,
      deliveryClaim:{ source:digestClaim.source, digest:digestClaim.digest } };
    var duplicateDigestStamp = await stampDigest(duplicateResult);
    if (!duplicateDigestStamp.ok) duplicateResult.stampReason = duplicateDigestStamp.reason;
    return Object.assign({ ok:false }, duplicateResult);
  }
  const composed = await composeDigest(facts);
  const result = { facts_count: facts.length, sent: false,
    councilProof:composed.councilProof || null, cycleId:composed.cycleId || null,
    requestId:composed.requestId || null,
    reason:composed.reason || null, factIds:digestClaim.factIds,
    deliveryClaim:{ source:digestClaim.source, digest:digestClaim.digest } };
  if (composed.routedToCommandCenter === true && composed.funneled === true) {
    result.funneled = true;
    result.reason = 'routed_to_command_center';
  }
  if (composed.ok && composed.message) {
    // ⬡B:core.outreach:FIX:digest_never_checked_the_reach_funnel:20260709⬡
    // Real, genuine gap, found verifying the funnel would not break on flip-back:
    // outreachPass (the alarm path) checks reachFunnel before sending; checkDailyDigest
    // never did, so a genuinely real daily update could still text directly while the
    // founder's own funnel doctrine says all reach should be landing in Command Center
    // right now. Same check, same fail-open safety, same reversible flag.
    let funneled = false;
    try {
      const funnel = require('./reachFunnel.js');
      const ff = await funnel.isActive(founderUid());
      if (ff.active) {
        var digestFunnelResult = await funnel.funnelInsteadOfSend(founderUid(),
          { message: composed.message, reason: 'daily digest', importance: 5 }, 'text',
          { councilProof:result.councilProof, cycleId:result.cycleId,
            requestId:result.requestId, facts_count: facts.length, pass: 'checkDailyDigest' });
        result.funneled = !!(digestFunnelResult && digestFunnelResult.ok === true);
        result.reason = result.funneled ? 'funneled_to_command_center'
          : 'command_center_write_failed';
        funneled = true; // an attempted redirect never falls through to a second channel
      }
    } catch (eFn) { /* fail open: a broken funnel check must never block a real digest */ }
    if (!funneled) {
      const toPhone = founderPhone();
      const sendResult = await tapSend(toPhone, composed.message, founderUid(),
        composed._councilResult);
      result.sent = !!(sendResult && sendResult.ok === true && sendResult.message_id);
      result.send_receipt = sendResult && sendResult.message_id || null;
      if (!result.sent) result.reason = sendResult && sendResult.reason || 'digest_delivery_unverified';
      result.message = composed.message;
    }
  }
  var digestStamp = await stampDigest(result);
  if (!digestStamp.ok) {
    result.stampReason = digestStamp.reason;
    return Object.assign({ ok:false, providerAccepted:!!(result.sent || result.funneled) }, result);
  }
  return result;
}

module.exports = { outreachPass, outreachPassForHam, startOutreach, placeCall, checkDailyDigest,
  _test:{ gapHeldSinceSent, formatReachFact, explicitCallRequestFact } };
