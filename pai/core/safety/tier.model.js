// ⬡B:core.safety.tier_model:MODULE:four_mode_action_tiering:20260708⬡
// entered via the ABAHAM door, serving channel internal
// Phase 0.1 of ANU_LIVE. Cold code, no LLM. The four real modes production agent
// systems blend, per the safety research: full autonomous, human-on-the-loop,
// human-in-the-loop, async-approval. Every action A'NU can take over the live wire
// resolves to exactly one mode here. Unknown action types default to the safest mode
// (HITL), never to autonomous, so a new unclassified action can never silently run free.
'use strict';

const MODES = {
  AUTONOMOUS: 'autonomous',   // lowest-stakes, reversible; acts, no gate (e.g. switch visible widget)
  HOTL: 'human_on_the_loop',  // acts but stays interruptible/reversible in a window (e.g. layout change)
  HITL: 'human_in_the_loop',  // must be approved before executing (send, delete, cross-world)
  ASYNC: 'async_approval'     // real and important, not urgent enough to block a live moment
};

// The living registry. Owner is named so this list has an accountable keeper, not a
// silent default. Keys are action types A'NU emits; values are the required mode.
const OWNER = 'Overseer';
const ACTION_TIER_MAP = {
  // Phase 2 directive primitives over the wire
  'surface.create': MODES.HOTL,
  'surface.update_components': MODES.HOTL,
  'surface.update_data': MODES.AUTONOMOUS,
  'surface.delete': MODES.HOTL,
  // Reach / real-world side effects
  'reach.send.text': MODES.HITL,
  'reach.send.email': MODES.HITL,
  'reach.send.voice': MODES.HITL,
  'brain.delete': MODES.HITL,
  'world.cross': MODES.HITL,
  // Background work
  'digest.compose': MODES.ASYNC,
  'draft.prepare': MODES.ASYNC
};

function classify(actionType) {
  if (Object.prototype.hasOwnProperty.call(ACTION_TIER_MAP, actionType)) {
    return { mode: ACTION_TIER_MAP[actionType], known: true, owner: OWNER };
  }
  // Unknown action: fail safe to the strictest gate.
  return { mode: MODES.HITL, known: false, owner: OWNER };
}

function requiresApprovalBeforeExecute(actionType) {
  const m = classify(actionType).mode;
  return m === MODES.HITL || m === MODES.ASYNC;
}

module.exports = { MODES, OWNER, ACTION_TIER_MAP, classify, requiresApprovalBeforeExecute };
