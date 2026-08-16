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
  // ⬡B:core.format_matrix:PEN:the_formatter_stopped_editing_her_arithmetic:20260815⬡
  // MIRRORED BY HAND from anew, NOT copied, because this file is not a synced pair and the two
  // copies have already drifted: this one still carries the 1500-character SMS cap that anew
  // retired on 20260805, which cuts her mid-sentence. That cap is a separate row and is left
  // alone here rather than swept in under this change's name.
  //
  // THE COMMENT THIS SUPERSEDES said "single-char asterisk math is rare enough in this content
  // that stripping wins." It is not rare and stripping never wins, because the cost is not a lost
  // asterisk, it is a WRONG NUMBER in her mouth. MEASURED before this change:
  //   "Your 2*3 grid and the 5*8 board are ready."  ->  "Your 23 grid and the 58 board are ready."
  //   "The multiplication is 3 * 4 * 5 = 60."       ->  "The multiplication is 3  4  5 = 60."
  //   "Copy *.txt and src/**/*.js into the build."  ->  "Copy .txt and src//.js into the build."
  // This runs BEFORE the outbound council, so the council deliberated over and STAMPED corrupted
  // arithmetic as hers, which is the receipt vouching for words she never composed.
  //
  // THE FIX IS THE MARKDOWN RULE ITSELF, not a wider ban. An emphasis delimiter opens with no
  // whitespace after it, closes with no whitespace before it, and does not sit between two word
  // characters. Arithmetic, globs and mid-word snake case each fail at least one of those, so
  // they survive while every real bold and italic still strips.
  // ONE CASE HONESTLY LEFT STANDING: a standalone __init__ still strips to init, because with a
  // space on each side it cannot be told from a real __bold__. Named rather than fixed quietly.
  // ⬡B:core.format_matrix:HEAL:my_first_rules_broke_the_job_they_were_fixing:20260815⬡
  // A BLIND CRITIC CAUGHT A REGRESSION I SHIPPED, and measuring it found a second one the
  // critic had not seen. My first version of these rules had two defects:
  //   (a) the closing guard `(?![\w*])` rejected bold that closes against a word character.
  //       That is VALID CommonMark (asterisk emphasis allows an intraword close; only
  //       underscore forbids it) and it is ordinary output. MEASURED: "That is **3**x faster"
  //       and "We support two **API**s" both kept their raw asterisks, so the formatter failed
  //       its actual job and a person's SMS showed literal markdown.
  //   (b) the inner `[^\n]+?` could span ACROSS an unrelated delimiter pair on the same line,
  //       which pairs the wrong asterisks. MEASURED on one real line:
  //         "That is **3**x faster. ... Copy src/**/*.js in."  ->  "3**x ... src//*.js"
  //       So a glob got corrupted anyway, by the very rules written to protect it. Neither of
  //       my single-defect test lines caught this, because both needed only ONE pair per line.
  // THE CURE FOR BOTH: the inner content may not contain the delimiter, so a pair can never
  // reach past its own partner; and the close is guarded only against another asterisk, so
  // intraword bold works again. The OPENING guard is what protects arithmetic, and it is
  // untouched: 2**10, 2**3 and src/**/ are all rejected at the open, never at the close.
  // NAMED, NOT CLAIMED AWAY: "20**C**" and "5**stars**" still keep their asterisks, because the
  // opening guard cannot tell that bold from an exponent. That is a real remaining tradeoff.
  //   (c) AND THE GLOB STILL BROKE, order-dependently, which only a line carrying BOTH shapes
  //       revealed. `src/**` has an UNPAIRED `**`, so it happily paired with a later `**` from
  //       an exponent further along the same line. MEASURED after fixing (a) and (b):
  //         "That is **3**x faster. Copy src/**/*.js in. Memory 2**10."
  //           -> "That is 3x faster. Copy src//*.js in. Memory 210."
  //       My own earlier test line had the same three shapes in a DIFFERENT ORDER, so nothing
  //       followed the glob to pair with and it passed. A fixture whose ordering happens to be
  //       kind is the fixture-cleaner-than-the-world failure, one more time.
  //       The cure is one character in the opening guard: a path separator before `**` means a
  //       GLOB, not an emphasis opener, so it can never open a pair at all.
  t = t.replace(/(^|[^\w*\/])\*\*\*(?![\s*])((?:(?!\*\*\*)[^\n])+?)(?<![\s*])\*\*\*(?!\*)/g, '$1$2');
  t = t.replace(/(^|[^\w*\/])\*\*(?![\s*])((?:(?!\*\*)[^\n])+?)(?<![\s*])\*\*(?!\*)/g, '$1$2');
  t = t.replace(/(^|[^\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])/g, '$1$2');
  t = t.replace(/(^|[^\w_])__(?![\s_])((?:(?!__)[^\n])+?)(?<![\s_])__(?![\w_])/g, '$1$2');
  // inline code: `x` -> x, and a fenced block keeps its fence. The old single-backtick rule ate
  // one backtick off ```js, so a code block she wrote arrived malformed.
  t = t.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '$1');
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
