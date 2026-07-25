// ⬡B:core.pai_tool_evidence:MODULE:execution_minted_fact_evidence:20260725⬡
// One in-process authenticity boundary for tool facts. Only this module can mint
// an evidence object after executeTool returns. SHADOW verifies object identity,
// exact turn binding, digest, success, read classification, and byte ceilings.
'use strict';

var crypto = require('node:crypto');
var minted = new WeakSet();
var memoryMinted = new WeakSet();

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
  var max = itemMaxBytes();
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
    args:truncateUtf8(publicArgs, max),
    result:truncateUtf8(fullResult, max),
    result_truncated:Buffer.byteLength(fullResult, 'utf8') > max
  };
  item.result_digest = digest(stableStringify(bindingFrom(item)));
  Object.freeze(item);
  minted.add(item);
  return item;
}

function verify(item, expected, options) {
  expected = expected || {};
  options = options || {};
  if (!item || typeof item !== 'object' || !minted.has(item) || Object.isFrozen(item) !== true) {
    return false;
  }
  if (item.schema !== 'anew.pai.executed-tool-evidence.v1' ||
      String(item.ham_uid || '').toUpperCase() !== String(expected.hamUid || '').toUpperCase() ||
      item.request_id !== expected.requestId || item.cycle_id !== expected.cycleId ||
      !item.tool_call_id || !item.tool ||
      (options.requireRead === true && item.successful_read !== true)) return false;
  var max = itemMaxBytes();
  if (Buffer.byteLength(String(item.args || ''), 'utf8') > max ||
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

module.exports = {
  append:append,
  mint:mint,
  mintMemory:mintMemory,
  verify:verify,
  verifyMemory:verifyMemory,
  countMax:countMax,
  digest:digest,
  itemMaxBytes:itemMaxBytes,
  stableStringify:stableStringify,
  truncateUtf8:truncateUtf8,
  _test:{ parsedSuccess:parsedSuccess, bindingFrom:bindingFrom,
    memoryBindingFrom:memoryBindingFrom }
};
