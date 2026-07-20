// ⬡B:advisors.advisor-router:ROUTE:ham_scoped_discovery:20260702⬡
// Advisor router — dispatches /advisors/:station/c3run to the station's own module.
// ABAHAM DOOR: ATMOSPHERE resolves the requester; CHANNEL PATH TO A HAM: the
// shared public PAI finalizer owns the only human-facing station answer.
// FIX 20260702: VALID_STATIONS was a hardcoded array of one founder's four client
// names. That fails the ANYHAM test outright — a second HAM with different clients
// could never use this route. Stations are now discovered per-HAM from real SCW
// beads in the brain (source = scw.<world>.<hamUid>.*), so any HAM's real client
// roster resolves dynamically. The founder's four still work today because their
// SCWs are real rows, not because their names are typed into this file.
// EBC firewall: each station module reads ONLY its own world.
'use strict';
// ⬡B:advisors.advisor-router:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}


var fs = require('fs');
var path = require('path');
var publicPAI = require('../core/pai.public.finalizer.js');
var NON_STATION_FILES = { 'advisor-router.js': true, 'fcw.loader.js': true, 'master-advisor.js': true };
var stationModuleCache = {}; // worldSlug -> required module, process-lifetime only

function realStationSlugs() {
  // Ground truth: a "world" is a station module that actually exists on disk,
  // not a guess parsed out of an SCW source string. Fixes 20260702: the prior
  // version split on underscore to separate a world from a sub-client (e.g.
  // gmg_art_is_my_drug), which incorrectly truncated the real world
  // "mh_action" down to "mh". Real files are unambiguous.
  try {
    return fs.readdirSync(__dirname)
      .filter(function(f) { return f.endsWith('.js') && !NON_STATION_FILES[f]; })
      .map(function(f) { return f.replace(/\.js$/, ''); });
  } catch (e) { return []; }
}

async function discoverStations(hamUid) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  var real = realStationSlugs();
  if (!_bu() || !_bk() || !hamUid) return [];
  var hdrs = { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() };
  var url = _bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.SCW&source=like.scw.*.' + encodeURIComponent(hamUid) + '.*&select=source&order=created_at.desc&limit=200';
  var rows = await fetch(url, { headers: hdrs }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; });
  var found = {};
  (rows || []).forEach(function(r) {
    var parts = String(r.source).split('.');
    if (parts.length < 4 || parts[0] !== 'scw') return;
    var worldSlug = parts[1];
    // A world counts only if it matches a real station file exactly, OR is a
    // real station name followed by _ and a sub-client slug (gmg_art_is_my_drug).
    real.forEach(function(stationName) {
      if (worldSlug === stationName || worldSlug.indexOf(stationName + '_') === 0) {
        found[stationName] = true;
      }
    });
  });
  return Object.keys(found);
}

function loadStationModule(station) {
  if (stationModuleCache[station]) return stationModuleCache[station];
  try {
    var mod = require('./' + station);
    stationModuleCache[station] = mod;
    return mod;
  } catch (e) { return null; }
}

module.exports = function(app) {

  // GET /advisors/worlds?hamUid=  — the real, per-HAM roster. No hardcode.
  app.get('/advisors/worlds', async function(req, res) {
    var hamUid = String(req.query.hamUid || '');
    if (!hamUid) return res.status(400).json({ ok: false, reason: 'hamUid required' });
    var worlds = await discoverStations(hamUid);
    res.json({ ok: true, hamUid: hamUid, worlds: worlds, count: worlds.length });
  });

  app.get('/advisors/:station/health', async function(req, res) {
    var station = String(req.params.station || '').replace(/[^a-z_]/g, '');
    var hamUid = String(req.query.hamUid || '');
    var worlds = hamUid ? await discoverStations(hamUid) : [];
    if (hamUid && worlds.indexOf(station) === -1) return res.status(404).json({ ok: false, reason: 'unknown station for this ham' });
    res.json({ ok: true, station: station, status: 'active', ts: Date.now() });
  });

  app.post('/advisors/:station/c3run', async function(req, res) {
    try {
      var body = req.body || Object.create(null);
      var station = String((req.params || {}).station || '').replace(/[^a-z_]/g, '');
      var identity = await publicPAI.resolveBodyHam(Object.assign({}, body, {
        hamUid:body.hamUid || body.ham_uid || req.query.hamUid
      }));
      if (!identity.ok) return res.status(identity.reason === 'ham_uid_required' ? 400 : 401)
        .json({ ok:false, reason:identity.reason });
      var hamUid = identity.hamUid;
      var worlds = await discoverStations(hamUid);
      if (worlds.indexOf(station) === -1) return res.status(404).json({ ok: false, reason: 'unknown_station_for_ham' });
      var mod = loadStationModule(station);
      if (!mod || typeof mod.runCycle !== 'function') return res.status(404).json({ ok: false, reason: 'no station module: ' + station });
      var intent = body.message || body.intent || '';
      // \u2b21B:advisors.advisor_router:FIX:raw_ask_before_folding:20260711\u2b21
      // Bug caught live: CORE_DIRECTIVE/self-reminder/room-order text folds INTO
      // intent below, so a standing cycle with no real founder ask still arrived at
      // each advisor looking 'substantial' -- the teeth gate fired on folded routine
      // context, not a real ask. rawAsk is captured here, before any folding, and
      // passed through so advisors can gate teeth on what the founder actually typed.
      var rawAsk = intent;

      // ⬡B:advisors.advisor_router:WIRE:self_reminder_consumption:20260708⬡
      // Universal self-reminder fire point: every station cycle passes through here, so
      // one wire covers all four advisors and every future station -- no per-advisor copy.
      // Pull this station's DUE self-reminders, fold their action into the intent so the
      // station does the work through its normal cycle, then mark each fired after.
      var selfRem = require('../core/selfReminders.js');
      var agentGlobal = station.toUpperCase() + '_ADVISOR';
      var dueReminders = hamUid ? await selfRem.dueSelfReminders(agentGlobal, hamUid) : [];
      if (dueReminders.length) {
        var folded = dueReminders.map(function(d){ return d.action || d.text; }).filter(Boolean).join(' | ALSO: ');
        intent = (intent ? intent + ' ' : '') + 'SELF-REMINDER DUE (act on this now): ' + folded;
      }

      // ⬡B:advisors.router:WIRE:phase4_room_orders_fold:20260709⬡
      // Phase 4 instant communication, wired at the same chokepoint the self-reminder
      // law proved: before a station runs, pending ROOM_ORDERs from its commissioner
      // fold into this cycle's intent (mid-run orders land on the very next wake);
      // after it runs, the station streams a compact digest UP to its room -- the
      // digest-checkpoint upward streaming the founder's 911!! ordered, at ~1.2x
      // token cost instead of raw context mirroring.
      // ⬡B:advisors.router:WIRE:core_directives_anchor:20260710⬡
      // Vitamin Water pt2 law: "advisors are at their best when they have core
      // directives they're progressing towards." Every cycle, the station's standing
      // CORE_DIRECTIVE bead folds into intent FIRST -- the goal anchors the work.
      try {
        var cdq = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.CORE_DIRECTIVE'
          + '&source=like.directive.' + encodeURIComponent(station) + '.*&ham_uid=eq.' + encodeURIComponent(hamUid)
          + '&order=created_at.desc&limit=1&select=summary,content',
          { headers: { apikey: process.env.AIBE_BRAIN_KEY, Authorization: 'Bearer ' + process.env.AIBE_BRAIN_KEY, 'Accept-Profile': _schema() } });
        var cdr = cdq.ok ? await cdq.json() : [];
        if (cdr && cdr[0]) {
          var cdc = {}; try { cdc = JSON.parse(cdr[0].content || '{}'); } catch (eCd) {}
          intent = 'YOUR CORE DIRECTIVE (anchor all work to this): ' + (cdc.directive || cdr[0].summary).slice(0, 400)
            + (intent ? ' || THIS CYCLE: ' + intent : '');
        }
      } catch (eCdq) { /* no directive, cycle runs plain */ }

      var rooms = require('../core/rooms.js');
      var pendingRoomOrders = hamUid ? await rooms.pendingOrders(hamUid, station) : [];
      if (pendingRoomOrders.length) {
        var foldedOrders = pendingRoomOrders.map(function (o) { return o.order; }).filter(Boolean).join(' | ALSO: ');
        intent = (intent ? intent + ' ' : '') + 'COMMISSIONER ORDER (from your room, act now): ' + foldedOrders;
      }

      var result = await mod.runCycle(intent, hamUid, rawAsk);

      // ⬡B:advisors.router:BUILD:universal_actor_every_adviser_every_cycle_20260713⬡
      // THE AUTONOMOUS FIX (founder, sharp): 'anytime you fire something it works -- the
      // issue is what happens when you are NOT pressing the button.' Every adviser must
      // ACT on the autonomous 3-min cycle, not just when directly fired, and not just the
      // LIFE lead. So the ACTOR runs here at the router, universally, for EVERY station on
      // EVERY run: whatever the station just produced becomes 0-3 real proposed actions
      // for A'NEW. Doctrine-safe: still just PROPOSES (PROPOSED_ACTION -> A'NEW -> one
      // cycle acts, with MIMIC-first + anti-flood on the intake side). Universal: works
      // for any HAM's any station (762, 892491, anyone), no hardcoded roster.
      try {
        var _brief = result && (result.answer || result.output || result.summary);
        if (_brief && String(_brief).trim().length > 20) {
          await require('./dispatch.js').actOnBrief(String(station).toUpperCase(), hamUid, String(_brief));
        }
      } catch (eActor) { /* the run always returns even if the actor stalls */ }

      // ⬡B:advisors.router:WIRE:founder_test_send:20260711⬡
      // Founder-authorized capability test. When the run is triggered with send:true,
      // the station's OWN composed output is sent through the real iman.send path.
      // send() hard-locks the recipient to the founder's inbox, so even this
      // placeholder 'to' can never reach a client. This is her doing it end to end;
      // CLAIR only watches. The lock is the client-safety backstop.
      if (body.send === true && result && result.output) {
        try {
          var _compose = require('../board/compose.js');
          var _clean = await _compose.composeCleanEmail(result.output, { world: station });
          if (!_clean.ok) {
            // Silence over hollow: a work-plan dump or an ungrounded email is HELD, not sent.
            result.testSend = { attempted: true, ok: false, held: true, reason: 'held_' + (_clean.reason || 'compose_failed') };
          } else {
            var _iman = require('../reach/iman.js');
            var _subj = String(body.subject || (station.toUpperCase() + ' update'));
            // ⬡B:advisors.router:WIRE:founder_test_email_carries_real_ham_into_imans_pai:20260715⬡
            var _sr = await _iman.send('locked-to-founder-only', _subj, _clean.body, station,
              { founderTest: true, hamUid: hamUid });
            result.testSend = {
              attempted: true,
              ok: !!(_sr && _sr.ok === true),
              recipient: 'founder-only (locked at send)',
              reason: _sr && _sr.reason,
              messageId: _sr && _sr.messageId || null,
              requestId: _sr && _sr.requestId || null,
              cycleId: _sr && _sr.cycleId || null,
              councilProof: _sr && _sr.councilProof || null
            };
          }
        } catch (eSend) { result.testSend = { attempted: true, ok: false, error: eSend.message }; }
      }

      // Upward stream: one compact digest per cycle, then consume the orders.
      try {
        var roomId = 'room.' + station.toLowerCase() + '.standing';
        await rooms.postDigest(hamUid, roomId, agentGlobal,
          'cycle ok=' + (result && result.ok) + (result && result.emailsReviewed != null ? ', reviewed ' + result.emailsReviewed : '')
          + (pendingRoomOrders.length ? ', consumed ' + pendingRoomOrders.length + ' order(s)' : ''),
          'cycle_end');
        for (var ro = 0; ro < pendingRoomOrders.length; ro++) await rooms.markConsumed(pendingRoomOrders[ro]);
      } catch (eRoom) { /* streaming never blocks the cycle */ }

      // EXIT: close each fired self-reminder with a note of the cycle outcome.
      for (var i = 0; i < dueReminders.length; i++) {
        await selfRem.markFired(agentGlobal, hamUid, dueReminders[i].source,
          'fired on cycle; action folded into intent; cycle ok=' + (result && result.ok) +
          (result && result.emailsReviewed != null ? '; reviewed ' + result.emailsReviewed : ''));
      }

      // ⬡B:advisors.advisor_router:GUARD:station_evidence_one_public_pai_exit:20260715⬡
      // runCycle remains the station's internal thinking and action evidence. It
      // never becomes public answer bytes. One canonical PAI turn speaks for the
      // completed cycle and STAMP must read back all nine bound rows first.
      var publicQuestion = String(rawAsk || '').trim()
        ? String(rawAsk) : ('Run the ' + station + ' advisor cycle.');
      var stationEvidence;
      try { stationEvidence = JSON.stringify(result); }
      catch (eEvidence) { stationEvidence = '{"ok":false,"reason":"station_evidence_unserializable"}'; }
      // ⬡B:advisors.advisor_router:FIX:real_findings_lost_in_resynthesis_20260719⬡
      // Founder-caught live, traced end to end before this fix: the station itself
      // (e.g. advisors/gmg.js) was doing real work -- a real Nylas fetch, a real
      // RunPod low-balance alert genuinely present in the inbox -- and composing a
      // real, specific, WRIT-checked answer in result.output. But that real answer
      // was only ever included as one buried field inside a raw JSON.stringify(result)
      // blob, under a generic 'give a grounded answer' instruction. This synthesis
      // pass was dropping the real, specific finding and returning a generic
      // '8 emails, nothing found' summary instead, every time, for every station.
      // Verified live: the station's own output contained the RunPod alert; the
      // public-facing answer did not. Not a data problem, a synthesis problem.
      // Fix, deliberately not the more invasive option (skipping this pass and
      // relaying the station's raw output directly): that would undo the real,
      // separate safety reason this pass exists, keeping raw email bodies and
      // internal object fields out of the human-facing answer, per the GUARD
      // note above. Instead: pull the station's own composed answer out of the
      // evidence blob and put it first, explicit, unmissable, with an instruction
      // that cannot be read as optional.
      var stationOwnAnswer = (result && typeof result.output === 'string' && result.output.trim())
        ? result.output.trim()
        : (result && typeof result.answer === 'string' && result.answer.trim() ? result.answer.trim() : '');
      var deliberationInput = 'A\'NU advisor-station completion turn for "' + station + '". '
        + (stationOwnAnswer
          ? ('THE STATION ALREADY COMPOSED ITS REAL ANSWER BELOW. Use it as your primary source. '
            + 'If it names a specific fact, an alert, a dollar amount, a sender, or a deadline, '
            + 'your answer MUST include that specific fact. Do not replace a specific finding with '
            + 'a generic summary like "nothing found" when the station\'s own answer names something real.\n\n'
            + 'THE STATION\'S OWN COMPOSED ANSWER:\n' + stationOwnAnswer.slice(0, 4000) + '\n\n')
          : '')
        + 'Use the station output only as internal deliberation evidence. Do not expose '
        + 'private model traces, email bodies, or internal object fields. Give the human '
        + 'a direct, grounded answer to their request. If this was a scheduled cycle with '
        + 'no question, report what completed and what remains.\n\n'
        + 'ORIGINAL REQUEST:\n' + publicQuestion.slice(0, 2000) + '\n\n'
        + 'INTERNAL STATION EVIDENCE (full, for anything not already covered above):\n' + String(stationEvidence).slice(0, 12000);
      var finalized = await publicPAI.finalizePublicTurn({
        hamUid:hamUid, envelope:identity.envelope,
        requestId:publicPAI.requestIdFor(req, body), question:publicQuestion,
        deliberationInput:deliberationInput, channel:'portal', world:station,
        priorTurns:Array.isArray(body.priorTurns) ? body.priorTurns : [],
        councilContext:{ mode:'advisor_station', station:station,
          self_reminders_fired:dueReminders.length }
      });
      if (!finalized.ok) return res.status(502).json({ ok:false,
        reason:finalized.reason, requestId:finalized.requestId || null,
        cycleId:finalized.cycleId || null });
      return res.json({ ok:true, station:station, answer:finalized.answer,
        selfRemindersFired:dueReminders.length, requestId:finalized.requestId,
        cycleId:finalized.cycleId, councilProof:finalized.councilProof });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack && e.stack.slice(0, 200) });
    }
  });

  // ⬡B:advisors.advisor_router:WIRE:self_reminder_set_endpoint:20260708⬡
  // Create a self-reminder. Called by A'NU when the founder says "remind yourself in a
  // week to X", or in-process by a station that decides to follow up later. station is
  // the world slug (gmg/bdif/mediators/mh_action); it becomes <STATION>_ADVISOR. fireAt
  // accepts ms-from-now (number) or an ISO date. Founder-world scoped: a self-reminder
  // only writes under the ham that owns it, same isolation as every other per-HAM write.
  app.post('/self-reminder/set', async function(req, res) {
    try {
      var b = req.body || {};
      var station = String(b.station || '').replace(/[^a-z_]/g, '');
      var hamUid = String(b.hamUid || '');
      if (!station || !hamUid) return res.status(400).json({ ok: false, reason: 'station_and_ham_required' });
      var real = realStationSlugs();
      if (real.indexOf(station) === -1) return res.status(404).json({ ok: false, reason: 'unknown station: ' + station });
      var selfRem = require('../core/selfReminders.js');
      var out = await selfRem.setSelfReminder(station.toUpperCase() + '_ADVISOR', hamUid, {
        text: b.text, action: b.action || b.text, fireAt: b.fireAt, surfaceToHam: b.surfaceToHam,
        setBy: b.setBy || 'ANU', why: b.why, importance: b.importance
      });
      res.json(out);
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

};

// ⬡B:advisors.advisor_router:WIRE:helpers_exported_for_consult_advisor_tool:20260713⬡
// Wonder rehaul G2: the cycle needs to consult advisors on demand ("talk to my bdif
// advisor about X"). These two helpers were module-internal, so the cycle could never
// reach a station. Exporting them (the mounter stays the default call shape) lets the
// consult_advisor tool validate the per-HAM roster and run a station's real cycle.
module.exports.discoverStations = discoverStations;
module.exports.loadStationModule = loadStationModule;
