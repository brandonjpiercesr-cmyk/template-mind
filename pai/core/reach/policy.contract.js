// ⬡B:core.reach.policy_contract:MODULE:one_strict_reach_policy_shape:20260717⬡
'use strict';

const KEYS = ['action','reach','channel','importance','reason','recheck_at','message'];
const ACTIONS = new Set(['NOW','HOLD','DEFER']);
const CHANNELS = new Set(['voice','text','email','command_center']);
const voiceConversationPolicy = require('../voice.conversation.policy.js');

const JSON_SCHEMA = {
  type:'object',
  additionalProperties:false,
  required:KEYS.slice(),
  properties:{
    action:{type:'string',enum:['NOW','HOLD','DEFER']},
    reach:{type:'boolean'},
    channel:{type:'string',enum:['voice','text','email','command_center','none']},
    importance:{type:'integer',minimum:1,maximum:10},
    reason:{type:'string',minLength:1,maxLength:500},
    recheck_at:{anyOf:[{type:'string'},{type:'null'}]},
    message:{type:'string',maxLength:2000}
  }
};

function responseFormat(){
  return{type:'json_schema',json_schema:{name:'reach_policy',strict:true,
    schema:JSON_SCHEMA}};
}

function validIso(value){
  var ms=typeof value==='string'?Date.parse(value):NaN;
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}

function wholeJsonText(raw){
  if(typeof raw!=='string'||!raw.trim())return null;
  var text=raw.trim();
  var fenced=text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if(fenced)text=fenced[1].trim();
  if(!text||text[0]!=='{'||text[text.length-1]!=='}')return null;
  return text;
}

function parseProposal(raw,nowMs){
  var text=wholeJsonText(raw);
  if(!text)return null;
  var parsed;try{parsed=JSON.parse(text);}catch(e){return null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
      Object.keys(parsed).sort().join(',')!==KEYS.slice().sort().join(','))return null;
  if(typeof parsed.action!=='string'||typeof parsed.channel!=='string'||
      typeof parsed.importance!=='number'||typeof parsed.reach!=='boolean'||
      typeof parsed.reason!=='string'||typeof parsed.message!=='string'||
      !(parsed.recheck_at===null||typeof parsed.recheck_at==='string'))return null;
  var action=parsed.action.trim().toUpperCase();
  var channel=parsed.channel.trim().toLowerCase();
  var reason=typeof parsed.reason==='string'?parsed.reason.trim():'';
  var message=typeof parsed.message==='string'?parsed.message:'';
  var importance=parsed.importance;
  var recheckAt=parsed.recheck_at==null?null:validIso(parsed.recheck_at);
  var now=Number.isFinite(nowMs)?nowMs:Date.now();
  if(!ACTIONS.has(action)||!Number.isInteger(importance)||importance<1||importance>10||!reason||
      reason.length>500||/[\r\n\0]/.test(reason)||message.length>2000||/\0/.test(message))return null;
  if(action==='NOW'){
    if(parsed.reach!==true||!CHANNELS.has(channel)||!message.trim()||recheckAt!==null)return null;
    if(channel==='email'&&!/^Subject: [^\r\n\0]+(?:\r?\n){2}\S[\s\S]*$/.test(message))return null;
    if(channel==='voice'&&
        !voiceConversationPolicy.isAutonomousReachVoicePurposeStatement(message))
      return null;
  }else if(action==='HOLD'){
    if(parsed.reach!==false||channel!=='none'||message!==''||recheckAt!==null)return null;
  }else{
    var recheckMs=recheckAt&&Date.parse(recheckAt);
    if(parsed.reach!==false||channel!=='none'||message!==''||!recheckAt||
        recheckMs<=now||recheckMs>now+48*60*60*1000)return null;
  }
  return{action:action,reach:parsed.reach,channel:channel,importance:importance,
    reason:reason,recheck_at:recheckAt,message:message};
}

function canonicalize(raw,nowMs){
  var proposal=parseProposal(raw,nowMs);
  return proposal?{ok:true,proposal:proposal,text:JSON.stringify(proposal)}:
    {ok:false,reason:'reach_policy_json_invalid'};
}

module.exports={KEYS:KEYS,JSON_SCHEMA:JSON_SCHEMA,responseFormat:responseFormat,
  parseProposal:parseProposal,canonicalize:canonicalize};
