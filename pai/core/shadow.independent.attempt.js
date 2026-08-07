// ⬡B:core.shadow_independent_attempt:WONDER:shadow_plans_the_same_assignment_before_it_judges_hers:20260807⬡
// FOUNDER DOCTRINE, "I want the MEDAL doctrine pt 2": "Shadow got the exact same assignment."
// "First, you need to put together your plan of what you would do. Plan out what you would do,
// how you would do it, what agents you would use. This is how you roll point. Only difference is
// you're not allowed to touch anything. Once you're done, you can then go and monitor and watch,
// and see if she did it better or worse than you."
//
// A reviewer that reads her answer first is anchored on it. It can catch a wrong fact inside what
// she wrote and it cannot catch what she never thought of. This organ makes the independent
// attempt that produces the counterfactual. Cold code here validates identity, authority,
// argument shape, ordering and receipts. The LLM decides the plan and the verdict. Cold code
// never scores her work and never converts a gap into a hold.
'use strict';

const crypto = require('node:crypto');
const normalizeHamUid = require('./ham.uid.validator.js').normalizeHamUid;

const ATTEMPT_SCHEMA = 'anew.shadow-independent-attempt.v1';
const ATTEMPT_INVALID_SCHEMA = 'anew.shadow-independent-attempt-invalid.v1';
const COMPARISON_SCHEMA = 'anew.shadow-independent-comparison.v1';
const ATTEMPT_TYPE = 'SHADOW_INDEPENDENT_ATTEMPT';
const ATTEMPT_INVALID_TYPE = 'SHADOW_INDEPENDENT_ATTEMPT_INVALID';
const COMPARISON_TYPE = 'SHADOW_INDEPENDENT_COMPARISON';
const VERDICTS = new Set(['HERS_BETTER','SHADOW_BETTER','EQUIVALENT']);
// Every field a caller could use to smuggle her finished work into the blind attempt.
const ANCHOR_FIELDS = Object.freeze(['primary_answer','primary_plan','primary_output',
  'primary_result','final_human_output','writ_output','post_meta_candidate','pre_writ_draft',
  'her_answer','her_plan','her_output','answer']);
const DEFAULT_SEAT = 'deliberation';

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable(value[key]);
  }).join(',') + '}';
}

function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function clean(value, limit) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit || 1200);
}

function parse(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  var text = String(value || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  try {
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function transport(value) {
  if (value && value.content != null) return value.content;
  if (value && value.text != null) return value.text;
  if (value && value.answer != null) return value.answer;
  return value && value.choices && value.choices[0] && value.choices[0].message
    ? value.choices[0].message.content : null;
}

function binding(input) {
  var ham = normalizeHamUid(String(input && input.ham_uid || '').trim());
  var request = clean(input && input.request_id, 180);
  var cycle = clean(input && input.cycle_id, 220);
  if (!ham || !/^[A-Za-z0-9._:-]{8,180}$/.test(request) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(cycle)) return null;
  return {ham_uid:ham,request_id:request,cycle_id:cycle};
}

function exactText(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return {text:value,digest:digest(value),bytes:Buffer.byteLength(value,'utf8')};
}

function receiptText(value) {
  return {digest:value.digest,bytes:value.bytes};
}

// FOUNDER: "you're not allowed to touch anything." The blind packet is the ONLY packet the
// attempt accepts. If her work rides along in any shape, this is not an independent attempt and
// cold code refuses it rather than pretending.
function anchorLeak(input) {
  if (!input || typeof input !== 'object') return null;
  for (var index = 0; index < ANCHOR_FIELDS.length; index++) {
    var field = ANCHOR_FIELDS[index];
    var carried = input[field];
    if (carried == null) continue;
    if (typeof carried === 'string' && !carried.trim()) continue;
    if (Array.isArray(carried) && carried.length === 0) continue;
    return field;
  }
  return null;
}

function stringList(value, limit, itemLimit) {
  if (!Array.isArray(value)) return null;
  var out = [];
  for (var index = 0; index < value.length && out.length < (limit || 12); index++) {
    var item = clean(value[index], itemLimit || 400);
    if (item) out.push(item);
  }
  return out;
}

function completionTruth(value) {
  var choice = value && value.choices && value.choices[0];
  if (!choice) return {complete:true,finish_reason:null,native_finish_reason:null};
  var finish = clean(choice.finish_reason, 80).toLowerCase() || null;
  var native = clean(choice.native_finish_reason, 80).toLowerCase() || null;
  var finishComplete = finish === null || finish === 'stop';
  var nativeComplete = native === null || ['stop','eos','eos_token'].includes(native);
  return {complete:finishComplete && nativeComplete,finish_reason:finish,
    native_finish_reason:native};
}

function opaqueTransportReceipt(value) {
  var carried = transport(value);
  if (carried == null) return {digest:null,bytes:0};
  var represented = typeof carried === 'string' ? carried : stable(carried);
  return {digest:digest(represented),bytes:Buffer.byteLength(represented,'utf8')};
}

// Cold shape validation only. Whether the plan is any GOOD is never cold code's call.
function plan(value) {
  var parsed = parse(transport(value));
  var approach = clean(parsed && parsed.approach, 1200);
  var steps = stringList(parsed && parsed.plan, 12, 400);
  var agents = stringList(parsed && parsed.agents, 12, 160);
  var risks = stringList(parsed && parsed.risks, 12, 400);
  var doneWhen = clean(parsed && parsed.done_when, 600);
  if (!approach || !steps || steps.length === 0 || !agents || !risks || !doneWhen) return null;
  return {approach:approach,plan:steps,agents:agents,risks:risks,done_when:doneWhen,
    model:clean(value && value.model,160)||null,
    via:clean(value && (value.via || value.provider),160)||null};
}

function comparison(value) {
  var parsed = parse(transport(value));
  var verdict = clean(parsed && parsed.verdict, 24).toUpperCase();
  var reason = clean(parsed && parsed.reason, 1200);
  var missedByPrimary = stringList(parsed && parsed.missed_by_primary, 12, 400);
  var missedByShadow = stringList(parsed && parsed.missed_by_shadow, 12, 400);
  if (!VERDICTS.has(verdict) || !reason || !missedByPrimary || !missedByShadow) return null;
  return {verdict:verdict,reason:reason,missed_by_primary:missedByPrimary,
    missed_by_shadow:missedByShadow,
    model:clean(value && value.model,160)||null,
    via:clean(value && (value.via || value.provider),160)||null};
}

function rowField(row, snake, camel) {
  return row && row[snake] != null ? row[snake] : row && row[camel];
}

async function bank(spec, options) {
  var brain = options.brain || require('./brain.client.js');
  var content = spec.content;
  content.receipt_digest = digest(content);
  var source = spec.prefix + '.' + spec.binding.ham_uid.toLowerCase() + '.' +
    content.receipt_digest;
  var writeUncertain = false;
  try {
    await brain.writeBead({hamUid:spec.binding.ham_uid,agentGlobal:'SHADOW',source:source,
      type:spec.type,content:content,summary:spec.summary,importance:8,edges:content.edges});
  } catch (error) {
    writeUncertain = true;
  }
  try {
    var row = await brain.findBySource(source,spec.binding.ham_uid);
    var read = parse(row && row.content);
    if (!row || row.source !== source ||
        String(rowField(row,'ham_uid','hamUid') || '').toUpperCase() !== spec.binding.ham_uid ||
        String(rowField(row,'agent_global','agentGlobal') || '').toUpperCase() !== 'SHADOW' ||
        String(rowField(row,'stamp_type','type') || '') !== spec.type ||
        stable(read) !== stable(content)) {
      return {ok:false,reason:spec.prefix.replace(/\./g,'_') + '_readback_mismatch'};
    }
    return {ok:true,source:source,digest:content.receipt_digest,content:content,
      recovered_after_write_uncertainty:writeUncertain};
  } catch (error) {
    return {ok:false,reason:spec.prefix.replace(/\./g,'_') + '_unverified'};
  }
}

function edgesFor(bound, extra) {
  var edges = [
    {type:'ABOUT',target:'pai.cycle.' + bound.cycle_id},
    {type:'PRODUCED_BY',target:'agent.shadow'}
  ];
  return edges.concat(extra || []);
}

var ATTEMPT_SYSTEM = 'You are SHADOW. You received the EXACT SAME assignment as the primary '
  + 'intelligence, at the same time, and you are answering it independently. You have NOT seen '
  + 'her answer and you will not ask for it. First, put together your own plan of what YOU would '
  + 'do: what you would do, how you would do it, and what agents you would use. This is how you '
  + 'roll point. The only difference is you are not allowed to touch anything: you plan, you '
  + 'never execute, you never mutate, you never speak to the person. Answer the assignment on '
  + 'its own terms. Do not describe how you would review or grade someone else, and do not '
  + 'mention the primary at all. Return strict JSON only: {"approach":"one paragraph on the '
  + 'shape of your answer","plan":["ordered concrete steps"],"agents":["the named agents or '
  + 'tools you would use, or NONE"],"risks":["what could go wrong or be missed"],'
  + '"done_when":"the observable condition that proves the assignment is finished"}. '
  + 'Never address the person.';

var COMPARISON_SYSTEM = 'You are SHADOW. You already produced your OWN independent plan for this '
  + 'exact assignment, sealed before you saw anything of hers. Now go and monitor and watch: '
  + 'compare what the primary actually produced against your own sealed plan and say whether she '
  + 'did it better or worse than you. The most valuable thing you can report is what she never '
  + 'thought of: anything real in your plan that has no counterpart in her work belongs in '
  + 'missed_by_primary. Be equally honest about what she covered that you missed. You are not '
  + 'allowed to touch anything, rewrite her, or speak to the person; you report. Return strict '
  + 'JSON only: {"verdict":"HERS_BETTER|SHADOW_BETTER|EQUIVALENT","missed_by_primary":['
  + '"concrete items she never addressed, empty if none"],"missed_by_shadow":["concrete items '
  + 'she covered that your plan missed, empty if none"],"reason":"one concrete explanation"}. '
  + 'Never address the person.';

async function attempt(input, options) {
  var opts = options || {};
  var bound = binding(input);
  if (!bound) return {ok:false,reason:'shadow_attempt_binding_invalid'};
  var leaked = anchorLeak(input);
  if (leaked) return {ok:false,reason:'shadow_attempt_would_be_anchored',anchored_on:leaked};
  var assignment = exactText(input && input.assignment);
  if (!assignment) return {ok:false,reason:'shadow_attempt_assignment_invalid'};
  var seat = clean(opts.seat, 60) || DEFAULT_SEAT;

  var raw;
  try {
    var chatSeat = opts.chatSeat || require('./model.router.js').chatSeat;
    raw = await chatSeat(seat,[
      {role:'system',content:ATTEMPT_SYSTEM},
      {role:'user',content:JSON.stringify({binding:bound,assignment:assignment.text})}
    ],{temperature:0,maxTokens:900,requireParameters:true,
      attribution:{component:'shadow.independent.attempt',ham_uid:bound.ham_uid,
        request_id:bound.request_id + '.shadow-independent-attempt',cycle_id:bound.cycle_id,
        seat:seat,owner_node_id:'agent.shadow',target_wonder_id:'agent.shadow'}});
  } catch (error) {
    return {ok:false,reason:'shadow_attempt_unavailable'};
  }

  var completion = completionTruth(raw);
  var drafted = completion.complete ? plan(raw) : null;
  if (!drafted) {
    var invalidReason = completion.complete ? 'shadow_attempt_invalid_plan'
      : 'shadow_attempt_incomplete_plan';
    var carried = opaqueTransportReceipt(raw);
    var invalidEdges = edgesFor(bound, []);
    var invalid = await bank({binding:bound,type:ATTEMPT_INVALID_TYPE,
      prefix:'shadow.independent.attempt.invalid',
      summary:'SHADOW returned no usable independent plan.',
      content:{schema:ATTEMPT_INVALID_SCHEMA,binding:bound,shadow_node_id:'agent.shadow',
        assignment:receiptText(assignment),assignment_digest:assignment.digest,
        invalid_reason:invalidReason,finish_reason:completion.finish_reason,
        native_finish_reason:completion.native_finish_reason,
        transport_digest:carried.digest,transport_bytes:carried.bytes,
        seat:seat,model:clean(raw && raw.model,160)||null,
        via:clean(raw && (raw.via || raw.provider),160)||null,
        plan_valid:false,mutation_executed:false,authority:'OBSERVE_ONLY',
        edges:invalidEdges}},opts);
    if (!invalid.ok) return {ok:false,reason:invalid.reason};
    return {ok:false,reason:invalidReason,attempt:invalid};
  }

  var edges = edgesFor(bound, []);
  var receipt = await bank({binding:bound,type:ATTEMPT_TYPE,
    prefix:'shadow.independent.attempt',
    summary:'SHADOW produced its own plan for the same assignment before judging hers.',
    content:{schema:ATTEMPT_SCHEMA,binding:bound,shadow_node_id:'agent.shadow',
      assignment:receiptText(assignment),assignment_digest:assignment.digest,
      approach:drafted.approach,plan:drafted.plan,agents:drafted.agents,risks:drafted.risks,
      done_when:drafted.done_when,seat:seat,model:drafted.model,via:drafted.via,
      plan_valid:true,mutation_executed:false,authority:'OBSERVE_ONLY',
      edges:edges}},opts);
  if (!receipt.ok) return {ok:false,reason:receipt.reason};
  return {ok:true,reason:'shadow_attempt_sealed',assignment_digest:assignment.digest,
    seal:{source:receipt.source,digest:receipt.digest,assignment_digest:assignment.digest,
      binding:bound,approach:drafted.approach,plan:drafted.plan,agents:drafted.agents,
      risks:drafted.risks,done_when:drafted.done_when},
    receipt:receipt};
}

// FOUNDER: "Once you're done, you can then go and monitor and watch." Cold code holds the
// ordering, nothing else. No sealed attempt means SHADOW never attempted, so there is nothing
// independent to compare against and this refuses instead of degrading into the anchored
// reviewer it was built to replace.
function sealOf(value) {
  var seal = value && value.seal && typeof value.seal === 'object' ? value.seal
    : (value && typeof value === 'object' ? value : null);
  if (!seal) return null;
  var bound = binding(seal.binding);
  var assignmentDigest = clean(seal.assignment_digest, 80);
  var steps = stringList(seal.plan, 12, 400);
  if (!bound || !/^[a-f0-9]{64}$/.test(assignmentDigest) || !steps || steps.length === 0) {
    return null;
  }
  return {binding:bound,assignment_digest:assignmentDigest,
    source:clean(seal.source, 300) || null,digest:clean(seal.digest, 80) || null,
    approach:clean(seal.approach, 1200),plan:steps,
    agents:stringList(seal.agents, 12, 160) || [],
    risks:stringList(seal.risks, 12, 400) || [],
    done_when:clean(seal.done_when, 600)};
}

function sameBinding(left, right) {
  return left.ham_uid === right.ham_uid && left.request_id === right.request_id &&
    left.cycle_id === right.cycle_id;
}

async function compare(input, options) {
  var opts = options || {};
  var bound = binding(input);
  if (!bound) return {ok:false,reason:'shadow_comparison_binding_invalid'};
  var seal = sealOf(input && input.attempt);
  if (!seal) return {ok:false,reason:'shadow_comparison_unanchored'};
  if (!sameBinding(seal.binding, bound)) {
    return {ok:false,reason:'shadow_comparison_binding_mismatch'};
  }
  var assignment = exactText(input && input.assignment);
  if (!assignment) return {ok:false,reason:'shadow_comparison_assignment_invalid'};
  if (assignment.digest !== seal.assignment_digest) {
    return {ok:false,reason:'shadow_comparison_assignment_mismatch'};
  }
  var hers = exactText(input && input.primary_output);
  if (!hers) return {ok:false,reason:'shadow_comparison_primary_output_invalid'};
  var seat = clean(opts.seat, 60) || DEFAULT_SEAT;

  var raw;
  try {
    var chatSeat = opts.chatSeat || require('./model.router.js').chatSeat;
    raw = await chatSeat(seat,[
      {role:'system',content:COMPARISON_SYSTEM},
      {role:'user',content:JSON.stringify({binding:bound,assignment:assignment.text,
        shadow_own_plan:{approach:seal.approach,plan:seal.plan,agents:seal.agents,
          risks:seal.risks,done_when:seal.done_when},
        primary_output:hers.text})}
    ],{temperature:0,maxTokens:900,requireParameters:true,
      attribution:{component:'shadow.independent.compare',ham_uid:bound.ham_uid,
        request_id:bound.request_id + '.shadow-independent-compare',cycle_id:bound.cycle_id,
        seat:seat,owner_node_id:'agent.shadow',target_wonder_id:'agent.shadow'}});
  } catch (error) {
    return {ok:false,reason:'shadow_comparison_unavailable'};
  }

  var completion = completionTruth(raw);
  var judged = completion.complete ? comparison(raw) : null;
  if (!judged) {
    return {ok:false,reason:completion.complete ? 'shadow_comparison_invalid_verdict'
      : 'shadow_comparison_incomplete_verdict'};
  }

  var edges = edgesFor(bound, [{type:'RELATES_TO',target:'agent.shadow.independent_attempt'}]);
  var receipt = await bank({binding:bound,type:COMPARISON_TYPE,
    prefix:'shadow.independent.comparison',
    summary:'SHADOW compared her work against its own sealed plan.',
    content:{schema:COMPARISON_SCHEMA,binding:bound,shadow_node_id:'agent.shadow',
      assignment_digest:assignment.digest,attempt_source:seal.source,
      attempt_digest:seal.digest,primary_output:receiptText(hers),
      verdict:judged.verdict,missed_by_primary:judged.missed_by_primary,
      missed_by_shadow:judged.missed_by_shadow,reason_digest:digest(judged.reason),
      reason_bytes:Buffer.byteLength(judged.reason,'utf8'),
      seat:seat,model:judged.model,via:judged.via,
      mutation_executed:false,authority:'OBSERVE_ONLY',edges:edges}},opts);
  if (!receipt.ok) return {ok:false,reason:receipt.reason};
  // Evidence, never a hold. What to DO about a gap is A'NU's cycle, never this organ.
  return {ok:true,reason:'shadow_comparison_recorded',verdict:judged.verdict,
    missed_by_primary:judged.missed_by_primary,missed_by_shadow:judged.missed_by_shadow,
    mutation_executed:false,authority:'OBSERVE_ONLY',receipt:receipt};
}

module.exports = {ATTEMPT_SCHEMA:ATTEMPT_SCHEMA,
  ATTEMPT_INVALID_SCHEMA:ATTEMPT_INVALID_SCHEMA,COMPARISON_SCHEMA:COMPARISON_SCHEMA,
  ATTEMPT_TYPE:ATTEMPT_TYPE,ATTEMPT_INVALID_TYPE:ATTEMPT_INVALID_TYPE,
  COMPARISON_TYPE:COMPARISON_TYPE,VERDICTS:VERDICTS,ANCHOR_FIELDS:ANCHOR_FIELDS,
  attempt:attempt,compare:compare,
  _test:{stable:stable,digest:digest,parse:parse,binding:binding,exactText:exactText,
    anchorLeak:anchorLeak,plan:plan,comparison:comparison,sealOf:sealOf,
    completionTruth:completionTruth,opaqueTransportReceipt:opaqueTransportReceipt,
    stringList:stringList,bank:bank,ATTEMPT_SYSTEM:ATTEMPT_SYSTEM,
    COMPARISON_SYSTEM:COMPARISON_SYSTEM}};
