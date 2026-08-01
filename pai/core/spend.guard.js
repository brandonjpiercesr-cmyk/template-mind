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


var CALL_LOG = [];               // rolling process-local provider-attempt telemetry only
var DAY_MS = 24 * 60 * 60 * 1000;
// ⬡B:core.spend_guard:LAW:no_coder_may_pick_or_cap_this_ceiling:20260731⬡
// FOUNDER ORDER 20260731, his words: remove all the bullshit limits, also in the code. Four
// numbers used to live on this line and every one of them was a coder literal, none of them a
// decision. Two were built in defaults, so a world that configured nothing ran on a number
// nobody chose (her image work ran for weeks on one of them). Two were upper bounds presented
// to the founder as hard maximums, when they were only what a lane typed into a pull request:
// not GitHub, not a provider, not physics. All four are gone, and the reader below now comes
// from the one source that cannot express a maximum at all, so no lane can put them back
// without adding the concept back and tripping `tests/no.coder.may.pick.a.ceiling.test.js`.
var ceilingOwner = require('./ceiling.owner.js');
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
// ⬡B:core.spend_guard:LAW:the_ceiling_the_founder_typed_is_the_ceiling:20260731⬡
// SUPERSEDES THE CLAMP ABOVE, and keeps every guarantee it bought. The 20260726 fix was right
// that an oversized value must never mute her, and it cured that by trimming his number down to
// an upper bound. The bound itself was the remaining defect: he was told it was a hard maximum,
// and it was a literal a lane typed. With no maximum in the estate there is nothing left to
// clamp TO, so the mute is cured a second way and better: whatever he types is what runs.
//
// WHAT EACH ANSWER NOW MEANS, and every one of them says who chose it:
//   'the founder'        a real value is configured. It is enforced exactly, at any size.
//   'nobody_yet'         nothing is configured, so there is NO call ceiling. `unlimited` is
//                        true, and the number carried is the arithmetic edge rather than an
//                        invented default, only because the durable bank claim's contract needs
//                        an integer to pass. Read the whole note in core/ceiling.owner.js.
//   'unreadable_setting' something is configured that nobody can read. Still fails closed with
//                        its own named denial, exactly as before, because '2,000' and 'two
//                        thousand' leave nothing to honor and money is the stake.
// The daily USD brake underneath this is untouched and is where an unconfigured world's real
// protection lives: `core/seat.map.js` per seat caps, enforced at provider egress by
// `core/openrouter.seat.spend.js`, plus the account balance read further down this file.
function ceilDetail(kind) {
  var name = kind === 'image' ? 'DAILY_IMAGE_CALL_CEIL' : 'DAILY_MODEL_CALL_CEIL';
  var read = ceilingOwner.readCeiling(name, { integer: true, unlimited_when_unset: true });
  return { value: read.value, chosen_by: read.chosen_by, setting: name,
    requested: read.requested, reason: read.reason, configured: read.configured,
    unlimited: read.unlimited, limited_by: read.limited_by, needs_review: read.needs_review };
}

// One derivation, one place. The provider-spend Memory Bank RPC enforces this number.
function configuredCeil(kind) { return ceilDetail(kind).value; }

// ⬡B:core.spend_guard:LAW:the_five_states_of_a_ceiling_may_never_collapse_into_fewer:20260801⬡
// CATHY (Codex) review chain, 20260801, nine findings across four separate files
// (core/provider.boundary.js, core/provider.spend.receipt.js, routes/launch.state.routes.js,
// routes/spend.ceiling.routes.js, core/autonomy.governor.js, core/ceiling.owner.js), one at a
// time, each fixed at its own site. That is whack-a-mole, and the founder named it: "that is
// the thing that stops finding number ten arriving from a reviewer instead of from him in
// production." Every single one of those nine findings, traced back, is the SAME error:
// collapsing distinct states into fewer states.
//   1. UNSET               nobody ever configured this setting.
//   2. CONFIGURED          a real, usable, finite value is in force.
//   3. CONFIGURED_ABOVE_RANGE   configured, but larger than this process can represent
//                          exactly (or an overflowed digit run): a clear, deliberate ask for
//                          MORE, not a mistake, and not the same as UNSET.
//   4. UNREADABLE          configured, but not parseable as the kind of number this setting
//                          holds: a real typo, and not the same as CONFIGURED_ABOVE_RANGE.
//   5. LANE_DEFAULT        nothing configured, a coder's baked-in number is standing in.
// "unlimited" is not "unset" (states 1 and 3 are both unlimited, and they are not the same
// state: one is a human's silence, the other is a human's number too large to hold exactly).
// "too big" is not "malformed" (states 3 and 4 are both refusals of the raw digits, and they
// are not the same state: one is an unambiguous MORE, the other is genuinely unreadable).
// "no ceiling in force" is not "no ceiling configured" (states 1 and 3 both leave nothing in
// force, but only state 1 is silence; state 3 is a human's own number that needs review, and
// telling him nothing is configured when he configured something is a lie about his own edit).
//
// ONE SOURCE for translating a raw `ceilDetail()`/`readCeiling()` result into what may be
// PRINTED to a person or to the mind, or WRITTEN to a report. Every surface that reports a
// ceiling (routes/launch.state.routes.js, routes/spend.ceiling.routes.js,
// core/autonomy.governor.js) calls this instead of re-deriving its own branching, so a state
// distinction fixed once is fixed everywhere, and cannot silently re-collapse at a fifth site
// nobody has found yet. `core/ceiling.owner.js`'s own raw `value` field remains the ADMISSION
// ONLY signal `core/spend.guard.js#preflight()` reads directly (see the note on `ceilDetail`
// above); it is `value` from THIS function, never that one, that may reach a report.
var CEILING_STATE = Object.freeze({
  UNSET: 'unset',
  CONFIGURED: 'configured',
  CONFIGURED_ABOVE_RANGE: 'configured_above_range',
  UNREADABLE: 'unreadable',
  LANE_DEFAULT: 'lane_default'
});
function describeCeiling(detail) {
  var d = detail || {};
  var state;
  if (d.chosen_by === 'unreadable_setting') state = CEILING_STATE.UNREADABLE;
  else if (d.chosen_by === 'this_lane') state = CEILING_STATE.LANE_DEFAULT;
  else if (d.chosen_by === 'nobody_yet') state = CEILING_STATE.UNSET;
  else if (d.chosen_by === 'the founder' && d.unlimited === true) {
    state = CEILING_STATE.CONFIGURED_ABOVE_RANGE;
  } else state = CEILING_STATE.CONFIGURED;
  // The admission-only sentinel (`EXACT_INTEGER_EDGE`/`Number.MAX_SAFE_INTEGER`) never
  // survives past this line. UNSET and CONFIGURED_ABOVE_RANGE both report value:null, because
  // in BOTH states nothing is actually in force at a real number, even though they are
  // different states with different owners and different reasons.
  var reportableValue = (state === CEILING_STATE.UNSET ||
    state === CEILING_STATE.CONFIGURED_ABOVE_RANGE) ? null : d.value;
  // Only these two states put a real, working number in force that can be REACHED and refuse
  // a call. UNSET and CONFIGURED_ABOVE_RANGE cannot fire, because there is nothing to compare
  // an admission count against. UNREADABLE cannot fire a "ceiling reached" refusal either: it
  // refuses EVERY call outright at the configuration boundary, never by counting up to it.
  var inForce = state === CEILING_STATE.CONFIGURED || state === CEILING_STATE.LANE_DEFAULT;
  var note;
  if (state === CEILING_STATE.UNSET) {
    note = 'nothing is configured, so no call ceiling of this kind is in force.';
  } else if (state === CEILING_STATE.CONFIGURED_ABOVE_RANGE) {
    note = 'a value is configured that is larger than this process can count exactly, so no ' +
      'call ceiling of this kind is in force at the number typed. This needs review: it is ' +
      'his own number, not the same as nothing being set.';
  } else if (state === CEILING_STATE.UNREADABLE) {
    note = 'a value is configured that cannot be read as a number, so every call of this ' +
      'kind refuses until it is corrected.';
  } else if (state === CEILING_STATE.LANE_DEFAULT) {
    note = 'no human has chosen this ceiling, a value baked into code is standing in.';
  } else {
    note = null;
  }
  return {
    state: state, value: reportableValue, unlimited: d.unlimited === true, in_force: inForce,
    needs_review: d.needs_review === true, chosen_by: d.chosen_by || null, note: note
  };
}

function pruneOld() {
  var cut = Date.now() - DAY_MS;
  function at(entry) { return typeof entry === 'number' ? entry : Number(entry && entry.at || 0); }
  while (CALL_LOG.length && at(CALL_LOG[0]) < cut) CALL_LOG.shift();
}

// ⬡COLD:decide:tag:PROVIDER_SPEND_ATTRIBUTION:20260723⬡
// CATHY.SHADOW cold-audit COLD-ANEW-LADDER-0006. The configuration half of the daily
// model-call brake. Cold validation derives the ceiling; the atomic Memory Bank INTENT RPC
// owns rolling-day accounting and admission across replicas.
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
  ['ham_uid', 'cycle_id', 'request_id', 'seat', 'component', 'owner_node_id',
    'target_wonder_id', 'service_id'].forEach(function (key) {
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
  var active = ATTRIBUTION.getStore();
  var next = currentAttribution(value);
  // Nested transport scopes (the OpenRouter seat resolver is one) must share the same
  // attempt counter and post-egress hold as the turn that owns them. Copying the numbers
  // would let every nested scope restart at attempt 1 and would let a failed terminal
  // receipt escape through the next fallback. The state object is deliberately private
  // and non-enumerable, so it can never enter a receipt or a public attribution surface.
  Object.defineProperty(next, '_provider_state', {enumerable:false,
    value:active && active._provider_state ||
      {attempt_order:0,hold:null,reconciliations:new Map()}});
  return ATTRIBUTION.run(next, fn);
}

function nextProviderAttemptOrder() {
  var active = ATTRIBUTION.getStore();
  if (!active || !active._provider_state) return null;
  active._provider_state.attempt_order = Number(active._provider_state.attempt_order || 0) + 1;
  return active._provider_state.attempt_order;
}

function paidEgressHold() {
  var active = ATTRIBUTION.getStore();
  return active && active._provider_state && active._provider_state.hold || null;
}

function holdPaidEgress(reason) {
  var active = ATTRIBUTION.getStore();
  if (!active || !active._provider_state) return false;
  active._provider_state.hold = String(reason || 'provider_spend_terminal_unverified').slice(0, 120);
  return true;
}

function ensurePaidReconciliation(key, fn) {
  var active = ATTRIBUTION.getStore();
  if (typeof fn !== 'function') {
    return Promise.resolve({ok:false,reason:'provider_spend_reconcile_scope_invalid'});
  }
  // Receipt preparation rejects missing production attribution before this point. Keeping
  // the helper callable without ALS supports explicit injected boundary harnesses while the
  // real attributed path below gets cross-fallback single-flight behavior.
  if (!active || !active._provider_state) return Promise.resolve().then(fn);
  var state = active._provider_state, exact = String(key || '');
  if (!exact) return Promise.resolve({ok:false,reason:'provider_spend_reconcile_scope_invalid'});
  var reconciliations=state.reconciliations;
  if (!(reconciliations instanceof Map)) {
    reconciliations=new Map();
    state.reconciliations=reconciliations;
  }
  if (reconciliations.has(exact)) return reconciliations.get(exact);
  if (reconciliations.size >= 64) {
    return Promise.resolve({ok:false,reason:'provider_spend_reconcile_capacity_reached'});
  }
  var promise;
  promise=Promise.resolve().then(fn).finally(function(){
    if(reconciliations.get(exact)===promise)reconciliations.delete(exact);
  });
  reconciliations.set(exact,promise);
  return promise;
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

function preflight(kind, options) {
  // This is configuration validation only. Daily admission is an atomic Memory Bank
  // election owned by provider.spend.receipt; a process-local array can never arbitrate
  // two replicas. Legacy callers may still consult this before they know which rung will
  // be selected, but they cannot consume or deny a durable slot here.
  var attribution = currentAttribution(options && options.attribution || options);
  // A null value now has exactly ONE cause, and it is never "nobody configured this". The one
  // source refuses to hand back a bare null: an unconfigured ceiling reports 'nobody_yet' with
  // no ceiling in force, and only a value that IS configured and cannot be read arrives here as
  // null. The denial carries who chose it so the surface can say which of the two it was.
  var detail = ceilDetail(kind);
  if (detail.value === null) {
    rememberDenial({ at: Date.now(), kind: String(kind || 'text'), count: CALL_LOG.length,
      ceiling: null, reason: 'daily_call_ceiling_configuration_invalid',
      chosen_by: detail.chosen_by, setting: detail.setting, why: detail.reason,
      attribution:attribution });
    return false;
  }
  return true;
}

function recordAttemptTelemetry(kind, options) {
  // Observability only. The durable claim has already admitted this exact attempt before
  // the boundary calls here. This array neither grants nor refuses provider traffic and is
  // intentionally allowed to reset at process restart.
  var attribution = currentAttribution(options && options.attribution || options);
  // ⬡B:core.spend_guard:FIX:paid_egress_keeps_its_owner:20260730⬡
  // The old log kept only a timestamp, discarding the attribution already present in this
  // scope. Keep one bounded record per locally attempted provider call. No prompt, response, key, URL,
  // or provider body is stored here.
  CALL_LOG.push({ at:Date.now(), kind:String(kind || 'text').slice(0, 24),
    attribution:attribution });
  return true;
}

// Compatibility for callers and tests that still use the old name. It is telemetry, not
// proof of egress and never ceiling authority.
function recordEgress(kind, options) { return recordAttemptTelemetry(kind, options); }

function rememberDurableDenial(kind, count, ceiling, reason, options) {
  var attribution = currentAttribution(options && options.attribution || options);
  rememberDenial({at:Date.now(),kind:String(kind || 'text'),
    count:Number.isInteger(Number(count)) ? Number(count) : null,
    ceiling:Number.isInteger(Number(ceiling)) ? Number(ceiling) : null,
    reason:String(reason || 'daily_call_ceiling_reached').slice(0, 120),
    attribution:attribution});
}

function allow(kind, options) {
  if (!preflight(kind, options)) return false;
  return options && options.egress === true ? recordAttemptTelemetry(kind,options) : true;
}

function usageToday() { pruneOld(); return CALL_LOG.length; }

function publicComponent(value) {
  var root = String(value || '').split('.')[0].toLowerCase();
  return ['pai', 'coda', 'wonder', 'canon', 'directive', 'seer'].indexOf(root) >= 0
    ? root : 'unattributed';
}

function publicSeat(value) {
  // A declared failover is a second transport attempt owned by the same governed seat,
  // not a new wallet. Keep the exact `.fallback` attempt internally while reconciling the
  // public total to the canonical seat that owns its key and cap.
  var name = String(value || '').replace(/\.fallback$/, '');
  try {
    var seats = require('./seat.map.js').SEATS || {};
    if (Object.prototype.hasOwnProperty.call(seats, name)) return name;
  } catch (e) {}
  return 'unattributed';
}

function publicKind(value) {
  var name = String(value || '').toLowerCase();
  return ['text', 'image', 'audio', 'embedding', 'video'].indexOf(name) >= 0
    ? name : 'other';
}

function addBucket(map, name) { map[name] = (map[name] || 0) + 1; }

function boundedBuckets(map, maximum) {
  var rows = Object.keys(map).map(function (owner) {
    return { owner:owner, count:map[owner] };
  }).sort(function (left, right) {
    return right.count - left.count || left.owner.localeCompare(right.owner);
  });
  if (rows.length <= maximum) return rows;
  var kept = rows.slice(0, maximum - 1);
  var rolled = rows.slice(maximum - 1).reduce(function (sum, row) { return sum + row.count; }, 0);
  kept.push({ owner:'other', count:rolled });
  return kept;
}

// Public-safe ownership totals. Exact HAM, cycle, request, and arbitrary caller labels remain
// internal; the wall exposes only stable component families, canonical seat names, and kinds.
function usageAttribution() {
  pruneOld();
  var components = {}, seats = {}, kinds = {};
  CALL_LOG.forEach(function (entry) {
    var attribution = entry && typeof entry === 'object' ? entry.attribution : null;
    addBucket(components, publicComponent(attribution && attribution.component));
    addBucket(seats, publicSeat(attribution && attribution.seat));
    addBucket(kinds, publicKind(entry && typeof entry === 'object' ? entry.kind : 'text'));
  });
  return { total:CALL_LOG.length, window_hours:24,
    by_component:boundedBuckets(components, 12),
    by_seat:boundedBuckets(seats, 12),
    by_kind:boundedBuckets(kinds, 12) };
}

// ⬡B:core.spend_guard:WIRE:the_credit_watchdog_reads_with_a_real_seat_key:20260725⬡
// Founder order 20260725: the shared OPENROUTER_API_KEY is being removed, so a watchdog
// that can only read the balance through that one key goes blind the moment it does,
// which is the same shape as the outage it exists to catch. The read now resolves
// through core/openrouter.account.key.js (which reads the ONE seat source), so any
// provisioned per-seat key carries the check, and the warning names WHICH seat key read
// the account so a low balance is traceable, never anonymous. With only the shared key
// present this is exactly the old behavior.
var orAccount = require('./openrouter.account.key.js');

// ⬡B:core.spend_guard:FACT:the_account_balance_is_read_in_exactly_one_place:20260726⬡
// The external auditor (CATHY, P1 on the model health wonder, PR #1132) caught the exact
// shape this bead exists to end. A SECOND balance reader had been written that took
// `limit_remaining` out of GET /api/v1/key and called it the wallet. That field is the
// spending limit left on that ONE API KEY, not the account balance, and on an ordinary
// uncapped pay as you go key the provider sends null for it. So the exhausted ACCOUNT
// that started this whole line of work still read as unknown, the watchdog stayed dead,
// and the doomed request still left. The mirror failure was just as bad: an exhausted
// per key limit on the monitor credential would have declared the ENTIRE provider dry
// while every completion seat was still able to pay, which silences her over nothing.
//
// Both failures point the same way. Read the field that answers the question you asked.
// The question is "can this ACCOUNT pay at all", and GET /api/v1/credits is the only
// free read that answers it. That derivation already lived in this file, so the second
// reader was a twin as well as a hollow one. This function is now the ONE place the
// account balance is derived. The watchdog, the health surface and the paid door all
// consume THIS, so the tree never carries two hand maintained balance readers again.
//
// It is a READ, never a ruling. It states a mechanical fact and stops. What to DO about
// an empty account (top up, reseat, reach a human) is a judgment for a mind in the
// cycle, never for this function.
var BALANCE_MEMO = null;

// Strict on purpose, because a loose parse here is the whole danger. Number(null) is 0
// and Number('') is 0, so a coerced read would turn a missing or malformed credits body
// into an account holding exactly zero dollars, and a gate acting on that would silence
// her over a number the provider never sent. Only a real finite number, or a string that
// is entirely a number, counts as reported.
function reportedDollars(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  var parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

// UNKNOWN is a THIRD state beside present and empty. It is never dry, it never blocks a
// request, and it never stamps a warning. A balance nobody could read is not a low
// balance, and pretending otherwise is how a monitor takes her voice down.
function unknownBalance(reason) {
  return {known:false,remaining:null,dry:false,reason:reason,
    source:'openrouter_credits_control_plane',read_by_seat:null};
}

async function readAccountBalance(options) {
  var OR = orAccount.accountKey();
  if (!OR.key) return unknownBalance('no_account_monitor_key');
  var doFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch;
  try {
    var r = await doFetch('https://openrouter.ai/api/v1/credits',
      { headers: { Authorization: 'Bearer ' + OR.key }, signal: AbortSignal.timeout(10000) });
    if (!r || r.ok !== true) return unknownBalance('credits_http_' + ((r && r.status) || 0));
    var body = await r.json().catch(function () { return null; });
    var d = body && typeof body === 'object' ? body.data : null;
    var credits = d ? reportedDollars(d.total_credits) : null;
    var used = d ? reportedDollars(d.total_usage) : null;
    if (credits === null || used === null) return unknownBalance('credits_body_invalid');
    var remaining = Math.round((credits - used) * 100) / 100;
    // DRY only when the ACCOUNT itself reports a finite balance at or below zero.
    return {known:true,remaining:remaining,dry:remaining <= 0,reason:null,
      source:'openrouter_credits_control_plane',read_by_seat:OR.seat};
  } catch (e) { return unknownBalance('credits_unreachable'); }
}

// The account balance fact. A free control-plane read on the monitor-only credential:
// no completion is manufactured, no model is called, no dollar is spent to ask whether
// dollars remain. Pass maxAgeMs to accept a recent read instead of asking again, which
// is how the paid door consults this without adding a round trip to every request.
// Callers that pass nothing always read fresh.
async function accountBalance(options) {
  options = options || {};
  var maxAge = Number(options.maxAgeMs);
  if (Number.isFinite(maxAge) && maxAge > 0 && BALANCE_MEMO &&
      (Date.now() - BALANCE_MEMO.at) <= maxAge) return BALANCE_MEMO.fact;
  var fact = await readAccountBalance(options);
  BALANCE_MEMO = {at:Date.now(),fact:fact};
  return fact;
}

// The one low threshold. A LEASH on a warning stamp, never a refusal and never a reach.
var LOW_BALANCE_USD = 10;

// Pure, no I/O. Derives the watchdog's low list from the ONE balance fact, so a caller
// that already read the balance this tick never reads it a second time to learn this.
function lowProviders(balance) {
  var low = [];
  if (balance && balance.known === true && balance.remaining < LOW_BALANCE_USD) {
    low.push({ provider: 'openrouter', remaining: balance.remaining,
      read_by_seat: balance.read_by_seat });
  }
  return low;
}

// Returns the list of low/empty providers for the watchdog to stamp.
// Together has no non-spending balance endpoint. Never manufacture a paid completion as
// a health probe. Absence of an account read is reported by the health surface instead
// of burning a token to ask whether tokens remain.
async function checkBalances(options) {
  return lowProviders(await accountBalance(options));
}

// ⬡B:core.spend_guard:WIRE:a_clamped_ceiling_needs_a_real_door_not_a_test_one:20260726⬡
// ceilDetail shipped behind _test, so the only way to learn that 35000 became 10000 was to
// import a test hook in production, and in a world without that surface there was no way at
// all. A clamp nobody can see is the same operational lie as the unreadable ceiling this
// whole line of work exists to end: the edit looks accepted and then calls stop early. It is
// a first-class export now, so any world can report what is in force beside what was asked
// for. Caught by the Codex reviewer on the sister PR.
module.exports = { lastDenial: lastDenial, allow: allow, preflight:preflight,
  recordEgress:recordEgress, usageToday: usageToday,
  recordAttemptTelemetry:recordAttemptTelemetry,
  rememberDurableDenial:rememberDurableDenial,
  usageAttribution:usageAttribution,
  ceilDetail: ceilDetail,
  describeCeiling: describeCeiling,
  CEILING_STATE: CEILING_STATE,
  withAttribution:withAttribution,
  currentAttribution:currentAttribution,
  nextProviderAttemptOrder:nextProviderAttemptOrder,
  paidEgressHold:paidEgressHold,
  holdPaidEgress:holdPaidEgress,
  ensurePaidReconciliation:ensurePaidReconciliation,
  checkBalances: checkBalances,
  accountBalance: accountBalance,
  lowProviders: lowProviders,
  _test:{configuredCeil:configuredCeil,ceilDetail:ceilDetail,cleanAttribution:cleanAttribution,
    reportedDollars:reportedDollars,LOW_BALANCE_USD:LOW_BALANCE_USD,
    resetBalanceMemo:function () { BALANCE_MEMO = null; },
    reset:function () { CALL_LOG=[]; LAST_DENIAL=null; DENIALS_BY_SCOPE.clear();
      BALANCE_MEMO=null; }} };
