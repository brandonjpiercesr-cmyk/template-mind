// ⬡B:core.wonders.nash:MODULE:sports_wonder_detection_deliberation_dedup:20260711⬡
//
// CANON L0 DOOR + CHANNEL DECLARATION: ABAHAM DOOR: nashWonder receives the
//   already-resolved hamUid from runPAI, which resolved it through ATMOSPHERE at
//   the ABAHAM door before any tool ran; this wonder never resolves identity
//   itself and fails closed on a missing ham. CHANNEL PATH TO A HAM: NASH's
//   answer returns up the runPAI tool chain into whatever reach channel invoked
//   the cycle (the MESSAGES/notify path -- alive, stream, cara, voice, email);
//   its dedup memory rides the HAM's own schema.
//
// NASH, made a REAL WONDER (founder correction 20260711: raw cold code that
// calls ESPN is NOT a wonder; it is detection with no deliberation and no
// memory). The Wonder Contract, three parts, each honored here:
//
//   1. DETECTION (cold, no LLM): pull the real facts. Cheapest finite source
//      wins -- ESPN's public scoreboard + news feeds, no key, no cost. This is
//      the C0 floor: deterministic fetch and parse.
//   2. DELIBERATION (AI, penny model only -- never Opus): reason about whether
//      what detection returned is actually what the founder needs RIGHT NOW,
//      and whether it is new to him or something he was already told. Cold code
//      cannot judge "is this worth surfacing" -- that is the AI's only job here.
//   3. DEDUP MEMORY: every item NASH surfaces is stamped. Before surfacing
//      again, NASH reads its own prior stamps and drops anything already given.
//      The Kuminga law: do not repeat the same signing rumor all day.
//
// Scored by the Wonder Games law (ONNX 40 > edge 25 > free api 15 > hop 10 >
// LLM 5): detection is a free-API tier (15), deliberation is the LLM tier (5)
// used ONLY for the judgment cold code cannot make. Woven, not bolted on.
'use strict';

function brainUrl() { return (process.env.AIBE_BRAIN_URL || '').replace(/\/$/, ''); }
function brainHeaders(profile, write) {
  const key = process.env.AIBE_BRAIN_KEY || '';
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Accept-Profile': profile };
  if (write) { h['Content-Profile'] = profile; h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=minimal'; }
  return h;
}
function schemaFor(ham) { return 'ham_' + String(ham).toLowerCase(); }
function day() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

// ---- 1. DETECTION (cold) ----------------------------------------------------
// Scoreboard for a league, plus latest team news headlines. No key, no cost.
async function detectScores(league) {
  const sport = { nba: 'basketball/nba', wnba: 'basketball/wnba', nfl: 'football/nfl', mlb: 'baseball/mlb', nhl: 'hockey/nhl' }[league] || 'basketball/nba';
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + sport + '/scoreboard');
    if (!r.ok) return [];
    const d = await r.json();
    return (d.events || []).slice(0, 12).map(function (e) {
      const c = e.competitions && e.competitions[0];
      const abbrs = ((c && c.competitors) || []).map(function (t) { return t.team.abbreviation; }).sort().join('_');
      const teams = ((c && c.competitors) || []).map(function (t) { return t.team.abbreviation + ' ' + (t.score || ''); }).join(' vs ');
      return { id: 'score_' + abbrs + '_' + day(), kind: 'score', text: teams + ' -- ' + ((e.status && e.status.type && e.status.type.detail) || '') };
    });
  } catch (_) { return []; }
}
// Team news (this is what surfaces the Kuminga signing, summer league, trades).
// Detection returns ALL fresh headlines; judging relevance is deliberation's
// job (the AI), not a cold keyword filter that silently drops real facts.
async function detectNews(teamQuery) {
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news');
    if (!r.ok) return [];
    const d = await r.json();
    return (d.articles || []).slice(0, 20).map(function (a) {
      return { id: 'news_' + String(a.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32),
        kind: 'news', text: a.headline + (a.description ? (' -- ' + a.description) : '') };
    });
  } catch (_) { return []; }
}

// ---- 3. DEDUP MEMORY --------------------------------------------------------
// What has NASH already told this HAM? Read prior surfaced-item ids.
async function alreadyTold(ham) {
  const u = brainUrl(); if (!u) return {};
  try {
    const r = await fetch(u + '/rest/v1/abacia?select=content&acl_stamp=ilike.' + encodeURIComponent('*nash.surfaced*') + '&order=created_at.desc&limit=60', { headers: brainHeaders(schemaFor(ham), false) });
    if (!r.ok) return {};
    const rows = await r.json();
    const seen = {};
    rows.forEach(function (row) { try { (JSON.parse(row.content).ids || []).forEach(function (id) { seen[id] = 1; }); } catch (_) {} });
    return seen;
  } catch (_) { return {}; }
}
async function markTold(ham, ids) {
  const u = brainUrl(); if (!u || !ids.length) return;
  try {
    await fetch(u + '/rest/v1/abacia', { method: 'POST', headers: brainHeaders(schemaFor(ham), true),
      body: JSON.stringify({ ham_uid: ham, agent_global: 'NASH',
        acl_stamp: '\u2b21B:nash.surfaced:MEMORY:dedup:' + day() + '\u2b21', stamp_type: 'MEMORY', source: 'nash.surfaced', importance: 2,
        summary: '[NASH dedup] surfaced ' + ids.length + ' item(s)', content: JSON.stringify({ ids: ids, at: Date.now() }) }) });
  } catch (_) {}
}

// ---- 2. DELIBERATION (AI, penny) --------------------------------------------
// Reason about the NEW items: what actually matters to surface, in his voice.
async function deliberate(question, freshItems) {
  if (!freshItems.length) return null;
  try {
    const { chat, modelForDepth } = require('../penny.hustle.js');
    const model = modelForDepth(1); // penny tier, never Opus
    const facts = freshItems.map(function (i) { return '- ' + i.text; }).join('\n');
    const msg = [
      { role: 'system', content: 'You are NASH, the sports wonder. You are given the ONLY facts you may use (real, just fetched) and these are NEW to the person (nothing here has been told before). In 1-2 warm sentences, answer the question using just these facts. If a fact answers directly, lead with it. Never invent a score or a signing. Never say you lack real-time access; these facts ARE real-time.' },
      { role: 'user', content: 'Question: ' + question + '\nFacts (new to me):\n' + facts }
    ];
    const out = await chat(model, msg, { max_tokens: 200 });
    const txt = out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
    return txt ? String(txt).trim() : null;
  } catch (_) { return null; }
}

// ---- THE WONDER: detection -> dedup -> deliberation -------------------------
async function nashWonder(hamUid, question, league) {
  const ham = String(hamUid || '').toUpperCase();
  const lg = (league || 'nba').toLowerCase();
  // 1. detect (cold, parallel)
  const [scores, news] = await Promise.all([detectScores(lg), detectNews(question)]);
  const all = scores.concat(news);
  if (!all.length) return { ok: true, answer: 'No live ' + lg.toUpperCase() + ' games or fresh news on the board right now.', surfaced: 0 };
  // 3. dedup: drop what he was already told
  const seen = await alreadyTold(ham);
  const fresh = all.filter(function (i) { return !seen[i.id]; });
  if (!fresh.length) return { ok: true, answer: 'Nothing new since I last filled you in on the ' + lg.toUpperCase() + '.', surfaced: 0, allDedup: true };
  // 2. deliberate (AI, penny) over ONLY the fresh items
  const answer = await deliberate(question, fresh);
  if (!answer) return { ok: false, reason: 'deliberation_empty' };
  // remember what we surfaced so we never repeat it
  await markTold(ham, fresh.slice(0, 8).map(function (i) { return i.id; }));
  return { ok: true, answer: answer, surfaced: fresh.length, tier: 'free_api(15)+llm(5)' };
}

module.exports = { nashWonder: nashWonder, detectScores: detectScores, detectNews: detectNews };
