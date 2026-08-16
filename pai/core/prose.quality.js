// ⬡B:core.prose_quality:LAW:one_writing_gate_for_narration_and_dialogue:20260721⬡
// FOUNDER LAW (overnight doctrine drop): "perfecting her writing, because right
// now it sounds corny or horrible." The narration path already had a real
// mechanical quality gate — as-if similes, abstract nouns performing verbs,
// purple lexicon, toasts, group affirmations, writerly garnish, committee-of-
// one-liners, broken sentences — but the DIRECTOR's spoken CINEMATIC DIALOGUE
// (the acting that plays over the film) went through NONE of it. Two writers,
// one voice, so this is the SINGLE source of truth both paths call. The
// narration route delegates here; the DIRECTOR now runs the same gate on every
// spoken line and retries when it hits, the way the narration always did.
'use strict';

const isDeepStrictEqual = require('node:util').isDeepStrictEqual;

// ⬡B:core.prose_quality:QUALITY:corny_prose_detector:20260714⬡ (moved from
// seer.native, behavior preserved exactly). The founder called the writing
// fluffy and corny more than once; a prompt rule alone is a nudge, not a fix.
// This mechanically catches the patterns he flagged so a violation forces a
// real retry with the exact offense quoted back, instead of hoping the prompt
// holds.
function detectCornyProse(text) {
  const hits = [];
  if (!text) return hits;
  if (/\bas if\b/i.test(text)) hits.push('used "as if" (a stacked simile the founder flagged)');
  if (/already half[- ]formed|already forming|the way (?:they|he|she) [a-z]+ when/i.test(text)) hits.push('over-explained a tiny gesture instead of just showing it');
  // ⬡B:core.prose_quality:QUALITY:abstractions_never_act:20260716⬡ the founder's
  // exact complaint, prose like the shadows of life prancing with vigilance. Two
  // mechanical catches: an abstract noun performing a verb, and the purple
  // lexicon itself. Either one forces the retry with the offense quoted back.
  const abstractActor = /\b(shadows?|whispers?|echoes?|silence|tension|anticipation|possibility|destiny|fate|hope|energy|the air|the moment|the atmosphere|the weight|a sense of \w+)\b(?:\s+(?:of|in|from|around|between)\s+(?:the\s+|a\s+)?\w+){0,2}\s+(?:\w+ly\s+)?(danc|pranc|swirl|weav|wrapp|embrac|beckon|linger|envelop|cascad|hum|crackl|sing|whisper|promis|prowl|creep)[a-z]*\b/i.exec(text);
  if (abstractActor) hits.push('an abstract idea is performing an action ("' + abstractActor[0] + '"), only people and real objects act, cut it and film something real instead');
  const purple = /\b(tapestry|symphony|testament to|myriad|vibrant hum|palpable|ethereal|luminous|beckoning|a dance of|whispers? of|the very fabric|kaleidoscope|crescendo|unspoken \w+ hangs?|electric anticipation|shimmering)\b/i.exec(text);
  if (purple) hits.push('banned flowery wording ("' + purple[0] + '"), write it plain, name a real thing a camera could film');
  // ⬡B:core.prose_quality:QUALITY:toast_and_garnish_have_teeth:20260716⬡ the
  // founder caught her raising a cup and toasting "to smooth code and even
  // smoother flights" in live output, which her own prompt already forbids. A
  // written law with no detector is a hope. These three are the exact strains he
  // flagged: the toast, the group affirmation, and writerly garnish that is
  // technically filmable but that no human being would ever say out loud.
  const toast = /\b(lift(?:s|ed|ing)?|rais(?:e|es|ed|ing)|holds? up)\b[^.!?]{0,60}\b(cup|mug|coffee|glass|bottle|can)\b[^.!?]{0,80}["“]|["“]\s*(?:to|here'?s to)\s+[a-z][^"”]{4,70}["”]/i.exec(text);
  if (toast) hits.push('somebody made a toast ("' + toast[0].slice(0, 60) + '"), your own law forbids toasts, people at a gate do not toast, cut it');
  const affirm = /["“][^"”]{0,60}\b(we(?:'| a)?re in this together|we got this|team|family|whatever comes|no matter what)\b[^"”]{0,40}["”]/i.exec(text);
  if (affirm) hits.push('a group affirmation line ("' + affirm[0].slice(0, 50) + '"), real people do not talk in team slogans, cut it');
  const garnish = /\b(steam|light|sunlight|smoke|dust|mist)\s+(curl|swirl|danc|drift|spill|pool)[a-z]*\s+(?:up\s+)?(?:and\s+)?(?:catch[a-z]*|against|under|through|across|over)\b|\bcatch(?:ing|es)\b[^.!?]{0,30}\b(?:fluorescents|light|glow|sun|neon)\b/i.exec(text);
  if (garnish) hits.push('writerly garnish ("' + garnish[0] + '"), nobody talks like that, say the plain thing that is actually happening or cut the sentence');
  // count distinct quoted dialogue lines attributed to different cast names in one scene
  const names = ['Morgan','Kendall','Jordan','Riley','Sasha','Quinn','Avery','Reese','Sage'];
  let speakers = 0;
  names.forEach(function (nm) { if (new RegExp(nm + '[^.]{0,40}["“]', 'i').test(text)) speakers++; });
  if (speakers >= 3) hits.push('three or more teammates each got a quoted line, reads like a committee, not a real scene');
  // a dangling clause pattern like "When I to add" (verb missing after "to")
  if (/\b(when|as|while|if)\s+i\s+to\s+[a-z]/i.test(text)) hits.push('a broken sentence with a missing verb (e.g. "When I to add")');
  return hits;
}

// ⬡B:core.prose_quality:QUALITY:director_dialogue_gate:20260721⬡ the cinematic
// spoken-line gate. The DIRECTOR writes DIALOGUE, not paragraphs, so it runs the
// shared corny detector over the joined lines AND adds the checks that only make
// sense for spoken acting: a line no human would say out loud, a speech instead
// of a line, a narration-shaped line that describes instead of speaks. Every
// dialogue line is expected to be short, in-the-moment, and unquoted (the model
// returns the raw words, not "quoted" text), so the toast/affirm checks are run
// against a quoted-wrapped copy to reuse the same regexes without rewriting them.
function detectCornyDialogue(lines) {
  const hits = [];
  if (!Array.isArray(lines) || !lines.length) return hits;
  const spoken = lines.map(function (d) { return (typeof d === 'string' ? d : String((d && d.line) || '')).trim(); }).filter(Boolean);
  if (!spoken.length) return hits;
  // reuse the paragraph detector across the joined lines (catches purple words,
  // abstractions, "as if", group affirmations even when unquoted-adjacent)
  const joined = spoken.join(' ');
  detectCornyProse(joined).forEach(function (h) { hits.push(h); });
  // wrap each line in quotes so the toast/affirmation detectors (which key off
  // quote marks) fire on raw spoken lines too
  detectCornyProse(spoken.map(function (s) { return '“' + s + '”'; }).join(' ')).forEach(function (h) {
    if (hits.indexOf(h) < 0) hits.push(h);
  });
  // spoken-only checks
  spoken.forEach(function (s) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 18) hits.push('a spoken line runs ' + words.length + ' words ("' + s.slice(0, 40) + '..."), real people under stress speak short, cut it to under 18 words');
    // a line that narrates the scene instead of speaking in it
    if (/^(the|a|an|there|it was|suddenly|meanwhile)\b/i.test(s) && !/\?$/.test(s) && words.length > 6) {
      hits.push('a line narrates instead of speaks ("' + s.slice(0, 40) + '..."), dialogue is what a person SAYS, not scene description');
    }
    // stage-direction leakage inside a spoken line
    if (/[\(\[][^\)\]]{2,}[\)\]]/.test(s)) hits.push('a spoken line carries a stage direction ("' + s.slice(0, 40) + '..."), speak only the words, no parentheticals');
  });
  return hits;
}

// ⬡B:core.prose_quality:BUILD:cold_scans_demote_to_evidence_for_a_real_verdict:20260802⬡
// Roadmap row W4-L4 WRIT FAMILY (census C-09): "WRIT rules pre-draft and
// post-draft as an LLM verdict... the cold scans (em dash, meta, corny) demote
// to flags feeding them." The two detectors above already never decided
// anything on their own, they only ever returned an array of hits for a
// caller to act on, so nothing about them changes here (supersede, never
// delete). What was missing is the verdict itself: a real mind that reads
// those hits as EVIDENCE and rules, both before a draft is written (a plan or
// prompt) and after (the produced text), mirroring the one house shape for a
// skeptical judged call, `core/wonder.consult.js#defaultJudge` and
// `core/goals/keeper.js#judgeGoal`: a real deliberate() call, strict JSON
// parse, null on anything unusable, never a fabricated pass.
//
// judgeProse is the pure judge, no side effect, no bead written. writProse
// wraps it the way extractAndBank wraps judgeGoal: judge, then bank a real
// verdict bead only on a genuine, parseable verdict. A refused or unusable
// judgment (thrown call, empty content, unparseable JSON, wrong shape) writes
// nothing, matching every other judged-gate module in this codebase. Cold
// code's only decisions here are structural: refuse on empty input, refuse to
// bank without a resolved hamUid. It never rules on whether the writing is
// good.

// The two detectors return different shapes (an array of strings vs an
// array built from string lines), so this resolves the right cold scan for
// whatever the caller hands in, string prose or an array of dialogue lines,
// without asking the caller to know which detector to call.
function coldFlagsFor(text) {
  return Array.isArray(text) ? detectCornyDialogue(text) : detectCornyProse(text);
}

// The pure judge. Mirrors core/wonder.consult.js#defaultJudge and
// core/goals/keeper.js#judgeGoal exactly: try/catch around the one model call,
// strict JSON parse, return null on anything unusable. Never banks, never
// throws, never invents a passing (or failing) grade when the mind cannot be
// reached or answers something unusable.
async function judgeProse(stage, text, options) {
  const opts = options || {};
  const st = stage === 'pre_draft' ? 'pre_draft' : 'post_draft';
  const isDialogue = Array.isArray(text);
  const empty = isDialogue ? !text.length : !String(text || '').trim();
  if (empty) return null; // structural refusal on nothing to judge, not a verdict
  const flags = coldFlagsFor(text);
  const body = isDialogue
    ? text.map(function (d) { return typeof d === 'string' ? d : String((d && d.line) || ''); }).join('\n').slice(0, 4000)
    : String(text).slice(0, 4000);
  const deliberate = opts.deliberate || require('./model.ladder.js').deliberate;
  let result;
  try {
    result = await deliberate(
      'You are WRIT, judging prose quality for A’NU’s own writing gate. Below are cold ' +
      'mechanical flags a pattern scanner raised over a piece of writing at the ' + st + ' stage. ' +
      'Those flags are EVIDENCE ONLY, never a verdict: a scanner cannot tell corny from clean, ' +
      'it can only spot a pattern that MIGHT be either. Read the actual writing and judge honestly ' +
      'whether it is genuinely corny, purple, or otherwise bad, or whether it reads like something ' +
      'a real person would say. You may overrule any flag, including deciding every flag raised is ' +
      'wrong for this piece. Answer ONLY JSON, no prose: {"passes": true or false, ' +
      '"reasoning": "one honest sentence naming what actually decided it"}.',
      'Stage: ' + st + '\nCold flags raised (evidence, may be wrong, may not matter): ' +
        JSON.stringify(flags.slice(0, 12)) + '\nWriting:\n' + body,
      { seat: 'advisors', temperature: 0.2, timeout: 25000, max_tokens: 300 });
  } catch (error) { return null; }
  const raw = result && result.content;
  if (!raw) return null;
  try {
    const cleaned = String(raw).replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    if (!parsed || typeof parsed.passes !== 'boolean') return null;
    return {
      stage: st, passes: parsed.passes,
      reasoning: String(parsed.reasoning || '').slice(0, 400),
      flags: flags
    };
  } catch (error) { return null; }
}

// The banking wrapper, mirroring core/goals/keeper.js#extractAndBank: judge
// first, and only a genuine, parseable verdict ever reaches a write. Every
// write carries the cold flags on the bead as the evidence that fed the
// judgment, never as the reason for it. Returns {ok:false, reason} on a
// structural refusal or an unreachable/unusable judge, exactly like the other
// judged-gate wrappers in this codebase, and never fabricates a bank on a
// judge it could not verify.
async function writProse(hamUid, stage, text, options) {
  const opts = options || {};
  // ⬡B:core.prose_quality:FIX:one_source_for_the_world_id_and_it_refuses:20260802⬡
  // This line read `String(hamUid || '').trim().toUpperCase()` when it shipped hours ago,
  // which is the hand-rolled shape tonight's RULINGS entry was written about, in the very
  // pass that wrote the entry. Two things are wrong with it and only one is obvious.
  // It is a SECOND hand-maintained copy of a normalizer this repo already owns
  // (core/ham.uid.validator.js, the canonical guardian), which the one-source law forbids.
  // And it only FOLDS, it never REFUSES: a world id of "not a ham" became "NOT A HAM" and
  // was then used verbatim as a bead key, so a malformed caller banked a real verdict under
  // a junk world instead of being turned away. normalizeHamUid does both halves, returning
  // null on anything that is not exactly eight hex characters.
  // Scope kept honest, because overstating a fix is its own defect: this is NOT the
  // two-worlds-collapse the vault and the trust ladder had. A HAM UID is canonically
  // uppercase hex, so case folding here is genuinely injective and no two valid worlds
  // could ever have merged. What was missing was the refusal, not the comparison.
  const ham = require('./ham.uid.validator.js').normalizeHamUid(String(hamUid == null ? '' : hamUid).trim());
  const judge = opts.judgeProse || judgeProse;
  let verdict;
  try { verdict = await judge(stage, text, opts); } catch (error) { verdict = null; }
  if (!verdict) {
    return { ok: false, reason: 'writ_verdict_unavailable' };
  }
  if (!ham) {
    // A real verdict was reached but there is no world to bank it under.
    // Honest and named, never silently dropped as if nothing happened.
    return { ok: true, banked: false, reason: 'writ_verdict_no_ham', verdict: verdict };
  }
  const bank = opts.brain || require('./brain.client.js');
  // ⬡B:core.prose_quality:HEAL:writ_verdict_source_collided_inside_one_millisecond:20260815⬡
  // FOUND BY TWO SEATS INDEPENDENTLY, FIXED BY NEITHER. This source was
  // 'writ.verdict.' + ham + '.' + stage + '.' + Date.now(), and Date.now() only resolves to
  // the millisecond. Two WRIT banks for the SAME ham and the SAME stage inside one
  // millisecond minted the IDENTICAL string. A bead source is an ADDRESS and this estate
  // reads beads back BY SOURCE (findBySource, a few lines below), so the collision was never
  // cosmetic: a readback could return the wrong verdict or two rows where the caller wants
  // one, an idempotent write could overwrite or duplicate, and the re-mint evidence chain,
  // whose entire job is to prove the SHIPPED bytes were the JUDGED bytes, could name a row
  // describing different bytes. The re-mint (a hold that heals and re-banks in the same tick)
  // is exactly the path that collides. The intermittent failure of
  // tests/pai.council.meaning.hold.heals.test.js was not the bug; it was the only thing that
  // noticed the bug.
  // THE ESTATE ALREADY SOLVED THIS AND IS NOT SOLVED A SIXTH WAY HERE: the millisecond plus
  // random hex shape is the one core/outreach.js:1128 and core/contractors/engagement.js:111
  // already mint ids with. Still stable, still addressable, still human-readable, still
  // sorted by the leading millisecond, and unique per write inside a single tick. It does not
  // become unpredictable to a caller that must address the row it just wrote: the exact
  // string is handed back on every return path below, which is how findBySource already
  // reaches it. Nothing parses the trailing segment; every source parser in this repo reads
  // token [0] only.
  const source = 'writ.verdict.' + ham.toLowerCase() + '.' + verdict.stage + '.' +
    Date.now() + '.' + require('crypto').randomBytes(6).toString('hex');
  const state = verdict.state || (verdict.unavailable ? 'unavailable' :
    (verdict.passes ? 'completed' : 'held'));
  const payload = {
    schema: 'writ.prose.verdict.v1', state: state, stage: verdict.stage,
    passes: verdict.passes, reasoning: verdict.reasoning,
    cold_flags: verdict.flags, why_changed: verdict.why_changed || null,
    output_digest: verdict.output_digest || null,
    output_bytes: Number.isInteger(verdict.output_bytes) ? verdict.output_bytes : null
  };
  const verdictEdges = [{ type: 'PRODUCED_BY', target: 'station.writ' }];
  try {
    await bank.writeBead({
      hamUid: ham, agentGlobal: opts.agentGlobal || 'WRIT', source: source, type: 'WRIT_VERDICT',
      summary: '[WRIT ' + verdict.stage.toUpperCase() + '] ' + (verdict.passes ? 'passes' : 'held'),
      content: payload,
      importance: 4,
      edges: verdictEdges
    });
  } catch (error) {
    return { ok: true, banked: false, reason: 'writ_verdict_bank_failed', verdict: verdict };
  }
  if (typeof bank.findBySource !== 'function') {
    return { ok:true, banked:false, reason:'writ_verdict_receipt_unverified',
      receipt_state:'receipt_unverified', source:source, verdict:verdict };
  }
  let read;
  try { read = await bank.findBySource(source, ham); }
  catch (error) {
    return { ok:true, banked:false, reason:'writ_verdict_receipt_unverified',
      receipt_state:'receipt_unverified', source:source, verdict:verdict };
  }
  let content = read && read.content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch (error) { content = null; }
  }
  // brain.client is the canonical production writer. It embeds the exact typed
  // edges into content for the legacy bank and also mirrors them into the real
  // edges column on the new bank. An injected store may preserve the payload and
  // edges as separate exact fields instead. Those are the only two truthful
  // representations. The old comparison accepted only the pre-adapter shape, so
  // every successful real write came back with one canonical extra field and was
  // mislabeled unverified. Deep strict equality ignores object key order while
  // still refusing every extra, missing, or changed value.
  const expectedContent = Object.assign({}, payload, { edges: verdictEdges });
  const exact = !!(read && read.source === source && content &&
    (isDeepStrictEqual(content, payload) || isDeepStrictEqual(content, expectedContent)));
  return exact
    ? { ok:true, banked:true, source:source, receipt_state:state, verdict:verdict }
    : { ok:true, banked:false, source:source, receipt_state:'receipt_unverified',
      reason:'writ_verdict_receipt_unverified', verdict:verdict };
}

module.exports = {
  detectCornyProse: detectCornyProse, detectCornyDialogue: detectCornyDialogue,
  judgeProse: judgeProse, writProse: writProse
};
