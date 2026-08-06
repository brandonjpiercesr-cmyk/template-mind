// ⬡B:core.provider_request_edge:GUARD:admitted_reasoning_rechecks_stop_at_egress:20260805⬡
'use strict';
var AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
var admissionStorage = new AsyncLocalStorage();

function exactHam(value) {
  var ham = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._:-]{2,160}$/.test(ham) ? ham : null;
}

function representedClear(state) {
  if (!state || typeof state.active !== 'boolean' || state.error) {
    return {ok:false,reason:'kill_switch_unverified'};
  }
  if (state.active === true) return {ok:false,reason:'kill_switch_active'};
  return {ok:true};
}

async function executeAdmittedProviderRequest(input, options) {
  input = input || {};
  options = options || {};
  var hamUid = exactHam(input.hamUid);
  if (!hamUid || typeof input.admit !== 'function' || typeof input.call !== 'function') {
    return {ok:false,reason:'provider_admission_binding_invalid',providerAttempted:false};
  }
  var admitted = false;
  try { admitted = await input.admit() === true; }
  catch (error) { admitted = false; }
  if (!admitted) {
    return {ok:false,reason:'provider_admission_refused',providerAttempted:false};
  }
  var read = options.readKillState || function (ham) {
    return require('./killswitch.js').isActive(ham);
  };
  var state;
  try { state = representedClear(await read(hamUid)); }
  catch (error) { state = {ok:false,reason:'kill_switch_unverified'}; }
  if (!state.ok) {
    var refusalRecorded = null;
    if (typeof input.onRefused === 'function') {
      try { refusalRecorded = await input.onRefused(state.reason,input.attempt || null); }
      catch (error) { refusalRecorded = false; }
    }
    return {ok:false,reason:state.reason,providerAttempted:false,
      admission_preserved:true,refusalRecorded:refusalRecorded === true,
      requires_new_request_after_clear:true};
  }

  var pending;
  if (input.attempt && input.attempt.tracker) {
    input.attempt.tracker.providersStarted++;
  }
  try { pending = input.call(); }
  catch (error) {
    return {ok:false,reason:'provider_uncertain',providerAttempted:true};
  }
  try { return {ok:true,response:await pending,providerAttempted:true}; }
  catch (error) { return {ok:false,reason:'provider_uncertain',providerAttempted:true}; }
}

function currentAdmission() {
  return admissionStorage.getStore() || null;
}

async function currentStopState(hamUid) {
  var current=currentAdmission();
  if (!current) return {ok:true,active:false,governed:false};
  if (exactHam(hamUid) !== current.hamUid) {
    return {ok:false,active:true,governed:true,reason:'provider_admission_ham_mismatch'};
  }
  var read=current.readKillState || function(ham){return require('./killswitch.js').isActive(ham);};
  var represented;
  try { represented=representedClear(await read(current.hamUid)); }
  catch (error) { represented={ok:false,reason:'kill_switch_unverified'}; }
  return represented.ok === true ? {ok:true,active:false,governed:true}
    : {ok:false,active:true,governed:true,reason:represented.reason};
}

async function executeCurrentGovernedWork(input) {
  input=input || {};
  if (typeof input.call !== 'function') {
    return {ok:false,reason:'governed_work_binding_invalid',workAttempted:false};
  }
  var current=currentAdmission();
  if (current) {
    var state=await currentStopState(input.hamUid);
    if (!state.ok) return {ok:false,reason:state.reason,workAttempted:false};
  }
  try { return {ok:true,response:await input.call(),workAttempted:true}; }
  catch (error) { return {ok:false,reason:'governed_work_uncertain',workAttempted:true}; }
}

function runWithAdmission(admission, work) {
  if (typeof work !== 'function') throw new Error('provider_admission_work_required');
  if (currentAdmission()) return work();
  if (!admission || !exactHam(admission.hamUid) ||
      typeof admission.admit !== 'function') {
    throw new Error('provider_admission_context_invalid');
  }
  return admissionStorage.run(Object.freeze({hamUid:exactHam(admission.hamUid),
    admit:admission.admit,onRefused:typeof admission.onRefused === 'function'
      ? admission.onRefused : null,readKillState:typeof admission.readKillState === 'function'
      ? admission.readKillState : null,tracker:{providerSequence:0,providersStarted:0}}),work);
}

async function executeCurrentProviderRequest(input, options) {
  input = input || {};
  var current = currentAdmission();
  if (!current) {
    if (typeof input.call !== 'function') {
      return {ok:false,reason:'provider_admission_binding_invalid',providerAttempted:false};
    }
    try { return {ok:true,response:await input.call(),providerAttempted:true}; }
    catch (error) { return {ok:false,reason:'provider_uncertain',providerAttempted:true}; }
  }
  if (exactHam(input.hamUid) !== current.hamUid) {
    return {ok:false,reason:'provider_admission_ham_mismatch',providerAttempted:false};
  }
  current.tracker.providerSequence++;
  var attempt={sequence:current.tracker.providerSequence,
    providers_started_before:current.tracker.providersStarted,
    provider_started:false,tracker:current.tracker};
  return executeAdmittedProviderRequest({hamUid:current.hamUid,admit:current.admit,
    onRefused:current.onRefused,call:input.call,attempt:attempt},options ||
    (current.readKillState ? {readKillState:current.readKillState} : undefined));
}

module.exports = {executeAdmittedProviderRequest:executeAdmittedProviderRequest,
  executeCurrentProviderRequest:executeCurrentProviderRequest,
  runWithAdmission:runWithAdmission,currentAdmission:currentAdmission,
  currentStopState:currentStopState,
  executeCurrentGovernedWork:executeCurrentGovernedWork,
  _test:{exactHam:exactHam,representedClear:representedClear}};
