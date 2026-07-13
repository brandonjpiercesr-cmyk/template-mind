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

async function readCalendarNext24h() {
  const key = process.env.NYLAS_SANDBOX_KEY, grant = process.env.NYLAS_GRANT_ID;
  if (!key || !grant) return { available: false, events: [] };
  try {
    const now = Math.floor(Date.now() / 1000), end = now + 24 * 3600;
    const r = await fetch('https://api.us.nylas.com/v3/grants/' + encodeURIComponent(grant)
      + '/events?calendar_id=primary&start=' + now + '&end=' + end + '&limit=6',
      { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    if (!r.ok) return { available: false, events: [] };
    const d = await r.json();
    const events = (d.data || []).map(function (e) {
      const when = e.when || {};
      const startTs = when.start_time || (when.start_date ? Date.parse(when.start_date) / 1000 : null);
      return { title: String(e.title || 'untitled').slice(0, 80), start: startTs ? new Date(startTs * 1000).toISOString() : null };
    }).filter(function (e) { return e.start; });
    return { available: true, events: events };
  } catch (e) { return { available: false, events: [] }; }
}

async function readChannelActivity(hamUid) {
  if (!_bu() || !_bk()) return {};
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
  } catch (e) { return {}; }
}

async function runFuse(hamUid) {
  if (!hamUid) return { ok: false, reason: 'hamUid required' };
  const cal = await readCalendarNext24h();
  const channels = await readChannelActivity(hamUid);
  let screen = { live: false };
  try {
    const sa = require('./stream/screen.awareness.js');
    screen = { live: sa.hasLiveScreen(hamUid) };
  } catch (e) {}
  const fusion = { as_of: new Date().toISOString(), calendar: cal, channels: channels, screen: screen };
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
      parts.push(f.calendar.events.length
        ? ('calendar next 24h: ' + f.calendar.events.map(function (e) { return e.title + ' at ' + e.start; }).join('; '))
        : 'your next 24 hours are wide open with nothing scheduled (this is real, known information, not a lack of it)');
    }
    const chKeys = Object.keys(f.channels || {});
    if (chKeys.length) parts.push('recent conversation lanes (24h): ' + chKeys.map(function (k) { return k + ' x' + f.channels[k]; }).join(', '));
    if (!parts.length) return '';
    return '\nWORLD CONTEXT, fused as of ' + ageMin + ' minutes ago. You DO currently know this and must answer from it directly. A clear or open calendar is a real answer, never say you lack information about the day when this line tells you the day is open. When asked about the day, schedule, or where the conversation has lived, answer from THIS first, above any memory search, with "as of" language, never as this exact second: ' + parts.join(' | ');
  } catch (e) { return ''; }
}

module.exports = { runFuse, getLatestSummary };
