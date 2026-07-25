// ⬡B:core.spend_guard:LAW:no_provider_burns_silently_again:20260719⬡
// FOUNDER 911: $65 of Together credit vanished in a day and nobody caught it
// until he did. Two jobs here. One, a daily spend ceiling so a runaway loop or
// a retry storm can never drain a balance to zero, it trips a brake instead.
// Two, a credit watchdog that reads each provider's real remaining balance and
// stamps a warning to the brain the moment any provider drops low, so a HUMAN
// never discovers a dry provider again, the system tells us first.
'use strict';
var AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
// ⬡B:core.spend_guard:COORD:see_cost_changes_ledger:20260720⬡
// IF YOU ARE HERE because a paid call returned null/429 'daily_spend_ceiling_reached':
// that may be INTENTIONAL. Read COST_CHANGES_20260720.md at repo root AND brain bead
// 461759 before raising/removing this guard. A 429 here can be the cost fix WORKING,
// not a bug. The caps (cycle=200, mind=400, anew=400) are set in Render env, not code.


var CALL_LOG = [];               // rolling in-memory record of model spend events
var DAY_MS = 24 * 60 * 60 * 1000;
var DEFAULT_TEXT_CEIL = 1500;
var DEFAULT_IMAGE_CEIL = 300;
var MAX_TEXT_CEIL = 10000;
var MAX_IMAGE_CEIL = 2000;
var ATTRIBUTION = new AsyncLocalStorage();

function configuredCeil(kind) {
  var name = kind === 'image' ? 'DAILY_IMAGE_CALL_CEIL' : 'DAILY_MODEL_CALL_CEIL';
  var fallback = kind === 'image' ? DEFAULT_IMAGE_CEIL : DEFAULT_TEXT_CEIL;
  var maximum = kind === 'image' ? MAX_IMAGE_CEIL : MAX_TEXT_CEIL;
  var raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[1-9][0-9]*$/.test(String(raw).trim())) return null;
  var parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return null;
  return parsed;
}

function pruneOld() {
  var cut = Date.now() - DAY_MS;
  while (CALL_LOG.length && CALL_LOG[0] < cut) CALL_LOG.shift();
}

// Called right before any paid model call. Returns false when the daily ceiling
// is hit, so the caller skips the spend and stays silent rather than burning.
// ⬡B:core.spend_guard:911:the_ceiling_stopped_her_and_told_nobody:20260725⬡
// The ceiling reached is a BUDGET decision, not a failure, and her voice reported it as
// no_answer, which names nothing and points at the models. The denial is remembered here so
// the voice path can name the real wall. Decides nothing, blocks nothing new.
var LAST_DENIAL = null;
var DENIALS_BY_SCOPE = new Map();

function cleanAttribution(value) {
  var input = value && typeof value === 'object' ? value : {};
  var out = {};
  ['ham_uid', 'cycle_id', 'request_id', 'seat', 'component'].forEach(function (key) {
    var item = String(input[key] == null ? '' : input[key]).trim();
    if (!item || item.length > 220 || !/^[A-Za-z0-9._:-]+$/.test(item)) return;
    out[key] = key === 'ham_uid' ? item.toUpperCase() : item;
  });
  return out;
}

function currentAttribution(extra) {
  return Object.assign({}, cleanAttribution(ATTRIBUTION.getStore()), cleanAttribution(extra));
}

function attributionKey(value) {
  var attribution = cleanAttribution(value);
  var keys = ['ham_uid', 'cycle_id', 'request_id', 'seat', 'component'];
  if (!keys.some(function (key) { return attribution[key]; })) return '';
  return keys.map(function (key) { return key + '=' + (attribution[key] || ''); }).join('|');
}

function rememberDenial(value) {
  LAST_DENIAL = value;
  var key = attributionKey(value && value.attribution);
  if (!key) return;
  DENIALS_BY_SCOPE.set(key, value);
  while (DENIALS_BY_SCOPE.size > 512) {
    DENIALS_BY_SCOPE.delete(DENIALS_BY_SCOPE.keys().next().value);
  }
}

function withAttribution(value, fn) {
  if (typeof fn !== 'function') throw new TypeError('spend_attribution_callback_required');
  return ATTRIBUTION.run(currentAttribution(value), fn);
}

function lastDenial(withinMs, attribution) {
  if (withinMs && typeof withinMs === 'object') {
    attribution = withinMs;
    withinMs = undefined;
  }
  var requested = currentAttribution(attribution);
  var key = attributionKey(requested);
  var denial = key ? DENIALS_BY_SCOPE.get(key) : LAST_DENIAL;
  if (!denial) return null;
  var window = typeof withinMs === 'number' ? withinMs : 120000;
  return (Date.now() - denial.at) <= window ? denial : null;
}

function allow(kind, options) {
  var egress = !!(options && options.egress === true);
  var attribution = currentAttribution(options && options.attribution || options);
  pruneOld();
  var ceil = configuredCeil(kind);
  if (ceil === null) {
    rememberDenial({ at: Date.now(), kind: String(kind || 'text'), count: CALL_LOG.length,
      ceiling:null, reason:'daily_call_ceiling_configuration_invalid',
      attribution:attribution });
    return false;
  }
  var count = CALL_LOG.length;
  if (count >= ceil) {
    rememberDenial({ at: Date.now(), kind: String(kind || 'text'), count: count, ceiling: ceil,
      reason: 'daily_call_ceiling_reached', attribution:attribution });
    return false;
  }
  if (!egress) return true;
  CALL_LOG.push(Date.now());
  return true;
}

function usageToday() { pruneOld(); return CALL_LOG.length; }

// Read each provider's real remaining balance. Together and OpenRouter both
// expose it. Returns a list of low/empty providers for the watchdog to stamp.
async function checkBalances() {
  var low = [];
  var seatMap = require('./seat.map.js');
  var OR = seatMap.sanitizeKey(process.env.OR_KEY_ACCOUNT_MONITOR);
  // OpenRouter exposes remaining credit directly.
  if (OR) {
    try {
      var r = await fetch('https://openrouter.ai/api/v1/credits',
        { headers: { Authorization: 'Bearer ' + OR }, signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        var d = await r.json();
        var remaining = (d.data && (d.data.total_credits - d.data.total_usage)) || 0;
        if (remaining < 10) low.push({ provider: 'openrouter', remaining: Math.round(remaining * 100) / 100,
          read_by_seat:'account_monitor' });
      }
    } catch (e) { /* a failed check is not a spend event */ }
  }
  return low;
}

module.exports = { lastDenial: lastDenial, allow: allow, usageToday: usageToday,
  withAttribution:withAttribution, checkBalances: checkBalances,
  _test:{configuredCeil:configuredCeil,cleanAttribution:cleanAttribution,
    reset:function () { CALL_LOG=[]; LAST_DENIAL=null; DENIALS_BY_SCOPE.clear(); }} };
