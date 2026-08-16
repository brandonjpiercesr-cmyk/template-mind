// ⬡B:test.brain_client_answer_is_not_rows:TEST:an_unreadable_body_is_never_zero_rows:20260815⬡
// THE DEFECT THESE TESTS PIN THE CURE FOR. pai/core/brain.client.js#readBead used to end
// `return Array.isArray(data) ? data : (data.rows || [])`, so a 200 carrying anything that was
// not a list was flattened to an EMPTY ARRAY and handed to the caller as "there are no rows."
// Every reader in this world that asks "does this record exist" got NO where the truth was
// I COULD NOT TELL. This repository is the mind-template every world inherits, so that defect
// was not one door in one deploy: it was the door every new world is born holding.
//
// THESE FIXTURES ARE THE REAL WORLD ON PURPOSE. The object body is a genuine PostgREST error
// envelope ({"code":"PGRST301","message":"JWT expired"}), which is exactly what this door meets
// when a service key expires mid-flight and PostgREST answers 200 on a schema-cache path. Both
// real read paths are driven, not just the convenient one: readBead only uses the bounded reader
// when a caller passes maxBytes, and almost no caller in this repository does, so the plain
// response.json() path is the one this world actually runs and it is tested first.
//
// NO REAL PERSON APPEARS IN ANY FIXTURE HERE. This repository is a TRUE ZERO: the ham used below
// is an obviously synthetic placeholder and the source addresses name no one.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const brain = require('../pai/core/brain.client.js');

// A placeholder ham that is a shape, never a person. Identity is env-only in this world; a test
// fixture is not an exception to that law, it is the first place it gets broken.
const PLACEHOLDER_HAM = 'HAM-PLACEHOLDER-TEST';
const PLACEHOLDER_SOURCE = 'AGENT.PLACEHOLDER.capability';

// The four bodies this door cannot read, and beside them the one that is a real measurement of
// zero. A test that only proved the unreadable ones throw would not prove the distinction, so the
// empty array is carried through every case below.
const UNREADABLE_BODIES = [
  ['a PostgREST error envelope', { code: 'PGRST301', message: 'JWT expired' }],
  ['a bare string', 'JWT expired'],
  ['null', null],
  ['a bare number', 0]
];
const EMPTY_COLLECTION = [];
const POPULATED_COLLECTION = [
  { id: 41, source: PLACEHOLDER_SOURCE, stamp_type: 'NOTE', abcd_tag: 'AGENT_NOTE' },
  { id: 42, source: 'AGENT.PLACEHOLDER.other', stamp_type: 'NOTE', abcd_tag: null }
];

// A response shaped like the one global fetch really hands back: a real ReadableStream body so the
// bounded path parses real bytes, a working content-length, and a real json().
function response(body) {
  const bytes = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: function (name) {
      return String(name).toLowerCase() === 'content-length' ? String(bytes.length) : null;
    } },
    body: new ReadableStream({ start: function (controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    } }),
    json: async function () { return JSON.parse(bytes.toString('utf8')); }
  };
}

function withBrainEnv(t, body) {
  const priorUrl = process.env.MEMORY_BANK_URL;
  const priorKey = process.env.MEMORY_BANK_KEY;
  const priorFetch = global.fetch;
  process.env.MEMORY_BANK_URL = 'https://memory.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key';
  global.fetch = async function () { return response(body); };
  t.after(function () {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.MEMORY_BANK_URL;
    else process.env.MEMORY_BANK_URL = priorUrl;
    if (priorKey === undefined) delete process.env.MEMORY_BANK_KEY;
    else process.env.MEMORY_BANK_KEY = priorKey;
  });
}

function isShapeless(error) {
  return !!error && error.code === 'brain_read_answer_is_not_rows';
}

// THE LAW, on the path this world actually runs (no maxBytes, so response.json()).
test('a 200 carrying an answer that is not rows never reads as zero rows', async function (t) {
  for (const pair of UNREADABLE_BODIES) {
    await t.test(pair[0] + ' is refused, not flattened', async function (t2) {
      withBrainEnv(t2, pair[1]);
      await assert.rejects(brain.readBead({ source: 'eq.' + PLACEHOLDER_SOURCE }), isShapeless);
    });
  }
});

test('a 200 carrying an answer that is not rows is refused on the bounded path too',
  async function (t) {
    for (const pair of UNREADABLE_BODIES) {
      await t.test(pair[0] + ' is refused when a caller bounds the read', async function (t2) {
        withBrainEnv(t2, pair[1]);
        await assert.rejects(
          brain.readBead({ source: 'eq.' + PLACEHOLDER_SOURCE }, { maxBytes: 4096 }), isShapeless);
      });
    }
  });

// THE OTHER HALF, and the half that makes the first half mean anything: a real empty collection
// still comes back as a real empty collection. A fix that refused everything would "pass" the
// tests above and be worthless.
test('a genuinely empty collection still reads as an empty collection', async function (t) {
  withBrainEnv(t, EMPTY_COLLECTION);
  const rows = await brain.readBead({ source: 'eq.' + PLACEHOLDER_SOURCE });
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 0);
});

test('a populated collection still reads as its rows, and the return type is still an array',
  async function (t) {
    withBrainEnv(t, POPULATED_COLLECTION);
    const rows = await brain.readBead({ source: 'eq.' + PLACEHOLDER_SOURCE });
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 41);
  });

// The point of the whole change, stated as one assertion a reader can check at a glance: the two
// answers are DISTINGUISHABLE at the place a caller decides. Before the fix both of these produced
// the identical value [] and this assertion could not have been written.
test('the empty collection and the unreadable body are distinguishable at the decision point',
  async function (t) {
    let empty = null;
    let unreadable = null;
    await t.test('read the empty collection', async function (t2) {
      withBrainEnv(t2, EMPTY_COLLECTION);
      try {
        empty = { outcome: 'rows', value: await brain.readBead({ source: 'eq.x' }) };
      } catch (error) { empty = { outcome: 'refused', code: error.code }; }
    });
    await t.test('read the unreadable body', async function (t2) {
      withBrainEnv(t2, { code: 'PGRST301', message: 'JWT expired' });
      try {
        unreadable = { outcome: 'rows', value: await brain.readBead({ source: 'eq.x' }) };
      } catch (error) { unreadable = { outcome: 'refused', code: error.code }; }
    });
    assert.equal(empty.outcome, 'rows');
    assert.equal(empty.value.length, 0);
    assert.equal(unreadable.outcome, 'refused');
    assert.equal(unreadable.code, 'brain_read_answer_is_not_rows');
    assert.notDeepEqual(empty, unreadable);
  });

// The refusal names what it met, so a caller writing a receipt can say WHICH shape came back
// instead of "something went wrong". It never invents a row.
test('the refusal carries the shape it actually met and no invented rows', async function (t) {
  withBrainEnv(t, { code: 'PGRST301', message: 'JWT expired' });
  await assert.rejects(brain.readBead({ source: 'eq.x' }), function (error) {
    assert.equal(error.code, 'brain_read_answer_is_not_rows');
    assert.equal(error.body_type, 'object');
    assert.equal(error.rows, undefined);
    return true;
  });
});

// Before the fix this exact body did not even reach a named refusal: it threw a bare TypeError
// reading 'rows' that named nothing about the brain at all.
test('a null body is named null, never an empty object and never zero rows', async function (t) {
  withBrainEnv(t, null);
  await assert.rejects(brain.readBead({ source: 'eq.x' }), function (error) {
    assert.equal(error.code, 'brain_read_answer_is_not_rows');
    assert.equal(error.body_type, 'null');
    assert.doesNotMatch(String(error.message), /Cannot read properties/);
    return true;
  });
});

// The {"rows":[...]} envelope was part of this door's contract before today and it stays, because
// {"rows":[]} is a genuine measurement of zero and removing it would break a caller relying on it.
// Only bodies with NO readable rows at all are refused.
test('an object carrying a real rows array is still honored', async function (t) {
  await t.test('a populated rows envelope', async function (t2) {
    withBrainEnv(t2, { rows: POPULATED_COLLECTION });
    const rows = await brain.readBead({ source: 'eq.x' });
    assert.equal(rows.length, 2);
  });
  await t.test('an empty rows envelope is a measurement of zero, not a refusal',
    async function (t2) {
      withBrainEnv(t2, { rows: [] });
      const rows = await brain.readBead({ source: 'eq.x' });
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, 0);
    });
});

// findBySource has exactly one null and this world reads it as "no such record". That sentence is
// only true because an unreadable answer now leaves by a different exit.
test('findBySource returns null only for a measured absence, never for an unreadable answer',
  async function (t) {
    await t.test('an empty collection is a measured absence and returns null',
      async function (t2) {
        withBrainEnv(t2, EMPTY_COLLECTION);
        assert.equal(await brain.findBySource(PLACEHOLDER_SOURCE, PLACEHOLDER_HAM), null);
      });
    await t.test('an unreadable answer refuses instead of reporting the record absent',
      async function (t2) {
        withBrainEnv(t2, { code: 'PGRST301', message: 'JWT expired' });
        await assert.rejects(brain.findBySource(PLACEHOLDER_SOURCE, PLACEHOLDER_HAM), isShapeless);
      });
    await t.test('a found record still comes back', async function (t2) {
      withBrainEnv(t2, POPULATED_COLLECTION);
      const found = await brain.findBySource(PLACEHOLDER_SOURCE, PLACEHOLDER_HAM);
      assert.equal(found.id, 41);
    });
  });

// auditUnstamped and stampStats each report a count. Before the fix an unreadable answer gave them
// checked:0 / sample_size:0 with NO error field, which is a machine stating as fact that it looked
// and found nothing. They already carried an error field for a thrown read; the throw is what
// finally populates it for this shape, which is why neither function needed an edit.
test('the counting readers report a failed read instead of a confident zero', async function (t) {
  await t.test('auditUnstamped', async function (t2) {
    withBrainEnv(t2, { code: 'PGRST301', message: 'JWT expired' });
    const audit = await brain.auditUnstamped(10);
    assert.equal(audit.checked, 0);
    assert.ok(audit.error, 'a failed read must carry its error, never a bare zero');
    assert.match(audit.error, /brain_read_answer_is_not_rows/);
  });
  await t.test('stampStats', async function (t2) {
    withBrainEnv(t2, { code: 'PGRST301', message: 'JWT expired' });
    const stats = await brain.stampStats(10);
    assert.equal(stats.sample_size, 0);
    assert.ok(stats.error, 'a failed read must carry its error, never a bare zero');
    assert.match(stats.error, /brain_read_answer_is_not_rows/);
  });
  await t.test('a real empty read reports zero with no error, and the two are distinguishable',
    async function (t2) {
      withBrainEnv(t2, EMPTY_COLLECTION);
      const audit = await brain.auditUnstamped(10);
      assert.equal(audit.checked, 0);
      assert.equal(audit.error, undefined);
      const stats = await brain.stampStats(10);
      assert.equal(stats.sample_size, 0);
      assert.equal(stats.error, undefined);
    });
});

// THE REFUSAL, pinned. The cure must not become a classifier that decides which bodies are
// "trustworthy" rows and which are not. This door carries the fact that an answer was not rows; it
// never inspects a row's contents, never filters a row out of a real array, and never caps how many
// rows come back. A future coder adding a whitelist here would be the same defect one layer up, and
// this test is here to stop that.
test('the door carries the answer and never classifies or filters the rows it did read',
  async function (t) {
    const messy = [
      { id: 1, source: null, content: null, acl_stamp: null },
      { id: 2, source: PLACEHOLDER_SOURCE, content: { edges: [] }, acl_stamp: 'not a stamp' },
      { id: 3 }
    ];
    withBrainEnv(t, messy);
    const rows = await brain.readBead({ source: 'eq.x' });
    assert.equal(rows.length, 3, 'every row the bank returned comes back, unfiltered and uncapped');
    assert.equal(rows[0].source, null, 'a null column is carried as null, never invented');
    assert.deepEqual(rows, messy);
  });

// This repository is the seed every world inherits, so the cure has to be the thing that ships, not
// a comment about it. If a later hand restores the flattening, this catches it at the source line.
test('the flattening line is gone from the source this world is born holding', async function () {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pai', 'core', 'brain.client.js'), 'utf8');
  // Only real code lines are inspected. The header above rowsFromBody QUOTES the retired line on
  // purpose, because supersede-never-delete means the defect stays readable to the next coder, and
  // a guard that cannot tell a quotation from an instruction would forbid explaining the fix.
  const codeLines = source.split('\n')
    .filter(function (line) { return !/^\s*(\/\/|\*|\/\*)/.test(line); });
  const flattening = codeLines.filter(function (line) { return /data\.rows \|\| \[\]/.test(line); });
  assert.deepEqual(flattening, [],
    'a body that is not rows must never fall back to an empty array');
  assert.ok(codeLines.some(function (line) { return /throw readShapeless\(data\)/.test(line); }));
  assert.ok(codeLines.some(function (line) { return /return rowsFromBody\(data\)/.test(line); }));
});
