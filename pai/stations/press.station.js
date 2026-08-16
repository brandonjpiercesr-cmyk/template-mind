// ⬡B:pai.stations.press:BUILD:press_wonder_news_external_surveillance_consumes_now:20260719⬡
// PROACTIVE department. PRESS = Proactive Research and External Source Surveillance: the
// NEWS agent. It monitors the outside world for events that matter to the HAM (news, PR,
// competitor moves, industry shifts) and surfaces ONLY what he needs. Its primary consumer
// is DAWN's morning briefing. (Corrected on 20260718: PRESS is NEWS, not the ABA-glasses
// cupcake catcher -- that is HUNCH/GAZE, separate agents.)
//
// PRESS is an ORGAN for the relevance judgment (does-this-matter-to-HIM is meaning, so an
// LLM decides through the ONE ladder, never a rogue call), but the SCANNING is cheap/cold
// (a search hop), per the tier law. It CONSUMES NOW: it reads current-moment context to
// prefer fresh/timely items, and never resolves time itself.
//
// Entrance: DAWN calls PRESS during briefing generation (and it can run on the proactive
//   sweep). Exit: zero or more relevant items {headline, why_it_matters, source, freshness},
//   or nothing when nothing is relevant (silence over noise). Notes: a bead per surfaced
//   item with lineage so dedup works and it is greppable.

var ladder = require('../core/model.ladder.js');
var nowStation = require('./now.station.js');
var persona = require('../core/persona.js');
var crypto = require('node:crypto');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// Cheap external scan. Uses the OpenRouter web plugin through the boundary (never a rogue
// host). Returns raw candidate headlines; the relevance judgment happens after, in the
// organ. Fails open (empty) so a scan hiccup yields a quiet tick, never an error.
// ⬡B:press.scan:SEAT:the_scan_stops_spending_the_shared_wallet_anonymously:20260725⬡
// FOUNDER 20260725, his words: "Why the fuck are we using a shared key. Remove it. And code
// everything (run this deep extensive audit) towards the per seat model. Bitch it helps us
// audit bleeds and switch shit easy! Per key isn't a backup it's a necessary!"
//
// One shared OPENROUTER_API_KEY answered 401 that morning and took her whole voice down for
// hours while ten funded per-seat keys sat alive and untouched. The bigger half of his point
// is ATTRIBUTION: PRESS scans on a tick, so it is exactly the kind of quiet, repeating spend
// that a shared wallet hides.
//
// PRESS has no seat of its own in pai/core/seat.map.js yet, and that paired map is not this
// file's to invent. PRESS therefore requires an explicitly named seat and that seat's own
// key. It never falls through to a shared wallet. Missing seat, missing named key, or a
// non-OpenRouter seat returns zero candidates and zero spend.
var _seatMap = require('../core/seat.map.js');
function pressScanConfig() {
  var name = String(process.env.PRESS_SCAN_SEAT || '').trim();
  if (!name) return null;
  var s = _seatMap.seat(name);
  if (!s || s.provider !== 'openrouter' || !s.keyEnv) return null;
  var key = _seatMap.sanitizeKey(process.env[s.keyEnv]);
  if (!key) return null;
  return { seat:s.seat, key:key, model:String(process.env.PRESS_SCAN_MODEL || s.model || '').trim() };
}
function pressScanIdentity(hamUid,interests,moment) {
  var ham=String(hamUid||'').trim().toUpperCase();
  if (!ham) return null;
  var instant=String(moment&&moment.now_iso||new Date().toISOString());
  var digest=crypto.createHash('sha256').update(JSON.stringify([
    ham,instant,Array.isArray(interests)?interests:[]
  ])).digest('hex');
  return 'press.scan.'+digest;
}
function pressScanAttribution(options,config) {
  var input=options||{};
  var ham=String(input.hamUid||input.ham_uid||'').trim().toUpperCase();
  var cycle=String(input.cycleId||input.cycle_id||'').trim();
  var request=String(input.requestId||input.request_id||'').trim();
  if (!ham||!cycle||!request||!config||!config.seat) return null;
  return {ham_uid:ham,cycle_id:cycle,request_id:request,component:'press.scan',
    seat:config.seat,owner_node_id:'station.press',target_wonder_id:'wonder.anu',
    service_id:String((input.env||process.env).RENDER_SERVICE_ID||
      (input.env||process.env).ANEW_SERVICE_ID||'').trim()};
}
async function scanExternal(interests,options) {
  try {
    var clean=(Array.isArray(interests)?interests:[]).map(function(v){return String(v||'').trim();}).filter(Boolean).slice(0,5);
    if (!clean.length) return [];
    var config=pressScanConfig();
    if (!config || !config.model) return [];
    var attribution=pressScanAttribution(options,config);
    if (!attribution) return [];
    var q = 'latest news ' + clean.join(', ');
    var body = {
      model: config.model,
      messages: [{ role: 'user', content:
        'List up to 6 recent, real news headlines relevant to: ' + q +
        '. One per line, headline then " -- " then a one-line why. Only real, recent items.' }],
      plugins: [{ id: 'web' }],
      max_tokens: 500
    };
    // \u2b21B:press.scan:FIX:web_scan_hop_guarded_through_provider_boundary:20260719\u2b21
    // The scan is the ONE sanctioned external hop (OpenRouter web plugin, an approved host).
    // Guard it: if the boundary considers the host banned, refuse rather than call. The global
    // provider.boundary install already reroutes banned chat hosts; this is defense in depth so
    // PRESS never becomes the rogue door.
    var endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    try { var pb = require('../core/provider.boundary.js');
      if (pb && pb.isBannedChatCall && pb.isBannedChatCall(endpoint)) return []; } catch (e) {}
    try { require('../core/provider.boundary.js').install({
      receiptStore:options&&options.receiptStore,env:options&&options.env,
      agentFindCapability:options&&options.agentFindCapability
    }); } catch (eInstall) { return []; }
    var r = await require('../core/spend.guard.js').withAttribution(attribution,function () {
      return fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
      }).then(function (x) { return x.json(); });
    });
    var txt = (((r.choices || [])[0] || {}).message || {}).content || '';
    return txt.split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 8; }).slice(0, 6);
  } catch (e) { return []; }
}

// The organ: given the HAM's interests, the current moment, and the raw candidates, decide
// which items TRULY matter to this HAM right now, deduped against what was already surfaced.
// Silence over noise: if nothing matters, return []. Judgment routes through the ladder.
async function judgeRelevance(hamUid, moment, candidates, alreadySeen) {
  if (!candidates.length) return [];
  try {
    var sys = 'You are PRESS, the news surveillance organ for one person. From the candidate ' +
      'headlines, return ONLY the ones that genuinely matter to THIS person right now, as a ' +
      'JSON array of {headline, why_it_matters, source, freshness}. It is ' + moment.day_name +
      ' ' + moment.part_of_day + '. Prefer fresh, timely items. If NONE genuinely matter, ' +
      'return []. Never invent. Already surfaced (do not repeat): ' +
      // ⬡B:press.judge_relevance:FIX:no_second_cut_on_top_of_the_query_bound:20260815⬡
      // recentlySurfaced's own query already bounds this list to 20 rows; re-slicing to the
      // same 20 here was still a coder deciding the ceiling twice.
      JSON.stringify(alreadySeen || []);
    var out = await ladder.deliberate(persona.voicePrompt(sys + NARRATION_FENCE), candidates.join('\n'),
      { json: true, max_tokens: 700, timeout: 30000 });
    var text = out && out.content != null ? out.content : '';
    var arr = JSON.parse(String(text).replace(/```json|```/g, '').trim());
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch (e) { return []; }
}

// Entrance. Surface the news that matters for this HAM right now. Consumes NOW.
async function surfaceNews(hamUid, interests, options) {
  options=options||{};
  var chosen=Array.isArray(interests)?interests:defaultInterests();
  chosen=chosen.map(function(v){return String(v||'').trim();}).filter(Boolean).slice(0,5);
  if (!chosen.length) return { moment:null, items:[], reason:'interests_unconfigured' };
  var moment = options.moment || await nowStation.assembleNow(hamUid);      // consume NOW, no twin
  var seen = await recentlySurfaced(hamUid);
  var scanIdentity=pressScanIdentity(hamUid,chosen,moment);
  var candidates = await scanExternal(chosen,{hamUid:hamUid,cycleId:scanIdentity,
    requestId:scanIdentity});
  var items = await judgeRelevance(hamUid, moment, candidates, seen);
  for (var i = 0; i < items.length; i++) { stampItem(hamUid, items[i], moment).catch(function () {}); }
  return { moment: moment, items: items };  // items may be [] -- silence over noise
}

function defaultInterests() {
  // True-zero template: interests come from the world or the triggering signal.
  return String(process.env.PRESS_INTERESTS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// ⬡B:press.recently_surfaced:FIX:every_row_names_its_writer:20260815⬡ Founder ruling
// 20260815, the pen on her mind: doctrine-correct fallback for a source-less row is
// "(no writer stamp on the row)", never an invented writer name.
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
  return '[written by ' + writer + '] ' + boundSummary(b && b.summary);
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

async function recentlySurfaced(hamUid) {
  try {
    var url = _bu() + '/rest/v1/' + _tbl() +
      '?select=summary,source&ham_uid=eq.'+encodeURIComponent(String(hamUid))+
      '&source=ilike.press.station.item.' + encodeURIComponent(String(hamUid).toLowerCase()) + '*' +
      '&order=id.desc&limit=20';
    var r = await fetch(url, { headers: {
      apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema()
    }, signal: AbortSignal.timeout(8000) }).then(function (x) { return x.json(); });
    return (Array.isArray(r) ? r : []).map(fenceLine);
  } catch (e) { return []; }
}

async function stampItem(hamUid, item, moment) {
  try {
    var bead = {
      ham_uid: hamUid, agent_global: 'PRESS', stamp_type: 'SURFACE',
      acl_stamp: '\u2b21B:press.item:SURFACE:news_surfaced:' +
        moment.now_iso.slice(0, 10).replace(/-/g, '') + '\u2b21',
      source: 'press.station.item.' + hamUid,
      summary: '[PRESS] ' + String(item.headline || '').slice(0, 120),
      importance: 5, spawned_by: 'press.station.' + hamUid,
      content: JSON.stringify(item)
    };
    await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json',
        'Content-Profile': _schema(), 'Accept-Profile': _schema(), Prefer: 'return=minimal' },
      body: JSON.stringify(bead), signal: AbortSignal.timeout(8000)
    });
  } catch (e) { /* best-effort notes */ }
}

module.exports = { surfaceNews: surfaceNews, scanExternal: scanExternal, judgeRelevance: judgeRelevance,
  pressScanConfig:pressScanConfig,pressScanIdentity:pressScanIdentity,
  pressScanAttribution:pressScanAttribution,defaultInterests:defaultInterests };
