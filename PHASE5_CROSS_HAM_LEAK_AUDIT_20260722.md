# PHASE 5 — CROSS-HAM LEAK AUDIT (the February scar, mapped)
### ⬡B:clair.phase5:AUDIT:cross_ham_bead_read_leak_map:20260722⬡
### Lineage FOUNDER>CLAUDETTE. CLAIRE's Phase 5 deliverable (the breach audit; CATHY leads the RLS migration; A'NU/CODA rules the policy). Evidence-based — every finding cites a real `file:line` in `anew`.

---

## THE SCAR (why this exists)
Feb 2026: "Eric got Brandon's lesson plan; BJ's OMI got Brandon's MAR reports." Cross-HAM private-data bleed. The founder's law: **that must be structurally impossible, not behaviorally avoided.** RLS is not yet enabled, so today the ONLY guard against a cross-HAM read is a `ham_uid=eq.` filter in the query string. This audit maps every place that guard is missing.

## FINDING A — no helper enforces the wall (they ALLOW, they don't REQUIRE)
- **`core/find.js` `find(queries)`** — applies `ham_uid` only if the caller puts it in the query object (find.js:124). Omit it → the query runs cross-HAM. No default, no rejection.
- **`core/brain.client.js` `readBead(filter)`** — pure pass-through; the filter object becomes the query verbatim. ham_uid present only if the caller adds it.
- **`core/brain.client.js` `findBySource(source, hamUid)`** — binds ham_uid only if `hamUid` is truthy; called with one arg it reads cross-HAM.

**Consequence:** a future caller that forgets `ham_uid` silently reintroduces the leak, invisibly. This is exactly why the *structural* fix (RLS) is required — code discipline cannot be the only wall.

## FINDING B — the LIVE leak on the always-on path (FIXED this run)
- **`core/find.js` `findRecentResults`** (was unscoped: `stamp_type=RESULT & importance>=7`, no ham_uid) is consumed by **`core/fcw.builder.js:128`**, the always-on per-turn Memory Bank assembler. Every sibling read in that batch is ham-scoped; this one was not — so another HAM's RESULT summaries (what was said and done) were concatenated into *this* HAM's system prompt on **every turn**. This is the Feb-2026 incident class, live.
- **FIXED (anew, this run):** `findRecentResults(hamUid, limit)` is now ham-scoped and **fail-closed** (no ham → no read, never cross-HAM); the sole caller passes `hamUid`. This closes the always-on leak immediately, ahead of RLS.

## FINDING C — unauthenticated / unscoped cross-HAM read endpoints (the remaining surface — RLS + auth)
These leak on-demand when called. They need `ham_uid` scoping AND request authorization; RLS is the structural backstop. **Owner: CATHY (RLS) + A'NU/CODA (endpoint auth policy).**

| # | file:line | endpoint | what leaks |
|---|-----------|----------|------------|
| 1 | routes/draft.queue.routes.js:28 | `GET /draft/pending` | every HAM's pending **outbound drafts** — recipient, subject, body |
| 2 | routes/command.center.peak.routes.js:110 | `POST /api/brain/search` | free-text search over **all** HAMs' bead summaries (caller-supplied query) |
| 3 | routes/command.center.peak.routes.js:101 | `GET /api/brain/recent` | 20 newest bead summaries across all HAMs (header claims "founder-scoped" but has no ham_uid, no auth) |
| 4 | routes/atmosphere.routes.js:90 | `GET /atmosphere/directory` | **every HAM's phone/email/identifier** (cross-tenant PII aggregation) |
| 5 | routes/ccwa.routes.js:22,28 | `GET /ccwa/feed` | all HAMs' RESULT + MINUTES (conversation content) |
| 6 | routes/brain.mcp.routes.js:64,72 | `POST /mcp/brain` | raw rows (summary/content) across all HAMs when the hamUid arg is omitted |
| 7 | reach/reach.department.js:87 | (internal) | all HAMs' OUTREACH content into an aggregate (counts only — lower severity) |

**Flag for owner confirmation:** `routes/advisor.api.routes.js:283,407` read `ADVISOR_CHAT` by `source=like.advisor.chat.<world>*` — scoped by *world*, not HAM. Safe **iff** an advisor world is a shared org context; a cross-HAM read **iff** a world holds multiple HAMs' private chats. Not verifiable from code alone — needs your ruling.

## FINDING D — the pai-loop sibling-tool guard gap (defense-in-depth)
`find_in_brain` (core/tool.loop.js:1594) re-verifies `args.ham_uid === boundHam` before reading. Its siblings — **get_pending_drafts (1817), request_new_capability (1834), read_reminders (2030), inbox_read (2056)** — filter by `args.ham_uid || hamUid` but do **not** re-verify the match. Not an open leak (still ham-filtered), but the model could steer them to a different ham value. Add the same mismatch guard.

## FINDING E — default-to-founder writes (misattribution, not leak — secondary)
`draft.queue.routes.js:19` (`b.hamUid || FOUNDER_HAM_UID`), `ccwa.portal.routes.js:27` (`|| DEFAULT_HAM_UID`), the peak `/api/brain/store` founder default: a real HAM's write arriving without a hamUid lands under the founder's ham_uid. Fail-closed on missing ham instead.

## WHAT IS CONFIRMED SCOPED (safe today)
The live-cycle organs are clean: **Keeper, Decoder, Lineage, Retrieve, Wonder Wall, CCWA harness** (all built this Great Reset run) every read carries `ham_uid=eq.` and rejects a missing ham. `find_in_brain`, the authorized command-center feed/routes (behind `requireRuntimeHam` + session), three-ray, and the per-HAM portals are scoped. Canon/roadmap/agent-JD-roster reads are global-by-design (shared, non-private). Identity **resolvers** (atmosphere, omi, notify) scan HAM_IDENTIFIER cross-tenant by necessity to map an inbound identifier → HAM (confirm they return only the matched HAM).

## REMEDIATION PRIORITY
1. ✅ **findRecentResults → fcw.builder** (the always-on leak) — FIXED this run.
2. The Finding-C endpoints — ham-scope + authorize (CATHY RLS + CODA endpoint policy). `/draft/pending` and `/atmosphere/directory` first (private content / PII).
3. `/mcp/brain` — require hamUid or gate the endpoint.
4. Finding-D mismatch guards on the four pai-loop tools.
5. **The structural fix (the founder's actual requirement): RLS on every per-HAM table**, keyed to the HAM's identity claim, + per-service scoped keys replacing god-keys, so a forgotten `ham_uid` filter can never leak again — code discipline stops being the only wall. Then the Custodian wonder (Phase 5's mind) probes the walls forever with a non-privileged credential.
