// ⬡B:core.ham_timezone:BUILD:per_ham_timezone_resolver_one_source:20260725⬡
// entered via the ABAHAM door, serving channel MESSAGES: a cold helper the per-turn
// cycle assembly and the calendar tools call, so the HAM local time and dates the cycle
// speaks over the MESSAGES channel to that HAM are grounded in that HAM's own zone.
// THE PER-HAM TIMEZONE RESOLVER. Founder-caught, demo-critical: A'NU told him
// "you're up early, 3:17am" reading the SERVER clock (UTC), when he is Eastern and
// another HAM (Eric) may be a third zone entirely. His law: "HAMS have time zones and
// it's never UTC." Every HAM lives in their OWN zone; the old code read a single global
// process.env.HAM_TIMEZONE for everyone, which is a global masquerading as a per-person
// truth. This is the one shared home that resolves THAT ham's real zone.
//
// Identity is env-only and per-world (founder law 20260722): a real person's zone is
// never a literal in shippable code. So the resolution order is:
//   1. FOUNDER: process.env.FOUNDER_TZ (env, never a literal) when this ham IS the
//      configured founder and the env is set.
//   2. ANY HAM: the timezone stored on that ham's OWN identity record (the ham.profile
//      bead, read through the exact same door as their name and title -- one source,
//      core/os/registry.js fetchIdentity). A HAM's zone is part of who they are, resolved
//      from their world, not guessed. No HAM sets this today; the field is ready for when
//      they do, and until then this step honestly returns nothing.
//   3. HONEST FALLBACK, last resort only, when the zone is genuinely unknown:
//      process.env.DEFAULT_TZ || 'America/New_York'. NEVER UTC (a HAM is a person, not a
//      server), and NEVER a per-person hardcode (that would leak one human into every
//      stranger's deploy). A documented, overridable default, clearly a fallback.
// Returns an IANA zone string, always. Validated: an unusable stored/env value falls
// through to the next step rather than crashing a formatter downstream.
'use strict';

var DEFAULT_FALLBACK = 'America/New_York';

// Small in-memory cache so a hot per-event calendar render or a per-turn cycle does not
// re-read the brain for the same ham. TTL keeps a HAM's later zone change from being
// pinned forever. Fail-open: a cache miss just costs one read.
var _cache = Object.create(null);
var TTL_MS = 10 * 60 * 1000;

function _documentedDefault() {
  return process.env.DEFAULT_TZ || DEFAULT_FALLBACK;
}

// Is this a real, usable IANA zone? Cold check: Intl throws on an unknown zone.
function isValidZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  if (tz.toUpperCase() === 'UTC') return false; // a HAM is never UTC; treat it as "not a real answer"
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch (e) { return false; }
}

function _isFounder(hamUid) {
  var f = String(process.env.FOUNDER_HAM_UID || '');
  return !!f && String(hamUid || '').toUpperCase() === f.toUpperCase();
}

// The founder-env + documented-default spine, shared by the async and sync paths so
// there is exactly ONE place the fallback logic lives.
function _envOrDefault(hamUid) {
  if (_isFounder(hamUid) && isValidZone(process.env.FOUNDER_TZ)) return process.env.FOUNDER_TZ;
  var def = _documentedDefault();
  return isValidZone(def) ? def : DEFAULT_FALLBACK;
}

// Read the timezone stored on this ham's OWN identity record. Same bead, same door as
// their name and title -- their zone is part of their identity, not a separate store.
async function _storedZone(hamUid) {
  try {
    var reg = require('./os/registry.js');
    if (!reg || typeof reg.fetchIdentity !== 'function') return null;
    var id = await reg.fetchIdentity(hamUid);
    var tz = id && id.timezone;
    return isValidZone(tz) ? tz : null;
  } catch (e) { return null; }
}

// PRIMARY resolver, async. Founder env -> that ham's stored zone -> documented default.
// Never UTC, never a per-person literal. Always returns a valid IANA string.
async function resolveHamTimezone(hamUid) {
  var hit = _cache[hamUid];
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.tz;

  var tz = null;
  // Founder env wins first: identity is env-only for the person who owns this world.
  if (_isFounder(hamUid) && isValidZone(process.env.FOUNDER_TZ)) {
    tz = process.env.FOUNDER_TZ;
  }
  // Otherwise (or if the founder never set the env) the ham's own record.
  if (!tz) tz = await _storedZone(hamUid);
  // Honest last resort.
  if (!tz) tz = _envOrDefault(hamUid);

  _cache[hamUid] = { tz: tz, at: Date.now() };
  return tz;
}

// SYNC convenience for the rare hot/synchronous caller (e.g. a quiet-hours clock check)
// that cannot await a brain read. Uses the founder env, any already-cached resolution,
// then the documented default. Shares the same spine, so it can never diverge from the
// async path's env/fallback rules; it only skips the brain read.
function resolveHamTimezoneCached(hamUid) {
  if (_isFounder(hamUid) && isValidZone(process.env.FOUNDER_TZ)) return process.env.FOUNDER_TZ;
  var hit = _cache[hamUid];
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.tz;
  return _envOrDefault(hamUid);
}

// ⬡B:core.ham_timezone:FIX:wall_time_resolves_in_their_zone_not_the_servers:20260725⬡
// THE INVERSE RESOLVER. Everything above answers "which zone is this person in". What
// follows answers the question that actually bit a real human: "9am tomorrow, for THEM,
// is what real instant?"
//
// THE 5AM BUG THIS EXISTS TO CURE. core/tool.loop.js create_reminder, asked for a
// reminder with no date, defaulted to "tomorrow 9am" by calling Date.setHours(9,0,0,0).
// setHours means nine in the morning IN THE SERVER'S ZONE. The server runs UTC, so an
// Eastern person asking to be reminded "tomorrow" had 09:00 UTC written into their bead,
// which is 5:00am where they actually sleep. It stayed invisible only because nothing
// ever read REMINDER beads for due ones; the moment core/reach/wake.clock.js is armed
// behind WAKE_CLOCK_ENABLED, that stored instant really does wake them at five.
// Same law as above, applied to the other direction: a HAM has a zone and it is never
// UTC, so a wall-clock time a person asked for has to be resolved THROUGH their zone
// before it is ever stored as an instant.

function _pad2(n) { return (n < 10 ? '0' : '') + n; }
function _pad4(n) { return String(n).padStart(4, '0'); }

// How far THIS zone sits from UTC at THIS instant, in ms. Read out of Intl rather than a
// hardcoded table, so daylight saving is whatever the zone database actually says on that
// date, in that zone, this year. Returns null rather than guessing.
function zoneOffsetMs(tz, atMs) {
  if (!isValidZone(tz)) return null;
  var at = Number(atMs);
  if (!Number.isFinite(at)) return null;
  try {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hour12: false }).formatToParts(new Date(at));
    var got = Object.create(null);
    parts.forEach(function (p) { got[p.type] = p.value; });
    if (!got.year || !got.month || !got.day || !got.hour || !got.minute || !got.second) return null;
    var hour = got.hour === '24' ? '00' : got.hour;
    var asIfUtc = Date.UTC(Number(got.year), Number(got.month) - 1, Number(got.day),
      Number(hour), Number(got.minute), Number(got.second));
    if (!Number.isFinite(asIfUtc)) return null;
    return asIfUtc - at;
  } catch (e) { return null; }
}

// Their calendar date right now, on their own wall. Numbers, so a caller can do honest
// calendar arithmetic on it without re-parsing a string.
function localDateInZone(tz, atMs) {
  if (!isValidZone(tz)) return null;
  var at = Number(atMs);
  if (!Number.isFinite(at)) return null;
  try {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric',
      month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
    var got = Object.create(null);
    parts.forEach(function (p) { got[p.type] = p.value; });
    if (!got.year || !got.month || !got.day) return null;
    var out = { year: Number(got.year), month: Number(got.month), day: Number(got.day) };
    return Number.isFinite(out.year) && Number.isFinite(out.month) &&
      Number.isFinite(out.day) ? out : null;
  } catch (e) { return null; }
}

// A wall-clock time THEY would read on their own wall, turned into the real UTC instant.
// Two passes on purpose: the offset depends on the very instant being solved for, so the
// first pass guesses with the offset at the naive instant and the second re-resolves at
// the corrected one. That second pass is what makes a time near a daylight-saving
// changeover land on the correct side of the shift instead of an hour out.
// A wall time that does not exist (the skipped hour on a spring-forward day) resolves to
// the instant the clock jumped to, which is the only real moment that reading can name.
function wallTimeToUtcMs(tz, wall) {
  if (!isValidZone(tz) || !wall || typeof wall !== 'object') return null;
  var y = Number(wall.year), mo = Number(wall.month), d = Number(wall.day);
  var h = Number(wall.hour == null ? 0 : wall.hour);
  var mi = Number(wall.minute == null ? 0 : wall.minute);
  if (![y, mo, d, h, mi].every(function (n) { return Number.isFinite(n); })) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  var naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  if (!Number.isFinite(naive)) return null;
  var off = zoneOffsetMs(tz, naive);
  if (off === null) return null;
  var utc = naive - off;
  var off2 = zoneOffsetMs(tz, utc);
  if (off2 === null) return null;
  if (off2 !== off) utc = naive - off2;
  return Number.isFinite(utc) ? utc : null;
}

// THE NEXT REAL DAY AT THIS HOUR, on THEIR wall clock. This is the honest version of what
// create_reminder's dateless fallback always meant: not "9am wherever the server happens
// to be racked", but "9am the next day where this person actually wakes up".
// The day step is pure calendar arithmetic on their own local date, never a +24h jump,
// because a daylight-saving day is 23 or 25 hours long and a +24h jump can skip a date
// outright near midnight. Steps forward until the instant is genuinely in the future.
function nextLocalDayAtHourMs(options) {
  options = options || {};
  var tz = isValidZone(options.timezone) ? options.timezone : _documentedDefault();
  if (!isValidZone(tz)) tz = DEFAULT_FALLBACK;
  var now = Number(options.now == null ? Date.now() : options.now);
  if (!Number.isFinite(now)) return { ok: false, reason: 'now_invalid' };
  var hour = Number(options.hour == null ? 9 : options.hour);
  var minute = Number(options.minute == null ? 0 : options.minute);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { ok: false, reason: 'hour_invalid' };
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return { ok: false, reason: 'minute_invalid' };
  var today = localDateInZone(tz, now);
  if (!today) return { ok: false, reason: 'zone_unreadable' };
  for (var add = 1; add <= 4; add++) {
    // Calendar step only. Date.UTC normalises month and year rollover for us; the midday
    // anchor is scaffolding for that arithmetic and never appears in the answer.
    var stepped = new Date(Date.UTC(today.year, today.month - 1, today.day + add, 12, 0, 0));
    var y = stepped.getUTCFullYear(), m = stepped.getUTCMonth() + 1, d = stepped.getUTCDate();
    var atMs = wallTimeToUtcMs(tz, { year: y, month: m, day: d, hour: hour, minute: minute });
    if (atMs === null || atMs <= now) continue;
    return { ok: true, atMs: atMs, iso: new Date(atMs).toISOString(), timezone: tz,
      localDate: _pad4(y) + '-' + _pad2(m) + '-' + _pad2(d),
      localTime: _pad2(hour) + ':' + _pad2(minute) };
  }
  return { ok: false, reason: 'no_future_local_day' };
}

// The same answer, for a HAM whose zone still has to be resolved. One await, one source:
// it resolves the zone through resolveHamTimezone above and never re-implements the
// fallback ladder. Always returns a shaped result; a caller must read ok before atMs.
async function resolveNextLocalDayAtHour(hamUid, hour, options) {
  options = options || {};
  var tz = null;
  try { tz = await resolveHamTimezone(hamUid); } catch (e) { tz = null; }
  return nextLocalDayAtHourMs({ timezone: tz, hour: hour,
    minute: options.minute, now: options.now });
}

module.exports = { resolveHamTimezone, resolveHamTimezoneCached, isValidZone,
  zoneOffsetMs, localDateInZone, wallTimeToUtcMs, nextLocalDayAtHourMs,
  resolveNextLocalDayAtHour };
