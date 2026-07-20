// ⬡B:core.provider_boundary:LAW:one_door_for_seventy_five_groq_callers:20260717⬡
// FOUNDER LAW 20260717: no Groq anymore, and no Google, ever. Four approved APIs.
//
// The problem: 75 files raw-fetch https://api.groq.com directly. There is NO shared
// model helper to route them through. Hand-patching 75 files is exactly what the
// founder forbids and exactly what MACE exists to prevent. Pulling GROQ_API_KEY
// without routing them would make all 75 FAIL, not fall through, because none of them
// know the ladder exists.
//
// The real choke point is the one thing all 75 already share: fetch(). This wraps the
// global fetch ONCE, at process boundary, required at the top of index.js. Any call to
// a banned provider host is transparently rerouted through the authorized open-weight
// ladder (core/model.ladder.js -> GLM 5.2, Ornith, Qwen). The caller sends its normal
// OpenAI-shaped request and gets back an OpenAI-shaped response. It never learns it was
// moved. Zero per-caller edits. Every future groq fetch anyone writes is caught too.
//
// This is not a monkeypatch for cleverness. It is the founder's own doctrine: fix the
// one door everything already flows through, never write N patches. The provider gate
// stops NEW banned calls at commit; this boundary neutralizes the EXISTING ones at
// runtime. Together they make the ban real without touching 75 files.
//
// Anthropic is NOT rerouted: it is approved for CODA and the cook-off, and those callers
// are allowed to reach api.anthropic.com directly. Only the banned hosts are trapped.

var ladder = require('./model.ladder.js');

var BANNED_HOSTS = [
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.x.ai'
];

// \u2b21B:core.provider_boundary:FIX:meter_paid_providers_at_the_one_door:20260720\u2b21
// FOUNDER 911 20260720: the boundary rerouted BANNED hosts through the ladder, but it
// let direct calls to the three PAID approved providers (Together, OpenRouter, RunPod)
// sail straight past, so ~60 files that raw-fetch those hosts NEVER hit the spend guard
// that lives inside the ladder. That is the structural leak behind a bill that came back
// no matter how many single files got fixed. These hosts are NOT banned and their calls
// are NOT rerouted or altered -- but before each one leaves, it must pass the SAME daily
// spend guard the ladder enforces, so a runaway loop of direct paid calls trips the same
// brake instead of draining a card. A metered host that trips the guard is refused with a
// 429 the caller already knows how to treat as a soft miss, exactly like a rate limit.
var METERED_PAID_HOSTS = [
  'api.together.ai',
  'api.together.xyz',
  'openrouter.ai/api',
  'api.runpod.ai',
  'api.runpod.io'
];

function isBannedChatCall(url) {
  var u = String(url || '');
  for (var i = 0; i < BANNED_HOSTS.length; i++) {
    if (u.indexOf(BANNED_HOSTS[i]) !== -1) return true;
  }
  return false;
}

function isMeteredPaidCall(url) {
  var u = String(url || '');
  // only meter actual model-spend calls, never a health probe or a balance/models GET
  var isSpendPath = u.indexOf('chat/completions') !== -1 || u.indexOf('/run') !== -1 ||
    u.indexOf('/runsync') !== -1 || /\/v1\/messages/.test(u);
  if (!isSpendPath) return false;
  for (var i = 0; i < METERED_PAID_HOSTS.length; i++) {
    if (u.indexOf(METERED_PAID_HOSTS[i]) !== -1) return true;
  }
  return false;
}

function jsonResponse(obj, status) {
  var body = JSON.stringify(obj);
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Build an OpenAI-shaped chat completion envelope around ladder text, so a caller
// that reads choices[0].message.content keeps working unchanged.
function chatEnvelope(text) {
  return {
    id: 'ladder-' + Date.now(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'authorized-open-weight-ladder',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: String(text == null ? '' : text) },
      finish_reason: 'stop'
    }],
    _rerouted_from_banned_provider: true
  };
}

function install() {
  if (globalThis.__providerBoundaryInstalled) return;
  var realFetch = globalThis.fetch;
  if (typeof realFetch !== 'function') return;

  globalThis.fetch = async function (url, init) {
    try {
      if (!isBannedChatCall(url)) {
        // Metered paid provider: enforce the daily spend guard before the call leaves,
        // so direct fetches inherit the same brake the ladder has. Not rerouted, not
        // altered -- just gated. A tripped guard returns a 429 the caller treats as a miss.
        if (isMeteredPaidCall(url)) {
          try {
            var allowed = require('./spend.guard.js').allow('text');
            if (!allowed) {
              return jsonResponse({ error: { message: 'daily_spend_ceiling_reached_at_boundary', host: String(url) } }, 429);
            }
          } catch (eGuard) { /* guard unavailable -> fail open, never block a real turn */ }
        }
        return realFetch.apply(this, arguments);
      }
      // A banned chat call. Parse its OpenAI-shaped body and reroute through the ladder.
      var parsed = null;
      try { parsed = init && init.body ? JSON.parse(init.body) : null; } catch (e) { parsed = null; }
      var msgs = (parsed && Array.isArray(parsed.messages)) ? parsed.messages : null;
      if (!msgs) {
        // Not a shape we can reroute. Refuse loud rather than reach a banned host.
        return jsonResponse({ error: { message: 'banned_provider_blocked_at_boundary', host: String(url) } }, 403);
      }
      var system = '';
      var user = '';
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i] || {};
        var c = typeof m.content === 'string' ? m.content
          : (Array.isArray(m.content) ? m.content.map(function (p) { return p && p.text ? p.text : ''; }).join('\n') : '');
        if (m.role === 'system') system += (system ? '\n' : '') + c;
        else user += (user ? '\n' : '') + c;
      }
      var wantsJson = !!(parsed && parsed.response_format &&
        parsed.response_format.type === 'json_object');
      var out = await ladder.deliberate(system, user, {
        max_tokens: (parsed && parsed.max_tokens) || 1000,
        temperature: (parsed && typeof parsed.temperature === 'number') ? parsed.temperature : 0.4,
        json: wantsJson,
        timeout: 30000
      });
      var text = out && out.content != null ? out.content : (typeof out === 'string' ? out : '');
      // Silence over hollow: if every open-weight rung failed, return an empty-content
      // 200 in the same shape. The caller's own null-check handles it; we never reach
      // the banned host and we never fabricate content.
      return jsonResponse(chatEnvelope(text));
    } catch (e) {
      return jsonResponse({ error: { message: 'provider_boundary_error: ' + String(e && e.message || e) } }, 502);
    }
  };
  globalThis.__providerBoundaryInstalled = true;
}

module.exports = { install: install, isBannedChatCall: isBannedChatCall, isMeteredPaidCall: isMeteredPaidCall, BANNED_HOSTS: BANNED_HOSTS, METERED_PAID_HOSTS: METERED_PAID_HOSTS };
