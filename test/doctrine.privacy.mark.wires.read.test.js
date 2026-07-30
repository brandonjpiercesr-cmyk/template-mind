// ⬡B:tests.privacy_mark_wires_read_path:TEST:a_mark_that_does_nothing_is_a_hollow_receipt:20260727⬡
// FOUND BY CODEX on anew #1174, confirmed by hand. core/privacy.WONDER.classification mark()
// wrote a separate PRIVACY_MARK receipt bead but joined NOTHING back to the target: core/find.js
// and board/pam/pam.js inspect only the target row's acl_tier column and content.privacy
// envelope. So the founder got ok:true after marking a fact private while a world read treated
// it exactly as before, and a fact marked sanctioned stayed invisible. That is a hollow receipt,
// a privacy promise that does nothing, which this estate's law forbids (ok:false over hollow).
//
// The cure wires the mark into the actual read path: mark() now applies the envelope to the
// target bead's own acl_tier and content.privacy, the same two fields the write path already
// mirrors and migration 0004 backfills, so the existing structural filter and pamRelease honor
// it. Every assertion below FAILS on the pre-fix mark() (target untouched) and PASSES with the
// wiring.
//
// IDENTITY ENV-ONLY: the HAM is an invented test string and the "facts" are invented for a
// fictional owner. No real person, money, employer or family member appears here.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const wonder = require(path.join(ROOT, 'pai', 'core', 'privacy.WONDER.classification.20260726.js'));
const tiers = require(path.join(ROOT, 'pai', 'core', 'privacy', 'people.tier.js'));

const HAM = 'HAM.MARKWIRE.ONE';

function withBrain(seed, fn) {
  const prior = {};
  const env = { AIBE_BRAIN_URL: 'https://brain.test.invalid', AIBE_BRAIN_KEY: 'test-key',
    BEAD_TABLE: 'aibe_brain', MEMORY_BANK_URL: undefined, MEMORY_BANK_KEY: undefined,
    BRAIN_SCHEMA: undefined };
  Object.keys(env).forEach(function (k) {
    prior[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  });
  const realFetch = global.fetch;
  const store = new Map(seed);
  const posted = [];
  global.fetch = async function (url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    const params = new URLSearchParams(u.split('?')[1] || '');
    const srcParam = params.get('source');
    const source = srcParam ? decodeURIComponent(srcParam.replace(/^eq\./, '')) : null;
    const idParam = params.get('id');
    const id = idParam ? decodeURIComponent(idParam.replace(/^eq\./, '')) : null;
    function byId() {
      for (const row of store.values()) if (String(row.id) === String(id)) return row;
      return null;
    }
    if (method === 'POST') {
      const bead = JSON.parse(init.body);
      posted.push(bead);
      store.set(bead.source, { id: store.size + 1, ham_uid: bead.ham_uid, source: bead.source,
        content: bead.content, acl_tier: bead.acl_tier });
      return { ok: true, status: 201, text: async () => '', json: async () => [] };
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const row = source ? store.get(source) : byId();
      if (row) { row.content = patch.content; row.acl_tier = patch.acl_tier; }
      return { ok: true, status: 200, text: async () => '', json: async () => row ? [row] : [] };
    }
    const row = source ? store.get(source) : (id ? byId() : null);
    return { ok: true, json: async () => (row ? [row] : []) };
  };
  return Promise.resolve().then(function () { return fn(store, posted); }).finally(function () {
    Object.keys(prior).forEach(function (k) {
      if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k];
    });
    global.fetch = realFetch;
  });
}

test('marking a fact private RETRACTS its visibility on the target itself, not just a receipt', async function () {
  // A fact previously classified sanctioned at T2, so a T2 world could read it. Legacy content
  // shape: a JSON string, to exercise that branch of the merge.
  const priorEnv = tiers.buildEnvelope('sanctioned', 2, 'was openable to the company', 'founder_mark');
  const target = { id: 1, ham_uid: HAM, source: 'fact.formerly.sanctioned',
    content: JSON.stringify({ text: 'the sensitive detail', privacy: priorEnv }), acl_tier: 2 };

  await withBrain([[target.source, target]], async function (store, posted) {
    const out = await wonder.mark({ hamUid: HAM, target: target.source, text: 'the sensitive detail',
      founderMark: 'private' });

    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.enforced, true, 'the mark must report that it is actually enforced on reads');
    assert.ok(posted.some(function (b) { return b.stamp_type === 'PRIVACY_MARK'; }),
      'the receipt bead is still written, supersede never delete');

    // THE TARGET ITSELF changed, which is what the read path reads. Pre-fix it stayed T2.
    const row = store.get(target.source);
    assert.equal(row.acl_tier, 0, 'private is T0, and a T2 world can no longer select it');
    const content = JSON.parse(row.content);
    assert.equal(content.privacy.mark, 'private', 'the envelope on the fact itself now says private');

    // And the read-path readers agree, reading only the target row.
    const env = tiers.envelopeOf(row);
    assert.equal(env.mark, 'private');
    assert.equal(tiers.visibleTo(env, 2), false, 'a T2 world must no longer see the now-private fact');
    assert.equal(tiers.structuralFilter(2), 'acl_tier=gte.2',
      'and the database predicate drops acl_tier 0 for a T2 reader');
  });
});

test('marking a fact sanctioned SURFACES it, so the receipt is no longer a promise that does nothing', async function () {
  // An unclassified fact: acl_tier NULL, invisible to every non-founder world. jsonb content shape.
  const target = { id: 1, ham_uid: HAM, source: 'fact.unclassified',
    content: { text: 'a doctrine the owner wants the team to dig up' }, acl_tier: null };

  await withBrain([[target.source, target]], async function (store) {
    const out = await wonder.mark({ hamUid: HAM, target: target.source,
      text: 'a doctrine the owner wants the team to dig up', founderMark: 'sanctioned', founderTier: 3 });

    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.enforced, true);

    const row = store.get(target.source);
    assert.equal(row.acl_tier, 3, 'a sanctioned fact must actually become visible to its tier');
    assert.equal(row.content.privacy.mark, 'sanctioned');
    const env = tiers.envelopeOf(row);
    assert.equal(tiers.visibleTo(env, 3), true, 'a T3 world can now dig this up, which was the whole point');
  });
});

test('a mark whose target cannot be found is honest ok:false, never a hollow ok:true', async function () {
  await withBrain([], async function () {
    const out = await wonder.mark({ hamUid: HAM, target: 'fact.does.not.exist', text: 'x',
      founderMark: 'private' });
    assert.equal(out.ok, false, 'no target, no enforced mark, no false promise');
    assert.equal(out.enforced, false);
    assert.equal(out.reason, 'mark_target_not_found');
  });
});

test('a duplicate source is ambiguous and cannot PATCH more than one fact', async function () {
  await withBrain([], async function () {
    let patched = 0;
    const env = tiers.buildEnvelope('private', 0, 'founder marked this private', 'founder_mark');
    const out = await wonder.applyEnvelopeToTarget(HAM, 'fact.duplicate', env, {fetch:async function (_url, init) {
      if (init && init.method === 'PATCH') patched++;
      return {ok:true,status:200,json:async function () { return [
        {id:1,content:{text:'a'},acl_tier:2}, {id:2,content:{text:'b'},acl_tier:2}
      ]; }};
    }});
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'mark_target_ambiguous');
    assert.equal(patched, 0, 'ambiguity must refuse before any PATCH');
  });
});

test('a successful PATCH response without exact stored envelope readback is not enforced', async function () {
  await withBrain([], async function () {
    const prior = tiers.buildEnvelope('sanctioned', 2, 'old', 'founder_mark');
    const target = {id:7,ham_uid:HAM,source:'fact.noop',content:{text:'x',privacy:prior},acl_tier:2};
    let calls = 0;
    const env = tiers.buildEnvelope('private', 0, 'founder marked this private', 'founder_mark');
    const out = await wonder.applyEnvelopeToTarget(HAM, target.source, env, {fetch:async function (_url, init) {
      calls++;
      if (init && init.method === 'PATCH') return {ok:true,status:200,json:async function () { return [target]; }};
      return {ok:true,status:200,json:async function () { return [target]; }};
    }});
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'mark_target_readback_unverified');
    assert.equal(calls, 3, 'select, exact PATCH, and independent exact GET all ran');
  });
});
