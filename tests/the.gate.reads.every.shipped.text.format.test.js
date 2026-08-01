// ⬡B:tests.gate_reads_every_shipped_text_format:TRIPWIRE:the_identity_gate_never_read_a_doc:20260801⬡
// entered via the ABAHAM door, serving channel internal
//
// THE DEFECT THIS PINS. This repo closed the markdown hole on 20260725 and the sister repo
// (anew) never received it. Measured 20260801: anew's copy of the same guard was still reading
// seven extensions and no .md at all, and widening it there took that repo from 180 hits across
// 64 files to 1071 across 147. Nothing enforces parity between the two copies, so one repo's
// fix sat five weeks from the other and the fix that DID land here was never locked either.
//
// WHY THE EXISTING TEST DID NOT LOCK IT, measured rather than assumed. This repo already carries
// tests/no.founder.pii.md.scan.test.js, whose header says it "locks the fix" that added .md to
// SCANNED_EXT_RE. It calls scanFile() directly. scanFile() never consults the extension list at
// all; walk() does. Removing 'md' from SCANNED_EXT_RE and re-running that suite gives 2 pass /
// 0 fail. It proved the detectors, never the roster, so the roster was free to shrink again on
// any night, in the repo that is supposed to be a TRUE ZERO strangers inherit.
//
// SO THIS TEST DRIVES THE REAL CLI OVER A REAL TEMP TREE. It is end to end on purpose: the only
// way to prove which FILES a walker reaches is to make it walk. Narrow the list and this goes
// red with a named count instead of a stranger's privacy going quiet.
//
// THE FIXTURE CARRIES NOBODY. Every planted value is a reserved, unroutable form: the address
// sits at a .invalid TLD, which RFC 2606 guarantees can never be delegated to a real person.
// The guard itself stores only SHA-256 of what it protects; a test for it must be able to make
// the same promise, so no real value appears here, in the temp tree, or in any failure message.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const GUARD = path.join(ROOT, 'scripts', 'checks', 'no-founder-pii.js');

// A shipped world is mostly not JavaScript. Every extension below is a text format this estate
// actually tracks and ships, and each one is a file a person's email, phone or name can sit in
// exactly as easily as a .js string can. Add to this roster when a new shipped format appears;
// removing an entry means arguing that leaking a human in that format is acceptable.
const MUST_BE_READ = [
  'md', 'markdown', 'txt', 'yml', 'yaml', 'sql', 'sh', 'csv', 'tsv',
  'ini', 'toml', 'conf', 'xml', 'py', 'json', 'js', 'html'
];

// RFC 2606 reserves .invalid precisely so a fixture can be certain it names nobody.
const PLANTED = 'gate.tripwire@no-such-host.invalid';

function plantTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-roster-'));
  for (const ext of MUST_BE_READ) {
    fs.writeFileSync(path.join(dir, 'carrier.' + ext), 'contact ' + PLANTED + '\n');
  }
  return dir;
}

// The guard exits 1 on a finding, which execFileSync raises. Both outcomes are data here.
function runGuard(dir) {
  try {
    const out = execFileSync(process.execPath, [GUARD, dir], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, text: String(out) };
  } catch (err) {
    return { status: err.status, text: String(err.stdout || '') + String(err.stderr || '') };
  }
}

test('every shipped text format is actually opened by the identity gate', () => {
  const dir = plantTree();
  try {
    const run = runGuard(dir);
    const missed = MUST_BE_READ.filter((ext) => run.text.indexOf('carrier.' + ext) === -1);
    assert.deepStrictEqual(missed, [],
      'The identity gate did not read ' + missed.length + ' of ' + MUST_BE_READ.length +
      ' shipped text formats: ' + JSON.stringify(missed) + '. A planted address sat in each of ' +
      'those files and the gate reported on the others as though it had scanned the tree. This ' +
      'is the 20260801 defect returning: SCANNED_EXT_RE in scripts/checks/no-founder-pii.js has ' +
      'been narrowed. Widen it back, or delete the extension from MUST_BE_READ above together ' +
      'with the written reason a real human leaking in that format is acceptable.');
    assert.strictEqual(run.status, 1,
      'a planted identity in a scanned file must fail the build, got exit ' + run.status);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a shipped dot-directory is walked, not pruned before the extension filter runs', () => {
  // Widening the extension list does nothing for a file the walk never reaches. .claude and
  // .github both ship to every inherited world; every other dot-directory is tool metadata.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-dotdir-'));
  try {
    for (const d of ['.claude', '.github']) {
      fs.mkdirSync(path.join(dir, d, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(dir, d, 'nested', 'shipped.md'), 'owner ' + PLANTED + '\n');
    }
    const run = runGuard(dir);
    for (const d of ['.claude', '.github']) {
      assert.ok(run.text.indexOf(d + '/nested/shipped.md') !== -1,
        d + '/ ships to every inherited world and the gate did not enter it. A file the walk ' +
        'never reaches is invisible no matter how wide SCANNED_EXT_RE gets. Output: ' + run.text);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the guard never claims coverage it does not have', () => {
  // The 20260726 ruling in this estate: a run that prints a pass it did not earn is the defect,
  // not the report. So the honesty string has to stay honest in BOTH directions. It must not go
  // on naming a format the guard now reads, and it must still name what is genuinely unread.
  const src = fs.readFileSync(GUARD, 'utf8');
  const note = src.match(/const UNSCANNED_NOTE = '([^']*)'/);
  assert.ok(note, 'the guard must keep one readable UNSCANNED_NOTE stating its blind spot');
  for (const ext of MUST_BE_READ) {
    assert.ok(!new RegExp('\\b' + ext + '\\b').test(note[1]),
      'UNSCANNED_NOTE still tells readers that .' + ext + ' is unread while the gate now reads ' +
      'it. An out-of-date blind-spot notice is read as coverage in the wrong direction and sends ' +
      'the next coder hunting a hole that is closed. Note: ' + note[1]);
  }
  assert.ok(note[1].trim().length > 0,
    'a guard that names no blind spot at all is claiming total coverage, which no shape-based ' +
    'detector has. State what is still unread.');
});

test('an ordinary doc with no identity in it stays quiet', () => {
  // A guard that cries wolf gets switched off, and a switched-off guard protects nobody. The
  // roster above is worth nothing if widening it turned ordinary prose red.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-quiet-'));
  try {
    fs.writeFileSync(path.join(dir, 'NOTES.md'),
      '# Notes\n\nThis handoff names no person and carries no address.\n');
    fs.writeFileSync(path.join(dir, 'config.yml'), 'service: aibebase\nregion: oregon\n');
    const run = runGuard(dir);
    assert.strictEqual(run.status, 0,
      'ordinary prose must not fail the gate. Output: ' + run.text);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
