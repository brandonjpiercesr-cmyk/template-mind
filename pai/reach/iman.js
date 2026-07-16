// ⬡B:reach.iman:MODULE:nylas_with_key_routing:20260701⬡
'use strict';
var crypto = require('crypto');
// ⬡B:reach.iman:WIRE:funneled_20260712⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

// IMAN — Nylas email. Outbound send + inbox read. No hardcode.
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
async function listEmails(world, opts) {
  var grant = resolveGrant(world);
  var key   = resolveKey(world);
  if (!grant) return { ok: false, reason: 'no_grant_for_world:' + world, messages: [] };
  if (!key)   return { ok: false, reason: 'no_nylas_key_for_world:' + world, messages: [] };
  var limit = (opts && opts.limit) || 10;
  var url = 'https://api.us.nylas.com/v3/grants/' + grant + '/messages?limit=' + limit + '&unread=false';
  var r = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
  }).catch(function() { return null; });
  if (!r || !r.ok) {
    var err = r ? await r.text().catch(function(){return'?';}) : 'no_response';
    return { ok: false, reason: 'nylas_error', detail: err.slice(0, 200), messages: [] };
  }
  var data = await r.json().catch(function(){return{};});
  var messages = (data.data || []).map(function(m) {
    return {
      id:        m.id,
      thread_id: m.thread_id || null,
      subject:   m.subject || '',
      from:      (m.from && m.from[0] && m.from[0].email) || '',
      from_name: (m.from && m.from[0] && m.from[0].name)  || '',
      date:      m.date  || 0,
      snippet:   m.snippet || '',
      unread:    m.unread  || false,
    };
  });
  return { ok: true, world: world, messages: messages, count: messages.length };
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
    var finalVerdict = pam.pamCheck(approved.subject + '\n\n' + approved.body, input.world || null);
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
  // ⬡B:reach.iman:GUARD:final_edge_switch_and_durable_effect_claim:20260715⬡
  // Council can take time. Re-read the shared switch at the provider edge,
  // then acquire one Postgres-backed claim for these exact approved fields,
  // canonical recipients, and council lineage before Nylas receives bytes.
  var edgeKill = await requireClearKillSwitch(input.hamUid);
  if (!edgeKill.ok) return edgeKill;
  var artifact = JSON.stringify({ subject:input.approved.subject,
    body:input.approved.body });
  var effectClaim = await require('../core/outbound.effect.js').claimProviderAttempt({
    hamUid:input.hamUid, channel:'iman_email',
    deliveryTarget:{ kind:'email', value:input.to }, artifact:artifact,
    requestId:input.requestId, cycleId:input.cycleId
  });
  if (!effectClaim.ok) return fail(effectClaim.reason,
    { effectKey:effectClaim.effectKey || null });
  var response;
  try {
    response = await fetch('https://api.us.nylas.com/v3/grants/' + input.grant + '/messages/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + input.key,
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'Idempotency-Key':effectClaim.idempotencyKey },
      body: JSON.stringify({ subject: input.approved.subject, body: input.approved.body, to: input.to })
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
  return { ok: true, messageId: id };
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
    hamUid:identity.hamUid, requestId:finalized.requestId, cycleId:finalized.cycleId });
  var proofResult = { requestId: finalized.requestId, cycleId: finalized.cycleId, councilProof: finalized.councilProof };
  if (!provider.ok) return fail(provider.reason, Object.assign({}, proofResult,
    provider.status === undefined ? {} : { status: provider.status }));
  return Object.assign({ ok: true, messageId: provider.messageId, to: recipients },
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
  var grant = process.env.NYLAS_ABA_GRANT;
  var key = process.env.NYLAS_API_KEY;
  if (!grant || !key) return fail('no_nylas_config');
  return sendThroughCommittedBoundary({ to: to, subject: subject, body: body, world: null,
    opts: opts || {}, grant: grant, key: key, sender: 'claudette' });
}

// Resolve a HAM's contact read-only, then bind that exact HAM into the same send.
async function sendToHam(hamUid, subject, body, world, opts) {
  if (!world) return fail('world_required_no_silent_fallback');
  if (typeof hamUid !== 'string' || !hamUid.trim()) return fail('ham_uid_required');
  if (!_bu() || !_bk()) return fail('no_brain');
  var response, rows;
  try {
    response = await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=eq.ham.' + encodeURIComponent(hamUid) + '.contact&limit=1',
      { headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Accept-Profile': _schema() } });
    if (!response || response.ok !== true) return fail('contact_lookup_uncertain');
    rows = await response.json();
  } catch (eContactRead) {
    return fail('contact_lookup_uncertain');
  }
  if (!Array.isArray(rows)) return fail('contact_lookup_uncertain');
  var contact = null;
  try { contact = rows[0] ? JSON.parse(rows[0].content || '{}') : null; }
  catch (eContactParse) { return fail('contact_record_invalid'); }
  if (!contact || !contact.email) return fail('no_contact_for_ham');
  return send([{ email: contact.email, name: contact.name || '' }], subject, body, world,
    Object.assign({}, opts || {}, { hamUid: hamUid }));
}

module.exports = { send: send, sendFromClaudette: sendFromClaudette, sendToHam: sendToHam, listEmails: listEmails, alreadyRepliedOnThread: alreadyRepliedOnThread, getGrant: getGrant, resolveGrant: resolveGrant, resolveKey: resolveKey };
