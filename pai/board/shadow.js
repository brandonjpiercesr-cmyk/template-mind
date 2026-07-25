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
    var linking = ['is ', 'are ', 'was ', 'were ', 'has ', 'have '].some(function(w) {
      return lower.indexOf(w) >= 0;
    });
    // A statistical claim does not stop being a claim because it uses an action
    // verb ("pays $9,999") or a label ("Balance: $9,999"). Inspect the same
    // three finite shapes regardless of grammar; illustration checks still run
    // before any flag is emitted.
    var statistic = /\b\d+%(?!\w)|\$[\d,]+(?:\.\d+)?[kKmM]?|\d+ (?:people|users|companies|years)\b/i
      .test(s);
    return linking || statistic;
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
  var str = String(tok);
  // Shorthand suffix: "$213k" is $213,000 and "$1.2m" is $1,200,000. A suffix adjacent to the
  // number scales it; without this "$213k" parsed as 213 and a real annual figure held.
  var mult = /\d[kK]\s*$/.test(str) ? 1000 : (/\d[mM]\s*$/.test(str) ? 1000000 : 1);
  var n = parseFloat(str.replace(/[$,\s]/g, '').replace(/[kKmM]$/, ''));
  if (!isFinite(n)) return null;
  return Math.round(n * mult);
}

function _extractMoneyInts(str) {
  var out = [];
  var re = /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?/g, m;
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
  var reDollar = /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?/g;
  while ((m = reDollar.exec(s)) !== null) { var v = _moneyToInt(m[0]); if (v !== null) set[v] = true; }
  // The value capture must END on a digit, not a comma: a bare `[\d,]*` greedily ate
  // the JSON field-delimiter comma and the trailing `"?` then ate the NEXT field's
  // opening quote, so every OTHER adjacent numeric field was skipped (monthlyNet and
  // projectedBillsTotal never entered the set). `\d(?:[\d,]*\d)?` keeps thousands
  // commas but stops before a trailing delimiter comma. Founder A2, 20260722.
  var reField = /"(?:amount|installmentamount|projectedincometotal|projectedbillstotal|projectedtotal|netprojected|monthlyincometotal|monthlybillstotal|monthlynet|annualincometotal|annualbillstotal|annualnet|totalincome|totalexpenses|net|livingmoney|balance|monthlytotal)"\s*:\s*"?(\d(?:[\d,]*\d)?(?:\.\d+)?)"?/gi;
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
// allow a nearest-1000 band ONLY for large figures (>= $10,000): at that magnitude a real
// figure sits within $500 of at most one clean thousand, and this person's large figures are
// sparse, so a fabrication almost never lands in a band -- while "$213,000" for a real annual
// $212,936 grounds. At small magnitudes nearest-1000 is unsafe (it grounds a fabricated
// "$2,000" against a real $1,500, which legitimately rounds to $2,000), so small figures keep
// the tight nearest-100 band only. The wall holds any invented figure not within one honest
// rounding step of a real one, at either scale. Founder A2, 20260722.
function _roundingBands(value) {
  return value >= 10000 ? [[100, 50], [1000, 500]] : [[100, 50]];
}
function _isGroundedValue(value, evSet) {
  if (evSet[value]) return true;
  var bands = _roundingBands(value);
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

// ⬡B:board.shadow:FIX:count_fabrication_requires_matching_cardinality_evidence:20260724⬡
// A confident COUNT with no backing is the exact fabrication SHADOW exists to stop:
// "I found 47 blocks to remove", "3 tests failing", "5 files changed". The stat check
// above only guarded a tiny closed noun set (people|users|companies|years) AND only
// inside linking-verb sentences, so a count of ANY other discrete item -- and any count
// in a found/there-are/changed frame with no linking verb -- was never even extracted as
// a claim and sailed through as PASS. This adds a COLD cardinality check: a count claim
// of N discrete items HOLDS unless the evidence relay actually backs N, either by carrying
// the figure N itself or by enumerating at least N distinct items naming the counted noun.
// No judgment -- transport and counting only, which is cold code's proper job. The label is
// shadow_count_unverified so a held count is named honestly. context.sourcedClaims stays the
// caller-vouched override, exactly as the money and statistics checks above honor it.

// Number words plus digit runs. A "count of discrete items" is an integer >= 2 (a singular
// "1 file"/"a file" is not a plural cardinality claim, and a decimal like "3.5 files" is a
// measure, not a discrete count, so both are left alone).
var _COUNT_NUMBER_WORDS = { two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17,
  eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70,
  eighty:80, ninety:90, hundred:100, thousand:1000 };
// Duration/measure nouns are spans, not enumerable found-items; "2 years" or "30 minutes"
// is not a count of discrete verifiable things and must never be held as one.
var _COUNT_DURATION_NOUNS = /^(seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?|centuries|century|dollars?|cents?|bucks?|percent|times?|ways?|means|series|kinds?|sorts?)$/i;
// The four nouns the linking-verb statistics check already owns stay its sole responsibility:
// one source, no double-flag on the same "12 users".
var _COUNT_STAT_OWNED = /^(people|users|companies|years)$/i;
// Nouns that are inherently enumerated claim-items: a number in front of one is a count claim
// on its own, no framing verb needed.
var _COUNT_ITEM_NOUNS = /^(tests?|files?|blocks?|errors?|warnings?|bugs?|issues?|records?|rows?|results?|items?|entries|entry|matches|match|occurrences?|instances?|changes?|commits?|functions?|methods?|lines?|tables?|columns?|fields?|endpoints?|routes?|duplicates?|violations?|failures?|steps?|tasks?|dependencies|dependency|packages?|modules?|references?|callers?|imports?|exports?|variables?|classes|class|components?|handlers?|places?|locations?|sections?|paragraphs?|documents?|beads?)$/i;
// Otherwise a plural noun is a count claim only inside a finding/enumeration frame.
var _COUNT_ENUM_FRAME = /\b(found|find|finds|identified|identify|identifies|detect(?:ed|s)?|count(?:ed|s)?|list(?:ed|s)?|return(?:ed|s)?|flag(?:ged|s)?|remov(?:ed|es|e)|delet(?:ed|es|e)|chang(?:ed|es|e)|fail(?:ing|ed|s)?|pass(?:ing|ed|es)?|remain(?:ing|ed|s)?|there\s+(?:are|were|is|was))\b/i;

function _countValue(token) {
  var t = String(token).toLowerCase().replace(/,/g, '');
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(_COUNT_NUMBER_WORDS, t)) return _COUNT_NUMBER_WORDS[t];
  return null;
}

function _countSentence(content, index) {
  var start = 0, end = content.length;
  for (var a = index; a > 0; a--) { if (/[.!?\n]/.test(content[a - 1])) { start = a; break; } }
  for (var b = index; b < content.length; b++) { if (/[.!?\n]/.test(content[b])) { end = b; break; } }
  return content.slice(start, end);
}

// A count is backed only two honest, cold ways: (a) the evidence relay carries the figure N
// itself (the relay reported the count), or (b) the relay enumerates at least N distinct
// lines that name the counted noun (counting the actual items). Neither present -> unverified.
// With no evidence relay at all, nothing backs the count, so it fails closed and HOLDS.
function _countBacked(n, token, nounLower, evidenceText) {
  if (!evidenceText) return false;
  var digit = String(n);
  var reNum = new RegExp('(^|[^\\d.,])' + digit + '(?![\\d.,])');
  if (reNum.test(evidenceText)) return true;
  if (!/^\d/.test(token) && new RegExp('\\b' + token.toLowerCase() + '\\b', 'i').test(evidenceText)) return true;
  var stem = nounLower.replace(/(ies|es|s)$/, '');
  if (stem.length < 3) return false;
  var lines = String(evidenceText).split(/\r?\n/), hits = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim().length && lines[i].toLowerCase().indexOf(stem) >= 0) hits++;
  }
  return hits >= n;
}

function countFabricationFlags(content, evidenceText) {
  var out = [], seen = Object.create(null);
  // Anchor on a NUMBER token only (digit run or number word), never an arbitrary leading
  // word, so "found three tests" is read as the count "three tests", not swallowed as the
  // pair "found three". The following token is the candidate counted noun.
  var re = /(\d[\d,]*|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+([A-Za-z]+)/gi, m;
  var text = String(content || '');
  while ((m = re.exec(text)) !== null) {
    var token = m[1], noun = m[2], value = _countValue(token);
    if (value === null || value < 2) continue;
    var prev = text[m.index - 1];
    if (prev && /[A-Za-z0-9$.]/.test(prev)) continue;           // part of a word, money, or decimal
    var nounLower = noun.toLowerCase();
    if (_COUNT_DURATION_NOUNS.test(nounLower) || _COUNT_STAT_OWNED.test(nounLower)) continue;
    var sentence = _countSentence(text, m.index);
    if (isExplicitIllustration(sentence)) continue;
    var isItem = _COUNT_ITEM_NOUNS.test(nounLower);
    var isPlural = /s$/i.test(nounLower) && nounLower.length >= 4;
    if (!isItem && !(isPlural && _COUNT_ENUM_FRAME.test(sentence))) continue;
    var key = value + ':' + nounLower;
    if (seen[key]) continue;
    seen[key] = true;
    if (!_countBacked(value, token, nounLower, evidenceText)) {
      out.push({ claim: sentence.trim().substring(0, 80), count: value, reason: 'shadow_count_unverified' });
    }
  }
  return out;
}

async function shadow(content, context) {
  context = context || {};
  var claims = extractClaims(content);
  var flags = [];
  // MONEY must include the decimals: `/\$[\d,]+/` truncated "$17,744.67" to "$17,744"
  // (17744), which never matched the evidence's rounded 17745 and held a real exact quote.
  var MONEY = /\$[\d,]+(?:\.\d+)?[kKmM]?/;
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
    flags = flags.concat(countFabricationFlags(content, evidenceText));
  }
  return { ok: true, verdict: flags.length === 0 ? 'PASS' : 'FLAG', content: content, flags: flags, claimsChecked: claims.length };
}

module.exports = { shadow, extractClaims, isExplicitIllustration, countFabricationFlags };
