// ⬡B:core.cookoff_client:MODULE:one_signed_internal_cookoff_door:20260725⬡
'use strict';

const crypto = require('node:crypto');

function baseUrl(env, explicit) {
  var value = explicit || env.STATIONS_URL || env.AIBEBASE_URL || env.SELF_BASE_URL || '';
  value = String(value).trim().replace(/\/+$/,'');
  if (!/^https?:\/\/[^/]+/i.test(value)) return '';
  return value;
}

function callerSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._:-]+/g,'_')
    .replace(/^_+|_+$/g,'').slice(0,36);
}

function canonicalRequest(input) {
  input = input || {};
  var task = String(input.task || '').trim();
  var system = input.system == null ? '' : String(input.system);
  var maxTokens = input.max_tokens == null ? 2000 : Number(input.max_tokens);
  var invokedBy = String(input.invoked_by || input.caller || '').trim().slice(0,120);
  if (!task || task.length > 20000) return {ok:false,reason:'cookoff_client_task_invalid'};
  if (system.length > 8000) return {ok:false,reason:'cookoff_client_system_invalid'};
  if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 4000) {
    return {ok:false,reason:'cookoff_client_token_budget_invalid'};
  }
  // Property order is deliberate. The exact bytes signed here are the exact
  // bytes put on the wire and preserved by index.js as req.rawBody.
  return {ok:true,body:{task:task,system:system,max_tokens:maxTokens,
    invoked_by:invokedBy || 'internal_cookoff_client'}};
}

function idempotencyKey(caller, cycleId, rawBody, prefix) {
  var slug = callerSlug(caller);
  var cycle = String(cycleId || '').trim();
  if (!slug || cycle.length < 4 || cycle.length > 240) return '';
  var digest = crypto.createHash('sha256')
    .update(slug + '\0' + cycle + '\0' + rawBody,'utf8').digest('hex');
  var namespace = callerSlug(prefix || 'cookoff') || 'paid';
  return namespace + '.' + slug + '.' + digest;
}

function signedHeaders(rawBody, idem, env, nowMs, names) {
  names = names || {};
  var headers = {'Content-Type':'application/json','Idempotency-Key':idem};
  var hmacSecret = String(env[names.hmacEnv || 'COOKOFF_HMAC_SECRET'] || '');
  if (hmacSecret) {
    var timestamp = String(Math.floor(Number(nowMs == null ? Date.now() : nowMs) / 1000));
    headers['x-anew-timestamp'] = timestamp;
    headers['x-anew-signature'] = 'sha256=' + crypto.createHmac('sha256',hmacSecret)
      .update(timestamp + '.' + rawBody,'utf8').digest('hex');
    return {ok:true,headers:headers,kind:'hmac'};
  }
  var token = String(env[names.tokenEnv || 'COOKOFF_SERVICE_TOKEN'] ||
    (names.allowPaidRouteSecret === false ? '' : env.PAID_ROUTE_SECRET) || '');
  if (!token) return {ok:false,reason:'cookoff_client_auth_unconfigured'};
  headers.Authorization = 'Bearer ' + token;
  return {ok:true,headers:headers,kind:'bearer'};
}

async function parsedResponse(response) {
  var payload = null;
  try {
    if (response && typeof response.text === 'function') {
      var text = await response.text();
      payload = text ? JSON.parse(text) : null;
    } else if (response && typeof response.json === 'function') payload = await response.json();
  } catch (e) { return {ok:false,reason:'cookoff_client_response_invalid',status:response && response.status}; }
  if (!response || !response.ok || !payload || payload.ok !== true) {
    return Object.assign({ok:false,status:response && response.status,
      reason:payload && payload.reason || 'cookoff_request_failed'},payload || {});
  }
  return payload;
}

async function runCookoff(input, options) {
  var opts = options || {};
  var env = opts.env || process.env;
  var canonical = canonicalRequest(input);
  if (!canonical.ok) return canonical;
  var rawBody = JSON.stringify(canonical.body);
  var idem = idempotencyKey(input && input.caller,input && input.cycle_id,rawBody);
  if (!idem) return {ok:false,reason:'cookoff_client_cycle_identity_required'};
  var base = baseUrl(env,opts.baseUrl);
  if (!base) return {ok:false,reason:'cookoff_client_base_unconfigured'};
  var signed = signedHeaders(rawBody,idem,env,opts.nowMs);
  if (!signed.ok) return signed;
  var fetchImpl = opts.fetch || global.fetch;
  try {
    var response = await fetchImpl(base + '/cookoff/run',{
      method:'POST',headers:signed.headers,body:rawBody,
      signal:AbortSignal.timeout(Math.max(1000,Math.min(180000,Number(opts.timeoutMs) || 150000)))
    });
    var parsed = await parsedResponse(response);
    if (parsed && typeof parsed === 'object') {
      parsed.client_idempotency_key = idem;
      parsed.client_auth = signed.kind;
    }
    return parsed;
  } catch (e) {
    return {ok:false,reason:'cookoff_request_unavailable',detail:String(e && e.message || e).slice(0,160),
      client_idempotency_key:idem};
  }
}

module.exports = {runCookoff:runCookoff,
  deterministicKey:idempotencyKey,buildSignedHeaders:signedHeaders,
  _test:{baseUrl:baseUrl,callerSlug:callerSlug,canonicalRequest:canonicalRequest,
    idempotencyKey:idempotencyKey,signedHeaders:signedHeaders,parsedResponse:parsedResponse}};
