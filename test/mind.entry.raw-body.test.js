// ⬡B:test.mind.entry.raw-body:TEST:per_ham_signed_webhook_boundary:20260720⬡
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const entryPath = path.join(__dirname, '..', 'mind.entry.js');
const entry = fs.readFileSync(entryPath, 'utf8');

test('per-HAM JSON boundary preserves exact bytes before signed routes mount', function () {
  const parser = entry.indexOf('verify: function preserveRawWebhookBody');
  const capture = entry.indexOf('req.rawBody = Buffer.from(buf)');
  const iman = entry.indexOf("require('./pai/routes/iman.routes.js')(app)");

  assert.notEqual(parser, -1, 'the shared JSON parser must install a verify hook');
  assert.notEqual(capture, -1, 'the verify hook must preserve a Buffer copy');
  assert.notEqual(iman, -1, 'the signed IMAN route must remain mounted');
  assert.ok(parser < capture && capture < iman,
    'raw bytes must be captured before the signed IMAN route is mounted');
  assert.equal(entry.includes('app.use(express.json());'), false,
    'a bare parser would silently discard signed provider bytes');
});
