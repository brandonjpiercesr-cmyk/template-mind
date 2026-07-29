// ⬡B:tests.model_router_together_override:TEST:the_legacy_fallback_cannot_carry_a_banned_together_model:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON template-mind#322, P1: resolve()'s legacy
// provider chain (armed when a named seat has no routable key and the caller passes
// allowFallback) reads PROVIDERS.together.models straight through, and every one of
// those five slots used to read TOGETHER_MODEL raw with `||`, the exact vulnerable
// shape already fixed on the anew side at every TOGETHER_MODEL call site (anew#1346):
// a deployment with TOGETHER_MODEL=zai-org/GLM-5.2 still set reached this fallback
// unchecked. Fixed by routing the module's one Together model build through
// seatMap.safeModelOverride(), reused rather than re-derived.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function freshRouter() {
  delete require.cache[require.resolve('../pai/core/model.router.js')];
  delete require.cache[require.resolve('../pai/core/seat.map.js')];
  return require('../pai/core/model.router.js');
}

test('a founder-banned TOGETHER_MODEL override never reaches the legacy Together fallback', function () {
  const saved = process.env.TOGETHER_MODEL;
  process.env.TOGETHER_MODEL = 'zai-org/GLM-5.2';
  try {
    const router = freshRouter();
    const model = router.PROVIDERS.together.models.c2_organ;
    assert.ok(model, 'the together provider map is reachable for this test');
    assert.doesNotMatch(model, /glm-5\.2/i, 'a founder-banned override must not reach the legacy fallback model');
  } finally {
    if (saved === undefined) delete process.env.TOGETHER_MODEL; else process.env.TOGETHER_MODEL = saved;
    freshRouter();
  }
});

test('a real, non-banned TOGETHER_MODEL override still wins on the legacy fallback', function () {
  const saved = process.env.TOGETHER_MODEL;
  process.env.TOGETHER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
  try {
    const router = freshRouter();
    const model = router.PROVIDERS.together.models.c2_organ;
    assert.equal(model, 'meta-llama/Llama-3.3-70B-Instruct', 'a real override is not the ban, it must still win');
  } finally {
    if (saved === undefined) delete process.env.TOGETHER_MODEL; else process.env.TOGETHER_MODEL = saved;
    freshRouter();
  }
});

// ⬡B:tests.model_router_together_override:TEST:the_final_tier_override_cannot_bypass_the_ban_either:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON template-mind#322, P1: resolve()'s per-tier
// ANEW_MODEL_<TIER> override superseded the provider map's own already-sanitized
// model with no ban check of its own; a deployment with ANEW_MODEL_C2=z-ai/glm-5.2,
// PAI_ROUTING_POLICY=on, TOGETHER_API_KEY set, and no routable c2_organ seat key
// reached the legacy Together fallback and won regardless of the provider's own fix.
const ENV_KEYS = ['ANEW_MODEL_C2', 'PAI_ROUTING_POLICY', 'TOGETHER_API_KEY', 'GROQ_API_KEY',
  'HAM_UID', 'OR_KEY_C2_ORGAN', 'OPENROUTER_API_KEY', 'SEAT_C2_MODEL'];
function withClearedRouterEnv(overrides, fn) {
  const saved = {};
  ENV_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, overrides);
  try { return fn(); } finally {
    ENV_KEYS.forEach(function (k) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    });
    freshRouter();
  }
}

test('a founder-banned ANEW_MODEL_<TIER> override never reaches the legacy fallback resolve()', function () {
  withClearedRouterEnv({
    ANEW_MODEL_C2: 'z-ai/glm-5.2', PAI_ROUTING_POLICY: 'on', TOGETHER_API_KEY: 'fixture-together-key'
  }, function () {
    const router = freshRouter();
    const resolved = router.resolve('c2', { allowFallback: true });
    assert.ok(resolved, 'the legacy fallback resolves when no seat key is routable');
    assert.doesNotMatch(resolved.model, /glm-5\.2/i,
      'a founder-banned per-tier override must not win over the sanitized provider default');
  });
});

test('a real, non-banned ANEW_MODEL_<TIER> override still wins on resolve()', function () {
  withClearedRouterEnv({
    ANEW_MODEL_C2: 'meta-llama/Llama-3.3-70B-Instruct', PAI_ROUTING_POLICY: 'on', TOGETHER_API_KEY: 'fixture-together-key'
  }, function () {
    const router = freshRouter();
    const resolved = router.resolve('c2', { allowFallback: true });
    assert.equal(resolved.model, 'meta-llama/Llama-3.3-70B-Instruct', 'a real override is not the ban, it must still win');
  });
});

// ⬡B:tests.model_router_together_override:TEST:every_provider_blocks_own_default_and_override_are_sanitized_too:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON template-mind#322, P1: GROQ_MODEL_C1/C2 (and
// their siblings on the anthropic_bleed/openrouter blocks) read raw, and two of this
// file's own BAKED defaults were themselves a founder-banned family
// (anthropic_bleed.c3_mind: 'claude-opus-4-8'; openrouter.c2_organ/c2_deep:
// 'z-ai/glm-5.2', a leftover from the 20260721 DeepSeek scrub that swapped one banned
// family for another). safeModelOverride() only ever validates its override argument;
// passing a banned value AS the safe default defeats it regardless.
test('GROQ_MODEL_C1/C2 raw overrides are refused when founder-banned, real overrides still win', function () {
  const savedC1 = process.env.GROQ_MODEL_C1, savedC2 = process.env.GROQ_MODEL_C2;
  try {
    process.env.GROQ_MODEL_C1 = 'claude-opus-4-8';
    process.env.GROQ_MODEL_C2 = 'moonshotai/kimi-k3';
    let router = freshRouter();
    assert.doesNotMatch(router.PROVIDERS.groq.models.c1_gate, /opus/i, 'a banned GROQ_MODEL_C1 override is refused');
    assert.doesNotMatch(router.PROVIDERS.groq.models.c2_organ, /kimi/i, 'a banned GROQ_MODEL_C2 override is refused');
    process.env.GROQ_MODEL_C1 = 'llama-3.1-70b-versatile';
    router = freshRouter();
    assert.equal(router.PROVIDERS.groq.models.c1_gate, 'llama-3.1-70b-versatile', 'a real override still wins');
  } finally {
    if (savedC1 === undefined) delete process.env.GROQ_MODEL_C1; else process.env.GROQ_MODEL_C1 = savedC1;
    if (savedC2 === undefined) delete process.env.GROQ_MODEL_C2; else process.env.GROQ_MODEL_C2 = savedC2;
    freshRouter();
  }
});

test('the anthropic_bleed C3 floor is no longer baked to Opus, and a banned override is refused', function () {
  const saved = process.env.ANTHROPIC_MODEL_OPUS;
  try {
    delete process.env.ANTHROPIC_MODEL_OPUS;
    let router = freshRouter();
    assert.doesNotMatch(router.PROVIDERS.anthropic_bleed.models.c3_mind, /opus/i,
      'the baked C3 default is not Opus, a founder-banned family, even with no override set');
    process.env.ANTHROPIC_MODEL_OPUS = 'claude-opus-4-8';
    router = freshRouter();
    assert.doesNotMatch(router.PROVIDERS.anthropic_bleed.models.c3_mind, /opus/i,
      'an explicit ANTHROPIC_MODEL_OPUS override naming Opus is refused too');
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_MODEL_OPUS; else process.env.ANTHROPIC_MODEL_OPUS = saved;
    freshRouter();
  }
});

test('the openrouter C2 defaults are no longer baked to GLM-5.2, and a banned override is refused', function () {
  const saved = process.env.OPENROUTER_MODEL_C2;
  try {
    delete process.env.OPENROUTER_MODEL_C2;
    let router = freshRouter();
    assert.doesNotMatch(router.PROVIDERS.openrouter.models.c2_organ, /glm-5\.2/i,
      'the baked openrouter C2 default is not GLM-5.2, a founder-banned family, even with no override set');
    process.env.OPENROUTER_MODEL_C2 = 'z-ai/glm-5.2';
    router = freshRouter();
    assert.doesNotMatch(router.PROVIDERS.openrouter.models.c2_organ, /glm-5\.2/i,
      'an explicit OPENROUTER_MODEL_C2 override naming GLM-5.2 is refused too');
  } finally {
    if (saved === undefined) delete process.env.OPENROUTER_MODEL_C2; else process.env.OPENROUTER_MODEL_C2 = saved;
    freshRouter();
  }
});
