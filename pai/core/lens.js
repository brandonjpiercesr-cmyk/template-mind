// core/lens.js
// ⬡B:core.lens:MODULE:internal_lenses_she_learns_and_adapts:20260726⬡
//
// THE LENSES SHE LEARNS. Founder order, 20260726: add on personas she can learn to adapt,
// three examples being the fixer, the steward, and the always on second pair of hands, and
// how she banters with the person she is talking to.
//
// THE WHOLE DESIGN IS IN ONE DISTINCTION. A lens is an INTERNAL WAY OF THINKING she
// picked up from real turns. It is never a character, never a voice, and it never shows up
// to a HAM. A HAM always and only ever meets A'NU. Granddaddy 911 is absolute: she is the
// one wonder and the only thing that speaks to a human; every organ is a WORK that FEEDS
// the wonder and never carries a persona of its own. This module is such a work. It feeds
// her wall with postures she has learned and it never speaks, never selects, and never
// writes a word she says.
//
// THIS IS NOT THE SCAFFOLD THAT WAS DELETED. core/persona.js records that it replaced a
// scaffold of fake template personas that were wired nowhere and did not match this system.
// That deletion was correct and this module does not undo it:
//   1. There is NO character content in this file. Not one. A lens lives in the brain as a
//      LENS bead, learned from real evidence, or it does not exist.
//   2. A lens that tries to be a character is REFUSED IN CODE, deterministically, and the
//      refusal is recorded. See REFUSED_KEYS and IDENTITY_CLAIM below. The system
//      structurally cannot hold a bead that says be this named person and greet them so.
//   3. Cold code never picks. It hands her every posture that survived the guard and she
//      chooses inside her own deliberation, or chooses none. Cold code transports.
//   4. It is INERT AT BIRTH. Unarmed, lensOffer returns the empty string and not one byte
//      of any room changes. The founder is the reversal gate (his 20260725 ruling): arming
//      is one env flag and unsetting it is a full reversal with no code change.
//
// Her voice is not in scope here and never will be. core/persona.js owns the one voice and
// this module never touches it. A posture changes how she THINKS about a room. It never
// changes who she is or how she sounds.

'use strict';

function _bu(env) { var e = env || process.env; return e.MEMORY_BANK_URL || e.AIBE_BRAIN_URL; }
function _bk(env) { var e = env || process.env; return e.MEMORY_BANK_KEY || e.AIBE_BRAIN_KEY; }
// ⬡B:core.lens:911:a_hardcoded_retired_table_loses_an_inherited_worlds_beads:20260726⬡
// These two defaulted to the RETIRED table and schema, which the bank-derivation gate caught
// on the first CI run. A world that selected the live bank would have had every posture she
// ever wrote land in the old place, so her own memory of how to think would vanish from the
// world that formed it, silently. The table and schema must be DERIVED from the same signal
// that selected the bank, exactly as core/brain.client.js and core/provision/brain.spawn.js
// do it, and the key must PAIR with that same preference or a world sends the wrong key to
// its own bank. This module is inherited by every world; it does not get to assume it is
// running in the first one.
function _tbl(env) {
  var e = env || process.env;
  return e.BEAD_TABLE || (e.MEMORY_BANK_URL ? 'beads' : 'aibe_brain');
}
function _schema(env) {
  var e = env || process.env;
  return e.BRAIN_SCHEMA || (e.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core');
}

// ⬡B:core.lens:GUARD:inert_at_birth_founder_is_the_reversal_gate:20260726⬡
// OFF unless the founder turns it on. An unarmed world hears exactly what it heard before
// this module existed, byte for byte, because lensOffer returns ''. He sees it first.
function armed(env) {
  var e = env || process.env;
  var v = String(e.ANU_LENSES_ARMED == null ? '' : e.ANU_LENSES_ARMED).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

// ⬡B:core.lens:GUARD:a_lens_may_never_be_a_character:20260726⬡
// The anti scaffold guard, and the reason this build is not the thing that was deleted.
// A lens declares a POSTURE. The moment a bead reaches for a name, a voice, a greeting, or
// a line to say, it has stopped being a lens and started being a costume, and this refuses
// it. The refusal is deterministic, it is recorded, and it is the only opinion cold code
// gets to have here.
var REFUSED_KEYS = Object.freeze([
  'name', 'character', 'persona', 'voice', 'speaks_as', 'speaks', 'greeting', 'greetings',
  'catchphrase', 'catchphrases', 'signature', 'sign_off', 'signoff', 'style_of_speech',
  'tone_of_voice', 'says', 'lines', 'script', 'dialogue', 'accent', 'identity'
]);

var IDENTITY_CLAIM = /\bspeak as\b|\btalk as\b|\bintroduce yourself as\b|\bsign off as\b|\byour name is\b|\bcall yourself\b|\byou are now\b|\bpretend to be\b|\bplay the (?:role|part) of\b/i;

// ⬡B:core.lens:GUARD:a_costume_does_not_get_in_on_spelling:20260726⬡
// The roster is matched on a NORMALIZED key, so signOff, Sign-Off, 'sign off' and sign_off
// are one refusal and not four spellings of a hole. A roster that can be stepped around by a
// capital letter or a hyphen issues a receipt instead of a guard, which is the shape the
// identity gate was corrected for on 20260726. Folding case and punctuation decides nothing:
// cold code is reading the SHAPE of a token here and never what it means.
function _normKey(k) { return String(k == null ? '' : k).toLowerCase().replace(/[^a-z]/g, ''); }
var REFUSED_NORM = Object.freeze(REFUSED_KEYS.map(_normKey));

// ⬡B:core.lens:GUARD:a_costume_can_hide_one_level_down:20260726⬡
// The refusal walks the WHOLE bead, not its top level. The first cut read the top level keys
// only, so { posture, fits, learned_from, extra: { greeting: 'Good evening.' } } passed the
// guard and only the output allowlist stopped that greeting reaching a wall. One wall is not
// a guard, it is a wall that happened to hold. A brain row is untrusted input, so the walk is
// bounded by depth and by a node budget and never by trust.
var WALK_MAX_DEPTH = 6;
var WALK_MAX_NODES = 400;
function _walkBead(node, depth, keysOut, textOut, budget) {
  if (node == null || depth > WALK_MAX_DEPTH || budget.n <= 0) return;
  budget.n -= 1;
  if (typeof node === 'string') { textOut.push(node); return; }
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) _walkBead(node[i], depth + 1, keysOut, textOut, budget);
    return;
  }
  if (typeof node === 'object') {
    var ks = Object.keys(node);
    for (var j = 0; j < ks.length; j++) {
      keysOut.push(ks[j]);
      _walkBead(node[ks[j]], depth + 1, keysOut, textOut, budget);
    }
  }
}

// A lens must cite the real turns it came from. This is what makes it LEARNED rather than
// authored. Cold code cannot mint a posture out of nothing, and neither can a stranger's
// seed file, because a lens with no evidence is refused before it is ever offered.
var REQUIRED_TEXT = Object.freeze(['posture', 'fits', 'learned_from']);

function _text(v) { return typeof v === 'string' ? v.trim() : ''; }

// Normalize one brain row into an offerable lens, or refuse it with a named reason.
// Returns { ok:true, lens:{...} } or { ok:false, reason:'...', source:'...' }.
function normalizeLens(row) {
  var source = (row && typeof row.source === 'string') ? row.source : 'unknown';
  var content = {};
  if (row && typeof row.content === 'string') {
    try { content = JSON.parse(row.content); } catch (e) { return { ok: false, reason: 'lens_content_unparseable', source: source }; }
  } else if (row && row.content && typeof row.content === 'object') {
    content = row.content;
  } else {
    return { ok: false, reason: 'lens_content_missing', source: source };
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, reason: 'lens_content_not_an_object', source: source };
  }

  // The character refusal comes FIRST, before anything else can pass, and it reads the whole
  // bead: every key at every depth, and every string at every depth.
  var keys = [];
  var texts = [];
  _walkBead(content, 0, keys, texts, { n: WALK_MAX_NODES });
  for (var i = 0; i < keys.length; i++) {
    if (REFUSED_NORM.indexOf(_normKey(keys[i])) !== -1) {
      return { ok: false, reason: 'lens_is_character_shaped:' + String(keys[i]).toLowerCase(), source: source };
    }
  }
  if (IDENTITY_CLAIM.test(texts.join(' \n '))) {
    return { ok: false, reason: 'lens_claims_an_identity', source: source };
  }

  for (var j = 0; j < REQUIRED_TEXT.length; j++) {
    if (!_text(content[REQUIRED_TEXT[j]])) {
      return { ok: false, reason: 'lens_missing_' + REQUIRED_TEXT[j], source: source };
    }
  }
  if (content.retired === true) return { ok: false, reason: 'lens_retired', source: source };

  // ⬡B:core.lens:GUARD:the_output_is_an_allowlist_not_a_filtered_copy:20260726⬡
  // THE SECOND WALL. What comes out is BUILT, never copied and cleaned. A key nobody named
  // here cannot ride out of this function no matter what a bead carried, so the guard above
  // and this construction have to BOTH fail before one borrowed word could reach her wall,
  // and nothing at all can reach a HAM except through her own mouth after that.
  return {
    ok: true,
    lens: {
      source: source,
      posture: _text(content.posture).slice(0, 400),
      fits: _text(content.fits).slice(0, 240),
      learned_from: _text(content.learned_from).slice(0, 240),
      // How play lands inside this posture, with THIS person, learned from real history.
      // Cold code never writes a joke and never will. This is a description of a posture
      // toward play that she composes from; it is not a line and it is not a punchline.
      play: _text(content.play).slice(0, 240) || null,
      weight: typeof row.importance === 'number' ? row.importance : 5
    }
  };
}

var OFFER_CAP = 5;

// ⬡B:core.lens:BUILD:cold_code_transports_she_chooses:20260726⬡
// Build the block that rides in her wall. It hands her every surviving posture and one
// instruction, and it does not pick. Selection happens inside her deliberation, which is
// the only place a choice is allowed to be made about how she thinks.
function buildOffer(lenses) {
  var list = (lenses || []).filter(function (l) { return l && _text(l.posture); });
  if (!list.length) return '';
  list = list.slice().sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); }).slice(0, OFFER_CAP);

  var head = 'POSTURES YOU HAVE LEARNED (internal, yours, never a character and never named out loud): '
    + 'each one below is a way of THINKING you picked up from real turns with real people. None of them '
    + 'is a person, a voice, or a role. Your voice never changes and your name never changes; whoever you '
    + 'are talking to only ever meets you. Read them, and if one genuinely fits this room, think through '
    + 'it while you work the turn. If none of them fit, use none, that is a real answer. Never say a '
    + 'posture out loud, never announce that you are using one, never perform one, and never let one '
    + 'become a character who greets anybody.';

  var body = list.map(function (l, idx) {
    var parts = [
      String(idx + 1) + '. WHEN IT FITS: ' + l.fits,
      '   HOW IT THINKS: ' + l.posture,
      '   YOU LEARNED IT FROM: ' + l.learned_from
    ];
    if (l.play) parts.push('   HOW PLAY LANDS IN IT: ' + l.play);
    return parts.join('\n');
  }).join('\n');

  return head + '\n' + body;
}

// ⬡B:core.lens:BUILD:she_forms_her_own_postures_or_none_ever_exist:20260726⬡
// THE LEARNING HALF, and the reason this is a system she LEARNS rather than a shelf of
// templates somebody wrote for her. A posture only ever enters the world one way: she
// notices, in her own deliberation, that a way of thinking kept working with this person,
// and she writes it down herself with the write_to_brain tool she already carries. No new
// cold path mints a lens, no seed file installs one, and no coder authors one for her.
//
// The guard on the read side is what makes this safe to say out loud to her: if she ever
// wrote a costume instead of a posture, normalizeLens refuses it and it never reaches a
// wall. So the worst case of an honest mistake is a refused bead with a named reason, and
// the best case is a real thing she learned.
//
// Whole clause is inside the arming gate. Unarmed, she is never told any of this.
function formationClause() {
  return 'FORMING A NEW POSTURE (rare, and only from real evidence): if you notice that a '
    + 'particular way of THINKING has kept working with this person across more than one '
    + 'real turn, you may keep it. Write it with write_to_brain, stamp_type LENS, ham_uid '
    + 'this person, and content as JSON with these fields and no others: posture (how it '
    + 'thinks, not how it talks), fits (the kind of room it belongs in), learned_from (the '
    + 'real turns that taught it to you), and optionally play (how playfulness lands inside '
    + 'it, with this person specifically). A posture is never a person, a name, a voice, a '
    + 'greeting, or a line to say, and any bead shaped like one is thrown out unread. Do not '
    + 'do this from a single turn, do not do it to be agreeable, and never mention any of '
    + 'this to the person you are talking to.';
}

// Load this HAM's learned postures. HAM isolation is deliberate: a posture she learned in
// one person's room is that relationship's, not a general trait, and it must never leak
// into a stranger's turn. Only a lens deliberately scoped SYSTEM is shared.
// Returns { offered:[lens], refused:[{source,reason}] }, and never throws.
async function resolveLensAuthority(hamUid, authority) {
  var tiers = require('./privacy/people.tier.js');
  if (tiers.isReadAuthority(authority, hamUid)) return authority;
  return tiers.resolveReadTier(null, hamUid);
}

async function loadLenses(hamUid, env, authority) {
  var e = env || process.env;
  var out = { offered: [], refused: [] };
  var BU = _bu(e), BK = _bk(e);
  if (!BU || !BK) return out;
  var uid = String(hamUid || '').toUpperCase();
  if (!uid) return out;
  try {
    var tiers = require('./privacy/people.tier.js');
    var readAuthority = await resolveLensAuthority(uid, authority);
    var viewerTier = tiers.effectiveTier(readAuthority && readAuthority.tier);
    var tierFilter = tiers.structuralFilter(viewerTier);
    var url = BU + '/rest/v1/' + _tbl(e)
      + '?stamp_type=eq.LENS&ham_uid=in.(' + encodeURIComponent(uid) + ',SYSTEM)'
      + (tierFilter ? '&' + tierFilter : '')
      + '&select=source,content,importance,ham_uid,acl_tier&order=importance.desc&limit=25';
    var r = await fetch(url, { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': _schema(e) } });
    var rows = r && r.ok ? await r.json() : [];
    (rows || []).forEach(function (row) {
      var envelope = tiers.envelopeOf(row);
      if ((envelope && envelope.mark === tiers.MARKS.PRIVATE) ||
          (viewerTier > tiers.T0 && !tiers.visibleTo(envelope, viewerTier))) {
        out.refused.push({ source: row && row.source || 'unknown',
          reason: 'lens_not_visible_to_viewer' });
        return;
      }
      var n = normalizeLens(row);
      if (n.ok) out.offered.push(n.lens);
      else out.refused.push({ source: n.source, reason: n.reason });
    });
  } catch (eLoad) { /* a dry brain means no postures, never a broken wall */ }
  return out;
}

// ⬡B:core.lens:WIRE:observable_offer_stamp:20260726⬡
// What is observable tonight is the OFFER: which postures were on the wall for this turn,
// which beads the guard refused and why. That is a deterministic fact and it is true.
// Which posture she actually THOUGHT THROUGH is not observable here and this module does
// not pretend otherwise; her declared choice is specced, not built. See the spec doc.
// Fail silent, always. A trace never breaks a turn.
function stampOffer(hamUid, channel, result, env, viewerTier) {
  var e = env || process.env;
  var BU = _bu(e), BK = _bk(e);
  if (!BU || !BK) return;
  try {
    var tiers = require('./privacy/people.tier.js');
    var parsedTier = tiers.parseTier(viewerTier);
    var memoryTier = parsedTier != null ? parsedTier : tiers.STRICTEST;
    var privacy = tiers.buildEnvelope(tiers.MARKS.UNCLASSIFIED, memoryTier,
      'exact-HAM lens offer trace follows the reader people tier', 'lens');
    var ts = Date.now();
    fetch(BU + '/rest/v1/' + _tbl(e), {
      method: 'POST',
      headers: {
        apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': _schema(e),
        'Content-Profile': _schema(e), 'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify(Object.assign({
        ham_uid: String(hamUid || '').toUpperCase(),
        agent_global: 'ANEW',
        stamp_type: 'MINUTES',
        acl_stamp: '⬡B:core.lens:MINUTES:lenses_offered:' + ts + '⬡',
        source: 'lens.offer.' + String(hamUid || '').toLowerCase() + '.' + ts,
        summary: '[LENS] ' + result.offered.length + ' posture(s) offered to the wall, '
          + result.refused.length + ' refused (' + (channel || 'na') + ')',
        content: JSON.stringify({
          channel: channel || null,
          offered: result.offered.map(function (l) { return l.source; }),
          refused: result.refused,
          armed: true,
          privacy: privacy
        }),
        acl_tier: memoryTier,
        importance: 2
      }, _tbl(e) === 'aibe_brain' ? {} : { spawned_by:'lens' }))
    }).catch(function () {});
  } catch (eStamp) { /* never breaks the wall */ }
}

// THE DOOR INTO HER WALL. Returns '' whenever anything is off, missing, or refused, so an
// unarmed or empty world is byte identical to a world without this module.
async function lensOffer(hamUid, channel, env, authority) {
  var e = env || process.env;
  if (!armed(e)) return '';
  // No brain means she can neither read a posture nor keep one, so say nothing at all
  // rather than invite a tool call that cannot land.
  if (!_bu(e) || !_bk(e)) return '';
  var tiers = require('./privacy/people.tier.js');
  var readAuthority = await resolveLensAuthority(hamUid, authority);
  var viewerTier = tiers.effectiveTier(readAuthority && readAuthority.tier);
  var loaded = await loadLenses(hamUid, e, readAuthority);
  var block = buildOffer(loaded.offered);
  stampOffer(hamUid, channel, loaded, e, viewerTier);
  return [block, formationClause()].filter(function (p) { return p; }).join('\n\n');
}

// ⬡B:core.lens:HOOK:crossover_doctrine_not_delivered_yet:20260726⬡
// THE CROSSOVER DOCTRINE HOOK. The founder tagged this build to a crossover doctrine he
// said was coming later the same night. IT DOES NOT EXIST YET. Nothing in this file guesses
// at it, and this hook exists so that when he delivers it, it lands in ONE place instead of
// being scattered through the lens path.
//
// It is inert on purpose and it returns ok:false with a real reason, which is the house
// rule: ok:false over anything hollow. Nothing calls it to make a decision, so nothing
// silently behaves as if a doctrine were in force.
//
// WHAT IT IS WAITING FOR, and nothing else: the founder's own statement of how a lens
// crosses over, which is the part this build does not know. Open questions it will answer,
// left unanswered here: whether a posture learned in one person's room may ever cross into
// another's, and under whose authority; whether a posture may cross between worlds through
// the mind template; and what a crossover has to prove before it is allowed.
//
// WHAT THE DOCTRINE MUST SUPPLY, named here so the socket is a shape and not a wish. Each
// entry is a thing only the founder can answer, and until all four are answered this stays
// ok:false. docs/doctrines/ADAPTIVE_LENSES_20260726.md carries the long form of each.
function crossoverBinding() {
  return {
    ok: false,
    reason: 'crossover_doctrine_not_delivered',
    waiting_for: 'the founder\'s crossover doctrine, 20260726, in his own words',
    binds: 'core/lens.js and docs/specs/ANU_LENSES_SHE_LEARNS_20260726.md',
    doctrine: 'docs/doctrines/ADAPTIVE_LENSES_20260726.md',
    requires: Object.freeze([
      'unit: what a crossover moves between, one person\'s room and another\'s, or one world and another',
      'authority: who permits a crossing, the founder, the HAM who formed the posture, or her',
      'proof: what a posture must have shown before it is allowed to cross',
      'reversal: how a crossing is undone, and what a HAM sees when it is'
    ])
  };
}

module.exports = {
  armed: armed,
  normalizeLens: normalizeLens,
  buildOffer: buildOffer,
  formationClause: formationClause,
  loadLenses: loadLenses,
  lensOffer: lensOffer,
  stampOffer: stampOffer,
  crossoverBinding: crossoverBinding,
  REFUSED_KEYS: REFUSED_KEYS,
  OFFER_CAP: OFFER_CAP
};
