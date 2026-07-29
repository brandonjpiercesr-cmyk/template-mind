// ⬡B:tests.toolcal.span.today:PROOF:the_third_reader_of_the_same_calendar:20260725⬡
// ACL: Entered through the ABAHAM door, serving channel MESSAGES. Regression lock on the
// founder-caught failure of 20260725, observed live on his own world at commit cd5f3aea5.
//
// He asked "What is on my calendar today?" and she answered:
//
//   "Your calendar for today, Saturday, July 25th, is clear, no scheduled events. You've got
//    the day open."
//
// That was FALSE. /os/calendar had the same event correct on the same data at the same moment:
// a multi-day span, is_today true, is_now true, end_date present. And the FUSED world context
// she was handed was ALREADY CORRECT after anew#1054, which had merged hours earlier.
//
// So the data reaching her was right and the answer was wrong anyway. The reason: this tool.
// core/tool.loop.js calendar_read is the THIRD reader of the same calendar, and it re-derived
// the classification itself, with the original bug intact. It read only ev.at, threw ev.endAt
// away, and set is_today by START-DATE EQUALITY. A span that began before today can never
// equal today, so a trip he was standing inside came back not-today, and the tool's own note
// then told her in pre-written cold code that "today itself is open".
//
// Two sins, both fixed here and both locked by this suite:
//   1. START EQUALITY instead of SPAN OVERLAP. Now mirrored line for line from the two proven
//      siblings: routes/os.api.routes.js stampDateClass (20260718) and core/context.fusion.js
//      (anew#1054), so all three readers of this one calendar classify identically.
//   2. COLD CODE DECIDING MEANING. A read that found nothing on today is a fact about THE
//      READ, not a verdict on his day. Cold code reports the count; the sentence stays hers.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TOOL_LOOP = path.join(ROOT, 'pai', 'core', 'tool.loop.js');
const HAM_TZ = path.join(ROOT, 'pai', 'core', 'ham.timezone.js');

// A HAM UID that belongs to nobody. Identity is env-only and never a literal person; a test
// fixture is shippable code like any other.
const TEST_HAM = 'HAM.TEST.TOOLCAL';
const TZ = 'America/New_York';
const DAY = 86400000;

// Same isolation the neighbouring fusion.span.today suite uses: no real network, and the
// per-HAM zone resolver pinned so the assertions are about THIS module's math and not the
// resolver's. The zone is a real Eastern zone precisely so the UTC-versus-local split is
// observable rather than theoretical.
function toolEnv(t) {
  const oldFetch = global.fetch;
  const oldBase = process.env.SELF_BASE_URL;
  t.after(function () {
    global.fetch = oldFetch;
    delete require.cache[TOOL_LOOP];
    delete require.cache[HAM_TZ];
    if (oldBase == null) delete process.env.SELF_BASE_URL;
    else process.env.SELF_BASE_URL = oldBase;
  });
  process.env.SELF_BASE_URL = 'https://self.test';
  require.cache[HAM_TZ] = { id: HAM_TZ, filename: HAM_TZ, loaded: true,
    exports: { resolveHamTimezone: async function () { return TZ; } } };
}

// Serve exactly what the real /os/calendar choke point serves: epoch millisecond at and endAt,
// an allDay flag, and the fields it already stamps. endAt equals at when the provider gave no
// distinct end, which is how a missing end arrives here honestly.
function serveCalendar(events) {
  const seen = [];
  global.fetch = async function (url) {
    seen.push(String(url));
    return { ok: true, json: async function () { return { ok: true, events: events }; } };
  };
  return seen;
}

async function calendarRead() {
  delete require.cache[TOOL_LOOP];
  const exposed = require(TOOL_LOOP)._test;
  const raw = await exposed.executeTool('calendar_read', { ham_uid: TEST_HAM }, TEST_HAM,
    'What is on my calendar today?', undefined);
  return JSON.parse(raw);
}

// ---- date helpers, all computed from the clock so this suite never rots ----
function ymd(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit',
    day: '2-digit' }).format(new Date(ms));
}
function human(ms, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric' }).format(new Date(ms));
}
// An all-day square is a FLOATING date: the calendar sends it as midnight UTC and it means that
// square, not an instant. This builds the same shape the provider does.
function allDayStart(dayOffset) {
  return Date.parse(ymd(Date.now() + dayOffset * DAY) + 'T00:00:00Z');
}
function allDayEnd(dayOffset) {
  return Date.parse(ymd(Date.now() + dayOffset * DAY) + 'T23:59:59Z');
}
// The real UTC instant of a wall-clock hour TODAY in the HAM's Eastern zone.
function easternWallToday(hour, minute) {
  const now = new Date();
  const etWall = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const offset = now.getTime() - etWall.getTime();
  const wall = new Date(etWall);
  wall.setHours(hour, minute, 0, 0);
  return wall.getTime() + offset;
}
const OPENNESS = /\b(open|clear|free|empty|nothing (?:on|scheduled))\b/i;

// ---------------------------------------------------------------------------
// THE BUG ITSELF: a span he is standing in the middle of.
// ---------------------------------------------------------------------------

test('an all-day multi-day span covering today is TODAY and is never upcoming', async function (t) {
  toolEnv(t);
  serveCalendar([{ title: 'Multi-day trip', org: 'personal', allDay: true,
    at: allDayStart(-3), endAt: allDayEnd(1), location: '' }]);

  const out = await calendarRead();

  assert.equal(out.ok, true);
  assert.equal(out.events.length, 1);
  const e = out.events[0];
  assert.equal(e.is_today, true, 'a trip he is ON right now is today, not something ahead of him');
  assert.equal(e.is_now, true, 'a span whose start is behind us and whose end is ahead is underway');
  assert.equal(e.is_past, false);
  assert.equal(e.date, human(allDayStart(-3), 'UTC'),
    'the span still reports its own real start date, an EARLIER day, verbatim');
  assert.notEqual(e.date, out.today_is,
    'and that start genuinely is not today, which is exactly why start equality could never catch it');
  assert.equal(e.end_date, human(allDayEnd(1), 'UTC'),
    'an all-day end is a floating calendar square, read in UTC like its start');
  assert.equal(out.events_today, 1, 'and it counts as an event on today');
});

test('a TIMED multi-day span covering today is TODAY too, stamped in the HAM zone', async function (t) {
  toolEnv(t);
  const startMs = Date.now() - 2 * DAY, endMs = Date.now() + 2 * DAY;
  serveCalendar([{ title: 'Timed multi-day conference', org: 'personal', allDay: false,
    at: startMs, endAt: endMs, location: '' }]);

  const e = (await calendarRead()).events[0];

  assert.equal(e.is_today, true, 'a timed span running across today is today');
  assert.equal(e.is_now, true);
  assert.equal(e.is_past, false);
  assert.equal(e.date, human(startMs, TZ), 'a timed instant is read in the HAM zone, never UTC');
  assert.equal(e.end_date, human(endMs, TZ), 'and so is its end');
});

test('an event that already ended is is_past, and is neither today nor underway', async function (t) {
  toolEnv(t);
  serveCalendar([{ title: 'Finished trip', org: 'personal', allDay: false,
    at: Date.now() - 6 * DAY, endAt: Date.now() - 4 * DAY, location: '' }]);

  const e = (await calendarRead()).events[0];

  assert.equal(e.is_today, false, 'a finished event is not today');
  assert.equal(e.is_now, false, 'a finished event is not underway');
  assert.equal(e.is_past, true, 'and cold code says so plainly rather than leaving it ambiguous');
});

test('a single all-day square today stays today and is not mistaken for a span', async function (t) {
  toolEnv(t);
  serveCalendar([{ title: 'All day today', org: 'personal', allDay: true,
    at: allDayStart(0), endAt: allDayEnd(0), location: '' }]);

  const e = (await calendarRead()).events[0];

  assert.equal(e.is_today, true);
  assert.equal(e.is_now, false, 'a single square is not a multi-day span underway');
  assert.equal(e.is_past, false);
  assert.equal(e.time, 'all day');
});

test('an event later today is today, in the HAM zone, and is not a span', async function (t) {
  toolEnv(t);
  // 11:30pm Eastern TODAY. In UTC this instant is already tomorrow, which is exactly the roll
  // that put her on the wrong day before the per-HAM zone landed.
  const startMs = easternWallToday(23, 30);
  serveCalendar([{ title: 'Late call', org: 'personal', allDay: false,
    at: startMs, endAt: startMs + 3600000, location: '' }]);

  const e = (await calendarRead()).events[0];

  assert.notEqual(human(startMs, TZ), human(startMs, 'UTC'),
    'this instant genuinely falls on different days in UTC and Eastern, so the zone had to matter');
  assert.equal(e.date, human(startMs, TZ), 'the date is the HAM local day');
  assert.equal(e.is_today, true, 'a late-evening Eastern instant today is still today');
  assert.equal(e.is_now, false, 'a one-hour call tonight is not a multi-day span underway');
});

test('an event the provider gave no end for invents none', async function (t) {
  toolEnv(t);
  const startMs = Date.now() + 3600000;
  // The real source sets endAt equal to at when there is no distinct end. That is a missing
  // end represented honestly, and nothing may be conjured to fill it.
  serveCalendar([{ title: 'No end given', org: 'personal', allDay: false,
    at: startMs, endAt: startMs, location: '' }]);

  const e = (await calendarRead()).events[0];

  assert.equal(Object.prototype.hasOwnProperty.call(e, 'end_date'), false,
    'no end date field is emitted at all when the provider gave no end');
  assert.equal(e.end_date, undefined, 'and nothing is fabricated to cover the hole');
  assert.equal(e.is_now, false);
});

// ---------------------------------------------------------------------------
// THE SECOND SIN: cold code deciding what the read MEANS.
// ---------------------------------------------------------------------------

test('the note never declares the day open when events exist but none fall on today', async function (t) {
  toolEnv(t);
  serveCalendar([{ title: 'Next week thing', org: 'personal', allDay: false,
    at: Date.now() + 5 * DAY, endAt: Date.now() + 5 * DAY + 3600000, location: '' }]);

  const out = await calendarRead();

  assert.equal(out.events_today, 0);
  assert.equal(out.note.indexOf('today itself is open'), -1,
    'THE EXACT PRE-WRITTEN SENTENCE. Cold code does not get to rule on his day');
  assert.match(out.note, /1 event\(s\) in the window/,
    'it reports the count, which is the only thing the read actually proves');
  assert.match(out.note, /not a verdict on their day/,
    'and it says outright that the count is not a conclusion');
});

test('an entirely empty read reports an empty READ, never an open day', async function (t) {
  toolEnv(t);
  serveCalendar([]);

  const out = await calendarRead();

  assert.equal(out.events_today, 0);
  assert.equal(out.events.length, 0);
  assert.match(out.note, /read came back empty/,
    'the honest statement is about the read, not about his life');
  // The only openness words allowed anywhere in the note are the ones inside a prohibition.
  // These are the CLAIM forms, and not one of them may appear.
  assert.equal(/\b(today itself is open|the day is open|your day is open|the day is clear)\b/i.test(out.note),
    false, 'cold code never concludes the day is open off the back of a read');
  assert.match(out.note, /rather than concluding their day is open/,
    'and it tells her plainly not to draw that conclusion either');
});

test('no branch of the note ever asserts openness in cold code', async function (t) {
  toolEnv(t);
  const cases = [
    [],
    [{ title: 'Later', org: 'personal', allDay: false, at: Date.now() + 5 * DAY,
      endAt: Date.now() + 5 * DAY + 3600000, location: '' }],
    [{ title: 'Trip', org: 'personal', allDay: true, at: allDayStart(-3),
      endAt: allDayEnd(1), location: '' }]
  ];
  for (const events of cases) {
    serveCalendar(events);
    const out = await calendarRead();
    // Every openness word in the note must be part of an INSTRUCTION NOT to conclude it,
    // never a claim. The claim forms are the ones that shipped the false answer.
    assert.equal(/\b(today itself is open|the day is open|your day is open|day is clear)\b/i.test(out.note),
      false, 'no branch may assert an open or clear day: ' + out.note);
    assert.equal(OPENNESS.test(out.note) && !/do not|rather than|never/i.test(out.note), false,
      'any openness word present must sit inside a prohibition, not a claim: ' + out.note);
  }
});

// ---------------------------------------------------------------------------
// The guidance she is handed alongside the facts.
// ---------------------------------------------------------------------------

test('the guidance keeps the old rules and extends them to spans', async function (t) {
  toolEnv(t);
  serveCalendar([{ title: 'Trip', org: 'personal', allDay: true,
    at: allDayStart(-3), endAt: allDayEnd(1), location: '' }]);

  const note = (await calendarRead()).note;

  // Preserved from before: the rules that were already correct are not traded away for the fix.
  assert.match(note, /NEVER describe an event with is_past true as upcoming/,
    'the is_past rule survives the span fix unchanged');
  assert.match(note, /own date field verbatim and do not compute dates yourself/,
    'and so does the rule that she never does her own date math');
  // New, and the whole point: a span underway is happening NOW.
  assert.match(note, /is_now/, 'she is told the is_now flag exists');
  assert.match(note, /already UNDERWAY/,
    'and told what an is_today event with an earlier date actually means');
  assert.match(note, /never call it upcoming or still ahead of them/,
    'a trip he is on right now may never be announced as upcoming');
});

test('the read still reaches the real founder-gated calendar source, unchanged', async function (t) {
  toolEnv(t);
  const seen = serveCalendar([]);

  await calendarRead();

  assert.equal(seen.length, 1, 'one read, no retry needed when the source answers');
  assert.match(seen[0], /\/os\/calendar\/HAM\.TEST\.TOOLCAL$/,
    'still the existing EBC-firewall-gated choke point, no parallel implementation');
});

// ---------------------------------------------------------------------------
// The honest-failure states may not be quietly traded away for the span fix.
// ---------------------------------------------------------------------------

test('an unreachable source is still an unreachable source, never an empty day', async function (t) {
  toolEnv(t);
  let calls = 0;
  global.fetch = async function () { calls++; return { ok: false, status: 502,
    json: async function () { return null; } }; };

  delete require.cache[TOOL_LOOP];
  const exposed = require(TOOL_LOOP)._test;
  const out = JSON.parse(await exposed.executeTool('calendar_read', { ham_uid: TEST_HAM },
    TEST_HAM, 'What is on my calendar today?', undefined));

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'calendar_source_unreachable');
  assert.equal(calls, 2, 'the one retry over the deploy window is preserved');
  assert.match(out.note, /NOT an empty day/,
    'a dead source reports itself dead, it does not report an open day');
});
