// ⬡B:reach.reach_wonder:MODULE:reach_birthed_as_a_true_wonder:20260711⬡
// REACH audits verified judgment and delivery truth. Legacy FUNNELED/HELD rows
// are presentation artifacts and are never counted as a decision or delivery.
'use strict';

const crypto = require('node:crypto');
const lifecycleView = require('../core/reach/lifecycle.view.js');

function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _memorySelected() {
  return !!(process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY);
}
function _tbl() {
  return process.env.BEAD_TABLE || (_memorySelected() ? 'beads' : 'aibe_brain');
}
function _schema() {
  return process.env.BRAIN_SCHEMA || (_memorySelected() ? 'memory_bank' : 'abacia_core');
}
function rh() {
  return { apikey:_bk(), Authorization:'Bearer ' + _bk(), 'Accept-Profile':_schema() };
}
function wh() {
  return Object.assign({}, rh(), { 'Content-Profile':_schema(),
    'Content-Type':'application/json', Prefer:'return=representation' });
}
function ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}
function normalizeHamUid(value) {
  const uid = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._:-]{2,160}$/.test(uid) ? uid : '';
}

// Channel purpose remains a plain operational contract. The PAI decision owns
// whether/when/how for a particular cycle; this map is not send authority.
const PURPOSE = {
  voice:'drop-everything: high importance + time-sensitive + needs a real decision now',
  text:'needs to know soon, async, no live interruption required',
  email:'substantive and detailed, needs a read, but is not urgent',
  command_center:'needs an answer eventually, not time-pressured',
  portal:'ambient / FYI, lowest urgency'
};

function increment(target, key) {
  key = String(key || 'unknown').toLowerCase();
  target[key] = (target[key] || 0) + 1;
}

// Cold detection counts only projections that the canonical lifecycle view has
// already verified. No artifact, evidence, target, message, or provider address
// enters this report. The stages are deliberately named: council decision,
// provider-accepted attempt, then exact terminal receipt.
function summarizeLifecycle(view, nowMs) {
  if (!view || view.ok !== true) {
    return { ok:false, reason:view && view.reason || 'reach_lifecycle_read_failed' };
  }
  const decisions = (view.decisions || []).filter(function (item) {
    return item && /^(NOW|HOLD|DEFER)$/.test(item.when || '');
  });
  const attempts = (view.items || []).filter(function (item) {
    return item && /^(PENDING|DELIVERED|FAILED)$/.test(item.status || '');
  });
  function decisionIdentity(item) {
    const requestId = String(item && item.councilRequestId || '');
    const cycleId = String(item && item.councilCycleId || '');
    return requestId && cycleId ? requestId + '\u0000' + cycleId : '';
  }
  function attemptIdentity(item) {
    const requestId = String(item && item.requestId || '');
    const cycleId = String(item && item.cycleId || '');
    return requestId && cycleId ? requestId + '\u0000' + cycleId : '';
  }
  const externalDecisions = decisions.filter(function (item) {
    return item.when === 'NOW' && item.reach === true &&
      /^(voice|text|email)$/.test(item.channel || '');
  });
  const decisionsByIdentity = new Map();
  externalDecisions.forEach(function (item) {
    const key = decisionIdentity(item);
    if (!key) return;
    if (!decisionsByIdentity.has(key)) decisionsByIdentity.set(key, []);
    decisionsByIdentity.get(key).push(item);
  });
  const linkedAttempts = [];
  let orphanAttempts = 0;
  attempts.forEach(function (item) {
    const matches = decisionsByIdentity.get(attemptIdentity(item)) || [];
    if (matches.length !== 1 || matches[0].channel !== item.channel) {
      orphanAttempts++;
      return;
    }
    linkedAttempts.push(item);
  });
  const attemptsByIdentity = new Map();
  linkedAttempts.forEach(function (item) {
    const key = attemptIdentity(item);
    if (!attemptsByIdentity.has(key)) attemptsByIdentity.set(key, []);
    attemptsByIdentity.get(key).push(item);
  });
  let missingAttempts = 0;
  let duplicateAttempts = 0;
  externalDecisions.forEach(function (item) {
    const matches = attemptsByIdentity.get(decisionIdentity(item)) || [];
    if (matches.length === 0) missingAttempts++;
    else if (matches.length > 1) duplicateAttempts += matches.length - 1;
  });
  const byChannel = {}, byTiming = {}, byAttemptChannel = {};
  decisions.forEach(function (item) {
    increment(byChannel, item.channel);
    increment(byTiming, item.when);
  });
  attempts.forEach(function (item) { increment(byAttemptChannel, item.channel); });
  const delivered = linkedAttempts.filter(function (item) { return item.status === 'DELIVERED'; }).length;
  const failed = linkedAttempts.filter(function (item) { return item.status === 'FAILED'; }).length;
  const pending = linkedAttempts.filter(function (item) { return item.status === 'PENDING'; }).length;
  const terminal = delivered + failed;
  const stalePending = linkedAttempts.filter(function (item) {
    if (item.status !== 'PENDING') return false;
    const at = Date.parse(item.at || item.pendingAt || '');
    return Number.isFinite(at) && nowMs - at > 60 * 60 * 1000;
  }).length;
  const voiceDecisions = byChannel.voice || 0;
  const callRate = decisions.length
    ? Math.round((voiceDecisions / decisions.length) * 1000) / 10 : 0;
  const terminalRate = linkedAttempts.length
    ? Math.round((terminal / linkedAttempts.length) * 1000) / 10 : 0;
  const deliveredRate = linkedAttempts.length
    ? Math.round((delivered / linkedAttempts.length) * 1000) / 10 : 0;
  const diagnostics = Object.assign({ rejectedPending:0, ambiguousPending:0,
    ambiguousTerminal:0, rejectedTerminal:0, orphanTerminal:0,
    rejectedDecision:0, ambiguousDecision:0 },
  view.diagnostics || {});
  const diagnosticCount = Object.keys(diagnostics).reduce(function (sum, key) {
    return sum + (Number(diagnostics[key]) || 0);
  }, 0);
  const findings = [];
  if (!decisions.length) findings.push('no verified council decisions in the audit window');
  if (orphanAttempts) findings.push(orphanAttempts +
    ' provider attempt(s) do not bind one exact same-HAM council decision');
  if (missingAttempts) findings.push(missingAttempts +
    ' external NOW decision(s) have no exact provider-accepted attempt');
  if (duplicateAttempts) findings.push(duplicateAttempts +
    ' duplicate provider attempt(s) bind an already-used council decision');
  if (callRate > 25) findings.push('voice decisions exceed the 25% review threshold');
  if (failed) findings.push(failed + ' provider attempt(s) reached terminal failure');
  if (stalePending) findings.push(stalePending + ' provider attempt(s) remain pending over one hour');
  if (diagnosticCount) findings.push(diagnosticCount + ' lifecycle receipt(s) were rejected or ambiguous');
  const coldFinding = 'Verified lifecycle: ' + decisions.length + ' council decision(s); ' +
    linkedAttempts.length + ' of ' + attempts.length +
    ' provider-accepted attempt(s) bind one exact decision; ' + terminal +
    ' exact terminal receipt(s) (' + delivered + ' delivered, ' + failed + ' failed, ' +
    pending + ' pending).';
  const verdict = !decisions.length ? 'NOT_ENOUGH_EVIDENCE'
    : findings.length ? 'REVIEW' : 'HEALTHY';
  return { ok:true, version:'anew.reach.lifecycle-audit.v2',
    verdict:verdict,
    total:decisions.length, byChannel:byChannel, byTiming:byTiming,
    callRatePct:callRate, coldFinding:coldFinding, findings:findings,
    lifecycle:{ decisions:{ total:decisions.length, by_channel:byChannel,
      by_timing:byTiming, external_now:externalDecisions.length,
      missing_attempt:missingAttempts }, provider_attempts:{ total:attempts.length,
      correlated:linkedAttempts.length, unlinked:orphanAttempts,
      duplicate_links:duplicateAttempts, pending:pending,
      by_channel:byAttemptChannel, stale_over_one_hour:stalePending },
    terminal:{ total:terminal, delivered:delivered, failed:failed,
      terminal_rate_pct:terminalRate, delivered_rate_pct:deliveredRate } },
    diagnostics:diagnostics, purpose:PURPOSE };
}

async function deliberateAggregate(report, fetchFn) {
  if (!process.env.GROQ_API_KEY) return '';
  try {
    const response = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', headers:{ Authorization:'Bearer ' + process.env.GROQ_API_KEY,
        'Content-Type':'application/json' },
      body:JSON.stringify({ model:process.env.GROQ_MODEL_C2 || 'llama-3.3-70b-versatile',
        messages:[{ role:'system', content:'Audit only the aggregate REACH lifecycle counts supplied. Explain in one or two concrete sentences whether the decision to attempt to terminal pattern needs review. Do not invent events, people, messages, or recipients.' },
        { role:'user', content:JSON.stringify({ lifecycle:report.lifecycle,
          findings:report.findings, diagnostics:report.diagnostics }) }],
        max_tokens:150, temperature:0.3 }) });
    const data = response && response.ok ? await response.json() : null;
    return data && data.choices && data.choices[0] && data.choices[0].message &&
      typeof data.choices[0].message.content === 'string'
      ? data.choices[0].message.content.trim().slice(0, 800) : '';
  } catch (e) { return ''; }
}

async function readAuditRows(hamUid, source, fetchFn) {
  const url = _bu().replace(/\/$/, '') + '/rest/v1/' + _tbl() + '?ham_uid=eq.' +
    encodeURIComponent(hamUid) + '&agent_global=eq.REACH&stamp_type=eq.REACH_AUDIT' +
    '&source=eq.' + encodeURIComponent(source) + '&limit=2&select=' +
    'id,ham_uid,agent_global,stamp_type,source,acl_stamp,summary,content,importance,created_at';
  try {
    const response = await fetchFn(url, { headers:rh() });
    if (!response || response.ok !== true) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows : null;
  } catch (e) { return null; }
}

function sameAuditRow(row, expected) {
  return !!(row && row.ham_uid === expected.ham_uid &&
    row.agent_global === expected.agent_global && row.stamp_type === expected.stamp_type &&
    row.source === expected.source && row.acl_stamp === expected.acl_stamp &&
    row.summary === expected.summary && String(row.content) === expected.content &&
    Number(row.importance) === expected.importance);
}

async function auditRecentDecisions(hamUid, limit, dependencies) {
  const HAM = normalizeHamUid(hamUid);
  if (!_bu() || !_bk() || !HAM) return { ok:false, reason:'no_brain' };
  dependencies = dependencies || {};
  const fetchFn = dependencies.fetch || global.fetch;
  const nowMs = dependencies.now ? Number(dependencies.now()) : Date.now();
  if (typeof fetchFn !== 'function' || !Number.isFinite(nowMs)) {
    return { ok:false, reason:'reach_audit_runtime_invalid' };
  }
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const view = dependencies.lifecycle || await lifecycleView.readReachLifecycle(HAM, {
    decisionLimit:boundedLimit, pendingLimit:boundedLimit,
    terminalLimit:Math.min(boundedLimit * 3, 500)
  });
  const report = summarizeLifecycle(view, nowMs);
  if (!report.ok) return report;
  report.generatedAt = new Date(nowMs).toISOString();
  const reasoned = dependencies.deliberation === false ? '' :
    (typeof dependencies.deliberation === 'string' ? dependencies.deliberation :
      await deliberateAggregate(report, fetchFn));
  report.finding = reasoned ? report.coldFinding + ' ' + reasoned : report.coldFinding;

  const content = JSON.stringify(report);
  const source = 'reach.audit.lifecycle.' + hash(content);
  const expected = { ham_uid:HAM, agent_global:'REACH', stamp_type:'REACH_AUDIT',
    acl_stamp:'⬡B:reach.reach_wonder:REACH_AUDIT:lifecycle_truth:' + ymd() + '⬡',
    source:source,
    summary:('[REACH AUDIT] ' + report.verdict + ' — ' + report.finding).slice(0, 1000),
    content:content, importance:report.verdict === 'REVIEW' ? 7 : 3 };
  let response = null;
  try {
    response = await fetchFn(_bu().replace(/\/$/, '') + '/rest/v1/' + _tbl(), {
      method:'POST', headers:wh(), body:JSON.stringify(expected) });
  } catch (eWrite) { /* exact readback decides ambiguous transport */ }
  const rows = await readAuditRows(HAM, source, fetchFn);
  if (!rows || rows.length !== 1 || !sameAuditRow(rows[0], expected)) {
    return Object.assign({}, report, { ok:false,
      reason:response && response.ok === true ? 'reach_audit_readback_unverified' :
        'reach_audit_write_unverified' });
  }
  return Object.assign({}, report, { auditSource:source, readbackVerified:true });
}

module.exports = { PURPOSE:PURPOSE, auditRecentDecisions:auditRecentDecisions,
  _test:{ summarizeLifecycle:summarizeLifecycle, sameAuditRow:sameAuditRow } };
