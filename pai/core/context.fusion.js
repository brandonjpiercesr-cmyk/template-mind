// ⬡B:core.context_fusion:BUILD:phase_3b_she_knows_your_day_20260710⬡
// PHASE 3B of the 2046 JARVIS roadmap: context fusion, the "she knows you're in
// DC looking for a spot" layer, built cold. A daemon fuses real sources into one
// rolling context object on the brain, and every judgment turn grounds against
// the freshest one, with decay language so stale context is never asserted as
// now. Sources, all real, all read-only:
//   calendar: the founder-world work grant (NYLAS_GRANT_ID on the sandbox app
//     key), next 24 hours, titles and times only. THE EBC WALL IS LAW HERE:
//     this module reads ONLY the configured founder-world grant and is
//     structurally incapable of touching client grants (BDIF, Mediators,
//     MH Action), because their env names never appear in this file.
//   channels: her own memory (channel_turn + portal_turn, last 24h) counted by
//     lane, so she knows where the conversation has been living.
//   screen: whether a live glass is open right now, and which portal.
// No LLM anywhere in this file. Cold code fuses; the mind only reads.
// Reached via the ABAHAM door (routes/context.fusion.routes.js), serving channel MESSAGES.
'use strict';
// ⬡B:core.context.fusion:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


const BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;

async function readCalendarNext24h(hamUid) {
  // B:context_fusion:FIX:ebc_firewall_multigrant_founder_only_20260712 CRITICAL EBC
  // GUARD: the multi-grant read (personal+GMG+BDIF+Mediators+MH Action merged) is
  // ONLY lawful for the founder's OWN personal world, which is his private command
  // center and allowed to see everything he owns. For ANY other world/HAM (a BDIF,
  // Mediators, or MH Action advisor/email cycle), merging grants would leak a sibling
  // world's calendar into that world's context -- the exact three-way firewall breach
  // that went live on 2026-07-11. So: founder personal -> all grants; any other world
  // -> no cross-world calendar at all. Isolation preserved.
  const FOUNDER = String(process.env.FOUNDER_HAM_UID || '');
  const isFounderPersonal = FOUNDER && String(hamUid || '').toUpperCase() === FOUNDER.toUpperCase();
  if (!isFounderPersonal) return { available: false, events: [] }; // never merge grants for a non-founder world
  const NY = 'https://api.us.nylas.com/v3/grants/';
  const KEY = process.env.NYLAS_API_KEY;
  if (!KEY) return { available: false, events: [] };
  const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const grants = [process.env.NYLAS_PERSONAL_GRANT, process.env.NYLAS_GMG_GRANT, process.env.NYLAS_BDIF_GRANT,
    process.env.NYLAS_MEDIATORS_GRANT, process.env.NYLAS_MH_ACTION_GRANT].filter(Boolean);
  if (!grants.length) return { available: false, events: [] };
  const now = Math.floor(Date.now() / 1000), end = now + 24 * 3600;
  const events = [];
  try {
    await Promise.all(grants.map(async function (gid) {
      try {
        const cr = await fetch(NY + gid + '/calendars?limit=10', { headers: H });
        if (!cr.ok) return;
        const cals = (await cr.json()).data || [];
        const primary = cals.find(function (c) { return c.is_primary || (c.name && c.name.indexOf('@') !== -1); }) || cals[0];
        if (!primary) return;
        const er = await fetch(NY + gid + '/events?calendar_id=' + encodeURIComponent(primary.id) + '&start=' + now + '&end=' + end + '&limit=15', { headers: H });
        if (!er.ok) return;
        (((await er.json()).data) || []).forEach(function (e) {
          const when = e.when || {};
          const startTs = when.start_time || when.time || (when.start_date ? Math.floor(new Date(when.start_date + 'T00:00:00').getTime() / 1000) : 0);
          // ⬡B:context_fusion:FIX:human_dates_and_today_flag_for_the_cycle:20260718⬡ the cycle
          // was handed raw ISO ("Myrtle Beach at 2026-07-15T00:00:00.000Z") and left to do
          // its own timezone math, which is how it reads a passed all-day event as upcoming.
          // Cold code stamps the human date and whether it is genuinely today, same rule as
          // the /os/calendar choke point: all-day is a floating UTC square, timed is a local instant.
          const _tz = process.env.HAM_TIMEZONE || 'America/New_York';
          const _fL = new Intl.DateTimeFormat('en-US', { timeZone:_tz, weekday:'long', month:'long', day:'numeric' });
          const _fU = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'long', month:'long', day:'numeric' });
          const _fT = new Intl.DateTimeFormat('en-US', { timeZone:_tz, hour:'numeric', minute:'2-digit' });
          const _d = startTs ? new Date(startTs * 1000) : null;
          const _allDay = !!when.start_date;
          const _todayL = _fL.format(new Date());
          const _todayF = _fU.format(new Date(new Date().toLocaleString('en-US', { timeZone:_tz })));
          const _dateStr = _d ? (_allDay ? _fU.format(_d) : _fL.format(_d)) : null;
          var _timeStr = _d ? (_allDay ? 'all day' : _fT.format(_d)) : 'time unknown';
          events.push({ title: String(e.title || 'untitled').slice(0, 80),
            start: startTs ? new Date(startTs * 1000).toISOString() : null,
            date: _dateStr || 'date unknown', time: _timeStr,
            is_today: !!(_dateStr && _dateStr === (_allDay ? _todayF : _todayL)),
            allDay: _allDay });
        });
      } catch (eg) { /* one grant failing never blinds the rest */ }
    }));
    events.sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
    return { available: true, events: events.slice(0, 12) };
  } catch (e) { return { available: false, events: [] }; }
}

async function readChannelActivity(hamUid) {
  var _noChannels = Object.create(null);
  if (!_bu() || !_bk()) return _noChannels;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=source,content&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&created_at=gte.' + encodeURIComponent(since)
      + '&or=(source.like.logful.channel_turn.*,source.like.logful.portal_turn.*)&limit=200',
      { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    const counts = {};
    rows.forEach(function (row) {
      let ch = 'glass';
      try { const c = JSON.parse(row.content); ch = (c.channel) || (row.source.indexOf('portal_turn') !== -1 ? 'glass' : 'unknown'); } catch (e) {}
      counts[ch] = (counts[ch] || 0) + 1;
    });
    return counts;
  } catch (e) { return _noChannels; }
}

// The fusion object is the ALIVE perception contract.  Keep the individual fact
// timestamps alongside the aggregate timestamp so a consumer can decay a single
// stale source without pretending that the whole world model is current.
function buildPerceptionSnapshot(hamUid, calendar, channels, screen, now) {
  var observedAt = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  return {
    schema: 'anew.alive.perception.v1',
    ham_uid: String(hamUid),
    as_of: observedAt,
    facts: {
      calendar: { observed_at: observedAt, value: calendar },
      channels: { observed_at: observedAt, window: 'PT24H', value: channels },
      screen: { observed_at: observedAt, value: screen }
    },
    // Keep the established shape while callers transition to facts.*.
    calendar: calendar,
    channels: channels,
    screen: screen
  };
}

async function runFuse(hamUid) {
  if (!hamUid) return { ok: false, reason: 'hamUid required' };
  const cal = await readCalendarNext24h(hamUid);
  const channels = await readChannelActivity(hamUid);
  let screen = { live: false };
  try {
    const sa = require('./stream/screen.awareness.js');
    screen = { live: sa.hasLiveScreen(hamUid) };
  } catch (e) {}
  const fusion = buildPerceptionSnapshot(hamUid, cal, channels, screen);
  try {
    const brain = require('./brain.client');
    await brain.writeBead({ hamUid: hamUid, agentGlobal: 'FUSION', type: 'CONTEXT_FUSION',
      source: 'context.fusion.' + hamUid + '.' + Date.now(), importance: 4,
      summary: '[CONTEXT FUSION] cal:' + (cal.available ? cal.events.length + ' events next 24h' : 'unavailable')
        + ' channels:' + Object.keys(channels).map(function (k) { return k + '=' + channels[k]; }).join(',')
        + ' screen:' + (screen.live ? 'live' : 'closed'),
      content: fusion,
      edges: [{ type: 'grounds', target: hamUid + '.judgment_turns' }] });
  } catch (e) { return { ok: false, reason: 'bead write failed: ' + e.message }; }
  return { ok: true, fusion: fusion };
}

// The mind's read: freshest fusion, formatted with honest decay language.
async function getLatestSummary(hamUid) {
  if (!_bu() || !_bk() || !hamUid) return '';
  try {
    const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=content,created_at&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&source=like.context.fusion.*&order=created_at.desc&limit=1',
      { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    if (!rows.length) return '';
    const f = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
    const ageMin = Math.round((Date.now() - Date.parse(f.as_of)) / 60000);
    if (ageMin > 180) return ''; // too stale to assert at all
    const parts = [];
    if (f.calendar && f.calendar.available) {
      // ⬡B:context_fusion:FIX:today_not_iso_and_unreachable_is_real:20260718⬡ speak in
      // human today-terms off the stamped fields, never raw ISO, and separate the events
      // that are actually TODAY from later ones so the cycle never calls a future or past
      // day "today". available:false already means unreachable, so wide-open is only ever
      // asserted when the read genuinely succeeded and returned nothing.
      var _today = (f.calendar.events || []).filter(function (e) { return e.is_today; });
      var _later = (f.calendar.events || []).filter(function (e) { return !e.is_today; });
      if (_today.length) {
        var _todayStr = 'calendar TODAY: ' + _today.map(function (e) { return e.title + (e.allDay ? ' (all day)' : ' at ' + (e.time || e.start)); }).join('; ');
        if (_later.length) { _todayStr += ' | later this window (NOT today): ' + _later.map(function (e) { return e.title + ' on ' + (e.date || e.start); }).join('; '); }
        parts.push(_todayStr);
      } else if (_later.length) {
        parts.push('today itself is open; upcoming days hold: ' + _later.map(function (e) { return e.title + ' on ' + (e.date || e.start); }).join('; ') + ' (never present any of these as today)');
      } else {
        parts.push('your next 24 hours are wide open with nothing scheduled (this is real, known information, not a lack of it)');
      }
    }
    const chKeys = Object.keys(f.channels || {});
    if (chKeys.length) parts.push('recent conversation lanes (24h): ' + chKeys.map(function (k) { return k + ' x' + f.channels[k]; }).join(', '));
    if (!parts.length) return '';
    return '\nWORLD CONTEXT, fused as of ' + ageMin + ' minutes ago. You DO currently know this and must answer from it directly. A clear or open calendar is a real answer, never say you lack information about the day when this line tells you the day is open. When asked about the day, schedule, or where the conversation has lived, answer from THIS first, above any memory search, with "as of" language, never as this exact second: ' + parts.join(' | ');
  } catch (e) { return ''; }
}

module.exports = { runFuse, getLatestSummary, buildPerceptionSnapshot };
