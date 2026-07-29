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
//      asks whether that phrase is a company, a role, a department, or her own name. A phrase
//      that is none of those, carrying a given name AND a family name, is a person however it
//      is spelled.
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
// ⬡B:core.real_name_boundary:FIX:a_rule_per_sentence_shape_meets_a_new_sentence_forever:20260729⬡
// CODEX REVIEW, third round, seven more, and the reviewer named the real problem rather than
// only its instances: the failures kept arriving because the subject test matched a fixed
// SENTENCE SHAPE. "I was created and built by <person>" broke it. "I was recently created by
// <person>" broke it. Same claim, different sentence, and there is no end to sentences. So it
// stopped reading shape: stripFiller() removes connectives, adverbs and the making verbs from
// the window before the frame, and whatever is left has to BE her. Those words cannot change
// who a claim is about, which is why removing them is safe and why one rule now covers the
// shapes nobody has written yet. The rest of that round: contracted challenges ("who's
// this?"), every marked name scanned instead of only the first (clearing the reader's own
// name made it stop looking, and the second name shipped), the identity lookahead anchored so
// a qualifier has to END the question, departments and functions no longer defaulting to
// HUMAN, an unmarked human needing a given AND a family name, role phrases never recorded as
// a person in any capitalization, and honorific periods kept masked through the whole
// analysis so a phrase is not cut at the honorific.
//
// ⬡B:core.real_name_boundary:FIX:the_tail_was_lengthening_not_closing:20260729⬡
// FOURTH ROUND, and it changed the design rather than adding to it. The reviewer stopped
// reporting instances and named the pattern: every P1 for two rounds was a new way to phrase
// "X created me" getting past clause level English parsing, one introductory clause reported
// three separate times in three different phrasings. A tail like that does not close by
// patching, it lengthens.
//
// SO THE SUBJECT PARSING IS GONE, all of it. This is a LEAK PREVENTION gate, not a grammar
// checker, and those two want opposite things from an ambiguous sentence. It asks two
// questions now, with no parse at all: does this answer make a claim about who made or owns
// her, and does a real person's name appear anywhere in it.
//
// THE TRADE, taken deliberately and on the record: more false positives, and a place name on
// an identity turn is a known one with a test of its own. The cost of over refusing is one
// repair pass and an answer that says less. The cost of under refusing is a real human's name
// handed to a stranger. Those are not comparable, and this file is allowed to be wrong in
// only one of those directions.
//
// ZERO I/O, zero requires, pure functions, so it can never be the thing that makes a turn
// hang or fail. A test pins that.
'use strict';

// A challenge to who she is or who they are. This is the scope where a third party may not be
// named at all. Deliberately does not include "how do you know", which is asked about ordinary
// facts a hundred times a day and legitimately answers with other people's names ("you told me
// your accountant is ..."). "who are you" and "what are you" are ANCHORED: they only count
// when the question ends there, so "what are you doing with <someone>" stays an ordinary turn.
// The question has to actually END there. The first version merely PERMITTED a trailing
// qualifier, so "what are you really doing with <person>?" still read as a challenge to who
// she is and a perfectly good answer was refused. A qualifier is allowed, and then the
// question must stop.
var OPEN_TAIL = '(?=\\s*(?:[?.!,;]|$)'
  + '|\\s+(?:really|exactly|then|anyway|though|now)\\s*(?:[?.!,;]|$)'
  + '|\\s+and\\b)';
var IDENTITY_CHALLENGE = new RegExp(
  '\\bwho\\s*(?:\\s|[\\x27\\u2019]re|[\\x27\\u2019]s)\\s*(?:are|r)?\\s*(?:you|u)\\b' + OPEN_TAIL
  + '|\\bwhat\\s+are\\s+you\\b' + OPEN_TAIL
  + '|\\bwho\\s+am\\s+i\\b' + OPEN_TAIL
  // Contracted forms. "who's this?" is how a person actually types it, and the first version
  // recognized only the uncontracted spelling, so the plainest challenge there is went
  // unchecked and a name released in reply to it was never looked at.
  + '|\\bwho\\s*(?:[\\x27\\u2019]s|s|\\s+is)\\s+this\\b' + OPEN_TAIL
  + '|\\bwho\\s*(?:[\\x27\\u2019]s|\\s+is)\\s+(?:calling|talking|speaking|there)\\b'
  + '|\\bprove\\s+(?:it|who|yourself|that)\\b'
  + '|\\bwho\\s+(?:made|created|built|owns?|runs?|designed|programmed)\\s+you\\b'
  + '|\\bare\\s+you\\s+real\\b'
  // "What's your name?" is the plainest identity challenge there is and the first version
  // did not fire on it at all, so an answer to it could name anybody.
  + '|\\bwhat(?:\\s+is|\\s+are|[\'’]s|s)?\\s+your\\s+name\\b'
  + '|\\btell\\s+me\\s+your\\s+name\\b'
  + '|\\bdo\\s+you\\s+have\\s+a\\s+name\\b'
  + '|\\bwhat\\s+(?:do|should)\\s+(?:i|we)\\s+call\\s+you\\b', 'i');

// ⬡B:core.real_name_boundary:FIX:stop_parsing_english_and_start_counting_co_occurrence:20260729⬡
// FOURTH ROUND of review, and the reviewer stopped reporting instances and named the pattern:
// every P1 for two rounds was a new way to phrase "X created me" getting past clause level
// English parsing, and that tail was not closing, it was lengthening. Possessive subjects.
// The assistant's own name riding in the same clause as a human's. Base tense. An
// introductory clause ("As I said, ...", "I can confirm that ...", "I learned that ...")
// pushing the subject out of the local window, reported three separate times in three
// phrasings, which is what a real world shape looks like.
//
// SO THE SUBJECT PARSING IS GONE. All of it: the clause splitter, the filler stripper, the
// linking word allowlist, the assistant subject matcher. This is a LEAK PREVENTION gate, not
// a grammar checker, and the two want opposite things from an ambiguous sentence. It now asks
// two questions with no parsing at all: does this answer make a claim about who made or owns
// her, and does a real person's name appear anywhere in it. Both true is a violation, wherever
// the words sit and in whatever order.
//
// THE PRICE, taken deliberately and with the reviewer's agreement: more false positives. An
// ordinary sentence that carries both signals now trips. That costs one repair pass, and if
// the repair also trips, silence with a named reason. It never crashes and it never ships a
// wrong answer, so the worst case is that she says less. Under refusing a real human's name
// is far worse than over refusing an edge case, and that is the whole trade.
//
// WHAT KEEPS IT FROM REFUSING EVERYTHING. The making verb still has to be pointed AT HER,
// which is a lexical test, not a parse: it is followed by "by", or it takes her as its direct
// object, or it appears as "is my/our creator". "I made a reservation for <someone>" and
// "<someone> built the deck" carry a making verb and a name and are not claims about who owns
// her, so they still ship. That single test is worth more than every clause rule it replaces.
var HER_AS_OBJECT = '(?:me|us|myself|ourselves|this\\s+(?:assistant|butler|system|service|'
  + 'world|mind)|a[\'’`]?\\s?n[ue]w?)';
var MAKING_VERB = '(?:creat(?:e|es|ed|ing)|built|build|builds|building|made|make|makes|making|'
  + 'design(?:s|ed|ing)?|develop(?:s|ed|ing)?|program(?:s|med|ming)?|founded|found(?:s)?ed|'
  + 'invent(?:s|ed|ing)?|train(?:s|ed|ing)?|cod(?:e|es|ed|ing)|wrote|write|writes|written|'
  + 'author(?:s|ed|ing)?|operat(?:e|es|ed|ing)|own(?:s|ed)?|run|runs|assembl(?:e|es|ed))';

// A claim about who made or owns HER, in any voice, any tense, any position in the sentence.
// No subject, no clause, no window. "did create me" and "was created by" and "is my creator"
// are all the same claim and all match here.
var CREATOR_CLAIM = new RegExp(
  // passive or attributive: "<verb> by ..."
  '\\b' + MAKING_VERB + '\\s+by\\b'
  // active with her as the object, including an auxiliary: "did create me", "will build us"
  + '|\\b(?:did|does|do|will|would|can|could|has|have|had)?\\s*' + MAKING_VERB
  + '\\s+' + HER_AS_OBJECT + '\\b'
  // possessive role: "my creator", "our developer", in any sentence position, which is what
  // "My creator is <person>" needed and never had.
  + '|\\b(?:my|our|the)\\s+(?:creator|maker|builder|founder|owner|author|developer|boss|'
  + 'designer|programmer|architect)\\b', 'i');

// The ambiguous family. "<person> works for <person>" is a fact about two other people and
// none of this module's business, so this one alone still needs her mentioned in the answer.
// That is a co-occurrence test, not a parse: it asks whether she is in the sentence at all,
// never which noun is the subject.
var EMPLOYMENT_CLAIM = new RegExp(
  '\\b(?:belongs?|belonged|reports?|reported|works?|worked)\\s+(?:to|for)\\b', 'i');
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
  + 'running|behalf|account|side|'
  // ⬡B:core.real_name_boundary:FIX:not_everything_that_is_not_a_company_is_a_human:20260729⬡
  // CODEX REVIEW. "I work for customer success" and "I was created by <a company with no
  // company word in its name>" were both refused as naming a real person, because anything
  // that was neither word for word allowlisted nor ending in a recognized company suffix
  // defaulted to HUMAN. Departments and functions are the ordinary answer to "who do you work
  // for" and none of them is a person, so they belong here beside the role nouns.
  + 'customer|customers|success|support|engineering|product|products|operations|ops|marketing|'
  + 'sales|finance|legal|security|research|data|growth|community|infrastructure|design|'
  + 'delivery|quality|training|content|editorial|studio|desk|office|division|practice|'
  + 'function|unit|line|floor|shop|lab|program|initiative|effort|side|department|'
  // Product and self words. "Digital Butler", "Wonder Games", "Command Center" are things
  // this world calls itself, and reading them as humans refused the exact answer to
  // who-are-you that this guard exists to protect.
  + 'digital|butler|wonder|wonders|game|games|command|center|centre|assistant|assistants|'
  + 'mind|app|apps|platform|thing|things|space|room|door|gate|wall|board|desk)$', 'i');

// PERSON MARKERS. Outside a creator claim, a proper noun alone is not evidence of a human:
// "Wonder Games", "New York" and "Digital Butler" are all two title cased words. A marker is.
var HONORIFIC = '(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Rev|Hon|Madam|Lady|Lord|Fr|Sr\\.|Capt|Sgt)';
var NAME_TOKEN = '\\p{Lu}[\\p{L}\\p{M}\'’\\u2019-]{1,24}';
// ⬡B:core.real_name_boundary:FIX:the_capture_stopped_at_the_first_name:20260729⬡
// It matched an honorific plus ONE token, so "Dr. <given> <family>" was captured as the given
// name alone. When the reader's own first name happened to match, isOwnName() then exempted a
// DIFFERENT person's surname and released it. The capture runs to the end of the name now.
var TITLED_NAME = new RegExp('\\b' + HONORIFIC + '\\.?\\s+' + NAME_TOKEN
  + '(?:\\s+' + NAME_TOKEN + '){0,2}', 'u');
// A middle initial between two name tokens: <given> <initial>. <family>.
var INITIALLED_NAME = new RegExp('\\b' + NAME_TOKEN + '\\s+\\p{Lu}\\.\\s+' + NAME_TOKEN, 'u');
// A generational suffix after one or more name tokens: <given> <family> Sr.
// The examples in this file are written as placeholders on purpose. An invented
// person in a comment is still a person shaped literal in the mind template every
// world inherits, and no-founder-pii is right to refuse it.
var SUFFIXED_NAME = new RegExp('\\b' + NAME_TOKEN + '(?:\\s+' + NAME_TOKEN + ')*'
  + ',?\\s+(?:Sr|Jr|II|III|IV|PhD|MD|Esq)\\b\\.?', 'u');
// A plain run of two or more capitalized words, which is what most real names actually look
// like. On its own it reads products and places as people too, so it is only survivable
// because carriesAnOrdinaryWord() and organizationPhrase() sit in front of it. Taken
// deliberately: a leak prevention gate would rather refuse "Wonder Games" than release a human.
var TITLE_CASED_RUN = new RegExp('\\b' + NAME_TOKEN + '(?:\\s+' + NAME_TOKEN + '){1,3}', 'u');

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

function maskSafeDots(text) {
  return String(text || '').replace(SENTENCE_SAFE_DOT, function (whole) {
    return whole.slice(0, -1) + DOT_MASK;
  });
}
function unmask(text) { return String(text || '').split(DOT_MASK).join('.'); }

// Sentences with honorific and initial periods still masked. The creator analysis works on
// THESE, because a phrase is cut at the next full stop and "created by Dr. <name>" would
// otherwise be cut at the honorific and reduce to the honorific alone. Everything is unmasked
// again before any judgment about the words.
function splitSentencesMasked(text) {
  return maskSafeDots(text).split(/(?<=[.!?])\s+/);
}

function splitSentences(text) {
  return splitSentencesMasked(text).map(unmask);
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
  var scan = String(text || '');
  // ⬡B:core.real_name_boundary:FIX:it_only_ever_looked_at_the_first_one:20260729⬡
  // CODEX REVIEW, and this one was a real release. Each marker pattern ran exec() ONCE, so
  // "Dr. <the reader>, this is your space. Dr. <someone else> configured it." matched the
  // reader's own name, correctly cleared it, and never looked again: the second name shipped.
  // A detector that stops at the first candidate is a detector that clears an answer because
  // its FIRST name was innocent. Every match is collected now.
  [['titled', TITLED_NAME], ['initialled', INITIALLED_NAME],
    ['suffixed', SUFFIXED_NAME]].forEach(function (entry) {
    var pattern = new RegExp(entry[1].source, entry[1].flags.indexOf('g') === -1
      ? entry[1].flags + 'g' : entry[1].flags);
    var match;
    while ((match = pattern.exec(scan))) {
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
      var candidate = String(match[0])
        .replace(new RegExp('^' + HONORIFIC + '\\.?\\s+', 'i'), '');
      if (organizationPhrase(candidate)) continue;
      if (isOwnName(candidate, ownForms)) continue;
      found.push(entry[0]);
    }
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
  // ⬡B:core.real_name_boundary:FIX:capitalization_was_never_the_test_for_person:20260729⬡
  // CODEX REVIEW. The first version used capitalization alone as the discriminator, so a world
  // that degraded its identity env to 'The Founder' or 'Account Owner', which is exactly the
  // degrade no-founder-pii asks for, had that ROLE recorded as a real person, and then every
  // ordinary answer containing that phrase was refused as an owner name leak. Case was never
  // the test. What the words MEAN is: a phrase built only of articles and role nouns names
  // nobody, in any capitalization, and this is the same SAFE_ANSWER_WORDS list the creator
  // rule already judges "who made you" against, not a second hand maintained copy.
  if (namesNobody(value)) return false;
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
// A person's name ANYWHERE in the text, with no regard for where it sits. Four shapes count:
// an honorific plus a name, a middle initial between two names, a generational suffix, and a
// plain run of two or more capitalized words. The last one is new and it is the reviewer's
// call taken deliberately: it does read "Digital Butler" and "Wonder Games" as names when
// nothing excludes them, and the exclusions below are what keep that survivable.
//
// EXCLUDED, in this order, because each removes false positives without hiding a single real
// human: the assistant's own name is stripped PER TOKEN first, not exempted as a whole phrase,
// which is what let "created by Dr. <person> at <assistant>" clear by riding along in the same
// clause; then organizations by their tail word; then any candidate carrying a role,
// department or ordinary noun; then the name of the person being spoken to.
function personNamesAnywhere(text, ownForms, assistantPattern) {
  var scan = unmask(String(text || ''));
  // PER TOKEN, never the whole phrase. This was a real bypass: a human and the assistant in
  // one clause made the clause "about the assistant" and the human vanished with it.
  if (assistantPattern) {
    scan = scan.replace(new RegExp(assistantPattern.source, 'gi'), ' ');
  }
  var found = [];
  [['titled', TITLED_NAME], ['initialled', INITIALLED_NAME], ['suffixed', SUFFIXED_NAME],
    ['pair', TITLE_CASED_RUN]].forEach(function (entry) {
    var pattern = new RegExp(entry[1].source, entry[1].flags.indexOf('g') === -1
      ? entry[1].flags + 'g' : entry[1].flags);
    var match;
    while ((match = pattern.exec(scan))) {
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
      var candidate = String(match[0])
        .replace(new RegExp('^' + HONORIFIC + '\\.?\\s+', 'i'), '').trim();
      if (!candidate) continue;
      if (organizationPhrase(candidate)) continue;
      if (carriesAnOrdinaryWord(candidate)) continue;
      if (isOwnName(candidate, ownForms)) continue;
      found.push(entry[0]);
    }
  });
  return found;
}

// Kept as its own export because the identity rule and the tests both name it.
function markedPersonNames(text, ownForms) {
  return personNamesAnywhere(text, ownForms, null);
}

// A candidate carrying a role, a department or an ordinary noun is a thing, not a human.
// "Digital Butler", "Wonder Games", "Command Center", "Customer Success" all land here.
function carriesAnOrdinaryWord(candidate) {
  return String(candidate).split(/[\s,;:]+/)
    .map(function (t) { return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); })
    .filter(function (t) { return t.length > 0; })
    .some(function (t) { return SAFE_ANSWER_WORDS.test(t); });
}

// A name written in lower case escapes every capitalized shape above, so the phrase directly
// after "by" is still read on its own terms. This is the one place that judges an unmarked,
// uncapitalized phrase, and it is why "created by harriet vole" is still caught.
function phraseIsAPerson(phrase, assistantPattern) {
  var value = unmask(String(phrase || '')).trim();
  if (!value) return false;
  if (assistantPattern) value = value.replace(new RegExp(assistantPattern.source, 'gi'), ' ').trim();
  if (!value) return false;
  // ⬡B:core.real_name_boundary:FIX:mentioning_her_is_not_being_her:20260729⬡
  // This used to reject any by-phrase CONTAINING a self reference, and "<person> to run this
  // world with you" contains "this world", so the owner's own name in a creator claim cleared
  // on a technicality. Whether the phrase names nobody is already decided below, by the words
  // themselves, which is the honest test.
  if (organizationPhrase(value)) return false;
  if (namesNobody(value)) return false;
  if (TITLED_NAME.test(value) || INITIALLED_NAME.test(value) || SUFFIXED_NAME.test(value)) {
    return true;
  }
  var meaningful = String(value).split(/[\s,;:]+/)
    .map(function (t) { return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); })
    .filter(function (t) { return t.length > 1 && !SAFE_ANSWER_WORDS.test(t); });
  return meaningful.length >= 2;
}

// The lower case catch: every "<making verb> by <phrase>" in the answer, judged as a phrase.
function byPhraseNamesAPerson(text, assistantPattern) {
  var pattern = new RegExp('\\b' + MAKING_VERB + '\\s+by\\s+([^.!?;:,]{2,60})', 'gi');
  var match;
  var scan = maskSafeDots(text);
  while ((match = pattern.exec(scan))) {
    if (phraseIsAPerson(match[match.length - 1], assistantPattern)) return true;
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
  // ⬡B:core.real_name_boundary:FIX:a_substring_is_not_a_name:20260729⬡
  // This was a plain indexOf, so a configured owner called "Ann Lee" matched inside "Joann
  // Lee confirmed the meeting" and refused an ordinary sentence about a different human. A
  // name ends where the word ends. Padding both sides and searching for the padded form is
  // the whole fix, and it costs nothing.
  var haystack = ' ' + canon(text) + ' ';
  for (var i = 0; i < configured.length; i++) {
    if (haystack.indexOf(' ' + configured[i] + ' ') === -1) continue;
    if (isOwnName(configured[i], ownForms)) continue;
    return 'named_the_person_who_owns_this_world_to_someone_who_is_not_them';
  }

  // 2. A claim about who made or owns her, plus a real person's name, anywhere in the answer.
  //    No subject parsing: two signals in one answer is the violation. The making verb still
  //    has to point at her ("<verb> by", her as the direct object, "my creator"), which is
  //    what keeps "I made a reservation for <someone>" and "<someone> built the deck" out.
  var namedAnywhere = personNamesAnywhere(text, ownForms, assistantPattern).length > 0;
  if (CREATOR_CLAIM.test(text) &&
      (namedAnywhere || byPhraseNamesAPerson(text, assistantPattern))) {
    return 'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
  }
  //    The employment family is ambiguous enough that it also needs her mentioned, and in the
  //    SAME sentence. "<person> works for <person>" in an answer that happens to say "I"
  //    somewhere else is a fact about two other people. This is still co-occurrence, never a
  //    parse: it asks whether she is in that sentence at all, never which noun is the subject.
  if (EMPLOYMENT_CLAIM.test(text)) {
    var sentences = splitSentences(text);
    for (var e = 0; e < sentences.length; e++) {
      if (!EMPLOYMENT_CLAIM.test(sentences[e])) continue;
      if (!SELF_REFERENCE.test(sentences[e])) continue;
      if (personNamesAnywhere(sentences[e], ownForms, assistantPattern).length ||
          byPhraseNamesAPerson(sentences[e], assistantPattern)) {
        return 'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
      }
    }
  }

  // 3. An identity challenge answered with any third party's name.
  if (IDENTITY_CHALLENGE.test(String(question || '')) && namedAnywhere) {
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
  CREATOR_CLAIM: CREATOR_CLAIM,
  EMPLOYMENT_CLAIM: EMPLOYMENT_CLAIM,
  WALL_LINE: WALL_LINE,
  canon: canon,
  splitSentences: splitSentences,
  identityChallenge: function (question) { return IDENTITY_CHALLENGE.test(String(question || '')); },
  configuredIdentityNames: configuredIdentityNames,
  markedPersonNames: markedPersonNames,
  personNamesAnywhere: personNamesAnywhere,
  violation: violation,
  systemInstruction: systemInstruction
};
