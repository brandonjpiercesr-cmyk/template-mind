// ⬡B:core.channel.classifier:MODULE:channel_type_classifier:20260617⬡
// ⬡B:clair.ruling:ORPHAN-DEFERRED:no_live_caller_birth_agent_decides:20260711⬡ CLAIR+A’NEW: real code, no live caller found. Not deleted (may be revived by a future feature); birth-agent migration makes the final delete-vs-wire call.
// Classifies A'NEW channel strings into their surface category.
// Used by A'NU to format output correctly for each channel.
// ANYHAM test: pure utility. No HAM identity. Any caller can use it.
// No requires. No external calls. Pure JavaScript.

var VOICE_CHANNELS = ['voice', 'vara', 'omi_voice', 'twilio_voice', 'phone'];
var EMAIL_CHANNELS = ['email', 'email_external', 'email_urgent', 'email_internal', 'email_gmg', 'email_personal'];
var WREN_CHANNELS = ['wren', 'sms', 'text'];
var CCWA_CHANNELS = ['ccwa', 'coding', 'command_center'];

function classifyChannel(channel) {
  if (!channel || typeof channel !== 'string') return 'unknown';
  var ch = channel.toLowerCase();
  if (VOICE_CHANNELS.indexOf(ch) !== -1) return 'voice';
  if (EMAIL_CHANNELS.indexOf(ch) !== -1 || ch.startsWith('email_')) return 'email';
  if (WREN_CHANNELS.indexOf(ch) !== -1) return 'wren';
  if (CCWA_CHANNELS.indexOf(ch) !== -1) return 'ccwa';
  return 'chat';
}

function isVoiceChannel(channel) {
  return classifyChannel(channel) === 'voice';
}

function isEmailChannel(channel) {
  return classifyChannel(channel) === 'email';
}

module.exports = { classifyChannel: classifyChannel, isVoiceChannel: isVoiceChannel, isEmailChannel: isEmailChannel };