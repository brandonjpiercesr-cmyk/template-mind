// ⬡B:routes.cycle:MODULE:exact_ham_server_owned_cycle_boundary:20260730⬡
// The public /cycle door authenticates one exact HAM, then constructs the runtime identity
// from server-owned resolution. Request JSON is conversation input, not identity authority.
'use strict';

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function claimedHamValues(body) {
  body = plainObject(body) || {};
  var identity = plainObject(body.identity) || {};
  var context = plainObject(identity.council_context) || {};
  return [body.ham_uid, body.hamUid, identity.ham_uid, identity.hamUid, identity.uid,
    context.ham_uid, context.hamUid].filter(function (value) {
      return value !== undefined && value !== null && String(value).trim();
    });
}

function conflictingHamClaim(body, exactHam, normalizeHamUid) {
  var expected = normalizeHamUid(exactHam);
  var claims = claimedHamValues(body);
  for (var i = 0; i < claims.length; i += 1) {
    if (normalizeHamUid(claims[i]) !== expected) return String(claims[i]);
  }
  return null;
}

function serverIdentity(authorized, exactHam, message, peopleTier) {
  var envelope = plainObject(authorized && authorized.envelope) || {};
  var identity = {
    uid: exactHam,
    ham_uid: exactHam,
    people_tier: peopleTier,
    user_message: message,
    authenticated_cycle: true,
    session_via: authorized && authorized.via || null
  };
  if (envelope.name != null) identity.name = envelope.name;
  if (envelope.trust_level != null) identity.trust_level = envelope.trust_level;
  if (envelope.world != null) identity.world = envelope.world;
  if (envelope.ebc_firewall != null) identity.ebc_firewall = envelope.ebc_firewall === true;
  return identity;
}

function privilegedIdentity(base, supplied) {
  var source = plainObject(supplied) || {};
  var merged = {};
  // An exact-body server proof can preserve named machine context, but it does not turn every
  // future JSON field into identity authority. Keep a small allowlist and let the server-owned
  // base overwrite it below.
  ['outbound_finalize', 'delivery', 'council_context', 'request_id', 'requestId',
    'voice_context', 'call_context', 'automation_context'].forEach(function (name) {
    if (source[name] !== undefined) merged[name] = source[name];
  });
  if (plainObject(source.council_context)) {
    merged.council_context = Object.assign({}, source.council_context);
    delete merged.council_context.ham_uid;
    delete merged.council_context.hamUid;
    delete merged.council_context.people_tier;
    delete merged.council_context.peopleTier;
  }
  return Object.assign(merged, base);
}

function deny(res, result) {
  var status = result && result.status || 401;
  if (status === 401 && typeof res.set === 'function') {
    res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
  }
  if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store');
  return res.status(status).json({ ok:false,
    reason:result && result.reason || 'cycle_authorization_failed' });
}

module.exports = function registerCycleRoute(app, options) {
  options = options || {};
  var HAM = String(options.hamUid || process.env.HAM_UID || '').trim().toUpperCase();
  var BANK = options.bankUrl || process.env.MEMORY_BANK_URL || '';
  var KEY = options.bankKey || process.env.MEMORY_BANK_KEY || '';
  var auth = options.authorization || require('../core/ham.session.authorization.js');
  var privacy = options.peopleTier || require('../core/privacy/people.tier.js');
  var resolveAtmosphere = options.resolveAtmosphere ||
    require('../core/atmosphere.gate.js').resolveAtmosphere;
  var consumeInternalCycleProof = options.consumeInternalCycleProof ||
    require('../core/internal.cycle.nonce.js').consume;

  app.post('/cycle', async function (req, res) {
    try {
      if (!HAM || !BANK || !KEY) {
        return res.status(200).json({ ok:false, reason:'unborn: missing world env' });
      }

      var authorized = await auth.authorizeExactHamRequest(req, HAM,
        { resolveAtmosphere:resolveAtmosphere });
      if (!authorized.ok) return deny(res, authorized);
      var fullSession = auth.requireSignInTier(authorized);
      if (!fullSession.ok) return deny(res, fullSession);

      var body = plainObject(req.body) || {};
      var conflict = conflictingHamClaim(body, HAM, auth.normalizeHamUid);
      if (conflict) return deny(res, { status:409, reason:'cycle_identity_ham_mismatch' });

      var message = body.message || body.text || '';
      if (!message) return res.status(400).json({ ok:false, reason:'message required' });

      var tierResult = privacy.resolveViewerTier(authorized.envelope, HAM);
      var tier = tierResult && tierResult.tier;
      if (tier == null) tier = await privacy.bornPeopleTier(HAM);
      tier = privacy.effectiveTier(tier);
      var identity = serverIdentity(authorized, HAM, message, tier);

      var internalProof = auth.verifyInternalCycleContext(req, HAM);
      if (internalProof.presented && !internalProof.ok) return deny(res, internalProof);
      var channel = 'new_world';
      if (internalProof.ok) {
        var consumed = await consumeInternalCycleProof(internalProof);
        if (!consumed || consumed.ok !== true) return deny(res, consumed || {
          status:503, reason:'internal_cycle_nonce_claim_unavailable'
        });
        identity = privilegedIdentity(identity, body.identity);
        channel = typeof body.channel === 'string' && body.channel.trim()
          ? body.channel.trim() : channel;
      }

      var priorTurns = Array.isArray(body.priorTurns) ? body.priorTurns : [];
      var uiPortal = plainObject(body.uiPortal);
      var runPAI = options.runPAI || require('../core/tool.loop.js').runPAI;
      var out = await runPAI(HAM, message, channel, identity, priorTurns, uiPortal);
      if (out && out.ok && (out.answer || out.text)) {
        var expressTurn = options.expressTurn || require('../../face.js').expressTurn;
        var spoken = await expressTurn(
          { HAM_UID:HAM, PERSONA:process.env.PERSONA },
          { text:out.answer || out.text, contributions:out.tools_used });
        out._servedBy = 'template_world_mind';
        return res.json({ ok:true, compiled:out, expressed:spoken });
      }
      return res.json({ ok:false, reason:out && out.reason || 'no_answer', compiled:out });
    } catch (e) {
      console.log('[MIND /cycle] error: ' + e.message);
      return res.status(500).json({ ok:false, error:e.message });
    }
  });
};

module.exports._test = {
  claimedHamValues:claimedHamValues,
  conflictingHamClaim:conflictingHamClaim,
  serverIdentity:serverIdentity,
  privilegedIdentity:privilegedIdentity
};
