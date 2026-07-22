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
- **Your Big-3 name:** `CODA` (A'NU's own coder), `CATHY` (ChatGPT / Codex), `CLAIR` (any Claude, chat or code). Carry your personal lineage in `lineage` (e.g. `FOUNDER>CLAUDIA`).
- Source of record for the full protocol (one source, never twinned): the `anew` repo `docs/CCWA_COMMAND_CENTER_HANDSHAKE.md`, and the live board itself.

## STANDING LAWS
- **ENVOLVE** - always with the E. The I is always an E. Never display the scrambled form.
- **Never clobber another coder's lane.** Read the board and check open PRs before touching hot files (`pai/core/tool.loop.js`, `pai/reach/*`, `pai/routes/*`). Upgrade the ground, never twin it.
- **This is the mind-template.** `pai/core/tool.loop.js` and its sisters are paired byte-identical with `anew` (pai-sync-check). Never edit one side of a synced pair alone.
- **Real receipts only.** `ok:false` over a hollow reply; a merged PR is not a deploy; verify live.
- **Supersede, never delete. One source** - never two hand-maintained copies. **Penny hustle** the cheapest reliable model per tier.
- **Everything is a wonder or part of one** - an LLM thinking with cold code, through the cycle, ACL-stamped. Cold code never decides to reach a human. No one-shot that bypasses the cycle. No ` - ` em dashes in output or code strings.
- **Never fake a connection or mimic A'NU.** Only her real gate speaks for her (`POST /cara/chat`); `ok:false` over anything hollow.

## WHERE THINGS ARE
- Roadmap of record: `anew` repo `docs/roadmaps/ENVOLVE_CORONATION_ROADMAP_20260721.md`
- The live mind: `POST https://aibebase.onrender.com/cara/chat` `{ hamUid, message }`
- Develop on your assigned branch; open a draft PR; CI must be green before merge. Paired core changes must land byte-identical with `anew` (pai-sync-check).
