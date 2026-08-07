// ⬡B:tests.sign_portal:TRIPWIRE:the_signing_portal_earns_its_receipts:20260807⬡
//
// The signing portal (routes/sign.routes.js + core/sign.pdf.js) replaces a
// third-party e-sign service, so the things a court or the founder would ask of
// it are proven here rather than assumed: the page carries only the approved
// background from the one brand source, the agreement text reaches the page and
// the PDF from the same source, a submission without consent or configuration
// refuses honestly, and the executed PDF is a real parseable document.
//
// Every person named in this file is invented. A real human in a fixture would
// be the leak the no-founder-pii gate exists to stop.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const brand = require('../pai/core/brand.js');
const signPdf = require('../pai/core/sign.pdf.js');

function serve() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  require('../pai/routes/sign.routes.js')(app);
  return new Promise(function (resolve) {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', function () {
      const base = 'http://127.0.0.1:' + server.address().port;
      resolve({ base: base, close: function () { server.close(); } });
    });
  });
}

test('GET /sign serves the portal on the founder pink smoke still and nothing unapproved', async () => {
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign');
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.ok(html.indexOf(brand.DEFAULT_BACKGROUND.url) !== -1, 'the pink smoke still is the page background');
    assert.strictEqual(brand.DEFAULT_BACKGROUND.id, 'pink-smoke', 'the default background is his first-named');
    const imgur = html.match(/https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.[a-z]+/g) || [];
    imgur.forEach(function (u) {
      assert.ok(brand.isApprovedBackgroundUrl(u) || u === brand.MARK_STATIC_URL || u === brand.ENVOLVE_LOGO_URL,
        'unapproved image on the door: ' + u);
    });
    assert.ok(html.indexOf('Global Majority Group') !== -1, 'the company name fronts the page');
    assert.ok(html.indexOf(brand.ENVOLVE_LOGO_URL) !== -1, 'the real company mark is on the door, never an invented logo');
    assert.ok(html.indexOf('Independent Contractor Agreement') !== -1);
    assert.ok(html.indexOf('—') === -1, 'no em dash reaches a human surface');
    assert.ok(html.indexOf('7. Confidentiality') !== -1, 'the agreement sections ride the page');
  } finally { s.close(); }
});

test('a submission without consent, name, or signature refuses honestly', async () => {
  const s = await serve();
  try {
    let r = await fetch(s.base + '/sign/submit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.strictEqual(r.status, 400);
    let j = await r.json();
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.reason, 'consent_required');

    r = await fetch(s.base + '/sign/submit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, fullLegalName: 'Fixture Signer Example',
        email: 'fixture@example.com', street: '1 Fixture Way', cityStateZip: 'Fixture City, XX 00000',
        phone: '555 0100' }) });
    j = await r.json();
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.reason, 'signature_required');
  } finally { s.close(); }
});

test('with no recipients configured the portal says so instead of pretending delivery', async () => {
  const held = process.env.SIGN_NOTIFY_EMAILS;
  delete process.env.SIGN_NOTIFY_EMAILS;
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/submit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, fullLegalName: 'Fixture Signer Example',
        email: 'fixture@example.com', street: '1 Fixture Way', cityStateZip: 'Fixture City, XX 00000',
        phone: '555 0100', typedSignature: 'Fixture Signer Example' }) });
    assert.strictEqual(r.status, 503);
    const j = await r.json();
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.reason, 'no_recipients_configured');
  } finally {
    if (held !== undefined) process.env.SIGN_NOTIFY_EMAILS = held;
    s.close();
  }
});

test('a signature that reached neither the bank nor the recipients is never called success', async () => {
  const held = { n: process.env.SIGN_NOTIFY_EMAILS, u: process.env.MEMORY_BANK_URL, k: process.env.MEMORY_BANK_KEY };
  process.env.SIGN_NOTIFY_EMAILS = 'fixture.person@example.com';
  delete process.env.MEMORY_BANK_URL;
  delete process.env.MEMORY_BANK_KEY;
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/submit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, fullLegalName: 'Fixture Signer Example',
        email: 'fixture@example.com', street: '1 Fixture Way', cityStateZip: 'Fixture City, XX 00000',
        phone: '555 0100', typedSignature: 'Fixture Signer Example' }) });
    assert.strictEqual(r.status, 502);
    const j = await r.json();
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.reason, 'nothing_durable');
    assert.strictEqual(j.recorded.ok, false);
    assert.strictEqual(j.emailed.ok, false);
  } finally {
    ['n', 'u', 'k'].forEach(function (f, i) {
      const names = ['SIGN_NOTIFY_EMAILS', 'MEMORY_BANK_URL', 'MEMORY_BANK_KEY'];
      if (held[f] !== undefined) process.env[names[i]] = held[f]; else delete process.env[names[i]];
    });
    s.close();
  }
});

test('GET /sign/verify reports the destination masked and refuses to claim an unconfigured ok', async () => {
  const held = process.env.SIGN_NOTIFY_EMAILS;
  process.env.SIGN_NOTIFY_EMAILS = 'fixture.person@example.com';
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/verify');
    const j = await r.json();
    assert.strictEqual(j.recipients.configured, 1);
    assert.strictEqual(j.recipients.masked[0].indexOf('fixture.person'), -1, 'the full address never leaves');
    assert.ok(j.recipients.masked[0].indexOf('***') !== -1);
    assert.strictEqual(typeof j.sender_grant_configured, 'boolean');
    if (!j.bank.configured || !j.bank.table_reachable || !j.sender_grant_configured) {
      assert.strictEqual(j.ok, false, 'an unconfigured destination may never verify ok');
    }
  } finally {
    if (held !== undefined) process.env.SIGN_NOTIFY_EMAILS = held; else delete process.env.SIGN_NOTIFY_EMAILS;
    s.close();
  }
});

test('a full signing lands the record and the memory bead in the bank, signature bytes only in the record', async () => {
  // A fake memory bank that captures exactly what the portal writes, so the
  // "where does it save" truth is proven against real HTTP, not assumed.
  const captured = { records: [], beads: [], patches: [] };
  const bankApp = express();
  bankApp.use(express.json({ limit: '10mb' }));
  bankApp.post('/rest/v1/signing_records', (req, res) => { captured.records.push(req.body); res.status(201).json([req.body]); });
  bankApp.post('/rest/v1/beads', (req, res) => { captured.beads.push(req.body); res.status(201).end(); });
  bankApp.patch('/rest/v1/signing_records', (req, res) => { captured.patches.push(req.body); res.json([]); });
  const bank = await new Promise((resolve) => {
    const srv = http.createServer(bankApp);
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
  const held = { n: process.env.SIGN_NOTIFY_EMAILS, u: process.env.MEMORY_BANK_URL, k: process.env.MEMORY_BANK_KEY, h: process.env.HAM_UID };
  process.env.SIGN_NOTIFY_EMAILS = 'fixture.person@example.com';
  process.env.MEMORY_BANK_URL = bank.base;
  process.env.MEMORY_BANK_KEY = 'fixture-key';
  process.env.HAM_UID = 'fixture_world';
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/submit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, fullLegalName: 'Fixture Signer Example',
        email: 'fixture@example.com', street: '1 Fixture Way', cityStateZip: 'Fixture City, XX 00000',
        phone: '555 0100', typedSignature: 'Fixture Signer Example', clientDate: 'August 7, 2026' }) });
    const j = await r.json();
    assert.strictEqual(j.ok, true, JSON.stringify(j).slice(0, 300));
    assert.strictEqual(j.recorded.ok, true, 'the record landed');
    assert.strictEqual(j.memoried.ok, true, 'the memory bead landed');
    assert.strictEqual(j.emailed.ok, false, 'no mail config means an honest emailed:false');

    assert.strictEqual(captured.records.length, 1);
    const row = captured.records[0];
    assert.strictEqual(row.ham_uid, 'FIXTURE_WORLD', 'the record binds this exact world');
    assert.strictEqual(row.signer.full_legal_name, 'Fixture Signer Example');
    assert.strictEqual(row.signer.signed_at_date, 'August 7, 2026', 'the rebuild snapshot is complete');
    assert.ok(row.agreement_sha256 && row.pdf_sha256);

    assert.strictEqual(captured.beads.length, 1);
    const bead = captured.beads[0];
    assert.strictEqual(bead.stamp_type, 'RECORD');
    assert.strictEqual(bead.source, 'sign.portal.contractor_agreement');
    assert.strictEqual(bead.importance, 8);
    assert.ok(bead.summary.indexOf('Fixture Signer Example') !== -1);
    assert.ok(bead.acl_stamp.indexOf(row.id) !== -1, 'the bead points at the record');
    assert.strictEqual(JSON.stringify(bead).indexOf('signature_jpeg'), -1, 'signature bytes never enter memory');
    assert.ok(JSON.parse(bead.content).pdf_sha256 === row.pdf_sha256);

    assert.strictEqual(captured.patches.length, 1, 'the delivery receipt was patched onto the record');
    assert.strictEqual(captured.patches[0].email_receipt.ok, false);
  } finally {
    [['n', 'SIGN_NOTIFY_EMAILS'], ['u', 'MEMORY_BANK_URL'], ['k', 'MEMORY_BANK_KEY'], ['h', 'HAM_UID']].forEach(function (p) {
      if (held[p[0]] !== undefined) process.env[p[1]] = held[p[0]]; else delete process.env[p[1]];
    });
    s.close(); bank.close();
  }
});

test('a destination bead in the brain outranks the env fallback, and verify says which source rules', async () => {
  const bankApp = express();
  bankApp.get('/rest/v1/beads', (req, res) => res.json([{
    content: JSON.stringify({ notify_emails: ['brain.fixture@example.com'] }),
    created_at: '2026-08-07T00:00:00Z'
  }]));
  bankApp.get('/rest/v1/signing_records', (req, res) => res.json([]));
  const bank = await new Promise((resolve) => {
    const srv = http.createServer(bankApp);
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
  const held = { n: process.env.SIGN_NOTIFY_EMAILS, u: process.env.MEMORY_BANK_URL, k: process.env.MEMORY_BANK_KEY };
  process.env.SIGN_NOTIFY_EMAILS = 'env.fixture@example.com';
  process.env.MEMORY_BANK_URL = bank.base;
  process.env.MEMORY_BANK_KEY = 'fixture-key';
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/verify');
    const j = await r.json();
    assert.strictEqual(j.recipients.source, 'brain', 'the brain bead rules when present');
    assert.strictEqual(j.recipients.configured, 1);
    assert.ok(j.recipients.masked[0].indexOf('b***') === 0, 'the masked address is the bead one, not env');
  } finally {
    [['n', 'SIGN_NOTIFY_EMAILS'], ['u', 'MEMORY_BANK_URL'], ['k', 'MEMORY_BANK_KEY']].forEach(function (p) {
      if (held[p[0]] !== undefined) process.env[p[1]] = held[p[0]]; else delete process.env[p[1]];
    });
    s.close(); bank.close();
  }
});

test('the destination door fails closed without exact founder authority', async () => {
  const held = process.env.FOUNDER_HAM_UID;
  process.env.FOUNDER_HAM_UID = 'fixture_founder';
  const s = await serve();
  try {
    const r = await fetch(s.base + '/sign/config', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify_emails: ['intruder.fixture@example.com'] }) });
    assert.notStrictEqual(r.status, 200, 'no session may set where signatures deliver');
    const j = await r.json();
    assert.strictEqual(j.ok, false);
  } finally {
    if (held !== undefined) process.env.FOUNDER_HAM_UID = held; else delete process.env.FOUNDER_HAM_UID;
    s.close();
  }
});

test('the founder record doors fail closed without exact founder authority', async () => {
  const held = process.env.FOUNDER_HAM_UID;
  process.env.FOUNDER_HAM_UID = 'fixture_founder';
  const s = await serve();
  try {
    for (const path of ['/sign/records', '/sign/records/00000000-0000-4000-8000-000000000000/pdf']) {
      const r = await fetch(s.base + path);
      assert.notStrictEqual(r.status, 200, path + ' must not open without a session');
      const j = await r.json();
      assert.strictEqual(j.ok, false);
    }
    delete process.env.FOUNDER_HAM_UID;
    const r = await fetch(s.base + '/sign/records');
    assert.strictEqual(r.status, 503, 'an unconfigured founder identity refuses honestly');
  } finally {
    if (held !== undefined) process.env.FOUNDER_HAM_UID = held; else delete process.env.FOUNDER_HAM_UID;
    s.close();
  }
});

test('the executed PDF rebuild is deterministic, so the founder copy can prove itself against the recorded hash', () => {
  const input = {
    fill: { contractorName: 'Fixture Signer Example', street: '1 Fixture Way',
      cityStateZip: 'Fixture City, XX 00000', email: 'fixture@example.com', phone: '555 0100' },
    typedSignature: 'Fixture Signer Example',
    signedAtIso: '2026-08-07T00:00:00.000Z', signedAtDate: 'August 7, 2026',
    recordId: '00000000-0000-4000-8000-000000000000', ip: '203.0.113.9',
    userAgent: 'fixture agent', agreementSha256: 'abc'
  };
  const crypto = require('node:crypto');
  const a = crypto.createHash('sha256').update(signPdf.buildExecutedPdf(input)).digest('hex');
  const b = crypto.createHash('sha256').update(signPdf.buildExecutedPdf(input)).digest('hex');
  assert.strictEqual(a, b);
});

test('the executed PDF is a real document carrying the agreement, the signer, and the certificate', () => {
  const fill = { contractorName: 'Fixture Signer Example', entityName: '', street: '1 Fixture Way',
    cityStateZip: 'Fixture City, XX 00000', email: 'fixture@example.com', phone: '555 0100' };
  const pdf = signPdf.buildExecutedPdf({
    fill: fill, typedSignature: 'Fixture Signer Example',
    signedAtIso: '2026-08-07T00:00:00.000Z', signedAtDate: 'August 7, 2026',
    recordId: '00000000-0000-4000-8000-000000000000', ip: '203.0.113.9',
    userAgent: 'fixture agent', agreementSha256: signPdf.agreementSha256(fill)
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.strictEqual(pdf.slice(0, 8).toString(), '%PDF-1.4');
  assert.ok(pdf.slice(-30).toString().indexOf('%%EOF') !== -1);
  const latin = pdf.toString('latin1');
  assert.ok(latin.indexOf('Fixture Signer Example') !== -1, 'the signer is in the document');
  assert.ok(latin.indexOf('Electronic Signing Certificate') !== -1, 'the certificate page exists');
  assert.ok(latin.indexOf('Helvetica') !== -1);
});

test('a drawn signature JPEG embeds and its hash lands on the certificate', () => {
  // The smallest real JPEG: a 1x1 white pixel, so the embed path runs on real bytes.
  const onePixel = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
    + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
  assert.ok(signPdf._test.jpegSize(onePixel), 'the fixture JPEG parses');
  const fill = { contractorName: 'Fixture Signer Example', street: '1 Fixture Way',
    cityStateZip: 'Fixture City, XX 00000', email: 'fixture@example.com', phone: '555 0100' };
  const pdf = signPdf.buildExecutedPdf({
    fill: fill, signatureJpegBase64: onePixel.toString('base64'),
    signedAtIso: '2026-08-07T00:00:00.000Z', signedAtDate: 'August 7, 2026',
    recordId: '00000000-0000-4000-8000-000000000000', ip: '203.0.113.9',
    userAgent: 'fixture agent', agreementSha256: signPdf.agreementSha256(fill)
  });
  const latin = pdf.toString('latin1');
  assert.ok(latin.indexOf('/DCTDecode') !== -1, 'the JPEG rides DCTDecode');
  const sha = require('node:crypto').createHash('sha256').update(onePixel).digest('hex');
  assert.ok(latin.indexOf(sha) !== -1, 'the signature image hash is on the certificate');
  assert.ok(latin.indexOf('Drawn by hand on the signing page') !== -1);
});
