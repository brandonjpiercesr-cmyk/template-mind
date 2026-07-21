// ⬡B:core.deploy_sentinel:BUILD:freshness_heartbeat_submits_back_to_coda:20260720⬡
// entered via the ABAHAM door: identity is never a literal here, the observing HAM
// resolves upstream (CODA_SENSOR_HAM_UID / FOUNDER_HAM_UID env, the same server-bound
// authority the coda mind routes use), and every bead this file stamps carries that
// resolved ham_uid. CHANNEL PATH TO A HAM: MESSAGES, via the Command Center desk, the
// stuck finding surfaces as a desk note the founder's feed serves, while the evidence
// itself flows to CODA's sensor-event gate.
//
// THE DEPLOY SENTINEL. Born from a real incident, found live 20260720: the aibebase
// service sat on commit de847ad while main advanced ~15 merges, because Render's
// Auto Deploy was off and nothing in the system noticed. Merged work, including whole
// wonder agents, never went live, and the founder concluded everything built was
// useless. The existing render sensor was webhook-reactive only: a deploy that FAILS
// sends a webhook, but a deploy that silently NEVER FIRES sends nothing. This sentinel
// is the missing proactive heartbeat.
//
// THE DOCTRINE THIS OBEYS (founder correction, 20260720): the mind that senses is not
// the mind that fixes, and neither is the mind that reaches. This sentinel is a COLD
// SENSOR ORGAN in CODA's department. It gathers facts and SUBMITS BACK TO CODA through
// her own sensor-event gate (gate.coda.sensor_event). It does not fix, it does not
// deploy, it does not touch the founder. CODA, in HER next cycle, deliberates and
// dispatches the right C2 wonder: the deploy-hook hand to re-trigger, or MACE when the
// cause is a code bug. If the gap persists and her hands cannot act, CODA's cycle
// routes a reach recommendation backward to the Overseer; a REACH wonder touches the
// founder, never this file. Peers never submit to peers; everything flows through the
// lead's own cycle.
//
// FIVE W's: who: the coding department (CODA's eyes), any HAM's world by env, no
// hardcoded identity. what: compares the running commit to main's HEAD and the
// provider's deploy state, and stamps stuck-ness as evidence. when: on a slow interval
// while the service runs, and on demand. where: CODA's sensor-event gate, plus a sync
// note to the CLAIR Command Center desk so every builder sees the same wall. why: a
// live server must not silently fall behind its own merged work. how: cold reads only
// (env, GitHub HEAD, Render deploy list), then a durable, deduplicated evidence bead.
'use strict';

var sensorStore = require('./coda/sensor.store.js');

function env(name) { return String(process.env[name] || '').trim(); }
function ownCommit() { return env('RENDER_GIT_COMMIT'); }
function serviceId() { return env('RENDER_SERVICE_ID'); }
function repoFullName() { return env('DEPLOY_SENTINEL_REPO') || 'brandonjpiercesr-cmyk/anew'; }
function hamUid() { return (env('CODA_SENSOR_HAM_UID') || env('FOUNDER_HAM_UID') || env('DEFAULT_HAM_UID')).toUpperCase(); }

// Cold read: what commit is main's HEAD right now.
async function readMainHead() {
  var token = env('GH_TOKEN') || env('GITHUB_TOKEN');
  if (!token) return { ok: false, reason: 'no_github_token' };
  try {
    var r = await fetch('https://api.github.com/repos/' + repoFullName() + '/commits/main', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(9000)
    });
    if (!r.ok) return { ok: false, reason: 'github_head_read_' + r.status };
    var d = await r.json();
    return { ok: true, sha: String(d.sha || ''), at: d.commit && d.commit.committer && d.commit.committer.date || null };
  } catch (e) { return { ok: false, reason: 'github_head_unreachable' }; }
}

// Cold read: is a deploy already in flight, and what landed last.
async function readProviderDeploy() {
  var key = env('RENDER_API_KEY'), svc = serviceId();
  if (!key || !svc) return { ok: false, reason: 'no_render_env' };
  try {
    var r = await fetch('https://api.render.com/v1/services/' + svc + '/deploys?limit=1', {
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
    if (!r.ok) return { ok: false, reason: 'render_read_' + r.status };
    var rows = await r.json();
    var dep = rows && rows[0] && (rows[0].deploy || rows[0]) || null;
    if (!dep) return { ok: true, status: 'no_deploys', commit: null, deployId: null };
    return { ok: true, status: dep.status || null, deployId: dep.id || null,
      commit: dep.commit && dep.commit.id || null };
  } catch (e) { return { ok: false, reason: 'render_unreachable' }; }
}

var IN_FLIGHT = { created: 1, queued: 1, build_in_progress: 1, update_in_progress: 1, pre_deploy_in_progress: 1 };

// The heartbeat. Cold facts only; the judgment of what to DO belongs to CODA's cycle.
async function senseOnce() {
  var live = ownCommit();
  var head = await readMainHead();
  var provider = await readProviderDeploy();
  var facts = {
    service_id: serviceId() || null,
    live_commit: live || null,
    main_head: head.ok ? head.sha : null,
    main_head_reason: head.ok ? null : head.reason,
    provider_status: provider.ok ? provider.status : null,
    provider_reason: provider.ok ? null : provider.reason,
    provider_last_commit: provider.ok ? provider.commit : null,
    observed_at: new Date().toISOString()
  };
  // Stuck is a deterministic FACT: we know our own commit, main is ahead of it, and no
  // deploy is in flight to close the gap. What to do about it is CODA's call, not ours.
  facts.behind = !!(live && head.ok && head.sha && head.sha.indexOf(live) !== 0 && head.sha !== live);
  facts.deploy_in_flight = !!(provider.ok && IN_FLIGHT[String(provider.status || '')]);
  facts.stuck = facts.behind && !facts.deploy_in_flight;
  return facts;
}

// Exit: submit the evidence back to CODA through her own gate, deduplicated per
// live-commit/head pair so a stuck state stamps once, not every heartbeat. Also drop a
// sync note on the CLAIR Command Center desk so A'NU, CLAIR, and the whole team read
// the same wall. This module never fixes and never reaches; that is the law it keeps.
async function submitToCoda(facts) {
  var ham = hamUid();
  if (!ham) return { ok: false, reason: 'no_ham_configured' };
  var eventId = 'deploy.freshness.' + String(facts.live_commit || 'unknown').slice(0, 10)
    + '.' + String(facts.main_head || 'unknown').slice(0, 10);
  var persisted = await sensorStore.persistEvent({
    ham_uid: ham,
    provider: 'deploy_sentinel',
    event_id: eventId,
    event_type: facts.stuck ? 'deploy.freshness.stuck' : 'deploy.freshness.ok',
    provider_delivery_id: eventId
  }, facts, {});
  // Only a STUCK finding is worth desk space; a healthy heartbeat stays logged-only.
  if (facts.stuck) {
    try {
      var exitDoor = require('../advisors/advisor.exit.js');
      await exitDoor.surfaceToDesk(ham, 'DEPLOY_SENTINEL',
        'The live server is behind its own merged work',
        'Live commit ' + String(facts.live_commit || '?').slice(0, 10) + ' vs main '
        + String(facts.main_head || '?').slice(0, 10) + ', no deploy in flight. Evidence submitted to CODA ('
        + eventId + '); her cycle decides the dispatch. This sentinel does not deploy and does not reach.', 8);
    } catch (e) { /* desk note is best-effort; the CODA submission above is the record */ }
  }
  return { ok: !!(persisted && persisted.ok !== false), event_id: eventId, stuck: facts.stuck };
}

async function runSentinel() {
  var facts = await senseOnce();
  var submitted = await submitToCoda(facts);
  return { ok: true, facts: facts, submitted: submitted };
}

// Mount: a read entry for operators, and the slow heartbeat. The interval is deliberately
// long (default 15 minutes) because staleness is measured in minutes-to-hours, and the
// sensor-event gate dedupes identical findings anyway.
var _timer = null;
function registerDeploySentinel(app) {
  app.post('/deploy/sentinel/run', async function (req, res) {
    try { res.json(await runSentinel()); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/deploy/sentinel/status', async function (req, res) {
    try { res.json({ ok: true, facts: await senseOnce(), heartbeat_ms: heartbeatMs() }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  if (!_timer && env('DEPLOY_SENTINEL_DISABLED') !== '1') {
    _timer = setInterval(function () { runSentinel().catch(function () {}); }, heartbeatMs());
    if (_timer && _timer.unref) _timer.unref();
  }
}
function heartbeatMs() {
  var m = parseInt(process.env.DEPLOY_SENTINEL_MINUTES, 10);
  return (isFinite(m) && m >= 5 ? m : 15) * 60 * 1000;
}

module.exports = { runSentinel: runSentinel, registerDeploySentinel: registerDeploySentinel,
  _internals: { senseOnce: senseOnce, submitToCoda: submitToCoda, readMainHead: readMainHead, readProviderDeploy: readProviderDeploy } };
