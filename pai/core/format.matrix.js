// ⬡B:core.format_matrix:MODULE:per_destination_output_formatting:20260711⬡
// THE FORMAT MATRIX. Founder doctrine pt6: 'Every spot she's going to should have a
// preferred way to get its results streamed... look at the screenshots, it's hard to
// follow because the formatting is very bad.' Real cause found live: advisor output
// carries raw markdown (# headers, **bold**, *italic*, --- rules, backtick code,
// pipe tables) into surfaces that render it as PLAIN TEXT, so the founder sees the
// literal asterisks and pound signs instead of formatting. This is the fix: one
// formatter, one preferred shape per destination, applied wherever that destination
// renders -- not per-advisor, not per-card.
'use strict';

function stripMarkdown(text) {
  var t = String(text || '');
  // headers: '# Title' / '## Title' -> just the title, own line, no clutter
  t = t.replace(/^#{1,6}\s*(.+)$/gm, '$1');
  // bold/italic: **x** or *x* or __x__ or _x_ -> just x (single-char asterisk math is rare
  // enough in this content that stripping wins; doctrine already bans decorative asterisks)
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/__(.+?)__/g, '$1');
  // inline code: `x` -> x
  t = t.replace(/`([^`]+)`/g, '$1');
  // horizontal rules: a line of only -, _, or * -> drop entirely
  t = t.replace(/^[\-_*]{3,}\s*$/gm, '');
  // markdown bullets '- item' or '* item' -> a clean bullet
  t = t.replace(/^[ \t]*[-*][ \t]+/gm, '\u2022 ');
  // pipe tables: a header/divider/row block -> readable "Field: Value" lines
  t = t.replace(/^\|(.+)\|\s*\n\|[\s:|-]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm, function (m, headerRow, bodyRows) {
    var headers = headerRow.split('|').map(function (h) { return h.trim(); }).filter(Boolean);
    var lines = bodyRows.trim().split('\n').map(function (row) {
      var cells = row.split('|').map(function (c) { return c.trim(); }).filter(Boolean);
      return cells.map(function (c, i) { return (headers[i] ? headers[i] + ': ' : '') + c; }).join(' \u00b7 ');
    });
    return lines.join('\n') + '\n';
  });
  // collapse 3+ blank lines to 1
  // ⬡B:core.format_matrix:FIX:em_dash_scrub_universal_20260712⬡
  // WRIT standard: no em dashes (or en dashes) in output, ever. A live reply leaked
  // 'right now—its inbox'. synthesize replaced em with EN dash (still a dash); and
  // format.matrix -- the universal choke point every channel passes through -- did
  // not scrub dashes at all. Fixed here so ALL channels are covered in one place: an
  // em/en dash between words becomes a comma (the WRIT-correct substitution), a
  // trailing/standalone one becomes nothing.
  t = t.replace(/\s*[\u2014\u2013]\s*/g, ', ');
  t = t.replace(/,\s*,/g, ',');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// destinations: 'command_center' / 'stream' -> plain readable text, no markdown syntax.
// 'email' -> leave markdown-free HTML compose (board/compose.js) untouched, not this path.
// 'sms' -> plain text, hard-capped short.
function formatForDestination(text, destination) {
  var dest = String(destination || 'command_center').toLowerCase();
  var clean = stripMarkdown(text);
  // ⬡B:core.format_matrix:FIX:sms_cap_was_cutting_mid_sentence_20260712⬡
  // Founder screenshot: text replies cut off mid-sentence ('This expense', 'Surface
  // in Cle'). Cause: a hard 300-char slice. iMessage (Blooio/TAP) has no 160-char SMS
  // limit, so 300 was both wrong and cutting mid-word. Raise to a generous cap and,
  // if it must cut, cut on a sentence boundary so a reply never ends mid-thought.
  if (dest === 'sms' || dest === 'text') {
    if (clean.length <= 1500) return clean;
    var cut = clean.slice(0, 1500);
    var lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    return lastStop > 900 ? cut.slice(0, lastStop + 1) : cut;
  }
  return clean;
}

module.exports = { formatForDestination: formatForDestination, stripMarkdown: stripMarkdown };
