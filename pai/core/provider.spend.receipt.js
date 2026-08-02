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
var RECONCILIATION_TABLE = 'provider_spend_reconciliations';
var USAGE_RECONCILIATION_TABLE = 'provider_spend_usage_reconciliations';
var PROVIDER_STATEMENT_TABLE = 'provider_account_statements';
var BILLABLE_TABLE = 'provider_spend_receipts_billable';
var SCHEMA = 'anew.provider-spend-receipt.v1';
var CLAIM_RPC = 'claim_anew_provider_spend_intent';
var TERMINAL_RPC = 'write_anew_provider_spend_terminal';
var RECONCILE_RPC = 'reconcile_anew_provider_spend_unknown';
var PROVIDER_FACT_RPC = 'write_anew_provider_spend_reconciliation';
var PROVIDER_USAGE_RPC = 'write_anew_provider_spend_usage_reconciliation';
var PROVIDER_STATEMENT_RPC = 'append_anew_provider_account_statement';
var MAX_STORE_BYTES = 4 * 1024 * 1024;
var MAX_RESPONSE_BYTES = 1024 * 1024;
// ⬡B:core.provider_spend_receipt:911:a_response_bound_was_deciding_whether_a_request_named_its_model:20260802⬡
// REPRODUCED DETERMINISTICALLY 20260802, and it is the wall that had her answering
// `no_answer:pai_seat: provider_spend_attribution_missing_model` on a live turn.
// `bodyFacts()` below reads the OUTBOUND REQUEST we ourselves built, and it was gating that
// read on MAX_RESPONSE_BYTES, a bound written for what a provider sends BACK. One byte over
// one mebibyte and the JSON was never parsed, so `providerModel()` found no `model`, and
// `prepare()` refused the call saying the caller never named a model. The caller did name it:
// core/tool.loop.js `_attemptPaiSeat` puts the seat's exact slug in the first forty bytes of
// every body it sends. A long turn (a full wall plus tools plus history, or one inline image
// part) crosses a mebibyte easily on a seat whose context window is a million tokens, so the
// biggest turns were the ones that could not buy a single token, under a reason that sends the
// next debugger to the seat map, where nothing is wrong.
//
// Two things change and both are the same rule: a bound must be about the thing it bounds.
//   1. A REQUEST body gets its own bound, sized to a real provider request rather than to a
//      response. The bytes are already fully in memory before this function is reached (we
//      serialized them), so parsing them adds no new exposure, only the parse itself.
//   2. A body that IS genuinely past the bound no longer borrows another wall's name. It
//      refuses as `provider_spend_attribution_body_too_large`, which is the true fault and is
//      traceable to this line instead of to a seat that named its model correctly.
var MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
var SUMMARY_PAGE_SIZE = 500;
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
function providerLabel(value,maximum){
  var text=clean(value);
  return text&&text.length<=maximum&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;
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
  var oversized = !!(bytes && bytes.length > MAX_REQUEST_BODY_BYTES);
  if (bytes && !oversized) {
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch (error) { parsed = null; }
  }
  return {parsed:parsed, digest:bytes ? sha(bytes) : null, oversized:oversized};
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
  // A body we could not read is not a body that named no model. Saying so is the whole
  // ⬡B:core.provider_spend_receipt:911⬡ above: the refusal names the fault it actually hit.
  if (!model) return {ok:false,reason:body.oversized
    ? 'provider_spend_attribution_body_too_large'
    : 'provider_spend_attribution_missing_model'};
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
function statementBankConfig(env) {
  var runtime=env||process.env;
  var url=clean(runtime.MEMORY_BANK_URL).replace(/\/$/,'');
  var key=clean(runtime.MEMORY_BANK_KEY);
  var schema=clean(runtime.BRAIN_SCHEMA||'memory_bank');
  return{url:url,key:key,schema:schema,ok:!!(url&&key&&schema==='memory_bank')};
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

async function readReconciliation(attemptId, options) {
  var config = bankConfig(options && options.env), doFetch = fetchImpl(options);
  if (!config.ok || !doFetch) return {ok:false,reason:'provider_spend_store_unavailable'};
  var query = new URLSearchParams({attempt_id:'eq.' + attemptId,limit:'2'});
  var response;
  try {
    response = await doFetch(config.url + '/rest/v1/' + RECONCILIATION_TABLE + '?' +
      query.toString(),{headers:readHeaders(config),
        signal:brain.boundedSignal(options && options.signal,options && options.env)});
  } catch (error) { return {ok:false,reason:'provider_spend_store_unavailable'}; }
  if (!response || response.ok !== true) return {ok:false,reason:response &&
    (response.status === 404 || response.status === 400) ? 'provider_spend_schema_unavailable'
      : 'provider_spend_readback_failed'};
  try {
    var rows=await boundedJson(response,MAX_STORE_BYTES);
    if(!Array.isArray(rows)||rows.length!==1)return{ok:false,
      reason:rows&&rows.length>1?'provider_spend_readback_ambiguous':
        'provider_spend_readback_missing'};
    return{ok:true,row:rows[0]};
  } catch(error){return{ok:false,reason:'provider_spend_store_readback_invalid'};}
}

async function readUsageReconciliation(attemptId, options) {
  var config = bankConfig(options && options.env), doFetch = fetchImpl(options);
  if (!config.ok || !doFetch) return {ok:false,reason:'provider_spend_store_unavailable'};
  var query = new URLSearchParams({attempt_id:'eq.' + attemptId,limit:'2'});
  var response;
  try {
    response = await doFetch(config.url + '/rest/v1/' + USAGE_RECONCILIATION_TABLE + '?' +
      query.toString(),{headers:readHeaders(config),
        signal:brain.boundedSignal(options && options.signal,options && options.env)});
  } catch(error) { return {ok:false,reason:'provider_spend_store_unavailable'}; }
  if(!response || response.ok !== true)return{ok:false,reason:response &&
    (response.status===404||response.status===400)?'provider_spend_schema_unavailable':
      'provider_spend_readback_failed'};
  try{
    var rows=await boundedJson(response,MAX_STORE_BYTES);
    if(!Array.isArray(rows)||rows.length!==1)return{ok:false,
      reason:rows&&rows.length>1?'provider_spend_readback_ambiguous':
        'provider_spend_readback_missing'};
    return{ok:true,row:rows[0]};
  }catch(error){return{ok:false,reason:'provider_spend_store_readback_invalid'};}
}

async function writeReconciliation(receipt, outcome, options) {
  var cost=decimalCost(outcome&&outcome.actual_cost_usd);
  var row={attempt_id:receipt&&receipt.attempt_id,
    provider_request_id:identifier(outcome&&outcome.provider_request_id,240),
    provider_tokens:outcome&&outcome.provider_tokens||null,actual_cost_usd:cost,
    cost_source:outcome&&outcome.cost_source,
    provider_fact_digest:identifier(outcome&&outcome.provider_fact_digest,64),
    provider_model:identifier(outcome&&outcome.provider_model,240),
    provider_name:providerLabel(outcome&&outcome.provider_name,160),
    reconciliation_source:'openrouter_generation_api'};
  if(!receipt||receipt.provider!=='openrouter'||!identifier(row.attempt_id,64)||
      !row.provider_request_id||!row.provider_tokens||cost===null||
      row.cost_source!=='provider_reported'||!row.provider_fact_digest){
    return{ok:false,reason:'provider_spend_reconciliation_input_invalid'};
  }
  var written=await rpcCall(PROVIDER_FACT_RPC,{p_fact:row},options,
    'provider_spend_reconciliation_write_failed');
  if(!written.ok)return written;
  var payload=written.payload;
  if(!payload||payload.ok!==true||payload.stored!==true||
      clean(payload.attempt_id)!==row.attempt_id){
    return{ok:false,reason:identifier(payload&&payload.reason,160)||
      'provider_spend_reconciliation_readback_mismatch'};
  }
  var readback=await readReconciliation(row.attempt_id,options);
  if(!readback.ok)return readback;
  var actual=readback.row;
  if(clean(actual.provider_request_id)!==row.provider_request_id||
      clean(actual.cost_source)!=='provider_reported'||
      clean(actual.provider_fact_digest)!==row.provider_fact_digest||
      clean(actual.reconciliation_source)!=='openrouter_generation_api'||
      identifier(actual.provider_model,240)!==row.provider_model||
      providerLabel(actual.provider_name,160)!==row.provider_name||
      decimalCost(actual.actual_cost_usd)!==cost||
      stableJson(actual.provider_tokens)!==stableJson(row.provider_tokens)){
    return{ok:false,reason:'provider_spend_reconciliation_readback_mismatch'};
  }
  return{ok:true,row:actual,replayed:payload.inserted!==true};
}

function exactIso(value) {
  var parsed=Date.parse(clean(value));
  if(!Number.isFinite(parsed))return null;
  return new Date(parsed).toISOString();
}
function normalizedProviderStatement(fact) {
  var observedAt=exactIso(fact&&fact.observed_at);
  var credits=decimalCost(fact&&fact.total_credits_usd);
  var usage=decimalCost(fact&&fact.total_usage_usd);
  if(!fact||fact.provider!=='openrouter'||!observedAt||credits===null||usage===null||
      fact.source!=='openrouter_credits_control_plane'||fact.read_by_seat!=='account_monitor'){
    return null;
  }
  var authority={schema:'anew.provider-account-statement.v1',provider:'openrouter',
    observed_at:observedAt,total_credits_usd:credits,total_usage_usd:usage,
    source:'openrouter_credits_control_plane',read_by_seat:'account_monitor'};
  var digest=sha(stableJson(authority));
  return Object.assign({statement_id:digest,provider_fact_digest:digest},authority);
}
function sameProviderStatement(actual, expected) {
  return clean(actual&&actual.statement_id)===expected.statement_id&&
    clean(actual&&actual.provider_fact_digest)===expected.provider_fact_digest&&
    clean(actual&&actual.provider)===expected.provider&&
    exactIso(actual&&actual.observed_at)===expected.observed_at&&
    decimalCost(actual&&actual.total_credits_usd)===expected.total_credits_usd&&
    decimalCost(actual&&actual.total_usage_usd)===expected.total_usage_usd&&
    clean(actual&&actual.source)===expected.source&&
    clean(actual&&actual.read_by_seat)===expected.read_by_seat;
}
async function readProviderStatement(statementId, options) {
  var config=statementBankConfig(options&&options.env),doFetch=fetchImpl(options);
  if(!config.ok||!doFetch)return{ok:false,reason:'provider_statement_store_unavailable'};
  var query=new URLSearchParams({statement_id:'eq.'+statementId,limit:'2'}),response;
  try{
    response=await doFetch(config.url+'/rest/v1/'+PROVIDER_STATEMENT_TABLE+'?'+query.toString(),{
      headers:readHeaders(config),signal:brain.boundedSignal(options&&options.signal,
        options&&options.env)});
  }catch(error){return{ok:false,reason:'provider_statement_store_unavailable'};}
  if(!response||response.ok!==true)return{ok:false,reason:response&&
    (response.status===404||response.status===400)?'provider_statement_schema_unavailable':
      'provider_statement_readback_failed'};
  try{
    var rows=await boundedJson(response,MAX_STORE_BYTES);
    if(!Array.isArray(rows)||rows.length!==1)return{ok:false,reason:rows&&rows.length>1?
      'provider_statement_readback_ambiguous':'provider_statement_readback_missing'};
    return{ok:true,row:rows[0]};
  }catch(error){return{ok:false,reason:'provider_statement_readback_invalid'};}
}
async function writeProviderAccountStatement(fact, options) {
  var row=normalizedProviderStatement(fact);
  if(!row)return{ok:false,reason:'provider_statement_input_invalid'};
  if(!statementBankConfig(options&&options.env).ok){
    return{ok:false,reason:'provider_statement_store_unavailable'};
  }
  var written=await rpcCall(PROVIDER_STATEMENT_RPC,{p_statement:row},options,
    'provider_statement_write_failed');
  if(!written.ok)return written;
  var payload=written.payload;
  if(!payload||payload.ok!==true||payload.stored!==true||
      clean(payload.statement_id)!==row.statement_id){
    return{ok:false,reason:identifier(payload&&payload.reason,160)||
      'provider_statement_readback_mismatch'};
  }
  var readback=await readProviderStatement(row.statement_id,options);
  if(!readback.ok)return readback;
  if(!sameProviderStatement(readback.row,row)){
    return{ok:false,reason:'provider_statement_readback_mismatch'};
  }
  return{ok:true,row:readback.row,replayed:payload.inserted!==true};
}

function normalizedProviderUsage(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  var unit=identifier(value.unit,32),quantity=strictNumber(value.quantity);
  if(!unit||quantity===null)return null;
  var normalized={unit:unit,quantity:quantity};
  if(value.duration_seconds!==undefined){
    var duration=strictNumber(value.duration_seconds);
    if(duration===null)return null;
    normalized.duration_seconds=duration;
  }
  if(value.is_sandbox!==undefined){
    if(typeof value.is_sandbox!=='boolean')return null;
    normalized.is_sandbox=value.is_sandbox;
  }
  var historyId=identifier(value.history_item_id,240);
  if(value.history_item_id!==undefined&&!historyId)return null;
  if(historyId)normalized.history_item_id=historyId;
  return normalized;
}
function providerUsageFactDigest(facts) {
  var normalized={provider:identifier(facts&&facts.provider,80),
    provider_request_id:identifier(facts&&facts.provider_request_id,240),
    provider_usage:normalizedProviderUsage(facts&&facts.provider_usage),
    usage_source:identifier(facts&&facts.usage_source,80),
    reconciliation_source:identifier(facts&&facts.reconciliation_source,80)};
  if(!normalized.provider||!normalized.provider_request_id||!normalized.provider_usage||
      !normalized.usage_source||!normalized.reconciliation_source)return null;
  return sha(stableJson(normalized));
}
async function writeUsageReconciliation(receipt, facts, options) {
  var provider=identifier(facts&&facts.provider,80),usage=normalizedProviderUsage(
    facts&&facts.provider_usage);
  var row={attempt_id:receipt&&receipt.attempt_id,provider:provider,
    provider_request_id:identifier(facts&&facts.provider_request_id,240),
    provider_usage:usage,usage_source:identifier(facts&&facts.usage_source,80),
    provider_fact_digest:identifier(facts&&facts.provider_fact_digest,64),
    reconciliation_source:identifier(facts&&facts.reconciliation_source,80)};
  if(!receipt||receipt.provider!==provider||!identifier(row.attempt_id,64)||
      !row.provider_request_id||!row.provider_usage||!row.usage_source||
      !row.provider_fact_digest||!row.reconciliation_source){
    return{ok:false,reason:'provider_spend_usage_reconciliation_input_invalid'};
  }
  var written=await rpcCall(PROVIDER_USAGE_RPC,{p_fact:row},options,
    'provider_spend_usage_reconciliation_write_failed');
  if(!written.ok)return written;
  var payload=written.payload;
  if(!payload||payload.ok!==true||payload.stored!==true||
      clean(payload.attempt_id)!==row.attempt_id){
    return{ok:false,reason:identifier(payload&&payload.reason,160)||
      'provider_spend_usage_reconciliation_readback_mismatch'};
  }
  var readback=await readUsageReconciliation(row.attempt_id,options);
  if(!readback.ok)return readback;
  var actual=readback.row;
  if(identifier(actual.provider,80)!==row.provider||
      identifier(actual.provider_request_id,240)!==row.provider_request_id||
      stableJson(normalizedProviderUsage(actual.provider_usage))!==stableJson(row.provider_usage)||
      identifier(actual.usage_source,80)!==row.usage_source||
      identifier(actual.reconciliation_source,80)!==row.reconciliation_source||
      identifier(actual.provider_fact_digest,64)!==row.provider_fact_digest){
    return{ok:false,reason:'provider_spend_usage_reconciliation_readback_mismatch'};
  }
  return{ok:true,row:actual,replayed:payload.inserted!==true};
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
function openRouterGenerationFacts(body, expectedId) {
  var data = body && body.data;
  var expected = identifier(expectedId, 240);
  if (!data || typeof data !== 'object' || !expected ||
      identifier(data.id, 240) !== expected) return null;
  var input = strictNumber(data.tokens_prompt);
  var output = strictNumber(data.tokens_completion);
  var nativeInput = strictNumber(data.native_tokens_prompt);
  var nativeOutput = strictNumber(data.native_tokens_completion);
  var nativeReasoning = strictNumber(data.native_tokens_reasoning);
  var nativeCached = strictNumber(data.native_tokens_cached);
  var total = input === null || output === null ? null : input + output;
  var tokens = (input === null && output === null && nativeInput === null &&
    nativeOutput === null && nativeReasoning === null && nativeCached === null) ? null : {
    input_tokens:input,output_tokens:output,total_tokens:total,
    native_input_tokens:nativeInput,native_output_tokens:nativeOutput,
    native_reasoning_tokens:nativeReasoning,native_cached_tokens:nativeCached
  };
  var cost = strictNumber(data.total_cost);
  if (cost === null) cost = strictNumber(data.usage);
  if (cost === null) return null;
  return {provider_request_id:expected,provider_tokens:tokens,
    actual_cost_usd:cost,cost_source:'provider_reported',
    provider_model:identifier(data.model,240),provider_name:providerLabel(data.provider_name,160)};
}
function providerFactDigest(facts) {
  var normalized={provider_request_id:identifier(facts&&facts.provider_request_id,240),
    provider_tokens:facts&&facts.provider_tokens||null,
    actual_cost_usd:decimalCost(facts&&facts.actual_cost_usd),
    cost_source:facts&&facts.cost_source,
    provider_model:identifier(facts&&facts.provider_model,240),
    provider_name:providerLabel(facts&&facts.provider_name,160)};
  if(!normalized.provider_request_id||!normalized.provider_tokens||
      normalized.actual_cost_usd===null||normalized.cost_source!=='provider_reported')return null;
  return sha(stableJson(normalized));
}

function inlineProviderUsage(receipt,response) {
  if(!receipt||receipt.provider!=='elevenlabs'||!response||response.ok!==true)return null;
  var requestId=identifier(headerValue({headers:response.headers},'request-id'),240);
  var characters=strictNumber(headerValue({headers:response.headers},'character-cost'));
  if(!requestId||characters===null)return null;
  var facts={provider:'elevenlabs',provider_request_id:requestId,
    provider_usage:{unit:'character',quantity:characters},
    usage_source:'provider_response_header',reconciliation_source:'elevenlabs_response_header'};
  facts.provider_fact_digest=providerUsageFactDigest(facts);
  return facts.provider_fact_digest?facts:null;
}
async function recoverOpenRouterUsage(receipt, outcome, requestInit, options) {
  var result = Object.assign({},outcome || {});
  if (!receipt || receipt.provider !== 'openrouter' || result.disposition !== 'SUCCEEDED' ||
      result.status_code < 200 || result.status_code > 299 ||
      // Inline provider facts remain one inseparable authority. Reconcile only the known
      // capture-failure shape where both are absent; never splice one generation fact into a
      // different inline fact and then claim the mixed row came from the generation ledger.
      strictNumber(result.actual_cost_usd) !== null || result.provider_tokens ||
      !identifier(result.provider_request_id,240)) return result;
  var authorization = headerValue(requestInit,'authorization');
  if (!/^Bearer\s+\S+$/i.test(authorization)) return result;
  var doFetch = fetchImpl(options);
  if (!doFetch) return result;
  var query = new URLSearchParams({id:result.provider_request_id});
  var response;
  try {
    response = await doFetch('https://openrouter.ai/api/v1/generation?' + query.toString(),{
      method:'GET',headers:{Authorization:authorization,Accept:'application/json'},
      // This governs only the free post-response accounting read. The paid model response has
      // already been captured and its terminal committed before this call begins.
      signal:brain.boundedSignal(options&&options.signal,options&&options.env)
    });
  } catch (error) { return result; }
  if (!response || response.ok !== true) return result;
  var body;
  try { body = await boundedJson(response,MAX_RESPONSE_BYTES); }
  catch (error) { return result; }
  var facts = openRouterGenerationFacts(body,result.provider_request_id);
  if (!facts) return result;
  result.actual_cost_usd=facts.actual_cost_usd;
  result.cost_source=facts.cost_source;
  result.provider_tokens=facts.provider_tokens;
  result.provider_fact_digest=providerFactDigest(facts);
  result.provider_model=facts.provider_model;
  result.provider_name=facts.provider_name;
  return result;
}

async function recoverDelayedOpenRouterCost(receipt, requestInit, options) {
  var empty={ok:true,attempted:0,recovered:0,reason:null};
  if(!receipt||receipt.provider!=='openrouter'||
      !/^[a-f0-9]{64}$/.test(clean(receipt.attempt_id))||
      !identifier(receipt.key_alias,160))return empty;
  var authorization=headerValue(requestInit,'authorization');
  if(!/^Bearer\s+\S+$/i.test(authorization))return empty;
  var runtime=options&&options.env||process.env;
  var owner=openrouterSeatSpend.keyOwner(authorization.replace(/^Bearer\s+/i,''),runtime);
  var expectedAlias=owner&&owner.ok===true?'seat.'+owner.seat.seat:null;
  if(!expectedAlias||expectedAlias!==receipt.key_alias){
    return{ok:false,attempted:0,recovered:0,
      reason:'provider_spend_reconciliation_seat_mismatch'};
  }
  var config=bankConfig(runtime),doFetch=fetchImpl(options);
  if(!config.ok||!doFetch)return{ok:false,attempted:0,recovered:0,
    reason:'provider_spend_store_unavailable'};
  // A later organic request for this exact seat drains one earlier durable terminal. There is
  // no timer, paid generation, estimate, mutable terminal, or process-local cursor. Candidate
  // selection is distributed by the current immutable attempt id across the exact outstanding
  // count. One provider fact that is permanently unavailable therefore cannot sit at the head
  // of the queue and prevent every other exact generation fact from healing.
  var query=new URLSearchParams({select:'attempt_id,provider_request_id,status_code,'+
    'disposition,key_alias,provider_tokens,actual_cost_usd,cost_source',
    provider:'eq.openrouter',phase:'eq.TERMINAL',disposition:'eq.SUCCEEDED',
    key_alias:'eq.'+receipt.key_alias,provider_request_id:'not.is.null',
    provider_tokens:'is.null',actual_cost_usd:'is.null',cost_source:'is.null',
    attempt_id:'neq.'+receipt.attempt_id,order:'created_at.desc,attempt_id.desc',limit:'1'});
  var response;
  try{
    response=await doFetch(config.url+'/rest/v1/'+BILLABLE_TABLE+'?'+query.toString(),{
      headers:Object.assign({},readHeaders(config),{Prefer:'count=exact',Range:'0-0'}),
      signal:brain.boundedSignal(options&&options.signal,runtime)});
  }catch(error){return{ok:false,attempted:0,recovered:0,
    reason:'provider_spend_store_unavailable'};}
  if(!response||response.ok!==true)return{ok:false,attempted:0,recovered:0,
    reason:response&&(response.status===404||response.status===400)
      ?'provider_spend_schema_unavailable':'provider_spend_reconciliation_read_failed'};
  var rows;
  try{rows=await boundedJson(response,MAX_STORE_BYTES);}
  catch(error){return{ok:false,attempted:0,recovered:0,
    reason:'provider_spend_store_readback_invalid'};}
  if(!Array.isArray(rows)||rows.length>1)return{ok:false,attempted:0,recovered:0,
    reason:'provider_spend_reconciliation_candidate_invalid'};
  var contentRange=String(response.headers&&response.headers.get&&
    response.headers.get('content-range')||'');
  var totalMatch=contentRange.match(/\/(\d+)$/),total=totalMatch?Number(totalMatch[1]):null;
  if(!Number.isSafeInteger(total)||total<0||total===0&&rows.length!==0||
      total>0&&rows.length!==1)return{ok:false,attempted:0,recovered:0,
    reason:'provider_spend_reconciliation_count_invalid'};
  if(total===0)return empty;
  var candidateIndex=parseInt(receipt.attempt_id.slice(0,12),16)%total;
  if(candidateIndex>0){
    try{
      response=await doFetch(config.url+'/rest/v1/'+BILLABLE_TABLE+'?'+query.toString(),{
        headers:Object.assign({},readHeaders(config),{Range:candidateIndex+'-'+candidateIndex}),
        signal:brain.boundedSignal(options&&options.signal,runtime)});
    }catch(error){return{ok:false,attempted:0,recovered:0,
      reason:'provider_spend_store_unavailable'};}
    if(!response||response.ok!==true)return{ok:false,attempted:0,recovered:0,
      reason:response&&(response.status===404||response.status===400)
        ?'provider_spend_schema_unavailable':'provider_spend_reconciliation_read_failed'};
    try{rows=await boundedJson(response,MAX_STORE_BYTES);}
    catch(error){return{ok:false,attempted:0,recovered:0,
      reason:'provider_spend_store_readback_invalid'};}
    if(!Array.isArray(rows)||rows.length!==1)return{ok:false,attempted:0,recovered:0,
      reason:'provider_spend_reconciliation_candidate_raced'};
  }
  var candidate=rows[0],attemptId=clean(candidate&&candidate.attempt_id);
  var providerRequestId=identifier(candidate&&candidate.provider_request_id,240);
  var statusCode=Number(candidate&&candidate.status_code);
  if(!/^[a-f0-9]{64}$/.test(attemptId)||attemptId===receipt.attempt_id||
      clean(candidate.key_alias)!==receipt.key_alias||candidate.disposition!=='SUCCEEDED'||
      !Number.isInteger(statusCode)||statusCode<200||statusCode>299||!providerRequestId||
      candidate.provider_tokens!=null||strictNumber(candidate.actual_cost_usd)!==null||
      candidate.cost_source!=null){
    return{ok:false,attempted:0,recovered:0,
      reason:'provider_spend_reconciliation_candidate_invalid'};
  }
  var outcome={status_code:statusCode,disposition:'SUCCEEDED',
    provider_request_id:providerRequestId,provider_tokens:null,
    actual_cost_usd:null,cost_source:null};
  var recovered=await recoverOpenRouterUsage({provider:'openrouter'},outcome,
    requestInit,options);
  if(!recovered||!recovered.provider_fact_digest){
    return{ok:true,attempted:1,recovered:0,reason:'openrouter_generation_fact_not_ready'};
  }
  var written=await writeReconciliation({attempt_id:attemptId,provider:'openrouter'},
    recovered,options);
  if(!written||written.ok!==true)return{ok:false,attempted:1,recovered:0,
    reason:written&&written.reason||'provider_spend_reconciliation_write_failed'};
  return{ok:true,attempted:1,recovered:1,reason:null,attempt_id:attemptId,
    candidate_index:candidateIndex,candidate_count:total,replayed:written.replayed===true};
}
async function bankUsageCandidate(receipt, options) {
  var config=bankConfig(options&&options.env),doFetch=fetchImpl(options);
  if(!config.ok||!doFetch)return{ok:false,reason:'provider_spend_store_unavailable'};
  var query=new URLSearchParams({select:'attempt_id,provider,provider_request_id,status_code,'+
    'disposition,key_alias,provider_usage',provider:'eq.'+receipt.provider,
    phase:'eq.TERMINAL',disposition:'eq.SUCCEEDED',key_alias:'eq.'+receipt.key_alias,
    provider_request_id:'not.is.null',provider_usage:'is.null',
    attempt_id:'neq.'+receipt.attempt_id,order:'created_at.desc,attempt_id.desc',limit:'1'});
  var response;
  try{response=await doFetch(config.url+'/rest/v1/'+BILLABLE_TABLE+'?'+query.toString(),{
    headers:readHeaders(config),signal:brain.boundedSignal(options&&options.signal,
      options&&options.env)});}
  catch(error){return{ok:false,reason:'provider_spend_store_unavailable'};}
  if(!response||response.ok!==true)return{ok:false,reason:response&&
    (response.status===404||response.status===400)?'provider_spend_schema_unavailable':
      'provider_spend_usage_reconciliation_read_failed'};
  var rows;
  try{rows=await boundedJson(response,MAX_STORE_BYTES);}
  catch(error){return{ok:false,reason:'provider_spend_store_readback_invalid'};}
  if(!Array.isArray(rows)||rows.length>1)return{ok:false,
    reason:'provider_spend_usage_reconciliation_candidate_invalid'};
  if(!rows.length)return{ok:true,row:null};
  var row=rows[0],status=Number(row&&row.status_code);
  if(!/^[a-f0-9]{64}$/.test(clean(row&&row.attempt_id))||
      row.attempt_id===receipt.attempt_id||row.provider!==receipt.provider||
      clean(row.key_alias)!==receipt.key_alias||row.disposition!=='SUCCEEDED'||
      !Number.isInteger(status)||status<200||status>299||
      !identifier(row.provider_request_id,240)||row.provider_usage!=null){
    return{ok:false,reason:'provider_spend_usage_reconciliation_candidate_invalid'};
  }
  return{ok:true,row:row};
}
async function elevenLabsHistoryUsage(requestId, requestInit, options) {
  var key=headerValue(requestInit,'xi-api-key')||bearer(requestInit),cursor=null,seen=new Set();
  if(!key)return null;
  var doFetch=fetchImpl(options);
  while(doFetch){
    var query=new URLSearchParams({page_size:'1000',sort_direction:'desc',source:'TTS'});
    if(cursor)query.set('start_after_history_item_id',cursor);
    var response;
    try{response=await doFetch('https://api.elevenlabs.io/v1/history?'+query.toString(),{
      method:'GET',headers:{'xi-api-key':key,Accept:'application/json'},
      signal:brain.boundedSignal(options&&options.signal,options&&options.env)});}
    catch(error){return null;}
    if(!response||response.ok!==true)return null;
    var body;
    try{body=await boundedJson(response,MAX_STORE_BYTES);}catch(error){return null;}
    if(!body||!Array.isArray(body.history)||typeof body.has_more!=='boolean')return null;
    var exact=body.history.find(function(item){
      return identifier(item&&item.request_id,240)===requestId;
    });
    if(exact){
      var from=Number(exact.character_count_change_from),to=Number(exact.character_count_change_to);
      if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from)return null;
      var facts={provider:'elevenlabs',provider_request_id:requestId,
        provider_usage:{unit:'character',quantity:to-from,
          history_item_id:identifier(exact.history_item_id,240)},
        usage_source:'provider_history_item',reconciliation_source:'elevenlabs_history_api'};
      facts.provider_fact_digest=providerUsageFactDigest(facts);
      return facts.provider_fact_digest?facts:null;
    }
    if(body.has_more!==true)return null;
    var next=identifier(body.last_history_item_id,240);
    if(!next||seen.has(next))return null;
    seen.add(next);cursor=next;
  }
  return null;
}
async function liveAvatarHistoricUsage(requestId, requestInit, options) {
  var key=headerValue(requestInit,'x-api-key')||bearer(requestInit),page=1,seen=new Set();
  if(!key)return null;
  var doFetch=fetchImpl(options);
  while(doFetch){
    var query=new URLSearchParams({type:'historic',page:String(page),page_size:'100'});
    var response;
    try{response=await doFetch('https://api.liveavatar.com/v1/sessions?'+query.toString(),{
      method:'GET',headers:{'X-API-KEY':key,Accept:'application/json'},
      signal:brain.boundedSignal(options&&options.signal,options&&options.env)});}
    catch(error){return null;}
    if(!response||response.ok!==true)return null;
    var body;
    try{body=await boundedJson(response,MAX_STORE_BYTES);}catch(error){return null;}
    var data=body&&body.data,rows=data&&data.results;
    if(!data||!Array.isArray(rows))return null;
    var exact=rows.find(function(item){return identifier(item&&item.id,240)===requestId;});
    if(exact){
      var credits=strictNumber(exact.credits_consumed),duration=strictNumber(exact.duration);
      if(credits===null||duration===null||typeof exact.is_sandbox!=='boolean')return null;
      var facts={provider:'liveavatar',provider_request_id:requestId,
        provider_usage:{unit:'credit',quantity:credits,duration_seconds:duration,
          is_sandbox:exact.is_sandbox},usage_source:'provider_historic_session',
        reconciliation_source:'liveavatar_historic_sessions_api'};
      facts.provider_fact_digest=providerUsageFactDigest(facts);
      return facts.provider_fact_digest?facts:null;
    }
    var next=clean(data.next);
    if(!next)return null;
    if(seen.has(next))return null;
    seen.add(next);page+=1;
  }
  return null;
}
async function recoverDelayedProviderUsage(receipt, requestInit, options) {
  var empty={ok:true,attempted:0,recovered:0,reason:null};
  if(!receipt||!new Set(['elevenlabs','liveavatar']).has(receipt.provider)||
      !/^[a-f0-9]{64}$/.test(clean(receipt.attempt_id))||
      !identifier(receipt.key_alias,160))return empty;
  var candidate=await bankUsageCandidate(receipt,options);
  if(!candidate.ok)return{ok:false,attempted:0,recovered:0,reason:candidate.reason};
  if(!candidate.row)return empty;
  var requestId=identifier(candidate.row.provider_request_id,240),facts=receipt.provider==='elevenlabs'
    ? await elevenLabsHistoryUsage(requestId,requestInit,options)
    : await liveAvatarHistoricUsage(requestId,requestInit,options);
  if(!facts)return{ok:true,attempted:1,recovered:0,reason:'provider_usage_fact_not_ready'};
  var written=await writeUsageReconciliation({attempt_id:candidate.row.attempt_id,
    provider:receipt.provider},facts,options);
  if(!written.ok)return{ok:false,attempted:1,recovered:0,reason:written.reason};
  return{ok:true,attempted:1,recovered:1,reason:null,attempt_id:candidate.row.attempt_id,
    replayed:written.replayed===true};
}
async function captureTerminalResponse(response, options) {
  var bytes = await responseBytes(response, Number(options && options.maxResponseBytes) || MAX_RESPONSE_BYTES);
  var body = null;
  if (bytes) { try { body = JSON.parse(bytes.toString('utf8')); } catch (error) { body = null; } }
  var usage = usageFacts(body);
  var receiptProvider=identifier(options&&options.receipt&&options.receipt.provider,80);
  // Provider control-plane identity outranks generic HTTP trace headers. ElevenLabs' usage
  // fact is keyed by its documented `request-id`; LiveAvatar's historic ledger is keyed by
  // `data.session_id`. Banking an x-request-id trace instead makes the immutable terminal
  // impossible to reconcile to the provider fact later.
  var providerRequestId=receiptProvider==='elevenlabs'
    ? headerValue({headers:response&&response.headers},'request-id')||null
    : receiptProvider==='liveavatar'
      ? identifier(body&&body.data&&body.data.session_id,240)||null
      : headerValue({headers:response&&response.headers},'x-generation-id')||
        headerValue({headers:response&&response.headers},'x-request-id')||
        headerValue({headers:response&&response.headers},'request-id')||
        identifier(body&&body.id,240)||null;
  var providerUsage=inlineProviderUsage(options&&options.receipt,response);
  return {outcome:{status_code:response && Number.isInteger(response.status) ? response.status : null,
    disposition:response && response.ok === true ? 'SUCCEEDED' : 'HTTP_ERROR',
    response_digest:bytes ? sha(bytes) : null,provider_request_id:identifier(providerRequestId, 240),
    provider_tokens:usage.tokens,actual_cost_usd:usage.cost,cost_source:usage.costSource,
    provider_usage:providerUsage&&providerUsage.provider_usage||null,
    usage_source:providerUsage&&providerUsage.usage_source||null,
    provider_usage_fact:providerUsage||null},
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
function addBucket(counts, value) {
  var key = clean(value) || 'unknown';
  counts.set(key, (counts.get(key) || 0) + 1);
}
function bucketRows(counts) {
  return Array.from(counts.entries()).map(function(entry) {
    return {owner:entry[0],count:entry[1]};
  }).sort(function(a,b) { return b.count-a.count || a.owner.localeCompare(b.owner); }).slice(0,24);
}
function responseRange(response) {
  var raw = response && response.headers && response.headers.get &&
    response.headers.get('content-range');
  var text=String(raw||'');
  var match=text.match(/^(\d+)-(\d+)\/(\d+|\*)$/);
  if(match)return{start:Number(match[1]),end:Number(match[2]),empty:false,
    total:match[3]==='*'?null:Number(match[3])};
  var empty=text.match(/^\*\/(\d+|\*)$/);
  return empty?{start:null,end:null,empty:true,
    total:empty[1]==='*'?null:Number(empty[1])}:null;
}
function costUnits(value) {
  var normalized=decimalCost(value);
  if(normalized===null)return null;
  var pieces=normalized.split('.');
  return BigInt(pieces[0])*100000000n+
    BigInt(String(pieces[1]||'').padEnd(8,'0'));
}
function unitsDecimal(value) {
  var negative=value<0n,absolute=negative?-value:value;
  var whole=absolute/100000000n,fraction=String(absolute%100000000n).padStart(8,'0')
    .replace(/0+$/,'');
  return(negative?'-':'')+String(whole)+(fraction?'.'+fraction:'');
}
function publicCostUnits(value) { return Number(unitsDecimal(value)); }

async function readProviderStatementInterval(options) {
  var config=statementBankConfig(options&&options.env),doFetch=fetchImpl(options);
  var empty={provider_statement_reconciled:false,provider_account_total_usd:null,
    provider_total_credits_usd:null,provider_statement_interval_start:null,
    provider_statement_interval_end:null,provider_statement_usage_delta_usd:null,
    bank_provider_interval_cost_usd:null,provider_statement_delta_usd:null,
    provider_statement_interval_unresolved:null,provider_statement_interval_outcome_unknown:null,
    provider_statement_interval_uncosted:null,provider_statement_authority:null,
    provider_statement_latest_id:null,provider_statement_baseline_id:null};
  if(!config.ok||!doFetch)return Object.assign(empty,{provider_statement_reason:
    'provider_statement_store_unavailable'});
  var statementQuery=new URLSearchParams({select:'statement_id,provider,observed_at,'+
    'total_credits_usd,total_usage_usd,source,read_by_seat,provider_fact_digest',
    provider:'eq.openrouter',order:'observed_at.desc,statement_id.desc',limit:'2'}),response,rows;
  try{
    response=await doFetch(config.url+'/rest/v1/'+PROVIDER_STATEMENT_TABLE+'?'+
      statementQuery.toString(),{headers:readHeaders(config),signal:brain.boundedSignal(
        options&&options.signal,options&&options.env)});
  }catch(error){return Object.assign(empty,{provider_statement_reason:
    'provider_statement_store_unavailable'});}
  if(!response||response.ok!==true)return Object.assign(empty,{provider_statement_reason:
    response&&(response.status===404||response.status===400)?
      'provider_statement_schema_unavailable':'provider_statement_read_failed'});
  try{rows=await boundedJson(response,MAX_STORE_BYTES);}
  catch(error){return Object.assign(empty,{provider_statement_reason:
    'provider_statement_readback_invalid'});}
  if(!Array.isArray(rows)||rows.length>2)return Object.assign(empty,
    {provider_statement_reason:'provider_statement_readback_invalid'});
  var normalized=rows.map(normalizedProviderStatement);
  if(normalized.some(function(row,index){return !row||!sameProviderStatement(rows[index],row);})){
    return Object.assign(empty,{provider_statement_reason:'provider_statement_readback_mismatch'});
  }
  if(!normalized.length)return Object.assign(empty,{provider_statement_reason:
    'authenticated_provider_statement_not_ingested'});
  var current=normalized[0],currentUsage=costUnits(current.total_usage_usd);
  var intervalNow=Number(options&&options.now||Date.now());
  var withCurrent=Object.assign({},empty,{provider_account_total_usd:Number(current.total_usage_usd),
    provider_total_credits_usd:Number(current.total_credits_usd),
    provider_statement_interval_end:current.observed_at,
    provider_statement_latest_id:current.statement_id});
  if(!Number.isFinite(intervalNow)||Date.parse(current.observed_at)>intervalNow){
    return Object.assign(withCurrent,{provider_statement_reason:
      'provider_statement_timestamp_mismatch'});
  }
  if(normalized.length<2)return Object.assign(withCurrent,{provider_statement_reason:
    'provider_statement_baseline_missing'});
  var baseline=normalized[1],baselineUsage=costUnits(baseline.total_usage_usd);
  if(baselineUsage===null||currentUsage===null||
      baseline.observed_at>=current.observed_at||currentUsage<baselineUsage){
    return Object.assign(withCurrent,{provider_statement_interval_start:baseline.observed_at,
      provider_statement_reason:'provider_statement_timestamp_mismatch'});
  }
  var providerDelta=currentUsage-baselineUsage;
  var activityQuery=new URLSearchParams({select:'attempt_id,phase,provider,disposition,'+
    'actual_cost_usd,cost_source,created_at',provider:'eq.openrouter',
    order:'created_at.asc,attempt_id.asc,phase.asc'});
  activityQuery.append('created_at','gt.'+baseline.observed_at);
  activityQuery.append('created_at','lte.'+current.observed_at);
  var offset=0,seen=new Set(),intents=new Set(),terminals=new Set(),unknown=0,uncosted=0;
  var bankUnits=0n;
  try{
    while(true){
      var headers=readHeaders(config);
      // PostgREST does not include the exact relation total unless the caller asks for it.
      // Pagination closure is a billing fact, so request the exact count instead of trying
      // to infer end-of-ledger from an empty transport page.
      headers.Prefer='count=exact';
      headers.Range=offset+'-'+(offset+SUMMARY_PAGE_SIZE-1);
      response=await doFetch(config.url+'/rest/v1/'+BILLABLE_TABLE+'?'+
        activityQuery.toString(),{headers:headers,signal:brain.boundedSignal(
          options&&options.signal,options&&options.env)});
      if(!response||response.ok!==true)return Object.assign(withCurrent,
        {provider_statement_interval_start:baseline.observed_at,
          provider_statement_reason:response&&(response.status===404||response.status===400)?
            'provider_statement_schema_unavailable':'provider_statement_activity_read_failed'});
      rows=await boundedJson(response,MAX_STORE_BYTES);
      if(!Array.isArray(rows))throw new Error('provider_statement_activity_invalid');
      var range=responseRange(response);
      if(!rows.length){
        // `*/*` says only that this transport returned no rows. It does not prove that
        // the ordered provider interval ended. Require an exact total and require the
        // requested offset to be at or beyond it before publishing a reconciled delta.
        if(!range||range.empty!==true||range.total===null||offset<range.total){
          throw new Error('provider_statement_activity_pagination_unverified');
        }
        break;
      }
      if(!range||range.start!==offset||range.end-range.start+1!==rows.length){
        throw new Error('provider_statement_activity_pagination_unverified');
      }
      rows.forEach(function(row){
        var attemptId=clean(row&&row.attempt_id),phase=clean(row&&row.phase);
        var rowKey=attemptId+':'+phase,createdAt=exactIso(row&&row.created_at);
        if(!/^[a-f0-9]{64}$/.test(attemptId)||!new Set(['INTENT','TERMINAL']).has(phase)||
            seen.has(rowKey)||row.provider!=='openrouter'||!createdAt||
            createdAt<=baseline.observed_at||createdAt>current.observed_at){
          throw new Error('provider_statement_activity_timestamp_mismatch');
        }
        seen.add(rowKey);
        if(phase==='INTENT'){intents.add(attemptId);return;}
        terminals.add(attemptId);intents.delete(attemptId);
        if(row.disposition==='OUTCOME_UNKNOWN'){unknown+=1;return;}
        if(row.disposition==='SUCCEEDED'||row.disposition==='HTTP_ERROR'){
          var units=costUnits(row.actual_cost_usd);
          if(units===null||clean(row.cost_source)!=='provider_reported'){uncosted+=1;return;}
          bankUnits+=units;
        }
      });
      offset+=rows.length;
    }
  }catch(error){return Object.assign(withCurrent,
    {provider_statement_interval_start:baseline.observed_at,
      provider_statement_reason:/timestamp_mismatch/.test(String(error&&error.message||error))?
        'provider_statement_timestamp_mismatch':'provider_statement_activity_read_failed'});}
  var unresolved=Array.from(intents).filter(function(id){return !terminals.has(id);}).length;
  var delta=providerDelta-bankUnits;
  var result=Object.assign(withCurrent,{provider_statement_interval_start:baseline.observed_at,
    provider_statement_baseline_id:baseline.statement_id,
    provider_statement_usage_delta_usd:publicCostUnits(providerDelta),
    bank_provider_interval_cost_usd:publicCostUnits(bankUnits),
    provider_statement_delta_usd:publicCostUnits(delta),
    provider_statement_interval_unresolved:unresolved,
    provider_statement_interval_outcome_unknown:unknown,
    provider_statement_interval_uncosted:uncosted});
  if(unresolved>0)return Object.assign(result,{provider_statement_reason:
    'provider_statement_interval_unresolved_attempts'});
  if(unknown>0)return Object.assign(result,{provider_statement_reason:
    'provider_statement_interval_outcome_unknown'});
  if(uncosted>0)return Object.assign(result,{provider_statement_reason:
    'provider_statement_interval_uncosted_egress'});
  if(delta!==0n)return Object.assign(result,{provider_statement_reason:
    'provider_statement_bank_delta_nonzero'});
  return Object.assign(result,{provider_statement_reconciled:true,
    provider_statement_reason:null,
    provider_statement_authority:'memory_bank.provider_account_statements.service_role_readback'});
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
  var nowMs = Number(options && options.now || Date.now());
  var since = new Date(nowMs - 86400000).toISOString();
  var snapshotAt = new Date(nowMs).toISOString();
  var query = new URLSearchParams();
  query.append('created_at','gte.' + since);
  query.append('created_at','lte.' + snapshotAt);
  query.set('select','attempt_id,phase,provider,kind,key_alias,component,ham_uid,service_id,' +
    'disposition,status_code,actual_cost_usd,cost_source,provider_usage,usage_source,created_at');
  query.set('order','created_at.asc,attempt_id.asc,phase.asc');
  Object.keys(scope).forEach(function(field) { query.set(field,'eq.' + scope[field]); });
  var offset = 0, pages = 0, rowsScanned = 0;
  var intents = new Map(), terminalAttempts = new Set(), seenRows = new Set();
  var providers = new Map(), kinds = new Map(), components = new Map(), keyAliases = new Map();
  var admissions = 0, terminal = 0, succeeded = 0, outcomeUnknown = 0, failed = 0;
  var provenEgress = 0;
  var latestOutcomeUnknownMs = null, providerReportedCostUsd = 0;
  var costedTerminal = 0, uncostedProvenEgress = 0, usageReportedTerminal=0;
  var usageReportedCostUnallocated=0,usageTotals=new Map();
  try {
    while (true) {
      var headers = readHeaders(config);
      // The spend wall may publish a complete total only when PostgREST returns the exact
      // relation count. Without this preference a valid final page is followed by `*/*`,
      // which cannot prove whether more billable rows exist.
      headers.Prefer = 'count=exact';
      headers.Range = offset + '-' + (offset + SUMMARY_PAGE_SIZE - 1);
      // The append-only TERMINAL is transport truth. Provider metadata recovered after the
      // response lives in the immutable reconciliation table. The canonical billable view is
      // the one source that coalesces those two facts without mutating either row.
      var response = await doFetch(config.url + '/rest/v1/' + BILLABLE_TABLE + '?' + query.toString(), {
        headers:headers,signal:brain.boundedSignal(options && options.signal, options && options.env)
      });
      if (!response || response.ok !== true) {
        return publish({readable:false,total:null,reason:response &&
          (response.status === 404 || response.status === 400) ? 'provider_spend_schema_unavailable'
            : 'provider_spend_summary_read_failed',at:Date.now()});
      }
      var rows = await boundedJson(response, MAX_STORE_BYTES);
      if (!Array.isArray(rows)) throw new Error('provider_spend_summary_payload_invalid');
      var range = responseRange(response);
      // An empty transport page is terminal only when Content-Range proves there is no
      // known remainder. A provider returning */4000 at offset 500 has not delivered a
      // complete ledger, so the spend wall must fail closed instead of publishing 500 rows.
      if (!rows.length) {
        // An unknown total (`*/*`) is not end-of-ledger proof. Accept only an exact total
        // whose value is already exhausted by this offset, otherwise a proxy that drops
        // count metadata can make a truncated page look complete again.
        if (!range || range.empty !== true || range.total === null || offset < range.total) {
          throw new Error('provider_spend_summary_pagination_unverified');
        }
        break;
      }
      if (!range || range.start !== offset || range.end - range.start + 1 !== rows.length) {
        throw new Error('provider_spend_summary_pagination_unverified');
      }
      pages += 1;
      rowsScanned += rows.length;
      rows.forEach(function(row) {
        var attemptId = clean(row && row.attempt_id);
        var phase = clean(row && row.phase);
        var rowKey = attemptId + ':' + phase;
        if (!attemptId || !new Set(['INTENT','TERMINAL']).has(phase) || seenRows.has(rowKey)) {
          throw new Error('provider_spend_summary_pagination_unstable');
        }
        seenRows.add(rowKey);
        if (phase === 'INTENT') {
          admissions += 1;
          if (!terminalAttempts.has(attemptId)) intents.set(attemptId, row.created_at || null);
          addBucket(providers,row.provider);
          addBucket(kinds,row.kind);
          addBucket(components,publicComponent(row.component));
          addBucket(keyAliases,row.key_alias);
          return;
        }
        terminal += 1;
        terminalAttempts.add(attemptId);
        intents.delete(attemptId);
        if (row.disposition === 'SUCCEEDED') succeeded += 1;
        else if (row.disposition === 'OUTCOME_UNKNOWN') outcomeUnknown += 1;
        else failed += 1;
        if (row.disposition === 'SUCCEEDED' || row.disposition === 'HTTP_ERROR') {
          provenEgress += 1;
          var cost = strictNumber(row.actual_cost_usd);
          if (cost === null) uncostedProvenEgress += 1;
          else { providerReportedCostUsd += cost; costedTerminal += 1; }
          var providerUsage=normalizedProviderUsage(row.provider_usage);
          if(providerUsage){
            usageReportedTerminal+=1;
            if(cost===null)usageReportedCostUnallocated+=1;
            var usageKey=clean(row.provider)+'|'+providerUsage.unit;
            var usageState=usageTotals.get(usageKey)||{provider:clean(row.provider),
              unit:providerUsage.unit,quantity:0,attempts:0};
            usageState.quantity+=providerUsage.quantity;usageState.attempts+=1;
            usageTotals.set(usageKey,usageState);
          }
        }
        if (row.disposition === 'OUTCOME_UNKNOWN') {
          var unknownAt = Date.parse(row.created_at || '');
          if (Number.isFinite(unknownAt) &&
              (latestOutcomeUnknownMs === null || unknownAt > latestOutcomeUnknownMs)) {
            latestOutcomeUnknownMs = unknownAt;
          }
        }
      });
      offset += rows.length;
    }
    var unresolvedTimes = Array.from(intents.values()).map(function(value){return Date.parse(value || '');})
      .filter(Number.isFinite);
    var statementInterval=scoped?{}:await readProviderStatementInterval(options);
    return publish(Object.assign({readable:true,total:admissions,admissions:admissions,
      terminal:terminal,succeeded:succeeded,failed:failed,unresolved:intents.size,
      outcome_unknown:outcomeUnknown,proven_egress:provenEgress,
      provider_reported_cost_usd:Number(providerReportedCostUsd.toFixed(8)),
      costed_terminal:costedTerminal,uncosted_proven_egress:uncostedProvenEgress,
      usage_reported_terminal:usageReportedTerminal,
      usage_reported_cost_unallocated:usageReportedCostUnallocated,
      by_provider_usage:Array.from(usageTotals.values()).map(function(item){
        return Object.assign({},item,{quantity:Number(item.quantity.toFixed(8))});
      }).sort(function(a,b){return b.attempts-a.attempts||
        a.provider.localeCompare(b.provider)||a.unit.localeCompare(b.unit);}),
      latest_outcome_unknown_at:latestOutcomeUnknownMs === null ? null :
        new Date(latestOutcomeUnknownMs).toISOString(),
      latest_unresolved_at:unresolvedTimes.length ?
        new Date(Math.max.apply(Math,unresolvedTimes)).toISOString() : null,
      scope:Object.keys(scope).length ? scope : null,
      window_hours:24,snapshot_at:snapshotAt,pages:pages,rows_scanned:rowsScanned,
      reason:null,at:Date.now(),by_provider:bucketRows(providers),by_kind:bucketRows(kinds),
      by_component:bucketRows(components),by_key_alias:bucketRows(keyAliases)},statementInterval));
  } catch (error) {
    return publish({readable:false,total:null,
      reason:/provider_spend_summary_/.test(String(error && error.message || error))
        ? String(error && error.message || error) : 'provider_spend_store_unavailable',at:Date.now()});
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
  recoverOpenRouterUsage:recoverOpenRouterUsage,
  recoverDelayedOpenRouterCost:recoverDelayedOpenRouterCost,
  recoverDelayedProviderUsage:recoverDelayedProviderUsage,
  writeReconciliation:writeReconciliation,
  writeUsageReconciliation:writeUsageReconciliation,
  writeProviderAccountStatement:writeProviderAccountStatement,
  terminalFromError:terminalFromError,reconcileUnresolved:reconcileUnresolved,
  readSummary:readSummary,cachedSummary:cachedSummary,
  _test:{providerFor:providerFor,bodyFacts:bodyFacts,providerModel:providerModel,keyAlias:keyAlias,
    bankConfig:bankConfig,phaseRow:phaseRow,readPhase:readPhase,
    readReconciliation:readReconciliation,readUsageReconciliation:readUsageReconciliation,
    decimalCost:decimalCost,
    stableJson:stableJson,
    boundedJson:boundedJson,usageFacts:usageFacts,
    openRouterGenerationFacts:openRouterGenerationFacts,providerFactDigest:providerFactDigest,
    normalizedProviderUsage:normalizedProviderUsage,
    providerUsageFactDigest:providerUsageFactDigest,inlineProviderUsage:inlineProviderUsage,
    bankUsageCandidate:bankUsageCandidate,elevenLabsHistoryUsage:elevenLabsHistoryUsage,
    liveAvatarHistoricUsage:liveAvatarHistoricUsage,
    responseBytes:responseBytes,
    replayResponse:replayResponse,
    reconcileGraceSeconds:reconcileGraceSeconds,rpcCall:rpcCall,
    reset:function () { SUMMARY_CACHE=null; }}};
