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
  // ⬡B:tests.no_founder_pii_sees_a_name:FIX:a_roster_pinned_as_one_string_blocks_its_own_growth:20260801⬡
  // This used to match the roster as ONE exact sequence, which meant ADDING a detector broke the
  // test that exists to make sure detectors are announced. That is backwards: the assertion
  // should make the roster grow honestly, not hold it still. Each detector is now required by
  // name, so a new one can be appended freely and a deleted one still fails here.
  assert.match(src, /const ROSTER = 'checks run: /,
    'every run must name its detector roster');
  for (const detector of ['email', 'phone', 'e164', 'us-address-shape', 'denylisted-token',
    'person-name-shape', 'identity-key']) {
    assert.ok(src.indexOf(detector) !== -1,
      'the run output must name the ' + detector + ' detector; a detector that runs without ' +
      'being announced lets a reader credit the guard for coverage they cannot verify, and a ' +
      'detector announced after being deleted is the same lie in the other direction');
  }
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

// ⬡B:tests.no_founder_pii_name:FIX:markdown_and_dot_shipped_dirs_are_read_now:20260727⬡
// Superseding, not deleting: this test used to pin markdown as an accepted, named gap. That
// reasoning stopped holding the moment a real leak was found living inside it -- this repo's
// own HANDOFF_TO_THE_NEXT_CHAT_20260721.md carried the founder's full legal name, and a follow
// up Codex review on that same fix found .claude/skills/*/SKILL.md (shipped instruction
// content, same standing as .github) was still pruned before the extension check ever ran and
// itself carried the name a second time. This is a TRUE ZERO template; "small enough to fix"
// beat "big enough to defer." Markdown is read now, and any other still-unscanned type (txt,
// yml, yaml, sql, sh, env) remains named rather than silently assumed clean.
test('markdown and shipped dot directories are read now, and what remains unread is still named',
  () => {
    const src = fs.readFileSync(GUARD, 'utf8');
    assert.match(src, /SCANNED_EXT_RE\s*=\s*\/\\\.\([^)]*\bmd\b[^)]*\)\$\//,
      'markdown must be in the scanned-extension list, not just promised in a comment');
    assert.match(src, /ent\.name\s*!==\s*'\.claude'/,
      '.claude must be let through the dot-directory prune the same way .github already is');
    // ⬡B:tests.no_founder_pii_sees_a_name:SUPERSEDE:txt_yml_are_read_now_too:20260801⬡
    // This used to require the literal string 'txt, yml' in the run output, because those
    // formats were genuinely still unread. Lane clair/the-identity-gate-never-read-a-doc
    // widened the roster to every shipped text format (measured: ZERO additional findings on
    // this tree, so the TRUE ZERO holds with no baseline). The assertion is not deleted, it
    // INVERTS: the honesty notice must never name a format the guard now reads, and it must
    // never go empty either, because a guard claiming total coverage is the original disease.
    const note = src.match(/const UNSCANNED_NOTE = '([^']*)'/);
    assert.ok(note, 'the guard must keep one readable UNSCANNED_NOTE');
    for (const ext of ['md', 'txt', 'yml', 'yaml', 'sql', 'sh']) {
      assert.doesNotMatch(note[1], new RegExp('\\b' + ext + '\\b'),
        '.' + ext + ' is read now and must not still be advertised as a blind spot');
    }
    assert.ok(note[1].trim().length > 0,
      'a real remaining gap must still be named in the run output; no shape-based detector has ' +
      'total coverage and a guard that names no blind spot is claiming one');
  });
