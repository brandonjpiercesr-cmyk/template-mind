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
  return /^(?:(?:hey|hello|hi|yo|k|ok|okay)(?:\s*[.!,:-]+\s*|\s+))?(?:so\s*,?\s*)?(?:(?:but\s+)?why(?:\s*,?\s*(?:though|exactly))?|why(?:'d|\s+did|\s+have|\s+are)?\s+you\s+(?:call(?:ed|ing)?(?:\s+me)?|initiate(?:d)?\s+(?:this|the)?\s*call|reach(?:ed|ing)?\s+out)|why\s+(?:are|were)\s+we\s+on\s+(?:this|the)\s+call|what(?:'s|\s+is|\s+was)?\s+(?:this|the|your)\s+call\s+about|what\s+(?:are|were)\s+you\s+calling\s+(?:me\s+)?about|(?:what(?:'s|\s+is|\s+was)?\s+)?(?:the\s+)?reason\s+(?:for|behind)\s+(?:this|the|your)\s+call|(?:what(?:'s|\s+is|\s+was)?\s+)?(?:the\s+)?purpose\s+of\s+(?:this|the|your)\s+call|(?:(?:can|could|would|will)\s+you\s+)?remind\s+me\s+why\s+you\s+called(?:\s+me)?|what\s+(?:(?:do|did)\s+)?you\s+want|what\s+can\s+i\s+do\s+for\s+you)(?:\s+(?:today|right\s+now|just\s+now|again))?\s*[?.!]*$/i.test(exact);
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
  isPureGreeting: isPureGreeting,
  isTrivialGreetingAnswer: isTrivialGreetingAnswer
};
