// ⬡B:core.provider_spend_receipt:MODULE:durable_paid_attempt_truth:20260730⬡
// Provider-owned durable accounting at the one paid HTTP door. This module stores only
// mechanical transport facts: exact owner lineage, provider target, opaque digests, provider-
// reported usage, and terminal disposition. It never stores credentials, prompts, responses,
// or an invented price. The captured pre-boundary fetch is injected by provider.boundary so
// Memory Bank I/O cannot recurse through the global provider wrapper.
'use strict';

var crypto = require('node:crypto');
var brain = require('./brain.client.js');
var openrouterSeatSpend = require('./openrouter.seat.spend.js');

var TABLE = 'provider_spend_receipts';
var SCHEMA = 'anew.provider-spend-receipt.v1';
var CLAIM_RPC = 'claim_anew_provider_spend_intent';
var TERMINAL_RPC = 'write_anew_provider_spend_terminal';
var RECONCILE_RPC = 'reconcile_anew_provider_spend_unknown';
var MAX_STORE_BYTES = 4 * 1024 * 1024;
var MAX_RESPONSE_BYTES = 1024 * 1024;
var SUMMARY_LIMIT = 20001;
// ⬡B:core.provider_spend_receipt:LAW:a_no_maximum_ceiling_cannot_be_smuggled_through_a_coder_bound:20260801⬡
// CATHY (Codex) review, 20260801, on anew#1494: `core/ceiling.owner.js` and
// `core/spend.guard.js` now honestly report a daily call ceiling as EITHER a real founder
// number of ANY size, unclamped, OR `unlimited:true` (nothing configured, reported with the
// arithmetic edge because a downstream contract used to demand an integer rather than an
// absence). This claim function still hard rejected anything outside 1..10000, a coder
// literal from before that ceiling work existed. Net effect if left alone: every paid
// provider call would fail closed with provider_spend_ceiling_invalid the moment the founder
// removed his call ceiling (the whole point of that PR) or simply typed a real number above
// ten thousand. Two changes close it, both matching the migration in
// migrations/0008_provider_spend_unlimited_ceiling.sql:
//   1. `ceiling: null` paired with `unlimited: true` is now a legal, explicit "no ceiling"
//      input, passed to the RPC as SQL NULL rather than smuggled through as a giant integer.
//      The RPC skips its admission-count check entirely when the ceiling is null.
//   2. A real configured ceiling is checked against the SAME physical bound
//      `core/ceiling.owner.js` already publishes to: `Number.MAX_SAFE_INTEGER`.
//
// ⬡B:core.provider_spend_receipt:911:the_trap_came_back_one_layer_down:20260801⬡
// SECOND CATHY (Codex) review, same day: the FIRST version of this fix moved the bound from
// the coder-picked 10000 up to 2147483647, Postgres `integer`'s own physical max, and called
// that an arithmetic fact rather than a picked threshold. True of the STORAGE TYPE, and still
// wrong, because `core/ceiling.owner.js` publishes any safe JavaScript integer up to
// `Number.MAX_SAFE_INTEGER` (~9.007e15) as a real, enforced, founder-chosen number, not merely
// up to Postgres `integer`'s ~2.1e9. A founder who set `DAILY_MODEL_CALL_CEIL=4000000000` (4
// billion, comfortably inside what the guard reads and PUBLISHES as chosen_by:'the founder',
// enforced:true) would have had that exact value rejected here with
// provider_spend_ceiling_invalid: the identical trap this whole PR exists to kill, just one
// layer further down the stack than the first defect. THE FIX, this time aligning the STORAGE
// TYPE to the published range instead of moving the validator bound again: the RPC parameter
// (migrations/0008) is now `bigint`, not `integer`, comfortably covering the full
// `Number.MAX_SAFE_INTEGER` range, and this JS bound reads that exact constant from
// `core/ceiling.owner.js` rather than restating it, so the two ends cannot drift apart again
// silently. See `tests/provider.spend.receipt.durable.test.js` for the invariant test pinning
// this file's own accepted maximum against the guard's published edge.
var JS_SAFE_INTEGER_MAX = require('./ceiling.owner.js').EXACT_INTEGER_EDGE;
var SUMMARY_CACHE = null;

function clean(value) { return String(value == null ? '' : value).trim(); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function strictNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value.trim())) return null;
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function decimalCost(value) {
  var parsed=strictNumber(value);
  // JavaScript rounds the numeric(18,8) maximum string up to 10^10. Reject that
  // boundary before serializing so the terminal RPC can never overflow its SQL column.
  if(parsed===null||parsed>=10000000000)return null;
  return parsed.toFixed(8).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/,'$1')||'0';
}
function stableJson(value) {
  if(value===null)return'null';
  if(Array.isArray(value))return'['+value.map(stableJson).join(',')+']';
  if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+stableJson(value[key]);
  }).join(',')+'}';
  return JSON.stringify(value);
}
function identifier(value, maximum) {
  var text = clean(value);
  return text && text.length <= maximum && /^[A-Za-z0-9._:/-]+$/.test(text) ? text : null;
}
function exactHam(value) {
  var ham = identifier(value, 220);
  return ham ? ham.toUpperCase() : null;
}
function requestUrl(value) {
  return value && typeof value === 'object' && typeof value.url === 'string'
    ? value.url : String(value || '');
}
function parsedUrl(value) {
  try { return new URL(requestUrl(value)); } catch (error) { return null; }
}
function headerValue(init, name) {
  var headers = init && init.headers, wanted = String(name || '').toLowerCase(), value = '';
  if (headers && typeof headers.get === 'function') value = headers.get(name) || '';
  else if (Array.isArray(headers)) {
    var pair = headers.find(function (row) {
      return Array.isArray(row) && String(row[0]).toLowerCase() === wanted;
    });
    value = pair && pair[1] || '';
  } else if (headers && typeof headers === 'object') {
    var key = Object.keys(headers).find(function (item) { return item.toLowerCase() === wanted; });
    value = key ? headers[key] : '';
  }
  return clean(value);
}
// fal authenticates its canonical queue and sync endpoints as `Authorization: Key ...`.
// Treat Key as the same opaque transport credential form for alias matching; no value is
// ever persisted, and providers that use Bearer/Token keep their existing behavior.
function bearer(init) { return headerValue(init, 'authorization').replace(/^(?:Bearer|Token|Key)\s+/i, '').trim(); }
function sameSecret(left, right) {
  var a = Buffer.from(clean(left)), b = Buffer.from(clean(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function providerFor(url) {
  var parsed = parsedUrl(url);
  if (!parsed) return null;
  var host = parsed.hostname.toLowerCase();
  if (host === 'api.together.ai' || host === 'api.together.xyz') return 'together';
  if (host === 'openrouter.ai') return 'openrouter';
  if (host === 'api.anthropic.com') return 'anthropic';
  if (host === 'api.runpod.ai' || host === 'api.runpod.io') return 'runpod';
  if (host === 'api.elevenlabs.io') return 'elevenlabs';
  if (host === 'api.deepgram.com') return 'deepgram';
  if (host === 'fal.run' || host === 'queue.fal.run') return 'fal';
  if (host === 'api.replicate.com') return 'replicate';
  if (host === 'api.simli.ai') return 'simli';
  if (host === 'api.liveavatar.com') return 'liveavatar';
  return null;
}

function bodyFacts(init) {
  var body = init && init.body;
  var bytes = null, parsed = null;
  if (typeof body === 'string') bytes = Buffer.from(body);
  else if (Buffer.isBuffer(body) || body instanceof Uint8Array) bytes = Buffer.from(body);
  else if (body instanceof URLSearchParams) bytes = Buffer.from(body.toString());
  if (bytes && bytes.length <= MAX_RESPONSE_BYTES) {
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch (error) { parsed = null; }
  }
  return {parsed:parsed, digest:bytes ? sha(bytes) : null};
}

function providerModel(provider, parsed, body) {
  var model = body && (body.model || body.model_id || body.modelId || body.version);
  if (identifier(model, 240)) return {value:identifier(model, 240), source:'request_body'};
  var queryModel = parsed && parsed.searchParams.get('model');
  if (identifier(queryModel, 240)) return {value:identifier(queryModel, 240), source:'request_query'};
  var path = parsed && parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return null;
  // These providers name the paid product/model in the submission route itself. Persist the
  // exact route segment instead of fabricating a catalog name that the provider never sent.
  if (provider === 'runpod' || provider === 'fal' || provider === 'replicate' ||
      provider === 'elevenlabs' || provider === 'simli' || provider === 'liveavatar') {
    return {value:identifier(provider + ':' + path, 240), source:'provider_route'};
  }
  return null;
}

var PROVIDER_ENV = {
  together:/^TOGETHER[A-Z0-9_]*(?:KEY|TOKEN)$/,
  anthropic:/^ANTHROPIC[A-Z0-9_]*(?:KEY|TOKEN)$/,
  runpod:/^RUNPOD[A-Z0-9_]*(?:KEY|TOKEN)$/,
  elevenlabs:/^(?:ELEVENLABS|XI)[A-Z0-9_]*(?:KEY|TOKEN)$/,
  deepgram:/^DEEPGRAM[A-Z0-9_]*(?:KEY|TOKEN)$/,
  fal:/^FAL[A-Z0-9_]*(?:KEY|TOKEN)$/,
  replicate:/^REPLICATE[A-Z0-9_]*(?:KEY|TOKEN)$/,
  simli:/^SIMLI[A-Z0-9_]*(?:KEY|TOKEN)$/,
  liveavatar:/^(?:LIVEAVATAR|HEYGEN)[A-Z0-9_]*(?:KEY|TOKEN)$/
};

function requestCredential(provider, init, parsed) {
  if (provider === 'anthropic') return headerValue(init, 'x-api-key');
  if (provider === 'elevenlabs') return headerValue(init, 'xi-api-key') || bearer(init);
  if (provider === 'simli' || provider === 'liveavatar') {
    var direct = headerValue(init, 'x-api-key') || headerValue(init, 'api-key') || bearer(init);
    if (direct || provider !== 'simli') return direct;
    // Simli's canonical session-mint contract carries apiKey inside its JSON body instead of
    // an authentication header. Read it only for constant-time env alias matching; the value
    // is never copied into a receipt, log, error, or response. The request body retains the
    // same opaque whole-body digest semantics used for every other provider request.
    var facts = bodyFacts(init);
    return clean(facts.parsed && facts.parsed.apiKey);
  }
  var token = bearer(init);
  if (!token && parsed) token = parsed.searchParams.get('api_key') || parsed.searchParams.get('token') || '';
  return clean(token);
}

function keyAlias(provider, init, parsed, attribution, env) {
  var runtime = env || process.env;
  var secret = requestCredential(provider, init, parsed);
  if (!secret) return {ok:false,reason:'provider_spend_key_alias_missing'};
  if (provider === 'openrouter') {
    var owner = openrouterSeatSpend.keyOwner(secret, runtime);
    if (!owner.ok) return {ok:false,reason:owner.reason};
    var ambientSeat = clean(attribution && attribution.seat).replace(/\.fallback$/, '');
    if (!ambientSeat || ambientSeat !== owner.seat.seat) {
      return {ok:false,reason:'provider_spend_seat_owner_mismatch'};
    }
    return {ok:true,value:'seat.' + owner.seat.seat};
  }
  var pattern = PROVIDER_ENV[provider];
  if (!pattern) return {ok:false,reason:'provider_spend_attribution_adapter_missing'};
  var matches = Object.keys(runtime).filter(function (name) {
    return pattern.test(name) && sameSecret(secret, runtime[name]);
  });
  if (matches.length !== 1) return {ok:false,reason:matches.length > 1
    ? 'provider_spend_key_alias_ambiguous' : 'provider_spend_key_alias_missing'};
  return {ok:true,value:'env.' + matches[0].toLowerCase()};
}

function prepare(spec) {
  var input = spec || {}, attribution = input.attribution || {};
  var parsed = parsedUrl(input.url), provider = providerFor(input.url);
  if (!parsed || !provider) return {ok:false,reason:'provider_spend_attribution_adapter_missing'};
  var required = {
    ham_uid:exactHam(attribution.ham_uid),
    cycle_id:identifier(attribution.cycle_id, 220),
    request_id:identifier(attribution.request_id, 220),
    component:identifier(attribution.component, 160),
    owner_node_id:identifier(attribution.owner_node_id, 160),
    target_wonder_id:identifier(attribution.target_wonder_id, 160),
    service_id:identifier(attribution.service_id, 160)
  };
  var missing = Object.keys(required).find(function (name) { return !required[name]; });
  if (missing) return {ok:false,reason:'provider_spend_attribution_missing_' + missing};
  var attemptOrder = Number(input.attempt_order);
  if (!Number.isInteger(attemptOrder) || attemptOrder < 1 || attemptOrder > 10000) {
    return {ok:false,reason:'provider_spend_attribution_missing_attempt_order'};
  }
  var body = bodyFacts(input.init);
  var model = providerModel(provider, parsed, body.parsed);
  if (!model) return {ok:false,reason:'provider_spend_attribution_missing_model'};
  var alias = keyAlias(provider, input.init, parsed, attribution, input.env);
  if (!alias.ok) return alias;
  var kind = identifier(input.kind, 32);
  if (!kind) return {ok:false,reason:'provider_spend_attribution_missing_kind'};
  var method = identifier(input.init && input.init.method || 'GET', 16);
  var operation = identifier(method + ':' + parsed.pathname.replace(/\/+$/, ''), 260);
  if (!operation) return {ok:false,reason:'provider_spend_attribution_missing_operation'};
  var identity = [SCHEMA, required.ham_uid, required.request_id, required.component,
    provider, operation, model.value, alias.value, String(attemptOrder), kind].join('|');
  var requestDigest = body.digest || sha(identity + '|opaque-request-body');
  return {ok:true,receipt:Object.assign({schema:SCHEMA,attempt_id:sha(identity),
    attempt_order:attemptOrder,provider:provider,operation:operation,model:model.value,
    model_source:model.source,key_alias:alias.value,kind:kind,request_digest:requestDigest},required)};
}

function bankConfig(env) {
  var runtime = env || process.env;
  var url = clean(runtime.MEMORY_BANK_URL || runtime.AIBE_BRAIN_URL).replace(/\/$/, '');
  var key = clean(runtime.MEMORY_BANK_KEY || runtime.AIBE_BRAIN_KEY);
  var schema = clean(runtime.BRAIN_SCHEMA || (runtime.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'));
  return {url:url,key:key,schema:schema,ok:!!(url && key && identifier(schema, 80))};
}
function readHeaders(config) {
  var out = {apikey:config.key,Authorization:'Bearer ' + config.key};
  out['Accept-Profile'] = config.schema;
  return out;
}
function rpcHeaders(config) {
  return {apikey:config.key,Authorization:'Bearer ' + config.key,
    'Content-Type':'application/json'};
}
function fetchImpl(options) {
  return options && typeof options.fetchImpl === 'function' ? options.fetchImpl
    : (typeof fetch === 'function' ? fetch : null);
}
async function boundedJson(response, maximum) {
  var declared = Number(response && response.headers && response.headers.get &&
    response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) throw new Error('provider_spend_store_response_too_large');
  if (!response || !response.body || typeof response.body.getReader !== 'function') {
    var text = await response.text();
    if (Buffer.byteLength(text) > maximum) throw new Error('provider_spend_store_response_too_large');
    return text ? JSON.parse(text) : [];
  }
  var reader = response.body.getReader(), chunks = [], total = 0;
  while (true) {
    var part = await reader.read();
    if (part.done) break;
    var chunk = Buffer.from(part.value);
    total += chunk.length;
    if (total > maximum) {
      try { await reader.cancel(); } catch (cancelError) {}
      throw new Error('provider_spend_store_response_too_large');
    }
    chunks.push(chunk);
  }
  var raw = Buffer.concat(chunks, total).toString('utf8');
  return raw ? JSON.parse(raw) : [];
}
function reconcileGraceSeconds(env) {
  var raw = clean((env || process.env).PROVIDER_SPEND_UNRESOLVED_GRACE_SECONDS);
  if (!raw) return 120;
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  var seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds <= 3600 ? seconds : null;
}
function phaseRow(receipt, phase, outcome) {
  var result = outcome || {};
  return {
    attempt_id:receipt.attempt_id,phase:phase,ham_uid:receipt.ham_uid,
    cycle_id:receipt.cycle_id,request_id:receipt.request_id,component:receipt.component,
    owner_node_id:receipt.owner_node_id,target_wonder_id:receipt.target_wonder_id,
    service_id:receipt.service_id,provider:receipt.provider,operation:receipt.operation,
    model:receipt.model,model_source:receipt.model_source,key_alias:receipt.key_alias,
    attempt_order:receipt.attempt_order,kind:receipt.kind,request_digest:receipt.request_digest,
    response_digest:result.response_digest || null,provider_request_id:result.provider_request_id || null,
    status_code:Number.isInteger(result.status_code) ? result.status_code : null,
    provider_tokens:result.provider_tokens || null,
    actual_cost_usd:decimalCost(result.actual_cost_usd),
    cost_source:result.cost_source || null,disposition:result.disposition ||
      (phase === 'INTENT' ? 'INTENT_COMMITTED' : null)
  };
}
async function readPhase(attemptId, phase, options) {
  var config = bankConfig(options && options.env), doFetch = fetchImpl(options);
  if (!config.ok || !doFetch) return {ok:false,reason:'provider_spend_store_unavailable'};
  var query = new URLSearchParams({attempt_id:'eq.' + attemptId,phase:'eq.' + phase,limit:'2'});
  var response;
  try {
    response = await doFetch(config.url + '/rest/v1/' + TABLE + '?' + query.toString(), {
      headers:readHeaders(config),signal:brain.boundedSignal(options && options.signal, options && options.env)
    });
  } catch (error) { return {ok:false,reason:'provider_spend_store_unavailable'}; }
  if (!response || response.ok !== true) return {ok:false,reason:response &&
    (response.status === 404 || response.status === 400) ? 'provider_spend_schema_unavailable'
      : 'provider_spend_readback_failed'};
  try {
    var rows = await boundedJson(response, MAX_STORE_BYTES);
    if (!Array.isArray(rows) || rows.length !== 1) return {ok:false,
      reason:rows && rows.length > 1 ? 'provider_spend_readback_ambiguous' : 'provider_spend_readback_missing'};
    return {ok:true,row:rows[0]};
  } catch (error) { return {ok:false,reason:'provider_spend_store_readback_invalid'}; }
}
async function rpcCall(name, body, options, failureReason) {
  var config = bankConfig(options && options.env), doFetch = fetchImpl(options);
  if (!config.ok || !doFetch) return {ok:false,reason:'provider_spend_store_unavailable'};
  var response;
  try {
    response = await doFetch(config.url + '/rest/v1/rpc/' + name, {
      method:'POST',headers:rpcHeaders(config),body:JSON.stringify(body),
      signal:brain.boundedSignal(options && options.signal, options && options.env)
    });
  } catch (error) { return {ok:false,reason:'provider_spend_store_unavailable'}; }
  if (!response || response.ok !== true) return {ok:false,reason:response &&
    (response.status === 404 || response.status === 400) ? 'provider_spend_schema_unavailable'
      : failureReason};
  try { return {ok:true,payload:await boundedJson(response,MAX_STORE_BYTES)}; }
  catch (error) { return {ok:false,reason:'provider_spend_store_readback_invalid'}; }
}
function sameIdentity(row, expected) {
  return ['attempt_id','phase','ham_uid','cycle_id','request_id','component','owner_node_id',
    'target_wonder_id','service_id','provider','operation','model','model_source','key_alias',
    'kind','request_digest','disposition'].every(function (key) {
      return clean(row && row[key]) === clean(expected && expected[key]);
    }) && Number(row && row.attempt_order) === Number(expected && expected.attempt_order);
}
function sameTerminal(row, expected) {
  if (!sameIdentity(row, expected)) return false;
  if (Number(row.status_code || 0) !== Number(expected.status_code || 0)) return false;
  if (clean(row.response_digest) !== clean(expected.response_digest) ||
      clean(row.provider_request_id) !== clean(expected.provider_request_id) ||
      clean(row.cost_source) !== clean(expected.cost_source)) return false;
  var leftCost = strictNumber(row.actual_cost_usd), rightCost = strictNumber(expected.actual_cost_usd);
  if (leftCost !== rightCost) return false;
  return stableJson(row.provider_tokens || null) === stableJson(expected.provider_tokens || null);
}

async function claimIntent(receipt, options) {
  var row = phaseRow(receipt, 'INTENT');
  var opts = options || {};
  // ⬡B:core.provider_spend_receipt:FIX:unlimited_must_be_declared_never_inferred_from_a_blank:20260801⬡
  // `ceiling` may be null ONLY when the caller also sets `unlimited: true`. A caller that
  // forgets to pass a ceiling at all (a bug, not a decision) supplies `undefined` with no
  // `unlimited` flag, and that still refuses below exactly as before. This keeps "no ceiling
  // configured" and "caller passed nothing" from ever reading as the same thing.
  var unlimited = opts.ceiling === null && opts.unlimited === true;
  var limit = unlimited ? null : Number(opts.ceiling);
  var grace = reconcileGraceSeconds(opts.env);
  if (!unlimited && (!Number.isInteger(limit) || limit < 1 || limit > JS_SAFE_INTEGER_MAX)) {
    return {ok:false,reason:'provider_spend_ceiling_invalid'};
  }
  if (!Number.isInteger(grace)) return {ok:false,reason:'provider_spend_reconcile_grace_invalid'};
  var claimed = await rpcCall(CLAIM_RPC,{p_receipt:row,p_ceiling:limit},
    options,'provider_spend_intent_write_failed');
  if (!claimed.ok) {
    // A response can be lost after Postgres committed. Read back only to identify that
    // crash window; it remains a refusal because resending provider traffic is forbidden.
    var afterLostAck = await readPhase(receipt.attempt_id,'INTENT',options);
    if (afterLostAck.ok && sameIdentity(afterLostAck.row,row)) {
      return {ok:false,reason:'provider_spend_intent_ack_lost'};
    }
    return claimed;
  }
  var payload = claimed.payload;
  var ceilingMatches = unlimited
    ? (payload && payload.ceiling === null)
    : Number(payload && payload.ceiling) === limit;
  if (!payload || payload.ok !== true || clean(payload.attempt_id) !== receipt.attempt_id ||
      !Number.isInteger(Number(payload.admissions)) || !ceilingMatches) {
    return {ok:false,reason:'provider_spend_intent_readback_mismatch'};
  }
  if (payload.admitted !== true) {
    if (payload.reason === 'daily_spend_ceiling_reached') return {ok:false,
      reason:'daily_spend_ceiling_reached',admissions:Number(payload.admissions),ceiling:limit};
    if (payload.duplicate === true) return {ok:false,
      reason:'provider_spend_attempt_already_admitted'};
    return {ok:false,reason:'provider_spend_attempt_state_uncertain'};
  }
  var readback = await readPhase(receipt.attempt_id, 'INTENT', options);
  if (!readback.ok) return readback;
  if (!sameIdentity(readback.row, row)) return {ok:false,reason:'provider_spend_intent_readback_mismatch'};
  return {ok:true,row:readback.row,admissions:Number(payload.admissions),ceiling:limit};
}

async function writeTerminal(receipt, outcome, options) {
  var row = phaseRow(receipt, 'TERMINAL', outcome);
  var written = await rpcCall(TERMINAL_RPC,{p_terminal:row},options,
    'provider_spend_terminal_write_failed');
  if (!written.ok) {
    // A terminal acknowledgment may be lost after commit. Exact independent readback can
    // recover the mechanical outcome without repeating the provider request.
    var recovered = await readPhase(receipt.attempt_id,'TERMINAL',options);
    if (recovered.ok && sameTerminal(recovered.row,row)) {
      return {ok:true,row:recovered.row,replayed:true,recovered_ack:true};
    }
    return written;
  }
  var payload = written.payload;
  if (!payload || payload.ok !== true || payload.stored !== true ||
      clean(payload.attempt_id) !== receipt.attempt_id) {
    return {ok:false,reason:identifier(payload&&payload.reason,160)||
      'provider_spend_terminal_readback_mismatch'};
  }
  var readback = await readPhase(receipt.attempt_id, 'TERMINAL', options);
  if (!readback.ok) return readback;
  if (!sameTerminal(readback.row, row)) {
    return {ok:false,reason:'provider_spend_terminal_readback_mismatch'};
  }
  return {ok:true,row:readback.row,replayed:payload.inserted !== true};
}

async function reconcileUnresolved(receipt, options) {
  var grace = reconcileGraceSeconds(options && options.env);
  if (!Number.isInteger(grace)) return {ok:false,reason:'provider_spend_reconcile_grace_invalid'};
  var result = await rpcCall(RECONCILE_RPC,{p_ham_uid:receipt.ham_uid,
    p_cycle_id:receipt.cycle_id,p_request_id:receipt.request_id,p_grace_seconds:grace},
  options,'provider_spend_reconcile_failed');
  if (!result.ok) return result;
  var payload = result.payload;
  if (!payload || payload.ok !== true || clean(payload.ham_uid) !== receipt.ham_uid ||
      clean(payload.cycle_id) !== receipt.cycle_id || clean(payload.request_id) !== receipt.request_id ||
      !Number.isInteger(Number(payload.unresolved)) ||
      !Number.isInteger(Number(payload.resolved_unknown)) ||
      !Number.isInteger(Number(payload.outcome_unknown)) ||
      typeof payload.stale_remaining !== 'boolean') {
    return {ok:false,reason:'provider_spend_reconcile_readback_mismatch'};
  }
  return {ok:true,unresolved:Number(payload.unresolved),
    resolved_unknown:Number(payload.resolved_unknown),outcome_unknown:Number(payload.outcome_unknown),
    stale_remaining:payload.stale_remaining};
}

async function responseBytes(response, maximum) {
  var clone;
  try { clone = response.clone(); } catch (error) { return null; }
  var declared = Number(clone.headers && clone.headers.get && clone.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) {
    if(clone.body&&typeof clone.body.cancel==='function')clone.body.cancel().catch(function(){});
    return null;
  }
  if (!clone.body) return Buffer.alloc(0);
  if (typeof clone.body.getReader !== 'function') return null;
  var reader = clone.body.getReader(), chunks = [], total = 0;
  try {
    while (true) {
      var part = await reader.read();
      if (part.done) break;
      var chunk = Buffer.from(part.value);
      total += chunk.length;
      if (total > maximum) {
        // A cloned Web stream is a tee. Awaiting cancel waits for the untouched caller
        // branch, but that branch cannot be returned until accounting finishes. Fire the
        // cancellation without joining it so an oversized receipt body cannot deadlock and
        // strand its paid INTENT.
        reader.cancel().catch(function(){});
        return null;
      }
      chunks.push(chunk);
    }
  } catch (error) { try { reader.cancel().catch(function(){}); } catch (cancelError) {} return null; }
  return Buffer.concat(chunks, total);
}
function replayResponse(response, bytes) {
  if (!bytes || typeof Response !== 'function') return null;
  var status = response && Number.isInteger(response.status) ? response.status : 200;
  var body = status === 204 || status === 205 || status === 304 ? null : bytes;
  try {
    return new Response(body,{status:status,statusText:String(response && response.statusText || ''),
      headers:response && response.headers});
  } catch (error) { return null; }
}
function usageFacts(body) {
  var usage = body && body.usage;
  if (!usage || typeof usage !== 'object') return {tokens:null,cost:null,costSource:null};
  var input = strictNumber(usage.prompt_tokens != null ? usage.prompt_tokens : usage.input_tokens);
  var output = strictNumber(usage.completion_tokens != null ? usage.completion_tokens : usage.output_tokens);
  var total = strictNumber(usage.total_tokens);
  var tokens = (input === null && output === null && total === null) ? null : {
    input_tokens:input,output_tokens:output,total_tokens:total
  };
  var cost = strictNumber(usage.cost);
  if (cost === null && usage.cost_details && typeof usage.cost_details === 'object') {
    cost = strictNumber(usage.cost_details.upstream_inference_cost);
  }
  return {tokens:tokens,cost:cost,costSource:cost === null ? null : 'provider_reported'};
}
async function captureTerminalResponse(response, options) {
  var bytes = await responseBytes(response, Number(options && options.maxResponseBytes) || MAX_RESPONSE_BYTES);
  var body = null;
  if (bytes) { try { body = JSON.parse(bytes.toString('utf8')); } catch (error) { body = null; } }
  var usage = usageFacts(body);
  var providerRequestId = headerValue({headers:response && response.headers}, 'x-generation-id') ||
    headerValue({headers:response && response.headers}, 'x-request-id') ||
    headerValue({headers:response && response.headers}, 'request-id') || null;
  return {outcome:{status_code:response && Number.isInteger(response.status) ? response.status : null,
    disposition:response && response.ok === true ? 'SUCCEEDED' : 'HTTP_ERROR',
    response_digest:bytes ? sha(bytes) : null,provider_request_id:identifier(providerRequestId, 240),
    provider_tokens:usage.tokens,actual_cost_usd:usage.cost,cost_source:usage.costSource},
    response:replayResponse(response,bytes)};
}
async function terminalFromResponse(response, options) {
  return (await captureTerminalResponse(response,options)).outcome;
}
function terminalFromError(error) {
  // A rejected fetch does not prove whether the provider accepted bytes before the socket
  // failed. The transport fact is terminal, but the provider outcome is not knowable.
  return {status_code:null,disposition:'OUTCOME_UNKNOWN',response_digest:null,
    provider_request_id:null,provider_tokens:null,actual_cost_usd:null,cost_source:null,
    error_class:identifier(error && error.name || 'Error', 80)};
}

function publicComponent(value) {
  var root = clean(value).split('.')[0].toLowerCase();
  return identifier(root, 40) || 'unattributed';
}
function buckets(rows, key, transform) {
  var counts = {};
  rows.forEach(function (row) {
    var value = transform ? transform(row[key]) : clean(row[key]) || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.keys(counts).map(function (owner) { return {owner:owner,count:counts[owner]}; })
    .sort(function (a,b) { return b.count-a.count || a.owner.localeCompare(b.owner); }).slice(0,24);
}
async function readSummary(options) {
  var requestedScope = options && options.scope && typeof options.scope === 'object'
    ? options.scope : null;
  var scope = {};
  ['ham_uid','key_alias','component','service_id'].forEach(function(field) {
    var value = clean(requestedScope && requestedScope[field]);
    if (value) scope[field] = value;
  });
  var scoped = Object.keys(scope).length > 0;
  function publish(summary) {
    if (!scoped) SUMMARY_CACHE = summary;
    return summary;
  }
  var config = bankConfig(options && options.env), doFetch = fetchImpl(options);
  if (!config.ok || !doFetch) {
    return publish({readable:false,total:null,
      reason:'provider_spend_store_unavailable',at:Date.now()});
  }
  var since = new Date(Number(options && options.now || Date.now()) - 86400000).toISOString();
  var query = new URLSearchParams({created_at:'gte.' + since,
    select:'attempt_id,phase,provider,kind,key_alias,component,ham_uid,service_id,disposition,status_code,created_at',
    order:'created_at.asc',limit:String(SUMMARY_LIMIT)});
  var response;
  try {
    response = await doFetch(config.url + '/rest/v1/' + TABLE + '?' + query.toString(), {
      headers:readHeaders(config),signal:brain.boundedSignal(options && options.signal, options && options.env)
    });
  } catch (error) {
    return publish({readable:false,total:null,
      reason:'provider_spend_store_unavailable',at:Date.now()});
  }
  if (!response || response.ok !== true) {
    return publish({readable:false,total:null,reason:response &&
      (response.status === 404 || response.status === 400) ? 'provider_spend_schema_unavailable'
        : 'provider_spend_summary_read_failed',at:Date.now()});
  }
  try {
    var rows = await boundedJson(response, MAX_STORE_BYTES);
    if (!Array.isArray(rows) || rows.length >= SUMMARY_LIMIT) throw new Error('provider_spend_summary_limit_exceeded');
    var scopedRows = scoped ? rows.filter(function(row) {
      return Object.keys(scope).every(function(field) {
        return clean(row && row[field]) === scope[field];
      });
    }) : rows;
    var intents = scopedRows.filter(function(row){return row && row.phase === 'INTENT';});
    var terminals = scopedRows.filter(function(row){return row && row.phase === 'TERMINAL';});
    var terminalByAttempt = new Map();
    terminals.forEach(function(row){terminalByAttempt.set(clean(row.attempt_id),row);});
    var succeeded = terminals.filter(function(row){return row.disposition === 'SUCCEEDED';}).length;
    var outcomeUnknown = terminals.filter(function(row){return row.disposition === 'OUTCOME_UNKNOWN';}).length;
    var failed = terminals.filter(function(row){return row.disposition !== 'SUCCEEDED' &&
      row.disposition !== 'OUTCOME_UNKNOWN';}).length;
    var provenEgress = terminals.filter(function(row){return row.disposition === 'SUCCEEDED' ||
      row.disposition === 'HTTP_ERROR';}).length;
    var unresolved = intents.filter(function(row){return !terminalByAttempt.has(clean(row.attempt_id));}).length;
    function latestAt(list) {
      var values = list.map(function(row){return Date.parse(row && row.created_at || '');})
        .filter(Number.isFinite);
      return values.length ? new Date(Math.max.apply(Math, values)).toISOString() : null;
    }
    var unknownRows = terminals.filter(function(row){return row.disposition === 'OUTCOME_UNKNOWN';});
    var unresolvedRows = intents.filter(function(row){return !terminalByAttempt.has(clean(row.attempt_id));});
    return publish({readable:true,total:intents.length,admissions:intents.length,
      terminal:terminals.length,succeeded:succeeded,failed:failed,unresolved:unresolved,
      outcome_unknown:outcomeUnknown,proven_egress:provenEgress,
      latest_outcome_unknown_at:latestAt(unknownRows),
      latest_unresolved_at:latestAt(unresolvedRows),
      scope:Object.keys(scope).length ? scope : null,
      window_hours:24,reason:null,at:Date.now(),
      by_provider:buckets(intents,'provider'),by_kind:buckets(intents,'kind'),
      by_component:buckets(intents,'component',publicComponent),
      by_key_alias:buckets(intents,'key_alias')});
  } catch (error) {
    return publish({readable:false,total:null,
      reason:String(error && error.message || error),at:Date.now()});
  }
}
function cachedSummary() {
  return SUMMARY_CACHE ? Object.assign({}, SUMMARY_CACHE)
    : {readable:false,total:null,reason:'provider_spend_summary_not_read_in_this_process',at:null};
}

module.exports = {TABLE:TABLE,SCHEMA:SCHEMA,prepare:prepare,claimIntent:claimIntent,
  JS_SAFE_INTEGER_MAX:JS_SAFE_INTEGER_MAX,
  writeTerminal:writeTerminal,terminalFromResponse:terminalFromResponse,
  captureTerminalResponse:captureTerminalResponse,
  terminalFromError:terminalFromError,reconcileUnresolved:reconcileUnresolved,
  readSummary:readSummary,cachedSummary:cachedSummary,
  _test:{providerFor:providerFor,bodyFacts:bodyFacts,providerModel:providerModel,keyAlias:keyAlias,
    bankConfig:bankConfig,phaseRow:phaseRow,readPhase:readPhase,decimalCost:decimalCost,
    stableJson:stableJson,
    boundedJson:boundedJson,usageFacts:usageFacts,responseBytes:responseBytes,
    replayResponse:replayResponse,
    reconcileGraceSeconds:reconcileGraceSeconds,rpcCall:rpcCall,
    reset:function () { SUMMARY_CACHE=null; }}};
