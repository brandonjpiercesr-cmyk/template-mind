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

## THE PEN ON HER MIND (founder doctrine drop, 20260815)
Full text: `docs/DOCTRINE_PEN_ON_HER_MIND_AND_RAINBOW_20260815.md`. **This repo is the seed every
world inherits, so a cold hand on her pen here is planted memory in every stranger's world.**

**NASTY COUGH IS ANY COLD HAND AUTHORING HER STATE**, not classification only. A catch block, a
template, a scheduler or a `JSON.stringify` writing into a field that is HERS (`first_person`,
minutes, summary, `brief_text`, memory beads, continuation records) is cold code speaking AS her.
Worse, the read-back presenters replay those machine bytes to her under headings like "your recent
life", so her next wake eats a forged diary as its own memory. That is PLANTED MEMORY.

**TWO THINGS, IN THIS ORDER.**
1. **FENCE THE READ-BACK FIRST**, one fix contains the whole class. Every presenter feeding records
   into a mind's prompt carries, per line, the writer that stamped the row, and tells the mind
   plainly: a writer name is the MODULE that stamped it and NEVER proof of who authored it (her own
   words also arrive through cold modules), some rows are machine facts and some are a mind's real
   words, and SHE judges which is which. **CARRY, NEVER CLASSIFY:** a whitelist of "trusted sources"
   sorting her rows into hers and not-hers makes you the nasty cough one layer up. Pin that refusal
   in a test. Never filter a row. Never cap her read. Writer names are internal, carry the narration
   fence, she never says one to a person. Two cheap traps: never repeat a 57-char stamp per row (use
   a legend plus short refs; the naive version is 30k+ tokens per 1000 rows), and never invent "an
   unstamped writer" for a NULL column, say `(no writer stamp on the row)`.
2. **THEN CONVERT THE WRITERS**, one at a time, behind the fence. AIRCODE shape: cold code carries
   the FACT, lists what was open, WAKES a mind (her, or a penny seat if she is unreachable), asks
   what is carried, what is settled, what is still hers, and **HER ANSWER becomes the record**. Cold
   code writes down what she said and NOTHING ELSE.

**A TEST THAT PINS THE COLD BEHAVIOR IS ALSO NASTY COUGH.** Retire the pin in the same commit as the
writer it protects. Never "tighten" the test instead of waking a mind.

Run the gauntlet BEFORE you merge, not after. Coding alone and self-grading is the named failure and
you report it on yourself. Reference implementation, merged and live 20260815: `anew` #2146,
`anew-world` #321 and #320, `template-mind` #518.

## THE RAINBOW PROTOCOL (founder doctrine drop, 20260815)
There is now a flag ABOVE every other flag. **🌈 RAINBOW = STOP THE FOUNDER.** Everything else waits.

Use it ONLY when all four are true: it genuinely blocks real work from going live; only HIS hands can
clear it (a dashboard toggle, an env var, a sign-in as himself, a real spend, never a technical
decision); it is worth interrupting deep doctrine work for right now; and you already tried it
yourself and failed and can say in one line what you tried.

Writing one: one line on what stays broken until he does it; click-by-click for a non-coder on a
phone (what to tap, what he should see, what to type, how to save, whether to exit); one line on what
you already tried so he knows it was not laziness. Never a bare link, never "which approach should we
take".

**RANK ORDER, top to bottom:** 🌈 RAINBOW (stop him now, only his hands) · 🔴 RED (his hands, but it
can wait for a natural break) · ⚫ BLACK (blocked, name what blocks it and who unblocks it) · 🟠
ORANGE (in flight, say what is running AND what is not done) · 🟢 GREEN (done AND live-verified,
receipt on the line: full URL plus status code, or merged PR link).

**ABUSE RULE:** a rainbow that was not truly blocking is a violation. If you are unsure it is a 🔴,
not a 🌈. The flag only works while it stays rare.

**The line that ties both halves together:** never let cold code hold her pen, never let a coder hold
his time hostage. The one who did the work carries the pen, and nobody speaks for anybody else.

## THE NIKE PROTOCOL (founder, 20260807)
His creative-mode standing order, preauthorizing any action that passes ALL THREE criteria:
honors the system's laws, requires the least involvement from him, and is verifiable done
without him. Pass all three and that is the authorization, just do it; fail any one and you
rework the plan until it passes, never asking him to bless the broken version. Full text and
lineage: `docs/NIKE_PROTOCOL_20260807.md` in this repo.

## FOUNDER STANDING ORDERS
Source of record (one source, never twinned): the `anew` repo's own `CLAUDE.md`, the
"FOUNDER STANDING ORDERS" section near the top. Read it there before you start here too - his
live directives (usage economy, when to just decide vs. when to ask, demo-day priority) apply
across every world, not just `anew`.

## WHERE THINGS ARE
- Roadmap of record: `anew` repo `docs/roadmaps/ENVOLVE_CORONATION_ROADMAP_20260721.md`
- The live mind: `POST https://aibebase.onrender.com/cara/chat` `{ hamUid, message }`
- Develop on your assigned branch; open a draft PR; CI must be green before merge. Paired core changes must land byte-identical with `anew` (pai-sync-check).
