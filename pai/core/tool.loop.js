// ⬡B:core.tool.loop:MODULE:pai_executor:20260630⬡
var MAX_TOKENS = parseInt(process.env.PAI_MAX_TOKENS || '3000', 10); // ⬡B:core.tool.loop:REPAIR:configurable_token_cap:20260707⬡ was hardcoded 400 in three places, now one env-driven value
var voiceConversationPolicy = require('./voice.conversation.policy.js');
var voiceCallBinding = require('./voice.call.binding.js');
var reachPolicyContract = require('./reach/policy.contract.js');
var outputGuard = require('./model.output.guard.js');
var toolRetrieval = require('./tool.retrieval.js');
// ⬡B:core.tool.loop:FIX:channel_scoped_token_cap:20260710⬡ CLAIR wiring fix.
// Real incident: GUIDE pass 2 (strict JSON, 12 fields per destination) was
// truncated mid-JSON by the one global 700 cap and died as
// unstructured_answer_pass2 every single time. A channel may carry its own
// cap via PAI_MAX_TOKENS_<CHANNEL>; absent that, the global cap holds.
function tokenCapFor(channel) {
  var c = String(channel || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  var v = parseInt(process.env['PAI_MAX_TOKENS_' + c] || '', 10);
  // Coding handoffs on the live face routinely carry a CODA decision plus roadmap,
  // lifecycle, ownership, and acceptance evidence. An older explicit Render value
  // still capped the portal after the fallback was raised, so the minimum must hold
  // whether the value came from code or environment.
  if (c === 'PORTAL') return Math.max(v || 0, MAX_TOKENS, 2200);
  if (v && v > 0) return v;
  return MAX_TOKENS;
}

function shouldIncludeWorldContext(channel, identity, hamUid, question) {
  if (String(channel || '').toLowerCase() !== 'voice') return true;
  if (identity && identity.council_context &&
      identity.council_context.mode === 'voice' &&
      identity.council_context.include_world_context === true) return true;
  // Suppress ambient fusion only when the complete answer source is already
  // bound to this signed call turn: its exact purpose, or receipt of a closed
  // hearing check, or a closed farewell. Later questions keep normal exact-HAM
  // world grounding.
  return !(voiceCallContextSatisfiesTurn(channel, hamUid, question, identity) ||
    voiceHearingContextSatisfiesTurn(channel, hamUid, question, identity) ||
    voiceFarewellContextSatisfiesTurn(channel, hamUid, question, identity));
}

function verifiedVoiceCallContext(identity, hamUid) {
  var context = identity && identity.council_context;
  if (!context || context.mode !== 'voice' || !Array.isArray(context.verified_evidence)) return null;
  var expectedHam = String(hamUid || '').toUpperCase();
  var item = context.verified_evidence.find(function (candidate) {
    return candidate && candidate.tool === 'voice_call_handoff' &&
      candidate.provenance === 'pipecat.signed_provider_call_handoff';
  });
  var result = item && item.result;
  var identityRequestId = identity && (identity.request_id || identity.requestId);
  if (!item || !result || typeof result !== 'object' ||
      String(item.ham_uid || '').toUpperCase() !== expectedHam ||
      item.call_id !== context.call_id || item.session_id !== context.session_id ||
      item.turn_id !== context.turn_id || identityRequestId !== context.turn_id ||
      result.call_id !== context.call_id || result.session_id !== context.session_id ||
      result.turn_id !== context.turn_id ||
      context.call_binding_schema !== voiceCallBinding.SCHEMA ||
      result.binding_digest !== context.call_binding_digest ||
      typeof result.call_purpose !== 'string' || !result.call_purpose.trim() ||
      typeof result.committed_opener !== 'string' || !result.committed_opener.trim() ||
      result.provider_call_binding_verified !== true ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(String(item.call_id || '')) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(String(item.session_id || '')) ||
      !/^[A-Za-z0-9._:-]{8,160}$/.test(String(item.turn_id || '')) ||
      !String(item.turn_id || '').startsWith(String(item.session_id || '') + '.turn.') ||
      !/^[1-9][0-9]{0,8}$/.test(String(item.turn_id || '')
        .slice((String(item.session_id || '') + '.turn.').length)) ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(String(item.request_id || '')) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(String(item.cycle_id || '')) ||
      !/^[a-f0-9]{64}$/.test(String(item.receipt_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(context.call_binding_digest || ''))) return null;
  var expectedDigest = voiceCallBinding.fromEvidence(expectedHam, item, result);
  return expectedDigest === context.call_binding_digest ? result : null;
}

function voiceCallContextSatisfiesTurn(channel, hamUid, question, identity) {
  return !!verifiedVoiceCallPurposeAnswer(channel, hamUid, question, identity);
}

function verifiedVoiceCallPurposeAnswer(channel, hamUid, question, identity) {
  if (String(channel || '').toLowerCase() !== 'voice') return null;
  var handoff = verifiedVoiceCallContext(identity, hamUid);
  if (!handoff) return null;
  // Whole-utterance matching is a provider-safety boundary. A signed call
  // purpose can answer these exact conversational questions, but must never
  // swallow a second action or fact request such as "..., and text BJ".
  if (!voiceConversationPolicy.isCallPurposeQuestion(question)) return null;
  // Some canonical callers store the operational request as call_purpose
  // ("Call this HAM and check in...") while the committed opener is already
  // the natural, council-approved first-person rendering. Use a first-person
  // purpose verbatim when it is already speakable; otherwise use the equally
  // signed committed opener. Never synthesize a third set of unbound bytes.
  var naturalPurpose = /^(?:i\b|i['\u2019](?:m|d|ve|ll)\b|we\b|we['\u2019](?:re|d|ve|ll)\b)/i
    .test(String(handoff.call_purpose || '').trim());
  return naturalPurpose ? handoff.call_purpose : handoff.committed_opener;
}

function voiceHearingContextSatisfiesTurn(channel, hamUid, question, identity) {
  return !!verifiedVoiceHearingAnswer(channel, hamUid, question, identity);
}

function verifiedVoiceHearingAnswer(channel, hamUid, question, identity) {
  if (String(channel || '').toLowerCase() !== 'voice') return null;
  if (!verifiedVoiceCallContext(identity, hamUid) ||
      !voiceConversationPolicy.isHearingCheck(question)) return null;
  return voiceConversationPolicy.HEARING_ACKNOWLEDGEMENT;
}

function voiceFarewellContextSatisfiesTurn(channel, hamUid, question, identity) {
  return !!verifiedVoiceFarewellAnswer(channel, hamUid, question, identity);
}

function verifiedVoiceFarewellAnswer(channel, hamUid, question, identity) {
  if (String(channel || '').toLowerCase() !== 'voice') return null;
  var context = identity && identity.council_context;
  var hasPendingField = context && Object.prototype.hasOwnProperty.call(
    context, 'pending_effects');
  if ((hasPendingField && (!Array.isArray(context.pending_effects) ||
      context.pending_effects.length > 0)) ||
      !verifiedVoiceCallContext(identity, hamUid) ||
      !voiceConversationPolicy.isFarewell(question)) return null;
  return voiceConversationPolicy.FAREWELL_ACKNOWLEDGEMENT;
}

function voiceConversationalNoGenericLookup(channel, hamUid, question, identity) {
  if (String(channel || '').toLowerCase() !== 'voice' ||
      !verifiedVoiceCallContext(identity, hamUid)) return false;
  if (voiceCallContextSatisfiesTurn(channel, hamUid, question, identity)) return true;
  var exact = String(question || '').trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
  if (voiceConversationPolicy.isPureGreeting(exact)) return true;
  if (voiceConversationPolicy.isHearingCheck(exact)) return true;
  if (voiceFarewellContextSatisfiesTurn(channel, hamUid, exact, identity)) return true;
  // Keep this deliberately narrow. These shapes ask only for A'NU's present
  // conversational response; questions about people, work, calendar, or other
  // real-world facts continue through the deterministic lookup branches.
  if (/\b(?:email|e-mail|text|message|send|schedule|calendar|meeting|agenda|book|create|update|change|cancel|delete|notify|look\s*up|search|find|check|deploy|commit|push)\b/i.test(exact)) {
    return false;
  }
  var feeling = "(?:good|fine|okay|ok|alright|great|well|not\\s+bad|tired|busy|doing\\s+(?:good|well|fine|okay|ok))";
  // A standalone feeling needs an explicit first-person marker. Bare "Good"
  // or "Yes" can authorize a pending action from the prior turn, and this
  // predicate intentionally has no authority to inspect or clear that state.
  var standaloneFeeling = new RegExp("^i(?:'m|\\s+am)\\s+" + feeling + "\\s*[.!]*$", 'i');
  var reciprocalFeeling = new RegExp(
    "^(?:i(?:'m|\\s+am)\\s+)?" + feeling +
    "\\s*[,!.]?\\s*(?:(?:and\\s+)?you|(?:what|how)\\s+about\\s+you|how\\s+are\\s+you(?:\\s+doing)?)\\s*[?.!]*$", 'i');
  if (standaloneFeeling.test(exact) || reciprocalFeeling.test(exact)) {
    return true;
  }
  return /^(?:(?:hey|hi|hello|yo)\s*[,!.]?\s*)?(?:how\s+are\s+you(?:\s+doing)?|how\s+have\s+you\s+been|how'?s\s+it\s+going|i\s+hear\s+you|makes\s+sense|thank\s+you|thanks)\s*[?.!]*$/i.test(exact);
}

function bindExactHamToolArgs(name, args, hamUid, runtime) {
  var bounded = Object.assign({}, args || {});
  if (runtime && runtime.exactHamReads === true &&
      (name === 'find_in_brain' || name === 'find_identity_evidence')) {
    bounded.ham_uid = String(hamUid || '').toUpperCase();
  }
  return bounded;
}
// entered via the ABAHAM door, serving every channel that reaches PAI: text, voice, email, chat
// ⬡B:core.tool.loop:FIX:fix_file_cooldown_added:20260701⬡
// TOOL LOOP -- Memory Bank in, response out. Groq C2 deliberates. Tools fire. Up to 20 iterations.
// ANYHAM test: ham_uid drives all tool calls. No identity hardcoded. C1/C2 penny hustle.
//
// CLAIR fix: real incident 20260630 -- fix_file_in_github fired on the same path
// 10 times in 16 seconds during a retry burst, self-labeled with a banned model
// name in the commit messages. The cooldown module referenced in doctrine
// (eanew/cooldown.js) does not exist in this repo -- checked directly, not
// assumed. Added a real cooldown guard at the one place a commit actually
// happens, so no future burst can land regardless of what triggers the retry.
'use strict';
// ⬡B:core.tool.loop:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}

function failedCodaReason(raw) {
  var parsed = raw;
  try { if (typeof parsed === 'string') parsed = JSON.parse(parsed); }
  catch (error) { parsed = null; }
  if (parsed && typeof parsed === 'object' && parsed.ok === true) return null;
  var reason = String(parsed && parsed.reason || 'coda_consult_failed');
  return /^[a-z0-9_:-]{1,120}$/i.test(reason) ? reason : 'coda_consult_failed';
}

function parseRoadmapActivationSpec(message) {
  var text = String(message || '');
  var marker = 'ROADMAP_ACTIVATION_SPEC:';
  var markerAt = text.indexOf(marker);
  if (markerAt < 0) return null;
  var tail = text.slice(markerAt + marker.length);
  var start = tail.indexOf('{');
  if (start < 0) return { error:'roadmap_activation_spec_json_required' };
  var depth = 0, inString = false, escaped = false, end = -1;
  for (var i = start; i < tail.length; i++) {
    var ch = tail[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return { error:'roadmap_activation_spec_json_incomplete' };
  var spec;
  try { spec = JSON.parse(tail.slice(start, end + 1)); }
  catch (error) { return { error:'roadmap_activation_spec_json_invalid' }; }
  var requiredStrings = ['roadmap_source','repository','task'];
  if (requiredStrings.some(function (key) {
    return typeof spec[key] !== 'string' || !spec[key].trim();
  })) return { error:'roadmap_activation_spec_fields_required' };
  if (!Array.isArray(spec.allowed_paths) || !spec.allowed_paths.length ||
      !Array.isArray(spec.acceptance) || !spec.acceptance.length) {
    return { error:'roadmap_activation_spec_lists_required' };
  }
  return { spec:spec };
}
const { buildMemoryBank } = require('./fcw.builder.js'); // Memory Bank (BIND doctrine)
var currentTurnProofGuard = require('./current.turn.proof.guard.js');
const { find, findIdentityEvidence } = require('./find.js');
const identityProvenance = require('./identity.provenance.js');
const { readRenderLogs } = require('./tools/render.logs.js');
const { fixFileInGithub } = require('./tools/github.fix.js');
const { triggerDeploy } = require('./tools/render.deploy.js');
// ⬡B:core.tool_loop:WIRE:consult_coda_uses_canonical_relay_contract:20260715⬡
const codingRelay = require('./coding.relay.contract.js');
const { notifyHam, resolvePhone:resolveNotifyPhone } = require('./tools/notify.ham.js');
const { runOutboundCouncil, requireVerifiedCouncilResult, requireVerifiedCouncilDelivery,
  compactCouncilProof, canonicalizeDeliveryTarget,
  extractNamedContextEvidence, namedContextContradictions,
  currentAssistantPreferenceRequest, preferenceJudgmentFindings,
  boundedCouncilFailureCodes, isHumanFacingAnswer } = require('./pai.outbound.council.js');
// ⬡B:core.tool.loop:WIRE:ledger_tools_registered:20260707⬡
// CLAIR fix, real gap found in audit 20260707: LEDGER (Budget OS) had a live
// backend, 16 real BNPL plans, a working /budget/ask endpoint -- and was never
// registered here, so no channel that runs through runPAI (WREN text included)
// could ever reach it. Texting a real money question got a generic answer or
// nothing. Two read-only tools below close that, same pattern as every other
// tool in this file: real data in, no rogue side-effect calls, hamUid always
// threaded through, never assumed.
const ledger = require('../agents/budget/ledger.js');
// ⬡B:core.tool_loop:FIX:GB_choke_point_routes_to_approved_together_not_banned_groq:20260718⬡
// Article A6, A'NU approach A (surgical wrap, smallest blast radius): GB was
// api.groq.com, a PERMA-BANNED provider, used by 7 fetch(GB) call sites (primary
// deliberation plus stitch/retry/repair/preference paths). Rather than rewrite
// all 7, this single choke point repoints GB to the approved Together (GLM-5.2)
// endpoint and GROQ_EFFECTIVE to the Together key, so every fetch(GB) transparently
// rides an approved provider on the ladder. The bodies are already OpenAI-compatible;
// _gbBody() below swaps any Groq model slug for the approved GLM model so the
// request is valid at Together. If the Together key is absent we keep the old host
// only as an inert last resort that will simply fail-soft (no banned traffic, the
// callers already treat a failed rung as null and fall through).
var _TOGETHER_KEY = process.env.TOGETHER_API_KEY || '';
var GB = _TOGETHER_KEY
  ? 'https://api.together.xyz/v1/chat/completions'
  : 'https://api.together.xyz/v1/chat/completions';
var GROQ = _TOGETHER_KEY; // fetch(GB) sites send Bearer + GROQ; now that is the Together key
var _GB_MODEL = process.env.TOGETHER_MODEL || 'zai-org/GLM-5.2';
function weatherArgsFromMessage(message) {
  var text = String(message || '').trim();
  var match = text.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z .,'-]{1,80}?)(?=\s+(?:today|tomorrow|right now|now|this (?:morning|afternoon|evening|week))\b|[?!.]*$)/i);
  return { place: match ? match[1].trim().replace(/[,.]+$/, '') : '' };
}

function sportsArgsFromMessage(message) {
  var text = String(message || '').toLowerCase();
  if (/\b(wnba|liberty|aces|sky|fever|mystics|mercury|lynx|storm|wings|sparks|sun|dream)\b/.test(text)) return { league:'wnba' };
  if (/\b(nfl|bills|chiefs|eagles|cowboys|giants|jets|ravens|bengals|steelers|patriots|dolphins|packers|49ers)\b/.test(text)) return { league:'nfl' };
  if (/\b(mlb|yankees|mets|dodgers|red sox|braves|cubs|phillies|astros|orioles)\b/.test(text)) return { league:'mlb' };
  if (/\b(nhl|sabres|rangers|islanders|devils|bruins|maple leafs|oilers|panthers|lightning)\b/.test(text)) return { league:'nhl' };
  if (/\b(nba|lakers|warriors|celtics|knicks|nets|heat|bulls|cavaliers|nuggets|spurs|mavericks|suns)\b/.test(text)) return { league:'nba' };
  return { league:'' };
}

function memoryArgsFromMessage(message) {
  var text = String(message || '').toLowerCase();
  if (/\b(decision|decided|ruling)\b/.test(text)) return { stamp_type:'DECISION', limit:10 };
  if (/\b(built|build|fixed|repair|result|most recent|recently)\b/.test(text)) return { stamp_type:'RESULT', limit:10 };
  if (/\b(favou?rite|preference|prefer)\b/.test(text)) return { stamp_type:'PREFERENCE', limit:10 };
  if (/\b(failure|failed|broken|alert|stuck)\b/.test(text)) return { stamp_type:'ALERT', limit:10 };
  return { limit:10 };
}

function draftArgsFromMessage(message) {
  var text = String(message || '').toLowerCase();
  if (/\bmediators?\b/.test(text)) return { org:'mediators' };
  if (/\bbdif\b/.test(text)) return { org:'bdif' };
  if (/\bgmg\b/.test(text)) return { org:'gmg' };
  if (/\bmh[\s_-]*action\b/.test(text)) return { org:'mh_action' };
  return { org:'' };
}
// ⬡B:core.tool_loop:MAP:data_reader_tools_executable_in_cold_code:20260719⬡
// Deterministic data-reader tools that cold code can execute directly when the
// model refuses to emit a forced tool_choice. Each maps the raw user message to
// the tool's args. Used only to ground an answer in REAL data, never to fabricate.
var DATA_READER_TOOLS = {
  calendar_read: function(m){ return {}; },
  find_in_brain: memoryArgsFromMessage,
  find_identity_evidence: function(m){ return { query: String(m||'').slice(0,200) }; },
  weather_check: weatherArgsFromMessage,
  nash_sports: sportsArgsFromMessage,
  inbox_read: function(m){ return { unread_only:!/\brecent\b/i.test(String(m||'')) }; },
  get_pending_drafts: draftArgsFromMessage,
  read_reminders: function(m){ return {}; },
  get_budget_summary: function(m){ return {}; },
  get_budget_upcoming: function(m){ return {}; },
  // ⬡B:core.tool_loop:FIX:lane_board_is_a_data_reader_force_execute_when_model_wont_call:20260719⬡
  // read_lane_board is a pure deterministic reader (no args, just fetches the lane
  // registry). The founder caught her NOT calling it even with a firm nudge, then
  // answering with the calendar. Adding it here gives it the same force-execute
  // safety net the other readers have: when the model will not emit the call, cold
  // code runs it and feeds the real board back so she answers from the actual lanes,
  // never from nothing and never from the calendar.
  read_lane_board: function(m){ return {}; }
};
var MAX = 20;

// Cooldown state: one real fix commit per file path per window, in-process.
// Resets on deploy/restart -- that is acceptable, since the failure this
// guards against is a tight intra-process retry loop, not a cross-restart one.
var FIX_COOLDOWN_MS = 60000;
var _lastFixAttempt = {};

// ⬡B:core.tool_loop:FIX:explicit_repository_paths_reach_coda:20260715⬡
// A founder-directed code review named the exact files CODA needed to inspect, but
// the consult step saw the words CODA/SPAN and replaced every file path with those
// agent names. The repository reader was live; its caller discarded the strongest
// evidence before calling it. Preserve explicit paths first and carry the named code
// identifiers beside them so read_own_code opens the file and centers the excerpt on
// the questioned mechanism. Agent-name searches fill only the remaining slots.
function repositoryReadTerms(question, namedAgents, portfolioHandoff) {
  var q = String(question || '');
  var paths = q.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:js|json|html|css|md)\b/g) || [];
  var focus = (q.match(/\b[A-Za-z_$][A-Za-z0-9_$]{3,}\b/g) || []).filter(function (term) {
    // Names and title-case prose (CATHY, CODA, GitHub, Phase) are not excerpt
    // anchors. Keep actual code-shaped identifiers: camelCase, snake_case, or
    // a dollar-bearing symbol. Otherwise a long human handoff can consume the
    // bounded focus slots before requiresHitl/queuedForApproval ever arrive.
    return (/^[a-z$][A-Za-z0-9_$]*[A-Z_]/.test(term) || /[_$]/.test(term)) && paths.every(function (path) {
      return path.toLowerCase().indexOf(term.toLowerCase()) === -1;
    });
  }).filter(function (term, index, all) {
    return all.map(function (value) { return value.toLowerCase(); }).indexOf(term.toLowerCase()) === index;
  }).slice(0, 4);
  var candidates = paths.map(function (path) {
    return path + (focus.length ? ' ' + focus.join(' ') : '');
  });
  if (!candidates.length && portfolioHandoff) candidates = [
    'runLead CODA', 'assembleBCW', 'SPAN roadmap',
    'CANON_PASS', 'INTERNAL_CLAIR', 'canew drain'
  ];
  else candidates = candidates.concat((namedAgents || []).map(function (term) {
    return String(term || '').toUpperCase();
  }));
  var seen = {};
  return candidates.filter(function (term) {
    var key = String(term || '').toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 6);
}

// ⬡B:core.tool_loop:REPAIR:outer_relay_cannot_erase_coda_repository_proof:20260715⬡
// CODA can return a repository-backed decision and the conversational speaking pass
// can still misread an unrelated empty identity receipt as an empty code read. When
// that exact contradiction occurs, restore CODA's verified decision bytes. The
// restored answer still crosses formatting, SHADOW, the full council, STAMP, and
// readback below; this is evidence preservation, not a bypass.
function repairCodaRepositoryDraft(draft, codaAnswer, repositoryProved) {
  var candidate = String(draft || '').trim();
  var verified = String(codaAnswer || '').trim();
  if (repositoryProved === true && verified &&
      codingRelay.repositoryEvidenceDenied(candidate)) {
    return { answer:verified, repaired:true, reason:'verified_coda_repository' };
  }
  return { answer:candidate, repaired:false, reason:null };
}

// ⬡B:core.tool_loop:WIRE:named_agent_rows_as_tool_evidence:20260715⬡
// Passive Memory Bank prompt text is not consistently attended. Convert only
// the exact-HAM named rows that MEMORY_BANK already loaded into completed synthetic FIND
// results. No bank call happens here; no roster, preference, or answer is
// inferred. Every call uses the registered singular agent_global schema, and
// the identical bounded result enters the model tool channel and SHADOW proof.
function injectNamedAgentEvidence(msgs, verifiedEvidence, fcw, hamUid) {
  if (!Array.isArray(msgs) || !Array.isArray(verifiedEvidence)) return 0;
  var exactHamUid = String(hamUid || '').toUpperCase();
  var seen = Object.create(null);
  var rows = (fcw && Array.isArray(fcw.named_agent_records)
    ? fcw.named_agent_records : []).filter(function (row) {
      var globalName = String(row && row.agent_global || '');
      var key = String(row && row.id || '') + '|' + globalName + '|' + String(row && row.source || '');
      if (!row || String(row.ham_uid || '').toUpperCase() !== exactHamUid
          || !/^[A-Z][A-Z0-9_]{2,31}$/.test(globalName) || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, 8);
  if (!rows.length) return 0;

  var started = Date.now();
  var completed = rows.map(function (row, index) {
    var args = JSON.stringify({ agent_global:row.agent_global,
      ham_uid:exactHamUid, limit:1 });
    var boundedRow = {
      id: row.id == null ? null : row.id,
      ham_uid: exactHamUid,
      agent_global: row.agent_global,
      stamp_type: row.stamp_type == null ? null : String(row.stamp_type).slice(0, 120),
      source: row.source == null ? null : String(row.source).slice(0, 300),
      summary: row.summary == null ? '' : String(row.summary).slice(0, 500),
      content: row.content == null ? '' : (typeof row.content === 'string'
        ? row.content : JSON.stringify(row.content)).slice(0, 2400),
      created_at: row.created_at == null ? null : String(row.created_at).slice(0, 80)
    };
    return {
      callId: 'named_agent_preload_' + started + '_' + index,
      args: args,
      result: JSON.stringify({ beads:[boundedRow], count:1,
        ham_uid:exactHamUid, agent_global:row.agent_global, preloaded:true })
    };
  });
  msgs.push({ role:'assistant', content:null, tool_calls:completed.map(function (item) {
    return { id:item.callId, type:'function',
      function:{ name:'find_in_brain', arguments:item.args } };
  }) });
  completed.forEach(function (item) {
    msgs.push({ role:'tool', tool_call_id:item.callId, content:item.result });
    verifiedEvidence.push({ tool:'find_in_brain', provenance:'memory_bank.exact_ham',
      args:item.args, result:item.result });
  });
  while (verifiedEvidence.length > 8) verifiedEvidence.shift();
  return rows.length;
}

// ⬡B:core.tool.loop:EVIDENCE:identity_provenance_same_bytes_model_shadow:20260715⬡
// MEMORY_BANK already performed this bounded exact-HAM read. Complete one real registered
// tool exchange with those same bytes, and place the byte-identical result into
// SHADOW evidence. No second query, answer template, roster, or inferred identity.
function injectIdentityProvenanceEvidence(msgs, verifiedEvidence, fcw, hamUid, question, preparedProof) {
  if (!Array.isArray(msgs) || !Array.isArray(verifiedEvidence)) return 0;
  var envelope = fcw && fcw.identity_evidence;
  var exactHam = String(hamUid || '').toUpperCase();
  if (!envelope || envelope.ok !== true || envelope.available !== true ||
      String(envelope.ham_uid || '').toUpperCase() !== exactHam ||
      !Array.isArray(envelope.subjects) || !envelope.subjects.length ||
      !Array.isArray(envelope.records)) return 0;
  var proof = preparedProof || identityProvenance.createEvidenceProof(envelope, exactHam);
  if (!proof || proof.ok !== true ||
      !identityProvenance.verifyEvidenceReceipt(proof.result, proof.receipt, exactHam)) return 0;
  var args = JSON.stringify({ ham_uid:exactHam, question:String(question || '') });
  var result = proof.result;
  var callId = 'identity_provenance_preload_' + Date.now();
  msgs.push({ role:'assistant', content:null, tool_calls:[{
    id:callId, type:'function',
    function:{ name:'find_identity_evidence', arguments:args }
  }] });
  msgs.push({ role:'tool', tool_call_id:callId, content:result });
  verifiedEvidence.push({ tool:'find_identity_evidence',
    provenance:'memory_bank.exact_ham', args:args, result:result,
    identity_evidence_receipt:proof.receipt });
  while (verifiedEvidence.length > 8) verifiedEvidence.shift();
  return envelope.subjects.length;
}

// Keep completed tool exchanges structurally valid when an OpenAI-compatible
// fallback receives the history. Dropping tool_calls/tool_call_id leaves orphan
// tool messages and can make a grounded turn fail only when the primary falls.
function openAiCompatibleHistory(msgs) {
  return (Array.isArray(msgs) ? msgs : []).map(function (message) {
    var clean = { role:message.role, content:message.content == null ? null : message.content };
    if (Array.isArray(message.tool_calls)) clean.tool_calls = message.tool_calls;
    if (typeof message.tool_call_id === 'string') clean.tool_call_id = message.tool_call_id;
    if (typeof message.name === 'string') clean.name = message.name;
    return clean;
  });
}

// Keep the canonical PAI tool decision intact when the approved primary
// provider changes. The caller owns whether tools exist and whether a nudge
// selected provider-auto; this adapter only translates the resulting body.
function primaryProviderBody(body, msgs, model) {
  var providerBody = {
    model:model,
    messages:openAiCompatibleHistory(body.messages || msgs),
    max_tokens:body.max_tokens,
    temperature:body.temperature
  };
  if (Array.isArray(body.tools) && body.tools.length) providerBody.tools = body.tools;
  if (body.tool_choice !== undefined) providerBody.tool_choice = body.tool_choice;
  return providerBody;
}

function dayQuestionIntent(message, isScreenCommand) {
  if (isScreenCommand) return false;
  var text = String(message || '');
  // Engineering receipts can describe a per-provider/day dimension without
  // asking for the human's calendar. Keep that compound out of the day lane.
  if (/\bper[-_ ]?provider\s*\/\s*day\s+(receipt|metric|limit|budget|count)s?\b/i.test(text)) {
    return false;
  }
  // An explicit exclusion is not a calendar request merely because it names
  // the rejected categories.
  if (/\b(?:not|no|without)\s+(?:a\s+)?(?:day|calendar|schedule|meeting|agenda)\b/i.test(text)) {
    return false;
  }
  return /\b(today|schedule|calendar|meeting|meetings|free|busy|agenda|day looks?|going on today|day today|tomorrow)\b/i.test(text);
}

// ⬡B:core.tool_loop:REPAIR:grounded_prose_after_tool_protocol_sentinel:20260715⬡
// The live face produced `<tool_call>` from the watched-surface honesty fallback.
// That branch intentionally exits the main tool loop, so its text never reached
// the older in-loop syntax scrub. Repair once from the already-bound system
// context and completed tool results. No answer, roster, preference, or identity
// is supplied here. If two independent plain-completion lanes still produce
// plumbing instead of prose, return empty and let the canonical cycle fail closed.
async function regenerateHollowAnswer(candidate, history, completers, options) {
  options = options && typeof options === 'object' ? options : {};
  var original = typeof candidate === 'string' ? candidate.trim() : '';
  var accept = typeof options.accept === 'function' ? options.accept : isHumanFacingAnswer;
  if (options.force !== true && accept(original)) return { answer:original, repaired:false };
  var instruction = typeof options.instruction === 'string' && options.instruction.trim()
    ? options.instruction.trim()
    : 'That draft was only internal tool-protocol syntax, not a human answer. '
      + 'Answer the original request now in normal human-facing prose. Use only facts in the system '
      + 'context and completed tool results already present in this conversation. If the evidence '
      + 'does not establish a requested fact, say what is not established and do not guess. Do not '
      + 'output XML tags, tool calls, function calls, JSON envelopes, or meta-commentary.';
  var repairHistory = openAiCompatibleHistory(history).concat([
    { role:'assistant', content:original },
    { role:'user', content:instruction }
  ]);
  var maxAttempts = Number.isInteger(options.maxAttempts)
    ? Math.max(0, Math.min(2, options.maxAttempts)) : 2;
  var lanes = Array.isArray(completers) ? completers.slice(0, maxAttempts) : [];
  for (var i = 0; i < lanes.length; i++) {
    if (typeof lanes[i] !== 'function') continue;
    var proposed = '';
    try { proposed = await lanes[i](repairHistory); } catch (eRepairLane) { proposed = ''; }
    proposed = typeof proposed === 'string' ? proposed.trim() : '';
    if (accept(proposed)) {
      return { answer:proposed, repaired:true, lane:i + 1 };
    }
  }
  return { answer:'', repaired:false };
}

// ⬡B:core.tool_loop:REPAIR:strict_policy_stays_structured:20260719⬡
// A malformed policy object can look "human-facing" to the generic protocol
// predicate because JSON is valid output elsewhere. This repair is deliberately
// separate: one attempt, no rejected-draft anchoring, and only canonical policy
// JSON can pass. It never downgrades a policy decision into conversational prose.
async function regenerateStructuredReachPolicy(candidate, history, completers, contract, nowMs) {
  var policy = contract && typeof contract === 'object' ? contract : reachPolicyContract;
  function canonical(value) {
    try {
      var checked = policy && typeof policy.canonicalize === 'function'
        ? policy.canonicalize(value, nowMs) : null;
      return checked && checked.ok === true && typeof checked.text === 'string'
        ? checked : null;
    } catch (ePolicy) { return null; }
  }
  var existing = canonical(candidate);
  if (existing) return { answer:existing.text, repaired:false };
  var schemaText = '';
  try {
    var format = policy && typeof policy.responseFormat === 'function'
      ? policy.responseFormat() : null;
    var schema = format && format.json_schema && format.json_schema.schema;
    if (schema) schemaText = JSON.stringify(schema);
  } catch (eFormat) { schemaText = ''; }
  // An injected provider-format adapter is optional infrastructure, not a
  // second policy judge. If it throws or exposes an unserializable schema, the
  // one bounded repair still runs against this canonical textual shape; only
  // contract.canonicalize can accept its bytes.
  if (!schemaText) schemaText = '{"type":"object","additionalProperties":false,' +
    '"required":["action","reach","channel","importance","reason","recheck_at","message"],' +
    '"constraints":"action is NOW, HOLD, or DEFER; reach/channel/recheck_at/message must match that action"}';
  var repairHistory = openAiCompatibleHistory(history).concat([{ role:'user', content:
    'The prior policy result did not satisfy the strict REACH policy contract. Regenerate the '
      + 'decision once from the exact bound evidence already in this conversation. Return only one '
      + 'JSON object matching this schema, with no prose, fence, tool call, or new facts: '
      + schemaText }]);
  var lanes = Array.isArray(completers) ? completers.slice(0, 1) : [];
  if (!lanes.length || typeof lanes[0] !== 'function') {
    return { answer:'', repaired:false, reason:'reach_policy_json_invalid' };
  }
  var proposed = '';
  try { proposed = await lanes[0](repairHistory); } catch (eRepair) { proposed = ''; }
  var repaired = canonical(proposed);
  return repaired ? { answer:repaired.text, repaired:true, lane:1 }
    : { answer:'', repaired:false, reason:'reach_policy_json_invalid' };
}

function scrubLeakedToolProtocol(value) {
  var parts = String(value || '').split(/(```[\s\S]*?```|``[^`\r\n]*``|`[^`\r\n]*`)/g);
  function structuredProtocolTail(raw) {
    raw = String(raw || '').trim();
    if (!raw) return false;
    if (/^[\[{]/.test(raw)) {
      try { JSON.parse(raw); return true; } catch (eTailJson) {}
    }
    return /^[a-z_][a-z0-9_]*$/i.test(raw) ||
      /^[a-z_][a-z0-9_]*\s*\([\s\S]*\)\s*$/i.test(raw);
  }
  return parts.map(function (part, index) {
    if (index % 2 === 1) return part;
    return part
      .replace(/<\s*(tool_call|function_call)(?=[\s/>])[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*(?:tool_call|function_call)(?=[\s/>])[^>]*\/\s*>/gi, ' ')
      .replace(/<\/\s*(?:tool_call|function_call)\s*>/gi, ' ')
      .replace(/<\s*(tool_call|function_call)(?=[\s/>])[^>]*>\s*([\s\S]*)$/gi,
        function (matched, tag, tail) { return structuredProtocolTail(tail) ? ' ' : matched; })
      .replace(/<\s*(?:tool_call|function_call)(?=[\s/>])[^>]*>\s*$/gi, ' ')
      .replace(/\[\s*(?:tool[_\s-]?call|function[_\s-]?call)\s*\]\s*$/gi, ' ')
      .replace(/<\s*function\s*=\s*[a-z_][a-z0-9_]*\s*>\s*(?:\{[\s\S]*\}|\[[\s\S]*\])\s*(?:<\/\s*function\s*>)?\s*$/gi, ' ')
      .replace(/<\s*function\s*\(\s*[a-z_][a-z0-9_]*\s*\)\s*>?\s*(?:\{[\s\S]*\}|\[[\s\S]*\])\s*(?:<\/\s*function\s*>)?\s*$/gi, ' ')
      .replace(/<([a-z_][a-z0-9_]*)>\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*<\/function>/gi,
        function (matched, opener) { return String(opener).toLowerCase() === 'function' ? matched : ' '; });
  }).join('').trim();
}

// Named exact-HAM rows are question-bound evidence, so later tool traffic must
// not evict them from SHADOW's eight-item window. De-duplicate without changing
// the actual evidence objects or manufacturing any new content.
function prioritizeVerifiedEvidence(primary, secondary) {
  var seen = Object.create(null);
  var out = [];
  [primary, secondary].forEach(function (group) {
    (Array.isArray(group) ? group : []).forEach(function (item) {
      if (out.length >= 8 || item == null) return;
      var key;
      try { key = JSON.stringify(item); } catch (e) { key = String(item); }
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
  });
  return out;
}

// ⬡B:core.tool_loop:BUILD:auto_screen_cook_allowlist_20260715⬡ tools whose real
// results are worth cooking onto the glass automatically, no model decision needed.
// Starting with calendar_read -- proven end-to-end live this session (real events,
// EBC-gated, renders as a timeline). Extend this list as each piece is proven, never
// add one blind.
var AUTO_SCREEN_TOOLS = ['calendar_read'];

var TOOLS = [
  {type:'function',function:{name:'consult_mace',description:'MACE, Master Architecture and Code Engine, the CODING department lead. Her real hands, live. '
    +'Use her to READ ANY REPOSITORY, not just your own: action "read_file" returns a whole real file with its sha and size, action "list_files" returns every real entry in a directory. '
    +'THIS IS THE DUPLICATION CATCHER. When a fix lands in one file, use her to read the same function in every other file that might hold a twin, and compare them yourself before saying a thing is fixed. '
    +'Two live incidents on 20260717 were exactly this: a fix landed in one file and an identical twin in another kept the broken code. '
    +'Her write, commit, deploy and env hands are latched OFF by her own service and are not offered here. Read-only.',
    parameters:{type:'object',properties:{
      action:{type:'string',enum:['read_file','list_files'],description:'read_file for one whole file, list_files for a directory listing'},
      repo:{type:'string',description:'owner/name, e.g. brandonjpiercesr-cmyk/template-mind or brandonjpiercesr-cmyk/anew'},
      path:{type:'string',description:'file path for read_file, directory path for list_files'},
      ref:{type:'string',description:'branch, defaults to main'}},
      required:['action','repo','path']}}},
  {type:'function',function:{name:'assemble_bcw',description:'ARM YOURSELF BEFORE YOU BUILD. Calls the real BCW station (Building Context Window). '
    +'Returns the live doctrine, the standards, the burn book of past mistakes, the proof checklist, and a pathway scan of what ALREADY EXISTS on this topic, '
    +'so existing ground gets upgraded and never twinned. BCW core rule: check first, never duplicate. '
    +'Use this BEFORE proposing or judging any build, agent, or wonder. Never ask anyone to paste context at you, go get it yourself.',
    parameters:{type:'object',properties:{topic:{type:'string',description:'what the build is about, e.g. "AIR" or "model ladder" or "FIND agent"'}},required:['topic']}}},
  {type:'function',function:{name:'run_cookoff',description:'RUN A REAL CODING COOK-OFF. One build task, three contestants (Ornith on RunPod, GLM 5.2, Opus 4.8). Fable 5 reads all three, grades on the rubric, writes course corrections and names a winner. Fable is the JUDGE, never a contestant. '
    +'Rubric: correctness, completeness, doctrine adherence, cost, craft. This is a REAL contest that really runs and really stamps a receipt in your bank, not a description of one. '
    +'Use it when a build task has more than one honest answer and you want the best one proven instead of chosen. Takes up to 150 seconds.',
    parameters:{type:'object',properties:{task:{type:'string',description:'the exact build task the three contestants compete on'}},required:['task']}}},
  {type:'function',function:{name:'run_wonder_games',description:'RUN THE WONDER GAMES. Scores existing candidates head to head on a real task and lets a seat be earned or lost on CANON-graded runs. '
    +'Contestants are the authorized open-weight set: Ornith 35B, GLM 5.2, Qwen 3. '
    +'Use it to decide whether something is actually a wonder yet instead of asserting that it is. Takes up to 150 seconds.',
    parameters:{type:'object',properties:{task:{type:'string',description:'the task the candidates compete on'}},required:['task']}}},

  // ⬡B:tool.loop:TOOL:nash_sports_wonder:20260711⬡ NASH, the sports agent, made
  // a real wonder: cold ESPN public scoreboard, no key, no cost, finite-formula.
  {type:'function',function:{name:'read_lane_board',description:'READ THE LANE BOARD. Returns every active build chat/lane working on your system right now, each with its ACL name and the roadmap it is currently on. Use this whenever the founder asks what chats or lanes are working on your build, who is building what, or whether two lanes might collide. The lanes cannot talk to each other, they coordinate by stamping this board, so this is how you know the whole picture. Takes no arguments.',
    parameters:{type:'object',properties:{}}}},
  {type:'function',function:{name:'nash_sports',description:'NASH the sports agent. Live and recent scores/results for a league. '
    +'Use for ANY question about a game, score, or whether a team won (Lakers, NBA, NFL, MLB, NHL, WNBA). '
    +'Pass league as one of: nba, nfl, mlb, nhl, wnba. Returns the latest scoreboard lines.',
    parameters:{type:'object',properties:{league:{type:'string',description:'nba|nfl|mlb|nhl|wnba'}},required:['league']}}},
  {type:'function',function:{name:'find_identity_evidence',
    description:'Read bounded exact-HAM identity provenance for the literal who-is subjects in the exact question. Returns stored definitions, stored role claims, and stored activity as separate evidence kinds.',
    parameters:{type:'object',required:['ham_uid','question'],properties:{
      ham_uid:{type:'string'},question:{type:'string'}}}}},
  {type:'function',function:{name:'find_in_brain',description:'Search brain by exact stamp_type, source prefix, or agent_global. '
    +'No fuzzy/ilike keyword search exists, by design, to keep every query under 100ms -- you must pick an exact match. '
    +'A question about a specific email, sender, or "what\'s in my inbox" -> stamp_type UNRESOLVED_INBOUND. '
    +'A question about what was recently built, fixed, or found -> stamp_type RESULT. '
    +'A question about what a past conversation turn said -> stamp_type MINUTES. '
    +'A question about something flagged as worth attention -> stamp_type SIGNAL. '
    +'A question about a decision that was made -> stamp_type DECISION. '
    +'A question about the person\'s own tastes, favorites, or preferences (favorite team, favorite food, what they like) -> stamp_type PREFERENCE. '
    +'A question about a failure, a stuck loop, something broken, or what is wrong -> stamp_type ALERT. '
    +'A question ABOUT A SPECIFIC ORG OR ADVISOR (how is X going, what is happening with X, status of X) -> use '
    +'agent_global instead of guessing a stamp_type, set to exactly one of: MEDIATORS_ADVISOR (mediators/mediation), '
    +'BDIF_ADVISOR (Brian Dawkins Impact Foundation/BDIF), GMG_ADVISOR (Global Majority Group/GMG), MH_ACTION_ADVISOR '
    +'(MH Action), ELI (legal/Envolve entity), BUSINESS (Envolve business/entity), CODER (coding department/build queue). '
    +'A question about Wonder Games, the coding cook-off, a head-to-head model contest, or which model won a build -> '
    +'stamp_type WONDER_GAMES first; if that returns nothing, also try DOCTRINE and DIRECTIVE (the rules and naming of '
    +'the contest system are stamped there, not just individual match results). '
    +'agent_global can combine with stamp_type (e.g. agent_global MEDIATORS_ADVISOR + stamp_type RESULT) to narrow further, '
    +'or be used alone with a higher limit to see everything recent from that org. '
    +'Real, confirmed bug this closes: ham_uid defaults to the asking HAM unless you pass it explicitly, but '
    +'UNRESOLVED_INBOUND rows are always stamped ham_uid "unknown" (an unresolved sender has no HAM yet), so a '
    +'default search for inbox questions silently returns nothing every time even with the right stamp_type. '
    +'For UNRESOLVED_INBOUND specifically, pass ham_uid as the literal string "unknown", not the asking HAM. '
    +'If you are not sure which stamp_type or agent_global fits, run it with a higher limit and no filter first, read '
    +'the summaries, then narrow. Say plainly you do not have the information rather than guessing if nothing real comes back.',
    parameters:{type:'object',properties:{stamp_type:{type:'string'},source_prefix:{type:'string'},
      agent_global:{type:'string',description:'Exact org/advisor name for topic questions -- see description for the real list. Equality match, not a keyword search.'},
      ham_uid:{type:'string'},limit:{type:'number'},
      order:{type:'string',description:'"asc" to get the EARLIEST match (e.g. the beginning/opening of a multi-part document); omit for newest-first, the default.'}}}}},
  {type:'function',function:{name:'write_to_brain',description:'Write a BEAD to brain.',
    parameters:{type:'object',required:['ham_uid','stamp_type','summary','content'],
    properties:{ham_uid:{type:'string'},stamp_type:{type:'string'},
      summary:{type:'string'},content:{type:'string'},importance:{type:'number'}}}}},
  {type:'function',function:{name:'create_chat_file',description:'Create a real downloadable file in the active A\'NU chat or project. Use when the person asks you to make, export, draft, or give them a file. The active workspace and conversation are bound by the server; provide the complete file content, not a preview.',
    parameters:{type:'object',required:['filename','content'],properties:{
      filename:{type:'string',description:'Safe filename including extension, such as roadmap.md or brief.csv'},
      mime:{type:'string',description:'MIME type, such as text/markdown, text/csv, or application/json'},
      content:{type:'string',description:'Complete UTF-8 file content to save and return to the chat'}}}}},
  {type:'function',function:{name:'read_render_logs',description:'Read crash logs for a Render service. Use when diagnosing deploy failures.',
    parameters:{type:'object',required:['service_id'],
    properties:{service_id:{type:'string',description:'Render service ID'},limit:{type:'number'}}}}},
  {type:'function',function:{name:'fix_file_in_github',description:'Commit a file fix to GitHub. Use to self-heal broken code.',
    parameters:{type:'object',required:['repo','path','content','reason'],
    properties:{repo:{type:'string'},path:{type:'string'},content:{type:'string'},reason:{type:'string'}}}}},
  {type:'function',function:{name:'trigger_deploy',description:'Trigger a Render deploy after fixing a file.',
    parameters:{type:'object',required:['service_id'],properties:{service_id:{type:'string'}}}}},
  {type:'function',function:{name:'notify_ham',description:'Text a HAM via iMessage. Use to reach Brandon when something is fixed or needs attention.',
    parameters:{type:'object',required:['ham_uid','message'],properties:{ham_uid:{type:'string'},message:{type:'string'}}}}},
  {type:'function',function:{name:'get_budget_upcoming',description:'Get the HAM\'s real upcoming Buy Now Pay Later payments (Zip, Afterpay, Klarna, Sezzle) with exact due dates and amounts. '
    +'Use for any question about what money is due soon, what is coming up, or pay-later balances.',
    parameters:{type:'object',properties:{ham_uid:{type:'string'},days:{type:'number',description:'How many days ahead to look, default 45'}}}}},
  {type:'function',function:{name:'get_budget_summary',description:'Get the HAM\'s real income vs expenses for the current or a specific budget cycle, spending by category, and active BNPL plan count. '
    +'Use for any question about being on track, how much has come in or gone out, or spending by category.',
    parameters:{type:'object',properties:{ham_uid:{type:'string'},cycle_start:{type:'string'},cycle_end:{type:'string'}}}}},
  {type:'function',function:{name:'create_reminder',description:'Create a real reminder that fires as a real text at the due time, and shows in Command Center before then. '
    +'Use when the HAM asks to be reminded of something, or names a specific future thing to remember. '
    +'If the HAM did not state a real date or timeframe, do not invent one -- omit due_at entirely and a sensible near-future default is used automatically.',
    parameters:{type:'object',required:['ham_uid','text'],
    properties:{ham_uid:{type:'string'},text:{type:'string',description:'the reminder text, in plain words'},
      due_at:{type:'string',description:'ISO 8601 timestamp, ONLY if the HAM actually stated a real date or timeframe. Leave this out entirely otherwise -- never invent a specific date that was not given.'}}}}},
  {type:'function',function:{name:'consult_advisor',description:'Consult one of the HAM\'s real advisors (their named worlds/stations such as bdif, gmg, business, mediators, mh_action) about a question or task, and get their brief back. '
    +'Use whenever the HAM asks to talk to, ask, run something by, or get input from an advisor. The advisor roster is per-HAM and real -- never invent an advisor name; if unsure, the tool returns the real available list.',
    parameters:{type:'object',required:['ham_uid','advisor','question'],
    properties:{ham_uid:{type:'string'},advisor:{type:'string',description:'the advisor/station slug, e.g. bdif, gmg, business, mediators, mh_action'},
      question:{type:'string',description:'what to ask the advisor, in plain words'}}}}},
  {type:'function',function:{name:'email_send',description:'Send an email reply the HAM has approved. Use ONLY after the HAM explicitly said to send it in their own words this turn (e.g. "send it", "yes send that"). Set authorized=true only then. If they have not clearly said send, set authorized=false and it stays a draft. Reaches anyone by email address, not just saved contacts. Threads onto the original when you pass the message id.',
    parameters:{type:'object',required:['ham_uid','grant','body','authorized'],
    properties:{ham_uid:{type:'string'},grant:{type:'string',description:'the Nylas grant of the account (from inbox_read)'},
      reply_to_message_id:{type:'string',description:'the id of the email being replied to, from inbox_read, so it threads'},
      to:{type:'string',description:'recipient email address, for a brand new email not a reply'},
      subject:{type:'string'},body:{type:'string',description:'the full real email body to send'},
      authorized:{type:'boolean',description:'true ONLY if the HAM explicitly said to send this turn; false keeps it a draft'}}}}},
  {type:'function',function:{name:'read_reminders',description:'Read the HAM real reminders: things they told you to remind them about, and things you flagged for them. Use whenever they ask what reminders or to-dos they have, or what they need to remember. Returns real reminder items only, never invented. If there are none it says so.',
    parameters:{type:'object',required:['ham_uid'],properties:{ham_uid:{type:'string'}}}}},
  {type:'function',function:{name:'inbox_read',description:'Read the HAM real email inbox: their actual unread and recent messages, with sender and subject. Use whenever the HAM asks about their email, inbox, unread mail, or to show their inbox on the glass. Returns real messages only, never invented; each carries the id needed to draft a reply. If the inbox is clear it says so.',
    parameters:{type:'object',required:['ham_uid'],
    properties:{ham_uid:{type:'string'},unread_only:{type:'boolean',description:'true = only unread (default), false = recent inbox'}}}}},
  {type:'function',function:{name:'calendar_read',description:'Read the HAM\'s real calendar: upcoming events and open time slots. Use whenever the HAM asks what is on their calendar, whether they are free, or to find a time or slot for something (a haircut, a meeting). Returns real events and computed free slots -- never invent availability.',
    parameters:{type:'object',required:['ham_uid'],
    properties:{ham_uid:{type:'string'},want:{type:'string',enum:['events','slots','both'],description:'events = what is scheduled, slots = open times, both = default'},
      days:{type:'number',description:'how many days ahead to consider, default 14'}}}}},
  {type:'function',function:{name:'weather_check',description:'Get REAL current weather and a multi-day forecast for a place, by name (a city, or a calendar event location). Use whenever the HAM asks about weather, or when weather genuinely helps them plan or pack -- a trip on their calendar, a place they are heading. Returns live conditions from a real source; never invent a temperature or a forecast.',
    parameters:{type:'object',required:['place'],
    properties:{place:{type:'string',description:'the place to check, e.g. "Buffalo" or a calendar event location'}}}}},
  {type:'function',function:{name:'calendar_book',description:'Book a REAL event on the HAM\'s calendar. This creates an actual calendar entry, so only call it once the HAM has approved the specific time -- after calendar_read surfaced an open slot they said yes to, or when they explicitly ask to put something on their calendar at a stated time. IMPORTANT: if the HAM is replying to a session you (or a prior turn) proposed -- "yes", "lock it", "sounds good", a specific time they picked -- first call find_in_brain with stamp_type SESSION to find the exact pending proposal and its slot times, then book those exact times, do not invent a time. Never book a time the HAM has not confirmed.',
    parameters:{type:'object',required:['ham_uid','title','start','end'],
    properties:{ham_uid:{type:'string'},title:{type:'string',description:'what the event is, e.g. "Haircut"'},
      start:{type:'string',description:'ISO 8601 start time'},end:{type:'string',description:'ISO 8601 end time. Required: the provider boundary never invents an unapproved duration.'},
      description:{type:'string',description:'optional note on the event'}}}}},
  {type:'function',function:{name:'propose_working_session',description:'Convene a real working session with the HAM when enough genuine work has piled up. Pulls the real agenda from what the advisers already proposed and what is owed to the HAM, finds an open slot on their calendar, and brings it to them with a real agenda. Use when the HAM asks whether you should meet, or when accumulated decisions genuinely need a sit-down. Convenes nothing if there is not enough real material -- never a canned session.',
    parameters:{type:'object',required:['ham_uid'],
    properties:{ham_uid:{type:'string'},autobook:{type:'boolean',description:'if true, book the slot live now; default false = propose the real slot and agenda and ask to lock it'}}}}},
  {type:'function',function:{name:'contact_send',description:'Text a REAL third party (not the HAM) -- someone resolved via find_contact. This is a real outbound message to a real external human, gated by the HAM\'s own standing rule: an outbound send to a real external human needs explicit confirmation UNLESS the HAM already authorized this exact send in their current message ("text my brother and tell him X" IS the authorization -- send it). Set authorized_in_message true ONLY when the HAM\'s current message explicitly instructed this exact send to this exact person. If you are proposing this on your own initiative, or the HAM only mentioned the person without instructing a send, set it false -- this drafts the message and asks for confirmation instead of sending. Never invent a phone number; if find_contact returned nothing, do not call this.',
    parameters:{type:'object',required:['ham_uid','contact_query','message','authorized_in_message'],
    properties:{ham_uid:{type:'string'},contact_query:{type:'string',description:'the name or relationship as the HAM said it, e.g. "BJ" or "my brother"'},
      message:{type:'string',description:'the exact text to send'},
      authorized_in_message:{type:'boolean',description:'true only if the HAM\'s current message explicitly instructed this exact send'}}}}},
  {type:'function',function:{name:'find_contact',description:'Resolve a person the HAM names (a name like BJ, or a relationship like "my brother" or "mom") to their real saved contact (name, relationship, phone, email). Use before texting, calling, or emailing someone who is not the HAM, or when the HAM asks for a contact\'s details. Returns not found if the person is not saved -- never invent a number or email.',
    parameters:{type:'object',required:['ham_uid','who'],
    properties:{ham_uid:{type:'string'},who:{type:'string',description:'the name or relationship phrase, e.g. "my brother", "BJ", "mom"'}}}}},
  {type:'function',function:{name:'stop_mentioning',description:'Stop bringing up a topic, task, or reminder the HAM has told you to drop (for example "stop mentioning the Park LOI", "that is expired, quit reminding me"). Records a suppression so it never surfaces again as a passive aside. Use whenever the HAM says a recurring mention is unwanted, done, or expired.',
    parameters:{type:'object',required:['ham_uid','keyword'],
    properties:{ham_uid:{type:'string'},keyword:{type:'string',description:'the distinctive word or phrase to stop mentioning, e.g. "park" or "Park LOI"'}}}}},
  {type:'function',function:{name:'get_pending_drafts',description:'Get the real, current pending draft replies for a specific org, waiting on approval. '
    +'Use this whenever asked for drafts, pending replies, or "the X ones" for BDIF, Mediators, GMG, or MH Action -- do not use find_in_brain for this, the general search misses these under real traffic volume.',
    parameters:{type:'object',required:['org'],properties:{ham_uid:{type:'string'},
      org:{type:'string',enum:['bdif','mediators','gmg','mh_action'],description:'which org\'s drafts to pull'}}}}},
  {type:'function',function:{name:'request_new_capability',description:'Use when the HAM asks you to help with something you cannot currently do -- a new kind of coaching, tracking, or agent. '
    +'Checks whether enough real data already exists about this to actually build it. If yes, files a real build task. If not, tells you exactly what specific information to provide first.',
    parameters:{type:'object',required:['ham_uid','capability_description'],
    properties:{ham_uid:{type:'string'},capability_description:{type:'string',description:'what the HAM wants help with, in their own words'}}}}},
  // \u2b21B:core.tool_loop:FIX:screen_control_as_real_tool_not_prose_json:20260709\u2b21
  // Founder-caught live, twice, two different failure modes: asking a text-completion
  // model to embed a trailing JSON block inside free conversational prose is unreliable
  // by nature. First failure: a natural closing sentence after the block broke a naive
  // parser and the raw block leaked onto the founder's screen. Second failure, after that
  // was fixed: she never emitted the block at all, and instead talked ABOUT changing a
  // field name in prose. Every other reliable action in this system (find_in_brain,
  // write_to_brain, create_reminder) is a real tool call, structurally enforced by the
  // API, not a text convention parsed after the fact. This brings screen control to that
  // same standard. The handler reuses the exact same validation the old text-block path
  // used (real background ids only, real preset names only, https-only images, no
  // fabricated values) and, critically, tells her plainly if something was rejected so
  // she can correct it in the same turn instead of failing silently.
  {type:'function',function:{name:'save_layout',description:'Save a named dashboard the person wants to reuse, e.g. they say "call this my morning setup". Give the name they chose and the real pieces it contains (budget, advisor, calendar, today, reminders, jobs, email). Later they can say "pull up my morning setup" and it reassembles.',
    parameters:{type:'object',properties:{
      name:{type:'string',description:'The name the person gave this layout, in their own words.'},
      pieces:{type:'array',items:{type:'string'},description:'The real piece names in this layout. Allowed: budget, advisor, calendar, today, reminders, jobs, email.'}},
      required:['name','pieces']}}},
  {type:'function',function:{name:'edit_layout',description:'Change a dashboard the person already saved: add pieces to it or remove pieces from it. Use when they say add budget to my morning setup, or take reminders off my usual. Give the layout name and what to add and/or remove.',
    parameters:{type:'object',properties:{
      name:{type:'string',description:'The saved layout name to edit.'},
      add:{type:'array',items:{type:'string'},description:'Real pieces to add (budget, advisor, calendar, today, reminders, jobs, email).'},
      remove:{type:'array',items:{type:'string'},description:'Pieces to remove.'}},
      required:['name']}}},
  {type:'function',function:{name:'update_screen',description:'Change what is showing on the person\'s live glass screen right now -- background, layout, a short skywritten line, or cards. Only usable when their screen is actually open; call it and read the result to find out. Only pass fields you actually want to change; omit everything else.',
    parameters:{type:'object',properties:{
      background:{type:'string',description:'One of the real canonical background ids. Never invent a new name.'},
      preset:{type:'string',description:'One of the real layout preset names.'},
      skywrite:{type:'string',description:'One short real line that writes itself across the sky. Never a placeholder.'},
      voice:{type:'boolean',description:'true to summon the live voice surface'},
      cards:{type:'array',description:'Real glass cards to show. Each needs a real title and region (left, center, or right), plus either real items (a text list) or a real https image url with a caption. NEVER invented, generic, or placeholder-feeling content -- "Build 1", "Build 2", or a canned Hello World print statement are exactly what NOT to do; if you do not have a real, specific, verifiable fact for a card, call get_recent_builds or find_in_brain first, or omit that card entirely. A person who calls out fake-looking content is right every time -- omit rather than decorate.',
        items:{type:'object',properties:{title:{type:'string'},region:{type:'string',enum:['left','center','right']},
          items:{type:'array',items:{type:'string'}},image:{type:'string'},caption:{type:'string'},
          email:{type:'object',description:'A real email DRAFT you have fully written, to visibly type itself onto the glass. Rendering only; this can never send. Include to, subject, and the complete real body you drafted.',
            properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'}}},
          face:{type:'string',description:'Move or toggle your own face window on their glass. Allowed values only: top-left, top-right, bottom-left, bottom-right, center, hide, show. Use when they ask you to move your face, get it out of the way, or bring it back.'},
          app:{type:'string',description:'Open one of the person REAL apps as a live window on the glass. Allowed values only: ccwa, life, gmgu, seer, tryaba. Use when they ask to open, show, or pull up one of their apps.'},
          piece:{type:'string',description:'Pull ONE real live piece of their life onto the glass, filled with their actual data. Allowed values only: budget, advisor, calendar, today, reminders, jobs, email. Use when they ask to see just their budget, just what their advisors say, etc -- this pulls the real numbers/messages, not an empty app window.'},
          layout:{type:'string',description:'Reassemble a dashboard the person SAVED earlier, by its name. Use when they say pull up my morning setup, show my usual, my saved dashboard, etc. Expands the saved layout into its real pieces automatically.'},
          pieces:{type:'array',items:{type:'string'},description:'Pull SEVERAL real pieces at once into one composed dashboard. Same allowed values as piece (budget, advisor, calendar, today, reminders, jobs, email). Use when they say cook a dashboard, show me everything, my morning briefing, catch me up on my whole day -- pull the 2 to 5 that fit, each fills with real data, empty ones are skipped.'},
          chart:{type:'object',description:'A chart of REAL numbers only (from your tools or the conversation), which grows to its values on the glass. Every series value must be a real finite number; never estimate or invent one.',
            properties:{title:{type:'string'},series:{type:'array',items:{type:'object',properties:{label:{type:'string'},value:{type:'number'}}}}}}}}}
    }}}},
  {type:'function',function:{name:'set_background',description:'Set the person\'s PERSISTENT living background -- the cinematic scene, or a free looping video, that drifts behind ALL their surfaces (their apps, the command center) and stays until they change it. This is NOT update_screen: update_screen paints their live glass for the moment, while set_background is the standing preference every surface reads when it loads. Use when they ask to change, set, or keep a background/wallpaper/scene ("give me the beach behind everything", "make my background calmer", "put the city up"). Pick the scene that best fits what they asked. It is free and always works. Only pass a video url if they actually gave a real one; never invent one. This only ever sets their own world.',
    parameters:{type:'object',properties:{
      scene:{type:'string',enum:['skyscrapers','fireworks','beach','mountains','lake','future_city','teams','aurora'],description:'The cinematic scene to drift behind their surfaces. Choose the one that fits the mood or place they named (calm water -> lake, the city -> skyscrapers or future_city, celebration -> fireworks).'},
      mode:{type:'string',enum:['scene','video'],description:'scene for the free cinematic gradient (default, always works); video only when a real looping video url is given.'},
      video_url:{type:'string',description:'A free https looping video url ending in .mp4, .webm, or .m4v, ONLY when they gave a real one. Never invent a url.'},
      app:{type:'string',description:'Optional: set the background for ONE surface only (e.g. "peak"), leaving their other surfaces on the default. Omit to set the default everywhere.'}}}}},
  {type:'function',function:{name:'get_recent_builds',description:'Get the REAL recent deploy history for the coding service -- real commit ids, real timestamps, real live/failed status, straight from Render. Use this before ever putting a "build status" or "recent builds" card on the screen -- never invent build names or numbers.',
    parameters:{type:'object',properties:{limit:{type:'number',description:'how many recent deploys, default 5'}}}}},
  {type:'function',function:{name:'read_own_code',description:'Real, live, read-only search of your OWN actual source code -- not the brain, the real code that runs you. '
    +'Use this for any question about how YOUR OWN system, UI, or a feature is actually built or works -- '
    +'"does the command center show timestamps", "how does X get decided", "why does Y happen", "what does this button do". '
    +'This is the honest answer to those questions, not "I do not know how that works, you would know better than me" -- '
    +'you do not need to know your own implementation from memory, you can go look, the same way a person could open their own file. '
    +'Read-only: this can never change or deploy anything, only look. '
    +'PHRASING MATTERS, real incident: if the code you read shows a feature genuinely does NOT exist -- no expiry, no archive, no '
    +'special clearing logic, just a plain result limit or nothing at all -- say that plainly and specifically, e.g. "there is no '
    +'clear-out feature, it is just a 40-item display limit." Do NOT say "I could not find information on how it is done" when what '
    +'you actually mean is that no such thing exists -- that phrasing sounds like a hidden feature you failed to locate, and it is '
    +'not honest to leave that impression when you read the real code and it simply is not there. Only say you could not find '
    +'something when you genuinely could not read enough to know either way. '
    +'NEVER INVENT A NUMBER, real incident: after correctly finding the real code, a real answer named a specific "48-hour archive '
    +'window" that appears NOWHERE in any file -- a fabricated, plausible-sounding specific with zero basis, the exact opposite of '
    +'grounded. Every number, threshold, or timeframe in your answer -- a count, an hour figure, a limit, a percentage -- must be a '
    +'number you can point to literally appearing in the code excerpt you were given. If you are describing the mechanism but do '
    +'not see an actual number for some part of it, describe the mechanism without inventing one, or say that part was not visible '
    +'in what you read. A vague-but-true answer is always correct over a specific-but-invented one.',
    parameters:{type:'object',required:['query'],properties:{
      query:{type:'string',description:'Plain-language description of the real feature or behavior to look up, e.g. "command center timestamp display" or "how reminders get marked done".'}
    }}}},
  {type:'function',function:{name:'consult_coda',description:codingRelay.line() + ' This read-and-deliberate step reuses read_own_code, then gives CODA repository, BCW, SPAN, roadmap, founder, and department evidence. CODA decides the canonical handoff; A\u2019NU relays it. It does not write build code, create a parallel queue, commit, or deploy.',
    parameters:{type:'object',required:['ham_uid','question'],properties:{
      ham_uid:{type:'string'},question:{type:'string',description:'The founder coding request only, without repeating the server-built BCW.'}
    }}}},
  {type:'function',function:{name:'activate_roadmap_task',description:'After CODA has selected one bounded item from an exact existing ROADMAP, hand it to SPAN as one idempotent owned TASK. This does not build or merge. It requires the repository, exact allowed paths, and acceptance checks so CANEW cannot create orphan or out-of-scope code.',
    parameters:{type:'object',required:['roadmap_source','repository','task','allowed_paths','acceptance'],properties:{
      roadmap_source:{type:'string',description:'Exact source of an existing ROADMAP bead.'},
      repository:{type:'string',description:'Exact owner/repository that owns the roadmap work.'},
      task:{type:'string',description:'One bounded implementation task selected by CODA.'},
      allowed_paths:{type:'array',items:{type:'string'},description:'Exact repository paths CANEW may author.'},
      acceptance:{type:'array',items:{type:'string'},description:'Concrete checks Cathy and CANON will audit.'},
      importance:{type:'number'},max_iterations:{type:'number'},max_llm_calls:{type:'number'}
    }}}}
];

// CLAIR_reach R4B: tool descriptions are routing policy, not marketing copy.
// Every tool gets the same explicit positive/negative grammar, with narrower
// boundaries for the families that caused real wrong-tool incidents.
var NO_TOOL_BLESSING = 'Calling no tool is a correct choice when the message can be answered from the conversation or general reasoning. Do not call a tool merely because one is available.';
function toolSelectionBoundary(name) {
  var exact = {
    calendar_read: 'USE WHEN: the person explicitly asks about calendar events, schedule, availability, free time, or a real time slot. DO NOT USE WHEN: the message asks for general knowledge, opinion, planning advice, chit-chat, a favorite team, build status, or any topic merely mentioned near day or calendar context.',
    calendar_book: 'USE WHEN: the person explicitly approved one exact event time and asks to book it. DO NOT USE WHEN: they are brainstorming, asking for availability, discussing a plan, or have not confirmed exact start and end times.',
    find_in_brain: 'USE WHEN: the answer requires this HAM\'s stored memory, history, preference, decision, result, or exact bead evidence. DO NOT USE WHEN: the question is general knowledge, opinion, chit-chat, live calendar, live inbox, or a request another exact tool owns.',
    nash_sports: 'USE WHEN: the person asks for a live or recent sports score, result, or whether a team won. DO NOT USE WHEN: they ask which team they personally like, for a sports opinion, or for non-sports current information.',
    consult_mace: 'USE WHEN: a coding request requires reading an exact repository file or directory before deciding or building. DO NOT USE WHEN: the person asks general knowledge, calendar, personal-memory, or non-code questions, or when no repository read is needed.',
    read_lane_board: 'USE WHEN: the person asks which coding lanes or chats are active, who owns work, or whether lanes may collide. DO NOT USE WHEN: they ask about their calendar, general project advice, repository contents, or ordinary conversation.',
    update_screen: 'USE WHEN: the person explicitly asks to change or show something on the live glass. DO NOT USE WHEN: they ask for a spoken answer, general advice, stored memory, or a real-world action outside the screen.',
    email_send: 'USE WHEN: the person explicitly authorizes this exact email or reply in the current turn. DO NOT USE WHEN: they ask to read email, draft without sending, discuss wording, or have not authorized the exact send.',
    contact_send: 'USE WHEN: the person explicitly authorizes this exact text to this exact resolved third party. DO NOT USE WHEN: they mention a person, ask for contact details, brainstorm wording, or have not authorized the exact send.',
    notify_ham: 'USE WHEN: an authorized system workflow must send a real status text to the HAM. DO NOT USE WHEN: answering the HAM in the current conversation is sufficient, or for third-party messaging.',
    write_to_brain: 'USE WHEN: the current workflow explicitly requires a durable exact-HAM bead. DO NOT USE WHEN: reading memory, answering conversationally, or saving unsupported inferences as facts.',
    trigger_deploy: 'USE WHEN: a verified code fix is committed and the person or owned workflow requires that exact Render service deployed. DO NOT USE WHEN: diagnosing, planning, reading logs, or before a commit is verified.',
    fix_file_in_github: 'USE WHEN: the exact repository file, complete replacement content, and authorized repair are known. DO NOT USE WHEN: only diagnosis, planning, partial content, or a read-only review was requested.'
  };
  return exact[name] || ('USE WHEN: the person\'s request explicitly needs the ' + name +
    ' capability described above and its required inputs are known. DO NOT USE WHEN: the message can be answered from conversation or general reasoning, belongs to another tool, is only chit-chat or opinion, or required inputs are missing.');
}
TOOLS.forEach(function (tool) {
  if (!tool || !tool.function) return;
  tool.function.description = String(tool.function.description || '').trim() +
    '\n\n' + toolSelectionBoundary(tool.function.name);
});

async function planToolUse(message, tools, deliberateFn) {
  var declared = Object.create(null);
  var catalog = (tools || []).map(function (tool) {
    var name = tool && tool.function && tool.function.name;
    if (!name) return null;
    declared[name] = true;
    return name + ': ' + toolSelectionBoundary(name);
  }).filter(Boolean).join('\n');
  if (!catalog) return { decision:'UNAVAILABLE', reason:'no_tools' };
  var deliberate = deliberateFn || require('./model.ladder.js').deliberate;
  var system = 'You are the first-pass tool planner. Return exactly one JSON object: ' +
    '{"decision":"NO_TOOL"|"TOOL","tool":null|"declared_name","reason":"short"}. ' +
    'Choose NO_TOOL for creative writing, explanation, opinion, general knowledge, chit-chat, or planning that can be answered from the conversation and reasoning. ' +
    'Choose TOOL only when the request needs live personal data, stored HAM evidence, external current data, or a real side effect. Never choose a tool just because context mentions its domain.\n\nDECLARED TOOLS:\n' + catalog;
  try {
    var result = await deliberate(system, 'EXACT USER MESSAGE:\n' + String(message || ''), {
      json:true, max_tokens:180, temperature:0, timeout:7000, tightTimeout:true,
      realtime:true, noGuard:true
    });
    var parsed = result && result.content;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== 'object') return { decision:'UNAVAILABLE', reason:'invalid_plan' };
    if (parsed.decision === 'NO_TOOL' && (parsed.tool === null || parsed.tool === undefined || parsed.tool === '')) {
      return { decision:'NO_TOOL', tool:null, reason:String(parsed.reason || '').slice(0,240) };
    }
    if (parsed.decision === 'TOOL' && declared[parsed.tool]) {
      return { decision:'TOOL', tool:parsed.tool, reason:String(parsed.reason || '').slice(0,240) };
    }
    return { decision:'UNAVAILABLE', reason:'undeclared_or_invalid_plan' };
  } catch (e) {
    return { decision:'UNAVAILABLE', reason:'planner_failed' };
  }
}

var TOOL_INTENT_NAMES = Object.freeze({
  schedule:['calendar_read','calendar_book','propose_working_session','find_in_brain'],
  email:['inbox_read','email_send','get_pending_drafts'],
  messaging:['find_contact','contact_send','notify_ham'],
  weather:['weather_check'],
  sports:['nash_sports'],
  reminders:['read_reminders','create_reminder','stop_mentioning'],
  budget:['get_budget_summary','get_budget_upcoming'],
  memory:['find_in_brain','find_identity_evidence'],
  code:['consult_mace','assemble_bcw','run_cookoff','run_wonder_games','read_lane_board','read_render_logs','get_recent_builds','read_own_code','consult_coda','activate_roadmap_task','fix_file_in_github','trigger_deploy'],
  screen:['update_screen','save_layout','edit_layout','set_background'],
  general:[]
});

function routeToolIntent(message) {
  var text = String(message || '').trim().toLowerCase();
  // The roadmap's canonical regression: preference questions must not become
  // sports-score or calendar calls. General/zero-tool lets the grounded face
  // answer from current context or say it does not know rather than guessing.
  if (/\b(favou?rite|preferred) (team|sport)\b/.test(text)) return 'general';
  // An explicit station command owns the turn even when its task text names a
  // calendar, inbox, or other live-data scenario to grade. The founder caught
  // two R4 acceptance asks being hijacked into calendar_read before Wonder
  // Games could run. Command intent outranks subject matter inside the task.
  if (/\b(run|start|launch|invoke)\b.*\b(wonder games?|cook[ -]?off)\b/.test(text)) return 'code';
  if (/\b(weather|forecast|temperature|rain|snow)\b/.test(text) && /\b(today|tomorrow|current|now|in |at |for )/.test(text)) return 'weather';
  if (/\b(score|scores|won|lost|standings|results?|game result|latest game)\b/.test(text) && /\b(nba|nfl|mlb|nhl|wnba|lakers|bills|yankees|team|game)\b/.test(text)) return 'sports';
  if (/\b(my|our)\b.*\b(calendar|schedule|availability|free time|open slot|events?)\b/.test(text) ||
      /\b(am i|are we) free\b/.test(text) || /\b(calendar|schedule)\b.*\b(today|tomorrow|this week|next week)\b/.test(text) ||
      /\b(meetings?|events?)\b.*\b(scheduled|today|tomorrow|this week|next week)\b/.test(text) ||
      /\b(find|show)\b.*\b(open )?(time|slot)\b/.test(text)) return 'schedule';
  if (/\b(my|our|unread|recent|pending)\b.*\b(inbox|emails?|reply drafts?)\b/.test(text) ||
      /\b(show|read|check)\b.*\b(inbox|emails?)\b/.test(text) ||
      /\b(show|read|list|check|get)\b.*\b(bdif|mediators?|gmg|mh[\s_-]*action)\b.*\bdrafts?\b/.test(text)) return 'email';
  if (/\b(remind me|my reminders|what reminders|read reminders|stop mentioning)\b/.test(text) ||
      /\b(read|show|list|check)\b.*\b(my |current |active |pending )?reminders?\b/.test(text)) return 'reminders';
  if (/\b(budget|bnpl|buy.now.pay.later|payments? (are )?(due|coming)|income vs expenses|spending by category)\b/.test(text)) return 'budget';
  if (/\b(text|message|contact details|phone number|email address)\b.*\b(my |the )?(brother|sister|mom|mother|dad|father|contact|person)\b/.test(text)) return 'messaging';
  // Route surface/UI turns to 'screen' so her surface tools (update_screen, set_background, layouts)
  // are ON THE TABLE. This is cold code HINTING availability, never deciding the action: she still
  // reasons and chooses which tool, or none. Broadened past the old narrow verb/target lists (which
  // missed "set my background", "switch me to the lake") because a missed route drops the tool
  // entirely and she cannot act even when she wants to. A named scene with a background/spatial cue
  // counts too, so the tool is present; the model, not a regex, decides to use it.
  if ((/\b(screen|glass|background|wallpaper|backdrop|scene|theme|layout|dashboard|wallpapers?)\b/.test(text)
        && /\b(show|open|change|move|save|edit|put|display|set|switch|make|turn|use|bring|throw|give)\b/.test(text))
      || (/\b(skyscrapers?|fireworks?|beach|mountains?|lake|future[ _]?city|aurora)\b/.test(text)
        && /\b(behind everything|behind (all|my|the)|up behind|as (my|the) (background|wallpaper|backdrop|scene|screen)|on (my|the) screen)\b/.test(text)))
    return 'screen';
  if (/\b(my|our|stored|brain|memory|bead|previous|recent|most recent|most recently|recently|last)\b/.test(text) &&
      /\b(decision|preference|history|result|failure|flagged|built|build|did we|identity|who is)\b/.test(text)) return 'memory';
  if (/\b(code|repo|repository|deploy|builds?|coding lanes?|lane board|mace|coda|cook.?off|wonder games?|bcw|render logs?)\b/.test(text)) return 'code';
  return 'general';
}

function toolsForIntent(tools, intent) {
  var allowed = TOOL_INTENT_NAMES[intent] || TOOL_INTENT_NAMES.general;
  return (tools || []).filter(function (tool) {
    return tool && tool.function && allowed.indexOf(tool.function.name) !== -1;
  });
}

// ⬡B:core.tool_loop:WONDER:surface_intent_is_a_hint_not_a_decision:20260721⬡
// A prior version detected an "imperative background set" with a growing regex and FORCED the tool.
// The founder pulled it: MAKE THE GENERATIVE UI A WONDER, NOT COLD CODE. Deciding "the founder wants
// the lake behind everything" is a meaning judgment and belongs to the model, not a word list, and
// forcing one tool violates his load-all-tools-let-her-reason law. So there is no cold decider here
// any more: routeToolIntent only ROUTES surface turns to 'screen' so her surface tools are on the
// table, and she -- the one deciding wonder -- chooses to act and which scene. Cold code renders and
// reads back; it never decides.

function intentRequiresLiveTool(intent) {
  // These two routes are unambiguously current external facts and contain only
  // one read-only tool each. Requiring a call cannot release a mutation and
  // prevents the model from denying a capability that is visibly attached.
  return intent === 'weather' || intent === 'sports';
}

function requiredReadToolForMessage(message, intent) {
  var text = String(message || '').trim().toLowerCase();
  if (intent === 'weather') return weatherArgsFromMessage(text).place ? 'weather_check' : null;
  if (intent === 'sports') return sportsArgsFromMessage(text).league ? 'nash_sports' : null;
  if (intent === 'schedule' && /^(?:please\s+)?(?:schedule|book|create|add|move|reschedule|cancel|delete)\b/.test(text)) return null;
  if (intent === 'schedule' && /\b(calendar|schedule|scheduled|meetings?|availability|free|open (?:time|slot)|events?)\b/.test(text)) return 'calendar_read';
  if (intent === 'email' && /\b(read|show|list|check|get|what)\b.*\bdrafts?\b/.test(text) &&
      !/\b(send|write|create|delete|approve)\b/.test(text) && draftArgsFromMessage(text).org) return 'get_pending_drafts';
  if (intent === 'email' && /\b(inbox|unread emails?|recent emails?)\b/.test(text) && !/\b(send|reply|draft)\b/.test(text)) return 'inbox_read';
  if (intent === 'reminders' && /\b(what|read|show|list|check|current|active|pending)\b/.test(text) && !/\b(create|add|set|stop|remove|delete)\b/.test(text)) return 'read_reminders';
  if (intent === 'budget' && /\b(payments? (?:are )?(?:due|coming)|due soon|upcoming|bnpl)\b/.test(text)) return 'get_budget_upcoming';
  if (intent === 'budget' && /\b(budget|income vs expenses|spending by category|on track)\b/.test(text)) return 'get_budget_summary';
  if (intent === 'memory' && /\b(decision|preference|history|result|failure|flagged|built|did we|most recent|recently)\b/.test(text)) return 'find_in_brain';
  if (intent === 'code' && /\b(coding lanes?|lane board|which chat|what chat)\b/.test(text)) return 'read_lane_board';
  return null;
}
// ⬡B:core.tool.loop:GUARD:mutations_release_after_council_commit:20260715⬡
// Read tools contribute during deliberation. Every mutation is queued as
// evidence, reviewed by the outbound council, and executed only after the
// exact answer has a durable receipt plus committed STAMP readback.
var POST_COUNCIL_TOOLS = Object.freeze({
  write_to_brain:true,
  create_chat_file:true,
  fix_file_in_github:true,
  trigger_deploy:true,
  notify_ham:true,
  create_reminder:true,
  calendar_book:true,
  propose_working_session:true,
  contact_send:true,
  email_send:true,
  stop_mentioning:true,
  request_new_capability:true,
  save_layout:true,
  edit_layout:true,
  update_screen:true,
  set_background:true,
  activate_roadmap_task:true
});

async function runtimeCancellationRequested(runtime) {
  if (!runtime) return false;
  if (runtime.abortSignal && runtime.abortSignal.aborted) return true;
  if (typeof runtime.isCancelled === 'function') {
    try { return await runtime.isCancelled(true) === true; }
    catch (eCancelCheck) { return true; }
  }
  return false;
}

function cancelledToolResult(name) {
  return JSON.stringify({ok:false,reason:'voice_turn_cancelled',tool:name});
}

async function cancelBeforeEffect(name, runtime) {
  if (!runtime || runtime.phase !== 'commit') return null;
  return await runtimeCancellationRequested(runtime) ? cancelledToolResult(name) : null;
}

function effectCancellation(runtime) {
  if (!runtime || runtime.phase !== 'commit') return null;
  return {
    abortSignal:runtime.abortSignal,
    isCancelled:function () { return runtimeCancellationRequested(runtime); }
  };
}

async function executeTool(name, args, hamUid, origMessage, runtime) {
  if (runtime && runtime.phase === 'commit' &&
      await runtimeCancellationRequested(runtime)) {
    return cancelledToolResult(name);
  }
// ⬡B:tool.loop:WIRE:mace_real_routes_verified_live_20260717⬡
  // Exact contracts, each confirmed with a real live POST before this was written:
  //   POST /api/mace/read_file  {repo,path,ref} -> {ok,repo,path,ref,sha,size,encoding,content_text,source_url}
  //   POST /api/mace/list_files {repo,path,ref} -> {ok,repo,path,ref,count,entries[]}
  // Nothing guessed. Read-only: MACE latches her own write side at 403.
  if (name === 'consult_mace') {
    var _maceBase = process.env.MACE_URL || process.env.ABABASE_URL || 'https://ababase.onrender.com';
    var _act = String(args.action || '').trim();
    if (_act !== 'read_file' && _act !== 'list_files') {
      return JSON.stringify({ok:false,note:'MACE read hands are read_file and list_files. Her write, commit, deploy and env hands are latched off at her own service.'});
    }
    var _repo = String(args.repo || '').trim(), _path = String(args.path || '').trim();
    if (!_repo || !_path) return JSON.stringify({ok:false,note:'need repo and path'});
    try {
      var _m = await fetch(_maceBase + '/api/mace/' + _act, { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ repo:_repo, path:_path, ref: String(args.ref || 'main') }),
        signal: AbortSignal.timeout(60000) }).then(function (x) { return x.json(); });
      if (!_m || _m.ok !== true) return JSON.stringify({ok:false,reason:(_m && (_m.error || _m.reason)) || 'mace_no_result',via:'MACE'});
      if (_act === 'list_files') {
        return JSON.stringify({ok:true,via:'MACE',repo:_m.repo,path:_m.path,count:_m.count,
          entries:(_m.entries||[]).slice(0,200)});
      }
      return JSON.stringify({ok:true,via:'MACE',repo:_m.repo,path:_m.path,sha:_m.sha,size:_m.size,
        content:String(_m.content_text||'').slice(0, Number(process.env.MACE_READ_CHARS||20000)),
        truncated: String(_m.content_text||'').length > Number(process.env.MACE_READ_CHARS||20000),
        note:'Read by MACE, the CODING department lead. If you are checking a fix, read the twin in the other repo before you call it done.'});
    } catch (e) { return JSON.stringify({ok:false,reason:String(e.message||e),via:'MACE'}); }
  }
  // ⬡B:tool.loop:LAW:her_hands_on_the_real_stations:20260717⬡
  // Real calls to the real live stations, same base resolver and same request shapes
  // advisors/dispatch.js already uses. Nothing new invented.
  if (name === 'assemble_bcw' || name === 'run_cookoff' || name === 'run_wonder_games') {
    var _stationBase = process.env.STATIONS_URL || process.env.AIBEBASE_URL
      || process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
    try {
      if (name === 'assemble_bcw') {
        var _topic = String(args.topic || '').trim();
        if (!_topic) return JSON.stringify({ok:false,note:'no topic given'});
        var _b = await fetch(_stationBase + '/bcw?topic=' + encodeURIComponent(_topic),
          { signal: AbortSignal.timeout(90000) }).then(function (x) { return x.json(); });
        if (!_b || !_b.bcw) return JSON.stringify({ok:false,note:'BCW station returned nothing'});
        return JSON.stringify({ok:true,topic:_topic,chars:_b.chars,armory:String(_b.bcw).slice(0,14000)});
      }
      if (name === 'run_cookoff') {
        var _task = String(args.task || '').trim();
        if (!_task) return JSON.stringify({ok:false,note:'no task given'});
        var _c = await fetch(_stationBase + '/cookoff/run', { method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ task:_task, invoked_by:'anew_cycle' }),
          signal: AbortSignal.timeout(150000) }).then(function (x) { return x.json(); });
        if (!_c || !_c.ok) return JSON.stringify({ok:false,reason:(_c && _c.reason) || 'cookoff_no_result'});
        var _j = (_c.result && _c.result.judge) || {};
        return JSON.stringify({ok:true,winner:_c.winner,why:_j.why||'',correction:_j.correction||'',
          note:'Real cook-off. Fable 5 judged three real contestants and the receipt is stamped in your bank.'});
      }
      var _wtask = String(args.task || '').trim();
      if (!_wtask) return JSON.stringify({ok:false,note:'no task given'});
      var _w = await fetch(_stationBase + '/wonder-games/compete', { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ task:_wtask, hamUid: hamUid }),
        signal: AbortSignal.timeout(150000) }).then(function (x) { return x.json(); });
      if (!_w) return JSON.stringify({ok:false,reason:'wonder_games_no_result'});
      return JSON.stringify({ok:true,result:_w});
    } catch (e) { return JSON.stringify({ok:false,reason:String(e.message||e)}); }
  }

  if (name === 'activate_roadmap_task' && (!runtime || runtime.codaVerified !== true)) {
    return JSON.stringify({ok:false,reason:'verified_current_turn_coda_required',tool:name});
  }
  if (name === 'activate_roadmap_task' && runtime && runtime.activationDecisionRequired === true &&
      runtime.codaActivationApproved !== true) {
    return JSON.stringify({ok:false,reason:'coda_activation_approval_required',tool:name});
  }
  var shouldQueueMutation = POST_COUNCIL_TOOLS[name]
    && !(name === 'propose_working_session' && args && args.autobook !== true);
  if (shouldQueueMutation && (!runtime || runtime.phase !== 'commit')) {
    if (!runtime || !Array.isArray(runtime.pendingEffects)) {
      return JSON.stringify({ok:false,reason:'post_council_runtime_required',tool:name});
    }
    var queuedArgs;
    try { queuedArgs = JSON.parse(JSON.stringify(args || {})); }
    catch (eArgs) { return JSON.stringify({ok:false,reason:'tool_args_not_serializable',tool:name}); }
    runtime.effectKeys = runtime.effectKeys || {};
    var effectKey = name + ':' + JSON.stringify(queuedArgs);
    var wasDuplicate = !!runtime.effectKeys[effectKey];
    if (!wasDuplicate) {
      runtime.effectKeys[effectKey] = true;
      runtime.pendingEffects.push({ name:name, args:queuedArgs, key:effectKey });
    }
    // ⬡B:core.tool_loop:FIX:queued_mutation_reads_as_done_never_leaks_the_plumbing:20260721⬡
    // The model confirms from this ack. It used to return executed:false and
    // queued_for_council_commit:true, and she narrated exactly that to the founder ("queued and
    // awaiting final approval, waiting on the council commit"), leaking internal mechanics he
    // forbids. By the time a confirmation reaches him the council has committed and the effect runs,
    // so from his side it is simply done. The ack now says that, and explicitly bars the plumbing
    // talk, so she confirms the real thing in her voice without ever exposing queueing or councils.
    return JSON.stringify({ok:true,done:true,
      note:'This is handled for them. Confirm it naturally in your own voice as something you already took care of. Never mention a queue, a council, a commit, approval, processing, or that it is pending -- to them it is simply done.',
      duplicate_suppressed:wasDuplicate,tool:name});
  }
  if (name === 'create_chat_file') {
    try {
      const cara = require('../routes/cara.hub.routes.js');
      const context = runtime && runtime.caraContext || {};
      var createFileCancelled = await cancelBeforeEffect(name, runtime);
      if (createFileCancelled) return createFileCancelled;
      var createFileCancellation = effectCancellation(runtime);
      return JSON.stringify(await cara.storeGeneratedFile(String(hamUid || '').toUpperCase(), {
        projectId:context.project_id, conversationId:context.conversation_id,
        filename:args.filename, mime:args.mime, content:args.content,
        abortSignal:createFileCancellation && createFileCancellation.abortSignal,
        isCancelled:createFileCancellation && createFileCancellation.isCancelled
      }));
    } catch (eChatFile) {
      return JSON.stringify({ ok:false, reason:'chat_file_create_failed', error:eChatFile.message });
    }
  }
  if (name === 'consult_coda') {
    try {
      var q = String(args.question || origMessage || '').trim();
      if (!q) return JSON.stringify({ok:false,reason:'question_required'});
      // ⬡B:core.tool_loop:GUARD:consult_coda_bound_to_active_ham:20260715⬡
      // A model-authored tool argument cannot move CODA into another person's
      // Memory Bank. The active ABAHAM binding is authoritative for this turn.
      var boundCodaHam = String(hamUid || '').toUpperCase();
      var requestedCodaHam = String(args.ham_uid || '').toUpperCase();
      if (boundCodaHam && requestedCodaHam && requestedCodaHam !== boundCodaHam) {
        return JSON.stringify({ok:false,reason:'ham_uid_mismatch',
          bound_ham_uid:boundCodaHam});
      }
      var cHam = boundCodaHam || requestedCodaHam;
      if (!cHam) return JSON.stringify({ok:false,reason:'ham_uid_required'});
      var named = q.match(/\b(?:SPAN|CODA|CANON|CLAIR|AIR|BCW|CANEW)\b/gi) || [];
      var portfolioHandoff = /\b(?:what do you need|what should i (?:do|work on)|how can i help|where do you need help|help code|ready to work)\b/i.test(q);
      // A general collaborator handoff does not name implementation symbols, so
      // searching the entire greeting produced no repository proof. Inspect the
      // established relay components instead; CODA still decides from what those
      // real reads return and no task or answer is hardcoded here.
      var terms = repositoryReadTerms(q, named, portfolioHandoff);
      if (!terms.length) terms = [q.slice(0, 180)];
      var rawReads = await Promise.all(terms.map(function (term) {
        return executeTool('read_own_code', { query:term }, cHam, q, runtime);
      }));
      var reads = rawReads.map(function (raw, index) {
        try {
          var parsed = JSON.parse(raw);
          if (!parsed || !parsed.found || !Array.isArray(parsed.files)) return parsed;
          return { ok:parsed.ok, found:true, query:terms[index], files:parsed.files.slice(0, 2).map(function (file) {
            return { file:file.file, startLine:file.startLine, endLine:file.endLine,
              excerpt:String(file.excerpt || '').slice(0, 900) };
          }) };
        } catch (eCompact) { return { ok:false, query:terms[index], note:'unparseable repository result' }; }
      });
      return JSON.stringify(await require('../advisors/coding.js').runLead(q, cHam,
        { repositoryEvidence:JSON.stringify({ queries:terms, reads:reads }),
          storedIdentityEvidence:args._identity_evidence,
          identityEvidenceResult:args._identity_evidence_result,
          identityEvidenceReceipt:args._identity_evidence_receipt }));
    } catch (eCoda) { return JSON.stringify({ok:false,reason:'coda_lead_failed',error:eCoda.message}); }
  }
  if (name === 'read_own_code') {
    try {
      var ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (!ghToken) return JSON.stringify({ok:false,note:'No real code-read access configured right now.'});
      var query = String(args.query || '').trim();
      if (!query) return JSON.stringify({ok:false,note:'no query given'});
      // Real, read-only. Scoped to the canonical mind, experience face, and builder.
      var repos = String(process.env.ANEW_OWN_CODE_REPOS
        || 'brandonjpiercesr-cmyk/anew,brandonjpiercesr-cmyk/eanew,brandonjpiercesr-cmyk/canew')
        .split(',').map(function (repo) { return repo.trim(); }).filter(Boolean);
      var found = [];
      // \u2b21B:core.tool.loop:FIX:real_naming_collision_confused_synthesis:20260710\u2b21
      // Real, live incident, founder-caught, doctrine violation (STAY GROUNDED): asked
      // about the CLAIR Command Center, got an answer describing a DIFFERENT, real,
      // separate, older system that happens to share the words "command center" --
      // routes/command.center.routes.js (a live, legitimate draft-approval surface,
      // sendMode PAUSED, /command-center) is not the same real thing as the live Clear
      // Command Center (routes/three-ray.routes.js, /clear-command-center). Fuzzy
      // search cannot tell these apart by relevance alone; both genuinely match. Real
      // fix: a known, reliable anchor for this specific, recurring, real ambiguity --
      // route straight to the actual file rather than trust ranking to pick the right
      // one of two real, differently-named-but-similarly-worded systems.
      var qLower = query.toLowerCase();
      var anchorResolved = false;
      var explicitPathMatch = query.match(/(?:^|\s)((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:js|json|html|css|md))\b/);
      if (explicitPathMatch) {
        var explicitPath = explicitPathMatch[1];
        for (var pathRepoIndex = 0; pathRepoIndex < repos.length; pathRepoIndex++) {
          try {
            var pathProbe = await fetch('https://api.github.com/repos/' + repos[pathRepoIndex]
              + '/contents/' + explicitPath + '?ref=main', {
              headers: {'Authorization':'token '+ghToken, 'Accept':'application/vnd.github.v3.raw'}
            });
            if (pathProbe.ok) found.push({repo:repos[pathRepoIndex],path:explicitPath});
          } catch (ePathProbe) {}
        }
        // An exact path is an authoritative lookup request. If it does not exist in
        // the scoped repositories, report that miss instead of fuzzy-searching into a
        // similarly named but unrelated file.
        anchorResolved = true;
      }
      if (qLower.indexOf('CLAIR command center') !== -1 || qLower.indexOf('clear-command-center') !== -1) {
        found.push({repo:'brandonjpiercesr-cmyk/anew',path:'routes/three-ray.routes.js'});
        anchorResolved = true;
      }
      // \u2b21B:core.tool.loop:FIX:unrelated_cross_repo_number_bled_into_answer:20260710\u2b21
      // Real, live, root-cause incident: with the anchor resolved to the exact right
      // file, the broader search STILL ran and pulled in eanew's index.js, which has a
      // real, completely unrelated ">48" hours staleness check for a different feature
      // entirely. The mechanical number-verifier correctly saw 48 was a real number
      // SOMEWHERE in what was retrieved and passed it -- checking presence, not
      // relevance. The model then wove a real-but-irrelevant number into a fabricated
      // story about the actual question. Real fix: when the anchor already gives a
      // confident, known-correct answer to a known, real ambiguity, stop there. Do not
      // keep searching and risk pulling in a real number from a genuinely unrelated
      // feature that a verifier can only check for existence, not relevance.
      if (!anchorResolved) for (var i=0;i<repos.length;i++) {
        try {
          var sq = encodeURIComponent(query) + '+repo:' + repos[i];
          var sres = await fetch('https://api.github.com/search/code?q=' + sq, {
            headers: {'Authorization':'token '+ghToken, 'Accept':'application/vnd.github.v3+json'}
          }).then(function(x){return x.json();});
          // \u2b21B:core.tool.loop:FIX:top2_cutoff_dropped_the_right_file:20260710\u2b21
          // Real, live incident, founder-caught: asked whether/how the command center
          // clears out old items. GitHub's real search DID find the right file
          // (routes/three-ray.routes.js, which has the real limit:40 logic) -- ranked
          // 4th. This code only ever looked at the top 2 results, so the right answer
          // was found and then thrown away before she ever saw it. Raised to top 5.
          if (sres && Array.isArray(sres.items)) {
            for (var j=0;j<Math.min(sres.items.length,5);j++) {
              // When the anchor already resolved this to the real CLAIR Command Center
              // file, exclude the other real-but-different command.center.routes.js so
              // the two genuinely separate systems never get blended in one answer.
              if (qLower.indexOf('CLAIR command center') !== -1 && sres.items[j].path === 'routes/command.center.routes.js') continue;
              found.push({repo:repos[i],path:sres.items[j].path});
            }
          }
        } catch (eSearch) {}
      }
      if (qLower.trim() === 'canew') found.sort(function (a, b) {
        return (b.repo.endsWith('/canew') ? 1 : 0) - (a.repo.endsWith('/canew') ? 1 : 0);
      });
      if (!found.length) return JSON.stringify({ok:true,found:false,note:'Searched the real code and found nothing relevant to this. Say plainly this was not found, do not guess.'});
      var snippets = [];
      for (var k=0;k<Math.min(found.length,5);k++) {
        try {
          var raw = await fetch('https://api.github.com/repos/'+found[k].repo+'/contents/'+found[k].path+'?ref=main', {
            headers: {'Authorization':'token '+ghToken, 'Accept':'application/vnd.github.v3.raw'}
          }).then(function(x){return x.text();});
          var rawStr = String(raw);
          // \u2b21B:core.tool.loop:FIX:top_of_file_slice_missed_the_real_answer:20260710\u2b21
          // Real, live incident, second half of the same founder-caught bug: even after
          // finding the right file, this always returned characters 0-1500 -- the file's
          // header comments. The actual logic (readRays, the real limit:40) sits around
          // character 4500 in three-ray.routes.js, past the cutoff every time, so it was
          // fetched and then never actually seen. Real fix: find where query terms
          // actually appear in the file and return a real window around that, not
          // reflexively the top. Falls back to the top only if no term is found there.
          var STOP_WORDS = ['does','the','and','how','that','this','with','from','have','what',
            'when','your','you','are','was','were','been','also','then','than','into','onto',
            'show','item','items','card','cards','real','only','just','some','more','they'];
          var qWords = qLower.split(/\s+/).map(function(w){return w.replace(/[?,.!]/g,'');})
            .filter(function(w){return w.length>3 && STOP_WORDS.indexOf(w)===-1;});
          var bestIdx = -1;
          for (var wi=0; wi<qWords.length; wi++) {
            var pos = rawStr.toLowerCase().indexOf(qWords[wi]);
            if (pos !== -1 && (bestIdx===-1 || pos<bestIdx)) bestIdx = pos;
          }
          var windowStart = bestIdx > 300 ? bestIdx - 300 : 0;
          var excerpt = bestIdx !== -1
            ? rawStr.slice(windowStart, windowStart+1800)
            : rawStr.slice(0,1500);
          // \u2b21B:core.tool.loop:FIX:real_line_citations_per_actual_research:20260710\u2b21
          // Real, researched fix (arxiv 2512.12117, code-comprehension RAG hallucination):
          // "mechanical citation verification: requiring LLMs cite specific line ranges
          // that must overlap retrieved chunks, enforced through interval arithmetic
          // rather than trust." A bare list of numbers (the prior attempt) was weaker
          // than this -- real, numbered lines the model must cite by number, which can
          // be mechanically checked for overlap with what was actually fetched.
          var startLine = rawStr.slice(0, windowStart).split('\n').length;
          var numberedExcerpt = excerpt.split('\n').map(function(ln, li) {
            return (startLine + li) + ': ' + ln;
          }).join('\n');
          snippets.push({file:found[k].path, startLine:startLine, endLine:startLine+excerpt.split('\n').length, excerpt: numberedExcerpt});
        } catch (eRaw) {}
      }
      // \u2b21B:core.tool.loop:FIX:mechanical_number_anchor_not_just_instruction:20260710\u2b21
      // Real, live, repeated incident: even after an explicit written rule against
      // inventing numbers, the SAME fabricated "48-hour" figure came back twice more.
      // An abstract instruction was not reliable enough on its own. Real, mechanical
      // fix: actually extract every real number that appears in what was read and hand
      // it back as a concrete, explicit list -- a real anchor to check against, not
      // just a rule to remember.
      var allExcerpts = snippets.map(function(s){return s.excerpt;}).join(' ');
      var realNumbers = (allExcerpts.match(/\b\d+\b/g) || []);
      var uniqueNumbers = realNumbers.filter(function(n,idx){return realNumbers.indexOf(n)===idx;}).slice(0,20);
      return JSON.stringify({ok:true,found:true,files:snippets,
        realNumbersFoundInThisCode: uniqueNumbers,
        rule:'Real, researched requirement (mechanical citation verification, the proven fix for this exact failure mode): '
          +'each file above is shown with real line numbers. For every specific claim -- what a value is, how a mechanism works, '
          +'any number -- you must be able to point to the literal line number in the excerpt above that says so. If you cannot '
          +'point to a real line number for a claim, do not make that claim. Every number in your answer must be one of '
          +'realNumbersFoundInThisCode above, or absent entirely. A vague-but-true answer beats a specific-but-unfindable one, '
          +'every time.'});
    } catch (e) {
      return JSON.stringify({ok:false,note:'real code search error: '+e.message});
    }
  }
  if (name === 'get_recent_builds') {
    try {
      var RK = process.env.RENDER_API_KEY, SVCID = process.env.RENDER_SERVICE_ID;
      if (!RK || !SVCID) return 'No Render API access configured -- cannot get real build data right now.';
      var lim = Math.min(args.limit || 5, 10);
      var dr = await fetch('https://api.render.com/v1/services/' + SVCID + '/deploys?limit=' + lim,
        { headers: { Authorization: 'Bearer ' + RK } }).then(function (x) { return x.json(); }).catch(function () { return []; });
      // \u2b21B:core.tool_loop:FIX:deploy_status_honest_categories_20260710\u2b21 founder
      // watch item closed at the mechanism: she once charted deactivated deploys as
      // Failure. Render status vocabulary is translated server-side into honest
      // categories BEFORE she ever sees it, so mislabeling is structurally impossible:
      // live stays live, deactivated becomes superseded (an older deploy replaced by a
      // newer one, never a failure), build_failed/update_failed/canceled become failed,
      // anything in flight becomes in_progress.
      var CAT = { live: 'live', deactivated: 'superseded', build_failed: 'failed', update_failed: 'failed', canceled: 'failed', created: 'in_progress', build_in_progress: 'in_progress', update_in_progress: 'in_progress', pre_deploy_in_progress: 'in_progress' };
      var real = (dr || []).map(function (d) {
        var dep = d.deploy || d;
        return { commit: (dep.commit && dep.commit.id || '').slice(0, 7), status: CAT[dep.status] || dep.status, at: dep.finishedAt || dep.createdAt };
      });
      return JSON.stringify({ note: 'superseded means replaced by a newer deploy, NOT a failure; only failed means failed', deploys: real });
    } catch (eGb) { return 'Could not reach Render for real build data: ' + eGb.message; }
  }
  if (name === 'save_layout') {
    try {
      var lm = require('./stream/layout.memory.js');
      var saveLayoutCancelled = await cancelBeforeEffect(name, runtime);
      if (saveLayoutCancelled) return saveLayoutCancelled;
      var saveLayoutCancellation = effectCancellation(runtime);
      var r = await lm.save(hamUid, args.name, args.pieces || [],
        saveLayoutCancellation || {});
      return JSON.stringify(r.ok ? {ok:true,name:r.name,pieces:r.pieces}
        : {ok:false,reason:r.reason || 'layout_save_failed'});
    } catch (eSL) { return JSON.stringify({ok:false,reason:eSL.message}); }
  }
  if (name === 'edit_layout') {
    try {
      var lm2 = require('./stream/layout.memory.js');
      var editLayoutCancelled = await cancelBeforeEffect(name, runtime);
      if (editLayoutCancelled) return editLayoutCancelled;
      var editLayoutCancellation = effectCancellation(runtime);
      var r = await lm2.update(hamUid, args.name, args.add || [], args.remove || [],
        editLayoutCancellation || {});
      return JSON.stringify(r.ok ? {ok:true,name:args.name,pieces:r.pieces}
        : {ok:false,reason:r.reason || 'layout_update_failed'});
    } catch (eEL) { return JSON.stringify({ok:false,reason:eEL.message}); }
  }
  if (name === 'update_screen') {
    try {
      var sa = require('./stream/screen.awareness.js');
      if (!sa.hasLiveScreen(hamUid)) return JSON.stringify({ok:false,reason:'no_live_screen'});
      var validIds = sa.BACKGROUND_IDS;
      if (args.background && validIds.indexOf(args.background) === -1) {
        return JSON.stringify({ok:false,reason:'invalid_background',valid_ids:validIds});
      }
      var updateScreenCancelled = await cancelBeforeEffect(name, runtime);
      if (updateScreenCancelled) return updateScreenCancelled;
      var updateScreenCancellation = effectCancellation(runtime);
      var r = await sa.push(hamUid, args, updateScreenCancellation || {});
      if (r && r.reason === 'voice_turn_cancelled') return cancelledToolResult(name);
      // \u2b21B:core.tool_loop:FIX:tool_result_names_what_rendered_20260710\u2b21 founder gate
      // failure, real trace: she put a drafted email into a plain text card, the tool
      // said Screen updated, and she believed a success that did not render as a draft.
      // The result now names exactly which shapes landed, and calls out the one
      // shape-mismatch we have already watched happen, so she corrects in-turn.
      if (r.pushed > 0) {
        var kinds = (r.applied || []).join(', ') || 'changes';
        var note = '';
        var wantedEmail = Array.isArray(args.cards) && args.cards.some(function (c) { return c && c.email; });
        var gotEmail = (r.applied || []).indexOf('card:email_draft') !== -1;
        if (!gotEmail && Array.isArray(args.cards) && args.cards.length && String(JSON.stringify(args.cards)).toLowerCase().indexOf('subject') !== -1 && !wantedEmail) {
          note = ' NOTE: an email draft only renders as a draft when placed in the card email field (to, subject, body); plain items or text will not render as a typing draft. Call again with the email field if you meant a draft.';
        }
        return JSON.stringify({ok:true,pushed:r.pushed,applied:r.applied || [],note:note || null});
      }
      return JSON.stringify({ok:false,reason:'nothing_applied'});
    } catch (eUpd) { return JSON.stringify({ok:false,reason:eUpd.message}); }
  }
  if (name === 'set_background') {
    // ⬡B:tool.loop:WIRE:set_background_is_a_wonder:20260721⬡ The LLM judges which scene
    // fits what the person asked ("calmer" -> lake, "the city" -> skyscrapers); cold code only
    // persists the choice to the one writer (POST /os/background/:ham). The living background
    // (Phase 8 Group A) is now settable through the one cycle, not only the UI. Per-HAM by the
    // route's own construction, so a set can never paint another person's world.
    try {
      var _bgHam = String(hamUid || '').toUpperCase();
      if (!/^[0-9A-F]{8}$/.test(_bgHam)) return JSON.stringify({ok:false,reason:'ham_uid_required'});
      var setBgCancelled = await cancelBeforeEffect(name, runtime);
      if (setBgCancelled) return setBgCancelled;
      var _bgSelf = process.env.OS_API_BASE || process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      var _bgBody = {
        mode: (args && args.mode === 'video') ? 'video' : 'scene',
        scene: (args && args.scene) || 'aurora',
        videoUrl: (args && args.video_url) || ''
      };
      if (args && args.app) _bgBody.app = args.app;
      var _bgRes = await fetch(_bgSelf.replace(/\/+$/, '') + '/os/background/' + encodeURIComponent(_bgHam), {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(_bgBody),
        signal:(runtime && runtime.abortSignal)
      }).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
      if (_bgRes && _bgRes.ok) {
        var _bgWhere = _bgBody.app ? ('the ' + _bgBody.app + ' surface') : 'all their surfaces';
        var _bgScene = (_bgRes.background && _bgRes.background.scene) || _bgBody.scene;
        var _bgWhat = _bgBody.mode === 'video' ? 'a looping video' : ('the ' + _bgScene + ' scene');
        return JSON.stringify({ok:true,set:_bgWhat,where:_bgWhere,background:_bgRes.background||null});
      }
      return JSON.stringify({ok:false,reason:(_bgRes && _bgRes.error) || 'background_set_failed'});
    } catch (eBg) { return JSON.stringify({ok:false,reason:eBg.message}); }
  }
  if (name === 'read_lane_board') {
    // ⬡B:core.tool_loop:WIRE:read_lane_board_cross_chat_alignment:20260719⬡ Founder
    // law: every Claude coding chat gets an ACL name and declares its current roadmap on
    // a shared board, because the lanes cannot talk, they coordinate by stamping the
    // brain. This lets A'NU SEE the whole board so when the founder asks what chats are
    // working on her build she actually knows. Cold code only fetches the rows the organ
    // asked for; the organ decides when to call and how to speak it.
    try {
      var _boundLaneHam = String(hamUid || '').toUpperCase();
      if (!_boundLaneHam) return JSON.stringify({ ok:false, reason:'ham_uid_required' });
      var _lbUrl = _bu().replace(/\/+$/, '') + '/rest/v1/' + _tbl()
        + '?ham_uid=eq.' + encodeURIComponent(_boundLaneHam)
        + '&stamp_type=eq.LANE_CLAIM&source=ilike.lane.registry.*'
        + '&select=source,summary,created_at&order=created_at.desc&limit=30';
      var _lbRes = await fetch(_lbUrl, { headers: {
        apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema()
      }, signal: (runtime && runtime.abortSignal) }).then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; });
      // ⬡B:core.tool_loop:FIX:lane_board_returns_readable_prose_not_raw_json:20260719⬡
      // Founder caught her dumping the raw JSON blob at him. The tool now returns a
      // clean human-readable summary so even a light grounding pass speaks it as prose,
      // one line per lane: its ACL name and a short of what it is doing. No JSON shape
      // for the model to parrot.
      var _seenLane = {}, _lines = [];
      (Array.isArray(_lbRes) ? _lbRes : []).forEach(function (row) {
        if (_seenLane[row.source]) return;
        _seenLane[row.source] = true;
        var _nm = String(row.source || '').replace('lane.registry.', '');
        var _doing = String(row.summary || '').replace(/\s+/g, ' ').trim();
        // pull the roadmap/lane phrase if present, else a short summary
        var _cut = _doing.split(/CURRENT ROADMAP\/LANE:|CURRENT TRACK:|LANE:|doing:|-- /i);
        var _short = (_cut.length > 1 ? _cut[1] : _doing).trim().slice(0, 140);
        _lines.push(_nm + ': ' + _short);
      });
      if (!_lines.length) return 'The lane board has no registered lanes right now.';
      return 'There are ' + _lines.length + ' active build lanes on the board right now:\n- ' + _lines.join('\n- ');
    } catch (e) { return JSON.stringify({ ok:false, reason:'lane_board_error', detail:e.message }); }
  }
  if (name === 'nash_sports') {
    // ⬡B:tool.loop:WIRE:nash_is_now_a_wonder:20260711⬡ detection+deliberation+dedup,
    // not raw scoreboard. Surfaces scores AND news (Kuminga), reasons over only
    // what is NEW to this HAM, remembers what it already told him.
    try {
      const { nashWonder } = require('./wonders/nash.wonder.js');
      const lg = String((args && args.league) || 'nba').toLowerCase();
      const w = await nashWonder(hamUid, origMessage, lg);
      if (w && w.ok && w.answer) return w.answer;
      return 'NASH: nothing surfaced right now.';
    } catch (e) { return 'NASH: failed -- ' + e.message; }
  }
  if (name === 'find_identity_evidence') {
    var boundIdentityHam = String(hamUid || '').toUpperCase();
    var requestedIdentityHam = String(args && args.ham_uid || boundIdentityHam).toUpperCase();
    if (!boundIdentityHam) return JSON.stringify({ ok:false, available:false,
      reason:'ham_uid_required' });
    if (requestedIdentityHam !== boundIdentityHam) {
      return JSON.stringify({ ok:false, available:false, reason:'ham_uid_mismatch',
        bound_ham_uid:boundIdentityHam });
    }
    return JSON.stringify(await findIdentityEvidence(boundIdentityHam,
      args.question || origMessage));
  }
  if (name === 'find_in_brain') {
    var q={limit:args.limit||10};
    if (args.stamp_type) q.stamp_type=args.stamp_type;
    if (args.source_prefix) q.source_prefix=args.source_prefix;
    if (args.agent_global) q.agent_global=args.agent_global;
    if (args.order) q.order=args.order;
    var _boundFindHam = String(hamUid || '').toUpperCase();
    var _requestedFindHam = String(args.ham_uid || _boundFindHam).toUpperCase();
    var _unknownInboxRead = !(runtime && runtime.exactHamReads === true) &&
      String(args.stamp_type || '').toUpperCase() ===
      'UNRESOLVED_INBOUND' && _requestedFindHam === 'UNKNOWN';
    if (!_boundFindHam) return JSON.stringify({ok:false,reason:'ham_uid_required'});
    if (_requestedFindHam !== _boundFindHam && !_unknownInboxRead) {
      return JSON.stringify({ok:false,reason:'ham_uid_mismatch',
        bound_ham_uid:_boundFindHam});
    }
    q.ham_uid=_unknownInboxRead ? 'unknown' : _boundFindHam;
    var res=await find([q]);
    // ⬡B:core.tool_loop:FIX:model_reliability_not_the_query_mechanics:20260708⬡
    // Real, live incident, confirmed by direct testing: the underlying query
    // is correct -- stamp_type=ALERT with the real ham_uid genuinely returns
    // real rows, tested directly against the live brain. The gap was never
    // the code; it was the model not reliably picking ALERT from a list of
    // six documented stamp_types on a single guess, even with the mapping
    // added. Rather than add a seventh line of instruction and hope the
    // eighth attempt sticks, a real, mechanical fallback: if the model's own
    // choice comes back empty, and it did not already try ALERT, try ALERT
    // once before giving up. Deterministic, not another prompt bet.
    if (res.beads.length===0 && q.stamp_type!=='ALERT') {
      var fallback=await find([{stamp_type:'ALERT',ham_uid:q.ham_uid,limit:q.limit,order:q.order}]);
      if (fallback.beads.length>0) { res=fallback; }
    }
    // ⬡B:core.tool_loop:FIX:wondergames_mechanical_fallback_20260714⬡
    // Same doctrine as the ALERT fallback above (reliability is mechanism, never
    // phrasing): the founder caught A'NU unable to answer 'what is Wonder Games /
    // the coding cook-off' even after the MEMORY_BANK cold-load and a description mapping
    // were both added -- because the model's OWN find_in_brain call (with whatever
    // stamp_type it guessed) came back empty, and that live empty tool result
    // overrode the passive system-prompt context. Mechanical, deterministic fix:
    // if the model's own query came back empty AND the original question text
    // (carried on args._question by the caller, or reconstructed from message)
    // smells like Wonder Games/cook-off, force a real WONDER_GAMES query before
    // giving up.
    if (res.beads.length===0) {
      var _wgAsk = /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/i.test(String(origMessage||''));
      if (_wgAsk && q.stamp_type!=='WONDER_GAMES') {
        var wgFallback=await find([
          {stamp_type:'WONDER_GAMES',ham_uid:q.ham_uid,limit:q.limit||5},
          {stamp_type:'DOCTRINE',ham_uid:q.ham_uid,importance_gte:8,limit:3}
        ]);
        if (wgFallback.beads.length>0) { res=wgFallback; }
      }
    }
    // ⬡B:core.tool_loop:FIX:general_keyword_fallback_finds_plainly_stored_facts_20260718⬡
    // Founder-caught live and A'NU agreed through the cycle door (WRIT: she
    // said "Exact match stays the gatekeeper, the ilike fallback only kicks in
    // when exact comes back empty, ship it"). The bug: find_in_brain is
    // exact-match only (stamp_type/source/agent_global), so a plain question
    // like "what team do I love" makes the model guess a field, and when it
    // guesses wrong the answer is empty even though the fact is plainly stored
    // (the Lakers fact sat in three LOGFUL beads while she said she had
    // nothing). The ALERT and WONDER_GAMES fallbacks above are one-off patches
    // of this same class; this is the general net. When every exact attempt is
    // empty, run ONE ham-scoped ilike on summary against the question's key
    // nouns. Cold code, no model, ham-bound, capped and time-bounded so the
    // sub-100ms design intent holds for the common (exact-hit) path.
    if (res.beads.length===0) {
      var _kwStop = {the:1,and:1,for:1,you:1,your:1,what:1,whats:1,who:1,whos:1,does:1,did:1,is:1,are:1,was:1,were:1,my:1,me:1,do:1,i:1,a:1,an:1,of:1,to:1,in:1,on:1,about:1,tell:1,show:1,any:1,have:1,has:1,love:1,like:1,favorite:1};
      var _kw = String(origMessage||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
        .filter(function(w){return w.length>=3 && !_kwStop[w];});
      // longest words first: the most distinctive noun is the best single probe
      _kw.sort(function(a,b){return b.length-a.length;});
      _kw = _kw.slice(0,4);
      for (var _ki=0; _ki<_kw.length && res.beads.length===0; _ki++) {
        try {
          var _kwUrl = _bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + encodeURIComponent(q.ham_uid)
            + '&summary=ilike.*' + encodeURIComponent(_kw[_ki]) + '*'
            + '&select=id,stamp_type,source,summary,content,created_at&order=created_at.desc&limit=12';
          var _kwRows = await fetch(_kwUrl, {headers:{apikey:_bk(),Authorization:'Bearer '+_bk(),'Accept-Profile':_schema()},
            signal: runtime && runtime.abortSignal}).then(function(x){return x.json();}).catch(function(){return [];});
          if (Array.isArray(_kwRows) && _kwRows.length) {
            res = { beads:_kwRows, count:_kwRows.length, ham_uid:q.ham_uid, keyword_fallback:_kw[_ki] };
          }
        } catch (_kwe) {}
      }
    }

    var _fusionLine = '';
    try { _fusionLine = await require('./context.fusion.js').getLatestSummary(hamUid); } catch (eFu) {}
    // ⬡B:core.tool_loop:FIX:fusion_leads_the_result_screenless_20260710⬡ Screenless
    // grounding measured at 2/3: the fusion was PRESENT in the result but buried after
    // the bead array, so the model sometimes led with an old bead instead. Mechanism,
    // not phrasing: when fusion exists it becomes the FIRST key and is labeled as the
    // answer to lead with for day/schedule/lane questions. Bead history follows. This
    // is object-key ordering the model reads top-down, not a new instruction to hope on.
    var _result = {};
    if (_fusionLine) {
      _result.answer_this_first_for_day_or_schedule = _fusionLine.trim();
    }
    // ⬡B:core.tool_loop:FIX:no_recency_on_find_results_stale_reported_as_live_20260713⬡
    // Founder-caught live, twice in one reply: asked a coding question, got
    // back two confident "this is happening right now" claims (a recap loop
    // "firing every few seconds", an agent "scaffolding without live file
    // context") that were both stale -- one resolved a week earlier, one
    // resolved over two weeks earlier, each confirmed by its own real
    // timestamp. Root cause, found by reading this exact mapping: the tool
    // result handed the model stamp_type, summary, and up to 200 chars of
    // content -- and NOTHING else. No created_at ever reached the model. It
    // could not have known these were old even if it tried; the information
    // needed to tell "happening now" from "happened three weeks ago and got
    // fixed" was stripped before it ever saw the result. Not a phrasing
    // problem, a missing-field problem, same class of bug as the BCW
    // truncation fix earlier this session: the data the model needed was
    // simply never in front of it. Fix follows the exact decay-language
    // pattern already proven in context.fusion.js (age computed in minutes,
    // honest "X ago" language, explicit instruction not to assert without
    // it) rather than inventing a new convention.
    var _now = Date.now();
    // ⬡B:core.tool_loop:FIX:hard_filter_stale_day_beads_20260714⬡ 911, repeated
    // pattern: the recency-decay tagging below ("stamped: 22 days ago") already
    // existed and the model STILL presented a 22-day-old, Monday-only ALERT
    // ("Mediators Monday: 2:30 Mark Gerzon") as today's (a Tuesday) real meeting --
    // proof that attaching honest text is not enough when the model chooses to
    // override it. This is a hard, mechanical filter, not another instruction: for a
    // day/schedule/meeting-shaped question, any ALERT/BRIEF bead older than 48 hours,
    // OR one that names a specific weekday that is not today, is stripped from the
    // result before the model ever sees it -- it cannot present what it cannot read.
    var _dayQMsg = /\b(today|schedule|calendar|meeting|meetings|free|busy|agenda|going on today|day today|tomorrow)\b/i.test(String(origMessage||''));
    if (_dayQMsg) {
      var _todayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
      res.beads = res.beads.filter(function (b) {
        var isDayFlavored = /^(ALERT|BRIEF)$/.test(b.stamp_type || '');
        if (!isDayFlavored) return true; // only guard the day-shaped stamp types
        var ageH = b.created_at ? (_now - Date.parse(b.created_at)) / 3600000 : 999999;
        if (ageH > 48) return false; // too old to be today's real schedule
        var mentionsOtherWeekday = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(b.summary || '')
          && !new RegExp('\\b' + _todayName + '\\b', 'i').test(b.summary || '');
        if (mentionsOtherWeekday) return false; // named a day that is not today
        return true;
      });
    }
    _result.beads = res.beads.slice(0,8).map(function(b){
      var ageMin = b.created_at ? Math.round((_now - Date.parse(b.created_at)) / 60000) : null;
      var ageLabel = ageMin == null ? 'age unknown' :
        ageMin < 60 ? (ageMin + ' minutes ago') :
        ageMin < 1440 ? (Math.round(ageMin/60) + ' hours ago') :
        (Math.round(ageMin/1440) + ' days ago');
      // \u2b21B:core.tool_loop:FIX:non_string_bead_content_cannot_crash_the_cycle:20260717\u2b21
      // Live 911: a bead with jsonb content made (b.content||'').slice throw and the
      // whole turn died as pai_cycle_threw. Evidence readers coerce, never crash.
      var _bc = b.content;
      if (_bc != null && typeof _bc !== 'string') { try { _bc = JSON.stringify(_bc); } catch (eBc) { _bc = String(_bc); } }
      return {stamp_type:b.stamp_type,summary:b.summary,content:(_bc||'').slice(0,200),stamped:ageLabel};
    });
    _result.recency_instruction = 'Every result above carries "stamped: X ago", real elapsed time, not a guess. Before stating anything as a CURRENT problem, loop, or status, check its age. Anything more than a few hours old may already be resolved -- state it as history ("as of N ago, X was happening") not as present-tense fact ("X is happening right now"), unless you have separately confirmed it is still true today.';
    _result.ms = res.ms;
    return JSON.stringify(_result);
  }
  if (name === 'write_to_brain') {
    var BU=process.env.AIBE_BRAIN_URL,BK=process.env.AIBE_BRAIN_KEY;
    if (!_bu() || !_bk()) return JSON.stringify({ok:false});
    var bead={ham_uid:args.ham_uid||hamUid,agent_global:'PAI',stamp_type:args.stamp_type||'RESULT',
      source:'pai.tool.write.'+(args.ham_uid||hamUid)+'.'+Date.now(),
      acl_stamp:'\u2b21B:pai.tool:RESULT:tool_write:20260630\u2b21',
      summary:args.summary,content:args.content,importance:args.importance||7};
    try {
      var brainWriteCancelled = await cancelBeforeEffect(name, runtime);
      if (brainWriteCancelled) return brainWriteCancelled;
      var beadWrite = await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey: _bk(),Authorization:'Bearer ' + _bk(),'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify(bead), signal:runtime && runtime.abortSignal});
      var beadRows = beadWrite.ok ? await beadWrite.json().catch(function(){return null;}) : null;
      if (!beadWrite.ok || !Array.isArray(beadRows) || !beadRows[0] ||
          beadRows[0].source !== bead.source) {
        return JSON.stringify({ok:false,reason:'brain_write_unverified'});
      }
      return JSON.stringify({ok:true,id:beadRows[0].id,source:bead.source});
    }catch(e){return JSON.stringify({ok:false,error:e.message});}
  }
  if (name === 'get_budget_upcoming') {
    var buHam = args.ham_uid || hamUid;
    var up = await ledger.getUpcoming(buHam, args.days || 45);
    return JSON.stringify(up);
  }
  if (name === 'get_budget_summary') {
    var bsHam = args.ham_uid || hamUid;
    var sum = await ledger.getCycleSummary(bsHam, args.cycle_start, args.cycle_end);
    // ⬡B:core.tool.loop:FIX:budget_empty_is_honest_not_a_hold:20260719⬡ Founder audit: budget
    // held every time because there is NO real budget data for him (all zeros), so she had
    // nothing true to say and either fabricated (SHADOW caught it) or held. Signal empty
    // clearly so she plainly says no budget is set up, instead of holding on nothing.
    if (sum && (sum.transactionCount||0)===0 && (sum.totalIncome||0)===0 && (sum.totalExpenses||0)===0
        && !(sum.projectedBills||[]).length && !(sum.projectedIncome||[]).length) {
      return JSON.stringify({ ok:true, empty:true, note:'No budget is set up yet for this person -- no income, expenses, or transactions on record. Say plainly that their budget is not set up yet; do not invent any numbers.' });
    }
    return JSON.stringify(sum);
  }
  if (name === 'get_pending_drafts') {
    // \u2b21B:core.tool.loop:FIX:mediators_drafts_hallucinated_denial:20260708\u2b21
    // Real, live incident: "send me the mediator ones" got "I do not have
    // any information about the Mediators Foundation" back. Root cause,
    // confirmed by directly running find_in_brain's own default query: real
    // Mediators DRAFT_PENDING beads exist, correctly, under the founder's
    // own ham_uid, but the general search tool defaults to the 10 most
    // recent beads with no org filter, and under real traffic volume
    // (advisor cycles, reconciliation, CYCLE_STEP) that recency window
    // rarely still contains them. This is a deterministic, org-scoped
    // query instead of hoping recency happens to line up.
    var BUd=process.env.AIBE_BRAIN_URL, BKd=process.env.AIBE_BRAIN_KEY;
    if (!BUd||!BKd) return JSON.stringify({ok:false,reason:'no_brain'});
    var orgMap={bdif:'BDIF_ADVISOR',mediators:'MEDIATORS_ADVISOR',gmg:'GMG_ADVISOR',mh_action:'MH_ACTION_ADVISOR'};
    var agentGlobal=orgMap[String(args.org||'').toLowerCase()];
    if (!agentGlobal) return JSON.stringify({ok:false,reason:'unknown_org',knownOrgs:Object.keys(orgMap)});
    try {
      var dHam = args.ham_uid || hamUid;
      var draftRows=await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.'+dHam+'&agent_global=eq.'+agentGlobal+'&stamp_type=eq.DRAFT_PENDING&order=created_at.desc&limit=1&select=summary,content,created_at',{headers:{apikey:BKd,Authorization:'Bearer '+BKd,'Accept-Profile':_schema()}}).then(function(x){return x.json();}).catch(function(){return [];});
      if (!draftRows||!draftRows.length) return JSON.stringify({ok:true,found:false,org:args.org,message:'No pending drafts on file for '+args.org+' right now.'});
      var latest=draftRows[0];
      var c=latest.content; try{c=JSON.parse(c);}catch(e){c={};}
      return JSON.stringify({ok:true,found:true,org:args.org,summary:latest.summary,threads:c.threads_needing_reply||[],draftText:(c.output||'').slice(0,1500),asOf:latest.created_at});
    } catch(eGpd){ return JSON.stringify({ok:false,error:eGpd.message}); }
  }
  if (name === 'request_new_capability') {
    // \u2b21B:core.tool.loop:BUILD:conversational_agent_birth:20260707\u2b21
    // span.task.conversational_agent_birth. Founder's own words: ask her for
    // something, if she has enough real experience to build it she starts
    // building, if not she asks for what's missing. "Enough" here is a real,
    // checkable signal, not a guess: real related beads already in the
    // brain about this HAM. Below threshold, she names what's missing
    // instead of guessing or refusing outright.
    var BUc=_bu(), BKc=_bk();
    var cHam = args.ham_uid || hamUid;
    var desc = String(args.capability_description||'').slice(0,200);
    if (!BUc||!BKc) return JSON.stringify({ok:false,built:false,reason:'no_brain'});
    var keywords = desc.split(/\s+/).filter(function(w){return w.length>3;}).slice(0,4);
    var relatedCount = 0;
    try {
      for (var kwi=0;kwi<keywords.length;kwi++){
        var kwRes = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.'+cHam+'&summary=ilike.*'+encodeURIComponent(keywords[kwi])+'*&select=id&limit=5',{headers:{apikey:BKc,Authorization:'Bearer '+BKc,'Accept-Profile':_schema()},signal:runtime&&runtime.abortSignal}).then(function(x){return x.json();}).catch(function(){return [];});
        relatedCount += (Array.isArray(kwRes)?kwRes.length:0);
        var capabilityReadCancelled = await cancelBeforeEffect(name, runtime);
        if (capabilityReadCancelled) return capabilityReadCancelled;
      }
    } catch(eReq){}
    if (relatedCount >= 5) {
      // \u2b21B:core.tool.loop:WIRE:spawnGuard_on_agent_birth:20260708\u2b21
      // core/spawnGuard.js was built 20260702, real, correct logic, never
      // called by anything -- confirmed orphan during the overnight wiring
      // pass. This is exactly the spawn point it exists for: a brand new
      // task being born from a conversation, not from a human's direct
      // command. Real lineage and a real budget on every one from now on.
      var spawnGuard = require('../core/spawnGuard.js');
      var taskName = 'span.task.agent_birth_'+cHam.toLowerCase()+'_'+Date.now();
      var lineage = { spawner: 'request_new_capability',
        parent: runtime && runtime.parentCycleId || 'unknown' };
      var budget = { maxIterations: 20, maxLlmCalls: 10 };
      try { spawnGuard.validateTask({ lineage: lineage, budget: budget }); } catch (eGuard) { return JSON.stringify({ok:false,built:false,reason:'spawn_guard_rejected',error:eGuard.message}); }
      var capabilityWriteCancelled = await cancelBeforeEffect(name, runtime);
      if (capabilityWriteCancelled) return capabilityWriteCancelled;
      var taskWrite = await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey:BKc,Authorization:'Bearer '+BKc,'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify({ham_uid:cHam,agent_global:'PAI',stamp_type:'TASK',
          source:taskName,
          acl_stamp:'\u2b21B:pai.agentbirth:TASK:proposed:'+ymd()+'\u2b21',
          summary:'[FOR PAI -- agent birth, '+relatedCount+' related real beads found] '+desc,
          content:JSON.stringify({requestedBy:cHam,description:desc,relatedBeadCount:relatedCount,lineage:lineage,budget:budget}),
          importance:6}), signal:runtime && runtime.abortSignal});
      var taskRows = taskWrite.ok ? await taskWrite.json().catch(function(){return null;}) : null;
      if (!taskWrite.ok || !Array.isArray(taskRows) || !taskRows[0] ||
          taskRows[0].source !== taskName) {
        return JSON.stringify({ok:false,built:false,reason:'capability_task_write_unverified'});
      }
      return JSON.stringify({ok:true,built:true,relatedBeadCount:relatedCount,message:'Enough real history exists ('+relatedCount+' related things already known). Filed to build this for real.'});
    } else {
      return JSON.stringify({ok:true,built:false,relatedBeadCount:relatedCount,
        message:'Not enough real history yet ('+relatedCount+' related things found, need at least 5) to build this well. Talk through it more, or feed a transcript about it, and ask again.'});
    }
  }
  if (name === 'create_reminder') {
    // \u2b21B:core.tool.loop:BUILD:reminder_feature:20260707\u2b21
    // span.task.reminder_feature_command_center. Real reminder, not a stamp
    // pretending to be one. EANEW's own 3-min cycle (already real, already
    // running) checks REMINDER beads for due ones and fires them for real
    // through POST /reach/out, the same real compose-and-send path already
    // wired for her to reach Brandon on her own.
    var BUr=_bu(), BKr=_bk();
    if (!BUr||!BKr) return JSON.stringify({ok:false,reason:'no_brain'});
    var rHam = args.ham_uid || hamUid;
    // \u2b21B:core.tool.loop:FIX:reminder_hallucinated_past_date:20260711\u2b21
    // Real, live incident: asked to be reminded of something with no date
    // given at all, the model invented one anyway -- 2024, a past year it
    // was never even running in. Because the fire-check is just due_at<=now,
    // an invented past date fires almost instantly instead of failing loud.
    // Real guard now: no due_at, unparseable, or in the past all snap to a
    // sensible default (9am the next real day) instead of trusting whatever
    // the model produced. Never silently accept a past due date again.
    var dueAt = args.due_at;
    var parsedDue = dueAt ? new Date(dueAt) : null;
    var isValidFuture = parsedDue && !isNaN(parsedDue.getTime()) && parsedDue.getTime() > Date.now();
    if (!isValidFuture) {
      var fallback = new Date();
      fallback.setDate(fallback.getDate() + 1);
      fallback.setHours(9, 0, 0, 0);
      dueAt = fallback.toISOString();
    }
    // ⬡B:core.tool.loop:FIX:reminder_dedup_no_recreate_loop:20260711⬡
    // The kill-switch incident (03:46): a fired reminder's DELIVERY was being re-read
    // as a fresh create_reminder every cycle, recreating the same reminder and refiring
    // it in a loop. Guard: before creating, look for an existing UNFIRED reminder with
    // the same text for this ham. If one exists, do not duplicate. This breaks the loop
    // at the tool itself, no matter how the delivery prompt is phrased.
    try {
      var _rt = String(args.text || '').trim().toLowerCase().slice(0, 100);
      if (_rt) {
        var _dq = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.REMINDER&ham_uid=eq.' + encodeURIComponent(rHam)
          + '&summary=ilike.' + encodeURIComponent('%' + _rt.slice(0, 40) + '%') + '&order=created_at.desc&limit=15',
          { headers: { apikey: BKr, Authorization: 'Bearer ' + BKr, 'Accept-Profile': _schema() },
            signal:runtime && runtime.abortSignal });
        if (!_dq.ok) return JSON.stringify({ok:false,reason:'reminder_dedup_unverified'});
        var _ex = await _dq.json();
        var reminderReadCancelled = await cancelBeforeEffect(name, runtime);
        if (reminderReadCancelled) return reminderReadCancelled;
        var _dup = (Array.isArray(_ex) ? _ex : []).find(function (b) {
          try { var c = JSON.parse(b.content || '{}'); return !c.fired && String(c.text || '').trim().toLowerCase().slice(0, 100) === _rt; } catch (e) { return false; }
        });
        if (_dup) {
          return JSON.stringify({ ok: true, duplicate: true, text: args.text, note: 'a reminder with this text is already pending; not creating a duplicate' });
        }
      }
    } catch (eDup) { return JSON.stringify({ok:false,reason:'reminder_dedup_unverified'}); }
    try {
      var reminderSource = 'pai.reminder.'+rHam+'.'+Date.now();
      var reminderWriteCancelled = await cancelBeforeEffect(name, runtime);
      if (reminderWriteCancelled) return reminderWriteCancelled;
      var reminderWrite = await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
        headers:{apikey:BKr,Authorization:'Bearer '+BKr,'Accept-Profile':_schema(),
          'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify({ham_uid:rHam,agent_global:'PAI',stamp_type:'REMINDER',
          source:reminderSource,
          acl_stamp:'\u2b21B:pai.reminder:REMINDER:created:'+ymd()+'\u2b21',
          summary:'[REMINDER] '+String(args.text||'').slice(0,100),
          content:JSON.stringify({text:args.text,due_at:dueAt,fired:false,defaultedDate:!isValidFuture,createdAt:new Date().toISOString()}),
          importance:6}), signal:runtime && runtime.abortSignal});
      var reminderRows = reminderWrite.ok
        ? await reminderWrite.json().catch(function(){return null;}) : null;
      if (!reminderWrite.ok || !Array.isArray(reminderRows) || !reminderRows[0] ||
          reminderRows[0].source !== reminderSource) {
        return JSON.stringify({ok:false,reason:'reminder_write_unverified'});
      }
      return JSON.stringify({ok:true,text:args.text,due_at:dueAt,note:isValidFuture?undefined:'no real date was given, defaulted to tomorrow 9am'});
    } catch(e){return JSON.stringify({ok:false,error:e.message});}
  }
  if (name === 'consult_advisor') {
    // ⬡B:core.tool.loop:WIRE:consult_advisor_cycle_tool:20260713⬡
    // Wonder rehaul G2: the advisor system (advisor-router + station modules with a real
    // runCycle) already existed, but the cycle could never invoke it, so "talk to my
    // advisors" had no tool and went silent (half the haircut failure). This wires the
    // existing router as a real cycle tool. Per-HAM roster via discoverStations (no
    // hardcode); an advisor that is not real for this HAM returns a clean, honest miss
    // with the actual available list, never a fabricated brief.
    try {
      var _ar = require('../advisors/advisor-router.js');
      var _station = String(args.advisor||'').toLowerCase().replace(/[^a-z_]/g,'');
      var _cHam = args.ham_uid || hamUid;
      if (!_station || !_cHam) return JSON.stringify({ok:false,reason:'need advisor and ham_uid'});
      var _worlds = await _ar.discoverStations(_cHam);
      if (_worlds.indexOf(_station) === -1) return JSON.stringify({ok:false,reason:'no_such_advisor',advisor:_station,available:_worlds});
      var _mod = _ar.loadStationModule(_station);
      if (!_mod || typeof _mod.runCycle !== 'function') return JSON.stringify({ok:false,reason:'advisor_has_no_cycle',advisor:_station});
      var _q = String(args.question||'').slice(0,2000);
      var _res = await _mod.runCycle(_q, _cHam, _q);
      var _brief = _res && (_res.answer || _res.output || _res.summary || _res.brief);
      if (!_brief) return JSON.stringify({ok:false,reason:'advisor_returned_empty',advisor:_station});
      return JSON.stringify({ok:true,advisor:_station,brief:String(_brief).slice(0,4000)});
    } catch(eCons){ return JSON.stringify({ok:false,error:eCons.message}); }
  }
  if (name === 'weather_check') {
    // ⬡B:core.tool.loop:BUILD:weather_is_a_general_capability_not_an_orphan:20260718⬡
    // Founder caught that weather was wired only into the arrival, orphaned. Weather is
    // one instance of the real principle: she reaches a real capability whenever it helps,
    // in ANY turn, not one hardcoded path. Same keyless /os/weather source the arrival uses.
    try {
      var _wxSelf = process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      var _place = String((args && args.place) || '').trim();
      if (!_place) return JSON.stringify({ ok:false, error:'no place given' });
      var _wr = await fetch(_wxSelf + '/os/weather?place=' + encodeURIComponent(_place))
        .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
      if (_wr && _wr.ok === false && _wr.reason === 'place_not_found' &&
          _place.indexOf(',') !== -1) {
        var _shortPlace = _place.split(',')[0].trim();
        _wr = await fetch(_wxSelf + '/os/weather?place=' + encodeURIComponent(_shortPlace))
          .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
      }
      if (!_wr) return JSON.stringify({ ok:false, error:'weather source unreachable, do not guess' });
      return JSON.stringify(_wr);
    } catch (eWx) { return JSON.stringify({ ok:false, error:eWx.message }); }
  }
  if (name === 'email_send') {
    // ⬡B:core.tool.loop:BUILD:she_can_actually_send_email:20260719⬡ Founder audit: she could
    // read and draft but never SEND, and could not reach a new person. This anchors to A'NU:
    // she calls it through the one cycle, it hits the founder-gated /os/email/send, and it
    // only sends when authorized is true (she sets that only when he explicitly said send).
    // Never an auto-send to a real human. reply_to_message_id threads the reply.
    try {
      var _esSelf = process.env.OS_API_BASE || process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      var _esUid = String((args && args.ham_uid) || hamUid || '');
      var _esBody = {
        grant: (args && args.grant) || '', body: (args && args.body) || '',
        subject: (args && args.subject) || '', to: (args && args.to) || undefined,
        reply_to_message_id: (args && args.reply_to_message_id) || '',
        authorized: (args && args.authorized) === true
      };
      var _esr = await fetch(_esSelf + '/os/email/send/' + encodeURIComponent(_esUid), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_esBody)
      }).then(function(r){ return r.json(); }).catch(function(){ return null; });
      if (!_esr) return JSON.stringify({ ok:false, error:'send endpoint unreachable' });
      return JSON.stringify(_esr);
    } catch (eEs) { return JSON.stringify({ ok:false, error:eEs.message }); }
  }
  if (name === 'read_reminders') {
    // ⬡B:core.tool.loop:BUILD:she_can_read_reminders_not_just_create:20260719⬡ Founder audit
    // caught it: she had create_reminder but NO read tool, so "what reminders do I have"
    // fell through to a slow brain search that timed out. Same class as the missing inbox
    // tool. Fast bounded read of his real REMINDER beads, capped and time-limited so it
    // never hangs. Reads the new bank first, then legacy. Never invents a reminder.
    try {
      var _rUid = String((args && args.ham_uid) || hamUid || '');
      var _rNb = (process.env.MEMORY_BANK_URL || '').replace(/\/$/, '');
      var _rNk = process.env.MEMORY_BANK_KEY || '';
      var _rRows = null;
      if (_rNb && _rNk) {
        var _rq = _rNb + '/rest/v1/' + (process.env.BEAD_TABLE || 'beads')
          + '?select=summary,created_at&ham_uid=eq.' + encodeURIComponent(_rUid)
          + '&stamp_type=eq.REMINDER&order=created_at.desc&limit=8';
        var _rc = new AbortController(); var _rt = setTimeout(function(){ _rc.abort(); }, 6000);
        _rRows = await fetch(_rq, { signal:_rc.signal, headers:{ apikey:_rNk, Authorization:'Bearer '+_rNk, 'Accept-Profile':(process.env.BRAIN_SCHEMA||'memory_bank') } })
          .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
        clearTimeout(_rt);
      }
      var _items = (_rRows || []).map(function(b){ return String(b.summary||'').replace(/^\[?REMINDER[^\]]*\]?\s*[:\-]?\s*/i,'').slice(0,180); }).filter(Boolean);
      return JSON.stringify({ ok:true, count:_items.length, reminders:_items,
        note: _items.length ? 'Real reminders from his brain.' : 'No reminders set right now.' });
    } catch (eRm) { return JSON.stringify({ ok:false, error:eRm.message }); }
  }
  if (name === 'inbox_read') {
    // ⬡B:core.tool.loop:BUILD:she_can_actually_read_email:20260719⬡ Founder caught it live: she
    // said "I don't have an inbox tool that reads your email" because she genuinely had none.
    // She could read calendar, budget, brain, sports, but never her inbox. This is the real
    // fix: a tool that reads his real gated inbox (/os/email, founder-only, dev-noise scrubbed),
    // so she can access, reason about, and surface his email. Never invents a message.
    try {
      var _ibSelf = process.env.OS_API_BASE || process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      var _ibUid = String((args && args.ham_uid) || hamUid || '');
      var _ir = await fetch(_ibSelf + '/os/email/' + encodeURIComponent(_ibUid))
        .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
      if (!_ir) return JSON.stringify({ ok:false, error:'inbox unreachable, do not guess' });
      var _msgs = (_ir.emails || []);
      var _unreadOnly = !(args && args.unread_only === false);
      if (_unreadOnly) _msgs = _msgs.filter(function(m){ return m.unread; });
      _msgs = _msgs.slice(0, 8).map(function(m){
        return { from: String(m.from||'someone').slice(0,80), subject: String(m.subject||'(no subject)').slice(0,140),
          snippet: String(m.snippet||m.preview||'').slice(0,200), unread: !!m.unread, id: m.id||null, grant: m.grant||null };
      });
      return JSON.stringify({ ok:true, count:_msgs.length, messages:_msgs,
        note: _msgs.length ? 'Real inbox. To show on the glass call update_screen with piece email. To draft a reply use the id.' : 'Inbox is clear, nothing unread.' });
    } catch (eIb) { return JSON.stringify({ ok:false, error:eIb.message }); }
  }
  if (name === 'calendar_read') {
    // ⬡B:core.tool.loop:FIX:calendar_read_real_source_20260714⬡ 911: this tool was
    // wired to getRadarEvents, an internal RADAR bead system that is essentially
    // EMPTY for this ham -- founder-caught fabrication traced back to this: forced
    // to call calendar_read, it honestly returned nothing, but a prior version's
    // free-talk covered the gap with an invented meeting. Repointed to the SAME real,
    // EBC-firewall-gated source that already proves his actual day (/os/calendar,
    // founder-gated, Nylas-backed, verified live with his 20 real events). No parallel
    // implementation, no new exposure -- reuses the existing gate.
    try {
      var _calHam = args.ham_uid || hamUid;
      if (!_calHam) return JSON.stringify({ok:false,reason:'no_ham_uid'});
      var _selfBase = process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
      // ⬡B:core.tool.loop:FIX:unreachable_is_not_empty:20260717⬡ Founder-chain root cause:
      // this fetch lands on aibebase, which redeploys constantly; a mid-deploy 502 came
      // back as null and was reported as ok:true events:[] "no calendar events found",
      // stating a network failure as a fact about his day. The draft then named real
      // events off the wall, the evidence swore the day was empty, and SHADOW held the
      // contradiction correctly. She went silent because the wiring lied to the judge.
      // Now: one retry over the deploy window, and a dead source reports itself as
      // unreachable so the answer says "I cannot reach your calendar right now" instead
      // of "your day is open."
      var _cr = null;
      for (var _calTry = 0; _calTry < 2 && !_cr; _calTry++) {
        if (_calTry) await new Promise(function(rs){setTimeout(rs,4000);});
        _cr = await fetch(_selfBase + '/os/calendar/' + _calHam).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});
      }
      if (!_cr) return JSON.stringify({ok:false, ham_uid:_calHam, reason:'calendar_source_unreachable', note:'the calendar source did not respond; this is NOT an empty day, say the calendar cannot be reached right now'});
      var _realEvents = _cr.events || [];
      // ⬡B:core.tool.loop:FIX:cold_code_does_the_date_math:20260717⬡ The source returns
      // epoch milliseconds; handing raw 1784073600000 to a penny model and hoping it does
      // timezone arithmetic is how "your calendar is open today" shipped against 20 real
      // events, and how named-event guesses earned honest SHADOW holds. Cold code now
      // resolves every event to a human date in the HAM's timezone and flags which are
      // TODAY; the model only phrases what is already true.
      var _tz = process.env.HAM_TIMEZONE || 'America/New_York';
      var _fmtDate = new Intl.DateTimeFormat('en-US', { timeZone:_tz, weekday:'long', year:'numeric', month:'long', day:'numeric' });
      var _fmtTime = new Intl.DateTimeFormat('en-US', { timeZone:_tz, hour:'numeric', minute:'2-digit' });
      var _todayStr = _fmtDate.format(new Date());
      // ⬡B:core.tool.loop:FIX:all_day_events_are_floating_dates:20260718⬡ Founder caught
      // this on the glass: Myrtle Beach reported a day early, every single all-day event
      // shifted back one. My own regression from the timezone fix. An all-day event is a
      // FLOATING DATE -- the calendar sends it as midnight UTC and it means that calendar
      // square, not an instant in time. Converting it to Eastern rolls it back to 8pm the
      // PREVIOUS day, so July 15 became July 14 and a kids week starting Monday became
      // Sunday. Timed events are real instants and DO belong in the HAM's timezone. So the
      // rule is per-event, not per-calendar: floating dates read in UTC, instants read local.
      var _fmtDateUTC = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'long', year:'numeric', month:'long', day:'numeric' });
      var _todayUTCStr = _fmtDateUTC.format(new Date(new Date().toLocaleString('en-US', { timeZone:_tz })));
      var _shaped = _realEvents.slice(0,20).map(function(ev){
        var _at = Number(ev.at || ev.start || 0);
        var _d = _at ? new Date(_at) : null;
        var _dateStr = _d ? (ev.allDay ? _fmtDateUTC.format(_d) : _fmtDate.format(_d)) : null;
        var _cmpToday = ev.allDay ? _todayUTCStr : _todayStr;
        return { title: ev.title || ev.summary || '', org: ev.org || '', date: _dateStr,
          time: (_d && !ev.allDay) ? _fmtTime.format(_d) : (ev.allDay ? 'all day' : null),
          is_today: !!(_dateStr && _dateStr === _cmpToday),
          is_past: !!(_dateStr && _d && !(_dateStr === _cmpToday) && _d.getTime() < Date.now() - 86400000),
          location: ev.location || '' };
      });
      var _todayCount = _shaped.filter(function(ev){ return ev.is_today; }).length;
      var _out = {ok:true, ham_uid:_calHam, today_is:_todayStr,
        events_today:_todayCount, events:_shaped,
        note: (_todayCount ? (_todayCount + ' event(s) fall on today, ' + _todayStr + '; every other listed event is another day, never present it as today')
          : (_realEvents.length ? 'events exist in the window but NONE fall on today, ' + _todayStr + '; today itself is open'
            : 'the calendar source answered and genuinely has no events in this window'))
          + ' Every event carries is_today and is_past. NEVER describe an event with is_past true as upcoming or coming up; it already happened. Use each event\'s own date field verbatim and do not compute dates yourself.' };
      return JSON.stringify(_out);
    } catch (eCalReal) { return JSON.stringify({ok:false, reason:'calendar_read_failed: '+eCalReal.message}); }
  }
  if (false && name === 'calendar_read') {
    // ⬡B:core.tool.loop:WIRE:calendar_read_cycle_tool:20260713⬡
    // Wonder rehaul G3 (read): scan the HAM's calendar and find open slots. Reuses the
    // real DST-safe schedule logic (getRadarEvents / computeFreeSlots) -- no parallel
    // implementation, no invented availability. This is the "scan my calendar" half of
    // the haircut ask that went silent. Booking (write) is a separate queued wire.
    try {
      var _sl = require('./schedule/schedule.logic.js');
      var _calHam = args.ham_uid || hamUid;
      if (!_calHam) return JSON.stringify({ok:false,reason:'no_ham_uid'});
      var _want = args.want || 'both';
      var _events = await _sl.getRadarEvents(_calHam);
      var _out = {ok:true, ham_uid:_calHam};
      if (_want === 'events' || _want === 'both') _out.events = (_events||[]).slice(0,25);
      if (_want === 'slots' || _want === 'both') {
        var _prefs = await _sl.getHamPrefs(_calHam);
        if (args.days) _prefs = Object.assign({}, _prefs, {daysAhead: args.days});
        _out.free_slots = _sl.computeFreeSlots(_events||[], _prefs).slice(0,25);
      }
      if ((!_out.events || !_out.events.length) && (!_out.free_slots || !_out.free_slots.length)) {
        _out.note = 'no calendar events found for this HAM yet (calendar may not be synced to RADAR)';
      }
      return JSON.stringify(_out);
    } catch(eCal){ return JSON.stringify({ok:false,error:eCal.message}); }
  }
  if (name === 'find_contact') {
    // ⬡B:core.tool.loop:WIRE:find_contact_cycle_tool:20260713⬡
    // Wonder rehaul G5: gives the contacts resolver (built via the cook-off, glm-5.2's
    // corrected winner) a real reach path. The cycle can now resolve "my brother" to a
    // saved contact. Foundation for third-party reach (G1). Never fabricates: returns
    // not-found honestly when no contact is saved, so a number or email is never invented.
    try {
      var _ct = require('./contacts.js');
      var _ctHam = args.ham_uid || hamUid;
      var _hit = await _ct.resolveContact(_ctHam, args.who||'');
      if (!_hit) return JSON.stringify({ok:true,found:false,who:args.who,note:'no saved contact matches; do not invent a number or email'});
      return JSON.stringify({ok:true,found:true,contact:_hit});
    } catch(eFc){ return JSON.stringify({ok:false,error:eFc.message}); }
  }
  if (name === 'contact_send') {
    // ⬡B:core.tool.loop:WIRE:contact_send_G1_third_party_reach:20260713⬡
    // G1: the last big reach gap -- she can resolve a contact (find_contact) but never
    // touch them. This closes it, honoring the HAM's own standing rule word for word: an
    // outbound send to a real external human needs confirmation UNLESS the HAM already
    // authorized this exact send in his own message. authorized_in_message is the model's
    // own judgment call on that, driven by the tool description; the channel enforces
    // nothing, it only executes what the one cycle decided. A DRAFT is never a SEND: when
    // not authorized, this stamps a PENDING_SEND for review and does not touch Blooio.
    try {
      var _ct2 = require('./contacts.js');
      var _csHam = args.ham_uid || hamUid;
      var _hit2 = await _ct2.resolveContact(_csHam, args.contact_query || '');
      var contactResolveCancelled = await cancelBeforeEffect(name, runtime);
      if (contactResolveCancelled) return contactResolveCancelled;
      if (!_hit2 || typeof _hit2 !== 'object') return JSON.stringify({ ok: true, sent: false, reason: 'no_saved_contact', note: 'do not invent a number or email' });
      if (!_hit2.phone) return JSON.stringify({ ok: true, sent: false, reason: 'contact_has_no_phone', contact: _hit2 });
      var _bu3 = _bu();
      var _bk3 = _bk();
      if (!_bu3 || !_bk3) return JSON.stringify({ok:false,reason:'no_brain'});
      var _wh3 = { apikey: _bk3, Authorization: 'Bearer ' + _bk3,
        'Accept-Profile':_schema(), 'Content-Profile':_schema(),
        'Content-Type': 'application/json', Prefer: 'return=representation' };
      var _ymd3 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      if (args.authorized_in_message === true) {
        var _sendCouncil = runtime && runtime.councilResult;
        var _exactContactMessage = String(args.message || '').slice(0, 1500);
        var _resolvedAtCouncil = canonicalizeDeliveryTarget({ kind:'phone',
          value:args._resolved_contact_phone || '' });
        var _resolvedAtCommit = canonicalizeDeliveryTarget({ kind:'phone', value:_hit2.phone });
        if (!_resolvedAtCouncil || !_resolvedAtCommit ||
            JSON.stringify(_resolvedAtCouncil) !== JSON.stringify(_resolvedAtCommit)) {
          return JSON.stringify({ok:false,sent:false,reason:'contact_target_changed_after_council'});
        }
        var _sendVerified = requireVerifiedCouncilDelivery(_sendCouncil,
          { kind:'phone', value:_hit2.phone }, _exactContactMessage);
        var _sendProof = _sendVerified && _sendVerified.ok ? compactCouncilProof(_sendCouncil) : null;
        if (!_sendVerified || !_sendVerified.ok || !_sendProof || _sendProof.committed !== true) {
          return JSON.stringify({ok:false,sent:false,reason:'contact_send_council_result_required'});
        }
        var _tap = require('./wren/reply.js').tapSend;
        var contactSendCancelled = await cancelBeforeEffect(name, runtime);
        if (contactSendCancelled) return contactSendCancelled;
        var contactCancellation = effectCancellation(runtime);
        var _sendRes = await _tap(_hit2.phone, _exactContactMessage, _csHam, _sendCouncil,
          contactCancellation || {});
        if (!_sendRes || _sendRes.ok !== true) {
          return JSON.stringify({ok:false,sent:false,
            reason:_sendRes&&_sendRes.reason || 'contact_provider_unverified'});
        }
        try { await fetch(_bu3 + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh3, body: JSON.stringify({
          ham_uid: String(_csHam).toUpperCase(), agent_global: 'A\u2019NU', stamp_type: 'OUTBOUND_THIRD_PARTY',
          acl_stamp: '\u2b21B:core.tool.loop:OUTBOUND_THIRD_PARTY:sent:' + _ymd3 + '\u2b21',
          source: 'contact.send.' + Date.now(), summary: '[SENT to ' + (_hit2.name || 'contact') + '] ' + String(args.message || '').slice(0, 100),
          content: JSON.stringify({ contact: _hit2.name, phone: _hit2.phone, message: args.message, result: _sendRes }), importance: 6
        }) }); } catch (eStamp) {}
        return JSON.stringify({ ok: true, sent: true, to: _hit2.name, result: _sendRes });
      }
      // NOT authorized in-message: draft only, never send. Hard pause per doctrine.
      try {
        var _draftSource = 'contact.draft.' + Date.now();
        var contactDraftCancelled = await cancelBeforeEffect(name, runtime);
        if (contactDraftCancelled) return contactDraftCancelled;
        var _draftWrite = await fetch(_bu3 + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh3, body: JSON.stringify({
        ham_uid: String(_csHam).toUpperCase(), agent_global: 'A\u2019NU', stamp_type: 'PENDING_SEND',
        acl_stamp: '\u2b21B:core.tool.loop:PENDING_SEND:drafted:' + _ymd3 + '\u2b21',
        source: _draftSource, summary: '[DRAFT for ' + (_hit2.name || 'contact') + ', AWAITING CONFIRM] ' + String(args.message || '').slice(0, 100),
        content: JSON.stringify({ contact: _hit2.name, phone: _hit2.phone, message: args.message }), importance: 6
        }), signal:runtime && runtime.abortSignal });
        var _draftRows = _draftWrite.ok
          ? await _draftWrite.json().catch(function(){return null;}) : null;
        if (!_draftWrite.ok || !Array.isArray(_draftRows) || !_draftRows[0] ||
            _draftRows[0].source !== _draftSource) {
          return JSON.stringify({ok:false,sent:false,reason:'contact_draft_write_unverified'});
        }
      } catch (eStamp2) {
        return JSON.stringify({ok:false,sent:false,reason:'contact_draft_write_unverified'});
      }
      return JSON.stringify({ ok: true, sent: false, drafted: true, to: _hit2.name, note: 'not sent -- the HAM did not explicitly authorize this exact send; confirm before sending' });
    } catch (eCs) { return JSON.stringify({ ok: false, error: eCs.message }); }
  }
  if (name === 'stop_mentioning') {
    // ⬡B:core.tool.loop:WIRE:stop_mentioning_cycle_tool:20260713⬡
    // Founder 911: "I told u yesterday to stop." There was no way for the cycle to honor a
    // stop, so a stale nudge kept firing. Now it can: this records a suppression so the
    // reminder-weave never surfaces that topic again. Closes the "I told you to stop and
    // you kept doing it" loop.
    try {
      var _rw = require('./reminderWeave.js');
      var _sHam = args.ham_uid || hamUid;
      var stopMentioningCancelled = await cancelBeforeEffect(name, runtime);
      if (stopMentioningCancelled) return stopMentioningCancelled;
      var stopMentioningCancellation = effectCancellation(runtime);
      var _r = await _rw.suppressWeave(_sHam, args.keyword||'',
        stopMentioningCancellation || {});
      if (_r && _r.reason === 'voice_turn_cancelled') return cancelledToolResult(name);
      return JSON.stringify(_r && _r.ok ? {ok:true, stopped:_r.keyword} : {ok:false, reason:'could_not_suppress'});
    } catch(eStop){ return JSON.stringify({ok:false,error:eStop.message}); }
  }
  if (name === 'calendar_book') {
    // ⬡B:core.tool.loop:WIRE:calendar_book_cycle_tool_G3b:20260713⬡
    // Wonder rehaul G3b: the write half of SCHEDULE. Reuses the real Nylas booking path
    // (bookEvent over getCalendarGrant + nylasReq) -- no parallel implementation. This
    // creates a REAL event, so the tool description instructs the model to only call it on
    // a time the HAM approved. Founder-gate holds: the first live write should follow an
    // explicit yes from the HAM.
    try {
      var _slB = require('./schedule/schedule.logic.js');
      var _bHam = args.ham_uid || hamUid;
      if (!_bHam || !args.title || !args.start || !args.end) return JSON.stringify({ok:false,reason:'need ham_uid, title, start, and end'});
      var calendarBookCancelled = await cancelBeforeEffect(name, runtime);
      if (calendarBookCancelled) return calendarBookCancelled;
      var calendarBookCancellation = effectCancellation(runtime);
      var _bres = await _slB.bookEvent(_bHam, { title:args.title,
        start:args.start, end:args.end, description:args.description,
        bookingAuthorization:args._bookingAuthorization,
        abortSignal:calendarBookCancellation && calendarBookCancellation.abortSignal,
        isCancelled:calendarBookCancellation && calendarBookCancellation.isCancelled });
      return JSON.stringify(_bres);
    } catch(eBk){ return JSON.stringify({ok:false,error:eBk.message}); }
  }
  if (name === 'propose_working_session') {
    // ⬡B:core.tool.loop:WIRE:propose_working_session_wonder:20260713⬡
    // The Session Wonder: a real agenda from what the advisers already proposed plus what is
    // owed, a real open slot, a real booking (gated). The founder's imagination made
    // non-gimmick -- it convenes nothing when there is not enough genuine material.
    try {
      var _sw = require('./session.wonder.js');
      var _swHam = args.ham_uid || hamUid;
      var _swParentRequest = runtime && runtime.parentRequestId;
      var _swRequestId = _swParentRequest
        ? String(_swParentRequest).slice(0, 140) + '.session' : undefined;
      var sessionCancelled = await cancelBeforeEffect(name, runtime);
      if (sessionCancelled) return sessionCancelled;
      var sessionCancellation = effectCancellation(runtime);
      var _swRes = await _sw.proposeSession(_swHam, {
        autobook: args.autobook === true,
        requestId: _swRequestId,
        userMessage: runtime && runtime.userMessage || origMessage,
        send: false,
        abortSignal:sessionCancellation && sessionCancellation.abortSignal,
        isCancelled:sessionCancellation && sessionCancellation.isCancelled
      });
      if (args.autobook === true && (!_swRes || !_swRes.booked || _swRes.booked.ok !== true)) {
        return JSON.stringify({ok:false,reason:'session_autobook_not_confirmed',
          detail:_swRes && _swRes.reason || null});
      }
      return JSON.stringify(_swRes);
    } catch(eSw){ return JSON.stringify({ok:false,error:eSw.message}); }
  }
  if (name === 'read_render_logs') {
    return JSON.stringify(await readRenderLogs(args.service_id, args.limit||50));
  }
  if (name === 'fix_file_in_github') {
    var path = args.path || '';
    var now = Date.now();
    var last = _lastFixAttempt[path] || 0;
    if (now - last < FIX_COOLDOWN_MS) {
      var BU2=process.env.AIBE_BRAIN_URL,BK2=process.env.AIBE_BRAIN_KEY;
      if (BU2&&BK2) {
        var fixCooldownCancelled = await cancelBeforeEffect(name, runtime);
        if (fixCooldownCancelled) return fixCooldownCancelled;
        fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
          headers:{apikey:BK2,Authorization:'Bearer '+BK2,'Accept-Profile':_schema(),
            'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
          signal:runtime && runtime.abortSignal,
          body:JSON.stringify({ham_uid:hamUid||'SYSTEM',agent_global:'PAI',stamp_type:'LOGFUL',
            source:'pai.fix_cooldown_blocked.'+Date.now(),
            acl_stamp:'\u2b21B:pai.tool:LOGFUL:cooldown_blocked:20260701\u2b21',
            summary:'fix_file_in_github blocked by cooldown -- same path attempted again within '+FIX_COOLDOWN_MS+'ms: '+path,
            content:JSON.stringify({path:path,reason:args.reason||''}),importance:7})
        }).catch(function(){});
      }
      return JSON.stringify({ok:false,reason:'cooldown_active',path:path,retry_after_ms:FIX_COOLDOWN_MS-(now-last)});
    }
    var fixFileCancelled = await cancelBeforeEffect(name, runtime);
    if (fixFileCancelled) return fixFileCancelled;
    _lastFixAttempt[path] = now;
    var fixFileCancellation = effectCancellation(runtime);
    return JSON.stringify(await fixFileInGithub(args.repo, args.path, args.content, args.reason,
      fixFileCancellation || {}));
  }
  if (name === 'trigger_deploy') {
    var deployCancelled = await cancelBeforeEffect(name, runtime);
    if (deployCancelled) return deployCancelled;
    return JSON.stringify(await triggerDeploy(args.service_id, effectCancellation(runtime) || {}));
  }
  if (name === 'activate_roadmap_task') {
    var activationSpec = Object.assign({}, args || {}, { ham_uid: hamUid });
    var activationCancelled = await cancelBeforeEffect(name, runtime);
    if (activationCancelled) return activationCancelled;
    return JSON.stringify(await require('./roadmap.activation.js').activate(activationSpec,
      { cancellation:effectCancellation(runtime) || null }));
  }
  if (name === 'notify_ham') {
    var notifyCancelled = await cancelBeforeEffect(name, runtime);
    if (notifyCancelled) return notifyCancelled;
    return JSON.stringify(await notifyHam(args.ham_uid, args.message,
      runtime && runtime.councilResult, args._resolved_notify_phone,
      effectCancellation(runtime) || {}));
  }
  return JSON.stringify({ok:false,error:'unknown:'+name});
}
// ⬡B:core.tool_loop:WIRE:gate_envelope_through:20260701⬡
// identity: the ATMOSPHERE gate's wake envelope. When a channel has already resolved
// who this is, the Memory Bank must trust that, the founder was greeted as "unknown, trust
// tier 0" over live text while the very same request had resolved him at tier 10.
function structuredReachPolicyMode(channel,identity){
  return String(channel||'').toLowerCase()==='reach'&&!!(identity&&
    identity.outbound_finalize===true&&identity.council_context&&
    identity.council_context.mode==='reach_policy_decision'&&
    identity.council_context.outbound_finalize===true&&identity.delivery&&
    identity.delivery.external===false);
}

function reachIncidentIntakeMode(channel,identity){
  return String(channel||'').toLowerCase()==='reach_intake'&&!!(identity&&
    identity._reachIncidentIntake===true&&identity.outbound_finalize!==true&&
    typeof identity._reachIncidentFence==='function'&&
    identity.council_context&&
    identity.council_context.mode==='reach_incident_intake'&&identity.delivery&&
    identity.delivery.external===false);
}

async function reachIncidentFence(identity,stage){
  if(!identity||identity._reachIncidentIntake!==true||
      typeof identity._reachIncidentFence!=='function')return false;
  try{return await identity._reachIncidentFence(stage)===true;}
  catch(error){return false;}
}

async function runPAI(hamUid, message, channel, identity, priorTurns, uiPortal) {
  // ⬡B:core.tool.loop:GUARD:pai_cycle_cannot_be_bypassed:20260715⬡
  // FOUNDER DIRECT: every face turn must run the real PAI cycle. The former
  // USE_NEW_WORLD fast path returned before _cycleId existed, before the Memory Bank
  // wall loaded, and before cycle_start/cycle_receipt stamps. That produced successful
  // face replies with ms:0 and no cycle lineage. A new-world mind may be integrated as
  // a tool or contributor inside this cycle, but it must never replace this choke point.
  // ⬡B:core.tool_loop:FIX:local_groq_key_becomes_together_key_a6:20260718⬡
  // Article A6: this local var fed the 7 fetch(GB) auth headers. GB now points at
  // the approved Together (GLM) endpoint, so the bearer must be the Together key,
  // not the banned Groq key. Falls back to empty (fail-soft) if Together absent.
  var t0=Date.now(),GROQ=(process.env.TOGETHER_API_KEY||'');
  var _structuredReachPolicy=structuredReachPolicyMode(channel,identity);
  // Server-owned machine intake is candidate-eligible, but it is not a general
  // face turn. The route constructs this non-JSON identity marker after HMAC and
  // exact-HAM validation; no caller field is copied into the marker.
  var _reachIncidentIntake=reachIncidentIntakeMode(channel,identity);
  function _canonicalStructuredReachPolicy(value){
    try{return reachPolicyContract.canonicalize(value,t0);}
    catch(ePolicyContract){return{ok:false,reason:'reach_policy_json_invalid'};}
  }
  function _structuredReachResponseFormat(){
    try{
      var format=reachPolicyContract.responseFormat();
      // Provider bodies must remain serializable even if an injected adapter
      // hands us a cyclic or getter-backed object. The canonical validator below
      // remains the authority whether or not this optional provider hint exists.
      var encoded=JSON.stringify(format);
      var safe=encoded&&JSON.parse(encoded);
      return safe&&safe.type==='json_schema'&&safe.json_schema&&
        safe.json_schema.schema?safe:null;
    }catch(ePolicyFormat){return null;}
  }
  function _validStructuredReachPolicy(value){
    return _canonicalStructuredReachPolicy(value).ok===true;
  }
  function _structuredProviderResult(result){
    if(!_structuredReachPolicy||!result||result.error)return result;
    if(!Array.isArray(result.choices)||!result.choices.length)
      return{error:{code:'reach_policy_provider_contract'}};
    var choice=result.choices[0]||{};
    var modelMessage=choice.message||{};
    if(choice.finish_reason==='length'||choice.finish_reason==='content_filter'||
        modelMessage.refusal||(Array.isArray(modelMessage.tool_calls)&&
          modelMessage.tool_calls.length))return{error:{code:'reach_policy_provider_contract'}};
    var canonical=_canonicalStructuredReachPolicy(modelMessage.content);
    if(!canonical.ok)return{error:{code:'reach_policy_provider_contract'}};
    modelMessage.content=canonical.text;
    choice.message=modelMessage;
    result.choices[0]=choice;
    return result;
  }
  var _voiceCancellation = identity && identity._voiceCancellation;
  var _turnAbortSignal = _voiceCancellation && _voiceCancellation.signal;
  async function _turnCancelled(force) {
    if (_turnAbortSignal && _turnAbortSignal.aborted) return true;
    if (_voiceCancellation && typeof _voiceCancellation.isCancelled === 'function') {
      try { return await _voiceCancellation.isCancelled(force === true) === true; }
      catch (eCancelCheck) { return true; }
    }
    return false;
  }
  // The Pipecat bridge owns a 12-second whole-turn budget. Keep all main-model
  // attempts inside one shared voice deadline so provider fallback cannot add
  // three independent long waits before SHADOW, STAMP, and readback run.
  var _voiceModelDeadline = String(channel || '').toLowerCase() === 'voice'
    ? t0 + 6500 : null;
  function _modelRequestSignal() {
    var deadlineSignal = _voiceModelDeadline
      ? AbortSignal.timeout(Math.max(1, _voiceModelDeadline - Date.now())) : null;
    var signals = [_turnAbortSignal, deadlineSignal].filter(Boolean);
    if (!signals.length) return undefined;
    if (signals.length === 1) return signals[0];
    if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
    var controller = new AbortController();
    signals.forEach(function (signal) {
      if (signal.aborted && !controller.signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', function () {
        if (!controller.signal.aborted) controller.abort(signal.reason);
      }, { once:true });
    });
    return controller.signal;
  }
  // \u2b21B:core.tool.loop:FIX:glm_primary_on_plain_completions:20260711\u2b21
  // Founder, direct: why is this file, the one that serves every real text
  // and call, still on Groq when GLM-5.2 was made primary everywhere else
  // tonight. Real answer: it never got touched. Scoped fix, not a blind
  // swap -- the FORCED tool_choice calls (find_in_brain, nash_sports) stay
  // on Groq, proven and tested for real tool-calling reliability in this
  // exact codebase; GLM-5.2's tool-calling behavior on this schema has
  // never been verified live, and breaking real grounding to chase
  // consistency would be a worse trade. What moves to GLM-5.2 first: the
  // plain, no-tool completion passes -- the honest fallback and statement
  // response -- the exact shape that just went empty three times in a row
  // on Groq for the eviction message.
  async function callGLMPlain(sys, user, maxTokens) {
    var key = process.env.TOGETHER_API_KEY;
    if (!key) return null;
    try {
      var gr = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'zai-org/GLM-5.2', max_tokens: maxTokens || 3000, temperature: 0.3,
          messages: sys ? [{ role: 'system', content: sys }, { role: 'user', content: user }] : user }),
        signal:_modelRequestSignal()
      });
      if (!gr.ok) return null;
      var gd = await gr.json();
      return (gd.choices && gd.choices[0] && gd.choices[0].message && gd.choices[0].message.content) || null;
    } catch (eGlm) { return null; }
  }
  // \u2b21B:core.tool.loop:BUILD:live_cycle_observability:20260707\u2b21
  // span.task.live_pai_cycle_observability -- founder's Life Command Center
  // idea. Real-time step stamps as the cycle actually runs, not just the
  // finished result, read by GET /command-center/live/:hamUid below.
  var _cycleId = hamUid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2,8);
  var _requestIdCandidate = identity && (identity.request_id || identity.requestId);
  var _requestId = typeof _requestIdCandidate === 'string'
    && /^[A-Za-z0-9._:-]{8,160}$/.test(_requestIdCandidate.trim())
    ? _requestIdCandidate.trim() : _cycleId + '.request';
  var _BU=_bu(), _BK=_bk();
  var _voiceSessionId = String(identity && identity.council_context &&
    identity.council_context.mode === 'voice' &&
    identity.council_context.session_id || '').slice(0, 220);
  var _voiceTurnId = String(identity && identity.council_context &&
    identity.council_context.mode === 'voice' &&
    identity.council_context.turn_id || '').slice(0, 160);
  function _stampStep(step, detail) {
    if (!_BU || !_BK) return;
    // CYCLE_STEP is operational telemetry, not the conversation transcript.
    // Voice joins on the stable signed session id; exact user/answer bytes stay
    // in their governed request/council rows instead of being previewed here.
    if (_voiceSessionId) {
      if (step === 'cycle_start') detail = 'voice_turn_received';
      else if (step === 'cycle_end') detail = 'voice_turn_committed';
      else if (/^(?:outbound_council_blocked|cycle_end_silent|post_council_effect_failed)$/.test(step)) {
        var _voiceCodes = String(detail || '').toLowerCase().match(/[a-z0-9][a-z0-9_.:-]{0,79}/g) || [];
        detail = _voiceCodes.slice(0, 4).join(',') || step;
      } else detail = null;
    }
    fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
      headers:{apikey:_BK,Authorization:'Bearer '+_BK,'Accept-Profile':_schema(),
        'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({ham_uid:hamUid,agent_global:'PAI',stamp_type:'CYCLE_STEP',
        source:'pai.cycle.'+_cycleId,
        acl_stamp:'\u2b21B:core.tool.loop:CYCLE_STEP:'+step+':'+Date.now()+'\u2b21',
        summary:'[CYCLE '+_cycleId.slice(-8)+'] '+step+(detail?': '+String(detail).slice(0,100):''),
        content:JSON.stringify({cycleId:_cycleId,step:step,channel:channel,
          sessionId:_voiceSessionId || null,turnId:_voiceTurnId || null,
          detail:detail||null,atMs:Date.now()-t0}),
        importance:3})
    }).catch(function(){});
  }
  function _turnCancelledResult(stage) {
    _stampStep('cycle_end_silent', 'voice_turn_cancelled');
    return { ok:false, reason:'voice_turn_cancelled', blocked_by:'CANCELLED',
      cancel_stage:String(stage || 'unknown').slice(0, 60),
      ham:typeof hamObj === 'undefined' ? { uid:hamUid } : hamObj,
      cycleId:_cycleId, requestId:_requestId,
      tools_used:Array.isArray(tools) ? tools : [],
      iterations:Number.isInteger(iter) ? iter : 0,
      ms:Date.now()-t0 };
  }
  _stampStep('cycle_start', String(message||'').slice(0,80));
  // \u2b21B:core.tool.loop:FIX:real_two_pass_verifier_per_research:20260710\u2b21
  // Real, researched fix (Towards AI hallucination mitigation survey): "two-pass
  // systems where a verifier inspects the draft, highlights unsupported statements,
  // requests regeneration... this pattern works well in production." Everything
  // before this was strengthening the FIRST pass (better prompts, line citations) --
  // real improvements, but a persistent, repeated, live-confirmed fabrication (the
  // same invented "48-hour" figure, three separate attempts) proved the first pass
  // alone is not reliable enough for this failure mode. This is the actual second
  // pass: real numbers verified during the turn are captured; the final answer is
  // mechanically checked against them before it is ever returned.
  var _verifiedRealNumbers = [];
  if (await _turnCancelled()) return _turnCancelledResult('before_memory');
  // ⬡B:core.tool_loop:FIX:absent_groq_key_must_not_kill_the_turn:20260718⬡
  if (!GROQ) GROQ = '';
  var _structuredReachSystemPrompt =
    'INTERNAL CLOSED-WORLD REACH POLICY. Decide only from the server-owned policy question and the exact deliberation evidence packet in this turn. Ambient Memory Bank rows, latest activity, contributors, prior conversation, screen state, and fused world summaries are intentionally excluded and must not be inferred. Return only the required strict JSON object.';
  var _reachIncidentSystemPrompt =
    'INTERNAL CLOSED-WORLD REACH INCIDENT INTAKE. Describe only the exact server-owned incident fact packet in this turn as one concise human-facing sentence. Do not choose timing, channel, recipient, or delivery. Do not call tools, write, deploy, book, send, notify, move a screen, or infer ambient Memory Bank facts. Canonical REACH will separately decide whether, when, and how this candidate surfaces.';
  var _fcwT0=Date.now();
  // The policy finalizer already receives one normalized, digest-bound evidence
  // wall from cycle.decision. Running the generic Memory Bank builder here would
  // perform unrelated recent/global reads, named-agent extraction, and a MINUTES
  // write before judgment. Keep this internal lane closed-world while preserving
  // the complete PAI model, council, STAMP, and durable readback path.
  var _isolatedHamTier = Number(identity &&
    (identity.trust_level != null ? identity.trust_level : identity.tier));
  if (!Number.isFinite(_isolatedHamTier)) _isolatedHamTier = 0;
  var fcw = (_structuredReachPolicy || _reachIncidentIntake) ? {
    ok:true, system_prompt:_reachIncidentIntake
      ? _reachIncidentSystemPrompt : _structuredReachSystemPrompt,
    ham:{ uid:hamUid, name:String(identity&&identity.name||'Unknown').slice(0,160),
      tier:_isolatedHamTier, world:String(identity&&identity.world||'unknown').slice(0,120) },
    context:[], named_agent_records:[], identity_record:null,
    identity_evidence:{ schema:'anew.identity.evidence.result.v1', ok:true,
      available:true, ham_uid:String(hamUid||'').toUpperCase(), subjects:[],
      records:[], count:0, ms:0 },
    contributors:null, contributorsResolved:0, contributorsTotal:0, ms:0
  } : await buildMemoryBank(hamUid,channel,message,identity)
    .catch(function(e){return {ok:false,reason:'fcw_threw:'+e.message};});
  var _fcwBuildMs=Date.now()-_fcwT0; // \u2b21B:core.tool_loop:WIRE:phase_timing_20260711\u2b21 real profiling, not guessing
  if (await _turnCancelled()) return _turnCancelledResult('after_memory');
  // ⬡B:core.tool.loop:GUARD:memory_wall_required_before_deliberation:20260715⬡
  // A generic assistant prompt is not a PAI cycle. Ordinary turns require the
  // live Memory Bank wall. The structured finalizer above instead requires its
  // server-normalized exact evidence wall and cannot fall back to generic text.
  if (!fcw || fcw.ok !== true || typeof fcw.system_prompt !== 'string' || !fcw.system_prompt) {
    global._paiLastError = 'memory_bank_build_failed:' + ((fcw&&fcw.reason)||'unknown');
    // \u2b21B:core.tool.loop:WIRE:needs_clair_before_founder:20260710\u2b21
    // Life Assistant pt6 law: when she lacks context, her FIRST move is to reach the
    // command center (CLAIR), not the founder. This stamps a NEEDS_CLAIR gap the
    // command center surfaces, so a knowledge hole becomes a question to CLAIR before
    // it ever becomes a pin on the founder. Founder-world only; agent of the reach wonder.
    try {
      // ⬡B:core.tool.loop:FIX:w5_no_hardcoded_founder_fallback:20260710⬡
      // CANON caught a hardcoded HAM UID landed as an env-fallback literal. The new
      // world's template law (template-mind line one) is explicit: identity arrives
      // ONLY through env. If FOUNDER_HAM_UID is unset, this founder-only lane simply
      // does not fire; it never guesses who the founder is from a literal in code.
      var FOUNDER = String(process.env.FOUNDER_HAM_UID || '').toUpperCase();
      if (FOUNDER && String(hamUid).toUpperCase() === FOUNDER) {
        var BUk=process.env.AIBE_BRAIN_URL,BKk=process.env.AIBE_BRAIN_KEY;
        if (BUk&&BKk) fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',
          headers:{apikey:BKk,Authorization:'Bearer '+BKk,'Accept-Profile':_schema(),'Content-Profile':_schema(),'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({ham_uid:hamUid,agent_global:'ANEW',stamp_type:'GAP_FLAGS',
            source:'gap.needs_clair.'+Date.now(),
            acl_stamp:'\u2b21B:core.tool.loop:GAP_FLAGS:needs_clair:'+ymd()+'\u2b21',
            summary:'[SHE NEEDS CLAIR] ran on thin context ('+((fcw&&fcw.reason)||'unknown')+') for: '+String(message||'').slice(0,80),
            content:JSON.stringify({question:String(message||'').slice(0,300),reason:(fcw&&fcw.reason)||'unknown',askClairFirst:true}),importance:7})
        }).catch(function(){});
      }
    } catch (eNC) {}
    return {ok:false,reason:'memory_bank_build_failed',detail:(fcw&&fcw.reason)||'unknown',
      ham:{uid:hamUid},cycleId:_cycleId,requestId:_requestId,tools_used:[],iterations:0,
      fcw_build_ms:_fcwBuildMs,fcw_contributors:null,
      fcw_contributors_resolved:0,fcw_contributors_total:0};
  }
  // A structured REACH policy is a closed-world decision over one exact
  // candidate packet. Ambient recent rows, contributors, prior turns, screen
  // state, and fused summaries may not steer whether this candidate reaches
  // anyone. The exact deliberation packet below is the sole factual input.
  var systemPrompt = _structuredReachPolicy ? _structuredReachSystemPrompt
    : _reachIncidentIntake ? _reachIncidentSystemPrompt : fcw.system_prompt;
  var hamObj = fcw.ham;
  // ⬡B:core.tool_loop:GUARD:one_exact_question_for_provenance_and_council:20260715⬡
  // Identity metadata is canonical when present. Otherwise the first trusted
  // server builder marker separates the BCW from the exact user request. Every
  // provenance, CODA, SHADOW, and council check consumes these same bytes.
  var _exactUserMessage = String(identity &&
    (identity.user_message || identity.userMessage) || '');
  if (!_exactUserMessage) {
    var _exactBuilderMarker = String(message || '').indexOf('=== BUILDER MESSAGE ===');
    _exactUserMessage = _exactBuilderMarker >= 0
      ? String(message || '').slice(
        _exactBuilderMarker + '=== BUILDER MESSAGE ==='.length).trim()
      : String(message || '');
  }
  // ⬡B:core.tool_loop:WIRE:first_person_identity_to_server_proof:20260716⬡
  // "Who are you / who am I" contains only pronouns, so the named-subject
  // provenance reader intentionally extracts nothing. Bind these turns to the
  // canonical assistant identity and the exact HAM identity row already selected
  // by Memory Bank. The same bounded packet reaches drafting and SHADOW.
  var _firstPersonIdentityProof = !_structuredReachPolicy && !_reachIncidentIntake && /\bwho\s+are\s+you\b|\bwho\s+am\s+i\b|\bhow\s+do\s+you\s+know\b|\bprove\s+it\b/i
    .test(_exactUserMessage);
  var _runtimeIdentityEvidence = null;
  if (_firstPersonIdentityProof && fcw.identity_record && hamObj &&
      hamObj.name && hamObj.name !== 'Unknown') {
    _runtimeIdentityEvidence = {
      name:'runtime_identity_binding',
      provenance:'pai.current_turn.server_identity',
      ham_uid:String(hamUid || '').toUpperCase(),
      request_id:_requestId,
      cycle_id:_cycleId,
      assistant:{ name:"A'NU", source:'fcw.canonical_assistant' },
      human:{ name:String(hamObj.name).slice(0, 160),
        source:String(fcw.identity_record.source || '').slice(0, 260),
        row_id:fcw.identity_record.id == null ? null : fcw.identity_record.id,
        stamp_type:String(fcw.identity_record.stamp_type || '').slice(0, 120) }
    };
    systemPrompt += '\nCURRENT IDENTITY PROOF (server-owned for this exact turn): ' +
      JSON.stringify(_runtimeIdentityEvidence) +
      '\nAnswer the identity questions directly from this binding. Explain that the person is known through their resolved private account/world and stored identity record, and that you are A\'NU because this request is executing inside A\'NU\'s canonical PAI pathway. Do not expose internal identifiers or claim biometric, legal, or real-world proof beyond this binding.';
  }
  // ⬡B:core.tool_loop:GROUND:current_turn_proof_before_draft:20260715⬡
  // Drafting necessarily precedes council commit and STAMP readback. Ground only
  // proof-shaped current-turn asks in the transactional release invariant so the
  // model never mistakes its pre-commit vantage point for a failed cycle.
  var _proofQuestion = _exactUserMessage;
  if (!_structuredReachPolicy && !_reachIncidentIntake) {
    systemPrompt += currentTurnProofGuard.systemInstruction(_proofQuestion);
  }
  var _currentPreferenceQuestion = !_structuredReachPolicy && !_reachIncidentIntake &&
    currentAssistantPreferenceRequest(_exactUserMessage);
  if (_currentPreferenceQuestion) {
    // ⬡B:core.tool_loop:WIRE:fresh_preference_inside_full_pai:20260715⬡
    // A current preference is a live A'NU judgment, not a fabricated memory.
    // The candidate and reasons must come from this turn's verified evidence;
    // the answer must label whether the choice is fresh or already stored.
    systemPrompt += '\nCURRENT SELF-PREFERENCE: The person is asking you to choose now, not merely recall a past choice. If no matching stored preference exists, form a present judgment from verified information about the named options. Explicitly say that it is your fresh/current judgment rather than a stored preference. Do not invent option traits, history, or a prior favorite.';
  }
  // ⬡B:core.tool_loop:EVIDENCE:named_bcw_focus_before_deliberation:20260715⬡
  // A live coding turn proved that merely placing THE FLOOR inside a long BCW
  // does not guarantee model attention. Select only the server-built sections
  // named by the exact builder question and repeat that evidence at system
  // priority. The extractor is shared with SHADOW, which independently checks
  // the outgoing draft; no answer or doctrine wording is invented here.
  var _namedEvidenceQuestion = _exactUserMessage;
  var _namedContextEvidence = _structuredReachPolicy || _reachIncidentIntake ? []
    : extractNamedContextEvidence(_namedEvidenceQuestion, message);
  var _identityEvidenceEnvelope = _structuredReachPolicy || _reachIncidentIntake ? {
    schema:'anew.identity.evidence.result.v1', ok:true, available:true,
    ham_uid:String(hamUid || '').toUpperCase(), subjects:[], records:[], count:0, ms:0
  } : fcw && fcw.identity_evidence;
  var _identityEvidenceProof = _structuredReachPolicy || _reachIncidentIntake
    ? { ok:true, result:_identityEvidenceEnvelope, receipt:null }
    : identityProvenance.createEvidenceProof(_identityEvidenceEnvelope, hamUid);
  var _identityProvenanceLedger = _structuredReachPolicy || _reachIncidentIntake
    ? { required:false }
    : identityProvenance.buildLedger({
    question:_namedEvidenceQuestion,
    hamUid:hamUid,
    storedRecords:_identityEvidenceEnvelope && _identityEvidenceEnvelope.records || [],
    evidenceAvailable:!!(_identityEvidenceEnvelope &&
      _identityEvidenceEnvelope.ok === true && _identityEvidenceEnvelope.available === true),
    unavailableReason:_identityEvidenceEnvelope &&
      (_identityEvidenceEnvelope.reason || _identityEvidenceEnvelope.error),
    evidenceReceipt:_identityEvidenceProof.ok ? _identityEvidenceProof.receipt : null,
    receiptVerified:_identityEvidenceProof.ok === true
  });
  // ⬡B:core.tool.loop:GUARD:provenance_unavailable_never_stamps:20260715⬡
  if (_identityProvenanceLedger.required &&
      (_identityProvenanceLedger.available !== true ||
       _identityProvenanceLedger.receipt_verified !== true)) {
    return { ok:false, reason:_identityProvenanceLedger.available !== true
        ? 'identity_evidence_unavailable' : 'identity_evidence_receipt_unverified',
      ham:hamObj, cycleId:_cycleId, requestId:_requestId,
      tools_used:[], iterations:0, ms:Date.now()-t0 };
  }
  var _identityProvenanceRefocus = '';
  if (_identityProvenanceLedger.required) {
    _identityProvenanceRefocus = '\n\nIDENTITY PROVENANCE LEDGER (bounded exact-HAM evidence):\n' +
      JSON.stringify(_identityProvenanceLedger) +
      '\nAnswer directly, subject by subject, under exactly STORED MEMORY: and BOUND ROLE CONTEXT:. ' +
      'A stored activity row proves activity only. A stored self-description is a role claim, not literal identity. ' +
      'A role bound in the current request is current context, not stored memory. Do not use the six-section coding relay recital.';
    systemPrompt += _identityProvenanceRefocus;
  }
  var _namedContextRefocus = '';
  var _namedEvidenceRefocusedAfterFind = false;
  var _identityEvidenceRefocusedAfterFind = false;
  if (_namedContextEvidence.length) {
    _namedContextRefocus = '\n\nNAMED CONTEXT EVIDENCE (selected deterministically from the bound BCW; use it for this named question):\n' +
      _namedContextEvidence.map(function (evidence) { return evidence.text; }).join('\n\n') +
      '\nDo not claim this named evidence is absent. Answer from it, and state its limits if it does not cover some part of the question.';
    systemPrompt += _namedContextRefocus;
  }
  // ⬡B:core.tool.loop:FIX:thread_real_prior_turns:20260704⬡
  // Founder-reported live incident: on voice specifically, the assistant reads
  // as confused about who it's talking to, worse the longer a call runs.
  // Root cause, confirmed by reading the actual code rather than guessing:
  // routes/vara.llm.routes.js receives ElevenLabs' real turn-by-turn history
  // (properly role-tagged, user vs assistant) on every single request, then
  // discards all of it and passes only the current utterance here. Every
  // voice turn was generated as if it were the first thing ever said in the
  // call, with zero direct visibility into what it itself said moments ago,
  // relying only on the brain's indirect recent-context reconstruction. This
  // is not a text/email issue -- those channels are naturally turn-isolated --
  // it is specifically a live, multi-turn, same-call continuity gap, and it
  // compounds fastest exactly where streaming makes turns rapid. Real prior
  // turns, when a caller has them to give, now ride between the system prompt
  // and the current message instead of being thrown away. Optional and
  // additive: any caller that does not pass priorTurns (text, email, chat)
  // behaves exactly as before, unchanged.
  // ⬡B:core.tool.loop:WIRE:screen_awareness_know:20260709⬡ founder-commissioned:
  // when this HAM has a LIVE screen, she is told it exists and how to move it.
  // No live screen = empty string, zero cost, unchanged behavior.
  // \u2b21B:core.tool_loop:FIX:she_never_denies_her_hands_20260711\u2b21 Founder live test:
  // she told him "I can't control the screen or do visual tricks. I'm text and voice
  // only" -- a confabulated denial on a turn where the live-screen flag flapped and
  // the addendum was absent. Her ABILITY is permanent even when a screen is not
  // currently open, so the base prompt now carries it unconditionally: she commands
  // the glass through update_screen; if no screen is live the TOOL says so and she
  // says the screen is not open -- she never again claims she lacks the ability.
  if (!_structuredReachPolicy && !_reachIncidentIntake) {
    systemPrompt += ' You have hands on the person\u2019s live glass screen: through the update_screen tool you can set backgrounds, layouts, skywriting, cards, charts, and open their real apps as windows. If they ask for something on the screen, call update_screen and it happens. If no screen is currently open the tool will say so; in that case say their screen is not open right now -- never claim you cannot control screens. HARD RULE, never break it: never state a specific meeting name, person\u2019s name, time, count, or dollar figure about the person\u2019s real life unless it came from an actual tool result in THIS turn. If you have not called calendar_read/find_in_brain/the relevant tool for a question about their day, schedule, inbox, or numbers, either call the tool first or say plainly that you do not have that yet -- inventing a plausible-sounding specific fact is a severe failure, worse than saying nothing. RECENCY RULE, just as hard: a find_in_brain result is a PAST NOTE with a timestamp, not live truth -- before presenting it as describing TODAY, check its date against today\u2019s real date. A stamp from days or weeks ago, or one describing a recurring day (\u201cMonday\u201d, \u201cweekly\u201d) that is not today, must never be presented as today\u2019s schedule; say what it actually is (an old note, a recurring Monday item) or skip it. For any question about today or the calendar specifically, calendar_read is the only source of truth for what is happening today -- if it returns no events, say the day is open, do not fall back to an old find_in_brain stamp to fill the gap.';
    try { systemPrompt += require('./stream/screen.awareness.js')
      .promptAddendum(hamUid, uiPortal); } catch (eScr) {}
  }
  // \u2b21B:core.tool_loop:WIRE:context_fusion_grounding_3b_20260710\u2b21 Portal and
  // asynchronous reach turns ground against the freshest fused world context.
  // A live voice call stays on its signed call/session context by default; an
  // explicit server-owned voice request may opt into the ambient fuse.
  if (!_structuredReachPolicy &&
      shouldIncludeWorldContext(channel, identity, hamUid, _exactUserMessage)) {
    try { systemPrompt += await require('./context.fusion.js').getLatestSummary(hamUid); } catch (eFus) {}
  }
  var msgs=[{role:'system',content:systemPrompt}];
  if (!_structuredReachPolicy && Array.isArray(priorTurns) && priorTurns.length) {
    priorTurns.forEach(function(t){
      if (t && (t.role==='user'||t.role==='assistant') && typeof t.content==='string' && t.content.trim()) {
        msgs.push({role:t.role, content:t.content});
      }
    });
  }
  // ⬡B:tool.loop:NUDGE:nash_routing_20260711⬡ cold keyword router: a sports
  // question MUST reach NASH; the model was answering "no real-time access"
  // instead of deploying the wonder it already has.
  var _nashNeeded = !_structuredReachPolicy && !_reachIncidentIntake &&
    /\b(lakers|celtics|warriors|knicks|nba|nfl|mlb|nhl|wnba|score|scores|playoffs?|game (to)?night|did .{1,40}(win|lose|beat)|final score)\b/i.test(message);
  if (_nashNeeded) {
    msgs.push({role:'system',content:'NASH is standing by. For this question you MUST call the nash_sports tool first (pick the league) and answer from its scoreboard. Never say you lack real-time access; you have NASH.'});
  }
  var _verifiedToolEvidence = [];
  var _identityVerifiedEvidence = [];
  var _namedAgentVerifiedEvidence = [];
  // The structured REACH caller binds its policy question separately from the
  // evidence packet so the outbound council can prove both byte-for-byte. The
  // model still needs to see that server-owned question during deliberation.
  // Without this bridge it saw only NOW_ISO / EVIDENCE and guessed a free-form
  // answer, which the strict JSON gate correctly rejected before council.
  if (_structuredReachPolicy) {
    msgs.push({role:'system',content:
      'INTERNAL BOUNDED REACH POLICY. The following server-owned question is the '+
      'authority for this turn. Follow it exactly and return only its strict JSON '+
      'object, with no markdown or commentary.\n\n'+_exactUserMessage});
  }
  msgs.push({role:'user',content:message});
  var _identityLookupCount = _structuredReachPolicy || _reachIncidentIntake ? 0
    : injectIdentityProvenanceEvidence(msgs, _identityVerifiedEvidence, fcw,
      hamUid, _namedEvidenceQuestion, _identityEvidenceProof);
  if (_identityLookupCount > 0) {
    msgs.push({role:'system',content:'The completed identity provenance result above is an exact-HAM bounded read. Preserve each evidence_kind: stored_definition may define; stored_role_claim reports a past self-description without making it literal identity; stored_activity proves only activity. Do not say retrieval did not occur.'});
  }
  // The user message must precede its synthetic assistant tool call. These rows
  // were already read by MEMORY_BANK; this is an attention-channel bridge, not a query.
  var _namedLookupCount = _structuredReachPolicy || _reachIncidentIntake ||
    _identityLookupCount > 0 ? 0
    : injectNamedAgentEvidence(msgs, _namedAgentVerifiedEvidence, fcw, hamUid);
  if (_namedLookupCount > 0) {
    // ⬡B:core.tool_loop:EVIDENCE:named_lookup_provenance_is_explicit:20260715⬡
    // A completed exact-HAM lookup may return an operational row that proves
    // existence but not identity. Tell synthesis both truths: the lookup ran,
    // and the row must not be stretched beyond what its fields establish.
    msgs.push({role:'system',content:'An exact-HAM Memory Bank lookup was completed for the named uppercase agents and its real result is visible above. Do not claim that no memory lookup or retrieval occurred. Separately state whether each returned row actually establishes the requested identity or role; an operational row such as a backup, receipt, or activity record proves only what it says.'});
  }
  // ⬡B:tool.loop:FIX:wondergames_synthetic_toolresult_20260714⬡
  // Founder-confirmed live: even with the real Wonder Games record cold-loaded into
  // the system prompt (verified via /debug/fcw), the model still sometimes answered
  // 'I do not have information' -- because this codebase's own prior, proven finding
  // (context.fusion, 20260710) is that passive system-prompt text is not reliably
  // attended to; only TOOL RESULTS are. Mechanism, not phrasing, applied again: for a
  // Wonder Games/cook-off question, inject a SYNTHETIC completed find_in_brain
  // tool-call-and-result pair into the message history, AFTER the user's message (the
  // only valid order -- a tool call must follow what prompted it, not precede it; the
  // first draft had this backwards, caught in reliability testing), so the real record
  // arrives via the one channel demonstrated to be reliable, and the model never has
  // to decide whether to call the tool or trust the wall.
  var _wgNeeded = !_structuredReachPolicy && !_reachIncidentIntake &&
    /wonder ?games?|cook.?off|cooking code off|coding cook|head.?to.?head|model contest|which model won/i.test(message);
  if (_wgNeeded) {
    try {
      var _wgSynthRes = await find([
        { stamp_type: 'WONDER_GAMES', ham_uid: hamUid, limit: 5 },
        { stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: 8, limit: 3 }
      ]);
      if (_wgSynthRes && _wgSynthRes.beads && _wgSynthRes.beads.length) {
        var _wgResult = JSON.stringify(_wgSynthRes).slice(0,4000);
        _verifiedToolEvidence.push({ tool:'find_in_brain',
          provenance:'memory_bank.exact_ham',
          args:JSON.stringify({ stamp_type:'WONDER_GAMES', ham_uid:hamUid }),
          result:_wgResult });
        var _wgCallId = 'wg_preload_' + Date.now();
        msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: _wgCallId, type: 'function',
          function: { name: 'find_in_brain', arguments: JSON.stringify({ stamp_type: 'WONDER_GAMES' }) } }] });
        msgs.push({ role: 'tool', tool_call_id: _wgCallId, content: _wgResult });
      }
    } catch (eWgSynth) {}
  }
  // ⬡B:tool.loop:FIX:preferences_synthetic_toolresult_20260714⬡
  // Same proven mechanism as Wonder Games above, applied to the earlier PREFERENCE
  // cold-load (20260711), which suffered the identical reliability gap: a real
  // PREFERENCE bead exists and is cold-loaded into the system prompt, but the model
  // still sometimes says it has no record (surfaced live once the MEMORY_BANK schema mismatch
  // fix made aibebase genuinely read the new bank). Same fix: inject a synthetic
  // completed find_in_brain(PREFERENCE) result after the user's message.
  var _prefNeeded = !_structuredReachPolicy && !_reachIncidentIntake &&
    /\bfavou?rite\b|\bprefer(ence|red)?\b|what do i (like|love|enjoy)\b|\bmy taste\b/i.test(message);
  if (_prefNeeded) {
    try {
      var _prefSynthRes = await find([{ stamp_type: 'PREFERENCE', ham_uid: hamUid, limit: 5 }]);
      // ⬡B:core.tool_loop:FIX:preference_preload_keyword_net_20260718⬡ Founder
      // caught live and A'NU agreed via the cycle door: the preload only queried
      // stamp_type PREFERENCE, but a plainly stored fact (the Lakers fact) lives
      // under CHATTER / CYCLE_STEP / LOGFUL, never PREFERENCE, so the preload
      // came back empty and she answered "I have nothing" while the fact sat
      // right there. When PREFERENCE is empty, run a ham-scoped ilike on the
      // ⬡B:core.tool_loop:DOCTRINE:cold_ilike_net_removed_organ_decides_meaning:20260718⬡
      // WONDER CYCLE doctrine (382567): cold code must never decide meaning. ilike
      // noun-guess removed; PREFERENCE stamp_type preload stays. Fails open to the organ.
      if (_prefSynthRes && _prefSynthRes.beads && _prefSynthRes.beads.length) {
        var _prefResult = JSON.stringify(_prefSynthRes).slice(0,4000);
        _verifiedToolEvidence.push({ tool:'find_in_brain',
          provenance:'memory_bank.exact_ham',
          args:JSON.stringify({ stamp_type:'PREFERENCE', ham_uid:hamUid }),
          result:_prefResult });
        var _prefCallId = 'pref_preload_' + Date.now();
        msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: _prefCallId, type: 'function',
          function: { name: 'find_in_brain', arguments: JSON.stringify({ stamp_type: 'PREFERENCE' }) } }] });
        msgs.push({ role: 'tool', tool_call_id: _prefCallId, content: _prefResult });
      }
    } catch (ePrefSynth) {}
  }
  var _codaLeadNeeded = !!(identity && identity.council_context
    && identity.council_context.mode === 'coding');
  var _codaEvidenceRelayAnswer = '';
  var _codaDirectNamedEvidenceAnswer = '';
  var _codaProvenanceAnswer = '';
  var _codaRepositoryAnswer = '';
  var _codaIdentityReceiptVerified = false;
  var _codaActivationDecision = null;
  var _codaDecisionSource = null;
  if (_codaLeadNeeded) {
    var _codaCallId = 'coda_preload_' + Date.now();
    var _codaQuestion = _exactUserMessage;
    var _codaResult = await executeTool('consult_coda', { ham_uid:hamUid, question:_codaQuestion,
      _identity_evidence:fcw.identity_evidence,
      _identity_evidence_result:_identityEvidenceProof.result,
      _identity_evidence_receipt:_identityEvidenceProof.receipt }, hamUid, _codaQuestion);
    var _codaFailureReason = failedCodaReason(_codaResult);
    if (_codaFailureReason) {
      return { ok:false, reason:_codaFailureReason, blocked_by:'CODA',
        ham:hamObj, cycleId:_cycleId, requestId:_requestId,
        tools_used:['consult_coda'], iterations:0, ms:Date.now()-t0 };
    }
    try {
      var _codaParsed = JSON.parse(_codaResult);
      _codaIdentityReceiptVerified = !!(_codaParsed &&
        identityProvenance.sameEvidenceReceipt(
          _codaParsed.identityEvidenceReceipt,
          _identityEvidenceProof.receipt));
      if (_codaParsed && _codaParsed.ok === true && _codaParsed.provenanceVerified === true &&
          _codaIdentityReceiptVerified &&
          typeof _codaParsed.answer === 'string' && _codaParsed.answer.trim()) {
        _codaProvenanceAnswer = _codaParsed.answer.trim().slice(0, 5000);
      }
      if (_codaParsed && _codaParsed.ok === true &&
          (_codaParsed.activationDecision === 'APPROVE' || _codaParsed.activationDecision === 'HOLD')) {
        _codaActivationDecision = _codaParsed.activationDecision;
        _codaDecisionSource = typeof _codaParsed.decisionSource === 'string'
          ? _codaParsed.decisionSource : null;
      }
      if (_codaParsed && _codaParsed.ok === true &&
          _codaParsed.relayContractVerified === true &&
          codingRelay.exactContract(_codaParsed.relay) &&
          _codaParsed.evidence && _codaParsed.evidence.repository === true &&
          typeof _codaParsed.answer === 'string' && _codaParsed.answer.trim()) {
        _codaRepositoryAnswer = _codaParsed.answer.trim().slice(0, 5000);
      }
      if (_codaParsed && _codaParsed.ok === true && _codaParsed.evidenceRelay === true &&
          _codaParsed.relayContractVerified === true &&
          codingRelay.exactContract(_codaParsed.relay) &&
          typeof _codaParsed.answer === 'string' && _codaParsed.answer.trim()) {
        _codaEvidenceRelayAnswer = _codaParsed.answer.trim().slice(0, 5000);
        if (_codaParsed.directNamedEvidence === true &&
            _codaParsed.evidenceMode === 'direct_named_evidence' &&
            _codaParsed.retried === false) {
          _codaDirectNamedEvidenceAnswer = _codaEvidenceRelayAnswer;
        }
      }
    } catch (eCodaEvidenceRelay) {}
    if (_identityProvenanceLedger.required && !_codaIdentityReceiptVerified) {
      return { ok:false, reason:'coda_identity_evidence_receipt_unverified',
        ham:hamObj, cycleId:_cycleId, requestId:_requestId,
        tools_used:['consult_coda'], iterations:0, ms:Date.now()-t0 };
    }
    _verifiedToolEvidence.push({ tool:'consult_coda',
      provenance:'pai.current_turn.execute_tool', request_id:_requestId, cycle_id:_cycleId,
      args:JSON.stringify({ ham_uid:hamUid, question:_codaQuestion }), result:_codaResult });
    msgs.push({ role:'assistant', content:null, tool_calls:[{ id:_codaCallId, type:'function',
      function:{ name:'consult_coda', arguments:JSON.stringify({ ham_uid:hamUid, question:_codaQuestion }) } }] });
    msgs.push({ role:'tool', tool_call_id:_codaCallId, content:_codaResult });
    msgs.push({role:'system',content:'CODA has already been consulted through the completed tool result above. Use her decision as the lead brief and speak only as the relay. Do not call CODA again, draft a competing roadmap, or claim evidence her result does not contain. If her result is a hold or failure, report that hold plainly.'});
  }
  // ⬡B:core.tool_loop:GUARD:outbound_finalize_read_only_tools:20260715⬡
  // An autonomous reach finalizer may read evidence but may not send, write,
  // deploy, book, or move a screen before its answer clears the council.
  var _readOnlyToolNames = ['nash_sports','find_identity_evidence','find_in_brain','read_render_logs',
    'get_budget_upcoming','get_budget_summary','consult_advisor','calendar_read','inbox_read','read_reminders',
    'find_contact','get_pending_drafts','get_recent_builds','read_own_code','consult_coda'];
  var _turnToolDefinitions = _reachIncidentIntake ? [] :
    identity && identity.outbound_finalize === true
    ? TOOLS.filter(function (tool) {
      return tool && tool.function && _readOnlyToolNames.indexOf(tool.function.name) >= 0;
    }) : TOOLS;
  // ⬡B:core.tool_loop:WIRE:signed_voice_purpose_is_exact_draft:20260717⬡
  // The failed proof call showed that merely removing generic tools still let
  // the model paraphrase the signed purpose, preventing deterministic SHADOW.
  // Select the exact handoff bytes as this cycle's draft. This skips no release
  // authority: canonical preparation, all seven council stages, the nine-row
  // commit, STAMP, and readback remain below exactly as for a model draft.
  var _signedVoicePurposeAnswer = verifiedVoiceCallPurposeAnswer(
    channel, hamUid, _exactUserMessage, identity);
  var _signedVoiceHearingAnswer = verifiedVoiceHearingAnswer(
    channel, hamUid, _exactUserMessage, identity);
  var _signedVoiceFarewellAnswer = verifiedVoiceFarewellAnswer(
    channel, hamUid, _exactUserMessage, identity);
  var iter=0,tools=_codaLeadNeeded?['consult_coda']:[],
    ans=_signedVoicePurposeAnswer || _signedVoiceHearingAnswer ||
      _signedVoiceFarewellAnswer || null;
  if (_signedVoicePurposeAnswer) {
    _stampStep('signed_voice_call_purpose_selected', 'exact_handoff_bytes');
  }
  if (_signedVoiceHearingAnswer) {
    _stampStep('signed_voice_hearing_acknowledgement_selected', 'exact_turn_transcript');
  }
  if (_signedVoiceFarewellAnswer) {
    _stampStep('signed_voice_farewell_acknowledgement_selected', 'exact_turn_transcript');
  }
  var _effectRuntime = { phase:'deliberation', pendingEffects:[], effectKeys:{} };
  _effectRuntime.channel = String(channel || '').toLowerCase();
  _effectRuntime.exactHamReads = _effectRuntime.channel === 'voice' &&
    !!verifiedVoiceCallContext(identity, hamUid);
  _effectRuntime.abortSignal = _turnAbortSignal || null;
  _effectRuntime.isCancelled = _turnCancelled;
  _effectRuntime.activationDecisionRequired = false;
  _effectRuntime.codaActivationApproved = _codaActivationDecision === 'APPROVE';
  _effectRuntime.codaActivationDecision = _codaActivationDecision;
  _effectRuntime.codaDecisionSource = _codaDecisionSource;
  _effectRuntime.codaVerified = _codaLeadNeeded && _verifiedToolEvidence.some(function (proof) {
    return proof && proof.tool === 'consult_coda';
  });
  // ⬡B:core.tool_loop:GUARD:explicit_roadmap_activation_is_a_real_tool_call:20260715⬡
  // Founder live acceptance caught the model saying it would activate SPAN,
  // then returning a ROADMAP source as though it were a TASK receipt. When a
  // verified coding turn literally orders this named mutation, the first tool
  // decision is structural, not optional prose. CODA has already run above;
  // activation itself still waits behind the outbound council commit.
  var _roadmapActivationNeeded = _effectRuntime.codaVerified === true
    && /\bcall\s+activate_roadmap_task\b/i.test(String(_exactUserMessage || ''));
  var _roadmapActivationEnvelope = parseRoadmapActivationSpec(_exactUserMessage);
  _effectRuntime.activationDecisionRequired = !!_roadmapActivationEnvelope;
  if (_roadmapActivationEnvelope && _roadmapActivationEnvelope.error) {
    return { ok:false, reason:_roadmapActivationEnvelope.error, blocked_by:'SPAN_ACTIVATION',
      ham:hamObj, cycleId:_cycleId, requestId:_requestId,
      tools_used:tools, iterations:0, ms:Date.now()-t0 };
  }
  if (_roadmapActivationEnvelope && _effectRuntime.codaVerified === true) {
    _roadmapActivationNeeded = _effectRuntime.codaActivationApproved === true;
  }
  while (iter<MAX && !ans) {
    if (await _turnCancelled(true)) return _turnCancelledResult('before_model');
    iter++;
    // ⬡B:core.tool.loop:FIX:strong_model_makes_the_tool_decision:20260704⬡
    // Real root cause of the whole night's tool-calling unreliability, found by
    // reading the model-selection line. The FIRST turn ran on the 8B penny model
    // and only escalated to 70B AFTER a tool had already fired. That is backwards:
    // the weakest model was making the single hardest judgment -- whether to call
    // a tool at all -- and the strong model only arrived once that judgment had
    // already gone right. The 8B skips the tool, so it never escalates, so it
    // stays weak. Confirmed live against a real founder call: 8 of 12 voice turns,
    // zero tools. Fix: whenever tools are on the table (iter<=3, where body.tools
    // gets attached below), use the 70B model to make that call. The penny model
    // still handles later no-tool continuation turns, so this is not "premium
    // everywhere" -- it is the capable model exactly where the real decision is
    // made, the penny model everywhere it is genuinely fine. Founder's own words
    // on the failing call, stamped to the brain: this has to actually run the
    // real cycle, tools included, on every channel.
    var toolsOnThisTurn = (iter<=3);
    // ⬡B:core.tool_loop:FIX:fast_model_for_forced_tool_selection_20260711⬡
    // Founder, live: cycle is 11-16s, 'this dont sound like AGENT FIND microseconds.'
    // Profiled it directly -- FIND is microseconds, Memory Bank is parallel/fast; the time is
    // the MODEL. Every turn on text/email forces a find_in_brain call on iter 1, so
    // it is TWO 70b round-trips minimum (one to pick the tool, one to answer), and
    // 70b on Groq is the slow one. The forced iter-1 tool-selection pass is a pure
    // pattern-match ('does this need a lookup') -- the fast model does that fine and
    // is multiple seconds quicker. Keep the quality 70b for the ANSWER pass (where
    // tools already ran and real synthesis happens); use the fast model only for the
    // forced first-pass tool pick. Real latency cut, no quality loss on the answer.
    var _forcedToolSelectionPass = !_structuredReachPolicy&&!_reachIncidentIntake&&
      (iter===1 && tools.length===0);
    // ⬡B:core.tool_loop:FIX:model_slug_is_approved_glm_since_GB_is_together:20260718⬡
    // Article A6: GB now targets the approved Together (GLM) endpoint, so the model
    // slug must be the approved GLM model, not a Groq/OpenAI slug. All fetch(GB)
    // bodies use this var. Together serves GLM-5.2; use it for every tier so the
    // request is valid at the approved provider. (Tier nuance moves to the ladder
    // later; correctness and no-banned-traffic come first.)
    var model=(process.env.TOGETHER_MODEL||'zai-org/GLM-5.2');
    // ⬡B:core.tool.loop:FIX:lower_temp_for_tool_reliability:20260702⬡
    // Live incident: asked the same biography question twice under identical
    // wiring -- once she called find_in_brain with the right topic (wrong part,
    // now fixed separately), once she skipped the tool call entirely and fell
    // back to the honesty rule. 0.5 is high for what is substantially a pattern-
    // match decision (does this question match a known tool-trigger class).
    // Lowered to reduce that variance; still warm enough for natural replies.
    // This is a real improvement, not a guarantee -- instruction-following on
    // a growing system prompt stays worth watching, not a closed case.
    var body={model:model,messages:msgs,max_tokens:tokenCapFor(channel),
      temperature:_structuredReachPolicy?0:_reachIncidentIntake?0.1:0.3};
    if (iter<=3) body.tools=_turnToolDefinitions;
    var _routedToolIntent = null;
    var _routedRequiresLiveTool = false;
    var _routedRequiredReadTool = null;
    if (iter === 1 && Array.isArray(body.tools) && body.tools.length &&
        !_structuredReachPolicy && !_reachIncidentIntake &&
        String(channel || '').toLowerCase() !== 'voice' &&
        !(identity && identity.outbound_finalize === true)) {
      _routedToolIntent = routeToolIntent(
        (_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : message);
      _routedRequiredReadTool = requiredReadToolForMessage(
        (_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : message,
        _routedToolIntent);
      _routedRequiresLiveTool = !!_routedRequiredReadTool;
      body.tools = toolsForIntent(body.tools, _routedToolIntent);
      if (_routedRequiredReadTool) {
        body.tools = body.tools.filter(function (tool) {
          return tool && tool.function && tool.function.name === _routedRequiredReadTool;
        });
      }
      // ⬡B:core.tool_loop:WONDER:surface_tools_always_on_the_table:20260721⬡ Her surface tools
      // (set_background, update_screen) ride along on every conversational turn so she can act on a
      // surface request in ANY phrasing -- "switch me to the lake", no keyword, no cue -- without a
      // routing regex having to catch it first. This is availability, not a decision: she still
      // reasons about whether to use them (planToolUse gates it, tool_choice stays auto), and it is
      // her call, never a force. Skipped only when a single read tool is required for the turn.
      if (!_routedRequiredReadTool && Array.isArray(_turnToolDefinitions)) {
        var _haveSurfaceTool = {};
        (Array.isArray(body.tools) ? body.tools : []).forEach(function (t) {
          if (t && t.function) _haveSurfaceTool[t.function.name] = true; });
        _turnToolDefinitions.forEach(function (t) {
          if (t && t.function && (t.function.name === 'set_background' || t.function.name === 'update_screen')
              && !_haveSurfaceTool[t.function.name]) {
            if (!Array.isArray(body.tools)) body.tools = [];
            body.tools.push(t);
          }
        });
      }
      _stampStep('tool_intent_route', _routedToolIntent + ':visible=' + body.tools.length);
      if (!body.tools.length) delete body.tools;
    }
    // CLAIR_reach R4E: at catalog scale, bound the routed set to the few tools
    // whose USE WHEN context matches this exact turn, and expose none on weak
    // relevance. Inert at or below the scale threshold, so today's small routed
    // sets pass through unchanged. Cold code ranks and fetches; the model still
    // chooses among the returned subset.
    if (iter === 1 && Array.isArray(body.tools) && body.tools.length &&
        !_structuredReachPolicy && !_reachIncidentIntake && !_routedRequiresLiveTool &&
        String(channel || '').toLowerCase() !== 'voice' &&
        !(identity && identity.outbound_finalize === true)) {
      var _ragBefore = body.tools.length;
      body.tools = toolRetrieval.retrieveToolSubset(
        (_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : message, body.tools);
      if (body.tools.length !== _ragBefore) {
        _stampStep('tool_rag_bounded', _ragBefore + '->' + body.tools.length);
      }
      if (!body.tools.length) delete body.tools;
    }
    if (Array.isArray(body.tools) && body.tools.length) {
      body.messages = body.messages.concat([{ role:'system', content:NO_TOOL_BLESSING }]);
    }
    // CLAIR_reach R4C: first decide whether this exact turn needs any tool.
    // Voice stays on its latency-safe intent path; structured reach and finalizer
    // lanes already carry bounded contracts and never enter general selection.
    if (iter === 1 && Array.isArray(body.tools) && body.tools.length &&
        !_structuredReachPolicy && !_reachIncidentIntake &&
        !_routedRequiresLiveTool &&
        String(channel || '').toLowerCase() !== 'voice' &&
        !(identity && identity.outbound_finalize === true)) {
      var _toolPlan = await planToolUse(
        (_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : message,
        body.tools);
      _stampStep('tool_plan_first_pass', _toolPlan.decision +
        (_toolPlan.tool ? ':' + _toolPlan.tool : '') + ':' + String(_toolPlan.reason || '').slice(0,120));
      if (_toolPlan.decision === 'NO_TOOL') {
        delete body.tools;
        delete body.tool_choice;
        body.messages = body.messages.concat([{ role:'system',
          content:'The first-pass plan decided NO TOOL for this exact message. Answer it directly from the conversation and reasoning. Do not call or describe a tool.' }]);
      } else if (_toolPlan.decision === 'TOOL') {
        body.tool_choice = 'auto';
        body.messages = body.messages.concat([{ role:'system',
          content:'The first-pass plan found that this message needs ' + _toolPlan.tool +
            '. Use that plan as evidence, while keeping tool choice automatic and never substituting an unrelated tool.' }]);
      }
    }
    // ⬡B:core.tool_loop:FIX:tool_choice_never_set_defaults_to_skippable:20260705⬡
    // Real, live incident: Brandon asked directly "who is the founder value, now from env, show me
    // the original message" over text -- the single clearest possible
    // trigger for find_in_brain -- and the turn answered in 4.7s with
    // toolsUsed:[], fabricating "HAM UID stands for Human-Assisted Messaging"
    // out of nothing. The doctrine already says SEARCH FIRST, ALWAYS as a
    // mandatory prompt instruction (fcw.builder.js), but tool_choice itself
    // was never set, which leaves the API default of "auto" -- the model can
    // always skip an attached tool no matter how firm the prose around it
    // reads. This does not invent a new rule; it enforces the one already on
    // record with the actual mechanism built for it. Forced only on the
    // first iteration of a fresh turn (iter===1) -- not iter<=3 -- so a
    // legitimate multi-step exchange is never locked into calling a tool a
    // second or third time it does not need. A plain "hey" still gets a real
    // answer: find_in_brain is a safe no-op on a genuinely contentless query,
    // and synthesis already runs after, so a forced-but-empty lookup costs a
    // beat, not a wrong turn.
    // A REACH policy cycle is a bounded judgment request, not a general chat
    // turn. Its caller already supplied the verified facts and exact JSON
    // contract. Letting the generic first-turn forcing below attach or require
    // find_in_brain can replace that bounded decision with unrelated memory and
    // adds a second model turn before the council. The policy still traverses
    // the full outbound council after this draft; only generic tools are absent.
    if (_structuredReachPolicy || _reachIncidentIntake) {
      delete body.tools;
      delete body.tool_choice;
      if (_structuredReachPolicy) {
        var _primaryPolicyFormat=_structuredReachResponseFormat();
        if(_primaryPolicyFormat)body.response_format=_primaryPolicyFormat;
      }
    }
    else if (iter===1) {
      // \u2b21B:core.tool_loop:FIX:forced_lookup_derailing_screen_commands_20260709\u2b21
      // Founder-caught live, third layer of the same night's incident: even with the
      // extraction leak and the statelessness both fixed, "change background to
      // something more of a vibe" produced a totally unrelated reply about a coding
      // roadmap. Root cause, traced directly: find_in_brain is forced on EVERY first
      // turn, including pure UI commands that have nothing to look up. The forced call
      // still runs, returns whatever is most recent/important in the brain regardless
      // of relevance, and the model then drifts into discussing THAT instead of doing
      // the actual thing it was asked to do. The forcing exists to stop identity
      // hallucination on text/email, where a wrong answer can get acted on -- real
      // stakes. On a live screen, mistakes are cheap, instantly followed up on, and
      // already covered by a separate safety net (the honesty-fallback a few dozen
      // lines below, which explicitly tells her to admit uncertainty rather than
      // fabricate). So: skip the forced grounding only when a live screen is open,
      // and let her decide naturally whether to call find_in_brain, update_screen, or
      // just answer -- the mandatory lookup on text/email is completely unchanged.
      var _liveNow = false;
      try { _liveNow = require('./stream/screen.awareness.js').hasLiveScreen(hamUid); } catch (eLn) {}
      // ⬡B:core.tool.loop:FIX:live_screen_suppressed_lookup_gaslit_founder_questions:20260713⬡
      // Founder-caught live 8am: on a VOICE call (which registers as a live screen) he
      // asked "what's the fix" and got "I don't have it, you point me to the code" -- six
      // no_tool_turn diagnostics, zero tools fired. Root cause: the live-screen skip below
      // turned OFF the forced find_in_brain for EVERY live turn, including real questions,
      // so she answered from nothing and it read as gaslighting. The skip exists for a real
      // reason -- forcing a lookup on a UI command ("change background to a vibe") pulled
      // unrelated brain content and derailed. So the split is by intent, cold, no LLM: a
      // real information question still forces the read even on a live screen; a screen/UI
      // manipulation command stays unforced so it never derails. Text/email path unchanged.
      // B:core.tool_loop:FIX:hallucinated_meeting_911_20260714 Founder caught her
      // CONFIDENTLY INVENTING a fake meeting ("Mark Gerzon at 2:30", "7 assets",
      // "ten BDIF emails") that do not exist anywhere in his real calendar or inbox.
      // ROOT CAUSE: the info-question detector was anchored to the START of the
      // message (^who|what|...), so "Hey. What's going on today?" never matched --
      // the greeting defeated the anchor -- find_in_brain was never forced, and the
      // model free-talked a plausible-sounding lie instead of reading real data.
      // Fixed to match ANYWHERE in the message, not just the start. AND: any question
      // that could be answered by his real calendar (today/schedule/meeting/free/
      // busy/calendar) now forces calendar_read specifically -- never find_in_brain
      // alone -- so a day-shaped question can only ever be answered from real events.
      // ⬡B:core.tool_loop:FIX:intent_detection_uses_raw_words_not_fusion_wrapped_message:20260719⬡
      // NUCLEAR 911 (founder caught it): the air/portal door answered "which chat
      // lanes are working on your build" with the CALENDAR. Root cause: the portal
      // path (slowPath) enriches the message with a big world-context + live-facts
      // prefix before runPAI, so `message` here begins with calendar/day facts. Intent
      // detection was testing that wrapped `message`, so the day-question regex matched
      // the injected context and the turn flipped to a calendar answer, burying the
      // real question. The raw user words are already available as _exactUserMessage
      // (slowPath sets identity.user_message = the original input), and every council
      // check already trusts those bytes. So intent detection must read the RAW words
      // on EVERY channel, not just voice. This makes the lane/coding/day nudges fire on
      // what the person actually asked, not on the fusion prefix.
      var _mSt = String((_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : (message || '')).trim();
      var _looksLikeInfoQ = /\?\s*$/.test(_mSt)
        || /\b(who|what|whats|what's|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should|tell me|show me|remind me|give me|status|update on|what's going on|whats going on|what is going on)\b/i.test(_mSt);
      var _isScreenCmd = /\b(background|wallpaper|layout|theme|vibe|colou?r|font|bigger|smaller|resize|move it|make it (a|more)|show me on|put .*(on the)? (screen|left|right|cent(er|re)))\b/i.test(_mSt);
      var _isDayQ = dayQuestionIntent(_mSt, _isScreenCmd);
      // ⬡B:core.tool_loop:WIRE:lane_board_intent_hint_not_a_rail:20260719⬡ A lane
      // question is about the BUILD chats/lanes, not the day. HINT in the same shape as
      // _isDayQ (she keeps ALL tools and still chooses), just puts read_lane_board top of
      // mind so she does not fall through to the calendar.
      var _isLaneBoardQ = /\b(lane|lanes|which chat|what chat|chats|other chat|acl name|working on (your|the) build|who is building|who's building|building your|lane board|coordinat)\b/i.test(_mSt) && !_isDayQ && !_isScreenCmd;
      // ⬡B:core.tool_loop:WIRE:coding_build_nudge_she_uses_her_coding_team:20260719⬡
      // Founder caught her NOT using her coding tools: asked to consult MACE/CODA and run
      // the coding process, she fell through to find_in_brain and answered with the
      // calendar. She holds consult_mace (CODA lead), run_cookoff, run_wonder_games,
      // assemble_bcw but never picked them. A build/code/consult request nudges the
      // coding lead. HINT not a rail, she keeps all tools. Named machinery (MACE, CODA,
      // cook-off, wonder games, BCW) or a plain build/code/ship ask routes here.
      var _isCodingBuildQ = /\b(mace|coda|cook.?off|wonder game|assemble.?bcw|\bbcw\b|build (a|an|the|me|my|out|this)|code (a|an|the|this|up)|write (the )?code|ship (a|an|the|it|this)|implement|wire up|refactor|new agent|coding (process|team|department))\b/i.test(_mSt) && !_isDayQ && !_isScreenCmd && !_isLaneBoardQ;
      // ⬡B:core.tool_loop:FIX:public_knowledge_question_answers_from_knowledge_not_a_personal_lookup:20260718⬡
      // FOUNDER 911, receipts 5/5: silence was broken but she answered a plain PUBLIC
      // question ("does the iPad Pro 10.5 have a Magic Keyboard") by force-reading his
      // PERSONAL brain, finding nothing (his brain holds no iPad specs), and reporting
      // the miss ("I don't have access to product databases"). A public-world question
      // must never be forced through a personal-brain lookup. Cold intent split, no LLM,
      // same shape as the screen-command and day-question splits already here: a
      // question that references HIM, his orgs, his data, his people, his money, his
      // history, or his calendar stays a personal lookup and still forces find_in_brain;
      // a question with none of those personal anchors is public knowledge and is
      // answered from the model's own knowledge, with the full council still guarding
      // fabrication. This does not touch action requests or day questions above.
      var _hasPersonalAnchor = /\b(my|mine|our|your|his|her|their|i|me|we|us|brandon|envolve|a'?nu|a'?new|aba|bdif|gmg|mediators|mh action|globalmajority|dawkins|budget|invoice|ledger|grant|funder|donor|board|client|calendar|schedule|meeting|reminder|inbox|email|draft|task|roadmap|deploy|repo|memory|brain|bead|the (build|system|platform|project|book|deck|pipeline))\b/i.test(_mSt);
      var _looksPublicKnowledgeQ = _looksLikeInfoQ && !_isScreenCmd && !_isDayQ && !_hasPersonalAnchor;
      // ⬡B:core.tool_loop:FIX:load_all_tools_let_her_reason_do_not_railroad_one_tool:20260719⬡
      // FOUNDER DOCTRINE 20260719: forcing tool_choice onto ONE tool strips her
      // reasoning -- she answered a calendar question to a planning prompt because a
      // lookup was strapped on. Like the "all tools always available" setting, she
      // should hold ALL her tools and CHOOSE. So tool_choice stays 'auto' (all tools
      // on the table) and the intent is delivered as a STRONG PROMPT NUDGE instead of
      // a hard rail. The data-reader direct-execute safety net downstream still catches
      // a genuine refusal, so a real day/lookup question can never answer from nothing.
      var _toolNudge = null;
      if (_roadmapActivationNeeded) _toolNudge='activate_roadmap_task';
      else if (_isLaneBoardQ) _toolNudge='read_lane_board';
      else if (_isCodingBuildQ) _toolNudge='consult_mace';
      else if (_nashNeeded) { _toolNudge='nash_sports'; _nashNeeded=false; }
      else if (voiceCallContextSatisfiesTurn(channel, hamUid, _exactUserMessage, identity)) {
        // The signed call handoff already supplies the exact answer source for a
        // call-purpose question. Keep the full PAI + council, but do not force an
        // unrelated generic Memory Bank read in front of that bounded evidence.
        delete body.tools;
      }
      else if (_isDayQ) _toolNudge='calendar_read';
      else if (voiceConversationalNoGenericLookup(channel, hamUid, _exactUserMessage, identity)) {
        // Pure small talk needs A'NU's judgment, not a generic Memory Bank read.
        // Removing the irrelevant tool schema also keeps the one required model
        // draft inside a phone-conversation budget. This is not an action lane;
        // mixed requests such as "why, and email me" do not match this predicate.
        delete body.tools;
      }
      else if (_looksPublicKnowledgeQ &&
          (!_routedToolIntent || _routedToolIntent === 'general')) {
        // Public-world question with no personal anchor: answer from the model's own
        // knowledge. Receipts showed that merely UNFORCING find_in_brain was not
        // enough -- with the personal-tool schema still in front of her she reached
        // for read_own_code / find_in_brain anyway and deflected ("I don't have
        // access to product databases"). So the personal tool schema is REMOVED for
        // this turn: nothing to reach for, she answers from her own knowledge. The
        // full council still guards fabrication. Personal and day questions above
        // keep their tools untouched.
        delete body.tools;
        delete body.tool_choice;
      }
      else if ((!_routedToolIntent || _routedToolIntent === 'general') &&
          (!_liveNow || (_looksLikeInfoQ && !_isScreenCmd))) _toolNudge='find_in_brain';
      // Deliver the intent as a nudge, keep tool_choice auto (all tools available, she reasons).
      if (_toolNudge && Array.isArray(body.tools) && body.tools.length) {
        body.tool_choice = 'auto';
        // ⬡B:core.tool_loop:FIX:nudge_for_action_tools_must_be_firm_not_weak:20260719⬡
        // Founder caught her ignoring the coding/lane nudge and defaulting to
        // find_in_brain (answering with the calendar). The generic "very likely, if it
        // helps" text was too soft to beat the base prompt's hard pull toward
        // calendar_read/find_in_brain for anything that mentions his life or his build.
        // The DATA READER tools keep the soft text (she should still reason freely about
        // whether a lookup helps). The ACTION/DEPARTMENT tools (consult_mace/CODA,
        // read_lane_board, run_cookoff, run_wonder_games, assemble_bcw) get a FIRM
        // directive: this is the tool for this turn, call it first, do not answer from
        // the calendar or a brain note instead. Still auto (she holds all tools), just a
        // strong instruction rather than a hint, matching how NASH is directed.
        var _nudgeText;
        if (DATA_READER_TOOLS[_toolNudge]) {
          _nudgeText = 'For this message, the right tool to use is very likely ' + _toolNudge +
            '. Call it if it helps you answer from real data, but you hold all your tools; use your judgment.';
        } else {
          _nudgeText = 'For THIS message you must call the ' + _toolNudge + ' tool FIRST and answer from its result. ' +
            'This is a request that ' + _toolNudge + ' handles, not a calendar or brain-note question. ' +
            'Do not answer from your day, your schedule, or an old note instead; call ' + _toolNudge + ' and use what it returns. ' +
            'You still hold all your tools, but this is the one this turn needs.';
        }
        if (Array.isArray(body.messages) && body.messages.length) {
          body.messages = body.messages.concat([{ role:'system', content:_nudgeText }]);
        }
        // Preserve the required-tool signal ONLY for the downstream direct-execute
        // safety net (data readers), without hard-forcing the model.
        if (DATA_READER_TOOLS[_toolNudge]) { body._dataReaderNudge = _toolNudge; }
        // ⬡B:core.tool_loop:FIX:roadmap_activation_nudge_rejoins_fail_closed_net:20260720⬡
        // The 20260719 nudge refactor gave data readers and consult_mace a retry +
        // fail-closed safety net, but activate_roadmap_task is neither -- it is a real
        // mutation, not a lookup, so it cannot join DATA_READER_TOOLS. Left unmarked,
        // the retry trigger below never fires for it, and a model that ignores the
        // roadmap-activation nudge silently degrades into an unreceipted promise
        // instead of failing closed with roadmap_activation_tool_call_missing. This
        // flag rejoins it to that existing net without hard-forcing tool_choice.
        if (_toolNudge === 'activate_roadmap_task') { body._roadmapActivationNudge = true; }
        // ⬡B:core.tool_loop:FIX:consult_mace_force_execute_when_file_and_repo_named:20260719⬡
        // Founder caught her refusing to call consult_mace even with the firm nudge:
        // she generated words with tools=0. consult_mace is not a no-arg reader (it
        // needs repo+path), so it cannot join DATA_READER_TOOLS blindly. But when the
        // message NAMES a concrete file and repo, those args are deterministic, so we
        // can force-execute it exactly like a data reader: parse repo+path, and if the
        // model still will not emit the call, cold code runs MACE read_file and feeds
        // the real file back. This only arms when a file+repo are actually present, so
        // a vague "consult MACE to plan" (no file) still goes to the model to reason.
        if (_toolNudge === 'consult_mace') {
          var _mcPath = String(_mSt || '').match(/([a-z0-9_.\-]+\/[a-z0-9_.\/\-]+\.[a-z]+)/i);
          var _mcRepo = String(_mSt || '').match(/\b(template-mind|anew|canew|eanew|ababase|aba-shared)\b/i);
          if (_mcPath && _mcRepo) {
            body._codingReadNudge = { repo: _mcRepo[1], path: _mcPath[1], action: 'read_file' };
          }
        }
      }
      // ⬡B:core.tool_loop:WONDER:generative_ui_is_a_wonder_she_decides_cold_code_renders:20260721⬡
      // Founder law, direct: MAKE ALL THE GENERATIVE UI A WONDER, NOT COLD CODE. The prior version
      // of this block was cold code deciding a semantic thing -- a regex enumerating scene words to
      // decide "this is a background command", then FORCING tool_choice onto one tool, which is the
      // exact railroad his own doctrine forbids (load_all_tools_let_her_reason_do_not_railroad_one_tool,
      // 20260719: forcing tool_choice onto ONE tool strips her reasoning). So the force is gone. The
      // wonder shape: her surface tools are already on the table (routeToolIntent put them there), she
      // is the one who decides to change the surface and which scene, and cold code only renders and
      // reads back. This block does two non-deciding things: a FIRM NUDGE (her own mechanism, same as
      // the coding/lane nudges, tool_choice stays auto so she still reasons) so she reliably reaches
      // for the surface tool when they asked for a surface change, and the warm-confirmation directive
      // pushed into msgs (persistent, so it reaches the compose turn) so she confirms from what she
      // actually did, in her voice, reading back the real result -- never a promise, never a flat label.
      if (_routedToolIntent === 'screen' && Array.isArray(body.tools) && body.tools.some(function (t) {
            return t && t.function && (t.function.name === 'set_background' || t.function.name === 'update_screen'); })) {
        msgs.push({ role: 'system', content:
          'This turn is about their surface -- their background, their screen, what they see. You hold your surface tools (set_background for the standing background, update_screen for the live glass). If they asked you to change what is behind everything or on their screen, actually do it this turn by calling the right tool; do not say you will get to it or that it is on the way, and do not answer as if you did something you did not call. Then confirm from what actually happened, reading back the real result, and speak it as A’NU -- the one who already handled it, warm, in full natural sentences the way a butler who knows them would, letting something you genuinely know about them show if it fits, never a flat status label. You still hold all your judgment; if it is genuinely not a surface change, do not force one.' });
        _stampStep('surface_wonder_nudge', 'screen_tools_available_she_decides');
      }
    }
    if (_routedRequiresLiveTool && Array.isArray(body.tools) && body.tools.length) {
      var _liveReaderName = _routedRequiredReadTool;
      var _liveReaderArgs = DATA_READER_TOOLS[_liveReaderName](
        (_exactUserMessage && _exactUserMessage.trim()) ? _exactUserMessage : message);
      if (_liveReaderArgs && Object.keys(_liveReaderArgs).every(function (key) {
        return _liveReaderArgs[key] !== '' && _liveReaderArgs[key] !== null;
      })) {
        body._dataReaderNudge = _liveReaderName;
      }
      body.tool_choice = 'required';
      body.messages = body.messages.concat([{ role:'system',
        content:'This exact request asks for owned or current data. Call the one bounded read-only tool provided and answer from its result; do not claim the capability is unavailable.' }]);
      _stampStep('tool_intent_live_read_required', _routedToolIntent);
    }
    // \u2b21B:core.tool_loop:WIRE:ornith_opt_in_no_tools_only:20260703\u2b21
    // Founder request: try Ornith for A'NU's real conversational turns too, not
    // just the coding department. Off by default (TRY_ORNITH_CONVERSATIONAL must
    // be explicitly set) -- this changes what every live text, call, and email
    // reply runs on, and that default is not mine to flip silently. Real limit
    // found while wiring this, stated plainly rather than hidden: the RunPod
    // Ollama worker just attached to the Ornith endpoint serves plain chat, not
    // OpenAI-style tool_calls -- Ornith's own model card supports tool calling,
    // but only through vLLM's tool-call parser, which is a different worker setup
    // than what is deployed right now. So this only engages on a turn with no
    // tools attached (body.tools is unset here); any turn where TOOLS were
    // actually passed above always runs on Groq, unconditionally, so find_in_brain
    // and every other tool call stay exactly as reliable as they are today. Any
    // failure or timeout falls straight through to the existing Groq call below --
    // this can degrade to current behavior, never below it.
    var r=null;
    if (iter === 1 && _roadmapActivationEnvelope && _roadmapActivationEnvelope.spec &&
        _effectRuntime.codaActivationApproved === true) {
      // The outside coding relay supplied the exact typed command after asking
      // CODA to lead. Do not ask a provider to translate those same bytes into
      // a tool call it may omit. The mutation still queues in executeTool and
      // cannot release until the full outbound council commits.
      r = { choices:[{ message:{ role:'assistant', content:null, tool_calls:[{
        id:'roadmap_activation_' + Date.now(), type:'function',
        function:{ name:'activate_roadmap_task',
          arguments:JSON.stringify(_roadmapActivationEnvelope.spec) }
      }] } }] };
    }
    if (!_structuredReachPolicy&&process.env.TRY_ORNITH_CONVERSATIONAL === 'true' && !body.tools) {
      try {
        var ORN = process.env.ORNITH_URL, ORK = process.env.RUNPOD_API_KEY;
        if (ORN && ORK) {
          var ornResp = await fetch(ORN.replace(/\/$/,'') + '/runsync', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + ORK, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { method_name: 'chat', input: {
              messages: [{ role:'system', content:outputGuard.englishSystem('Answer the user directly.') }].concat(msgs),
              options: outputGuard.ornithSampling(tokenCapFor(channel), true) } } }),
            signal:_modelRequestSignal()
          }).then(function(x){ return x.json(); }).catch(function(e){ return { error: e.message }; });
          var ornText = ornResp && ornResp.output && (ornResp.output.message && ornResp.output.message.content || ornResp.output.response);
          if (ornResp && ornResp.status === 'COMPLETED' && ornText && !outputGuard.containsCjk(ornText)) {
            r = { choices: [{ message: { role: 'assistant', content: ornText } }], _provider: 'ornith' };
          }
        }
      } catch (eOrn) { /* fall through past the banned Groq rung to Together below */ }
    }
    // ⬡B:core.tool_loop:FIX:banned_groq_rung_falls_through_to_together:20260718⬡
    // Article A6: Groq is a PERMA-BANNED provider. It sat as the middle rung
    // between Ornith (RunPod, primary) and Together (GLM-5.2). Ornith already ran
    // above; if it produced nothing, we must NOT call the banned Groq host -- we
    // fall straight through to the Together (GLM) rung below, which is an approved
    // provider on the one ladder. The old fetch(GB) primary call is removed so no
    // turn is ever pinned to a banned brain. r stays null here on purpose so the
    // Together block below picks it up.
    if (!r) { global._paiLastError = 'groq_rung_skipped_banned_provider'; }
    if (!r||r.error||!r.choices){
      var TK=process.env.TOGETHER_API_KEY;
      if(TK){var togetherBody=primaryProviderBody(body,msgs,
          process.env.TOGETHER_MODEL||'zai-org/GLM-5.2');
        // ⬡B:core.tool_loop:FIX:glm_reasoning_burn_returns_empty_content:20260718⬡
        togetherBody.chat_template_kwargs={enable_thinking:false};
        if(_structuredReachPolicy){
          var _togetherPolicyFormat=_structuredReachResponseFormat();
          if(_togetherPolicyFormat)togetherBody.response_format=_togetherPolicyFormat;
        }
        r=await fetch('https://api.together.xyz/v1/chat/completions',{method:'POST',
        headers:{Authorization:'Bearer '+TK,'Content-Type':'application/json'},
        body:JSON.stringify(togetherBody),
        signal:_modelRequestSignal()
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      r=_structuredProviderResult(r);
      if(r&&r.choices&&r.choices.length){
        var _tMsg=(r.choices[0]&&r.choices[0].message)||{};
        if(!_tMsg.content&&!((_tMsg.tool_calls||[]).length)){
          global._paiLastError='together_empty_content_reasoning_burn';r=null;
        } else { global._paiLastError=null; }
      }
      else if(r&&r.error){global._paiLastError='together:'+JSON.stringify(r.error).slice(0,120);}
      else if(r&&!r.choices){global._paiLastError='together_no_choices:'+JSON.stringify(r).slice(0,150);}
      }else{global._paiLastError='together_no_key';}
    }
    // ⬡B:core.tool_loop:FIX:openrouter_third_tier_20260713⬡
    // Founder-caught live: Together returned "Credit limit exceeded" on a real
    // production call, and there was nothing after it -- ans='' and the whole
    // cycle died, surfacing as ok:false/no_answer at the reach channel. Real,
    // observed failure mode, not hypothetical. OpenRouter is already a standing
    // key on this service (doctrine.model_map, un-banned by founder's own word
    // 20260709), so it is the correct third tier rather than a new dependency.
    // No tools attached here (matches the Together tier above, which is also
    // tool-free) since this only ever engages after tool-capable Groq has
    // already failed on this turn. Same fail-soft discipline: any error here
    // just falls through to the existing empty-answer path below, unchanged.
    if (!r||r.error||!r.choices){
      var ORK=process.env.OPENROUTER_API_KEY;
      if(ORK){var openRouterBody=primaryProviderBody(body,msgs,
          process.env.OPENROUTER_MODEL||'qwen/qwen3-235b-a22b');
        if(_structuredReachPolicy){
          var _routerPolicyFormat=_structuredReachResponseFormat();
          if(_routerPolicyFormat)openRouterBody.response_format=_routerPolicyFormat;
          openRouterBody.provider={require_parameters:true};
        }
        r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
        headers:{Authorization:'Bearer '+ORK,'Content-Type':'application/json'},
        body:JSON.stringify(openRouterBody),
        signal:_modelRequestSignal()
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      r=_structuredProviderResult(r);
      if(r&&r.choices&&r.choices.length){
        var _oMsg=(r.choices[0]&&r.choices[0].message)||{};
        if(!_oMsg.content&&!((_oMsg.tool_calls||[]).length)){
          global._paiLastError='openrouter_empty_content_reasoning_burn';r=null;
        } else { global._paiLastError=null; }
      }
      else if(r&&r.error){global._paiLastError='openrouter:'+JSON.stringify(r.error).slice(0,120);}
      else if(r&&!r.choices){global._paiLastError='openrouter_no_choices:'+JSON.stringify(r).slice(0,150);}
      }else{global._paiLastError='openrouter_no_key';}
    }
    if (await _turnCancelled(true)) return _turnCancelledResult('after_model');
    // ⬡B:core.tool_loop:WIRE:the_one_ladder_is_the_last_rung_never_silence:20260718⬡
    if (!r||r.error||!r.choices){
      try{
        var _lad=require('./model.ladder.js');
        var _hist=openAiCompatibleHistory(msgs);
        var _sys=(_hist[0]&&_hist[0].role==='system')?String(_hist[0].content||''):'';
        var _usr=_hist.filter(function(m){return m.role!=='system';})
          .map(function(m){return String(m.role||'user').toUpperCase()+': '+String(m.content||'');})
          .join('\n\n');
        var _lr=await _lad.deliberate(_sys,_usr,{max_tokens:tokenCapFor(channel),
          temperature:_structuredReachPolicy?0:0.3,timeout:60000,
          json:_structuredReachPolicy?true:false,signal:_modelRequestSignal()});
        if(_lr&&_lr.content){
          r={choices:[{message:{role:'assistant',content:_lr.content}}],_provider:'ladder:'+(_lr.via||'')};
          global._paiLastError=null;
        } else if(!global._paiLastError){ global._paiLastError='ladder_no_content'; }
      }catch(eLad){ global._paiLastError='ladder:'+String(eLad&&eLad.message||eLad).slice(0,120); }
    }
    try{
      var _rc=(r&&r.choices&&r.choices[0])||null;
      _stampStep('model_rung_result',
        String((r&&r._provider)||'openai_compat')+
        ' commit='+String(process.env.RENDER_GIT_COMMIT||'?').slice(0,8)+
        ' choices='+((r&&r.choices&&r.choices.length)||0)+
        ' content_len='+String(((_rc&&_rc.message&&_rc.message.content)||'')).length+
        ' tool_calls='+(((_rc&&_rc.message&&_rc.message.tool_calls)||[]).length)+
        ' err='+String((r&&r.error)?JSON.stringify(r.error).slice(0,80):(global._paiLastError||'none')).slice(0,100)+
        ' preview='+JSON.stringify(String(((_rc&&_rc.message&&_rc.message.content)||'')).slice(0,110)));
    }catch(_eRR){}
    if (!r||r.error||!r.choices){
      ans=_structuredReachPolicy?'{}':'';
      break;
    }
    var ch=r.choices[0],msg=ch.message;
    // R3B: vLLM qwen3_xml can return the canonical XML in content while marking
    // finish_reason=tool_calls. Recover only tools declared on this exact request;
    // every other text shape remains under the existing non-execution rules.
    if (msg && !((msg.tool_calls || []).length)) {
      var _qwen3Calls = outputGuard.recoverQwen3XmlToolCalls(
        msg.content, ch.finish_reason, body && body.tools);
      if (_qwen3Calls) {
        msg = ch.message = { role:'assistant', content:null, tool_calls:_qwen3Calls };
        _stampStep('qwen3_xml_tool_calls_recovered', _qwen3Calls.map(function (call) {
          return call.function.name;
        }).join(','));
      }
    }
    // ⬡B:core.tool_loop:FIX:continuation_stitch_kills_the_guillotine:20260717⬡
    // Founder's question, answered in code: why a cap at all? Because a provider requires
    // a number and a runaway generation burns money forever without one. The cap is a
    // circuit breaker, never a length policy. So when a real answer hits the ceiling
    // mid-thought (finish_reason 'length'), cold code continues the generation and
    // stitches, up to three times, instead of shipping a cut sentence. A genuine runaway
    // still dies at the breaker; a genuine answer always finishes.
    if(!_structuredReachPolicy&&msg&&!((msg.tool_calls||[]).length)&&msg.content){
      var _stitchTries=0;
      while(ch.finish_reason==='length'&&_stitchTries<3){
        _stitchTries++;
        var _stitchMsgs=openAiCompatibleHistory(msgs).concat([
          {role:'assistant',content:String(msg.content||'')},
          {role:'user',content:'Your previous message was cut off by a length limit mid-generation. Continue it exactly where it stopped, starting with the very next word. No preamble, no apology, no repetition of anything already written.'}]);
        var _stitchR=await fetch(GB,{method:'POST',
          headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
          body:JSON.stringify({model:model,messages:_stitchMsgs,max_tokens:tokenCapFor(channel),temperature:0.1}),
          signal:_modelRequestSignal()
        }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
        var _stitchCh=_stitchR&&_stitchR.choices&&_stitchR.choices[0];
        var _stitchTxt=_stitchCh&&_stitchCh.message&&_stitchCh.message.content;
        if(!_stitchTxt)break;
        msg.content=String(msg.content||'')+_stitchTxt;
        ch.finish_reason=_stitchCh.finish_reason;
      }
    }
    if(_structuredReachPolicy){
      // Structured policy is a judgment-only lane. It exits before generic
      // tool-call salvage or execution, so an unsolicited provider tool call
      // can never turn a policy draft into a read, write, or external effect.
      var _structuredDraft=_canonicalStructuredReachPolicy(msg&&msg.content);
      ans=_structuredDraft.ok?_structuredDraft.text:'{}';
      break;
    }
    if (msg && !((msg.tool_calls || []).length) && outputGuard.containsCjk(msg.content) &&
        !outputGuard.explicitNonEnglishRequest(_exactUserMessage || message)) {
      try {
        var _englishRewrite = await require('./model.ladder.js').deliberate(
          'Rewrite the supplied answer in clear English only. Preserve its facts and intent. Return only the rewritten answer.',
          String(msg.content || ''), { max_tokens:tokenCapFor(channel), temperature:0.2, timeout:12000, noGuard:true });
        msg.content = _englishRewrite && _englishRewrite.content || '';
        _stampStep('cjk_output_regenerated', msg.content ? 'english' : 'failed_closed');
      } catch (_eEnglish) {
        msg.content = '';
        _stampStep('cjk_output_regenerated', 'failed_closed');
      }
    }
    try{_stampStep('corridor_a_post_stitch','content_len='+String(msg&&msg.content||'').length+' has_tc_tag='+(String(msg&&msg.content||'').indexOf('<tool_call>')!==-1)+' has_fn_tag='+(String(msg&&msg.content||'').indexOf('<function')!==-1)+' finish='+String(ch&&ch.finish_reason||'?'));}catch(_eCA){}
    // ⬡B:core.tool_loop:FIX:safe_tool_text_salvage_20260710⬡
    // Founder 1B gate failure, exact receipt from her own trace: cycle_end contained
    // <function(update_screen){"cards":[... -- Groq emitted the tool call as plain
    // TEXT instead of a real tool_calls entry, the documented platform text-mode
    // failure, retriggered here by the richer nested card schema. The standing
    // reject-unexecuted-toolcall-text rule is correct and stays: it exists because a
    // real email was once actually sent from believed-but-unexecuted text. But for
    // tools that only render to the glass or only read, refusing the salvage turns a
    // platform hiccup into a dead turn. So: a STRICT allowlist salvage. If content
    // matches the function-text shape and the name is render-only or read-only, the
    // text becomes a real synthesized tool_call and runs through the exact same
    // executeTool path, stamps and all. notify_ham, write_to_brain, fix_file_in_github,
    // trigger_deploy, create_reminder, request_new_capability are NEVER salvaged;
    // anything with outbound or persistent side effects stays behind the original rule.
    // \u2b21B:core.tool_loop:FIX:qwen_tool_call_dialect_20260711\u2b21 Founder screenshot:
    // raw <tool_call>update_screen(chart={...}) leaked into her chat as TEXT and the
    // chart never rendered. Qwen 3.6 emits a THIRD dialect: <tool_call> tags wrapping
    // kwarg-style calls (name(key={json}, key2=value)). Normalized here into the same
    // <function shape the salvage already speaks, and regardless of salvage success
    // the <tool_call> block is ALWAYS stripped from visible content -- tool plumbing
    // never renders as chat text again.
    if (typeof msg.content === 'string' && msg.content.indexOf('<tool_call>') !== -1) {
      // ⬡B:core.tool_loop:FIX:glm_json_tool_call_dialect:20260718⬡
      var jtc = msg.content.match(/<tool_call>\s*(\{[\s\S]*?\})\s*(<\/tool_call>|$)/);
      if (jtc) {
        try {
          var jparsed = JSON.parse(jtc[1]);
          var jname = jparsed && (jparsed.name || (jparsed.function && jparsed.function.name));
          var jargs = jparsed && (jparsed.arguments || jparsed.parameters ||
            (jparsed.function && jparsed.function.arguments)) || {};
          if (typeof jargs === 'string') { try { jargs = JSON.parse(jargs); } catch (eJa) { jargs = {}; } }
          if (jname && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(jname))) {
            var jhuman = msg.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, ' ')
              .replace(/\s+/g, ' ').trim();
            msg.content = (jhuman ? jhuman + ' ' : '') + '<function=' + jname + '>' + JSON.stringify(jargs);
          }
        } catch (eJtc) { /* not JSON; kwarg matcher below */ }
      }
      var tcm = msg.content.indexOf('<tool_call>') !== -1 &&
        msg.content.match(/<tool_call>\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)(\)\s*<\/tool_call>|\)\s*$|$)/);
      if (tcm) {
        var kwSrc = tcm[2] || '';
        var argsObj = {};
        var ki = 0;
        while (ki < kwSrc.length) {
          var km = kwSrc.slice(ki).match(/^[\s,]*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/);
          if (!km) break;
          var vStart = ki + km[0].length, vEnd = vStart, depth2 = 0, inStr = false;
          for (var ci = vStart; ci < kwSrc.length; ci++) {
            var ch = kwSrc[ci];
            if (inStr) { if (ch === '"' && kwSrc[ci - 1] !== '\\') inStr = false; }
            else if (ch === '"') inStr = true;
            else if (ch === '{' || ch === '[') depth2++;
            else if (ch === '}' || ch === ']') depth2--;
            else if (ch === ',' && depth2 === 0) { vEnd = ci; break; }
            vEnd = ci + 1;
          }
          var rawVal = kwSrc.slice(vStart, vEnd).trim();
          try { argsObj[km[1]] = JSON.parse(rawVal); } catch (eV) { argsObj[km[1]] = rawVal.replace(/^['"]|['"]$/g, ''); }
          ki = vEnd + 1;
        }
        // rewrite into the shape the existing salvage speaks, preserving any human text around it
        var human = msg.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, ' ').replace(/\s+/g, ' ').trim();
        msg.content = (human ? human + ' ' : '') + '<function=' + tcm[1] + '>' + JSON.stringify(argsObj);
      } else {
        msg.content = msg.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    if (!(msg.tool_calls && msg.tool_calls.length) && typeof msg.content === 'string' && msg.content.indexOf('<function') !== -1) {
      var SAFE_SALVAGE = ['update_screen', 'get_recent_builds', 'find_in_brain', 'get_budget_summary', 'get_budget_upcoming', 'get_pending_drafts', 'read_render_logs'];
      var mSalv = msg.content.match(/<function[=(]\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (mSalv && SAFE_SALVAGE.indexOf(mSalv[1]) !== -1) {
        var braceStart = msg.content.indexOf('{', mSalv.index);
        if (braceStart !== -1) {
          var depth = 0, endBr = -1;
          for (var bi = braceStart; bi < msg.content.length; bi++) {
            if (msg.content[bi] === '{') depth++;
            else if (msg.content[bi] === '}') { depth--; if (depth === 0) { endBr = bi; break; } }
          }
          if (endBr !== -1) {
            try {
              var salvArgs = JSON.parse(msg.content.slice(braceStart, endBr + 1));
              msg = { role: 'assistant', content: null, tool_calls: [{ id: 'salvage_' + Date.now(), type: 'function', function: { name: mSalv[1], arguments: JSON.stringify(salvArgs) } }] };
              _stampStep('tool_text_salvaged', mSalv[1]);
            } catch (eSalv) { /* unparseable text stays under the original reject rule */ }
          }
        }
      }
    }
    try{_stampStep('corridor_b_post_salvage','content_len='+String(msg&&msg.content||'').length+' tool_calls='+(((msg&&msg.tool_calls)||[]).length)+' tool_choice='+(body&&body.tool_choice?'set':'unset'));}catch(_eCB){}
    // ⬡B:core.tool_loop:FIX:forced_tool_choice_not_honored_by_groq:20260705⬡
    // Real, confirmed live: even with tool_choice forced, Groq's own response
    // came back finish_reason:'stop', tool_calls:[] -- the platform simply did
    // not honor the constraint on this real call (it did on a small isolated
    // test, so this is specific to the larger real system-prompt shape, not a
    // malformed request; traced with two temporary diagnostic logs, removed
    // here). One retry, forcing it a second time with a sharper instruction,
    // since this kind of platform miss has some real non-determinism to it.
    // If the retry ALSO fails to produce a real tool call, the answer is
    // rejected outright -- silence over a confident guess about something as
    // real as the founder's own identity. This is the same silence-over-
    // hollow rule already enforced a few lines below for malformed tool-call
    // text; this is the same failure class arriving a different way.
    if (iter===1 && (body.tool_choice==='auto'||body.tool_choice) && !(msg.tool_calls&&msg.tool_calls.length) && (body._dataReaderNudge || body._codingReadNudge || body._roadmapActivationNudge || (body.tool_choice && body.tool_choice.function))) {
      var _requiredToolName = (body.tool_choice && body.tool_choice.function
        && body.tool_choice.function.name) || body._dataReaderNudge || (body._codingReadNudge ? 'consult_mace' : null) || (body._roadmapActivationNudge ? 'activate_roadmap_task' : null) || 'the required tool';
      var retryMsgs=msgs.concat([{role:'assistant',content:msg.content||''},
        {role:'user',content:'You were required to call ' + _requiredToolName
          + ' and did not. Call that exact tool now before saying anything else.'}]);
      var retryBody={model:model,messages:retryMsgs,max_tokens:tokenCapFor(channel),temperature:0.1,
        tools:body.tools,tool_choice:body.tool_choice};
      var retryR=await fetch(GB,{method:'POST',
        headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
        body:JSON.stringify(retryBody),signal:_modelRequestSignal()
      }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
      var retryMsg=retryR&&retryR.choices&&retryR.choices[0]&&retryR.choices[0].message;
      if (retryMsg&&retryMsg.tool_calls&&retryMsg.tool_calls.length) {
        msg=retryMsg;
      } else if (_requiredToolName === 'consult_mace' && body._codingReadNudge) {
        // ⬡B:core.tool_loop:FIX:consult_mace_forced_with_parsed_args:20260719⬡
        // consult_mace is not a no-arg reader, but when the message named a concrete
        // file and repo those args are deterministic. The model refused to emit the
        // call, so cold code runs MACE read_file with the parsed args and feeds the
        // real file back for a grounded answer, the same shape as the data readers.
        try {
          var _forcedArgs = body._codingReadNudge;
          var _forcedResult = await executeTool('consult_mace', _forcedArgs, hamUid, message,
            { cycleId:_cycleId, requestId:_requestId, channel:channel });
          tools.push('consult_mace');
          // ⬡B:core.tool_loop:FIX:forced_consult_mace_result_becomes_shadow_evidence_no_false_hold:20260719⬡
          // Same fix as the data-reader force-execute: a cold force-execute must
          // record its real result as verified current-turn evidence, or SHADOW judges
          // the grounded answer with no source and can false-hold it. Same evidence
          // shape the model tool-call path uses, same current-turn provenance.
          _verifiedToolEvidence.push({ tool:'consult_mace',
            provenance:'pai.current_turn.execute_tool', request_id:_requestId,
            cycle_id:_cycleId,
            args:JSON.stringify(_forcedArgs||{}).slice(0,4000),
            result:String(_forcedResult||'').slice(0,4000) });
          if (_verifiedToolEvidence.length > 8) _verifiedToolEvidence.shift();
          _stampStep('forced_tool_direct_executed',
            'consult_mace ran in cold code with parsed args; '+String(_forcedResult||'').length+' chars of real file');
          var _mcGround = msgs.concat([
            {role:'assistant',content:'',tool_calls:[{id:'forced_consult_mace',type:'function',
              function:{name:'consult_mace',arguments:JSON.stringify(_forcedArgs)}}]},
            {role:'tool',tool_call_id:'forced_consult_mace',name:'consult_mace',
              content:String(_forcedResult||'')},
            {role:'user',content:'The tool result above is the REAL file MACE read for this person. '
              + 'Answer their question in your own natural words using only what the file actually contains. '
              + 'Do NOT say you pulled it up, do NOT hand back raw JSON. Just explain the file plainly.'}
          ]);
          var _mcGb={model:model,messages:_mcGround,max_tokens:tokenCapFor(channel),temperature:0.3};
          var _mcR=await fetch(GB,{method:'POST',
            headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
            body:JSON.stringify(_mcGb),signal:_modelRequestSignal()
          }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
          var _mcMsg=_mcR&&_mcR.choices&&_mcR.choices[0]&&_mcR.choices[0].message;
          if (_mcMsg&&isNonEmpty(_mcMsg.content)) { msg=_mcMsg; }
        } catch (_mcErr) {
          _stampStep('forced_consult_mace_failed', String(_mcErr&&_mcErr.message||_mcErr));
        }
      } else if (DATA_READER_TOOLS[_requiredToolName]) {
        // ⬡B:core.tool_loop:FIX:model_refuses_forced_data_read_so_execute_it_directly:20260719⬡
        // FOUNDER 911 20260719, from his real 8:05 text receipts: he asked "what am
        // I doing right now" (a personal day-question), calendar_read was forced, but
        // GLM would not emit the tool call even on retry. The turn then answered from
        // NOTHING, fabricated a plausible day, and SHADOW correctly held the
        // fabrication -- so his phone went silent. Root: the required tool is a
        // deterministic DATA READER (calendar_read, find_in_brain). When the model
        // will not emit it, cold code executes it directly and feeds the REAL result
        // back for a grounded second draft. She answers from his real calendar/brain
        // instead of from nothing, and there is no fabrication for SHADOW to hold.
        // This is not a rogue model call; it is a deterministic tool execution.
        try {
          var _forcedArgs = DATA_READER_TOOLS[_requiredToolName](message);
          var _forcedResult = await executeTool(_requiredToolName, _forcedArgs, hamUid, message,
            { cycleId:_cycleId, requestId:_requestId, channel:channel });
          tools.push(_requiredToolName);
          // ⬡B:core.tool_loop:FIX:forced_data_reader_result_becomes_shadow_evidence_no_false_hold:20260719⬡
          // NUCLEAR 911 part 2 (founder caught it): after the raw-words intent fix,
          // the lane question correctly force-executed read_lane_board (772 chars of
          // real data), but SHADOW STILL held it (shadow_wonder_hold / receipt_unverified).
          // Root cause: a tool the MODEL calls gets pushed into _verifiedToolEvidence
          // (line ~3462) so SHADOW can verify the answer against it, but this COLD
          // force-execute path set msg.content from the real result and never recorded
          // that result as evidence. So SHADOW judged a grounded answer with no source
          // to verify its "is/are" claims against, and held a true answer. A judge that
          // holds a grounded answer is a killer, not a healer. Recording the forced
          // result in the exact same evidence shape the model-call path uses lets SHADOW
          // verify the answer against the real data it was actually built from. This is
          // this turn's own deterministic tool execution, the same provenance a model
          // tool call carries, never caller-supplied, so it cannot forge authority.
          _verifiedToolEvidence.push({ tool:_requiredToolName,
            provenance:'pai.current_turn.execute_tool', request_id:_requestId,
            cycle_id:_cycleId,
            args:JSON.stringify(_forcedArgs||{}).slice(0,4000),
            result:String(_forcedResult||'').slice(0,4000) });
          if (_verifiedToolEvidence.length > 8) _verifiedToolEvidence.shift();
          _stampStep('forced_tool_direct_executed',
            _requiredToolName+' ran in cold code; '+String(_forcedResult||'').length+' chars of real data');
          var _groundInstruction='The tool result above is the REAL, current data for this person. '
            + 'Speak the direct answer to their question in your own natural words, using only facts '
            + 'from that result. Do NOT say you pulled it up, do NOT say ask again, do NOT hand back raw '
            + 'data or JSON. Just answer the question plainly, like a person who already knows.';
          function _groundDraft(extraNudge){
            var gm = msgs.concat([
              {role:'assistant',content:'',tool_calls:[{id:'forced_'+_requiredToolName,type:'function',
                function:{name:_requiredToolName,arguments:JSON.stringify(_forcedArgs)}}]},
              {role:'tool',tool_call_id:'forced_'+_requiredToolName,name:_requiredToolName,
                content:String(_forcedResult||'')},
              {role:'user',content:_groundInstruction + (extraNudge||'')}
            ]);
            var gb={model:model,messages:gm,max_tokens:tokenCapFor(channel),temperature:0.3};
            return fetch(GB,{method:'POST',
              headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
              body:JSON.stringify(gb),signal:_modelRequestSignal()
            }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
          }
          var _groundR=await _groundDraft('');
          var _groundMsg=_groundR&&_groundR.choices&&_groundR.choices[0]&&_groundR.choices[0].message;
          var _deflect=/pull(ed)? that up|ask me again|say it in words|raw data|instead of handing/i;
          if (!(_groundMsg&&isNonEmpty(_groundMsg.content)) || _deflect.test(String(_groundMsg&&_groundMsg.content||''))) {
            // one firmer retry; a deflection ("ask me again") is not an answer
            var _g2=await _groundDraft(' Answer in one to four sentences now. This is your only chance to answer; there is no ask-again.');
            var _g2m=_g2&&_g2.choices&&_g2.choices[0]&&_g2.choices[0].message;
            if (_g2m&&isNonEmpty(_g2m.content)&&!_deflect.test(String(_g2m.content))) _groundMsg=_g2m;
          }
          if (_groundMsg&&isNonEmpty(_groundMsg.content)&&!_deflect.test(String(_groundMsg.content))) {
            msg={role:'assistant',content:_groundMsg.content};
          } else {
            // never ship raw tool JSON; keep words flowing to the council with a plain honest line
            msg={role:'assistant',content:'Here is what I found for right now: '+String(_forcedResult||'').replace(/[{}\[\]"]/g,' ').replace(/\s+/g,' ').trim().slice(0,600)};
          }
        } catch(_eForced) {
          _stampStep('forced_tool_direct_execute_failed',
            _requiredToolName+': '+String(_eForced&&_eForced.message||_eForced).slice(0,120));
          _stampStep('forced_tool_unavailable_words_to_council',
            'direct execute failed; '+String((msg&&msg.content)||'').length+' chars continue to council');
        }
      } else if (!GROQ || !retryMsg || (retryR&&retryR.error)) {
        // ⬡B:core.tool_loop:FIX:a_dead_tool_rung_is_not_a_refusal:20260718⬡
        _stampStep('forced_tool_unavailable_words_to_council',
          'tool-capable rung dead; '+String((msg&&msg.content)||'').length+' chars continue to council');
      } else {
        if (_roadmapActivationNeeded) {
          return { ok:false, reason:'roadmap_activation_tool_call_missing', blocked_by:'SPAN_ACTIVATION',
            ham:hamObj, cycleId:_cycleId, requestId:_requestId,
            tools_used:tools, iterations:iter, ms:Date.now()-t0 };
        }
        // ⬡B:core.tool_loop:FIX:silence_was_swallowing_plain_statements:20260706⬡
        // Real, confirmed live: a message like "remember this: my coffee
        // order" is a STATEMENT, not a lookup question -- it still got
        // forced through tool_choice, the retry still failed to produce a
        // real tool call, and the whole turn went silent, so downstream
        // memory-keeping in synthesize.js never even ran. The founder's own
        // words -- keep tools forced, not gaslighting through inaction --
        // were about QUESTIONS not getting a real lookup, specifically the
        // HAM UID incident. A mechanical, not-a-judgment-call distinction:
        // does the ORIGINAL message actually look like a question. If yes,
        // stay silent -- that is exactly the identity-hallucination case
        // this was built for. If no, it is a statement or directive, let the
        // retry's own natural text through instead of swallowing it whole;
        // synthesize.js's existing councilShadow hallucination check still
        // runs on whatever text goes out either way, same as every other
        // reply -- this does not remove that layer, it just stops silencing
        // things that were never a lookup question in the first place.
        var looksLikeQuestion = /\?\s*$/.test(String(message||'').trim())
          || /^\s*(who|what|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should)\b/i.test(String(message||'').trim());
        if (looksLikeQuestion) {
          // \u2b21B:core.tool.loop:FIX:live_screen_honesty_fallback_not_blanket_silence:20260709\u2b21
          // Founder-caught live: "Is this finally working?" went dark. Real root cause,
          // traced through her own cycle stamps: this silence guard is correct and load-
          // bearing for identity/personal-fact questions (the documented HAM-UID
          // fabrication incident this was built to stop) but it was catching EVERY
          // question shape, including ordinary conversational ones with zero personal-
          // data risk. On a live screen, where a person is watching in real time, going
          // dark on "is this working" reads as broken, not safe. Fix is scoped tight:
          // only when a live screen is open for this HAM, one more plain, UNFORCED
          // completion is allowed, explicitly instructed to admit uncertainty rather than
          // invent personal facts. Text and email keep the original blanket silence,
          // completely unchanged. A second empty result still goes silent -- this is one
          // honest chance, not a bypass of the protection.
          var _liveScreen = false;
          try { _liveScreen = require('./stream/screen.awareness.js').hasLiveScreen(hamUid); } catch (eLs) {}
          // ⬡B:core.tool.loop:FIX:watched_chat_is_a_live_screen:20260716⬡
          // Portal, CCWA, and CARA chat ARE a person watching in real
          // time -- same honesty lane as a live screen, per the rule written above: going
          // dark on a watched surface reads as broken, not safe. Text and email keep the
          // blanket silence, completely unchanged. One honest unforced completion, that is
          // all this grants -- the second empty result still goes silent.
          if (channel === 'portal' || channel === 'ccwa' || channel === 'cara') _liveScreen = true;
          if (_liveScreen) {
            var honestBody = { model: model, messages: msgs.concat([
              { role: 'assistant', content: msg.content || '' },
              { role: 'user', content: 'Just answer plainly, in your own voice, right now. If you already have the material, answer with it directly. If this needs data you could not find, say plainly that you checked and there is nothing on it yet -- never tell the person to go find it for you, never say "you tell me", and never invent anything.' }
            ]), max_tokens: tokenCapFor(channel), temperature: 0.3 };
            var honestAns = (await callGLMPlain(null, honestBody.messages, tokenCapFor(channel))) || '';
            if (!honestAns) {
              var honestR = await fetch(GB, { method: 'POST',
                headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
                body: JSON.stringify(honestBody), signal:_modelRequestSignal()
              }).then(function (x) { return x.json(); }).catch(function (e) { return { error: e.message }; });
              honestAns = (honestR && honestR.choices && honestR.choices[0] && honestR.choices[0].message && (honestR.choices[0].message.content || '').trim()) || '';
            }
            ans = honestAns || '';
          } else {
            ans = '';
          }
          break;
        } else {
          // \u2b21B:core.tool.loop:FIX:statements_never_had_honest_fallback:20260711\u2b21
          // Real, confirmed live: an eviction message with real police-removal
          // risk went fully silent for 11.7 real seconds of genuine work --
          // forced find_in_brain, a real retry, both failed to produce a tool
          // call. The retry's OWN prompt says "call it now before saying
          // anything else," which gives the model no instruction for what to
          // say if it still can't comply, so it comes back essentially empty.
          // Questions on a live screen already had a real honest-fallback
          // pass built for exactly this failure shape; statements on every
          // channel never did. A life assistant that goes silent on someone
          // describing an active eviction risk is not a safe default, it's
          // the same failure this whole system exists to prevent. Same
          // pattern, no longer gated to live screens or questions only.
          var stmtBody = { model: model, messages: msgs.concat([
            { role: 'assistant', content: (retryMsg && retryMsg.content) || msg.content || '' },
            { role: 'user', content: 'You could not look anything up for that. Respond anyway, briefly and honestly, in your own words -- acknowledge what was actually said, and if you are missing information say plainly that you checked and have nothing on it yet rather than telling the person to find it for you. Do not invent facts or next steps you cannot verify.' }
          ]), max_tokens: tokenCapFor(channel), temperature: 0.3 };
          var stmtAns = (await callGLMPlain(null, stmtBody.messages, tokenCapFor(channel))) || '';
          if (!stmtAns) {
            var stmtR = await fetch(GB, { method: 'POST',
              headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
              body: JSON.stringify(stmtBody), signal:_modelRequestSignal()
            }).then(function (x) { return x.json(); }).catch(function (e) { return { error: e.message }; });
            stmtAns = (stmtR && stmtR.choices && stmtR.choices[0] && stmtR.choices[0].message && (stmtR.choices[0].message.content || '').trim()) || '';
          }
          msg = { role: 'assistant', content: stmtAns || (retryMsg && retryMsg.content) || msg.content || '' };
        }
      }
    }
    if (msg.tool_calls&&msg.tool_calls.length) {
      if (_reachIncidentIntake) {
        _stampStep('cycle_end_silent','reach_incident_tool_call_rejected');
        return {ok:false,reason:'reach_incident_tool_call_rejected',
          blocked_by:'REACH_INCIDENT_INTAKE',ham:hamObj,cycleId:_cycleId,
          requestId:_requestId,tools_used:tools,iterations:iter,ms:Date.now()-t0};
      }
      msgs.push({role:'assistant',content:msg.content||null,tool_calls:msg.tool_calls});
      for (var i=0;i<msg.tool_calls.length;i++){
        if (await _turnCancelled()) return _turnCancelledResult('before_tool');
        var tc=msg.tool_calls[i],targs={};
        try{targs=JSON.parse(tc.function.arguments||'{}');}catch(e){}
        // ⬡B:core.tool_loop:GUARD:signed_voice_reads_bind_exact_ham:20260717⬡
        // A model once asked for the legacy unresolved-inbox HAM while serving
        // a signed call. Bind read arguments at the execution/evidence boundary;
        // non-voice unresolved-inbox behavior remains unchanged.
        targs = bindExactHamToolArgs(tc.function.name, targs, hamUid, _effectRuntime);
        tc.function.arguments = JSON.stringify(targs);
        _stampStep('tool_call', tc.function.name);
        var tr=await executeTool(tc.function.name,targs,hamUid,message,_effectRuntime);
        tools.push(tc.function.name);
        // ⬡B:core.tool_loop:BUILD:deterministic_auto_screen_cook_20260715⬡ THE REBUILD.
        // Founder, verbatim: "how hard is it for cinematic scenes and emails and budgets
        // and widgets to appear on screen based on what PAI contributes" -- and he is
        // right that hoping the MODEL remembers a second update_screen call after
        // already answering in words is exactly the unreliable, gimmicky pattern that
        // kept breaking (the dead [[SCREEN]] text-tag path, drifted code fences, all of
        // it). The fix is doctrine: cold code decides, model only deliberates. The
        // instant a screen-worthy tool returns REAL content, this pushes it to the
        // glass itself -- no model choice, no narration required, no second step to
        // forget. Reuses the SAME tested piece.registry + push() pipeline already
        // proven live all session; this is not a new parallel mechanism.
        if (AUTO_SCREEN_TOOLS.indexOf(tc.function.name) !== -1) {
          try {
            var _sa2 = require('./stream/screen.awareness.js');
            if (_sa2.hasLiveScreen(hamUid)) {
              var _trParsed2 = null; try { _trParsed2 = JSON.parse(tr); } catch (eP2) {}
              var _hasRealContent = _trParsed2 && _trParsed2.ok !== false &&
                ((Array.isArray(_trParsed2.events) && _trParsed2.events.length) ||
                 (Array.isArray(_trParsed2.beads) && _trParsed2.beads.length));
              if (_hasRealContent) {
                var _pieceName = tc.function.name === 'calendar_read' ? 'calendar' : null;
                if (_pieceName) { await _sa2.push(hamUid, { cards: [{ region: 'right', piece: _pieceName }] }); }
              }
            }
          } catch (eAutoScreen) { /* auto-cook never blocks the real answer */ }
        }
        if (tc.function.name === 'consult_coda') {
          var _toolCodaFailure = failedCodaReason(tr);
          if (_toolCodaFailure) {
            return { ok:false, reason:_toolCodaFailure, blocked_by:'CODA',
              ham:hamObj, cycleId:_cycleId, requestId:_requestId,
              tools_used:tools, iterations:iter, ms:Date.now()-t0 };
          }
        }
        var _evidenceArgs = Object.assign({}, targs || {});
        if ((tc.function.name === 'find_in_brain' ||
            tc.function.name === 'find_identity_evidence') && !_evidenceArgs.ham_uid) {
          _evidenceArgs.ham_uid = hamUid;
        }
        _verifiedToolEvidence.push({ tool:tc.function.name,
          provenance:'pai.current_turn.execute_tool', request_id:_requestId,
          cycle_id:_cycleId,
          args:JSON.stringify(_evidenceArgs).slice(0,4000),
          result:String(tr||'').slice(0,4000) });
        if (_verifiedToolEvidence.length > 8) _verifiedToolEvidence.shift();
        if (tc.function.name === 'read_own_code') {
          try {
            var _trParsed = JSON.parse(tr);
            if (_trParsed && Array.isArray(_trParsed.realNumbersFoundInThisCode)) {
              _verifiedRealNumbers = _verifiedRealNumbers.concat(_trParsed.realNumbersFoundInThisCode);
            }
          } catch (eTrParse) {}
        }
        msgs.push({role:'tool',tool_call_id:tc.id,content:tr});
        // ⬡B:core.tool_loop:EVIDENCE:bound_bcw_refocused_after_generic_find:20260715⬡
        // Information questions force a live FIND after CODA's preload. A generic
        // or empty bank result is useful evidence, but it cannot become the last
        // instruction and erase question-bound doctrine already selected from
        // the trusted server BCW. Re-append the same bytes once, never an answer.
        if (tc.function.name === 'find_in_brain' && _namedContextRefocus &&
            !_namedEvidenceRefocusedAfterFind) {
          msgs.push({ role:'system', content:
            'Reconcile the completed Memory Bank lookup with the already bound BCW evidence below. ' +
            'A lookup miss limits Memory Bank claims only; it does not negate server-bound doctrine.' +
            _namedContextRefocus });
          _namedEvidenceRefocusedAfterFind = true;
        }
        if (tc.function.name === 'find_in_brain' && _identityProvenanceRefocus &&
            !_identityEvidenceRefocusedAfterFind) {
          msgs.push({ role:'system', content:
            'Reconcile the generic lookup without replacing the completed identity provenance evidence.' +
            _identityProvenanceRefocus });
          _identityEvidenceRefocusedAfterFind = true;
        }
      }
      continue;
    }
    ans=(msg.content||'').trim();
    try{_stampStep('corridor_c_post_assign','ans_len='+ans.length);}catch(_eCC){}
    // ⬡B:core.tool.loop:FIX:reject_unexecuted_toolcall_text:20260704⬡
    // Live founder proof, real email sent: the model wrote a tool call as
    // plain text -- <notify_ham>{"ham_uid":...}</function> -- instead of a
    // real structured tool_calls entry (note the mismatched closing tag,
    // this was never a working call, just a malformed attempt). No guard
    // existed for msg.content looking like an unexecuted tool invocation, so
    // it went out as the literal answer, to a real inbox. This is a hollow
    // reply wearing a costume, not a real answer -- same rule as no answer
    // at all: silence over sending garbage to a human.
    if (/^<[a-z_]+>\s*\{.*\}\s*<\/[a-z_]+>$/is.test(ans)) { ans = ''; }
    // ⬡B:core.tool.loop:WIRE:diagnostic_no_tool_visibility:20260704⬡
    // CLAIR wiring, licensed and diagnostic only, not the fix itself. A
    // founder-voice task asked for exactly this and gave up twice with no
    // real attempt, then a real attempt built something unrelated. This
    // mirrors the vara_raw_shape logger that already found a real bug
    // tonight: pure visibility into the moment a turn finishes with no tool
    // call, so the actual fix (tool_choice, prompting, a classifier,
    // whatever it turns out to be) has real data behind it instead of
    // another guess. Never decides the fix, only shows the pattern.
    if (!await _turnCancelled() && !tools.length && ans) {
      try {
        var BUd = process.env.AIBE_BRAIN_URL, BKd = process.env.AIBE_BRAIN_KEY;
        if (BUd && BKd) {
          fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST',
            headers: { apikey: BKd, Authorization: 'Bearer ' + BKd, 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ ham_uid: hamUid, agent_global: 'CLAIR', stamp_type: 'RESULT',
              acl_stamp: '\u2b21B:clair.diagnostic:RESULT:no_tool_turn:20260704\u2b21',
              source: 'clair.diagnostic.no_tool_turn.' + Date.now(),
              summary: '[CLAIR DIAGNOSTIC] no-tool turn on channel ' + channel,
              content: JSON.stringify({ channel: channel, question: String(message || '').slice(0, 150), answer_preview: ans.slice(0, 200) }),
              importance: 5 })
          }).catch(function () {});
        }
      } catch (eDiagLoop) {}
    }
    break;
  }
  if (await _turnCancelled()) return _turnCancelledResult('after_deliberation');
  var finalAns=(ans&&String(ans).trim())?String(ans).trim():'';
  var _preCouncilHumanRepairUsed = false;
  async function _completeBoundHistoryOnLadder(history, maxTokens, temperature, jsonMode) {
    if (await _turnCancelled(true)) return '';
    try {
      var _repairLadder = require('./model.ladder.js');
      var _repairHistory = openAiCompatibleHistory(history);
      var _repairSystem = _repairHistory.filter(function (entry) {
        return entry && entry.role === 'system';
      }).map(function (entry) { return String(entry.content || ''); }).join('\n\n');
      var _repairUser = _repairHistory.filter(function (entry) {
        return entry && entry.role !== 'system';
      }).map(function (entry) {
        return String(entry.role || 'user').toUpperCase() + ': ' + String(entry.content || '');
      }).join('\n\n');
      var _repairResult = await _repairLadder.deliberate(_repairSystem, _repairUser,
        {max_tokens:maxTokens || tokenCapFor(channel),temperature:temperature == null ? 0.1 : temperature,
          timeout:60000,json:jsonMode === true,signal:_modelRequestSignal()});
      if (await _turnCancelled(true)) return '';
      return _repairResult && (_repairResult.content || _repairResult.answer ||
        _repairResult.text) || '';
    } catch (eRepairLadder) { return ''; }
  }
  async function _repairHumanOnce(candidate, failureCode) {
    if (_preCouncilHumanRepairUsed) return {answer:'',repaired:false};
    _preCouncilHumanRepairUsed = true;
    var _oneRepairCap = tokenCapFor(channel);
    var _repairedHuman = await regenerateHollowAnswer(candidate, msgs, [async function (repairMessages) {
      return (await _completeBoundHistoryOnLadder(repairMessages, _oneRepairCap, 0.1, false)) || '';
    }], { force:true, maxAttempts:1, instruction:
      'The proposed answer failed the pre-council boundary (' + String(failureCode || 'invalid_answer') + '). '
      + 'Repair it once as a direct human-facing answer to the original request, using only facts in '
      + 'the bound system context and completed tool results already present. Fix only that named '
      + 'failure. Do not add facts, claim an unexecuted action, emit tool syntax or JSON, mention the '
      + 'repair, or describe yourself as an AI/model.' });
    return _repairedHuman;
  }
  // ⬡B:core.tool_loop:WIRE:loop_exit_receipt:20260718⬡ bisection instrument:
  // names whether the kill is inside the loop or in the post-loop passes.
  try{_stampStep('loop_exit_answer', 'len='+finalAns.length+' tools='+tools.length+' iter='+iter);}catch(_eLX){}
  var _repositoryDraftRepair = _structuredReachPolicy
    ? { repaired:false, answer:finalAns, reason:null }
    : repairCodaRepositoryDraft(
      finalAns, _codaRepositoryAnswer, !!_codaRepositoryAnswer);
  if (_repositoryDraftRepair.repaired) {
    finalAns = _repositoryDraftRepair.answer;
    _stampStep('repository_evidence_answer_repaired', _repositoryDraftRepair.reason);
  }
  // ⬡B:core.tool_loop:WIRE:direct_named_evidence_to_council:20260715⬡
  // CODA may deterministically select the exact bytes of one explicitly named
  // BCW section. Preserve those bytes so SHADOW can verify the same question-
  // bound digest. Nothing is released here; the complete council still follows.
  if (!_structuredReachPolicy && _codaDirectNamedEvidenceAnswer) {
    finalAns = _codaDirectNamedEvidenceAnswer;
    _stampStep('direct_named_evidence_selected', 'verified_coda_decision');
  }
  // ⬡B:core.tool_loop:REPAIR:preference_provenance_before_council:20260715⬡
  // The first live favorite-adviser draft copied CODA's honest lack of a stored
  // preference into a refusal, even though the human asked A'NU to choose now.
  // Give one evidence-bound correction pass. The rejected prose is deliberately
  // absent from the retry history; only the original question, completed tool
  // evidence, and bounded violation codes return to the model. Corrected bytes
  // still traverse every canonical preparation, council stage, STAMP, and readback.
  var _preferenceEvidenceContext = { hamUid:hamUid, requestId:_requestId,
    cycleId:_cycleId, question:_exactUserMessage,
    context:{ verified_evidence:_identityVerifiedEvidence
      .concat(_namedAgentVerifiedEvidence, _verifiedToolEvidence) } };
  var _preferenceDraftFlags = _structuredReachPolicy ? [] : preferenceJudgmentFindings(
    _exactUserMessage, finalAns, _preferenceEvidenceContext);
  if (_preferenceDraftFlags.length) {
    _preCouncilHumanRepairUsed = true;
    var _preferenceViolationCodes = _preferenceDraftFlags.map(function (flag) {
      return flag.reason;
    }).join(',');
    var _preferenceRetryMessages = msgs.concat([{ role:'system', content:
      'The exact user request asks for your current preference, not only a stored-memory lookup. ' +
      'Your proposed response failed these provenance requirements: ' + _preferenceViolationCodes + '. ' +
      'Answer the original request again from the completed evidence already in this message history. ' +
      'Choose one of the options named by the user and explicitly distinguish the choice as your fresh/current judgment or an actually stored preference. ' +
      'Ground every factual reason in the completed evidence. Do not mention this correction, internal tools, or a rejected draft.' }]);
    var _preferenceRetry = await _completeBoundHistoryOnLadder(_preferenceRetryMessages,
      tokenCapFor(channel), 0.1, false);
    if (await _turnCancelled(true)) return _turnCancelledResult('after_preference_repair');
    _preferenceRetry = String(_preferenceRetry || '').trim();
    var _preferenceRetryFlags = preferenceJudgmentFindings(
      _exactUserMessage, _preferenceRetry, _preferenceEvidenceContext);
    if (!_preferenceRetry || _preferenceRetryFlags.length) {
      _stampStep('cycle_end_silent', 'current_preference_unrepaired:' +
        _preferenceRetryFlags.map(function (flag) { return flag.reason; }).join(','));
      return {ok:false,reason:'current_preference_unrepaired',blocked_by:'A\'NU',
        ham:hamObj,cycleId:_cycleId,requestId:_requestId,tools_used:tools,
        iterations:iter,ms:Date.now()-t0};
    }
    finalAns = _preferenceRetry;
    _stampStep('current_preference_repaired', _preferenceViolationCodes);
  }
  // ⬡B:core.tool.loop:REPAIR:verified_identity_provenance_before_council:20260715⬡
  // CODA may already have produced a deterministically valid two-bucket answer.
  // If the conversational draft collapses those origins, repair with CODA's
  // verified candidate; every outbound gate still runs below.
  if (!_structuredReachPolicy && _identityProvenanceLedger.required && _codaProvenanceAnswer) {
    var _provenanceDraftCheck = identityProvenance.validateDraft(finalAns,
      _identityProvenanceLedger);
    if (!_provenanceDraftCheck.ok) {
      finalAns = _codaProvenanceAnswer;
      _stampStep('identity_provenance_answer_repaired', 'verified_coda_provenance');
    }
  }
  // ⬡B:core.tool_loop:REPAIR:verified_coda_evidence_relay_before_council:20260715⬡
  // The PAI model still runs and attempts natural synthesis. If it returns empty
  // or contradicts named BCW after CODA had to fall back to exact bound evidence,
  // use CODA's verified live bytes as the candidate. Those bytes do not bypass
  // anything: every preparation stage, the full outbound council, STAMP commit,
  // and readback still run below.
  if (!_structuredReachPolicy && _codaEvidenceRelayAnswer) {
    var _finalNamedFlags = finalAns
      ? namedContextContradictions(finalAns, _namedContextEvidence) : [{ reason:'empty_answer' }];
    if (!finalAns || _finalNamedFlags.length) {
      finalAns = _codaEvidenceRelayAnswer;
      _stampStep('named_context_answer_repaired', 'verified_coda_evidence_relay');
    }
  }
  // ⬡B:core.tool_loop:REPAIR:protocol_hollow_before_canonical_preparation:20260715⬡
  // Regeneration belongs immediately after the draft exists, before numeric
  // verification, screen extraction, protocol scrub, destination formatting,
  // SHADOW preparation, PAM, and persona. Repaired bytes therefore traverse
  // the same deterministic preparation once; no retry lane can skip a gate.
  if (!_structuredReachPolicy && finalAns && !isHumanFacingAnswer(finalAns)) {
    _stampStep('hollow_protocol_answer_caught', String(finalAns || '').slice(0, 80));
    var _repairedHuman = await _repairHumanOnce(finalAns, 'hollow_protocol_answer');
    if (await _turnCancelled(true)) return _turnCancelledResult('after_hollow_repair');
    if (!_repairedHuman.answer) {
      _stampStep('cycle_end_silent', 'hollow_protocol_answer_unrepaired');
      return {ok:false,reason:'hollow_protocol_answer',ham:hamObj,cycleId:_cycleId,
        requestId:_requestId,tools_used:tools,iterations:iter,ms:Date.now()-t0};
    }
    finalAns = _repairedHuman.answer;
    _stampStep('hollow_protocol_answer_repaired', 'plain_completion_lane_' + _repairedHuman.lane);
  }
  // ⬡B:core.tool.loop:FIX:raw_json_never_a_final_answer:20260714⬡
  // Live incident, founder's real phone: a raw tool result -- {"ok":true,"upcoming_events":
  // 0,"next_open_slots":[...]} -- went out as the actual text message. A text channel is
  // never the place for a JSON blob; whatever asked for it, a human reading iMessage never
  // gets raw data back. Cold detection: if the answer parses as JSON (starts with { or [ and
  // is valid JSON), it is never sent as-is. Composed instead, in plain words, from the shape
  // of what came back, so the tool result still reaches him, just as an actual sentence.
  // ⬡B:core.tool_loop:FIX:reach_policy_invalid_heals_as_strict_policy:20260719⬡
  // R1D exposed the cold silence, but its generic human-answer repair treated malformed
  // JSON as already human-facing and falsely stamped lane_undefined. R1E keeps the lane
  // closed-world: one strict JSON regeneration, then the unchanged policy council,
  // mutation guard, STAMP commit, and readback. It never degrades into plain prose.
  if (_structuredReachPolicy&&!_validStructuredReachPolicy(finalAns)) {
    _stampStep('reach_policy_invalid_healing','regenerating_strict_policy_json');
    var _rpCap = tokenCapFor(channel);
    var _rpStrict = await regenerateStructuredReachPolicy(finalAns, msgs, [
      async function (repairMessages) {
        return _completeBoundHistoryOnLadder(repairMessages, _rpCap, 0, true);
      }
    ], reachPolicyContract, t0);
    if (await _turnCancelled(true)) return _turnCancelledResult('after_reach_policy_repair');
    if (_rpStrict && _rpStrict.answer && _validStructuredReachPolicy(_rpStrict.answer)) {
      finalAns = _rpStrict.answer;
      _stampStep('reach_policy_invalid_healed','strict_json_lane_'+_rpStrict.lane);
    } else {
      _stampStep('cycle_end_silent','reach_policy_json_invalid_after_heal_attempt');
      return{ok:false,reason:'reach_policy_json_invalid',blocked_by:'A\'NU',ham:hamObj,
        cycleId:_cycleId,requestId:_requestId,tools_used:tools,iterations:iter,
        ms:Date.now()-t0};
    }
  }
  if (!_structuredReachPolicy&&finalAns && /^[\[{]/.test(finalAns.trim())) {
    var _rawParsed = null;
    try { _rawParsed = JSON.parse(finalAns.trim()); } catch (eRawJ) {}
    if (_rawParsed && typeof _rawParsed === 'object') {
      _stampStep('raw_json_answer_caught', 'a tool result nearly went out as raw JSON instead of a sentence');
      if (_rawParsed.next_open_slots || _rawParsed.upcoming_events !== undefined) {
        var _n = Array.isArray(_rawParsed.next_open_slots) ? _rawParsed.next_open_slots.length : 0;
        finalAns = _n > 0
          ? 'Your calendar is open right now, ' + _n + ' free half-hour blocks coming up. Want me to grab one?'
          : 'Nothing open on your calendar in the window I checked, or it is genuinely clear with no slots computed yet -- tell me what you are trying to book and I will look closer.';
      } else {
        finalAns = 'I pulled that up, but I need to say it in words instead of handing you raw data. Ask me again and I will answer it properly.';
      }
    }
  }
  // ⬡B:core.tool.loop:FIX:hallucinated_reminder_action_20260712⬡
  // Founder screenshot: she replied 'I've set a reminder for you to check in on Tameka,
  // it'll pop up tomorrow 9am' -- but create_reminder NEVER fired, so no reminder
  // exists. Claiming an action you did not take is the worst failure. Guard: if the
  // reply claims a reminder/calendar action but the matching tool did not run this
  // turn, strip the false claim and tell the truth. Cold detection, no LLM.
  if (!_structuredReachPolicy&&finalAns && /\bI(?:'ve| have)?\s+(?:set|created|scheduled|added|made)\s+(?:a\s+)?(?:reminder|calendar|event)\b/i.test(finalAns) && tools.indexOf('create_reminder')===-1 && tools.indexOf('create_event')===-1) {
    _stampStep('hallucinated_action_caught','claimed reminder/event without firing the tool');
    finalAns = "I want to set that reminder for you, but I need to actually create it rather than just say I did. Tell me the exact thing and time and I will set it for real this time.";
  }
  // \u2b21B:core.tool_loop:FIX:evidence_backed_question_gets_one_plain_synthesis:20260717\u2b21
  // Live 1-in-3 on the founder's own chat: iterations gathered REAL tool evidence
  // (find_in_brain, get_pending_drafts) and the tool-choice drafting pass still
  // returned empty, so a plain question died silent while its answer sat in the
  // transcript. One plain completion over the SAME bound transcript -- no new
  // tools, no new facts -- and the recovered text still crosses SHADOW, the full
  // council, STAMP, and readback. Empty again = silent, unchanged law.
  if (!finalAns && tools.length) {
    _preCouncilHumanRepairUsed = true;
    try {
      var _evTail = msgs.slice(-14).map(function(m){
        var _ec = m && m.content;
        if (_ec != null && typeof _ec !== 'string') { try { _ec = JSON.stringify(_ec); } catch(eEv){ _ec = String(_ec); } }
        return (m && m.role || '') + ': ' + String(_ec||'').slice(0, 1200);
      }).join(String.fromCharCode(10));
      var _synth = await _completeBoundHistoryOnLadder([
        {role:'system',content:'You are finishing an in-flight assistant turn. Below is the real transcript including tool evidence already gathered this turn. Answer the user question directly in one to four sentences using ONLY facts present in the evidence. If the evidence does not contain the answer, say plainly that nothing surfaced.'},
        {role:'user',content:'QUESTION: ' + String(message||'').slice(0,500) +
          String.fromCharCode(10,10) + 'TRANSCRIPT AND EVIDENCE:' +
          String.fromCharCode(10) + _evTail.slice(0, 9000)}
      ], 380, 0.1, false);
      if (await _turnCancelled(true)) return _turnCancelledResult('after_evidence_repair');
      if (_synth && _synth.trim()) {
        finalAns = _synth.trim();
        _stampStep('empty_draft_recovered', 'plain_synthesis_over_bound_evidence');
      }
    } catch(_eSynth){}
  }
  // ⬡B:core.tool_loop:REPAIR:terminal_no_answer_single_repair:20260719⬡
  // Provider fallbacks may all return empty even when the bound request itself is
  // answerable. Give the exact transcript one final, single human-answer repair;
  // its bytes still traverse every preparation, council, STAMP, and readback gate.
  if (!finalAns && !_preCouncilHumanRepairUsed) {
    var _emptyRepair = await _repairHumanOnce('', 'no_answer');
    if (await _turnCancelled(true)) return _turnCancelledResult('after_empty_repair');
    if (_emptyRepair && _emptyRepair.answer) {
      finalAns = _emptyRepair.answer;
      _stampStep('empty_draft_recovered', 'single_bound_human_repair');
    }
  }
  if(!finalAns){
    // ⬡B:core.tool.loop:BUILD:universal_tracker_no_silent_evaporation:20260713⬡
    // Architect-flagged live: a two-part text (recurring timeshare reminder + scan
    // calendars / consult advisors / book a haircut) hit THIS path and VANISHED -- no
    // reply, no reminder, and no record that anything was ever owed. Silence-over-hollow
    // is correct for identity-hallucination risk, but a clear ACTION request must never
    // evaporate without a trace. Now: (1) stamp a TRACK BLOCKED so the ask is findable in
    // one query, and (2) if the inbound was an explicit action request on a reply channel,
    // return a short HONEST status instead of dead air -- a truthful "logged it, could not
    // finish it", not hollow content. A non-action empty (identity risk, contentless) still
    // goes fully silent, unchanged.
    var _blockedFallback = false;
    try {
      if (await _turnCancelled()) return _turnCancelledResult('before_tracker_recovery');
      var _trk = require('./tracker.js');
      var _wasAction = _trk.looksLikeActionRequest(message);
      await _trk.stampTrack({ hamUid: hamUid, status: 'BLOCKED', kind: 'request',
        request: String(message||''), channel: channel, cycleId: _cycleId, tools_used: tools,
        reason: 'cycle produced no answer after ' + iter + ' iterations; likely missing a tool for part of the ask' });
      if (await _turnCancelled()) return _turnCancelledResult('after_tracker_recovery');
      if (_wasAction && ['blooio','text','sms','voice','iman','email','portal','omi','ccwa','cara'].indexOf(channel) !== -1) {
        finalAns = 'I have your request logged so it will not get lost. Part of it I could not finish on my own yet, and I have flagged that to get handled. If you tell me which piece matters most right now, I will take another run at it.';
        _blockedFallback = true;
      }
    } catch(_eTrk){}
    if(!finalAns) {
      _stampStep('cycle_end_silent', 'no_answer, iterations='+iter);
      return {ok:false,reason:'no_answer',ham:hamObj,cycleId:_cycleId,
        tools_used:tools,iterations:iter,ms:Date.now()-t0,fcw_ms:(fcw&&fcw.ms)||0,_dbg:global._paiLastError||null};
    }
  }
  // THE REAL SECOND PASS. Deterministic, not another LLM guess trusting itself.
  if (!_structuredReachPolicy&&_verifiedRealNumbers.length && /\d/.test(finalAns)) {
    var _answerNumbers = (finalAns.match(/\b\d+\b/g) || []);
    var _unverified = _answerNumbers.filter(function(n){ return _verifiedRealNumbers.indexOf(n) === -1; });
    if (_unverified.length) {
      _stampStep('verifier_caught_fabrication', 'unverified numbers: '+_unverified.join(','));
      var _retryText = '';
      if (!_preCouncilHumanRepairUsed) try {
        _preCouncilHumanRepairUsed = true;
        var _retryMsgs = msgs.concat([
          {role:'assistant',content:finalAns},
          {role:'user',content:'Real verification just ran on that answer: it contains the number(s) '+_unverified.join(', ')
            +' which do not appear anywhere in the real code you actually read. That is fabricated, not real. '
            +'Give the same answer again with those specific numbers removed entirely -- describe the mechanism '
            +'qualitatively with no invented figure, or say plainly that detail was not confirmed. Do not invent a '
            +'replacement number either.'}
        ]);
        _retryText = await _completeBoundHistoryOnLadder(_retryMsgs,
          tokenCapFor(channel), 0.1, false);
      } catch (eVerify) { /* verification itself must never crash a real turn */ }
      if (await _turnCancelled(true)) return _turnCancelledResult('after_number_repair');
      if (_retryText && _retryText.trim()) {
        var _retryNumbers = (_retryText.match(/\b\d+\b/g) || []);
        var _stillBad = _retryNumbers.filter(function(n){
          return _verifiedRealNumbers.indexOf(n) === -1;
        });
        if (!_stillBad.length) finalAns = _retryText.trim();
      }
      var _remainingNumbers = (finalAns.match(/\b\d+\b/g) || []).filter(function(n){
        return _verifiedRealNumbers.indexOf(n) === -1;
      });
      _remainingNumbers.forEach(function (number) {
        finalAns = finalAns.replace(new RegExp('\\b' + number + '\\b', 'g'),
          'an unverified number');
      });
      if (_remainingNumbers.length) {
        _stampStep('unverified_numbers_removed', _remainingNumbers.join(','));
      }
    }
  }
  // ⬡B:core.tool_loop:REPAIR:current_turn_false_negative_before_preparation:20260715⬡
  // If a model still converts draft-time blindness into a categorical claim that
  // this turn did not run/complete, replace it with the true release invariant.
  // The repaired bytes still traverse screen extraction, formatting, PAM, SHADOW,
  // the full council, STAMP, and readback below.
  var _proofDraft = _structuredReachPolicy?{repaired:false,answer:finalAns}:
    currentTurnProofGuard.repairDraft(_proofQuestion, finalAns);
  if (_proofDraft.repaired) {
    finalAns = _proofDraft.answer;
    _stampStep('current_turn_proof_claim_repaired', _proofDraft.reason);
  }
  // ⬡B:core.tool.loop:WIRE:screen_awareness_act:20260709⬡
  // ⬡B:core.tool_loop:REPAIR:one_full_preparation_resubmission:20260719⬡
  // A deterministic preparation can empty or corrupt an otherwise real draft.
  // Prepare once; if it fails and the one human-repair budget remains, heal the
  // named failure and run the complete sequence once more before council.
  var _screenPushed = 0;
  var _screenBlock = null;
  function _prepareHumanAnswerOnce(candidate) {
    var finalAns = typeof candidate === 'string' ? candidate.trim() : '';
    var preparedScreenBlock = null;
    try {
      var _screenAware = require('./stream/screen.awareness.js');
      var _scr = _screenAware.extract(finalAns);
      if (_scr && typeof _scr.answer === 'string') finalAns = _scr.answer.trim();
      preparedScreenBlock = identity && (identity.outbound_finalize === true ||
        _reachIncidentIntake)
        ? null : (_scr && _scr.block || null);
    } catch (eScrA) {}
    if (!finalAns) return {ok:false,answer:'',screenBlock:preparedScreenBlock,
      reason:'answer_was_only_screen_block'};
    finalAns = scrubLeakedToolProtocol(finalAns);
    try {
      var _fmtDest = (channel === 'text' || channel === 'sms') ? 'sms' : 'command_center';
      finalAns = require('./format.matrix.js').formatForDestination(finalAns, _fmtDest);
    } catch (eFmt) {}
    if (!finalAns) return {ok:false,answer:'',screenBlock:preparedScreenBlock,
      reason:'emptied_after_model_by_scrub_or_format'};
    try {
      var _shadowPrepared = require('./synthesize.js').shadowAudit(finalAns);
      if (!_shadowPrepared.clean) return {ok:false,answer:'',screenBlock:preparedScreenBlock,
        reason:'shadow_scrubbed_to_empty'};
      finalAns = _shadowPrepared.clean;
    } catch (ePrepShadow) {}
    try {
      var _tierGate = require('./synthesize.js').pamGate(finalAns, hamObj && hamObj.tier);
      if (_tierGate && _tierGate.gated) {
        finalAns = 'I have some information for you but need to verify your access. Reply with your passcode.';
      }
    } catch (ePrepPam) {}
    try {
      var _personaChoice = identity && identity.persona || hamObj && hamObj.persona;
      if (_personaChoice) finalAns = require('./persona.js').applyPersona(finalAns,
        { hamUid:hamUid,persona:_personaChoice,contributions:{} });
    } catch (ePrepPersona) {}
    if (currentTurnProofGuard.falseCurrentTurnFailureClaim(_proofQuestion, finalAns)) {
      return {ok:false,answer:finalAns,screenBlock:preparedScreenBlock,
        reason:'false_current_turn_failure_claim_after_preparation'};
    }
    if (!isHumanFacingAnswer(finalAns)) {
      return {ok:false,answer:finalAns,screenBlock:preparedScreenBlock,
        reason:'hollow_protocol_after_preparation'};
    }
    return {ok:true,answer:finalAns,screenBlock:preparedScreenBlock,reason:null};
  }
  if (_structuredReachPolicy) {
    if (!_validStructuredReachPolicy(finalAns)) {
      _stampStep('cycle_end_silent', 'reach_policy_json_invalid_after_heal_attempt');
      return {ok:false,reason:'reach_policy_json_invalid',blocked_by:'A\'NU',ham:hamObj,
        cycleId:_cycleId,requestId:_requestId,tools_used:tools,iterations:iter,
        ms:Date.now()-t0};
    }
  } else {
    var _preparedHuman = _prepareHumanAnswerOnce(finalAns);
    if (!_preparedHuman.ok && !_preCouncilHumanRepairUsed) {
      _stampStep('preparation_answer_healing', _preparedHuman.reason);
      var _lateRepair = await _repairHumanOnce(finalAns, _preparedHuman.reason);
      if (await _turnCancelled(true)) return _turnCancelledResult('after_preparation_repair');
      if (_lateRepair && _lateRepair.answer) {
        _preparedHuman = _prepareHumanAnswerOnce(_lateRepair.answer);
        if (_preparedHuman.ok) {
          _stampStep('preparation_answer_healed', 'single_full_resubmission');
        }
      }
    }
    if (!_preparedHuman.ok) {
      var _terminalPreparationReason = _preparedHuman.reason || 'hollow_protocol_after_preparation';
      _stampStep('cycle_end_silent', _terminalPreparationReason);
      var _terminalReason = /^answer_was_only_screen_block|^emptied_after_model/.test(
        _terminalPreparationReason) ? 'no_answer'
        : _terminalPreparationReason === 'shadow_scrubbed_to_empty'
          ? 'shadow_scrubbed_to_empty'
          : _terminalPreparationReason.indexOf('false_current_turn_failure_claim') === 0
            ? 'false_current_turn_failure_claim' : 'hollow_protocol_answer';
      return {ok:false,reason:_terminalReason,ham:hamObj,cycleId:_cycleId,
        requestId:_requestId,tools_used:tools,iterations:iter,ms:Date.now()-t0,
        _dbg:global._paiLastError||null};
    }
    finalAns = _preparedHuman.answer;
    // A rejected draft cannot contribute screen bytes to a repaired answer.
    // Only the exact preparation that passed every outbound boundary may commit.
    _screenBlock = _preparedHuman.screenBlock || null;
  }
  // ⬡B:core.tool_loop:GUARD:full_pai_outbound_council_every_return:20260715⬡
  // This is the only successful exit. PAM, SHADOW, META_COMMENTARY, conditional
  // QUILL, WRIT, A'NU expression, and STAMP must all finish in order. STAMP
  // writes and reads back every ACL row before the exact answer can leave.
  var _delivery = _structuredReachPolicy ? { external:false }
    : Object.assign({}, identity && identity.delivery || {});
  var _humanReachChannels = ['anu','blooio','cara','ccwa','email','iman','omi',
    'portal','sms','text','vara','voice','budget'];
  if (_humanReachChannels.indexOf(String(channel || '').toLowerCase()) >= 0
      || /^email(?:_|$)/i.test(String(channel || ''))) _delivery.external = true;
  // A policy candidate's normalized evidence owns all context. Generic PAM still
  // runs, but no FCW- or caller-enriched world may select a world-specific rule
  // outside the digest-bound packet.
  var _worldCandidate = _structuredReachPolicy ? ''
    : String((hamObj&&hamObj.world)||(identity&&identity.world)||'').toLowerCase();
  var _activeWorld = ['bdif','mediators','mh_action','gmg'].indexOf(_worldCandidate) >= 0
    ? _worldCandidate : null;
  // SHADOW receives evidence, not merely the names of tools that happened to run.
  // Prioritize live tool/vision evidence, then fill the remaining bounded slots
  // with the exact Memory Bank rows that contributed to this wall.
  // ⬡B:core.tool_loop:GUARD:external_context_cannot_forge_consult_coda:20260715⬡
  // consult_coda is a reserved current-turn proof. Only this loop's actual
  // executeTool result may enter SHADOW under that tool name; caller-supplied
  // council evidence can contribute other facts but cannot mint CODA authority.
  var _externalEvidence = !_structuredReachPolicy && identity && identity.council_context
    && Array.isArray(identity.council_context.verified_evidence)
    ? identity.council_context.verified_evidence.filter(function (item) {
      // Reserved Memory Bank/CODA proof lanes are minted only inside this turn.
      // Caller evidence may contribute other live tool facts, but cannot forge a
      // stored row or current consult authority by copying a tool/provenance name.
      var normalizedTool = item && typeof item.tool === 'string'
        ? item.tool.trim().toLowerCase() : '';
      return !!normalizedTool &&
        ['consult_coda','find_in_brain','find_identity_evidence'].indexOf(normalizedTool) < 0;
    }) : [];
  var _priorityEvidence = prioritizeVerifiedEvidence(_identityVerifiedEvidence,
    _namedAgentVerifiedEvidence.concat(_verifiedToolEvidence, _externalEvidence));
  var _memoryEvidence = !_structuredReachPolicy && Array.isArray(fcw&&fcw.context)
    ? fcw.context.slice(0, 8).map(function (bead) {
    var beadContent = bead&&bead.content;
    if (beadContent && typeof beadContent !== 'string') {
      try { beadContent = JSON.stringify(beadContent); } catch (eBeadJson) { beadContent = ''; }
    }
    return { provenance:'memory_bank.exact_ham',
      ham_uid:bead&&bead.ham_uid||hamUid,
      source:bead&&bead.source||null, stamp_type:bead&&bead.stamp_type||null,
      summary:String(bead&&bead.summary||'').slice(0,500),
      content:String(beadContent||'').slice(0,1200) };
  }) : [];
  var _councilEvidence = (_runtimeIdentityEvidence ? [_runtimeIdentityEvidence] : [])
    .concat(_priorityEvidence);
  _councilEvidence = _councilEvidence.concat(
    _memoryEvidence.slice(0, Math.max(0, 8 - _councilEvidence.length))).slice(0, 8);
  var _callerCouncilContext = identity&&identity.council_context||{};
  // Only the server-owned policy mode and evidence digest cross into SHADOW.
  // Object.assign over the caller context is intentionally forbidden here: it
  // could reintroduce stale verified evidence, contributors, effects, or other
  // ambient fields after the model transcript had already been isolated.
  var _councilContext = _structuredReachPolicy ? {
    tools_used:[], iterations:iter, mode:'reach_policy_decision',
    outbound_finalize:true,
    evidence_digest:/^[a-f0-9]{64}$/.test(String(_callerCouncilContext.evidence_digest||''))
      ? String(_callerCouncilContext.evidence_digest) : null,
    memory_contributors:null
  } : Object.assign({ tools_used:tools, iterations:iter,
    memory_contributors:(fcw&&fcw.contributors)||null }, _callerCouncilContext);
  var _reachHandoffMode = String(identity&&identity.council_context&&
    identity.council_context.mode || '');
  var _reachHandoffEligible = !(identity && (identity.outbound_finalize ||
    identity.delivery&&identity.delivery.external ||
    /^(outbound|outreach)/.test(_reachHandoffMode)));
  // This flag is committed inside the canonical CYCLE_RECEIPT/STAMP pair. If
  // the later candidate append loses its response or fails, the queue scanner
  // can reconstruct exactly this ordinary cycle. Finalizer/external cycles are
  // explicitly false and can never recurse into REACH.
  _councilContext.reach_handoff_eligible = _reachHandoffEligible;
  var _councilDeliveryTarget = _councilContext.delivery_target;
  delete _councilContext.delivery_target;
  _councilContext.identity_provenance = _structuredReachPolicy
    ? null : _identityProvenanceLedger;
  _councilContext.identity_evidence_receipt = _structuredReachPolicy ? null
    : (_identityEvidenceProof.ok ? _identityEvidenceProof.receipt : null);
  if (_structuredReachPolicy || _reachIncidentIntake) _councilContext.pending_effects = [];
  else _councilContext.pending_effects = _effectRuntime.pendingEffects.map(function (effect) {
      return { name:effect.name, args:effect.args };
    });
  _councilContext.verified_evidence = _structuredReachPolicy ? [] : _councilEvidence;
  var _structuredPolicyDraftBytes=_structuredReachPolicy?finalAns:null;
  if (await _turnCancelled(true)) return _turnCancelledResult('before_council');
  if (_reachIncidentIntake&&
      !await reachIncidentFence(identity,'before_council'))return{ok:false,
    reason:'reach_incident_claim_lost',blocked_by:'REACH_INCIDENT_FENCE',ham:hamObj,
    cycleId:_cycleId,requestId:_requestId,tools_used:tools,iterations:iter,
    ms:Date.now()-t0};
  var _council = await runOutboundCouncil({
    hamUid:hamUid,requestId:_requestId,cycleId:_cycleId,question:_exactUserMessage,
    deliberationInput:String(message||''),
    answer:finalAns,channel:channel,activeWorld:_activeWorld,
    delivery:_delivery,deliveryTarget:_councilDeliveryTarget,context:_councilContext,
    signal:_turnAbortSignal
  });
  if (await _turnCancelled(true)) return _turnCancelledResult('after_council');
  var _councilReceipt = _council && (_council.council_receipt || _council.councilReceipt);
  var _mainCouncilExpected = {hamUid:hamUid,requestId:_requestId,cycleId:_cycleId,
    question:_exactUserMessage,deliberationInput:String(message||''),
    answer:_council&&_council.answer};
  if (_identityProvenanceLedger.required) {
    _mainCouncilExpected.identityEvidenceReceipt = _identityEvidenceProof.receipt;
  }
  if (_councilDeliveryTarget !== undefined && _councilDeliveryTarget !== null) {
    _mainCouncilExpected.deliveryTarget = _councilDeliveryTarget;
  }
  var _committedCouncil = requireVerifiedCouncilResult(_council, _mainCouncilExpected);
  if (!_committedCouncil || !_committedCouncil.ok) {
    // ⬡B:core.tool_loop:DIAGNOSTIC:persist_bounded_shadow_reason_codes:20260715⬡
    // Preserve machine reason codes only. The failed answer, claims, evidence,
    // sources, and model judgment remain out of the durable cycle breadcrumb.
    var _blockedCouncilCodes = boundedCouncilFailureCodes(_council);
    _stampStep('outbound_council_blocked', _blockedCouncilCodes || 'receipt_unverified');
    // \u2b21B:core.tool_loop:TELEMETRY:council_hold_writes_the_judges_why:20260718\u2b21
    // Founder order: a held cycle must write the judge's reason. The 20260715 law
    // keeps model judgment out of the CYCLE_STEP breadcrumb, so this is a separate
    // governed COUNCIL_HOLD row: bounded reason strings only, never answer bytes.
    try {
      var _holdEv = _council && _council.evidence || {};
      var _holdJudge = _holdEv.judgment && _holdEv.judgment.reason || null;
      var _holdReview = _holdEv.review && _holdEv.review.reason || null;
      if (_BU && _BK) fetch(_bu() + '/rest/v1/' + _tbl(), { method:'POST',
        headers:{ apikey:_BK, Authorization:'Bearer '+_BK, 'Accept-Profile':_schema(),
          'Content-Profile':_schema(), 'Content-Type':'application/json', Prefer:'return=minimal' },
        body: JSON.stringify({ ham_uid:hamUid, agent_global:'PAI', stamp_type:'COUNCIL_HOLD',
          importance:3, spawned_by:'pai.council.hold',
          source:'pai.council.hold.' + _cycleId,
          acl_stamp:'\u2b21B:pai.council:HOLD:' + _cycleId + ':' + ymd() + '\u2b21',
          summary:('[COUNCIL HOLD] cycle ' + _cycleId + ': ' + (_blockedCouncilCodes || 'receipt_unverified')).slice(0, 280),
          content: JSON.stringify({ codes:_blockedCouncilCodes || null,
            judge_reason:_holdJudge ? String(_holdJudge).slice(0, 300) : null,
            review_reason:_holdReview ? String(_holdReview).slice(0, 300) : null }) }) }).catch(function () {});
    } catch (_eHold) {}
    return {ok:false,reason:(_council&&_council.reason)
        || (_committedCouncil&&_committedCouncil.reason) || 'pai_council_receipt_unverified',
      blocked_by:(_council&&_council.blocked_by)||'STAMP',ham:hamObj,cycleId:_cycleId,
      requestId:_requestId,tools_used:tools,iterations:iter,ms:Date.now()-t0,
      council_stages:(_council&&_council.stages)||[]};
  }
  finalAns = _council.answer;
  if(_structuredReachPolicy&&(finalAns!==_structuredPolicyDraftBytes||
      !_validStructuredReachPolicy(finalAns))){
    _stampStep('outbound_council_blocked','reach_policy_json_mutated');
    return{ok:false,reason:'reach_policy_json_mutated',blocked_by:'A\'NU',ham:hamObj,
      cycleId:_cycleId,requestId:_requestId,tools_used:tools,iterations:iter,
      ms:Date.now()-t0};
  }
  if (!_structuredReachPolicy&&!isHumanFacingAnswer(finalAns)) {
    _stampStep('outbound_council_blocked', 'council_answer_hollow_protocol');
    return {ok:false,reason:'council_answer_hollow_protocol',blocked_by:'STAMP',ham:hamObj,
      cycleId:_cycleId,requestId:_requestId,tools_used:tools,iterations:iter,ms:Date.now()-t0};
  }
  var _stampProof = _committedCouncil.stamp_proof;
  // ⬡B:core.tool.loop:COMMIT:queued_mutations_after_stamp:20260715⬡
  // Mutating tool calls participated in deliberation as a durable pending
  // effect plan. Release them only now. External human messages receive their
  // own nested read-only PAI finalizer, so the provider boundary can verify a
  // full receipt/STAMP pair whose exact answer is the exact bytes it sends.
  var _effectResults = [];
  for (var _effectIndex = 0; _effectIndex < _effectRuntime.pendingEffects.length; _effectIndex++) {
    if (await _turnCancelled(true)) return _turnCancelledResult('before_effect');
    var _effect = _effectRuntime.pendingEffects[_effectIndex];
    var _effectArgs = Object.assign({}, _effect.args || {});
    var _effectCouncilResult = _council;
    try {
      var _needsMessageCouncil = _effect.name === 'notify_ham'
        || (_effect.name === 'contact_send' && _effectArgs.authorized_in_message === true);
      if (_needsMessageCouncil) {
        var _effectDeliveryTarget;
        if (_effect.name === 'notify_ham') {
          var _notifyTargetHam = String(_effectArgs.ham_uid || hamUid).trim().toUpperCase();
          if (_notifyTargetHam !== String(hamUid || '').trim().toUpperCase()) {
            _effectResults.push({ name:_effect.name, ok:false, reason:'notify_ham_receipt_ham_mismatch' });
            continue;
          }
          _effectArgs.ham_uid = _notifyTargetHam;
          var _notifyPhone = await resolveNotifyPhone(_notifyTargetHam);
          if (await _turnCancelled(true)) return _turnCancelledResult('after_notify_resolution');
          if (!_notifyPhone) {
            _effectResults.push({ name:_effect.name, ok:false, reason:'notify_target_unresolved' });
            continue;
          }
          _effectArgs._resolved_notify_phone = _notifyPhone;
          _effectDeliveryTarget = { kind:'phone', value:_notifyPhone };
        } else {
          var _effectContact = await require('./contacts.js').resolveContact(
            _effectArgs.ham_uid || hamUid, _effectArgs.contact_query || '');
          if (await _turnCancelled(true)) return _turnCancelledResult('after_contact_resolution');
          if (!_effectContact || typeof _effectContact.phone !== 'string' || !_effectContact.phone.trim()) {
            _effectResults.push({ name:_effect.name, ok:false, reason:'contact_target_unresolved' });
            continue;
          }
          _effectArgs._resolved_contact_phone = _effectContact.phone;
          _effectDeliveryTarget = { kind:'phone', value:_effectContact.phone };
        }
        if (!canonicalizeDeliveryTarget(_effectDeliveryTarget)) {
          _effectResults.push({ name:_effect.name, ok:false, reason:'outbound_effect_target_invalid' });
          continue;
        }
        var _proposedEffectMessage = String(_effectArgs.message || '').slice(0, 1500);
        if (!_proposedEffectMessage.trim()) {
          _effectResults.push({ name:_effect.name, ok:false, reason:'outbound_effect_message_required' });
          continue;
        }
        var _effectRequestId = 'pai.effect.' + require('node:crypto').createHash('sha256')
          .update(JSON.stringify({ parent_request_id:_requestId, parent_cycle_id:_cycleId,
            index:_effectIndex, name:_effect.name, target:canonicalizeDeliveryTarget(_effectDeliveryTarget),
            message:_proposedEffectMessage }), 'utf8').digest('hex').slice(0, 32);
        var _effectDeliberation = 'Finalize the exact external message proposed by a committed parent PAI cycle. '
          + 'Return only the human-facing message. Do not call a send, write, deploy, calendar, or screen tool.\n\n'
          + 'PROPOSED MESSAGE:\n' + _proposedEffectMessage;
        var _effectIdentity = { uid:hamUid, request_id:_effectRequestId,
          user_message:_proposedEffectMessage, outbound_finalize:true,
          delivery:{ external:true }, council_context:{ mode:'outbound_effect',
            parent_request_id:_requestId, parent_cycle_id:_cycleId,
            delivery_target:_effectDeliveryTarget,
            verified_evidence:[{ effect:_effect.name,
              target_ham_uid:_effectArgs.ham_uid || hamUid }] } };
        Object.defineProperty(_effectIdentity, '_voiceCancellation', {
          enumerable:false, value:_voiceCancellation || null });
        var _effectPai = await runPAI(hamUid, _effectDeliberation, 'sms', _effectIdentity);
        if (await _turnCancelled(true)) return _turnCancelledResult('after_effect_council');
        var _effectVerified = requireVerifiedCouncilResult(_effectPai, { hamUid:hamUid,
          requestId:_effectRequestId, cycleId:_effectPai&&_effectPai.cycleId,
          question:_proposedEffectMessage, deliberationInput:_effectDeliberation,
          answer:_effectPai&&_effectPai.answer, deliveryTarget:_effectDeliveryTarget });
        if (!_effectVerified || !_effectVerified.ok || !compactCouncilProof(_effectPai)) {
          _effectResults.push({ name:_effect.name, ok:false,
            reason:_effectPai&&_effectPai.reason || _effectVerified&&_effectVerified.reason
              || 'outbound_effect_council_unverified' });
          continue;
        }
        _effectArgs.message = _effectVerified.answer;
        _effectCouncilResult = _effectPai;
      } else if (_effect.name === 'calendar_book') {
        // ⬡B:core.tool_loop:GUARD:calendar_effect_exact_artifact_council:20260715⬡
        // Calendar writes are human-visible external effects too. A deterministic
        // nested council commits one lossless JSON artifact containing every field
        // Nylas will receive. The provider boundary re-verifies this full result.
        var _calendarHam = String(_effectArgs.ham_uid || hamUid).trim().toUpperCase();
        if (!_calendarHam || _calendarHam !== String(hamUid || '').trim().toUpperCase()) {
          _effectResults.push({ name:_effect.name, ok:false, reason:'calendar_booking_ham_mismatch' });
          continue;
        }
        var _calendarClaim = JSON.stringify({ title:_effectArgs.title,
          description:_effectArgs.description == null ? '' : _effectArgs.description,
          start:_effectArgs.start, end:_effectArgs.end == null ? null : _effectArgs.end });
        var _calendarTarget = { kind:'ham', value:_calendarHam };
        var _calendarRequestId = 'pai.effect.calendar.' + require('node:crypto')
          .createHash('sha256').update(JSON.stringify({ parent_request_id:_requestId,
            parent_cycle_id:_cycleId, index:_effectIndex, claim:_calendarClaim }), 'utf8')
          .digest('hex').slice(0, 32);
        var _calendarDeliberation = 'Finalize this exact calendar write through A\u2019NU\u2019s council. '
          + 'Return only one JSON object with exactly four keys: title, description, start, end. '
          + 'The start and end values must be byte-for-byte JSON-equal to the request claim. '
          + 'You may improve title and description, but add no unsupported facts and call no tools.\n\n'
          + 'LOSSLESS CALENDAR REQUEST CLAIM:\n' + _calendarClaim;
        var _calendarIdentity = { uid:_calendarHam, request_id:_calendarRequestId,
          user_message:_calendarClaim, outbound_finalize:true, delivery:{external:true},
          council_context:{ mode:'calendar_effect', parent_request_id:_requestId,
            parent_cycle_id:_cycleId, delivery_target:_calendarTarget } };
        Object.defineProperty(_calendarIdentity, '_voiceCancellation', {
          enumerable:false, value:_voiceCancellation || null });
        var _calendarPai = await runPAI(_calendarHam, _calendarDeliberation,
          'calendar', _calendarIdentity);
        if (await _turnCancelled(true)) return _turnCancelledResult('after_calendar_council');
        var _calendarExpected = { hamUid:_calendarHam, requestId:_calendarRequestId,
          cycleId:_calendarPai&&_calendarPai.cycleId, question:_calendarClaim,
          deliberationInput:_calendarDeliberation, answer:_calendarPai&&_calendarPai.answer,
          deliveryTarget:_calendarTarget };
        var _calendarVerified = requireVerifiedCouncilResult(_calendarPai, _calendarExpected);
        var _calendarProof = _calendarVerified&&_calendarVerified.ok
          ? compactCouncilProof(_calendarPai) : null;
        var _calendarArtifact = null;
        try { _calendarArtifact = JSON.parse(_calendarVerified&&_calendarVerified.answer || ''); }
        catch (eCalendarArtifact) { _calendarArtifact = null; }
        var _calendarKeys = _calendarArtifact && Object.keys(_calendarArtifact).sort().join(',');
        if (!_calendarVerified || !_calendarVerified.ok || !_calendarProof ||
            _calendarProof.committed !== true || _calendarProof.readback_verified !== true ||
            _calendarProof.row_count !== 9 || _calendarKeys !== 'description,end,start,title' ||
            typeof _calendarArtifact.title !== 'string' || !_calendarArtifact.title.trim() ||
            typeof _calendarArtifact.description !== 'string' ||
            JSON.stringify(_calendarArtifact.start) !== JSON.stringify(_effectArgs.start) ||
            JSON.stringify(_calendarArtifact.end) !== JSON.stringify(
              _effectArgs.end == null ? null : _effectArgs.end)) {
          _effectResults.push({ name:_effect.name, ok:false,
            reason:_calendarPai&&_calendarPai.reason || _calendarVerified&&_calendarVerified.reason
              || 'calendar_effect_council_unverified' });
          continue;
        }
        _effectArgs.ham_uid = _calendarHam;
        _effectArgs.title = _calendarArtifact.title;
        _effectArgs.description = _calendarArtifact.description;
        _effectArgs.start = _calendarArtifact.start;
        _effectArgs.end = _calendarArtifact.end;
        _effectArgs._bookingAuthorization = { councilResult:_calendarPai,
          expected:_calendarExpected, artifact:_calendarVerified.answer };
        _effectCouncilResult = _calendarPai;
      }
      if (await _turnCancelled(true)) return _turnCancelledResult('before_effect_commit');
      var _effectRaw = await executeTool(_effect.name, _effectArgs, hamUid, message,
        Object.assign({ phase:'commit', councilResult:_effectCouncilResult, parentCycleId:_cycleId,
          parentRequestId:_requestId, userMessage:message,
          abortSignal:_turnAbortSignal || null, isCancelled:_turnCancelled },
        { caraContext:identity && identity.council_context || {},
          codaVerified:_effectRuntime.codaVerified === true,
          activationDecisionRequired:_effectRuntime.activationDecisionRequired === true,
          codaActivationApproved:_effectRuntime.codaActivationApproved === true,
          codaActivationDecision:_effectRuntime.codaActivationDecision,
          codaDecisionSource:_effectRuntime.codaDecisionSource }));
      if (await _turnCancelled(true)) return _turnCancelledResult('after_effect_commit');
      var _effectParsed;
      try { _effectParsed = JSON.parse(_effectRaw); }
      catch (eEffectParse) { _effectParsed = { ok:false, reason:'effect_result_invalid' }; }
      _effectResults.push({ name:_effect.name, ok:!!(_effectParsed&&_effectParsed.ok),
        result:_effectParsed,
        councilProof:(_needsMessageCouncil || _effect.name === 'calendar_book')
          ? compactCouncilProof(_effectCouncilResult) : null });
    } catch (eEffect) {
      _effectResults.push({ name:_effect.name, ok:false, reason:eEffect.message });
    }
  }
  var _failedEffect = _effectResults.find(function (effectResult) {
    return !effectResult || effectResult.ok !== true;
  });
  if (_failedEffect) {
    _stampStep('post_council_effect_failed', _failedEffect.name + ': '
      + (_failedEffect.reason || _failedEffect.result && (_failedEffect.result.reason
        || _failedEffect.result.error) || 'unknown'));
    return { ok:false, reason:'post_council_effect_failed', blocked_by:_failedEffect.name,
      ham:hamObj, cycleId:_cycleId, requestId:_requestId,
      councilProof:compactCouncilProof(_council), side_effects:_effectResults.map(function (effectResult) {
        return { name:effectResult.name, ok:effectResult.ok,
          reason:effectResult.reason || effectResult.result && (effectResult.result.reason
            || effectResult.result.error) || null };
      }),
      tools_used:tools, iterations:iter, ms:Date.now()-t0 };
  }
  // ⬡B:core.tool_loop:COMMIT:post_council_effects_only:20260715⬡
  // No visible screen move and no completion record may precede the committed
  // council. A failed council therefore leaves no successful side-effect trail.
  if (await _turnCancelled()) return _turnCancelledResult('before_post_commit');
  try {
    if (_screenBlock) {
      var _screenCommit = require('./stream/screen.awareness.js');
      if (_screenCommit.hasLiveScreen(hamUid)) {
        var _screenResult = await _screenCommit.push(hamUid, _screenBlock);
        _screenPushed = (_screenResult && _screenResult.pushed) || 0;
      }
    }
  } catch (eScreenCommit) {}
  if (await _turnCancelled()) return _turnCancelledResult('before_completion');
  _stampStep('cycle_end', finalAns.slice(0,80) + (_screenPushed ? (' [screen:'+_screenPushed+']') : ''));
  try {
    var _fellTools = tools.filter(function (tu) { return tu && (tu.error || tu.failed); })
      .map(function (tu) { return tu.name || tu.tool || 'unknown'; });
    var _lineage = require('./lineage.attach.js');
    _stampStep('cycle_receipt', JSON.stringify(_lineage.attachLineage(
      { cycleId: _cycleId, requestId: _requestId, tools_used: tools, iterations: iter,
        ms: Date.now() - t0, fell: _fellTools, channel: channel,
        council_source: _councilReceipt && _councilReceipt.source },
      { chain: _structuredReachPolicy ? ['PAI', 'REACH_EVIDENCE']
          : ['PAI', 'MemoryBank'],
        deliveredBy: 'PAI cycle', why: _structuredReachPolicy
          ? 'closed-world exact candidate policy, full council committed'
          : (_fellTools.length
            ? _fellTools.length + ' tool(s) fell: ' + _fellTools.join(', ')
            : 'clean committed cycle, ' + tools.length + ' tool(s) ran'),
        audience: 'builder' }
    )));
  } catch (eRcpt) { /* diagnostic only, after the mandatory durable proof */ }
  try {
    if (await _turnCancelled()) return _turnCancelledResult('before_tracker');
    if (!_structuredReachPolicy && !_reachIncidentIntake && !_blockedFallback) {
      var _trkD = require('./tracker.js');
      if (_trkD.looksLikeActionRequest(_exactUserMessage)) {
        await _trkD.stampTrack({ hamUid: hamUid, status: 'DONE', kind: 'request',
          request: _exactUserMessage, channel: channel, cycleId: _cycleId, tools_used: tools,
          outcome: finalAns });
      }
    }
  } catch (eTrkDone) {}
  if (await _turnCancelled(true)) return _turnCancelledResult('before_release');
  var _successResult = {ok:true,answer:finalAns,screen_pushed:_screenPushed,ham:hamObj,cycleId:_cycleId,
    requestId:_requestId,request_id:_requestId,councilReceipt:_councilReceipt,council_receipt:_councilReceipt,
    stampProof:_stampProof,stamp_proof:_stampProof,
    tools_used:tools,iterations:iter,ms:Date.now()-t0,fcw_ms:(fcw&&fcw.ms)||0,fcw_build_ms:_fcwBuildMs,
    fcw_contributors:(fcw&&fcw.contributors)||null,
    fcw_contributors_resolved:(fcw&&fcw.contributorsResolved)||0,
    fcw_contributors_total:(fcw&&fcw.contributorsTotal)||0,
    _dbg:global._paiLastError||null};
  // Internal-only exact binding for synthesis re-verification. Non-enumerable so
  // a route cannot leak the armed deliberation prompt by serializing this result.
  Object.defineProperty(_successResult, '_councilBinding', { enumerable:false,
    value:{ question:_exactUserMessage, deliberationInput:String(message||''),
      deliveryTarget:_councilDeliveryTarget === undefined ? null
        : canonicalizeDeliveryTarget(_councilDeliveryTarget) } });
  Object.defineProperty(_successResult, 'side_effects', { enumerable:false,
    value:_effectResults });
  // A completed ordinary PAI cycle is the real REACH entry. The handoff first
  // stamps a durable per-HAM candidate, then lets the existing governed REACH
  // engine judge timing and channel. Outbound finalizer cycles are excluded so
  // REACH can never recursively trigger itself.
  if (_reachHandoffEligible) {
    var _reachHandoff;
    try {
      var _reachModule=require('./reach/cycle.handoff.js');
      var _incidentMayEnqueue=!_reachIncidentIntake||
        await reachIncidentFence(identity,'before_candidate_enqueue');
      if(!_incidentMayEnqueue){
        _reachHandoff={ok:false,reason:'reach_incident_claim_lost_before_candidate_enqueue'};
      }else{
        _reachHandoff=await _reachModule.enqueueCommittedCycle({ hamUid:hamUid,
          cycleId:_cycleId, requestId:_requestId, channel:channel, answer:finalAns,
          question:_exactUserMessage, deliberationInput:String(message||''),
          councilProof:compactCouncilProof(_council), councilResult:_council,
          // The committed council marker is the canonical world binding. Raw
          // identity/HAM labels may be mixed-case, conflicting, or deliberately
          // excluded from the allowlisted active-world lane.
          world:_council&&_council.council_receipt&&
            _council.council_receipt.reach_handoff
            ?_council.council_receipt.reach_handoff.world:null });
      }
      if(_reachHandoff&&_reachHandoff.ok===true&&_reachHandoff.candidate){
        var _durableCandidate=_reachHandoff.candidate;
        if(_reachIncidentIntake){
          if(await reachIncidentFence(identity,'before_candidate_consume')){
            await _reachModule.consumeEnqueued(_durableCandidate).catch(function(eReach){
              console.error('[REACH] durable incident candidate consume failed:',eReach.message);});
          }else{
            console.error('[REACH] durable incident candidate consume held: incident lease lost');
          }
        }else{
          setImmediate(function () {
            _reachModule.consumeEnqueued(_durableCandidate).catch(function(eReach){
              console.error('[REACH] durable candidate consume failed:',eReach.message);});
          });
        }
      }else{
        console.error('[REACH] durable cycle candidate failed:',
          _reachHandoff&&_reachHandoff.reason||'unknown');
      }
    } catch(eReachStamp) {
      _reachHandoff={ok:false,reason:'candidate_enqueue_failed:'+eReachStamp.message};
      console.error('[REACH] durable cycle candidate failed:',eReachStamp.message);
    }
    Object.defineProperty(_successResult,'_reachHandoff',{enumerable:false,
      value:_reachHandoff});
    _successResult.reach_handoff={candidate_committed:!!(_reachHandoff&&
      _reachHandoff.ok===true),source:_reachHandoff&&_reachHandoff.source||null,
      degraded:!(_reachHandoff&&_reachHandoff.ok===true),
      reason:_reachHandoff&&_reachHandoff.ok===true?null:
        _reachHandoff&&_reachHandoff.reason||'candidate_enqueue_unverified'};
    if(_successResult.reach_handoff.degraded)_successResult.degraded=true;
  }
  return _successResult;
}
module.exports={runPAI,_test:{executeTool,parseRoadmapActivationSpec,injectNamedAgentEvidence,injectIdentityProvenanceEvidence,openAiCompatibleHistory,
  primaryProviderBody,dayQuestionIntent,TOOLS,toolSelectionBoundary,NO_TOOL_BLESSING,planToolUse,
  TOOL_INTENT_NAMES,routeToolIntent,toolsForIntent,intentRequiresLiveTool,
  weatherArgsFromMessage,sportsArgsFromMessage,memoryArgsFromMessage,draftArgsFromMessage,requiredReadToolForMessage,
  prioritizeVerifiedEvidence,regenerateHollowAnswer,regenerateStructuredReachPolicy,scrubLeakedToolProtocol,
  repositoryReadTerms,repairCodaRepositoryDraft,shouldIncludeWorldContext,
  verifiedVoiceCallContext,voiceCallContextSatisfiesTurn,
  verifiedVoiceCallPurposeAnswer,voiceHearingContextSatisfiesTurn,
  verifiedVoiceHearingAnswer,voiceFarewellContextSatisfiesTurn,
  verifiedVoiceFarewellAnswer,voiceConversationalNoGenericLookup,
  bindExactHamToolArgs,structuredReachPolicyMode,reachIncidentIntakeMode,
  reachIncidentFence}};
