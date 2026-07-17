// ⬡B:core.tools.notify.ham:MODULE:reach_ham_text:20260630⬡
// She texts a HAM. Used by A'NEW to reach Brandon after a self-heal or when stuck.
// ANYHAM: resolves phone from ATMOSPHERE by hamUid. Never hardcodes a phone number.
'use strict';
// ⬡B:core.tools.notify.ham:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

var BLOOIO_BASE = process.env.BLOOIO_API_BASE || 'https://backend.blooio.com/v2/api';
var BLOOIO_KEY  = process.env.BLOOIO_API_KEY  || '';
var ATM_URL     = process.env.ATMOSPHERE_URL  || 'https://atmosphere-x2oi.onrender.com';

function abortSignal(options) {
  return options && (options.signal || options.abortSignal) || null;
}

async function cancellationRequested(options) {
  var signal = abortSignal(options);
  if (signal && signal.aborted) return true;
  if (options && typeof options.isCancelled === 'function') {
    try { return await options.isCancelled(true) === true; }
    catch (eCancel) { return true; }
  }
  return false;
}

function cancelled(extra) {
  return Object.assign({ ok:false, reason:'voice_turn_cancelled' }, extra || {});
}

// Resolve a phone number for a HAM from ATMOSPHERE
async function resolvePhone(hamUid, options) {
  // ATMOSPHERE /resolve accepts slug — we search brain for the HAM's phone BEAD
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return null;
  try {
    var request = {
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }
    };
    var signal = abortSignal(options);
    if (signal) request.signal = signal;
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.HAM_IDENTIFIER&ham_uid=eq.' + encodeURIComponent(hamUid) + '&limit=5', request)
      .then(function(r){ return r.ok ? r.json() : []; });
    // Find a phone number in the content
    for (var i = 0; i < (rows||[]).length; i++) {
      var content = rows[i].content || '';
      var match = content.match(/\+?1?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
      if (match) return match[0].replace(/[^\d+]/g, '').replace(/^1(\d{10})$/, '+1$1');
    }
  } catch(e) {}
  return null;
}

async function notifyHam(hamUid, message, councilResult, resolvedPhone, options) {
  if (await cancellationRequested(options)) return cancelled();
  if (!BLOOIO_KEY || !hamUid || !message) return { ok: false, reason: 'missing_params' };
  if (!councilResult || councilResult.answer !== message) {
    return { ok:false, reason:'pai_council_result_required' };
  }
  // ⬡B:core.tools.notify.ham:GUARD:exact_committed_message_required:20260715⬡
  // The provider boundary cannot trust a caller's compact summary. It requires
  // the full verified receipt and STAMP pair and exact approved message bytes.
  var proof = null;
  var verified = null;
  var receipt = councilResult && (councilResult.council_receipt || councilResult.councilReceipt);
  var phone = await resolvePhone(hamUid, options);
  if (await cancellationRequested(options)) return cancelled();
  if (!phone) return { ok:false, reason:'phone_not_found', hamUid:hamUid };
  try {
    var council = require('../pai.outbound.council.js');
    if (!receipt || String(receipt.ham_uid || '').toUpperCase() !== String(hamUid).toUpperCase()) {
      return { ok:false, reason:'notify_ham_receipt_ham_mismatch' };
    }
    var armedTarget = council.canonicalizeDeliveryTarget({ kind:'phone', value:resolvedPhone });
    var providerTarget = council.canonicalizeDeliveryTarget({ kind:'phone', value:phone });
    if (!armedTarget || !providerTarget ||
        JSON.stringify(armedTarget) !== JSON.stringify(providerTarget)) {
      return { ok:false, reason:'notify_target_changed_after_council' };
    }
    verified = council.requireVerifiedCouncilDelivery(councilResult,
      { kind:'phone', value:phone }, message);
    proof = verified && verified.ok ? council.compactCouncilProof(councilResult) : null;
  } catch (eProof) { proof = null; }
  if (!verified || !verified.ok || !proof || proof.committed !== true ||
      proof.readback_verified !== true || proof.row_count !== 9 ||
      proof.representation_count !== 9 ||
      !councilResult || councilResult.answer !== message) {
    return { ok:false, reason:'pai_council_result_required' };
  }
  try {
    if (!_bu() || !_bk()) return { ok:false, reason:'kill_switch_unverified' };
    var killState = await require('../killswitch.js').isActive(hamUid);
    if (await cancellationRequested(options)) return cancelled();
    if (!killState || typeof killState.active !== 'boolean' || killState.error) {
      return { ok:false, reason:'kill_switch_unverified' };
    }
    if (killState.active) return { ok:false, reason:'kill_switch_active' };
  } catch (eKill) { return { ok:false, reason:'kill_switch_unverified' }; }
  if (await cancellationRequested(options)) return cancelled();
  var effectClaim = await require('../outbound.effect.js').claimProviderAttempt({
    hamUid:hamUid, channel:'notify_ham',
    deliveryTarget:{ kind:'phone', value:phone }, artifact:message,
    requestId:proof.request_id, cycleId:proof.cycle_id
  });
  if (!effectClaim.ok) return { ok:false, reason:effectClaim.reason,
    effectKey:effectClaim.effectKey || null, hamUid:hamUid };
  if (await cancellationRequested(options)) return cancelled({
    effectKey:effectClaim.effectKey || null, hamUid:hamUid });
  try {
    if (await cancellationRequested(options)) return cancelled({
      effectKey:effectClaim.effectKey || null, hamUid:hamUid });
    var request = {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + BLOOIO_KEY, 'Content-Type': 'application/json',
                 'Idempotency-Key': effectClaim.idempotencyKey },
      body: JSON.stringify({ text: message })
    };
    var signal = abortSignal(options);
    if (signal) request.signal = signal;
    var r = await fetch(BLOOIO_BASE + '/chats/' + encodeURIComponent(phone) + '/messages', request);
    var data = await r.json().catch(function () { return null; });
    var messageId = r.ok && data && (data.message_id || data.id);
    if (!messageId) return { ok:false,
      reason:r.ok ? 'provider_unverified' : r.status >= 500 ? 'provider_uncertain' : 'provider_rejected',
      providerStatus:r.status, hamUid:hamUid };
    return { ok:true, message_id:messageId, phone:phone.slice(0, 7) + '****', hamUid:hamUid,
      councilProof:proof };
  } catch(e) { return { ok:false, reason:'provider_uncertain',
    cancelled:!!(abortSignal(options) && abortSignal(options).aborted) }; }
}
module.exports = { notifyHam, resolvePhone };
