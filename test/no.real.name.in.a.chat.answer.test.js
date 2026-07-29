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
  const roleEnv = { FOUNDER_DISPLAY_NAME: 'the founder' };
  assert.deepStrictEqual(boundary.configuredIdentityNames(roleEnv), [],
    'a role is not a person and must never become one');
  assert.strictEqual(boundary.violation('who are you?',
    'I answer to the founder of this world and I keep it running for you.',
    { personName: READER, env: roleEnv }), null,
  'a role in the answer is a role, and it ships');
});
