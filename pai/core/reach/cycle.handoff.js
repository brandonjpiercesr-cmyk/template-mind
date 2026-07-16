// ⬡B:core.reach.cycle_handoff:WIRE:per_ham_pai_exit:20260716⬡
// entered via the ABAHAM door, serving the REACH internal channel
'use strict';

const crypto = require('node:crypto');

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
function headers(write) {
  var h={apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()};
  if(write){h['Content-Profile']=_schema();h['Content-Type']='application/json';h.Prefer='return=representation';}
  return h;
}

async function exactSource(source, select) {
  var response=await fetch(_bu()+'/rest/v1/'+_tbl()+'?source=eq.'+
    encodeURIComponent(source)+'&limit=1&select='+(select||'source'),{headers:headers(false)});
  if(!response.ok) throw new Error('candidate_read_failed:'+response.status);
  var rows=await response.json();
  if(!Array.isArray(rows)) throw new Error('candidate_read_invalid');
  return rows[0]||null;
}

async function writeExact(payload) {
  var response=await fetch(_bu()+'/rest/v1/'+_tbl(),{method:'POST',headers:headers(true),
    body:JSON.stringify(payload)}).catch(function(){return null;});
  var rows=response&&response.ok?await response.json().catch(function(){return null;}):null;
  return !!(Array.isArray(rows)&&rows.length===1&&rows[0].source===payload.source&&
    rows[0].ham_uid===payload.ham_uid&&String(rows[0].content||'')===String(payload.content||''));
}

async function stampCandidate(input) {
  if(!_bu()||!_bk())return{ok:false,reason:'no_brain'};
  var source='reach.candidate.'+input.hamUid+'.'+input.cycleId;
  try {
    if(await exactSource(source,'source'))return{ok:true,source:source,reused:true};
  } catch(eRead){return{ok:false,reason:eRead.message,source:source};}
  var content=JSON.stringify({cycleId:input.cycleId,requestId:input.requestId,
    channel:input.channel,world:input.world||null,answer_digest:crypto.createHash('sha256')
      .update(String(input.answer||''),'utf8').digest('hex'),status:'QUEUED'});
  var ok=await writeExact({ham_uid:input.hamUid,agent_global:'REACH',
    stamp_type:'REACH_CANDIDATE',source:source,
    acl_stamp:'⬡B:core.reach.cycle_handoff:REACH_CANDIDATE:pai_exit:20260716⬡',
    summary:'[REACH CANDIDATE] committed PAI cycle exited for per-HAM outreach judgment',
    content:content,importance:4});
  return ok?{ok:true,source:source}:{ok:false,reason:'candidate_stamp_unverified',source:source};
}

async function stampDone(input,result) {
  var source='reach.candidate.done.'+input.hamUid+'.'+input.cycleId;
  try { if(await exactSource(source,'source'))return{ok:true,source:source,reused:true}; }
  catch(eRead){return{ok:false,reason:eRead.message};}
  var content=JSON.stringify({cycleId:input.cycleId,requestId:input.requestId,
    candidate:'reach.candidate.'+input.hamUid+'.'+input.cycleId,
    delivered:!!(result.sent||result.called||result.funneled),
    channel:result.proposedChannel||null,reason:result.reason||null,status:'DONE'});
  var ok=await writeExact({ham_uid:input.hamUid,agent_global:'REACH',
    stamp_type:'REACH_CANDIDATE_DONE',source:source,
    acl_stamp:'⬡B:core.reach.cycle_handoff:REACH_CANDIDATE_DONE:consumed:20260716⬡',
    summary:'[REACH CANDIDATE DONE] per-HAM outreach judgment completed',content:content,
    importance:result.sent||result.called||result.funneled?6:3});
  return ok?{ok:true,source:source}:{ok:false,reason:'candidate_done_stamp_unverified'};
}

async function consumeCandidate(input) {
  var doneSource='reach.candidate.done.'+input.hamUid+'.'+input.cycleId;
  try { if(await exactSource(doneSource,'source'))return{ok:true,skipped:'already_done'}; }
  catch(eRead){return{ok:false,reason:eRead.message};}
  var claimSource='reach.candidate.consume.'+input.hamUid+'.'+input.cycleId;
  var claimant=claimSource+'.'+crypto.randomUUID();
  var won=await require('../claim_lock.js').claimTask(claimSource,claimant,5*60*1000)
    .catch(function(){return false;});
  if(!won)return{ok:false,reason:'candidate_consumer_claim_denied'};
  var result=await require('../outreach.js').outreachPassForHam(input.hamUid,false,
    {world:input.world||null});
  // Missing identity/contact is birth-order state, not a completed judgment.
  // Leave it pending; the five-minute lease lets the durable consumer retry.
  if(!result.ok&&/^(no_contact_for_ham|recipient_identity_unresolved|no_brain)/.test(result.reason||'')) {
    return{ok:false,pending:true,reason:result.reason};
  }
  var done=await stampDone(input,result);
  return{ok:!!done.ok,outreach:result,done:done};
}

async function afterCommittedCycle(input) {
  var uid=String(input&&input.hamUid||'').toUpperCase();
  if(!uid||!input.cycleId||!input.requestId)return{ok:false,reason:'cycle_identity_required'};
  var normalized=Object.assign({},input,{hamUid:uid});
  var candidate=await stampCandidate(normalized);
  if(!candidate.ok)return candidate;
  var consumed=await consumeCandidate(normalized);
  return{ok:!!consumed.ok,candidate:candidate.source,consumed:consumed};
}

async function consumePending() {
  if(!_bu()||!_bk())return{ok:false,reason:'no_brain'};
  var since=new Date(Date.now()-24*60*60*1000).toISOString();
  var response=await fetch(_bu()+'/rest/v1/'+_tbl()+'?stamp_type=eq.REACH_CANDIDATE'+
    '&created_at=gte.'+encodeURIComponent(since)+'&order=created_at.asc&limit=100'+
    '&select=ham_uid,source,content',{headers:headers(false)});
  if(!response.ok)return{ok:false,reason:'candidate_scan_failed:'+response.status};
  var rows=await response.json();
  var consumed=[];
  for(const row of rows){
    var content={};try{content=JSON.parse(row.content||'{}');}catch(e){}
    if(!row.ham_uid||!content.cycleId||!content.requestId)continue;
    try {
      consumed.push(await consumeCandidate({hamUid:String(row.ham_uid).toUpperCase(),
        cycleId:content.cycleId,requestId:content.requestId,world:content.world||null}));
    } catch(eConsume) {
      consumed.push({ok:false,reason:'candidate_consume_failed:'+eConsume.message});
    }
  }
  return{ok:true,seen:rows.length,consumed:consumed.length};
}

function startConsumer(intervalMs) {
  var ms=intervalMs||parseInt(process.env.REACH_CANDIDATE_INTERVAL_MS||'',10)||60000;
  setTimeout(function(){consumePending().catch(function(e){console.error('[REACH] candidate scan failed:',e.message);});},5000);
  var timer=setInterval(function(){consumePending().catch(function(e){console.error('[REACH] candidate scan failed:',e.message);});},ms);
  if(timer.unref)timer.unref();
  return timer;
}

module.exports={afterCommittedCycle,consumePending,startConsumer,
  _test:{stampCandidate,consumeCandidate,stampDone}};
