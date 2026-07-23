// ⬡B:core.reach.wonder:MODULE:reach_decision_organ_llm_thinking_with_cold_code:20260722⬡
// THE REACH DECISION ORGAN (Phase 2 of the Envolve Coronation: reach becomes a wonder)
// -------------------------------------------------------------------------------------
// The old exit decision was a cold threshold table (core/overseer/exit.space.js chooseExit):
// confidence and an importance number mapped to a channel. That table is a good SAFETY WALL
// but a poor DECIDER, exactly the wonder-first line the founder drew: cold code can HELP, never
// RESULT. This organ is the mind that decides which way A'NU reaches the founder, and the cold
// table stays underneath it as the bound and the floor.
//
// PROVENANCE: A'NU's own ruling, consulted live through her real gate (/cara/chat, cycleId
// DC499D0C.1784706460725.olv0tp, 20260722). Her words, kept faithfully in the system prompt below,
// are the whole logic: reach at all only when it changes what he would do next, most things are a
// quiet note, a text is for what shifts his next few hours, a call is the narrow urgent-and-
// irreversible band, email is almost never a reach, and some categories always reach him now. And
// the tone law: never open with the machinery, say the thing that happened in the world.
//
// WHAT IT IS (Wonder Contract, bucket one): an LLM thinking with cold code. Cold code (chooseExit)
// fetches the bounded region for this confidence and importance; the LLM organ judges the ONE exit
// inside that region the way A'NU would, and composes the world-tone line; the cold validateExit
// wall refuses any pick outside the region; when the model is unavailable the cold choice stands.
//   WHO:   any HAM (universal, no hardcoded identity, the 847392 test).
//   WHAT:  given one finding (its summary, content, importance, confidence), decides the exit
//          channel A'NU would choose and writes the one human line she would open with.
//   WHEN:  the overseer exit pass fires it per high-importance finding, before anything is sent.
//   WHERE: returned to the exit tool, which stamps the EXIT_DECISION bead the reach layer consumes.
//          It NEVER speaks or sends (granddaddy-911); it decides, the reach layer sends on its laws.
//   WHY:   which way to reach a person is a judgment over what the thing means to him, not a
//          number over a threshold; the number bounds the judgment, it does not make it.
//   HOW:   cold chooseExit bounds the region, the mind picks inside it and flags a call-worthy
//          escalation when her always-reach categories hit, validateExit enforces the bound, and
//          the cold choice is the floor when the mind is unavailable. Never throws.
'use strict';

var space = require('./overseer/exit.space.js');
var ladder = require('./model.ladder.js');

var NAME = 'REACH';
var TIER = 'C2';

// A'NU's ruling, faithful, as the system prompt. This is her judgment written down, not invented.
function buildSystemPrompt() {
  return [
    'You are the reach decision organ. You judge which way A’NU reaches the person she serves. You are a work that feeds the reach layer; you never speak to anyone and you never send anything, you only decide.',
    'A cold table already bounded the allowed channels for this finding. You choose the ONE channel A’NU would choose from the allowed set, and you write the one human line she would open with.',
    'A’NU’s own ruling, follow it exactly:',
    'Reach at all only when it changes what the person would do next, not when it just describes what already happened. Most things are a quiet note that sits on his screen until he looks: routine completions, system health, progress, his own creative work, and anything you are uncertain about.',
    'A quiet note is the COMMAND_CENTER channel, or LOGFUL when it is pure record. Choose it for most things.',
    'A TEXT is for something he would want to know soon because it shifts his mood or his plan for the next few hours, but it is not an emergency and does not need his voice. Say what it is, what you think he would want to do, and that he can answer whenever he gets a breath.',
    'EMAIL is almost never a reach out. Use it only when the thing needs a record or has paperwork he must read. If you are reaching him, a text or a quiet note is almost always better.',
    'The one place email is exactly right, by his own ask: when the finding is your own advisor report or digest addressed to him, the standing record he asked to receive in his inbox (its kind is an advisor report or inbox digest). That is a record he must read, not an alert interrupting him, so when the allowed set permits EMAIL choose EMAIL for it. This is the record case above, not a new rule.',
    'Some things always reach him right away, and those you must flag as call worthy: anything about the safety or wellbeing of his children, anything legal with a real deadline running, anything not routine from his partner Eric, anything that touches the ownership of the company or the AI entity, and anything where he would be angry to find out you knew and did not tell him. When any of these is true set call_worthy true, and choose the strongest channel the allowed set permits.',
    'When the finding is low confidence and the allowed set is a review channel, choose the review channel: it is better to have a second look than to reach on a shaky read.',
    'THE TONE LAW: never open with the machinery. Never say an agent did a task or a process ran. Say the thing that happened in the world, the way someone who actually knows him would say it. He is not a system admin reading alerts, he is a man with a family and a company he built and work he cares about.',
    'Choose ONLY from the allowed channels given to you. Reply with ONLY one JSON object, no prose, no fences: {"exit":"<one of the allowed channels>","call_worthy":<boolean>,"world_line":"<the one human line to open with, full and plain, never the machinery, never a terse fragment>","reasoning":"<internal why>"}'
  ].join(' ');
}

function safeStr(v) { return v == null ? '' : String(v); }
function stripDashes(s) { return safeStr(s).replace(new RegExp('[\\u2014\\u2013]', 'g'), ', '); }

function extractJson(text) {
  var s = safeStr(text).trim();
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  var first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { return null; }
}

// The cold floor, always available: the bounded region and the cold pick. Never throws.
function coldDecision(confidence, importance) {
  try { return space.chooseExit(confidence, importance); }
  catch (e) { return { ok: false, refused: true, reason: 'cold_choose_threw' }; }
}

// THE ORGAN. judgeExit(finding, opts) -> a decision object. finding: { summary, content, importance,
// confidence }. Returns { ok, exit, region, call_worthy, world_line, reasoning, source, cold_exit }.
// source is 'llm' when the mind decided within the region, 'floor' when it fell back to the cold pick.
// Never throws: any failure returns the cold decision so an exit is never left undecided.
async function judgeExit(finding, opts) {
  var options = opts || {};
  var f = (finding && typeof finding === 'object') ? finding : {};
  var confidence = Number(f.confidence);
  var importance = Number(f.importance);
  var cold = coldDecision(confidence, importance);
  // If the cold space itself refused (out of schema), there is nothing to bound the mind with;
  // return the refusal untouched. The wall stays the wall.
  if (!cold.ok) return { ok: false, refused: true, reason: cold.reason, source: 'floor' };

  var floorOut = { ok: true, exit: cold.exit, region: cold.region, call_worthy: false,
    world_line: stripDashes(f.summary), reasoning: 'Cold bounded pick; mind unavailable.',
    source: 'floor', cold_exit: cold.exit };

  var deliberate = (options && typeof options.deliberate === 'function') ? options.deliberate : ladder.deliberate;
  if (typeof deliberate !== 'function') return floorOut;

  var user = [
    'FINDING (what an organ surfaced this window):',
    'summary: ' + safeStr(f.summary).slice(0, 600),
    'detail: ' + safeStr(typeof f.content === 'string' ? f.content : JSON.stringify(f.content || {})).slice(0, 1200),
    'importance (1 to 10): ' + (isFinite(importance) ? importance : 'unknown'),
    'confidence (0 to 1): ' + (isFinite(confidence) ? confidence : 'unknown'),
    '',
    'ALLOWED CHANNELS for this finding (choose exactly one of these, nothing else): ' + JSON.stringify(cold.region),
    'The cold table would have chosen: ' + cold.exit,
    '',
    'Return the JSON with your channel, whether it is call worthy, and the one human line.'
  ].join('\n');

  var ruling;
  try {
    ruling = await deliberate(buildSystemPrompt(), user, { json: true, max_tokens: 700, temperature: 0.2, timeout: 45000 });
  } catch (e) { return floorOut; }
  if (!ruling || !ruling.content) return floorOut;

  var parsed = extractJson(ruling.content);
  if (!parsed || typeof parsed !== 'object') return floorOut;

  var pick = safeStr(parsed.exit).trim().toUpperCase();
  // THE WALL: the mind's pick must fall inside the cold region for this finding, or the cold pick stands.
  var wall;
  try { wall = space.validateExit(pick, confidence, importance); }
  catch (e) { wall = { ok: false }; }
  if (!wall || !wall.ok) return floorOut;

  var line = stripDashes(safeStr(parsed.world_line).trim());
  if (!line) line = stripDashes(safeStr(f.summary));

  return {
    ok: true,
    exit: pick,
    region: cold.region,
    call_worthy: parsed.call_worthy === true,
    world_line: line,
    reasoning: safeStr(parsed.reasoning).slice(0, 300) || 'Judged by A’NU’s reach ruling.',
    source: 'llm',
    cold_exit: cold.exit,
    model: ruling.model, via: ruling.via
  };
}

module.exports = { judgeExit: judgeExit, NAME: NAME, TIER: TIER,
  _test: { buildSystemPrompt: buildSystemPrompt, coldDecision: coldDecision, extractJson: extractJson } };
