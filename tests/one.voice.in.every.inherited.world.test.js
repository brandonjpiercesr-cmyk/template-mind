// ⬡B:tests.one_voice:REGRESSION:a_new_world_is_born_knowing_only_her_name:20260729⬡
// entered via the ABAHAM door, serving channel internal. No network, no spend, no real person.
//
// FOUNDER, 20260729, reading his own chat on the live world:
//   "Why am I seeing CARA in my life? Why am I seeing NOVA inside of the chat? Why am I seeing
//    agent names? ... The entire app should always be A'NU talking as a life assistant to the
//    HAM. That's it."
//
// THIS IS THE MIND-TEMPLATE, so what this file measures is what a world INHERITS on its first
// day. pai/core/persona.js scrubToAnu is the last thing between a composed reply and a person,
// and its list held five retired names and not one live adviser, so every world was born unable
// to catch the exact name he read.
//
// It is not a taste gate and it grades no sentence. It measures two hard facts about characters,
// and the second one is what keeps this gate honest: scrubToAnu REPLACES what it finds with her
// name, so a name that is also an ordinary English word would wreck honest copy.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const persona = require(path.join(ROOT, 'pai', 'core', 'persona.js'));
const readerVoice = require(path.join(ROOT, 'pai', 'core', 'reader.voice.js'));

test('no internal name survives her own mouth in an inherited world', function () {
  // Each of these opens a standing directive in an adviser seed, so the model is handed the
  // name and announces it. NOVA is the one the founder read.
  ['NOVA', 'Nova', 'CARA', 'Cara', 'NURA', 'LUMA', 'VARA', 'JOBA', 'WALCA'].forEach(function (n) {
    const out = persona.scrubToAnu('Let me get ' + n + ' to look at that for you.');
    assert.ok(out.indexOf(n) === -1, n + ' reached a person in something she said: ' + out);
    assert.match(out, /A'NU/);
  });
  // The retired names it already caught still get caught. Supersede, never delete.
  ['ABAHAM', 'OVERSEER', 'EANEW', 'CANEW', 'MANEW', 'ABA'].forEach(function (n) {
    assert.ok(persona.scrubToAnu('Ask ' + n + '.').indexOf(n) === -1, n + ' still scrubs');
  });
});

test('every never-ordinary-English name in the roster is actually scrubbed', function () {
  // The list is the contract. If a name is added to reader.voice.js and the scrub stops
  // covering it, this fails rather than waiting for a founder to read it on a screen.
  readerVoice.AGENT_NAMES_ANY_CASE.forEach(function (n) {
    assert.ok(persona.scrubToAnu('Ask ' + n + ' about it.').indexOf(n) === -1,
      n + ' is declared internal and is not scrubbed from her mouth');
  });
});

test('a scrubber that REPLACES must never touch an ordinary English word', function () {
  // The shouted-English tier of the roster is deliberately NOT collapsed here, because these
  // sentences must survive byte for byte. Those names are fixed where they are handed out, in
  // the seed directives, not in her mouth.
  const FINE = [
    'Blend the mixture until it is smooth.',
    'Roam the site and see what you like.',
    'Your ledger balances to the penny.',
    'The ham is in the fridge.',
    'There is a shadow on the left side of the photo.',
    'Nash scored twice last night.'
  ];
  for (const line of FINE) {
    assert.equal(persona.scrubToAnu(line), line, 'an honest sentence came back changed: ' + line);
  }
});

test('the detector catches the lines the founder read, and leaves warm copy alone', function () {
  assert.ok(!readerVoice.isClean('Cara is on the other side of this door'));
  assert.ok(!readerVoice.isClean('Twenty-five items are waiting and the desk already has work on it'));
  assert.ok(readerVoice.isClean('Everything you need is already open.'));
  assert.ok(readerVoice.isClean('Nothing is urgent right now. Take the quiet while you have it.'));
});
