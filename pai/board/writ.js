// ⬡B:board.writ:MODULE:writing_standards:20260617⬡
// ⬡B:board.writ:REDIRECT:thin_reexport_post_cookoff:20260713⬡
// This file used to be a full second implementation of writCheck (sync,
// diverged from board/writ/writ.js's async version -- same function name,
// incompatible signatures). Consolidated via a real cook-off (opus-4-8 won,
// judged by Fable 5, ⬡B:wonder.cookoff:RESULT:run:20260713⬡): the canonical
// implementation now lives at board/writ/writ.js. This file is a thin
// re-export so old requirers of './writ' keep working unchanged.
module.exports = require('./writ/writ.js');
