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
