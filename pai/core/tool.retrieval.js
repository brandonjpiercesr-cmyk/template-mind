// ⬡B:core.tool_retrieval:MODULE:clair_reach_r4e_tool_rag_for_scale:20260720⬡
// WHO  any HAM's PAI turn that reaches tool selection. Universal, no identity, no
//      hardcoded facts. Runs unchanged for HAM 847392 or anyone.
// WHAT bound a large candidate tool set down to the few tools whose USE WHEN
//      context matches the exact user words, and expose none when even the best
//      candidate is weakly related.
// WHEN after intent routing, and only when the candidate set is larger than a
//      configured scale threshold. The roadmap defers R4E until the catalog
//      grows past roughly twenty tools, so a small routed set passes through
//      untouched and this layer stays inert.
// WHERE it rewrites body.tools inside the one shared tool loop. The model still
//      chooses among the returned subset, so this is a helper that fetches and
//      ranks, never a cold gate that decides the answer.
// WHY  R4E. Selection accuracy falls and prompt tokens rise as the visible tool
//      count grows. Retrieving a small, relevant subset keeps accuracy high and
//      tokens low, and the weak-relevance gate lets an unrelated turn fall to
//      free reasoning instead of a wrong tool.
// HOW  lexical overlap between the exact message and each tool's name plus its
//      USE WHEN clause, which is the positive-context half of the R4B tool
//      description. The DO NOT USE WHEN half is deliberately excluded so a
//      negative context cannot pull a tool into the subset. Cold code as a
//      helper only. The LLM organ on the one ladder makes the final selection.
'use strict';

var STOPWORDS = Object.freeze({
  the: 1, and: 1, for: 1, are: 1, was: 1, you: 1, your: 1, our: 1, its: 1,
  with: 1, that: 1, this: 1, what: 1, when: 1, where: 1, which: 1, who: 1,
  how: 1, why: 1, can: 1, will: 1, would: 1, should: 1, could: 1, from: 1,
  into: 1, about: 1, have: 1, has: 1, had: 1, not: 1, but: 1, any: 1, all: 1,
  please: 1, give: 1, tell: 1, want: 1, need: 1, get: 1, got: 1, does: 1,
  did: 1, done: 1, just: 1, only: 1, some: 1, more: 1, than: 1, then: 1
});

function tokens(text) {
  var seen = Object.create(null);
  var out = [];
  String(text || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (word) {
    if (word.length < 3 || STOPWORDS[word] || seen[word]) return;
    seen[word] = 1;
    out.push(word);
  });
  return out;
}

// The USE WHEN clause is the positive context. Everything from DO NOT USE WHEN
// onward is a negative context and must not lend relevance, or a tool would be
// retrieved by the very phrasing that says to avoid it.
function useWhenProfile(tool) {
  var name = tool && tool.function && tool.function.name ? tool.function.name : '';
  var description = tool && tool.function && typeof tool.function.description === 'string'
    ? tool.function.description : '';
  var positive = description.split(/DO NOT USE WHEN/i)[0];
  var set = Object.create(null);
  tokens(name.replace(/_/g, ' ') + ' ' + positive).forEach(function (word) { set[word] = 1; });
  return set;
}

function scoreTool(messageTokens, tool) {
  var profile = useWhenProfile(tool);
  var count = 0;
  for (var i = 0; i < messageTokens.length; i++) {
    if (profile[messageTokens[i]]) count++;
  }
  return count;
}

function positiveInt(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function envInt(name, fallback) {
  return positiveInt(parseInt(process.env[name] || '', 10), fallback);
}

// Return a bounded, relevance-ranked subset of tools for this exact message.
// Contract:
//   small routed set (at or below the scale threshold) is returned unchanged;
//   a message with no matchable words returns an empty set (free reasoning);
//   when even the best tool shares no USE WHEN word, returns an empty set;
//   otherwise returns up to maxTools tools that each share at least one word,
//   ranked by overlap, ties broken by original order for determinism.
function retrieveToolSubset(message, tools, opts) {
  opts = opts || {};
  var list = Array.isArray(tools) ? tools.filter(Boolean) : [];
  var scaleThreshold = positiveInt(opts.scaleThreshold, envInt('TOOL_RAG_SCALE_THRESHOLD', 12));
  var maxTools = positiveInt(opts.maxTools, envInt('TOOL_RAG_MAX_TOOLS', 8));
  if (list.length <= scaleThreshold) return list.slice();
  var messageTokens = tokens(message);
  if (!messageTokens.length) return [];
  var scored = list.map(function (tool, index) {
    return { tool: tool, index: index, score: scoreTool(messageTokens, tool) };
  });
  var best = scored.reduce(function (top, item) { return item.score > top ? item.score : top; }, 0);
  if (best <= 0) return [];
  scored.sort(function (a, b) { return b.score - a.score || a.index - b.index; });
  return scored
    .filter(function (item) { return item.score > 0; })
    .slice(0, maxTools)
    .map(function (item) { return item.tool; });
}

module.exports = {
  retrieveToolSubset: retrieveToolSubset,
  _test: { tokens: tokens, useWhenProfile: useWhenProfile, scoreTool: scoreTool }
};
