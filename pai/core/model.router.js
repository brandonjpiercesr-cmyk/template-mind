// ⬡B:core.model.router:MODULE:multi_provider_penny_hustle:20260616⬡
// ⬡B:core.model.router:FIX:silent_deepseek_fallback_now_requires_opt_in:20260701⬡
// ⬡B:core.model.router:FIX:deepseek_removed_together_added_env_first:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (every gated turn's model resolves here)
// 20260706 migration, deadline-driven: the deepseek-chat/deepseek-reasoner
// aliases die 20260724, and DeepSeek V4 is on the banned list regardless, so
// the provider block is REMOVED, not renamed. Together.ai (the sanctioned C2
// fallback) takes its place in the explicit opt-in chain. The Groq map is now
// env-first (GROQ_MODEL_C1/C2 already live in the env group) with
// post-retirement literals as the net: llama-3.1-8b-instant and
// llama-3.3-70b-versatile die 20260816; mixtral-8x7b-32768 and
// deepseek-r1-distill-llama-70b were already retired upstream.
// Multi-provider model router -- the penny hustle engine.
// Groq always active (GROQ_API_KEY). Together and OpenRouter activate on
// their own keys, real fallback options, not banned in autonomous loops --
// the corrected 20260708 philosophy, confirmed directly by the founder:
// no provider is banned, the model is never the problem, the bleed (a loop
// firing repeatedly with no watermark) is the real enemy. Swap models/keys
// freely for better/cheaper.
// Doctrine tier assignment: C0=none C1=8b-gate C2=mid-organ C3=best-mind C4=8b-watch
//
// CLAIR fix: getProviderName() was already corrected 20260630 to try Groq
// first (a real, verified fix by a parallel session -- confirmed, not redone).
// What remained: if GROQ_API_KEY is simply absent (a wiped env var, a
// misconfigured service), this function still silently escalated straight
// to DeepSeek's direct API with zero distinction between an autonomous PAI
// cycle and a real user's last-resort fallback. That silent escalation is
// the same shape of bug already fixed once for OpenRouter -- now closed the
// same way for DeepSeek: a missing key with no explicit opt-in returns no
// provider and throws, instead of quietly degrading to a banned-in-autonomous
// path. A caller that genuinely wants the last-resort fallback (real user
// text, no other option) must now say so explicitly via allowFallback:true.

var PROVIDERS = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    models: {
      c1_gate:  process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b',
      c2_organ: process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b',
      c2_deep:  process.env.GROQ_MODEL_C2_DEEP || 'openai/gpt-oss-120b',
      c3_mind:  process.env.GROQ_MODEL_C3 || process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b',
      c4_watch: process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b'
    }
  },
  together: {
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    keyEnv: 'TOGETHER_API_KEY',
    models: {
      c1_gate:  process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      c2_organ: process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      c2_deep:  process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      c3_mind:  process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      c4_watch: process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8'
    }
  },
  anthropic_bleed: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    // L3 BLEED: two live backup keys, one per category, live-tested 20260706.
    // Haiku carries C0/C1, Sonnet5 carries C2/C3. Key chosen per tier at
    // resolve time. Opus coding and Opus C3-escalation categories have NO
    // keys yet; that gap is stamped in the merit directory, founder action.
    keyEnv: 'ANTHROPIC_BACKUP_C2_SONNET5',
    keyEnvByTier: { c1: 'ANTHROPIC_BACKUP_C0C1_HAIKU', c4: 'ANTHROPIC_BACKUP_C0C1_HAIKU', c3: 'ANTHROPIC_BACKUP_OPUS_C3' },
    models: {
      c1_gate:  process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5',
      c2_organ: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6',
      c2_deep:  process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6',
      c3_mind:  process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-8',
      c4_watch: process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5'
    }
  },
  openrouter: {
    // ⬡B:core.model.router:FIX:openrouter_restored_founder_confirmed:20260709⬡
    // Removed 20260706 on the belief OpenRouter was banned in autonomous
    // loops. That belief was stale -- founder confirmed directly 20260709:
    // no provider is banned, the real enemy is bleed, never the provider.
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    models: {
      // ⬡B:core.model.router:FIX:scrub_banned_deepseek_defaults_to_approved_glm:20260721⬡
      // The groq/together blocks above were cleaned to GLM-5.2 defaults, but when
      // OpenRouter was restored (20260709) this block kept its banned deepseek
      // defaults. DeepSeek is perma-banned and routed through the *permitted*
      // OpenRouter host, so the host-level provider gate never catches it — a live
      // ENV override was the only thing standing between the founder and a banned
      // fallback. Per founder doctrine ("fix what reaches the cap, not the cap"),
      // the wiring itself must never fall back to a banned provider: defaults are
      // now the approved open-weight GLM, so an unset env can never wake DeepSeek.
      c1_gate:  process.env.OPENROUTER_MODEL_C1 || 'meta-llama/llama-3.1-8b-instruct',
      c2_organ: process.env.OPENROUTER_MODEL_C2 || 'z-ai/glm-5.2',
      c2_deep:  process.env.OPENROUTER_MODEL_C2_DEEP || 'z-ai/glm-5.2',
      c3_mind:  process.env.OPENROUTER_MODEL_C3 || 'qwen/qwen-2.5-72b-instruct',
      c4_watch: process.env.OPENROUTER_MODEL_C1 || 'meta-llama/llama-3.1-8b-instruct'
    }
  }
};

// ⬡B:core.model.router:WIRE:c_tier_resolves_through_the_one_seat_map:20260722⬡
// Founder ruling 20260722 (B, full runtime adoption): the C-tier draws its model,
// provider, and named key from pai/core/seat.map.js, the ONE source shared across
// every world, so the live mind is Grok 4.5 (c3) and the everyday organ is
// MiniMax-01 (c2). resolve()/chat() consult the seat first; the legacy provider
// chain stays as the zero-regression net, so a seat with no routable key degrades
// to exactly today's behavior and an un-provisioned seat is never silent.
var seatMap = require('./seat.map.js');
var TIER_SEAT = { c1: 'c1_cellm', c2: 'c2_organ', c2_deep: 'c2_organ', c3: 'c3_mind', c4: 'c4_watch' };
var SEAT_ENDPOINT = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  together:   'https://api.together.xyz/v1/chat/completions'
};
function seatResolveFor(s) {
  if (!s) return null;
  var endpoint = SEAT_ENDPOINT[s.provider];
  if (!endpoint) return null;
  var apiKey = seatMap.resolveKey(s);
  if (!apiKey) return null;
  var providerName = s.provider === 'openrouter' ? 'openrouter' : 'together';
  return { model: s.model, endpoint: endpoint, apiKey: apiKey, providerName: providerName };
}
function seatResolve(tier) {
  var name = TIER_SEAT[tier];
  return name ? seatResolveFor(seatMap.seat(name)) : null;
}
function seatFallback(tier) {
  var name = TIER_SEAT[tier];
  return name ? seatResolveFor(seatMap.fallback(name)) : null;
}

function getProviderName(opts) {
  if (process.env.GROQ_API_KEY) return 'groq';
  // Groq is missing. Only fall through to a paid/banned-in-autonomous
  // provider if the caller explicitly authorized it. No implicit escalation.
  var allowFallback = !!(opts && opts.allowFallback);
  if (!allowFallback) return null;
  if (process.env.TOGETHER_API_KEY) return 'together';
  // ⬡B:core.model.router:FIX:anthropic_floor_off_unless_explicitly_armed:20260722⬡
  // COST AUDIT follow-up (founder 911 20260722): 'anthropic_bleed' is the closed-weight floor and
  // it bled -- an open-weight outage silently fell through to claude-sonnet-4-6, against the house
  // law that Anthropic is CODA + cook-off ONLY. A key being present must not arm it; require an
  // explicit ANTHROPIC_BACKUP_FLOOR=on. Off by default -> the outage degrades to null (ok:false).
  if (process.env.ANTHROPIC_BACKUP_FLOOR === 'on' && (process.env.ANTHROPIC_BACKUP_C2_SONNET5 || process.env.ANTHROPIC_BACKUP_C0C1_HAIKU)) return 'anthropic_bleed';
  // OpenRouter removed from this router entirely, 20260706: CANON holds the
  // provider pattern at HOLD severity for autonomous-capable paths, and no
  // live caller of this router carries a real-user-turn assertion. The
  // real-user last-resort fallback lives at the reach layer, not here.
  return null;
}

function resolve(tier, opts) {
  // Seat map is the one source: try the tier's seat first, then the legacy chain
  // as the zero-regression net when the seat has no routable key.
  var s = seatResolve(tier);
  if (s) return s;
  var name = getProviderName(opts);
  if (!name) return null;
  var provider = PROVIDERS[name];
  var key = process.env[provider.keyEnv];
  if (!key) return null;
  var slotMap = { c0:null, c1:'c1_gate', c2:'c2_organ', c2_deep:'c2_deep', c3:'c3_mind', c4:'c4_watch' };
  var slot = slotMap[tier] || 'c1_gate';
  if (!slot) return null;
  var model = process.env['ANEW_MODEL_' + tier.toUpperCase()] || provider.models[slot];
  if (provider.keyEnvByTier && provider.keyEnvByTier[tier] && process.env[provider.keyEnvByTier[tier]]) {
    key = process.env[provider.keyEnvByTier[tier]];
  }
  return { model:model, endpoint:provider.endpoint, apiKey:key, providerName:name };
}

async function _attempt(r, messages, opts) {
  var isAnthropic = r.providerName === 'anthropic_bleed';
  var sysMsg = null, rest = messages;
  if (isAnthropic && messages.length && messages[0].role === 'system') {
    sysMsg = messages[0].content; rest = messages.slice(1);
  }
  var body = isAnthropic
    ? { model:r.model, messages:rest, max_tokens:(opts&&opts.maxTokens)||2000 }
    : { model:r.model, messages:messages, max_tokens:(opts&&opts.maxTokens)||2000 };
  if (isAnthropic && sysMsg) body.system = sysMsg;
  if (opts && opts.temperature !== undefined) body.temperature = opts.temperature;
  var hdrs = isAnthropic
    ? { 'x-api-key':r.apiKey, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json' }
    : { 'Authorization':'Bearer '+r.apiKey, 'Content-Type':'application/json' };
  if (r.providerName === 'openrouter') {
    hdrs['HTTP-Referer'] = process.env.SELF_BASE_URL || process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
    hdrs['X-Title'] = 'ANEW Envolve';
  }
  var resp = await fetch(r.endpoint, { method:'POST', headers:hdrs, body:JSON.stringify(body) });
  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error(r.providerName + '/' + r.model + ': ' + errText.slice(0,120));
  }
  var out = await resp.json();
  if (isAnthropic && out && out.content) {
    var text = (out.content || []).map(function(c){ return c.text || ''; }).join('');
    return { choices: [{ message: { role: 'assistant', content: text } }], usage: out.usage, _provider: 'anthropic_bleed' };
  }
  return out;
}

async function chat(tier, messages, opts) {
  // Try the tier's resolved primary (the seat when keyed, else the legacy
  // provider), then the seat's own failover (Grok mind -> GLM-5.2), so a seat
  // miss never leaves the tier unanswered. The chain is exactly today's single
  // shot when no seat is keyed, so this only adds a live failover, never removes one.
  var chain = [];
  var primary = resolve(tier, opts);
  if (primary) chain.push(primary);
  var sf = seatFallback(tier);
  if (sf) chain.push(sf);
  if (!chain.length) throw new Error('No provider available for tier ' + tier + ' -- no seat key, GROQ_API_KEY missing and no allowFallback opt-in given. This is a fail-loud by design, not a bug.');
  var lastErr = null;
  for (var i = 0; i < chain.length; i++) {
    try { return await _attempt(chain[i], messages, opts); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All providers failed for tier ' + tier);
}

function modelForDepth(depth, opts) {
  if (depth <= 0) return null;
  var tier = depth === 1 ? 'c1' : depth === 2 ? 'c2' : depth === 3 ? 'c3' : 'c4';
  var r = resolve(tier, opts);
  return r ? r.model : null;
}

module.exports = { resolve:resolve, chat:chat, modelForDepth:modelForDepth, getProviderName:getProviderName, PROVIDERS:PROVIDERS, seatResolve:seatResolve, seatFallback:seatFallback };
