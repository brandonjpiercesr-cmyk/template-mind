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

// How often the autonomous cycle self-wakes. Env-tunable; never hardcoded to one
// value. ⬡B:cycle.runner:FIX:safe_default_cadence_cost_audit:20260722⬡ The default
// was 3 minutes (480 full PAI ticks/day); the live service already runs 1 hour via
// AUTONOMOUS_INTERVAL_MS=3600000, but a wiped or missing env var silently restored
// the 3-minute burn (audit P0-3/P1-3 configuration-loss hazard). The code default
// now matches the founder's live cadence, so losing the env var costs nothing.
const INTERVAL_MS = parseInt(process.env.AUTONOMOUS_INTERVAL_MS || '3600000', 10);

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

// ⬡COLD:wake:become:AUTONOMOUS_CYCLE_WONDER:20260723⬡
// ⬡B:cathy.shadow.cold_audit:COLD_AUDIT:template_cycle_hourly_self_wake_9ee82216:20260723⬡
// CATHY.SHADOW cold audit bounded safety (COLD-TEMPLATE-CLOCK-0020/0021): the born-world
// env check already holds newborn-zero (an unborn template spends nothing), but a wiped or
// mis-set AUTONOMOUS_INTERVAL_MS could still drive the paid PAI cycle far faster than the
// founder's one-hour cadence. Two bounded guards close that without stopping the live
// cadence: a per-window tick ceiling caps how many autonomous wakes can spend in a rolling
// window, and each tick carries an interval-bucketed idempotency key so a restart maps to
// the same key and downstream can refuse to repurchase a consumed wake. The full become --
// waking only from a durable consumed signal or a governed cadence ruling in the ONE brain
// -- is owned by AUTONOMOUS_CYCLE_WONDER (CODA). The live one-hour cadence sits far under
// any sane ceiling, so a born, provisioned world is never slowed.
const TICK_CEILING = parseInt(process.env.AUTONOMOUS_TICK_CEILING || '4', 10);
const TICK_WINDOW_MS = parseInt(process.env.AUTONOMOUS_TICK_WINDOW_MS || '3600000', 10);
let _windowStart = Date.now();
let _windowTicks = 0;
function tickBudgetOk() {
  const now = Date.now();
  if (now - _windowStart >= TICK_WINDOW_MS) { _windowStart = now; _windowTicks = 0; }
  if (_windowTicks >= TICK_CEILING) return false;
  _windowTicks++;
  return true;
}
// Interval-bucketed key: two ticks in the same interval bucket (e.g. across a restart)
// share one key, so a durable consumer can dedupe a repurchased wake. Identity is env-only.
function cycleKey() {
  const bucket = Math.floor(Date.now() / (INTERVAL_MS || 3600000));
  return 'cycle:' + (HAM || 'unborn') + ':' + bucket;
}
let _lastWallDigest = null;
function wallDigest(w) {
  try { return require('crypto').createHash('sha256').update(JSON.stringify(w)).digest('hex'); }
  catch (e) { return null; }
}

async function tick() {
  if (running) { console.log('[cycle.runner] previous tick still running, skipping'); return; }
  if (!HAM || !BANK || !KEY) { console.log('[cycle.runner] unborn: missing world env, idling'); return; }
  if (!tickBudgetOk()) { console.log('[cycle.runner] tick ceiling reached for window, resting (zero spend)'); return; }
  running = true;
  const started = Date.now();
  ticks++;
  try {
    const { runPAI } = require('./pai/core/tool.loop.js');
    // ⬡COLD:act:tag:AUTONOMOUS_CYCLE_WONDER:20260723⬡
    // ⬡B:cathy.shadow.cold_audit:COLD_AUDIT:template_hourly_full_pai_tick_42fe9d78:20260723⬡
    // CATHY.SHADOW cold audit (COLD-TEMPLATE-CLOCK-0021, verdict tag): the full PAI work
    // is real WORK -- it just hung off a timer rather than one consumed signal. It now
    // carries this tick's interval-bucketed cycle key so downstream spend reconciles to one
    // wake and a restart cannot silently repurchase it; the per-window ceiling above bounds
    // how often it can pay. Consuming an exact durable signal before this call is owned by
    // AUTONOMOUS_CYCLE_WONDER (CODA).
    // AUTONOMOUS channel: the cook's confidence threshold favors waking (B4).
    const _cycleKey = cycleKey();
    const out = await runPAI(HAM, WAKE, 'autonomous',
      { council_context: { mode: 'autonomous' }, autonomous: true, cycleKey: _cycleKey, idempotencyKey: _cycleKey },
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
    // \u2b21COLD:act:tag:SPAN_WONDER:20260723\u2b21
    // \u2b21B:cathy.shadow.cold_audit:COLD_AUDIT:template_unconditional_span_thought_3fa24872:20260723\u2b21
    // CATHY.SHADOW cold audit (COLD-TEMPLATE-CLOCK-0022, verdict tag): SPAN's paid
    // deliberation ran on EVERY tick even when the wall never changed, and a fabricated
    // fallback wall could trigger it with no real provenance. Bounded safety: SPAN runs only
    // on a real wall whose mechanical digest changed since the last consumed tick. An
    // unchanged wall or a missing/fabricated wall costs zero SPAN model calls (ok:false over
    // hollow provenance). SPAN's own component budget and durable cross-restart digest
    // consumption are owned by SPAN_WONDER (CODA).
    try {
      var _wall = (out && out.wall) || (out && out._fcw) || null;
      if (!_wall) {
        console.log('[cycle.runner] SPAN skipped: no exact wall provenance this tick');
      } else {
        var _dg = wallDigest(_wall);
        if (_dg && _dg === _lastWallDigest) {
          console.log('[cycle.runner] SPAN skipped: wall digest unchanged (zero spend)');
        } else {
          var _sv = await span.run(_wall, HAM);
          _lastWallDigest = _dg || _lastWallDigest;
          console.log('[cycle.runner] SPAN ' + (_sv.updated ? 'updated version -> ' + (_sv.versionId || '?') : 'kept version') +
            (_sv.reason ? ' (' + _sv.reason + ')' : ''));
        }
      }
    } catch (e) {
      console.log('[cycle.runner] SPAN error: ' + e.message);
    }
    // ⬡B:cycle.runner:BUILD:autonomous_build_arm_reconnected_drain_each_tick:20260719⬡
    // WONDER DOCTRINE: reconnect her AUTONOMOUS BUILD ARM. She plans autonomously
    // (CODA/SPAN queue span.task.BUILD_* beads = her real roadmap), but the
    // dispatch-to-builder was disconnected: this cycle self-scanned and let SPAN
    // read the wall, yet never handed a queued build to the coder. SPAN sequenced
    // the fix (founder governance: SPAN assigns): CODA leads, CANEW builds through
    // the drain, CANON grades. So each tick, after the cook and SPAN, we force one
    // drain pass on CANEW: it pulls the next claimed build task from the queue,
    // builds it (through its game_console / cook-off), CANON grades, it ships. The
    // drain is idempotent and cheap -- it returns {open:0,drained:0} when the queue
    // is empty, so a quiet tick costs nothing. This closes the loop the founder
    // remembers: she writes her own list AND builds it. The founder's direct word
    // still overrides everything; this only runs the autonomous default.
    try {
      var _drainUrl = process.env.CANEW_DRAIN_URL || 'https://canew.onrender.com/canew/drain';
      var _dr = await fetch(_drainUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'cycle.runner.autonomous', ham: HAM }),
        signal: AbortSignal.timeout(30000)
      }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
      if (_dr && (_dr.drained || _dr.open)) {
        console.log('[cycle.runner] build drain: open=' + (_dr.open || 0) + ' drained=' + (_dr.drained || 0));
      }
    } catch (eDrain) {
      console.log('[cycle.runner] build drain error: ' + eDrain.message);
    }
    // ⬡B:cycle.runner:BUILD:proactive_sweep_fires_the_department_each_tick:20260719⬡
    // THE MISSING WIRE. The proactive agents (DAWN/HUNCH/BURST/GHOST/PRESS/SAGE) were built
    // but nothing called them -- shelf-ware. Now, after the cook + SPAN + build drain, the
    // proactive sweep runs the department per each agent's real cadence (each agent self-gates
    // and closes its own loop). Guarded + fails open so it never breaks a tick.
    try {
      var _sweep = require('./pai/stations/proactive.sweep.js');
      var _pr = await _sweep.sweep(HAM);
      if (_pr && _pr.ran && _pr.ran.length) {
        console.log('[cycle.runner] proactive sweep ran: ' + _pr.ran.join(', '));
      }
    } catch (eSweep) {
      console.log('[cycle.runner] proactive sweep error: ' + eSweep.message);
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
  // ⬡COLD:wake:become:AUTONOMOUS_CYCLE_WONDER:20260723⬡
  // ⬡B:cathy.shadow.cold_audit:COLD_AUDIT:template_cycle_hourly_self_wake_9ee82216:20260723⬡
  // CATHY.SHADOW cold audit (COLD-TEMPLATE-CLOCK-0020, verdict become): a process-owned
  // clock, not a durable signal, owns when the PAI mind wakes. The founder's LIVE world
  // relies on this cadence, so the timer stays; every wake it fires now passes through the
  // born-world env check (newborn-zero held), the per-window tick ceiling, and an
  // interval-bucketed idempotency key (see tick() above). The full become -- waking only
  // from a consumed real signal or a governed cadence ruling in the ONE brain, with REST as
  // a first-class no-work outcome -- is owned by AUTONOMOUS_CYCLE_WONDER (CODA).
  // first tick shortly after boot, then on the interval
  setTimeout(tick, 15000);
  setInterval(tick, INTERVAL_MS);
});
