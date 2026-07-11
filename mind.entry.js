// ⬡B:template-mind.mind.entry:MODULE:the_mind_template_line_one:20260709⬡
// THE MIND TEMPLATE. Line one of the new world's compute, W5-clean by law:
// this file contains ZERO world literals -- no HAM UIDs, no keys, no grant IDs,
// no founder identifiers. Identity arrives ONLY through env:
//   HAM_UID          -- whose world this mind serves
//   MEMORY_BANK_URL  -- that world's own Supabase (born by worldBirth)
//   MEMORY_BANK_KEY  -- that world's own service key (minted per HAM, RLS-locked)
// Every world -- the founder's, Eric's, HAM #489's -- deploys THIS SAME FILE and
// becomes itself purely by configuration. The ACL binding law: this stamp matches
// the GENESIS stamp family in the bank it serves; the three-way GREP reads code
// and memory as one braid.
'use strict';

const express = require('express');
const app = express();
app.use(express.json());

const HAM = (process.env.HAM_UID || '').toUpperCase();
const BANK = process.env.MEMORY_BANK_URL || '';
const KEY = process.env.MEMORY_BANK_KEY || '';

// ENTRANCE narration: a mind without identity or memory refuses to pretend.
if (!HAM || !BANK || !KEY) {
  console.log('[MIND] missing env (HAM_UID / MEMORY_BANK_URL / MEMORY_BANK_KEY); serving unborn state honestly');
}

function bankHeaders(write) {
  const h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Accept-Profile': 'memory_bank' };
  if (write) { h['Content-Profile'] = 'memory_bank'; h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=representation'; }
  return h;
}

// /health -- a REAL health: identity + a live read of this world's own bank.
app.get('/health', async function (req, res) {
  let bankAlive = false, beadCount = null;
  try {
    const r = await fetch(BANK + '/rest/v1/beads?select=id&limit=1', { headers: bankHeaders(false) });
    bankAlive = r.ok;
    if (r.ok) { const rows = await r.json(); beadCount = Array.isArray(rows) ? rows.length : null; }
  } catch (e) { /* bank unreachable stays false, honestly */ }
  res.json({ ok: Boolean(HAM && bankAlive), world: HAM || 'unborn', bank: bankAlive ? 'alive' : 'unreachable', sampled: beadCount });
});

// /bead -- stamp a bead into THIS world's own memory. Supersede-only lives in the
// schema (superseded_by); this door only ever adds.
app.post('/bead', async function (req, res) {
  try {
    const b = req.body || {};
    if (!b.summary) return res.status(400).json({ ok: false, reason: 'summary required' });
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const row = {
      ham_uid: HAM,
      agent_global: String(b.agent || 'MIND').toUpperCase().slice(0, 24),
      stamp_type: String(b.type || 'NOTE').toUpperCase().slice(0, 24),
      acl_stamp: '⬡B:' + String(b.ns || 'mind').toLowerCase() + ':' + String(b.type || 'NOTE').toUpperCase() + ':' + String(b.desc || 'stamped').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) + ':' + ymd + '⬡',
      source: String(b.ns || 'mind') + '.' + Date.now(),
      summary: String(b.summary).slice(0, 300),
      content: JSON.stringify(b.content || {}),
      importance: Math.min(10, Math.max(1, parseInt(b.importance, 10) || 5)),
      spawned_by: String(b.spawnedBy || 'mind.entry').slice(0, 60)
    };
    const r = await fetch(BANK + '/rest/v1/beads', { method: 'POST', headers: bankHeaders(true), body: JSON.stringify(row) });
    if (!r.ok) return res.json({ ok: false, reason: 'bank write failed ' + r.status });
    const saved = await r.json();
    res.json({ ok: true, id: Array.isArray(saved) && saved[0] ? saved[0].id : null, acl: row.acl_stamp });
  } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});

// ⬡B:template-mind.mind.entry:WIRE:coding_downtime_wash_doors:20260710⬡
// The world's own organs, each env-scoped, each submitting through law.
app.post('/express', async function (req, res) {
  try { res.json(await require('./face.js').expressTurn({ HAM_UID: HAM, PERSONA: process.env.PERSONA }, (req.body || {}).compiled || req.body)); }
  catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});
app.post('/code/submit', async function (req, res) {
  try {
    var out = await require('./coding.js').submitForReview({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY, NIGHT_CHECK_URL: process.env.NIGHT_CHECK_URL }, (req.body || {}).draft || req.body);
    res.json(out);
  } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});
app.post('/downtime/run', async function (req, res) {
  try { res.json(await require('./downtime.js').downtimeCycle({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY })); }
  catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});
// \u2b21B:mind.entry:WIRE:atmosphere_door_mounted:20260710\u2b21
// AUDIT FIX: atmosphere.js existed as an organ but its door was never mounted --
// an orphan door, the exact pattern the founder's audit law exists to catch. The
// directory organ now answers at its door: identifier in, world route out, zero
// personal data read, pure cold resolution.
app.post('/atmosphere/resolve', async (req, res) => {
  try {
    // ESM graph: dynamic import, not require (this template is type:module)
    const atmosphere = await import('./atmosphere.js');
    const fn = atmosphere.resolveWorld || atmosphere.default?.resolveWorld || atmosphere.resolve;
    const out = await fn((req.body || {}).identifier || '');
    res.json({ ok: true, resolved: out });
  } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});

app.post('/wash/listen', async function (req, res) {
  try { res.json(await require('./wash.js').washListen({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY }, (req.body || {}).signal || req.body)); }
  catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});

// EXIT narration: the mind listens; everything else it becomes arrives as lawful
// modules through the coding department, each one gated before it lands.
const PORT = process.env.PORT || 10000;
app.listen(PORT, function () { console.log('[MIND] world ' + (HAM || 'unborn') + ' listening on ' + PORT); });
