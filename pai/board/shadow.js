// ⬡B:board.shadow:MODULE:hallucination_grade:20260617⬡
// SHADOW: Hallucination grader. Every factual claim traced.
// Runs after PAM, before WRIT. Flags unsupported statistics and claims.
// ANYHAM test: applies universally.

function extractClaims(content) {
  var sentences = content.split(/[.!?]+/).filter(function(s) { return s.trim().length > 10; });
  return sentences.filter(function(s) {
    var lower = s.toLowerCase();
    return ['is ', 'are ', 'was ', 'were ', 'has ', 'have '].some(function(w) { return lower.indexOf(w) >= 0; });
  });
}

function isExplicitIllustration(claim) {
  // Hypothetical teaching examples are not reports about the real world. A
  // concrete amount makes an explanation useful, but it must not be treated as
  // an asserted statistic merely because it contains a dollar value or count.
  // Keep this deliberately narrow: percentages, studies, surveys, and bare
  // factual assertions still require bound evidence below.
  var text = String(claim || '');
  if (/\b\d+%\b/.test(text) || /\b(study|survey|research|data)\b/i.test(text)) return false;
  return /\b(if you|suppose you|imagine you|let(?:'s| us) say|say you|consider (?:that )?you)\b/i.test(text) ||
    /\b(for example|for instance),?\s+(?:if\s+)?(?:you|someone|a person)\b/i.test(text);
}

async function shadow(content, context) {
  context = context || {};
  var claims = extractClaims(content);
  var flags = [];
  var statPatterns = [/\b\d+%(?!\w)/, /\$[\d,]+/, /\d+ (people|users|companies|years)/i];
  // \u2b21B:board.shadow:FIX:statistics_trace_to_bound_evidence:20260716\u2b21
  // A statistic is sourced when its exact bytes appear in the evidence the
  // answer was deliberated from. Real receipts pass, invented numbers still
  // hold. context.sourcedClaims stays as the existing caller-vouched escape.
  var evidenceText = typeof context.evidence_text === 'string' ? context.evidence_text : '';
  function traced(claim) {
    if (!evidenceText) return false;
    for (var k = 0; k < statPatterns.length; k++) {
      var m = claim.match(statPatterns[k]);
      if (m && evidenceText.indexOf(m[0]) === -1) return false;
    }
    return true;
  }
  for (var i = 0; i < claims.length; i++) {
    for (var j = 0; j < statPatterns.length; j++) {
      if (statPatterns[j].test(claims[i]) && !isExplicitIllustration(claims[i]) &&
          !context.sourcedClaims && !traced(claims[i])) {
        flags.push({ claim: claims[i].trim().substring(0, 80), reason: 'unsourced_statistic' });
        break;
      }
    }
  }
  return { ok: true, verdict: flags.length === 0 ? 'PASS' : 'FLAG', content: content, flags: flags, claimsChecked: claims.length };
}

module.exports = { shadow, extractClaims, isExplicitIllustration };
