// core/session.wonder.js
// ⬡B:core.session:WONDER:autonomous_working_session:20260713⬡
//
// THE SESSION WONDER  (the founder's imagination, made real, 2026-07-13)
// -------------------------------------------------------------------------
// DOCTRINE (entry + convergence): this rides the one PAI cycle, whose entry is always
// A'NEW through the ABAHAM door. It is a true Wonder by the One Test: it converges the
// COUNCIL (real advisor proposals), SCHEDULE (calendar read + book), the reach channel
// (it brings the session to the HAM), and the brain (it records the agenda and the tasks).
// When one is called, all is called.
//
// The founder's words, on reading a canned reminder and wishing it were real: "I thought
// my autonomous adviser decided to put a meeting on my calendar. Found some time, has an
// agenda, has work for me to do, has work for her to report on, real work, and scheduled
// some time with me... we're not that far from that being able to happen without being a
// gimmick."
//
// NON-GIMMICK IS THE WHOLE POINT. The agenda is NOT invented. It is assembled cold from
// what the advisers and the tracker ALREADY raised as needing him: PROPOSED_ACTION beads
// (an adviser proposing a meeting, a decision, or an assignment for the founder) and TRACK
// OPEN beads (things owed). If there is not enough genuine material, it convenes NOTHING.
// The slot is a real open slot from his calendar. The booking is a real Nylas event.
//
// THE AUTONOMOUS FIRE (Life Flex): per the BIND doctrine she may fire herself. Booking on
// HIS OWN calendar and reaching HIM (not a third party) is within that. But a surprise
// event on his calendar is a real write, so the live auto-book is gated behind
// SESSION_AUTOBOOK (default off): until he flips it, she PROPOSES the real session with a
// real slot and real agenda and asks to lock it. The far part (full autonomy) is one flag
// away; the near part (real agenda, real slot, real proposal) is live now.

var crypto = require('node:crypto');
var _sched = require('./schedule/schedule.logic.js');
var _runPAI = require('./tool.loop.js').runPAI;
var _council = require('./pai.outbound.council.js');
var _claimLock = require('./claim_lock.js');

function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl() { return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema() { return process.env.BRAIN_SCHEMA || 'abacia_core'; }
function _rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function _wh() { var h = _rh(); h['Content-Profile'] = 'abacia_core'; h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }

async function _cancellationRequested(options) {
  options = options || {};
  if (options.abortSignal && options.abortSignal.aborted) return true;
  if (typeof options.isCancelled !== 'function') return false;
  try { return await options.isCancelled() === true; } catch (e) { return true; }
}

function _cancelledSession(stage, extra) {
  return Object.assign({ ok:false, convened:false, reason:'voice_turn_cancelled',
    cancel_stage:stage }, extra || {});
}

function _requestId(value) {
  var candidate = typeof value === 'string' ? value.trim() : '';
  return candidate && /^[A-Za-z0-9._:-]{8,160}$/.test(candidate)
    ? candidate : crypto.randomUUID();
}

function _parseCalendarArtifact(value) {
  var text = typeof value === 'string' ? value : '';
  var artifact;
  try { artifact = JSON.parse(text); } catch (eParse) { return null; }
  if (!artifact || Array.isArray(artifact) ||
      Object.keys(artifact).sort().join(',') !== 'description,end,start,title' ||
      typeof artifact.title !== 'string' || !artifact.title.trim() ||
      artifact.title.indexOf('\n') !== -1 || artifact.title.length > 120 ||
      typeof artifact.description !== 'string' || artifact.description.length > 500 ||
      typeof artifact.start !== 'string' || typeof artifact.end !== 'string') return null;
  return { title:artifact.title, description:artifact.description,
    start:artifact.start, end:artifact.end, artifact:text };
}

// ⬡B:core.session:GUARD:committed_pai_outbound_text:20260715⬡
// Agenda judgment remains internal context. Every calendar description or
// A'NU message is the exact answer committed by the canonical PAI council.
async function _committedSessionText(input) {
  if (await _cancellationRequested(input)) {
    return { ok:false, reason:'voice_turn_cancelled', requestId:_requestId(input.requestId) };
  }
  var requestId = _requestId(input.requestId);
  var identity = {
    uid: input.hamUid,
    request_id: requestId,
    user_message: input.question,
    delivery: input.delivery || {},
    council_context: Object.assign({ mode: input.mode || 'session_wonder' }, input.context || {})
  };
  if (input.abortSignal || typeof input.isCancelled === 'function') {
    Object.defineProperty(identity, '_voiceCancellation', {
      value:{ signal:input.abortSignal, isCancelled:input.isCancelled },
      enumerable:false, writable:false
    });
  }
  var pai = await _runPAI(input.hamUid, input.deliberationInput,
    input.channel || 'portal', identity, [], null);
  if (await _cancellationRequested(input)) {
    return { ok:false, reason:'voice_turn_cancelled', requestId:requestId,
      cycleId:pai && (pai.cycleId || pai.cycle_id) || null };
  }
  var cycleId = pai && (pai.cycleId || pai.cycle_id);
  var actualRequestId = pai && (pai.requestId || pai.request_id) || requestId;
  if (!cycleId || actualRequestId !== requestId) {
    return { ok: false, reason: 'council_binding_missing', requestId: requestId,
      cycleId: cycleId || null };
  }
  var expected = {
    hamUid: input.hamUid,
    requestId: actualRequestId,
    cycleId: cycleId,
    question: input.question,
    deliberationInput: input.deliberationInput,
    answer: pai && pai.answer
  };
  if (input.context && input.context.delivery_target) {
    expected.deliveryTarget = input.context.delivery_target;
  }
  var checked = _council.requireVerifiedCouncilResult(pai, expected);
  var proof = checked && checked.ok ? _council.compactCouncilProof(pai) : null;
  if (!checked || checked.ok !== true || !proof || proof.committed !== true ||
      proof.readback_verified !== true || proof.row_count !== 9) {
    return { ok: false, reason: pai && pai.reason || checked && checked.reason
      || 'pai_council_receipt_missing_or_invalid', requestId: actualRequestId,
      cycleId: cycleId || null };
  }
  return { ok: true, answer: checked.answer, requestId: actualRequestId,
    cycleId: cycleId, councilProof: proof, pai: pai,
    binding: Object.assign({}, expected, { answer:checked.answer }) };
}

function _attachCouncil(result, committed) {
  Object.defineProperty(result, '_councilResult', {
    value: committed.pai, enumerable: false, writable: false
  });
  Object.defineProperty(result, '_councilBinding', {
    value: committed.binding, enumerable: false, writable: false
  });
  return result;
}

function verifySessionOutbound(result) {
  if (!result || result.ok !== true || result.convened !== true ||
      typeof result.message !== 'string' || !result._councilResult || !result._councilBinding) {
    return { ok: false, reason: 'session_outbound_commit_missing' };
  }
  var checked = _council.requireVerifiedCouncilResult(
    result._councilResult, result._councilBinding);
  var proof = checked && checked.ok
    ? _council.compactCouncilProof(result._councilResult) : null;
  if (!checked || checked.ok !== true || checked.answer !== result.message ||
      !proof || proof.committed !== true || proof.readback_verified !== true ||
      proof.row_count !== 9) {
    return { ok: false, reason: checked && checked.reason || 'session_outbound_commit_invalid' };
  }
  return { ok: true, answer: checked.answer, councilProof: proof,
    requestId: proof.request_id, cycleId: proof.cycle_id };
}

var MIN_AGENDA = 2;          // fewer than this real items -> no session, no gimmick
var AGENDA_LOOKBACK_H = 96;  // only proposals raised in the last few days count as live

// Cold read of the REAL agenda: what the advisers and the tracker already flagged as
// needing him. Returns { decisions:[{who,text}], owed:[text], count }.
async function gatherAgenda(hamUid) {
  var HAM = String(hamUid || '').toUpperCase();
  var out = { decisions: [], owed: [], count: 0 };
  if (!_bu() || !_bk() || !HAM) return out;
  var sinceIso = new Date(Date.now() - AGENDA_LOOKBACK_H * 3600000).toISOString();
  // 1) advisor proposals that want the founder: meetings, decisions, assignments-for-founder
  try {
    var pa = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.PROPOSED_ACTION&ham_uid=eq.' + HAM
      + '&created_at=gte.' + encodeURIComponent(sinceIso)
      + '&order=created_at.desc&limit=25&select=summary,content', { headers: _rh() }).then(function (r) { return r.json(); });
    var seen = {};
    (Array.isArray(pa) ? pa : []).forEach(function (row) {
      var sum = String(row.summary || '');
      // keep the ones that actually call for HIM: a meeting, a decision, or an ask of the founder
      if (!/proposes (meeting|assignment_for_founder|decision)|for_found|needs (your|the founder)|make the call/i.test(sum)) return;
      var who = (sum.match(/\[([A-Z0-9_]+) proposes/) || [])[1] || 'an adviser';
      var text = sum.replace(/^\[[^\]]*\]\s*/, '').slice(0, 140).trim();
      var key = (who + '|' + text).toLowerCase();
      if (seen[key]) return; seen[key] = 1;
      out.decisions.push({ who: who, text: text });
    });
  } catch (e) {}
  // 2) things owed to him (tracker OPEN)
  try {
    var tr = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.TRACK&ham_uid=eq.' + HAM + '&summary=ilike.*OPEN*'
      + '&order=created_at.desc&limit=10&select=summary', { headers: _rh() }).then(function (r) { return r.json(); });
    (Array.isArray(tr) ? tr : []).forEach(function (row) {
      var t = String(row.summary || '').replace(/\[TRACK OPEN\]\s*/i, '').replace(/^request:\s*/i, '').slice(0, 120).trim();
      if (t) out.owed.push(t);
    });
  } catch (e) {}
  out.decisions = out.decisions.slice(0, 6);
  out.owed = out.owed.slice(0, 4);
  out.count = out.decisions.length + out.owed.length;
  return out;
}

// Cold gate: is there enough genuine material to be worth his time? No material, no session.
function worthSession(agenda) {
  return !!(agenda && agenda.count >= MIN_AGENDA);
}

// A real open slot from his calendar: the next free working-hours block, default 30 min.
async function pickSlot(hamUid, durationMin) {
  try {
    var prefs = await _sched.getHamPrefs(hamUid);
    var events = [];
    var verified = false;
    // REAL live calendar first. A successful read (even empty) means we truly checked.
    try {
      var live = await _sched.listCalendarEvents(hamUid, {});
      if (live && live.ok) { events = live.events || []; verified = true; }
    } catch (e) {}
    // Fall back to RADAR beads only if the live read failed.
    if (!verified) { try { var rad = await _sched.getRadarEvents(hamUid); events = rad || []; verified = Array.isArray(rad) && rad.length > 0; } catch (e) {} }
    var slots = _sched.computeFreeSlots(events, prefs) || [];
    // computeFreeSlots returns { start, end } as epoch SECONDS. Read them as seconds, not ms.
    var now = Date.now();
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var startMs = (typeof s.start === 'number') ? s.start * 1000 : new Date(s.start).getTime();
      if (!isNaN(startMs) && startMs > now + 3600000) { // at least an hour out
        var start = new Date(startMs);
        var end = new Date(startMs + (durationMin || 30) * 60000);
        return { startISO: start.toISOString(), endISO: end.toISOString(), verified: verified };
      }
    }
  } catch (e) {}
  return null;
}

// Assemble the agenda text COLD from the real items. No invention. This is what she brings
// to the table: the decisions that need him, the things she owes him, and her own prep.
function buildAgendaText(agenda) {
  var lines = [];
  if (agenda.decisions.length) {
    lines.push('What we need to decide:');
    agenda.decisions.forEach(function (d) { lines.push('- ' + d.who + ': ' + d.text); });
  }
  if (agenda.owed.length) {
    lines.push('Open items I owe you:');
    agenda.owed.forEach(function (o) { lines.push('- ' + o); });
  }
  lines.push('My prep: I will pull the latest on each of these from the advisers and the brain and come with options, so we decide in the room, not gather in it.');
  return lines.join('\n');
}

// REAL REASONING, not a bead scrape. Run the LIFE adviser's team (LIFE is the lead and owns
// schedule/deadlines/routine) on a grounded session-planning ask. The team JUDGES whether
// the work is actually getting done, decides what genuinely needs the founder versus what
// they should just finish, says what they have already prepped so he decides instead of
// gathers, and protects time that should go to other work instead of a meeting. Grounded
// strictly in the real cold anchor so it invents nothing. This is the teeth: advisers
// reasoning about the work, not a canned agenda.
async function reasonAgenda(hamUid, coldAnchorText, options) {
  options = options || {};
  // DIRECT, focused triage -- NOT the full dispatch team. Routing this through maybeDispatch
  // made planTeam shatter it into generic station jobs (a RESEARCHER researching "audit and
  // compliance", a DRAFTER building a "remediation framework"), which is exactly the
  // framework-garbage the founder caught. The team is for open-ended work; triaging specific
  // real items is one sharp judgment call that never researches and never builds a framework.
  var key = process.env.GROQ_API_KEY;
  if (!key) return { reasoned: false };
  var org = ''; try { org = require('../board/grounding.js').ORG_CHART; } catch (e) {}
  var sys = 'You are LIFE, the lead adviser to the PRINCIPAL at the very top of this org. ' + org
    + ' Right now you are triaging real open items for a possible 30-minute working session. You do NOT research anything new, '
    + 'and you NEVER build frameworks, worksheets, matrices, templates, checklists, or processes. You only judge the items given to you.';
  var user = 'Real open items the advisers raised and what is owed:\n\n' + coldAnchorText
    + '\n\nFor EACH item decide HANDLE (you and the team just finish it, no principal time) or ESCALATE (a real decision that cannot be '
    + 'settled over a text or an email, or a strategic update that truly warrants the principal). Be ruthless: most are HANDLE. '
    + 'Name the ACTUAL item in plain words, invent nothing beyond what is above. '
    + 'If nothing genuinely needs the principal, reply with exactly "NO SESSION" on the first line, then one sentence on what you are '
    + 'handling for them instead. Otherwise give ONLY the ESCALATE items, at most three, each one line naming the adviser it came from, '
    + 'and for each a second short line of what you have already prepped so they decide in seconds. Nothing else, no preamble.';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 4096, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
      signal:options.abortSignal
    }).then(function (x) { return x.json(); });
    var out = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    if (typeof out === 'string' && /\S/.test(out) && Buffer.byteLength(out, 'utf8') > 10) {
      var brief = out;
      var declined = /^\s*NO SESSION\b/im.test(brief) || /\bno session\b|nothing (genuinely )?needs|handle (it|this|these|them) (myself|ourselves)/i.test(brief);
      return { reasoned: true, brief: brief, declined: declined };
    }
  } catch (e) {}
  return { reasoned: false };
}

// The real way to meet. Read the founder's meeting-mode preference; if none is set, she
// offers both and lets him choose, never assumes. Modes: 'call' (she calls at the time via
// the voice channel), 'portal' (a live link to the Alive portal), 'either'.
async function resolveModality(hamUid) {
  try {
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.MEETING_MODE&ham_uid=eq.' + String(hamUid).toUpperCase() + '&select=content&order=created_at.desc&limit=1',
      { headers: _rh() }).then(function (r) { return r.json(); });
    if (Array.isArray(rows) && rows[0]) { var c = JSON.parse(rows[0].content || '{}'); if (c.mode) return c.mode; }
  } catch (e) {}
  return 'either';
}
function _modalityLine(mode, hamUid, portalBase) {
  var link = (portalBase || 'https://anu-anew.com') + '/cip/' + String(hamUid || '').toLowerCase();
  if (mode === 'call') return 'When it is time, I will call you and we run it live.';
  if (mode === 'portal') return 'When it is time, meet me at your live portal and we go: ' + link;
  return 'Your call on how we meet: I can call you at the time, or you meet me at your live portal (' + link + '). Tell me which and I will lock it that way.';
}

// THE WONDER, with teeth. Real advisor reasoning convenes it, a real slot holds it, a real
// modality runs it, and she comes prepped. opts.autobook forces the live booking.
async function proposeSession(hamUid, opts) {
  opts = opts || {};
  try {
    var HAM = String(hamUid || '').toUpperCase();
    if (!HAM) return { ok: false, reason: 'no_ham' };
    if (await _cancellationRequested(opts)) return _cancelledSession('before_agenda');
    // 1) cold ground truth (real beads) -- the anchor the reasoning is not allowed to leave
    var agenda = await gatherAgenda(HAM);
    if (await _cancellationRequested(opts)) return _cancelledSession('after_agenda');
    if (!worthSession(agenda)) return { ok: true, convened: false, reason: 'not_enough_real_material', count: agenda.count };
    var anchorText = buildAgendaText(agenda);
    // 2) REAL REASONING: LIFE's team judges the work and builds the true agenda
    var reasoned = await reasonAgenda(HAM, anchorText, opts);
    if (await _cancellationRequested(opts)) return _cancelledSession('after_reasoning');
    if (reasoned.reasoned && reasoned.declined) {
      return { ok: true, convened: false, reason: 'advisers_judged_no_session_needed', count: agenda.count };
    }
    // This stays source context only. It is never returned or sent as A'NU text.
    var agendaText = reasoned.reasoned ? reasoned.brief : anchorText;
    // 3) a real open slot, coordinated (the reasoning already flagged protected time)
    var slot = await pickSlot(HAM, 30);
    if (await _cancellationRequested(opts)) return _cancelledSession('after_slot');
    // 4) a real way to meet
    var mode = await resolveModality(HAM);
    if (await _cancellationRequested(opts)) return _cancelledSession('after_modality');
    var modalityLine = _modalityLine(mode, HAM, process.env.PORTAL_BASE_URL);
    // 5) book it (gated), carrying the agenda and the modality
    var insideExistingCycle = !(typeof opts.requestId === 'string' &&
      typeof opts.userMessage === 'string');
    var autobookRequested = (opts.autobook === true)
      || String(process.env.SESSION_AUTOBOOK || '').toLowerCase() === 'true';
    // A tool call from an existing PAI cycle returns grounded context to that
    // outer cycle. It cannot start a nested PAI cycle or write cold calendar text.
    var autobook = autobookRequested && !insideExistingCycle;
    var booked = null;
    var calendarCouncil = null;
    var exactRequest = typeof opts.userMessage === 'string' && opts.userMessage.length
      ? opts.userMessage
      : JSON.stringify({ action: 'propose_working_session', hamUid: HAM,
        autobook: autobook, send: opts.send !== false });
    if (autobook && slot) {
      var calendarClaim = JSON.stringify({ title:'A\u2019NU working session',
        description:agendaText + '\n\n' + modalityLine,
        start:slot.startISO, end:slot.endISO });
      var calendarInput = [
        'Prepare only the exact calendar artifact for this A\'NU working session.',
        'Return only one JSON object with exactly four keys: title, description, start, end.',
        'The start and end values must stay byte-for-byte JSON-equal to the request claim.',
        'Use only the grounded agenda and meeting details below. Do not claim any other action.',
        'LOSSLESS CALENDAR REQUEST CLAIM:',
        calendarClaim
      ].join('\n');
      calendarCouncil = await _committedSessionText({
        hamUid: HAM,
        requestId: 'session.calendar.' + crypto.createHash('sha256')
          .update(exactRequest + '\n' + calendarClaim, 'utf8').digest('hex').slice(0, 32),
        question: exactRequest,
        deliberationInput: calendarInput,
        channel: 'portal',
        delivery: { external: true },
        mode: 'session_calendar_artifact',
        context: { session_mode: mode, slot_start: slot.startISO,
          delivery_target: { kind:'ham', value:HAM } },
        abortSignal:opts.abortSignal,
        isCancelled:opts.isCancelled
      });
      if (await _cancellationRequested(opts)) {
        return _cancelledSession('after_calendar_council', {
          requestId:calendarCouncil.requestId, cycleId:calendarCouncil.cycleId });
      }
      if (!calendarCouncil.ok) {
        return { ok: false, convened: false,
          reason: 'calendar_description_council_failed:' + calendarCouncil.reason,
          requestId: calendarCouncil.requestId, cycleId: calendarCouncil.cycleId };
      }
      var calendarArtifact = _parseCalendarArtifact(calendarCouncil.answer);
      if (!calendarArtifact || calendarArtifact.start !== slot.startISO ||
          calendarArtifact.end !== slot.endISO) {
        return { ok: false, convened: false,
          reason: 'calendar_artifact_invalid',
          requestId: calendarCouncil.requestId, cycleId: calendarCouncil.cycleId,
          calendarCouncilProof: calendarCouncil.councilProof };
      }
      // ⬡B:core.session:GUARD:calendar_bytes_council_bound:20260715⬡
      // Both human-visible calendar fields are exact substrings of one committed
      // artifact. No cold title or post-STAMP rewrite reaches the provider.
      if (await _cancellationRequested(opts)) {
        return _cancelledSession('before_calendar_provider', {
          requestId:calendarCouncil.requestId, cycleId:calendarCouncil.cycleId });
      }
      booked = await _sched.bookEvent(HAM, { title: calendarArtifact.title,
        start: calendarArtifact.start, end: calendarArtifact.end,
        description: calendarArtifact.description,
        bookingAuthorization:{ councilResult:calendarCouncil.pai,
          expected:calendarCouncil.binding, artifact:calendarCouncil.answer },
        abortSignal:opts.abortSignal, isCancelled:opts.isCancelled });
      if (await _cancellationRequested(opts)) {
        return _cancelledSession('after_calendar_provider', {
          booked:booked && booked.ok ? booked : null,
          requestId:calendarCouncil.requestId, cycleId:calendarCouncil.cycleId });
      }
      if (!booked || booked.ok !== true) {
        return { ok: false, convened: false, reason: 'calendar_booking_failed',
          requestId: calendarCouncil.requestId, cycleId: calendarCouncil.cycleId,
          calendarCouncilProof: calendarCouncil.councilProof };
      }
    }
    // 6) the message she brings -- prepped, with the real agenda and the real modality
    var when = slot ? new Date(slot.startISO) : null;
    var whenStr = when ? when.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    var head;
    if (booked && booked.ok) head = 'I put us down for a working session ' + whenStr + '. Enough came to a head that needs your call, so I booked it and I am coming prepped.';
    else if (slot) head = 'Enough real work has come to a head that needs your call, so I want to sit down ' + whenStr + '. Want me to lock it?';
    else head = 'Enough real work has come to a head that needs your call and I want to sit down, but I could not find an open slot. Give me a time and I will set it.';
    // Honesty on the slot: if we had no real calendar data to check against, say so plainly.
    var slotCaveat = (slot && slot.verified === false) ? ' One straight thing: I have not fully synced your calendar yet, so confirm that time is actually open for you before I lock it.' : '';
    var draftContext = head + slotCaveat + '\n\n' + agendaText + '\n\n' + modalityLine;
    if (insideExistingCycle) {
      if (await _cancellationRequested(opts)) return _cancelledSession('before_outer_commit');
      return { ok: true, convened: true, reasoned: reasoned.reasoned,
        booked: null, slot: slot, mode: mode, agenda: agenda,
        requires_outer_commit: true, proposal_context: draftContext };
    }
    var outboundInput = [
      'Produce only the exact message A\'NU should deliver about this working session.',
      'The material below is grounded internal context. Use it accurately, but do not mention internal systems.',
      'Do not call tools or claim a booking unless the context says it was booked successfully.',
      'Grounded session context:',
      draftContext
    ].join('\n');
    var outboundCouncil = await _committedSessionText({
      hamUid: HAM,
      requestId: _requestId(opts.requestId),
      question: exactRequest,
      deliberationInput: outboundInput,
      channel: opts.send === false ? 'portal' : 'blooio',
      delivery: { external: opts.send !== false },
      mode: 'session_proposal_message',
      context: { session_mode: mode, autobook: autobook,
        booking_succeeded: !!(booked && booked.ok), slot_start: slot && slot.startISO || null,
        delivery_target: opts.deliveryTarget || null },
      abortSignal:opts.abortSignal,
      isCancelled:opts.isCancelled
    });
    if (await _cancellationRequested(opts)) {
      return _cancelledSession('after_outbound_council', {
        booked:booked && booked.ok ? booked : null,
        requestId:outboundCouncil.requestId, cycleId:outboundCouncil.cycleId });
    }
    if (!outboundCouncil.ok) {
      return { ok: false, convened: false,
        reason: 'session_outbound_council_failed:' + outboundCouncil.reason,
        booked: booked && booked.ok ? booked : null,
        requestId: outboundCouncil.requestId, cycleId: outboundCouncil.cycleId };
    }
    // ⬡B:core.session:GUARD:session_state_after_outbound_commit:20260715⬡
    // The session bead is a committed effect. Tool deliberation returns above
    // without writing it, and direct proposals write it only after their exact
    // outward message has a verified receipt plus STAMP pair.
    try {
      if (await _cancellationRequested(opts)) {
        return _cancelledSession('before_session_record', {
          booked:booked && booked.ok ? booked : null,
          requestId:outboundCouncil.requestId, cycleId:outboundCouncil.cycleId });
      }
      var sessionSource = 'session.' + HAM + '.' + outboundCouncil.requestId;
      var sessionResponse = await fetch(_bu() + '/rest/v1/' + _tbl(), {
        method:'POST', headers:Object.assign({}, _wh(), { Prefer:'return=representation' }),
        body:JSON.stringify({
        ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION',
        acl_stamp: '\u2b21B:core.session:SESSION:' + (booked && booked.ok ? 'booked' : 'proposed') + ':' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '\u2b21',
        source: sessionSource,
        summary: '[SESSION ' + (booked && booked.ok ? 'BOOKED' : 'PROPOSED') + '] ' + agenda.count + ' real items, LIFE-reasoned=' + (reasoned.reasoned ? 'yes' : 'no') + (slot ? ' | ' + slot.startISO.slice(0, 16) : ''),
        content: JSON.stringify({ agenda: agenda, agendaText: agendaText,
          reasonedBy: reasoned.reasoned ? 'LIFE team' : null, mode: mode, slot: slot,
          booked: booked && booked.ok ? booked : null, autobook: autobook,
          calendarArtifact: calendarCouncil && calendarCouncil.answer || null,
          calendarCouncilProof: calendarCouncil && calendarCouncil.councilProof || null,
          outboundCouncilProof: outboundCouncil.councilProof }),
        importance: 7
      }), signal:opts.abortSignal });
      var sessionRows = sessionResponse.ok
        ? await sessionResponse.json().catch(function(){return null;}) : null;
      if (!sessionResponse.ok || !Array.isArray(sessionRows) || !sessionRows[0] ||
          sessionRows[0].source !== sessionSource) {
        return { ok:false, convened:false, reason:'session_record_unverified',
          requestId:outboundCouncil.requestId, cycleId:outboundCouncil.cycleId };
      }
    } catch (eRecord) {
      return { ok: false, convened: false, reason: 'session_record_failed',
        requestId: outboundCouncil.requestId, cycleId: outboundCouncil.cycleId };
    }
    var result = { ok: true, convened: true, reasoned: reasoned.reasoned,
      booked: booked && booked.ok ? booked : null, slot: slot, mode: mode,
      agenda: agenda, message: outboundCouncil.answer,
      requestId: outboundCouncil.requestId, cycleId: outboundCouncil.cycleId,
      councilProof: outboundCouncil.councilProof,
      calendarCouncilProof: calendarCouncil && calendarCouncil.councilProof || null };
    return _attachCouncil(result, outboundCouncil);
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

module.exports = { proposeSession, verifySessionOutbound, gatherAgenda, worthSession,
  pickSlot, buildAgendaText, reasonAgenda, resolveModality, completeSession,
  checkDueSessionCalls, startSessionCallChecker };

// ⬡B:core.session:BUILD:call_at_time:20260713⬡
// Founder: "is she gonna call me, bro, or is she gonna gaslight me?" This closes that gap
// honestly. It NEVER calls on a guess: it only fires when the HAM has explicitly set
// MEETING_MODE to 'call' (a real, deliberate preference, not the default 'either'), and only
// for a session that was actually BOOKED (a real calendar write happened, not just proposed).
// It reuses the proven /vara/call endpoint (the canonical Pipecat provider boundary) rather
// than building a parallel call path -- this Wonder never rebuilds voice infrastructure, it
// only reaches through the door that already exists. Mirrors outreach.js's own cold interval
// pattern: poll, single-flight, brain is the record of what already fired.
async function checkDueSessionCalls() {
  try {
    if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
    var now = Date.now();
    // booked sessions from the last 6 hours -- wide enough to catch a slow tick, never re-fires
    // because the CALLED bead below is checked before every fire.
    var since = new Date(now - 6 * 3600000).toISOString();
    var rows = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.SESSION&summary=ilike.*BOOKED*&created_at=gte.' + encodeURIComponent(since)
      + '&order=created_at.desc&limit=20&select=ham_uid,source,content', { headers: _rh() }).then(function (r) { return r.json(); });
    if (!Array.isArray(rows)) return { ok: false, reason: 'no_rows' };
    var fired = 0;
    var blocked = 0;
    var councilProofs = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var c; try { c = JSON.parse(row.content || '{}'); } catch (e) { continue; }
      if (!c.booked || !c.booked.ok || !c.slot || !c.slot.startISO) continue;
      if (c.mode !== 'call') continue; // only ever fires on an EXPLICIT, deliberate call preference
      var startMs = new Date(c.slot.startISO).getTime();
      if (isNaN(startMs) || startMs > now || (now - startMs) > 10 * 60000) continue; // due within the last 10 minutes only
      var HAM = String(row.ham_uid || '').toUpperCase();
      // has this one already been called? check for a SESSION_CALLED bead tied to this exact source
      var already = await fetch(_bu() + '/rest/v1/' + _tbl()
        + '?stamp_type=eq.SESSION_CALLED&source=eq.' + encodeURIComponent('called.' + row.source)
        + '&select=id&limit=1', { headers: _rh() }).then(function (r) { return r.json(); }).catch(function () { return []; });
      if (Array.isArray(already) && already.length) continue;
      // ⬡B:core.session:GUARD:atomic_once_only_session_call_claim:20260715⬡
      // A database-backed claim is acquired before the audit bead or provider.
      // Its lease outlives the due window, so another process cannot retry an
      // uncertain call and ring twice after a timeout or restart.
      var callRequestId = 'session.call.' + crypto.createHash('sha256')
        .update(String(row.source)).digest('hex').slice(0, 24);
      var claimant = callRequestId + '.' + crypto.randomUUID();
      var wonClaim = await _claimLock.claimTask('session_call:' + row.source,
        claimant, 24 * 60 * 60 * 1000).catch(function () { return false; });
      if (!wonClaim) continue;
      // Fire the real, proven outbound call path only after the durable attempt
      // row has returned its representation.
      try {
        var callReason = [
          'Start the booked working session now.',
          'Use the grounded session agenda below as internal context for the opener.',
          c.agendaText || ''
        ].join('\n');
        var attemptHeaders = Object.assign({}, _wh(), { Prefer:'return=representation' });
        var attemptResponse = await fetch(_bu() + '/rest/v1/' + _tbl(), {
          method:'POST', headers:attemptHeaders, body:JSON.stringify({
          ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION_CALL_ATTEMPT',
          acl_stamp: '\u2b21B:core.session:SESSION_CALL_ATTEMPT:reserved:' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '\u2b21',
          source: 'call.attempt.' + row.source + '.' + callRequestId,
          summary: '[SESSION CALL ATTEMPT] awaiting committed VARA delivery proof',
          content: JSON.stringify({ requestId: callRequestId, sessionSource: row.source }),
          importance: 5
        }) });
        var attemptRows = attemptResponse.ok
          ? await attemptResponse.json().catch(function(){return null;}) : null;
        if (!attemptResponse.ok || !Array.isArray(attemptRows) || !attemptRows[0]) {
          blocked++;
          continue;
        }
        var callBase = process.env.SELF_BASE_URL || 'https://aibebase.onrender.com';
        var callBody = { hamUid: HAM, reason: callReason,
          requestId: callRequestId };
        var callHeaders = require('./pai.outbound.authorization.js')
          .internalEffectHeaders('/vara/call', callBody);
        if (!callHeaders) {
          blocked++;
          continue;
        }
        var callResponse = await fetch(callBase + '/vara/call', {
          method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' },
            callHeaders), body: JSON.stringify(callBody)
        });
        var callResult = await callResponse.json().catch(function () { return null; });
        var proof = callResult && callResult.councilProof;
        if (callResponse.ok && callResult && callResult.ok === true && proof &&
            proof.committed === true && proof.readback_verified === true &&
            proof.row_count === 9 &&
            (callResult.callId || callResult.conversation_id || callResult.providerCallId)) {
          var calledResponse = await fetch(_bu() + '/rest/v1/' + _tbl(), {
            method:'POST', headers:attemptHeaders, body:JSON.stringify({
            ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION_CALLED',
            acl_stamp: '\u2b21B:core.session:SESSION_CALLED:delivered:' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '\u2b21',
            source: 'called.' + row.source,
            summary: '[SESSION CALL DELIVERED] committed VARA provider accepted call',
            content: JSON.stringify({ requestId: callRequestId, sessionSource: row.source,
              providerCallId:callResult.callId || callResult.conversation_id || callResult.providerCallId,
              councilProof: proof }), importance: 6
          }) });
          var calledRows = calledResponse.ok
            ? await calledResponse.json().catch(function(){return null;}) : null;
          if (calledResponse.ok && Array.isArray(calledRows) && calledRows[0]) {
            fired++;
            councilProofs.push(proof);
          } else blocked++;
        } else {
          var callFailureReason = callResult && callResult.reason || 'provider_unverified';
          var uncertain = /uncertain|unverified/.test(callFailureReason);
          await fetch(_bu() + '/rest/v1/' + _tbl(), { method:'POST', headers:attemptHeaders, body:JSON.stringify({
            ham_uid: HAM, agent_global: 'A\u2019NU',
            stamp_type: uncertain ? 'SESSION_CALL_UNCERTAIN' : 'SESSION_CALL_FAILED',
            acl_stamp: '\u2b21B:core.session:' + (uncertain ? 'SESSION_CALL_UNCERTAIN' : 'SESSION_CALL_FAILED')
              + ':terminal:' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '\u2b21',
            source: 'call.terminal.' + row.source + '.' + callRequestId,
            summary: '[SESSION CALL HELD] no provider delivery proof; no automatic retry',
            content: JSON.stringify({ requestId: callRequestId, sessionSource: row.source,
              status: callResponse.status, reason: callFailureReason,
              automaticRetry:false }), importance: 7
          }) }).catch(function () {});
          blocked++;
        }
      } catch (e) {
        try {
          await fetch(_bu() + '/rest/v1/' + _tbl(), { method:'POST',
            headers:Object.assign({}, _wh(), { Prefer:'return=representation' }),
            body:JSON.stringify({ ham_uid:HAM, agent_global:'A\u2019NU',
              stamp_type:'SESSION_CALL_UNCERTAIN',
              acl_stamp:'\u2b21B:core.session:SESSION_CALL_UNCERTAIN:terminal:'
                + new Date().toISOString().slice(0,10).replace(/-/g,'') + '\u2b21',
              source:'call.terminal.' + row.source + '.' + callRequestId,
              summary:'[SESSION CALL HELD] provider state uncertain; no automatic retry',
              content:JSON.stringify({requestId:callRequestId,sessionSource:row.source,
                reason:'provider_uncertain',automaticRetry:false}),importance:7 })
          });
        } catch (eRecord) {}
        blocked++;
      }
    }
    return { ok: true, fired: fired, blocked: blocked,
      councilProofs: councilProofs };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}

function startSessionCallChecker(intervalMs) {
  var ms = intervalMs || parseInt(process.env.SESSION_CALL_CHECK_MS || '', 10) || 5 * 60 * 1000;
  var running = false;
  return setInterval(function () {
    if (running) return; running = true;
    checkDueSessionCalls().catch(function () {}).then(function () { running = false; });
  }, ms);
}

// ⬡B:core.session:BUILD:capture_outcomes_real_not_theater:20260713⬡
// Founder's own words: capturing what happens IN the meeting is what decides whether it is
// real or theater. This closes the loop. When a session concludes, his DECISIONS are recorded
// and every ASSIGNMENT she took on becomes a real TRACK OPEN item, the same tracked-to-
// completion type the rest of the system watches, so nothing said in the room evaporates.
async function completeSession(hamUid, outcome) {
  outcome = outcome || {};
  try {
    var HAM = String(hamUid || '').toUpperCase();
    if (!HAM) return { ok: false, reason: 'no_ham' };
    var decisions = Array.isArray(outcome.decisions) ? outcome.decisions : [];
    var assignments = Array.isArray(outcome.assignments) ? outcome.assignments : [];
    var notes = String(outcome.notes || '').slice(0, 2000);
    var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // 1) the outcome record: what was decided
    try {
      await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh(), body: JSON.stringify({
        ham_uid: HAM, agent_global: 'A\u2019NU', stamp_type: 'SESSION_OUTCOME',
        acl_stamp: '\u2b21B:core.session:SESSION_OUTCOME:captured:' + ymd + '\u2b21',
        source: 'session.outcome.' + HAM + '.' + Date.now(),
        summary: '[SESSION OUTCOME] ' + decisions.length + ' decision(s), ' + assignments.length + ' assignment(s)',
        content: JSON.stringify({ sessionId: outcome.sessionId || null, decisions: decisions, assignments: assignments, notes: notes }),
        importance: 7
      }) });
    } catch (e) {}
    // 2) every assignment becomes a real tracked-to-completion item (TRACK OPEN)
    var tracked = 0;
    for (var i = 0; i < assignments.length; i++) {
      var a = String(assignments[i] && assignments[i].text ? assignments[i].text : assignments[i]).slice(0);
      if (!a.trim()) continue;
      var owner = (assignments[i] && assignments[i].owner) ? String(assignments[i].owner) : 'A\u2019NU';
      try {
        await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST', headers: _wh(), body: JSON.stringify({
          ham_uid: HAM, agent_global: owner.toUpperCase(), stamp_type: 'TRACK',
          acl_stamp: '\u2b21B:core.session:TRACK:OPEN:from_session:' + ymd + '\u2b21',
          source: 'track.session.' + HAM + '.' + Date.now() + '.' + i,
          summary: '[TRACK OPEN] (' + owner + ' owes, from session) ' + a,
          content: JSON.stringify({ status: 'OPEN', text: a, owner: owner, from: 'session', createdAt: Date.now() }),
          importance: 6
        }) });
        tracked++;
      } catch (e) {}
    }
    return { ok: true, captured: true, decisions: decisions.length, assignmentsTracked: tracked };
  } catch (e) { return { ok: false, reason: 'exception', error: e.message }; }
}
