// ⬡B:core.model_deployment_registry:MODULE:logical_serverless_deployments_only:20260804⬡
'use strict';

const DEPLOYMENTS = Object.freeze({
  'modal.qwen36.pilot.v1':Object.freeze({
    alias:'modal.qwen36.pilot.v1',
    provider:'modal',
    base_url_env:'MODEL_DEPLOYMENT_MODAL_QWEN36_BASE_URL',
    model_env:'MODEL_DEPLOYMENT_MODAL_QWEN36_MODEL',
    revision_env:'MODEL_DEPLOYMENT_MODAL_QWEN36_REVISION',
    key_env:'MODAL_PROXY_TOKEN_ID',
    secret_env:'MODAL_PROXY_TOKEN_SECRET',
    default_model:'Qwen/Qwen3.6-35B-A3B-FP8',
    auth_kind:'modal_proxy',
    eligible_seats:Object.freeze(['coda','deploy_tool','cookoff_qwen']),
    capabilities:Object.freeze({
      context_tokens:262144,tools:true,structured_output:true,reasoning:true,
      vision:false,openai_chat_completions:true,streaming:false
    }),
    runtime_contract:Object.freeze({
      scale_to_zero:true,min_containers:0,max_containers:1,gpu:'H100!',gpu_count:1,
      provider_cancellation:'not_commissioned',billing_reconciliation:'required'
    })
  })
});

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function modalBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); }
  catch (error) { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || !/\.modal\.run$/i.test(parsed.hostname)) return null;
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function endpoint(baseUrl, suffix) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/v1$/i.test(base)) return base + suffix;
  return base + '/v1' + suffix;
}

function rootEndpoint(baseUrl, suffix) {
  const base=String(baseUrl || '').replace(/\/+$/,'').replace(/\/v1$/i,'');
  return base + suffix;
}

function publicDeployment(declared) {
  if (!declared) return null;
  return {alias:declared.alias,provider:declared.provider,
    default_model:declared.default_model,auth_kind:declared.auth_kind,
    eligible_seats:Array.isArray(declared.eligible_seats) ? declared.eligible_seats.slice() : [],
    capabilities:Object.assign({},declared.capabilities || {}),
    runtime_contract:Object.assign({},declared.runtime_contract || {})};
}

function catalogForSeat(seat) {
  const name=clean(seat,100);
  return Object.keys(DEPLOYMENTS).map(function(alias){return DEPLOYMENTS[alias];})
    .filter(function(declared){
      return Array.isArray(declared.eligible_seats) && declared.eligible_seats.includes(name);
    }).map(publicDeployment);
}

function resolve(alias, env) {
  const runtime = env || process.env;
  const declared = DEPLOYMENTS[clean(alias, 180)];
  if (!declared) return {ok:false,reason:'model_deployment_unknown'};
  const baseUrl = modalBaseUrl(runtime[declared.base_url_env]);
  const model = clean(runtime[declared.model_env] || declared.default_model, 180);
  const revision = clean(runtime[declared.revision_env], 240) || null;
  const key = clean(runtime[declared.key_env], 500);
  const secret = clean(runtime[declared.secret_env], 500);
  if (!baseUrl) return {ok:false,reason:'model_deployment_url_unconfigured',
    alias:declared.alias,provider:declared.provider,state:'sleeping'};
  if (!key || !secret) return {ok:false,reason:'model_deployment_auth_unconfigured',
    alias:declared.alias,provider:declared.provider,state:'sleeping'};
  if (!revision) return {ok:false,reason:'model_deployment_revision_unconfigured',
    alias:declared.alias,provider:declared.provider,state:'unverified'};
  if (!/^sha256:[a-f0-9]{64}$/i.test(revision)) {
    return {ok:false,reason:'model_deployment_revision_invalid',alias:declared.alias,
      provider:declared.provider,state:'unverified'};
  }
  return {ok:true,alias:declared.alias,provider:declared.provider,model:model,
    revision:revision,state:'configured',chat_url:endpoint(baseUrl,'/chat/completions'),
    models_url:endpoint(baseUrl,'/models'),
    attestation_url:rootEndpoint(baseUrl,'/anew/attestation'),auth_kind:declared.auth_kind,
    key_env:declared.key_env,secret_env:declared.secret_env,
    capabilities:Object.assign({},declared.capabilities || {}),
    runtime_contract:Object.assign({},declared.runtime_contract || {})};
}

function publicState(alias, env) {
  const runtime=env || process.env;
  const declared=DEPLOYMENTS[clean(alias,180)];
  const out = resolve(alias, env);
  const stages=declared ? [
    {stage:'endpoint',ready:!!modalBaseUrl(runtime[declared.base_url_env]),
      missing:[declared.base_url_env]},
    {stage:'model_identity',ready:!!clean(runtime[declared.model_env] || declared.default_model,180),
      missing:[declared.model_env]},
    {stage:'deployment_proof',ready:/^sha256:[a-f0-9]{64}$/i.test(
      clean(runtime[declared.revision_env],240)),missing:[declared.revision_env]},
    {stage:'private_access',ready:!!(clean(runtime[declared.key_env],500) &&
      clean(runtime[declared.secret_env],500)),missing:[declared.key_env,declared.secret_env]}
  ].map(function(row){return {stage:row.stage,ready:row.ready,
    missing:row.ready ? [] : row.missing};}) : [];
  return {alias:out.alias || clean(alias, 180),provider:out.provider || null,
    model:out.ok ? out.model : null,revision:out.ok ? out.revision : null,
    state:out.state || 'unavailable',configured:out.ok === true,ready:false,
    reason:out.ok ? null : out.reason,
    capabilities:declared ? Object.assign({},declared.capabilities || {}) : {},
    runtime_contract:declared ? Object.assign({},declared.runtime_contract || {}) : {},
    stages:stages,
    missing_configuration:stages.reduce(function(all,row){
      return all.concat(row.missing);
    },[])};
}

module.exports = {DEPLOYMENTS,resolve,publicState,catalogForSeat,
  _test:{modalBaseUrl,endpoint,rootEndpoint,publicDeployment}};
