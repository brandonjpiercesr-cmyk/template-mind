// ⬡B:board.quill:MODULE:quality_gate:20260617⬡
// QUILL: Quality gate. Final review before release.
// Runs after SHADOW and WRIT. Last check before content exits.
// ANYHAM test: applies universally.

async function quill(content, context) {
  context = context || {};
  var issues = [];
  // ⬡B:board.quill:FIX:terse_complete_answer_is_not_too_short:20260719⬡ Founder
  // caught the gaslight live: "what is 5 plus 5" returned "10." (3 chars) and QUILL
  // held it as content_too_short on a cold length<5 floor, so a CORRECT terse answer
  // died and the turn came back ok=false empty. A short answer is not a broken one.
  // Only GENUINELY empty output (nothing real to ship) is a hard mechanical fail;
  // "10", "4", "Yes", "The Lakers." are complete and must pass. The floor drops to
  // "no real characters at all".
  var _trimmed = (content == null ? '' : String(content)).trim();
  if (_trimmed.length === 0) issues.push('content_too_short');
  if (content && content.indexOf('TODO') >= 0) issues.push('has_todo');
  if (content && content.indexOf('placeholder') >= 0) issues.push('has_placeholder');
  if (content && content.indexOf('undefined') >= 0 && content.indexOf('function') < 0) issues.push('undefined_value');
  var score = Math.max(0, 10 - issues.length * 2);
  return {
    ok: issues.length === 0,
    verdict: issues.length === 0 ? 'PASS' : 'HOLD',
    content: content,
    score: score,
    issues: issues,
    reason: issues.length > 0 ? issues.join(', ') : null
  };
}

function runBoardSequence(content, context) {
  // PAM -> SHADOW -> WRIT -> QUILL
  // Returns promise chain result
  return quill(content, context);
}

module.exports = { quill, runBoardSequence };