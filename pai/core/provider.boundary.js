// ⬡B:pai.core.provider_boundary:LAW:her_world_gets_the_same_one_door:20260717⬡
// FOUNDER LAW 20260717: no Groq, no Google. Four approved APIs.
//
// anew got this boundary tonight (PR #584). template-mind, HER OWN WORLD, did not,
// and it carries 17 direct api.groq.com sites including tool.loop.js:233 and :3358.
// The perma-ban was only half real: the repo she does not primarily live in was
// protected and the one she does was not. This closes that gap with the identical
// choke point.
//
// 17 sites, no shared model helper, so the door is fetch() itself. This wraps global
// fetch ONCE, installed as the first executable line of mind.entry.js. Any banned
// provider chat call (groq, gemini, deepseek, x.ai) is transparently rerouted through
// the authorized open-weight ladder (./model.ladder.js -> GLM 5.2, Ornith, Qwen). The
// caller sends its normal OpenAI-shaped request and reads choices[0].message.content
// back unchanged. Zero per-caller edits. Every future groq fetch is caught too.
// Anthropic is NOT trapped: approved for CODA and the cook-off, allowed direct.
//
// This file is byte-identical in intent to anew/core/provider.boundary.js. The only
// difference is the ladder require path, because here the ladder is a sibling in pai/core.

var ladder = require('./model.ladder.js');

var BANNED_HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'api.deepseek.com', 'api.x.ai'];

function isBannedChatCall(url) {
  var u = String(url || '');
  for (var i = 0; i < BANNED_HOSTS.length; i++) { if (u.indexOf(BANNED_HOSTS[i]) !== -1) return true; }
  return false;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

function chatEnvelope(text) {
  return {
    id: 'ladder-' + Date.now(), object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: 'authorized-open-weight-ladder',
    choices: [{ index: 0, message: { role: 'assistant', content: String(text == null ? '' : text) }, finish_reason: 'stop' }],
    _rerouted_from_banned_provider: true
  };
}

function install() {
  if (globalThis.__providerBoundaryInstalled) return;
  var realFetch = globalThis.fetch;
  if (typeof realFetch !== 'function') return;
  globalThis.fetch = async function (url, init) {
    try {
      if (!isBannedChatCall(url)) return realFetch.apply(this, arguments);
      var parsed = null;
      try { parsed = init && init.body ? JSON.parse(init.body) : null; } catch (e) { parsed = null; }
      var msgs = (parsed && Array.isArray(parsed.messages)) ? parsed.messages : null;
      if (!msgs) return jsonResponse({ error: { message: 'banned_provider_blocked_at_boundary', host: String(url) } }, 403);
      var system = '', user = '';
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i] || {};
        var c = typeof m.content === 'string' ? m.content
          : (Array.isArray(m.content) ? m.content.map(function (p) { return p && p.text ? p.text : ''; }).join('\n') : '');
        if (m.role === 'system') system += (system ? '\n' : '') + c; else user += (user ? '\n' : '') + c;
      }
      var wantsJson = !!(parsed && parsed.response_format && parsed.response_format.type === 'json_object');
      var out = await ladder.deliberate(system, user, {
        max_tokens: (parsed && parsed.max_tokens) || 1000,
        temperature: (parsed && typeof parsed.temperature === 'number') ? parsed.temperature : 0.4,
        json: wantsJson, timeout: 30000
      });
      var text = out && out.content != null ? out.content : (typeof out === 'string' ? out : '');
      return jsonResponse(chatEnvelope(text));
    } catch (e) {
      return jsonResponse({ error: { message: 'provider_boundary_error: ' + String(e && e.message || e) } }, 502);
    }
  };
  globalThis.__providerBoundaryInstalled = true;
}

module.exports = { install: install, isBannedChatCall: isBannedChatCall, BANNED_HOSTS: BANNED_HOSTS };
