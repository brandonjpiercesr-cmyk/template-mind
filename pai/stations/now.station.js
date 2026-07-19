// ⬡B:pai.stations.now:BUILD:now_wonder_navigating_ongoing_waypoints_proactive_first:20260719⬡
// PROACTIVE department, first build (A'NU + CODA ruled it: every other proactive agent
// needs current-moment context, so NOW is the single dependency). Build task bead 379679.
//
// NOW = Navigating Ongoing Waypoints. A SURFACE_AGENT that runs PRE-RUN and assembles the
// current moment: what time is it in the HAM's timezone, what part of day, what is on the
// calendar right now and next. Every other proactive agent (PRESS, GHOST, HUNCH...) reads
// this so it acts against a true present instead of guessing.
//
// Unlike SPAN, NOW is NOT an organ: resolving time, day, part-of-day and relative
// expressions is a deterministic FACT, so per the doctrine (cold code is a helper, and
// MAY detect facts) NOW is pure cold code -- no model call, no ladder. It reuses the
// existing calendar wiring rather than build a second calendar path, and reuses ATMOSPHERE
// for location rather than invent one (no twins).
//
// Entrance: called pre-run each cycle (or by any proactive agent) with the HAM uid.
// Exit: a current-moment context object {now_iso, tz, day_name, part_of_day, calendar_now,
//   calendar_next, ...} returned to the caller and stamped as a versioned bead.
// Notes: each assembly writes a bead with lineage so it is greppable and dedup works.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// The HAM's timezone. Env-configurable; defaults to America/New_York (the founder's tz,
// matching the AIR/heartbeat cadence). Never hardcoded to a single value in logic.
function hamTimezone() {
  return process.env.HAM_TIMEZONE || process.env.TZ || 'America/New_York';
}

// Cold: resolve the current moment in the HAM's timezone. No model, no network.
function resolveMoment(tz) {
  var now = new Date();
  var fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit',
      hour12: false, year: 'numeric', month: 'short', day: 'numeric'
    }).formatToParts(now).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
  } catch (e) {
    // bad tz -> fall open to UTC rather than throw and drop the moment
    fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: false,
      year: 'numeric', month: 'short', day: 'numeric'
    }).formatToParts(now).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
    tz = 'UTC';
  }
  var hour = parseInt(fmt.hour, 10);
  var partOfDay =
    hour < 5  ? 'late_night' :
    hour < 12 ? 'morning'   :
    hour < 17 ? 'afternoon' :
    hour < 21 ? 'evening'   : 'night';
  return {
    now_iso: now.toISOString(),
    tz: tz,
    day_name: fmt.weekday,
    date: fmt.month + ' ' + fmt.day + ', ' + fmt.year,
    local_time: fmt.hour + ':' + fmt.minute,
    hour_24: hour,
    part_of_day: partOfDay
  };
}

// Reuse the existing calendar logic. NOW does not build a second calendar integration;
// it asks the same schedule logic the calendar_read tool uses. Fails open (empty) so a
// calendar hiccup never blocks the moment.
async function calendarWindow(hamUid) {
  try {
    var sched = require('../core/schedule/schedule.logic.js');
    if (sched && typeof sched.readWindow === 'function') {
      return await sched.readWindow(hamUid);
    }
    if (sched && typeof sched.calendarRead === 'function') {
      return await sched.calendarRead(hamUid);
    }
  } catch (e) { /* fall open */ }
  return { calendar_now: null, calendar_next: null };
}

// Entrance. Assemble the current-moment context for a HAM. Pure cold plumbing.
async function assembleNow(hamUid) {
  var tz = hamTimezone();
  var moment = resolveMoment(tz);
  var cal = await calendarWindow(hamUid);
  var ctx = {
    now_iso: moment.now_iso,
    tz: moment.tz,
    day_name: moment.day_name,
    date: moment.date,
    local_time: moment.local_time,
    part_of_day: moment.part_of_day,
    calendar_now: (cal && (cal.calendar_now || cal.now)) || null,
    calendar_next: (cal && (cal.calendar_next || cal.next)) || null
  };
  // Notes: stamp a versioned bead so the moment is greppable and consumers can dedup.
  stampMoment(hamUid, ctx).catch(function () {});
  return ctx;
}

// Cold relative-expression resolver: "today", "tomorrow", "this evening", "in 2 hours".
// Deterministic date math, no model. Returns an ISO target or null when it cannot resolve
// (fails open -- the caller can then ask the organ).
function resolveRelative(expr, tz) {
  var m = resolveMoment(tz || hamTimezone());
  var base = new Date(m.now_iso);
  var e = String(expr || '').toLowerCase().trim();
  var day = 24 * 3600 * 1000;
  if (e === 'today' || e === 'now') return base.toISOString();
  if (e === 'tomorrow') return new Date(base.getTime() + day).toISOString();
  if (e === 'yesterday') return new Date(base.getTime() - day).toISOString();
  var inH = e.match(/in\s+(\d+)\s*hour/);
  if (inH) return new Date(base.getTime() + parseInt(inH[1], 10) * 3600 * 1000).toISOString();
  var inD = e.match(/in\s+(\d+)\s*day/);
  if (inD) return new Date(base.getTime() + parseInt(inD[1], 10) * day).toISOString();
  if (e === 'this morning' || e === 'this afternoon' || e === 'this evening' || e === 'tonight') {
    return base.toISOString(); // same day; part_of_day carries the finer meaning
  }
  return null; // fail open
}

async function stampMoment(hamUid, ctx) {
  try {
    var bead = {
      ham_uid: hamUid, agent_global: 'NOW', stamp_type: 'CONTEXT',
      acl_stamp: '\u2b21B:now.moment:CONTEXT:current_moment_assembled:' +
        ctx.now_iso.slice(0, 10).replace(/-/g, '') + '\u2b21',
      source: 'now.station.moment.' + hamUid,
      summary: '[NOW] ' + ctx.day_name + ' ' + ctx.part_of_day + ' ' + ctx.local_time +
        ' ' + ctx.tz + (ctx.calendar_next ? ' | next: ' + JSON.stringify(ctx.calendar_next).slice(0, 60) : ''),
      importance: 3,
      spawned_by: 'now.station.' + hamUid,
      content: JSON.stringify(ctx)
    };
    await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: {
        apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json',
        'Content-Profile': _schema(), 'Accept-Profile': _schema(), Prefer: 'return=minimal'
      },
      body: JSON.stringify(bead), signal: AbortSignal.timeout(8000)
    });
  } catch (e) { /* notes are best-effort; never block the moment */ }
}

module.exports = {
  assembleNow: assembleNow,
  resolveRelative: resolveRelative,
  resolveMoment: resolveMoment,
  hamTimezone: hamTimezone
};
