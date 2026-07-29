# Autonomous Cycle Signal Contract

⬡B:docs.specs.autonomous_cycle_signal:CONTRACT:durable_signal_before_paid_thought:20260725⬡

The autonomous cycle is default off. Enabling its service permits a bounded poll of the
ONE brain. It does not permit a timer to invent work. PAI, SPAN, CANEW drain, and proactive
stations remain unreachable until the controller proves a governed signal was consumed.

## Signal bead

A producer such as CODA writes one edge-bearing bead into the exact world's brain:

```json
{
  "ham_uid": "<HAM_UID_FROM_ENV>",
  "agent_global": "CODA",
  "stamp_type": "AUTONOMOUS_CYCLE_SIGNAL",
  "source": "<canonical unique source>",
  "content": {
    "status": "ready",
    "wonder": "AUTONOMOUS_CYCLE_WONDER",
    "targets": ["pai"],
    "prompt": "<evidence-grounded assignment required for pai>",
    "expires_at": "<optional ISO instant>",
    "inputs": {},
    "edges": [
      { "type": "triggers", "target": "AUTONOMOUS_CYCLE_WONDER" }
    ]
  }
}
```

Identity comes from environment and request authority. It is never copied from this example.
The source must be unique to the real triggering fact. Reusing a source means reusing the
same work identity, so the durable consumption receipt will correctly prevent a second run.

## Target lanes

One signal owns one effect lane:

- `pai`
- `pai` plus `span`, because SPAN consumes the exact wall returned by that PAI run
- `drain`
- one of `burst`, `ghost_monitor`, `ghost_handoff`, `dawn`, `hunch`, `press`, or `sage`

Combining unrelated lanes is invalid. A producer emits separate signals so every effect has
its own claim, receipt, budget slot, result, and cost lineage. PRESS interests belong under
`inputs.press.interests`; the true-zero template supplies no default interests.

## Required execution order

1. Read only recent `AUTONOMOUS_CYCLE_SIGNAL` beads for the exact HAM.
2. Refuse saturated, stale, expired, malformed, orphaned, or cross-HAM input.
3. Acquire the exact-HAM singleton and signal claims.
4. Verify the durable rolling-window ceiling from prior consumption receipts.
5. Write `AUTONOMOUS_CYCLE_CONSUMED` with typed edges.
6. Read the exact receipt back and prove its digest.
7. Run only the target lane named by that receipt.
8. Write `AUTONOMOUS_CYCLE_RESULT` with stage facts and lineage.

SPAN adds `AUTONOMOUS_EFFECT_CONSUMED` keyed by the exact wall digest before its model call.
That receipt prevents the same wall from buying a second SPAN judgment after a restart or a
different signal.

Unreadable claims, brain reads, writes, or readbacks fail closed before effects. Consumption
is reserved before execution, so a crash can leave a visible consumed signal that needs a
new superseding signal. It cannot silently repurchase the old one.

## Environment controls

- `AUTONOMOUS_CYCLE_ENABLED`: strict `true` enables cheap signal polling; missing is off.
- `AUTONOMOUS_SIGNAL_POLL_MS`: bounded from 30 seconds to 5 minutes.
- `AUTONOMOUS_SIGNAL_LIMIT`: bounded recent signal window.
- `AUTONOMOUS_SIGNAL_MAX_AGE_MS`: bounded signal age.
- `AUTONOMOUS_TICK_CEILING`: durable consumed-signal ceiling, default 1.
- `AUTONOMOUS_TICK_WINDOW_MS`: durable receipt window, default 1 hour.
- `AUTONOMOUS_CLAIM_LEASE_MS`: bounded single-flight lease.
- `CANEW_DRAIN_URL`: required only for a `drain` signal. There is no baked endpoint.

Do not enable the cycle until the intended producer writes this exact contract and the claim
store succeeds. A deployed service with the flag absent remains healthy and spends zero.
