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
    'One more judgment, separate from the channel: a live screen he is actually looking at is its own surface. Set live_screen true only when this finding is worth appearing in front of him while he is sitting there, and false when it is a record he can find later. A quiet note is already that screen, so this only matters when you chose a channel other than COMMAND_CENTER. A cold list used to make this call for you; it is yours now, and false is a perfectly good answer.',
    'Choose ONLY from the allowed channels given to you. Reply with ONLY one JSON object, no prose, no fences: {"exit":"<one of the allowed channels>","call_worthy":<boolean>,"live_screen":<boolean>,"world_line":"<the one human line to open with, full and plain, never the machinery, never a terse fragment>","reasoning":"<internal why>"}'
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
// confidence, writer }. Returns { ok, exit, region, call_worthy, world_line, reasoning, source, cold_exit }.
// ⬡B:core.reach.wonder:FIX:the_finding_now_names_the_module_that_stamped_it:20260825⬡
// `writer` is new and optional. Founder ruling 20260815, the pen on her mind: a presenter that
// feeds a stored record into a mind's prompt carries the writer that stamped the row. This
// prompt already carried the row's weight and its words; it did not carry the module that put
// the row in the world, so a real finding a mind wrote and a row a scheduler stamped on a timer
// read identically to the mind deciding whether to interrupt a person. Its caller
// (core/overseer/exit.tool.js#runExitPass) already selects `source` on every row it reads and
// now hands it over. A caller that passes nothing is not invented a writer: the line below says
// exactly that no writer was stamped, in the founder's own wording. Carry, never classify: no
// trusted-writer list, no row dropped or reordered on the strength of a name.
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

  // ⬡B:core.reach.wonder:GUARD:the_floor_records_it_never_reaches:20260726⬡
  // SUPERSEDES a floor that returned cold.exit and the raw bead summary on five separate
  // paths: no deliberate function, a throw, an empty reply, unparseable JSON, and a pick
  // outside the region. On every one of them the mind said nothing, and cold code handed
  // back a REACHING channel (importance 9 and up is TEXT) plus a line to say. A threshold
  // read is not a decision to interrupt a person, and a bead summary is not her voice.
  // The floor now does the one thing a floor is for: it keeps the decision from being
  // undecided, as pure record. LOGFUL reaches nobody. The cold pick and the region it came
  // from are both kept on the decision so nothing is lost and the fall is auditable.
  var floorOut = { ok: true, exit: 'LOGFUL', region: cold.region, call_worthy: false,
    live_screen: false,
    world_line: null, reasoning: 'No mind answered; recorded only, nothing reached.',
    source: 'floor', cold_exit: cold.exit, floored_from: cold.exit };

  var deliberate = (options && typeof options.deliberate === 'function') ? options.deliberate : ladder.deliberate;
  if (typeof deliberate !== 'function') return floorOut;

  var writerName = safeStr(f.writer).replace(/\s+/g, ' ').trim().slice(0, 120);
  var user = [
    'FINDING (what an organ surfaced this window):',
    'summary: ' + safeStr(f.summary).slice(0, 600),
    'detail: ' + safeStr(typeof f.content === 'string' ? f.content : JSON.stringify(f.content || {})).slice(0, 1200),
    'written by: ' + (writerName || '(no writer stamp on the row)'),
    'importance (1 to 10): ' + (isFinite(importance) ? importance : 'unknown'),
    'confidence (0 to 1): ' + (isFinite(confidence) ? confidence : 'unknown'),
    '',
    'THE WRITER AND THE WEIGHT ARE FACTS, NOT VERDICTS. The written-by name is the MODULE that ' +
      'stamped this row into the world, never proof of who authored the words inside it: real ' +
      'words arrive through cold modules too. Some findings are a mind\'s real words and some ' +
      'are a fact a scheduler, template or retry stamped in, and you judge which is which by ' +
      'meaning, never by trusting the name. The importance is the number that writer picked ' +
      'when it stamped the row, never a ruling about whether this deserves anyone\'s ' +
      'attention: read a low number as "the writer thought this was small", never as "this was ' +
      'not worth showing you". Nothing was held back from you by weight. This name is internal ' +
      'bookkeeping and is never repeated to a person.',
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
    // ⬡B:core.reach.wonder:BUILD:the_live_screen_is_the_minds_call_too:20260726⬡
    // core/reach/screen.consumer.js used to decide this with a three-element array. It is
    // one more field of this one ruling now, so the screen has a decider instead of a list.
    live_screen: parsed.live_screen === true,
    world_line: line,
    reasoning: safeStr(parsed.reasoning).slice(0, 300) || 'Judged by A’NU’s reach ruling.',
    source: 'llm',
    cold_exit: cold.exit,
    model: ruling.model, via: ruling.via
  };
}

module.exports = { judgeExit: judgeExit, NAME: NAME, TIER: TIER,
  _test: { buildSystemPrompt: buildSystemPrompt, coldDecision: coldDecision, extractJson: extractJson } };
