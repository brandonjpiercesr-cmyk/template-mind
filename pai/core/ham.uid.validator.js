// ⬡B:core.ham.uid.validator:MODULE:ham_uid_format_validator:20260617⬡
// ⬡B:clair.ruling:CANONICAL-GUARDIAN:validator_wire_when_a_caller_needs_it:20260711⬡ CLAIR+A’NEW: canonical guardian (validator/gate/split-guard). Keep; wire into the cycle when a live caller needs it. Never delete.
// Validates HAM UID strings. A HAM UID is exactly 8 uppercase hex characters.
// ANYHAM test: pure utility. No HAM identity. Any caller can use it.
// No requires. No external calls. Pure JavaScript.

var HAM_UID_PATTERN = /^[0-9A-F]{8}$/;

function isValidHamUid(uid) {
  if (!uid || typeof uid !== 'string') return false;
  return HAM_UID_PATTERN.test(uid.toUpperCase());
}

function normalizeHamUid(uid) {
  if (!uid || typeof uid !== 'string') return null;
  var upper = uid.toUpperCase();
  if (!HAM_UID_PATTERN.test(upper)) return null;
  return upper;
}

module.exports = { isValidHamUid: isValidHamUid, normalizeHamUid: normalizeHamUid };