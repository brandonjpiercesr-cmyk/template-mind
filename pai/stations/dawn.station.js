// ⬡B:pai.stations.dawn:REBUILD:dawn_department_lead_six_section_briefing_per_ham_dedup_real_delivery:20260719⬡
// FOUNDER CORRECTION 20260719 (Lesson 4). The first build was a vague 3-stage skeleton that
// missed the real spec. Rebuilt from the founder's own history (a year of chats), not one bead.
//
// DAWN = Daily Automated Wisdom Notifier. It is the DEPARTMENT LEAD of PROACTIVE (reports to
// AIR). It generates ONE personalized daily briefing per HAM and delivers it at their
// preferred time via their preferred channel. It is NOT a generic "gather and summarize."
//
// THE SIX FIXED SECTIONS (real spec):
//   summary       -- one-paragraph overview of the day
//   upcoming      -- calendar events in the next 24h (RADAR / schedule.logic)
//   emails        -- important unread messages (IMAN)
//   news          -- articles matching the HAM's interests (PRESS overnight scan)
//   pending       -- items needing HAM attention (HUNCH pending tips + surfaced items)
//   alertSummary  -- anything urgent from overnight (BURST + GHOST overnight memo)
//
// SOURCE ROSTER (coordinates with, real hooks in the new world):
//   RADAR calendar  -> pai/core/schedule/schedule.logic.js (getRadarEvents/listCalendarEvents)
//   PRESS news      -> pai/stations/press.station.js (overnight news scan)
//   NASH sports     -> pai/core/wonders/nash.wonder.js (scores for HAM interests)
//   GHOST overnight -> pai/stations/ghost.station.js (overnight summary)
//   HUNCH pending   -> pai/stations/hunch.station.js (pendingForBriefing)
//   IMAN emails     -> pai/reach/iman.js (unread summaries)
//   SOUL            -> pai/stations/soul.station.js (daily spiritual offering, if enabled)
//
// DELIVERY: via the HAM's preferred method -- IMAN (email) or VARA (voice) -- through the real
// outreach path, NEVER a delivery path DAWN invents. PER-HAM-PER-DAY DEDUP: a briefing is
// generated/delivered at most once per HAM per day (key dawn.delivered.{ham}.{YYYY-MM-DD});
// the dedup is written AFTER successful delivery so a failed delivery can retry. It CONSUMES
// NOW for the moment and the date. Composition is an ORGAN through the ONE ladder. Silence
// over hollow: if nothing real was gathered, no empty "good morning, nothing to report" shell.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

function tryMod(p){ try { return require(p); } catch(e){ return null; } }

// ---- per-HAM-per-day dedup ----
async function alreadyDeliveredToday(hamUid, moment) {
  try {
    var key = 'dawn.delivered.' + String(hamUid).toLowerCase() + '.' + moment.now_iso.slice(0,10);
    var url = _bu()+'/rest/v1/'+_tbl()+'?select=id&source=eq.'+key+'&limit=1';
    var r = await fetch(url, { headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() },
      signal: AbortSignal.timeout(8000) }).then(function(x){return x.json();});
    return Array.isArray(r) && r.length > 0;
  } catch(e){ return false; } // fail open: better a possible dup than a missed briefing
}

async function markDelivered(hamUid, moment) {
  var key = 'dawn.delivered.' + String(hamUid).toLowerCase() + '.' + moment.now_iso.slice(0,10);
  var bead = { ham_uid:hamUid, agent_global:'DAWN', stamp_type:'DELIVERED',
    acl_stamp:'\u2b21B:dawn.delivered:DELIVERED:briefing_sent_dedup:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:key, summary:'[DAWN] briefing delivered '+moment.date, importance:4,
    spawned_by:'dawn.station.'+hamUid, content:JSON.stringify({ at: moment.now_iso }) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

// ---- GENERATE: fill the six sections from the real roster, each guarded/fails open ----
async function generateSections(hamUid, moment) {
  var upcoming=[], emails=[], news=[], pending=[], alertSummary=[];

  // upcoming: RADAR calendar
  try { var sched=tryMod('../core/schedule/schedule.logic.js');
    if (sched && sched.getRadarEvents) { var ev=await sched.getRadarEvents(hamUid); if (Array.isArray(ev)) upcoming=ev.slice(0,8); } } catch(e){}
  // emails: IMAN unread
  try { var iman=tryMod('../reach/iman.js');
    if (iman && iman.listEmails) { var em=await iman.listEmails({HAM_UID:hamUid},{unreadOnly:true,limit:6}); if (Array.isArray(em)) emails=em.slice(0,6); } } catch(e){}
  // news: PRESS overnight scan
  try { var press=tryMod('./press.station.js');
    if (press && press.surfaceNews) { var pr=await press.surfaceNews(hamUid); news=(pr&&pr.items)||[]; } } catch(e){}
  // pending: HUNCH pending tips
  try { var hunch=tryMod('./hunch.station.js');
    if (hunch && hunch.pendingForBriefing) { pending=await hunch.pendingForBriefing(hamUid) || []; } } catch(e){}
  // alertSummary: BURST urgent + GHOST overnight
  try {
    var url=_bu()+'/rest/v1/'+_tbl()+'?select=summary&or=(agent_global.eq.BURST,agent_global.eq.GHOST)&order=id.desc&limit=8';
    var r=await fetch(url,{headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},signal:AbortSignal.timeout(8000)}).then(function(x){return x.json();});
    alertSummary=(Array.isArray(r)?r:[]).map(function(b){return b.summary;}).slice(0,6);
  } catch(e){}
  // sports (NASH) folds into news/summary context if the HAM follows a team
  var sports=null;
  try { var nash=tryMod('../core/wonders/nash.wonder.js');
    if (nash && nash.latestForHam) sports=await nash.latestForHam(hamUid); } catch(e){}
  // spiritual (SOUL) offering if enabled
  var spiritual=null;
  try { var soul=tryMod('./soul.station.js');
    if (soul && soul.surfaceDaily) { var so=await soul.surfaceDaily(hamUid); spiritual=so&&so.offering; } } catch(e){}

  return { moment:moment, upcoming:upcoming, emails:emails, news:news, pending:pending,
           alertSummary:alertSummary, sports:sports, spiritual:spiritual };
}

// ---- ASSEMBLE: the organ writes the six-section briefing. null when nothing real gathered ----
async function assemble(hamUid, sections) {
  var hasContent = (sections.upcoming.length||sections.emails.length||sections.news.length||
                    sections.pending.length||sections.alertSummary.length||sections.sports||sections.spiritual);
  if (!hasContent) return null; // silence over hollow
  try {
    var sys =
      'You are DAWN, writing a personalized daily briefing for one person. It is '+
      sections.moment.day_name+', '+sections.moment.date+'. Produce a warm, brief briefing '+
      'with these sections IN ORDER, skipping any that are empty: summary (one short '+
      'paragraph overview), upcoming (next-24h calendar), emails (important unread), news '+
      '(matching his interests), pending (needs his attention), alertSummary (anything urgent '+
      'from overnight). Never invent; use only what is given. Never show agent names or '+
      'technical jargon.';
    var out = await ladder.deliberate(sys, JSON.stringify(sections), { max_tokens:800, timeout:35000 });
    var text = out && out.content!=null ? String(out.content).trim() : '';
    return text || null;
  } catch(e){ return null; }
}

// ---- DELIVER: via the HAM's preferred method through the real outreach path ----
async function deliver(hamUid, briefing, moment) {
  var outreach = tryMod('../core/outreach.js');
  if (outreach && outreach.outreachPassForHam) {
    try {
      await outreach.outreachPassForHam(hamUid, {
        origin: 'dawn',
        message: briefing,
        suggested_channel: process.env.DAWN_DEFAULT_CHANNEL || 'command_center', // per-HAM pref overrides in outreach
        is_briefing: true
      });
      return true;
    } catch(e){ return false; }
  }
  return false;
}

// ---- ENTRANCE: the morning sweep (waking hours, driven by the autonomous cycle) calls this ----
async function buildBriefing(hamUid) {
  var moment = await nowStation.assembleNow(hamUid);          // consume NOW, no twin
  if (await alreadyDeliveredToday(hamUid, moment)) return { moment:moment, briefing:null, reason:'already_delivered_today' };
  var sections = await generateSections(hamUid, moment);
  var briefing = await assemble(hamUid, sections);
  if (!briefing) return { moment:moment, briefing:null, reason:'nothing_to_brief' }; // silence over hollow
  await stampBriefing(hamUid, briefing, moment).catch(function(){});
  var ok = await deliver(hamUid, briefing, moment);
  if (ok) { await markDelivered(hamUid, moment).catch(function(){}); } // dedup AFTER delivery so failure can retry
  return { moment:moment, briefing:briefing, delivered:ok };
}

async function stampBriefing(hamUid, briefing, moment) {
  var bead = { ham_uid:hamUid, agent_global:'DAWN', stamp_type:'BRIEFING',
    acl_stamp:'\u2b21B:dawn.briefing:BRIEFING:six_section_morning_briefing:'+moment.now_iso.slice(0,10).replace(/-/g,'')+'\u2b21',
    source:'dawn.station.briefing.'+hamUid,
    summary:'[DAWN] '+moment.day_name+' briefing: '+briefing.slice(0,100),
    importance:6, spawned_by:'dawn.station.'+hamUid,
    content:JSON.stringify({ briefing:briefing, moment:moment }) };
  await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:{ apikey:_bk(), Authorization:'Bearer '+_bk(),
    'Content-Type':'application/json','Content-Profile':_schema(),'Accept-Profile':_schema(),Prefer:'return=minimal' },
    body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
}

module.exports = { buildBriefing:buildBriefing, generateSections:generateSections, assemble:assemble };
