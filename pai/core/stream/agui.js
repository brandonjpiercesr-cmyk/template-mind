// ⬡B:core.stream.agui:BUILD:agui_standard_event_layer_20260711⬡
// entered via the ABAHAM door, serving channel MESSAGES (the glass, her hands)
// AG-UI STANDARD ADOPTION (studied doctrine bead 798). This is the typed-event
// vocabulary the whole GenUI industry standardized on in 2026; our custom
// update_screen was a buggy reinvention of it. This module emits AG-UI-shaped
// events so the glass becomes a dumb, correct PLAYER of typed events instead of a
// parser guessing at ad-hoc shapes. STATE_DELTA (RFC6902 JSON Patch) is the key:
// she recomposes the glass by sending only what changed, never the whole screen.
// Non-breaking: existing update_screen still works; this is the standard path.
'use strict';

// the five AG-UI event families we use (subset of the 17, the ones that fit her glass)
var EV = {
  RUN_STARTED: 'RUN_STARTED', RUN_FINISHED: 'RUN_FINISHED', RUN_ERROR: 'RUN_ERROR',
  TEXT_START: 'TEXT_MESSAGE_START', TEXT_CONTENT: 'TEXT_MESSAGE_CONTENT', TEXT_END: 'TEXT_MESSAGE_END',
  TOOL_START: 'TOOL_CALL_START', TOOL_ARGS: 'TOOL_CALL_ARGS', TOOL_END: 'TOOL_CALL_END', TOOL_RESULT: 'TOOL_CALL_RESULT',
  STATE_SNAPSHOT: 'STATE_SNAPSHOT', STATE_DELTA: 'STATE_DELTA',
  INTERRUPT: 'INTERRUPT', CUSTOM: 'CUSTOM',
};

// build a minimal RFC6902 JSON Patch op set for glass surfaces (add/replace/remove)
function op(o, path, value) { var p = { op: o, path: path }; if (o !== 'remove') p.value = value; return p; }

// translate one of her surface intents into a STATE_DELTA patch against the glass state.
// glass state shape: { background, layout, skywrite, face, cards:[], apps:[] }
function surfaceToDelta(surface) {
  var patch = [];
  if (!surface || typeof surface !== 'object') return patch;
  if (surface.background) patch.push(op('replace', '/background', surface.background));
  if (surface.layout) patch.push(op('replace', '/layout', surface.layout));
  if (surface.skywrite) patch.push(op('replace', '/skywrite', surface.skywrite));
  if (surface.face) patch.push(op('replace', '/face', surface.face)); // position vocabulary
  if (Array.isArray(surface.cards)) surface.cards.forEach(function (c) { patch.push(op('add', '/cards/-', c)); });
  if (Array.isArray(surface.apps)) surface.apps.forEach(function (a) { patch.push(op('add', '/apps/-', a)); });
  return patch;
}

// wrap an event in the AG-UI envelope (type + lightweight payload, one JSON per line)
function event(type, payload) { return Object.assign({ type: type, ts: Date.now() }, payload || {}); }

function stateDelta(surface) { return event(EV.STATE_DELTA, { patch: surfaceToDelta(surface) }); }
function stateSnapshot(state) { return event(EV.STATE_SNAPSHOT, { state: state }); }
function interrupt(reason, action) { return event(EV.INTERRUPT, { reason: reason, action: action }); }

module.exports = { EV, event, stateDelta, stateSnapshot, interrupt, surfaceToDelta };
