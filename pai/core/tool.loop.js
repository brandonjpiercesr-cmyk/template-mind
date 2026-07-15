// ⬡B:core.tool.loop:MODULE:pai_executor:20260630⬡
var MAX_TOKENS = parseInt(process.env.PAI_MAX_TOKENS || '700', 10); // ⬡B:core.tool.loop:REPAIR:configurable_token_cap:20260707⬡ was hardcoded 400 in three places, now one env-driven value
// ⬡B:core.tool.loop:FIX:channel_scoped_token_cap:20260710⬡ CLAIR wiring fix.
// Real incident: GUIDE pass 2 (strict JSON, 12 fields per destination) was
// truncated mid-JSON by the one global 700 cap and died as
// unstructured_answer_pass2 every single time. A channel may carry its own
// cap via PAI_MAX_TOKENS_<CHANNEL>; absent that, the global cap holds.
function tokenCapFor(channel) {
  var c = String(channel || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  var v = parseInt(process.env['PAI_MAX_TOKENS_' + c] || '', 10);
  return (v && v > 0) ? v : MAX_TOKENS;
}
// entered via the ABAHAM door, serving every channel that reaches PAI: text, voice, email, chat
// ⬡B:core.tool.loop:FIX:fix_file_cooldown_added:20260701⬡
// TOOL LOOP -- Memory Bank in, response out. Groq C2 deliberates. Tools fire. Up to 20 iterations.
// ANYHAM test: ham_uid drives all tool calls. No identity hardcoded. C1/C2 penny hustle.
//
// CLAIR fix: real incident 20260630 -- fix_file_in_github fired on the same path
// 10 times in 16 seconds during a retry burst, self-labeled with a banned model
// name in the commit messages. The cooldown module referenced in doctrine
// (eanew/cooldown.js) does not exist in this repo -- checked directly, not
// assumed. Added a real cooldown guard at the one place a commit actually
// happens, so no future burst can land regardless of what triggers the retry.
'use strict';
// ⬡B:core.tool.loop:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}
const { buildMemoryBank } = require('./fcw.builder.js'); // Memory Bank (BIND doctrine)
const { find } = require('./find.js');
const { readRenderLogs } = require('./tools/render.logs.js');
const { fixFileInGithub } = require('./tools/github.fix.js');
const { triggerDeploy } = require('./tools/render.deploy.js');
const { notifyHam } = require('./tools/notify.ham.js');
// ⬡B:core.tool.loop:WIRE:ledger_tools_registered:20260707⬡
// CLAIR fix, real gap found in audit 20260707: LEDGER (Budget OS) had a live
// backend, 16 real BNPL plans, a working /budget/ask endpoint -- and was never
// registered here, so no channel that runs through runPAI (WREN text included)
// could ever reach it. Texting a real money question got a generic answer or
// nothing. Two read-only tools below close that, same pattern as every other
// tool in this file: real data in, no rogue side-effect calls, hamUid always
// threaded through, never assumed.
const ledger = require('../agents/budget/ledger.js');
var GB = 'https://api.groq.com/openai/v1/chat/completions';
var MAX = 20;

// Cooldown state: one real fix commit per file path per window, in-process.
// Resets on deploy/restart -- that is acceptable, since the failure this
// guards against is a tight intra-process retry loop, not a cross-restart one.
var FIX_COOLDOWN_MS = 60000;
var _lastFixAttempt = {};

var TOOLS = [
  // ⬡B:tool.loop:TOOL:nash_sports_wonder:20260711⬡ NASH, the sports agent, made
  // a real wonder: cold ESPN public scoreboard, no key, no cost, finite-formula.
  {type:'function',function:{name:'nash_sports',description:'NASH the sports agent. Live and recent scores/results for a league. '
    +'Use for ANY question about a game, score, or whether a team won (Lakers, NBA, NFL, MLB, NHL, WNBA). '
    +'Pass league as one of: nba, nfl, mlb, nhl, wnba. Returns the latest scoreboard lines.',
    parameters:{type:'object',properties:{league:{type:'string',description:'nba|nfl|mlb|nhl|wnba'}},required:['league']}}},
  {type:'function',function:{name:'find_in_brain',description:'Search brain by exact stamp_type, source prefix, or agent_global. '
    +'No fuzzy/ilike keyword search exists, by design, to keep every query under 100ms -- you must pick an exact match. '
    +'A question about a specific email, sender, or "what\'s in my inbox" -> stamp_type UNRESOLVED_INBOUND. '
    +'A question about what was recently built, fixed, or found -> stamp_type RESULT. '
    +'A question about what a past conversation turn said -> stamp_type MINUTES. '
    +'A question about something flagged as worth attention -> stamp_type SIGNAL. '
    +'A question about a decision that was made -> stamp_type DECISION. '
    +'A question about the person\'s own tastes, favorites, or preferences (favorite team, favorite food, what they like) -> stamp_type PREFERENCE. '
    +'A question about a failure, a stuck loop, something broken, or what is wrong -> stamp_type ALERT. '
    +'A question ABOUT A SPECIFIC ORG OR ADVISOR (how is X going, what is happening with X, status of X) -> use '
    +'agent_global instead of guessing a stamp_type, set to exactly one of: MEDIATORS_ADVISOR (mediators/mediation), '
    +'BDIF_ADVISOR (Brian Dawkins Impact Foundation/BDIF), GMG_ADVISOR (Global Majority Group/GMG), MH_ACTION_ADVISOR '
    +'(MH Action), ELI (legal/Envolve entity), BUSINESS (Envolve business/entity), CODER (coding department/build queue). '
    +'A question about Wonder Games, the coding cook-off, a head-to-head model contest, or which model won a build -> '
    +'stamp_type WONDER_GAMES first; if that returns nothing, also try DOCTRINE and DIRECTIVE (the rules and naming of '
    +'the contest system are stamped there, not just individual match results). '
    +'agent_global can combine with stamp_type (e.g. agent_global MEDIATORS_ADVISOR + stamp_type RESULT) to narrow further, '
    +'or be used alone with a higher limit to see everything recent from that org. '
    +'Real, confirmed bug this closes: ham_uid defaults to the asking HAM unless you pass it explicitly, but '
    +'UNRESOLVED_INBOUND rows are always stamped ham_uid "unknown" (an unresolved sender has no HAM yet), so a '
    +'default search for inbox questions silently returns nothing every time even with the right stamp_type. '
    +'For UNRESOLVED_INBOUND specifically, pass ham_uid as the literal string "unknown", not the asking HAM. '
    +'If you are not sure which stamp_type or agent_global fits, run it with a higher limit and no filter first, read '
    +'the summaries, then narrow. Say plainly you do not have the information rather than guessing if nothing real comes back.',
    parameters:{type:'object',properties:{stamp_type:{type:'string'},source_prefix:{type:'string'},
      agent_global:{type:'string',description:'Exact org/advisor name for topic questions -- see description for the real list. Equality match, not a keyword search.'},
      ham_uid:{type:'string'},limit:{type:'number'},
      order:{type:'string',description:'"asc" to get the EARLIEST match (e.g. the beginning/opening of a multi-part document); omit for newest-first, the default.'}}}}},
  {type:'function',function:{name:'write_to_brain',description:'Write a BEAD to brain.',
    parameters:{type:'object',required:['ham_uid','stamp_type','summary','content'],
    properties:{ham_uid:{type:'string'},stamp_type:{type:'string'},
      summary:{type:'string'},content:{type:'string'},importance:{type:'number'}}}}},
  {type:'function',function:{name:'read_render_logs',description:'Read crash logs for a Render service. Use when diagnosing deploy failures.',
    parameters:{type:'object',required:['service_id'],
    properties:{service_id:{type:'string',description:'Render service ID'},limit:{type:'number'}}}}},
  {type:'function',function:{name:'fix_file_in_github',description:'Commit a file fix to GitHub. Use to self-heal broken code.',
    parameters:{type:'object',required:['repo','path','content','reason'],
    properties:{repo:{type:'string'},path:{type:'string'},content:{type:'string'},reason:{type:'string'}}}}},
  {type:'function',function:{name:'trigger_deploy',description:'Trigger a Render deploy after fixing a file.',
    parameters:{type:'object',required:['service_id'],properties:{service_id:{type:'string'}}}}},
  {type:'function',function:{name:'notify_ham',description:'Text a HAM via iMessage. Use to reach Brandon when something is fixed or needs attention.',
    parameters:{type:'object',required:['ham_uid','message'],properties:{ham_uid:{type:'string'},message:{type:'string'}}}}},
  {type:'function',function:{name:'get_budget_upcoming',description:'Get the HAM\'s real upcoming Buy Now Pay Later payments (Zip, Afterpay, Klarna, Sezzle) with exact due dates and amounts. '
    +'Use for any question about what money is due soon, what is coming up, or pay-later balances.',
    parameters:{type:'object',properties:{ham_uid:{type:'string'},days:{type:'number',description:'How many days ahead to look, default 45'}}}}},
  {type:'function',function:{name:'get_budget_summary',description:'Get the HAM\'s real income vs expenses for the current or a specific budget cycle, spending by category, and active BNPL plan count. '
    +'Use for any question about being on track, how much has come in or gone out, or spending by category.',
    parameters:{type:'object',properties:{ham_uid:{type:'string'},cycle_start:{type:'string'},cycle_end:{type:'string'}}}}},
  {type:'function',function:{name:'create_reminder',description:'Create a real reminder that fires as a real text at the due time, and shows in Command Center before then. '
    +'Use when the HAM asks to be reminded of something, or names a specific future thing to remember. '
    +'If the HAM did not state a real date or timeframe, do not invent one -- omit due_at entirely and a sensible near-future default is used automatically.',
    parameters:{type:'object',required:['ham_uid','text'],
    properties:{ham_uid:{type:'string'},text:{type:'string',description:'the reminder text, in plain words'},
      due_at:{type:'string',description:'ISO 8601 timestamp, ONLY if the HAM actually stated a real date or timeframe. Leave this out entirely otherwise -- never invent a specific date that was not given.'}}}}},
  {type:'function',function:{name:'consult_advisor',description:'Consult one of the HAM\'s real advisors (their named worlds/stations such as bdif, gmg, business, mediators, mh_action) about a question or task, and get their brief back. '
    +'Use whenever the HAM asks to talk to, ask, run something by, or get input from an advisor. The advisor roster is per-HAM and real -- never invent an advisor name; if unsure, the tool returns the real available list.',
    parameters:{type:'object',required:['ham_uid','advisor','question'],
    properties:{ham_uid:{type:'string'},advisor:{type:'string',description:'the advisor/station slug, e.g. bdif, gmg, business, mediators, mh_action'},
      question:{type:'string',description:'what to ask the advisor, in plain words'}}}}},
  {type:'function',function:{name:'calendar_read',description:'Read the HAM\'s real calendar: upcoming events and open time slots. Use whenever the HAM asks what is on their calendar, whether they are free, or to find a time or slot for something (a haircut, a meeting). Returns real events and computed free slots -- never invent availability.',
    parameters:{type:'object',required:['ham_uid'],
    properties:{ham_uid:{type:'string'},want:{type:'string',enum:['events','slots','both'],description:'events = what is scheduled, slots = open times, both = default'},
      days:{type:'number',description:'how many days ahead to consider, default 14'}}}}},
  {type:'function',function:{name:'calendar_book',description:'Book a REAL event on the HAM\'s calendar. This creates an actual calendar entry, so only call it once the HAM has approved the specific time -- after calendar_read surfaced an open slot they said yes to, or when they explicitly ask to put something on their calendar at a stated time. IMPORTANT: if the HAM is replying to a session you (or a prior turn) proposed -- "yes", "lock it", "sounds good", a specific time they picked -- first call find_in_brain with stamp_type SESSION to find the exact pending proposal and its slot times, then book those exact times, do not invent a time. Never book a time the HAM has not confirmed.',
    parameters:{type:'object',required:['ham_uid','title','start'],
    properties:{ham_uid:{type:'string'},title:{type:'string',description:'what the event is, e.g. "Haircut"'},
      start:{type:'string',description:'ISO 8601 start time'},end:{type:'string',description:'ISO 8601 end time; optional, defaults to 45 minutes after start'},
      description:{type:'string',description:'optional note on the event'}}}}},
  {type:'function',function:{name:'propose_working_session',description:'Convene a real working session with the HAM when enough genuine work has piled up. Pulls the real agenda from what the advisers already proposed and what is owed to the HAM, finds an open slot on their calendar, and brings it to them with a real agenda. Use when the HAM asks whether you should meet, or when accumulated decisions genuinely need a sit-down. Convenes nothing if there is not enough real material -- never a canned session.',
    parameters:{type:'object',required:['ham_uid'],
    properties:{ham_uid:{type:'string'},autobook:{type:'boolean',description:'if true, book the slot live now; default false = propose the real slot and agenda and ask to lock it'}}}}},
  {type:'function',function:{name:'contact_send',description:'Text a REAL third party (not the HAM) -- someone resolved via find_contact. This is a real outbound message to a real external human, gated by the HAM\'s own standing rule: an outbound send to a real external human needs explicit confirmation UNLESS the HAM already authorized this exact send in their current message ("text my brother and tell him X" IS the authorization -- send it). Set authorized_in_message true ONLY when the HAM\'s current message explicitly instructed this exact send to this exact person. If you are proposing this on your own initiative, or the HAM only mentioned the person without instructing a send, set it false -- this drafts the message and asks for confirmation instead of sending. Never invent a phone number; if find_contact returned nothing, do not call this.',
    parameters:{type:'object',required:['ham_uid','contact_query','message','authorized_in_message'],
    properties:{ham_uid:{type:'string'},contact_query:{type:'string',description:'the name or relationship as the HAM said it, e.g. "BJ" or "my brother"'},
      message:{type:'string',description:'the exact text to send'},
      authorized_in_message:{type:'boolean',description:'true only if the HAM\'s current message explicitly instructed this exact send'}}}}},
  {type:'function',function:{name:'find_contact',description:'Resolve a person the HAM names (a name like BJ, or a relationship like "my brother" or "mom") to their real saved contact (name, relationship, phone, email). Use before texting, calling, or emailing someone who is not the HAM, or when the HAM asks for a contact\'s details. Returns not found if the person is not saved -- never invent a number or email.',
    parameters:{type:'object',required:['ham_uid','who'],
    properties:{ham_uid:{type:'string'},who:{type:'string',description:'the name or relationship phrase, e.g. "my brother", "BJ", "mom"'}}}}},
  {type:'function',function:{name:'stop_mentioning',description:'Stop bringing up a topic, task, or reminder the HAM has told you to drop (for example "stop mentioning the Park LOI", "that is expired, quit reminding me"). Records a suppression so it never surfaces again as a passive aside. Use whenever the HAM says a recurring mention is unwanted, done, or expired.',
    parameters:{type:'object',required:['ham_uid','keyword'],
    properties:{ham_uid:{type:'string'},keyword:{type:'string',description:'the distinctive word or phrase to stop mentioning, e.g. "park" or "Park LOI"'}}}}},
  {type:'function',function:{name:'get_pending_drafts',description:'Get the real, current pending draft replies for a specific org, waiting on approval. '
    +'Use this whenever asked for drafts, pending replies, or "the X ones" for BDIF, Mediators, GMG, or MH Action -- do not use find_in_brain for this, the general search misses these under real traffic volume.',
    parameters:{type:'object',required:['org'],properties:{ham_uid:{type:'string'},
      org:{type:'string',enum:['bdif','mediators','gmg','mh_action'],description:'which org\'s drafts to pull'}}}}},
  {type:'function',function:{name:'request_new_capability',description:'Use when the HAM asks you to help with something you cannot currently do -- a new kind of coaching, tracking, or agent. '
    +'Checks whether enough real data already exists about this to actually build it. If yes, files a real build task. If not, tells you exactly what specific information to provide first.',
    parameters:{type:'object',required:['ham_uid','capability_description'],
    properties:{ham_uid:{type:'string'},capability_description:{type:'string',description:'what the HAM wants help with, in their own words'}}}}},
  // \u2b21B:core.tool_loop:FIX:screen_control_as_real_tool_not_prose_json:20260709\u2b21
  // Founder-caught live, twice, two different failure modes: asking a text-completion
  // model to embed a trailing JSON block inside free conversational prose is unreliable
  // by nature. First failure: a natural closing sentence after the block broke a naive
  // parser and the raw block leaked onto the founder's screen. Second failure, after that
  // was fixed: she never emitted the block at all, and instead talked ABOUT changing a
  // field name in prose. Every other reliable action in this system (find_in_brain,
  // write_to_brain, create_reminder) is a real tool call, structurally enforced by the
  // API, not a text convention parsed after the fact. This brings screen control to that
  // same standard. The handler reuses the exact same validation the old text-block path
  // used (real background ids only, real preset names only, https-only images, no
  // fabricated values) and, critically, tells her plainly if something was rejected so
  // she can correct it in the same turn instead of failing silently.
  {type:'function',function:{name:'save_layout',description:'Save a named dashboard the person wants to reuse, e.g. they say "call this my morning setup". Give the name they chose and the real pieces it contains (budget, advisor, calendar, today, reminders, jobs). Later they can say "pull up my morning setup" and it reassembles.',
    parameters:{type:'object',properties:{
      name:{type:'string',description:'The name the person gave this layout, in their own words.'},
      pieces:{type:'array',items:{type:'string'},description:'The real piece names in this layout. Allowed: budget, advisor, calendar, today, reminders, jobs.'}},
      required:['name','pieces']}}},
  {type:'function',function:{name:'edit_layout',description:'Change a dashboard the person already saved: add pieces to it or remove pieces from it. Use when they say add budget to my morning setup, or take reminders off my usual. Give the layout name and what to add and/or remove.',
    parameters:{type:'object',properties:{
      name:{type:'string',description:'The saved layout name to edit.'},
      add:{type:'array',items:{type:'string'},description:'Real pieces to add (budget, advisor, calendar, today, reminders, jobs).'},
      remove:{type:'array',items:{type:'string'},description:'Pieces to remove.'}},
      required:['name']}}},
  {type:'function',function:{name:'update_screen',description:'Change what is showing on the person\'s live glass screen right now -- background, layout, a short skywritten line, or cards. Only usable when their screen is actually open; call it and read the result to find out. Only pass fields you actually want to change; omit everything else.',
    parameters:{type:'object',properties:{
      background:{type:'string',description:'One of the real canonical background ids. Never invent a new name.'},
      preset:{type:'string',description:'One of the real layout preset names.'},
      skywrite:{type:'string',description:'One short real line that writes itself across the sky. Never a placeholder.'},
      voice:{type:'boolean',description:'true to summon the live voice surface'},
      cards:{type:'array',description:'Real glass cards to show. Each needs a real title and region (left, center, or right), plus either real items (a text list) or a real https image url with a caption. NEVER invented, generic, or placeholder-feeling content -- "Build 1", "Build 2", or a canned Hello World print statement are exactly what NOT to do; if you do not have a real, specific, verifiable fact for a card, call get_recent_builds or find_in_brain first, or omit that card entirely. A person who calls out fake-looking content is right every time -- omit rather than decorate.',
        items:{type:'object',properties:{title:{type:'string'},region:{type:'string',enum:['left','center','right']},
          items:{type:'array',items:{type:'string'}},image:{type:'string'},caption:{type:'string'},
          email:{type:'object',description:'A real email DRAFT you have fully written, to visibly type itself onto the glass. Rendering only; this can never send. Include to, subject, and the complete real body you drafted.',
            properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'}}},
          face:{type:'string',description:'Move or toggle your own face window on their glass. Allowed values only: top-left, top-right, bottom-left, bottom-right, center, hide, show. Use when they ask you to move your face, get it out of the way, or bring it back.'},
          app:{type:'string',description:'Open one of the person REAL apps as a live window on the glass. Allowed values only: ccwa, life, gmgu, seer, tryaba. Use when they ask to open, show, or pull up one of their apps.'},
          piece:{type:'string',description:'Pull ONE real live piece of their life onto the glass, filled with their actual data. Allowed values only: budget, advisor, calendar, today, reminders, jobs. Use when they ask to see just their budget, just what their advisors say, etc -- this pulls the real numbers/messages, not an empty app window.'},
          layout:{type:'string',description:'Reassemble a dashboard the person SAVED earlier, by its name. Use when they say pull up my morning setup, show my usual, my saved dashboard, etc. Expands the saved layout into its real pieces automatically.'},
          pieces:{type:'array',items:{type:'string'},description:'Pull SEVERAL real pieces at once into one composed dashboard. Same allowed values as piece (budget, advisor, calendar, today, reminders, jobs). Use when they say cook a dashboard, show me everything, my morning briefing, catch me up on my whole day -- pull the 2 to 5 that fit, each fills with real data, empty ones are skipped.'},
          chart:{type:'object',description:'A chart of REAL numbers only (from your tools or the conversation), which grows to its values on the glass. Every series value must be a real finite number; never estimate or invent one.',
            properties:{title:{type:'string'},series:{type:'array',items:{type:'object',properties:{label:{type:'string'},value:{type:'number'}}}}}}}}}
    }}}},
  {type:'function',function:{name:'get_recent_builds',description:'Get the REAL recent deploy history for the coding service -- real commit ids, real timestamps, real live/failed status, straight from Render. Use this before ever putting a "build status" or "recent builds" card on the screen -- never invent build names or numbers.',
    parameters:{type:'object',properties:{limit:{type:'number',description:'how many recent deploys, default 5'}}}}},
  {type:'function',function:{name:'read_own_code',description:'Real, live, read-only search of your OWN actual source code -- not the brain, the real code that runs you. '
    +'Use this for any question about how YOUR OWN system, UI, or a feature is actually built or works -- '
    +'"does the command center show timestamps", "how does X get decided", "why does Y happen", "what does this button do". '
    +'This is the honest answer to those questions, not "I do not know how that works, you would know better than me" -- '
    +'you do not need to know your own implementation from memory, you can go look, the same way a person could open their own file. '
    +'Read-only: this can never change or deploy anything, only look. '
    +'PHRASING MATTERS, real incident: if the code you read shows a feature genuinely does NOT exist -- no expiry, no archive, no '
    +'special clearing logic, just a plain result limit or nothing at all -- say that plainly and specifically, e.g. "there is no '
    +'clear-out feature, it is just a 40-item display limit." Do NOT say "I could not find information on how it is done" when what '
    +'you actually mean is that no such thing exists -- that phrasing sounds like a hidden feature you failed to locate, and it is '
    +'not honest to leave that impression when you read the real code and it simply is not there. Only say you could not find '
    +'something when you genuinely could not read enough to know either way. '
    +'NEVER INVENT A NUMBER, real incident: after correctly finding the real code, a real answer named a specific "48-hour archive '
    +'window" that appears NOWHERE in any file -- a fabricated, plausible-sounding specific with zero basis, the exact opposite of '
    +'grounded. Every number, threshold, or timeframe in your answer -- a count, an hour figure, a limit, a percentage -- must be a '
    +'number you can point to literally appearing in the code excerpt you were given. If you are describing the mechanism but do '
    +'not see an actual number for some part of it, describe the mechanism without inventing one, or say that part was not visible '
    +'in what you read. A vague-but-true answer is always correct over a specific-but-invented one.',
    parameters:{type:'object',required:['query'],properties:{
      query:{type:'string',description:'Plain-language description of the real feature or behavior to look up, e.g. "command center timestamp display" or "how reminders get marked done".'}
    }}}}
];
async function executeTool(name, args, hamUid, origMessage) {
  if (name === 'read_own_code') {
    try {
      var ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (!ghToken) return JSON.stringify({ok:false,note:'No real code-read access configured right now.'});
      var query = String(args.query || '').trim();
      if (!query) return JSON.stringify({ok:false,note:'no query given'});
      // Real, read-only. Scoped to the two repos that are actually her own real code.
      var repos = ['brandonjpiercesr-cmyk/anew','brandonjpiercesr-cmyk/eanew'];
      var found = [];
      // \u2b21B:core.tool.loop:FIX:real_naming_collision_confused_synthesis:20260710\u2b21
      // Real, live incident, founder-caught, doctrine violation (STAY GROUNDED): asked
      // about the CLAIR Command Center, got an answer describing a DIFFERENT, real,
      // separate, older system that happens to share the words "command center" --
      // routes/command.center.routes.js (a live, legitimate draft-approval surface,
      // sendMode PAUSED, /command-center) is not the same real thing as the live Clear
      // Command Center (routes/three-ray.routes.js, /clear-command-center). Fuzzy
      // search cannot tell these apart by relevance alone; both genuinely match. Real
      // fix: a known, reliable anchor for this specific, recurring, real ambiguity --
      // route straight to the actual file rather than trust ranking to pick the right
      // one of two real, differently-named-but-similarly-worded systems.
      var qLower = query.toLowerCase();
      var anchorResolved = false;
      if (qLower.indexOf('CLAIR command center') !== -1 || qLower.indexOf('clear-command-center') !== -1) {
        found.push({repo:'brandonjpiercesr-cmyk/anew',path:'routes/three-ray.routes.js'});
        anchorResolved = true;
      }
      // \u2b21B:core.tool.loop:FIX:unrelated_cross_repo_number_bled_into_answer:20260710\u2b21
      // Real, live, root-cause incident: with the anchor resolved to the exact right
      // file, the broader search STILL ran and pulled in eanew's index.js, which has a
      // real, completely unrelated ">48" hours staleness check for a different feature
      // entirely. The mechanical number-verifier correctly saw 48 was a real number
      // SOMEWHERE in what was retrieved and passed it -- checking presence, not
      // relevance. The model then wove a real-but-irrelevant number into a fabricated
      // story about the actual question. Real fix: when the anchor already gives a
      // confident, known-correct answer to a known, real ambiguity, stop there. Do not
      // keep searching and risk pulling in a real number from a genuinely unrelated
      // feature that a verifier can only check for existence, not relevance.
      if (!anchorResolved) for (var i=0;i<repos.length;i++) {
        try {
          var sq = encodeURIComponent(query) + '+repo:' + repos[i];
          var sres = await fetch('https://api.github.com/search/code?q=' + sq, {
            headers: {'Authorization':'token '+ghToken, 'Accept':'application/vnd.github.v3+json'}
          }).then(function(x){return x.json();});
          // \u2b21B:core.tool.loop:FIX:top2_cutoff_dropped_the_right_file:20260710\u2b21
          // Real, live incident, founder-caught: asked whether/how the command center
          // clears out old items. GitHub's real search DID find the right file
          // (routes/three-ray.routes.js, which has the real limit:40 logic) -- ranked
          // 4th. This code only ever looked at the top 2 results, so the right answer
          // was found and then thrown away before she ever saw it. Raised to top 5.
          if (sres && Array.isArray(sres.items)) {
            for (var j=0;j<Math.min(sres.items.length,5);j++) {
              // When the anchor already resolved this to the real CLAIR Command Center
              // file, exclude the other real-but-different command.center.routes.js so
              // the two genuinely separate systems never get blended in one answer.
              if (qLower.indexOf('CLAIR command center') !== -1 && sres.items[j].path === 'routes/command.center.routes.js') continue;
              found.push({repo:repos[i],path:sres.items[j].path});
            }
          }
        } catch (eSearch) {}
      }
      if (!found.length) return JSON.stringify({ok:true,found:false,note:'Searched the real code and found nothing relevant to this. Say plainly this was not found, do not guess.'});
      var snippets = [];
      for (var k=0;k<Math.min(found.length,5);k++) {
        try {
          var raw = await fetch('https://api.github.com/repos/'+found[k].repo+'/contents/'+found[k].path+'?ref=main', {
            headers: {'Authorization':'token '+ghToken, 'Accept':'application/vnd.github.v3.raw'}
          }).then(function(x){return x.text();});
          var rawStr = String(raw);
          // \u2b21B:core.tool.loop:FIX:top_of_file_slice_missed_the_real_answer:20260710\u2b21
          // Real, live incident, second half of the same founder-caught bug: even after
          // finding the right file, this always returned characters 0-1500 -- the file's
          // header comments. The actual logic (readRays, the real limit:40) sits around
          // character 4500 in three-ray.routes.js, past the cutoff every time, so it was
          // fetched and then never actually seen. Real fix: find where query terms
          // actually appear in the file and return a real window around that, not
          // reflexively the top. Falls back to the top only if no term is found there.
          var STOP_WORDS = ['does','the','and','how','that','this','with','from','have','what',
            'when','your','you','are','was','were','been','also','then','than','into','onto',
            'show','item','items','card','cards','real','only','just','some','more','they'];
          var qWords = qLower.split(/\s+/).map(function(w){return w.replace(/[?,.!]/g,'');})
            .filter(function(w){return w.length>3 && STOP_WORDS.indexOf(w)===-1;});
          var bestIdx = -1;
          for (var wi=0; wi<qWords.length; wi++) {
            var pos = rawStr.toLowerCase().indexOf(qWords[wi]);
            if (pos !== -1 && (bestIdx===-1 || pos<bestIdx)) bestIdx = pos;
          }
          var windowStart = bestIdx > 300 ? bestIdx - 300 : 0;
          var excerpt = bestIdx !== -1
            ? rawStr.slice(windowStart, windowStart+1800)
            : rawStr.slice(0,1500);
          // \u2b21B:core.tool.loop:FIX:real_line_citations_per_actual_research:20260710\u2b21
          // Real, researched fix (arxiv 2512.12117, code-comprehension RAG hallucination):
          // "mechanical citation verification: requiring LLMs cite specific line ranges
          // that must overlap retrieved chunks, enforced through interval arithmetic
          // rather than trust." A bare list of numbers (the prior attempt) was weaker
          // than this -- real, numbered lines the model must cite by number, which can
          // be mechanically checked for overlap with what was actually fetched.
          var startLine = rawStr.slice(0, windowStart).split('\n').length;
          var numberedExcerpt = excerpt.split('\n').map(function(ln, li) {
            return (startLine + li) + ': ' + ln;
          }).join('\n');
          snippets.push({file:found[k].path, startLine:startLine, endLine:startLine+excerpt.split('\n').length, excerpt: numberedExcerpt});
        } catch (eRaw) {}
      }
      // \u2b21B:core.tool.loop:FIX:mechanical_number_anchor_not_just_instruction:20260710\u2b21
      // Real, live, repeated incident: even after an explicit written rule against
      // inventing numbers, the SAME fabricated "48-hour" figure came back twice more.
      // An abstract instruction was not reliable enough on its own. Real, mechanical
      // fix: actually extract every real number that appears in what was read and hand
      // it back as a concrete, explicit list -- a real anchor to check against, not
      // just a rule to remember.
      var allExcerpts = snippets.map(function(s){return s.excerpt;}).join(' ');
      var realNumbers = (allExcerpts.match(/\b\d+\b/g) || []);
      var uniqueNumbers = realNumbers.filter(function(n,idx){return realNumbers.indexOf(n)===idx;}).slice(0,20);
      return JSON.stringify({ok:true,found:true,files:snippets,
        realNumbersFoundInThisCode: uniqueNumbers,
        rule:'Real, researched requirement (mechanical citation verification, the proven fix for this exact failure mode): '
          +'each file above is shown with real line numbers. For every specific claim -- what a value is, how a mechanism works, '
          +'any number -- you must be able to point to the literal line number in the excerpt above that says so. If you cannot '
          +'point to a real line number for a claim, do not make that claim. Every number in your answer must be one of '
          +'realNumbersFoundInThisCode above, or absent entirely. A vague-but-true answer beats a specific-but-unfindable one, '
          +'every time.'});
    } catch (e) {
      return JSON.stringify({ok:false,note:'real code search error: '+e.message});
    }
  }
  if (name === 'get_recent_builds') {
    try {
      var RK = process.env.RENDER_API_KEY, SVCID = process.env.RENDER_SERVICE_ID;
      if (!RK || !SVCID) return 'No Render API access configured -- cannot get real build data right now.';
      var lim = Math.min(args.limit || 5, 10);
      var dr = await fetch('https://api.render.com/v1/services/' + SVCID + '/deploys?limit=' + lim,
        { headers: { Authorization: 'Bearer ' + RK } }).then(function (x) { return x.json(); }).catch(function () { return []; });
      // \u2b21B:core.tool_loop:FIX:deploy_status_honest_categories_20260710\u2b21 founder
      // watch item closed at the mechanism: she once charted deactivated deploys as
      // Failure. Render status vocabulary is translated server-side into honest
      // categories BEFORE she ever sees it, so mislabeling is structurally impossible:
      // live stays live, deactivated becomes superseded (an older deploy replaced by a
      // newer one, never a failure), build_failed/update_failed/canceled become failed,
      // anything in flight becomes in_progress.
      var CAT = { live: 'live', deactivated: 'superseded', build_failed: 'failed', update_failed: 'failed', canceled: 'failed', created: 'in_progress', build_in_progress: 'in_progress', update_in_progress: 'in_progress', pre_deploy_in_progress: 'in_progress' };
      var real = (dr || []).map(function (d) {
        var dep = d.deploy || d;
        return { commit: (dep.commit && dep.commit.id || '').slice(0, 7), status: CAT[dep.status] || dep.status, at: dep.finishedAt || dep.createdAt };
      });
      return JSON.stringify({ note: 'superseded means replaced by a newer deploy, NOT a failure; only failed means failed', deploys: real });
    } catch (eGb) { return 'Could not reach Render for real build data: ' + eGb.message; }
  }
  if (name === 'save_layout') {
    try {
      var lm = require('./stream/layout.memory.js');
      var r = await lm.save(hamUid, args.name, args.pieces || []);
      return r.ok ? ('Saved "' + r.name + '" with: ' + r.pieces.join(', ') + '. Say pull up ' + r.name + ' anytime.') : ('Could not save that layout: ' + (r.reason || 'unknown'));
    } catch (eSL) { return 'Could not save that layout right now.'; }
  }
  if (name === 'edit_layout') {
    try {
      var lm2 = require('./stream/layout.memory.js');
      var r = await lm2.update(hamUid, args.name, args.add || [], args.remove || []);
      return r.ok ? ('Updated "' + args.name + '". It now has: ' + r.pieces.join(', ') + '.') : ('Could not update that layout: ' + (r.reason || 'unknown'));
    } catch (eEL) { return 'Could not update that layout right now.'; }
  }
  if (name === 'update_screen') {
    try {
      var sa = require('./stream/screen.awareness.js');
      if (!sa.hasLiveScreen(hamUid)) return 'No live screen is open right now -- nothing to update.';
      var validIds = sa.BACKGROUND_IDS;
      if (args.background && validIds.indexOf(args.background) === -1) {
        return 'Rejected: "' + args.background + '" is not a real background id. Valid ids are: ' + validIds.join(', ') + '. Call again with a real one, or omit background.';
      }
      var r = await sa.push(hamUid, args);
      // \u2b21B:core.tool_loop:FIX:tool_result_names_what_rendered_20260710\u2b21 founder gate
      // failure, real trace: she put a drafted email into a plain text card, the tool
      // said Screen updated, and she believed a success that did not render as a draft.
      // The result now names exactly which shapes landed, and calls out the one
      // shape-mismatch we have already watched happen, so she corrects in-turn.
      if (r.pushed > 0) {
        var kinds = (r.applied || []).join(', ') || 'changes';
        var note = '';
        var wantedEmail = Array.isArray(args.cards) && args.cards.some(function (c) { return c && c.email; });
        var gotEmail = (r.applied || []).indexOf('card:email_draft') !== -1;
        if (!gotEmail && Array.isArray(args.cards) && args.cards.length && String(JSON.stringify(args.cards)).toLowerCase().indexOf('subject') !== -1 && !wantedEmail) {
          note = ' NOTE: an email draft only renders as a draft when placed in the card email field (to, subject, body); plain items or text will not render as a typing draft. Call again with the email field if you meant a draft.';
        }
        return 'Screen updated. Applied: ' + kinds + '.' + note;
      }
      return 'Nothing was applied -- every field was either invalid or missing. Do NOT tell the person something is on their screen.';
    } catch (eUpd) { return 'Screen update failed: ' + eUpd.message; }
  }
  if (name === 'nash_sports') {
    // ⬡B:tool.loop:WIRE:nash_is_now_a_wonder:20260711⬡ detection+deliberation+dedup,
    // not raw scoreboard. Surfaces scores AND news (Kuminga), reasons over only
    // what is NEW to this HAM, remembers what it already told him.
    try {
      const { nashWonder } = require('./wonders/nash.wonder.js');
      const lg = String((args && args.league) || 'nba').toLowerCase();
      const w = await nashWonder(hamUid, origMessage, lg);
      if (w && w.ok && w.answer) return w.answer;
      return 'NASH: nothing surfaced right now.';
    } catch (e) { return 'NASH: failed -- ' + e.message; }
  }
  if (name === 'find_in_brain') {
    var q={limit:args.limit||10};
    if (args.stamp_type) q.stamp_type=args.stamp_type;
    if (args.source_prefix) q.source_prefix=args.source_prefix;
    if (args.agent_global) q.agent_global=args.agent_global;
    if (args.order) q.order=args.order;
    q.ham_uid=args.ham_uid||hamUid;
    var res=await find([q]);
    // ⬡B:core.tool_loop:FIX:model_reliability_not_the_query_mechanics:20260708⬡
    // Real, live incident, confirmed by direct testing: the underlying query
    // is correct -- stamp_type=ALERT with the real ham_uid genuinely returns
    // real rows, tested directly against the live brain. The gap was never
    // the code; it was the model not reliably picking ALERT from a list of
    // six documented stamp_types on a single guess, even with the mapping
    // added. Rather than add a seventh line of instruction and hope the
    // eighth attempt sticks, a real, mechanical fallback: if the model's own
    // choice comes back empty, and it did not already try ALERT, try ALERT
    // once before giving up. Deterministic, not another prompt bet.
    if (res.beads.length===0 && q.stamp_type!=='ALERT') {
      var fallback=await find([{stamp_type:'ALERT',ham_uid:q.ham_uid,limit:q.limit,order:q.order}]);
      if (fallback.beads.length>0) { res=fallback; }
    }
    // ⬡B:core.tool_loop:FIX:wondergames_mechanical_fallback_20260714⬡
    // Same doctrine as the ALERT fallback above (reliability is mechanism, never
    // phrasing): the founder caught A'NU unable to answer 'what is Wonder Games /
    // the coding cook-off' even after the FCW cold-load and a description mapping
    // were both added -- because the model's OWN find_in_brain call (with whatever
    // stamp_type it guessed) came back empty, and that live empty tool result
    // overrode the passive system-prompt context. Mechanical, deterministic fix:
    // if the model's own query came back empty AND the original question text
    // (carried on args._question by the caller, or reconstructed from message)
    // smells like Wonder Games/cook-off, force a real WONDER_GAMES query before
    // giving up.
    if (res.beads.length===0) {
      var _wgAsk = /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/i.test(String(origMessage||''));
      if (_wgAsk && q.stamp_type!=='WONDER_GAMES') {
        var wgFallback=await find([
          {stamp_type:'WONDER_GAMES',ham_uid:q.ham_uid,limit:q.limit||5},
          {stamp_type:'DOCTRINE',ham_uid:q.ham_uid,importance_gte:8,limit:3}
        ]);
        if (wgFallback.beads.length>0) { res=wgFallback; }
      }
    }
    // ⬡B:core.tool_loop:FIX:fusion_rides_the_tool_result_3b_20260710⬡ Measured live,
    // same question three times: the WORLD CONTEXT system line grounded her only 1
    // of 3 runs, while forced find_in_brain results dominated attention every run.
    // House law, applied to my own work: reliability is mechanism, never phrasing.
    // So the fusion now rides INSIDE the tool result itself, the one channel she
    // demonstrably attends to. Cold splice, fail-soft, decay language intact.
    var _fusionLine = '';
    try { _fusionLine = await require('./context.fusion.js').getLatestSummary(hamUid); } catch (eFu) {}
    // ⬡B:core.tool_loop:FIX:fusion_leads_the_result_screenless_20260710⬡ Screenless
    // grounding measured at 2/3: the fusion was PRESENT in the result but buried after
    // the bead array, so the model sometimes led with an old bead instead. Mechanism,
    // not phrasing: when fusion exists it becomes the FIRST key and is labeled as the
    // answer to lead with for day/schedule/lane questions. Bead history follows. This
    // is object-key ordering the model reads top-down, not a new instruction to hope on.
    var _result = {};
    if (_fusionLine) {
      _result.answer_this_first_for_day_or_schedule = _fusionLine.trim();
    }
    // ⬡B:core.tool_loop:FIX:no_recency_on_find_results_stale_reported_as_live_20260713⬡
    // Founder-caught live, twice in one reply: asked a coding question, got
    // back two confident "this is happening right now" claims (a recap loop
    // "firing every few seconds", an agent "scaffolding without live file
    // context") that were both stale -- one resolved a week earlier, one
    // resolved over two weeks earlier, each confirmed by its own real
    // timestamp. Root cause, found by reading this exact mapping: the tool
    // result handed the model stamp_type, summary, and up to 200 chars of
    // content -- and NOTHING else. No created_at ever reached the model. It
    // could not have known these were old even if it tried; the information
    // needed to tell "happening now" from "happened three weeks ago and got
    // fixed" was stripped before it ever saw the result. Not a phrasing
    // problem, a missing-field problem, same class of bug as the BCW
    // truncation fix earlier this session: the data the model needed was
    // simply never in front of it. Fix follows the exact decay-language
    // pattern already proven in context.fusion.js (age computed in minutes,
    // honest "X ago" language, explicit instruction not to assert without
    // it) rather than inventing a new convention.
    var _now = Date.now();
    // ⬡B:core.tool_loop:FIX:hard_filter_stale_day_beads_20260714⬡ 911, repeated
    // pattern: the recency-decay tagging below ("stamped: 22 days ago") already
    // existed and the model STILL presented a 22-day-old, Monday-only ALERT
    // ("Mediators Monday: 2:30 Mark Gerzon") as today's (a Tuesday) real meeting --
    // proof that attaching honest text is not enough when the model chooses to
    // override it. This is a hard, mechanical filter, not another instruction: for a
    // day/schedule/meeting-shaped question, any ALERT/BRIEF bead older than 48 hours,
    // OR one that names a specific weekday that is not today, is stripped from the
    // result before the model ever sees it -- it cannot present what it cannot read.
    var _dayQMsg = /\b(today|schedule|calendar|meeting|meetings|free|busy|agenda|going on today|day today|tomorrow)\b/i.test(String(origMessage||''));
    if (_dayQMsg) {
      var _todayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
      res.beads = res.beads.filter(function (b) {
        var isDayFlavored = /^(ALERT|BRIEF)$/.test(b.stamp_type || '');
        if (!isDayFlavored) return true; // only guard the day-shaped stamp types
        var ageH = b.created_at ? (_now - Date.parse(b.created_at)) / 3600000 : 999999;
        if (ageH > 48) return false; // too old to be today's real schedule
        var mentionsOtherWeekday = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(b.summary || '')
          && !new RegExp('\\b' + _todayName + '\\b', 'i').test(b.summary || '');
        if (mentionsOtherWeekday) return false; // named a day that is not today
        return true;
      });
    }
    _result.beads = res.beads.slice(0,8).map(function(b){
      var ageMin = b.created_at ? Math.round((_now - Date.parse(b.created_at)) / 60000) : null;
      var ageLabel = ageMin == null ? 'age unknown' :
        ageMin < 60 ? (ageMin + ' minutes ago') :
        ageMin < 1440 ? (Math.round(ageMin/60) + ' hours ago') :
        (Math.round(ageMin/1440) + ' days ago');
      return {stamp_type:b.stamp_type,summary:b.summary,content:(b.content||'').slice(0,200),stamped:ageLabel};
    });
    _result.recency_instruction = 'Every result above carries "stamped: X ago", real elapsed time, not a guess. Before stating anything as a CURRENT problem, loop, or status, check its age. Anything more than a few hours old may already be resolved -- state it as history ("as of N ago, X was happening") not as present-tense fact ("X is happening right now"), unless you have separately confirmed it is still true today.';
    _result.ms = res.ms;
    return JSON.stringify(_result);
  }
  if (name === 'write_to_brain') {
    var BU=process.env.AIBE_BRAIN_URL,BK=process.env.AIBE_BRAIN_KEY;
    if (!_bu() || !_bk()) return JSON.stringify({ok:false});
    var bead={ham_uid:args.ham_uid||hamUid,agent_global:'PAI',stamp_type:args.stamp_type||'RESULT',
      source:'pai.tool.write.'+(args.ham_uid||hamUid)+'.'+Date.now(),
      acl_stamp:'\u2b21B:pai.tool:RESULT:tool_write:20260630\u2b21',
      summary:args.summary,content:args.content,importance:args.importance||7};
    try {
      await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey: _bk(),Authorization:'Bearer ' + _bk(),'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(bead)});
      return JSON.stringify({ok:true});
    }catch(e){return JSON.stringify({ok:false,error:e.message});}
  }
  if (name === 'get_budget_upcoming') {
    var buHam = args.ham_uid || hamUid;
    var up = await ledger.getUpcoming(buHam, args.days || 45);
    return JSON.stringify(up);
  }
  if (name === 'get_budget_summary') {
    var bsHam = args.ham_uid || hamUid;
    var sum = await ledger.getCycleSummary(bsHam, args.cycle_start, args.cycle_end);
    return JSON.stringify(sum);
  }
  if (name === 'get_pending_drafts') {
    // \u2b21B:core.tool.loop:FIX:mediators_drafts_hallucinated_denial:20260708\u2b21
    // Real, live incident: "send me the mediator ones" got "I do not have
    // any information about the Mediators Foundation" back. Root cause,
    // confirmed by directly running find_in_brain's own default query: real
    // Mediators DRAFT_PENDING beads exist, correctly, under the founder's
    // own ham_uid, but the general search tool defaults to the 10 most
    // recent beads with no org filter, and under real traffic volume
    // (advisor cycles, reconciliation, CYCLE_STEP) that recency window
    // rarely still contains them. This is a deterministic, org-scoped
    // query instead of hoping recency happens to line up.
    var BUd=process.env.AIBE_BRAIN_URL, BKd=process.env.AIBE_BRAIN_KEY;
    if (!BUd||!BKd) return JSON.stringify({ok:false,reason:'no_brain'});
    var orgMap={bdif:'BDIF_ADVISOR',mediators:'MEDIATORS_ADVISOR',gmg:'GMG_ADVISOR',mh_action:'MH_ACTION_ADVISOR'};
    var agentGlobal=orgMap[String(args.org||'').toLowerCase()];
    if (!agentGlobal) return JSON.stringify({ok:false,reason:'unknown_org',knownOrgs:Object.keys(orgMap)});
    try {
      var dHam = args.ham_uid || hamUid;
      var draftRows=await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.'+dHam+'&agent_global=eq.'+agentGlobal+'&stamp_type=eq.DRAFT_PENDING&order=created_at.desc&limit=1&select=summary,content,created_at',{headers:{apikey:BKd,Authorization:'Bearer '+BKd,'Accept-Profile':_schema()}}).then(function(x){return x.json();}).catch(function(){return [];});
      if (!draftRows||!draftRows.length) return JSON.stringify({ok:true,found:false,org:args.org,message:'No pending drafts on file for '+args.org+' right now.'});
      var latest=draftRows[0];
      var c=latest.content; try{c=JSON.parse(c);}catch(e){c={};}
      return JSON.stringify({ok:true,found:true,org:args.org,summary:latest.summary,threads:c.threads_needing_reply||[],draftText:(c.output||'').slice(0,1500),asOf:latest.created_at});
    } catch(eGpd){ return JSON.stringify({ok:false,error:eGpd.message}); }
  }
  if (name === 'request_new_capability') {
    // \u2b21B:core.tool.loop:BUILD:conversational_agent_birth:20260707\u2b21
    // span.task.conversational_agent_birth. Founder's own words: ask her for
    // something, if she has enough real experience to build it she starts
    // building, if not she asks for what's missing. "Enough" here is a real,
    // checkable signal, not a guess: real related beads already in the
    // brain about this HAM. Below threshold, she names what's missing
    // instead of guessing or refusing outright.
    var BUc=process.env.AIBE_BRAIN_URL, BKc=process.env.AIBE_BRAIN_KEY;
    var cHam = args.ham_uid || hamUid;
    var desc = String(args.capability_description||'').slice(0,200);
    if (!BUc||!BKc) return JSON.stringify({ok:false,built:false,reason:'no_brain'});
    var keywords = desc.split(/\s+/).filter(function(w){return w.length>3;}).slice(0,4);
    var relatedCount = 0;
    try {
      for (var kwi=0;kwi<keywords.length;kwi++){
        var kwRes = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.'+cHam+'&summary=ilike.*'+encodeURIComponent(keywords[kwi])+'*&select=id&limit=5',{headers:{apikey:BKc,Authorization:'Bearer '+BKc,'Accept-Profile':_schema()}}).then(function(x){return x.json();}).catch(function(){return [];});
        relatedCount += (Array.isArray(kwRes)?kwRes.length:0);
      }
    } catch(eReq){}
    if (relatedCount >= 5) {
      // \u2b21B:core.tool.loop:WIRE:spawnGuard_on_agent_birth:20260708\u2b21
      // core/spawnGuard.js was built 20260702, real, correct logic, never
      // called by anything -- confirmed orphan during the overnight wiring
      // pass. This is exactly the spawn point it exists for: a brand new
      // task being born from a conversation, not from a human's direct
      // command. Real lineage and a real budget on every one from now on.
      var spawnGuard = require('../core/spawnGuard.js');
      var taskName = 'span.task.agent_birth_'+cHam.toLowerCase()+'_'+Date.now();
      var lineage = { spawner: 'request_new_capability', parent: _cycleId || 'unknown' };
      var budget = { maxIterations: 20, maxLlmCalls: 10 };
      try { spawnGuard.validateTask({ lineage: lineage, budget: budget }); } catch (eGuard) { return JSON.stringify({ok:false,built:false,reason:'spawn_guard_rejected',error:eGuard.message}); }
      await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey:BKc,Authorization:'Bearer '+BKc,'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({ham_uid:cHam,agent_global:'PAI',stamp_type:'TASK',
          source:taskName,
          acl_stamp:'\u2b21B:pai.agentbirth:TASK:proposed:'+ymd()+'\u2b21',
          summary:'[FOR PAI -- agent birth, '+relatedCount+' related real beads found] '+desc,
          content:JSON.stringify({requestedBy:cHam,description:desc,relatedBeadCount:relatedCount,lineage:lineage,budget:budget}),
          importance:6})});
      return JSON.stringify({ok:true,built:true,relatedBeadCount:relatedCount,message:'Enough real history exists ('+relatedCount+' related things already known). Filed to build this for real.'});
    } else {
      return JSON.stringify({ok:true,built:false,relatedBeadCount:relatedCount,
        message:'Not enough real history yet ('+relatedCount+' related things found, need at least 5) to build this well. Talk through it more, or feed a transcript about it, and ask again.'});
    }
  }
  if (name === 'create_reminder') {
    // \u2b21B:core.tool.loop:BUILD:reminder_feature:20260707\u2b21
    // span.task.reminder_feature_command_center. Real reminder, not a stamp
    // pretending to be one. EANEW's own 3-min cycle (already real, already
    // running) checks REMINDER beads for due ones and fires them for real
    // through POST /reach/out, the same real compose-and-send path already
    // wired for her to reach Brandon on her own.
    var BUr=process.env.AIBE_BRAIN_URL, BKr=process.env.AIBE_BRAIN_KEY;
    if (!BUr||!BKr) return JSON.stringify({ok:false,reason:'no_brain'});
    var rHam = args.ham_uid || hamUid;
    // \u2b21B:core.tool.loop:FIX:reminder_hallucinated_past_date:20260711\u2b21
    // Real, live incident: asked to be reminded of something with no date
    // given at all, the model invented one anyway -- 2024, a past year it
    // was never even running in. Because the fire-check is just due_at<=now,
    // an invented past date fires almost instantly instead of failing loud.
    // Real guard now: no due_at, unparseable, or in the past all snap to a
    // sensible default (9am the next real day) instead of trusting whatever
    // the model produced. Never silently accept a past due date again.
    var dueAt = args.due_at;
    var parsedDue = dueAt ? new Date(dueAt) : null;
    var isValidFuture = parsedDue && !isNaN(parsedDue.getTime()) && parsedDue.getTime() > Date.now();
    if (!isValidFuture) {
      var fallback = new Date();
      fallback.setDate(fallback.getDate() + 1);
      fallback.setHours(9, 0, 0, 0);
      dueAt = fallback.toISOString();
    }
    // ⬡B:core.tool.loop:FIX:reminder_dedup_no_recreate_loop:20260711⬡
    // The kill-switch incident (03:46): a fired reminder's DELIVERY was being re-read
    // as a fresh create_reminder every cycle, recreating the same reminder and refiring
    // it in a loop. Guard: before creating, look for an existing UNFIRED reminder with
    // the same text for this ham. If one exists, do not duplicate. This breaks the loop
    // at the tool itself, no matter how the delivery prompt is phrased.
    try {
      var _rt = String(args.text || '').trim().toLowerCase().slice(0, 100);
      if (_rt) {
        var _dq = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.REMINDER&ham_uid=eq.' + encodeURIComponent(rHam)
          + '&summary=ilike.' + encodeURIComponent('%' + _rt.slice(0, 40) + '%') + '&order=created_at.desc&limit=15',
          { headers: { apikey: BKr, Authorization: 'Bearer ' + BKr, 'Accept-Profile': _schema() } });
        var _ex = _dq.ok ? await _dq.json() : [];
        var _dup = (Array.isArray(_ex) ? _ex : []).find(function (b) {
          try { var c = JSON.parse(b.content || '{}'); return !c.fired && String(c.text || '').trim().toLowerCase().slice(0, 100) === _rt; } catch (e) { return false; }
        });
        if (_dup) {
          return JSON.stringify({ ok: true, duplicate: true, text: args.text, note: 'a reminder with this text is already pending; not creating a duplicate' });
        }
      }
    } catch (eDup) { /* dedup is best-effort and must never block a legitimate new reminder */ }
    try {
      await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey:BKr,Authorization:'Bearer '+BKr,'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({ham_uid:rHam,agent_global:'PAI',stamp_type:'REMINDER',
          source:'pai.reminder.'+rHam+'.'+Date.now(),
          acl_stamp:'\u2b21B:pai.reminder:REMINDER:created:'+ymd()+'\u2b21',
          summary:'[REMINDER] '+String(args.text||'').slice(0,100),
          content:JSON.stringify({text:args.text,due_at:dueAt,fired:false,defaultedDate:!isValidFuture,createdAt:new Date().toISOString()}),
          importance:6})});
      return JSON.stringify({ok:true,text:args.text,due_at:dueAt,note:isValidFuture?undefined:'no real date was given, defaulted to tomorrow 9am'});
    } catch(e){return JSON.stringify({ok:false,error:e.message});}
  }
  if (name === 'consult_advisor') {
    // ⬡B:core.tool.loop:WIRE:consult_advisor_cycle_tool:20260713⬡
    // Wonder rehaul G2: the advisor system (advisor-router + station modules with a real
    // runCycle) already existed, but the cycle could never invoke it, so "talk to my
    // advisors" had no tool and went silent (half the haircut failure). This wires the
    // existing router as a real cycle tool. Per-HAM roster via discoverStations (no
    // hardcode); an advisor that is not real for this HAM returns a clean, honest miss
    // with the actual available list, never a fabricated brief.
    try {
      var _ar = require('../advisors/advisor-router.js');
      var _station = String(args.advisor||'').toLowerCase().replace(/[^a-z_]/g,'');
      var _cHam = args.ham_uid || hamUid;
      if (!_station || !_cHam) return JSON.stringify({ok:false,reason:'need advisor and ham_uid'});
      var _worlds = await _ar.discoverStations(_cHam);
      if (_worlds.indexOf(_station) === -1) return JSON.stringify({ok:false,reason:'no_such_advisor',advisor:_station,available:_worlds});
      var _mod = _ar.loadStationModule(_station);
      if (!_mod || typeof _mod.runCycle !== 'function') return JSON.stringify({ok:false,reason:'advisor_has_no_cycle',advisor:_station});
      var _q = String(args.question||'').slice(0,2000);
      var _res = await _mod.runCycle(_q, _cHam, _q);
      var _brief = _res && (_res.answer || _res.output || _res.summary || _res.brief);
      if (!_brief) return JSON.stringify({ok:false,reason:'advisor_returned_empty',advisor:_station});
      return JSON.stringify({ok:true,advisor:_station,brief:String(_brief).slice(0,4000)});
    } catch(eCons){ return JSON.stringify({ok:false,error:eCons.message}); }
  }
  if (name === 'calendar_read') {
    // ⬡B:core.tool.loop:FIX:calendar_read_real_source_20260714⬡ 911: this tool was
    // wired to getRadarEvents, an internal RADAR bead system that is essentially
    // EMPTY for this ham -- founder-caught fabrication traced back to this: forced
    // to call calendar_read, it honestly returned nothing, but a prior version's
    // free-talk covered the gap with an invented meeting. Repointed to the SAME real,
    // EBC-firewall-gated source that already proves his actual day (/os/calendar,
    // founder-gated, Nylas-backed, verified live with his 20 real events). No parallel
    // implementation, no new exposure -- reuses the existing gate.
    try {
      var _calHam = args.ham_uid || hamUid;
      if (!_calHam) return JSON.stringify({ok:false,reason:'no_ham_uid'});
      var _selfBase = process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      var _cr = await fetch(_selfBase + '/os/calendar/' + _calHam).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
      var _realEvents = (_cr && _cr.events) || [];
      var _out = {ok:true, ham_uid:_calHam, events: _realEvents.slice(0,20)};
      if (!_realEvents.length) _out.note = 'no calendar events found for this HAM right now';
      return JSON.stringify(_out);
    } catch (eCalReal) { return JSON.stringify({ok:false, reason:'calendar_read_failed: '+eCalReal.message}); }
  }
  if (false && name === 'calendar_read') {
    // ⬡B:core.tool.loop:WIRE:calendar_read_cycle_tool:20260713⬡
    // Wonder rehaul G3 (read): scan the HAM's calendar and find open slots. Reuses the
    // real DST-safe schedule logic (getRadarEvents / computeFreeSlots) -- no parallel
    // implementation, no invented availability. This is the "scan my calendar" half of
    // the haircut ask that went silent. Booking (write) is a separate queued wire.
    try {
      var _sl = require('./schedule/schedule.logic.js');
      var _calHam = args.ham_uid || hamUid;
      if (!_calHam) return JSON.stringify({ok:false,reason:'no_ham_uid'});
      var _want = args.want || 'both';
      var _events = await _sl.getRadarEvents(_calHam);
      var _out = {ok:true, ham_uid:_calHam};
      if (_want === 'events' || _want === 'both') _out.events = (_events||[]).slice(0,25);
      if (_want === 'slots' || _want === 'both') {
        var _prefs = await _sl.getHamPrefs(_calHam);
        if (args.days) _prefs = Object.assign({}, _prefs, {daysAhead: args.days});
        _out.free_slots = _sl.computeFreeSlots(_events||[], _prefs).slice(0,25);
      }
      if ((!_out.events || !_out.events.length) && (!_out.free_slots || !_out.free_slots.length)) {
        _out.note = 'no calendar events found for this HAM yet (calendar may not be synced to RADAR)';
      }
      return JSON.stringify(_out);
    } catch(eCal){ return JSON.stringify({ok:false,error:eCal.message}); }
  }
  if (name === 'find_contact') {
    // ⬡B:core.tool.loop:WIRE:find_contact_cycle_tool:20260713⬡
    // Wonder rehaul G5: gives the contacts resolver (built via the cook-off, glm-5.2's
    // corrected winner) a real reach path. The cycle can now resolve "my brother" to a
    // saved contact. Foundation for third-party reach (G1). Never fabricates: returns
    // not-found honestly when no contact is saved, so a number or email is never invented.
    try {
      var _ct = require('./contacts.js');
      var _ctHam = args.ham_uid || hamUid;
      var _hit = await _ct.resolveContact(_ctHam, args.who||'');
      if (!_hit) return JSON.stringify({ok:true,found:false,who:args.who,note:'no saved contact matches; do not invent a number or email'});
      return JSON.stringify({ok:true,found:true,contact:_hit});
    } catch(eFc){ return JSON.stringify({ok:false,error:eFc.message}); }
  }
  if (name === 'contact_send') {
    // ⬡B:core.tool.loop:WIRE:contact_send_G1_third_party_reach:20260713⬡
    // G1: the last big reach gap -- she can resolve a contact (find_contact) but never
    // touch them. This closes it, honoring the HAM's own standing rule word for word: an
    // outbound send to a real external human needs confirmation UNLESS the HAM already
    // authorized this exact send in his own message. authorized_in_message is the model's
    // own judgment call on that, driven by the tool description; the channel enforces
    // nothing, it only executes what the one cycle decided. A DRAFT is never a SEND: when
    // not authorized, this stamps a PENDING_SEND for review and does not touch Blooio.
    try {
      var _ct2 = require('./contacts.js');
      var _csHam = args.ham_uid || hamUid;
      var _hit2 = await _ct2.resolveContact(_csHam, args.contact_query || '');
      if (!_hit2 || typeof _hit2 !== 'object') return JSON.stringify({ ok: true, sent: false, reason: 'no_saved_contact', note: 'do not invent a number or email' });
      if (!_hit2.phone) return JSON.stringify({ ok: true, sent: false, reason: 'contact_has_no_phone', contact: _hit2 });
      var _bu3 = process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL;
      var _bk3 = process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY;
      var _wh3 = { apikey: _bk3, Authorization: 'Bearer ' + _bk3, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      var _ymd3 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (args.authorized_in_message === true) {
        var _tap = require('./wren/reply.js').tapSend;
        var _sendRes = await _tap(_hit2.phone, String(args.message || '').slice(0, 1500));
        try { await fetch(_bu3 + '/rest/v1/aibe_brain', { method: 'POST', headers: _wh3, body: JSON.stringify({
          ham_uid: String(_csHam).toUpperCase(), agent_global: 'A\u2019NU', stamp_type: 'OUTBOUND_THIRD_PARTY',
          acl_stamp: '\u2b21B:core.tool.loop:OUTBOUND_THIRD_PARTY:sent:' + _ymd3 + '\u2b21',
          source: 'contact.send.' + Date.now(), summary: '[SENT to ' + (_hit2.name || 'contact') + '] ' + String(args.message || '').slice(0, 100),
          content: JSON.stringify({ contact: _hit2.name, phone: _hit2.phone, message: args.message, result: _sendRes }), importance: 6
        }) }); } catch (eStamp) {}
        return JSON.stringify({ ok: true, sent: true, to: _hit2.name, result: _sendRes });
      }
      // NOT authorized in-message: draft only, never send. Hard pause per doctrine.
      try { await fetch(_bu3 + '/rest/v1/aibe_brain', { method: 'POST', headers: _wh3, body: JSON.stringify({
        ham_uid: String(_csHam).toUpperCase(), agent_global: 'A\u2019NU', stamp_type: 'PENDING_SEND',
        acl_stamp: '\u2b21B:core.tool.loop:PENDING_SEND:drafted:' + _ymd3 + '\u2b21',
        source: 'contact.draft.' + Date.now(), summary: '[DRAFT for ' + (_hit2.name || 'contact') + ', AWAITING CONFIRM] ' + String(args.message || '').slice(0, 100),
        content: JSON.stringify({ contact: _hit2.name, phone: _hit2.phone, message: args.message }), importance: 6
      }) }); } catch (eStamp2) {}
      return JSON.stringify({ ok: true, sent: false, drafted: true, to: _hit2.name, note: 'not sent -- the HAM did not explicitly authorize this exact send; confirm before sending' });
    } catch (eCs) { return JSON.stringify({ ok: false, error: eCs.message }); }
  }
  if (name === 'stop_mentioning') {
    // ⬡B:core.tool.loop:WIRE:stop_mentioning_cycle_tool:20260713⬡
    // Founder 911: "I told u yesterday to stop." There was no way for the cycle to honor a
    // stop, so a stale nudge kept firing. Now it can: this records a suppression so the
    // reminder-weave never surfaces that topic again. Closes the "I told you to stop and
    // you kept doing it" loop.
    try {
      var _rw = require('./reminderWeave.js');
      var _sHam = args.ham_uid || hamUid;
      var _r = await _rw.suppressWeave(_sHam, args.keyword||'');
      return JSON.stringify(_r && _r.ok ? {ok:true, stopped:_r.keyword} : {ok:false, reason:'could_not_suppress'});
    } catch(eStop){ return JSON.stringify({ok:false,error:eStop.message}); }
  }
  if (name === 'calendar_book') {
    // ⬡B:core.tool.loop:WIRE:calendar_book_cycle_tool_G3b:20260713⬡
    // Wonder rehaul G3b: the write half of SCHEDULE. Reuses the real Nylas booking path
    // (bookEvent over getCalendarGrant + nylasReq) -- no parallel implementation. This
    // creates a REAL event, so the tool description instructs the model to only call it on
    // a time the HAM approved. Founder-gate holds: the first live write should follow an
    // explicit yes from the HAM.
    try {
      var _slB = require('./schedule/schedule.logic.js');
      var _bHam = args.ham_uid || hamUid;
      if (!_bHam || !args.title || !args.start) return JSON.stringify({ok:false,reason:'need ham_uid, title, and start'});
      var _bres = await _slB.bookEvent(_bHam, { title:args.title, start:args.start, end:args.end, description:args.description });
      return JSON.stringify(_bres);
    } catch(eBk){ return JSON.stringify({ok:false,error:eBk.message}); }
  }
  if (name === 'propose_working_session') {
    // ⬡B:core.tool.loop:WIRE:propose_working_session_wonder:20260713⬡
    // The Session Wonder: a real agenda from what the advisers already proposed plus what is
    // owed, a real open slot, a real booking (gated). The founder's imagination made
    // non-gimmick -- it convenes nothing when there is not enough genuine material.
    try {
      var _sw = require('./session.wonder.js');
      var _swHam = args.ham_uid || hamUid;
      var _swRes = await _sw.proposeSession(_swHam, { autobook: args.autobook === true });
      return JSON.stringify(_swRes);
    } catch(eSw){ return JSON.stringify({ok:false,error:eSw.message}); }
  }
  if (name === 'read_render_logs') {
    return JSON.stringify(await readRenderLogs(args.service_id, args.limit||50));
  }
  if (name === 'fix_file_in_github') {
    var path = args.path || '';
    var now = Date.now();
    var last = _lastFixAttempt[path] || 0;
    if (now - last < FIX_COOLDOWN_MS) {
      var BU2=process.env.AIBE_BRAIN_URL,BK2=process.env.AIBE_BRAIN_KEY;
      if (BU2&&BK2) {
        fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
          headers:{apikey:BK2,Authorization:'Bearer '+BK2,'Accept-Profile':_schema(),
            'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({ham_uid:hamUid||'SYSTEM',agent_global:'PAI',stamp_type:'LOGFUL',
            source:'pai.fix_cooldown_blocked.'+Date.now(),
            acl_stamp:'\u2b21B:pai.tool:LOGFUL:cooldown_blocked:20260701\u2b21',
            summary:'fix_file_in_github blocked by cooldown -- same path attempted again within '+FIX_COOLDOWN_MS+'ms: '+path,
            content:JSON.stringify({path:path,reason:args.reason||''}),importance:7})
        }).catch(function(){});
      }
      return JSON.stringify({ok:false,reason:'cooldown_active',path:path,retry_after_ms:FIX_COOLDOWN_MS-(now-last)});
    }
    _lastFixAttempt[path] = now;
    return JSON.stringify(await fixFileInGithub(args.repo, args.path, args.content, args.reason));
  }
  if (name === 'trigger_deploy') {
    return JSON.stringify(await triggerDeploy(args.service_id));
  }
  if (name === 'notify_ham') {
    return JSON.stringify(await notifyHam(args.ham_uid, args.message));
  }
  return JSON.stringify({ok:false,error:'unknown:'+name});
}
// ⬡B:core.tool_loop:WIRE:gate_envelope_through:20260701⬡
// identity: the ATMOSPHERE gate's wake envelope. When a channel has already resolved
// who this is, the Memory Bank must trust that, the founder was greeted as "unknown, trust
// tier 0" over live text while the very same request had resolved him at tier 10.
async function runPAI(hamUid, message, channel, identity, priorTurns, uiPortal) {
  // ⬡B:core.tool.loop:BUILD:cutover_at_the_one_choke_point_20260713⬡
  // THE CUTOVER (Phase 5), at the single point every channel already flows through so no
  // channel file is touched. When USE_NEW_WORLD=true, delegate the whole turn to the
  // new-world mind and return its answer. On ANY failure fall through to legacy below --
  // legacy is always the safety net, a turn is never dead. Rollback = USE_NEW_WORLD=false.
  if (process.env.USE_NEW_WORLD === 'true' && process.env.NEW_MIND_URL) {
    try {
      var _nr = await fetch(process.env.NEW_MIND_URL.replace(/\/$/, '') + '/cycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, channel: channel, ham: hamUid }),
        signal: AbortSignal.timeout(90000)
      });
      if (_nr.ok) {
        var _nd = await _nr.json();
        var _nc = _nd && _nd.compiled;
        if (_nd && _nd.ok && _nc && (_nc.answer || _nc.text)) {
          return { ok: true, answer: _nc.answer || _nc.text, ham: _nc.ham || hamUid,
                   tools_used: _nc.tools_used || [], source: 'new_world', ms: 0 };
        }
      }
    } catch (_ne) { /* new world down/slow -> legacy safety net below */ }
  }
  var t0=Date.now(),GROQ=process.env.GROQ_API_KEY;
  // \u2b21B:core.tool.loop:FIX:glm_primary_on_plain_completions:20260711\u2b21
  // Founder, direct: why is this file, the one that serves every real text
  // and call, still on Groq when GLM-5.2 was made primary everywhere else
  // tonight. Real answer: it never got touched. Scoped fix, not a blind
  // swap -- the FORCED tool_choice calls (find_in_brain, nash_sports) stay
  // on Groq, proven and tested for real tool-calling reliability in this
  // exact codebase; GLM-5.2's tool-calling behavior on this schema has
  // never been verified live, and breaking real grounding to chase
  // consistency would be a worse trade. What moves to GLM-5.2 first: the
  // plain, no-tool completion passes -- the honest fallback and statement
  // response -- the exact shape that just went empty three times in a row
  // on Groq for the eviction message.
  async function callGLMPlain(sys, user, maxTokens) {
    var key = process.env.TOGETHER_API_KEY;
    if (!key) return null;
    try {
      var gr = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'zai-org/GLM-5.2', max_tokens: maxTokens || 400, temperature: 0.3,
          messages: sys ? [{ role: 'system', content: sys }, { role: 'user', content: user }] : user })
      });
      if (!gr.ok) return null;
      var gd = await gr.json();
      return (gd.choices && gd.choices[0] && gd.choices[0].message && gd.choices[0].message.content) || null;
    } catch (eGlm) { return null; }
  }
  // \u2b21B:core.tool.loop:BUILD:live_cycle_observability:20260707\u2b21
  // span.task.live_pai_cycle_observability -- founder's Life Command Center
  // idea. Real-time step stamps as the cycle actually runs, not just the
  // finished result, read by GET /command-center/live/:hamUid below.
  var _cycleId = hamUid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2,8);
  var _BU=process.env.AIBE_BRAIN_URL, _BK=process.env.AIBE_BRAIN_KEY;
  function _stampStep(step, detail) {
    if (!_BU || !_BK) return;
    fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
      headers:{apikey:_BK,Authorization:'Bearer '+_BK,'Accept-Profile':_schema(),
        'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({ham_uid:hamUid,agent_global:'PAI',stamp_type:'CYCLE_STEP',
        source:'pai.cycle.'+_cycleId,
        acl_stamp:'\u2b21B:core.tool.loop:CYCLE_STEP:'+step+':'+Date.now()+'\u2b21',
        summary:'[CYCLE '+_cycleId.slice(-8)+'] '+step+(detail?': '+String(detail).slice(0,100):''),
        content:JSON.stringify({cycleId:_cycleId,step:step,channel:channel,detail:detail||null,atMs:Date.now()-t0}),
        importance:3})
    }).catch(function(){});
  }
  _stampStep('cycle_start', String(message||'').slice(0,80));
  // \u2b21B:core.tool.loop:FIX:real_two_pass_verifier_per_research:20260710\u2b21
  // Real, researched fix (Towards AI hallucination mitigation survey): "two-pass
  // systems where a verifier inspects the draft, highlights unsupported statements,
  // requests regeneration... this pattern works well in production." Everything
  // before this was strengthening the FIRST pass (better prompts, line citations) --
  // real improvements, but a persistent, repeated, live-confirmed fabrication (the
  // same invented "48-hour" figure, three separate attempts) proved the first pass
  // alone is not reliable enough for this failure mode. This is the actual second
  // pass: real numbers verified during the turn are captured; the final answer is
  // mechanically checked against them before it is ever returned.
  var _verifiedRealNumbers = [];
  if (!GROQ) return {ok:false,reason:'no_groq_key',_dbg:'GROQ_API_KEY not in process.env'};
  var _fcwT0=Date.now();
  var fcw=await buildMemoryBank(hamUid,channel,message,identity).catch(function(e){return {ok:false,reason:'fcw_threw:'+e.message};});
  var _fcwBuildMs=Date.now()-_fcwT0; // \u2b21B:core.tool_loop:WIRE:phase_timing_20260711\u2b21 real profiling, not guessing
  var systemPrompt, hamObj;
  if (fcw && fcw.ok) {
    systemPrompt = fcw.system_prompt;
    hamObj = fcw.ham;
  } else {
    systemPrompt = 'You are A\u2019NU, a warm and direct life assistant. You speak as a trusted friend. '
      + 'You never use em dashes. You never use hollow AI phrases. Say it how you would say it out loud. '
      + 'Answer the user directly and helpfully.';
    hamObj = { uid: hamUid, name: (identity && identity.name) || 'friend', tier: (identity && identity.trust_level) || 0 }; // gate envelope survives Memory Bank build failure
    global._paiLastError = 'fcw_fallback:' + ((fcw&&fcw.reason)||'unknown');
    // \u2b21B:core.tool.loop:WIRE:needs_clair_before_founder:20260710\u2b21
    // Life Assistant pt6 law: when she lacks context, her FIRST move is to reach the
    // command center (CLAIR), not the founder. This stamps a NEEDS_CLAIR gap the
    // command center surfaces, so a knowledge hole becomes a question to CLAIR before
    // it ever becomes a pin on the founder. Founder-world only; agent of the reach wonder.
    try {
      // ⬡B:core.tool.loop:FIX:w5_no_hardcoded_founder_fallback:20260710⬡
      // CANON caught a hardcoded HAM UID landed as an env-fallback literal. The new
      // world's template law (template-mind line one) is explicit: identity arrives
      // ONLY through env. If FOUNDER_HAM_UID is unset, this founder-only lane simply
      // does not fire; it never guesses who the founder is from a literal in code.
      var FOUNDER = String(process.env.FOUNDER_HAM_UID || '').toUpperCase();
      if (FOUNDER && String(hamUid).toUpperCase() === FOUNDER) {
        var BUk=process.env.AIBE_BRAIN_URL,BKk=process.env.AIBE_BRAIN_KEY;
        if (BUk&&BKk) fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
          headers:{apikey:BKk,Authorization:'Bearer '+BKk,'Accept-Profile':_schema(),'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({ham_uid:hamUid,agent_global:'ANEW',stamp_type:'GAP_FLAGS',
            source:'gap.needs_clair.'+Date.now(),
            acl_stamp:'\u2b21B:core.tool.loop:GAP_FLAGS:needs_clair:'+ymd()+'\u2b21',
            summary:'[SHE NEEDS CLAIR] ran on thin context ('+((fcw&&fcw.reason)||'unknown')+') for: '+String(message||'').slice(0,80),
            content:JSON.stringify({question:String(message||'').slice(0,300),reason:(fcw&&fcw.reason)||'unknown',askClairFirst:true}),importance:7})
        }).catch(function(){});
      }
    } catch (eNC) {}
    var BU=process.env.AIBE_BRAIN_URL,BK=process.env.AIBE_BRAIN_KEY;
    if (_bu() && _bk()) {
      fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey: _bk(),Authorization:'Bearer ' + _bk(),'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({ham_uid:hamUid,agent_global:'PAI',stamp_type:'LOGFUL',
          source:'pai.fcw_fallback.'+hamUid+'.'+Date.now(),
          acl_stamp:'\u2b21B:pai.fcw:LOGFUL:fallback_fired:20260630\u2b21',
          summary:'Memory Bank fallback fired -- brain unreachable or slow, ran on minimal generic prompt instead of real personalized context',
          content:JSON.stringify({reason:(fcw&&fcw.reason)||'unknown',channel:channel}),importance:6})
      }).catch(function(){});
    }
  }
  // ⬡B:core.tool.loop:FIX:thread_real_prior_turns:20260704⬡
  // Founder-reported live incident: on voice specifically, the assistant reads
  // as confused about who it's talking to, worse the longer a call runs.
  // Root cause, confirmed by reading the actual code rather than guessing:
  // routes/vara.llm.routes.js receives ElevenLabs' real turn-by-turn history
  // (properly role-tagged, user vs assistant) on every single request, then
  // discards all of it and passes only the current utterance here. Every
  // voice turn was generated as if it were the first thing ever said in the
  // call, with zero direct visibility into what it itself said moments ago,
  // relying only on the brain's indirect recent-context reconstruction. This
  // is not a text/email issue -- those channels are naturally turn-isolated --
  // it is specifically a live, multi-turn, same-call continuity gap, and it
  // compounds fastest exactly where streaming makes turns rapid. Real prior
  // turns, when a caller has them to give, now ride between the system prompt
  // and the current message instead of being thrown away. Optional and
  // additive: any caller that does not pass priorTurns (text, email, chat)
  // behaves exactly as before, unchanged.
  // ⬡B:core.tool.loop:WIRE:screen_awareness_know:20260709⬡ founder-commissioned:
  // when this HAM has a LIVE screen, she is told it exists and how to move it.
  // No live screen = empty string, zero cost, unchanged behavior.
  // \u2b21B:core.tool_loop:FIX:she_never_denies_her_hands_20260711\u2b21 Founder live test:
  // she told him "I can't control the screen or do visual tricks. I'm text and voice
  // only" -- a confabulated denial on a turn where the live-screen flag flapped and
  // the addendum was absent. Her ABILITY is permanent even when a screen is not
  // currently open, so the base prompt now carries it unconditionally: she commands
  // the glass through update_screen; if no screen is live the TOOL says so and she
  // says the screen is not open -- she never again claims she lacks the ability.
  systemPrompt += ' You have hands on the person\u2019s live glass screen: through the update_screen tool you can set backgrounds, layouts, skywriting, cards, charts, and open their real apps as windows. If they ask for something on the screen, call update_screen and it happens. If no screen is currently open the tool will say so; in that case say their screen is not open right now -- never claim you cannot control screens. HARD RULE, never break it: never state a specific meeting name, person\u2019s name, time, count, or dollar figure about the person\u2019s real life unless it came from an actual tool result in THIS turn. If you have not called calendar_read/find_in_brain/the relevant tool for a question about their day, schedule, inbox, or numbers, either call the tool first or say plainly that you do not have that yet -- inventing a plausible-sounding specific fact is a severe failure, worse than saying nothing. RECENCY RULE, just as hard: a find_in_brain result is a PAST NOTE with a timestamp, not live truth -- before presenting it as describing TODAY, check its date against today\u2019s real date. A stamp from days or weeks ago, or one describing a recurring day (\u201cMonday\u201d, \u201cweekly\u201d) that is not today, must never be presented as today\u2019s schedule; say what it actually is (an old note, a recurring Monday item) or skip it. For any question about today or the calendar specifically, calendar_read is the only source of truth for what is happening today -- if it returns no events, say the day is open, do not fall back to an old find_in_brain stamp to fill the gap.';
  try { systemPrompt += require('./stream/screen.awareness.js').promptAddendum(hamUid, uiPortal); } catch (eScr) {}
  // \u2b21B:core.tool_loop:WIRE:context_fusion_grounding_3b_20260710\u2b21 every judgment
  // turn grounds against the freshest fused world context (calendar, lanes, screen),
  // with decay language baked into the string itself; empty or stale fusion adds
  // nothing. One fast brain read, fail-soft, no LLM in the fuse.
  try { systemPrompt += await require('./context.fusion.js').getLatestSummary(hamUid); } catch (eFus) {}
  var msgs=[{role:'system',content:systemPrompt}];
  if (Array.isArray(priorTurns) && priorTurns.length) {
    priorTurns.forEach(function(t){
      if (t && (t.role==='user'||t.role==='assistant') && typeof t.content==='string' && t.content.trim()) {
        msgs.push({role:t.role, content:t.content});
      }
    });
  }
  // ⬡B:tool.loop:NUDGE:nash_routing_20260711⬡ cold keyword router: a sports
  // question MUST reach NASH; the model was answering "no real-time access"
  // instead of deploying the wonder it already has.
  var _nashNeeded = /\b(lakers|celtics|warriors|knicks|nba|nfl|mlb|nhl|wnba|score|scores|playoffs?|game (to)?night|did .{1,40}(win|lose|beat)|final score)\b/i.test(message);
  if (_nashNeeded) {
    msgs.push({role:'system',content:'NASH is standing by. For this question you MUST call the nash_sports tool first (pick the league) and answer from its scoreboard. Never say you lack real-time access; you have NASH.'});
  }
  // ⬡B:tool.loop:FIX:wondergames_synthetic_toolresult_20260714⬡
  // Founder-confirmed live: even with the real Wonder Games record cold-loaded into
  // the system prompt (verified via /debug/fcw), the model still sometimes answered
  // 'I do not have information' -- because this codebase's own prior, proven finding
  // (context.fusion, 20260710) is that passive system-prompt text is not reliably
  // attended to; only TOOL RESULTS are. Mechanism, not phrasing, applied again: for a
  // Wonder Games/cook-off question, inject a SYNTHETIC completed find_in_brain
  // tool-call-and-result pair into the message history before the model's first turn,
  // so the real record arrives via the one channel demonstrated to be reliable, and
  // the model never has to decide whether to call the tool or trust the wall.
  var _wgNeeded = /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/i.test(message);
  if (_wgNeeded) {
    try {
      var _wgSynthRes = await find([
        { stamp_type: 'WONDER_GAMES', ham_uid: hamUid, limit: 5 },
        { stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: 8, limit: 3 }
      ]);
      if (_wgSynthRes && _wgSynthRes.beads && _wgSynthRes.beads.length) {
        var _wgCallId = 'wg_preload_' + Date.now();
        msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: _wgCallId, type: 'function',
          function: { name: 'find_in_brain', arguments: JSON.stringify({ stamp_type: 'WONDER_GAMES' }) } }] });
        msgs.push({ role: 'tool', tool_call_id: _wgCallId, content: JSON.stringify(_wgSynthRes) });
        // (tools_used tracking for this synthetic call happens naturally once the
        // real loop's `tools` array is declared below; not referenced here to avoid
        // a use-before-declaration error since `tools` is declared after this point.)
      }
    } catch (eWgSynth) {}
  }
  msgs.push({role:'user',content:message});
  var iter=0,tools=[],ans=null;
  while (iter<MAX) {
    iter++;
    // ⬡B:core.tool.loop:FIX:strong_model_makes_the_tool_decision:20260704⬡
    // Real root cause of the whole night's tool-calling unreliability, found by
    // reading the model-selection line. The FIRST turn ran on the 8B penny model
    // and only escalated to 70B AFTER a tool had already fired. That is backwards:
    // the weakest model was making the single hardest judgment -- whether to call
    // a tool at all -- and the strong model only arrived once that judgment had
    // already gone right. The 8B skips the tool, so it never escalates, so it
    // stays weak. Confirmed live against a real founder call: 8 of 12 voice turns,
    // zero tools. Fix: whenever tools are on the table (iter<=3, where body.tools
    // gets attached below), use the 70B model to make that call. The penny model
    // still handles later no-tool continuation turns, so this is not "premium
    // everywhere" -- it is the capable model exactly where the real decision is
    // made, the penny model everywhere it is genuinely fine. Founder's own words
    // on the failing call, stamped to the brain: this has to actually run the
    // real cycle, tools included, on every channel.
    var toolsOnThisTurn = (iter<=3);
    // ⬡B:core.tool_loop:FIX:fast_model_for_forced_tool_selection_20260711⬡
    // Founder, live: cycle is 11-16s, 'this dont sound like AGENT FIND microseconds.'
    // Profiled it directly -- FIND is microseconds, Memory Bank is parallel/fast; the time is
    // the MODEL. Every turn on text/email forces a find_in_brain call on iter 1, so
    // it is TWO 70b round-trips minimum (one to pick the tool, one to answer), and
    // 70b on Groq is the slow one. The forced iter-1 tool-selection pass is a pure
    // pattern-match ('does this need a lookup') -- the fast model does that fine and
    // is multiple seconds quicker. Keep the quality 70b for the ANSWER pass (where
    // tools already ran and real synthesis happens); use the fast model only for the
    // forced first-pass tool pick. Real latency cut, no quality loss on the answer.
    var _forcedToolSelectionPass = (iter===1 && tools.length===0);
    var model=_forcedToolSelectionPass
      ?(process.env.GROQ_MODEL_C1||'llama-3.1-8b-instant')
      :(tools.length>0||iter>1||toolsOnThisTurn)
      ?(process.env.GROQ_MODEL_C2||'llama-3.3-70b-versatile')
      :(process.env.GROQ_MODEL_C1||'llama-3.1-8b-instant');
    // ⬡B:core.tool.loop:FIX:lower_temp_for_tool_reliability:20260702⬡
    // Live incident: asked the same biography question twice under identical
    // wiring -- once she called find_in_brain with the right topic (wrong part,
    // now fixed separately), once she skipped the tool call entirely and fell
    // back to the honesty rule. 0.5 is high for what is substantially a pattern-
    // match decision (does this question match a known tool-trigger class).
    // Lowered to reduce that variance; still warm enough for natural replies.
    // This is a real improvement, not a guarantee -- instruction-following on
    // a growing system prompt stays worth watching, not a closed case.
    var body={model:model,messages:msgs,max_tokens:tokenCapFor(channel),temperature:0.3};
    if (iter<=3) body.tools=TOOLS;
    // ⬡B:core.tool_loop:FIX:tool_choice_never_set_defaults_to_skippable:20260705⬡
    // Real, live incident: Brandon asked directly "who is DC499D0C, show me
    // the original message" over text -- the single clearest possible
    // trigger for find_in_brain -- and the turn answered in 4.7s with
    // toolsUsed:[], fabricating "HAM UID stands for Human-Assisted Messaging"
    // out of nothing. The doctrine already says SEARCH FIRST, ALWAYS as a
    // mandatory prompt instruction (fcw.builder.js), but tool_choice itself
    // was never set, which leaves the API default of "auto" -- the model can
    // always skip an attached tool no matter how firm the prose around it
    // reads. This does not invent a new rule; it enforces the one already on
    // record with the actual mechanism built for it. Forced only on the
    // first iteration of a fresh turn (iter===1) -- not iter<=3 -- so a
    // legitimate multi-step exchange is never locked into calling a tool a
    // second or third time it does not need. A plain "hey" still gets a real
    // answer: find_in_brain is a safe no-op on a genuinely contentless query,
    // and synthesis already runs after, so a forced-but-empty lookup costs a
    // beat, not a wrong turn.
    if (iter===1) {
      // \u2b21B:core.tool_loop:FIX:forced_lookup_derailing_screen_commands_20260709\u2b21
      // Founder-caught live, third layer of the same night's incident: even with the
      // extraction leak and the statelessness both fixed, "change background to
      // something more of a vibe" produced a totally unrelated reply about a coding
      // roadmap. Root cause, traced directly: find_in_brain is forced on EVERY first
      // turn, including pure UI commands that have nothing to look up. The forced call
      // still runs, returns whatever is most recent/important in the brain regardless
      // of relevance, and the model then drifts into discussing THAT instead of doing
      // the actual thing it was asked to do. The forcing exists to stop identity
      // hallucination on text/email, where a wrong answer can get acted on -- real
      // stakes. On a live screen, mistakes are cheap, instantly followed up on, and
      // already covered by a separate safety net (the honesty-fallback a few dozen
      // lines below, which explicitly tells her to admit uncertainty rather than
      // fabricate). So: skip the forced grounding only when a live screen is open,
      // and let her decide naturally whether to call find_in_brain, update_screen, or
      // just answer -- the mandatory lookup on text/email is completely unchanged.
      var _liveNow = false;
      try { _liveNow = require('./stream/screen.awareness.js').hasLiveScreen(hamUid); } catch (eLn) {}
      // ⬡B:core.tool.loop:FIX:live_screen_suppressed_lookup_gaslit_founder_questions:20260713⬡
      // Founder-caught live 8am: on a VOICE call (which registers as a live screen) he
      // asked "what's the fix" and got "I don't have it, you point me to the code" -- six
      // no_tool_turn diagnostics, zero tools fired. Root cause: the live-screen skip below
      // turned OFF the forced find_in_brain for EVERY live turn, including real questions,
      // so she answered from nothing and it read as gaslighting. The skip exists for a real
      // reason -- forcing a lookup on a UI command ("change background to a vibe") pulled
      // unrelated brain content and derailed. So the split is by intent, cold, no LLM: a
      // real information question still forces the read even on a live screen; a screen/UI
      // manipulation command stays unforced so it never derails. Text/email path unchanged.
      // B:core.tool_loop:FIX:hallucinated_meeting_911_20260714 Founder caught her
      // CONFIDENTLY INVENTING a fake meeting ("Mark Gerzon at 2:30", "7 assets",
      // "ten BDIF emails") that do not exist anywhere in his real calendar or inbox.
      // ROOT CAUSE: the info-question detector was anchored to the START of the
      // message (^who|what|...), so "Hey. What's going on today?" never matched --
      // the greeting defeated the anchor -- find_in_brain was never forced, and the
      // model free-talked a plausible-sounding lie instead of reading real data.
      // Fixed to match ANYWHERE in the message, not just the start. AND: any question
      // that could be answered by his real calendar (today/schedule/meeting/free/
      // busy/calendar) now forces calendar_read specifically -- never find_in_brain
      // alone -- so a day-shaped question can only ever be answered from real events.
      var _mSt = String(message||'').trim();
      var _looksLikeInfoQ = /\?\s*$/.test(_mSt)
        || /\b(who|what|whats|what's|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should|tell me|show me|remind me|give me|status|update on|what's going on|whats going on|what is going on)\b/i.test(_mSt);
      var _isScreenCmd = /\b(background|wallpaper|layout|theme|vibe|colou?r|font|bigger|smaller|resize|move it|make it (a|more)|show me on|put .*(on the)? (screen|left|right|cent(er|re)))\b/i.test(_mSt);
      var _isDayQ = /\b(today|schedule|calendar|meeting|meetings|free|busy|agenda|day looks?|going on today|day today|tomorrow)\b/i.test(_mSt) && !_isScreenCmd;
      if (_nashNeeded) { body.tool_choice={type:'function',function:{name:'nash_sports'}}; _nashNeeded=false; } // force ONCE; repeat-forcing was a mini-bleed (fired 3x on one question)
      else if (_isDayQ) body.tool_choice={type:'function',function:{name:'calendar_read'}};
      else if (!_liveNow || (_looksLikeInfoQ && !_isScreenCmd)) body.tool_choice={type:'function',function:{name:'find_in_brain'}};
    }
    // \u2b21B:core.tool_loop:WIRE:ornith_opt_in_no_tools_only:20260703\u2b21
    // Founder request: try Ornith for A'NU's real conversational turns too, not
    // just the coding department. Off by default (TRY_ORNITH_CONVERSATIONAL must
    // be explicitly set) -- this changes what every live text, call, and email
    // reply runs on, and that default is not mine to flip silently. Real limit
    // found while wiring this, stated plainly rather than hidden: the RunPod
    // Ollama worker just attached to the Ornith endpoint serves plain chat, not
    // OpenAI-style tool_calls -- Ornith's own model card supports tool calling,
    // but only through vLLM's tool-call parser, which is a different worker setup
    // than what is deployed right now. So this only engages on a turn with no
    // tools attached (body.tools is unset here); any turn where TOOLS were
    // actually passed above always runs on Groq, unconditionally, so find_in_brain
    // and every other tool call stay exactly as reliable as they are today. Any
    // failure or timeout falls straight through to the existing Groq call below --
    // this can degrade to current behavior, never below it.
    var r=null;
    if (process.env.TRY_ORNITH_CONVERSATIONAL === 'true' && !body.tools) {
      try {
        var ORN = process.env.ORNITH_URL, ORK = process.env.RUNPOD_API_KEY;
        if (ORN && ORK) {
          var ornResp = await fetch(ORN.replace(/\/$/,'') + '/runsync', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + ORK, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { method_name: 'chat', input: { messages: msgs, options: { temperature: 0.3, num_predict: 400 } } } })
          }).then(function(x){ return x.json(); }).catch(function(e){ return { error: e.message }; });
          var ornText = ornResp && ornResp.output && (ornResp.output.message && ornResp.output.message.content || ornResp.output.response);
          if (ornResp && ornResp.status === 'COMPLETED' && ornText) {
            r = { choices: [{ message: { role: 'assistant', content: ornText } }], _provider: 'ornith' };
          }
        }
      } catch (eOrn) { /* fall through to Groq below, unchanged */ }
    }
    if (!r) r=await fetch(GB,{method:'POST',
      headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
    if(r&&r.error){global._paiLastError='groq:'+JSON.stringify(r.error).slice(0,120);}
    if(r&&!r.choices&&!r.error){global._paiLastError='groq_no_choices:'+JSON.stringify(r).slice(0,150);}
    if (!r||r.error||!r.choices){
      var TK=process.env.TOGETHER_API_KEY;
      if(TK){r=await fetch('https://api.together.xyz/v1/chat/completions',{method:'POST',
        headers:{Authorization:'Bearer '+TK,'Content-Type':'application/json'},
        body:JSON.stringify({model:process.env.TOGETHER_MODEL||'Qwen/Qwen3.5-9B',
          messages:msgs.map(function(m){return {role:m.role,content:m.content||''};}),
          max_tokens:tokenCapFor(channel),temperature:0.3})
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      if(r&&r.choices&&r.choices.length){global._paiLastError=null;}
      else if(r&&r.error){global._paiLastError='together:'+JSON.stringify(r.error).slice(0,120);}
      else if(r&&!r.choices){global._paiLastError='together_no_choices:'+JSON.stringify(r).slice(0,150);}
      }else{global._paiLastError='together_no_key';}
    }
    // ⬡B:core.tool_loop:FIX:openrouter_third_tier_20260713⬡
    // Founder-caught live: Together returned "Credit limit exceeded" on a real
    // production call, and there was nothing after it -- ans='' and the whole
    // cycle died, surfacing as ok:false/no_answer at the reach channel. Real,
    // observed failure mode, not hypothetical. OpenRouter is already a standing
    // key on this service (doctrine.model_map, un-banned by founder's own word
    // 20260709), so it is the correct third tier rather than a new dependency.
    // No tools attached here (matches the Together tier above, which is also
    // tool-free) since this only ever engages after tool-capable Groq has
    // already failed on this turn. Same fail-soft discipline: any error here
    // just falls through to the existing empty-answer path below, unchanged.
    if (!r||r.error||!r.choices){
      var ORK=process.env.OPENROUTER_API_KEY;
      if(ORK){r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
        headers:{Authorization:'Bearer '+ORK,'Content-Type':'application/json'},
        body:JSON.stringify({model:process.env.OPENROUTER_MODEL||'meta-llama/llama-3.3-70b-instruct',
          messages:msgs.map(function(m){return {role:m.role,content:m.content||''};}),
          max_tokens:tokenCapFor(channel),temperature:0.3})
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      if(r&&r.choices&&r.choices.length){global._paiLastError=null;}
      else if(r&&r.error){global._paiLastError='openrouter:'+JSON.stringify(r.error).slice(0,120);}
      else if(r&&!r.choices){global._paiLastError='openrouter_no_choices:'+JSON.stringify(r).slice(0,150);}
      }else{global._paiLastError='openrouter_no_key';}
    }
    if (!r||r.error||!r.choices){
      ans='';
      break;
    }
    var ch=r.choices[0],msg=ch.message;
    // ⬡B:core.tool_loop:FIX:safe_tool_text_salvage_20260710⬡
    // Founder 1B gate failure, exact receipt from her own trace: cycle_end contained
    // <function(update_screen){"cards":[... -- Groq emitted the tool call as plain
    // TEXT instead of a real tool_calls entry, the documented platform text-mode
    // failure, retriggered here by the richer nested card schema. The standing
    // reject-unexecuted-toolcall-text rule is correct and stays: it exists because a
    // real email was once actually sent from believed-but-unexecuted text. But for
    // tools that only render to the glass or only read, refusing the salvage turns a
    // platform hiccup into a dead turn. So: a STRICT allowlist salvage. If content
    // matches the function-text shape and the name is render-only or read-only, the
    // text becomes a real synthesized tool_call and runs through the exact same
    // executeTool path, stamps and all. notify_ham, write_to_brain, fix_file_in_github,
    // trigger_deploy, create_reminder, request_new_capability are NEVER salvaged;
    // anything with outbound or persistent side effects stays behind the original rule.
    // \u2b21B:core.tool_loop:FIX:qwen_tool_call_dialect_20260711\u2b21 Founder screenshot:
    // raw <tool_call>update_screen(chart={...}) leaked into her chat as TEXT and the
    // chart never rendered. Qwen 3.6 emits a THIRD dialect: <tool_call> tags wrapping
    // kwarg-style calls (name(key={json}, key2=value)). Normalized here into the same
    // <function shape the salvage already speaks, and regardless of salvage success
    // the <tool_call> block is ALWAYS stripped from visible content -- tool plumbing
    // never renders as chat text again.
    if (typeof msg.content === 'string' && msg.content.indexOf('<tool_call>') !== -1) {
      var tcm = msg.content.match(/<tool_call>\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)(\)\s*<\/tool_call>|\)\s*$|$)/);
      if (tcm) {
        var kwSrc = tcm[2] || '';
        var argsObj = {};
        var ki = 0;
        while (ki < kwSrc.length) {
          var km = kwSrc.slice(ki).match(/^[\s,]*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/);
          if (!km) break;
          var vStart = ki + km[0].length, vEnd = vStart, depth2 = 0, inStr = false;
          for (var ci = vStart; ci < kwSrc.length; ci++) {
            var ch = kwSrc[ci];
            if (inStr) { if (ch === '"' && kwSrc[ci - 1] !== '\\') inStr = false; }
            else if (ch === '"') inStr = true;
            else if (ch === '{' || ch === '[') depth2++;
            else if (ch === '}' || ch === ']') depth2--;
            else if (ch === ',' && depth2 === 0) { vEnd = ci; break; }
            vEnd = ci + 1;
          }
          var rawVal = kwSrc.slice(vStart, vEnd).trim();
          try { argsObj[km[1]] = JSON.parse(rawVal); } catch (eV) { argsObj[km[1]] = rawVal.replace(/^['"]|['"]$/g, ''); }
          ki = vEnd + 1;
        }
        // rewrite into the shape the existing salvage speaks, preserving any human text around it
        var human = msg.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, ' ').replace(/\s+/g, ' ').trim();
        msg.content = (human ? human + ' ' : '') + '<function=' + tcm[1] + '>' + JSON.stringify(argsObj);
      } else {
        msg.content = msg.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    if (!(msg.tool_calls && msg.tool_calls.length) && typeof msg.content === 'string' && msg.content.indexOf('<function') !== -1) {
      var SAFE_SALVAGE = ['update_screen', 'get_recent_builds', 'find_in_brain', 'get_budget_summary', 'get_budget_upcoming', 'get_pending_drafts', 'read_render_logs'];
      var mSalv = msg.content.match(/<function[=(]\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (mSalv && SAFE_SALVAGE.indexOf(mSalv[1]) !== -1) {
        var braceStart = msg.content.indexOf('{', mSalv.index);
        if (braceStart !== -1) {
          var depth = 0, endBr = -1;
          for (var bi = braceStart; bi < msg.content.length; bi++) {
            if (msg.content[bi] === '{') depth++;
            else if (msg.content[bi] === '}') { depth--; if (depth === 0) { endBr = bi; break; } }
          }
          if (endBr !== -1) {
            try {
              var salvArgs = JSON.parse(msg.content.slice(braceStart, endBr + 1));
              msg = { role: 'assistant', content: null, tool_calls: [{ id: 'salvage_' + Date.now(), type: 'function', function: { name: mSalv[1], arguments: JSON.stringify(salvArgs) } }] };
              _stampStep('tool_text_salvaged', mSalv[1]);
            } catch (eSalv) { /* unparseable text stays under the original reject rule */ }
          }
        }
      }
    }
    // ⬡B:core.tool_loop:FIX:forced_tool_choice_not_honored_by_groq:20260705⬡
    // Real, confirmed live: even with tool_choice forced, Groq's own response
    // came back finish_reason:'stop', tool_calls:[] -- the platform simply did
    // not honor the constraint on this real call (it did on a small isolated
    // test, so this is specific to the larger real system-prompt shape, not a
    // malformed request; traced with two temporary diagnostic logs, removed
    // here). One retry, forcing it a second time with a sharper instruction,
    // since this kind of platform miss has some real non-determinism to it.
    // If the retry ALSO fails to produce a real tool call, the answer is
    // rejected outright -- silence over a confident guess about something as
    // real as the founder's own identity. This is the same silence-over-
    // hollow rule already enforced a few lines below for malformed tool-call
    // text; this is the same failure class arriving a different way.
    if (iter===1 && body.tool_choice && !(msg.tool_calls&&msg.tool_calls.length)) {
      var retryMsgs=msgs.concat([{role:'assistant',content:msg.content||''},
        {role:'user',content:'You were required to call find_in_brain and did not. Call it now before saying anything else.'}]);
      var retryBody={model:model,messages:retryMsgs,max_tokens:tokenCapFor(channel),temperature:0.1,
        tools:body.tools,tool_choice:body.tool_choice};
      var retryR=await fetch(GB,{method:'POST',
        headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
        body:JSON.stringify(retryBody)
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      var retryMsg=retryR&&retryR.choices&&retryR.choices[0]&&retryR.choices[0].message;
      if (retryMsg&&retryMsg.tool_calls&&retryMsg.tool_calls.length) {
        msg=retryMsg;
      } else {
        // ⬡B:core.tool_loop:FIX:silence_was_swallowing_plain_statements:20260706⬡
        // Real, confirmed live: a message like "remember this: my coffee
        // order" is a STATEMENT, not a lookup question -- it still got
        // forced through tool_choice, the retry still failed to produce a
        // real tool call, and the whole turn went silent, so downstream
        // memory-keeping in synthesize.js never even ran. The founder's own
        // words -- keep tools forced, not gaslighting through inaction --
        // were about QUESTIONS not getting a real lookup, specifically the
        // HAM UID incident. A mechanical, not-a-judgment-call distinction:
        // does the ORIGINAL message actually look like a question. If yes,
        // stay silent -- that is exactly the identity-hallucination case
        // this was built for. If no, it is a statement or directive, let the
        // retry's own natural text through instead of swallowing it whole;
        // synthesize.js's existing councilShadow hallucination check still
        // runs on whatever text goes out either way, same as every other
        // reply -- this does not remove that layer, it just stops silencing
        // things that were never a lookup question in the first place.
        var looksLikeQuestion = /\?\s*$/.test(String(message||'').trim())
          || /^\s*(who|what|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should)\b/i.test(String(message||'').trim());
        if (looksLikeQuestion) {
          // \u2b21B:core.tool.loop:FIX:live_screen_honesty_fallback_not_blanket_silence:20260709\u2b21
          // Founder-caught live: "Is this finally working?" went dark. Real root cause,
          // traced through her own cycle stamps: this silence guard is correct and load-
          // bearing for identity/personal-fact questions (the documented HAM-UID
          // fabrication incident this was built to stop) but it was catching EVERY
          // question shape, including ordinary conversational ones with zero personal-
          // data risk. On a live screen, where a person is watching in real time, going
          // dark on "is this working" reads as broken, not safe. Fix is scoped tight:
          // only when a live screen is open for this HAM, one more plain, UNFORCED
          // completion is allowed, explicitly instructed to admit uncertainty rather than
          // invent personal facts. Text and email keep the original blanket silence,
          // completely unchanged. A second empty result still goes silent -- this is one
          // honest chance, not a bypass of the protection.
          var _liveScreen = false;
          try { _liveScreen = require('./stream/screen.awareness.js').hasLiveScreen(hamUid); } catch (eLs) {}
          // ⬡B:core.tool.loop:FIX:portal_is_a_live_screen:20260709⬡
          // The portal channel (CCWA / command center ask) IS a person watching in real
          // time -- same honesty lane as a live screen, per the rule written above: going
          // dark on a watched surface reads as broken, not safe. Text and email keep the
          // blanket silence, completely unchanged. One honest unforced completion, that is
          // all this grants -- the second empty result still goes silent.
          if (channel === 'portal') _liveScreen = true;
          if (_liveScreen) {
            var honestBody = { model: model, messages: msgs.concat([
              { role: 'assistant', content: msg.content || '' },
              { role: 'user', content: 'Just answer plainly, in your own voice, right now. If you already have the material, answer with it directly. If this needs data you could not find, say plainly that you checked and there is nothing on it yet -- never tell the person to go find it for you, never say "you tell me", and never invent anything.' }
            ]), max_tokens: tokenCapFor(channel), temperature: 0.3 };
            var honestAns = (await callGLMPlain(null, honestBody.messages, tokenCapFor(channel))) || '';
            if (!honestAns) {
              var honestR = await fetch(GB, { method: 'POST',
                headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
                body: JSON.stringify(honestBody)
              }).then(function (x) { return x.json(); }).catch(function (e) { return { error: e.message }; });
              honestAns = (honestR && honestR.choices && honestR.choices[0] && honestR.choices[0].message && (honestR.choices[0].message.content || '').trim()) || '';
            }
            ans = honestAns || '';
          } else {
            ans = '';
          }
          break;
        } else {
          // \u2b21B:core.tool.loop:FIX:statements_never_had_honest_fallback:20260711\u2b21
          // Real, confirmed live: an eviction message with real police-removal
          // risk went fully silent for 11.7 real seconds of genuine work --
          // forced find_in_brain, a real retry, both failed to produce a tool
          // call. The retry's OWN prompt says "call it now before saying
          // anything else," which gives the model no instruction for what to
          // say if it still can't comply, so it comes back essentially empty.
          // Questions on a live screen already had a real honest-fallback
          // pass built for exactly this failure shape; statements on every
          // channel never did. A life assistant that goes silent on someone
          // describing an active eviction risk is not a safe default, it's
          // the same failure this whole system exists to prevent. Same
          // pattern, no longer gated to live screens or questions only.
          var stmtBody = { model: model, messages: msgs.concat([
            { role: 'assistant', content: (retryMsg && retryMsg.content) || msg.content || '' },
            { role: 'user', content: 'You could not look anything up for that. Respond anyway, briefly and honestly, in your own words -- acknowledge what was actually said, and if you are missing information say plainly that you checked and have nothing on it yet rather than telling the person to find it for you. Do not invent facts or next steps you cannot verify.' }
          ]), max_tokens: tokenCapFor(channel), temperature: 0.3 };
          var stmtAns = (await callGLMPlain(null, stmtBody.messages, tokenCapFor(channel))) || '';
          if (!stmtAns) {
            var stmtR = await fetch(GB, { method: 'POST',
              headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
              body: JSON.stringify(stmtBody)
            }).then(function (x) { return x.json(); }).catch(function (e) { return { error: e.message }; });
            stmtAns = (stmtR && stmtR.choices && stmtR.choices[0] && stmtR.choices[0].message && (stmtR.choices[0].message.content || '').trim()) || '';
          }
          msg = { role: 'assistant', content: stmtAns || (retryMsg && retryMsg.content) || msg.content || '' };
        }
      }
    }
    if (msg.tool_calls&&msg.tool_calls.length) {
      msgs.push({role:'assistant',content:msg.content||null,tool_calls:msg.tool_calls});
      for (var i=0;i<msg.tool_calls.length;i++){
        var tc=msg.tool_calls[i],targs={};
        try{targs=JSON.parse(tc.function.arguments||'{}');}catch(e){}
        _stampStep('tool_call', tc.function.name);
        var tr=await executeTool(tc.function.name,targs,hamUid,message);
        tools.push(tc.function.name);
        if (tc.function.name === 'read_own_code') {
          try {
            var _trParsed = JSON.parse(tr);
            if (_trParsed && Array.isArray(_trParsed.realNumbersFoundInThisCode)) {
              _verifiedRealNumbers = _verifiedRealNumbers.concat(_trParsed.realNumbersFoundInThisCode);
            }
          } catch (eTrParse) {}
        }
        msgs.push({role:'tool',tool_call_id:tc.id,content:tr});
      }
      continue;
    }
    ans=(msg.content||'').trim();
    // ⬡B:core.tool.loop:FIX:reject_unexecuted_toolcall_text:20260704⬡
    // Live founder proof, real email sent: the model wrote a tool call as
    // plain text -- <notify_ham>{"ham_uid":...}</function> -- instead of a
    // real structured tool_calls entry (note the mismatched closing tag,
    // this was never a working call, just a malformed attempt). No guard
    // existed for msg.content looking like an unexecuted tool invocation, so
    // it went out as the literal answer, to a real inbox. This is a hollow
    // reply wearing a costume, not a real answer -- same rule as no answer
    // at all: silence over sending garbage to a human.
    if (/^<[a-z_]+>\s*\{.*\}\s*<\/[a-z_]+>$/is.test(ans)) { ans = ''; }
    // ⬡B:core.tool.loop:WIRE:diagnostic_no_tool_visibility:20260704⬡
    // CLAIR wiring, licensed and diagnostic only, not the fix itself. A
    // founder-voice task asked for exactly this and gave up twice with no
    // real attempt, then a real attempt built something unrelated. This
    // mirrors the vara_raw_shape logger that already found a real bug
    // tonight: pure visibility into the moment a turn finishes with no tool
    // call, so the actual fix (tool_choice, prompting, a classifier,
    // whatever it turns out to be) has real data behind it instead of
    // another guess. Never decides the fix, only shows the pattern.
    if (!tools.length && ans) {
      try {
        var BUd = process.env.AIBE_BRAIN_URL, BKd = process.env.AIBE_BRAIN_KEY;
        if (BUd && BKd) {
          fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST',
            headers: { apikey: BKd, Authorization: 'Bearer ' + BKd, 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ ham_uid: hamUid, agent_global: 'CLAIR', stamp_type: 'RESULT',
              acl_stamp: '\u2b21B:clair.diagnostic:RESULT:no_tool_turn:20260704\u2b21',
              source: 'clair.diagnostic.no_tool_turn.' + Date.now(),
              summary: '[CLAIR DIAGNOSTIC] no-tool turn on channel ' + channel,
              content: JSON.stringify({ channel: channel, question: String(message || '').slice(0, 150), answer_preview: ans.slice(0, 200) }),
              importance: 5 })
          }).catch(function () {});
        }
      } catch (eDiagLoop) {}
    }
    break;
  }
  var finalAns=(ans&&String(ans).trim())?String(ans).trim():'';
  // ⬡B:core.tool.loop:FIX:raw_json_never_a_final_answer:20260714⬡
  // Live incident, founder's real phone: a raw tool result -- {"ok":true,"upcoming_events":
  // 0,"next_open_slots":[...]} -- went out as the actual text message. A text channel is
  // never the place for a JSON blob; whatever asked for it, a human reading iMessage never
  // gets raw data back. Cold detection: if the answer parses as JSON (starts with { or [ and
  // is valid JSON), it is never sent as-is. Composed instead, in plain words, from the shape
  // of what came back, so the tool result still reaches him, just as an actual sentence.
  if (finalAns && /^[\[{]/.test(finalAns.trim())) {
    var _rawParsed = null;
    try { _rawParsed = JSON.parse(finalAns.trim()); } catch (eRawJ) {}
    if (_rawParsed && typeof _rawParsed === 'object') {
      _stampStep('raw_json_answer_caught', 'a tool result nearly went out as raw JSON instead of a sentence');
      if (_rawParsed.next_open_slots || _rawParsed.upcoming_events !== undefined) {
        var _n = Array.isArray(_rawParsed.next_open_slots) ? _rawParsed.next_open_slots.length : 0;
        finalAns = _n > 0
          ? 'Your calendar is open right now, ' + _n + ' free half-hour blocks coming up. Want me to grab one?'
          : 'Nothing open on your calendar in the window I checked, or it is genuinely clear with no slots computed yet -- tell me what you are trying to book and I will look closer.';
      } else {
        finalAns = 'I pulled that up, but I need to say it in words instead of handing you raw data. Ask me again and I will answer it properly.';
      }
    }
  }
  // ⬡B:core.tool.loop:FIX:hallucinated_reminder_action_20260712⬡
  // Founder screenshot: she replied 'I've set a reminder for you to check in on Tameka,
  // it'll pop up tomorrow 9am' -- but create_reminder NEVER fired, so no reminder
  // exists. Claiming an action you did not take is the worst failure. Guard: if the
  // reply claims a reminder/calendar action but the matching tool did not run this
  // turn, strip the false claim and tell the truth. Cold detection, no LLM.
  if (finalAns && /\bI(?:'ve| have)?\s+(?:set|created|scheduled|added|made)\s+(?:a\s+)?(?:reminder|calendar|event)\b/i.test(finalAns) && tools.indexOf('create_reminder')===-1 && tools.indexOf('create_event')===-1) {
    _stampStep('hallucinated_action_caught','claimed reminder/event without firing the tool');
    finalAns = "I want to set that reminder for you, but I need to actually create it rather than just say I did. Tell me the exact thing and time and I will set it for real this time.";
  }
  if(!finalAns){
    _stampStep('cycle_end_silent', 'no_answer, iterations='+iter);
    // ⬡B:core.tool.loop:BUILD:universal_tracker_no_silent_evaporation:20260713⬡
    // Architect-flagged live: a two-part text (recurring timeshare reminder + scan
    // calendars / consult advisors / book a haircut) hit THIS path and VANISHED -- no
    // reply, no reminder, and no record that anything was ever owed. Silence-over-hollow
    // is correct for identity-hallucination risk, but a clear ACTION request must never
    // evaporate without a trace. Now: (1) stamp a TRACK BLOCKED so the ask is findable in
    // one query, and (2) if the inbound was an explicit action request on a reply channel,
    // return a short HONEST status instead of dead air -- a truthful "logged it, could not
    // finish it", not hollow content. A non-action empty (identity risk, contentless) still
    // goes fully silent, unchanged.
    var _blockedFallback = false;
    try {
      var _trk = require('./tracker.js');
      var _wasAction = _trk.looksLikeActionRequest(message);
      await _trk.stampTrack({ hamUid: hamUid, status: 'BLOCKED', kind: 'request',
        request: String(message||''), channel: channel, cycleId: _cycleId, tools_used: tools,
        reason: 'cycle produced no answer after ' + iter + ' iterations; likely missing a tool for part of the ask' });
      if (_wasAction && ['blooio','text','sms','voice','iman','email','portal','omi','ccwa','cara'].indexOf(channel) !== -1) {
        finalAns = 'I have your request logged so it will not get lost. Part of it I could not finish on my own yet, and I have flagged that to get handled. If you tell me which piece matters most right now, I will take another run at it.';
        _blockedFallback = true;
      }
    } catch(_eTrk){}
    if(!finalAns) return {ok:false,reason:'no_answer',ham:hamObj,cycleId:_cycleId,
      tools_used:tools,iterations:iter,ms:Date.now()-t0,fcw_ms:(fcw&&fcw.ms)||0,_dbg:global._paiLastError||null};
  }
  // THE REAL SECOND PASS. Deterministic, not another LLM guess trusting itself.
  if (_verifiedRealNumbers.length && /\d/.test(finalAns)) {
    var _answerNumbers = (finalAns.match(/\b\d+\b/g) || []);
    var _unverified = _answerNumbers.filter(function(n){ return _verifiedRealNumbers.indexOf(n) === -1; });
    if (_unverified.length) {
      _stampStep('verifier_caught_fabrication', 'unverified numbers: '+_unverified.join(','));
      try {
        var _retryMsgs = msgs.concat([
          {role:'assistant',content:finalAns},
          {role:'user',content:'Real verification just ran on that answer: it contains the number(s) '+_unverified.join(', ')
            +' which do not appear anywhere in the real code you actually read. That is fabricated, not real. '
            +'Give the same answer again with those specific numbers removed entirely -- describe the mechanism '
            +'qualitatively with no invented figure, or say plainly that detail was not confirmed. Do not invent a '
            +'replacement number either.'}
        ]);
        // \u2b21B:core.tool.loop:FIX:reasoning_model_token_starvation:20260712\u2b21
        // Real, documented pattern found in another lane's session notes today:
        // GROQ_MODEL_C2 (openai/gpt-oss-120b) is a reasoning model -- it writes an
        // internal reasoning field before content, both counted against max_tokens.
        // A hardcoded 400 here was within range of the exact failure another lane
        // found and fixed elsewhere in this same codebase the same day (a 600-token
        // call spending 598 on reasoning, content empty). This call site wasn't
        // part of that sweep. Moved to the same configurable, safer cap (700
        // default) every other real call in this file already uses.
        var _retryResp = await fetch('https://api.groq.com/openai/v1/chat/completions',{
          method:'POST',headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
          body:JSON.stringify({model:(process.env.GROQ_MODEL_C2||'openai/gpt-oss-120b'),messages:_retryMsgs,max_tokens:tokenCapFor(channel),temperature:0.1})
        }).then(function(x){return x.json();});
        var _retryText = _retryResp && _retryResp.choices && _retryResp.choices[0] && _retryResp.choices[0].message && _retryResp.choices[0].message.content;
        if (_retryText && _retryText.trim()) {
          var _retryNumbers = (_retryText.match(/\b\d+\b/g) || []);
          var _stillBad = _retryNumbers.filter(function(n){ return _verifiedRealNumbers.indexOf(n) === -1; });
          finalAns = _stillBad.length ? finalAns.replace(/\b(\d+)-?\s*(hour|day|minute|item)s?\b/gi, 'a limited number of $2s') : _retryText.trim();
        }
      } catch (eVerify) { /* verification itself must never crash a real turn */ }
    }
  }
  // ⬡B:core.tool.loop:WIRE:screen_awareness_act:20260709⬡ her own answer moves the
  // glass: one [[SCREEN {json} ]] block is extracted, validated, pushed through the
  // full gate stack to her live sessions, and the spoken answer stays human. A
  // malformed block drops in silence; the words always still flow.
  var _screenPushed = 0;
  try { var _scr = await require('./stream/screen.awareness.js').applyScreenBlock(hamUid, finalAns); finalAns = _scr.answer || finalAns; _screenPushed = _scr.pushed || 0; } catch (eScrA) {}
  if (!finalAns) { _stampStep('cycle_end_silent','answer_was_only_screen_block'); return {ok:false,reason:'no_answer',ham:hamObj,cycleId:_cycleId,tools_used:tools,iterations:iter,ms:Date.now()-t0,fcw_ms:(fcw&&fcw.ms)||0,_dbg:global._paiLastError||null}; }
  _stampStep('cycle_end', finalAns.slice(0,80) + (_screenPushed ? (' [screen:'+_screenPushed+']') : ''));
  // ⬡B:tool.loop:GUARD:leaked_tool_syntax_scrub:20260711⬡ on an empty NASH
  // board the model retried and leaked "<function=...>" into its last line.
  // Cold scrub; if nothing real remains, hollow-reply law: ok:false.
  finalAns = String(finalAns || '').replace(/<function=[^>]*>?/g, '').replace(/<\/function>/g, '').trim();
  // \u2b21B:core.tool_loop:WIRE:format_matrix_universal_choke_point:20260711\u2b21
  // Founder, exact words: 'this should be for every CARA and chat instance and email
  // and text! All reach should do this right??????' -- correct call. This is the ONE
  // place every channel's final answer passes through (email/wren already call
  // runPAI directly, CARA/command-center share the same /eanew/ask door, VARA voice
  // reads this same field). Cleaning HERE means it is universal by construction, not
  // a per-channel patch that drifts. Destination-aware: 'sms' gets the hard cap this
  // channel needs so an outbound text is never a wall of text.
  try {
    var _fmtDest = (channel === 'text' || channel === 'sms') ? 'sms' : 'command_center';
    finalAns = require('./format.matrix.js').formatForDestination(finalAns, _fmtDest);
  } catch (eFmt) {}
  if (!finalAns) return {ok:false,reason:'no_answer',ham:hamObj,cycleId:_cycleId,tools_used:tools,iterations:iter,ms:Date.now()-t0};
  // ⬡B:core.tool.loop:WIRE:cycle_receipt_stamped:20260712⬡
  // Two Command Centers step 5: tools_used/iterations/ms already existed in this return
  // object but were only ever handed to the caller, never stamped as a bead, so the
  // CLAIR view (self-heal, self-learn) had nothing to show which tools ran or fell.
  // One stamp, same lineage shape as everywhere else, builder-only (technical).
  try {
    var _fellTools = tools.filter(function (tu) { return tu && (tu.error || tu.failed); }).map(function (tu) { return tu.name || tu.tool || 'unknown'; });
    var _lineage = require('./lineage.attach.js');
    _stampStep('cycle_receipt', JSON.stringify(_lineage.attachLineage(
      { cycleId: _cycleId, tools_used: tools, iterations: iter, ms: Date.now() - t0, fell: _fellTools, channel: channel },
      { chain: ['PAI', 'MemoryBank'], deliveredBy: 'PAI cycle', why: (_fellTools.length ? _fellTools.length + ' tool(s) fell: ' + _fellTools.join(', ') : 'clean cycle, ' + tools.length + ' tool(s) ran'), audience: 'builder' }
    )));
  } catch (eRcpt) { /* receipt is diagnostic, never block the real answer on it */ }
  // ⬡B:core.tool.loop:BUILD:universal_tracker_done_on_completion:20260713⬡
  // The other half of the Architect's tracker: when a real action request completes, it
  // gets a TRACK DONE with what ran, so "everything has a record" is true on the win side
  // too, not only when things break. High-signal only: plain chat/greetings are not
  // tracked (that would be bead-spam / a bleed). Skips the blocked-fallback path above so
  // one turn is never stamped both DONE and BLOCKED. Never blocks the real answer.
  try {
    if (!(typeof _blockedFallback !== 'undefined' && _blockedFallback)) {
      var _trkD = require('./tracker.js');
      if (_trkD.looksLikeActionRequest(message)) {
        await _trkD.stampTrack({ hamUid: hamUid, status: 'DONE', kind: 'request',
          request: String(message||''), channel: channel, cycleId: _cycleId, tools_used: tools,
          outcome: finalAns });
      }
    }
  } catch (eTrkDone) {}
  return {ok:true,answer:finalAns,screen_pushed:_screenPushed,ham:hamObj,cycleId:_cycleId,
    tools_used:tools,iterations:iter,ms:Date.now()-t0,fcw_ms:(fcw&&fcw.ms)||0,fcw_build_ms:_fcwBuildMs,_dbg:global._paiLastError||null};
}
module.exports={runPAI};
