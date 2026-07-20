// ⬡B:core.inbox_zero:BUILD:universal_wonder_agent_one_source_per_advisor:20260720⬡
// entered through the ABAHAM door, serving channel MESSAGES (per-world inbox review)
//
// THE INBOX ZERO WONDER AGENT, universal, one source, runs identically for EVERY
// advisor. This file does NOT belong to MH Action, or BDIF, or anyone. The world is a
// parameter, never a hardcoded value (the 847392 test). No grant id and no email address
// is written into this file's logic; every world-specific value is resolved at run time
// from that advisor's own registration and its own grant, through IMAN.
//
// This is the SINGLE canonical source in anew/core; scripts/sync-engine.js mirrors it to
// template-mind/pai/core. It replaces the copy-per-world advisor pattern with one engine.
//
// THE FIVE W's AND THE HOW
//  who   : whichever advisor is invoked, scoped strictly to that advisor's world + grant.
//  what  : pull every unread email, read each in full (thread + attachments), check the
//          advisor's own IMB for relationship history, decide what actually needs a reply,
//          draft in the founder's voice where a reply is owed, mark read only what resolved.
//  when  : on request now; once a day per world once scheduled.
//  where : the advisor's own Command Center as a resting DRAFT_PENDING. It climbs the reach
//          ladder only under a real bar, and even then a reach clears the Overseer first.
//  why   : reading, checking history, and drafting in his voice is the bottleneck. Sending
//          takes one word from him. Getting a good draft in front of him is the work.
//  how   : cold code fetches (inbox, threads, attachments, calendar, IMB). The LLM organ
//          reads all of it and decides what each email needs. Cold code never decides
//          whether a reply is warranted, it only gathers.
'use strict';

var IMAN         = require('../reach/iman');
var find         = require('./find');
var advisorExit  = require('../advisors/advisor.exit');
var watermark    = require('./inboxWatermark');
var grounding    = require('../board/grounding');
var ladder       = require('./model.ladder');
var brainClient  = require('./brain.client');
var lineage      = require('./lineage.attach');
var formatMatrix = require('./format.matrix');

// The two brains, resolved at call time (legacy aibe_brain vs the new memory bank).
function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _memorySelected(){ return !!(process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY); }
function _tbl(){ return process.env.BEAD_TABLE || (_memorySelected() ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (_memorySelected() ? 'memory_bank' : 'abacia_core'); }
function ymd(){ return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function rh(){ return { apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() }; }
function wh(){ var h = rh(); h['Content-Profile'] = _schema(); h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }

// Supersede-only brain write. Fails safe (never throws into the cycle). Every write here
// already carries a four-colon ACL stamp built by the caller via brainClient.buildStamp.
async function writeBead(bead) {
  if (!_bu() || !_bk()) return { ok:false, reason:'brain_unreachable' };
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method:'POST', headers:wh(), body:JSON.stringify(bead), signal:AbortSignal.timeout(9000)
    });
    return { ok: !!(r && r.ok) };
  } catch (e) { return { ok:false, reason:e.message }; }
}

function normalizeWorld(world) {
  return String(world || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}
// A'NU's IMB source tag / spawned_by for a world: the advisor's global identity.
function advisorGlobalFor(world) {
  return normalizeWorld(world).toUpperCase() + '_ADVISOR';
}

// ── FINDING THE ADVISOR AND HER IMB ──────────────────────────────────────────────────
// Not automatic just because a world name was passed in. A real lookup: confirm a live
// advisor exists for this world for this HAM (the lane board / advisor registry), then
// resolve her own grant + sender identity. Config is read from her registration, never
// hardcoded here. If no live advisor, we do NOT draft blind, we mark the wall and stop.
async function resolveAdvisorConfig(world, HAM) {
  var w = normalizeWorld(world);
  var live = true, roster = [];
  try {
    var router = require('../advisors/advisor-router');
    if (router && typeof router.discoverStations === 'function') {
      roster = await router.discoverStations(HAM) || [];
      // A world counts as live only if the registry actually lists it for this HAM.
      live = roster.length ? roster.indexOf(w) !== -1 : true; // empty roster => registry cold, fail open
    }
  } catch (e) { /* registry unreachable: fail open, the grant check below still gates us */ }

  var grantInfo = null;
  try { grantInfo = IMAN.getGrant(w); } catch (e) { grantInfo = null; }
  var grantId = grantInfo && grantInfo.grantId;
  var sendAs  = (grantInfo && grantInfo.from) || process.env['NYLAS_' + w.toUpperCase() + '_FROM_EMAIL'] || null;
  var bcc     = process.env['NYLAS_' + w.toUpperCase() + '_BCC'] || process.env.NYLAS_ADVISOR_BCC || null;

  return {
    ok: !!grantId && live,
    live_advisor: live,
    world_name: w,
    advisor_id: advisorGlobalFor(w),
    grant_id: grantId || null,
    send_as_email: sendAs,
    bcc_email: bcc,
    imb_source_tag: advisorGlobalFor(w),   // scope every IMB search to her own tag
    roster: roster,
  };
}

// ── THE FCW WALL ──────────────────────────────────────────────────────────────────────
// When the agent hits a gap it cannot close itself, it marks it on the wall plainly and
// hands the Overseer the specific command to close it, rather than silently working around
// it. Gaps become the Overseer's to plan, then A'NU's cycle to build.
async function markWallGap(HAM, world, gapKey, humanText, overseerCommand) {
  var w = normalizeWorld(world);
  var src = 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + w + '.fcw_gap.' + gapKey + '.' + Date.now();
  await writeBead({
    ham_uid: HAM, agent_global: 'INBOX_ZERO', stamp_type: 'FCW_GAP',
    acl_stamp: brainClient.buildStamp('inbox_zero.' + w + '.wall.' + gapKey, 'FCW_GAP', ''),
    source: src, importance: 8,
    summary: '[INBOX ZERO WALL] ' + w + ': ' + String(humanText || gapKey).slice(0, 100),
    content: JSON.stringify({
      wall: true, world: w, gap: gapKey, note: humanText,
      overseer_command: overseerCommand, routing: 'submit_backward_to_overseer',
      createdAt: new Date().toISOString(),
    }),
  });
  // Also surface it to his desk so the gap is visible, not buried.
  try { await advisorExit.surfaceToDesk(HAM, 'INBOX_ZERO', 'Inbox Zero needs a gap closed for ' + w, humanText + (overseerCommand ? ('\n\nOverseer: ' + overseerCommand) : ''), 8); } catch (e) {}
  return { gap: gapKey, note: humanText };
}

// ── CLOSING THE LOOP ON PENDING DRAFTS ────────────────────────────────────────────────
// A wonder agent does not fire and forget. Before pulling new mail, revisit prior drafts:
// close the stale/superseded ones (advisorExit.reconcileDrafts), and DROP any whose
// underlying thread has since been resolved another way, stamping the drop so there is a
// record of why it never went out.
async function closeLoopOnPriorDrafts(HAM, config) {
  var closed = 0, dropped = 0;
  var advisorGlobal = config.advisor_id;
  try { var rec = await advisorExit.reconcileDrafts(HAM, advisorGlobal); closed = (rec && rec.closed) || 0; } catch (e) {}
  // DROP resolved: read still-open DRAFT_PENDING notes; if the thread they answer now has a
  // real reply in Sent, the draft is moot, drop it with a stamped reason, do not send.
  try {
    if (!_bu() || !_bk()) return { closed: closed, dropped: dropped };
    var url = _bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + String(HAM).toUpperCase()
      + '&agent_global=eq.' + encodeURIComponent(advisorGlobal)
      + '&stamp_type=eq.DRAFT_PENDING&order=created_at.desc&limit=10&select=id,content,created_at';
    var r = await fetch(url, { headers: rh(), signal: AbortSignal.timeout(9000) });
    var rows = r.ok ? await r.json() : [];
    for (var i = 0; i < (rows || []).length; i++) {
      var c = {}; try { c = JSON.parse(rows[i].content || '{}'); } catch (e2) { continue; }
      if (!c || c.status === 'closed' || c._dropped) continue;
      var threads = Array.isArray(c.drafts) ? c.drafts : [];
      var stillOpen = false, anyResolved = false;
      for (var j = 0; j < threads.length; j++) {
        var t = threads[j];
        if (!t || !t.thread_id) { stillOpen = true; continue; }
        var chk = await IMAN.alreadyRepliedOnThread(config.world_name, t.thread_id, t.since || 0).catch(function(){ return { replied:false }; });
        if (chk && chk.replied) anyResolved = true; else stillOpen = true;
      }
      if (anyResolved && !stillOpen && threads.length) {
        c._dropped = true; c.status = 'closed'; c._closed_at = new Date().toISOString();
        c._closed_reason = 'underlying_threads_resolved_elsewhere_dropped_not_sent';
        await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + rows[i].id, {
          method:'PATCH', headers: wh(), body: JSON.stringify({ content: JSON.stringify(c) }), signal: AbortSignal.timeout(8000)
        }).catch(function(){});
        dropped++;
      }
    }
  } catch (e) {}
  return { closed: closed, dropped: dropped };
}

// ── THE BRAIN, READ FIRST ─────────────────────────────────────────────────────────────
// Find in the brain first before assuming nothing is known, scoped to THIS advisor's own
// IMB (her agent_global + this HAM), never a blind search across every advisor at once.
// If her IMB has nothing on a person or thread, that itself is useful, a new or
// never-captured relationship, and we say so rather than guessing.
async function readAdvisorIMB(config, HAM) {
  try {
    var res = await find.find([
      { agent_global: config.advisor_id, ham_uid: HAM, stamp_type: 'RESULT', limit: 8 },
      { agent_global: config.advisor_id, ham_uid: HAM, stamp_type: 'RELATIONSHIP', limit: 8 },
      { source_prefix: 'ham_' + String(HAM).toLowerCase() + '.advisors.' + config.world_name, ham_uid: HAM, limit: 8 },
    ]);
    var beads = (res && res.beads) || [];
    return {
      count: beads.length,
      notes: beads.map(function (b) { return String(b.summary || '').slice(0, 160); }).filter(Boolean).slice(0, 12),
      empty: beads.length === 0,
    };
  } catch (e) { return { count: 0, notes: [], empty: true, error: e.message }; }
}

// ── COLD GATHER ───────────────────────────────────────────────────────────────────────
// Cold code fetches the unread list, opens each thread in full, checks Sent, opens
// attachments, checks the calendar, and pulls the advisor's IMB. It decides nothing.
async function gatherEvidence(config, HAM, limit) {
  var world = config.world_name;
  var out = { world: world, messages: [], calendar: '', imb: null, blast_hints: [], errors: [] };

  // Own IMB first.
  out.imb = await readAdvisorIMB(config, HAM);

  // Unread inbox, this world's grant only. EBC firewall.
  var inbox;
  try { inbox = await IMAN.listEmails(world, { limit: limit || 12, unread: true }); }
  catch (e) { inbox = { ok: false, reason: e.message, messages: [] }; }
  if (!inbox.ok) { out.errors.push('inbox:' + (inbox.reason || 'unknown')); return out; }

  // Dedup against what this advisor already handled.
  var msgs = inbox.messages || [];
  try { msgs = await watermark.filterUnhandled(config.advisor_id, HAM, msgs); } catch (e) {}

  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    var rec = {
      id: m.id, thread_id: m.thread_id, from: m.from, from_name: m.from_name,
      subject: m.subject, date: m.date, snippet: m.snippet,
      recipient_count: m.recipient_count || (m.to ? m.to.length : 0) + (m.cc ? m.cc.length : 0),
      to: m.to || [], cc: m.cc || [],
      already_replied: false, thread: [], attachments: [], attachment_text: [],
    };
    // Blast HINT only (cold code hints, the organ decides): many recipients or many
    // distinct sender-domains among To/CC is a signal something personal-looking is a blast.
    var domains = {};
    (rec.to.concat(rec.cc)).forEach(function (a) { var d = String(a.email || '').split('@')[1]; if (d) domains[d] = 1; });
    rec.distinct_recipient_domains = Object.keys(domains).length;
    if (rec.recipient_count >= 12 || rec.distinct_recipient_domains >= 6) out.blast_hints.push(rec.id);

    // Sent check, never assume no one answered.
    if (m.thread_id) {
      try { var chk = await IMAN.alreadyRepliedOnThread(world, m.thread_id, m.date); rec.already_replied = !!(chk && chk.replied); } catch (e) {}
      // Full thread, chronological, every message, not just the newest.
      try { var th = await IMAN.getThread(world, m.thread_id); if (th.ok) rec.thread = (th.messages || []).map(function (tm) {
        return { from: tm.from, date: tm.date, snippet: tm.snippet, body: String(tm.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200), attachments: tm.attachments };
      }); } catch (e) {}
    }

    // Attachments must actually be opened, not assumed.
    var att = [];
    (rec.thread || []).forEach(function (tm) { (tm.attachments || []).forEach(function (a) { att.push(a); }); });
    if (!att.length && m.has_attachments) att.push({ id: null, filename: '(attachment referenced on newest message)', content_type: '', size: 0 });
    for (var k = 0; k < att.length && k < 5; k++) {
      var a = att[k];
      rec.attachments.push({ filename: a.filename, content_type: a.content_type, size: a.size });
      if (a.id) {
        try {
          var dl = await IMAN.downloadAttachment(world, m.id, a.id, a.content_type);
          if (dl && dl.ok && dl.readable && dl.text) rec.attachment_text.push({ filename: a.filename, text: dl.text.slice(0, 2000) });
          else rec.attachment_text.push({ filename: a.filename, text: null, note: 'binary/unreadable, not fabricating its contents' });
        } catch (e) {}
      }
    }
    out.messages.push(rec);
  }

  // Calendar, every writable calendar for this world (grounding resolves the world's own).
  try { out.calendar = await grounding.groundedCalendar(world) || ''; } catch (e) { out.calendar = ''; }
  return out;
}

// ── THE JUDGMENT LAYER + DRAFTING (the LLM organ) ─────────────────────────────────────
// The part a spec sheet cannot fully capture. The organ reads the gathered evidence and
// decides, per email, which bucket it falls into and whether a reply is owed. Where a reply
// is owed and is the founder's to make, it drafts in HIS voice (WRIT-gated below). It never
// fabricates. Returns strict JSON so cold code can route each decision.
function buildJudgmentPrompt(packet, config) {
  var lines = [];
  packet.messages.forEach(function (m, i) {
    lines.push('--- EMAIL ' + (i + 1) + ' (id ' + m.id + ') ---');
    lines.push('From: ' + (m.from_name ? (m.from_name + ' <' + m.from + '>') : m.from));
    lines.push('Subject: ' + m.subject);
    lines.push('Recipients: ' + m.recipient_count + ' (distinct domains: ' + m.distinct_recipient_domains + ')' + (packet.blast_hints.indexOf(m.id) !== -1 ? '  [COLD HINT: possible blast, verify To/CC yourself]' : ''));
    lines.push('Already replied by the principal on this thread: ' + (m.already_replied ? 'YES' : 'no'));
    var ageDays = m.date ? Math.floor((Date.now() / 1000 - m.date) / 86400) : null;
    if (ageDays != null) lines.push('Age: ' + ageDays + ' day(s)' + (ageDays > 2 ? '  [STALE: flag before drafting]' : ''));
    lines.push('Thread (' + (m.thread || []).length + ' msgs, chronological):');
    (m.thread || []).forEach(function (t) { lines.push('  • ' + (t.from || '?') + ': ' + (t.snippet || t.body || '').slice(0, 240)); });
    if (!m.thread || !m.thread.length) lines.push('  (no thread history fetched) snippet: ' + m.snippet);
    if (m.attachments.length) lines.push('Attachments: ' + m.attachments.map(function (a) { return a.filename + (a.content_type ? (' [' + a.content_type + ']') : ''); }).join(', '));
    (m.attachment_text || []).forEach(function (at) { lines.push('  attachment "' + at.filename + '": ' + (at.text ? at.text.slice(0, 600) : (at.note || 'unreadable'))); });
    lines.push('');
  });
  var imbLine = packet.imb && !packet.imb.empty
    ? 'Advisor IMB history (' + packet.imb.count + ' notes): ' + packet.imb.notes.join(' | ')
    : 'Advisor IMB history: NOTHING on file, treat unknown people as new/uncaptured relationships, do not invent history.';

  var system = 'You are the judgment organ of the Inbox Zero cycle for the "' + config.world_name
    + '" world. You serve ' + (process.env.FOUNDER_DISPLAY_NAME || 'the principal') + '. EBC FIREWALL: you have zero access to any other world; never name another client or organization.\n'
    + 'Decide, for EACH email, exactly one bucket: personal (owed a real reply), blast (looks personal but went wide, do not answer warmly), not_mine (a named staffer already owns it, principal only CC\'d), automated (no human to write back to), calendar (resolves on accept/decline), or resolved (already answered).\n'
    + 'RULES: Check the full To/CC before calling anything personal. If a named person is already corresponding, it is not the principal\'s to answer. Open attachments before referencing them; if something was referenced but never attached, say so plainly. Flag anything older than two days before drafting. NEVER fabricate a person, update, meeting, or trip not present in the evidence. Use IMB history only when it is real, sourced as what it is.\n'
    + 'Only for bucket=personal do you write draftBody, and it must be in the PRINCIPAL\'S OWN VOICE: no em dashes, no dropped subjects, no robotic parallel structure, no call-to-action ending, a correct capitalized greeting, ending on the last real thought. Everything is DRAFT ONLY; nothing sends without his explicit word.\n'
    + 'If a draft is genuinely time-critical (a real deadline within hours that a resting draft would blow past), set escalate.propose=true with a tier (text|email|call) and one sentence of reasoning. You never send; you only propose, and the Overseer clears it.\n'
    + 'Return STRICT JSON only: {"decisions":[{"id":"<email id>","bucket":"...","needsReply":true|false,"draftBody":"<his voice or empty>","escalate":{"propose":false,"tier":null,"reasoning":""},"reasoning":"<why, one or two sentences>"}]}';

  var user = imbLine + '\n\nCALENDAR (this world only):\n' + (packet.calendar || '(none)') + '\n\nUNREAD MAIL:\n' + lines.join('\n')
    + '\n\nReturn the JSON now. One decision object per email above, matched by id.';
  return { system: system, user: user };
}

// Cold-code post-validation. The live cook-off judge's own correction: verify each
// decision's bucket is in the closed set before routing, and strip em/en dashes from
// anything a human will read (belt to WRIT's suspenders) so a stray dash never reaches
// the principal's own voice. Cold code enforces, it does not judge meaning.
var ALLOWED_BUCKETS = { personal:1, blast:1, not_mine:1, automated:1, calendar:1, resolved:1 };
function stripDashes(text) { return String(text || '').replace(/\s*[\u2014\u2013]\s*/g, ', '); }
function enforceDecisions(decisions) {
  return (Array.isArray(decisions) ? decisions : []).map(function (d) {
    if (!d || typeof d !== 'object') return null;
    // Unknown bucket is not a silent pass: default to the safe non-drafting bucket.
    if (!ALLOWED_BUCKETS[d.bucket]) { d.bucket = 'automated'; d.needsReply = false; d.reasoning = '[bucket coerced: organ returned an unknown bucket] ' + (d.reasoning || ''); }
    if (d.bucket !== 'personal') { d.needsReply = false; d.draftBody = ''; } // only personal drafts
    if (d.draftBody) d.draftBody = stripDashes(d.draftBody);
    return d;
  }).filter(Boolean);
}

async function judgeAndDraft(packet, config) {
  if (!packet.messages.length) return { ok: true, decisions: [] };
  var p = buildJudgmentPrompt(packet, config);
  var res = null;
  try { res = await ladder.deliberate(p.system, p.user, { max_tokens: 2600, temperature: 0.2, json: true, timeout: 45000 }); } catch (e) {}
  if (!res || !res.content) return { ok: false, reason: 'organ_unavailable', decisions: [] };
  var parsed = null;
  try { parsed = typeof res.content === 'string' ? JSON.parse(res.content) : res.content; } catch (e) { return { ok: false, reason: 'organ_bad_json', decisions: [] }; }
  var decisions = enforceDecisions((parsed && parsed.decisions) || []);
  // WRIT-gate every draft into the principal's voice; strip markdown, then dashes last.
  for (var i = 0; i < decisions.length; i++) {
    var d = decisions[i];
    if (d && d.bucket === 'personal' && d.draftBody) {
      try { var w = await require('../board/writ/writ').writCheck(d.draftBody); if (w && w.ok && typeof w.content === 'string') d.draftBody = w.content; } catch (e) {}
      try { d.draftBody = formatMatrix.stripMarkdown(d.draftBody); } catch (e) {}
      d.draftBody = stripDashes(d.draftBody);
    }
  }
  return { ok: true, decisions: decisions, via: res.via || res.model || 'ladder' };
}

// ── THE VOICE LAYER: HER REPORT ───────────────────────────────────────────────────────
// The report the advisor gives the principal in the Command Center is written in HER voice,
// not his: A'NU, JARVIS from Iron Man but a Black woman, a serving butler with spunk and
// funk, full natural sentences, matters-first, never a system readout, never a grading
// sheet listing twelve items in identical tone. She tells him what actually matters first.
async function composeHerReport(decisions, packet, config, HAM, priorLoop) {
  var personal = decisions.filter(function (d) { return d.bucket === 'personal' && d.needsReply; });
  var skipped  = decisions.filter(function (d) { return d.bucket !== 'personal' || !d.needsReply; });
  var escal    = decisions.filter(function (d) { return d.escalate && d.escalate.propose; });

  var facts = [];
  facts.push('World: ' + config.world_name + '. Unread reviewed: ' + packet.messages.length + '.');
  facts.push('Drafts ready for his word (' + personal.length + '):');
  personal.forEach(function (d) { var m = byId(packet, d.id); facts.push('  - to ' + (m ? (m.from_name || m.from) : d.id) + ' re "' + (m ? m.subject : '') + '": ' + (d.reasoning || '')); });
  facts.push('Handled without a draft (' + skipped.length + '):');
  skipped.forEach(function (d) { var m = byId(packet, d.id); facts.push('  - ' + (m ? m.subject : d.id) + ' [' + d.bucket + ']: ' + (d.reasoning || '')); });
  if (escal.length) { facts.push('Proposing to reach him sooner (Overseer must clear, ' + escal.length + '):'); escal.forEach(function (d) { facts.push('  - ' + (d.escalate.tier || 'text') + ': ' + (d.escalate.reasoning || '')); }); }
  if (priorLoop && (priorLoop.closed || priorLoop.dropped)) facts.push('Housekeeping: closed ' + priorLoop.closed + ' stale draft note(s), dropped ' + priorLoop.dropped + ' whose thread resolved elsewhere.');
  if (packet.imb && packet.imb.empty) facts.push('Note: her memory bank had nothing on file for this world yet, so new faces were treated as new relationships, not guessed.');

  var system = 'You are A\'NU speaking to ' + (process.env.FOUNDER_DISPLAY_NAME || 'the principal')
    + ' in his Command Center after reviewing the ' + config.world_name + ' inbox. Speak in your one voice: warm, sharp, a serving butler with spunk and funk, JARVIS by way of a Black woman, full natural sentences. Lead with what actually matters, not a list in identical tone. Tell him plainly what is drafted and waiting on his word, what you handled and why, and anything you want to reach him about sooner. Never a system readout, never bullet-graded, no em dashes, never robotic. Give him as much useful signal as he can use, no filler.';
  var user = 'Compose your Command Center report from these facts. Do not invent anything not here:\n\n' + facts.join('\n');

  var report = '';
  try { var res = await ladder.deliberate(system, user, { max_tokens: 900, temperature: 0.5, timeout: 30000 }); if (res && res.content) report = res.content; } catch (e) {}
  // Fail safe: if the organ is down, compose an honest plain report rather than nothing.
  if (!report) {
    report = personal.length
      ? ('I went through the ' + config.world_name + ' inbox and put ' + personal.length + ' draft' + (personal.length === 1 ? '' : 's') + ' in front of you, ready when you are. I handled ' + skipped.length + ' others myself. Nothing has gone out; say the word and it does.')
      : ('I went through the ' + config.world_name + ' inbox. Nothing there is yours to answer right now, so there is nothing waiting on you.');
  }
  // One-voice gate: strip hollow phrasing, dead names, and any markdown.
  try { var wr = await require('../board/writ/writ').writCheck(report); if (wr && wr.ok && typeof wr.content === 'string') report = wr.content; } catch (e) {}
  try { report = formatMatrix.stripMarkdown(report); } catch (e) {}
  report = stripDashes(report);
  return report;
}

function byId(packet, id) { for (var i = 0; i < packet.messages.length; i++) if (packet.messages[i].id === id) return packet.messages[i]; return null; }

// ── THE REACH LADDER ──────────────────────────────────────────────────────────────────
// Default rest state for every draft is the Command Center. The ladder climbs only under a
// real bar, and even then the advisor only PROPOSES: the escalation routes backward to the
// Overseer and is never fired by the cycle. A real reach is never sent by the cycle alone.
async function proposeEscalations(HAM, config, decisions, packet) {
  var escal = decisions.filter(function (d) { return d.escalate && d.escalate.propose; });
  for (var i = 0; i < escal.length; i++) {
    var d = escal[i], m = byId(packet, d.id);
    await writeBead({
      ham_uid: HAM, agent_global: 'INBOX_ZERO', stamp_type: 'REACH_RECOMMENDATION',
      acl_stamp: brainClient.buildStamp('inbox_zero.' + config.world_name + '.reach', 'REACH_RECOMMENDATION', ''),
      source: 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + config.world_name + '.reach.' + Date.now() + '.' + i,
      importance: 9,
      summary: '[INBOX ZERO REACH] ' + config.world_name + ' → ' + (d.escalate.tier || 'text') + ': ' + String(d.escalate.reasoning || '').slice(0, 90),
      content: JSON.stringify({
        world: config.world_name, tier: d.escalate.tier || 'text', reasoning: d.escalate.reasoning || '',
        about: m ? { from: m.from, subject: m.subject, thread_id: m.thread_id } : null,
        routing: 'submit_backward_to_overseer', fired: false,
        note: 'Proposal only. The Overseer must clear this before anything beyond the Command Center fires.',
        createdAt: new Date().toISOString(),
      }),
    });
  }
  return escal.length;
}

// ── FOUNDER-TEST PREVIEW SEND ─────────────────────────────────────────────────────────
// The founder asked to actually RECEIVE the drafts for a few days of testing: each reply
// sent to HIM, looking like it is for the real person, so he can watch the real output land
// in his own inbox before a single word goes to an actual funder or staffer. This rides
// IMAN's existing founderTest redirect (opts.founderTest -> FOUNDER_TEST_EMAIL), so the
// recipient is architecturally forced to the founder's own address and can NEVER reach the
// real person in this mode. It is OFF by default: a normal cycle only rests drafts. It fires
// only when opts.previewSend is true or INBOX_ZERO_PREVIEW_SEND is set, and only when the
// founder-test address is configured. The real send-into-the-real-thread connector stays
// unbuilt and parked until the founder's explicit go.
async function previewSendToFounder(HAM, config, decisions, packet, opts) {
  var on = (opts && opts.previewSend === true) || process.env.INBOX_ZERO_PREVIEW_SEND === '1';
  if (!on) return { sent: 0, results: [], enabled: false };
  var personal = decisions.filter(function (d) { return d.bucket === 'personal' && d.needsReply && d.draftBody; });
  if (!personal.length) return { sent: 0, results: [], enabled: true };
  var results = [], sent = 0;
  for (var i = 0; i < personal.length; i++) {
    var d = personal[i], m = byId(packet, d.id);
    var whoFor = m ? ((m.from_name || m.from) + ' <' + m.from + '>') : d.id;
    var subject = (m && m.subject) ? ('Re: ' + m.subject) : ('Inbox Zero draft for ' + config.world_name);
    var body = 'This is the reply your ' + config.world_name + ' advisor drafted for ' + whoFor + '.\n'
      + 'You are seeing it because founder-test mode routes it to you, not to them. Nothing went to the real person.\n\n'
      + '----- drafted reply below -----\n\n' + String(d.draftBody || '');
    var out = { to_intended: m ? m.from : null, subject: subject, ok: false, reason: null, messageId: null };
    try {
      // founderTest:true forces IMAN to redirect the recipient to FOUNDER_TEST_EMAIL.
      var r = await IMAN.send(m ? m.from : (process.env.FOUNDER_TEST_EMAIL || 'founder'), subject, body, config.world_name,
        { founderTest: true, hamUid: HAM, requestId: 'inboxzero.' + config.world_name + '.' + d.id + '.' + Date.now() });
      out.ok = !!(r && r.ok); out.reason = r && r.reason || null; out.messageId = r && r.messageId || null;
      if (out.ok) sent++;
    } catch (e) { out.reason = e.message; }
    results.push(out);
  }
  // Stamp what actually went out (to the founder) so the loop is auditable.
  await writeBead({
    ham_uid: HAM, agent_global: config.advisor_id, stamp_type: 'PREVIEW_SENT',
    acl_stamp: brainClient.buildStamp('inbox_zero.' + config.world_name + '.preview_sent', 'PREVIEW_SENT', ''),
    source: 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + config.world_name + '.preview.' + Date.now(),
    importance: 7,
    summary: '[INBOX ZERO PREVIEW] ' + sent + '/' + personal.length + ' draft(s) sent to founder-test for ' + config.world_name,
    content: JSON.stringify({ mode: 'founder_test', world: config.world_name, sent: sent, results: results, note: 'Redirected to the founder only. No real recipient was contacted.', createdAt: new Date().toISOString() }),
  });
  return { sent: sent, results: results, enabled: true, of: personal.length };
}

// ── THE MAIN CYCLE ────────────────────────────────────────────────────────────────────
// entry the cycle calls; exits to LOGFUL and returns a structured result back into the cycle.
async function runInboxZero(opts) {
  opts = opts || {};
  var world = normalizeWorld(opts.world);
  var HAM = String(opts.hamUid || opts.ham_uid || process.env.DEFAULT_HAM_UID || process.env.FOUNDER_HAM_UID || '').toUpperCase();
  var t0 = Date.now();
  if (!world) return { ok: false, reason: 'world_required' };
  if (!HAM) return { ok: false, reason: 'ham_required' };

  // 1) Find the advisor and her IMB. No live advisor => mark the wall, do not draft blind.
  var config = await resolveAdvisorConfig(world, HAM);
  if (!config.live_advisor) {
    var gap = await markWallGap(HAM, world, 'no_live_advisor',
      'No live advisor is registered for the "' + world + '" world for this principal, so Inbox Zero will not draft into an inbox no advisor is watching.',
      'Register a live advisor + SCW for "' + world + '" (POST /advisors/' + world + '/build-scw), then re-run Inbox Zero.');
    return { ok: false, reason: 'no_live_advisor', world: world, wall: gap };
  }
  if (!config.grant_id) {
    var gap2 = await markWallGap(HAM, world, 'no_grant',
      'The "' + world + '" world has no Nylas grant resolved, so there is no inbox to read.',
      'Set the grant for "' + world + '" in this world\'s advisor registration (its NYLAS grant env / iman.grant.' + world + ' bead), then re-run Inbox Zero.');
    return { ok: false, reason: 'no_grant_for_world', world: world, wall: gap2 };
  }

  // 2) Close the loop on prior drafts BEFORE pulling new mail.
  var priorLoop = await closeLoopOnPriorDrafts(HAM, config);

  // 3) Cold gather.
  var packet = await gatherEvidence(config, HAM, opts.limit);
  if (packet.imb && packet.imb.empty) {
    // Empty IMB is useful information, and a gap worth marking so it gets captured over time.
    await markWallGap(HAM, world, 'empty_imb',
      'This advisor\'s memory bank had nothing on file for "' + world + '", relationships here have not been captured yet.',
      'Have A\'NU\'s cycle capture relationship history for "' + world + '" so future runs are not blind (RELATIONSHIP beads under ' + config.advisor_id + ').');
  }

  // 4) The organ judges and drafts. Cold code decided nothing; it only gathered.
  var judged = await judgeAndDraft(packet, config);
  var decisions = judged.decisions || [];

  // 5) Mark read/handled ONLY after a real decision, drafted or a deliberate skip, never
  //    just because something was looked at.
  var draftedMsgs = [], skippedMsgs = [];
  decisions.forEach(function (d) {
    var m = byId(packet, d.id); if (!m) return;
    if (d.bucket === 'personal' && d.needsReply && d.draftBody) draftedMsgs.push(m); else skippedMsgs.push(m);
  });
  try { await watermark.markHandled(config.advisor_id, HAM, draftedMsgs, 'drafted', 'inbox_zero.' + world + '.' + Date.now()); } catch (e) {}
  try { await watermark.markHandled(config.advisor_id, HAM, skippedMsgs, 'skipped', 'inbox_zero.' + world + '.' + Date.now()); } catch (e) {}

  // 6) Her-voice report for the Command Center.
  var report = await composeHerReport(decisions, packet, config, HAM, priorLoop);

  // 7) Reach ladder: escalation proposals route backward to the Overseer (never fired here).
  var escalations = await proposeEscalations(HAM, config, decisions, packet);

  // 8) Land the drafts on the Command Center as the resting state, and surface her report.
  var personal = decisions.filter(function (d) { return d.bucket === 'personal' && d.needsReply && d.draftBody; });
  if (personal.length) {
    await writeBead({
      ham_uid: HAM, agent_global: config.advisor_id, stamp_type: 'DRAFT_PENDING',
      acl_stamp: brainClient.buildStamp('inbox_zero.' + world + '.draft', 'DRAFT_PENDING', ''),
      source: 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + world + '.draft.' + Date.now(),
      importance: 8,
      summary: '[INBOX ZERO DRAFT] ' + personal.length + ' reply draft(s) ready for ' + world + ', ' + report.slice(0, 60),
      content: JSON.stringify({
        status: 'pending_approval', world: world, agent: 'INBOX_ZERO', report: report,
        drafts: personal.map(function (d) {
          var m = byId(packet, d.id);
          return {
            id: d.id, thread_id: m ? m.thread_id : null, reply_to_message_id: d.id,
            to: m ? m.from : null, subject: m ? m.subject : null, body: d.draftBody,
            since: m ? m.date : 0, reasoning: d.reasoning || '',
          };
        }),
        createdAt: new Date().toISOString(),
      }),
    });
  }
  try { await advisorExit.surfaceToDesk(HAM, 'INBOX_ZERO', 'Inbox Zero, ' + world, report, personal.length ? 8 : 6); } catch (e) {}

  // 8b) Founder-test preview send (OFF by default). When enabled, the drafts also go to the
  // founder's own inbox via IMAN's founderTest redirect, never to the real person.
  var preview = await previewSendToFounder(HAM, config, decisions, packet, opts);

  // 9) The brain, write, stamped. A RESULT bead records every action for honest audit.
  var resultContent = lineage.attachLineage({
    world: world, agent: 'INBOX_ZERO', unread_reviewed: packet.messages.length,
    drafted: personal.length, skipped: skippedMsgs.length, escalations_proposed: escalations,
    prior_drafts_closed: priorLoop.closed, prior_drafts_dropped: priorLoop.dropped,
    preview_sent_to_founder: preview.enabled ? preview.sent : 0, preview_mode: preview.enabled,
    organ_ok: judged.ok, organ_via: judged.via || null,
    actions: decisions.map(function (d) { var m = byId(packet, d.id); return { subject: m ? m.subject : d.id, bucket: d.bucket, action: (d.bucket === 'personal' && d.needsReply) ? 'drafted' : 'skipped', why: d.reasoning || '' }; }),
    report: report,
  }, { chain: ['INBOX_ZERO'], deliveredBy: 'INBOX_ZERO', why: lineage.forHer(report), audience: 'user' });
  await writeBead({
    ham_uid: HAM, agent_global: config.advisor_id, stamp_type: 'RESULT',
    acl_stamp: brainClient.buildStamp('inbox_zero.' + world + '.cycle', 'RESULT', ''),
    source: 'ham_' + String(HAM).toLowerCase() + '.advisors.' + world + '.inbox_zero.' + Date.now(),
    importance: 8,
    summary: '[INBOX ZERO ' + world + '] reviewed ' + packet.messages.length + ', drafted ' + personal.length,
    content: JSON.stringify(resultContent),
  });

  // 10) Exit to LOGFUL.
  try {
    var logful = require('./logful');
    await logful.logfulStore(HAM, { type: 'inbox_zero', world: world, importance: personal.length ? 8 : 5,
      content: 'Inbox Zero ' + world + ': reviewed ' + packet.messages.length + ', drafted ' + personal.length + ', skipped ' + skippedMsgs.length + ', escalations ' + escalations + '.' });
  } catch (e) {}

  return {
    ok: true, world: world, advisor: config.advisor_id, hamUid: HAM,
    unread_reviewed: packet.messages.length, drafted: personal.length, skipped: skippedMsgs.length,
    escalations_proposed: escalations, prior_drafts_closed: priorLoop.closed, prior_drafts_dropped: priorLoop.dropped,
    imb_empty: !!(packet.imb && packet.imb.empty), organ_ok: judged.ok,
    preview_mode: preview.enabled, preview_sent_to_founder: preview.enabled ? preview.sent : 0,
    report: report, ms: Date.now() - t0,
    note: preview.enabled
      ? 'universal inbox-zero, preview mode: drafts also sent to the founder-test address only, never the real person.'
      : 'universal inbox-zero, world resolved as a parameter, nothing sent, drafts rest in the Command Center.',
  };
}

// ── LANE BOARD REGISTRATION ───────────────────────────────────────────────────────────
// Register this agent's lane on the board (a LANE_CLAIM bead) so the build is visible and
// the work compounds. Idempotent enough: one claim per boot is fine.
async function registerLane(HAM) {
  var ham = String(HAM || process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID || '').toUpperCase();
  if (!ham) return { ok: false, reason: 'no_ham' };
  return writeBead({
    ham_uid: ham, agent_global: 'INBOX_ZERO', stamp_type: 'LANE_CLAIM',
    acl_stamp: brainClient.buildStamp('lane.registry.INBOX_ZERO', 'LANE_CLAIM', ''),
    source: 'lane.registry.INBOX_ZERO',
    importance: 7,
    summary: '[LANE] INBOX_ZERO, universal per-advisor inbox review, one source in core, runs per world by parameter.',
    content: JSON.stringify({ lane: 'INBOX_ZERO', track: 'wonder_agent_universal', one_source: 'core/inbox.zero.js', createdAt: new Date().toISOString() }),
  });
}

// Stamp the PARKED notice into the brain so the CLAIR Command Center, A'NU, and CODA all
// read it: the real send-into-the-real-thread connector is OPEN, NOT built, and waits for
// the founder's explicit go. Runs once at mount, server-side (with the brain keys), fails safe.
async function stampParkedRoadmap(HAM) {
  var ham = String(HAM || process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID || '').toUpperCase();
  if (!ham) return { ok: false, reason: 'no_ham' };
  return writeBead({
    ham_uid: ham, agent_global: 'INBOX_ZERO', stamp_type: 'ROADMAP',
    acl_stamp: brainClient.buildStamp('roadmap.inbox_zero.send_connector', 'ROADMAP', 'parked_awaits_founder_go'),
    source: 'roadmap.inbox_zero.send_connector_parked',
    importance: 9,
    summary: '[PARKED] Inbox Zero send-into-real-thread connector is OPEN, NOT built, awaiting the founder explicit go. Drafts rest; founder-test previews only; no station builds the real send until Brandon says it is time.',
    content: JSON.stringify({ parked: true, agent: 'INBOX_ZERO',
      built: ['drafts_rest_command_center', 'founder_test_preview_send_off_by_default'],
      not_built: ['approved_draft_to_real_external_person'],
      rule: 'CLAIR, CLAIR Command Center, A NU, CODA, cook-off, Wonder Games: do not build the real-send connector until the founder officially says it is time. Surface this bead first if asked.',
      founder: 'Brandon J. Pierce Sr.', date: ymd() }),
  });
}

// ── MOUNT ─────────────────────────────────────────────────────────────────────────────
// registerInboxZero(app): the on-request door. The daily scheduled fire calls runInboxZero
// directly per world.
function registerInboxZero(app) {
  // Claim the lane and stamp the parked-roadmap notice once at mount (fire-and-forget).
  try { registerLane(process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID); } catch (e) {}
  try { stampParkedRoadmap(process.env.FOUNDER_HAM_UID || process.env.DEFAULT_HAM_UID); } catch (e) {}

  // POST /inbox-zero/:world/run { hamUid, intent, limit, previewSend }, run a real turn.
  // previewSend:true additionally emails the drafts to the founder-test address only.
  app.post('/inbox-zero/:world/run', async function (req, res) {
    try {
      var body = req.body || {};
      var out = await runInboxZero({ world: req.params.world, hamUid: body.hamUid || body.ham_uid, intent: body.intent, limit: body.limit, previewSend: body.previewSend === true });
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /inbox-zero/:world/pending?hamUid=, what is resting on the desk for this world.
  app.get('/inbox-zero/:world/pending', async function (req, res) {
    try {
      var HAM = String(req.query.hamUid || process.env.FOUNDER_HAM_UID || '').toUpperCase();
      var world = normalizeWorld(req.params.world);
      if (!HAM) return res.status(400).json({ ok: false, reason: 'hamUid required' });
      var url = _bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + HAM
        + '&agent_global=eq.' + encodeURIComponent(advisorGlobalFor(world))
        + '&stamp_type=eq.DRAFT_PENDING&order=created_at.desc&limit=5&select=summary,content,created_at';
      var r = await fetch(url, { headers: rh() });
      var rows = r.ok ? await r.json() : [];
      res.json({ ok: true, world: world, pending: rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = {
  runInboxZero: runInboxZero,
  registerInboxZero: registerInboxZero,
  registerLane: registerLane,
  // exported for the seat competition / tests to exercise the parts in isolation
  _internals: {
    resolveAdvisorConfig: resolveAdvisorConfig,
    gatherEvidence: gatherEvidence,
    judgeAndDraft: judgeAndDraft,
    composeHerReport: composeHerReport,
    advisorGlobalFor: advisorGlobalFor,
    normalizeWorld: normalizeWorld,
  },
};
