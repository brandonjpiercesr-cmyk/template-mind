// ⬡B:core.stream.gate:MODULE:identity_before_stream:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (every SSE stream rides this gate)
// L0.2 LAW, the Gaslight Cycle's root fix. The front door resolves fully, the
// world is known, and only then does the stream open. On every channel.
//
// This is the ONE place an SSE stream opens in this codebase. A route cannot
// open a stream without handing this gate a resolved identity envelope
// (ham_uid present, GUEST is a valid RESOLUTION RESULT, never a skipped
// resolution). Refusal happens at the boundary, loudly, before a single byte
// moves. Structurally impossible, not procedurally discouraged.
//
// Rides along, per the L0.2 research set:
//   - anti-buffering header (X-Accel-Buffering: no) so the proxy never holds bytes
//   - no-transform so compression middleware cannot re-buffer the stream
//   - heartbeat comment frames under the proxy idle window so long deliberations
//     never look like a dead connection
//
// The heartbeat interval is created AFTER identity resolves, inside this gate,
// so no long-lived emitter can ever capture a pre-identity context again.
// UNIVERSALITY: nothing here is founder-specific; envelope in, stream out, any HAM.
'use strict';

function openIdentityStream(res, envelope, opts) {
  opts = opts || {};
  if (!envelope || !envelope.ham_uid) {
    // The law, enforced: no resolved identity, no stream. The caller answers
    // with a non-stream refusal (401/ok:false); the channel stays silent.
    var err = new Error('stream_refused_identity_unresolved');
    err.code = 'IDENTITY_BEFORE_STREAM';
    throw err;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  var closed = false;
  var hbMs = opts.heartbeatMs || 25000; // under typical proxy idle windows
  var hb = setInterval(function () {
    if (closed) return;
    try { res.write(': hb\n\n'); } catch (e) { cleanup(); }
  }, hbMs);
  if (hb && hb.unref) hb.unref();

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(hb);
  }
  res.on('close', cleanup);

  return {
    ham_uid: envelope.ham_uid,
    envelope: envelope,
    isOpen: function () { return !closed; },
    send: function (obj) {
      if (closed) return false;
      var body = typeof obj === 'string' ? obj : JSON.stringify(obj);
      try { res.write('data: ' + body + '\n\n'); return true; } catch (e) { cleanup(); return false; }
    },
    raw: function (s) {
      if (closed) return false;
      try { res.write(s); return true; } catch (e) { cleanup(); return false; }
    },
    done: function (finalRaw) {
      if (closed) return;
      try { if (finalRaw) res.write(finalRaw); } catch (e) {}
      cleanup();
      try { res.end(); } catch (e) {}
    },
    close: cleanup
  };
}

module.exports = { openIdentityStream };
