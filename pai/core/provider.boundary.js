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
      // \u2b21B:pai.core.provider_boundary:911:preserve_tools_her_brain_was_decapitated:20260718\u2b21
      // FOUNDER 911, root-caused live 20260718: her tool loop's PRIMARY model call carries
      // body.tools -- the entire loop depends on the model returning tool_calls to fire
      // find_in_brain, consult_coda, consult_mace, etc. When GROQ_API_KEY was pulled, this
      // boundary rerouted that call through ladder.deliberate(), which does PLAIN TEXT ONLY
      // and DROPS the tools. So since the key pull, every tool-bearing turn lost its tools
      // and got prose back with no tool_calls. On easy questions the prose was a usable
      // answer; on HARD questions the ladder's GLM rung truncated to empty, the loop hit
      // ans='' and broke, and the turn died no_answer on iteration 1. Her tool-calling brain
      // was decapitated. That is the real 911 behind 'she goes dumb on hard questions.'
      // Fix: if the request carries tools, forward the WHOLE request to OpenRouter Qwen,
      // which supports tool_calls natively (verified live: it returned a real nash_sports
      // call). Tools preserved, the loop works exactly as it did on Groq. Only tool-FREE
      // deliberation flattens through the ladder.
      var _hasTools = !!(parsed && Array.isArray(parsed.tools) && parsed.tools.length);
      if (_hasTools && process.env.OPENROUTER_API_KEY) {
        var _fwd = {
          model: process.env.QWEN_TOOL_MODEL || process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b',
          messages: parsed.messages,
          tools: parsed.tools,
          max_tokens: parsed.max_tokens || 1500,
          temperature: (typeof parsed.temperature === 'number') ? parsed.temperature : 0.3
        };
        // \u2b21B:pai.core.provider_boundary:911:qwen_rejects_forced_tool_choice_normalize_to_auto:20260718\u2b21
        // Verified live 20260718: OpenRouter Qwen accepts tool_choice 'auto' (and returns
        // real tool_calls) but returns HTTP 400 on 'required' or a forced specific tool.
        // Her loop FORCES specific tools (find_in_brain, nash_sports, roadmap activation).
        // Passing that forced choice straight through 400'd every forced-tool turn, the
        // boundary fell through to the plain-text ladder, GLM truncated, and the turn died
        // no_answer with tools_used [] -- she called no tool at all. THIS was the live
        // decapitation, not just the tool-drop. Normalize any incompatible forced choice to
        // 'auto': Qwen still calls the tool the prompt demands, it just is not forced. The
        // system note her loop already injects ('you MUST call X') carries the intent.
        if (parsed.tool_choice) {
          var _tc = parsed.tool_choice;
          if (_tc === 'auto' || _tc === 'none') _fwd.tool_choice = _tc;
          else _fwd.tool_choice = 'auto'; // 'required' or a forced {function:...} -> auto
        }
        if (parsed.response_format) _fwd.response_format = parsed.response_format;
        var _tr = await realFetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(_fwd),
          signal: AbortSignal.timeout(45000)
        });
        var _td = await _tr.json();
        if (_td && _td.choices) { _td._rerouted_from_banned_provider = true; return jsonResponse(_td); }
        // Qwen tool call failed; fall through to plain-text ladder rather than die.
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
