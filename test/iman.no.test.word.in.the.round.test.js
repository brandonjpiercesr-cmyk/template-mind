// ⬡B:test.iman_no_test_word:TEST:the_template_every_world_inherits_is_clean:20260726⬡
// This repo is the mind-template every world inherits, so what ships here is what a
// stranger's world starts with. Until 20260726 it shipped the founder's own named defect:
// pai/reach/iman.js founderTestEnvelope decorated the round that goes to him with the word
// test three times in one return, and made the word MANDATORY against the council-approved
// subject. His doctrine says it three separate ways: a test email NEVER contains the word
// test, never have tests in them, and writing the word into his system has broken things.
//
// This test holds the template at zero. It reads the module directly, with no network and
// no council, because the envelope is pure and the law is deterministic.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const IMAN = path.join(__dirname, '..', 'pai', 'reach', 'iman.js');
const TEST_WORD = /\btest(s|ed|ing)?\b/i;

function withEnv(changes, fn) {
  const keys = Object.keys(changes);
  const previous = {};
  keys.forEach(function (k) { previous[k] = process.env[k]; });
  Object.assign(process.env, changes);
  try { return fn(); }
  finally {
    keys.forEach(function (k) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    });
  }
}

test('the round to him carries the real subject and the real person, and never the word test', function () {
  delete require.cache[require.resolve(IMAN)];
  const iman = require(IMAN);
  withEnv({ REACH_SEND_MODE: 'FOUNDER_TEST', FOUNDER_TEST_EMAIL: 'him@example.org' }, function () {
    const envelope = iman.founderTestEnvelope(
      [{ email: 'will@example.org', name: 'Will' }],
      'The field agreement for next season',
      { founderTest: true });

    assert.equal(envelope.ok, true, envelope.reason);
    // the subject is his, byte for byte, undecorated
    assert.equal(envelope.subject, 'The field agreement for next season');
    assert.equal(TEST_WORD.test(envelope.subject), false);
    // the address is his, the name is the person it reads as if it went to
    assert.deepEqual(envelope.to, [{ email: 'him@example.org', name: 'Will' }]);
    assert.equal(TEST_WORD.test(envelope.to[0].name), false);
    // and the word is not made mandatory against anything
    assert.equal('requiredApprovedSubjectPrefix' in envelope, false,
      'the retired mandatory test prefix is back in the template');
    // the real recipient is carried out so the approval round knows who it was for
    assert.deepEqual(envelope.intendedRecipients, [{ email: 'will@example.org', name: 'Will' }]);
  });
});

test('the boundary refuses any system-added marker instead of requiring one', function () {
  delete require.cache[require.resolve(IMAN)];
  const iman = require(IMAN);
  const guard = iman._test.requireNoSystemTestMarker;

  const clean = guard('The field agreement',
    { subject: 'The field agreement', founderTest: true },
    [{ email: 'him@example.org', name: 'Will' }]);
  assert.equal(clean.ok, true);

  const decorated = guard('The field agreement',
    { subject: '[A NEW test] The field agreement', founderTest: true },
    [{ email: 'him@example.org', name: 'Will' }]);
  assert.equal(decorated.ok, false);
  assert.equal(decorated.reason, 'test_round_altered_the_subject');

  const named = guard('The field agreement',
    { subject: 'The field agreement', founderTest: true },
    [{ email: 'him@example.org', name: 'Founder (test)' }]);
  assert.equal(named.ok, false);
  assert.equal(named.reason, 'test_word_in_system_display_name');
});

test('an outbound attachment normalizes into the provider shape, and a deck must ship as a PDF', async function () {
  delete require.cache[require.resolve(IMAN)];
  const iman = require(IMAN);
  const bytes = Buffer.from('%PDF-1.7\nflat so the design cannot move\n%%EOF');

  const ok = await iman.normalizeAttachments([
    { filename: 'agreement.pdf', content_type: 'application/pdf', base64: bytes.toString('base64') }
  ]);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.attachments[0].filename, 'agreement.pdf');
  assert.equal(Buffer.from(ok.attachments[0].content, 'base64').equals(bytes), true);
  assert.equal(ok.manifest[0].bytes, bytes.length);
  assert.match(ok.manifest[0].sha256, /^[0-9a-f]{64}$/);

  const deck = await iman.normalizeAttachments([
    { filename: 'agreement.pptx', base64: bytes.toString('base64') }
  ]);
  assert.equal(deck.ok, false);
  assert.equal(deck.reason, 'presentation_must_ship_as_pdf:agreement.pptx');

  const none = await iman.normalizeAttachments(undefined);
  assert.deepEqual(none, { ok: true, attachments: [], manifest: [] });
});
