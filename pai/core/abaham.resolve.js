// ⬡B:core.abaham.resolve:MODULE:identity_resolver:20260616⬡
// ABAHAM — the coded front door.
// Resolves HAM identity from ANY channel: phone, email, device UID, direct uid.
// Handles both old HAM_IDENTIFIERS format {ccwa:{uid:uid}} and new {uid:{world, phone, email}}.
// No hardcoded identity. ANYHAM test: runs unchanged for any HAM.

var _ids = null;
function loadIds() {
  if (_ids) return _ids;
  try { _ids = JSON.parse(process.env.HAM_IDENTIFIERS || '{}'); } catch(e) { _ids = {}; }
  return _ids;
}

// New format: {uid: {world, phone, email, tokens}}
// Old format: {ccwa: {uid: uid}, default: {email: uid}}
function resolveNewFormat(payload) {
  var ids = loadIds();
  for (var hamUid in ids) {
    if (hamUid === 'default' || hamUid === 'ccwa') continue; // old format keys
    var hamData = ids[hamUid];
    if (!hamData || typeof hamData !== 'object') continue;
    if (payload.phone && hamData.phone === payload.phone) return { hamUid:hamUid, world:hamData.world||'ANEW', confidence:1.0, method:'phone' };
    if (payload.email && hamData.email && hamData.email.toLowerCase() === payload.email.toLowerCase()) return { hamUid:hamUid, world:hamData.world||'ANEW', confidence:1.0, method:'email' };
    if (payload.uid && hamUid === payload.uid) return { hamUid:hamUid, world:hamData.world||'ANEW', confidence:0.95, method:'direct_uid' };
    if (payload.hamUid && hamUid === payload.hamUid) return { hamUid:hamUid, world:hamData.world||'ANEW', confidence:0.95, method:'direct_uid' };
  }
  return null;
}

// Old format fallback: {ccwa: {process.env.FOUNDER_HAM_UID: process.env.FOUNDER_HAM_UID}}
function resolveOldFormat(payload, channel) {
  var ids = loadIds();
  var channelSection = ids[channel] || ids['default'] || {};
  var uid = payload.uid || payload.hamUid;
  if (uid && channelSection[uid]) {
    var world = ids[channel] && ids[channel]['world'] ? ids[channel]['world'] : 'ANEW';
    return { hamUid:uid, world:world, confidence:0.90, method:'old_format_uid' };
  }
  return null;
}

function resolve(payload, channel) {
  var match = resolveNewFormat(payload) || resolveOldFormat(payload, channel || 'ccwa');
  // CCWA passthrough for founder/testing
  if (!match && process.env.ALLOW_CCWA_PASSTHROUGH === 'true' && (payload.uid || payload.hamUid)) {
    match = { hamUid: payload.uid || payload.hamUid, world:'ANEW', confidence:0.80, method:'ccwa_passthrough' };
  }
  if (!match) return { success:false, reason:'identity not resolved from any channel field' };
  var threshold = parseFloat(process.env.HAM_CONFIDENCE_THRESHOLD || '0.7');
  if (match.confidence < threshold) return { success:false, reason:'confidence below threshold' };
  return { success:true, wakeEnvelope:{ hamUid:match.hamUid, world:match.world, channel:channel||'ccwa', confidence:match.confidence, method:match.method, timestamp:Date.now() } };
}

module.exports = { resolve:resolve };
