// ⬡B:core.seat_map:MODULE:one_source_llm_seat_assignment:20260721⬡
'use strict';
// THE ONE SOURCE for which model and which named key sits in each LLM seat.
//
// Founder-ratified 20260721; A'NU cross-approved live (cycle
// DC499D0C.1784653552513.960dhn, "Proceed"). Every seat is env-driven so a
// re-seat or a key swap is an env change plus a deploy, never a code edit per
// repo. This file is byte-identical across anew (core/) and template-mind
// (pai/core/), so every world and every chat reads one source. ANYHAM: no
// identity, no personal fact, no hardcoded HAM here.
//
// seat(name) returns { role, model, provider, keyEnv, via, dailyCapUsd }.
// keyEnv names the PER-FUNCTION OpenRouter key so a bleed traces to the exact
// seat instead of one shared wallet; two seats on the same model carry two
// different keyEnv names on purpose. resolveKey(seat) reads that named key and
// falls back to the shared OPENROUTER_API_KEY so a not-yet-provisioned key
// never makes the seat silent.
//
// Model picks were verified live against OpenRouter 20260721:
//   - qwen/qwen3.5-flash-02-23  fast seat, ~3-6s, cheapest
//   - qwen/qwen3-235b-a22b-2507 judge, 2-4s clean strict JSON (the thinking
//                               variant timed out at 90s and was rejected)
//   - moonshotai/kimi-k3        CODA coding adviser
//   - qwen/qwen3-coder          deploy/tool seat, clean tool calls
//   - zai-org/GLM-5.2           C2/C3/CANON/advisors on Together

function env(key, dflt) {
  var v = process.env[key];
  return (v && String(v).trim()) ? String(v).trim() : dflt;
}

// role, default model (env-overridable per seat), transport provider, the
// per-function named key env, telemetry via label, and a daily USD cap intent.
var SEATS = {
  c1_cellm:    { role: 'C1 penny gate',        envModel: 'SEAT_C1_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C1_CELLM',    via: 'openrouter', dailyCapUsd: 2 },
  c2_organ:    { role: 'C2 deliberation organ',envModel: 'SEAT_C2_MODEL',      model: 'zai-org/GLM-5.2',          provider: 'together',   keyEnv: 'TOGETHER_API_KEY',   via: 'together',   dailyCapUsd: null },
  c3_mind:     { role: 'C3 mind / A NU synth', envModel: 'SEAT_C3_MODEL',      model: 'zai-org/GLM-5.2',          provider: 'together',   keyEnv: 'TOGETHER_API_KEY',   via: 'together',   dailyCapUsd: null },
  c4_watch:    { role: 'C4 CLAIR watch',       envModel: 'SEAT_C4_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C4_WATCH',    via: 'openrouter', dailyCapUsd: 2 },
  coda:        { role: 'coding adviser (CODA)',envModel: 'SEAT_CODA_MODEL',    model: 'moonshotai/kimi-k3',       provider: 'openrouter', keyEnv: 'OR_KEY_CODA_KIMI',   via: 'openrouter', dailyCapUsd: 8 },
  deploy_tool: { role: 'deploy/tool seat',     envModel: 'SEAT_DEPLOY_MODEL',  model: 'qwen/qwen3-coder',         provider: 'openrouter', keyEnv: 'OR_KEY_DEPLOY_QWEN', via: 'openrouter', dailyCapUsd: 4 },
  judge:       { role: 'wonder + cookoff judge',envModel: 'SEAT_JUDGE_MODEL',  model: 'qwen/qwen3-235b-a22b-2507',provider: 'openrouter', keyEnv: 'OR_KEY_JUDGE_QWEN',  via: 'openrouter', dailyCapUsd: 4 },
  canon:       { role: 'CANON grader',         envModel: 'SEAT_CANON_MODEL',   model: 'zai-org/GLM-5.2',          provider: 'together',   keyEnv: 'TOGETHER_API_KEY',   via: 'together',   dailyCapUsd: null },
  advisors:    { role: 'board advisors',       envModel: 'SEAT_ADVISOR_MODEL', model: 'zai-org/GLM-5.2',          provider: 'together',   keyEnv: 'TOGETHER_API_KEY',   via: 'together',   dailyCapUsd: null },
  voice_fast:  { role: 'voice reasoning',      envModel: 'SEAT_VOICE_MODEL',   model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_VOICE_QWEN',  via: 'openrouter', dailyCapUsd: 3 }
};

// Resolve a seat, reading its model fresh from env each call (env truth wins;
// the baked default is only the floor). Unknown seat returns null, never a guess.
function seat(name) {
  var d = SEATS[name];
  if (!d) return null;
  return {
    seat: name,
    role: d.role,
    model: env(d.envModel, d.model),
    provider: d.provider,
    keyEnv: d.keyEnv,
    via: d.via,
    dailyCapUsd: d.dailyCapUsd
  };
}

// The API key for a seat: its per-function named key first, then the shared
// OpenRouter key so an un-provisioned seat is never silent. Together seats
// resolve their own key env directly.
function resolveKey(s) {
  if (!s) return '';
  return process.env[s.keyEnv] || process.env.OPENROUTER_API_KEY || '';
}

function seatNames() { return Object.keys(SEATS); }

module.exports = { SEATS: SEATS, seat: seat, resolveKey: resolveKey, seatNames: seatNames };
