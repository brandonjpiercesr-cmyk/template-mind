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

function keyOwner(key, env) {
  var runtime = env || process.env;
  var matches = [];
  seatMap.seatNames().forEach(function (name) {
    var seat = seatMap.seat(name);
    var own = seat && seatMap.sanitizeKey(runtime[seat.keyEnv]);
    if (own && sameSecret(key, own)) matches.push(seat);
  });
  if (matches.length > 1) return {ok:false,reason:'openrouter_key_shared_across_seats',
    seats:matches.map(function (seat) { return seat.seat; })};
  if (matches.length === 1) return {ok:true,seat:matches[0]};
  var shared = seatMap.sanitizeKey(runtime.OPENROUTER_API_KEY);
  if (shared && sameSecret(key, shared)) {
    return {ok:false,reason:'anonymous_shared_openrouter_key_forbidden'};
  }
  return {ok:false,reason:'openrouter_key_has_no_named_seat'};
}

function usageNumber(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  var owner = keyOwner(key, env);
  if (!owner.ok) return {blocked:true,status:429,reason:owner.reason,
    seats:owner.seats || []};
  var seat = owner.seat;
  var cap = usageNumber(seat.dailyCapUsd);
  if (cap === null || cap <= 0) return {blocked:true,status:503,
    reason:'openrouter_seat_daily_cap_invalid',seat:seat.seat,capEnv:seat.capEnv};

  return queueSeat(seat.seat, async function () {
    var usage = await currentUsage(key, fetchImpl, init && init.signal, env);
    if (!usage.ok) return {blocked:true,status:503,reason:usage.reason,
      seat:seat.seat,capUsd:cap};
    if (usage.usageDaily >= cap) return {blocked:true,status:429,
      reason:'openrouter_seat_daily_dollar_cap_reached',seat:seat.seat,
      usageDailyUsd:usage.usageDaily,capUsd:cap,retryAt:'next_utc_day'};
    return {blocked:false,seat:seat.seat,usageDailyUsd:usage.usageDaily,
      capUsd:cap,response:await execute()};
  });
}

function reset() { queues.clear(); }

module.exports = {run:run,keyOwner:keyOwner,bearer:bearer,currentUsage:currentUsage,
  _test:{sameSecret:sameSecret,usageNumber:usageNumber,usageSignal:usageSignal,
    queueSeat:queueSeat,reset:reset}};
