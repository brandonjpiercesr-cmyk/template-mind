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
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.GLM_RUNPOD_KEY || process.env.RUNPOD_API_KEY || '') }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(opts.timeout, 45000)) });
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
      body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeout) });
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
      body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeout) });
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
      body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(opts.timeout, 10000)) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'ornith', via: 'runpod' } : null;
  } catch (e) { return null; }
}
async function tryQwen(system, user, opts) {
  var key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature }), signal: AbortSignal.timeout(opts.timeout) });
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
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'gpt-oss-120b-floor', via: 'groq' } : null;
  } catch (e) { return null; }
}

// deliberate(system, user, opts) -> { content, model, via } | null
// THE LADDER, founder's authorized order: GLM 5.2 -> Ornith -> Qwen -> the Groq
// floor last, only if the open-weight authorized set is unreachable.
async function deliberate(system, user, options) {
  var opts = Object.assign({ max_tokens: 900, temperature: 0.4, timeout: 25000, json: false }, options || {});
  var order = (process.env.MODEL_LADDER_ORDER || 'glm,ornith,qwen,groq').split(',').map(function (s) { return s.trim(); });
  var runners = { glm: async function () { return (await tryRunPodGLM(system, user, opts)) || (await tryTogetherGLM(system, user, opts)) || (await tryOpenRouterGLM(system, user, opts)); },
    ornith: function () { return tryOrnith(system, user, opts); },
    qwen: function () { return tryQwen(system, user, opts); },
    groq: function () { return tryGroqFloor(system, user, opts); } };
  for (var i = 0; i < order.length; i++) {
    var fn = runners[order[i]]; if (!fn) continue;
    var res = await fn();
    if (res) return res;
  }
  return null;
}

module.exports = { deliberate: deliberate };
