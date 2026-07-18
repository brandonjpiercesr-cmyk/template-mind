// ⬡B:core.model.ladder:MODULE:founder_authorized_models_20260715⬡
// THE FOUNDER'S ACTUAL AUTHORIZED LIST for general deliberation (advisors, story
// generation, dispatch planning): GLM 5.2, Ornith, and Qwen replacing Llama. Open
// weight. He called it out directly: too much of this codebase defaults straight
// to Groq (gpt-oss) as if it were the standing choice, when it is only meant to be
// the last-resort floor. This is the ONE shared resolver every general-deliberation
// call site should route through, so the real ladder holds everywhere at once
// instead of each file quietly reinventing its own Groq-only call.
// ABAHAM is the live door: PAI's outbound council calls this resolver for its
// SHADOW judgment, so provider fallback remains inside the same wired cycle.
'use strict';

// ⬡B:core.model.ladder:GUARD:json_contract_falls_through_provider_ladder:20260715⬡
// A provider returning non-empty prose is not a successful JSON deliberation.
// Validate the requested wire contract at each provider boundary so a malformed
// verdict falls through to the next authorized provider. If none returns one
// strict JSON object, deliberate() still returns null and the caller fails closed.
function hasAcceptedContent(content, opts) {
  if (typeof content !== 'string' || !content.trim()) return false;
  if (!opts || opts.json !== true) return true;
  var text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    var parsed = JSON.parse(text);
    return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch (e) {
    return false;
  }
}

function combinedSignal(signals) {
  var active = (signals || []).filter(function (signal) { return !!signal; });
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  var controller = new AbortController();
  active.forEach(function (signal) {
    if (signal.aborted && !controller.signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', function () {
      if (!controller.signal.aborted) controller.abort(signal.reason);
    }, { once:true });
  });
  return controller.signal;
}

function requestSignal(opts, timeout) {
  return combinedSignal([opts && opts.signal, AbortSignal.timeout(timeout)]);
}

async function tryRunPodGLM(system, user, opts) {
  // \u2b21B:core.model.ladder:FIX:glm_runpod_is_the_real_primary_20260715\u2b21 GLM
  // 5.2 already runs on its own RunPod serverless GPU (endpoint glm-5-2-envolve,
  // Ollama, model glm4:9b), isolated, scale-to-zero, exactly the same pattern as
  // Ornith. This is the TRUE first step, not Together/OpenRouter, which are only
  // the fallback when the RunPod GPU is unreachable.
  var url = process.env.GLM_RUNPOD_URL; if (!url) return null;
  try {
    var base = url.replace(/\/+$/, '');
    var full = /\/(chat\/)?completions$/.test(base) ? base : (/\/openai\/v1$/.test(base) ? base + '/chat/completions' : base + '/openai/v1/chat/completions');
    var body = { model: process.env.GLM_RUNPOD_MODEL || 'glm4:9b', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.format = 'json';
    var timeout = opts.realtime === true ? opts.timeout : Math.max(opts.timeout, 45000);
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.GLM_RUNPOD_KEY || process.env.RUNPOD_API_KEY || '') }, body: JSON.stringify(body), signal: requestSignal(opts, timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'glm-5.2', via: 'runpod' } : null;
  } catch (e) { return null; }
}
async function tryTogetherGLM(system, user, opts) {
  var key = process.env.TOGETHER_API_KEY; if (!key) return null;
  try {
    var body = { model: process.env.GLM_MODEL || 'zai-org/GLM-5.2', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    var r = await fetch('https://api.together.xyz/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'glm-5.2', via: 'together' } : null;
  } catch (e) { return null; }
}
async function tryOpenRouterGLM(system, user, opts) {
  var key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  try {
    var body = { model: process.env.GLM_OPENROUTER_MODEL || 'z-ai/glm-4.6', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'glm-5.2', via: 'openrouter' } : null;
  } catch (e) { return null; }
}
async function tryOrnith(system, user, opts) {
  var url = process.env.ORNITH_URL; if (!url) return null;
  try {
    var base = url.replace(/\/+$/, '');
    var full = /\/(chat\/)?completions$/.test(base) ? base : (/\/openai\/v1$/.test(base) ? base + '/chat/completions' : base + '/openai/v1/chat/completions');
    var body = { model: process.env.ORNITH_MODEL || 'ornith', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    // Ornith is called through its OpenAI-compatible chat-completions surface.
    // response_format is that surface's compatible JSON-mode request; ordinary
    // deliberations keep their existing request shape.
    if (opts.json) body.response_format = { type: 'json_object' };
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.ORNITH_KEY || process.env.RUNPOD_API_KEY || '') },
      body: JSON.stringify(body), signal: requestSignal(opts, Math.min(opts.timeout, 10000)) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'ornith', via: 'runpod' } : null;
  } catch (e) { return null; }
}
async function tryQwen(system, user, opts) {
  var key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature }), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'qwen3-235b', via: 'openrouter' } : null;
  } catch (e) { return null; }
}
async function tryGroqFloor(system, user, opts) {
  var key = process.env.GROQ_API_KEY; if (!key) return null;
  try {
    var body = { model: process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b', reasoning_effort: 'low', max_tokens: opts.max_tokens, temperature: opts.temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (opts.json) body.response_format = { type: 'json_object' };
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'gpt-oss-120b-floor', via: 'groq' } : null;
  } catch (e) { return null; }
}

// Hedge authorized providers without handing authority to network luck. Calls
// start together, but a lower-ranked result cannot win until every higher rank
// has definitively failed. Once the highest available result is known, pending
// lower-ranked work is aborted so it cannot linger after the judgment returns.
async function rankedAccepted(factories, opts) {
  factories = Array.isArray(factories) ? factories : [];
  if (!factories.length) return null;
  return new Promise(function (resolve) {
    var pending = {};
    var states = factories.map(function () { return pending; });
    var controllers = factories.map(function () { return new AbortController(); });
    var settled = false;
    function finish(result, winner) {
      if (settled) return;
      settled = true;
      controllers.forEach(function (controller, index) {
        if (index !== winner && !controller.signal.aborted) controller.abort();
      });
      resolve(result || null);
    }
    function evaluate() {
      for (var i = 0; i < states.length; i++) {
        if (states[i] === pending) return;
        if (states[i]) return finish(states[i], i);
      }
      finish(null, -1);
    }
    factories.forEach(function (factory, index) {
      var childOpts = Object.assign({}, opts, {
        signal:combinedSignal([opts && opts.signal, controllers[index].signal])
      });
      Promise.resolve().then(function () { return factory(childOpts); })
        .then(function (result) {
          states[index] = result || null;
          evaluate();
        }).catch(function () {
          states[index] = null;
          evaluate();
        });
    });
  });
}

// deliberate(system, user, opts) -> { content, model, via } | null
// THE LADDER, founder's authorized order: GLM 5.2 -> Ornith -> Qwen -> the Groq
// floor last, only if the open-weight authorized set is unreachable.
async function deliberate(system, user, options) {
  var opts = Object.assign({ max_tokens: 3000, temperature: 0.4, timeout: 25000, json: false }, options || {});
  // ⬡B:core.model_ladder:LAW:groq_out_of_the_default_order_perma_ban:20260717⬡
  // FOUNDER LAW 20260717: no Groq anymore. It was still the default last rung here.
  // The three open-weight rungs stand, verified live tonight: Qwen answers in ~2s,
  // GLM 5.2 serves SHADOW's judge from Render right now, Ornith is the coder. The
  // floor is removed from the default order. It is NOT deleted from the runner map,
  // so a deliberate MODEL_LADDER_ORDER that still names 'groq' keeps working during
  // the migration of the direct call sites, but nothing reaches it by default.
  var order = (process.env.MODEL_LADDER_ORDER || 'glm,ornith,qwen').split(',').map(function (s) { return s.trim(); });
  // \u2b21B:core.model_ladder:FIX:glm_provider_order_is_env_truth:20260717\u2b21
  // Live receipt: the RunPod pod is serving glm4:9b, a small quantized model, and
  // because it always answers first the real GLM-5.2 rung (Together) never runs.
  // That one weak primary drove both the empty drafts and the probabilistic SHADOW
  // holds on the founder's own chat turns. The order inside the GLM rung is now
  // env truth (GLM_PROVIDER_ORDER), no provider banned, RunPod stays in the chain.
  var glmSeq = String(process.env.GLM_PROVIDER_ORDER || 'runpod,together,openrouter')
    .split(',').map(function (s) { return s.trim().toLowerCase(); });
  var glmRunners = {
    runpod: function (o) { return tryRunPodGLM(system, user, o); },
    together: function (o) { return tryTogetherGLM(system, user, o); },
    openrouter: function (o) { return tryOpenRouterGLM(system, user, o); } };
  var glmChain = glmSeq.filter(function (n) { return typeof glmRunners[n] === 'function'; });
  if (!glmChain.length) glmChain = ['runpod', 'together', 'openrouter'];
  var runners = { glm: async function (runOpts) {
      runOpts = runOpts || opts;
      if (runOpts.realtime === true) return rankedAccepted(glmChain.map(function (n) {
        return function (child) { return glmRunners[n](child); };
      }), runOpts);
      for (var gi = 0; gi < glmChain.length; gi++) {
        var glmOut = await glmRunners[glmChain[gi]](opts);
        if (glmOut) return glmOut;
      }
      return null;
    },
    ornith: function (runOpts) { return tryOrnith(system, user, runOpts || opts); },
    qwen: function (runOpts) { return tryQwen(system, user, runOpts || opts); },
    groq: function (runOpts) { return tryGroqFloor(system, user, runOpts || opts); } };
  // ⬡B:core.model_ladder:BUILD:realtime_voice_judgment_race:20260716⬡
  // A phone turn cannot wait behind four sequential cold starts. Hedge the
  // complete authorized order for the same strict JSON judgment while
  // preserving MODEL_LADDER_ORDER as authority. The Groq floor starts inside
  // the same realtime window, but rankedAccepted cannot release its result
  // until every higher-ranked provider has definitively failed.
  if (opts.realtime === true) {
    var realtimeNames = order.filter(function (name) {
      return typeof runners[name] === 'function';
    });
    return rankedAccepted(realtimeNames.map(function (name) {
      return function (child) { return runners[name](child); };
    }), opts);
  }
  for (var i = 0; i < order.length; i++) {
    var fn = runners[order[i]]; if (!fn) continue;
    var res = await fn();
    if (res) return res;
  }
  // ⬡B:core.model_ladder:LAW:silence_over_hollow_never_the_banned_floor:20260717⬡
  // Every authorized open-weight rung failed. The doctrine answer is null: the channel
  // stays silent rather than send a hollow reply, and it NEVER quietly drops to a banned
  // provider to avoid an empty. A null here is a real signal that the open-weight rungs
  // need attention, not a reason to resurrect Groq.
  return null;
}

module.exports = { deliberate: deliberate };
