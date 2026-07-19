// ⬡B:cycle.runner:BUILD:pai_autonomous_cycle_its_own_traceable_service_B1:20260718⬡
// WONDER DOCTRINE build B1 (A'NU ruled it supersedes B3). The infrastructure law
// (doctrine 383016): "the PAI autonomous cycle had BETTER BE ITS OWN RENDER SERVICE
// so we can trace it." Per HAM, BIRTH may run several of these.
//
// This is NOT a new brain. It imports the SAME runPAI closure the reach web service
// (mind.entry.js /cycle) uses -- byte-identical engine, one cook, no twin. The only
// difference is HOW it is triggered: this runner self-wakes on an interval with the
// AUTONOMOUS channel, whose confidence threshold FAVORS waking the full cook (the B4
// per-channel mechanic: autonomous/CARA/TAP/IMAN favor the cook, live phone favors
// fast FIND). It runs as its own Render background service so the autonomous cook has
// its own logs, its own restart line, its own traceable heartbeat, separate from the
// reach web service that answers humans.
//
// The provider boundary installs first here too, exactly as in mind.entry, so every
// model call this cook makes still routes through the one ladder and never a banned host.
require('./pai/core/provider.boundary.js').install();
const span = require('./pai/stations/span.station.js');

const HAM  = process.env.HAM_UID;
const BANK = process.env.MEMORY_BANK_URL;
const KEY  = process.env.MEMORY_BANK_KEY;

// How often the autonomous cycle self-wakes. Default 3 minutes, matching the AIR
// heartbeat cadence already in the brain. Env-tunable; never hardcoded to one value.
const INTERVAL_MS = parseInt(process.env.AUTONOMOUS_INTERVAL_MS || '180000', 10);

// The autonomous wake prompt. The cook decides for itself whether anything is worth
// doing this tick; on the autonomous channel the confidence-to-act is set EASIER so
// the cycle is encouraged to run rather than stay asleep. This is a standing self-scan,
// not a fixed instruction: "look at the wall, is there anything I should act on now."
const WAKE = process.env.AUTONOMOUS_WAKE_PROMPT ||
  'Autonomous cycle tick. Read the master FCW wall and your recent cycle. Is there ' +
  'anything from your own thinking worth acting on right now -- a surface to raise, a ' +
  'waypoint approaching, a follow-up owed? If nothing is worth acting on, stay quiet.';

let running = false;   // never overlap ticks -- one cook at a time
let ticks = 0;

async function tick() {
  if (running) { console.log('[cycle.runner] previous tick still running, skipping'); return; }
  if (!HAM || !BANK || !KEY) { console.log('[cycle.runner] unborn: missing world env, idling'); return; }
  running = true;
  const started = Date.now();
  ticks++;
  try {
    const { runPAI } = require('./pai/core/tool.loop.js');
    // AUTONOMOUS channel: the cook's confidence threshold favors waking (B4).
    const out = await runPAI(HAM, WAKE, 'autonomous',
      { council_context: { mode: 'autonomous' }, autonomous: true },
      [], null);
    const ok = !!(out && out.ok);
    console.log('[cycle.runner] tick ' + ticks + ' ' + (Date.now() - started) + 'ms ok=' +
      ok + ' reason=' + (out && out.reason || '-') + ' tools=' +
      JSON.stringify(out && out.tools_used || []));
    // \u2b21B:cycle.runner:BUILD:span_reads_the_wall_and_updates_its_version_B2:20260718\u2b21
    // WONDER DOCTRINE B2: after the cook, SPAN -- the Independent Thinking Station --
    // gets its chance to READ the master FCW wall this tick assembled and DECIDE if it
    // has anything worth UPDATING as its version on that wall. This is the general law
    // SPAN demonstrates: every station reads the wall, then updates its own version.
    // SPAN is an organ (it thinks through the ladder); a quiet no-update is valid.
    try {
      var _wall = (out && out.wall) || (out && out._fcw) || { hamUid: HAM, contributors: {}, question: WAKE };
      var _sv = await span.run(_wall, HAM);
      console.log('[cycle.runner] SPAN ' + (_sv.updated ? 'updated version -> ' + (_sv.versionId || '?') : 'kept version') +
        (_sv.reason ? ' (' + _sv.reason + ')' : ''));
    } catch (e) {
      console.log('[cycle.runner] SPAN error: ' + e.message);
    }
    // Silence over hollow: if the cook decided nothing was worth acting on, that is a
    // valid quiet tick, not a failure. Nothing is sent; the Overseer routes anything
    // important from inside the cook itself, exactly as on any other channel.
  } catch (e) {
    console.log('[cycle.runner] tick ' + ticks + ' error: ' + e.message);
  } finally {
    running = false;
  }
}

// A tiny health surface so the service is traceable/pingable without waking a cook.
const express = require('express');
const app = express();
app.get('/health', function (req, res) {
  res.json({ ok: true, service: 'cycle.runner', ham: HAM || null,
    ticks: ticks, running: running, interval_ms: INTERVAL_MS,
    born: !!(HAM && BANK && KEY) });
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, function () {
  console.log('[cycle.runner] up on ' + PORT + ' for HAM ' + (HAM || '(unborn)') +
    ', autonomous cook every ' + INTERVAL_MS + 'ms');
  // first tick shortly after boot, then on the interval
  setTimeout(tick, 15000);
  setInterval(tick, INTERVAL_MS);
});
