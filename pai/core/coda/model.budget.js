// ⬡B:core.coda.model_budget:MODULE:one_shared_paid_deliberation_budget:20260725⬡
// entered via the ABAHAM door, serving channel internal
//
// Every paid CODA deliberation in one operational cycle shares this mutable
// ticket. Priority, lead correction, and patch authorship cannot each reopen a
// private allowance. Cold code counts calls and stops at the boundary; PAI owns
// every judgment made inside an admitted call.
'use strict';

const {AsyncLocalStorage} = require('node:async_hooks');
const ceilingOwner = require('../ceiling.owner.js');

const SCHEMA = 'great-reset.coda-model-budget.v1';
const providerScope = new AsyncLocalStorage();
// Telemetry retention bounds memory, never capability. The monotonic used counters and
// receipt total/omitted fields preserve how many calls happened while only recent detail rows
// remain resident in one cycle.
const MODEL_TELEMETRY_ROWS = 20;
const PROVIDER_TELEMETRY_ROWS = 24;

// ⬡B:core.coda.model_budget:LAW:the_thought_budget_he_set_is_the_budget:20260731⬡
// THE TRAP THAT LIVED HERE UNTIL 20260731, and it was eating a real edit while it was found.
// This file used to read the two per cycle budgets like this:
//     Math.max(1, Math.min(12, base))      // CODA_MODEL_CALL_BUDGET
//     Math.max(1, Math.min(24, base))      // CODA_PAID_PROVIDER_ATTEMPT_BUDGET
// A coder typed 12 and 24 into this file. Nobody else ever chose them. They are not a provider
// limit, not a price, and not a fact about the machine. CODA_MODEL_CALL_BUDGET was set to 60 an
// hour before this line was written and became 12, and NOTHING anywhere said so: not a log, not
// a receipt, not the governor surface that exists precisely to report caps to a human. That is
// the whole defect class. A value a human set that is silently not in force is worse than any
// limit, because he believes his edit took and has no reason to look again.
//
// THE SECOND HALF OF THE SAME TRAP, and it is why removing the clamp ALONE would have made this
// worse rather than better. validTicket() separately required `max <= 12`. Lift the clamp on its
// own and a budget of 60 mints a ticket that validTicket then calls INVALID, every consume()
// answers model_call_budget_invalid, and CODA gets ZERO thoughts instead of twelve. The generous
// number would have bought him less than nothing, which is the exact shape that killed the seat
// in core/seat.map.js the same night. Both halves die together or neither does.
//
// WHAT REPLACES IT. core/ceiling.owner.js, the one source, which cannot express a maximum at
// all: no `max`, `cap`, `clamp` or `maximum` in any spec it accepts, so no lane can put an upper
// bound back without adding the concept back and tripping the suite that forbids it. His number
// goes into force at his size. A value that cannot be READ is announced with a named reason
// rather than swapped for a coder's number, because going quiet over an unreadable setting is
// the same sin in a different coat. A budget nobody configured is explicitly unlimited, so no
// receipt can ever call a coder's number his or disguise no cap as a large one.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not bound a ticket from above anywhere. When a
// number is configured, the only checks left are INTERNAL CONSISTENCY: used plus remaining
// equals max, no count is negative, the call log is no longer than the calls taken. When none
// is configured, null plus an explicit unlimited flag means there is no ceiling at all, not a
// disguised large one. A forged ticket still fails closed in both forms.
//
// Cold code counts calls and stops at the boundary; PAI owns every judgment made inside an
// admitted call. This file decides nothing and reaches nobody.

// Read one per-cycle budget and report who chose it. Never trims and never invents. An unset
// setting returns explicit unlimited state; an unusable configured setting comes back ok:false
// carrying a named reason, so the caller fails loudly instead of running on a number nobody
// picked.
function readBudgetCeiling(name, runtime, unreadableReason) {
  const spec = {integer:true,unlimited_when_unset:true};
  const read = ceilingOwner.readCeiling(name, spec, runtime || process.env);
  if (read.unlimited === true) {
    return {ok:true,unlimited:true,value:null,chosen_by:read.chosen_by,
      limited_by:read.limited_by || null};
  }
  if (!Number.isInteger(read.value) || read.value < 1) {
    return {ok: false, reason: unreadableReason, setting: name,
      chosen_by: read.chosen_by, setting_reason: read.reason || null};
  }
  return {ok:true,unlimited:false,value:read.value,chosen_by:read.chosen_by,
    limited_by: read.limited_by || null};
}

function validTicket(value) {
  if (!value || typeof value !== 'object' || value.schema !== SCHEMA) return false;
  const used = Number(value.used_llm_calls);
  if (value.unlimited_llm_calls === true) {
    return value.max_llm_calls === null && value.remaining_llm_calls === null &&
      Number.isSafeInteger(used) && used >= 0 &&
      Array.isArray(value.calls) && value.calls.length <= used;
  }
  const max = Number(value.max_llm_calls);
  const remaining = Number(value.remaining_llm_calls);
  // A configured value above JavaScript's exact integer range becomes unlimited when the
  // ticket is minted. A finite ticket must therefore remain inside the exact range in every
  // counter; otherwise internal consistency itself cannot be proved.
  return Number.isSafeInteger(max) && max >= 1 &&
    Number.isSafeInteger(remaining) && remaining >= 0 && remaining <= max &&
    Number.isSafeInteger(used) && used >= 0 && used <= max && used + remaining === max &&
    Array.isArray(value.calls) && value.calls.length <= used;
}

function invalidTicket() {
  return {schema:SCHEMA,max_llm_calls:0,remaining_llm_calls:0,used_llm_calls:0,
    unlimited_llm_calls:false,calls:[],max_paid_provider_attempts:0,
    remaining_paid_provider_attempts:0,unlimited_paid_provider_attempts:false,
    used_paid_provider_attempts:0,provider_attempts:[],
    invalid_reason:'model_call_budget_invalid'};
}

function providerAllowanceValid(ticket, cap) {
  if (!validTicket(ticket)) return false;
  const used = Number(ticket.used_paid_provider_attempts);
  if (ticket.unlimited_paid_provider_attempts === true) {
    return cap === null && ticket.max_paid_provider_attempts === null &&
      ticket.remaining_paid_provider_attempts === null &&
      Number.isSafeInteger(used) && used >= 0 &&
      Array.isArray(ticket.provider_attempts) && ticket.provider_attempts.length <= used;
  }
  const max = Number(ticket.max_paid_provider_attempts);
  const remaining = Number(ticket.remaining_paid_provider_attempts);
  return Number.isSafeInteger(max) && max >= 1 && max <= cap &&
    Number.isSafeInteger(remaining) && remaining >= 0 && remaining <= max &&
    Number.isSafeInteger(used) && used >= 0 && used <= max && used + remaining === max &&
    Array.isArray(ticket.provider_attempts) && ticket.provider_attempts.length <= used;
}

function ensureProviderAllowance(ticket, env) {
  if (!validTicket(ticket)) return {ok:false,reason:'model_call_budget_invalid'};
  const runtime = env || process.env;
  // His number, at his size. An unreadable setting is announced, never quietly replaced.
  const read = readBudgetCeiling('CODA_PAID_PROVIDER_ATTEMPT_BUDGET', runtime,
    'paid_provider_attempt_budget_setting_unreadable');
  if (!read.ok) return {ok:false,reason:read.reason,setting:read.setting,
    setting_reason:read.setting_reason};
  const cap = read.unlimited === true ? null : read.value;
  const fields = ['max_paid_provider_attempts','remaining_paid_provider_attempts',
    'used_paid_provider_attempts','provider_attempts'];
  const present = fields.filter(function(key) { return ticket[key] !== undefined; });
  if (!present.length) {
    ticket.max_paid_provider_attempts = cap;
    ticket.remaining_paid_provider_attempts = cap;
    ticket.unlimited_paid_provider_attempts = read.unlimited === true;
    ticket.used_paid_provider_attempts = 0;
    ticket.provider_attempts = [];
  } else if (present.length === fields.length && read.unlimited === true &&
      ticket.unlimited_paid_provider_attempts !== true) {
    // A complete finite v1 ticket is an explicit cycle contract, not a fallback minted here.
    // Preserve it across an unset runtime instead of comparing its max to null and calling it
    // invalid. Newly minted tickets remain truly unlimited when the setting is absent.
    if (!providerAllowanceValid(ticket,Number(ticket.max_paid_provider_attempts))) {
      return {ok:false,reason:'paid_provider_attempt_budget_invalid'};
    }
    ticket.unlimited_paid_provider_attempts=false;
    return {ok:true,ticket:ticket,cap:Number(ticket.max_paid_provider_attempts)};
  } else if (present.length !== fields.length || !providerAllowanceValid(ticket, cap)) {
    return {ok:false,reason:'paid_provider_attempt_budget_invalid'};
  }
  if (ticket.unlimited_paid_provider_attempts !== true) {
    ticket.unlimited_paid_provider_attempts = false;
  }
  return {ok:true,ticket:ticket,cap:cap};
}

function ensure(existing, _legacyFallback, env) {
  const runtime = env || process.env;
  if (existing != null) {
    if (!validTicket(existing)) return invalidTicket();
    const existingProvider = ensureProviderAllowance(existing, runtime);
    return existingProvider.ok ? existing : invalidTicket();
  }
  const read = readBudgetCeiling('CODA_MODEL_CALL_BUDGET', runtime,
    'model_call_budget_setting_unreadable');
  // A setting that IS configured and cannot be used never becomes a coder's number here. It
  // fails closed with its own name on it, so the reason reaches a receipt instead of a silence.
  if (!read.ok) {
    const refused = invalidTicket();
    refused.invalid_reason = read.reason;
    refused.setting = read.setting;
    refused.setting_reason = read.setting_reason;
    return refused;
  }
  const max = read.unlimited === true ? null : read.value;
  const ticket = {schema:SCHEMA,max_llm_calls:max,remaining_llm_calls:max,
    unlimited_llm_calls:read.unlimited === true,used_llm_calls:0,calls:[]};
  ensureProviderAllowance(ticket, runtime);
  return ticket;
}

function consume(budget, purpose, now) {
  if (!validTicket(budget)) return {ok:false,reason:'model_call_budget_invalid'};
  const scope = currentProviderScope();
  // Inside a counted provider scope the paid network boundary is the source
  // of truth. An organ may reserve a purpose, but a reservation that never
  // reaches a provider is not a model call and does not burn the ticket.
  if (scope && scope.ticket === budget && scope.count_model_calls === true) {
    const pending = Array.isArray(scope.pending_model_purposes)
      ? scope.pending_model_purposes : [];
    if (budget.unlimited_llm_calls !== true &&
        Number(budget.remaining_llm_calls) - pending.length <= 0) {
      return {ok:false,reason:'model_call_budget_exhausted'};
    }
    pending.push({purpose:String(purpose || 'coda.deliberation').slice(0,120),
      at:now || new Date().toISOString()});
    scope.pending_model_purposes = pending;
    return {ok:true,pending_provider_call:true,
      remaining_llm_calls:budget.unlimited_llm_calls === true ? null :
        Number(budget.remaining_llm_calls) - pending.length,
      unlimited_llm_calls:budget.unlimited_llm_calls === true};
  }
  return commitModelCall(budget,purpose,now);
}

function commitModelCall(budget, purpose, now) {
  if (!validTicket(budget)) return {ok:false,reason:'model_call_budget_invalid'};
  const used=Number(budget.used_llm_calls);
  let remaining=null;
  if (budget.unlimited_llm_calls !== true) {
    remaining = Number(budget.remaining_llm_calls);
    // A valid finite ticket at its exact configured end is exhausted, even when its counter
    // also sits on JavaScript's physical precision edge. Keep that attribution truthful.
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return {ok:false,reason:'model_call_budget_exhausted'};
    }
  }
  // Refuse before mutating either half of the counter pair. validTicket already rejects
  // imprecise finite tickets; this protects the last exact unlimited counter value too.
  if (!Number.isSafeInteger(used) || used >= Number.MAX_SAFE_INTEGER) {
    return {ok:false,reason:'model_call_counter_precision_exhausted'};
  }
  if (budget.unlimited_llm_calls !== true) {
    budget.remaining_llm_calls = remaining - 1;
  }
  budget.used_llm_calls = used + 1;
  if (!Array.isArray(budget.calls)) budget.calls = [];
  budget.calls.push({purpose:String(purpose || 'coda.deliberation').slice(0, 120),
    at:now || new Date().toISOString()});
  while (budget.calls.length > MODEL_TELEMETRY_ROWS) budget.calls.shift();
  return {ok:true,remaining_llm_calls:budget.remaining_llm_calls,
    unlimited_llm_calls:budget.unlimited_llm_calls === true};
}

function receipt(budget) {
  if (!validTicket(budget)) return {schema:SCHEMA,valid:false,
    reason:'model_call_budget_invalid',max_llm_calls:0,used_llm_calls:0,
    remaining_llm_calls:0,calls:[]};
  const value = budget;
  const out = {schema:SCHEMA,
    max_llm_calls:value.unlimited_llm_calls === true ? null : Number(value.max_llm_calls || 0),
    used_llm_calls:Number(value.used_llm_calls || 0),
    remaining_llm_calls:value.unlimited_llm_calls === true ? null :
      Number(value.remaining_llm_calls || 0),
    calls:(value.calls || []).map(function(call) {
      return {purpose:String(call && call.purpose || '').slice(0, 120),
        at:call && call.at || null};
    }).slice(0,MODEL_TELEMETRY_ROWS)};
  if (value.unlimited_llm_calls === true) out.unlimited_llm_calls=true;
  if (Number(value.used_llm_calls) > out.calls.length) {
    out.calls_total = Number(value.used_llm_calls);
    out.calls_omitted = Number(value.used_llm_calls) - out.calls.length;
  }
  if (value.unlimited_paid_provider_attempts === true ||
      Number.isInteger(value.max_paid_provider_attempts)) {
    out.max_paid_provider_attempts = value.unlimited_paid_provider_attempts === true ? null :
      Number(value.max_paid_provider_attempts);
    out.used_paid_provider_attempts = Number(value.used_paid_provider_attempts || 0);
    out.remaining_paid_provider_attempts = value.unlimited_paid_provider_attempts === true ? null :
      Number(value.remaining_paid_provider_attempts || 0);
    if (value.unlimited_paid_provider_attempts === true) {
      out.unlimited_paid_provider_attempts=true;
    }
    out.provider_attempts = (value.provider_attempts || []).map(function(attempt) {
      return {attempt:Number(attempt.attempt || 0),component:String(attempt.component || '').slice(0, 120),
        intent_source:String(attempt.intent_source || '').slice(0, 240),
        provider_host:String(attempt.provider_host || '').slice(0, 160),
        path:String(attempt.path || '').slice(0, 240),purpose:String(attempt.purpose || '').slice(0, 120),
        started_at:attempt.started_at || null,completed_at:attempt.completed_at || null,
        status_code:Number.isFinite(Number(attempt.status_code)) ? Number(attempt.status_code) : null,
        ok:attempt.ok === true,error:attempt.error || null};
    }).slice(0,PROVIDER_TELEMETRY_ROWS);
    if (Number(value.used_paid_provider_attempts) > out.provider_attempts.length) {
      out.provider_attempts_total = Number(value.used_paid_provider_attempts);
      out.provider_attempts_omitted = Number(value.used_paid_provider_attempts) -
        out.provider_attempts.length;
    }
  }
  return out;
}

function currentProviderScope() { return providerScope.getStore() || null; }

async function runProviderScope(ticket, metadata, fn, env) {
  if (typeof fn !== 'function') return {ok:false,reason:'provider_scope_function_required'};
  const active = currentProviderScope();
  if (active && active.ticket !== ticket) {
    return {ok:false,reason:'provider_scope_ticket_mismatch'};
  }
  const prepared = ensureProviderAllowance(ticket, env || process.env);
  if (!prepared.ok) return {ok:false,reason:prepared.reason};
  const meta = metadata || {};
  const scopeValue={ticket:ticket,
      cap:active ? (active.cap === null ? prepared.cap :
        prepared.cap === null ? active.cap : Math.min(Number(active.cap),prepared.cap)) :
        prepared.cap,
      component:String(meta.component || 'coda.autonomous').slice(0, 120),
      intent_source:String(meta.intent_source || '').slice(0, 240),
      count_model_calls:active&&active.count_model_calls===true ||
        meta.count_model_calls === true,
      pending_model_purposes:active&&Array.isArray(active.pending_model_purposes)
        ? active.pending_model_purposes : []};
  // Provider scope and spend ownership are the same dynamic extent. Carry any exact lineage
  // the owning route supplied into the one spend ALS while preserving an outer PAI turn when
  // this is nested. Missing fields remain missing and the paid boundary refuses them; this
  // layer never invents SYSTEM ownership.
  const attribution={ham_uid:meta.ham_uid,cycle_id:meta.cycle_id,
    request_id:meta.request_id,component:scopeValue.component,seat:meta.seat,
    owner_node_id:meta.owner_node_id,target_wonder_id:meta.target_wonder_id,
    service_id:meta.service_id};
  return require('../spend.guard.js').withAttribution(attribution,function(){
    return providerScope.run(scopeValue,fn);
  });
}

function providerTarget(url) {
  try {
    const parsed = new URL(String(url || ''));
    return {provider_host:parsed.hostname.toLowerCase(),path:parsed.pathname};
  } catch (error) { return {provider_host:'unknown',path:''}; }
}

function reserveProviderAttempt(spec, now) {
  const scope = currentProviderScope();
  if (!scope) return {ok:true,scoped:false};
  if (!providerAllowanceValid(scope.ticket, scope.cap)) {
    return {ok:false,scoped:true,reason:'paid_provider_attempt_budget_invalid'};
  }
  if (scope.ticket.unlimited_paid_provider_attempts !== true &&
      scope.ticket.remaining_paid_provider_attempts <= 0) {
    return {ok:false,scoped:true,reason:'paid_provider_attempt_budget_exhausted'};
  }
  const providerUsed=Number(scope.ticket.used_paid_provider_attempts);
  if (!Number.isSafeInteger(providerUsed) || providerUsed >= Number.MAX_SAFE_INTEGER) {
    return {ok:false,scoped:true,reason:'paid_provider_attempt_counter_precision_exhausted'};
  }
  if (scope.count_model_calls === true) {
    const pending = Array.isArray(scope.pending_model_purposes)
      ? scope.pending_model_purposes.shift() : null;
    const counted = commitModelCall(scope.ticket,
      pending && pending.purpose || spec && spec.purpose || 'paid_provider.fetch',
      pending && pending.at || now);
    if (!counted.ok) {
      return {ok:false,scoped:true,reason:
        counted.reason === 'model_call_budget_exhausted'
          ? 'paid_provider_attempt_budget_exhausted'
          : counted.reason === 'model_call_counter_precision_exhausted'
            ? 'model_call_counter_precision_exhausted'
            : 'paid_provider_attempt_budget_invalid'};
    }
  }
  const target = providerTarget(spec && spec.url);
  if (scope.ticket.unlimited_paid_provider_attempts !== true) {
    scope.ticket.remaining_paid_provider_attempts -= 1;
  }
  scope.ticket.used_paid_provider_attempts = providerUsed + 1;
  const attempt = {attempt:scope.ticket.used_paid_provider_attempts,
    component:scope.component,intent_source:scope.intent_source,
    provider_host:target.provider_host,path:target.path,
    purpose:String(spec && spec.purpose || 'paid_provider.fetch').slice(0, 120),
    started_at:now || new Date().toISOString(),completed_at:null,status_code:null,
    ok:false,error:null};
  scope.ticket.provider_attempts.push(attempt);
  return {ok:true,scoped:true,attempt:attempt.attempt};
}

function settleProviderAttempt(reservation, outcome, now) {
  if (!reservation || reservation.scoped !== true || !reservation.ok) return;
  const scope = currentProviderScope();
  if (!scope || !providerAllowanceValid(scope.ticket, scope.cap)) return;
  const attempt = scope.ticket.provider_attempts.find(function(row) {
    return Number(row.attempt) === Number(reservation.attempt);
  });
  if (!attempt) return;
  const value = outcome || {};
  attempt.completed_at = now || new Date().toISOString();
  attempt.status_code = Number.isFinite(Number(value.status_code)) ? Number(value.status_code) : null;
  attempt.ok = value.ok === true;
  attempt.error = value.error ? String(value.error).slice(0, 120) : null;
  let completed=scope.ticket.provider_attempts.reduce(function(count,row){
    return count+(row&&row.completed_at ? 1 : 0);
  },0);
  while(completed>PROVIDER_TELEMETRY_ROWS){
    const index=scope.ticket.provider_attempts.findIndex(function(row){
      return !!(row&&row.completed_at);
    });
    if(index<0)break;
    scope.ticket.provider_attempts.splice(index,1);
    completed-=1;
  }
}

module.exports = {SCHEMA:SCHEMA,ensure:ensure,consume:consume,receipt:receipt,
  ensureProviderAllowance:ensureProviderAllowance,runProviderScope:runProviderScope,
  currentProviderScope:currentProviderScope,reserveProviderAttempt:reserveProviderAttempt,
  settleProviderAttempt:settleProviderAttempt,
  _test:{readBudgetCeiling:readBudgetCeiling,validTicket:validTicket,
    invalidTicket:invalidTicket,providerAllowanceValid:providerAllowanceValid,
    providerTarget:providerTarget,commitModelCall:commitModelCall,
    MODEL_TELEMETRY_ROWS:MODEL_TELEMETRY_ROWS,
    PROVIDER_TELEMETRY_ROWS:PROVIDER_TELEMETRY_ROWS}};
