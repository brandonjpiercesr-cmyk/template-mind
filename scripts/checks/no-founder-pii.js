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
function isSkippedFile(rel) {
  if (/(^|\/)tests?\//.test(rel)) return true;          // test suites
  if (/\.test\.js$/.test(rel)) return true;             // *.test.js
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
// stamp dates) are not mistaken for phone numbers. The founder's own unformatted number is caught
// precisely by the hash denylist instead, so nothing is lost.
const PHONE_RE = /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g;
// Tokens for the hash check: words, emails, hyphenated names, hex ids.
const TOKEN_RE = /[A-Za-z0-9._%+@-]{3,}/g;

function h(s) { return crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex'); }
function phoneDigits(s) { return String(s).replace(/[^\d]/g, ''); }

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.github') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(full, acc); continue; }
    if (!/\.(js|cjs|mjs|jsx|ts|json|html)$/.test(ent.name)) continue;
    acc.push(full);
  }
  return acc;
}

function scanFile(full) {
  const rel = path.relative(ROOT, full).split(path.sep).join('/');
  if (isSkippedFile(rel)) return [];
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch (e) { return []; }
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // emails
    let m;
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
    // hash denylist (kids' names, UIDs, and the email/phone tokens too as a backstop)
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
      JSON.stringify({ note: 'Accepted pre-existing founder-data debt for THIS instance only. New leaks beyond this list fail the build. The shipped template keeps this EMPTY. Shrink this file; never grow it by hand.', generated_count: accepted.length, accepted: accepted }, null, 2) + '\n');
    console.log('[no-founder-pii] wrote baseline with ' + accepted.length + ' accepted entries.');
    process.exit(0);
  }

  const baseline = loadBaseline();
  const fresh = all.filter(function (v) { return !baseline.has(fp(v)); });

  if (!all.length) {
    console.log('[no-founder-pii] clean: no hardcoded personal identity found in shippable code (' + files.length + ' files scanned).');
    process.exit(0);
  }
  if (!fresh.length) {
    console.log('[no-founder-pii] no NEW leaks (' + all.length + ' pre-existing, baselined; drive them down). Shipped code adds nothing new.');
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
module.exports = { scanFile: scanFile, _h: h };
