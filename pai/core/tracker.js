// core/tracker.js
// ⬡B:core.tracker:MODULE:universal_request_tracker:20260713⬡
//
// THE UNIVERSAL TRACKER  (Architect's #1 flag, 2026-07-13)
// -------------------------------------------------------------------------
// The Architect's exact concern: "when self comes in there's no tracker, and when she
// does self there's no tracker, and that self gets completed, and as she marks things
// complete, and even as she codes, there's no universal tracker. It's hard to find
// things. That's where ACL was supposed to come in... everything in, everything out,
// everything in between, everything has a stamp, a history, a lineage, a record. And I
// don't think that that's actually happening."
//
// WHAT WAS ACTUALLY FOUND ON THE LIVE BRAIN (so this fixes the real hole, not a guess):
//   - Stamps DO exist in abundance: TASK (92/day), TASK_DONE, RESULT, RESPEC, CYCLE_STEP,
//     plus a full self-repair change-request lifecycle (DIAGNOSED -> GRADED -> DECIDED ->
//     DEPLOYED -> HEALTHY). So the system is NOT unstamped, and self-repair IS trailed.
//   - BUT two real holes remain:
//       (1) Inbound USER requests the cycle cannot fulfill leave NO trace. A two-part
//           text (recurring timeshare reminder + scan calendars / consult advisors /
//           book a haircut) hit cycle_end_silent and evaporated: no reply, no reminder,
//           and zero record that anything was ever owed.
//       (2) There is no single queryable STATUS. Stamps are scattered across ~45 types
//           and hundreds of source prefixes, so "show me everything still open" is
//           impossible. ACL is a stamp FORMAT, not a lifecycle you can query.
//
// WHAT THIS MODULE DOES:
//   One bead type -- TRACK -- with a real status lifecycle, so a single query answers
//   "where does every request stand?":
//       GET ?stamp_type=eq.TRACK                       -> everything tracked
//       GET ?stamp_type=eq.TRACK&summary=ilike.*OPEN*  -> everything still owed
//       GET ?stamp_type=eq.TRACK&summary=ilike.*BLOCKED*
//   Statuses: RECEIVED | IN_PROGRESS | DONE | OPEN | BLOCKED
//   Kinds:    request | self | build | reminder | outreach   (extensible)
//
// UNIVERSALITY: hamUid-driven, no hardcoded identity, no hardcoded roster. Safe no-op
// if the brain is unreachable -- tracking must never crash a real turn.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema(){ return process.env.BRAIN_SCHEMA || 'abacia_core'; }
function _ymd(){ return new Date().toISOString().slice(0,10).replace(/-/g,''); }

// Cold, no-LLM detector: did this message ASK for something to be done? Used so the
// tracker stays high-signal (a plain "hey" or "thanks" is not a tracked request) and so
// a dropped ACTION request never evaporates silently. Verbs cover the real spread the
// Architect actually uses: remind, book, schedule, set, add, find, look into, figure
// out, get, call, send, draft, create, cancel, move, reschedule, look inside, talk to.
function looksLikeActionRequest(message){
  var m = String(message || '').toLowerCase();
  if (!m.trim()) return false;
  return /\b(remind|reminder|book|schedule|reschedule|set (a|an|up)|add (it|this|to)|put (it|this|on)|find (me|a|time)|look (into|inside)|figure out|get (me|my|a)|call (me|him|her|them)|send|draft|create|cancel|move (it|this|my)|talk to|reach out|set up|line up|pull up|check my)\b/.test(m)
      || /\bcan you (book|schedule|add|find|set|get|call|send|draft|create|cancel|move|look|figure|talk|pull|check|remind)\b/.test(m);
}

// Stamp one TRACK bead. Returns {ok:true} or {ok:false,reason} -- never throws.
async function stampTrack(opts){
  opts = opts || {};
  var BU = _bu(), BK = _bk();
  if (!BU || !BK) return { ok:false, reason:'no_brain' };
  var hamUid = String(opts.hamUid || '').toUpperCase();
  if (!hamUid) return { ok:false, reason:'no_ham' };
  var status = String(opts.status || 'RECEIVED').toUpperCase();
  var kind   = opts.kind || 'request';
  var request = String(opts.request || '').slice(0, 400);
  // importance rides status: open/blocked things need to surface; done things are record-only
  var importance = (status === 'BLOCKED' || status === 'OPEN') ? 6
                 : (status === 'RECEIVED' || status === 'IN_PROGRESS') ? 4 : 3;
  var ts = Date.now();
  var bead = {
    ham_uid: hamUid,
    agent_global: opts.agent || 'PAI',
    stamp_type: 'TRACK',
    // status is in the acl_stamp AND the summary so both a stamp-scan and a text search find it
    acl_stamp: '\u2b21B:core.tracker:TRACK:' + status + ':' + _ymd() + '\u2b21',
    source: 'tracker.' + hamUid + '.' + status.toLowerCase() + '.' + ts,
    summary: '[TRACK ' + status + '] ' + kind + ': ' + request.slice(0, 80),
    content: JSON.stringify({
      status: status,
      kind: kind,
      request: request,
      owed: opts.owed || [],                     // what is still not done (for partials)
      reason: opts.reason || null,               // why blocked / why open
      missing_capability: opts.missing_capability || null,
      outcome: opts.outcome ? String(opts.outcome).slice(0, 300) : null,
      tools_used: (opts.tools_used || []).map(function(t){ return (t && (t.name||t.tool)) || t; }),
      cycleId: opts.cycleId || null,
      channel: opts.channel || null,
      spawned_by: opts.spawned_by || null,       // lineage: the parent track/request
      ts: new Date(ts).toISOString()
    }),
    importance: importance
  };
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': _schema(),
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(bead)
    });
    return { ok: r.ok, status: status, http: r.status };
  } catch (e) {
    return { ok:false, reason: e.message };
  }
}

module.exports = { stampTrack, looksLikeActionRequest };
