// ⬡B:core.reach.cycle_handoff:WIRE:per_ham_pai_exit:20260717⬡
// entered via the ABAHAM door, serving the REACH internal channel
'use strict';

const crypto = require('node:crypto');

const CANDIDATE_VERSION = 'anew.reach.candidate.v2';
const CANDIDATE_STAMP = 'REACH_CANDIDATE';
const CANDIDATE_ACL =
  '⬡B:core.reach.cycle_handoff:REACH_CANDIDATE:verified_pai_exit:20260717⬡';
const RECOVERY_CHECKPOINT_VERSION='anew.reach.recovery-checkpoint.v1';
const RECOVERY_CHECKPOINT_STAMP='REACH_RECOVERY_CHECKPOINT';
const RECOVERY_CHECKPOINT_HAM='REACH.SYSTEM';
const RECOVERY_CHECKPOINT_PREFIX='reach.recovery.checkpoint.';
const RECOVERY_CHECKPOINT_ACL=
  '⬡B:core.reach.cycle_handoff:REACH_RECOVERY_CHECKPOINT:page_verified:20260717⬡';
const DEFAULT_RECOVERY_LOOKBACK_MS=24*60*60*1000;
const RECOVERY_DISPOSITION_VERSION='anew.reach.recovery-disposition.v1';
const RECOVERY_DISPOSITION_PREFIX='reach.recovery.disposition.';
const RECOVERY_DISPOSITION_ACL=
  '⬡B:core.reach.cycle_handoff:REACH_RECOVERY_CHECKPOINT:terminal_receipt_disposition:20260717⬡';
const DEFAULT_RECOVERY_PREPARED_GRACE_MS=15*60*1000;
const RECOVERY_TERMINAL_REASONS=Object.freeze([
  'PERMANENTLY_UNCOMMITTED','RECEIPT_MARKER_INVALID','STAMP_NON_UNIQUE',
  'COMMITTED_PAIR_INVALID'
]);

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}
function headers(write) {
  var h={apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()};
  if(write){h['Content-Profile']=_schema();h['Content-Type']='application/json';h.Prefer='return=representation';}
  return h;
}

async function ensureQueueUniqueness(){
  return require('../claim_lock.js').ensureReachQueueUniqueness({url:_bu(),key:_bk(),
    schema:_schema(),table:_tbl()});
}

function stableStringify(value) {
  if(value===null)return'null';
  if(Array.isArray(value))return'['+value.map(stableStringify).join(',')+']';
  if(typeof value==='object')return'{'+Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+stableStringify(value[key]);
  }).join(',')+'}';
  return JSON.stringify(value);
}

function candidateSource(hamUid,cycleId){return'reach.candidate.'+hamUid+'.'+cycleId;}
function candidateEnqueueClaimSource(hamUid,cycleId){
  var source=candidateSource(hamUid,cycleId);
  return'reach_candidate_enqueue:'+hamUid+':'+source;
}
function candidateConsumeClaimSource(hamUid,cycleId){
  return'reach.candidate.consume.'+hamUid+'.'+cycleId;
}
function decisionSourcePattern(hamUid){return new RegExp('^reach\\.cycle_decision\\.'+
  String(hamUid||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+
  '\\.[a-f0-9]{64}\\.[a-f0-9]{64}$');}

async function exactRows(hamUid,stampType,source,select) {
  var response;
  try{
    response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+
      '?ham_uid=eq.'+encodeURIComponent(hamUid)+'&agent_global=eq.REACH'+
      '&stamp_type=eq.'+encodeURIComponent(stampType)+
      '&source=eq.'+encodeURIComponent(source)+'&limit=2&select='+
      (select||'source'),{headers:headers(false)});
  }catch(eRead){response=null;}
  if(!response||response.ok!==true)throw new Error('candidate_read_failed:'+
    (response&&response.status||'network'));
  var rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('candidate_read_invalid');
  return rows;
}

async function writeExact(payload) {
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl(),{
    method:'POST',headers:headers(true),body:JSON.stringify(payload)
  }).catch(function(){return null;});
  var rows=response&&response.ok?await response.json().catch(function(){return null;}):null;
  return !!(Array.isArray(rows)&&rows.length===1&&rows[0].source===payload.source&&
    rows[0].ham_uid===payload.ham_uid&&String(rows[0].content||'')===String(payload.content||''));
}

function compactProofMatches(left,right) {
  return stableStringify(left||null)===stableStringify(right||null);
}

function candidateRowFromInput(input) {
  input=input||{};
  var hamUid=String(input.hamUid||'').trim().toUpperCase();
  var requestId=String(input.requestId||'').trim();
  var cycleId=String(input.cycleId||'').trim();
  var question=typeof input.question==='string'?input.question:'';
  var deliberationInput=typeof input.deliberationInput==='string'?input.deliberationInput:'';
  var answer=typeof input.answer==='string'?input.answer:'';
  if(!/^[A-Z0-9._:-]{2,160}$/.test(hamUid)||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(requestId)||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(cycleId)||!question.trim()||
      !deliberationInput.trim()||!answer.trim())return null;
  var supplied=input.councilResult;
  var receipt=supplied&&(supplied.council_receipt||supplied.councilReceipt);
  var stampProof=supplied&&(supplied.stamp_proof||supplied.stampProof);
  var committedAt=stampProof&&typeof stampProof.read_back_at==='string'&&
    Number.isFinite(Date.parse(stampProof.read_back_at))
    ?new Date(Date.parse(stampProof.read_back_at)).toISOString():null;
  if(!committedAt)return null;
  var result={ok:true,answer:answer,council_receipt:receipt,stamp_proof:stampProof};
  var council=require('../pai.outbound.council.js');
  var verified=council.requireVerifiedCouncilResult(result,{hamUid:hamUid,
    requestId:requestId,cycleId:cycleId,question:question,
    deliberationInput:deliberationInput,answer:answer});
  var compact=verified&&verified.ok?council.compactCouncilProof(result):null;
  if(!verified||!verified.ok||!compact||compact.committed!==true||
      compact.readback_verified!==true||compact.row_count!==9||
      !compactProofMatches(input.councilProof||compact,compact))return null;
  var content={version:CANDIDATE_VERSION,cycleId:cycleId,requestId:requestId,
    channel:String(input.channel||'').trim().toLowerCase()||'unknown',
    world:input.world||null,committed_at:committedAt,
    question:question,deliberation_input:deliberationInput,
    answer:answer,answer_digest:crypto.createHash('sha256').update(answer,'utf8').digest('hex'),
    council_proof:compact,originating_council:{council_receipt:receipt,stamp_proof:stampProof},
    status:'QUEUED'};
  var source=candidateSource(hamUid,cycleId);
  var row={ham_uid:hamUid,agent_global:'REACH',stamp_type:CANDIDATE_STAMP,
    source:source,acl_stamp:CANDIDATE_ACL,
    summary:'[REACH CANDIDATE] verified committed PAI cycle exited for per-HAM council judgment',
    content:JSON.stringify(content),importance:4};
  return{row:row,candidate:{version:CANDIDATE_VERSION,source:source,hamUid:hamUid,
    requestId:requestId,cycleId:cycleId,channel:content.channel,world:content.world,
    committedAt:committedAt,question:question,deliberationInput:deliberationInput,
    answer:answer,councilProof:compact,
    // Used only for the next in-process full verification. The durable row is
    // always re-read and reconstructed before a scanner exposes this value.
    originatingCouncil:result}};
}

function sameCandidateRow(row,expected) {
  return !!(row&&expected&&row.ham_uid===expected.ham_uid&&
    row.agent_global===expected.agent_global&&row.stamp_type===expected.stamp_type&&
    row.source===expected.source&&row.acl_stamp===expected.acl_stamp&&
    row.summary===expected.summary&&String(row.content)===String(expected.content)&&
    Number(row.importance)===Number(expected.importance));
}

function validateCandidateRow(row) {
  if(!row||row.agent_global!=='REACH'||row.stamp_type!==CANDIDATE_STAMP||
      row.acl_stamp!==CANDIDATE_ACL||!row.ham_uid||!row.source)return null;
  var content;
  try{content=JSON.parse(row.content||'');}catch(e){content=null;}
  if(!content||content.version!==CANDIDATE_VERSION||content.status!=='QUEUED'||
      content.answer_digest!==crypto.createHash('sha256')
        .update(String(content.answer||''),'utf8').digest('hex'))return null;
  var origin=content.originating_council||{};
  var expected=candidateRowFromInput({hamUid:row.ham_uid,cycleId:content.cycleId,
    requestId:content.requestId,channel:content.channel,world:content.world,
    question:content.question,deliberationInput:content.deliberation_input,
    answer:content.answer,councilProof:content.council_proof,
    councilResult:{ok:true,answer:content.answer,council_receipt:origin.council_receipt,
      stamp_proof:origin.stamp_proof}});
  if(!expected||row.content!==JSON.stringify(content)||
      !sameCandidateRow(row,expected.row))return null;
  // The durable council, not ambient identity input, owns the effect-facing
  // world and commit time. Older v2 rows may contain the caller's raw world
  // and the later observational read-back time; keep their immutable bytes
  // verifiable, but never let either observation steer a delivery decision.
  var boundReceipt=origin.council_receipt;
  var boundProof=origin.stamp_proof;
  if(boundReceipt&&boundReceipt.reach_handoff&&
      Object.prototype.hasOwnProperty.call(boundReceipt.reach_handoff,'world')){
    expected.candidate.world=boundReceipt.reach_handoff.world;
  }
  var durableCommitAt=boundProof&&boundProof.stage&&
    Date.parse(boundProof.stage.ended_at);
  if(Number.isFinite(durableCommitAt)){
    expected.candidate.committedAt=new Date(durableCommitAt).toISOString();
  }
  return expected.candidate;
}

function normalizedCandidateCommitment(row,candidate) {
  var content;try{content=JSON.parse(row&&row.content||'');}catch(e){return null;}
  if(!content||Array.isArray(content)||!candidate)return null;
  // Clone the already independently verified content, then canonicalize only
  // the two effect-facing observations and remove the proof fields derived
  // solely from the observational read-back time. Every immutable receipt,
  // row identity, digest, answer byte, channel and HAM binding remains exact.
  content=JSON.parse(JSON.stringify(content));
  content.world=candidate.world;
  content.committed_at=candidate.committedAt;
  var origin=content.originating_council;
  var proof=origin&&origin.stamp_proof;
  if(proof&&typeof proof==='object'&&!Array.isArray(proof)){
    delete proof.read_back_at;
    delete proof.proof_digest;
  }
  return content;
}

function sameCandidateCommitment(row,expected) {
  if(!row||!expected||row.ham_uid!==expected.ham_uid||
      row.agent_global!==expected.agent_global||
      row.stamp_type!==expected.stamp_type||row.source!==expected.source||
      row.acl_stamp!==expected.acl_stamp||row.summary!==expected.summary||
      Number(row.importance)!==Number(expected.importance))return false;
  var actualCandidate=validateCandidateRow(row);
  var expectedCandidate=validateCandidateRow(expected);
  if(!actualCandidate||!expectedCandidate)return false;
  var actualContent=normalizedCandidateCommitment(row,actualCandidate);
  var expectedContent=normalizedCandidateCommitment(expected,expectedCandidate);
  return !!(actualContent&&expectedContent&&
    stableStringify(actualContent)===stableStringify(expectedContent));
}

function resultTruth(result) {
  result=result||{};
  var delivered=result.delivered===true;
  var surfaced=!delivered&&(result.surfaced===true||result.funneled===true);
  var persisted=surfaced&&result.persisted!==false;
  var providerAccepted=!delivered&&!surfaced&&(result.providerAccepted===true||
    result.pendingDelivery===true||result.dialed===true||result.sent===true||
    result.called===true);
  var reconciliationPending=!delivered&&!surfaced&&
    /(?:^|:)(?:voice_delivery_reconciliation_[a-z0-9_:-]*|voice_outreach_pending_not_visible)$/.test(
      String(result.reason||''));
  return{delivered:delivered,surfaced:surfaced,persisted:persisted,
    providerAccepted:providerAccepted,pendingDelivery:providerAccepted||reconciliationPending,
    status:delivered?'DELIVERED':surfaced?'SURFACED':
      providerAccepted||reconciliationPending?'PENDING_DELIVERY':'DONE_HELD'};
}

function pendingIdentityState(reason) {
  return /(?:^|:)(?:no_contact_for_ham|reach_delivery_target_(?:invalid|changed|unavailable)|recipient_(?:phone_|email_)?identity_unresolved|recipient_ham_mismatch|no_brain|provider_(?:delivery_reconciliation_unverified(?::.*)?|not_configured|truth_store_unavailable|[a-z0-9_:-]*(?:unverified|uncertain))|no_text_channel_configured|autonomous_text_terminal_provider_unavailable|(?:text|email)_delivery_unverified|outreach_delivery_claim_denied|outreach_attempt_(?:read|reservation)_unverified|voice_delivery_(?:unverified|reconciliation_[a-z0-9_:-]*)|voice_outreach_pending_not_visible|reach_cycle_(?:evidence|decision)_[a-z0-9_:-]*|reach_policy_pai_[a-z0-9_:-]*|reach_fact_read_[a-z0-9_:-]*|reach_funnel_state_unverified|command_center_write_failed|held_(?:hard_rate_cap|min_gap)|kill_switch_(?:active|unverified)|deferred_by_pai_cycle_decision|email_world_unresolved|no_nylas_config_for_world:[a-z0-9._:-]+|nylas_terminal_webhook_unready|REACH_SEND_MODE is [A-Z_]+)$/.test(String(reason||''));
}

function terminalCandidateResult(result){
  if(!result||typeof result!=='object')return false;
  if(result.delivered===true||result.surfaced===true||result.funneled===true||
      result.providerAccepted===true||result.pendingDelivery===true)return true;
  if(result.ok!==true)return false;
  if(result.cycleDecision&&result.proposedChannel==='none'&&result.judgment&&
      result.judgment.reach===false)return true;
  return /^held_repeating_same_(?:alert|condition_reworded)$/.test(
    String(result.reason||''));
}

async function stampCandidate(input) {
  if(!_bu()||!_bk())return{ok:false,reason:'no_brain'};
  try{await ensureQueueUniqueness();}
  catch(eIndex){return{ok:false,reason:'candidate_uniqueness_unverified'};}
  var expected=candidateRowFromInput(input);
  if(!expected)return{ok:false,reason:'candidate_origin_council_unverified'};
  var parentDisposition=await readCandidateParentDisposition(expected.candidate);
  if(!parentDisposition.ok||parentDisposition.found)
    return candidateDispositionEnqueueResult(parentDisposition);
  var before;
  try{before=await exactRows(expected.row.ham_uid,CANDIDATE_STAMP,
    expected.row.source,'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');}
  catch(eRead){return{ok:false,reason:eRead.message,source:expected.row.source};}
  if(before.length){
    var reused=before.length===1?validateCandidateRow(before[0]):null;
    if(!reused||!sameCandidateCommitment(before[0],expected.row))return{ok:false,
      reason:'candidate_readback_mismatch',source:expected.row.source};
    parentDisposition=await readCandidateParentDisposition(reused);
    return !parentDisposition.ok||parentDisposition.found
      ?candidateDispositionEnqueueResult(parentDisposition,
        {source:expected.row.source,reused:true})
      :{ok:true,source:expected.row.source,reused:true,candidate:reused};
  }
  // The exact candidate source is immutable. Serialize the absent->write seam
  // so two app instances cannot both represent the same parent cycle.
  var claimSource=candidateEnqueueClaimSource(expected.row.ham_uid,
    expected.candidate.cycleId);
  var claimant=claimSource+':'+crypto.randomUUID();
  var won=await require('../claim_lock.js').claimTask(claimSource,claimant,2*60*1000)
    .catch(function(){return false;});
  if(!won){
    try{
      var raced=await exactRows(expected.row.ham_uid,CANDIDATE_STAMP,expected.row.source,
        'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');
      var racedCandidate=raced.length===1?validateCandidateRow(raced[0]):null;
      if(racedCandidate&&sameCandidateCommitment(raced[0],expected.row)){
        parentDisposition=await readCandidateParentDisposition(racedCandidate);
        return !parentDisposition.ok||parentDisposition.found
          ?candidateDispositionEnqueueResult(parentDisposition,
            {source:expected.row.source,reused:true})
          :{ok:true,source:expected.row.source,reused:true,candidate:racedCandidate};
      }
    }catch(eRace){}
    return{ok:false,reason:'candidate_enqueue_claim_denied',source:expected.row.source};
  }
  // The recovery writer takes this same lease before representing a terminal
  // parent disposition. Re-read only after ownership is proven, so either the
  // disposition wins and vetoes this path or this enqueue owns the seam.
  parentDisposition=await readCandidateParentDisposition(expected.candidate);
  if(!parentDisposition.ok||parentDisposition.found){
    if(parentDisposition.ok&&parentDisposition.found)
      await require('../claim_lock.js').releaseTaskIfOwned(claimSource,claimant)
        .catch(function(){});
    return candidateDispositionEnqueueResult(parentDisposition,
      {leaseRetained:!parentDisposition.ok});
  }
  // Re-read after winning: another writer may have completed between our first
  // read and the atomic lease acquisition.
  try{
    var claimedRows=await exactRows(expected.row.ham_uid,CANDIDATE_STAMP,
      expected.row.source,'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');
    if(claimedRows.length){
      var claimedCandidate=claimedRows.length===1?validateCandidateRow(claimedRows[0]):null;
      if(!claimedCandidate||!sameCandidateCommitment(claimedRows[0],expected.row))
        return{ok:false,reason:'candidate_readback_mismatch',source:expected.row.source};
      parentDisposition=await readCandidateParentDisposition(claimedCandidate);
      return !parentDisposition.ok||parentDisposition.found
        ?candidateDispositionEnqueueResult(parentDisposition,
          {source:expected.row.source,reused:true})
        :{ok:true,source:expected.row.source,reused:true,candidate:claimedCandidate};
    }
  }catch(eClaimRead){
    // Read uncertainty after winning is not proof that no writer committed.
    // Keep the durable lease until expiry; the next owner must exact-read first.
    return{ok:false,pending:true,leaseRetained:true,reason:eClaimRead.message,
      source:expected.row.source};
  }
  var represented=await writeExact(expected.row);
  var after;
  try{after=await exactRows(expected.row.ham_uid,CANDIDATE_STAMP,
    expected.row.source,'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');}
  catch(eAfter){
    return{ok:false,pending:true,leaseRetained:true,reason:eAfter.message,
      source:expected.row.source};
  }
  var candidate=after.length===1?validateCandidateRow(after[0]):null;
  var result=candidate&&sameCandidateCommitment(after[0],expected.row)
    ?{ok:true,source:expected.row.source,reused:false,recovered:!represented,candidate:candidate}
    :{ok:false,reason:after.length?'candidate_readback_mismatch':'candidate_stamp_unverified',
      source:expected.row.source};
  if(!result.ok){result.pending=true;result.leaseRetained=true;}
  if(result.ok){
    // A candidate may have been represented just before an older recovery
    // worker's terminal row became visible. Never hand that row to outreach.
    parentDisposition=await readCandidateParentDisposition(candidate);
    if(!parentDisposition.ok||parentDisposition.found)
      return candidateDispositionEnqueueResult(parentDisposition,
        {candidateRepresented:true,leaseRetained:!parentDisposition.ok});
  }
  return result;
}

async function stampDone(input,result) {
  var source='reach.candidate.done.'+input.hamUid+'.'+input.cycleId;
  try{await ensureQueueUniqueness();}
  catch(eIndex){return{ok:false,reason:'candidate_done_uniqueness_unverified'};}
  var truth=resultTruth(result);
  var decision=result&&result.cycleDecision||null;
  var channel=result&&result.proposedChannel;
  if(channel===undefined||channel==='')channel=null;
  if(channel!==null&&['none','voice','text','email','command_center']
      .indexOf(channel)===-1)return{ok:false,reason:'candidate_done_channel_invalid'};
  var reason=result&&result.reason;
  if(reason===undefined||reason==='')reason=null;
  if(reason!==null&&(typeof reason!=='string'||reason.length>500))return{ok:false,
    reason:'candidate_done_reason_invalid'};
  if(!decision)return{ok:false,reason:'candidate_done_decision_required'};
  if(!decision.source||typeof decision.source!=='string'||
      decision.source.length>500||!/^[a-f0-9]{64}$/.test(String(decision.artifactDigest||''))||
      !decisionSourcePattern(input.hamUid).test(decision.source)||!decision.decision||
      ['NOW','HOLD','DEFER'].indexOf(decision.decision.when)===-1){
    return{ok:false,reason:'candidate_done_decision_invalid'};
  }
  if((decision.decision.when==='HOLD'&&(channel!=='none'||truth.status!=='DONE_HELD'))||
      (decision.decision.when==='DEFER')||
      (decision.decision.when==='NOW'&&(channel===null||channel==='none'))){
    return{ok:false,reason:'candidate_done_decision_disposition_invalid'};
  }
  var doneContent={cycleId:input.cycleId,requestId:input.requestId,
    candidate:candidateSource(input.hamUid,input.cycleId),
    delivered:truth.delivered,surfaced:truth.surfaced,persisted:truth.persisted,
    providerAccepted:truth.providerAccepted,pendingDelivery:truth.pendingDelivery,
    channel:channel,reason:reason,status:truth.status};
  doneContent.decision_source=decision.source;
  doneContent.decision_artifact_digest=decision.artifactDigest;
  doneContent.decision_when=decision.decision.when;
  var content=JSON.stringify(doneContent);
  var expected={ham_uid:input.hamUid,agent_global:'REACH',
    stamp_type:'REACH_CANDIDATE_DONE',source:source,
    acl_stamp:'⬡B:core.reach.cycle_handoff:REACH_CANDIDATE_DONE:consumed:20260717⬡',
    summary:'[REACH CANDIDATE DONE] per-HAM outreach judgment completed: '+truth.status,
    content:content,importance:truth.delivered?6:
      truth.surfaced||truth.providerAccepted?5:3};
  var select='id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at';
  var before;
  try{before=await exactRows(input.hamUid,'REACH_CANDIDATE_DONE',source,select);}
  catch(eRead){return{ok:false,reason:eRead.message};}
  if(before.length)return before.length===1&&sameCandidateRow(before[0],expected)
    ?{ok:true,source:source,reused:true}
    :{ok:false,reason:'candidate_done_readback_mismatch',source:source};
  await writeExact(expected);
  var after;
  try{after=await exactRows(input.hamUid,'REACH_CANDIDATE_DONE',source,select);}
  catch(eAfter){return{ok:false,reason:eAfter.message,source:source};}
  return after.length===1&&sameCandidateRow(after[0],expected)
    ?{ok:true,source:source,reused:false}
    :{ok:false,reason:'candidate_done_stamp_unverified',source:source};
}

function validateDoneRow(row,candidate){
  if(!row||!candidate||row.ham_uid!==candidate.hamUid||row.agent_global!=='REACH'||
      row.stamp_type!=='REACH_CANDIDATE_DONE'||
      row.source!=='reach.candidate.done.'+candidate.hamUid+'.'+candidate.cycleId||
      row.acl_stamp!=='⬡B:core.reach.cycle_handoff:REACH_CANDIDATE_DONE:consumed:20260717⬡')return false;
  var content;try{content=JSON.parse(row.content||'');}catch(e){return false;}
  if(!content||Array.isArray(content)||content.cycleId!==candidate.cycleId||
      content.requestId!==candidate.requestId||
      content.candidate!==candidateSource(candidate.hamUid,candidate.cycleId)||
      !/^(DELIVERED|SURFACED|PENDING_DELIVERY|DONE_HELD)$/.test(content.status||''))return false;
  var baseKeys=['candidate','channel','cycleId','delivered','pendingDelivery',
    'persisted','providerAccepted','reason','requestId','status','surfaced'];
  var decisionKeys=['decision_artifact_digest','decision_source','decision_when'];
  var keys=Object.keys(content).sort();
  var hasDecision=decisionKeys.every(function(key){return Object.prototype.hasOwnProperty
    .call(content,key);});
  var expectedKeys=baseKeys.concat(decisionKeys).sort();
  if(keys.join(',')!==expectedKeys.join(',')||
      typeof content.cycleId!=='string'||!content.cycleId||
      typeof content.requestId!=='string'||!content.requestId||
      typeof content.candidate!=='string'||
      typeof content.delivered!=='boolean'||typeof content.surfaced!=='boolean'||
      typeof content.persisted!=='boolean'||typeof content.providerAccepted!=='boolean'||
      typeof content.pendingDelivery!=='boolean'||
      !(content.channel===null||['none','voice','text','email','command_center']
        .indexOf(content.channel)>=0)||
      !(content.reason===null||(typeof content.reason==='string'&&
        content.reason.length>0&&content.reason.length<=500)))return false;
  if(!hasDecision||!(typeof content.decision_source==='string'&&
      content.decision_source.length>0&&content.decision_source.length<=500)||
      !decisionSourcePattern(candidate.hamUid).test(content.decision_source)||
      !/^[a-f0-9]{64}$/.test(content.decision_artifact_digest)||
      ['NOW','HOLD','DEFER'].indexOf(content.decision_when)<0)return false;
  // Canonical JSON order is part of the immutable row contract. It prevents a
  // permissive parser from accepting an alternate shape under the same source.
  var canonical={cycleId:content.cycleId,requestId:content.requestId,
    candidate:content.candidate,delivered:content.delivered,surfaced:content.surfaced,
    persisted:content.persisted,providerAccepted:content.providerAccepted,
    pendingDelivery:content.pendingDelivery,channel:content.channel,
    reason:content.reason,status:content.status};
  canonical.decision_source=content.decision_source;
  canonical.decision_artifact_digest=content.decision_artifact_digest;
  canonical.decision_when=content.decision_when;
  if(row.content!==JSON.stringify(canonical))return false;
  var expectedStatus=content.delivered===true?'DELIVERED':content.surfaced===true
    ?'SURFACED':content.providerAccepted===true||content.pendingDelivery===true
      ?'PENDING_DELIVERY':'DONE_HELD';
  if(content.status==='DELIVERED'&&
      (content.surfaced||content.persisted||content.providerAccepted||content.pendingDelivery))return false;
  if(content.status==='SURFACED'&&
      (content.delivered||content.providerAccepted||content.pendingDelivery))return false;
  if(content.status==='PENDING_DELIVERY'&&
      (content.delivered||content.surfaced||content.persisted||!content.pendingDelivery))return false;
  if(content.status==='DONE_HELD'&&
      (content.delivered||content.surfaced||content.persisted||
        content.providerAccepted||content.pendingDelivery))return false;
  if(content.decision_when==='HOLD'&&
      (content.channel!=='none'||content.status!=='DONE_HELD'))return false;
  if(content.decision_when==='DEFER')return false;
  if(content.decision_when==='NOW'&&
      (content.channel===null||content.channel==='none'))return false;
  var expectedSummary='[REACH CANDIDATE DONE] per-HAM outreach judgment completed: '+
    expectedStatus;
  var expectedImportance=content.delivered===true?6:
    content.surfaced===true||content.providerAccepted===true?5:3;
  return content.status===expectedStatus&&row.summary===expectedSummary&&
    Number(row.importance)===expectedImportance;
}

async function consumeCandidate(input) {
  var candidate=input&&input.source?input:null;
  if(!candidate)return{ok:false,reason:'candidate_invalid'};
  var parentDisposition=await readCandidateParentDisposition(candidate);
  if(!parentDisposition.ok)return{ok:false,pending:parentDisposition.pending!==false,
    reason:parentDisposition.reason};
  if(parentDisposition.found)return candidateDispositionSkipResult(parentDisposition);
  var doneSource='reach.candidate.done.'+candidate.hamUid+'.'+candidate.cycleId;
  try {
    var doneRows=await exactRows(candidate.hamUid,'REACH_CANDIDATE_DONE',doneSource,
      'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');
    if(doneRows.length)return doneRows.length===1&&validateDoneRow(doneRows[0],candidate)
      ?{ok:true,skipped:'already_done'}
      :{ok:false,reason:'candidate_done_readback_mismatch'};
  }
  catch(eRead){return{ok:false,reason:eRead.message};}
  var claimSource=candidateConsumeClaimSource(candidate.hamUid,candidate.cycleId);
  var claimant=claimSource+'.'+crypto.randomUUID();
  var leaseMs=5*60*1000;
  var lock=require('../claim_lock.js');
  var won=await lock.claimTask(claimSource,claimant,leaseMs)
    .catch(function(){return false;});
  if(!won)return{ok:false,reason:'candidate_consumer_claim_denied'};
  var releaseClaim=false;
  var leaseLost=false;
  var renewalInFlight=null;
  async function renewConsumerLease(){
    if(leaseLost||typeof lock.renewTaskIfOwned!=='function')return false;
    if(renewalInFlight)return renewalInFlight;
    renewalInFlight=lock.renewTaskIfOwned(claimSource,claimant,leaseMs)
      .catch(function(){return false;}).then(function(owned){
        if(owned!==true)leaseLost=true;return owned===true;
      }).finally(function(){renewalInFlight=null;});
    return renewalInFlight;
  }
  var renewalTimer=setInterval(function(){void renewConsumerLease();},60*1000);
  if(renewalTimer.unref)renewalTimer.unref();
  try{
    // The terminal-disposition writer must win this same lease before it can
    // persist. This second exact read closes the pre-claim race without ever
    // allowing an outreach effect under an ambiguous parent state.
    parentDisposition=await readCandidateParentDisposition(candidate);
    if(!parentDisposition.ok){releaseClaim=true;return{ok:false,
      pending:parentDisposition.pending!==false,reason:parentDisposition.reason};}
    if(parentDisposition.found){releaseClaim=true;
      return candidateDispositionSkipResult(parentDisposition);}
    var result=await require('../outreach.js').outreachPassForHam(candidate.hamUid,false,
      {world:candidate.world||null,candidate:candidate,
        leaseGuard:renewConsumerLease});
    if(result&&result.pending===true||pendingIdentityState(result&&result.reason)) {
      releaseClaim=true;
      return{ok:false,pending:true,reason:result&&result.reason||'candidate_retry_pending',
        recheckAt:result&&result.recheckAt||null,cycleDecision:result&&result.cycleDecision||null};
    }
    if(!terminalCandidateResult(result)){releaseClaim=true;return{ok:false,pending:true,
        reason:'candidate_outcome_not_terminal:'+
          String(result&&result.reason||'outreach_result_missing').slice(0,180),
        cycleDecision:result&&result.cycleDecision||null};}
    var done=await stampDone(candidate,result||{reason:'outreach_result_missing'});
    releaseClaim=!!done.ok;
    return{ok:!!done.ok,pending:!done.ok,leaseRetained:!done.ok,
      outreach:result,done:done};
  }finally{
    clearInterval(renewalTimer);
    if(renewalInFlight)await renewalInFlight.catch(function(){});
    // A terminal effect followed by an uncertain DONE write/readback must not
    // immediately reopen the effect seam. Keep that lease until expiry. Clear
    // pending/nonterminal work and verified DONE so normal retries stay prompt.
    if(releaseClaim)await lock.releaseTaskIfOwned(claimSource,claimant)
      .catch(function(){});
  }
}

async function enqueueCommittedCycle(input){return stampCandidate(input);}

async function consumeEnqueued(candidate){return consumeCandidate(candidate);}

async function afterCommittedCycle(input) {
  var candidate=await enqueueCommittedCycle(input);
  if(!candidate.ok)return candidate;
  var consumed=await consumeEnqueued(candidate.candidate);
  return{ok:!!consumed.ok,candidate:candidate.source,consumed:consumed};
}

async function scanDurableRows(filter,label){
  var rows=[];
  var seenPages=new Set();
  var pageSize=100;
  var maxPages=1000;
  for(var pageIndex=0;pageIndex<maxPages;pageIndex++){
    var offset=pageIndex*pageSize;
    var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+'?'+filter+
      '&order=created_at.asc,id.asc&limit='+pageSize+'&offset='+offset+
      '&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at',
    {headers:headers(false)}).catch(function(){return null;});
    if(!response||!response.ok)return{ok:false,reason:label+'_scan_failed:'+
      (response&&response.status||'network')};
    var page=await response.json().catch(function(){return null;});
    if(!Array.isArray(page))return{ok:false,reason:label+'_scan_invalid'};
    var signature=page.length?stableStringify(page.map(function(row){
      return[row&&row.id||null,row&&row.source||null,row&&row.created_at||null];
    })):'';
    if(signature&&seenPages.has(signature))return{ok:false,reason:label+'_scan_repeated_page'};
    if(signature)seenPages.add(signature);
    rows.push.apply(rows,page);
    if(page.length<pageSize)return{ok:true,rows:rows,pages:pageIndex+1};
  }
  return{ok:false,reason:label+'_scan_page_limit'};
}

async function exactStampRows(hamUid,source){
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+
    '?ham_uid=eq.'+encodeURIComponent(hamUid)+'&agent_global=eq.STAMP'+
    '&stamp_type=eq.PAI_STAGE&source=eq.'+encodeURIComponent(source)+
    '&order=id.asc&limit=2&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at',
  {headers:headers(false)}).catch(function(){return null;});
  if(!response||!response.ok)throw new Error('reach_handoff_stamp_read_failed');
  var rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('reach_handoff_stamp_read_invalid');
  return rows;
}

function sha256Text(value){return crypto.createHash('sha256')
  .update(String(value),'utf8').digest('hex');}

function recoveryPreparedGraceMs(value){
  var raw=value===undefined?process.env.REACH_RECOVERY_PREPARED_GRACE_MS:value;
  if(raw===undefined||raw===null||String(raw).trim()==='')
    return DEFAULT_RECOVERY_PREPARED_GRACE_MS;
  var parsed=Number(raw);
  if(!Number.isFinite(parsed))return DEFAULT_RECOVERY_PREPARED_GRACE_MS;
  return Math.min(Math.max(Math.floor(parsed),DEFAULT_RECOVERY_PREPARED_GRACE_MS),
    60*60*1000);
}

function recoveryReceiptIdentity(row){
  if(!row||row.id===undefined||row.id===null||String(row.id)===''||
      typeof row.ham_uid!=='string'||!/^[A-Z0-9._:-]{2,160}$/.test(row.ham_uid)||
      row.agent_global!=='PAI_OUTBOUND_COUNCIL'||row.stamp_type!=='CYCLE_RECEIPT'||
      typeof row.source!=='string'||!/^pai\.cycle\.[A-Za-z0-9._:-]{8,220}\.receipt$/.test(row.source)||
      typeof row.acl_stamp!=='string'||
      !/^⬡B:pai\.outbound\.council:CYCLE_RECEIPT:prepared_reach_eligible:\d+⬡$/.test(row.acl_stamp)||
      typeof row.summary!=='string'||typeof row.content!=='string'||
      !Number.isFinite(Number(row.importance))||
      !Number.isFinite(Date.parse(row.created_at)))return null;
  var createdAt=new Date(Date.parse(row.created_at)).toISOString();
  var base={row_id:String(row.id),ham_uid:row.ham_uid,source:row.source,
    created_at:createdAt,content_digest:sha256Text(row.content)};
  base.row_digest=sha256Text(stableStringify({id:String(row.id),ham_uid:row.ham_uid,
    agent_global:row.agent_global,stamp_type:row.stamp_type,source:row.source,
    acl_stamp:row.acl_stamp,summary:row.summary,content:row.content,
    importance:Number(row.importance),created_at:createdAt}));
  return base;
}

function sameRecoveryReceiptRow(left,right){
  return !!(left&&right&&String(left.id)===String(right.id)&&
    left.ham_uid===right.ham_uid&&left.agent_global===right.agent_global&&
    left.stamp_type===right.stamp_type&&left.source===right.source&&
    left.acl_stamp===right.acl_stamp&&left.summary===right.summary&&
    left.content===right.content&&Number(left.importance)===Number(right.importance)&&
    Number.isFinite(Date.parse(left.created_at))&&Number.isFinite(Date.parse(right.created_at))&&
    new Date(Date.parse(left.created_at)).toISOString()===
      new Date(Date.parse(right.created_at)).toISOString());
}

async function exactRecoveryReceiptRows(row){
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+
    '?ham_uid=eq.'+encodeURIComponent(row.ham_uid)+
    '&agent_global=eq.PAI_OUTBOUND_COUNCIL&stamp_type=eq.CYCLE_RECEIPT'+
    '&source=eq.'+encodeURIComponent(row.source)+
    '&limit=2&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at',
  {headers:headers(false)}).catch(function(){return null;});
  if(!response||!response.ok)throw new Error('reach_handoff_receipt_exact_read_failed');
  var rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))throw new Error('reach_handoff_receipt_exact_read_invalid');
  return rows;
}

function compareEvidenceId(left,right){
  var a=String(left&&left.id||''),b=String(right&&right.id||'');
  if(/^\d+$/.test(a)&&/^\d+$/.test(b)){
    var ai=BigInt(a),bi=BigInt(b);return ai===bi?0:ai<bi?-1:1;
  }
  return a===b?0:a<b?-1:1;
}

function stampEvidenceRow(row,expectedHam,expectedSource){
  if(!row||row.id===undefined||row.id===null||String(row.id)===''||
      row.ham_uid!==expectedHam||row.agent_global!=='STAMP'||
      row.stamp_type!=='PAI_STAGE'||row.source!==expectedSource||
      typeof row.acl_stamp!=='string'||
      !/^⬡B:pai\.outbound\.stamp:PAI_STAGE:(?:passed|held):\d+⬡$/.test(row.acl_stamp)||
      typeof row.summary!=='string'||!/^\[PAI OUTBOUND STAMP\] /.test(row.summary)||
      typeof row.content!=='string'||Number(row.importance)!==9||
      !Number.isFinite(Date.parse(row.created_at)))return null;
  var base={id:String(row.id),ham_uid:row.ham_uid,agent_global:row.agent_global,
    stamp_type:row.stamp_type,source:row.source,acl_stamp:row.acl_stamp,
    summary_digest:sha256Text(row.summary),content_digest:sha256Text(row.content),
    importance:Number(row.importance),
    created_at:new Date(Date.parse(row.created_at)).toISOString()};
  return Object.assign(base,{row_digest:sha256Text(stableStringify(base))});
}

function recoveryStampEvidence(rows,state,expectedHam,expectedSource){
  rows=Array.isArray(rows)?rows:[];
  if(rows.length>2)return null;
  var evidenceRows=[];
  for(const row of rows){
    var evidence=stampEvidenceRow(row,expectedHam,expectedSource);
    if(!evidence)return null;
    evidenceRows.push(evidence);
  }
  evidenceRows.sort(compareEvidenceId);
  if(evidenceRows.length===2&&evidenceRows[0].id===evidenceRows[1].id)return null;
  return{state:state||(rows.length===0?'NONE':rows.length===1?'ONE':'MULTIPLE'),
    observed_count:rows.length,rows:evidenceRows};
}

function recoveryDispositionSource(identity){
  if(!identity||typeof identity.ham_uid!=='string'||
      !/^[A-Z0-9._:-]{2,160}$/.test(identity.ham_uid)||
      typeof identity.source!=='string'||
      !/^pai\.cycle\.[A-Za-z0-9._:-]{8,220}\.receipt$/.test(identity.source))return null;
  // The source is a locator, not the disposition proof. Bind it only to the
  // immutable parent coordinates that both the direct and recovery paths know.
  // The row content still binds the full exact receipt identity and digests.
  return RECOVERY_DISPOSITION_PREFIX+sha256Text(stableStringify({
    ham_uid:identity.ham_uid,source:identity.source}));
}

function recoveryParentClaimSources(parent){
  if(!parent||typeof parent.ham_uid!=='string'||typeof parent.source!=='string')return null;
  var match=/^pai\.cycle\.([A-Za-z0-9._:-]{8,220})\.receipt$/.exec(parent.source);
  if(!match)return null;
  return{enqueue:candidateEnqueueClaimSource(parent.ham_uid,match[1]),
    consume:candidateConsumeClaimSource(parent.ham_uid,match[1])};
}

function recoveryStampBinding(parent){
  var parsed;try{parsed=JSON.parse(parent&&parent.content||'');}catch(e){return null;}
  var receipt=parsed&&parsed.receipt;
  var source=receipt&&receipt.persistence&&receipt.persistence.stamp_source;
  if(!receipt||receipt.ham_uid!==parent.ham_uid||typeof receipt.cycle_id!=='string'||
      parent.source!=='pai.cycle.'+receipt.cycle_id+'.receipt'||
      source!=='pai.cycle.'+receipt.cycle_id+'.stage.07.stamp')return null;
  return{hamUid:receipt.ham_uid,source:source};
}

function canonicalStoredStampEvidence(evidence,parent){
  if(!evidence||Object.keys(evidence).sort().join(',')!=='observed_count,rows,state'||
      !['NONE','ONE','MULTIPLE','UNAVAILABLE_RECEIPT_MARKER'].includes(evidence.state)||
      !Number.isInteger(evidence.observed_count)||!Array.isArray(evidence.rows)||
      evidence.rows.length>2)return null;
  var binding=recoveryStampBinding(parent);
  var parentCreated=Date.parse(parent&&parent.created_at);
  var rows=[];
  for(const item of evidence.rows){
    if(!item||Object.keys(item).sort().join(',')!==
        'acl_stamp,agent_global,content_digest,created_at,ham_uid,id,importance,row_digest,source,stamp_type,summary_digest'||
        typeof item.id!=='string'||!item.id||!binding||
        item.ham_uid!==binding.hamUid||item.agent_global!=='STAMP'||
        item.stamp_type!=='PAI_STAGE'||item.source!==binding.source||
        typeof item.acl_stamp!=='string'||
        !/^⬡B:pai\.outbound\.stamp:PAI_STAGE:(?:passed|held):\d+⬡$/.test(item.acl_stamp)||
        !/^[a-f0-9]{64}$/.test(item.summary_digest||'')||
        !/^[a-f0-9]{64}$/.test(item.content_digest||'')||
        Number(item.importance)!==9||
        !Number.isFinite(Date.parse(item.created_at))||
        Date.parse(item.created_at)<parentCreated)return null;
    var base={id:item.id,ham_uid:item.ham_uid,agent_global:item.agent_global,
      stamp_type:item.stamp_type,source:item.source,acl_stamp:item.acl_stamp,
      summary_digest:item.summary_digest,content_digest:item.content_digest,
      importance:Number(item.importance),
      created_at:new Date(Date.parse(item.created_at)).toISOString()};
    if(item.row_digest!==sha256Text(stableStringify(base)))return null;
    rows.push(Object.assign(base,{row_digest:item.row_digest}));
  }
  rows.sort(compareEvidenceId);
  if(rows.length===2&&rows[0].id===rows[1].id)return null;
  return{state:evidence.state,observed_count:evidence.observed_count,rows:rows};
}

function recoveryDispositionRow(parent,reasonCode,detailCode,stampEvidence,graceMs){
  var identity=recoveryReceiptIdentity(parent);
  if(!identity||RECOVERY_TERMINAL_REASONS.indexOf(reasonCode)===-1||
      !/^reach_handoff_[a-z0-9_]{3,120}$/.test(String(detailCode||''))||
      !stampEvidence||!['NONE','ONE','MULTIPLE','UNAVAILABLE_RECEIPT_MARKER']
        .includes(stampEvidence.state)||!Number.isInteger(stampEvidence.observed_count)||
      !Array.isArray(stampEvidence.rows)||stampEvidence.rows.length>2)return null;
  graceMs=reasonCode==='PERMANENTLY_UNCOMMITTED'
    ?recoveryPreparedGraceMs(graceMs):0;
  var canonicalEvidence=canonicalStoredStampEvidence(stampEvidence,parent);
  if(!canonicalEvidence)return null;
  var content={version:RECOVERY_DISPOSITION_VERSION,
    status:'TERMINAL_NON_EXECUTABLE',reason_code:reasonCode,
    detail_code:String(detailCode),receipt:identity,grace_ms:graceMs,
    eligible_at:new Date(Date.parse(identity.created_at)+graceMs).toISOString(),
    stamp_evidence:canonicalEvidence};
  if(!validDispositionClassification(content))return null;
  return{ham_uid:RECOVERY_CHECKPOINT_HAM,agent_global:'REACH',
    stamp_type:RECOVERY_CHECKPOINT_STAMP,
    source:recoveryDispositionSource(identity),acl_stamp:RECOVERY_DISPOSITION_ACL,
    summary:'[REACH RECOVERY DISPOSITION] terminal non-executable: '+reasonCode,
    content:JSON.stringify(content),importance:8};
}

function validDispositionClassification(content){
  var evidence=content&&content.stamp_evidence;
  if(!evidence)return false;
  var empty=evidence.observed_count===0&&evidence.rows.length===0;
  var one=evidence.observed_count===1&&evidence.rows.length===1;
  var multiple=evidence.observed_count===2&&evidence.rows.length===2;
  if(content.reason_code==='PERMANENTLY_UNCOMMITTED')return content.detail_code===
    'reach_handoff_stamp_missing_after_grace'&&
    content.grace_ms>=DEFAULT_RECOVERY_PREPARED_GRACE_MS&&
    content.grace_ms<=60*60*1000&&
    evidence.state==='NONE'&&empty;
  if(content.reason_code==='RECEIPT_MARKER_INVALID')return content.detail_code===
    'reach_handoff_receipt_marker_invalid'&&content.grace_ms===0&&
    evidence.state==='UNAVAILABLE_RECEIPT_MARKER'&&empty;
  if(content.reason_code==='STAMP_NON_UNIQUE')return content.detail_code===
    'reach_handoff_stamp_non_unique'&&content.grace_ms===0&&
    evidence.state==='MULTIPLE'&&multiple;
  return content.reason_code==='COMMITTED_PAIR_INVALID'&&content.grace_ms===0&&
    evidence.state==='ONE'&&one&&
    /^reach_handoff_(?:receipt_ineligible|external_receipt_rejected|final_receipt_invalid|stamp_invalid|row_identity_missing|committed_pair_invalid|pair_unverified)$/.test(
      content.detail_code);
}

function validateRecoveryDispositionRow(row,parent){
  if(!row||row.ham_uid!==RECOVERY_CHECKPOINT_HAM||row.agent_global!=='REACH'||
      row.stamp_type!==RECOVERY_CHECKPOINT_STAMP||
      row.acl_stamp!==RECOVERY_DISPOSITION_ACL||row.id===undefined||row.id===null||
      String(row.id)===''||!Number.isFinite(Date.parse(row.created_at)))return null;
  var expectedIdentity=recoveryReceiptIdentity(parent);
  if(!expectedIdentity)return null;
  var content;try{content=JSON.parse(row.content||'');}catch(e){return null;}
  if(!content||Array.isArray(content)||Object.keys(content).sort().join(',')!==
      'detail_code,eligible_at,grace_ms,reason_code,receipt,stamp_evidence,status,version'||
      content.version!==RECOVERY_DISPOSITION_VERSION||
      content.status!=='TERMINAL_NON_EXECUTABLE'||
      RECOVERY_TERMINAL_REASONS.indexOf(content.reason_code)===-1||
      !/^reach_handoff_[a-z0-9_]{3,120}$/.test(String(content.detail_code||''))||
      !content.receipt||Object.keys(content.receipt).sort().join(',')!==
        'content_digest,created_at,ham_uid,row_digest,row_id,source'||
      typeof content.receipt.row_id!=='string'||!content.receipt.row_id||
      typeof content.receipt.ham_uid!=='string'||
      !/^[A-Z0-9._:-]{2,160}$/.test(content.receipt.ham_uid)||
      typeof content.receipt.source!=='string'||
      !/^pai\.cycle\.[A-Za-z0-9._:-]{8,220}\.receipt$/.test(content.receipt.source)||
      !/^[a-f0-9]{64}$/.test(content.receipt.content_digest||'')||
      !/^[a-f0-9]{64}$/.test(content.receipt.row_digest||'')||
      !Number.isFinite(Date.parse(content.receipt.created_at))||
      !Number.isInteger(content.grace_ms)||content.grace_ms<0||
      new Date(Date.parse(content.receipt.created_at)+content.grace_ms).toISOString()!==
        content.eligible_at||Date.parse(row.created_at)<Date.parse(content.eligible_at)||
      stableStringify(content.receipt)!==stableStringify(expectedIdentity))return null;
  var evidence=canonicalStoredStampEvidence(content.stamp_evidence,parent);
  if(!evidence)return null;
  var expected=recoveryDispositionRow(parent,content.reason_code,content.detail_code,
    evidence,content.grace_ms);
  if(!expected||!sameCandidateRow(row,expected))return null;
  var createdAt=new Date(Date.parse(row.created_at)).toISOString();
  var rowProof={id:String(row.id),ham_uid:row.ham_uid,
    agent_global:row.agent_global,stamp_type:row.stamp_type,source:row.source,
    acl_stamp:row.acl_stamp,summary:row.summary,content:row.content,
    importance:Number(row.importance),created_at:createdAt};
  return{content:JSON.parse(expected.content),contentBytes:expected.content,
    contentDigest:sha256Text(expected.content),source:expected.source,
    rowId:String(row.id),createdAt:createdAt,
    rowDigest:sha256Text(stableStringify(rowProof))};
}

function terminalDispositionResult(valid,reused,extra){
  return Object.assign({ok:true,terminalInvalid:true,
    disposition:valid.content.reason_code,
    dispositionSource:valid.source,dispositionReceipt:valid.content.receipt,
    dispositionContentBytes:valid.contentBytes,
    dispositionContentDigest:valid.contentDigest,
    dispositionRowId:valid.rowId,dispositionCreatedAt:valid.createdAt,
    dispositionRowDigest:valid.rowDigest,
    readbackVerified:true,reused:reused===true},extra||{});
}

function existingDispositionResult(valid,currentEvidence,now){
  if(!valid||now<Date.parse(valid.content.eligible_at))return{ok:false,pending:true,
    reason:'reach_recovery_disposition_not_yet_eligible'};
  var sameEvidence=stableStringify(valid.content.stamp_evidence)===
    stableStringify(currentEvidence);
  if(sameEvidence)return terminalDispositionResult(valid,true);
  var late=valid.content.reason_code==='PERMANENTLY_UNCOMMITTED'&&
    currentEvidence.observed_count>0;
  return terminalDispositionResult(valid,true,{contradiction:true,
    contradictionCode:late?'LATE_STAMP_AFTER_DISPOSITION':
      'STAMP_STATE_CHANGED_AFTER_DISPOSITION',
    reason:late?'reach_handoff_late_stamp_after_disposition':
      'reach_handoff_stamp_state_changed_after_disposition'});
}

async function readRecoveryDispositionAt(hamUid,parentSource){
  var source=recoveryDispositionSource({ham_uid:hamUid,source:parentSource}),rows;
  if(!source)return{ok:false,reason:'reach_recovery_disposition_locator_invalid'};
  try{rows=await exactRows(RECOVERY_CHECKPOINT_HAM,RECOVERY_CHECKPOINT_STAMP,source,
    'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');}
  catch(eRead){return{ok:false,reason:'reach_recovery_disposition_read_failed'};}
  if(rows.length>1)return{ok:false,reason:'reach_recovery_disposition_ambiguous'};
  if(!rows.length)return{ok:true,found:false,source:source};
  return{ok:true,found:true,source:source,row:rows[0]};
}

async function readRecoveryDisposition(parent){
  var identity=recoveryReceiptIdentity(parent);
  if(!identity)return{ok:false,reason:'reach_recovery_disposition_receipt_invalid'};
  var located=await readRecoveryDispositionAt(identity.ham_uid,identity.source);
  if(!located.ok||!located.found)return located;
  var source=located.source;
  var rows=[located.row];
  var valid=validateRecoveryDispositionRow(rows[0],parent);
  return valid?{ok:true,found:true,valid:valid,row:rows[0]}:
    {ok:false,reason:'reach_recovery_disposition_invalid'};
}

function candidateRecoveryBinding(candidate){
  var result=candidate&&candidate.originatingCouncil;
  var receipt=result&&(result.council_receipt||result.councilReceipt);
  var proof=result&&(result.stamp_proof||result.stampProof);
  var source=receipt&&receipt.persistence&&receipt.persistence.final_source;
  if(!candidate||typeof candidate.hamUid!=='string'||
      !/^[A-Z0-9._:-]{2,160}$/.test(candidate.hamUid)||!receipt||!proof||
      receipt.ham_uid!==candidate.hamUid||receipt.cycle_id!==candidate.cycleId||
      receipt.request_id!==candidate.requestId||source!==proof.final_source||
      !/^pai\.cycle\.[A-Za-z0-9._:-]{8,220}\.receipt$/.test(String(source||''))||
      String(proof.final_receipt_row_id||'')===''||
      !/^[a-f0-9]{64}$/.test(String(proof.final_receipt_content_digest||'')))return null;
  return{hamUid:candidate.hamUid,source:source,rowId:String(proof.final_receipt_row_id),
    contentDigest:proof.final_receipt_content_digest,receipt:receipt};
}

function candidateMatchesRecoveryParent(candidate,parent,binding){
  if(!binding||!recoveryReceiptIdentity(parent)||parent.ham_uid!==binding.hamUid||
      parent.source!==binding.source||String(parent.id)!==binding.rowId)return false;
  var content;try{content=JSON.parse(parent.content||'');}catch(e){return false;}
  return !!(content&&!Array.isArray(content)&&content.receipt&&
    stableStringify(content.receipt)===stableStringify(binding.receipt)&&
    sha256Text(stableStringify(content))===binding.contentDigest&&
    candidate.hamUid===content.receipt.ham_uid&&
    candidate.cycleId===content.receipt.cycle_id&&
    candidate.requestId===content.receipt.request_id&&
    candidate.question===content.receipt.question&&
    candidate.deliberationInput===content.receipt.deliberation_input&&
    candidate.answer===content.receipt.answer);
}

async function readCandidateParentDisposition(candidate){
  var binding=candidateRecoveryBinding(candidate);
  if(!binding)return{ok:false,pending:false,
    reason:'candidate_parent_council_binding_invalid'};
  var located=await readRecoveryDispositionAt(binding.hamUid,binding.source);
  if(!located.ok)return{ok:false,pending:true,reason:located.reason};
  if(!located.found)return{ok:true,found:false,source:located.source};
  var parents;
  try{parents=await exactRecoveryReceiptRows({ham_uid:binding.hamUid,
    source:binding.source});}
  catch(eParent){return{ok:false,pending:true,
    reason:'candidate_parent_receipt_read_failed'};}
  if(parents.length!==1)return{ok:false,pending:true,
    reason:'candidate_parent_receipt_exact_read_mismatch'};
  if(!candidateMatchesRecoveryParent(candidate,parents[0],binding))return{ok:false,
    pending:true,reason:'candidate_parent_receipt_binding_mismatch'};
  var valid=validateRecoveryDispositionRow(located.row,parents[0]);
  return valid?{ok:true,found:true,valid:valid,parent:parents[0]}:
    {ok:false,pending:true,reason:'candidate_parent_terminal_disposition_invalid'};
}

function candidateDispositionEnqueueResult(gate,extra){
  if(!gate||gate.ok!==true)return Object.assign({ok:false,
    pending:!gate||gate.pending!==false,
    reason:gate&&gate.reason||'candidate_parent_disposition_unverified'},extra||{});
  return Object.assign({ok:false,terminal:true,
    reason:'candidate_parent_terminal_disposition',
    disposition:gate.valid.content.reason_code,
    dispositionSource:gate.valid.source},extra||{});
}

function candidateDispositionSkipResult(gate){
  return{ok:true,skipped:'parent_terminal_disposition',
    reason:'candidate_parent_terminal_disposition',
    disposition:gate.valid.content.reason_code,
    dispositionSource:gate.valid.source};
}

function dispositionMatches(valid,expected){
  return !!(valid&&expected&&valid.source===expected.source&&
    valid.contentBytes===String(expected.content));
}

function dispositionStateMatches(valid,expected){
  var target;try{target=JSON.parse(expected&&expected.content||'');}catch(e){return false;}
  return !!(valid&&target&&valid.content.version===target.version&&
    valid.content.status===target.status&&
    valid.content.reason_code===target.reason_code&&
    valid.content.detail_code===target.detail_code&&
    stableStringify(valid.content.receipt)===stableStringify(target.receipt)&&
    stableStringify(valid.content.stamp_evidence)===
      stableStringify(target.stamp_evidence));
}

async function stampRecoveryDisposition(parent,reasonCode,detailCode,stampEvidence,graceMs,nowMs){
  var expected=recoveryDispositionRow(parent,reasonCode,detailCode,stampEvidence,graceMs);
  if(!expected)return{ok:false,reason:'reach_recovery_disposition_input_invalid'};
  var now=Number(nowMs===undefined?Date.now():nowMs);
  if(!Number.isFinite(now))return{ok:false,reason:'reach_recovery_disposition_clock_invalid'};
  var before=await readRecoveryDisposition(parent);
  if(!before.ok)return before;
  if(before.found){
    if(!dispositionStateMatches(before.valid,expected))return{ok:false,
      reason:'reach_recovery_disposition_contradiction'};
    return now>=Date.parse(before.valid.content.eligible_at)
      ?terminalDispositionResult(before.valid,true)
      :{ok:false,pending:true,reason:'reach_recovery_disposition_not_yet_eligible'};
  }
  var claimSources=recoveryParentClaimSources(parent);
  if(!claimSources)return{ok:false,reason:'reach_recovery_disposition_claim_input_invalid'};
  var lock=require('../claim_lock.js');
  var claimant='reach.recovery.disposition.'+crypto.randomUUID();
  var leaseMs=5*60*1000;
  var enqueueWon=await lock.claimTask(claimSources.enqueue,claimant,leaseMs)
    .catch(function(){return false;});
  if(!enqueueWon)return{ok:false,pending:true,
    reason:'reach_recovery_disposition_enqueue_claim_denied'};
  var consumeWon=await lock.claimTask(claimSources.consume,claimant,leaseMs)
    .catch(function(){return false;});
  if(!consumeWon){
    await lock.releaseTaskIfOwned(claimSources.enqueue,claimant).catch(function(){});
    return{ok:false,pending:true,
      reason:'reach_recovery_disposition_consume_claim_denied'};
  }
  var releaseClaims=false;
  try{
    // Re-read under both effect leases. Enqueue and outreach use these same
    // locks, so the represented terminal row and both effect seams have one
    // serial order even when the STAMP becomes visible late.
    var locked=await readRecoveryDisposition(parent);
    if(!locked.ok)return locked;
    if(locked.found){
      releaseClaims=true;
      if(!dispositionStateMatches(locked.valid,expected))return{ok:false,
        reason:'reach_recovery_disposition_contradiction'};
      return now>=Date.parse(locked.valid.content.eligible_at)
        ?terminalDispositionResult(locked.valid,true)
        :{ok:false,pending:true,reason:'reach_recovery_disposition_not_yet_eligible'};
    }
    await writeExact(expected);
    var after=await readRecoveryDisposition(parent);
    if(!after.ok)return after;
    var result=after.found&&dispositionMatches(after.valid,expected)&&
        now>=Date.parse(after.valid.content.eligible_at)
      ?terminalDispositionResult(after.valid,false)
      :{ok:false,reason:'reach_recovery_disposition_stamp_unverified'};
    releaseClaims=result.ok===true;
    return result;
  }finally{
    // An uncertain write/readback keeps both leases until expiry. A fully
    // represented terminal row is safe to release because every later path
    // exact-reads that durable veto before reacquiring its own effect lease.
    if(releaseClaims){
      await lock.releaseTaskIfOwned(claimSources.consume,claimant).catch(function(){});
      await lock.releaseTaskIfOwned(claimSources.enqueue,claimant).catch(function(){});
    }
  }
}

function representedTerminalDisposition(result,row){
  var identity=recoveryReceiptIdentity(row);
  return !!(identity&&result&&result.ok===true&&result.terminalInvalid===true&&
    result.readbackVerified===true&&
    RECOVERY_TERMINAL_REASONS.indexOf(result.disposition)!==-1&&
    result.dispositionSource===recoveryDispositionSource(identity)&&
    stableStringify(result.dispositionReceipt||null)===stableStringify(identity)&&
    typeof result.dispositionContentBytes==='string'&&
    result.dispositionContentDigest===sha256Text(result.dispositionContentBytes)&&
    /^[a-f0-9]{64}$/.test(result.dispositionRowDigest||'')&&
    typeof result.dispositionRowId==='string'&&result.dispositionRowId&&
    Number.isFinite(Date.parse(result.dispositionCreatedAt)));
}

async function verifyRepresentedTerminalDisposition(result,row,nowMs){
  if(!representedTerminalDisposition(result,row))return false;
  var now=Number(nowMs===undefined?Date.now():nowMs);
  if(!Number.isFinite(now))return false;
  var durable=await readRecoveryDisposition(row);
  return !!(durable.ok&&durable.found&&durable.valid&&
    durable.valid.source===result.dispositionSource&&
    durable.valid.content.reason_code===result.disposition&&
    stableStringify(durable.valid.content.receipt)===
      stableStringify(result.dispositionReceipt)&&
    durable.valid.contentBytes===result.dispositionContentBytes&&
    durable.valid.contentDigest===result.dispositionContentDigest&&
    durable.valid.rowId===result.dispositionRowId&&
    durable.valid.createdAt===result.dispositionCreatedAt&&
    durable.valid.rowDigest===result.dispositionRowDigest&&
    now>=Date.parse(durable.valid.content.eligible_at));
}

function recoveryLookbackMs(value){
  var parsed=Number(value===undefined?process.env.REACH_RECOVERY_LOOKBACK_MS:value);
  if(!Number.isFinite(parsed)||parsed<60*1000)return DEFAULT_RECOVERY_LOOKBACK_MS;
  return Math.min(Math.floor(parsed),7*24*60*60*1000);
}

function cursorFromRow(row){
  if(!row||row.id===undefined||row.id===null||String(row.id)===''||
      !Number.isFinite(Date.parse(row.created_at)))return null;
  return{created_at:new Date(Date.parse(row.created_at)).toISOString(),id:String(row.id)};
}

function compareRecoveryCursor(left,right){
  if(!left&&!right)return 0;if(left&&!right)return 1;if(!left&&right)return-1;
  var time=Date.parse(left.created_at)-Date.parse(right.created_at);
  if(time)return time<0?-1:1;
  var a=String(left.id),b=String(right.id);
  if(/^\d+$/.test(a)&&/^\d+$/.test(b)){
    var ai=BigInt(a),bi=BigInt(b);return ai===bi?0:ai<bi?-1:1;
  }
  return a===b?0:a<b?-1:1;
}

function checkpointRow(cursor,lookbackMs){
  if(!cursor||!Number.isFinite(Date.parse(cursor.created_at))||
      cursor.id===undefined||cursor.id===null||String(cursor.id)==='')return null;
  var content=JSON.stringify({version:RECOVERY_CHECKPOINT_VERSION,
    cursor_created_at:new Date(Date.parse(cursor.created_at)).toISOString(),
    cursor_id:String(cursor.id),lookback_ms:recoveryLookbackMs(lookbackMs)});
  var source=RECOVERY_CHECKPOINT_PREFIX+
    crypto.createHash('sha256').update(content,'utf8').digest('hex');
  return{ham_uid:RECOVERY_CHECKPOINT_HAM,agent_global:'REACH',
    stamp_type:RECOVERY_CHECKPOINT_STAMP,source:source,
    acl_stamp:RECOVERY_CHECKPOINT_ACL,
    summary:'[REACH RECOVERY CHECKPOINT] fully verified through '+
      new Date(Date.parse(cursor.created_at)).toISOString()+' / '+String(cursor.id),
    content:content,importance:3};
}

function validateCheckpointRow(row){
  if(!row||row.ham_uid!==RECOVERY_CHECKPOINT_HAM||row.agent_global!=='REACH'||
      row.stamp_type!==RECOVERY_CHECKPOINT_STAMP||
      row.acl_stamp!==RECOVERY_CHECKPOINT_ACL)return null;
  var content;try{content=JSON.parse(row.content||'');}catch(e){return null;}
  if(!content||Array.isArray(content)||Object.keys(content).sort().join(',')!==
      'cursor_created_at,cursor_id,lookback_ms,version'||
      content.version!==RECOVERY_CHECKPOINT_VERSION||
      !Number.isFinite(Date.parse(content.cursor_created_at))||
      typeof content.cursor_id!=='string'||!content.cursor_id||
      !Number.isInteger(content.lookback_ms))return null;
  var cursor={created_at:new Date(Date.parse(content.cursor_created_at)).toISOString(),
    id:content.cursor_id};
  var expected=checkpointRow(cursor,content.lookback_ms);
  if(!expected||row.source!==expected.source||row.summary!==expected.summary||
      row.content!==expected.content||Number(row.importance)!==3)return null;
  return{cursor:cursor,lookbackMs:content.lookback_ms,source:row.source};
}

async function readRecoveryCheckpoint(){
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+
    '?ham_uid=eq.'+encodeURIComponent(RECOVERY_CHECKPOINT_HAM)+
    '&agent_global=eq.REACH&stamp_type=eq.'+RECOVERY_CHECKPOINT_STAMP+
    '&source=like.'+encodeURIComponent(RECOVERY_CHECKPOINT_PREFIX+'*')+
    '&order=created_at.desc,id.desc&limit=1&select=id,ham_uid,agent_global,'+
    'stamp_type,source,acl_stamp,summary,content,importance,created_at',
  {headers:headers(false)}).catch(function(){return null;});
  if(!response||!response.ok)return{ok:false,reason:'reach_recovery_checkpoint_read_failed'};
  var rows=await response.json().catch(function(){return null;});
  if(!Array.isArray(rows))return{ok:false,reason:'reach_recovery_checkpoint_read_invalid'};
  if(!rows.length)return{ok:true,cursor:null,source:null};
  if(rows.length!==1)return{ok:false,reason:'reach_recovery_checkpoint_ambiguous'};
  var valid=validateCheckpointRow(rows[0]);
  return valid?{ok:true,cursor:valid.cursor,source:valid.source,
    lookbackMs:valid.lookbackMs}:{ok:false,reason:'reach_recovery_checkpoint_invalid'};
}

async function stampRecoveryCheckpoint(cursor,current,lookbackMs){
  if(compareRecoveryCursor(cursor,current)<=0)return{ok:true,reused:true,
    cursor:current,source:null};
  var row=checkpointRow(cursor,lookbackMs);
  if(!row)return{ok:false,reason:'reach_recovery_checkpoint_cursor_invalid'};
  var before;
  try{before=await exactRows(row.ham_uid,row.stamp_type,row.source,
    'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');}
  catch(eRead){return{ok:false,reason:'reach_recovery_checkpoint_exact_read_failed'};}
  if(before.length){var existing=before.length===1?validateCheckpointRow(before[0]):null;
    return existing?{ok:true,reused:true,cursor:existing.cursor,source:row.source}:
      {ok:false,reason:'reach_recovery_checkpoint_readback_mismatch'};}
  await writeExact(row);
  var after;
  try{after=await exactRows(row.ham_uid,row.stamp_type,row.source,
    'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at');}
  catch(eAfter){return{ok:false,reason:'reach_recovery_checkpoint_readback_failed'};}
  var valid=after.length===1?validateCheckpointRow(after[0]):null;
  return valid?{ok:true,reused:false,cursor:valid.cursor,source:row.source}:
    {ok:false,reason:'reach_recovery_checkpoint_stamp_unverified'};
}

function recoveryWindowStart(cursor,lookbackMs,nowMs,backfill,startAt){
  if(cursor)return new Date(Date.parse(cursor.created_at)-lookbackMs).toISOString();
  if(backfill===true){var configured=Date.parse(startAt||'');
    return Number.isFinite(configured)?new Date(configured).toISOString():
      new Date(0).toISOString();}
  return new Date(nowMs-lookbackMs).toISOString();
}

async function recoverReceiptCandidate(row,options){
  options=options||{};
  if(!recoveryReceiptIdentity(row))return{ok:false,
    reason:'reach_handoff_receipt_identity_invalid'};
  var exactReceipt;
  try{exactReceipt=await exactRecoveryReceiptRows(row);}
  catch(eReceipt){return{ok:false,reason:eReceipt.message};}
  if(exactReceipt.length!==1||!sameRecoveryReceiptRow(exactReceipt[0],row))
    return{ok:false,reason:'reach_handoff_receipt_exact_read_mismatch'};
  row=exactReceipt[0];
  var now=Number(options.nowMs===undefined?Date.now():options.nowMs);
  if(!Number.isFinite(now))return{ok:false,reason:'reach_handoff_recovery_clock_invalid'};
  var graceMs=recoveryPreparedGraceMs(options.preparedGraceMs);
  var content;try{content=JSON.parse(row.content||'');}catch(e){content=null;}
  var receipt=content&&content.receipt;
  var marker=receipt&&receipt.reach_handoff;
  var stampSource=receipt&&receipt.persistence&&receipt.persistence.stamp_source;
  var markerValid=!!(receipt&&marker&&marker.eligible===true&&
    marker.schema==='anew.pai.reach-handoff.v1'&&receipt.ham_uid===row.ham_uid&&
    typeof receipt.cycle_id==='string'&&receipt.cycle_id&&
    row.source==='pai.cycle.'+receipt.cycle_id+'.receipt'&&
    typeof stampSource==='string'&&
    stampSource==='pai.cycle.'+receipt.cycle_id+'.stage.07.stamp');
  if(!markerValid)return stampRecoveryDisposition(row,'RECEIPT_MARKER_INVALID',
    'reach_handoff_receipt_marker_invalid',
    recoveryStampEvidence([],'UNAVAILABLE_RECEIPT_MARKER'),0,now);
  var stampRows;
  try{stampRows=await exactStampRows(receipt.ham_uid,stampSource);}
  catch(eStamp){return{ok:false,pending:true,reason:eStamp.message};}
  var stampEvidence=recoveryStampEvidence(stampRows,null,receipt.ham_uid,stampSource);
  if(!stampEvidence)return{ok:false,pending:true,
    reason:'reach_handoff_stamp_evidence_invalid'};
  var existing=await readRecoveryDisposition(row);
  if(!existing.ok)return existing;
  if(existing.found)return existingDispositionResult(existing.valid,stampEvidence,now);
  if(stampRows.length===0){
    var eligibleAt=Date.parse(row.created_at)+graceMs;
    if(now<eligibleAt)return{ok:false,pending:true,reason:'reach_handoff_stamp_inflight'};
    // The prepared receipt and committed STAMP are separate writes. Confirm the
    // absence twice after the bounded grace before representing a permanent
    // orphan; either uncertain read keeps the page retryable.
    try{stampRows=await exactStampRows(receipt.ham_uid,stampSource);}
    catch(eConfirm){return{ok:false,pending:true,reason:eConfirm.message};}
    stampEvidence=recoveryStampEvidence(stampRows,null,receipt.ham_uid,stampSource);
    if(!stampEvidence)return{ok:false,pending:true,
      reason:'reach_handoff_stamp_evidence_invalid'};
    if(stampRows.length===0)return stampRecoveryDisposition(row,
      'PERMANENTLY_UNCOMMITTED','reach_handoff_stamp_missing_after_grace',
      stampEvidence,graceMs,now);
  }
  if(stampRows.length!==1)return stampRecoveryDisposition(row,'STAMP_NON_UNIQUE',
    'reach_handoff_stamp_non_unique',stampEvidence,0,now);
  var council=require('../pai.outbound.council.js');
  var reconstructed=council.reconstructReachHandoffCouncil(row,stampRows[0]);
  if(!reconstructed||reconstructed.ok!==true)return stampRecoveryDisposition(row,
    'COMMITTED_PAIR_INVALID',reconstructed&&reconstructed.reason||
      'reach_handoff_pair_unverified',stampEvidence,0,now);
  var proof=council.compactCouncilProof(reconstructed);
  if(!proof)return{ok:false,pending:true,
    reason:'reach_handoff_compact_proof_unverified'};
  // Close the race between the first disposition read and a prior scanner's
  // lost-response disposition write before opening the candidate seam.
  var disposition=await readRecoveryDisposition(row);
  if(!disposition.ok)return disposition;
  if(disposition.found)return existingDispositionResult(
    disposition.valid,stampEvidence,now);
  return stampCandidate({hamUid:receipt.ham_uid,cycleId:receipt.cycle_id,
    requestId:receipt.request_id,channel:marker.channel,world:marker.world,
    question:receipt.question,deliberationInput:receipt.deliberation_input,
    answer:receipt.answer,councilProof:proof,councilResult:reconstructed});
}

async function recoverCommittedCycles(options){
  options=options||{};
  try{await ensureQueueUniqueness();}
  catch(eIndex){return{ok:false,reason:'reach_recovery_uniqueness_unverified'};}
  var claimSource='reach.candidate.recovery.cursor.v1';
  var claimant=claimSource+'.'+crypto.randomUUID();
  var leaseMs=5*60*1000;
  var lock=require('../claim_lock.js');
  var won=await lock.claimTask(claimSource,claimant,leaseMs)
    .catch(function(){return false;});
  if(!won)return{ok:true,skipped:'recovery_scan_claim_held',seen:0,recovered:0,
    reused:0,invalid:0,quarantined:0,failures:[],rejections:[],
    contradictions:[],pages:0};
  try{
    var checkpoint=await readRecoveryCheckpoint();
    if(!checkpoint.ok)return checkpoint;
    var lookback=recoveryLookbackMs(options.lookbackMs===undefined?
      checkpoint.lookbackMs:options.lookbackMs);
    var now=Number(options.nowMs===undefined?Date.now():options.nowMs);
    if(!Number.isFinite(now))return{ok:false,reason:'reach_recovery_clock_invalid'};
    var preparedGraceMs=recoveryPreparedGraceMs(options.preparedGraceMs);
    var backfill=options.backfill===true||process.env.REACH_RECOVERY_BACKFILL==='true';
    var start=recoveryWindowStart(checkpoint.cursor,lookback,now,backfill,
      options.backfillStart||process.env.REACH_RECOVERY_BACKFILL_START);
    var recoverOne=options.recoverReceiptCandidate||recoverReceiptCandidate;
    var recovered=0,reused=0,invalid=0,quarantined=0;
    var failures=[],rejections=[],contradictions=[],seen=0,pages=0;
    var current=checkpoint.cursor;
    var seenPages=new Set();
    var pageSize=100;
    async function renewLease(){
      if(typeof lock.renewTaskIfOwned!=='function')return false;
      return lock.renewTaskIfOwned(claimSource,claimant,leaseMs)
        .catch(function(){return false;});
    }
    function lostLease(){return{ok:false,reason:'reach_recovery_claim_lost',
      seen:seen,recovered:recovered,reused:reused,invalid:invalid,
      quarantined:quarantined,failures:failures.slice(0,10),
      rejections:rejections.slice(0,10),contradictions:contradictions.slice(0,10),
      pages:pages,cursor:current,
      windowStart:start,backfill:backfill};}
    for(var pageIndex=0;pageIndex<1000;pageIndex++){
      // A page may perform hundreds of readback checks. Refresh the distributed
      // lease before reading it, and again before committing its cursor, so an
      // expired slower worker can neither overlap the next page nor regress the
      // checkpoint after a newer instance takes ownership.
      if(!await renewLease())return lostLease();
      var offset=pageIndex*pageSize;
      var filter='agent_global=eq.PAI_OUTBOUND_COUNCIL&stamp_type=eq.CYCLE_RECEIPT'+
        '&acl_stamp=ilike.'+encodeURIComponent('*prepared_reach_eligible*')+
        '&created_at=gte.'+encodeURIComponent(start);
      var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+'?'+filter+
        '&order=created_at.asc,id.asc&limit='+pageSize+'&offset='+offset+
        '&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at',
      {headers:headers(false)}).catch(function(){return null;});
      if(!response||!response.ok)return{ok:false,
        reason:'reach_handoff_receipt_scan_failed:'+(response&&response.status||'network'),
        seen:seen,recovered:recovered,reused:reused,invalid:invalid,
        failures:failures.slice(0,10),pages:pages,cursor:current};
      var page=await response.json().catch(function(){return null;});
      if(!Array.isArray(page))return{ok:false,reason:'reach_handoff_receipt_scan_invalid',
        seen:seen,recovered:recovered,reused:reused,invalid:invalid,
        failures:failures.slice(0,10),pages:pages,cursor:current};
      var signature=page.length?stableStringify(page.map(function(row){
        return[row&&row.id||null,row&&row.source||null,row&&row.created_at||null];})):'none';
      if(page.length&&seenPages.has(signature))return{ok:false,
        reason:'reach_handoff_receipt_scan_repeated_page',seen:seen,recovered:recovered,
        reused:reused,invalid:invalid,failures:failures.slice(0,10),pages:pages,
        cursor:current};
      if(page.length)seenPages.add(signature);
      pages++;
      var pageFailed=false;
      for(const row of page){
        seen++;
        var rowCursor=cursorFromRow(row);
        var result;
        if(!rowCursor)result={ok:false,reason:'reach_handoff_receipt_cursor_invalid'};
        else try{result=await recoverOne(row,{nowMs:now,
          preparedGraceMs:preparedGraceMs});}
        catch(eRecover){result={ok:false,
          reason:'reach_handoff_recovery_failed:'+eRecover.message};}
        if(await verifyRepresentedTerminalDisposition(result,row,now)){
          invalid++;quarantined++;rejections.push(result.disposition);
          if(result.contradiction===true&&
              /^[A-Z0-9_]{3,120}$/.test(String(result.contradictionCode||'')))
            contradictions.push(result.contradictionCode);
        }else if(result&&result.ok&&result.terminalInvalid===true){
          pageFailed=true;invalid++;failures.push(
            'reach_recovery_disposition_result_unverified');
        }else if(result&&result.ok){if(result.reused)reused++;else recovered++;}
        else{pageFailed=true;invalid++;failures.push(result&&result.reason||
          'reach_handoff_recovery_failed');}
      }
      if(pageFailed)return{ok:false,reason:'reach_handoff_receipt_recovery_incomplete',
        seen:seen,recovered:recovered,reused:reused,invalid:invalid,
        quarantined:quarantined,failures:failures.slice(0,10),
        rejections:rejections.slice(0,10),contradictions:contradictions.slice(0,10),
        pages:pages,cursor:current,
        windowStart:start,backfill:backfill};
      if(page.length){
        if(!await renewLease())return lostLease();
        var pageCursor=cursorFromRow(page[page.length-1]);
        var stamped=await stampRecoveryCheckpoint(pageCursor,current,lookback);
        if(!stamped.ok)return{ok:false,reason:stamped.reason,seen:seen,
          recovered:recovered,reused:reused,invalid:invalid,
          quarantined:quarantined,failures:failures.slice(0,10),
          rejections:rejections.slice(0,10),contradictions:contradictions.slice(0,10),
          pages:pages,cursor:current,
          windowStart:start,backfill:backfill};
        if(compareRecoveryCursor(pageCursor,current)>0)current=pageCursor;
      }
      if(page.length<pageSize)return{ok:true,seen:seen,recovered:recovered,
        reused:reused,invalid:invalid,quarantined:quarantined,failures:[],
        rejections:rejections.slice(0,10),contradictions:contradictions.slice(0,10),
        pages:pages,cursor:current,
        checkpointSource:checkpoint.source||null,windowStart:start,backfill:backfill};
    }
    return{ok:false,reason:'reach_handoff_receipt_scan_page_limit',seen:seen,
      recovered:recovered,reused:reused,invalid:invalid,quarantined:quarantined,
      failures:failures.slice(0,10),rejections:rejections.slice(0,10),
      contradictions:contradictions.slice(0,10),pages:pages,cursor:current};
  }finally{
    await lock.releaseTaskIfOwned(claimSource,claimant).catch(function(){});
  }
}

async function consumePending() {
  if(!_bu()||!_bk())return{ok:false,reason:'no_brain'};
  // Recover any ordinary cycle whose canonical council committed but whose
  // candidate append/readback was lost. The eligibility marker is in that same
  // CYCLE_RECEIPT/STAMP pair; external/finalizer councils never enter this scan.
  var recovery=await recoverCommittedCycles();
  var scanned=await scanDurableRows('agent_global=eq.REACH&stamp_type=eq.'+
    CANDIDATE_STAMP+'&source=like.reach.candidate.*','candidate');
  if(!scanned.ok)return scanned;
  var rows=scanned.rows;
  var consumed=[];
  var invalid=0;
  for(const row of rows){
    var candidate=validateCandidateRow(row);
    if(!candidate){invalid++;continue;}
    try { consumed.push(await consumeCandidate(candidate)); }
    catch(eConsume){consumed.push({ok:false,reason:'candidate_consume_failed:'+eConsume.message});}
  }
  var completed=consumed.filter(function(result){return result&&result.ok===true;}).length;
  var pending=consumed.filter(function(result){return result&&result.pending===true;}).length;
  var failed=consumed.length-completed-pending;
  var ok=recovery.ok===true&&failed===0;
  return{ok:ok,seen:rows.length,valid:rows.length-invalid,
    invalid:invalid,consumed:consumed.length,completed:completed,pending:pending,
    failed:failed,recovery:recovery,
    reason:ok?null:recovery.ok!==true?recovery.reason:'candidate_consume_incomplete'};
}

function singleFlightConsumerTick(consume,report){
  var inFlight=null;
  return function tick(){
    if(inFlight)return inFlight;
    inFlight=Promise.resolve().then(consume).then(function(result){
      if(!result||result.ok!==true){
        var detail=result&&result.reason||'unknown';
        var inner=result&&result.recovery&&Array.isArray(result.recovery.failures)&&
          result.recovery.failures[0];
        if(inner)detail+=':'+inner;
        report('incomplete',detail);
      }
      return result;
    }).catch(function(error){
      report('failed',error&&error.message||'unknown');
      return{ok:false,reason:'candidate_scan_failed:'+(error&&error.message||'unknown')};
    }).finally(function(){inFlight=null;});
    return inFlight;
  };
}

function startConsumer(intervalMs) {
  var ms=intervalMs||parseInt(process.env.REACH_CANDIDATE_INTERVAL_MS||'',10)||60000;
  var tick=singleFlightConsumerTick(consumePending,function(kind,reason){
    console.error('[REACH] candidate scan '+kind+':',reason);});
  setTimeout(tick,5000);
  var timer=setInterval(tick,ms);
  if(timer.unref)timer.unref();
  return timer;
}

module.exports={enqueueCommittedCycle,consumeEnqueued,afterCommittedCycle,consumePending,startConsumer,
  _test:{candidateRowFromInput,validateCandidateRow,stampCandidate,consumeCandidate,
    sameCandidateCommitment,
    stampDone,validateDoneRow,resultTruth,pendingIdentityState,stableStringify,
    terminalCandidateResult,scanDurableRows,recoverReceiptCandidate,
    recoverCommittedCycles,recoveryLookbackMs,cursorFromRow,compareRecoveryCursor,
    checkpointRow,validateCheckpointRow,readRecoveryCheckpoint,
    stampRecoveryCheckpoint,recoveryWindowStart,recoveryPreparedGraceMs,
    recoveryReceiptIdentity,recoveryStampEvidence,recoveryDispositionSource,
    recoveryDispositionRow,validateRecoveryDispositionRow,
    readRecoveryDisposition,stampRecoveryDisposition,terminalDispositionResult,
    representedTerminalDisposition,verifyRepresentedTerminalDisposition,
    singleFlightConsumerTick}};
