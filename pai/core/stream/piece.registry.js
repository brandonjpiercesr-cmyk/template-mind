// ⬡B:core.stream.piece_registry:BUILD:component_control_phase_20260712⬡
// entered via the ABAHAM door, serving channel MESSAGES (her hands on the glass)
// COMPONENT-CONTROL PHASE. Until now she could open a whole app as a window; now
// she commands individual PIECES of the person's real life onto the glass -- pull
// just the budget snapshot, just an advisor answer, just the calendar. Each piece
// is a REAL data source that already exists (UNIVERSALITY law: nothing invented,
// nothing hardcoded to one HAM; every piece resolves for whatever hamUid asks).
// The piece becomes an AG-UI component the glass renders. A piece that has no live
// data hollow-skips rather than drawing an empty shell.
'use strict';
// ⬡B:core.stream.piece.registry:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


// the catalog: natural-language intents -> a real fetch that returns a renderable piece.
// keyed by canonical piece name; aliases let her match loose phrasing.
var PIECES = {
  budget: {
    aliases: ['budget', 'money', 'spending', 'finances', 'accounts', 'ledger'],
    // returns a chart-shaped piece from the person's real budget
    fetch: async function (hamUid, base, headers) {
      var r = await fetch(base + '/budget/' + hamUid, { headers: headers }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
      if (!r || !r.ok) return null;
      var accounts = (r.accounts || r.budget || []).slice(0, 8);
      if (!accounts.length) return null;
      return { type: 'chart', title: 'Your budget', series: accounts.map(function (a) {
        return { label: String(a.name || a.label || 'Account').slice(0, 18), value: Number(a.balance || a.amount || 0) }; }) };
    },
  },
  advisor: {
    aliases: ['advisor', 'advisors', 'advice', 'coach', 'my team', 'guidance'],
    // returns the latest advisor brief/answer as a card
    fetch: async function (hamUid, base, headers) {
      var r = await fetch(base + '/api/advisor/inbox', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ hamUid: hamUid }) }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
      if (!r || !r.ok) return null;
      var items = (r.items || r.messages || r.inbox || []).slice(0, 4);
      if (!items.length) return null;
      return { type: 'list', title: 'From your advisors', items: items.map(function (it) { return String(it.summary || it.text || it.subject || '').slice(0, 160); }).filter(Boolean) };
    },
  },
  calendar: {
    aliases: ['calendar', 'schedule', 'my day', 'agenda', 'appointments', 'events', 'upcoming'],
    fetch: async function (hamUid, base, headers) {
      var r = await fetch(base + '/os/calendar/' + hamUid, { headers: headers }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
      if (!r || !r.ok) return null;
      var events = (r.events || r.items || []).slice(0, 8);
      if (!events.length) return { type: 'card', title: 'Your calendar', text: 'Your next 24 hours are wide open with nothing scheduled.' };
      return { type: 'timeline', title: 'Your calendar', events: events.map(function (e) {
        return { when: String(e.when || e.time || '').slice(0, 40), title: String(e.title || e.summary || 'Event').slice(0, 90) }; }).filter(function (x) { return x.title; }) };
    },
  },
  today: {
    aliases: ['today', 'my day', 'what do you know', 'catch me up', 'brief me', 'whats going on'],
    fetch: async function (hamUid, base, headers) {
      try {
        var line = await require('../context.fusion.js').getLatestSummary(hamUid);
        if (!line || !line.trim()) return null;
        var clean = String(line).replace(/WORLD CONTEXT[^:]*:/i, '').trim();
        if (clean.length < 12) return null;
        return { type: 'hero', title: 'Right now', text: clean.slice(0, 320) };
      } catch (e) { return null; }
    },
  },
  jobs: {
    aliases: ['job', 'jobs', 'applications', 'job search', 'awa', 'roam', 'openings', 'positions'],
    // reads real AWA/job activity stamped for this ham; empty until the AWA pipeline
    // has produced data for them (honest hollow-skip, never a faked opening)
    fetch: async function (hamUid, base, headers) {
      var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
      if (!_bu() || !_bk()) return null;
      var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=summary,importance&ham_uid=eq.' + encodeURIComponent(hamUid)
        + '&stamp_type=in.(JOB,JOB_MATCH,APPLICATION,ROAM,AWA)&order=created_at.desc&limit=6',
        { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
        .then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; });
      var items = (rows || []).map(function (r) { return String(r.summary || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(function (t) { return t.length > 12; }).slice(0, 6);
      if (!items.length) return null; // honest: no faked openings, nothing until the AWA pipeline delivers
      return { type: 'list', title: 'Your job search', items: items.map(function (t) { return t.slice(0, 140); }) };
    },
  },
  reminders: {
    aliases: ['reminder', 'reminders', 'todo', 'to do', 'to-do', 'tasks', 'what should i do'],
    fetch: async function (hamUid, base, headers) {
      var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
      if (!_bu() || !_bk()) return null;
      var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=summary,importance&ham_uid=eq.' + encodeURIComponent(hamUid)
        + '&stamp_type=in.(REMINDER,TASK,NUDGE)&order=created_at.desc&limit=6',
        { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
        .then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; });
      // ⬡B:core.stream.piece_registry:FIX:reminders_are_his_life_not_builds_20260712⬡
      // Founder caught coding TASK stamps ([HEAL RESPEC] core/anew.js shipped with N
      // CANON HOLDs, from another lane's self-healing) polluting his PERSONAL
      // reminders -- a firewall breach between coding-world and life-world. A personal
      // reminder never mentions a .js file, a CANON hold, an agent name, or a build
      // tag. Those are filtered out; only real life reminders survive.
      var CODE_NOISE = /HEAL|RESPEC|CANON|\.js\b|shipped with|deploy|commit|hold\(s\)|agents?\/|core\/|routes?\//i;
      var items = (rows || []).map(function (r) { return String(r.summary || ''); })
        .filter(function (raw) { return !CODE_NOISE.test(raw); })
        .map(function (raw) { return raw.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); })
        .filter(function (t) { return t.length > 12; }).slice(0, 6);
      if (!items.length) return null;
      return { type: 'list', title: 'Your reminders', items: items.map(function (t) { return t.slice(0, 140); }) };
    },
  },
};

// resolve a natural phrase to a canonical piece name, or null
function match(phrase) {
  var p = String(phrase || '').toLowerCase();
  var best = null;
  Object.keys(PIECES).forEach(function (name) {
    PIECES[name].aliases.forEach(function (a) { if (p.indexOf(a) !== -1 && (!best || a.length > best.len)) best = { name: name, len: a.length }; });
  });
  return best ? best.name : null;
}

// pull one piece for a ham; returns a renderable component or null (hollow-skip)
async function pull(pieceName, hamUid, base, headers) {
  var def = PIECES[pieceName];
  if (!def) return null;
  try { return await def.fetch(hamUid, base, headers); } catch (e) { return null; }
}

function names() { return Object.keys(PIECES); }

module.exports = { PIECES, match, pull, names };
