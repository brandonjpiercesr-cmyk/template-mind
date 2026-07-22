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
var publicTurn   = require('./pai.public.finalizer'); // the one real exit: council + WRIT + meta_commentary + synthesize
// Per-world deep intelligence (SCW facts + CORE_DIRECTIVE), firewalled. Defensive require so a
// mirror that carries only core/ (no agents/) degrades gracefully to no-SCW instead of breaking.
var advisorSCW; try { advisorSCW = require('../agents/advisor_scw'); }
catch (e) { advisorSCW = { readWorldSCWText: async function () { return { hasScw: false, coreDirective: null, facts: [] }; } }; }
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
    signature: resolveSignature(w, grantInfo, sendAs),
    imb_source_tag: advisorGlobalFor(w),   // scope every IMB search to her own tag
    roster: roster,
  };
}

// THE SIGNATURE. Nylas does not append the mailbox signature through the create-draft API,
// so the draft the principal opens would land bare without this. The block is resolved per
// world at run time, never hardcoded here (the 847392 test holds for signatures too): an
// explicit per-world override wins, else the grant's own from-name and address, else the
// founder's configured display name. A world with nothing configured gets no invented block.
function resolveSignature(world, grantInfo, sendAs) {
  var W = String(world || '').toUpperCase();
  var override = String(process.env['INBOX_ZERO_SIGNATURE_' + W] || process.env['NYLAS_' + W + '_SIGNATURE'] || '').trim();
  if (override) return override.replace(/\\n/g, '\n');   // env-escaped newlines become real ones
  var name  = (grantInfo && (grantInfo.fromName || grantInfo.display_name)) || process.env['NYLAS_' + W + '_FROM_NAME'] || process.env.FOUNDER_DISPLAY_NAME || '';
  var email = sendAs || (grantInfo && grantInfo.from) || '';
  var phone = String(process.env['INBOX_ZERO_SIGNOFF_PHONE_' + W] || process.env.FOUNDER_PHONE || '').trim();
  var lines = [];
  if (name)  lines.push(name);
  var contact = [email, phone].filter(Boolean).join('  |  ');
  if (contact) lines.push(contact);
  return lines.length ? lines.join('\n') : '';   // nothing configured => no block, never guessed
}

// Attach the signature to a finished draft body, once, after all voice processing. Idempotent:
// if the composed body already ends with the exact block, it is not doubled.
function withSignature(body, signature) {
  var b = String(body || '').replace(/\s+$/, '');
  var sig = String(signature || '').trim();
  if (!sig) return b;
  if (b.indexOf(sig) !== -1 && b.slice(-sig.length - 4).indexOf(sig) !== -1) return b; // already present at the tail
  return b + '\n\n' + sig;
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

// ── CLOSE THE LOOP ON PROPOSED REACHES ────────────────────────────────────────────────
// A wonder does not fire and forget its escalations either. Each run it looks back at its
// own recent REACH_RECOMMENDATIONs and checks whether the reach cycle's deliberating mind
// has ruled on them yet (the reach cycle stamps RECOMMENDATION_RULED at source
// anew.ruled.<rec.source>). Ruled ones are closed in the report; still-pending ones are
// noted so a priority-one never silently evaporates between the proposal and the decision.
async function closeLoopOnEscalations(HAM, config) {
  var out = { proposed: 0, ruled: 0, pending: 0, verdicts: [] };
  try {
    if (!_bu() || !_bk()) return out;
    var prefix = 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + config.world_name + '.reach.';
    var url = _bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + String(HAM).toUpperCase()
      + '&stamp_type=eq.REACH_RECOMMENDATION&source=like.' + encodeURIComponent(prefix) + '*'
      + '&order=created_at.desc&limit=10&select=source,summary,created_at';
    var r = await fetch(url, { headers: rh(), signal: AbortSignal.timeout(9000) });
    var recs = r.ok ? await r.json() : [];
    out.proposed = (recs || []).length;
    for (var i = 0; i < (recs || []).length; i++) {
      var ruledUrl = _bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.RECOMMENDATION_RULED&source=eq.'
        + encodeURIComponent('anew.ruled.' + recs[i].source) + '&limit=1&select=content';
      var rr = await fetch(ruledUrl, { headers: rh(), signal: AbortSignal.timeout(8000) })
        .then(function (x) { return x.ok ? x.json() : []; }).catch(function () { return []; });
      if (rr && rr.length) {
        out.ruled++;
        var verdict = null; try { verdict = JSON.parse(rr[0].content || '{}').verdict; } catch (e) {}
        out.verdicts.push({ about: String(recs[i].summary || '').slice(0, 90), verdict: verdict || 'ruled' });
      } else { out.pending++; }
    }
  } catch (e) {}
  return out;
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

  // Own IMB first (brief relationship summaries).
  out.imb = await readAdvisorIMB(config, HAM);
  // The deep SCW: the world's verified intelligence (team, writing law, live open items) and
  // its CORE_DIRECTIVE north star. Firewalled to this world. This is what makes a draft RIGHT,
  // not just clean. Resolved from the brain per world, never hardcoded (the 847392 test holds).
  try { out.scw = await advisorSCW.readWorldSCWText(world, HAM); }
  catch (e) { out.scw = { hasScw: false, coreDirective: null, facts: [] }; }

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
  // The deep SCW: verified world knowledge the judgment must honor (writing law, team, live
  // open items). Only real, seeded facts, never invented. If empty, say so, do not guess.
  var scw = packet.scw || { hasScw: false, coreDirective: null, facts: [] };
  var scwBlock = scw.hasScw
    ? ('YOUR VERIFIED WORLD KNOWLEDGE (honor it exactly, it is real and checked; never contradict or invent past it):\n'
        + (scw.coreDirective ? ('NORTH STAR: ' + scw.coreDirective + '\n') : '')
        + scw.facts.map(function (f, i) { return '- ' + f; }).join('\n'))
    : 'YOUR VERIFIED WORLD KNOWLEDGE: none seeded for this world yet, so treat relationships and history as uncaptured, do not invent them.';

  var system = 'You are the judgment organ of the Inbox Zero cycle for the "' + config.world_name
    + '" world. You serve ' + (process.env.FOUNDER_DISPLAY_NAME || 'the principal') + '. EBC FIREWALL: you have zero access to any other world; never name another client or organization.\n'
    + 'Decide, for EACH email, exactly one bucket: personal (owed a real reply), blast (looks personal but went wide, do not answer warmly), not_mine (a named staffer already owns it, principal only CC\'d), automated (no human to write back to), calendar (resolves on accept/decline), or resolved (already answered).\n'
    + 'RULES: Check the full To/CC before calling anything personal. If a named person is already corresponding, it is not the principal\'s to answer. Open attachments before referencing them; if something was referenced but never attached, say so plainly. Flag anything older than two days before drafting. NEVER fabricate a person, update, meeting, or trip not present in the evidence. Use IMB history only when it is real, sourced as what it is.\n'
    + 'You TRIAGE here; you do NOT write the reply. For bucket=personal, a separate full deliberation (his own window cycle, with council and WRIT and meta commentary) composes the actual draft in his voice afterward. Your job is to decide the bucket and to write a plain "intent" of what a reply owes: what he needs to say back, any real fact from the thread it must turn on, and the tone. Do not compose the email itself. Everything downstream is DRAFT ONLY; nothing sends without his explicit word.\n'
    + 'THE REACH LADDER. The default resting place for everything is the Command Center, where a draft waits for him on his own time. Almost every email stays there. You raise the ladder ONLY for a genuine priority one: a real deadline inside the next few hours that a resting draft would blow past, or content that signals real risk if he does not see it until he happens to check in. When that bar is truly met, set escalate.propose=true, name the tier you would suggest (text | email | call) and write two sentences of reasoning that give the evidence: what the deadline or risk is, and why it cannot wait for the Command Center. You are only PROPOSING. You never send, you never reach him yourself, and the tier is a suggestion, not a decision: a separate deliberating mind (the reach cycle, Overseer-cleared) reads your reasoning and decides the real channel, or overrules you entirely. If in doubt, leave it on the Command Center and do not propose.\n'
    + 'Return STRICT JSON only: {"decisions":[{"id":"<email id>","bucket":"...","needsReply":true|false,"intent":"<for personal: what the reply owes, one or two sentences; else empty>","escalate":{"propose":false,"tier":null,"reasoning":""},"reasoning":"<why, one or two sentences>"}]}';

  var user = scwBlock + '\n\n' + imbLine + '\n\nCALENDAR (this world only):\n' + (packet.calendar || '(none)') + '\n\nUNREAD MAIL:\n' + lines.join('\n')
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
    if (d.bucket !== 'personal') { d.needsReply = false; d.intent = ''; } // only personal owes a reply
    d.draftBody = '';   // the triage organ never composes the body; the window cycle fills this
    return d;
  }).filter(Boolean);
}

// Compact single-email evidence for the composing cycle: the same facts the triage saw,
// scoped to one thread, so the window cycle drafts from the real material and nothing else.
function buildOneEmailEvidence(m, config) {
  var lines = [];
  lines.push('World (this world only, EBC firewall): ' + config.world_name);
  lines.push('From: ' + (m.from_name ? (m.from_name + ' <' + m.from + '>') : m.from));
  lines.push('Subject: ' + m.subject);
  if (m.already_replied) lines.push('Note: the principal has already replied on this thread before.');
  lines.push('Thread (' + (m.thread || []).length + ' msgs, chronological):');
  (m.thread || []).forEach(function (t) { lines.push('  - ' + (t.from || '?') + ': ' + (t.snippet || t.body || '').slice(0, 400)); });
  if (!m.thread || !m.thread.length) lines.push('  (no thread history) snippet: ' + m.snippet);
  (m.attachment_text || []).forEach(function (at) { lines.push('  attachment "' + at.filename + '": ' + (at.text ? at.text.slice(0, 600) : (at.note || 'unreadable'))); });
  return lines.join('\n');
}

// THE DRAFT, THROUGH THE REAL TURN. A reply the principal may send to a real person is
// human-facing output, so it is NOT written by the triage organ. It runs the entire window
// cycle (finalizePublicTurn: council + WRIT + meta commentary + synthesize), the same exit
// every other public A'NU turn takes. If the cycle cannot run, there is no draft, we do not
// fall back to a lightweight shortcut. The signature is attached last, after all voice work.
async function composeDraftViaCycle(HAM, config, d, m, scw) {
  if (!m) return '';
  scw = scw || { hasScw: false, coreDirective: null, facts: [] };
  var scwBlock = scw.hasScw
    ? ('\n\nYOUR VERIFIED WORLD KNOWLEDGE (honor it exactly, including the writing law for who is addressed how; it is real and checked, never contradict or invent past it):\n'
        + (scw.coreDirective ? ('NORTH STAR: ' + scw.coreDirective + '\n') : '')
        + scw.facts.map(function (f) { return '- ' + f; }).join('\n'))
    : '';
  var evidence = buildOneEmailEvidence(m, config)
    + scwBlock
    + '\n\nWhat this reply owes (from triage): ' + (d.intent || d.reasoning || 'a genuine, useful reply in his own voice.')
    + '\n\nCompose ONLY the reply body he would send, in his own voice, following the world writing law above exactly (correct greeting for this exact person, correct sign-off): no em dashes, no dropped subjects, no robotic parallel structure, no forced call-to-action ending, ending on the last real thought. Do not invent a person, meeting, update, or fact not present above. Do not add a signature line; that is attached separately. Draft only, nothing sends.';
  var question = 'Draft my reply to this ' + config.world_name + ' email from ' + (m.from_name || m.from) + ' about "' + m.subject + '".';
  var out = null;
  try {
    out = await publicTurn.finalizePublicTurn({
      hamUid: HAM,
      question: question,
      deliberationInput: evidence,
      channel: 'inbox_zero',
      world: config.world_name,
      councilContext: { surface: 'inbox_zero_draft', world: config.world_name, reply_to: (m.from || null) }
    });
  } catch (e) { out = null; }
  if (!out || !out.ok || typeof out.answer !== 'string' || !out.answer.trim()) return '';
  var body = out.answer;
  // ⬡B:core.inbox_zero:GUARD:no_day_fusion_dump_as_a_reply_body:20260722⬡ 911, caught in the
  // real Drafts folder: a schedule-flavored email (the "Big Lake gathering" thread) drove the
  // compose turn's runPAI down the day/schedule path, and the answer came back as the founder's
  // own day-fusion context dump ("What I found for right now: answer_this_first_for_day_or_
  // schedule : WORLD CONTEXT ...") instead of a composed reply. That is internal scaffolding,
  // never a sendable email. A draft is human-facing output: a bad draft beats no draft is FALSE
  // here (the file's own law), so if the cycle handed back a fusion/context dump we treat it as
  // a failed compose and write NO draft rather than land machinery in his mailbox.
  var _leak = /answer_this_first_for_day_or_schedule|^what i found for right now|world context, as of|recency_instruction/i;
  if (_leak.test(body)) { d.cycleFailed = true; return ''; }
  try { body = formatMatrix.stripMarkdown(body); } catch (e) {}
  body = stripDashes(body);                       // belt to the cycle's own WRIT suspenders
  body = withSignature(body, config.signature);   // the Nylas signature the API will not add itself
  d.cycleId = out.cycleId || null;                // carry the proof the real turn ran
  return body;
}

async function judgeAndDraft(packet, config, HAM) {
  if (!packet.messages.length) return { ok: true, decisions: [] };
  var p = buildJudgmentPrompt(packet, config);
  var res = null;
  // The TRIAGE is a single cold classification into a closed bucket set (routing, not prose):
  // that stays an organ call. The human-facing draft below does NOT; it runs the full cycle.
  try { res = await ladder.deliberate(p.system, p.user, { max_tokens: 2000, temperature: 0.2, json: true, timeout: 45000 }); } catch (e) {}
  if (!res || !res.content) return { ok: false, reason: 'organ_unavailable', decisions: [] };
  var parsed = null;
  try { parsed = typeof res.content === 'string' ? JSON.parse(res.content) : res.content; } catch (e) { return { ok: false, reason: 'organ_bad_json', decisions: [] }; }
  var decisions = enforceDecisions((parsed && parsed.decisions) || []);
  // Every owed reply is composed through its own full window cycle. No shortcut path.
  var composed = 0, cycleFailed = 0;
  for (var i = 0; i < decisions.length; i++) {
    var d = decisions[i];
    if (d && d.bucket === 'personal' && d.needsReply) {
      var m = byId(packet, d.id);
      var body = await composeDraftViaCycle(HAM, config, d, m, packet.scw);
      if (body) { d.draftBody = body; composed++; }
      else { d.draftBody = ''; d.reasoning = '[draft deferred: window cycle unavailable, no shortcut taken] ' + (d.reasoning || ''); cycleFailed++; }
    }
  }
  return { ok: true, decisions: decisions, via: 'window_cycle', triage_via: res.via || res.model || 'ladder', composed: composed, cycle_failed: cycleFailed };
}

// ── THE VOICE LAYER: HER REPORT ───────────────────────────────────────────────────────
// The report the advisor gives the principal in the Command Center is written in HER voice,
// not his: A'NU, JARVIS from Iron Man but a Black woman, a serving butler with spunk and
// funk, full natural sentences, matters-first, never a system readout, never a grading
// sheet listing twelve items in identical tone. She tells him what actually matters first.
async function composeHerReport(decisions, packet, config, HAM, priorLoop, reachLoop) {
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
  if (reachLoop && reachLoop.proposed) {
    if (reachLoop.ruled) facts.push('Earlier reach proposals the Overseer\'s reach cycle has now ruled on (' + reachLoop.ruled + '): ' + reachLoop.verdicts.map(function (v) { return v.about + ' -> ' + v.verdict; }).join('; '));
    if (reachLoop.pending) facts.push('Reach proposals still waiting on the Overseer\'s decision: ' + reachLoop.pending + '. Not dropped, still pending.');
  }
  if (packet.imb && packet.imb.empty) facts.push('Note: her memory bank had nothing on file for this world yet, so new faces were treated as new relationships, not guessed.');
  // Cook toward the directive: give her the north star and the live open items so she can
  // connect what came through the inbox to the standing work, and surface anything owed.
  var scw = packet.scw || {};
  if (scw.coreDirective) facts.push('Your standing directive for this world: ' + scw.coreDirective);
  if (scw.hasScw && scw.facts && scw.facts.length) {
    var openItems = scw.facts.filter(function (f) { return /OPEN ITEM|OVERDUE|URGENT|open,|still open|unanswered|not found in the inbox/i.test(f); });
    if (openItems.length) facts.push('Live open work you are carrying (surface anything a reviewed email touches, and flag anything time-sensitive): ' + openItems.map(function (f) { return f.slice(0, 220); }).join('  ||  '));
  }

  var question = 'Give me your Command Center report on the ' + config.world_name + ' inbox.';
  var deliberationInput = 'Speak to ' + (process.env.FOUNDER_DISPLAY_NAME || 'the principal')
    + ' in your one voice after reviewing the ' + config.world_name + ' inbox: lead with what actually matters, tell him plainly what is drafted and waiting on his word, what you handled and why, and anything you want to reach him about sooner. Full natural sentences, never a system readout, never bullet-graded, no em dashes. Do not invent anything not in these facts:\n\n' + facts.join('\n');

  // Her report to the principal is human-facing, so it runs the full window cycle too, the
  // same exit every public A'NU turn takes (council, WRIT, meta commentary, synthesize).
  var report = '';
  try {
    var turn = await publicTurn.finalizePublicTurn({
      hamUid: HAM, question: question, deliberationInput: deliberationInput,
      channel: 'inbox_zero', world: config.world_name,
      councilContext: { surface: 'inbox_zero_report', world: config.world_name }
    });
    if (turn && turn.ok && typeof turn.answer === 'string') report = turn.answer;
  } catch (e) {}
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
// real bar, and even then the advisor only PROPOSES: the escalation is submitted BACKWARD
// as a REACH_RECOMMENDATION the reach cycle (outreach.js gatherReachRecommendations) reads,
// where a separate DELIBERATING MIND, Overseer-cleared, decides the real channel or overrules
// it, and only then a reach agent (text via CARA, call via VARA) touches the founder. This
// file never fires a reach and never picks the channel. It hands over the evidence and steps
// back. A real reach is never sent by the cycle alone, and the tier here is a suggestion only.
async function proposeEscalations(HAM, config, decisions, packet) {
  var escal = decisions.filter(function (d) { return d.escalate && d.escalate.propose; });
  for (var i = 0; i < escal.length; i++) {
    var d = escal[i], m = byId(packet, d.id);
    var ageHours = m && m.date ? Math.floor((Date.now() / 1000 - m.date) / 3600) : null;
    await writeBead({
      ham_uid: HAM, agent_global: 'INBOX_ZERO', stamp_type: 'REACH_RECOMMENDATION',
      acl_stamp: brainClient.buildStamp('inbox_zero.' + config.world_name + '.reach', 'REACH_RECOMMENDATION', ''),
      source: 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + config.world_name + '.reach.' + Date.now() + '.' + i,
      importance: 9,
      // The summary is the index label; the reach judge reads the content as the real evidence,
      // so carry the who / what / why-now the deliberating mind needs to rule on the channel.
      summary: '[INBOX ZERO REACH] ' + config.world_name + ', priority-one from '
        + (m ? (m.from_name || m.from) : '?') + ': ' + String(d.escalate.reasoning || '').slice(0, 90),
      content: JSON.stringify({
        world: config.world_name,
        suggested_tier: d.escalate.tier || null,   // a suggestion the reach mind may override or ignore
        channel_decision: 'deferred_to_reach_cycle_deliberating_mind',
        why_now: d.escalate.reasoning || '',
        evidence: m ? {
          from: m.from, from_name: m.from_name, subject: m.subject,
          snippet: (m.snippet || '').slice(0, 300), age_hours: ageHours,
          thread_id: m.thread_id, message_id: m.id
        } : null,
        routing: 'submit_backward_to_overseer', fired: false,
        note: 'Inbox Zero proposes only. The reach cycle, Overseer-cleared, decides the channel and whether to fire; nothing beyond the Command Center happens here.',
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

// ── SAVE TO THE MAILBOX'S DRAFTS FOLDER ───────────────────────────────────────────────
// The founder's own ask: he wants the owed replies sitting in his real Drafts folder, so
// he opens his mailbox and they are there, threaded to the original, ready to read, edit,
// and send himself. This saves each owed reply as a real Nylas draft (IMAN.createDraft),
// threaded via thread_id + reply_to_message_id, and DOES NOT SEND anything: a draft on
// the account is not outbound, nothing leaves the mailbox, the hard line holds. ON by
// default now (the founder was not seeing drafts in his own Drafts folder because this was
// gated off): every owed reply lands in the world's real Drafts folder. Turned off only by
// an explicit opts.saveToDrafts === false or INBOX_ZERO_SAVE_DRAFTS === '0'.
async function saveDraftsToMailbox(HAM, config, decisions, packet, opts) {
  var on = !(opts && opts.saveToDrafts === false) && process.env.INBOX_ZERO_SAVE_DRAFTS !== '0';
  if (!on) return { saved: 0, results: [], enabled: false };
  var personal = decisions.filter(function (d) { return d.bucket === 'personal' && d.needsReply && d.draftBody; });
  if (!personal.length) return { saved: 0, results: [], enabled: true };
  var results = [], saved = 0;
  for (var i = 0; i < personal.length; i++) {
    var d = personal[i], m = byId(packet, d.id);
    var subject = (m && m.subject) ? (/^re:/i.test(m.subject) ? m.subject : ('Re: ' + m.subject)) : ('Reply for ' + config.world_name);
    var out = { to: m ? m.from : null, subject: subject, ok: false, reason: null, draftId: null };
    try {
      var r = await IMAN.createDraft(config.world_name, {
        to: m ? m.from : null, subject: subject, body: String(d.draftBody || ''),
        thread_id: m ? m.thread_id : null, reply_to_message_id: d.id
      });
      out.ok = !!(r && r.ok); out.reason = r && r.reason || null; out.draftId = r && r.draftId || null;
      if (out.ok) saved++;
    } catch (e) { out.reason = e.message; }
    results.push(out);
  }
  // Stamp what actually landed in the mailbox so the loop is auditable, never a send.
  await writeBead({
    ham_uid: HAM, agent_global: config.advisor_id, stamp_type: 'DRAFTS_SAVED',
    acl_stamp: brainClient.buildStamp('inbox_zero.' + config.world_name + '.drafts_saved', 'DRAFTS_SAVED', ''),
    source: 'ham_' + String(HAM).toLowerCase() + '.inbox_zero.' + config.world_name + '.drafts_saved.' + Date.now(),
    importance: 7,
    summary: '[INBOX ZERO DRAFTS] ' + saved + '/' + personal.length + ' saved to the ' + config.world_name + ' Drafts folder, nothing sent',
    content: JSON.stringify({ mode: 'mailbox_drafts', world: config.world_name, saved: saved, results: results, note: 'Real drafts in the mailbox Drafts folder, threaded to the original. Nothing was sent.', createdAt: new Date().toISOString() }),
  });
  return { saved: saved, results: results, enabled: true, of: personal.length };
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

  // 2) Close the loop on prior drafts AND prior proposed reaches BEFORE pulling new mail.
  var priorLoop = await closeLoopOnPriorDrafts(HAM, config);
  var reachLoop = await closeLoopOnEscalations(HAM, config);

  // 2b) Optional: clear this advisor's handled-watermark so already-reviewed mail is drafted
  // again. Off by default (the watermark is what stops re-drafting the same thread every
  // cycle); the founder turns it on to force a fresh full pass, e.g. to see drafts actually
  // land in the Drafts folder now that saving is on.
  if (opts.clearWatermark === true) {
    try { await watermark.clearWatermark(config.advisor_id, HAM, 'all'); } catch (e) {}
  }

  // 3) Cold gather.
  var packet = await gatherEvidence(config, HAM, opts.limit);
  if (packet.imb && packet.imb.empty) {
    // Empty IMB is useful information, and a gap worth marking so it gets captured over time.
    await markWallGap(HAM, world, 'empty_imb',
      'This advisor\'s memory bank had nothing on file for "' + world + '", relationships here have not been captured yet.',
      'Have A\'NU\'s cycle capture relationship history for "' + world + '" so future runs are not blind (RELATIONSHIP beads under ' + config.advisor_id + ').');
  }

  // 4) The organ triages; every owed reply is composed through its own full window cycle.
  //    Cold code decided nothing; it only gathered.
  var judged = await judgeAndDraft(packet, config, HAM);
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
  var report = await composeHerReport(decisions, packet, config, HAM, priorLoop, reachLoop);

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

  // 8c) Save owed replies into the mailbox's own Drafts folder (OFF by default). Real
  // drafts, threaded, never sent, for the founder to open and send himself.
  var mailboxDrafts = await saveDraftsToMailbox(HAM, config, decisions, packet, opts);

  // 9) The brain, write, stamped. A RESULT bead records every action for honest audit.
  var resultContent = lineage.attachLineage({
    world: world, agent: 'INBOX_ZERO', unread_reviewed: packet.messages.length,
    drafted: personal.length, skipped: skippedMsgs.length, escalations_proposed: escalations,
    reach_proposals_ruled: reachLoop.ruled, reach_proposals_pending: reachLoop.pending,
    prior_drafts_closed: priorLoop.closed, prior_drafts_dropped: priorLoop.dropped,
    preview_sent_to_founder: preview.enabled ? preview.sent : 0, preview_mode: preview.enabled,
    drafts_saved_to_mailbox: mailboxDrafts.enabled ? mailboxDrafts.saved : 0, mailbox_drafts_mode: mailboxDrafts.enabled,
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
    mailbox_drafts_mode: mailboxDrafts.enabled, drafts_saved_to_mailbox: mailboxDrafts.enabled ? mailboxDrafts.saved : 0,
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
      var out = await runInboxZero({ world: req.params.world, hamUid: body.hamUid || body.ham_uid, intent: body.intent, limit: body.limit, previewSend: body.previewSend === true, saveToDrafts: body.saveToDrafts !== false, clearWatermark: body.clearWatermark === true });
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
