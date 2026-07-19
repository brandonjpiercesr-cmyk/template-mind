// ⬡B:pai.stations.sage:BUILD:sage_strategic_assessment_long_horizon_patterns:20260719⬡
// PROACTIVE department. SAGE = Strategic Assessment and Governance Engine (replaced the old
// SHRINK agent). SAGE notices patterns that only become visible across WEEKS or MONTHS:
// recurring frustrations, emerging opportunities, decaying relationships, slowly-forming
// crises. It is NOT a daily agent -- it fires when a long-horizon pattern becomes clear.
//
// SAGE is an ORGAN: seeing a slow pattern is a judgment of meaning across a long window, so
// an LLM reasons over the history through the ONE ladder (no rogue call). Cold code only
// gathers the window (a range of beads) and enforces the cadence (SAGE runs infrequently,
// e.g. weekly). It CONSUMES NOW for the date. Silence over noise: if no real long-horizon
// pattern stands out, SAGE says nothing rather than manufacture an insight.
//
// Entrance: the infrequent strategic sweep calls assess(). Exit: zero or more observations
// {pattern, horizon, evidence, suggested_move}. Notes: a bead per observation with lineage.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function windowDays(){ var v=parseInt(process.env.SAGE_WINDOW_DAYS,10); return isFinite(v)?v:30; }

// Gather a long window of the HAM's activity (summaries only, to keep it cheap). Cold.
async function gatherWindow(hamUid, days) {
  try {
    var since = new Date(Date.now() - days*24*3600*1000).toISOString();
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=summary,stamp_type,created_at&created_at=gte.'+since+'&order=id.desc&limit=200';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(12000) }).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return (b.stamp_type||'')+': '+(b.summary||'');});
  } catch(e){ return []; }
}

// The organ: reason over the long window for real slow patterns. Returns [] when nothing
// stands out (silence over noise).
async function assess(hamUid) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  var window = await gatherWindow(hamUid, windowDays());
  if (window.length < 8) return { moment: moment, observations: [] }; // too little history
  try {
    var sys =
      'You are SAGE, a strategic assessment organ that only speaks when a genuine LONG-HORIZON '+
      'pattern is clear across weeks: a recurring frustration, an emerging opportunity, a '+
      'decaying relationship, a slowly-forming crisis. Reviewing the last '+windowDays()+' days '+
      'of activity summaries, return a JSON array of {pattern, horizon, evidence, suggested_move} '+
      'ONLY for patterns that truly stand out. If nothing clear stands out, return []. Never '+
      'manufacture an insight from thin evidence.';
    var out = await ladder.deliberate(sys, window.join('\n'), { json:true, max_tokens:800, timeout:35000 });
    var text = out && out.content!=null ? out.content : '';
    var arr = JSON.parse(String(text).replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) arr=[];
    for (var i=0;i<arr.length;i++){ stampObservation(hamUid, arr[i], moment).catch(function(){}); }
    return { moment: moment, observations: arr.slice(0,3) };
  } catch(e){ return { moment: moment, observations: [] }; }
}

async function stampObservation(hamUid, obs, moment) {
  var bead = { ham_uid:hamUid, agent_global:'SAGE', stamp_type:'OBSERVATION',
    acl_stamp:'\u2b21B:sage.observation:OBSERVATION:long_horizon_pattern:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'sage.station.observation.'+hamUid,
    summary:'[SAGE] '+String(obs.pattern||'').slice(0,120),
    importance:6, spawned_by:'sage.station.'+hamUid, content:JSON.stringify(obs) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { assess:assess, gatherWindow:gatherWindow };
