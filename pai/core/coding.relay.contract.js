// ⬡B:core.coding_relay_contract:WONDER:one_role_contract_across_bcw_coda_shadow:20260715⬡
// One canonical coding-relay contract. BCW arms it, CODA must satisfy it before
// persisting a decision, and SHADOW uses its conflict detector at the final
// outbound gate. This is wired evidence/validation, not an answer template.
'use strict';

var CONTRACT = Object.freeze({
  lead: 'CODA',
  sequencer: 'SPAN',
  builder: 'CANEW',
  grader: 'CANON',
  repair: 'INTERNAL_CLAIR'
});

function line() {
  return 'CODA is the coding lead. SPAN owns sequencing. CANEW builds through the existing drain. ' +
    'CANON grades. INTERNAL CLAIR diagnoses a failed gate and amends the next bounded retry. ' +
    'A’NU and outside CATHY relay evidence, decisions, failures, and receipts; ' +
    'they do not invent a parallel build path.';
}

function leadConflicts(value) {
  var text = String(value || '').replace(/[\u2018\u2019]/g, "'");
  var clauses = text.split(/[.!?\n;]+/).map(function (clause) {
    return String(clause || '').trim();
  }).filter(Boolean);
  function clairClaimedAsLead(clause) {
    // Remove only explicit negated lead phrases, not the whole clause. A mixed
    // clause such as "CLAIR is lead and INTERNAL CLAIR is not" must still flag.
    var affirmative = String(clause)
      .replace(/\b(?:does?|did)\s+not\s+lead\b/gi, ' ')
      .replace(/\b(?:is|are|was|were)\s+not\s+(?:the\s+)?(?:coding\s+)?lead\b/gi, ' ');
    return /\b(?:INTERNAL[_\s-]+)?CLAIR\b[^.!?\n]{0,60}\b(?:is|serves\s+as|acts\s+as|remains)\b[^.!?\n]{0,40}\b(?:coding\s+)?lead\b/i.test(affirmative) ||
      /\b(?:coding\s+)?lead\s*(?:is|:|=)\s*(?:INTERNAL[_\s-]+)?CLAIR\b/i.test(affirmative) ||
      /\b(?:INTERNAL[_\s-]+)?CLAIR\b[^.!?\n]{0,35}\bleads?\b[^.!?\n]{0,35}\b(?:coding|relay|department|build)\b/i.test(affirmative);
  }
  function codaDeniedAsLead(clause) {
    return /\bCODA\b[^.!?\n]{0,45}\b(?:is|does|serves|acts)\s+not\b[^.!?\n]{0,30}\b(?:coding\s+)?lead\b/i.test(clause) ||
      /\b(?:coding\s+)?lead\b[^.!?\n]{0,30}\b(?:is|=|:)\s+not\s+CODA\b/i.test(clause);
  }
  var violations = [];
  if (clauses.some(clairClaimedAsLead)) violations.push('clair_claimed_as_lead');
  if (clauses.some(codaDeniedAsLead)) violations.push('coda_lead_denied');
  return violations;
}

function validateLead(value) {
  var text = String(value || '').replace(/[\u2018\u2019]/g, "'");
  var clauses = text.split(/[.!?\n;]+/).map(function (clause) {
    return String(clause || '').trim();
  }).filter(Boolean);
  function affirmativeCodaLead(clause) {
    return /\bCODA\b[^.!?\n]{0,60}\b(?:is|serves\s+as|acts\s+as|remains)\b[^.!?\n]{0,40}\b(?:coding\s+)?lead\b/i.test(clause) ||
      /\b(?:coding\s+)?lead\s*(?:is|:|=)\s*CODA\b/i.test(clause) ||
      /\bCODA\b[^.!?\n]{0,35}\bleads?\b[^.!?\n]{0,35}\b(?:coding|relay|department|build)\b/i.test(clause);
  }
  function internalClairRepair(clause) {
    return /\bINTERNAL[_\s-]+CLAIR\b[^.!?\n]{0,100}\b(?:repair|repairs|repaired|diagnos|failed|failure|gate)\b/i.test(clause) ||
      /\b(?:repair|repairs|repaired|diagnos|failed|failure|gate)\b[^.!?\n]{0,100}\bINTERNAL[_\s-]+CLAIR\b/i.test(clause);
  }
  var violations = leadConflicts(text);
  if (!clauses.some(affirmativeCodaLead)) violations.push('coda_lead_missing');
  if (!clauses.some(internalClairRepair)) violations.push('internal_clair_repair_missing');
  return { ok:violations.length === 0, violations:violations };
}

function exactContract(value) {
  return !!(value && value.lead === CONTRACT.lead &&
    value.sequencer === CONTRACT.sequencer && value.builder === CONTRACT.builder &&
    value.grader === CONTRACT.grader && value.repair === CONTRACT.repair);
}

// A proven repository read is part of the same relay contract as the role seats:
// neither CODA nor A'NU's outer speaking pass may rewrite that proof as unavailable.
// Keep this detector here so both boundaries enforce the same vocabulary.
function repositoryEvidenceDenied(value) {
  var text = String(value || '').replace(/[\u2018\u2019]/g, "'");
  return /\b(?:i|we)\s+(?:do not|don't|cannot|can't|could not|couldn't)\s+(?:actually\s+)?(?:see|access|inspect|read|verify)\b[^.!?\n]{0,100}\b(?:code|repository|files?|file contents?)\b/i.test(text) ||
    /\b(?:i|we)\s+(?:have not|haven't|had not|hadn't)\s+(?:actually\s+)?(?:seen|accessed|inspected|read|verified)\s+(?:the\s+)?(?:code|repository|files?|contents?)\b/i.test(text) ||
    /\b(?:CODA|i|we)\s+(?:did not|didn't|has not|hasn't|have not|haven't)\s+(?:actually\s+)?(?:pull|retrieve|access|inspect|read|verify)\b[^.!?\n]{0,100}\b(?:code|repository|files?|file contents?)\b/i.test(text) ||
    /\b(?:no|zero)\s+(?:actual\s+)?(?:repository\s+)?(?:evidence records?|file contents?|code evidence|files? inspected)\b/i.test(text) ||
    /\b(?:repository|code|file)\s+evidence\s+(?:is|was)\s+(?:empty|unavailable|missing|not supplied)\b/i.test(text);
}

module.exports = { CONTRACT:CONTRACT, line:line, leadConflicts:leadConflicts,
  validateLead:validateLead, exactContract:exactContract,
  repositoryEvidenceDenied:repositoryEvidenceDenied };
