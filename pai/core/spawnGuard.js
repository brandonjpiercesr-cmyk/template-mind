// ⬡B:core.spawnGuard:MODULE:built:20260702⬡
// entered via the ABAHAM door, serving channel MESSAGES
const SPAWN_GUARD_ENFORCE = process.env.SPAWN_GUARD_ENFORCE === 'true';
const validateTask = (task) => {
  if (!SPAWN_GUARD_ENFORCE) return true;
  if (!task.lineage || !task.lineage.spawner || !task.lineage.parent) {
    throw new Error('Missing lineage: spawner and parent are required');
  }
  if (!task.budget || !task.budget.maxIterations || !task.budget.maxLlmCalls) {
    throw new Error('Missing budget: maxIterations and maxLlmCalls are required');
  }
  return true;
};

module.exports = {
  validateTask,
  SPAWN_GUARD_ENFORCE,
};