// ⬡B:AIR:REACH.SCHEDULE:CODE:scheduling.per_ham.booking:reach.schedule:T10:v2.0.0:20260606⬡
//
// DOCTRINE (entry clause): this schedule logic is never an entry point of its own. It runs
// inside the one PAI cycle, whose entry is always A'NEW through the ABAHAM door -- the
// calendar_read tool calls these helpers from inside that cycle, never from a side gate.
//
// v2 — addresses every real failure from v1:
//   1. HAM bleed: NO hardcoded grant IDs. No fallback to Brandon's calendar for other HAMs.
//      Returns 503 if no grant bead found. Isolation guaranteed at DB level via Accept-Profile.
//   2. Slot source: reads RADAR.{uid}.event.* beads from ham_{uid}.abacia — the brain already
//      has all calendar events stamped by RADAR. No Nylas API call for availability.
//   3. IMAN notification: native https, no execFile curl hack.
//   4. Privacy: event titles never exposed to the booker. Only slot windows returned.
//   5. CAL bead fallback path: reads CAL.{ham}.availability.{window} first when stamped,
//      falls back to RADAR events while global builds the loop.
//
// ROUTING: msria.org/schedule/{uid} → REACH → ham_{uid}.abacia → slots → response
// HAM ISOLATION: every ABACIA read uses Accept-Profile: ham_{uid} — scoped at DB level.

const https = require('https');
const crypto = require('node:crypto');

const ABA_SERVER_URL = process.env.ABA_SERVER_URL || 'https://dnzwyufdzafcwnjaqbxs.supabase.co';
const ABA_SERVER_SRK = process.env.ABA_SERVER_SERVICE_ROLE_KEY;
const NYLAS_KEY      = process.env.NYLAS_PRODUCTION_KEY || process.env.NYLAS_API_KEY;
// ⬡B:core.schedule.logic:FIX:calendar_grant_lives_on_production_not_sandbox:20260714⬡
// Found live tonight: the owner's real calendar grant (env-driven, verified valid)
// only resolves against the PRODUCTION Nylas key, not NYLAS_API_KEY (sandbox), which other
// systems in this codebase depend on staying sandbox for their own grants (BDIF/GMG/etc).
// So this file prefers NYLAS_PRODUCTION_KEY specifically for calendar ops and never
// touches the shared NYLAS_API_KEY other paths rely on.
const NYLAS_HOST     = 'api.us.nylas.com';
// CLAUDETTE grant — read from env. Never hardcoded here.

// All scheduling preferences are read per-HAM from the ham.prefs bead.
// No hardcoded values. Defaults below are fallback-only when the bead is absent.
const PREFS_DEFAULT = {
  timezone:     'America/New_York',
  bizHours:     { start: 9, end: 19 },
  slotDuration: 30,
  daysAhead:    14,
  weekendsOff:  true,
};
const MEM        = '\u2B21';

function abortSignal(options) {
  return options && (options.signal || options.abortSignal) || null;
}

async function cancellationRequested(options) {
  const signal = abortSignal(options);
  if (signal && signal.aborted) return true;
  if (options && typeof options.isCancelled === 'function') {
    try { return await options.isCancelled(true) === true; }
    catch (eCancel) { return true; }
  }
  return false;
}

function cancelled(extra) {
  return Object.assign({ ok:false, reason:'voice_turn_cancelled' }, extra || {});
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hamSchema(uid) {
  return `ham_${uid.toLowerCase()}`;
}

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// All ABACIA reads scoped to the HAM's schema via Accept-Profile — no cross-HAM access possible
function abaGet(schema, path, options) {
  return new Promise((resolve, reject) => {
    if (!ABA_SERVER_SRK) return reject(new Error('ABA_SERVER_SERVICE_ROLE_KEY not configured'));
    const url = new URL(ABA_SERVER_URL);
    const opts = {
      hostname: url.hostname,
      path,
      method: 'GET',
      headers: {
        apikey: ABA_SERVER_SRK,
        Authorization: `Bearer ${ABA_SERVER_SRK}`,
        'Accept-Profile': schema,
      },
    };
    const signal = abortSignal(options);
    if (signal) opts.signal = signal;
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ABACIA timeout')); });
    req.end();
  });
}

function abaPost(schema, path, payload, options) {
  return new Promise((resolve, reject) => {
    if (!ABA_SERVER_SRK) return reject(new Error('ABA_SERVER_SERVICE_ROLE_KEY not configured'));
    const url = new URL(ABA_SERVER_URL);
    const data = JSON.stringify(payload);
    const opts = {
      hostname: url.hostname,
      path,
      method: 'POST',
      headers: {
        apikey: ABA_SERVER_SRK,
        Authorization: `Bearer ${ABA_SERVER_SRK}`,
        'Content-Type': 'application/json',
        'Accept-Profile': schema,
        'Content-Profile': schema,
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
    };
    const signal = abortSignal(options);
    if (signal) opts.signal = signal;
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ABACIA timeout')); });
    req.write(data);
    req.end();
  });
}

function nylasReq(path, method = 'GET', body = null, extraHeaders, options) {
  return new Promise((resolve, reject) => {
    if (!NYLAS_KEY) return reject(new Error('NYLAS_API_KEY not configured'));
    const opts = {
      hostname: NYLAS_HOST,
      path,
      method,
      headers: Object.assign({
        Authorization: `Bearer ${NYLAS_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }, extraHeaders || {}),
    };
    const signal = abortSignal(options);
    if (signal) opts.signal = signal;
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Nylas timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function stableTransactionalId(prefix, value) {
  return prefix + '.' + crypto.createHash('sha256')
    .update(String(value), 'utf8').digest('hex').slice(0, 32);
}

async function requireClearKillSwitch(uid) {
  try {
    const state = await require('../killswitch.js').isActive(String(uid).toUpperCase());
    if (!state || typeof state.active !== 'boolean' || state.error) {
      return { ok:false, reason:'kill_switch_unverified' };
    }
    if (state.active) return { ok:false, reason:'kill_switch_active' };
    return { ok:true };
  } catch (e) { return { ok:false, reason:'kill_switch_unverified' }; }
}

function verifiedScheduleStamp(response, source, exactContent) {
  if (!response || response.status < 200 || response.status >= 300 ||
      !Array.isArray(response.body) || response.body.length !== 1) return false;
  const row = response.body[0];
  return row && row.source === source &&
    String(row.content) === (typeof exactContent === 'string'
      ? exactContent : JSON.stringify(exactContent));
}

// ⬡B:core.schedule.logic:EXCEPTION:transactional_status_email_boundary:20260715⬡
// Booking status mail is a fixed transactional receipt, not generative A'NU
// speech. The exception is narrow: the email must resolve back to this HAM,
// the final kill switch must be readable and clear, exact subject/body/target
// receive one durable effect claim, and success requires a Nylas message ID.
async function imanNotify(uid, grantId, toEmail, subject, htmlBody, sourceKey, options) {
  if (await cancellationRequested(options)) return cancelled();
  if (!NYLAS_KEY || !grantId || !uid || !toEmail) {
    return { ok:false, reason:'transactional_notification_unconfigured' };
  }
  var envelope;
  try { envelope = await require('../atmosphere.gate.js').resolveAtmosphere({ email:toEmail }); }
  catch (eIdentity) { return { ok:false, reason:'notification_identity_uncertain' }; }
  if (await cancellationRequested(options)) return cancelled();
  if (!envelope || String(envelope.ham_uid || '').toUpperCase() !== String(uid).toUpperCase()) {
    return { ok:false, reason:'notification_target_ham_mismatch' };
  }
  var kill = await requireClearKillSwitch(uid);
  if (await cancellationRequested(options)) return cancelled();
  if (!kill.ok) return kill;
  var message = { subject:String(subject), body:String(htmlBody),
    to:[{ email:String(toEmail).trim().toLowerCase() }] };
  var artifact = JSON.stringify(message);
  var requestId = stableTransactionalId('schedule.notify',
    String(sourceKey || '') + '\n' + String(uid).toUpperCase() + '\n' + artifact);
  var cycleId = stableTransactionalId('schedule.transactional', requestId);
  if (await cancellationRequested(options)) return cancelled();
  var claim = await require('../outbound.effect.js').claimProviderAttempt({
    hamUid:String(uid).toUpperCase(), channel:'schedule_notification',
    deliveryTarget:{ kind:'email', value:message.to }, artifact:artifact,
    requestId:requestId, cycleId:cycleId
  });
  if (!claim.ok) return { ok:false, reason:claim.reason,
    effectKey:claim.effectKey || null };
  if (await cancellationRequested(options)) return cancelled({
    effectKey:claim.effectKey || null });
  var result;
  try {
    result = await nylasReq(`/v3/grants/${grantId}/messages/send`, 'POST', message,
      { 'Idempotency-Key':claim.idempotencyKey }, options);
  } catch (eProvider) { return { ok:false, reason:'provider_uncertain',
    cancelled:!!(abortSignal(options) && abortSignal(options).aborted) }; }
  var messageId = result && result.status >= 200 && result.status < 300 &&
    result.body && result.body.data && result.body.data.id;
  if (typeof messageId !== 'string' || !messageId) return { ok:false,
    reason:result && result.status >= 500 ? 'provider_uncertain'
      : result && result.status >= 400 ? 'provider_rejected' : 'provider_unverified',
    providerStatus:result && result.status || null };
  return { ok:true, messageId:messageId, requestId:requestId, cycleId:cycleId };
}

// ─── per-HAM data reads from ABACIA ──────────────────────────────────────────

// Read ham.settings from ham_{uid}.abacia — key locked by global
async function getHamSettings(uid) {
  const DEFAULTS = {
    background: 'pink-smoke', backgroundMode: 'fixed',
    backgroundPool: ['pink-smoke'], kenBurns: true,
    kenBurnsDuration: 20, theme: 'glass-navy-copper',
  };
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.ham.settings&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      return { ...DEFAULTS, ...JSON.parse(r.body[0].content) };
    }
  } catch (e) {
    console.warn(`[SCHED] ham.settings read failed for ${uid}:`, e.message);
  }
  return DEFAULTS;
}

// Read ham.prefs from ABACIA — all scheduling preferences live here, not in code
async function getHamPrefs(uid) {
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.ham.prefs&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      return { ...PREFS_DEFAULT, ...JSON.parse(r.body[0].content) };
    }
  } catch (e) {
    console.warn('[SCHED] ham.prefs read failed for', uid, ':', e.message);
  }
  return PREFS_DEFAULT;
}


// Read calendar grant from ham_{uid}.abacia — source=nylas.grant.calendar
// NO hardcoded fallback. Returns null if not found → caller returns 503.
// This is the HAM bleed fix: if no grant bead exists for this HAM, we stop.
async function getCalendarGrant(uid, options) {
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.nylas.grant.calendar&select=content&limit=1', options);
    if (r.status === 200 && r.body && r.body.length > 0) {
      const parsed = JSON.parse(r.body[0].content);
      return {
        grantId:          parsed.grant_id,
        calendarId:       parsed.calendar_id || parsed.email,
        email:            parsed.email,
        notificationGrant: parsed.notification_grant || process.env.NYLAS_CLAUDETTE_GRANT || null,
      };
    }
  } catch (e) {
    console.error(`[SCHED] Calendar grant read failed for ${uid}:`, e.message);
  }
  return null;
}

// Read HAM's email for notifications — source=ham.settings or nylas.grant.calendar
async function getHamEmail(uid) {
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.nylas.grant.calendar&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      return JSON.parse(r.body[0].content).email || null;
    }
  } catch {}
  return null;
}

// Read RADAR event beads from ham_{uid}.abacia
// These are the HAM's actual calendar events, already stamped by RADAR.
// Titles are NOT returned to the booker — only start/end times for slot computation.
async function getRadarEvents(uid) {
  const now   = new Date();
  const limit = 200;
  try {
    // RADAR beads use source pattern RADAR.{UID}.event.*
    const r = await abaGet(hamSchema(uid),
      `/rest/v1/abacia?source=like.RADAR.${uid.toUpperCase()}.event.%25&select=content&limit=${limit}`);
    if (r.status === 200 && Array.isArray(r.body)) {
      return r.body.map(row => {
        try { return JSON.parse(row.content); }
        catch { return null; }
      }).filter(Boolean).filter(ev => {
        // Only events that end in the future
        const end = new Date(ev.end_time);
        return end > now && !ev.is_all_day;
      });
    }
  } catch (e) {
    console.error(`[SCHED] RADAR events read failed for ${uid}:`, e.message);
  }
  return [];
}

// Read CAL availability bead if global has stamped it (YYYYMM window key)
async function getCalAvailability(uid) {
  const now    = new Date();
  const window = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const source = `CAL.${uid.toLowerCase()}.availability.${window}`;
  try {
    const r = await abaGet(hamSchema(uid),
      `/rest/v1/abacia?source=eq.${encodeURIComponent(source)}&select=content&limit=1`);
    if (r.status === 200 && r.body && r.body.length > 0) {
      const parsed = JSON.parse(r.body[0].content);
      if (parsed.slots && Array.isArray(parsed.slots)) {
        console.log(`[SCHED] CAL bead found for ${uid}/${window}: ${parsed.slots.length} slots`);
        return parsed.slots;
      }
    }
  } catch (e) {
    console.warn(`[SCHED] CAL bead read failed for ${uid}:`, e.message);
  }
  return null;
}

// Check if a booker is expected (HAM invited them)
async function isExpectedBooker(uid, bookerEmail, bookerName) {
  const emailEnc = encodeURIComponent(bookerEmail.toLowerCase());
  try {
    const r = await abaGet(hamSchema(uid),
      `/rest/v1/abacia?tags=cs.%7Bexpected_booking%7D&content=ilike.*${emailEnc}*&limit=1`);
    if (r.status === 200 && r.body && r.body.length > 0) return true;
  } catch {}
  if (bookerName) {
    const nameEnc = encodeURIComponent(bookerName.split(' ')[0].toLowerCase());
    try {
      const r2 = await abaGet(hamSchema(uid),
        `/rest/v1/abacia?tags=cs.%7Bexpected_booking%7D&content=ilike.*${nameEnc}*&limit=1`);
      if (r2.status === 200 && r2.body && r2.body.length > 0) return true;
    } catch {}
  }
  return false;
}

// ─── slot computation from RADAR events ───────────────────────────────────────

// DST-safe slot computation — uses Intl.DateTimeFormat to convert wall-clock biz hours to UTC
// No hardcoded timezone offset. Reads prefs for bizHours, slotDuration, daysAhead, weekendsOff.
function wallToUTC(localDateStr, wallHour, tz) {
  const probe = new Date(`${localDateStr}T${String(wallHour).padStart(2,'0')}:00:00Z`);
  const inTZ  = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(probe);
  const [h]  = inTZ.split(':').map(Number);
  const drift = h - wallHour;
  return new Date(probe.getTime() - drift * 3600000);
}

function computeFreeSlots(busyEvents, prefs = PREFS_DEFAULT) {
  const tz     = prefs.timezone || 'America/New_York';
  const slotMs = (prefs.slotDuration || 30) * 60 * 1000;
  const now    = new Date();
  const slots  = [];
  const busy   = busyEvents.map(ev => ({
    start: new Date(ev.start_time || (ev.start * 1000)),
    end:   new Date(ev.end_time   || (ev.end   * 1000)),
  }));

  for (let d = 0; d < (prefs.daysAhead || 14); d++) {
    const ref   = new Date();
    ref.setUTCDate(ref.getUTCDate() + d);
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(ref);

    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(ref);
    if (prefs.weekendsOff && (weekday === 'Sat' || weekday === 'Sun')) continue;

    const bizStart = wallToUTC(localDate, prefs.bizHours?.start ?? 9,  tz);
    const bizEnd   = wallToUTC(localDate, prefs.bizHours?.end   ?? 19, tz);
    if (bizEnd < now) continue;

    let cursor = bizStart < now
      ? new Date(Math.ceil(now.getTime() / slotMs) * slotMs)
      : new Date(bizStart);

    while (cursor.getTime() + slotMs <= bizEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + slotMs);
      const blocked = busy.some(ev => ev.start < slotEnd && ev.end > cursor);
      if (!blocked) slots.push({
        start: Math.floor(cursor.getTime() / 1000),
        end:   Math.floor(slotEnd.getTime() / 1000),
      });
      cursor = slotEnd;
    }
  }
  return slots;
}


async function writeBead(uid, source, content, tags, importance = 7, options) {
  const stamp = `${MEM}B:${source}:RESULT:schedule:20260606${MEM}`;
  return abaPost(hamSchema(uid), '/rest/v1/abacia', {
    acl_stamp: stamp, ham_uid: uid.toUpperCase(),
    agent_global: 'SCHED', context_suffix: 'booking',
    channel: 'web', stamp_type: 'RESULT', stamped_by: 'SCHED',
    source,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    memory_type: 'schedule', importance, tags,
    categories: ['schedule', 'booking'],
    metadata: { written_at: new Date().toISOString() },
  }, options);
}

// ─── route handlers ───────────────────────────────────────────────────────────

async function handleAvailability(req, res, uid) {
  console.log(`[SCHED] Availability: uid=${uid}`);
  try {
    // 1. Settings — from ham.settings bead
    const settings = await getHamSettings(uid);

    // 2. Calendar grant — hard fail if not found (no HAM bleed)
    const grant = await getCalendarGrant(uid);
    if (!grant) {
      console.error(`[SCHED] No calendar grant bead for uid=${uid}`);
      return reply(res, 503, {
        error: 'Calendar not configured for this HAM',
        uid,
        hint: 'nylas.grant.calendar bead missing from ABACIA',
      });
    }

    // 3. Slots — read CAL bead first (global), fall back to RADAR events
    let slots = await getCalAvailability(uid);
    if (!slots) {
      console.log(`[SCHED] CAL bead absent — computing from RADAR events`);
      const events = await getRadarEvents(uid);
      console.log(`[SCHED] RADAR: ${events.length} events for uid=${uid}`);
      slots = computeFreeSlots(events, -4); // timezone from ham.settings in future
    }

    console.log(`[SCHED] ${slots.length} free slots for uid=${uid}`);
    const tokens = await getDesignTokens(uid);
    reply(res, 200, { uid, slots, count: slots.length, daysAhead: DAYS_AHEAD, settings, tokens });
  } catch (e) {
    console.error('[SCHED] Availability error:', e.message);
    reply(res, 500, { error: 'Failed to compute availability', detail: e.message });
  }
}

async function handleBook(req, res, uid, options) {
  options = options || (req && req.signal ? { signal:req.signal } : null);
  console.log(`[SCHED] Book: uid=${uid}`);
  try {
    const body = await parseBody(req);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    const { bookerName, bookerEmail, slotStart, slotEnd } = body;
    if (!bookerName || !bookerEmail || !slotStart || !slotEnd) {
      return reply(res, 400, { error: 'Required: bookerName, bookerEmail, slotStart, slotEnd' });
    }

    // Grant — hard fail if not found
    const grant = await getCalendarGrant(uid, options);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    if (!grant) {
      return reply(res, 503, { error: 'Calendar not configured for this HAM', uid });
    }

    const hamEmail  = await getHamEmail(uid);
    const expected  = await isExpectedBooker(uid, bookerEmail, bookerName);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    const startDT   = new Date(slotStart * 1000).toLocaleString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'long',
      day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    if (expected) {
      // A — auto-confirm: create Nylas event, write bead, notify HAM
      console.log(`[SCHED] Expected booker ${bookerEmail} — auto-confirming`);
      const eventPayload = {
        title: `1:1 - ${bookerName}`,
        when: { start_time: slotStart, end_time: slotEnd },
        participants: [{ email: bookerEmail, name: bookerName }],
        description: 'Booked via msria.org/schedule. 30-min 1:1.',
      };
      const externalArtifact = JSON.stringify(eventPayload);
      const externalRequestId = stableTransactionalId('schedule.external.book',
        uid + '\n' + String(bookerEmail).toLowerCase() + '\n' + slotStart + '\n' + slotEnd);
      const edgeKill = await requireClearKillSwitch(uid);
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      if (!edgeKill.ok) return reply(res, 503, { error:edgeKill.reason });
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      const externalClaim = await require('../outbound.effect.js').claimProviderAttempt({
        hamUid:uid, channel:'schedule_external_booking',
        deliveryTarget:{ kind:'email', value:[{ email:String(bookerEmail).trim().toLowerCase() }] },
        artifact:externalArtifact,
        requestId:externalRequestId,
        cycleId:stableTransactionalId('schedule.transactional', externalRequestId)
      });
      if (!externalClaim.ok) return reply(res,
        externalClaim.reason === 'provider_effect_already_claimed' ? 409 : 503,
        { error:externalClaim.reason });
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      const eventRes = await nylasReq(
        `/v3/grants/${grant.grantId}/events?calendar_id=${encodeURIComponent(grant.calendarId)}`,
        'POST', eventPayload, { 'Idempotency-Key':externalClaim.idempotencyKey }, options
      );
      const eventId = eventRes && eventRes.status >= 200 && eventRes.status < 300 &&
        eventRes.body && eventRes.body.data && eventRes.body.data.id;
      if (typeof eventId !== 'string' || !eventId) {
        return reply(res, 502, { error:eventRes && eventRes.status >= 500
          ? 'provider_uncertain' : eventRes && eventRes.status >= 400
            ? 'provider_rejected' : 'provider_unverified', providerStatus:eventRes && eventRes.status });
      }

      const confirmedSource = `schedule.confirmed.${bookerEmail.replace(/[@.]/g, '_')}.${slotStart}`;
      const confirmedContent = { bookerName, bookerEmail, slotStart, slotEnd,
        eventId, status: 'confirmed' };
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled', providerAccepted:true,
          eventId:eventId });
      }
      const bookingStamp = await writeBead(uid, confirmedSource, confirmedContent,
        ['schedule', 'confirmed_booking', 'expected'], 8, options);
      if (!verifiedScheduleStamp(bookingStamp, confirmedSource, confirmedContent)) {
        return reply(res, 502, { error:'booking_stamp_unverified', eventId:eventId,
          providerAccepted:true });
      }

      const notifGrant1 = grant.notificationGrant || process.env.NYLAS_CLAUDETTE_GRANT;
      var notification1 = null;
      if (hamEmail && notifGrant1) {
        notification1 = await imanNotify(uid, notifGrant1, hamEmail,
          `1:1 Booked - ${bookerName}`,
          `<p>Hey!</p><p><strong>${bookerName}</strong> booked a 1:1 for <strong>${startDT} EST</strong>. Auto-confirmed, calendar event created.</p><p>Thanks,<br>A&#8217;NU</p>`,
          'confirmed.' + bookerEmail + '.' + slotStart, options);
      }
      reply(res, 200, { status: 'confirmed', eventId:eventId,
        notification:notification1 || { ok:false, reason:'notification_not_configured' },
        message: `Your 1:1 is confirmed for ${startDT} EST.` });

    } else {
      // B — cold: hold pending, notify HAM
      console.log(`[SCHED] Cold booker ${bookerEmail} — holding for HAM`);
      const pendingId = `schedule.pending.${bookerEmail.replace(/[@.]/g, '_')}.${slotStart}`;
      const pendingContent = { bookerName, bookerEmail, slotStart, slotEnd,
        status: 'pending' };
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      const pendingStamp = await writeBead(uid, pendingId, pendingContent,
        ['schedule', 'pending_booking', 'cold'], 7, options);
      if (!verifiedScheduleStamp(pendingStamp, pendingId, pendingContent)) {
        return reply(res, 502, { error:'pending_booking_stamp_unverified' });
      }

      const notifGrant2 = grant.notificationGrant || process.env.NYLAS_CLAUDETTE_GRANT;
      var notification2 = null;
      if (hamEmail && notifGrant2) {
        notification2 = await imanNotify(uid, notifGrant2, hamEmail,
          `1:1 Request - ${bookerName} (needs your OK)`,
          `<p>Hey!</p><p><strong>${bookerName}</strong> (${bookerEmail}) wants a 1:1 for <strong>${startDT} EST</strong>. Not on your expected list. Reply approve or decline.</p><p>Pending ID: ${pendingId}</p><p>Thanks,<br>A&#8217;NU</p>`,
          pendingId, options);
      }
      reply(res, 200, { status: 'pending',
        notification:notification2 || { ok:false, reason:'notification_not_configured' },
        message: 'Your request has been recorded. You will hear back shortly.' });
    }
  } catch (e) {
    console.error('[SCHED] Book error:', e.message);
    reply(res, 500, { error: 'Booking failed', detail: e.message });
  }
}

// ─── export ───────────────────────────────────────────────────────────────────

async function handleScheduleRoute(req, res, pathname, method, options) {
  const m = pathname.match(/^\/api\/schedule\/([A-Z0-9]+)\/(availability|book|bookings|confirm|manager-auth)$/i);
  if (!m) return false;
  const uid    = m[1].toUpperCase();
  const action = m[2].toLowerCase();
  if (action === 'availability'  && method === 'GET')  { await handleAvailability(req, res, uid); return true; }
  if (action === 'book'          && method === 'POST')  { await handleBook(req, res, uid, options); return true; }
  if (action === 'bookings'      && method === 'GET')   { await handleBookings(req, res, uid); return true; }
  if (action === 'confirm'       && method === 'POST')  { await handleConfirm(req, res, uid, options); return true; }
  if (action === 'manager-auth'  && method === 'POST')  { await handleManagerAuth(req, res, uid); return true; }
  return false;
}

// ⬡B:core.schedule.logic:WIRE:read_helpers_exported_for_calendar_tool:20260713⬡
// Wonder rehaul G3 (read side): the cycle needs to scan the HAM's calendar and find open
// slots ("what's on Tuesday", "find me a haircut slot"). These read functions already
// existed but were module-internal. Exporting them lets the calendar_read cycle tool
// reuse the real, DST-safe logic instead of any parallel implementation.
// ⬡B:core.schedule.logic:WIRE:book_event_callable_for_calendar_tool:20260713⬡
// Wonder rehaul G3b (write side): handleBook above is built for EXTERNAL bookers (a 1:1
// request with a participant). The HAM booking their OWN event (a haircut, a block) needs
// a simpler callable: a title and a time on their own calendar, no external participant.
// This reuses the exact proven Nylas create-event path (getCalendarGrant + nylasReq) so
// there is no parallel booking implementation. The provider edge accepts only one exact
// four-field artifact committed by the canonical PAI council; no inferred duration or
// post-council truncation can change the event the HAM approved.
async function bookEvent(uid, opts) {
  opts = opts || {};
  try {
    if (await cancellationRequested(opts)) return cancelled();
    if (!uid) return { ok: false, reason: 'no_uid' };
    uid = String(uid).trim().toUpperCase();
    const authorization = opts.bookingAuthorization;
    const councilResult = authorization && authorization.councilResult;
    const expected = authorization && authorization.expected;
    const artifactText = authorization && authorization.artifact;
    if (!councilResult || !expected || typeof artifactText !== 'string' ||
        String(expected.hamUid || '').trim().toUpperCase() !== uid ||
        expected.answer !== artifactText) {
      return { ok:false, reason:'calendar_booking_authorization_required' };
    }
    const council = require('../pai.outbound.council.js');
    const target = council.canonicalizeDeliveryTarget(expected.deliveryTarget);
    if (!target || target.kind !== 'ham' || target.value !== uid) {
      return { ok:false, reason:'calendar_booking_target_unverified' };
    }
    const committed = council.requireVerifiedCouncilResult(councilResult, expected);
    const proof = committed && committed.ok ? council.compactCouncilProof(councilResult) : null;
    if (!committed || committed.ok !== true || committed.answer !== artifactText || !proof ||
        proof.committed !== true || proof.readback_verified !== true ||
        proof.row_count !== 9 || proof.representation_count !== 9 ||
        proof.request_id !== expected.requestId || proof.cycle_id !== expected.cycleId ||
        proof.answer_digest !== council.digestText(artifactText) ||
        proof.answer_bytes !== Buffer.byteLength(artifactText, 'utf8')) {
      return { ok:false, reason:'calendar_booking_council_unverified' };
    }
    let artifact;
    try { artifact = JSON.parse(artifactText); }
    catch (eArtifact) { return { ok:false, reason:'calendar_artifact_invalid' }; }
    if (!artifact || Array.isArray(artifact) ||
        Object.keys(artifact).sort().join(',') !== 'description,end,start,title' ||
        typeof artifact.title !== 'string' || !artifact.title.trim() ||
        artifact.title.length > 200 || /[\r\n\0]/.test(artifact.title) ||
        typeof artifact.description !== 'string' || artifact.description.length > 500 ||
        artifact.description.indexOf('\0') !== -1 || artifact.start == null ||
        artifact.end == null || artifact.title !== opts.title ||
        artifact.description !== (opts.description == null ? '' : opts.description) ||
        JSON.stringify(artifact.start) !== JSON.stringify(opts.start) ||
        JSON.stringify(artifact.end) !== JSON.stringify(opts.end)) {
      return { ok:false, reason:'calendar_artifact_invalid' };
    }
    function toEpoch(v) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
      var t = new Date(v).getTime();
      return isNaN(t) ? null : Math.floor(t / 1000);
    }
    const title = artifact.title;
    const startEpoch = toEpoch(artifact.start);
    const endEpoch = toEpoch(artifact.end);
    if (!startEpoch || !endEpoch || endEpoch <= startEpoch) return { ok: false, reason: 'bad_times' };
    const grant = await getCalendarGrant(uid, opts);
    if (await cancellationRequested(opts)) return cancelled();
    if (!grant) return { ok: false, reason: 'no_calendar', uid: uid };
    const edgeKill = await requireClearKillSwitch(uid);
    if (await cancellationRequested(opts)) return cancelled();
    if (!edgeKill.ok) return edgeKill;
    const eventPayload = { title: title,
      when: { start_time: startEpoch, end_time: endEpoch },
      description: artifact.description };
    const providerArtifact = JSON.stringify({ approved:artifactText, event:eventPayload });
    if (await cancellationRequested(opts)) return cancelled();
    const effectClaim = await require('../outbound.effect.js').claimProviderAttempt({
      hamUid:uid, channel:'calendar_booking',
      deliveryTarget:{ kind:'ham', value:uid }, artifact:providerArtifact,
      requestId:expected.requestId, cycleId:expected.cycleId
    });
    if (!effectClaim.ok) return { ok:false, reason:effectClaim.reason,
      effectKey:effectClaim.effectKey || null };
    if (await cancellationRequested(opts)) return cancelled({
      effectKey:effectClaim.effectKey || null });
    let eventRes;
    try { eventRes = await nylasReq(
      `/v3/grants/${grant.grantId}/events?calendar_id=${encodeURIComponent(grant.calendarId)}`,
      'POST',
      eventPayload,
      { 'Idempotency-Key':effectClaim.idempotencyKey }, opts
    ); } catch (eProvider) {
      if (abortSignal(opts) && abortSignal(opts).aborted) {
        return { ok:false, reason:'provider_uncertain', cancelled:true,
          effectKey:effectClaim.effectKey || null };
      }
      throw eProvider;
    }
    const eventId = eventRes && eventRes.status >= 200 && eventRes.status < 300 &&
      eventRes.body && eventRes.body.data && eventRes.body.data.id;
    if (typeof eventId !== 'string' || !eventId) return { ok:false,
      reason:eventRes && eventRes.status >= 500 ? 'provider_uncertain'
        : eventRes && eventRes.status >= 400 ? 'provider_rejected' : 'provider_unverified',
      status:eventRes && eventRes.status || null };
    const stampSource = `schedule.selfbooked.${startEpoch}.` +
      crypto.createHash('sha256').update(providerArtifact, 'utf8').digest('hex').slice(0, 16);
    const stampContent = { title: title, description:artifact.description,
      startEpoch: startEpoch, endEpoch: endEpoch, eventId: eventId,
      status: 'confirmed', bookedBy: 'A\u2019NU', requestId:expected.requestId,
      cycleId:expected.cycleId };
    if (await cancellationRequested(opts)) return cancelled({
      providerAccepted:true, eventId:eventId, effectKey:effectClaim.effectKey || null });
    const bookingStamp = await writeBead(uid, stampSource, stampContent,
      ['schedule', 'self_booking'], 6, opts);
    if (!verifiedScheduleStamp(bookingStamp, stampSource, stampContent)) {
      return { ok:false, reason:'booking_stamp_unverified', providerAccepted:true,
        eventId:eventId, requestId:expected.requestId, cycleId:expected.cycleId,
        councilProof:proof };
    }
    return { ok: true, eventId: eventId, title: title,
      start: new Date(startEpoch * 1000).toISOString(),
      end: new Date(endEpoch * 1000).toISOString(), requestId:expected.requestId,
      cycleId:expected.cycleId, councilProof:proof };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

// ⬡B:core.schedule.logic:BUILD:real_live_calendar_read:20260713⬡
// Founder: "did she actually check my calendar?" RADAR beads were empty, so free-slot picking
// guessed a default working-hours block. This reads his REAL calendar live over Nylas (the same
// grant and nylasReq path bookEvent uses), so busy times are real and a free slot is verified,
// not assumed. A successful read that returns zero events still counts as verified: it means the
// calendar is genuinely clear.
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
    const events = data.map(function (e) {
      const w = e.when || {};
      const s = w.start_time || w.time || null;
      return { start: s, end: w.end_time || (s ? s + 1800 : null), title: e.title || '' };
    }).filter(function (e) { return e.start && e.end; });
    return { ok: true, events: events };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message, events: [] }; }
}

module.exports = { handleScheduleRoute, getRadarEvents, computeFreeSlots, getHamPrefs, bookEvent, listCalendarEvents };


// Validate a manager token against ham.prefs.managerToken in ABACIA.
// The token lives in the brain, never in code or env vars.
async function validateManagerToken(uid, token) {
  if (!token) return false;
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.ham.prefs&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      const prefs = JSON.parse(r.body[0].content);
      return prefs.managerToken && prefs.managerToken === token;
    }
  } catch (e) {
    console.warn('[SCHED] manager token validation error:', e.message);
  }
  return false;
}

// ─── /bookings — returns pending and confirmed bookings for HAM ───────────────
async function handleBookings(req, res, uid) {
  console.log(`[SCHED] Bookings list: uid=${uid}`);
  const token = req.headers['x-mgr-token'];
  const authed = await validateManagerToken(uid, token);
  if (!authed) return reply(res, 401, { error: 'Manager token required' });
  try {
    const r = await abaGet(hamSchema(uid),
      `/rest/v1/abacia?tags=cs.%7Bschedule%7D&tags=cs.%7Bbooking%7D&source=like.schedule.*&select=source,content,tags&limit=50&order=created_at.desc`);
    if (r.status !== 200) return reply(res, 500, { error: 'Could not read bookings' });
    const bookings = (r.body || []).map(row => {
      try {
        const c = JSON.parse(row.content);
        return { source: row.source, ...c, tags: row.tags };
      } catch { return null; }
    }).filter(Boolean).filter(b => b.status === 'pending' || b.status === 'confirmed');
    reply(res, 200, { bookings });
  } catch (e) {
    console.error('[SCHED] Bookings error:', e.message);
    reply(res, 500, { error: 'Failed', detail: e.message });
  }
}

// ─── /confirm — HAM confirms or declines a pending booking ────────────────────
async function handleConfirm(req, res, uid, options) {
  options = options || (req && req.signal ? { signal:req.signal } : null);
  console.log(`[SCHED] Confirm: uid=${uid}`);
  try {
    const body   = await parseBody(req);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    const { source, action, token } = body;
    const authed = await validateManagerToken(uid, token);
    if (!authed) return reply(res, 401, { error: 'Manager token required' }); // action: 'confirm' | 'decline'
    if (!source || !['confirm','decline'].includes(action)) {
      return reply(res, 400, { error: 'Required: source, action (confirm|decline)' });
    }
    if (!String(source).startsWith('schedule.pending.')) {
      return reply(res, 422, { error:'Booking source is not pending' });
    }

    // Read the pending bead
    const r = await abaGet(hamSchema(uid),
      `/rest/v1/abacia?source=eq.${encodeURIComponent(source)}&select=content&limit=1`, options);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    if (r.status !== 200 || !r.body || !r.body.length) {
      return reply(res, 404, { error: 'Booking not found' });
    }
    const booking = JSON.parse(r.body[0].content);
    const grant   = await getCalendarGrant(uid, options);
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled' });
    }
    let eventId = null;

    if (action === 'confirm') {
      if (!grant) return reply(res, 503, { error:'Calendar not configured for this HAM', uid });
      if (!booking || typeof booking.bookerEmail !== 'string' || !booking.bookerEmail ||
          typeof booking.bookerName !== 'string' || !booking.bookerName ||
          !Number.isFinite(Number(booking.slotStart)) || !Number.isFinite(Number(booking.slotEnd)) ||
          Number(booking.slotEnd) <= Number(booking.slotStart)) {
        return reply(res, 422, { error:'Pending booking record is invalid' });
      }
      // ⬡B:core.schedule.logic:EXCEPTION:manager_confirmed_calendar_transaction:20260715⬡
      // The authenticated manager is the decision-maker here. This fixed
      // transactional create therefore does not ask a model to rewrite names,
      // times, or participant addresses; it binds the exact provider artifact
      // and destination to one permanent claim and requires a positive event ID.
      const eventPayload = {
        title: `1:1 — ${booking.bookerName}`,
        when: { start_time: booking.slotStart, end_time: booking.slotEnd },
        participants: [{ email: booking.bookerEmail, name: booking.bookerName }],
        description: 'Confirmed via msria.org/schedule manage panel.',
      };
      const artifact = JSON.stringify(eventPayload);
      const requestId = stableTransactionalId('schedule.manager.confirm',
        uid + '\n' + source + '\n' + artifact);
      const edgeKill = await requireClearKillSwitch(uid);
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      if (!edgeKill.ok) return reply(res, 503, { error:edgeKill.reason });
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      const effectClaim = await require('../outbound.effect.js').claimProviderAttempt({
        hamUid:uid, channel:'schedule_manager_confirmation',
        deliveryTarget:{ kind:'email', value:[{ email:String(booking.bookerEmail).trim().toLowerCase() }] },
        artifact:artifact, requestId:requestId,
        cycleId:stableTransactionalId('schedule.transactional', requestId)
      });
      if (!effectClaim.ok) return reply(res,
        effectClaim.reason === 'provider_effect_already_claimed' ? 409 : 503,
        { error:effectClaim.reason });
      if (await cancellationRequested(options)) {
        return reply(res, 409, { error:'voice_turn_cancelled' });
      }
      const eventRes = await nylasReq(
        `/v3/grants/${grant.grantId}/events?calendar_id=${encodeURIComponent(grant.calendarId)}`,
        'POST', eventPayload, { 'Idempotency-Key':effectClaim.idempotencyKey }, options
      );
      eventId = eventRes && eventRes.status >= 200 && eventRes.status < 300 &&
        eventRes.body && eventRes.body.data && eventRes.body.data.id;
      if (typeof eventId !== 'string' || !eventId) return reply(res, 502, {
        error:eventRes && eventRes.status >= 500 ? 'provider_uncertain'
          : eventRes && eventRes.status >= 400 ? 'provider_rejected' : 'provider_unverified',
        providerStatus:eventRes && eventRes.status || null
      });
    }

    // Supersede the bead with updated status
    const newSource = source.replace('pending', action === 'confirm' ? 'confirmed' : 'declined');
    if (newSource === source) return reply(res, 422, { error:'Booking source is not pending' });
    const statusContent = { ...booking,
      status: action === 'confirm' ? 'confirmed' : 'declined' };
    if (eventId) statusContent.eventId = eventId;
    if (await cancellationRequested(options)) {
      return reply(res, 409, { error:'voice_turn_cancelled',
        providerAccepted:!!eventId, eventId:eventId });
    }
    const statusStamp = await writeBead(uid, newSource, statusContent,
      ['schedule', action === 'confirm' ? 'confirmed_booking' : 'declined_booking'], 8,
      options);
    if (!verifiedScheduleStamp(statusStamp, newSource, statusContent)) {
      return reply(res, 502, { error:'booking_status_stamp_unverified',
        providerAccepted:!!eventId, eventId:eventId });
    }

    reply(res, 200, { ok: true, action, source: newSource, eventId:eventId });
  } catch (e) {
    console.error('[SCHED] Confirm error:', e.message);
    reply(res, 500, { error: 'Failed', detail: e.message });
  }
}


// ─── /manager-auth — validates manager token against ham.prefs bead ─────────
async function handleManagerAuth(req, res, uid) {
  try {
    const body  = await parseBody(req);
    const valid = await validateManagerToken(uid, body.token);
    if (valid) {
      reply(res, 200, { ok: true });
    } else {
      reply(res, 401, { ok: false, error: 'Invalid manager token' });
    }
  } catch (e) {
    reply(res, 500, { error: e.message });
  }
}

// ─── read global.aesthetics.design_tokens bead ───────────────────────────────
async function getDesignTokens(uid) {
  try {
    const r = await abaGet(hamSchema(uid),
      '/rest/v1/abacia?source=eq.global.aesthetics.design_tokens&select=content&limit=1');
    if (r.status === 200 && r.body && r.body.length > 0) {
      return JSON.parse(r.body[0].content);
    }
  } catch (e) {
    console.warn('[SCHED] design tokens read failed:', e.message);
  }
  return null;
}
