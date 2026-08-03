// ⬡B:core.channel_physics:MODULE:she_knows_the_medium_she_is_speaking_into:20260803⬡
// entered via the wall builder on every turn; serves channel internal.
//
// FOUNDER DIRECT, 20260803, from his own read of the live voice platform's settings: "soft
// timeout. If we do it right... If she knows what AIR code she has to play with, won't she
// be better?" He is right, and the gap was real: the wall carried the bare channel NAME
// ('Channel: voice') and nothing else, so she answered a live phone call, a text thread and
// an email with no knowledge of the medium's physics. The freestyle chatter spec had already
// recorded the same hole ("No channel intensity table... anywhere in code. Doctrine only,
// GOVERNORS_DOCTRINE_20260723.md:142-148"). This module is that table, born as code.
//
// COLD FACTS ABOUT THE MEDIUM, NEVER HER VOICE AND NEVER AN INSTRUCTION SCRIPT. Each entry
// states what the channel physically is and does, the way the wall already states her
// capabilities and trust tier: labeled facts she reads and reasons over. Nothing here
// composes a sentence she would say, decides what she says, or caps what she may do; how to
// speak into a medium once she knows its shape is her judgment, exactly the Governors
// Doctrine's own line that streaming intensity is decided by the LLM told what channel it
// lives on. An unknown channel returns an empty string: absence over invention, always.
'use strict';

var PHYSICS = {
  voice: 'a live phone call. Your words are spoken aloud by a voice engine; the person '
    + 'hears you and sees nothing, so formatting, links and lists do not exist here. '
    + 'About two seconds of silence triggers a brief non-word filler sound while you '
    + 'finish thinking. The person can interrupt you mid-sentence and you will be cut '
    + 'off cleanly. Short, natural, conversational answers carry best; long monologues '
    + 'lose the listener and risk the carrier trimming them.',
  omi: 'a wearable that heard them speak. They are not looking at a screen and there is '
    + 'no reply surface on the device; your answer arrives as a text message on their '
    + 'phone, read later or at a glance. Compact and complete beats conversational here.',
  text: 'a text-message thread on their phone. Short messages, plain words, no markdown '
    + 'rendering. A wall of text reads as multiple bubbles; one clear message beats three '
    + 'fragments, and never a spam of message after message.',
  email: 'a composed email, read whenever they open it. Nothing streams and nothing is '
    + 'live; structure, completeness and a clear subject matter more than brevity. This '
    + 'is the one channel where longer, organized writing is the right register.',
  portal: 'a live screen they are watching right now. Formatting renders, interim '
    + 'progress can show while your full answer cooks, and they can see updates land in '
    + 'real time.',
  cara: 'a chat window on a screen. Formatting renders and the conversation flows '
    + 'turn by turn; answers can breathe more than a text message but should still read '
    + 'in one screen.'
};

// channelPhysicsLine(channel) -> string. The one line the wall folds in beside the channel
// name. Empty for an unknown or absent channel, never a guess about a medium this table has
// not recorded. The channel key is folded to lower case for LOOKUP only, a table key match,
// not an identity comparison (RULINGS 20260802: the collapse law governs identifiers that
// decide whose data something is; a channel is a medium name with a fixed enum, and an
// unrecognized value falls to empty rather than to anyone else's entry).
function channelPhysicsLine(channel) {
  var key = String(channel == null ? '' : channel).trim().toLowerCase();
  if (!key || !Object.prototype.hasOwnProperty.call(PHYSICS, key)) return '';
  return PHYSICS[key];
}

module.exports = { channelPhysicsLine: channelPhysicsLine, _test: { PHYSICS: PHYSICS } };
