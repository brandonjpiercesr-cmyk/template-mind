// ⬡B:core.overseer.exit.space:MODULE:bounded_decision_space:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (every exit decision lands on a channel)
// L5 ITEM 3, PARAMETERS ENFORCED ONE LEVEL ABOVE THE COUNCIL. Overseer does
// not improvise its exit. This module IS the decision space: cold code, the
// same way ACW bounds what a C2 organ receives. The schema, the boundaries,
// and the escalation threshold live here, one level above the tool that uses
// them, and the tool has no path around this module. Bounds are env-tunable,
// the SHAPE of the space is not.
// COLD-CODE-BY-DESIGN, recorded: a decision space that deliberates about its
// own boundaries is not a boundary. What the space may NOT do, corrected 20260726: take
// the quiet options away. It caps how loud a finding is allowed to get; the mind chooses
// how loud it actually is, and silence is always on the table.
'use strict';

var EXITS = ['LOGFUL', 'COMMAND_CENTER', 'EMAIL', 'TEXT', 'OPUS_REVIEW'];
var LOW_CONF = parseFloat(process.env.EXIT_LOW_CONFIDENCE || '0.55');
var TEXT_IMPORTANCE = parseInt(process.env.EXIT_TEXT_IMPORTANCE || '9', 10);
var EMAIL_IMPORTANCE = parseInt(process.env.EXIT_EMAIL_IMPORTANCE || '7', 10);
var CC_IMPORTANCE = parseInt(process.env.EXIT_CC_IMPORTANCE || '5', 10);

// The space: given a validated confidence [0,1] and importance [1,10],
// return the ONE exit plus the full allowed set for that region, so a test
// can assert the choice fell inside the region and nowhere else.
function chooseExit(confidence, importance) {
  var c = Number(confidence), i = Number(importance);
  if (!(c >= 0 && c <= 1)) return { ok: false, refused: true, reason: 'confidence_out_of_schema' };
  if (!(i >= 1 && i <= 10)) return { ok: false, refused: true, reason: 'importance_out_of_schema' };
  // ⬡B:core.overseer.exit.space:GUARD:a_number_may_lower_the_ceiling_never_the_floor:20260726⬡
  // A REGION IS A CEILING, NOT A COMMAND. Until 20260726 importance 9 produced the region
  // ['TEXT','EMAIL'] and importance 7 produced ['EMAIL','COMMAND_CENTER']: a counting
  // function could delete quiet from the mind's options entirely. A'NU's own ruling, which
  // the reach organ carries word for word, is that most things are a quiet note. Cold code
  // was forbidding her from following it, and any detector that computes an importance
  // number (core/logful.hunch.js counts repeats; enrichment self-reports) could therefore
  // force an interruption without a mind agreeing.
  // Every region now runs down to LOGFUL. The bound the space exists to enforce is intact:
  // a number can never authorize a LOUDER channel than its band, and the wall still refuses
  // any pick above it. It simply cannot take silence away any more.
  var exit, region;
  if (c < LOW_CONF) { exit = 'OPUS_REVIEW'; region = ['OPUS_REVIEW']; }
  else if (i >= TEXT_IMPORTANCE) { exit = 'TEXT'; region = ['TEXT', 'EMAIL', 'COMMAND_CENTER', 'LOGFUL']; }
  else if (i >= EMAIL_IMPORTANCE) { exit = 'EMAIL'; region = ['EMAIL', 'COMMAND_CENTER', 'LOGFUL']; }
  else if (i >= CC_IMPORTANCE) { exit = 'COMMAND_CENTER'; region = ['COMMAND_CENTER', 'LOGFUL']; }
  else { exit = 'LOGFUL'; region = ['LOGFUL']; }
  return { ok: true, exit: exit, region: region, bounds: { lowConf: LOW_CONF, text: TEXT_IMPORTANCE, email: EMAIL_IMPORTANCE, cc: CC_IMPORTANCE } };
}

// The wall: any exit not produced through chooseExit gets refused here.
function validateExit(chosen, confidence, importance) {
  var d = chooseExit(confidence, importance);
  if (!d.ok) return d;
  if (d.region.indexOf(chosen) < 0) return { ok: false, refused: true, reason: 'exit_outside_decision_space', allowed: d.region, chosen: chosen };
  return { ok: true };
}

module.exports = { chooseExit: chooseExit, validateExit: validateExit, EXITS: EXITS };
