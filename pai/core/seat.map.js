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
  // Founder ruling 20260722: use a fresh, never-before-wired model on the everyday
  // organ. MiniMax-01 (instruct, 1M ctx, ~$0.20/$1.10) is strong, cheap enough for the
  // high-volume workhorse, and returns clean JSON in ~3.7s (verified live), unlike the
  // MiniMax M2 reasoners which burn the whole budget thinking. GLM-5.2 is the failover.
  c2_organ:    { role: 'C2 deliberation organ',envModel: 'SEAT_C2_MODEL',      model: 'minimax/minimax-01',       provider: 'openrouter', keyEnv: 'OR_KEY_C2_ORGAN',    via: 'openrouter', dailyCapUsd: 6,
                 fallbackModel: 'zai-org/GLM-5.2', fallbackProvider: 'together', fallbackKeyEnv: 'TOGETHER_API_KEY' },
  // Founder ruling 20260722: Grok 4.5 is the mind; GLM-5.2 is its failover. Grok is
  // closed-weight (xAI) and founder-lifted from the ban for this seat. Seated on C3
  // (the flagship mind) only, not the high-volume C2 organ, to keep the $2/$6-per-M
  // Grok off the everyday workhorse. verified live 20260722.
  c3_mind:     { role: 'C3 mind / A NU synth', envModel: 'SEAT_C3_MODEL',      model: 'x-ai/grok-4.5',            provider: 'openrouter', keyEnv: 'OR_KEY_MIND_GROK',   via: 'openrouter', dailyCapUsd: 6,
                 fallbackModel: 'zai-org/GLM-5.2', fallbackProvider: 'together', fallbackKeyEnv: 'TOGETHER_API_KEY' },
  c4_watch:    { role: 'C4 CLAIR watch',       envModel: 'SEAT_C4_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C4_WATCH',    via: 'openrouter', dailyCapUsd: 2 },
  coda:        { role: 'coding adviser (CODA)',envModel: 'SEAT_CODA_MODEL',    model: 'moonshotai/kimi-k3',       provider: 'openrouter', keyEnv: 'OR_KEY_CODA_KIMI',   via: 'openrouter', dailyCapUsd: 8 },
  deploy_tool: { role: 'deploy/tool seat',     envModel: 'SEAT_DEPLOY_MODEL',  model: 'qwen/qwen3-coder',         provider: 'openrouter', keyEnv: 'OR_KEY_DEPLOY_QWEN', via: 'openrouter', dailyCapUsd: 4 },
  // Founder ruling 20260722: Ornith judges the Wonder Games AND the coding cook-off
  // (its self-scaffolding makes it a thinker/judge, per the Great Reset doctrine).
  // Pick A (self-host, judge only): Ornith stays on its existing RunPod SERVERLESS
  // endpoint (ORNITH_URL), scale-to-zero so an occasional judgment costs pennies and
  // never resurrects the retired hot GLM/coding RunPod path. qwen3-235b is the
  // reliability failover so a cold/failed Ornith never leaves a cook-off ungraded.
  judge:       { role: 'wonder + cookoff judge',envModel: 'SEAT_JUDGE_MODEL',  model: 'ornith',                   provider: 'runpod',     keyEnv: 'ORNITH_KEY',        via: 'ornith',     dailyCapUsd: 4,
                 fallbackModel: 'qwen/qwen3-235b-a22b-2507', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_JUDGE_QWEN' },
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
    dailyCapUsd: d.dailyCapUsd,
    hasFallback: !!d.fallbackModel
  };
}

// The failover seat for a primary that carries one (Grok mind -> GLM-5.2, Ornith
// judge -> qwen3-235b). Returns null when the seat has no fallback, so a caller
// tries the primary, and only on empty/failure resolves fallback() and retries.
function fallback(name) {
  var d = SEATS[name];
  if (!d || !d.fallbackModel) return null;
  return {
    seat: name + '.fallback',
    role: d.role + ' (fallback)',
    model: env(d.envModel + '_FALLBACK', d.fallbackModel),
    provider: d.fallbackProvider,
    keyEnv: d.fallbackKeyEnv,
    via: d.fallbackProvider,
    dailyCapUsd: d.dailyCapUsd,
    hasFallback: false
  };
}

// The API key for a seat: its per-function named key first, then the shared
// OpenRouter key so an un-provisioned seat is never silent. Together seats
// resolve their own key env directly.
function resolveKey(s) {
  if (!s) return '';
  var own = process.env[s.keyEnv];
  if (own) return own;
  // A missing named key falls back only to the SAME service's shared key, never a
  // cross-provider key (a Together seat must never authenticate to OpenRouter). An
  // OpenRouter seat floors to OPENROUTER_API_KEY; a RunPod seat (the Ornith judge)
  // floors to RUNPOD_API_KEY so a deployment carrying only RUNPOD_API_KEY still
  // authenticates the judge instead of going silent (Codex 20260722). Together and
  // any other provider still return empty rather than borrow a foreign key.
  if (s.provider === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
  if (s.provider === 'runpod') return process.env.RUNPOD_API_KEY || '';
  return '';
}

function seatNames() { return Object.keys(SEATS); }

module.exports = { SEATS: SEATS, seat: seat, fallback: fallback, resolveKey: resolveKey, seatNames: seatNames };
