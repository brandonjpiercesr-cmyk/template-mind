// ⬡B:agents.budget.ledger:MODULE:financial_brain:20260625⬡
// LEDGER — Logging and Expense Data for General Economic Review
// Budget OS anchor agent. Reads/writes BEADs for transactions, BNPL, income, config, insights.
// HAM-isolated. Every read/write scoped to requesting HAM. No cross-HAM data ever.

// ⬡B:agents.budget.ledger:FIX:read_the_bank_where_the_data_actually_lives:20260719⬡
// Founder caught a real gaslight: get_budget_summary returned all zeros and I repeated
// "no budget data" as truth, when his real budget (BUDGET_TX/BUDGET_CONFIG beads) lives in
// the NEW bank. Root cause: TABLE/SCHEMA/URL were HARDCODED to the legacy archive
// (aibe_brain/abacia_core), so LEDGER read an almost-empty old table. Now env-driven like
// the rest of the system: new bank first (memory_bank/beads), legacy only as fallback.
var TABLE = process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain');
var SCHEMA = process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core');

function bh(key, write) {
  var h = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept-Profile': SCHEMA };
  if (write) { h['Content-Profile'] = SCHEMA; h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=minimal'; }
  return h;
}

function mkStamp(ns, type, desc) {
  var d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  return '\u2b21B:' + ns + ':' + type + ':' + desc + ':' + d + '\u2b21';
}

function mkSource(hamUid, ns, desc) {
  return 'ham_' + hamUid.toLowerCase() + '.' + ns + '.' + desc + '.' + Date.now();
}

async function brainWrite(hamUid, stampType, ns, desc, content, summary, importance) {
  var BU = process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL, BK = process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return { ok: false, reason: 'no_brain_config' };
  // ⬡B:agents.budget.ledger:FIX:source_returned:20260707⬡
  // B3.1. Every write's source is computed once, here, and handed back to the
  // caller. This is the only stable, unique-per-call identifier a transaction
  // has -- it already carries a millisecond timestamp from mkSource, so two
  // transactions for the same merchant never collide. Void/edit reference this.
  var src = mkSource(hamUid, ns, desc);
  try {
    var r = await fetch(BU + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: bh(BK, true),
      body: JSON.stringify({
        ham_uid: hamUid,
        agent_global: 'LEDGER',
        acl_stamp: mkStamp(ns, stampType, desc),
        stamp_type: stampType,
        source: src,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        summary: summary,
        importance: importance || 7
      })
    });
    return { ok: r.ok, status: r.status, source: src };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ⬡B:agents.budget.ledger:FIX:transient_read_miss_is_the_budget_gaslight:20260722⬡
// Founder-caught, live-verified: the SAME budget read came back sometimes full, sometimes
// EMPTY, and on empty she declared "no budget is set up" for a person who has 7 income
// sources and 26 bills -- the exact gaslight this module already fought once. Root: a
// transient brain hiccup (5xx, 429, reset, or a hung socket) made fetch throw or return
// non-ok, and the old code swallowed it as [] -- indistinguishable from a real absence. A
// transient failure must NOT read as "no data." Retry a non-ok/error/timeout response a few
// times with a short backoff and a bounded per-attempt timeout; a genuine 200-empty returns
// immediately (no retry, no added latency for a truly new user). Universal, no identity.
async function brainRead(hamUid, stampTypes, extraFilter, limit) {
  var BU = process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL, BK = process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return [];
  var types = Array.isArray(stampTypes) ? stampTypes.join(',') : stampTypes;
  var url = BU + '/rest/v1/' + TABLE + '?stamp_type=in.(' + types + ')&ham_uid=eq.' + hamUid;
  if (extraFilter) url += '&' + extraFilter;
  url += '&order=created_at.desc&limit=' + (limit || 200);
  for (var attempt = 0; attempt < 3; attempt++) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000) : null;
    try {
      var r = await fetch(url, { headers: bh(BK, false), signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (r.ok) return await r.json();
      // non-ok (5xx/429/…): fall through to a bounded retry rather than reporting empty.
    } catch (e) {
      if (timer) clearTimeout(timer);
      // network error or aborted timeout: retry.
    }
    if (attempt < 2) await new Promise(function (res) { setTimeout(res, 200 * (attempt + 1)); });
  }
  return [];
}

// ── TOOLS ────────────────────────────────────────────────────────────────────

// Record an expense transaction
async function recordTransaction(hamUid, tx) {
  // tx: { merchant, amount, category, date, accountSource, notes }
  var content = Object.assign({ timestamp: Date.now() }, tx);
  var summary = '[LEDGER] TX: ' + tx.merchant + ' -$' + tx.amount + ' [' + (tx.category || 'uncategorized') + ']';
  return brainWrite(hamUid, 'BUDGET_TX', 'budget.tx', tx.merchant.toLowerCase().replace(/[\s\W]+/g,'_').slice(0,30), content, summary, 6);
}

// ⬡B:agents.budget.ledger:BUILD:void_edit_transaction:20260707⬡
// B3.1. Supersede-only, matching the doctrine -- never delete a BUDGET_TX row.
// A void or edit is its own bead, referencing the original by its source string.
// getCycleSummary reads these and applies them before totaling anything.

async function voidTransaction(hamUid, txSource, reason) {
  if (!txSource) return { ok: false, reason: 'txSource required' };
  var content = { voidedSource: txSource, reason: reason || '', timestamp: Date.now() };
  var summary = '[LEDGER] VOID: ' + txSource;
  return brainWrite(hamUid, 'BUDGET_TX_VOID', 'budget.tx.void', txSource.split('.').slice(-2).join('_').slice(0,30), content, summary, 7);
}

async function editTransaction(hamUid, txSource, updates) {
  if (!txSource) return { ok: false, reason: 'txSource required' };
  var content = Object.assign({ editedSource: txSource, timestamp: Date.now() }, updates || {});
  var summary = '[LEDGER] EDIT: ' + txSource;
  return brainWrite(hamUid, 'BUDGET_TX_EDIT', 'budget.tx.edit', txSource.split('.').slice(-2).join('_').slice(0,30), content, summary, 7);
}

// Record an income event
async function recordIncome(hamUid, inc) {
  // inc: { source, amount, date, frequency, account }
  var content = Object.assign({ timestamp: Date.now() }, inc);
  var summary = '[LEDGER] INCOME: ' + inc.source + ' +$' + inc.amount;
  return brainWrite(hamUid, 'BUDGET_INCOME', 'budget.income', inc.source.toLowerCase().replace(/[\s\W]+/g,'_').slice(0,30), content, summary, 7);
}

// ⬡B:agents.budget.ledger:BUILD:the_mind_can_now_SAVE_a_recurring_income_source_from_conversation:20260722⬡
// The mind held only READ budget tools, so when the founder told A'NU his income she had no
// organ to save it and it was silently dropped. This is the write half: upsert a recurring
// INCOME SOURCE into the real config (read-modify-write, supersede via saveConfig), so the
// projected income the finance advisor reads reflects what he actually said. A source, not a
// one-off receipt: {name, amount, frequency, day|days|anchorDate, category}. Upsert by name so
// re-stating a source updates it instead of duplicating.
async function addIncomeSource(hamUid, source) {
  if (!source || !source.name || !(source.amount >= 0)) return { ok: false, reason: 'name_and_amount_required' };
  // Read several config beads and take the most recent POPULATED one (with brainRead's retry
  // underneath): a read-modify-write that started from a transiently-empty config would bury the
  // real budget under a hollow newest bead. Start from the live config so a save never clobbers it.
  var cfgRows = await brainRead(hamUid, ['BUDGET_CONFIG'], null, 5);
  var config = _pickLiveConfig(cfgRows) || {};
  config.incomeSources = Array.isArray(config.incomeSources) ? config.incomeSources : [];
  var clean = { name: String(source.name).slice(0, 80), amount: parseFloat(source.amount) || 0,
    frequency: source.frequency || 'monthly' };
  if (source.day !== undefined) clean.day = source.day;
  if (Array.isArray(source.days)) clean.days = source.days;
  if (source.anchorDate) clean.anchorDate = source.anchorDate;
  if (source.category) clean.category = source.category;
  if (source.note) clean.note = source.note;
  var idx = config.incomeSources.findIndex(function (s) { return String(s.name || '').toLowerCase() === clean.name.toLowerCase(); });
  var action = idx >= 0 ? 'updated' : 'added';
  if (idx >= 0) config.incomeSources[idx] = Object.assign({}, config.incomeSources[idx], clean);
  else config.incomeSources.push(clean);
  var saved = await saveConfig(hamUid, config);
  return { ok: !!(saved && saved.ok), action: action, source: clean, incomeSourceCount: config.incomeSources.length };
}

// Same read-modify-write pattern for a recurring BILL, so the mind can save a bill he names.
async function addRecurringBill(hamUid, bill) {
  if (!bill || !bill.name || !(bill.amount >= 0)) return { ok: false, reason: 'name_and_amount_required' };
  // Same read-modify-write hardening as addIncomeSource: start from the most recent POPULATED
  // config so saving a bill never buries the real budget under a hollow newest bead.
  var cfgRows = await brainRead(hamUid, ['BUDGET_CONFIG'], null, 5);
  var config = _pickLiveConfig(cfgRows) || {};
  config.recurringBills = Array.isArray(config.recurringBills) ? config.recurringBills : [];
  var clean = { name: String(bill.name).slice(0, 80), amount: parseFloat(bill.amount) || 0,
    day: bill.day !== undefined ? bill.day : 1, category: bill.category || 'Uncategorized' };
  if (bill.note) clean.note = bill.note;
  var idx = config.recurringBills.findIndex(function (b) { return String(b.name || '').toLowerCase() === clean.name.toLowerCase(); });
  var action = idx >= 0 ? 'updated' : 'added';
  if (idx >= 0) config.recurringBills[idx] = Object.assign({}, config.recurringBills[idx], clean);
  else config.recurringBills.push(clean);
  var saved = await saveConfig(hamUid, config);
  return { ok: !!(saved && saved.ok), action: action, bill: clean, recurringBillCount: config.recurringBills.length };
}

// Save or update a BNPL installment plan
function _bnplKey(platform, merchant) {
  return platform.toLowerCase() + '_' + merchant.toLowerCase().replace(/[\s\W]+/g,'_').slice(0,20);
}

async function saveBnplPlan(hamUid, plan) {
  // plan: { merchant, platform, totalAmount, installmentAmount, frequency, nextDueDate, remainingCount, remainingTotal }
  var key = _bnplKey(plan.platform, plan.merchant);
  var content = Object.assign({ timestamp: Date.now(), active: true, key: key }, plan);
  var summary = '[LEDGER] BNPL: ' + plan.platform + ' — ' + plan.merchant + ' $' + plan.installmentAmount + '/' + plan.frequency + ' (' + plan.remainingCount + ' left)';
  return brainWrite(hamUid, 'BUDGET_BNPL', 'budget.bnpl', key, content, summary, 8);
}

// ⬡B:agents.budget.ledger:BUILD:dedupe_bnpl_by_key:20260708⬡
// Roadmap B1.1. Every BUDGET_BNPL write is a fresh bead (mkSource always appends
// a new timestamp), so re-saving the same plan does not overwrite the old bead --
// it adds a newer one. Reading BNPL always dedupes by key first, latest wins.
// This is how markInstallmentPaid works without a separate void bead type: write
// the decremented state, and the old full-count bead simply stops being read as
// current. Nothing is deleted, the old bead stays as history.
function _dedupeLatestBnpl(rows) {
  var byKey = {};
  rows.forEach(function(row) {
    var p = {}; try { p = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) { return; }
    var key = p.key || _bnplKey(p.platform || '', p.merchant || '');
    var ts = p.timestamp || 0;
    if (!byKey[key] || ts > byKey[key].timestamp) byKey[key] = p;
  });
  return Object.keys(byKey).map(function(k) { return byKey[k]; });
}

// ⬡B:agents.budget.ledger:BUILD:mark_installment_paid:20260708⬡
// Roadmap B1.1, made urgent by the founder's own words on double counting:
// "as stuff comes in, distinguish what now gets removed from this, because you
// wouldn't want to be double counting." A payment that already cleared has no
// business still showing up as "upcoming." Advances the plan's own frequency,
// zero hardcoded interval -- reuses the same date math as paycheck projection.
function _advanceByFrequency(dateStr, frequency) {
  var d = new Date(String(dateStr) + 'T12:00:00');
  if (frequency === 'monthly') { d.setMonth(d.getMonth() + 1); }
  else if (frequency === 'biweekly') { d.setDate(d.getDate() + 14); }
  else if (frequency === 'weekly') { d.setDate(d.getDate() + 7); }
  else { d.setDate(d.getDate() + 14); } // unrecognized frequency, safest real-world default for BNPL
  return d.toISOString().slice(0, 10);
}

async function markInstallmentPaid(hamUid, platform, merchant) {
  var rows = await brainRead(hamUid, ['BUDGET_BNPL'], null, 100);
  var plans = _dedupeLatestBnpl(rows);
  var key = _bnplKey(platform, merchant);
  var plan = plans.filter(function(p) { return p.key === key; })[0];
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (!plan.active || plan.remainingCount <= 0) return { ok: false, reason: 'plan_already_closed' };

  var newRemainingCount = plan.remainingCount - 1;
  var newRemainingTotal = Math.round((plan.remainingTotal - plan.installmentAmount) * 100) / 100;
  var updated = Object.assign({}, plan, {
    remainingCount: newRemainingCount,
    remainingTotal: newRemainingTotal < 0 ? 0 : newRemainingTotal,
    nextDueDate: _advanceByFrequency(plan.nextDueDate, plan.frequency),
    active: newRemainingCount > 0
  });
  var r = await saveBnplPlan(hamUid, updated);
  return { ok: r.ok, plan: updated };
}

// Save budget configuration: income sources, cycle dates, categories, paycheck schedule
async function saveConfig(hamUid, config) {
  var content = Object.assign({ timestamp: Date.now(), version: 1 }, config);
  var summary = '[LEDGER] CONFIG: budget setup saved for ' + hamUid;
  return brainWrite(hamUid, 'BUDGET_CONFIG', 'budget.config', 'setup', content, summary, 10);
}

// ⬡B:agents.budget.ledger:BUILD:monthly_run_rate_so_she_can_quote_a_monthly_figure:20260722⬡
// Founder-caught A2 hold: getCycleSummary carried per-payment amounts and WINDOW totals
// (the income cycle is not necessarily one month), so when she answered in the natural
// MONTHLY view her figure was computed on the fly and matched nothing in the evidence --
// SHADOW's money gate then held the whole reply as ungrounded. Fix the organ's evidence,
// not the gate: derive a true monthly RUN-RATE from each source's own amount and frequency
// (every figure from THIS person's own config, none hardcoded) and carry it as an explicit
// number she can quote and the board can verify by direct match. Multipliers are the real
// payments-per-month for each cadence: monthly x1, semimonthly x2, biweekly 26/12, weekly 52/12.
function _perMonth(frequency) {
  switch (String(frequency || 'monthly').toLowerCase()) {
    case 'semimonthly': return 2;
    case 'biweekly':    return 26 / 12;
    case 'weekly':      return 52 / 12;
    case 'monthly':
    default:            return 1;
  }
}
function _monthlyRunRate(items) {
  if (!Array.isArray(items)) return 0;
  var total = 0;
  items.forEach(function(it) {
    if (!it) return;
    var amt = parseFloat(it.amount);
    if (!isFinite(amt)) return;
    total += amt * _perMonth(it.frequency);
  });
  return Math.round(total * 100) / 100;
}

function _parseConfigRow(row) {
  if (!row || !row.content) return null;
  try { return typeof row.content === 'string' ? JSON.parse(row.content) : row.content; }
  catch (e) { return null; }
}
// ⬡B:agents.budget.ledger:FIX:a_later_empty_config_write_must_not_bury_the_real_budget:20260722⬡
// Supersede-never-delete means a real, populated BUDGET_CONFIG still exists in the brain even
// after a later empty/partial config was written over it -- exactly what a read-modify-write
// organ (addIncomeSource/addRecurringBill) does when it reads the config as transiently EMPTY,
// rebuilds it from {}, and saves it, burying the founder's 7 sources + 26 bills under a hollow
// newest bead. Reading only the newest (limit 1) then shows "no budget is set up." So read
// several config beads and pick the most recent one that actually carries income sources or
// recurring bills; only fall back to the newest parsed when none has data (a genuinely new user,
// unchanged behavior). This RECOVERS a real budget a bad write buried, and the write organs are
// hardened the same way so they never bury it again.
function _pickLiveConfig(cfgRows) {
  if (!Array.isArray(cfgRows) || !cfgRows.length) return null;
  var newestParsed = null;
  for (var i = 0; i < cfgRows.length; i++) {
    var c = _parseConfigRow(cfgRows[i]);
    if (!c) continue;
    if (newestParsed === null) newestParsed = c;
    var inc = Array.isArray(c.incomeSources) ? c.incomeSources.length : 0;
    var bills = Array.isArray(c.recurringBills) ? c.recurringBills.length : 0;
    if (inc || bills) return c;
  }
  return newestParsed;
}

// Aggregate cycle summary — income vs expenses by category
async function getCycleSummary(hamUid, cycleStart, cycleEnd) {
  var [txRows, incRows, bnplRows, cfgRows, voidRows, editRows] = await Promise.all([
    brainRead(hamUid, ['BUDGET_TX'], null, 500),
    brainRead(hamUid, ['BUDGET_INCOME'], null, 100),
    brainRead(hamUid, ['BUDGET_BNPL'], null, 50),
    brainRead(hamUid, ['BUDGET_CONFIG'], null, 5),
    brainRead(hamUid, ['BUDGET_TX_VOID'], null, 200),
    brainRead(hamUid, ['BUDGET_TX_EDIT'], null, 200)
  ]);

  // The BUDGET_CONFIG read is the "does this person have a budget" signal: if it comes
  // back empty, the whole summary reads empty and she says "no budget is set up." A
  // transient 200-empty (which brainRead's error-retry does not cover) would gaslight a
  // real user, so re-read the config a couple times before trusting the emptiness. A
  // genuinely new user stays empty after the retries; a flaky miss recovers.
  if (!_pickLiveConfig(cfgRows)) {
    for (var _cfgTry = 0; _cfgTry < 2 && !_pickLiveConfig(cfgRows); _cfgTry++) {
      await new Promise(function (res) { setTimeout(res, 200 * (_cfgTry + 1)); });
      try { cfgRows = await brainRead(hamUid, ['BUDGET_CONFIG'], null, 5); } catch (e) {}
    }
  }

  var start = cycleStart ? new Date(cycleStart) : null;
  var end   = cycleEnd   ? new Date(cycleEnd)   : null;

  function inWindow(row) {
    if (!start && !end) return true;
    var d = new Date(row.created_at);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  }

  // ⬡B:agents.budget.ledger:BUILD:void_edit_aware_summary:20260707⬡
  // B3.1. Nothing gets deleted. A voided transaction still exists as a row --
  // it just gets skipped here. An edited transaction's original fields still
  // exist -- the edit's fields win when both are present. If more than one
  // edit exists for the same source, the most recent one wins.
  var voidedSet = {};
  voidRows.forEach(function(row) {
    var v = {}; try { v = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) {}
    if (v.voidedSource) voidedSet[v.voidedSource] = true;
  });
  var editMap = {};
  editRows.forEach(function(row) {
    var e = {}; try { e = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(err) {}
    if (!e.editedSource) return;
    var existing = editMap[e.editedSource];
    if (!existing || (e.timestamp || 0) > (existing.timestamp || 0)) editMap[e.editedSource] = e;
  });

  var byCategory = {}; var totalExpenses = 0; var transactions = [];
  txRows.filter(inWindow).forEach(function(row) {
    if (voidedSet[row.source]) return;
    var tx = {}; try { tx = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) {}
    var edit = editMap[row.source];
    if (edit) tx = Object.assign({}, tx, edit);
    var cat = tx.category || 'Uncategorized';
    var amt = parseFloat(tx.amount || 0);
    byCategory[cat] = Math.round(((byCategory[cat] || 0) + amt) * 100) / 100;
    totalExpenses += amt;
    transactions.push({ source: row.source, merchant: tx.merchant, amount: amt, category: cat, date: tx.date, edited: !!edit });
  });

  var totalIncome = 0;
  incRows.filter(inWindow).forEach(function(row) {
    var inc = {}; try { inc = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) {}
    totalIncome += parseFloat(inc.amount || 0);
  });

  var bnplActive = _dedupeLatestBnpl(bnplRows).filter(function(p) { return p && p.active && p.remainingCount > 0; });

  var config = _pickLiveConfig(cfgRows);

  // ⬡B:agents.budget.ledger:FIX:summary_includes_projections:20260709⬡
  // Real bug the founder caught: the grid reads /budget/summary, but summary
  // returned only logged transactions (2 rows) -- it never projected the 26 real
  // recurring bills or 7 income sources sitting right there in config. The whole
  // budget was invisible because this endpoint never ran the projection engines
  // that already exist and are proven. Now it does. Same window, same engines.
  var projectedBills = [];
  var projectedIncome = [];
  var projectedIncomeTotal = 0;
  var projectedBillsTotal = 0;
  if (config) {
    try {
      var asOfPB = new Date().toISOString().slice(0, 10);
      var bucketPB = resolveIncomeCycle(asOfPB, config);
      var windowPB = getCycleWindow(bucketPB.year, bucketPB.month, config);
      var bp = projectBillsInWindow(windowPB, config.recurringBills);
      projectedBills = bp.projected;
      projectedBillsTotal = bp.projectedTotal;
      var ip = projectPaychecksInWindow(windowPB, config.incomeSources);
      projectedIncome = ip.projected;
      projectedIncomeTotal = ip.projectedTotal;
    } catch(e) {}
  }

  // True monthly run-rate from THIS person's own config, so a monthly-view answer has an
  // explicit figure to quote and the board can verify it. Window-independent by design.
  var monthlyIncomeTotal = 0, monthlyBillsTotal = 0, monthlyNet = 0;
  // ⬡B:agents.budget.ledger:FIX:per_source_monthly_must_be_in_evidence_or_she_holds:20260722⬡
  // When she breaks income down by source in MONTHLY terms she states each source's monthly
  // figure (a $2,829 semimonthly paycheck reads as $5,658/month), but the summary only carried
  // the per-PAYMENT amount ($2,829), so that computed $5,658 grounded against nothing and SHADOW
  // held her whole reply. Carry each source's and each bill's own monthly amount (name + amount,
  // so it lands in the evidence money set via the "amount" field) -- every figure derived from
  // this person's own config, none hardcoded -- so any monthly figure she quotes verifies.
  var monthlyIncomeBySource = [], monthlyBillsBySource = [];
  if (config) {
    monthlyIncomeTotal = _monthlyRunRate(config.incomeSources);
    monthlyBillsTotal  = _monthlyRunRate(config.recurringBills);
    monthlyNet = Math.round((monthlyIncomeTotal - monthlyBillsTotal) * 100) / 100;
    if (Array.isArray(config.incomeSources)) monthlyIncomeBySource = config.incomeSources.map(function (s) {
      return { name: s && s.name, amount: Math.round((parseFloat((s && s.amount) || 0) * _perMonth(s && s.frequency)) * 100) / 100 };
    });
    if (Array.isArray(config.recurringBills)) monthlyBillsBySource = config.recurringBills.map(function (b) {
      return { name: b && b.name, amount: Math.round((parseFloat((b && b.amount) || 0) * _perMonth(b && b.frequency)) * 100) / 100 };
    });
  }
  // Annual period-view (monthly x12), so "how much do you make" answered as a yearly figure
  // ("about $213,000 a year") grounds instead of holding. Derived from the same real monthly
  // run-rate, none hardcoded. Carried as amount fields so they land in the evidence money set.
  var annualIncomeTotal = Math.round(monthlyIncomeTotal * 12 * 100) / 100;
  var annualBillsTotal  = Math.round(monthlyBillsTotal  * 12 * 100) / 100;
  var annualNet         = Math.round(monthlyNet         * 12 * 100) / 100;

  return {
    hamUid: hamUid,
    cycleStart: cycleStart || null,
    cycleEnd:   cycleEnd   || null,
    totalIncome:   Math.round(totalIncome   * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    net: Math.round((totalIncome - totalExpenses) * 100) / 100,
    byCategory: byCategory,
    transactionCount: transactions.length,
    transactions: transactions,
    projectedBills: projectedBills,
    projectedBillsTotal: projectedBillsTotal,
    projectedIncome: projectedIncome,
    projectedIncomeTotal: projectedIncomeTotal,
    monthlyIncomeTotal: monthlyIncomeTotal,
    monthlyBillsTotal: monthlyBillsTotal,
    monthlyNet: monthlyNet,
    monthlyIncomeBySource: monthlyIncomeBySource,
    monthlyBillsBySource: monthlyBillsBySource,
    annualIncomeTotal: annualIncomeTotal,
    annualBillsTotal: annualBillsTotal,
    annualNet: annualNet,
    bnplActive: bnplActive.length,
    bnplPlans: bnplActive,
    config: config
  };
}

// Get upcoming BNPL payments within N days
async function getUpcoming(hamUid, daysAhead) {
  var bnplRows = await brainRead(hamUid, ['BUDGET_BNPL'], null, 100);
  var plans = _dedupeLatestBnpl(bnplRows);
  var horizon = daysAhead || 45;
  var now = new Date();
  var cutoff = new Date(now.getTime() + horizon * 24 * 60 * 60 * 1000);

  var upcoming = [];
  plans.forEach(function(p) {
    if (!p.active || !p.nextDueDate || p.remainingCount <= 0) return;
    var due = new Date(p.nextDueDate);
    if (due <= cutoff) {
      upcoming.push({
        merchant: p.merchant, platform: p.platform,
        amount: p.installmentAmount, dueDate: p.nextDueDate,
        remainingCount: p.remainingCount, remainingTotal: p.remainingTotal,
        daysAway: Math.round((due - now) / (1000 * 60 * 60 * 24))
      });
    }
  });

  upcoming.sort(function(a, b) { return new Date(a.dueDate) - new Date(b.dueDate); });
  return { hamUid: hamUid, upcoming: upcoming, count: upcoming.length, horizonDays: horizon };
}

// ⬡B:agents.budget.ledger:FIX:superseded_direct_call:20260707⬡
// SUPERSEDED 20260707, kept per supersede-only law, not deleted. This function
// calls Groq directly with no atmosphere resolution and no PAI cycle -- a
// shortcut chat path, the exact thing PART FIVE of the OS names and forbids.
// The live route (POST /budget/ask in routes/budget.routes.js) no longer calls
// this. It calls runPAI from core/tool.loop.js instead, through the real cycle,
// using get_budget_upcoming and get_budget_summary as real tools. Do not wire
// any new caller to this function. Left in place as a record of the mistake.
// Ask LEDGER a budget question — Groq C1 with full context
async function askLedger(hamUid, question, cycleStart, cycleEnd) {
  var key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: 'no_groq_key' };
  var summary = await getCycleSummary(hamUid, cycleStart, cycleEnd);
  var upcoming = await getUpcoming(hamUid, 45);

  // Build real BNPL payment detail with dates, amounts, day buckets
  var due2wk = 0, due4wk = 0, due6wk = 0;
  var lines = [];
  (upcoming.upcoming || []).forEach(function(p) {
    if (p.daysAway <= 14) due2wk += p.amount;
    else if (p.daysAway <= 28) due4wk += p.amount;
    else due6wk += p.amount;
    lines.push('  ' + p.dueDate + ' (' + (p.daysAway < 0 ? Math.abs(p.daysAway)+'d ago' : 'in '+p.daysAway+'d') + ') ' +
      p.platform + ' ' + p.merchant + ' $' + p.amount.toFixed(2) + ' (' + p.remainingCount + ' left)');
  });

  var ctx = 'Current budget data for this HAM:\n' +
    'Income this cycle: $' + summary.totalIncome + '\n' +
    'Expenses this cycle: $' + summary.totalExpenses + '\n' +
    'Net: $' + summary.net + '\n' +
    'Spending by category: ' + JSON.stringify(summary.byCategory) + '\n' +
    '\nBNPL (Buy Now Pay Later) — ' + (upcoming.count || 0) + ' upcoming payments in next 45 days:\n' +
    lines.join('\n') + '\n' +
    '\nBNPL TOTALS: Due in 2 weeks = $' + due2wk.toFixed(2) + ', Due in 4 weeks = $' + due4wk.toFixed(2) + ', Due in 6+ weeks = $' + due6wk.toFixed(2) + '\n' +
    (summary.config ? '\nBudget cycle: ' + (summary.config.cycleStartDay || '?') + 'th of month through ' + (summary.config.cycleEndDay || '?') + 'th of next month. Anything due before the 6th of next month counts in the current cycle.\n' : '');
  var resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: (process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b'), max_tokens: 400, temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are LEDGER, the personal budget assistant inside A\'NEW. You know your HAM\'s money. You are not a scold. You are a life assistant. Be honest, direct, and warm. No fluff.' },
        { role: 'user', content: ctx + '\nQuestion: ' + question }
      ]
    })
  }).then(function(r) { return r.json(); }).catch(function(e) { return { error: e.message }; });

  var answer = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || 'Could not generate answer.';
  await brainWrite(hamUid, 'BUDGET_INSIGHT', 'budget.insight', 'ask', { question: question, answer: answer }, '[LEDGER] Q: ' + question.slice(0, 80), 6);
  return { ok: true, question: question, answer: answer };
}

// ⬡B:agents.budget.ledger:BUILD:cycle_resolver:20260707⬡
// Roadmap v2, B2.1. The money clock. Pure function, zero constants -- the numbers
// 6, 5, 10 exist nowhere in this file. Every input comes from the HAM's own
// BUDGET_CONFIG bead. Runs unchanged for any HAM's own cycle shape.
//
// Two different questions, two different cutoffs, on purpose -- this is the exact
// correction the founder gave at the start of this build: income due before the
// cycleStartDay of next month still belongs to the current cycle, but expenses
// use their own, later cutoff (incomeExpenseCutoffDay). A HAM without that second
// field set just uses cycleStartDay for both -- same behavior, one fewer field to
// configure, never a hardcoded default.

// Given a date and a cutoff day, return the {year, month} (month 0-indexed) of the
// cycle that date belongs to. Day >= cutoff -> that date's own month. Day < cutoff
// -> the prior month, the "before the 6th, it's May" rule, generalized.
function resolveCycleBucket(dateStr, cutoffDay) {
  var d = new Date(String(dateStr) + 'T12:00:00');
  var day = d.getDate();
  var month = d.getMonth();
  var year = d.getFullYear();
  if (day < cutoffDay) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return { year: year, month: month };
}

// Which cycle does an INCOME event on this date belong to, per this HAM's own config.
function resolveIncomeCycle(dateStr, config) {
  var cutoff = (config && config.cycleStartDay) || 1;
  return resolveCycleBucket(dateStr, cutoff);
}

// Which cycle does an EXPENSE/transaction on this date belong to, per this HAM's own
// config. Falls back to cycleStartDay only if the HAM never set a separate expense
// cutoff -- not a hardcoded 10, a real fallback to a field the HAM already owns.
function resolveExpenseCycle(dateStr, config) {
  var cutoff = (config && config.incomeExpenseCutoffDay) || (config && config.cycleStartDay) || 1;
  return resolveCycleBucket(dateStr, cutoff);
}

// The actual date window for a named cycle -- {year, month} in, {start, end} out.
// start = cycleStartDay of that month. end = cycleEndDay of the following month.
function getCycleWindow(year, month, config) {
  var startDay = (config && config.cycleStartDay) || 1;
  var endDay = (config && config.cycleEndDay) || 28;
  var start = new Date(year, month, startDay, 0, 0, 0);
  var endMonth = month + 1, endYear = year;
  if (endMonth > 11) { endMonth = 0; endYear += 1; }
  var end = new Date(endYear, endMonth, endDay, 23, 59, 59);
  return { start: start, end: end, label: (month + 1) + '/' + year };
}

// Full picture for "today" or any given date: which cycle is active, its window,
// and — reusing the real, already-proven getUpcoming/income data — where things
// stand. Pure resolver plus one real read, no invented numbers.
async function getCurrentCycle(hamUid, asOfDate) {
  var cfgRows = await brainRead(hamUid, ['BUDGET_CONFIG'], null, 5);
  var config = _pickLiveConfig(cfgRows);
  if (!config) return { ok: false, reason: 'no_config_on_file' };

  var asOf = asOfDate || new Date().toISOString().slice(0, 10);
  var bucket = resolveIncomeCycle(asOf, config);
  var window = getCycleWindow(bucket.year, bucket.month, config);
  var summary = await getCycleSummary(hamUid, window.start.toISOString(), window.end.toISOString());

  // B2.3: real projected income for this window, from the HAM's own income
  // sources, plus what has actually been received (recordIncome beads, already
  // counted in summary.totalIncome), plus the honest gap between them.
  var projection = projectPaychecksInWindow(window, config.incomeSources);
  var receivedIncome = summary.totalIncome;
  var projectedGap = Math.round((projection.projectedTotal - receivedIncome) * 100) / 100;

  var billProjection = projectBillsInWindow(window, config.recurringBills);

  return {
    ok: true,
    hamUid: hamUid,
    asOf: asOf,
    cycleLabel: window.label,
    cycleStart: window.start.toISOString().slice(0, 10),
    cycleEnd: window.end.toISOString().slice(0, 10),
    totalIncome: summary.totalIncome,
    totalExpenses: summary.totalExpenses,
    net: summary.net,
    byCategory: summary.byCategory,
    projectedIncome: projection.projected,
    projectedIncomeTotal: projection.projectedTotal,
    receivedIncome: receivedIncome,
    incomeStillExpected: projectedGap > 0 ? projectedGap : 0,
    projectionWarnings: projection.warnings,
    projectedBills: billProjection.projected,
    projectedBillsTotal: billProjection.projectedTotal,
    billProjectionWarnings: billProjection.warnings
  };
}

// ⬡B:agents.budget.ledger:BUILD:paycheck_projection:20260707⬡
// Roadmap v2, B2.2. Project expected paycheck dates inside a cycle window from
// this HAM's own incomeSources. Every frequency shape reads its own fields off
// the config -- semimonthly days, monthly day (or "last"), biweekly anchorDate.
// A source that can't project with what it has is skipped and named in warnings,
// never guessed into a wrong date. No day-of-month or interval number hardcoded
// anywhere in this function -- all of it comes from the source object itself.

function _lastDayOfMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function _safeDate(year, month, day) {
  var maxDay = _lastDayOfMonth(year, month);
  var d = Math.min(day, maxDay);
  return new Date(year, month, d, 12, 0, 0);
}
function _isoDate(d) { return d.toISOString().slice(0, 10); }
function _addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
function _forEachMonthTouching(window, fn) {
  var cursor = new Date(window.start.getFullYear(), window.start.getMonth(), 1);
  var stop = new Date(window.end.getFullYear(), window.end.getMonth(), 1);
  var guard = 0;
  while (cursor <= stop && guard < 36) {
    fn(cursor.getFullYear(), cursor.getMonth());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard++;
  }
}

function projectPaychecksInWindow(window, incomeSources) {
  var results = [];
  var warnings = [];

  (incomeSources || []).forEach(function(src) {
    var freq = src.frequency;

    if (freq === 'semimonthly') {
      var days = src.days || [];
      if (!days.length) { warnings.push(src.name + ' is semimonthly but has no days[] on file, skipped'); return; }
      _forEachMonthTouching(window, function(year, month) {
        days.forEach(function(day) {
          var d = _safeDate(year, month, day);
          if (d >= window.start && d <= window.end) {
            results.push({ name: src.name, amount: src.amount, date: _isoDate(d), frequency: freq });
          }
        });
      });

    } else if (freq === 'monthly') {
      if (src.day === undefined || src.day === null) { warnings.push(src.name + ' is monthly but has no day on file, skipped'); return; }
      _forEachMonthTouching(window, function(year, month) {
        var d = (src.day === 'last') ? _safeDate(year, month, _lastDayOfMonth(year, month)) : _safeDate(year, month, src.day);
        if (d >= window.start && d <= window.end) {
          results.push({ name: src.name, amount: src.amount, date: _isoDate(d), frequency: freq });
        }
      });

    } else if (freq === 'biweekly' || freq === 'weekly') {
      if (!src.anchorDate) { warnings.push(src.name + ' is ' + freq + ' but has no anchorDate on file, skipped rather than guessed'); return; }
      var step = (freq === 'biweekly') ? 14 : 7;
      var anchor = new Date(String(src.anchorDate) + 'T12:00:00');
      var cursor = new Date(anchor);
      var guard = 0;
      while (cursor > window.start && guard < 500) { cursor = _addDays(cursor, -step); guard++; }
      guard = 0;
      while (cursor < window.start && guard < 500) { cursor = _addDays(cursor, step); guard++; }
      guard = 0;
      while (cursor <= window.end && guard < 500) {
        results.push({ name: src.name, amount: src.amount, date: _isoDate(cursor), frequency: freq });
        cursor = _addDays(cursor, step);
        guard++;
      }

    } else {
      warnings.push(src.name + ' has an unrecognized frequency "' + freq + '", skipped');
    }
  });

  results.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var total = results.reduce(function(sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
  return { projected: results, projectedTotal: Math.round(total * 100) / 100, warnings: warnings };
}

// ⬡B:agents.budget.ledger:BUILD:bill_projection:20260709⬡
// Real gap the founder caught: income gets projected, real recurring bills never
// did. Same engine as projectPaychecksInWindow, same date-math helpers, zero
// new hardcoded logic -- a bill is just a negative-direction income source.
// Reads from the HAM's own config.recurringBills. Nothing invented, nothing
// guessed -- every bill here has a real day-of-month and amount from the HAM's
// own real records, or it does not get projected.
function projectBillsInWindow(window, recurringBills) {
  var results = [];
  var warnings = [];
  (recurringBills || []).forEach(function(bill) {
    var freq = bill.frequency || 'monthly';
    if (freq === 'monthly') {
      if (bill.day === undefined || bill.day === null) { warnings.push(bill.name + ' is monthly but has no day on file, skipped'); return; }
      _forEachMonthTouching(window, function(year, month) {
        var d = (bill.day === 'last') ? _safeDate(year, month, _lastDayOfMonth(year, month)) : _safeDate(year, month, bill.day);
        if (d >= window.start && d <= window.end) {
          results.push({ name: bill.name, amount: bill.amount, date: _isoDate(d), frequency: freq, category: bill.category || 'Uncategorized' });
        }
      });
    } else if (freq === 'biweekly' || freq === 'weekly') {
      if (!bill.anchorDate) { warnings.push(bill.name + ' is ' + freq + ' but has no anchorDate, skipped'); return; }
      var step = (freq === 'biweekly') ? 14 : 7;
      var cursor = new Date(String(bill.anchorDate) + 'T12:00:00');
      var guard = 0;
      while (cursor > window.start && guard < 500) { cursor = _addDays(cursor, -step); guard++; }
      guard = 0;
      while (cursor < window.start && guard < 500) { cursor = _addDays(cursor, step); guard++; }
      guard = 0;
      while (cursor <= window.end && guard < 500) {
        results.push({ name: bill.name, amount: bill.amount, date: _isoDate(cursor), frequency: freq, category: bill.category || 'Uncategorized' });
        cursor = _addDays(cursor, step);
        guard++;
      }
    } else {
      warnings.push(bill.name + ' has an unrecognized frequency "' + freq + '", skipped');
    }
  });
  results.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var total = results.reduce(function(sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
  return { projected: results, projectedTotal: Math.round(total * 100) / 100, warnings: warnings };
}

// ⬡B:agents.budget.ledger:BUILD:scenario_branching:20260709⬡
// Signature feature, founder-directed, researched against real budgeting tools
// (Vena, Cube, Airtable) before building: branch off a real budget, edit the
// branch, forecast it, compare against the real plan -- without ever touching
// live data. A scenario is a name plus a set of deltas layered on top of the
// HAM's real config in memory only. The same projection engines already proven
// (projectPaychecksInWindow, projectBillsInWindow) run against the branched
// config, not a separate reimplementation. Both the HAM and A'NU can create and
// edit scenarios -- same functions, same data, whichever end calls them.

async function saveScenario(hamUid, name, deltas) {
  if (!name) return { ok: false, reason: 'name required' };
  var content = { name: name, deltas: deltas || {}, timestamp: Date.now() };
  var summary = '[LEDGER] SCENARIO: ' + name + ' saved/updated';
  var key = 'scenario_' + name.toLowerCase().replace(/[\s\W]+/g,'_').slice(0,30);
  return brainWrite(hamUid, 'BUDGET_SCENARIO', 'budget.scenario', key, content, summary, 6);
}

async function listScenarios(hamUid) {
  var rows = await brainRead(hamUid, ['BUDGET_SCENARIO'], null, 50);
  var byKey = {};
  rows.forEach(function(row) {
    var s = {}; try { s = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) { return; }
    var key = row.source;
    var nameKey = (s.name || '').toLowerCase();
    if (!byKey[nameKey] || (s.timestamp||0) > (byKey[nameKey].timestamp||0)) byKey[nameKey] = s;
  });
  return Object.keys(byKey).map(function(k) { return byKey[k]; });
}

// Apply a scenario's deltas on top of the real config, in memory only. Deltas
// shape: { incomeAdjust: [{name, newAmount}], billAdjust: [{name, newAmount}],
// billRemove: [names], billAdd: [{name, amount, day, category}] }
function _applyScenarioDeltas(config, deltas) {
  var branched = JSON.parse(JSON.stringify(config || {}));
  branched.incomeSources = (branched.incomeSources || []).map(function(src) {
    var adj = (deltas.incomeAdjust || []).filter(function(a) { return a.name === src.name; })[0];
    return adj ? Object.assign({}, src, { amount: adj.newAmount }) : src;
  });
  var bills = (branched.recurringBills || []).map(function(b) {
    var adj = (deltas.billAdjust || []).filter(function(a) { return a.name === b.name; })[0];
    return adj ? Object.assign({}, b, { amount: adj.newAmount }) : b;
  });
  var removeNames = deltas.billRemove || [];
  bills = bills.filter(function(b) { return removeNames.indexOf(b.name) === -1; });
  (deltas.billAdd || []).forEach(function(nb) { bills.push(nb); });
  branched.recurringBills = bills;
  return branched;
}

// Compute a scenario's forecast for a window, and the real baseline for the
// same window, side by side -- exactly the "compare against real plan" pattern
// every real scenario-modeling tool researched for this feature uses.
async function computeScenario(hamUid, scenarioName, asOfDate) {
  var cfgRows = await brainRead(hamUid, ['BUDGET_CONFIG'], null, 5);
  var realConfig = _pickLiveConfig(cfgRows);
  if (!realConfig) return { ok: false, reason: 'no_config_on_file' };

  var scenarios = await listScenarios(hamUid);
  var scenario = scenarios.filter(function(s) { return s.name === scenarioName; })[0];
  if (!scenario) return { ok: false, reason: 'scenario_not_found' };

  var asOf = asOfDate || new Date().toISOString().slice(0, 10);
  var bucket = resolveIncomeCycle(asOf, realConfig);
  var window = getCycleWindow(bucket.year, bucket.month, realConfig);

  var realIncome = projectPaychecksInWindow(window, realConfig.incomeSources);
  var realBills = projectBillsInWindow(window, realConfig.recurringBills);

  var branchedConfig = _applyScenarioDeltas(realConfig, scenario.deltas);
  var scenarioIncome = projectPaychecksInWindow(window, branchedConfig.incomeSources);
  var scenarioBills = projectBillsInWindow(window, branchedConfig.recurringBills);

  return {
    ok: true,
    scenarioName: scenarioName,
    cycleLabel: window.label,
    real: { income: realIncome.projectedTotal, bills: realBills.projectedTotal, net: Math.round((realIncome.projectedTotal - realBills.projectedTotal) * 100) / 100 },
    scenario: { income: scenarioIncome.projectedTotal, bills: scenarioBills.projectedTotal, net: Math.round((scenarioIncome.projectedTotal - scenarioBills.projectedTotal) * 100) / 100 },
    difference: Math.round(((scenarioIncome.projectedTotal - scenarioBills.projectedTotal) - (realIncome.projectedTotal - realBills.projectedTotal)) * 100) / 100,
    scenarioBillsDetail: scenarioBills.projected,
    deltas: scenario.deltas
  };
}

module.exports = { recordTransaction, recordIncome, addIncomeSource, addRecurringBill, saveBnplPlan, saveConfig, getCycleSummary, getUpcoming, askLedger, resolveIncomeCycle, resolveExpenseCycle, getCycleWindow, getCurrentCycle, projectPaychecksInWindow, voidTransaction, editTransaction, markInstallmentPaid, projectBillsInWindow, saveScenario, listScenarios, computeScenario };
