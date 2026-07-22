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

// ⬡B:board.shadow:FIX:normalize_money_and_catch_list_formatted_fabrication:20260722⬡
// FOUNDER-CAUGHT, live-verified: asked his budget, A'NU returned a CONFIDENT FAKE
// budget ("Income: $3,200/month", invented bills, different numbers every call) and
// the board PASSED it. Two real holes, both fixed here:
//   (1) extractClaims only ever inspected sentences containing a linking verb
//       (is/are/was/were/has/have). Budget answers are label/list formatted
//       ("Income: $3,200", "Rent: $1,500") with NO linking verb, so every dollar
//       line skipped the stat check entirely and the fabrication sailed through.
//   (2) traced() compared the answer's exact bytes ("$16,037") against the raw
//       evidence, but the get_budget_summary evidence stores raw numbers (16037),
//       so even a REAL, grounded figure failed the exact indexOf and could hold.
// The cure keeps this a COLD deterministic check (no model): normalize every money
// figure to an integer dollar value on both sides, and when the turn actually
// carries budget/financial evidence, scan the WHOLE answer (not just linking-verb
// sentences) for dollar figures and require EVERY one to be a direct match to a real
// money value in the evidence (each source, each bill, and the derived totals/net,
// which get_budget_summary already carries as explicit numbers). Any ungrounded
// figure holds honestly; a real grounded answer (its figures ARE the evidence) passes.
// Scoped to financial-evidence turns so general/public numeric answers are untouched.
function _moneyToInt(tok) {
  var n = parseFloat(String(tok).replace(/[$,\s]/g, ''));
  if (!isFinite(n)) return null;
  return Math.round(n);
}

function _extractMoneyInts(str) {
  var out = [];
  var re = /\$\s?\d[\d,]*(?:\.\d+)?/g, m;
  while ((m = re.exec(String(str || ''))) !== null) {
    var v = _moneyToInt(m[0]);
    if (v !== null && v > 0) out.push(v);
  }
  return out;
}

// Build the set of REAL money values from the evidence. Codex P1 (correct): a
// blanket "every numeral" scan pulled non-money numbers -- due dates, day-of-month,
// counts, years -- into the grounded set, so a fabricated "$15" matched the 15 in a
// date like 2026-07-15. So the set is built from MONEY only: (a) any $-formatted
// figure in prose/notes/incomePosture, and (b) the numeric values of monetary JSON
// fields (amount, the *Total fields, net, totalIncome/Expenses, livingMoney, ...),
// never bare date/day/count/year numerals.
function _evidenceMoneySet(str) {
  var s = String(str || '');
  var set = Object.create(null), m;
  var reDollar = /\$\s?\d[\d,]*(?:\.\d+)?/g;
  while ((m = reDollar.exec(s)) !== null) { var v = _moneyToInt(m[0]); if (v !== null) set[v] = true; }
  var reField = /"(?:amount|installmentamount|projectedincometotal|projectedbillstotal|projectedtotal|netprojected|totalincome|totalexpenses|net|livingmoney|balance|monthlytotal)"\s*:\s*"?(\d[\d,]*(?:\.\d+)?)"?/gi;
  while ((m = reField.exec(s)) !== null) { var v2 = _moneyToInt(m[1]); if (v2 !== null) set[v2] = true; }
  return set;
}

// The turn carries financial evidence when the budget tool ran -- whether it
// returned real figures OR the empty-budget shape. Codex P1 (correct): the empty
// get_budget_summary result ("No budget is set up yet...") has none of the field
// markers, so without this a label-form fabrication ("Income: $3,200") would PASS
// precisely when the real result says no numbers exist. Detect the empty shape and
// the tool name too, so the money scan runs and holds any invented figure.
function _hasFinancialEvidence(evidenceText) {
  return /projectedIncomeTotal|projectedBillsTotal|incomePosture|recurringBills|incomeSources|netProjected|BUDGET_CONFIG|BUDGET_TX|get_budget_summary|no budget is set up yet/i.test(String(evidenceText || ''));
}

// Grounded ONLY if the exact value is present in the real evidence. The
// get_budget_summary result already carries every legitimate figure as an
// explicit number -- each income source, each bill, AND the derived totals and
// net (projectedIncomeTotal, projectedBillsTotal, netProjected) -- so a truly
// grounded answer is always a direct match. Codex P1s (correct): DO NOT treat an
// arbitrary sum or difference of two evidence numbers as grounded -- that falsely
// grounds fabrication (e.g. "rent $2,000" passing because income 5,000 minus
// bills 3,000 = 2,000 with no real rent). Real derived values are already explicit
// evidence numbers, so direct-match is both sufficient and safe.
function _isGroundedValue(value, evSet) {
  return !!evSet[value];
}

// Financial fabrication: with budget evidence present, EVERY dollar figure in the
// answer must trace to a real evidence number. Codex P1 (correct): a majority
// threshold let a mostly-real answer smuggle one invented line through (real
// income/bills/rent + a fake "Car: $999" was 3/4 grounded, so it passed). For the
// founder's own money a single ungrounded figure is a fabrication and must hold.
// So: flag whenever ANY dollar figure is ungrounded. She quotes his real figures
// (all direct matches) or holds honestly; no invented dollar ever reaches him.
function financialFabricationFlags(content, evidenceText) {
  if (!_hasFinancialEvidence(evidenceText)) return [];
  var answerMoney = _extractMoneyInts(content);
  if (!answerMoney.length) return [];
  var evSet = _evidenceMoneySet(evidenceText);
  var ungrounded = [];
  for (var i = 0; i < answerMoney.length; i++) {
    if (!_isGroundedValue(answerMoney[i], evSet)) ungrounded.push(answerMoney[i]);
  }
  if (ungrounded.length) {
    return [{
      claim: 'dollar figure(s) not grounded in real budget evidence: $' + ungrounded.slice(0, 6).join(', $'),
      reason: 'fabricated_financial_figures'
    }];
  }
  return [];
}

async function shadow(content, context) {
  context = context || {};
  var claims = extractClaims(content);
  var flags = [];
  var MONEY = /\$[\d,]+/;
  var statPatterns = [/\b\d+%(?!\w)/, MONEY, /\d+ (people|users|companies|years)/i];
  // ⬡B:board.shadow:FIX:statistics_trace_to_bound_evidence:20260716⬡
  // A statistic is sourced when its exact bytes appear in the evidence the
  // answer was deliberated from. Real receipts pass, invented numbers still
  // hold. context.sourcedClaims stays as the existing caller-vouched escape.
  var evidenceText = typeof context.evidence_text === 'string' ? context.evidence_text : '';
  var evSet = _evidenceMoneySet(evidenceText);
  function traced(claim) {
    if (!evidenceText) return false;
    for (var k = 0; k < statPatterns.length; k++) {
      var m = claim.match(statPatterns[k]);
      if (!m) continue;
      // Money is traced by normalized VALUE (strip $ and commas), so a real
      // "$16,037" matches evidence "16037" instead of failing an exact byte
      // compare. Non-money stats keep the exact-bytes rule.
      if (statPatterns[k] === MONEY) {
        var v = _moneyToInt(m[0]);
        if (v === null || !_isGroundedValue(v, evSet)) return false;
      } else if (evidenceText.indexOf(m[0]) === -1) {
        return false;
      }
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
  // Catch the list/label-formatted budget fabrication that never reaches the
  // linking-verb claim extractor above. Scoped to financial-evidence turns.
  if (!context.sourcedClaims) {
    flags = flags.concat(financialFabricationFlags(content, evidenceText));
  }
  return { ok: true, verdict: flags.length === 0 ? 'PASS' : 'FLAG', content: content, flags: flags, claimsChecked: claims.length };
}

module.exports = { shadow, extractClaims, isExplicitIllustration };
