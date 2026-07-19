// ⬡B:channel.confidence:BUILD:per_channel_confidence_thresholds_the_speed_mechanic_B4:20260718⬡
// WONDER DOCTRINE build B4 (doctrine 383016). The heart of the speed design: the SAME
// cycle machinery behaves differently by channel PURELY through confidence thresholds.
// This is the mechanism, not phrasing.
//
//   - On a PAI AUTONOMOUS cycle: instructions FAVOR WAKING the cook. The confidence
//     needed to trigger a full deliberation is set EASIER, encouraging the cycle to run.
//   - On a LIVE PHONE: confidence is set to ENCOURAGE READING / Agent FIND microsecond
//     hopping -- easier to just FIND and answer, HARDER to wake a full cook.
//   - CARA, TAP, IMAN behave like the autonomous cycle: tuned to encourage the cook.
//
// A LOWER wake threshold = easier to wake the full cook. A HIGHER wake threshold =
// harder to wake, so the channel prefers the fast FIND micro-hop instead. This module
// is the single source of those thresholds; nothing hardcodes a per-channel number
// anywhere else. Every value is env-overridable so tuning never needs a code change.
// Cold code: it returns a deterministic number for a channel, it judges no meaning.

function envNum(key, dflt) {
  var v = parseFloat(process.env[key]);
  return (isFinite(v) ? v : dflt);
}

// wakeThreshold: the confidence a turn must reach to WAKE THE FULL COOK on this channel.
// findFirst: whether this channel should try the fast FIND micro-hop BEFORE waking a cook.
var CHANNEL_CONFIDENCE = {
  // Autonomous + async-assistant channels: favor the cook (low wake threshold).
  autonomous:     { wakeThreshold: envNum('WAKE_AUTONOMOUS', 0.20), findFirst: false },
  cara:           { wakeThreshold: envNum('WAKE_CARA',       0.25), findFirst: false },
  tap:            { wakeThreshold: envNum('WAKE_TAP',        0.25), findFirst: false },
  iman:           { wakeThreshold: envNum('WAKE_IMAN',       0.25), findFirst: false },
  email:          { wakeThreshold: envNum('WAKE_EMAIL',      0.25), findFirst: false },
  command_center: { wakeThreshold: envNum('WAKE_CC',         0.30), findFirst: false },
  // Live phone: favor fast FIND (high wake threshold, try FIND first).
  voice:          { wakeThreshold: envNum('WAKE_VOICE',      0.70), findFirst: true  },
  phone:          { wakeThreshold: envNum('WAKE_PHONE',      0.70), findFirst: true  },
  // Live text is between: readable pace, but still favor a quick FIND when it can.
  text:           { wakeThreshold: envNum('WAKE_TEXT',       0.55), findFirst: true  },
  sms:            { wakeThreshold: envNum('WAKE_SMS',        0.55), findFirst: true  }
};

// Default for any channel not named: middle-of-the-road, no strong preference.
var DEFAULT = { wakeThreshold: envNum('WAKE_DEFAULT', 0.50), findFirst: false };

function forChannel(channel) {
  var key = String(channel || '').toLowerCase();
  return CHANNEL_CONFIDENCE[key] || DEFAULT;
}

// shouldWakeFullCook: given a channel and a turn's confidence-to-matter score (0..1),
// return true if the cook should wake. Lower threshold channels wake more easily.
// FAILS OPEN: if confidence is unknown (null/NaN), wake the cook rather than stay
// silent -- a missing score must never cause a dropped turn.
function shouldWakeFullCook(channel, confidence) {
  var cfg = forChannel(channel);
  if (confidence == null || !isFinite(confidence)) return true; // fail open: wake
  return confidence >= cfg.wakeThreshold;
}

// shouldTryFindFirst: whether to attempt the fast FIND micro-hop before a full cook.
function shouldTryFindFirst(channel) {
  return forChannel(channel).findFirst === true;
}

module.exports = {
  CHANNEL_CONFIDENCE: CHANNEL_CONFIDENCE,
  forChannel: forChannel,
  shouldWakeFullCook: shouldWakeFullCook,
  shouldTryFindFirst: shouldTryFindFirst
};
