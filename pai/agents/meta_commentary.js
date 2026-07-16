// ⬡B:agents.meta_commentary:MODULE:voice_guard_v2:20260615⬡
// META_COMMENTARY v2 — Legendary Doctrine upgrade.
// Compares the ORIGINAL PROMPT against the outbound.
// Strips: stuff that explains the AI assignment (not for the human).
// Bad patterns: meta-commentary, contrasting, calling out errors, AI announcements.
// Doctrine: "the meta commentary agent must run in advance and separate assignment from context."

var BAD_PATTERNS = [
  /as an ai/i, /as a language model/i, /i should note/i, /it's worth noting/i,
  /i want to clarify/i, /let me note/i, /please note/i, /i will now/i,
  /i'm going to/i, /i'll provide/i, /let me tell you/i, /i've noticed that/i,
  /originally.{0,30}said/i, /previous.{0,20}version/i,
  /correct(ed|ing).{0,30}(error|mistake)/i, /apolog/i
];

async function handle(turn, result) {
  if (!result.pendingOutbound || result.pamBlocked) return result;

  var outbound = result.pendingOutbound;
  var intent = turn.intent || '';
  var violations = [];

  // 1. Pattern scan — strip meta announcements
  var cleaned = outbound;
  BAD_PATTERNS.forEach(function(p) {
    if (p.test(cleaned)) {
      violations.push(p.toString().slice(1, 30));
      // strip the matching sentence
      cleaned = cleaned.replace(p, '').replace(/^[,.\s]+/, '').trim();
    }
  });

  // 2. Prompt vs deliverable check — if the outbound contains task framing from the original prompt
  // (words like "build", "create", "write a", "here is what I will do") that belong to the assignment,
  // not the answer, flag and strip.
  var taskFraming = /^(here is|here's|i have|i've|below is|the following|as requested|as you asked|sure[,!]|certainly[,!]|of course[,!])/i;
  if (taskFraming.test(cleaned)) {
    violations.push('task-framing opener');
    cleaned = cleaned.replace(taskFraming, '').replace(/^[,.\s]+/, '').trim();
    // capitalize first letter
    if (cleaned.length > 0) cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }

  if (violations.length > 0 && cleaned.length > 20) {
    result.pendingOutbound = cleaned;
  }
  result.metaCommentaryFlag = violations.length > 0 ? violations : null;
  return result;
}

module.exports = { handle: handle };
