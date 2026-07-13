// ⬡B:core.tools.render.logs:MODULE:self_heal_log_reader:20260630⬡
// Reads Render deploy logs for a service. Used by A'NEW to diagnose her own crashes.
// ANYHAM: serviceId from env, not hardcoded. Any service can be read.
'use strict';
async function readRenderLogs(serviceId, limit) {
  var RK = process.env.RENDER_API_KEY;
  if (!RK || !serviceId) return { ok: false, reason: 'no_key_or_service' };
  limit = limit || 50;
  try {
    // Get latest deploy ID first
    var deps = await fetch('https://api.render.com/v1/services/' + serviceId + '/deploys?limit=1', {
      headers: { Authorization: 'Bearer ' + RK, Accept: 'application/json' }
    }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; });
    var dep = deps && deps[0] ? (deps[0].deploy || deps[0]) : null;
    if (!dep) return { ok: false, reason: 'no_deploy_found' };
    var depId = dep.id;
    var status = dep.status;
    // Get logs
    var logs = await fetch('https://api.render.com/v1/logs?resourceId=' + serviceId + '&deployId=' + depId + '&limit=' + limit, {
      headers: { Authorization: 'Bearer ' + RK, Accept: 'application/json' }
    }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; });
    var lines = (logs || []).map(function(l){ return l.message || ''; }).filter(Boolean);
    // Detect crash signals
    var crashSignals = lines.filter(function(l){
      return /error|exception|cannot find module|unhandled|crash|exit code [^0]/i.test(l);
    });
    return { ok: true, serviceId, deployId: depId, status, lines, crashSignals, hasCrash: crashSignals.length > 0 };
  } catch(e) { return { ok: false, error: e.message }; }
}
module.exports = { readRenderLogs };
