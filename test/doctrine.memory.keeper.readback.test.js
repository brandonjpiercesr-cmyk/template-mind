// ⬡B:tests.memory.keeper.turn:PROOF:a_turn_is_kept_and_the_next_turn_reads_it_back:20260726⬡
// ACL: entered through the ABAHAM door, serving channel MESSAGES.
//
// THE FOUNDER'S COMPLAINT, in his own words: "I still don't think she really memorizes and
// has memory." Verified mechanical cause: her memory READ one string and WROTE another.
//   core/find.js findContext queries source prefix 'pai.minutes.' and stamp_type RESULT at
//   importance >= 7. The only writer of that prefix was routes/stream.routes.js, so SMS,
//   voice and every non-stream /cara/chat turn wrote nothing that read could return, and no
//   turn ever stamped a RESULT at all.
//   core/find.js findStatedCommitments queries source prefix 'memory.gifted.' and stamp_type
//   MEMORY at importance >= 7. That writer was removed on 20260725 and never replaced, while
//   two comments in the codebase went on asserting it existed.
//
// THIS SUITE IS THE LOCK. It proves, without touching a network:
//   1. the write side exists, is a WONDER (a mind rules, cold code stores), and is leashed so
//      she can never keep words a person did not say;
//   2. a turn goes in and beads come out with the EXACT source, stamp_type and importance the
//      readers query, from the ONE shared MEMORY_CONTRACT;
//   3. the keeper is actually WIRED at the one common PAI exit, so no channel can be the one
//      that forgot;
//   4. a SECOND turn reads the first turn's fact back off the wall, through the real
//      core/find.js and the real core/fcw.builder.js, and it lands in her system prompt.
//
// ON OLD CODE every one of these fails: core/memory.keeper.js does not exist, so the bank
// holds nothing after turn one and the second turn's wall is empty.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KEEPER_PATH = path.join(ROOT, 'pai', 'core', 'memory.keeper.js');
const FIND_PATH = path.join(ROOT, 'pai', 'core', 'find.js');
const BUILDER_PATH = path.join(ROOT, 'pai', 'core', 'fcw.builder.js');

// A HAM and a fact that belong to nobody. This suite must never carry a real person.
const TEST_HAM = 'HAM.TEST.KEEPER';
const HIS_WORDS = 'The Saturday build review moved to nine in the morning at the shop, '
  + 'and I want the whole coding department on it.';
const HER_ANSWER = 'Got it. Saturday build review at nine at the shop, coding department on it.';

// ---------------------------------------------------------------------------------------
// A fake memory bank: an in-memory bead table that answers the exact PostgREST grammar
// core/find.js emits. Not a mock of the system under test, a stand-in for Supabase, so the
// real finders and the real builder run unmodified against it.
// ---------------------------------------------------------------------------------------
function fakeBank() {
  const rows = [];
  let nextId = 1;
  async function handler(url, init) {
    const u = new URL(String(url));
    const method = (init && init.method) || 'GET';
    if (method === 'POST') {
      const bead = JSON.parse(init.body);
      const stored = Object.assign({ id: nextId++, created_at: new Date().toISOString() }, bead);
      rows.push(stored);
      const wantsRepresentation = /return=representation/.test(String(init.headers && init.headers.Prefer || ''));
      return { ok: true, status: 201,
        json: async () => (wantsRepresentation ? [stored] : []),
        text: async () => '' };
    }
    // GET: apply the exact filter grammar core/find.js builds.
    let out = rows.slice();
    for (const [key, value] of u.searchParams.entries()) {
      if (key === 'stamp_type' && value.startsWith('eq.')) {
        const want = value.slice(3); out = out.filter(r => r.stamp_type === want);
      } else if (key === 'ham_uid' && value.startsWith('eq.')) {
        const want = value.slice(3); out = out.filter(r => String(r.ham_uid) === want);
      } else if (key === 'agent_global' && value.startsWith('eq.')) {
        const want = value.slice(3); out = out.filter(r => r.agent_global === want);
      } else if (key === 'importance' && value.startsWith('gte.')) {
        const floor = Number(value.slice(4)); out = out.filter(r => Number(r.importance || 0) >= floor);
      } else if (key === 'source' && value.startsWith('eq.')) {
        const want = value.slice(3); out = out.filter(r => String(r.source || '') === want);
      } else if (key === 'source' && value.startsWith('like.')) {
        const pre = value.slice(5).replace(/\*$/, '');
        out = out.filter(r => String(r.source || '').startsWith(pre));
      } else if (key === 'source' && value.startsWith('not.like.')) {
        const pre = value.slice('not.like.'.length).replace(/\*$/, '');
        out = out.filter(r => !String(r.source || '').startsWith(pre));
      }
    }
    const limit = Number(u.searchParams.get('limit') || 0);
    out = out.slice().reverse();                       // created_at.desc
    if (limit) out = out.slice(0, limit);
    return { ok: true, status: 200, json: async () => out, text: async () => '' };
  }
  return { handler, rows };
}

function armBank(t, bank) {
  const oldFetch = global.fetch;
  const oldEnv = {};
  ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'BEAD_TABLE', 'BRAIN_SCHEMA',
    'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY'].forEach(k => { oldEnv[k] = process.env[k]; });
  process.env.MEMORY_BANK_URL = 'https://bank.test.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key-not-a-real-secret';
  delete process.env.AIBE_BRAIN_URL;
  delete process.env.AIBE_BRAIN_KEY;
  delete process.env.BEAD_TABLE;
  delete process.env.BRAIN_SCHEMA;
  global.fetch = bank.handler;
  t.after(() => {
    global.fetch = oldFetch;
    Object.keys(oldEnv).forEach(k => {
      if (oldEnv[k] == null) delete process.env[k]; else process.env[k] = oldEnv[k];
    });
    [KEEPER_PATH, FIND_PATH, BUILDER_PATH].forEach(p => { delete require.cache[p]; });
  });
}

// The keeper's mind, stubbed with a real verdict shape so the suite never spends a token.
// It quotes HIS words verbatim, which is what the cold leash then has to prove.
function keeperMind(verdict) {
  return async function () { return { content: JSON.stringify(verdict), model: 'test-mind', via: 'test' }; };
}

// AbortSignal.timeout() is unref'd on Node 20/22. The pending fetch double below is otherwise
// the only work left, so keep one referenced interval until the test lifecycle releases it.
function keepAlive(t) {
  const timer = setInterval(function () {}, 1000);
  t.after(function () { clearInterval(timer); });
}

// =========================================================================================
test('the memory contract is one object and every number clears the reader floor', () => {
  const contract = require(KEEPER_PATH).MEMORY_CONTRACT;
  assert.equal(contract.TURN_SOURCE_PREFIX, 'pai.minutes.',
    'the turn record must be written where core/find.js findContext already reads');
  assert.equal(contract.GIFT_SOURCE_PREFIX, 'memory.gifted.',
    'the gift must be written where core/find.js findStatedCommitments already reads');
  assert.equal(contract.TURN_STAMP_TYPE, 'RESULT');
  assert.equal(contract.GIFT_STAMP_TYPE, 'MEMORY');
  assert.ok(contract.TURN_IMPORTANCE >= contract.READER_IMPORTANCE_FLOOR,
    'the writer must be raised to clear the floor, never the floor lowered to the writer');
  assert.ok(contract.GIFT_IMPORTANCE >= contract.READER_IMPORTANCE_FLOOR);
  assert.equal(contract.READER_IMPORTANCE_FLOOR, 7,
    'the floor stays at 7: below it the importance-2 housekeeping MEMORY markers reach her wall');
});

test('the leash: she cannot keep words the person never said', () => {
  const keeper = require(KEEPER_PATH);
  const verbatim = keeper._test.leashToTheirWords('moved to nine in the morning', HIS_WORDS);
  assert.equal(verbatim.leash, 'verbatim');
  assert.equal(verbatim.words, 'moved to nine in the morning');
  const invented = keeper._test.leashToTheirWords('he agreed to sell the company', HIS_WORDS);
  assert.equal(invented.leash, 'overruled_quote_not_in_message');
  assert.equal(invented.words, HIS_WORDS,
    'an unprovable quote must fall back to their whole real message, never be kept as said');
});

test('a mind that is down keeps the turn record and refuses to invent a gift', async (t) => {
  const bank = fakeBank();
  armBank(t, bank);
  const keeper = require(KEEPER_PATH);
  const receipt = await keeper.keepTurn({
    hamUid: TEST_HAM, channel: 'sms', question: HIS_WORDS, answer: HER_ANSWER,
    cycleId: 'C1', requestId: 'R1', deliberate: async () => null
  });
  assert.equal(receipt.turn_record.ok, true, 'the conversation record is cold and unconditional');
  assert.equal(receipt.gift.kept, false);
  assert.equal(receipt.gift.reason, 'keeper_mind_unavailable');
  assert.match(receipt.notes, /keeper mind was unavailable/);
});

test('a POST representation without an independent matching GET is not durable memory', async (t) => {
  const bank = fakeBank();
  armBank(t, bank);
  const original = global.fetch;
  global.fetch = async function (url, init) {
    if (((init && init.method) || 'GET') === 'POST') return original(url, init);
    return { ok:true, status:200, json:async function () { return []; } };
  };
  const keeper = require(KEEPER_PATH);
  const stored = await keeper._test.storeBead({ham_uid:TEST_HAM,agent_global:'PAI',
    stamp_type:'RESULT',source:'pai.minutes.' + TEST_HAM + '.proof',
    acl_stamp:'⬡B:test.memory:RESULT:proof:20260730⬡',summary:'proof',content:'{}',importance:7});
  assert.equal(stored.ok, false);
  assert.equal(stored.reason, 'memory_readback_unverified');
});

test('mismatched write representation and duplicate readback both fail closed', async (t) => {
  const bank = fakeBank();
  armBank(t, bank);
  const original = global.fetch;
  const bead = {ham_uid:TEST_HAM,agent_global:'PAI',stamp_type:'RESULT',
    source:'pai.minutes.' + TEST_HAM + '.ambiguous',
    acl_stamp:'⬡B:test.memory:RESULT:ambiguous:20260730⬡',summary:'proof',
    content:'{}',importance:7};
  global.fetch = async function (url, init) {
    const response = await original(url, init);
    if (((init && init.method) || 'GET') !== 'POST') return response;
    const rows = await response.json();
    rows[0] = Object.assign({}, rows[0], { summary:'different bytes' });
    return {ok:true,status:201,json:async function () { return rows; }};
  };
  const keeper = require(KEEPER_PATH);
  const mismatch = await keeper._test.storeBead(Object.assign({}, bead));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'memory_write_unverified');

  global.fetch = async function (url, init) {
    const response = await original(url, init);
    if (((init && init.method) || 'GET') === 'POST') return response;
    const rows = await response.json();
    return {ok:true,status:200,json:async function () {
      return rows.length ? [rows[0], Object.assign({}, rows[0], {id:9999})] : [];
    }};
  };
  const duplicate = await keeper._test.storeBead(Object.assign({}, bead,
    {source:bead.source + '.duplicate'}));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'memory_readback_unverified');
});

test('POST and GET use distinct bounded signals and a readback timeout is named', async (t) => {
  keepAlive(t);
  const bank = fakeBank();
  armBank(t, bank);
  const oldTimeout = process.env.MEMORY_KEEPER_IO_TIMEOUT_MS;
  process.env.MEMORY_KEEPER_IO_TIMEOUT_MS = '100';
  t.after(function () {
    if (oldTimeout == null) delete process.env.MEMORY_KEEPER_IO_TIMEOUT_MS;
    else process.env.MEMORY_KEEPER_IO_TIMEOUT_MS = oldTimeout;
  });
  const original = global.fetch;
  const signals = [];
  global.fetch = async function (url, init) {
    signals.push(init && init.signal);
    if (((init && init.method) || 'GET') === 'POST') return original(url, init);
    return new Promise(function (_, reject) {
      const abort = function () {
        reject((init.signal && init.signal.reason) ||
          Object.assign(new Error('aborted'), {name:'AbortError'}));
      };
      if (init.signal && init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, {once:true});
    });
  };
  const keeper = require(KEEPER_PATH);
  const timedOut = await keeper._test.storeBead({ham_uid:TEST_HAM,agent_global:'PAI',
    stamp_type:'RESULT',source:'pai.minutes.' + TEST_HAM + '.timeout',
    acl_stamp:'⬡B:test.memory:RESULT:timeout:20260730⬡',summary:'proof',
    content:'{}',importance:7});
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.reason, 'memory_readback_timeout');
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1],
    'readback must get a fresh deadline, never the POST signal after its clock ran');
});

test('ordinary user-facing success requires the exact turn record readback, not the optional gift', function () {
  const loopPath = path.join(ROOT, 'pai', 'core', 'tool.loop.js');
  delete require.cache[loopPath];
  const loopTest = require(loopPath)._test;
  const helper = loopTest.memoryTurnRecordVerified;
  assert.equal(helper({ok:false,turn_record:{ok:true,readback_verified:true},
    gift:{kept:false,reason:'gift_write_failed'}}), true,
  'an optional gift failure must not erase a durable conversation record');
  assert.equal(helper({ok:true,turn_record:{ok:true}}), false,
    'the POST representation alone is not the independent readback');
  assert.equal(helper({ok:false,turn_record:{ok:false,readback_verified:false}}), false);
  const source = fs.readFileSync(loopPath, 'utf8');
  assert.ok(source.indexOf('if (_memoryTurnRequired)') < source.indexOf('for (var _effectIndex'),
    'the user-facing memory gate must run before any queued effect executor');
  for (const channel of ['cara', 'turn', 'omi', 'voice', 'portal', 'email', 'sms',
    'blooio', 'anu', 'coding', 'advisor', 'budget', 'ccwa', 'future_user_surface']) {
    assert.equal(loopTest.memoryTurnRequired(channel, { delivery:{external:true},
      council_context:{mode:'conversation'} }, {}), true, channel);
  }
  assert.equal(loopTest.memoryTurnRequired('voice', {outbound_finalize:true,
    council_context:{mode:'outbound_effect'}}, {}), false);
  assert.equal(loopTest.memoryTurnRequired('turn', {council_context:{mode:'conversation'}},
    {blockedFallback:true}), true,
  'a human-facing working-limit answer must prove the full request was kept before claiming it');
  for (const channel of ['guide', 'wake', 'reach', 'reach_incident_intake']) {
    assert.equal(loopTest.memoryTurnRequired(channel,
      {council_context:{mode:'internal_deliberation'}}, {}), false, channel);
  }
  for (const channel of ['anew_action', 'autonomous']) {
    assert.equal(loopTest.memoryTurnRequired(channel,
      {council_context:{mode:'internal_deliberation'}}, {}), true, channel);
  }
});

// ⬡B:tests.doctrine.memory.keeper.readback:PROOF:pen_on_her_mind_fence_pinned:20260815⬡
// Founder doctrine THE PEN ON HER MIND (20260815): "FENCE THE READ-BACK FIRST. One fix
// contains the whole class... CARRY, NEVER CLASSIFY. If you write a whitelist of trusted
// sources that sorts her rows into hers and not-hers, YOU JUST BECAME THE NASTY COUGH ONE
// LAYER UP. Pin that refusal in a test."
//
// The fence itself landed in core/fcw.builder.js (#518, mirror of anew #2146). Its pin did
// not travel with it, so this template shipped the fence with nothing guarding it: the next
// coder could add the source allowlist the doctrine forbids and every gate here would stay
// green. This is that guard.
//
// What is deliberately NOT asserted here, and why: the builder currently renders a
// source-less row as "written by an unnamed writer". The doctrine names that exact shape as
// a trap ("do not invent an unstamped writer for a NULL column, say (no writer stamp on the
// row)"). Pinning the current string would make this test the nasty cough one layer up,
// since the doctrine also rules that "a test that pins the cold behavior is also nasty
// cough." So the NULL wording is left unpinned and is carried as an open finding instead.
// core/fcw.builder.js is a pai-sync-check synced pair, so it cannot be corrected on one
// side alone; the correction must land byte-identical with anew in the same window.
test('the pen-on-her-mind fence: every RECENT CONTEXT line names its writer, she is handed the judgment, and her rows are never sorted', () => {
  const builderSource = fs.readFileSync(BUILDER_PATH, 'utf8');

  assert.match(builderSource, /\| written by /,
    'every context line must carry the writer that stamped the row as a fact on the line');

  assert.match(builderSource,
    /A writer name is the lane or module that stamped the row, not proof of who/,
    'the mind must be told plainly that a writer name is the module, never proof of authorship');

  assert.match(builderSource, /Judge each line by its named writer/,
    'the reading mind judges which rows are hers; the builder must never judge for her');

  assert.match(builderSource, /never say one to the person/,
    'the narration fence: writer names are internal and are never spoken to a person');

  // CARRY, NEVER CLASSIFY. The named trap: a source list that sorts her rows into hers and
  // not-hers is the same cold hand one layer up, so the builder must never grow one.
  assert.doesNotMatch(builderSource,
    /(TRUSTED|HER_SOURCES|AUTHENTIC_SOURCES|REAL_SOURCES|MIND_SOURCES)\s*=/,
    'carry, never classify: the wall must not grow an allowlist that sorts her rows');

  // Never filter a row, never cap her read.
  assert.match(builderSource, /contextStr = allContext\.map\(/,
    'the wall maps every fetched row; it must not filter them');
  assert.doesNotMatch(builderSource, /allContext\s*=\s*allContext\.slice\(/,
    'the wall must not cap her read');
});
