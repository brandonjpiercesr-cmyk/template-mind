// ⬡B:core.founder_mutation_claim:GUARD:founder_session_plus_one_durable_mutation_claim:20260730⬡
// State-changing founder doors share the estate's existing exact-session authority and
// Postgres claim registry. This module only composes those two canonical boundaries: it
// does not mint a credential, accept a typed HAM as identity, or create a second auth path.
'use strict';

var crypto = require('node:crypto');
var founderSession = require('./founder.session.gate.js');
var claims = require('./claim_lock.js');

var ONE_USE_LEASE_MS = 100 * 365 * 24 * 60 * 60 * 1000;
var REQUEST_ID = /^[A-Za-z0-9._:-]{8,180}$/;

function suppliedRequestIds(req) {
  var body = req && req.body || {};
  var headers = req && req.headers || {};
  return [headers['idempotency-key'], headers['x-anu-request-id'],
    body.requestId, body.request_id].map(function (value) {
      return String(value || '').trim();
    }).filter(Boolean);
}

function requestId(req) {
  var supplied = suppliedRequestIds(req);
  if (!supplied.length) return { ok:false, reason:'mutation_request_id_required' };
  var first = supplied[0];
  if (supplied.some(function (value) { return value !== first; })) {
    return { ok:false, reason:'mutation_request_id_conflict' };
  }
  if (!REQUEST_ID.test(first)) return { ok:false, reason:'mutation_request_id_invalid' };
  return { ok:true, value:first };
}

function claimSource(hamUid, id) {
  // The request id is one-use across every state-changing founder door, not merely one
  // route. Hashing keeps caller bytes out of the shared task registry while retaining a
  // deterministic, cross-replica identity for the claim.
  var digest = crypto.createHash('sha256').update(String(id), 'utf8').digest('hex');
  return 'founder_mutation:' + String(hamUid || '').trim().toUpperCase() + ':' + digest;
}

async function requireFounderMutation(req, res, purpose, deps) {
  var d = deps || {};
  var requireFounder = d.requireFounder || founderSession.requireFounder;
  var founder = await requireFounder(req, res, d.founderDeps);
  if (!founder) return null;

  var request = requestId(req);
  if (!request.ok) {
    res.status(400).json({ ok:false, reason:request.reason });
    return null;
  }

  var hamUid = String(founder.hamUid || founderSession.founderHam()).trim().toUpperCase();
  var source = claimSource(hamUid, request.value);
  var claimant = 'founder.mutation.' + crypto.randomUUID();
  var claimTask = d.claimTask || claims.claimTask;
  var inspectClaim = d.inspectClaim || claims.inspectClaim;
  try {
    var won = await claimTask(source, claimant, ONE_USE_LEASE_MS);
    if (won) return { ok:true, hamUid:hamUid, requestId:request.value,
      purpose:String(purpose || ''), claimSource:source };

    var existing = await inspectClaim(source);
    if (existing) {
      res.status(409).json({ ok:false, reason:'founder_mutation_already_claimed' });
      return null;
    }
  } catch (e) {
    // A failed or unreadable durable arbiter is not permission to mutate.
  }
  res.status(503).json({ ok:false, reason:'founder_mutation_claim_unavailable' });
  return null;
}

module.exports = { requireFounderMutation:requireFounderMutation, requestId:requestId,
  claimSource:claimSource, ONE_USE_LEASE_MS:ONE_USE_LEASE_MS };
