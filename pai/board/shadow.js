// ⬡B:board.shadow:MODULE:hallucination_grade:20260617⬡
// SHADOW: Hallucination grader. Every factual claim traced.
// Runs after PAM, before WRIT. Flags unsupported statistics and claims.
// ANYHAM test: applies universally.

function extractClaims(content) {
  // Split on sentence punctuation only when it actually ends a sentence (followed by
  // whitespace or end of text), NEVER on a decimal point inside a number: a bare
  // /[.!?]+/ split "$17,744.67" into "$17,744" and "67", so the money check saw the
  // truncated 17,744 and held a real, exactly-quoted figure. Founder A2, 20260722.
  var sentences = content.split(/[.!?]+(?=\s|$)/).filter(function(s) { return s.trim().length > 10; });
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
  // The value capture must END on a digit, not a comma: a bare `[\d,]*` greedily ate
  // the JSON field-delimiter comma and the trailing `"?` then ate the NEXT field's
  // opening quote, so every OTHER adjacent numeric field was skipped (monthlyNet and
  // projectedBillsTotal never entered the set). `\d(?:[\d,]*\d)?` keeps thousands
  // commas but stops before a trailing delimiter comma. Founder A2, 20260722.
  var reField = /"(?:amount|installmentamount|projectedincometotal|projectedbillstotal|projectedtotal|netprojected|monthlyincometotal|monthlybillstotal|monthlynet|totalincome|totalexpenses|net|livingmoney|balance|monthlytotal)"\s*:\s*"?(\d(?:[\d,]*\d)?(?:\.\d+)?)"?/gi;
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

// Grounded when the value is a real evidence figure -- either the exact number,
// or an HONEST ROUNDING of one. The get_budget_summary result carries every
// legitimate figure as an explicit number (each income source, each bill, AND the
// derived totals and net), so an exact quote is always a direct match. But a person
// asking "roughly how's my budget" gets a rounded answer ("about $17,700", "just
// under $18k"), and that rounded figure is the SAME real number spoken less
// precisely, not an invented one. So a value also grounds when it is a clean round
// (to the nearest 100 or 1000) whose rounding band contains a real evidence figure.
// This is deliberately TIGHT and does NOT reopen the Codex P1 hole (arbitrary sums/
// differences): the value must be an exact multiple of 100 AND a real figure must fall
// within $50 of it, so it can only be a real number spoken to the nearest hundred. We
// deliberately do NOT allow a nearest-1000 band: at $500 half-width it grounds a
// fabricated "$2,000" against a real $1,500 (which legitimately rounds to $2,000), a
// real fabrication hole. So the wall holds any invented figure that is not within $50
// of a real one, while "$17,700" for a real $17,744.67 still grounds. Founder A2, 20260722.
function _roundingBands() { return [[100, 50]]; }
function _isGroundedValue(value, evSet) {
  if (evSet[value]) return true;
  var bands = _roundingBands();
  for (var b = 0; b < bands.length; b++) {
    var step = bands[b][0], half = bands[b][1];
    if (value % step !== 0) continue;           // not a clean round at this precision
    for (var k in evSet) {
      var e = Number(k);
      if (isFinite(e) && e >= value - half && e < value + half) return true;
    }
  }
  return false;
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
  // MONEY must include the decimals: `/\$[\d,]+/` truncated "$17,744.67" to "$17,744"
  // (17744), which never matched the evidence's rounded 17745 and held a real exact quote.
  var MONEY = /\$[\d,]+(?:\.\d+)?/;
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
