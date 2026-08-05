// ⬡B:core.shadow_decision_dialogue:WONDER:anu_retains_judgment_shadow_gets_a_real_reply:20260804⬡
'use strict';
var crypto = require('node:crypto');

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 1200);
}

function parseObject(value) {
  try {
    var parsed = JSON.parse(text(value, 12000));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function availableDecisionJudgment(value) {
  return !!(value && value.judgment_status === 'AVAILABLE' &&
    typeof value.decision_approved === 'boolean' && text(value.decision_reason, 1200));
}

function councilStages(council) {
  if (!council || typeof council !== 'object') return [];
  if (Array.isArray(council.stages)) return council.stages;
  var committed = council.council_receipt || council.councilReceipt;
  return committed && Array.isArray(committed.stages) ? committed.stages : [];
}

function shadowReceipt(council) {
  var stages = councilStages(council);
  for (var index = stages.length - 1; index >= 0; index--) {
    var stage = stages[index];
    if (!stage || String(stage.stage || '').toUpperCase() !== 'SHADOW') continue;
    var evidence = stage.evidence && typeof stage.evidence === 'object' ? stage.evidence : {};
    var resubmission = evidence.resubmission && evidence.resubmission.evidence &&
      typeof evidence.resubmission.evidence === 'object'
      ? evidence.resubmission.evidence : null;
    var latest = resubmission && resubmission.judgment &&
      typeof resubmission.judgment === 'object' ? resubmission.judgment : null;
    var initial = evidence.initial_decision_judgment &&
      typeof evidence.initial_decision_judgment === 'object'
      ? evidence.initial_decision_judgment
      : (evidence.judgment && typeof evidence.judgment === 'object'
        ? evidence.judgment : null);
    // The generic council healer can rewrite prose, but it cannot choose or execute a
    // different hand. Its retry judgment therefore cannot erase an earlier disagreement
    // about A'NU's hand or no-hand choice. Preserve that counsel for the real A'NU-SHADOW
    // dialogue below the committed council. A retry remains authoritative when the first
    // judgment did not disagree, including when the retry is the first usable judgment.
    var initialDisagreement = availableDecisionJudgment(initial) &&
      initial.decision_approved === false;
    var judgment = initialDisagreement ? initial
      : (availableDecisionJudgment(latest)
        ? latest : (availableDecisionJudgment(initial) ? initial : null));
    if (!judgment || judgment.decision_approved !== false) return null;
    return {
      decision_approved:false,
      reason:text(judgment.decision_reason || judgment.reason, 1200),
      recommended_hand:text(judgment.recommended_hand, 160),
      escalate:judgment.escalate === true,
      stage_reason:text(stage.reason, 240)
    };
  }
  return null;
}

function reconsiderationContext(review, response) {
  return [
    'SHADOW DECISION COUNSEL FOR THIS EXACT REQUEST.',
    'SHADOW independently disagreed with your earlier choice of hand or no hand.',
    'This is counsel, not a command. You retain the decision.',
    'Reason from the whole request, the complete armory, the evidence, authority, and consequences.',
    'Choose any available hand, choose no hand, or explain why the original choice remains right.',
    'Do not classify the request from keywords and do not defer merely because SHADOW disagreed.',
    'SHADOW concern: ' + text(review && review.reason, 1200),
    'SHADOW suggested hand: ' + (text(review && review.recommended_hand, 160) || 'none named'),
    'Your prior reply to SHADOW: ' + text(response && response.reason, 1200)
  ].join('\n');
}

function anuResponse(value) {
  var parsed = parseObject(value && value.content);
  var position = text(parsed && parsed.position, 40).toUpperCase();
  var reason = text(parsed && parsed.reason, 1200);
  if ((position !== 'STAND' && position !== 'RECONSIDER') || !reason) return null;
  return {position:position,reason:reason};
}

async function deliberateAnu(common, deliberate) {
  var system = 'You are A\'NU reconsidering one exact decision after independent SHADOW counsel. '
    + 'You remain the decision maker. Think through the complete request and evidence. '
    + 'Do not obey keywords, categories, or SHADOW by default. Return only JSON with this exact shape: '
    + '{"position":"STAND"|"RECONSIDER","reason":"one evidence-bound explanation"}.';
  var first;
  try {
    first = await deliberate(system, JSON.stringify(common),
      {temperature:0,max_tokens:320,json:true});
  } catch (error) {
    return {error:'anu_decision_dialogue_threw'};
  }
  if (!first || !text(first.content, 2400)) {
    return {error:'anu_decision_dialogue_unavailable'};
  }
  var response = anuResponse(first);
  if (response) return {response:response,transport_repaired:false};

  // A model may complete the reasoning and still miss the two-field wire shape. That is a
  // transport failure, not authority for cold code to choose the hand or convert STAND into
  // RECONSIDER. Give A'NU one bounded chance to state her own decision in the valid shape.
  // The first bytes are included as evidence, never interpreted or rewritten here.
  var repairSystem = 'You are A\'NU. Your prior reply could not be read because it did not match '
    + 'the required two-field JSON wire shape. Preserve your own judgment or reason again. '
    + 'Do not follow SHADOW by default and do not let this transport repair choose for you. '
    + 'Return exactly one JSON object and nothing else: '
    + '{"position":"STAND"|"RECONSIDER","reason":"one evidence-bound explanation"}.';
  var repaired;
  try {
    repaired = await deliberate(repairSystem, JSON.stringify({case:common,
      prior_unreadable_reply:text(first && first.content, 2400) || null}),
    {temperature:0,max_tokens:320,json:true});
  } catch (repairError) {
    return {error:'anu_decision_dialogue_repair_threw'};
  }
  if (!repaired || !text(repaired.content, 2400)) {
    return {error:'anu_decision_dialogue_repair_unavailable'};
  }
  response = anuResponse(repaired);
  return response ? {response:response,transport_repaired:true} : null;
}

async function run(input, options) {
  input = input || {};
  options = options || {};
  var review = input.review;
  if (!review || review.decision_approved !== false) {
    return {ok:true,outcome:'PROCEED',dialogue:false};
  }
  if (typeof options.deliberate !== 'function') {
    return {ok:false,outcome:'ESCALATE',reason:'anu_decision_dialogue_unavailable'};
  }
  var common = {
    binding:{ham_uid:text(input.hamUid,160),request_id:text(input.requestId,180),
      cycle_id:text(input.cycleId,180)},
    request:text(input.request,8000),
    proposed_answer:text(input.answer,12000),
    available_hands:Array.isArray(input.availableHands) ? input.availableHands.slice(0,80) : [],
    hands_chosen:Array.isArray(input.handsChosen) ? input.handsChosen.slice(0,80) : [],
    pending_effects:Array.isArray(input.pendingEffects) ? input.pendingEffects.slice(0,40) : [],
    verified_evidence:Array.isArray(input.verifiedEvidence) ? input.verifiedEvidence.slice(0,80) : [],
    shadow_review:review
  };
  var anuDeliberation = await deliberateAnu(common, options.deliberate);
  if (!anuDeliberation || anuDeliberation.error) {
    return {ok:false,outcome:'ESCALATE',reason:anuDeliberation && anuDeliberation.error
      || 'anu_decision_dialogue_invalid'};
  }
  var response = anuDeliberation.response;
  if (response.position === 'RECONSIDER') {
    return {ok:true,outcome:'RECONSIDER',dialogue:true,response:response,
      transport_repaired:anuDeliberation.transport_repaired,
      context:reconsiderationContext(review,response)};
  }
  var shadowJudgment;
  try {
    shadowJudgment = await options.deliberate(
      'You are SHADOW completing an evidence-bound conversation with A\'NU. '
      + 'A\'NU owns the decision. Decide whether her explanation resolves your concern. '
      + 'Do not classify from keywords. Recommend escalation only when a consequential disagreement remains. '
      + 'Return only JSON with this exact shape: '
      + '{"satisfied":true|false,"reason":"one concise explanation","escalate":true|false}.',
      JSON.stringify({case:common,anu_response:response}),
      {temperature:0,max_tokens:240,json:true});
  } catch (error) {
    return {ok:false,outcome:'ESCALATE',dialogue:true,response:response,
      reason:'shadow_decision_reply_threw'};
  }
  var shadow = parseObject(shadowJudgment && shadowJudgment.content);
  if (!shadow || typeof shadow.satisfied !== 'boolean' || !text(shadow.reason,1200)) {
    return {ok:false,outcome:'ESCALATE',dialogue:true,response:response,
      reason:'shadow_decision_reply_invalid'};
  }
  if (shadow.satisfied === true) {
    return {ok:true,outcome:'PROCEED',dialogue:true,response:response,
      transport_repaired:anuDeliberation.transport_repaired,
      shadow:{satisfied:true,reason:text(shadow.reason,1200),escalate:false}};
  }
  return {ok:false,outcome:'ESCALATE',dialogue:true,response:response,
    transport_repaired:anuDeliberation.transport_repaired,
    shadow:{satisfied:false,reason:text(shadow.reason,1200),escalate:true},
    reason:'shadow_decision_disagreement_unresolved'};
}

async function escalate(input, options) {
  input = input || {};
  options = options || {};
  var hamUid = text(input.hamUid,160).toUpperCase();
  var requestId = text(input.requestId,180);
  var cycleId = text(input.cycleId,180);
  if (!hamUid || !requestId || !cycleId) {
    return {ok:false,reason:'shadow_decision_escalation_binding_required'};
  }
  var brain = options.brain || require('./brain.client.js');
  var suffix = crypto.createHash('sha256').update(hamUid+'\n'+requestId+'\n'+cycleId,'utf8')
    .digest('hex');
  var source = 'ANU.'+hamUid+'.shadow_decision.'+suffix;
  var reviewUnavailable = text(input.reason,1200) === 'shadow_decision_judgment_unavailable';
  var content = {schema:'anew.shadow.decision.escalation.v1',ham_uid:hamUid,
    request_id:requestId,cycle_id:cycleId,
    reason:text(input.reason,1200),recommended_hand:text(input.recommendedHand,160)||null,
    review_status:reviewUnavailable?'UNAVAILABLE':'DISAGREEMENT',
    pending_effects_committed:false,superior_node_id:'guardian.clair'};
  try {
    await brain.writeBead({hamUid:hamUid,agentGlobal:'CLAIR',source:source,
      type:'GAP_FLAGS',summary:reviewUnavailable
        ? 'SHADOW review was unavailable. No pending effect ran.'
        : 'A\'NU and SHADOW still disagree. No pending effect ran.',
      content:content,importance:9,edges:[
        {type:'CAUSED_BY',target:'pai.cycle.'+cycleId},
        {type:'PRODUCED_BY',target:'guardian.clair'},
        {type:'RELATES_TO',target:'pai.request.'+requestId}]});
    var row = await brain.findBySource(source,hamUid);
    var stored = row && row.content;
    if (typeof stored === 'string') {
      try { stored=JSON.parse(stored); } catch (error) { stored=null; }
    }
    if (!row || String(row.ham_uid||'').toUpperCase() !== hamUid ||
        String(row.source||'') !== source || String(row.stamp_type||'') !== 'GAP_FLAGS' ||
        !stored || stored.schema !== content.schema || stored.request_id !== requestId ||
        stored.cycle_id !== cycleId || stored.pending_effects_committed !== false ||
        stored.review_status !== content.review_status ||
        stored.superior_node_id !== 'guardian.clair') {
      return {ok:false,reason:'shadow_decision_escalation_readback_unverified'};
    }
    return {ok:true,source:source,superior_node_id:'guardian.clair'};
  } catch (error) {
    return {ok:false,reason:'shadow_decision_escalation_unavailable'};
  }
}

module.exports = {run:run,escalate:escalate,shadowReceipt:shadowReceipt,
  reconsiderationContext:reconsiderationContext,_test:{parseObject:parseObject,
    availableDecisionJudgment:availableDecisionJudgment,councilStages:councilStages,
    anuResponse:anuResponse,deliberateAnu:deliberateAnu}};
