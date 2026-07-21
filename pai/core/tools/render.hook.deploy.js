// ⬡B:core.tools.render_hook_deploy:BUILD:least_privilege_deploy_hand_for_coda:20260720⬡
// entered via the ABAHAM door: this hand carries no identity of its own; the caller's
// hamUid resolves upstream through CODA's dispatch (the same server-bound authority as
// her other C2 hands) and the receipts it returns are stamped by that caller. CHANNEL
// PATH TO A HAM: MESSAGES, the deploy receipt reaches the founder through CODA's result
// gate onto the Command Center desk, never directly from this file.
//
// THE DEPLOY-HOOK HAND. A single-purpose C2 tool: it POSTs a Render Deploy Hook URL
// from env and nothing else. A deploy hook can only do one thing, trigger a deploy of
// the service's configured branch, so this hand carries no power to read secrets, list
// services, change settings, roll back, or delete anything. That makes it the safest
// hand to leave enabled: even fully misused, the worst outcome is an extra deploy of
// main. The full-API hand (tools/render.deploy.js, R4-gated) stays for rollback and
// inspection; this hook hand is the everyday "the merge must actually go live" muscle.
//
// DOCTRINE: this hand does not decide. CODA's cycle decides and dispatches it, on
// evidence submitted through her sensor gate (see core/deploy.sentinel.js). The hand
// executes one bounded effect and reports the provider's own receipt back.
//
// Config, per service, never hardcoded: RENDER_DEPLOY_HOOK_<NAME> (for this service,
// RENDER_DEPLOY_HOOK_AIBEBASE). The hook URL embeds its own secret; it lives in env
// only and is never logged, stamped, or echoed by this module.
'use strict';

function hookFor(serviceName) {
  var name = String(serviceName || 'aibebase').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return String(process.env['RENDER_DEPLOY_HOOK_' + name] || '').trim();
}

// Fire the hook. Returns the provider's receipt (deploy id) without ever exposing the URL.
async function triggerViaHook(serviceName) {
  var hook = hookFor(serviceName);
  if (!hook) return { ok: false, reason: 'no_deploy_hook_configured_for:' + (serviceName || 'aibebase') };
  try {
    var r = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(15000) });
    // A non-JSON body is still a real provider answer; mark it rather than faking shape.
    var body = await r.json().catch(function () { return { unparsed: true }; });
    var deployId = body && body.deploy && body.deploy.id || null;
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, status: r.status, deployId: deployId, service: serviceName || 'aibebase' };
    }
    return { ok: false, reason: 'hook_rejected_' + r.status, status: r.status };
  } catch (e) { return { ok: false, reason: 'hook_unreachable' }; }
}

module.exports = { triggerViaHook: triggerViaHook, hookFor: hookFor };
