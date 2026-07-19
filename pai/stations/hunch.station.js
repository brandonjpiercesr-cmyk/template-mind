// ⬡B:pai.stations.hunch:REBUILD:hunch_is_the_proactive_tips_engine_streamed_to_command_center_not_a_cupcake_catcher:20260719⬡
// FOUNDER CORRECTION 20260719 (Lesson 4 of how to build a real wonder, bead 402593). The
// first build of this file was WRONG: it treated the founder's cupcake example -- one 10%
// illustration -- as the whole spec and built a "cupcake catcher." That inverts what HUNCH
// is. This rebuild is against the FULL spec, reconstructed from a year of the founder's own
// history (his claude.ai chats / internal memory), not one bead.
//
// HUNCH = Helpful Unsolicited Notifications and Contextual Hints. It is the PROACTIVE TIPS
// ENGINE: the epitome of the PAI being streamed DOWN into the COMMAND CENTER (and, carefully,
// sometimes text messages -- as long as it never becomes overbearing). HUNCH pushes advice
// throughout the day WITHOUT being asked. It takes everything in (all context flowing through
// AIR) and reaches back down to touch the HAM with proactive assistance. The cupcake sign
// (Morgan St Pool Hall, Raleigh: he said "get 2 now, 2 later", the sign said buy 4 for the
// discount, a real HUNCH via glasses+voice says "boss, get 4 now, you save") is ONE 10%
// instance of that -- not the definition.
//
// THE REAL SPEC (from the founder's history):
//  - MONITORS: all context through AIR -- pending items, upcoming calendar events, stale job
//    applications, unread memos, contextual signals (and, when eyes/ears are on, ambient
//    sight/sound via GAZE).
//  - CADENCE: the proactive sweep -- 3x daily 8AM/1PM/6PM EST (HeartbeatService heritage),
//    and the reach loop through waking hours (~7AM-10PM). The autonomous cycle service is the
//    new-world driver; HUNCH is called by that sweep, it does not spin its own timer.
//  - OUTPUT SURFACE: routes each tip to the COMMAND CENTER via the real outreach path
//    (the Overseer's resting place -- outreachPassForHam funnels to command_center), which
//    streams to the phone. NEVER writes straight to the HAM. Text is allowed only sparingly
//    through that same outreach decision, never as a firehose.
//  - COORDINATION: coordinates with BURST to avoid duplicate notifications (if BURST already
//    alerted him about something urgent, HUNCH skips it); feeds DAWN's briefing pending-items.
//  - LIMITS: max 3 tips per sweep; a cheap model composes the tip in a warm, brief tone;
//    NEVER repeats a tip the HAM already saw and dismissed.
//
// HUNCH is an ORGAN for the judgment (which signals are worth a proactive tip is meaning), so
// the composition/selection routes through the ONE ladder (no rogue call). Cold code only
// gathers the signals, enforces the cap/dedupe, and hands the chosen tips to outreach.

var ladder = require('../core/model.ladder.js');
var persona = require('../core/persona.js');
var nowStation = require('./now.station.js');
var outreach = (function(){ try { return require('../core/outreach.js'); } catch(e){ return null; } })();
var ccSurface = require('./cc.surface.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function maxTips(){ var v=parseInt(process.env.HUNCH_MAX_TIPS,10); return isFinite(v)?v:3; }

// ---- (1) GATHER the real signals HUNCH monitors. Cold, each fails open. ----
async function gatherSignals(hamUid) {
  var out = { pending: [], calendar_next: null, stale_jobs: [], unread_memos: [], ambient: [] };
  // pending items + unread memos: read from the bank (facts other agents stamped)
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=summary,stamp_type,created_at&or=(summary.ilike.*pending*,summary.ilike.*unread*,summary.ilike.*follow%20up*,summary.ilike.*stale*,stamp_type.eq.SURFACE)&order=id.desc&limit=25';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(9000) }).then(function(x){return x.json();});
    (Array.isArray(r)?r:[]).forEach(function(b){
      var s=(b.summary||'');
      if (/stale|no response|no reply/i.test(s)) out.stale_jobs.push(s);
      else if (/unread|memo/i.test(s)) out.unread_memos.push(s);
      else out.pending.push(s);
    });
  } catch(e){}
  // upcoming calendar via NOW's moment (already resolved, no twin)
  try { var m = await nowStation.assembleNow(hamUid); out.calendar_next = m.calendar_next; out._moment = m; } catch(e){}
  // ambient sight/sound if GAZE has a current focus (the eyes the cupcake sign comes through)
  try {
    var gaze = require('./gaze.station.js');
    if (gaze && gaze.currentFocus) { var f = await gaze.currentFocus(hamUid); if (f) out.ambient.push(JSON.stringify(f)); }
  } catch(e){}
  return out;
}

// ---- (2) BURST dedupe: skip anything BURST already alerted on, plus HUNCH's own recent tips ----
async function alreadyCovered(hamUid) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=summary&or=(agent_global.eq.BURST,agent_global.eq.HUNCH)&order=id.desc&limit=30';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(8000) }).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

// ---- (3) The organ: choose up to N tips worth pushing, compose them warm and brief ----
async function composeTips(hamUid, moment, signals, covered) {
  var hasAny = signals.pending.length || signals.stale_jobs.length || signals.unread_memos.length ||
               signals.calendar_next || signals.ambient.length;
  if (!hasAny) return [];
  try {
    var sys =
      'You are HUNCH, the proactive tips engine for one person. It is '+moment.day_name+' '+
      moment.part_of_day+' '+moment.local_time+'. From the signals, choose AT MOST '+maxTips()+
      ' genuinely helpful proactive tips -- an opportunity he is about to miss, a timely nudge '+
      '(a meeting soon and what it was last about), a stale job application worth a follow-up, '+
      'an unread memo that matters. Compose each in a warm, brief, butler tone. Return a JSON '+
      'array of {tip, why_now, urgency ("low"|"normal"|"high"), contradicts_action (bool)}. The '+
      'bar is HIGH: only push what clearly helps; if little matters, return fewer or []. Never '+
      'nag, never invent. Already covered by BURST/HUNCH (do not repeat): '+
      JSON.stringify((covered||[]).slice(0,20));
    var payload = { pending: signals.pending.slice(0,10), stale_jobs: signals.stale_jobs.slice(0,8),
      unread_memos: signals.unread_memos.slice(0,8), calendar_next: signals.calendar_next,
      ambient: signals.ambient.slice(0,5) };
    var out = await ladder.deliberate(persona.voicePrompt(sys), JSON.stringify(payload), { json:true, max_tokens:700, timeout:30000 });
    var text = out && out.content!=null ? out.content : '';
    var arr = JSON.parse(String(text).replace(/```json|```/g,'').trim());
    return Array.isArray(arr) ? arr.slice(0, maxTips()) : [];
  } catch(e){ return []; }
}

// ---- (4) DELIVER each tip to the COMMAND CENTER via the real outreach path (streams to phone) ----
async function deliverToCommandCenter(hamUid, tip, moment) {
  // stamp the tip so DAWN's briefing can pick it up and so dedupe works
  await stampTip(hamUid, tip, moment).catch(function(){});
  // hand to the real outreach decision: it funnels to command_center (the resting place),
  // and may choose text ONLY when the tip is genuinely worth it -- never a firehose. HUNCH
  // does NOT write its own queue or send directly; the Overseer/outreach owns the surface.
  // Write the REAL Command Center bead the feed serves (CC_NOTE). The old
  // outreachPassForHam(payload) call did nothing -- its 2nd arg is `force`, not a message.
  await ccSurface.surfaceToCommandCenter(hamUid, 'HUNCH', tip.tip, tip.why_now, 'tip',
    tip.urgency === 'high' ? 7 : (tip.contradicts_action ? 6 : 5)).catch(function(){});
}


// ---- EXIT / RALLY (Lesson 5): HUNCH comes back for its own outstanding tips ----
// Each sweep, before composing new tips, HUNCH re-reads the tips it already surfaced and
// reconciles them against what has since happened: CLOSE the ones now done, RE-NUDGE a stale
// one once, DROP the dead ones. This is what keeps the Command Center from filling with
// meaningless stale tips. Whether a tip is done/stale/dead is MEANING, so it is judged by the
// organ through the one ladder; cold code only fetches the open tips and writes the outcomes.
async function openTips(hamUid) {
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=id,summary,content,created_at&source=eq.hunch.station.tip.'+String(hamUid).toLowerCase()+'&order=id.desc&limit=20';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(9000)}).then(function(x){return x.json();});
    var open=[];
    for (var i=0;i<(Array.isArray(r)?r:[]).length;i++){
      var c={}; try{c=JSON.parse(r[i].content||'{}');}catch(e){}
      if (c && c._status && (c._status==='closed'||c._status==='dropped')) continue; // already resolved
      open.push({ id:r[i].id, tip:c.tip||r[i].summary, nudges:(c._nudges||0), content:c });
    }
    return open;
  } catch(e){ return []; }
}

// recent context the organ uses to decide if a tip got handled
async function recentContext(hamUid) {
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary&ham_uid=eq.'+hamUid+'&order=id.desc&limit=40';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(9000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}

async function reconcileTips(hamUid, moment) {
  var open=await openTips(hamUid);
  if (!open.length) return { reviewed:0, closed:0, nudged:0, dropped:0 };
  var ctx=await recentContext(hamUid);
  var decisions=[];
  try {
    var sys='You are HUNCH reviewing the proactive tips you already gave this person, to keep '+
      'their Command Center clean. For EACH tip, using the recent activity, decide its status: '+
      '"done" (it has clearly been handled or is no longer relevant), "stale" (still worth doing '+
      'but going cold, worth ONE gentle re-nudge), or "dead" (obsolete, time has passed, drop it '+
      'quietly). Return a JSON array aligned to the tips in order: [{index, status, note}]. Be '+
      'honest; do not keep things alive just to have something to say.';
    var payload={ tips:open.map(function(o,ix){return {index:ix, tip:o.tip, nudges:o.nudges};}), recent:ctx.slice(0,25) };
    var out=await ladder.deliberate(persona.voicePrompt(sys), JSON.stringify(payload), { json:true, max_tokens:700, timeout:30000 });
    var text=out&&out.content!=null?out.content:''; decisions=JSON.parse(String(text).replace(/```json|```/g,'').trim());
    if (!Array.isArray(decisions)) decisions=[];
  } catch(e){ return { reviewed:open.length, closed:0, nudged:0, dropped:0, error:true }; }

  var closed=0,nudged=0,dropped=0;
  for (var i=0;i<decisions.length;i++){
    var d=decisions[i]; var o=open[d.index]; if(!o) continue;
    if (d.status==='done'){ await setTipStatus(hamUid,o,'closed',d.note,moment).catch(function(){}); closed++; }
    else if (d.status==='dead'){ await setTipStatus(hamUid,o,'dropped',d.note,moment).catch(function(){}); dropped++; }
    else if (d.status==='stale' && (o.nudges||0) < 1){ await renudge(hamUid,o,d.note,moment).catch(function(){}); nudged++; }
    // stale with a nudge already spent -> leave it; a second nudge would be overbearing
  }
  await writeReconcile(hamUid, moment, open.length, closed, nudged, dropped).catch(function(){});
  return { reviewed:open.length, closed:closed, nudged:nudged, dropped:dropped };
}

async function setTipStatus(hamUid, o, status, note, moment) {
  // supersede the tip bead's content with a resolved status (never DELETE; supersede-only)
  var content=Object.assign({}, o.content||{}, { _status:status, _resolved_at:moment.now_iso, _resolution_note:note||'' });
  await fetch(_bu()+'/rest/v1/'+_tbl()+'?id=eq.'+o.id,{method:'PATCH',headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal'},
    body:JSON.stringify({content:JSON.stringify(content)}),signal:AbortSignal.timeout(8000)});
}

async function renudge(hamUid, o, note, moment) {
  // mark the nudge count up, and gently re-surface to the Command Center once
  var content=Object.assign({}, o.content||{}, { _nudges:(o.nudges||0)+1, _last_nudge:moment.now_iso });
  await fetch(_bu()+'/rest/v1/'+_tbl()+'?id=eq.'+o.id,{method:'PATCH',headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal'},
    body:JSON.stringify({content:JSON.stringify(content)}),signal:AbortSignal.timeout(8000)});
  await ccSurface.surfaceToCommandCenter(hamUid, 'HUNCH', o.tip, 'a gentle follow-up: '+(note||'still worth a look'), 'tip', 4).catch(function(){});
}

async function writeReconcile(hamUid, moment, reviewed, closed, nudged, dropped) {
  var bead={ ham_uid:hamUid, agent_global:'HUNCH', stamp_type:'RECONCILE',
    acl_stamp:'\u2b21B:hunch.reconcile:RECONCILE:closed_nudged_dropped_own_tips:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'hunch.station.reconcile.'+hamUid,
    summary:'[HUNCH] reviewed '+reviewed+' tips: '+closed+' closed, '+nudged+' nudged, '+dropped+' dropped',
    importance:3, spawned_by:'hunch.station.'+hamUid, content:JSON.stringify({reviewed:reviewed,closed:closed,nudged:nudged,dropped:dropped,at:moment.now_iso}) };
  await fetch(_bu()+'/rest/v1/'+_tbl(),{method:'POST',headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal'},
    body:JSON.stringify(bead),signal:AbortSignal.timeout(8000)});
}

// ---- ENTRANCE: the proactive sweep calls this (3x daily + waking-hour loop, driven by the
// autonomous cycle service, not a timer HUNCH owns). ----
async function sweep(hamUid) {
  var _pre = await nowStation.assembleNow(hamUid);
  var reconciled = await reconcileTips(hamUid, _pre); // EXIT/RALLY of prior cycle first
  var signals = await gatherSignals(hamUid);
  var moment = signals._moment || await nowStation.assembleNow(hamUid);
  var covered = await alreadyCovered(hamUid);
  var tips = await composeTips(hamUid, moment, signals, covered);
  for (var i=0;i<tips.length;i++){ await deliverToCommandCenter(hamUid, tips[i], moment); }
  return { moment: moment, tips: tips, reconciled: reconciled, delivered_to: 'command_center' }; // tips may be [] (silence)
}

async function stampTip(hamUid, tip, moment) {
  var bead = { ham_uid:hamUid, agent_global:'HUNCH', stamp_type:'TIP',
    acl_stamp:'\u2b21B:hunch.tip:TIP:proactive_tip_to_command_center:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'hunch.station.tip.'+hamUid,
    summary:'[HUNCH] '+String(tip.tip||'').slice(0,120),
    importance: tip.urgency==='high'?7:(tip.contradicts_action?6:5),
    spawned_by:'hunch.station.'+hamUid, content:JSON.stringify(tip) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

// DAWN reads HUNCH's recent tips for the briefing pending-items section.
async function pendingForBriefing(hamUid) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+
      '?select=content,created_at&source=eq.hunch.station.tip.'+String(hamUid).toLowerCase()+'&order=id.desc&limit=5';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(8000) }).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){ try{return JSON.parse(b.content);}catch(e){return null;} }).filter(Boolean);
  } catch(e){ return []; }
}

module.exports = { sweep:sweep, composeTips:composeTips, gatherSignals:gatherSignals,
  pendingForBriefing:pendingForBriefing, maxTips:maxTips, reconcileTips:reconcileTips };
