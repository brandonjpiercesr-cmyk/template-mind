// ⬡B:core.selfReminders:MODULE:agent_self_reminder_strand:20260708⬡
// ⬡B:core.selfReminders:LAW:entrance_exit_notes_per_wonder:20260708⬡
//
// SELF-REMINDERS. One shared strand so a station can remind ITSELF, not just the HAM.
//
// FOUNDER 911, Life Assistant Doctrine pt 6, 20260708 (screamed, verbatim intent):
// "We have to be able to give her the ability to remind herself... for the MH action
//  advisor I might say: in a week, remind yourself to look through to figure out if
//  anybody has responded, and to nudge them if they haven't, and let me know about it.
//  That is a reminder to herself. How do we build those?"
//
// THE MODEL: a self-reminder is a REMINDER bead with audience:self, the owning
// station's agent_global, a fire_at time, and an action (the thing to do when it
// fires). Consumption is universal and lives at the ONE place every station cycle
// passes through -- advisors/advisor-router.js /advisors/:station/c3run. Before a
// station runs, it pulls its own DUE self-reminders and folds their action into that
// cycle's intent, so the station actually does the work through its normal LLM cycle
// (not a separate special path). After the cycle, each fired reminder is marked with
// a note of what happened. It fires on the station's next scheduled cycle at or after
// fire_at, exactly as the founder framed it ("when her cycle runs, it's determined").
//
// WONDER LAW: every set carries an ENTRANCE (who set it, when, why), every fire carries
// an EXIT (fired-at, the cycle result) and a NOTE (what the action was, what happened).
// Supersede-only: firing upserts the same bead's source to fired:true, never duplicates.
// Fail-open on reads: a brain hiccup means no self-reminders fire this cycle, never a
// crash of the station's real work.
//
// ROADMAP (documented here so the wonder carries its own plan):
//   1. set()  -- create a self-reminder (called in-process by a station that decides to
//                follow up later, or via POST /self-reminder/set when A'NU acts on a
//                founder instruction like "remind yourself in a week to X").
//   2. due()  -- at cycle start, the station asks for its own due, unfired reminders.
//   3. fold   -- advisor-router prepends the actions to the cycle intent (done there).
//   4. markFired() -- at cycle end, each due reminder is closed with an exit note.
//   5. surface -- if a fired reminder set surfaceToHam:true, its result also lands in
//                 the CLAIR Command Center feed (REMINDER stamp, already surfaced there).
'use strict';
// ⬡B:core.selfReminders:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


var SCHEMA = 'abacia_core';
function env() { return { BU: _bu(), BK: _bk() }; }
function rh(BK) { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': SCHEMA }; }
function wh(BK) { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': SCHEMA, 'Content-Profile': SCHEMA, 'Content-Type': 'application/json', Prefer: 'return=minimal' }; }

// ENTRANCE: create a self-reminder the owning station will fire on a later cycle.
// fireAt: ISO string or ms-from-now number. action: what to do (folded into intent).
async function setSelfReminder(agentGlobal, hamUid, opts) {
  var e = env();
  if (!e.BU || !e.BK) return { ok: false, reason: 'no_brain_config' };
  if (!agentGlobal || !hamUid) return { ok: false, reason: 'agent_and_ham_required' };
  opts = opts || {};
  var HAM = String(hamUid).toUpperCase();
  var ts = Date.now();
  var fireAt;
  if (typeof opts.fireAt === 'number') fireAt = new Date(ts + opts.fireAt).toISOString();
  else if (opts.fireAt) fireAt = new Date(opts.fireAt).toISOString();
  else fireAt = new Date(ts).toISOString(); // no delay given = due now
  var action = opts.action || opts.text || '';
  var src = 'ham_' + HAM.toLowerCase() + '.selfreminder.' + String(agentGlobal).toLowerCase() + '.' + ts;
  var body = {
    ham_uid: HAM,
    agent_global: agentGlobal,
    stamp_type: 'REMINDER',
    acl_stamp: '\u2b21B:core.selfReminders:REMINDER:set:' + ts + '\u2b21',
    source: src,
    content: JSON.stringify({
      audience: 'self',                 // this is the flag that separates it from HAM reminders
      owner: agentGlobal,
      text: opts.text || action,
      action: action,
      fireAt: fireAt,
      surfaceToHam: !!opts.surfaceToHam,
      fired: false,
      // ENTRANCE note
      setBy: opts.setBy || agentGlobal,
      setAt: new Date(ts).toISOString(),
      why: opts.why || 'self-scheduled follow-up'
    }),
    summary: '[SELF-REMINDER] ' + agentGlobal + ' -> itself, fires ' + fireAt + ': ' + String(action).slice(0, 70),
    importance: opts.importance || 6
  };
  try {
    var r = await fetch(e.BU + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: wh(e.BK), body: JSON.stringify(body) });
    return { ok: r.ok, source: src, fireAt: fireAt };
  } catch (err) { return { ok: false, error: err.message }; }
}

// This station's DUE, unfired self-reminders (audience:self, fireAt <= now).
async function dueSelfReminders(agentGlobal, hamUid) {
  var e = env();
  if (!e.BU || !e.BK || !agentGlobal || !hamUid) return [];
  var HAM = String(hamUid).toUpperCase();
  try {
    var url = e.BU + '/rest/v1/' + _tbl() + '?stamp_type=eq.REMINDER&agent_global=eq.' + encodeURIComponent(agentGlobal)
      + '&ham_uid=eq.' + HAM + '&select=source,content,created_at&order=created_at.asc&limit=25';
    var r = await fetch(url, { headers: rh(e.BK) });
    if (!r.ok) return [];
    var rows = await r.json();
    var now = Date.now();
    var due = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var c; try { c = JSON.parse(row.content || '{}'); } catch (x) { return; }
      if (c.audience !== 'self') return;      // only self-reminders
      if (c.fired) return;                     // not already fired
      if (c.fireAt && new Date(c.fireAt).getTime() > now) return; // not yet due
      due.push({ source: row.source, text: c.text, action: c.action, surfaceToHam: c.surfaceToHam, fireAt: c.fireAt, why: c.why });
    });
    return due;
  } catch (err) { return []; }
}

// EXIT + NOTE: mark a fired self-reminder closed, supersede-only, with what happened.
async function markFired(agentGlobal, hamUid, source, resultNote) {
  var e = env();
  if (!e.BU || !e.BK || !source) return { ok: false };
  try {
    var r = await fetch(e.BU + '/rest/v1/' + _tbl() + '?source=eq.' + encodeURIComponent(source) + '&select=content',
      { headers: rh(e.BK) });
    var rows = r.ok ? await r.json() : [];
    if (!rows.length) return { ok: false, reason: 'not_found' };
    var c; try { c = JSON.parse(rows[0].content || '{}'); } catch (x) { c = {}; }
    c.fired = true;
    c.firedAt = new Date().toISOString();     // EXIT
    c.result = String(resultNote || '').slice(0); // NOTE
    var patch = await fetch(e.BU + '/rest/v1/' + _tbl() + '?source=eq.' + encodeURIComponent(source),
      { method: 'PATCH', headers: wh(e.BK), body: JSON.stringify({
        content: JSON.stringify(c),
        summary: '[SELF-REMINDER FIRED] ' + agentGlobal + ': ' + String(c.action || c.text || '').slice(0, 60)
      }) });
    return { ok: patch.ok, source: source };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { setSelfReminder: setSelfReminder, dueSelfReminders: dueSelfReminders, markFired: markFired };
