// ⬡B:core.ornith.client:MODULE:shared_ornith_caller:20260705⬡
// entered via the ABAHAM door, serving channel MODEL_ROUTING
//
// Shared caller for the board-settled model ladder (clair.threeray.
// model_rotation_final, importance 10): Ornith primary for any plain
// text-in-text-out judgment or compose call. One real implementation,
// required by every file that needs it, instead of the same ~35 lines
// copy-pasted per file (which is exactly how scaffold rot starts).
// Proven live tonight against core/deliberationCouncil.js and core/outreach.js
// with real before/after RunPod job-count evidence, not assumed working.
// Does NOT serve tool-calling turns — the current RunPod Ollama worker has
// no vLLM tool-call parser attached, a real documented infrastructure gap,
// not a place to silently degrade a turn that needs a real tool call.
'use strict';

var outputGuard = require('./model.output.guard.js');

var ORNITH_URL = process.env.ORNITH_URL;
var RUNPOD_KEY = process.env.RUNPOD_API_KEY;
var ORNITH_MODEL = process.env.ORNITH_MODEL || 'maxwell1500/ornith-35b:Q4_K_M';

// ⬡B:core.ornith.client:FIX:disable_reasoning_20260714⬡ Every one of this client's callers
// was silently getting null back whenever Ornith's thinking mode burned the token budget
// before reaching content (a documented Ollama reasoning-model pattern, confirmed live: same
// prompt produced finish_reason=length/empty content one run, 1556 rambling reasoning tokens
// ignoring num_predict entirely on another). Native think:false on this job-queue path fixes
// it -- confirmed live, finish_reason=stop, real content, first try. This touches every
// production caller of Ornith at once, not just the cook-off station.
async function callOrnith(system, userContent, maxTokens) {
  if (!ORNITH_URL || !RUNPOD_KEY) return null;
  try {
    var payload = { input: { mode: 'chat', model: ORNITH_MODEL, think: false,
      options: outputGuard.ornithSampling(maxTokens || 400, true),
      messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: userContent }] } };
    var jobResp = await fetch(ORNITH_URL.replace(/\/$/, '') + '/run', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RUNPOD_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (x) { return x.json(); }).catch(function () { return null; });
    var jobId = jobResp && jobResp.id;
    if (!jobId) return null;
    for (var i = 0; i < 8; i++) {
      await new Promise(function (res) { setTimeout(res, 8000); });
      var statusResp = await fetch(ORNITH_URL.replace(/\/$/, '') + '/status/' + jobId, {
        headers: { Authorization: 'Bearer ' + RUNPOD_KEY }
      }).then(function (x) { return x.json(); }).catch(function () { return null; });
      if (statusResp && statusResp.status === 'COMPLETED') {
        var out = statusResp.output;
        var msg = Array.isArray(out) ? (out[0] && out[0].choices && out[0].choices[0] && out[0].choices[0].message)
          : (out && out.choices && out.choices[0] && out.choices[0].message);
        var content = (msg && msg.content) || null;
        return outputGuard.containsCjk(content) ? null : content;
      }
      if (statusResp && statusResp.status === 'FAILED') return null;
    }
    // \u2b21B:core.ornith.client:FIX:cancel_abandoned_job_on_poll_timeout:20260720\u2b21
    // FOUNDER 911 20260720: 506 and 502 jobs found sitting live in queue on the Ornith
    // and GLM RunPod endpoints, real money, real hammering, not a guess -- confirmed via
    // the RunPod health endpoint and purged. Root cause found here: this loop polls for
    // 64 seconds, and if the job still has not finished, it gives up and returns null
    // WITHOUT ever telling RunPod to stop working on it. The job keeps running or sitting
    // queued, fully billed, completely abandoned, while the very next cycle submits a
    // brand new one on top. That is exactly how a queue grows to 500+ zombie jobs no
    // matter how many times it gets purged. A give-up must be a real give-up: cancel the
    // job on RunPod's side the moment this caller stops waiting for it.
    fetch(ORNITH_URL.replace(/\/$/, '') + '/cancel/' + jobId, {
      method: 'POST', headers: { Authorization: 'Bearer ' + RUNPOD_KEY }
    }).catch(function () {});
    return null;
  } catch (e) { return null; }
}

module.exports = { callOrnith: callOrnith };
