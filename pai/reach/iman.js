// ⬡B:reach.iman:MODULE:nylas_with_key_routing:20260701⬡
'use strict';
var crypto = require('crypto');
// ⬡B:reach.iman:WIRE:funneled_20260712⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}

// IMAN, Nylas email. Outbound send + inbox read. No hardcode.
// Grant resolution: world -> env var. Key resolution: sandbox vs production app.
// ANYHAM test: route works for any valid world. EBC firewall: reads only the world passed in.

var WORLD_GRANT_ENV = {
  'gmg':        'NYLAS_GMG_GRANT',
  'bdif':       'NYLAS_BDIF_GRANT',
  'mediators':  'NYLAS_MEDIATORS_GRANT',
  'mh_action':  'NYLAS_MH_ACTION_GRANT',
};

// Mediators and MH Action are on the production Nylas app, not sandbox.
var WORLD_KEY_ENV = {
  'gmg':        'NYLAS_API_KEY',
  'bdif':       'NYLAS_API_KEY',
  'mediators':  'NYLAS_PRODUCTION_KEY',
  'mh_action':  'NYLAS_PRODUCTION_KEY',
};

function resolveGrant(world) {
  var envKey = WORLD_GRANT_ENV[world];
  return envKey ? (process.env[envKey] || null) : null;
}

function resolveKey(world) {
  var envKey = WORLD_KEY_ENV[world] || 'NYLAS_API_KEY';
  return process.env[envKey] || null;
}

// A'NU is the canonical sender for system-originated mail, including REACH.
// The HAM world still owns PAM/context and recipient identity, but it must never
// select the sender mailbox: founder worlds such as GMG are sandbox grants while
// A'NU's mailbox and autonomous terminal webhooks live on the production app.
function resolveAnuProductionSender() {
  var grant = String(process.env.NYLAS_ANU_GRANT || '').trim();
  var productionKey = String(process.env.NYLAS_PRODUCTION_KEY || '').trim();
  if (!grant || !productionKey) {
    return { ok:false, reason:'no_nylas_anu_production_config' };
  }
  var key = null;
  try { key = require('../core/nylasKeys.js').keyForGrant(grant); }
  catch (eKey) { key = null; }
  if (!key || key !== productionKey) {
    return { ok:false, reason:'no_nylas_anu_production_config' };
  }
  return { ok:true, grant:grant, key:key, sender:'anu' };
}

// ⬡B:reach.iman:WIRE:getGrant_export_for_calendar:20260710⬡
// reach/iman.calendar.js imported getGrant from here but it was never exported,
// so the calendar capability was dead on require. Returns the rich shape the
// calendar module needs ({grantId, keyEnv, from, world}). Additive, per-world,
// EBC firewall intact -- resolves ONLY the world passed in, never cross-grant.
var WORLD_FROM = {
  'gmg':        process.env.NYLAS_GMG_FROM_EMAIL       || 'brandon@globalmajoritygroup.com',
  'bdif':       process.env.NYLAS_BDIF_FROM_EMAIL      || 'brandon@briandawkins.com',
  'mediators':  process.env.NYLAS_MEDIATORS_FROM_EMAIL || 'brandon@mediatorsfoundation.org',
  'mh_action':  process.env.NYLAS_MH_ACTION_FROM_EMAIL || 'bpierce@mhaction.org',
};
function getGrant(world) {
  var grantId = resolveGrant(world);
  if (!grantId) return null;
  return {
    grantId: grantId,
    keyEnv:  WORLD_KEY_ENV[world] || 'NYLAS_API_KEY',
    from:    WORLD_FROM[world] || null,
    world:   world,
  };
}

// List emails from a specific world inbox
// ⬡B:reach.iman:WIRE:recipients_and_unread_for_inbox_zero:20260720⬡
// Additive, non-breaking: opts.unread lets a caller pull ONLY unread mail (the
// Inbox Zero cycle needs this); default stays unread=false so every existing
// caller is untouched. Each message now also carries its full To/CC lists and
// recipient_count so the judgment organ can catch a blast that only LOOKS
// personal. Cold code fetches the counts; the LLM decides what they mean.
function _addrList(arr) {
  return (Array.isArray(arr) ? arr : []).map(function (a) {
    return { email: (a && a.email) || '', name: (a && a.name) || '' };
  }).filter(function (a) { return a.email; });
}
async function listEmails(world, opts) {
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant) return { ok: false, reason: 'no_grant_for_world:' + world, messages: [] };
  if (!key)   return { ok: false, reason: 'no_nylas_key_for_world:' + world, messages: [] };
  var limit = (opts && opts.limit) || 10;
  var unread = (opts && opts.unread) ? 'true' : 'false';
  var url = 'https://api.us.nylas.com/v3/grants/' + grant + '/messages?limit=' + limit + '&unread=' + unread;
  var r = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
  }).catch(function() { return null; });
  if (!r || !r.ok) {
    var err = r ? await r.text().catch(function(){return'?';}) : 'no_response';
    return { ok: false, reason: 'nylas_error', detail: err.slice(0, 200), messages: [] };
  }
  var data = await r.json().catch(function(){return{};});
  var messages = (data.data || []).map(function(m) {
    var to = _addrList(m.to), cc = _addrList(m.cc);
    return {
      id:        m.id,
      thread_id: m.thread_id || null,
      subject:   m.subject || '',
      from:      (m.from && m.from[0] && m.from[0].email) || '',
      from_name: (m.from && m.from[0] && m.from[0].name)  || '',
      date:      m.date  || 0,
      snippet:   m.snippet || '',
      unread:    m.unread  || false,
      to:        to,
      cc:        cc,
      recipient_count: to.length + cc.length,
      has_attachments: !!(m.attachments && m.attachments.length),
    };
  });
  return { ok: true, world: world, messages: messages, count: messages.length };
}

// ⬡B:reach.iman:WIRE:full_thread_before_drafting_inbox_zero:20260720⬡
// The Inbox Zero spec is explicit: read the ENTIRE thread chronologically before
// drafting, not just the newest message. This is that door, EBC-walled to the one
// world's grant. Returns messages oldest-first, each with body text and the
// attachment metadata on it. Cold fetch only; the organ judges.
async function getThread(world, threadId) {
  if (!threadId) return { ok: false, reason: 'no_thread_id', messages: [] };
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant || !key) return { ok: false, reason: 'no_nylas_config_for_world:' + world, messages: [] };
  var url = 'https://api.us.nylas.com/v3/grants/' + grant + '/messages?thread_id=' + encodeURIComponent(threadId) + '&limit=25';
  var r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' } }).catch(function(){return null;});
  if (!r || !r.ok) return { ok: false, reason: 'nylas_error', messages: [] };
  var data = await r.json().catch(function(){return{};});
  var msgs = (data.data || []).map(function(m) {
    return {
      id:        m.id,
      thread_id: m.thread_id || threadId,
      subject:   m.subject || '',
      from:      (m.from && m.from[0] && m.from[0].email) || '',
      from_name: (m.from && m.from[0] && m.from[0].name)  || '',
      to:        _addrList(m.to),
      cc:        _addrList(m.cc),
      date:      m.date || 0,
      snippet:   m.snippet || '',
      body:      typeof m.body === 'string' ? m.body : '',
      attachments: (m.attachments || []).map(function(a){ return { id:a.id, filename:a.filename||'', content_type:a.content_type||'', size:a.size||0 }; }),
    };
  }).sort(function(a,b){ return (a.date||0) - (b.date||0); }); // chronological, oldest first
  return { ok: true, world: world, thread_id: threadId, messages: msgs, count: msgs.length };
}

// ⬡B:reach.iman:WIRE:attachment_download_inbox_zero:20260720⬡
// "Attachments must actually be opened, not assumed." Downloads one attachment and,
// when it is a text/plain-ish body, returns its decoded text so the organ can read
// it for real. Binary types return their metadata only (the organ is told plainly it
// could not read the bytes). EBC-walled to the one world's grant.
async function downloadAttachment(world, messageId, attachmentId, contentType) {
  if (!messageId || !attachmentId) return { ok: false, reason: 'missing_ids' };
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant || !key) return { ok: false, reason: 'no_nylas_config_for_world:' + world };
  var url = 'https://api.us.nylas.com/v3/grants/' + grant + '/attachments/' + encodeURIComponent(attachmentId)
    + '/download?message_id=' + encodeURIComponent(messageId);
  var r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + key } }).catch(function(){return null;});
  if (!r || !r.ok) return { ok: false, reason: 'nylas_error' };
  var ct = String(contentType || r.headers.get('content-type') || '');
  var readable = /text\/|json|csv|xml|html|markdown/i.test(ct);
  if (!readable) return { ok: true, readable: false, content_type: ct, text: null };
  var text = await r.text().catch(function(){ return null; });
  return { ok: true, readable: true, content_type: ct, text: text ? text.slice(0, 8000) : null };
}

// FIX 20260706: the advisor was drafting replies to inbound threads Brandon had
// already personally answered himself, since nothing ever checked Sent for an
// existing reply on that thread. Given a thread_id and the date the inbound
// arrived, this pulls the real Sent folder for that world and returns whether
// a message on the same thread went out after that date. A station calling
// this before drafting can skip anything already handled instead of
// duplicating work that was already done by hand.
async function alreadyRepliedOnThread(world, threadId, sinceEpochSeconds) {
  if (!threadId) return { ok: false, reason: 'no_thread_id', replied: false };
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant || !key) return { ok: false, reason: 'no_nylas_config_for_world:' + world, replied: false };
  // Nylas folders differ per provider; fetch folders once, find the real Sent
  // one for this grant rather than assuming a fixed id.
  var fr = await fetch('https://api.us.nylas.com/v3/grants/' + grant + '/folders', {
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
  }).catch(function(){ return null; });
  if (!fr || !fr.ok) return { ok: false, reason: 'folders_fetch_failed', replied: false };
  var folders = (await fr.json().catch(function(){return{};})).data || [];
  var sentFolder = folders.find(function(f) {
    var attrs = f.attributes || [];
    return attrs.indexOf('\\Sent') !== -1 || /sent/i.test(f.name || '');
  });
  if (!sentFolder) return { ok: false, reason: 'no_sent_folder_found', replied: false };
  var mr = await fetch('https://api.us.nylas.com/v3/grants/' + grant + '/messages?in=' + sentFolder.id + '&thread_id=' + encodeURIComponent(threadId) + '&limit=10', {
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
  }).catch(function(){ return null; });
  if (!mr || !mr.ok) return { ok: false, reason: 'sent_fetch_failed', replied: false };
  var sentMsgs = (await mr.json().catch(function(){return{};})).data || [];
  var sinceEpoch = sinceEpochSeconds || 0;
  var replyAfter = sentMsgs.find(function(m) { return (m.date || 0) > sinceEpoch; });
  return { ok: true, replied: !!replyAfter, matchedMessageId: replyAfter ? replyAfter.id : null, checkedCount: sentMsgs.length };
}

// ⬡B:reach.iman:WIRE:create_draft_not_send_for_inbox_zero:20260721⬡
// Save a reply as a real DRAFT in the world's own Drafts folder, and DO NOT SEND it.
// The founder opens his own mailbox and the draft is sitting there, threaded to the
// original, ready for him to read, edit, and hit send himself. This is NOT the outbound
// send boundary: Nylas POST /drafts only stores a draft on the account, nothing leaves
// the mailbox, so it never touches the PAI send council or REACH_SEND_MODE. It is the
// exact "she did the work, I just send it" surface, and it keeps the hard line, because
// a draft is not a send. EBC-walled to the one world's grant, threaded when a real
// thread_id + reply_to_message_id are given so the draft lands inside the conversation.
async function createDraft(world, opts) {
  opts = opts || {};
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant || !key) return fail('no_nylas_config_for_world:' + world);
  var to = normalizeRecipients(opts.to);
  if (!to || !to.length) return fail('draft_recipient_invalid');
  if (typeof opts.body !== 'string' || !/\S/.test(opts.body)) return fail('draft_body_invalid');
  var payload = { to: to, subject: String(opts.subject || '').slice(0, 400), body: opts.body };
  // Thread the draft into the real conversation when the caller has the ids.
  if (opts.thread_id) payload.thread_id = String(opts.thread_id);
  if (opts.reply_to_message_id) payload.reply_to_message_id = String(opts.reply_to_message_id);
  try {
    var r = await fetch('https://api.us.nylas.com/v3/grants/' + grant + '/drafts', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
    });
    var data = await r.json().catch(function(){ return {}; });
    if (r.status >= 200 && r.status < 300) {
      var d = data && data.data || {};
      return { ok: true, draftId: d.id || null, threadId: d.thread_id || opts.thread_id || null, world: world, sent: false };
    }
    return fail('draft_create_' + r.status, { detail: JSON.stringify(data).slice(0, 200) });
  } catch (e) { return fail('draft_create_unreachable'); }
}

// ⬡B:reach.iman:GUARD:one_committed_pai_boundary_for_every_provider_send:20260715⬡
// IMAN is the outbound email provider boundary. Every exported send path arrives
// here with an explicit HAM, runs the canonical PAI cycle in read-only finalizer
// mode, verifies the durable receipt + STAMP pair, parses one approved email
// artifact, and sends those exact approved substrings. No caller-authored bytes
// can skip the council and no post-council formatter can change approved words.

function fail(reason, extra) {
  return Object.assign({ ok: false, reason: reason }, extra || {});
}

function requestId(opts) {
  var supplied = opts && opts.requestId;
  if (supplied !== undefined) {
    if (typeof supplied !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(supplied)) return null;
    return supplied;
  }
  try { return 'iman.email.' + Date.now() + '.' + crypto.randomBytes(8).toString('hex'); }
  catch (eRandom) { return null; }
}

function normalizeRecipients(to) {
  var values = Array.isArray(to) ? to : [to];
  if (!values.length) return null;
  var normalized = [];
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    var email = value && typeof value === 'object' ? value.email : value;
    var name = value && typeof value === 'object' && value.name != null ? String(value.name) : '';
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        /[\r\n\0]/.test(email) || /[\r\n\0]/.test(name)) return null;
    normalized.push({ email: email, name: name });
  }
  return normalized;
}

function exactRawRequestClaim(subject, body) {
  // JSON is used only as a lossless request claim: both strings, including
  // whitespace and Unicode, are recoverable byte-for-byte from this one value.
  return JSON.stringify({ subject: subject, body: body });
}

function parseApprovedEmail(answer) {
  if (typeof answer !== 'string' || answer.slice(0, 9) !== 'Subject: ' || answer.indexOf('\0') !== -1) return null;
  var lfAt = answer.indexOf('\n\n');
  var crlfAt = answer.indexOf('\r\n\r\n');
  var at = -1, separator = '';
  if (crlfAt >= 0 && (lfAt < 0 || crlfAt < lfAt)) { at = crlfAt; separator = '\r\n\r\n'; }
  else if (lfAt >= 0) { at = lfAt; separator = '\n\n'; }
  if (at < 0) return null;
  var header = answer.slice(0, at);
  if (header.indexOf('\r') !== -1 || header.indexOf('\n') !== -1 || header.slice(0, 9) !== 'Subject: ') return null;
  var approvedSubject = header.slice(9);
  var approvedBody = answer.slice(at + separator.length);
  if (!/\S/.test(approvedSubject) || !/\S/.test(approvedBody)) return null;
  return { subject: approvedSubject, body: approvedBody };
}

async function resolveOutboundIdentity(opts, world) {
  var proposed = opts && opts.hamUid;
  if (typeof proposed !== 'string' || !/^[A-Za-z0-9._:-]{2,160}$/.test(proposed.trim())) {
    return fail('ham_uid_required');
  }
  try {
    var gate = require('../core/atmosphere.gate.js');
    var envelope = await gate.resolveAtmosphere({ hamUid: proposed.trim(), world: world || null });
    var resolved = envelope && envelope.ham_uid;
    if (typeof resolved !== 'string' || !/^[A-Za-z0-9._:-]{2,160}$/.test(resolved.trim())) {
      return fail('identity_unresolved');
    }
    return { ok: true, hamUid: resolved.trim().toUpperCase(), envelope: envelope };
  } catch (eIdentity) {
    return fail('identity_resolution_uncertain');
  }
}

async function requireExactRecipientOwnership(recipients, expectedHamUid) {
  if (!Array.isArray(recipients) || recipients.length !== 1 ||
      !recipients[0] || typeof recipients[0].email !== 'string') {
    return fail('recipient_email_identity_unresolved');
  }
  var envelope;
  try {
    envelope = await require('../core/atmosphere.gate.js')
      .resolveAtmosphere({ email: recipients[0].email });
  } catch (eResolve) {
    return fail('recipient_identity_resolution_uncertain');
  }
  if (!envelope || !envelope.ham_uid) return fail('recipient_email_identity_unresolved');
  if (String(envelope.ham_uid).trim().toUpperCase() !==
      String(expectedHamUid || '').trim().toUpperCase()) {
    return fail('recipient_ham_mismatch');
  }
  return { ok:true, envelope:envelope };
}

async function requireClearKillSwitch(hamUid) {
  // A missing bank means the shared brain-backed switch cannot be read. That is
  // uncertainty, not permission to send.
  if (!_bu() || !_bk()) return fail('kill_switch_unavailable');
  try {
    var state = await require('../core/killswitch.js').isActive(hamUid);
    if (!state || typeof state.active !== 'boolean' || state.error) return fail('kill_switch_uncertain');
    if (state.active) return fail('kill_switch_active' + (state.reason ? ': ' + state.reason : ''), { blocked: true });
    return { ok: true };
  } catch (eKill) {
    return fail('kill_switch_uncertain');
  }
}

function founderTestEnvelope(to, subject, opts) {
  var sendMode = process.env.REACH_SEND_MODE || 'PAUSED';
  var founderTest = !!(opts && opts.founderTest) || sendMode === 'FOUNDER_TEST';
  if (!founderTest && sendMode !== 'LIVE') return fail('REACH_SEND_MODE is ' + sendMode, { blocked: true });
  if (!founderTest) return { ok: true, to: to, subject: subject };
  var founderEmail = process.env.FOUNDER_TEST_EMAIL || '';
  if (!founderEmail) return fail('founder_test_email_not_set');
  // Prefixing is intentionally BEFORE the request claim and council. The
  // provider never adds or changes it after approval.
  return {
    ok: true,
    to: [{ email: founderEmail, name: 'Founder (test)' }],
    subject: '[A NEW test] ' + subject,
    requiredApprovedSubjectPrefix: '[A NEW test] '
  };
}

function verifiedCompactProof(council, pai, expected) {
  var committed = council.requireVerifiedCouncilResult(pai, expected);
  if (!committed || committed.ok !== true || committed.answer !== pai.answer) return null;
  var proof = council.compactCouncilProof(pai);
  if (!proof || proof.request_id !== expected.requestId || proof.cycle_id !== expected.cycleId ||
      proof.committed !== true || proof.readback_verified !== true || proof.representation_count !== 9 ||
      proof.row_count !== 9 || proof.stage_count !== 7 || typeof proof.receipt_digest !== 'string' ||
      typeof proof.final_source !== 'string') return null;
  return proof;
}

async function finalizeApprovedEmail(input) {
  var claim = exactRawRequestClaim(input.subject, input.body);
  var deliberation = 'Finalize one outbound email through A\u2019NU\u2019s full PAI council. ' +
    'Treat the lossless raw request below as a draft, not as permission to send. ' +
    'Return exactly one RFC822-like artifact in this form: Subject: <approved subject>, then one blank line, then the approved body. ' +
    'Return no preface, explanation, labels other than Subject, or code fence. Do not call a send, write, deploy, or mutation tool.\n\n' +
    'LOSSLESS RAW SUBJECT + BODY REQUEST CLAIM:\n' + claim;
  var rid = requestId(input.opts);
  if (!rid) return fail('request_id_invalid');
  var deliveryTarget = { kind:'email', value:input.to };
  var council;
  try {
    council = require('../core/pai.outbound.council.js');
    if (!council.canonicalizeDeliveryTarget(deliveryTarget)) return fail('email_recipient_invalid');
  } catch (eTarget) { return fail('council_verification_uncertain'); }
  var identity = Object.assign({}, input.envelope || {}, {
    uid: input.hamUid,
    ham_uid: input.hamUid,
    request_id: rid,
    user_message: claim,
    world: input.world || null,
    outbound_finalize: true,
    delivery: { external: true },
    council_context: {
      mode: 'iman_outbound_email',
      sender_boundary: input.sender,
      world: input.world || null,
      outbound_finalize: true,
      raw_request_claim_encoding: 'json_subject_body_v1',
      delivery_target: deliveryTarget
    }
  });
  var pai;
  try {
    pai = await require('../core/tool.loop.js').runPAI(input.hamUid, deliberation, 'email', identity, [], null);
  } catch (ePai) {
    return fail('pai_cycle_uncertain');
  }
  if (!pai || pai.ok !== true || typeof pai.answer !== 'string' || typeof pai.cycleId !== 'string' || !pai.cycleId) {
    return fail('pai_cycle_failed');
  }
  var expected = { hamUid: input.hamUid, requestId: rid, cycleId: pai.cycleId,
    question: claim, deliberationInput: deliberation, answer: pai.answer,
    deliveryTarget: deliveryTarget };
  var proof;
  try {
    proof = verifiedCompactProof(council, pai, expected);
  } catch (eCouncil) {
    return fail('council_verification_uncertain');
  }
  if (!proof) return fail('council_commit_unverified');
  var approved = parseApprovedEmail(pai.answer);
  if (!approved) return fail('approved_email_artifact_invalid', {
    requestId: rid, cycleId: pai.cycleId, councilProof: proof
  });
  if (input.requiredApprovedSubjectPrefix &&
      approved.subject.slice(0, input.requiredApprovedSubjectPrefix.length) !== input.requiredApprovedSubjectPrefix) {
    return fail('founder_test_prefix_not_approved', {
      blocked: true, requestId: rid, cycleId: pai.cycleId, councilProof: proof
    });
  }

  // Deterministic final-byte backstop. This only judges the approved substrings;
  // it never cleans, trims, prefixes, or otherwise changes them.
  try {
    var pam = require('../board/pam/pam.js');
    var finalVerdict = await pam.pamCheck(approved.subject + '\n\n' + approved.body, input.world || null);
    if (!finalVerdict || finalVerdict.ok !== true) return fail('approved_email_pam_hold', {
      blocked: true, requestId: rid, cycleId: pai.cycleId, councilProof: proof
    });
    if (/\bebc\b|firewall/i.test(approved.subject + '\n\n' + approved.body)) {
      return fail('ebc_firewall_block: outbound referenced the firewall itself', {
        blocked: true, requestId: rid, cycleId: pai.cycleId, councilProof: proof
      });
    }
  } catch (ePam) {
    return fail('approved_email_pam_uncertain', {
      blocked: true, requestId: rid, cycleId: pai.cycleId, councilProof: proof
    });
  }
  var finalized = { ok: true, approved: approved, requestId: rid,
    cycleId: pai.cycleId, councilProof: proof };
  Object.defineProperty(finalized, '_councilResult', { enumerable:false, value:pai });
  return finalized;
}

async function providerSend(input) {
  var council;
  try {
    council = require('../core/pai.outbound.council.js');
    var delivery = council.requireVerifiedCouncilDelivery(input.councilResult,
      { kind:'email', value:input.to }, input.councilResult && input.councilResult.answer);
    if (!delivery || delivery.ok !== true) return fail('email_delivery_target_unverified');
  } catch (eCouncil) {
    return fail('email_delivery_target_unverified');
  }
  if (input.requireExactHamTarget) {
    var ownership = await requireExactRecipientOwnership(input.to, input.hamUid);
    if (!ownership.ok) return ownership;
  }
  // Council can take time. Re-read the shared switch at the provider edge.
  var edgeKill = await requireClearKillSwitch(input.hamUid);
  if (!edgeKill.ok) return edgeKill;
  var artifact = JSON.stringify({ subject:input.approved.subject,
    body:input.approved.body });
  var deliverySaga = require('../core/reach/provider.delivery.saga.js');
  var providerDelivery = deliverySaga.normalizeProvenance(input.providerDelivery);
  var autonomousReach = !!providerDelivery;
  var effectBoundary = require('../core/outbound.effect.js');
  var effectInput = { hamUid:input.hamUid, channel:'iman_email',
    deliveryTarget:{ kind:'email', value:input.to }, artifact:artifact,
    requestId:input.requestId, cycleId:input.cycleId };
  var plannedEffectKey = typeof effectBoundary.effectKey === 'function'
    ? effectBoundary.effectKey(effectInput) : null;
  if (!plannedEffectKey) return fail('provider_effect_identity_unverified');
  var trackingLabel = null, providerIntent = null;
  if (autonomousReach) {
    var ready = await require('./iman.webhook.js').requireReadyForKey(input.key);
    if (!ready.ok) return fail(ready.reason || 'nylas_terminal_webhook_unready');
    var truthReady = await deliverySaga.prepareStore();
    if (!truthReady.ok) return fail(truthReady.reason || 'provider_truth_store_unavailable');
    // This opaque value binds only the actual second/final IMAN council IDs.
    trackingLabel = 'reach-' + crypto.createHash('sha256').update(JSON.stringify({
      hamUid:input.hamUid, requestId:input.requestId,
      cycleId:input.cycleId, effectKey:plannedEffectKey
    }), 'utf8').digest('hex').slice(0, 48);
    providerIntent = await deliverySaga.createProviderIntent({
      hamUid:input.hamUid, provider:'nylas', channel:'email',
      requestId:input.requestId, cycleId:input.cycleId,
      correlationKey:'anew-' + plannedEffectKey,
      providerBinding:input.grant, trackingLabel:trackingLabel,
      artifact:artifact, councilProof:input.councilProof,
      provenance:providerDelivery
    });
    if (!providerIntent.ok) return fail(providerIntent.reason || 'provider_intent_unverified',
      { effectKey:plannedEffectKey });
  }
  // Intent exists before the long-lived effect claim. A transient intent-store
  // failure therefore cannot consume the 100-year no-duplicate claim.
  var effectClaim = await effectBoundary.claimProviderAttempt(effectInput);
  if (!effectClaim.ok) return fail(effectClaim.reason,
    { effectKey:effectClaim.effectKey || plannedEffectKey });
  if (effectClaim.effectKey !== plannedEffectKey ||
      effectClaim.idempotencyKey !== 'anew-' + plannedEffectKey) {
    return fail('provider_effect_identity_mismatch', { effectKey:effectClaim.effectKey || null });
  }
  var response;
  try {
    var providerBody = { subject: input.approved.subject,
      body: input.approved.body, to: input.to };
    if (trackingLabel) providerBody.tracking_options = {
      label:trackingLabel, opens:true, links:false, thread_replies:true
    };
    response = await fetch('https://api.us.nylas.com/v3/grants/' + input.grant + '/messages/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + input.key,
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'Idempotency-Key':effectClaim.idempotencyKey },
      body: JSON.stringify(providerBody)
    });
  } catch (eProvider) {
    return fail('nylas_provider_uncertain');
  }
  if (!response || response.ok !== true) {
    var status = response && Number.isFinite(response.status) ? response.status : null;
    return fail(status === null || status >= 500 || status === 408 || status === 425 || status === 429
      ? 'nylas_provider_uncertain' : 'nylas_provider_rejected', { status:status });
  }
  var data;
  try { data = await response.json(); }
  catch (eJson) { return fail('nylas_provider_response_uncertain'); }
  var id = data && data.data && data.data.id;
  if (typeof id !== 'string' || !id.trim()) return fail('nylas_provider_response_uncertain');
  if (autonomousReach) {
    var providerAttempt = await deliverySaga.registerProviderAttempt({
      provider:'nylas', providerMessageId:id,
      providerIntentSource:providerIntent.source
    });
    if (!providerAttempt.ok) {
      var acceptanceRecovery = await deliverySaga.recordProviderAcceptanceRecovery({
        provider:'nylas', providerMessageId:id,
        providerIntentSource:providerIntent.source
      });
      return fail('provider_acceptance_binding_unverified', {
        providerAccepted:true, provider:'nylas', messageId:id,
        providerAcceptanceRecovery:true,
        providerRecoveryPersisted:acceptanceRecovery.ok === true,
        providerRecoverySource:acceptanceRecovery.source || null,
        providerRecoveryReason:acceptanceRecovery.ok ? null : acceptanceRecovery.reason || null,
        deliveryTruthReady:false, deliveryTruthReason:providerAttempt.reason,
        providerIntentSource:providerIntent.source
      });
    }
    return { ok:true, provider:'nylas', messageId:id, deliveryTruthReady:true,
      providerIntentSource:providerIntent.source,
      providerAttemptSource:providerAttempt.source };
  }
  return { ok:true, messageId:id };
}

async function sendThroughCommittedBoundary(config) {
  var identity = await resolveOutboundIdentity(config.opts, config.world);
  if (!identity.ok) return identity;
  var kill = await requireClearKillSwitch(identity.hamUid);
  if (!kill.ok) return kill;
  if (typeof config.subject !== 'string' || !/\S/.test(config.subject) || /[\r\n\0]/.test(config.subject) ||
      typeof config.body !== 'string' || !/\S/.test(config.body) || config.body.indexOf('\0') !== -1) {
    return fail('email_subject_body_invalid');
  }
  var testEnvelope = founderTestEnvelope(config.to, config.subject, config.opts);
  if (!testEnvelope.ok) return testEnvelope;
  var recipients = normalizeRecipients(testEnvelope.to);
  if (!recipients) return fail('email_recipient_invalid');
  var finalized = await finalizeApprovedEmail({
    hamUid: identity.hamUid,
    envelope: identity.envelope,
    subject: testEnvelope.subject,
    body: config.body,
    to: recipients,
    world: config.world,
    sender: config.sender,
    requiredApprovedSubjectPrefix: testEnvelope.requiredApprovedSubjectPrefix || null,
    opts: config.opts
  });
  if (!finalized.ok) return finalized;
  var provider = await providerSend({ grant: config.grant, key: config.key, to: recipients,
    approved: finalized.approved, councilResult:finalized._councilResult,
    hamUid:identity.hamUid, requestId:finalized.requestId, cycleId:finalized.cycleId,
    councilProof:finalized.councilProof,
    providerDelivery:config.opts && config.opts.providerDelivery,
    requireExactHamTarget:config.requireExactHamTarget === true });
  var proofResult = { requestId: finalized.requestId, cycleId: finalized.cycleId,
    councilProof: finalized.councilProof,
    approvedSubject:finalized.approved.subject,
    approvedBody:finalized.approved.body };
  if (!provider.ok) return fail(provider.reason, Object.assign({}, proofResult,
    provider.status === undefined ? {} : { status: provider.status },
    provider.providerAccepted ? { providerAccepted:true,
      provider:provider.provider || null,
      messageId:provider.messageId || null, deliveryTruthReady:false,
      deliveryTruthReason:provider.deliveryTruthReason || null,
      providerIntentSource:provider.providerIntentSource || null,
      providerAcceptanceRecovery:provider.providerAcceptanceRecovery === true,
      providerRecoveryPersisted:provider.providerRecoveryPersisted === true,
      providerRecoverySource:provider.providerRecoverySource || null,
      providerRecoveryReason:provider.providerRecoveryReason || null } : {}));
  return Object.assign({ ok: true, messageId: provider.messageId, to: recipients,
    provider:provider.provider || null,
    deliveryTruthReady:provider.deliveryTruthReady,
    providerIntentSource:provider.providerIntentSource || null,
    providerAttemptSource:provider.providerAttemptSource || null,
    deliveryTruthReason:provider.deliveryTruthReason || null },
    config.world ? { world: config.world } : { from: config.sender }, proofResult);
}

// Send outbound. Grant and key resolve only by world, with no silent fallback.
async function send(to, subject, body, world, opts) {
  if (!world) return fail('world_required_no_silent_fallback');
  var grant = resolveGrant(world);
  var key = resolveKey(world);
  if (!grant || !key) return fail('no_nylas_config_for_world:' + world);
  return sendThroughCommittedBoundary({ to: to, subject: subject, body: body, world: world,
    opts: opts || {}, grant: grant, key: key, sender: world });
}

// Explicit internal identity, same mandatory council and provider boundary.
async function sendFromClaudette(to, subject, body, opts) {
  var sender = resolveAnuProductionSender();
  if (!sender.ok) return fail(sender.reason);
  return sendThroughCommittedBoundary({ to: to, subject: subject, body: body, world: null,
    opts: opts || {}, grant: sender.grant, key: sender.key, sender: sender.sender });
}

// Accept the already ownership-verified exact address. Re-reading an arbitrary
// first contact row here created a TOCTOU/cross-HAM seam between the outer
// council target and Nylas. The same exact address is resolved through
// ATMOSPHERE again at the provider edge before any effect claim or network send.
async function sendToHam(hamUid, exactEmail, subject, body, world, opts) {
  if (!world) return fail('world_required_no_silent_fallback');
  if (typeof hamUid !== 'string' || !hamUid.trim()) return fail('ham_uid_required');
  var recipient = normalizeRecipients(exactEmail);
  if (!recipient || recipient.length !== 1) return fail('email_recipient_invalid');
  var grant = resolveGrant(world);
  var key = resolveKey(world);
  if (!grant || !key) return fail('no_nylas_config_for_world:' + world);
  return sendThroughCommittedBoundary({ to:recipient, subject:subject, body:body,
    world:world, opts:Object.assign({}, opts || {}, { hamUid:hamUid }),
    grant:grant, key:key, sender:world, requireExactHamTarget:true });
}

// ⬡B:reach.iman:WIRE:one_reach_council_email_provider:20260717⬡
// REACH's one target-bound council may commit a complete RFC822-like artifact.
// This provider seam parses and sends those exact committed substrings without
// starting a second PAI cycle or granting IMAN authority to rewrite the body.
async function sendCommittedToHam(hamUid, exactEmail, artifact, world, authorization, opts) {
  // This seam cannot redirect or prefix after the REACH council because that
  // would change the exact target or artifact the receipt authorized. Founder
  // test routing must therefore be resolved before council. Until that path is
  // explicitly supplied, only the canonical LIVE target may reach Nylas.
  if ((process.env.REACH_SEND_MODE || 'PAUSED') !== 'LIVE') {
    return fail('REACH_SEND_MODE is ' + (process.env.REACH_SEND_MODE || 'PAUSED'),
      { blocked:true });
  }
  if (!world) return fail('world_required_no_silent_fallback');
  if (typeof hamUid !== 'string' || !hamUid.trim()) return fail('ham_uid_required');
  if (typeof artifact !== 'string' || !artifact.trim()) return fail('approved_email_artifact_invalid');
  var recipient = normalizeRecipients(exactEmail);
  if (!recipient || recipient.length !== 1) return fail('email_recipient_invalid');
  var sender = resolveAnuProductionSender();
  if (!sender.ok) return fail(sender.reason);
  var identity = await resolveOutboundIdentity({ hamUid:hamUid }, world);
  if (!identity.ok) return identity;
  var kill = await requireClearKillSwitch(identity.hamUid);
  if (!kill.ok) return kill;
  var ownership = await requireExactRecipientOwnership(recipient, identity.hamUid);
  if (!ownership.ok) return ownership;
  var approved = parseApprovedEmail(artifact);
  if (!approved) return fail('approved_email_artifact_invalid');
  var councilResult = authorization && authorization.councilResult;
  var councilProof = authorization && authorization.councilProof;
  var council;
  var verified;
  try {
    council = require('../core/pai.outbound.council.js');
    verified = council.requireVerifiedCouncilDelivery(councilResult,
      { kind:'email', value:recipient }, artifact);
    var compact = council.compactCouncilProof(councilResult);
    if (!verified || verified.ok !== true || !compact ||
        JSON.stringify(compact) !== JSON.stringify(councilProof)) {
      return fail('email_delivery_target_unverified');
    }
  } catch (eCouncil) { return fail('email_delivery_target_unverified'); }
  try {
    var pam = require('../board/pam/pam.js');
    var verdict = await pam.pamCheck(approved.subject + '\n\n' + approved.body, world);
    if (!verdict || verdict.ok !== true ||
        /\bebc\b|firewall/i.test(approved.subject + '\n\n' + approved.body)) {
      return fail('approved_email_pam_hold', { blocked:true,
        requestId:councilProof.request_id, cycleId:councilProof.cycle_id,
        councilProof:councilProof });
    }
  } catch (ePam) { return fail('approved_email_pam_uncertain', { blocked:true,
    requestId:councilProof.request_id, cycleId:councilProof.cycle_id,
    councilProof:councilProof }); }
  var provider = await providerSend({ grant:sender.grant, key:sender.key, to:recipient,
    approved:approved, councilResult:councilResult, hamUid:identity.hamUid,
    requestId:councilProof.request_id, cycleId:councilProof.cycle_id,
    councilProof:councilProof, providerDelivery:opts&&opts.providerDelivery,
    requireExactHamTarget:true });
  var proofResult={requestId:councilProof.request_id,cycleId:councilProof.cycle_id,
    councilProof:councilProof,approvedSubject:approved.subject,approvedBody:approved.body};
  if (!provider.ok) return fail(provider.reason,Object.assign({},proofResult,
    provider.status===undefined?{}:{status:provider.status},
    provider.providerAccepted?{providerAccepted:true,messageId:provider.messageId||null,
      deliveryTruthReady:false,deliveryTruthReason:provider.deliveryTruthReason||null,
      providerIntentSource:provider.providerIntentSource||null,
      providerAcceptanceRecovery:provider.providerAcceptanceRecovery||false,
      providerRecoverySource:provider.providerRecoverySource||null}:{}));
  return Object.assign({ok:true,messageId:provider.messageId,to:recipient,
    deliveryTruthReady:provider.deliveryTruthReady,
    providerIntentSource:provider.providerIntentSource||null,
    providerAttemptSource:provider.providerAttemptSource||null,
    providerAcceptanceRecovery:provider.providerAcceptanceRecovery||false,
    providerRecoverySource:provider.providerRecoverySource||null,world:world},proofResult);
}

module.exports = { send: send, sendFromClaudette: sendFromClaudette,
  sendToHam: sendToHam, sendCommittedToHam:sendCommittedToHam, listEmails: listEmails,
  alreadyRepliedOnThread: alreadyRepliedOnThread, getGrant: getGrant,
  getThread: getThread, downloadAttachment: downloadAttachment, createDraft: createDraft,
  resolveGrant: resolveGrant, resolveKey: resolveKey,
  resolveAnuProductionSender:resolveAnuProductionSender,
  _test:{ providerSend:providerSend, requireExactRecipientOwnership:requireExactRecipientOwnership } };
