// ⬡B:core.model_control:ADAPTER:central_anew_model_control_owner:20260805⬡
// An inherited world carries A'NU's model proposal hand, but it does not own a
// second seat map, proposal validator, or durable writer. Exact signed intent
// crosses this adapter once. Central A'NEW owns validation and persistence.
'use strict';

const effectAuthorization=require('./pai.outbound.authorization.js');

const PATH='/model-control/internal/intents';

function baseUrl(env,explicit){
  const value=String(explicit || env.ANEW_MODEL_CONTROL_URL || env.ANEW_URL ||
    env.AIBEBASE_URL || '').trim().replace(/\/+$/,'');
  return /^https?:\/\/[^/]+/i.test(value) ? value : '';
}

async function parsed(response){
  let payload=null;
  try{
    const raw=await response.text();
    payload=raw ? JSON.parse(raw) : null;
  }catch(error){
    return {ok:false,reason:'model_control_central_response_invalid',
      status:response && response.status};
  }
  if(!response || !response.ok || !payload || payload.ok !== true){
    return Object.assign({ok:false,status:response && response.status,
      reason:payload && payload.reason || 'model_control_central_request_failed'},payload || {});
  }
  return payload;
}

async function writeReasonedIntent(input,options){
  const opts=options || {};
  const env=opts.env || process.env;
  const hamUid=String(opts.ham_uid || opts.hamUid || '').trim().toUpperCase();
  const requestId=String(opts.request_id || opts.requestId || '').trim();
  const cycleId=String(opts.cycle_id || opts.cycleId || '').trim();
  const requestText=String(opts.request_text || opts.requestText || '').trim();
  if(!hamUid || !requestId || !cycleId || !requestText){
    return {ok:false,reason:'model_control_central_lineage_required'};
  }
  const body={hamUid:hamUid,requestId:requestId,cycle_id:cycleId,
    request_text:requestText,council_proof:opts.council_proof || opts.councilProof,
    decision:input};
  const authorization=opts.effectAuthorization || effectAuthorization;
  const headers=authorization.internalEffectHeaders(PATH,body,env,opts.nowMs);
  if(!headers)return {ok:false,reason:'model_control_central_authorization_unconfigured'};
  const base=baseUrl(env,opts.baseUrl);
  if(!base)return {ok:false,reason:'model_control_central_url_unconfigured'};
  try{
    const response=await (opts.fetch || global.fetch)(base + PATH,{method:'POST',
      headers:Object.assign({'Content-Type':'application/json'},headers),
      body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1000,
        Math.min(30000,Number(opts.timeoutMs) || 15000)))});
    return parsed(response);
  }catch(error){
    return {ok:false,reason:'model_control_central_unavailable'};
  }
}

module.exports={writeReasonedIntent:writeReasonedIntent,
  _test:{baseUrl:baseUrl,parsed:parsed,PATH:PATH}};
