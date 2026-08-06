// ⬡B:agents.meta_commentary:MODULE:voice_guard_v2:20260615⬡
// ⬡B:agents.meta_commentary:BUILD:wonder_organ_cold_flaggers_llm_decider:20260724⬡
// META COMMENTARY v3, the post-write judging pass of the meta commentary wonder.
// Spec: docs/specs/META_COMMENTARY_AND_WRIT_WONDERS.md. Pattern copied from
// board/writ/writ.js (20260718 conversion): cold code can HELP, never RESULT.
// RENDER, not KILL.
//
// The split, per the founder's law:
//  - COLD FLAGGERS detect facts and raise hints. The v2 regexes survive below,
//    but they never strip a sentence on their own again (that was exactly the
//    outlawed pattern: the rule deciding instead of the mind).
//  - The LLM DECIDER reads the flags with everything it has and renders the
//    cleaned text. It may overrule any flag, including deciding a flagged
//    phrase truly belongs. It preserves warmth and length: a 100 word email
//    full of recap comes back as 100 words of warmth, never 10 punchy words.
//  - FAILS OPEN ON TASTE, HOLDS ON IDENTITY: if the ladder gives nothing while
//    flags are raised, a TASTE flag (recap, narration, corny phrasing) ships the
//    ORIGINAL draft untouched with the flags on the receipt, because a phrase
//    list must never delete a real answer. An IDENTITY or LEAK flag still holds
//    and hands the draft to the one-ladder healer. See NEVER_SHIP_UNJUDGED and
//    the 20260728 fix note on the failure path for why the split is the law.
//  - ZERO FLAGS means nothing to judge: the draft passes through unchanged and
//    no model is spent (penny hustle). Residual explicit model self-description
//    stays owned downstream by defaultMetaCommentaryStage's bounded regex in
//    core/pai.outbound.council.js, which feeds the one-ladder healer.
//
// One source: management/meta.commentary.js is a superseded shim over this
// file. The model comes from env through the one ladder (core/model.ladder.js),
// same posture as board/writ/writ.js: MODEL_LADDER_ORDER and the GLM_* env
// pick the penny tier. No model name lives in this file.
//
// AGENT CORNY lives here as the named flag category 'corny' (corny, AI-ish
// phrasing), per the spec and the founder: part of meta commentary, never a
// separate cold file.

var crypto = require('crypto');

function digestOutput(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

var FLAGGERS = {
  // sentences that describe the model instead of speaking to the reader
  model_self_description: [
    /as an ai\b/i, /as a language model/i,
    /\b(?:i\s+am|i['’]m)\s+(?:an?\s+)?(?:ai|language\s+model)\b/i,
    /\bmy\s+training\b/i, /\bmy\s+knowledge\s+cutoff\b/i,
    /\bmy\s+(?:ai|model)\s+limitations?\b/i
  ],
  // sentences for the process, not the reader
  process_narration: [
    /i should note/i, /it's worth noting/i, /i want to clarify/i,
    /let me note/i, /please note/i, /i will now/i, /i'm going to/i,
    /i'll provide/i, /let me tell you/i, /i've noticed that/i,
    // process-narration OPENERS (spec Group 1): a draft that starts by narrating
    // how it was made instead of starting at the content the reader wants.
    /^\s*per your instructions/i, /i've updated this to reflect/i,
    /i have updated this to reflect/i,
    /based on (?:the|our) (?:conversation|session|discussion)/i,
    /i've organized this into/i, /i have organized this into/i,
    /this document (?:follows|outlines)/i, /^\s*as discussed\b/i,
    /as (?:i )?mentioned earlier/i, /^\s*to recap\b/i, /just to recap/i,
    /this section explains/i, /the following outlines/i, /below you will find/i,
    /i've included the following/i, /i have included the following/i,
    /in line with what you shared/i
  ],
  // JUSTIFICATION language (spec Group 2, the highest-value catch): a sentence
  // that exists to justify why the work is worth what it costs. The work speaks
  // for itself. The decider removes these unless one genuinely serves the reader.
  justification: [
    /to demonstrate our value/i, /to show our commitment/i, /this is included to/i,
    /we explain this here to/i, /this section is meant to/i,
    /the purpose of this (?:section|document) is/i, /we include this because/i,
    /as part of (?:our|the) (?:deliverable|engagement)/i,
    /covers what the retainer includes/i, /what this (?:section )?covers/i,
    /what the .{0,30}\bcovers\b/i
  ],
  // COMPARISON and POSITIONING (spec Group 4): selling by contrast instead of
  // just doing the work in front of the reader.
  comparison_positioning: [
    /separates .{0,30} from every other/i, /unlike (?:other|most)\b/i,
    /what makes .{0,24} different/i, /is not a concept,? it is\b/i,
    /sets .{0,24} apart\b/i
  ],
  // narrating the revision history at the reader
  revision_narration: [
    /originally.{0,30}said/i, /previous.{0,20}version/i,
    /correct(ed|ing).{0,30}(error|mistake)/i, /apolog/i
  ],
  // an internal work announcing itself by name (Granddaddy 911: works feed
  // the wonder, they never speak or carry a persona at the human)
  agent_announcement: [
    /\b(?:i\s+am|i'm|this\s+is)\s+(?:agent\s+)?(?:pam|shadow|quill|writ|corny|coda|wrapsmith|logful|abaham|cellm)\b/i,
    /\bagent\s+(?:pam|shadow|quill|writ|corny|coda|wrapsmith)\b/i
  ],
  // internal machinery vocabulary surfacing in outbound prose
  internal_vocabulary: [
    /\babacia\b/i, /\babaham\b/i, /\bacl\s+stamp/i, /\bcellm\b/i,
    /\bham\s+uid\b/i, /\blogful\b/i, /\bwritgate\b/i, /\baibe_brain\b/i,
    /\brun\s+of\s+show\b/i, /\bmodel\s+ladder\b/i, /\bcouncil\s+stage\b/i,
    /\bcara\s+chat\s+portal\b/i, /\bcoding\s+department\b/i,
    /\bthinking\s+stream\b/i, /\bmiddle\s+of\s+(?:the\s+)?cycle\b/i
  ],
  // AGENT CORNY: corny, AI-ish phrasing (a named lens of this wonder)
  corny: [
    /i hope this (?:email |message )?finds you well/i,
    /in today's fast[- ]paced world/i, /buckle up/i, /look no further/i,
    /without further ado/i, /\bdive (?:in|into|right in)\b/i,
    /unlock the (?:power|potential|full)/i, /game[- ]chang(?:er|ing)/i,
    /take .{0,20}to the next level/i, /possibilities are endless/i,
    /exciting journey/i, /\bembark(?:ing)? on\b/i, /\bdelve\b/i,
    /rich tapestry/i, /\bunleash\b/i, /elevate your/i, /supercharge/i,
    /revolutioniz/i, /\bseamlessly\b/i, /in a world where/i
  ]
};

// ⬡B:agents.meta_commentary:LAW:taste_fails_open_identity_never_ships_unjudged:20260728⬡
// NOT EVERY FLAG IS THE SAME KIND OF THING, and conflating them is what made
// the failure path wrong in both directions at once.
//
// These three categories are not matters of taste. They are the shapes that
// must never reach a human without a mind having ruled on them:
//   model_self_description  she never claims to be an AI or narrates her own
//                           limits; that is the hollow mimicry the standing law
//                           forbids outright.
//   agent_announcement      Granddaddy 911: a work feeds the wonder, it never
//                           speaks in its own name at a human.
//   internal_vocabulary     the machinery naming itself in outbound prose.
// If the mind cannot be reached, these HOLD, and the one-ladder healer takes
// its shot at repairing the draft. Verified live: an answer reading "I am an AI,
// so my model limitations prevent a direct answer" must never ship, and a blunt
// fail-open shipped exactly that.
//
// EVERYTHING ELSE IS TASTE: process narration, justification, positioning,
// revision narration, corny phrasing, task framing, assignment recap. A phrase
// list cannot rule on those, and when no mind is available to rule, the honest
// answer is to ship the real draft rather than delete it. PAM (credentials,
// cross-world leaks) and SHADOW (factual integrity) both run AHEAD of this seat
// in STAGE_ORDER and judge the incoming bytes, while final STAMP runs canonical
// PAM again on the exact transformed bytes after every model renderer. A taste
// flag failing open here therefore cannot bypass the final privacy boundary. It
// can only ship a sentence a little less polished than the organ would have
// made it, and that is a far smaller loss than the human getting nothing at all.
var NEVER_SHIP_UNJUDGED = ['model_self_description', 'agent_announcement', 'internal_vocabulary'];

function hasUnjudgeableRisk(flags) {
  return (flags || []).some(function (flag) {
    return flag && NEVER_SHIP_UNJUDGED.indexOf(flag.category) >= 0;
  });
}

// task framing that belongs to the assignment, not the answer
var TASK_FRAMING_OPENER = /^(here is|here's|i have|i've|below is|the following|as requested|as you asked|sure[,!]|certainly[,!]|of course[,!])/i;

var STOP_WORDS = new Set(['that', 'this', 'with', 'from', 'have', 'your',
  'they', 'their', 'there', 'then', 'than', 'what', 'when', 'where', 'which',
  'would', 'could', 'should', 'about', 'into', 'only', 'also', 'does', 'were',
  'been', 'being', 'because', 'while', 'after', 'before', 'just', 'very',
  'please', 'need', 'want', 'like', 'make', 'made']);

function significantWords(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter(function (word) { return word.length >= 4 && !STOP_WORDS.has(word); });
}

// COLD RECAP DETECTOR: a fact extractor, not a judge. It measures how much of
// a draft sentence is words the assignment already said, and flags heavy
// overlap as a possible recap. Whether it truly recaps, and the warm
// re-render, belong to the decider.
function flagRecap(intent, outbound) {
  var intentAnchors = new Set(significantWords(intent));
  if (intentAnchors.size < 4) return [];
  var flags = [];
  String(outbound).split(/(?<=[.!?])\s+/).forEach(function (sentence) {
    var words = significantWords(sentence);
    if (words.length < 4) return;
    var shared = words.filter(function (w) { return intentAnchors.has(w); }).length;
    if (shared / words.length >= 0.6) {
      flags.push({ category: 'assignment_recap', hint: sentence.trim().slice(0, 80) });
    }
  });
  return flags.slice(0, 4);
}

// THE COLD FLAGGER. Annotates findings only; never edits a byte.
function flagMetaCommentary(outbound, intent) {
  var text = String(outbound || '');
  var flags = [];
  Object.keys(FLAGGERS).forEach(function (category) {
    FLAGGERS[category].forEach(function (pattern) {
      var match = text.match(pattern);
      if (match) flags.push({ category: category, hint: String(match[0]).slice(0, 60) });
    });
  });
  var opener = text.trimStart().match(TASK_FRAMING_OPENER);
  if (opener) flags.push({ category: 'task_framing', hint: String(opener[0]).slice(0, 60) });
  return flags.concat(flagRecap(intent, text));
}

// ⬡B:agents.meta_commentary:BUILD:the_verdict_gets_banked_not_only_returned:20260802⬡
// Roadmap row W4-L4 WRIT FAMILY: "META COMMENTARY becomes one organ every
// advisor runs." The decider below already IS the organ the row asks for,
// cold FLAGGERS gather evidence, the LLM alone renders the verdict, and it
// was already live before this pass. What was missing, named in this
// codebase's own RULINGS ("a roadmap receipt naming a bead is a promise
// about what gets BANKED, not just what gets called"): decideMetaCommentary
// returned a verdict to its one in-memory caller and persisted nothing, so no
// FIND read could ever retrieve what this organ actually decided on a given
// turn. bankVerdict below closes that, best-effort and never blocking the
// answer: a bank failure (no hamUid resolved, brain unreachable, a bad
// write) is swallowed and recorded on the verdict itself, never turned into
// a held or altered answer, because persistence is bookkeeping, not a gate.
async function bankVerdict(turn, result) {
  var verdict = result && result.metaCommentary;
  if (!verdict) return; // nothing was judged (pamBlocked or no draft), nothing to bank
  var exactOutput = result && typeof result.pendingOutbound === 'string' ? result.pendingOutbound : '';
  verdict.output_digest = digestOutput(exactOutput);
  verdict.output_bytes = Buffer.byteLength(exactOutput, 'utf8');
  var ham = String((turn && turn.hamUid) || '').trim().toUpperCase();
  if (!ham) { verdict.banked = false; verdict.bank_reason = 'meta_commentary_no_ham'; return; }
  var bank = (turn && turn.brain) || require('../core/brain.client.js');
  var source = 'meta_commentary.verdict.' + ham.toLowerCase() + '.' + Date.now();
  var state = verdict.ok === true
    ? (verdict.failed_open ? 'unavailable' : 'completed') : 'held';
  var payload = {
    schema: 'meta_commentary.verdict.v1', state: state, ok: !!verdict.ok,
    decider: verdict.decider || null, flags: result.metaCommentaryFlag || [],
    failed_open: !!verdict.failed_open, why_changed: verdict.why_changed || null,
    output_digest: verdict.output_digest, output_bytes: verdict.output_bytes
  };
  try {
    await bank.writeBead({
      hamUid: ham, agentGlobal: 'META_COMMENTARY', source: source, type: 'META_COMMENTARY_VERDICT',
      summary: '[META COMMENTARY] ' + (verdict.decider || 'unjudged'),
      content: payload,
      importance: 4,
      edges: [{ type: 'PRODUCED_BY', target: 'station.meta_commentary' }]
    });
    var read = typeof bank.findBySource === 'function' ? await bank.findBySource(source, ham) : null;
    var readContent = read && read.content;
    if (typeof readContent === 'string') {
      try { readContent = JSON.parse(readContent); } catch (parseError) { readContent = null; }
    }
    var exact = !!(read && String(read.source || '') === source && readContent &&
      readContent.state === payload.state && readContent.decider === payload.decider &&
      readContent.failed_open === payload.failed_open &&
      JSON.stringify(readContent.flags || []) === JSON.stringify(payload.flags) &&
      readContent.why_changed === payload.why_changed &&
      readContent.output_digest === payload.output_digest &&
      readContent.output_bytes === payload.output_bytes);
    verdict.banked = exact;
    verdict.receipt_state = exact ? state : 'receipt_unverified';
    verdict.bank_source = source;
    if (!exact) verdict.bank_reason = 'meta_commentary_receipt_unverified';
  } catch (error) {
    verdict.banked = false;
    verdict.bank_reason = 'meta_commentary_bank_failed';
    verdict.receipt_state = 'receipt_unverified';
  }
}

// THE DECIDER. Same contract as v2 (handle(turn, result)), so the council
// stage in core/pai.outbound.council.js and the run-of-show handler map both
// keep working untouched. Every turn that reaches this stage entered through
// the ABAHAM door (gates/abaham) upstream, so turn.hamUid is already resolved
// identity, never raw input.
async function decideMetaCommentary(turn, result) {
  if (!result.pendingOutbound || result.pamBlocked) return result;

  var outbound = result.pendingOutbound;
  var intent = (turn && turn.intent) || '';
  var flags = flagMetaCommentary(outbound, intent);

  if (flags.length === 0 && !(turn && turn.forceModel === true)) {
    // nothing flagged, nothing to judge, no model spent
    result.metaCommentaryFlag = null;
    result.metaCommentary = { ok: true, decider: 'cold_pass_no_flags', flags: [],
      why_changed: 'The draft needed no Meta Commentary change.' };
    return result;
  }

  var hints = flags.map(function (f) { return f.category + ': ' + f.hint; });
  var rendered = null;
  try {
    var deliberate = (turn && typeof turn.deliberate === 'function')
      ? turn.deliberate
      : require('../core/model.ladder.js').deliberate;
    var system = 'You are A’NU editing your own words before they leave the house. '
      + 'META COMMENTARY is the role, not your name. The one test, sentence by sentence: '
      + 'is this for the reader, or is this for the process? Remove assignment recap, '
      + 'process narration, justification language, agent self-announcements, internal '
      + 'system vocabulary, and corny AI phrasing (the CORNY lens). RENDER, do not shrink: '
      + 'keep the length and turn recap into warmth and real substance; a 100 word draft '
      + 'comes back near 100 words with the recap gone. Keep every real fact, name, number, '
      + 'and commitment exactly as written. These hints come from a rough cold scan and may '
      + 'be wrong; you may overrule any of them, including deciding a flagged phrase truly '
      + 'belongs: ' + JSON.stringify(hints.slice(0, 12)) + '. '
      + 'Reply with ONLY the corrected text, nothing else. If the draft already speaks only '
      + 'to the reader, return it unchanged. Reply with the single word HOLD only if the '
      + 'draft is unfixable because it leaks a real secret or private data.';
    var user = 'ASSIGNMENT (what the reader already wrote in; never recap it back to them):\n'
      + String(intent).slice(0, 2000)
      + '\n\nDRAFT:\n' + outbound;
    var out = await deliberate(system, user, {
      max_tokens: parseInt(process.env.META_COMMENTARY_MAX_TOKENS || '1200', 10),
      temperature: 0
    });
    rendered = String((out && (out.content || out.text || out.answer)) || '').trim();
  } catch (eOrgan) {
    rendered = null;
  }

  if (!rendered) {
    // ⬡B:agents.meta_commentary:FIX:a_broken_judge_never_silences_her:20260728⬡
    // THIS PATH USED TO BLANK THE ANSWER. It set pendingOutbound to '', which
    // defaultMetaCommentaryStage reads as ok:false, which holds the whole
    // council. Reproduced on 20260728 against the real code: a warm, correct,
    // entirely shippable answer whose ONLY cold flag was the word "apologies"
    // (the /apolog/i pattern in revision_narration) came back as the empty
    // string the moment the ladder was unreachable. Not hypothetical: the
    // board carried a live seat outage the same night
    // (coda_mind_deliberation_exhausted, seat dollar cap reached).
    //
    // That is the exact defect the founder corrected in WRIT on 20260718, when
    // live receipts proved the cycle produced a real answer and a style judge
    // held the whole thing. Cold code was deciding by itself again, just one
    // layer further out: the regex could not strip the sentence any more, so
    // instead it deleted the entire answer whenever the mind was away.
    //
    // WHY THIS IS NOT "silence over hollow": that law forbids fabricating a
    // reply, faking a connection, or shipping a hollow one. This draft is
    // none of those. It is a real answer the full cycle already composed with
    // real evidence. PAM owns credential and cross-world facts, and final STAMP
    // reruns canonical PAM on the exact bytes after this seat, WRIT, and A'NU
    // expression finish transforming them. So failing open here cannot bypass
    // the final privacy boundary.
    //
    // The flags ride the receipt either way, so the overrule is on the record
    // and LOGFUL can see that the mind was absent for this turn.
    //
    // THE SPLIT (see NEVER_SHIP_UNJUDGED above): an identity or leak shape still
    // holds, which is what hands the draft to the one-ladder healer for its
    // bounded repair attempt. Only TASTE fails open.
    if (hasUnjudgeableRisk(flags)) {
      result.pendingOutbound = '';
      result.metaCommentaryFlag = hints;
      result.metaCommentary = {
        ok: false, decider: 'hold_unjudged_identity_risk', flags: flags,
        held_draft_length: outbound.length,
        why_changed: 'The draft was held because a severe internal leak could not be judged.'
      };
      return result;
    }
    result.metaCommentaryFlag = hints;
    result.metaCommentary = {
      ok: true, decider: 'organ_unavailable_failed_open', flags: flags,
      failed_open: true, unjudged_draft_length: outbound.length,
      why_changed: 'The original warm draft was preserved because only taste hints were unjudged.'
    };
    return result;
  }

  if (/^HOLD\s*$/i.test(rendered)) {
    // the decider judged the draft unfixable (a real leak)
    result.pendingOutbound = '';
    result.metaCommentaryFlag = hints;
    result.metaCommentary = { ok: false, decider: 'hold_unfixable', organ_decider:'model', flags: flags,
      why_changed: 'The model judged the internal leak unfixable.' };
    return result;
  }

  // Meta owns its expression candidate. Cold overlap, length, and regex
  // witnesses do not decide whether its meaning survived. Penny SHADOW sees
  // the exact pre-WRIT, WRIT, post-Meta, and final bytes before release.
  result.pendingOutbound = rendered;
  result.metaCommentaryFlag = hints;
  result.metaCommentary = {
    ok: true, flags: flags,
    organ_decider: 'model',
    decider: rendered === outbound ? 'organ_overruled_all_flags' : 'organ_rendered',
    why_changed: rendered === outbound ? 'The model kept the draft exactly.' :
      'The model rendered the reader-facing candidate for final meaning review.'
  };
  return result;
}

// THE PUBLIC ENTRY. Runs the real decision unchanged, then a best-effort bank
// of whatever verdict it reached. Banking never runs ahead of the decision
// and never revisits it: this is persistence of a verdict already made, not a
// second judgment.
async function handle(turn, result) {
  var out = await decideMetaCommentary(turn, result);
  try { await bankVerdict(turn, out); } catch (error) { /* a bank failure never blocks the answer */ }
  return out;
}

module.exports = {
  handle: handle,
  decideMetaCommentary: decideMetaCommentary,
  bankVerdict: bankVerdict,
  flagMetaCommentary: flagMetaCommentary,
  FLAGGERS: FLAGGERS,
  TASK_FRAMING_OPENER: TASK_FRAMING_OPENER,
  NEVER_SHIP_UNJUDGED: NEVER_SHIP_UNJUDGED,
  hasUnjudgeableRisk: hasUnjudgeableRisk
};
