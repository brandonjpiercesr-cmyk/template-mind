// ⬡B:core.stream.reflex:MODULE:cold_layout_reflexes_c0:20260709⬡
// entered via the ABAHAM door, serving channel MESSAGES (the screen answers the founder's hands)
// THE JARVIS SPEED, penny hustle made literal. When a real UI event arrives from a
// portal (voice clicked, call started, focus asked), the screen should MOVE before
// any model finishes a token. These are the founder's "cheap pre-sender things":
// cold C0 reflexes — event type in, a described layout preset out, pushed down the
// same wire in milliseconds. No LLM anywhere in this file. The event ALSO lands as
// a bead, so she is peeping: her cycle sees what happened and can follow the reflex
// with a real deliberate re-composition. Reflex is the flinch; the cycle is the mind.
// Presets are DESCRIPTIONS (grid areas + which regions live), never code —
// describe-not-execute holds the same as every other directive.
'use strict';

// The preset library. Each preset names the grid the canvas should become.
// areas use CSS grid-template-area rows; regions list which named areas render.
const PRESETS = {
  triptych: {
    name: 'triptych',
    areas: ['left center right'],
    columns: '1fr 1.6fr 1fr',
    regions: ['left', 'center', 'right'],
    note: 'CARA left, the moment center, her widgets right. The default standing.'
  },
  intimate_call: {
    name: 'intimate_call',
    areas: ['center'],
    columns: '1fr',
    regions: ['center'],
    note: 'A call is live. Chat folds away, one warm surface, voice is the room.'
  },
  focus: {
    name: 'focus',
    areas: ['center right'],
    columns: '2.2fr 1fr',
    regions: ['center', 'right'],
    note: 'Deep work. The thing being worked on, and only her most vital widgets.'
  },
  ambient: {
    name: 'ambient',
    areas: ['full'],
    columns: '1fr',
    regions: ['full'],
    note: 'Nothing demanded. The world breathes on the glass until something matters.'
  }
};

// Event type -> the instant move. Unknown events reflex to nothing (stamp-only);
// silence over a wrong flinch, always.
const REFLEX_MAP = {
  'voice_call_started': 'intimate_call',
  'voice_clicked': 'intimate_call',
  'voice_call_ended': 'triptych',
  'focus_requested': 'focus',
  'canvas_opened': 'triptych',
  'idle': 'ambient'
};

function reflexFor(eventType) {
  const presetName = REFLEX_MAP[String(eventType || '')];
  if (!presetName) return null;
  return PRESETS[presetName] || null;
}

// Build the layout directive the canvas applies. Rides updateComponents on a
// reserved layout surface, so the existing vocabulary and gates cover it whole.
function layoutDirective(preset) {
  const vocab = require('../directive/vocabulary');
  return vocab.updateComponents('__layout__', [
    { type: 'layout', preset: preset.name, areas: preset.areas, columns: preset.columns, regions: preset.regions }
  ]);
}

module.exports = { PRESETS, REFLEX_MAP, reflexFor, layoutDirective };
