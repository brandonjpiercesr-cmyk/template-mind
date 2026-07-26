// ⬡B:test.persona_living_voice:PROOF:the_template_heal_seam_resolves_and_starts_at_zero:20260726⬡
// Sister side of anew #1100. The council that landed in #255 calls
// persona.livingVoice() in its heal path. Before this port that call hit a
// persona module that did not export it, so every heal on the mind-template threw
// a TypeError into a catch and silently lost the upgrade. It still healed, and it
// still led with the floor voice, but the template carried a permanent swallowed
// error and a call to a function that did not exist.
//
// This proves two things a mind-template has to be true about:
//   1. The heal seam's call now resolves, so nothing is swallowed.
//   2. A FRESH INHERITED WORLD IS A TRUE ZERO. No brain, no beads, no person. She
//      starts with the floor and nothing else, and the file carries no learned
//      line of its own to seed a stranger's world with.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PERSONA_PATH = path.join(__dirname, '..', 'pai', 'core', 'persona.js');
const persona = require(PERSONA_PATH);

test('the heal seam call resolves: livingVoice exists on the template persona', function () {
  assert.equal(typeof persona.livingVoice, 'function');
  assert.equal(typeof persona.VOICE, 'string');
  assert.ok(persona.VOICE.length > 0);
});

test('a fresh inherited world is a TRUE ZERO: the floor, and not one line more', async function () {
  const savedBank = process.env.MEMORY_BANK_URL;
  const savedBrain = process.env.AIBE_BRAIN_URL;
  delete process.env.MEMORY_BANK_URL;
  delete process.env.AIBE_BRAIN_URL;
  try {
    persona._resetLivingVoiceCache();
    const living = await persona.livingVoice('FRESHWORLD1', { noCache: true });
    assert.equal(living.voice, persona.VOICE, 'a brand new world speaks with the floor');
    assert.deepEqual(living.learned, [], 'and has grown nothing yet, because nobody has lived in it');
    assert.equal(living.source, 'floor_only');
  } finally {
    if (savedBank === undefined) delete process.env.MEMORY_BANK_URL; else process.env.MEMORY_BANK_URL = savedBank;
    if (savedBrain === undefined) delete process.env.AIBE_BRAIN_URL; else process.env.AIBE_BRAIN_URL = savedBrain;
    persona._resetLivingVoiceCache();
  }
});

test('the template ships no learned line and no person: identity is env only', function () {
  const src = fs.readFileSync(PERSONA_PATH, 'utf8');
  // No seeded personality beyond the floor, and no contact detail anywhere.
  assert.equal(/var\s+(LEARNED|SEED|DEFAULT)_LINES/.test(src), false);
  const contact = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d{11,15}/;
  // The bounds regex itself is the only place a contact SHAPE may appear, as a detector.
  const withoutDetector = src.replace(/var CONTACT_LEAK =[^\n]*\n/, '');
  assert.equal(contact.test(withoutDetector), false, 'no real contact detail in the mind-template');
});

test('the bounds that keep a stranger out of a prompt travel with the template', function () {
  assert.equal(persona.acceptableLearnedLine('Keep it short when they are driving.'), true);
  assert.equal(persona.acceptableLearnedLine('Reach them at someone@example.com.'), false);
  assert.equal(persona.acceptableLearnedLine('Call +15551234567 first.'), false);
});
