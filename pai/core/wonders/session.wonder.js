// ⬡B:core.wonders.session:MODULE:session_wonder_ported:20260714⬡
// DOCTRINE (entry): this Wonder is never an entry point of its own. It runs inside the one
// PAI cycle, whose entry is always A'NEW through the ABAHAM door -- propose_working_session
// and session_complete call these helpers from inside that cycle, never from a side gate.
//
// THE SESSION WONDER, ported into the new world (20260714)
// -------------------------------------------------------------------------
// Ported from aibebase core/session.wonder.js so the HAM's real live conversation (which
// now runs through THIS world's /cycle, not the legacy fallback) actually has the Session
// Wonder available to call, not just the externally-triggered version sitting unused on
// aibebase. Same doctrine, same design: real agenda from real material, ruthless
// HANDLE-vs-ESCALATE triage with no invented frameworks, a real calendar check, book-on-
// confirmation, and outcome capture so nothing decided evaporates.
//
// ONE REAL DIFFERENCE from the aibebase version: THIS is a conversational tool, called
// mid-turn by the model, not an externally-fired route. So proposeSession here returns
// structured data (agenda, slot, mode, message) for the model to weave into ITS OWN reply
// through the normal channel-answer path -- it does not independently text the HAM itself.
// The channel (still living in aibebase's wren/reply.js) is what actually sends; this
// module only ever compiles what A'NEW should say.
//
// ORG CHART, ABSOLUTE (inlined; this world has no separate advisor-grounding module yet):
// the person this world serves is the PRINCIPAL at the top, above any adviser. Their time
// is the single most expensive resource here, so reaching them is the rarest and most
// earned action. Default to handling work without them; bring something to them ONLY when
// it genuinely cannot move without a real decision or a strategic update. Never assume a
// fixed title like founder or CEO -- they are simply the principal of THIS world.

function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl() { return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema() { return process.env.BRAIN_SCHEMA || 'abacia_core'; }
function _rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function _wh() { var h = _rh(); h['Content-Profile'] = 'abacia_core'; h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }

var _sched = require('../tools/schedule.js');

var MIN_AGENDA = 2;
var AGENDA_LOOKBACK_H = 96;

// Cold read of the REAL agenda: what advisers/proposals and the tracker already flagged.
async function gatherAgenda(hamUid) {
  var HAM = String(hamUid || '').toUpperCase();
  var out = { decisions: [], owed: [], count: 0 };
  if (!_bu() || !_bk() || !HAM) return out;
  var sinceIso = new Date(Date.now() - AGENDA_LOOKBACK_H * 3600000).toISOString();
  try {
    var pa = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.PROPOSED_ACTION&ham_uid=eq.' + HAM
      + '&created_at=gte.' + encodeURIComponent(sinceIso)
      + '&order=created_at.desc&limit=25&select=summary,content', { headers: _rh() }).then(function (r) { return r.json(); });
    var seen = {};
    (Array.isArray(pa) ? pa : []).forEach(function (row) {
      var sum = String(row.summary || '');
      if (!/proposes (meeting|assignment_for_founder|decision)|for_found|needs (your|the founder)|make the call/i.test(sum)) return;
      var who = (sum.match(/\[([A-Z0-9_]+) proposes/) || [])[1] || 'an adviser';
      var text = sum.replace(/^\[[^\]]*\]\s*/, '').slice(0, 140).trim();
      var key = (who + '|' + text).toLowerCase();
      if (seen[key]) return; seen[key] = 1;
      out.decisions.push({ who: who, text: text });
    });
  } catch (e) {}
  try {
    var tr = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.TRACK&ham_uid=eq.' + HAM + '&summary=ilike.*OPEN*'
      + '&order=created_at.desc&limit=10&select=summary', { headers: _rh() }).then(function (r) { return r.json(); });
    (Array.isArray(tr) ? tr : []).forEach(function (row) {
      var t = String(row.summary || '').replace(/\[TRACK OPEN\]\s*/i, '').replace(/^request:\s*/i, '').slice(0, 120).trim();
      if (t) out.owed.push(t);
    });
  } catch (e) {}
  out.decisions = out.decisions.slice(0, 6);
  out.owed = out.owed.slice(0, 4);
  out.count = out.decisions.length + out.owed.length;
  return out;
}

function worthSession(agenda) { return !!(agenda && agenda.count >= MIN_AGENDA); }

// A real open slot, verified against the HAM's live calendar first.
async function pickSlot(hamUid, durationMin) {
  try {
    var prefs = await _sched.getHamPrefs(hamUid);
    var events = [];
    var verified = false;
    try {
      var live = await _sched.listCalendarEvents(hamUid, {});
      if (live && live.ok) { events = live.events || []; verified = true; }
    } catch (e) {}
    if (!verified) { try { var rad = await _sched.getRadarEvents(hamUid); events = rad || []; verified = Array.isArray(rad) && rad.length > 0; } catch (e) {} }
    var slots = _sched.computeFreeSlots(events, prefs) || [];
    var now = Date.now();
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var startMs = (typeof s.start === 'number') ? s.start * 1000 : new Date(s.start).getTime();
      if (!isNaN(startMs) && startMs > now + 3600000) {
        var start = new Date(startMs);
        var end = new Date(startMs + (durationMin || 30) * 60000);
        return { startISO: start.toISOString(), endISO: end.toISOString(), verified: verified };
      }
    }
  } catch (e) {}
  return null;
}

function buildAgendaText(agenda) {
  var lines = [];
  if (agenda.decisions.length) { lines.push('What we need to decide:'); agenda.decisions.forEach(function (d) { lines.push('- ' + d.who + ': ' + d.text); }); }
  if (agenda.owed.length) { lines.push('Open items I owe you:'); agenda.owed.forEach(function (o) { lines.push('- ' + o); }); }
  lines.push('My prep: I will pull the latest on each of these and come with options, so we decide in the room, not gather in it.');
  return lines.join('\n');
}

// Direct, focused triage -- never the invented-framework failure. Ruthless HANDLE vs
// ESCALATE, org-chart framing inlined, no research, no worksheets, no matrices.
async function reasonAgenda(hamUid, coldAnchorText) {
  var key = process.env.GROQ_API_KEY;
  if (!key) return { reasoned: false };
  var org = 'ORG CHART, ABSOLUTE: the person you serve is the PRINCIPAL at the very top of this org, above every adviser. '
    + 'Their time is the single most expensive resource here, so reaching them is the rarest and most earned action. Default to '
    + 'handling the work yourself and finishing it. Bring something to the principal ONLY when it genuinely cannot move without '
    + 'them: a real decision that cannot be settled over a text or an email, or a strategic update that truly warrants their '
    + 'attention. Never assume a fixed title like founder or CEO.';
  var sys = 'You are the lead adviser to the PRINCIPAL at the very top of this org. ' + org
    + ' Right now you are triaging real open items for a possible 30-minute working session. You do NOT research anything new, '
    + 'and you NEVER build frameworks, worksheets, matrices, templates, checklists, or processes. You only judge the items given.';
  var user = 'Real open items the advisers raised and what is owed:\n\n' + coldAnchorText
    + '\n\nFor EACH item decide HANDLE (finish it yourself, no principal time) or ESCALATE (a real decision that cannot be settled '
    + 'over a text or an email, or a strategic update that truly warrants the principal). Be ruthless: most are HANDLE. '
    + 'Name the ACTUAL item in plain words, invent nothing beyond what is above. '
    + 'If nothing genuinely needs the principal, reply with exactly "NO SESSION" on the first line, then one sentence on what you '
    + 'are handling for them instead. Otherwise give ONLY the ESCALATE items, at most three, each one line naming the adviser it '
    + 'came from, and a second short line of what you have already prepped so they decide in seconds. Nothing else, no preamble.';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 500, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
    }).then(function (x) { return x.json(); });
    var out = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    if (out && String(out).trim().length > 10) {
      var brief = String(out).trim();
      var declined = /^\s*NO SESSION\b/im.test(brief) || /\bno session\b|nothing (genuinely )?needs|handle (it|this|these|them) (myself|ourselves)/i.test(brief);
      return { reasoned: true, brief: brief, declined: declined };
    }
  } catch (e) {}
  return { reasoned: false };
}

async function resolveModality(hamUid) {
  try {
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.MEETING_MODE&ham_uid=eq.' + String(hamUid).toUpperCase() + '&select=content&order=created_at.desc&limit=1',
      { headers: _rh() }).then(function (r) { return r.json(); });
    if (Array.isArray(rows) && rows[0]) { var c = JSON.parse(rows[0].content || '{}'); if (c.mode) return c.mode; }
  } catch (e) {}
  return 'either';
}
function _modalityLine(mode, hamUid, portalBase) {
  var link = (portalBase || 'https://anu-anew.com') + '/cip/' + String(hamUid || '').toLowerCase();
  if (mode === 'call') return 'When it is time, I will call you and we run it live.';
  if (mode === 'portal') return 'When it is time, meet me at your live portal and we go: ' + link;
  return 'Your call on how we meet: I can call you at the time, or you meet me at your live portal (' + link + '). Tell me which and I will lock it that way.';
}

// THE WONDER, as a conversational tool. Returns data; the caller (tool.loop.js) hands it
// back to the model, which weaves it into its own reply through the normal answer path.
async function proposeSession(hamUid, opts) {
  opts = opts || {};
  try {
    var HAM = String(hamUid || '').toUpperCase();
    if (!HAM) return { ok: false, reason: 'no_ham' };
    var agenda = await gatherAgenda(HAM);
    if (!worthSession(agenda)) return { ok: true, convened: false, reason: 'not_enough_real_material', count: agenda.count };
    var anchorText = buildAgendaText(agenda);
    var reasoned = await reasonAgenda(HAM, anchorText);
    if (reasoned.reasoned && reasoned.declined) return { ok: true, convened: false, reason: 'advisers_judged_no_session_needed', count: agenda.count };
    var agendaText = reasoned.reasoned ? reasoned.brief : anchorText;
    var slot = await pickSlot(HAM, 30);
    var mode = await resolveModality(HAM);
    var modalityLine = _modalityLine(mode, HAM, process.env.PORTAL_BASE_URL);
    var autobook = (opts.autobook === true) || String(process.env.SESSION_AUTOBOOK || '').toLowerCase() === 'true';
    var booked = null;
    if (autobook && slot) booked = await _sched.bookEvent(HAM, { title: 'Working session with A\u2019NU', start: slot.startISO, end: slot.endISO, description: agendaText + '\n\n' + modalityLine });
    try {
      await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh(), body: JSON.stringify({
        ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION',
        acl_stamp: '\u2b21B:core.session:SESSION:' + (booked && booked.ok ? 'booked' : 'proposed') + ':' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '\u2b21',
        source: 'session.' + HAM + '.' + Date.now(),
        summary: '[SESSION ' + (booked && booked.ok ? 'BOOKED' : 'PROPOSED') + '] ' + agenda.count + ' real items, reasoned=' + (reasoned.reasoned ? 'yes' : 'no') + (slot ? ' | ' + slot.startISO.slice(0, 16) : ''),
        content: JSON.stringify({ agenda: agenda, agendaText: agendaText, mode: mode, slot: slot, booked: booked && booked.ok ? booked : null, autobook: autobook }), importance: 7
      }) });
    } catch (e) {}
    var when = slot ? new Date(slot.startISO) : null;
    var whenStr = when ? when.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    var head;
    if (booked && booked.ok) head = 'I put us down for a working session ' + whenStr + '. Enough came to a head that needs your call, so I booked it and I am coming prepped.';
    else if (slot) head = 'Enough real work has come to a head that needs your call, so I want to sit down ' + whenStr + '. Want me to lock it?';
    else head = 'Enough real work has come to a head that needs your call and I want to sit down, but I could not find an open slot. Give me a time and I will set it.';
    var slotCaveat = (slot && slot.verified === false) ? ' One straight thing: I have not fully synced your calendar yet, so confirm that time is actually open for you before I lock it.' : '';
    var msg = head + slotCaveat + '\n\n' + agendaText + '\n\n' + modalityLine;
    return { ok: true, convened: true, reasoned: reasoned.reasoned, booked: booked && booked.ok ? booked : null, slot: slot, mode: mode, agenda: agenda, message: msg };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

// Capture outcomes: decisions recorded, every assignment a real TRACK OPEN item.
async function completeSession(hamUid, outcome) {
  outcome = outcome || {};
  try {
    var HAM = String(hamUid || '').toUpperCase();
    if (!HAM) return { ok: false, reason: 'no_ham' };
    var decisions = Array.isArray(outcome.decisions) ? outcome.decisions : [];
    var assignments = Array.isArray(outcome.assignments) ? outcome.assignments : [];
    var notes = String(outcome.notes || '').slice(0, 2000);
    var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    try {
      await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh(), body: JSON.stringify({
        ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION_OUTCOME',
        acl_stamp: '\u2b21B:core.session:SESSION_OUTCOME:captured:' + ymd + '\u2b21',
        source: 'session.outcome.' + HAM + '.' + Date.now(),
        summary: '[SESSION OUTCOME] ' + decisions.length + ' decision(s), ' + assignments.length + ' assignment(s)',
        content: JSON.stringify({ sessionId: outcome.sessionId || null, decisions: decisions, assignments: assignments, notes: notes }), importance: 7
      }) });
    } catch (e) {}
    var tracked = 0;
    for (var i = 0; i < assignments.length; i++) {
      var a = String(assignments[i] && assignments[i].text ? assignments[i].text : assignments[i]).slice(0, 200);
      if (!a.trim()) continue;
      var owner = (assignments[i] && assignments[i].owner) ? String(assignments[i].owner) : 'A\u2019NU';
      try {
        await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh(), body: JSON.stringify({
          ham_uid: HAM, agent_global: owner.toUpperCase(), stamp_type: 'TRACK',
          acl_stamp: '\u2b21B:core.session:TRACK:OPEN:from_session:' + ymd + '\u2b21',
          source: 'track.session.' + HAM + '.' + Date.now() + '.' + i,
          summary: '[TRACK OPEN] (' + owner + ' owes, from session) ' + a,
          content: JSON.stringify({ status: 'OPEN', text: a, owner: owner, from: 'session', createdAt: Date.now() }), importance: 6 }) });
        tracked++;
      } catch (e) {}
    }
    return { ok: true, captured: true, decisions: decisions.length, assignmentsTracked: tracked };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

module.exports = { proposeSession, completeSession, gatherAgenda, worthSession };
