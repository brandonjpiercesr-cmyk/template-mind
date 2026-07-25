'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runnerPath = path.join(__dirname, '..', 'cycle.runner.js');

function runnerSource() {
  return fs.readFileSync(runnerPath, 'utf8');
}

test('template autonomous runner has no CANEW drain request path', function () {
  const source = runnerSource();

  assert.doesNotMatch(source, /\/canew\/drain/);
  assert.doesNotMatch(source, /CANEW_DRAIN_URL/);
  assert.doesNotMatch(source, /cycle\.runner\.autonomous/);
});

test('template autonomous tick performs no direct network request', function () {
  const source = runnerSource();
  const tickStart = source.indexOf('async function tick()');
  const tickEnd = source.indexOf('// A tiny health surface');

  assert.notEqual(tickStart, -1);
  assert.notEqual(tickEnd, -1);
  assert.doesNotMatch(source.slice(tickStart, tickEnd), /\bfetch\s*\(/);
});
