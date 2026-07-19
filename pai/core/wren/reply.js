// ⬡B:core.wren.reply:MODULE:blooio_pai_loop:20260630⬡
// entered via the ABAHAM door, serving channel MESSAGES (TAP text, the working reach channel)
// WREN reply handler, full PAI cycle for every inbound text.
// ATMOSPHERE resolves sender → HAM UID → runPAI (MEMORY_BANK+FIND+tools) → synthesize → tapSend.
// ANYHAM test: any HAM who texts the Blooio number gets the full cycle. No hardcode.
// No chatbox. No one Groq call. The real engine.
'use strict';

const { runPAI } = require('../tool.loop.js');
const { synthesize } = require('../synthesize.js');
const { requireVerifiedCouncilResult, compactCouncilProof } = require('../pai.outbound.council.js');

var ATM_URL     = process.env.ATMOSPHERE_URL  || 'https://atmosphere-x2oi.onrender.com';

// Out-echo dedupe, remember what we just sent so we don't process it as inbound
var _recentOut = [];
var DEDUPE_TTL = 5 * 60 * 1000;
function rememberOutbound(text) {
  if (!text) return;
  _recentOut.push({ text: String(text).trim().toLowerCase(), at: Date.now() });
  var cut = Date.now() - DEDUPE_TTL;
  while (_recentOut.length && _recentOut[0].at < cut) _recentOut.shift();
}
function isOwnEcho(text) {
  if (!text) return false;
  var t = String(text).trim().toLowerCase();
  return _recentOut.some(function(e){ return e.text === t && Date.now() - e.at < DEDUPE_TTL; });
}

// HAM UID ALIAS MAP, 20260630
// Legacy ham_profiles returns the founder value, now from env for Brandon's phone (the env value) but all
// real brain data (MEMORY_BANK, doctrine, world) lives under the founder value, now from env. This map corrects the
// mismatch without touching the legacy database. If ATMOSPHERE returns an aliased UID,
// we swap it before PAI runs. Add entries as {legacy: canonical} pairs.
// Future: when ham_profiles is migrated, this map can be removed.
var HAM_UID_ALIASES = (function() {
  var raw = process.env.HAM_UID_ALIASES || ''; // ⬡UNIVERSALITY⬡ alias map lives in Render env now, set 20260703
  var map = {};
  raw.split(',').forEach(function(pair) {
    var parts = pair.trim().split(':');
    if (parts.length === 2) map[parts[0].trim().toUpperCase()] = parts[1].trim().toUpperCase();
  });
  return map;
}());

// ATMOSPHERE identity resolution, any phone → HAM UID
async function resolveHam(phone) {
  if (!phone) return null;
  try {
    var r = await fetch(ATM_URL + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone })
    });
    if (!r.ok) return null;
    var d = await r.json();
    if (!d || !d.ok || !d.ham_uid) return null;
    // Apply alias map, corrects legacy UID mismatches without touching the database
    var canonical = HAM_UID_ALIASES[d.ham_uid.toUpperCase()];
    if (canonical) {
      d.ham_uid = canonical;
      d._aliased_from = d.ham_uid;
    }
    return d;
  } catch(e) { return null; }
}

// ⬡B:core.wren.reply:WIRE:one_hardened_tap_provider:20260715⬡
// Keep the historic export for callers, but remove the duplicate raw provider.
// Every text now crosses the same TAP boundary with HAM + full council proof.
async function tapSend(phone, text, hamUid, councilResult, options) {
  var result = await require('../../reach/tap/tap.js')
    .tapSend(phone, text, hamUid, councilResult, options);
  if (result && result.ok === true) rememberOutbound(text);
  return result;
}

// Main inbound handler
async function handleReply(req) {
  req = req || {};
  var d = req.data || {};

  // Extract text and sender from various Blooio webhook shapes
  var text = req.text || req.body || req.message || d.text || d.body || d.message || '';
  var sender = req.from || req.sender || req.phone || req.from_number ||
               d.from || d.sender || d.external_id || '';

  // Reject echoes of our own outbound
  var direction = String(req.direction || d.direction || req.type || d.type || '').toLowerCase();
  if (direction.includes('out') || direction.includes('sent') || direction === 'delivered') {
    return { ok: true, ignored: 'outbound_echo' };
  }
  if (isOwnEcho(text)) {
    return { ok: true, ignored: 'self_echo_dedupe' };
  }
  if (!text || !sender) {
    return { ok: true, ignored: 'no_text_or_sender' };
  }

  // ATMOSPHERE gate, W1: always before PAI
  var resolved = await resolveHam(sender);
  if (!resolved) {
    return { ok: true, ignored: 'unrecognized_sender', sawSender: sender.slice(0, 20) };
  }

  var hamUid = resolved.ham_uid;
  var hamTier = resolved.trust_level || resolved.tier || 0;

  // W9: EBC firewall, if ebc_firewall is true and this is a cross-world contact, reject
  if (resolved.ebc_firewall) {
    return { ok: true, ignored: 'ebc_firewall', ham_uid: hamUid };
  }

  // ⬡B:core.wren.reply:WIRE:unified_kill_switch:20260707⬡
  // span.task.unified_kill_switch. Real trigger point: checked here, before
  // the PAI cycle, deterministic, not dependent on the LLM correctly reading
  // intent -- a safety switch has to fire the same way every time. This is
  // the "kill it via text" half founder's own doctrine described; outreach.js
  // and reach/iman.js now check the same shared flag so it also covers calls
  // and emails, not just the channel it was thrown from.
  var killswitch = require('../killswitch.js');
  if (killswitch.looksLikeKillCommand(text)) {
    var activation = await killswitch.activate(hamUid, text.slice(0, 140), 'wren_text');
    if (!activation || activation.ok !== true) {
      return { ok:false, reason:activation && activation.reason || 'kill_switch_activation_unverified',
        ham_uid:hamUid };
    }
    // ⬡B:core.wren.reply:GUARD:activation_is_the_terminal_safety_effect:20260715⬡
    // Once this durable switch is active, every channel including TAP must be
    // silent. Attempting a human-facing confirmation after activation made the
    // command self-contradictory: TAP correctly denied it and the webhook falsely
    // reported failure. The verified switch receipt is the machine confirmation;
    // no outbound bytes leave until an independently verified clear command.
    return { ok: true, ham_uid: hamUid, kill_switch: 'activated',
      sent: false, activation_source:activation.source, activation_id:activation.id };
  }
  if (killswitch.looksLikeClearCommand(text)) {
    var deactivation = await killswitch.deactivate(hamUid, 'wren_text');
    if (!deactivation || deactivation.ok !== true) {
      return { ok:false, reason:deactivation && deactivation.reason || 'kill_switch_clear_unverified',
        ham_uid:hamUid };
    }
    var clearDeliberation = text + '\n\n[INTERNAL VERIFIED STATE: the unified kill switch was deactivated successfully. '
      + 'Confirm that calls, texts, and emails may resume. Do not claim any other action.]';
    var clearIdentity = Object.assign({}, resolved, { user_message: text, outbound_finalize: true,
      council_context: { mode: 'default', delivery_target: { kind:'phone', value:sender },
        verified_evidence: [{ kill_switch: 'deactivated' }] } });
    var clearPai = await runPAI(hamUid, clearDeliberation, 'blooio', clearIdentity);
    var clearVerified = requireVerifiedCouncilResult(clearPai, { hamUid: hamUid,
      requestId: clearPai && (clearPai.requestId || clearPai.request_id), cycleId: clearPai && clearPai.cycleId,
      question: text, deliberationInput: clearDeliberation, answer: clearPai && clearPai.answer });
    if (!clearVerified.ok) return { ok: false, reason: 'kill_switch_clear_confirmation_uncommitted',
      ham_uid: hamUid, kill_switch: 'cleared' };
    var clearSynth = await synthesize(clearPai, text, 'blooio');
    if (!clearSynth.ok || clearSynth.text !== clearVerified.answer) {
      return { ok: false, reason: 'kill_switch_clear_confirmation_rejected', ham_uid: hamUid,
        kill_switch: 'cleared' };
    }
    var clearSend = await tapSend(sender, clearVerified.answer, hamUid, clearPai);
    require('../outbound.trace.js').stampOutbound({ hamUid: hamUid, channel: 'blooio', sent: !!(clearSend && (clearSend.message_id || clearSend.ok)), textPreview: 'kill switch cleared' }).catch(function(){});
    if (!clearSend || clearSend.ok !== true) {
      return { ok: false, reason: clearSend && clearSend.reason || 'text_delivery_failed',
        ham_uid: hamUid, kill_switch: 'cleared', pai_proof: compactCouncilProof(clearPai) };
    }
    return { ok: true, ham_uid: hamUid, kill_switch: 'cleared',
      sent: true,
      pai_proof: compactCouncilProof(clearPai) };
  }

  // Run full PAI cycle, MEMORY_BANK → FIND → tool loop → synthesis → SIGIL → SHADOW → PAM
  var replyIdentity = Object.assign({}, resolved, { user_message: text,
    council_context: Object.assign({ mode: 'default',
      delivery_target: { kind:'phone', value:sender } }, resolved.council_context || {}) });
  var paiResult = await runPAI(hamUid, text, 'blooio', replyIdentity);
  var committed = requireVerifiedCouncilResult(paiResult, { hamUid: hamUid,
    requestId: paiResult.requestId || paiResult.request_id, cycleId: paiResult.cycleId,
    question: text, deliberationInput: text, answer: paiResult.answer });
  // ⬡B:core.wren.reply:FIX:one_retry_on_a_flaky_shadow_hold_before_going_silent:20260718⬡
  // Founder-caught 20260718 with screenshots: A'NU answered a text at 7:40pm, then
  // went silent at 7:41pm on the very next question and stayed silent. The door was
  // fine; the cycle ran and returned "did not commit: shadow_model_hold". SHADOW's
  // MODEL judge is known-flaky on a clean board: the same question, 33 seconds apart,
  // holds once and passes once (documented at pai.outbound.council.js:1616). There was
  // no retry, so one unlucky coin flip = permanent silence on text, which reads to the
  // founder as "she stopped answering me".
  // One retry, and only when the hold is a bare model hold on a CLEAN deterministic
  // board (no real integrity flag fired). A genuine deterministic hold
  // (shadow_deterministic_hold, a named-evidence contradiction, a fabrication catch)
  // is NOT retried and still goes silent, exactly as the hollow-reply rule requires.
  // This does not weaken factual integrity; it only gives the flaky model judge a
  // second look before her voice is silenced on a channel where silence looks broken.
  // ⬡B:core.wren.reply:FIX:retry_every_clean_board_wonder_hold_before_silence:20260719⬡
  // FOUNDER 911 20260719, THE COUNT: 1154 turns were silenced by council holds, and
  // his reach answers among them read as "she stopped answering me". The existing
  // retry only covered shadow_MODEL_hold, but the live killers are shadow_WONDER_hold
  // and writ_hold on CLEAN answers -- a probabilistic wonder saying no once. On a
  // reach channel silence looks broken, so ANY bare wonder hold (not a real
  // deterministic integrity flag) gets ONE real re-run of the cycle before going
  // silent. This is not a hollow string; it re-asks the real question. A genuine
  // deterministic hold still goes silent per the hollow-reply rule.
  var _cleanBoardHold = ['shadow_model_hold','shadow_wonder_hold','writ_hold','content_too_short']
    .indexOf(String(committed.reason || paiResult.reason || '')) !== -1;
  if (!committed.ok && _cleanBoardHold) {
    var retryPai;
    try {
      retryPai = await runPAI(hamUid, text, 'blooio', replyIdentity);
    } catch (retryError) {
      retryPai = { ok:false, reason:'pai_retry_threw' };
    }
    if (!retryPai || typeof retryPai !== 'object') {
      retryPai = { ok:false, reason:'pai_retry_invalid' };
    }
    var retryCommitted = requireVerifiedCouncilResult(retryPai, { hamUid: hamUid,
      requestId: retryPai.requestId || retryPai.request_id, cycleId: retryPai.cycleId,
      question: text, deliberationInput: text, answer: retryPai.answer });
    // The retry is the replacement attempt, never a second candidate riding
    // beside the first. Its success or failure is therefore authoritative for
    // the one remaining delivery decision below.
    paiResult = retryPai;
    committed = retryCommitted;
  }
  if (!paiResult.ok) {
    return { ok: false, reason: 'pai_failed', detail: paiResult.reason, ham_uid: hamUid };
  }
  if (!committed.ok) return { ok: false, reason: 'pai_council_uncommitted', ham_uid: hamUid };

  var synth = await synthesize(paiResult, text, 'blooio');
  if (!synth.ok) {
    // No real answer, stay SILENT. Never send a hollow holding string.
    return { ok: true, silent: true, reason: synth.reason || 'no_answer', ham_uid: hamUid };
  }

  // FINAL GUARD: never send empty, never send a stringified object, never send a canned holding line.
  var outText = synth.text;
  if (!outText || typeof outText !== 'string') {
    return { ok: true, silent: true, reason: 'no_text', ham_uid: hamUid };
  }
  // ⬡B:core.wren.reply:GUARD:council_answer_bytes_immutable:20260715⬡
  // A reminder or any other addition must enter before the outbound council.
  // WREN delivers only the exact answer that the durable PAI receipt approved.
  if (outText !== paiResult.answer) {
    return { ok: false, reason: 'post_council_answer_mutation_rejected', ham_uid: hamUid };
  }
  // ⬡B:core.wren.reply:WIRE:shared_hollow_gate:20260706⬡ one law, one module.
  var hollowCheck = require('../hollow.gate.js').isHollow(outText);
  if (hollowCheck.hollow) {
    require('../outbound.trace.js').stampOutbound({ hamUid: hamUid, channel: 'blooio', silent: true, reason: 'refused_hollow_' + hollowCheck.reason }).catch(function(){});
    return { ok: true, silent: true, reason: 'refused_hollow_' + hollowCheck.reason, ham_uid: hamUid };
  }

  // Send the real response back via Blooio
  var sendResult = await tapSend(sender, outText, hamUid, paiResult);
  require('../outbound.trace.js').stampOutbound({ hamUid: hamUid, channel: 'blooio', sent: !!(sendResult && (sendResult.message_id || sendResult.ok)), textPreview: outText, sigil: synth.sigil ? synth.sigil.stamp : null, tools_used: synth.tools_used }).catch(function(){});
    require('../../logful/index.js').logfulStore({ hamUid: hamUid, agent: 'ANU', type: 'channel_turn',
      data: { channel: 'text', inputData: text, answer: outText },
      summary: '[TEXT turn] ' + String(text).slice(0, 80), importance: 5 }).catch(function(){}); // \u2b21B:memory.unification:BUILD:every_channel_saves_full_turns_20260710\u2b21

  if (!sendResult || sendResult.ok !== true) {
    return { ok: false, reason: sendResult && sendResult.reason || 'text_delivery_failed',
      ham_uid: hamUid, pai_proof: compactCouncilProof(paiResult) };
  }

  return {
    ok: true,
    ham_uid: hamUid,
    recorded: true,
    sent: true,
    ms: synth.ms,
    fcw_ms: synth.fcw_ms,
    tools_used: synth.tools_used,
    shadow: synth.shadow,
    sigil: synth.sigil ? synth.sigil.stamp : null,
    pai_proof: compactCouncilProof(paiResult)
  };
}

module.exports = { handleReply, tapSend, rememberOutbound };
// autodeploy trigger 20260630, deploy the require-path + fcw + groq fixes that never landed
