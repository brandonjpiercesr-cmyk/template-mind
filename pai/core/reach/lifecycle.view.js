// ⬡B:core.reach.lifecycle_view:MODULE:command_center_terminal_truth:20260717⬡
//
// Command Center view of autonomous REACH delivery truth. Provider acceptance
// is a pending attempt, never delivery. A pending OUTREACH/DIGEST row advances
// only when exactly one immutable terminal receipt binds the same HAM, request,
// cycle, family, channel, provider receipt, and deterministic source.
//
// Recovered pending rows intentionally contain no human message bytes. This
// view never reconstructs those bytes from summaries, provider receipts, or
// terminal metadata.
'use strict';

const crypto = require('node:crypto');

const VOICE_DELIVERY_VERSION = 'anew.reach.voice.outreach-delivery.v1';
const DECISION_VERSION = 'anew.reach.council-policy.v1';
const DECISION_ACL =
  '⬡B:core.reach.cycle_decision:REACH_CYCLE_DECISION:one_council:20260717⬡';
const MESSAGE_PROOF_SCOPES = new Set([
  'blooio_recipient_delivery_confirmation',
  'blooio_terminal_failure',
  'nylas_tracking_pixel_fetch',
  'nylas_tracked_thread_reply',
  'nylas_bounce_detected'
]);
const VOICE_PROOF_SCOPES = new Set([
  'provider_bound_inbound_utterance_and_exact_answer_transport_completion',
  'pending_write_missing_recovered_from_exact_durable_provider_bound_turn'
]);

function bankUrl() {
  return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || '';
}
function bankKey() {
  return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY || '';
}
function memorySelected() {
  return !!(process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY);
}
function bankTable() {
  return process.env.BEAD_TABLE || (memorySelected() ? 'beads' : 'aibe_brain');
}
function bankSchema() {
  return process.env.BRAIN_SCHEMA || (memorySelected() ? 'memory_bank' : 'abacia_core');
}
function headers() {
  const key = bankKey();
  return { apikey:key, Authorization:'Bearer ' + key,
    'Accept-Profile':bankSchema() };
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
function normalizeHamUid(value) {
  const uid = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._:-]{2,160}$/.test(uid) ? uid : '';
}
function requestToken(value) {
  value = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,220}$/.test(value) ? value : '';
}
function safeString(value, max) {
  if (typeof value !== 'string' || !value || value.length > (max || 500) ||
      /[\u0000\u007f]/.test(value)) return null;
  return value;
}
function safeTokenString(value, max) {
  if (typeof value !== 'string' || !value || value.length > (max || 500) ||
      /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
function canonicalCreatedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : '';
}
function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) { return null; }
}
function emptyView(reason) {
  return { ok:false, reason:reason, items:[], decisions:[], counts:{ pending:0,
    delivered:0, failed:0 }, diagnostics:{ rejectedPending:0,
    ambiguousPending:0, ambiguousTerminal:0, rejectedTerminal:0,
    orphanTerminal:0, rejectedDecision:0, ambiguousDecision:0 } };
}

async function readRows(hamUid, stampFilter, sourcePrefix, limit) {
  let url = bankUrl() + '/rest/v1/' + bankTable() + '?ham_uid=eq.' +
    encodeURIComponent(hamUid) + '&agent_global=eq.ANEW&stamp_type=' + stampFilter;
  if (sourcePrefix) url += '&source=like.' + encodeURIComponent(sourcePrefix + '*');
  url += '&select=id,ham_uid,agent_global,stamp_type,source,summary,content,created_at' +
    '&order=created_at.desc&limit=' + Math.min(Math.max(Number(limit) || 100, 1), 500);
  const response = await fetch(url, { headers:headers() });
  if (!response || response.ok !== true) throw new Error('reach_lifecycle_read_failed');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('reach_lifecycle_read_invalid');
  return rows;
}

async function readDecisionRows(hamUid, limit) {
  let url = bankUrl() + '/rest/v1/' + bankTable() + '?ham_uid=eq.' +
    encodeURIComponent(hamUid) + '&agent_global=eq.REACH' +
    '&stamp_type=eq.REACH_CYCLE_DECISION&source=like.' +
    encodeURIComponent('reach.cycle_decision.' + hamUid + '.*') +
    '&select=id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,created_at' +
    '&order=created_at.desc&limit=' + Math.min(Math.max(Number(limit) || 100, 1), 500);
  const response = await fetch(url, { headers:headers() });
  if (!response || response.ok !== true) throw new Error('reach_decision_read_failed');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('reach_decision_read_invalid');
  return rows;
}

function hexDigest(value) {
  value = String(value || '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

// The command center gets the judgment, not the authority-bearing payload.
// Raw evidence, parent bytes, artifact bytes, delivery targets, receipts,
// STAMP proofs, and proposal provenance intentionally never leave this view.
function decisionCandidate(row, hamUid) {
  if (!row || row.ham_uid !== hamUid || row.agent_global !== 'REACH' ||
      row.stamp_type !== 'REACH_CYCLE_DECISION' || row.acl_stamp !== DECISION_ACL) return null;
  const content = parseObject(row.content);
  const policy = content && content.policy;
  const proof = content && content.council_proof;
  const full = content && content.council_result;
  const policyAuthority = content && content.policy_authority;
  const receipt = full && full.council_receipt;
  const stamp = full && full.stamp_proof;
  if (!content || content.version !== DECISION_VERSION || !policy || !proof ||
      !policyAuthority || !full || full.ok !== true || !receipt || !stamp) return null;
  const evidenceDigest = hexDigest(content.evidence_digest);
  const factsDigest = hexDigest(content.facts_digest);
  const policyDigest = hexDigest(content.policy_digest);
  const artifactDigest = hexDigest(content.artifact_digest);
  const proposedMessageDigest = hexDigest(policy.proposed_message_digest);
  const receiptDigest = hexDigest(proof.receipt_digest);
  const finalSource = safeTokenString(proof.final_source, 500);
  const councilRequestId = requestToken(proof.request_id);
  const councilCycleId = requestToken(proof.cycle_id);
  const when = String(policy.when || '').toUpperCase();
  const channel = String(policy.channel || '').toLowerCase();
  const reason = safeString(policy.reason, 500);
  const recheckAt = policy.recheck_at == null ? null : canonicalCreatedAt(policy.recheck_at);
  const parentCandidateSource = policy.candidate_source == null ? null
    : safeTokenString(policy.candidate_source, 500);
  const parentRequestId = policy.parent_request_id == null ? null
    : requestToken(policy.parent_request_id);
  const parentCycleId = policy.parent_cycle_id == null ? null
    : requestToken(policy.parent_cycle_id);
  const importance = Number(policy.importance);
  const artifact = typeof content.artifact === 'string' ? content.artifact : null;
  const policyText = typeof content.policy_text === 'string' ? content.policy_text : null;
  const artifactBytes = artifact == null ? -1 : Buffer.byteLength(artifact, 'utf8');
  const expectedSource = 'reach.cycle_decision.' + hamUid + '.' + evidenceDigest + '.' + policyDigest;
  if (!evidenceDigest || !factsDigest || !policyDigest || !artifactDigest ||
      !proposedMessageDigest || !receiptDigest || !finalSource || !councilRequestId ||
      !councilCycleId || !reason || !artifact || !policyText ||
      row.source !== expectedSource || content.facts_digest !== factsDigest ||
      content.evidence_digest !== evidenceDigest || JSON.stringify(policy) !== policyText ||
      sha256(policyText) !== policyDigest || sha256(artifact) !== artifactDigest ||
      !Number.isInteger(policy.proposed_message_bytes) || policy.proposed_message_bytes < 1 ||
      proof.answer_digest !== artifactDigest || proof.answer_bytes !== artifactBytes ||
      proof.readback_verified !== true || proof.committed !== true ||
      proof.representation_count !== 9 || proof.row_count !== 9 || proof.stage_count !== 7 ||
      policy.version !== DECISION_VERSION || policy.ham_uid !== hamUid ||
      policy.evidence_digest !== evidenceDigest || policy.facts_digest !== factsDigest ||
      !Number.isInteger(importance) || importance < 1 || importance > 10 ||
      receipt.ham_uid !== hamUid || receipt.request_id !== councilRequestId ||
      receipt.cycle_id !== councilCycleId || receipt.question !== policyText ||
      typeof receipt.deliberation_input !== 'string' ||
      sha256(receipt.deliberation_input) !== evidenceDigest ||
      receipt.answer !== artifact || receipt.answer_digest !== artifactDigest ||
      receipt.answer_bytes !== artifactBytes || receipt.receipt_digest !== receiptDigest ||
      !receipt.persistence || receipt.persistence.final_source !== finalSource ||
      stamp.ok !== true || stamp.readback_verified !== true ||
      stamp.ham_uid !== hamUid || stamp.request_id !== councilRequestId ||
      stamp.cycle_id !== councilCycleId || stamp.final_source !== finalSource ||
      stamp.prepared_receipt_digest !== receiptDigest ||
      stamp.answer_digest !== artifactDigest) return null;
  try {
    const council = require('../pai.outbound.council.js');
    const verified = council.requireVerifiedCouncilResult(full, { hamUid:hamUid,
      requestId:councilRequestId, cycleId:councilCycleId, question:policyText,
      deliberationInput:receipt.deliberation_input, answer:artifact,
      deliveryTarget:content.delivery_target });
    const compact = verified && verified.ok ? council.compactCouncilProof(full) : null;
    if (!verified || verified.ok !== true || !compact ||
        compact.request_id !== proof.request_id || compact.cycle_id !== proof.cycle_id ||
        compact.final_source !== proof.final_source ||
        compact.receipt_digest !== proof.receipt_digest ||
        compact.answer_digest !== proof.answer_digest ||
        compact.answer_bytes !== proof.answer_bytes ||
        compact.readback_verified !== proof.readback_verified ||
        compact.representation_count !== proof.representation_count ||
        compact.row_count !== proof.row_count || compact.stage_count !== proof.stage_count ||
        compact.committed !== proof.committed ||
        (compact.delivery_target_digest || null) !== (proof.delivery_target_digest || null) ||
        (compact.delivery_target_bytes == null ? null : compact.delivery_target_bytes) !==
          (proof.delivery_target_bytes == null ? null : proof.delivery_target_bytes)) return null;
    const evidence = parseObject(receipt.deliberation_input);
    const authorityShape = evidence && {
      hamUid:hamUid,evidence:evidence,evidenceText:receipt.deliberation_input,
      evidenceDigest:evidenceDigest,factsDigest:factsDigest,
      candidate:policy.candidate_source ? {source:policy.candidate_source,
        requestId:policy.parent_request_id,cycleId:policy.parent_cycle_id}:null
    };
    const decisionModule = require('./cycle.decision.js');
    if (!authorityShape || evidence.ham_uid !== hamUid ||
        evidence.facts_digest !== factsDigest ||
        !decisionModule._test.validatePolicyAuthority(authorityShape,policy,
          policyAuthority)||!decisionModule._test.validatePolicy(authorityShape,policy))return null;
  } catch (eVerify) { return null; }
  if (parentCandidateSource === null) {
    if (policy.candidate_source !== null || policy.parent_request_id !== null ||
        policy.parent_cycle_id !== null) return null;
  } else if (!parentRequestId || !parentCycleId ||
      parentCandidateSource !== 'reach.candidate.' + hamUid + '.' + parentCycleId) return null;
  if (when === 'NOW') {
    if (policy.reach !== true || !/^(voice|text|email|command_center)$/.test(channel) ||
        recheckAt !== null) return null;
  } else if (when === 'HOLD') {
    if (policy.reach !== false || channel !== 'none' || recheckAt !== null) return null;
  } else if (when === 'DEFER') {
    if (policy.reach !== false || channel !== 'none' || !recheckAt) return null;
  } else return null;
  return { id:'reach-decision:' + evidenceDigest, hamUid:hamUid,
    decisionSource:row.source, reach:policy.reach, when:when,
    recheckAt:recheckAt, channel:channel, importance:importance, reason:reason,
    parentCandidateSource:parentCandidateSource, parentRequestId:parentRequestId,
    parentCycleId:parentCycleId, councilRequestId:councilRequestId,
    councilCycleId:councilCycleId, councilFinalSource:finalSource,
    councilReceiptDigest:receiptDigest, evidenceDigest:evidenceDigest,
    factsDigest:factsDigest, at:canonicalCreatedAt(row.created_at) || null,
    status:when === 'NOW' ? 'AUTHORIZED' : when };
}

function correlateDecisionRows(hamUid, rows, diagnostics) {
  const uid = normalizeHamUid(hamUid);
  if (!uid) return [];
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    if (!row || row.ham_uid !== uid || row.agent_global !== 'REACH') return;
    const content = parseObject(row.content);
    const key = content && hexDigest(content.evidence_digest) || String(row.source || 'invalid');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  const decisions = [];
  grouped.forEach(function (group) {
    if (group.length !== 1) {
      diagnostics.ambiguousDecision += group.length;
      return;
    }
    const decision = decisionCandidate(group[0], uid);
    if (decision) decisions.push(decision); else diagnostics.rejectedDecision++;
  });
  return decisions.sort(function (a, b) {
    return String(b.at || '').localeCompare(String(a.at || ''));
  });
}

function channelForPending(family, content) {
  if (family === 'digest') {
    const declared = String(content.fallback_channel || content.proposedChannel || 'text')
      .trim().toLowerCase();
    return declared === 'sms' ? 'text' : declared === 'text' ? 'text' : '';
  }
  if (safeString(content.call_receipt, 500) &&
      /voice/i.test(String(content.proposedChannel || ''))) return 'voice';
  const declared = String(content.fallback_channel || content.proposedChannel || '')
    .trim().toLowerCase();
  if (declared === 'sms') return 'text';
  return /^(text|email)$/.test(declared) ? declared : '';
}

function pendingCandidate(row, hamUid) {
  if (!row || row.ham_uid !== hamUid || row.agent_global !== 'ANEW') return null;
  const family = row.stamp_type === 'DIGEST' ? 'digest'
    : row.stamp_type === 'OUTREACH' ? 'outreach' : '';
  if (!family) return null;
  const content = parseObject(row.content);
  if (!content) return null;
  const requestId = requestToken(content.requestId);
  const cycleId = requestToken(content.cycleId);
  if (!requestId || !cycleId) return null;
  const expectedSource = family === 'digest'
    ? 'outreach.digest.pending.' + requestId : 'outreach.pending.' + requestId;
  if (row.source !== expectedSource || content.providerAccepted !== true ||
      content.pendingDelivery !== true || content.delivered !== false ||
      content.sent !== false || (content.disposition != null &&
      content.disposition !== 'pending')) return null;
  const channel = channelForPending(family, content);
  if (!channel) return null;
  const providerMessageId = channel === 'voice'
    ? safeTokenString(content.call_receipt, 500)
    : safeTokenString(content.send_receipt, 500);
  if (!providerMessageId) return null;
  const expectedProvider = channel === 'text' ? 'blooio'
    : channel === 'email' ? 'nylas' : null;
  const recovered = content.recoveredFromProviderTruth === true;
  if (recovered && (content.version !== 2 ||
      !safeTokenString(content.providerAttemptSource, 500) ||
      !safeTokenString(content.providerIntentSource, 500))) return null;
  return { row:row, content:content, family:family, requestId:requestId,
    cycleId:cycleId, channel:channel, providerMessageId:providerMessageId,
    expectedProvider:expectedProvider, recovered:recovered,
    message:recovered ? null : safeString(content.message, 30000),
    subject:recovered ? null : safeString(content.emailSubject || content.subject, 1000),
    summary:safeString(row.summary, 2000) };
}

function expectedMessageTerminalSource(pending, failed) {
  const prefix = pending.family === 'digest' ? 'outreach.digest.' : 'outreach.';
  return prefix + (failed ? 'failed.' : 'sent.') + pending.requestId + '.' +
    pending.channel + '.' + sha256(pending.providerMessageId).slice(0, 32);
}

function exactMessageTerminal(pending, row, hamUid) {
  if (!row || row.ham_uid !== hamUid || row.agent_global !== 'ANEW' ||
      !/^(OUTREACH_DELIVERY|OUTREACH_FAILURE)$/.test(row.stamp_type || '')) return null;
  const content = parseObject(row.content);
  if (!content || content.version !== 2 || content.terminal !== true) return null;
  const failed = row.stamp_type === 'OUTREACH_FAILURE';
  if (content.requestId !== pending.requestId || content.cycleId !== pending.cycleId ||
      content.pendingSource !== pending.row.source ||
      content.pendingFamily !== pending.family || content.channel !== pending.channel ||
      content.provider !== pending.expectedProvider ||
      content.providerMessageId !== pending.providerMessageId ||
      content.delivered !== !failed || content.failed !== failed ||
      row.source !== expectedMessageTerminalSource(pending, failed)) return null;
  const proofScope = safeString(content.proofScope, 180);
  if (!proofScope || !MESSAGE_PROOF_SCOPES.has(proofScope)) return null;
  const expectedProof = pending.expectedProvider === 'blooio'
    ? (failed ? 'blooio_terminal_failure' : 'blooio_recipient_delivery_confirmation')
    : (failed ? 'nylas_bounce_detected' : null);
  if (expectedProof && proofScope !== expectedProof) return null;
  if (pending.expectedProvider === 'nylas' && !failed &&
      proofScope !== 'nylas_tracking_pixel_fetch' &&
      proofScope !== 'nylas_tracked_thread_reply') return null;
  const receiptHash = sha256(pending.providerMessageId);
  const intentPattern = new RegExp('^reach\\.provider_intent\\.' +
    pending.expectedProvider + '\\.[a-f0-9]{64}$');
  const expectedAttempt = 'reach.provider_attempt.' + pending.expectedProvider + '.' + receiptHash;
  const expectedFinal = 'reach.provider_final.' + pending.expectedProvider + '.' + receiptHash;
  const eventPattern = new RegExp('^reach\\.provider_event\\.' +
    pending.expectedProvider + '\\.' + receiptHash + '\\.' +
    (failed ? 'failed' : 'delivered') + '\\.' + proofScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '\\.[a-f0-9]{32}$');
  if (!intentPattern.test(String(content.providerIntentSource || '')) ||
      content.providerAttemptSource !== expectedAttempt ||
      !eventPattern.test(String(content.providerEventSource || '')) ||
      content.providerFinalizationSource !== expectedFinal ||
      safeTokenString(content.providerStatus, 500) === null ||
      content.pendingRecovered !== pending.recovered ||
      content.bounced !== (proofScope === 'nylas_bounce_detected') ||
      content.humanReadConfirmed !== (proofScope === 'nylas_tracked_thread_reply')) return null;
  if (pending.recovered &&
      (pending.content.providerIntentSource !== content.providerIntentSource ||
       pending.content.providerAttemptSource !== content.providerAttemptSource)) return null;
  return { row:row, content:content, status:failed ? 'FAILED' : 'DELIVERED',
    provider:content.provider, providerStatus:content.providerStatus,
    proofScope:proofScope, humanReadConfirmed:content.humanReadConfirmed === true };
}

function exactVoiceTerminal(pending, row, hamUid) {
  if (!row || row.ham_uid !== hamUid || row.agent_global !== 'ANEW' ||
      row.stamp_type !== 'OUTREACH_DELIVERY') return null;
  const content = parseObject(row.content);
  const expectedSource = 'outreach.sent.voice.' + sha256(JSON.stringify([
    hamUid, pending.requestId, pending.cycleId, pending.providerMessageId
  ]));
  if (!content || content.version !== VOICE_DELIVERY_VERSION ||
      row.source !== expectedSource || content.delivered !== true ||
      content.channel !== 'voice' || content.human_audibility_claimed !== false ||
      content.ham_uid !== hamUid || content.request_id !== pending.requestId ||
      content.cycle_id !== pending.cycleId ||
      content.pending_source !== pending.row.source ||
      (pending.synthesizedFromRecoveredTerminal === true &&
        content.provider_call_id !== pending.providerMessageId) ||
      content.provider_call_digest !== sha256(pending.providerMessageId) ||
      content.turn_delivery_readback_verified !== true ||
      content.autonomous_reach_attempt_readback_verified !== true ||
      content.council_committed !== true || content.council_readback_verified !== true ||
      !VOICE_PROOF_SCOPES.has(content.proof_scope)) return null;
  const recovered = content.proof_scope ===
    'pending_write_missing_recovered_from_exact_durable_provider_bound_turn';
  if (recovered) {
    if (content.pending_write_missing_recovered !== true ||
        content.pending_row_id !== null) return null;
  } else if (pending.row.id != null && content.pending_row_id !== pending.row.id) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/.test(String(content.autonomous_reach_attempt_digest || '')) ||
      content.autonomous_reach_attempt_source !== 'reach.voice_autonomous_attempt.' +
        content.autonomous_reach_attempt_digest ||
      !/^[a-f0-9]{64}$/.test(String(content.session_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.call_receipt_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.call_binding_digest || '')) ||
      !safeTokenString(content.turn_delivery_source, 500) ||
      !String(content.turn_delivery_source).startsWith('reach.voice_turn_delivery.') ||
      !safeTokenString(content.turn_id, 500) ||
      !/^[a-f0-9]{64}$/.test(String(content.transcript_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.answer_digest || '')) ||
      !Number.isInteger(content.answer_bytes) || content.answer_bytes < 1 ||
      content.council_request_id !== content.turn_id ||
      !requestToken(content.council_cycle_id) ||
      !safeTokenString(content.council_final_source, 500) ||
      !/^[a-f0-9]{64}$/.test(String(content.council_receipt_digest || ''))) return null;
  return { row:row, content:content, status:'DELIVERED', provider:null,
    providerStatus:null, proofScope:content.proof_scope,
    humanReadConfirmed:false };
}

// A provider-bound turn can finish after the outbound process died before its
// `outreach.pending` audit was represented. The voice route waits a bounded
// visibility grace, proves the durable autonomous attempt and exact delivered
// turn, then writes a terminal with no pending row ID. That terminal is strong
// enough to synthesize one read-only lifecycle candidate, but never message
// bytes. It cannot authorize another effect or create a bank row.
function recoveredVoicePendingFromTerminal(row, hamUid) {
  if (!row || row.ham_uid !== hamUid || row.agent_global !== 'ANEW' ||
      row.stamp_type !== 'OUTREACH_DELIVERY') return null;
  const content = parseObject(row.content);
  const requestId = requestToken(content && content.request_id);
  const cycleId = requestToken(content && content.cycle_id);
  const providerCallId = safeTokenString(content && content.provider_call_id, 500);
  const attemptDigest = String(content && content.autonomous_reach_attempt_digest || '');
  const expectedPendingSource = 'outreach.pending.' + requestId;
  const expectedTerminalSource = 'outreach.sent.voice.' + sha256(JSON.stringify([
    hamUid, requestId, cycleId, providerCallId
  ]));
  if (!content || content.version !== VOICE_DELIVERY_VERSION || !requestId || !cycleId ||
      !providerCallId || row.source !== expectedTerminalSource ||
      content.delivered !== true || content.channel !== 'voice' ||
      content.proof_scope !==
        'pending_write_missing_recovered_from_exact_durable_provider_bound_turn' ||
      content.human_audibility_claimed !== false || content.ham_uid !== hamUid ||
      content.pending_source !== expectedPendingSource || content.pending_row_id !== null ||
      content.pending_write_missing_recovered !== true ||
      !Number.isInteger(content.pending_visibility_grace_ms) ||
      content.pending_visibility_grace_ms < 1000 ||
      !canonicalCreatedAt(content.turn_delivery_created_at) ||
      content.provider_call_digest !== sha256(providerCallId) ||
      !/^[a-f0-9]{64}$/.test(attemptDigest) ||
      content.autonomous_reach_attempt_source !==
        'reach.voice_autonomous_attempt.' + attemptDigest ||
      content.autonomous_reach_attempt_readback_verified !== true ||
      !canonicalCreatedAt(content.autonomous_reach_attempt_at) ||
      content.turn_delivery_readback_verified !== true ||
      !safeTokenString(content.turn_delivery_source, 500) ||
      !String(content.turn_delivery_source).startsWith('reach.voice_turn_delivery.') ||
      !safeTokenString(content.turn_id, 500) ||
      !/^[a-f0-9]{64}$/.test(String(content.session_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.call_receipt_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.call_binding_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.transcript_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(content.answer_digest || '')) ||
      !Number.isInteger(content.answer_bytes) || content.answer_bytes < 1 ||
      content.council_request_id !== content.turn_id ||
      !requestToken(content.council_cycle_id) ||
      !safeTokenString(content.council_final_source, 500) ||
      !/^[a-f0-9]{64}$/.test(String(content.council_receipt_digest || '')) ||
      content.council_committed !== true || content.council_readback_verified !== true) {
    return null;
  }
  const syntheticRow = { id:null, ham_uid:hamUid, agent_global:'ANEW',
    stamp_type:'OUTREACH', source:expectedPendingSource,
    summary:'[OUTREACH] recovered voice delivery from exact durable turn',
    created_at:canonicalCreatedAt(content.turn_delivery_created_at), content:null };
  return { row:syntheticRow, content:{}, family:'outreach', requestId:requestId,
    cycleId:cycleId, channel:'voice', providerMessageId:providerCallId,
    expectedProvider:null, recovered:true, message:null, subject:null,
    summary:syntheticRow.summary, synthesizedFromRecoveredTerminal:true };
}

function terminalForPending(pending, row, hamUid) {
  return pending.channel === 'voice'
    ? exactVoiceTerminal(pending, row, hamUid)
    : exactMessageTerminal(pending, row, hamUid);
}

function lifecycleItem(pending, matches) {
  const exact = matches.length === 1 ? matches[0] : null;
  const status = exact ? exact.status : 'PENDING';
  const terminal = exact && exact.row;
  return {
    id:'reach-lifecycle:' + pending.family + ':' + pending.requestId + ':' + pending.cycleId,
    hamUid:pending.row.ham_uid,
    family:pending.family,
    pendingStampType:pending.row.stamp_type,
    status:status,
    providerAccepted:true,
    pendingDelivery:status === 'PENDING',
    delivered:status === 'DELIVERED',
    failed:status === 'FAILED',
    requestId:pending.requestId,
    cycleId:pending.cycleId,
    channel:pending.channel,
    provider:exact ? exact.provider : pending.expectedProvider,
    providerMessageId:pending.providerMessageId,
    providerStatus:exact ? exact.providerStatus : null,
    proofScope:exact ? exact.proofScope : null,
    humanReadConfirmed:exact ? exact.humanReadConfirmed : false,
    message:pending.message,
    subject:pending.subject,
    summary:pending.summary,
    recoveredFromProviderTruth:pending.recovered,
    pendingSource:pending.row.source,
    terminalSource:terminal ? terminal.source : null,
    pendingRowId:pending.row.id == null ? null : pending.row.id,
    terminalRowId:terminal && terminal.id != null ? terminal.id : null,
    pendingAt:pending.row.created_at || null,
    terminalAt:terminal ? (terminal.created_at || null) : null,
    at:terminal && terminal.created_at || pending.row.created_at || null,
    correlationState:matches.length > 1 ? 'terminal_ambiguous'
      : exact ? 'terminal_exact' : 'terminal_unconfirmed'
  };
}

function correlateLifecycleRows(hamUid, pendingRows, terminalRows) {
  const uid = normalizeHamUid(hamUid);
  if (!uid) return emptyView('valid_ham_uid_required');
  const diagnostics = { rejectedPending:0, ambiguousPending:0,
    ambiguousTerminal:0, rejectedTerminal:0, orphanTerminal:0,
    rejectedDecision:0, ambiguousDecision:0 };
  const ownedPending = (Array.isArray(pendingRows) ? pendingRows : []).filter(function (row) {
    return row && row.ham_uid === uid && row.agent_global === 'ANEW';
  });
  const bySource = new Map();
  ownedPending.forEach(function (row) {
    const key = String(row.stamp_type || '') + '|' + String(row.source || '');
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(row);
  });
  const pending = [];
  bySource.forEach(function (rows) {
    if (rows.length !== 1) { diagnostics.ambiguousPending += rows.length; return; }
    const parsed = pendingCandidate(rows[0], uid);
    if (parsed) pending.push(parsed); else diagnostics.rejectedPending++;
  });
  const ownedTerminals = (Array.isArray(terminalRows) ? terminalRows : []).filter(function (row) {
    return row && row.ham_uid === uid && row.agent_global === 'ANEW';
  });
  const persistedPendingSources = new Set(pending.map(function (candidate) {
    return candidate.row.source;
  }));
  const recoveredByPendingSource = new Map();
  ownedTerminals.forEach(function (row) {
    const candidate = recoveredVoicePendingFromTerminal(row, uid);
    if (!candidate || persistedPendingSources.has(candidate.row.source)) return;
    if (!recoveredByPendingSource.has(candidate.row.source)) {
      recoveredByPendingSource.set(candidate.row.source, []);
    }
    recoveredByPendingSource.get(candidate.row.source).push(candidate);
  });
  recoveredByPendingSource.forEach(function (candidates) {
    if (candidates.length !== 1) {
      diagnostics.ambiguousTerminal += candidates.length;
      return;
    }
    pending.push(candidates[0]);
  });
  const matchedTerminalRows = new Set();
  const items = pending.map(function (candidate) {
    const matches = [];
    ownedTerminals.forEach(function (row) {
      const exact = terminalForPending(candidate, row, uid);
      if (exact) {
        matches.push(exact);
        matchedTerminalRows.add(row);
      }
    });
    if (matches.length > 1) diagnostics.ambiguousTerminal += matches.length;
    return lifecycleItem(candidate, matches);
  }).sort(function (a, b) {
    return String(b.at || '').localeCompare(String(a.at || ''));
  });
  // A terminal row is not lifecycle truth merely because it has the right
  // stamp type. It must close one exact pending/provider-attempt identity. Keep
  // unmatched rows visible as diagnostics so an audit can never make unrelated
  // decisions, attempts, and terminals look like one healthy chain.
  ownedTerminals.forEach(function (row) {
    if (!matchedTerminalRows.has(row)) diagnostics.orphanTerminal++;
  });
  const counts = { pending:0, delivered:0, failed:0 };
  items.forEach(function (item) { counts[item.status.toLowerCase()]++; });
  return { ok:true, hamUid:uid, items:items, counts:counts,
    diagnostics:diagnostics };
}

async function readReachLifecycle(hamUid, options) {
  const uid = normalizeHamUid(hamUid);
  if (!uid) return emptyView('valid_ham_uid_required');
  if (!bankUrl() || !bankKey()) return emptyView('reach_lifecycle_store_unconfigured');
  options = options || {};
  try {
    const rows = await Promise.all([
      readRows(uid, 'eq.OUTREACH', 'outreach.pending.', options.pendingLimit || 100),
      readRows(uid, 'eq.DIGEST', 'outreach.digest.pending.', options.pendingLimit || 100),
      readRows(uid, 'in.(OUTREACH_DELIVERY,OUTREACH_FAILURE)', null,
        options.terminalLimit || 300),
      readDecisionRows(uid, options.decisionLimit || 100)
    ]);
    const view = correlateLifecycleRows(uid, rows[0].concat(rows[1]), rows[2]);
    view.decisions = correlateDecisionRows(uid, rows[3], view.diagnostics);
    return view;
  } catch (e) {
    return emptyView(e && e.message === 'reach_lifecycle_read_invalid'
      ? 'reach_lifecycle_read_invalid' : 'reach_lifecycle_read_failed');
  }
}

module.exports = {
  readReachLifecycle:readReachLifecycle,
  _test:{ correlateLifecycleRows:correlateLifecycleRows,
    correlateDecisionRows:correlateDecisionRows, decisionCandidate:decisionCandidate,
    pendingCandidate:pendingCandidate, exactMessageTerminal:exactMessageTerminal,
    exactVoiceTerminal:exactVoiceTerminal,
    recoveredVoicePendingFromTerminal:recoveredVoicePendingFromTerminal,
    expectedMessageTerminalSource:expectedMessageTerminalSource }
};
