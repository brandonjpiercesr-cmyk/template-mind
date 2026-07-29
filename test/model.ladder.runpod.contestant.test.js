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
