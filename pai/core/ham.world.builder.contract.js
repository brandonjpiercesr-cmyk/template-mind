'use strict';

// One typed decision contract is shared by the provider boundary, the council pass-through,
// and the durable intake receipt. This keeps a World Builder judgment model-agnostic without
// letting prose, fences, extra fields, or a partially filled human request become authority.
const DISPOSITIONS = new Set(['REST','INVESTIGATE','PROPOSE_HUMAN_DECISION']);
const KEYS = ['disposition','human_decision','next_action','summary'];
const HUMAN_KEYS = ['action','evidence_refs','options','prompt','scope'];
const OPTION_KEYS = ['id','label'];

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,max);
}

function canonicalize(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
    return {ok:false,reason:'ham_world_builder_json_invalid'};
  }
  let parsed;
  try { parsed = JSON.parse(value); } catch (error) {
    return {ok:false,reason:'ham_world_builder_json_invalid'};
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' ||
      Object.keys(parsed).sort().join(',') !== KEYS.join(',')) {
    return {ok:false,reason:'ham_world_builder_json_shape_invalid'};
  }
  if (!DISPOSITIONS.has(parsed.disposition) || typeof parsed.summary !== 'string' ||
      typeof parsed.next_action !== 'string' ||
      !(parsed.human_decision === null ||
        (parsed.human_decision && !Array.isArray(parsed.human_decision) &&
          typeof parsed.human_decision === 'object'))) {
    return {ok:false,reason:'ham_world_builder_json_type_invalid'};
  }
  const summary = clean(parsed.summary,800);
  const nextAction = clean(parsed.next_action,800);
  let humanDecision = null;
  if (parsed.human_decision !== null) {
    const raw = parsed.human_decision;
    if (Object.keys(raw).sort().join(',') !== HUMAN_KEYS.join(',') ||
        typeof raw.prompt !== 'string' || typeof raw.action !== 'string' ||
        typeof raw.scope !== 'string' || !Array.isArray(raw.evidence_refs) ||
        !Array.isArray(raw.options) || raw.evidence_refs.length < 1 ||
        raw.evidence_refs.length > 16 || raw.options.length < 2 || raw.options.length > 5) {
      return {ok:false,reason:'ham_world_builder_human_decision_shape_invalid'};
    }
    const refs = raw.evidence_refs.map(function(ref){return clean(ref,500);});
    const seen = new Set();
    const options = raw.options.map(function(option){
      if (!option || Array.isArray(option) || typeof option !== 'object' ||
          Object.keys(option).sort().join(',') !== OPTION_KEYS.join(',') ||
          typeof option.id !== 'string' || typeof option.label !== 'string') return null;
      const id=clean(option.id,40).toUpperCase();
      const label=clean(option.label,160);
      if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(id) || !label || seen.has(id)) return null;
      seen.add(id);
      return {id:id,label:label};
    });
    humanDecision={prompt:clean(raw.prompt,800),action:clean(raw.action,160),
      scope:clean(raw.scope,500),evidence_refs:refs,options:options};
    if (!humanDecision.prompt || !humanDecision.action || !humanDecision.scope ||
        refs.some(function(ref){return !ref;}) || options.some(function(option){return !option;})) {
      return {ok:false,reason:'ham_world_builder_human_decision_semantics_invalid'};
    }
  }
  if (!summary || !nextAction ||
      (parsed.disposition === 'PROPOSE_HUMAN_DECISION' && !humanDecision) ||
      (parsed.disposition !== 'PROPOSE_HUMAN_DECISION' && humanDecision !== null)) {
    return {ok:false,reason:'ham_world_builder_json_semantics_invalid'};
  }
  const decision = {disposition:parsed.disposition,summary:summary,
    next_action:nextAction,human_decision:humanDecision};
  return {ok:true,decision:decision,text:JSON.stringify(decision)};
}

function responseFormat() {
  return {type:'json_schema',json_schema:{name:'ham_world_builder_decision',strict:true,
    schema:{type:'object',additionalProperties:false,required:KEYS,
      properties:{disposition:{type:'string',enum:Array.from(DISPOSITIONS)},
        summary:{type:'string',minLength:1,maxLength:800},
        next_action:{type:'string',minLength:1,maxLength:800},
        human_decision:{type:['object','null'],additionalProperties:false,
          required:HUMAN_KEYS,properties:{
            prompt:{type:'string',minLength:1,maxLength:800},
            action:{type:'string',minLength:1,maxLength:160},
            scope:{type:'string',minLength:1,maxLength:500},
            evidence_refs:{type:'array',minItems:1,maxItems:16,
              items:{type:'string',minLength:1,maxLength:500}},
            options:{type:'array',minItems:2,maxItems:5,items:{type:'object',
              additionalProperties:false,required:OPTION_KEYS,properties:{
                id:{type:'string',pattern:'^[A-Z][A-Z0-9_]{1,39}$'},
                label:{type:'string',minLength:1,maxLength:160}}}}}}}}}};
}

module.exports = {DISPOSITIONS:DISPOSITIONS,canonicalize:canonicalize,
  responseFormat:responseFormat};
