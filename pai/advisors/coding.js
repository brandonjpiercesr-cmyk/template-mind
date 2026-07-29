// ⬡B:advisors.coding:STATION:coding_advisor_promotion:20260709⬡
// THE CODING ADVISOR. Business Plan Doctrine pt1: the coding department's head gets
// promoted to a real advisor, peer to the financial and life advisors -- the MANEW
// role given a chair. It does not write code here (the build engine and drain do
// that); it DELIBERATES over the department: queue health, wiring debt, CANON pass
// rates, the drain's receipts -- and reports like a department head reports.
// entered via the ABAHAM door, serving channel MESSAGES
'use strict';
var crypto = require('crypto');
// ⬡B:advisors.coding:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}

var BU = process.env.AIBE_BRAIN_URL;
var BK = process.env.AIBE_BRAIN_KEY;
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }; }

// ⬡B:advisors.coding:WIRE:canonical_relay_contract_before_decision:20260715⬡
var codingRelay = require('../core/coding.relay.contract.js');
var CODING_RELAY = codingRelay.CONTRACT;
var relayContractLine = codingRelay.line;
var validateLeadRelay = codingRelay.validateLead;
var leadRelayConflicts = codingRelay.leadConflicts;
var repositoryEvidenceDenied = codingRelay.repositoryEvidenceDenied;
// ⬡B:advisors.coding:WIRE:question_bound_bcw_contract_shared_with_shadow:20260715⬡
// CODA and the final SHADOW gate consume the same deterministic BCW selector
// and contradiction detector. A repository miss can limit file claims, but it
// can never erase doctrine already present in the bound live context.
var paiEvidence = require('../core/pai.outbound.council.js');
var extractNamedContextEvidence = paiEvidence.extractNamedContextEvidence;
var namedContextContradictions = paiEvidence.namedContextContradictions;
var currentAssistantPreferenceRequest = paiEvidence.currentAssistantPreferenceRequest;
var directNamedEvidenceRequest = paiEvidence.directNamedEvidenceRequest;
// ⬡B:advisors.coding:WIRE:shared_identity_provenance_contract:20260715⬡
var identityProvenance = require('../core/identity.provenance.js');
var findIdentityEvidence = require('../core/find.js').findIdentityEvidence;

// The model gets one correction opportunity using the original evidence and
// violation codes only. A bad draft is never echoed into the retry prompt and
// never reaches the DECISION writer. Second failure is a hard hold.
function requiresRelayRecital(question) {
  var text = String(question || '');
  if (identityProvenance.requiresProvenanceSplit(text)) return false;
  return isPortfolioAsk(text) ||
    /\b(?:coding\s+(?:lead|relay)|relay\s+(?:law|contract)|who\s+is\s+(?:internal[_\s-]+)?(?:clair|coda)|(?:clair|coda)\s+(?:role|leads?|repairs?|diagnos)|span\s+(?:owns|sequen)|canew\s+build|canon\s+grad)\b/i.test(text);
}

function roadmapActivationRequested(question) {
  return String(question || '').indexOf('ROADMAP_ACTIVATION_SPEC:') >= 0;
}

function roadmapActivationDecision(value) {
  var matches = String(value || '').match(/(?:^|\n)ACTIVATION DECISION:\s*(APPROVE|HOLD)\s*(?:\n|$)/gim) || [];
  if (matches.length !== 1) return null;
  return /APPROVE/i.test(matches[0]) ? 'APPROVE' : 'HOLD';
}

function boundQuestionEvidence(question, bcw) {
  if (!bcw || bcw.ok !== true || !String(bcw.bcw || '').trim()) return [];
  return extractNamedContextEvidence(question,
    String(bcw.bcw) + '\n\n=== BUILDER MESSAGE ===\n' + String(question || ''));
}

// ⬡B:advisors.coding:GUARD:proven_repository_read_cannot_be_denied:20260715⬡
// The exact-path reader returned real numbered lines, but CODA still drafted that
// no file contents were available. Repository proof is a deterministic input fact,
// so a categorical denial of that read is the same class of contradiction as
// denying selected BCW evidence: reject it before DECISION and retry on the same bytes.
function validateLeadDraft(value, options) {
  var opts = options || {};
  var relayViolations = opts.requireRelayRecital === false
    ? leadRelayConflicts(value)
    : validateLeadRelay(value).violations;
  var namedFlags = namedContextContradictions(value, opts.namedEvidence || []);
  var violations = relayViolations.slice();
  if (opts.activationDecisionRequired === true && !roadmapActivationDecision(value)) {
    violations.push('activation_decision_missing_or_ambiguous');
  }
  if (opts.repositoryProved === true && repositoryEvidenceDenied(value)) {
    violations.push('repository_evidence_denied');
  }
  namedFlags.forEach(function (flag) {
    var code = String(flag && flag.reason || 'named_context_evidence_invalid');
    if (violations.indexOf(code) < 0) violations.push(code);
  });
  var provenanceCheck = identityProvenance.validateDraft(value, opts.provenanceLedger);
  provenanceCheck.violations.forEach(function (code) {
    if (violations.indexOf(code) < 0) violations.push(code);
  });
  return { ok:violations.length === 0, violations:violations,
    namedEvidenceFlags:namedFlags, provenanceFindings:provenanceCheck.findings };
}

// The model gets one correction opportunity using the original evidence and
// violation codes only. A bad draft is never echoed into the retry prompt and
// never reaches the DECISION writer. Second failure is a hard hold.
// ⬡B:advisors.coding:FIX:densest_question_bound_evidence_relay:20260715⬡
// Recovery is a last-resort exact evidence relay, not a context dump. Rank every
// selected section by question-match density and relay only the strongest one.
// This keeps concise governing evidence ahead of a large, weakly overlapping
// section while preserving the exact trusted BCW bytes.
function buildNamedEvidenceRelay(namedEvidence) {
  var candidates = (Array.isArray(namedEvidence) ? namedEvidence : [])
    .map(function (item, index) {
      var original = String(item && item.text || '').trim();
      var matchScore = Number(item && item.match_score);
      if (!original || !Number.isFinite(matchScore) || matchScore <= 0) return null;
      var text = original.slice(0);
      if (namedContextContradictions(text, [item]).length) return null;
      return {
        text: text,
        density: matchScore / original.length,
        matchScore: matchScore,
        length: original.length,
        index: index
      };
    })
    .filter(Boolean)
    .sort(function (left, right) {
      return right.density - left.density ||
        right.matchScore - left.matchScore ||
        left.length - right.length ||
        left.index - right.index;
    });
  return candidates.length ? candidates[0].text : '';
}

// ⬡B:advisors.coding:REPAIR:exact_bound_evidence_after_two_invalid_drafts:20260715⬡
// Two probabilistic drafts may fail the same deterministic evidence contract.
// For a non-relay question with real selected BCW sections, CODA can still relay
// those exact live bytes. This is not an answer template: no doctrine text lives
// here. The server-built evidence is bounded, revalidated, persisted as a CODA
// decision, and still must pass the complete outbound council and STAMP.
function recoverWithNamedEvidence(options, violations) {
  var opts = options || {};
  if (opts.requireRelayRecital !== false) return null;
  var violationCodes = Array.isArray(violations) ? violations : [];
  if (!violationCodes.length || violationCodes.some(function (code) {
    return code !== 'named_context_evidence_denied';
  })) return null;
  var answer = buildNamedEvidenceRelay(opts.namedEvidence);
  if (!answer) return null;
  var check = validateLeadDraft(answer, {
    requireRelayRecital:false, namedEvidence:opts.namedEvidence || [],
    provenanceLedger:opts.provenanceLedger,
    repositoryProved:opts.repositoryProved === true
  });
  if (!check.ok) return null;
  return { ok:true, answer:answer, retried:true, attempts:2,
    evidenceRelay:true, evidenceMode:'retry_evidence_relay',
    repairedViolations:violationCodes.slice() };
}

// ⬡B:advisors.coding:DECISION:direct_named_evidence_recital:20260715⬡
// A direct request to state one explicitly named BCW section does not need a
// probabilistic paraphrase. CODA selects the exact question-bound bytes, records
// that decision, and sends them through the ordinary A'NU council. This is
// generic over section names and evidence; no doctrine or answer is embedded.
function directNamedEvidenceCandidate(question, options) {
  var opts = options || {};
  var named = Array.isArray(opts.namedEvidence) ? opts.namedEvidence : [];
  if (opts.requireRelayRecital !== false || !named.length ||
      opts.provenanceLedger && opts.provenanceLedger.required === true) return null;
  var direct = named.filter(function (item) {
    return directNamedEvidenceRequest(question, item && item.name,
      item && item.text);
  });
  if (direct.length !== 1) return null;
  var answer = buildNamedEvidenceRelay(direct);
  if (!answer) return null;
  var check = validateLeadDraft(answer, opts);
  if (!check.ok) return null;
  return { ok:true, answer:answer, retried:false, attempts:0,
    evidenceRelay:true, directNamedEvidence:true,
    evidenceMode:'direct_named_evidence', repairedViolations:[] };
}

// The model gets one correction opportunity using the original evidence and
// violation codes only. A bad draft is never echoed into the retry prompt and
// never reaches the DECISION writer. If both drafts fail on a non-relay named
// evidence question, exact bound evidence may relay through the normal council.
async function generateVerifiedLead(prompt, armory, complete, options) {
  var opts = options || {};
  var direct = directNamedEvidenceCandidate(opts.question, opts);
  if (direct) return direct;
  var first = await complete(prompt, armory);
  if (!first) return { ok:false, reason:'no_deliberation', attempts:1 };
  var firstCheck = validateLeadDraft(first, opts);
  if (firstCheck.ok) return { ok:true, answer:String(first), retried:false, attempts:1,
    evidenceMode:'model_draft' };
  var retryShape = opts.requireRelayRecital === false ? 'answer' : 'six-section lead brief';
  var retryPrompt = prompt + '\n\nYour prior draft was rejected by deterministic CODA evidence and relay contracts. ' +
    'Violation codes: ' + firstCheck.violations.join(', ') + '. Rewrite the complete ' +
    retryShape + ' from the original evidence. Use QUESTION-BOUND BCW EVIDENCE when the ' +
    'violation says named_context_evidence_denied. When the violation says ' +
    'repository_evidence_denied, use the numbered LIVE REPOSITORY READ lines already ' +
    'present in the same armory and do not claim the files were unavailable. ' +
    'CODING RELAY CONTRACT (exact): ' +
    relayContractLine() + ' Do not mention this retry or the rejected draft.';
  var second = await complete(retryPrompt, armory);
  if (!second) {
    var emptyRecovery = recoverWithNamedEvidence(opts, firstCheck.violations);
    if (emptyRecovery) return emptyRecovery;
    return { ok:false, reason:'coding_relay_contract_invalid',
      violations:firstCheck.violations, attempts:2 };
  }
  var secondCheck = validateLeadDraft(second, opts);
  if (!secondCheck.ok) {
    var evidenceRecovery = recoverWithNamedEvidence(opts, secondCheck.violations);
    if (evidenceRecovery) return evidenceRecovery;
    return { ok:false, reason:'coding_relay_contract_invalid',
      violations:secondCheck.violations, attempts:2 };
  }
  return { ok:true, answer:String(second), retried:true, attempts:2,
    evidenceMode:'model_retry' };
}

// ⬡B:advisors.coding:WIRE:coda_off_llama_onto_the_authorized_ladder:20260717⬡
// Founder caught this live: CODA, head of his coding department, ran
// groq/llama-3.3-70b-versatile as her PRIMARY. Not a floor, first choice. Every
// ruling she ever handed back came from the one model he banned, and Groq retires
// it 20260816. This was a DUPLICATE, not an oversight: advisors/dispatch.js held
// the identical private llm() with the identical pair, was moved onto the ladder
// on 20260715 with a comment naming this same complaint, and its twin here was
// missed. Catching duplicated logic is literally MACE's written job, and MACE is a
// scaffold whose processTask returns {processed:true}.
// Same door dispatch.js already walks through. Nothing new invented.
async function llm(user, founderCtx) {
  var system = 'You are CODA, the Coding advisor, head of the coding department in a life-assistant system. You deliberate over '
    + 'department state: task queue, wiring debt, build pass rates, drain receipts. Report like a department head: what '
    + 'moved, what is stuck, what you recommend next, in plain tight prose. No markdown, no em dash.\nCODING RELAY CONTRACT (exact): ' + relayContractLine()
    + (founderCtx ? ('\n\n' + founderCtx) : '');
  try {
    var res = await require('../core/model.ladder.js').deliberate(system, user, { max_tokens: 1000, temperature: 0.4, timeout: 25000 });
    return res ? res.content : null;
  } catch (e) { return null; }
}

async function readDepartmentState() {
  var state = { drainPasses: [], canon: [] };
  try {
    var dr = await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=like.canew.drain.pass.*&order=created_at.desc&limit=5&select=summary', { headers: rh() });
    state.drainPasses = ((dr.ok ? await dr.json() : []) || []).map(function (x) { return x.summary; });
    var cn = await fetch(_bu() + '/rest/v1/' + _tbl() + '?agent_global=in.(CANEW,CODER)&stamp_type=in.(TASK_DONE,GIVE_UP_TRY)&order=created_at.desc&limit=6&select=stamp_type,summary', { headers: rh() });
    state.canon = ((cn.ok ? await cn.json() : []) || []).map(function (x) { return x.stamp_type + ': ' + x.summary; });
  } catch (e) {}
  return state;
}

function isTranscriptTask(row) {
  return /^span\.task\.transcript\./i.test(String(row && row.source || ''));
}

function meaningfulWords(value) {
  var stop = { about:1, after:1, again:1, before:1, code:1, coding:1, could:1, from:1,
    have:1, help:1, into:1, need:1, should:1, task:1, that:1, their:1, them:1, this:1,
    what:1, when:1, where:1, which:1, with:1, would:1, your:1, system:1, roadmap:1,
    inspect:1, work:1, live:1, make:1, repairs:1 };
  return (String(value || '').toLowerCase().match(/[a-z0-9_'-]{4,}/g) || [])
    .filter(function (word) { return !stop[word]; });
}

function questionNamesRow(question, row) {
  var q = String(question || '').toLowerCase();
  if (!q) return false;
  var source = String(row && row.source || '').toLowerCase();
  if (source && q.indexOf(source) !== -1) return true;
  var matches = meaningfulWords(row && row.summary).filter(function (word) {
    return q.indexOf(word) !== -1;
  });
  // Transcript extraction is noisy by construction. One generic word such as
  // "system" or "roadmap" must not promote an old conversational errand into a
  // coding handoff. The caller must name the source or at least two task terms.
  return matches.length >= 2;
}

function historicalAbsolute(row) {
  var isRoadmap = String(row && row.stamp_type || '').toUpperCase() === 'ROADMAP'
    || /(?:^|\.)roadmap(?:\.|$)/i.test(String(row && row.source || ''));
  return isRoadmap
    && /\b(?:named\s*,?\s*not built|not built|zero implementation|zero code exists|does not exist)\b/i
      .test(String(row && row.summary || '') + ' ' + String(row && row.content || ''));
}

function prepareSpanEvidence(rows, question) {
  return (rows || []).filter(function (row) {
    return !isTranscriptTask(row) || questionNamesRow(question, row);
  }).map(function (row) {
    if (!historicalAbsolute(row)) return row;
    return Object.assign({}, row, { lifecycle_note:
      'HISTORICAL STATUS CLAIM. Reconcile against newer SEAL, BUILD, RESULT, TASK_DONE and live repository evidence before asserting this is current.' });
  });
}

async function readSpanEvidence(hamUid, question) {
  try {
    var out = await require('../core/find.js').find([
      { ham_uid: hamUid, stamp_type: 'ROADMAP', limit: 4 },
      { ham_uid: hamUid, agent_global: 'SPAN', limit: 6 },
      { ham_uid: hamUid, source_prefix: 'span.roadmap.', limit: 4 }
    ]);
    return out && Array.isArray(out.beads) ? prepareSpanEvidence(out.beads, question).slice(0, 10) : [];
  } catch (e) { return []; }
}

function evidenceLines(rows) {
  return (rows || []).map(function (row) {
    if (row.lifecycle_note) return '[' + (row.stamp_type || 'ROADMAP') + '] ' + (row.source || '')
      + ': Historical roadmap snapshot. Current implementation status is withheld until newer receipts and live repository evidence are reconciled.';
    return '[' + (row.stamp_type || '?') + '] ' + (row.source || '') + ': ' + String(row.summary || '').slice(0, 320);
  }).join('\n');
}

function isPortfolioAsk(question) {
  return /\b(?:what do you need|what should i (?:do|work on)|how can i help|where do you need help|help code|ready to work)\b/i
    .test(String(question || ''));
}

function hasRepositoryProof(raw) {
  if (!raw) return false;
  var value = raw;
  try { if (typeof value === 'string') value = JSON.parse(value); } catch (e) { return false; }
  if (value && Array.isArray(value.reads)) return value.reads.some(function (read) { return hasRepositoryProof(read); });
  return !!(value && value.ok && value.found && Array.isArray(value.files) && value.files.length);
}

function representedDecisionRow(value) {
  if (Array.isArray(value)) return value.length ? value[0] : null;
  return value && typeof value === 'object' ? value : null;
}

function decisionIdentityReceipt(row) {
  if (!row || typeof row !== 'object') return null;
  var content = row.content;
  try { if (typeof content === 'string') content = JSON.parse(content); }
  catch (error) { return null; }
  return content && content.evidence && content.evidence.identityProvenance &&
    content.evidence.identityProvenance.identity_evidence_receipt || null;
}

function exactPersistedDecision(row, expectedRow, expectedReceipt) {
  return !!(row && expectedRow &&
    String(row.ham_uid || '').toUpperCase() ===
      String(expectedRow.ham_uid || '').toUpperCase() &&
    String(row.agent_global || '') === String(expectedRow.agent_global || '') &&
    String(row.stamp_type || '') === String(expectedRow.stamp_type || '') &&
    String(row.acl_stamp || '') === String(expectedRow.acl_stamp || '') &&
    String(row.source || '') === String(expectedRow.source || '') &&
    String(row.summary || '') === String(expectedRow.summary || '') &&
    String(row.content || '') === String(expectedRow.content || '') &&
    Number(row.importance) === Number(expectedRow.importance) &&
    identityProvenance.sameEvidenceReceiptOrEmpty(
      decisionIdentityReceipt(row), expectedReceipt));
}

// CODA's founder-directed lead seat. This is the decision step, not another build
// engine: repository evidence is read by PAI's existing read_own_code tool, SPAN owns
// sequence, CANEW keeps the pen, CANON grades, and INTERNAL CLAIR repairs failed gates.
async function runLead(ask, hamUid, options) {
  var HAM = String(hamUid || '').toUpperCase();
  if (!HAM) return { ok: false, reason: 'ham_uid_required' };
  var question = String(ask || '').trim();
  if (!question) return { ok: false, reason: 'question_required' };
  var questionDigest = crypto.createHash('sha256')
    .update(Buffer.from(question, 'utf8')).digest('hex');
  var opts = options || {};
  var state = await readDepartmentState();
  var spanRows = await readSpanEvidence(HAM, question);
  var bcw = null, founder = null;
  try { bcw = await require('../coding-department/bcw.js').assembleBCW(question, HAM); }
  catch (eB) { return { ok:false, reason:'bcw_evidence_unavailable', lead:'CODA' }; }
  if (!bcw || !bcw.ok || !bcw.bcw) return { ok:false,
    reason:bcw && bcw.reason || 'bcw_evidence_unavailable', lead:'CODA',
    bcwAvailability:bcw && bcw.availability || null };
  try { founder = await require('../core/founder_context.js').assembleFounderContext(HAM); } catch (eF) {}
  var repoEvidence = String(opts.repositoryEvidence || '').slice(0, 10000);
  var repositoryProved = hasRepositoryProof(opts.repositoryEvidence);
  // ⬡B:advisors.coding:EVIDENCE:question_bound_bcw_last_in_armory:20260715⬡
  // The exact named section rides at the end of CODA's armory, after repository
  // evidence, so an empty code read cannot drown out live doctrine again.
  var questionBoundEvidence = boundQuestionEvidence(question, bcw);
  var provenanceRequired = identityProvenance.requiresProvenanceSplit(question);
  var storedIdentityEnvelope = opts.storedIdentityEvidence &&
    typeof opts.storedIdentityEvidence === 'object' ? opts.storedIdentityEvidence : null;
  var identityEvidenceResult = typeof opts.identityEvidenceResult === 'string'
    ? opts.identityEvidenceResult : '';
  var identityEvidenceReceipt = opts.identityEvidenceReceipt || null;
  var identityEvidenceVerified = false;
  var suppliedIdentityProof = !!(identityEvidenceResult || identityEvidenceReceipt);
  if (suppliedIdentityProof) {
    identityEvidenceVerified = identityProvenance.verifyEvidenceReceipt(
      identityEvidenceResult, identityEvidenceReceipt, HAM);
    if (identityEvidenceVerified) {
      try { storedIdentityEnvelope = JSON.parse(identityEvidenceResult); }
      catch (eIdentityParse) { identityEvidenceVerified = false; }
    }
  } else {
    if (!storedIdentityEnvelope && provenanceRequired) {
      try { storedIdentityEnvelope = await findIdentityEvidence(HAM, question); }
      catch (eIdentityEvidence) {
        storedIdentityEnvelope = { ok:false, available:false,
          reason:'identity_brain_error', records:[] };
      }
    }
    if (storedIdentityEnvelope && storedIdentityEnvelope.ok === true &&
        storedIdentityEnvelope.available === true) {
      var generatedIdentityProof = identityProvenance.createEvidenceProof(
        storedIdentityEnvelope, HAM);
      if (generatedIdentityProof.ok) {
        identityEvidenceResult = generatedIdentityProof.result;
        identityEvidenceReceipt = generatedIdentityProof.receipt;
        identityEvidenceVerified = true;
      }
    }
  }
  var identityEvidenceAvailable = !!(storedIdentityEnvelope &&
    storedIdentityEnvelope.ok === true && storedIdentityEnvelope.available === true);
  // ⬡B:advisors.coding:GUARD:bound_role_context_is_request_derived:20260715⬡
  // buildLedger derives role bindings only from the exact question. Named BCW
  // evidence stays separately typed in questionBoundEvidence and the armory.
  var provenanceLedger = identityProvenance.buildLedger({
    question:question,
    hamUid:HAM,
    storedRecords:storedIdentityEnvelope && storedIdentityEnvelope.records || [],
    evidenceAvailable:identityEvidenceAvailable,
    unavailableReason:storedIdentityEnvelope &&
      (storedIdentityEnvelope.reason || storedIdentityEnvelope.error),
    evidenceReceipt:identityEvidenceReceipt,
    receiptVerified:identityEvidenceVerified
  });
  if (provenanceLedger.required && identityEvidenceVerified &&
      !identityProvenance.verifyLedgerAgainstEvidenceResult(
        identityEvidenceResult, identityEvidenceReceipt, provenanceLedger, HAM, {
          question:question
        })) {
    identityEvidenceVerified = false;
    provenanceLedger.receipt_verified = false;
  }
  // ⬡B:advisors.coding:GUARD:provenance_decision_requires_verified_bytes:20260715⬡
  if (provenanceLedger.required &&
      (provenanceLedger.available !== true || provenanceLedger.receipt_verified !== true)) {
    return { ok:false, reason:provenanceLedger.available !== true
        ? 'identity_evidence_unavailable' : 'identity_evidence_receipt_unverified',
      provenanceVerified:false, identityEvidenceReceipt:identityEvidenceReceipt,
      lead:CODING_RELAY.lead, relay:CODING_RELAY };
  }
  var provenanceBlock = provenanceLedger.subjects.length
    ? 'IDENTITY PROVENANCE LEDGER (bounded evidence; preserve each origin and evidence_kind):\n' +
      JSON.stringify(provenanceLedger)
    : '';
  var questionBoundBlock = questionBoundEvidence.length
    ? 'QUESTION-BOUND BCW EVIDENCE (authoritative for this exact question):\n' +
      questionBoundEvidence.map(function (item) { return item.text; }).join('\n\n') +
      '\nRepository evidence governs file placement only and does not negate this BCW evidence.'
    : '';
  var armory = [
    founder && founder.ok ? founder.fcx : '',
    bcw && bcw.ok ? bcw.bcw.slice(0) : '',
    'LIVE SPAN EVIDENCE:\n' + (evidenceLines(spanRows) || '[none returned; say so and do not rank the roadmap yourself]'),
    'LIVE DEPARTMENT RECEIPTS:\n' + state.drainPasses.concat(state.canon).join('\n'),
    'LIVE REPOSITORY READ FROM PAI read_own_code:\n' + (repoEvidence || '[not supplied; do not claim file placement]'),
    questionBoundBlock,
    provenanceBlock
  ].filter(Boolean).join('\n\n');
  var portfolioDirection = isPortfolioAsk(question)
    ? 'This is a portfolio handoff to an outside coding collaborator. Give a substantive present-state brief and 3 to 5 concrete, evidence-backed needs. Name the live roadmaps and distinguish current implementation proof, historical roadmap claims that need reconciliation, and verified remaining gaps. Then select one FIRST BOUNDED ASSIGNMENT for the collaborator, naming its canonical path and exact acceptance evidence. Do not ask the collaborator to choose the first task. Do not promote transcript-extracted errands into coding priorities unless the caller explicitly named them. Do not repeat an old absolute such as zero implementation as current truth without newer receipt and repository reconciliation. '
    : '';
  var relayRecitalRequired = requiresRelayRecital(question);
  var activationDecisionRequired = roadmapActivationRequested(question);
  var provenanceDirection = provenanceLedger.required
    ? 'Answer this identity-provenance request directly, subject by subject. Use exactly the headings STORED MEMORY: and BOUND ROLE CONTEXT:. A stored activity row proves activity only. A stored self-description is a role claim, not literal identity. A role bound in the current request must stay in the bound-role section and must not be rewritten as stored memory. Do not use the six-section relay recital for this answer. '
    : '';
  var leadDirection = relayRecitalRequired
    ? 'Lead the relay. State: DECISION, EXISTING CANONICAL PATH, SPAN BASIS, BUILDER HANDOFF, ACCEPTANCE EVIDENCE, and INTERNAL CLAIR REPAIR CONDITION. '
    : 'Answer the founder\'s exact coding-context question directly from the supplied evidence. The structured relay contract still governs this CODA decision; do not pad an unrelated doctrine or preference answer with relay-role sections. ';
  var activationDirection = activationDecisionRequired
    ? 'This request contains a typed ROADMAP_ACTIVATION_SPEC. End the answer with exactly one line: ACTIVATION DECISION: APPROVE or ACTIVATION DECISION: HOLD. APPROVE means the exact roadmap source and target path are verified and the bounded missing implementation belongs there. The requested function being absent is a build gap, not by itself a reason to hold. HOLD means source ownership, target ownership, or the stated boundaries could not be verified. '
    : '';
  var currentPreferenceDirection = currentAssistantPreferenceRequest(question)
    ? 'This asks A\'NU to form a present self-preference. Absence of a prior stored PREFERENCE is not a no-answer condition. Separate stored preference evidence from a fresh current judgment, identify only verified facts about the named options, and leave the actual present choice to A\'NU. Do not invent adviser traits or claim a prior favorite. '
    : '';
  var leadPrompt = 'Founder coding request:\n' + question + '\n\n' + provenanceDirection + leadDirection +
    activationDirection +
    currentPreferenceDirection +
    portfolioDirection +
    'Use only the evidence supplied. If repository evidence is empty, hold file-placement claims only. Repository absence never negates BCW doctrine or QUESTION-BOUND BCW EVIDENCE. Never write the code in this advisory step and never create a parallel queue or build engine.\nCODING RELAY CONTRACT (exact): ' +
    relayContractLine();
  var verifiedLead = await generateVerifiedLead(leadPrompt, armory,
    typeof opts.complete === 'function' ? opts.complete : llm, {
    question:question,
    requireRelayRecital:relayRecitalRequired,
    activationDecisionRequired:activationDecisionRequired,
    namedEvidence:questionBoundEvidence,
    provenanceLedger:provenanceLedger,
    repositoryProved:repositoryProved
  });
  if (!verifiedLead.ok) return { ok:false, reason:verifiedLead.reason,
    violations:verifiedLead.violations || [], attempts:verifiedLead.attempts || 0,
    lead:CODING_RELAY.lead, relay:CODING_RELAY };
  var out = verifiedLead.answer;
  var activationDecision = activationDecisionRequired ? roadmapActivationDecision(out) : null;
  var provenanceVerified = identityProvenance.validateDraft(out, provenanceLedger).ok;
  var provenanceDecisionReceipt = {
    schema:provenanceLedger.schema,
    required:provenanceLedger.required,
    verified:provenanceVerified,
    subjects:provenanceLedger.subjects,
    entries:provenanceLedger.entries,
    stored_record_count:provenanceLedger.stored_records.length,
    bound_context_count:provenanceLedger.bound_role_context.length,
    identity_evidence_receipt:identityEvidenceReceipt
  };
  var decisionStamped = false;
  var decisionSource = 'coding.lead.' + Date.now() + '.' +
    crypto.randomBytes(8).toString('hex');
  var decisionRow = {
    ham_uid: HAM, agent_global: 'CODING_ADVISOR', stamp_type: 'DECISION',
    acl_stamp: '\u2b21B:advisors.coding:DECISION:coda_lead:' + ymd() + '\u2b21',
    source: decisionSource,
    summary: '[CODA LEAD] ' + out.slice(0, 170) + (out.length > 170 ? '...' : ''),
    content: JSON.stringify({ question: question.slice(0),
      questionDigest:questionDigest, answer: out.slice(0),
      evidence: { repository: repositoryProved, spanRows: spanRows.length,
        bcw: !!(bcw && bcw.ok), bcwPacks: bcw && bcw.packs || null,
        questionBound:questionBoundEvidence.map(function (item) {
          return { name:item.name, evidence_digest:item.evidence_digest };
        }),
        drainReceipts: state.drainPasses.length, canonReceipts: state.canon.length,
        identityProvenance:provenanceDecisionReceipt },
      relay: CODING_RELAY, relayContractVerified:true,
      relayRecitalRequired:relayRecitalRequired,
      evidenceRelay:verifiedLead.evidenceRelay === true,
      evidenceMode:verifiedLead.evidenceMode || null,
      directNamedEvidence:verifiedLead.directNamedEvidence === true,
      activationDecision:activationDecision,
      activationApproved:activationDecision === 'APPROVE',
      retried:verifiedLead.retried === true }),
    importance: 8
  };
  try {
    // Every exact evidence relay can authorize SHADOW to override a
    // probabilistic hold. Direct and retry recovery therefore require the same
    // represented write plus exact-source readback as identity provenance.
    var decisionReadbackRequired = provenanceRequired ||
      verifiedLead.evidenceRelay === true;
    var writeHeaders = decisionReadbackRequired
      ? Object.assign({}, wh(), { Prefer:'return=representation' }) : wh();
    var decisionWrite = await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST', headers: writeHeaders, body: JSON.stringify(decisionRow)
    });
    decisionStamped = !!decisionWrite.ok;
    // ⬡B:advisors.coding:GUARD:receipted_identity_decision_readback:20260715⬡
    // An HTTP 2xx is not durable identity authority. For a provenance-required
    // answer, the exact unique source must be represented by POST and then read
    // back at the same HAM with the same receipted evidence bytes.
    if (decisionStamped && decisionReadbackRequired) {
      var represented = null;
      try { represented = representedDecisionRow(await decisionWrite.json()); }
      catch (eRepresented) { represented = null; }
      decisionStamped = exactPersistedDecision(
        represented, decisionRow, identityEvidenceReceipt);
      if (decisionStamped) {
        var readbackUrl = _bu() + '/rest/v1/' + _tbl() +
          '?ham_uid=eq.' + encodeURIComponent(HAM) +
          '&source=eq.' + encodeURIComponent(decisionSource) +
          '&select=ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,importance&limit=1';
        var readback = await fetch(readbackUrl, { headers:rh() });
        var readbackRow = null;
        if (readback.ok) {
          try { readbackRow = representedDecisionRow(await readback.json()); }
          catch (eReadback) { readbackRow = null; }
        }
        decisionStamped = exactPersistedDecision(
          readbackRow, decisionRow, identityEvidenceReceipt);
      }
    }
  } catch (eS) {}
  if (!decisionStamped) return { ok: false, reason: 'decision_not_persisted',
    answer: out.slice(0), lead: CODING_RELAY.lead, relay:CODING_RELAY,
    question:question, questionDigest:questionDigest,
    relayContractVerified:true, evidenceRelay:verifiedLead.evidenceRelay === true,
    evidenceMode:verifiedLead.evidenceMode || null,
    directNamedEvidence:verifiedLead.directNamedEvidence === true,
    provenanceVerified:provenanceVerified, provenance:provenanceLedger,
    identityEvidenceReceipt:identityEvidenceReceipt,
    retried:verifiedLead.retried === true,
    activationDecision:activationDecision,
    activationApproved:activationDecision === 'APPROVE',
    decisionSource:decisionSource,
    evidence: { repository: repositoryProved,
      spanRows: spanRows.length, bcw: !!(bcw && bcw.ok), decisionStamped: false } };
  return { ok: true, answer: out.slice(0), lead: CODING_RELAY.lead,
    question:question, questionDigest:questionDigest,
    relay:CODING_RELAY, relayContractVerified:true,
    evidenceRelay:verifiedLead.evidenceRelay === true,
    evidenceMode:verifiedLead.evidenceMode || null,
    directNamedEvidence:verifiedLead.directNamedEvidence === true,
    provenanceVerified:provenanceVerified, provenance:provenanceLedger,
    identityEvidenceReceipt:identityEvidenceReceipt,
    retried:verifiedLead.retried === true,
    activationDecision:activationDecision,
    activationApproved:activationDecision === 'APPROVE',
    decisionSource:decisionSource,
    evidence: { repository: repositoryProved, spanRows: spanRows.length,
      bcw: !!(bcw && bcw.ok), drainReceipts: state.drainPasses.length,
      canonReceipts: state.canon.length, decisionStamped: true } };
}

async function runCycle(intent, hamUid, rawAsk) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var HAM = String(hamUid || process.env.FOUNDER_HAM_UID).toUpperCase();
  // A direct coding ask is now led by CODA herself. Routine autonomous cycles keep
  // their proven standing-report path below.
  if (rawAsk && String(rawAsk).trim()) return runLead(rawAsk, HAM);
  // ⬡B:advisors.coding:WIRE:teeth_universal_gate:20260711⬡
  // Founder order: Eli's team-dispatch is now the model for every advisor. One
  // gate: a real substantial founder ask dispatches the team; the standing
  // inbox-review cycle (no ask) is completely unchanged below.
  // Cold reads: real department state, never guessed.
  var state = await readDepartmentState();
  var ask = (intent && String(intent).trim()) || 'Standing department report: queue movement, stuck work, next recommendation.';
  // ⬡B:advisors.coding:FIX:never_had_founder_context_20260713⬡
  // Founder-caught live: the BCW armory built for the CLAIR command center
  // chat (coding-department/bcw.js) and the Founder Context armory built the
  // same night (core/founder_context.js) never actually reached CODA, the
  // real advisor this system routes to for coding questions. Confirmed by
  // reading this file before this fix: llm() only ever saw department state,
  // never who founded the department. Fail-open, same discipline as every
  // other armory pull this system uses.
  var founderCtx = '';
  try { var _fc = await require('../core/founder_context.js').assembleFounderContext(HAM); if (_fc && _fc.ok && _fc.fcx) founderCtx = _fc.fcx; } catch (eFc) {}
  var out = await llm('Live department state:\nDrain passes:\n' + state.drainPasses.join('\n')
    + '\nRecent closures/give-ups:\n' + state.canon.join('\n') + '\n\nThe ask: ' + ask, founderCtx);
  if (!out) return { ok: false, reason: 'no_deliberation' }; // silence over hollow
  await fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: wh(), body: JSON.stringify({
    ham_uid: HAM, agent_global: 'CODING_ADVISOR', stamp_type: 'RESULT',
    acl_stamp: '\u2b21B:advisors.coding:RESULT:cycle:' + ymd() + '\u2b21',
    source: 'coding.cycle.' + Date.now(),
    // \u2b21B:advisors.coding:FIX:summary_truncated_no_ellipsis_content_field_mismatch:20260709\u2b21
    // Founder caught this live on the real page: cut off mid-sentence, no
    // indication it was cut. Two real bugs, not one -- the summary itself had
    // no ellipsis, and the full answer was already being saved to
    // content.answer the whole time, but three-ray.routes.js's display only
    // ever reads content.text, never content.answer, so the full version was
    // never reachable. content.text added here so the real, complete answer
    // actually surfaces; summary kept short on purpose as a preview, with an
    // honest ellipsis when it's genuinely cut.
    summary: '[CODING ADVISOR] ' + out.slice(0, 170) + (out.length > 170 ? '...' : ''),
    content: JSON.stringify({ intent: ask, text: out.slice(0), answer: out.slice(0), stateRead: state.drainPasses.length + ' drain receipts' }),
    importance: 6 }) }).catch(function () {});
  return { ok: true, answer: out.slice(0) };
}

module.exports = { runCycle: runCycle, runLead: runLead,
  _test: { readDepartmentState: readDepartmentState, readSpanEvidence: readSpanEvidence,
    hasRepositoryProof: hasRepositoryProof, prepareSpanEvidence: prepareSpanEvidence,
    historicalAbsolute: historicalAbsolute, isPortfolioAsk: isPortfolioAsk,
    evidenceLines:evidenceLines, CODING_RELAY:CODING_RELAY,
    validateLeadRelay:validateLeadRelay, validateLeadDraft:validateLeadDraft,
    generateVerifiedLead:generateVerifiedLead, requiresRelayRecital:requiresRelayRecital,
    roadmapActivationRequested:roadmapActivationRequested,
    roadmapActivationDecision:roadmapActivationDecision,
    boundQuestionEvidence:boundQuestionEvidence,
    buildNamedEvidenceRelay:buildNamedEvidenceRelay,
    recoverWithNamedEvidence:recoverWithNamedEvidence,
    repositoryEvidenceDenied:repositoryEvidenceDenied,
    directNamedEvidenceCandidate:directNamedEvidenceCandidate,
    relayContractLine:relayContractLine } };
