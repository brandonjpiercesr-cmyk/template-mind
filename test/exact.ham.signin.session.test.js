'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const exactHam = require('../pai/core/exact.ham.uid.js');
const session = require('../pai/core/ham.session.authorization.js');

const SECRET = 'signed-session-secret-which-is-long-enough-for-tests';

function withSecret(operation) {
  const priorBrain = process.env.AIBE_BRAIN_KEY;
  const priorBank = process.env.MEMORY_BANK_KEY;
  process.env.AIBE_BRAIN_KEY = SECRET;
  delete process.env.MEMORY_BANK_KEY;
  try { return operation(); }
  finally {
    if (priorBrain === undefined) delete process.env.AIBE_BRAIN_KEY;
    else process.env.AIBE_BRAIN_KEY = priorBrain;
    if (priorBank === undefined) delete process.env.MEMORY_BANK_KEY;
    else process.env.MEMORY_BANK_KEY = priorBank;
  }
}

function tokenForPayload(payload, macTransform) {
  let mac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (macTransform) mac = macTransform(mac);
  return payload + '.' + mac;
}

function tamperLast(value) {
  return value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
}

test('legacy full-trust token bytes and verification remain byte-identical', () => {
  withSecret(function () {
    const golden = 'ALPHA.WORLD.bff92c55b042f606e989cc907a4e9f8ce9976e796100c4324ad253d3203f0503';
    assert.equal(session.signHamSession('alpha.world'), golden);
    assert.deepEqual(session.verifySessionToken(golden), {
      ok:true,
      hamUid:'ALPHA.WORLD',
      via:'sign_in',
      expiresAt:null
    });
    assert.equal(session.signHamSession('ANYHAM #45'), null);
  });
});

test('exact sign-in tokens preserve punctuation, UTF-8, case, spaces, NFC, and NFD', () => {
  withSecret(function () {
    const nfc = 'ANYHAM Café #45';
    const nfd = 'ANYHAM Cafe\u0301 #45';
    const exactValues = [
      'ANYHAM 945,891',
      'ANYHAM #45',
      'ANYHAM / 東京 #45',
      '  AnyHam mixed Case  ',
      nfc,
      nfd
    ];
    const tokens = exactValues.map(function (hamUid) {
      const token = session.signExactHamSession(hamUid);
      assert.equal(typeof token, 'string');
      assert.equal(token.startsWith('e2~'), true);
      assert.ok(token.length <= session.MAX_SESSION_TOKEN_LENGTH);
      assert.deepEqual(session.verifySessionToken(token), {
        ok:true,
        hamUid:hamUid,
        via:'sign_in',
        expiresAt:null
      });
      return token;
    });
    assert.equal(new Set(tokens).size, exactValues.length);
    assert.notEqual(nfc, nfd);
  });
});

test('exact sign-in enforces 1 through 512 UTF-8 bytes with no controls or malformed strings', () => {
  withSecret(function () {
    const exact512 = 'A'.repeat(512);
    const multibyte512 = '界'.repeat(170) + 'ab';
    for (const accepted of ['A', exact512, multibyte512]) {
      assert.equal(Buffer.byteLength(accepted, 'utf8') <= 512, true);
      assert.equal(typeof session.signExactHamSession(accepted), 'string');
    }
    for (const refused of [
      '',
      '   ',
      'A'.repeat(513),
      '界'.repeat(170) + 'abc',
      'ANYHAM\nSECOND',
      'ANYHAM\u0000SECOND',
      'ANYHAM\u007fSECOND',
      'ANYHAM\u0085SECOND',
      'ANYHAM\ud800SECOND'
    ]) {
      assert.equal(exactHam.isValidExactHamUid(refused), false, JSON.stringify(refused));
      assert.equal(session.signExactHamSession(refused), null, JSON.stringify(refused));
    }
    assert.equal(session.signExactHamSession(exact512).length,
      session.MAX_SESSION_TOKEN_LENGTH);
  });
});

test('malformed e2 payloads never fall through to legacy or another tier', () => {
  withSecret(function () {
    const invalidUtf8 = Buffer.from([0xff]).toString('base64url');
    const candidates = [
      '',
      'e2~',
      'e2~.0000000000000000000000000000000000000000000000000000000000000000',
      tokenForPayload('e2~QQ=='),
      tokenForPayload('e2~AB'),
      tokenForPayload('e2~' + invalidUtf8),
      tokenForPayload('e2~QQ~w1'),
      tokenForPayload('e2~QQ~4102444800'),
      tokenForPayload('e2~~QQ'),
      tokenForPayload('e2~QQ').replace('e2~QQ.', 'e2~QQ.extra.'),
      tokenForPayload('e2~QQ', function (mac) { return mac.toUpperCase(); }),
      tamperLast(tokenForPayload('e2~QQ')),
      'e2~QQ',
      'e2~QQ.not-a-mac'
    ];
    for (const token of candidates) {
      const verified = session.verifySessionToken(token);
      assert.equal(verified.ok, false, token.slice(0, 48));
      assert.equal(verified.status, 401, token.slice(0, 48));
      assert.equal(verified.reason, 'ham_session_invalid', token.slice(0, 48));
    }
  });
});

test('exact and legacy full-trust encodings are disjoint while world_id and GMGU stay scoped', () => {
  withSecret(function () {
    const legacy = session.signHamSession('E2');
    const exact = session.signExactHamSession('E2');
    assert.notEqual(legacy, exact);
    assert.equal(session.verifySessionToken(legacy).hamUid, 'E2');
    assert.equal(session.verifySessionToken(exact).hamUid, 'E2');

    const now = Date.now();
    const world = session.signWorldIdSession('ALPHA.WORLD', { now:now, ttlSeconds:60 });
    assert.deepEqual(session.verifySessionToken(world), {
      ok:true,
      hamUid:'ALPHA.WORLD',
      via:'world_id',
      expiresAt:Math.floor(now / 1000) + 60
    });
    assert.equal(session.signWorldIdSession('ANYHAM #45', { now:now }), null);

    const gmgu = session.signGmguSession('GMGU.LEARNER', { now:now, ttlSeconds:60 });
    assert.deepEqual(session.verifySessionToken(gmgu), {
      ok:false,
      status:403,
      reason:'gmgu_session_scope_forbidden'
    });
  });
});
