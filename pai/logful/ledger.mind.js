// ⬡B:logful.ledger_mind:MODULE:grandmother_911_the_mind_that_names_the_owner:20260726⬡
// LOGFUL'S MISSING MIND. The founder called LOGFUL "the missing wonder". LOGFUL was
// present and mindless: every file under logful/ was cold code, so the two ledger
// fields that are judgments (field five, where she had room for improvement, and
// field six, WHICH WONDER IS NOW OWNING THIS) were being filled by cold code, and
// field six was a hardcoded literal 'LOGFUL' on every entry ever written, which
// defeats the entire point of the field.
//
// ENTRANCE: called once, at the one common exit of the live turn (core/tool.loop.js
// runPAI), through logful/turn.ledger.js. It never enters on its own.
// EXIT: a judgment object handed back to the ledger carrier, which files it as a
// six-field bead. This organ writes nothing itself and reaches nobody: it is a WORK
// that FEEDS the one wonder, per GRANDDADDY 911. No persona, no voice, no human.
// NOTES: exactly ONE model call per turn, small, cheap, penny hustle. The roster it
// names an owner from is the REAL live roster (core/wonders/registry.js, required at
// index.js and consumed by the mounted Wonder Agent anatomy), never a list written
// here. The owner it returns is validated back against that roster, so the mind
// cannot invent a wonder that does not exist. If the ladder is down, or the mind
// honestly names no owner, this returns ok:false with the reason and the carrier
// refuses the entry: ok:false over a hollow stamp, never a fallback literal.
'use strict';

var ladder = require('../core/model.ladder.js');
var registry = require('../core/wonders/registry.js');

// The real roster, read live from the operational graph. A wonder that is retired
// cannot own next steps, so only nodes the graph itself calls active or contained
// are offered; the mind may not reach past what actually exists.
function roster() {
  var nodes = [];
  try { nodes = registry.list() || []; } catch (eList) { nodes = []; }
  return nodes.filter(function (n) {
    return n && n.id && (n.lifecycle === 'active' || n.lifecycle === 'contained');
  }).map(function (n) {
    return {
      id: n.id,
      name: n.display_name || n.id,
      kind: n.kind || 'wonder',
      lifecycle: n.lifecycle,
      does: String(n.technical_role || n.product_role || '').slice(0, 160)
    };
  });
}

var SYSTEM = [
  'You are LOGFUL, the memory-of-work organ of an ACL-stamped system. A governed turn',
  'has just finished. You are handed only the real, already-recorded facts of that turn.',
  'You produce three judgments for the track-and-trace ledger, and nothing else.',
  '',
  'improvement: where this turn actually had room for improvement. Judge the facts you',
  '  were given. If the turn was clean, say plainly that it was clean and why. Never',
  '  invent a fault that the facts do not show.',
  'next_steps: what genuinely comes next after this turn. If nothing is owed, say so',
  '  plainly. Never invent work.',
  'owner: WHICH WONDER OWNS WHAT COMES NEXT. You must answer with the exact id of one',
  '  entry in the ROSTER you are given, copied character for character. If no roster',
  '  entry honestly owns the next step, answer exactly "none" and say why in',
  '  owner_reason. Never name anything that is not in the roster.',
  'owner_reason: one plain factual sentence for why that wonder owns it, or why none does.',
  '',
  'This is work-product for a calling cycle, not a human-facing voice: no persona, no',
  'warmth, no greeting, plain factual sentences. Never use the character sequence',
  'space hyphen space. Reply with ONLY one JSON object:',
  '{"improvement":"...","next_steps":"...","owner":"...","owner_reason":"..."}'
].join('\n');

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

// judgeTurn(facts) -> {ok:true, improvement, nextSteps, owner, ownerDisplay,
//                      ownerReason, model, via, rosterSize}
//                   | {ok:false, reason}
// facts: the caller's real, already-recorded run data. This organ adds no facts.
async function judgeTurn(facts, deps) {
  var d = deps || {};
  var deliberate = d.deliberate || ladder.deliberate;
  var list = (d.roster || roster)();
  if (!list.length) return { ok: false, reason: 'ledger_mind_roster_empty' };
  var ids = {};
  list.forEach(function (n) { ids[n.id] = n; });

  var user = 'ROSTER (the only wonders that exist right now):\n'
    + JSON.stringify(list, null, 0)
    + '\n\nTURN FACTS (already recorded, nothing else happened):\n'
    + JSON.stringify(facts || {}, null, 0);

  var out;
  try {
    out = await deliberate(SYSTEM, user, { json: true, max_tokens: 600,
      temperature: 0.2, timeout: 20000, tightTimeout: true });
  } catch (eDel) { return { ok: false, reason: 'ledger_mind_threw:' + eDel.message }; }
  if (!out || !nonEmpty(out.content)) {
    return { ok: false, reason: 'ledger_mind_unreachable_no_rung_answered' };
  }
  var verdict = null;
  try {
    var parsed = JSON.parse(out.content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) verdict = parsed;
  } catch (eParse) { verdict = null; }
  if (!verdict) return { ok: false, reason: 'ledger_mind_returned_unparseable_json' };

  var improvement = nonEmpty(verdict.improvement);
  var nextSteps = nonEmpty(verdict.next_steps || verdict.nextSteps);
  var ownerRaw = nonEmpty(verdict.owner);
  var ownerReason = nonEmpty(verdict.owner_reason || verdict.ownerReason);
  if (!improvement) return { ok: false, reason: 'ledger_mind_named_no_improvement' };
  if (!nextSteps) return { ok: false, reason: 'ledger_mind_named_no_next_steps' };
  if (!ownerRaw) return { ok: false, reason: 'ledger_mind_named_no_owner' };
  if (ownerRaw.toLowerCase() === 'none') {
    // The mind ruled honestly that no live wonder owns what comes next. That is a
    // real answer, and it is NOT an owner, so no entry is filed with a stand-in.
    return { ok: false, reason: 'ledger_mind_ruled_no_owner: '
      + (ownerReason || 'no roster wonder owns the next step') };
  }
  if (!ids[ownerRaw]) {
    return { ok: false, reason: 'ledger_mind_named_a_wonder_off_the_roster: ' + ownerRaw };
  }
  return { ok: true, improvement: improvement, nextSteps: nextSteps,
    owner: ownerRaw, ownerDisplay: ids[ownerRaw].name,
    ownerReason: ownerReason || 'named by LOGFUL from the live roster',
    model: out.model || null, via: out.via || null, rosterSize: list.length };
}

module.exports = { judgeTurn: judgeTurn, roster: roster, SYSTEM: SYSTEM };
