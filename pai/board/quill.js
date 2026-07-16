// ⬡B:board.quill:MODULE:quality_gate:20260617⬡
// QUILL: Quality gate. Final review before release.
// Runs after SHADOW and WRIT. Last check before content exits.
// ANYHAM test: applies universally.

async function quill(content, context) {
  context = context || {};
  var issues = [];
  if (!content || content.trim().length < 5) issues.push('content_too_short');
  if (content.indexOf('TODO') >= 0) issues.push('has_todo');
  if (content.indexOf('placeholder') >= 0) issues.push('has_placeholder');
  if (content.indexOf('undefined') >= 0 && content.indexOf('function') < 0) issues.push('undefined_value');
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