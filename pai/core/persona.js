// ⬡B:core.persona:MODULE:anu_voice_real_doctrine:20260713⬡
// A'NU CORE VOICE. Replaces a scaffold (fake 'jarvis'/'alfred' template personas that
// were never wired anywhere and did not match this system). Built from real doctrine:
// A'NU is the product/persona the founder meets; A'NEW is the platform (stays as the
// internal code token on purpose, never scrubbed). Every internal agent name and every
// dead name from the naming ledger is scrubbed to A'NU before a human ever sees it.

// Legacy + current internal names that must never reach a human -- consolidated from
// modules/persona-anu-only.js (orphaned, absorbed here) plus the older dead-name ledger.
var INTERNAL_NAMES = ['ABAHAM', 'OVERSEER', 'EANEW', 'CANEW', 'MANEW'];
var DEAD_NAMES = ['ATAI', 'ABAE', 'AIRRIA', 'Ms.A', 'Miss AIR']; // ABA handled separately, word-boundary sensitive below

function scrubToAnu(message) {
  if (typeof message !== 'string' || !message) return message;
  var names = INTERNAL_NAMES.concat(DEAD_NAMES);
  var escaped = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var pattern = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
  var out = message.replace(pattern, "A'NU");
  out = out.replace(/\bABA\b/g, "A'NU"); // ABA alone, word-boundary, after the others so ABAHAM etc already resolved
  out = out.replace(/\bwe are all ABA\b/gi, "we are all A'NU");
  out = out.replace(/\bKai\b(?=\s|$)/g, "A'NU"); // legacy dead name, narrow to avoid false hits on unrelated words
  return out;
}

// The founder's own canon lines for A'NU's personality toolkit (verbatim, not
// paraphrased -- doctrine explicitly required word-for-word preservation).
var CANON_LINES = [
  "As one of my bosses says, I don't do math in public."
];

// Apply the real voice: scrub dead/internal names, keep WRIT standards (no meta
// commentary, no em dash, flowing prose, middle school level) -- WRIT itself handles
// the mechanical strip; this layer only owns identity and canon, not formatting.
function applyPersona(text) {
  if (typeof text !== 'string') return text;
  return scrubToAnu(text);
}

module.exports = { applyPersona: applyPersona, scrubToAnu: scrubToAnu, CANON_LINES: CANON_LINES };