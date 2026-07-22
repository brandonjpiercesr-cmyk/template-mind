#!/bin/bash
# ⬡B:hook.ccwa.session_start:WIRE:board_is_read_first_every_session:20260722⬡
# FOUNDER LAW (Envolve Coronation): the CCWA Command Center is the ONE spot every coder reads
# FIRST before running and stamps into. This SessionStart hook injects the live harness (every
# coder's who/what/next, stale self-flagged) into every Claude Code session at startup, so no
# session begins blind. template-mind is the mind-template every world inherits, so wiring the
# board-read here means every inherited world starts already reading the one board. Fail-soft:
# if the harness is unreachable it never blocks the session.
set -uo pipefail
HARNESS_URL="${CCWA_HARNESS_URL:-https://aibebase.onrender.com/ccwa/harness?limit=25}"
echo "============ CCWA COMMAND CENTER  ·  READ FIRST (the trace-back spine) ============"
echo "You are a coder in ENVOLVE's system. Your Big-3 name is CODA (A'NU's coder),"
echo "CATHY (ChatGPT/Codex), or CLAIR (any Claude, chat or code). Before you touch anything,"
echo "and before you finish:"
echo "  1. Read the live harness below (who/what/next per coder; stale flags itself)."
echo "  2. CHECK IN:  POST /ccwa/<HAM_UID>/checkin  {coder, lineage, intent, touching}"
echo "  3. CHECK OUT: POST /ccwa/<HAM_UID>/checkout {coder, result, minutes, receipts}"
echo "  Human wall https://aibebase.onrender.com/ccwa/board  ·  One board, all coders."
echo "  Laws: ENVOLVE always with an E. Never clobber another coder's lane (read the board)."
echo "-------------------------------- LIVE HARNESS --------------------------------"
if command -v curl >/dev/null 2>&1; then
  curl -sS -m 12 "$HARNESS_URL" 2>/dev/null \
    || echo '{"note":"harness unreachable at startup; read CLAUDE.md and check in when reachable"}'
else
  echo '{"note":"curl unavailable; read CLAUDE.md for the CCWA handshake"}'
fi
echo ""
echo "=================================================================================="
exit 0
