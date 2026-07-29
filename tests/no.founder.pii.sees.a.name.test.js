// ⬡B:tests.no_founder_pii_name:TRIPWIRE:a_guard_must_see_what_its_law_forbids:20260726⬡
// entered via the ABAHAM door, serving channel internal
//
// The founder law of 20260722 forbids hardcoding a real person into shippable code and names
// "no child's or family member's name" first. The guard that enforces it had no name detector
// at all: it read emails, phone numbers, and single tokens whose SHA-256 sat on a denylist,
// and neither the founder's first nor his last name was on that denylist. So his full legal
// name lived in core/inbox.zero.js, written into a bead at MOUNT, which means every world that
// booted the file stamped a real human into its own brain, and the guard reported that shipped
// code adds nothing new.
//
// That is the same shape this estate keeps finding: a check reporting a pass it never earned.
// The cure is a detector plus an honest roster, and this holds both in place.
//
// Every person named in this file is invented. A test that needs a real human to prove the
// point would be the leak it is testing for.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const GUARD = path.join(__dirname, '..', 'scripts', 'checks', 'no-founder-pii.js');
const guard = require(GUARD);

// scanFile resolves paths against the guard's own ROOT, so a fixture is written into a real
// temporary file and scanned the way CI scans the repo. No stubbing, no invented signal.
function scan(contents, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-fixture-'));
  const file = path.join(dir, name || 'fixture.js');
  fs.writeFileSync(file, contents, 'utf8');
  try { return guard.scanFile(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function types(findings) { return findings.map(function (f) { return f.type; }); }

test('a middle-initial name in a bead payload is caught, the exact shape that leaked', () => {
  const found = scan("var bead = { parked: true, founder: 'Marguerite T. Ashdown', date: '20260726' };\n");
  assert.ok(types(found).includes('hardcoded_person_name'),
    'a first name, middle initial and surname is a person, and shippable code may not carry one');
  assert.ok(types(found).includes('identity_key_literal'),
    'a person assigned to the key `founder` is a person no matter how the name is spelled');
});

test('an honorific and a generational suffix are both person signals', () => {
  assert.ok(types(scan("// Shared with Dr. Ellery Q. Vantworth on the joint desk.\n"))
    .includes('hardcoded_person_name'), 'an honorific names a human');
  assert.ok(types(scan("var lead = { role: 'ops', label: 'Thaddeus Brennick Jr.' };\n"))
    .includes('hardcoded_person_name'), 'a generational suffix names a human');
});

test('the guard never prints, stores or baselines the name it caught', () => {
  const name = 'Marguerite T. Ashdown';
  const found = scan('var founder = { owner: "' + name + '" };\n');
  assert.ok(found.length > 0, 'the fixture must produce a finding or this assertion proves nothing');
  for (const f of found) {
    assert.ok(!/Marguerite|Ashdown/.test(f.hint),
      'the hint is what reaches CI logs and the baseline file; a guard that echoes the name it ' +
      'protects is itself the leak. Found: ' + f.hint);
  }
});

test('prose wearing a name shape is not a person', () => {
  // Measured on this detector's first run against the real repo: "Phase C. Which pipeline job"
  // has the exact shape of a middle-initial name. A guard that cries wolf gets switched off,
  // and a switched-off guard protects nobody.
  assert.deepStrictEqual(
    types(scan('  // Phase C. Which pipeline job the free text refers to is the wonder judgment\n')),
    [], 'a sentence is not a name');
  assert.deepStrictEqual(
    types(scan("var note = 'The Wonder Games seat is earned, never assigned.';\n")),
    [], 'ordinary capitalised prose is not a name');
});

test('a role is the cure, so the cure must not read as a fresh violation', () => {
  // The fix that removed the real leak replaced the name with a role. If the guard flagged
  // that too, every lane would learn to route around the guard instead of obeying it.
  assert.deepStrictEqual(
    types(scan("var bead = { authority: 'the founder of this world, resolved by ham_uid' };\n")),
    [], 'naming a role rather than a person is exactly what the law asks for');
});

test('the guard states what it did NOT check, so silence is never read as coverage', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  assert.match(src, /checks run: email, phone, e164, denylisted-token, person-name-shape, identity-key/,
    'every run must name its detector roster');
  assert.match(src, /NOT read: /,
    'the unscanned file types must be printed, or an unstated blind spot reads as coverage');
  // Comments are stripped first. The guard's own fix note QUOTES the sentence it removed, to
  // explain what was wrong with it, and a naive scan failed on the very documentation written
  // to prevent the regression. Prose is not behaviour; this reads executable lines only. Same
  // lesson the quality-hold tripwire learned, applied here rather than relearned.
  const executable = src.split('\n')
    .filter(function (line) { return !/^\s*(\/\/|\*|\/\*)/.test(line); })
    .join('\n');
  assert.ok(!/clean: no hardcoded personal identity found/.test(executable),
    'the guard must not claim a clean bill of health for dimensions it never examined');
});

test('markdown is still unread, and that gap is stated rather than hidden', () => {
  // Not fixed here on purpose: this repo carries a large pre-existing markdown surface and
  // pulling it in belongs in its own change with its own baseline. What is not allowed is
  // leaving the gap silent, so the guard prints it on every run and this holds that promise.
  const src = fs.readFileSync(GUARD, 'utf8');
  assert.match(src, /md, txt, yml/, 'the markdown blind spot must be named in the run output');
});
