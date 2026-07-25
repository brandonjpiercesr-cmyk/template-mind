// ⬡B:pai.core.autonomous_cycle:WONDER:durable_signal_driven_autonomous_cycle:20260725⬡
'use strict';

// The autonomous cycle is an effect boundary. A timer may cheaply look for work, but it
// may not invent work. Paid thought and external effects begin only after an exact-HAM,
// edge-bearing signal is atomically claimed, durably consumed, and read back from the ONE
// brain. Missing configuration, unreadable state, malformed signals, and ambiguous history
// all resolve to zero spend.

const crypto = require('node:crypto');

const SIGNAL_TYPE = 'AUTONOMOUS_CYCLE_SIGNAL';
const CONSUMED_TYPE = 'AUTONOMOUS_CYCLE_CONSUMED';
const RESULT_TYPE = 'AUTONOMOUS_CYCLE_RESULT';
const EFFECT_TYPE = 'AUTONOMOUS_EFFECT_CONSUMED';
const WONDER = 'AUTONOMOUS_CYCLE_WONDER';
const STATION_TARGETS = Object.freeze([
  'burst', 'ghost_monitor', 'ghost_handoff', 'dawn', 'hunch', 'press', 'sage'
]);
const TARGETS = new Set(['pai', 'span', 'drain'].concat(STATION_TARGETS));

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function configFromEnv(env) {
  env = env || process.env;
  return Object.freeze({
    enabled: String(env.AUTONOMOUS_CYCLE_ENABLED || '').trim().toLowerCase() === 'true',
    pollMs: boundedInt(env.AUTONOMOUS_SIGNAL_POLL_MS, 60000, 30000, 300000),
    signalLimit: boundedInt(env.AUTONOMOUS_SIGNAL_LIMIT, 20, 1, 50),
    signalMaxAgeMs: boundedInt(env.AUTONOMOUS_SIGNAL_MAX_AGE_MS, 21600000, 60000, 86400000),
    windowMs: boundedInt(env.AUTONOMOUS_TICK_WINDOW_MS, 3600000, 60000, 86400000),
    windowCeiling: boundedInt(env.AUTONOMOUS_TICK_CEILING, 1, 1, 24),
    claimLeaseMs: boundedInt(env.AUTONOMOUS_CLAIM_LEASE_MS, 2700000, 300000, 7200000)
  });
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseContent(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function normalizeTargets(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) return null;
  const targets = [];
  for (const raw of value) {
    const target = String(raw || '').trim().toLowerCase();
    if (!TARGETS.has(target)) return null;
    if (!targets.includes(target)) targets.push(target);
  }
  if (!targets.length) return null;
  // One signal owns one effect lane. SPAN may accompany the PAI wall that feeds it, but
  // drain and proactive stations each require their own receipt and budget slot.
  if (targets.includes('span') && (!targets.includes('pai') || targets.length !== 2)) return null;
  if (targets.length === 2 && !(targets.includes('pai') && targets.includes('span'))) return null;
  return targets;
}

function validateSignal(row, hamUid, nowMs, config) {
  if (!row || String(row.ham_uid || '').toUpperCase() !== String(hamUid || '').toUpperCase()) {
    return { ok: false, reason: 'signal_wrong_ham' };
  }
  if (row.stamp_type !== SIGNAL_TYPE || !row.source || typeof row.source !== 'string' ||
      row.source.length < 8 || row.source.length > 500) {
    return { ok: false, reason: 'signal_shape_invalid' };
  }
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(createdAt) || createdAt > nowMs + 300000 || nowMs - createdAt > config.signalMaxAgeMs) {
    return { ok: false, reason: 'signal_age_invalid' };
  }
  const content = parseContent(row.content);
  if (!content || content.status !== 'ready' || content.wonder !== WONDER) {
    return { ok: false, reason: 'signal_contract_invalid' };
  }
  if (!Array.isArray(content.edges) || content.edges.length === 0 ||
      !content.edges.every(function (edge) {
        return edge && typeof edge.type === 'string' && edge.type.trim() &&
          typeof edge.target === 'string' && edge.target.trim();
      }) || !content.edges.some(function (edge) { return edge.target === WONDER; })) {
    return { ok: false, reason: 'signal_orphaned' };
  }
  const targets = normalizeTargets(content.targets);
  if (!targets) return { ok: false, reason: 'signal_targets_invalid' };
  const expiresAt = content.expires_at == null ? null : Date.parse(content.expires_at);
  if (content.expires_at != null && (!Number.isFinite(expiresAt) || expiresAt <= nowMs)) {
    return { ok: false, reason: 'signal_expired' };
  }
  const prompt = typeof content.prompt === 'string' ? content.prompt.trim() : '';
  if (targets.includes('pai') && (!prompt || prompt.length > 4000)) {
    return { ok: false, reason: 'signal_prompt_invalid' };
  }
  return {
    ok: true,
    row: row,
    source: row.source,
    createdAt: new Date(createdAt).toISOString(),
    targets: targets,
    prompt: prompt,
    inputs: content.inputs && typeof content.inputs === 'object' ? content.inputs : {}
  };
}

function consumedSource(hamUid, signalSource) {
  return 'cycle.consumed.' + String(hamUid).toLowerCase() + '.' + digest(signalSource).slice(0, 32);
}

function resultSource(hamUid, signalSource) {
  return 'cycle.result.' + String(hamUid).toLowerCase() + '.' + digest(signalSource).slice(0, 32);
}

function effectSource(hamUid, effect, identity) {
  return 'cycle.effect.' + effect + '.' + String(hamUid).toLowerCase() + '.' + digest(identity).slice(0, 32);
}

function exactHam(hamUid) {
  return 'eq.' + String(hamUid);
}

function exactValue(value) {
  return 'eq.' + String(value);
}

async function readExact(brain, hamUid, source, type) {
  const rows = await brain.readBead({
    select: 'id,ham_uid,stamp_type,source,content,created_at',
    ham_uid: exactHam(hamUid),
    stamp_type: exactValue(type),
    source: exactValue(source),
    order: 'created_at.desc',
    limit: '2'
  });
  if (!Array.isArray(rows)) throw new Error('receipt_read_invalid');
  return rows.find(function (row) {
    return String(row.ham_uid || '').toUpperCase() === String(hamUid).toUpperCase() &&
      row.source === source && row.stamp_type === type;
  }) || null;
}

async function listSignals(brain, hamUid, nowMs, config) {
  const since = new Date(nowMs - config.signalMaxAgeMs).toISOString();
  const rows = await brain.readBead({
    select: 'id,ham_uid,stamp_type,source,content,created_at',
    ham_uid: exactHam(hamUid),
    stamp_type: exactValue(SIGNAL_TYPE),
    created_at: 'gte.' + since,
    order: 'created_at.desc',
    limit: String(config.signalLimit + 1)
  });
  if (!Array.isArray(rows)) throw new Error('signal_read_invalid');
  if (rows.length > config.signalLimit) return { ok: false, reason: 'signals_saturated' };
  return { ok: true, rows: rows.slice().reverse() };
}

async function chooseSignal(brain, hamUid, nowMs, config) {
  const listed = await listSignals(brain, hamUid, nowMs, config);
  if (!listed.ok) return listed;
  let rejected = 0;
  for (const row of listed.rows) {
    const signal = validateSignal(row, hamUid, nowMs, config);
    if (!signal.ok) {
      rejected++;
      continue;
    }
    const prior = await readExact(brain, hamUid, consumedSource(hamUid, signal.source), CONSUMED_TYPE);
    if (!prior) return { ok: true, signal: signal, rejected: rejected };
  }
  return { ok: false, reason: rejected ? 'signals_rejected' : 'no_signal', rejected: rejected };
}

async function windowBudgetAvailable(brain, hamUid, nowMs, config) {
  const rows = await brain.readBead({
    select: 'id,source,created_at',
    ham_uid: exactHam(hamUid),
    stamp_type: exactValue(CONSUMED_TYPE),
    created_at: 'gte.' + new Date(nowMs - config.windowMs).toISOString(),
    order: 'created_at.desc',
    limit: String(config.windowCeiling)
  });
  if (!Array.isArray(rows)) throw new Error('budget_read_invalid');
  return rows.length < config.windowCeiling;
}

async function writeAndProve(options) {
  const brain = options.brain;
  let writeError = null;
  try {
    await brain.writeBead({
      hamUid: options.hamUid,
      agentGlobal: 'CYCLE',
      source: options.source,
      type: options.type,
      content: options.content,
      summary: options.summary,
      importance: options.importance || 7,
      edges: options.edges,
      abcdTag: 'CYCLE_' + options.type
    });
  } catch (error) {
    writeError = error;
  }
  let row = null;
  try {
    row = await readExact(brain, options.hamUid, options.source, options.type);
  } catch (error) {
    return { ok: false, reason: 'receipt_readback_failed', error: error.message };
  }
  if (!row) {
    return { ok: false, reason: writeError ? 'receipt_write_failed' : 'receipt_missing_after_write' };
  }
  const content = parseContent(row.content);
  if (!content || content.proof !== options.content.proof) {
    return { ok: false, reason: 'receipt_proof_mismatch' };
  }
  return { ok: true, row: row, recovered: !!writeError };
}

function stageSummary(value) {
  if (!value || typeof value !== 'object') return { ok: !!value };
  return {
    ok: value.ok !== false,
    reason: value.reason || null,
    updated: value.updated === true,
    item_count: Array.isArray(value.items) ? value.items.length : undefined,
    ran: Array.isArray(value.ran) ? value.ran.slice(0, STATION_TARGETS.length) : undefined
  };
}

function productionDependencies(env) {
  let boundaryInstalled = false;
  function installBoundary() {
    if (boundaryInstalled) return;
    require('./provider.boundary.js').install();
    boundaryInstalled = true;
  }
  return {
    brain: require('./brain.client.js'),
    locks: require('./claim_lock.js'),
    installBoundary: installBoundary,
    runPAI: async function () {
      installBoundary();
      return require('./tool.loop.js').runPAI.apply(null, arguments);
    },
    runSpan: async function (wall, hamUid) {
      installBoundary();
      return require('../stations/span.station.js').run(wall, hamUid);
    },
    runProactive: async function (hamUid, options) {
      installBoundary();
      return require('../stations/proactive.sweep.js').sweep(hamUid, options);
    },
    runDrain: async function (hamUid, signal) {
      const raw = String(env.CANEW_DRAIN_URL || '').trim();
      if (!raw) return { ok: false, reason: 'drain_url_unconfigured' };
      let url;
      try { url = new URL(raw); } catch (error) { return { ok: false, reason: 'drain_url_invalid' }; }
      if (url.protocol !== 'https:') return { ok: false, reason: 'drain_url_not_https' };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'cycle.runner.signal', ham: hamUid, signal_source: signal.source }),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) return { ok: false, reason: 'drain_http_' + response.status };
      const body = await response.json().catch(function () { return null; });
      return body && typeof body === 'object' ? Object.assign({ ok: true }, body) : { ok: true };
    }
  };
}

function createController(options) {
  options = options || {};
  const env = options.env || process.env;
  const deps = Object.assign(productionDependencies(env), options.dependencies || {});
  const now = options.now || Date.now;
  const randomId = options.randomId || function () { return crypto.randomUUID(); };
  const log = options.log || function () {};
  const state = {
    polls: 0,
    runs: 0,
    zeroSpendPolls: 0,
    running: false,
    lastReason: 'not_started',
    lastRejectedSignals: 0,
    lastSignal: null,
    lastRunAt: null,
    lastResult: null
  };

  async function reserveEffect(hamUid, signal, effect, identity, claimant, config) {
    const source = effectSource(hamUid, effect, identity);
    const existing = await readExact(deps.brain, hamUid, source, EFFECT_TYPE);
    if (existing) return { ok: false, reason: 'effect_already_consumed', source: source };
    const claimKey = 'autonomous-effect:' + hamUid + ':' + effect + ':' + digest(identity);
    const won = await deps.locks.claimTask(claimKey, claimant, config.claimLeaseMs);
    if (!won) return { ok: false, reason: 'effect_claim_held', source: source };
    try {
      const again = await readExact(deps.brain, hamUid, source, EFFECT_TYPE);
      if (again) return { ok: false, reason: 'effect_already_consumed', source: source };
      const proof = digest(effect + ':' + identity + ':' + signal.source);
      return await writeAndProve({
        brain: deps.brain,
        hamUid: hamUid,
        source: source,
        type: EFFECT_TYPE,
        content: {
          proof: proof,
          effect: effect,
          effect_identity: identity,
          signal_source: signal.source,
          consumed_at: new Date(now()).toISOString()
        },
        summary: '[CYCLE] reserved ' + effect + ' for one proven input',
        edges: [
          { type: 'consumes', target: signal.source },
          { type: 'guards', target: WONDER }
        ]
      });
    } finally {
      await deps.locks.releaseTaskIfOwned(claimKey, claimant).catch(function () {});
    }
  }

  async function executeSignal(hamUid, signal, consumption, claimant, config) {
    const results = {};
    let paiOutput = null;
    if (signal.targets.includes('pai')) {
      try {
        paiOutput = await deps.runPAI(hamUid, signal.prompt, 'autonomous', {
          council_context: { mode: 'autonomous', signal_source: signal.source },
          autonomous: true,
          cycleKey: consumption.source,
          idempotencyKey: consumption.source
        }, [], null);
        results.pai = stageSummary(paiOutput);
      } catch (error) {
        results.pai = { ok: false, reason: 'pai_error:' + error.message };
      }
    }

    if (signal.targets.includes('span')) {
      const wall = paiOutput && paiOutput.ok && (paiOutput.wall || paiOutput._fcw);
      if (!wall) {
        results.span = { ok: false, reason: 'no_exact_wall' };
      } else {
        const wallIdentity = digest(JSON.stringify(wall));
        try {
          const reserved = await reserveEffect(hamUid, signal, 'span', wallIdentity, claimant, config);
          if (!reserved.ok) {
            results.span = { ok: false, reason: reserved.reason };
          } else {
            results.span = stageSummary(await deps.runSpan(wall, hamUid));
          }
        } catch (error) {
          results.span = { ok: false, reason: 'span_guard_error:' + error.message };
        }
      }
    }

    if (signal.targets.includes('drain')) {
      try { results.drain = stageSummary(await deps.runDrain(hamUid, signal)); }
      catch (error) { results.drain = { ok: false, reason: 'drain_error:' + error.message }; }
    }

    const stationTargets = signal.targets.filter(function (target) {
      return STATION_TARGETS.includes(target);
    });
    if (stationTargets.length) {
      try {
        results.proactive = stageSummary(await deps.runProactive(hamUid, {
          targets: stationTargets,
          signalSource: signal.source,
          consumedSource: consumption.source,
          inputs: signal.inputs
        }));
      } catch (error) {
        results.proactive = { ok: false, reason: 'proactive_error:' + error.message };
      }
    }
    return results;
  }

  async function poll() {
    state.polls++;
    const config = configFromEnv(env);
    const hamUid = String(options.hamUid || env.HAM_UID || '').trim();
    if (!config.enabled) {
      state.zeroSpendPolls++;
      state.lastReason = 'disabled';
      return { ok: true, ran: false, reason: 'disabled' };
    }
    if (!hamUid || (!(options.dependencies && options.dependencies.brain) &&
        (!env.MEMORY_BANK_URL || !env.MEMORY_BANK_KEY))) {
      state.zeroSpendPolls++;
      state.lastReason = 'unborn';
      return { ok: false, ran: false, reason: 'unborn' };
    }
    if (state.running) {
      state.zeroSpendPolls++;
      state.lastReason = 'already_running';
      return { ok: true, ran: false, reason: 'already_running' };
    }

    state.running = true;
    let singletonKey = null;
    let signalKey = null;
    let claimant = null;
    let consumptionProven = false;
    try {
      const selected = await chooseSignal(deps.brain, hamUid, now(), config);
      state.lastRejectedSignals = selected.rejected || 0;
      if (!selected.ok) {
        state.zeroSpendPolls++;
        state.lastReason = selected.reason;
        return { ok: selected.reason === 'no_signal', ran: false, reason: selected.reason };
      }

      const signal = selected.signal;
      claimant = 'cycle.runner.' + randomId();
      singletonKey = 'autonomous-cycle-singleton:' + hamUid;
      let won = await deps.locks.claimTask(singletonKey, claimant, config.claimLeaseMs);
      if (!won) {
        state.zeroSpendPolls++;
        state.lastReason = 'singleton_claim_held';
        return { ok: true, ran: false, reason: 'singleton_claim_held' };
      }

      const consumed = consumedSource(hamUid, signal.source);
      const prior = await readExact(deps.brain, hamUid, consumed, CONSUMED_TYPE);
      if (prior) {
        state.zeroSpendPolls++;
        state.lastReason = 'already_consumed';
        return { ok: true, ran: false, reason: 'already_consumed' };
      }
      const budgetOk = await windowBudgetAvailable(deps.brain, hamUid, now(), config);
      if (!budgetOk) {
        state.zeroSpendPolls++;
        state.lastReason = 'window_ceiling_reached';
        return { ok: true, ran: false, reason: 'window_ceiling_reached' };
      }

      signalKey = 'autonomous-cycle-signal:' + hamUid + ':' + digest(signal.source);
      won = await deps.locks.claimTask(signalKey, claimant, config.claimLeaseMs);
      if (!won) {
        state.zeroSpendPolls++;
        state.lastReason = 'signal_claim_held';
        return { ok: true, ran: false, reason: 'signal_claim_held' };
      }
      const duplicate = await readExact(deps.brain, hamUid, consumed, CONSUMED_TYPE);
      if (duplicate) {
        state.zeroSpendPolls++;
        state.lastReason = 'already_consumed';
        return { ok: true, ran: false, reason: 'already_consumed' };
      }

      const proof = digest(hamUid + ':' + signal.source + ':' + signal.createdAt);
      const consumption = await writeAndProve({
        brain: deps.brain,
        hamUid: hamUid,
        source: consumed,
        type: CONSUMED_TYPE,
        content: {
          proof: proof,
          signal_source: signal.source,
          signal_created_at: signal.createdAt,
          targets: signal.targets,
          consumed_at: new Date(now()).toISOString()
        },
        summary: '[CYCLE] consumed one governed autonomous signal',
        edges: [
          { type: 'consumes', target: signal.source },
          { type: 'serves', target: WONDER }
        ]
      });
      if (!consumption.ok) {
        state.zeroSpendPolls++;
        state.lastReason = consumption.reason;
        return { ok: false, ran: false, reason: consumption.reason };
      }
      consumptionProven = true;

      const startedAt = now();
      const results = await executeSignal(hamUid, signal,
        { source: consumed, row: consumption.row }, claimant, config);
      state.runs++;
      state.lastSignal = signal.source;
      state.lastRunAt = new Date(startedAt).toISOString();
      state.lastReason = 'signal_consumed';
      state.lastResult = results;

      const resultProof = digest(consumed + ':' + JSON.stringify(results));
      const resultReceipt = await writeAndProve({
        brain: deps.brain,
        hamUid: hamUid,
        source: resultSource(hamUid, signal.source),
        type: RESULT_TYPE,
        content: {
          proof: resultProof,
          signal_source: signal.source,
          consumed_source: consumed,
          completed_at: new Date(now()).toISOString(),
          duration_ms: Math.max(0, now() - startedAt),
          stages: results
        },
        summary: '[CYCLE] completed one governed autonomous signal',
        edges: [
          { type: 'reports', target: consumed },
          { type: 'serves', target: WONDER }
        ]
      }).catch(function (error) {
        return { ok: false, reason: 'result_receipt_exception', error: error.message };
      });
      if (!resultReceipt.ok) {
        state.lastReason = 'result_receipt_failed';
        state.lastResult = Object.assign({}, results, {
          receipt: { ok: false, reason: resultReceipt.reason }
        });
        log('[cycle.runner] result receipt failed: ' + resultReceipt.reason);
        return { ok: false, ran: true, reason: 'result_receipt_failed',
          signal: signal.source, results: state.lastResult };
      }
      return { ok: true, ran: true, reason: 'signal_consumed', signal: signal.source, results: results };
    } catch (error) {
      if (!consumptionProven) state.zeroSpendPolls++;
      state.lastReason = consumptionProven ? 'execution_failed_after_consumption' : 'poll_failed';
      log('[cycle.runner] ' + state.lastReason + ': ' + error.message);
      return { ok: false, ran: consumptionProven, reason: state.lastReason, error: error.message };
    } finally {
      if (signalKey && claimant) {
        await deps.locks.releaseTaskIfOwned(signalKey, claimant).catch(function () {});
      }
      if (singletonKey && claimant) {
        await deps.locks.releaseTaskIfOwned(singletonKey, claimant).catch(function () {});
      }
      state.running = false;
    }
  }

  function health() {
    const config = configFromEnv(env);
    return {
      ok: true,
      service: 'cycle.runner',
      mode: 'signal_driven',
      enabled: config.enabled,
      born: !!String(options.hamUid || env.HAM_UID || '').trim() &&
        !!((options.dependencies && options.dependencies.brain) || (env.MEMORY_BANK_URL && env.MEMORY_BANK_KEY)),
      poll_interval_ms: config.enabled ? config.pollMs : null,
      window_ceiling: config.windowCeiling,
      window_ms: config.windowMs,
      polls: state.polls,
      zero_spend_polls: state.zeroSpendPolls,
      runs: state.runs,
      running: state.running,
      last_reason: state.lastReason,
      last_rejected_signals: state.lastRejectedSignals,
      last_signal: state.lastSignal,
      last_run_at: state.lastRunAt,
      last_result: state.lastResult
    };
  }

  return { poll: poll, health: health, state: state };
}

module.exports = {
  createController: createController,
  configFromEnv: configFromEnv,
  validateSignal: validateSignal,
  consumedSource: consumedSource,
  resultSource: resultSource,
  effectSource: effectSource,
  constants: { SIGNAL_TYPE, CONSUMED_TYPE, RESULT_TYPE, EFFECT_TYPE, WONDER, STATION_TARGETS }
};
