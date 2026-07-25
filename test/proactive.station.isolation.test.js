// ⬡B:test.proactive_station_isolation:TEST:exact_ham_bounded_reads_and_true_zero_press:20260725⬡
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'pai', 'stations', name), 'utf8');
}

test('background station scans carry exact-HAM filters and bounded limits', function () {
  for (const name of ['burst.station.js', 'hunch.station.js', 'ghost.station.js', 'sage.station.js']) {
    const text = source(name);
    assert.match(text, /ham_uid=eq\./, name + ' must isolate reads to one HAM');
    assert.doesNotMatch(text, /limit=([3-9]\d\d|[1-9]\d{3,})/, name + ' must keep scans bounded');
  }
});

test('PRESS has no baked interests, model, or shared-key fallback', function () {
  const text = source('press.station.js');
  assert.doesNotMatch(text, /sports Lakers|nonprofit fundraising/);
  assert.doesNotMatch(text, /qwen\/qwen3-235b-a22b/);
  assert.doesNotMatch(text, /resolveKey\(/);
  assert.match(text, /PRESS_SCAN_SEAT/);
  assert.match(text, /process\.env\[s\.keyEnv\]/);
});

test('NOW resolves timezone through the canonical per-HAM source', function () {
  const text = source('now.station.js');
  assert.match(text, /resolveHamTimezone\(hamUid\)/);
  assert.doesNotMatch(text, /process\.env\.HAM_TIMEZONE/);
});
