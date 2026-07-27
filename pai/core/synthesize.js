// ⬡B:core.synthesize:MODULE:sigil_shadow_pam:20260630⬡
// entered via the ABAHAM door, serving channel MESSAGES (synthesis shapes the artifact every channel carries)
// SYNTHESIZE — takes PAI output, stamps SIGIL, runs SHADOW audit, gates via PAM.
// SIGIL: stamps every response with source tracing. C0 cost.
// SHADOW: audits for hollow phrases, internal names, em dash. C0 cost.
// PAM: gates sensitive content by trust tier. C0 cost.
// ANYHAM test: trust tier from HAM profile drives PAM gate. No hardcode.
'use strict';
// SHADOW audit — flags violations in response text
var HOLLOW = ['Certainly!','Of course!','Great question','Absolutely!','Sure thing',
              'I\'d be happy to','Definitely!','No problem!'];
var DEAD_NAMES = ['EANEW','CANEW','MEMORY_BANK','AIBE','ATAI','ABA','Miss Mac','AIRRIA'];

function shadowAudit(text) {
  var violations = [];
  if (text.includes('\u2014')) violations.push('em_dash_found');
  HOLLOW.forEach(function(h){ if (text.includes(h)) violations.push('hollow:'+h); });
  DEAD_NAMES.forEach(function(n){
    if (text.toUpperCase().includes(n.toUpperCase()))
      violations.push('dead_name:'+n);
  });
  // Internal-label leak — model echoing its own system prompt's stamp vocabulary
  // (SIGIL:, SHADOW:, ACL:, or a literal ⬡B: stamp) directly into a reply.
  // \u2b21B:core.synthesize:FIX:tool_name_and_reminder_bleed_leak_20260711\u2b21
  // Founder screenshot 20260711: asked 'who is my favorite team?' over text and got
  // 'I need to search... find_in_brain Oh and real quick, remember: Book the timeshare
  // hotel...' -- TWO leaks in one: (1) the raw tool NAME find_in_brain printed as
  // plain text, and (2) a reminder from the MEMORY_BANK context bled straight into the spoken
  // answer. Both are internal machinery escaping to the caller. The stamp-leak cut
  // now also catches bare tool names and the reminder-bleed marker, cutting from the
  // first one onward -- everything after it is machinery, never real answer.
  var STAMP_LEAK = /\b(SIGIL|SHADOW|ACL)\s*:|\u2b21B:|\b(find_in_brain|write_to_brain|get_pending_drafts|get_budget_summary|get_budget_upcoming|update_screen|get_recent_builds|read_render_logs|create_reminder|nash_sports)\b|\bOh and real quick, remember:/i;
  if (STAMP_LEAK.test(text)) violations.push('stamp_leak');
  // Scrub violations
  var clean = text.replace(/\s*[\u2014\u2013]\s*/g, ', ');
  HOLLOW.forEach(function(h){ clean = clean.replace(new RegExp(h,'gi'),''); });
  // Cut everything from the first leak marker onward — whatever follows it
  // is internal-format text the model shouldn't have produced, not real answer content.
  var leakMatch = clean.match(STAMP_LEAK);
  if (leakMatch) clean = clean.slice(0, leakMatch.index).trim();
  return { violations: violations, clean: clean.trim(), passed: violations.length === 0 };
}

// ⬡B:core.synthesize:FIX:no_secret_literal_scrubber_existed_anywhere_on_the_reply_path:20260727⬡
// CATHY.SHADOW cold-audit, live 20260727, on POST /cara/consult (routes/cara.routes.js's own
// "THE BLIND SPOT" comment already named this exactly: mode 'internal' only turns off WRIT's
// INTERNAL_SYSTEM_TERMS check so she may name her own machinery to a coder; nothing in cold
// code has ever scanned her answer text for a real credential shape before it ships in a JSON
// response). Detection only, never mutation: this never rewrites or strips a byte of her
// composed answer (core/synthesize.js's own council-mutation guard above forbids that). It
// answers one question -- does this text contain something shaped like a live secret -- so a
// caller (a route, not this module) can refuse to send the reply at all rather than launder it.
// Patterns are known real credential shapes seen leaked in THIS codebase's own audit history
// (Supabase/Nylas JWTs, ElevenLabs sk_, GitHub gh*_, AWS AKIA, Google AIza, Slack xox*-, Render
// rnd_, Nylas nyk_v0_, OpenAI/Anthropic sk-) plus a bare three-segment JWT shape, not a generic
// hex/base64 scan, because a generic scan would fail-closed on ordinary content like a commit
// SHA or a bead ID and this door would go silent on harmless answers. A miss here is not a
// promise of safety: it is a backstop, not the privacy or identity gate.
var SECRET_LITERAL_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bsk_[a-f0-9]{16,}\b/i,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\brnd_[A-Za-z0-9]{20,}\b/,
  /\bnyk_v0_[A-Za-z0-9]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
];

function secretLiteralScan(text) {
  var s = typeof text === 'string' ? text : '';
  var found = SECRET_LITERAL_PATTERNS.some(function (re) { return re.test(s); });
  return { found: found };
}

// SIGIL — stamps every response with source tracing
function sigil(hamUid, channel, text, ms) {
  var ts = Date.now();
  var stamp = '\u2b21B:' + channel + '.response:RESULT:' + hamUid + ':' + ts + '\u2b21';
  return { stamp: stamp, ham_uid: hamUid, channel: channel, ms: ms, ts: ts };
}

// ⬡B:core.synthesize:FIX:the_ladder_was_inverted_and_this_comment_still_pointed_the_old_way:20260726⬡
// PAM gate, TRUST TIER, not the people ladder. This function has always operated on
// identity.trust_level, the 0-to-10 confidence-in-the-channel scale where 10 is the fully
// resolved owner and 0 is an unknown caller. The sentence that used to sit here said
// "T10 = founder, gets everything", which reads as if it were describing the PEOPLE ladder.
// It is not, and the people ladder was INVERTED by the founder's 20260724 doctrine: T0 is
// the founder and holds everything, T1 is the highest circle, T2 is ENVOLVE only with no
// external-org connection, and each tier inherits everything beneath it. LOWER NUMBER,
// MORE PRIVILEGE. Anyone reading the old sentence and writing a comparison against it
// produced a gate pointing exactly the wrong way, which on the people ladder means showing
// the founder's most private tier to the widest audience.
//
// So the two axes are named apart, permanently:
//   TRUST TIER   here, 0..10, HIGHER is more resolved. How sure are we who is on this channel.
//   PEOPLE TIER  core/privacy/people.tier.js, T0..T4, LOWER is more privileged. Who is
//                allowed to see this content. That is the ladder the doctrine inverted, and
//                it is enforced structurally at the query, never by a regex over an answer.
//
// This regex is a deterministic backstop over an already-composed answer on a low-trust
// channel, and that is all it has ever been. It is NOT the privacy gate and must never be
// mistaken for one: judgment about whether content may travel to a person belongs to a mind
// (board/pam/pam.js pamRelease) and to the query filter, both of which fail closed.
function pamGate(text, trustTier) {
  var tier = parseInt(trustTier) || 0;
  // Below trust 5 the channel has not established who is speaking: no financial details,
  // no personal data summaries, regardless of what the answer says about itself.
  if (tier < 5) {
    var sensitive = /\$[0-9,]+|bank|account|ssn|social security/gi;
    if (sensitive.test(text)) {
      return { ok: false, gated: true, reason: 'sensitive_content_below_trust5' };
    }
  }
  return { ok: true, gated: false, text: text };
}

// Main synthesize function — wraps PAI output
async function synthesize(paiResult, question, channel) {
  if (!paiResult.ok) return { ok: false, reason: paiResult.reason };

  // No canned fallback. If somehow there's no answer, bail with ok:false so nothing hollow sends.
  var rawText = typeof paiResult.answer === 'string' ? paiResult.answer : '';
  if (!rawText.trim()) return { ok: false, reason: 'empty_answer' };
  var hamUid = paiResult.ham ? paiResult.ham.uid : 'UNKNOWN';
  var trustTier = paiResult.ham ? (paiResult.ham.tier || 0) : 0;
  // ⬡B:core.synthesize:GUARD:no_legacy_success_without_council_receipt:20260715⬡
  // runPAI now returns the exact A'NU expression only after durable council
  // readback. Synthesis may add records and metadata, but it cannot bless an old
  // success shape or alter the stamped answer.
  var requestId = paiResult.requestId || paiResult.request_id;
  var cycleId = paiResult.cycleId || paiResult.cycle_id;
  var verifiedCouncil = false;
  try {
    var binding = paiResult._councilBinding || {};
    var committed = require('./pai.outbound.council.js').requireVerifiedCouncilResult(paiResult,
      { hamUid:hamUid,requestId:requestId,cycleId:cycleId,
        question:String(binding.question != null ? binding.question : question || ''),
        deliberationInput:String(binding.deliberationInput != null
          ? binding.deliberationInput : binding.question != null ? binding.question : question || ''),
        answer:paiResult.answer });
    verifiedCouncil = !!(committed && committed.ok && committed.answer === paiResult.answer);
  } catch (eCouncilVerify) { verifiedCouncil = false; }
  if (!verifiedCouncil) return { ok:false, reason:'pai_council_receipt_missing_or_invalid' };

  // ⬡B:core.synthesize:GUARD:council_is_the_only_final_shaper:20260715⬡
  // The durable council already ran SHADOW, PAM, WRIT, and A'NU expression in
  // order. This legacy layer may inspect the committed bytes and attach
  // metadata, but it may never trim, scrub, rewrite, or replace them after
  // STAMP. If its older pattern scrub would change even one byte, fail closed.
  var shadow = shadowAudit(rawText);
  if (!shadow.clean) return { ok: false, reason: 'shadow_scrubbed_to_empty' };
  if (shadow.clean !== rawText) return { ok: false, reason: 'post_council_shadow_mutation_rejected' };
  var text = rawText;

  var receipt = paiResult.council_receipt || paiResult.councilReceipt;
  var shadowStage = receipt && Array.isArray(receipt.stages)
    ? receipt.stages.find(function (stage) { return stage && stage.stage === 'SHADOW'; }) : null;
  var hallucinationCheck = {
    pass: !!(shadowStage && shadowStage.ok === true),
    note: shadowStage && shadowStage.reason || 'council_shadow_missing'
  };

  // PAM gate
  var pam = pamGate(text, trustTier);
  if (pam.gated) {
    return { ok: false, reason: 'post_council_pam_mutation_rejected' };
  }

  // ⬡B:core.synthesize:WIRE:artifact_md_law_l6:20260706⬡
  // Artifact law: a substantial, structured deliverable (long, multi-section,
  // list-heavy, or explicitly a document) defaults to a markdown artifact, not
  // a wall of prose stuffed into a chat bubble or an email body. Cold detection
  // here, the exit/reach layer honors the flag; short conversational replies are
  // untouched. This keeps 'write me the plan' from arriving as an unreadable
  // text blob.
  var artifactHint = null;
  var longEnough = text.length > 1200;
  var structured = (text.match(/\n\s*[-*]\s/g) || []).length >= 4
    || (text.match(/\n#{1,6}\s/g) || []).length >= 2
    || /```/.test(text);
  var docWords = ['doc'+'ument','write'+'up','re'+'port','pl'+'an','out'+'line','dr'+'aft','gu'+'ide','me'+'mo'];
  var askedDoc = new RegExp('\\b(' + docWords.join('|') + ')\\b','i').test(String(question || ''));
  if ((longEnough && structured) || (askedDoc && longEnough)) {
    artifactHint = { format: 'md', reason: longEnough && structured ? 'long_structured' : 'asked_document' };
  }

  // SIGIL stamp
  var sg = sigil(hamUid, channel, text, paiResult.ms);

  if (text !== paiResult.answer) {
    return { ok:false, reason:'post_council_answer_mutation_rejected' };
  }

  return {
    ok: true,
    text: text,
    artifact: artifactHint,
    sigil: sg,
    shadow: { violations: shadow.violations, passed: shadow.passed },
    hallucination_check: { passed: hallucinationCheck.pass, note: hallucinationCheck.note || hallucinationCheck.verdict || null },
    pam_gated: pam.gated,
    ham_uid: hamUid,
    tools_used: paiResult.tools_used,
    ms: paiResult.ms,
    fcw_ms: paiResult.fcw_ms
  };
}

// ⬡COLD:act:remove:PAI_SYNTHESIS_PROJECTION:20260725⬡
// Synthesis is a pure, post-council projection. Memory gifts are decided inside the
// full PAI cycle and committed through the governed write_to_brain effect only after
// council receipt and STAMP readback. No detached model or brain write may escape here.
module.exports = { synthesize, shadowAudit, sigil, pamGate, secretLiteralScan };
