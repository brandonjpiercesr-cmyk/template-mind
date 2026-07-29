// ⬡B:core.identity_provenance:WONDER:stored_memory_vs_bound_role:20260715⬡
// Pure provenance organ shared by Memory Bank, CODA, and SHADOW.
// It never names a person, agent, or answer. It extracts subjects from the exact
// question, classifies bounded rows by evidence type, and validates attribution.
'use strict';

var crypto = require('crypto');
var EVIDENCE_RESULT_SCHEMA = 'anew.identity.evidence.result.v1';
var EVIDENCE_RECEIPT_SCHEMA = 'anew.identity.evidence.receipt.v1';

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/[\u2018\u2019]/g, "'");
}

function parseEvidenceResult(result) {
  if (typeof result !== 'string' || !result.length) return null;
  try {
    var parsed = JSON.parse(result);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function validateEvidenceReceiptShape(receipt, boundHamUid) {
  var ham = String(boundHamUid || '').toUpperCase();
  return !!(ham && receipt && receipt.schema === EVIDENCE_RECEIPT_SCHEMA &&
    receipt.evidence_schema === EVIDENCE_RESULT_SCHEMA &&
    /^[a-f0-9]{64}$/.test(String(receipt.result_sha256 || '')) &&
    Number.isInteger(receipt.result_utf8_bytes) && receipt.result_utf8_bytes > 0 &&
    Number.isInteger(receipt.subject_count) && receipt.subject_count >= 0 &&
    receipt.subject_count <= 8 &&
    Number.isInteger(receipt.record_count) && receipt.record_count >= 0 &&
    receipt.record_count <= 24 &&
    receipt.available === true && String(receipt.ham_uid || '').toUpperCase() === ham);
}

function boundedOptionalString(value, limit) {
  return value == null || (typeof value === 'string' && value.length <= limit);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  var proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validStoredRecord(record, subjects, boundHamUid) {
  if (!plainObject(record)) return false;
  var allowed = {
    subject:true, origin:true, evidence_kind:true, row_id:true, ham_uid:true,
    agent_global:true, stamp_type:true, source:true, summary:true, content:true,
    created_at:true
  };
  if (Object.keys(record).some(function (key) { return !allowed[key]; })) return false;
  if (!['subject', 'origin', 'evidence_kind', 'ham_uid'].every(function (key) {
        return Object.prototype.hasOwnProperty.call(record, key);
      }) ||
      typeof record.subject !== 'string' || subjects.indexOf(record.subject) < 0 ||
      record.origin !== 'stored_memory' ||
      ['stored_definition', 'stored_role_claim', 'stored_activity']
        .indexOf(record.evidence_kind) < 0 ||
      record.ham_uid !== boundHamUid) return false;
  var rowIdValid = record.row_id == null ||
    (typeof record.row_id === 'string' && record.row_id.trim().length > 0 &&
      record.row_id.length <= 160) ||
    (typeof record.row_id === 'number' && Number.isSafeInteger(record.row_id) &&
      record.row_id >= 0);
  var sourceValid = record.source == null ||
    (typeof record.source === 'string' && record.source.trim().length > 0 &&
      record.source.length <= 260);
  if (!rowIdValid || (record.row_id == null &&
      !(typeof record.source === 'string' && record.source.trim().length > 0)) ||
      !sourceValid) return false;
  return boundedOptionalString(record.agent_global, 80) &&
    boundedOptionalString(record.stamp_type, 120) &&
    boundedOptionalString(record.summary, 700) &&
    boundedOptionalString(record.content, 1800) &&
    boundedOptionalString(record.created_at, 80);
}

function validateEvidenceEnvelope(envelope, boundHamUid) {
  var ham = String(boundHamUid || '').toUpperCase();
  var allowed = {
    schema:true, ok:true, available:true, ham_uid:true,
    subjects:true, records:true, count:true, ms:true
  };
  if (!ham || !plainObject(envelope) ||
      Object.keys(envelope).some(function (key) { return !allowed[key]; }) ||
      !['schema', 'ok', 'available', 'ham_uid', 'subjects', 'records', 'count']
        .every(function (key) {
          return Object.prototype.hasOwnProperty.call(envelope, key);
        }) ||
      envelope.schema !== EVIDENCE_RESULT_SCHEMA || envelope.ok !== true ||
      envelope.available !== true || envelope.ham_uid !== ham ||
      !Array.isArray(envelope.subjects) || envelope.subjects.length > 8 ||
      !Array.isArray(envelope.records) || envelope.records.length > 24 ||
      (Object.prototype.hasOwnProperty.call(envelope, 'ms') &&
        (!Number.isSafeInteger(envelope.ms) || envelope.ms < 0)) ||
      !Number.isInteger(envelope.count) || envelope.count !== envelope.records.length) {
    return false;
  }
  var seen = Object.create(null);
  for (var i = 0; i < envelope.subjects.length; i++) {
    var subject = envelope.subjects[i];
    if (typeof subject !== 'string' || !subject || subject.length > 80 ||
        subject.trim() !== subject || seen[subject.toLowerCase()]) return false;
    seen[subject.toLowerCase()] = true;
  }
  return envelope.records.every(function (record) {
    return validStoredRecord(record, envelope.subjects, ham);
  });
}

function createEvidenceReceipt(result, boundHamUid) {
  var ham = String(boundHamUid || '').toUpperCase();
  var envelope = parseEvidenceResult(result);
  if (!validateEvidenceEnvelope(envelope, ham)) return null;
  return {
    schema:EVIDENCE_RECEIPT_SCHEMA,
    evidence_schema:EVIDENCE_RESULT_SCHEMA,
    ham_uid:ham,
    result_sha256:crypto.createHash('sha256').update(Buffer.from(result, 'utf8')).digest('hex'),
    result_utf8_bytes:Buffer.byteLength(result, 'utf8'),
    subject_count:envelope.subjects.length,
    record_count:envelope.records.length,
    available:true
  };
}

function sameEvidenceReceipt(left, right) {
  if (!left || !right) return false;
  return left.schema === right.schema &&
    left.evidence_schema === right.evidence_schema &&
    left.ham_uid === right.ham_uid &&
    left.result_sha256 === right.result_sha256 &&
    left.result_utf8_bytes === right.result_utf8_bytes &&
    left.subject_count === right.subject_count &&
    left.record_count === right.record_count &&
    left.available === right.available;
}

function sameEvidenceReceiptOrEmpty(left, right) {
  return (!left && !right) || sameEvidenceReceipt(left, right);
}

function verifyLedgerAgainstEvidenceResult(result, receipt, ledger, boundHamUid,
    trustedBinding) {
  var ham = String(boundHamUid || '').toUpperCase();
  if (!verifyEvidenceReceipt(result, receipt, ham) || !ledger ||
      ledger.schema !== 'anew.identity.provenance.v1' ||
      ledger.available !== true || ledger.receipt_verified !== true ||
      String(ledger.ham_uid || '').toUpperCase() !== ham ||
      !sameEvidenceReceipt(ledger.evidence_receipt, receipt)) return false;
  var envelope = parseEvidenceResult(result);
  if (!validateEvidenceEnvelope(envelope, ham)) return false;
  if (canonicalJson(ledger.subjects) !== canonicalJson(envelope.subjects) ||
      canonicalJson(ledger.stored_records) !== canonicalJson(envelope.records)) return false;
  var expectedBound = ledger.bound_role_context || [];
  var expectedEntries;
  if (trustedBinding && typeof trustedBinding.question === 'string') {
    var expectedLedger = buildLedger({
      question:trustedBinding.question,
      hamUid:ham,
      storedRecords:envelope.records,
      evidenceAvailable:true,
      evidenceReceipt:receipt,
      receiptVerified:true
    });
    if (canonicalJson(expectedLedger.subjects) !== canonicalJson(envelope.subjects)) {
      return false;
    }
    expectedBound = expectedLedger.bound_role_context;
    expectedEntries = expectedLedger.entries;
    if (canonicalJson(ledger.bound_role_context) !== canonicalJson(expectedBound)) {
      return false;
    }
  } else {
    expectedEntries = buildEntries(envelope.subjects, envelope.records, expectedBound);
  }
  return canonicalJson(ledger.entries) === canonicalJson(expectedEntries);
}

function verifyEvidenceReceipt(result, receipt, boundHamUid) {
  if (!validateEvidenceReceiptShape(receipt, boundHamUid)) return false;
  var actual = createEvidenceReceipt(result, boundHamUid);
  return !!actual && sameEvidenceReceipt(actual, receipt);
}

function createEvidenceProof(envelope, boundHamUid) {
  if (!envelope || envelope.ok !== true || envelope.available !== true) {
    return { ok:false, reason:String(envelope && envelope.reason || 'identity_evidence_unavailable') };
  }
  var result;
  try { result = JSON.stringify(envelope); }
  catch (error) { return { ok:false, reason:'identity_evidence_not_serializable' }; }
  var receipt = createEvidenceReceipt(result, boundHamUid);
  return receipt ? { ok:true, result:result, receipt:receipt }
    : { ok:false, reason:'identity_evidence_receipt_invalid' };
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalJson(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
}

function subjectPattern(subject) {
  var body = escapeRegex(normalizeText(subject).trim()).replace(/\s+/g, '\\s+');
  return new RegExp('(^|[^A-Za-z0-9_])' + body + '(?=$|[^A-Za-z0-9_])', 'i');
}

function extractIdentitySubjects(question) {
  var text = normalizeText(question);
  var seen = Object.create(null);
  var subjects = [];
  var rejected = { he:true, she:true, they:true, them:true, you:true, it:true,
    this:true, that:true, someone:true, anyone:true, everyone:true };
  function add(raw) {
    var value = normalizeText(raw).replace(/^[\s"'\u201c\u201d]+|[\s"'\u201c\u201d]+$/g, '')
      .replace(/^(?:the|a|an)\s+/i, '').trim();
    if (!value || value.length > 80 || !/[A-Z]/.test(value) ||
        value.split(/\s+/).length > 5 || rejected[value.toLowerCase()]) return;
    var key = value.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    subjects.push(value);
  }
  var direct = /\bwho\s+(?:is|are)\s+(.+?)(?=(?:\s+and\s+who\s+(?:is|are)\b)|[,;?.\n]|$)/gi;
  var match;
  while ((match = direct.exec(text)) && subjects.length < 8) add(match[1]);
  var reverse = /\bwho\s+([A-Z][A-Za-z0-9_' -]{0,79}?)\s+(?:is|are)\b/g;
  while ((match = reverse.exec(text)) && subjects.length < 8) add(match[1]);
  return subjects.slice(0, 8);
}

function extractBoundRoleContext(question) {
  var text = normalizeText(question);
  var out = [];
  var seen = Object.create(null);
  function add(match) {
    var exact = String(match || '').trim();
    if (!exact || seen[exact.toLowerCase()]) return;
    seen[exact.toLowerCase()] = true;
    out.push({
      origin:'bound_role_context',
      name:'current_request_role',
      source:'pai.current_request.role_binding',
      text:exact,
      evidence_digest:null
    });
  }
  var forward = /\b(?:(?:you\s+are|you're)\s+(?:playing\s+(?:the\s+)?role\s+of\s+)?|act(?:ing)?\s+as\s+|call\s+yourself\s+)([A-Z][A-Za-z0-9_' -]{0,79}?)(?=[,;?.\n]|$)/gi;
  var reverse = /\b([A-Z][A-Za-z0-9_'-]{1,79})\s*,?\s+(?:which\s+is|that\s+is|that's)\s+you\b/g;
  var speaker = /\b(?:this\s+is|i\s+am|i'm)\s+([A-Z][A-Za-z0-9_'-]{1,79})(?=[,;?.\n]|$)/g;
  var match;
  while ((match = forward.exec(text)) && out.length < 4) add(match[0]);
  while ((match = reverse.exec(text)) && out.length < 4) add(match[0]);
  while ((match = speaker.exec(text)) && out.length < 4) add(match[0]);
  return out;
}

function requiresProvenanceSplit(question) {
  var text = normalizeText(question).toLowerCase();
  return /\b(?:distinguish|separate|differentiate|tell\s+apart|split)\b/.test(text) &&
    /\b(?:stored|memory|retriev(?:e|ed|al)|found|record(?:ed|s)?)\b/.test(text) &&
    /\b(?:request(?:ed)?|role|context|chat|new\s+answer|current\s+answer)\b/.test(text) &&
    extractIdentitySubjects(question).length > 0;
}

function unpackRowContent(row) {
  var value = row && row.content;
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return value == null ? '' : String(value);
  var text = value.trim();
  if (!text || (text.charAt(0) !== '{' && text.charAt(0) !== '[')) return value;
  try { return JSON.parse(text); } catch (e) { return value; }
}

function rowText(row) {
  var content = unpackRowContent(row);
  var body = content && typeof content === 'object'
    ? (typeof content.text === 'string' ? content.text : JSON.stringify(content))
    : String(content || '');
  return normalizeText([
    row && row.agent_global, row && row.stamp_type, row && row.source,
    row && row.summary, body
  ].filter(Boolean).join('\n'));
}

function rowMentionsSubject(row, subject) {
  return String(row && row.agent_global || '').toLowerCase() === String(subject || '').toLowerCase() ||
    subjectPattern(subject).test(rowText(row));
}

function roleClaimText(row, subject) {
  if (String(row && row.stamp_type || '').toUpperCase() !== 'LOGFUL') return '';
  var content = unpackRowContent(row);
  var text = normalizeText(content && typeof content === 'object' && content.text || content || '');
  var question = text.split(/\nA\s*:/i)[0].replace(/^\s*Q\s*:\s*/i, '').trim();
  if (!question || !subjectPattern(subject).test(question)) return '';
  var subject = escapeRegex(normalizeText(subject)).replace(/\s+/g, '\\s+');
  var selfDescription = new RegExp("(?:\\bi\\s*(?:am|'m)|\\bthis\\s+is|\\bmy\\s+(?:name|role)\\s+is)[^.!?\\n]{0,120}" +
    subject + "(?=$|[^A-Za-z0-9_])", 'i');
  return selfDescription.test(question) ? question.slice(0) : '';
}

function definitionKind(row, subject) {
  var stamp = String(row && row.stamp_type || '').toUpperCase();
  var source = String(row && row.source || '').toLowerCase();
  if (stamp === 'HAM_IDENTIFIER' || stamp === 'AGENT_JD' ||
      source.indexOf('agent.jd') === 0 || source.indexOf('scw.person_profile.') === 0) {
    return 'stored_definition';
  }
  var content = unpackRowContent(row);
  if (stamp === 'SCW' && content && typeof content === 'object' &&
      ['role', 'purpose', 'name', 'agent'].some(function (key) {
        return content[key] != null && subjectPattern(subject).test(String(content[key]));
      })) return 'stored_definition';
  if ((stamp === 'DOCTRINE' || stamp === 'SCW') &&
      /\b(?:role|lane|agent|station|founder|mouthpiece|internal|external|lead|repair|diagnos)\b/i.test(rowText(row))) {
    return 'stored_definition';
  }
  return '';
}

function boundedStoredRecord(row, subject, kind, claimText) {
  var content = claimText || unpackRowContent(row);
  if (content && typeof content === 'object') {
    try { content = JSON.stringify(content); } catch (e) { content = ''; }
  }
  return {
    subject: subject,
    origin: 'stored_memory',
    evidence_kind: kind,
    row_id: row && row.id == null ? null : row.id,
    ham_uid: row && row.ham_uid == null ? null : String(row.ham_uid).toUpperCase(),
    agent_global: row && row.agent_global == null ? null : String(row.agent_global).slice(0, 80),
    stamp_type: row && row.stamp_type == null ? null : String(row.stamp_type).slice(0, 120),
    source: row && row.source == null ? null : String(row.source).slice(0, 260),
    summary: String(row && row.summary || '').slice(0, 700),
    content: String(content || '').slice(0),
    created_at: row && row.created_at == null ? null : String(row.created_at).slice(0, 80)
  };
}

function buildStoredEvidence(rows, subjects, hamUid) {
  var exactHam = String(hamUid || '').toUpperCase();
  var sourceRows = Array.isArray(rows) ? rows : [];
  var names = Array.isArray(subjects) ? subjects.slice(0, 8) : [];
  var ranked = { stored_definition:0, stored_role_claim:1, stored_activity:2 };
  var out = [];
  names.forEach(function (subject) {
    var perSubject = [];
    var seen = Object.create(null);
    sourceRows.forEach(function (row) {
      if (!row || String(row.ham_uid || '').toUpperCase() !== exactHam ||
          !rowMentionsSubject(row, subject)) return;
      var claim = roleClaimText(row, subject);
      var kind = claim ? 'stored_role_claim' : (definitionKind(row, subject) || 'stored_activity');
      var key = String(row.id == null ? row.source : row.id) + '|' + kind;
      if (seen[key]) return;
      seen[key] = true;
      perSubject.push(boundedStoredRecord(row, subject, kind, claim));
    });
    perSubject.sort(function (left, right) {
      var weight = ranked[left.evidence_kind] - ranked[right.evidence_kind];
      if (weight) return weight;
      return String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });
    out = out.concat(perSubject.slice(0, 3));
  });
  return out.slice(0, 24);
}

function buildEntries(subjects, stored, bound) {
  return (subjects || []).map(function (subject) {
    var storedForSubject = (stored || []).filter(function (item) {
      return String(item && item.subject || '').toLowerCase() ===
        String(subject || '').toLowerCase();
    });
    var boundForSubject = (bound || []).filter(function (item) {
      return subjectPattern(subject).test(item.text);
    });
    return {
      subject:subject,
      stored_evidence_kinds:storedForSubject.map(function (item) {
        return item.evidence_kind;
      }).filter(function (kind, index, all) {
        return all.indexOf(kind) === index;
      }),
      stored_record_ids:storedForSubject.map(function (item) {
        return item.row_id;
      }).filter(function (id) { return id != null; }),
      bound_context_sources:boundForSubject.map(function (item) {
        return item.source || item.name;
      })
    };
  });
}

function buildLedger(input) {
  input = input || {};
  var question = String(input.question || '');
  var subjects = extractIdentitySubjects(question);
  var stored = Array.isArray(input.storedRecords) ? input.storedRecords.slice(0, 24) : [];
  // ⬡B:core.identity_provenance:GUARD:bound_roles_only_from_exact_question:20260715⬡
  // Named BCW doctrine remains named evidence. It is never relabeled as a role
  // binding; only explicit role language in the exact request enters this bucket.
  var suppliedBound = extractBoundRoleContext(question).slice(0, 4);
  var bound = suppliedBound.map(function (item) {
    return {
      origin: 'bound_role_context',
      name: String(item && item.name || '').slice(0, 120),
      source: String(item && item.source || '').slice(0, 180),
      text: String(item && item.text || '').slice(0),
      evidence_digest: item && item.evidence_digest || null
    };
  });
  var entries = buildEntries(subjects, stored, bound);
  return {
    schema: 'anew.identity.provenance.v1',
    required: requiresProvenanceSplit(question),
    ham_uid:String(input.hamUid || input.evidenceReceipt && input.evidenceReceipt.ham_uid || '').toUpperCase() || null,
    available: input.evidenceAvailable !== false,
    unavailable_reason: input.evidenceAvailable === false
      ? String(input.unavailableReason || 'identity_evidence_unavailable').slice(0, 160) : null,
    evidence_receipt: input.evidenceReceipt || null,
    receipt_verified: input.receiptVerified === true,
    subjects: subjects,
    entries: entries,
    stored_records: stored,
    bound_role_context: bound
  };
}

function blockBetween(text, startPattern, endPattern) {
  var match = text.match(startPattern);
  if (!match || match.index == null) return '';
  // The heading regex includes its colon. Begin immediately after that match so
  // both "HEADING: same-line content" and the multiline form are validated.
  var rest = text.slice(match.index + match[0].length);
  var end = rest.search(endPattern);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

function validateDraft(answer, ledger) {
  var value = normalizeText(answer);
  var state = ledger && typeof ledger === 'object' ? ledger : { required:false };
  if (state.required !== true) return { ok:true, violations:[], findings:[] };
  var violations = [];
  var findings = [];
  function add(code, subject) {
    if (violations.indexOf(code + (subject ? ':' + subject.toLowerCase() : '')) >= 0) return;
    violations.push(code + (subject ? ':' + subject.toLowerCase() : ''));
    findings.push({ reason:'identity_provenance_invalid', violation:code,
      subject:subject || null });
  }
  if (state.available !== true) add('identity_evidence_unavailable');
  if (state.receipt_verified !== true ||
      !validateEvidenceReceiptShape(state.evidence_receipt,
        state.evidence_receipt && state.evidence_receipt.ham_uid)) {
    add('identity_evidence_receipt_unverified');
  }
  var storedHeading = /^\s*STORED MEMORY\s*:/im;
  var boundHeading = /^\s*BOUND ROLE CONTEXT\s*:/im;
  if (!storedHeading.test(value)) add('stored_memory_section_missing');
  if (!boundHeading.test(value)) add('bound_role_context_section_missing');
  var storedBlock = blockBetween(value, storedHeading,
    /^\s*(?:BOUND ROLE CONTEXT|NOT ESTABLISHED)\s*:/im);
  var boundBlock = blockBetween(value, boundHeading,
    /^\s*(?:STORED MEMORY|NOT ESTABLISHED)\s*:/im);
  (state.subjects || []).forEach(function (subject) {
    if (!subjectPattern(subject).test(value)) add('identity_subject_omitted', subject);
    var entry = (state.entries || []).find(function (item) {
      return String(item && item.subject || '').toLowerCase() === subject.toLowerCase();
    }) || { stored_evidence_kinds:[], bound_context_sources:[] };
    var kinds = entry.stored_evidence_kinds || [];
    var storedWindow = '';
    var index = storedBlock.search(subjectPattern(subject));
    if (index >= 0) storedWindow = storedBlock.slice(Math.max(0, index - 120), index + 260);
    if (kinds.length && index < 0) add('stored_memory_subject_omitted', subject);
    if (!kinds.length && storedWindow &&
        !/\b(?:no|none|not|nothing|unestablished|does not establish|isn't established)\b/i.test(storedWindow)) {
      add('stored_claim_without_evidence', subject);
    }
    if (kinds.indexOf('stored_role_claim') >= 0 &&
        kinds.indexOf('stored_definition') < 0 && storedWindow &&
        !/\b(?:claim(?:ed|s)?|self-describ(?:e|ed|es)|present(?:ed|s)?|report(?:ed|s)?|message|conversation|role claim)\b/i.test(storedWindow)) {
      add('stored_role_claim_literalized', subject);
    }
    if (kinds.length === 1 && kinds[0] === 'stored_activity' && storedWindow) {
      var copular = new RegExp(escapeRegex(subject) + "\\s+(?:is|are|was|were)\\s+", 'i');
      if (copular.test(storedWindow)) add('stored_activity_inflated_to_identity', subject);
    }
    if ((entry.bound_context_sources || []).length && !subjectPattern(subject).test(boundBlock)) {
      add('bound_role_subject_omitted', subject);
    }
  });
  return { ok:violations.length === 0, violations:violations, findings:findings };
}

module.exports = {
  EVIDENCE_RESULT_SCHEMA:EVIDENCE_RESULT_SCHEMA,
  EVIDENCE_RECEIPT_SCHEMA:EVIDENCE_RECEIPT_SCHEMA,
  createEvidenceReceipt:createEvidenceReceipt,
  createEvidenceProof:createEvidenceProof,
  validateEvidenceEnvelope:validateEvidenceEnvelope,
  verifyEvidenceReceipt:verifyEvidenceReceipt,
  verifyLedgerAgainstEvidenceResult:verifyLedgerAgainstEvidenceResult,
  validateEvidenceReceiptShape:validateEvidenceReceiptShape,
  sameEvidenceReceipt:sameEvidenceReceipt,
  sameEvidenceReceiptOrEmpty:sameEvidenceReceiptOrEmpty,
  extractIdentitySubjects:extractIdentitySubjects,
  requiresProvenanceSplit:requiresProvenanceSplit,
  extractBoundRoleContext:extractBoundRoleContext,
  buildStoredEvidence:buildStoredEvidence,
  buildLedger:buildLedger,
  validateDraft:validateDraft,
  _test:{ rowText:rowText, roleClaimText:roleClaimText,
    definitionKind:definitionKind, subjectPattern:subjectPattern }
};
