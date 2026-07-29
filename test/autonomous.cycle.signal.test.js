// ⬡B:test.autonomous_cycle_signal:TEST:zero_spend_until_durable_signal_consumed:20260725⬡
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const cycle = require('../pai/core/autonomous.cycle.js');

class FakeBrain {
  constructor(now) {
    this.rows = [];
    this.now = now;
    this.reads = 0;
    this.writes = 0;
    this.events = [];
    this.failConsumedWrite = false;
  }

  add(row) {
    this.rows.push(Object.assign({}, row));
  }

  async readBead(filter) {
    this.reads++;
    this.events.push('read:' + (filter.stamp_type || '*'));
    let rows = this.rows.slice();
    Object.keys(filter || {}).forEach(function (key) {
      if (['select', 'order', 'limit'].includes(key)) return;
      const wanted = String(filter[key]);
      if (wanted.startsWith('eq.')) {
        rows = rows.filter(function (row) { return String(row[key]) === wanted.slice(3); });
      } else if (wanted.startsWith('gte.')) {
        rows = rows.filter(function (row) {
          return Date.parse(row[key]) >= Date.parse(wanted.slice(4));
        });
      }
    });
    if (String(filter.order || '').startsWith('created_at.desc')) {
      rows.sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
    } else if (String(filter.order || '').startsWith('created_at.asc')) {
      rows.sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
    }
    return rows.slice(0, Number.parseInt(filter.limit || String(rows.length), 10));
  }

  async writeBead(bead) {
    this.writes++;
    this.events.push('write:' + bead.type);
    if (bead.type === cycle.constants.CONSUMED_TYPE && this.failConsumedWrite) {
      throw new Error('bank_write_refused');
    }
    this.rows.push({
      id: this.rows.length + 1,
      ham_uid: bead.hamUid,
      agent_global: bead.agentGlobal,
      stamp_type: bead.type,
      source: bead.source,
      content: Object.assign({}, bead.content, { edges: bead.edges }),
      summary: bead.summary,
      created_at: new Date(this.now()).toISOString()
    });
    return { ok: true, source: bead.source };
  }
}

class FakeLocks {
  constructor() { this.claims = new Map(); this.calls = 0; }
  async claimTask(key, claimant) {
    this.calls++;
    if (this.claims.has(key)) return false;
    this.claims.set(key, claimant);
    return true;
  }
  async releaseTaskIfOwned(key, claimant) {
    if (this.claims.get(key) !== claimant) return false;
    this.claims.delete(key);
    return true;
  }
}

function env(extra) {
  return Object.assign({
    AUTONOMOUS_CYCLE_ENABLED: 'true',
    HAM_UID: 'WORLD-TEST',
    AUTONOMOUS_TICK_CEILING: '1',
    AUTONOMOUS_TICK_WINDOW_MS: '3600000'
  }, extra || {});
}

function signal(source, at, targets, extra) {
  return {
    id: source,
    ham_uid: 'WORLD-TEST',
    stamp_type: cycle.constants.SIGNAL_TYPE,
    source: source,
    created_at: new Date(at).toISOString(),
    content: Object.assign({
      status: 'ready',
      wonder: cycle.constants.WONDER,
      targets: targets,
      prompt: targets.includes('pai') ? 'Inspect the governed signal and act only on its evidence.' : undefined,
      edges: [{ type: 'triggers', target: cycle.constants.WONDER }]
    }, extra || {})
  };
}

function harness(options) {
  options = options || {};
  const time = options.time || { value: Date.parse('2026-07-25T14:00:00.000Z') };
  const now = function () { return time.value; };
  const brain = options.brain || new FakeBrain(now);
  const locks = options.locks || new FakeLocks();
  const calls = options.calls || { pai: 0, span: 0, drain: 0, proactive: 0 };
  const dependencies = Object.assign({
    brain: brain,
    locks: locks,
    runPAI: async function () { calls.pai++; brain.events.push('effect:pai'); return { ok: true, wall: { exact: 'wall' } }; },
    runSpan: async function () { calls.span++; brain.events.push('effect:span'); return { updated: false }; },
    runDrain: async function () { calls.drain++; brain.events.push('effect:drain'); return { ok: true }; },
    runProactive: async function (hamUid, input) {
      calls.proactive++;
      brain.events.push('effect:proactive:' + input.targets.join(','));
      return { ok: true, ran: input.targets };
    }
  }, options.dependencies || {});
  const controller = cycle.createController({
    env: options.env || env(),
    now: now,
    randomId: function () { return 'worker-' + (calls.pai + calls.drain + calls.proactive + 1); },
    dependencies: dependencies
  });
  return { controller, brain, locks, calls, time };
}

test('default-off controller performs no brain, claim, or effect call', async function () {
  const h = harness({ env: env({ AUTONOMOUS_CYCLE_ENABLED: '' }) });
  const result = await h.controller.poll();
  assert.equal(result.reason, 'disabled');
  assert.equal(h.brain.reads, 0);
  assert.equal(h.locks.calls, 0);
  assert.deepEqual(h.calls, { pai: 0, span: 0, drain: 0, proactive: 0 });
  assert.equal(h.controller.health().poll_interval_ms, null);
});

test('enabled controller with no signal performs reads but zero effects', async function () {
  const h = harness();
  const result = await h.controller.poll();
  assert.equal(result.reason, 'no_signal');
  assert.ok(h.brain.reads > 0);
  assert.equal(h.locks.calls, 0);
  assert.deepEqual(h.calls, { pai: 0, span: 0, drain: 0, proactive: 0 });
});

test('signal is claimed, consumed, and read back before PAI and cannot rerun', async function () {
  const h = harness();
  h.brain.add(signal('coda.signal.one', h.time.value - 1000, ['pai']));
  const first = await h.controller.poll();
  const second = await h.controller.poll();
  assert.equal(first.ran, true);
  assert.equal(second.ran, false);
  assert.equal(h.calls.pai, 1);
  const consumedWrite = h.brain.events.indexOf('write:' + cycle.constants.CONSUMED_TYPE);
  const effect = h.brain.events.indexOf('effect:pai');
  assert.ok(consumedWrite >= 0 && consumedWrite < effect,
    'durable consumption must precede the first paid effect');
  const consumed = h.brain.rows.filter(function (row) {
    return row.stamp_type === cycle.constants.CONSUMED_TYPE;
  });
  assert.equal(consumed.length, 1);
  assert.ok(Array.isArray(consumed[0].content.edges) && consumed[0].content.edges.length > 0);
});

test('failed consumption write and readback blocks every effect', async function () {
  const h = harness();
  h.brain.add(signal('coda.signal.no-proof', h.time.value - 1000, ['pai']));
  h.brain.failConsumedWrite = true;
  const result = await h.controller.poll();
  assert.equal(result.ran, false);
  assert.equal(result.reason, 'receipt_write_failed');
  assert.deepEqual(h.calls, { pai: 0, span: 0, drain: 0, proactive: 0 });
});

test('durable window receipt enforces the ceiling across fresh controllers', async function () {
  const h = harness();
  h.brain.add(signal('coda.signal.first', h.time.value - 2000, ['pai']));
  h.brain.add(signal('coda.signal.second', h.time.value - 1000, ['pai']));
  const first = await h.controller.poll();
  const fresh = harness({ brain: h.brain, locks: h.locks, calls: h.calls, time: h.time });
  const second = await fresh.controller.poll();
  assert.equal(first.ran, true);
  assert.equal(second.reason, 'window_ceiling_reached');
  assert.equal(h.calls.pai, 1);
});

test('drain and proactive stations run only when the signal names them', async function () {
  const h = harness({ env: env({ AUTONOMOUS_TICK_CEILING: '2' }) });
  h.brain.add(signal('coda.signal.drain', h.time.value - 2000, ['drain']));
  let result = await h.controller.poll();
  assert.equal(result.ran, true);
  assert.deepEqual(h.calls, { pai: 0, span: 0, drain: 1, proactive: 0 });
  h.brain.add(signal('coda.signal.hunch', h.time.value - 1000, ['hunch']));
  result = await h.controller.poll();
  assert.equal(result.ran, true);
  assert.deepEqual(h.calls, { pai: 0, span: 0, drain: 1, proactive: 1 });
  assert.ok(h.brain.events.includes('effect:proactive:hunch'));
});

test('SPAN consumes a wall digest once even across signals and controllers', async function () {
  const h = harness({ env: env({ AUTONOMOUS_TICK_CEILING: '2' }) });
  h.brain.add(signal('coda.signal.span-one', h.time.value - 2000, ['pai', 'span']));
  h.brain.add(signal('coda.signal.span-two', h.time.value - 1000, ['pai', 'span']));
  await h.controller.poll();
  const fresh = harness({
    brain: h.brain,
    locks: h.locks,
    calls: h.calls,
    time: h.time,
    env: env({ AUTONOMOUS_TICK_CEILING: '2' })
  });
  await fresh.controller.poll();
  assert.equal(h.calls.pai, 2);
  assert.equal(h.calls.span, 1);
  assert.equal(h.brain.rows.filter(function (row) {
    return row.stamp_type === cycle.constants.EFFECT_TYPE;
  }).length, 1);
});

test('malformed or saturated signal windows fail closed', async function () {
  const malformed = harness();
  const bad = signal('coda.signal.orphan', malformed.time.value - 1000, ['pai']);
  bad.content.edges = [];
  malformed.brain.add(bad);
  let result = await malformed.controller.poll();
  assert.equal(result.reason, 'signals_rejected');
  assert.equal(malformed.controller.health().last_rejected_signals, 1);
  assert.equal(malformed.calls.pai, 0);

  const saturated = harness({ env: env({ AUTONOMOUS_SIGNAL_LIMIT: '1' }) });
  saturated.brain.add(signal('coda.signal.a', saturated.time.value - 2000, ['pai']));
  saturated.brain.add(signal('coda.signal.b', saturated.time.value - 1000, ['pai']));
  result = await saturated.controller.poll();
  assert.equal(result.reason, 'signals_saturated');
  assert.deepEqual(saturated.calls, { pai: 0, span: 0, drain: 0, proactive: 0 });
});

test('unsafe configuration values are clamped to bounded defaults', function () {
  const config = cycle.configFromEnv({
    AUTONOMOUS_CYCLE_ENABLED: 'TRUE',
    AUTONOMOUS_SIGNAL_POLL_MS: '1',
    AUTONOMOUS_SIGNAL_LIMIT: '9999',
    AUTONOMOUS_TICK_CEILING: '0',
    AUTONOMOUS_TICK_WINDOW_MS: '999999999'
  });
  assert.equal(config.enabled, true);
  assert.equal(config.pollMs, 30000);
  assert.equal(config.signalLimit, 50);
  assert.equal(config.windowCeiling, 1);
  assert.equal(config.windowMs, 86400000);
});
