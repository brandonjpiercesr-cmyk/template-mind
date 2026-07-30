// ⬡B:core.privacy.people_tier:MODULE:the_inverted_t_ladder_and_the_structural_read_filter:20260726⬡
// entered via the ABAHAM door, serving channel MESSAGES (every world-facing brain read
// and every PAM release consults this to know who is allowed to see what).
//
// THE PEOPLE TIERS, INVERTED, from the founder's 20260724 doctrine
// (docs/os/REAL_LIFE_DOCTRINE_PT2_CAPTURE_20260724.md, "PEOPLE TIERS"):
//   T0  the founder, and her in his world. Holds everything.
//   T1  the highest circle. Gets T1 and everything beneath it.
//   T2  ENVOLVE only, no external-org connection.
//   T3  early testers.
//   T4  collective members.
// Each tier INHERITS everything beneath it. LOWER NUMBER MEANS MORE PRIVILEGE, which is
// the inversion: the retired ladder read "T10 = founder" and every comparison written
// against it points the wrong way. core/synthesize.js carried that retired sentence.
//
// This file is COLD ON PURPOSE and correctly so: it holds no judgment. It says what the
// ladder is, what a mark means, and how to express a viewer's ceiling as a query filter.
// The judgment (is this unclassified thing sensitive) belongs to a mind and lives in
// core/privacy.WONDER.classification.20260726.js. Cold code files the mark; a mind decides it.
//
// ANYHAM: no identity, no personal fact, no hardcoded HAM here. The founder's world is
// recognised only through FOUNDER_HAM_UID, read from env at call time, never a literal.
'use strict';

// The ladder. T0 most privileged, T4 least. STRICTEST is the fail-closed landing spot for
// any reader whose tier cannot be established: an unknown reader is treated as the least
// privileged person in the system, never as the founder.
var T0 = 0, STRICTEST = 4;

var MARKS = Object.freeze({
  PRIVATE: 'private',            // the founder marked it. Never surfaces, and its existence is never announced.
  SANCTIONED: 'sanctioned',      // the founder wants it discovered. Surfaces freely, verbatim, to its tier and below.
  UNCLASSIFIED: 'unclassified'   // nobody marked it. A mind judges each release and tones it down rather than refusing.
});

// The ceiling a mark implies when the founder gave no explicit tier. PRIVATE is T0-only by
// definition. SANCTIONED without a stated tier is not assumed world-open: an unstated
// sanction still lands at T1, the highest circle, because guessing wider is a leak.
var MARK_DEFAULT_TIER = Object.freeze({
  private: 0,
  sanctioned: 1,
  unclassified: 0
});

function isTier(value) {
  return Number.isInteger(value) && value >= T0 && value <= STRICTEST;
}

function normalizeMark(value) {
  var m = String(value == null ? '' : value).trim().toLowerCase();
  return (m === MARKS.PRIVATE || m === MARKS.SANCTIONED || m === MARKS.UNCLASSIFIED) ? m : null;
}

function founderHamUid() {
  return String(process.env.FOUNDER_HAM_UID || '').trim().toUpperCase();
}

// Who is reading. Returns the tier plus WHERE it came from, because a tier with no
// provenance is a guess and a guess is how a private fact reaches a room.
//   founder_env  the reading HAM is the founder's own world -> T0, sees everything
//   identity     the world carries a stamped people_tier (BIRTH stamps this)
//   unresolved   nothing established it. tier is null; every consumer must treat that
//                as STRICTEST, and PAM does.
function resolveViewerTier(identity, hamUid) {
  var uid = String((identity && (identity.ham_uid || identity.hamUid)) || hamUid || '').trim().toUpperCase();
  var founder = founderHamUid();
  if (founder && uid && uid === founder) return { tier: T0, source: 'founder_env' };
  var declared = identity && (identity.people_tier != null ? identity.people_tier : identity.peopleTier);
  if (declared != null) {
    var n = Number(declared);
    if (isTier(n)) return { tier: n, source: 'identity' };
  }
  return { tier: null, source: 'unresolved' };
}

// The tier any consumer must actually enforce for a viewer. Fails closed: an unresolved
// reader is the least privileged reader, never the most.
function effectiveTier(tier) {
  return isTier(tier) ? tier : STRICTEST;
}

// THE STRUCTURAL READ FILTER. This is the whole point of storing the tier as a real column
// on the bead: a viewer's ceiling becomes a PostgREST predicate that runs IN THE DATABASE,
// so content above the viewer's tier is never SELECTED. It never travels the wire, never
// lands in a variable, never reaches a log line, and cannot be leaked by the next caller
// who forgets to trim a string.
//
// It is a COLUMN and not a path into content, and that was learned the hard way: content is
// a TEXT column on the legacy bank, so content->privacy->>tier matched nothing at all there,
// including rows that genuinely carried a tier. A ceiling that silently matches nothing is
// indistinguishable from a ceiling that silently matches everything, and only one of those
// is survivable. migrations/0004_acl_tier_structural_people_ladder.sql adds the column,
// indexes it, and backfills it from any privacy envelope already written.
//
// acl_tier is NULLABLE with no default, so every bead written before the mark existed
// carries NULL, and NULL >= 1 is NULL in SQL, so PostgREST drops the row. Unclassified
// legacy memory is INVISIBLE to every non-T0 reader by construction. Fail closed at the
// storage layer, verified live.
//
// T0 gets no filter at all: the founder holds everything, including every legacy bead that
// predates the mark, so his own world is byte-for-byte unchanged. Returns null when no
// filter is needed.
var TIER_COLUMN = 'acl_tier';

function structuralFilter(tier) {
  var t = effectiveTier(tier);
  if (t <= T0) return null;
  return TIER_COLUMN + '=gte.' + t;
}

// Read the privacy envelope off a bead row, tolerating the two content shapes the bank
// carries (jsonb object, and legacy content stored as a JSON string). The acl_tier COLUMN
// is authoritative over anything found inside content when the two disagree: the column is
// what the database filtered on, so it is what actually governed the read.
function envelopeOf(row) {
  var column = row && row.acl_tier;
  var content = row && row.content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch (e) { content = null; }
  }
  if (!content || typeof content !== 'object') {
    return isTier(Number(column))
      ? { mark: MARKS.UNCLASSIFIED, tier: Number(column), reason: '', by: 'acl_tier_column', at: '' }
      : null;
  }
  var p = content.privacy;
  if (!p || typeof p !== 'object') {
    return isTier(Number(column))
      ? { mark: MARKS.UNCLASSIFIED, tier: Number(column), reason: '', by: 'acl_tier_column', at: '' }
      : null;
  }
  var mark = normalizeMark(p.mark);
  var tier = Number(p.tier);
  return {
    mark: mark || MARKS.UNCLASSIFIED,
    tier: isTier(tier) ? tier : (mark ? MARK_DEFAULT_TIER[mark] : T0),
    reason: typeof p.reason === 'string' ? p.reason : '',
    by: typeof p.by === 'string' ? p.by : '',
    at: typeof p.at === 'string' ? p.at : ''
  };
}

// Build the envelope that gets embedded at content.privacy. `by` records WHO marked it:
// the founder, or the classification wonder. Never a bare boolean.
function buildEnvelope(mark, tier, reason, by) {
  var m = normalizeMark(mark) || MARKS.UNCLASSIFIED;
  var t = isTier(Number(tier)) ? Number(tier) : MARK_DEFAULT_TIER[m];
  return {
    mark: m,
    tier: t,
    reason: String(reason == null ? '' : reason).slice(0, 400),
    by: String(by == null ? '' : by).slice(0, 60),
    at: new Date().toISOString()
  };
}

// Cold defense in depth behind the query filter. A bead is visible to a viewer only when
// it is not marked private and its tier is at or beneath the viewer's ceiling.
function visibleTo(envelope, viewerTier) {
  if (!envelope) return false;
  if (envelope.mark === MARKS.PRIVATE) return false;
  var v = effectiveTier(viewerTier);
  if (v <= T0) return true;
  return isTier(envelope.tier) && envelope.tier >= v;
}

// ⬡B:core.privacy.people_tier:FIX:a_born_world_can_prove_its_own_tier_not_just_the_founders:20260727⬡
// resolveViewerTier only ever resolves via founder_env or a people_tier the CALLER already
// carried on `identity`. A session's atmosphere envelope (core/ham.session.authorization.js's
// authorizeExactHamRequest, resolved via resolveAtmosphere({hamUid}) alone) never carries one,
// so every non-founder world landed on 'unresolved' and STRICTEST forever, not because it was
// unclassified, but because nothing ever read the tier core/birth/birth.engine.js already
// stamped at birth. Safe (fails closed exactly as before), not correct: a world born at T2 could
// never see its own T2 content through this path. Reading the BIRTH bead is not a judgment,
// it is retrieving a fact the founder already ruled at birth, the same class of read
// resolveViewerTier itself performs.
//
// Required at CALL TIME, not at module top: this file is required once and cached at
// process start by every caller, so a fresh require() here is what lets a test swap
// core/brain.client.js's own cache entry and actually observe it, the same pattern this
// codebase already uses for its other stubbable per-call dependencies.
async function bornPeopleTier(hamUid) {
  var uid = String(hamUid || '').trim().toUpperCase();
  if (!uid) return null;
  var rows;
  try {
    rows = await require('../brain.client.js').readBead({
      stamp_type: 'eq.BIRTH', ham_uid: 'eq.' + uid,
      order: 'created_at.desc', limit: '1', select: 'content'
    });
  } catch (e) { return null; }
  if (!Array.isArray(rows) || !rows.length) return null;
  var content = rows[0] && rows[0].content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch (e) { return null; }
  }
  var tier = content && (content.people_tier != null ? content.people_tier : content.peopleTier);
  var n = Number(tier);
  return isTier(n) ? n : null;
}

module.exports = {
  T0: T0, STRICTEST: STRICTEST, MARKS: MARKS, MARK_DEFAULT_TIER: MARK_DEFAULT_TIER,
  isTier: isTier, normalizeMark: normalizeMark, founderHamUid: founderHamUid,
  resolveViewerTier: resolveViewerTier, effectiveTier: effectiveTier,
  structuralFilter: structuralFilter, envelopeOf: envelopeOf,
  buildEnvelope: buildEnvelope, visibleTo: visibleTo, bornPeopleTier: bornPeopleTier
};
