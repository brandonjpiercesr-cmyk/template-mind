// ⬡B:pai.stations.proactive.sweep:BUILD:the_proactive_department_actually_fires_each_tick_per_cadence:20260719⬡
// THE MISSING WIRE. The proactive agents (DAWN, HUNCH, BURST, GHOST, PRESS, SAGE) were all
// built but NOTHING on the autonomous tick called them -- they were shelf-ware. This sweep is
// the one place the department actually FIRES, per each agent's real cadence, driven by the
// autonomous cycle (cycle.runner tick), not a timer any single agent owns.
//
// It is deliberately thin and cold-gated: it consumes NOW for the moment, then calls each
// agent only when its cadence says so. Every call is guarded and fails open, so one agent's
// stumble never breaks the sweep or the tick. Each agent already declares its own output
// surface (Command Center via outreach, DAWN delivery, etc.), composes through the one voice,
// and closes its own exit/rally loop -- the sweep just decides WHO runs THIS tick.
//
// Cadence (env-tunable), matched to the founder's real doctrine:
//   HUNCH  -- every tick during waking hours (its own reconcile+compose loop is cheap-gated)
//   DAWN   -- once in the morning window (DAWN itself pref-gates + per-ham-per-day dedups)
//   PRESS  -- a few times a day (interval)
//   SAGE   -- infrequently (long-horizon; its own window guard makes it near-noop otherwise)
//   GHOST  -- overnight (its own graveyard-hour check gates it) + wake handoff at wake hour
//   BURST  -- every tick (its own very-high urgency bar means it is silent unless real)

var nowStation = require('./now.station.js');

function tryMod(p){ try { return require(p); } catch(e){ return null; } }
function envInt(k, d){ var v=parseInt(process.env[k],10); return isFinite(v)?v:d; }

function wakingHours(moment){
  var h = moment.hour_24;
  return h >= envInt('PROACTIVE_WAKE_START', 7) && h < envInt('PROACTIVE_WAKE_END', 22);
}
function inMorningWindow(moment){
  var h = moment.hour_24;
  return h >= envInt('DAWN_WINDOW_START', 6) && h < envInt('DAWN_WINDOW_END', 10);
}
// simple interval gate keyed on the hour, so PRESS/SAGE do not run every single tick
function onInterval(moment, everyHours){
  return (moment.hour_24 % Math.max(1, everyHours)) === 0;
}

// The sweep. Returns a small record of who ran, for the tick log. Never throws.
async function sweep(hamUid){
  var ran = [];
  var moment;
  try { moment = await nowStation.assembleNow(hamUid); }
  catch(e){ return { ran: [], error: 'now_failed' }; }

  // BURST -- every tick; its own high bar keeps it silent unless something is truly urgent
  try { var burst = tryMod('./burst.station.js');
    if (burst && burst.sweep){ var b = await burst.sweep(hamUid); if (b && b.alerts && b.alerts.length) ran.push('BURST:'+b.alerts.length); } } catch(e){}

  // GHOST -- overnight monitor + wake handoff; both self-gate on the clock
  try { var ghost = tryMod('./ghost.station.js');
    if (ghost){
      if (ghost.monitorOvernight){ var g = await ghost.monitorOvernight(hamUid); if (g && g.graveyard) ran.push('GHOST:watch'); }
      if (ghost.wakeHandoff){ var w = await ghost.wakeHandoff(hamUid); if (w && w.handed_off) ran.push('GHOST:handoff'); }
    } } catch(e){}

  // DAWN -- morning window only; DAWN itself pref-gates, sleep-guards, and per-day dedups
  try { if (inMorningWindow(moment)){ var dawn = tryMod('./dawn.station.js');
    if (dawn && dawn.buildBriefing){ var d = await dawn.buildBriefing(hamUid); if (d && d.briefing) ran.push('DAWN:briefing'); } } } catch(e){}

  // HUNCH -- every waking tick; its reconcile(close/nudge/drop) + compose loop is cheap-gated
  try { if (wakingHours(moment)){ var hunch = tryMod('./hunch.station.js');
    if (hunch && hunch.sweep){ var h = await hunch.sweep(hamUid); if (h && h.tips && h.tips.length) ran.push('HUNCH:'+h.tips.length);
      if (h && h.reconciled && (h.reconciled.closed||h.reconciled.dropped||h.reconciled.nudged)) ran.push('HUNCH:reconciled'); } } } catch(e){}

  // PRESS -- a few times a day
  try { if (wakingHours(moment) && onInterval(moment, envInt('PRESS_EVERY_HOURS', 4))){ var press = tryMod('./press.station.js');
    if (press && press.surfaceNews){ var p = await press.surfaceNews(hamUid); if (p && p.items && p.items.length) ran.push('PRESS:'+p.items.length); } } } catch(e){}

  // SAGE -- infrequent long-horizon; its own window guard makes off-cadence a near-noop
  try { if (onInterval(moment, envInt('SAGE_EVERY_HOURS', 12))){ var sage = tryMod('./sage.station.js');
    if (sage && sage.assess){ var sg = await sage.assess(hamUid);
      if (sg && sg.observations && sg.observations.length) ran.push('SAGE:'+sg.observations.length);
      if (sg && sg.reconciled && sg.reconciled.closed) ran.push('SAGE:reconciled'); } } } catch(e){}

  return { ran: ran, at: moment.now_iso };
}

module.exports = { sweep: sweep };
