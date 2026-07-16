// ⬡B:core.current_turn_proof_guard:MODULE:proof_shaped_draft_grounding:20260715⬡
// Entered through the canonical PAI tool loop. A model drafts before the
// outbound council and STAMP readback exist, but a successful answer cannot be
// released until both verify. This cold guard prevents draft-time blindness
// from becoming a false current-turn failure claim.
'use strict';

var RELEASE_INVARIANT = 'This response can be released only after its PAI council commits and STAMP readback is verified. Any current-turn identifiers must come from the verified council proof returned by the delivery surface.';

function asksForCurrentTurnProof(question) {
  var text = String(question || '');
  var proofSubject = /\b(?:PAI|STAMP|council|readback|proof|contributors?|cycle)\b/i.test(text);
  var currentTurn = /\b(?:this|current)\s+(?:turn|cycle|response|reply|request)\b/i.test(text)
    || /\b(?:on|for)\s+this\s+(?:turn|response|reply|request)\b/i.test(text)
    || /\b(?:did|has)\s+(?:the\s+)?(?:PAI|STAMP|council|cycle|readback)\b/i.test(text);
  return proofSubject && currentTurn;
}

function falseCurrentTurnFailureClaim(question, answer) {
  if (!asksForCurrentTurnProof(question)) return false;
  var text = String(answer || '');
  var subject = '(?:PAI(?:\\s+cycle)?|STAMP(?:\\s+readback)?|council(?:\\s+proof)?|readback|current\\s+(?:turn|cycle)|this\\s+(?:turn|cycle)|contributors?)';
  var negative = '(?:did\\s+not|didn[\u2019\']t|has\\s+not|hasn[\u2019\']t|was\\s+not|wasn[\u2019\']t|is\\s+not|isn[\u2019\']t|cannot|can[\u2019\']t|could\\s+not|couldn[\u2019\']t|do\\s+not|don[\u2019\']t|no)';
  var outcome = '(?:run|ran|complete|completed|finish|finished|commit|committed|verify|verified|read\\s*back|available|attached|result|proof|cycle\\s+id|request\\s+id|have)';
  return new RegExp(subject + '[^.!?\\n]{0,140}\\b' + negative + '\\b[^.!?\\n]{0,100}\\b' + outcome + '\\b', 'i').test(text)
    || new RegExp('\\b' + negative + '\\b[^.!?\\n]{0,100}' + subject + '(?:[^.!?\\n]{0,100}\\b' + outcome + '\\b)?', 'i').test(text);
}

function systemInstruction(question) {
  if (!asksForCurrentTurnProof(question)) return '';
  return '\n\nCURRENT-TURN PROOF INVARIANT: You are drafting before the final council commit and STAMP readback by design. Do not infer that this current turn failed, did not run, or did not complete merely because post-draft proof is not visible while drafting. A response from this path reaches the human only after council commit and STAMP readback verify, and the delivery surface returns that current-turn proof after commit. Never invent a cycle ID, request ID, contributor result, or proof field. Describe the release invariant and use only evidence actually present for any further claim.';
}

function repairDraft(question, answer) {
  var original = String(answer || '');
  if (!falseCurrentTurnFailureClaim(question, original)) {
    return { answer:original, repaired:false };
  }
  return { answer:RELEASE_INVARIANT, repaired:true,
    reason:'draft_time_current_turn_false_negative' };
}

module.exports = {
  RELEASE_INVARIANT:RELEASE_INVARIANT,
  asksForCurrentTurnProof:asksForCurrentTurnProof,
  falseCurrentTurnFailureClaim:falseCurrentTurnFailureClaim,
  systemInstruction:systemInstruction,
  repairDraft:repairDraft
};
