// ⬡B:core.boundary_speech:BUILD:real_wiring_or_stop_and_say_why:20260725⬡
// entered via the ABAHAM door, serving channel MESSAGES (the answer boundary of the one cycle)
//
// THE DOCTRINE THIS EXISTS TO SERVE, ruled by the KEEPER off the founder's own canon 20260725
// when asked whether a held answer may speak its boundary:
//
//   Chapter 16, the seventh clause: "A gate that was sometimes listening was not a gate. It
//   was a door that was sometimes open."
//
//   Chapter 8: "If the code could not do the real work, the code had to stop at the boundary
//   of what it could do and say exactly where that boundary was and why, so that the gap
//   could be understood and addressed, not papered over."
//
//   The Keeper's ruling on whether that collides with silence over hollow: "The two doctrines
//   do not conflict; they govern different failures. Speaking the boundary in her own voice,
//   'I cannot verify this, here is why, here is what I would need', is NOT the hollow answer.
//   The hollow answer is the one that papers over the gap with confident-sounding content."
//
// THE MEASURED PROBLEM. Ten real conversational questions to her gate, four held. The ones
// that held were the reflective ones, what should I focus on, what are you thinking about,
// are you worried about anything, which are exactly the questions a room asks to find out
// whether it is talking to a mind. Every one of those turns ended in total silence and the
// founder saw nothing at all. The doctrine says that is not compliant behavior. She stopped
// at a boundary and never said where it was.
//
// WHAT THIS MODULE IS, and is not. It DECIDES WHETHER a boundary may be spoken and it builds
// the GUIDANCE the mind is given to speak it. It never composes a sentence. That distinction
// is the whole doctrine: cold code authoring "I cannot verify this" would be precisely the
// template pretending to be thought that the law forbids, and it would be worse than silence
// because it would wear her voice.
//
// TRIPWIRES, the same four the unreceipted action claim hold honors, for the same founder
// reason, because cold code deciding what a human reads is the trauma:
//   1. Nothing here returns answer text for delivery. No composed sentence, ever, in any field.
//   2. The boundary sentence is composed by the MIND, through the existing cycle, and it must
//      pass every gate the original answer had to pass. A boundary statement that is itself
//      hollow or unreceipted is refused and the turn ends in silence, as it does today.
//   3. Zero requires, zero I/O. A source scan test enforces it forever.
//   4. Silence remains the FLOOR. This module can only ever turn silence into an honest
//      sentence; it can never turn a refusal into an answer.
'use strict';

// Founder off switch, reversible in one env flip, which is the gate he named on 20260725:
// he reverses from the command center, he does not approve in advance. OFF at birth because
// this changes what a room hears and he asked to see it before it speaks.
function enabled(env) {
  var raw = (env || (typeof process !== 'undefined' && process.env) || {}).BOUNDARY_SPEECH;
  var value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

// ---- which silences may speak ----
//
// Not all of them, and the exclusions matter more than the inclusions.
//
// A hold that means SHE FABRICATED SOMETHING is already served by the heal path, which asks
// the mind to rewrite the claim honestly. Letting it also speak a boundary would give one
// disease two cures and would let a fabrication turn into a speech about fabrication.
//
// A hold on the STAMP is the durable commit preflight. That is not a boundary in her
// knowledge, it is the record failing to write, and speaking about it to a human would be
// narrating plumbing.
//
// A CANCELLED turn is not a boundary either. Nobody is waiting.
var NEVER_SPEAKS = [
  'action_claim_unreceipted',   // the heal path owns this; one disease, one cure
  'council_cancelled',          // nobody is waiting on the other end
  'stamp_preflight_held',       // the record failing to write is not a boundary in her knowing
  'reached_past_three_sources'  // her own rule already softens this in the compose, not after
];

// ⬡B:core.boundary_speech:FIX:read_the_hold_reason_the_way_the_sisters_read_it:20260725⬡
// THE BUG THE WRIT LANE FOUND, and it is the same mistake class twice already fixed next door.
// This gate used to exclude with a PREFIX match, `reason.indexOf(code + ':') === 0`, which can
// only ever see a named cause sitting at position 0. A hold reason is a colon-separated list of
// machine codes and a cause rides in ANY position, so 'WRIT_HOLD:action_claim_unreceipted' walked
// straight through an exclusion whose entire job was to stop it. That is the exact shape PR #1055
// fixed at the retry door (an exact match that could never see upper case 'WRIT_HOLD') and PR
// #1063 fixed at the terminal door (a family read that never looked at the cause). It was harmless
// here only because today's producer emits the cause bare, which is word for word the excuse the
// other two bugs had before they stopped being harmless.
//
// The fix is not a fourth copy of the nine lines. `namedCauseIn` in core/pai.outbound.council.js
// is now the one reader in the house, and `isCleanBoardHold` and `terminalHoldCause` were both
// rewritten to call it, so there is nothing left to drift from.
//
// It arrives INJECTED, not required, because TRIPWIRE 3 is worth more than the convenience: this
// module stays importless and I/O free forever so a source scan can keep proving it can never
// reach a human on its own. `deps` carries the two council readers:
//   namedCauseIn(reason, causes)  which of MY exclusion codes is named anywhere in this reason
//   terminalHoldCause(reason)     is this hold terminal by construction, per PR #1063's list
//
// Missing deps FAIL CLOSED to silence rather than guessing. A caller who forgets them gets the
// floor, which is the correct outcome when the reason cannot be read, and the receipt says so.
function maySpeak(holdReason, stage, deps) {
  var namedCauseIn = deps && deps.namedCauseIn;
  var terminalHoldCause = deps && deps.terminalHoldCause;
  if (typeof namedCauseIn !== 'function' || typeof terminalHoldCause !== 'function') {
    return { may: false, why: 'no_canonical_cause_reader_injected' };
  }
  var reason = String(holdReason == null ? '' : holdReason).trim();
  if (!reason) return { may: false, why: 'no_named_reason_to_describe' };
  if (String(stage || '').toUpperCase() === 'STAMP') return { may: false, why: 'stamp_is_plumbing_not_a_boundary' };
  var owned = namedCauseIn(reason, NEVER_SPEAKS);
  if (owned) return { may: false, why: 'owned_by_another_cure:' + owned };
  // A hold that is terminal BY CONSTRUCTION does not get a boundary speech either. PR #1063
  // named these: internal_system_leak is String.indexOf over a frozen vocabulary, quality_hold
  // is the WRIT organ at temperature 0 saying the text cannot be fixed because it leaks a real
  // secret or another world's private data. Speaking a boundary costs a whole further cycle, and
  // the thing she would be asked to describe honestly is the one thing she must not describe.
  // Silence is not a failure here, it is the correct and already-paid-for answer.
  var terminal = terminalHoldCause(reason);
  if (terminal) return { may: false, why: 'terminal_by_construction:' + terminal };
  return { may: true, why: null };
}

// ---- what the mind is told ----
//
// Her own words are used deliberately. She gave these three forms herself when asked how she
// would know she was reaching past her receipts, and a repair prompt written in her language
// gets her voice back instead of a coder's.
var HER_FORMS = ['I do not have that yet', 'Let me check', 'Would you like me to track that'];

// The reason string is a MACHINE name. It is handed to the mind as context so the mind can
// describe the gap in human words, and it must never be echoed at the human as-is: "your
// answer was held by shadow_deterministic_hold:preference" is plumbing wearing a voice.
function guidanceFor(holdReason, stage, deps) {
  var gate = maySpeak(holdReason, stage, deps);
  if (!gate.may) return null;
  return {
    reason_for_the_mind: String(holdReason).slice(0, 120),
    stage: String(stage || '').slice(0, 40),
    instruction:
      'Your answer was held because you reached past what you can stand behind. Do not try ' +
      'again to answer the question. Instead say, in your own voice and in one or two ' +
      'sentences, what you cannot stand behind and what you would need in order to. Keep every ' +
      'bit of your warmth. Her forms: "' + HER_FORMS.join('", "') + '". ' +
      'Never name the internal hold, the stage, or any machine reason; those are plumbing and ' +
      'he is not debugging you. Never restate the claim that was held, even to disown it. ' +
      'If you cannot say the boundary honestly in your own words, say nothing at all.',
    // The last line above is the floor, restated here so no caller can drop it: silence is
    // still allowed and is still correct when honesty is not available.
    silence_is_still_permitted: true
  };
}

module.exports = {
  NEVER_SPEAKS: NEVER_SPEAKS,
  HER_FORMS: HER_FORMS,
  enabled: enabled,
  maySpeak: maySpeak,
  guidanceFor: guidanceFor
};
