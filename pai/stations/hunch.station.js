// ⬡B:pai.stations.hunch:BUILD:hunch_wonder_the_cupcakes_catcher_helpful_unsolicited_hints:20260719⬡
// PROACTIVE department. HUNCH = Helpful Unsolicited Notifications and Contextual Hints:
// the proactive tips engine that pushes advice throughout the day WITHOUT being asked.
// The founder's defining example (doctrine.logful.proactive_hunch_law): the HAM is at a
// store asking for 2 cupcakes; a nearby sign reads "Buy 4, get 50% off"; the HAM did not
// see it; A'NU (via the eyes device) sees the sign; HUNCH fires: "boss, look up -- buy 4."
//
// THE LAW: A'NU catches what the HAM misses. She is always processing ambient context. When
// her data CONTRADICTS the HAM's action -- or reveals an opportunity/pattern/reminder he
// would want -- HUNCH fires BEFORE he commits. Examples: "You have a meeting with Eric in 30
// minutes; last time you discussed the Q2 proposal -- want it pulled up?"; the cupcake sign.
//
// HUNCH is an ORGAN: whether a piece of ambient context is worth interrupting the HAM for is
// a judgment of meaning and timing, so an LLM decides through the ONE ladder (never a rogue
// call). It CONSUMES NOW for timing (a 30-minutes-before nudge needs the real moment) and
// never resolves time itself. It routes to an approval queue, not straight to the HAM, and
// honors silence-over-noise hard: an unsolicited interruption that is not clearly worth it
// must NOT fire. Better to stay quiet than to nag.
//
// Entrance: called on the proactive sweep / when ambient context arrives through AIR. Exit:
//   zero or more hints {hint, why_now, confidence, contradicts_action?}, or nothing. Notes:
//   a bead per fired hint with lineage for dedup so the same tip never nags twice.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// The confidence cascade: an unsolicited interruption has a HIGH bar. A hint only fires
// when the organ's confidence that it is worth interrupting clears the threshold. Env-
// tunable; defaults deliberately high so HUNCH stays quiet unless it is clearly helpful.
function fireThreshold() {
  var v = parseFloat(process.env.HUNCH_FIRE_THRESHOLD);
  return isFinite(v) ? v : 0.72;
}

// The organ. Given the current moment, the ambient context (what A'NU is seeing/hearing
// or what just flowed through AIR), the HAM's pending action if any, and what HUNCH already
// said, decide what -- if anything -- is worth surfacing. Returns [] when nothing clears the
// bar (silence over noise). Judgment routes through the ladder.
async function judgeHints(hamUid, moment, ambient, pendingAction, alreadyFired) {
  if (!ambient || (Array.isArray(ambient) && !ambient.length)) return [];
  try {
    var sys =
      'You are HUNCH, the helpful-unsolicited-hints organ for one person. It is ' +
      moment.day_name + ' ' + moment.part_of_day + ' ' + moment.local_time + '. From the ' +
      'ambient context, surface ONLY notifications that clearly help this person right now: ' +
      'an opportunity he is about to miss (a sign/offer his action contradicts), a timely ' +
      'reminder (a meeting soon and what it was about), or a pattern worth flagging. Return a ' +
      'JSON array of {hint, why_now, confidence (0-1), contradicts_action (bool)}. The bar is ' +
      'HIGH: an unsolicited interruption must be clearly worth it or you return []. Never nag, ' +
      'never invent. His pending action: ' + JSON.stringify(pendingAction || null) +
      '. Already surfaced (do not repeat): ' + JSON.stringify((alreadyFired || []).slice(0, 20));
    var out = await ladder.deliberate(sys,
      (Array.isArray(ambient) ? ambient.join('\n') : String(ambient)),
      { json: true, max_tokens: 600, timeout: 25000 });
    var text = out && out.content != null ? out.content : '';
    var arr = JSON.parse(String(text).replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) return [];
    // confidence cascade: only keep hints that clear the fire threshold
    var t = fireThreshold();
    return arr.filter(function (h) {
      var c = typeof h.confidence === 'number' ? h.confidence : 0;
      // a hint that CONTRADICTS an action the HAM is about to take (the cupcake case) is
      // more valuable -- give it a small edge, but never below a floor.
      if (h.contradicts_action) c += 0.1;
      return c >= t;
    }).slice(0, 3);
  } catch (e) { return []; }
}

// Entrance. Watch the ambient context and fire the hints worth firing. Consumes NOW.
async function watch(hamUid, ambient, pendingAction) {
  var moment = await nowStation.assembleNow(hamUid);      // consume NOW, no twin
  var fired = await recentlyFired(hamUid);
  var hints = await judgeHints(hamUid, moment, ambient, pendingAction, fired);
  for (var i = 0; i < hints.length; i++) { queueHint(hamUid, hints[i], moment).catch(function () {}); }
  // routes to the approval queue via the stamped bead; the Overseer/CeeCee lane delivers.
  return { moment: moment, hints: hints };  // hints may be [] -- silence over noise
}

async function recentlyFired(hamUid) {
  try {
    var url = _bu() + '/rest/v1/' + _tbl() +
      '?select=summary&source=ilike.hunch.station.hint.' + String(hamUid).toLowerCase() + '*' +
      '&order=id.desc&limit=20';
    var r = await fetch(url, { headers: {
      apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema()
    }, signal: AbortSignal.timeout(8000) }).then(function (x) { return x.json(); });
    return (Array.isArray(r) ? r : []).map(function (b) { return b.summary; });
  } catch (e) { return []; }
}

async function queueHint(hamUid, hint, moment) {
  try {
    var bead = {
      ham_uid: hamUid, agent_global: 'HUNCH', stamp_type: 'HINT',
      acl_stamp: '\u2b21B:hunch.hint:HINT:proactive_tip_queued_for_approval:' +
        moment.now_iso.slice(0, 10).replace(/-/g, '') + '\u2b21',
      source: 'hunch.station.hint.' + hamUid,
      summary: '[HUNCH] ' + String(hint.hint || '').slice(0, 120),
      importance: hint.contradicts_action ? 6 : 5,
      spawned_by: 'hunch.station.' + hamUid,
      content: JSON.stringify(hint)
    };
    await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json',
        'Content-Profile': _schema(), 'Accept-Profile': _schema(), Prefer: 'return=minimal' },
      body: JSON.stringify(bead), signal: AbortSignal.timeout(8000)
    });
  } catch (e) { /* best-effort */ }
}

module.exports = { watch: watch, judgeHints: judgeHints, fireThreshold: fireThreshold };
