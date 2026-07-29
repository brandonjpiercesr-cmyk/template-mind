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
// ZERO I/O, zero requires, pure functions, so it can never be the thing that makes a turn
// hang or fail. A test pins that.
'use strict';

// A challenge to who she is or who they are. This is the scope where NO third party may be
// named at all. Deliberately does not include "how do you know", which is asked about
// ordinary facts a hundred times a day and legitimately answers with other people's names
// ("you told me your accountant is ...").
var IDENTITY_CHALLENGE = /\bwho\s+(?:are|r)\s+(?:you|u)\b|\bwho\s+am\s+i\b|\bwho\s+is\s+this\b|\bwhat\s+are\s+you\b|\bprove\s+(?:it|who|yourself)\b|\bwho\s+(?:made|created|built|owns?|runs?|designed|programmed)\s+you\b|\bare\s+you\s+real\b/i;

// A claim about who made or owns HER. Checked on EVERY answer, in every channel, not only on
// an identity challenge, because "created by <a real person>" is the leak itself no matter
// what question produced it.
//
// Two deliberate narrowings, both from thinking about what an ordinary day of conversation
// actually contains. Only "by" and never "for": "I built this list for Harriet Vole" is a
// kindness she performed, not a statement of who owns her, and holding it would make this
// guard a nuisance that someone eventually turns off. And the sentence must be ABOUT HER
// (SELF_REFERENCE below): "Harriet Vole works for Tobias Renfrew" is a fact about two other
// people and is none of this module's business.
var CREATOR_FRAME = /\b(?:created|built|made|designed|developed|programmed|founded|invented|owned|operated)\s+by\b|\bmy\s+(?:creator|maker|builder|founder|owner|author|developer|boss)\b|\bthe\s+(?:creator|founder|owner|maker|author)\s+of\s+(?:me|this|us)\b|\b(?:belong|work|report)s?\s+(?:to|for)\b/i;

var SELF_REFERENCE = /\b(?:i|i'm|im|me|my|myself|mine)\b/i;

// A trailing word that makes a capitalized pair an organization rather than a person.
var ORG_TAIL = /^(?:enterprise|enterprises|inc|llc|ltd|plc|corp|corporation|company|co|group|lab|labs|system|systems|technology|technologies|holding|holdings|partner|partners|venture|ventures|foundation|institute|university|college|school|studio|studios|solution|solutions|industry|industries|media|works|agency|team|department|division|service|services|network|networks|bank|capital|academy|association|society|council|committee|board|trust|fund|press|books|records|project|projects|platform|software|digital|consulting|advisors|associates)$/i;

// A courtesy title in front of a single capitalized word is a person just as surely as two
// capitalized words are.
var TITLED_NAME = /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Rev|Hon|Madam)\.?\s+[A-Z][a-z]{1,20}\b/;

// Two to four capitalized tokens, allowing a middle initial and a generational suffix.
var NAME_SHAPE = /[A-Z][a-z]{1,20}(?:\s+(?:[A-Z]\.|[A-Z][a-z]{1,20}(?:-[A-Z][a-z]{1,20})?)){1,3}(?:,?\s+(?:Sr|Jr|II|III|IV)\.?)?/g;

function canon(value) {
  return String(value == null ? '' : value)
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lower the first letter of every sentence so an ordinary opener ("Your world is ...") can
// never be read as the first half of somebody's name. A single capital letter followed by a
// period is a middle initial, not the end of a sentence, so it is left alone: without that
// exception a name written the way people actually write it would break in half and escape.
function neutralizeSentenceStarts(text) {
  return String(text || '').replace(/(^|[^A-Z][.!?)\]]\s+|\n\s*)([A-Z])/g,
    function (whole, lead, letter) { return lead + letter.toLowerCase(); });
}

function organizationName(candidate) {
  var parts = String(candidate).split(/\s+/);
  return ORG_TAIL.test(String(parts[parts.length - 1] || '').replace(/[.,]/g, ''));
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

// Person shaped names in a piece of text, minus organizations and minus the name of the
// person being spoken to. Returns COUNTS and SHAPES, never the names themselves, because
// what this function returns travels into logs, receipts, and a repair instruction, and a
// leak detector that carries the leak is not a detector.
function thirdPartyNames(text, ownForms) {
  var found = [];
  var scan = neutralizeSentenceStarts(text);
  var titled = TITLED_NAME.exec(scan);
  if (titled && !isOwnName(titled[0].replace(/^\S+\.?\s+/, ''), ownForms)) found.push('titled');
  NAME_SHAPE.lastIndex = 0;
  var match;
  while ((match = NAME_SHAPE.exec(scan))) {
    var candidate = match[0].trim();
    if (organizationName(candidate)) continue;
    if (isOwnName(candidate, ownForms)) continue;
    found.push('name');
  }
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
    return /^[A-Z](?:\.|[A-Za-z'’-]{0,24}\.?,?)$/.test(token);
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

// THE BOUNDARY. Returns null when the answer is clean, or a bounded, name free reason code
// when it is not. The code is written so a model reading it in the repair instruction knows
// exactly what to change without ever being told the name again.
//
//   question   the exact words the person asked this turn
//   answer     the drafted answer, after preparation, before council
//   options    { personName, env }
function violation(question, answer, options) {
  var text = String(answer || '');
  if (!text) return null;
  var opts = options || {};
  var ownForms = ownNameForms(opts.personName);

  // 1. This world's own configured owner, named to anyone who is not that person. This is
  //    the exact leak that was measured, and it holds on every channel and every question.
  var configured = configuredIdentityNames(opts.env);
  var haystack = canon(text);
  for (var i = 0; i < configured.length; i++) {
    if (haystack.indexOf(configured[i]) === -1) continue;
    if (isOwnName(configured[i], ownForms)) continue;
    return 'named_the_person_who_owns_this_world_to_someone_who_is_not_them';
  }

  // 2. A creator, owner, or maker claim that names a person. Every channel, every question,
  //    and with NO exception for the person being spoken to: "who made you" is answered with
  //    what she is and what she does, never with a human, not even the human asking. The
  //    check is per sentence so an ordinary name elsewhere in the same answer is untouched.
  var sentences = text.split(/(?<=[.!?])\s+/);
  for (var s = 0; s < sentences.length; s++) {
    if (!CREATOR_FRAME.test(sentences[s])) continue;
    if (!SELF_REFERENCE.test(sentences[s])) continue;
    if (thirdPartyNames(sentences[s], []).length) {
      return 'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you';
    }
  }

  // 3. An identity challenge answered with any third party's name at all.
  if (IDENTITY_CHALLENGE.test(String(question || '')) &&
      thirdPartyNames(text, ownForms).length) {
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
  identityChallenge: function (question) { return IDENTITY_CHALLENGE.test(String(question || '')); },
  configuredIdentityNames: configuredIdentityNames,
  violation: violation,
  systemInstruction: systemInstruction
};
