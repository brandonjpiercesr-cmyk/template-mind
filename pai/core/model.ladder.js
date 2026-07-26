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

// ⬡B:core.model_ladder:911:an_unterminated_think_block_stripped_nothing:20260726⬡
// FOUND 20260726 by a second Codex pass on the fix above, verified by hand: a
// PAIRED-tag regex only ever removes a `<think>` block that actually closed. The
// scenario the fix above exists for is a reasoning model exhausting its whole
// token budget INSIDE a think block, which is exactly the case where the model
// never gets to write `</think>` at all. `<think>weighing options until token
// limit` (no closing tag, no answer) survived the paired-tag strip completely
// unchanged, so the very failure mode this PR targets was the one case it did
// not catch. An opening `<think>` with no terminator means every token that
// followed was still reasoning, not an answer, so it is discarded to the end
// of the string. One shared function, used everywhere this codebase strips a
// reasoning trace, so a second reasoning-shaped model never needs this fixed
// twice more.
function stripReasoningTrace(content) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

// ⬡B:core.model.ladder:GUARD:json_contract_falls_through_provider_ladder:20260715⬡
// A provider returning non-empty prose is not a successful JSON deliberation.
// Validate the requested wire contract at each provider boundary so a malformed
// verdict falls through to the next authorized provider. If none returns one
// strict JSON object, deliberate() still returns null and the caller fails closed.
function hasAcceptedContent(content, opts) {
  if (typeof content !== 'string') return false;
  // ⬡B:core.model_ladder:911:plain_mode_accepted_pure_reasoning_residue:20260726⬡
  // FOUND 20260726 by an external review of #1163, verified by hand against this
  // file. The think-block strip below used to run ONLY when opts.json === true,
  // so a PLAIN mode call (exactly what the recovery and exhaustion synthesis
  // passes in core/tool.loop.js use) accepted any non-empty string as a real
  // answer, including one that was ENTIRELY a reasoning trace with no answer in
  // it at all. A reasoning model that burns its whole token budget inside
  // <think> and never reaches a real answer would have had that empty-of-
  // substance trace accepted as her reply. The only thing that counts as an
  // answer is what remains once the trace is stripped, in every mode, so the
  // strip runs first and the emptiness check runs on what is left. Uses
  // stripReasoningTrace so an unterminated <think> (token exhaustion mid
  // reasoning, no closing tag ever written) is caught the same way.
  var stripped = stripReasoningTrace(content);
  if (!stripped) return false;
  if (outputGuard.containsCjk(stripped)) return false;
  if (!opts || opts.json !== true) return true;
  // ⬡B:core.model_ladder:FIX:reasoning_residue_never_kills_a_good_answer:20260719⬡
  // GLM-5.2 and other reasoning models can wrap the real JSON in a thinking
  // trace or leading blank lines. Strip think blocks and grab the outermost
  // JSON object before judging, so a good answer with residue is accepted
  // instead of silently falling the whole turn to a cold RunPod pod.
  var text = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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
  // ⬡B:core.model_ladder:911:plain_mode_never_scrubbed_the_reasoning_trace:20260726⬡
  // FOUND 20260726, same review as the hasAcceptedContent fix above. This scrub
  // used to run ONLY when opts.json === true. Every plain-text call in this
  // codebase, which is what the recovery and exhaustion synthesis passes in
  // core/tool.loop.js actually use, passed straight through unscrubbed, so a
  // reasoning model's <think> block could ride along into a real human-facing
  // reply. There is no mode where leaving a raw reasoning trace in an answer is
  // correct, so the strip is unconditional. Only the JSON-specific code-fence
  // and outer-brace extraction stay gated on json mode: running brace
  // extraction on a legitimate plain-English answer that happens to mention a
  // brace would corrupt it, which is not a risk json mode carries. Uses
  // stripReasoningTrace so an unterminated <think> is caught the same way.
  var text = stripReasoningTrace(content);
  if (!opts || opts.json !== true) return text;
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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
    var runpodKey = seatMap && seatMap.sanitizeKey ? seatMap.sanitizeKey(process.env.GLM_RUNPOD_KEY) : String(process.env.GLM_RUNPOD_KEY || '').trim();
    if (!runpodKey) return null;
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + runpodKey }, body: JSON.stringify(body), signal: requestSignal(opts, timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: 'glm-5.2', via: 'runpod' } : null;
  } catch (e) { return null; }
}
// Every OpenRouter rung resolves one exact functional seat. The seat supplies
// both its model and its key, so one request cannot rotate through unrelated
// wallets and a bill remains attributable to the caller that opened it.
var seatMap = null;
try { seatMap = require('./seat.map.js'); } catch (eSeatMap) { seatMap = null; }

function openRouterCandidate(seatName) {
  if (!seatMap) return null;
  var s = seatMap.seat(String(seatName || ''));
  if (!s || s.provider !== 'openrouter') return null;
  var key = seatMap.resolveKey(s);
  return key ? { key:key,model:s.model,via:'openrouter:' + s.seat,seat:s.seat } : null;
}

async function tryOpenRouterGLM(system, user, opts) {
  // General ladder work belongs to one exact named seat. A failed or missing
  // key stops this rung instead of rotating through CANON, mind, or organ money.
  var candidate = openRouterCandidate(opts.seat || process.env.MODEL_LADDER_SEAT || 'deliberation');
  if (!candidate) return null;
  try {
        // ⬡B:core.model_ladder:911:glm_4.6_was_EIGHT_versions_old_now_5.2:20260718⬡
    // FOUNDER CAUGHT IT 20260718: this rung was hardcoded to z-ai/glm-4.6, EIGHT
    // versions behind the current z-ai/glm-5.2 that OpenRouter serves right now
    // (5.2, 5.1, 5, 4.7, 4.6...). The RunPod rung was worse: glm4:9b, a 9B GLM-4.
    // A stale default model string silently pins the whole system to an old brain.
    // Now 5.2 everywhere, env-overridable. Truncation fall-through (same file) covers
    // 5.2's reasoning-burn so an empty never wins.
    var glmModel = opts.seat && /^z-ai\/glm/i.test(candidate.model) ? candidate.model :
      (process.env.GLM_OPENROUTER_MODEL || 'z-ai/glm-5.2');
    var body = { model: glmModel, messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
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
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + candidate.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts),
      model:'glm-5.2',model_slug:glmModel,via:candidate.via } : null;
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
    var ornithKey = seatMap && seatMap.sanitizeKey
      ? seatMap.sanitizeKey(process.env.ORNITH_LADDER_API_KEY)
      : String(process.env.ORNITH_LADDER_API_KEY || '').trim();
    if (!ornithKey) return null;
    var r = await fetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ornithKey },
      body: JSON.stringify(body), signal: requestSignal(opts, Math.min(opts.timeout, 10000)) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    // ⬡B:core.model_ladder:AMEND:ornith_via_reflects_real_host_not_hardcoded_runpod:20260721⬡
    // Ornith moved off RunPod to a managed API; the via label is env-driven so cost
    // telemetry (METER) names the true host instead of a hardcoded, now-wrong 'runpod'.
    // ⬡B:core.model_ladder:911:ornith_accepted_but_never_scrubbed:20260726⬡
    // FOUND 20260726, a third Codex pass. Every sibling rung in this file scrubs
    // the content it accepts; this one alone returned the raw string. Checking
    // CJK on the STRIPPED content (the fix above) means a response with CJK
    // reasoning residue followed by a clean English answer is now correctly
    // accepted rather than falling through, but returning it raw would have
    // handed that CJK reasoning trace straight to a human. Scrubbed like every
    // other rung, not a new behaviour, a missed one.
    return hasAcceptedContent(c, opts) ? { content: cleanModelContent(c, opts), model: 'ornith', via: process.env.ORNITH_VIA || 'openrouter' } : null;
  } catch (e) { return null; }
}
async function tryQwen(system, user, opts) {
  var candidate = openRouterCandidate(opts.seat || process.env.MODEL_LADDER_SEAT || 'deliberation');
  if (!candidate) return null;
  try {
    var qwenModel = opts.seat && /^qwen\//i.test(candidate.model) ? candidate.model :
      (process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b');
    var body = { model: qwenModel, messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    // ⬡B:core.model_ladder:911:the_last_warm_rung_thought_itself_empty:20260726⬡
    // FOUND 20260726 while chasing her silence for a full day, and it is the same disease
    // this file already cured on its sibling rung sixty lines up, on a rung nobody went back
    // for. Qwen3 is a HYBRID REASONING model and it thinks by default, exactly like GLM-5.2.
    // Left to think, it spends the whole max_tokens budget on reasoning and returns content
    // that is EMPTY, hasAcceptedContent correctly rejects it, and this rung answers null.
    //
    // Null is not visibly a failure. It is indistinguishable from a rung that is simply
    // down, so the ladder walks on, and this file's own comment at tryAnthropicBackup
    // already wrote down what happens next: the open-weight rungs can all be out at once,
    // deliberate() returns null, "the founder experiences as A'NU going silent."
    //
    // That is the state that was live today. Together is out of credits, Ornith is retired,
    // RunPod is out, and the Anthropic floor is off by default since the cost audit. GLM and
    // Qwen were the last two warm rungs, and only ONE of them had been told not to think.
    //
    // Both passthrough shapes go out because OpenRouter providers differ in which one they
    // honour, which is the reasoning the GLM rung already carries and the reason it works.
    body.chat_template_kwargs = { enable_thinking: false };
    body.reasoning = { enabled: false };
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + candidate.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) return null;
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    // Its sibling has always run the accepted content through the scrubber and this rung
    // handed back the raw string. A provider that honours neither passthrough still returns
    // reasoning residue, so the rung that is most likely to think is the one that most needs
    // cleaning, and it was the one without it.
    return hasAcceptedContent(c, opts) ? {content:cleanModelContent(c, opts),model:'qwen3-235b',
      model_slug:qwenModel,via:candidate.via} : null;
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
  var key = process.env.ANTHROPIC_LADDER_API_KEY;
  if (!key) return null;
  var model = process.env.ANTHROPIC_LADDER_MODEL || 'claude-haiku-4-5';
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
  // longer contains ornith. An explicit per-call or env order plus the exact
  // ORNITH_LADDER_API_KEY is required before that rung can leave the process.
  // A caller may pin its rung and functional seat per call. This is request
  // state, never process.env mutation: overlapping contests cannot reseat one
  // another, and a throw cannot leave the whole process on the wrong ladder.
  var requestedOrder = opts.order == null ? process.env.MODEL_LADDER_ORDER : opts.order;
  var order = (Array.isArray(requestedOrder) ? requestedOrder :
    String(requestedOrder || 'glm,qwen').split(','))
    .map(function (s) { return String(s || '').trim().toLowerCase(); })
    .filter(function (name,index,list) {
      return name && list.indexOf(name) === index;
    });
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
  var glmSeq = String(process.env.GLM_PROVIDER_ORDER || 'openrouter')
    .split(',').map(function (s) { return s.trim().toLowerCase(); });
  var glmRunners = {
    runpod: function (o) { return tryRunPodGLM(system, user, o); },
    openrouter: function (o) { return tryOpenRouterGLM(system, user, o); } };
  var glmChain = glmSeq.filter(function (n) { return typeof glmRunners[n] === 'function'; });
  if (!glmChain.length) glmChain = ['openrouter'];
  // \u2b21B:core.model_ladder:FIX:tight_timeout_skips_runpod_glm:20260720\u2b21
  // FOUNDER 911 20260720: the RunPod GLM endpoint showed 2708 failed jobs against
  // 1402 completed, a real live number pulled from RunPod's own health API. Root
  // cause found: council/judge callers set tightTimeout with a real budget as low
  // as 7 seconds, but this rung is a scale-to-zero serverless GPU that can genuinely
  // take longer than that on any cold start, and RunPod bills for GPU time already
  // spent even when the caller gives up and aborts. A tight caller hitting a cold
  // RunPod pod is close to a guaranteed wasted, billed failure. RunPod cannot
  // reliably promise a sub-10-second answer the way a hosted API can, so a
  // tight-timeout caller skips it and continues through the exact sequential
  // OpenRouter seat. Realtime uses the same sequential rule.
  if (opts.tightTimeout) {
    glmChain = glmChain.filter(function (n) { return n !== 'runpod'; });
    if (!glmChain.length) glmChain = ['openrouter'];
  }
  var runners = { glm: async function (runOpts) {
      runOpts = runOpts || opts;
      for (var gi = 0; gi < glmChain.length; gi++) {
        var glmOut = await glmRunners[glmChain[gi]](runOpts);
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
  if (opts.order == null && process.env.ANTHROPIC_BACKUP_FLOOR === 'on' &&
      process.env.ANTHROPIC_LADDER_API_KEY && order.indexOf('anthropic') === -1) {
    order.push('anthropic');
  }
  // Realtime changes the deadline profile only. It never launches paid rungs
  // concurrently. A logical step opens the next provider attempt only after the
  // prior attempt has settled, so voice SHADOW plus its review cannot multiply
  // into four simultaneous provider charges.
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
  var key = seatMap && seatMap.sanitizeKey ? seatMap.sanitizeKey(process.env.TOGETHER_TRANSCRIBE_API_KEY) : String(process.env.TOGETHER_TRANSCRIBE_API_KEY || '').trim();
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
  _test: { hasAcceptedContent: hasAcceptedContent, cleanModelContent: cleanModelContent } };
