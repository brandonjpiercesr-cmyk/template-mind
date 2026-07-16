// ⬡B:core.outbound.trace:MODULE:every_send_leaves_a_bead:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (the send itself becomes visible)
// L4, REAL PAI CYCLE. The cycle was traceable up to synthesis (pai.minutes,
// sigil, shadow) and then the SEND, the one act that touches a human,
// stamped nothing: a sent text, a silenced hollow, an email reply all left
// zero beads. This closes the loop: every outbound decision (sent OR
// deliberately silent) lands as one OUTBOUND bead carrying channel, verdict,
// reason, and a short preview, so a cycle can be walked end to end in the
// brain alone. UNIVERSALITY: hamUid rides in, any HAM.
'use strict';
// ⬡B:core.outbound.trace:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;

async function stampOutbound(o) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no brain env' };
  var ts = Date.now();
  var verdict = o.silent ? 'SILENT' : (o.sent ? 'SENT' : 'SEND_FAILED');
  var row = {
    ham_uid: o.hamUid || process.env.DEFAULT_HAM_UID || 'unknown',
    agent_global: 'ANU',
    stamp_type: 'OUTBOUND',
    importance: o.silent ? 4 : 6,
    acl_stamp: '⬡B:core.outbound.trace:OUTBOUND:' + verdict.toLowerCase() + ':' + ts + '⬡',
    source: 'outbound.' + (o.channel || 'unknown') + '.' + ts,
    summary: '[OUTBOUND ' + verdict + ' ' + (o.channel || '?') + '] '
      + (o.silent ? ('reason: ' + (o.reason || 'unstated')) : String(o.textPreview || '').slice(0, 90)),
    content: JSON.stringify({
      channel: o.channel || null, verdict: verdict, reason: o.reason || null,
      preview: String(o.textPreview || '').slice(0, 200),
      sigil: o.sigil || null, tools_used: o.tools_used || null
    })
  };
  var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
    method: 'POST',
    headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema(),
      'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  }).catch(function(){ return { ok: false }; });
  return { ok: !!(r && r.ok) };
}

module.exports = { stampOutbound: stampOutbound };
