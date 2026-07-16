// ⬡B:reach.tap.tap:WIRE:funneled_20260712⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}
// ⬡B:reach.tap.tap:MODULE:outbound_imessage_sms:20260618⬡
// TAP -- outbound proactive iMessage (Blooio) + SMS fallback (Telnyx)
// Blooio requires browser-like User-Agent from server -- standard header pattern
// Telnyx SMS requires 10DLC registration (SP registration in progress)

var BLOOIO_BASE = process.env.BLOOIO_BASE_URL || 'https://backend.blooio.com/v2/api';
var BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var council = require('../../core/pai.outbound.council.js');

// ⬡B:reach.tap.tap:GUARD:provider_requires_full_committed_pai:20260715⬡
// This is the raw iMessage/SMS provider boundary. It accepts no caller-authored
// bypass: the exact outbound bytes must equal the answer in a full, locally
// verifiable council result whose non-enumerable request binding is still intact.
async function tapSend(to, message, hamUid, councilResult) {
  if (typeof to !== 'string' || !to.trim() || typeof message !== 'string' || !message || !hamUid) {
    return { ok: false, reason: 'to_message_ham_required' };
  }
  var requestId = councilResult && (councilResult.requestId || councilResult.request_id);
  var cycleId = councilResult && (councilResult.cycleId || councilResult.cycle_id);
  var receipt = councilResult && (councilResult.council_receipt || councilResult.councilReceipt);
  var deliveryTarget = to.indexOf('@') > 0
    ? { kind:'email', value:to } : { kind:'phone', value:to };
  var canonicalTarget = council.canonicalizeDeliveryTarget(deliveryTarget);
  var verified = receipt && String(receipt.ham_uid || '').toUpperCase() ===
    String(hamUid).toUpperCase()
    ? council.requireVerifiedCouncilDelivery(councilResult,
      deliveryTarget, message) : null;
  var proof = verified && verified.ok ? council.compactCouncilProof(councilResult) : null;
  if (!verified || verified.ok !== true || verified.answer !== message ||
      councilResult.answer !== message || !proof || proof.committed !== true ||
      proof.readback_verified !== true || proof.row_count !== 9) {
    return { ok: false, reason: 'pai_council_result_required' };
  }

  // ⬡B:reach.tap.tap:GUARD:exact_provider_target_digest:20260715⬡
  // HAM identifies the world that authorized the send. The target digest binds
  // the actual phone separately, including a deliberate third-party contact.

  // Recheck the shared switch at the provider edge. A switch that changes while
  // PAI is deliberating still blocks the network call; an unreadable switch is
  // uncertainty and therefore also blocks it.
  try {
    if (!_bu() || !_bk()) {
      return { ok: false, sent: false, reason: 'kill_switch_unverified',
        requestId: requestId, cycleId: cycleId, councilProof: proof };
    }
    var ks = await require('../../core/killswitch.js').isActive(hamUid);
    if (!ks || typeof ks.active !== 'boolean' || ks.error) {
      return { ok: false, sent: false, reason: 'kill_switch_unverified',
        requestId: requestId, cycleId: cycleId, councilProof: proof };
    }
    if (ks.active) {
      return { ok: false, sent: false, reason: 'kill_switch_active',
        requestId: requestId, cycleId: cycleId, councilProof: proof };
    }
  } catch (eKs) {
    return { ok: false, sent: false, reason: 'kill_switch_unverified',
      requestId: requestId, cycleId: cycleId, councilProof: proof };
  }

  var blooioKey = process.env.BLOOIO_API_KEY;
  var tk = process.env.TELNYX_API_KEY, from = process.env.TELNYX_PHONE_NUMBER;
  if (!blooioKey && !(tk && from)) {
    return { ok:false, sent:false, channel:null, reason:'no_text_channel_configured',
      requestId:requestId, cycleId:cycleId, councilProof:proof };
  }
  var effectClaim = await require('../../core/outbound.effect.js').claimProviderAttempt({
    hamUid:hamUid, channel:'tap_text', deliveryTarget:canonicalTarget,
    artifact:message, requestId:requestId, cycleId:cycleId
  });
  if (!effectClaim.ok) return { ok:false, sent:false, reason:effectClaim.reason,
    requestId:requestId, cycleId:cycleId, councilProof:proof,
    effectKey:effectClaim.effectKey || null };

  var result = null;

  if (blooioKey) {
    try {
      var chatId = encodeURIComponent(to);
      var res = await fetch(BLOOIO_BASE + '/chats/' + chatId + '/messages', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + blooioKey,
          'Content-Type': 'application/json',
          'User-Agent': BROWSER_UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Idempotency-Key': effectClaim.idempotencyKey
        },
        body: JSON.stringify({ text: message })
      });
      var d = await res.json();
      result = res.ok && d.message_id
        ? { ok: true, channel: 'imessage', message_id: d.message_id, status: d.status }
        : { ok: false, channel: 'imessage', reason: 'provider_unverified', providerStatus: res.status };
    } catch(e) {
      result = { ok: false, channel: 'imessage', reason: 'provider_uncertain' };
    }
  }

  // SMS is a fallback only when iMessage is definitively not configured. Once a
  // provider request has been attempted, an uncertain response may have sent;
  // trying a second provider could duplicate the human-facing message.
  if (!blooioKey) {
    if (tk && from) {
      try {
        var tr = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json',
            'Idempotency-Key':effectClaim.idempotencyKey },
          body: JSON.stringify({ from, to:canonicalTarget.value, text: message })
        });
        var td = await tr.json();
        result = tr.ok && td.data && td.data.id
          ? { ok: true, channel: 'sms', message_id: td.data.id, providerStatus: tr.status }
          : { ok: false, channel: 'sms', reason: 'provider_unverified', providerStatus: tr.status };
      } catch(e) {
        result = { ok: false, channel: 'sms', reason: 'provider_uncertain' };
      }
    }
  }

  if (!result) result = { ok: false, channel: null, reason: 'provider_unverified' };
  result = Object.assign({}, result, {
    sent: result.ok === true,
    requestId: requestId,
    cycleId: cycleId,
    councilProof: proof
  });
  if (_bu() && _bk()) {
    fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST',
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Profile': _schema(),
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ham_uid: hamUid, agent_global: 'TAP', stamp_type: 'LOGFUL',
        acl_stamp: String.fromCodePoint(0x2B21) + 'B:tap.send:LOGFUL:' + (result.channel || 'none') + ':' + Date.now() + String.fromCodePoint(0x2B21),
        source: 'tap.send.' + Date.now(),
        content: JSON.stringify({ to_masked: to.slice(0,4) + 'xxxx' + to.slice(-2),
          channel: result.channel, ok: result.ok, hamUid: hamUid,
          requestId: requestId, cycleId: cycleId, councilProof: proof }),
        summary: '[TAP] ' + (result.channel || 'none') + ' ' + (result.ok ? 'SENT' : 'FAILED') + ' -- ' + message.slice(0,40),
        importance: 7 }) }).catch(()=>{});
  }
  return result;
}
module.exports = { tapSend };
