// ⬡B:core.task.queue:MODULE:one_lifecycle_claim_lease_complete:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (tasks arrive from inbound turns; dead-letter ALERTs surface to Overseer)
// L0.3 QUEUE HYGIENE, the boring, proven queue shape, as one organism.
//
// The queue IS the existing TASK beads in abacia_core.aibe_brain. No parallel
// queue table. abacia_core.task_claims (already real, created by
// core/claim_lock.js's proven atomic-INSERT arbiter) is the claim registry
// riding beside it, now carrying an attempts counter.
//
// The lifecycle, whole, never half-adopted:
//   enqueue  , idempotency key = the bead's source. A re-delivered webhook
//               cannot mint a duplicate task: the existing-source check refuses.
//   claim    , atomic. One winner per task, arbitrated by Postgres itself
//               (INSERT ... ON CONFLICT ... WHERE lease expired), losers skip
//               instead of blocking. attempts increments on every claim.
//   complete , exactly-once. A conditional PATCH that only fires while the
//               bead is still TASK_CLAIMED; a second completion matches zero
//               rows and reports so.
//   fail     , returns the bead to TASK for retry, unless attempts crossed
//               the ceiling, in which case the bead lands in TASK_DEAD and an
//               ALERT bead stamps the arrival, visible to Overseer's depth read.
//   sweep    , the lease law. A crashed worker's task visibly returns to
//               pending at lease expiry, by itself, on the heartbeat.
//
// Rows are never deleted. State moves by stamp_type (TASK -> TASK_CLAIMED ->
// TASK_DONE / TASK_DEAD / back to TASK), the same supersede-in-place move the
// drain has always used for TASK_DONE.
//
// Thresholds are env-first, defaults sane, nothing baked:
//   QUEUE_LEASE_MS (default 300000), QUEUE_MAX_ATTEMPTS (default 3),
//   QUEUE_STALE_DAYS (default 14, used by sweepStale only when explicitly run).
// UNIVERSALITY: no identity in this file; ham_uid rides in from the bead.
'use strict';
// ⬡B:core.task.queue:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

// FLAT-QUERY EXEMPTION, recorded: queue-state transitions are a state machine,
// not content retrieval. FIND traverses content strands; claiming, completing,
// and sweeping TASK rows by stamp_type IS the correct access shape here.

const BRAIN_URL = process.env.AIBE_BRAIN_URL;
const BRAIN_KEY = process.env.AIBE_BRAIN_KEY;
const { claimTask, ensureLockTable } = require('./claim_lock.js');

const LEASE_MS = parseInt(process.env.QUEUE_LEASE_MS || '300000', 10);
const MAX_ATTEMPTS = parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3', 10);

function readHeaders() {
  const key = _bk();
  return { apikey: key, Authorization: 'Bearer ' + key, 'Accept-Profile': _schema() };
}
function writeHeaders(extra) {
  const key = _bk();
  return Object.assign({
    apikey: key, Authorization: 'Bearer ' + key,
    'Accept-Profile': _schema(), 'Content-Profile': _schema(),
    'Content-Type': 'application/json'
  }, extra || {});
}
function claimReadHeaders() {
  return { apikey: BRAIN_KEY, Authorization: 'Bearer ' + BRAIN_KEY,
    'Accept-Profile': 'abacia_core' };
}
function abortSignal(options) {
  return options && (options.signal || options.abortSignal) || null;
}
async function cancellationRequested(options) {
  const signal = abortSignal(options);
  if (signal && signal.aborted) return true;
  if (options && typeof options.isCancelled === 'function') {
    try { return await options.isCancelled(true) === true; }
    catch (eCancel) { return true; }
  }
  return false;
}
async function execSql(sql) {
  const res = await fetch(BRAIN_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { apikey: BRAIN_KEY, Authorization: 'Bearer ' + BRAIN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  if (!res.ok) throw new Error('exec_sql ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0));
}
let attemptsEnsured = false;
async function ensureAttemptsColumn() {
  if (attemptsEnsured) return;
  await ensureLockTable();
  await execSql('ALTER TABLE abacia_core.task_claims ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0');
  attemptsEnsured = true;
}

// ---------- ENQUEUE, idempotent ----------
// source is the idempotency key. A doubled webhook re-sends the same source;
// the existing check returns the existing bead instead of minting a twin.
async function enqueueTask(bead, options) {
  if (!bead || !bead.source) return { ok: false, reason: 'source_required_as_idempotency_key' };
  if (await cancellationRequested(options)) {
    return { ok:false, reason:'voice_turn_cancelled' };
  }
  // ⬡B:core.task.queue:WIRE:spawn_guard_l7:20260706⬡ Enqueue IS the spawn
  // point for queued work. The guard judges lineage + budget carried in
  // content; when armed (SPAWN_GUARD_ENFORCE=true) a bad spec is REFUSED at
  // the gate, never cleaned up after. Unarmed, the verdict still rides the
  // return so callers surface before the wall hardens.
  var guardVerdict = null;
  try {
    var spec = typeof bead.content === 'string' ? JSON.parse(bead.content) : (bead.content || {});
    guardVerdict = require('./spawn.guard.js').checkSpawn(spec);
    if (!guardVerdict.ok && require('./spawn.guard.js').enforcing()) {
      return { ok: false, refused: true, reasons: guardVerdict.reasons };
    }
  } catch (eGuard) { guardVerdict = { ok: false, reasons: ['content_unparseable'] }; }
  const signal = abortSignal(options);
  const readRequest = { headers: readHeaders() };
  if (signal) readRequest.signal = signal;
  const existing = await fetch(
    _bu() + '/rest/v1/' + _tbl() + '?select=id,stamp_type&source=eq.' + encodeURIComponent(bead.source)
      + '&stamp_type=in.(TASK,TASK_CLAIMED,TASK_REVIEW,TASK_DONE,TASK_DEAD)&limit=1',
    readRequest
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  if (await cancellationRequested(options)) {
    return { ok:false, reason:'voice_turn_cancelled' };
  }
  if (existing.length) return { ok: true, duplicate: true, id: existing[0].id, state: existing[0].stamp_type };
  const row = Object.assign({ stamp_type: 'TASK', importance: bead.importance || 7 }, bead, { stamp_type: 'TASK' });
  if (_tbl() !== 'aibe_brain' && row.spawned_by === undefined) {
    row.spawned_by = (bead.source && String(bead.source).split('.')[0]) || 'SPAN';
  }
  if (await cancellationRequested(options)) {
    return { ok:false, reason:'voice_turn_cancelled' };
  }
  const writeRequest = { method:'POST',
    headers:writeHeaders({ Prefer:'return=representation' }), body:JSON.stringify(row) };
  if (signal) writeRequest.signal = signal;
  let res;
  try { res = await fetch(_bu() + '/rest/v1/' + _tbl() + '', writeRequest); }
  catch (eWrite) {
    if (signal && signal.aborted) {
      return { ok:false, reason:'task_enqueue_uncertain', cancelled:true };
    }
    throw eWrite;
  }
  if (!res.ok) return { ok: false, reason: 'insert_failed_' + res.status };
  const inserted = await res.json().catch(() => []);
  return { ok: true, duplicate: false, id: inserted[0] && inserted[0].id, spawnGuard: guardVerdict };
}

// ---------- CLAIM, atomic, skip-locked semantics ----------
// Reads pending candidates, then races the atomic arbiter per candidate.
// The INSERT ... ON CONFLICT ... WHERE lease_expires_at < now() is the only
// judge; a loser moves to the next candidate (skip, never block). The winner
// also flips the bead TASK -> TASK_CLAIMED with a conditional PATCH so the
// bead's own state agrees with the claim registry.
async function claimNext(claimant, opts) {
  opts = opts || {};
  if (!BRAIN_URL || !BRAIN_KEY) return null;
  await ensureAttemptsColumn();
  const limit = opts.candidates || 5;
  const sourceFilter = opts.sourcePrefix
    ? '&source=like.' + encodeURIComponent(String(opts.sourcePrefix).replace(/\*+$/, '') + '*') : '';
  const rows = await fetch(
    _bu() + '/rest/v1/' + _tbl() + '?select=id,source,content,summary,ham_uid,importance'
      + '&stamp_type=eq.TASK' + sourceFilter + '&order=importance.desc,created_at.asc&limit=' + limit,
    { headers: readHeaders() }
  ).then(r => r.ok ? r.json() : []).catch(() => []);

  for (const row of rows) {
    const key = 'task_bead_' + row.id;
    const won = await claimTask(key, claimant, opts.leaseMs || LEASE_MS).catch(() => false);
    if (!won) continue; // skip locked
    // attempts ceiling check + increment, on the claim row we now hold
    const claim = await fetch(
      BRAIN_URL + '/rest/v1/task_claims?task_source=eq.' + encodeURIComponent(key) + '&select=attempts',
      { headers: claimReadHeaders() }
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    const attempts = (claim[0] && claim[0].attempts) || 0;
    if (attempts >= MAX_ATTEMPTS) {
      await deadLetter(row, attempts, claimant, 'attempts_ceiling');
      continue;
    }
    await execSql("UPDATE abacia_core.task_claims SET attempts = attempts + 1 WHERE task_source = '"
      + key.replace(/'/g, "''") + "'").catch(() => {});
    // flip the bead itself; conditional so a racing DONE/STALE never regresses
    const flip = await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + row.id + '&stamp_type=eq.TASK', {
      method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ stamp_type: 'TASK_CLAIMED' })
    }).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!flip.length) continue; // bead moved under us; claim registry lease will expire harmlessly
    return { id: row.id, source: row.source, content: row.content, summary: row.summary,
      ham_uid: row.ham_uid, importance: row.importance, attempts: attempts + 1, claimKey: key };
  }
  return null;
}

// ---------- COMPLETE, exactly once ----------
async function completeTask(task, resultNote) {
  const done = await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + task.id + '&stamp_type=eq.TASK_CLAIMED', {
    method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ stamp_type: 'TASK_DONE' })
  }).then(r => r.ok ? r.json() : []).catch(() => []);
  if (!done.length) return { ok: false, reason: 'already_completed_or_not_claimed' };
  await execSql("DELETE FROM abacia_core.task_claims WHERE task_source = 'task_bead_" + task.id + "'").catch(() => {});
  return { ok: true, note: resultNote || null };
}

// ---------- REVIEW: CANEW authored, Cathy/CANON judges ----------
// A successful build never writes main and therefore is not complete. The task
// waits in TASK_REVIEW with the draft-PR receipt embedded in its content. A
// later reconciliation may close it only after GitHub reports that PR merged.
async function markTaskReview(task, review) {
  let original = task && task.content;
  if (typeof original === 'string') {
    try { original = JSON.parse(original); } catch (e) { original = { task: original }; }
  }
  if (!original || typeof original !== 'object') original = {};
  const content = Object.assign({}, original, { review: review || {} });
  const moved = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?id=eq.' + task.id + '&stamp_type=eq.TASK_CLAIMED', {
    method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ stamp_type: 'TASK_REVIEW', content: content })
  }).then(r => r.ok ? r.json() : []).catch(() => []);
  if (!moved.length) return { ok: false, reason: 'already_moved_or_not_claimed' };
  await execSql("DELETE FROM abacia_core.task_claims WHERE task_source = 'task_bead_"
    + String(task.id).replace(/'/g, "''") + "'").catch(() => {});
  return { ok: true, state: 'TASK_REVIEW', review: review || {} };
}

async function listReviewTasks(sourcePrefix, limit) {
  const sourceFilter = sourcePrefix
    ? '&source=like.' + encodeURIComponent(String(sourcePrefix).replace(/\*+$/, '') + '*') : '';
  return fetch(_bu() + '/rest/v1/' + _tbl()
    + '?select=id,source,content,summary,ham_uid,importance&stamp_type=eq.TASK_REVIEW'
    + sourceFilter + '&order=created_at.asc&limit=' + (parseInt(limit || 20, 10)),
  { headers: readHeaders() }).then(r => r.ok ? r.json() : []).catch(() => []);
}

async function completeReviewedTask(task, mergeReceipt) {
  let original = task && task.content;
  if (typeof original === 'string') {
    try { original = JSON.parse(original); } catch (e) { original = { task: original }; }
  }
  if (!original || typeof original !== 'object') original = {};
  const content = Object.assign({}, original, { completion: mergeReceipt || {} });
  const done = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?id=eq.' + task.id + '&stamp_type=eq.TASK_REVIEW', {
    method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ stamp_type: 'TASK_DONE', content: content })
  }).then(r => r.ok ? r.json() : []).catch(() => []);
  if (!done.length) return { ok: false, reason: 'already_completed_or_not_in_review' };
  return { ok: true, state: 'TASK_DONE', merge: mergeReceipt || null };
}

// ---------- SUPERSEDE: invalidate an unclaimed task without deleting history ----------
// This is deliberately source-bound and conditional on TASK. It exists for a
// receipted authority correction (for example, a CODA HOLD discovered after an
// activation bug), not as a general queue-clearing mechanism.
async function supersedePendingTask(source, supersededBy, reason) {
  source = String(source || '').trim();
  supersededBy = String(supersededBy || '').trim();
  reason = String(reason || '').trim();
  if (!source) return { ok:false, reason:'source_required' };
  if (!supersededBy) return { ok:false, reason:'superseding_receipt_required' };
  if (!reason) return { ok:false, reason:'supersession_reason_required' };
  const rows = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?select=id,content&source=eq.' + encodeURIComponent(source)
    + '&stamp_type=eq.TASK&limit=1', { headers:readHeaders() })
    .then(r => r.ok ? r.json() : []).catch(() => []);
  if (!rows.length) return { ok:false, reason:'pending_task_not_found' };
  let content = rows[0].content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch (e) { content = { task:content }; }
  }
  if (!content || typeof content !== 'object') content = {};
  content = Object.assign({}, content, { supersession:{ by:supersededBy,
    reason:reason, at:new Date().toISOString() } });
  const moved = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?id=eq.' + encodeURIComponent(rows[0].id) + '&stamp_type=eq.TASK', {
    method:'PATCH', headers:writeHeaders({ Prefer:'return=representation' }),
    body:JSON.stringify({ stamp_type:'TASK_DEAD', content:content })
  }).then(r => r.ok ? r.json() : []).catch(() => []);
  if (!moved.length) return { ok:false, reason:'task_moved_before_supersession' };
  return { ok:true, id:rows[0].id, source:source, state:'TASK_DEAD',
    superseded_by:supersededBy, reason:reason };
}

// ---------- FAIL: retry or dead-letter ----------
async function failTask(task, reason) {
  if ((task.attempts || 0) >= MAX_ATTEMPTS) {
    const bead = { id: task.id, source: task.source, ham_uid: task.ham_uid, summary: task.summary };
    await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + task.id + '&stamp_type=eq.TASK_CLAIMED', {
      method: 'PATCH', headers: writeHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ stamp_type: 'TASK_DEAD' })
    }).catch(() => {});
    await deadLetterAlert(bead, task.attempts, reason);
    return { ok: true, state: 'TASK_DEAD' };
  }
  await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + task.id + '&stamp_type=eq.TASK_CLAIMED', {
    method: 'PATCH', headers: writeHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ stamp_type: 'TASK' })
  }).catch(() => {});
  return { ok: true, state: 'TASK' };
}

async function deadLetter(row, attempts, claimant, reason) {
  await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + row.id + '&stamp_type=in.(TASK,TASK_CLAIMED)', {
    method: 'PATCH', headers: writeHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ stamp_type: 'TASK_DEAD' })
  }).catch(() => {});
  await deadLetterAlert(row, attempts, reason);
}
async function deadLetterAlert(row, attempts, reason) {
  const ts = Date.now();
  await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
    method: 'POST', headers: writeHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      ham_uid: row.ham_uid || process.env.DEFAULT_HAM_UID || 'unknown',
      agent_global: 'SPAN', stamp_type: 'ALERT', importance: 8,
      acl_stamp: '⬡B:core.task.queue:ALERT:dead_letter:' + ts + '⬡',
      source: 'queue.dead_letter.' + row.id + '.' + ts,
      summary: '[QUEUE DEAD-LETTER] task ' + row.id + ' after ' + attempts + ' attempts: ' + String(reason || '').slice(0, 100),
      content: JSON.stringify({ task_id: row.id, task_source: row.source, attempts: attempts, reason: reason })
    })
  }).catch(() => {});
}

// ---------- SWEEP: the lease law ----------
// Every expired-lease claim whose bead is still TASK_CLAIMED goes back to
// pending, visibly, without a human. Claim rows persist (attempts memory);
// an expired lease is exactly what makes a row reclaimable.
async function sweepLeases() {
  const expired = await fetch(
    BRAIN_URL + '/rest/v1/task_claims?select=task_source,attempts&lease_expires_at=lt.' + new Date().toISOString(),
    { headers: claimReadHeaders() }
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  let returned = 0;
  for (const c of expired) {
    const m = /^task_bead_(.+)$/.exec(c.task_source || '');
    if (!m) continue;
    const flipped = await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + encodeURIComponent(m[1]) + '&stamp_type=eq.TASK_CLAIMED', {
      method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ stamp_type: 'TASK' })
    }).then(r => r.ok ? r.json() : []).catch(() => []);
    if (flipped.length) returned++;
  }
  return { ok: true, expiredClaims: expired.length, returnedToPending: returned };
}

// ---------- QUEUE DEPTH: the health signal Overseer reads ----------
async function queueDepth() {
  async function count(st) {
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=id&stamp_type=eq.' + st + '&limit=1', {
      method: 'HEAD', headers: Object.assign({}, readHeaders(), { Prefer: 'count=exact' })
    }).catch(() => null);
    if (!r) return -1;
    const cr = r.headers.get('content-range') || '';
    const n = parseInt(cr.split('/')[1], 10);
    return isNaN(n) ? -1 : n;
  }
  const [pending, claimed, review, done, dead, stale] = await Promise.all(
    ['TASK', 'TASK_CLAIMED', 'TASK_REVIEW', 'TASK_DONE', 'TASK_DEAD', 'TASK_STALE'].map(count));
  return { ok: true, pending, claimed, review, done, dead, stale };
}

// ---------- STALE RESOLUTION, run deliberately, never on a timer ----------
// Resolves aged pending rows in place: TASK -> TASK_STALE, superseded, never
// deleted, with one RESULT bead recording the sweep, counts and window.
async function sweepStale(days) {
  const d = parseInt(days || process.env.QUEUE_STALE_DAYS || '14', 10);
  const cutoff = new Date(Date.now() - d * 86400000).toISOString();
  const moved = await fetch(
    _bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.TASK&created_at=lt.' + encodeURIComponent(cutoff),
    { method: 'PATCH', headers: writeHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ stamp_type: 'TASK_STALE' }) }
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  const ts = Date.now();
  if (moved.length) {
    await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST', headers: writeHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        ham_uid: process.env.DEFAULT_HAM_UID || 'unknown', agent_global: 'SPAN',
        stamp_type: 'RESULT', importance: 7,
        acl_stamp: '⬡B:core.task.queue:RESULT:stale_sweep:' + ts + '⬡',
        source: 'queue.stale_sweep.' + ts,
        summary: '[QUEUE] ' + moved.length + ' stale TASK rows older than ' + d + 'd resolved in place to TASK_STALE, superseded never deleted',
        content: JSON.stringify({ count: moved.length, cutoff: cutoff, ids: moved.map(x => x.id).slice(0) })
      })
    }).catch(() => {});
  }
  return { ok: true, moved: moved.length, cutoff: cutoff };
}

module.exports = { enqueueTask, claimNext, completeTask, markTaskReview, listReviewTasks,
  completeReviewedTask, supersedePendingTask, failTask, sweepLeases, sweepStale, queueDepth };
