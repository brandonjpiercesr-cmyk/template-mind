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

module.exports = { resolveHamTimezone, resolveHamTimezoneCached, isValidZone };
