// ⬡B:board.meta:MODULE:reader_brief_prewrite_pass:20260724⬡
// META COMMENTARY WONDER, the PRE-WRITE PASS (the briefing).
// Spec: docs/specs/META_COMMENTARY_AND_WRIT_WONDERS.md. Before any writer LLM
// puts down a word, this pass separates the assignment from the content, so
// the recap never gets written in the first place.
//
// Wonder contract, the five W's of this pass:
//  WHO:   fired for the one human who will read the outbound; universal across
//         any HAM, zero hardcoded identity (env resolved upstream, never a
//         literal in this file).
//  WHAT:  a structured reader brief: who reads this, why they wrote in, what
//         they already know that must never be recapped back, what warmth
//         looks like here, what would count as process narration.
//  WHEN:  at composition start, before the composer or an advisor drafts.
//  WHERE: injected into the writer's context window (BCW or ACW) by the
//         caller; this file only produces the brief and its context block.
//  WHY:   the founder's law: humans respond with complete warmth and on
//         point, they do not recap the assignment back at the reader.
//  HOW:   cold code CARRIES (it extracts what the inbound already said as a
//         flag packet, decides nothing); the LLM JUDGES (it writes the brief
//         with everything it has, through the one ladder).
//
// Entrance: readerBrief({ inbound, assignment, channel, hamUid, relationship }).
// Every caller is itself door-resolved through the ABAHAM door (gates/abaham)
// before its turn reaches composition, so the hamUid arriving here is already
// resolved identity, never raw input and never a literal.
// Exit: { ok, brief, packet, contextBlock } handed to the WRITER, never to a
// human (Granddaddy 911: works feed the wonder, they never speak), plus a
// stage receipt to LOGFUL, best effort.
// Failure-safe: if the ladder gives nothing, ok:false with the cold packet
// attached. No hollow brief is ever fabricated in cold code.
// Model comes from env through the one ladder (core/model.ladder.js), same
// posture as board/writ/writ.js: penny tier by env, no model name here.

var STOP_WORDS = new Set(['that', 'this', 'with', 'from', 'have', 'your',
  'they', 'their', 'there', 'then', 'than', 'what', 'when', 'where', 'which',
  'would', 'could', 'should', 'about', 'into', 'only', 'also', 'does', 'were',
  'been', 'being', 'because', 'while', 'after', 'before', 'just', 'very']);

// COLD CARRIER: pre-extract what the inbound already said, as facts for the
// judge ("the reader already told you these things"). Decides nothing.
function extractInboundPacket(inbound) {
  var text = String(inbound || '').replace(/\r/g, '');
  var sentences = text.split(/(?<=[.!?])\s+|\n+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
  var questions = sentences.filter(function (s) { return s.indexOf('?') >= 0; }).slice(0, 6);
  var statements = sentences.filter(function (s) { return s.indexOf('?') < 0 && s.length >= 20; }).slice(0, 10);
  var counts = {};
  (text.toLowerCase().match(/[a-z0-9']+/g) || []).forEach(function (word) {
    if (word.length < 4 || STOP_WORDS.has(word)) return;
    counts[word] = (counts[word] || 0) + 1;
  });
  var anchors = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 20);
  return { statements: statements, questions: questions, anchors: anchors };
}

// COLD CARRIER: shape the brief into the text block the caller stamps into
// the writer's context window. Formatting only, no judgment.
function briefContextBlock(brief) {
  if (!brief || typeof brief !== 'object') return '';
  var lines = ['READER BRIEF (from the meta commentary pre-write pass; write for this reader, never recap what they already know):'];
  if (brief.reader) lines.push('Who reads this: ' + brief.reader);
  if (brief.purpose) lines.push('Why they wrote in: ' + brief.purpose);
  if (Array.isArray(brief.already_known) && brief.already_known.length > 0) {
    lines.push('They already know, never recap back: ' + brief.already_known.join('; '));
  }
  if (brief.warmth) lines.push('What warmth looks like here: ' + brief.warmth);
  if (Array.isArray(brief.avoid) && brief.avoid.length > 0) {
    lines.push('Process narration to avoid: ' + brief.avoid.join('; '));
  }
  return lines.join('\n');
}

// Stage receipt to LOGFUL, best effort, never blocks or fails the pass.
async function stampReceipt(hamUid, summary, data) {
  try {
    var logful = require('../../logful/index.js');
    if (logful && typeof logful.logfulStore === 'function') {
      await logful.logfulStore({
        hamUid: hamUid || 'SYSTEM',
        agent: 'META_COMMENTARY',
        type: 'reader_brief',
        summary: summary,
        data: data
      });
    }
  } catch (eReceipt) { /* a lost receipt never blocks the pass */ }
}

// THE PASS. LLM judges, cold code carries.
async function readerBrief(input) {
  input = input || {};
  var inbound = String(input.inbound || '');
  var assignment = String(input.assignment || '');
  var channel = String(input.channel || 'unknown');
  var hamUid = input.hamUid || 'SYSTEM';

  if (!inbound && !assignment) {
    return { ok: false, reason: 'no_inbound_or_assignment', brief: null, packet: null, contextBlock: '' };
  }

  var packet = extractInboundPacket(inbound);

  var brief = null;
  try {
    var deliberate = typeof input.deliberate === 'function'
      ? input.deliberate
      : require('../../core/model.ladder.js').deliberate;
    var system = 'You are A’NU preparing to write to one human. Before a word is drafted, '
      + 'produce the reader brief that separates the assignment from the content, so the '
      + 'recap never gets written. Think with everything you have about who this reader is '
      + 'and what they wrote in for. The cold packet lists what the reader already said; it '
      + 'is a hint extract, it may be incomplete, use your own read of the inbound. '
      + 'Reply with ONLY a strict JSON object, no other text, with exactly these keys: '
      + '"reader" (who the one human reading this is), '
      + '"purpose" (the purpose they wrote in for), '
      + '"already_known" (array of things they already know that must never be recapped back to them), '
      + '"warmth" (what warmth looks like here, specific to this reader and moment), '
      + '"avoid" (array of what would count as process narration or recap in this reply).';
    var user = JSON.stringify({
      channel: channel,
      assignment: assignment.slice(0, 2000),
      inbound: inbound.slice(0, 4000),
      relationship_context: String(input.relationship || '').slice(0, 2000),
      cold_packet: packet
    });
    var out = await deliberate(system, user, {
      max_tokens: parseInt(process.env.READER_BRIEF_MAX_TOKENS || '700', 10),
      temperature: 0.2,
      json: true
    });
    var raw = String((out && (out.content || out.text || out.answer)) || '').trim();
    if (raw) {
      try { brief = JSON.parse(raw); } catch (eParse) { brief = null; }
    }
  } catch (eLadder) {
    brief = null;
  }

  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    // HOLD honestly: no mind was available to write the brief, so no brief
    // exists. The cold packet rides along as the only true facts we have.
    await stampReceipt(hamUid, 'reader brief HOLD: decider unavailable, channel ' + channel, {
      ok: false, reason: 'llm_decider_unavailable', channel: channel, packet: packet
    });
    return { ok: false, reason: 'llm_decider_unavailable', brief: null, packet: packet, contextBlock: '' };
  }

  var contextBlock = briefContextBlock(brief);
  await stampReceipt(hamUid, 'reader brief written for channel ' + channel, {
    ok: true, channel: channel, brief: brief, packet: packet
  });
  return { ok: true, brief: brief, packet: packet, contextBlock: contextBlock };
}

module.exports = {
  readerBrief: readerBrief,
  extractInboundPacket: extractInboundPacket,
  briefContextBlock: briefContextBlock
};
