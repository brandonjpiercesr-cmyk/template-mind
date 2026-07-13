// ⬡B:core.safety.world_boundary:MODULE:hard_cross_world_gate:20260708⬡
// entered via the ABAHAM door, serving channel internal
// Phase 0.4 of ANU_LIVE. Cold code, no LLM. Any directive or action that would carry
// one world's data onto another world's surface is hard-blocked, not merely discouraged.
// This is the live-wire equivalent of the sender-identity fix already made real in the
// email layer, applied to the new surface by construction rather than retrofitted after
// a leak. The EBC firewall between founder worlds depends on this holding absolutely.
'use strict';

// A directive is bound to the session's owning HAM. If the directive's payload is
// scoped to a different HAM/world than the session watching the screen, it crosses a
// boundary. The only way across is an explicit, named authorization carried on the
// directive itself (crossWorldAuthorized === true), which is itself a HITL action.
function check(sessionHamUid, directive) {
  const target = directive && (directive.hamUid || directive.targetHamUid);
  if (!sessionHamUid) return { allowed: false, reason: 'no_session_ham' };
  // No target scope on the directive means it is scoped to the session by default: allowed.
  if (!target) return { allowed: true, reason: 'scoped_to_session' };
  if (String(target) === String(sessionHamUid)) return { allowed: true, reason: 'same_world' };
  if (directive.crossWorldAuthorized === true) {
    return { allowed: true, reason: 'explicit_cross_world_authorization', requiresHitl: true };
  }
  return { allowed: false, reason: 'cross_world_block', from: target, to: sessionHamUid };
}

// Hard guard: throws on a blocked crossing so a caller cannot proceed on a false-y check.
function assertSameWorld(sessionHamUid, directive) {
  const r = check(sessionHamUid, directive);
  if (!r.allowed) {
    const e = new Error('WORLD_BOUNDARY: directive scoped to ' + r.from + ' cannot reach session of ' + r.to);
    e.crossWorld = true;
    throw e;
  }
  return r;
}

module.exports = { check, assertSameWorld };
