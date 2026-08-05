// ⬡B:core.action_claim_hold:BUILD:unreceipted_action_claim_detector:20260725⬡
// entered via the ABAHAM door, serving channel MESSAGES (the answer boundary of the one cycle)
// THE UNRECEIPTED ACTION CLAIM HOLD, the detector half. Law of record:
// docs/os/UNRECEIPTED_ACTION_CLAIM_HOLD_20260725.md. A final answer may state a
// past-tense action claim ("I checked, I sent, I moved, I confirmed") ONLY when
// the turn's own tool trace, its queued effects, or banked receipt evidence
// carries that action. Otherwise the answer is HELD with the named deterministic
// reason and the heal-and-resubmit path lets the mind rewrite it honestly.
//
// TRIPWIRES (founder trauma, honored, all four):
//   1. This module NEVER edits, deletes, or replaces a single character of
//      answer text. Its only outputs are a boolean hold, the named reason, and
//      bounded claim excerpts as evidence. There is no answer field in its
//      result and no code path that returns text for delivery.
//   2. The rewrite of a held claim happens ONLY as the existing council
//      heal-and-resubmit cycle (the mind composes the whole answer again);
//      nothing here composes anything.
//   3. This module can reach no human, no channel, no send of any kind. It
//      imports NOTHING (zero require calls) and performs no I/O; a require-scan
//      test enforces that forever.
//   4. A held answer whose resubmission still fails ends as an honest ok:false
//      with this named reason; the council test proves it.
//
// CONSERVATISM AT BIRTH (founder order): a miss is never an acquittal, but a
// false hold on honest speech is worse at birth. So: first-person, past-tense,
// concrete action claims only. Intentions ("I will send"), admissions ("I have
// not sent"), questions, quoted speech, and reported speech all pass. Anything
// ambiguous passes.
'use strict';

var REASON = 'action_claim_unreceipted';

// Founder off-switch: the hold is ON by default per the 20260725 order; only an
// explicit env value of 0/false/off disables it.
function enabled(env) {
  var raw = (env || (typeof process !== 'undefined' && process.env) || {}).ACTION_CLAIM_HOLD;
  var value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
}

// Each group is a family of first-person past-tense action verbs plus the
// pattern a supporting receipt name or evidence text must match. A completed
// READ claim ("I checked", "I pulled") requires typed successful-read evidence.
// Named calendar, inbox, and reminder objects require their exact read hand.
var CLAIM_GROUPS = [
  { support: /send|sent|email|mail|sms|text|notify|call|phone|message|reach|contact|outbound|forward|reply|blooio|nylas|twilio/i,
    verbs: ['sent', 'emailed', 'e-mailed', 'texted', 'messaged', 'phoned',
      'notified', 'forwarded', 'replied to', 'reached out to', 'called you',
      'called him', 'called her', 'called them', 'confirmed with', 'checked with',
      'spoke with', 'spoke to', 'talked with', 'talked to', 'followed up with'] },
  { support: /calendar|event|remind|schedul|book|appointment|meeting/i,
    verbs: ['booked', 'scheduled', 'rescheduled', 'moved the appointment',
      'moved your appointment', 'moved the meeting', 'moved your meeting',
      'cancelled the appointment', 'canceled the appointment',
      'cancelled the meeting', 'canceled the meeting'] },
  { supportKind: 'verified_read',
    // READ claims only hold when they name an external object ("the calendar",
    // "your inbox"). "I checked my brain for anything on ELI" is her describing
    // her own memory lookup, introspection inside the cycle, never an external
    // act; holding honest introspection would silence honest absence speech.
    objectGate: /^\s+(?:up\s+|into\s+|at\s+|over\s+|through\s+|on\s+)?(?:the|your|his|her|their|every|both|all|each)\b/i,
    verbs: ['checked', 'pulled', 'looked at', 'looked up', 'looked into',
      'reviewed', 'read through', 'searched', 'verified', 'audited', 'probed'] },
  { support: /deploy|push|merge|commit|git|build|patch|repo|branch|coda|render|release|rollback|revert|hold|fix|pr/i,
    verbs: ['pushed', 'deployed', 'merged', 'committed', 'patched', 'shipped',
      'rolled back', 'reverted', 'held the deploy', 'held the merge', 'held the release'] },
  { support: /write|updat|bank|board|ccwa|stamp|save|log|record|store|brain|bead|screen|layout|edit|creat|add|remind|calendar|event|purge|delete|remove|clear|archiv|exec|run|script|job/i,
    verbs: ['updated the board', 'updated your board', 'updated the screen',
      'updated your screen', 'updated the layout', 'banked', 'stamped', 'purged',
      'archived', 'executed the', 'ran the purge', 'ran the script', 'ran the job',
      'wrote to the brain', 'saved the layout', 'cleared the board'] },
  { supportKind: 'mission_submission',
    verbs: ['created a durable task', 'created the durable task',
      'created a task', 'created the task', 'created this task',
      'created a durable job', 'created the durable job',
      'created a job', 'created the job', 'created this job',
      'got the mission set', 'got this mission set',
      'set this as a real small mission', 'set this as a mission',
      'set that as a mission', 'set this in motion', 'set that in motion',
      'put this in motion', 'put that in motion', 'queued the mission',
      'queued the job'] },
  { supportKind: 'mission_running',
    verbs: ['started the mission', 'started the job',
      'assigned the mission', 'assigned the job',
      'commissioned the mission', 'commissioned the job'] },
  // A durable mission and a timed reminder are two different effects. A real
  // submit_job receipt supports the former; only the actual reminder-writing
  // hand supports the latter. Keeping these in separate groups prevents one
  // honest commission from laundering invented times into the final answer.
  { supportKind: 'reminder_create',
    verbs: ['created a reminder'] },
  { supportKind: 'reminder_recurrence',
    verbs: ['created a recurring reminder', 'created recurring reminders',
      'set up a recurring reminder', 'set up recurring reminders'] },
  { supportKind: 'mission_submission',
    verbs: ['logged the mission parameters', 'logged this mission',
      'logged that mission'] }
];

// Current-state and promised-delivery claims are stronger than submission or
// storage claims. They require their own typed proof and never inherit support
// from a tool name or free-form memory text.
var STATE_CLAIMS = [
  { supportKind:'verified_calendar_read', verb:'checked calendar',
    pattern:/\bI\s+took\s+the\s+liberty\s+of\s+checking\s+(?:(?:the|your|his|her|their)\s+)?calendar\b/gi },
  { supportKind:'verified_calendar_read', verb:'found calendar availability',
    pattern:/\bI\s+took\s+the\s+liberty\s+of\s+checking\s+(?:(?:the|your|his|her|their)\s+)?calendar\b[^.!?\n]{0,200}[.!?]\s*I\s+found\s+(?:a\s+few|some|several|one|two|three|four|five|six|[0-9]+)?\s*open\s+(?:time\s+)?slots\b/gi },
  { supportKind:'verified_calendar_read', verb:'found calendar availability',
    pattern:/\bI\s+found\s+(?:a\s+few|some|several|one|two|three|four|five|six|[0-9]+)?\s*open\s+(?:time\s+)?slots\b[^.!?\n]{0,120}\b(?:on|in)\s+(?:(?:the|your|his|her|their)\s+)?calendar\b/gi },
  { supportKind:'mission_submission', verb:'creating a job',
    pattern:/\bI(?:\s+am|[’']m)\s+(?:creating|setting\s+up|saving|persisting|queuing)\s+(?:(?:the|this|that|your)\s+)?(?:real\s+|small\s+)*(?:job|task|mission)\b/gi },
  { supportKind:'reminder_create', verb:'created the reminder',
    pattern:/(?:^|\n)\s*(?:[-*•]\s*)?Created\s+(?:(?:the|this|that|your)\s+)?reminder\b/gim },
  { supportKind:'reminder_create', verb:'reminder stored in command center',
    pattern:/\b(?:it|the\s+reminder|this\s+reminder|that\s+reminder|your\s+reminder)\s+will\s+live\s+in\s+your\s+Command\s+Center\s+as\s+a\s+reminder\b/gi },
  { supportKind:'reminder_delivery', verb:'set reminder to surface',
    pattern:/\bI(?:\s+have|[’']ve)\s+set\s+(?:it|the\s+reminder|this\s+reminder|your\s+reminder)\s+to\s+(?:surface|appear|return|reach|notify|alert|nudge)\b/gi },
  { supportKind:'reminder_delivery', verb:'set reminder to appear',
    pattern:/(?:^|\n)\s*(?:[-*•]\s*)?Set\s+(?:it|the\s+reminder|this\s+reminder|your\s+reminder)\s+to\s+(?:surface|appear|return|reach|notify|alert|nudge)\b/gim },
  { supportKind:'mission_running', verb:'mission running',
    pattern:/\b(?:the mission|the job|this mission|that mission)\s+is\s+(?:already\s+)?(?:running|live|active)\b/gi },
  { supportKind:'mission_running', verb:'mission running',
    pattern:/\b(?:got (?:the|this) mission set|set (?:this|that) as a mission|queued (?:the|this|that) mission)[^.!?\n]{0,100}\b(?:and\s+)?it(?:\s+is|[’']s)\s+(?:already\s+)?(?:running|live|active)\b/gi },
  { supportKind:'reminder_delivery', verb:'reminder will trigger',
    pattern:/\b(?:the|this|that)\s+reminder\s+will\s+(?:trigger|fire|notify|alert|reach|nudge)\b/gi },
  { supportKind:'reminder_delivery', verb:'job will return',
    pattern:/\b(?:the|this|that|your)\s+(?:job|task|mission)\s+will\s+(?:return|come\s+back|check\s+in|reach|remind|nudge|notify|alert|follow\s+up)\b/gi }
];

// Fillers legally allowed between the first-person subject and the claim verb.
// A modal ("will", "would", "can"), a negation ("not", "never", "n't"), or any
// other word breaks the match, so intentions and admissions never hold.
var FILLERS = '(?:\\s+(?:have|had|just|already|also|then|now|personally|actually|finally|since|went\\s+ahead\\s+and))*';

// Reported or hypothetical speech immediately before the "I" passes: it is a
// quote of others or a supposition, never her own claim of a done act.
var PRECEDING_EXEMPT = /\b(?:if|whether|unless|suppose|supposing|imagine|imagining|wish|hoping|hope|said|says|saying|asked|asks|told|tells|claims?|claimed|wrote|writes|denied|denies)\s*(?:that\s+)?$/i;

function escapeVerb(verb) {
  return verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

var GROUP_MATCHERS = CLAIM_GROUPS.map(function (group) {
  var alternation = group.verbs.slice().sort(function (a, b) {
    return b.length - a.length;
  }).map(escapeVerb).join('|');
  return {
    support: group.support,
    supportKind: group.supportKind || null,
    objectGate: group.objectGate || null,
    pattern: new RegExp('\\bI(?:[\u2019\u0027](?:ve|d))?' + FILLERS +
      '\\s+(' + alternation + ')\\b', 'g'),
    // Compound predicates keep their first-person subject: "I checked the
    // calendars and confirmed the backup" claims both acts. This continuation
    // only ever runs inside a sentence that BEGINS with "I", so another
    // speaker's verb ("He booked it and ...") can never be blamed on her.
    // A negation between the conjunction and the verb breaks adjacency, so
    // "and never texted" still passes.
    continuation: new RegExp('\\b(?:and|then)(?:\\s+(?:just|already|also|then|now|finally))*' +
      '\\s+(' + alternation + ')\\b', 'g')
  };
});

// Quoted spans, fenced code, and inline code are never her own live claims.
function stripNonClaimText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\r\n]*`/g, ' ')
    .replace(/"[^"\r\n]{0,400}"/g, ' ')
    .replace(/\u201c[^\u201d\r\n]{0,400}\u201d/g, ' ');
}

function collectNames(trace) {
  var names = [];
  (Array.isArray(trace.tools_used) ? trace.tools_used : []).forEach(function (tool) {
    if (tool) names.push(String(tool));
  });
  (Array.isArray(trace.pending_effects) ? trace.pending_effects : []).forEach(function (effect) {
    if (effect && effect.name) names.push(String(effect.name));
  });
  (Array.isArray(trace.verified_evidence) ? trace.verified_evidence : []).forEach(function (item) {
    if (item && item.tool) names.push(String(item.tool));
  });
  return names;
}

function collectEvidenceText(trace) {
  var pieces = [];
  (Array.isArray(trace.verified_evidence) ? trace.verified_evidence : []).forEach(function (item) {
    if (!item) return;
    ['evidence_preview', 'summary', 'content', 'result'].forEach(function (field) {
      if (typeof item[field] === 'string') pieces.push(item[field].slice(0, 2000));
    });
  });
  if (typeof trace.banked_receipts_text === 'string') {
    pieces.push(trace.banked_receipts_text.slice(0, 8000));
  }
  return pieces.join('\n');
}

function validMissionArgs(args) {
  var level = args && args.level === undefined ? 0 : Number(args && args.level);
  return !!(args && typeof args === 'object' && String(args.subject || '').trim() &&
    String(args.detail || '').trim() && Array.isArray(args.acceptance) &&
    args.acceptance.length >= 1 && args.acceptance.length <= 12 &&
    args.acceptance.every(function (check) { return !!String(check || '').trim(); }) &&
    Number.isInteger(level) && level >= 0 && level <= 4);
}

function validReminderArgs(args) {
  return !!(args && typeof args === 'object' && String(args.text || '').trim());
}

var READ_DOMAINS = [
  { object:/\b(?:calendar|calendars|schedule|event|events|appointment|appointments)\b/i,
    tools:{calendar_read:true} },
  { object:/\b(?:inbox|email|emails|mailbox|mail)\b/i, tools:{inbox_read:true} },
  { object:/\b(?:reminder|reminders)\b/i, tools:{read_reminders:true} }
];

function verifiedReadSupported(claimText, trace) {
  var evidence = (Array.isArray(trace.verified_evidence) ? trace.verified_evidence : [])
    .filter(function (item) {
      return !!(item && item.successful_read === true &&
        item.evidence_kind === 'verified_read_result' && String(item.tool || '').trim());
    });
  if (!evidence.length) return false;
  var domain = null;
  for (var i = 0; i < READ_DOMAINS.length; i++) {
    if (READ_DOMAINS[i].object.test(String(claimText || ''))) {
      domain = READ_DOMAINS[i];
      break;
    }
  }
  if (!domain) return true;
  return evidence.some(function (item) { return domain.tools[item.tool] === true; });
}

function hasPendingEffect(trace, name, validate) {
  return (Array.isArray(trace.pending_effects) ? trace.pending_effects : []).some(function (effect) {
    return !!(effect && effect.name === name && validate(effect.args));
  });
}

function strictClaimSupported(kind, trace) {
  if (kind === 'mission_submission') {
    return hasPendingEffect(trace, 'submit_job', validMissionArgs);
  }
  if (kind === 'reminder_create') {
    return hasPendingEffect(trace, 'create_reminder', validReminderArgs);
  }
  if (kind === 'reminder_recurrence') {
    return hasPendingEffect(trace, 'create_recurring_reminder', validReminderArgs);
  }
  // The current armory has no typed receipt that proves a submitted job is
  // already running, or that a stored reminder will actually reach the person.
  return false;
}

function verifiedNamedReadSupported(tool, trace) {
  return (Array.isArray(trace.verified_evidence) ? trace.verified_evidence : [])
    .some(function (item) {
      return !!(item && item.tool === tool && item.successful_read === true &&
        item.evidence_kind === 'verified_read_result');
    });
}

function claimSupported(support, supportKind, trace, names, evidenceText, claimText) {
  if (supportKind === 'verified_read') return verifiedReadSupported(claimText, trace);
  if (supportKind === 'verified_calendar_read') {
    return verifiedNamedReadSupported('calendar_read', trace);
  }
  if (supportKind) return strictClaimSupported(supportKind, trace);
  if (!support) return names.length > 0;
  for (var i = 0; i < names.length; i++) {
    if (support.test(names[i])) return true;
  }
  return evidenceText ? support.test(evidenceText) : false;
}

// detect(answerText, trace) -> { hold, reason, claims }
//   answerText: the final answer bytes, read only, never returned, never edited.
//   trace: { tools_used, pending_effects, verified_evidence, banked_receipts_text }
// Holds ONLY when a first-person past-tense concrete action claim exists with
// zero supporting trace. Everything ambiguous passes.
function detect(answerText, trace) {
  trace = trace || {};
  var pass = { hold: false, reason: null, claims: [] };
  var text = stripNonClaimText(answerText);
  if (!text.trim()) return pass;
  var names = collectNames(trace);
  var evidenceText = collectEvidenceText(trace);
  var claims = [];
  var sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (var s = 0; s < sentences.length; s++) {
    var sentence = sentences[s];
    if (!sentence || /\?\s*$/.test(sentence)) continue; // a question claims nothing
    var firstPersonSentence = /^\s*I\b/.test(sentence);
    for (var g = 0; g < GROUP_MATCHERS.length; g++) {
      var matcher = GROUP_MATCHERS[g];
      var patterns = firstPersonSentence
        ? [matcher.pattern, matcher.continuation] : [matcher.pattern];
      for (var p = 0; p < patterns.length; p++) {
        var pattern = patterns[p];
        pattern.lastIndex = 0;
        var match;
        while ((match = pattern.exec(sentence)) !== null) {
          if (PRECEDING_EXEMPT.test(sentence.slice(0, match.index))) continue;
          if (matcher.objectGate &&
              !matcher.objectGate.test(sentence.slice(match.index + match[0].length))) continue;
          if (claimSupported(matcher.support, matcher.supportKind, trace, names, evidenceText,
              sentence.slice(match.index))) continue;
          if (claims.length < 8) {
            claims.push({
              claim: sentence.trim().slice(0, 200),
              verb: String(match[1] || '').toLowerCase().replace(/\s+/g, ' ')
            });
          }
        }
      }
    }
  }
  for (var stateIndex = 0; stateIndex < STATE_CLAIMS.length; stateIndex++) {
    var stateClaim = STATE_CLAIMS[stateIndex];
    stateClaim.pattern.lastIndex = 0;
    var stateMatch;
    while ((stateMatch = stateClaim.pattern.exec(text)) !== null) {
      if (claimSupported(null,stateClaim.supportKind,trace,names,evidenceText,
          stateMatch[0])) continue;
      if (claims.length < 8) {
        claims.push({
          claim:String(stateMatch[0] || '').trim().slice(0, 200),
          verb:stateClaim.verb
        });
      }
    }
  }
  if (!claims.length) return pass;
  return { hold: true, reason: REASON, claims: claims };
}

module.exports = { REASON: REASON, enabled: enabled, detect: detect };
