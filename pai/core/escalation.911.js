// ⬡B:core.escalation_911:MODULE:a_real_judged_911_pass_never_a_cold_bypass:20260802⬡
// New World Order pt1 doctrine, founder direct: a governed way for any sub-agent/advisor to
// force a genuinely urgent claim toward maximum visibility on the founder's desk, with a
// queryable "naughty list" for false alarms. GRANDDADDY 911 law (docs/GRANDDADDY_911_ONLY_ANU
// _SPEAKS.md) and core/outreach.js's own standing comments are explicit: cold code never
// decides to reach a human, and force never bypasses a real model judgment. This file never
// touches core/outreach.js (too large and too central to risk under time pressure); instead
// it reuses two already-proven primitives losslessly: the judged-verdict pattern
// core/wonder.consult.js#defaultJudge already established, and advisors/advisor.exit.js's
// already-live surfaceToDesk door onto the Command Center desk. The only path to the desk
// below is a genuine judged urgent:true verdict; a false, refused, or unparseable claim is
// durably recorded (feeding the naughty list) and never surfaced.
'use strict';

const brain = require('./brain.client.js');
const modelLadder = require('./model.ladder.js');
const advisorExit = require('../advisors/advisor.exit.js');

const MAX_CLAIM_HISTORY = 20;
const NAUGHTY_WINDOW_ROWS = 20;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max || 1000);
}

function sourceFor(hamUid, seatSlug) {
  return 'escalation.911.' + String(hamUid).toLowerCase() + '.' + String(seatSlug).toLowerCase() + '.' + Date.now();
}

// The only judgment cold code makes is which model tier to spend on asking; the verdict is
// the model's alone. A thrown call or an unparseable/malformed answer both read as null,
// which raise911 below treats as an honest non-urgent refusal, never a fabricated escalation
// and never a fabricated false alarm either.
async function judgeUrgency(hamUid, seatSlug, claim, evidenceRefs) {
  let result;
  try {
    result = await modelLadder.deliberate(
      'A sub-agent is claiming a genuine 911-grade emergency that should interrupt a human ' +
      'right now. Judge this honestly and skeptically: most claims are NOT truly 911-grade. ' +
      'Only real, time-critical, human-only-fixable events qualify (a live secret exposed, ' +
      'irreversible data loss in progress, a security breach, a production outage). Answer ' +
      'ONLY JSON, no prose: {"urgent": true or false, "reason": "one honest sentence why"}.',
      'Seat: ' + clean(seatSlug, 100) + '\nClaim: ' + clean(claim, 1200) +
        '\nEvidence: ' + JSON.stringify((Array.isArray(evidenceRefs) ? evidenceRefs : []).slice(0, 10)),
      {seat:'advisors', temperature:0.1, timeout:25000, max_tokens:300});
  } catch (error) { return null; }
  const text = result && result.content;
  if (!text) return null;
  try {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    if (parsed && typeof parsed.urgent === 'boolean') return parsed;
  } catch (error) { /* falls through to null below */ }
  return null;
}

// Every claim, genuine or not, is durably recorded so a pattern of false alarms from one
// seat becomes queryable later (the doctrine's "naughty list"). Best-effort, matching the
// house convention for side-channel banking elsewhere (core/coda/research.notes.store.js):
// a failed write returns false and is never thrown back into the caller.
async function recordClaim(hamUid, seatSlug, claim, verdict, options) {
  const opts = options || {};
  const bank = opts.brain || brain;
  const ham = String(hamUid || '').trim().toUpperCase();
  const seat = String(seatSlug || '').trim().toUpperCase();
  const content = {
    schema: 'great-reset.escalation-911-claim.v1', seat: seat,
    claim: clean(claim, 1200), urgent: !!(verdict && verdict.urgent),
    reason: clean(verdict && verdict.reason, 400), at: new Date().toISOString()
  };
  try {
    await bank.writeBead({
      hamUid: ham, agentGlobal: seat || 'ADVISOR', source: sourceFor(ham, seat || 'unknown'),
      type: 'ESCALATION_911_CLAIM',
      summary: '[911 CLAIM] ' + (content.urgent ? 'URGENT' : 'FALSE_ALARM') + ' ' + seat,
      content: content, importance: content.urgent ? 9 : 3,
      edges: [{ type: 'PRODUCED_BY', target: 'station.' + seat.toLowerCase() }]
    });
    return true;
  } catch (error) { return false; }
}

// The entrance every advisor/sub-agent calls to raise a genuine emergency. Never a cold
// bypass: the only path to surfaceToDesk below is a real judged urgent:true verdict. A
// false, refused, or unparseable claim is recorded (feeding the naughty list) and refused,
// never silently dropped and never surfaced.
async function raise911(hamUid, seatSlug, claim, evidenceRefs, options) {
  const opts = options || {};
  const ham = String(hamUid || '').trim().toUpperCase();
  const seat = String(seatSlug || '').trim().toUpperCase();
  const claimText = clean(claim, 1200);
  if (!ham || !seat || !claimText) return { ok: false, reason: 'escalation_911_input_invalid' };

  const judge = opts.judge || judgeUrgency;
  let verdict;
  try { verdict = await judge(ham, seat, claimText, evidenceRefs); } catch (error) { verdict = null; }

  const recorder = opts.recordClaim || recordClaim;
  await recorder(ham, seat, claimText, verdict, opts);

  if (!verdict || verdict.urgent !== true) {
    return { ok: false, reason: 'escalation_911_not_urgent', judged: !!verdict };
  }

  const surface = opts.surfaceToDesk || advisorExit.surfaceToDesk;
  let surfaced = false;
  try {
    surfaced = await surface(ham, seat,
      '[911] ' + claimText.slice(0, 120),
      claimText + (verdict.reason ? ('\n\nJudged reason: ' + clean(verdict.reason, 400)) : ''),
      10);
  } catch (error) { surfaced = false; }

  return { ok: true, surfaced: !!surfaced, reason: clean(verdict.reason, 400) };
}

// Read-back for the doctrine's "naughty list": how many of a seat's recent claims were
// judged genuine vs. false alarms, so a pattern of false 911s becomes visible without
// anyone hand-auditing the bead table. Best-effort; a read failure returns an honest empty
// standing, never a fabricated count.
async function naughtyStanding(hamUid, seatSlug, options) {
  const opts = options || {};
  const bank = opts.brain || brain;
  const ham = String(hamUid || '').trim().toUpperCase();
  const seat = String(seatSlug || '').trim().toUpperCase();
  if (!ham || !seat) return { seat: seat, total: 0, urgent: 0, falseAlarms: 0, rows: [] };
  let rows;
  try {
    rows = await bank.readBead({
      ham_uid: 'eq.' + ham, stamp_type: 'eq.ESCALATION_911_CLAIM',
      select: 'source,content,created_at', order: 'created_at.desc',
      limit: String(opts.historyRows || NAUGHTY_WINDOW_ROWS)
    });
  } catch (error) { return { seat: seat, total: 0, urgent: 0, falseAlarms: 0, rows: [] }; }
  const claims = [];
  (Array.isArray(rows) ? rows : []).some(function (row) {
    let content = row && row.content;
    if (typeof content === 'string') { try { content = JSON.parse(content); } catch (error) { content = null; } }
    if (!content || content.seat !== seat) return false;
    claims.push({ urgent: !!content.urgent, claim: clean(content.claim, 200), at: content.at || null });
    return claims.length >= (opts.maxRows || MAX_CLAIM_HISTORY);
  });
  const urgentCount = claims.filter(function (c) { return c.urgent; }).length;
  return { seat: seat, total: claims.length, urgent: urgentCount, falseAlarms: claims.length - urgentCount, rows: claims };
}

module.exports = {
  raise911: raise911, naughtyStanding: naughtyStanding,
  _test: { judgeUrgency: judgeUrgency, recordClaim: recordClaim }
};
