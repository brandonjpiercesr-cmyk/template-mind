// ⬡B:test.no_founder_pii_md_scan:TEST:the_true_zero_gate_now_reads_markdown:20260727⬡
// Locks the fix: scripts/checks/no-founder-pii.js's SCANNED_EXT_RE used to skip .md entirely,
// so a real hardcoded name could sit in a Markdown doc in this TRUE ZERO template and the gate
// would report clean without ever opening the file. Proves the guard's real scanFile() now
// catches a person-name-shaped violation in a .md file, and still ignores an ordinary one.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanFile } = require('../scripts/checks/no-founder-pii.js');

test('scanFile catches a person-name-shaped leak inside a .md file', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-md-'));
  const file = path.join(dir, 'HANDOFF.md');
  fs.writeFileSync(file, '- The founder is **Someone Middle Surname Sr.** (a note about him).\n');
  const violations = scanFile(file);
  assert.ok(violations.some(function (v) { return v.type === 'hardcoded_person_name'; }),
    'expected a hardcoded_person_name violation, got: ' + JSON.stringify(violations));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanFile stays quiet on ordinary .md prose with no identity shape', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-md-'));
  const file = path.join(dir, 'NOTES.md');
  fs.writeFileSync(file, '# Notes\n\nThis is an ordinary handoff document with no identity in it.\n');
  const violations = scanFile(file);
  assert.equal(violations.length, 0, 'expected no violations, got: ' + JSON.stringify(violations));
  fs.rmSync(dir, { recursive: true, force: true });
});
