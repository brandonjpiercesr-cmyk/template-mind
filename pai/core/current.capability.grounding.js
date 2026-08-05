'use strict';

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
    matched.push({ item:item, rows:live });
  });
  return matched;
}

function subjectGroups(value) {
  var text=String(value || '').toLowerCase();
  var groups=[];
  if (/\bcome code\b/.test(text)) groups.push(['come_code.read','come_code.coder']);
  if (/\bworld builder\b/.test(text)) groups.push(['world_builder.seat']);
  if (/\balways on\b/.test(text)) groups.push(['world_builder.always_on']);
  if (/\bmission board\b/.test(text)) groups.push(['world_builder.mission_board']);
  if (/\bmeta[ _-]?commentary\b/.test(text)) groups.push(['outbound.meta_commentary']);
  if (/\bwrit\b/.test(text)) groups.push(['outbound.writ']);
  return groups;
}

function rowHasWorkspaceAction(row, name) {
  return !!(row&&row.facts&&Array.isArray(row.facts.actions)&&
    row.facts.actions.some(function (action) {
      return Array.isArray(action)&&action[0]===name&&typeof action[1]==='string'&&!!action[1];
    }));
}

function sentenceKey(value) {
  return String(value || '').trim().replace(/\s+/g,' ').replace(/[.!?]+$/,'').trim()
    .toLowerCase();
}

function exactSentences(rows) {
  var allowed={};
  (Array.isArray(rows)?rows:[]).forEach(function (row) {
    if (!row || !row.facts) return;
    if (/^come_code\./.test(String(row.capability_id || ''))) {
      var actions=Array.isArray(row.facts.actions)?row.facts.actions:[];
      actions.forEach(function (action) {
        var description=Array.isArray(action)?String(action[1] || '').trim():'';
        if (!description) return;
        var humanDescription=description.charAt(0).toLowerCase()+description.slice(1);
        allowed[sentenceKey('Come Code can '+humanDescription)]=true;
      });
    }
    if (row.capability_id==='world_builder.seat'&&row.facts.active===true) {
      allowed[sentenceKey('World Builder is live')]=true;
    }
    if (row.capability_id==='world_builder.always_on') {
      if (row.facts.running===true) allowed[sentenceKey('Always On is running')]=true;
      if (row.facts.enabled===true) allowed[sentenceKey('Always On is enabled')]=true;
    }
    if (row.capability_id==='world_builder.mission_board'&&row.facts.connected===true) {
      allowed[sentenceKey('Mission Board is connected')]=true;
    }
  });
  return allowed;
}

function findings(question, answer, evidence, expected) {
  if (!currentCapabilityQuestion(question) || !categoricalClaim(answer)) return [];
  var verified = verifiedRows(evidence,expected);
  var rows = verified.length === 1 ? verified[0].rows : [];
  if (!rows.length) return ['current_capability_evidence_missing'];
  var text = String(answer || '');
  var result = [];
  if (/\bsingle[ -]?file\b/i.test(text) && rows.some(function (row) {
    return row.capability_id === 'come_code.coder' && rowHasWorkspaceAction(row,'open_change_set_pr');
  })) result.push('stale_single_file_claim');
  if (/\b(?:these are|that is|those are) the only\b|\bonly (?:things|capabilities)\b/i.test(text)) result.push('unsupported_exhaustive_claim');
  if (/\b(?:meta[ _-]?commentary|writ|council|tool calls?|internal (?:reasoning|stages?|instructions?))\b/i.test(text)) result.push('internal_capability_surface_exposed');
  var supported=0;
  var exact=exactSentences(rows);
  var unmatched=[];
  (text.match(/[^.!?\n]+(?:[.!?]+|$)/g)||[]).forEach(function (sentence) {
    var key=sentenceKey(sentence);
    if (exact[key]) supported++;
    else if (key) unmatched.push(sentence);
  });
  unmatched.forEach(function (sentence) {
    result.push(subjectGroups(sentence).length ? 'unsupported_capability_clause' :
      (/^\s*(?:it|you|we|they|this|that|the system)\b/i.test(sentence)
        ? 'ambiguous_capability_subject' : 'unsupported_capability_clause'));
  });
  if (!supported) result.push('supported_capability_clause_missing');
  return Array.from(new Set(result));
}

function guard(question, answer, evidence, expected) {
  var result=findings(question,answer,evidence,expected);
  return result.length ? {held:true,answer:answer,reason:result.join(',')} :
    {held:false,answer:answer,reason:null};
}

function accepted(question, answer, evidence, expected) {
  var verified=verifiedRows(evidence,expected);
  var guarded=guard(question,answer,evidence,expected);
  return {ok:currentCapabilityQuestion(question)&&categoricalClaim(answer)&&
    verified.length===1&&!guarded.held,guard:guarded,
    evidence_item:verified.length===1?verified[0].item:null,
    rows:verified.length===1?verified[0].rows:[]};
}

module.exports={currentCapabilityQuestion:currentCapabilityQuestion,
  categoricalClaim:categoricalClaim,verifiedRows:verifiedRows,findings:findings,
  guard:guard,accepted:accepted,sentenceKey:sentenceKey,exactSentences:exactSentences,
  subjectGroups:subjectGroups,rowHasWorkspaceAction:rowHasWorkspaceAction};
