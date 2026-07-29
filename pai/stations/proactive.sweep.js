// ⬡B:pai.stations.proactive_sweep:WONDER:consumed_signal_dispatch_only:20260725⬡
'use strict';

// This dispatcher does not decide that a station is due. The prior hour-modulo gates made
// cold clock code purchase HUNCH, PRESS, and SAGE judgments, and every generic cycle tick
// fanned out across the whole department. A governed cycle signal now names each station.
// Calls without both the signal lineage and its proven consumption receipt fail closed.

const ALLOWED = Object.freeze([
  'burst', 'ghost_monitor', 'ghost_handoff', 'dawn', 'hunch', 'press', 'sage'
]);

function parseContent(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch (error) { return null; }
}

async function verifyConsumption(hamUid, signalSource, consumedSource, requestedTargets, suppliedBrain) {
  const brain = suppliedBrain || require('../core/brain.client.js');
  const rows = await brain.readBead({
    select: 'ham_uid,stamp_type,source,content',
    ham_uid: 'eq.' + String(hamUid),
    stamp_type: 'eq.AUTONOMOUS_CYCLE_CONSUMED',
    source: 'eq.' + String(consumedSource),
    limit: '2'
  });
  if (!Array.isArray(rows)) return false;
  return rows.some(function (row) {
    const content = parseContent(row.content);
    return String(row.ham_uid || '').toUpperCase() === String(hamUid).toUpperCase() &&
      row.stamp_type === 'AUTONOMOUS_CYCLE_CONSUMED' && row.source === consumedSource &&
      content && content.signal_source === signalSource && Array.isArray(content.targets) &&
      requestedTargets.every(function (target) { return content.targets.includes(target); });
  });
}

function load(path) {
  try { return require(path); } catch (error) { return null; }
}

function normalizeTargets(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > ALLOWED.length) return null;
  const targets = [];
  for (const raw of value) {
    const target = String(raw || '').trim().toLowerCase();
    if (!ALLOWED.includes(target)) return null;
    if (!targets.includes(target)) targets.push(target);
  }
  return targets.length ? targets : null;
}

function createSweep(dependencies) {
  dependencies = dependencies || {};
  const moduleLoader = dependencies.load || load;
  const nowStation = dependencies.nowStation || require('./now.station.js');
  const consumptionVerifier = dependencies.verifyConsumption || function (hamUid, signalSource, consumedSource, targets) {
    return verifyConsumption(hamUid, signalSource, consumedSource, targets, dependencies.brain);
  };

  return async function sweep(hamUid, options) {
    options = options || {};
    if (!hamUid) return { ok: false, ran: [], reason: 'ham_missing' };
    if (!options.signalSource || !options.consumedSource) {
      return { ok: false, ran: [], reason: 'consumption_proof_missing' };
    }
    const targets = normalizeTargets(options.targets);
    if (!targets) return { ok: false, ran: [], reason: 'targets_invalid' };
    let proven = false;
    try { proven = await consumptionVerifier(hamUid, options.signalSource, options.consumedSource, targets); }
    catch (error) { proven = false; }
    if (!proven) return { ok: false, ran: [], reason: 'consumption_unproven' };

    const attempted = [];
    const ran = [];
    const errors = {};
    let momentPromise = null;
    function moment() {
      if (!momentPromise) momentPromise = nowStation.assembleNow(hamUid);
      return momentPromise;
    }
    async function invoke(target, path, method, args, describe) {
      attempted.push(target);
      try {
        const station = moduleLoader(path);
        if (!station || typeof station[method] !== 'function') {
          errors[target] = 'station_unavailable';
          return;
        }
        const output = await station[method].apply(station, args);
        ran.push(describe ? describe(output) : target);
      } catch (error) {
        errors[target] = error.message || 'station_failed';
      }
    }

    for (const target of targets) {
      if (target === 'burst') {
        await invoke(target, './burst.station.js', 'sweep', [hamUid, { moment: await moment() }],
          function (value) { return 'BURST:' + ((value && value.alerts && value.alerts.length) || 0); });
      } else if (target === 'ghost_monitor') {
        await invoke(target, './ghost.station.js', 'monitorOvernight', [hamUid, { moment: await moment() }],
          function (value) { return value && value.graveyard ? 'GHOST:watch' : 'GHOST:quiet'; });
      } else if (target === 'ghost_handoff') {
        await invoke(target, './ghost.station.js', 'wakeHandoff', [hamUid, { moment: await moment() }],
          function (value) { return value && value.handed_off ? 'GHOST:handoff' : 'GHOST:no_handoff'; });
      } else if (target === 'dawn') {
        await invoke(target, './dawn.station.js', 'buildBriefing', [hamUid],
          function (value) { return value && value.briefing ? 'DAWN:briefing' : 'DAWN:quiet'; });
      } else if (target === 'hunch') {
        await invoke(target, './hunch.station.js', 'sweep', [hamUid, { moment: await moment() }],
          function (value) { return 'HUNCH:' + ((value && value.tips && value.tips.length) || 0); });
      } else if (target === 'press') {
        const pressInputs = options.inputs && options.inputs.press;
        const interests = pressInputs && Array.isArray(pressInputs.interests) ? pressInputs.interests : undefined;
        await invoke(target, './press.station.js', 'surfaceNews', [hamUid, interests, { moment: await moment() }],
          function (value) { return 'PRESS:' + ((value && value.items && value.items.length) || 0); });
      } else if (target === 'sage') {
        await invoke(target, './sage.station.js', 'assess', [hamUid, { moment: await moment() }],
          function (value) { return 'SAGE:' + ((value && value.observations && value.observations.length) || 0); });
      }
    }

    return {
      ok: Object.keys(errors).length === 0,
      ran: ran,
      attempted: attempted,
      errors: errors,
      signal_source: options.signalSource,
      consumed_source: options.consumedSource
    };
  };
}

const sweep = createSweep();

module.exports = { sweep: sweep, createSweep: createSweep, normalizeTargets: normalizeTargets,
  verifyConsumption:verifyConsumption, ALLOWED: ALLOWED };
