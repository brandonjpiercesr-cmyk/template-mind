// ⬡B:pai.stations.ghost:BUILD:ghost_graveyard_hour_operations_overnight_monitor:20260719⬡
// PROACTIVE department. GHOST = Graveyard Hour Operations and Systematic Tasks. It manages
// the go-to-sleep protocol: when the HAM's bedtime arrives (default 10 PM in their tz),
// GHOST takes over and silently tracks unanswered threads, pending follow-ups, and overnight
// events, then hands off to WAKE at 5 AM. GHOST is quiet by design -- it monitors and
// records overnight, it does not wake the HAM.
//
// GHOST is mostly COLD: whether it is graveyard hour is a deterministic FACT of the clock,
// so it uses NOW (no model, no twin). It only reaches an organ if it must judge whether an
// overnight event is urgent enough to break the silence (rare), and even then routes to the
// approval queue, never straight to a sleeping HAM.
//
// Entrance: the proactive sweep calls isGraveyardHour + monitorOvernight. Exit: an overnight
// watch record. Notes: a bead per overnight sweep with lineage.

var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function bedtimeHour(){ var v=parseInt(process.env.GHOST_BEDTIME_HOUR,10); return isFinite(v)?v:22; }
function wakeHour(){ var v=parseInt(process.env.GHOST_WAKE_HOUR,10); return isFinite(v)?v:5; }

// Cold fact: is it graveyard hour (between bedtime and wake) in the HAM's timezone?
function isGraveyardHour(moment) {
  var h = moment.hour_24;
  var bed = bedtimeHour(), wake = wakeHour();
  // window wraps midnight: [22:00 .. 05:00)
  return (h >= bed) || (h < wake);
}

// Silently record the overnight watch: unanswered threads / pending follow-ups are read
// from the bank (facts already stamped by other agents); GHOST just gathers and holds them
// for WAKE. Fails open to an empty watch.
async function monitorOvernight(hamUid) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  if (!isGraveyardHour(moment)) return { moment: moment, graveyard: false, watch: null };
  var pending = await pendingThreads(hamUid);
  var watch = { at: moment.now_iso, pending_count: pending.length, pending: pending.slice(0, 10) };
  await stampWatch(hamUid, watch, moment).catch(function(){});
  return { moment: moment, graveyard: true, watch: watch };
}

async function pendingThreads(hamUid) {
  try {
    // unanswered/pending items other agents already flagged (HINT/SURFACE/pending beads)
    var url = _bu() + '/rest/v1/' + _tbl() +
      '?select=summary,created_at&or=(stamp_type.eq.HINT,stamp_type.eq.SURFACE,summary.ilike.*pending*,summary.ilike.*unanswered*)' +
      '&order=id.desc&limit=15';
    var r = await fetch(url, { headers: { apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(8000) }).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

async function stampWatch(hamUid, watch, moment) {
  var bead = { ham_uid:hamUid, agent_global:'GHOST', stamp_type:'WATCH',
    acl_stamp:'\u2b21B:ghost.watch:WATCH:overnight_monitor_silent:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'ghost.station.watch.'+hamUid,
    summary:'[GHOST] overnight watch '+moment.local_time+' pending='+watch.pending_count,
    importance:3, spawned_by:'ghost.station.'+hamUid, content:JSON.stringify(watch) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { monitorOvernight:monitorOvernight, isGraveyardHour:isGraveyardHour };
