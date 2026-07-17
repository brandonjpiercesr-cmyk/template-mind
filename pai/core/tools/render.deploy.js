// ⬡B:core.tools.render.deploy:MODULE:self_heal_deploy:20260630⬡
// entered via the ABAHAM door, serving channel MESSAGES
// She triggers her own Render deploy. Used by A'NEW after fixing a broken file.
// ANYHAM: serviceId from params, not hardcoded.
'use strict';

function headers(key) {
  return { Authorization:'Bearer ' + key, Accept:'application/json' };
}

function abortSignal(options) {
  return options && (options.signal || options.abortSignal) || null;
}

async function cancellationRequested(options) {
  var signal = abortSignal(options);
  if (signal && signal.aborted) return true;
  if (options && typeof options.isCancelled === 'function') {
    try { return await options.isCancelled(true) === true; }
    catch (eCancel) { return true; }
  }
  return false;
}

async function json(response) {
  try { return await response.json(); }
  catch (error) { return null; }
}

function unwrapList(payload, field) {
  if (!Array.isArray(payload)) return [];
  return payload.map(function (item) {
    return item && item[field] ? item[field] : item;
  }).filter(Boolean);
}

async function triggerDeploy(serviceId, options) {
  if (await cancellationRequested(options)) return { ok:false, reason:'voice_turn_cancelled' };
  var RK = process.env.RENDER_API_KEY;
  if (!RK || !serviceId) return { ok: false, reason: 'no_key_or_service' };
  try {
    if (await cancellationRequested(options)) return { ok:false, reason:'voice_turn_cancelled' };
    var request = {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RK, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearCache: 'do_not_clear' })
    };
    var signal = abortSignal(options);
    if (signal) request.signal = signal;
    var r = await fetch('https://api.render.com/v1/services/' + serviceId + '/deploys', request);
    return r.ok ? { ok: true, serviceId } : { ok: false, status: r.status };
  } catch(e) { return abortSignal(options) && abortSignal(options).aborted
    ? { ok:false, reason:'provider_uncertain', cancelled:true }
    : { ok: false, error: e.message }; }
}

async function getServiceDetails(serviceId, options) {
  if (await cancellationRequested(options)) return { ok:false, reason:'voice_turn_cancelled' };
  var RK = process.env.RENDER_API_KEY;
  var id = String(serviceId || '').trim();
  if (!RK || !id) return { ok:false, reason:'no_key_or_service' };
  var encoded = encodeURIComponent(id);
  try {
    var signal = abortSignal(options);
    function readRequest() { return signal ? { headers:headers(RK), signal:signal }
      : { headers:headers(RK) }; }
    var responses = await Promise.all([
      fetch('https://api.render.com/v1/services/' + encoded, readRequest()),
      fetch('https://api.render.com/v1/disks?serviceId=' + encoded + '&limit=100', readRequest()),
      fetch('https://api.render.com/v1/services/' + encoded + '/deploys?limit=1', readRequest())
    ]);
    if (await cancellationRequested(options)) return { ok:false, reason:'voice_turn_cancelled' };
    var stages = ['service','disks','deploys'];
    for (var i = 0; i < responses.length; i++) {
      if (!responses[i].ok) return { ok:false, stage:stages[i], status:responses[i].status };
    }
    var service = await json(responses[0]);
    var disks = unwrapList(await json(responses[1]), 'disk');
    var deploys = unwrapList(await json(responses[2]), 'deploy');
    if (await cancellationRequested(options)) return { ok:false, reason:'voice_turn_cancelled' };
    if (!service) return { ok:false, stage:'service', reason:'provider_json_invalid' };
    var latest = deploys[0] || null;
    return {
      ok:true,
      provider:'render',
      serviceId:id,
      service:{
        id:service.id || id,
        name:service.name || null,
        type:service.type || null,
        suspended:service.suspended == null ? null : service.suspended,
        repo:service.repo || null,
        branch:service.branch || null,
        region:service.region || service.serviceDetails && service.serviceDetails.region || null
      },
      disks:disks.map(function (disk) {
        return { id:disk.id || null, name:disk.name || null,
          sizeGB:disk.sizeGB == null ? null : disk.sizeGB,
          mountPath:disk.mountPath || null, serviceId:disk.serviceId || id };
      }),
      latestDeploy:latest ? { id:latest.id || null, status:latest.status || null,
        commitId:latest.commit && latest.commit.id || latest.commitId || null,
        createdAt:latest.createdAt || null, finishedAt:latest.finishedAt || null } : null
    };
  } catch (error) {
    return { ok:false, stage:'provider', error:error.message };
  }
}

module.exports = { triggerDeploy, getServiceDetails };
