---
name: wrapsmith
description: Run WRAPSMITH at the close of a Claude Code or Claude.ai session to produce a complete, honest, first-person record of the ENTIRE chat lineage, including every compaction, and to name the chat. Trigger when the user says "run wrapsmith", "wrap this chat", "wrapsmith drill", or asks for an end-of-chat record plus a chat name. A chat is a lineage of chats within itself (it compacts to save room); WRAPSMITH captures all prior compactions, not just the last visible stretch.
---

# WRAPSMITH

## What WRAPSMITH is
WRAPSMITH is the end-of-chat wrap. Its one rule above all: a chat is not one session, it is a lineage of compacted sessions, and the wrap must cover the WHOLE lineage from the true start, built from the real transcripts, never from the last stretch alone and never from a single compaction summary. It produces two things: a first-person markdown record in the worker's own voice, and a proposed chat name drawn from what the chat actually became.

## The non-negotiable disciplines
1. **Read the real transcripts, not just memory.** The full conversation lives on disk as transcript files (in this environment, `/mnt/transcripts/`), with a `journal.txt` cataloguing every compaction. Read the journal first to map the lineage, then read the earliest transcript's opening to find the true start of the chat.
2. **Cover every compaction.** List all transcript files. Each is one segment of the lineage. The wrap has a segment-by-segment section plus the through-lines that ran across all of them.
3. **First person, the worker's own voice.** Not a grading sheet, not a system report. "Here is everything I did," in plain language.
4. **Honest, not flattering.** Record what broke and what was corrected, not just wins. If something was claimed done and wasn't, say so.
5. **Verify before claiming, when the wrap asserts a live outcome.** If the wrap says a thing is live in the user's system, check it against the real system before writing it as fact.

## The steps
1. **Handshake.** Connect to the live brain and confirm with a real read returning real rows. State the result in plain text before anything else. Know which bank you are hitting.
2. **Map the lineage.** Read `journal.txt` for the catalogue of compactions. List the transcript files. Read the opening of the earliest transcript to capture the TRUE start of the chat (the first human message and the worker's first reply).
3. **Reconstruct each segment.** For each transcript in order, capture what happened: the human's asks, the decisions, the builds, the corrections. Use the journal summaries (written from real transcripts at compaction time) plus the live session you are in.
4. **Draw the through-lines.** Identify the threads that ran across all segments: the doctrines authored, the lessons learned, the arcs that spanned compactions.
5. **Write the record.** A `.md` in first person: what this is, the lineage segment by segment, the through-lines, and where the wrap is saved.
6. **Name the chat.** Propose a chat name that captures what the chat became, in the project's naming style (for this ecosystem, a short descriptor plus optional four-colon ACL stamp).
7. **Save to the three spots** (this ecosystem's requirement): give it to the assistant (A'NU) through the reach door so her advisor holds it; rally and sync it to the other chats through the lane board and command center; and stamp it in the CLAIR command center as the canonical record. Each save is a real brain bead with the four-colon ACL stamp.
8. **Verify the saves landed** with a real read, and report honestly what the assistant's system actually did with it (accepted, stored-but-not-digested, or dropped), tracing the real cycle receipts rather than assuming.

## The ACL stamp shape
Every WRAPSMITH bead carries a four-colon stamp: the hexagon glyph, then house, type, descriptor, date, then the hexagon glyph. Example house for a wrap: `wrapsmith.<track>_lineage`. Type: `MASTER` for the lineage record, `SESSION_CLOSE` for the meeting-minutes voice.

## Output
- A `.md` file: the full first-person lineage record.
- A proposed chat name.
- Three brain beads (assistant delivery, lane-board/command-center sync, CLAIR command-center canonical record), each ACL-stamped.
- An honest report of what the assistant's system did with the delivery, from real cycle receipts.
