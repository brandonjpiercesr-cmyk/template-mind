// ⬡B:routes.vara.llm.routes:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
// ⬡B:routes.vara.llm:ROUTE:custom_llm_pai:20260630⬡
// entered via the ABAHAM door, serving channel VOICE
// VARA Custom LLM, OpenAI-compatible /v1/chat/completions for ElevenLabs ConvAI.
// Every voice turn flows through the full PAI cycle, streamed back as SSE.
// ANYHAM: ham_uid comes from dynamic_variables, resolved per call. No hardcode.
// First chunk fast so ElevenLabs doesn't time out the cascade.
const { runPAI } = require('../core/tool.loop.js');
const { synthesize } = require('../core/synthesize.js');
const crypto = require('node:crypto');

module.exports = function(app) {
  // ⬡B:routes.vara.llm:FIX:live_agent_pointed_at_legacy:20260702⬡
  // Founder screenshot, three missed calls: "I need to verify who you are first."
  // Root cause, proven live: the ElevenLabs agent's custom_llm.url and
  // conversation_initiation_client_data_webhook both point at ababase.onrender.com
  // -- the legacy service -- not this one. Direct proof: hitting legacy's own
  // /v1/chat/completions standalone returned the EXACT screenshot text with
  // debug.reason "no_ham_resolvable", and its init-context webhook resolves the
  // founder to the ghost UID the founder value, now from env, not canonical the env value -- the same alias
  // bug fixed on the text channel last night, never applied to this legacy path.
  // Every fix from tonight (honesty rule, journal reach, attribution, memory
  // keeper) lives here, on aibebase, and none of it reaches voice while the agent
  // points elsewhere. This adds the exact route shape ElevenLabs' custom LLM
  // convention expects (base URL + /chat/completions) so the agent config can be
  // repointed at this service without inventing a new integration pattern.
  var handleChat = async function(req, res) {
    var body = req.body || {};
    var messages = body.messages || [];

    // ⬡B:routes.vara.llm:SUPERSEDE:remove_served_diagnostic:20260704⬡
    // The one-time raw-shape logger (log_raw_request_shape, 20260703) is gone.
    // Its own comment said it removes itself once the real shape is known, and
    // the fix two comments below it already confirms that shape was learned
    // and used. It also always stamped the founder's own UID regardless of
    // who was actually calling, since it ran before ham_uid resolution below
    // -- CANON correctly caught that as hardcoded identity. Served its purpose,
    // gone now rather than patched.

    // Pull ham_uid from dynamic_variables (set by personalization webhook at call start)
    var hamUid = null;
    try {
      // ⬡B:routes.vara.llm:FIX:elevenlabs_extra_body_real_shape:20260703⬡
      // Proven live tonight with my own request-shape logger, real call, two
      // samples: the real body has topLevelKeys including "elevenlabs_extra_body",
      // hasDynamicVariables false, hasHamUid false at top level. The prior fix
      // assumed either a top-level merge or one more nesting level
      // (elevenlabs_extra_body.dynamic_variables.ham_uid) than what's actually
      // sent. The real shape is flat one level in: elevenlabs_extra_body.ham_uid
      // directly, because outreach.js's placeCall sets both
      // conversation_initiation_client_data.dynamic_variables and
      // .custom_llm_extra_body to the SAME flat object, and ElevenLabs relays
      // custom_llm_extra_body's own keys straight through under the wrapper
      // name elevenlabs_extra_body, no inner dynamic_variables layer.
      var dv = Object.assign({},
        body.extra_body && body.extra_body.dynamic_variables || {},
        body.elevenlabs_extra_body && body.elevenlabs_extra_body.dynamic_variables || {},
        body.elevenlabs_extra_body || {}, body.dynamic_variables || {});

      hamUid = dv.ham_uid || dv.hamUid || null;
      // ⬡B:routes.vara.llm:FIX:top_level_ham_uid_threading:20260703⬡
      // The personalization webhook returns custom_llm_extra_body: { ham_uid: ... },
      // and ElevenLabs merges custom_llm_extra_body keys into the TOP LEVEL of the
      // /chat/completions request body -- not under dynamic_variables. So a fully
      // resolved founder call still arrived here with hamUid null and fell to GUEST.
      // Confirmed live 20260703: resolved calls logging as pai.minutes.GUEST.
      if (!hamUid) hamUid = body.ham_uid || body.hamUid || null;
    } catch(e) {}

    // ⬡B:routes.vara.llm:FIX:carry_call_reason_into_live_turn:20260703⬡
    // Founder finding, live tonight: called for a real reason, asked mid-call
    // what it was about, got "I'm not sure what you're referring to." The
    // reason traveled with the call initiation the same way identity does
    // (dv / custom_llm_extra_body, merged to top level by ElevenLabs). Read
    // it the same way, hand it to the Memory Bank as part of the identity envelope
    // so the live turn can answer honestly instead of asking to be re-briefed
    // on what it just did itself.
    var callReason = null;
    try {
      callReason = dv.call_reason || (body.elevenlabs_extra_body && body.elevenlabs_extra_body.call_reason) || body.call_reason || null;
    } catch (eCr) {}

    // Last user message is the spoken turn
    var userMsg = '';
    var userMsgIndex = -1;
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsg = messages[i].content || ''; userMsgIndex = i; break; }
    }

    // ⬡B:routes.vara.llm:FIX:carry_real_history_into_pai:20260704⬡
    // Founder-reported live incident: the assistant sounds confused about who
    // it's talking to on calls, worse as a call runs longer. ElevenLabs sends
    // the real turn-by-turn history right here in `messages`, properly
    // role-tagged, and until now everything before the last user turn was
    // simply never read. Threading it through runPAI's new optional
    // priorTurns parameter so each turn actually has the call's own real
    // history to work from, not just a fresh two-message prompt every time.
    var priorTurns = messages.slice(0, userMsgIndex >= 0 ? userMsgIndex : messages.length)
      .filter(function(m){ return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(); });

    var stream = body.stream !== false;

    // ⬡B:routes.vara.llm:GUARD:signed_session_bound_every_voice_turn:20260715⬡
    // Personalization signs one short-lived logical conversation session. Every
    // turn must carry that request, binding cycle, HAM target, expiry, and nonce.
    // This prevents a caller-injected ham_uid from selecting another Memory Bank.
    var sessionInput = {
      hamUid:String(hamUid || ''), message:'voice_session_bind',
      receiptDigest:String(dv.voice_session_receipt_digest || ''),
      requestId:String(dv.voice_session_request_id || ''),
      cycleId:String(dv.voice_session_cycle_id || ''),
      deliveryTarget:{ kind:String(dv.voice_session_target_kind || ''),
        value:String(dv.voice_session_target_value || '') },
      sessionId:String(dv.voice_session_id || ''),
      expiresAt:Number(dv.voice_session_expires_at),
      nonce:String(dv.voice_session_nonce || ''),
      purpose:'voice_session_bind'
    };
    var sessionOk = require('../core/pai.outbound.authorization.js')
      .verifyInitialMessage(sessionInput, String(dv.voice_session_authorization || ''));
    if (!sessionOk || String(dv.voice_session_target_value || '').toUpperCase() !==
        String(hamUid || '').toUpperCase()) {
      return res.status(401).json({ ok:false, reason:'voice_session_unverified' });
    }
    try {
      var sessionEnvelope = await require('../core/atmosphere.gate.js')
        .resolveAtmosphere({ hamUid:hamUid });
      if (!sessionEnvelope || String(sessionEnvelope.ham_uid).toUpperCase() !==
          String(hamUid).toUpperCase()) {
        return res.status(401).json({ ok:false, reason:'voice_session_identity_mismatch' });
      }
      hamUid = sessionEnvelope.ham_uid;
    } catch (eSessionIdentity) {
      return res.status(503).json({ ok:false, reason:'voice_session_identity_uncertain' });
    }
    if (!userMsg) userMsg = 'Hello.';

    // ⬡B:routes.vara.llm:FIX:identity_before_stream_shared_gate:20260706⬡
    // L0.2 LAW: the stream opens through the one shared gate, only after hamUid
    // is final (resolved by the personalization webhook via ATMOSPHERE at call
    // start, threaded here through dynamic_variables; GUEST is an explicit
    // resolution result, not a skipped resolution). The gate carries the
    // anti-buffering header set and the heartbeat so a long PAI deliberation
    // never reads as a dead connection mid-call.
    var gate = null;
    if (stream) {
      var { openIdentityStream } = require('../core/stream.gate.js');
      gate = openIdentityStream(res, { ham_uid: hamUid, via: 'vara_dynamic_variables' });
    }

    function sseChunk(text) {
      var payload = {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'vara-pai',
        choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
      };
      gate.send(payload);
    }
    function sseDone(councilProof) {
      var payload = {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'vara-pai',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      };
      if (councilProof) payload.council_proof = councilProof;
      gate.send(payload);
      gate.done('data: [DONE]\n\n');
    }

    try {
      // \u2b21B:routes.vara.llm:FIX:voicemail_greeting_treated_as_real_input:20260708\u2b21
      // Real, live incident found via CYCLE_STEP observability: outbound calls
      // hitting voicemail had the carrier's own greeting transcribed and run
      // through a full real PAI cycle as if the founder said it -- "the
      // person you're trying to reach is not available," "when you have
      // finished recording, you may hang up" -- burning a real model call
      // and a real tool_call each time, then speaking a nonsense reply back
      // into a machine. No check for this existed anywhere in this file.
      var VOICEMAIL_PATTERN = /\b(person you.?re trying to reach|not available|leave a message after the (tone|beep)|when you have finished recording|mailbox (is full|belonging to)|please record your message|voicemail)\b/i;
      if (VOICEMAIL_PATTERN.test(userMsg)) {
        if (stream && gate) { sseDone(); } else { res.status(200).json({ ok: true, skipped: 'voicemail_greeting_detected' }); }
        return;
      }
      // Run full PAI cycle for this spoken turn
      // ⬡B:routes.vara.llm:GUARD:no_voice_before_committed_council:20260715⬡
      // Stream keepalives carry no assistant content. The first spoken byte is
      // always part of the exact answer committed and read back by the council.
      var voiceTarget = { kind:'ham', value:hamUid };
      var voiceIdentity = { user_message: userMsg, delivery:{ external:true },
        council_context: { mode:'voice', original_user_message:userMsg,
          delivery_target:voiceTarget } };
      if (callReason) voiceIdentity.call_reason = callReason;
      var paiResult = await runPAI(hamUid, userMsg, 'voice', voiceIdentity, priorTurns);
      var text = '', synth = null, councilProof = null, councilFailure = null;
      if (paiResult && paiResult.ok) {
        var outboundCouncil = require('../core/pai.outbound.council.js');
        var requestId = paiResult.requestId || paiResult.request_id;
        var cycleId = paiResult.cycleId || paiResult.cycle_id;
        var committed = outboundCouncil.requireVerifiedCouncilResult(paiResult, {
          hamUid: hamUid,
          requestId: requestId,
          cycleId: cycleId,
          question: userMsg,
          deliberationInput: userMsg,
          answer: paiResult.answer,
          deliveryTarget:voiceTarget
        });
        councilProof = outboundCouncil.compactCouncilProof(paiResult);
        var voiceTargetBinding = outboundCouncil.createDeliveryTargetBinding(voiceTarget);
        if (!committed || committed.ok !== true || committed.answer !== paiResult.answer ||
            !councilProof || councilProof.committed !== true || councilProof.readback_verified !== true ||
            councilProof.row_count !== 9 || !voiceTargetBinding ||
            councilProof.delivery_target_digest !== voiceTargetBinding.delivery_target_digest ||
            councilProof.delivery_target_bytes !== voiceTargetBinding.delivery_target_bytes) {
          councilFailure = committed && committed.reason || 'council_commit_unverified';
        }
      }
      if (paiResult && paiResult.ok && !councilFailure && councilProof) {
        synth = await synthesize(paiResult, userMsg, 'voice');
        if (synth.ok && typeof synth.text === 'string' && synth.text.length > 0 &&
            committed && synth.text === committed.answer) text = synth.text;
      }
      // \u2b21B:routes.vara.llm:FIX:hollow_reply_law_enforced:20260703\u2b21
      // Founder law, verbatim: real answer or ok:false and the channel stays SILENT.
      // This block previously SPOKE '[diag] <reason>' out loud on a live call when
      // the cycle came back empty, and the catch below spoke 'I had trouble with
      // that. Say it again?' -- both are exactly the hollow-reply class the law
      // bans. Failures now land in LOGFUL, the record of what the LLMs did, and
      // the voice says nothing. Silence over hollow, always.
      if (!text) {
        var _dbg = (paiResult && paiResult._dbg) || (synth && synth.reason) || councilFailure ||
          (paiResult && paiResult.reason) || 'empty';
        try {
          var { logfulStore } = require('../logful/index.js');
          logfulStore({ hamUid: hamUid, agent: 'VARA', type: 'voice_turn_silent', data: { reason: String(_dbg).slice(0, 300), question: userMsg.slice(0, 200) }, summary: 'voice turn went silent: ' + String(_dbg).slice(0, 60) });
        } catch (eLog) {}
        if (stream) { sseDone(); } else {
          res.json({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'vara-pai',
            choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }]
          });
        }
        return;
      }

      require('../logful/index.js').logfulStore({ hamUid: hamUid, agent: 'VARA', type: 'channel_turn',
        data: { channel: 'voice_phone', inputData: userMsg, answer: text },
        summary: '[VOICE turn] ' + String(userMsg).slice(0, 80), importance: 5 }).catch(function(){}); // \u2b21B:memory.unification:BUILD:every_channel_saves_full_turns_20260710\u2b21
      if (stream) {
        // Transport chunks preserve every approved whitespace byte exactly.
        var words = text.split(/(\s+)/);
        for (var w = 0; w < words.length; w++) {
          if (words[w]) sseChunk(words[w]);
        }
        sseDone(councilProof);
      } else {
        res.json({
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'vara-pai',
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          council_proof: councilProof
        });
      }
    } catch(e) {
      // Same law on the error path: record it, stay silent, never speak scaffold.
      try {
        var lf = require('../logful/index.js');
        lf.logfulStore({ hamUid: hamUid, agent: 'VARA', type: 'voice_turn_error', data: { reason: String(e && e.message || e).slice(0, 300) }, summary: 'voice turn errored: ' + String(e && e.message || e).slice(0, 60) });
      } catch (eLog2) {}
      if (stream) { sseDone(); }
      else res.status(500).json({ error: e.message });
    }
  };

  // ElevenLabs calls this as its LLM backend during a live voice conversation.
  // Mounted at both paths: /vara/llm (this repo's own convention) and
  // /v1/chat/completions (the OpenAI-compatible shape ElevenLabs' custom_llm
  // config expects when url is set to a bare base like https://host/v1 -- it
  // appends /chat/completions itself, same convention the legacy service used).
  app.post('/vara/llm', handleChat);
  app.post('/v1/chat/completions', handleChat);

  // Personalization webhook, ElevenLabs calls this when a call connects
  // Resolves caller phone → ham_uid via ATMOSPHERE, returns dynamic_variables
  app.post('/vara/personalize', async function(req, res) {
    var body = req.body || {};
    var callerId = body.caller_id || body.from_number || body.caller || '';
    var ATM_URL = process.env.ATMOSPHERE_URL || 'https://atmosphere-x2oi.onrender.com';
    var initData = body.conversation_initiation_client_data || {};
    var handoffVars = Object.assign({}, initData.dynamic_variables || {},
      initData.custom_llm_extra_body || {},
      body.elevenlabs_extra_body && body.elevenlabs_extra_body.dynamic_variables || {},
      body.elevenlabs_extra_body || {}, body.dynamic_variables || {},
      body.custom_llm_extra_body || {});

    // ⬡B:routes.vara.llm:FIX:apply_ham_alias_20260630⬡
    // Same alias map already proven live for the text channel (core/wren/reply.js)
    // was never applied here. Without it, a call from Brandon's real phone resolves
    // to the legacy ghost UID (the founder value, now from env) via ATMOSPHERE, PAI loads empty world context
    // for voice exactly the way it did for text before that fix, same bug class,
    // different channel, found by actually reading this file instead of assuming.
    // ⬡B:routes.vara.llm:WIRE:one_gate:20260701⬡, inline alias copy replaced by the
    // shared ATMOSPHERE gate. One gate, every channel.
    var hamUid = 'GUEST', hamName = 'there', trustLevel = '0', world = 'guest';
    // ⬡B:routes.vara.llm:GUARD:nonce_scoped_web_session_identity:20260715⬡
    // Browser calls have no caller phone. Verify the signed, conversation-scoped
    // identity variables returned with this session URL; never consume a global
    // newest-row bind that can cross concurrent callers.
    if (!callerId && handoffVars.web_session_nonce &&
        handoffVars.web_session_authorization && handoffVars.ham_uid) {
      try {
        var nonceDigest = crypto.createHash('sha256')
          .update(String(handoffVars.web_session_nonce)).digest('hex');
        var declaredDigest = String(handoffVars.web_session_nonce_digest || '');
        var webInput = {
          hamUid:String(handoffVars.ham_uid), message:'web_session_bind',
          receiptDigest:declaredDigest,
          requestId:String(handoffVars.web_session_request_id || ''),
          cycleId:String(handoffVars.web_session_cycle_id || ''),
          deliveryTarget:{ kind:String(handoffVars.web_session_target_kind || ''),
            value:String(handoffVars.web_session_target_value || '') },
          sessionId:String(handoffVars.web_session_session_id || ''),
          expiresAt:Number(handoffVars.web_session_expires_at),
          nonce:String(handoffVars.web_session_nonce), purpose:'web_session_bind'
        };
        var authResult = nonceDigest === declaredDigest
          ? await require('../core/pai.outbound.authorization.js').consumeInitialMessage(
            webInput, String(handoffVars.web_session_authorization || ''))
          : { ok:false };
        if (authResult.ok && String(handoffVars.web_session_target_value || '').toUpperCase() ===
            String(handoffVars.ham_uid).toUpperCase()) {
          var { resolveAtmosphere } = require('../core/atmosphere.gate.js');
          var webEnv = await resolveAtmosphere({ hamUid:String(handoffVars.ham_uid) });
          if (webEnv && webEnv.ham_uid) {
            hamUid = webEnv.ham_uid;
            hamName = webEnv.name || 'there';
            trustLevel = String(webEnv.trust_level != null ? webEnv.trust_level : 0);
            world = webEnv.world || 'seated_web';
          }
        }
      } catch(e) { /* invalid or unavailable binding stays GUEST */ }
    }
    if (callerId) {
      try {
        var { resolveAtmosphere } = require('../core/atmosphere.gate.js');
        var env = await resolveAtmosphere({ phone: callerId });
        if (env && env.ham_uid) {
          hamUid = env.ham_uid;
          hamName = env.name || 'there';
          trustLevel = String(env.trust_level != null ? env.trust_level : 0);
          world = env.world || 'guest';
        }
      } catch(e) {}
    }

    // ⬡B:routes.vara.llm:FIX:full_init_context_shape:20260702⬡
    // Response widened to match what ElevenLabs' conversation_initiation_client_data_webhook
    // actually consumes -- confirmed live against the legacy service's own working
    // response shape. The thin {dynamic_variables} object alone left custom_llm_extra_body
    // unset, so ham_uid may never have threaded into the /chat/completions turns that
    // follow personalization; this carries it every way ElevenLabs might read it.
    // ⬡B:routes.vara.llm:GUARD:no_configured_first_message_bypass:20260715⬡
    // An inbound call starts silent until the caller speaks and that turn clears
    // PAI. An outbound opener is accepted only with the server HMAC created after
    // full council verification; a configured or injected first_message is blanked.
    var firstMessage = '';
    var handoffMessage = typeof handoffVars.initial_message === 'string'
      ? handoffVars.initial_message : '';
    if (handoffMessage) {
      var handoffHam = String(handoffVars.ham_uid || hamUid);
      var handoffDigest = String(handoffVars.initial_message_receipt_digest || '');
      var handoffSignature = String(handoffVars.initial_message_authorization || '');
      var initialInput = { hamUid:handoffHam, message:handoffMessage,
        receiptDigest:handoffDigest,
        requestId:String(handoffVars.initial_message_request_id || ''),
        cycleId:String(handoffVars.initial_message_cycle_id || ''),
        deliveryTarget:{ kind:String(handoffVars.initial_message_target_kind || ''),
          value:String(handoffVars.initial_message_target_value || '') },
        sessionId:String(handoffVars.initial_message_session_id || ''),
        expiresAt:Number(handoffVars.initial_message_expires_at),
        nonce:String(handoffVars.initial_message_nonce || ''), purpose:'initial_message' };
      var targetEnvelope = null;
      try {
        if (initialInput.deliveryTarget.kind === 'phone') {
          targetEnvelope = await require('../core/atmosphere.gate.js')
            .resolveAtmosphere({ phone:initialInput.deliveryTarget.value });
        }
      } catch (eTargetIdentity) { targetEnvelope = null; }
      var sameTargetHam = targetEnvelope && targetEnvelope.ham_uid &&
        String(targetEnvelope.ham_uid).toUpperCase() === String(hamUid).toUpperCase() &&
        String(handoffHam).toUpperCase() === String(hamUid).toUpperCase();
      var handoffResult = sameTargetHam
        ? await require('../core/pai.outbound.authorization.js').consumeInitialMessage(
          initialInput, handoffSignature) : { ok:false };
      if (handoffResult.ok) firstMessage = handoffMessage;
    }
    var voiceNonce = crypto.randomUUID();
    var voiceSessionId = 'vara.voice.' + crypto.randomUUID();
    var voiceRequestId = 'vara.voice.request.' + crypto.randomUUID();
    var voiceCycleId = 'vara.voice.binding.' + crypto.randomUUID();
    var voiceExpiresAt = Date.now() + 20 * 60 * 1000;
    var voiceReceiptDigest = crypto.createHash('sha256')
      .update('voice_session_bind\n' + hamUid + '\n' + voiceSessionId, 'utf8').digest('hex');
    var voiceInput = { hamUid:hamUid, message:'voice_session_bind',
      receiptDigest:voiceReceiptDigest, requestId:voiceRequestId,
      cycleId:voiceCycleId, deliveryTarget:{ kind:'ham', value:hamUid },
      sessionId:voiceSessionId, expiresAt:voiceExpiresAt,
      nonce:voiceNonce, purpose:'voice_session_bind' };
    var voiceAuthorization = require('../core/pai.outbound.authorization.js')
      .signInitialMessage(voiceInput);
    if (!voiceAuthorization) {
      return res.status(503).json({ ok:false, reason:'voice_session_bind_unavailable' });
    }
    var sessionVars = { ham_uid: hamUid, ham_name: hamName,
      trust_level: trustLevel, world: world,
      voice_session_receipt_digest:voiceReceiptDigest,
      voice_session_request_id:voiceRequestId,
      voice_session_cycle_id:voiceCycleId,
      voice_session_target_kind:'ham', voice_session_target_value:hamUid,
      voice_session_id:voiceSessionId, voice_session_expires_at:voiceExpiresAt,
      voice_session_nonce:voiceNonce, voice_session_authorization:voiceAuthorization };
    return res.json({
      type: 'conversation_initiation_client_data',
      conversation_id: 'init_' + Date.now(),
      conversation_config_override: { agent: { first_message:firstMessage } },
      custom_llm_extra_body: sessionVars,
      dynamic_variables: Object.assign({}, sessionVars, {
        // ⬡B:routes.vara.llm:WIRE:secret_dynamic_vars_l6:20260706⬡
        // ElevenLabs never speaks or logs a secret__ prefixed variable. The
        // HAM UID is identity, not chatter; it threads to the LLM turns but
        // must never leak into a transcript or the agent's mouth. Both forms
        // ride: bare for the LLM extra_body, secret__ for prompt interpolation.
        secret__ham_uid: hamUid,
        secret__trust_level: trustLevel
      })
    });
  });
};
