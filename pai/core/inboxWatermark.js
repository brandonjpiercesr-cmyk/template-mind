// ⬡B:core.inboxWatermark:MODULE:advisor_inbox_handled_strand:20260708⬡
// ⬡B:core.inboxWatermark:LAW:entrance_exit_notes_per_wonder:20260708⬡
//
// THE HANDLED WATERMARK. One shared strand, not four separate ones.
//
// WHY THIS EXISTS, in the founder's own words (Life Assistant Doctrine, 20260708):
// "you need to make sure all of the advisor inboxes have a handled watermark...
//  that is a strand, that's something that gets updated... you can't one off this...
//  I need this to not get stuck in the middle of the night tomorrow or a week from now."
//
// THE BLEED THIS KILLS: draftDedup.js only skips a cycle when an OPEN DRAFT already
// exists. But a noreply@ email (e.g. the RunPod low-balance notice) never gets a
// draft -- the advisor correctly decides not to reply to a noreply address -- so no
// draft is ever created, so draftDedup never trips, so the SAME email is re-fetched,
// re-summarized, and re-LLM'd on EVERY cycle forever. That is a token bleed on every
// wake and it is exactly what the STUCK LOOP detector kept firing on for GMG_ADVISOR
// (5+ identical inbox reviews in a row, 20260708). The provider was never the problem.
// The loop was. This strand is the loop's off-switch.
//
// THE STRAND: for each (advisor, ham, message), once the advisor has SEEN and DECIDED
// on a message -- drafted a reply, or deliberately skipped it (noreply / informational)
// -- we stamp that message id as HANDLED. Next cycle, handled messages are filtered out
// before the review is even built. A message only comes back if it genuinely changes
// (a real human reply lands on the thread), because the watermark is keyed to the
// message id, and a reply is a new message id.
//
// WONDER LAW COMPLIANCE: every mark carries an entrance (what cycle saw it), an exit
// (the decision), and a note (why). Supersede-only: re-marking the same message id
// upserts its decision, it never duplicates. Fail-open: if the brain read errors, we
// return every message as unhandled -- the advisor processes normally, exactly as it
// does today, so a bad read can never make things worse than the current behavior.
//
// SELF-HEALING (founder ask: "she's had the ability to do what you're doing and go in
// and fix"): the reconciler in eanew.server.js already detects a STUCK LOOP. This module
// exposes clearWatermark() and watermarkStatus() so the Overseer cycle can inspect and,
// if a station is wrongly stuck (marked handled but the founder wants it re-surfaced),
// clear a single message's watermark without any human editing a file.
'use strict';
// ⬡B:core.inboxWatermark:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


var SCHEMA = 'abacia_core';

function env() { return { BU: _bu(), BK: _bk() }; }
function readHeaders(BK) { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': SCHEMA }; }
function writeHeaders(BK) {
  return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': SCHEMA,
    'Content-Profile': SCHEMA, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}

// A message's stable identity. Prefer the real message id; fall back to thread+date so a
// provider that omits id still gets a deterministic, collision-safe key.
function messageKey(m) {
  if (!m) return null;
  if (m.id) return String(m.id);
  if (m.message_id) return String(m.message_id);
  if (m.thread_id) return String(m.thread_id) + '.' + String(m.date || m.received_at || '');
  return null;
}

// Deterministic bead source so re-marking the same message UPSERTS instead of piling up.
function watermarkSource(agentGlobal, hamUid, key) {
  return 'ham_' + String(hamUid).toLowerCase() + '.advisors.handled.'
    + String(agentGlobal).toLowerCase() + '.' + String(key);
}

// ENTRANCE: given the freshly fetched inbox, return only the messages this advisor has
// NOT already handled. This is called before the review is built.
async function filterUnhandled(agentGlobal, hamUid, messages) {
  var e = env();
  if (!e.BU || !e.BK || !Array.isArray(messages) || !messages.length) return messages || [];
  var HAM = String(hamUid || '').toUpperCase();
  try {
    var srcs = messages.map(function (m) { return watermarkSource(agentGlobal, HAM, messageKey(m)); })
      .filter(Boolean);
    if (!srcs.length) return messages;
    // One read: which of these message watermarks already exist?
    var inList = srcs.map(function (s) { return '"' + s.replace(/"/g, '') + '"'; }).join(',');
    var url = e.BU + '/rest/v1/' + _tbl() + '?stamp_type=eq.HANDLED&ham_uid=eq.' + HAM
      + '&agent_global=eq.' + agentGlobal + '&source=in.(' + encodeURIComponent(inList) + ')&select=source';
    // ⬡B:core.inboxWatermark:FIX:no_timeout_meant_a_hang_not_a_fail_open:20260708⬡
    // Real, live incident: BDIF's real cycle hung indefinitely -- 60+ real
    // seconds, no response at all -- because this fetch had no timeout. The
    // function already correctly fails open on an HTTP error or a caught
    // exception, but a request that never resolves or rejects never reaches
    // either path; it just hangs forever, and everything waiting on this
    // cycle hangs with it. Same fail-open philosophy, now actually reachable
    // if the brain read stalls instead of erroring cleanly.
    var ac = new AbortController();
    var to = setTimeout(function () { ac.abort(); }, 8000);
    var r;
    try {
      r = await fetch(url, { headers: readHeaders(e.BK), signal: ac.signal });
    } finally { clearTimeout(to); }
    if (!r.ok) return messages; // fail open
    var rows = await r.json();
    var handled = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) { handled[row.source] = true; });
    return messages.filter(function (m) {
      return !handled[watermarkSource(agentGlobal, HAM, messageKey(m))];
    });
  } catch (err) { return messages; /* fail open */ }
}

// EXIT + NOTE: after the cycle decides, stamp each SEEN message as handled with its
// decision. drafted messages and deliberately-skipped messages are both handled -- the
// whole point is that a noreply we chose not to answer is DONE, not re-reviewed forever.
async function markHandled(agentGlobal, hamUid, messages, decision, cycleSource) {
  var e = env();
  if (!e.BU || !e.BK || !Array.isArray(messages) || !messages.length) return { ok: false, marked: 0 };
  var HAM = String(hamUid || '').toUpperCase();
  var now = new Date().toISOString();
  var marked = 0;
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var key = messageKey(m);
    if (!key) continue;
    var src = watermarkSource(agentGlobal, HAM, key);
    var body = {
      ham_uid: HAM,
      agent_global: agentGlobal,
      stamp_type: 'HANDLED',
      acl_stamp: '\u2b21B:core.inboxWatermark:HANDLED:' + String(agentGlobal).toLowerCase() + ':' + key + '\u2b21',
      source: src,
      content: JSON.stringify({
        messageKey: key, from: m.from || null, subject: m.subject || null,
        decision: decision || 'reviewed',           // EXIT: what we did
        entrance: cycleSource || null,               // ENTRANCE: which cycle saw it
        note: 'handled by ' + agentGlobal + ' on ' + now + '; will not be re-reviewed unless a new message lands on the thread',
        handledAt: now
      }),
      summary: '[HANDLED] ' + agentGlobal + ' ' + (decision || 'reviewed') + ': ' + String(m.subject || key).slice(0, 60),
      importance: 3
    };
    try {
      // Supersede-only upsert: delete any prior watermark for this exact source, then write fresh.
      await fetch(e.BU + '/rest/v1/' + _tbl() + '?source=eq.' + encodeURIComponent(src),
        { method: 'DELETE', headers: writeHeaders(e.BK) }).catch(function () {});
      var w = await fetch(e.BU + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: writeHeaders(e.BK), body: JSON.stringify(body) });
      if (w.ok) marked++;
    } catch (err) { /* one failed mark never blocks the cycle */ }
  }
  return { ok: true, marked: marked };
}

// SELF-HEAL hooks for the Overseer reconciler -- no file edit needed to unstick a station.
async function clearWatermark(agentGlobal, hamUid, messageKeyOrAll) {
  var e = env();
  if (!e.BU || !e.BK) return { ok: false };
  var HAM = String(hamUid || '').toUpperCase();
  var filter = 'stamp_type=eq.HANDLED&ham_uid=eq.' + HAM + '&agent_global=eq.' + agentGlobal;
  if (messageKeyOrAll && messageKeyOrAll !== 'ALL') {
    filter += '&source=eq.' + encodeURIComponent(watermarkSource(agentGlobal, HAM, messageKeyOrAll));
  }
  try {
    var r = await fetch(e.BU + '/rest/v1/' + _tbl() + '?' + filter, { method: 'DELETE', headers: writeHeaders(e.BK) });
    return { ok: r.ok };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { filterUnhandled: filterUnhandled, markHandled: markHandled, clearWatermark: clearWatermark, messageKey: messageKey };
