// ⬡B:core.spawn.guard:MODULE:budget_lineage_refusal_at_spawn:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (every spawned task answers to a lineage)
// L7, INFINITE PROCESSES. The law, enforced at the moment of spawn, not
// cleaned up after: a process enters the world only with (1) a lineage stamp
// naming its spawner and parent task, (2) an iteration ceiling, (3) a budget
// cap on model calls. A spec missing these is REFUSED, loudly, with reasons;
// nothing is auto-filled on its behalf, because auto-filling is how infinite
// processes are born wearing a guard's signature. Ramp: enforcement arms via
// SPAWN_GUARD_ENFORCE=true so existing callers surface as refusal reasons
// before the wall goes hard. UNIVERSALITY: no identity here, pure shape law.
'use strict';

var MAX_ITER_CEILING = parseInt(process.env.SPAWN_MAX_ITERATIONS || '25', 10);
var MAX_LLM_CEILING = parseInt(process.env.SPAWN_MAX_LLM_CALLS || '50', 10);

// spec: { lineage: { spawner, parent }, budget: { maxIterations, maxLlmCalls } }
// Returns { ok } or { ok:false, refused:true, reasons:[...] }. Never mutates.
function checkSpawn(spec) {
  var reasons = [];
  var s = spec || {};
  var lin = s.lineage || {};
  if (!lin.spawner || typeof lin.spawner !== 'string') reasons.push('lineage.spawner missing: who spawned this');
  if (!lin.parent || typeof lin.parent !== 'string') reasons.push('lineage.parent missing: the task or cycle this descends from');
  var b = s.budget || {};
  if (!(b.maxIterations > 0)) reasons.push('budget.maxIterations missing or non-positive');
  else if (b.maxIterations > MAX_ITER_CEILING) reasons.push('budget.maxIterations ' + b.maxIterations + ' exceeds ceiling ' + MAX_ITER_CEILING);
  if (!(b.maxLlmCalls > 0)) reasons.push('budget.maxLlmCalls missing or non-positive');
  else if (b.maxLlmCalls > MAX_LLM_CEILING) reasons.push('budget.maxLlmCalls ' + b.maxLlmCalls + ' exceeds ceiling ' + MAX_LLM_CEILING);
  if (reasons.length) return { ok: false, refused: true, reasons: reasons };
  return { ok: true };
}

function enforcing() { return process.env.SPAWN_GUARD_ENFORCE === 'true'; }

module.exports = { checkSpawn: checkSpawn, enforcing: enforcing };
