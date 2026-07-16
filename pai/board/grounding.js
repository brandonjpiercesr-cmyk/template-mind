// ⬡B:board.grounding:MODULE:ground_advisor_thinking_in_real_data:20260711⬡
// An advisor may reference ONLY what is in its real inbox and calendar. The
// 01:44 hallucination (an invented "NYC trip week of June 29" and fake contacts
// Amina / Chris Thompson / MHANY) came from fiction hardcoded into the prompt,
// not free invention. This module provides (1) the grounding rule for the prompt,
// (2) the real calendar facts, and (3) a check that flags any specific in the
// output not backed by the data the advisor actually saw. No hardcoded identity.

var GROUNDING_RULE =
  'GROUNDING, ABSOLUTE: Everything you know about this work comes ONLY from the INBOX and CALENDAR data given below. '
  + 'You must NEVER invent or assume a person, contact, name, organization, date, trip, meeting, event, dollar amount, '
  + 'or any specific fact that is not explicitly present in that data. If you are missing a piece of information, say '
  + 'plainly that you need it from the principal rather than filling it in. Do not carry over any names, contacts, or examples '
  + 'from these instructions or from memory. Only the data below is real. When in doubt, stay general and ask.';

// ⬡B:board.grounding:BUILD:org_chart_principal_at_top:20260713⬡
// Founder's teaching, 20260713: "I am the him, way up at the top of the food chain, not just
// the founder, and don't hardcode me, not all HAMs are founders. You don't walk into Coca-Cola
// and say let me meet the CEO." Every adviser must know the person they serve is the PRINCIPAL
// at the top, that reaching them is the rarest and most earned action, and that most work the
// advisers just DO themselves. This is universal: no fixed title, no hardcoded founder.
var ORG_CHART =
  'ORG CHART, ABSOLUTE: The person you serve is the PRINCIPAL at the very top of this org, above every adviser including you. '
  + 'Their time is the single most expensive resource here, so reaching them is the rarest and most earned action you ever take. '
  + 'DEFAULT to handling the work yourself and among the advisers, and finishing it. Bring something to the principal ONLY when it '
  + 'genuinely cannot move without them: a real decision that cannot be settled over a text or an email, or a strategic update that '
  + 'truly warrants their attention. Never treat their time as cheap, and never convene them for something you could have finished '
  + 'yourself. And never assume they hold any fixed title like founder or CEO; they are simply the principal of THIS world, whoever '
  + 'that is.';

// The real calendar for a world, as plain grounded facts (own grant only).
async function groundedCalendar(world) {
  try {
    var cal = require('../reach/iman.calendar.js');
    var now = Math.floor(Date.now() / 1000);
    var r = await cal.listEvents(world, { start: now, end: now + 180 * 24 * 3600, limit: 15 });
    if (!r.ok || !r.events || !r.events.length) return 'REAL CALENDAR (this world): no upcoming events found.';
    var items = r.events.filter(function (e) { return e.start; })
      .sort(function (a, b) { return (a.start || 0) - (b.start || 0); }).slice(0, 12)
      .map(function (e) { var d = new Date((e.start || 0) * 1000).toISOString().slice(0, 10); return d + ' ' + String(e.title || '').slice(0, 70); });
    return 'REAL CALENDAR (this world, next 180 days):\n' + items.join('\n');
  } catch (e) { return ''; }
}

// Flag any specific in the output that is not backed by the data the advisor saw.
// factsText = the inbox + calendar text actually provided to the advisor.
async function checkGrounded(output, factsText) {
  var key = process.env.GROQ_API_KEY;
  if (!key || !output || !factsText) return { ok: true, skipped: true };
  var sys = 'You verify an advisor draft against the real data it was given. Reply EXACTLY OK or FLAG, then one short reason. '
    + 'FLAG if the draft names a specific PERSON, CONTACT, ORGANIZATION, DATE, TRIP, MEETING, or NUMBER that does not appear in the DATA. '
    + 'General strategy and planning language with no invented specifics is fine.';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b', max_tokens: 150, temperature: 0,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: 'DATA:\n' + String(factsText).slice(0, 3000) + '\n\nDRAFT:\n' + String(output).slice(0, 3000) }]
      })
    }).then(function (x) { return x.json(); });
    var verdict = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || 'OK';
    if (/^\s*FLAG/i.test(verdict)) return { ok: false, reason: verdict.replace(/^\s*FLAG\s*/i, '').slice(0, 180) };
    return { ok: true };
  } catch (e) { return { ok: true, error: e.message }; }
}

module.exports = { GROUNDING_RULE: GROUNDING_RULE, ORG_CHART: ORG_CHART, groundedCalendar: groundedCalendar, checkGrounded: checkGrounded };
