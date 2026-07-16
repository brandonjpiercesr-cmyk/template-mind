// ⬡B:core.roadmap.activation:MODULE:coda_span_owned_task_activation:20260715⬡
// entered via the ABAHAM door, serving channel MESSAGES
// CODA decides the bounded work; SPAN activates it against an existing exact
// ROADMAP source. This module does not infer a roadmap, invent an owner, or
// execute code. It creates one idempotent TASK in the canonical task queue.
'use strict';

const crypto = require('crypto');

function cleanList(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    return String(item || '').trim().replace(/^\/+/, '');
  }).filter(Boolean);
}

function validatePath(path) {
  return path && path.indexOf('..') < 0 && !path.startsWith('.git/') && !path.startsWith('.github/workflows/');
}

function taskSource(roadmapSource, task, allowedPaths, repository) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify([roadmapSource, task, allowedPaths, repository])).digest('hex').slice(0, 20);
  return 'span.task.roadmap.' + digest;
}

async function activate(spec, deps) {
  deps = deps || {};
  spec = spec || {};
  const brain = deps.brain || require('./brain.client.js');
  const queue = deps.queue || require('./task.queue.js');
  const hamUid = String(spec.ham_uid || spec.hamUid || '').trim();
  const roadmapSource = String(spec.roadmap_source || spec.roadmapSource || '').trim();
  const task = String(spec.task || '').trim();
  const repository = String(spec.repository || '').trim();
  const acceptance = cleanList(spec.acceptance);
  const allowedPaths = cleanList(spec.allowed_paths || spec.allowedPaths);
  if (!hamUid) return { ok: false, reason: 'ham_uid_required' };
  if (!roadmapSource) return { ok: false, reason: 'roadmap_source_required' };
  if (!task) return { ok: false, reason: 'bounded_task_required' };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return { ok: false, reason: 'repository_owner_name_required' };
  }
  if (!acceptance.length) return { ok: false, reason: 'acceptance_required' };
  if (!allowedPaths.length) return { ok: false, reason: 'allowed_paths_required' };
  if (allowedPaths.some(function (path) { return !validatePath(path); })) {
    return { ok: false, reason: 'invalid_allowed_path' };
  }

  const roadmap = await brain.findBySource(roadmapSource);
  if (!roadmap || String(roadmap.stamp_type || '').toUpperCase() !== 'ROADMAP') {
    return { ok: false, reason: 'exact_roadmap_not_found', roadmap_source: roadmapSource };
  }

  const source = taskSource(roadmapSource, task, allowedPaths, repository);
  const content = {
    task: task,
    repository: repository,
    roadmap_source: roadmapSource,
    allowed_paths: allowedPaths,
    acceptance: acceptance,
    lineage: { spawner: 'CODA', parent: roadmapSource },
    budget: {
      maxIterations: Number(spec.max_iterations || 3),
      maxLlmCalls: Number(spec.max_llm_calls || 3)
    },
    review_owner: 'CATHY',
    build_owner: 'CANEW',
    sequence_owner: 'SPAN'
  };
  const queued = await queue.enqueueTask({
    ham_uid: hamUid,
    agent_global: 'SPAN',
    source: source,
    acl_stamp: '⬡B:span.task:ACTIVATION:' + source.split('.').pop() + ':20260715⬡',
    summary: '[SPAN][ROADMAP] ' + task.slice(0, 180),
    content: content,
    importance: Number(spec.importance || 8)
  });
  if (!queued || queued.ok !== true) return Object.assign({ ok: false, source: source }, queued || {});
  return {
    ok: true,
    task_id: queued.id,
    task_source: source,
    duplicate: !!queued.duplicate,
    state: queued.state || 'TASK',
    roadmap_source: roadmapSource,
    owners: { decision: 'CODA', sequence: 'SPAN', build: 'CANEW', review: 'CATHY' }
  };
}

module.exports = { activate: activate, taskSource: taskSource };
