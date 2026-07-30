// ⬡B:core.seat_evidence:WORK:she_can_say_when_her_own_credentials_are_refusing_her:20260725⬡
// entered via the ABAHAM door: the HAM is bound by the caller (core/fcw.builder.js) before the
// cycle ever reaches here, and is not needed by this lane at all.
// ACL: this module resolves no identity and binds no HAM, because seat health is a property of
// the system and never of a person. It holds no MESSAGES channel path and no reach path of any
// kind. It never sends, never notifies, never speaks, and never decides that a human should be
// told anything. It hands FACTS to her cycle and stops. Only A'NU speaks to a human, through
// her cycle, out a reach wonder (granddaddy-911).
//
// THE GAP THIS CLOSES, and it is the last one standing after 20260725.
//
// That morning one shared OPENROUTER_API_KEY began answering http_401. Every rung of her mind
// that read it went dark, deliberate() returned null, and her own gate answered the founder
// with stage_hollow_protocol_answer for hours while TEN funded per-seat keys sat alive on the
// same service. A coder had to notice and fix it.
//
// By that evening the coders had built the cure and the instrument. The ladder walks ordered
// key candidates (#1031). seat.map sanitizes a pasted key (#1048). The per-seat wall probes
// every seat and names the true cause of a refusal (#1038, #1045, #1047). All of it real,
// all of it good, and ALL OF IT POINTED AT THE FOUNDER AND THE CODERS. Every one of those
// surfaces is an HTTP wall a human reads, or a watcher script that posts to a board.
//
// SHE still could not tell you her own arm was broken. Nothing fed any of it into her cycle.
// core/fcw.builder.js built her wall with a capability line and no credential line at all, so
// the one participant who actually goes hollow when a key dies was the one participant not
// told. The founder rotates every key on 20260729 and no coder will hold the new values, so
// the wall that only a coder reads is the wall that will not be read.
//
// This module is the missing half: the SAME one implementation the founder's wall serves
// (routes/seats.health.routes.js buildSeatHealth), read into HER context instead of onto a
// screen. She does not get a new health authority; there is exactly one, and this reads it.
//
// It is read in place, by require, rather than over HTTP. A wonder must never call her own web
// server to learn something about her own body. The wall's file keeps the implementation and
// simply gained a second reader; nothing was moved, copied or twinned, and the wall's own nine
// tests still pass untouched, which is the proof this reshape changed none of its behavior.
//
// THE LINE IT MUST NOT CROSS. Cold code CARRIES evidence; it never decides on it. This file
// composes no sentence for a human, carries no persona, and never concludes that anyone
// should be contacted. It states what is refusing her and what is carrying her, and SHE
// decides, inside her cycle, whether it belongs in the turn in front of her.
//
// THE FIVE PROPERTIES THAT KEEP IT SAFE ON A LIVE GATE:
//   1. IT NEVER BLOCKS A TURN. A turn is served from cache, always, and never awaits a probe.
//      With a cold cache the line is EMPTY and her turn is byte-for-byte what it is today.
//      Her voice latency is not allowed to pay for her self-knowledge.
//   2. NO CLOCK. Nothing here wakes itself. A refresh happens only because a turn asked, and
//      at most one is ever in flight, so concurrent turns cannot stampede the provider.
//   3. NO SPEND, EVER. The one source probes GET /api/v1/key, a free auth check that bills
//      nothing. Penny hustle: knowing she is healthy must never cost a model call.
//   4. NO KEY VALUE, ANYWHERE. Nothing on this path can carry one. The one source returns key
//      NAMES only, and this file never touches process.env for a credential at all.
//   5. UNKNOWN IS NOT HEALTHY. A seat that could not be read is reported unknown and is never
//      rounded up into "fine". That exact rounding is what #1045 had to fix on the wall.
'use strict';

// Required for its named exports only. Requiring this module defines the route factory; it
// does NOT mount anything, so nothing is served and no door is opened by reading it here.
var seatsHealth = require('../routes/seats.health.routes.js');

// How long a reading stays fresh enough to reason from. Bounded on both ends so neither an
// env typo nor a caller can turn this into a hot loop against the provider.
function ttlMs() {
  var n = parseInt(process.env.SEAT_EVIDENCE_TTL_MS, 10);
  if (!isFinite(n)) n = 300000; // five minutes
  return Math.max(60000, Math.min(3600000, n));
}

// A reading older than this is too stale to reason from at all. She is told nothing rather
// than told something that expired, because a stale credential claim is worse than silence.
function maxAgeMs() {
  return ttlMs() * 4;
}

var _cache = null;      // the last completed reading
var _at = 0;            // when it completed
var _inFlight = null;   // the single permitted refresh

// A kill switch, not a feature flag. This is on by default because it costs nothing and
// because a mind that cannot feel its own body is the entire defect being fixed. Set
// SEAT_EVIDENCE=off to take it out of the cycle without a deploy of code.
function enabled() {
  return String(process.env.SEAT_EVIDENCE || '').trim().toLowerCase() !== 'off';
}

// Kick a refresh, at most one at a time, and never let its failure escape into a turn.
function refresh() {
  if (_inFlight) return _inFlight;
  _inFlight = Promise.resolve()
    .then(function () { return seatsHealth.buildSeatHealth(); })
    .then(function (reading) {
      if (reading && reading.ok) { _cache = reading; _at = Date.now(); }
      return reading;
    })
    .catch(function () {
      // A failed read leaves the previous reading alone and ages it out on its own. It must
      // never overwrite real evidence with a fabricated clean bill of health.
      return null;
    })
    .then(function (r) { _inFlight = null; return r; });
  return _inFlight;
}

// The cached reading if it is fresh enough to reason from, else null. Never probes inline.
function current(options) {
  options = options || {};
  var now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  if (!_cache) return null;
  if (now - _at > maxAgeMs()) return null;
  return { reading: _cache, age_ms: now - _at, stale: (now - _at) > ttlMs() };
}

// What she is handed, as structured facts. Returns null when there is nothing honest to say.
function evidence(options) {
  if (!enabled()) return null;
  var held = current(options);
  if (!held) return null;

  var s = (held.reading && held.reading.summary) || {};
  var seats = (held.reading && held.reading.seats) || [];

  var openrouter = seats.filter(function (r) { return r.provider === 'openrouter'; });
  // A seat that was never resolved to a live/dead verdict is UNKNOWN. Never healthy.
  var unknown = openrouter.filter(function (r) { return r.live !== true && r.live !== false; })
    .map(function (r) { return r.seat; });
  var carrying = openrouter.filter(function (r) { return r.live === true; })
    .map(function (r) { return r.seat; });
  var refusing = Array.isArray(s.dead) ? s.dead.slice() : [];
  var onSharedWallet = openrouter.filter(function (r) { return r.on_shared_key === true; })
    .map(function (r) { return r.seat; });

  return {
    at: held.reading.ts || null,
    age_ms: held.age_ms,
    stale: held.stale,
    degraded: refusing.length > 0,
    refusing: refusing,
    carrying: carrying,
    unknown: unknown,
    on_shared_wallet: onSharedWallet,
    shared_key_still_needed: s.shared_key_still_needed === true
  };
}

// THE FACTS SHE REASONS FROM WHEN HER OWN BODY IS FAILING.
//
// This returns '' unless something is actually refusing her, so a healthy day costs her wall
// nothing and a healthy turn reads exactly as it does today.
//
// It is deliberately FACTS plus a standing permission, never a script. The founder's own
// example of what this is for: instead of going mute or answering hollow, she can say that
// her general text tier is refusing her key and she is running on the seat keys. These are
// exactly the facts required to say that, and none of the words.
//
// A call to this function also kicks the background refresh, so her own turns are what keep
// her self-knowledge current. Nothing else has to run, and no clock has to be armed.
function groundingLine(options) {
  if (!enabled()) return '';
  var ev = null;
  try { ev = evidence(options); } catch (eEv) { ev = null; }

  // Keep her picture current off the back of a turn that was already happening. Never awaited.
  if ((options && options.noRefresh) !== true) {
    try {
      var held = current(options);
      if (!held || held.stale) { var p = refresh(); if (p && p.catch) p.catch(function () {}); }
    } catch (eRefresh) { /* self knowledge is never allowed to break a turn */ }
  }

  if (!ev || !ev.degraded) return '';

  var facts = [];
  facts.push('Refusing your credential right now: ' + ev.refusing.slice(0, 10).join(', ') + '.');
  if (ev.carrying.length) {
    facts.push('Still answering and carrying you: ' + ev.carrying.slice(0, 10).join(', ') + '.');
  } else {
    facts.push('No seat is confirmed answering, so nothing is proven to be carrying you.');
  }
  if (ev.on_shared_wallet.length) {
    facts.push('Riding the shared wallet rather than their own key: ' + ev.on_shared_wallet.slice(0, 10).join(', ') + '.');
  }
  if (ev.unknown.length) {
    facts.push(ev.unknown.length + ' seat(s) could not be read at all, so their state is UNKNOWN, not working: '
      + ev.unknown.slice(0, 10).join(', ') + '.');
  }
  facts.push('This reading is ' + Math.round(ev.age_ms / 1000) + 's old'
    + (ev.stale ? ' and is going stale, so treat it as the last thing you knew, not as this second.' : '.'));

  return 'THE STATE OF YOUR OWN BODY RIGHT NOW (facts, not a script): ' + facts.join(' ')
    + ' A seat name is the job, and the name after the colon is the reason it was refused.'
    + ' This is your own infrastructure failing, not anything the person did and not their job to fix.'
    + ' If it is degrading your answer, or they ask why you are slow, thin, or wrong, you may say plainly'
    + ' what is refusing you and what is carrying you instead. You decide whether it belongs in this turn;'
    + ' most turns it does not. Never invent a cause, never repeat a credential value (you do not have one'
    + ' and must never ask for one), and never go quiet or answer hollow to hide it. Silence over hollow is'
    + ' still law, and so is telling the truth about yourself when it matters.';
}

module.exports = {
  groundingLine: groundingLine,
  evidence: evidence,
  refresh: refresh,
  enabled: enabled,
  _test: {
    reset: function () { _cache = null; _at = 0; _inFlight = null; },
    seed: function (reading, at) { _cache = reading; _at = at == null ? Date.now() : at; },
    ttlMs: ttlMs,
    maxAgeMs: maxAgeMs
  }
};
