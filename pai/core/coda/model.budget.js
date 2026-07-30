// ⬡B:core.coda.model_budget:MODULE:one_shared_paid_deliberation_budget:20260725⬡
// entered via the ABAHAM door, serving channel internal
//
// Every paid CODA deliberation in one operational cycle shares this mutable
// ticket. Priority, lead correction, and patch authorship cannot each reopen a
// private allowance. Cold code counts calls and stops at the boundary; PAI owns
// every judgment made inside an admitted call.
'use strict';

const {AsyncLocalStorage} = require('node:async_hooks');

const SCHEMA = 'great-reset.coda-model-budget.v1';
const providerScope = new AsyncLocalStorage();

function boundedMax(value, fallback) {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? Math.floor(parsed) : Number(fallback || 2);
  return Math.max(1, Math.min(12, base));
}

function boundedProviderMax(value, fallback) {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? Math.floor(parsed) : Number(fallback || 12);
  return Math.max(1, Math.min(24, base));
}

function validTicket(value) {
  if (!value || typeof value !== 'object' || value.schema !== SCHEMA) return false;
  const max = Number(value.max_llm_calls);
  const remaining = Number(value.remaining_llm_calls);
  const used = Number(value.used_llm_calls);
  return Number.isInteger(max) && max >= 1 && max <= 12 &&
    Number.isInteger(remaining) && remaining >= 0 && remaining <= max &&
    Number.isInteger(used) && used >= 0 && used <= max && used + remaining === max &&
    Array.isArray(value.calls) && value.calls.length <= used;
}

function invalidTicket() {
  return {schema:SCHEMA,max_llm_calls:0,remaining_llm_calls:0,used_llm_calls:0,
    calls:[],max_paid_provider_attempts:0,remaining_paid_provider_attempts:0,
    used_paid_provider_attempts:0,provider_attempts:[],
    invalid_reason:'model_call_budget_invalid'};
}

function providerAllowanceValid(ticket, cap) {
  if (!validTicket(ticket)) return false;
  const max = Number(ticket.max_paid_provider_attempts);
  const remaining = Number(ticket.remaining_paid_provider_attempts);
  const used = Number(ticket.used_paid_provider_attempts);
  return Number.isInteger(max) && max >= 1 && max <= cap &&
    Number.isInteger(remaining) && remaining >= 0 && remaining <= max &&
    Number.isInteger(used) && used >= 0 && used <= max && used + remaining === max &&
    Array.isArray(ticket.provider_attempts) && ticket.provider_attempts.length <= used;
}

function ensureProviderAllowance(ticket, env, fallback) {
  if (!validTicket(ticket)) return {ok:false,reason:'model_call_budget_invalid'};
  const runtime = env || process.env;
  const cap = boundedProviderMax(runtime.CODA_PAID_PROVIDER_ATTEMPT_BUDGET, fallback || 12);
  const fields = ['max_paid_provider_attempts','remaining_paid_provider_attempts',
    'used_paid_provider_attempts','provider_attempts'];
  const present = fields.filter(function(key) { return ticket[key] !== undefined; });
  if (!present.length) {
    ticket.max_paid_provider_attempts = cap;
    ticket.remaining_paid_provider_attempts = cap;
    ticket.used_paid_provider_attempts = 0;
    ticket.provider_attempts = [];
  } else if (present.length !== fields.length || !providerAllowanceValid(ticket, cap)) {
    return {ok:false,reason:'paid_provider_attempt_budget_invalid'};
  }
  return {ok:true,ticket:ticket,cap:cap};
}

function ensure(existing, fallback, env) {
  const runtime = env || process.env;
  if (existing != null) {
    if (!validTicket(existing)) return invalidTicket();
    const existingProvider = ensureProviderAllowance(existing, runtime, 12);
    return existingProvider.ok ? existing : invalidTicket();
  }
  const max = boundedMax(runtime.CODA_MODEL_CALL_BUDGET, fallback || 2);
  const ticket = {schema:SCHEMA,max_llm_calls:max,remaining_llm_calls:max,
    used_llm_calls:0,calls:[]};
  ensureProviderAllowance(ticket, runtime, 12);
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
    if (Number(budget.remaining_llm_calls) - pending.length <= 0) {
      return {ok:false,reason:'model_call_budget_exhausted'};
    }
    pending.push({purpose:String(purpose || 'coda.deliberation').slice(0,120),
      at:now || new Date().toISOString()});
    scope.pending_model_purposes = pending;
    return {ok:true,pending_provider_call:true,
      remaining_llm_calls:Number(budget.remaining_llm_calls) - pending.length};
  }
  return commitModelCall(budget,purpose,now);
}

function commitModelCall(budget, purpose, now) {
  if (!validTicket(budget)) return {ok:false,reason:'model_call_budget_invalid'};
  const remaining = Number(budget.remaining_llm_calls);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return {ok:false,reason:'model_call_budget_exhausted'};
  }
  budget.remaining_llm_calls = remaining - 1;
  budget.used_llm_calls = Number(budget.used_llm_calls || 0) + 1;
  if (!Array.isArray(budget.calls)) budget.calls = [];
  budget.calls.push({purpose:String(purpose || 'coda.deliberation').slice(0, 120),
    at:now || new Date().toISOString()});
  return {ok:true,remaining_llm_calls:budget.remaining_llm_calls};
}

function receipt(budget) {
  if (!validTicket(budget)) return {schema:SCHEMA,valid:false,
    reason:'model_call_budget_invalid',max_llm_calls:0,used_llm_calls:0,
    remaining_llm_calls:0,calls:[]};
  const value = budget;
  const out = {schema:SCHEMA,max_llm_calls:Number(value.max_llm_calls || 0),
    used_llm_calls:Number(value.used_llm_calls || 0),
    remaining_llm_calls:Number(value.remaining_llm_calls || 0),
    calls:(value.calls || []).map(function(call) {
      return {purpose:String(call && call.purpose || '').slice(0, 120),
        at:call && call.at || null};
    }).slice(0, 20)};
  if (Number.isInteger(value.max_paid_provider_attempts)) {
    out.max_paid_provider_attempts = Number(value.max_paid_provider_attempts);
    out.used_paid_provider_attempts = Number(value.used_paid_provider_attempts || 0);
    out.remaining_paid_provider_attempts = Number(value.remaining_paid_provider_attempts || 0);
    out.provider_attempts = (value.provider_attempts || []).map(function(attempt) {
      return {attempt:Number(attempt.attempt || 0),component:String(attempt.component || '').slice(0, 120),
        intent_source:String(attempt.intent_source || '').slice(0, 240),
        provider_host:String(attempt.provider_host || '').slice(0, 160),
        path:String(attempt.path || '').slice(0, 240),purpose:String(attempt.purpose || '').slice(0, 120),
        started_at:attempt.started_at || null,completed_at:attempt.completed_at || null,
        status_code:Number.isFinite(Number(attempt.status_code)) ? Number(attempt.status_code) : null,
        ok:attempt.ok === true,error:attempt.error || null};
    }).slice(0, 24);
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
  const prepared = ensureProviderAllowance(ticket, env || process.env, 12);
  if (!prepared.ok) return {ok:false,reason:prepared.reason};
  const meta = metadata || {};
  const scopeValue={ticket:ticket,
      cap:active ? Math.min(Number(active.cap),prepared.cap) : prepared.cap,
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
  if (scope.ticket.remaining_paid_provider_attempts <= 0) {
    return {ok:false,scoped:true,reason:'paid_provider_attempt_budget_exhausted'};
  }
  if (scope.count_model_calls === true) {
    const pending = Array.isArray(scope.pending_model_purposes)
      ? scope.pending_model_purposes.shift() : null;
    const counted = commitModelCall(scope.ticket,
      pending && pending.purpose || spec && spec.purpose || 'paid_provider.fetch',
      pending && pending.at || now);
    if (!counted.ok) {
      return {ok:false,scoped:true,reason:counted.reason === 'model_call_budget_exhausted'
        ? 'paid_provider_attempt_budget_exhausted' : 'paid_provider_attempt_budget_invalid'};
    }
  }
  const target = providerTarget(spec && spec.url);
  scope.ticket.remaining_paid_provider_attempts -= 1;
  scope.ticket.used_paid_provider_attempts += 1;
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
}

module.exports = {SCHEMA:SCHEMA,ensure:ensure,consume:consume,receipt:receipt,
  ensureProviderAllowance:ensureProviderAllowance,runProviderScope:runProviderScope,
  currentProviderScope:currentProviderScope,reserveProviderAttempt:reserveProviderAttempt,
  settleProviderAttempt:settleProviderAttempt,
  _test:{boundedMax:boundedMax,boundedProviderMax:boundedProviderMax,validTicket:validTicket,
    invalidTicket:invalidTicket,providerAllowanceValid:providerAllowanceValid,
    providerTarget:providerTarget,commitModelCall:commitModelCall}};
