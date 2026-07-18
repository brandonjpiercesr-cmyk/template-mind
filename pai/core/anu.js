// ⬡B:core.anu:MODULE:the_voice:20260617⬡
// A'NU -- the voice. The face. The output attached to the reach channel.
// Phase 3: A'NU/A'NEW code split per doctrine.the_bind.v1.20260617.
//
// Full name: A'NU A'NEW
//   First name: A'NU (Alpha apostrophe Nancy Uniform) -- the face, the product
//   Last name: A'NEW (Alpha apostrophe Nancy Echo Wilmington) -- the engine, the company
//
// A'NU reads A'NEW's report and formats it for the reach channel.
// She never runs the cycle herself. She reads what A'NEW produced.
// The reach channel (CARA, VARA, WREN) is A'NU's leash.
//
// The two-lung AIR cycle:
//   A'NEW runs the mind cycle -> stamps result to brain
//   A'NU reads the result -> formats and delivers to the reach channel
//
// CCWA: plain text, markdown-safe
// VARA: voice-optimized -- shorter, more natural cadence, phonetic punctuation
// WREN: SMS -- 160 char limit, no markdown
//
// ANYHAM test: channel formatting is per-channel type, not per-HAM. No identity hardcode.

// Format A'NEW's output for the CCWA chat channel
function formatCcwa(output) {
  if (!output) return '';
  // Strip markdown headers (CCWA renders inline)
  return output
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\u2014/g, ',')   // em dash -> comma (voice law)
    .replace(/--/g, ',')
    .trim();
}

// Format for VARA voice channel -- shorter sentences, natural cadence
function formatVara(output) {
  if (!output) return '';
  var text = formatCcwa(output);
  // Voice: no URLs, no parentheticals longer than 10 words
  text = text.replace(/https?:\/\/\S+/g, 'the link');
  text = text.replace(/\([^)]{60,}\)/g, '');
  // Trim to ~300 chars for voice (natural response length)
  if (text.length > 300) {
    var cut = text.lastIndexOf('.', 300);
    if (cut > 100) text = text.slice(0, cut + 1);
    else text = text.slice(0, 300) + '.';
  }
  return text.trim();
}

// Format for WREN SMS channel -- 160 char hard limit
function formatWren(output) {
  if (!output) return '';
  var text = formatCcwa(output);
  // Strip all markdown
  text = text.replace(/[*_`#]/g, '').trim();
  if (text.length <= 160) return text;
  // Truncate at last word boundary before 157
  var cut = text.lastIndexOf(' ', 157);
  return text.slice(0, cut > 0 ? cut : 157) + '...';
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
    // ⬡B:core.anu:WIRE:even_internal_never_sounds_like_a_grading_sheet:20260718⬡
    // Founder-caught 20260718. Coding/internal artifacts are preserved byte-for-byte
    // (correct for code, CLI flags, Markdown). But an ESCALATION that surfaces to the
    // human rode this same path and reached him as "CODA: read the verdict, decide fix
    // vs respec vs kill" -- a grading sheet, the exact thing the founder killed
    // 20260626. Real code still passes untouched; the only thing applyPersona changes
    // on this path is scrubbing internal/dead names and killing a raw em dash to a
    // comma (WRIT Kill 1), which never occurs in valid code. Her voice holds even here.
    var persona = require('./persona.js');
    return { output: persona.applyPersona(raw), channel: channel || 'ccwa', blocked: false };
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
