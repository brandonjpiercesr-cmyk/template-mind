# PHASE 7 — LOGFUL EXIT AUDIT (void vs. durable exits)
### ⬡B:clair.phase7:AUDIT:logful_exit_void_vs_durable:20260722⬡
### Lineage FOUNDER>CLAUDETTE. CLAIRE's Phase 7 deliverable (the corpus-wide exit audit; A'NU/CODA builds LOGFUL). Evidence-based — every finding cites a real `file:line` in `anew`. Seeds CODA's LOGFUL fix queue.

---

## HEADLINE (good news)
Contrary to the roadmap's worry, `anew` is **strongly LOGFUL-disciplined**. Nearly every *wired, live* scheduled job and action route stamps a bead / persists a sensor event / returns into the PAI cycle. **No wired, live, action-taking route acts and records nothing.** The exemplary pattern is `core/reach/cycle.handoff.js` + `core/reach/incident.intake.js` (candidate → done beads with read-back verification). Durable primitives confirmed live: `logful/index.js:23` `logfulStore`, `core/brain.client.js:54` `writeBead`, `core/coda/sensor.store.js` `persistEvent`, `advisors/advisor.exit.js` `surfaceToDesk`.

So Phase 7 is NOT a corpus-wide rescue — it's a **targeted sweep of a few dead modules and a subtle "silent watchdog" class.**

## FINDING A — the void exits (all are ALSO dead/unwired — low blast radius today, worst offenders if ever wired)
These are the definitive code examples of the LOGFUL anti-pattern — a scheduled job that decides something and drops it to `console.log`. CODA: **delete, or give a durable exit before wiring.**
1. **`core/turn.js:57`** — an every-60s repo monitor (orphan/phantom-commit/uncommitted checks) that emits **only** `console.log` (:29,:39,:50). No requirer found anywhere (`index.js` auto-loaders only load `routes/`); its ":2" claim of "dynamic string load" is unverified — **probably never runs.** Ironically, the module that detects orphans is one. Should write a `MONITOR`/`ALERT` bead per detection (like `routes/engine.watch.routes.js:60`).
2. **`core/diagnostic/loop.js:31`** — every-60s heartbeat that logs a UUID and nothing else; its own header (:6–11) admits "no natural caller." Orphan, never started. Delete, or make it a `PAI_HEARTBEAT`-style liveness bead.
3. **`core/cycle.js:46`** — every-180s empty-stub cycle (`// cycle logic here`, :13–27), records nothing; `startCycle` called nowhere. Dead scaffold. Delete or implement + stamp.

## FINDING B — the "silent watchdog" class (needs owner confirmation — the real subtlety)
Monitors that write a bead **only when they detect a problem**, and write nothing on a healthy pass AND have no self-heartbeat. If the monitor itself dies, nothing records that the monitoring stopped — the exact "silent device" gap, one level up.
1. **OMI silence watchdog** — `core/pai/runaway.sweep.js:135` `checkOmiSilence` (live, `index.js:591`): writes `SECURITY_FLAG` only when OMI is silent (:150); healthy path (:143) writes nothing; no self-heartbeat. Its sibling `sweep()` stamps `SECURITY_SWEEP` every run — do the same here ("watchdog alive" bead).
2. **PAI heartbeat has NEVER run — it is half-built, not just unwired** (deeper diagnosis, 20260722). Three independent breaks:
   - **Boot path dead:** `index.js:513` `heartbeat.startHeartbeat()` targets the **retired** `core/heartbeat.js`, which `require`s missing `./ABAHAM`/`./MemoryBank`/`./HealthMonitor` (:10–12) → throws at require → swallowed by the boot try/catch.
   - **Export bug:** the real `core/pai/heartbeat.js` does `module.exports = Heartbeat` — it exports the **class**, but its only caller `routes/pai.routes.js` uses it as a **singleton instance** (`pai.start()`, `pai.status()`, `pai.stop()`). So even the manual `POST /pai/start` throws `pai.start is not a function`.
   - **Incomplete:** the class defines only `constructor`, `start(ham)`, `stop()` — there is **no `status()`**, yet `routes/pai.routes.js:7` serves `GET /pai/status` → `pai.status()`, which is undefined.
   **Net: the PAI heartbeat/watchdog has never beaten by any path.** This is NOT a wiring one-liner — it is a half-built organ. CODA should rebuild it deliberately (export a singleton, add `status()`, verify `start()`'s pulse/scan, then auto-start IS_PRIMARY-gated like `outreach`/`heartbeat.scheduler`), then verify live. **I deliberately did NOT auto-start it this run** — enabling never-run code on the live primary service is exactly the "untested code to prod" line, and a half-built pulse loop belongs in a reviewed rebuild, not a 4am auto-enable.
3. **`routes/engine.watch.routes.js:131`** boot self-sweep — screams a durable ALERT on a break (:135→:60) but a **clean** boot sweep only `console.log`s: no proof the post-deploy sweep ran and passed.

## FINDING C — legacy fire-and-forget (likely dead; confirm)
- **`core/reach/reach.twin.js:19`** `processIntents` — reads `REACH_INTENT` beads and fires each to `EANEW_URL/eanew/ask` **fire-and-forget** (:33, no awaited/recorded result, no dedup, re-fires every 60s). Records nothing itself. Mitigating: `twin.start()` is **never called** (dormant), and it's dated 20260621 — likely superseded by `cycle.handoff`/`incident.intake` (20260717–20). Confirm dead vs. intended; if dead, delete.

## CONFIRMED DURABLE (the healthy majority — brief)
Every material run stamps: `core/pai/heartbeat.js` (PAI_HEARTBEAT/FINDING), `core/pai/runaway.sweep.js` (SECURITY_SWEEP), `core/deploy.sentinel.js` + `core/render.failure.sensor.js` (persistEvent + surfaceToDesk), `core/model.health.js` (health/credit), `core/fcw/repair.js` (FCW_STATE), `core/keys/auto_backup.js` (KEY_BACKUP), `core/anu.downtime.js` (DOWNTIME_RESULT), `core/advisor.scheduler.js` (KNOCK + RESULTs), `core/veer/veer.jobs.js`, `core/heartbeat.scheduler.js` (durable task queue), `core/session.wonder.js` (SESSION_CALLED/FAILED/UNCERTAIN — every outcome), `core/agents/contributors.write.js`, `reach/reach.department.js` (REACH_AUDIT), `routes/reach.out.routes.js` (stampReach), `routes/selfrepair.routes.js` (CHANGE_REQUEST), `core/inbox.zero.js`, `core/selfReminders.js`. The read-only stations (Keeper/Decoder/Lineage/Retrieve/CCWA) feed the cycle — not void by design.

## RECOMMENDATION FOR CODA (Phase 7 owner)
1. Verify Finding B2 first — if the PAI heartbeat/watchdog truly isn't auto-starting, that's the highest-value fix (repoint `index.js:513` off the retired `core/heartbeat.js` to the real `core/pai/heartbeat.js` start, or auto-start on boot).
2. Give the silent watchdogs (B1, B3) a periodic "alive" bead so their own death is visible.
3. Delete or durably-exit the three dead void modules (A1–A3) and the dormant reach.twin (C) — decide dead vs. keep.
No corpus-wide LOGFUL rescue is needed; the discipline is already there.
