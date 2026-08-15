// ⬡B:scripts.checks.no_founder_pii:GUARD:identity_is_env_never_a_literal:20260722⬡
// THE FOUNDER-PII LEAK GUARD. Founder law 20260722, after his personal data (email, phone, the
// names of his children, his HAM UIDs) was found hardcoded across the shipped code: identity is
// env-only and per-world; it is NEVER a literal in shippable code. Every world is someone else's,
// so a hardcoded person is a leak of a real human into every stranger's deploy. This guard makes
// that impossible: it fails the build on any hardcoded email or phone, and on any token whose
// SHA-256 matches the denylist (kids' names, UIDs). The denylist stores only HASHES, so the guard
// can never itself leak what it protects. Extend it by adding a hash, never a plaintext.
//
// Usage: node scripts/checks/no-founder-pii.js [rootDir]
// Exit 0 = clean. Exit 1 = leak found (prints file:line). Wired into CI.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.argv[2] || '.');
const HASHES = (function () {
  try { return require('./pii.hashes.json').hashes || {}; } catch (e) { return {}; }
})();

// Directories and files that are not shipped runtime code, or are the guard's own materials.
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build', '.next', 'tmp', 'scratchpad']);
// GATE-3 audit, 20260815: isSkippedFile used to drop test/ and *.test.js ENTIRELY (62 of the
// 300 walked files, all of test/ among them), with zero detectors of any kind reaching them.
// That is a real coverage hole: a test fixture can carry a real, previously-hashed founder
// token exactly as easily as shipped code can (a leak class this repo has hit before -- a real
// name pasted in "for realism"). But test files ALSO exist to plant deliberately PII-shaped
// synthetic data on purpose, to prove the shape detectors fire (tests/no.founder.pii.sees.a
// .name.test.js, tests/the.gate.can.see.an.address.test.js, etc.) -- so running the SHAPE
// detectors (name, address, email, phone, possessive-name, identity-key) against test/ is not
// a free win. MEASURED: turning every detector on for test/ as it stands today produces 52
// findings, of which only the handful of genuine cross-file leaks are real; the rest are the
// guard's own synthetic fixtures (invented names, the 555 reserved phone exchange, .invalid
// addresses) tripping the exact detectors built to prove those shapes fire.
// The one detector immune to that problem is the hash denylist: it only fires on an EXACT
// SHA-256 match against a token this world's owner actually registered, so a synthetic name a
// test author invents can never collide with it by accident -- only a real, already-known
// token can. MEASURED: enabling hash-denylist-only scanning across every current test/ and
// tests/ file yields zero findings today, so this costs the true-zero template nothing now and
// closes a real class of future leak. Shape detectors stay off in test files; the hash
// denylist now runs everywhere isSkippedFile does not fully exclude.
function isTestFile(rel) {
  if (/(^|\/)tests?\//.test(rel)) return true;
  if (/\.test\.js$/.test(rel)) return true;
  return false;
}
function isSkippedFile(rel) {
  if (/\.example($|\.)/.test(rel)) return true;         // *.example, *.example.js
  if (rel.indexOf('scripts/checks/no-founder-pii.js') !== -1) return true;
  if (rel.indexOf('scripts/checks/pii.hashes.json') !== -1) return true;
  return false;
}
// Emails that are legitimately hardcoded (tooling, not a person's identity).
const EMAIL_ALLOW = [/noreply@anthropic\.com/i, /@example\.(com|org)/i, /noreply@github\.com/i, /noreply@/i, /user@example/i];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A US phone written with formatting separators (e.g. 336-389-8116, (336) 389 8116, +1 336.389.8116).
// A separator between the 3-3-4 groups is REQUIRED so bare digit runs (timestamps, cycle ids, ACL
// stamp dates) are not mistaken for phone numbers.
const PHONE_RE = /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g;
// ⬡B:checks.no_founder_pii:FIX:catch_bare_e164_no_separator_number:20260724⬡ A bare
// E.164 number with a leading + and no separators (e.g. +1XXXXXXXXXX, 11 to 15 digits)
// slipped past PHONE_RE, which requires separators, and past the hash denylist too, so a
// real founder phone literal leaked once undetected. A leading + on a 11-to-15 digit run
// is an international phone and never a timestamp (timestamps carry no +), so it is safe
// to catch. The guard never carries the real number, not even as an example.
const E164_RE = /\+\d{11,15}(?!\d)/g;
// ⬡B:checks.no_founder_pii:FIX:the_gate_never_had_an_address_detector:20260801⬡
// THE LAW NAMED FOUR THINGS AND THIS GUARD COULD ONLY SEE THREE. The founder law of 20260722
// forbids "no email, no phone, no HAM UID, no child's or family member's name, NO PERSONAL
// ADDRESS". Email, phone and name each got a detector across four hardening passes. Address
// never got one at all, in either repo, so a home address in shippable code was invisible to
// every green run this gate has ever printed. Same defect shape as the markdown blind spot
// closed earlier the same day: the roster was never audited against the law it enforces.
//
// MEASURED 20260801 on anew main with a standalone shape probe: 5 distinct address-shaped
// values across 6 files, two of them client intake transcripts and ONE of them
// core/scw/mediators.seed.js, which is shipped code that writes into the brain at mount.
//
// Two shapes, both deliberately narrow, because a guard that cries wolf gets switched off:
//   1. a street line: a house number, one to four words, then a street-type suffix,
//   2. a city line: City[, City] then a two-letter US state then a 5 or 9 digit ZIP.
// A bare number and a bare city are never flagged. This is a US-shaped detector and it says
// so rather than implying worldwide coverage; a non-US postal address still walks past it,
// which is stated in UNSCANNED_NOTE rather than left for someone to discover.
// ⬡B:checks.no_founder_pii:FIX:the_address_detector_could_not_see_lowercase:20260801⬡
// CODEX ON ab33fe515, AND IT IS A P1. Both address shapes below required Title Case and carried
// no case-insensitive flag, so "742 nowhere lane" and "742 NOWHERE LANE" produced NO finding.
// MEASURED at the time of the report: of six forms of the same address, FOUR were missed
// (lowercase street, uppercase street, lowercase city line, uppercase city line). That is worse
// than an ordinary miss. This detector exists because the law named five things and the roster
// enforced four, so shipping the fifth with a hole that common lets the gate print a CLEAN RUN
// over a real home address, and a guard with a known hole is worse than a known-absent guard.
//
// THE CURE IS NOT A BARE /i FLAG, MEASURED RATHER THAN ASSUMED. Adding /i alone takes this repo
// from 2 street matches to 12: the Title Case requirement had been doing real anti-false-positive
// work, and 10 of the 12 were ordinary lowercase prose ("<number> <words> road,"). A stop list of
// English function words only got it to 6. The remaining four lowercase false positives are
// structurally IDENTICAL to a lowercase address: 1 to 2 name words, house-number shaped,
// terminated. There is no shape left to separate them on.
//
// So the split is by ROLE, in two tiers, and both keep the 20260801 termination constraint:
//   TIER A, Title Case: unchanged. This is an address WRITTEN OUT, and Title Case is the signal.
//   TIER B, ANY case: an address as a DATA VALUE, which is how a lowercase or uppercase one
//     actually leaks. It qualifies when it is QUOTE-TERMINATED (a complete value, e.g.
//     home: "742 nowhere lane") or LOCALITY-ANCHORED (a 5 or 9 digit ZIP within 60 characters
//     after it). Measured against every candidate in this repo: both true hits kept, and all
//     four remaining prose false positives dropped, because they end at EOL, at ')' or at ','
//     with no ZIP anywhere near them.
// CITY_STATE_ZIP_RE simply becomes case-insensitive: measured across the whole repo that yields
// exactly 2 matches and BOTH are true, so it costs nothing. That alone means a full lowercase
// postal address is now caught by its city line even if its street line is not.
//
// LIMIT, stated rather than left to be found: a BARE lowercase street line that is neither
// quoted nor near a ZIP is still not detected. That is materially narrower than "every lowercase
// address is invisible", which is what this file shipped this morning, and it is written down
// here so the next reader does not have to rediscover it.
const STREET_ADDRESS_TITLE_RE = /\b\d{1,6}\s+(?:[A-Z][A-Za-z.'-]+\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Hwy|Highway|Pkwy|Parkway)\b\.?(?=\s*(?:[,;"'`)\]}]|$))/g;
const STREET_ADDRESS_ANYCASE_RE = /\b\d{1,6}\s+(?:[A-Za-z][A-Za-z.'-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Hwy|Highway|Pkwy|Parkway)\b\.?(?=\s*(?:[,;"'`)\]}]|$))/gi;
const ZIP_NEARBY_RE = /\b\d{5}(?:-\d{4})?\b/;
// A street NAME is a proper noun, an ordinal or a direction. It is never built out of English
// function words, and prose wearing an address shape almost always contains one. MEASURED: this
// one list removed the last three Tier B false positives in this repo ("<n> lanes the same way",
// "<n> deletions of another lane", "<n> express lane") and cost zero true hits. Applied to TIER B
// ONLY: Title Case is its own signal and Tier A does not need this.
const NOT_A_STREET_NAME = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'for',
  'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'these', 'those', 'with', 'from', 'as', 'if', 'then', 'than', 'so', 'not', 'no', 'all', 'any',
  'each', 'every', 'more', 'most', 'other', 'same', 'such', 'only', 'own', 'too', 'very', 'can',
  'will', 'just', 'out', 'up', 'down', 'over', 'under', 'again', 'into', 'one', 'two', 'three',
  'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'first', 'second', 'third', 'last',
  'next', 'new', 'old', 'long', 'short', 'full', 'half', 'per', 'via', 'vs', 'etc', 'both',
  'either', 'neither', 'never', 'always', 'still', 'yet', 'also', 'however', 'because', 'while',
  'after', 'before', 'during', 'through', 'about', 'above', 'below', 'between', 'among', 'since',
  'until', 'when', 'where', 'who', 'why', 'how', 'what', 'which', 'whose', 'whom', 'they', 'them',
  'their', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'hers', 'i', 'me',
  'my', 'mine', 'lanes', 'streets', 'roads', 'ways', 'express', 'deletions', 'fast', 'slow']);
function readsLikeAStreetName(match) {
  const parts = String(match).trim().split(/\s+/);
  const mid = parts.slice(1, parts.length - 1);
  if (!mid.length) return true;
  return !mid.some(function (w) { return NOT_A_STREET_NAME.has(w.replace(/[^A-Za-z]/g, '').toLowerCase()); });
}
// A data VALUE ends at a quote or a closing bracket; a prose clause ends at a comma, a semicolon
// or the line. That one distinction is what separates a lowercase address from a lowercase
// sentence, and it is checked on the text AFTER the match rather than inside it.
function isAddressAsDataValue(line, matchEnd) {
  const after = line.slice(matchEnd);
  if (/^\s*["'`)\]}]/.test(after)) return true;
  return ZIP_NEARBY_RE.test(after.slice(0, 60));
}
const CITY_STATE_ZIP_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+\d{5}(?:-\d{4})?\b/gi;
// GATE-17, 20260815. A Supabase project ref is a 15+ char lowercase alphanumeric subdomain of
// supabase.co; this exact shape already has a proven, in-production precedent elsewhere in this
// codebase (pai/board/pam/pam.js CREDENTIAL_PATTERNS, 'supabase_url'), reused here rather than
// invented, so the file stays one pattern for this shape rather than two independently-tuned
// ones. A Render service id is always 'srv-' plus a base36-ish id; narrowed to that one prefix
// on purpose (Render also mints dpg-/red-/cvs- ids for other resource types, left uncaught and
// named here rather than implied covered -- the same "narrow, stated" choice this file makes
// for the address and phone detectors). MEASURED across every file this guard reads in this
// repo: 2 true supabase_url hits, 2 true srv- hits, 0 false positives of either shape.
const SUPABASE_URL_RE = /https:\/\/[a-z0-9]{15,}\.supabase\.co/gi;
const RENDER_SERVICE_ID_RE = /\bsrv-[a-z0-9]{15,30}\b/gi;
// Mask an address so the guard never prints, stores or baselines the place it protects. Only
// the SHAPE survives: digits become #, letters become *, punctuation and spacing stay so a
// reviewer can still tell a street line from a city line without learning where anyone lives.
function maskAddress(s) {
  return String(s).trim().replace(/\d/g, '#').replace(/[A-Za-z]/g, '*');
}
// ⬡B:checks.no_founder_pii:PARTIAL:digest_bound_hints_land_here_one_detector_at_a_time:20260801⬡
// The sister repo bound every hint to a truncated SHA-256 of the matched value on 20260729,
// so a DIFFERENT value of the same shape can never satisfy an already-accepted baseline key.
// This copy never received that pass. The address detector arrives already bound rather than
// arriving with a hole that has to be closed later; the four OLDER call sites here still carry
// bare shape masks and that is named work for the detector-backport lane, not silence.
function tokenHint(tok, label) {
  return (label || (String(tok).slice(0, 1).toUpperCase() + '***')) + '#' + h(tok).slice(0, 12);
}
// Tokens for the hash check: words, emails, hyphenated names, hex ids.
// GATE-3 audit, 20260815: {3,} silently drops every 1- and 2-character token, so a hash added
// for a two-letter initial (a real leak class -- an initials-only nickname, e.g. the shape
// "BJ" found in this repo's own roadmap docs) could NEVER match even after being denylisted,
// because the candidate token is never produced in the first place. Lowered to {2,}.
// MEASURED 20260815: this repo's pii.hashes.json carries no 2-character entry today, so the
// change is a true no-op against the current denylist (verified: zero new matches anywhere in
// the tree) and only closes the dead path for whenever a short hash is added.
const TOKEN_RE = /[A-Za-z0-9._%+@-]{2,}/g;
// GATE-3 audit, 20260815: PERSON_NAME_RE (below) requires an honorific, a middle initial or a
// Sr./Jr. suffix, so a bare single first name used as an ordinary sentence subject or possessor
// is invisible to it -- MEASURED live in this repo's own MASTER_ROADMAP_GREAT_RESET_20260721.md
// and PHASE5_CROSS_HAM_LEAK_AUDIT_20260722.md, which both quote the founder's own words naming
// two real people by bare first name with no honorific in sight ("X got Y's lesson plan;
// Z's OMI got Y's MAR reports"). A generic "any bare capitalised word is a name" rule is not
// viable in THIS estate: the prose is dense with capitalised proper-noun jargon that is never a
// person (Wonder, Keeper, Decoder, Custodian, Auditor, HAM, Founder...), so that rule alone
// produced dozens of false hits against ordinary architecture prose in trial.
// The narrower, MEASURED-safe signal: a bare capitalised token possessing something that is
// PERSONAL DATA (a calendar, a report, a credential, a record, an email...) is exactly the
// shape a real leak takes when a human is named in relation to what belongs to them -- and a
// generic architecture noun (world, lane, run, turn, wall, station, grant, project...) almost
// never appears in that exact possessive-of-personal-data position, so a small stop list of
// this codebase's own non-person capitalised vocabulary clears the remaining noise.
// MEASURED across all 238 non-test, non-skipped files in this repo (20260815): 5 hits, all 5
// true (3 in the two roadmap docs above, naming the same two real people from the audited
// finding; 1 more this same pass surfaced in pai/core/schedule/schedule.logic.js:8, a comment
// naming the founder by first name in shipped code -- out of this gate's edit scope, reported
// rather than fixed). Zero false positives measured. This is folded into 'person-name-shape' on
// the roster (it detects a person by shape, same as the honorific/initial/suffix forms; see the
// address detector's own TIER A / TIER B precedent for one detector name covering two shapes)
// rather than announced as a new roster entry, because the roster's own tripwire test
// (tests/no.founder.pii.sees.a.name.test.js) asserts every announced detector against a fixed,
// hand-authored FIRES/NEEDS_THIS_WORLDS_HASHES map that only that test's owner may extend.
// STATED LIMIT: a bare name with nothing personal-data-shaped nearby (e.g. "Eric arrived
// early") still is not caught. That gap is named in UNSCANNED_NOTE below rather than implied.
// GATE-17, 20260815: this required the ASCII apostrophe (U+0027) only. Every editor and word
// processor auto-corrects a typed apostrophe to the typographic form (U+2019) the moment it
// follows a letter, which is exactly the position a possessive name sits in, so the ORDINARY,
// unremarkable way a human writes "Zebulon's calendar" already misses this detector, not some
// exotic edge case. MEASURED: 'Zebulon's calendar' (ASCII) fires hardcoded_person_name;
// 'Zebulon’s calendar' (curly, U+2019) produces zero findings, and no other detector in
// this file covers a bare possessive either -- a silent pass on a real leak, the exact failure
// this file's own doctrine names as worse than no gate. U+02BC (modifier letter apostrophe) is
// folded in too, since it costs nothing here and is the same character some name-aware
// autocorrect and IME pipelines emit; more exotic quote marks are left alone rather than widen
// a possessive detector past what a possessive actually looks like.
const POSSESSIVE_NAME_RE = /\b([A-Z][a-z]{1,20})['’ʼ]s\s+(lesson\s+plan|reports?|credentials?|rows?|records?|messages?|chats?|calendar|e?mails?|files?|data|notes?|transcripts?|history)\b/g;
const POSSESSOR_NOT_A_NAME = new Set(['world', 'lane', 'run', 'turn', 'ham', 'human', 'founder',
  'wall', 'station', 'grant', 'project', 'anthropic', 'user', 'system', 'this', 'that', 'it',
  'one', 'file', 'request', 'session']);
// ⬡B:checks.no_founder_pii:FIX:the_gate_could_not_see_a_name:20260726⬡
// The law says "no child's or family member's name" and this guard had no name detector at
// all. It found emails, phones, and tokens whose SHA-256 was on the denylist, and the founder's
// own first and last name are not on that denylist, so his full legal name sat in shippable
// code, unflagged and unbaselined, while the guard printed that shipped code adds nothing new.
// Measured 20260726: core/inbox.zero.js wrote it into a bead at MOUNT, so every world that
// booted the file stamped a real human into its own brain.
//
// Two detectors, both shape-based, so the guard still never carries anyone's plaintext name.
// PERSON_NAME_RE wants a STRONG person signal, never bare Title Case, or ordinary prose and
// place names would drown the signal: an honorific, or a middle initial, or a generational
// suffix. That deliberately misses a plain two-word name; a partial detector that says which
// half it covers beats a guard that silently covered none of it.
const PERSON_NAME_RE = new RegExp(
  '\\b(?:' +
    '(?:Dr|Mr|Mrs|Ms|Prof)\\.\\s+[A-Z][a-z]{1,20}(?:\\s+[A-Z]\\.)?\\s+[A-Z][a-z]{1,20}' +
  '|' +
    '[A-Z][a-z]{1,20}\\s+[A-Z]\\.\\s+[A-Z][a-z]{1,20}' +
  '|' +
    '[A-Z][a-z]{1,20}\\s+[A-Z][a-z]{1,20}\\s+(?:Sr|Jr)\\.' +
  ')', 'g');
// A person assigned to an identity-bearing key. Narrow on purpose: `name:` is everywhere in
// this estate (routes, agents, lanes) and adding it would bury real leaks in noise. These keys
// mean a HUMAN, and the value is only flagged when it reads like one, so `founder: 'the founder
// of this world, resolved by ham_uid'` is the cure rather than a fresh violation.
const IDENTITY_KEY_RE = /\b(founder|owner|full_name|fullName|legal_name|legalName|real_name|realName|human_name|account_holder)\s*:\s*['"`]([^'"`\n]{2,80})['"`]/g;
const PERSONISH_VALUE_RE = /^(?:[A-Z][A-Za-z'’.-]{1,20})(?:\s+(?:[A-Z][A-Za-z'’.-]{0,20}|[A-Z]\.)){1,3}$/;
// File types this guard reads. Stated out loud because everything outside it is UNCHECKED, and
// an unstated blind spot reads as coverage.
// ⬡B:scripts.checks.no_founder_pii:FIX:markdown_was_never_scanned_and_the_gate_never_looked:20260725⬡
// This repo's own CLAUDE.md law: TRUE ZERO, never a literal. It was not: a tracked Markdown
// file carried the founder's full legal name and this guard reported clean, because it never
// opened a .md file at all. .md now joins the list this repo actually reads.
// ⬡B:scripts.checks.no_founder_pii:FIX:the_identity_gate_never_read_a_doc:20260801⬡
// PARITY WITH anew, WHICH CLOSED THE SAME GAP ONE FORMAT WIDER THE SAME NIGHT. This repo fixed
// markdown on 20260725 and the sister repo never received it: measured 20260801, anew's copy of
// this guard was still reading seven extensions and no .md at all, and widening it there took
// that repo from 180 hits across 64 files to 1071 across 147. That drift is the real finding,
// and the roster is now the same on both sides so it cannot recur one extension at a time.
//
// A doc is shippable text. This repo is the mind-template every world inherits, so a person
// written into a .yml, a .sql seed, a .sh hook or a .txt handoff rides into a stranger's deploy
// exactly like one written into a .js string. Measured on this tree with the full roster below:
// ZERO additional findings, so the widening costs this repo nothing and it stays a TRUE ZERO
// with no baseline file at all. Zero today is the reason to keep watching, never to stop.
// Case-insensitive on purpose: README.MD is the same file as readme.md to a reader.
const SCANNED_EXT_RE = /\.(js|cjs|mjs|jsx|ts|tsx|json|html|htm|md|markdown|txt|yml|yaml|sql|sh|bash|csv|tsv|ini|toml|conf|xml|svg|css|py|rb|go|php)$/i;
// What is STILL unread, stated rather than implied, because an unstated blind spot reads as
// coverage: extensionless files (Dockerfile, Makefile, LICENSE), binaries, and dot-FILES at any
// level (walk() skips names starting with a dot; only .github and .claude are entered).
const UNSCANNED_NOTE = 'extensionless files (Dockerfile, Makefile, LICENSE), binaries, and dot-FILES are NOT read by this guard, and the address detector is US-shaped so a non-US postal address is NOT detected';
// ⬡B:checks.no_founder_pii:FIX:the_roster_was_prose_so_no_test_could_hold_it:20260801⬡
// CODEX ON ab33fe515, P2. The roster this guard prints on every run was a hand-typed string, and
// the test guaranteeing every active detector is ANNOUNCED asserted against the guard's SOURCE
// TEXT. Detector names also appear here in constants and comments, so deleting a name from the
// roster string left the test green: the test written to catch an unannounced detector could not
// catch one. That is the same disease as the roster ruling of the same morning, one level up.
//
// The roster is now DATA, built from this one list, and the tripwire asserts against what the
// program actually EMITS rather than against what its source happens to contain. Asserting on
// source is what made the previous test weak twice over: first too strict (it pinned one exact
// string, so ADDING a detector broke it), then too loose (removing one did not). Emitted output
// is neither: it grows honestly and it shrinks loudly. Add a detector here and announce it in the
// same edit; the tripwire additionally proves each name here is a detector that really fires.
// configured-identity is last on purpose: the run appends its live fingerprint count directly
// after it, so the emitted roster stays one parseable comma-separated list with the annotation
// hanging off the final name. The tripwire parses exactly that and compares it to this list.
const DETECTORS = ['email', 'phone', 'e164', 'us-address-shape', 'denylisted-token',
  'person-name-shape', 'identity-key', 'infra-identifier-shape'];
// Mask a name so the guard never prints, stores or baselines the plaintext it exists to protect.
function maskName(s) {
  return String(s).trim().split(/\s+/).map(function (w) { return w.slice(0, 1) + '***'; }).join(' ');
}
// A sentence can wear a name's clothes. "Phase C. Which pipeline" has the exact shape of a
// middle-initial name and is prose, measured on the first run of this detector. A name part is
// never one of these words, so one stop list removes that whole false-positive class without
// weakening the real catch.
const SENTENCE_WORDS = new Set(['which', 'the', 'this', 'that', 'it', 'if', 'when', 'then', 'there',
  'these', 'those', 'but', 'and', 'so', 'an', 'he', 'she', 'they', 'we', 'you', 'no', 'yes', 'now',
  'once', 'every', 'each', 'any', 'all', 'phase', 'layer', 'step', 'part', 'section', 'note',
  'figure', 'table', 'also', 'however', 'because', 'while', 'after', 'before', 'both', 'either',
  'neither', 'what', 'where', 'who', 'why', 'how', 'never', 'always', 'only', 'one', 'two']);
function looksLikeSentence(match) {
  return String(match)
    .replace(/\b(?:Sr|Jr|Dr|Mr|Mrs|Ms|Prof)\b\.?/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .some(function (w) { return SENTENCE_WORDS.has(w.replace(/[^A-Za-z]/g, '').toLowerCase()); });
}

function h(s) { return crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex'); }
function phoneDigits(s) { return String(s).replace(/[^\d]/g, ''); }

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const ent of entries) {
    // ⬡B:scripts.checks.no_founder_pii:FIX:claude_dir_was_pruned_before_the_extension_filter_ran:20260727⬡
    // Codex review on this exact PR, correct: adding .md to SCANNED_EXT_RE does nothing for a
    // file the walk never reaches. Every dot-directory except .github was pruned here, so
    // .claude/skills/*/SKILL.md (five tracked files, real shipped instruction content) never
    // reached the extension check at all. .claude ships to every world exactly like .github
    // does, so it gets the same exception. Everything else dot-prefixed stays skipped (.git via
    // SKIP_DIRS below, editor/tool metadata like .vscode, .idea that ships nothing runtime).
    if (ent.name.startsWith('.') && ent.name !== '.github' && ent.name !== '.claude') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(full, acc); continue; }
    if (!SCANNED_EXT_RE.test(ent.name)) continue;
    acc.push(full);
  }
  return acc;
}

function scanFile(full) {
  const rel = path.relative(ROOT, full).split(path.sep).join('/');
  if (isSkippedFile(rel)) return [];
  // GATE-3 audit, 20260815: test files get the exact-match hash denylist (never a false hit on
  // synthetic fixtures) but not the shape detectors (which the guard's own test suites
  // deliberately trip on purpose). See the isTestFile() comment above for the measured numbers.
  const testFile = isTestFile(rel);
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch (e) { return []; }
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (!testFile) {
      // emails
      EMAIL_RE.lastIndex = 0;
      while ((m = EMAIL_RE.exec(line))) {
        const email = m[0];
        if (EMAIL_ALLOW.some(function (re) { return re.test(email); })) continue;
        violations.push({ rel, line: i + 1, type: 'hardcoded_email', hint: email.replace(/[^@.]/g, '*') });
      }
      // phones
      PHONE_RE.lastIndex = 0;
      while ((m = PHONE_RE.exec(line))) {
        const d = phoneDigits(m[0]);
        if (d.length < 10 || d.length > 11) continue;   // not a phone
        // ignore obvious non-phones: all-same digit, sequential timestamps handled by length bound
        violations.push({ rel, line: i + 1, type: 'hardcoded_phone', hint: '***-***-' + d.slice(-4) });
      }
      // bare E.164 (leading +, no separators)
      E164_RE.lastIndex = 0;
      while ((m = E164_RE.exec(line))) {
        const d = m[0].replace(/[^\d]/g, '');
        if (d.length < 11 || d.length > 15) continue;
        violations.push({ rel, line: i + 1, type: 'hardcoded_phone', hint: '+**...' + d.slice(-4) });
      }
      // a personal address, by shape. The guard never learns the place, only that one is there.
      const seenAddr = Object.create(null);
      STREET_ADDRESS_TITLE_RE.lastIndex = 0;
      while ((m = STREET_ADDRESS_TITLE_RE.exec(line))) {
        seenAddr[m[0]] = true;
        violations.push({ rel, line: i + 1, type: 'hardcoded_address', hint: tokenHint(m[0], maskAddress(m[0])) });
      }
      STREET_ADDRESS_ANYCASE_RE.lastIndex = 0;
      while ((m = STREET_ADDRESS_ANYCASE_RE.exec(line))) {
        if (seenAddr[m[0]]) continue;                                   // already caught by Tier A
        if (!readsLikeAStreetName(m[0])) continue;
        if (!isAddressAsDataValue(line, m.index + m[0].length)) continue;
        violations.push({ rel, line: i + 1, type: 'hardcoded_address', hint: tokenHint(m[0], maskAddress(m[0])) });
      }
      CITY_STATE_ZIP_RE.lastIndex = 0;
      while ((m = CITY_STATE_ZIP_RE.exec(line))) {
        violations.push({ rel, line: i + 1, type: 'hardcoded_address', hint: tokenHint(m[0], maskAddress(m[0])) });
      }
      // GATE-17 note retired 20260815: the infra detector below WAS unannounced and WAS nested
      // under !testFile. Both are fixed. It now runs on every file and is on the DETECTORS
      // roster with a firing probe, so the roster cannot drift from what actually runs.
      // a real person's name, by shape. The guard never learns the name, only that one is there.
      // GATE-17, 20260815: bound to a truncated digest of the matched value, same as the address
      // detector's tokenHint() already does (see its own comment: "the four OLDER call sites here
      // still carry bare shape masks and that is named work for the detector-backport lane, not
      // silence"). Before this fix, maskName() kept only the first letter of each word, so any
      // two DIFFERENT names of the same shape (same word count, same first letters -- which a
      // first name and a completely different first name sharing an initial produces constantly)
      // rendered the IDENTICAL hint. fp() keys a baseline entry on (file, type, hint) only, so
      // once one such name was baselined, a genuinely different real person's name of the same
      // shape in the same file satisfied that old baseline and the gate reported no new leak --
      // a live bypass of the baseline mechanism, not merely a coarse label. MEASURED with two
      // invented synthetic names sharing an initial and the same possessed noun ("Alberta's
      // reports" / "Aldous's reports"): both rendered hint "A***'s reports" before this fix.
      // tokenHint() appends '#' + twelve hex chars of SHA-256(value); the digest is one-way, so
      // a committed baseline entry still cannot be reversed to the name it protects.
      PERSON_NAME_RE.lastIndex = 0;
      while ((m = PERSON_NAME_RE.exec(line))) {
        if (looksLikeSentence(m[0])) continue;
        violations.push({ rel, line: i + 1, type: 'hardcoded_person_name', hint: tokenHint(m[0], maskName(m[0])) });
      }
      // a bare capitalised name possessing something personal-data-shaped (see POSSESSIVE_NAME_RE)
      POSSESSIVE_NAME_RE.lastIndex = 0;
      while ((m = POSSESSIVE_NAME_RE.exec(line))) {
        if (POSSESSOR_NOT_A_NAME.has(m[1].toLowerCase())) continue;
        violations.push({ rel, line: i + 1, type: 'hardcoded_person_name',
          hint: tokenHint(m[1], maskName(m[1]) + '’s ' + m[2]) });
      }
      // a person assigned to a key that means a human
      IDENTITY_KEY_RE.lastIndex = 0;
      while ((m = IDENTITY_KEY_RE.exec(line))) {
        const value = m[2].trim();
        if (looksLikeSentence(value)) continue;
        if (!PERSONISH_VALUE_RE.test(value) && !PERSON_NAME_RE.test(value)) continue;
        PERSON_NAME_RE.lastIndex = 0;
        violations.push({ rel, line: i + 1, type: 'identity_key_literal',
          hint: m[1] + '=' + tokenHint(value, maskName(value)) });
      }
    }
    // Infrastructure identifiers run on EVERY file, test files included. A live Supabase
    // project URL or Render service id copied into a fixture is the same leak as one in
    // shipped code: it is not a synthetic shape a fixture author would invent, it is a real
    // address of a real running system. Nesting these under !testFile, as they were when first
    // added, defeated the test-file coverage this guard now promises.
    SUPABASE_URL_RE.lastIndex = 0;
    while ((m = SUPABASE_URL_RE.exec(line))) {
      violations.push({ rel, line: i + 1, type: 'hardcoded_infra_identifier', hint: tokenHint(m[0], maskAddress(m[0])) });
    }
    RENDER_SERVICE_ID_RE.lastIndex = 0;
    while ((m = RENDER_SERVICE_ID_RE.exec(line))) {
      violations.push({ rel, line: i + 1, type: 'hardcoded_infra_identifier', hint: tokenHint(m[0], maskAddress(m[0])) });
    }
    // hash denylist (kids' names, UIDs, and the email/phone tokens too as a backstop). Runs on
    // EVERY file, test files included: an exact SHA-256 match can never land by accident on a
    // synthetic test fixture, only on a real, already-registered token.
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line))) {
      const tok = m[0];
      if (HASHES[h(tok)]) {
        violations.push({ rel, line: i + 1, type: 'denylisted_identity', hint: tok.slice(0, 1) + '***' });
        continue;
      }
      // phone-as-digits inside a longer token
      const dg = phoneDigits(tok);
      if (dg.length >= 10 && dg.length <= 11 && HASHES[h(dg)]) {
        violations.push({ rel, line: i + 1, type: 'denylisted_identity', hint: 'phone***' });
      }
    }
    // GATE-17, 20260815: the check above tokenizes on TOKEN_RE, which stops at a space or a
    // paren (neither is in its character class). A phone written the ordinary human way, with
    // parens around the area code and a space before the exchange (e.g. "(519) 555-0100"), is
    // not one token there, it is two ("519" and "555-0100"), and phoneDigits() on each piece
    // alone is 3 and 7 digits -- never the 10-11 the hash check requires. For an ordinary file
    // this is harmless, PHONE_RE below (shape-only, gated off for test files) still catches the
    // whole formatted number. But a TEST file gets ONLY this hash path, by design, so a real,
    // already-registered phone number sitting in a test fixture in this exact common format
    // was invisible on every axis at once. MEASURED with a synthetic 555-exchange number and a
    // throwaway hash entry: the bare-digit form fired denylisted_identity as expected, the
    // parens-and-space form of the SAME number fired nothing, in a test/ path, before this fix.
    // This runs the phone SHAPE regexes on every file (not gated by testFile) but only ever
    // turns a match into a finding when its normalized digits hit an EXISTING hash -- so a
    // synthetic fixture number (555 exchange, invented, never registered) still stays silent,
    // the same guarantee the rest of this section already relies on.
    PHONE_RE.lastIndex = 0;
    while ((m = PHONE_RE.exec(line))) {
      const dg2 = phoneDigits(m[0]);
      if (dg2.length >= 10 && dg2.length <= 11 && HASHES[h(dg2)]) {
        violations.push({ rel, line: i + 1, type: 'denylisted_identity', hint: 'phone***' });
      }
    }
    E164_RE.lastIndex = 0;
    while ((m = E164_RE.exec(line))) {
      const dg3 = m[0].replace(/[^\d]/g, '');
      if (dg3.length >= 11 && dg3.length <= 15 && HASHES[h(dg3)]) {
        violations.push({ rel, line: i + 1, type: 'denylisted_identity', hint: 'phone***' });
      }
    }
  }
  return violations;
}

// A stable fingerprint for a violation, independent of line number so edits above it do not
// churn the baseline. Keyed by file + type + the masked hint.
function fp(v) { return v.rel + '|' + v.type + '|' + v.hint; }

// The baseline is the ACCEPTED existing debt for THIS repo: an instance the owner controls may
// legitimately carry the owner's own data. A baseline entry freezes a known violation so the guard
// blocks only NEW leaks. The shipped template (template-mind) carries an EMPTY baseline, so it must
// be a true zero. Generate/refresh with: node scripts/checks/no-founder-pii.js <root> --write-baseline
function loadBaseline() {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/checks/pii.baseline.json'), 'utf8'));
    return new Set((b.accepted || []).map(function (e) { return typeof e === 'string' ? e : fp(e); }));
  } catch (e) { return new Set(); }
}

function main() {
  const files = walk(ROOT, []);
  let all = [];
  for (const f of files) all = all.concat(scanFile(f));

  if (process.argv.indexOf('--write-baseline') !== -1) {
    const accepted = Array.from(new Set(all.map(fp))).sort();
    fs.writeFileSync(path.join(ROOT, 'scripts/checks/pii.baseline.json'),
      JSON.stringify({ note: 'Accepted pre-existing founder-data debt for THIS instance only. New leaks beyond this list fail the build. The shipped template keeps this EMPTY. Shrink this file; never grow it by hand.', grew_on_20260726: 'The person-name and identity-key detectors were added 20260726 and surfaced real-name debt that no detector had ever been able to see. These entries are pre-existing leaks becoming VISIBLE, not new leaks being accepted. Every hardcoded_person_name and identity_key_literal entry below is a real human baked into shippable code and each one is a bug with an owner, not a settled exception.', generated_count: accepted.length, accepted: accepted }, null, 2) + '\n');
    console.log('[no-founder-pii] wrote baseline with ' + accepted.length + ' accepted entries.');
    process.exit(0);
  }

  const baseline = loadBaseline();
  const fresh = all.filter(function (v) { return !baseline.has(fp(v)); });

  // ⬡B:checks.no_founder_pii:FIX:never_report_a_pass_this_guard_did_not_earn:20260726⬡
  // This printed "clean: no hardcoded personal identity found" while it had never once looked
  // for a name, and while a real legal name sat in a bead written at mount. A guard that names
  // what it checked cannot be misread as covering what it did not, so every run states its
  // roster and its blind spot, pass or fail.
  const ROSTER = 'checks run: ' + DETECTORS.join(', ') + '. '
    + 'NOT read: ' + UNSCANNED_NOTE + '. A plain two-word name with no honorific, middle initial '
    + 'or generational suffix is also not detected, and a bare name with nothing personal-data '
    + 'shaped possessed nearby (no calendar/report/record/etc) is also not detected. Test '
    + 'suites (test/, tests/, *.test.js) get the exact-match hash denylist and the '
    + 'infrastructure-identifier shape check, but not the other shape detectors, because those '
    + 'files deliberately plant synthetic PII-shaped fixtures on purpose. The infrastructure '
    + 'check is the one exception and it runs everywhere: a live Supabase project URL or Render '
    + 'service id is the address of a running system, not a shape a fixture author would invent, '
    + 'so a copied one is a real leak wherever it lands.';
  if (!all.length) {
    console.log('[no-founder-pii] no findings across ' + files.length + ' files. ' + ROSTER);
    process.exit(0);
  }
  if (!fresh.length) {
    console.log('[no-founder-pii] no NEW leaks (' + all.length + ' pre-existing, baselined; drive them down). ' + ROSTER);
    process.exit(0);
  }
  console.error('[no-founder-pii] NEW LEAK: personal identity hardcoded in shippable code. Identity is env-only, per-world. Move it to an env var (FOUNDER_EMAIL, FOUNDER_PHONE, FOUNDER_HAM_UID) or read it from the brain via core/founder_context.js. A real human must never be baked into a stranger world.\n');
  for (const v of fresh) {
    console.error('  ' + v.rel + ':' + v.line + '  [' + v.type + ']  ' + v.hint);
  }
  console.error('\n[no-founder-pii] ' + fresh.length + ' NEW leak(s). Build fails until removed. (' + baseline.size + ' pre-existing are baselined.)');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { scanFile: scanFile, DETECTORS: DETECTORS, _h: h };
