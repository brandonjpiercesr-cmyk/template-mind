// ⬡B:core.tools.render.deploy:MODULE:self_heal_deploy:20260630⬡
// She triggers her own Render deploy. Used by A'NEW after fixing a broken file.
// ANYHAM: serviceId from params, not hardcoded.
'use strict';
async function triggerDeploy(serviceId) {
  var RK = process.env.RENDER_API_KEY;
  if (!RK || !serviceId) return { ok: false, reason: 'no_key_or_service' };
  try {
    var r = await fetch('https://api.render.com/v1/services/' + serviceId + '/deploys', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RK, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearCache: 'do_not_clear' })
    });
    return r.ok ? { ok: true, serviceId } : { ok: false, status: r.status };
  } catch(e) { return { ok: false, error: e.message }; }
}
module.exports = { triggerDeploy };
