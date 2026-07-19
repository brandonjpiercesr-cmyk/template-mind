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
var nowStation = require('./now.station.js');
var outreach = (function(){ try { return require('../core/outreach.js'); } catch(e){ return null; } })();

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
    var out = await ladder.deliberate(sys, JSON.stringify(payload), { json:true, max_tokens:700, timeout:30000 });
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
  if (outreach && outreach.outreachPassForHam) {
    try {
      await outreach.outreachPassForHam(hamUid, {
        origin: 'hunch',
        message: tip.tip,
        why: tip.why_now,
        suggested_channel: 'command_center',          // default resting place; outreach may escalate
        allow_text: tip.urgency === 'high',            // text only for a genuinely high-urgency tip
        contradicts_action: !!tip.contradicts_action
      });
    } catch(e){}
  }
}

// ---- ENTRANCE: the proactive sweep calls this (3x daily + waking-hour loop, driven by the
// autonomous cycle service, not a timer HUNCH owns). ----
async function sweep(hamUid) {
  var signals = await gatherSignals(hamUid);
  var moment = signals._moment || await nowStation.assembleNow(hamUid);
  var covered = await alreadyCovered(hamUid);
  var tips = await composeTips(hamUid, moment, signals, covered);
  for (var i=0;i<tips.length;i++){ await deliverToCommandCenter(hamUid, tips[i], moment); }
  return { moment: moment, tips: tips, delivered_to: 'command_center' }; // tips may be [] (silence)
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
  pendingForBriefing:pendingForBriefing, maxTips:maxTips };
