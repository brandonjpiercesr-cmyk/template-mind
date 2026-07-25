// ⬡B:test.day.memory.union:PROOF:her_day_is_the_union_of_the_calendar_and_what_they_told_her:20260725⬡
// TWIN of the anew suite tests/day.memory.union.test.js. Same proof, run against this repo's own
// pai/core copies, so the mind-template every world inherits carries the fix and not the bug.
// ACL: Entered through the ABAHAM door, serving channel MESSAGES. Proves the fix for the
// founder-caught failure of 20260725: he told A'NU his Saturday plan through her live gate, she
// received it and confirmed the specifics back with a committed cycle receipt, and hours later,
// asked where things stood, she said his day was open with no meetings locked in. He told her,
// she agreed, then she contradicted him.
//
// Verified root cause, in two legs, both covered here:
//   LEG 1  pai/core/synthesize.js already CAPTURED what he said (a MEMORY bead, importance 9, his
//          exact words) and NOTHING ever read it back. No wall contributor queried stamp_type
//          MEMORY, and 'memory.gifted.' had exactly one reference in the whole repo: the write.
//          So what he told her was never on the wall of the later cycle at all.
//   LEG 2  pai/core/context.fusion.js turned one silent source, an empty calendar, into the settled
//          claim "your next 24 hours are wide open with nothing scheduled", and told her to
//          answer from it "above any memory search".
//
// These tests are the regression lock on both, plus the honest-failure boundary: an unavailable
// read must never be spoken as an empty day.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function modulePath() {
  return path.join.apply(path, [ROOT].concat(Array.prototype.slice.call(arguments)));
}

function restoreAfter(t, modules, envKeys) {
  const oldFetch = global.fetch;
  const oldEnv = {};
  envKeys.forEach(function (key) { oldEnv[key] = process.env[key]; });
  t.after(function () {
    global.fetch = oldFetch;
    modules.forEach(function (p) { delete require.cache[p]; });
    envKeys.forEach(function (key) {
      if (oldEnv[key] == null) delete process.env[key];
      else process.env[key] = oldEnv[key];
    });
  });
}

// A HAM UID and a plan that belong to nobody: this suite must never carry a real person.
const TEST_HAM = 'HAM.TEST.DAY';
const STATED_PLAN = 'Saturday is the ballpark with the team, leaving around ten.';

function cacheFind(findPath, statedResult) {
  const empty = { beads: [], ms: 1 };
  require.cache[findPath] = { id: findPath, filename: findPath, loaded: true, exports: {
    findIdentity: async function () {
      return { beads: [{ id: 1, stamp_type: 'HAM_IDENTIFIER', ham_uid: TEST_HAM,
        summary: 'Test person', content: '{}' }], ms: 1 };
    },
    findAgentJDs: async function () { return empty; },
    findNamedAgentRecords: async function () { return empty; },
    findIdentityEvidence: async function () {
      return { schema: 'anew.identity.evidence.result.v1', ok: true, available: true,
        ham_uid: TEST_HAM, subjects: [], records: [], count: 0, ms: 1 };
    },
    findContext: async function () { return empty; },
    findRecentResults: async function () { return empty; },
    findDoctrine: async function () { return empty; },
    findPersonProfile: async function () { return empty; },
    findPreferences: async function () { return empty; },
    findWonderGames: async function () { return empty; },
    findStatedCommitments: async function (hamUid) {
      assert.equal(hamUid, TEST_HAM, 'the stated-plans read must be scoped to the asking HAM');
      if (typeof statedResult === 'function') return statedResult();
      return statedResult;
    }
  } };
}

function cacheStubs(t, builderPath) {
  const findPath = modulePath('pai', 'core', 'find.js');
  const titlePath = modulePath('pai', 'core', 'title.js');
  const capabilitiesPath = modulePath('pai', 'core', 'capabilities.js');
  const tzPath = modulePath('pai', 'core', 'ham.timezone.js');
  const modules = [findPath, builderPath, titlePath, capabilitiesPath, tzPath];
  const envKeys = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY'];
  restoreAfter(t, modules, envKeys);
  // No brain credentials: the builder's own fail-silent MINUTES trace write is skipped, so
  // this proof needs no network at all.
  envKeys.forEach(function (key) { delete process.env[key]; });
  require.cache[titlePath] = { id: titlePath, filename: titlePath, loaded: true,
    exports: { resolveTitle: async function () { return null; } } };
  require.cache[capabilitiesPath] = { id: capabilitiesPath, filename: capabilitiesPath,
    loaded: true, exports: { capabilityLine: async function () { return ''; } } };
  require.cache[tzPath] = { id: tzPath, filename: tzPath, loaded: true,
    exports: { resolveHamTimezone: async function () { return 'America/New_York'; } } };
  return findPath;
}

test('a plan the person stated survives into a LATER cycle wall, in their own words', async function (t) {
  const builderPath = modulePath('pai', 'core', 'fcw.builder.js');
  const findPath = cacheStubs(t, builderPath);
  // The bead pai/core/synthesize.js's memory keeper really writes when a person hands something
  // over: stamp_type MEMORY, importance 9, their exact words in content.their_words. Stamped
  // three hours ago, so this is a LATER cycle, not the same turn.
  const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  cacheFind(findPath, { ms: 1, beads: [{ id: 9, ham_uid: TEST_HAM, stamp_type: 'MEMORY',
    source: 'memory.gifted.' + TEST_HAM + '.1784000000000', importance: 9,
    summary: '[MEMORY, given to me] ' + STATED_PLAN,
    created_at: threeHoursAgo,
    content: JSON.stringify({ their_words: STATED_PLAN, my_confirmation: 'Got it, the ballpark.',
      channel: 'glass', kept_at: threeHoursAgo }) }] });

  delete require.cache[builderPath];
  const wall = await require(builderPath).buildMemoryBank(TEST_HAM, 'glass',
    'where do things stand right now?', { ham_uid: TEST_HAM, name: 'Test person' });

  assert.equal(wall.ok, true);
  // The words themselves reach the wall. This is the whole failure: they never used to.
  assert.ok(wall.system_prompt.indexOf(STATED_PLAN) !== -1,
    'what the person told her must appear on a later cycle wall verbatim');
  assert.match(wall.system_prompt, /WHAT THEY TOLD YOU DIRECTLY/);
  // Dated in honest decay language, so a stale plan is never asserted as now.
  assert.match(wall.system_prompt, /they told you this 3 hours ago/);
  // The union rule, and the specific thing she must never do again.
  assert.match(wall.system_prompt, /UNION of the calendar and this list/);
  assert.match(wall.system_prompt, /never call their day open, clear, free, or empty/);
  // Receipts, not only prompt prose.
  assert.equal(wall.stated_plans.available, true);
  assert.equal(wall.stated_plans.count, 1);
  assert.equal(wall.stated_plans.records[0].id, 9);
  assert.equal(wall.contributors.statedPlans, true,
    'the wonder trace must record that what they told her was on this wall');
});

test('no stated plans is a quiet absence, never a claim that they told her nothing', async function (t) {
  const builderPath = modulePath('pai', 'core', 'fcw.builder.js');
  const findPath = cacheStubs(t, builderPath);
  cacheFind(findPath, { beads: [], ms: 1 });

  delete require.cache[builderPath];
  const wall = await require(builderPath).buildMemoryBank(TEST_HAM, 'glass', 'how is my day?',
    { ham_uid: TEST_HAM, name: 'Test person' });

  assert.equal(wall.ok, true);
  assert.equal(wall.stated_plans.available, true);
  assert.equal(wall.stated_plans.count, 0);
  assert.equal(wall.contributors.statedPlans, false);
  // A genuinely empty read adds no section and, crucially, no assertion either way.
  assert.equal(wall.system_prompt.indexOf('WHAT THEY TOLD YOU DIRECTLY'), -1);
  assert.equal(wall.system_prompt.indexOf('could not be read on this turn'), -1);
});

test('a FAILED stated-plans read says so honestly and is never read as an empty day', async function (t) {
  const builderPath = modulePath('pai', 'core', 'fcw.builder.js');
  const findPath = cacheStubs(t, builderPath);
  cacheFind(findPath, function () { throw new Error('brain unreachable'); });

  delete require.cache[builderPath];
  const wall = await require(builderPath).buildMemoryBank(TEST_HAM, 'glass', 'how is my day?',
    { ham_uid: TEST_HAM, name: 'Test person' });

  // One rejected contributor must never take the wall down with it.
  assert.equal(wall.ok, true);
  assert.equal(wall.stated_plans.available, false);
  assert.equal(wall.stated_plans.count, 0);
  assert.deepEqual(wall.stated_plans.records, []);
  assert.equal(wall.contributors.statedPlans, false);
  // Unavailable is stated as unavailable, and explicitly separated from empty.
  assert.match(wall.system_prompt, /could not be read on this turn/);
  assert.match(wall.system_prompt, /unavailable read, NOT an empty one/);
  assert.match(wall.system_prompt, /never treat this silence as proof that their day is empty/);
  // And nothing is invented to fill the hole.
  assert.equal(wall.system_prompt.indexOf('WHAT THEY TOLD YOU DIRECTLY'), -1);
});

// ---------------------------------------------------------------------------
// LEG 2: the calendar. An empty read is not an open day, and a failed read is not a clear one.
// ---------------------------------------------------------------------------

function fusionEnv(t) {
  const fusionPath = modulePath('pai', 'core', 'context.fusion.js');
  const tzPath = modulePath('pai', 'core', 'ham.timezone.js');
  const envKeys = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY',
    'BEAD_TABLE', 'BRAIN_SCHEMA', 'NYLAS_API_KEY', 'NYLAS_PERSONAL_GRANT', 'NYLAS_GMG_GRANT',
    'NYLAS_BDIF_GRANT', 'NYLAS_MEDIATORS_GRANT', 'NYLAS_MH_ACTION_GRANT', 'FOUNDER_HAM_UID',
    'DEFAULT_TZ'];
  restoreAfter(t, [fusionPath, tzPath], envKeys);
  envKeys.forEach(function (key) { delete process.env[key]; });
  require.cache[tzPath] = { id: tzPath, filename: tzPath, loaded: true,
    exports: { resolveHamTimezone: async function () { return 'America/New_York'; } } };
  return fusionPath;
}

// Serve one stored fusion bead to getLatestSummary, freshly stamped so it is not decayed out.
function serveFusion(calendar, channels) {
  global.fetch = async function () {
    return { ok: true, json: async function () {
      return [{ created_at: new Date().toISOString(), content: JSON.stringify({
        as_of: new Date().toISOString(), calendar: calendar,
        channels: channels || { glass: 2 }, screen: { live: false } }) }];
    } };
  };
}

test('an empty calendar is carried as evidence about the CALENDAR, never as a confident open day', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: true, events: [], grants_read: 1, grants_total: 1, partial: false });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM);

  assert.ok(line, 'a successful empty read is still real evidence and must reach her');
  // The exact sentence the founder caught is gone for good.
  assert.equal(line.indexOf('wide open with nothing scheduled'), -1,
    'cold code may never hand her the conclusion that the day is wide open');
  assert.equal(line.indexOf('above any memory search'), -1,
    'the fuse may never outrank what the person told her');
  // What it says instead: the source, its limits, and the union requirement.
  assert.match(line, /CALENDAR read succeeded and returned no scheduled events/);
  assert.match(line, /calendar is only one source/);
  assert.match(line, /NOT the same as "the day is open"/);
  assert.match(line, /check what they told you/);
  assert.match(line, /EVIDENCE and not the verdict/);
  assert.match(line, /does not outrank what this person told you themselves/);
});

test('a calendar read that FAILED is spoken as unavailable, never omitted and never a clear day', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: false, events: [], reason: 'calendar_read_failed' });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM);

  assert.match(line, /CALENDAR READ FAILED/);
  assert.match(line, /unavailable read, NOT an empty calendar and NOT an open day/);
  assert.match(line, /cannot reach their calendar/);
  assert.equal(line.indexOf('wide open'), -1);
  assert.equal(line.indexOf('no scheduled events'), -1,
    'a failed read must never be described as a read that returned nothing');
});

test('an unconfigured calendar stays silent: configuration is not a fault to report', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: false, events: [], reason: 'calendar_not_this_world' });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM);

  // The channel lane still reports; the calendar contributes nothing and claims nothing.
  assert.equal(line.indexOf('CALENDAR READ FAILED'), -1);
  assert.equal(line.indexOf('wide open'), -1);
  assert.equal(line.indexOf('no scheduled events'), -1);
});

test('a partial calendar read admits it is incomplete', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: true, events: [], grants_read: 1, grants_total: 3, partial: true });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM);

  assert.match(line, /only 1 of 3 calendars answered/);
  assert.match(line, /may be incomplete/);
});

test('every calendar grant failing is a failed read, not an empty calendar', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.FOUNDER_HAM_UID = TEST_HAM;      // env-only identity, never a literal person
  process.env.NYLAS_API_KEY = 'nylas-test-key';
  process.env.NYLAS_PERSONAL_GRANT = 'grant-a';
  process.env.NYLAS_GMG_GRANT = 'grant-b';
  // Both grants fail on the calendars call, the way a Nylas outage or an expired key looks.
  global.fetch = async function () { return { ok: false, status: 401,
    json: async function () { return { data: [] }; } }; };

  delete require.cache[fusionPath];
  const cal = await require(fusionPath)._test.readCalendarNext24h(TEST_HAM);

  assert.equal(cal.available, false,
    'zero grants answering must never be reported as a successfully empty calendar');
  assert.equal(cal.reason, 'calendar_read_failed');
  assert.equal(cal.grants_read, 0);
  assert.deepEqual(cal.events, []);
});

test('a grant that answers with no events is a real, successfully empty calendar', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.FOUNDER_HAM_UID = TEST_HAM;
  process.env.NYLAS_API_KEY = 'nylas-test-key';
  process.env.NYLAS_PERSONAL_GRANT = 'grant-a';
  global.fetch = async function (url) {
    if (String(url).indexOf('/calendars') !== -1) {
      return { ok: true, json: async function () {
        return { data: [{ id: 'cal-1', is_primary: true, name: 'primary' }] }; } };
    }
    return { ok: true, json: async function () { return { data: [] }; } };
  };

  delete require.cache[fusionPath];
  const cal = await require(fusionPath)._test.readCalendarNext24h(TEST_HAM);

  assert.equal(cal.available, true);
  assert.equal(cal.grants_read, 1);
  assert.equal(cal.partial, false);
  assert.deepEqual(cal.events, []);
});

test('a non-founder world reads no calendar at all and says why (the EBC firewall holds)', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.FOUNDER_HAM_UID = 'HAM.TEST.OTHER';
  process.env.NYLAS_API_KEY = 'nylas-test-key';
  process.env.NYLAS_PERSONAL_GRANT = 'grant-a';
  let called = false;
  global.fetch = async function () { called = true; return { ok: true,
    json: async function () { return { data: [] }; } }; };

  delete require.cache[fusionPath];
  const cal = await require(fusionPath)._test.readCalendarNext24h(TEST_HAM);

  assert.equal(cal.available, false);
  assert.equal(cal.reason, 'calendar_not_this_world');
  assert.equal(called, false, 'no cross-world calendar request may ever leave this module');
});
