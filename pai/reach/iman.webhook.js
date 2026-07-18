// ⬡B:reach.iman.webhook:MODULE:terminal_truth_subscriptions:20260717⬡
'use strict';

const crypto = require('node:crypto');
const REQUIRED = ['message.opened', 'thread.replied', 'message.bounce_detected'];
const readyCache = new Map();

function keyDigest(key) {
  return crypto.createHash('sha256').update(String(key || ''), 'utf8').digest('hex');
}
function expectedUrl() {
  const explicit = String(process.env.NYLAS_WEBHOOK_URL || '').trim();
  const base = String(process.env.AIBEBASE_URL || 'https://aibebase.onrender.com')
    .trim().replace(/\/+$/, '');
  return (explicit || base + '/iman/inbound').replace(/\/+$/, '');
}
function keys() {
  const values = [process.env.NYLAS_API_KEY, process.env.NYLAS_SANDBOX_KEY,
    process.env.NYLAS_PRODUCTION_KEY]
    .map(function(value){ return String(value || '').trim(); }).filter(Boolean);
  return values.filter(function(value, index){ return values.indexOf(value) === index; });
}
function cacheTtlMs() {
  const value = Number(process.env.NYLAS_WEBHOOK_READY_CACHE_MS);
  return Number.isFinite(value) && value >= 1000 ? Math.min(value, 3600000) : 300000;
}
function hasVerificationSecret() {
  return [process.env.NYLAS_WEBHOOK_SECRET,
    process.env.NYLAS_PRODUCTION_WEBHOOK_SECRET,
    process.env.NYLAS_SANDBOX_WEBHOOK_SECRET]
    .concat(String(process.env.NYLAS_WEBHOOK_SECRETS || '').split(','))
    .some(function(value){ return String(value || '').trim().length > 0; });
}
function validateReadback(hook, url) {
  if (!hook || String(hook.webhook_url || '').replace(/\/+$/, '') !== url) {
    return { ok:false, reason:'nylas_terminal_destination_readback_mismatch' };
  }
  if (String(hook.status || '').toLowerCase() !== 'active') {
    return { ok:false, reason:'nylas_terminal_destination_not_active' };
  }
  const triggers = Array.isArray(hook.trigger_types) ? hook.trigger_types : null;
  if (!triggers || !REQUIRED.every(function(trigger){ return triggers.indexOf(trigger) !== -1; })) {
    return { ok:false, reason:'nylas_terminal_trigger_readback_mismatch' };
  }
  return { ok:true, triggers:REQUIRED.slice() };
}

async function ensureForKey(key, keyIndex) {
  const url = expectedUrl();
  let response, payload;
  try {
    response = await fetch('https://api.us.nylas.com/v3/webhooks', {
      headers:{ Authorization:'Bearer ' + key, Accept:'application/json' }
    });
    if (!response || !response.ok) return { ok:false, app:keyIndex,
      reason:'nylas_webhook_list_failed', status:response && response.status || null };
    payload = await response.json();
  } catch (e) { return { ok:false, app:keyIndex, reason:'nylas_webhook_list_failed' }; }
  const hooks = payload && Array.isArray(payload.data) ? payload.data : [];
  const exact = hooks.filter(function(item) {
    return String(item && item.webhook_url || '').replace(/\/+$/, '') === url;
  });
  if (exact.length !== 1 || !exact[0].id) return { ok:false, app:keyIndex,
    reason:exact.length > 1 ? 'nylas_iman_destination_ambiguous'
      : 'nylas_iman_destination_missing_requires_verified_creation' };
  const hook = exact[0];
  const existing = Array.isArray(hook.trigger_types) ? hook.trigger_types.slice() : [];
  const merged = existing.slice();
  REQUIRED.forEach(function(trigger) {
    if (merged.indexOf(trigger) === -1) merged.push(trigger);
  });
  const needsUpdate = merged.length !== existing.length ||
    String(hook.status || '').toLowerCase() !== 'active';
  if (needsUpdate) {
    let update;
    try {
      update = await fetch('https://api.us.nylas.com/v3/webhooks/' +
        encodeURIComponent(hook.id), { method:'PUT',
        headers:{ Authorization:'Bearer ' + key, 'Content-Type':'application/json',
          Accept:'application/json' }, body:JSON.stringify({
          trigger_types:merged, status:'active'
        }) });
    } catch (eUpdate) { update = null; }
    if (!update || !update.ok) return { ok:false, app:keyIndex,
      reason:'nylas_terminal_destination_activation_failed',
      status:update && update.status || null };
  }
  let readback, readbackPayload;
  try {
    readback = await fetch('https://api.us.nylas.com/v3/webhooks/' +
      encodeURIComponent(hook.id), { headers:{ Authorization:'Bearer ' + key,
        Accept:'application/json' } });
    if (!readback || !readback.ok) return { ok:false, app:keyIndex,
      reason:'nylas_terminal_trigger_readback_failed',
      status:readback && readback.status || null };
    readbackPayload = await readback.json();
  } catch (eReadback) {
    return { ok:false, app:keyIndex, reason:'nylas_terminal_trigger_readback_failed' };
  }
  const verified = validateReadback(readbackPayload && readbackPayload.data, url);
  if (!verified.ok) return Object.assign({ app:keyIndex }, verified);
  readyCache.set(keyDigest(key), Date.now() + cacheTtlMs());
  return { ok:true, app:keyIndex,
    action:needsUpdate ? 'activated_and_subscribed' : 'verified_active',
    triggers:REQUIRED.slice(), destination:url };
}

async function requireReadyForKey(key) {
  key = String(key || '').trim();
  if (!key) return { ok:false, reason:'no_nylas_application_key' };
  // A configured Nylas destination is not terminal truth if this service
  // cannot authenticate its callback. Check this before the ready cache so a
  // removed local verifier cannot inherit an earlier positive provider read.
  if (!hasVerificationSecret()) {
    return { ok:false, reason:'nylas_webhook_secret_unconfigured' };
  }
  const digest = keyDigest(key);
  if ((readyCache.get(digest) || 0) > Date.now()) {
    return { ok:true, cached:true, destination:expectedUrl(), triggers:REQUIRED.slice() };
  }
  const result = await ensureForKey(key, null);
  return result.ok ? result : Object.assign({ cached:false }, result);
}

async function ensureWebhooks() {
  const appKeys = keys();
  if (!appKeys.length) return { ok:false, reason:'no_nylas_application_key', results:[] };
  const results = [];
  for (let i = 0; i < appKeys.length; i++) results.push(await ensureForKey(appKeys[i], i));
  return { ok:results.every(function(result){ return result.ok; }), results:results };
}

module.exports = { ensureWebhooks, requireReadyForKey,
  _test:{ ensureForKey, REQUIRED, expectedUrl, validateReadback,
    hasVerificationSecret,
    clearCache:function(){ readyCache.clear(); } } };
