// ⬡B:core.reach.presence_snapshot:MODULE:per_ham_circle_evidence:20260717⬡
//
// ATMOSPHERE resolves identity. Circle owns live presence. REACH consumes this
// read-only, exact-HAM snapshot as council evidence so those two concepts are
// never conflated. No location is exposed to the model or lifecycle receipts.
'use strict';

const crypto = require('node:crypto');

const ONLINE_WINDOW_MS = 40 * 1000;
const AWAY_WINDOW_MS = 90 * 1000;

function storeUrl() {
  return String(process.env.AIBE_BRAIN_URL || '').replace(/\/$/, '');
}
function storeKey() { return process.env.AIBE_BRAIN_KEY || ''; }
function normalizeHamUid(value) {
  const uid = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._:-]{2,160}$/.test(uid) ? uid : '';
}
function schemaFor(uid) { return 'ham_' + uid.toLowerCase(); }
function canonicalCreatedAt(value) {
  const millis = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}
function safeActivity(value) {
  return typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim().slice(0, 120) || null : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

// age_ms is useful display data, but it is not a new Circle observation. Hash
// only the durable heartbeat identity plus the derived status bucket so an
// unchanged heartbeat does not manufacture a new REACH decision every poll.
function stablePresenceIdentity(value) {
  return { version:value.version, ham_uid:value.ham_uid,
    observed:value.observed, status:value.status,
    heartbeat_at:value.heartbeat_at, activity:value.activity,
    source:value.source, row_observed_at:value.row_observed_at || null,
    unavailable_reason:value.unavailable_reason || null };
}

function snapshotFromPresence(uid, presence, observedAt, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!presence) {
    const value = { version:1, ham_uid:uid, observed:false, status:'offline',
      heartbeat_at:null, age_ms:null, activity:null, source:'circle.presence' };
    return Object.assign({ ok:true, readback_verified:true,
      snapshot_digest:digest(stablePresenceIdentity(value)) }, value);
  }
  const heartbeatMs = Number(presence.ts);
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs > now + 5 * 60 * 1000 ||
      String(presence.ham || '').trim().toUpperCase() !== uid) {
    return { ok:false, readback_verified:false, reason:'presence_binding_invalid' };
  }
  const ageMs = Math.max(0, now - heartbeatMs);
  const status = presence.ghost === true ? 'ghost'
    : ageMs <= ONLINE_WINDOW_MS ? 'online'
      : ageMs <= AWAY_WINDOW_MS ? 'away' : 'offline';
  const value = { version:1, ham_uid:uid, observed:true, status:status,
    heartbeat_at:new Date(heartbeatMs).toISOString(), age_ms:ageMs,
    activity:safeActivity(presence.activity), source:'circle.presence',
    row_observed_at:observedAt };
  return Object.assign({ ok:true, readback_verified:true,
    snapshot_digest:digest(stablePresenceIdentity(value)) }, value);
}

async function readPresenceSnapshot(hamUid, options) {
  const uid = normalizeHamUid(hamUid);
  if (!uid) return { ok:false, readback_verified:false, reason:'presence_ham_invalid' };
  if (!storeUrl() || !storeKey()) {
    const value = { version:1, ham_uid:uid, observed:false, status:'unknown',
      heartbeat_at:null, age_ms:null, activity:null, source:'circle.presence',
      unavailable_reason:'presence_store_unconfigured' };
    return Object.assign({ ok:true, readback_verified:false,
      snapshot_digest:digest(stablePresenceIdentity(value)) }, value);
  }
  const url = storeUrl() + '/rest/v1/abacia?select=' +
    encodeURIComponent('id,ham_uid,agent_global,acl_stamp,source,content,created_at,updated_at') +
    '&acl_stamp=ilike.' + encodeURIComponent('*circle.presence*') +
    '&order=updated_at.desc&limit=2';
  let response;
  try {
    response = await fetch(url, { headers:{ apikey:storeKey(),
      Authorization:'Bearer ' + storeKey(), 'Accept-Profile':schemaFor(uid) } });
  } catch (e) { response = null; }
  if (!response || response.ok !== true) {
    return { ok:false, readback_verified:false, reason:'presence_read_failed' };
  }
  const rows = await response.json().catch(function(){ return null; });
  if (!Array.isArray(rows)) {
    return { ok:false, readback_verified:false, reason:'presence_read_invalid' };
  }
  if (!rows.length) return snapshotFromPresence(uid, null, null,
    options && options.nowMs);
  if (rows.length > 1) {
    // Circle heartbeats are append-only, so multiple rows are normal. The
    // ordered first row is authoritative, but every returned row must remain in
    // the exact HAM schema and carry canonical Circle provenance.
    const leaked = rows.some(function(row) {
      return row && row.ham_uid && String(row.ham_uid).toUpperCase() !== uid;
    });
    if (leaked) return { ok:false, readback_verified:false,
      reason:'presence_cross_ham_mismatch' };
  }
  const row = rows[0];
  if (!row || String(row.ham_uid || '').toUpperCase() !== uid ||
      row.agent_global !== 'CIRCLE' || row.source !== 'circle.presence' ||
      !String(row.acl_stamp || '').toLowerCase().includes('circle.presence')) {
    return { ok:false, readback_verified:false, reason:'presence_row_binding_invalid' };
  }
  let presence;
  try { presence = JSON.parse(row.content || ''); }
  catch (e) { presence = null; }
  if (!presence || typeof presence !== 'object' || Array.isArray(presence)) {
    return { ok:false, readback_verified:false, reason:'presence_content_invalid' };
  }
  return snapshotFromPresence(uid, presence,
    canonicalCreatedAt(row.updated_at) || canonicalCreatedAt(row.created_at),
    options && options.nowMs);
}

module.exports = { readPresenceSnapshot,
  _test:{ normalizeHamUid, schemaFor, snapshotFromPresence, stablePresenceIdentity,
    digest } };
