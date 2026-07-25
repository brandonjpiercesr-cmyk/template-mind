// ⬡B:core.ham_session_authorization:MODULE:signed_ham_session_boundary:20260717⬡
// entered via the ABAHAM door, serving the authenticated MESSAGES portal path to a HAM
'use strict';

const crypto = require('node:crypto');

const COOKIE_NAME = 'anu_ham';
const HAM_PATTERN = /^[A-Z0-9._:-]{2,160}$/;
const MAC_PATTERN = /^[a-f0-9]{64}$/;

// Preserve the signed-session key order already used by advisor.face.routes.
// MEMORY_BANK_KEY is the migration-compatible fallback when the legacy bank key
// is not present. Both are existing server-only environment values.
function signingSecret() {
  return process.env.AIBE_BRAIN_KEY || process.env.MEMORY_BANK_KEY || '';
}

function normalizeHamUid(value) {
  const hamUid = String(value || '').trim().toUpperCase();
  return HAM_PATTERN.test(hamUid) ? hamUid : null;
}

function signHamSession(hamUid) {
  const normalized = normalizeHamUid(hamUid);
  const secret = signingSecret();
  if (!normalized || !secret) return null;
  const mac = crypto.createHmac('sha256', secret).update(normalized).digest('hex');
  return normalized + '.' + mac;
}

function verifySessionToken(token) {
  const secret = signingSecret();
  if (!secret) return { ok:false, status:503, reason:'ham_session_secret_unconfigured' };
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw || raw.length > 320) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return { ok:false, status:401, reason:'ham_session_invalid' };
  const hamUid = normalizeHamUid(raw.slice(0, separator));
  const suppliedMac = raw.slice(separator + 1).toLowerCase();
  if (!hamUid || !MAC_PATTERN.test(suppliedMac)) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  const expectedMac = crypto.createHmac('sha256', secret).update(hamUid).digest('hex');
  const supplied = Buffer.from(suppliedMac, 'hex');
  const expected = Buffer.from(expectedMac, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  return { ok:true, hamUid:hamUid };
}

function cookieToken(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (e) { return null; }
}

function bearerToken(authorization) {
  if (typeof authorization !== 'string') return null;
  const match = authorization.match(/^Bearer[ \t]+([^ \t]+)[ \t]*$/i);
  return match ? match[1] : null;
}

function sessionTokenFromRequest(req) {
  const requestHeaders = req && req.headers || {};
  const authorization = requestHeaders.authorization || requestHeaders.Authorization;
  if (authorization !== undefined) return bearerToken(authorization);
  return cookieToken(requestHeaders.cookie || requestHeaders.Cookie);
}

function forwardSessionHeaders(req, headers) {
  const out = headers || {};
  const token = sessionTokenFromRequest(req);
  if (token) out.Authorization = 'Bearer ' + token;
  return out;
}

// Authenticate the signed session before a route reads caller-selected identity.
// Routes whose HAM lives in a path/body use authorizeHamRequest below to add the
// exact-HAM comparison. Session-owned doors such as /cib use this form and take
// the HAM only from the verified credential.
function authorizeSessionRequest(req) {
  const requestHeaders = req && req.headers || {};
  const authorization = requestHeaders.authorization || requestHeaders.Authorization;
  let credential = null;
  let kind = null;
  if (authorization !== undefined) {
    credential = bearerToken(authorization);
    kind = 'bearer';
    // An explicit Authorization header is authoritative. Never downgrade an
    // invalid bearer to a cookie that happened to ride beside it.
    if (!credential) return { ok:false, status:401, reason:'ham_session_invalid' };
  } else {
    credential = cookieToken(requestHeaders.cookie || requestHeaders.Cookie);
    kind = 'cookie';
  }
  if (!credential) return { ok:false, status:401, reason:'ham_session_required' };
  const verified = verifySessionToken(credential);
  if (!verified.ok) return verified;
  return { ok:true, hamUid:verified.hamUid, kind:kind };
}

function authorizeHamRequest(req, expectedHamUid) {
  const expected = normalizeHamUid(expectedHamUid);
  if (!expected) return { ok:false, status:400, reason:'valid_ham_uid_required' };
  const verified = authorizeSessionRequest(req);
  if (!verified.ok) return verified;
  if (verified.hamUid !== expected) {
    return { ok:false, status:403, reason:'ham_session_forbidden' };
  }
  return { ok:true, hamUid:expected, kind:verified.kind };
}

// Signed-session authentication is the proof. Atmosphere then canonicalizes the
// authenticated HAM and supplies its world context. A caller-selected alias may
// never resolve to a different HAM for an exact-HAM protected read.
async function authorizeExactHamRequest(req, expectedHamUid, deps) {
  const session = authorizeHamRequest(req, expectedHamUid);
  if (!session.ok) return session;
  const resolveAtmosphere = deps && deps.resolveAtmosphere
    || require('./atmosphere.gate.js').resolveAtmosphere;
  let envelope;
  try { envelope = await resolveAtmosphere({ hamUid:session.hamUid }); }
  catch (e) { return { ok:false, status:503, reason:'atmosphere_unavailable' }; }
  const resolved = normalizeHamUid(envelope && envelope.ham_uid);
  if (!resolved) return { ok:false, status:401, reason:'identity_unresolved' };
  if (resolved !== session.hamUid) {
    return { ok:false, status:409, reason:'ham_uid_mismatch' };
  }
  return { ok:true, hamUid:resolved, kind:session.kind, envelope:envelope };
}

// ⬡B:core.ham_session_authorization:WIRE:internal_callers_sign_the_same_session:20260725⬡
// THE INTERNAL LEG OF THE SAME ONE SOURCE. The mind calls its own founder-scoped OS
// doors over SELF_BASE_URL (alive.arrive, alive.pulse, the screen piece registry, the
// dawn agent). Those hops leave this process and come back in over the public internet,
// so they are indistinguishable from a stranger at the door and CANNOT be recognized by
// origin. Before this, that was the whole reason those doors could not be closed: closing
// them would have blinded A'NU to the founder's own calendar.
//
// So the internal caller proves itself with the SAME signed session a browser carries,
// minted here from the SAME server-only secret, verified by the SAME verifySessionToken.
// No second idiom, no shared "internal key", no new environment variable: a server that
// already holds the signing secret can always mint a token for the HAM it is serving,
// and a server that does not hold it gets null and is refused like anyone else.
//
// Returns null (never a partial or empty header bag) when the secret or the HAM is
// missing, so a caller that spreads it into a fetch sends nothing rather than sending a
// header that looks like credentials and is not.
function internalSessionHeaders(hamUid) {
  const token = signHamSession(hamUid);
  if (!token) return null;
  return { Authorization: 'Bearer ' + token };
}

function requireHamSession(req, res, expectedHamUid) {
  const authorized = authorizeHamRequest(req, expectedHamUid);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

async function requireExactHamSession(req, res, expectedHamUid, deps) {
  const authorized = await authorizeExactHamRequest(req, expectedHamUid, deps);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

function requireAnyHamSession(req, res) {
  const authorized = authorizeSessionRequest(req);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

module.exports = {
  COOKIE_NAME,
  signingSecret,
  normalizeHamUid,
  signHamSession,
  verifySessionToken,
  sessionTokenFromRequest,
  forwardSessionHeaders,
  authorizeSessionRequest,
  authorizeHamRequest,
  authorizeExactHamRequest,
  internalSessionHeaders,
  requireHamSession,
  requireExactHamSession,
  requireAnyHamSession,
  _test:{ cookieToken, bearerToken }
};
