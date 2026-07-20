// ⬡B:test.mind.entry.wren-route:TEST:canonical_per_ham_text_ingress:20260720⬡
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'mind.entry.js'), 'utf8');
const wren = fs.readFileSync(path.join(root, 'pai', 'routes', 'wren.routes.js'), 'utf8');

test('per-HAM mind mounts the complete canonical WREN boundary', function () {
  assert.match(entry, /require\('\.\/pai\/routes\/wren\.routes\.js'\)\(app\)/);
  assert.equal(entry.includes("app.post('/wren/blooio'"), false,
    'mind.entry must not keep a second partial text route');
  assert.ok(wren.indexOf("verifyBlooio(req,process.env.BLOOIO_WEBHOOK_SECRET)") <
    wren.indexOf("claimWebhook('blooio'"), 'authentication must precede the claim');
  assert.ok(wren.indexOf("claimWebhook('blooio'") < wren.indexOf('handleReply(body)'),
    'the durable replay claim must precede every PAI or delivery effect');
  assert.match(wren, /duplicate_ignored/);
  assert.match(wren, /parseBlooioTerminal/);
});
