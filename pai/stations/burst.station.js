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
var ccSurface = require('./cc.surface.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function urgencyThreshold(){ var v=parseFloat(process.env.BURST_URGENCY_THRESHOLD); return isFinite(v)?v:0.8; }

// ⬡B:burst.candidate_signals:FIX:every_row_names_its_writer_no_double_cap:20260815⬡
// Founder ruling 20260815, the pen on her mind: a row entering the organ's prompt with no
// writer name lets a machine byte read as if it were her own life, and a code-level slice
// riding on top of a query limit is a coder deciding twice what she may see. This helper
// carries the row's real source as its writer (the doctrine-correct fallback for a
// source-less row is "(no writer stamp on the row)", never an invented name), and the
// query limit below is the ONE bound left, never doubled by a second cut before the prompt.
// ⬡B:stations:FIX:bound_the_bytes_mark_the_cut_never_drop_the_row:20260815⬡
// A row's summary rode into the prompt unbounded. With a busy window a station could
// serialize hundreds of long summaries into ONE model call, overflow the provider, and hit
// its own catch path, which reports nothing found. The person then silently loses the whole
// briefing or sweep, which is a worse and quieter failure than a trimmed one.
// Bound the BYTES, never the ROWS: every row still rides, none is dropped or ranked away.
// And the cut is MARKED, never silent. Cold code trimming a mind's stored words and handing
// them on as whole is the same sin as editing her answer; saying plainly that the row was cut,
// and by how much, carries the fact instead of hiding it.
var ROW_SUMMARY_MAX = 400;
function boundSummary(v) {
  var s = String(v || '');
  if (s.length <= ROW_SUMMARY_MAX) return s;
  return s.slice(0, ROW_SUMMARY_MAX) + ' [row cut here at ' + ROW_SUMMARY_MAX + ' of '
    + s.length + ' characters, the rest is in the record]';
}
function fenceLine(b) {
  var writer = String(b && b.source || '').slice(0, 120) || '(no writer stamp on the row)';
  return '[' + (b && b.stamp_type || '?') + (b && b.agent_global ? '/' + b.agent_global : '')
    + ' | written by ' + writer + '] ' + boundSummary(b && b.summary);
}

// ⬡B:stations:FIX:narration_fence_travels_with_the_writer_tag:20260815⬡
// Founder doctrine THE PEN ON HER MIND, 20260815: "Writer names are internal. Add the
// narration fence. She never says one to a person." The writer tag was added to these
// prompts without it, so a model could echo a module name straight into a line a person
// reads. The tag exists to be JUDGED BY, never repeated. Wording matches core/fcw.builder.js
// so this is the one fence, not a second dialect of it.
var NARRATION_FENCE = ' Each line names the writer that stamped it. A writer name is the '
  + 'lane or module that stamped the row, not proof of who authored the words, and some rows '
  + 'are machine facts a template or a scheduler stamped in. Judge each line by its named '
  + 'writer. These writer names are internal: use them to judge a line, never repeat one in '
  + 'anything a person reads.';

async function candidateSignals(hamUid) {
  // time-critical signals: urgent-flagged emails, imminent deadlines, emergency beads
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+
      '?select=summary,source,stamp_type,agent_global,created_at&ham_uid=eq.'+encodeURIComponent(String(hamUid))+
      '&or=(summary.ilike.*urgent*,summary.ilike.*deadline*,summary.ilike.*today*,summary.ilike.*ASAP*,summary.ilike.*emergency*)&order=id.desc&limit=20';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(9000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(fenceLine);
  } catch(e){ return []; }
}

async function alreadyAlerted(hamUid) {
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary,source,stamp_type&ham_uid=eq.'+
      encodeURIComponent(String(hamUid))+'&agent_global=eq.BURST&order=id.desc&limit=20';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(fenceLine);
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
      // ⬡B:burst.judge_urgent:FIX:no_second_cut_on_top_of_the_query_bound:20260815⬡ alreadyAlerted's
      // own query already bounds this list to 20 rows; a second .slice(0,20) here was a coder
      // deciding the same ceiling twice, the exact double-cap the founder's ruling forbids.
      'repeat): '+JSON.stringify(alerted||[]);
    var out=await ladder.deliberate(persona.voicePrompt(sys + NARRATION_FENCE), candidates.join('\n'), { json:true, max_tokens:600, timeout:25000 });
    var text=out&&out.content!=null?out.content:'';
    var arr=JSON.parse(String(text).replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return [];
    var t=urgencyThreshold();
    return arr.filter(function(a){ return (typeof a.confidence==='number'?a.confidence:0)>=t; }).slice(0,3);
  } catch(e){ return []; }
}

async function fire(hamUid, alert, moment) {
  await stampAlert(hamUid, alert, moment).catch(function(){});
  // Real Command Center bead (CC_NOTE, alert kind) the feed serves. Genuine voice/text
  // escalation for a true emergency still flows through the Overseer's real reach path;
  // this guarantees the desk record exists. (Old outreachPassForHam(payload) did nothing.)
  await ccSurface.surfaceToCommandCenter(hamUid, 'BURST', alert.alert, alert.why_urgent, 'alert', 8).catch(function(){});
}

// ENTRANCE: monitoring sources call sweep whenever new context arrives (any time, not a fixed cron)
async function sweep(hamUid, options) {
  options=options||{};
  var moment=options.moment||await nowStation.assembleNow(hamUid);
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
