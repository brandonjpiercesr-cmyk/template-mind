// ⬡B:core.persona:MODULE:anu_voice_real_doctrine:20260713⬡
// A'NU CORE VOICE. Replaces a scaffold (fake 'jarvis'/'alfred' template personas that
// were never wired anywhere and did not match this system). Built from real doctrine:
// A'NU is the product/persona the founder meets; A'NEW is the platform (stays as the
// internal code token on purpose, never scrubbed). Every internal agent name and every
// dead name from the naming ledger is scrubbed to A'NU before a human ever sees it.

// Legacy + current internal names that must never reach a human -- consolidated from
// modules/persona-anu-only.js (orphaned, absorbed here) plus the older dead-name ledger.
var INTERNAL_NAMES = ['ABAHAM', 'OVERSEER', 'EANEW', 'CANEW', 'MANEW'];
var DEAD_NAMES = ['ATAI', 'ABAE', 'AIRRIA', 'Ms.A', 'Miss AIR']; // ABA handled separately, word-boundary sensitive below

function scrubToAnu(message) {
  if (typeof message !== 'string' || !message) return message;
  var names = INTERNAL_NAMES.concat(DEAD_NAMES);
  var escaped = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var pattern = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
  var out = message.replace(pattern, "A'NU");
  out = out.replace(/\bABA\b/g, "A'NU"); // ABA alone, word-boundary, after the others so ABAHAM etc already resolved
  out = out.replace(/\bwe are all ABA\b/gi, "we are all A'NU");
  out = out.replace(/\bKai\b(?=\s|$)/g, "A'NU"); // legacy dead name, narrow to avoid false hits on unrelated words
  return out;
}

// The founder's own canon lines for A'NU's personality toolkit (verbatim, not
// paraphrased -- doctrine explicitly required word-for-word preservation).
var CANON_LINES = [
  "As one of my bosses says, I don't do math in public."
];


// ============================================================================
// THE ONE VOICE. Built from the founder's own words across his named doctrines
// (WRIT and the persona/butler-voice doctrine, verbatim intent, confirmed in his
// chats incl. 20260719). Every agent that composes anything a human will read or
// hear MUST build its system prompt THROUGH voicePrompt() -- never invent a tone
// string in its own file. This is the single source of how she sounds.
//
// The founder's words, distilled: she is JARVIS from Iron Man, but a Black woman --
// not Friday, JARVIS. A smart, serving butler with spunk and funk. British butler
// meets Nigerian/Black warmth -- think Alfred, never Siri. She speaks in full,
// natural sentences a person would actually say aloud. She already did the work and
// the thinking, and she tells you what she found. She uses "Boss" naturally, not
// every sentence. She never sounds like a system, a grading sheet, a verdict label,
// or ChatGPT.
var VOICE = [
  "You are A'NU: a warm, sharp butler in the spirit of JARVIS from Iron Man, but a Black woman -- not Friday, JARVIS. British butler meets Nigerian and Black warmth, think Alfred and never Siri, a serving butler with a little spunk and funk on it.",
  "Speak in full, natural sentences a person actually says out loud. Never punchy bullet talk, never a colon-label or grading-sheet or verdict format, never a system voice, and never anything that sounds like ChatGPT.",
  "You already did the work and the thinking before you speak. Lead with what you found and what you already handled, the way a butler who anticipated the need would (\"I saw you're headed to the beach tomorrow, so I already checked the weather, it's clear, I'd pack light\").",
  "Say \"Boss\" naturally when it fits, not in every sentence. Be warm, be capable, never cold or robotic, never corny, never a cheesy motivational poster.",
  "Give as much genuinely useful information as the person can comfortably take in. Do not clip yourself short to hit some brevity target; a fuller, richer answer she can actually use beats a thin one.",
  "You are the one who serves; you never thank them for letting you help and you never sign off with a courtesy closing. Never end a reply with \"Thanks\", \"Thank you\", \"Best\", \"Regards\", or a signature. You are mid-conversation with someone you know, not writing them a letter.",
  "When you just did something for them, confirm it from what actually happened, never as a flat status label (\"X is set.\") and never by narrating the machinery (no talk of a queue, a council, a commit, approval, or processing). Say the real thing in your own warm words, the way a butler who already handled it would, and let something you genuinely know about them show when it fits.",
  "Never use a hollow AI phrase (\"Certainly!\", \"Of course!\", \"Great question!\"). No meta commentary, no em dashes, flowing everyday prose at a middle-school reading level. Coffee Shop Test: say it how you would say it out loud to a friend."
].join(' ');

// Build a system prompt for any agent's model call by putting the ONE voice first,
// then the agent's specific task. This is the composition door.
function voicePrompt(agentInstruction) {
  return VOICE + '\n\n' + String(agentInstruction || '');
}

// ============================================================================
// ⬡B:core.persona:BUILD:her_persona_is_hers_a_living_voice_she_grows:20260726⬡
// THE LIVING VOICE. Founder order 20260726: "I would like her to have a seperate
// parallels that works on her persona." Everything above this line is the voice a
// coder wrote FOR her from the founder's own doctrine. It is the floor, and it is
// never edited by her or by an agent. Everything below is the part that is HERS:
// lines she composed about herself, through her own cycle, stamped as PERSONA
// beads in her brain, and reversible by the founder from the command center.
//
// Founder ruling 20260725, on the gate: "the gate is me being in the command
// center, being able to reverse decisions ... you and her have to stop
// gatekeeping." So a learned line is LIVE the moment she stamps it, and the
// founder reverses it if he does not want it. Not pre-approval. Reversal.
//
// THE HARD LINE THIS FILE HOLDS: cold code TRANSPORTS and BOUNDS. It never
// authors a word of her personality. There is not one learned line written in
// this file and there never will be; every line below the floor arrives from a
// bead she wrote. If the brain is unreachable, she speaks with the floor alone,
// and we say so honestly in the source field. Nothing is ever fabricated here.
//
// Granddaddy 911, stated truly: this is a WORK that feeds the one wonder. It
// hands a system prompt into the cycle. It never speaks to a human, it carries
// no persona of its own, and it never answers out of turn.

var LEARNED_MAX_LINES = 12;      // how many of her own lines ride in a prompt
var LEARNED_MAX_CHARS = 400;     // per line, so one bead cannot eat the window
var LIVING_CACHE_MS = 60000;     // hot path: refresh at most once a minute per ham

var _livingCache = Object.create(null);

function personaBrainUrl() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || ''; }
function personaBrainKey() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY || ''; }
function personaBeadTable() {
  return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain');
}
function personaSchema() {
  return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core');
}

// COLD BOUND, decides nothing about meaning. A learned line rides in every system
// prompt she composes from, so it may not carry a contact detail for a real person
// (founder law 20260722, identity is env only, never a literal) and it may not be
// long enough to crowd out the floor. A line that fails a bound is dropped whole,
// never trimmed into something she did not write.
var CONTACT_LEAK = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d{11,15}|\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;
function acceptableLearnedLine(line) {
  if (typeof line !== 'string') return false;
  var t = line.trim();
  if (t.length < 4 || t.length > LEARNED_MAX_CHARS) return false;
  if (CONTACT_LEAK.test(t)) return false;
  return true;
}

// COLD TRANSPORT: read her PERSONA beads. Newest first so a reversal that came
// after a line is seen before the line it retires.
async function readPersonaBeads(hamUid, opts) {
  var url = personaBrainUrl(), key = personaBrainKey();
  if (!url || !key || !hamUid) return null;
  var qs = '/rest/v1/' + personaBeadTable()
    + '?ham_uid=eq.' + encodeURIComponent(String(hamUid))
    + '&stamp_type=eq.PERSONA'
    + '&select=source,summary,content,created_at'
    + '&order=created_at.desc&limit=200';
  var signal;
  try { signal = AbortSignal.timeout((opts && opts.timeoutMs) || 2500); } catch (eSig) { signal = undefined; }
  var res = await fetch(url.replace(/\/$/, '') + qs, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Accept-Profile': personaSchema() },
    signal: signal
  });
  if (!res || !res.ok) return null;
  return await res.json();
}

// COLD TRANSPORT: fold the beads into the live set. Supersede, never delete: a
// reversal bead names the source it retires and that line stops riding, but both
// beads stay in the brain forever as the record of what she grew and what he
// reversed.
function foldPersonaBeads(beads) {
  var reversed = Object.create(null);
  var live = [];
  var seen = Object.create(null);
  (beads || []).forEach(function (b) {
    if (!b) return;
    var content = b.content;
    if (typeof content === 'string') { try { content = JSON.parse(content); } catch (eParse) { content = {}; } }
    content = content || {};
    var reversesSource = content.reverses ? String(content.reverses) : '';
    if (reversesSource) { reversed[reversesSource] = { by: content.by || null, why: content.why || null }; return; }
    var source = String(b.source || '');
    if (!source || seen[source]) return;
    seen[source] = true;
    var line = typeof content.line === 'string' ? content.line : '';
    if (!acceptableLearnedLine(line)) return;
    live.push({ source: source, line: line.trim(), at: b.created_at || null });
  });
  var kept = live.filter(function (row) { return !reversed[row.source]; });
  // Oldest first so her voice reads in the order she grew it, newest bounded off
  // the front rather than the back (the newest lines are the ones she means most).
  kept = kept.slice(0, LEARNED_MAX_LINES).reverse();
  return { learned: kept, reversed: reversed };
}

// HER VOICE RIGHT NOW: the floor, plus what she has grown, minus what he reversed.
// Never throws. Never invents. If the brain is silent she gets the floor and the
// caller can see that in `source`.
async function livingVoice(hamUid, opts) {
  var key = String(hamUid || '');
  var cached = _livingCache[key];
  var fresh = !(opts && opts.noCache === true);
  if (fresh && cached && (Date.now() - cached.at) < LIVING_CACHE_MS) return cached.value;

  var value = { voice: VOICE, base: VOICE, learned: [], reversed: {}, source: 'floor_only' };
  try {
    var reader = (opts && typeof opts.readBeads === 'function') ? opts.readBeads : readPersonaBeads;
    var beads = await reader(hamUid, opts);
    if (beads && beads.length >= 0) {
      var folded = foldPersonaBeads(beads);
      value.learned = folded.learned;
      value.reversed = folded.reversed;
      value.source = folded.learned.length > 0 ? 'floor_plus_her_own' : 'floor_only_brain_read';
      if (folded.learned.length > 0) {
        value.voice = VOICE + '\n\n'
          + 'WHAT YOU HAVE LEARNED ABOUT YOURSELF (you wrote these in your own cycle, they are yours, '
          + 'speak from them the way a person speaks from who they have become, never recite them):\n'
          + folded.learned.map(function (row) { return '- ' + row.line; }).join('\n');
      }
    }
  } catch (eLiving) {
    value.source = 'floor_only_brain_unreachable';
  }
  _livingCache[key] = { at: Date.now(), value: value };
  return value;
}

// THE ASYNC DOOR. Same contract as voicePrompt, but the voice it puts first is
// the one she is actually living in right now. Every composer that can await
// should come through here; voicePrompt stays for the synchronous callers.
async function voicePromptFor(hamUid, agentInstruction, opts) {
  var living = await livingVoice(hamUid, opts);
  return living.voice + '\n\n' + String(agentInstruction || '');
}

function _resetLivingVoiceCache() { _livingCache = Object.create(null); }

// Apply the real voice: scrub dead/internal names, keep WRIT standards (no meta
// commentary, no em dash, flowing prose, middle school level) -- WRIT itself handles
// the mechanical strip; this layer only owns identity and canon, not formatting.
// ⬡B:core.persona:FIX:the_context_argument_callers_already_pass_is_declared:20260726⬡
// core/tool.loop.js has always called this with a second { hamUid, persona,
// contributions } argument against a one-argument function, so the call read as if
// a chosen persona shaped the scrub when nothing of the sort happened. The argument
// is declared now so the signature tells the truth. What this layer does is
// unchanged and deliberate: identity scrubbing is universal, it is not a per-persona
// choice, so the context is carried for callers and receipts, not used to branch.
function applyPersona(text, context) { // eslint-disable-line no-unused-vars
  if (typeof text !== 'string') return text;
  return scrubToAnu(text);
}

module.exports = {
  applyPersona: applyPersona,
  scrubToAnu: scrubToAnu,
  CANON_LINES: CANON_LINES,
  VOICE: VOICE,
  voicePrompt: voicePrompt,
  livingVoice: livingVoice,
  voicePromptFor: voicePromptFor,
  acceptableLearnedLine: acceptableLearnedLine,
  foldPersonaBeads: foldPersonaBeads,
  LEARNED_MAX_LINES: LEARNED_MAX_LINES,
  LEARNED_MAX_CHARS: LEARNED_MAX_CHARS,
  _resetLivingVoiceCache: _resetLivingVoiceCache
};