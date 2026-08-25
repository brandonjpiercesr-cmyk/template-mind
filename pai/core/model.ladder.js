// ⬡B:core.model.ladder:MODULE:founder_authorized_models_20260715⬡
// THE FOUNDER'S ACTUAL AUTHORIZED LIST for general deliberation (advisors, story
// generation, dispatch planning): GLM 5.2, Ornith, and Qwen replacing Llama. Open
// weight. He called it out directly: too much of this codebase defaults straight
// to Groq (gpt-oss) as if it were the standing choice, when it is only meant to be
// the last-resort floor. This is the ONE shared resolver every general-deliberation
// call site should route through, so the real ladder holds everywhere at once
// instead of each file quietly reinventing its own Groq-only call.
// ABAHAM is the live door: PAI's outbound council calls this resolver for its
// SHADOW judgment, so provider fallback remains inside the same wired cycle.
'use strict';

var outputGuard = require('./model.output.guard.js');

// ⬡B:core.model_ladder:911:an_unanchored_strip_can_eat_a_real_answer:20260726⬡
// FOUND 20260726 by a third Codex pass, verified by hand: the two fixes below this
// comment were each correct on their own and dangerous together. An UNANCHORED
// `<think>...` strip removes that shape ANYWHERE it appears, so a real, human-facing
// answer that legitimately discusses or demonstrates `<think>` markup (explaining the
// tag, showing an example) would have had that real content silently deleted, or
// everything after it truncated if the example itself had no closing tag nearby.
//
// The fix is to ANCHOR: a real reasoning envelope from these providers is always a
// LEADING block, written before the real answer begins, never something a model
// inserts in the middle of prose it has already started writing. So this only ever
// strips from the start of the string: every leading, closed `<think>...</think>`
// block in sequence, then a leading, still-open `<think>` with no closer (the token-
// exhaustion case) to the end of what remains. A `<think>` occurring anywhere past the
// start of the real answer is left untouched, because it is content, not reasoning.
//
// One shared function, used everywhere this codebase strips a reasoning trace, so a
// second reasoning-shaped model never needs this fixed a fourth time.
//
// Known, stated limit, WIDENED 20260726 by a fourth Codex pass: this is not only an
// UNTERMINATED-tag problem. A real final answer that legitimately opens with a
// PROPERLY CLOSED literal example, `<think>example</think>That is what the tag looks
// like.`, is byte-for-byte the same shape as a real reasoning envelope followed by a
// real answer. `cleanModelContent('<think>example</think>', opts)` returns '', and the
// leading example in the longer case is silently deleted, keeping only the sentence
// after it. Verified directly, not assumed: `stripReasoningTrace` cannot tell these
// two intents apart, closed or unterminated, because nothing in the text says which
// one it is. That is not a bug this file can regex its way out of; the honest fix is
// a provider that separates reasoning from content in its own response shape, a
// platform-level fact this file does not control. THE ACCEPTED TRADEOFF, stated rather
// than silently made: this ladder's actual callers are a life-assistant deliberation
// cycle (advisors, budget, calendar, the recovery and exhaustion synthesis passes in
// core/tool.loop.js), not a coding assistant that teaches markup syntax. A real answer
// that needs to open with the literal string "<think>" as its own content is a realistic
// possibility this file accepts as a known, rare cost, against the alternative of
// leaving real reasoning residue unstripped in the common case, which is the defect
// this whole file exists to prevent. If a caller of this ladder ever needs to compose
// answers ABOUT think-tag markup as ordinary content, that caller needs a different
// contract than plain-text scrubbing, not a smarter regex here.
function stripReasoningTrace(content) {
  var text = content;
  text = text.replace(/^\s*(?:<think>[\s\S]*?<\/think>\s*)+/i, '');
  text = text.replace(/^\s*<think>[\s\S]*$/i, '');
  return text.trim();
}

// ⬡B:core.model_ladder:FIX:one_gate_carried_two_facts_and_one_opinion:20260815⬡
// THE DEAD OPTION, closed. core/tool.loop.js passed `noGuard:true` on the CJK rewrite call and
// NOTHING IN THIS FILE EVER READ IT (anew #2184 found it and deliberately left it). So the rewrite
// whose entire job is "render this answer in clear English" ran under the very rule that rejects
// CJK: any answer whose CORRECT English form must keep one glyph, a name, a dish, a filename, the
// term the person asked about, was rejected by every rung, deliberate() returned null, and her
// turn was destroyed. The guard was structurally guaranteed to destroy exactly the class it was
// written to handle.
//
// WHY NOT SIMPLY HONOUR `noGuard`, which is the obvious repair and is WRONG. This gate does not
// hold one rule, it holds THREE, and only one of them is an opinion:
//   empty_answer        there is no answer once the reasoning trace is stripped  A STRUCTURAL FACT
//   non_json_answer     the CALLER declared opts.json and this is not that       A CONTRACT THE CALLER ASKED FOR
//   non_english_answer  it contains CJK                                          AN OPINION
// A blanket bypass would waive the first two as well, so an empty string would be "accepted" and
// cold code would ship nothing as her answer. That is a worse bug than the one being fixed, and it
// is very likely why nobody ever wired `noGuard` up.
//
// SO THE WAIVER IS NARROW AND NAMED. `allowNonEnglish` suppresses the CJK rule and nothing else.
// Both structural checks keep holding for every caller including this one. The founder has never
// ruled that her output must be English, per the corpus search recorded in #2184, so the English
// rule is a coder's assumption and is the caller's to waive. The TRIGGER in core/tool.loop.js is
// untouched and stays his to rule on, exactly as #2184 left it.
//
// A PATTERN MAY DETECT AND REFUSE. THE CALLER MAY WAIVE ONLY THE OPINION.
function englishRuleWaived(opts) {
  return !!(opts && opts.allowNonEnglish === true);
}

// ⬡B:core.model.ladder:GUARD:json_contract_falls_through_provider_ladder:20260715⬡
// A provider returning non-empty prose is not a successful JSON deliberation.
// Validate the requested wire contract at each provider boundary so a malformed
// verdict falls through to the next authorized provider. If none returns one
// strict JSON object, deliberate() still returns null and the caller fails closed.
function hasAcceptedContent(content, opts) {
  if (typeof content !== 'string') return false;
  // ⬡B:core.model_ladder:911:plain_mode_accepted_pure_reasoning_residue:20260726⬡
  // FOUND 20260726 by an external review of #1163, verified by hand against this
  // file. The think-block strip below used to run ONLY when opts.json === true,
  // so a PLAIN mode call (exactly what the recovery and exhaustion synthesis
  // passes in core/tool.loop.js use) accepted any non-empty string as a real
  // answer, including one that was ENTIRELY a reasoning trace with no answer in
  // it at all. A reasoning model that burns its whole token budget inside
  // <think> and never reaches a real answer would have had that empty-of-
  // substance trace accepted as her reply. The only thing that counts as an
  // answer is what remains once the trace is stripped, in every mode, so the
  // strip runs first and the emptiness check runs on what is left. Uses
  // stripReasoningTrace so an unterminated <think> (token exhaustion mid
  // reasoning, no closing tag ever written) is caught the same way.
  var stripped = stripReasoningTrace(content);
  if (!stripped) return false;
  if (!englishRuleWaived(opts) && outputGuard.containsCjk(stripped)) return false;
  if (!opts || opts.json !== true) return true;
  // ⬡B:core.model_ladder:FIX:reasoning_residue_never_kills_a_good_answer:20260719⬡
  // GLM-5.2 and other reasoning models can wrap the real JSON in a thinking
  // trace or leading blank lines. Strip think blocks and grab the outermost
  // JSON object before judging, so a good answer with residue is accepted
  // instead of silently falling the whole turn to a cold RunPod pod.
  var text = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (text[0] !== '{') {
    var s = text.indexOf('{'); var e = text.lastIndexOf('}');
    if (s !== -1 && e > s) text = text.slice(s, e + 1);
  }
  try {
    var parsed = JSON.parse(text);
    return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch (e) {
    return false;
  }
}


// ⬡B:core.model_ladder:PROPOSED-RG:a_null_return_destroyed_the_only_evidence_of_why:20260808⬡
// PROPOSED-RG pending founder conversion.
// FOUND 20260808 on the life ingest door. deliberate() returned exactly `null` whenever a
// rung's answer failed hasAcceptedContent(), so a caller could not tell a missing seat key
// from an HTTP 429 from a provider that answered fluent prose under a strict JSON contract.
// The life classify wonder therefore reported every one of those as the single blanket
// reason `wonder_did_not_answer`, and a live run showed that reason with no way to act on
// it. This is the diagnosis channel: a caller may pass `opts.diagnostics` as an array, and
// every rung appends one plain fact about what it attempted and how it lost. The return
// contract is unchanged, so no existing caller behaves differently, and a caller that does
// not pass the array pays nothing.
//
// IT NEVER CARRIES CONTENT. A classification wall is built from a person's own life files,
// so the model's answer is life material by association. An entry records the SHAPE of the
// answer (its length, the verdict on it, the finish reason, the HTTP status) and never one
// byte of the answer itself.
function noteAttempt(opts, entry) {
  if (!opts || !Array.isArray(opts.diagnostics)) return entry;
  opts.diagnostics.push(entry);
  return entry;
}

// The one place a rejection is given its real name. hasAcceptedContent() answers only true
// or false, which is the right shape for a gate and the wrong shape for a receipt, so this
// asks the same questions in the same order and returns which one said no.
function contentVerdict(content, opts) {
  if (typeof content !== 'string') return 'empty_answer';
  var stripped = stripReasoningTrace(content);
  if (!stripped) return 'empty_answer';
<<<<<<< HEAD
  if (outputGuard.containsCjk(stripped)) return 'non_english_answer';
=======
  if (!englishRuleWaived(opts) && outputGuard.containsCjk(stripped)) return 'non_english_answer';
>>>>>>> origin/main
  if (!opts || opts.json !== true) return 'accepted';
  return hasAcceptedContent(content, opts) ? 'accepted' : 'non_json_answer';
}

// One rung's answered attempt, recorded whatever the verdict. `answered:true` means the
// provider returned HTTP 200 and a content field; it does not mean the answer was usable.
function noteAnswer(opts, base, content, finishReason) {
  var verdict = contentVerdict(content, opts);
  noteAttempt(opts, Object.assign({}, base, {
    answered: true,
    status: 200,
    finishReason: finishReason == null ? null : String(finishReason),
    contentChars: typeof content === 'string' ? content.length : 0,
    verdict: verdict,
    reason: verdict === 'accepted' ? null : verdict
  }));
  return verdict;
}

function finishReasonOf(payload) {
  var choice = ((payload && payload.choices) || [])[0] || {};
  return choice.finish_reason || choice.finishReason || null;
}

function cleanModelContent(content, opts) {
  if (typeof content !== 'string') return content;
  // ⬡B:core.model_ladder:911:plain_mode_never_scrubbed_the_reasoning_trace:20260726⬡
  // FOUND 20260726, same review as the hasAcceptedContent fix above. This scrub
  // used to run ONLY when opts.json === true. Every plain-text call in this
  // codebase, which is what the recovery and exhaustion synthesis passes in
  // core/tool.loop.js actually use, passed straight through unscrubbed, so a
  // reasoning model's <think> block could ride along into a real human-facing
  // reply. There is no mode where leaving a raw reasoning trace in an answer is
  // correct, so the strip is unconditional. Only the JSON-specific code-fence
  // and outer-brace extraction stay gated on json mode: running brace
  // extraction on a legitimate plain-English answer that happens to mention a
  // brace would corrupt it, which is not a risk json mode carries. Uses
  // stripReasoningTrace so an unterminated <think> is caught the same way.
  var text = stripReasoningTrace(content);
  if (!opts || opts.json !== true) return text;
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (text[0] !== '{') {
    var s = text.indexOf('{'); var e = text.lastIndexOf('}');
    if (s !== -1 && e > s) text = text.slice(s, e + 1);
  }
  return text;
}

function combinedSignal(signals) {
  var active = (signals || []).filter(function (signal) { return !!signal; });
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  var controller = new AbortController();
  active.forEach(function (signal) {
    if (signal.aborted && !controller.signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', function () {
      if (!controller.signal.aborted) controller.abort(signal.reason);
    }, { once:true });
  });
  return controller.signal;
}

function requestSignal(opts, timeout) {
  var requested = Number(timeout);
  var deadline = Number.isFinite(requested) && requested > 0
    ? AbortSignal.timeout(Math.floor(requested)) : null;
  return combinedSignal([opts && opts.signal, deadline]);
}

async function providerFetch(url, init) {
  var edge = require('./provider.request.edge.js');
  var admission = edge.currentAdmission();
  if (!admission) return fetch(url, init);
  var attempted = await edge.executeCurrentProviderRequest({hamUid:admission.hamUid,
    call:function(){return fetch(url, init);}});
  if (!attempted || attempted.ok !== true) {
    var refused=new Error(attempted && attempted.reason || 'provider_admission_refused');
    refused.code='PROVIDER_ADMISSION_REFUSED';
    throw refused;
  }
  return attempted.response;
}

function rethrowAdmissionRefusal(error) {
  if (error && error.code === 'PROVIDER_ADMISSION_REFUSED') throw error;
}

async function tryRunPodGLM(system, user, opts) {
  // \u2b21B:core.model.ladder:FIX:glm_runpod_is_the_real_primary_20260715\u2b21 GLM
  // 5.2 already runs on its own RunPod serverless GPU (endpoint glm-5-2-envolve,
  // Ollama, model glm4:9b), isolated, scale-to-zero, exactly the same pattern as
  // Ornith. This is the TRUE first step, not Together/OpenRouter, which are only
  // the fallback when the RunPod GPU is unreachable.
  var url = process.env.GLM_RUNPOD_URL;
  if (!url) { noteAttempt(opts, { rung: 'glm.runpod', answered: false, reason: 'rung_not_configured' }); return null; }
  try {
    var base = url.replace(/\/+$/, '');
    var full = /\/(chat\/)?completions$/.test(base) ? base : (/\/openai\/v1$/.test(base) ? base + '/chat/completions' : base + '/openai/v1/chat/completions');
    // ⬡B:core.model_ladder:FIX:runpod_glm_must_answer_in_english:20260719⬡
    // The RunPod GLM pod runs glm4:9b, which defaults to CHINESE when the system
    // prompt does not pin a language, so it returned Chinese gibberish that either
    // reached the person or failed the JSON parse and cascaded to a PAID provider.
    // Pin English hard on this rung so its output is always usable and never bleeds
    // the turn to OpenRouter. English-only prepend, caller's system content preserved.
    var _rpSystem = outputGuard.englishSystem(system);
    // ⬡B:core.model_ladder:FIX:the_glm_runpod_rung_is_a_banned_model_by_definition_now:20260729⬡
    // CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P1: this rung's bare literal default
    // ('glm-5.2', no provider prefix) was never covered by the earlier prefix-only ban check,
    // and GLM_RUNPOD_MODEL was read unvalidated regardless. Founder ban 20260729: GLM-5.2 is
    // not a production pick on ANY transport, RunPod included, and this whole rung's one job
    // is running GLM on a dedicated RunPod pod, so there is no compliant model left for it to
    // serve unless an operator explicitly re-seats it to something else; no banned literal is
    // ever constructed here to begin with, so there is nothing for the repo-wide guard
    // (tests/no.banned.production.model.literal.anywhere.test.js) to find, and nothing to
    // refuse after the fact. Already dormant by default (GLM_RUNPOD_URL unset); this closes
    // it even if that URL is ever set again.
    // ⬡B:core.model_ladder:FIX:the_ban_forgot_its_own_contestant_exemption:20260729⬡
    // CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P2: this commit's own stated intent
    // exempts Wonder Games/cook-off contestants from the production ban (core/seat.map.js's
    // isContestantSeat(), already checked by seat()/fallback()), but this unconditional
    // return null applied the ban regardless of who was asking. contestantBuild() passes
    // opts.seat:'wonder_games_glm' precisely to run GLM as the graded contestant it is, and
    // with GLM_PROVIDER_ORDER=runpod that seat had no route to its own supported model at
    // all, submitting empty content and dropping out of its own game. Same contestant test
    // seat.map.js already uses, applied here too.
    // ⬡B:core.model_ladder:FIX:an_omitted_override_left_the_contestant_with_no_model_at_all:20260729⬡
    // CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P2, fresh evidence beyond the fix
    // above: with GLM_RUNPOD_MODEL simply unset (the supported, common case, since this
    // rung used to default to 'glm-5.2' on exactly that configuration), `_rpModel` is
    // falsy and this returned null before the contestant check even ran, so a Wonder
    // Games GLM contestant with no explicit env override still submitted empty content.
    // A contestant is exempt from the BAN, but was never meant to be exempt from HAVING
    // a model; resolved from the seat's own declared model (already exempt from the ban
    // by isContestantSeat(), same source contestantBuild() itself pays the key through),
    // never a literal reconstructed in this file.
    // ⬡B:core.model_ladder:FIX:the_seats_openrouter_slug_is_a_foreign_id_on_runpod:20260729⬡
    // CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P2, fresh evidence beyond the fix
    // above: the seat's declared model is an OpenRouter-format slug ('z-ai/glm-5.2'), the
    // format this seat normally speaks on its usual (OpenRouter) transport. RunPod's own
    // integration (routes/cookoff.routes.js's own runpod runner) has always used the bare
    // provider-native id ('glm-5.2', no prefix) for this exact model on this exact
    // transport. Sending the OpenRouter slug to RunPod is a foreign, unrecognized model id
    // there, so the contestant would pass the null check above and still submit empty
    // content once RunPod itself rejects it. Stripped to the bare id RunPod actually
    // speaks, derived from the seat's slug at runtime rather than a second hardcoded
    // 'glm-5.2' literal in this file.
    var _rpModel = process.env.GLM_RUNPOD_MODEL;
    var _rpIsContestant = /^(cookoff_|wonder_games_)/.test(String(opts.seat || ''));
    if (!_rpModel && _rpIsContestant && seatMap) {
      var _rpContestantSeat = seatMap.seat(opts.seat);
      var _rpContestantModel = _rpContestantSeat && _rpContestantSeat.model;
      _rpModel = _rpContestantModel && _rpContestantModel.replace(/^[^/]+\//, '');
    }
    // ⬡B:core.model_ladder:PROPOSED-RG:runpod_rung_lost_in_silence_20260808⬡
    // PROPOSED-RG pending founder conversion. CAUGHT BY CATHY (Codex) on #2045, P2: this
    // rung and tryOrnith were the only runners that returned bare null on every failure,
    // so a GLM_PROVIDER_ORDER=runpod turn reported a LATER rung's reason (key_missing on
    // anthropic) as if it were this rung's, the exact ambiguous diagnosis the diagnostics
    // channel was built to kill. Same vocabulary as the OpenRouter and Anthropic runners,
    // shape only, never content, env var NAMES only, never values.
    if (!_rpModel || !seatMap || (!_rpIsContestant && seatMap.isBannedProductionModel(_rpModel))) {
      noteAttempt(opts, { rung: 'glm.runpod', answered: false, reason: 'rung_not_configured',
        env: 'GLM_RUNPOD_MODEL' });
      return null;
    }
    var body = { model: _rpModel, messages: [{ role: 'system', content: _rpSystem }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.format = 'json';
    // A deadline exists only when the actual caller chose one. This rung used to invent a
    // 45-second floor for ordinary calls, which meant an otherwise unlimited ladder was still
    // governed by a coder clock. Pass the caller's value through exactly, including no value.
    var timeout = opts.timeout;
    var runpodKey = seatMap && seatMap.sanitizeKey ? seatMap.sanitizeKey(process.env.GLM_RUNPOD_KEY) : String(process.env.GLM_RUNPOD_KEY || '').trim();
    var _rpNote = { rung: 'glm.runpod', model: _rpModel, via: 'runpod' };
    if (!runpodKey) {
      noteAttempt(opts, Object.assign({}, _rpNote, { answered: false, reason: 'key_missing',
        env: 'GLM_RUNPOD_KEY' }));
      return null;
    }
    var r = await providerFetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + runpodKey }, body: JSON.stringify(body), signal: requestSignal(opts, timeout) });
    if (!r.ok) {
      noteAttempt(opts, Object.assign({}, _rpNote, { answered: false, status: r.status || null,
        reason: 'provider_error' }));
      return null;
    }
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    var _rpVerdict = noteAnswer(opts, _rpNote, c, finishReasonOf(d));
    return _rpVerdict === 'accepted' ? { content: cleanModelContent(c, opts), model: _rpModel, via: 'runpod' } : null;
  } catch (e) {
    noteAttempt(opts, { rung: 'glm.runpod', answered: false,
      reason: 'rung_threw:' + String((e && e.code) || (e && e.name) || 'error') });
    rethrowAdmissionRefusal(e);return null; }
}
// Every OpenRouter rung resolves one exact functional seat. The seat supplies
// both its model and its key, so one request cannot rotate through unrelated
// wallets and a bill remains attributable to the caller that opened it.
var seatMap = null;
try { seatMap = require('./seat.map.js'); } catch (eSeatMap) { seatMap = null; }

// ⬡B:core.model_ladder:911:the_rung_spent_the_seats_KEY_and_threw_away_its_MODEL:20260728⬡
// THE OPEN LEDGER row B7, "re-seat the ladder onto funded seat-map models". It was real, and
// this is what it was. Both OpenRouter rungs below already resolved the funded seat and paid
// with that seat's exact named key, then discarded the model the seat funds and sent a slug
// hardcoded in THIS file instead, behind a model-family test:
//   var glmModel = opts.seat && /^z-ai\/glm/i.test(candidate.model) ? candidate.model
//     : (process.env.GLM_OPENROUTER_MODEL || 'z-ai/glm-5.2');
// Reproduced against the real code before changing a line, not reasoned about. Three defects
// fell out of that one expression:
//
// 1. `opts.seat &&` meant the seat's model was honored ONLY when a caller passed the seat by
//    argument. The DEFAULT path resolves its seat from MODEL_LADDER_SEAT or 'deliberation',
//    which are falsy for `opts.seat`, so the funded seat's model was thrown away on every
//    ordinary deliberation in the estate. SEAT_LADDER_MODEL, this map's own documented
//    re-seat knob, was dead: setting it changed nothing, verified.
// 2. The family test meant a seat funding any other family got billed for a foreign model.
//    Verified: MODEL_LADDER_SEAT=c1_cellm sent z-ai/glm-5.2 on the penny gate's key, and
//    deliberate(s,u,{seat:'coda'}) sent z-ai/glm-5.2 on OR_KEY_CODA_KIMI. The per-function
//    key exists so a bleed traces to the exact seat; a foreign model on that key breaks the
//    other half of the same promise, because the money is attributable and the spend is not.
// 3. The receipt named a model that was never called: the rungs returned a fixed
//    model:'glm-5.2' / 'qwen3-235b' label whatever went out on the wire.
//
// THE RE-SEAT. A rung resolves the seat and sends what the seat funds, full stop. There is no
// model literal left in this file to drift.
//
// ⬡B:core.model_ladder:MERGE:the_family_test_looked_like_safety_and_was_the_bleed:20260728⬡
// TWO LANES CURED THIS SAME DEFECT IN THE SAME WINDOW AND THE MERGE FIRST PICKED THE WRONG ONE.
// Written down because the wrong one is the one that reads as careful. The other cure kept a
// model-family test on each rung, on the reasoning that a ladder walking rungs of different
// families must never feed one family's slug to another family's call:
//   var glmModel = /^z-ai\/glm/i.test(candidate.model) ? candidate.model
//     : (process.env.GLM_OPENROUTER_MODEL || 'z-ai/glm-5.2');
// That guard does not refuse the rung. It SUBSTITUTES a literal and then pays with the resolved
// seat's own named key, so selecting `coda` or `c1_cellm` billed that seat for a model the seat
// does not fund. The per-seat key exists precisely so a bleed traces to one seat; a foreign
// model on that key breaks the other half of that promise, because the money stays attributable
// and the spend stops being. FOUND BY CATHY (Codex) on #1286, against the funded-seat suite in
// this same branch, which failed 3 of 7 under the family test and passes 7 of 7 without it.
//
// The premise behind the guard is also no longer true. These two rungs are not two model
// families any more: `openRouterCandidate(name, false)` is the seat's PRIMARY and
// `openRouterCandidate(name, true)` is the seat's DECLARED FAILOVER, both resolved from the one
// seat map. Nothing can arrive at a rung from another family's seat, so there is nothing for a
// family test to catch, and the function names are only names.
//
// GLM_OPENROUTER_MODEL and QWEN_MODEL were the
// pre-seat-map way to pin these two rungs and they are SUPERSEDED, not deleted twice over:
// the same pin is one env var on the seat itself (SEAT_LADDER_MODEL, SEAT_LADDER_MODEL_FALLBACK,
// or SEAT_*_MODEL for whichever seat a caller pins), read live per call by core/seat.map.js,
// which is the one source that already owns this decision. A world still carrying the old env
// re-pins on the seat instead; that is the deliberate cost of ending the second copy.
//
// The two rungs are no longer two model families. `glm` is the seat's PRIMARY and `qwen` is
// the seat's DECLARED FAILOVER, resolved through seatMap.fallback(), which already refuses to
// hand back a failover that is byte-identical to the primary. A seat with no declared failover
// falls back to its own primary so a caller that pins one rung by name still gets its funded
// model, and deliberate() then skips any rung that would repeat a model+key pair it has
// already paid for this call. Comparing two resolved slugs is a fact, not a judgment.
function openRouterCandidate(seatName, useFallback) {
  if (!seatMap) return null;
  var name = String(seatName || '');
  var s = useFallback === true ? seatMap.fallback(name) : null;
  if (!s) s = seatMap.seat(name);
  if (!s || s.provider !== 'openrouter') return null;
  var key = seatMap.resolveKey(s);
  return key ? { key:key,model:s.model,via:'openrouter:' + s.seat,seat:s.seat } : null;
}

// ⬡B:core.model_ladder:PROPOSED-RG:an_unfunded_rung_used_to_be_indistinguishable_from_a_bad_answer:20260808⬡
// PROPOSED-RG pending founder conversion. openRouterCandidate() returns null for three
// unrelated facts: no seat map, a seat that is not an OpenRouter seat, and a seat whose
// named key is not set. Only the third is a credential problem, which is the one an
// operator can actually fix, so the three are told apart here rather than collapsed.
// The `keyEnv` it returns is the NAME of the env var a seat reads, never a value, so an
// operator is told exactly which variable to set. Same vocabulary seat.map.js's own
// keyMissingReason() already uses, so one fault has one name across the estate.
function unfundedReason(seatName, useFallback) {
  if (!seatMap) return { reason: 'seat_map_unavailable' };
  var name = String(seatName || '');
  var s = null;
  try { s = useFallback === true ? seatMap.fallback(name) : null; } catch (eF) { s = null; }
  if (!s) { try { s = seatMap.seat(name); } catch (eS) { s = null; } }
  if (!s) return { reason: 'seat_unavailable' };
  if (s.provider !== 'openrouter') return { reason: 'seat_not_on_this_rung' };
  return { reason: 'key_missing', keyEnv: s.keyEnv || null, seat: s.seat || name };
}

function ladderSeatName(opts) {
  return String((opts && opts.seat) || process.env.MODEL_LADDER_SEAT || 'deliberation');
}

// Do not pay the same model+key pair twice inside one deliberate() call. This is deduplication,
// not an attempt ceiling: every distinct configured rung remains reachable in sequence.
function alreadyAttempted(opts, candidate) {
  if (!opts || !candidate) return false;
  var stamp = candidate.model + '|' + candidate.key;
  var seen = opts._attempted || (opts._attempted = []);
  if (seen.indexOf(stamp) !== -1) return true;
  seen.push(stamp);
  return false;
}

async function tryOpenRouterGLM(system, user, opts) {
  // General ladder work belongs to one exact named seat. A failed or missing
  // key stops this rung instead of rotating through CANON, mind, or organ money.
  var candidate = openRouterCandidate(ladderSeatName(opts));
  if (!candidate) {
    noteAttempt(opts, Object.assign({ rung: 'glm', seat: ladderSeatName(opts), answered: false },
      unfundedReason(ladderSeatName(opts), false)));
    return null;
  }
  if (alreadyAttempted(opts, candidate)) {
    noteAttempt(opts, { rung: 'glm', seat: candidate.seat, model: candidate.model,
      answered: false, reason: 'already_attempted' });
    return null;
  }
  var note = { rung: 'glm', seat: candidate.seat, model: candidate.model, via: candidate.via };
  try {
        // ⬡B:core.model_ladder:911:glm_4.6_was_EIGHT_versions_old_now_5.2:20260718⬡
    // FOUNDER CAUGHT IT 20260718: this rung was hardcoded to z-ai/glm-4.6, EIGHT
    // versions behind the current z-ai/glm-5.2 that OpenRouter serves right now
    // (5.2, 5.1, 5, 4.7, 4.6...). The RunPod rung was worse: glm4:9b, a 9B GLM-4.
    // A stale default model string silently pins the whole system to an old brain.
    // Now 5.2 everywhere, env-overridable. Truncation fall-through (same file) covers
    // 5.2's reasoning-burn so an empty never wins.
    // ⬡B:core.model_ladder:911:the_guard_tested_how_it_was_called_not_what_the_seat_resolved_to:20260728⬡
    // B7, and the entry that first investigated it (ledger D11) wrongly called this deliberate.
    // FOUND BY CATHY (Codex) on #1254 by RUNNING it: with SEAT_LADDER_MODEL set, the ladder
    // still sent a hardcoded slug unless the caller also passed opts.seat. The candidate above
    // is already resolved from opts.seat || MODEL_LADDER_SEAT || 'deliberation', so testing
    // `opts.seat` here asks HOW THE CALLER INVOKED the ladder instead of WHAT THE SEAT
    // RESOLVED TO, and every caller that omits it, the default path, silently ignored the seat
    // map. A configuration knob that looks live and is not is worse than a stale default: it
    // reports no error, so an operator re-seating by env believes they have. Same shape as the
    // outage in ledger D12. The family check is the part that was always right and it stays:
    // a GLM rung still refuses a non-GLM seat model and falls back, so a ladder that tries
    // several families in sequence never feeds one family's slug to another's call.
    var glmModel = candidate.model;
    var body = { model: glmModel, messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    // Keep the model's native reasoning available. The return boundary still
    // requires usable content before this rung can win.
    var r = await providerFetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + candidate.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) {
      noteAttempt(opts, Object.assign({}, note, { answered: false, status: r.status || null,
        reason: 'provider_error' }));
      return null;
    }
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    var verdict = noteAnswer(opts, note, c, finishReasonOf(d));
    // The receipt names the model that was actually called. It used to say 'glm-5.2'
    // whatever left the process, which is a false receipt the moment a seat funds
    // anything else, and after the re-seat above every seat can.
    return verdict === 'accepted' ? { content: cleanModelContent(c, opts),
      model:glmModel,model_slug:glmModel,via:candidate.via } : null;
  } catch (e) {
    noteAttempt(opts, Object.assign({}, note, { answered: false,
      reason: 'rung_threw:' + String((e && e.code) || (e && e.name) || 'error') }));
    rethrowAdmissionRefusal(e);return null; }
}
async function tryOrnith(system, user, opts) {
  var url = process.env.ORNITH_URL;
  if (!url) { noteAttempt(opts, { rung: 'ornith', answered: false, reason: 'rung_not_configured' }); return null; }
  try {
    var base = url.replace(/\/+$/, '');
    var full = /\/(chat\/)?completions$/.test(base) ? base : (/\/openai\/v1$/.test(base) ? base + '/chat/completions' : base + '/openai/v1/chat/completions');
    // ⬡B:core.model_ladder:FIX:ornith_is_a_founder_banned_family_by_name_now:20260729⬡
    // Founder ban 20260729: Ornith is a named banned family on any transport. This
    // whole rung's one job is calling Ornith, so there is no compliant model left for
    // it to serve unless an operator explicitly re-seats ORNITH_MODEL to something
    // else non-banned; no banned literal ('ornith') is ever constructed here to begin
    // with, mirroring the tryRunPodGLM fix just above, so the repo-wide guard
    // (tests/no.banned.production.model.literal.anywhere.test.js) has nothing to find
    // and nothing to refuse after the fact.
    // ⬡B:core.model_ladder:PROPOSED-RG:ornith_rung_lost_in_silence_20260808⬡
    // PROPOSED-RG pending founder conversion. Same finding as the RunPod rung above
    // (CATHY on #2045, P2): every loss here was a bare null, so a
    // LIFE_CLASSIFY_LADDER_ORDER that includes ornith reported a later rung's reason.
    // Instrumented with the shared vocabulary, shape only, env NAMES only.
    var _ornithModel = process.env.ORNITH_MODEL;
    if (!_ornithModel || !seatMap || seatMap.isBannedProductionModel(_ornithModel)) {
      noteAttempt(opts, { rung: 'ornith', answered: false, reason: 'rung_not_configured',
        env: 'ORNITH_MODEL' });
      return null;
    }
    var body = Object.assign({ model: _ornithModel, messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }] }, outputGuard.ornithSampling(opts.max_tokens, false));
    // Ornith is called through its OpenAI-compatible chat-completions surface.
    // response_format is that surface's compatible JSON-mode request; ordinary
    // deliberations keep their existing request shape.
    if (opts.json) body.response_format = { type: 'json_object' };
    var ornithKey = seatMap && seatMap.sanitizeKey
      ? seatMap.sanitizeKey(process.env.ORNITH_LADDER_API_KEY)
      : String(process.env.ORNITH_LADDER_API_KEY || '').trim();
    var _ornithNote = { rung: 'ornith', model: _ornithModel, via: process.env.ORNITH_VIA || 'openrouter' };
    if (!ornithKey) {
      noteAttempt(opts, Object.assign({}, _ornithNote, { answered: false, reason: 'key_missing',
        env: 'ORNITH_LADDER_API_KEY' }));
      return null;
    }
    var r = await providerFetch(full, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ornithKey },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) {
      noteAttempt(opts, Object.assign({}, _ornithNote, { answered: false, status: r.status || null,
        reason: 'provider_error' }));
      return null;
    }
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    // ⬡B:core.model_ladder:AMEND:ornith_via_reflects_real_host_not_hardcoded_runpod:20260721⬡
    // Ornith moved off RunPod to a managed API; the via label is env-driven so cost
    // telemetry (METER) names the true host instead of a hardcoded, now-wrong 'runpod'.
    // ⬡B:core.model_ladder:911:ornith_accepted_but_never_scrubbed:20260726⬡
    // FOUND 20260726, a third Codex pass. Every sibling rung in this file scrubs
    // the content it accepts; this one alone returned the raw string. Checking
    // CJK on the STRIPPED content (the fix above) means a response with CJK
    // reasoning residue followed by a clean English answer is now correctly
    // accepted rather than falling through, but returning it raw would have
    // handed that CJK reasoning trace straight to a human. Scrubbed like every
    // other rung, not a new behaviour, a missed one.
    var _ornithVerdict = noteAnswer(opts, _ornithNote, c, finishReasonOf(d));
    return _ornithVerdict === 'accepted' ? { content: cleanModelContent(c, opts), model: _ornithModel, via: process.env.ORNITH_VIA || 'openrouter' } : null;
  } catch (e) {
    noteAttempt(opts, { rung: 'ornith', answered: false,
      reason: 'rung_threw:' + String((e && e.code) || (e && e.name) || 'error') });
    rethrowAdmissionRefusal(e);return null; }
}
// The seat's declared failover rung. Named `qwen` because that is what the default
// deliberation seat's failover has always been on the wire, and renaming a rung would
// break every caller and env that pins MODEL_LADDER_ORDER by that name. What it resolves
// is no longer a family: it is whatever seatMap.fallback() says this seat fails over to,
// and the seat's own primary when the seat declares no failover, so a caller that pins
// this single rung by name still gets a funded model rather than a literal.
async function tryQwen(system, user, opts) {
  // Called inline, exactly as the standing guard in tests/the.ladder.honors.the.seat.it
  // .resolved.test.js reads it out of this source. A local alias for the seat name would
  // read the same to a person and stop that guard from proving the rule, so the diagnosis
  // below resolves the name a second time rather than restating this line.
  var candidate = openRouterCandidate(ladderSeatName(opts), true);
  if (!candidate) {
    noteAttempt(opts, Object.assign({ rung: 'qwen', seat: ladderSeatName(opts), answered: false },
      unfundedReason(ladderSeatName(opts), true)));
    return null;
  }
  if (alreadyAttempted(opts, candidate)) {
    noteAttempt(opts, { rung: 'qwen', seat: candidate.seat, model: candidate.model,
      answered: false, reason: 'already_attempted' });
    return null;
  }
  var note = { rung: 'qwen', seat: candidate.seat, model: candidate.model, via: candidate.via };
  try {
    // Same rule as the GLM rung above: this rung sends the model its resolved seat funds.
    // `openRouterCandidate(name, true)` already asked seat.map for this seat's DECLARED
    // FAILOVER, so what arrives here is a real second opinion the seat owns, not a family
    // literal kept in this file.
    var qwenModel = candidate.model;
    var body = { model: qwenModel, messages: [{ role: 'system', content: outputGuard.englishSystem(system) }, { role: 'user', content: user }], max_tokens: opts.max_tokens, temperature: opts.temperature };
    if (opts.json) body.response_format = { type: 'json_object' };
    if (opts.reasoning && typeof opts.reasoning === 'object' && !Array.isArray(opts.reasoning)) {
      var effort=String(opts.reasoning.effort||'').toLowerCase();
      var reasoning={};
      if(['none','minimal','low','medium','high','xhigh','max'].indexOf(effort)!==-1)
        reasoning.effort=effort;
      if(typeof opts.reasoning.exclude==='boolean')reasoning.exclude=opts.reasoning.exclude;
      if(typeof opts.reasoning.enabled==='boolean')reasoning.enabled=opts.reasoning.enabled;
      if(Object.keys(reasoning).length)body.reasoning=reasoning;
    }
    if(opts.chat_template_kwargs&&typeof opts.chat_template_kwargs==='object'&&
        !Array.isArray(opts.chat_template_kwargs)&&
        typeof opts.chat_template_kwargs.enable_thinking==='boolean'){
      body.chat_template_kwargs={enable_thinking:opts.chat_template_kwargs.enable_thinking};
    }
    if(opts.provider&&typeof opts.provider==='object'&&!Array.isArray(opts.provider)){
      var provider={};
      if(['latency','throughput','price'].indexOf(String(opts.provider.sort||''))!==-1)
        provider.sort=String(opts.provider.sort);
      if(typeof opts.provider.require_parameters==='boolean')
        provider.require_parameters=opts.provider.require_parameters;
      if(Object.keys(provider).length)body.provider=provider;
    }
    // Keep the failover model's native reasoning available too. Empty or unusable
    // content still loses this rung and the ladder continues.
    var r = await providerFetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + candidate.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) {
      noteAttempt(opts, Object.assign({}, note, { answered: false, status: r.status || null,
        reason: 'provider_error' }));
      return null;
    }
    var d = await r.json(); var c = (((d.choices || [])[0] || {}).message || {}).content;
    var verdict = noteAnswer(opts, note, c, finishReasonOf(d));
    // Its sibling has always run the accepted content through the scrubber and this rung
    // handed back the raw string. A provider that honours neither passthrough still returns
    // reasoning residue, so the rung that is most likely to think is the one that most needs
    // cleaning, and it was the one without it.
    return verdict === 'accepted' ? {content:cleanModelContent(c, opts),model:qwenModel,
      model_slug:qwenModel,via:candidate.via} : null;
  } catch (e) {
    noteAttempt(opts, Object.assign({}, note, { answered: false,
      reason: 'rung_threw:' + String((e && e.code) || (e && e.name) || 'error') }));
    rethrowAdmissionRefusal(e);return null; }
}
// ⬡B:core.model_ladder:FIX:anthropic_backup_floor_kills_no_answer:20260721⬡
// The gaslight cycle, root cause found live: the ladder's open-weight rungs (GLM on
// runpod/together/openrouter, Ornith, Qwen) can ALL be down at once (Together out of credits,
// OpenRouter strained, RunPod cold), and with nothing beneath them deliberate() returns null,
// which the council surfaces as no_answer and the founder experiences as A'NU going silent. The
// two Anthropic backup keys the router's own bleed provider already uses (Haiku for C0/C1,
// Sonnet for C2/C3) are a live hosted API immune to the open-weight outage. This adds them as
// the last-resort floor: it only ever runs after every open-weight rung has definitively
// failed, so it changes nothing when they work and gives the cycle a live answer when they do
// not. A configured named key makes the floor reachable without a second off switch.
async function tryAnthropicBackup(system, user, opts) {
  var key = process.env.ANTHROPIC_LADDER_API_KEY;
  if (!key) { noteAttempt(opts, { rung: 'anthropic', answered: false, reason: 'key_missing' }); return null; }
  // Anthropic's Messages API literally requires max_tokens. The ladder will not manufacture
  // one. If a caller explicitly chooses this provider, that caller must choose the value too.
  if (!Number.isSafeInteger(Number(opts.max_tokens)) || Number(opts.max_tokens) < 1) return null;
  // ⬡B:core.model_ladder:FIX:the_anthropic_floor_read_its_override_raw:20260729⬡
  // CAUGHT BY CATHY (Codex) IN REVIEW ON anew#1346, P1: ANTHROPIC_LADDER_MODEL was read
  // with a raw `||`, the exact vulnerable shape already fixed at every TOGETHER_MODEL/
  // CANON_MODEL call site this same PR; ANTHROPIC_LADDER_MODEL=claude-fable-5 (or
  // claude-opus-4-8) would have reached this floor unchecked. Routed through the same
  // shared validator.
  var model = seatMap ? seatMap.safeModelOverride(process.env.ANTHROPIC_LADDER_MODEL, 'claude-haiku-4-5') : 'claude-haiku-4-5';
  try {
    var r = await providerFetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, max_tokens: Number(opts.max_tokens),
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
        system: outputGuard.englishSystem(system), messages: [{ role: 'user', content: user }] }),
      signal: requestSignal(opts, opts.timeout) });
    if (!r.ok) {
      noteAttempt(opts, { rung: 'anthropic', model: model, via: 'anthropic', answered: false,
        status: r.status || null, reason: 'provider_error' });
      return null;
    }
    var d = await r.json();
    var c = (d.content || []).map(function (b) { return b.text || ''; }).join('');
    var verdict = noteAnswer(opts, { rung: 'anthropic', model: model, via: 'anthropic' }, c, d && d.stop_reason);
    return verdict === 'accepted' ? { content: cleanModelContent(c, opts), model: model, via: 'anthropic' } : null;
  } catch (e) {
    noteAttempt(opts, { rung: 'anthropic', model: model, via: 'anthropic', answered: false,
      reason: 'rung_threw:' + String((e && e.code) || (e && e.name) || 'error') });
    rethrowAdmissionRefusal(e);return null; }
}
// ⬡B:core.model_ladder:CLEANUP:groq_runner_deleted_stack_spotless:20260717⬡
// The Groq floor is gone. GROQ_API_KEY is off every service, the fetch boundary
// reroutes any stray banned call, and the four-API law leaves no seat for it. The
// runner, its GROQ_MODEL env references, and the 'groq' name in the runner map are
// all deleted. Nothing reaches for it anymore.

// deliberate(system, user, opts) -> { content, model, via } | null
// Every distinct configured rung remains reachable in sequence. The ladder does
// not suppress a model with a coder spend ceiling or reasoning-off request.
async function deliberate(system, user, options) {
  // ⬡B:core.model_ladder:FIX:no_coder_default_deadline_may_abort_a_paid_answer:20260801⬡
  // The former 25-second default was an invisible coder ceiling on every unspecified model
  // call. It could fire after OpenRouter had returned HTTP 200 headers, abort the body before
  // the paid answer and usage facts reached us, and induce the next paid fallback. With no
  // caller-owned deadline there is now no deadline here. An explicit caller signal/timeout is
  // still carried exactly as supplied; this one door no longer invents one.
  var opts = Object.assign({ temperature: 0.4, timeout: null, json: false }, options || {});
  // Reset per call, never inherited from a caller's reused options object: this call's
  // own paid model+key attempts, so no rung repeats a call this call already paid for.
  opts._attempted = [];
  // An explicit per-call or environment order still wins. The production-safe
  // Qwen rung is the default; contest-only model families remain reachable only
  // when their governed caller names them explicitly.
  // A caller may pin its rung and functional seat per call. This is request
  // state, never process.env mutation: overlapping contests cannot reseat one
  // another, and a throw cannot leave the whole process on the wrong ladder.
  var requestedOrder = opts.order == null ? process.env.MODEL_LADDER_ORDER : opts.order;
  var order = (Array.isArray(requestedOrder) ? requestedOrder :
    String(requestedOrder || 'qwen').split(','))
    .map(function (s) { return String(s || '').trim().toLowerCase(); })
    .filter(function (name,index,list) {
      return name && list.indexOf(name) === index;
    });
  // \u2b21B:core.model_ladder:FIX:glm_provider_order_is_env_truth:20260717\u2b21
  // Live receipt: the RunPod pod is serving glm4:9b, a small quantized model, and
  // because it always answers first the real GLM-5.2 rung (Together) never runs.
  // That one weak primary drove both the empty drafts and the probabilistic SHADOW
  // holds on the founder's own chat turns. The order inside the GLM rung is now
  // env truth (GLM_PROVIDER_ORDER), no provider banned, RunPod stays in the chain.
  // ⬡B:core.model_ladder:AMEND:runpod_retired_default_is_together_first:20260721⬡
  // FOUNDER RULING 20260721: RunPod is retired. The default no longer leads with
  // runpod, so a wiped GLM_PROVIDER_ORDER env can never send GLM to the retired
  // RunPod GPU first. Live env already reads together,openrouter; this makes the
  // code fallback match the ruling instead of masking it. The runpod runner stays
  // in the map so the seat can be restored by env if ever wanted, just not defaulted.
  var glmSeq = String(process.env.GLM_PROVIDER_ORDER || 'openrouter')
    .split(',').map(function (s) { return s.trim().toLowerCase(); });
  var glmRunners = {
    runpod: function (o) { return tryRunPodGLM(system, user, o); },
    openrouter: function (o) { return tryOpenRouterGLM(system, user, o); } };
  var glmChain = glmSeq.filter(function (n) { return typeof glmRunners[n] === 'function'; });
  if (!glmChain.length) glmChain = ['openrouter'];
  var runners = { glm: async function (runOpts) {
      runOpts = runOpts || opts;
      for (var gi = 0; gi < glmChain.length; gi++) {
        var glmOut = await glmRunners[glmChain[gi]](runOpts);
        if (glmOut) return glmOut;
      }
      return null;
    },
    ornith: function (runOpts) { return tryOrnith(system, user, runOpts || opts); },
    qwen: function (runOpts) { return tryQwen(system, user, runOpts || opts); },
    anthropic: function (runOpts) { return tryAnthropicBackup(system, user, runOpts || opts); }, };
  // The Anthropic backup is always the last rung whenever a key is present, so the cycle has a
  // live floor beneath the open-weight ladder. Appended, never inserted, so it runs only after
  // every higher rung has failed, and only added when it is not already in the configured order.
  if (opts.order == null && process.env.ANTHROPIC_LADDER_API_KEY &&
      order.indexOf('anthropic') === -1) {
    order.push('anthropic');
  }
  // Realtime changes the deadline profile only. It never launches paid rungs
  // concurrently. A logical step opens the next provider attempt only after the
  // prior attempt has settled, so voice SHADOW plus its review cannot multiply
  // into four simultaneous provider charges.
  for (var i = 0; i < order.length; i++) {
    var fn = runners[order[i]]; if (!fn) continue;
    var res = await fn();
    if (res) return res;
  }
  return null;
}

// ⬡B:core.model_ladder:WIRE:transcription_lives_behind_the_one_door_too:20260718⬡
// Decided with A'NEW under the founder's unite rule: the SEATED voicenote
// transcribed through Groq Whisper, which the four API law bans, so
// transcription rides this same single door on Together, an approved API that
// hosts Whisper. One ladder, one place providers live, including for audio.
// (Re-applied after a graft rebuild dropped it; the graft kept the groq rung
// removed, which is aligned, but did not carry this door.)
async function transcribe(audio, opts) {
  opts = opts || {};
  if (!audio) return null;
  var b64 = String(audio); var comma = b64.indexOf(',');
  if (comma >= 0) b64 = b64.slice(comma + 1);
  var buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (eB) { return null; }
  if (!buf || !buf.length) return null;
  // rung one: Together Whisper (approved), when it has credits
  var key = seatMap && seatMap.sanitizeKey ? seatMap.sanitizeKey(process.env.TOGETHER_TRANSCRIBE_API_KEY) : String(process.env.TOGETHER_TRANSCRIBE_API_KEY || '').trim();
  if (key) {
    try {
      var form = new FormData();
      form.append('file', new Blob([buf], { type: opts.mime || 'audio/webm' }), opts.filename || 'note.webm');
      form.append('model', process.env.TOGETHER_WHISPER_MODEL || 'openai/whisper-large-v3');
      var r = await providerFetch('https://api.together.xyz/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form,
        signal: requestSignal(opts, opts.timeout) });
      if (r.ok) {
        var d = await r.json();
        var text = String(d.text || '').trim();
        if (text) return { text: text, via: 'together' };
      }
    } catch (e) { /* fall through to the next rung */ }
  }
  // ⬡B:core.model_ladder:REPAIR:elevenlabs_stt_carries_voice_notes_when_together_is_dry:20260719⬡
  // Together ran out of credits (live 402 receipt) and voice notes died with it.
  // ElevenLabs is already the approved voice vendor with a live key, and its
  // scribe model transcribes. Second rung on the same one door, no new vendor.
  var elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      var form2 = new FormData();
      form2.append('file', new Blob([buf], { type: opts.mime || 'audio/webm' }), opts.filename || 'note.webm');
      form2.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1');
      var r2 = await providerFetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST', headers: { 'xi-api-key': elKey }, body: form2,
        signal: requestSignal(opts, opts.timeout) });
      if (r2.ok) {
        var d2 = await r2.json();
        var text2 = String(d2.text || '').trim();
        if (text2) return { text: text2, via: 'elevenlabs' };
      }
    } catch (e2) { /* both rungs failed, honest null */ }
  }
  return null;
}

module.exports = { deliberate: deliberate, transcribe: transcribe,
  _test: { hasAcceptedContent: hasAcceptedContent, cleanModelContent: cleanModelContent,
    requestSignal:requestSignal } };
