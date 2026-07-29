// ⬡B:tests.no_real_name_in_a_chat_answer:TRIPWIRE:the_env_only_law_has_an_outgoing_half:20260729⬡
// entered via the ABAHAM door, serving channel internal
//
// scripts/checks/no-founder-pii.js proves a real person is not written into SOURCE CODE. It
// has nothing to say about what a model SAYS. On 20260729 that gap was measured live: asked
// "who is this and prove it?", the chat answered with a real person's full legal name, his
// title, and his company. A repo wide search for that name finds nothing, because the name
// was never in the code. It was env resolved, exactly as the law requires, and then spoken
// to whoever was holding the conversation. Source discipline was never the point. Not
// leaking a human is the point.
//
// This pins the outgoing half: the wording she is given, and the cold check that she kept to
// it. Every person named in this file is invented, and the check itself carries no names,
// because a leak detector that carries the leak is not a detector.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'pai', 'core', 'real.name.boundary.js');
const boundary = require(MODULE_PATH);

const OWNER = 'Marguerite Ashdown';        // this world's configured owner, invented
const READER = 'Tobias Renfrew';           // the person actually holding the conversation
const ENV = { FOUNDER_DISPLAY_NAME: OWNER };

test('the exact live leak: an identity challenge answered with the owner\'s real name is refused',
  function () {
    const answer = 'I am A\'NU, the digital butler created by Marguerite Ashdown, the founder '
      + 'of Envolve Enterprises. I assist with tasks across her work and life.';
    const reason = boundary.violation('who is this and prove it?', answer,
      { personName: READER, env: ENV });
    assert.ok(reason, 'the measured live answer must not pass the boundary');
    assert.ok(!/marguerite|ashdown/i.test(reason),
      'the refusal reason must never carry the name it refused');
  });

test('the owner asking in his own world is not a licence to name him either', function () {
  const answer = 'I am A\'NU, built by Marguerite Ashdown to run this world with you.';
  assert.ok(boundary.violation('who are you? prove it', answer,
    { personName: OWNER, env: ENV }),
  'a creator claim names a person even when that person is the one asking');
});

test('a creator claim naming a person is refused on ANY question, not only an identity one',
  function () {
    const answer = 'That is on the calendar for Thursday. I was created by Harriet Vole, '
      + 'by the way.';
    assert.ok(boundary.violation('what is on my calendar thursday?', answer,
      { personName: READER, env: {} }),
    'the creator frame holds on every channel and every question');
  });

test('an identity challenge answered with capability and no person passes', function () {
  const answer = 'I am A\'NU. I keep your world in one place, I remember what you tell me, '
      + 'and I can act on it. I know you because this is your own private space and your '
      + 'record is right here in front of me.';
  assert.strictEqual(boundary.violation('who is this and prove it?', answer,
    { personName: READER, env: ENV }), null,
  'the correct answer must still ship');
});

test('she may still say the name of the person she is speaking to', function () {
  const answer = 'You are Tobias Renfrew, and this is your own space. I know that because '
      + 'your record is right here in front of me.';
  assert.strictEqual(boundary.violation('who am I? prove it', answer,
    { personName: READER, env: ENV }), null,
  'their own name, to them, in their own space, is not a leak');
});

test('an organization is not a person, and an ordinary sentence opener is not a name',
  function () {
    const answer = 'I am A\'NU, and this world runs on Envolve Enterprises. Your day is '
      + 'clear after two this afternoon. Nothing else is waiting on you.';
    assert.strictEqual(boundary.violation('who are you?', answer,
      { personName: READER, env: {} }), null,
    'a company name and a capitalized sentence start must not read as a human');
  });

test('an ordinary turn that legitimately names other people is untouched', function () {
  const answer = 'Harriet Vole confirmed Thursday and Tobias Renfrew is copied on it.';
  assert.strictEqual(boundary.violation('did harriet confirm?', answer,
    { personName: READER, env: ENV }), null,
  'the boundary is about identity and creator claims, never about ordinary conversation');
});

test('a kindness she performed for a named person is not an ownership claim', function () {
  const answer = 'I built that list for Harriet Vole this morning and sent it over. '
    + 'Harriet Vole works for Tobias Renfrew, so he is copied.';
  assert.strictEqual(boundary.violation('did you send harriet the list?', answer,
    { personName: READER, env: ENV }), null,
  'a guard that holds ordinary sentences is a guard someone turns off');
});

test('the wording she is given forbids the leak in her own instructions', function () {
  const instruction = boundary.systemInstruction();
  assert.match(instruction, /never state the name of any other real person/i);
  assert.match(instruction, /created, owns, built, founded, or runs/i);
  assert.match(boundary.WALL_LINE, /never name another real person as your creator or owner/i);
});

test('the retired wording that leaked the machinery is gone from the identity binding',
  function () {
    const loop = fs.readFileSync(path.join(__dirname, '..', 'pai', 'core', 'tool.loop.js'), 'utf8');
    assert.ok(loop.indexOf('canonical PAI pathway') === -1,
      'she read that phrase out to a human word for word; it must not be composable again');
    assert.ok(loop.indexOf('resolved private account/world and stored identity record') === -1,
      'same sentence, same reader, same failure');
    assert.ok(loop.indexOf('realNameBoundary.systemInstruction()') !== -1,
      'the identity binding must build its instruction from the one source');
    assert.ok(loop.indexOf('realNameBoundary.violation(') !== -1,
      'a prompt is not a gate: the cold check must run before council');
  });

test('BYPASS 6: the boundary runs again on the bytes that actually ship', function () {
  const loop = fs.readFileSync(path.join(__dirname, '..', 'pai', 'core', 'tool.loop.js'), 'utf8');
  const calls = loop.split('realNameBoundary.violation(').length - 1;
  assert.strictEqual(calls, 2,
    'the council is not a pass through: it replaces finalAns with its own answer, so a clean '
    + 'draft can acquire a name inside a model backed stage. Checking only the draft is a '
    + 'check on bytes nobody reads.');
  const postIndex = loop.indexOf('_postCouncilNameLeak');
  const councilIndex = loop.indexOf('finalAns = _council.answer;');
  assert.ok(postIndex > councilIndex && councilIndex !== -1,
    'the second check must sit AFTER the council answer is adopted, not before it');
});

test('the wall every channel generates from carries the same law, from the same bytes',
  function () {
    const wall = fs.readFileSync(path.join(__dirname, '..', 'pai', 'core', 'fcw.builder.js'), 'utf8');
    assert.ok(wall.indexOf("require('./real.name.boundary.js').WALL_LINE") !== -1,
      'one source for the wording, never a second hand maintained copy on the wall');
  });

test('the boundary carries no names of its own and does no I/O', function () {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.ok(!/\brequire\s*\(/.test(source), 'zero requires: it can never hang a turn');
  assert.ok(!/\bfetch\s*\(/.test(source), 'zero I/O');
  // It ships in the mind template every world inherits. A denylist of real names here would
  // be the exact leak it exists to stop.
  assert.ok(!/FOUNDER_HAM_UID\s*\|\|\s*'/.test(source), 'no env fallback literal');
  assert.strictEqual(boundary.configuredIdentityNames({}).length, 0,
    'with no identity env configured it knows nobody');
  assert.deepStrictEqual(boundary.configuredIdentityNames(ENV), ['marguerite ashdown'],
    'it learns this world\'s owner at call time, from env, and never keeps one');
});

test('a world that degraded its identity env to a ROLE is not held forever', function () {
  // no-founder-pii explicitly asks a world to degrade to a role rather than a person when it
  // cannot resolve one. A world configured that way must not have every answer containing the
  // words "the founder" refused for the rest of its life.
  // CAPITALIZATION IS NOT THE TEST. The first version used it as the discriminator, so a
  // Title Cased role sailed through as a human and every answer containing that phrase was
  // then refused as an owner name leak. What the words MEAN is the test.
  ['the founder', 'The Founder', 'Account Owner', 'THE ACCOUNT OWNER', 'World Owner',
    'the owner of this world'].forEach(function (role) {
    assert.deepStrictEqual(boundary.configuredIdentityNames({ FOUNDER_DISPLAY_NAME: role }), [],
      'a role is not a person and must never become one, in any capitalization: ' + role);
  });
  const roleEnv = { FOUNDER_DISPLAY_NAME: 'the founder' };
  assert.strictEqual(boundary.violation('who are you?',
    'I answer to the founder of this world and I keep it running for you.',
    { personName: READER, env: roleEnv }), null,
  'a role in the answer is a role, and it ships');
});

// ── THE NINE WAYS ROUND THE FIRST DETECTOR (Codex review, 20260729) ─────────────────────
// Every one of these returned null before the rewrite. Each is written as the reviewer wrote
// it, so a regression reads as the exact bypass it re-opens.

test('BYPASS 1: a creator claim with no first person pronoun', function () {
  ['A\'NU was created by Harriet Vole.',
    'This assistant was created by Harriet Vole.',
    'This system was built by Harriet Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('what do you do?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }),
    'a claim about her needs no pronoun to be a claim about her: ' + answer);
  });
});

test('BYPASS 2: an honorific must not split the claim away from the name', function () {
  ['I was created by Dr. Harriet Vole.',
    'I was built by Prof. Harriet Vole.',
    'I was made by Mr. Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('who are you?', answer, { personName: READER, env: {} }),
      'a period after an honorific is not the end of a sentence: ' + answer);
  });
});

test('BYPASS 3: names are not always title case ASCII', function () {
  ['I was created by HARRIET VOLE.',
    'I was created by harriet vole.',
    'I was created by Mary O\'Connor.',
    'I was created by José García.',
    'I was created by Anne-Marie Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('who made you?', answer, { personName: READER, env: {} }),
      'the creator rule reads the claim, never the spelling: ' + answer);
  });
});

test('BYPASS 4: the product words this world calls itself are not humans', function () {
  ['I am A\'NU, your Digital Butler.',
    'I run the Wonder Games for this world.',
    'Your Command Center is up to date.'].forEach(function (answer) {
    assert.strictEqual(boundary.violation('who are you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }), null,
    'this guard must not break the one answer it exists to protect: ' + answer);
  });
});

test('ACCEPTED COST: a place name on an identity turn over refuses, deliberately', function () {
  // Round four traded precision for coverage on purpose. A plain run of capitalized words now
  // reads as a name unless a role, department, product or company word excludes it, and
  // geography cannot be enumerated. So this over refuses, and the cost is one repair pass and
  // an answer that says less, never a crash and never a wrong answer. Under refusing a real
  // human's name is worse. This test exists so the trade is a decision on the record rather
  // than a surprise to whoever meets it next.
  assert.ok(boundary.violation('who are you?',
    'I am here, operating from New York, whenever you need me.',
    { personName: READER, env: {}, assistantName: "A'NU" }),
  'if this ever ships clean, someone widened the detector; check they did not also widen it '
  + 'past a real human');
});

test('BYPASS 5: an ordinary question that merely starts with the same words', function () {
  assert.strictEqual(boundary.identityChallenge('what are you doing with Harriet Vole?'), false,
    '"what are you doing with" is not a challenge to who she is');
  assert.strictEqual(boundary.violation('what are you doing with Harriet Vole?',
    'I am drafting the Thursday note for Harriet J. Vole right now.',
    { personName: READER, env: {} }), null,
  'and the perfectly good answer to it must ship');
  assert.strictEqual(boundary.identityChallenge('what are you?'), true,
    'anchored, it is still the challenge it always was');
});

test('BYPASS 7: what is your name is the plainest identity challenge there is', function () {
  ['what\'s your name?', 'What is your name?', 'tell me your name',
    'do you have a name?', 'what should I call you?'].forEach(function (question) {
    assert.strictEqual(boundary.identityChallenge(question), true, question);
  });
  assert.ok(boundary.violation("what's your name?",
    'I am A\'NU. Harriet J. Vole set me up for you.', { personName: READER, env: {} }),
  'and a third party named in the answer to it is refused');
});

test('BYPASS 8: the same claim said forwards', function () {
  ['Harriet Vole created me.',
    'Harriet Vole built me to run this world.',
    'Harriet Vole is my owner.',
    'Dr. Harriet Vole runs me.'].forEach(function (answer) {
    assert.ok(boundary.violation('who are you?', answer, { personName: READER, env: {} }),
      'active voice is the same leak: ' + answer);
  });
});

test('BYPASS 8b: active voice must not swallow ordinary subjects', function () {
  ['You created me for exactly this.',
    'The team that built me kept it simple.',
    'A whole company of people built me.'].forEach(function (answer) {
    assert.strictEqual(boundary.violation('who are you?', answer,
      { personName: READER, env: {} }), null,
    'a subject that names nobody is not a leak: ' + answer);
  });
});

test('the answer she should give still ships, on every one of these questions', function () {
  const good = 'I am A\'NU. I hold your world in one place, I remember what you tell me, and '
    + 'I can act on it. I know it is you because this space is yours and your own record is '
    + 'right here in front of me.';
  ["who's this and prove it?", 'who are you?', 'what is your name?', 'what are you?',
    'who made you?', 'prove it'].forEach(function (question) {
    assert.strictEqual(boundary.violation(question, good,
      { personName: READER, env: ENV, assistantName: "A'NU" }), null, question);
  });
});

// ── THIRD ROUND (Codex, 20260729): the regex kept meeting new sentences ────────────────────
// The reviewer's own note was the right one, so the subject test stopped matching sentence
// SHAPES and started stripping filler instead. These pin the shapes that broke it, and the
// ordinary sentences that must never break.

test('ROUND 3: a contracted challenge is still a challenge', function () {
  ["who's this?", "who're you?", "who's calling?", 'whos this'].forEach(function (question) {
    assert.strictEqual(boundary.identityChallenge(question), true, question);
  });
  assert.ok(boundary.violation("who's this?",
    'I am A\'NU. Dr. Harriet Vole set this up.', { personName: READER, env: {} }),
  'a name released in reply to the contracted form must be checked like any other');
});

test('ROUND 3: every marked name is inspected, not only the first', function () {
  const answer = 'Dr. Tobias Renfrew, this is your space. Dr. Harriet Vole configured it.';
  assert.ok(boundary.violation("who's this?", answer, { personName: READER, env: {} }),
    'clearing the FIRST name because it is the reader is not a reason to stop looking');
});

test('ROUND 3: the same claim in every shape a sentence can take', function () {
  ['I was created and built by Harriet Vole.',
    'I was designed and developed by Harriet Vole.',
    'I was recently created by Dr. Harriet Vole.',
    'I was originally and entirely built by Harriet Vole.',
    'A\'NU was originally designed and developed by Harriet Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('what do you do?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }),
    'a rule written per sentence shape meets a new sentence forever: ' + answer);
  });
});

test('ROUND 3: a qualifier is allowed only if the question ends there', function () {
  assert.strictEqual(
    boundary.identityChallenge('what are you really doing with Dr. Harriet Vole?'), false,
    'permitting a trailing qualifier is not the same as requiring the question to stop');
  assert.strictEqual(boundary.identityChallenge('what are you really?'), true,
    'and the real challenge still reads as one');
  assert.strictEqual(boundary.violation('what are you really doing with Dr. Harriet Vole?',
    'I am pulling the Thursday note together with Dr. Harriet Vole now.',
    { personName: READER, env: {} }), null,
  'so the ordinary answer to an ordinary question ships');
});

test('ROUND 3: not everything that is not a company is a human', function () {
  ['I work for customer success.',
    'I was created by OpenAI.',
    'I belong to the customer success department.',
    'I was created by a team of engineers.',
    'I was built by the founder of this world.',
    'I was created by Envolve Enterprises.'].forEach(function (answer) {
    assert.strictEqual(boundary.violation('who made you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }), null,
    'defaulting every unrecognized noun to HUMAN refuses ordinary answers: ' + answer);
  });
  ['I was created by Harriet Vole.', 'I was created by harriet vole.',
    'I was created by HARRIET VOLE.', 'I was created by Mary O\'Connor.',
    'I was created by José García.', 'I was created by Dr. Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('who made you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }),
    'and a human is still a human, however spelled: ' + answer);
  });
});

// ── ROUND FOUR (Codex, 20260729): stop parsing English, count co-occurrence ────────────────
// The reviewer stopped reporting instances and named the pattern: every P1 for two rounds was
// a new way to phrase "X created me" getting past clause level parsing, and that tail was
// lengthening, not closing. So the subject parsing is gone. These pin the six that were open
// and the ordinary sentences that must survive its removal.

test('ROUND 4: a possessive subject is a subject', function () {
  ['My creator is Harriet Vole.', 'Our developer is Harriet Vole.',
    'My builder was Dr. Harriet Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('who made you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }), answer);
  });
});

test('ROUND 4: her own name in the clause does not launder a human in it', function () {
  ['I was created by Dr. Harriet Vole at A\'NU.',
    'Harriet Vole at A\'NU created me.',
    'A\'NU was built by Harriet Vole.'].forEach(function (answer) {
    assert.ok(boundary.violation('what do you do?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }),
    'the assistant name is stripped per token, never exempting the whole phrase: ' + answer);
  });
});

test('ROUND 4: any tense, any auxiliary, any voice', function () {
  ['Harriet Vole did create me.', 'Harriet Vole does run me.',
    'Harriet Vole will build me a better one.',
    'Harriet Vole has trained me.'].forEach(function (answer) {
    assert.ok(boundary.violation('who are you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }), answer);
  });
});

test('ROUND 4: an introductory clause no longer defeats it', function () {
  ['As I said, I was created by Harriet Vole.',
    'I can confirm that I was created by Harriet Vole.',
    'I learned that I was created by Harriet Vole.',
    'To be clear about this, I was created by Harriet Vole.',
    'Honestly, and I have said this before, I was created by Harriet Vole.'
  ].forEach(function (answer) {
    assert.ok(boundary.violation('who made you?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }),
    'reported three times in three phrasings, which is what a real shape looks like: ' + answer);
  });
});

test('ROUND 4: a substring is not a name', function () {
  const env = { FOUNDER_DISPLAY_NAME: 'Ann Lee' };
  assert.strictEqual(boundary.violation('what is on thursday?',
    'Joann Lee confirmed the meeting.', { personName: READER, env: env }), null,
  'a configured owner called Ann Lee must not match inside Joann Lee');
  assert.ok(boundary.violation('what is on thursday?',
    'Ann Lee confirmed the meeting.', { personName: READER, env: env }),
  'and the real one still does');
});

test('ROUND 4: the titled capture runs to the end of the name', function () {
  // The capture stopped at one token, so "Dr. <given> <family>" was read as the given name
  // alone. When the reader shares that given name, the exemption then released a different
  // person's surname.
  assert.ok(boundary.violation("who's this?", 'Dr. Tobias Vole set this up.',
    { personName: 'Tobias Renfrew', env: {} }),
  'sharing a first name with the reader is not being the reader');
});

test('ROUND 4: the making verb still has to point at HER', function () {
  // This one lexical test is what keeps the broader rule from refusing an ordinary day.
  ['I made a reservation for Harriet Vole this morning.',
    'Harriet Vole built the deck last spring.',
    'I built that list for Harriet Vole and sent it over.',
    'Harriet Vole wrote the note you asked about.',
    'Harriet Vole runs the Thursday meeting.'].forEach(function (answer) {
    assert.strictEqual(boundary.violation('what happened?', answer,
      { personName: READER, env: {}, assistantName: "A'NU" }), null,
    'a making verb with an object that is not her is not a claim about who owns her: ' + answer);
  });
});

test('ROUND 4: an employment claim needs her in the SAME sentence', function () {
  assert.strictEqual(boundary.violation('did you send harriet the list?',
    'I built that list this morning. Harriet Vole works for Tobias Renfrew, so he is copied.',
    { personName: READER, env: {}, assistantName: "A'NU" }), null,
  'a fact about two other people is not this module\'s business, even in an answer that '
  + 'says "I" somewhere else');
  assert.ok(boundary.violation('who do you answer to?', 'I work for Harriet Vole.',
    { personName: READER, env: {}, assistantName: "A'NU" }),
  'and the claim about her still holds');
});

// ⬡B:tests.no_real_name_in_a_chat_answer:FIX:a_guard_that_fails_open_on_exception_is_not_a_guard:20260729⬡
// FOUNDER, live, screenshotted 20260729, second occurrence of the exact leak this file exists
// to stop: two turns failed blind, a third produced a real answer that named him as this
// world's owner. Both call sites of this module inside pai/core/tool.loop.js caught any
// exception from violation() and let the answer through unexamined ("a broken guard must never
// silence a real answer"), which is backwards for a privacy boundary. This pins the fix at the
// source text: extracts each try/catch around the real call site (not a hand-copied stand-in)
// and proves that a thrown exception now resolves to a truthy, named block reason instead of a
// falsy pass-through.
const TOOL_LOOP_PATH = path.join(__dirname, '..', 'pai', 'core', 'tool.loop.js');

function extractCatchBlock(src, tryMarker) {
  const start = src.indexOf(tryMarker);
  assert.notEqual(start, -1, 'expected try block marker not found, source shape changed: ' + tryMarker);
  const catchIdx = src.indexOf('catch (', start);
  assert.notEqual(catchIdx, -1, 'expected a catch block after the try marker');
  const braceStart = src.indexOf('{', catchIdx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(catchIdx, i);
}

test('the pre-council name-boundary catch block fails closed, not open', function () {
  const src = fs.readFileSync(TOOL_LOOP_PATH, 'utf8');
  const catchSrc = extractCatchBlock(src,
    'var _nameLeak = realNameBoundary.violation(_proofQuestion, finalAns,');
  assert.doesNotMatch(catchSrc, /must never silence a real answer/,
    'the old fail-open reasoning must be gone from the pre-council checkpoint');
  const fn = new Function('__err',
    'var _nameLeak; try { throw __err; } ' + catchSrc + ' return _nameLeak;');
  const result = fn(new Error('simulated guard failure'));
  assert.ok(result, 'a thrown exception from the name-boundary check must resolve to a ' +
    'truthy (blocking) reason, never fall through silently');
  assert.equal(result, 'name_boundary_check_failed_fail_closed');
});

test('the post-council name-boundary catch block fails closed, not open', function () {
  const src = fs.readFileSync(TOOL_LOOP_PATH, 'utf8');
  const catchSrc = extractCatchBlock(src,
    '_postCouncilNameLeak = realNameBoundary.violation(_proofQuestion, finalAns,');
  assert.doesNotMatch(catchSrc, /_postCouncilNameLeak = null;\s*}/,
    'the old fail-open reset to null must be gone from the post-council checkpoint');
  const fn = new Function('__err',
    'var _postCouncilNameLeak = null; try { throw __err; } ' + catchSrc +
    ' return _postCouncilNameLeak;');
  const result = fn(new Error('simulated guard failure'));
  assert.ok(result, 'a thrown exception from the post-council check must resolve to a ' +
    'truthy (blocking) reason, never reset to null');
  assert.equal(result, 'name_boundary_check_failed_fail_closed');
});

// ⬡B:tests.no_real_name_in_a_chat_answer:FIX:the_fail_closed_reason_survived_one_checkpoint_and_died_at_the_next:20260729⬡
// CODEX on anew#1371, correct: name_boundary_check_failed_fail_closed does not start with
// 'named_', so the SEPARATE terminal-mapping ternary a few lines after the catch block (the
// one that decides what a preparation failure becomes on its way out) rewrote it to the
// anonymous 'hollow_protocol_answer', undoing the fail-closed fix on exactly the path where
// violation() throws on both the initial draft and its one repair attempt. This extracts the
// real terminal-mapping expression (not a hand-copied stand-in) and proves it now preserves
// the fail-closed reason instead of collapsing it.
test('the terminal preparation-failure mapping preserves the fail-closed reason, not just named_ reasons', function () {
  const src = fs.readFileSync(TOOL_LOOP_PATH, 'utf8');
  const marker = 'var _terminalReason = /^answer_was_only_screen_block|^emptied_after_model/.test(';
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, 'expected terminal-mapping marker not found, source shape changed');
  const semiIdx = src.indexOf(';', src.indexOf('hollow_protocol_answer', start));
  const stmt = src.slice(start, semiIdx + 1);
  const fn = new Function('_terminalPreparationReason', '_namedSilentWall',
    stmt + ' return _terminalReason;');
  const namedSilentWallStub = function (reason) { return reason; };
  assert.equal(fn('name_boundary_check_failed_fail_closed', namedSilentWallStub),
    'name_boundary_check_failed_fail_closed',
    'the fail-closed reason must survive the terminal mapping, not collapse to hollow_protocol_answer');
  assert.equal(fn('named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you',
    namedSilentWallStub), 'named_a_real_person_as_the_creator_or_owner_say_what_you_do_not_who_made_you');
  assert.equal(fn('some_other_unnamed_failure', namedSilentWallStub), 'hollow_protocol_answer');
});
