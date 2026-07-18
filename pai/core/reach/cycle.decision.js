// ⬡B:core.reach.cycle_decision:MODULE:one_council_owns_reach:20260717⬡
// entered after exact-HAM fact retrieval. A model-ladder result is an untrusted
// proposal. One directly persisted outbound council is the authority for the
// policy in question and the exact human-facing bytes in answer.
'use strict';

const crypto = require('node:crypto');
const policyContract = require('./policy.contract.js');
const voiceConversationPolicy = require('../voice.conversation.policy.js');

const POLICY_VERSION = 'anew.reach.council-policy.v1';
const EVIDENCE_VERSION = 'anew.reach.council-evidence.v1';
const STAMP_TYPE = 'REACH_CYCLE_DECISION';
const CHANNELS = new Set(['voice','text','email','command_center']);

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}
function headers(write){var h={apikey:_bk(),Authorization:'Bearer '+_bk(),
  'Accept-Profile':_schema()};if(write){h['Content-Profile']=_schema();
  h['Content-Type']='application/json';h.Prefer='return=representation';}return h;}

function digest(value){return crypto.createHash('sha256').update(String(value),'utf8').digest('hex');}
function stableStringify(value){
  if(value===null)return'null';
  if(Array.isArray(value))return'['+value.map(stableStringify).join(',')+']';
  if(typeof value==='object')return'{'+Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+stableStringify(value[key]);}).join(',')+'}';
  return JSON.stringify(value);
}
function bounded(value,limit){return String(value==null?'':value).replace(/\0/g,'').slice(0,limit);}
function validIso(value){var ms=typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(ms)?new Date(ms).toISOString():null;}

function normalizedProof(proof){
  if(!proof||typeof proof!=='object'||Array.isArray(proof))return null;
  return{request_id:bounded(proof.request_id,160),cycle_id:bounded(proof.cycle_id,220),
    final_source:bounded(proof.final_source,500),receipt_digest:bounded(proof.receipt_digest,64).toLowerCase(),
    answer_digest:bounded(proof.answer_digest,64).toLowerCase(),answer_bytes:Number(proof.answer_bytes),
    readback_verified:proof.readback_verified===true,
    representation_count:Number(proof.representation_count),row_count:Number(proof.row_count),
    stage_count:Number(proof.stage_count),committed:proof.committed===true,
    delivery_target_digest:proof.delivery_target_digest||null,
    delivery_target_bytes:proof.delivery_target_bytes==null?null:Number(proof.delivery_target_bytes)};
}

function proofBindsAnswer(proof,requestId,cycleId,answer){
  var p=normalizedProof(proof);
  return!!(p&&p.request_id===requestId&&p.cycle_id===cycleId&&p.final_source&&
    /^[a-f0-9]{64}$/.test(p.receipt_digest)&&p.answer_digest===digest(answer)&&
    p.answer_bytes===Buffer.byteLength(String(answer),'utf8')&&p.readback_verified===true&&
    p.representation_count===9&&p.row_count===9&&p.stage_count===7&&p.committed===true);
}

function normalizeCandidate(candidate,hamUid){
  if(!candidate)return null;
  var uid=bounded(candidate.hamUid||candidate.ham_uid,160).trim().toUpperCase();
  var requestId=bounded(candidate.requestId||candidate.request_id,160).trim();
  var cycleId=bounded(candidate.cycleId||candidate.cycle_id,220).trim();
  var answer=typeof candidate.answer==='string'?candidate.answer:'';
  var question=typeof candidate.question==='string'?candidate.question:'';
  var deliberationInput=typeof candidate.deliberationInput==='string'
    ?candidate.deliberationInput:typeof candidate.deliberation_input==='string'
      ?candidate.deliberation_input:'';
  var committedAt=validIso(candidate.committedAt||candidate.committed_at);
  var source=bounded(candidate.source,500).trim();
  var proof=normalizedProof(candidate.councilProof||candidate.council_proof);
  var origin=candidate.originatingCouncil||candidate.originating_council;
  if(uid!==hamUid||!/^[A-Z0-9._:-]{2,160}$/.test(uid)||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(requestId)||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(cycleId)||!question.trim()||!answer.trim()||
      !committedAt||!deliberationInput.trim()||source!=='reach.candidate.'+uid+'.'+cycleId||
      !proofBindsAnswer(proof,requestId,cycleId,answer)||!origin)return null;
  try{
    var council=require('../pai.outbound.council.js');
    var verified=council.requireVerifiedCouncilResult(origin,{hamUid:uid,
      requestId:requestId,cycleId:cycleId,question:question,
      deliberationInput:deliberationInput,answer:answer});
    var durableProof=verified&&verified.ok?normalizedProof(council.compactCouncilProof(origin)):null;
    if(!verified||verified.ok!==true||stableStringify(durableProof)!==stableStringify(proof))return null;
  }catch(eOrigin){return null;}
  return{source:source,hamUid:uid,requestId:requestId,cycleId:cycleId,
    channel:bounded(candidate.channel||'unknown',80).trim().toLowerCase(),
    world:bounded(candidate.world,120).trim()||null,question:question,answer:answer,
    deliberationInput:deliberationInput,committedAt:committedAt,councilProof:proof};
}

function boundedEvidenceClaim(value,limit){
  value=String(value==null?'':value);
  var bytes=Buffer.byteLength(value,'utf8');
  var excerpt=bounded(value,limit);
  return{digest:digest(value),bytes:bytes,excerpt:excerpt,
    truncated:excerpt.length<value.length};
}

function normalizeFacts(facts){
  if(!Array.isArray(facts))return[];
  return facts.slice(0,12).map(function(fact){return{
    id:bounded(fact&&fact.id,180),source:bounded(fact&&fact.source,500),
    stamp_type:bounded(fact&&fact.stamp_type,120),summary:bounded(fact&&fact.summary,500),
    content:bounded(fact&&fact.content,1200),created_at:bounded(fact&&fact.created_at,80),
    importance:Math.max(0,Math.min(10,Number(fact&&fact.importance)||0))};});
}

function normalizePresence(value,hamUid){
  value=value||{};
  var uid=bounded(value.ham_uid,160).trim().toUpperCase();
  var status=bounded(value.status||'unknown',40).trim().toLowerCase();
  var snapshotDigest=bounded(value.snapshot_digest,64).toLowerCase();
  if(uid!==hamUid||!new Set(['online','away','offline','ghost','unknown']).has(status)||
      !/^[a-f0-9]{64}$/.test(snapshotDigest))return null;
  var normalized={version:1,ham_uid:uid,observed:value.observed===true,status:status,
    heartbeat_at:validIso(value.heartbeat_at),
    activity:bounded(value.activity,120)||null,source:'circle.presence',
    row_observed_at:validIso(value.row_observed_at),
    readback_verified:value.readback_verified===true,
    unavailable_reason:bounded(value.unavailable_reason||value.reason,120)||null};
  // age_ms changes every poll without any presence transition. Bind heartbeat,
  // status, activity, and verification instead so HOLD/DEFER remains stable
  // until Circle reports a meaningful change.
  normalized.snapshot_digest=digest(stableStringify(normalized));
  return normalized;
}

function normalizeMechanical(value){
  value=value||{};
  var kill=String(value.kill_switch||'unverified').toLowerCase();
  if(!/^(clear|active|unverified)$/.test(kill))kill='unverified';
  return{kill_switch:kill,attempt_floor_held:value.attempt_floor_held===true,
    attempt_floor_ends_at:validIso(value.attempt_floor_ends_at)||null,
    attempt_floor_verified:value.attempt_floor_verified===true};
}

function normalizeChannelAvailability(value,hamUid){
  value=value||{};
  var uid=bounded(value.ham_uid||hamUid,160).trim().toUpperCase();
  if(uid!==hamUid)return null;
  function lane(name,fields){
    var raw=value[name]||{};
    var out={};
    fields.forEach(function(field){out[field]=raw[field]===true;});
    out.available=raw.available===true;
    var required=fields.every(function(field){return out[field]===true;});
    if(out.available!==required)return null;
    out.reason=bounded(raw.reason||'',120)||null;
    return out;
  }
  var voice=lane('voice',['target_present','provider_configured']);
  var text=lane('text',['target_present','provider_configured']);
  var email=lane('email',['target_present','world_resolved','production_application',
    'provider_configured','send_mode_live','terminal_truth_ready']);
  if(!voice||!text||!email)return null;
  return{version:1,ham_uid:uid,command_center:{available:true},
    voice:voice,text:text,email:email};
}

function channelAvailable(shape,channel){
  if(channel==='command_center')return shape.evidence.channels.command_center.available===true;
  var lane=shape.evidence.channels[channel];
  return!!(lane&&lane.available===true);
}

function evidenceShape(input){
  input=input||{};
  var hamUid=bounded(input.hamUid,160).trim().toUpperCase();
  if(!/^[A-Z0-9._:-]{2,160}$/.test(hamUid))return null;
  var candidate=input.candidate?normalizeCandidate(input.candidate,hamUid):null;
  if(input.candidate&&!candidate)return null;
  var presence=normalizePresence(input.presence,hamUid);
  if(!presence)return null;
  var channels=normalizeChannelAvailability(input.channelAvailability,hamUid);
  if(!channels)return null;
  var facts=normalizeFacts(input.facts);
  var factsText=stableStringify(facts);
  var evidence={version:EVIDENCE_VERSION,ham_uid:hamUid,
    origin:candidate?'committed_pai_cycle':'autonomous_priority_scan',
    candidate:candidate?{source:candidate.source,request_id:candidate.requestId,
      cycle_id:candidate.cycleId,committed_at:candidate.committedAt,
      channel:candidate.channel,world:candidate.world,
      question:boundedEvidenceClaim(candidate.question,1200),
      deliberation_input:boundedEvidenceClaim(candidate.deliberationInput,1600),
      answer:boundedEvidenceClaim(candidate.answer,2400),
      council_proof:candidate.councilProof}:null,
    quiet_gap_held:input.gapHeld===true,
    quiet_gap_ends_at:validIso(input.quietGapEndsAt)||null,
    mechanical:normalizeMechanical(input.mechanical),
    recheck_of:bounded(input.recheckOf,500)||null,
    presence:presence,
    channels:channels,
    facts_digest:digest(factsText),facts:facts};
  var text=stableStringify(evidence);
  return{hamUid:hamUid,candidate:candidate,facts:facts,evidence:evidence,
    evidenceText:text,evidenceDigest:digest(text),factsDigest:evidence.facts_digest};
}

function parseProposal(raw,nowMs){
  return policyContract.parseProposal(raw,nowMs);
}

function proposalPrompt(shape,nowIso){
  var voiceChoices=voiceConversationPolicy.AUTONOMOUS_REACH_VOICE_PURPOSES
    .map(function(message){return JSON.stringify(message);}).join(' OR ');
  var system='Propose one grounded REACH policy for A\u2019NU. You are not the authority; one full PAI council will accept or hold the proposal. Use only EVIDENCE. NOW means one immediate channel and you MUST choose only a channel whose EVIDENCE.channels lane says available true. HOLD means no outreach. DEFER means no message now and a fresh decision at recheck_at, never replaying stale bytes. Voice is only for truly interruptive content needing a live answer now, and is forbidden when Circle presence is unknown or unverified. For voice, message must equal one complete allowed sentence exactly: '+voiceChoices+'. Select only a sentence whose claim is supported by EVIDENCE; do not add a name, greeting, suffix, question, or second sentence. Text is a concise time-sensitive interruption. Email is longer asynchronous material; when channel is email, message must be one complete artifact in the exact form Subject: <subject>, one blank line, then body. command_center is visible without interrupting. Never include provider coordinates, proof mechanics, internal build narration, or unsupported facts. Return one strict JSON object and nothing else.';
  var user='NOW_ISO: '+nowIso+'\nQUIET_GAP_ENDS_AT: '+
    (shape.evidence.quiet_gap_ends_at||'NONE')+
    '\nReturn exactly keys {"action":"NOW|HOLD|DEFER","reach":true|false,"channel":"voice|text|email|command_center|none","importance":1-10,"reason":"one sentence","recheck_at":"ISO or null","message":"exact proposed human bytes or empty"}.\n\nEVIDENCE:\n'+shape.evidenceText;
  return{system:system,user:user};
}

async function propose(shape,nowMs){
  var nowIso=new Date(nowMs).toISOString();
  var prompt=proposalPrompt(shape,nowIso);
  var result=await require('../model.ladder.js').deliberate(prompt.system,prompt.user,
    {json:true,max_tokens:1400,temperature:0.25,timeout:30000});
  var proposal=result&&parseProposal(result.content,nowMs);
  return proposal?{ok:true,proposal:proposal,model:result.model||null,via:result.via||null,
    rawDigest:digest(result.content)}:{ok:false,reason:'reach_policy_proposal_unavailable'};
}

function policyDecisionQuestion(shape){
  var voiceChoices=voiceConversationPolicy.AUTONOMOUS_REACH_VOICE_PURPOSES
    .map(function(message){return JSON.stringify(message);}).join(' OR ');
  return'Decide the authoritative REACH policy for this exact HAM and evidence. '+
    'Return exactly one JSON object with keys action, reach, channel, importance, reason, '+
    'recheck_at, message. This committed PAI answer alone owns whether, when, channel, '+
    'importance, reason, and proposed human bytes. NOW means reach true and one channel. '+
    'HOLD means reach false, channel none, empty message, null recheck_at. DEFER means '+
    'reach false, channel none, empty message, and an ISO recheck within 48 hours. Voice '+
    'requires importance 9 or 10, verified current Circle presence, and a live answer now. '+
    'For voice, message must equal one complete allowed sentence exactly: '+voiceChoices+'. '+
    'Select only a sentence whose claim is supported by EVIDENCE; do not add a name, '+
    'greeting, suffix, question, or second sentence. '+
    'Email message must be exactly Subject: <subject>, one blank line, then body. Do not '+
    'choose any unavailable channel in EVIDENCE.channels. Do not call tools or perform an '+
    'external effect. EVIDENCE_DIGEST: '+shape.evidenceDigest;
}

function policyDecisionPrompt(shape,draft,nowMs){
  var question=policyDecisionQuestion(shape);
  var deliberation='NOW_ISO: '+new Date(nowMs).toISOString()+'\n\n'+
    'UNTRUSTED LADDER DRAFT (advisory only; reject or change it freely):\n'+
    (draft?JSON.stringify(draft):'NONE')+'\n\nVERIFIED EXACT-HAM EVIDENCE:\n'+
    shape.evidenceText;
  return{question:question,deliberation:deliberation};
}

async function decidePolicyWithPAI(shape,draft,nowMs,input){
  var prompt=policyDecisionPrompt(shape,draft,nowMs);
  var requestId='reach.policy.'+shape.evidenceDigest.slice(0,24)+
    digest(crypto.randomUUID()).slice(0,12);
  var identity={uid:shape.hamUid,ham_uid:shape.hamUid,request_id:requestId,
    user_message:prompt.question,world:input&&input.world||shape.candidate&&shape.candidate.world||null,
    outbound_finalize:true,delivery:{external:false},
    council_context:{mode:'reach_policy_decision',outbound_finalize:true,
      evidence_digest:shape.evidenceDigest}};
  var pai;
  try{pai=await require('../tool.loop.js').runPAI(shape.hamUid,prompt.deliberation,
    'reach',identity,[],null);}catch(ePai){return{ok:false,reason:'reach_policy_pai_failed'};}
  if(!pai||pai.ok!==true||typeof pai.answer!=='string'||!pai.cycleId)
    return{ok:false,reason:pai&&pai.reason||'reach_policy_pai_failed'};
  var authoritative=parseProposal(pai.answer,nowMs);
  if(!authoritative)return{ok:false,reason:'reach_policy_pai_schema_invalid'};
  var council=require('../pai.outbound.council.js');
  var expected={hamUid:shape.hamUid,requestId:requestId,cycleId:pai.cycleId,
    question:prompt.question,deliberationInput:prompt.deliberation,answer:pai.answer};
  var verified=council.requireVerifiedCouncilResult(pai,expected);
  var proof=verified&&verified.ok?council.compactCouncilProof(pai):null;
  if(!verified||!verified.ok||!proofBindsAnswer(proof,requestId,pai.cycleId,pai.answer))
    return{ok:false,reason:'reach_policy_pai_commit_unverified'};
  return{ok:true,decision:authoritative,question:prompt.question,
    deliberationInput:prompt.deliberation,answer:pai.answer,proof:proof,
    result:{ok:true,answer:pai.answer,
      council_receipt:pai.council_receipt||pai.councilReceipt,
      stamp_proof:pai.stamp_proof||pai.stampProof}};
}

function validatePolicyAuthority(shape,policy,authority,nowMs){
  if(!authority||typeof authority!=='object')return false;
  if(authority.question!==policyDecisionQuestion(shape)||
      !String(authority.deliberationInput||'').endsWith(
        '\n\nVERIFIED EXACT-HAM EVIDENCE:\n'+shape.evidenceText))return false;
  var promptNow=String(authority.deliberationInput||'').match(/^NOW_ISO: ([^\n]+)/);
  var authorityNow=promptNow&&Date.parse(promptNow[1]);
  var parsed=parseProposal(authority.answer,Number.isFinite(nowMs)?nowMs:
    Number.isFinite(authorityNow)?authorityNow:0);
  if(!parsed)return false;
  var proposedArtifact=artifactForProposal(parsed);
  var expectedPolicy=policyFromProposal(shape,parsed,proposedArtifact);
  if(stableStringify(expectedPolicy)!==stableStringify(policy))return false;
  var full=authority.result;
  var receipt=full&&(full.council_receipt||full.councilReceipt);
  if(!receipt||receipt.question!==authority.question||
      receipt.deliberation_input!==authority.deliberationInput||receipt.answer!==authority.answer)
    return false;
  try{
    var council=require('../pai.outbound.council.js');
    var verified=council.requireVerifiedCouncilResult(full,{hamUid:shape.hamUid,
      requestId:receipt.request_id,cycleId:receipt.cycle_id,question:authority.question,
      deliberationInput:authority.deliberationInput,answer:authority.answer});
    var proof=verified&&verified.ok?council.compactCouncilProof(full):null;
    return!!(verified&&verified.ok&&stableStringify(normalizedProof(proof))===
      stableStringify(normalizedProof(authority.proof)));
  }catch(eAuthority){return false;}
}

function policyFromProposal(shape,proposal,artifact){
  return{version:POLICY_VERSION,ham_uid:shape.hamUid,evidence_digest:shape.evidenceDigest,
    facts_digest:shape.factsDigest,candidate_source:shape.candidate&&shape.candidate.source||null,
    parent_request_id:shape.candidate&&shape.candidate.requestId||null,
    parent_cycle_id:shape.candidate&&shape.candidate.cycleId||null,
    reach:proposal.reach,when:proposal.action,channel:proposal.channel,
    recheck_at:proposal.recheck_at,importance:proposal.importance,reason:proposal.reason,
    presence_digest:shape.evidence.presence.snapshot_digest,
    presence_status:shape.evidence.presence.status,
    presence_verified:shape.evidence.presence.readback_verified,
    proposed_message_digest:digest(artifact),
    proposed_message_bytes:Buffer.byteLength(artifact,'utf8')};
}

function artifactForProposal(proposal){
  if(proposal.action==='NOW')return proposal.message;
  if(proposal.action==='DEFER')return'REACH deferred until '+proposal.recheck_at+': '+proposal.reason;
  return'REACH held: '+proposal.reason;
}

function validatePolicy(shape,policy){
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||
      Object.keys(policy).sort().join(',')!==
        'candidate_source,channel,evidence_digest,facts_digest,ham_uid,importance,parent_cycle_id,parent_request_id,presence_digest,presence_status,presence_verified,proposed_message_bytes,proposed_message_digest,reach,reason,recheck_at,version,when')return false;
  if(policy.version!==POLICY_VERSION||policy.ham_uid!==shape.hamUid||
      policy.evidence_digest!==shape.evidenceDigest||policy.facts_digest!==shape.factsDigest||
      policy.candidate_source!==(shape.candidate&&shape.candidate.source||null)||
      policy.parent_request_id!==(shape.candidate&&shape.candidate.requestId||null)||
      policy.parent_cycle_id!==(shape.candidate&&shape.candidate.cycleId||null)||
      policy.presence_digest!==shape.evidence.presence.snapshot_digest||
      policy.presence_status!==shape.evidence.presence.status||
      policy.presence_verified!==shape.evidence.presence.readback_verified||
      !/^[a-f0-9]{64}$/.test(policy.proposed_message_digest)||
      !Number.isInteger(policy.proposed_message_bytes)||policy.proposed_message_bytes<0||
      !Number.isInteger(policy.importance)||policy.importance<1||policy.importance>10||
      typeof policy.reason!=='string'||!policy.reason||/[\r\n\0]/.test(policy.reason))return false;
  if(policy.when==='NOW')return policy.reach===true&&CHANNELS.has(policy.channel)&&
    channelAvailable(shape,policy.channel)&&
    !(policy.channel==='voice'&&(policy.importance<9||
      policy.presence_verified!==true||shape.evidence.presence.observed!==true||
      !/^(online|away)$/.test(policy.presence_status)))&&
    policy.recheck_at===null&&policy.proposed_message_bytes>0;
  if(policy.when==='HOLD')return policy.reach===false&&policy.channel==='none'&&
    policy.recheck_at===null&&policy.proposed_message_bytes>0;
  return policy.when==='DEFER'&&policy.reach===false&&policy.channel==='none'&&
    !!validIso(policy.recheck_at)&&policy.proposed_message_bytes>0;
}

function validateCommittedDecision(shape,policy,artifact,full,proof,deliveryTarget,councilChannel){
  if(!validatePolicy(shape,policy)||!full||full.ok!==true||full.answer!==artifact)return false;
  var receipt=full.council_receipt||full.councilReceipt;
  var stamp=full.stamp_proof||full.stampProof;
  var expectedChannel=policy.channel==='none'?'reach':policy.channel;
  if(councilChannel!==expectedChannel||!receipt||!stamp||receipt.ham_uid!==shape.hamUid||
      receipt.question!==JSON.stringify(policy)||receipt.deliberation_input!==shape.evidenceText||
      receipt.answer!==artifact||receipt.answer_digest!==digest(artifact)||
      receipt.answer_bytes!==Buffer.byteLength(artifact,'utf8')||
      stamp.answer_digest!==digest(artifact)||
      !proofBindsAnswer(proof,receipt.request_id,receipt.cycle_id,artifact))return false;
  try{
    var council=require('../pai.outbound.council.js');
    var verified=council.requireVerifiedCouncilResult(full,{hamUid:shape.hamUid,
      requestId:receipt.request_id,cycleId:receipt.cycle_id,question:JSON.stringify(policy),
      deliberationInput:shape.evidenceText,answer:artifact,deliveryTarget:deliveryTarget});
    if(!verified||verified.ok!==true)return false;
  }catch(eVerify){return false;}
  if(policy.channel==='email'&&
      !/^Subject: [^\r\n\0]+(?:\r?\n){2}\S[\s\S]*$/.test(artifact))return false;
  return policy.channel!=='voice'||voiceConversationPolicy
    .isAutonomousReachVoicePurposeStatement(artifact);
}

function decisionPrefix(shape){return'reach.cycle_decision.'+shape.hamUid+'.'+shape.evidenceDigest+'.';}
async function readDecisionRows(shape){
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl()+
    '?ham_uid=eq.'+encodeURIComponent(shape.hamUid)+'&agent_global=eq.REACH'+
    '&stamp_type=eq.'+STAMP_TYPE+'&source=like.'+encodeURIComponent(decisionPrefix(shape)+'*')+
    '&limit=2&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at',
  {headers:headers(false)}).catch(function(){return null;});
  if(!response||response.ok!==true)return{ok:false,reason:'reach_cycle_decision_read_failed'};
  var rows=await response.json().catch(function(){return null;});
  return Array.isArray(rows)?{ok:true,rows:rows}:{ok:false,reason:'reach_cycle_decision_read_invalid'};
}

function decisionRow(shape,policy,artifact,proof,councilResult,proposalMeta,deliveryTarget,
  policyAuthority){
  var policyText=JSON.stringify(policy);
  var policyDigest=digest(policyText);
  var content={version:POLICY_VERSION,evidence_digest:shape.evidenceDigest,
    facts_digest:shape.factsDigest,policy:policy,policy_text:policyText,
    policy_digest:policyDigest,artifact:artifact,artifact_digest:digest(artifact),
    // Keep the historical target that the council actually bound. Current
    // contact resolution is checked separately during hydration and may never
    // be substituted into an old receipt.
    delivery_target:deliveryTarget,
    policy_authority:policyAuthority,
    council_proof:normalizedProof(proof),council_result:{ok:true,answer:artifact,
      council_receipt:councilResult&&(councilResult.council_receipt||councilResult.councilReceipt),
      stamp_proof:councilResult&&(councilResult.stamp_proof||councilResult.stampProof)},
    proposal_provenance:{model:proposalMeta&&proposalMeta.model||null,
      via:proposalMeta&&proposalMeta.via||null,raw_digest:proposalMeta&&
        (proposalMeta.rawDigest||proposalMeta.raw_digest)||null}};
  return{ham_uid:shape.hamUid,agent_global:'REACH',stamp_type:STAMP_TYPE,
    source:decisionPrefix(shape)+policyDigest,
    acl_stamp:'⬡B:core.reach.cycle_decision:REACH_CYCLE_DECISION:one_council:20260717⬡',
    summary:'[REACH CYCLE DECISION] '+policy.when+' via '+policy.channel,
    content:JSON.stringify(content),importance:Math.max(3,policy.importance)};
}

function sameRow(row,expected){return!!(row&&expected&&row.ham_uid===expected.ham_uid&&
  row.agent_global===expected.agent_global&&row.stamp_type===expected.stamp_type&&
  row.source===expected.source&&row.acl_stamp===expected.acl_stamp&&
  row.summary===expected.summary&&String(row.content)===String(expected.content)&&
  Number(row.importance)===Number(expected.importance));}

async function targetForPolicy(input,policy){
  if(typeof input.resolveTarget!=='function')return{ok:false,reason:'reach_delivery_target_resolver_missing'};
  var resolved=await input.resolveTarget(policy.channel,policy.when);
  if(!resolved||resolved.ok!==true||!resolved.deliveryTarget)return resolved||
    {ok:false,reason:'reach_delivery_target_invalid'};
  var canonical;
  try{canonical=require('../pai.outbound.council.js')
    .canonicalizeDeliveryTarget(resolved.deliveryTarget);}catch(eTarget){canonical=null;}
  if(!canonical)return{ok:false,reason:'reach_delivery_target_invalid'};
  return Object.assign({},resolved,{deliveryTarget:canonical});
}

async function hydrate(shape,row,input){
  var content;try{content=JSON.parse(row.content||'');}catch(e){content=null;}
  if(!content||content.version!==POLICY_VERSION||content.evidence_digest!==shape.evidenceDigest||
      content.facts_digest!==shape.factsDigest||content.policy_text!==JSON.stringify(content.policy)||
      content.policy_digest!==digest(content.policy_text)||content.artifact_digest!==digest(content.artifact||'')||
      !validatePolicyAuthority(shape,content.policy,content.policy_authority))return null;
  var council=require('../pai.outbound.council.js');
  var storedTarget;
  try{storedTarget=council.canonicalizeDeliveryTarget(content.delivery_target);}
  catch(eStored){storedTarget=null;}
  if(!storedTarget||stableStringify(storedTarget)!==stableStringify(content.delivery_target))return null;
  var full=content.council_result;
  var expected={hamUid:shape.hamUid,requestId:content.council_proof&&content.council_proof.request_id,
    cycleId:content.council_proof&&content.council_proof.cycle_id,
    question:content.policy_text,deliberationInput:shape.evidenceText,
    answer:content.artifact,deliveryTarget:storedTarget};
  var verified=council.requireVerifiedCouncilResult(full,expected);
  var proof=verified&&verified.ok?council.compactCouncilProof(full):null;
  var expectedRow=decisionRow(shape,content.policy,content.artifact,proof,full,
    content.proposal_provenance,storedTarget,content.policy_authority);
  if(!verified||!verified.ok||!validateCommittedDecision(shape,content.policy,
      content.artifact,full,proof,storedTarget,
      content.policy.channel==='none'?'reach':content.policy.channel)||!sameRow(row,expectedRow)||
      row.content!==JSON.stringify(content))return null;
  var target=await targetForPolicy(input,content.policy);
  if(!target.ok)return{ok:false,pending:true,historicalVerified:true,source:row.source,
    policy:content.policy,reason:target.reason||'reach_delivery_target_unavailable'};
  if(stableStringify(target.deliveryTarget)!==stableStringify(storedTarget)){
    return{ok:false,stale:true,historicalVerified:true,source:row.source,
      policy:content.policy,reason:'reach_delivery_target_changed'};
  }
  return{ok:true,reused:true,source:row.source,policy:content.policy,
    decision:{reach:content.policy.reach,when:content.policy.when,
      recheck_at:content.policy.recheck_at,channel:content.policy.channel,
      importance:content.policy.importance,reason:content.policy.reason,
      message:content.policy.when==='NOW'?content.artifact:''},
    artifact:content.artifact,artifactDigest:content.artifact_digest,
    councilProof:proof,councilResult:full,deliveryOwnership:target,
    evidenceDigest:shape.evidenceDigest,factsDigest:shape.factsDigest};
}

async function persist(shape,row,input){
  var response=await fetch(_bu().replace(/\/$/,'')+'/rest/v1/'+_tbl(),{
    method:'POST',headers:headers(true),body:JSON.stringify(row)}).catch(function(){return null;});
  var represented=response&&response.ok?await response.json().catch(function(){return null;}):null;
  var rows=await readDecisionRows(shape);
  if(!rows.ok)return rows;
  if(rows.rows.length!==1)return{ok:false,reason:'reach_cycle_decision_readback_ambiguous'};
  var result=await hydrate(shape,rows.rows[0],input);
  if(!result)return{ok:false,reason:'reach_cycle_decision_readback_mismatch'};
  result.reused=false;result.recovered=!(Array.isArray(represented)&&represented.length===1&&
    sameRow(represented[0],row));return result;
}

async function decide(input){
  if(!_bu()||!_bk())return{ok:false,reason:'no_brain'};
  try{await require('../claim_lock.js').ensureReachQueueUniqueness({url:_bu(),key:_bk(),
    schema:_schema(),table:_tbl()});}
  catch(eIndex){return{ok:false,reason:'reach_cycle_decision_uniqueness_unverified'};}
  var nowMs=Number.isFinite(input&&input.nowMs)?input.nowMs:Date.now();
  var shape=evidenceShape(input);
  if(!shape)return{ok:false,reason:'reach_cycle_evidence_invalid'};
  var rows=await readDecisionRows(shape);
  if(!rows.ok)return rows;
  if(rows.rows.length>1)return{ok:false,reason:'reach_cycle_decision_ambiguous'};
  if(rows.rows.length===1){
    var existing=await hydrate(shape,rows.rows[0],input);
    if(!existing)return{ok:false,reason:'reach_cycle_decision_readback_mismatch'};
    if(existing.ok===false&&!existing.stale)return existing;
    if(existing.ok===true&&
        (existing.policy.when!=='DEFER'||Date.parse(existing.policy.recheck_at)>nowMs))return existing;
    var recheckReason=existing.stale?':target_changed':':defer_due';
    var recheckInput=Object.assign({},input,{recheckOf:existing.source+recheckReason});
    // The initial decision is bounded to the originating cycle's committed
    // timestamp. A due DEFER (or changed target) is a new decision and must see
    // a fresh exact-HAM fact snapshot rather than replay those stale bytes.
    if(typeof input.refreshFacts==='function'){
      try{recheckInput.facts=await input.refreshFacts();}
      catch(eRefresh){return{ok:false,pending:true,reason:eRefresh.message||
        'reach_fact_read_failed:recheck'};}
      if(!Array.isArray(recheckInput.facts))return{ok:false,pending:true,
        reason:'reach_fact_read_invalid:recheck'};
    }
    if(typeof input.refreshChannelAvailability==='function'){
      try{recheckInput.channelAvailability=await input.refreshChannelAvailability();}
      catch(eChannels){return{ok:false,pending:true,
        reason:eChannels.message||'reach_channel_availability_failed:recheck'};}
    }
    shape=evidenceShape(recheckInput);
    if(!shape)return{ok:false,reason:'reach_cycle_evidence_invalid'};
    rows=await readDecisionRows(shape);
    if(!rows.ok)return rows;
    if(rows.rows.length===1){var dueExisting=await hydrate(shape,rows.rows[0],input);
      return dueExisting||{ok:false,reason:'reach_cycle_decision_readback_mismatch'};}
    if(rows.rows.length>1)return{ok:false,reason:'reach_cycle_decision_ambiguous'};
  }
  var claimSource='reach_cycle_decision:'+shape.hamUid+':'+shape.evidenceDigest;
  var claimed=await require('../claim_lock.js').claimTask(claimSource,
    claimSource+':'+crypto.randomUUID(),10*60*1000).catch(function(){return false;});
  if(!claimed){
    var raced=await readDecisionRows(shape);
    if(raced.ok&&raced.rows.length===1){var won=await hydrate(shape,raced.rows[0],input);
      if(won)return won;}
    return{ok:false,reason:'reach_cycle_decision_claim_denied'};
  }
  var proposal=await propose(shape,nowMs);
  var policyAuthority=await decidePolicyWithPAI(shape,
    proposal&&proposal.ok?proposal.proposal:null,nowMs,input);
  if(!policyAuthority.ok)return policyAuthority;
  var artifact=artifactForProposal(policyAuthority.decision);
  var policy=policyFromProposal(shape,policyAuthority.decision,artifact);
  if(!validatePolicy(shape,policy))return{ok:false,reason:'reach_policy_pai_policy_invalid'};
  var ownership=await targetForPolicy(input,policy);
  if(!ownership.ok)return ownership;
  var policyText=JSON.stringify(policy);
  var policyDigest=digest(policyText);
  // A process can crash after all nine council rows commit but before the
  // wrapper row does. A fresh attempt ID avoids colliding with that complete
  // historical council while the deterministic evidence/policy wrapper still
  // provides exactly-once readback for the execution decision.
  var attemptDigest=digest(crypto.randomUUID()).slice(0,12);
  var requestId='reach.council.'+shape.evidenceDigest.slice(0,20)+
    policyDigest.slice(0,8)+attemptDigest;
  var cycleId=shape.hamUid+'.reach.'+digest(requestId+':'+policyDigest).slice(0,32);
  var council=require('../pai.outbound.council.js');
  var councilChannel=policy.channel==='none'?'reach':policy.channel;
  var result=await council.runOutboundCouncil({hamUid:shape.hamUid,requestId:requestId,
    cycleId:cycleId,question:policyText,deliberationInput:shape.evidenceText,
    answer:artifact,channel:councilChannel,
    // External delivery must exercise the external council path. Its final
    // answer, including any QUILL revision, becomes the only provider artifact.
    delivery:{external:policy.when==='NOW'&&/^(voice|text|email)$/.test(policy.channel),
      longForm:policy.when==='NOW'&&
        (policy.channel==='email'||policy.channel==='command_center')},
    deliveryTarget:ownership.deliveryTarget,
    context:{mode:'reach_decision',outbound_finalize:true,
      reach_policy:policy,verified_evidence:shape.facts.slice(0,8).map(function(fact){
        return{ham_uid:shape.hamUid,provenance:'memory_bank.exact_ham',source:fact.source,
          stamp_type:fact.stamp_type,summary:fact.summary,evidence:fact.content};})}});
  var expected={hamUid:shape.hamUid,requestId:requestId,cycleId:cycleId,
    question:policyText,deliberationInput:shape.evidenceText,answer:result&&result.answer,
    deliveryTarget:ownership.deliveryTarget};
  var verified=council.requireVerifiedCouncilResult(result,expected);
  var proof=verified&&verified.ok?council.compactCouncilProof(result):null;
  if(!verified||!verified.ok||
      !validateCommittedDecision(shape,policy,result.answer,result,proof,
        ownership.deliveryTarget,councilChannel))
    return{ok:false,reason:verified&&verified.reason||'reach_cycle_decision_council_unverified'};
  var row=decisionRow(shape,policy,result.answer,proof,result,
    proposal&&proposal.ok?proposal:null,ownership.deliveryTarget,policyAuthority);
  return persist(shape,row,input);
}

module.exports={decide,POLICY_VERSION,
  _test:{digest,stableStringify,normalizedProof,proofBindsAnswer,normalizeCandidate,
    normalizeFacts,normalizeChannelAvailability,channelAvailable,evidenceShape,
    parseProposal,proposalPrompt,policyFromProposal,
    artifactForProposal,policyDecisionQuestion,policyDecisionPrompt,validatePolicyAuthority,
    validatePolicy,decisionRow,hydrate,readDecisionRows}};
