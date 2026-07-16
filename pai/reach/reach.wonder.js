// ⬡B:reach.reach_wonder:MODULE:reach_birthed_as_a_true_wonder:20260711⬡
// REACH, BIRTHED AS A WONDER. Founder doctrine pt6: 'we still haven't birthed the
// reach department... when we birth that true wonder, part of her job should be to
// audit the command center and all of the recent areas she's about to reach out and
// how it needs to be doing performance.' This is that birth: a declared wonder with
// a real purpose (defined channel rules) and a real audit capability (not just talk).
'use strict';
// ⬡B:reach.reach_wonder:WIRE:funneled_world_agnostic_20260711⬡
// PORT PROOF-OF-CONCEPT (founder-authorized, batch 1). Was a direct brain-hitter
// (hardcoded aibe_brain + abacia_core). Funneled to the same world-agnostic pattern
// as brain.client.js: URL/KEY/table/schema read at CALL time via MEMORY_BANK_* with
// exact AIBE_BRAIN_* fallback -> byte-identical in legacy, ready for the new world.
function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl() { return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema() { return process.env.BRAIN_SCHEMA || 'abacia_core'; }
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { var h = rh(); h['Content-Profile'] = _schema(); h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }
function ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

// THE PURPOSE, stated plainly (per doctrine: 'define who can make it direct, what's
// going on, how it's going on'):
//   CALL (voice) -- reserved for the narrow drop-everything tier: high
//     importance AND time-sensitive AND actually needs a decision now. The call IS
//     the message; text is never fired alongside it, only as an unanswered-call
//     fallback (a separate later event).
//   TEXT -- 'needs to know soon,' async, no live interruption required.
//   EMAIL -- substantive and detailed, needs a read, but is not urgent.
//   COMMAND_CENTER -- needs an answer eventually, not time-pressured; lands on the wall.
//   PORTAL -- ambient/FYI, lowest urgency.
var PURPOSE = {
  'voice': 'drop-everything: high importance + time-sensitive + needs a real decision now',
  'text': 'needs to know soon, async, no live interruption required',
  'email': 'substantive and detailed, needs a read, but is not urgent',
  'command_center': 'needs an answer eventually, not time-pressured',
  'portal': 'ambient / FYI, lowest urgency'
};

// THE AUDIT -- reach's real job now that it is a wonder. Reads recent real channel
// decisions (FUNNELED_REACH/HELD_REACH beads, the actual proposedChannel judgments),
// tallies by channel, and reports whether the mix looks right -- this is the
// performance review the founder asked for, run on real data, not narrated.
async function auditRecentDecisions(hamUid, limit) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no_brain' };
  var HAM = String(hamUid).toUpperCase();
  var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + HAM
    + '&stamp_type=in.(FUNNELED_REACH,HELD_REACH)&order=created_at.desc&limit=' + (limit || 50)
    + '&select=stamp_type,content,created_at', { headers: rh() });
  var rows = r.ok ? await r.json() : [];
  var byChannel = {};
  rows.forEach(function (row) {
    var c = {}; try { c = JSON.parse(row.content || '{}'); } catch (e) {}
    var ch = c.how || c.proposedChannel || 'unknown';
    byChannel[ch] = (byChannel[ch] || 0) + 1;
  });
  var total = rows.length;
  var callCount = byChannel.voice || 0;
  var callRate = total ? Math.round((callCount / total) * 1000) / 10 : 0;
  // A real flag: if calls are more than a quarter of all decisions, the drop-
  // everything tier is firing too loose -- that is itself an audit finding.
  // \u2b21B:reach.reach_wonder:FIX:real_deliberation_added_20260711:20260711\u2b21
  // SELF-AUDIT CONFESSION: this function was pure cold code -- fetch, tally,
  // threshold -- declared a 'wonder' with zero AI deliberation. Doctrine allows cold
  // code for DETECTION; the gap was skipping deliberation on what the detection
  // means. Cold code still does the counting (unchanged, no LLM needed for a tally).
  // AI now reasons about whether the pattern is an actual problem given context
  // (e.g. a crunch week can legitimately raise the call rate without the tier logic
  // being wrong) BEFORE the finding is treated as authoritative.
  var coldFinding = callRate > 25
    ? 'CALL rate is ' + callRate + '% of recent decisions, above the 25% cold-detect threshold'
    : 'CALL rate is ' + callRate + '%, within the 25% cold-detect threshold';
  var finding = coldFinding;
  if (process.env.GROQ_API_KEY) {
    try {
      var deliberation = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.GROQ_MODEL_C2 || 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: 'You audit a reach system\'s channel decisions. Given a cold count and the channel breakdown, reason in 1-2 sentences whether this looks like a real problem (the tier logic firing too loose) or a legitimate pattern (e.g. a genuinely urgent stretch). Be concrete, not generic.' },
            { role: 'user', content: coldFinding + '. Channel breakdown: ' + JSON.stringify(byChannel) + '. Total decisions: ' + total + '.' }],
          max_tokens: 150, temperature: 0.3 })
      }).then(function (r) { return r.json(); });
      var reasoned = deliberation && deliberation.choices && deliberation.choices[0] && deliberation.choices[0].message && deliberation.choices[0].message.content;
      if (reasoned) finding = coldFinding + ' -- ' + reasoned.trim();
    } catch (eDelib) { /* deliberation is additive; the cold finding alone is never blocked by an LLM failure */ }
  }
  var report = { ok: true, total: total, byChannel: byChannel, callRatePct: callRate, finding: finding, coldFinding: coldFinding, purpose: PURPOSE };
  await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: wh(), body: JSON.stringify({
    ham_uid: HAM, agent_global: 'REACH', stamp_type: 'AUDIT',
    acl_stamp: '\u2b21B:reach.reach_wonder:AUDIT:channel_performance:' + ymd() + '\u2b21',
    source: 'reach.audit.' + Date.now(),
    summary: '[REACH AUDIT] ' + total + ' recent decisions, ' + finding,
    content: JSON.stringify(report), importance: 6 }) }).catch(function () {});
  return report;
}

module.exports = { PURPOSE: PURPOSE, auditRecentDecisions: auditRecentDecisions };
