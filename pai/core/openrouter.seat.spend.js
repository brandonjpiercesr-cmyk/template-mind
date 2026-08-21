// ⬡B:core.openrouter_seat_spend:MODULE:provider_reported_daily_dollar_brake:20260725⬡
'use strict';

// OpenRouter reports authoritative usage_daily for the exact key asking. This
// boundary binds that key back to one named seat, serializes that seat's paid
// egress, and checks its dollar policy before the request leaves. It never
// guesses a price, prints a key, borrows a wallet, or decides content.
var crypto = require('node:crypto');
var seatMap = require('./seat.map.js');
var queues = new Map();

function clean(value) { return String(value == null ? '' : value).trim(); }

function sameSecret(a, b) {
  var left = Buffer.from(clean(a));
  var right = Buffer.from(clean(b));
  return left.length > 0 && left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function bearer(init) {
  var headers = init && init.headers;
  var value = '';
  if (headers && typeof headers.get === 'function') value = headers.get('authorization') || '';
  else if (Array.isArray(headers)) {
    var row = headers.find(function (pair) {
      return Array.isArray(pair) && String(pair[0]).toLowerCase() === 'authorization';
    });
    value = row && row[1] || '';
  } else if (headers && typeof headers === 'object') {
    var name = Object.keys(headers).find(function (key) {
      return key.toLowerCase() === 'authorization';
    });
    value = name ? headers[name] : '';
  }
  var match = clean(value).match(/^Bearer\s+(.+)$/i);
  return match ? clean(match[1]) : '';
}

function resolveKeyOwner(key, env, attributedSeat) {
  var runtime = env || process.env;
  var matches = [];
  seatMap.seatNames(runtime).forEach(function (name) {
    var seat = seatMap.seat(name, runtime);
    var own = seat && seatMap.sanitizeKey(runtime[seat.keyEnv]);
    if (own && sameSecret(key, own)) matches.push(seat);
  });
  if (matches.length > 1) {
    // A duplicate remains an egress refusal unless the already-running server cycle
    // names one of the exact matching seats. This is for a legacy credential
    // collision only. No request header, body, or caller argument reaches this value.
    var exact = clean(attributedSeat);
    var attributed = matches.find(function (seat) { return seat.seat === exact; });
    if (attributed) return {ok:true,seat:attributed,sharedAttribution:true};
    return {ok:false,reason:'openrouter_key_shared_across_seats',
      seats:matches.map(function (seat) { return seat.seat; })};
  }
  if (matches.length === 1) return {ok:true,seat:matches[0]};
  var shared = seatMap.sanitizeKey(runtime.OPENROUTER_API_KEY);
  if (shared && sameSecret(key, shared)) {
    return {ok:false,reason:'anonymous_shared_openrouter_key_forbidden'};
  }
  return {ok:false,reason:'openrouter_key_has_no_named_seat'};
}

function keyOwner(key, env) { return resolveKeyOwner(key, env, ''); }

function attributedSeat() {
  try {
    return clean(require('./spend.guard.js').currentAttribution().seat);
  } catch (error) {
    return '';
  }
}

function usageNumber(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// ⬡B:core.openrouter_seat_spend:GATE:a_dry_account_is_a_fact_not_a_judgment:20260726⬡
// The dry account skip is DEFAULT OFF behind one exact string gate. The balance READ is
// free and lives on the health cycle, because reading prevents spend. The SKIP changes
// live request behavior, and a wrong skip would silence her, which is worse than one
// refused request. Arming it is the founder's call, not a coder's.
function dryAccountBlockArmed(env) {
  return String((env || process.env).OPENROUTER_DRY_ACCOUNT_BLOCK || '') === 'true';
}

// How stale an already-read account balance may be before this door asks again. Bounded,
// so a malformed value can neither pin a stale refusal nor add a round trip to every
// paid request. Zero means always read fresh.
function balanceMaxAgeMs(env) {
  var raw = Number((env || process.env).OPENROUTER_ACCOUNT_BALANCE_MAX_AGE_MS);
  if (!Number.isFinite(raw) || raw < 0) return 60000;
  return Math.min(Math.floor(raw), 300000);
}

function usageSignal(callerSignal, env) {
  var raw = Number((env || process.env).OPENROUTER_SEAT_USAGE_TIMEOUT_MS || 1200);
  var timeoutMs = Number.isFinite(raw) ? Math.max(100,Math.min(2500,Math.floor(raw))) : 1200;
  var timeout = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([callerSignal,timeout]);
  var controller = new AbortController();
  [callerSignal,timeout].forEach(function (signal) {
    if (signal.aborted && !controller.signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort',function () {
      if (!controller.signal.aborted) controller.abort(signal.reason);
    },{once:true});
  });
  return controller.signal;
}

async function currentUsage(key, fetchImpl, callerSignal, env) {
  try {
    var response = await fetchImpl('https://openrouter.ai/api/v1/key', {
      headers:{Authorization:'Bearer ' + key},signal:usageSignal(callerSignal,env)
    });
    if (!response || response.ok !== true) {
      return {ok:false,reason:'openrouter_seat_usage_http_' +
        (response && response.status || 0)};
    }
    var body = await response.json().catch(function () { return null; });
    // NOTE for the next coder, and it has already cost one PR: this response also
    // carries `limit_remaining`. That is the spending limit left on THIS ONE KEY, not
    // the account balance, and it is null on an ordinary uncapped key. It cannot tell
    // you whether the account can pay. The account balance has exactly one reader,
    // core/spend.guard.js accountBalance(), which reads GET /api/v1/credits.
    var daily = usageNumber(body && body.data && body.data.usage_daily);
    if (daily === null) return {ok:false,reason:'openrouter_seat_usage_daily_invalid'};
    return {ok:true,usageDaily:daily};
  } catch (error) {
    return {ok:false,reason:'openrouter_seat_usage_unavailable'};
  }
}

function queueSeat(name, work) {
  var previous = queues.get(name) || Promise.resolve();
  var release;
  var gate = new Promise(function (resolve) { release = resolve; });
  var tail = previous.catch(function () {}).then(function () { return gate; });
  queues.set(name, tail);
  return previous.catch(function () {}).then(work).finally(function () {
    release();
    if (queues.get(name) === tail) queues.delete(name);
  });
}

async function run(url, init, fetchImpl, execute, env) {
  if (!/openrouter\.ai\/api\/v1\/(?:chat\/completions|embeddings)(?:[/?]|$)/
      .test(String(url && url.url || url || ''))) {
    return {blocked:false,response:await execute()};
  }
  var key = bearer(init);
  if (!key) return {blocked:false,response:await execute()};
  var owner = resolveKeyOwner(key, env, attributedSeat());
  if (!owner.ok) return {blocked:true,status:429,reason:owner.reason,
    seats:owner.seats || []};
  var seat = owner.seat;
  var cap = usageNumber(seat.dailyCapUsd);
  var unlimitedDailySpend = seat.unlimitedDailySpend === true;
  if (!unlimitedDailySpend && (cap === null || cap <= 0)) return {blocked:true,status:503,
    reason:'openrouter_seat_daily_cap_invalid',seat:seat.seat,capEnv:seat.capEnv};

  return queueSeat(seat.seat, async function () {
    var usage = await currentUsage(key, fetchImpl, init && init.signal, env);
    if (!usage.ok) return {blocked:true,status:503,reason:usage.reason,
      seat:seat.seat,capUsd:cap};
    // The seat cap answers "has this seat spent enough today". This answers a DIFFERENT
    // question the cap cannot see: "can the account behind this seat pay at all". A seat
    // at $0.10 of a $5 cap sails through the cap while the account credit reads zero, so
    // the request leaves, comes back refused, and the turn falls through to a more
    // expensive rung. Skipping an account the provider itself reports as empty is a
    // mechanical fact, not a quality ruling, so cold code may act on it. Unknown is not
    // empty and never blocks. 429 so the caller treats it as the same soft miss it
    // already handles for the cap.
    if (dryAccountBlockArmed(env)) {
      // The balance is read on the monitor-only credential resolved by the ONE seat
      // source, never on the completion seat whose request this is.
      var balance = await require('./spend.guard.js').accountBalance(
        {fetchImpl:fetchImpl,maxAgeMs:balanceMaxAgeMs(env)});
      if (balance && balance.known === true && balance.dry === true) {
        return {blocked:true,status:429,reason:'openrouter_account_out_of_credit',
          seat:seat.seat,usageDailyUsd:usage.usageDaily,capUsd:cap,
          accountRemainingUsd:balance.remaining,retryAt:'after_credit_top_up'};
      }
    }
    if (!unlimitedDailySpend && usage.usageDaily >= cap) return {blocked:true,status:429,
      reason:'openrouter_seat_daily_dollar_cap_reached',seat:seat.seat,
      usageDailyUsd:usage.usageDaily,capUsd:cap,retryAt:'next_utc_day'};
    // This boundary has resolved the credential to the one canonical seat that owns it.
    // Replace any ambient entry-channel guess only for the actual paid transport. The
    // surrounding HAM/cycle/request/component attribution is retained by withAttribution.
    // This covers primary, declared fallback, council, keeper, ladder, and direct CODA
    // OpenRouter calls without trusting each caller to label itself correctly.
    var response = await require('./spend.guard.js').withAttribution(
      {seat:seat.seat}, execute);
    return {blocked:false,seat:seat.seat,usageDailyUsd:usage.usageDaily,
      capUsd:unlimitedDailySpend?null:cap,unlimitedDailySpend:unlimitedDailySpend,response:response};
  });
}

function reset() { queues.clear(); }

module.exports = {run:run,keyOwner:keyOwner,bearer:bearer,currentUsage:currentUsage,
  dryAccountBlockArmed:dryAccountBlockArmed,
  _test:{sameSecret:sameSecret,usageNumber:usageNumber,usageSignal:usageSignal,
    balanceMaxAgeMs:balanceMaxAgeMs,queueSeat:queueSeat,reset:reset}};
