// ⬡B:logful.turn_ledger:MODULE:grandmother_911_the_one_live_writer:20260726⬡
// THE GRANDMOTHER 911 WRITER. Founder law, his self-declared number one: "I need her
// to always be able to track and trace what she did, what she responded to, what
// cycle ran, where she had room for improvement, what the next steps are, and WHICH
// WONDER IS NOW OWNING THIS."
//
// The six-field ledger (logful/ledger.js) and its reader (routes/onespot.routes.js
// GET /onespot/:hamUid/trail) were both correct and both live. Nothing wrote to them.
// The only writer in the world sat in run-of-show/turn.js, a file whose own first
// line reads ORPHAN-DEFERRED:no_live_caller and which cannot even be required (it
// asks for run-of-show/find.js, which does not exist). So /onespot/trail returned
// cards:[] forever. This module is the replacement writer, and it hangs off the ONE
// common exit of the REAL live turn: core/tool.loop.js runPAI, which the operational
// registry itself names as the wiring for station.pai and gate.ham.active_channel.
// One seam, not four call sites.
//
// ENTRANCE: core/tool.loop.js runPAI, once per completed turn, fire and forget.
// EXIT: one LOGFUL ledger bead through core/brain.client.writeBead, with typed edges,
// readable back through ledgerTrace and the One Spot trail.
// NOTES: fields one, two and three are FACTS and are filed by cold code from the
// turn's own recorded run data. Fields four, five and six are JUDGMENTS and are
// decided by LOGFUL's mind (logful/ledger.mind.js) in exactly ONE model call. Field
// six is validated back against the live roster, so it can never again be a literal.
// If the mind cannot rule, nothing is filed and the reason is returned honestly:
// ok:false over a hollow stamp, which is the ledger's own stated law.
'use strict';

var ledger = require('./ledger.js');
var ledgerMind = require('./ledger.mind.js');

function clip(value, n) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, n);
}

// The names of the council stages this turn actually ran, straight off the committed
// receipt. No composition, no invention: if the receipt has no stages, this is empty.
function stagesOf(result) {
  var receipt = result && (result.councilReceipt || result.council_receipt);
  var stages = receipt && receipt.stages;
  if (!Array.isArray(stages)) return [];
  return stages.map(function (s) {
    return String((s && (s.stage || s.name)) || '').trim();
  }).filter(Boolean);
}

function toolNamesOf(result) {
  var used = result && result.tools_used;
  if (!Array.isArray(used)) return [];
  return used.map(function (t) {
    return String((t && (t.name || t.tool)) || '').trim();
  }).filter(Boolean);
}

function fellToolsOf(result) {
  var used = result && result.tools_used;
  if (!Array.isArray(used)) return [];
  return used.filter(function (t) { return t && (t.error || t.failed); })
    .map(function (t) { return String(t.name || t.tool || 'unknown'); });
}

// The exact factual record of one turn. Every value here comes off the turn itself.
function turnFacts(turn) {
  turn = turn || {};
  var result = turn.result || {};
  var stages = stagesOf(result);
  var tools = toolNamesOf(result);
  return {
    channel: clip(turn.channel || 'unknown', 40),
    outcome: result.ok === true ? 'committed' : 'refused',
    refusal_reason: result.ok === true ? null : clip(result.reason || 'unknown', 160),
    blocked_by: result.ok === true ? null : clip(result.blocked_by || '', 60) || null,
    cycle_id: clip(result.cycleId || result.cycle_id || turn.cycleId || '', 120),
    request_id: clip(result.requestId || result.request_id || '', 160),
    council_stages: stages,
    tools_used: tools,
    tools_that_fell: fellToolsOf(result),
    iterations: Number.isFinite(result.iterations) ? result.iterations : null,
    duration_ms: Number.isFinite(result.ms) ? result.ms : null,
    answer_bytes: typeof result.answer === 'string' ? result.answer.length : 0,
    answer_preview: clip(result.answer, 400),
    asked: clip(turn.question, 400),
    outbound_pending: !!(result.reach_handoff
      && result.reach_handoff.candidate_committed === true),
    degraded: result.degraded === true
  };
}

// FIELD ONE, what she did. Fact, assembled from the recorded run, never a judgment.
function didFrom(f) {
  var parts = ['ran a ' + f.channel + ' turn through the PAI cycle'];
  if (f.council_stages.length) parts.push('council stages ' + f.council_stages.join(' then '));
  if (f.tools_used.length) parts.push('tools ' + f.tools_used.join(', '));
  else parts.push('no tools called');
  parts.push(f.outcome === 'committed'
    ? 'committed an answer of ' + f.answer_bytes + ' bytes'
    : 'refused with ' + f.refusal_reason);
  if (f.tools_that_fell.length) parts.push('tools that fell: ' + f.tools_that_fell.join(', '));
  return parts.join(', ');
}

// FIELD TWO, what she responded to. The exact inbound bytes she was answering.
function respondedToFrom(f) {
  if (f.asked) return 'inbound ' + f.channel + ' message: ' + f.asked;
  return 'inbound ' + f.channel + ' turn with no recorded message bytes';
}

// FIELD THREE, what cycle ran. The real cycle address plus its measured shape.
function cycleFrom(f) {
  var shape = [];
  if (f.iterations !== null) shape.push(f.iterations + ' iterations');
  if (f.duration_ms !== null) shape.push(f.duration_ms + ' ms');
  if (f.council_stages.length) shape.push(f.council_stages.length + ' council stages');
  return (f.cycle_id || 'pai.cycle.unrecorded')
    + (shape.length ? ' (' + shape.join(', ') + ')' : '');
}

// stampCompletedTurn(turn, deps) -> {ok:true, source, owner, ...} | {ok:false, reason}
// turn: {hamUid, channel, question, result, agent?}
async function stampCompletedTurn(turn, deps) {
  turn = turn || {};
  var d = deps || {};
  var judge = d.judgeTurn || ledgerMind.judgeTurn;
  var stamp = d.ledgerStamp || ledger.ledgerStamp;
  var hamUid = String(turn.hamUid || '').trim();
  if (!hamUid) return { ok: false, reason: 'turn_ledger_requires_hamUid' };
  if (String(process.env.GRANDMOTHER_LEDGER || 'on').toLowerCase() === 'off') {
    return { ok: false, reason: 'grandmother_ledger_disabled_by_env' };
  }
  var f = turnFacts(turn);
  var judged = await judge(f);
  if (!judged || judged.ok !== true) {
    // No mind, no entry. The alternative is cold code inventing her self-assessment
    // and naming her own next owner, which is the exact defect this closes.
    return { ok: false, reason: (judged && judged.reason) || 'ledger_mind_no_verdict' };
  }
  var res = await stamp({
    hamUid: hamUid,
    agent: turn.agent || 'LOGFUL',
    did: didFrom(f),
    respondedTo: respondedToFrom(f),
    cycle: cycleFrom(f),
    improvement: judged.improvement,
    nextSteps: judged.nextSteps,
    owner: judged.owner,
    ownerDisplay: judged.ownerDisplay,
    ownerReason: judged.ownerReason,
    ownerDecidedBy: [judged.model || 'unknown_model', judged.via || 'unknown_via'].join(' via '),
    importance: f.outcome === 'committed' ? 5 : 6,
    refSources: f.request_id ? ['pai.cycle.' + f.cycle_id, f.request_id]
      : (f.cycle_id ? ['pai.cycle.' + f.cycle_id] : [])
  });
  if (!res || res.ok !== true) {
    return { ok: false, reason: (res && res.reason) || 'ledger_carrier_refused' };
  }
  return { ok: true, source: res.source, id: res.id, owner: judged.owner,
    ownerDisplay: judged.ownerDisplay };
}

module.exports = { stampCompletedTurn: stampCompletedTurn,
  _test: { turnFacts: turnFacts, didFrom: didFrom, respondedToFrom: respondedToFrom,
    cycleFrom: cycleFrom } };
