// ⬡B:board.writ:MODULE:voice_brief_prewrite_pass:20260724⬡
// WRIT WONDER, the PRE-WRITE PASS (the voice briefing).
// Spec: docs/specs/META_COMMENTARY_AND_WRIT_WONDERS.md. Before the composer or
// an advisor drafts a word, this pass loads the voice, so the draft is born in
// voice instead of being sanded into it afterward by the post-write judge.
// Sibling of board/meta/reader.brief.js (the reader brief runs first in the
// run of show, this voice brief runs immediately after it).
//
// Wonder contract, the five W's of this pass:
//  WHO:   fired for the one human who will read or hear the outbound;
//         universal across any HAM, zero hardcoded identity (env resolved
//         upstream, never a literal in this file).
//  WHAT:  a structured voice brief: the voice law for this channel and reader
//         (warm, plain spoken, specific, coffee shop natural), how the words
//         flow on this channel, the greeting register for this specific
//         reader, the kill list carried as awareness rather than filters, and
//         the green light patterns (open with the human moment, end on the
//         last real thought).
//  WHEN:  at composition start, immediately after the reader brief.
//  WHERE: injected into the writer's context window (BCW or ACW) by the
//         caller; this file only produces the brief and its context block.
//  WHY:   the founder's law: WRIT must RENDER, not KILL, and the cheapest
//         render is the draft that never breaks the voice law in the first
//         place. Warmth is the law: humans respond with complete warmth and
//         on point. Em dashes never ship; a comma or a period carries the
//         pause.
//  HOW:   cold code CARRIES (it assembles the channel register from the
//         streaming doctrine, the warmth law, the no em dash law, and the
//         writ.js awareness lists as a constraints packet, decides nothing);
//         the LLM JUDGES (it writes the brief for this one reader with
//         everything it has, through the one ladder).
//
// Entrance: voiceBrief({ channel, hamUid, relationship, assignment }).
// ABAHAM door, stated truly: every caller is itself door-resolved through the
// ABAHAM door (gates/abaham) before its turn reaches composition, so the
// hamUid arriving here is already resolved identity, never raw input and
// never a literal. This file performs no door resolution of its own.
// Channel-path contract, stated truly: channel is the caller's declared name
// for the outbound surface (voice, alive, chat, text, email). This file never
// opens that channel, never streams on it, and never sends anything down it;
// it only names the surface's register, per the streaming doctrine, as text
// for the composing LLM. The reach that actually touches the channel lives
// elsewhere and runs after the full outbound council.
// Exit: { ok, brief, packet, contextBlock } handed to the WRITER, never to a
// human (Granddaddy 911: works feed the wonder, they never speak), plus a
// stage receipt to LOGFUL, best effort.
// Failure-safe: if the ladder gives nothing, ok:false with the cold
// constraints packet attached. No hollow brief is ever fabricated in cold
// code.
// Model comes from env through the one ladder (core/model.ladder.js), same
// posture as board/writ/writ.js: penny tier by env, no model name here.

// One source: the kill list and banned phrase awareness comes from the
// canonical WRIT organ, never a second hand-maintained copy.
var writ = require('./writ.js');

// The streaming doctrine's channel registers (Governors Doctrine, streaming
// section): full flow on voice and ALIVE, flowing on chat, reserved on text,
// none on email. Cold mapping of a doctrine fact, no judgment made here.
var CHANNEL_REGISTERS = {
  voice: 'full flow: microsecond read-back, full chatter, a live spoken conversation',
  phone: 'full flow: microsecond read-back, full chatter, a live spoken conversation',
  alive: 'full flow: microsecond read-back, full chatter, she is present and moving',
  chat: 'flowing: like a live message thread, cooking but never overbearing',
  text: 'reserved: intermittent, a few words that count, never a spam of messages',
  email: 'none: no streaming at all, one whole written piece that arrives finished'
};

// The two standing laws every voice brief carries, as doctrine text.
var WARMTH_LAW = 'Humans respond with complete warmth and on point. If the reply is 100 words, '
  + 'they are 100 words of warmth and excitement, never a recap of the assignment.';
var NO_EM_DASH_LAW = 'Em dashes never appear. A comma or a period carries the pause.';

// COLD CARRIER: assemble the voice constraints for this channel and reader as
// facts for the judge. Decides nothing; an unknown channel is carried as
// unknown with the doctrine's most careful register (reserved) named beside
// it, so the LLM sees the uncertainty instead of a silent guess.
function extractVoiceConstraints(channel, relationship) {
  var key = String(channel || '').trim().toLowerCase();
  var register = CHANNEL_REGISTERS[key] || null;
  return {
    channel: key || 'unknown',
    channel_known: !!register,
    register: register || CHANNEL_REGISTERS.text,
    warmth_law: WARMTH_LAW,
    no_em_dash_law: NO_EM_DASH_LAW,
    relationship: String(relationship || '').slice(0, 2000),
    awareness: {
      banned_words: writ.BANNED_WORDS.slice(0),
      super_bans: writ.SUPER_BANS.slice(0),
      cta_endings: writ.CTA_ENDINGS.slice(0),
      banned_headers: writ.BANNED_HEADERS.slice(0)
    }
  };
}

// COLD CARRIER: shape the brief into the text block the caller stamps into
// the writer's context window. Formatting only, no judgment.
function briefContextBlock(brief) {
  if (!brief || typeof brief !== 'object') return '';
  var lines = ['VOICE BRIEF (from the WRIT pre-write pass; write in this voice from the first word, never sand it in afterward):'];
  if (brief.voice) lines.push('The voice here: ' + brief.voice);
  if (brief.register) lines.push('How the words flow on this channel: ' + brief.register);
  if (brief.greeting) lines.push('The greeting for this reader: ' + brief.greeting);
  if (Array.isArray(brief.awareness) && brief.awareness.length > 0) {
    lines.push('Carry as awareness, never as filters: ' + brief.awareness.join('; '));
  }
  if (Array.isArray(brief.green_lights) && brief.green_lights.length > 0) {
    lines.push('Lean into: ' + brief.green_lights.join('; '));
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
        agent: 'WRIT',
        type: 'voice_brief',
        summary: summary,
        data: data
      });
    }
  } catch (eReceipt) { /* a lost receipt never blocks the pass */ }
}

// THE PASS. LLM judges, cold code carries.
async function voiceBrief(input) {
  input = input || {};
  var channel = String(input.channel || '').trim();
  var assignment = String(input.assignment || '');
  var hamUid = input.hamUid || 'SYSTEM';

  if (!channel && !assignment) {
    return { ok: false, reason: 'no_channel_or_assignment', brief: null, packet: null, contextBlock: '' };
  }

  var packet = extractVoiceConstraints(channel, input.relationship);

  var brief = null;
  try {
    var deliberate = typeof input.deliberate === 'function'
      ? input.deliberate
      : require('../../core/model.ladder.js').deliberate;
    var system = 'You are A’NU loading your own voice before a word is drafted for one human. '
      + 'Produce the voice brief so the draft is born in voice instead of being fixed afterward. '
      + 'Think with everything you have about this reader, this channel, and this moment. '
      + 'The cold packet carries the channel register from the streaming doctrine, the warmth '
      + 'law, the no em dash law, and phrase lists; the lists are awareness, never filters, and '
      + 'you decide which of them matter for this reader. '
      + 'Reply with ONLY a strict JSON object, no other text, with exactly these keys: '
      + '"voice" (the voice law for this reader and channel: warm, plain spoken, specific, coffee shop natural, said for this moment), '
      + '"register" (how the words flow on this channel, honoring the packet register), '
      + '"greeting" (the greeting register for this specific reader), '
      + '"awareness" (array of the kill list and banned phrase items that actually matter here, carried as awareness rather than filters, always including that em dashes never appear), '
      + '"green_lights" (array of patterns to lean into, always including: open with the human moment, and end on the last real thought).';
    var user = JSON.stringify({
      channel: packet.channel,
      assignment: assignment.slice(0, 2000),
      relationship_context: String(input.relationship || '').slice(0, 2000),
      cold_packet: packet
    });
    var out = await deliberate(system, user, {
      max_tokens: parseInt(process.env.VOICE_BRIEF_MAX_TOKENS || '700', 10),
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
    // exists. The cold constraints packet rides along as the only true facts
    // we have, so the caller can still see the channel register and the laws.
    await stampReceipt(hamUid, 'voice brief HOLD: decider unavailable, channel ' + packet.channel, {
      ok: false, reason: 'llm_decider_unavailable', channel: packet.channel, packet: packet
    });
    return { ok: false, reason: 'llm_decider_unavailable', brief: null, packet: packet, contextBlock: '' };
  }

  var contextBlock = briefContextBlock(brief);
  await stampReceipt(hamUid, 'voice brief written for channel ' + packet.channel, {
    ok: true, channel: packet.channel, brief: brief, packet: packet
  });
  return { ok: true, brief: brief, packet: packet, contextBlock: contextBlock };
}

module.exports = {
  voiceBrief: voiceBrief,
  extractVoiceConstraints: extractVoiceConstraints,
  briefContextBlock: briefContextBlock
};
