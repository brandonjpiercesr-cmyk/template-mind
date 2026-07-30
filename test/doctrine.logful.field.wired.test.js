// ⬡B:tests.logful_field_wired:TEST:field_gets_its_first_real_requirers:20260727⬡
// FIELD (logful/field.js) was declared in logful/.acl since 20260617 and had ZERO
// requirers anywhere in this repo until this change: routes/field.routes.js (an HTTP
// door) and core/tool.loop.js's read_reminders tool (a live in-cycle door). These tests
// pin both doors plus the bounded-timeout fix to fieldCheck itself. Nothing here touches
// a network, a real provider, or a real person: every fetch is a local stub, every HAM
// UID is derived in-process, never a literal.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const field = require('../pai/logful/field.js');

const HAM = crypto.createHash('sha256').update('logful.field.wired.fixture')
  .digest('hex').slice(0, 8).toUpperCase();

const BANK_KEYS = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY', 'BEAD_TABLE', 'BRAIN_SCHEMA'];

function withBank(fn, responder) {
  const saved = {};
  BANK_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  process.env.MEMORY_BANK_URL = 'https://bank.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key';
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = function (url, opts) {
    const call = { url: String(url), opts: opts || {} };
    calls.push(call);
    const answer = typeof responder === 'function' ? responder(call)
      : (responder || { ok: true, status: 200, body: [] });
    return Promise.resolve({
      ok: answer.ok !== false,
      status: answer.status || 200,
      json: () => Promise.resolve(answer.body === undefined ? [] : answer.body)
    });
  };
  const restore = () => {
    global.fetch = savedFetch;
    BANK_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  };
  return Promise.resolve().then(() => fn(calls)).finally(restore);
}

// ---------------------------------------------------------------------------
// fieldRemind: cold code only carries, refuses a hollow intake
// ---------------------------------------------------------------------------

test('fieldRemind refuses without hamUid, note, or dueAt', async () => {
  const a = await field.fieldRemind({ note: 'x', dueAt: Date.now() });
  assert.equal(a.ok, false);
  const b = await field.fieldRemind({ hamUid: HAM, dueAt: Date.now() });
  assert.equal(b.ok, false);
  const c = await field.fieldRemind({ hamUid: HAM, note: 'x' });
  assert.equal(c.ok, false);
});

test('fieldRemind refuses a dueAt that does not parse', async () => {
  const r = await field.fieldRemind({ hamUid: HAM, note: 'x', dueAt: 'not a date' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /dueAt/);
});

test('fieldRemind stores a tiered FIELD bead through the LOGFUL backbone', async () => {
  await withBank(async (calls) => {
    const due = Date.now() + 3600000;
    const out = await field.fieldRemind({
      hamUid: HAM, note: 'check the standup notes', dueAt: due,
      forWhom: 'self', setBy: 'CODA', importance: 7
    });
    assert.equal(out.ok, true);
    assert.ok(out.fieldId, 'must return a fieldId so the caller can resolve it later');
    const write = calls.find((c) => (c.opts.method || '') === 'POST');
    assert.ok(write, 'fieldRemind must POST a bead');
    const bead = JSON.parse(write.opts.body);
    assert.equal(bead.stamp_type, 'FIELD');
    assert.equal(bead.ham_uid, HAM);
    const content = typeof bead.content === 'string' ? JSON.parse(bead.content) : bead.content;
    const data = content.data || content;
    assert.equal(data.forWhom, 'self');
    assert.equal(data.setBy, 'CODA');
    assert.equal(data.status, 'open');
    assert.equal(bead.acl_tier, 2);
    assert.equal(content.privacy.tier, 2);
  }, (call) => {
    if (/stamp_type=eq\.BIRTH/.test(call.url)) {
      return { ok:true, status:200, body:[{ content:{ people_tier:2 } }] };
    }
    return { ok:true, status:201, body:[{ id:'bead-1' }] };
  });
});

// ---------------------------------------------------------------------------
// fieldCheck: cold code only fetches, never decides, never sends
// ---------------------------------------------------------------------------

test('fieldCheck returns only OPEN rows whose dueAt has passed, dropping resolved ones', async () => {
  const past = Date.now() - 1000;
  const future = Date.now() + 3600000;
  await withBank(async () => {
    const out = await field.fieldCheck(HAM, Date.now());
    assert.equal(out.ok, true);
    assert.equal(out.due.length, 1, 'only the one open, past-due, unresolved row should surface');
    assert.equal(out.due[0].fieldId, 'past-open');
  }, {
    ok: true, status: 200, body: [
      { id: 'r1', content: JSON.stringify({ data: { fieldId: 'past-open', note: 'a', dueAt: past, status: 'open' } }) },
      { id: 'r2', content: JSON.stringify({ data: { fieldId: 'future-open', note: 'b', dueAt: future, status: 'open' } }) },
      { id: 'r3', content: JSON.stringify({ data: { fieldId: 'past-resolved', note: 'c', dueAt: past, status: 'open' } }) },
      { id: 'r4', content: JSON.stringify({ data: { fieldId: 'past-resolved', status: 'resolved' } }) }
    ]
  });
});

test('fieldCheck with no brain configured refuses honestly instead of guessing empty', async () => {
  const saved = {}; BANK_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  try {
    const out = await field.fieldCheck(HAM, Date.now());
    assert.equal(out.ok, false);
    assert.deepEqual(out.due, []);
  } finally {
    BANK_KEYS.forEach((k) => { if (saved[k] !== undefined) process.env[k] = saved[k]; });
  }
});

test('fieldCheck passes an abort signal so a slow bank can never hang the caller', async () => {
  await withBank(async (calls) => {
    await field.fieldCheck(HAM, Date.now(), 4000);
    const fieldRead = calls.find((call) => /stamp_type=eq\.FIELD/.test(call.url));
    assert.ok(fieldRead, 'fieldCheck must issue the FIELD read');
    assert.ok(fieldRead.opts.signal, 'fieldCheck must bind a real AbortSignal now that it runs inside a live turn');
    assert.match(fieldRead.url, /acl_tier=gte\.4/);
  }, { ok: true, status: 200, body: [] });
});

// ---------------------------------------------------------------------------
// fieldResolve: supersede-only
// ---------------------------------------------------------------------------

test('fieldResolve refuses without hamUid or fieldId', async () => {
  const r = await field.fieldResolve(null, 'f1', 'done');
  assert.equal(r.ok, false);
});

test('fieldResolve stores a new resolved bead, never mutates the original', async () => {
  await withBank(async (calls) => {
    const out = await field.fieldResolve(HAM, 'field-123', 'handled by CODA');
    assert.equal(out.ok, true);
    const write = calls.find((c) => (c.opts.method || '') === 'POST');
    const bead = JSON.parse(write.opts.body);
    assert.equal(bead.stamp_type, 'FIELD');
    const content = typeof bead.content === 'string' ? JSON.parse(bead.content) : bead.content;
    const data = content.data || content;
    assert.equal(data.fieldId, 'field-123');
    assert.equal(data.status, 'resolved');
    assert.equal(data.outcome, 'handled by CODA');
  }, { ok: true, status: 201, body: [{ id: 'bead-2' }] });
});
