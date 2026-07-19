// ⬡B:pai.stations.dawn:BUILD:dawn_daily_automated_wisdom_notifier_briefing_orchestrator:20260719⬡
// PROACTIVE department. DAWN = Daily Automated Wisdom Notifier: generates the personalized
// morning briefing for a HAM. It is the ORCHESTRATOR that ties the proactive agents
// together (legacy spec: three-stage pipeline calling IMAN, RADAR, PRESS, NASH, SOUL, NOW).
//
//   (1) GENERATE  -- call the available context agents in parallel, each fails open so one
//                    quiet agent never sinks the briefing.
//   (2) ASSEMBLE  -- an ORGAN turns the gathered context into a short, spoken-style briefing
//                    through the ONE ladder (no rogue call). Meaning/tone is the organ's job.
//   (3) DELIVER   -- stamp the briefing as a bead the Overseer/reach lane delivers on the
//                    HAM's preferred channel. DAWN does not send outbound itself.
//
// DAWN CONSUMES NOW for the moment and calls the other stations rather than reimplement
// them (no twins). Every agent call is guarded so a missing/erroring agent is simply absent
// from the briefing, never a crash. Silence over hollow: if nothing was gathered, DAWN
// produces no briefing rather than an empty "good morning, nothing to report" shell.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// Try to load a sister station; return null if it is not present yet (agents land over
// time). DAWN degrades gracefully as more proactive agents come online.
function tryStation(name) {
  try { return require('./' + name + '.station.js'); } catch (e) { return null; }
}

// (1) GENERATE: gather context from whatever proactive agents exist, in parallel, each
// wrapped so a failure yields an absent section, never a thrown briefing.
async function generate(hamUid, moment) {
  var jobs = [];
  var press = tryStation('press');
  if (press && press.surfaceNews) {
    jobs.push(safe('news', press.surfaceNews(hamUid).then(function (r) { return r.items; })));
  }
  // NASH (sports) and other agents are called if their station exists; skipped cleanly if not.
  var nash = tryStation('nash');
  if (nash && nash.surfaceScores) jobs.push(safe('sports', nash.surfaceScores(hamUid)));
  var soul = tryStation('soul');
  if (soul && soul.surface) jobs.push(safe('reflection', soul.surface(hamUid)));
  // Calendar/day comes from NOW's moment (already have it) -- no separate call.
  var results = await Promise.all(jobs);
  var ctx = { moment: moment };
  results.forEach(function (r) { if (r && r.key && r.value != null) ctx[r.key] = r.value; });
  return ctx;
}

function safe(key, p) {
  return Promise.resolve(p).then(function (v) { return { key: key, value: v }; })
    .catch(function () { return { key: key, value: null }; });
}

// (2) ASSEMBLE: the organ writes the briefing. Meaning and tone are its job, through the
// one ladder. Returns null when there was nothing worth briefing (silence over hollow).
async function assemble(hamUid, ctx) {
  var sections = Object.keys(ctx).filter(function (k) { return k !== 'moment' && ctx[k] != null; });
  var hasContent = sections.some(function (k) {
    var v = ctx[k]; return Array.isArray(v) ? v.length > 0 : !!v;
  });
  if (!hasContent) return null; // nothing gathered -> no hollow shell
  try {
    var sys =
      'You are DAWN, writing a short spoken morning briefing for one person. It is ' +
      ctx.moment.day_name + ' ' + ctx.moment.part_of_day + ', ' + ctx.moment.date + '. ' +
      'Use only the gathered context; do not invent. Keep it brief and natural, the way a ' +
      'sharp chief of staff would greet them and hit the two or three things that matter ' +
      'this morning. If a section is empty, skip it silently.';
    var out = await ladder.deliberate(sys, JSON.stringify(ctx),
      { max_tokens: 500, timeout: 30000 });
    var text = out && out.content != null ? String(out.content).trim() : '';
    return text || null;
  } catch (e) { return null; }
}

// Entrance. Build (and stamp for delivery) the morning briefing. Consumes NOW.
async function buildBriefing(hamUid) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  var ctx = await generate(hamUid, moment);
  var briefing = await assemble(hamUid, ctx);
  if (!briefing) return { moment: moment, briefing: null };  // silence over hollow
  await stampBriefing(hamUid, briefing, moment).catch(function () {});
  return { moment: moment, briefing: briefing };
}

async function stampBriefing(hamUid, briefing, moment) {
  var bead = {
    ham_uid: hamUid, agent_global: 'DAWN', stamp_type: 'BRIEFING',
    acl_stamp: '\u2b21B:dawn.briefing:BRIEFING:morning_briefing_ready_for_delivery:' +
      moment.now_iso.slice(0, 10).replace(/-/g, '') + '\u2b21',
    source: 'dawn.station.briefing.' + hamUid,
    summary: '[DAWN] ' + moment.day_name + ' briefing: ' + briefing.slice(0, 100),
    importance: 6, spawned_by: 'dawn.station.' + hamUid,
    content: JSON.stringify({ briefing: briefing, moment: moment })
  };
  await fetch(_bu() + '/rest/v1/' + _tbl(), {
    method: 'POST',
    headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json',
      'Content-Profile': _schema(), 'Accept-Profile': _schema(), Prefer: 'return=minimal' },
    body: JSON.stringify(bead), signal: AbortSignal.timeout(8000)
  });
}

module.exports = { buildBriefing: buildBriefing, generate: generate, assemble: assemble };
