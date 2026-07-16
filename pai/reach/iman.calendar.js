// ⬡B:clair.ruling:CANONICAL-LIVE:name_twin_already_retired:20260712⬡ CLAIR+A’NEW: confirmed the real, live implementation; its name-twin is already ruled SUPERSEDED/RETIRED elsewhere. Lane-review closeout.
// ⬡B:reach.iman.calendar:MODULE:calendar_agent:20260616⬡
// entered through the ABAHAM door, serving the IMAN MESSAGES channel path to a HAM
var { getGrant } = require('./iman');
var NYLAS = 'https://api.us.nylas.com/v3/grants/';
function key(g){ return process.env[(g&&g.keyEnv)||'NYLAS_API_KEY']||null; }
async function primaryCal(grantId,k,preferEmail){
  var r=await fetch(NYLAS+grantId+'/calendars?limit=10',{headers:{'Authorization':'Bearer '+k}}).then(function(x){return x.json();}).catch(function(){return Object.create(null);});
  var cals=r.data||[];
  // Prefer the calendar that belongs to this grant's own address (e.g. brandon@),
  // not the first writable one (which can be a shared calendar like maureen@).
  if(preferEmail){
    var own=cals.find(function(c){return c.id===preferEmail||String(c.name||'').toLowerCase()===String(preferEmail).toLowerCase();});
    if(own) return own.id;
  }
  return ((cals.find(function(c){return !c.read_only;}))||cals[0]||{}).id||null;
}
async function listEvents(world,opts){
  var g=getGrant(world); if(!g) return {ok:false,reason:'no grant: '+world};
  var k=key(g); if(!k) return {ok:false,reason:'key not set: '+g.keyEnv};
  var calId=(opts&&opts.calendarId)||await primaryCal(g.grantId,k,g.from);
  if(!calId) return {ok:false,reason:'no calendar found'};
  var now=Math.floor(Date.now()/1000);
  var url=NYLAS+g.grantId+'/events?calendar_id='+encodeURIComponent(calId)+'&start='+(opts&&opts.start||now)+'&end='+(opts&&opts.end||now+7*24*3600)+'&limit='+(opts&&opts.limit||10)+'&expand_recurring=true';
  var r=await fetch(url,{headers:{'Authorization':'Bearer '+k}}).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
  if(!r.data) return {ok:false,reason:String(r.error||r.message||JSON.stringify(r)).slice(0,80)};
  return {ok:true,from:g.from,calendarId:calId,events:r.data.map(function(e){
    var w=e.when||{}; return {id:e.id,title:e.title||'(no title)',start:w.start_time||w.date,end:w.end_time||w.end_date,location:e.location||null};
  })};
}
async function createEvent(world,opts){
  opts=opts||{};
  // ⬡B:reach.iman.calendar:WIRE:one_proof_bound_calendar_mutation:20260715⬡
  // Reads remain world/grant scoped here. Writes have one canonical owner:
  // schedule.logic verifies the full PAI pair, exact four-field artifact,
  // kill switch, durable provider claim, positive event ID and stored stamp.
  if(!opts.hamUid&&!opts.ham_uid) return {ok:false,reason:'ham_uid_required'};
  if(opts.allDay||opts.date||opts.location||opts.calendarId||
      (Array.isArray(opts.participants)&&opts.participants.length)) {
    return {ok:false,reason:'calendar_shape_requires_canonical_booking'};
  }
  return require('../core/schedule/schedule.logic.js').bookEvent(opts.hamUid||opts.ham_uid,{
    title:opts.title,start:opts.start,end:opts.end,description:opts.description,
    bookingAuthorization:opts.bookingAuthorization
  });
}
// ⬡B:reach.iman.calendar:WIRE:advisor_milestone_scan:20260710⬡
// Rebirth Pt 2 doctrine: advisors are piped into the calendar per grant, scan
// ahead, extract milestones, plan backwards. Read-only, own world only (EBC
// firewall holds -- getGrant resolves ONLY the world passed in). Returns a
// compact planning line for the advisor's context, or '' when there is nothing
// upcoming or no calendar (e.g. a read-only grant).
async function milestoneSummary(world,days){
  var now=Math.floor(Date.now()/1000);
  var end=now+((days||120)*24*3600);
  var r=await listEvents(world,{start:now,end:end,limit:12});
  if(!r.ok||!r.events||!r.events.length) return '';
  var items=r.events.filter(function(e){return e.start;}).sort(function(a,b){return (a.start||0)-(b.start||0);}).slice(0,8)
    .map(function(e){var d=new Date((e.start||0)*1000).toISOString().slice(0,10);return d+' '+(e.title||'').slice(0,60);});
  if(!items.length) return '';
  return 'Upcoming calendar milestones for this world (next '+(days||120)+' days). Plan backwards from each and work the assignment before it arrives, as an executive director would: '+items.join('; ')+'.';
}
module.exports={listEvents:listEvents,createEvent:createEvent,milestoneSummary:milestoneSummary};
