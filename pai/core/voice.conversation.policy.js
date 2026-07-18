// ⬡B:core.voice_conversation_policy:MODULE:signed_call_turn_shapes:20260717⬡
'use strict';

function normalized(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ');
}

// This is intentionally a whole-utterance policy. A signed provider handoff
// can answer these exact questions from its bound call purpose, but it cannot
// consume a second action, calendar, identity, or factual request.
function isCallPurposeQuestion(value) {
  var exact = normalized(value);
  return /^(?:(?:hey|hello|hi|yo|k|ok|okay)(?:\s*[.!,:-]+\s*|\s+))?(?:so\s*,?\s*)?(?:(?:but\s+)?why(?:\s*,?\s*(?:though|exactly))?|why(?:'d|\s+did|\s+have|\s+are)?\s+you\s+(?:call(?:ed|ing)?(?:\s+me)?|initiate(?:d)?\s+(?:this|the)?\s*call|reach(?:ed|ing)?\s+out)|why\s+(?:are|were)\s+we\s+on\s+(?:this|the)\s+call|what(?:'s|\s+is|\s+was)?\s+(?:this|the|your)\s+call\s+about|what\s+(?:are|were)\s+you\s+calling\s+(?:me\s+)?about|(?:what(?:'s|\s+is|\s+was)?\s+)?(?:the\s+)?reason\s+(?:for|behind)\s+(?:this|the|your)\s+call|(?:what(?:'s|\s+is|\s+was)?\s+)?(?:the\s+)?purpose\s+of\s+(?:this|the|your)\s+call|(?:(?:can|could|would|will)\s+you\s+)?remind\s+me\s+why\s+you\s+called(?:\s+me)?|what(?:\s*[?.!,;:]+\s*|\s+)(?:(?:do|did)\s+)?you\s+want|what\s+can\s+i\s+do\s+for\s+you)(?:\s+(?:today|right\s+now|just\s+now|again))?\s*[?.!]*$/i.test(exact);
}

var HEARING_ACKNOWLEDGEMENT = 'I can hear you.';

// Speech-to-text can coalesce repeated hearing checks into one final
// transcript. Keep this a closed whole-utterance grammar: every clause must be
// a hearing check, so a factual question or action cannot ride the fast lane.
function isHearingCheck(value) {
  var exact = normalized(value);
  var clause = '(?:(?:can|could|do)\\s+you\\s+(?:not\\s+)?hear\\s+me|' +
    '(?:are|were)\\s+you\\s+(?:not\\s+)?hearing\\s+me|' +
    "you(?:\\s+are|'re)?\\s+not\\s+hearing\\s+me)";
  return new RegExp(
    '^(?:(?:hey|hello|hi|yo)(?:\\s+there)?(?:\\s*[?.!,;:-]+\\s*|\\s+))?' +
    clause + '(?:(?:\\s*[?.!,;:-]+\\s*|\\s+)' + clause + ')*\\s*[?.!]*$', 'i'
  ).test(exact);
}

function isHearingAcknowledgement(value) {
  return String(value || '').trim() === HEARING_ACKNOWLEDGEMENT;
}

var FAREWELL_ACKNOWLEDGEMENT = 'Talk soon.';

// A farewell can close the provider conversation without consulting memory or
// a model only when the entire transcript is a goodbye. The optional lead-in
// covers natural speech such as "Okay, goodbye" and "Thanks, see you later"
// while the end anchor keeps any appended fact or action on the normal path.
function isFarewell(value) {
  var exact = normalized(value);
  return /^(?:(?:ok|okay|alright|thanks|thank\s+you)(?:\s*[,.!:-]+\s*|\s+))?(?:good\s*bye|bye(?:\s+bye)?|see\s+you(?:\s+(?:later|soon))?|talk(?:\s+to\s+you)?\s+(?:later|soon)|catch\s+you\s+later)\s*[.!?]*$/i.test(exact);
}

function isFarewellAcknowledgement(value) {
  return String(value || '').trim() === FAREWELL_ACKNOWLEDGEMENT;
}

// A committed opener may be reused as the exact answer to "why did you call?"
// only when it already states A'NU's purpose in the first person. This excludes
// provider instructions and recipient prompts such as "could you say ...?".
function isReusableCallPurposeStatement(value) {
  var raw = String(value || '').trim();
  if (!raw || raw.length > 280 || /[\r\n]/.test(raw)) return false;
  var core = normalized(raw);

  // Permit a greeting/name vocative without making the recipient the subject.
  core = core.replace(/^(?:hey|hello|hi)\s*[,!.-]\s*/i, '');
  core = core.replace(/^(?:(?:hey|hello|hi)\s+)?(?!(?:call|email|text|message|send|ask|tell|please|can|could|would|will|do|did|what|why|how|when|where|who|this|i|we)\b)[a-z][a-z'-]{0,39}(?:\s+[a-z][a-z'-]{0,39}){0,2}\s*[,!.:-]\s*/i, '');

  var words = core.split(/\s+/).filter(Boolean);
  if (words.length < 4 || words.length > 40 || /[?？;]/.test(core) ||
      /[.!]\s+\S/.test(core)) return false;

  // The connector must immediately describe why this speaker called/reached
  // out. "Call Brandon..." and "I'm calling Brandon..." therefore fail.
  var firstPersonPurpose = /^(?:(?:i(?:'m|\s+am)|we(?:'re|\s+are))\s+(?:calling\s+(?:to|about|because|regarding|for)\b|reaching\s+out\s+(?:to|about|because|regarding)\b|checking\s+in\s+(?:to|about|because|on|with)\b|following\s+up\s+(?:to|about|because|on|with)\b|here\s+(?:to|about|because)\b)|(?:i|we)\s+(?:called\s+(?:to|about|because|regarding)\b|reached\s+out\s+(?:to|about|because|regarding)\b|wanted\s+to\b|want\s+to\b|needed\s+to\b|need\s+to\b)|(?:i|we)'d\s+like\s+to\b)/i;
  if (!firstPersonPurpose.test(core)) return false;

  // A first-person wrapper cannot smuggle a request for the recipient to do or
  // repeat something. Those turns need fresh deliberation, not purpose reuse.
  if (/\b(?:can|could|would|will|do|did|are|were|have|has)\s+you\b/i.test(core) ||
      /\b(?:ask|have|need|want|wanted|needed|tell)\s+you\s+to\b/i.test(core) ||
      /^(?:(?:i|we)\s+(?:want|wanted|need|needed)\s+to|(?:i|we)'d\s+like\s+to)\s+(?:call|email|text|message|contact|send)\b/i.test(core) ||
      /(?:^|[,!:]\s*|\b(?:and|then|so)\s+)(?:please\s+)?(?:say|repeat|tell|answer|send|email|text|call|message)\b/i.test(core)) {
    return false;
  }
  return true;
}

// Autonomous REACH needs a closed executable opener contract, not an endless
// semantic denylist. The full PAI still owns whether to call and the grounded
// reason; it selects one complete provider-bound sentence from this tiny set.
// Exact whole-sentence membership prevents a greeting, suffix, punctuation, or
// second clause from smuggling a request. Ordinary/manual call purposes keep
// the broader reusable grammar above.
var AUTONOMOUS_REACH_VOICE_PURPOSES = Object.freeze([
  "Hi, I'm calling to test whether REACH can hold a natural live conversation now.",
  "Hi, I'm calling to discuss a time-sensitive matter that needs a live answer now.",
  "Hi, I'm calling to share a time-sensitive update in a live conversation now.",
  "Hi, I'm calling to follow up on our ongoing conversation while it is still timely.",
  "Hi, I'm calling to check in because a live conversation seems appropriate now.",
  "Hi, I'm calling to continue a time-sensitive conversation now."
]);
var AUTONOMOUS_REACH_VOICE_PURPOSE_SET = new Set(AUTONOMOUS_REACH_VOICE_PURPOSES);

function isAutonomousReachVoicePurposeStatement(value) {
  if (typeof value !== 'string' ||
      !AUTONOMOUS_REACH_VOICE_PURPOSE_SET.has(value)) return false;
  if (!isReusableCallPurposeStatement(value)) return false;
  return true;
}

function isPureGreeting(value) {
  return /^(?:hey|hi|hello|yo)(?:\s+there)?\s*[?.!]*$/i.test(normalized(value));
}

// These answers contain no claim about a person, schedule, memory, or external
// state. The signed call itself proves the narrow "I am here" response state.
// Anything outside this closed grammar still gets the ordinary SHADOW model.
function isTrivialGreetingAnswer(value) {
  var exact = normalized(value);
  return /^(?:hey|hi|hello)(?:\s+there)?\s*[,!.?]*(?:\s+(?:i(?:'m|\s+am)\s+here|i\s+hear\s+you|go\s+ahead|what'?s\s+up|how\s+are\s+you(?:\s+doing)?|how'?s\s+it\s+going)\s*[,!.?]*){0,2}$/i.test(exact);
}

module.exports = {
  normalized: normalized,
  isCallPurposeQuestion: isCallPurposeQuestion,
  HEARING_ACKNOWLEDGEMENT: HEARING_ACKNOWLEDGEMENT,
  isHearingCheck: isHearingCheck,
  isHearingAcknowledgement: isHearingAcknowledgement,
  FAREWELL_ACKNOWLEDGEMENT: FAREWELL_ACKNOWLEDGEMENT,
  isFarewell: isFarewell,
  isFarewellAcknowledgement: isFarewellAcknowledgement,
  isReusableCallPurposeStatement: isReusableCallPurposeStatement,
  AUTONOMOUS_REACH_VOICE_PURPOSES: AUTONOMOUS_REACH_VOICE_PURPOSES,
  isAutonomousReachVoicePurposeStatement: isAutonomousReachVoicePurposeStatement,
  isPureGreeting: isPureGreeting,
  isTrivialGreetingAnswer: isTrivialGreetingAnswer
};
