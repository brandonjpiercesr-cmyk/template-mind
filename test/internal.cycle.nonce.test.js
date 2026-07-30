'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const nonce = require('../pai/core/internal.cycle.nonce.js');

test('nonce claim uses no raw nonce and a second claimant is refused by durable arbitration', async function () {
  const seen = new Set();
  const proof = { ok:true, payload:{ ham_uid:'HAM.TEST',
    nonce:'a.machine.proof.nonce.123456', expires_at:Date.now() + 60000 } };
  const claimTask = async function (source) {
    assert.equal(source.includes(proof.payload.nonce), false);
    if (seen.has(source)) return false;
    seen.add(source);
    return true;
  };
  const first = await nonce.consume(proof, { claimTask:claimTask });
  const second = await nonce.consume(proof, { claimTask:claimTask });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'internal_cycle_proof_replayed');
});

test('claim-store failure closes the privileged door', async function () {
  const out = await nonce.consume({ ok:true, payload:{ ham_uid:'HAM.TEST',
    nonce:'another.machine.nonce.1234', expires_at:Date.now() + 60000 } }, {
    claimTask:async function () { throw new Error('bank unavailable'); }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 503);
  assert.equal(out.reason, 'internal_cycle_nonce_claim_unavailable');
});
