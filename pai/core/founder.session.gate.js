// ⬡B:core.founder_session_gate:GUARD:one_exact_full_sign_in_founder_authority_for_irreversible_doors:20260730⬡
'use strict';

var hamSession = require('./ham.session.authorization.js');

function founderHam() {
  return String(process.env.FOUNDER_HAM_UID || '').trim().toUpperCase();
}

async function requireFounder(req, res, deps) {
  var d = deps || {};
  var ham = founderHam();
  if (!ham) {
    res.status(503).json({ ok:false, reason:'founder_ham_uid_unconfigured' });
    return null;
  }
  var authorize = d.authorize || hamSession.requireExactHamSession;
  var session = await authorize(req, res, ham, d.authDeps);
  if (!session) return null;
  var requireFull = d.requireSignInTier || hamSession.requireSignInTier;
  var full = requireFull(session);
  if (!full || full.ok === false) {
    res.status(full && full.status || 403).json({ ok:false,
      reason:full && full.reason || 'founder_full_sign_in_required' });
    return null;
  }
  if (String(session.hamUid || '').trim().toUpperCase() !== ham) {
    res.status(403).json({ ok:false, reason:'founder_session_required' });
    return null;
  }
  if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store');
  return session;
}

module.exports = { requireFounder:requireFounder, founderHam:founderHam };
