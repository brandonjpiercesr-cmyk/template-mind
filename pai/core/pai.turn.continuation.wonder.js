// ⬡B:core.pai_turn_continuation_wonder:WONDER:semantic_continuation_belongs_to_minds:20260806⬡
'use strict';

const crypto=require('node:crypto');

const SCHEMA='anew.pai.turn-continuation.v1';
const TYPE='PAI_TURN_CONTINUATION';
const DECISIONS=new Set(['CONTINUE','ANSWER_NOW','WAIT','ESCALATE']);

function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return'['+value.map(stable).join(',')+']';
  return'{'+Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+stable(value[key]);}).join(',')+'}';
}
function digest(value){return crypto.createHash('sha256').update(
  typeof value==='string'?value:stable(value),'utf8').digest('hex');}
function contentDigest(value){
  const represented=value&&String(value.receipt_digest||'').toLowerCase();
  if(!represented)return null;
  const unsigned=Object.assign({},value);delete unsigned.receipt_digest;
  const measured=digest(unsigned);return measured===represented?measured:null;
}

function clean(value,limit){return String(value==null?'':value).replace(/[\u0000-\u001f]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,limit||1200);}
function parse(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  try{const parsed=JSON.parse(String(value||'').replace(/^```(?:json)?\s*|\s*```$/g,''));
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
  }catch(error){return null;}
}
function transport(value){return value&&value.content!=null?value.content:
  value&&value.choices&&value.choices[0]&&value.choices[0].message
    ?value.choices[0].message.content:null;}
function binding(input){
  const ham=clean(input&&input.ham_uid,160).toUpperCase();
  const request=clean(input&&input.request_id,180);
  const cycle=clean(input&&input.cycle_id,220);
  return /^[A-Z0-9._:-]{2,160}$/.test(ham)&&/^[A-Za-z0-9._:-]{8,180}$/.test(request)&&
    /^[A-Za-z0-9._:-]{8,220}$/.test(cycle)?{ham_uid:ham,request_id:request,cycle_id:cycle}:null;
}
function exactFacts(input,bound){
  const facts=input&&input.facts&&typeof input.facts==='object'&&!Array.isArray(input.facts)
    ?JSON.parse(JSON.stringify(input.facts)):{};
  return {binding:bound,signal:clean(input&&input.signal,80),
    changed_evidence_digest:clean(facts.changed_evidence_digest,64)||null,
    changed_evidence:facts.changed_evidence===true,genuine_progress:facts.genuine_progress===true,
    repeated_failure:facts.repeated_failure===true,
    provider_uncertainty:clean(facts.provider_uncertainty,240)||null,
    cost_truth:facts.cost_truth&&typeof facts.cost_truth==='object'?facts.cost_truth:
      {state:'OUTCOME_UNKNOWN'},kill_truth:facts.kill_truth&&typeof facts.kill_truth==='object'
      ?facts.kill_truth:{state:'UNVERIFIED'},
    observations:facts.observations&&typeof facts.observations==='object'?facts.observations:{},
    semantic_authority:false};
}
function ownerVerdict(value){
  const parsedValue=parse(transport(value));
  const decision=clean(parsedValue&&parsedValue.decision,40).toUpperCase();
  const reason=clean(parsedValue&&parsedValue.reason,1200);
  const resume=clean(parsedValue&&parsedValue.resume_condition,800)||null;
  if(!DECISIONS.has(decision)||!reason||decision==='WAIT'&&!resume)return null;
  return{decision:decision,reason:reason,resume_condition:resume};
}
function shadowVerdict(value){
  const parsedValue=parse(transport(value));
  if(!parsedValue||typeof parsedValue.agrees!=='boolean'||!clean(parsedValue.reason,1200))return null;
  return{agrees:parsedValue.agrees,reason:clean(parsedValue.reason,1200),
    escalate:parsedValue.escalate===true};
}
async function callSeat(seat,messages,attribution,options){
  if(typeof options.deliberate==='function')return options.deliberate(seat,messages,{temperature:0,
    maxTokens:360,attribution:attribution});
  return (options.chatSeat||require('./model.router.js').chatSeat)(seat,messages,
    {temperature:0,maxTokens:360,attribution:attribution});
}
async function persist(bound,facts,owner,shadow,decision,options){
  const edges=[{type:'ABOUT',target:'pai.cycle.'+bound.cycle_id},
    {type:'PRODUCED_BY',target:'station.pai'},
    {type:'CHALLENGED_BY',target:'agent.penny_shadow'}];
  const content={schema:SCHEMA,binding:bound,facts:facts,owner_node_id:'station.pai',
    shadow_node_id:'agent.penny_shadow',owner_verdict:owner,shadow_verdict:shadow,
    decision:decision,edges:edges};
  content.receipt_digest=digest(content);
  const source='pai.turn.continuation.'+bound.ham_uid+'.'+content.receipt_digest;
  const store=options.brain||require('./brain.client.js');
  try{
    await store.writeBead({hamUid:bound.ham_uid,agentGlobal:'PAI',source:source,type:TYPE,
      content:content,summary:'A\'NU and PENNY SHADOW judged whether this turn should continue.',
      importance:7,edges:edges});
    const row=await store.findBySource(source,bound.ham_uid);
    const body=parse(row&&row.content);
    if(!row||row.ham_uid!==bound.ham_uid||row.source!==source||row.stamp_type!==TYPE||
        row.agent_global!=='PAI'||contentDigest(body)!==content.receipt_digest||
        stable(body)!==stable(content))return{ok:false,
      reason:'turn_continuation_receipt_readback_mismatch'};
    return{ok:true,source:source,digest:content.receipt_digest};
  }catch(error){return{ok:false,reason:'turn_continuation_receipt_unverified'};}
}
async function judge(input,options){
  const opts=options||{};
  const bound=binding(input);
  if(!bound)return{ok:false,reason:'turn_continuation_binding_invalid'};
  const facts=exactFacts(input,bound);
  if(facts.kill_truth.state!=='CLEAR')return{ok:true,decision:'WAIT',mechanical_hold:true,
    owner:null,shadow:null,receipt:null,reason:'kill_switch_not_clear'};
  const ownerMessages=[{role:'system',content:'You are A\'NU at the PAI continuation seat. Numeric '
    +'counts are observations and never ceilings. Decide from changed evidence, genuine progress, '
    +'repeated identical failure, provider uncertainty, cost truth, kill truth, and the whole purpose. '
    +'Choose CONTINUE, ANSWER_NOW, WAIT, or ESCALATE. WAIT requires resume_condition. Return JSON only.'},
  {role:'user',content:JSON.stringify(facts)}];
  let ownerRaw;
  try{ownerRaw=await callSeat('c1_cellm',ownerMessages,{component:'pai.turn_continuation',
    ham_uid:bound.ham_uid,request_id:bound.request_id+'.continuation',cycle_id:bound.cycle_id,
    seat:'c1_cellm',owner_node_id:'station.pai',target_wonder_id:'station.pai'},opts);}
  catch(error){return{ok:false,reason:'turn_continuation_owner_unavailable'};}
  const owner=ownerVerdict(ownerRaw);
  if(!owner)return{ok:false,reason:'turn_continuation_owner_invalid'};
  const shadowMessages=[{role:'system',content:'You are PENNY SHADOW. Independently challenge A\'NU\'s '
    +'continuation judgment against the exact facts. Counts never decide meaning. Return JSON only '
    +'with agrees, reason, and escalate.'},{role:'user',content:JSON.stringify({facts:facts,
      anu_verdict:owner})}];
  let shadowRaw;
  try{shadowRaw=await callSeat('c1_cellm',shadowMessages,{component:'pai.turn_continuation.shadow',
    ham_uid:bound.ham_uid,request_id:bound.request_id+'.continuation.shadow',cycle_id:bound.cycle_id,
    seat:'c1_cellm',owner_node_id:'agent.penny_shadow',target_wonder_id:'agent.penny_shadow'},opts);}
  catch(error){return{ok:false,reason:'turn_continuation_shadow_unavailable'};}
  const shadow=shadowVerdict(shadowRaw);
  if(!shadow)return{ok:false,reason:'turn_continuation_shadow_invalid'};
  const decision=shadow.agrees===true?owner.decision:'ESCALATE';
  const receipt=await persist(bound,facts,owner,shadow,decision,opts);
  if(!receipt.ok)return{ok:false,reason:receipt.reason,owner:owner,shadow:shadow};
  return{ok:true,decision:decision,owner:owner,shadow:shadow,receipt:receipt,
    reason:shadow.agrees?owner.reason:'turn_continuation_shadow_disagreement'};
}

module.exports={SCHEMA:SCHEMA,TYPE:TYPE,DECISIONS:DECISIONS,judge:judge,
  _test:{parse:parse,binding:binding,exactFacts:exactFacts,ownerVerdict:ownerVerdict,
    shadowVerdict:shadowVerdict,persist:persist,stable:stable,digest:digest,
    contentDigest:contentDigest}};
