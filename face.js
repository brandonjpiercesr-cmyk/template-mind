// ⬡B:face:MODULE:anu_expression_persona_voiced:20260710⬡
// WONDER: face is A NU, the expression organ -- takes the mind compiled turn and
// speaks it in persona voice. Agent of the reach wonder; never composes, never leaks.
async function expressTurn(env, compiled) {
  console.log(`[face] Entering expressTurn for HAM ${env.HAM_UID || 'unknown'}`);

  if (!compiled || !(compiled.text || compiled.answer)) {
    console.log('[face] No content to express, exiting silently.');
    return { ok: false };
  }

  const baseText = compiled.text || compiled.answer;
  // ⬡B:face:FIX:no_manufactured_prefix_her_words_stand_alone:20260718⬡ Founder caught it: a
  // hardcoded "Listen closely, " was stapled onto the front of every one of her real answers,
  // a manufactured template in his system that is not her voice. Killed. Her compiled words are
  // her words; the expression organ speaks them as-is and does not prepend or append anything.
  let result = String(baseText || '');

  console.log('[face] Expression completed, exiting.');
  return { ok: true, text: result };
}

module.exports = { expressTurn };