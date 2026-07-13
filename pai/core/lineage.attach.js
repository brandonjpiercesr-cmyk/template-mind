// ⬡B:core.lineage.attach:MODULE:shared_lineage_helper:20260712⬡
// Step 2+3 of the Two Command Centers plan: every bead that reaches the founder
// carries WHO ultimately decided (read backwards) and whether it is user-facing or
// builder-only, so the A'NU view and the CLAIR view can both render off the same
// bead without either of them computing lineage themselves. One call site per stamp.
//
// IDENTITY: system-scoped helper, carries no HAM identity of its own; the caller's
// hamUid resolves through the ABAHAM door upstream.
//
// REACH PATH TO A HAM: this is a pure utility, imported by advisors/dispatch.js and
// the four advisor cycles (bdif/mediators/mh_action/gmg), every one of which stamps
// a bead directly to a founder's ham_uid. It never stamps on its own; it only shapes
// the content object those callers pass to their own HAM-scoped stamp calls.

// Wrap a bead's content with its lineage + audience flag. `link` is the chain of who
// read from whom, root first (e.g. ['A\u2019NU','REACH','A\u2019NEW'] or ['ADVISOR','STATION']).
// `role` is who is being credited with THIS specific bead (usually link[link.length-1]).
// `audience` is 'user' (plain, shows on the A'NU page) or 'builder' (technical, CLAIR only).
function attachLineage(content, opts) {
  opts = opts || {};
  var chain = opts.chain || [opts.role || 'ANEW'];
  var lineage = {
    delivered_by: opts.deliveredBy || (chain[chain.length - 1] || 'ANEW'),
    chain: chain,
    why: (opts.why || '').slice(0, 200),
    audience: opts.audience === 'user' ? 'user' : 'builder',
    at: Date.now()
  };
  var base = (content && typeof content === 'object') ? content : {};
  return Object.assign({}, base, { lineage: lineage });
}

// The plain-language line for the A'NU (user) view. Every builder-facing stamp should
// also carry a one-line human version so the user page never has to translate jargon.
function forHer(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160); }

module.exports = { attachLineage: attachLineage, forHer: forHer };
