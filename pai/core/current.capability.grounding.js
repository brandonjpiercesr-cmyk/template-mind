'use strict';

// ⬡B:core.current_capability_grounding:PEN:a_list_of_approved_sentences_is_not_a_judge:20260825⬡
// WHAT STOOD HERE, and why it could not survive. This module held `exactSentences()`, a table
// built from the live rows that produced at most FIVE literal English strings: "World Builder
// is live", "Always On is running", "Always On is enabled", "Mission Board is connected", and
// "Come Code can <the workspace's own action description>". Every sentence of her answer was
// keyed against that table. A sentence that matched counted as supported; every other sentence
// she wrote, in her own voice, in her own order, with a comma somewhere else, became
// `unsupported_capability_clause`, and an answer with no exact match also collected
// `supported_capability_clause_missing`. `categoricalClaim()` returns true for anything that is
// not literally "I don't know", so the table armed on essentially every answer. She got one
// heal, the heal was judged by the same table, and core/tool.loop.js then ended the turn
// `cycle_end_silent` and the person received no answer at all. "What can you do right now" is
// one of the most ordinary things anyone will ever ask her, and that path was built so that the
// honest answer could not pass.
//
// A FIXED LIST OF APPROVED SENTENCES IS COLD CODE DECIDING WHAT SHE MAY SAY ABOUT HERSELF.
// It is not replaced here by a longer list, a similarity score, or a threshold, because all
// three are the same thing wearing different clothes. What is legitimate, and what this module
// still does, is ESTABLISH WHAT IS TRUE: verify the signed capability receipt cryptographically,
// prove it is bound to this exact question and this exact cycle, and hand the rows out as facts.
// The mind reads those facts and judges what to say. Cold code establishes; it does not approve.
//
// WHAT SURVIVES, and each one is a DETECTOR that names a fact, never a verdict that ends a turn:
//   current_capability_evidence_missing   the signed read did not verify for these coordinates,
//                                         so nothing here can speak to what is or is not live
//   stale_single_file_claim               the draft says "single file" while a live row carries
//                                         a change-set action, a measurable contradiction
//   unsupported_exhaustive_claim          the draft says "these are the only", and these rows
//                                         are a bounded read, never an inventory of everything
//   internal_capability_surface_exposed   the draft names an internal station out loud
// core/tool.loop.js hands these back to the mind once, as named concerns, and then SHIPS HER
// ANSWER either way with the concerns riding on the receipt. A held concern is a hint on a
// receipt. It was never a reason to say nothing.

var paiToolEvidence = require('./pai.tool.evidence.js');

function currentCapabilityQuestion(message) {
  var text = String(message || '').trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
  if (!text) return false;
  if (/\b(?:coding lanes?|lane board|which chats?|what chats?|next to fix|left to fix|who(?:'s| is) working|who(?:'s| is) building)\b/.test(text)) return false;
  if (/\b(?:capabilit(?:y|ies)|what can you do|what are you able to do|which (?:build |coding )?surfaces?)\b/.test(text)) return true;
  if (/\b(?:what|which)\b[^?.!]{0,60}\b(?:built|live|working|available|wired)\b/.test(text)) return true;
  if (/\b(?:do you have|have you got)\b.{0,70}\b(?:access|ability|support|workspace|tool|hand|surface)\b/.test(text)) return true;
  if (/\bcan you\b.{0,45}\b(?:send|receive|email|text|call|research|browse|code|deploy|build|test|read|write|open a pull request|work across files)\b/.test(text) &&
      /\b(?:currently|actually|right now|ability|capability)\b/.test(text)) return true;
  return /\b(?:can|are) you\b.{0,50}\b(?:currently|actually|right now)\b/.test(text);
}

function categoricalClaim(answer) {
  var text=String(answer || '').trim();
  if (!text) return false;
  var uncertaintyOnly=/^(?:(?:i\s+)?(?:do not know|don't know|am not sure)(?:\s+(?:yet|right now))?|not sure(?:\s+(?:yet|right now))?|(?:i\s+)?(?:could not verify|can't verify|cannot verify|cannot confirm)(?:\s+(?:what is live|which parts are live|whether (?:it|this|that) is live|if (?:it|this|that) is live|that(?: right now)?|right now))?|(?:it is\s+)?unclear|not confirmed)[.!?]?$/i;
  return !uncertaintyOnly.test(text);
}

// The one thing cold code is entitled to do here: prove the receipt. The tool result must be an
// authentic signed read for this exact ham, request, cycle and question, and the row count it
// declares must equal the live rows it actually carries. `rows` stays the LIVE rows, which is
// what the detectors below measure against. `allRows` carries EVERY row the verified receipt
// held, live and unverified alike, because a row that could not be verified this turn is a fact
// about the deployment too and she cannot say "that one is not confirmed right now" if nobody
// ever tells her it exists.
function verifiedRows(evidence, expected) {
  var matched = [];
  (Array.isArray(evidence) ? evidence : []).forEach(function (item) {
    if (!item || item.tool !== 'read_current_capabilities' ||
        !paiToolEvidence.verify(item, expected || {}, {requireRead:true})) return;
    var parsed;
    try { parsed = JSON.parse(item.result); } catch (error) { return; }
    if (!parsed || parsed.schema !== 'anew.current-capabilities.v2' || parsed.ok !== true ||
        !Array.isArray(parsed.capabilities) ||
        parsed.question_digest !== paiToolEvidence.digest(String(expected && expected.question || ''))) return;
    var live = parsed.capabilities.filter(function (row) {
      return row && row.state === 'live' && typeof row.capability_id === 'string' &&
        Array.isArray(row.source_refs) && row.source_refs.length > 0;
    });
    if (live.length !== parsed.evidence_count) return;
    matched.push({ item:item, rows:live, allRows:parsed.capabilities.filter(function (row) {
      return row && typeof row.capability_id === 'string';
    }) });
  });
  return matched;
}

function rowHasWorkspaceAction(row, name) {
  return !!(row&&row.facts&&Array.isArray(row.facts.actions)&&
    row.facts.actions.some(function (action) {
      return Array.isArray(action)&&action[0]===name&&typeof action[1]==='string'&&!!action[1];
    }));
}

// Named concerns, not verdicts. Every branch below measures the DRAFT against something
// mechanically checkable and gives the finding a name a person can read. None of them decides
// whether she may speak, and none of them reads a sentence for meaning.
function findings(question, answer, evidence, expected) {
  if (!currentCapabilityQuestion(question) || !categoricalClaim(answer)) return [];
  var verified = verifiedRows(evidence,expected);
  var rows = verified.length === 1 ? verified[0].rows : [];
  if (!rows.length) return ['current_capability_evidence_missing'];
  var text = String(answer || '');
  var result = [];
  // A measurable contradiction: the draft describes the old single-file limitation while a
  // live row carries the change-set action that superseded it.
  if (/\bsingle[ -]?file\b/i.test(text) && rows.some(function (row) {
    return row.capability_id === 'come_code.coder' && rowHasWorkspaceAction(row,'open_change_set_pr');
  })) result.push('stale_single_file_claim');
  // These rows are a bounded read of named surfaces, never an inventory of everything she can
  // do, so a sentence that closes the list is claiming something the evidence cannot carry.
  if (/\b(?:these are|that is|those are) the only\b|\bonly (?:things|capabilities)\b/i.test(text)) result.push('unsupported_exhaustive_claim');
  // The two voices law: the person on the other end gets the life assistant, never the names of
  // internal stations. Detected and handed back, never rewritten by cold code.
  if (/\b(?:meta[ _-]?commentary|writ|council|tool calls?|internal (?:reasoning|stages?|instructions?))\b/i.test(text)) result.push('internal_capability_surface_exposed');
  return Array.from(new Set(result));
}

// `held` means only this: there is a named concern to hand back to the mind once. It is not a
// refusal, it never ends a turn, and every caller of this function in core/tool.loop.js carries
// the answer forward with the concern on its receipt.
function guard(question, answer, evidence, expected) {
  var result=findings(question,answer,evidence,expected);
  return result.length ? {held:true,answer:answer,reason:result.join(','),findings:result} :
    {held:false,answer:answer,reason:null,findings:[]};
}

function accepted(question, answer, evidence, expected) {
  var verified=verifiedRows(evidence,expected);
  var guarded=guard(question,answer,evidence,expected);
  return {ok:currentCapabilityQuestion(question)&&categoricalClaim(answer)&&
    verified.length===1&&!guarded.held,guard:guarded,
    evidence_item:verified.length===1?verified[0].item:null,
    rows:verified.length===1?verified[0].rows:[],
    all_rows:verified.length===1?verified[0].allRows:[]};
}

module.exports={currentCapabilityQuestion:currentCapabilityQuestion,
  categoricalClaim:categoricalClaim,verifiedRows:verifiedRows,findings:findings,
  guard:guard,accepted:accepted,rowHasWorkspaceAction:rowHasWorkspaceAction};
