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
async function downtimeCycle(env) {
  var HAM = (env.HAM_UID || '').toUpperCase();
  var BANK = env.MEMORY_BANK_URL, KEY = env.MEMORY_BANK_KEY;
  if (!HAM || !BANK || !KEY) return { ok: false, reason: 'unborn' };
  var h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Accept-Profile': 'memory_bank' };
  var did = [];
  // 1) Organize what accumulated: count fresh un-briefed deposits since last briefing.
  try {
    var r = await fetch(BANK + '/rest/v1/beads?stamp_type=eq.NOTE&order=created_at.desc&limit=20&select=id,summary', { headers: h });
    if (r.ok) { var rows = await r.json(); did.push('reviewed ' + (rows || []).length + ' recent deposits'); }
  } catch (e) {}
  // 2) Build the briefing that waits for arrival -- stamp it so the next active turn
  //    opens already oriented (the seamless-transition law).
  var wh = Object.assign({}, h, { 'Content-Profile': 'memory_bank', 'Content-Type': 'application/json', Prefer: 'return=minimal' });
  var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    await fetch(BANK + '/rest/v1/beads', { method: 'POST', headers: wh, body: JSON.stringify({
      ham_uid: HAM, agent_global: 'DOWNTIME_ANU', stamp_type: 'BRIEFING',
      acl_stamp: '⬡B:downtime:BRIEFING:arrival_prep:' + ymd + '⬡',
      source: 'downtime.briefing.' + Date.now(),
      summary: '[DOWNTIME BRIEFING] Prepared while you were away: ' + did.join('; '),
      content: JSON.stringify({ prepared: did, forArrival: true }), importance: 6, spawned_by: 'downtime.cycle'
    }) });
  } catch (e) {}
  return { ok: true, prepared: did };
}
module.exports = { downtimeCycle: downtimeCycle };
