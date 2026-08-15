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
// zero credentials sent. Its own sibling doors on this service already refuse properly,
// so the armory was the one surface that never learned to say no.
//
// FAILS CLOSED, NOT OPEN. The board's coderKeyOk() helper returns TRUE when its env key
// is unset, which is a reasonable default for a coder wall and the wrong one for the
// founder's private context: an unset var would silently reopen this exact hole. Here an
// unconfigured key is a 503 and serves nothing. A door guarding one real person must never
// treat "not configured yet" as "let everyone in".
//
// IDENTITY IS ENV-ONLY. The key is read from env with no literal fallback of any kind, so
// this file stays a true zero for every world that inherits it.
function founderBcwKey() {
  return String(process.env.FOUNDER_BCW_KEY || process.env.CCWA_KEY || '').trim();
}

// Length-safe equality so a wrong key cannot be narrowed down by timing the reply.
function keyMatches(presented, expected) {
  var a = String(presented || '');
  var b = String(expected || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Express mount: GET /founder-bcw?ham=...&full=1 exposes the armory to an authorized lane.
module.exports = function (app) {
  app.get('/founder-bcw', async function (req, res) {
    var expected = founderBcwKey();
    if (!expected) {
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ ok: false, reason: 'founder_bcw_key_unconfigured' });
    }
    if (!keyMatches((req.headers || {})['x-ccwa-key'], expected)) {
      res.set('Cache-Control', 'no-store');
      return res.status(401).json({ ok: false, reason: 'ccwa_key_required' });
    }
    var out = await assembleFounderContext(req.query.ham, req.query.full === '1');
    res.set('Cache-Control', 'no-store');
    res.json(out);
  });
};
module.exports.assembleFounderContext = assembleFounderContext;
