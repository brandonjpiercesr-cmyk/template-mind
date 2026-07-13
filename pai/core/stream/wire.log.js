// ⬡B:core.stream.wire_log:MODULE:structured_directive_gate_logging:20260708⬡
// entered via the ABAHAM door, serving channel internal
// Phase 8 of ANU_LIVE. Every directive and gate decision on the live wire produces one
// structured log line (Render captures stdout), and every REFUSAL additionally stamps a
// bead so anomalies are queryable from the brain, not just greppable from logs. Deliveries
// do not stamp individually (the brain is a mind, not an access log); the consumer stamps
// its own delivery receipts with lineage. Cold code, no LLM.
'use strict';

const brain = require('../brain.client');

function line(evt) {
  // one parseable line per decision: WIRE <verdict> <op> ham=<uid> sid=<sid> gate=<gate> reason=<r>
  try {
    console.log('[WIRE] ' + JSON.stringify({
      t: new Date().toISOString(),
      verdict: evt.verdict,            // delivered | buffered | refused | queued_approval
      op: evt.op || null,
      ham: evt.hamUid || null,
      sid: evt.sessionId ? String(evt.sessionId).slice(0, 8) : null,
      gate: evt.gate || null,          // describe_not_execute | world_boundary | tier | none
      reason: evt.reason || null,
      eventId: evt.eventId || null,
      origin: evt.origin || 'http_push' // http_push | screen_consumer | connect_context | vara_embed
    }));
  } catch (e) { /* logging never breaks the wire */ }
}

// Refusals are the anomalies worth remembering. Stamped fire-and-forget.
function refusal(evt) {
  line(Object.assign({ verdict: 'refused' }, evt));
  if (!evt || !evt.hamUid) return;
  brain.writeBead({
    hamUid: evt.hamUid,
    agentGlobal: 'WIRE',
    source: 'wire.refusal.' + evt.hamUid + '.' + Date.now(),
    type: 'WIRE_REFUSAL',
    content: { gate: evt.gate, reason: evt.reason, op: evt.op || null, origin: evt.origin || 'http_push' },
    summary: '[WIRE REFUSED ' + (evt.gate || 'gate') + '] ' + (evt.reason || ''),
    importance: 6,
    edges: [{ type: 'guards', target: evt.hamUid + '.screen' }]
  }).catch(function () {});
}

module.exports = { line, refusal };
