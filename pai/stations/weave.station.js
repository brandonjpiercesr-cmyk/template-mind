// ⬡B:pai.stations.weave:BUILD:weave_thread_weaving_cross_conversation_connections:20260719⬡
// PROACTIVE department. WEAVE = Web Exploration and Analytical Verification Engine. WEAVE
// notices when a topic or a person shows up across MULTIPLE conversation threads and weaves
// the connections so the HAM sees the full picture (e.g. "Eric has come up in three
// different threads this week -- the Q2 proposal, the board seat, and the golf event; here
// is the through-line"). In legacy it also did web research (now the weave_thread_context
// path).
//
// WEAVE is an ORGAN: seeing that scattered mentions form one thread is a judgment of meaning,
// so an LLM reasons over the mentions through the ONE ladder (no rogue call). Cold code only
// gathers the mentions of an entity across recent beads. It CONSUMES NOW for recency framing.
// Silence over noise: if the mentions do not actually connect, WEAVE says nothing.
//
// NOTE: full autonomous wiring was BLOCKED in legacy (training note 2026-05-08) pending the
// MACE dependency. This station is built and callable now; when MACE is ready it plugs into
// the sweep. Building it here means it is no longer an orphan -- only the auto-trigger waits.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// Gather mentions of an entity (person/topic) across recent threads. Cold, fails open.
async function gatherMentions(hamUid, entity) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=summary,source,created_at&summary=ilike.*'+encodeURIComponent(entity)+'*&order=id.desc&limit=40';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(10000) }).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

// The organ: do these scattered mentions form one through-line worth showing? [] if not.
async function weaveEntity(hamUid, entity) {
  var moment = await nowStation.assembleNow(hamUid);   // consume NOW, no twin
  var mentions = await gatherMentions(hamUid, entity);
  if (mentions.length < 2) return { moment: moment, entity: entity, weave: null }; // no thread
  try {
    var sys =
      'You are WEAVE. Given multiple mentions of "'+entity+'" across the person\'s recent '+
      'threads, decide if they form ONE meaningful through-line worth surfacing. If they do, '+
      'return {through_line, threads:[...], why_it_matters}. If they are unrelated, return '+
      'null. Never force a connection that is not real.';
    var out = await ladder.deliberate(sys, mentions.join('\n'), { json:true, max_tokens:600, timeout:30000 });
    var text = out && out.content!=null ? out.content : '';
    var parsed = JSON.parse(String(text).replace(/```json|```/g,'').trim());
    if (parsed && parsed.through_line) { stampWeave(hamUid, entity, parsed, moment).catch(function(){}); return { moment:moment, entity:entity, weave:parsed }; }
    return { moment: moment, entity: entity, weave: null };
  } catch(e){ return { moment: moment, entity: entity, weave: null }; }
}

async function stampWeave(hamUid, entity, weave, moment) {
  var bead = { ham_uid:hamUid, agent_global:'WEAVE', stamp_type:'WEAVE',
    acl_stamp:'\u2b21B:weave.thread:WEAVE:cross_thread_connection:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'weave.station.thread.'+hamUid,
    summary:'[WEAVE] '+entity+': '+String(weave.through_line||'').slice(0,110),
    importance:5, spawned_by:'weave.station.'+hamUid, content:JSON.stringify(weave) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { weaveEntity:weaveEntity, gatherMentions:gatherMentions, WIRING_BLOCKED_ON:'MACE' };
