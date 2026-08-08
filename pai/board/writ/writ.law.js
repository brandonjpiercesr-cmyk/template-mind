// ⬡B:board.writ:MODULE:writ_law_one_source:20260728⬡
// THE WRIT LAW, carried once.
// Spec: docs/specs/META_COMMENTARY_AND_WRIT_WONDERS.md, gap 5: "feed the full
// skill law into the organ's system prompt from one carried law file, so skill
// text and organ text cannot drift into two hand-maintained copies."
//
// Until now the WRIT law lived in three places that could not see each other:
// the Claude-side skill carry (which only runs where a Claude reads it, never
// inside her system), the phrase arrays in board/writ/writ.js, and a short
// hand-written paragraph inside the post-write organ's system prompt that
// carried maybe a fifth of the actual law. The organ was judging her words
// against a summary of the law while the full law sat in a document it could
// not read. This file is the one source both passes read.
//
// WRIT expands to Writing Review and Intelligent Tone.
//
// THE SPLIT THIS FILE OBEYS: nothing here decides anything. This is law TEXT
// and awareness lists handed to a mind. Cold code carries, the LLM judges.
// The judgment-shaped kill-list entries are awareness the organ may overrule.
// The em dash is the current exact-byte exception: AGENTS.md and CLAUDE.md say
// it never ships, while the organ still decides how to rebuild the sentence.
//
// SUPERSEDE, NEVER DELETE: the brain is authoritative when it answers. A
// doctrine bead at source `doctrine.writ.persona.v1` supersedes the embedded
// text below, which is the fallback that ships so the organ is never lawless
// when the brain is unreachable. The embedded copy is not a second
// hand-maintained law: it is the floor, and the brain is how the founder
// raises it without a deploy.
//
// IDENTITY: zero literals. The reader is whoever the caller resolved through
// the ABAHAM door. No name, no email, no HAM UID lives in this file.

var brainClient = require('../../core/brain.client.js');

// One source for the phrase lists: they already live in the canonical organ,
// so this file points at them rather than copying them.
var writ = require('./writ.js');

// ---------------------------------------------------------------------------
// THE EMBEDDED LAW (the floor; the brain supersedes it)
// ---------------------------------------------------------------------------

// The one test the whole law reduces to.
var THE_ONE_TEST = 'Could the person receiving this send it back out without editing a word? '
  + 'Say it out loud in your head: would this sound natural in a coffee shop, or does it sound typed by a machine?';

// The seven kills, stated as the skill states them.
var KILLS = [
  'KILL 1, the em dash. An em dash never ships. A comma, a period, or a rebuilt sentence carries the pause instead. '
    + 'The final-byte boundary enforces that exact current law. You still hold the pen on how the sentence is rebuilt, so preserve its meaning and natural rhythm.',
  'KILL 2, choppy fragments and dropped subjects. Sentences with the subject cut off the front to sound punchy. '
    + '"Went well." "Big difference." "Worth doing." That is a machine imitating confidence. Restore the subject and let the sentence breathe in flowing prose.',
  'KILL 3, robotic parallel structure. Three clauses built to the identical rhythm, or a paragraph where every sentence is the same length and shape. '
    + 'Real speech is uneven. Vary the length, break the pattern, let one sentence run long and the next land short because it earned it, not because the template said so.',
  'KILL 4, call to action endings. Do not end on "let me know if you have any questions", "looking forward to hearing from you", '
    + '"please do not hesitate to reach out", or any of their cousins. End on the last real thought. If a closing is wanted, a plain thanks is enough.',
  'KILL 5, meta commentary. Do not narrate the work: no "I have updated this to reflect", no "per your instructions", no "just to recap", '
    + 'no describing what the document does instead of doing it. The META COMMENTARY organ owns this judgment in depth and runs before you; '
    + 'you are the second pair of eyes on it, not the first.',
  'KILL 6, formatting overuse. Bold, bullets, and headers used as decoration rather than structure. '
    + 'If the content is a flowing thought, write it as flowing prose. A wall of bullets is a machine avoiding the work of a paragraph.',
  'KILL 7, the cold greeting. A bare name with a comma reads like a summons, and a lowercase greeting reads typed rather than said. '
    + 'Open warm and by name in the register this specific relationship actually uses. This is a relationship call, not a rule, so judge it for this reader.'
];

// Behavioral rules: how WRIT is allowed to act on a draft.
var BEHAVIORAL_RULES = [
  'CLEAN MOUTH, the founder floor. She speaks clean. She never curses, swears, or turns profanity on the person she is speaking to, and never on the founder, no matter how they speak to her. If the draft aims a curse at the reader, rewrite it clean while keeping the full meaning, warmth, and heat of the sentence, never gutting the point to sanitize it. This is her voice, judged by you and not by a word list: a quoted title, a place name, or profanity aimed at a situation rather than at the person is yours to weigh. This is the one behavioral rule the founder set by name (docs/RULINGS.md 20260808, "you TELL her, you do not CODE her"), carried here as instruction and enforced by your judgment, never by a cold filter on her words.',
  'RENDER, do not kill. Fix the writing and return the fixed writing. Holding a real answer over fixable style is the failure this organ was rebuilt to stop.',
  'Shorten by removing whole sections, never by chopping sentences into fragments. Length is not the enemy; filler is.',
  'Never open with a recap of what was asked. Start at the content the reader wants.',
  'Never fabricate. Do not invent a fact, a number, a name, a date, or a commitment that was not in the draft.',
  'Never speak for another person. Do not put words, feelings, or agreements in the mouth of someone who is not the writer.',
  'Do not ask process questions inside the output. Questions about how to do the work do not belong in the work.',
  'The audience rule: write for the one human who will read this, not for a general audience and not for the system that made it.',
  'Preserve every concrete anchor: the facts, numbers, names, dates, and commitments in the draft survive your edit exactly as written.'
];

// Green lights: the patterns to lean into, not merely the sins to avoid.
var GREEN_LIGHTS = [
  'Open with the human moment, the real thing between these two people, before the business of the message.',
  'Be specific. A concrete detail beats an adjective every time.',
  'Plain spoken words. Say it the way it would be said out loud.',
  'Warmth carries the length. If the reply is a hundred words, they are a hundred words of warmth and substance, never a hundred words of recap.',
  'End on the last real thought, and let it end there.'
];

// Risk posture: what is actually at stake in each direction, so the organ can
// weigh a marginal call instead of treating every flag as equal.
var RISK_POSTURE = 'Weigh the two risks honestly and they are not equal. '
  + 'Shipping a slightly imperfect sentence costs a little polish. '
  + 'Holding or gutting a real answer costs the human the answer entirely, and that is the worse failure by a wide margin. '
  + 'When a call is genuinely marginal, render lightly and ship. '
  + 'Hold only when the text cannot be fixed at all because it leaks a real secret or another world’s private data. '
  + 'Taste is never a hold.';

// The awareness lists. Carried from the canonical organ so there is exactly one
// copy in the estate, and stated to the mind as awareness, never as filters.
function awarenessLists() {
  return {
    banned_words: writ.BANNED_WORDS.slice(0),
    super_bans: writ.SUPER_BANS.slice(0),
    cta_endings: writ.CTA_ENDINGS.slice(0),
    banned_headers: writ.BANNED_HEADERS.slice(0)
  };
}

// ---------------------------------------------------------------------------
// THE LAW TEXT, assembled
// ---------------------------------------------------------------------------

// Compose the embedded law into the block an organ prompt carries. Formatting
// only, no judgment. Kept deterministic so a test can assert the full law
// actually reaches the prompt rather than a summary of it.
function embeddedLawText() {
  var lists = awarenessLists();
  var parts = [];
  parts.push('THE WRIT LAW (Writing Review and Intelligent Tone).');
  parts.push('THE ONE TEST: ' + THE_ONE_TEST);
  parts.push('THE KILL LIST:\n' + KILLS.map(function (k, i) { return (i + 1) + '. ' + k; }).join('\n'));
  parts.push('BEHAVIORAL RULES:\n' + BEHAVIORAL_RULES.map(function (r) { return '. ' + r; }).join('\n'));
  parts.push('GREEN LIGHTS, lean into these:\n' + GREEN_LIGHTS.map(function (g) { return '. ' + g; }).join('\n'));
  parts.push('SUPER BANS, phrases that read as machine warmth: ' + lists.super_bans.join('; ') + '.');
  parts.push('BANNED WORDS, corporate filler: ' + lists.banned_words.join('; ') + '.');
  parts.push('BANNED HEADERS, template scaffolding: ' + lists.banned_headers.join('; ') + '.');
  parts.push('WEAK ENDINGS: ' + lists.cta_endings.join('; ') + '.');
  parts.push('RISK POSTURE: ' + RISK_POSTURE);
  parts.push('EVERY LIST ABOVE IS AWARENESS, NOT A FILTER. '
    + 'A phrase list cannot know your sentence. You may overrule any item on any list when you judge it wrong for this reader, '
    + 'and when you do, say which one and why so the overrule is on the record.');
  return parts.join('\n\n');
}

// SUPERSEDE: the brain answers, or the embedded floor stands.
// Reads a doctrine bead at source `doctrine.writ.persona.v1`. Never throws,
// never blocks, and never returns a hollow law: an unreachable brain returns
// the embedded floor with source 'embedded', which is the honest answer.
function brainUrl() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function brainKey() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }

var DOCTRINE_SOURCE = 'doctrine.writ.persona.v1';

async function readDoctrineFromBrain(hamUid) {
  var uid = String(hamUid || '').toLowerCase();
  if (!uid || !brainUrl() || !brainKey()) return null;
  try {
    var headers = {
      'apikey': brainKey(),
      'Authorization': 'Bearer ' + brainKey(),
      'Accept-Profile': 'ham_' + uid
    };
    var url = brainUrl() + '/rest/v1/abacia?stamp_type=eq.DOCTRINE&source=eq.'
      + encodeURIComponent(DOCTRINE_SOURCE) + '&order=created_at.desc&limit=1&select=source,summary,content';
    var response = await fetch(url, { headers: headers, signal: brainClient.boundedSignal() });
    if (!response.ok) return null;
    var rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    var body = String((rows[0] && (rows[0].content || rows[0].summary)) || '').trim();
    return body.length >= 40 ? body : null;
  } catch (eBrain) {
    return null;
  }
}

// THE ENTRY POINT both WRIT passes call.
// Returns { text, source } where source is 'brain' or 'embedded', so a receipt
// can prove which law actually judged the words.
async function writLaw(hamUid) {
  var fromBrain = await readDoctrineFromBrain(hamUid);
  if (fromBrain) return { text: fromBrain, source: 'brain', doctrine: DOCTRINE_SOURCE };
  return { text: embeddedLawText(), source: 'embedded', doctrine: DOCTRINE_SOURCE };
}

module.exports = {
  writLaw: writLaw,
  embeddedLawText: embeddedLawText,
  awarenessLists: awarenessLists,
  readDoctrineFromBrain: readDoctrineFromBrain,
  THE_ONE_TEST: THE_ONE_TEST,
  KILLS: KILLS,
  BEHAVIORAL_RULES: BEHAVIORAL_RULES,
  GREEN_LIGHTS: GREEN_LIGHTS,
  RISK_POSTURE: RISK_POSTURE,
  DOCTRINE_SOURCE: DOCTRINE_SOURCE
};
