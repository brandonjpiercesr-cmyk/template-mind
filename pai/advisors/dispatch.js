// ⬡B:advisors.dispatch:MODULE:advisors_get_teeth_dispatch_to_stations:20260711⬡
// ADVISOR TEETH. Founder doctrine pt4+pt6: advisors have no teeth -- Eli just chats.
// He must dispatch his TEAM to independent thinking stations, assign tasks, they
// research/draft/monitor/keep records and roll results back up. 'I'm up, let me COOK,'
// not 'I'm up, let me say something.' This is the founder's months-old sub-agent
// concept (now the anthropic/openai pattern). An advisor decides the plan (LLM), the
// stations execute (each its own cheap cycle), the lead synthesizes. Agent of the
// advisor wonder; every task + result stamps to the wall so nothing is just talk.
// IDENTITY: every dispatch is scoped to a hamUid passed in by the caller; the HAM
// resolves through the ABAHAM door upstream, never hardcoded here, so a station only
// ever cooks for the HAM it was handed.
'use strict';
// ⬡B:advisors.dispatch:WIRE:funneled_world_agnostic_20260711⬡
// PORT funnel: world-agnostic brain access (MEMORY_BANK_* with AIBE_BRAIN_* fallback,
// env-driven table/schema) -> byte-identical legacy, ready for the new world.
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
var GROQ = process.env.GROQ_API_KEY;
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { var h = rh(); h['Content-Profile'] = 'abacia_core'; h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }
function ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

// this deliberation reaches a HAM through core/model.ladder.js (fetch to the model providers), and every result it feeds into stamps a RESULT to the HAM's own MESSAGES channel via ham_uid below.
async function llm(system, user, tokens) {
  // \u2b21B:advisors.dispatch:WIRE:authorized_ladder_not_groq_llama_20260715\u2b21
  // founder called this out directly: too much of this codebase defaulted straight
  // to Groq, and this one even fell back to the model 'llama-3.3-70b-versatile',
  // the exact thing Qwen is supposed to replace. Now routes through the founder's
  // actual authorized ladder: GLM 5.2, Ornith, Qwen, Groq only as the last floor.
  try {
    var res = await require('../core/model.ladder.js').deliberate(system, user, { max_tokens: tokens || 500, temperature: 0.3, timeout: 25000 });
    return res ? res.content : null;
  } catch (e) { return null; }
}

function stamp(row) { if (_bu() && _bk()) return fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: wh(), body: JSON.stringify(row) }).catch(function () {}); }

// THE LEAD PLANS -- the advisor breaks the ask into a team of thinking stations, each
// with a concrete job. Returns [{station, job}] -- real assignments, not chatter.
async function planTeam(advisorName, ask, ctx) {
  var sys = 'You are ' + advisorName + ', a lead advisor running a team of thinking stations. '
    + 'Break the ask into 2 to 4 concrete station assignments. Each station has a role (RESEARCHER, DRAFTER, '
    + 'MONITOR, or ANALYST) and one specific job it can actually do (find X, draft Y, track Z, analyze W). '
    + 'Return ONLY a JSON array like [{"station":"RESEARCHER","job":"find current grant cycles open for youth sports in PA"}]. '
    + 'No prose, no markdown, just the array.';
  var out = await llm(sys, 'The ask: ' + ask + '\n\nContext from the wall:\n' + String(ctx || 'none').slice(0, 1500), 500); // ⬡B:advisors.dispatch:FIX:ctx_not_always_a_string:20260713⬡ was (ctx||'none').slice, crashed on object ctx
  if (!out) return [];
  try {
    var arr = JSON.parse(out.replace(/```json|```/g, '').trim());
    return Array.isArray(arr) ? arr.slice(0, 4) : [];
  } catch (e) { return []; }
}

// ⬡B:advisors.dispatch:WIRE:coda_fires_cookoff_and_wonder_games:20260713⬡
// The gap the voice chat named and the founder said to fix: CODA's stations could NAME the
// cook-off and Wonder Games in a brief but never touched either endpoint, so she talked
// about running them instead of running them. These fire the real endpoints on the mind,
// gated to a task that actually calls for a contest, once per dispatch (not per station,
// which would run a three-model contest four times over). The verdict is fed into the
// lead's synthesis so she reports the real winner and correction, not the concept.
var _SELF_BASE = process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';

function _wantsContest(text) {
  var t = String(text || '').toLowerCase();
  return /cook.?off|contest|compete|pit .*models?|three models|which model|best implementation|head.?to.?head|wonder ?games|candidate competition|model.?off/.test(t);
}

async function runCookoff(task, invokedBy) {
  try {
    var r = await fetch(_SELF_BASE + '/cookoff/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: String(task).slice(0, 2000), invoked_by: invokedBy || 'CODA', max_tokens: 1100 })
    }).then(function (x) { return x.json(); });
    if (r && r.ok) { var j = (r.result && r.result.judge) || {}; return { fired: true, kind: 'cookoff', winner: r.winner, why: j.why, correction: j.correction }; }
    return { fired: false };
  } catch (e) { return { fired: false, error: e.message }; }
}

async function runWonderGames(task) {
  try {
    var r = await fetch(_SELF_BASE + '/wonder-games/compete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: String(task).slice(0, 2000) })
    }).then(function (x) { return x.json(); });
    return (r && !r.error) ? { fired: true, kind: 'wonder-games', result: r } : { fired: false };
  } catch (e) { return { fired: false, error: e.message }; }
}

// A STATION COOKS -- each assigned station runs its own real cycle on its job and
// produces an actual deliverable (findings, a draft, a tracked list), stamped.
var _lineage = require('../core/lineage.attach.js');

// ⬡B:advisors.dispatch:BAN:gemini_grounding_perma_removed_onto_openrouter_web:20260717⬡
// FOUNDER LAW 20260717: no Google, ever. Two reasons, either one fatal on its own:
// the 2.5 line is retired, and it is closed weight. He ordered Gemini out once
// already on 20260711 (bead 790) and it grew back here, because the provider gate
// had generativelanguage.googleapis.com sitting in its PERMITTED column. Both are
// closed now: this call site and the gate that let it in.
//
// Search does not die with it. OpenRouter is approved API #3 and carries a real web
// plugin, so a RESEARCHER station still gets grounded results, now from an approved
// open-weight model instead of a banned closed one. Same contract as before:
// { ok, text, grounded }. The station's own wonder organizes what comes back and
// never invents past it, unchanged.
//
// The identity-hint fix from 20260713 is PRESERVED verbatim below, because it was a
// real founder catch: a BDIF research job with no disambiguation genuinely, correctly
// found Battle for Dream Island instead of Brian Dawkins Impact Foundation, and the
// station faithfully reported the real search's real wrong answer. Prepending who the
// advisor represents fixes that for every advisor, and it is provider-independent.
async function realSearch(query, identityHint) {
  var key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, reason: 'no_openrouter_key' };
  var q = identityHint ? (String(identityHint).slice(0, 200) + ' -- ' + query) : query;
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b',
        plugins: [{ id: 'web', max_results: 5 }],
        messages: [{ role: 'user', content: q }],
        max_tokens: 900
      }),
      signal: AbortSignal.timeout(30000)
    }).then(function (x) { return x.json(); });
    if (r.error) return { ok: false, reason: (r.error && r.error.message) || 'search_error' };
    var msg = (((r.choices || [])[0] || {}).message) || {};
    var text = String(msg.content || '');
    var grounded = !!(msg.annotations && msg.annotations.length);
    return { ok: !!text, text: text, grounded: grounded };
  } catch (e) { return { ok: false, reason: e.message }; }
}
// ⬡B:advisors.dispatch:WIRE:real_wonder_stations_all_roles:20260713⬡
// Founder caught this live: a DRAFTER's job could NAME the cook-off or Wonder Games
// as something to use, and the station would just talk about them in prose -- neither
// station has a tool to actually reach either endpoint, so "use the cook-off" never
// touched /cookoff/run. Same shape as realSearch: cold code decides (job text names
// the station) and makes the real call; the wonder only ever synthesizes what came
// back, never invents a winner or a verdict. Self-URL follows the existing codebase
// pattern (SELF_BASE_URL, same fallback chain used in contributors.js/model.router.js).
function _selfBase() { return process.env.SELF_BASE_URL || process.env.AIBEBASE_URL || 'https://aibebase.onrender.com'; }

async function realCookoff(advisorName, job) {
  try {
    var r = await fetch(_selfBase() + '/cookoff/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: job, invoked_by: advisorName.toLowerCase() + '_dispatch' }),
      signal: AbortSignal.timeout(150000)
    }).then(function (x) { return x.json(); });
    if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'no_result' };
    var j = (r.result && r.result.judge) || {};
    return { ok: true, winner: r.winner, why: j.why || '', correction: j.correction || '' };
  } catch (e) { return { ok: false, reason: e.message }; }
}

async function realWonderCompete(hamUid, job) {
  try {
    var r = await fetch(_selfBase() + '/wonder-games/compete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: job, hamUid: hamUid }),
      signal: AbortSignal.timeout(150000)
    }).then(function (x) { return x.json(); });
    if (!r) return { ok: false, reason: 'no_result' };
    return { ok: true, result: r };
  } catch (e) { return { ok: false, reason: e.message }; }
}

async function stationCook(advisorName, hamUid, assignment, identityHint) {
  var role = assignment.station || 'ANALYST', job = assignment.job || '';
  var _ground = '';
  try { var _g = require('../board/grounding.js'); _ground = ' ' + _g.GROUNDING_RULE + ' ' + (_g.ORG_CHART || ''); } catch (e) {}

  var searchBlock = '', searchedReal = false;
  // ⬡B:advisors.dispatch:WIRE:real_search_all_roles:20260713⬡
  // Was RESEARCHER-only. A DRAFTER writing a letter, a MONITOR tracking a deadline, and
  // an ANALYST comparing options all benefit from the same real grounding -- extended to
  // every role. Cold search feeds real data in; the wonder still may not invent beyond it.
  var s = await realSearch(job, identityHint);
  if (s.ok && s.grounded) {
    searchBlock = '\n\nREAL SEARCH RESULTS (verified, just retrieved, you may cite these specifics):\n' + s.text.slice(0, 2500);
    searchedReal = true;
  }

  var wonderBlock = '', wonderUsed = false;
  if (/cook.?off/i.test(job)) {
    var co = await realCookoff(advisorName, job);
    wonderUsed = co.ok;
    wonderBlock = co.ok
      ? '\n\nREAL COOK-OFF RESULT (three contestants actually ran, just now, Fable judged):\nWinner: ' + co.winner + '\nWhy: ' + co.why + (co.correction ? '\nCorrection for the winner: ' + co.correction : '')
      : '\n\n[Cook-off was invoked for this job but did not complete: ' + co.reason + '. Say so plainly, do not invent a winner.]';
  } else if (/wonder.?games?/i.test(job)) {
    var wg = await realWonderCompete(hamUid, job);
    wonderUsed = wg.ok;
    wonderBlock = wg.ok
      ? '\n\nREAL WONDER GAMES RESULT (just ran):\n' + JSON.stringify(wg.result).slice(0, 1500)
      : '\n\n[Wonder Games was invoked for this job but did not complete: ' + wg.reason + '. Say so plainly, do not invent a result.]';
  }

  var sys = 'You are a ' + role + ' thinking station reporting to ' + advisorName + '. '
    + 'Do your job concretely and return your actual deliverable: if RESEARCHER, the findings; if DRAFTER, the draft; '
    + 'if MONITOR, the tracked items with what to watch; if ANALYST, the analysis with a recommendation. '
    + 'Be specific and useful. No filler, no restating the job.'
    + (searchedReal
      ? ' You DO have real search results below for this job -- use them, cite specifics from them, organize and prioritize them. Still never invent a specific NOT present in the search results.'
      : ' CRITICAL: you have no live web or database access here. NEVER invent a specific grant name, organization, dollar figure, deadline, contact, or statistic. If you cannot verify a specific, give the METHOD to find it (where to look, what to search, who to ask) instead of a fabricated fact, and clearly mark anything uncertain.')
    + (wonderBlock ? ' A wonder station (cook-off or Wonder Games) was actually invoked for this job -- report its real outcome below, never a fabricated one.' : '')
    + _ground;
  var deliverable = await llm(sys, 'Your job: ' + job + searchBlock + wonderBlock, 700);
  await stamp({ ham_uid: hamUid, agent_global: advisorName.toUpperCase() + '_STATION', stamp_type: 'STATION_RESULT',
    acl_stamp: '\u2b21B:advisors.dispatch:STATION_RESULT:' + role.toLowerCase() + ':' + ymd() + '\u2b21',
    source: 'station.' + role.toLowerCase() + '.' + Date.now(),
    summary: '[' + role + ' for ' + advisorName + '] ' + job.slice(0, 100) + (searchedReal ? ' (real search)' : '') + (wonderUsed ? ' (real wonder station)' : ''),
    content: JSON.stringify(_lineage.attachLineage({ role: role, job: job, deliverable: (deliverable || 'no output').slice(0, 3000), real_search_used: searchedReal, real_wonder_station_used: wonderUsed }, { chain: [advisorName.toUpperCase(), role], deliveredBy: role, why: 'assigned by ' + advisorName, audience: 'builder' })), importance: 5 });
  return { role: role, job: job, deliverable: deliverable || null };
}

// THE FULL DISPATCH -- lead plans the team, stations cook in parallel, lead synthesizes
// the team's real work into one answer. This is teeth: assignments, deliverables, records.
async function dispatch(advisorName, hamUid, ask, ctx) {
  var HAM = String(hamUid || '').toUpperCase();
  // ⬡B:advisors.dispatch:WIRE:active_awareness:20260713⬡
  // CANON check 16: every agent cycle reads its own last run at start, writes a new
  // one at end, no exceptions. Lets a team pick up where it left off instead of
  // restarting cold every dispatch (e.g. an in-progress research thread, a station
  // that flagged something last cycle).
  var _aa; try { _aa = require('../core/active-awareness.js'); } catch (e) {}
  var _lastRun = _aa ? await _aa.readLastRun(advisorName, HAM) : null;
  var team = await planTeam(advisorName, ask, ctx);
  if (!team.length) {
    if (_aa) await _aa.writeLastRun(advisorName, HAM, { summary: 'no team plan for: ' + String(ask).slice(0, 100), incomplete: [String(ask).slice(0, 100)] });
    return { ok: false, reason: 'no_team_plan', dispatched: 0 };
  }
  // stamp the assignments so the founder SEES the lead gave real orders
  await stamp({ ham_uid: HAM, agent_global: advisorName.toUpperCase(), stamp_type: 'TEAM_DISPATCH',
    acl_stamp: '\u2b21B:advisors.dispatch:TEAM_DISPATCH:assigned:' + ymd() + '\u2b21',
    source: 'dispatch.' + advisorName.toLowerCase() + '.' + Date.now(),
    summary: '[' + advisorName + ' dispatched ' + team.length + ' stations] ' + team.map(function (t) { return t.station; }).join(', '),
    content: JSON.stringify(_lineage.attachLineage({ ask: ask, team: team }, { chain: [advisorName.toUpperCase()], deliveredBy: advisorName.toUpperCase(), why: 'planned the team for: ' + String(ask).slice(0,80), audience: 'builder' })), importance: 6 });
  // stations cook in parallel
  var _identityHint = String(ctx || '').split('\n')[0].slice(0, 200); // first line of real context: who this advisor actually represents
  var results = await Promise.all(team.map(function (a) { return stationCook(advisorName, HAM, a, _identityHint); }));
  // lead synthesizes the team's real deliverables
  var brief = results.map(function (r) { return r.role + ' on "' + r.job + '":\n' + (r.deliverable || '(no output)'); }).join('\n\n');
  // If the ask calls for a contest, CODA actually FIRES it (once, on the real endpoint)
  // and reports the outcome, instead of only naming the mechanism in her brief.
  var _contestBlock = '';
  if (_wantsContest(ask)) {
    var _co = /wonder ?games|candidate competition|earn a seat/i.test(String(ask)) ? await runWonderGames(ask) : await runCookoff(ask, advisorName.toUpperCase());
    if (_co && _co.fired) {
      _contestBlock = '\n\nCONTEST ACTUALLY RUN (' + _co.kind + ', fired live on the real endpoint):'
        + (_co.winner ? ' winner=' + _co.winner + '.' : '')
        + (_co.why ? ' why=' + String(_co.why).slice(0, 200) + '.' : '')
        + (_co.correction ? ' correction=' + String(_co.correction).slice(0, 200) + '.' : '')
        + ' Report this as the decided outcome you ran, not as a concept to consider.';
      await stamp({ ham_uid: HAM, agent_global: advisorName.toUpperCase(), stamp_type: 'CONTEST_FIRED',
        acl_stamp: '\u2b21B:advisors.dispatch:CONTEST_FIRED:' + _co.kind + ':' + ymd() + '\u2b21',
        source: 'dispatch.contest.' + advisorName.toLowerCase() + '.' + Date.now(),
        summary: '[' + advisorName + ' FIRED ' + _co.kind + '] winner=' + (_co.winner || 'n/a'),
        content: JSON.stringify({ ask: String(ask).slice(0, 300), kind: _co.kind, winner: _co.winner, correction: _co.correction }), importance: 7 });
    }
  }
  var synthesis = await llm(
    'You are ' + advisorName + ', the lead. Your team just delivered real work below. Synthesize it into one clear brief for the principal you serve: '
    + 'what the team found/produced, and the single next action you recommend. Speak as the lead who ran the team, not a chatbot.',
    (_lastRun && _lastRun.nextCycle && _lastRun.nextCycle.length ? 'What you flagged to check first, from last time: ' + _lastRun.nextCycle.join('; ') + '\n\n' : '')
    + 'Your team\'s deliverables:\n\n' + brief + _contestBlock, 600);
  // ⬡B:advisors.dispatch:FIX:writ_gate_on_synthesis:20260712⬡
  // Found live on the A'NU page: this synthesis is the only user-facing text in the
  // whole teeth flow (audience:'user' below) and it was never cleaned, so raw markdown
  // (**bold**, headers) leaked straight onto the founder's plain-language page. WRIT
  // handles em dash/emoji/meta but NOT markdown syntax (verified: it left ** untouched);
  // core/format.matrix.js stripMarkdown is the module already built for that job. Both.
  try { var _w = require('../board/writ/writ').writCheck(synthesis); if (_w && _w.ok && typeof _w.content === 'string') synthesis = _w.content; } catch (eW) {}
  try { synthesis = require('../core/format.matrix.js').stripMarkdown(synthesis); } catch (eF) {}
  await stamp({ ham_uid: HAM, agent_global: advisorName.toUpperCase(), stamp_type: 'RESULT',
    acl_stamp: '\u2b21B:advisors.dispatch:RESULT:team_synthesis:' + ymd() + '\u2b21',
    source: 'dispatch.synth.' + advisorName.toLowerCase() + '.' + Date.now(),
    summary: '[' + advisorName + ' team brief] ' + (synthesis || '').slice(0, 150),
    content: JSON.stringify(_lineage.attachLineage({ ask: ask, answer: synthesis, team: team, deliverables: results }, { chain: [advisorName.toUpperCase()].concat(team.map(function(t){return t.station;})), deliveredBy: advisorName.toUpperCase(), why: _lineage.forHer(synthesis), audience: 'user' })), importance: 7 });
  if (_aa) await _aa.writeLastRun(advisorName, HAM, {
    summary: 'dispatched ' + team.length + ' stations on: ' + String(ask).slice(0, 100),
    done: team.map(function (t) { return t.station + ': ' + t.job; }),
    found: results.filter(function (r) { return r.deliverable; }).map(function (r) { return r.role + ' delivered'; })
  });
  return { ok: true, dispatched: team.length, team: team, deliverables: results, answer: synthesis };
}

// \u2b21B:advisors.dispatch:BUILD:universal_one_line_gate:20260711\u2b21
// THE MODEL, made universal (founder order 20260711): 'turn Eli into the model for
// ALL advisors.' Any advisor's runCycle calls this ONE line, right after it knows its
// HAM. If the founder gave a real substantial ask, the team dispatches and this
// returns the finished result -- the advisor's own runCycle returns early, never
// reaching its normal single-answer path. If there is no ask, or it is the routine
// standing cycle (no intent, or a short non-strategic one), this returns null and the
// advisor proceeds exactly as it always has -- so BDIF/GMG's proven real inbox-scan
// and draft work is NEVER replaced by a fake team when there is nothing to dispatch.
async function maybeDispatch(advisorName, hamUid, ask, ctx) {
  if (!ask || typeof ask !== 'string') return null;
  var substantial = ask.length > 40 || /plan|strategy|contract|grant|prepare|draft|research|template|MOU|filing|review|roadmap|proposal|budget|pitch/i.test(ask);
  if (!substantial) return null;
  try {
    var out = await dispatch(advisorName, hamUid, ask, ctx || '');
    if (out && out.ok && out.answer) {
      return { ok: true, answer: out.answer.slice(0, 800), dispatched: out.dispatched, team: out.team, viaTeam: true };
    }
  } catch (e) { /* fall through to the advisor's own path, never block a real cycle */ }
  return null;
}


// ⬡B:advisors.dispatch:BUILD:actOnBrief_reusable_actor_20260713⬡
// Reusable ACTOR: any adviser (especially the LIFE team lead on her standing review)
// turns a finished brief into 0-3 real proposed actions for A'NEW. Same doctrine as the
// inline dispatch actor: the adviser PROPOSES (stamps PROPOSED_ACTION to A'NEW); A'NEW +
// the one PAI cycle decide and execute the real tools. No adviser fires a tool itself.
async function actOnBrief(advisorName, hamUid, brief) {
  var HAM = String(hamUid || '').toUpperCase();
  if (!HAM || !brief) return { ok: false, proposed: 0 };
  var actorRaw = await llm(
    'You are ' + advisorName + ', the lead consultant, deciding what real ACTIONS your brief now demands. '
    + 'A real consultant books time, assigns work, and sets follow-ups -- they do not just advise. '
    + 'Output a JSON array (no prose) of 0-3 concrete actions; [] is correct when none is truly warranted. '
    + 'Each: {"type":"reminder"|"meeting"|"assignment_for_founder"|"assignment_for_team","text":"plain words","when":"ISO date or empty","why":"one line"}.',
    'Brief:\n' + String(brief).slice(0, 800), 400);
  var actions = [];
  try {
    var _clean = String(actorRaw || '').replace(/```json|```/g, '').trim();
    var _m = _clean.match(/\[[\s\S]*\]/);
    actions = JSON.parse(_m ? _m[0] : _clean);
  } catch (e) { actions = []; }
  if (!Array.isArray(actions) || !actions.length) return { ok: true, proposed: 0 };
  var n = 0;
  for (var ai = 0; ai < Math.min(actions.length, 3); ai++) {
    var act = actions[ai] || {};
    await stamp({ ham_uid: HAM, agent_global: 'ANEW', stamp_type: 'PROPOSED_ACTION',
      acl_stamp: '\u2b21B:advisors.actor:PROPOSED_ACTION:' + String(act.type || 'action').toLowerCase() + ':' + ymd() + '\u2b21',
      source: 'actor.' + advisorName.toLowerCase() + '.' + Date.now() + '.' + ai,
      summary: '[' + advisorName + ' proposes ' + (act.type || 'action') + '] ' + String(act.text || '').slice(0, 120),
      content: JSON.stringify(_lineage.attachLineage(
        { proposed_by: advisorName.toUpperCase(), action: act, from_brief: String(brief).slice(0, 200) },
        { chain: [advisorName.toUpperCase(), 'ANEW'], deliveredBy: advisorName.toUpperCase(),
          why: 'consultant action for A\'NEW to weigh + execute via the one cycle: ' + String(act.why || act.text || '').slice(0, 80),
          audience: 'anew' })),
      importance: (act.type === 'meeting' || act.type === 'assignment_for_founder') ? 8 : 6 });
    n++;
  }
  return { ok: true, proposed: n };
}

module.exports = { dispatch: dispatch, planTeam: planTeam, stationCook: stationCook, maybeDispatch: maybeDispatch, actOnBrief: actOnBrief };
