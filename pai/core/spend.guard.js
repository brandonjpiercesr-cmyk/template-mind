// ⬡B:core.spend_guard:LAW:no_provider_burns_silently_again:20260719⬡
// Entered through the ABAHAM door and serves every paid internal and MESSAGES channel.
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

// ⬡B:core.spend_guard:FIX:a_malformed_brake_is_not_permission_to_spend:20260725⬡
// This was two bare parseInt calls, and both of its failure shapes were silent.
// parseInt('2,000') is 2, so a thousands separator turns a raised ceiling into a
// tighter one and the only symptom is her going quiet sooner. parseInt('two
// thousand') is NaN, and count >= NaN is false forever, so the brake that exists
// because $65 of credit vanished in a day stops existing, silently, with no
// denial to read afterward. The founder is being asked to set this value from a
// phone; a typo must not be able to do either of those things without saying so.
// Unset or empty still means the built-in default, and a plain number still means
// itself, so nothing that is configured correctly today changes. Anything else
// fails closed and records WHY, because a named refusal is fixed in thirty seconds
// and an uncounted burn is not fixed at all.
// ⬡B:core.spend_guard:911:too_big_is_a_choice_and_refusing_it_muted_her:20260726⬡
// LIVE 20260726, and this one is mine. The validation above shipped, the founder raised the
// ceiling from his phone, and the value that landed was a plain run of digits larger than the
// maximum. The rule said refuse, so she went from answering one sentence a restart to
// answering NOTHING, and the cause was the safety check, not the budget.
//
// The distinction the first version missed: an UNREADABLE value and an OVERSIZED one are not
// the same fault. '2,000' and 'two thousand' are typos; nobody can tell what was meant, so
// refusing is the only honest move. A run of digits above the cap is not a typo, it is an
// intention that overshot, and the meaning is never in doubt: MORE. Refusing it silences her
// to protect a budget that was being RAISED, which is the guard doing the exact harm it was
// built to prevent.
//
// So oversized CLAMPS to the maximum and keeps her alive. The brake still exists, at a number
// this system chose, and the surface says out loud what was asked for and what is in force so
// nobody thinks their edit took when it was trimmed. Unreadable still fails closed.
function ceilDetail(kind) {
  var name = kind === 'image' ? 'DAILY_IMAGE_CALL_CEIL' : 'DAILY_MODEL_CALL_CEIL';
  var fallback = kind === 'image' ? DEFAULT_IMAGE_CEIL : DEFAULT_TEXT_CEIL;
  var maximum = kind === 'image' ? MAX_IMAGE_CEIL : MAX_TEXT_CEIL;
  var raw = process.env[name];
  if (raw === undefined || raw === '') {
    return { value: fallback, source: 'built_in_default', requested: null, maximum: maximum };
  }
  var text = String(raw).trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    return { value: null, source: 'env', requested: null, maximum: maximum };
  }
  var asked = Number(text);
  if (!Number.isSafeInteger(asked)) {
    return { value: null, source: 'env', requested: null, maximum: maximum };
  }
  if (asked > maximum) {
    return { value: maximum, source: 'env_clamped', requested: asked, maximum: maximum };
  }
  return { value: asked, source: 'env', requested: asked, maximum: maximum };
}

// One derivation, one place. This is the number the brake actually enforces.
function configuredCeil(kind) { return ceilDetail(kind).value; }

function pruneOld() {
  var cut = Date.now() - DAY_MS;
  while (CALL_LOG.length && CALL_LOG[0] < cut) CALL_LOG.shift();
}

// ⬡COLD:decide:tag:PROVIDER_SPEND_ATTRIBUTION:20260723⬡
// CATHY.SHADOW cold-audit COLD-ANEW-LADDER-0006. The daily model-call ceiling brake. Cold,
// deterministic accounting (a rolling per-day count vs an env ceiling); it makes no semantic
// judgment, so it is correctly cold code. Ceilings are env truth, not literals.
// Called right before any paid model call. Returns false when the daily ceiling
// is hit, so the caller skips the spend and stays silent rather than burning.
// ⬡B:core.spend_guard:911:the_ceiling_stopped_her_and_told_nobody:20260725⬡
// LIVE 20260725: her gate answered no_answer in under two seconds, five times out of five,
// while GET /anew/model/health read every provider UP and all ten seat keys live. Nothing
// was broken. The daily call ceiling had been reached, deliberate() returned null instantly,
// and the word the founder got back was no_answer, which names nothing and points at the
// models, which were fine.
//
// A different path said it plainly in the same minute: the compose seat returned
// daily_spend_ceiling_reached_at_boundary. So the truth existed and her own voice did not
// carry it. That is the third masking of the day and it nearly cost a good revert: her last
// deploy was mine, she was down, and every instinct said roll it back. What stopped it was
// that the same code had answered thirty minutes earlier with no deploy in between.
//
// The denial is recorded here so the voice path can name it instead of guessing. This decides
// nothing and blocks nothing new; it only remembers WHY it said no.
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
  // Text callers consult this before they know which provider rung, if any, will
  // actually leave the process. That consultation is admission only. The one
  // provider boundary records the daily slot at real HTTP egress with
  // {egress:true}. This is global, not CODA-only: otherwise every ordinary text
  // request is counted once here and a second time at fetch(). Text, audio,
  // embeddings, image, and video are all recorded only by the provider boundary
  // at the actual paid submission.
  var egress = !!(options && options.egress === true);
  var attribution = currentAttribution(options && options.attribution || options);
  pruneOld();
  var ceil = configuredCeil(kind);
  if (ceil === null) {
    rememberDenial({ at: Date.now(), kind: String(kind || 'text'), count: CALL_LOG.length,
      ceiling: null, reason: 'daily_call_ceiling_configuration_invalid',
      attribution:attribution });
    return false;
  }
  var count = CALL_LOG.length;
  if (count >= ceil) {
    // Remember WHY, so her voice can say the ceiling stopped her instead of no_answer.
    rememberDenial({ at: Date.now(), kind: String(kind || 'text'), count: count, ceiling: ceil,
      reason: 'daily_call_ceiling_reached', attribution:attribution });
    return false;
  }
  if (!egress) return true;
  CALL_LOG.push(Date.now());
  return true;
}

function usageToday() { pruneOld(); return CALL_LOG.length; }

// ⬡B:core.spend_guard:WIRE:the_credit_watchdog_reads_with_a_real_seat_key:20260725⬡
// Founder order 20260725: the shared OPENROUTER_API_KEY is being removed, so a watchdog
// that can only read the balance through that one key goes blind the moment it does,
// which is the same shape as the outage it exists to catch. The read now resolves
// through core/openrouter.account.key.js (which reads the ONE seat source), so any
// provisioned per-seat key carries the check, and the warning names WHICH seat key read
// the account so a low balance is traceable, never anonymous. With only the shared key
// present this is exactly the old behavior.
var orAccount = require('./openrouter.account.key.js');

// Read each provider's real remaining balance. Together and OpenRouter both
// expose it. Returns a list of low/empty providers for the watchdog to stamp.
async function checkBalances() {
  var low = [];
  var OR = orAccount.accountKey();
  // OpenRouter exposes remaining credit directly.
  if (OR.key) {
    try {
      var r = await fetch('https://openrouter.ai/api/v1/credits',
        { headers: { Authorization: 'Bearer ' + OR.key }, signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        var d = await r.json();
        var remaining = (d.data && (d.data.total_credits - d.data.total_usage)) || 0;
        if (remaining < 10) low.push({ provider: 'openrouter', remaining: Math.round(remaining * 100) / 100, read_by_seat: OR.seat });
      }
    } catch (e) { /* a failed check is not a spend event */ }
  }
  // Together has no non-spending balance endpoint. Never manufacture a paid
  // completion as a health probe. Absence of an account read is reported by the
  // health surface instead of burning a token to ask whether tokens remain.
  return low;
}

module.exports = { lastDenial: lastDenial, allow: allow, usageToday: usageToday,
  withAttribution:withAttribution,
  checkBalances: checkBalances,
  _test:{configuredCeil:configuredCeil,ceilDetail:ceilDetail,cleanAttribution:cleanAttribution,
    reset:function () { CALL_LOG=[]; LAST_DENIAL=null; DENIALS_BY_SCOPE.clear(); }} };
