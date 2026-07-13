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

// Resolve a phone number for a HAM from ATMOSPHERE
async function resolvePhone(hamUid) {
  // ATMOSPHERE /resolve accepts slug — we search brain for the HAM's phone BEAD
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return null;
  try {
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.HAM_IDENTIFIER&ham_uid=eq.' + encodeURIComponent(hamUid) + '&limit=5', {
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }
    }).then(function(r){ return r.ok ? r.json() : []; });
    // Find a phone number in the content
    for (var i = 0; i < (rows||[]).length; i++) {
      var content = rows[i].content || '';
      var match = content.match(/\+?1?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
      if (match) return match[0].replace(/[^\d+]/g, '').replace(/^1(\d{10})$/, '+1$1');
    }
  } catch(e) {}
  return null;
}

async function notifyHam(hamUid, message) {
  if (!BLOOIO_KEY || !hamUid || !message) return { ok: false, reason: 'missing_params' };
  var phone = await resolvePhone(hamUid);
  if (!phone) return { ok: false, reason: 'phone_not_found', hamUid };
  try {
    var r = await fetch(BLOOIO_BASE + '/chats/' + encodeURIComponent(phone) + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + BLOOIO_KEY, 'Content-Type': 'application/json',
                 'Idempotency-Key': hamUid + '.' + Date.now() },
      body: JSON.stringify({ text: message })
    });
    return { ok: r.ok, phone: phone.slice(0, 7) + '****', hamUid };
  } catch(e) { return { ok: false, error: e.message }; }
}
module.exports = { notifyHam };
