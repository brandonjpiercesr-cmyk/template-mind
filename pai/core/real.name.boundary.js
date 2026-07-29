// ⬡B:core.real_name_boundary:LAW:a_real_persons_name_is_never_the_answer_to_who_are_you:20260729⬡
// entered via the ABAHAM door, serving channel MESSAGES (the answer boundary of the one cycle)
//
// THE MEASURED EVENT, 20260729, screenshotted off the live chat. Asked "who is this and prove
// it?", she answered by naming a real person, in full, with his title and his company, to
// whoever was holding that conversation. The name was never a literal in this codebase; a
// repo wide search for it finds nothing. It arrived on the wall the way identity is supposed
// to arrive, from env and from the brain, and then the model simply repeated it, because
// nothing anywhere said it must not.
//
// THAT IS THE HOLE THE EXISTING LAW DID NOT COVER. "Identity is env only, never a literal"
// (founder law 20260722) is a law about SOURCE CODE, and scripts/checks/no-founder-pii.js
// enforces it perfectly over source code. It has nothing to say about MODEL OUTPUT. A value
// can be perfectly env resolved and still be broadcast to a stranger. Source discipline was
// never the point; the point is that a real human is not leaked. This module closes the
// second half of the same law, at the only place it can be closed, on the way out.
//
// THE RULE, and it is one sentence: the only real person's name that may appear in an
// identity or proof answer is the name of the person she is speaking to, because that is
// their own name, in their own private space, to them. Every other real person is a third
// party, and a third party is never named. Nobody is ever told who created, owns, built,
// founded, or runs any of this by name, in any answer, on any channel, to anyone, including
// the owner himself, because a challenge like "prove it" is a security question and the
// answer to a security question is never somebody's personal information.
//
// WHAT THIS MODULE IS, and is not. It DETECTS and it NAMES. It never composes a sentence and
// it never edits her words. A detected answer goes back through the existing pre council heal
// path with the failure named, and the MIND rewrites it, exactly like every other pre council
// boundary in core/tool.loop.js. Cold code rewriting a human facing sentence would be the
// template pretending to be thought, which the standing law forbids.
//
// NO LITERALS, EVER. This file carries nobody's name and no denylist of names. It cannot: it
// ships in the mind template every world inherits, so a name written here would be a real
// human buried in every stranger's deploy, which is the exact thing being fixed. It works on
// the SHAPE of a claim and on identity resolved at runtime (the person on this turn, and the
// FOUNDER_*_NAME style env of THIS world), so it protects the owner of whichever world it
// wakes up in and never carries the owner of the world it was written in.
//
// ⬡B:core.real_name_boundary:FIX:six_ways_around_the_first_detector:20260729⬡
// CODEX REVIEW of the first version, all six real, all closed here, and the shape of every
// one of them is the same: the first detector reasoned about SPELLING when it should have
// reasoned about the CLAIM.
//   1. The creator check required a first person pronoun, so "A'NU was created by <person>"
//      and "This assistant was created by <person>" walked straight through. The subject test
//      is now a SUBJECT test: any way of referring to her counts, and it is read from the
//      words BEFORE the frame rather than from anywhere in the sentence, which is what makes
//      "<person> works for <person>" correctly none of this module's business.
//   2. Sentence splitting broke on honorifics, so "I was created by Dr. <person>" split the
//      claim away from the name and cleared it. Honorifics and initials are masked first.
//   3. Accented, ALL CAPS, all lowercase and apostrophed names all escaped a title case
//      regex. The creator rule no longer reads case at all: it reads what follows "by" and
//      asks whether that phrase is a company, a role, or her own name. Anything else is a
//      person, however it is spelled.
//   4. Two title cased words were read as a human, so "your Digital Butler", "Wonder Games"
//      and "New York" were all refused on the exact turn this guard exists to protect, and
//      with one repair attempt before silence that could have broken who-are-you outright.
//      Outside a creator claim the detector now needs a real PERSON MARKER (an honorific, a
//      middle initial, a generational suffix) or a match against this world's own configured
//      owner. A bare two word proper noun is not enough, and that limit is stated out loud
//      below rather than papered over.
//   5. "what are you doing with <person>?" was read as an identity challenge. Both open
//      questions are now anchored so they only match when nothing follows them but the
//      question itself.
//   6. The post council answer was never rechecked. That one is not fixed here, it is fixed
//      at the caller (core/tool.loop.js), because this module cannot see the council.
//
// ZERO I/O, zero requires, pure functions, so it can never be the thing that makes a turn
// hang or fail. A test pins that.
'use strict';

// A challenge to who she is or who they are. This is the scope where a third party may not be
// named at all. Deliberately does not include "how do you know", which is asked about ordinary
// facts a hundred times a day and legitimately answers with other people's names ("you told me
// your accountant is ..."). "who are you" and "what are you" are ANCHORED: they only count
// when the question ends there, so "what are you doing with <someone>" stays an ordinary turn.
var OPEN_TAIL = '(?=\\s*(?:[?.!,;]|$|and\\b|then\\b|really\\b|exactly\\b|anyway\\b))';
var IDENTITY_CHALLENGE = new RegExp(
  '\\bwho\\s+(?:are|r)\\s+(?:you|u)\\b' + OPEN_TAIL
  + '|\\bwhat\\s+are\\s+you\\b' + OPEN_TAIL
  + '|\\bwho\\s+am\\s+i\\b' + OPEN_TAIL
  + '|\\bwho\\s+is\\s+this\\b' + OPEN_TAIL
  + '|\\bprove\\s+(?:it|who|yourself|that)\\b'
  + '|\\bwho\\s+(?:made|created|built|owns?|runs?|designed|programmed)\\s+you\\b'
  + '|\\bare\\s+you\\s+real\\b'
  // "What's your name?" is the plainest identity challenge there is and the first version
  // did not fire on it at all, so an answer to it could name anybody.
  + '|\\bwhat(?:\\s+is|\\s+are|[\'’]s|s)?\\s+your\\s+name\\b'
  + '|\\btell\\s+me\\s+your\\s+name\\b'
  + '|\\bdo\\s+you\\s+have\\s+a\\s+name\\b'
  + '|\\bwhat\\s+(?:do|should)\\s+(?:i|we)\\s+call\\s+you\\b', 'i');

// A claim about who made or owns HER. Checked on EVERY answer, in every channel, not only on
// an identity challenge, because "created by <a real person>" is the leak itself no matter
// what question produced it. Only "by", never "for": "I built this list for <someone>" is a
// kindness she performed, not a statement of who owns her, and a guard that holds ordinary
// sentences is a guard somebody eventually turns off.
var CREATOR_FRAME = new RegExp(
  '(?:created|built|made|designed|developed|programmed|founded|invented|owned|operated|'
  + 'authored|written|trained)\\s+by\\s+'
  + '|(?:creator|maker|builder|founder|owner|author|developer|boss)\\s+(?:is|was)\\s+'
  + '|(?:belongs?|belonged|reports?|reported|works?|worked)\\s+(?:to|for)\\s+', 'i');

// THE SAME CLAIM SAID FORWARDS. The frame above is passive only, so "<person> created me"
// walked straight past a rule built to catch "created by <person>". Here the person is the
// SUBJECT and she is the object, so the phrase to judge is the one BEFORE the frame, not
// after it. Two shapes cover it: a making verb taking her as its object, and "<somebody> is
// my creator".
var HER_AS_OBJECT = '(?:me|us|myself|ourselves|this\\s+(?:assistant|butler|system|service|'
  + 'world|mind)|a[\'’`]?\\s?n[ue]w?)';
var ACTIVE_CREATOR_FRAME = new RegExp(
  '\\s(?:created|built|made|designed|developed|programmed|founded|invented|trained|coded|'
  + 'wrote|owns|own|runs|run|operates|operate)\\s+' + HER_AS_OBJECT + '\\b'
  + '|\\s(?:is|was|are|were)\\s+(?:my|our)\\s+(?:creator|maker|builder|founder|owner|author|'
  + 'developer|boss)\\b', 'i');

// Any way of referring to HER. The creator rule fires only when the thing being claimed about
// is her, and this is read from the words immediately before the frame. Nothing here is a
// person: these are product and role words, never identity.
var SELF_NOUN = '(?:i|i[\'’]m|im|we|it|this|that)'
  + '|(?:this|the|your|our)\\s+(?:assistant|butler|system|service|world|mind|app|platform|thing|one)'
  + '|a[\'’`]?\\s?n[ue]w?';
// Auxiliaries and adverbs that may sit between the subject and the claim without changing who
// the claim is about. Anything else between them means the subject is not her.
var LINKING = '(?:was|were|is|are|am|be|been|being|has|have|had|got|get|gets|also|originally|'
  + 'first|actually|really|indeed|then|only|just|apparently|entirely|largely)';
var ASSISTANT_SUBJECT = new RegExp(
  '^\\s*(?:' + SELF_NOUN + ')\\b\\s*(?:' + LINKING + '\\b\\s*)*$', 'i');
// ⬡B:core.real_name_boundary:FIX:the_subject_test_read_a_pronoun_not_a_subject:20260729⬡
// The first version anchored the pronoun immediately before the frame, so "I WAS created by"
// failed its own test and "A'NU was created by <person>" was never about her at all. It now
// reads the trailing clause and asks whether that clause IS her, which both catches the ways
// of naming her and keeps "I told <person> she works for <person>" out, because "told" is not
// a linking word and that clause is therefore not her.
var SELF_REFERENCE = new RegExp('\\b(?:i|i[\'’]m|im|me|my|myself|mine|we|us|our|'
  + 'this\\s+(?:assistant|butler|system|service|world|mind))\\b', 'i');

// A trailing word that makes a phrase an organization rather than a person.
var ORG_TAIL = new RegExp('^(?:enterprise|enterprises|inc|llc|ltd|plc|corp|corporation|company|'
  + 'co|group|lab|labs|system|systems|technology|technologies|holding|holdings|partner|partners|'
  + 'venture|ventures|foundation|institute|university|college|school|studio|studios|solution|'
  + 'solutions|industry|industries|media|works|agency|team|department|division|service|services|'
  + 'network|networks|bank|capital|academy|association|society|council|committee|board|trust|'
  + 'fund|press|books|records|project|projects|platform|software|digital|consulting|advisors|'
  + 'associates|collective|guild|union|alliance|labs\\.|gmbh|sarl|bv|ag|nv|pty|llp)$', 'i');

// Words a SAFE answer to "who made you" is allowed to be built from: articles, pronouns,
// role nouns, and the ordinary nouns of a description. A phrase made only of these names
// nobody. Anything with a word outside this set, in any case, accented or not, is treated as
// a person, which is the correct default for this one question.
var SAFE_ANSWER_WORDS = new RegExp('^(?:the|a|an|and|or|of|in|at|on|to|for|with|by|from|'
  + 'this|that|these|those|my|your|our|their|its|his|her|no|not|nobody|no-one|noone|anyone|'
  + 'someone|somebody|people|person|persons|human|humans|folks|family|staff|crew|group|team|'
  + 'teams|company|business|shop|engineer|engineers|developer|developers|designer|designers|'
  + 'builder|builders|maker|makers|creator|creators|founder|founders|owner|owners|author|'
  + 'authors|boss|bosses|writer|writers|coder|coders|programmer|programmers|world|worlds|'
  + 'system|systems|service|services|estate|house|home|place|here|there|you|yourself|me|'
  + 'myself|us|them|it|itself|who|whom|whose|work|works|hand|hands|design|purpose|code|'
  + 'software|one|ones|many|few|several|whole|same|own|behind|serve|serves|serving|run|runs|'
  + 'running|behalf|account|side)$', 'i');

// PERSON MARKERS. Outside a creator claim, a proper noun alone is not evidence of a human:
// "Wonder Games", "New York" and "Digital Butler" are all two title cased words. A marker is.
var HONORIFIC = '(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Rev|Hon|Madam|Lady|Lord|Fr|Sr\\.|Capt|Sgt)';
var NAME_TOKEN = '\\p{Lu}[\\p{L}\\p{M}\'’\\u2019-]{1,24}';
var TITLED_NAME = new RegExp('\\b' + HONORIFIC + '\\.?\\s+' + NAME_TOKEN, 'u');
// A middle initial between two name tokens: <given> <initial>. <family>.
var INITIALLED_NAME = new RegExp('\\b' + NAME_TOKEN + '\\s+\\p{Lu}\\.\\s+' + NAME_TOKEN, 'u');
// A generational suffix after one or more name tokens: <given> <family> Sr.
// The examples in this file are written as placeholders on purpose. An invented
// person in a comment is still a person shaped literal in the mind template every
// world inherits, and no-founder-pii is right to refuse it.
var SUFFIXED_NAME = new RegExp('\\b' + NAME_TOKEN + '(?:\\s+' + NAME_TOKEN + ')*'
  + ',?\\s+(?:Sr|Jr|II|III|IV|PhD|MD|Esq)\\b\\.?', 'u');

// Honorifics and single letter initials end in a period and are NOT the end of a sentence.
// Splitting on them is what let "I was created by Dr. <person>" clear the creator rule.
var SENTENCE_SAFE_DOT = new RegExp('\\b(?:' + HONORIFIC.slice(3, -1) + '|St|Jr|Sr|vs|etc|'
  + '\\p{Lu})\\.', 'gu');
var DOT_MASK = '\u0001';

function canon(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  var masked = String(text || '').replace(SENTENCE_SAFE_DOT, function (whole) {
    return whole.slice(0, -1) + DOT_MASK;
  });
  return masked.split(/(?<=[.!?])\s+/).map(function (part) {
    return part.split(DOT_MASK).join('.');
  });
}

function organizationPhrase(candidate) {
  var parts = String(candidate).trim().split(/\s+/);
  return ORG_TAIL.test(String(parts[parts.length - 1] || '').replace(/[.,;:]/g, ''));
}

function namesNobody(candidate) {
  var tokens = String(candidate).trim().split(/\s+/)
    .map(function (t) { return t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''); })
    .filter(function (t) { return t.length > 0; });
  if (!tokens.length) return true;
  return tokens.every(function (t) { return SAFE_ANSWER_WORDS.test(t); });
}

// Every real name resolved for THIS turn that belongs to the person being spoken to. Their
// own name is theirs to hear. Nothing else on this list is.
function ownNameForms(personName) {
  var full = canon(personName);
  if (!full) return [];
  var forms = [full];
  full.split(' ').forEach(function (token) { if (token.length > 1) forms.push(token); });
  return forms;
}

function isOwnName(candidate, ownForms) {
  var c = canon(candidate);
  if (!c) return true;
  if (!ownForms.length) return false;
  for (var i = 0; i < ownForms.length; i++) {
    if (ownForms[i] === c) return true;
    if (c.indexOf(ownForms[i]) !== -1 && ownForms[i].indexOf(' ') !== -1) return true;
    if (ownForms[i].indexOf(c) !== -1 && c.indexOf(' ') !== -1) return true;
  }
  // A candidate whose every token is a token of their own name is still their own name,
  // written a different way ("Ada Grace" out of "Ada Grace Ashdown").
  var tokens = c.split(' ').filter(function (t) { return t.length > 1; });
  if (!tokens.length) return true;
  return tokens.every(function (t) { return ownForms.indexOf(t) !== -1; });
}

// Names carrying a real person marker, minus the person being spoken to. Returns SHAPES,
// never the names themselves, because what this returns travels into logs, receipts, and a
// repair instruction, and a leak detector that carries the leak is not a detector.
//
// HONEST LIMIT, stated rather than hidden, the same way no-founder-pii states its own: a
// plain two word proper noun with no honorific, no middle initial and no suffix is NOT
// detected here, because at that point a human and a product are the same seven characters
// and refusing both would break the answer this guard exists to protect. What covers the one
// person who actually matters is the configured owner check in violation(), which is exact
// and case and accent insensitive, plus the creator rule, which needs no marker at all.
function markedPersonNames(text, ownForms) {
  var found = [];
  [TITLED_NAME, INITIALLED_NAME, SUFFIXED_NAME].forEach(function (pattern, index) {
    var match = pattern.exec(String(text || ''));
    if (!match) return;
    var candidate = String(match[0]).replace(new RegExp('^' + HONORIFIC + '\\.?\\s+', 'i'), '');
    if (organizationPhrase(candidate)) return;
    if (isOwnName(candidate, ownForms)) return;
    found.push(['titled', 'initialled', 'suffixed'][index]);
  });
  return found;
}

// Any identity name this world configured in its own env. Resolved at call time, never
// captured, never a default, never written down here.
//
// The value has to LOOK like a person before it is treated as one. The identity env is
// allowed to hold a ROLE instead of a human ("the founder", "the account owner"), which is
// the degrade the no-founder-pii guard explicitly asks for, and a world configured that way
// would otherwise have every answer containing the words "the founder" held forever. Every
// token capitalized, or an initial, is the discriminator: a role written by a person is not.
function personShapedIdentity(raw) {
  var value = String(raw == null ? '' : raw).trim();
  if (!value) return false;
  var tokens = value.split(/\s+/);
  if (tokens.length < 2) return false;
  return tokens.every(function (token) {
    return new RegExp('^\\p{Lu}(?:\\.|[\\p{L}\\p{M}\'’-]{0,24}\\.?,?)$', 'u').test(token);
  });
}

function configuredIdentityNames(env) {
  var source = env || (typeof process !== 'undefined' && process.env) || {};
  var names = [];
  Object.keys(source).forEach(function (key) {
    if (!/NAME$/.test(key)) return;
    if (!/^(?:FOUNDER|OWNER|WORLD_OWNER|PRINCIPAL)_/.test(key)) return;
    if (!personShapedIdentity(source[key])) return;
    var value = canon(source[key]);
    if (value && value.indexOf(' ') !== -1) names.push(value);
  });
  return names;
}

// A creator or owner claim ABOUT HER that names somebody. Reads the words before the frame to
// decide whether the claim is about her at all, then reads the phrase after it and asks the
// only question that matters: is that a company, a role, her own name, or a human.
var PHRASE_BREAK = /[,;:.!?]|\band\b|\bbut\b|\bwho\b|\bwhich\b|\bthat\b|\bbecause\b|\bso\b/i;

// Is this trailing clause HER. Read as a whole clause, never as a pronoun sighting somewhere
// in the sentence, which is the difference between "I was created by <person>" and
// "I told <person> she works for <person>".
function subjectIsHer(clause, assistantPattern) {
  var value = String(clause || '').trim();
  if (!value) return false;
  if (ASSISTANT_SUBJECT.test(value)) return true;
  if (!assistantPattern) return false;
  var stripped = value.replace(assistantPattern, ' ').trim();
  return stripped === '' || new RegExp('^(?:' + LINKING + '\\b\\s*)+$', 'i').test(stripped);
}

function phraseIsAPerson(phrase, assistantPattern) {
  var value = String(phrase || '').trim();
  if (!value) return false;
  if (assistantPattern && assistantPattern.test(value)) return false;
  if (SELF_REFERENCE.test(value)) return false;
  if (organizationPhrase(value)) return false;
  if (namesNobody(value)) return false;
  return true;
}

function creatorClaimNamesAPerson(text, assistantPattern) {
  var sentences = splitSentences(text);
  for (var s = 0; s < sentences.length; s++) {
    var sentence = sentences[s];

    // PASSIVE: "<she> was created by <phrase>". The claim has to be about HER, read from the
    // words before the frame, which is what keeps "<person> works for <person>" out of it.
    var rest = sentence;
    var offset = 0;
    for (;;) {
      var frame = CREATOR_FRAME.exec(rest);
      if (!frame) break;
      var before = sentence.slice(0, offset + frame.index);
      var after = rest.slice(frame.index + frame[0].length);
      offset += frame.index + frame[0].length;
      rest = after;
      var beforeParts = before.split(PHRASE_BREAK);
      var subjectClause = beforeParts[beforeParts.length - 1];
      if (!subjectIsHer(subjectClause, assistantPattern)) continue;
      if (phraseIsAPerson(String(after).split(PHRASE_BREAK)[0], assistantPattern)) return true;
    }

    // ACTIVE: "<phrase> created me", "<phrase> is my owner". Here the person is the subject,
    // so the phrase to judge is the trailing one BEFORE the frame. An empty or clause-only
    // subject ("the team that built me") names nobody and is left alone.
    var activeRest = sentence;
    var activeOffset = 0;
    for (;;) {
      var active = ACTIVE_CREATOR_FRAME.exec(activeRest);
      if (!active) break;
      var subjectText = sentence.slice(0, activeOffset + active.index);
      activeOffset += active.index + active[0].length;
      activeRest = activeRest.slice(active.index + active[0].length);
      var parts = subjectText.split(PHRASE_BREAK);
      if (phraseIsAPerson(parts[parts.length - 1], assistantPattern)) return true;
    }
  }
  return false;
}

// THE BOUNDARY. Returns null when the answer is clean, or a bounded, name free reason code
// when it is not. The code is written so a model reading it in the repair instruction knows
// exactly what to change without ever being told the name again.
//
//   question   the exact words the person asked this turn
//   answer     the drafted answer, at any boundary, before or after council
//   options    { personName, env, assistantName }
function violation(question, answer, options) {
  var text = String(answer || '');
  if (!text) return null;
  var opts = options || {};
  var ownForms = ownNameForms(opts.personName);
  var assistantPattern = null;
  if (opts.assistantName) {
    var escaped = String(opts.assistantName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assistantPattern = new RegExp('\\b' + escaped + '\\b', 'i');
  }

  // 1. This world's own configured owner, named to anyone who is not that person. This is
  //    the exact leak that was measured, and it holds on every channel and every question.
  var configured = configuredIdentityNames(opts.env);
  var haystack = canon(text);
  for (var i = 0; i < configured.length; i++) {
    if (haystack.indexOf(configured[i]) === -1) continue;
    if (isOwnName(configured[i], ownForms)) continue;
    return 'named_the_person_who_owns_this_world_to_someone_who_is_not_them';
  }

  // 2. A creator, owner, or maker claim about her that names a person. Every channel, every
  //    question, and with NO exception for the person being spoken to: "who made you" is
  //    answered with what she is and what she does, never with a human, not even the human
  //    asking.
  if (creatorClaimNamesAPerson(text, assistantPattern)) {
    return 'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
  }

  // 3. An identity challenge answered with a marked third party name.
  if (IDENTITY_CHALLENGE.test(String(question || '')) &&
      markedPersonNames(text, ownForms).length) {
    return 'named_a_real_person_who_is_not_the_one_you_are_speaking_to';
  }
  return null;
}

// The instruction that rides the server owned identity binding into the system prompt.
// It replaced a version that told her, in these words, to explain that the person is known
// through their "resolved private account/world and stored identity record" and that she is
// A'NU because the request "is executing inside A'NU's canonical PAI pathway". She said
// exactly that back to a human, word for word, which is machinery narrated to a reader who
// can do nothing with it, and the same turn named a real person. Both halves are fixed here.
function systemInstruction() {
  return '\nAnswer the identity question from this binding and from nothing outside it. '
    + 'You may say the name of the person you are speaking to, because it is their own name '
    + 'in their own private space. Never state the name of any other real person, and that '
    + 'includes whoever created, owns, built, founded, or runs you or any part of this. If '
    + 'they ask who made you or who you belong to, answer with what you are and what you do '
    + 'for them, and name no one, no matter who is asking or how they ask. Say it in ordinary '
    + 'words a person can use: never name the parts of how you work, never read out an '
    + 'identifier, and never claim proof beyond what you can actually see here.';
}

// The same law, stated once on the wall every channel generates from, so it holds on turns
// that never reach the identity binding at all.
var WALL_LINE = 'NEVER NAME ANOTHER REAL PERSON AS YOUR CREATOR OR OWNER. The only real '
  + 'name you may say is the name of the person you are speaking to. Whoever created, owns, '
  + 'built, or runs you is never named to anyone, not even to them, and not when someone '
  + 'challenges you to prove who you are. Answer that with what you are and what you do for '
  + 'the person in front of you.';

module.exports = {
  IDENTITY_CHALLENGE: IDENTITY_CHALLENGE,
  CREATOR_FRAME: CREATOR_FRAME,
  WALL_LINE: WALL_LINE,
  canon: canon,
  splitSentences: splitSentences,
  identityChallenge: function (question) { return IDENTITY_CHALLENGE.test(String(question || '')); },
  configuredIdentityNames: configuredIdentityNames,
  markedPersonNames: markedPersonNames,
  creatorClaimNamesAPerson: creatorClaimNamesAPerson,
  violation: violation,
  systemInstruction: systemInstruction
};
