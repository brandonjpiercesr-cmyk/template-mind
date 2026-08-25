// ⬡B:board.quill:MODULE:quality_gate:20260617⬡
// QUILL: Quality gate. Final review before release.
// Runs after SHADOW and WRIT. Last check before content exits.
// ANYHAM test: applies universally.

async function quill(content, context) {
  context = context || {};
  var issues = [];
  var hints = [];
  // ⬡B:board.quill:FIX:terse_complete_answer_is_not_too_short:20260719⬡ Founder
  // caught the gaslight live: "what is 5 plus 5" returned "10." (3 chars) and QUILL
  // held it as content_too_short on a cold length<5 floor, so a CORRECT terse answer
  // died and the turn came back ok=false empty. A short answer is not a broken one.
  // Only GENUINELY empty output (nothing real to ship) is a hard mechanical fail;
  // "10", "4", "Yes", "The Lakers." are complete and must pass. The floor drops to
  // "no real characters at all".
  var _trimmed = (content == null ? '' : String(content)).trim();
  if (_trimmed.length === 0) issues.push('content_too_short');
  // ⬡B:board.quill:FIX:a_word_is_a_detection_the_healer_weighs_never_a_verdict:20260825⬡
  // Three bare substrings (TODO, placeholder, undefined) and the word NaN used to HOLD a
  // long-form or external deliverable on their own, and the heal loop re-judged the mind's
  // rewrite with the same cold indexOf, so a document that legitimately discusses the
  // person's TODOs or explains that a value "comes back undefined" could NEVER ship unless
  // a mind stripped the load-bearing word. That is a pattern deciding meaning. These four
  // are now HINTS: detections carried on the receipt for the mind that reads it, moving no
  // verdict. The four checks kept below as issues are a different species: shape validation
  // of a broken render (nothing real to ship, a stringified object, an unrendered template
  // marker, a greeting addressed to a literal null), machine facts about machine breakage
  // that no reading of the sentence can redeem.
  if (content && content.indexOf('TODO') >= 0) hints.push({ type: 'has_todo', phrase: 'TODO' });
  if (content && content.indexOf('placeholder') >= 0) hints.push({ type: 'has_placeholder', phrase: 'placeholder' });
  if (content && content.indexOf('undefined') >= 0 && content.indexOf('function') < 0) hints.push({ type: 'undefined_value', phrase: 'undefined' });
  // ⬡B:board.quill:FIX:catch_broken_template_leaks_reaching_a_human:20260724⬡
  // A final gate must catch the classic "the template broke and shipped anyway"
  // tells that embarrass in front of a real person, the same class as the
  // undefined leak above: a stringified object, an unrendered mustache or template
  // literal, or a greeting that kept the raw null/undefined where the
  // name should be. High-signal only, so "null and void" and code discussions pass.
  var _body = (content == null ? '' : String(content));
  if (/\[object Object\]/.test(_body)) issues.push('object_object_leak');
  if (/\{\{[^{}]+\}\}/.test(_body) || /\$\{[^{}]+\}/.test(_body)) issues.push('unrendered_template');
  // NaN is a word a person legitimately writes when explaining a spreadsheet or code result,
  // so it is a hint like the three above, not a broken-render fact like [object Object].
  if (/\bNaN\b/.test(_body)) hints.push({ type: 'nan_value', phrase: 'NaN' });
  if (/\b(?:dear|hi|hello|hey)\s+(?:null|undefined)\b/i.test(_body)) issues.push('greeting_value_leak');
  var score = Math.max(0, 10 - issues.length * 2);
  return {
    ok: issues.length === 0,
    verdict: issues.length === 0 ? 'PASS' : 'HOLD',
    content: content,
    score: score,
    issues: issues,
    hints: hints,
    reason: issues.length > 0 ? issues.join(', ') : null
  };
}

function runBoardSequence(content, context) {
  // PAM -> SHADOW -> WRIT -> QUILL
  // Returns promise chain result
  return quill(content, context);
}

module.exports = { quill, runBoardSequence };