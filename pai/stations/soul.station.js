// ⬡B:pai.stations.soul:CORRECT:soul_honest_stub_pending_word_refounding_not_a_fake_name_of_the_day:20260719⬡
// FOUNDER CORRECTION 20260719. CLAIR's first SOUL was a flatten: 12 generic names on a modulo
// rotation, presented as "the daily spiritual agent." That is a caricature. Deep IMB research
// (the founder's own history) shows the REAL SOUL is enormous and was REFOUNDED:
//
//   - SOUL was RENAMED to WORD on 2026-04-19 (meaning expanded to "Walking Out Righteous
//     Discipline", still also "Spiritual Oversight and Understanding Liaison").
//   - It produces a full 10-SECTION daily spiritual routine, NOT a name-of-the-day:
//     Morning Greetings to the Trinity, the Better Man Challenge (Brian Dawkins framework:
//     TIME, MOTION, ATTITUDE, REMINDER, PRM), Names of God Study, Breath Challenge, Scripture
//     Memory (NKJV via bolls.life), Exercise Time, Foundation Scriptures + Declarations, Daily
//     Prophecy Summary, Book Time, Answer Key.
//   - Real Names of God LIBRARY: 26 standard + 13 lesser-known, each with pronunciation,
//     meaning, scripture, context, word study; 5 per day, double-exposure rule for the
//     lesser-known, aggressive anti-repeat (avoid the last ~15 used).
//   - The founder's ACTUAL library: prophecy archive 2014-2025 (verbatim, named sources),
//     17 sermons, 5 foundation scriptures, 5 declarations, 4 prayer-focus items.
//   - NEVER-DOES: never invents spiritual content or prophecies (verbatim from source ONLY);
//     never uses a translation other than NKJV without permission; never a fabricated
//     "word of the day" (a specific past bug -- a fake word "Equipoise" -- was corrected).
//
// The founder was explicit: SOUL is REAL but must get a FRESH identity decided by A'NU and the
// founder TOGETHER (a refounding), not a hand-port of the old shell. That refounding is not
// CLAIR's to decide alone, and A'NU's consult path is being repaired in another lane. So this
// file is deliberately an HONEST STUB: it does NOT pretend to be the daily spiritual agent, it
// surfaces nothing fabricated, and it carries the full real spec inline so the refounding
// session has it. It exposes the same surface names DAWN calls so nothing breaks, but returns
// null (no offering) until WORD is properly refounded from the founder's real library.

var persona = require('../core/persona.js');

// The real spec, kept inline so the A'NU+founder refounding session has it in one place.
var WORD_SPEC = {
  renamed_to: 'WORD',
  meanings: ['Walking Out Righteous Discipline', 'Spiritual Oversight and Understanding Liaison'],
  ten_sections: ['Morning Greetings to the Trinity','Better Man Challenge (Brian Dawkins: TIME MOTION ATTITUDE REMINDER PRM)',
    'Names of God Study','Breath Challenge','Scripture Memory (NKJV via bolls.life)','Exercise Time',
    'Foundation Scriptures + Declarations','Daily Prophecy Summary','Book Time','Answer Key'],
  names_of_god: '26 standard + 13 lesser-known, each with pronunciation/meaning/scripture/context/word study; 5/day, double-exposure for lesser-known, avoid last ~15',
  founder_library: 'prophecy archive 2014-2025 (verbatim, named sources), 17 sermons, 5 foundation scriptures, 5 declarations, 4 prayer-focus items',
  never_does: ['never invents spiritual content or prophecies (verbatim from source only)',
    'never a translation other than NKJV without permission','never a fabricated word-of-the-day'],
  status: 'AWAITING_REFOUNDING: A\'NU + founder decide the fresh identity together; do not port the old shell; do not fabricate content'
};

// Honest surface: until WORD is refounded, SOUL surfaces NOTHING (no fake name-of-the-day).
// Same signature DAWN expects, so DAWN simply gets no spiritual section rather than junk.
async function surfaceDaily(hamUid) {
  return { offering: null, status: 'awaiting_refounding', spec: WORD_SPEC };
}

// helper the refounding session can read to see the full spec through the one voice framing
function refoundingBrief() {
  return persona.voicePrompt(
    'SOUL is being refounded as WORD. Here is the full real spec to build from the founder\'s '+
    'actual spiritual library, never fabricated: ' + JSON.stringify(WORD_SPEC));
}

module.exports = { surfaceDaily: surfaceDaily, surface: surfaceDaily, WORD_SPEC: WORD_SPEC, refoundingBrief: refoundingBrief };
