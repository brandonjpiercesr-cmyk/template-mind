// ⬡B:core.hollow.gate:MODULE:one_hollow_law_all_channels:20260706⬡
// entered via the ABAHAM door, serving channel MESSAGES (the last check before any channel speaks)
// L4, REAL PAI CYCLE. The hollow-reply law (20260630) lived as an inline list
// in the text channel, a per-route check on voice, and NOT AT ALL on email,
// so a canned holding line could still ship by email while text refused the
// identical string. One law, one gate, every channel: a reply is either a
// real answer or the channel stays silent. This module judges; the channel
// obeys. UNIVERSALITY: no identity here, pure text judgment.
'use strict';
// COLD-CODE-BY-DESIGN, recorded: hollow detection is a mechanical membership
// and shape check, exactly the class doctrine says must NOT use a model.

var HOLLOW = [
  'i hear you.', 'i hear you', 'i hear you. give me a moment.',
  'give me a moment.', 'one moment.', 'one moment', 'hold on.',
  '(no answer)', '(no response)', '[object object]',
  'sorry, i did not catch that.', "sorry, i didn't catch that. say it again?",
  'working on it.', 'processing.', 'let me check.'
];

// Returns { hollow: boolean, reason: string|null }.
// A channel that receives hollow:true stays SILENT, stamps why, sends nothing.
function isHollow(text) {
  if (text == null) return { hollow: true, reason: 'no_text' };
  if (typeof text !== 'string') return { hollow: true, reason: 'not_a_string' };
  var t = text.trim();
  if (!t) return { hollow: true, reason: 'empty' };
  if (t.indexOf('[object Object]') >= 0) return { hollow: true, reason: 'stringified_object' };
  var low = t.toLowerCase().replace(/\s+/g, ' ');
  if (HOLLOW.indexOf(low) >= 0) return { hollow: true, reason: 'canned_holding_string' };
  // A reply that is ONLY punctuation or ellipses is a holding noise, not an answer.
  if (/^[.\u2026!?,\s-]+$/.test(t)) return { hollow: true, reason: 'punctuation_only' };
  return { hollow: false, reason: null };
}

module.exports = { isHollow: isHollow, HOLLOW: HOLLOW };
