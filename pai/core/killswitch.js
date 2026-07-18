// ⬡B:core.killswitch:LEGACY:stamped_by_major_audit:20260711⬡ Stamp added by the founder-ordered
// major audit: this file predated the ACL law and carried no lineage. Provenance
// unknown; wiring status per the audit orphan/hold lists; NOT fresh work.
// \u2b21B:core.killswitch:MODULE:unified_kill_switch:20260707\u2b21
// span.task.unified_kill_switch, founder-dispatched 20260706.
// Founder's own words: "if I kill the switch via text that might not kill it
// from phone call too... you have not properly utilized the system." One
// real, brain-backed flag, checked by every real send/reach path this
// session already touched, instead of a per-channel switch that only ever
// covers the channel it was thrown from. Cold code, no LLM, same posture as
// PAM and WRIT -- a safety gate should not depend on a model's judgment to
// fire correctly.
'use strict';
// ⬡B:core.killswitch:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}

const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;
const MAX_HOURS = 24; // matches the founder's own Do Not Disturb doctrine: confirmed, max 24h, never silent forever by accident

function bh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }

async function isActive(hamUid) {
  if (!_bu() || !_bk() || !hamUid) {
    return { active:false, error:'kill_switch_unverified' };
  }
  try {
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.KILL_SWITCH&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&order=created_at.desc&limit=1&select=created_at,content', { headers: bh() });
    // ⬡B:core.killswitch:GUARD:http_uncertainty_is_not_a_clear_switch:20260715⬡
    // Callers such as IMAN must be able to distinguish a represented empty read
    // from a provider failure. Previously a non-2xx JSON body fell through as
    // "inactive," silently turning a bank outage into permission to send.
    if (!r || r.ok !== true) return { active: false, error: 'kill_switch_read_failed' };
    const rows = await r.json();
    if (!Array.isArray(rows)) return { active: false, error: 'kill_switch_read_invalid' };
    if (!rows.length) return { active: false };
    const row = rows[0];
    let c = row.content; try { c = JSON.parse(c); } catch (e) { c = {}; }
    if (c.deactivated) return { active: false };
    const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3600000;
    if (ageHours > MAX_HOURS) return { active: false, expired: true };
    return { active: true, reason: c.reason || '', activatedVia: c.via || 'unknown', ageHours: Math.round(ageHours) };
  } catch (e) { return { active: false, error: e.message }; }
}

async function writeSwitch(row) {
  const response = await fetch(_bu() + '/rest/v1/' + _tbl(), {
    method:'POST',
    headers:Object.assign({}, bh(), { 'Content-Profile':_schema(),
      'Content-Type':'application/json', Prefer:'return=representation' }),
    body:JSON.stringify(row)
  });
  const represented = response.ok
    ? await response.json().catch(function(){return null;}) : null;
  if (!response.ok || !Array.isArray(represented) || !represented[0] ||
      represented[0].source !== row.source) {
    return { ok:false, reason:'kill_switch_write_unverified' };
  }
  const read = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?source=eq.' + encodeURIComponent(row.source)
    + '&ham_uid=eq.' + encodeURIComponent(row.ham_uid)
    + '&select=id,source,ham_uid,stamp_type,content&limit=1', { headers:bh() });
  const readRows = read.ok ? await read.json().catch(function(){return null;}) : null;
  if (!read.ok || !Array.isArray(readRows) || !readRows[0] ||
      readRows[0].source !== row.source || readRows[0].ham_uid !== row.ham_uid ||
      readRows[0].stamp_type !== 'KILL_SWITCH' || readRows[0].content !== row.content) {
    return { ok:false, reason:'kill_switch_readback_unverified' };
  }
  return { ok:true, id:readRows[0].id, source:row.source };
}

async function activate(hamUid, reason, via) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no_brain_or_ham' };
  try {
    const source = 'killswitch.activate.' + hamUid + '.' + Date.now();
    return await writeSwitch({
        ham_uid: hamUid, agent_global: 'ANEW', stamp_type: 'KILL_SWITCH',
        acl_stamp: '\u2b21B:core.killswitch:KILL_SWITCH:activated:' + ymd() + '\u2b21',
        source: source,
        summary: '[KILL SWITCH ACTIVATED via ' + (via || 'unknown') + '] ' + (reason || 'no reason given').slice(0, 140),
        content: JSON.stringify({ reason: reason || '', via: via || 'unknown', activatedAt: new Date().toISOString() }),
        importance: 9
    });
  } catch (e) { return { ok:false, reason:'kill_switch_write_unverified' }; }
}

async function deactivate(hamUid, via) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no_brain_or_ham' };
  try {
    const source = 'killswitch.deactivate.' + hamUid + '.' + Date.now();
    return await writeSwitch({
        ham_uid: hamUid, agent_global: 'ANEW', stamp_type: 'KILL_SWITCH',
        acl_stamp: '\u2b21B:core.killswitch:KILL_SWITCH:deactivated:' + ymd() + '\u2b21',
        source: source,
        summary: '[KILL SWITCH CLEARED via ' + (via || 'unknown') + ']',
        content: JSON.stringify({ deactivated: true, via: via || 'unknown', deactivatedAt: new Date().toISOString() }),
        importance: 6
    });
  } catch (e) { return { ok:false, reason:'kill_switch_write_unverified' }; }
}

// Deterministic, not model-dependent on purpose -- a safety switch should
// fire the same way every time, not depend on an LLM correctly reading intent.
const TRIGGER_PATTERN = /\b(stop all|pause everything|kill switch|stop everything|pause all reach)\b/i;
function looksLikeKillCommand(text) { return TRIGGER_PATTERN.test(String(text || '')); }
const CLEAR_PATTERN = /\b(resume all|clear kill switch|unpause|resume everything)\b/i;
function looksLikeClearCommand(text) { return CLEAR_PATTERN.test(String(text || '')); }

module.exports = { isActive, activate, deactivate, looksLikeKillCommand, looksLikeClearCommand, MAX_HOURS };
