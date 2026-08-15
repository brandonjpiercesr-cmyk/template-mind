// ⬡B:core.reach.wonder:MODULE:reach_decision_organ_llm_thinking_with_cold_code:20260722⬡
// THE REACH DECISION ORGAN (Phase 2 of the Envolve Coronation: reach becomes a wonder)
// -------------------------------------------------------------------------------------
// The old exit decision was a cold threshold table (core/overseer/exit.space.js chooseExit):
// confidence and an importance number mapped to a channel. That table is a good SAFETY WALL
// but a poor DECIDER, exactly the wonder-first line the founder drew: cold code can HELP, never
// RESULT. This organ is the mind that decides which way A'NU reaches the founder, and the cold
// table stays underneath it as the bound and the floor.
//
// PROVENANCE: A'NU's own ruling, consulted live through her real gate (/cara/chat, cycleId
// DC499D0C.1784706460725.olv0tp, 20260722). Her words, kept faithfully in the system prompt below,
// are the whole logic: reach at all only when it changes what they would do next, most things are a
// quiet note, a text is for what shifts their next few hours, a call is the narrow urgent-and-
// irreversible band, email is almost never a reach, and some categories always reach them now. And
// the tone law: never open with the machinery, say the thing that happened in the world.
//
// ⬡B:core.reach.wonder:LAW:the_always_reach_set_is_READ_from_this_hams_record_never_planted:20260815⬡
// FOUNDER LAW, "IDENTITY IS ENV-ONLY, NEVER A LITERAL" (20260722, CLAUDE.md, non-negotiable):
// never hardcode a real person, no email, no phone, no HAM UID, no child's or family member's
// name, not even as a fallback default.
//
// WHAT WAS HERE, and it was the worst instance of that defect in this repo. The always-reach
// paragraph of the system prompt below named a real person by first name, and asserted a real
// person's family, as unconditional prompt text: not a comment, not a fallback, not a default.
// It read, in the shape of a standing law handed to the mind on every single call, "the safety
// or wellbeing of his children ... anything not routine from his partner <a real first name>".
//
// WHY IT WAS WORSE THAN A LEAK. It was LOAD BEARING. Those planted facts fed the one flag that
// escalates a finding to the strongest channel the region permits, so a biography belonging to
// one human was what decided whether a STRANGER'S PHONE RINGS in every world that inherits this
// template. core/real.name.boundary.js states the same thing about itself in its own words: a
// name written into the mind template is "a real human buried in every stranger's deploy". And
// the founder's own law, "cold code never decides to reach a human", is broken twice over when
// the thing cold code plants is somebody else's family.
//
// STATED, because the guard cannot: scripts/checks/no-founder-pii.js was green on this file the
// whole time and is still green. Its own header names the gap out loud, that a bare first name
// with nothing personal-data-shaped near it is not detected. This defect lived inside that
// stated limit. A green gate was never evidence that this line was lawful.
//
// WHAT REPLACES IT. The always-reach set is now ASSEMBLED AT RUNTIME from THIS HAM's own record,
// through the mechanisms that already exist for exactly this: standing CORE_DIRECTIVE beads under
// the source prefix 'directive.reach.always.' read through the one canonical brain boundary
// (core/brain.client.js readBead), and any person those directives point at resolved through the
// sanctioned contacts path (core/contacts.js resolveContact, which reads that HAM's own CONTACT
// beads). No new stamp type was invented and no second brain client was hand rolled.
//
// AND WHEN THERE IS NOTHING TO READ: a documented EMPTY SET plus ok:false, never a default
// person. The prompt then tells the mind plainly that this person has no standing always-reach
// list on record, that it may invent no category from anything it thinks it knows about their
// life, and that call_worthy must be false; cold code forces call_worthy false on that branch
// as well, so the escalation band cannot be reached on a guess. Silence over a planted human.
//
// THE AUDIT CARRIES SHAPES, NOT NAMES. The decision object returns always_reach as { ok, count,
// reason }, never the category text, for the same reason core/real.name.boundary.js returns
// shapes: this object is stamped into a bead and read back in receipts, and an audit trail that
// carries the thing it is auditing is not an audit trail.
//
// PRONOUNS ARE NEUTRAL THROUGHOUT. The Wonder Contract requires this organ to be universal
// across any HAM (the 847392 test). The prompt said "he" and "his" on every line, which is a
// second assumption about a stranger riding in the same paragraph as the first.
//
// WHAT IT IS (Wonder Contract, bucket one): an LLM thinking with cold code. Cold code (chooseExit)
// fetches the bounded region for this confidence and importance; the LLM organ judges the ONE exit
// inside that region the way A'NU would, and composes the world-tone line; the cold validateExit
// wall refuses any pick outside the region; when the model is unavailable the cold choice stands.
//   WHO:   any HAM (universal, no hardcoded identity, the 847392 test).
//   WHAT:  given one finding (its summary, content, importance, confidence), decides the exit
//          channel A'NU would choose and writes the one human line she would open with.
//   WHEN:  the overseer exit pass fires it per high-importance finding, before anything is sent.
//   WHERE: returned to the exit tool, which stamps the EXIT_DECISION bead the reach layer consumes.
//          It NEVER speaks or sends (granddaddy-911); it decides, the reach layer sends on its laws.
//   WHY:   which way to reach a person is a judgment over what the thing means to them, not a
//          number over a threshold; the number bounds the judgment, it does not make it.
//   HOW:   cold chooseExit bounds the region, the mind picks inside it and flags a call-worthy
//          escalation when THIS HAM's own always-reach categories hit, validateExit enforces the
//          bound, and the cold choice is the floor when the mind is unavailable. Never throws.
'use strict';

var space = require('./overseer/exit.space.js');
var ladder = require('./model.ladder.js');

var NAME = 'REACH';
var TIER = 'C2';

// The one canonical brain boundary and the one contacts path. Required defensively so a world
// missing either module degrades to the empty always-reach set (the correct behavior) instead of
// tearing down a cycle. Never a second hand maintained client, per the one-source law.
var brain = null;
try { brain = require('./brain.client.js'); } catch (e) { brain = null; }
var contacts = null;
try { contacts = require('./contacts.js'); } catch (e) { contacts = null; }

// Standing always-reach directives live as CORE_DIRECTIVE beads under this source prefix, the
// same stamp type and the same 'directive.<lane>.' source shape advisors/advisor-router.js
// already reads a station's standing directive from. No new stamp type was invented for this.
var ALWAYS_REACH_SOURCE_PREFIX = 'directive.reach.always.';
var MAX_ALWAYS_REACH = 12;

// A'NU's ruling, faithful, as the system prompt. This is her judgment written down, not invented.
// alwaysReach is the runtime result of alwaysReachCategories() for THIS HAM: never a literal,
// never a default, and an empty set is a real and correct answer.
function buildSystemPrompt(alwaysReach) {
  var set = (alwaysReach && typeof alwaysReach === 'object') ? alwaysReach : { ok: false, categories: [] };
  var categories = Array.isArray(set.categories) ? set.categories : [];
  var haveSet = set.ok === true && categories.length > 0;

  // ⬡B:core.reach.wonder:LAW:no_standing_list_means_no_escalation_never_a_default_person:20260815⬡
  // The branch that used to carry a real family. It carries a refusal now. Read the file header.
  var alwaysReachLine = haveSet
    ? ('Some things always reach this person right away, and those you must flag as call worthy. '
      + 'This list was READ FROM THEIR OWN RECORD for this call, it is not assumed and it is not '
      + 'a general rule about people: ' + categories.map(function (c, i) {
        return '(' + (i + 1) + ') ' + c;
      }).join(' ') + ' When any of these is true set call_worthy true, and choose the strongest '
      + 'channel the allowed set permits. Nothing outside this list is automatically call worthy.')
    : ('This person has NO standing always reach list on record, so there is nothing here you may '
      + 'treat as automatically call worthy. Set call_worthy false. You were told nothing about '
      + 'their life and you must invent nothing: not a family, not a partner, not children, not a '
      + 'company, not an obligation. Assuming any of those and escalating on it would be reaching '
      + 'a real person on a guess about a stranger. Judge the channel on this one finding alone, '
      + 'inside the allowed set.');

  return [
    'You are the reach decision organ. You judge which way A’NU reaches the person she serves. You are a work that feeds the reach layer; you never speak to anyone and you never send anything, you only decide.',
    'A cold table already bounded the allowed channels for this finding. You choose the ONE channel A’NU would choose from the allowed set, and you write the one human line she would open with.',
    'A’NU’s own ruling, follow it exactly:',
    'Reach at all only when it changes what the person would do next, not when it just describes what already happened. Most things are a quiet note that sits on their screen until they look: routine completions, system health, progress, their own work, and anything you are uncertain about.',
    'A quiet note is the COMMAND_CENTER channel, or LOGFUL when it is pure record. Choose it for most things.',
    'A TEXT is for something they would want to know soon because it shifts their mood or their plan for the next few hours, but it is not an emergency and does not need their voice. Say what it is, what you think they would want to do, and that they can answer whenever they get a breath.',
    'EMAIL is almost never a reach out. Use it only when the thing needs a record or has paperwork they must read. If you are reaching them, a text or a quiet note is almost always better.',
    'The one place email is exactly right, by their own ask: when the finding is your own advisor report or digest addressed to them, the standing record they asked to receive in their inbox (its kind is an advisor report or inbox digest). That is a record they must read, not an alert interrupting them, so when the allowed set permits EMAIL choose EMAIL for it. This is the record case above, not a new rule.',
    alwaysReachLine,
    'When the finding is low confidence and the allowed set is a review channel, choose the review channel: it is better to have a second look than to reach on a shaky read.',
    'THE TONE LAW: never open with the machinery. Never say an agent did a task or a process ran. Say the thing that happened in the world, the way someone who actually knows them would say it. They are not a system admin reading alerts, they are a person with a life going on outside this system, and you know nothing about that life beyond what you were handed on this call.',
    'One more judgment, separate from the channel: a live screen they are actually looking at is its own surface. Set live_screen true only when this finding is worth appearing in front of them while they are sitting there, and false when it is a record they can find later. A quiet note is already that screen, so this only matters when you chose a channel other than COMMAND_CENTER. A cold list used to make this call for you; it is yours now, and false is a perfectly good answer.',
    'Choose ONLY from the allowed channels given to you. Reply with ONLY one JSON object, no prose, no fences: {"exit":"<one of the allowed channels>","call_worthy":<boolean>,"live_screen":<boolean>,"world_line":"<the one human line to open with, full and plain, never the machinery, never a terse fragment>","reasoning":"<internal why>"}'
  ].join(' ');
}

function safeStr(v) { return v == null ? '' : String(v); }
function stripDashes(s) { return safeStr(s).replace(new RegExp('[\\u2014\\u2013]', 'g'), ', '); }

function extractJson(text) {
  var s = safeStr(text).trim();
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  var first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { return null; }
}

// ⬡B:core.reach.wonder:BUILD:always_reach_assembled_from_this_hams_own_beads:20260815⬡
// THE REPLACEMENT for the planted paragraph. Reads this HAM's standing always-reach directives
// and returns { ok, categories, reason, dropped }. Never throws, and never returns a category it
// could not source from that HAM's own record.
//
// A directive bead is one of two shapes, both written by the HAM's own world, never by this file:
//   content { category: "<plain words for what always reaches them>" }
//   content { category: "<plain words>", contact: "<a name or relationship phrase>" }
// The second is the ONLY way a person enters this prompt. The phrase is handed to the sanctioned
// contacts path (core/contacts.js resolveContact), which resolves it against that HAM's own
// CONTACT beads. A phrase that does not resolve to a real contact for this HAM is DROPPED, not
// passed through: an unresolved phrase is an unverified person, and this organ has exactly one
// lawful source for a person and that is not it.
//
// EMPTY IS A REAL ANSWER, and the only correct one when there is nothing to read. Every failure
// path below lands on ok:false with categories:[] and a named reason. There is no default set,
// no example set, and no person anywhere in this function.
function alwaysReachEmpty(reason) {
  return { ok: false, categories: [], reason: reason, dropped: 0 };
}

function readCategoryFromBead(row) {
  var content = row && row.content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch (e) { content = null; }
  }
  if (!content || typeof content !== 'object') content = {};
  var category = safeStr(content.category || row && row.summary).replace(/^\[[^\]]*\]\s*/, '').trim();
  var contactPhrase = safeStr(content.contact).trim();
  return { category: category.slice(0, 240), contactPhrase: contactPhrase.slice(0, 120) };
}

async function alwaysReachCategories(hamUid, opts) {
  var options = opts || {};
  // A caller or a test may hand the assembled set in directly. That seam exists so this organ can
  // be exercised without a brain, never so a category can be smuggled in from source code.
  if (options.alwaysReach && typeof options.alwaysReach === 'object') return options.alwaysReach;

  var ham = safeStr(hamUid).trim().toUpperCase();
  if (!ham) return alwaysReachEmpty('no_ham_uid_no_always_reach_set');
  if (!brain || typeof brain.readBead !== 'function') return alwaysReachEmpty('brain_boundary_unavailable');
  if (!(process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL)) {
    return alwaysReachEmpty('brain_unconfigured_no_always_reach_set');
  }

  var rows;
  try {
    rows = await brain.readBead({
      ham_uid: 'eq.' + ham,
      stamp_type: 'eq.CORE_DIRECTIVE',
      source: 'like.' + ALWAYS_REACH_SOURCE_PREFIX + '*',
      select: 'summary,content,source',
      order: 'created_at.desc',
      limit: String(MAX_ALWAYS_REACH)
    });
  } catch (e) { return alwaysReachEmpty('always_reach_read_failed'); }
  if (!Array.isArray(rows) || !rows.length) return alwaysReachEmpty('no_always_reach_beads_on_record');

  var resolve = (typeof options.resolveContact === 'function') ? options.resolveContact
    : (contacts && typeof contacts.resolveContact === 'function' ? contacts.resolveContact : null);

  var categories = [];
  var dropped = 0;
  for (var i = 0; i < rows.length && categories.length < MAX_ALWAYS_REACH; i++) {
    var parsed = readCategoryFromBead(rows[i]);
    if (!parsed.category) { dropped++; continue; }
    if (!parsed.contactPhrase) { categories.push(stripDashes(parsed.category)); continue; }
    if (!resolve) { dropped++; continue; }
    var contact = null;
    try { contact = await resolve(ham, parsed.contactPhrase); } catch (e) { contact = null; }
    var who = contact ? safeStr(contact.name).trim() : '';
    var rel = contact ? safeStr(contact.relationship).trim() : '';
    if (!who && !rel) { dropped++; continue; }
    // The name and the relationship both come off that HAM's own CONTACT bead, resolved on this
    // call. Neither was ever written here.
    var named = rel && who ? (rel + ' ' + who) : (who || rel);
    categories.push(stripDashes(parsed.category + ' (this person on their own record: ' + named + ')'));
  }

  if (!categories.length) return { ok: false, categories: [], reason: 'no_always_reach_category_survived_resolution', dropped: dropped };
  return { ok: true, categories: categories, reason: null, dropped: dropped };
}

// The cold floor, always available: the bounded region and the cold pick. Never throws.
function coldDecision(confidence, importance) {
  try { return space.chooseExit(confidence, importance); }
  catch (e) { return { ok: false, refused: true, reason: 'cold_choose_threw' }; }
}

// THE ORGAN. judgeExit(finding, opts) -> a decision object. finding: { summary, content, importance,
// confidence }. Returns { ok, exit, region, call_worthy, world_line, reasoning, source, cold_exit,
// always_reach }. source is 'llm' when the mind decided within the region, 'floor' when it fell
// back to the cold pick. Never throws: any failure returns the cold decision so an exit is never
// left undecided.
//
// opts.hamUid is what makes the always-reach set THIS person's. Without it the set is empty and
// call_worthy is forced false, which is the fail-closed answer: nothing is escalated on a guess.
async function judgeExit(finding, opts) {
  var options = opts || {};
  var f = (finding && typeof finding === 'object') ? finding : {};
  var confidence = Number(f.confidence);
  var importance = Number(f.importance);
  var cold = coldDecision(confidence, importance);
  // If the cold space itself refused (out of schema), there is nothing to bound the mind with;
  // return the refusal untouched. The wall stays the wall.
  if (!cold.ok) return { ok: false, refused: true, reason: cold.reason, source: 'floor' };

  // ⬡B:core.reach.wonder:GUARD:the_floor_records_it_never_reaches:20260726⬡
  // SUPERSEDES a floor that returned cold.exit and the raw bead summary on five separate
  // paths: no deliberate function, a throw, an empty reply, unparseable JSON, and a pick
  // outside the region. On every one of them the mind said nothing, and cold code handed
  // back a REACHING channel (importance 9 and up is TEXT) plus a line to say. A threshold
  // read is not a decision to interrupt a person, and a bead summary is not her voice.
  // The floor now does the one thing a floor is for: it keeps the decision from being
  // undecided, as pure record. LOGFUL reaches nobody. The cold pick and the region it came
  // from are both kept on the decision so nothing is lost and the fall is auditable.
  // The always-reach set for THIS HAM, read now, off their own record. Never throws; an empty set
  // is a real answer. Carried on the decision as a shape (ok, count, reason), never as its text.
  var alwaysReach;
  try { alwaysReach = await alwaysReachCategories(options.hamUid, options); }
  catch (e) { alwaysReach = alwaysReachEmpty('always_reach_assembly_threw'); }
  var alwaysReachAudit = { ok: alwaysReach.ok === true,
    count: Array.isArray(alwaysReach.categories) ? alwaysReach.categories.length : 0,
    reason: alwaysReach.reason || null, dropped: alwaysReach.dropped || 0 };

  var floorOut = { ok: true, exit: 'LOGFUL', region: cold.region, call_worthy: false,
    live_screen: false,
    world_line: null, reasoning: 'No mind answered; recorded only, nothing reached.',
    source: 'floor', cold_exit: cold.exit, floored_from: cold.exit,
    always_reach: alwaysReachAudit };

  var deliberate = (options && typeof options.deliberate === 'function') ? options.deliberate : ladder.deliberate;
  if (typeof deliberate !== 'function') return floorOut;

  var user = [
    'FINDING (what an organ surfaced this window):',
    'summary: ' + safeStr(f.summary).slice(0, 600),
    'detail: ' + safeStr(typeof f.content === 'string' ? f.content : JSON.stringify(f.content || {})).slice(0, 1200),
    'importance (1 to 10): ' + (isFinite(importance) ? importance : 'unknown'),
    'confidence (0 to 1): ' + (isFinite(confidence) ? confidence : 'unknown'),
    '',
    'ALLOWED CHANNELS for this finding (choose exactly one of these, nothing else): ' + JSON.stringify(cold.region),
    'The cold table would have chosen: ' + cold.exit,
    '',
    'Return the JSON with your channel, whether it is call worthy, and the one human line.'
  ].join('\n');

  var ruling;
  try {
    ruling = await deliberate(buildSystemPrompt(alwaysReach), user, { json: true, max_tokens: 700, temperature: 0.2, timeout: 45000 });
  } catch (e) { return floorOut; }
  if (!ruling || !ruling.content) return floorOut;

  var parsed = extractJson(ruling.content);
  if (!parsed || typeof parsed !== 'object') return floorOut;

  var pick = safeStr(parsed.exit).trim().toUpperCase();
  // THE WALL: the mind's pick must fall inside the cold region for this finding, or the cold pick stands.
  var wall;
  try { wall = space.validateExit(pick, confidence, importance); }
  catch (e) { wall = { ok: false }; }
  if (!wall || !wall.ok) return floorOut;

  var line = stripDashes(safeStr(parsed.world_line).trim());
  if (!line) line = stripDashes(safeStr(f.summary));

  return {
    ok: true,
    exit: pick,
    region: cold.region,
    // ⬡B:core.reach.wonder:GUARD:no_standing_list_no_call_worthy:20260815⬡
    // The cold half of the law the prompt states above. A model can still answer true, and with
    // no always-reach set on record there is no ground under that true: the categories it would
    // be matching against are the ones this file used to plant. Forced false, and the reason why
    // rides the decision. The channel stays the mind's own call, bounded by the region as always.
    call_worthy: alwaysReachAudit.ok === true && parsed.call_worthy === true,
    // ⬡B:core.reach.wonder:BUILD:the_live_screen_is_the_minds_call_too:20260726⬡
    // core/reach/screen.consumer.js used to decide this with a three-element array. It is
    // one more field of this one ruling now, so the screen has a decider instead of a list.
    live_screen: parsed.live_screen === true,
    world_line: line,
    reasoning: safeStr(parsed.reasoning).slice(0, 300) || 'Judged by A’NU’s reach ruling.',
    source: 'llm',
    cold_exit: cold.exit,
    always_reach: alwaysReachAudit,
    model: ruling.model, via: ruling.via
  };
}

module.exports = { judgeExit: judgeExit, alwaysReachCategories: alwaysReachCategories,
  NAME: NAME, TIER: TIER,
  _test: { buildSystemPrompt: buildSystemPrompt, coldDecision: coldDecision, extractJson: extractJson,
    alwaysReachCategories: alwaysReachCategories, readCategoryFromBead: readCategoryFromBead,
    ALWAYS_REACH_SOURCE_PREFIX: ALWAYS_REACH_SOURCE_PREFIX } };
