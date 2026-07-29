// ⬡B:test.proactive_sweep_signal:TEST:no_cold_clock_dispatch:20260725⬡
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const proactive = require('../pai/stations/proactive.sweep.js');

test('dispatcher rejects calls without a consumed signal proof before loading a station', async function () {
  let loads = 0;
  const sweep = proactive.createSweep({
    nowStation: { assembleNow: async function () { throw new Error('must_not_read_now'); } },
    verifyConsumption: async function () { throw new Error('must_not_verify'); },
    load: function () { loads++; return null; }
  });
  const result = await sweep('WORLD-TEST', { targets: ['hunch'] });
  assert.equal(result.reason, 'consumption_proof_missing');
  assert.equal(loads, 0);
});

test('dispatcher invokes only the station named by the consumed signal', async function () {
  const invoked = [];
  const sweep = proactive.createSweep({
    nowStation: { assembleNow: async function () { return { now_iso: '2026-07-25T14:00:00.000Z' }; } },
    verifyConsumption: async function () { return true; },
    load: function (path) {
      if (path === './press.station.js') {
        return { surfaceNews: async function (ham, interests) {
          invoked.push({ path: path, ham: ham, interests: interests });
          return { items: [] };
        } };
      }
      throw new Error('unexpected_station:' + path);
    }
  });
  const result = await sweep('WORLD-TEST', {
    targets: ['press'],
    signalSource: 'coda.signal.press',
    consumedSource: 'cycle.consumed.press',
    inputs: { press: { interests: ['verified topic'] } }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.attempted, ['press']);
  assert.deepEqual(invoked, [{ path: './press.station.js', ham: 'WORLD-TEST', interests: ['verified topic'] }]);
});

test('dispatcher rejects unknown or empty target sets', async function () {
  const sweep = proactive.createSweep({
    nowStation: { assembleNow: async function () { return {}; } },
    verifyConsumption: async function () { return true; },
    load: function () { throw new Error('must_not_load'); }
  });
  for (const targets of [[], ['unknown'], ['press', 'unknown']]) {
    const result = await sweep('WORLD-TEST', {
      targets: targets,
      signalSource: 'signal',
      consumedSource: 'consumed'
    });
    assert.equal(result.reason, 'targets_invalid');
  }
});

test('dispatcher refuses a forged consumption address before reading NOW or loading a station', async function () {
  let loads = 0;
  const sweep = proactive.createSweep({
    nowStation: { assembleNow: async function () { throw new Error('must_not_read_now'); } },
    verifyConsumption: async function () { return false; },
    load: function () { loads++; return null; }
  });
  const result = await sweep('WORLD-TEST', {
    targets: ['hunch'], signalSource: 'forged.signal', consumedSource: 'forged.receipt'
  });
  assert.equal(result.reason, 'consumption_unproven');
  assert.equal(loads, 0);
});

test('a real receipt cannot authorize a station outside its recorded target lane', async function () {
  let loads = 0;
  const sweep = proactive.createSweep({
    brain: { readBead: async function () { return [{
      ham_uid: 'WORLD-TEST',
      stamp_type: 'AUTONOMOUS_CYCLE_CONSUMED',
      source: 'cycle.consumed.pai',
      content: { signal_source: 'coda.signal.pai', targets: ['pai'] }
    }]; } },
    nowStation: { assembleNow: async function () { throw new Error('must_not_read_now'); } },
    load: function () { loads++; return null; }
  });
  const result = await sweep('WORLD-TEST', {
    targets: ['hunch'], signalSource: 'coda.signal.pai', consumedSource: 'cycle.consumed.pai'
  });
  assert.equal(result.reason, 'consumption_unproven');
  assert.equal(loads, 0);
});
