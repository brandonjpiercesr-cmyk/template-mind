// ⬡B:agents.awa.verify:MODULE:cold_posting_verification:20260716⬡
// AWA posting verification. C0 tier: pure code, no LLM, no credentials, no reach.
//
// WHY THIS EXISTS (real failure, 20260716): a job-posting filter matched location
// PHRASES in rendered HTML. Idealist renders remote/deadline through JavaScript, so
// a static read saw none of it and rejected 96 of 97 live postings. The structured
// JSON-LD carried the truth the whole time.
//
// The order below is the lesson, and it is not interchangeable:
//   1. STRUCTURED FIRST. jobLocationType + applicantLocationRequirements are the
//      signal. Never phrase-match rendered HTML for location.
//   2. PROSE OVERRIDES STRUCTURED. Boards publish TELECOMMUTE + Country:US and then
//      write "must reside in Illinois" in the description. The prose wins. Two real
//      postings lied this way on 20260716 and both were caught here.
//   3. A DEADLINE MUST BE REAL AND FUTURE. No deadline is not "open", it is unknown.
//
// UNIVERSALITY: takes a parsed posting and a config. No HAM UID, no grant, no org
// roster, no channel. Any HAM's advisor calls this unchanged. It never fetches.
'use strict';

var TELECOMMUTE = 'TELECOMMUTE';

// A posting is state-locked when its prose narrows residency, regardless of what the
// structured block claims. These are the shapes seen in the wild, not invented.
var RESIDENCY_LOCK_PATTERNS = [
  /must\s+reside\s+in\s+([^.,;)\n\r]{2,60})/i,
  /candidate\s+to\s+reside\s+in\s+([^.,;)\n\r]{2,60})/i,
  /must\s+(?:live|be\s+located|be\s+based)\s+in\s+([^.,;)\n\r]{2,60})/i,
  /residency\s+in\s+([^.,;)\n\r]{2,60})\s+(?:is\s+)?required/i,
  /only\s+considering\s+candidates\s+(?:who\s+)?(?:reside|located)\s+in\s+([^.,;)\n\r]{2,60})/i,
  /work\s+must\s+be\s+performed\s+in\s+or\s+near\s+([^.,;)\n\r]{2,60})/i
];

// If the narrowed region IS the whole country, it is not a lock.
function isNationwide(phrase) {
  var p = String(phrase || '').toLowerCase();
  return /\b(united states|the us|the u\.s\.|usa|anywhere in the us|nationwide)\b/.test(p);
}

function residencyLock(descriptionText) {
  var text = String(descriptionText || '');
  for (var i = 0; i < RESIDENCY_LOCK_PATTERNS.length; i++) {
    var m = text.match(RESIDENCY_LOCK_PATTERNS[i]);
    if (m && m[1] && !isNationwide(m[1])) {
      return String(m[1]).trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

// Structured remote read. Returns true only when the board says telecommute AND the
// applicant-location requirement is the whole country (or is absent alongside
// telecommute, which boards do use to mean unrestricted).
function structuredRemote(posting) {
  var locType = String(posting.jobLocationType || '').toUpperCase();
  if (locType !== TELECOMMUTE) return { remote: false, reason: 'no_telecommute_flag' };

  var alr = posting.applicantLocationRequirements;
  if (!alr) return { remote: true, reason: 'telecommute_unrestricted' };

  var names = [];
  (Array.isArray(alr) ? alr : [alr]).forEach(function (a) {
    if (a && a.name) names.push(String(a.name));
  });
  if (!names.length) return { remote: true, reason: 'telecommute_unrestricted' };

  var allCountry = names.every(function (n) {
    return /^(US|USA|United States)$/i.test(n.trim());
  });
  if (allCountry) return { remote: true, reason: 'telecommute_country_us' };
  return { remote: false, reason: 'applicant_location_restricted:' + names.join('/') };
}

function deadlineVerdict(validThrough, nowISO) {
  if (!validThrough) return { ok: false, reason: 'no_deadline_stated', date: null };
  var d = String(validThrough).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, reason: 'unparseable_deadline', date: null };
  var today = String(nowISO).slice(0, 10);
  if (d < today) return { ok: false, reason: 'deadline_passed', date: d };
  return { ok: true, reason: d === today ? 'deadline_today' : 'deadline_future', date: d };
}

// Track classification is driven by a caller-supplied spec so no roster is baked in.
// spec: { tracks: [ { id, titles:[..], exclude:[..], employment:'FULL_TIME'|'PART_TIME'|null } ] }
function classify(posting, spec) {
  if (!spec || !Array.isArray(spec.tracks)) return { track: null, reason: 'no_track_spec' };
  var title = String(posting.title || '').toLowerCase();
  var emp = String(posting.employmentType || '').toUpperCase();
  var isPart = emp.indexOf('PART_TIME') >= 0 || emp.indexOf('CONTRACTOR') >= 0;

  for (var i = 0; i < spec.tracks.length; i++) {
    var t = spec.tracks[i];
    var excluded = (t.exclude || []).some(function (x) { return title.indexOf(String(x).toLowerCase()) >= 0; });
    if (excluded) continue;
    var hit = (t.titles || []).some(function (x) { return title.indexOf(String(x).toLowerCase()) >= 0; });
    if (!hit) continue;
    if (t.employment === 'FULL_TIME' && isPart) continue;
    if (t.employment === 'PART_TIME' && !isPart) continue;
    return { track: t.id, reason: 'title_match' };
  }
  return { track: null, reason: 'no_track_match' };
}

/**
 * verify(posting, opts)
 * posting: { title, employmentType, validThrough, jobLocationType,
 *            applicantLocationRequirements, descriptionText, url, org, salary }
 * opts:    { nowISO, trackSpec, requireNationwideRemote }
 * returns: { keep, track, deadline, remote, drop_reason, evidence }
 */
function verify(posting, opts) {
  posting = posting || {};
  opts = opts || {};
  var nowISO = opts.nowISO || new Date().toISOString();
  var evidence = [];

  var dl = deadlineVerdict(posting.validThrough, nowISO);
  evidence.push('deadline:' + dl.reason + (dl.date ? '(' + dl.date + ')' : ''));

  var sr = structuredRemote(posting);
  evidence.push('structured_remote:' + sr.reason);

  // Step 2: prose overrides structured. This is the whole point of the module.
  var lock = residencyLock(posting.descriptionText);
  if (lock) evidence.push('prose_residency_lock:' + lock);

  var remoteOk = sr.remote && !lock;
  var cls = classify(posting, opts.trackSpec);
  evidence.push('track:' + (cls.track || 'none') + '(' + cls.reason + ')');

  var drop = null;
  if (!dl.ok) drop = dl.reason;
  else if (opts.requireNationwideRemote !== false && !remoteOk) {
    drop = lock ? ('state_locked:' + lock) : sr.reason;
  } else if (!cls.track) drop = cls.reason;

  return {
    keep: !drop,
    track: cls.track,
    deadline: dl.date,
    remote: remoteOk,
    drop_reason: drop,
    evidence: evidence,
    url: posting.url || null,
    org: posting.org || null,
    title: posting.title || null,
    salary: posting.salary || null
  };
}

module.exports = { verify: verify, residencyLock: residencyLock, structuredRemote: structuredRemote, deadlineVerdict: deadlineVerdict, classify: classify };
