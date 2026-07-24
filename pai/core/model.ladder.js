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

var outputGuard = require('./model.output.guard.js');

// ⬡B:core.model.ladder:GUARD:json_contract_falls_through_provider_ladder:20260715⬡
// A provider returning non-empty prose is not a successful JSON deliberation.
// Validate the requested wire contract at each provider boundary so a malformed
// verdict falls through to the next authorized provider. If none returns one
// strict JSON object, deliberate() still returns null and the caller fails closed.
function hasAcceptedContent(content, opts) {
  if (typeof content !== 'string' || !content.trim()) return false;
  if (outputGuard.containsCjk(content)) return false;
  if (!opts || opts.json !== true) return true;
  // ⬡B:core.model_ladder:FIX:reasoning_residue_never_kills_a_good_answer:20260719⬡
  // GLM-5.2 and other reasoning models can wrap the real JSON in a thinking
  // trace or leading blank lines. Strip think blocks and grab the outermost
  // JSON object before judging, so a good answer with residue is accepted
  // instead of silently falling the whole turn to a cold RunPod pod.
  var text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (text[0] !== '{') {
    var s = text.indexOf('{'); var e = text.lastIndexOf('}');
    if (s !== -1 && e > s) text = text.slice(s, e + 1);
  }
  try {
    var parsed = JSON.parse(text);
    return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch (e) {
    return false;
  }
}


function cleanModelContent(content, opts) {
  if (typeof content !== 'string') return content;
  if (!opts || opts.json !== true) return content;
  var text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (text[0] !== '{') {
    var s = text.indexOf('{'); var e = text.lastIndexOf('}');
    if (s !== -1 && e > s) text = text.slice(s, e + 1);
  }
  return text;
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
    // ⬡B:core.model_ladder:FIX:runpod_glm_must_answer_in_english:20260719⬡
    // The RunPod GLM pod runs glm4:9b, which defaults to CHINESE when the system
    // prompt does not pin a language, so it returned Chinese gibberish that either
    // reached the person or failed the JSON parse and cascaded to a PAID provider.
    // Pin English hard on this rung so its output is always usable and never bleeds
    // the turn to OpenRouter. English-only prepend, caller's system content preserved.
    var _rpSystem = outputGuard.englishSystem(system);
    var body = { model: process.env.GLM_RUNPOD_MODEL || 'glm-5.2', messages: [{ role: 'system', content: _rpSystem }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.format = 'json';
    // ⬡B:core.model_ladder:FIX:runpod_honors_an_explicit_tight_caller_timeout:20260719⬡
    // The 45s floor here was the council's 42-48s latency and the slow half of the
    // gaslight cycle: the outbound judge asks for 9s, but this rung silently forced
    // 45s, so when Together/OpenRouter missed and the turn fell to a cold RunPod pod
    // it waited out the full cold boot before failing. A caller that sets a tight
    // timeout (opts.tightTimeout, the council) is honored exactly; everything else
    // keeps the generous floor so a normal deliberation still tolerates a cold boot.
    var timeout = opts.realtime === true ? opts.timeout
      : (opts.tightTimeout ? opts.timeout : Math.max(opts.timeout, 45000));
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.GLM_RUNPOD_KEY || process.env.RUNPOD_API_KEY || '') }, body: JSON.stringify(body), signal: requestSignal(opts, timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: 'glm-5.2', via: 'runpod' } : null;
  } catch (e) { return null; }
}
async function tryTogetherGLM(system, user, opts) {
  var key = process.env.TOGETHER_API_KEY; if (!key) return null;
  try {
    var body = { model: process.env.GLM_MODEL || 'zai-org/GLM-5.2', messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    // ⬡B:core.model_ladder:FIX:glm52_no_thinking_on_together_so_it_returns_fast_clean_json:20260719⬡
    // GLM-5.2 is a 744B reasoning model that THINKS by default, emitting a long
    // reasoning trace before (or instead of) the answer. On a json call the
    // content then fails to parse as pure JSON, hasAcceptedContent rejects it,
    // and the whole GLM rung falls through to a COLD RunPod pod, which is the
    // real reason every scene paid a 90-second cold start. Turning thinking OFF
    // makes GLM-5.2 answer directly and fast, clean JSON on json calls, so the
    // warm Together rung actually wins instead of silently losing to cold RunPod.
    body.chat_template_kwargs = { enable_thinking: false };
    var r = await fetch('https://api.together.xyz/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: 'glm-5.2', via: 'together' } : null;
  } catch (e) { return null; }
}
async function tryOpenRouterGLM(system, user, opts) {
  var key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  try {
        // ⬡B:core.model_ladder:911:glm_4.6_was_EIGHT_versions_old_now_5.2:20260718⬡
    // FOUNDER CAUGHT IT 20260718: this rung was hardcoded to z-ai/glm-4.6, EIGHT
    // versions behind the current z-ai/glm-5.2 that OpenRouter serves right now
    // (5.2, 5.1, 5, 4.7, 4.6...). The RunPod rung was worse: glm4:9b, a 9B GLM-4.
    // A stale default model string silently pins the whole system to an old brain.
    // Now 5.2 everywhere, env-overridable. Truncation fall-through (same file) covers
    // 5.2's reasoning-burn so an empty never wins.
    var body = { model: process.env.GLM_OPENROUTER_MODEL || 'z-ai/glm-5.2', messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    // ⬡B:core.model_ladder:FIX:glm52_no_thinking_on_openrouter_too:20260719⬡
    // Same disease as the Together rung: GLM-5.2 thinks by default, the content
    // arrives with reasoning residue, hasAcceptedContent rejects it on json
    // calls, and the turn falls to a COLD RunPod pod. With Together out of
    // credits (live 402 receipt today) OpenRouter is the working warm rung, so
    // it must answer clean. Both passthrough shapes are sent because OpenRouter
    // providers differ in which one they honor.
    body.chat_template_kwargs = { enable_thinking: false };
    body.reasoning = { enabled: false };
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: 'glm-5.2', via: 'openrouter' } : null;
  } catch (e) { return null; }
}
async function tryOrnith(system, user, opts) {
  var url = process.env.ORNITH_URL; if (!url) return null;
  try {
    var base = url.replace(/\/+$/, '');
    var full = /\/(chat\/)?completions$/.test(base) ? base : (/\/openai\/v1$/.test(base) ? base + '/chat/completions' : base + '/openai/v1/chat/completions');
    var body = Object.assign({ model: process.env.ORNITH_MODEL || 'ornith', messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }] }, outputGuard.ornithSampling(opts.max_tokens, false));
    // Ornith is called through its OpenAI-compatible chat-completions surface.
    // response_format is that surface's compatible JSON-mode request; ordinary
    // deliberations keep their existing request shape.
    if (opts.json) body.response_format = { type: 'json_object' };
    var ornithKey = process.env.ORNITH_KEY || (/openrouter\.ai/.test(url) ? process.env.OPENROUTER_API_KEY : process.env.RUNPOD_API_KEY) || '';
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ornithKey },
      body: JSON.stringify(body), signal: requestSignal(opts, Math.min(opts.timeout, 10000)) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    // ⬡B:core.model_ladder:AMEND:ornith_via_reflects_real_host_not_hardcoded_runpod:20260721⬡
    // Ornith moved off RunPod to a managed API; the via label is env-driven so cost
    // telemetry (METER) names the true host instead of a hardcoded, now-wrong 'runpod'.
    return hasAcceptedContent(c, opts) ? { content: c, model: 'ornith', via: process.env.ORNITH_VIA || 'openrouter' } : null;
  } catch (e) { return null; }
}
async function tryQwen(system, user, opts) {
  var key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b', messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature }), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: c, model: 'qwen3-235b', via: 'openrouter' } : null;
  } catch (e) { return null; }
}
// ⬡B:core.model_ladder:FIX:anthropic_backup_floor_kills_no_answer:20260721⬡
// The gaslight cycle, root cause found live: the ladder's open-weight rungs (GLM on
// runpod/together/openrouter, Ornith, Qwen) can ALL be down at once (Together out of credits,
// OpenRouter strained, RunPod cold), and with nothing beneath them deliberate() returns null,
// which the council surfaces as no_answer and the founder experiences as A'NU going silent. The
// two Anthropic backup keys the router's own bleed provider already uses (Haiku for C0/C1,
// Sonnet for C2/C3) are a live hosted API immune to the open-weight outage. This adds them as
// the last-resort floor: it only ever runs after every open-weight rung has definitively
// failed, so it changes nothing when they work and gives the cycle a live answer when they do
// not. Still gated by the one spend door at deliberate() entry, so the ceiling holds.
async function tryAnthropicBackup(system, user, opts) {
  // ⬡B:core.model_ladder:FIX:anthropic_floor_off_unless_explicitly_armed:20260722⬡
  // COST AUDIT follow-up (founder 911 20260722): this "last-resort floor" quietly became a hot
  // path -- when Together depleted and the open-weight rungs missed, every miss fell through to
  // claude-sonnet-4-6 and billed Anthropic silently (~$12/day), which also VIOLATES the house law
  // that Anthropic is CODA + cook-off ONLY (board/gate/provider.gate.js). A key being PRESENT (it
  // may be needed for the sanctioned cook-off path) must not arm the general-answer floor. Require
  // an explicit opt-in: ANTHROPIC_BACKUP_FLOOR=on. Off by default -> an open-weight miss returns
  // null (the cycle surfaces ok:false, the founder's own "ok:false over a hollow reply" doctrine)
  // instead of paying the most expensive closed model to hide the open-weight outage.
  if (process.env.ANTHROPIC_BACKUP_FLOOR !== 'on') return null;
  var sonnet = process.env.ANTHROPIC_BACKUP_C2_SONNET5;
  var haiku = process.env.ANTHROPIC_BACKUP_C0C1_HAIKU;
  var key = sonnet || haiku;
  if (!key) return null;
  var model = sonnet ? (process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6') : (process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5');
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, max_tokens: opts.max_tokens || 3000,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
        system: outputGuard.englishSystem(system), messages: [{ role: 'user', content: user }] }),
      signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json();
    var c = (d.content || []).map(function (b) { return b.text || ''; }).join('');
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: model, via: 'anthropic' } : null;
  } catch (e) { return null; }
}
// ⬡B:core.model_ladder:CLEANUP:groq_runner_deleted_stack_spotless:20260717⬡
// The Groq floor is gone. GROQ_API_KEY is off every service, the fetch boundary
// reroutes any stray banned call, and the four-API law leaves no seat for it. The
// runner, its GROQ_MODEL env references, and the 'groq' name in the runner map are
// all deleted. Nothing reaches for it anymore.

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
// ⬡COLD:decide:tag:PROVIDER_SPEND_ATTRIBUTION:20260723⬡
// COLD-ANEW-LADDER-0007 stamped, needs-live-verification. The entry spend guard below consumes one
// anonymous slot before any provider is attempted, while provider.boundary meters each actual paid
// fetch again, so accounting is split across two layers with no component or key identity. The
// honest fix (meter each real attempt exactly once inside a canonical provider client that carries
// component, wonder, key label, and cost context) is PROVIDER_SPEND_ATTRIBUTION. That client is not
// present in this file and touching spend.guard is out of this file's scope, so it is contained by
// stamp only; no hot-path behavior is changed here.
async function deliberate(system, user, options) {
  var opts = Object.assign({ max_tokens: 3000, temperature: 0.4, timeout: 25000, json: false }, options || {});
  // ⬡B:core.model_ladder:LAW:spend_guard_at_the_one_door:20260719⬡ the daily
  // ceiling lives at the single door every paid text call flows through, so a
  // runaway loop or retry storm trips a brake instead of draining a balance to
  // zero. Health probes and free rungs pass opts.noGuard to bypass.
  if (!opts.noGuard) {
    try { if (!require('./spend.guard.js').allow('text')) return null; } catch (eSG) {}
  }
  // ⬡B:core.model_ladder:KILL:ornith_out_of_the_default_order_founder_911:20260722⬡
  // FOUNDER 911 20260722: Ornith retired, RunPod out. The default rung order no
  // longer contains ornith, so no ladder deliberation submits a RunPod job unless
  // an env explicitly re-adds it (MODEL_LADDER_ORDER). The tryOrnith runner stays
  // defined for that supervised opt-in only.
  var order = (process.env.MODEL_LADDER_ORDER || 'glm,qwen').split(',').map(function (s) { return s.trim(); });
  // \u2b21B:core.model_ladder:FIX:glm_provider_order_is_env_truth:20260717\u2b21
  // Live receipt: the RunPod pod is serving glm4:9b, a small quantized model, and
  // because it always answers first the real GLM-5.2 rung (Together) never runs.
  // That one weak primary drove both the empty drafts and the probabilistic SHADOW
  // holds on the founder's own chat turns. The order inside the GLM rung is now
  // env truth (GLM_PROVIDER_ORDER), no provider banned, RunPod stays in the chain.
  // ⬡B:core.model_ladder:AMEND:runpod_retired_default_is_together_first:20260721⬡
  // FOUNDER RULING 20260721: RunPod is retired. The default no longer leads with
  // runpod, so a wiped GLM_PROVIDER_ORDER env can never send GLM to the retired
  // RunPod GPU first. Live env already reads together,openrouter; this makes the
  // code fallback match the ruling instead of masking it. The runpod runner stays
  // in the map so the seat can be restored by env if ever wanted, just not defaulted.
  var glmSeq = String(process.env.GLM_PROVIDER_ORDER || 'together,openrouter')
    .split(',').map(function (s) { return s.trim().toLowerCase(); });
  var glmRunners = {
    runpod: function (o) { return tryRunPodGLM(system, user, o); },
    together: function (o) { return tryTogetherGLM(system, user, o); },
    openrouter: function (o) { return tryOpenRouterGLM(system, user, o); } };
  var glmChain = glmSeq.filter(function (n) { return typeof glmRunners[n] === 'function'; });
  if (!glmChain.length) glmChain = ['together', 'openrouter'];
  // \u2b21B:core.model_ladder:FIX:tight_timeout_skips_runpod_glm:20260720\u2b21
  // FOUNDER 911 20260720: the RunPod GLM endpoint showed 2708 failed jobs against
  // 1402 completed, a real live number pulled from RunPod's own health API. Root
  // cause found: council/judge callers set tightTimeout with a real budget as low
  // as 7 seconds, but this rung is a scale-to-zero serverless GPU that can genuinely
  // take longer than that on any cold start, and RunPod bills for GPU time already
  // spent even when the caller gives up and aborts. A tight caller hitting a cold
  // RunPod pod is close to a guaranteed wasted, billed failure. RunPod cannot
  // reliably promise a sub-10-second answer the way a hosted per-token API can, so
  // a tight-timeout caller now skips the RunPod rung entirely and goes straight to
  // Together, a fast hosted API immune to cold starts. Realtime voice already hedges
  // all providers in parallel above and is unaffected by this.
  if (opts.tightTimeout) {
    glmChain = glmChain.filter(function (n) { return n !== 'runpod'; });
    if (!glmChain.length) glmChain = ['together', 'openrouter'];
  }
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
    anthropic: function (runOpts) { return tryAnthropicBackup(system, user, runOpts || opts); }, };
  // The Anthropic backup is always the last rung whenever a key is present, so the cycle has a
  // live floor beneath the open-weight ladder. Appended, never inserted, so it runs only after
  // every higher rung has failed, and only added when it is not already in the configured order.
  if (process.env.ANTHROPIC_BACKUP_FLOOR === 'on' && (process.env.ANTHROPIC_BACKUP_C2_SONNET5 || process.env.ANTHROPIC_BACKUP_C0C1_HAIKU) && order.indexOf('anthropic') === -1) {
    order.push('anthropic');
  }
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
  return null;
}

// ⬡B:core.model_ladder:WIRE:transcription_lives_behind_the_one_door_too:20260718⬡
// Decided with A'NEW under the founder's unite rule: the SEATED voicenote
// transcribed through Groq Whisper, which the four API law bans, so
// transcription rides this same single door on Together, an approved API that
// hosts Whisper. One ladder, one place providers live, including for audio.
// (Re-applied after a graft rebuild dropped it; the graft kept the groq rung
// removed, which is aligned, but did not carry this door.)
async function transcribe(audio, opts) {
  opts = opts || {};
  if (!audio) return null;
  var b64 = String(audio); var comma = b64.indexOf(',');
  if (comma >= 0) b64 = b64.slice(comma + 1);
  var buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (eB) { return null; }
  if (!buf || !buf.length) return null;
  // rung one: Together Whisper (approved), when it has credits
  var key = process.env.TOGETHER_API_KEY;
  if (key) {
    try {
      var form = new FormData();
      form.append('file', new Blob([buf], { type: opts.mime || 'audio/webm' }), opts.filename || 'note.webm');
      form.append('model', process.env.TOGETHER_WHISPER_MODEL || 'openai/whisper-large-v3');
      var r = await fetch('https://api.together.xyz/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form,
        signal: requestSignal(opts, opts.timeout || 20000) });
      if (r.ok) {
        var d = await r.json();
        var text = String(d.text || '').trim();
        if (text) return { text: text, via: 'together' };
      }
    } catch (e) { /* fall through to the next rung */ }
  }
  // ⬡B:core.model_ladder:REPAIR:elevenlabs_stt_carries_voice_notes_when_together_is_dry:20260719⬡
  // Together ran out of credits (live 402 receipt) and voice notes died with it.
  // ElevenLabs is already the approved voice vendor with a live key, and its
  // scribe model transcribes. Second rung on the same one door, no new vendor.
  var elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      var form2 = new FormData();
      form2.append('file', new Blob([buf], { type: opts.mime || 'audio/webm' }), opts.filename || 'note.webm');
      form2.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');
      var r2 = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST', headers: { 'xi-api-key': elKey }, body: form2,
        signal: requestSignal(opts, opts.timeout || 25000) });
      if (r2.ok) {
        var d2 = await r2.json();
        var text2 = String(d2.text || '').trim();
        if (text2) return { text: text2, via: 'elevenlabs' };
      }
    } catch (e2) { /* both rungs failed, honest null */ }
  }
  return null;
}

module.exports = { deliberate: deliberate, transcribe: transcribe,
  _test: { hasAcceptedContent: hasAcceptedContent } };
