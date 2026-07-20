// ⬡B:core.spend_guard:LAW:no_provider_burns_silently_again:20260719⬡
// FOUNDER 911: $65 of Together credit vanished in a day and nobody caught it
// until he did. Two jobs here. One, a daily spend ceiling so a runaway loop or
// a retry storm can never drain a balance to zero, it trips a brake instead.
// Two, a credit watchdog that reads each provider's real remaining balance and
// stamps a warning to the brain the moment any provider drops low, so a HUMAN
// never discovers a dry provider again, the system tells us first.
'use strict';
// ⬡B:core.spend_guard:COORD:see_cost_changes_ledger:20260720⬡
// IF YOU ARE HERE because a paid call returned null/429 'daily_spend_ceiling_reached':
// that may be INTENTIONAL. Read COST_CHANGES_20260720.md at repo root AND brain bead
// 461759 before raising/removing this guard. A 429 here can be the cost fix WORKING,
// not a bug. The caps (cycle=200, mind=400, anew=400) are set in Render env, not code.


var CALL_LOG = [];               // rolling in-memory record of model spend events
var DAY_MS = 24 * 60 * 60 * 1000;
var DEFAULT_CEIL = parseInt(process.env.DAILY_MODEL_CALL_CEIL || '1500', 10);

function pruneOld() {
  var cut = Date.now() - DAY_MS;
  while (CALL_LOG.length && CALL_LOG[0] < cut) CALL_LOG.shift();
}

// Called right before any paid model call. Returns false when the daily ceiling
// is hit, so the caller skips the spend and stays silent rather than burning.
function allow(kind) {
  pruneOld();
  var ceil = kind === 'image'
    ? parseInt(process.env.DAILY_IMAGE_CALL_CEIL || '300', 10)
    : DEFAULT_CEIL;
  var count = CALL_LOG.length;
  if (count >= ceil) return false;
  CALL_LOG.push(Date.now());
  return true;
}

function usageToday() { pruneOld(); return CALL_LOG.length; }

// Read each provider's real remaining balance. Together and OpenRouter both
// expose it. Returns a list of low/empty providers for the watchdog to stamp.
async function checkBalances() {
  var low = [];
  var TK = process.env.TOGETHER_API_KEY;
  var OR = process.env.OPENROUTER_API_KEY;
  // OpenRouter exposes remaining credit directly.
  if (OR) {
    try {
      var r = await fetch('https://openrouter.ai/api/v1/credits',
        { headers: { Authorization: 'Bearer ' + OR }, signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        var d = await r.json();
        var remaining = (d.data && (d.data.total_credits - d.data.total_usage)) || 0;
        if (remaining < 10) low.push({ provider: 'openrouter', remaining: Math.round(remaining * 100) / 100 });
      }
    } catch (e) { /* a failed check is not a spend event */ }
  }
  // Together does not expose a clean balance endpoint; a 402 on a 1-token probe
  // is the definitive dry signal, but a probe itself costs nothing when dry.
  if (TK) {
    try {
      var pr = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + TK, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.GLM_MODEL || 'zai-org/GLM-5.2',
          messages: [{ role: 'user', content: 'ok' }], max_tokens: 1,
          chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(12000) });
      if (pr.status === 402) low.push({ provider: 'together', remaining: 0 });
    } catch (e) { /* uncertain, not a spend */ }
  }
  return low;
}

module.exports = { allow: allow, usageToday: usageToday, checkBalances: checkBalances };
