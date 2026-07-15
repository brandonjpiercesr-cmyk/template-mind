// ⬡B:template-mind.mind.entry:MODULE:the_mind_template_line_one:20260709⬡
// THE MIND TEMPLATE. Line one of the new world's compute, W5-clean by law:
// entered from the shared face through the ABAHAM door; HAM_UID fixes this per-HAM mind at birth.
// this file contains ZERO world literals -- no HAM UIDs, no keys, no grant IDs,
// no founder identifiers. Identity arrives ONLY through env:
//   HAM_UID          -- whose world this mind serves
//   MEMORY_BANK_URL  -- that world's own Supabase (born by worldBirth)
//   MEMORY_BANK_KEY  -- that world's own service key (minted per HAM, RLS-locked)
//   MIND_CYCLE_INTERNAL_KEY -- shared only with trusted internal callers of protected POST doors
// Every world -- the founder's, Eric's, HAM #489's -- deploys THIS SAME FILE and
// becomes itself purely by configuration. The ACL binding law: this stamp matches
// the GENESIS stamp family in the bank it serves; the three-way GREP reads code
// and memory as one braid.
'use strict';

const crypto = require('crypto');
const express = require('express');
const { readBeadWithReceipt, writeBead } = require('./pai/core/brain.client.js');
const app = express();
app.use(express.json());

const HAM = (process.env.HAM_UID || '').toUpperCase();
const BANK = process.env.MEMORY_BANK_URL || '';
const KEY = process.env.MEMORY_BANK_KEY || '';
const CYCLE_INTERNAL_KEY = String(process.env.MIND_CYCLE_INTERNAL_KEY || '');
const CYCLE_AUTH_CONFIGURED = CYCLE_INTERNAL_KEY.trim().length > 0;

// Only trusted internal callers may enter a state-changing or model-running POST.
// Hashing both values fixes the comparison length before timingSafeEqual; the key is never logged.
function cycleKeyMatches(provided) {
  if (!CYCLE_AUTH_CONFIGURED || typeof provided !== 'string' || provided.length === 0) return false;
  const expected = crypto.createHash('sha256').update(CYCLE_INTERNAL_KEY, 'utf8').digest();
  const actual = crypto.createHash('sha256').update(provided, 'utf8').digest();
  return crypto.timingSafeEqual(expected, actual);
}

function requireMindInternalKey(req, res, next) {
  if (!CYCLE_AUTH_CONFIGURED) return res.status(503).json({ ok: false, reason: 'cycle_auth_unconfigured' });
  if (!cycleKeyMatches(req.get('x-mind-cycle-key'))) {
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }
  return next();
}

// The face may trust only a complete, receipt-backed PAI exit. This boundary never
// retries a failed/timeout cycle, because a retry could duplicate already-persisted tools.
function validateCompiledPaiReceipt(out) {
  const missing = [];
  if (!out || out.ok !== true) missing.push('ok');
  if (!out || typeof out.answer !== 'string' || !out.answer.trim()) missing.push('answer');
  if (!out || typeof out.cycleId !== 'string' || !out.cycleId) missing.push('cycleId');
  if (!out || !Number.isFinite(out.ms) || out.ms <= 0) missing.push('ms');
  if (!out || !Number.isInteger(out.iterations) || out.iterations <= 0) missing.push('iterations');
  if (!out || out.cycle_receipt_persisted !== true || out.cycle_receipt_id == null) missing.push('cycle_receipt');
  if (!out || out.fcw_persisted !== true || out.fcw_receipt_id == null) missing.push('fcw_receipt');
  if (!out || !Number.isFinite(out.memory_reads) || out.memory_reads < 7) missing.push('memory_reads');
  if (!out || out.active_awareness_read !== true) missing.push('active_awareness_read');
  if (!out || out.active_awareness_persisted !== true || out.active_awareness_receipt_id == null) missing.push('active_awareness_receipt');
  const requiredContributors = ['identity', 'agentJDs', 'context', 'recent', 'doctrine', 'profile'];
  if (!out || !out.fcw_contributors || typeof out.fcw_contributors !== 'object'
      || requiredContributors.some(function (name) { return out.fcw_contributors[name] !== true; })
      || out.fcw_contributors_total !== 6 || out.fcw_contributors_resolved !== 6) {
    missing.push('fcw_contributors');
  }
  const toolsUsed = out && Array.isArray(out.tools_used) ? out.tools_used : null;
  const executions = out && Array.isArray(out.tool_executions) ? out.tool_executions : null;
  if (!toolsUsed || !executions || toolsUsed.length !== executions.length
      || executions.some(function (execution, index) {
        return !execution || execution.name !== toolsUsed[index]
          || typeof execution.ok !== 'boolean'
          || !Number.isFinite(execution.ms) || execution.ms < 0;
      })) {
    missing.push('tool_executions');
  }
  const failedTool = executions && executions.some(function (execution) { return execution.ok === false; });
  if (failedTool && !/^I did not complete that action\./.test(String(out && out.answer || ''))) {
    missing.push('failed_tool_truthful_answer');
  }
  if (!out || out.cycle_receipt_verified !== true || out.cycle_receipt_fields_verified !== true) {
    missing.push('cycle_receipt_verification');
  }
  if (!out || out.cycle_stamps_persisted !== out.cycle_stamps_total
      || !Array.isArray(out.cycle_stamp_failures) || out.cycle_stamp_failures.length) {
    missing.push('cycle_stamps');
  }
  return { ok: missing.length === 0, missing };
}

// ENTRANCE narration: a mind without identity or memory refuses to pretend.
if (!HAM || !BANK || !KEY) {
  console.log('[MIND] missing env (HAM_UID / MEMORY_BANK_URL / MEMORY_BANK_KEY); serving unborn state honestly');
}


// /health -- a REAL health: identity + one receipted read of this world's bank.
app.get('/health', async function (req, res) {
  let bankAlive = false, beadCount = null, bankStatus = null;
  try {
    const receipt = await readBeadWithReceipt({
      select: 'id',
      ham_uid: 'eq.' + HAM,
      limit: '1'
    }, { timeoutMs: 2500 });
    bankAlive = receipt.ok === true;
    bankStatus = receipt.status;
    beadCount = bankAlive && Array.isArray(receipt.rows) ? receipt.rows.length : null;
  } catch (e) { /* an unborn or unreachable bank stays false honestly */ }
  res.json({
    ok: Boolean(HAM && bankAlive),
    world: HAM || 'unborn',
    bank: bankAlive ? 'alive' : 'unreachable',
    bank_status: bankStatus,
    sampled: beadCount
  });
});

// /bead -- stamp a receipted, typed-edge bead into THIS world's own memory.
app.post('/bead', requireMindInternalKey, async function (req, res) {
  try {
    const b = req.body || {};
    if (!b.summary) return res.status(400).json({ ok: false, reason: 'summary required' });
    const ns = String(b.ns || 'mind').toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 60) || 'mind';
    const type = String(b.type || 'NOTE').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 24) || 'NOTE';
    const graphEdges = Array.isArray(b.edges) ? b.edges.filter(function (edge) {
      return edge && typeof edge.type === 'string' && edge.type.trim()
        && typeof edge.target === 'string' && edge.target.trim();
    }).slice(0, 20) : [];
    if (!graphEdges.length) {
      graphEdges.push({ type: 'records', target: 'ham_' + HAM.toLowerCase() + '.mind_log' });
    }
    const write = await writeBead({
      hamUid: HAM,
      agentGlobal: String(b.agent || 'MIND').toUpperCase().slice(0, 24),
      type,
      source: ns + '.' + HAM.toLowerCase() + '.' + Date.now(),
      summary: String(b.summary).slice(0, 300),
      content: b.content && typeof b.content === 'object' ? b.content : { value: b.content || null },
      importance: Math.min(10, Math.max(1, parseInt(b.importance, 10) || 5)),
      edges: graphEdges
    });
    if (!write || !write.ok || write.id == null) {
      return res.status(502).json({
        ok: false,
        reason: String(write && write.error || 'bank_write_receipt_missing')
      });
    }
    return res.json({
      ok: true,
      id: write.id,
      receipt_persisted: true,
      source: write.source,
      acl: write.acl_stamp
    });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: e.message });
  }
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
app.post('/cycle', requireMindInternalKey, async function (req, res) {
  try {
    if (!HAM || !BANK || !KEY) {
      return res.status(503).json({ ok: false, reason: 'unborn: missing world env' });
    }
    const body = req.body || {};
    const message = body.message || body.text || '';
    if (!message) return res.status(400).json({ ok: false, reason: 'message required' });

    // Trusted face policy may set this flag only after actor + HAM + builder-mode checks.
    // Message prose and body.mode never authorize coding mutations.
    const suppliedIdentity = body.identity && typeof body.identity === 'object' ? body.identity : {};
    const cycleIdentity = Object.assign({}, suppliedIdentity, {
      builderAuthorized: suppliedIdentity.builderAuthorized === true
    });
    const { runPAI } = require('./pai/core/tool.loop.js');
    const out = await runPAI(HAM, message, body.channel || 'new_world', cycleIdentity);
    const receipt = validateCompiledPaiReceipt(out);
    if (!receipt.ok) {
      return res.status(502).json({
        ok: false,
        reason: (out && out.reason) || 'pai_receipt_invalid',
        receipt_missing: receipt.missing,
        compiled: out || null
      });
    }

    // The shared face owns expression. A second local expression/model call here would
    // be discarded and could trigger duplicate side effects after a persisted cycle.
    return res.json({ ok: true, compiled: out });
  } catch (e) {
    console.log('[MIND /cycle] error: ' + e.message);
    return res.status(500).json({ ok: false, reason: 'pai_cycle_failed' });
  }
});

app.post('/code/submit', requireMindInternalKey, async function (req, res) {
  try {
    var out = await require('./coding.js').submitForReview({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY, NIGHT_CHECK_URL: process.env.NIGHT_CHECK_URL }, (req.body || {}).draft || req.body);
    res.json(out);
  } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});
app.post('/downtime/run', requireMindInternalKey, async function (req, res) {
  try { res.json(await require('./downtime.js').downtimeCycle({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY })); }
  catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});
// \u2b21B:mind.entry:WIRE:atmosphere_door_mounted:20260710\u2b21
// AUDIT FIX: atmosphere.js existed as an organ but its door was never mounted --
// an orphan door, the exact pattern the founder's audit law exists to catch. The
// directory organ now answers only behind the same internal-key door: identifier in,
// world route out, with no public world-enumeration surface.
app.post('/atmosphere/resolve', requireMindInternalKey, async (req, res) => {
  try {
    // ESM graph: dynamic import, not require (this template is type:module)
    const atmosphere = await import('./atmosphere.js');
    const fn = atmosphere.resolveWorld || atmosphere.default?.resolveWorld || atmosphere.resolve;
    const out = await fn((req.body || {}).identifier || '');
    res.json({ ok: true, resolved: out });
  } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});

app.post('/wash/listen', requireMindInternalKey, async function (req, res) {
  try { res.json(await require('./wash.js').washListen({ HAM_UID: HAM, MEMORY_BANK_URL: BANK, MEMORY_BANK_KEY: KEY }, (req.body || {}).signal || req.body)); }
  catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
});

// EXIT narration: the mind listens; everything else it becomes arrives as lawful
// modules through the coding department, each one gated before it lands.
const PORT = process.env.PORT || 10000;
app.listen(PORT, function () { console.log('[MIND] world ' + (HAM || 'unborn') + ' listening on ' + PORT); });
module.exports = app;
