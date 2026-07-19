// ⬡B:pai.stations.soul:BUILD:soul_spiritual_oversight_names_of_god_rotation:20260719⬡
// PROACTIVE department. SOUL = Spiritual Oversight and Understanding Liaison. It surfaces
// spiritual content for HAMs with spiritual_routine enabled (the founder by default). Phase
// 1 (ported from the 2026-05-04 legacy session): a daily Names of God rotation. SOUL is
// SEPARATE from WORD (the LOGGING dept's structured Bible study); SOUL = proactive spiritual
// surfacing, a gentle daily offering, never a sermon and never forced.
//
// SOUL is mostly COLD for the rotation (which name today is a deterministic function of the
// date, no model needed). It CONSUMES NOW for the date and only reaches an organ if asked to
// add a short reflection, through the ONE ladder. Respects the enable flag: if the HAM's
// spiritual_routine is off, SOUL stays silent.

var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function spiritualEnabled(){ return String(process.env.SPIRITUAL_ROUTINE || 'true').toLowerCase() !== 'false'; }

// Names of God rotation. A stable list; the day's name is a pure function of the day index,
// so the same day always yields the same name (deterministic, greppable, no model).
var NAMES_OF_GOD = [
  { name: 'Elohim', meaning: 'The Creator, the all-powerful God' },
  { name: 'Yahweh', meaning: 'The self-existent, covenant-keeping LORD' },
  { name: 'Adonai', meaning: 'The Lord, Master over all' },
  { name: 'El Shaddai', meaning: 'God Almighty, all-sufficient' },
  { name: 'Jehovah Jireh', meaning: 'The LORD will provide' },
  { name: 'Jehovah Rapha', meaning: 'The LORD who heals' },
  { name: 'Jehovah Nissi', meaning: 'The LORD my banner' },
  { name: 'Jehovah Shalom', meaning: 'The LORD is peace' },
  { name: 'Jehovah Raah', meaning: 'The LORD my shepherd' },
  { name: 'Jehovah Shammah', meaning: 'The LORD is there / present' },
  { name: 'El Elyon', meaning: 'The Most High God' },
  { name: 'El Roi', meaning: 'The God who sees me' }
];

function dayIndex(moment) {
  // days since epoch in the HAM's local frame -> stable per-day index
  var d = new Date(moment.now_iso);
  return Math.floor(d.getTime() / (24 * 3600 * 1000));
}

// Entrance. Surface today's spiritual offering. Consumes NOW. Silent if routine disabled.
async function surfaceDaily(hamUid) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  if (!spiritualEnabled()) return { moment: moment, offering: null };
  var name = NAMES_OF_GOD[dayIndex(moment) % NAMES_OF_GOD.length];
  var offering = { kind: 'name_of_god', name: name.name, meaning: name.meaning, day: moment.date };
  await stampOffering(hamUid, offering, moment).catch(function(){});
  return { moment: moment, offering: offering };
}

async function stampOffering(hamUid, offering, moment) {
  var bead = { ham_uid:hamUid, agent_global:'SOUL', stamp_type:'OFFERING',
    acl_stamp:'\u2b21B:soul.offering:OFFERING:daily_spiritual_surface:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'soul.station.offering.'+hamUid,
    summary:'[SOUL] '+offering.name+' -- '+offering.meaning,
    importance:4, spawned_by:'soul.station.'+hamUid, content:JSON.stringify(offering) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { surfaceDaily:surfaceDaily, surface:surfaceDaily, NAMES_OF_GOD:NAMES_OF_GOD };
