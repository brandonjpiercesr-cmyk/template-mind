// ⬡B:template-mind.coding:MODULE:per_world_coder_submits_to_night_check:20260710⬡
// THE PER-WORLD CODER. Business Plan + Great Correction law: "every ham is going to
// have a coding world manipulating theirs... still all within the confines of our
// system... they're coding the wall in real time, so they're going to pay coding
// costs." This is the LESSER coder -- it drafts changes for ITS OWN world only, and
// it CANNOT self-approve. Every build it produces is submitted UP to the global
// night check (CLAIR/founder world) for a rogueness + security review before it can
// land. Sovereignty of the world, audit from the center. W5-clean: env identity only.
'use strict';
// SUBMIT-UP, never self-land. The coder stamps a BUILD_REVIEW request into its own
// bank AND signals the global night check. It holds nothing live until approved.
async function submitForReview(env, draft) {
  var HAM = (env.HAM_UID || '').toUpperCase();
  var BANK = env.MEMORY_BANK_URL, KEY = env.MEMORY_BANK_KEY;
  var NIGHT = env.NIGHT_CHECK_URL || ''; // the global reviewer, set by env per world
  if (!HAM || !BANK || !KEY) return { ok: false, reason: 'unborn' };
  var wh = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Accept-Profile': 'memory_bank',
    'Content-Profile': 'memory_bank', 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // stamp the review request in the world's own bank (lineage stays local)
  try {
    await fetch(BANK + '/rest/v1/beads', { method: 'POST', headers: wh, body: JSON.stringify({
      ham_uid: HAM, agent_global: 'CODER', stamp_type: 'BUILD_REVIEW',
      acl_stamp: '⬡B:coding:BUILD_REVIEW:submitted:' + ymd + '⬡',
      source: 'coding.review.' + Date.now(),
      summary: '[SUBMITTED UP for night check] ' + String((draft || {}).intent || '').slice(0, 120),
      content: JSON.stringify({ draft: draft || {}, status: 'awaiting_night_check', selfApproved: false }),
      importance: 7, spawned_by: 'coding.submitForReview'
    }) });
  } catch (e) { return { ok: false, reason: 'bank write failed' }; }
  // signal the global reviewer if wired (best-effort; the bead is the durable record)
  if (NIGHT) {
    try {
      await fetch(NIGHT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: HAM, kind: 'build_review', draft: draft || {} }) });
    } catch (e) {}
  }
  return { ok: true, status: 'awaiting_night_check', selfApproved: false };
}
module.exports = { submitForReview: submitForReview };
