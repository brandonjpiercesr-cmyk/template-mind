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
