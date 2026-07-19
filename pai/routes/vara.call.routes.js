// ⬡B:routes.vara.call.routes:WIRE:funneled_20260713⬡
const crypto = require('node:crypto');
const { runPAI } = require('../core/tool.loop.js');
const council = require('../core/pai.outbound.council.js');
const { resolveAtmosphere } = require('../core/atmosphere.gate.js');
const { placeCall } = require('../core/outreach.js');
const voiceConversationPolicy = require('../core/voice.conversation.policy.js');

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}

function providerFailureStatus(reason) {
  if (reason === 'provider_effect_already_claimed' ||
      reason === 'recipient_ham_mismatch') return 409;
  if (reason === 'kill_switch_active') return 423;
  if (reason === 'provider_not_configured' || reason === 'kill_switch_unverified' ||
      reason === 'provider_handoff_authorization_unavailable' ||
      reason === 'voice_session_bind_unavailable' ||
      reason === 'recipient_identity_unresolved' ||
      reason === 'provider_effect_binding_invalid' ||
      reason === 'provider_effect_claim_uncertain') return 503;
  return 502;
}

async function outboundAllowed(hamUid) {
  try {
    if (!_bu() || !_bk()) return { ok:false, reason:'kill_switch_unverified' };
    var state = await require('../core/killswitch.js').isActive(hamUid);
    if (!state || typeof state.active !== 'boolean' || state.error) {
      return { ok:false, reason:'kill_switch_unverified' };
    }
    return state.active ? { ok:false, reason:'kill_switch_active' } : { ok:true };
  } catch (e) { return { ok:false, reason:'kill_switch_unverified' }; }
}

function requestIdFor(req, body) {
  var headers = req && req.headers || {};
  var candidate = body.requestId || body.request_id
    || headers['x-anu-request-id'] || headers['idempotency-key'];
  var value = typeof candidate === 'string' ? candidate.trim() : '';
  return value && /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : crypto.randomUUID();
}
/* routes/vara.call.routes.js */
// ⬡B:routes.vara.call:MODULE:outbound_call:20260628⬡
// VARA outbound call compatibility door. It resolves and councils the request,
// then delegates the one provider effect to core/outreach.placeCall. Pipecat owns
// the conversation; ElevenLabs is used only as TTS inside that worker.

module.exports = function(app) {
  // Preserve the compatibility status keys for existing callers. They report
  // the old ConvAI configuration only; actual call readiness is Pipecat-owned.
  var EL_KEY = process.env.ELEVENLABS_API_KEY;
  var VARA_AGENT = process.env.ELEVENLABS_AGENT_ID || '';
  var VARA_PHONE = process.env.ELEVENLABS_PHONE_NUMBER_ID ||
    process.env.ELEVENLABS_PHONE_ID || '';
  var H = '⬡';

  // POST /vara/call: A'NU calls this when a committed cycle decides to place a call.
  // Per cycle-is-architecture: only fires when EANEW cycle authorizes it
  app.post('/vara/call', async function(req, res) {
    try {
      var body = req.body || {};
      var routeAuthorization = await require('../core/pai.outbound.authorization.js')
        .consumeInternalEffectRequest(req, '/vara/call');
      if (!routeAuthorization.ok) {
        var authStatus = routeAuthorization.reason === 'internal_effect_authorization_unconfigured'
          || routeAuthorization.reason === 'internal_effect_request_claim_uncertain' ? 503
          : routeAuthorization.reason === 'internal_effect_request_replayed' ? 409 : 401;
        return res.status(authStatus).json({ ok:false, sent:false,
          reason:routeAuthorization.reason });
      }
      var reason = body.reason;
      if (typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ ok: false, reason: 'reason_required' });
      }
      if (!body.hamUid) return res.status(400).json({ ok: false, reason: 'hamUid_required' });
      var envelope = await resolveAtmosphere({ hamUid: body.hamUid });
      if (!envelope || !envelope.ham_uid) {
        return res.status(401).json({ ok: false, reason: 'identity_unresolved' });
      }
      var hamUid = envelope.ham_uid;

      // Resolve phone from ATMOSPHERE if not provided — UNIVERSALITY clean
      if (!body.toNumber) {
        try {
          var pr = _bu() && _bk() ? await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.HAM_IDENTIFIER&ham_uid=eq.' + encodeURIComponent(hamUid) + '&limit=3', {
            headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }
          }).then(function(x){ return x.ok ? x.json() : []; }).catch(function(){ return []; }) : [];
          for (var pi = 0; pi < (pr||[]).length; pi++) {
            var phoneContent = pr[pi] && pr[pi].content;
            if (phoneContent && typeof phoneContent !== 'string') {
              try { phoneContent = JSON.stringify(phoneContent); } catch (ePhoneJson) { phoneContent = ''; }
            }
            var pm = String(phoneContent || '').match(/\+?1?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
            if (pm) { var pd = pm[0].replace(/[^\d+]/g,''); body.toNumber = pd.length===10 ? '+1'+pd : (pd.charAt(0)==='+'?pd:'+'+pd); break; }
          }
        } catch(ePhone) {}
      }
      var toNumber = body.toNumber || null; // ⬡UNIVERSALITY⬡ resolved above

      if (typeof toNumber !== 'string' || !toNumber.trim()) {
        return res.status(400).json({ ok: false, reason: 'to_number_required' });
      }
      var deliveryTarget = { kind:'phone', value:toNumber };
      if (!council.canonicalizeDeliveryTarget(deliveryTarget)) {
        return res.status(400).json({ ok:false, reason:'to_number_invalid' });
      }
      var recipient = await resolveAtmosphere({ phone:toNumber });
      if (!recipient || !recipient.ham_uid) {
        return res.status(503).json({ ok:false, reason:'recipient_ham_unverified' });
      }
      if (String(recipient.ham_uid).toUpperCase() !== String(hamUid).toUpperCase()) {
        return res.status(409).json({ ok:false, reason:'recipient_ham_mismatch' });
      }
      var allowed = await outboundAllowed(hamUid);
      if (!allowed.ok) return res.status(allowed.reason === 'kill_switch_active' ? 423 : 503)
        .json({ ok:false, sent:false, reason:allowed.reason });

      // ⬡B:routes.vara.call:GUARD:committed_pai_initial_message:20260715⬡
      // The former opener concatenated an unstamped MEMORY_BANK excerpt onto a raw reason.
      // The exact original request is now bound separately from the voice armory,
      // and ElevenLabs receives only the answer STAMP wrote and read back.
      var requestId = requestIdFor(req, body);
      var deliberationInput = [
        'Outbound voice call opening request.',
        'Produce only one concise first-person purpose statement A\u2019NU should speak when the call connects.',
        'These exact committed bytes will also answer a later “why did you call?” or “what do you want?” verbatim.',
        'State A\u2019NU\'s underlying reason for calling. Do not turn testing or orchestration instructions into a command or question for the recipient.',
        'Do not ask the recipient to say, repeat, send, call, or do anything in this opener. Do not use an em dash.',
        'Original reason follows exactly:',
        '',
        reason
      ].join('\n');
      var identity = {
        uid: hamUid,
        name: envelope.name || null,
        trust_level: envelope.trust_level || 0,
        world: envelope.world || null,
        request_id: requestId,
        user_message: reason,
        delivery: { external: true },
        council_context: { mode: 'outbound_voice_call', delivery_target:deliveryTarget }
      };
      var pai = await runPAI(hamUid, deliberationInput, 'voice', identity,
        body.priorTurns || [], null);
      var committed = council.requireVerifiedCouncilResult(pai, {
        hamUid: hamUid,
        requestId: pai && (pai.requestId || requestId),
        cycleId: pai && pai.cycleId,
        question: reason,
        deliberationInput: deliberationInput,
        answer: pai && pai.answer,
        deliveryTarget: deliveryTarget
      });
      var proof = committed && committed.ok ? council.compactCouncilProof(pai) : null;
      if (!committed || !committed.ok || !proof || proof.committed !== true
          || proof.readback_verified !== true || proof.row_count !== 9) {
        return res.status(502).json({
          ok: false,
          reason: (pai && pai.reason) || (committed && committed.reason)
            || 'pai_council_receipt_missing_or_invalid',
          requestId: requestId,
          cycleId: pai && pai.cycleId || null
        });
      }
      var initialMessage = committed.answer;
      // The signed provider handoff currently uses this one council-approved
      // artifact as both opener and same-call purpose evidence. A question or
      // recipient instruction would therefore be repeated verbatim when the HAM
      // asks why A'NU called. Fail before the provider edge unless the committed
      // bytes are a natural first-person purpose statement reusable in both
      // moments.
      if (!voiceConversationPolicy.isReusableCallPurposeStatement(initialMessage)) {
        return res.status(502).json({ ok:false,
          reason:'voice_opener_not_reusable_as_purpose',
          requestId:pai.requestId || requestId, cycleId:pai.cycleId,
          councilProof:proof });
      }
      var deliveryCommit = council.requireVerifiedCouncilDelivery(pai,
        deliveryTarget, initialMessage);
      if (!deliveryCommit || deliveryCommit.ok !== true) {
        return res.status(502).json({ ok:false,
          reason:deliveryCommit && deliveryCommit.reason || 'delivery_target_unverified',
          requestId:pai.requestId || requestId, cycleId:pai.cycleId });
      }

      // \u2b21B:routes.vara.call:WIRE:one_pipecat_provider_owner:20260716\u2b21
      // This route formerly ran a second ElevenLabs ConvAI dialer beside the
      // Starter worker. Reuse the same provider boundary as autonomous REACH so
      // the opener, HAM/session binding, provider call ID, and later PAI turns all
      // belong to one exact call.
      allowed = await outboundAllowed(hamUid);
      if (!allowed.ok) return res.status(allowed.reason === 'kill_switch_active' ? 423 : 503)
        .json({ ok:false, sent:false, reason:allowed.reason,
          requestId:pai.requestId || requestId, cycleId:pai.cycleId, councilProof:proof });
      var callResult = await placeCall(toNumber, initialMessage, pai);
      var callId = callResult && callResult.conversation_id || null;
      var ok = !!(callResult && callResult.ok === true && callId);
      var providerReason = ok ? null
        : callResult && callResult.reason || 'provider_unverified';
      var providerVia = callResult && callResult.via || null;
      var providerStatus = callResult && callResult.providerStatus != null
        ? callResult.providerStatus : null;

      // Stamp VARA_CALL bead to brain
      if (_bu() && _bk()) {
        await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
          method: 'POST',
          headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json', 'Accept-Profile': _schema(), 'Content-Profile': _schema(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            ham_uid: hamUid, agent_global: 'VARA', stamp_type: ok ? 'VARA_CALL' : 'VARA_CALL_FAIL',
            source: 'vara.call.' + Date.now(),
            acl_stamp: H + 'B:vara.call:VARA_CALL:committed_pai:' + ymd() + H,
            importance: 9,
            summary: ok ? '[VARA CALL INITIATED] committed PAI opener' : '[VARA CALL FAILED] committed PAI opener',
            content: JSON.stringify({ toNumber, reason, callId, ok, providerVia,
              status:providerStatus,
              providerError: providerReason,
              requestId: pai.requestId || requestId, cycleId: pai.cycleId,
              councilProof: proof })
          })
        }).catch(function(){});
      }

      res.status(ok ? 200 : providerFailureStatus(providerReason)).json({ ok, callId,
        providerCallId:callId,
        conversation_id:callId, status: ok ? 'dialed_pending_answer' : 'failed',
        dialed:ok, pendingAnswer:ok, called:false, sent:false,
        reason:providerReason, providerVia:providerVia,
        providerStatus:providerStatus,
        requestId: pai.requestId || requestId,
        cycleId: pai.cycleId, councilProof: proof });
    } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /vara/call/status — check the owned call bridge, not a ConvAI agent.
  app.get('/vara/call/status', async function(req, res) {
    var callUrl = String(process.env.PIPECAT_CALL_URL || '').trim();
    var bridge = String(process.env.PIPECAT_BRIDGE_KEY || '').trim();
    var configured = !!(callUrl && bridge);
    var worker = { reachable:false, ready:false, service:null, provider:null,
      commit:null, components:null };
    if (callUrl) {
      try {
        var healthOptions = {};
        if (typeof AbortSignal !== 'undefined' &&
            typeof AbortSignal.timeout === 'function') {
          healthOptions.signal = AbortSignal.timeout(3000);
        }
        var healthResponse = await fetch(callUrl.replace(/\/$/, '') + '/health',
          healthOptions);
        var health = healthResponse.ok
          ? await healthResponse.json().catch(function () { return null; }) : null;
        if (health && health.ok === true && health.service === 'anew-reach-voice') {
          worker = {
            reachable:true,
            ready:health.ready === true,
            service:health.service,
            provider:health.provider || null,
            commit:typeof health.commit === 'string' ? health.commit : null,
            components:health.components && typeof health.components === 'object'
              ? health.components : null
          };
        }
      } catch (eHealth) {}
    }
    res.json({
      ok: true,
      varaAgent:VARA_AGENT ? 'configured' : 'missing',
      varaPhone:VARA_PHONE ? 'configured' : 'missing',
      elevenLabsKey:EL_KEY ? 'configured' : 'MISSING — set ELEVENLABS_API_KEY',
      conversationOwner:'pipecat',
      pipecatCallUrl:callUrl ? 'configured' : 'missing',
      pipecatBridge:bridge ? 'configured' : 'missing',
      configured:configured,
      worker:worker,
      ready:configured && worker.reachable && worker.ready
    });
  });
};

module.exports._test = { providerFailureStatus };
