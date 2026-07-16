// ⬡B:core.reminderWeave:MODULE:reminders_ride_live_connections:20260709⬡
// WHERE REMINDERS GO. Founder doctrine, his own words 20260709:
// "maybe on whatever connection gets a live connection to the ham. If I send a text
//  message... chatter even in a text message, and she's like, remember you got that?
//  So fill in the blank right here... it can't be in a way that takes away from
//  whatever the user called or texted about, but it absolutely aids in the buy."
//
// WHAT IT IS: when a LIVE connection to the HAM opens (inbound text, a call), the
// channel asks this module for AT MOST ONE due, high-priority, HAM-audience reminder
// to weave into the reply as a natural aside -- a single sentence, after the real
// answer, never instead of it. The weave is stamped (entrance/exit/notes) so the
// reminder records that it reached the human on a live channel and does not repeat
// on the very next message (6h per-reminder weave cooldown). Self-reminders never
// weave -- they are the station's own business.
'use strict';
// ⬡B:core.reminderWeave:WIRE:funneled_20260713⬡
// DOCTRINE (entry): this weave is not a side gate. It rides the reply of the one cycle,
// whose entry is always A'NEW through the ABAHAM door, and only ever adds one aside AFTER
// the real answer on a channel the HAM already opened. It never originates a message.
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


var BU = process.env.AIBE_BRAIN_URL;
var BK = process.env.AIBE_BRAIN_KEY;
var WEAVE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// ⬡B:core.reminderWeave:FIX:global_weave_cooldown:20260713⬡
// A live-connection aside is meant to be occasional. Per-reminder cooldown alone let a
// different reminder weave on every single message. This is the GLOBAL ceiling per HAM.
var GLOBAL_WEAVE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }; }

// Extract a due date embedded in the reminder TEXT (e.g. "Park LOI due July 8") and decide
// if it is already past. The structured check below only catches reminders that carry a real
// date field; this catches the ones where the date lives only in the words -- exactly the
// Park LOI the founder caught firing days late. Conservative: only drops on a clearly parsed
// past date, treats a date more than ~180 days "past" as really next year, never throws.
function _textDueIsPast(text, now) {
  try {
    var m = String(text||'').match(/\b(?:due|by|on|deadline:?)\s+(?:the\s+)?([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
    if (!m) return false;
    var months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
                  jan:0,feb:1,mar:2,apr:3,may2:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    var mo = months[m[1].toLowerCase()];
    if (mo === undefined) return false;
    var day = parseInt(m[2],10);
    var year = m[3] ? parseInt(m[3],10) : new Date(now).getUTCFullYear();
    var due = new Date(Date.UTC(year, mo, day, 23, 59, 59)); // end of the due day
    var diffDays = (now - due.getTime()) / 86400000;
    if (diffDays > 180) return false;   // "past" by half a year means it is next year, not overdue
    return due.getTime() < now;         // otherwise in the past means overdue
  } catch (e) { return false; }
}

// ⬡B:core.reminderWeave:FIX:no_weave_on_structured_or_redundant:20260713⬡
// Founder 911, third strike on the weave: it stapled "Oh and real quick, remember: ..."
// onto a PROOF readout (so "Tools used:" looked polluted) and onto a topic he was already
// discussing (Chidera). The only gate was length. A casual aside has no business on a
// structured/system/proof answer, and never on something already in play. This decides,
// cold, whether a reply may carry a weave at all.
function shouldWeave(replyText, inboundText, pickText) {
  try {
    var reply = String(replyText || '');
    if (!reply.trim() || reply.length >= 900) return false;
    // Structured / system / proof readouts never get a chatty aside.
    if (/\bTools used\b|\bChannel:\s|\bRequest:\s|I checked the brain|here('?s| is) what the (entry|record) shows|cycleId|stamp_type/i.test(reply)) return false;
    // Raw JSON never gets a chatty aside stapled onto it -- live incident 20260714, a tool
    // result nearly went out with "Oh and real quick, remember" glued onto the end of a
    // JSON blob. If the reply parses as JSON, it is not a normal sentence reply at all.
    if (/^[\[{]/.test(reply.trim())) { try { JSON.parse(reply.trim()); return false; } catch (eJw) {} }
    // A bullet/dash list of 3+ lines is a structured readout, not a chat reply.
    var bulletLines = (reply.match(/^\s*[-\u2022*]\s+/gm) || []).length;
    if (bulletLines >= 3) return false;
    // Redundancy: if the pick's main keyword is already in the inbound OR the reply, skip.
    var pick = String(pickText || '').toLowerCase();
    var hay = (String(inboundText || '') + ' ' + reply).toLowerCase();
    var words = pick.split(/[^a-z0-9]+/).filter(function(w){ return w.length >= 5; });
    for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) !== -1) return false; }
    return true;
  } catch (e) { return false; } // when unsure, do not weave
}

// Returns { text, source } for ONE weavable reminder, or null. Cheap, cold, fail-null.
async function pickWeave(hamUid) {
  if (!_bu() || !_bk() || !hamUid) return null;
  var HAM = String(hamUid).toUpperCase();
  try {
    // ⬡B:core.reminderWeave:FIX:honor_stop_and_text_past_due:20260713⬡
    // Founder 911, his words: "BRO WTF Today is July 13th! I told u yesterday to stop PARK
    // is expired!!" Two real holes: (1) the past-due guard only read a structured date
    // field, so "Park LOI due July 8" (date in the TEXT) sailed past it and surfaced days
    // late; (2) there was NO suppression, so telling her to stop mentioning something did
    // nothing. Fixed: suppressions are read and honored, and past-due is caught from the
    // text too. Suppress + text-past-due together kill the Park nudge for good.
    var supp = [];
    try {
      var srows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.SUPPRESS_WEAVE&ham_uid=eq.' + HAM + '&select=content&limit=50',
        { headers: rh() }).then(function (r) { return r.json(); });
      if (Array.isArray(srows)) srows.forEach(function(r){ try { var c=JSON.parse(r.content||'{}'); if (c.keyword) supp.push(String(c.keyword).toLowerCase()); } catch(e){} });
    } catch (eSupp) {}
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.REMINDER&ham_uid=eq.' + HAM
      + '&order=importance.desc,created_at.desc&limit=15&select=source,content',
      { headers: rh() }).then(function (r) { return r.json(); });
    if (!Array.isArray(rows)) return null;
    var now = Date.now();
    // Global gate: if ANY reminder was woven to this HAM within the ceiling window, weave
    // nothing at all this turn. This is what stops the "aside on every message" spam --
    // the founder was getting one on the greeting, the Q&A, everything, because the
    // per-reminder cooldown let a different reminder fire each time. At most one aside per
    // window, not one per message.
    var lastAny = 0;
    for (var g = 0; g < rows.length; g++) {
      var cg; try { cg = JSON.parse(rows[g].content || '{}'); } catch (e) { continue; }
      if (cg.lastWeavedAt) { var tg = new Date(cg.lastWeavedAt).getTime(); if (!isNaN(tg) && tg > lastAny) lastAny = tg; }
    }
    if (lastAny && (now - lastAny) < GLOBAL_WEAVE_COOLDOWN_MS) return null;
    for (var i = 0; i < rows.length; i++) {
      var c; try { c = JSON.parse(rows[i].content || '{}'); } catch (e) { continue; }
      if (c.audience === 'self') continue;                 // her business, not chatter
      if (c.completed || c.fired) continue;                // already handled
      if (String(rows[i].source).indexOf('.fired.') !== -1) continue; // fire-log
      if (c.lastWeavedAt && (now - new Date(c.lastWeavedAt).getTime()) < WEAVE_COOLDOWN_MS) continue;
      var text = c.text || '';
      if (!text) continue;
      // Suppression: the HAM told her to stop mentioning this. Never surface it again.
      var tl = text.toLowerCase();
      if (supp.some(function(k){ return k && tl.indexOf(k) !== -1; })) continue;
      // Past due, structured field:
      var due = c.dueDate || c.due_date || c.due;
      if (due) { var dueMs = new Date(due).getTime(); if (!isNaN(dueMs) && dueMs < now) continue; }
      // Past due, date embedded in the text (the Park LOI case):
      if (_textDueIsPast(text, now)) continue;
      return { source: rows[i].source, text: text, priority: c.priority || 5 };
    }
    return null;
  } catch (e) { return null; }
}

// Record that the HAM told her to STOP mentioning something. pickWeave then never surfaces
// any reminder whose text contains this keyword. Founder-caught: he said stop and nothing
// recorded it, so it kept firing.
async function suppressWeave(hamUid, keyword) {
  if (!_bu() || !_bk() || !hamUid || !keyword) return { ok:false };
  try {
    var kw = String(keyword).toLowerCase().trim();
    var ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    await fetch(_bu() + '/rest/v1/' + _tbl(), { method:'POST', headers: wh(),
      body: JSON.stringify({ ham_uid:String(hamUid).toUpperCase(), agent_global:'PAI', stamp_type:'SUPPRESS_WEAVE',
        acl_stamp:'\u2b21B:core.reminderWeave:SUPPRESS_WEAVE:'+kw.replace(/[^a-z0-9]/g,'_').slice(0,30)+':'+ymd+'\u2b21',
        source:'suppress.weave.'+String(hamUid).toUpperCase()+'.'+Date.now(),
        summary:'[SUPPRESS_WEAVE] stop mentioning: '+kw.slice(0,60),
        content: JSON.stringify({ keyword:kw, setAt:new Date().toISOString() }), importance:6 }) });
    return { ok:true, keyword:kw };
  } catch (e) { return { ok:false, error:e.message }; }
}

// Mark the weave so it does not repeat on the next message. Supersede-only.
async function markWeaved(source, channel) {
  if (!_bu() || !_bk() || !source) return;
  try {
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=eq.' + encodeURIComponent(source) + '&select=content',
      { headers: rh() }).then(function (r) { return r.json(); });
    if (!rows.length) return;
    var c = {}; try { c = JSON.parse(rows[0].content || '{}'); } catch (e) {}
    c.lastWeavedAt = new Date().toISOString();
    c.lastWeaveChannel = channel || 'unknown';
    await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=eq.' + encodeURIComponent(source),
      { method: 'PATCH', headers: wh(), body: JSON.stringify({ content: JSON.stringify(c) }) });
  } catch (e) { /* never blocks the reply */ }
}

// One-call helper for channels: returns a system-prompt line instructing a natural,
// non-derailing aside, or '' when nothing should weave. The channel appends this to
// its synthesis prompt; it never replaces the real answer.
async function weaveLine(hamUid, channel) {
  var pick = await pickWeave(hamUid);
  if (!pick) return { line: '', source: null };
  return {
    line: 'LIVE-CONNECTION REMINDER (weave rule: answer their actual message FIRST and fully; then, only if it fits '
      + 'naturally, add ONE short friendly aside like "oh and real quick, remember: ..." about this, never more than one '
      + 'sentence, never derailing): ' + pick.text,
    source: pick.source
  };
}

module.exports = { pickWeave: pickWeave, markWeaved: markWeaved, weaveLine: weaveLine, suppressWeave: suppressWeave, shouldWeave: shouldWeave };
