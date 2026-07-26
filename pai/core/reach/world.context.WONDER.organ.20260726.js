// ⬡B:core.reach.world_context_organ:MODULE:the_connect_rail_is_judged_not_filtered:20260726⬡
//
// THE WORLD CONTEXT ORGAN. An LLM thinking with cold code, feeding one reach surface.
//
// WHAT IT REPLACES. core/reach/screen.consumer.js composeWorldContext used to decide the
// whole "World right now" rail in cold code: a frozen list of stamp types, an importance
// threshold, a regex that deleted bracket-blocks out of the middle of sentences, a second
// regex denylist of build words, a length cutoff, and a hardcoded map from stamp type to
// a friendly label. That is a filter pretending to be a judgment. It decided what the
// founder sees the moment he opens his screen, and it wrote the labels he reads.
//
//   WHO:   any HAM. No hardcoded identity, ever, in this file or its prompt.
//   WHAT:  given the candidate rows already on record for one HAM, judges which of them
//          belong on the rail right now and writes each line in plain human words.
//   WHEN:  a live session connects and the reach layer asks for the rail.
//   WHERE: returned to core/reach/screen.consumer.js, which pushes it through the same
//          three gates every other directive crosses. This organ pushes nothing.
//   WHY:   what is worth a person's attention when they sit down is a judgment about
//          their life, not a stamp-type whitelist.
//   HOW:   cold code reads the rows (a fact) and bounds the shape; the mind selects and
//          writes; an unavailable mind means NO RAIL AT ALL, never a cold fallback list.
//
// ENTRANCE: composeWorldContext. EXIT: { ok, items[] } or { ok:false, reason }.
// NOTES: never throws. Hollow over canned: silence is a correct rail.
'use strict';

var ladder = require('../model.ladder.js');

var NAME = 'WORLD_CONTEXT';
var TIER = 'C2';
var MAX_ITEMS = 6;
var MAX_CANDIDATES = 24;

function safeStr(v) { return v == null ? '' : String(v); }
function stripDashes(s) {
  return safeStr(s).replace(new RegExp('[\\u2014\\u2013]', 'g'), ', ');
}

function extractJson(text) {
  var s = safeStr(text).trim();
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  var first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { return null; }
}

function buildSystemPrompt() {
  return [
    'You compose the rail a person sees the moment they open their screen. You are a work that',
    'feeds the reach layer: you never speak to anyone and you never send anything, you only decide',
    'what belongs on the rail and write the words.',
    'You are given rows from this person’s own record. Some are about their life and some are',
    'the machinery of the system that keeps the record. Judge each one the way someone who knows',
    'them would: does seeing this right now change anything for them, or tell them something they',
    'would want to know today?',
    'Leave out anything that is only the system talking about itself: builds, deploys, code paths,',
    'test results, internal agent names, audits, syncs, or a job that finished. Those are true and',
    'they are not their life.',
    'THE TONE LAW: never open with the machinery. Say the thing that happened in the world, in a',
    'whole plain sentence, the way a person who actually knows them would say it. Never a terse',
    'fragment, never a bracket tag, never a stamp name.',
    'Use only what the rows say. Never invent a time, a name, a number, or an outcome that is not',
    'there. If a row is too garbled to say plainly, leave it out.',
    'Choosing nothing is a correct answer. An empty rail is better than a rail of noise.',
    'Return at most ' + MAX_ITEMS + ' items, most worth their attention first.',
    'Reply with ONLY one JSON object, no prose, no code fences:',
    '{"items":[{"index":<the row number you are keeping>,"kind":"<two or three plain words naming',
    'what this is, in their language not the system’s>","text":"<the one full human sentence>"}],',
    '"reasoning":"<one sentence, internal>"}'
  ].join(' ');
}

// Cold code hands over the rows whole. It does not pre-judge which ones are worth reading,
// which is the exact thing the old stamp-type whitelist was doing.
function buildUser(rows) {
  var lines = rows.map(function (row, index) {
    return '[' + index + '] stamp_type=' + safeStr(row.stamp_type) +
      ' importance=' + safeStr(row.importance) +
      ' at=' + safeStr(row.created_at) +
      '\n    ' + safeStr(row.summary).slice(0, 600);
  });
  return ['CANDIDATE ROWS FROM THIS PERSON’S OWN RECORD:', ''].concat(lines).concat([
    '',
    'Return the JSON. Keep only the rows that belong on their rail right now, and write each line yourself.'
  ]).join('\n');
}

// The mind names the row by index, so a line can never be attached to a row it did not come
// from, and cold code never has to guess which row a sentence belongs to.
function normalizeItems(parsed, rows) {
  if (!parsed || !Array.isArray(parsed.items)) return null;
  var out = [];
  for (var i = 0; i < parsed.items.length && out.length < MAX_ITEMS; i++) {
    var item = parsed.items[i];
    if (!item || typeof item !== 'object') continue;
    var index = Number(item.index);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) continue;
    var text = stripDashes(safeStr(item.text).replace(/\s+/g, ' ').trim());
    var kind = stripDashes(safeStr(item.kind).replace(/\s+/g, ' ').trim());
    if (!text || !kind) continue;
    out.push({ type: 'context_item', kind: kind.slice(0, 60), text: text.slice(0, 400),
      importance: rows[index].importance, source_row: index });
  }
  return out;
}

// composeRail(rows, opts) -> { ok:true, items:[...] } | { ok:false, reason }
// opts.deliberate lets a caller or a test supply the mind's door explicitly.
async function composeRail(rows, opts) {
  var options = opts || {};
  var candidates = Array.isArray(rows) ? rows.slice(0, MAX_CANDIDATES) : [];
  if (!candidates.length) return { ok: false, reason: 'no_candidate_rows', items: [] };

  var deliberate = typeof options.deliberate === 'function' ? options.deliberate : ladder.deliberate;
  if (typeof deliberate !== 'function') {
    return { ok: false, reason: 'world_context_mind_unavailable', items: [] };
  }

  var ruling;
  try {
    ruling = await deliberate(buildSystemPrompt(), buildUser(candidates),
      { json: true, max_tokens: 900, temperature: 0.2, timeout: 30000 });
  } catch (e) {
    return { ok: false, reason: 'world_context_mind_threw', items: [] };
  }
  if (!ruling || !ruling.content) {
    return { ok: false, reason: 'world_context_mind_unavailable', items: [] };
  }

  var items = normalizeItems(extractJson(ruling.content), candidates);
  if (items === null) return { ok: false, reason: 'world_context_ruling_unreadable', items: [] };
  // An empty selection is a real ruling: the mind read his record and there is nothing
  // worth putting in front of him. That is a rail-free screen, not a failure.
  return { ok: true, items: items, reasoning: safeStr(ruling && ruling.reasoning).slice(0, 300),
    model: ruling.model || null, via: ruling.via || null };
}

module.exports = { composeRail: composeRail, NAME: NAME, TIER: TIER,
  _test: { buildSystemPrompt: buildSystemPrompt, buildUser: buildUser,
    normalizeItems: normalizeItems, extractJson: extractJson, MAX_ITEMS: MAX_ITEMS } };
