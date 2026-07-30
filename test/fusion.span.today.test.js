// ⬡B:tests.fusion.span.today:PROOF:a_trip_he_is_on_is_today_not_upcoming:20260725⬡
// ACL: Entered through the ABAHAM door, serving channel MESSAGES. Regression lock on the
// founder-caught failure of 20260725, observed live on his own world: he was ON a July 22 to 26
// trip and the fused WORLD CONTEXT handed her this:
//
//   "the CALENDAR has nothing on it for today itself; upcoming days hold: <trip> on Wednesday,
//    July 22"
//
// A trip he was standing in the middle of, described as UPCOMING, dated three days in the PAST,
// with today reported as EMPTY. Meanwhile /os/calendar had the same event correct on the same
// data: is_today true, is_now true, end_date present.
//
// Root cause, one missing field: core/context.fusion.js readCalendarNext24h built its event shape
// with only a START and derived is_today from start-date EQUALITY. A span that began before today
// can never equal today, no matter how deep into it the person is, so it fell through to the
// "not today" bucket and got announced as something still ahead of him.
//
// The fix carries the END and classifies by SPAN OVERLAP, mirroring the proven 20260718
// implementation in routes/os.api.routes.js so the two readers can never disagree about the same
// event. These tests hold that line, and they also re-assert the 20260725 named-reason work
// (anew#1030) so the honest-failure states cannot be quietly traded away for it.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function modulePath() {
  return path.join.apply(path, [ROOT].concat(Array.prototype.slice.call(arguments)));
}

// A HAM UID that belongs to nobody. Identity is env-only, never a literal person, and a test
// fixture is shippable code like any other.
const TEST_HAM = 'HAM.TEST.SPAN';
const TZ = 'America/New_York';

async function founderReadAuthority() {
  process.env.FOUNDER_HAM_UID = TEST_HAM;
  return require('../pai/core/privacy/people.tier.js').resolveReadTier(null, TEST_HAM);
}

async function bornReadAuthority(tier) {
  delete process.env.FOUNDER_HAM_UID;
  const priorFetch = global.fetch;
  global.fetch = async function () {
    return { ok:true, status:200, json:async function () {
      return [{ content:{ people_tier:tier } }];
    } };
  };
  try {
    return await require('../pai/core/privacy/people.tier.js').resolveReadTier(null, TEST_HAM);
  } finally { global.fetch = priorFetch; }
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

// Same isolation the neighbouring day.memory.union suite uses: no real brain, no real Nylas, and
// the per-HAM zone resolver pinned so the assertions are about THIS module's math, not the
// resolver's. The zone is pinned to a real Eastern zone precisely so the UTC-versus-local
// distinction is observable.
function fusionEnv(t) {
  const fusionPath = modulePath('pai', 'core', 'context.fusion.js');
  const tzPath = modulePath('pai', 'core', 'ham.timezone.js');
  const envKeys = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY',
    'BEAD_TABLE', 'BRAIN_SCHEMA', 'NYLAS_API_KEY', 'NYLAS_PERSONAL_GRANT', 'NYLAS_GMG_GRANT',
    'NYLAS_BDIF_GRANT', 'NYLAS_MEDIATORS_GRANT', 'NYLAS_MH_ACTION_GRANT', 'FOUNDER_HAM_UID',
    'FOUNDER_TZ', 'DEFAULT_TZ'];
  restoreAfter(t, [fusionPath, tzPath], envKeys);
  envKeys.forEach(function (key) { delete process.env[key]; });
  require.cache[tzPath] = { id: tzPath, filename: tzPath, loaded: true,
    exports: { resolveHamTimezone: async function () { return TZ; } } };
  return fusionPath;
}

// Serve one grant with one primary calendar and whatever events the case needs.
function serveEvents(events) {
  global.fetch = async function (url) {
    if (String(url).indexOf('/calendars') !== -1) {
      return { ok: true, json: async function () {
        return { data: [{ id: 'cal-1', is_primary: true, name: 'primary' }] }; } };
    }
    return { ok: true, json: async function () { return { data: events }; } };
  };
}

function founderGrant() {
  process.env.FOUNDER_HAM_UID = TEST_HAM;   // env-only identity, never a literal
  process.env.NYLAS_API_KEY = 'nylas-test-key';
  process.env.NYLAS_PERSONAL_GRANT = 'grant-a';
}

async function readCal(fusionPath) {
  delete require.cache[fusionPath];
  return require(fusionPath)._test.readCalendarNext24h(TEST_HAM);
}

// ---- date helpers, all computed from the clock so this suite never rots ----
const DAY = 86400000;
function ymd(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit',
    day: '2-digit' }).format(new Date(ms));
}
function human(ms, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long',
    day: 'numeric' }).format(new Date(ms));
}
const sec = function (ms) { return Math.floor(ms / 1000); };

// The real UTC instant of a given wall-clock hour TODAY in the HAM's Eastern zone. This is what
// makes the timezone assertion honest: 23:30 Eastern is always the NEXT calendar day in UTC.
function easternWallToday(hour, minute) {
  const now = new Date();
  const etWall = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const offset = now.getTime() - etWall.getTime();
  const wall = new Date(etWall);
  wall.setHours(hour, minute, 0, 0);
  return wall.getTime() + offset;
}

// ---------------------------------------------------------------------------
// THE BUG ITSELF: a span he is standing in the middle of.
// ---------------------------------------------------------------------------

test('an all-day multi-day span covering today is TODAY and is not upcoming', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  const now = Date.now();
  serveEvents([{ id: 'trip', title: 'Multi-day trip',
    when: { start_date: ymd(now - 3 * DAY), end_date: ymd(now + 1 * DAY) } }]);

  const cal = await readCal(fusionPath);

  assert.equal(cal.available, true);
  assert.equal(cal.events.length, 1);
  const e = cal.events[0];
  assert.equal(e.is_today, true, 'a trip he is ON right now is today, not something ahead of him');
  assert.equal(e.is_now, true, 'a span whose start is behind us and whose end is ahead is underway');
  assert.equal(e.is_past, false);
  assert.ok(e.end_date, 'the end must be carried, not dropped: the end is what makes the span a span');
  assert.equal(e.end_date, human(Date.parse(ymd(now + 1 * DAY) + 'T23:59:59'), 'UTC'),
    'an all-day end is a floating calendar square, read in UTC like its start');
  assert.ok(e.end, 'the machine-readable end rides along with the start');
});

test('a TIMED multi-day span covering today is TODAY too, stamped in the HAM zone', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  const now = Date.now();
  const startMs = now - 2 * DAY, endMs = now + 2 * DAY;
  serveEvents([{ id: 'conf', title: 'Timed multi-day conference',
    when: { start_time: sec(startMs), end_time: sec(endMs) } }]);

  const e = (await readCal(fusionPath)).events[0];

  assert.equal(e.is_today, true, 'a timed span running across today is today');
  assert.equal(e.is_now, true);
  assert.equal(e.is_past, false);
  assert.equal(e.date, human(startMs, TZ), 'a timed instant is read in the HAM zone, never UTC');
  assert.equal(e.end_date, human(endMs, TZ), 'and so is its end');
});

test('an event that already ended is neither today nor underway, and is dropped from upcoming', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  const now = Date.now();
  serveEvents([{ id: 'over', title: 'Finished trip',
    when: { start_time: sec(now - 6 * DAY), end_time: sec(now - 4 * DAY) } }]);

  const e = (await readCal(fusionPath)).events[0];

  assert.equal(e.is_today, false, 'a finished event is not today');
  assert.equal(e.is_now, false, 'a finished event is not underway');
  assert.equal(e.is_past, true, 'and cold code says so plainly rather than leaving it ambiguous');
});

test('an event starting later today is today, and carries its own real time', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  // 11:30pm Eastern TODAY. In UTC this instant is already tomorrow, which is exactly the roll
  // that put her on the wrong day before the per-HAM zone landed.
  const startMs = easternWallToday(23, 30);
  serveEvents([{ id: 'late', title: 'Late call',
    when: { start_time: sec(startMs), end_time: sec(startMs + 3600000) } }]);

  const e = (await readCal(fusionPath)).events[0];

  assert.equal(e.date, human(startMs, TZ), 'the date is the HAM local day');
  assert.notEqual(human(startMs, TZ), human(startMs, 'UTC'),
    'this instant genuinely falls on different days in UTC and Eastern, so the zone had to matter');
  assert.notEqual(e.date, human(startMs, 'UTC'), 'and it was NOT rolled into the UTC day');
  assert.equal(e.is_today, true, 'a late-evening Eastern instant today is still today');
  assert.equal(e.is_now, false, 'a one-hour call later tonight is not a multi-day span underway');
});

test('a single all-day square today stays today, and claims no end it was never given', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  const today = ymd(Date.now());
  serveEvents([{ id: 'sq', title: 'All day today', when: { start_date: today, end_date: today } }]);

  const e = (await readCal(fusionPath)).events[0];

  assert.equal(e.is_today, true);
  assert.equal(e.is_now, false, 'a single square is not a multi-day span');
  assert.equal(e.time, 'all day');
  assert.equal(e.is_past, false);
});

test('an event the provider gave no end for invents none', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  const startMs = Date.now() + 3600000;
  serveEvents([{ id: 'bare', title: 'No end given', when: { start_time: sec(startMs) } }]);

  const e = (await readCal(fusionPath)).events[0];

  assert.equal(e.end, null, 'a missing end is represented as missing, never filled in');
  assert.equal(e.end_date, null, 'and no human end date is fabricated to cover the hole');
  assert.equal(e.is_now, false);
});

// ---------------------------------------------------------------------------
// What she is actually handed: the fused summary line.
// ---------------------------------------------------------------------------

function serveFusion(calendar, channels) {
  global.fetch = async function () {
    return { ok: true, json: async function () {
      return [{ created_at: new Date().toISOString(), content: JSON.stringify({
        as_of: new Date().toISOString(), calendar: calendar,
        channels: channels || { glass: 2 }, screen: { live: false } }) }];
    } };
  };
}

test('MEMORY_BANK-only worlds use memory_bank.beads and persist readable tiered fusion',
  async function (t) {
    const fusionPath = fusionEnv(t);
    process.env.MEMORY_BANK_URL = 'https://memory.test.invalid';
    process.env.MEMORY_BANK_KEY = 'memory-test-key';
    const calls = [];
    global.fetch = async function (url, init) {
      calls.push({url:String(url),init:init || {}});
      if (init && init.method === 'POST') {
        return {ok:true,status:201,text:async function () { return ''; }};
      }
      return {ok:true,status:200,json:async function () { return []; }};
    };
    delete require.cache[fusionPath];
    const fusion = require(fusionPath);
    const authority = await bornReadAuthority(2);
    const out = await fusion.runFuse(TEST_HAM, authority);
    assert.equal(out.ok, true, JSON.stringify(out));
    const post = calls.find(function (call) { return call.init.method === 'POST'; });
    assert.ok(post, 'the fused context was not written');
    assert.match(post.url, /\/rest\/v1\/beads$/);
    assert.equal(post.init.headers['Content-Profile'], 'memory_bank');
    const row = JSON.parse(post.init.body);
    assert.equal(row.acl_tier, 2,
      'a T2 fusion row must survive the next T2 summary predicate');
    assert.equal(row.content.privacy.tier, 2);

    calls.length = 0;
    await fusion.getLatestSummary(TEST_HAM, authority);
    const summary = calls.find(function (call) {
      return call.url.indexOf('context.fusion.') !== -1;
    });
    assert.ok(summary);
    assert.match(summary.url, /\/rest\/v1\/beads\?/);
    assert.match(summary.url, /[?&]acl_tier=gte\.2(?:&|$)/);
    assert.equal(summary.init.headers['Accept-Profile'], 'memory_bank');
  });

test('a T2 fused-context read is structurally filtered and cannot select a T0 row', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  const urls = [];
  global.fetch = async function (url) {
    const value = String(url);
    urls.push(value);
    if (value.indexOf('stamp_type=eq.BIRTH') !== -1) {
      return {ok:true,status:200,json:async function () {
        return [{content:JSON.stringify({people_tier:2})}];
      }};
    }
    const filtered = /[?&]acl_tier=gte\.2(?:&|$)/.test(value);
    return {ok:true,status:200,json:async function () {
      return filtered ? [] : [{acl_tier:0,created_at:new Date().toISOString(),
        content:JSON.stringify({as_of:new Date().toISOString(),calendar:{available:true,events:[]},
          channels:{},screen:{live:false}})}];
    }};
  };
  delete require.cache[fusionPath];
  const authority = await require('../pai/core/privacy/people.tier.js')
    .resolveReadTier(null, TEST_HAM);
  const line = await require(fusionPath).getLatestSummary(TEST_HAM, authority);
  assert.equal(line, '', 'a synthetic T0 fusion row must never reach a T2 world');
  const summaryUrl = urls.find(function (url) { return url.indexOf('context.fusion.') !== -1; });
  assert.match(summaryUrl, /[?&]acl_tier=gte\.2(?:&|$)/);
});

test('fused context performs zero memory fetches without a HAM-bound read authority',
  async function (t) {
    const fusionPath = fusionEnv(t);
    process.env.AIBE_BRAIN_URL = 'https://brain.test';
    process.env.AIBE_BRAIN_KEY = 'brain-key';
    let calls = 0;
    global.fetch = async function () { calls += 1; throw new Error('must not fetch'); };
    delete require.cache[fusionPath];
    const fusion = require(fusionPath);
    assert.equal(await fusion.getLatestSummary(TEST_HAM), '');
    assert.equal(Object.keys(await fusion._test.readChannelActivity(TEST_HAM)).length, 0);
    assert.deepEqual(await fusion.runFuse(TEST_HAM),
      { ok:false, reason:'viewer_read_authority_required' });
    assert.equal(calls, 0);
  });

test('context-fusion activity is scoped, while founder T0 summary reads remain unchanged', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  const urls = [];
  global.fetch = async function (url) {
    urls.push(String(url));
    return {ok:true,status:200,json:async function () { return []; }};
  };
  delete require.cache[fusionPath];
  const fusion = require(fusionPath);
  const unresolvedAuthority = await require('../pai/core/privacy/people.tier.js')
    .resolveReadTier(null, TEST_HAM);
  urls.length = 0;
  await fusion._test.readChannelActivity(TEST_HAM, unresolvedAuthority);
  assert.match(urls[0], /[?&]acl_tier=gte\.4(?:&|$)/);

  urls.length = 0;
  process.env.FOUNDER_HAM_UID = TEST_HAM;
  await fusion.getLatestSummary(TEST_HAM, await founderReadAuthority());
  const summaryUrl = urls.find(function (url) { return url.indexOf('context.fusion.') !== -1; });
  assert.ok(summaryUrl);
  assert.doesNotMatch(summaryUrl, /[?&]acl_tier=/,
    'T0 keeps the complete legacy context view with no structural predicate');
});

test('the summary puts a span in progress under TODAY and never under upcoming', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: true, grants_read: 1, grants_total: 1, partial: false, events: [
    { title: 'Multi-day trip', date: 'Wednesday, July 22', end_date: 'Sunday, July 26',
      time: 'all day', allDay: true, is_today: true, is_now: true, is_past: false }] });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM,
    await founderReadAuthority());

  assert.match(line, /calendar TODAY/);
  assert.match(line, /Multi-day trip/);
  assert.equal(line.indexOf('nothing on it for today itself'), -1,
    'THE EXACT SENTENCE HE CAUGHT. A day he is spending on a trip is not an empty day');
  assert.equal(line.indexOf('upcoming days hold'), -1,
    'a trip he is on right now may never be announced as upcoming');
  assert.match(line, /ALREADY UNDERWAY/, 'she is told the span is underway, not just that it exists');
  assert.match(line, /runs through Sunday, July 26/, 'and she holds the end, so she knows when it lifts');
});

test('the summary never lists an already-ended event as something still ahead of them', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: true, grants_read: 1, grants_total: 1, partial: false, events: [
    { title: 'Finished trip', date: 'Monday, July 20', end_date: 'Tuesday, July 21',
      time: 'all day', allDay: true, is_today: false, is_now: false, is_past: true }] });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM,
    await founderReadAuthority());

  assert.equal(line.indexOf('upcoming days hold'), -1);
  assert.equal(line.indexOf('Finished trip'), -1, 'a finished trip is not upcoming');
  // With nothing today and nothing ahead, the honest empty-read language still holds the line.
  assert.match(line, /CALENDAR read succeeded and returned no scheduled events/);
  assert.equal(line.indexOf('wide open'), -1);
});

test('a genuinely future event is still reported as upcoming and never as today', async function (t) {
  const fusionPath = fusionEnv(t);
  process.env.AIBE_BRAIN_URL = 'https://brain.test';
  process.env.AIBE_BRAIN_KEY = 'brain-key';
  serveFusion({ available: true, grants_read: 1, grants_total: 1, partial: false, events: [
    { title: 'Later conference', date: 'Wednesday, July 29', time: 'all day', allDay: true,
      is_today: false, is_now: false, is_past: false }] });

  delete require.cache[fusionPath];
  const line = await require(fusionPath).getLatestSummary(TEST_HAM,
    await founderReadAuthority());

  assert.match(line, /upcoming days hold: Later conference on Wednesday, July 29/);
  assert.match(line, /never present any of these as today/);
});

// ---------------------------------------------------------------------------
// anew#1030 regression lock: the span fix may not cost the honest-failure states.
// ---------------------------------------------------------------------------

test('the named unavailable reasons survive the span fix unchanged', async function (t) {
  const fusionPath = fusionEnv(t);
  global.fetch = async function () { throw new Error('no network in this case'); };

  // not this world: the EBC firewall, no request may leave the module
  process.env.FOUNDER_HAM_UID = 'HAM.TEST.OTHER';
  process.env.NYLAS_API_KEY = 'k';
  process.env.NYLAS_PERSONAL_GRANT = 'g';
  assert.equal((await readCal(fusionPath)).reason, 'calendar_not_this_world');

  // unconfigured: no key
  process.env.FOUNDER_HAM_UID = TEST_HAM;
  delete process.env.NYLAS_API_KEY;
  assert.equal((await readCal(fusionPath)).reason, 'calendar_unconfigured');

  // no grants configured
  process.env.NYLAS_API_KEY = 'k';
  delete process.env.NYLAS_PERSONAL_GRANT;
  assert.equal((await readCal(fusionPath)).reason, 'calendar_no_grants');

  // every grant failing is a failed read, never a successfully empty calendar
  process.env.NYLAS_PERSONAL_GRANT = 'g';
  global.fetch = async function () { return { ok: false, status: 401,
    json: async function () { return { data: [] }; } }; };
  const failed = await readCal(fusionPath);
  assert.equal(failed.available, false);
  assert.equal(failed.reason, 'calendar_read_failed');
  assert.equal(failed.grants_read, 0);
});

test('a partial read still admits it is incomplete, span fix or not', async function (t) {
  const fusionPath = fusionEnv(t);
  founderGrant();
  process.env.NYLAS_GMG_GRANT = 'grant-b';
  const now = Date.now();
  global.fetch = async function (url) {
    if (String(url).indexOf('grant-b') !== -1) return { ok: false, status: 500,
      json: async function () { return { data: [] }; } };
    if (String(url).indexOf('/calendars') !== -1) {
      return { ok: true, json: async function () {
        return { data: [{ id: 'cal-1', is_primary: true, name: 'primary' }] }; } };
    }
    return { ok: true, json: async function () { return { data: [{ id: 't', title: 'Trip',
      when: { start_date: ymd(now - 2 * DAY), end_date: ymd(now + 2 * DAY) } }] }; } };
  };

  const cal = await readCal(fusionPath);

  assert.equal(cal.available, true);
  assert.equal(cal.grants_read, 1);
  assert.equal(cal.grants_total, 2);
  assert.equal(cal.partial, true, 'one grant down is still an incomplete view and she is told so');
  assert.equal(cal.events[0].is_today, true, 'and the span logic holds on the grant that did answer');
});
