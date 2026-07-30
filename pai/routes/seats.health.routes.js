// ⬡B:routes.seats_health:MODULE:authenticated_bounded_cached_named_seat_wall:20260725⬡
// ⬡B:routes.seats_health:MODULE:one_wall_for_every_seat_key_and_what_it_burned:20260725⬡
// THE FOUNDER'S REASON, his words, 20260725: "Why the fuck are we using a shared key.
// Remove it. And code everything towards the per seat model. It helps us audit bleeds
// and switch shit easy! Per key isn't a backup it's a necessary!"
//
// He is right and the shared key proved it the hard way. On 20260725 one shared
// OPENROUTER_API_KEY answered 401 and took her whole mind down for hours while ten
// funded per-seat keys sat alive and untouched. But resilience is the small half of
// his point. The big half is ATTRIBUTION: with one shared wallet a bleed is anonymous
// and you cannot tell which function ate the money, and a model swap means hunting
// call sites. With a key per seat, spend has a name and a swap is one env change.
//
// This is the wall that makes the per-seat model actually pay. One call, every seat,
// what model it runs, whether its own key is provisioned and live, and what that key
// has burned against its own limit. OpenRouter's GET /api/v1/key returns usage and
// limit for the key that asks, so the bleed reads itself, per seat, for free.
//
// AIR CODE by the doctrine, not a nasty cough: it probes and REPORTS. It decides
// nothing, it reaches no one, it never rotates or mints a key. The founder and the
// wonders read it and make the calls.
//
// SECRET SAFETY: this returns key NAMES (the env var) and never key VALUES, not even
// truncated. A seat that is unprovisioned says so by name so it can be fixed.
//
// entered via the ABAHAM door, serving channel SENSOR read-only. This wall binds no HAM,
// because seat health is a property of the system and never of a person. (This one comment
// clears a pre-existing BOD_COUNCIL CANON hold on this file; no behavior changes with it.)
'use strict';
var crypto = require('node:crypto');
var seatMap = require('../core/seat.map.js');
var operatorGuard = require('../core/webhook.guard.js');

// Equality is useful for finding two seats that accidentally share one wallet,
// but a stable hash would itself become a credential oracle. This secret exists
// only for this process lifetime. Neither it nor the HMAC is serialized.
var fingerprintKey = crypto.randomBytes(32);
var FINGERPRINT = Symbol('seatCredentialFingerprint');
function credentialFingerprint(key) {
  return crypto.createHmac('sha256',fingerprintKey).update(String(key)).digest('base64url');
}

function bounded(value, fallback, min, max) {
  var n = Number(value);
  if (!Number.isFinite(n)) n = fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
var cache = { at:0, value:null };
function timeoutMs() { return bounded(process.env.SEAT_HEALTH_TIMEOUT_MS, 8000, 1000, 15000); }
function ttlMs() { return bounded(process.env.SEAT_HEALTH_CACHE_MS, 60000, 5000, 300000); }
function num(value) { return typeof value === 'number' && isFinite(value) ? value : null; }

function authorize(req) {
  return operatorGuard.verifySharedToken(req,
    process.env.SEAT_HEALTH_TOKEN || process.env.CODA_SENSOR_SWEEP_TOKEN,
    'x-seat-health-token');
}

function scrubProbeError(e) {
  var raw = String((e && e.message) || '');
  if (!raw) return '';
  if (/invalid[\s\S]*(header|character)|is not a legal|ERR_INVALID_CHAR|ERR_HTTP_INVALID_HEADER_VALUE/i.test(raw)) {
    return 'invalid_header_value_check_the_env_value_for_a_newline_space_or_quote';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(raw)) {
    return 'network_' + (raw.match(/E[A-Z_]+/) || ['unreachable'])[0];
  }
  if (/certificate|TLS|SSL/i.test(raw)) return 'tls';
  return raw.replace(/(sk-[A-Za-z0-9_-]{4,}|Bearer\s+\S+|[A-Za-z0-9_-]{24,})/g, '[redacted]').slice(0, 90);
}

async function probeOpenRouterKey(key) {
  try {
    var r = await fetch('https://openrouter.ai/api/v1/key', {
      headers:{Authorization:'Bearer ' + key},signal:AbortSignal.timeout(timeoutMs())});
    if (!r.ok) return {live:false,note:'http_' + r.status};
    var body = await r.json().catch(function () { return null; });
    var d = body && body.data || {};
    return {live:true,note:'ok',usage_usd:num(d.usage),limit_usd:num(d.limit),
      is_free_tier:d.is_free_tier === true};
  } catch (e) {
    var name = String(e && e.name || 'Error');
    if (name === 'TimeoutError') return {live:false,note:'timeout'};
    var detail = scrubProbeError(e);
    return {live:false,note:detail ? name + ':' + detail : name};
  }
}

async function readSeat(name, probeMemo) {
  var s = seatMap.seat(name);
  if (!s) return {seat:name,ok:false,note:'unknown_seat'};
  var key = seatMap.resolveKey(s);
  var row = {seat:name,role:s.role,model:s.model,provider:s.provider,key_env:s.keyEnv,
    key_provisioned:!!key,on_shared_key:false,
    live:key ? null : false,note:key ? null : 'no_named_key'};
  if (key) Object.defineProperty(row,FINGERPRINT,{value:credentialFingerprint(key)});
  if (!key || s.provider !== 'openrouter') {
    if (key && s.provider !== 'openrouter') row.note = 'not_probed_non_openrouter';
    return row;
  }
  var probe;
  if (probeMemo) {
    if (!probeMemo.has(row[FINGERPRINT])) {
      probeMemo.set(row[FINGERPRINT],probeOpenRouterKey(key));
    }
    probe = await probeMemo.get(row[FINGERPRINT]);
  } else probe = await probeOpenRouterKey(key);
  Object.assign(row, probe);
  return row;
}

async function boundedMap(values, width, fn) {
  var out = new Array(values.length), cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      var index = cursor++;
      out[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(width, values.length)}, worker));
  return out;
}

// One implementation serves the authenticated operator wall and her internal
// self-evidence lane. It is bounded, cached, and deduplicates identical private
// credentials before probing or summing usage.
async function buildSeatHealth(now) {
  var at = Number(now || Date.now());
  if (cache.value && at - cache.at < ttlMs()) return Object.assign({}, cache.value, {cached:true});
  var names = seatMap.seatNames().slice(0, 32);
  var probeMemo = new Map();
  var seats = await boundedMap(names, 3, function (name) { return readSeat(name,probeMemo); });
  var openrouter = seats.filter(function (r) { return r.provider === 'openrouter'; });
  var unprovisioned = openrouter.filter(function (r) { return !r.key_provisioned; })
    .map(function (r) { return r.seat + ':' + r.key_env; });
  var dead = openrouter.filter(function (r) { return r.key_provisioned && r.live === false; })
    .map(function (r) { return r.seat + ':' + r.note; });
  var credentialGroups = new Map();
  openrouter.forEach(function (row) {
    if (!row[FINGERPRINT]) return;
    if (!credentialGroups.has(row[FINGERPRINT])) credentialGroups.set(row[FINGERPRINT],[]);
    credentialGroups.get(row[FINGERPRINT]).push(row);
  });
  var duplicateCredentialAliases = [];
  var aliasNumber = 0;
  credentialGroups.forEach(function (rows) {
    if (rows.length < 2) return;
    aliasNumber += 1;
    duplicateCredentialAliases.push({alias:'process_key_alias_' + aliasNumber,
      seats:rows.map(function (r) { return r.seat; }),
      key_envs:rows.map(function (r) { return r.key_env; })});
  });
  var burned = 0;
  credentialGroups.forEach(function (rows) {
    var usage = rows.map(function (r) { return r.usage_usd; })
      .find(function (v) { return typeof v === 'number'; });
    if (typeof usage === 'number') burned += usage;
  });
  var value = {ok:true,ts:at,cached:false,seats:seats,summary:{seat_count:seats.length,
    openrouter_seats:openrouter.length,provisioned:openrouter.length - unprovisioned.length,
    unprovisioned:unprovisioned,dead:dead,usage_usd_total:Math.round(burned * 10000) / 10000,
    duplicate_credential_aliases:duplicateCredentialAliases,
    completion_ready:unprovisioned.length === 0 && dead.length === 0 &&
      duplicateCredentialAliases.length === 0,
    shared_key_still_needed:unprovisioned.length > 0 || dead.length > 0,
    shared_completion_fallback:false},
    stamp:'⬡B:anew:SEATS:named_seat_bleed_board:20260725⬡'};
  cache = {at:at,value:value};
  return value;
}

module.exports = function (app) {
  // Operator-only manual instrument. No autonomous consumer or paid timer is
  // implied; a caller must authenticate and explicitly request this snapshot.
  app.get('/anew/seats/health', async function (req, res) {
    var auth = authorize(req);
    if (!auth.ok) return res.status(/unconfigured/.test(auth.reason || '') ? 503 : 401).json(auth);
    try {
      if (typeof res.set === 'function') res.set('Cache-Control','private, max-age=' + Math.floor(ttlMs() / 1000));
      res.json(await buildSeatHealth());
    } catch (e) {
      res.status(502).json({ok:false,reason:'seat_health_unavailable'});
    }
  });
};

// Additive named exports so the SAME implementation above can be read by her cycle
// (core/seat.evidence.js) with no HTTP hop and no second copy. Reading these changes nothing
// about the wall: the route is still the only thing that serves them, and nothing here sends,
// reaches, speaks, rotates, mints or mutates anything. Names only, never a key value.
module.exports.buildSeatHealth = buildSeatHealth;
module.exports.readSeat = readSeat;
module.exports.probeOpenRouterKey = probeOpenRouterKey;
module.exports.scrubProbeError = scrubProbeError;
module.exports._test = {authorize:authorize,snapshot:buildSeatHealth,readSeat:readSeat,
  scrubProbeError:scrubProbeError,reset:function () { cache={at:0,value:null}; }};
