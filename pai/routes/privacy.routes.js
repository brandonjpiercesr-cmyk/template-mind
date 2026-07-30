// ⬡B:routes.privacy:MODULE:the_founder_marks_it_and_a_world_reads_beneath_its_tier:20260726⬡
// entered via the ABAHAM door, serving channel MESSAGES (a mark and a world read both
// surface to a human only through the cycle; nothing here speaks).
//
// Two surfaces, and only two:
//
//   POST /privacy/mark        the founder marks a stored fact private or sanctioned, or
//                             hands an unmarked one to the classification wonder to judge.
//                             This is the door behind "I'm going to start marking some
//                             things as private".
//   POST /privacy/world-read  a read performed AS a named world: the tier ceiling is
//                             applied in the database by core/find.js, and whatever
//                             survives that goes through board/pam/pam.js pamRelease, the
//                             mind that tones down rather than refusing. Both halves, in
//                             order, because either one alone is a gate with a hole in it.
//
// Cold code here does no judging at all: it validates shape, hands off, and returns what
// the organs decided. Every path fails closed, and no response ever discloses that a
// withheld thing exists beyond an aggregate count.
'use strict';

var tiers = require('../core/privacy/people.tier.js');
var hamSessionAuthorization = require('../core/ham.session.authorization.js');
var founderSessionGate = require('../core/founder.session.gate.js');

function bad(res, reason) { return res.status(400).json({ ok: false, reason: reason }); }

module.exports = function (app, routeOverrides) {
  var d = routeOverrides || {};
  var requireFounder = d.requireFounder || founderSessionGate.requireFounder;

  app.post('/privacy/mark', async function (req, res) {
    try {
      var b = req.body || {};
      var bodyHam = String(b.hamUid || b.ham_uid || '').trim().toUpperCase();
      if (!bodyHam) return bad(res, 'hamUid_required');
      // Doctrine assigns explicit marks to the founder. The body selects the world containing
      // the target fact, never the authority doing the marking. Exact Atmosphere-bound founder
      // session plus full sign-in are both required before classification spend or any write.
      var founder = await requireFounder(req, res, d);
      if (!founder) return;
      var hamUid = bodyHam;
      var target = String(b.target || b.source || '').trim();
      if (!target) return bad(res, 'target_required');
      var text = String(b.text || '');
      if (!text.trim()) return bad(res, 'text_required');
      // An unrecognised mark is REFUSED, never quietly downgraded to unclassified: a
      // founder who typed "priv8" and got back "filed as unclassified" has been told his
      // mark landed when it did not.
      var mark = b.mark == null || b.mark === '' ? null : tiers.normalizeMark(b.mark);
      if (b.mark != null && b.mark !== '' && !mark) return bad(res, 'unknown_mark');
      if (mark === tiers.MARKS.UNCLASSIFIED) mark = null;

      var out = await require('../core/privacy.WONDER.classification.20260726.js').mark({
        hamUid: hamUid, target: target, text: text,
        founderMark: mark, founderTier: b.tier, supersedes: b.supersedes
      });
      // The response carries the ENVELOPE and never the marked text back, so a mark cannot
      // be leaked by the act of recording it.
      return res.json({
        ok: out.ok === true,
        target: out.target || target,
        privacy: out.envelope || null,
        classified_by: out.source || null,
        toned_available: !!out.toned,
        // Whether the mark is actually joined to the fact on the read path. A receipt that is
        // recorded but not yet enforced must say so, never imply protection it does not have.
        enforced: out.enforced === true,
        reason: out.reason || null
      });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'privacy_mark_fault' });
    }
  });

  app.post('/privacy/world-read', async function (req, res) {
    try {
      var b = req.body || {};
      var bodyHam = String(b.hamUid || b.ham_uid || '').trim().toUpperCase();
      if (!bodyHam) return bad(res, 'hamUid_required');
      // THE VIEWER TIER COMES FROM THE VERIFIED SESSION IDENTITY, NEVER FROM THE BODY. The
      // old code derived the tier from b.identity / b.peopleTier, so a caller could submit
      // peopleTier:0 (the founder's own tier) and read every row: the escalation Codex found
      // on #1174. Any peopleTier / identity.tier a caller supplies is IGNORED outright now.
      //
      // requireExactHamSession authenticates the signed session, binds it to this exact HAM,
      // and hands back the atmosphere envelope resolved SERVER-SIDE for that identity. The
      // tier is derived through the same server-side read authority core/tool.loop.js uses.
      // The founder's own world resolves to T0 through FOUNDER_HAM_UID; every other world is
      // established by its durable BIRTH bead and otherwise lands on STRICTEST.
      var session = await hamSessionAuthorization.requireExactHamSession(req, res, bodyHam);
      if (!session) return;
      var hamUid = session.hamUid;
      var resolved = await tiers.resolveReadTier(session.envelope || { ham_uid: hamUid }, hamUid);
      var viewerTier = tiers.effectiveTier(resolved.tier);

      var queries = Array.isArray(b.queries) ? b.queries : (b.query ? [b.query] : null);
      if (!queries || !queries.length) return bad(res, 'queries_required');
      // Every query is bound to the reading world's own HAM. A world does not get to name
      // somebody else's ham_uid on the way in.
      queries = queries.slice(0, 8).map(function (q) {
        return Object.assign({}, q || {}, { ham_uid: hamUid });
      });

      var found = await require('../core/find.js').findForWorld(viewerTier, queries);
      var gate = await require('../board/pam/pam.js').pamRelease(found.beads, {
        viewerTier: viewerTier, viewerWorld: b.world || null, hamUid: hamUid
      });

      return res.json({
        ok: gate.ok === true,
        verdict: gate.verdict,
        viewer_tier: viewerTier,
        tier_source: resolved.source,
        beads: gate.released || [],
        // Aggregate only. No ids, no summaries, no per-item reasons: the SHAPE of this
        // response must not tell a reader that a private thing exists.
        withheld: gate.withheld || 0,
        toned: gate.toned || 0,
        query_ms: found.ms, gate_ms: gate.gate_ms
      });
    } catch (e) {
      return res.status(500).json({ ok: false, verdict: 'PAM_HOLD', beads: [],
        reason: 'privacy_world_read_fault' });
    }
  });
};
