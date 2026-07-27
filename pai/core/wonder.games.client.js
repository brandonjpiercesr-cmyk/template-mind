// ⬡B:core.wonder_games_client:MODULE:one_signed_internal_competition_door:20260725⬡
'use strict';
const signedCore=require('./cookoff.client.js');

function baseUrl(env,explicit){var value=explicit||env.STATIONS_URL||env.AIBEBASE_URL||env.SELF_BASE_URL||'';
  value=String(value).trim().replace(/\/+$/,'');return /^https?:\/\/[^/]+/i.test(value)?value:'';}

async function parse(response){var payload=null;try{var text=await response.text();payload=text?JSON.parse(text):null;}
  catch(e){return{ok:false,reason:'wonder_games_client_response_invalid',status:response&&response.status};}
  if(!response||!response.ok||!payload||payload.ok!==true)return Object.assign({ok:false,
    status:response&&response.status,reason:payload&&payload.reason||'wonder_games_request_failed'},payload||{});
  return payload;}

async function compete(input,options){input=input||{};var opts=options||{},env=opts.env||process.env;
  var task=String(input.task||'').trim(),ham=String(input.ham_uid||input.hamUid||'').trim().toUpperCase();
  var tokens=input.max_tokens==null?4000:Number(input.max_tokens);
  if(!task||task.length>20000)return{ok:false,reason:'wonder_games_client_task_invalid'};
  if(!/^[A-Z0-9._:-]{2,160}$/.test(ham))return{ok:false,reason:'wonder_games_client_ham_required'};
  if(!Number.isInteger(tokens)||tokens<64||tokens>4000)return{ok:false,reason:'wonder_games_client_token_budget_invalid'};
  var body={task:task,ham_uid:ham,max_tokens:tokens,
    invoked_by:String(input.invoked_by||input.caller||'internal_wonder_games_client').slice(0,120)};
  var raw=JSON.stringify(body);
  var idem=signedCore.deterministicKey(input.caller,input.cycle_id,raw,'wonder_games');
  if(!idem)return{ok:false,reason:'wonder_games_client_cycle_identity_required'};
  var base=baseUrl(env,opts.baseUrl);if(!base)return{ok:false,reason:'wonder_games_client_base_unconfigured'};
  var signed=signedCore.buildSignedHeaders(raw,idem,env,opts.nowMs,{
    hmacEnv:'WONDER_GAMES_HMAC_SECRET',tokenEnv:'WONDER_GAMES_SERVICE_TOKEN',
    allowPaidRouteSecret:false});
  if(!signed.ok)return{ok:false,reason:String(signed.reason||'').replace(/^cookoff_/,'wonder_games_')};
  try{var response=await(opts.fetch||global.fetch)(base+'/wonder-games/compete',{method:'POST',
    headers:signed.headers,body:raw,signal:AbortSignal.timeout(Math.max(1000,
      Math.min(180000,Number(opts.timeoutMs)||150000)))});
    var out=await parse(response);out.client_idempotency_key=idem;out.client_auth=signed.kind;return out;
  }catch(e){return{ok:false,reason:'wonder_games_request_unavailable',
    detail:String(e&&e.message||e).slice(0,160),client_idempotency_key:idem};}}

module.exports={compete:compete,_test:{baseUrl:baseUrl,parse:parse}};
