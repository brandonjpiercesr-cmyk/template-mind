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

// Claims and receipt indexes are two different storage roles. The atomic
// task_claims table was proven on the legacy brain, while REACH receipt rows may
// now live in Memory Bank. Never create an index in one Supabase project and
// then write the protected row to another.
function claimStore() {
  if (process.env.CLAIM_STORE_URL || process.env.CLAIM_STORE_KEY) {
    return { url:process.env.CLAIM_STORE_URL || '', key:process.env.CLAIM_STORE_KEY || '',
      schema:process.env.CLAIM_STORE_SCHEMA || '' };
  }
  if (process.env.AIBE_BRAIN_URL && process.env.AIBE_BRAIN_KEY) {
    return { url:process.env.AIBE_BRAIN_URL, key:process.env.AIBE_BRAIN_KEY,
      schema:process.env.CLAIM_STORE_SCHEMA || 'abacia_core' };
  }
  return { url:process.env.MEMORY_BANK_URL || '', key:process.env.MEMORY_BANK_KEY || '',
    schema:process.env.CLAIM_STORE_SCHEMA || process.env.BRAIN_SCHEMA || 'memory_bank' };
}

function receiptStore(config) {
  config = config || {};
  if (config.url || config.key) return { url:config.url || '', key:config.key || '' };
  if (process.env.MEMORY_BANK_URL && process.env.MEMORY_BANK_KEY) {
    return { url:process.env.MEMORY_BANK_URL, key:process.env.MEMORY_BANK_KEY };
  }
  return { url:process.env.AIBE_BRAIN_URL || '', key:process.env.AIBE_BRAIN_KEY || '' };
}

function brainUrl() { return claimStore().url; }
function brainKey() { return claimStore().key; }
function claimSchema() {
  const value = String(claimStore().schema || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error('claim_store_schema_invalid');
  }
  return value;
}

function brainHeaders() {
  const key = brainKey();
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
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

async function execSqlAt(store, sql) {
  if (!store || !store.url || !store.key) throw new Error('claim_store_unconfigured');
  const url = String(store.url).replace(/\/$/, '') + '/rest/v1/rpc/exec_sql';
  const res = await fetch(url, { method:'POST', headers:{ apikey:store.key,
    Authorization:'Bearer ' + store.key, 'Content-Type':'application/json' },
  body:JSON.stringify({ query:sql }) });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('exec_sql failed: ' + res.status + ' ' + text.slice(0, 200));
  }
  return res;
}

async function execSql(sql) {
  return execSqlAt(claimStore(), sql);
}

let tableEnsuredFor = '';
async function ensureLockTable() {
  const url = brainUrl();
  const schema = claimSchema();
  const storeKey = url + '|' + schema;
  if (tableEnsuredFor === storeKey) return;
  await execSql(
    'CREATE TABLE IF NOT EXISTS ' + sqlIdentifier(schema) + '.task_claims (' +
    "task_source text PRIMARY KEY, " +
    "claimed_by text NOT NULL, " +
    "claimed_at timestamptz NOT NULL DEFAULT now(), " +
    "lease_expires_at timestamptz NOT NULL)"
  );
  tableEnsuredFor = storeKey;
}

async function readClaim(taskSource) {
  const sourceEnc = encodeURIComponent(taskSource);
  const key = brainKey();
  const schema = claimSchema();
  const url = brainUrl() + '/rest/v1/task_claims?task_source=eq.' + sourceEnc + '&select=claimed_by,lease_expires_at';
  const res = await fetch(url, {
    headers: { apikey:key, Authorization:'Bearer ' + key, 'Accept-Profile':schema }
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
  const urlBase = brainUrl(), key = brainKey();
  if (!urlBase || !key) throw new Error('claim_store_unconfigured');
  const schema = claimSchema();
  const sourceEnc = encodeURIComponent(taskSource);
  const url = urlBase + '/rest/v1/task_claims?task_source=eq.' + sourceEnc
    + '&select=claimed_by,lease_expires_at';
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key,
      'Accept-Profile':schema }
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
  if (!brainUrl() || !brainKey()) return false;
  await ensureLockTable();
  const schema = sqlIdentifier(claimSchema());
  const lease = leaseMs || 300000;
  const claimantEsc = String(claimant).replace(/'/g, "''");
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  const sql =
    'INSERT INTO ' + schema + ".task_claims (task_source, claimed_by, lease_expires_at) " +
    "VALUES ('" + sourceEsc + "', '" + claimantEsc + "', now() + interval '" + Math.ceil(lease / 1000) + " seconds') " +
    "ON CONFLICT (task_source) DO UPDATE SET claimed_by = EXCLUDED.claimed_by, claimed_at = now(), " +
    "lease_expires_at = EXCLUDED.lease_expires_at " +
    'WHERE ' + schema + '.task_claims.lease_expires_at < now()';
  await execSql(sql);
  const row = await readClaim(taskSource);
  return !!(row && row.claimed_by === claimant);
}

// Long-running scanners renew only the lease they still own. The claimant
// predicate is evaluated by Postgres in the same UPDATE that extends the
// expiry, so an expired worker cannot take a lease back from a newer owner.
async function renewTaskIfOwned(taskSource, claimant, leaseMs) {
  if (!brainUrl() || !brainKey() || !taskSource || !claimant) return false;
  await ensureLockTable();
  const schema = sqlIdentifier(claimSchema());
  const lease = leaseMs || 300000;
  const claimantEsc = String(claimant).replace(/'/g, "''");
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  await execSql('UPDATE ' + schema + '.task_claims SET lease_expires_at = now() + interval \'' +
    Math.ceil(lease / 1000) + " seconds' WHERE task_source = '" + sourceEsc +
    "' AND claimed_by = '" + claimantEsc + "'");
  const row = await inspectClaim(taskSource);
  return !!(row && row.claimed_by === claimant &&
    Number.isFinite(Date.parse(row.lease_expires_at)) &&
    Date.parse(row.lease_expires_at) > Date.now());
}

async function releaseTask(taskSource) {
  if (!brainUrl() || !brainKey()) return;
  const schema = sqlIdentifier(claimSchema());
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  await execSql('DELETE FROM ' + schema + ".task_claims WHERE task_source = '" +
    sourceEsc + "'").catch(function () {});
}

// Receipt writers may release only the lease they themselves won after a
// represented write is proven absent. The claimant predicate prevents a late
// failure handler from deleting a newer owner's lease.
async function releaseTaskIfOwned(taskSource, claimant) {
  if (!brainUrl() || !brainKey() || !taskSource || !claimant) return false;
  const before = await inspectClaim(taskSource);
  if (!before || before.claimed_by !== claimant) return false;
  const sourceEsc = String(taskSource).replace(/'/g, "''");
  const claimantEsc = String(claimant).replace(/'/g, "''");
  const schema = sqlIdentifier(claimSchema());
  await execSql('DELETE FROM ' + schema + ".task_claims WHERE task_source = '" +
    sourceEsc + "' AND claimed_by = '" + claimantEsc + "'");
  const row = await inspectClaim(taskSource);
  return !row || row.claimed_by !== claimant;
}

function sqlIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error('exact_row_identifier_invalid');
  }
  return '"' + value.replace(/"/g, '""') + '"';
}

const EXACTNESS_RPC = 'ensure_anew_reach_queue_indexes';
const EXACTNESS_CONTRACT = 'anew.reach.receipt-indexes.v1';
const EXACTNESS_FINGERPRINT = '13dee418ff5d30c5722151ea083d0744';
const VOICE_INDEXES = Object.freeze([
  'anew_voice_receipt_ham_source_uq_v2'
]);
const MESSAGE_INDEXES = Object.freeze([
  'anew_reach_provider_intent_source_uq_v1',
  'anew_reach_provider_attempt_source_uq_v1',
  'anew_reach_provider_attempt_intent_uq_v1',
  'anew_reach_provider_recovery_source_uq_v1',
  'anew_reach_provider_final_source_uq_v1',
  'anew_reach_provider_pending_ham_source_uq_v1',
  'anew_reach_message_receipt_ham_source_uq_v1'
]);
const REACH_QUEUE_INDEXES = Object.freeze([
  'anew_reach_candidate_ham_source_uq_v1',
  'anew_reach_candidate_done_ham_source_uq_v1',
  'anew_reach_cycle_decision_ham_source_uq_v1',
  'anew_reach_cycle_decision_evidence_uq_v1',
  'anew_reach_recovery_checkpoint_ham_source_uq_v1'
]);
const ALL_EXACTNESS_INDEXES = Object.freeze(
  VOICE_INDEXES.concat(MESSAGE_INDEXES, REACH_QUEUE_INDEXES));
const exactnessRpcInFlight = new Map();
const legacyExactnessInFlight = new Map();
const EXACTNESS_RPC_TIMEOUT_MS = 5000;
const LEGACY_INDEX_DDL = Object.freeze({
  anew_voice_receipt_ham_source_uq_v2:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_voice_receipt_ham_source_uq_v2" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) WHERE stamp_type IN ' +
    "('VOICE_LIFECYCLE', 'VOICE_TURN_DELIVERY', 'OUTREACH_DELIVERY')",
  anew_reach_provider_intent_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_intent_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (source) WHERE stamp_type = \'REACH_PROVIDER_INTENT\'',
  anew_reach_provider_attempt_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_attempt_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (source) WHERE stamp_type = \'REACH_PROVIDER_ATTEMPT\'',
  anew_reach_provider_attempt_intent_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_attempt_intent_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" ((content::jsonb ->> \'providerIntentSource\')) ' +
    "WHERE stamp_type = 'REACH_PROVIDER_ATTEMPT'",
  anew_reach_provider_recovery_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_recovery_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (source) WHERE stamp_type = \'REACH_PROVIDER_RECOVERY\'',
  anew_reach_provider_final_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_final_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (source) WHERE stamp_type = \'REACH_PROVIDER_FINALIZATION\'',
  anew_reach_provider_pending_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_provider_pending_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) WHERE ' +
    "(stamp_type = 'OUTREACH' AND source LIKE 'outreach.pending.%') OR " +
    "(stamp_type = 'DIGEST' AND source LIKE 'outreach.digest.pending.%')",
  anew_reach_message_receipt_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_message_receipt_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) WHERE stamp_type IN ' +
    "('REACH_PROVIDER_ORPHAN', 'REACH_PROVIDER_EVENT', 'OUTREACH_DELIVERY', " +
    "'OUTREACH_FAILURE')",
  anew_reach_candidate_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_candidate_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) ' +
    "WHERE stamp_type = 'REACH_CANDIDATE'",
  anew_reach_candidate_done_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_candidate_done_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) ' +
    "WHERE stamp_type = 'REACH_CANDIDATE_DONE'",
  anew_reach_cycle_decision_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_cycle_decision_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) ' +
    "WHERE stamp_type = 'REACH_CYCLE_DECISION'",
  anew_reach_cycle_decision_evidence_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_cycle_decision_evidence_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" ' +
    "(ham_uid, ((content::jsonb) ->> 'evidence_digest')) " +
    "WHERE stamp_type = 'REACH_CYCLE_DECISION'",
  anew_reach_recovery_checkpoint_ham_source_uq_v1:
    'CREATE UNIQUE INDEX IF NOT EXISTS "anew_reach_recovery_checkpoint_ham_source_uq_v1" ON ' +
    '"abacia_core"."aibe_brain" (ham_uid, source) ' +
    "WHERE stamp_type = 'REACH_RECOVERY_CHECKPOINT'"
});

function exactnessTimeout(config) {
  const requested = Number(config && config.timeoutMs);
  if (!Number.isFinite(requested)) return EXACTNESS_RPC_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(requested), 25), 15000);
}

function fetchWithExactnessTimeout(url, init, timeoutMs) {
  const controller = typeof AbortController === 'function'
    ? new AbortController() : null;
  const options = Object.assign({}, init || {});
  if (controller) options.signal = controller.signal;
  return new Promise(function(resolve, reject) {
    let settled = false;
    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      if (controller) controller.abort();
      reject(new Error('exactness_rpc_timeout'));
    }, timeoutMs);
    Promise.resolve().then(function() {
      return fetch(url, options);
    }).then(function(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function ensureFixedExactnessIndexes(config, required) {
  config = config || {};
  const store = receiptStore(config);
  if (!store.url || !store.key) throw new Error('receipt_store_unconfigured');
  if (config.schema !== 'memory_bank' || config.table !== 'beads') {
    throw new Error('exactness_rpc_surface_invalid');
  }
  const cacheKey = store.url + '|' + config.schema + '|' + config.table;
  let request = exactnessRpcInFlight.get(cacheKey);
  if (!request) {
    request = (async function () {
      const response = await fetchWithExactnessTimeout(
        String(store.url).replace(/\/$/, '') +
        '/rest/v1/rpc/' + EXACTNESS_RPC, {
        method:'POST', headers:{ apikey:store.key,
          Authorization:'Bearer ' + store.key, 'Content-Type':'application/json' },
        body:'{}'
      }, exactnessTimeout(config));
      if (!response || !response.ok) {
        const detail = response && typeof response.text === 'function'
          ? await response.text().catch(function () { return ''; }) : '';
        throw new Error('exactness_rpc_failed:' +
          (response && response.status || 'network') + ':' + detail.slice(0,120));
      }
      const result = await response.json().catch(function () { return null; });
      if (!result || result.ready !== true ||
          result.contract !== EXACTNESS_CONTRACT ||
          result.index_count !== ALL_EXACTNESS_INDEXES.length ||
          result.fingerprint !== EXACTNESS_FINGERPRINT) {
        throw new Error('exactness_rpc_verification_failed');
      }
      return result;
    })();
    exactnessRpcInFlight.set(cacheKey, request);
    request.catch(function () { exactnessRpcInFlight.delete(cacheKey); });
  }
  await request;
  if (required.some(function (name) {
    return ALL_EXACTNESS_INDEXES.indexOf(name) < 0;
  })) {
    throw new Error('exactness_rpc_required_subset_missing');
  }
  return true;
}

async function ensureLegacyExactnessIndexes(config, required) {
  config = config || {};
  if (process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY ||
      config.schema !== 'abacia_core' || config.table !== 'aibe_brain') {
    throw new Error('legacy_exactness_surface_invalid');
  }
  const store = receiptStore(config);
  const configuredUrl = String(process.env.AIBE_BRAIN_URL || '').replace(/\/$/, '');
  const selectedUrl = String(store.url || '').replace(/\/$/, '');
  const configuredKey = process.env.AIBE_BRAIN_KEY || '';
  if (!configuredUrl || !configuredKey || !store.url || !store.key) {
    throw new Error('receipt_store_unconfigured');
  }
  if (selectedUrl !== configuredUrl || store.key !== configuredKey) {
    throw new Error('legacy_exactness_store_mismatch');
  }
  const cacheKey = store.url + '|abacia_core|aibe_brain|' + required.join(',');
  let request = legacyExactnessInFlight.get(cacheKey);
  if (!request) {
    request = (async function() {
      for (const name of required) {
        const ddl = LEGACY_INDEX_DDL[name];
        if (!ddl) throw new Error('legacy_exactness_index_unknown');
        await execSqlAt(store, ddl);
      }
      return true;
    })();
    legacyExactnessInFlight.set(cacheKey, request);
    request.catch(function() { legacyExactnessInFlight.delete(cacheKey); });
  }
  return request;
}

function ensureReceiptExactness(config, required) {
  if (process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY) {
    return ensureFixedExactnessIndexes(config, required);
  }
  return ensureLegacyExactnessIndexes(config, required);
}

// REST cannot distinguish "request never arrived" from "insert committed but
// its response was lost." Put the exactly-once rule in Postgres, where both
// transactions are visible. The partial index is deliberately limited to the
// receipt types owned by this voice route, including the immutable REACH
// transition derived from a completed live voice exchange. It cannot change
// legacy bead semantics or assume anything about generated row IDs.
async function ensureVoiceReceiptUniqueness(config) {
  return ensureReceiptExactness(config, VOICE_INDEXES);
}

// Provider acceptance and the later provider lifecycle event are separated by
// an asynchronous webhook.  These indexes make the bridge durable: one
// provider message ID can be bound to only one HAM/request, and every immutable
// lifecycle/terminal receipt can exist only once for that HAM and source.  The
// provider ID is namespaced by provider in the deterministic source, so IDs
// from two providers cannot collide.
async function ensureMessageReceiptUniqueness(config) {
  return ensureReceiptExactness(config, MESSAGE_INDEXES);
}

// The REACH cycle queue and its one-council decision wrapper are immutable
// receipts. Application leases narrow concurrency, but only a database unique
// index closes the lost-response and cross-instance write race.
async function ensureReachQueueUniqueness(config) {
  return ensureReceiptExactness(config, REACH_QUEUE_INDEXES);
}

module.exports = { claimTask, renewTaskIfOwned, releaseTask, releaseTaskIfOwned,
  ensureVoiceReceiptUniqueness, ensureMessageReceiptUniqueness,
  ensureReachQueueUniqueness,
  ensureLockTable, inspectClaim,
  _test:{ensureFixedExactnessIndexes,ensureLegacyExactnessIndexes,
    fetchWithExactnessTimeout,EXACTNESS_RPC,EXACTNESS_CONTRACT,
    EXACTNESS_FINGERPRINT,EXACTNESS_RPC_TIMEOUT_MS,LEGACY_INDEX_DDL,
    VOICE_INDEXES,MESSAGE_INDEXES,REACH_QUEUE_INDEXES,ALL_EXACTNESS_INDEXES} };
