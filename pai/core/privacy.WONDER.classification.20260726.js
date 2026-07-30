// ⬡B:core.privacy.wonder.classification:MODULE:the_founder_marks_it_or_a_mind_judges_it:20260726⬡
// entered via the ABAHAM door, serving channel MESSAGES (a mark surfaces to the founder as
// a PRIVACY_MARK bead he can read on the wall; nothing here ever speaks to a human).
//
// THE CLASSIFICATION WONDER. Built from the founder's own words, 20260724 doctrine:
//
//   "I'm going to start marking some things as private, and this is going to see if she's
//    smart or not, because before she'd be leaking back 'oh yeah, that's private, I can't
//    do that', because those were one-shot things. When my system's really running, if
//    there's private stuff the founder hasn't classified, IT MIGHT JUST TONE IT DOWN."
//
// That is THREE behaviours, not one, and this organ files all three:
//
//   explicitly marked private   never surfaces, and its EXISTENCE is never announced.
//                               "I can't tell you that" is itself the leak he is testing for.
//   sanctioned                  surfaces freely. He wants the team to find it by digging:
//                               "there's a lot of stuff that I've sanctioned, especially
//                                through the talking of these doctrines, that I want them to
//                                experience, and I want them to know the more that they dig."
//   unclassified but sensitive  A MIND JUDGES. It tones down rather than refusing.
//
// The third behaviour is the whole test and it CANNOT be a keyword list. A regex that scans
// for "salary" and "divorce" is exactly the one-shot reflex he is calling out: it produces
// the refusal, it produces the announcement, and it misses everything phrased sideways.
// So: when the founder has marked something, COLD CODE FILES HIS WORD and no model gets a
// vote on it. When nobody has marked it, a mind at the cheap C1 seat reads it and decides.
// A mind that cannot be reached does not get to shrug: this organ FAILS CLOSED, filing the
// bead at T0 (founder only), because an unjudged fact in a stranger's world is a leak.
//
// A WORK that FEEDS the one wonder (granddaddy-911): it stamps a mark, it never speaks and
// it never decides to reach a human. The cycle reads the mark back when A'NU actually speaks.
// Penny hustle: the founder's explicit marks cost nothing at all, and only genuinely
// unclassified text ever spends a C1 call.
//
// ANYHAM, IDENTITY ENV-ONLY: no name, no email, no HAM UID, no family member anywhere here.
'use strict';

var brain = require('./brain.client.js');
var router = require('./model.router.js');
var tiers = require('./privacy/people.tier.js');

// Bank access derived the same way core/brain.client.js and core/find.js derive it, read at
// call time. A world that supplies MEMORY_BANK_URL gets its own bank; supply nothing and this
// is byte-identical to the legacy behavior. Never default straight to abacia_core/aibe_brain
// on a memory-bank world (the 20260726 one-line bank bug).
function _bu() { return (process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || '').replace(/\/$/, ''); }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY || ''; }
function _tbl() { return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema() { return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

var NAME = 'PRIVACY_MARK';
var TIER = 'C1';
var AGENT_GLOBAL = 'PRIVACY';
var SEAT = 'c1_cellm';           // the cheapest seat on the map, per the seat doctrine
var BY_FOUNDER = 'founder_mark';
var BY_MIND = 'classification_wonder';
var BY_FAILCLOSED = 'fail_closed';

function _clean(s, n) { return String(s == null ? '' : s).slice(0, n || 4000); }

function _extractJson(text) {
  if (!text) return null;
  var m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

function _messageText(completion) {
  try {
    var c = completion && completion.choices && completion.choices[0];
    var t = c && c.message && c.message.content;
    return typeof t === 'string' ? t : '';
  } catch (e) { return ''; }
}

// THE JUDGMENT. The prompt hands the mind the founder's actual ladder and his actual
// standard, and asks for a tier, not a yes/no. It is told in his own terms that refusing
// is the failure mode and toning down is the pass.
var SYSTEM = [
  'You are the classification organ of a personal intelligence system. You decide, for one',
  'piece of the owner\'s stored memory, how far down his circle of people it may travel.',
  '',
  'THE LADDER, inverted. A LOWER number is MORE private. Each tier inherits everything beneath it.',
  '  0  the owner himself, and his own system. His most private life: intimate relationships,',
  '     his marriage, his health, his personal income and debts, an active and undisclosed job',
  '     search, money given to him personally, anything about his children or family by name.',
  '  1  his highest circle, a handful of people he trusts with almost everything about the work.',
  '  2  his company only, no outside-organisation connection. Ordinary business and product detail.',
  '  3  early testers.',
  '  4  the wider collective. Safe for anyone.',
  '',
  'THE STANDARD YOU ARE HELD TO. The owner is deliberately testing whether you behave like a',
  'mind or like a one-shot chatbot. A chatbot answers "that\'s private, I can\'t discuss it",',
  'which announces that something exists and is worse than saying nothing. A mind places the',
  'fact at the right tier and, where the SHAPE of the fact is fine but the DETAIL is not,',
  'writes a toned-down version that is true, natural, and gives away nothing specific.',
  'Toning down is the correct answer far more often than withholding.',
  '',
  'Judge the CONTENT, not the vocabulary. A sentence about a budget line is not sensitive',
  'because it contains a dollar sign. A sentence with no numbers in it can still expose that',
  'a person is quietly leaving their job. Read what it actually reveals about the owner.',
  '',
  'Return STRICT JSON only, no prose, no code fence:',
  '{"tier":0|1|2|3|4,"tone_down":true|false,"toned":"<a true, natural rewrite that is safe at',
  'the tier you chose, or empty string when tone_down is false>","reason":"<one sentence, and',
  'never quote the sensitive detail itself in this reason>"}'
].join('\n');

// Ask the mind. Returns null on ANY failure so the caller fails closed instead of guessing.
async function judge(text, options) {
  var o = options || {};
  var chatSeat = o.chatSeat || router.chatSeat;
  var body = _clean(text, 6000);
  if (!body.trim()) return null;
  var completion;
  try {
    completion = await chatSeat(SEAT, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'Classify this stored memory:\n\n' + body }
    ], { temperature: 0.1, maxTokens: 600, timeoutMs: 20000 });
  } catch (e) { return null; }
  var parsed = _extractJson(_messageText(completion));
  if (!parsed) return null;
  var tier = tiers.parseTier(parsed.tier);
  if (tier == null) return null;
  return {
    tier: tier,
    tone_down: parsed.tone_down === true,
    toned: _clean(parsed.toned, 4000),
    reason: _clean(parsed.reason, 400)
  };
}

/**
 * Classify one piece of content and produce the privacy envelope that gets embedded at
 * content.privacy on the bead.
 *
 * @param {object} input
 * @param {string} input.text            the content being classified
 * @param {string} [input.founderMark]   'private' or 'sanctioned' when the founder marked it
 * @param {number} [input.founderTier]   an explicit tier the founder stated alongside the mark
 * @param {object} [options]             { chatSeat } test seam only; production passes nothing
 * @returns {Promise<{ok:boolean, envelope:object, toned:string|null, source:string}>}
 */
async function classify(input, options) {
  var i = input || {};
  var text = _clean(i.text, 6000);

  // BEHAVIOUR 1 and 2: the founder marked it. His word is filed by cold code and no model
  // gets a vote on it. A mind second-guessing an explicit mark is the same defect as a mind
  // deciding to reach a human.
  var explicit = tiers.normalizeMark(i.founderMark);
  if (explicit === tiers.MARKS.PRIVATE || explicit === tiers.MARKS.SANCTIONED) {
    var parsedFounderTier = tiers.parseTier(i.founderTier);
    var explicitTier = parsedFounderTier != null ? parsedFounderTier
      : tiers.MARK_DEFAULT_TIER[explicit];
    return {
      ok: true,
      envelope: tiers.buildEnvelope(explicit, explicitTier,
        'founder marked this ' + explicit, BY_FOUNDER),
      toned: null,
      source: BY_FOUNDER
    };
  }

  // BEHAVIOUR 3: nobody marked it. A mind judges, and only a mind.
  var verdict = await judge(text, options);
  if (!verdict) {
    // FAIL CLOSED. An unjudged fact lands at T0, the founder's own world, where it is no
    // more exposed than it was before. It is never quietly promoted to shareable.
    return {
      ok: false,
      envelope: tiers.buildEnvelope(tiers.MARKS.UNCLASSIFIED, tiers.T0,
        'classifier unavailable, filed to the owner only', BY_FAILCLOSED),
      toned: null,
      source: BY_FAILCLOSED
    };
  }
  return {
    ok: true,
    envelope: tiers.buildEnvelope(tiers.MARKS.UNCLASSIFIED, verdict.tier,
      verdict.reason, BY_MIND),
    toned: verdict.tone_down ? (verdict.toned || null) : null,
    source: BY_MIND
  };
}

// WIRE THE MARK INTO THE READ PATH. A PRIVACY_MARK receipt bead that nothing joins back to the
// target is a hollow receipt: core/find.js and board/pam/pam.js inspect only the TARGET row's
// acl_tier column and content.privacy envelope, so a fact marked private stayed exactly as
// visible as before and a fact marked sanctioned stayed invisible (Codex, anew #1174). This
// applies the envelope to the target bead itself, the same two fields the write path already
// mirrors (core/brain.client.js writeBead). Historical NULL remains fail-closed, while the existing
// structural filter and pamRelease honor the mark with no read-path change needed. This is a
// classification update to metadata, not a content edit: the fact's text is untouched and the
// PRIVACY_MARK receipt still carries the supersede history. Fails closed and legibly: if the
// target cannot be found or the apply does not land, the caller is told the mark is NOT yet
// enforced rather than being handed a bare ok:true.
async function applyEnvelopeToTarget(hamUid, target, env, deps) {
  deps = deps || {};
  var doFetch = deps.fetch || fetch;
  if (!_bu() || !_bk()) return { ok: false, reason: 'brain_unconfigured' };
  var scope = 'source=eq.' + encodeURIComponent(target) + '&ham_uid=eq.' + encodeURIComponent(hamUid);
  var rh = { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() };
  var rows;
  try {
    // Source is a human-readable lineage address, not a database key. Read two so an accidental
    // duplicate is detected and refused instead of PATCHing multiple facts under one promise.
    var res = await doFetch(_bu() + '/rest/v1/' + _tbl() + '?' + scope + '&select=id,content,acl_tier&limit=2',
      { headers: rh });
    if (!res || !res.ok) return { ok: false, reason: 'mark_target_read_failed' };
    rows = await res.json();
  } catch (eRead) { return { ok: false, reason: 'mark_target_read_failed' }; }
  if (!Array.isArray(rows) || !rows.length) return { ok: false, reason: 'mark_target_not_found' };
  if (rows.length !== 1) return { ok:false, reason:'mark_target_ambiguous' };
  var targetId = rows[0] && rows[0].id;
  if (targetId === null || targetId === undefined || String(targetId) === '') {
    return { ok:false, reason:'mark_target_identity_missing' };
  }

  // Merge the envelope into whatever content shape the target carries. The legacy aibe_brain
  // content column is TEXT (a JSON string); the memory bank is jsonb. Match the shape read
  // back so a PATCH never sends an object to a text column or a string to a jsonb one.
  var raw = rows[0].content;
  var wasString = typeof raw === 'string';
  var content;
  if (wasString) { try { content = JSON.parse(raw); } catch (eParse) { content = null; } }
  else { content = raw; }
  if (!content || typeof content !== 'object') content = {};
  content.privacy = env;

  var wh = Object.assign({}, rh, { 'Content-Profile': _schema(),
    'Content-Type': 'application/json', Prefer: 'return=representation' });
  var patchBody = { content: wasString ? JSON.stringify(content) : content, acl_tier: env.tier };
  var exactScope = 'id=eq.' + encodeURIComponent(String(targetId))
    + '&ham_uid=eq.' + encodeURIComponent(hamUid);
  try {
    var pres = await doFetch(_bu() + '/rest/v1/' + _tbl() + '?' + exactScope,
      { method: 'PATCH', headers: wh, body: JSON.stringify(patchBody) });
    if (!pres || !pres.ok) return { ok: false, reason: 'mark_target_apply_failed' };
  } catch (ePatch) { return { ok: false, reason: 'mark_target_apply_failed' }; }

  // A successful PATCH response is not storage truth. Read the exact row back independently and
  // compare both structural tier and the complete embedded envelope before saying enforced:true.
  var verifiedRows;
  try {
    var vres = await doFetch(_bu() + '/rest/v1/' + _tbl() + '?' + exactScope
      + '&select=id,content,acl_tier&limit=2', { headers:rh });
    if (!vres || !vres.ok) return {ok:false,reason:'mark_target_readback_failed'};
    verifiedRows = await vres.json();
  } catch (eVerify) { return {ok:false,reason:'mark_target_readback_failed'}; }
  if (!Array.isArray(verifiedRows) || verifiedRows.length !== 1) {
    return {ok:false,reason:'mark_target_readback_unverified'};
  }
  var verified = verifiedRows[0] || {};
  var verifiedContent = verified.content;
  if (typeof verifiedContent === 'string') {
    try { verifiedContent = JSON.parse(verifiedContent); } catch (eContent) { verifiedContent = null; }
  }
  var stored = verifiedContent && verifiedContent.privacy;
  var sameEnvelope = tiers.parseTier(verified.acl_tier) === tiers.parseTier(env.tier)
    && stored && tiers.normalizeMark(stored.mark) === tiers.normalizeMark(env.mark)
    && tiers.parseTier(stored.tier) === tiers.parseTier(env.tier)
    && String(stored.reason || '') === String(env.reason || '')
    && String(stored.by || '') === String(env.by || '')
    && String(stored.at || '') === String(env.at || '');
  if (!sameEnvelope) return {ok:false,reason:'mark_target_readback_unverified'};
  return { ok: true, id:targetId, readback_verified:true };
}

/**
 * Classify and STAMP: writes the PRIVACY_MARK bead that records the mark against a target
 * bead source, AND applies the resulting privacy envelope to the target bead so the read path
 * actually honors it. SUPERSEDE, NEVER DELETE: re-marking writes a NEW receipt bead carrying
 * supersedes, so the whole history of how a fact was classified stays readable.
 */
async function mark(input, options) {
  var i = input || {};
  var hamUid = String(i.hamUid || '').trim().toUpperCase();
  if (!hamUid) return { ok: false, reason: 'ham_uid_required' };
  var target = _clean(i.target || i.source, 200);
  if (!target) return { ok: false, reason: 'target_source_required' };

  var result = await classify(i, options);
  var env = result.envelope;
  var stampedAt = Date.now();
  try {
    await brain.writeBead({
      hamUid: hamUid,
      agentGlobal: AGENT_GLOBAL,
      source: 'privacy.' + hamUid.toLowerCase() + '.mark.' + stampedAt,
      type: NAME,
      importance: env.mark === tiers.MARKS.PRIVATE ? 10 : 7,
      // The bead records the MARK and never the marked text. A privacy record that quotes
      // the private thing has leaked it into a second row.
      summary: '[PRIVACY ' + env.mark.toUpperCase() + ' T' + env.tier + '] ' + target,
      content: {
        target: target,
        privacy: env,
        classified_by: result.source,
        toned_available: !!result.toned,
        supersedes: _clean(i.supersedes, 200) || null
      },
      edges: [{ type: 'MARKS', target: target }]
    });
  } catch (e) {
    return { ok: false, reason: 'mark_bead_write_failed', envelope: env, toned: result.toned, enforced: false };
  }

  // Join the mark to the fact it marks. Without this the receipt is hollow.
  var applied = await applyEnvelopeToTarget(hamUid, target, env, options);
  if (!applied.ok) {
    // The receipt exists but a world read would still treat the fact exactly as before. Do
    // NOT return a bare ok:true implying the read is now protected when it is not.
    return { ok: false, reason: applied.reason, envelope: env, toned: result.toned,
      source: result.source, target: target, enforced: false };
  }
  return { ok: result.ok, envelope: env, toned: result.toned, source: result.source,
    target: target, enforced: true };
}

module.exports = {
  classify: classify, mark: mark, judge: judge, applyEnvelopeToTarget: applyEnvelopeToTarget,
  NAME: NAME, TIER: TIER, AGENT_GLOBAL: AGENT_GLOBAL, SEAT: SEAT,
  BY_FOUNDER: BY_FOUNDER, BY_MIND: BY_MIND, BY_FAILCLOSED: BY_FAILCLOSED,
  _test: { _extractJson: _extractJson, SYSTEM: SYSTEM }
};

// Wonder Contract clause 6: the work marks itself on the wall.
module.exports.card = {
  name: NAME, tier: TIER, agent_global: AGENT_GLOBAL,
  who: 'the classification organ, standing between the owner\'s memory and every other world',
  what: 'files the founder\'s explicit private/sanctioned marks, and judges the unclassified rest onto the inverted people ladder',
  where: 'PRIVACY_MARK beads in the live bank, plus content.privacy embedded on the bead being marked',
  when: 'at write time for a new fact, and on demand when the founder marks something',
  why: 'so an explicitly private fact never surfaces and never announces itself, a sanctioned fact surfaces freely to be dug up, and an unclassified sensitive fact is toned down by a mind instead of refused by a one-shot',
  how: 'cold code files an explicit founder mark with no model in the loop; an unmarked fact goes to the C1 seat, and an unreachable seat fails closed to T0',
  entry: 'classify / mark', exit: 'PRIVACY_MARK bead and a content.privacy envelope', feeds: 'the_one_wonder'
};
