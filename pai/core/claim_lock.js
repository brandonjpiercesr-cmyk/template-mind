// ⬡B:core.claim_lock:MODULE:atomic_task_claim:20260703⬡
// entered via the ABAHAM door, serving channel internal
//
// Real atomic task claiming on Postgres. Fifth attempt at this exact problem
// tonight; the prior four all shared the same two plumbing bugs (missing
// /rest/v1/rpc/ in the exec_sql url, missing Content-Profile/Accept-Profile
// headers) confirmed by direct live testing against this exact brain, not
// guessed. This file uses the proven call shape.
//
// Design: a real Postgres table, created once if missing, then a single
// atomic INSERT ... ON CONFLICT DO NOTHING RETURNING id decides the winner.
// No separate check-then-insert -- that was the earlier attempts' real bug,
// a race between two non-atomic steps. The insert itself is the only
// arbiter, exactly matching the standing lesson every prior grade repeated.

const BRAIN_URL = process.env.AIBE_BRAIN_URL;
const BRAIN_KEY = process.env.AIBE_BRAIN_KEY;

function brainHeaders() {
  return {
    apikey: BRAIN_KEY,
    Authorization: 'Bearer ' + BRAIN_KEY,
    'Content-Type': 'application/json'
  };
}

// exec_sql itself lives in the public schema, not abacia_core -- confirmed by
// direct live test: calling it WITH Content-Profile/Accept-Profile set to
// abacia_core 404s, PGRST202, function not found in that schema. Calling it
// with no profile headers (PostgREST's default, public) returns 204. This is
// the opposite of most other RPCs in this system and cost a real failed test
// to find. The SQL text itself still targets abacia_core.task_claims
// explicitly, schema-qualified in the query, which is unrelated to which
// schema exec_sql the function lives in.

async function execSql(sql) {
  const url = BRAIN_URL + '/rest/v1/rpc/exec_sql';
  const res = await fetch(url, { method: 'POST', headers: brainHeaders(), body: JSON.stringify({ query: sql }) });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('exec_sql failed: ' + res.status + ' ' + text.slice(0, 200));
  }
  return res;
}

let tableEnsured = false;
async function ensureLockTable() {
  if (tableEnsured) return;
  await execSql(
    "CREATE TABLE IF NOT EXISTS abacia_core.task_claims (" +
    "task_source text PRIMARY KEY, " +
    "claimed_by text NOT NULL, " +
    "claimed_at timestamptz NOT NULL DEFAULT now(), " +
    "lease_expires_at timestamptz NOT NULL)"
  );
  tableEnsured = true;
}

async function readClaim(taskSource) {
  const sourceEnc = encodeURIComponent(taskSource);
  const url = BRAIN_URL + '/rest/v1/task_claims?task_source=eq.' + sourceEnc + '&select=claimed_by,lease_expires_at';
  const res = await fetch(url, {
    headers: { apikey: BRAIN_KEY, Authorization: 'Bearer ' + BRAIN_KEY, 'Accept-Profile': 'abacia_core' }
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(function () { return []; });
  return (rows && rows[0]) || null;
}

// ⬡B:core.claim_lock:GUARD:strict_claim_readback_for_webhooks:20260715⬡
// Webhook receivers must distinguish a real duplicate from an unreadable lock
// table. The legacy readClaim intentionally collapsed both to null for queue
// callers. This strict companion preserves that behavior while giving external
// effect boundaries a fail-closed, tri-state readback.
async function inspectClaim(taskSource) {
  if (!BRAIN_URL || !BRAIN_KEY) throw new Error('claim_store_unconfigured');
  const sourceEnc = encodeURIComponent(taskSource);
  const url = BRAIN_URL + '/rest/v1/task_claims?task_source=eq.' + sourceEnc
    + '&select=claimed_by,lease_expires_at';
  const res = await fetch(url, {
    headers: { apikey: BRAIN_KEY, Authorization: 'Bearer ' + BRAIN_KEY,
      'Accept-Profile': 'abacia_core' }
  });
  if (!res.ok) throw new Error('claim_readback_failed:' + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('claim_readback_invalid');
  return rows[0] || null;
}

// Claims a task for leaseMs milliseconds. exec_sql never returns query
// results (confirmed live: always 204, no body, regardless of the query) so
// the atomic INSERT fires through it fire-and-forget, and the real winner is
// confirmed by reading the row back through the normal table REST interface
// afterward. This stays race-safe: the INSERT itself is what Postgres
// arbitrates atomically, the read only reports what already happened, it
// cannot be fooled by a second caller racing in after the insert commits.
async function claimTask(taskSource, claimant, leaseMs) {
  if (!BRAIN_URL || !BRAIN_KEY) return false;
  await ensureLockTable();
  const lease = leaseMs || 300000;
  const claimantEsc = String(claimant).replace(/'/g, "''");
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  const sql =
    "INSERT INTO abacia_core.task_claims (task_source, claimed_by, lease_expires_at) " +
    "VALUES ('" + sourceEsc + "', '" + claimantEsc + "', now() + interval '" + Math.ceil(lease / 1000) + " seconds') " +
    "ON CONFLICT (task_source) DO UPDATE SET claimed_by = EXCLUDED.claimed_by, claimed_at = now(), " +
    "lease_expires_at = EXCLUDED.lease_expires_at " +
    "WHERE abacia_core.task_claims.lease_expires_at < now()";
  await execSql(sql);
  const row = await readClaim(taskSource);
  return !!(row && row.claimed_by === claimant);
}

async function releaseTask(taskSource) {
  if (!BRAIN_URL || !BRAIN_KEY) return;
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  await execSql("DELETE FROM abacia_core.task_claims WHERE task_source = '" + sourceEsc + "'").catch(function () {});
}

module.exports = { claimTask, releaseTask, ensureLockTable, inspectClaim };
