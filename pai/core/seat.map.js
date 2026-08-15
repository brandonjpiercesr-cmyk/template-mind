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

// ⬡B:core.seat_map:FOUNDER:codeless_seats_the_model_is_not_a_literal_anymore:20260815⬡
// FOUNDER DIRECT, 20260814, on finding seven seats pinned to one vendor: "The point is not
// hardcoding grok! It's being dynamic and based on founder and Anu!!! Deciding!" and then
// "BUILD THIS WITHOUT CODE!! CODLESS WORLD!!"
//
// This file already said a re-seat was "an env change plus a deploy, never a code edit". That
// was true for a coder standing at a dashboard and false for the person who owns the estate:
// he reads on a phone, often with no way to reach a Render dashboard at all, so in practice
// every seat froze at whatever a coder last typed. Seven seats on x-ai/grok-4.5 is what that
// freeze looks like, and it is the opposite of the penny hustle this same file preaches.
//
// So the seat resolution gets a third source between the operator and the baked value: HER
// SIGNED FLOOR. core/seat.floor.js reads one founder-signed row (abacia_core.guardrail_wall,
// id seats.v1) and hands the values here. He and A'NU change a seat by deciding, not by
// deploying. The same shape already proven for her heartbeat cadence, which reads
// night_default_minutes off clock.v1 instead of a number a coder typed.
//
// THE ORDER, and each step is deliberate:
//   1. An operator env var. A human hand on the live service outranks a stored decision,
//      always, so an emergency re-seat is never argued with by a cached row.
//   2. Her signed floor. Unsigned is ignored entirely: core/seat.floor.js refuses a row with
//      no signed_by, so nobody re-seats this estate by writing a bank row.
//   3. The baked value in SEATS below. This is a BOOTSTRAP, not a policy: it is what a brand
//      new world runs before it has a floor of its own, so a world is never born mute.
//
// NO CAPS (founder, 20260815, verbatim: "NO CAPS!!!! NO CAPSS!! NO CAPSS!! WE TRACK AND LOG
// AND WATCH!! NO CAPSS!!"). The cap envs below flow through this same function on purpose, so
// the floor can lift a ceiling the same way it moves a model, with no coder and no deploy.
// Nothing here installs a cap and no lane may add one as "counsel" again.
var floorOverlay = Object.create(null);

// Called by core/seat.floor.js after it has read and validated a SIGNED row. Replaces the
// overlay whole rather than merging, so a value removed from her floor really disappears
// instead of surviving forever in a cache nobody can see.
function applyFloorOverlay(values) {
  var next = Object.create(null);
  if (values && typeof values === 'object') {
    Object.keys(values).forEach(function (key) {
      var raw = values[key];
      if (raw == null) return;
      var text = String(raw).trim();
      if (text) next[key] = text;
    });
  }
  floorOverlay = next;
  return Object.keys(floorOverlay).length;
}

function floorOverlayValues() { return Object.assign({}, floorOverlay); }

function env(key, dflt, runtime) {
  var v = (runtime || process.env)[key];
  if (v && String(v).trim()) return String(v).trim();
  // An explicit runtime object is a caller asking what a SPECIFIC environment resolves to
  // (tests, the estate monitor, a what-if). Answering that with this process's live floor
  // would make the same question return different answers over time, so the floor applies
  // only to the ambient environment it was actually loaded for.
  if (!runtime || runtime === process.env) {
    var floored = floorOverlay[key];
    if (floored) return floored;
  }
  return dflt;
}

// ⬡B:core.seat_map:911:a_capability_flag_that_survives_a_re_seat_is_a_lie_with_a_deploy_behind_it:20260728⬡
// Read live from OpenRouter's public catalog on 20260728, no auth required, per model, so the
// next lane can re-derive every row here instead of trusting this one:
//   curl -s https://openrouter.ai/api/v1/models
//   tools  -> supported_parameters contains "tools"
//   vision -> architecture.input_modalities contains "image"
// `minimax/minimax-01` is the only model this house has ever seated whose
// supported_parameters is [max_tokens, temperature, top_p] with no tool use at all.
//
// WHY THIS TABLE EXISTS AND NOT JUST THE PER-SEAT FLAGS. Both flags below describe a seat's
// BAKED DEFAULT. That was honest while a re-seat was rare, and it stops being honest the
// moment somebody actually uses the env knob this file advertises: the fastest mitigation for
// the outage above is SEAT_C2_MODEL=z-ai/glm-5.2 on the live service, one minute, no deploy,
// and GLM-5.2 is text-only. The seat would have gone on publishing vision:true from its baked
// row, and core/tool.loop.js attaches an uploaded image ONLY when the seat says it reads
// pixels, so the one-minute cure for the tool outage would have quietly started posting
// image parts to a model that cannot take them. A flag that cannot survive the exact
// operation it exists to support is not a fact, it is a stale label.
// So capability is answered about the model that will ACTUALLY be called: the table when the
// resolved slug is one this file has verified, the seat's declared flag when the resolved slug
// IS the baked default, and false when a world overrides to a slug nobody here has checked.
// Unverified is not capable. Failing closed costs at most an image left as text or a tool
// array withheld; failing open costs the turn, which is the whole 911 above.
var MODEL_CAPABILITY = {
  'qwen/qwen3.5-flash-02-23':  { tools:true,  vision:true  },
  'minimax/minimax-01':        { tools:false, vision:true  },
  'z-ai/glm-5.2':              { tools:true,  vision:false },
  // Founder direct 20260814: "4.6!! 4.6!! it just came out!! MY WORDS ALWAYS
  // TRUMP ALL!!" Verified live on OpenRouter the same day: same $2/$6 per
  // Mtok as 4.5, same 500k context, text+image+file in, tools and
  // structured_outputs in supported_parameters, and a real described tool
  // called correctly in a live round trip. 4.5 stays listed, superseded not
  // deleted, because a seat may still be pinned to it by env.
  'x-ai/grok-4.6':             { tools:true,  vision:true  },
  'x-ai/grok-4.5':             { tools:true,  vision:true  },
  'x-ai/grok-build-0.1':       { tools:true,  vision:true  },
  'moonshotai/kimi-k3':        { tools:true,  vision:true  },
  'qwen/qwen3-coder':          { tools:true,  vision:false },
  'qwen/qwen3-235b-a22b':      { tools:true,  vision:false },
  'qwen/qwen3-235b-a22b-2507': { tools:true,  vision:false },
  'deepseek/deepseek-v3.2':    { tools:true,  vision:false }
};

// resolvedModel is what this call will really send; bakedModel and declared are what the seat
// row says about its own default. Never guesses: an unknown override is false, not inherited.
function capability(kind, resolvedModel, bakedModel, declared) {
  var known = MODEL_CAPABILITY[resolvedModel];
  if (known) return !!known[kind];
  return resolvedModel === bakedModel ? !!declared : false;
}

// ⬡B:core.seat_map:911:a_generous_cap_bought_him_LESS_than_setting_nothing_and_nobody_told_him:20260731⬡
// HIT PERSONALLY BY THE FOUNDER ON 20260731, and it is a TRAP, not merely a limit. This reader
// ended with a comparison against a hundred, and anything above it returned null. null already
// meant INVALID everywhere downstream: `seat()` publishes it as `dailyCapUsd:null`, and
// `core/openrouter.seat.spend.js` refuses the seat outright with
// openrouter_seat_daily_cap_invalid. So a founder who typed a generous number to be GENEROUS
// killed the seat, a founder who typed nothing kept a working one, and no surface anywhere said
// a word about it. He believed his edit had taken. That is the worst defect shape in this
// estate: a value a human set that is silently not in force, because he has no reason to look
// again.
//
// TWO THINGS CHANGE, and both are the founder's 20260731 order (remove the bullshit limits,
// also in the code):
//   1. THERE IS NO UPPER BOUND. The hundred was a coder literal, not a provider rule and not a
//      billing rule. Whatever he sets is what is enforced, at any size. The reader is now
//      core/ceiling.owner.js, which cannot express a maximum at all, so the bound cannot be
//      reintroduced without adding the concept back and tripping the suite that forbids it.
//   2. NULL CAN NEVER AGAIN BE SILENT. Every read reports `chosen_by`, so a caller can tell
//      'the founder' from 'this_lane' (a value baked into this file, which is what every
//      dailyCapUsd below still is) from 'unreadable_setting' (configured and unusable, which
//      still fails closed) from 'nobody_yet'. `capReason` names the exact shape fault. A cap
//      that is not in force now announces itself instead of reading as a working seat.
// The baked dailyCapUsd numbers below are NOT touched here: raising or lowering a real dollar
// figure is a founder spend decision, not a lane's. They are now correctly LABELLED as this
// lane's, which is what /coda/sensors/health has been saying in prose since 20260728.
var ceilingOwner = require('./ceiling.owner.js');

// Codex review, live: this used to hand ceilingOwner.readCeiling the RAW runtime object
// (runtime || process.env) directly, so it read process.env[key] itself and never once
// consulted floorOverlay above -- the exact overlay her signed floor writes into and the exact
// function (env()) every OTHER reader in this file goes through. A signed SEAT_*_DAILY_CAP_USD
// row would apply to nothing: capChosenBy would still read 'this_lane' or 'nobody_yet' and the
// baked value would win, silently, the same shape as the 20260731 911 above about a cap that
// looks configured but is not in force. Fixed by resolving through env() FIRST -- same
// operator-env-then-floor precedence every other seat value already gets -- and handing
// readCeiling a synthetic single-key object carrying that resolved value, so its own shape
// validation, chosen_by labelling and NOBODY/LANE/FOUNDER logic all still run unchanged. When
// env() finds nothing (no operator override, no floor row), the object passed through is the
// exact same runtime || process.env as before, so a world with no floor behaves identically.
function capDetail(key, dflt, runtime) {
  var resolved = env(key, undefined, runtime);
  var effectiveRuntime = runtime || process.env;
  if (resolved !== undefined) {
    effectiveRuntime = {};
    effectiveRuntime[key] = resolved;
  }
  return ceilingOwner.readCeiling(key,
    { decimals: 4, lane_value: Number.isFinite(dflt) && dflt > 0 ? dflt : null },
    effectiveRuntime);
}

function envUsd(key, dflt, runtime) { return capDetail(key, dflt, runtime).value; }

// role, default model (env-overridable per seat), transport provider, the
// per-function named key env and telemetry via label. Dollar caps are not
// represented here: OpenRouter usage is observable, but this process cannot
// atomically enforce a per-key USD limit, so publishing one would be false.
//
// ⬡B:core.seat_map:911:the_everyday_seat_was_the_one_model_that_cannot_hold_a_tool:20260728⬡
// LIVE OUTAGE, reproduced twice against the running world on 20260728, 100% deterministic:
// a chat turn that needs no tool answered normally, seven stages, committed. A chat turn
// that carries tools ("how many months until I have saved 3600") came back
//   ok:false  no_answer:pai_seat:_message_:_No_endpoints_found_that_support_tool_use.
// The whole turn, not a degraded one. Root cause, verified by hand against OpenRouter's own
// roster the same day (GET /api/v1/models, supported_parameters, per model, never assumed):
// of every model seated in this file, `minimax/minimax-01` was the ONLY one with no
// tool-use-capable endpoint. It was seated on `c2_organ`, which core/tool.loop.js's
// _paiSeatName() routes EVERY non-voice, non-coding channel to, and the founder's own
// 20260726 law is that she holds her tools for the whole run. So the everyday chat seat was
// the one seat whose entire job the seated model structurally could not do, and OpenRouter
// rejected the request outright rather than answering without tools.
//
// The seat's declared GLM-5.2 failover did not save it: that failover is consulted by
// core/model.router.js and the judge, not by tool.loop's completion door, which resolves
// seat() once and returns the provider error. Fixing that door is a tool.loop.js change and
// that file belongs to another lane; it is reported, not taken, and it is the reason this
// fix lands here, on the one source that actually decides which model leaves.
//
// THE RE-SEAT, and the founder ruling it supersedes. The 20260722 ruling picked MiniMax-01
// on four stated criteria: fresh, strong, cheap, clean fast JSON, 1M context. Tool use was
// not among them because nobody had the fact. `qwen/qwen3.5-flash-02-23` satisfies every one
// of those criteria that a re-seat can still honor and regresses nothing measured against
// what was live: tool use no (dead) -> yes, vision yes -> yes (the 20260727 image handoff
// keeps working), 1M context -> 1M context, and $0.20/$1.10 per M -> $0.07/$0.26 per M,
// CHEAPER than the model it replaces, which is the penny hustle read of the law rather than
// a coder buying a bigger mind. Every price and capability here is from OpenRouter's live
// roster on 20260728, not memory. The GLM-5.2 failover the founder declared for this seat is
// untouched and still carries the bigger mind when the primary misses.
// STATED PLAINLY, not buried: this seats the C2 organ on the same model slug as the C1 penny
// gate, so the two tiers now differ by key, cap and role rather than by model. That is a real
// doctrine cost. It is the founder's to weigh, and it is one env var either way, with no code
// change and no deploy of this file: SEAT_C2_MODEL=z-ai/glm-5.2 buys back the bigger mind at
// 8x the input price and loses vision on this seat; SEAT_C2_MODEL=minimax/minimax-01 restores
// his original pick and re-breaks every tool-carrying turn.
//
// ⬡B:core.seat_map:WIRE:tool_use_capability_is_a_confirmed_fact_not_a_guess:20260728⬡
// `tools` states whether THIS seat's baked default model has a tool-use-capable endpoint,
// checked live against OpenRouter's own roster (GET /api/v1/models, supported_parameters
// contains `tools`) on 20260728, per model, never inferred from a family name. Same contract
// as `vision` directly below, including its caveat: it reflects the BAKED DEFAULT only, so a
// SEAT_*_MODEL env override to a different slug does not retarget this flag any more than it
// retargets `role`. `fallbackTools` says the same thing about the seat's declared failover,
// because a failover that cannot carry tools is no failover for a tool-carrying seat.
// Verified false for exactly one model this file has ever seated, `minimax/minimax-01`, which
// is why the row above exists.
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
  c1_cellm:    { role: 'C1 penny gate',        envModel: 'SEAT_C1_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C1_CELLM',    via: 'openrouter', capEnv:'SEAT_C1_CELLM_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true },
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
  // `x-ai/grok-4.6`, also tools+vision, so a miss escalates to a strong mind instead of
  // falling to a text-only model that would break the vision turn.
  //
  // SEAT_C2_MODEL still overrides for an env-only re-seat with no deploy. Whoever sets it:
  // the value MUST support BOTH tool use AND image input or one of these two outages returns.
  c2_organ:    { role: 'C2 deliberation organ',envModel: 'SEAT_C2_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C2_ORGAN',    via: 'openrouter', capEnv:'SEAT_C2_ORGAN_DAILY_CAP_USD', dailyCapUsd:6, vision:true, tools:true,
                 fallbackModel: 'x-ai/grok-4.6', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_C2_ORGAN', fallbackTools:true },
  // Founder ruling 20260722: Grok 4.5 is the mind; GLM-5.2 is its failover. Grok is
  // SUPERSEDED 20260814, founder direct: "4.6!! 4.6!! it just came out!! MY WORDS
  // ALWAYS TRUMP ALL!!" The seat is Grok 4.6. The 20260722 line above is kept as
  // written because his rulings are superseded, never deleted; everything it says
  // about why Grok holds this seat still holds, only the version moved.
  // closed-weight (xAI) and founder-lifted from the ban for this seat. Seated on C3
  // (the flagship mind) only, not the high-volume C2 organ, to keep the $2/$6-per-M
  // Grok off the everyday workhorse. verified live 20260722.
  c3_mind:     { role: 'C3 mind / A NU synth', envModel: 'SEAT_C3_MODEL',      model: 'x-ai/grok-4.6',            provider: 'openrouter', keyEnv: 'OR_KEY_MIND_GROK',   via: 'openrouter', capEnv:'SEAT_C3_MIND_DAILY_CAP_USD', dailyCapUsd:6, vision:true, tools:true,
                 fallbackModel: 'qwen/qwen3-235b-a22b-2507', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_MIND_GROK', fallbackTools:true },
  c4_watch:    { role: 'C4 CLAIR watch',       envModel: 'SEAT_C4_MODEL',      model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_C4_WATCH',    via: 'openrouter', capEnv:'SEAT_C4_WATCH_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true },
  // W3-L4 OVERSEER (docs/roadmaps/THE_COMPANY_ROADMAP_20260731.md, census B-109/B-82/B-143),
  // the exit decider: which pass-off channel a high-importance finding gets. Before this seat,
  // core/reach.WONDER.decision_organ.20260722.js#judgeExit (the mind behind
  // core/overseer/exit.tool.js#runExitPass) rode the shared `deliberation` ladder seat by
  // default, the same general-purpose pool that already starved SEATED once (the 20260728
  // no_rung_answered 503, this file's own deliberation entry above). An exit judgment competing
  // with advisor and story-generation traffic for the same daily dollar ceiling is exactly that
  // failure shape again, and its spend was unattributable besides. Same proven cheap pick already
  // carrying C1/C4/voice (tools:true, vision:true, confirmed live against MODEL_CAPABILITY
  // above), its own named key so an exit-decision bleed traces to this seat alone. No fallback
  // declared: judgeExit already floors to the cold LOGFUL pick when no mind answers (never
  // undecided), so a second paid rung here would only be a second bill for the same safety net.
  overseer:    { role: 'OVERSEER exit decider',envModel: 'SEAT_OVERSEER_MODEL', model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_OVERSEER',    via: 'openrouter', capEnv:'SEAT_OVERSEER_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true },
  // AUDRA is contained by CODA, but contained does not mean anonymous. These two
  // seats used to live only in coding-department/audra/seats.js, outside this one
  // ownership map. The global OpenRouter dollar brake therefore refused both exact
  // credentials as openrouter_key_has_no_named_seat before provider egress. They are
  // env-required because a world that has not commissioned AUDRA must not inherit a
  // model or a coder-chosen cap merely by loading the template.
  audra_watch: { role:'AUDRA C4 factual triage',envModel:'AUDRA_WATCH_MODEL',model:null,
    envProvider:'AUDRA_WATCH_PROVIDER',provider:'openrouter',keyEnv:'OR_KEY_AUDRA_WATCH',
    via:'openrouter',capEnv:null,dailyCapUsd:null,unlimitedDailySpend:true,
    requiredEnv:true,vision:false,tools:false },
  audra_organ: { role:'AUDRA C2 shadow judgment',envModel:'AUDRA_ORGAN_MODEL',model:null,
    envProvider:'AUDRA_ORGAN_PROVIDER',provider:'openrouter',keyEnv:'OR_KEY_AUDRA_ORGAN',
    via:'openrouter',capEnv:null,dailyCapUsd:null,unlimitedDailySpend:true,
    requiredEnv:true,vision:false,tools:false },
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
  // ⬡B:core.seat_map:FIX:founder_pick_grok_4.5_over_kimi_for_the_coda_seat:20260729⬡
  // Founder direct 20260729: no Kimi, no GLM-5.2, no Ornith as a production seat pick
  // (fable/opus already never were), unless a seat is a Wonder Games or cook-off
  // CONTESTANT, where model diversity is the point of the contest. CODA's own seat is
  // not a contestant, so Kimi is out here; Grok 4.6 is the founder's stated first
  // choice and is already confirmed tools:true, vision:true against the live
  // OpenRouter roster (MODEL_CAPABILITY above). keyEnv is left as OR_KEY_CODA_KIMI on
  // purpose: it names an already-provisioned credential, not a model, and renaming it
  // would require the founder to set a brand new env var on Render for no functional
  // gain, which is exactly the kind of busywork he told every lane tonight to stop
  // creating for him.
  coda:        { role: 'coding adviser (CODA)',envModel: 'SEAT_CODA_MODEL',    model: 'x-ai/grok-4.6',            provider: 'openrouter', keyEnv: 'OR_KEY_CODA_KIMI',   via: 'openrouter', capEnv:'SEAT_CODA_DAILY_CAP_USD', dailyCapUsd:40, vision:true, tools:true },
  deploy_tool: { role: 'deploy/tool seat',     envModel: 'SEAT_DEPLOY_MODEL',  model: 'qwen/qwen3-coder',         provider: 'openrouter', keyEnv: 'OR_KEY_DEPLOY_QWEN', via: 'openrouter', capEnv:'SEAT_DEPLOY_TOOL_DAILY_CAP_USD', dailyCapUsd:4, vision:false, tools:true },
  // FOUNDER 911 20260722: Ornith is RETIRED and RunPod is out entirely (the live
  // endpoint was failure-looping: 937 failures, 0 completions, billed GPU). The
  // judge seat moves to its own proven reliability pick: qwen3-235b (2-4s clean
  // strict JSON, verified) on OpenRouter, with Kimi K3 as the failover so a qwen
  // miss never leaves a contest ungraded. No RunPod anywhere in this map.
  // judge's declared failover is no longer Kimi (founder ban, 20260729; this seat judges
  // contestants, it is not itself a contestant). Grok 4.6 replaces it: confirmed
  // tools:true against the live roster, same as every other seat re-picked tonight.
  judge:       { role: 'wonder + cookoff judge',envModel: 'SEAT_JUDGE_MODEL',  model: 'qwen/qwen3-235b-a22b-2507',provider: 'openrouter', keyEnv: 'OR_KEY_JUDGE_QWEN', via: 'openrouter', capEnv:'SEAT_JUDGE_DAILY_CAP_USD', dailyCapUsd:4, vision:false, tools:true,
                 fallbackModel: 'x-ai/grok-4.6', fallbackProvider: 'openrouter', fallbackKeyEnv: 'OR_KEY_JUDGE_QWEN', fallbackTools:true },
  // Founder ban 20260729: no GLM-5.2 as a production seat pick outside a Wonder Games /
  // cook-off contestant slot. CANON and advisors are graders/thinkers, not contestants,
  // so both move to Grok 4.6, the founder's stated first choice, confirmed tools:true
  // and vision:true against the live OpenRouter roster (MODEL_CAPABILITY above); the
  // seat's own vision flag is corrected from false to true to match, the same rule this
  // file already states for GLM-5.2 vs. the models that replace it here.
  canon:       { role: 'CANON grader',         envModel: 'SEAT_CANON_MODEL',   model: 'x-ai/grok-4.6',            provider: 'openrouter', keyEnv: 'OR_KEY_CANON',       via: 'openrouter', capEnv:'SEAT_CANON_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true },
  // Founder correction 20260802: an attributable bill is required; a coder ceiling is not.
  // No stale environment alias may silently turn the independent advisor estate into a hold.
  advisors:    { role: 'board advisors',       envModel: 'SEAT_ADVISOR_MODEL', model: 'x-ai/grok-4.6',            provider: 'openrouter', keyEnv: 'OR_KEY_ADVISORS',    via: 'openrouter', capEnv:null, dailyCapUsd:null, unlimitedDailySpend:true, vision:true, tools:true },
  // ⬡B:core.seat_map:WIRE:the_ladders_second_rung_is_a_declared_failover_not_a_literal:20260728⬡
  // core/model.ladder.js walks two OpenRouter rungs on this one seat. Its second rung used to
  // carry a model slug hardcoded in that file (`qwen/qwen3-235b-a22b`, $0.455/$1.82 per M),
  // which is a second hand-maintained copy of a decision this file owns. Declared here as a
  // real failover so the ladder resolves it the same way every other seat resolves one, and
  // moved to the -2507 build this file already trusts for the judge seat (verified live
  // 20260721, 2-4s clean strict JSON) which is also $0.09/$0.55 per M and 262k context: five
  // times cheaper than the literal it replaces, on a model this house has already proved.
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
  // Founder ban 20260729: no GLM-5.2 as a production pick. The general ladder moves to
  // Grok 4.6 (confirmed tools:true, vision:true), Qwen stays as its declared failover,
  // already the founder's own stated second choice and already proven on this seat.
  deliberation:{ role: 'general deliberation ladder',envModel:'SEAT_LADDER_MODEL',model:'x-ai/grok-4.6',           provider:'openrouter', keyEnv:'OR_KEY_MODEL_LADDER',  via:'openrouter', capEnv:'SEAT_DELIBERATION_DAILY_CAP_USD', dailyCapUsd:25, vision:true, tools:true,
                 fallbackModel:'qwen/qwen3-235b-a22b-2507', fallbackProvider:'openrouter', fallbackKeyEnv:'OR_KEY_MODEL_LADDER', fallbackTools:true },
  // Live founder-call evidence on 20260730 proved that a single voice model is
  // not redundancy: one stalled completion consumed the whole shared voice
  // deadline and left the connected call silent. Keep the measured low-latency
  // Qwen Flash primary, and give this exact seat one tool-capable Qwen instruct
  // fallback on the same named wallet. tool.loop bounds the primary attempt so
  // the fallback still owns a real window inside the one governed PAI cycle.
  voice_fast:  { role: 'voice reasoning',      envModel: 'SEAT_VOICE_MODEL',   model: 'qwen/qwen3.5-flash-02-23', provider: 'openrouter', keyEnv: 'OR_KEY_VOICE_QWEN',  via: 'openrouter', capEnv:'SEAT_VOICE_FAST_DAILY_CAP_USD', dailyCapUsd:3, vision:true, tools:true,
                 fallbackModel:'qwen/qwen3-30b-a3b-instruct-2507', fallbackProvider:'openrouter', fallbackKeyEnv:'OR_KEY_VOICE_QWEN', fallbackTools:true },
  runaway_sweep:{ role:'runaway SHADOW judge', envModel:'RUNAWAY_SWEEP_MODEL', model:'qwen/qwen3.5-flash-02-23', provider:'openrouter',keyEnv:'OR_KEY_RUNAWAY_SWEEP',via:'openrouter', capEnv:'SEAT_RUNAWAY_SWEEP_DAILY_CAP_USD', dailyCapUsd:1, vision:true, tools:true },
  wonder_games_glm:  { role: 'Wonder Games GLM contestant',  envModel:'WONDER_GAMES_GLM_MODEL',  model:'z-ai/glm-5.2',       provider:'openrouter',keyEnv:'OR_KEY_WONDER_GAMES_GLM', via:'openrouter', capEnv:'SEAT_WONDER_GAMES_GLM_DAILY_CAP_USD', dailyCapUsd:2, vision:false, tools:true },
  wonder_games_qwen: { role: 'Wonder Games Qwen contestant', envModel:'WONDER_GAMES_QWEN_MODEL', model:'qwen/qwen3-235b-a22b',provider:'openrouter',keyEnv:'OR_KEY_WONDER_GAMES_QWEN',via:'openrouter', capEnv:'SEAT_WONDER_GAMES_QWEN_DAILY_CAP_USD', dailyCapUsd:2, vision:false, tools:true },
  cookoff_kimi:     { role: 'cook-off Kimi contestant',     envModel: 'COOKOFF_KIMI_MODEL',     model: 'moonshotai/kimi-k3',     provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_KIMI',     via: 'openrouter', capEnv:'SEAT_COOKOFF_KIMI_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true },
  cookoff_qwen:     { role: 'cook-off Qwen contestant',     envModel: 'COOKOFF_QWEN_MODEL',     model: 'qwen/qwen3-coder',       provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_QWEN',     via: 'openrouter', capEnv:'SEAT_COOKOFF_QWEN_DAILY_CAP_USD', dailyCapUsd:2, vision:false, tools:true },
  cookoff_glm:      { role: 'cook-off GLM contestant',      envModel: 'COOKOFF_GLM_MODEL',      model: 'z-ai/glm-5.2',           provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_GLM',      via: 'openrouter', capEnv:'SEAT_COOKOFF_GLM_DAILY_CAP_USD', dailyCapUsd:2, vision:false, tools:true },
  cookoff_deepseek: { role: 'cook-off DeepSeek contestant', envModel: 'COOKOFF_DEEPSEEK_MODEL', model: 'deepseek/deepseek-v3.2', provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_DEEPSEEK', via: 'openrouter', capEnv:'SEAT_COOKOFF_DEEPSEEK_DAILY_CAP_USD', dailyCapUsd:2, vision:false, tools:true },
  cookoff_grok:     { role: 'cook-off Grok contestant',     envModel: 'COOKOFF_GROK_MODEL',     model: 'x-ai/grok-build-0.1',    provider: 'openrouter', keyEnv: 'OR_KEY_COOKOFF_GROK',     via: 'openrouter', capEnv:'SEAT_COOKOFF_GROK_DAILY_CAP_USD', dailyCapUsd:2, vision:true, tools:true }
};

// ⬡B:core.seat_map:FIX:a_banned_env_override_still_won_at_the_one_resolver:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P1. "env truth wins" was written as an
// absolute, and a deployment setting SEAT_CODA_MODEL (or any SEAT_*_MODEL /
// SEAT_*_MODEL_FALLBACK) to Kimi, GLM-5.2, Ornith, Opus, or Fable would have been
// honored here unchecked, on the one seat every production, non-contestant caller
// resolves through, which defeats the entire ban this file's own guard exists to hold.
// A Wonder Games / cook-off CONTESTANT seat is exempt, same as everywhere else tonight;
// a banned override on any other seat is treated exactly like a banned JUDGE_MODEL
// override already is in core/judge.js: as if it were never set, falling back to the
// seat's own baked, already-verified-compliant default rather than silently spending it.
function isContestantSeat(name) { return /^(cookoff_|wonder_games_)/.test(String(name || '')); }

// Resolve a seat, reading its model fresh from env each call (env truth wins;
// the baked default is only the floor). Unknown seat returns null, never a guess.
function seat(name, runtime) {
  var d = SEATS[name];
  if (!d) return null;
  var isContestant = isContestantSeat(name);
  var resolvedModel = env(d.envModel, d.model, runtime);
  var resolvedProvider = d.envProvider ? env(d.envProvider, '', runtime) : d.provider;
  var unlimitedDailySpend = d.unlimitedDailySpend === true;
  var cap = unlimitedDailySpend ? {value:null,chosen_by:'nobody_yet',requested:null,
    reason:null,needs_review:false} : capDetail(d.capEnv, d.dailyCapUsd, runtime);
  var resolvedCap = cap.value;
  if (d.requiredEnv && (!resolvedModel || resolvedProvider !== d.provider ||
      (!unlimitedDailySpend && resolvedCap === null))) {
    return null;
  }
  if (!isContestant && isBannedProductionModel(resolvedModel)) {
    // Ruling 20260807: refusal stands, silence does not. Record loudly and keep refusing.
    recordBanRefusal(name, resolvedModel, d.model);
    resolvedModel = d.model;
  }
  if (d.requiredEnv && !resolvedModel) return null;
  // ⬡B:core.seat_map:FIX:hasFallback_compared_the_raw_override_not_the_normalized_one:20260729⬡
  // CAUGHT BY CATHY (Codex) IN REVIEW ON template-mind#322, P2: this compared the RAW
  // SEAT_*_MODEL_FALLBACK env read against resolvedModel, but fallback() below compares
  // the same value AFTER normalizing a banned override back to the baked default. A
  // banned fallback override (SEAT_C2_MODEL_FALLBACK=glm-5.2 with SEAT_C2_MODEL already
  // at the baked default) reported hasFallback:true here while fallback() itself
  // normalized to the baked default and returned null (no real failover), so the two
  // exported facts contradicted each other. Normalized the same way here so they agree.
  var resolvedFallback = d.fallbackModel ? env(d.envModel + '_FALLBACK', d.fallbackModel, runtime) : null;
  if (resolvedFallback && !isContestant && isBannedProductionModel(resolvedFallback)) {
    recordBanRefusal(name + '.fallback', resolvedFallback, d.fallbackModel);
    resolvedFallback = d.fallbackModel;
  }
  return {
    seat: name,
    role: d.role,
    model: resolvedModel,
    provider: resolvedProvider,
    keyEnv: d.keyEnv,
    via: d.via,
    dailyCapUsd: resolvedCap,
    unlimitedDailySpend: unlimitedDailySpend,
    capEnv: d.capEnv,
    // WHO CHOSE THIS DOLLAR FIGURE, published beside it rather than inferred by each caller.
    // 'the founder' means his env value is in force exactly. 'this_lane' means the number baked
    // into this file is standing in and no human picked it. 'unreadable_setting' means he set
    // something that cannot be used, `capReason` names the shape fault, and the seat fails
    // closed at provider egress instead of pretending to have a cap. A caller that used to
    // re-derive this from its own copy of the env parse now reads the one source.
    capChosenBy: cap.chosen_by,
    capRequested: cap.requested,
    capReason: cap.reason,
    capNeedsReview: cap.needs_review,
    // Honest to the same rule as fallback() below: a fallback that resolves to the
    // primary's own model is not a fallback, so this seat reports that it has none.
    // Compared against `resolvedModel`, not the raw env read, so a banned override
    // corrected above cannot make this fact disagree with the model field beside it.
    hasFallback: !!(d.fallbackModel && resolvedFallback !== resolvedModel),
    // Both answered about `resolvedModel`, the model this call will really send, not
    // about the row's baked default. A caller that sends an image part to a seat this
    // says is not vision-capable, or a tools array to a seat this says cannot hold one,
    // is choosing a request the provider will refuse; that is the caller's call to make,
    // and this file's job is only to tell it the truth about the model it is about to use.
    vision: capability('vision', resolvedModel, d.model, d.vision),
    tools: capability('tools', resolvedModel, d.model, d.tools)
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
// ⬡B:core.seat_map:FIX:a_banned_fallback_override_still_won_too:20260729⬡
// Same fix as seat() above, on the same finding: SEAT_*_MODEL_FALLBACK could set a
// banned model on a non-contestant seat's failover and it would have been honored here
// unchecked. Treated the same way: a banned override is as if it were never set.
function fallback(name, runtime) {
  var d = SEATS[name];
  if (!d || !d.fallbackModel) return null;
  var isContestant = isContestantSeat(name);
  var resolvedPrimary = env(d.envModel, d.model, runtime);
  if (!isContestant && isBannedProductionModel(resolvedPrimary)) {
    recordBanRefusal(name, resolvedPrimary, d.model);
    resolvedPrimary = d.model;
  }
  var resolvedFallback = env(d.envModel + '_FALLBACK', d.fallbackModel, runtime);
  if (!isContestant && isBannedProductionModel(resolvedFallback)) {
    recordBanRefusal(name + '.fallback', resolvedFallback, d.fallbackModel);
    resolvedFallback = d.fallbackModel;
  }
  if (resolvedFallback === resolvedPrimary) return null;
  // The failover attempt is the SAME governed seat on the same wallet, so it reads the same cap
  // through the same one source and publishes the same ownership facts. Deriving them a second
  // way here is how the two halves of one seat start disagreeing about what is in force.
  var unlimitedDailySpend = d.unlimitedDailySpend === true;
  var fbCap = unlimitedDailySpend ? {value:null,chosen_by:'nobody_yet',requested:null,
    reason:null,needs_review:false} : capDetail(d.capEnv, d.dailyCapUsd, runtime);
  return {
    seat: name + '.fallback',
    role: d.role + ' (fallback)',
    model: resolvedFallback,
    provider: d.fallbackProvider,
    keyEnv: d.fallbackKeyEnv,
    via: d.fallbackProvider,
    dailyCapUsd: fbCap.value,
    unlimitedDailySpend: unlimitedDailySpend,
    capEnv: d.capEnv,
    capChosenBy: fbCap.chosen_by,
    capRequested: fbCap.requested,
    capReason: fbCap.reason,
    capNeedsReview: fbCap.needs_review,
    hasFallback: false,
    // Same rule as the primary: answered about the failover model that will really be
    // called, so a SEAT_*_MODEL_FALLBACK re-seat cannot inherit a stale capability claim.
    tools: capability('tools', resolvedFallback, d.fallbackModel, d.fallbackTools),
    vision: capability('vision', resolvedFallback, d.fallbackModel, false)
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

function resolveKey(s, runtime) {
  if (!s) return '';
  var key = sanitizeKey((runtime || process.env)[s.keyEnv]);
  // Ruling 20260808: a missing wallet says its own name. A seat whose named key env is
  // absent used to fail closed in SILENCE here; every caller then surfaced only its own
  // generic symptom (wonder_did_not_answer, no_answer) and a day burned finding the
  // unnamed dead wallet. The refusal itself is unchanged, and the key VALUE is never
  // printed, only the env var NAME.
  if (!key && s.keyEnv) recordKeyRefusal(s.seat, s.keyEnv);
  return key;
}

// ⬡B:core.seat_map:FIX:a_missing_wallet_says_its_own_name:20260808⬡
// The one reason token every caller of a keyless seat should surface, e.g.
// 'seat_key_missing:OR_KEY_C2_ORGAN'. Callers pass the resolved seat (or anything
// carrying keyEnv); the token names the env var, never a value. Same detect-and-wake
// shape as recordBanRefusal above (ruling 20260807): cold code flags loudly, a woken
// reader decides what it means.
function keyMissingReason(s) {
  return 'seat_key_missing:' + String(s && s.keyEnv || 'unknown_key_env');
}
var KEY_REFUSAL_CAP = 50;
var recentKeyRefusals = [];
var warnedKeyEnvs = Object.create(null);
function recordKeyRefusal(seatName, keyEnv) {
  var entry = {
    at: new Date().toISOString(),
    seat: String(seatName || 'unknown'),
    keyEnv: String(keyEnv || 'unknown_key_env'),
    reason: keyMissingReason({keyEnv: keyEnv})
  };
  recentKeyRefusals.push(entry);
  if (recentKeyRefusals.length > KEY_REFUSAL_CAP) recentKeyRefusals.shift();
  // One console line per key env per process, so a hot loop over a dead seat does not
  // drown the log that names it. The ring buffer records every refusal regardless.
  if (!warnedKeyEnvs[entry.keyEnv]) {
    warnedKeyEnvs[entry.keyEnv] = true;
    console.warn('[seat.map] SEAT KEY MISSING (loud by ruling 20260808): seat "' +
      entry.seat + '" has no usable key in env ' + entry.keyEnv +
      '. Calls on this seat will refuse; set the env var to fund the wallet.');
  }
  return entry;
}

function seatNames(runtime) {
  return Object.keys(SEATS).filter(function(name) {
    return !SEATS[name].requiredEnv || seat(name,runtime) !== null;
  });
}

// ⬡B:core.seat_map:LAW:no_fable_no_opus_no_kimi_no_glm_no_ornith_on_a_production_non_contestant_seat:20260729⬡
// Founder direct 20260729: "no fable, no opus, no kimi, no glm 5.2 no ornith, unless some
// are in wonder games!" The one exemption is a Wonder Games / cook-off CONTESTANT (or its
// judge) seat, where model diversity, or a separate judge, is the whole point. Fable and
// Opus never appeared as a hardcoded literal on any production seat here, but that is not
// the same as this pattern covering them: a DYNAMIC override read from an env var at
// runtime (JUDGE_MODEL, for one) is invisible to a static grep, so all five banned
// families are checked here, not only the two that happened to be baked-model literals.
// This is the ONE source for that check: tests/seat.map.test.js's regression guard and
// any direct caller that resolves a model OUTSIDE the normal seat() path (an env-only A/B
// override, for example) both call this rather than each keeping their own copy of the
// pattern, the same lesson this file has already applied to every other duplicated
// decision.
// ⬡B:core.seat_map:FIX:a_provider_prefixed_pattern_missed_the_bare_id_shape:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON template-mind#322, P1: requiring the OpenRouter
// prefix (`moonshotai/kimi`, `z-ai/glm-5.2`) or the `claude-` prefix (`claude-opus`,
// `claude-fable`) let a bare, unqualified id through unmatched: `isBannedProductionModel
// ('kimi-k3')`, `('glm-5.2')` and `('opus-4-8')` all returned false. An unqualified id is
// a real shape in this estate (`GLM_RUNPOD_MODEL` itself defaults to the bare `'glm-5.2'`,
// no provider prefix at all), and this helper exists specifically to validate an ARBITRARY
// env override, which can be typed in any shape an operator chooses, not only the exact
// spelling a seat happens to bake. Matching the bare family keyword, the same style this
// file's own sibling guard already uses for other banned providers (`deepseek`, `gemini`,
// `groq`, no prefix required either), closes this without needing to enumerate every
// prefix a family could ever be spelled with.
var BANNED_PRODUCTION_MODEL = /(kimi|glm-5\.2|ornith|opus|fable)/i;
function isBannedProductionModel(model) { return BANNED_PRODUCTION_MODEL.test(String(model || '')); }

// ⬡B:core.seat_map:RULING:a_regex_may_detect_only_a_woken_wonder_decides:20260807⬡
// Founder 911 doctrine drop, recorded in docs/RULINGS.md 20260807: "regex pass or fail
// wakes a wonder, an ABA LLM, instead of nasty cough where regex decides and executes."
// This ban used to refuse silently: an operator wiring a banned SEAT_*_MODEL got the baked
// default back with no word said anywhere, and would burn a night looping on the mystery.
// WHAT CHANGES HERE, and what does not: the refusal itself stays exactly as it was, cold
// code still never spends a banned model (safety is not softened one bit), but every
// refusal is now RECORDED LOUDLY, a console line naming the seat, the attempted model, and
// the ban's reason, plus a bounded in-process ring buffer the overseer's next cycle can
// read and EXPLAIN, which is the wake half of detect-and-wake. The decision about what the
// refusal means still belongs to a woken LLM reading this record, never to this regex.
// No env is read here and no PII is ever recorded: seat name, model slug, reason, time.
var BAN_REFUSAL_REASON = 'founder ban 20260729: no kimi, no glm-5.2, no ornith, no opus,' +
  ' no fable on a production non-contestant seat (Wonder Games / cook-off contestants exempt)';
var BAN_REFUSAL_CAP = 50;
var recentBanRefusals = [];
function recordBanRefusal(seatName, attemptedModel, keptModel) {
  var entry = {
    at: new Date().toISOString(),
    seat: String(seatName || 'unknown'),
    attemptedModel: String(attemptedModel || ''),
    keptModel: String(keptModel || ''),
    reason: BAN_REFUSAL_REASON
  };
  recentBanRefusals.push(entry);
  if (recentBanRefusals.length > BAN_REFUSAL_CAP) recentBanRefusals.shift();
  console.warn('[seat.map] BAN REFUSAL (detect-and-wake, ruling 20260807): seat "' +
    entry.seat + '" attempted banned model "' + entry.attemptedModel +
    '", kept "' + entry.keptModel + '". ' + entry.reason);
  return entry;
}

// ⬡B:core.seat_map:FIX:the_raw_together_callers_never_validated_their_own_env_override:20260729⬡
// CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P1. Every direct Together caller this
// PR migrated off the banned baked default (core/outreach.js, core/survey.js,
// core/interview.js, board/compose.js, board/grounding.js, management/dion.js,
// management/think.js, management/messages/iman/inbound.js, core/session.wonder.js,
// core/overseer/confidence.validator.js, core/journal.followthrough.js,
// core/logful.enrich.js) still read `process.env.TOGETHER_MODEL` UNVALIDATED: a live
// deployment env var left at (or reset to) `zai-org/GLM-5.2` would still win, because
// `X || default` only ever falls to the default when X is absent, never when X is
// banned. This is the one place that fact gets checked, so twelve call sites do not
// each need their own copy of it.
// Ruling 20260807 (docs/RULINGS.md): the revert stays, the silence goes. A banned raw env
// override is still never spent, but the refusal is recorded loudly (console plus the
// recentBanRefusals ring buffer) so the overseer's next cycle can read and explain it.
// Third argument names the calling seat or surface for the record; optional so the twelve
// existing call sites keep working unchanged and simply record as 'env_override'.
function safeModelOverride(envValue, safeDefault, seatName) {
  var v = String(envValue || '').trim();
  if (v && !isBannedProductionModel(v)) return v;
  if (v) recordBanRefusal(seatName || 'env_override', v, safeDefault);
  return safeDefault;
}

module.exports = { SEATS: SEATS, seat: seat, fallback: fallback, resolveKey: resolveKey, seatNames: seatNames, sanitizeKey: sanitizeKey,
  // Codeless seats, 20260815: core/seat.floor.js hands her signed values in here and every
  // seat resolves against them with no deploy. floorOverlayValues is a read for the estate
  // monitor and the money wall, so an operator can see WHY a seat is on the model it is on.
  applyFloorOverlay: applyFloorOverlay, floorOverlayValues: floorOverlayValues,
  isBannedProductionModel: isBannedProductionModel, safeModelOverride: safeModelOverride,
  // Ruling 20260808, a missing wallet says its own name: the reason token builder and the
  // live record of every keyless-seat refusal (capped ring buffer, newest last). Never a
  // key value, only seat name + env var name. Callers surface keyMissingReason(seat)
  // instead of a generic no-answer symptom.
  keyMissingReason: keyMissingReason, recentKeyRefusals: recentKeyRefusals,
  // Ruling 20260807, detect-and-wake: the live record of every banned-model refusal this
  // process has made (capped ring buffer, newest last). The overseer reads this to explain
  // WHY a seat is not running the model an operator wired, instead of leaving a silent
  // mystery. Exported live so a reader sees refusals as they land; never contains PII.
  recentBanRefusals: recentBanRefusals,
  // A first class export, not a test hook. Any surface that wants to report who chose a seat's
  // dollar cap reads THIS rather than keeping its own copy of the env parse, which is exactly
  // the second hand maintained reader that let the trap above survive unnoticed.
  capDetail: capDetail,
  _test:{envUsd:envUsd} };
