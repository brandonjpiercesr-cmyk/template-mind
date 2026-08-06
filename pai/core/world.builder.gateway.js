'use strict';

// Inherited worlds keep the ordinary A'NU hands but not a second compiler,
// Vault, council verifier, or World Builder queue. Exact signed requests cross
// this adapter to the one A'NEW owner. The upstream comes only from service env.
const hamSession=require('./ham.session.authorization.js');
const effectAuthorization=require('./pai.outbound.authorization.js');

const PATHS={readKnowledge:'/world-builder/internal/read-knowledge',
  commissionKnowledge:'/world-builder/internal/commission-knowledge',
  submitJob:'/world-builder/internal/submit-job'};
const MAX_RESPONSE_BYTES=256*1024;

function baseUrl(env){
  const value=String(env&& (env.ANEW_URL||env.AIBEBASE_URL)||'').trim().replace(/\/+$/,'');
  return /^https?:\/\/[^/]+/i.test(value)?value:'';
}

function exactId(value,max){
  const text=String(value==null?'':value);
  return text===text.trim()&&text.length>=8&&text.length<=(max||160)&&
    /^[A-Za-z0-9._:-]+$/.test(text)?text:null;
}

function plain(value,max){
  return String(value==null?'':value).replace(/[\u0000-\u001f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,max||16000);
}

function artifactRefs(values,ham){
  const prefix='vault.'+ham.toLowerCase()+'.';
  const seen=new Set();
  return (Array.isArray(values)?values:[]).map(function(value){return String(value||'');})
    .filter(function(value){
      if(!value.startsWith(prefix)||value.length>200||!/^[A-Za-z0-9._:-]+$/.test(value)||seen.has(value))return false;
      seen.add(value);return true;
    });
}

function humanKnowledge(value){
  if(!value||value.ok!==true)return{ok:false,status:'knowledge_unavailable'};
  const items=(Array.isArray(value.items)?value.items:[]).slice(0,100).map(function(item){
    return{title:plain(item&&item.title,500),status:plain(item&&item.status,80),
      body:plain(item&&item.body,16000),more_available:item&&item.more_available===true,
      claims:(Array.isArray(item&&item.claims)?item.claims:[]).slice(0,200).map(function(claim){
        return{text:plain(claim&&claim.text,4000),note:plain(claim&&claim.note,1000)};
      }),provenance:(Array.isArray(item&&item.provenance)?item.provenance:[]).slice(0,100)
        .map(function(source){return{label:plain(source&&source.label,500)};})};
  });
  return{ok:true,title:plain(value.title,500)||'Your knowledge',read_only:true,
    items:items,more_available:value.more_available===true,
    next_cursor:value.more_available===true?plain(value.next_cursor,500)||null:null};
}

function publicOutcome(kind,value,status){
  const out=value||{};
  if(!out.ok)return{ok:false,status:status||null,reason:plain(out.reason,300)||
    'world_builder_gateway_request_failed',recoverable:out.recoverable===true};
  if(kind==='commissionKnowledge')return{ok:true,status:plain(out.status,80)||'complete',
    disposition:plain(out.disposition,80)||null,why:plain(out.why,4000)||null,
    why_pulled:plain(out.why_pulled,4000)||null,changed:out.changed===true,reused:out.reused===true};
  return{ok:true,status:plain(out.status,80)||'TASK',queued:out.queued===true,
    duplicate:out.duplicate===true};
}

async function readResponse(response,kind){
  let raw='';
  try{raw=await response.text();}catch(error){return{ok:false,
    reason:'world_builder_gateway_response_unavailable'};}
  if(Buffer.byteLength(raw,'utf8')>MAX_RESPONSE_BYTES)return{ok:false,
    reason:'world_builder_gateway_response_too_large'};
  let parsed;
  try{parsed=raw?JSON.parse(raw):null;}catch(error){parsed=null;}
  if(!response||!response.ok||!parsed)return{ok:false,status:response&&response.status,
    reason:parsed&&plain(parsed.reason,300)||'world_builder_gateway_request_failed',
    recoverable:!!(response&&response.status>=500)};
  return kind==='readKnowledge'?humanKnowledge(parsed):publicOutcome(kind,parsed,response.status);
}

function lineage(input){
  const value=input||{};
  const ham=hamSession.normalizeHamUid(value.hamUid||value.ham_uid);
  const requestId=exactId(value.requestId||value.request_id,160);
  return ham&&requestId?{hamUid:ham,requestId:requestId}:null;
}

async function invoke(kind,body,options){
  const opts=options||{};
  const env=opts.env||process.env;
  const base=baseUrl(env);
  if(!base)return{ok:false,reason:'world_builder_gateway_url_unconfigured'};
  const authorization=opts.effectAuthorization||effectAuthorization;
  const signed=authorization.internalEffectHeaders(PATHS[kind],body,env,opts.nowMs);
  if(!signed)return{ok:false,reason:'world_builder_gateway_authorization_unconfigured'};
  const fetcher=opts.fetch||global.fetch;
  if(typeof fetcher!=='function')return{ok:false,reason:'world_builder_gateway_transport_unavailable'};
  const timeout=Math.max(1000,Math.min(180000,Number(opts.timeoutMs)||
    (kind==='readKnowledge'?15000:120000)));
  try{
    const response=await fetcher(base+PATHS[kind],{method:'POST',
      headers:Object.assign({'Content-Type':'application/json'},signed),
      body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
    return readResponse(response,kind);
  }catch(error){
    return kind==='readKnowledge'?{ok:false,status:'knowledge_unavailable'}:
      {ok:false,status:'outcome_unknown',reason:/Abort|Timeout/i.test(String(error&&
        (error.name||error.message)||''))?'world_builder_gateway_timeout':
        'world_builder_gateway_unavailable',recoverable:true};
  }
}

async function readKnowledge(input,options){
  const line=lineage(input);
  if(!line)return{ok:false,status:'knowledge_unavailable'};
  return invoke('readKnowledge',{hamUid:line.hamUid,requestId:line.requestId,
    includeHistory:input&& (input.includeHistory===true||input.include_history===true)},options);
}

async function commissionKnowledge(input,options){
  const line=lineage(input);
  const cycleId=exactId(input&& (input.cycleId||input.cycle_id),220);
  const refs=line?artifactRefs(input&& (input.artifactRefs||input.artifact_refs),line.hamUid):[];
  if(!line||!cycleId||!refs.length)return{ok:false,reason:'knowledge_handoff_lineage_required'};
  return invoke('commissionKnowledge',{hamUid:line.hamUid,requestId:line.requestId,
    cycleId:cycleId,title:plain(input.title,300),artifactRefs:refs,
    councilProof:input.councilProof||input.council_proof},options);
}

async function submitJob(input,options){
  const line=lineage(input);
  const cycleId=exactId(input&& (input.cycleId||input.cycle_id),220);
  if(!line||!cycleId)return{ok:false,reason:'world_job_lineage_required'};
  return invoke('submitJob',{hamUid:line.hamUid,requestId:line.requestId,cycleId:cycleId,
    councilProof:input.councilProof||input.council_proof,
    artifactRefs:artifactRefs(input.artifactRefs||input.artifact_refs,line.hamUid),
    subject:input.subject,detail:input.detail,acceptance:input.acceptance,
    requestedOwner:input.requestedOwner||input.requested_owner||null,level:input.level},options);
}

module.exports={readKnowledge:readKnowledge,commissionKnowledge:commissionKnowledge,
  submitJob:submitJob,_test:{PATHS:PATHS,baseUrl:baseUrl,artifactRefs:artifactRefs,
    humanKnowledge:humanKnowledge,publicOutcome:publicOutcome,readResponse:readResponse}};
