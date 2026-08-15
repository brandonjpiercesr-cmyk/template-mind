// ⬡B:template-mind.downtime:MODULE:downtime_anu_the_between_presence:20260710⬡
// DOWNTIME A'NU. Doctrine definition, verbatim intent (A'nu OS ch, NYC pt3):
// "how PAI Senior expressed herself through the reach channel when no human was
// actively engaging. Not idle. Occupied. Working on the things that needed to be
// worked on between human interactions. Organizing what had accumulated. Preparing
// what would be needed. Running the advisor cycles that had become due. Building the
// briefing that would be waiting when the person arrived." W5-clean: identity by env.
'use strict';
// DOWNTIME defined by the doctrine, not guessed: the state when no human is on any
// channel. This module answers "what should she be doing right now, for this person,
// while they are away" -- and prepares the seamless arrival.
//
// ⬡B:template-mind.downtime:FIX:the_pen_stays_in_her_hand_20260815⬡
// Founder doctrine THE PEN ON HER MIND, 20260815: "NASTY COUGH IS ANY COLD HAND
// AUTHORING HER STATE... a catch block, a template, a scheduler... writing into a
// field that is HERS... the read-back presenters then replay those machine bytes to
// her under headings like 'your recent life'. Her next wake eats a forged diary as its
// own memory." This module used to build the entire BRIEFING summary from pure string
// concatenation, zero model call: '[DOWNTIME BRIEFING] Prepared while you were away: '
// + did.join('; '). Cold code was authoring first-person-adjacent prose and stamping
// it into her memory bank as a record of what she did.
// REPLAY CHECKED, NOT ASSUMED (20260815): the old bead's stamp_type BRIEFING at
// importance 6 could not actually satisfy pai/core/find.js's findContext or
// findRecentResults, both of which pai/core/fcw.builder.js's RECENT CONTEXT wall reads
// through -- both gate on stamp_type RESULT at importance >= 7. The one live path in
// was the exact-agent lookup (findNamedAgentRecords, agent_global 'DOWNTIME_ANU')
// firing only when a person names that exact agent in their own turn. Converting
// anyway: a forged diary that is merely hard to reach is still a forged diary, and the
// doctrine's cure is HER WORD becomes the record, not a narrower catch.
// PATTERN: core/inbox.zero.js composeDraftViaCycle, read to its end before copying --
// wakes the real window cycle (finalizePublicTurn: council + WRIT + meta_commentary +
// synthesize) and on any failure writes NOTHING rather than falling back to a lesser
// cold draft. Same shape here: cold code carries the FACT (what accumulated while she
// was away), wakes her through that one real exit, and the BRIEFING bead is stamped
// from HER ANSWER only. No reachable mind -> ok:false, no bead claiming to be hers.
var publicTurn = require('./pai/core/pai.public.finalizer.js');

async function downtimeCycle(env) {
  var HAM = (env.HAM_UID || '').toUpperCase();
  var BANK = env.MEMORY_BANK_URL, KEY = env.MEMORY_BANK_KEY;
  if (!HAM || !BANK || !KEY) return { ok: false, reason: 'unborn' };
  var h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Accept-Profile': 'memory_bank' };
  var did = [];
  var readFailed = null;
  // 1) Organize what accumulated: count fresh un-briefed deposits since last briefing.
  //    This stays cold -- a count is a fact, never prose attributed to her.
  // ⬡B:downtime:FIX:a_failed_read_is_not_an_empty_inbox:20260815⬡
  // A non-OK response or a throw used to leave `did` empty, and the next line then stated
  // "nothing new accumulated while you were away" TO HER AS A FACT. That converts "we could
  // not look" into "we looked and there was nothing", and the answer she writes on that
  // footing is stored as her briefing. A person comes back reassured their night was quiet
  // when the truth is the deposit count was never read. Three states now, never two: rows
  // read, zero rows read, or the read failed and we say so.
  try {
    var r = await fetch(BANK + '/rest/v1/beads?stamp_type=eq.NOTE&order=created_at.desc&limit=20&select=id,summary', { headers: h });
    if (r.ok) { var rows = await r.json(); did.push('reviewed ' + (rows || []).length + ' recent deposits'); }
    else { readFailed = 'deposit read returned HTTP ' + r.status; }
  } catch (e) { readFailed = 'deposit read threw: ' + String(e && e.message || e).slice(0, 120); }
  // 2) Wake her through the one real exit. SHE decides what the briefing says; cold
  //    code never drafts it and never falls back to a template on failure.
  // The uncertainty is CARRIED to her, not resolved by cold code. She is told plainly that
  // the count is unknown and why, and SHE decides what the briefing says about it.
  var factsLine = readFailed
    ? ('the deposit count could not be read this cycle (' + readFailed + '), so what accumulated '
      + 'is UNKNOWN, not known to be nothing')
    : (did.length ? did.join('; ') : 'the deposit read succeeded and found nothing new');
  var question = 'What should be waiting for me when I get back? Give me your downtime briefing.';
  var deliberationInput = 'DOWNTIME CYCLE, no human on any channel right now. What accumulated '
    + 'since the last briefing: ' + factsLine + '. Write the short briefing that will be '
    + 'waiting for him when he returns: what you found and whether anything needs his word. '
    + 'Do not invent activity beyond the facts above.';
  var turn = null;
  try {
    turn = await publicTurn.finalizePublicTurn({
      hamUid: HAM, question: question, deliberationInput: deliberationInput,
      channel: 'downtime', councilContext: { surface: 'downtime_briefing' }
    });
  } catch (e) { turn = null; }
  if (!turn || !turn.ok || typeof turn.answer !== 'string' || !turn.answer.trim()) {
    return { ok: false, reason: (turn && turn.reason) || 'downtime_cycle_unreachable', prepared: did };
  }
  // 3) Stamp the briefing that waits for arrival, from HER ANSWER and nothing else --
  //    so the next active turn opens already oriented (the seamless-transition law).
  var wh = Object.assign({}, h, { 'Content-Profile': 'memory_bank', 'Content-Type': 'application/json', Prefer: 'return=minimal' });
  var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    await fetch(BANK + '/rest/v1/beads', { method: 'POST', headers: wh, body: JSON.stringify({
      ham_uid: HAM, agent_global: 'DOWNTIME_ANU', stamp_type: 'BRIEFING',
      acl_stamp: '⬡B:downtime:BRIEFING:arrival_prep:' + ymd + '⬡',
      source: 'downtime.briefing.' + Date.now(),
      summary: turn.answer,
      content: JSON.stringify({ prepared: did, forArrival: true, cycleId: turn.cycleId || null }),
      importance: 6, spawned_by: 'downtime.cycle'
    }) });
  } catch (e) {}
  return { ok: true, prepared: did, cycleId: turn.cycleId || null };
}
module.exports = { downtimeCycle: downtimeCycle };
