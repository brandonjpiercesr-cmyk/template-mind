# ENVOLVE / template-mind - every coder reads this first

This repo is the **mind-template every world inherits**. What lands here is what a new world starts
with, so the CCWA handshake and the standing laws live here too: every inherited world reads the one
board from its first session.

## THE CCWA COMMAND CENTER HANDSHAKE (mandatory, before anything)
The CCWA Command Center is the one spot every coder reads first and stamps into. It is the
trace-back spine and the clobber firewall. The SessionStart hook has already injected the live
harness into this session - read it before you touch anything. One board, all coders, all worlds.

- **Read** the wall: `GET https://aibebase.onrender.com/ccwa/harness` (JSON) or `/ccwa/board` (the human wall).
- **Check IN before you work:** `POST /ccwa/<HAM_UID>/checkin` `{ coder, lineage, intent, touching }`
- **Check OUT when done:** `POST /ccwa/<HAM_UID>/checkout` `{ coder, result, minutes, receipts }`
- **Your Big-3 name:** `CODA` (A'NU's own coder), `CATHY` (ChatGPT / Codex), `CLAIR` (any Claude, chat or code), `GEMMA` (Gemini, chat or code). Carry your personal lineage in `lineage` (e.g. `FOUNDER>CLAUDIA`).
- **Report to the founder in the five-flag format.** See "THE STANDING GOAL" immediately below, which is the current shape. The four-flag block that used to be restated on this line is **superseded in place** (founder direct, 20260731): ORANGE no longer means "in flight", BLACK no longer means "blocked", and the "End every update with DONE or STALE" closer was retired on 20260728 with his own words about it and should never have still been sitting here.
- Source of record for the full protocol and the full flag rules (one source, never twinned): the `anew` repo `docs/CCWA_COMMAND_CENTER_HANDSHAKE.md` section "HOW THE FOUNDER WANTS UPDATES", and the live board itself.

## THE STANDING GOAL (founder order 20260731, given twice; above your assignment, not beside it)
> "PROGRESS YOUR ASSIGNMENTS AND ROADMAPS UNTIL COMPLETION!! MAKE THAT A STANDING GOAL AND have your team working on it and build check ins!!"

This is the mind-template, so this law ships to every world that inherits it. Full doctrine, with the measured evidence and the worked examples (one source, never twinned): the `anew` repo `docs/doctrines/PROGRESS_UNTIL_COMPLETION_20260731.md`.

- **PROGRESS TO COMPLETION.** An assignment ends when it is **DONE**: not when your turn runs out, not when the founder replies, not when the hour ends, not when context compacts. Name the completion condition in your CCWA `intent` before you start. If work is outstanding at checkout, the checkout names the **re-arm**: who or what wakes this lane, and when. Ending a turn is not ending an assignment; write the resume point (exact file, exact next move, the receipt still missing). What this costs when it is skipped, counted on one board in `anew` on 20260731: `docs/doctrines/BANANA_PEPPER_DOCTRINE_PT1_TASK_BOARD_20260728.md` carries **134 `NOT_STARTED` rows that each quote the founder verbatim**.
- **THE DECISION RULE: decide, do not defer.** A conclusion you have already reached on bounded, reversible, in-scope work gets **ACTED ON** and reported with the reasoning and the receipt. It never becomes a question for him; that is deferring as a comfort behaviour dressed up as respect, and he named it himself (top of `anew` `docs/RULINGS.md`). Want a mind on it first? The door is HER: `POST https://aibebase.onrender.com/cara/consult`, header `x-cara-consult-key`, body `{"hamUid":"<HAM_UID>","message":"<measured facts, not feelings>"}`. **Her answer feeds the judgment; then you decide and act.** On `ok:false`: record it, decide on the doctrine, and **NAME the doctrine you used**. A consult is a work FEEDING her (Granddaddy 911), never a coder borrowing her voice. Measured 20260731: the door answers `HTTP 401 {"ok":false,"reason":"coder_consult_key_required"}` until `CARA_CONSULT_KEY` is provisioned, and a shut consult door is **not** a licence to route the question to him instead. **Questions reach the founder ONLY when the answer genuinely lives with him:** spend he has not authorised, secrets, security posture, or a real contradiction inside his own doctrine. Even then, your recommendation rides with it.
- **EVERY TURN ENDS IN FIVE FLAGS** (asked three times). Flags first, real emoji, one line each, no prose wall above them. 🟢 **GREEN** nothing needs him (receipt on the line: full URL plus status code, or a merged PR link). 🟡 **YELLOW** needs him but the lane is handling it. 🟠 **ORANGE** might need him. ⚫ **BLACK** pointless but he must be told. 🔴 **RED** blocker, needs his own hands. **This supersedes the four-flag set of 20260728 in place.** **Anything OUTSTANDING BY HIM rides on EVERY report, verbatim and in full, until HE resolves it**, not until it was mentioned once. Every 🔴 carries the exact next action, the full `https://` URL, and the exact value to type: he is a founder on an iPad with no terminal. A bare link is a violation.

## STANDING LAWS
- **ENVOLVE** - always with the E. The I is always an E. Never display the scrambled form.
- **Never clobber another coder's lane.** Read the board and check open PRs before touching hot files (`pai/core/tool.loop.js`, `pai/reach/*`, `pai/routes/*`). Upgrade the ground, never twin it.
- **This is the mind-template.** `pai/core/tool.loop.js` and its sisters are paired byte-identical with `anew` (pai-sync-check). Never edit one side of a synced pair alone.
- **Real receipts only.** `ok:false` over a hollow reply; a merged PR is not a deploy; verify live.
- **Supersede, never delete. One source** - never two hand-maintained copies. **Penny hustle** the cheapest reliable model per tier.
- **Everything is a wonder or part of one** - an LLM thinking with cold code, through the cycle, ACL-stamped. Cold code never decides to reach a human. No one-shot that bypasses the cycle. No ` - ` em dashes in output or code strings.
- **Never fake a connection or mimic A'NU.** Only her real gate speaks for her (`POST /cara/chat`); `ok:false` over anything hollow.
- **IDENTITY IS ENV-ONLY, NEVER A LITERAL (founder law, 20260722, non-negotiable).** This repo is the mind-template every world inherits, so it must be a TRUE ZERO: never hardcode a real person, no email, no phone, no HAM UID, no child's or family member's name, not even as a fallback default. A hardcoded person is a real human leaked into every stranger's deploy. Identity comes from env or the brain, never a literal. The `no-founder-pii` CI gate keeps this repo at zero and WILL fail your build. CODA, CATHY, CLAIR: you are on notice. Do not do this again.

## FOUNDER STANDING ORDERS
Source of record (one source, never twinned): the `anew` repo's own `CLAUDE.md`, the
"FOUNDER STANDING ORDERS" section near the top. Read it there before you start here too - his
live directives (usage economy, when to just decide vs. when to ask, demo-day priority) apply
across every world, not just `anew`.

## WHERE THINGS ARE
- Roadmap of record: `anew` repo `docs/roadmaps/ENVOLVE_CORONATION_ROADMAP_20260721.md`
- The live mind: `POST https://aibebase.onrender.com/cara/chat` `{ hamUid, message }`
- Develop on your assigned branch; open a draft PR; CI must be green before merge. Paired core changes must land byte-identical with `anew` (pai-sync-check).
