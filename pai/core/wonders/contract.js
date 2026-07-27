// ⬡B:core.wonders.contract:MODULE:great_reset_v1:20260720⬡
// The Great Reset Wonder Contract is one executable shape shared by the
// registry, admission guard, CODA sensors, and every later migration wave.
// Unknown and untested state stays explicit. It can never become a pass.
// Identity enters upstream through the ABAHAM door. This pure contract never
// opens an outbound channel; each node must name the gate that returns to HAM.
'use strict';

const VERSION = 'great-reset.wonder-contract.v1';
const KINDS = new Set([
  'wonder', 'independent_thinking_station', 'wonder_agent', 'guardian',
  'sensor', 'tool', 'gate', 'substrate'
]);
const LIFECYCLES = new Set(['active', 'contained', 'planned', 'retired', 'unknown']);
const HAM_SCOPES = new Set(['dynamic', 'inherited', 'system']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateNode(node) {
  const reasons = [];
  const n = node || {};
  if (!nonEmpty(n.id)) reasons.push('id_required');
  if (!nonEmpty(n.display_name)) reasons.push('display_name_required');
  if (!KINDS.has(n.kind)) reasons.push('kind_invalid');
  if (!LIFECYCLES.has(n.lifecycle)) reasons.push('lifecycle_invalid');
  if (!HAM_SCOPES.has(n.ham_scope)) reasons.push('ham_scope_invalid');
  if (!nonEmpty(n.technical_role)) reasons.push('technical_role_required');
  if (!nonEmpty(n.product_role)) reasons.push('product_role_required');
  if (!nonEmpty(n.context_policy)) reasons.push('context_policy_required');
  if (!nonEmpty(n.authority_policy)) reasons.push('authority_policy_required');
  if (!nonEmpty(n.return_gate)) reasons.push('return_gate_required');
  if (!n.cycle || !Array.isArray(n.cycle.triggers) || !nonEmpty(n.cycle.coordinator)) {
    reasons.push('cycle_contract_required');
  }
  const wiring = n.metadata && n.metadata.wiring;
  if (!Array.isArray(wiring)) reasons.push('metadata_wiring_required');
  if ((n.lifecycle === 'active' || n.lifecycle === 'contained') && (!wiring || !wiring.length)) {
    reasons.push('active_wiring_required');
  }
  return { ok: reasons.length === 0, contract_version: VERSION, reasons: reasons };
}

module.exports = {
  VERSION: VERSION,
  KINDS: KINDS,
  LIFECYCLES: LIFECYCLES,
  HAM_SCOPES: HAM_SCOPES,
  validateNode: validateNode
};
