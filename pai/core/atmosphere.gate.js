// ⬡B:core.atmosphere.gate:MODULE:one_gate_every_channel:20260701⬡
// THE first gate. Founder doctrine 20260701, his words: for any channel, inbound or
// outbound, "the very first thing should be to resolve the atmosphere... you can't get
// my brain, my HAM UID, my special stuff until you've resolved." Before this file,
// four channels each carried their own private copy of resolution (reply.js,
// iman.routes.js, vara.llm.routes.js, omi.routes.js) — the exact duplication disease
// that produced six TIMs and three LOGFULs. Now there is ONE gate. Every channel
// imports this. Resolution order: ATMOSPHERE /resolve (fast ham_profiles) → alias map
// (ghost-UID correction, env HAM_UID_ALIASES) → abaham fallback where available.
// Returns a wake envelope {ham_uid, name, trust_level, world, via} or null. Null means
// UNRESOLVED: the caller must not touch any HAM's brain — stamp an unresolved bead
// under 'unknown' and stay out, exactly like iman already did.
// ANYHAM: nothing here is founder-specific; identifiers in, envelope out, any HAM.

var ATM_URL = process.env.ATMOSPHERE_URL || 'https://atmosphere-x2oi.onrender.com';

function aliasMap() {
  var m = {};
  (process.env.HAM_UID_ALIASES || '').split(',').forEach(function (p) { // ⬡UNIVERSALITY⬡ env only
    var pp = p.trim().split(':');
    if (pp.length === 2) m[pp[0].trim().toUpperCase()] = pp[1].trim().toUpperCase();
  });
  return m;
}

function applyAlias(env) {
  if (!env || !env.ham_uid) return env;
  var m = aliasMap();
  var raw = String(env.ham_uid).toUpperCase();
  if (m[raw]) { env.aliased_from = env.ham_uid; env.ham_uid = m[raw]; }
  else env.ham_uid = raw;
  return env;
}

// ⬡B:core.atmosphere.gate:FIX:nylas_grant_never_attached_to_envelope:20260706⬡
// Real, confirmed root cause: this envelope has always carried "world" but
// never a nylas_grant, so every caller (iman.routes.js's sendEmailReply)
// fell back to the same default ABA grant for every world, every time --
// not a mediators-specific wrong-key bug, a total absence for everyone.
// Founder's own words tonight: credentials should live with the advisor.
// Maps the world already being resolved to the real, already-existing
// per-world grant env vars -- no new grants invented, no new judgment, just
// connecting two things that already existed and were never wired together.
// Unmapped or founder's own world correctly falls through to the existing
// default (env-only, never a literal id, per 847392/ANYHAM).
var WORLD_GRANT_ENV = { bdif: 'NYLAS_BDIF_GRANT', gmg: 'NYLAS_GMG_GRANT',
  mediators: 'NYLAS_MEDIATORS_GRANT', mh_action: 'NYLAS_MH_ACTION_GRANT' };
function attachNylasGrant(env) {
  if (!env || !env.world) return env;
  var envVar = WORLD_GRANT_ENV[String(env.world).toLowerCase()];
  if (envVar && process.env[envVar]) env.nylas_grant = process.env[envVar];
  return env;
}

// identifiers: { phone?, email?, hamUid? } — at least one required
async function resolveAtmosphere(identifiers) {
  identifiers = identifiers || {};
  // Explicit hamUid (e.g. a device configured with its owner's UID) still passes
  // through the alias map — a device configured with a ghost UID gets corrected too.
  if (identifiers.hamUid) {
    return attachNylasGrant(applyAlias({ ham_uid: identifiers.hamUid, name: identifiers.name || null,
      trust_level: identifiers.trust_level || null, world: identifiers.world || null, via: 'explicit_uid' }));
  }
  if (!identifiers.phone && !identifiers.email) return null;
  try {
    var body = {};
    if (identifiers.phone) body.phone = identifiers.phone;
    if (identifiers.email) body.email = identifiers.email;
    var r = await fetch(ATM_URL + '/resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      var d = await r.json();
      if (d && d.ok && d.ham_uid) {
        return attachNylasGrant(applyAlias({ ham_uid: d.ham_uid, name: d.display_name || d.name || null,
          trust_level: d.trust_level != null ? d.trust_level : (d.tier != null ? d.tier : null),
          world: d.world || null, ebc_firewall: !!d.ebc_firewall, via: 'atmosphere' }));
      }
    }
  } catch (e) {}
  // abaham fallback — only if the module exists in this deployment
  try {
    var abaham = require('./abaham.resolve.js');
    var res = await abaham.resolve({ email: identifiers.email || '', phone: identifiers.phone || '' });
    if (res && res.success && res.wakeEnvelope && res.wakeEnvelope.hamUid) {
      return attachNylasGrant(applyAlias({ ham_uid: res.wakeEnvelope.hamUid, name: res.wakeEnvelope.name || null,
        trust_level: res.wakeEnvelope.tier != null ? res.wakeEnvelope.tier : 5, world: res.wakeEnvelope.world || null, via: 'abaham_fallback' }));
    }
  } catch (e) {}
  return null;
}

module.exports = { resolveAtmosphere, applyAlias };
