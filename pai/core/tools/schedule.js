// ⬡B:core.tools.schedule:MODULE:calendar_read_and_book_ported:20260714⬡
// DOCTRINE (entry): this schedule logic is never an entry point of its own. It runs inside
// the one PAI cycle, whose entry is always A'NEW through the ABAHAM door -- calendar_read
// and calendar_book call these helpers from inside that cycle, never from a side gate.
// Ported from aibebase core/schedule/schedule.logic.js so the new world's own /cycle can
// give the HAM real calendar tools during a live conversation, not just when the legacy
// fallback answers. Trimmed to what calendar_read/calendar_book need: the real ABACIA
// (legacy identity/calendar-grant lookup, unrelated to MEMORY_BANK/aibe_brain) and Nylas
// event read/create paths, byte-matched to the proven aibebase logic. No route handlers
// ported (this world answers over /cycle, not raw HTTP route dispatch).
'use strict';

const https = require('https');

const ABA_SERVER_URL = process.env.ABA_SERVER_URL || 'https://dnzwyufdzafcwnjaqbxs.supabase.co';
const ABA_SERVER_SRK = process.env.ABA_SERVER_SERVICE_ROLE_KEY;
const NYLAS_KEY       = process.env.NYLAS_PRODUCTION_KEY || process.env.NYLAS_API_KEY;
// ⬡B:core.tools.schedule:FIX:calendar_grant_lives_on_production_not_sandbox:20260714⬡
// Same fix as the aibebase source: the real calendar grant (env-driven, verified
// valid) only resolves against the PRODUCTION Nylas key. Preferred here without touching
// NYLAS_API_KEY, which other paths in this world may depend on staying as-is.
const NYLAS_HOST      = 'api.us.nylas.com';

const PREFS_DEFAULT = {
  timezone:     'America/New_York',
  bizHours:     { start: 9, end: 19 },
  slotDuration: 30,
  daysAhead:    14,
  weekendsOff:  true,
};
const MEM = '\u2B21';

function hamSchema(uid) { return `ham_${String(uid).toLowerCase()}`; }

function abaGet(schema, path) {
  return new Promise((resolve, reject) => {
    if (!ABA_SERVER_SRK) return reject(new Error('ABA_SERVER_SERVICE_ROLE_KEY not configured'));
    const url = new URL(ABA_SERVER_URL);
    const opts = { hostname: url.hostname, path, method: 'GET',
      headers: { apikey: ABA_SERVER_SRK, Authorization: `Bearer ${ABA_SERVER_SRK}`, 'Accept-Profile': schema } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ABACIA timeout')); });
    req.end();
  });
}

function abaPost(schema, path, payload) {
  return new Promise((resolve, reject) => {
    if (!ABA_SERVER_SRK) return reject(new Error('ABA_SERVER_SERVICE_ROLE_KEY not configured'));
    const url = new URL(ABA_SERVER_URL);
    const data = JSON.stringify(payload);
    const opts = { hostname: url.hostname, path, method: 'POST',
      headers: { apikey: ABA_SERVER_SRK, Authorization: `Bearer ${ABA_SERVER_SRK}`, 'Content-Type': 'application/json',
        'Accept-Profile': schema, 'Content-Profile': schema, Prefer: 'return=representation,resolution=merge-duplicates' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ABACIA timeout')); });
    req.write(data); req.end();
  });
}

function nylasReq(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    if (!NYLAS_KEY) return reject(new Error('NYLAS_API_KEY not configured'));
    const opts = { hostname: NYLAS_HOST, path, method,
      headers: { Authorization: `Bearer ${NYLAS_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Nylas timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getHamPrefs(uid) {
  try {
    const r = await abaGet(hamSchema(uid), '/rest/v1/abacia?source=eq.ham.prefs&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) return { ...PREFS_DEFAULT, ...JSON.parse(r.body[0].content) };
  } catch (e) {}
  return PREFS_DEFAULT;
}

async function getCalendarGrant(uid) {
  try {
    const r = await abaGet(hamSchema(uid), '/rest/v1/abacia?source=eq.nylas.grant.calendar&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      const parsed = JSON.parse(r.body[0].content);
      return { grantId: parsed.grant_id, calendarId: parsed.calendar_id || parsed.email, email: parsed.email,
        notificationGrant: parsed.notification_grant || process.env.NYLAS_CLAUDETTE_GRANT || null };
    }
  } catch (e) {}
  return null;
}

async function getRadarEvents(uid) {
  const now = new Date();
  try {
    const r = await abaGet(hamSchema(uid), `/rest/v1/abacia?source=like.RADAR.${String(uid).toUpperCase()}.event.%25&select=content&limit=200`);
    if (r.status === 200 && Array.isArray(r.body)) {
      return r.body.map(row => { try { return JSON.parse(row.content); } catch { return null; } })
        .filter(Boolean).filter(ev => { const end = new Date(ev.end_time); return end > now && !ev.is_all_day; });
    }
  } catch (e) {}
  return [];
}

function wallToUTC(localDateStr, wallHour, tz) {
  const probe = new Date(`${localDateStr}T${String(wallHour).padStart(2, '0')}:00:00Z`);
  const inTZ = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(probe);
  const [h] = inTZ.split(':').map(Number);
  const drift = h - wallHour;
  return new Date(probe.getTime() - drift * 3600000);
}

function computeFreeSlots(busyEvents, prefs = PREFS_DEFAULT) {
  const tz = prefs.timezone || 'America/New_York';
  const slotMs = (prefs.slotDuration || 30) * 60 * 1000;
  const now = new Date();
  const slots = [];
  const busy = busyEvents.map(ev => ({ start: new Date(ev.start_time || (ev.start * 1000)), end: new Date(ev.end_time || (ev.end * 1000)) }));
  for (let d = 0; d < (prefs.daysAhead || 14); d++) {
    const ref = new Date(); ref.setUTCDate(ref.getUTCDate() + d);
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ref);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(ref);
    if (prefs.weekendsOff && (weekday === 'Sat' || weekday === 'Sun')) continue;
    const bizStart = wallToUTC(localDate, prefs.bizHours?.start ?? 9, tz);
    const bizEnd = wallToUTC(localDate, prefs.bizHours?.end ?? 19, tz);
    if (bizEnd < now) continue;
    let cursor = bizStart < now ? new Date(Math.ceil(now.getTime() / slotMs) * slotMs) : new Date(bizStart);
    while (cursor.getTime() + slotMs <= bizEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + slotMs);
      const blocked = busy.some(ev => ev.start < slotEnd && ev.end > cursor);
      if (!blocked) slots.push({ start: Math.floor(cursor.getTime() / 1000), end: Math.floor(slotEnd.getTime() / 1000) });
      cursor = slotEnd;
    }
  }
  return slots;
}

async function writeScheduleBead(uid, source, content, tags, importance = 7) {
  const stamp = `${MEM}B:${source}:RESULT:schedule:20260714${MEM}`;
  return abaPost(hamSchema(uid), '/rest/v1/abacia', {
    acl_stamp: stamp, ham_uid: String(uid).toUpperCase(), agent_global: 'SCHED', context_suffix: 'booking',
    channel: 'web', stamp_type: 'RESULT', stamped_by: 'SCHED', source,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    memory_type: 'schedule', importance, tags, categories: ['schedule', 'booking'],
    metadata: { written_at: new Date().toISOString() } });
}

async function bookEvent(uid, opts) {
  opts = opts || {};
  try {
    if (!uid) return { ok: false, reason: 'no_uid' };
    const grant = await getCalendarGrant(uid);
    if (!grant) return { ok: false, reason: 'no_calendar', uid };
    function toEpoch(v) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
      const t = new Date(v).getTime();
      return isNaN(t) ? null : Math.floor(t / 1000);
    }
    const title = String(opts.title || 'Event').slice(0, 200);
    const startEpoch = toEpoch(opts.start);
    let endEpoch = toEpoch(opts.end);
    if (opts.end !== null && opts.end !== undefined && endEpoch === null) return { ok: false, reason: 'bad_times' };
    if (startEpoch && endEpoch === null) endEpoch = startEpoch + (Number(opts.durationMin) > 0 ? Number(opts.durationMin) : 45) * 60;
    if (!startEpoch || !endEpoch || endEpoch <= startEpoch) return { ok: false, reason: 'bad_times' };
    const eventRes = await nylasReq(`/v3/grants/${grant.grantId}/events?calendar_id=${encodeURIComponent(grant.calendarId)}`, 'POST',
      { title, when: { start_time: startEpoch, end_time: endEpoch }, description: String(opts.description || '').slice(0, 500) });
    const eventId = (eventRes && eventRes.body && eventRes.body.data && eventRes.body.data.id) || null;
    if (!eventId && eventRes && eventRes.status >= 400) return { ok: false, reason: 'nylas_error', status: eventRes.status };
    try { await writeScheduleBead(uid, `schedule.selfbooked.${startEpoch}`,
      { title, startEpoch, endEpoch, eventId, status: 'confirmed', bookedBy: 'A\u2019NU' }, ['schedule', 'self_booking'], 6); } catch (eb) {}
    return { ok: true, eventId, title, start: new Date(startEpoch * 1000).toISOString(), end: new Date(endEpoch * 1000).toISOString() };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

async function listCalendarEvents(uid, opts) {
  opts = opts || {};
  try {
    const grant = await getCalendarGrant(uid);
    if (!grant) return { ok: false, reason: 'no_calendar', events: [] };
    const now = Math.floor(Date.now() / 1000);
    const startEpoch = opts.startEpoch || now;
    const endEpoch = opts.endEpoch || (now + 14 * 24 * 3600);
    const path = `/v3/grants/${grant.grantId}/events?calendar_id=${encodeURIComponent(grant.calendarId)}&start=${startEpoch}&end=${endEpoch}&limit=100`;
    const r = await nylasReq(path, 'GET');
    if (!r || r.status >= 400) return { ok: false, reason: 'nylas_error', status: r && r.status, events: [] };
    const data = (r.body && r.body.data) || [];
    const events = data.map(e => { const w = e.when || {}; const s = w.start_time || w.time || null;
      return { start: s, end: w.end_time || (s ? s + 1800 : null), title: e.title || '' }; }).filter(e => e.start && e.end);
    return { ok: true, events };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message, events: [] }; }
}

module.exports = { getRadarEvents, getHamPrefs, computeFreeSlots, bookEvent, listCalendarEvents };
