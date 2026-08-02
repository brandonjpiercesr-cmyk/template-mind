// ⬡B:core.freestyle_chatter:MODULE:the_ride_a_person_sees_while_the_cycle_cooks:20260802⬡
// entered via the ABAHAM door, serving channel MESSAGES (a live screen is a reach surface)
//
// Founder, 20260802 (NWO pt3): "Freestyling, like rapping. Microsecond hops of the FCW wall.
// Agent FIND goes first, looks at the query, tries to microsecond get it, and sends it back.
// That's the chatter." And his own correction on the spec's scope: "maybe the point is HAM TO
// A'NU ALWAYS uses this, no matter when or where." So the ride is not a feature of one door;
// it is the shape of how she answers, and a door that cannot carry it is a transport gap to
// close, never a reason to answer without it.
//
// Spec of record: docs/specs/FREESTYLE_CHATTER_SPEC_20260802.md. This file is STAGE 1 of it,
// the emitter, and nothing else. It calls no model, opens no timer, and reaches nobody: the
// only thing it can do is describe a machine fact about a turn that is already running to a
// screen that is already open, over the wire that is already held.
//
// THE VOICE LAW THIS FILE IS BUILT AROUND (granddaddy-911, non-negotiable):
// A'NU is the only thing that speaks to a human. Agent FIND is a registered WORK
// (station.agent_find, core/agent.find.js:17) and a work never speaks. Its own wake record
// forbids even HER from narrating it (core/agent.find.js:430-431). So this emitter has no
// path, not one, that can put a sentence in front of a person. There is no template here, no
// composed line, no bead summary, and no redisplay of anything. Every string this module can
// emit is a machine token with no space in it, and tests/freestyle.chatter.no.composed.voice
// proves that mechanically over the real emitted payload rather than trusting the reading.
// One composed first-person line here ("my team's checking on that" written by cold code)
// would be cold code impersonating her: the exact crime of the 20260718 stale-wall template
// (routes/alive.arrive.routes.js:94-102) and of the machine string dressed up as her voice
// (core/reach/screen.consumer.js:130-134). This estate has paid for that twice.
//
// WHY VOICE A ONLY, AND WHAT IS DELIBERATELY NOT BUILT HERE.
// The spec names three legally emittable voices. VOICE A is word-free or minimal chrome.
// VOICE B is a byte-for-byte redisplay of HER OWN prior committed words, the arrival-wall
// shape (routes/alive.arrive.routes.js:269-293, 190-202). VOICE C is a real committed cycle
// speaking, which no emitter can manufacture. VOICE B depends on the spec's open Q1: WHICH
// stamp classes count as her own committed words. That question is A'NU's to rule, not this
// lane's, and the FIND receipt on the wall carries selected_row_ids and reasons but not the
// committed answer bytes of those rows, so VOICE B would additionally need a fresh brain read
// at the one instant in the turn this ride exists to fill. Stage 1 therefore ships VOICE A
// alone and leaves NO dormant her-words code path to be switched on by accident. When Q1 is
// ruled, VOICE B lands as its own stage with its own provenance filter, absolute time labels,
// and freshness window per class (spec Q6).
//
// THE HONEST NUMBER, MEASURED, NOT HOPED (spec section 5, Stage 0).
// "Microsecond" is the founder's idiom for "before the team even warms up." It is not a claim
// this build may ship. Agent FIND's compact scan is a serial per-lane brain page loop
// (core/find.js:490). Measured 20260802 by calling planWallEvidence directly against the live
// brain, six runs across two HAMs, three questions each: query_ms 933, 950, 973, 978, 1150,
// 1386, at 18 compact pages every time. Median about 975ms, roughly one second. That is the
// window this ride fills, and it is the number to quote. Whether that serial loop should be
// parallelized is A'NU's call (spec Q5), because core/find.js is the one query carrier.
//
// WHAT THE FACES STILL OWE THIS SURFACE (Stage 2, a separate lane).
// The canvas titles a surface with its own surfaceId when the title is empty
// (routes/alive.portal.routes.js, the createSurface branch of render), and the OS launcher
// renders updateComponents by joining component text into showAnswer
// (routes/face/os.launcher.routes.js, handleDir). Both behaviours are why the components
// below carry no text field at all: on today's faces they are word-free by construction. The
// surfaceId-as-heading fallback is a real face defect that predates this lane and also hits
// the overseer surface; Stage 2 gives the freestyle surface a presence rendering and stops
// falling back to a raw id. Until then this module stays dark by default.
'use strict';

// The push origin is deliberately NOT screen_consumer. That name is the ambient unprompted
// mirror lane and it is the only origin the 6-per-hour interruption budget counts
// (core/reach/screen.consumer.js:74-90). A freestyle ride only ever exists on a turn a person
// just asked for, and a person asking always gets answered, so it must not spend that budget.
// It still passes every other gate: vocabulary validation, the world boundary, and tier.
const ORIGIN = 'freestyle_chatter';

// Doctrine intensity is per channel (docs/os/GOVERNORS_DOCTRINE_20260723.md:138-149): the
// portal and the phone carry the full ride, CARA flows, text is reserved, email streams
// nothing, and never a spam of message message message.
// These names may never be listed at all: they have no live screen to ride on, and two of them
// cost real money per message.
const NEVER = ['email', 'reach', 'voice', 'sms', 'text'];

// ⬡B:core.freestyle_chatter:FOUNDER:default_on_and_we_monitor_never_dark:20260802⬡
// FIRST CUT OF THIS FILE SHIPPED DARK, and the founder had begged against exactly that hours
// earlier, in tears, in writing: "I never want this. Ever do I want things to ship dark. I
// have never, I swear to god, I've never asked for that... We have to ship things ON. Default
// on, and we monitor. We exclusively set a monitor to watch it, and we catch screwups. You
// can't catch a screwup or you can't test if something is dark. That makes no absolute sense."
// The dark default was written into the very build meant to serve him, by a seat that had his
// correction in its own instructions. Naming it here rather than quietly flipping it, because
// the reflex is the defect and a silent fix teaches nothing.
// SO: the doctrine's own channel table IS the default, on, from the first deploy. The env var
// stays as an OVERRIDE for narrowing or widening in a live world, never as the switch that
// decides whether she rides at all. NEVER above still holds absolutely: a name on that list
// cannot be carried by the default or by the env, because those channels have no screen to
// ride on and two of them bill per message. That is a boundary, not a cap.
const DEFAULT_CHANNELS = ['portal', 'cip', 'cib', 'canvas', 'cara', 'chat'];

function carrying() {
  const configured = String(process.env.FREESTYLE_CHATTER_CHANNELS || '').trim();
  if (!configured) {
    return DEFAULT_CHANNELS.filter(function (name) { return NEVER.indexOf(name) < 0; });
  }
  return configured
    .toLowerCase()
    .split(',')
    .map(function (name) { return name.trim(); })
    .filter(function (name) { return name && NEVER.indexOf(name) < 0; });
}

function surfaceIdFor(cycleId) {
  const tail = String(cycleId || '').replace(/[^A-Za-z0-9]/g, '').slice(-16).toLowerCase();
  return tail ? 'freestyle_' + tail : null;
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// The whole payload. Machine facts under machine keys, and a presence state token that is the
// already sanctioned chrome vocabulary of this estate (herState("thinking"), pres.setState
// ("thinking") on the OS doors). No text field, no body field, no sentence, no her-words.
// Every string value here is a single token with no space in it, which is the mechanical
// property the voice test asserts over the real emitted directives.
function components(find) {
  return [
    { type: 'presence', state: 'thinking' },
    {
      type: 'find_meta',
      query_ms: count(find && find.query_ms),
      candidates_seen: count(find && find.candidates_seen),
      compact_pages: count(find && find.compact_pages),
      selected: Array.isArray(find && find.selected_row_ids) ? find.selected_row_ids.length : 0,
      partial: !!(find && find.partial === true),
      at: new Date().toISOString()
    }
  ];
}

// One ride per cycle, remembered only so the collapse targets the exact surface and the exact
// HAM the emission actually reached. Bounded: a ride that never got collapsed (a process
// restart mid-turn) falls out of the map instead of growing it.
const RIDES = new Map();
const RIDES_MAX = 200;

function remember(cycleId, ride) {
  RIDES.set(cycleId, ride);
  while (RIDES.size > RIDES_MAX) {
    const oldest = RIDES.keys().next().value;
    RIDES.delete(oldest);
  }
}

function pusher(hamUid) {
  const registry = require('./stream/session.registry.js');
  return function (directive) { return registry.pushToHam(hamUid, 'directive', directive); };
}

// Called once per turn from core/tool.loop.js, the instant Agent FIND's receipt is on the wall
// and before any paid deliberation begins. Fire and forget: the caller wraps it and a throw
// here never touches the turn. Refuses by default, in this order, and every refusal is a
// machine reason a wire audit can read back.
function emitInterim(input) {
  const value = input || {};
  const channel = String(value.channel || '').toLowerCase().trim();
  if (!channel) return { ok: false, reason: 'no_channel' };
  if (carrying().indexOf(channel) < 0) return { ok: false, reason: 'channel_not_carrying' };
  // An unprompted lane never chatters. The ride exists because a person just asked something.
  if (value.prompted !== true) return { ok: false, reason: 'unprompted_turn' };
  // Closed world lanes (structured reach policy, incident intake, signed voice, room safe,
  // CODA's own operational deliberation) perform no ambient read and belong to no live human
  // surface. The caller passes the same flag the cycle uses to select its closed world wall.
  if (value.closedWorld === true) return { ok: false, reason: 'closed_world_cycle' };
  const fcw = value.fcw;
  if (!fcw || fcw.ok !== true) return { ok: false, reason: 'wall_unavailable' };
  const find = fcw.agent_find;
  // FIND first is the whole point. No FIND receipt means there is no real fact about this turn
  // yet, and a ride with nothing real behind it is exactly the hollow card this estate refuses.
  if (!find || find.ok !== true) return { ok: false, reason: 'no_find_receipt' };
  const hamUid = String(value.hamUid || '').trim();
  if (!hamUid) return { ok: false, reason: 'no_ham' };
  const cycleId = String(value.cycleId || '').trim();
  const surfaceId = surfaceIdFor(cycleId);
  if (!surfaceId) return { ok: false, reason: 'no_cycle_id' };
  if (RIDES.has(cycleId)) return { ok: false, reason: 'ride_already_open' };

  let awareness;
  try { awareness = require('./stream/screen.awareness.js'); }
  catch (eAwareness) { return { ok: false, reason: 'screen_unavailable' }; }
  // Nobody watching means nothing pushed. Same conservative trigger as every other screen lane.
  if (!awareness.hasLiveScreen(hamUid)) return { ok: false, reason: 'no_live_screen' };

  const vocab = require('./directive/vocabulary.js');
  const consumer = require('./reach/screen.consumer.js');
  const target = pusher(hamUid);

  // The title is left empty on purpose, the same reason the overseer surface leaves it empty:
  // a title is content, and cold code writing a heading across a person's screen is cold code
  // speaking. See the face note in the header for what Stage 2 owes this.
  const created = consumer.gatedPush(hamUid, target,
    vocab.createSurface(surfaceId, { region: 'freestyle', title: '' }), ORIGIN);
  if (!created.ok) {
    return { ok: false, reason: 'gate_refused', gate: created.gate, detail: created.reason };
  }
  const updated = consumer.gatedPush(hamUid, target,
    vocab.updateComponents(surfaceId, components(find)), ORIGIN);
  if (!updated.ok) {
    return { ok: false, reason: 'gate_refused', gate: updated.gate, detail: updated.reason };
  }
  remember(cycleId, { hamUid: hamUid, surfaceId: surfaceId });
  return { ok: true, surfaceId: surfaceId, query_ms: count(find.query_ms), pushed: 2 };
}

// The ride never outlives the turn. Called beside the post commit screen push when the
// committed answer lands, and again from the cycle wrapper so every other exit path (a failed
// wall, a blocked council, a cancelled turn, a thrown cycle) collapses the surface too. The
// map entry is deleted BEFORE the push, so a second call is a clean no_ride_for_cycle rather
// than a duplicate directive, and a throw inside the push still leaves nothing to repeat.
function emitReplace(input) {
  const value = input || {};
  const cycleId = String(value.cycleId || '').trim();
  const ride = RIDES.get(cycleId);
  if (!ride) return { ok: false, reason: 'no_ride_for_cycle' };
  RIDES.delete(cycleId);
  const vocab = require('./directive/vocabulary.js');
  const consumer = require('./reach/screen.consumer.js');
  const collapsed = consumer.gatedPush(ride.hamUid, pusher(ride.hamUid),
    vocab.deleteSurface(ride.surfaceId), ORIGIN);
  if (!collapsed.ok) {
    return { ok: false, reason: 'gate_refused', gate: collapsed.gate, detail: collapsed.reason };
  }
  return { ok: true, surfaceId: ride.surfaceId, collapsed: true };
}

module.exports = {
  emitInterim: emitInterim,
  emitReplace: emitReplace,
  ORIGIN: ORIGIN,
  NEVER: NEVER,
  _test: {
    carrying: carrying,
    surfaceIdFor: surfaceIdFor,
    components: components,
    ridesOpen: function () { return RIDES.size; },
    resetRides: function () { RIDES.clear(); }
  }
};
