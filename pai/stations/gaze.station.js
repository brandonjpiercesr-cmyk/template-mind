// ⬡B:pai.stations.gaze:BUILD:gaze_visual_attention_context_aba_glasses:20260719⬡
// GAZE = Graphical Analysis and Zone Examination. GAZE tracks what the HAM is visually
// focused on -- active tab, current document, focused application -- so other agents have
// real-time attention context (HUNCH's cupcake sign comes through GAZE's eyes; DAWN can know
// what he was last looking at). ABA Glasses concept agent, COOKING dept.
//
// GAZE is COLD: it records a reported focus fact (from the eyes device / active-window
// signal). It judges no meaning -- it just holds the current attention zone for others to
// read. CONSUMES NOW for the timestamp. Fails open (no signal -> last known / null).
//
// Entrance: the eyes/active-window signal calls recordFocus(); any agent calls currentFocus().
// Exit: the current attention zone. Notes: a bead per focus change with lineage.

var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// Record a reported focus (active tab/doc/app or an eyes-device observation). Cold fact.
async function recordFocus(hamUid, focus) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  var zone = { at: moment.now_iso, focus: focus || null };
  await stampFocus(hamUid, zone, moment).catch(function(){});
  return zone;
}

// Read the current attention zone (most recent focus). Fails open to null.
async function currentFocus(hamUid) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=content,created_at&source=eq.gaze.station.focus.'+String(hamUid).toLowerCase()+'&order=id.desc&limit=1';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(8000) }).then(function(x){return x.json();});
    if (Array.isArray(r) && r[0] && r[0].content) { try { return JSON.parse(r[0].content); } catch(e){ return null; } }
    return null;
  } catch(e){ return null; }
}

async function stampFocus(hamUid, zone, moment) {
  var bead = { ham_uid:hamUid, agent_global:'GAZE', stamp_type:'FOCUS',
    acl_stamp:'\u2b21B:gaze.focus:FOCUS:attention_zone_recorded:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'gaze.station.focus.'+hamUid,
    summary:'[GAZE] focus: '+String(JSON.stringify(zone.focus)).slice(0,100),
    importance:2, spawned_by:'gaze.station.'+hamUid, content:JSON.stringify(zone) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { recordFocus:recordFocus, currentFocus:currentFocus };
