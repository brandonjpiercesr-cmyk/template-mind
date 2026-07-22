// ⬡B:core.synthesize:MODULE:sigil_shadow_pam:20260630⬡
// entered via the ABAHAM door, serving channel MESSAGES (synthesis shapes the artifact every channel carries)
// SYNTHESIZE — takes PAI output, stamps SIGIL, runs SHADOW audit, gates via PAM.
// SIGIL: stamps every response with source tracing. C0 cost.
// SHADOW: audits for hollow phrases, internal names, em dash. C0 cost.
// PAM: gates sensitive content by trust tier. C0 cost.
// ANYHAM test: trust tier from HAM profile drives PAM gate. No hardcode.
'use strict';
// ⬡B:core.synthesize:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}
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

// SIGIL — stamps every response with source tracing
function sigil(hamUid, channel, text, ms) {
  var ts = Date.now();
  var stamp = '\u2b21B:' + channel + '.response:RESULT:' + hamUid + ':' + ts + '\u2b21';
  return { stamp: stamp, ham_uid: hamUid, channel: channel, ms: ms, ts: ts };
}

// PAM gate — tier-based content control
// T10 = founder, gets everything. Lower tiers get filtered if content is sensitive.
function pamGate(text, trustTier) {
  var tier = parseInt(trustTier) || 0;
  // Below T5: no financial details, no personal data summaries
  if (tier < 5) {
    var sensitive = /\$[0-9,]+|bank|account|ssn|social security/gi;
    if (sensitive.test(text)) {
      return { ok: false, gated: true, reason: 'sensitive_content_below_t5' };
    }
  }
  return { ok: true, gated: false, text: text };
}

// Stamp meeting minutes to brain
async function stampMinutes(hamUid, channel, question, answer, toolsUsed, ms) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return;
  var summary = '[MINUTES ' + channel + '] Received message from ' + hamUid +
    '. Tools used: ' + (toolsUsed.join(',') || 'none') + '. Responded in ' + ms + 'ms.';
  var bead = {
    ham_uid: hamUid, agent_global: 'PAI', stamp_type: 'MINUTES',
    source: 'pai.minutes.' + hamUid + '.' + Date.now(),
    acl_stamp: '\u2b21B:pai.minutes:MINUTES:turn:20260630\u2b21',
    summary: summary,
    content: JSON.stringify({ channel, question: question.slice(0), answer: answer.slice(0), toolsUsed, ms }), // 200-char slice lost the tail of the founder's INVOLVE doctrine drop 20260702 — conversations are the record, keep them
    importance: 6
  };
  try {
    await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST',
      headers: { apikey: _bk(), Authorization:'Bearer ' + _bk(), 'Accept-Profile':_schema(),
                 'Content-Profile':_schema(), 'Content-Type':'application/json', Prefer:'return=minimal' },
      body: JSON.stringify(bead)
    });
  } catch(e) {}
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

  // Stamp meeting minutes async (fire and forget)
  stampMinutes(hamUid, channel, question, text, paiResult.tools_used || [], paiResult.ms).catch(function(){});

  // ⬡B:core.synthesize:WIRE:memory_keeper:20260702⬡
  // MEMORY IS BORN WHEN GIVEN — structurally. Live incident: founder texted "keep
  // this moment" and her reply confirmed it, but toolsUsed was empty; the model
  // skipped write_to_brain and the gift survived only as a conversation record. A
  // prose directive is too soft for something this important, so the keeper runs
  // deterministically every turn: C1 (penny model) decides if the person handed over
  // a decision/rename/moment/fact to keep; if yes, a MEMORY bead is stamped with
  // their words. Never blocks the reply; fails silent.
  (async function keepGiftedMemory() {
    try {
      var GK = process.env.TOGETHER_API_KEY, BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
      if (!GK || !BU || !BK || !question) return;
      // ⬡B:core.synthesize:WIRE:ornith_primary_groq_fallback:20260705⬡
      // Board-settled ladder. Fire-and-forget, never blocks the reply, so
      // Ornith's real latency costs nothing here -- and unlike the digest's
      // grounding gate (kept on Groq on purpose), a miss here is low-stakes:
      // worst case a memory does not get saved, recoverable, not harmful.
      var sysMem = 'You detect when a person is GIVING a memory to keep: a decision, a rename, a moment, an instruction like keep this or remember this or never lose this. Not questions, not small talk. Reply EXACTLY: KEEP: YES or KEEP: NO, then on the next line GIST: one sentence in their words if YES.';
      var ornithMem = require('./ornith.client');
      var out = await ornithMem.callOrnith(sysMem, question.slice(0), 120);
      if (!out) {
        var r = await fetch('https://api.together.xyz/v1/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + GK, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: (process.env.TOGETHER_MODEL || 'zai-org/GLM-5.2'), max_tokens: 120, temperature: 0,
            messages: [{ role: 'system', content: sysMem },
                       { role: 'user', content: question.slice(0) }] })
        });
        var d = await r.json(); out = (d.choices && d.choices[0] && d.choices[0].message.content) || '';
      }
      if (!/KEEP:\s*YES/i.test(out)) return;
      var gm = out.match(/GIST:\s*([\s\S]+)/i); var gist = gm ? gm[1].trim().slice(0) : question.slice(0);
      await fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST',
        headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ham_uid: hamUid, agent_global: 'ANEW', stamp_type: 'MEMORY',
          acl_stamp: '\u2b21B:anew.memory:MEMORY:gifted:' + ymd() + '\u2b21',
          source: 'memory.gifted.' + hamUid + '.' + Date.now(),
          summary: '[MEMORY, given to me] ' + gist,
          content: JSON.stringify({ their_words: question.slice(0), my_confirmation: text.slice(0), channel: channel, kept_at: new Date().toISOString() }),
          importance: 9 }) });
    } catch (e) {}
  })();


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

module.exports = { synthesize, shadowAudit, sigil, pamGate, stampMinutes };
