// ⬡B:core.wonders.nash:MODULE:sports_wonder_detection_deliberation_dedup:20260711⬡
// ⬡B:core.wonders.nash:WIRE:dedup_through_brain_client_new_world:20260716⬡
// ⬡B:core.wonders.nash:BUILD:team_aware_never_empty_judgment:20260716⬡
//
// CANON L0 DOOR + CHANNEL DECLARATION: ABAHAM DOOR: nashWonder receives the
//   already-resolved hamUid from runPAI, which resolved it through ATMOSPHERE at
//   the ABAHAM door before any tool ran; this wonder never resolves identity
//   itself and fails closed on a missing ham. CHANNEL PATH TO A HAM: NASH's
//   answer returns up the runPAI tool chain into whatever reach channel invoked
//   the cycle; its dedup memory rides the world's own bank through brain.client.
//
// FOUNDER CORRECTION 20260716, his own words, the spec for this rebuild:
// "There should always be other sports news. It seems hardcoded. It doesn't
// seem like logic. Doesn't seem like reasoning. Doesn't seem like judgment."
// Cook-off 20260716 judged three redesigns; the winning design (per the judge):
// team inference from the question's natural language, the favorite team from
// env as a BIAS only when no team is named (never overriding a named team,
// never a personal literal in code), dedup that demotes and reorders but never
// erases, and a real recap branch so a sports brief never comes back empty.
//
// The Wonder Contract, three parts, each honored here:
//   1. DETECTION (cold, no LLM): scoreboard + league news + team news when a
//      team is known. Free ESPN endpoints, no key, no cost. C0 floor.
//   2. DELIBERATION (AI, penny model only, never Opus): judge what matters to
//      THIS question, team asked about first, league context second, like a
//      short brief from a person who actually watches.
//   3. DEDUP MEMORY (through the canonical brain.client, world-agnostic):
//      fresh items lead; already-told items demote into recap context instead
//      of vanishing. Only a genuinely empty detection may say the board is empty.
'use strict';

const brain = require('../brain.client');
function day() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

// Cold NBA team inference: question text to ESPN team key. A clean, complete
// map of franchise names and common short names, nothing cute, nothing typo'd
// (the cook-off's losing entries corrupted this map; the judge called it out).
const NBA_TEAMS = {
  hawks: 'atl', celtics: 'bos', nets: 'bkn', hornets: 'cha', bulls: 'chi',
  cavaliers: 'cle', cavs: 'cle', mavericks: 'dal', mavs: 'dal', nuggets: 'den',
  pistons: 'det', warriors: 'gsw', rockets: 'hou', pacers: 'ind',
  clippers: 'lac', lakers: 'lal', grizzlies: 'mem', heat: 'mia', bucks: 'mil',
  timberwolves: 'min', wolves: 'min', pelicans: 'no', knicks: 'nyk',
  thunder: 'okc', magic: 'orl', sixers: 'phi', '76ers': 'phi', suns: 'phx',
  blazers: 'por', kings: 'sac', spurs: 'sas', raptors: 'tor', jazz: 'utah',
  wizards: 'wsh'
};
function inferTeam(question) {
  const q = String(question || '').toLowerCase();
  for (const name in NBA_TEAMS) { if (q.indexOf(name) !== -1) return { key: NBA_TEAMS[name], name: name, named: true }; }
  // No team named: the world's favorite team from env is a bias, not a literal.
  const fav = String(process.env.NASH_FAV_TEAM || '').toLowerCase();
  if (fav && NBA_TEAMS[fav]) return { key: NBA_TEAMS[fav], name: fav, named: false };
  return null;
}

// ---- 1. DETECTION (cold) ----------------------------------------------------
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
      return { id: 'score_' + abbrs + '_' + day(), kind: 'score', lane: 'league', text: teams + ' -- ' + ((e.status && e.status.type && e.status.type.detail) || '') };
    });
  } catch (_) { return []; }
}
// League-wide news feed. Detection returns ALL fresh headlines; judging
// relevance is deliberation's job, not a cold keyword filter.
async function detectNews() {
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news');
    if (!r.ok) return [];
    const d = await r.json();
    return (d.articles || []).slice(0, 20).map(function (a) {
      return { id: 'news_' + String(a.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32),
        kind: 'news', lane: 'league', text: a.headline + (a.description ? (' -- ' + a.description) : '') };
    });
  } catch (_) { return []; }
}
// Team-specific news: the piece the founder caught missing. A Lakers question
// reaches the Lakers feed, not only the league firehose.
async function detectTeamNews(teamKey) {
  if (!teamKey) return [];
  try {
    // Live-verified shape 20260716: the ?team= query on the league news path
    // returns real team items; the /teams/{key}/news path returns an empty body.
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?team=' + teamKey);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.articles || []).slice(0, 12).map(function (a) {
      return { id: 'news_' + String(a.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32),
        kind: 'news', lane: 'team', text: a.headline + (a.description ? (' -- ' + a.description) : '') };
    });
  } catch (_) { return []; }
}

// ---- 3. DEDUP MEMORY (demote, never erase) ----------------------------------
async function alreadyTold(ham) {
  // Failed read degrades to zero rows: dedup then demotes nothing, the wonder still answers.
  let rows = [];
  try {
    rows = await brain.readBead({ select: 'content', ham_uid: 'eq.' + ham,
      source: 'like.NASH.' + ham + '.surfaced*', order: 'created_at.desc', limit: '60' });
  } catch (e) { console.log('[NASH] dedup read failed: ' + e.message); }
  const seen = {};
  rows.forEach(function (row) {
    try {
      // jsonb (new bank) arrives as an object; legacy text arrives as a string
      const c = (typeof row.content === 'string') ? JSON.parse(row.content) : (row.content || false);
      ((c && c.ids) || []).forEach(function (id) { seen[id] = 1; });
    } catch (_) {}
  });
  return seen;
}
async function markTold(ham, ids) {
  // Guard: nothing surfaced means nothing to remember -- explicit receipt, not a bare return.
  if (!ids.length) return { ok: true, skipped: 'no_ids_to_remember' };
  try {
    await brain.writeBead({ hamUid: ham, agentGlobal: 'NASH',
      source: 'NASH.' + ham + '.surfaced.' + Date.now(), type: 'MEMORY',
      content: { ids: ids, at: Date.now() }, importance: 2,
      summary: '[NASH dedup] surfaced ' + ids.length + ' item(s) ' + day(),
      edges: [{ type: 'dedup_for', target: 'core.wonders.nash' }] });
    return { ok: true, remembered: ids.length };
  } catch (e) { console.log('[NASH] dedup write failed: ' + e.message); return { ok: false, reason: e.message }; }
}

// ---- 2. DELIBERATION (AI, penny) --------------------------------------------
// The floor forbids em dashes in output; a prose rule the model must follow
// reliably is enforced cold after the call, never left to prompt hope.
// Em dash punctuation becomes a comma; en dashes and unicode hyphens become a
// plain hyphen so compound words like four-year survive intact.
function stripEmDash(s) { return String(s).replace(/\u2014/g, ', ').replace(/[\u2013\u2012\u2011\u2010]/g, '-').replace(/ ,/g, ','); }
async function deliberate(question, freshItems, recapItems, team) {
  if (!freshItems.length && !recapItems.length) return null;
  try {
    const { chat, modelForDepth } = require('../penny.hustle.js');
    const model = modelForDepth(1); // penny tier, never Opus
    const teamLine = team ? ('The person cares most about the ' + team.name + (team.named ? ' (they asked about them by name).' : ' (their team; they asked generally).')) : 'No specific team named.';
    const freshFacts = freshItems.map(function (i) { return '- [' + i.lane + '] ' + i.text; }).join('\n');
    const recapFacts = recapItems.map(function (i) { return '- [' + i.lane + '] ' + i.text; }).join('\n');
    const msg = [
      { role: 'system', content: 'You are NASH, the sports mind. You are a person who actually watches the games, writing a 2-3 sentence brief. Use ONLY the facts given, they are real and just fetched. Judgment order: whatever answers the question directly comes first, the team the person cares about comes before general league items. NEW facts lead. RECAP facts were already shared with this person before: only use them to give an honest sense of where things stand, and if you lean on them, say plainly it is a recap of where things stand rather than breaking news. Never invent a score, a signing, or a rumor. Never say you lack real-time access. Never use an em dash character; write with commas.' },
      { role: 'user', content: 'Question: ' + question + '\n' + teamLine + (freshFacts ? ('\nNEW facts:\n' + freshFacts) : '\nNEW facts: none today.') + (recapFacts ? ('\nRECAP facts (already shared before):\n' + recapFacts) : '') }
    ];
    // chat() reads opts.maxTokens (camelCase); the old snake_case key was
    // silently ignored, and thinking-tier models can spend most of a small
    // budget reasoning before they answer, truncating mid-sentence (burn book).
    const out = await chat(model, msg, { maxTokens: 700 });
    const txt = out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
    return txt ? stripEmDash(String(txt).trim()) : null;
  } catch (e) { console.log('[NASH] deliberation failed: ' + e.message); return null; }
}

// ---- THE WONDER: detection -> dedup demotion -> deliberation -----------------
async function nashWonder(hamUid, question, league) {
  const ham = String(hamUid || '').toUpperCase();
  if (!ham) return { ok: false, reason: 'ham_uid_required' };
  const lg = (league || 'nba').toLowerCase();
  const team = (lg === 'nba') ? inferTeam(question) : null;
  // 1. detect (cold, parallel): scoreboard, league news, team news when known
  const [scores, news, teamNews] = await Promise.all([detectScores(lg), detectNews(), detectTeamNews(team && team.key)]);
  const byId = {};
  teamNews.concat(news).concat(scores).forEach(function (i) { if (!byId[i.id]) byId[i.id] = i; });
  const all = Object.keys(byId).map(function (k) { return byId[k]; });
  if (!all.length) {
    console.log('[NASH] ' + ham + ' ' + lg + ' branch=empty_detection');
    return { ok: true, answer: 'The ' + lg.toUpperCase() + ' board is genuinely empty right now, no games and no fresh reports on any feed I read.', surfaced: 0 };
  }
  // 3. dedup DEMOTES: fresh items lead, already-told items become recap context
  const seen = await alreadyTold(ham);
  const fresh = all.filter(function (i) { return !seen[i.id]; });
  const recap = all.filter(function (i) { return seen[i.id]; }).slice(0, 6);
  // 2. deliberate (AI, penny) with real judgment over fresh first, recap as standing context
  const answer = await deliberate(question, fresh, recap, team);
  console.log('[NASH] ' + ham + ' ' + lg + ' branch=' + (answer ? (fresh.length ? 'answered_fresh' : 'answered_recap') : 'deliberation_empty')
    + ' team=' + (team ? team.key + (team.named ? ':named' : ':bias') : 'none')
    + ' detected=' + all.length + ' fresh=' + fresh.length + ' recap=' + recap.length);
  if (!answer) return { ok: false, reason: 'deliberation_empty' };
  // remember only the genuinely new items we just surfaced
  await markTold(ham, fresh.slice(0, 10).map(function (i) { return i.id; }));
  return { ok: true, answer: answer, surfaced: fresh.length, recap: recap.length, team: team ? team.key : null, tier: 'free_api(15)+llm(5)' };
}

module.exports = { nashWonder: nashWonder, detectScores: detectScores, detectNews: detectNews, detectTeamNews: detectTeamNews, inferTeam: inferTeam };
