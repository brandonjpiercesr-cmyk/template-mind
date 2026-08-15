// ⬡B:core.founder_context:MODULE:acl_header_added_in_audit:20260711⬡
// entered via the ABAHAM door, serving channel MESSAGES
// Header added during the July 11 full audit; file predates the ACL law.
// \u2b21B:core.founder_context:MODULE:founder_context_window_20260713\u2b21
// THE FOUNDER CONTEXT WINDOW (FCX). Sister module to the BCW
// (coding-department/bcw.js). Where the BCW arms a build with doctrine, the
// burn book, standards, and a pathway scan, this arms ANY advisor, coding or
// business, with who the founder actually is: identity, company structure,
// team, the EBC firewall, the honest self-assessment from his own recorded
// LAYERED data, what's shipped, what's still open, and the naming ledger
// (including that OVERSEER IS RETIRED, confirmed against the live NAL in
// routes/chat.bridge.routes.js, not guessed at).
//
// Brandon's own framing, 20260713: "maybe this is both my coding adviser and
// my business adviser... maybe this is agent CLAIR inside my system." Answer
// built here: it is not mode-specific. Founder identity is baseline context
// for any advisor, unlike the BCW's build-specific armory, so this arms
// coding mode, business mode, and the default chat alike, unless a caller
// explicitly opts out.
//
// DATA LIVES AT: schema ham_{founderUid}, table abacia, stamp_type =
// FOUNDER_PROFILE. Sixteen beads written 20260713 (identity, company
// structure, pricing/economics, team roster, EBC firewall, model tier map,
// naming ledger, honest strengths, honest weaknesses, major work shipped,
// open items pathway, standing operational rules, GMG-U/LAYERED status,
// business plan spine, OS relaunch phases, 2046 Jarvis roadmap). Add more
// FOUNDER_PROFILE beads any time; this module picks up new ones automatically,
// no deploy required, same promise the BCW makes for doctrine.
//
// IDENTITY: system-scoped, same discipline as the BCW. It arms context for
// whichever HAM is passed by the caller; falls back to FOUNDER_HAM_UID /
// DEFAULT_HAM_UID from env, never a hardcoded literal in this file.
//
// REACH PATH TO A HAM: consumed by chat.bridge.routes.js (arms coding AND
// business mode, additive, fail-open, mirrors the existing BCW arming
// pattern exactly) and exposed standalone at GET /founder-bcw for any lane
// or human that wants to read the armory directly.

function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _founderUid() { return (process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID || '').toLowerCase(); }

function bh(schema) {
  return { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Accept-Profile': schema };
}

async function pullFounderBeads(hamUid) {
  var uid = String(hamUid || _founderUid() || '').toLowerCase();
  if (!uid) return [];
  var schema = 'ham_' + uid;
  try {
    var r = await fetch(_bu() + '/rest/v1/abacia?stamp_type=eq.FOUNDER_PROFILE&order=source.asc&limit=40&select=source,summary,content', { headers: bh(schema) });
    if (!r.ok) return [];
    var rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}

// Assemble the founder armory. hamUid optional, defaults to the founder.
// full=true pulls the full content field per bead (deep mode); default is
// summary-only (fast mode), matching the BCW's own truncated-pull discipline
// so this never becomes the thing that blows a context budget.
async function assembleFounderContext(hamUid, full) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain', fcx: '' };
  var beads = await pullFounderBeads(hamUid);
  if (!beads.length) return { ok: false, reason: 'no_founder_profile_beads', fcx: '' };

  var parts = [];
  parts.push('=== FOUNDER CONTEXT (you are armed with who you are serving) ===');
  parts.push(beads.map(function (b) {
    var label = String(b.source || '').replace('clair.founder_bcw.', '');
    var body = full ? (b.content || b.summary || '') : (b.summary || '');
    return '[' + label + '] ' + body;
  }).join('\n'));
  parts.push('This is who founded and runs this system. Ninety percent of who he is to you should already live above. If you find yourself asking him something this already answers, that is a miss, not a normal turn.');

  var fcx = parts.join('\n\n');
  return { ok: true, fcx: fcx, chars: fcx.length, packs: beads.length };
}

// ⬡B:pai.core.founder_context:GATE:founder_bcw_was_open_to_the_world:20260815⬡
// THIS DOOR WAS OPEN TO ANYONE. GET /founder-bcw served the assembled founder armory,
// real contact details and family and money context included, to an unauthenticated
// stranger with no header at all. Verified live before this fix: HTTP 200, 5868 bytes,
// zero credentials sent.
//
// ⬡B:pai.core.founder_context:CORRECTION:the_template_kept_the_retracted_draft:20260815⬡
// THE CORRECTION THIS FILE WAS OWED, AND DID NOT GET FOR NINETY MINUTES.
// The first draft of this gate shipped here and in anew. A blind critic then found six
// defects in it, and every one was corrected in anew and left standing HERE, in the repo
// whose own CLAUDE.md says it is the mind-template every world inherits. The PR that fixed
// anew claimed this file was "fixed identically". That claim was FALSE, which makes it the
// same species of defect as the one it was retracting, written into the same PR. A tenth
// seat auditing that work caught it. Three real things were still wrong here:
//
// 1. THE FIRST DRAFT'S CENTRAL CLAIM, verbatim, was still sitting above: "Its own sibling
//    doors on this service already refuse properly, so the armory was the one surface that
//    never learned to say no." That is FALSE. routes/brain.graph.view.routes.js in the
//    sibling repo gates GET /brain/graph/data with the fail-open coderKeyOk() this very
//    comment argues against, and that route returns each bead's `summary`, byte-for-byte
//    what this file serves in default mode. Removed rather than softened.
// 2. A HAND-ROLLED THIRD COMPARATOR, against the one-source law. Gone, see below.
// 3. THE CROSS-WORLD READ HOLE was still open: req.query.ham went straight through.
//
// This door is not mounted in this repo today, so the hole was latent-in-the-seed rather
// than live. That is a reason it went unnoticed, not a reason it was acceptable. A seed
// defect ships to every stranger's world at once.
//
// FAILS CLOSED, NOT OPEN. The board's coderKeyOk() helper returns TRUE when its env key
// is unset, which is a reasonable default for a coder wall and the wrong one for the
// founder's private context: an unset var would silently reopen this exact hole. Here an
// unconfigured key is a 503 and serves nothing. A door guarding one real person must never
// treat "not configured yet" as "let everyone in".
//
// ONE SOURCE FOR THE COMPARISON, AND AN HONEST NOTE ON WHAT IT BUYS. The first draft
// hand-rolled a constant-time compare and its commit claimed it was "length safe so a wrong
// key cannot be narrowed down by timing". That claim was backwards: an early return on
// length is precisely what leaks. This now uses the repo's existing crypto.timingSafeEqual
// helper, which is the correct ONE-SOURCE choice. But the same auditor checked it, and the
// shared helper ALSO returns early on a length mismatch, so the timing half of the original
// justification is still not true and is not claimed here. What the change buys is one
// source instead of three, which is the real reason to make it.
//
// THE KEY IS NOT FOUNDER-SCOPED TODAY, said plainly rather than implied. FOUNDER_BCW_KEY is
// an override that nothing sets, so in practice this resolves to CCWA_KEY, the shared coder
// key. That closes the anonymous hole, which was the leak. It does NOT make the armory a
// founder-only surface, and nobody reading this should believe it does.
//
// IDENTITY IS ENV-ONLY. Key and ham both come from env with no literal fallback of any kind,
// so this file stays a true zero for every world that inherits it.
var _crypto = require('node:crypto');

function founderBcwKey() {
  return String(process.env.FOUNDER_BCW_KEY || process.env.CCWA_KEY || '').trim();
}

// One comparison, not a third hand-rolled copy. Matches core/webhook.guard.js#sameText in
// the sibling repo; this repo has no webhook.guard module to require, so the same three
// lines are used rather than inventing a different shape.
function sameText(a, b) {
  var left = Buffer.from(String(a == null ? '' : a), 'utf8');
  var right = Buffer.from(String(b == null ? '' : b), 'utf8');
  return left.length === right.length && _crypto.timingSafeEqual(left, right);
}

// ⬡B:pai.core.founder_context:GATE:the_caller_may_not_choose_whose_armory:20260815⬡
// CROSS-WORLD READ, closed. The first draft passed req.query.ham straight through, so any
// holder of the shared coder key could name ANY ham_uid and read that world's founder beads.
// Authenticating a caller is not the same as authorizing which person they may read, and
// this door had only the first. The HTTP surface now serves this deploy's own configured
// founder and ignores a caller-supplied ham entirely. In-process callers are unaffected:
// they call assembleFounderContext() directly with their own resolved ham.
function thisWorldFounderHam() {
  return String(process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID || '').trim();
}

// Express mount: GET /founder-bcw?full=1 exposes this world's armory to an authorized lane.
module.exports = function (app) {
  app.get('/founder-bcw', async function (req, res) {
    res.set('Cache-Control', 'no-store');
    var expected = founderBcwKey();
    if (!expected) return res.status(503).json({ ok: false, reason: 'founder_bcw_key_unconfigured' });
    var supplied = String((req.headers || {})['x-ccwa-key'] || '');
    if (!sameText(supplied, expected)) {
      return res.status(401).json({ ok: false, reason: 'ccwa_key_required' });
    }
    var ham = thisWorldFounderHam();
    if (!ham) return res.status(503).json({ ok: false, reason: 'founder_ham_unconfigured' });
    var out = await assembleFounderContext(ham, req.query.full === '1');
    res.json(out);
  });
};
module.exports.assembleFounderContext = assembleFounderContext;
