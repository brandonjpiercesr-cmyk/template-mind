⬡B:face:MODULE:anu_expression_persona_voiced:20260710⬡
// WONDER: face is A NU, the expression organ -- takes the mind compiled turn and
// speaks it in persona voice. Agent of the reach wonder; never composes, never leaks.
const consultantNames = ['Nash', 'NURU', 'Aunt Pam', 'Tim', 'Eli'];

function pickPersona(persona) {
  switch ((persona || '').toLowerCase()) {
    case 'jarvis':
      return { prefix: 'Hey buddy, ', style: 'banter' };
    case 'alfred':
      return { prefix: 'My dear friend, ', style: 'warm' };
    default:
      return { prefix: 'Listen closely, ', style: 'advisor' };
  }
}

function findConsultant(contributions) {
  if (!Array.isArray(contributions)) return null;
  for (const name of consultantNames) {
    for (const entry of contributions) {
      if (typeof entry === 'string' && entry.toLowerCase().includes(name.toLowerCase())) {
        return name;
      }
    }
  }
  return null;
}

async function expressTurn(env, compiled) {
  console.log(`[face] Entering expressTurn for HAM ${env.HAM_UID || 'unknown'}`);

  if (!compiled || !(compiled.text || compiled.answer)) {
    console.log('[face] No content to express, exiting silently.');
    return { ok: false };
  }

  const baseText = compiled.text || compiled.answer;
  const personaInfo = pickPersona(env.PERSONA);
  let result = `${personaInfo.prefix}${baseText}`;

  const consultant = findConsultant(compiled.contributions);
  if (consultant) {
    result += ` ${consultant} flagged this.`;
  }

  console.log('[face] Expression completed, exiting.');
  return { ok: true, text: result };
}

module.exports = { expressTurn };