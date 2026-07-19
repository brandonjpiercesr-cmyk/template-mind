// ⬡B:core.webhook_guard:MODULE:authenticated_once_only_ingress:20260715⬡
// Entered through the ABAHAM door, serving MESSAGES channel paths to a HAM.
// Exact signed bytes establish authenticity;
// one Postgres claim establishes whether this delivery may produce effects.
'use strict';

const crypto = require('node:crypto');
const claims = require('./claim_lock.js');

function sameText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function rawBytes(req) {
  if (req && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  return null;
}

function verifyBlooio(req, secret, nowMs) {
  if (!secret) return { ok:false, reason:'blooio_webhook_secret_unconfigured' };
  const header = String(req.headers && req.headers['x-blooio-signature'] || '');
  if (header) {
    const raw = rawBytes(req);
    // \u2b21B:core.webhook_guard:FIX:hmac_failure_falls_through_to_token:20260716\u2b21
    // Discovered live: Blooio DOES issue a signing secret, but only in the create
    // response of a NEW webhook (whsec_ prefix, Svix-style), and its delivery
    // header format is unverified against this parser. A signature we cannot
    // verify must not veto a token we can: any HMAC failure below falls through
    // to the URL-token check instead of hard-rejecting, so an unexpected header
    // format can never re-kill the founder's texts. A VERIFIED bad signature
    // still rejects only when no valid token rides the URL.
    hmac: if (raw) {
      const fields = Object.create(null);
      header.split(',').forEach(function(part) {
        const at = part.indexOf('=');
        if (at > 0) fields[part.slice(0, at).trim()] = part.slice(at + 1).trim();
      });
      if (!/^\d{9,12}$/.test(fields.t || '') || !/^[a-f0-9]{64}$/i.test(fields.v1 || '')) break hmac;
      const age = Math.abs(Math.floor((nowMs == null ? Date.now() : nowMs) / 1000) - Number(fields.t));
      if (!Number.isFinite(age) || age > 300) break hmac;
      const expected = crypto.createHmac('sha256', secret)
        .update(fields.t + '.', 'utf8').update(raw).digest('hex');
      if (sameText(expected, fields.v1)) return { ok:true, timestamp:Number(fields.t) };
    }
  }
  // \u2b21B:core.webhook_guard:FIX:blooio_shared_token_fallback:20260716\u2b21
  // Verified against the live Blooio API 20260716: webhook create/list return no
  // signing secret and deliveries carry no X-Blooio-Signature header, so the HMAC
  // path above can never authenticate real Blooio traffic. Result in production:
  // every founder text since the guard shipped 20260715 died 503 at this door.
  // The provider-supported authentication is a shared token carried in the
  // registered webhook URL (registration is API-key-gated on Blooio's side; the
  // token lives only there and in env). Same pattern as verifySharedToken below.
  // HMAC stays first-class above so a future signing Blooio needs zero code change.
  const q = (req && req.query) || {};
  const supplied = String(q.token || '');
  if (supplied && sameText(supplied, secret)) {
    return { ok:true, timestamp: Math.floor((nowMs == null ? Date.now() : nowMs) / 1000) };
  }
  return { ok:false, reason:'blooio_auth_missing' };
}

function verifyNylas(req, secrets) {
  const usable = (secrets || []).filter(Boolean);
  if (!usable.length) return { ok:false, reason:'nylas_webhook_secret_unconfigured' };
  const raw = rawBytes(req);
  if (!raw) return { ok:false, reason:'nylas_raw_body_unavailable' };
  const signature = String(req.headers && req.headers['x-nylas-signature'] || '');
  if (!/^[a-f0-9]{64}$/i.test(signature)) return { ok:false, reason:'nylas_signature_invalid' };
  for (const secret of usable) {
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (sameText(expected, signature)) return { ok:true };
  }
  return { ok:false, reason:'nylas_signature_invalid' };
}

function bearer(req) {
  const header = String(req && req.headers && req.headers.authorization || '');
  const match = header.match(/^Bearer[ \t]+(.+)$/i);
  return match ? match[1] : '';
}

function verifySharedToken(req, expected, headerName) {
  if (!expected) return { ok:false, reason:'shared_token_unconfigured' };
  const q = req && req.query || {};
  const supplied = bearer(req) || String(req && req.headers && req.headers[headerName || 'x-omi-token'] || '')
    || String(q.token || '');
  return sameText(supplied, expected)
    ? { ok:true } : { ok:false, reason:'shared_token_invalid' };
}

function eventKey(req, providerId) {
  const raw = rawBytes(req) || Buffer.from(JSON.stringify(req && req.body || null), 'utf8');
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  const id = String(providerId || '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
  return (id ? id + ':' : '') + digest;
}

async function claimWebhook(channel, key, leaseMs) {
  const source = 'webhook:' + channel + ':' + key;
  const claimant = 'webhook.' + channel + '.' + crypto.randomUUID();
  try {
    const won = await claims.claimTask(source, claimant, leaseMs || 7 * 24 * 60 * 60 * 1000);
    if (won) return { ok:true, claimed:true, source:source };
    const row = await claims.inspectClaim(source);
    if (row && row.claimed_by === claimant) {
      return { ok:true, claimed:true, source:source };
    }
    if (row && new Date(row.lease_expires_at).getTime() > Date.now()) {
      return { ok:true, claimed:false, duplicate:true, source:source };
    }
    return { ok:false, reason:'webhook_claim_unverified', source:source };
  } catch (e) {
    return { ok:false, reason:'webhook_claim_unavailable', source:source };
  }
}

module.exports = { verifyBlooio, verifyNylas, verifySharedToken, eventKey,
  claimWebhook, sameText };
