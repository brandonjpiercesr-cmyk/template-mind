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
var crypto = require('node:crypto');
var openrouterSeatSpend = require('./openrouter.seat.spend.js');

var BANNED_HOSTS = [
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.x.ai'
];

// \u2b21B:core.provider_boundary:FIX:meter_paid_providers_at_the_one_door:20260720\u2b21
// FOUNDER 911 20260720: the boundary rerouted BANNED hosts through the ladder, but it
// let direct calls to the four PAID approved providers (Together, OpenRouter, RunPod,
// Anthropic)
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
  'api.anthropic.com',
  'api.runpod.ai',
  'api.runpod.io',
  'api.elevenlabs.io',
  'api.deepgram.com',
  'fal.run',
  'queue.fal.run',
  'api.replicate.com',
  'api.simli.ai',
  'api.liveavatar.com'
];

function requestUrl(value) {
  if (value && typeof value === 'object' && typeof value.url === 'string') return value.url;
  return String(value || '');
}

function headerValue(init,name) {
  var headers=init&&init.headers,wanted=String(name||'').toLowerCase(),value='';
  if(headers&&typeof headers.get==='function')value=headers.get(name)||'';
  else if(Array.isArray(headers)){
    var row=headers.find(function(pair){return Array.isArray(pair)&&
      String(pair[0]).toLowerCase()===wanted;});value=row&&row[1]||'';
  }else if(headers&&typeof headers==='object'){
    var key=Object.keys(headers).find(function(item){return item.toLowerCase()===wanted;});
    value=key?headers[key]:'';
  }
  return String(value||'').trim();
}

function sameCredential(left,right){
  var a=Buffer.from(String(left||'').trim()),b=Buffer.from(String(right||'').trim());
  return a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function sharedProviderCredential(url,init,env){
  var u=requestUrl(url),runtime=env||process.env,provider='',envName='',supplied='';
  if(/api\.together\.(?:ai|xyz)/.test(u)){provider='together';envName='TOGETHER_API_KEY';}
  else if(/api\.runpod\.(?:ai|io)/.test(u)){provider='runpod';envName='RUNPOD_API_KEY';}
  else if(/api\.anthropic\.com/.test(u)){provider='anthropic';envName='ANTHROPIC_API_KEY';}
  else return null;
  supplied=provider==='anthropic'?headerValue(init,'x-api-key'):
    headerValue(init,'authorization').replace(/^Bearer\s+/i,'').trim();
  return sameCredential(supplied,runtime[envName])?{provider:provider,env:envName}:null;
}

function isBannedChatCall(url) {
  var u = requestUrl(url);
  for (var i = 0; i < BANNED_HOSTS.length; i++) {
    if (u.indexOf(BANNED_HOSTS[i]) !== -1) return true;
  }
  return false;
}

function paidCallKind(url) {
  var u = requestUrl(url);
  var kind = null;
  // Meter only actual provider work, never account, model-list, status, or
  // health reads. Audio transcription and embeddings are paid egress too even
  // though they do not use a chat-completions path.
  if (u.indexOf('chat/completions') !== -1 || u.indexOf('/run') !== -1 ||
      u.indexOf('/runsync') !== -1 || /\/v1\/messages(?:[/?]|$)/.test(u)) kind = 'text';
  else if (/\/audio\/(?:transcriptions|translations)(?:[/?]|$)/.test(u)) kind = 'audio';
  else if (/\/v1\/(?:speech-to-text|text-to-dialogue)(?:[/?]|$)/.test(u) ||
      /\/v1\/text-to-speech\//.test(u) || /\/v1\/listen(?:[/?]|$)/.test(u)) kind = 'audio';
  else if (/\/embeddings(?:[/?]|$)/.test(u)) kind = 'embedding';
  else if (/\/images\/generations(?:[/?]|$)/.test(u) ||
      (/fal\.run\//.test(u) && !/\/requests\//.test(u) &&
        /(?:flux|recraft|stable-diffusion|sdxl|ideogram)/i.test(u))) kind = 'image';
  else if ((/fal\.run\//.test(u) && !/\/requests\//.test(u)) ||
      /api\.replicate\.com\/v1\/models\/[^/]+\/[^/]+\/predictions(?:[/?]|$)/.test(u) ||
      /api\.simli\.ai\/(?:startAudioToVideoSession|static\/audio)(?:[/?]|$)/.test(u) ||
      /api\.liveavatar\.com\/v1\/sessions\/token(?:[/?]|$)/.test(u)) kind = 'video';
  if (!kind) return null;
  for (var i = 0; i < METERED_PAID_HOSTS.length; i++) {
    if (u.indexOf(METERED_PAID_HOSTS[i]) !== -1) return kind;
  }
  return null;
}

function isMeteredPaidCall(url) {
  return paidCallKind(url) !== null;
}

function jsonResponse(obj, status) {
  var body = JSON.stringify(obj);
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function codaAttemptReason(reason) {
  if (reason === 'paid_provider_attempt_budget_exhausted') {
    return 'coda_paid_provider_attempt_budget_exhausted';
  }
  return 'coda_paid_provider_attempt_budget_invalid';
}

function codaAttemptRefusal(reason, url) {
  var mapped = codaAttemptReason(reason);
  return jsonResponse({ error: { message:mapped, reason:mapped, host:requestUrl(url) } }, 429);
}

function spendGuardRefusal(url) {
  return jsonResponse({ error: { message:'spend_guard_unavailable_at_boundary',
    reason:'spend_guard_unavailable_at_boundary',host:requestUrl(url) } }, 503);
}

// A cheap preflight keeps a normal N+1 refusal from consuming a daily slot.
// reserveProviderAttempt remains the authority and revalidates the whole ticket
// synchronously after the daily guard, immediately before realFetch.
function obviousScopeRefusal(scope) {
  if (!scope || typeof scope !== 'object' || !scope.ticket ||
      !Number.isInteger(scope.ticket.remaining_paid_provider_attempts)) {
    return 'paid_provider_attempt_budget_invalid';
  }
  if (scope.ticket.remaining_paid_provider_attempts <= 0) {
    return 'paid_provider_attempt_budget_exhausted';
  }
  if (scope.count_model_calls === true &&
      (!Number.isInteger(scope.ticket.remaining_llm_calls) ||
       scope.ticket.remaining_llm_calls <= 0)) {
    return 'paid_provider_attempt_budget_exhausted';
  }
  return null;
}

function seatSpendRefusal(result, url) {
  var status = result && result.status === 429 ? 429 : 503;
  return jsonResponse({error:{message:result.reason,reason:result.reason,
    seat:result.seat || null,usage_daily_usd:Number.isFinite(result.usageDailyUsd)
      ? result.usageDailyUsd : null,daily_cap_usd:Number.isFinite(result.capUsd)
      ? result.capUsd : null,retry_at:result.retryAt || null,
    host:requestUrl(url)}},status);
}

function validProviderBudgetAuthority(value) {
  return !!(value && typeof value.currentProviderScope === 'function' &&
    typeof value.reserveProviderAttempt === 'function' &&
    typeof value.settleProviderAttempt === 'function');
}

async function performPaidEgress(fetchThis, fetchArgs, url, paidKind, realFetch,
  providerBudgetAuthority) {
  var providerScope;
  if (providerBudgetAuthority != null &&
      !validProviderBudgetAuthority(providerBudgetAuthority)) {
    return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
  }
  if (providerBudgetAuthority) {
    try {
      providerScope = providerBudgetAuthority.currentProviderScope();
    } catch (eScope) {
      return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
    }
  }
  if (providerScope) {
    var earlyRefusal = obviousScopeRefusal(providerScope);
    if (earlyRefusal) return codaAttemptRefusal(earlyRefusal, url);

    var scopedAllowed;
    try {
      scopedAllowed = require('./spend.guard.js').allow(paidKind, {egress:true});
    } catch (eScopedGuard) {
      return spendGuardRefusal(url);
    }
    if (!scopedAllowed) {
      return jsonResponse({ error: { message: 'daily_spend_ceiling_reached_at_boundary',
        host: requestUrl(url) } }, 429);
    }

    var reservation;
    try {
      reservation = providerBudgetAuthority.reserveProviderAttempt({
        url:requestUrl(url), purpose:'provider.boundary.egress'
      });
    } catch (eReserve) {
      return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
    }
    if (!reservation || reservation.ok !== true || reservation.scoped !== true) {
      return codaAttemptRefusal(reservation && reservation.reason, url);
    }

    try {
      var scopedResponse = await realFetch.apply(fetchThis, fetchArgs);
      try {
        providerBudgetAuthority.settleProviderAttempt(reservation, {
          status_code:scopedResponse && scopedResponse.status,
          ok:!!(scopedResponse && scopedResponse.ok)
        });
      } catch (eSettle) {
        return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
      }
      return scopedResponse;
    } catch (eScopedFetch) {
      try {
        providerBudgetAuthority.settleProviderAttempt(reservation, {
          ok:false,error:String(eScopedFetch && eScopedFetch.message || eScopedFetch)
        });
      } catch (eSettleFailure) {
        return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
      }
      throw eScopedFetch;
    }
  }

  try {
    var allowed = require('./spend.guard.js').allow(paidKind, {egress:true});
    if (!allowed) {
      return jsonResponse({ error: { message: 'daily_spend_ceiling_reached_at_boundary',
        host: requestUrl(url) } }, 429);
    }
  } catch (eGuard) {
    return spendGuardRefusal(url);
  }
  return realFetch.apply(fetchThis, fetchArgs);
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

function install(options) {
  var installOptions=options||{};
  var providerBudgetAuthority=installOptions.providerBudgetAuthority || null;
  if(installOptions.denyPaidEgress===true){
    globalThis.__providerBoundaryDenyPaidEgress=true;
  }
  if (globalThis.__providerBoundaryInstalled) return;
  var realFetch = globalThis.fetch;
  if (typeof realFetch !== 'function') return;

  globalThis.fetch = async function (url, init) {
    try {
      if (!isBannedChatCall(url)) {
        // Metered paid provider: enforce the daily spend guard before the call leaves,
        // so direct fetches inherit the same brake the ladder has. Not rerouted, not
        // altered -- just gated. A tripped guard returns a 429 the caller treats as a miss.
        // ⬡COLD:act:tag:PROVIDER_SPEND_ATTRIBUTION:20260723⬡
        // CATHY.SHADOW cold-audit COLD-ANEW-LADDER-0008. The outbound-fetch spend boundary: a
        // metered paid provider call inherits the same daily brake the ladder has before the
        // bytes leave. Cold gate, not rerouted or altered; a tripped guard is a 429 miss.
        var paidKind = paidCallKind(url);
        if (paidKind) {
          if(globalThis.__providerBoundaryDenyPaidEgress===true){
            return jsonResponse({error:{message:'face_paid_provider_egress_forbidden',
              reason:'face_paid_provider_egress_forbidden',host:requestUrl(url)}},403);
          }
          var sharedCredential=sharedProviderCredential(url,init);
          if(sharedCredential)return jsonResponse({error:{
            message:'anonymous_shared_provider_key_forbidden',
            reason:'anonymous_shared_provider_key_forbidden',provider:sharedCredential.provider,
            host:requestUrl(url)}},429);
          var fetchThis = this;
          var fetchArgs = arguments;
          var guarded = await openrouterSeatSpend.run(url, init, realFetch,
            function () {
              return performPaidEgress(fetchThis, fetchArgs, url, paidKind, realFetch,
                providerBudgetAuthority);
            });
          if (guarded.blocked) return seatSpendRefusal(guarded, url);
          return guarded.response;
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

module.exports = { install: install, isBannedChatCall: isBannedChatCall,
  isMeteredPaidCall: isMeteredPaidCall, paidCallKind: paidCallKind,
  sharedProviderCredential:sharedProviderCredential,
  validProviderBudgetAuthority:validProviderBudgetAuthority,
  performPaidEgress:performPaidEgress,
  BANNED_HOSTS: BANNED_HOSTS, METERED_PAID_HOSTS: METERED_PAID_HOSTS };
