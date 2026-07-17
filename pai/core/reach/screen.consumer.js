// ⬡B:core.reach.screen_consumer:MODULE:overseer_decisions_to_live_screen:20260708⬡
// entered via the ABAHAM door, serving channel MESSAGES (the screen is a reach surface)
// Phase 3 of ANU_LIVE, wired the vowels way: this consumer NEVER decides what matters.
// Overseer's exit tool decides and stamps EXIT_DECISION beads inside its bounded decision
// space; this is the reach layer that consumes those decisions for one surface, the live
// screen. The exit tool's own law holds: it sends nothing, reach consumes on its own laws.
//
// THE CONSERVATIVE TRIGGER (founder-confirmed 20260708):
//   1. Screen delivery happens ONLY while a live SSE session for that HAM is connected.
//      Nobody watching = nothing pushed, no queue, no backlog, no spam-on-reconnect
//      beyond the wire's own short replay buffer. Command Center remains the durable record.
//   2. Only decisions whose chosen exit is COMMAND_CENTER or higher (EMAIL, TEXT) mirror
//      to the screen. LOGFUL stays logged-only; OPUS_REVIEW is not a user surface.
//   3. Idempotent per decision bead: one screen delivery each, stamped, checked before push.
//   4. HOLLOW-REPLY: no real summary = skip silently. Never a canned holding card.
// The anti-gaslight property: this cannot originate content or urgency. It can only mirror
// what Overseer already decided, to a screen the founder is actively looking at.
'use strict';
// ⬡B:core.reach.screen.consumer:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


const registry = require('../stream/session.registry');
const vocab = require('../directive/vocabulary');
const worldBoundary = require('../safety/world.boundary');
const tiers = require('../safety/tier.model');
const wireLog = require('../stream/wire.log');
const brain = require('../brain.client');

const BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
const SCREEN_EXITS = ['COMMAND_CENTER', 'EMAIL', 'TEXT'];

function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }

// The same three gates the HTTP push path runs, applied in-process. One directive in,
// pushed or refused with the reason. Never bypasses a gate because the caller is internal.
// \u2b21B:core.reach.screen_consumer:WIRE:interruption_budget_shared_20260712\u2b21
// Extracted so OTHER unprompted-surface lanes (HUNCH/PRESS/PLAY via hunch-surface)
// can share this SAME rolling counter, not a separate 6-per-hour each that would
// stack. One founder, one interruption budget, no matter which agent is knocking.
// Prompted turns (the founder asking something) are NEVER budgeted -- only calls
// that pass an unprompted origin here are capped.
function checkInterruptionBudget(hamUid, origin) {
  const now = Date.now();
  const win = (checkInterruptionBudget._budget = checkInterruptionBudget._budget || {});
  const arr = (win[hamUid] = (win[hamUid] || []).filter(function (t) { return now - t < 3600000; }));
  if (arr.length >= 6) return { ok: false, reason: 'unprompted_cap_6_per_hour', remaining: 0 };
  arr.push(now);
  return { ok: true, remaining: 6 - arr.length };
}

function gatedPush(hamUid, sessionTargetFn, directive, origin) {
  // ⬡B:core.reach.screen_consumer:BUILD:interruption_budget_3a_20260710⬡
  // PHASE 3A of the 2046 JARVIS roadmap: the interruption budget, the single most
  // important calm-technology rule, enforced in cold code at the one gate every
  // UNPROMPTED push passes through. Origin screen_consumer is the ambient mirror
  // lane (things she surfaces without being asked); prompted lanes (her answering
  // a live turn, connect context) are never budgeted, a person asking always gets
  // answered. Budget: at most 6 unprompted surface groups per rolling hour per
  // HAM. Past the cap, pushes are deferred with a visible refusal in the wire log
  // (gate interruption_budget) so a founder audit can always answer the question
  // "why did she interrupt me", and equally "why did she stay quiet".
  if (origin === 'screen_consumer') {
    const budgetCheck = checkInterruptionBudget(hamUid, origin);
    if (!budgetCheck.ok) {
      wireLog.refusal({ hamUid: hamUid, gate: 'interruption_budget', reason: budgetCheck.reason, op: directive && directive.op, origin: origin });
      return { ok: false, gate: 'interruption_budget', reason: budgetCheck.reason };
    }
  }
  const v = vocab.validate(directive);
  if (!v.valid) { wireLog.refusal({ hamUid: hamUid, gate: 'describe_not_execute', reason: v.reason, op: directive && directive.op, origin: origin }); return { ok: false, gate: 'describe_not_execute', reason: v.reason }; }
  const wb = worldBoundary.check(hamUid, directive);
  if (!wb.allowed) { wireLog.refusal({ hamUid: hamUid, gate: 'world_boundary', reason: wb.reason, op: directive.op, origin: origin }); return { ok: false, gate: 'world_boundary', reason: wb.reason }; }
  const actionType = ({ createSurface: 'surface.create', updateComponents: 'surface.update_components', updateDataModel: 'surface.update_data', deleteSurface: 'surface.delete' })[directive.op] || directive.op;
  if (tiers.requiresApprovalBeforeExecute(actionType)) {
    wireLog.line({ verdict: 'queued_approval', hamUid: hamUid, op: directive.op, gate: 'tier', origin: origin });
    return { ok: false, gate: 'tier', reason: 'requires_approval' };
  }
  const r = sessionTargetFn(directive);
  wireLog.line({ verdict: r.delivered ? 'delivered' : 'buffered', hamUid: hamUid, op: directive.op, eventId: r.id, origin: origin });
  return { ok: true, id: r.id, delivered: !!r.delivered };
}

// ---- Phase 3: the consumer pass. Woken like other organs (route below hits this). ----
async function runScreenPass(opts) {
  opts = opts || {};
  if (!_bu() || !_bk()) return { ok: false, reason: 'no brain env' };
  const stats = registry.stats();
  if (stats.hams === 0) return { ok: true, skipped: 'no_live_sessions', delivered: 0 };

  const windowMin = parseInt(process.env.SCREEN_WINDOW_MIN || '30', 10);
  const since = new Date(Date.now() - windowMin * 60000).toISOString();
  const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=id,source,ham_uid,summary,content,importance,created_at'
    + '&stamp_type=eq.EXIT_DECISION&created_at=gte.' + encodeURIComponent(since)
    + '&order=created_at.desc&limit=' + (opts.limit || 10), { headers: rh() })
    .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });

  let delivered = 0, considered = 0;
  const receipts = [];
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];
    considered++;
    // Conservative trigger 1: only if this HAM has a live session right now.
    if (!hasLiveSession(d.ham_uid)) continue;

    let content = {}; try { content = typeof d.content === 'string' ? JSON.parse(d.content) : (d.content || {}); } catch (e) {}
    // Conservative trigger 2: CC-and-above exits only.
    if (SCREEN_EXITS.indexOf(content.exit) === -1) continue;
    // Conservative trigger 4: hollow-skip.
    const summary = String(d.summary || '').trim();
    if (!summary) continue;
    // Conservative trigger 3: idempotent per decision.
    const deliverySource = 'screen.delivery.' + d.id;
    const already = await brain.readBead({ source: 'eq.' + deliverySource, select: 'source', limit: '1' }).catch(function () { return []; });
    if (already && already.length) continue;

    const surfaceId = 'overseer_' + d.id;
    const create = vocab.createSurface(surfaceId, { region: 'overseer', title: '[' + content.exit + '] Overseer' });
    const update = vocab.updateComponents(surfaceId, [
      { type: 'card', importance: d.importance, exit: content.exit, confidence: content.confidence_used, text: summary },
      { type: 'lineage', organ: content.lineage && content.lineage.organ_source }
    ]);
    const r1 = gatedPush(d.ham_uid, function (dir) { return registry.pushToHam(d.ham_uid, 'directive', dir); }, create, 'screen_consumer');
    const r2 = r1.ok ? gatedPush(d.ham_uid, function (dir) { return registry.pushToHam(d.ham_uid, 'directive', dir); }, update, 'screen_consumer') : r1;
    if (!r1.ok || !r2.ok) continue;
    delivered++;
    receipts.push({ decision: d.id, exit: content.exit });
    await brain.writeBead({
      hamUid: d.ham_uid, agentGlobal: 'WIRE', source: deliverySource, type: 'SCREEN_DELIVERY',
      content: { exit: content.exit, surfaceId: surfaceId, organ: content.lineage && content.lineage.organ_bead },
      summary: '[SCREEN] mirrored ' + content.exit + ' decision to live screen: ' + summary.slice(0, 80),
      importance: 4,
      edges: [{ type: 'delivers', target: 'exit.decision.' + d.id }]
    }).catch(function () {});
  }
  return { ok: true, considered: considered, delivered: delivered, receipts: receipts, liveHams: stats.hams };
}

// A HAM counts as live only if at least one of its sessions has a connected response.
function hasLiveSession(hamUid) {
  let liveFound = false;
  registry._buffers.forEach(function (b, sid) {
    if (b.hamUid === hamUid && registry._live.has(sid)) liveFound = true;
  });
  return liveFound;
}

// ---- Phase 6: world context on connect. Composed from the brain, pushed as the first
// real surface when a session opens, so the screen wakes already knowing the world. ----
async function composeWorldContext(hamUid) {
  if (!_bu() || !_bk()) return null;
  // \u2b21B:core.reach.screen_consumer:FIX:world_rail_is_his_life_not_machine_20260712\u2b21
  // Founder: the WORLD RIGHT NOW rail was showing EXIT_DECISION/Opus/build machinery
  // that means nothing to him. It should be HIS life: reminders, advisor updates,
  // things worth knowing today. Repointed to person-facing stamp types only, read
  // dynamically from HIS record (nothing hardcoded). Internal build stamps
  // (EXIT_DECISION, MILESTONE, DOCTRINE, RALLY, AUDIT, SYNC, RESPEC) are excluded.
  const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=summary,stamp_type,importance,created_at'
    + '&ham_uid=eq.' + encodeURIComponent(hamUid)
    + '&stamp_type=in.(REMINDER,ADVISOR,BRIEF,NUDGE,INSIGHT,ALERT,TASK,CALENDAR,EMAIL,LIFE)&importance=gte.4'
    + '&order=created_at.desc&limit=6', { headers: rh() })
    .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  if (!rows.length) return null; // hollow-skip: nothing for him today, so no rail at all
  // \u2b21B:core.reach.screen_consumer:FIX:world_context_speaks_human_20260711\u2b21 same
  // law as /os/world: bracket-blocks and telemetry husks never reach the founder's
  // rail; if nothing human survives, no card at all (hollow-skip, never plumbing).
  const items = [];
  rows.forEach(function (r) {
    var t = String(r.summary || '');
    t = t.replace(/\[[^\]]*\]/g, ' ').replace(/\b(conf|air|tasks|healed|recon|EANEW|EXIT|OPUS|CLAIR|seat|builds):[^\s]*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (/HEAL|RESPEC|CANON|\.js\b|shipped with|hold\(s\)|agents?\/|core\/|routes?\/|FOR PAI|friction signal|self-review|no-tool|silent turn|real fix|advisors?\/|CANEW|station\(s\)|repeating the same failure/i.test(String(r.summary||''))) return; if (t.length < 20) return; // husk, nothing human left
    // a friendly label instead of the raw stamp_type
    var label = ({ REMINDER: 'Reminder', ADVISOR: 'From your advisors', BRIEF: 'Worth knowing', NUDGE: 'A nudge', INSIGHT: 'Insight', ALERT: 'Heads up', TASK: 'To do', CALENDAR: 'On your calendar', EMAIL: 'In your inbox', LIFE: 'Your world' })[r.stamp_type] || 'Worth knowing';
    items.push({ type: 'context_item', kind: label, importance: r.importance, text: t.slice(0, 140) });
  });
  if (!items.length) return null;
  return {
    create: vocab.createSurface('world_context', { region: 'context', title: 'World right now' }),
    update: vocab.updateComponents('world_context', items)
  };
}

async function pushWorldContext(hamUid, sessionId) {
  const ctx = await composeWorldContext(hamUid);
  if (!ctx) return { ok: false, reason: 'no_context' };
  const toSession = function (dir) { return registry.pushToSession(sessionId, 'directive', dir); };
  const r1 = gatedPush(hamUid, toSession, ctx.create, 'connect_context');
  if (!r1.ok) return r1;
  return gatedPush(hamUid, toSession, ctx.update, 'connect_context');
}

module.exports = { runScreenPass, composeWorldContext, pushWorldContext, gatedPush, hasLiveSession, checkInterruptionBudget };
