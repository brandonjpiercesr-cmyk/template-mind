// ⬡B:core.clair.files.store:MODULE:one_source_for_the_two_way_file_lane:20260726⬡
// THE TWO-WAY FILE LANE, single-sourced.
//
// He asked for this by name: "can she send and receive files back and forth? We
// need to build that." Receive was genuinely built (reach/iman.js downloads and
// reads real inbound attachments, core/inbox.zero.js opens them rather than
// assuming them). Send was not: routes/clair.files.routes.js held a complete,
// receipted, signed-URL lane that was never mounted anywhere, and IMAN had no way
// to put a byte of a file on an outbound message.
//
// Both halves now read one source, this file, so the storage ground is never twinned:
//   routes/clair.files.routes.js  the founder-facing upload / list / download surface
//   reach/iman.js                 outbound attachments resolved by { key }
//
// Storage is Supabase Storage on the SAME host the brain bank already lives on
// (MEMORY_BANK_URL / AIBE_BRAIN_URL + /storage/v1, same key as bearer), the exact
// ground core/veer/veer.persist.js also stands on. Zero new infrastructure.
//
// LAWS honored:
// - IDENTITY IS ENV ONLY. Nothing personal, no HAM UID, no address, no name lives
//   in this file. The bucket name is infrastructure, not a person, and it is still
//   overridable by env.
// - REAL RECEIPTS ONLY. ok:true only after the storage host confirms. Every miss
//   returns a NAMED reason, never a throw and never a hollow success.
// - COLD CODE ONLY WHERE IT BELONGS. This module moves bytes and mints signed URLs.
//   It judges nothing and decides nothing.
'use strict';

function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || ''; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY || ''; }
function bucket() { return process.env.CLAIR_FILES_BUCKET || 'clair-files'; }

// The bank URL may or may not carry a trailing /rest/v1 or slash; the storage API
// lives on the same host at /storage/v1.
function storageBase() {
  var bu = String(_bu()).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return bu ? bu + '/storage/v1' : '';
}

function configured() { return !!(_bu() && _bk() && bucket()); }

function authHeaders() {
  var k = _bk();
  return { apikey: k, Authorization: 'Bearer ' + k };
}

function sanitizeFilename(name) {
  return String(name == null ? '' : name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

// <ham>/<epoch>_<filename>, so one bucket holds every world's handoffs in clean
// per-HAM folders and a re-upload never overwrites an earlier one.
function buildObjectKey(hamUid, filename, at) {
  var ham = String(hamUid == null ? '' : hamUid).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'GLOBAL';
  return ham + '/' + (at || Date.now()) + '_' + sanitizeFilename(filename);
}

// A key must stay inside the bucket. No traversal, no absolute path, no scheme.
function validKey(key) {
  var k = String(key == null ? '' : key);
  if (!k || k.length > 512) return false;
  if (k.indexOf('..') !== -1 || k[0] === '/' || /[\r\n\0]/.test(k)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(k)) return false;
  return true;
}

async function putObject(args) {
  args = args || {};
  if (!configured()) return { ok: false, reason: 'file_lane_storage_unconfigured' };
  if (!validKey(args.key)) return { ok: false, reason: 'file_lane_key_invalid' };
  var bytes = args.bytes;
  if (!bytes || !bytes.length) return { ok: false, reason: 'file_lane_bytes_invalid' };
  var r;
  try {
    r = await fetch(storageBase() + '/object/' + bucket() + '/' + args.key, {
      method: 'POST',
      headers: Object.assign({}, authHeaders(), {
        'Content-Type': args.content_type || 'application/octet-stream',
        'x-upsert': 'true'
      }),
      body: bytes
    });
  } catch (e) {
    return { ok: false, reason: 'file_lane_upload_unreachable', detail: String(e && e.message || e).slice(0, 200) };
  }
  if (!r || !r.ok) {
    var t = '';
    try { t = await r.text(); } catch (eText) { t = ''; }
    return { ok: false, reason: 'file_lane_upload_failed', status: r ? r.status : null, detail: String(t).slice(0, 200) };
  }
  return { ok: true, key: args.key, bucket: bucket(), bytes: bytes.length,
    content_type: args.content_type || 'application/octet-stream' };
}

// Read the real bytes back. This is the call IMAN makes when an outbound
// attachment is handed in as { filename, key }.
async function getObject(key) {
  if (!configured()) return { ok: false, reason: 'file_lane_storage_unconfigured' };
  if (!validKey(key)) return { ok: false, reason: 'file_lane_key_invalid' };
  var r;
  try {
    r = await fetch(storageBase() + '/object/' + bucket() + '/' + key, { headers: authHeaders() });
  } catch (e) {
    return { ok: false, reason: 'file_lane_download_unreachable', detail: String(e && e.message || e).slice(0, 200) };
  }
  if (!r || !r.ok) return { ok: false, reason: 'file_lane_object_not_found', status: r ? r.status : null };
  var buf;
  try { buf = Buffer.from(await r.arrayBuffer()); }
  catch (eBytes) { return { ok: false, reason: 'file_lane_bytes_unreadable' }; }
  if (!buf || !buf.length) return { ok: false, reason: 'file_lane_object_empty' };
  return { ok: true, key: key, bytes: buf,
    content_type: (r.headers && r.headers.get && r.headers.get('content-type')) || 'application/octet-stream' };
}

// A short-lived signed URL, never a public permalink.
async function signedUrl(key, expiresIn) {
  if (!configured()) return { ok: false, reason: 'file_lane_storage_unconfigured' };
  if (!validKey(key)) return { ok: false, reason: 'file_lane_key_invalid' };
  var j;
  try {
    var r = await fetch(storageBase() + '/object/sign/' + bucket() + '/' + key, {
      method: 'POST',
      headers: Object.assign({}, authHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: expiresIn || 300 })
    });
    j = await r.json();
  } catch (e) {
    return { ok: false, reason: 'file_lane_sign_unreachable', detail: String(e && e.message || e).slice(0, 200) };
  }
  var signed = j && (j.signedURL || j.signedUrl);
  if (!signed) return { ok: false, reason: 'file_lane_sign_failed' };
  return { ok: true, url: storageBase() + String(signed).replace(/^\/storage\/v1/, '') };
}

module.exports = {
  putObject: putObject,
  getObject: getObject,
  signedUrl: signedUrl,
  buildObjectKey: buildObjectKey,
  sanitizeFilename: sanitizeFilename,
  validKey: validKey,
  configured: configured,
  storageBase: storageBase,
  bucket: bucket
};
