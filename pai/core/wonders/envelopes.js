// ⬡B:core.wonders.envelopes:MODULE:great_reset_minimum_envelopes_v1:20260720⬡
// These envelopes carry identity and authority across the first CODA vertical
// slice. Builders fail closed instead of inventing a HAM, parent, owner, budget,
// or return path for the caller.
// The caller receives HAM from the ABAHAM door. These pure builders do not send
// outbound messages; they preserve the registered return gate for that channel.
'use strict';

const VERSION = 'great-reset.envelopes.v1';
const AUTHORITY_LEVELS = new Set(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
const MAX_EVIDENCE_REFS = 32;
// A ceiling, never a duration. A deliberating wonder chooses how long it is holding a
// subject it has already examined; this only rejects a value so large it is corruption or
// injection rather than a choice. Lives here because the resolution parser, the result
// contract and the sensor store must all agree on one number.
const MAX_SUBJECT_QUIET_MINUTES = 20160;

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + '_required');
  return value.trim();
}

function evidenceRefs(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_REFS ||
      value.some(function (ref) {
        return typeof ref !== 'string' || !ref.trim() || ref.length > 500;
      })) throw new Error('evidence_refs_invalid');
  return value.slice();
}

function lineage(input) {
  const value = input || {};
  const budget = value.budget || {};
  if (!(budget.max_iterations > 0)) throw new Error('budget_max_iterations_required');
  const unlimitedLlmCalls=budget.unlimited_llm_calls === true;
  if (unlimitedLlmCalls) {
    if (budget.max_llm_calls !== null) throw new Error('budget_max_llm_calls_unlimited_invalid');
  } else if (budget.max_llm_calls == null ||
      !Number.isFinite(Number(budget.max_llm_calls)) || Number(budget.max_llm_calls) < 0) {
    throw new Error('budget_max_llm_calls_required');
  }
  const normalizedBudget={max_iterations:Number(budget.max_iterations),
    max_llm_calls:unlimitedLlmCalls ? null : Number(budget.max_llm_calls)};
  // Additive and dual-readable inside v1: legacy numeric envelopes retain their exact
  // two-field shape; only the new nullable form carries the discriminator that makes null
  // unambiguous to every current reader.
  if (unlimitedLlmCalls) normalizedBudget.unlimited_llm_calls=true;
  return Object.freeze({
    envelope_version: VERSION,
    root_cycle_id: required(value.root_cycle_id, 'root_cycle_id'),
    parent_cycle_id: required(value.parent_cycle_id, 'parent_cycle_id'),
    spawner_node_id: required(value.spawner_node_id, 'spawner_node_id'),
    ham_uid: required(value.ham_uid, 'ham_uid').toUpperCase(),
    reason: required(value.reason, 'reason'),
    idempotency_key: required(value.idempotency_key, 'idempotency_key'),
    return_gate: required(value.return_gate, 'return_gate'),
    budget:Object.freeze(normalizedBudget)
  });
}

function authority(input) {
  const value = input || {};
  const level = required(value.level, 'authority_level').toUpperCase();
  if (!AUTHORITY_LEVELS.has(level)) throw new Error('authority_level_invalid');
  return Object.freeze({
    envelope_version: VERSION,
    level: level,
    actor_node_id: required(value.actor_node_id, 'actor_node_id'),
    granted_by: required(value.granted_by, 'granted_by'),
    scope: required(value.scope, 'authority_scope'),
    approval_id: value.approval_id ? String(value.approval_id) : null
  });
}

function sensorEvent(input) {
  const value = input || {};
  const hamUid = required(value.ham_uid, 'ham_uid').toUpperCase();
  const eventLineage = lineage(value.lineage);
  if (eventLineage.ham_uid !== hamUid) throw new Error('sensor_event_lineage_ham_mismatch');
  return Object.freeze({
    envelope_version: VERSION,
    event_id: required(value.event_id, 'event_id'),
    event_type: required(value.event_type, 'event_type'),
    ham_uid: hamUid,
    sender_node_id: required(value.sender_node_id, 'sender_node_id'),
    provider: required(value.provider, 'provider'),
    provider_delivery_id: required(value.provider_delivery_id, 'provider_delivery_id'),
    occurred_at: required(value.occurred_at, 'occurred_at'),
    received_at: required(value.received_at, 'received_at'),
    payload_ref: required(value.payload_ref, 'payload_ref'),
    lineage: eventLineage
  });
}

function wonderResult(input) {
  const value = input || {};
  const statuses = new Set(['SUCCEEDED', 'FAILED', 'HELD', 'NEEDS_HUMAN', 'SUPERSEDED', 'DEAD_LETTER']);
  const status = required(value.status, 'result_status').toUpperCase();
  if (!statuses.has(status)) throw new Error('result_status_invalid');
  const hamUid = required(value.ham_uid, 'ham_uid').toUpperCase();
  const resultLineage = lineage(value.lineage);
  if (resultLineage.ham_uid !== hamUid) throw new Error('wonder_result_lineage_ham_mismatch');
  return Object.freeze({
    envelope_version: VERSION,
    result_id: required(value.result_id, 'result_id'),
    node_id: required(value.node_id, 'node_id'),
    ham_uid: hamUid,
    status: status,
    summary: required(value.summary, 'summary'),
    evidence_refs: evidenceRefs(value.evidence_refs),
    lineage: resultLineage,
    completed_at: required(value.completed_at, 'completed_at')
  });
}

module.exports = {
  VERSION: VERSION,
  MAX_EVIDENCE_REFS: MAX_EVIDENCE_REFS,
  MAX_SUBJECT_QUIET_MINUTES: MAX_SUBJECT_QUIET_MINUTES,
  AUTHORITY_LEVELS: AUTHORITY_LEVELS,
  lineage: lineage,
  authority: authority,
  sensorEvent: sensorEvent,
  wonderResult: wonderResult
};
