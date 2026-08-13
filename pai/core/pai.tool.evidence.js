// ⬡B:core.pai_tool_evidence:MODULE:execution_minted_fact_evidence:20260725⬡
// One in-process authenticity boundary for tool facts. Only this module can mint
// an evidence object after executeTool returns. SHADOW verifies object identity,
// exact turn binding, digest, success, read classification, and byte ceilings.
'use strict';

var crypto = require('node:crypto');
var minted = new WeakSet();
var serverPrefetchMinted = new WeakSet();
var serverPrefetchGrants = new WeakSet();
var memoryMinted = new WeakSet();
var effectReceiptMinted = new WeakSet();

var READ_TOOLS = Object.freeze({
  consult_mace:true,
  calendar_read:true,
  find_in_brain:true,
  find_identity_evidence:true,
  find_contact:true,
  get_budget_summary:true,
  get_budget_upcoming:true,
  get_pending_drafts:true,
  get_recent_builds:true,
  inbox_read:true,
  nash_sports:true,
  read_lane_board:true,
  read_current_capabilities:true,
  read_own_code:true,
  read_reminders:true,
  read_render_logs:true,
  weather_check:true
});

function boundedInteger(raw, fallback, min, max) {
  var parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) parsed = fallback;
  return Math.max(min, Math.min(max, parsed));
}

function itemMaxBytes() {
  return boundedInteger(process.env.TOOL_EVIDENCE_ONE_MAX, 2000, 256, 12000);
}

function resultMaxBytes(tool) {
  if (String(tool || '') === 'read_current_capabilities') {
    return boundedInteger(process.env.TOOL_CAPABILITY_EVIDENCE_MAX, 4096, 2000, 12000);
  }
  if (String(tool || '') === 'reach_current_person') return 12000;
  return itemMaxBytes();
}

function countMax() {
  return boundedInteger(process.env.TOOL_EVIDENCE_COUNT_MAX, 8, 1, 8);
}

function digest(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function stableStringify(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(function (item) {
    return item === undefined ? 'null' : stableStringify(item);
  }).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).filter(function (key) {
      return value[key] !== undefined;
    }).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function truncateUtf8(value, maxBytes) {
  var text = String(value == null ? '' : value);
  var bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) return text;
  var end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}

function parsedSuccess(raw) {
  var text;
  try { text = typeof raw === 'string' ? raw : JSON.stringify(raw); }
  catch (eSerialize) { return null; }
  if (!text || !text.trim()) return null;
  var parsed;
  try { parsed = JSON.parse(text); }
  catch (eParse) { return null; }
  if (parsed === null || parsed === undefined || parsed === '' ||
      (parsed && typeof parsed === 'object' &&
        (parsed.ok === false || parsed.executed === false || parsed.queued === true))) return null;
  return { text:text, parsed:parsed };
}

function bindingFrom(item) {
  return {
    schema:item.schema,
    tool:item.tool,
    provenance:item.provenance,
    ham_uid:item.ham_uid,
    request_id:item.request_id,
    cycle_id:item.cycle_id,
    tool_call_id:item.tool_call_id,
    question_digest:item.question_digest,
    args_digest:item.args_digest,
    source_result_digest:item.source_result_digest,
    args:item.args,
    result:item.result
  };
}

function mint(input) {
  input = input || {};
  var tool = String(input.tool || '').trim();
  var ham = String(input.hamUid || '').trim().toUpperCase();
  var requestId = String(input.requestId || '').trim();
  var cycleId = String(input.cycleId || '').trim();
  var callId = String(input.toolCallId || '').trim();
  var provenance = String(input.provenance || 'pai.current_turn.execute_tool');
  if (!tool || !ham || !requestId || !cycleId || !callId ||
      ['pai.current_turn.execute_tool','pai.current_turn.policy_read',
        'pai.current_turn.server_prefetch'].indexOf(provenance) < 0) return null;
  var success = parsedSuccess(input.result);
  if (!success) return null;
  var fullArgs = stableStringify(input.args && typeof input.args === 'object' ? input.args : {});
  var publicArgs = stableStringify(input.semanticArgs && typeof input.semanticArgs === 'object'
    ? input.semanticArgs : (input.args && typeof input.args === 'object' ? input.args : {}));
  var fullResult = success.text;
  var argsMax = itemMaxBytes();
  var max = resultMaxBytes(tool);
  var item = {
    schema:'anew.pai.executed-tool-evidence.v1',
    tool:tool,
    provenance:provenance,
    ham_uid:ham,
    request_id:requestId,
    cycle_id:cycleId,
    tool_call_id:callId,
    evidence_kind:READ_TOOLS[tool] === true ? 'verified_read_result' : 'verified_tool_result',
    successful_read:READ_TOOLS[tool] === true,
    args_digest:digest(fullArgs),
    source_result_digest:digest(fullResult),
    args:truncateUtf8(publicArgs, argsMax),
    result:truncateUtf8(fullResult, max),
    result_truncated:Buffer.byteLength(fullResult, 'utf8') > max
  };
  item.result_digest = digest(stableStringify(bindingFrom(item)));
  Object.freeze(item);
  minted.add(item);
  return item;
}

// A server-prefetched specialist read happens before runPAI creates its cycle id,
// so it cannot honestly use the ordinary execute-tool mint above. It is still
// bound to the exact HAM and finalizer request, and object identity proves the
// bytes crossed this in-process boundary instead of arriving as caller JSON.
// Only the narrow specialist ingress is accepted here; generic mint() cannot
// manufacture this provenance or its WeakSet membership.
function mintServerPrefetch(input) {
  input = input || {};
  var tool = String(input.tool || '').trim();
  var ham = String(input.hamUid || '').trim().toUpperCase();
  var requestId = String(input.requestId || '').trim();
  var cycleId = String(input.cycleId || '').trim();
  var callId = String(input.toolCallId || '').trim();
  var questionDigest = String(input.questionDigest || '').trim().toLowerCase();
  if (tool !== 'specialist_internal_evidence' || !ham || !requestId || !cycleId || !callId ||
      !/^[a-f0-9]{64}$/.test(questionDigest)) return null;
  var success = parsedSuccess(input.result);
  if (!success) return null;
  var fullArgs = stableStringify(input.args && typeof input.args === 'object' ? input.args : {});
  var fullResult = success.text;
  var max = itemMaxBytes();
  if (Buffer.byteLength(fullArgs, 'utf8') > max ||
      Buffer.byteLength(fullResult, 'utf8') > max) return null;
  var item = {
    schema:'anew.pai.executed-tool-evidence.v1',
    tool:tool,
    provenance:'pai.current_turn.bound_server_prefetch',
    ham_uid:ham,
    request_id:requestId,
    cycle_id:cycleId,
    tool_call_id:callId,
    question_digest:questionDigest,
    evidence_kind:'verified_read_result',
    successful_read:true,
    args_digest:digest(fullArgs),
    source_result_digest:digest(fullResult),
    args:truncateUtf8(fullArgs, max),
    result:truncateUtf8(fullResult, max),
    result_truncated:false
  };
  item.result_digest = digest(stableStringify(bindingFrom(item)));
  Object.freeze(item);
  serverPrefetchMinted.add(item);
  return item;
}

function grantServerPrefetch(input) {
  input = input || {};
  var ham = String(input.hamUid || '').trim().toUpperCase();
  var question = String(input.question || '');
  var sourceText = String(input.sourceText || '');
  var materialDigest = String(input.materialDigest || '').trim().toLowerCase();
  var evidence = Array.isArray(input.evidence) ? input.evidence.map(function (raw) {
    return Object.freeze({tool:String(raw && raw.tool || ''),args:String(raw && raw.args || ''),
      result:String(raw && raw.result || '')});
  }) : [];
  if (!ham || !question.trim() || !sourceText || !/^[a-f0-9]{64}$/.test(materialDigest) ||
      !evidence.length) return null;
  var grant = {ham_uid:ham,question:question,source_text:sourceText,
    material_digest:materialDigest,evidence:Object.freeze(evidence)};
  Object.freeze(grant);
  serverPrefetchGrants.add(grant);
  return grant;
}

function consumeServerPrefetch(grant, expected) {
  expected = expected || {};
  var ham = String(expected.hamUid || '').trim().toUpperCase();
  var question = String(expected.question || '');
  var requestId = String(expected.requestId || '').trim();
  var cycleId = String(expected.cycleId || '').trim();
  if (!grant || !serverPrefetchGrants.has(grant) || !ham || !question.trim() ||
      !requestId || !cycleId || grant.ham_uid !== ham || grant.question !== question) return [];
  serverPrefetchGrants.delete(grant);
  var questionDigest = digest(question);
  var wallTextDigest = digest(grant.source_text);
  var chunks = [];
  var shared = null;
  for (var i = 0; i < grant.evidence.length; i++) {
    var raw = grant.evidence[i];
    if (!raw || raw.tool !== 'specialist_internal_evidence' ||
        Buffer.byteLength(raw.args, 'utf8') > itemMaxBytes() ||
        Buffer.byteLength(raw.result, 'utf8') > itemMaxBytes()) return [];
    var binding;
    var packet;
    try { binding = JSON.parse(raw.args); packet = JSON.parse(raw.result); }
    catch (eParse) { return []; }
    var fact = packet && packet.facts && packet.facts.operational_projection_chunk;
    if (!binding || !packet || packet.schema !== 'great-reset.coda-council-evidence.v2' ||
        binding.schema !== 'great-reset.coda-council-evidence-binding.v2' ||
        stableStringify(packet.binding) !== stableStringify(binding) ||
        String(binding.ham_uid || '').trim().toUpperCase() !== ham ||
        binding.question_digest !== questionDigest ||
        binding.operational_wall_text_digest !== wallTextDigest ||
        binding.operational_material_digest !== grant.material_digest ||
        !/^[a-f0-9]{64}$/.test(String(binding.projection_digest || '')) ||
        !Number.isInteger(binding.chunk_index) || !Number.isInteger(binding.chunk_count) ||
        binding.chunk_index !== i || binding.chunk_count !== grant.evidence.length ||
        typeof fact !== 'string' || !fact) return [];
    var signature = stableStringify({ham_uid:binding.ham_uid,
      question_digest:binding.question_digest,
      operational_wall_text_digest:binding.operational_wall_text_digest,
      operational_material_digest:binding.operational_material_digest,
      projection_digest:binding.projection_digest,chunk_count:binding.chunk_count});
    if (shared === null) shared = signature;
    else if (shared !== signature) return [];
    chunks.push(fact);
  }
  var projectionText = chunks.join('');
  var projection;
  try { projection = JSON.parse(projectionText); }
  catch (eProjection) { return []; }
  if (!projection || projection.schema !== 'great-reset.coda-shadow-facts.v1' ||
      projection.wall_text_digest !== wallTextDigest ||
      projection.material_digest !== grant.material_digest ||
      digest(projectionText) !== JSON.parse(grant.evidence[0].args).projection_digest) return [];
  var mintedItems = grant.evidence.map(function (raw, index) {
    return mintServerPrefetch({tool:'specialist_internal_evidence',hamUid:ham,
      requestId:requestId,cycleId:cycleId,questionDigest:questionDigest,
      toolCallId:'coda-council-evidence-' + index + '-' + questionDigest.slice(0, 16),
      args:JSON.parse(raw.args),result:raw.result});
  }).filter(Boolean);
  return mintedItems.length === grant.evidence.length ? mintedItems : [];
}

function verify(item, expected, options) {
  expected = expected || {};
  options = options || {};
  var serverPrefetch = !!(item && typeof item === 'object' && serverPrefetchMinted.has(item));
  if (!item || typeof item !== 'object' || (!minted.has(item) && !serverPrefetch) ||
      Object.isFrozen(item) !== true) {
    return false;
  }
  if (item.schema !== 'anew.pai.executed-tool-evidence.v1' ||
      String(item.ham_uid || '').toUpperCase() !== String(expected.hamUid || '').toUpperCase() ||
      item.request_id !== expected.requestId ||
      item.cycle_id !== expected.cycleId ||
      (serverPrefetch && (item.provenance !== 'pai.current_turn.bound_server_prefetch' ||
        item.question_digest !== digest(expected.question || '') ||
        item.tool !== 'specialist_internal_evidence')) ||
      !item.tool_call_id || !item.tool ||
      (options.requireRead === true && item.successful_read !== true)) return false;
  var max = resultMaxBytes(item.tool);
  if (Buffer.byteLength(String(item.args || ''), 'utf8') > itemMaxBytes() ||
      Buffer.byteLength(String(item.result || ''), 'utf8') > max ||
      !/^[a-f0-9]{64}$/.test(String(item.args_digest || '')) ||
      !/^[a-f0-9]{64}$/.test(String(item.source_result_digest || '')) ||
      item.result_digest !== digest(stableStringify(bindingFrom(item)))) return false;
  // The full result was parsed before minting. A long valid result can be
  // truncated for the council prompt, so reparsing the preview here would
  // incorrectly reject authentic evidence. WeakSet membership, Object.freeze,
  // the binding digest, and the full source digest preserve authenticity.
  return true;
}

function append(list, input) {
  var item = mint(input);
  if (!item || !Array.isArray(list)) return item;
  list.push(item);
  while (list.length > countMax()) list.shift();
  return item;
}

function memoryBindingFrom(item) {
  return {
    schema:item.schema,
    evidence_kind:item.evidence_kind,
    provenance:item.provenance,
    ham_uid:item.ham_uid,
    source:item.source,
    stamp_type:item.stamp_type,
    question_digest:item.question_digest || null,
    result:item.result,
    source_result_digest:item.source_result_digest,
    identity_evidence_receipt:item.identity_evidence_receipt || null
  };
}

function mintMemory(input) {
  input = input || {};
  var ham = String(input.hamUid || '').trim().toUpperCase();
  var source = String(input.source || '').trim();
  var stampType = String(input.stampType || '').trim();
  var kind = String(input.evidenceKind || 'prefetched_memory_row').trim();
  var fullResult = typeof input.result === 'string'
    ? input.result : stableStringify(input.result == null ? {} : input.result);
  if (!ham || !source || !fullResult.trim() ||
      ['prefetched_memory_row','prefetched_identity_evidence',
        'fcw_memory_row'].indexOf(kind) < 0) return null;
  var parsedMemory;
  try { parsedMemory = JSON.parse(fullResult); }
  catch (eMemoryParse) { return null; }
  if (!parsedMemory || typeof parsedMemory !== 'object' ||
      parsedMemory.ok === false || parsedMemory.available === false) return null;
  // Memory evidence must remain parseable and byte-identical to the bytes it
  // claims to carry. Callers must prepare a valid bounded projection; silently
  // chopping JSON here would create an authentic-looking malformed receipt.
  if (Buffer.byteLength(fullResult, 'utf8') > itemMaxBytes()) return null;
  var item = {
    schema:'anew.pai.memory-evidence.v1',
    evidence_kind:kind,
    provenance:'memory_bank.exact_ham',
    ham_uid:ham,
    source:truncateUtf8(source, 240),
    stamp_type:truncateUtf8(stampType, 120) || null,
    question_digest:input.questionDigest || null,
    result:fullResult,
    source_result_digest:digest(fullResult)
  };
  if (input.identityEvidenceReceipt) {
    try {
      item.identity_evidence_receipt = Object.freeze(JSON.parse(
        stableStringify(input.identityEvidenceReceipt)));
    } catch (eReceipt) { return null; }
  }
  item.result_digest = digest(stableStringify(memoryBindingFrom(item)));
  Object.freeze(item);
  memoryMinted.add(item);
  return item;
}

function verifyMemory(item, expected) {
  expected = expected || {};
  if (!item || typeof item !== 'object' || !memoryMinted.has(item) ||
      Object.isFrozen(item) !== true || item.schema !== 'anew.pai.memory-evidence.v1' ||
      item.provenance !== 'memory_bank.exact_ham' ||
      ['prefetched_memory_row','prefetched_identity_evidence','fcw_memory_row']
        .indexOf(item.evidence_kind) < 0 ||
      String(item.ham_uid || '').toUpperCase() !== String(expected.hamUid || '').toUpperCase() ||
      !item.source || !item.result ||
      Buffer.byteLength(String(item.result), 'utf8') > itemMaxBytes() ||
      !/^[a-f0-9]{64}$/.test(String(item.source_result_digest || '')) ||
      (item.question_digest != null &&
        !/^[a-f0-9]{64}$/.test(String(item.question_digest))) ||
      (item.identity_evidence_receipt &&
        Object.isFrozen(item.identity_evidence_receipt) !== true) ||
      item.result_digest !== digest(stableStringify(memoryBindingFrom(item)))) return false;
  return true;
}

// Post-effect presentation facts are neither a read result nor model-authored
// tool evidence. They are minted only after the exact effect hand returns and
// are bound to the same HAM/request/cycle. SHADOW
// can therefore judge lifecycle language against typed facts instead of raw
// prompt prose or a generic successful tool name.
function mintEffectReceipt(input) {
  input=input||{};
  var ham=String(input.hamUid||'').trim().toUpperCase();
  var requestId=String(input.requestId||'').trim();
  var cycleId=String(input.cycleId||'').trim();
  var parentRequestId=String(input.parentRequestId||'').trim();
  var packet=input.packet;
  var claimReadback=input.claimReadback;
  var hand=require('./reach.self.hand.js');
  var readbackClient=require('./reach.four-channel.presentation.client.js');
  var privatePacket=packet&&hand.verifyPresentationPacket(packet);
  var recoveredPacket=packet&&claimReadback&&
    readbackClient.verifyAuthenticatedReadback(claimReadback)===true&&
    ['CLAIMED','RECOVERED'].indexOf(claimReadback.state)>=0&&
    claimReadback.presentation_facts_state==='SETTLED'&&claimReadback.packet===packet&&
    claimReadback.packet_digest===packet.packet_digest&&
    hand._test.presentationPacketShapeExact(packet);
  if(!ham||!requestId||!cycleId||!parentRequestId||!packet||
      typeof packet!=='object'||Array.isArray(packet)||
      (!privatePacket&&!recoveredPacket)||
      packet.schema!=='anew.reach-self.presentation-facts.v1'||
      !Array.isArray(packet.results)||
      !/^[a-f0-9]{64}$/.test(String(packet.packet_digest||'')))return null;
  var packetBody=Object.assign({},packet);delete packetBody.packet_digest;
  if(packet.packet_digest!==digest(stableStringify(packetBody))||
      packet.ham_uid_digest!==digest(ham)||
      packet.parent_request_digest!==digest(parentRequestId)||
      packet.parent_cycle_digest!==digest(cycleId)||
      !/^[a-f0-9]{64}$/.test(String(packet.air_session_ref_digest||''))||
      requestId!==parentRequestId)return null;
  var result=stableStringify({schema:'anew.pai.effect-receipt-evidence.v1',
    packet_digest:packet.packet_digest,monitor_requested:packet.monitor_requested===true,
    world_digest:packet.world_digest,air_session_ref_digest:packet.air_session_ref_digest,
    inbound_monitor:packet.inbound_monitor,
    results:packet.results});
  var sourceResultDigest=digest(result);
  var claimReadbackDigest=claimReadback&&
    /^sha256:[a-f0-9]{64}$/.test(String(claimReadback.claim_readback_receipt_id||''))
      ? String(claimReadback.claim_readback_receipt_id).slice('sha256:'.length) : null;
  if(Buffer.byteLength(result,'utf8')>resultMaxBytes('reach_current_person')||
      sourceResultDigest===packet.packet_digest||claimReadbackDigest===packet.packet_digest||
      claimReadbackDigest===sourceResultDigest)return null;
  var item={schema:'anew.pai.effect-receipt-evidence.v1',
    evidence_kind:'verified_effect_receipt',provenance:'pai.current_turn.effect_receipt',
    tool:'reach_current_person',ham_uid:ham,request_id:requestId,cycle_id:cycleId,
    parent_request_id:parentRequestId,packet_digest:packet.packet_digest,result:result,
    source_result_digest:sourceResultDigest};
  item.result_digest=digest(stableStringify(item));
  if(item.result_digest===packet.packet_digest||
      item.result_digest===item.source_result_digest||
      item.result_digest===claimReadbackDigest)return null;
  Object.freeze(item);effectReceiptMinted.add(item);return item;
}

// A recovered pre-effect plan proves that A'NU selected exact artifacts, but
// proves no provider outcome. Only an authenticated New World floor readback
// may mint this evidence. Every lifecycle field remains null so living SHADOW
// can reject completion claims without cold code interpreting A'NU's words.
function mintUnknownEffectReceipt(input) {
  input=input||{};
  var ham=String(input.hamUid||'').trim().toUpperCase();
  var requestId=String(input.requestId||'').trim();
  var cycleId=String(input.cycleId||'').trim();
  var readback=input.readback;
  var readbackClient=require('./reach.four-channel.presentation.client.js');
  if(!ham||!requestId||!cycleId||!readback||
      readbackClient.verifyAuthenticatedReadback(readback)!==true||
      readback.ok!==true||readback.state!=='EFFECT_UNKNOWN'||
      readback.schema!=='anew.reach.four-channel-presentation-readback.v1'||
      readback.presentation_facts_state!=='EFFECT_UNKNOWN'||
      readback.ham_uid!==ham||readback.parent_request_id!==requestId||
      readback.parent_cycle_id!==cycleId||readback.provider_effect_execution_authorized!==false||
      readback.provider_effect_replay_authorized!==false||readback.packet!==null||
      readback.packet_digest!==null||readback.provider_effect!==null||
      readback.human_effect!==null||
      !/^sha256:[a-f0-9]{64}$/.test(String(readback.plan_readback_receipt_id||''))||
      !Array.isArray(readback.selected_artifacts)||
      !readback.selected_artifacts.length)return null;
  var results=[];
  for(var index=0;index<readback.selected_artifacts.length;index++){
    var artifact=readback.selected_artifacts[index];
    if(!artifact||typeof artifact!=='object'||
        !/^[a-f0-9]{64}$/.test(String(artifact.artifact_digest||''))||
        !Number.isInteger(artifact.artifact_bytes)||artifact.artifact_bytes<1)return null;
    results.push({channel:artifact.channel,selected:true,
      artifact_digest:artifact.artifact_digest,artifact_bytes:artifact.artifact_bytes,
      effect_unknown:true,attempted:null,provider_accepted:null,message_created:null,
      call_created:null,delivery:null,recipient_read:null,reached:null,lived:null,
      persisted:null,readback_verified:null,provider_acceptance_receipt_ref:null,
      message_created_receipt_ref:null,call_created_receipt_ref:null,
      delivery_receipt_ref:null,recipient_read_receipt_ref:null,
      reached_receipt_ref:null,lived_receipt_ref:null,persisted_receipt_ref:null,
      readback_receipt_ref:null,
      reason:'effect_outcome_unknown_provider_replay_refused'});
  }
  var facts={schema:'anew.pai.effect-unknown-evidence.v1',effect_unknown:true,
    monitor_requested:readback.monitor_requested===true,inbound_monitor:{requested:
      readback.monitor_requested===true,attempted:null,seated:null,active:null,
      receipt_ref:null,reason:'effect_outcome_unknown'},results:results,
    plan_readback_receipt_id:readback.plan_readback_receipt_id};
  var result=stableStringify(facts);
  if(Buffer.byteLength(result,'utf8')>resultMaxBytes('reach_current_person'))return null;
  var packetDigest=digest(result);
  var item={schema:'anew.pai.effect-receipt-evidence.v1',
    evidence_kind:'verified_effect_receipt',provenance:'anew.world.effect_unknown_readback',
    tool:'reach_current_person',ham_uid:ham,request_id:requestId,cycle_id:cycleId,
    parent_request_id:requestId,packet_digest:packetDigest,result:result,
    source_result_digest:digest(result)};
  item.result_digest=digest(stableStringify(item));
  Object.freeze(item);effectReceiptMinted.add(item);return item;
}

// The private effect-plan council must not consume the parent request source,
// because the post-effect A'NU expression is the only parent-facing result.
// This identifier is a source coordinate only. It never selects or executes a
// hand and stays inside the same parent cycle.
function effectPlanRequestId(input){
  input=input||{};
  var parentRequestId=String(input.parentRequestId||'').trim();
  var cycleId=String(input.cycleId||'').trim();
  var effects=Array.isArray(input.pendingEffects)?input.pendingEffects:null;
  if(!parentRequestId||!cycleId||!effects||!effects.length||effects.length>20)return null;
  var canonical=[];
  for(var index=0;index<effects.length;index++){
    var effect=effects[index];
    if(!effect||typeof effect!=='object'||Array.isArray(effect)||
        !/^[A-Za-z0-9._:-]{1,160}$/.test(String(effect.name||''))||
        !effect.args||typeof effect.args!=='object'||Array.isArray(effect.args))return null;
    var encoded;
    try{encoded=stableStringify(effect.args);}catch(_error){return null;}
    if(Buffer.byteLength(encoded,'utf8')>64000)return null;
    try{canonical.push({name:String(effect.name),args:JSON.parse(encoded)});}
    catch(_parseError){return null;}
  }
  return 'pai.presentation.plan.'+digest(stableStringify({
    parent_request_id:parentRequestId,parent_cycle_id:cycleId,
    pending_effects:canonical})).slice(0,32);
}

function verifyEffectReceipt(item,expected){
  expected=expected||{};
  if(!item||!effectReceiptMinted.has(item)||Object.isFrozen(item)!==true||
      item.schema!=='anew.pai.effect-receipt-evidence.v1'||
      item.evidence_kind!=='verified_effect_receipt'||
      ['pai.current_turn.effect_receipt','anew.world.effect_unknown_readback']
        .indexOf(item.provenance)<0||
      String(item.ham_uid||'').toUpperCase()!==String(expected.hamUid||'').toUpperCase()||
      item.request_id!==expected.requestId||item.cycle_id!==expected.cycleId||
      !item.parent_request_id||!/^[a-f0-9]{64}$/.test(String(item.packet_digest||''))||
      item.source_result_digest!==digest(item.result))return false;
  var unsigned=Object.assign({},item);delete unsigned.result_digest;
  return item.result_digest===digest(stableStringify(unsigned));
}

module.exports = {
  append:append,
  mint:mint,
  mintServerPrefetch:mintServerPrefetch,
  grantServerPrefetch:grantServerPrefetch,
  consumeServerPrefetch:consumeServerPrefetch,
  mintMemory:mintMemory,
  verify:verify,
  verifyMemory:verifyMemory,
  mintEffectReceipt:mintEffectReceipt,
  mintUnknownEffectReceipt:mintUnknownEffectReceipt,
  verifyEffectReceipt:verifyEffectReceipt,
  effectPlanRequestId:effectPlanRequestId,
  countMax:countMax,
  digest:digest,
  itemMaxBytes:itemMaxBytes,
  resultMaxBytes:resultMaxBytes,
  stableStringify:stableStringify,
  truncateUtf8:truncateUtf8,
  _test:{ parsedSuccess:parsedSuccess, bindingFrom:bindingFrom,
    memoryBindingFrom:memoryBindingFrom }
};
