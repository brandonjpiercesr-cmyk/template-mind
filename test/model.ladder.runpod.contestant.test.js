// ⬡B:tests.model_ladder_runpod_contestant:TEST:the_glm_runpod_ban_forgot_its_own_contestant_exemption:20260729⬡
// Sister to anew's tests/model.ladder.json.test.js (same two tests, ported for
// pai/core/model.ladder.js's require path). CAUGHT BY CATHY (Codex) IN REVIEW ON
// anew#1346, P2: contestantBuild() (Wonder Games) calls ladder.deliberate() with
// seat:'wonder_games_glm', the exact contestant seat this repo's own production ban
// already exempts on pai/core/seat.map.js's seat()/fallback() (isContestantSeat()).
// tryRunPodGLM() applied the ban unconditionally regardless of who was asking, so a
// Wonder Games GLM contestant running GLM_PROVIDER_ORDER=runpod with its own supported
// GLM_RUNPOD_MODEL=glm-5.2 submitted empty content and dropped out of its own game.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ladder = require('../pai/core/model.ladder.js');

const ENV_KEYS = ['GLM_RUNPOD_URL', 'GLM_RUNPOD_KEY', 'GLM_RUNPOD_MODEL', 'GLM_PROVIDER_ORDER'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const ORIGINAL_FETCH = global.fetch;

function clearProviderEnv() { ENV_KEYS.forEach((key) => delete process.env[key]); }
function restoreRuntime() {
  ENV_KEYS.forEach((key) => {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  });
  global.fetch = ORIGINAL_FETCH;
}
function providerResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content: content } }] }) };
}

test.afterEach(restoreRuntime);

test('a Wonder Games GLM contestant on the RunPod rung is exempt from the production ban', async function () {
  clearProviderEnv();
  process.env.GLM_RUNPOD_URL = 'https://glm.example.test';
  process.env.GLM_RUNPOD_KEY = 'runpod-key';
  process.env.GLM_RUNPOD_MODEL = 'glm-5.2'; // the contestant's own real, supported model
  process.env.GLM_PROVIDER_ORDER = 'runpod';
  let calls = 0;
  global.fetch = async function (url) {
    calls += 1;
    assert.match(String(url), /glm\.example\.test/, 'must reach the RunPod rung, not fall through');
    return providerResponse('{"approved":true,"reason":"contestant judged"}');
  };

  const result = await ladder.deliberate('system', 'user', {
    json: true, max_tokens: 40, temperature: 0, timeout: 20,
    order: ['glm'], seat: 'wonder_games_glm'
  });

  assert.equal(calls, 1, 'the exempt contestant seat must actually reach the RunPod rung');
  assert.ok(result, 'a contestant on its own supported model must not be refused');
  assert.equal(result.model, 'glm-5.2');
});

// ⬡B:tests.model_ladder_runpod_contestant:TEST:an_omitted_override_must_not_leave_the_contestant_with_no_model:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P2, fresh evidence beyond the exemption
// fix above: with GLM_RUNPOD_MODEL simply UNSET (the common, supported shape, since this
// rung used to bake 'glm-5.2' as its own default on exactly that configuration),
// `_rpModel` was falsy and this rung returned null before the contestant check even ran,
// so a Wonder Games GLM contestant with no explicit env override still submitted empty
// content and dropped out of its own game.
// ⬡B:tests.model_ladder_runpod_contestant:FIX:the_seats_openrouter_slug_is_a_foreign_id_on_runpod:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P2, fresh evidence beyond the exemption
// fix: the contestant seat's declared model is the OpenRouter-format slug
// ('z-ai/glm-5.2'), foreign on RunPod, which speaks the bare id ('glm-5.2', the same
// convention routes/cookoff.routes.js's own RunPod runner already uses). Asserting on the
// bare id, not the raw seat slug, so this test proves the request RunPod will actually
// accept, not merely a non-null one.
test('a Wonder Games GLM contestant with GLM_RUNPOD_MODEL unset still resolves the RunPod-native id', async function () {
  clearProviderEnv();
  process.env.GLM_RUNPOD_URL = 'https://glm.example.test';
  process.env.GLM_RUNPOD_KEY = 'runpod-key';
  process.env.GLM_PROVIDER_ORDER = 'runpod';
  const seatModel = require('../pai/core/seat.map.js').seat('wonder_games_glm').model;
  const runpodModel = seatModel.replace(/^[^/]+\//, '');
  let calls = 0;
  global.fetch = async function (url, opts) {
    calls += 1;
    assert.equal(JSON.parse(opts.body).model, runpodModel,
      'the bare RunPod-native id must be sent, not the seat\'s OpenRouter slug and not an empty/omitted one');
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"approved":true,"reason":"contestant judged"}' } }] }) };
  };

  const result = await ladder.deliberate('system', 'user', {
    json: true, max_tokens: 40, temperature: 0, timeout: 20,
    order: ['glm'], seat: 'wonder_games_glm'
  });

  assert.equal(calls, 1, 'the exempt contestant seat must actually reach the RunPod rung even with no override set');
  assert.ok(result, 'the contestant must not be refused for lacking an explicit env override');
  assert.equal(result.model, runpodModel);
});

test('a non-contestant caller is still refused GLM-5.2 on the RunPod rung', async function () {
  clearProviderEnv();
  process.env.GLM_RUNPOD_URL = 'https://glm.example.test';
  process.env.GLM_RUNPOD_KEY = 'runpod-key';
  process.env.GLM_RUNPOD_MODEL = 'glm-5.2';
  process.env.GLM_PROVIDER_ORDER = 'runpod';
  let calls = 0;
  global.fetch = async function (url) {
    calls += 1;
    throw new Error('must never reach the network for a banned, non-exempt caller: ' + url);
  };

  const result = await ladder.deliberate('system', 'user', {
    json: true, max_tokens: 40, temperature: 0, timeout: 20, order: ['glm']
  });

  assert.equal(calls, 0, 'a non-contestant caller must be refused before any network attempt');
  assert.equal(result, null);
});
