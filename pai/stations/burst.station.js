// ⬡B:pai.stations.burst:BUILD:burst_breaking_urgent_realtime_transmissions_reports_to_air:20260719⬡
// PROACTIVE department (but reports to AIR, NOT DAWN, because BURST can fire at ANY time, not
// just during a briefing). BURST = Breaking and Urgent Real-time System Transmissions. It is
// the urgent-alert agent: when something genuinely urgent happens (a time-critical email, a
// deadline about to pass, an emergency signal), BURST fires immediately rather than waiting
// for the next briefing. Built from the founder's history, not one bead.
//
// THE BAR IS URGENCY, per-HAM: BURST only fires when a signal clears the HAM's urgency
// threshold. Everything below that bar is left to HUNCH (proactive tips) or DAWN (briefing).
// This is why HUNCH dedupes against BURST -- if BURST already alerted him, HUNCH stays quiet.
//
// OUTPUT: sends to IMAN (urgent email), VARA (urgent call), and CeeCee/Command Center
// (approval queue + push), through the REAL outreach path. Because it is urgent, BURST is the
// one proactive agent allowed to escalate to voice/text -- but only genuine urgency, and it
// writes a dedup key so it never double-alerts the same event.
//
// BURST is an ORGAN for the urgency judgment (is this truly urgent-now is meaning) through the
// ONE ladder. Cold code gathers candidate signals, enforces the threshold and dedup, and hands
// a cleared alert to outreach. Consumes NOW for timing.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');
var persona = require('../core/persona.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function urgencyThreshold(){ var v=parseFloat(process.env.BURST_URGENCY_THRESHOLD); return isFinite(v)?v:0.8; }

async function candidateSignals(hamUid) {
  // time-critical signals: urgent-flagged emails, imminent deadlines, emergency beads
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+
      '?select=summary,created_at&or=(summary.ilike.*urgent*,summary.ilike.*deadline*,summary.ilike.*today*,summary.ilike.*ASAP*,summary.ilike.*emergency*)&order=id.desc&limit=20';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(9000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

async function alreadyAlerted(hamUid) {
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary&agent_global=eq.BURST&order=id.desc&limit=20';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

// The organ: which candidates truly clear the urgency bar right now? [] if none.
async function judgeUrgent(hamUid, moment, candidates, alerted) {
  if (!candidates.length) return [];
  try {
    var sys='You are BURST, the urgent-alert organ for one person. It is '+moment.day_name+' '+
      moment.local_time+'. From the candidate signals, return ONLY the ones that are GENUINELY '+
      'urgent enough to interrupt him RIGHT NOW (a deadline about to pass, a time-critical '+
      'message, an emergency) as a JSON array of {alert, why_urgent, channel ("voice"|"text"|'+
      '"command_center"), confidence (0-1)}. The bar is very HIGH -- most things are NOT BURST, '+
      'they are HUNCH or DAWN. If nothing is truly urgent, return []. Already alerted (do not '+
      'repeat): '+JSON.stringify((alerted||[]).slice(0,20));
    var out=await ladder.deliberate(persona.voicePrompt(sys), candidates.join('\n'), { json:true, max_tokens:600, timeout:25000 });
    var text=out&&out.content!=null?out.content:'';
    var arr=JSON.parse(String(text).replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return [];
    var t=urgencyThreshold();
    return arr.filter(function(a){ return (typeof a.confidence==='number'?a.confidence:0)>=t; }).slice(0,3);
  } catch(e){ return []; }
}

async function fire(hamUid, alert, moment) {
  await stampAlert(hamUid, alert, moment).catch(function(){});
  var outreach = (function(){ try{return require('../core/outreach.js');}catch(e){return null;} })();
  if (outreach && outreach.outreachPassForHam) {
    try {
      await outreach.outreachPassForHam(hamUid, {
        origin:'burst', message:alert.alert, why:alert.why_urgent,
        suggested_channel: alert.channel || 'command_center',
        allow_text:true, allow_voice: alert.channel==='voice', urgent:true
      });
    } catch(e){}
  }
}

// ENTRANCE: monitoring sources call sweep whenever new context arrives (any time, not a fixed cron)
async function sweep(hamUid) {
  var moment=await nowStation.assembleNow(hamUid);
  var candidates=await candidateSignals(hamUid);
  var alerted=await alreadyAlerted(hamUid);
  var alerts=await judgeUrgent(hamUid, moment, candidates, alerted);
  for (var i=0;i<alerts.length;i++){ await fire(hamUid, alerts[i], moment); }
  return { moment:moment, alerts:alerts };
}

async function stampAlert(hamUid, alert, moment) {
  var bead={ ham_uid:hamUid, agent_global:'BURST', stamp_type:'ALERT',
    acl_stamp:'\u2b21B:burst.alert:ALERT:urgent_realtime_transmission:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'burst.station.alert.'+hamUid, summary:'[BURST] '+String(alert.alert||'').slice(0,120),
    importance:8, spawned_by:'burst.station.'+hamUid, content:JSON.stringify(alert) };
  await fetch(_bu()+'/rest/v1/'+_tbl(),{method:'POST',headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal'},
    body:JSON.stringify(bead),signal:AbortSignal.timeout(8000)});
}

module.exports = { sweep:sweep, judgeUrgent:judgeUrgent, urgencyThreshold:urgencyThreshold };
