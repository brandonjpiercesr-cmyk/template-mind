// ⬡B:board.compose:MODULE:compose_and_ground_email:20260711⬡
// An advisor's cycle produces an internal WORK PLAN (tables, status matrices,
// "Brandon Action Needed" scaffolding, its full thinking). That is not an email
// and must never be sent as one. This module turns that thinking into ONE short,
// clean, prose email AND grounds it against the source so it cannot invent names,
// dates, contacts, or numbers. If it cannot produce a grounded email, it HOLDS
// (silence over hollow) rather than sending a mess.

async function llm(system, user, maxTokens) {
  var key = process.env.GROQ_API_KEY;
  if (!key) return '';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL_C2 || 'openai/gpt-oss-120b',
        max_tokens: maxTokens || 400, temperature: 0.2,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    }).then(function (x) { return x.json(); });
    return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
  } catch (e) { return ''; }
}

// Turn a work plan into one short, grounded email body. Returns {ok, body} or
// {ok:false, reason} when it should be held.
async function composeCleanEmail(source, opts) {
  opts = opts || {};
  var name = process.env.FOUNDER_NAME || opts.founderName || 'there';
  if (!source || String(source).trim().length < 20) return { ok: false, reason: 'no_source' };
  source = String(source).slice(0, 4000);

  var sys = 'You turn an internal work plan into ONE short email to ' + name + '. '
    + 'Rules, all hard: prose only, no tables, no markdown, no headers, no bullet lists, no status matrices, no pipes. '
    + 'Four to six sentences, one short paragraph. Warm and plain, middle-school reading level. '
    + 'Open with "Hey ' + name + '," and close with "Thanks." '
    + 'NEVER invent a name, date, contact, organization, or number that is not explicitly in the source. '
    + 'If a detail is not in the source, stay general or leave it out. No em dashes. '
    + 'Write ONLY the email body, nothing else, no subject, no preamble.';
  var body = await llm(sys, 'SOURCE WORK PLAN:\n' + source, 400);
  if (!body || body.trim().length < 20) return { ok: false, reason: 'compose_empty' };
  body = body.trim();

  // WRIT: strip em dash / emoji / meta / jargon before grounding
  try { var w = require('./writ/writ.js').writCheck(body); if (w && w.ok && typeof w.content === 'string' && w.content.trim()) body = w.content.trim(); } catch (e) {}

  // Reject any table/matrix residue that slipped through the prose instruction
  if (/\|/.test(body) || /(^|\n)\s*[-*]\s/.test(body) || /#{1,6}\s/.test(body)) {
    return { ok: false, reason: 'held_formatting_residue_tables_or_lists', body: body };
  }

  // GROUNDING: does the email state any specific it did not get from the source?
  var gsys = 'Compare a drafted email against its source work plan. Reply EXACTLY OK or FAIL, then one short reason. '
    + 'FAIL if the email states a specific NAME, DATE, CONTACT, ORGANIZATION, or NUMBER that does not appear in the source. '
    + 'General statements and reasonable paraphrase are fine.';
  var g = await llm(gsys, 'SOURCE:\n' + source.slice(0, 3000) + '\n\nDRAFT EMAIL:\n' + body, 120);
  if (/^\s*FAIL/i.test(g || '')) {
    return { ok: false, reason: 'grounding_failed: ' + (g || '').replace(/^\s*FAIL\s*/i, '').slice(0, 140), body: body };
  }

  return { ok: true, body: body };
}

module.exports = { composeCleanEmail: composeCleanEmail };
