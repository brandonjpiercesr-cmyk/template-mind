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

// Express mount: GET /founder-bcw?ham=...&full=1 exposes the armory directly.
module.exports = function (app) {
  app.get('/founder-bcw', async function (req, res) {
    var out = await assembleFounderContext(req.query.ham, req.query.full === '1');
    res.json(out);
  });
};
module.exports.assembleFounderContext = assembleFounderContext;
