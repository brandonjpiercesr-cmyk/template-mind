// ⬡B:core.anu:MODULE:the_voice:20260617⬡
// A'NU -- the voice. The face. The output attached to the reach channel.
// Phase 3: A'NU/A'NEW code split per doctrine.the_bind.v1.20260617.
//
// Full name: A'NU A'NEW
//   First name: A'NU (Alpha apostrophe Nancy Uniform) -- the face, the product
//   Last name: A'NEW (Alpha apostrophe Nancy Echo Wilmington) -- the engine, the company
//
// A'NU reads A'NEW's final expression and carries its exact bytes to the reach channel.
// She never runs the cycle herself. She reads what A'NEW produced.
// The reach channel (CARA, VARA, WREN) is A'NU's leash.
//
// The two-lung AIR cycle:
//   A'NEW runs the mind cycle -> stamps result to brain
//   A'NU reads the result -> formats and delivers to the reach channel
//
// Channel transport may encode or wrap these bytes. It never rewrites them.
//
// ANYHAM test: channel formatting is per-channel type, not per-HAM. No identity hardcode.

// Format A'NEW's output for the CCWA chat channel
function formatCcwa(output) {
  return output == null ? '' : String(output);
}

// Format for VARA voice channel -- shorter sentences, natural cadence
function formatVara(output) {
  return formatCcwa(output);
}

// Format for WREN text delivery. Blooio sends iMessage and does not inherit the
// 160 character limit of one SMS segment. Keep destination length policy in the
// existing format matrix so A'NU has one formatter, not two conflicting caps.
function formatWren(output) {
  return formatCcwa(output);
}

// speak: the single A'NU entry point
// Takes A'NEW's raw result and returns channel-formatted output
function speak(anewResult, channel, context) {
  var raw = (anewResult && anewResult.result && anewResult.result.pendingOutbound) || '';
  if (!raw) return { output: '', channel: channel, blocked: true };

  var blocked = !!(anewResult.result && anewResult.result.pamBlocked);
  if (blocked) return { output: '[blocked]', channel: channel, blocked: true };

  // ⬡B:core.anu:GUARD:coding_expression_preserves_artifact_bytes:20260715⬡
  // Coding and internal artifacts already passed WRIT's fence-aware law. A'NU
  // contributes by explicitly selecting the builder expression, whose correct
  // channel form is byte-for-byte preservation, including Markdown and CLI flags.
  context = context || {};
  var mode = String(context.mode || '').toLowerCase();
  if (mode === 'coding' || mode === 'internal' || context.internal === true) {
    return { output: raw, channel: channel || 'ccwa', blocked: false };
  }

  // ⬡B:core.anu:WIRE:channel_classifier_20260711⬡ the canonical classifier
  // (was orphaned) maps ANY channel name (phone, email_bdif, sms...) to its family,
  // so the face formats correctly no matter what channel string arrives.
  var family = 'ccwa';
  try { family = require('./channel.classifier').classifyChannel(channel || 'ccwa'); } catch (e) {}
  var output;
  switch (family) {
    case 'voice':  output = formatVara(raw); break;
    case 'wren':   output = formatWren(raw); break;
    case 'email':  output = formatCcwa(raw); break;
    default:       output = formatCcwa(raw); break;
  }

  return { output: output, channel: channel || 'ccwa', blocked: false };
}

module.exports = {
  speak: speak,
  formatCcwa: formatCcwa,
  formatVara: formatVara,
  formatWren: formatWren
};
