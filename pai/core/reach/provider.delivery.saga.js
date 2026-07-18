// ⬡B:core.reach.provider_delivery_saga:MODULE:terminal_message_truth:20260717⬡
//
// Provider acceptance is not delivery. This module durably records an exact
// pre-send intent, binds the provider message ID back to that intent, preserves
// authenticated early webhooks as orphans, and advances one OUTREACH/DIGEST
// pending row through exactly one immutable terminal disposition.
//
// Receipts contain no recipient address and no message bytes.
'use strict';

const crypto = require('node:crypto');

const PROVIDERS = /^(blooio|nylas)$/;
const CHANNELS = /^(text|email)$/;
const PROOF_SCOPES = /^(blooio_recipient_delivery_confirmation|blooio_terminal_failure|nylas_tracking_pixel_fetch|nylas_tracked_thread_reply|nylas_bounce_detected)$/;
const GLOBAL_SOURCE_STAMPS = new Set([
  'REACH_PROVIDER_INTENT', 'REACH_PROVIDER_ATTEMPT',
  'REACH_PROVIDER_RECOVERY',
  'REACH_PROVIDER_FINALIZATION'
]);
const ORPHAN_HAM = 'SYSTEM.REACH';

function brainUrl() {
  return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || '';
}
function brainKey() {
  return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY || '';
}
function usingMemoryBank() {
  return !!(process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY);
}
function table() {
  return process.env.BEAD_TABLE || (usingMemoryBank() ? 'beads' : 'aibe_brain');
}
function schema() {
  return process.env.BRAIN_SCHEMA || (usingMemoryBank() ? 'memory_bank' : 'abacia_core');
}
function ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
function hashJson(value) {
  try { return hash(JSON.stringify(value)); } catch (e) { return ''; }
}
function safeToken(value, min, max) {
  value = String(value == null ? '' : value).trim();
  min = min == null ? 1 : min;
  max = max == null ? 500 : max;
  return value.length >= min && value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value) ? value : '';
}
function hamUid(value) {
  value = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._:-]{2,160}$/.test(value) ? value : '';
}
function requestToken(value) {
  value = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : '';
}
function canonicalCreatedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : '';
}
function providerName(value) {
  value = String(value || '').toLowerCase();
  return PROVIDERS.test(value) ? value : '';
}
function channelName(value) {
  value = String(value || '').toLowerCase();
  return CHANNELS.test(value) ? value : '';
}
function headers(extra) {
  const key = brainKey();
  return Object.assign({ apikey:key, Authorization:'Bearer ' + key,
    'Accept-Profile':schema() }, extra || {});
}
function rowUrl(query) {
  return brainUrl() + '/rest/v1/' + table() + (query || '');
}

function normalizeProvenance(value) {
  value = value || {};
  const family = value.pendingFamily === 'digest' ? 'digest'
    : value.pendingFamily === 'outreach' ? 'outreach' : '';
  if (value.kind !== 'autonomous_reach' || value.source !== 'core.outreach' || !family) {
    return null;
  }
  return { kind:'autonomous_reach', source:'core.outreach', pendingFamily:family };
}

async function prepareStore() {
  if (!brainUrl() || !brainKey()) return { ok:false, reason:'provider_truth_store_unconfigured' };
  try {
    await require('../claim_lock.js').ensureMessageReceiptUniqueness({
      url:brainUrl(), key:brainKey(), schema:schema(), table:table()
    });
    return { ok:true };
  } catch (e) {
    return { ok:false, reason:'provider_truth_uniqueness_unverified' };
  }
}

function sameRow(row, expected) {
  return !!(row && row.ham_uid === expected.ham_uid &&
    row.agent_global === expected.agent_global &&
    row.stamp_type === expected.stamp_type && row.source === expected.source &&
    String(row.content) === String(expected.content));
}

async function readRowsBySource(source, stampType, uid) {
  let query = '?source=eq.' + encodeURIComponent(source) +
    '&stamp_type=eq.' + encodeURIComponent(stampType);
  if (uid) query += '&ham_uid=eq.' + encodeURIComponent(uid);
  query += '&select=id,ham_uid,agent_global,stamp_type,source,content,created_at&limit=3';
  let response, rows;
  try {
    response = await fetch(rowUrl(query), { headers:headers() });
    if (!response || response.ok !== true) return { ok:false, reason:'provider_truth_readback_failed' };
    rows = await response.json();
  } catch (e) { return { ok:false, reason:'provider_truth_readback_failed' }; }
  if (!Array.isArray(rows)) return { ok:false, reason:'provider_truth_readback_invalid' };
  return { ok:true, rows:rows };
}

async function scanRows(stampType, options) {
  options = options || {};
  // Page oldest-first so concurrent immutable inserts land after the current
  // window instead of shifting every later offset and silently skipping a row.
  // Callers that need newest-first receive a local reversal after exhaustion.
  const direction = 'asc';
  const pageSize = Math.min(Math.max(Number(options.limit) || 200, 1), 1000);
  const maxPages = 1000;
  const allRows = [];
  for (let page = 0; page < maxPages; page++) {
    let query = '?stamp_type=eq.' + encodeURIComponent(stampType);
    if (options.uid) query += '&ham_uid=eq.' + encodeURIComponent(options.uid);
    if (options.sourcePrefix) query += '&source=like.' +
      encodeURIComponent(options.sourcePrefix + '*');
    query += '&order=created_at.' + direction + ',id.' + direction +
      '&limit=' + pageSize + '&offset=' + (page * pageSize) +
      '&select=id,ham_uid,agent_global,stamp_type,source,content,created_at';
    let response, rows;
    try {
      response = await fetch(rowUrl(query), { headers:headers() });
      if (!response || response.ok !== true) {
        return { ok:false, reason:'provider_truth_scan_failed' };
      }
      rows = await response.json();
    } catch (e) { return { ok:false, reason:'provider_truth_scan_failed' }; }
    if (!Array.isArray(rows)) return { ok:false, reason:'provider_truth_scan_invalid' };
    allRows.push.apply(allRows, rows);
    if (rows.length < pageSize) {
      return { ok:true, rows:options.desc ? allRows.reverse() : allRows };
    }
  }
  // Never silently strand an immutable provider fact behind a scan horizon.
  // An explicit failure keeps the request retryable and observable.
  return { ok:false, reason:'provider_truth_scan_page_limit' };
}

// Database unique indexes are the exactly-once arbiter. A lost write response
// is recovered by exact readback; a conflict is harmless only for identical
// immutable content.
async function exactAppend(row) {
  const prepared = await prepareStore();
  if (!prepared.ok) return prepared;
  const uid = GLOBAL_SOURCE_STAMPS.has(row.stamp_type) ? null : row.ham_uid;
  const before = await readRowsBySource(row.source, row.stamp_type, uid);
  if (!before.ok) return before;
  if (before.rows.length) {
    if (before.rows.length === 1 && sameRow(before.rows[0], row)) {
      return { ok:true, duplicate:true, row:before.rows[0] };
    }
    return { ok:false, reason:'provider_truth_replay_mismatch' };
  }
  let response, represented;
  try {
    response = await fetch(rowUrl(''), { method:'POST', headers:headers({
      'Content-Profile':schema(), 'Content-Type':'application/json',
      Prefer:'return=representation'
    }), body:JSON.stringify(row) });
    represented = response && response.ok
      ? await response.json().catch(function(){ return null; }) : null;
    if (response && response.ok && Array.isArray(represented) && represented.length === 1 &&
        sameRow(represented[0], row)) {
      return { ok:true, duplicate:false, row:represented[0] };
    }
  } catch (eWrite) { /* ambiguous; exact readback below decides */ }
  const after = await readRowsBySource(row.source, row.stamp_type, uid);
  if (!after.ok) return after;
  if (after.rows.length === 1 && sameRow(after.rows[0], row)) {
    return { ok:true, duplicate:true, recovered:true, row:after.rows[0] };
  }
  if (after.rows.length) return { ok:false, reason:'provider_truth_replay_mismatch' };
  return { ok:false, reason:response && response.ok
    ? 'provider_truth_write_unrepresented' : 'provider_truth_write_failed' };
}

function intentSource(provider, correlationKey) {
  return 'reach.provider_intent.' + provider + '.' + hash(correlationKey);
}
function attemptSource(provider, providerMessageId) {
  return 'reach.provider_attempt.' + provider + '.' + hash(providerMessageId);
}
function recoverySource(provider, providerMessageId) {
  return 'reach.provider_recovery.' + provider + '.' + hash(providerMessageId);
}
function eventSource(provider, providerMessageId, terminalState, proofScope,
  providerEventId, providerStatus) {
  return 'reach.provider_event.' + provider + '.' + hash(providerMessageId) + '.' +
    terminalState + '.' + String(proofScope || 'provider') + '.' +
    hash(providerEventId || providerStatus).slice(0, 32);
}
function orphanPrefix(provider, providerMessageId) {
  return 'reach.provider_orphan.' + provider + '.' + hash(providerMessageId) + '.';
}
function orphanSource(input) {
  return orphanPrefix(input.provider, input.providerMessageId) +
    hash(JSON.stringify({ state:input.terminalState, status:input.providerStatus,
      proof:input.proofScope, event:input.providerEventId || null })).slice(0, 40);
}
function finalizationSource(provider, providerMessageId) {
  return 'reach.provider_final.' + provider + '.' + hash(providerMessageId);
}

async function createProviderIntent(input) {
  input = input || {};
  const uid = hamUid(input.hamUid);
  const provider = providerName(input.provider);
  const channel = channelName(input.channel);
  const requestId = requestToken(input.requestId);
  const cycleId = requestToken(input.cycleId);
  const correlationKey = safeToken(input.correlationKey, 8, 500);
  const provenance = normalizeProvenance(input.provenance);
  const binding = safeToken(input.providerBinding, 1, 500);
  const trackingLabel = input.trackingLabel == null ? null
    : safeToken(input.trackingLabel, 8, 160);
  const artifactDigest = typeof input.artifact === 'string' && input.artifact.length
    ? hash(input.artifact) : '';
  const councilProofDigest = input.councilProof && typeof input.councilProof === 'object'
    ? hashJson(input.councilProof) : '';
  if (!uid || !provider || !channel || !requestId || !cycleId || !correlationKey ||
      !provenance || !binding || !artifactDigest || !councilProofDigest ||
      (input.trackingLabel != null && !trackingLabel)) {
    return { ok:false, reason:'provider_intent_binding_invalid' };
  }
  if ((provider === 'blooio' && channel !== 'text') ||
      (provider === 'nylas' && (channel !== 'email' || !trackingLabel))) {
    return { ok:false, reason:'provider_intent_channel_mismatch' };
  }
  const source = intentSource(provider, correlationKey);
  const content = JSON.stringify({ version:2, provider:provider, channel:channel,
    requestId:requestId, cycleId:cycleId, pendingFamily:provenance.pendingFamily,
    provenance:provenance, correlationDigest:hash(correlationKey),
    providerBindingDigest:hash(binding), trackingLabel:trackingLabel,
    artifactDigest:artifactDigest, councilProofDigest:councilProofDigest,
    effectAuthorized:true, providerAccepted:false });
  const row = { ham_uid:uid, agent_global:'ANEW', stamp_type:'REACH_PROVIDER_INTENT',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:INTENT:' + provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH ' + channel.toUpperCase() +
      '] durable provider intent before external effect', content:content, importance:6 };
  const appended = await exactAppend(row);
  return appended.ok ? { ok:true, source:source, duplicate:!!appended.duplicate,
    hamUid:uid, requestId:requestId, cycleId:cycleId,
    pendingFamily:provenance.pendingFamily } : appended;
}

async function readIntent(source) {
  source = safeToken(source, 20, 500);
  if (!source || source.indexOf('reach.provider_intent.') !== 0) {
    return { ok:false, reason:'provider_intent_source_invalid' };
  }
  const result = await readRowsBySource(source, 'REACH_PROVIDER_INTENT', null);
  if (!result.ok) return result;
  if (result.rows.length !== 1) return { ok:false, reason:result.rows.length
    ? 'provider_intent_binding_ambiguous' : 'provider_intent_binding_missing' };
  const row = result.rows[0];
  let content;
  try { content = JSON.parse(row.content || '{}'); }
  catch (e) { return { ok:false, reason:'provider_intent_binding_invalid' }; }
  if (hamUid(row.ham_uid) !== row.ham_uid || !providerName(content.provider) ||
      !channelName(content.channel) || !requestToken(content.requestId) ||
      !requestToken(content.cycleId) || !normalizeProvenance(content.provenance) ||
      !/^(outreach|digest)$/.test(content.pendingFamily || '') ||
      !/^[a-f0-9]{64}$/.test(content.correlationDigest || '') ||
      row.source !== 'reach.provider_intent.' + content.provider + '.' +
        content.correlationDigest ||
      !/^[a-f0-9]{64}$/.test(content.providerBindingDigest || '') ||
      !/^[a-f0-9]{64}$/.test(content.artifactDigest || '') ||
      !/^[a-f0-9]{64}$/.test(content.councilProofDigest || '') ||
      content.pendingFamily !== content.provenance.pendingFamily ||
      content.effectAuthorized !== true || content.providerAccepted !== false) {
    return { ok:false, reason:'provider_intent_binding_invalid' };
  }
  return { ok:true, row:row, content:content };
}

async function readAttempt(provider, providerMessageId) {
  const source = attemptSource(provider, providerMessageId);
  const result = await readRowsBySource(source, 'REACH_PROVIDER_ATTEMPT', null);
  if (!result.ok) return result;
  if (result.rows.length !== 1) return { ok:false, reason:result.rows.length
    ? 'provider_attempt_binding_ambiguous' : 'provider_attempt_binding_missing' };
  const row = result.rows[0];
  let content;
  try { content = JSON.parse(row.content || '{}'); }
  catch (e) { return { ok:false, reason:'provider_attempt_binding_invalid' }; }
  if (hamUid(row.ham_uid) !== row.ham_uid || content.provider !== provider ||
      content.providerMessageId !== providerMessageId ||
      content.providerAccepted !== true || content.pendingDelivery !== true ||
      content.delivered !== false || !requestToken(content.requestId) ||
      !requestToken(content.cycleId) || !channelName(content.channel) ||
      !/^(outreach|digest)$/.test(content.pendingFamily || '') ||
      !safeToken(content.providerIntentSource, 20, 500) ||
      !canonicalCreatedAt(row.created_at)) {
    return { ok:false, reason:'provider_attempt_binding_invalid' };
  }
  return { ok:true, row:row, content:content };
}

async function registerProviderAttempt(input) {
  input = input || {};
  const provider = providerName(input.provider);
  const providerMessageId = safeToken(input.providerMessageId, 1, 500);
  const providerIntentSource = safeToken(input.providerIntentSource, 20, 500);
  if (!provider || !providerMessageId || !providerIntentSource) {
    return { ok:false, reason:'provider_attempt_binding_invalid' };
  }
  const intentResult = await readIntent(providerIntentSource);
  if (!intentResult.ok) return intentResult;
  const intent = intentResult.content;
  if (intent.provider !== provider ||
      (provider === 'blooio' && intent.channel !== 'text') ||
      (provider === 'nylas' && intent.channel !== 'email')) {
    return { ok:false, reason:'provider_attempt_intent_mismatch' };
  }
  const source = attemptSource(provider, providerMessageId);
  const content = JSON.stringify({ version:2, provider:provider,
    channel:intent.channel, providerMessageId:providerMessageId,
    providerIntentSource:providerIntentSource, requestId:intent.requestId,
    cycleId:intent.cycleId, pendingFamily:intent.pendingFamily,
    providerBindingDigest:intent.providerBindingDigest,
    trackingLabel:intent.trackingLabel || null,
    artifactDigest:intent.artifactDigest,
    councilProofDigest:intent.councilProofDigest,
    providerAccepted:true, pendingDelivery:true, delivered:false });
  const row = { ham_uid:intentResult.row.ham_uid, agent_global:'ANEW',
    stamp_type:'REACH_PROVIDER_ATTEMPT',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:ATTEMPT:' + provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH ' + intent.channel.toUpperCase() +
      '] provider accepted; terminal delivery pending', content:content, importance:6 };
  const appended = await exactAppend(row);
  if (!appended.ok) return appended;
  const adoption = await adoptOrphans({ row:appended.row, content:JSON.parse(content) });
  if (!adoption.ok) return adoption;
  return { ok:true, source:source, intentSource:providerIntentSource,
    duplicate:!!appended.duplicate, hamUid:intentResult.row.ham_uid,
    requestId:intent.requestId, cycleId:intent.cycleId,
    pendingFamily:intent.pendingFamily, adoptedOrphans:adoption.adopted };
}

// The external effect has already happened when this seam runs. If the primary
// provider-attempt append/readback is temporarily unavailable, preserve the
// exact provider ID and its pre-effect intent in a second immutable row. A
// reconciler can then finish the binding without ever calling the provider
// again. The normal OUTREACH/DIGEST pending row is a second recovery carrier.
async function recordProviderAcceptanceRecovery(input) {
  input = input || {};
  const provider = providerName(input.provider);
  const providerMessageId = safeToken(input.providerMessageId, 1, 500);
  const providerIntentSource = safeToken(input.providerIntentSource, 20, 500);
  if (!provider || !providerMessageId || !providerIntentSource) {
    return { ok:false, reason:'provider_recovery_binding_invalid' };
  }
  const intentResult = await readIntent(providerIntentSource);
  if (!intentResult.ok) return intentResult;
  const intent = intentResult.content;
  if (intent.provider !== provider ||
      (provider === 'blooio' && intent.channel !== 'text') ||
      (provider === 'nylas' && intent.channel !== 'email')) {
    return { ok:false, reason:'provider_recovery_intent_mismatch' };
  }
  const source = recoverySource(provider, providerMessageId);
  const content = JSON.stringify({ version:2, provider:provider,
    channel:intent.channel, providerMessageId:providerMessageId,
    providerIntentSource:providerIntentSource, requestId:intent.requestId,
    cycleId:intent.cycleId, pendingFamily:intent.pendingFamily,
    providerBindingDigest:intent.providerBindingDigest,
    trackingLabel:intent.trackingLabel || null,
    artifactDigest:intent.artifactDigest,
    councilProofDigest:intent.councilProofDigest,
    providerAccepted:true, pendingDelivery:true, delivered:false,
    attemptBindingPending:true });
  const row = { ham_uid:intentResult.row.ham_uid, agent_global:'ANEW',
    stamp_type:'REACH_PROVIDER_RECOVERY',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:RECOVERY:' + provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH ' + intent.channel.toUpperCase() +
      '] provider accepted; attempt binding recovery pending', content:content, importance:7 };
  const appended = await exactAppend(row);
  if (!appended.ok) return appended;
  scheduleReconcile(intentResult.row.ham_uid);
  return { ok:true, source:source, duplicate:!!appended.duplicate,
    hamUid:intentResult.row.ham_uid, requestId:intent.requestId,
    cycleId:intent.cycleId, pendingFamily:intent.pendingFamily };
}

function pendingIdentity(attempt) {
  return attempt.pendingFamily === 'digest'
    ? { stampType:'DIGEST', source:'outreach.digest.pending.' + attempt.requestId }
    : { stampType:'OUTREACH', source:'outreach.pending.' + attempt.requestId };
}

function pendingMatches(attempt, pendingRow) {
  let content;
  try { content = JSON.parse(pendingRow && pendingRow.content || '{}'); }
  catch (e) { return null; }
  const identity = pendingIdentity(attempt);
  // A definitive voice rejection may choose one text fallback. In that case
  // proposedChannel remains voice for lineage while fallback_channel is the
  // actual provider attempt that this terminal receipt must close.
  const declaredChannel = content.fallback_channel || content.proposedChannel || null;
  const channelMatches = attempt.pendingFamily === 'digest'
    ? (!declaredChannel || declaredChannel === attempt.channel)
    : declaredChannel === attempt.channel;
  return pendingRow.ham_uid === attempt.hamUid && pendingRow.agent_global === 'ANEW' &&
    pendingRow.stamp_type === identity.stampType && pendingRow.source === identity.source &&
    content.requestId === attempt.requestId && content.cycleId === attempt.cycleId &&
    content.send_receipt === attempt.providerMessageId &&
    content.providerAccepted === true && content.pendingDelivery === true &&
    content.delivered === false && channelMatches ? content : null;
}

async function readPending(attempt) {
  const identity = pendingIdentity(attempt);
  const result = await readRowsBySource(identity.source, identity.stampType, attempt.hamUid);
  if (!result.ok) return result;
  if (!result.rows.length) return { ok:true, found:false, source:identity.source,
    stampType:identity.stampType };
  if (result.rows.length !== 1) return { ok:false, reason:'outreach_pending_binding_ambiguous' };
  const content = pendingMatches(attempt, result.rows[0]);
  if (!content) return { ok:false, reason:'outreach_pending_binding_mismatch' };
  return { ok:true, found:true, source:identity.source, stampType:identity.stampType,
    row:result.rows[0], content:content };
}

function pendingVisibilityGraceMs() {
  const configured = Number(process.env.REACH_PENDING_VISIBILITY_GRACE_MS);
  return Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, 60000) : 5000;
}

async function recoverMissingPending(attempt, attemptRow) {
  const identity = pendingIdentity(attempt);
  const content = JSON.stringify({ version:2, requestId:attempt.requestId,
    cycleId:attempt.cycleId, proposedChannel:attempt.channel,
    providerAccepted:true, pendingDelivery:true, delivered:false, sent:false,
    send_receipt:attempt.providerMessageId,
    providerAttemptSource:attempt.source,
    providerIntentSource:attempt.providerIntentSource,
    recoveredFromProviderTruth:true,
    recoveryReason:'authenticated_terminal_after_pending_visibility_grace' });
  const row = { ham_uid:attempt.hamUid, agent_global:'ANEW',
    stamp_type:identity.stampType,
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:PENDING_RECOVERY:' + ymd() + '⬡',
    source:identity.source, summary:'[REACH ' + attempt.channel.toUpperCase() +
      '] provider acceptance audit recovered from durable terminal truth',
    content:content, importance:6 };
  const appended = await exactAppend(row);
  if (appended.ok) return { ok:true, found:true, recovered:true,
    source:identity.source, stampType:identity.stampType,
    row:appended.row, content:JSON.parse(content) };
  // Core outreach may have won the same pending source while this recovery was
  // racing. Its richer row is authoritative when its exact binding reads back.
  if (appended.reason === 'provider_truth_replay_mismatch') {
    const raced = await readPending(attempt);
    if (raced.ok && raced.found) return Object.assign({ recovered:false }, raced);
  }
  return appended;
}

async function ensurePending(attempt, attemptRow) {
  const pending = await readPending(attempt);
  if (!pending.ok || pending.found) return pending;
  const created = new Date(attemptRow.created_at || 0).getTime();
  const age = Number.isFinite(created) ? Date.now() - created : 0;
  const grace = pendingVisibilityGraceMs();
  if (age < grace) return { ok:true, found:false, source:pending.source,
    visibilityGrace:true, retryAfterMs:Math.max(grace - age, 1) };
  return recoverMissingPending(attempt, attemptRow);
}

function receiptSource(attempt, terminalState) {
  const disposition = terminalState === 'delivered' ? 'sent' : 'failed';
  const prefix = attempt.pendingFamily === 'digest' ? 'outreach.digest.' : 'outreach.';
  return prefix + disposition + '.' + attempt.requestId + '.' + attempt.channel + '.' +
    hash(attempt.providerMessageId).slice(0, 32);
}

async function readFinalization(attempt) {
  const source = finalizationSource(attempt.provider, attempt.providerMessageId);
  const result = await readRowsBySource(source, 'REACH_PROVIDER_FINALIZATION', null);
  if (!result.ok) return result;
  if (!result.rows.length) return { ok:true, found:false, source:source };
  if (result.rows.length !== 1) return { ok:false, reason:'provider_finalization_ambiguous' };
  let content;
  try { content = JSON.parse(result.rows[0].content || '{}'); }
  catch (e) { return { ok:false, reason:'provider_finalization_invalid' }; }
  if (result.rows[0].ham_uid !== attempt.hamUid || content.provider !== attempt.provider ||
      content.providerMessageId !== attempt.providerMessageId ||
      content.requestId !== attempt.requestId || content.cycleId !== attempt.cycleId ||
      !/^(delivered|failed)$/.test(content.terminalState || '') ||
      !PROOF_SCOPES.test(content.proofScope || '') ||
      !safeToken(content.providerEventSource, 20, 500)) {
    return { ok:false, reason:'provider_finalization_mismatch' };
  }
  return { ok:true, found:true, source:source, row:result.rows[0], content:content };
}

async function claimFinalization(attempt, terminalEvent) {
  let current = await readFinalization(attempt);
  if (!current.ok) return current;
  if (!current.found) {
    const source = current.source;
    const content = JSON.stringify({ version:2, provider:attempt.provider,
      channel:attempt.channel, providerMessageId:attempt.providerMessageId,
      requestId:attempt.requestId, cycleId:attempt.cycleId,
      pendingFamily:attempt.pendingFamily, terminalState:terminalEvent.terminalState,
      providerStatus:terminalEvent.providerStatus,
      proofScope:terminalEvent.proofScope,
      providerEventSource:terminalEvent.source,
      providerAttemptSource:attempt.source,
      eventCreatedAt:terminalEvent.createdAt || null,
      firstTerminalWins:true });
    const row = { ham_uid:attempt.hamUid, agent_global:'ANEW',
      stamp_type:'REACH_PROVIDER_FINALIZATION',
      acl_stamp:'⬡B:core.reach.provider_delivery_saga:FINAL:' + ymd() + '⬡',
      source:source, summary:'[REACH ' + attempt.channel.toUpperCase() +
        '] first authenticated terminal disposition fixed', content:content, importance:8 };
    const appended = await exactAppend(row);
    if (appended.ok) current = { ok:true, found:true, source:source,
      row:appended.row, content:JSON.parse(content) };
    else {
      // A competing terminal state may have committed the one canonical source.
      current = await readFinalization(attempt);
      if (!current.ok || !current.found) return appended;
    }
  }
  return Object.assign({}, current, {
    outcomeDuplicate:current.content.terminalState === terminalEvent.terminalState,
    outcomeConflict:current.content.terminalState !== terminalEvent.terminalState
  });
}

async function appendTerminalReceipt(attempt, finalization, pending) {
  const winner = finalization.content;
  const delivered = winner.terminalState === 'delivered';
  const stampType = delivered ? 'OUTREACH_DELIVERY' : 'OUTREACH_FAILURE';
  const source = receiptSource(attempt, winner.terminalState);
  const content = JSON.stringify({ version:2, requestId:attempt.requestId,
    cycleId:attempt.cycleId, channel:attempt.channel, provider:attempt.provider,
    providerMessageId:attempt.providerMessageId, providerStatus:winner.providerStatus,
    providerIntentSource:attempt.providerIntentSource,
    providerAttemptSource:attempt.source,
    providerAttemptAt:attempt.createdAt,
    providerEventSource:winner.providerEventSource,
    providerFinalizationSource:finalization.source,
    pendingSource:pending.source, pendingFamily:attempt.pendingFamily,
    pendingRecovered:pending.recovered === true,
    terminal:true, delivered:delivered, failed:!delivered,
    bounced:winner.providerStatus === 'bounce_detected',
    proofScope:winner.proofScope,
    humanReadConfirmed:winner.proofScope === 'nylas_tracked_thread_reply' });
  const row = { ham_uid:attempt.hamUid, agent_global:'ANEW', stamp_type:stampType,
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:' +
      (delivered ? 'DELIVERY' : 'FAILURE') + ':' + ymd() + '⬡', source:source,
    summary:'[REACH ' + attempt.channel.toUpperCase() + '] provider terminal ' +
      (delivered ? 'delivery confirmed' : 'delivery failed'),
    content:content, importance:delivered ? 8 : 7 };
  const appended = await exactAppend(row);
  return appended.ok ? { ok:true, terminal:true, delivered:delivered,
    failed:!delivered, source:source, duplicate:!!appended.duplicate,
    outcomeConflict:!!finalization.outcomeConflict,
    outcomeDuplicate:!!finalization.outcomeDuplicate,
    winningTerminalState:winner.terminalState,
    pendingRecovered:pending.recovered === true } : appended;
}

function attemptView(attemptRow, content) {
  return { hamUid:attemptRow.ham_uid, source:attemptRow.source,
    provider:content.provider, channel:content.channel,
    providerMessageId:content.providerMessageId,
    providerIntentSource:content.providerIntentSource,
    createdAt:canonicalCreatedAt(attemptRow.created_at),
    requestId:content.requestId, cycleId:content.cycleId,
    pendingFamily:content.pendingFamily,
    providerBindingDigest:content.providerBindingDigest,
    trackingLabel:content.trackingLabel || null };
}

async function reconcileEvent(attemptRow, eventRow) {
  let a, e;
  try { a = JSON.parse(attemptRow.content || '{}'); e = JSON.parse(eventRow.content || '{}'); }
  catch (err) { return { ok:false, reason:'provider_truth_receipt_invalid' }; }
  const attempt = attemptView(attemptRow, a);
  const terminalEvent = { source:eventRow.source, terminalState:e.terminalState,
    providerStatus:e.providerStatus, proofScope:e.proofScope,
    createdAt:eventRow.created_at || null };
  if (eventRow.ham_uid !== attempt.hamUid || e.provider !== attempt.provider ||
      e.channel !== attempt.channel || e.providerMessageId !== attempt.providerMessageId ||
      e.providerAttemptSource !== attempt.source ||
      !/^(delivered|failed)$/.test(e.terminalState || '')) {
    return { ok:false, reason:'provider_event_binding_mismatch' };
  }
  const pending = await ensurePending(attempt, attemptRow);
  if (!pending.ok) return pending;
  if (!pending.found) return { ok:true, reconciled:false,
    reason:'outreach_pending_not_committed_yet', retryAfterMs:pending.retryAfterMs || null };
  const finalization = await claimFinalization(attempt, terminalEvent);
  if (!finalization.ok) return finalization;
  const receipt = await appendTerminalReceipt(attempt, finalization, pending);
  return Object.assign({ reconciled:receipt.ok }, receipt);
}

function scheduleReconcile(uid) {
  [250, 2000, 6000, 15000].forEach(function(delay) {
    const timer = setTimeout(function() {
      reconcileHam(uid).catch(function(){});
    }, delay);
    if (timer.unref) timer.unref();
  });
}

function exactRecoveryBinding(row, content) {
  const provider = providerName(content && content.provider);
  const providerMessageId = safeToken(content && content.providerMessageId, 1, 500);
  const providerIntentSource = safeToken(content && content.providerIntentSource, 20, 500);
  const channel = channelName(content && content.channel);
  const requestId = requestToken(content && content.requestId);
  const cycleId = requestToken(content && content.cycleId);
  const pendingFamily = /^(outreach|digest)$/.test(content && content.pendingFamily || '')
    ? content.pendingFamily : '';
  if (!row || hamUid(row.ham_uid) !== row.ham_uid || row.agent_global !== 'ANEW' ||
      row.stamp_type !== 'REACH_PROVIDER_RECOVERY' || !provider || !providerMessageId ||
      !providerIntentSource || !channel || !requestId || !cycleId || !pendingFamily ||
      row.source !== recoverySource(provider, providerMessageId) ||
      content.providerAccepted !== true || content.pendingDelivery !== true ||
      content.delivered !== false || content.attemptBindingPending !== true ||
      !/^[a-f0-9]{64}$/.test(content.providerBindingDigest || '') ||
      !/^[a-f0-9]{64}$/.test(content.artifactDigest || '') ||
      !/^[a-f0-9]{64}$/.test(content.councilProofDigest || '') ||
      (provider === 'blooio' && channel !== 'text') ||
      (provider === 'nylas' && channel !== 'email')) {
    return null;
  }
  return { hamUid:row.ham_uid, provider:provider, channel:channel,
    providerMessageId:providerMessageId, providerIntentSource:providerIntentSource,
    requestId:requestId, cycleId:cycleId, pendingFamily:pendingFamily,
    providerBindingDigest:content.providerBindingDigest,
    trackingLabel:content.trackingLabel || null,
    artifactDigest:content.artifactDigest,
    councilProofDigest:content.councilProofDigest };
}

async function ensureAcceptanceAttempt(binding) {
  const intentResult = await readIntent(binding.providerIntentSource);
  if (!intentResult.ok) return intentResult;
  const intent = intentResult.content;
  if (intentResult.row.ham_uid !== binding.hamUid || intent.provider !== binding.provider ||
      intent.channel !== binding.channel || intent.requestId !== binding.requestId ||
      intent.cycleId !== binding.cycleId || intent.pendingFamily !== binding.pendingFamily ||
      (binding.providerBindingDigest &&
        intent.providerBindingDigest !== binding.providerBindingDigest) ||
      (binding.artifactDigest && intent.artifactDigest !== binding.artifactDigest) ||
      (binding.councilProofDigest &&
        intent.councilProofDigest !== binding.councilProofDigest) ||
      (binding.trackingLabel != null &&
        (intent.trackingLabel || null) !== binding.trackingLabel)) {
    return { ok:false, reason:'provider_recovery_intent_mismatch' };
  }
  const existing = await readAttempt(binding.provider, binding.providerMessageId);
  if (existing.ok) {
    if (existing.row.ham_uid !== binding.hamUid ||
        existing.content.providerIntentSource !== binding.providerIntentSource ||
        existing.content.requestId !== binding.requestId ||
        existing.content.cycleId !== binding.cycleId ||
        existing.content.pendingFamily !== binding.pendingFamily) {
      return { ok:false, reason:'provider_recovery_attempt_mismatch' };
    }
    return { ok:true, recovered:false, source:existing.row.source };
  }
  if (existing.reason !== 'provider_attempt_binding_missing') return existing;
  const registered = await registerProviderAttempt({ provider:binding.provider,
    providerMessageId:binding.providerMessageId,
    providerIntentSource:binding.providerIntentSource });
  return registered.ok ? Object.assign({ recovered:true }, registered) : registered;
}

function pendingRecoveryBinding(row, family) {
  let content;
  try { content = JSON.parse(row && row.content || '{}'); }
  catch (e) { return { flagged:true, binding:null }; }
  if (content.providerAcceptanceRecovery !== true) {
    return { flagged:false, binding:null };
  }
  const provider = providerName(content.provider);
  const providerMessageId = safeToken(content.send_receipt, 1, 500);
  const providerIntentSource = safeToken(content.providerIntentSource, 20, 500);
  const requestId = requestToken(content.requestId);
  const cycleId = requestToken(content.cycleId);
  const actualChannel = channelName(content.fallback_channel || content.proposedChannel);
  const expectedStamp = family === 'digest' ? 'DIGEST' : 'OUTREACH';
  const expectedSource = (family === 'digest' ? 'outreach.digest.pending.' :
    'outreach.pending.') + requestId;
  if (!row || hamUid(row.ham_uid) !== row.ham_uid || row.agent_global !== 'ANEW' ||
      row.stamp_type !== expectedStamp || row.source !== expectedSource || !provider ||
      !providerMessageId || !providerIntentSource || !requestId || !cycleId ||
      content.providerAccepted !== true || content.pendingDelivery !== true ||
      content.delivered !== false || content.sent !== false || !actualChannel ||
      (provider === 'blooio' && actualChannel !== 'text') ||
      (provider === 'nylas' && actualChannel !== 'email')) {
    return { flagged:true, binding:null };
  }
  return { flagged:true, binding:{ hamUid:row.ham_uid, provider:provider,
    channel:actualChannel, providerMessageId:providerMessageId,
    providerIntentSource:providerIntentSource, requestId:requestId,
    cycleId:cycleId, pendingFamily:family } };
}

async function reconcileAcceptanceRecoveries(uid) {
  let recovered = 0, scanned = 0;
  const durable = await scanRows('REACH_PROVIDER_RECOVERY', { uid:uid, limit:500 });
  if (!durable.ok) return { ok:false, reason:'provider_recovery_scan_failed' };
  for (const row of durable.rows) {
    scanned++;
    let content;
    try { content = JSON.parse(row.content || '{}'); }
    catch (e) { return { ok:false, reason:'provider_recovery_binding_invalid' }; }
    const binding = exactRecoveryBinding(row, content);
    if (!binding) return { ok:false, reason:'provider_recovery_binding_invalid' };
    const ensured = await ensureAcceptanceAttempt(binding);
    if (!ensured.ok) return ensured;
    if (ensured.recovered) recovered++;
  }
  for (const spec of [
    { stampType:'OUTREACH', family:'outreach', sourcePrefix:'outreach.pending.' },
    { stampType:'DIGEST', family:'digest', sourcePrefix:'outreach.digest.pending.' }
  ]) {
    const rows = await scanRows(spec.stampType, { uid:uid,
      sourcePrefix:spec.sourcePrefix, limit:500 });
    if (!rows.ok) return { ok:false, reason:'provider_pending_recovery_scan_failed' };
    for (const row of rows.rows) {
      const candidate = pendingRecoveryBinding(row, spec.family);
      if (!candidate.flagged) continue;
      scanned++;
      if (!candidate.binding) {
        return { ok:false, reason:'provider_pending_recovery_binding_invalid' };
      }
      const ensured = await ensureAcceptanceAttempt(candidate.binding);
      if (!ensured.ok) return ensured;
      if (ensured.recovered) recovered++;
    }
  }
  return { ok:true, scanned:scanned, recovered:recovered };
}

function normalizedTerminal(input) {
  input = input || {};
  const provider = providerName(input.provider);
  const providerMessageId = safeToken(input.providerMessageId, 1, 500);
  const terminalState = /^(delivered|failed)$/.test(input.terminalState || '')
    ? input.terminalState : '';
  const providerStatus = safeToken(input.providerStatus, 1, 80);
  const providerEventId = safeToken(input.providerEventId, 1, 500) || null;
  const proofScope = PROOF_SCOPES.test(input.proofScope || '') ? input.proofScope : '';
  const providerBinding = safeToken(input.providerBinding, 1, 500) || null;
  const trackingLabel = safeToken(input.trackingLabel, 8, 160) || null;
  if (!provider || !providerMessageId || !terminalState || !providerStatus) {
    return { ok:false, reason:'provider_terminal_event_invalid' };
  }
  if (!proofScope) return { ok:false, reason:'provider_terminal_proof_scope_invalid' };
  if ((provider === 'blooio' && proofScope.indexOf('blooio_') !== 0) ||
      (provider === 'nylas' && proofScope.indexOf('nylas_') !== 0)) {
    return { ok:false, reason:'provider_terminal_proof_scope_mismatch' };
  }
  return { ok:true, value:{ provider:provider, providerMessageId:providerMessageId,
    terminalState:terminalState, providerStatus:providerStatus,
    providerEventId:providerEventId, proofScope:proofScope,
    providerBinding:providerBinding, trackingLabel:trackingLabel } };
}

function validateTerminalBinding(attempt, input) {
  const incomingDigest = input.providerBinding ? hash(input.providerBinding) : null;
  if (attempt.provider === 'nylas') {
    if (!incomingDigest || incomingDigest !== attempt.providerBindingDigest) {
      return { ok:false, reason:'provider_terminal_binding_mismatch' };
    }
  } else if (incomingDigest && incomingDigest !== attempt.providerBindingDigest) {
    return { ok:false, reason:'provider_terminal_binding_mismatch' };
  }
  if (attempt.provider === 'nylas' && input.terminalState === 'delivered') {
    if (!input.trackingLabel || !attempt.trackingLabel ||
        input.trackingLabel !== attempt.trackingLabel) {
      return { ok:false, reason:'provider_terminal_tracking_label_mismatch' };
    }
  }
  return { ok:true };
}

async function appendOrphan(input) {
  const source = orphanSource(input);
  const content = JSON.stringify({ version:2, provider:input.provider,
    providerMessageId:input.providerMessageId, terminalState:input.terminalState,
    providerStatus:input.providerStatus, providerEventId:input.providerEventId,
    proofScope:input.proofScope,
    providerBindingDigest:input.providerBinding ? hash(input.providerBinding) : null,
    trackingLabel:input.trackingLabel || null,
    awaitingProviderAttempt:true });
  const row = { ham_uid:ORPHAN_HAM, agent_global:'ANEW',
    stamp_type:'REACH_PROVIDER_ORPHAN',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:ORPHAN:' + input.provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH] authenticated terminal event awaiting exact provider binding',
    content:content, importance:7 };
  const appended = await exactAppend(row);
  return appended.ok ? { ok:true, persisted:true, orphaned:true,
    orphanSource:source, duplicate:!!appended.duplicate } : appended;
}

async function findMatchingIntent(input) {
  // A recipient phone or Nylas grant can be shared by unrelated/manual sends.
  // Only the unique Nylas tracking label is exact enough to bridge the tiny
  // webhook-before-send-response race. Every weaker event remains an orphan
  // until the real provider response binds its exact message ID.
  if (input.provider !== 'nylas' || input.terminalState !== 'delivered' ||
      !input.providerBinding || !input.trackingLabel) {
    return { ok:true, found:false };
  }
  const intents = await scanRows('REACH_PROVIDER_INTENT', { limit:500, desc:true });
  if (!intents.ok) return intents;
  const attempts = await scanRows('REACH_PROVIDER_ATTEMPT', { limit:500, desc:true });
  if (!attempts.ok) return attempts;
  const bound = new Set();
  attempts.rows.forEach(function(row) {
    try {
      const value = JSON.parse(row.content || '{}');
      if (value.providerIntentSource) bound.add(value.providerIntentSource);
    } catch (e) {}
  });
  const incomingDigest = hash(input.providerBinding);
  const matches = intents.rows.filter(function(row) {
    if (bound.has(row.source)) return false;
    try {
      const value = JSON.parse(row.content || '{}');
      if (value.provider !== input.provider ||
          value.providerBindingDigest !== incomingDigest) return false;
      return value.trackingLabel === input.trackingLabel;
    } catch (e) { return false; }
  });
  if (matches.length === 1) return { ok:true, found:true, row:matches[0] };
  return { ok:true, found:false, ambiguous:matches.length > 1 };
}

async function recordBoundTerminal(attemptResult, input) {
  const attempt = attemptView(attemptResult.row, attemptResult.content);
  const valid = validateTerminalBinding(attempt, input);
  if (!valid.ok) return valid;
  const source = eventSource(input.provider, input.providerMessageId,
    input.terminalState, input.proofScope, input.providerEventId, input.providerStatus);
  const content = JSON.stringify({ version:2, provider:input.provider,
    channel:attempt.channel, providerMessageId:input.providerMessageId,
    providerStatus:input.providerStatus, providerEventId:input.providerEventId,
    terminalState:input.terminalState, proofScope:input.proofScope,
    providerAttemptSource:attemptResult.row.source });
  const row = { ham_uid:attempt.hamUid, agent_global:'ANEW',
    stamp_type:'REACH_PROVIDER_EVENT',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:EVENT:' + input.provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH ' + attempt.channel.toUpperCase() +
      '] authenticated provider terminal event', content:content, importance:7 };
  const appended = await exactAppend(row);
  if (!appended.ok) return appended;
  const reconciled = await reconcileEvent(attemptResult.row, appended.row);
  if (reconciled.ok && reconciled.reconciled === false) scheduleReconcile(attempt.hamUid);
  return Object.assign({ ok:reconciled.ok, eventRecorded:true,
    eventSource:source, hamUid:attempt.hamUid }, reconciled);
}

async function adoptOrphans(attemptResult) {
  const attempt = attemptView(attemptResult.row, attemptResult.content);
  const scanned = await scanRows('REACH_PROVIDER_ORPHAN', {
    sourcePrefix:orphanPrefix(attempt.provider, attempt.providerMessageId), limit:200
  });
  if (!scanned.ok) return scanned;
  let adopted = 0, rejected = 0;
  for (const row of scanned.rows) {
    let orphan;
    try { orphan = JSON.parse(row.content || '{}'); }
    catch (e) { rejected++; continue; }
    const bindingMatches = attempt.provider === 'nylas'
      ? !!orphan.providerBindingDigest &&
        orphan.providerBindingDigest === attempt.providerBindingDigest
      : !orphan.providerBindingDigest ||
        orphan.providerBindingDigest === attempt.providerBindingDigest;
    const labelMatches = orphan.terminalState !== 'delivered' ||
      attempt.provider !== 'nylas' || orphan.trackingLabel === attempt.trackingLabel;
    if (!bindingMatches || !labelMatches) { rejected++; continue; }
    const input = { provider:orphan.provider, providerMessageId:orphan.providerMessageId,
      terminalState:orphan.terminalState, providerStatus:orphan.providerStatus,
      providerEventId:orphan.providerEventId, proofScope:orphan.proofScope,
      // Digests are compared here; recordBoundTerminal has already been given
      // the binding-safe decision and must not need the raw recipient/grant.
      providerBinding:null, trackingLabel:orphan.trackingLabel || null };
    // Blooio may omit the routing identifier after the exact message ID exists.
    // Nylas adoption was digest-checked above, so pass a private match marker.
    const result = await recordBoundTerminalDigestChecked(attemptResult, input);
    if (!result.ok) return result;
    adopted++;
  }
  return { ok:true, adopted:adopted, rejected:rejected };
}

async function recordBoundTerminalDigestChecked(attemptResult, input) {
  const attempt = attemptView(attemptResult.row, attemptResult.content);
  if (attempt.provider === 'nylas' && input.terminalState === 'delivered' &&
      input.trackingLabel !== attempt.trackingLabel) {
    return { ok:false, reason:'provider_terminal_tracking_label_mismatch' };
  }
  const source = eventSource(input.provider, input.providerMessageId,
    input.terminalState, input.proofScope, input.providerEventId, input.providerStatus);
  const content = JSON.stringify({ version:2, provider:input.provider,
    channel:attempt.channel, providerMessageId:input.providerMessageId,
    providerStatus:input.providerStatus, providerEventId:input.providerEventId,
    terminalState:input.terminalState, proofScope:input.proofScope,
    providerAttemptSource:attemptResult.row.source });
  const row = { ham_uid:attempt.hamUid, agent_global:'ANEW',
    stamp_type:'REACH_PROVIDER_EVENT',
    acl_stamp:'⬡B:core.reach.provider_delivery_saga:EVENT:' + input.provider + ':' + ymd() + '⬡',
    source:source, summary:'[REACH ' + attempt.channel.toUpperCase() +
      '] authenticated provider terminal event adopted from durable orphan',
    content:content, importance:7 };
  const appended = await exactAppend(row);
  if (!appended.ok) return appended;
  const reconciled = await reconcileEvent(attemptResult.row, appended.row);
  if (reconciled.ok && reconciled.reconciled === false) scheduleReconcile(attempt.hamUid);
  return Object.assign({ ok:reconciled.ok, eventRecorded:true,
    eventSource:source, hamUid:attempt.hamUid }, reconciled);
}

async function recordTerminalEvent(rawInput) {
  const normalized = normalizedTerminal(rawInput);
  if (!normalized.ok) return normalized;
  const input = normalized.value;
  let attemptResult = await readAttempt(input.provider, input.providerMessageId);
  if (!attemptResult.ok && attemptResult.reason === 'provider_attempt_binding_missing') {
    const intent = await findMatchingIntent(input);
    if (!intent.ok) return intent;
    if (intent.found) {
      const registered = await registerProviderAttempt({ provider:input.provider,
        providerMessageId:input.providerMessageId,
        providerIntentSource:intent.row.source });
      if (registered.ok) attemptResult = await readAttempt(input.provider,
        input.providerMessageId);
      else {
        // The event is already authenticated. A transient attempt write/readback
        // failure must never turn the webhook into a successful discard.
        const orphan = await appendOrphan(input);
        return Object.assign({}, orphan, { eventRecorded:false,
          reason:orphan.ok ? 'provider_attempt_binding_pending' : orphan.reason,
          bindingRegistrationReason:registered.reason || null });
      }
    }
  }
  if (!attemptResult.ok) {
    if (attemptResult.reason !== 'provider_attempt_binding_missing') return attemptResult;
    const orphan = await appendOrphan(input);
    return Object.assign({}, orphan, { eventRecorded:false,
      reason:orphan.ok ? 'provider_attempt_binding_pending' : orphan.reason });
  }
  return recordBoundTerminal(attemptResult, input);
}

async function reconcileHam(uid) {
  uid = hamUid(uid);
  if (!uid) return { ok:false, reason:'ham_uid_invalid' };
  // Repair the post-effect seam before scanning attempts/events. This path only
  // binds a provider ID already proven to belong to an immutable pre-effect
  // intent; it never performs or retries the external send.
  const recoveries = await reconcileAcceptanceRecoveries(uid);
  if (!recoveries.ok) return recoveries;
  const attempts = await scanRows('REACH_PROVIDER_ATTEMPT', { uid:uid, limit:500 });
  if (!attempts.ok) return { ok:false, reason:'provider_attempt_scan_failed' };
  for (const attemptRow of attempts.rows) {
    let content;
    try { content = JSON.parse(attemptRow.content || '{}'); }
    catch (e) { return { ok:false, reason:'provider_attempt_binding_invalid' }; }
    const adopted = await adoptOrphans({ row:attemptRow, content:content });
    if (!adopted.ok) return adopted;
  }
  const events = await scanRows('REACH_PROVIDER_EVENT', { uid:uid, limit:500 });
  if (!events.ok) return { ok:false, reason:'provider_event_scan_failed' };
  let reconciled = 0, pending = 0, conflicts = 0;
  // Oldest authenticated event wins. The canonical finalization row is also a
  // monotonic database arbiter if two workers race before either can observe it.
  for (const eventRow of events.rows) {
    let event;
    try { event = JSON.parse(eventRow.content || '{}'); }
    catch (e) { return { ok:false, reason:'provider_event_receipt_invalid' }; }
    const attemptResult = await readAttempt(event.provider, event.providerMessageId);
    if (!attemptResult.ok) return attemptResult;
    if (attemptResult.row.ham_uid !== uid ||
        event.providerAttemptSource !== attemptResult.row.source) {
      return { ok:false, reason:'provider_event_cross_ham_mismatch' };
    }
    const result = await reconcileEvent(attemptResult.row, eventRow);
    if (!result.ok) return result;
    if (result.reconciled === false) pending++;
    else {
      reconciled++;
      if (result.outcomeConflict) conflicts++;
    }
  }
  return { ok:true, scanned:events.rows.length, reconciled:reconciled,
    pending:pending, conflicts:conflicts,
    acceptanceRecoveriesScanned:recoveries.scanned,
    acceptanceAttemptsRecovered:recoveries.recovered };
}

function parseBlooioTerminal(body, requestHeaders) {
  body = body || {};
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const obj = data.object && typeof data.object === 'object' ? data.object : data;
  const event = String(requestHeaders && requestHeaders['x-blooio-event'] ||
    body.event || body.type || data.event || data.type || '').toLowerCase();
  let status = String(body.status || data.status || obj.status || '').toLowerCase();
  if (!status && /message\.(delivered|failed|cancelled)$/.test(event)) {
    status = event.slice(event.lastIndexOf('.') + 1);
  }
  if (!/^(delivered|failed|cancelled)$/.test(status)) return null;
  const providerMessageId = safeToken(body.message_id || data.message_id ||
    obj.message_id || obj.id, 1, 500);
  const providerBinding = safeToken(body.external_id || data.external_id ||
    obj.external_id || body.recipient || data.recipient || obj.recipient ||
    body.to || data.to || obj.to, 1, 500) || null;
  return { provider:'blooio', providerMessageId:providerMessageId,
    terminalState:status === 'delivered' ? 'delivered' : 'failed',
    providerStatus:status, providerEventId:safeToken(body.event_id || body.webhook_id ||
      body.id || data.event_id || data.id, 1, 500) || null,
    providerBinding:providerBinding,
    proofScope:status === 'delivered' ? 'blooio_recipient_delivery_confirmation'
      : 'blooio_terminal_failure' };
}

function parseNylasTerminal(body) {
  body = body || {};
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const obj = data.object && typeof data.object === 'object' ? data.object : {};
  let type = String(body.type || data.type || '').toLowerCase();
  type = type.replace(/\.(legacy|transformed|truncated)$/g, '');
  const delivered = /^(message\.opened|thread\.replied)$/.test(type);
  const failed = type === 'message.bounce_detected';
  if (!delivered && !failed) return null;
  const rawMessageId = type === 'thread.replied' ? obj.root_message_id
    : type === 'message.bounce_detected' ? (obj.message_id || obj.origin && obj.origin.id)
      : obj.message_id;
  const providerMessageId = safeToken(rawMessageId, 1, 500);
  return { provider:'nylas', providerMessageId:providerMessageId,
    terminalState:delivered ? 'delivered' : 'failed',
    providerStatus:type.replace(/^message\.|^thread\./, ''),
    providerEventId:safeToken(body.id || data.id, 1, 500) || null,
    providerBinding:safeToken(data.grant_id || obj.grant_id ||
      obj.origin && obj.origin.grant_id, 1, 500) || null,
    trackingLabel:safeToken(obj.label, 8, 160) || null,
    proofScope:type === 'message.opened' ? 'nylas_tracking_pixel_fetch'
      : type === 'thread.replied' ? 'nylas_tracked_thread_reply'
        : 'nylas_bounce_detected' };
}

module.exports = { prepareStore, normalizeProvenance, createProviderIntent,
  registerProviderAttempt, recordProviderAcceptanceRecovery,
  recordTerminalEvent, reconcileHam,
  parseBlooioTerminal, parseNylasTerminal,
  _test:{ intentSource, attemptSource, recoverySource, eventSource, orphanSource,
    finalizationSource, receiptSource, pendingMatches, pendingIdentity,
    readIntent, readAttempt, readPending, recoverMissingPending,
    pendingRecoveryBinding, exactRecoveryBinding,
    reconcileAcceptanceRecoveries, scanRows } };
