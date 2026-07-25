// ⬡B:core.context_fusion:BUILD:phase_3b_she_knows_your_day_20260710⬡
// PHASE 3B of the 2046 JARVIS roadmap: context fusion, the "she knows you're in
// DC looking for a spot" layer, built cold. A daemon fuses real sources into one
// rolling context object on the brain, and every judgment turn grounds against
// the freshest one, with decay language so stale context is never asserted as
// now. Sources, all real, all read-only:
//   calendar: the founder-world work grant (NYLAS_GRANT_ID on the sandbox app
//     key), next 24 hours, titles and times only. THE EBC WALL IS LAW HERE:
//     this module reads ONLY the configured founder-world grant and is
//     structurally incapable of touching client grants (BDIF, Mediators,
//     MH Action), because their env names never appear in this file.
//   channels: her own memory (channel_turn + portal_turn, last 24h) counted by
//     lane, so she knows where the conversation has been living.
//   screen: whether a live glass is open right now, and which portal.
// No LLM anywhere in this file. Cold code fuses; the mind only reads.
// Reached via the ABAHAM door (routes/context.fusion.routes.js), serving channel MESSAGES.
'use strict';
// ⬡B:core.context.fusion:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


const BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;

async function readCalendarNext24h(hamUid) {
  // B:context_fusion:FIX:ebc_firewall_multigrant_founder_only_20260712 CRITICAL EBC
  // GUARD: the multi-grant read (personal+GMG+BDIF+Mediators+MH Action merged) is
  // ONLY lawful for the founder's OWN personal world, which is his private command
  // center and allowed to see everything he owns. For ANY other world/HAM (a BDIF,
  // Mediators, or MH Action advisor/email cycle), merging grants would leak a sibling
  // world's calendar into that world's context -- the exact three-way firewall breach
  // that went live on 2026-07-11. So: founder personal -> all grants; any other world
  // -> no cross-world calendar at all. Isolation preserved.
  const FOUNDER = String(process.env.FOUNDER_HAM_UID || '');
  const isFounderPersonal = FOUNDER && String(hamUid || '').toUpperCase() === FOUNDER.toUpperCase();
  // ⬡B:context_fusion:GUARD:say_why_the_calendar_is_unavailable:20260725⬡ available:false was
  // one undifferentiated state covering four different situations: this is not the world that
  // may merge grants, no key, no grants, and the read actually broke. The reader below has to
  // treat those differently, because "not configured for this world" is a silence to keep and
  // "the read failed" is something she has to be able to say out loud. Naming the reason costs
  // nothing and never widens what may be read.
  if (!isFounderPersonal) return { available: false, events: [], reason: 'calendar_not_this_world' }; // never merge grants for a non-founder world
  const NY = 'https://api.us.nylas.com/v3/grants/';
  const KEY = process.env.NYLAS_API_KEY;
  if (!KEY) return { available: false, events: [], reason: 'calendar_unconfigured' };
  const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const grants = [process.env.NYLAS_PERSONAL_GRANT, process.env.NYLAS_GMG_GRANT, process.env.NYLAS_BDIF_GRANT,
    process.env.NYLAS_MEDIATORS_GRANT, process.env.NYLAS_MH_ACTION_GRANT].filter(Boolean);
  if (!grants.length) return { available: false, events: [], reason: 'calendar_no_grants' };
  const now = Math.floor(Date.now() / 1000), end = now + 24 * 3600;
  const events = [];
  // ⬡B:context_fusion:FIX:every_grant_failing_is_not_an_empty_calendar:20260725⬡ Each grant's
  // own catch below swallows its failure so one bad grant never blinds the rest, which is right.
  // But nothing counted the successes, so when EVERY grant failed this function still returned
  // available:true with an empty event list, and the reader downstream spoke that as a day with
  // nothing scheduled. A total read failure reported as a wide-open day is exactly the class of
  // false confidence that made her contradict the founder. Count the reads that actually landed.
  let grantsRead = 0;
  // ⬡B:context_fusion:FIX:per_ham_timezone_not_a_global_env:20260725⬡ The calendar dates the
  // cycle reads must land in THIS ham's own zone, not a single global env for everyone. One
  // shared resolver (core/ham.timezone.js): founder -> FOUNDER_TZ env, any ham -> their own
  // stored zone, honest documented default only if truly unknown, never UTC. Resolved once
  // for the whole read, not re-read per event.
  const _tz = await require('./ham.timezone.js').resolveHamTimezone(hamUid);
  try {
    await Promise.all(grants.map(async function (gid) {
      try {
        const cr = await fetch(NY + gid + '/calendars?limit=10', { headers: H });
        if (!cr.ok) return;
        const cals = (await cr.json()).data || [];
        const primary = cals.find(function (c) { return c.is_primary || (c.name && c.name.indexOf('@') !== -1); }) || cals[0];
        if (!primary) return;
        const er = await fetch(NY + gid + '/events?calendar_id=' + encodeURIComponent(primary.id) + '&start=' + now + '&end=' + end + '&limit=15', { headers: H });
        if (!er.ok) return;
        grantsRead++; // this grant's events genuinely came back; an empty list from here is real
        (((await er.json()).data) || []).forEach(function (e) {
          const when = e.when || {};
          const startTs = when.start_time || when.time || (when.start_date ? Math.floor(new Date(when.start_date + 'T00:00:00').getTime() / 1000) : 0);
          // ⬡B:context_fusion:FIX:multi_day_events_keep_their_end_here_too:20260725⬡ THE BUG THE
          // FOUNDER HIT TODAY, live: he is ON a July 22 to 26 trip and this fuse told her "the
          // CALENDAR has nothing on it for today itself; upcoming days hold: <trip> on Wednesday,
          // July 22". A trip he is on RIGHT NOW, described as upcoming, dated three days in the
          // past, with today reported empty. The cause was one missing field: this shape carried
          // only a START, so is_today was start-date equality, and a span that began before today
          // can never equal today no matter how far into it he is.
          // /os/calendar fixed exactly this on 20260718 (multi_day_events_keep_their_end) and its
          // classification is the proven, reviewed one. THIS IS A FAITHFUL MIRROR of the sibling
          // implementation in routes/os.api.routes.js (the stampDateClass block): same end
          // derivation, same is_now, same is_today, same is_past, so the two readers can never
          // disagree about the same event. It is mirrored rather than shared on purpose: both
          // files are hot lanes two days before the demo, and extracting live logic out of
          // another lane's file is the clobber this house already paid for once today. If the
          // pair is ever lifted into one home, lift BOTH sides together.
          // A Nylas datespan end_date is the LAST day INCLUSIVE, so the span runs through 23:59.
          // No end in the payload is represented honestly as no end (endTs === startTs, and no
          // end_date is emitted at all); an end is never invented to fill the hole.
          const endTs = when.end_time || (when.end_date ? Math.floor(new Date(when.end_date + 'T23:59:59').getTime() / 1000) : startTs);
          // ⬡B:context_fusion:FIX:human_dates_and_today_flag_for_the_cycle:20260718⬡ the cycle
          // was handed raw ISO ("Myrtle Beach at 2026-07-15T00:00:00.000Z") and left to do
          // its own timezone math, which is how it reads a passed all-day event as upcoming.
          // Cold code stamps the human date and whether it is genuinely today, same rule as
          // the /os/calendar choke point: all-day is a floating UTC square, timed is a local instant.
          // _tz is this ham's own resolved zone (hoisted above), not a global env.
          const _fL = new Intl.DateTimeFormat('en-US', { timeZone:_tz, weekday:'long', month:'long', day:'numeric' });
          const _fU = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'long', month:'long', day:'numeric' });
          const _fT = new Intl.DateTimeFormat('en-US', { timeZone:_tz, hour:'numeric', minute:'2-digit' });
          const _d = startTs ? new Date(startTs * 1000) : null;
          const _allDay = !!when.start_date;
          const _todayL = _fL.format(new Date());
          const _todayF = _fU.format(new Date(new Date().toLocaleString('en-US', { timeZone:_tz })));
          const _dateStr = _d ? (_allDay ? _fU.format(_d) : _fL.format(_d)) : null;
          var _timeStr = _d ? (_allDay ? 'all day' : _fT.format(_d)) : 'time unknown';
          // The end, stamped by the same rule as the start: an all-day span is a floating UTC
          // square, a timed span is a real instant in THIS ham's zone (_tz, resolved once above,
          // never UTC and never a global). An event with no distinct end keeps no end_date.
          const _hasEnd = !!(startTs && endTs && endTs !== startTs);
          const _eD = _hasEnd ? new Date(endTs * 1000) : null;
          const _endDateStr = _eD ? (_allDay ? _fU.format(_eD) : _fL.format(_eD)) : null;
          // SPAN OVERLAP, not start equality. Mirrors routes/os.api.routes.js exactly.
          // is_now: a multi-day span whose start is on or before today and whose end is on or
          // after today is HAPPENING NOW, and a thing happening now IS today's reality.
          const _startMs = startTs * 1000, _endMs = (endTs || startTs) * 1000, _nowMs = Date.now();
          const _isNow = (_startMs <= _nowMs + 86400000) && (_endMs >= _nowMs - 3600000)
            && (_endMs - _startMs > 86400000);
          var _isToday = !!(_dateStr && _dateStr === (_allDay ? _todayF : _todayL));
          if (_isNow) _isToday = true; // a trip covering today IS today, never "upcoming"
          const _isPast = !_isToday && !_isNow && (_endMs < (_nowMs - 86400000));
          events.push({ title: String(e.title || 'untitled').slice(0, 80),
            start: startTs ? new Date(startTs * 1000).toISOString() : null,
            end: _hasEnd ? new Date(endTs * 1000).toISOString() : null,
            date: _dateStr || 'date unknown', time: _timeStr,
            end_date: _endDateStr,
            is_today: _isToday, is_now: _isNow, is_past: _isPast,
            allDay: _allDay });
        });
      } catch (eg) { /* one grant failing never blinds the rest */ }
    }));
    events.sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
    if (!grantsRead) return { available: false, events: [], reason: 'calendar_read_failed',
      grants_read: 0, grants_total: grants.length };
    return { available: true, events: events.slice(0, 12),
      grants_read: grantsRead, grants_total: grants.length,
      partial: grantsRead < grants.length };
  } catch (e) { return { available: false, events: [], reason: 'calendar_read_failed',
    error: String(e && e.message || e || 'unknown').slice(0, 160) }; }
}

async function readChannelActivity(hamUid) {
  var _noChannels = Object.create(null);
  if (!_bu() || !_bk()) return _noChannels;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=source,content&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&created_at=gte.' + encodeURIComponent(since)
      + '&or=(source.like.logful.channel_turn.*,source.like.logful.portal_turn.*)&limit=200',
      { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    const counts = {};
    rows.forEach(function (row) {
      let ch = 'glass';
      try { const c = JSON.parse(row.content); ch = (c.channel) || (row.source.indexOf('portal_turn') !== -1 ? 'glass' : 'unknown'); } catch (e) {}
      counts[ch] = (counts[ch] || 0) + 1;
    });
    return counts;
  } catch (e) { return _noChannels; }
}

async function runFuse(hamUid) {
  if (!hamUid) return { ok: false, reason: 'hamUid required' };
  const cal = await readCalendarNext24h(hamUid);
  const channels = await readChannelActivity(hamUid);
  let screen = { live: false };
  try {
    const sa = require('./stream/screen.awareness.js');
    screen = { live: sa.hasLiveScreen(hamUid) };
  } catch (e) {}
  const fusion = { as_of: new Date().toISOString(), calendar: cal, channels: channels, screen: screen };
  try {
    const brain = require('./brain.client');
    await brain.writeBead({ hamUid: hamUid, agentGlobal: 'FUSION', type: 'CONTEXT_FUSION',
      source: 'context.fusion.' + hamUid + '.' + Date.now(), importance: 4,
      summary: '[CONTEXT FUSION] cal:' + (cal.available ? cal.events.length + ' events next 24h' : 'unavailable')
        + ' channels:' + Object.keys(channels).map(function (k) { return k + '=' + channels[k]; }).join(',')
        + ' screen:' + (screen.live ? 'live' : 'closed'),
      content: fusion,
      edges: [{ type: 'grounds', target: hamUid + '.judgment_turns' }] });
  } catch (e) { return { ok: false, reason: 'bead write failed: ' + e.message }; }
  return { ok: true, fusion: fusion };
}

// The mind's read: freshest fusion, formatted with honest decay language.
async function getLatestSummary(hamUid) {
  if (!_bu() || !_bk() || !hamUid) return '';
  try {
    const rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=content,created_at&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&source=like.context.fusion.*&order=created_at.desc&limit=1',
      { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    if (!rows.length) return '';
    const f = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
    const ageMin = Math.round((Date.now() - Date.parse(f.as_of)) / 60000);
    if (ageMin > 180) return ''; // too stale to assert at all
    const parts = [];
    if (f.calendar && f.calendar.available) {
      // ⬡B:context_fusion:FIX:today_not_iso_and_unreachable_is_real:20260718⬡ speak in
      // human today-terms off the stamped fields, never raw ISO, and separate the events
      // that are actually TODAY from later ones so the cycle never calls a future or past
      // day "today". available:false already means unreachable, so wide-open is only ever
      // asserted when the read genuinely succeeded and returned nothing.
      // ⬡B:context_fusion:FIX:a_span_he_is_on_is_today_not_upcoming:20260725⬡ e.is_today is now
      // span overlap (stamped above, mirroring /os/calendar), so a trip in progress lands in the
      // TODAY bucket where it belongs. Two things follow here. An event that has genuinely already
      // ended is dropped from the upcoming list rather than announced as something still ahead of
      // them, and a span that is underway carries its own start and end so she is holding the
      // whole shape of it, not a bare title with a start date three days behind her.
      var _today = (f.calendar.events || []).filter(function (e) { return e.is_today; });
      var _later = (f.calendar.events || []).filter(function (e) { return !e.is_today && !e.is_past; });
      if (_today.length) {
        var _todayStr = 'calendar TODAY: ' + _today.map(function (e) {
          if (e.is_now && e.end_date) {
            return e.title + ' (a multi-day span ALREADY UNDERWAY: it started ' + e.date
              + ' and runs through ' + e.end_date + ', so today falls inside it and they are on it now)';
          }
          return e.title + (e.allDay ? ' (all day)' : ' at ' + (e.time || e.start))
            + (e.end_date && e.end_date !== e.date ? ' (through ' + e.end_date + ')' : '');
        }).join('; ');
        if (_later.length) { _todayStr += ' | later this window (NOT today): ' + _later.map(function (e) { return e.title + ' on ' + (e.date || e.start); }).join('; '); }
        parts.push(_todayStr);
      } else if (_later.length) {
        parts.push('the CALENDAR has nothing on it for today itself; upcoming days hold: ' + _later.map(function (e) { return e.title + ' on ' + (e.date || e.start); }).join('; ') + ' (never present any of these as today). An empty calendar for today is not the same as an empty day: check what they told you directly before you call today open');
      } else {
        // ⬡B:context_fusion:FIX:an_empty_calendar_is_not_a_confident_open_day:20260725⬡ THIS LINE
        // IS THE ONE HE CAUGHT. It used to read "your next 24 hours are wide open with nothing
        // scheduled (this is real, known information, not a lack of it)", and it is where "your
        // day is open, no meetings locked in" came from, hours after he had told her his Saturday
        // plan himself and she had confirmed it back to him in detail. Cold code took one silent
        // source, the calendar, DECIDED that its silence meant the day was empty, and handed her
        // that as settled fact with an instruction to lead with it. That is cold code deciding
        // meaning, which is not its job. Its job is to carry the evidence and say exactly what
        // the evidence is. So this now says what actually happened, that the calendar read
        // succeeded and returned nothing, names its own limits, and leaves the day itself for her
        // to answer from everything she holds. She may still tell him his day is open when it is.
        // She may no longer be handed that conclusion by a module that only looked at one place.
        parts.push('the CALENDAR read succeeded and returned no scheduled events for the next 24 hours. '
          + 'That is a real, successful read of the CALENDAR, and the calendar is only one source: '
          + 'anything this person told you directly, in conversation, may never have been put on it. '
          + 'So this means "nothing is on the calendar", which is NOT the same as "the day is open". '
          + 'Before you describe their day as open, clear, free, or empty, check what they told you '
          + 'directly, and if they told you a plan then that plan stands and this empty calendar does '
          + 'not cancel it. If nothing else is in front of you either, then say the calendar is clear '
          + 'and say that is what you are going on, rather than declaring the whole day empty');
      }
    } else if (f.calendar && f.calendar.reason === 'calendar_read_failed') {
      // ⬡B:context_fusion:FIX:a_failed_read_is_spoken_honestly_not_omitted:20260725⬡ A failed
      // calendar read used to contribute nothing at all to this summary. Silence is not honest
      // here: with no line saying otherwise she has nothing to stop her filling the gap
      // confidently, which is the same failure one branch up wearing a different coat. An
      // unavailable read is real information and she can say it out loud. The other unavailable
      // reasons (not this world, unconfigured, no grants) stay silent on purpose: those are
      // configuration, not a fault, and there is nothing for her to report.
      parts.push('the CALENDAR READ FAILED on this fuse, so you do not currently know what is on '
        + 'their calendar. This is an unavailable read, NOT an empty calendar and NOT an open day. '
        + 'If they ask about their schedule, say plainly that you cannot reach their calendar right '
        + 'now and answer from what you do hold. Never present this failure as a clear day');
    }
    if (f.calendar && f.calendar.available && f.calendar.partial) {
      parts.push('note: only ' + f.calendar.grants_read + ' of ' + f.calendar.grants_total
        + ' calendars answered on this fuse, so this view may be incomplete; say so if it matters');
    }
    const chKeys = Object.keys(f.channels || {});
    if (chKeys.length) parts.push('recent conversation lanes (24h): ' + chKeys.map(function (k) { return k + ' x' + f.channels[k]; }).join(', '));
    if (!parts.length) return '';
    // ⬡B:context_fusion:FIX:the_fuse_is_evidence_not_the_verdict_on_their_day:20260725⬡ This
    // wrapper used to say "answer from THIS first, above any memory search". That single clause
    // ranked one cold source above everything the person had actually said to her, including the
    // plan he had given her hours earlier and she had confirmed back to him. It also outranked the
    // SEARCH FIRST rule the wall spends a paragraph establishing. The fuse stays exactly as
    // useful as it always was, and it keeps its honest decay language, because a real dated read
    // beats a guess. What it loses is the authority to end the question. It is evidence now.
    return '\nWORLD CONTEXT, fused as of ' + ageMin + ' minutes ago. This is real, dated evidence '
      + 'you genuinely hold, so use it directly and in "as of" terms, never as this exact second, '
      + 'and never say you have no information about something it plainly tells you. It is EVIDENCE '
      + 'and not the verdict: it does not outrank what this person told you themselves, and where it '
      + 'is silent you simply do not know rather than knowing there is nothing. Weigh it together '
      + 'with what they told you directly, and never turn a silence or an empty read here into a '
      + 'confident claim about their day: ' + parts.join(' | ');
  } catch (e) { return ''; }
}

// _test exposes the calendar read for proof only, the same convention core/find.js and
// core/fcw.builder.js already use. It stays out of the public surface: nothing but runFuse
// may drive a calendar read, so the EBC founder-world-only firewall above keeps its one door.
module.exports = { runFuse, getLatestSummary, _test: { readCalendarNext24h } };
