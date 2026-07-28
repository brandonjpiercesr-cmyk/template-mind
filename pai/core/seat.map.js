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
// seat(name) returns { role, model, provider, keyEnv, via }.
// keyEnv names the PER-FUNCTION OpenRouter key so a bleed traces to the exact
// seat instead of one shared wallet; two seats on the same model carry two
// different keyEnv names on purpose. resolveKey(seat) reads that named key and
// nothing else. Missing ownership fails closed instead of spending from a
// shared wallet or another function's seat.
//
// Model picks were verified live against OpenRouter 20260721:
//   - qwen/qwen3.5-flash-02-23  fast seat, ~3-6s, cheapest
//   - qwen/qwen3-235b-a22b-2507 judge, 2-4s clean strict JSON (the thinking
//                               variant timed out at 90s and was rejected)
//   - moonshotai/kimi-k3        CODA coding adviser
//   - qwen/qwen3-coder          deploy/tool seat, clean tool calls
//   - z-ai/glm-5.2              C2/C3 failover, CANON, advisors on OpenRouter
//
// Founder ruling 20260724: Together is retired from every load-bearing seat (its
// account bled and ran dry). GLM-5.2 now runs on OpenRouter (slug z-ai/glm-5.2,
// per-seat key) so the same model quality carries the CANON, advisor, and failover
// seats through the metered per-key path, never the shared Together wallet. Together
// stays only as an env-overridable option, wired nowhere by default.
// SEAT_CODA_MODEL may be set to a cheaper deepseek slug and SEAT_DEPLOY_MODEL to a
// gemini slug via env once the exact OpenRouter slug is confirmed live (do not bake
// an unverified slug: a wrong model id fails the seat silently).

function env(key, dflt) {
  var v = process.env[key];
  return (v && String(v).trim()) ? String(v).trim() : dflt;
}

function envUsd(key, dflt) {
  var raw = process.env[key];
  if (raw === undefined || raw === '') return dflt;
  var text = String(raw).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/.test(text)) return null;
  var value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

// role, default model (env-overridable per seat), transport provider, the
// per-function named key env and telemetry via label. Dollar caps are not
// represented here: OpenRouter usage is observable, but this process cannot
// atomically enforce a per-key USD limit, so publishing one would be false.
//
// ⬡B:core.seat_map:WIRE:vision_capability_is_a_confirmed_fact_not_a_guess:20260727⬡
// `vision` states whether THIS seat's baked default model accepts an image_url
// message part. Checked live against OpenRouter's own model roster (GET
// /api/v1/models, architecture.input_modalities) on 20260727, per model, not
// assumed from a model family name: qwen3.5-flash-02-23, minimax-01, grok-4.5,
// kimi-k3 and grok-build-0.1 all confirmed image-capable; glm-5.2, qwen3-coder,
// qwen3-235b-a22b(-2507) and deepseek-v3.2 confirmed text-only. A seat with no
// vision model anywhere in this file was never given one; this only says which
// EXISTING picks already read pixels. Reflects the baked default only -- an
// SEAT_*_MODEL env override to a different slug does not retarget this flag,
// the same way an override does not retarget `role`.
var SEATS = {
  c1_cellm:    { role: 'C1 penny gate',        envModel: 'SEAT_C1_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C1_CELLM',    via: 'openrouter', capEnv:'SEAT_C1_CELLM_DAILY_CAP_USD', dailyCapUsd:2, vision:true },
  // ⬡B:core.seat_map:911:the_everyday_organ_was_seated_on_the_one_model_that_cannot_call_a_tool:20260728⬡
  // MEASURED LIVE 20260728, the day before the launch, on a real world through anu-anew.com,
  // two separate doors, seconds apart, identical failure:
  //   POST /cara/chat     -> ok:false  no_answer:pai_seat: "No endpoints found that support
  //                          tool use. Try disabling update_screen."
  //   POST /arrive/decide -> ok:false  no_answer:pai_seat: "No endpoints found that support
  //                          tool use. Try disabling save_layout."
  // She could not finish one turn on any surface the demo touches.
  //
  // THE CAUSE, read off the live OpenRouter model list rather than reasoned about: of every
  // model in this map, `minimax/minimax-01` was the ONLY one whose supported_parameters lack
  // `tools`. `core/tool.loop.js` `_paiSeatName()` binds EVERY non-voice, non-coding channel
  // to this seat, which is CARA chat, the arrival portal, and every other demo surface, and
  // the PAI cycle is a TOOL LOOP: it hands the seat `save_layout`, `update_screen` and their
  // sisters on every turn. A tool-incapable model here is not slow, it is MUTE. The 20260722
  // ruling that seated MiniMax measured speed and JSON cleanliness, both real and both still
  // true; tool support was simply never part of the check.
  //
  // THE PICK, chosen against the live list on all four constraints at once, not two:
  //   tools    REQUIRED, or she cannot answer at all (this outage).
  //   vision   REQUIRED, this seat carries vision:true and tool.loop.js resolves the vision
  //            turn through this same seat, so a text-only pick trades her voice for her eyes.
  //            `z-ai/glm-5.2` was this seat's own declared failover and is text-only, so the
  //            obvious swap was the wrong one.
  //   cost     this is the highest-volume seat in the estate; penny hustle governs.
  //   proven   already funded and already answering in this system.
  // `qwen/qwen3.5-flash-02-23` is the only candidate that satisfies all four: tools YES,
  // vision YES, 1M context, $0.07/$0.26 per M (CHEAPER than the MiniMax it replaces, $0.20/
  // $1.10), and already carrying the C1, C4, and voice seats here. The failover moves to
  // `x-ai/grok-4.5`, also tools+vision, so a miss escalates to a strong mind instead of
  // falling to a text-only model that would break the vision turn.
  //
  // SEAT_C2_MODEL still overrides for an env-only re-seat with no deploy. Whoever sets it:
  // the value MUST support BOTH tool use AND image input or one of these two outages returns.
  c2_organ:    { role: 'C2 deliberation organ',envModel: 'SEAT_C2_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C2_ORGAN',    via: 'openrouter', capEnv:'SEAT_C2_ORGAN_DAILY_CAP_USD', dailyCapUsd:6, vision:true,
                 fallbackModel: 'x-ai/grok-4.5', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_C2_ORGAN' },
  // Founder ruling 20260722: Grok 4.5 is the mind; GLM-5.2 is its failover. Grok is
  // closed-weight (xAI) and founder-lifted from the ban for this seat. Seated on C3
  // (the flagship mind) only, not the high-volume C2 organ, to keep the $2/$6-per-M
  // Grok off the everyday workhorse. verified live 20260722.
  c3_mind:     { role: 'C3 mind / A NU synth', envModel: 'SEAT_C3_MODEL',      model: 'x-ai/grok-4.5',            provider: 'openrouter', keyEnv: 'OR_KEY_MIND_GROK',   via: 'openrouter', capEnv:'SEAT_C3_MIND_DAILY_CAP_USD', dailyCapUsd:6, vision:true,
                 fallbackModel: 'z-ai/glm-5.2', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_MIND_GROK' },
  c4_watch:    { role: 'C4 CLAIR watch',       envModel: 'SEAT_C4_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C4_WATCH',    via: 'openrouter', capEnv:'SEAT_C4_WATCH_DAILY_CAP_USD', dailyCapUsd:2, vision:true },
  // ⬡B:core.seat_map:FIX:codas_coder_invented_cap_was_stopping_her_on_demo_eve:20260728⬡
  // Raised 8 to 40 on the founder's own direct instruction. He said he had raised the kimi
  // cap, could not find SEAT_CODA_DAILY_CAP_USD to set it, and told this lane to do it. The
  // env override is his to set and still wins whenever it is present; this only moves the
  // fallback underneath it. MEASURED, not guessed: CODA cycled 465 times unattended overnight,
  // spent through the 8 dollar fallback, and every deliberation since has held with
  // openrouter_seat_daily_dollar_cap_reached on seat coda, so the coding department's own mind
  // was stopped on the eve of the launch by a number no human ever chose. /coda/sensors/health
  // reports this seat's cap as "chosen_by: a coder, not the founder", which is exactly what it
  // was: a default invented in this file, never a decision. 40 restores a full day of real
  // autonomous work with a real ceiling still under it.
  coda:        { role: 'coding adviser (CODA)',envModel: 'SEAT_CODA_MODEL',    model: 'moonshotai/kimi-k3',       provider: 'openrouter', keyEnv: 'OR_KEY_CODA_KIMI',   via: 'openrouter', capEnv:'SEAT_CODA_DAILY_CAP_USD', dailyCapUsd:40, vision:true },
  deploy_tool: { role: 'deploy/tool seat',     envModel: 'SEAT_DEPLOY_MODEL',  model: 'qwen/qwen3-coder',         provider: 'openrouter', keyEnv: 'OR_KEY_DEPLOY_QWEN', via: 'openrouter', capEnv:'SEAT_DEPLOY_TOOL_DAILY_CAP_USD', dailyCapUsd:4, vision:false },
  // FOUNDER 911 20260722: Ornith is RETIRED and RunPod is out entirely (the live
  // endpoint was failure-looping: 937 failures, 0 completions, billed GPU). The
  // judge seat moves to its own proven reliability pick: qwen3-235b (2-4s clean
  // strict JSON, verified) on OpenRouter, with Kimi K3 as the failover so a qwen
  // miss never leaves a contest ungraded. No RunPod anywhere in this map.
  judge:       { role: 'wonder + cookoff judge',envModel: 'SEAT_JUDGE_MODEL',  model: 'qwen/qwen3-235b-a22b-2507',provider: 'openrouter', keyEnv: 'OR_KEY_JUDGE_QWEN', via: 'openrouter', capEnv:'SEAT_JUDGE_DAILY_CAP_USD', dailyCapUsd:4, vision:false,
                 fallbackModel: 'moonshotai/kimi-k3', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_JUDGE_QWEN' },
  canon:       { role: 'CANON grader',         envModel: 'SEAT_CANON_MODEL',   model: 'z-ai/glm-5.2',             provider: 'openrouter', keyEnv: 'OR_KEY_CANON',       via: 'openrouter', capEnv:'SEAT_CANON_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  advisors:    { role: 'board advisors',       envModel: 'SEAT_ADVISOR_MODEL', model: 'z-ai/glm-5.2',             provider: 'openrouter', keyEnv: 'OR_KEY_ADVISORS',    via: 'openrouter', capEnv:'SEAT_ADVISORS_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  // ⬡B:core.seat_map:911:three_dollars_on_the_seat_that_generates_the_whole_seated_experience:20260728⬡
  // MEASURED LIVE 20260728, launch eve, and traced end to end rather than reasoned about.
  // POST /seer/native/day/advance answered 503 on a real world: DAY ONE of SEATED did not
  // generate at all. A named-failure fix landed first so the door would stop saying one word,
  // and the next live read named it exactly: `no_rung_answered`, meaning modelLadder.deliberate
  // returned null with NO rung having answered.
  //
  // WHY THAT LANDS HERE. core/model.ladder.js `deliberate` defaults its order to 'glm,qwen' and
  // resolves BOTH rungs through `opts.seat || MODEL_LADDER_SEAT || 'deliberation'`, so the two
  // rungs that look like redundancy are ONE seat wearing two model names. When this seat refuses,
  // there is no second opinion, there is silence. Verified against the live service rather than
  // assumed: OR_KEY_MODEL_LADDER is set (so it is not a missing credential), MODEL_LADDER_ORDER
  // and MODEL_LADDER_SEAT are unset (so the defaults above are what actually run),
  // SEAT_DELIBERATION_DAILY_CAP_USD is unset (so THIS number is the live ceiling), the daily call
  // ceiling was nowhere near tripped (1 of 3000 used), and ANTHROPIC_BACKUP_FLOOR is unset, so
  // nothing catches the fall when this one seat closes.
  //
  // Three dollars a day was a coder default, never a decision: /coda/sensors/health reports this
  // seat as "chosen_by: a coder, not the founder". It is also the GENERAL ladder, shared across
  // the estate, so on a day the whole system spent 19.99 USD it is drained by ordinary traffic
  // long before anyone opens SEATED, and then the founder's flagship experience is dead with no
  // error a human could read. That is the same shape as the CODA seat cap cured earlier today.
  //
  // 25 is sized to the job, not invented: it must carry every scene generation in the experience
  // AND the general deliberation of the rest of the estate on the same key. The env override
  // remains the founder's and still wins whenever it is present; this only moves the fallback.
  // NOT DONE HERE, named rather than hidden: the single-seat-no-floor design is the deeper
  // defect, and turning on ANTHROPIC_BACKUP_FLOOR is a real spend decision that belongs to its
  // own lane, not to a launch-eve edit.
  deliberation:{ role: 'general deliberation ladder',envModel:'SEAT_LADDER_MODEL',model:'z-ai/glm-5.2',             provider:'openrouter', keyEnv:'OR_KEY_MODEL_LADDER',  via:'openrouter', capEnv:'SEAT_DELIBERATION_DAILY_CAP_USD', dailyCapUsd:25, vision:false },
  voice_fast:  { role: 'voice reasoning',      envModel: 'SEAT_VOICE_MODEL',   model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_VOICE_QWEN',  via: 'openrouter', capEnv:'SEAT_VOICE_FAST_DAILY_CAP_USD', dailyCapUsd:3, vision:true },
  runaway_sweep:{ role:'runaway SHADOW judge', envModel:'RUNAWAY_SWEEP_MODEL', model:'qwen/qwen3.5-flash-02-23', provider:'openrouter',keyEnv:'OR_KEY_RUNAWAY_SWEEP',via:'openrouter', capEnv:'SEAT_RUNAWAY_SWEEP_DAILY_CAP_USD', dailyCapUsd:1, vision:true },
  wonder_games_glm:  { role: 'Wonder Games GLM contestant',  envModel:'WONDER_GAMES_GLM_MODEL',  model:'z-ai/glm-5.2',       provider:'openrouter',keyEnv:'OR_KEY_WONDER_GAMES_GLM', via:'openrouter', capEnv:'SEAT_WONDER_GAMES_GLM_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  wonder_games_qwen: { role: 'Wonder Games Qwen contestant', envModel:'WONDER_GAMES_QWEN_MODEL', model:'qwen/qwen3-235b-a22b',provider:'openrouter',keyEnv:'OR_KEY_WONDER_GAMES_QWEN',via:'openrouter', capEnv:'SEAT_WONDER_GAMES_QWEN_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  cookoff_kimi:     { role: 'cook-off Kimi contestant',     envModel: 'COOKOFF_KIMI_MODEL',     model: 'moonshotai/kimi-k3',     provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_KIMI',     via: 'openrouter', capEnv:'SEAT_COOKOFF_KIMI_DAILY_CAP_USD', dailyCapUsd:2, vision:true },
  cookoff_qwen:     { role: 'cook-off Qwen contestant',     envModel: 'COOKOFF_QWEN_MODEL',     model: 'qwen/qwen3-coder',       provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_QWEN',     via: 'openrouter', capEnv:'SEAT_COOKOFF_QWEN_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  cookoff_glm:      { role: 'cook-off GLM contestant',      envModel: 'COOKOFF_GLM_MODEL',      model: 'z-ai/glm-5.2',           provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_GLM',      via: 'openrouter', capEnv:'SEAT_COOKOFF_GLM_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  cookoff_deepseek: { role: 'cook-off DeepSeek contestant', envModel: 'COOKOFF_DEEPSEEK_MODEL', model: 'deepseek/deepseek-v3.2', provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_DEEPSEEK', via: 'openrouter', capEnv:'SEAT_COOKOFF_DEEPSEEK_DAILY_CAP_USD', dailyCapUsd:2, vision:false },
  cookoff_grok:     { role: 'cook-off Grok contestant',     envModel: 'COOKOFF_GROK_MODEL',     model: 'x-ai/grok-build-0.1',    provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_GROK',     via: 'openrouter', capEnv:'SEAT_COOKOFF_GROK_DAILY_CAP_USD', dailyCapUsd:2, vision:true }
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
    dailyCapUsd: envUsd(d.capEnv, d.dailyCapUsd),
    capEnv: d.capEnv,
    // Honest to the same rule as fallback() below: a fallback that resolves to the
    // primary's own model is not a fallback, so this seat reports that it has none.
    hasFallback: !!(d.fallbackModel &&
      env(d.envModel + '_FALLBACK', d.fallbackModel) !== env(d.envModel, d.model)),
    // Confirmed per the comment above SEATS, for the baked default model. A caller
    // that sends an image part to a seat this says is not vision-capable is not
    // this file's decision to have made for it; it is the caller's to skip or accept.
    vision: !!d.vision
  };
}

// The failover seat for a primary that carries one (Grok mind -> GLM-5.2, Ornith
// judge -> qwen3-235b). Returns null when the seat has no fallback, so a caller
// tries the primary, and only on empty/failure resolves fallback() and retries.
//
// ⬡B:core.seat_map:FIX:a_fallback_that_equals_the_primary_is_not_a_fallback:20260726⬡
// Found 20260726 while answering "KIMI is the judge of the shareholders report, but KIMI is
// only the judge FAILOVER." That part is pure config: SEAT_JUDGE_MODEL seats the primary and
// SEAT_JUDGE_MODEL_FALLBACK seats the failover, so the founder action is a straight swap of
// two env values, no code change. But swapping only the FIRST one is a real trap this file
// had: SEAT_JUDGE_MODEL=moonshotai/kimi-k3 leaves the baked fallback at moonshotai/kimi-k3
// too, and the "failover" then retries the identical model on the identical key, which is not
// a failover, it is the same call twice at twice the price. Same trap on every seat that
// carries a fallback. Comparing two resolved model slugs is a fact, not a judgment, so cold
// code may state it: when they are the same string, this seat has no failover and says so,
// and the caller stops after one honest attempt instead of paying for a phantom second one.
function fallback(name) {
  var d = SEATS[name];
  if (!d || !d.fallbackModel) return null;
  if (env(d.envModel + '_FALLBACK', d.fallbackModel) === env(d.envModel, d.model)) return null;
  return {
    seat: name + '.fallback',
    role: d.role + ' (fallback)',
    model: env(d.envModel + '_FALLBACK', d.fallbackModel),
    provider: d.fallbackProvider,
    keyEnv: d.fallbackKeyEnv,
    via: d.fallbackProvider,
    dailyCapUsd: envUsd(d.capEnv, d.dailyCapUsd),
    capEnv: d.capEnv,
    hasFallback: false
  };
}

// The API key for a seat is exactly its per-function named key. No completion
// call may borrow a shared provider key or another seat's key.
// ⬡B:core.seat_map:911:a_key_pasted_with_a_newline_is_not_a_broken_key_it_is_a_broken_paste:20260725⬡
// FOUND LIVE 20260725: two funded seats, deploy_tool and judge, were refusing every call
// with an illegal Authorization header. Both keys were PRESENT and correct; each carried a
// stray newline or space from being pasted into the env box. The bleed board called those
// seats dead and the shared key stayed alive to cover them, all because of invisible
// whitespace.
//
// A founder pasting a key into a web form should never have to know that. Nothing about a
// trailing newline is a decision, a policy, or a judgment; it is a paste artifact, and cold
// code is allowed to clean a paste artifact because it decides nothing by doing so. So the
// ONE SOURCE cleans it once, here, and every seat in every repo inherits the cure.
//
// Bounded on purpose: trim surrounding whitespace, and strip one matching pair of wrapping
// quotes (some env UIs add them). Nothing inside the key is touched, so a key that is
// genuinely wrong still fails honestly instead of being silently "repaired" into a different
// wrong key.
function sanitizeKey(raw) {
  if (raw == null) return '';
  var v = String(raw).trim();
  if (v.length > 1 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function resolveKey(s) {
  if (!s) return '';
  return sanitizeKey(process.env[s.keyEnv]);
}

function seatNames() { return Object.keys(SEATS); }

module.exports = { SEATS: SEATS, seat: seat, fallback: fallback, resolveKey: resolveKey, seatNames: seatNames, sanitizeKey: sanitizeKey,
  _test:{envUsd:envUsd} };
