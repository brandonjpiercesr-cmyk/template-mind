// ⬡B:tests.gate_can_see_an_address:TRIPWIRE:the_law_named_four_things_and_the_gate_saw_three:20260801⬡
// entered via the ABAHAM door, serving channel internal
//
// THE DEFECT THIS PINS. The founder law of 20260722 forbids "no email, no phone, no HAM UID, no
// child's or family member's name, NO PERSONAL ADDRESS". Email, phone and name each got a
// detector across four hardening passes over `scripts/checks/no-founder-pii.js`. Address never
// got one at all, in either repo, so a home address in shippable code was invisible to every
// green run this gate has ever printed. Same shape as the markdown blind spot closed earlier
// the same day: the detector roster was never audited against the law it claims to enforce.
//
// MEASURED 20260801 on anew main with a standalone shape probe, before this detector existed:
// address-shaped values in 6 files, including `core/scw/mediators.seed.js`, which is shipped
// code that writes into the brain at mount. Not a document. A live path.
//
// EVERY FIXTURE HERE NAMES NOWHERE. The street numbers, street names and city are invented
// placeholders, and the ZIP is drawn from the 00000 block, which the USPS does not assign. The
// guard stores only SHA-256 of what it protects; a test for it must be able to promise the same.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanFile } = require('../scripts/checks/no-founder-pii.js');

function scanText(text, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-addr-'));
  try {
    const file = path.join(dir, name || 'CARRIER.md');
    fs.writeFileSync(file, text);
    return scanFile(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const addressHits = (v) => v.filter((x) => x.type === 'hardcoded_address');

test('a street line is seen, in code and in a doc alike', () => {
  for (const name of ['seed.js', 'INTAKE.md', 'notes.txt']) {
    const v = addressHits(scanText('home: "742 Nowhere Lane",\n', name));
    assert.ok(v.length >= 1,
      'a street address in a .' + name.split('.').pop() + ' file must be seen. The law names ' +
      'address alongside email and phone and this gate saw only three of the four until ' +
      '20260801. Got: ' + JSON.stringify(v));
  }
});

test('a city, state and ZIP line is seen', () => {
  const v = addressHits(scanText('mail to Nowheresville, NC 00000\n'));
  assert.ok(v.length >= 1, 'a city/state/ZIP line must be seen. Got: ' + JSON.stringify(v));
});

test('the guard never carries the address it caught', () => {
  const v = addressHits(scanText('home: "742 Nowhere Lane",\n'));
  assert.ok(v.length >= 1, 'expected a finding to inspect');
  for (const hit of v) {
    const shape = String(hit.hint).split('#')[0];
    assert.ok(!/[A-Za-z]{2,}/.test(shape),
      'the printable half of the hint still carries readable letters, so the guard would leak ' +
      'the place it exists to protect every time it prints a finding. Got: ' + shape);
    assert.ok(!/\d/.test(shape),
      'the printable half of the hint still carries digits. Got: ' + shape);
    assert.match(String(hit.hint), /#[0-9a-f]{12}$/,
      'the hint must stay digest-bound, or a different address of the same shape could launder ' +
      'past an already-accepted baseline entry, which is the 20260729 lesson');
  }
});

test('ordinary prose that merely wears an address shape is not flagged', () => {
  // MEASURED FALSE POSITIVE, found on the first run of this detector and fixed before it
  // shipped: a comment reading "<number> <Title> <Title> Way <more words>" matched, because
  // street-type suffixes are ordinary English words. A guard that cries wolf gets switched off
  // and a switched-off guard protects nobody, so this case is pinned, not just fixed.
  const prose = '// 2 Big Green Way stations later the run continues down the line\n';
  assert.deepStrictEqual(addressHits(scanText(prose, 'notes.js')), [],
    'prose ending in a street-type word followed by more sentence must not be an address');
  assert.deepStrictEqual(addressHits(scanText('# Notes\n\nNothing personal here.\n')), [],
    'plain prose must stay quiet');
});

test('the detector is on the published roster, so a run cannot imply coverage it dropped', () => {
  // This estate's 20260726 ruling: a run that prints a pass it did not earn is the defect. If
  // someone deletes the detector, the roster line must not go on advertising it.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'checks', 'no-founder-pii.js'), 'utf8');
  assert.match(src, /const STREET_ADDRESS_RE =/, 'the street detector must exist');
  assert.match(src, /const CITY_STATE_ZIP_RE =/, 'the city/state/ZIP detector must exist');
  assert.match(src, /checks run:[^']*us-address-shape/,
    'every run must name the address detector in its roster');
  assert.match(src, /US-shaped so a non-US postal address is NOT detected/,
    'the detector is US-shaped and must say so; an unstated limit reads as coverage');
});
