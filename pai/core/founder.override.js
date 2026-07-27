// ⬡B:core.founder_override:MODULE:the_founders_back_pocket_key:20260726⬡
// FOUNDER OVERRIDES. Governors Doctrine 20260723, his own words:
//   "I want to do concepts of founder overrides... if I manually want to summon Agent Span,
//    only the founder can do that, and my hidden thing is an at symbol."
//   "@span, @coda, @guide: a founder-only summons on any channel, INCLUDING TEXT. It does not
//    bypass anything; A'NU manually posts to the summoned lane and the full cycle still runs,
//    WATCHED. It exists mostly for coding. The system is never built to depend on overrides."
//
// What was here before 20260726: `#` was zero lines in six repos, and `@` was parsed in exactly
// one portal route (routes/onespot.routes.js) which set payload.founderOverride onto a body that
// routes/cara.routes.js destructured as { message, hamUid, sessionId }. The tag was dropped on the
// floor at the gate. Nothing downstream had ever heard of it, and no channel except that one
// portal parsed it at all, so the text-message case his spec is explicit about did not exist.
//
// Wonder contract, the five W's:
//  WHO:   the founder only, and only the founder resolved by env (FOUNDER_HAM_UID) against the
//         HAM the ABAHAM door already signed for this turn. Anyone else's @word or #word is an
//         ordinary message with an ordinary meaning and stays untagged. Zero literals here.
//  WHAT:  two sigils. `@name` SUMMONS a named organ into the turn. `#name` names the outbound
//         SURFACE the answer is posted to, and both turn the cycle WATCH on.
//  WHEN:  at the door of any channel that carries founder words: the chat gate, the one spot,
//         and text. It is parsed once, at the door, and rides as council context.
//  WHERE: this file DECIDES NOTHING and SPEAKS TO NOBODY. It resolves a tag against real rosters
//         and hands a directive to the cycle. Granddaddy 911: a work feeds the wonder.
//  WHY:   a back-pocket key the founder knows how to use, for the times the cycle needs pointing
//         at a specific lane. Never a shortcut around the cycle: it is a way to WATCH the cycle.
//  HOW:   COLD CARRIER only. Extracting a leading sigil token from a string is a fact, not a
//         judgment, and resolving that token against a real roster is a lookup, not a judgment.
//         Whether to consult the summoned organ, what to say, and whether the answer may leave
//         all stay with the mind and the seven post-write judges, exactly as before.
//
// Entrance: readOverride({ message, hamUid, founderHamUid?, deps? })
// Exit:     null (no override, the overwhelmingly common case) or a directive object that the
//           caller places at identity.council_context.founder_override. Never throws.
'use strict';

var SIGIL_SUMMON = '@';
var SIGIL_POST = '#';

// COLD CARRIER: pull the leading sigil token off the front of the founder's words.
// Only a token at the very start counts, so an email address or a mid sentence hash
// is never mistaken for a key. Decides nothing; the remainder is returned untouched
// so the message the mind sees is the founder's exact words, never a rewrite.
function parseTag(text) {
  var raw = String(text == null ? '' : text);
  var trimmed = raw.trim();
  var match = /^([@#])([A-Za-z][A-Za-z0-9_-]{0,31})\b/.exec(trimmed);
  if (!match) return null;
  return {
    sigil: match[1],
    target: match[2].toLowerCase(),
    token: match[1] + match[2],
    remainder: trimmed.slice(match[0].length).trim()
  };
}

// IDENTITY IS ENV ONLY. The founder HAM is never a literal, never a fallback default,
// and an unset env means nobody is the founder and every tag stays an ordinary word.
function isFounderHam(hamUid, founderHamUid) {
  var founder = String(founderHamUid === undefined
    ? (process.env.FOUNDER_HAM_UID || '') : (founderHamUid || '')).trim().toUpperCase();
  var ham = String(hamUid || '').trim().toUpperCase();
  return !!founder && !!ham && founder === ham;
}

// COLD LOOKUP against the REAL wonder registry. Never invents an organ: an unknown
// name resolves to nothing and the roster of what does exist rides back so the mind
// can say so honestly instead of pretending the lane was summoned.
function resolveRegistryOrgan(target, deps) {
  var registry = (deps && deps.registry) || require('./wonders/registry.js');
  var nodes;
  try { nodes = registry.list(); } catch (eList) { return null; }
  if (!Array.isArray(nodes)) return null;
  var want = String(target || '').toLowerCase();
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i] || {};
    var display = String(node.display_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    var idTail = String(node.id || '').split('.').pop().toLowerCase();
    if (display === want || idTail === want) {
      return { source: 'wonder_registry', id: node.id, name: node.display_name,
        kind: node.kind, lifecycle: node.lifecycle,
        return_gate: node.return_gate || null };
    }
  }
  return null;
}

// COLD LOOKUP against the HAM's REAL advisor roster, the same per-HAM discovery the
// consult_advisor cycle tool uses. No hardcoded advisor list anywhere.
async function resolveAdvisorStation(target, hamUid, deps) {
  var router;
  try { router = (deps && deps.advisorRouter) || require('../advisors/advisor-router.js'); }
  catch (eRouter) { return { station: null, roster: [] }; }
  if (!router || typeof router.discoverStations !== 'function') return { station: null, roster: [] };
  var roster = [];
  try { roster = await router.discoverStations(hamUid); } catch (eDiscover) { roster = []; }
  if (!Array.isArray(roster)) roster = [];
  var want = String(target || '').toLowerCase();
  return { station: roster.indexOf(want) >= 0 ? want : null, roster: roster.slice(0, 40) };
}

// COLD LOOKUP for the post sigil: the surface category the founder named, resolved by
// the one channel classifier this repo already owns. 'chat' is the classifier's own
// catch all, so a name it does not recognize is reported as unresolved rather than
// silently posted to the wrong lane.
function resolvePostSurface(target, deps) {
  var classifier = (deps && deps.channelClassifier) || require('./channel.classifier.js');
  var name = String(target || '').toLowerCase();
  var category;
  try { category = classifier.classifyChannel(name); } catch (eClassify) { category = 'unknown'; }
  if (category === 'chat' && ['chat', 'cara', 'portal', 'alive'].indexOf(name) < 0) {
    return { ok: false, channel: name, category: null };
  }
  return { ok: true, channel: name, category: category };
}

// THE DOOR. Returns null for every ordinary turn.
async function readOverride(input) {
  input = input || {};
  var deps = input.deps || {};
  var tag = parseTag(input.message);
  if (!tag) return null;
  if (!isFounderHam(input.hamUid, input.founderHamUid)) {
    // Not the founder. His key is his; anyone else's @word is just a word.
    return null;
  }

  var base = {
    schema: 'anew.founder.override.v1',
    sigil: tag.sigil,
    target: tag.target,
    token: tag.token,
    // The founder's exact words minus the key, so the mind can be told what the
    // summons is ABOUT without the key itself being mistaken for the request.
    request: tag.remainder,
    // Both sigils turn the watch on. That is the point of the override: he is not
    // skipping the cycle, he is standing over it while it runs.
    watch: true,
    at: new Date().toISOString()
  };

  if (tag.sigil === SIGIL_POST) {
    var surface = resolvePostSurface(tag.target, deps);
    return Object.assign(base, {
      kind: 'post',
      resolved: surface.ok,
      channel: surface.channel,
      channel_category: surface.category,
      reason: surface.ok ? 'post_surface_resolved' : 'post_surface_unknown'
    });
  }

  var organ = resolveRegistryOrgan(tag.target, deps);
  if (organ) {
    return Object.assign(base, { kind: 'summon', resolved: true,
      organ: organ, reason: 'summoned_registered_organ' });
  }
  var advisor = await resolveAdvisorStation(tag.target, input.hamUid, deps);
  if (advisor.station) {
    return Object.assign(base, { kind: 'summon', resolved: true,
      organ: { source: 'advisor_roster', id: 'advisor.' + advisor.station,
        name: advisor.station.toUpperCase(), kind: 'advisor_station', lifecycle: 'active',
        return_gate: null },
      reason: 'summoned_advisor_station' });
  }
  return Object.assign(base, { kind: 'summon', resolved: false, organ: null,
    available: advisor.roster, reason: 'no_such_organ' });
}

// COLD CARRIER: the directive the writer is told about, as text. Formatting only.
// It never tells the mind what to answer, only which lane the founder pointed at
// and that the full cycle still governs the turn.
function overrideContextBlock(override) {
  if (!override || typeof override !== 'object') return '';
  var lines = ['FOUNDER OVERRIDE (his own back-pocket key, ' + override.token
    + '). This is not a shortcut around your cycle and it does not decide your answer. '
    + 'It points you at a lane and he is watching this run.'];
  if (override.kind === 'summon' && override.resolved) {
    lines.push('He summoned ' + override.organ.name + ' (' + override.organ.id
      + ', ' + override.organ.kind + ', lifecycle ' + override.organ.lifecycle + '). '
      + 'Consult that lane through its real tool for this turn and relay what it actually returns. '
      + 'If it returns a hold or nothing, say that plainly. Never speak for it and never invent its brief.');
  } else if (override.kind === 'summon') {
    lines.push('He summoned "' + override.target + '" and no such organ is real in this world.'
      + (override.available && override.available.length
        ? ' What is real here: ' + override.available.join(', ') + '.' : '')
      + ' Tell him that honestly instead of pretending the lane answered.');
  } else if (override.kind === 'post' && override.resolved) {
    lines.push('He named the surface "' + override.channel + '" ('
      + override.channel_category + ') for this answer. Write it for that surface\'s register. '
      + 'It still has to clear every judge before it leaves.');
  } else if (override.kind === 'post') {
    lines.push('He named a surface "' + override.target + '" that does not resolve to a real '
      + 'channel here. Answer him on the channel he is already on and say the surface did not resolve.');
  }
  if (override.request) {
    lines.push('What he asked with the key: ' + String(override.request).slice(0, 600));
  }
  return lines.join('\n');
}

module.exports = {
  readOverride: readOverride,
  parseTag: parseTag,
  isFounderHam: isFounderHam,
  overrideContextBlock: overrideContextBlock,
  SIGIL_SUMMON: SIGIL_SUMMON,
  SIGIL_POST: SIGIL_POST,
  _test: { resolveRegistryOrgan: resolveRegistryOrgan,
    resolveAdvisorStation: resolveAdvisorStation, resolvePostSurface: resolvePostSurface }
};
