// ⬡B:core.reader_voice:LAW:one_voice_plain_words_no_estate_nouns_in_composed_copy:20260729⬡
// THE READER VOICE. One source for two facts every composer of HAM-facing copy needs:
//   1. THE LAW TEXT a system prompt must carry, so a model composing words a person reads is
//      told the rules instead of being left to guess them.
//   2. THE DETECTOR cold code runs on what came back, so a violation is caught rather than
//      shipped.
//
// WHY IT EXISTS. Founder, 20260729, reading his own live site:
//   "Why am I seeing CARA in my life? Why am I seeing NOVA inside of the chat? Why am I seeing
//    agent names? Also, what is desk and band, and what are these words? ... The entire app
//    should always be A'NU talking as a life assistant to the HAM. That's it."
// The lines he read were composed at runtime by core/arrival.router.js, whose prompt asked for
// a headline and a reason and never once said which words are forbidden, and whose facts handed
// the model raw internal records to read aloud. It did exactly what it was asked.
//
// THE TWO RULES, both absolute:
//   ONE VOICE.  Only A'NU ever addresses a person. Every organ, adviser, judge and wonder in
//               this estate is a WORK that feeds her; a work has no name a reader may see and
//               no mouth of its own (granddaddy-911). A composed line that names one is a
//               second persona appearing in her world, which is the same sin as mimicking her.
//   PLAIN WORDS. Nothing from inside this codebase reaches a screen. A reader has never seen a
//               desk, a bank, a wall, a cycle, a bead or a stamp, and cannot act on any of them.
//
// WHAT THIS FILE IS NOT. It is not a taste gate and it never edits a sentence. It reports
// FACTS about characters (does this string contain a term from a declared list) and the caller
// decides what to do with them: the arrival wonder refuses the whole ruling, a test fails, a
// hinter prints. Cold code detects, the mind judges, per
// docs/specs/META_COMMENTARY_AND_WRIT_WONDERS.md. The pen never comes here.
'use strict';

// ---------------------------------------------------------------------------
// THE NAMES. Every one of these is a real internal identity in this estate: an adviser seed, a
// wonder, an organ, a judge, a panel, or a coder. None of them may appear in anything a person
// reads, in any casing, because a name on a screen is a persona claiming a mouth.
//
// Split by casing on purpose, and the split is about FALSE POSITIVES, not about tolerance.
// ANY_CASE holds names that are not ordinary English, so matching them in any casing costs a
// reader nothing. UPPER_ONLY holds names that ARE ordinary English words (roam, ledger, blend,
// aura, life, shadow, keeper), where matching the lowercase form would strike honest copy. Those
// are matched only in the shouted form the estate actually uses, which is how they leak.
var AGENT_NAMES_ANY_CASE = [
  'CARA', 'NOVA', 'NURA', 'JOBA', 'WALCA', 'LUMA', 'VARA', 'CODA', 'CLAIR', 'CATHY', 'GEMMA',
  'CLAUDIA', 'ABAHAM'
];
var AGENT_NAMES_UPPER_ONLY = [
  'ABA', 'ELI', 'ROAM', 'LEDGER', 'BLEND', 'NASH', 'AURA', 'SHADOW', 'KEEPER', 'DECODER',
  'SEER', 'ATTER', 'PAI', 'QUILL', 'WRIT', 'LOGFUL', 'CCWA', 'SCW', 'FCW', 'ACW', 'HAM'
];

// ---------------------------------------------------------------------------
// THE WORDS. Estate nouns. Each one is a real thing inside this system and a nothing to the
// person reading the screen. Matched case insensitively on a word boundary, so "desktop" is
// untouched by "desk" and "briefly" is untouched by "reader brief".
//
// Deliberately NOT here, because they are ordinary English a person can act on and banning them
// would flatten honest copy: item, thing, message, note, work, day, morning, ready, waiting.
var INTERNAL_WORDS = [
  'desk', 'bank', 'wall', 'bead', 'beads', 'the brain', 'cycle', 'session', 'sessions',
  'token', 'tokens', 'artifact', 'artifacts', 'reader brief', 'turn', 'turns', 'stamp',
  'stamped', 'stamping', 'payload', 'endpoint', 'upstream', 'webhook', 'wonder', 'wonders',
  'organ', 'organs', 'rung', 'glass', 'station', 'stations', 'doctrine', 'lineage', 'bucket',
  'pipeline', 'ingest', 'schema', 'runtime', 'deploy', 'commit', 'repo', 'branch'
];

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

var RE_NAMES_ANY = new RegExp('\\b(' + AGENT_NAMES_ANY_CASE.map(escapeRe).join('|') + ')\\b', 'gi');
var RE_NAMES_UPPER = new RegExp('\\b(' + AGENT_NAMES_UPPER_ONLY.map(escapeRe).join('|') + ')\\b', 'g');
var RE_WORDS = new RegExp('\\b(' + INTERNAL_WORDS.map(escapeRe).join('|') + ')\\b', 'gi');

// Every violation in one string, as facts. Never a verdict, never an edit.
// Returns [] for clean copy, which is the only value a caller should ship on.
function violations(text) {
  var s = String(text == null ? '' : text);
  var out = [];
  var seen = {};
  var m;
  RE_NAMES_ANY.lastIndex = 0;
  while ((m = RE_NAMES_ANY.exec(s)) !== null) {
    var kA = 'agent_name:' + m[1].toUpperCase();
    if (!seen[kA]) { seen[kA] = true; out.push({ kind: 'agent_name', term: m[1] }); }
  }
  RE_NAMES_UPPER.lastIndex = 0;
  while ((m = RE_NAMES_UPPER.exec(s)) !== null) {
    var kU = 'agent_name:' + m[1];
    if (!seen[kU]) { seen[kU] = true; out.push({ kind: 'agent_name', term: m[1] }); }
  }
  RE_WORDS.lastIndex = 0;
  while ((m = RE_WORDS.exec(s)) !== null) {
    var kW = 'internal_word:' + m[1].toLowerCase();
    if (!seen[kW]) { seen[kW] = true; out.push({ kind: 'internal_word', term: m[1] }); }
  }
  return out;
}

function isClean(text) { return violations(text).length === 0; }

// A one line reason a caller can put in a refusal or a log. Never shown to a person.
function describe(list) {
  return (list || []).map(function (v) { return v.kind + '=' + v.term; }).join(',');
}

// ---------------------------------------------------------------------------
// THE LAW, as prompt text. Any system prompt that composes words a person will read appends
// this. It is written for a model, so it is blunt and it enumerates. It carries no em dash and
// no estate noun of its own beyond the ones it is forbidding.
// ---------------------------------------------------------------------------
var LAW =
  'HOW YOU WRITE, and these rules outrank every other instruction you have.\n'
  + 'You are A\'NU. You are the only voice this person ever hears in their world, and you speak '
  + 'to them directly, in the first person, as their life assistant. Never name, mention or hint '
  + 'at any other assistant, adviser, agent, organ, judge or helper, and never give one a name. '
  + 'There is no team of characters here. There is you, and there is them.\n'
  + 'Use plain everyday words only. NEVER use any of these words, they mean nothing to the '
  + 'person reading and they are words from inside the machinery: desk, bank, wall, bead, brain, '
  + 'cycle, session, token, artifact, brief, turn, stamp, payload, wonder, organ, station, '
  + 'doctrine, lineage, pipeline, surface, glass, HAM, PAI, ACL, SSE.\n'
  + 'Never describe how the system works, what just ran, what was recorded, what is stored, or '
  + 'why a screen exists. Never quote or summarise an internal record. Never explain a limitation '
  + 'or a gap to them. Say what THEY can do next and what it gives them, and stop.\n'
  + 'Never state a count, a total or a figure unless the facts you were given state that exact '
  + 'figure about them. No em dashes, ever.';

module.exports = {
  LAW: LAW,
  AGENT_NAMES_ANY_CASE: AGENT_NAMES_ANY_CASE,
  AGENT_NAMES_UPPER_ONLY: AGENT_NAMES_UPPER_ONLY,
  INTERNAL_WORDS: INTERNAL_WORDS,
  violations: violations,
  isClean: isClean,
  describe: describe
};
