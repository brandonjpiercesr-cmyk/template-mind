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

function publicTarget(value) {
  try {
    var parsed = new URL(requestUrl(value));
    return parsed.hostname.toLowerCase() + parsed.pathname;
  } catch (error) { return 'invalid_provider_target'; }
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
  return jsonResponse({ error: { message:mapped, reason:mapped, host:publicTarget(url) } }, 429);
}

function spendGuardRefusal(url) {
  return jsonResponse({ error: { message:'spend_guard_unavailable_at_boundary',
    reason:'spend_guard_unavailable_at_boundary',host:publicTarget(url) } }, 503);
}

function spendReceiptRefusal(reason, url, status) {
  var named = String(reason || 'provider_spend_receipt_unavailable').slice(0, 160);
  return jsonResponse({error:{message:named,reason:named,host:publicTarget(url)}},status || 503);
}

// A cheap preflight keeps a normal N+1 refusal from consuming a daily slot.
// reserveProviderAttempt remains the authority and revalidates the whole ticket
// synchronously after the daily guard, immediately before realFetch.
function obviousScopeRefusal(scope) {
  if (!scope || typeof scope !== 'object' || !scope.ticket) {
    return 'paid_provider_attempt_budget_invalid';
  }
  if (scope.ticket.unlimited_paid_provider_attempts !== true &&
      !Number.isInteger(scope.ticket.remaining_paid_provider_attempts)) {
    return 'paid_provider_attempt_budget_invalid';
  }
  if (scope.ticket.unlimited_paid_provider_attempts !== true &&
      scope.ticket.remaining_paid_provider_attempts <= 0) {
    return 'paid_provider_attempt_budget_exhausted';
  }
  if (scope.count_model_calls === true && scope.ticket.unlimited_llm_calls !== true &&
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
    host:publicTarget(url)}},status);
}

function validProviderBudgetAuthority(value) {
  return !!(value && typeof value.currentProviderScope === 'function' &&
    typeof value.reserveProviderAttempt === 'function' &&
    typeof value.settleProviderAttempt === 'function');
}

function providerAttribution(spendGuard, env) {
  var runtime = env || process.env;
  var value = spendGuard.currentAttribution();
  // runPAI already supplies exact HAM/cycle/request/component. The registry names the owner
  // of that component unambiguously, so the paid door completes those two canonical registry
  // addresses here rather than asking every raw provider caller to duplicate them.
  if (/^pai(?:\.|$)/.test(String(value.component || ''))) {
    if (!value.owner_node_id) value.owner_node_id = 'station.pai';
    if (!value.target_wonder_id) value.target_wonder_id = 'wonder.anu';
  }
  if (!value.service_id) value.service_id = String(runtime.RENDER_SERVICE_ID ||
    runtime.ANEW_SERVICE_ID || '').trim();
  return value;
}

function agentFindRefusal(reason,url) {
  return jsonResponse({error:{message:reason || 'agent_find_provider_bind_failed',
    reason:reason || 'agent_find_provider_bind_failed',host:publicTarget(url)}},503);
}

function applyAgentFindAppendix(init,appendix) {
  var body;
  try { body=init&&init.body?JSON.parse(init.body):null; }
  catch (error) { body=null; }
  if(!body||!Array.isArray(body.messages)||!String(appendix||'').trim())return init;
  return Object.assign({},init,{body:JSON.stringify(Object.assign({},body,{messages:[
    {role:'system',content:String(appendix).trim()}].concat(body.messages)}))});
}

async function bindAgentFindRequest(url,init,env,capability) {
  var body;
  try { body=init&&init.body?JSON.parse(init.body):null; }
  catch (error) { body=null; }
  // Agent FIND governs seated language-model deliberation. Image, audio, embeddings, and
  // provider control-plane reads have no messages and are not allowed to fake a model seat.
  if (!body || !Array.isArray(body.messages)) return {ok:true,bound:false,init:init};
  var spendGuard;
  try { spendGuard=require('./spend.guard.js'); }
  catch (error) { return {ok:false,reason:'agent_find_spend_scope_unavailable'}; }
  var attribution=providerAttribution(spendGuard,env);
  var promptDigest=require('./agent.find.js').providerMessageDigest(body.messages);
  if(!promptDigest)return {ok:false,reason:'agent_find_provider_binding_invalid'};
  var prior=typeof spendGuard.currentAgentFindBinding==='function'
    ? spendGuard.currentAgentFindBinding(attribution):null;
  if(prior&&prior.readback_verified===true&&
      (prior.wall_scope==='full_fcw'||prior.context_sha256===promptDigest)){
    return {ok:true,bound:true,reused:true,init:init,truth_beacon:prior};
  }
  var binder=capability||require('./agent.find.js');
  if (!binder || typeof binder.bindProviderRequest!=='function') {
    return {ok:false,reason:'agent_find_provider_capability_unavailable'};
  }
  try {
    var key=[attribution.ham_uid,attribution.cycle_id,attribution.request_id,
      attribution.seat,attribution.owner_node_id,promptDigest].join('|');
    var bind=function(){return binder.bindProviderRequest({url:url,init:init,
      attribution:attribution,observed_at:new Date().toISOString()});};
    var result=typeof spendGuard.ensureAgentFindBinding==='function'
      ? await spendGuard.ensureAgentFindBinding(key,bind):await bind();
    if(result&&result.ok===true&&result.prompt_appendix){
      return Object.assign({},result,{init:applyAgentFindAppendix(init,result.prompt_appendix)});
    }
    return result;
  } catch (error) {
    return {ok:false,reason:'agent_find_provider_bind_failed'};
  }
}

async function performPaidEgress(fetchThis, fetchArgs, url, paidKind, realFetch,
  providerBudgetAuthority, receiptStore, requestInit, env) {
  var spendGuard;
  try { spendGuard = require('./spend.guard.js'); }
  catch (eSpendModule) { return spendGuardRefusal(url); }
  var store = receiptStore || require('./provider.spend.receipt.js');
  if (!store || typeof store.prepare !== 'function' ||
      typeof store.claimIntent !== 'function' || typeof store.writeTerminal !== 'function' ||
      typeof store.reconcileUnresolved !== 'function' ||
      typeof store.terminalFromResponse !== 'function' || typeof store.terminalFromError !== 'function') {
    return spendReceiptRefusal('provider_spend_receipt_store_invalid',url);
  }
  var activeHold = typeof spendGuard.paidEgressHold === 'function'
    ? spendGuard.paidEgressHold() : null;
  if (activeHold) return spendReceiptRefusal(activeHold,url);
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
  }
  // The environment supplies only the numeric policy. Memory Bank owns the atomic decision;
  // no process-local counter is allowed to arbitrate a shared daily slot.
  var ceilingDetail;
  try {
    ceilingDetail = spendGuard.ceilDetail(paidKind);
  } catch (eGuard) {
    return spendGuardRefusal(url);
  }
  if (!ceilingDetail || !Number.isInteger(ceilingDetail.value)) {
    return spendReceiptRefusal('daily_spend_ceiling_configuration_invalid',url);
  }
  // ⬡B:core.provider_boundary:FIX:an_unlimited_ceiling_cannot_travel_as_a_giant_integer:20260801⬡
  // CATHY (Codex) review, 20260801: `core/spend.guard.js` reports an unconfigured call
  // ceiling as `{value: EXACT_INTEGER_EDGE, unlimited: true}`, the arithmetic edge standing
  // in only because SOME downstream contracts need an integer rather than an absence. This
  // door read only `.value` and forwarded it unchanged, so a founder who configured NO
  // ceiling (the whole point of that PR) got every paid call refused the instant the durable
  // claim's own numeric bound (now the Postgres `integer` column's real max, see
  // core/provider.spend.receipt.js) was smaller than the sentinel. `unlimited` is the
  // authority here, not the number beside it: an unlimited ceiling now travels as an explicit
  // null plus its own flag, matching what core/provider.spend.receipt.js and the RPC now do
  // with it, and a real founder-chosen number of any size still travels exactly as typed.
  var ceilingUnlimited = ceilingDetail.unlimited === true;
  var ceilingForClaim = ceilingUnlimited ? null : ceilingDetail.value;

  var predictedAttempt = providerScope
    ? Number(providerScope.ticket.used_paid_provider_attempts || 0) + 1
    : (typeof spendGuard.nextProviderAttemptOrder === 'function'
      ? spendGuard.nextProviderAttemptOrder() : null);
  var prepared;
  try {
    prepared = store.prepare({url:url,init:requestInit,kind:paidKind,
      attribution:providerAttribution(spendGuard,env),attempt_order:predictedAttempt,
      env:env || process.env});
  } catch (ePrepare) { prepared = {ok:false,reason:'provider_spend_attribution_invalid'}; }
  if (!prepared || prepared.ok !== true || !prepared.receipt) {
    return spendReceiptRefusal(prepared && prepared.reason,url);
  }

  var reservation = null;
  if (providerScope) {
    try {
      reservation = providerBudgetAuthority.reserveProviderAttempt({
        url:requestUrl(url),purpose:'provider.boundary.egress'
      });
    } catch (eReserve) {
      return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
    }
    if (!reservation || reservation.ok !== true || reservation.scoped !== true) {
      return codaAttemptRefusal(reservation && reservation.reason, url);
    }
    if (Number(reservation.attempt) !== predictedAttempt) {
      return codaAttemptRefusal('paid_provider_attempt_budget_invalid',url);
    }
  }

  var receiptOptions = {fetchImpl:realFetch,env:env || process.env,
    signal:requestInit && requestInit.signal,ceiling:ceilingForClaim,unlimited:ceilingUnlimited};
  // ⬡B:core.provider_boundary:FIX:the_provider_deadline_cannot_abort_its_own_terminal_receipt:20260730⬡
  // The provider signal governs only provider work. Once bytes may have left, terminal
  // accounting needs its own bounded bank deadline so an expiring model timeout cannot strand
  // a paid INTENT without a TERMINAL receipt.
  var terminalReceiptOptions = {fetchImpl:realFetch,env:env || process.env,
    signal:null,ceiling:ceilingForClaim,unlimited:ceilingUnlimited,
    receipt:prepared.receipt};
  var reconciled;
  var reconcileKey = [prepared.receipt.ham_uid,prepared.receipt.cycle_id,
    prepared.receipt.request_id].join('|');
  try {
    if (typeof spendGuard.ensurePaidReconciliation !== 'function') {
      reconciled = {ok:false,reason:'provider_spend_reconcile_scope_invalid'};
    } else {
      reconciled = await spendGuard.ensurePaidReconciliation(reconcileKey,function(){
        return store.reconcileUnresolved(prepared.receipt,receiptOptions);
      });
    }
  }
  catch (eReconcile) { reconciled = {ok:false,reason:'provider_spend_reconcile_failed'}; }
  if (!reconciled || reconciled.ok !== true || reconciled.outcome_unknown > 0 ||
      reconciled.resolved_unknown > 0 || reconciled.unresolved > 0 ||
      reconciled.stale_remaining === true) {
    var reconcileReason = !reconciled || reconciled.ok !== true
      ? reconciled && reconciled.reason || 'provider_spend_reconcile_failed'
      : (reconciled.outcome_unknown > 0 || reconciled.resolved_unknown > 0
        ? 'provider_spend_outcome_unknown_hold' : 'provider_spend_unresolved_attempt_hold');
    if (reservation) {
      try { providerBudgetAuthority.settleProviderAttempt(reservation,
        {ok:false,error:reconcileReason}); } catch (eReconcileSettle) {}
    }
    if (reconciled && reconciled.ok === true && typeof spendGuard.holdPaidEgress === 'function') {
      spendGuard.holdPaidEgress(reconcileReason);
    }
    return spendReceiptRefusal(reconcileReason,url);
  }

  var intent;
  try { intent = await store.claimIntent(prepared.receipt,receiptOptions); }
  catch (eIntent) { intent = {ok:false,reason:'provider_spend_intent_write_failed'}; }
  if (!intent || intent.ok !== true) {
    if (reservation) {
      try { providerBudgetAuthority.settleProviderAttempt(reservation,
        {ok:false,error:String(intent && intent.reason || 'provider_spend_intent_unverified')}); }
      catch (eIntentSettle) {}
    }
    if (intent && intent.reason === 'daily_spend_ceiling_reached') {
      if (typeof spendGuard.rememberDurableDenial === 'function') {
        spendGuard.rememberDurableDenial(paidKind,intent.admissions,intent.ceiling,
          'daily_call_ceiling_reached');
      }
      return jsonResponse({error:{message:'daily_spend_ceiling_reached_at_boundary',
        host:publicTarget(url)}},429);
    }
    if (typeof spendGuard.holdPaidEgress === 'function') {
      spendGuard.holdPaidEgress(String(intent && intent.reason ||
        'provider_spend_intent_unverified'));
    }
    return spendReceiptRefusal(intent && intent.reason,url);
  }

  // Local telemetry is deliberately non-authoritative and cannot revoke the committed slot.
  try {
    if (typeof spendGuard.recordAttemptTelemetry === 'function')
      spendGuard.recordAttemptTelemetry(paidKind);
  } catch (eRecord) {}

  var response;
  try { response = await realFetch.apply(fetchThis, fetchArgs); }
  catch (egressError) {
    var errorOutcome = store.terminalFromError(egressError);
    var errorTerminal;
    try { errorTerminal = await store.writeTerminal(prepared.receipt,errorOutcome,
      terminalReceiptOptions); }
    catch (eErrorTerminal) { errorTerminal = {ok:false}; }
    if (!errorTerminal || errorTerminal.ok !== true) {
      if (typeof spendGuard.holdPaidEgress === 'function')
        spendGuard.holdPaidEgress('provider_spend_terminal_unverified');
      if (reservation) {
        try { providerBudgetAuthority.settleProviderAttempt(reservation,
          {ok:false,error:'provider_spend_terminal_unverified'}); }
        catch (eNetworkSettle) {}
      }
      return spendReceiptRefusal('provider_spend_terminal_unverified',url);
    }
    if (reservation) {
      try { providerBudgetAuthority.settleProviderAttempt(reservation,
        {ok:false,error:String(egressError && egressError.message || egressError)}); }
      catch (eSettleFailure) {
        if (typeof spendGuard.holdPaidEgress === 'function')
          spendGuard.holdPaidEgress('provider_budget_terminal_unverified');
        return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
      }
    }
    if (errorOutcome && errorOutcome.disposition === 'OUTCOME_UNKNOWN') {
      if (typeof spendGuard.holdPaidEgress === 'function')
        spendGuard.holdPaidEgress('provider_spend_outcome_unknown_hold');
      return spendReceiptRefusal('provider_spend_outcome_unknown_hold',url);
    }
    throw egressError;
  }
  var outcome, terminal, callerResponse=response;
  try {
    // ⬡B:core.provider_boundary:FIX:durable_accounting_cannot_destroy_the_paid_answer:20260730⬡
    // Capture the provider bytes before terminal bank I/O can outlive the provider signal.
    // The terminal facts and the caller response come from that one capture, while the
    // detached replay remains readable after the original request deadline expires.
    if(typeof store.captureTerminalResponse==='function'){
      var captured=await store.captureTerminalResponse(response,terminalReceiptOptions);
      outcome=captured&&captured.outcome;
      callerResponse=captured&&captured.response||response;
      if(callerResponse!==response&&response&&response.body&&
          typeof response.body.cancel==='function')response.body.cancel().catch(function(){});
    }else{
      try{callerResponse=response.clone();}catch(eClone){callerResponse=response;}
      outcome = await store.terminalFromResponse(response,terminalReceiptOptions);
    }
    terminal = await store.writeTerminal(prepared.receipt,outcome,terminalReceiptOptions);
  } catch (eTerminalWrite) { terminal = {ok:false}; }
  if (!terminal || terminal.ok !== true) {
    if (typeof spendGuard.holdPaidEgress === 'function')
      spendGuard.holdPaidEgress('provider_spend_terminal_unverified');
    if (reservation) {
      try { providerBudgetAuthority.settleProviderAttempt(reservation,
        {status_code:response && response.status,ok:false,error:'provider_spend_terminal_unverified'}); }
      catch (eTerminalSettle) {}
    }
    return spendReceiptRefusal('provider_spend_terminal_unverified',url);
  }
  // The paid transport terminal is durable before any optional metadata work begins. A stalled
  // provider control-plane read can therefore neither strand the INTENT nor erase the answer.
  // OpenRouter's exact generation fact is then stored beside—not over—the immutable terminal.
  if(typeof store.recoverOpenRouterUsage==='function'){
    try{
      var recoveredOutcome=await store.recoverOpenRouterUsage(prepared.receipt,outcome,
        requestInit,terminalReceiptOptions);
      if(recoveredOutcome&&recoveredOutcome.provider_fact_digest&&
          typeof store.writeReconciliation==='function'){
        await store.writeReconciliation(prepared.receipt,recoveredOutcome,
          terminalReceiptOptions);
      }
    }catch(eProviderFact){}
  }
  // ElevenLabs reports billed characters in the successful response headers. Keep that exact
  // provider unit beside the immutable transport terminal, never turn subscription credits into
  // invented per-request USD. The same usage-fact writer is also used by delayed provider
  // control-plane recovery below.
  if(outcome&&outcome.provider_usage_fact&&
      typeof store.writeUsageReconciliation==='function'){
    try{await store.writeUsageReconciliation(prepared.receipt,outcome.provider_usage_fact,
      terminalReceiptOptions);}catch(eUsageFact){}
  }
  // A prior OpenRouter terminal whose generation fact was not ready on the immediate read
  // remains durable. Let this completed request trigger one same-seat, non-generative retry.
  // The work is detached so accounting cannot hold the paid answer; a crash is safe because
  // the immutable terminal remains eligible for a future organic request.
  if(typeof store.recoverDelayedOpenRouterCost==='function'){
    Promise.resolve().then(function(){
      return store.recoverDelayedOpenRouterCost(prepared.receipt,requestInit,
        terminalReceiptOptions);
    }).catch(function(){});
  }
  // An organic request drains at most one older same-provider, same-key terminal whose exact
  // usage was not available inline. ElevenLabs history and LiveAvatar historic sessions are
  // authenticated, non-generative provider facts. No timer, paid replay, or guessed rate exists.
  if(typeof store.recoverDelayedProviderUsage==='function'){
    Promise.resolve().then(function(){
      return store.recoverDelayedProviderUsage(prepared.receipt,requestInit,
        terminalReceiptOptions);
    }).catch(function(){});
  }
  if (reservation) {
    try {
      providerBudgetAuthority.settleProviderAttempt(reservation, {
        status_code:response && response.status,ok:!!(response && response.ok)
      });
    } catch (eSettle) {
      if (typeof spendGuard.holdPaidEgress === 'function')
        spendGuard.holdPaidEgress('provider_budget_terminal_unverified');
      return codaAttemptRefusal('paid_provider_attempt_budget_invalid', url);
    }
  }
  return callerResponse;
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
  var receiptStore=installOptions.receiptStore || require('./provider.spend.receipt.js');
  var receiptEnv=installOptions.env || process.env;
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
          var agentBinding=await bindAgentFindRequest(url,init,receiptEnv,
            installOptions.agentFindCapability);
          if(!agentBinding||agentBinding.ok!==true){
            return agentFindRefusal(agentBinding&&agentBinding.reason,url);
          }
          var paidInit=agentBinding.init||init;
          var paidFetchArgs=[url,paidInit];
          var fetchThis = this;
          var guarded = await openrouterSeatSpend.run(url, paidInit, realFetch,
            function () {
              return performPaidEgress(fetchThis, paidFetchArgs, url, paidKind, realFetch,
                providerBudgetAuthority,receiptStore,paidInit,receiptEnv);
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
        seat: 'deliberation',
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
  publicTarget:publicTarget,
  providerAttribution:providerAttribution,
  bindAgentFindRequest:bindAgentFindRequest,
  applyAgentFindAppendix:applyAgentFindAppendix,
  validProviderBudgetAuthority:validProviderBudgetAuthority,
  performPaidEgress:performPaidEgress,
  BANNED_HOSTS: BANNED_HOSTS, METERED_PAID_HOSTS: METERED_PAID_HOSTS };
