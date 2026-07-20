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

// ⬡B:mind.entry:WIRE:provider_boundary_installed_first:20260717⬡
// One door for her world's 17 direct groq callers. Reroutes any banned-provider chat
// call through the authorized open-weight ladder. Must run before any module that may
// fetch a model. Zero per-caller edits. See pai/core/provider.boundary.js.
require('./pai/core/provider.boundary.js').install();

const express = require('express');
const app = express();
// ⬡B:mind.entry:REACH:preserve_signed_webhook_bytes:20260720⬡
// R2B channel law: provider signatures cover the exact bytes received, not a
// JSON object reconstructed after parsing. Preserve those bytes at the one
// shared per-HAM entry boundary so IMAN can verify Nylas before accepting work.
// This stays world-neutral: every mind uses the same parser and its own env key.
app.use(express.json({
  limit: '10mb',
  verify: function preserveRawWebhookBody(req, _res, buf) {
    req.rawBody = Buffer.from(buf);
  }
}));

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
// ⬡B:template-mind.mind.entry:BUILD:pai_cycle_grafted_phase4_20260713⬡
// PHASE 4 of the port: the real PAI engine (the one cycle) now lives in this new world,
// under pai/. This /cycle door is the new world THINKING for itself: it runs runPAI
// against THIS world's own memory bank (the closure reads MEMORY_BANK_* by design after
// the world-agnostic funnel), then hands the compiled turn to face for expression.
// Additive: the 6 original organs are untouched. The engine is byte-identical to legacy;
// only the bank it points at differs, by env. Rollback = do not call this door.
// ⬡B:mind.entry:REACH:per_ham_text_door:20260719⬡
// FOUNDER LAW 20260719: reach is PER-HAM. This world owns its own text edge.
// Blooio webhook -> THIS world's door -> full PAI cycle -> TAP send, reading and
// writing ONLY this HAM's bank. No shared legacy service in the path. The guard
// is the same shared-engine webhook.guard (URL token, timing-safe). 200 returns
// immediately (Blooio timeout ~5s); the reply runs async through the one cycle.
var _wrenGuard = require('./pai/core/webhook.guard.js');
var _wrenReply = require('./pai/core/wren/reply.js');
// ⬡B:mind.entry:REACH:per_ham_email_door:20260719⬡ Per-HAM law: this world owns
// its own EMAIL edge. Nylas webhook -> THIS world's /iman/inbound -> full inbound
// pipeline (guard, claim, PAI, council, reply via his own grants and bank).
require('./pai/routes/iman.routes.js')(app);
// ⬡B:mind.entry:REACH:per_ham_voice_door:20260719⬡ Per-HAM law: this world owns its
// own VOICE edge. ElevenLabs agent -> THIS world's /vara/llm (runPAI local, his bank).
require('./pai/routes/vara.llm.routes.js')(app);
require('./pai/routes/vara.call.routes.js')(app);

app.post('/wren/blooio', async function (req, res) {
  try {
    var auth = _wrenGuard.verifyBlooio(req, process.env.BLOOIO_WEBHOOK_SECRET);
    if (!auth.ok) return res.status(auth.reason === 'blooio_webhook_secret_unconfigured' ? 503 : 401).json({ ok:false, reason:auth.reason });
    res.json({ ok:true, status:'processing', world:'per_ham' });
    var body = req.body || {};
    setImmediate(function () {
      Promise.resolve(_wrenReply.handleReply(body)).catch(function (e) {
        console.error('[wren/blooio per-ham]', e && e.message);
      });
    });
  } catch (e) {
    console.error('[wren/blooio per-ham outer]', e && e.message);
    try { res.status(500).json({ ok:false }); } catch (_e) {}
  }
});

app.post('/cycle', async function (req, res) {
  try {
    if (!HAM || !BANK || !KEY) return res.status(200).json({ ok: false, reason: 'unborn: missing world env' });
    const body = req.body || {};
    const message = body.message || body.text || '';
    if (!message) return res.status(400).json({ ok: false, reason: 'message required' });
    // the closure reads MEMORY_BANK_* / BEAD_TABLE / BRAIN_SCHEMA from env -- this world's own bank
    const { runPAI } = require('./pai/core/tool.loop.js');
    // ⬡B:mind.entry:WIRE:cycle_door_stopped_dropping_identity:20260717⬡
    // Founder-caught 20260717. runPAI's signature is
    // (hamUid, message, channel, identity, priorTurns, uiPortal). This door passed
    // three. identity was ALWAYS undefined here, so through /cycle -- the primary
    // door of this world since the 20260713 cutover -- _codaLeadNeeded could never
    // be true, identity.council_context never reached _councilContext, and WRIT
    // therefore never saw a coding mode and gagged her on her own vocabulary.
    // reach/iman.js:278 and core/wren/reply.js:174 both pass identity. Only this
    // door dropped it. Pass the caller's own values through, defaulting to the exact
    // prior behaviour when absent, so nothing that works today changes.
    const out = await runPAI(HAM, message, body.channel || 'new_world',
      body.identity || null, body.priorTurns || [], body.uiPortal || null);
    // hand the compiled turn to face for persona expression (unchanged organ)
    if (out && out.ok && (out.answer || out.text)) {
      const spoken = await require('./face.js').expressTurn(
        { HAM_UID: HAM, PERSONA: process.env.PERSONA },
        { text: out.answer || out.text, contributions: out.tools_used });
      out._servedBy = "new_world_mind_dc499d0c"; return res.json({ ok: true, compiled: out, expressed: spoken });
    }
    return res.json({ ok: false, reason: (out && out.reason) || 'no_answer', compiled: out });
  } catch (e) {
    console.log('[MIND /cycle] error: ' + e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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
