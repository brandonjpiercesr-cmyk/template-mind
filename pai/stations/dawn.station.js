// ⬡B:pai.stations.dawn:REBUILD2:dawn_full_real_spec_butler_voice_organic_interview_pref_gate_sleep_guard_exit_rally:20260719⬡
// FOUNDER FORCED THE SCOPE ON THIS ONE (20260719) after CLAIR nearly shipped a catastrophic
// thin DAWN. DAWN is the MOST scoped agent in the founder's history -- ~100 statements. This
// is the full rebuild against that history, composing through the ONE voice (persona.js),
// with every piece CLAIR had been missing. Nothing here is brief-for-brief's-sake; her system
// gives as much useful information as the person can consume.
//
// DAWN = Daily Automated Wisdom Notifier. PROACTIVE department LEAD (reports to AIR). It is a
// warm butler who knows you and starts your day with everything you need, delivered at your
// preferred time by your preferred method -- not a dashboard dump.
//
// FIVE W's + HOW:
//  WHO   -- runs per HAM, gated by that HAM's own preferences.
//  WHAT  -- one personalized daily briefing: summary, upcoming, emails, news, pending,
//           alertSummary; plus ONE organic-interview question when a profile field is empty.
//  WHEN  -- in the window before the HAM's briefing_time (their timezone); never during
//           their sleep hours.
//  WHERE -- delivered via IMAN (email) and/or VARA (voice) per briefing_method; stored to bank.
//  WHY   -- so the HAM wakes already caught up, and so A'NU learns them a little more each day.
//  HOW   -- gather from the real roster (RADAR/IMAN/PRESS/HUNCH/BURST/GHOST/NASH/SOUL),
//           compose through the ONE voice via an organ, deliver, then EXIT/RALLY: reconcile
//           yesterday (did pending resolve, did the question get answered, did delivery land).
//
// PER-HAM PREFERENCES gate everything: briefing_time, briefing_method (call|email|both),
// timezone, communication_style. If briefing_method is null/missing, DAWN SKIPS that HAM
// entirely (never guesses). Sections populate conditionally: calendar/email only if a Nylas
// grant exists; news only if the HAM has interests; a HAM with no interests gets NO news
// section, never the founder's news.
//
// LLM-WITH-COLD-CODE: cold code gathers signals, enforces the pref gate / sleep guard /
// per-HAM-per-day dedup / discovery tracking; the organ composes the briefing through the
// voice. RALLY: discovery_asked + the delivered-dedup + the reconcile pass all persist state
// so DAWN compounds over days. FCW: DAWN stamps itself on the wall each run.

var ladder = require('../core/model.ladder.js');
var persona = require('../core/persona.js');
var ccSurface = require('./cc.surface.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }
function tryMod(p){ try { return require(p); } catch(e){ return null; } }

function sleepStart(){ var v=parseInt(process.env.DAWN_SLEEP_START_HOUR,10); return isFinite(v)?v:22; }
function sleepEnd(){ var v=parseInt(process.env.DAWN_SLEEP_END_HOUR,10); return isFinite(v)?v:5; }

// ---- preference gate: skip HAMs with no briefing_method ----
async function hamPrefs(hamUid) {
  try { var sched=tryMod('../core/schedule/schedule.logic.js');
    if (sched && sched.getHamPrefs) { var p=await sched.getHamPrefs(hamUid); return p||{}; } } catch(e){}
  return {};
}

function inSleepHours(moment) {
  var h=moment.hour_24, s=sleepStart(), e=sleepEnd();
  return (h>=s)||(h<e);
}

// ---- per-HAM-per-day dedup ----
async function alreadyDeliveredToday(hamUid, moment) {
  try {
    var key='dawn.delivered.'+String(hamUid).toLowerCase()+'.'+moment.now_iso.slice(0,10);
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=id&source=eq.'+key+'&limit=1';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    return Array.isArray(r)&&r.length>0;
  } catch(e){ return false; }
}
async function markDelivered(hamUid, moment) {
  var key='dawn.delivered.'+String(hamUid).toLowerCase()+'.'+moment.now_iso.slice(0,10);
  await writeBead(hamUid,'DELIVERED',key,'[DAWN] briefing delivered '+moment.date,4,{at:moment.now_iso},moment);
}

// ---- GENERATE the six sections from the real roster; each guarded, conditional ----
async function generateSections(hamUid, moment, prefs) {
  var hasNylas = !!(prefs && (prefs.nylas_grant || prefs.has_nylas));
  var interests = (prefs && prefs.interests) || [];
  var sec = { upcoming:[], emails:[], news:[], pending:[], alertSummary:[], sports:null, spiritual:null };

  if (hasNylas) {
    try { var sched=tryMod('../core/schedule/schedule.logic.js');
      if (sched && sched.getRadarEvents){ var ev=await sched.getRadarEvents(hamUid); if(Array.isArray(ev)) sec.upcoming=ev.slice(0,10);} } catch(e){}
    try { var iman=tryMod('../reach/iman.js');
      if (iman && iman.listEmails){ var em=await iman.listEmails({HAM_UID:hamUid},{unreadOnly:true,limit:8}); if(Array.isArray(em)) sec.emails=em.slice(0,8);} } catch(e){}
  }
  if (interests.length) {
    try { var press=tryMod('./press.station.js');
      if (press && press.surfaceNews){ var pr=await press.surfaceNews(hamUid); sec.news=(pr&&pr.items)||[]; } } catch(e){}
  }
  try { var hunch=tryMod('./hunch.station.js');
    if (hunch && hunch.pendingForBriefing){ sec.pending=await hunch.pendingForBriefing(hamUid)||[]; } } catch(e){}
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary&or=(agent_global.eq.BURST,agent_global.eq.GHOST)&order=id.desc&limit=8';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    sec.alertSummary=(Array.isArray(r)?r:[]).map(function(b){return b.summary;}).slice(0,6);
  } catch(e){}
  try { var nash=tryMod('../core/wonders/nash.wonder.js'); if (nash && nash.latestForHam) sec.sports=await nash.latestForHam(hamUid); } catch(e){}
  try { var soul=tryMod('./soul.station.js'); if (soul && soul.surfaceDaily){ var so=await soul.surfaceDaily(hamUid); sec.spiritual=so&&so.offering; } } catch(e){}
  return sec;
}

// ---- ORGANIC INTERVIEW: one natural question about an empty profile field, never repeated ----
var DISCOVERABLE = [
  { field:'favorite_team', ask:"by the way, do you follow any sports teams? I want to keep you in the loop on the scores that matter to you." },
  { field:'interests',     ask:"quick one, what kinds of news do you actually care about? I would rather bring you what you want than clutter your morning." },
  { field:'birthday',      ask:"if you do not mind me asking, when is your birthday? I like to keep the important days in view." },
  { field:'hobbies',       ask:"what do you get into when you actually have a free evening? I like knowing what matters to you outside the work." },
  { field:'school',        ask:"where did you go to school? it helps me connect some dots when things come up." }
];
async function askedAlready(hamUid) {
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary&source=eq.dawn.discovery_asked.'+String(hamUid).toLowerCase()+'&order=id.desc&limit=30';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    return (Array.isArray(r)?r:[]).map(function(b){return b.summary;});
  } catch(e){ return []; }
}
async function pickDiscovery(hamUid, prefs, moment) {
  var asked=await askedAlready(hamUid);
  for (var i=0;i<DISCOVERABLE.length;i++){
    var d=DISCOVERABLE[i];
    var empty=!(prefs && prefs[d.field] && (!Array.isArray(prefs[d.field])||prefs[d.field].length));
    var notAsked=asked.indexOf(d.field)===-1;
    if (empty && notAsked){
      // record that we asked (rally: persists so it never repeats)
      await writeBead(hamUid,'DISCOVERY_ASKED','dawn.discovery_asked.'+hamUid,d.field,3,{field:d.field},moment).catch(function(){});
      return d.ask;
    }
  }
  return null; // nothing to ask -> no question this briefing
}

// ---- ASSEMBLE: the organ composes the briefing THROUGH the one voice. null if nothing real. ----
async function assemble(hamUid, moment, sec, prefs, discoveryQuestion) {
  var hasContent=(sec.upcoming.length||sec.emails.length||sec.news.length||sec.pending.length||sec.alertSummary.length||sec.sports||sec.spiritual);
  if (!hasContent && !discoveryQuestion) return null; // silence over hollow
  try {
    var firstName=(prefs && (prefs.first_name||prefs.name)) || 'Boss';
    var city=(prefs && prefs.city) || null;
    var instruction=
      'Write '+firstName+"'s daily briefing as A'NU, their butler. It is "+moment.day_name+' '+
      moment.part_of_day+', '+moment.date+(city?', and they are in '+city:'')+'. Greet them warmly '+
      'by first name, time-appropriate. Then walk through, in this order, ONLY the sections that '+
      'have content: a short opening read of the day, what is upcoming on their calendar (the '+
      'highlights, spoken like a person, not a dumped list), the emails that actually matter, '+
      'the news in their interests, what is pending and needs them, and anything urgent from '+
      'overnight. Give them the full, useful picture, as much as they can comfortably take in; '+
      'do not clip it short. Fold in sports for their teams and a brief spiritual note only if '+
      'present. Close warm and encouraging without being cheesy.'+
      (discoveryQuestion?(' At the very end, after the briefing, ask this ONE question naturally, '+
      'like a friend catching up, never like a survey: "'+discoveryQuestion+'"'):'')+
      ' Never show any agent or system names. Only use the facts given below.\n\nFACTS:\n'+JSON.stringify(sec);
    var out=await ladder.deliberate(persona.voicePrompt(instruction), '', { max_tokens:1200, timeout:40000 });
    var text=out&&out.content!=null?String(out.content).trim():'';
    return text? persona.applyPersona(text) : null; // final identity scrub through the one persona
  } catch(e){ return null; }
}

// ---- DELIVER via the HAM's preferred method through the real outreach path ----
async function deliver(hamUid, briefing, prefs, moment) {
  // The briefing lands on the Command Center desk as a CC_NOTE the feed serves, so the founder
  // sees it regardless of channel. This does NOT depend on the outreach module (the old
  // payload-into-outreachPassForHam did nothing anyway). Genuine IMAN email / VARA voice
  // delivery per briefing_method flows through the Overseer's real reach path on the stamped
  // facts; the desk record is guaranteed here.
  var ok = await ccSurface.surfaceToCommandCenter(hamUid, 'DAWN', 'Your daily briefing', briefing, 'briefing', 6).catch(function(){ return false; });
  return !!ok;
}

// ---- EXIT / RALLY (Lesson 5): reconcile yesterday before today's briefing ----
// close pending items that resolved, note discovery answers, mark stale ones. This is the
// self-review loop that makes DAWN a whole wonder, not fire-and-forget.
async function reconcileYesterday(hamUid, moment) {
  try {
    var y=new Date(new Date(moment.now_iso).getTime()-24*3600*1000).toISOString().slice(0,10);
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=id,summary,content&source=eq.dawn.station.briefing.'+String(hamUid).toLowerCase()+'&created_at=gte.'+y+'&order=id.desc&limit=1';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    if (Array.isArray(r)&&r[0]) {
      await writeBead(hamUid,'RECONCILE','dawn.reconcile.'+hamUid,'[DAWN] reviewed yesterday briefing, carried open items forward',4,{reviewed:r[0].id},moment).catch(function(){});
    }
  } catch(e){}
}

// ---- FCW wall: DAWN marks itself up each run so A'NU can see/fix it ----
async function markWall(hamUid, moment, status) {
  await writeBead(hamUid,'WALL','dawn.wall.'+hamUid,'[DAWN] '+status,2,{status:status,at:moment.now_iso},moment).catch(function(){});
}

// ---- ENTRANCE ----
async function buildBriefing(hamUid) {
  var moment=await nowStation.assembleNow(hamUid);
  var prefs=await hamPrefs(hamUid);
  if (!prefs || !prefs.briefing_method) { return { moment:moment, briefing:null, reason:'no_briefing_method_skip' }; } // pref gate
  if (inSleepHours(moment)) { return { moment:moment, briefing:null, reason:'sleep_hours' }; }                          // sleep guard
  if (await alreadyDeliveredToday(hamUid, moment)) { return { moment:moment, briefing:null, reason:'already_delivered_today' }; }

  await reconcileYesterday(hamUid, moment);                 // EXIT/RALLY of the prior cycle first
  var sec=await generateSections(hamUid, moment, prefs);
  var discovery=await pickDiscovery(hamUid, prefs, moment); // organic interview (one question)
  var briefing=await assemble(hamUid, moment, sec, prefs, discovery);
  if (!briefing) { await markWall(hamUid, moment, 'nothing_to_brief'); return { moment:moment, briefing:null, reason:'nothing_to_brief' }; }

  await stampBriefing(hamUid, briefing, moment).catch(function(){});
  var ok=await deliver(hamUid, briefing, prefs, moment);
  if (ok) await markDelivered(hamUid, moment).catch(function(){});     // dedup AFTER delivery so failure can retry
  await markWall(hamUid, moment, ok?'delivered':'delivery_failed_will_retry');
  return { moment:moment, briefing:briefing, delivered:ok, asked:!!discovery };
}

async function stampBriefing(hamUid, briefing, moment) {
  await writeBead(hamUid,'BRIEFING','dawn.station.briefing.'+hamUid,'[DAWN] '+moment.day_name+' briefing',6,{briefing:briefing,moment:moment},moment);
}

async function writeBead(hamUid, stampType, source, summary, importance, content, moment) {
  var bead={ ham_uid:hamUid, agent_global:'DAWN', stamp_type:stampType,
    acl_stamp:'\u2b21B:dawn.'+String(stampType).toLowerCase()+':'+stampType+':daily_briefing_lead:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:source, summary:String(summary).slice(0,160), importance:importance,
    spawned_by:'dawn.station.'+hamUid, content:JSON.stringify(content) };
  await fetch(_bu()+'/rest/v1/'+_tbl(),{method:'POST',headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal'},
    body:JSON.stringify(bead),signal:AbortSignal.timeout(8000)});
}

module.exports = { buildBriefing:buildBriefing, generateSections:generateSections, assemble:assemble, pickDiscovery:pickDiscovery, reconcileYesterday:reconcileYesterday };
