// ⬡B:core.stream.session_registry:MODULE:sse_sessions_with_durable_replay:20260708⬡
// entered via the ABAHAM door, serving channel internal
// Phase 1.1 and 1.3 of ANU_LIVE. Two decoupled maps so resume never depends on the live
// connection surviving a drop: LIVE holds only the current SSE response while connected;
// BUFFERS holds each session's event log + lastId and outlives any disconnect until a TTL
// sweep reclaims it. A push always appends to the buffer and writes to the live res if one
// is attached; a reconnect on the same session id replays from the buffer past Last-Event-ID.
// Per-HAM isolation is by session ownership and enforced at push time by the world boundary
// gate. Pure in-process state, no LLM. This shape is what multi-HAM (Phase 7) needs too.
'use strict';

const BUFFER_MAX = Number(process.env.STREAM_BUFFER_MAX) || 100;
const BUFFER_TTL_MS = Number(process.env.STREAM_BUFFER_TTL_MS) || 300000; // 5 min

// sessionId -> res (only while a browser is actively connected)
const live = new Map();
// sessionId -> { hamUid, lastId, events: [{id,event,data}], expiresAt }
const buffers = new Map();
// hamUid -> Set(sessionId)  (membership follows the buffer, not the live connection)
const byHam = new Map();

function _ensureBuffer(sessionId, hamUid) {
  let b = buffers.get(sessionId);
  if (!b) {
    b = { hamUid: hamUid, lastId: 0, events: [], expiresAt: Date.now() + BUFFER_TTL_MS };
    buffers.set(sessionId, b);
    if (!byHam.has(hamUid)) byHam.set(hamUid, new Set());
    byHam.get(hamUid).add(sessionId);
  } else {
    b.expiresAt = Date.now() + BUFFER_TTL_MS; // touched: extend life
  }
  return b;
}

function _sweep() {
  const now = Date.now();
  buffers.forEach(function (b, sid) {
    if (b.expiresAt <= now && !live.has(sid)) {
      buffers.delete(sid);
      const set = byHam.get(b.hamUid);
      if (set) { set.delete(sid); if (set.size === 0) byHam.delete(b.hamUid); }
    }
  });
}
const _sweepTimer = setInterval(_sweep, 60000);
if (_sweepTimer.unref) _sweepTimer.unref();

// Attach a live connection. Creates the buffer if new, reattaches if reconnecting.
function register(sessionId, hamUid, res) {
  _ensureBuffer(sessionId, hamUid);
  live.set(sessionId, res);
  return buffers.get(sessionId);
}

// Connection dropped: forget the live response only. Buffer survives for replay.
function detach(sessionId) {
  live.delete(sessionId);
  const b = buffers.get(sessionId);
  if (b) b.expiresAt = Date.now() + BUFFER_TTL_MS;
}

// Fully remove a session (buffer + live + index). Used by TTL sweep or explicit teardown.
function unregister(sessionId) {
  live.delete(sessionId);
  const b = buffers.get(sessionId);
  if (b) { const set = byHam.get(b.hamUid); if (set) { set.delete(sessionId); if (set.size === 0) byHam.delete(b.hamUid); } }
  buffers.delete(sessionId);
}

function _writeLive(sessionId, id, event, data) {
  const res = live.get(sessionId);
  if (!res) return false;
  try { res.write('id: ' + id + '\n' + 'event: ' + event + '\n' + 'data: ' + JSON.stringify(data) + '\n\n'); return true; }
  catch (e) { live.delete(sessionId); return false; }
}

// Push to one session: always buffered, delivered live if connected.
function pushToSession(sessionId, event, data) {
  const b = buffers.get(sessionId);
  if (!b) return { ok: false, reason: 'no_session' };
  b.lastId += 1;
  const id = b.lastId;
  b.events.push({ id: id, event: event, data: data });
  if (b.events.length > BUFFER_MAX) b.events.shift();
  b.expiresAt = Date.now() + BUFFER_TTL_MS;
  const delivered = _writeLive(sessionId, id, event, data);
  return { ok: true, id: id, delivered: delivered };
}

// Push to every session owned by a HAM.
function pushToHam(hamUid, event, data) {
  const set = byHam.get(hamUid);
  if (!set || set.size === 0) return { ok: false, delivered: 0 };
  let delivered = 0;
  set.forEach(function (sid) { const r = pushToSession(sid, event, data); if (r.delivered) delivered++; });
  return { ok: delivered > 0, delivered: delivered };
}

// Reconnect: replay buffered events after Last-Event-ID to the now-live connection.
function replayFrom(sessionId, lastEventId) {
  const b = buffers.get(sessionId);
  if (!b) return 0;
  const from = Number(lastEventId) || 0;
  let replayed = 0;
  b.events.forEach(function (evt) { if (evt.id > from && _writeLive(sessionId, evt.id, evt.event, evt.data)) replayed++; });
  return replayed;
}

function heartbeat(sessionId) {
  const res = live.get(sessionId);
  if (!res) return false;
  try { res.write(': hb ' + Date.now() + '\n\n'); return true; } catch (e) { live.delete(sessionId); return false; }
}

function stats() { return { sessions: live.size, buffered: buffers.size, hams: byHam.size }; }

module.exports = { register, detach, unregister, pushToSession, pushToHam, replayFrom, heartbeat, stats, _buffers: buffers, _live: live };
