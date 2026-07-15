// ⬡B:core.active_awareness:MODULE:last_run_receipts:20260715⬡
// entered via the ABAHAM door, serving every per-HAM PAI cycle.
// Ported from shared core/active-awareness.js with durable New World receipts.
// ENTRANCE reads the prior LAST_RUN. EXIT writes the current LAST_RUN with lineage.
'use strict';

const { find } = require('./find.js');

function _brainTarget() {
  var memoryUrl = String(process.env.MEMORY_BANK_URL || '').trim();
  var memoryKey = String(process.env.MEMORY_BANK_KEY || '').trim();
  if (memoryUrl || memoryKey) {
    if (!memoryUrl || !memoryKey) {
      return {
        url: null,
        key: null,
        table: process.env.BEAD_TABLE || 'beads',
        schema: process.env.BRAIN_SCHEMA || 'memory_bank',
        error: 'memory_bank_target_incomplete'
      };
    }
    return {
      url: memoryUrl,
      key: memoryKey,
      table: process.env.BEAD_TABLE || 'beads',
      schema: process.env.BRAIN_SCHEMA || 'memory_bank',
      error: null
    };
  }
  var legacyUrl = String(process.env.AIBE_BRAIN_URL || '').trim();
  var legacyKey = String(process.env.AIBE_BRAIN_KEY || '').trim();
  if (!legacyUrl || !legacyKey) {
    return {
      url: null,
      key: null,
      table: process.env.BEAD_TABLE || 'aibe_brain',
      schema: process.env.BRAIN_SCHEMA || 'abacia_core',
      error: legacyUrl || legacyKey ? 'legacy_target_incomplete' : 'brain_target_unconfigured'
    };
  }
  return {
    url: legacyUrl,
    key: legacyKey,
    table: process.env.BEAD_TABLE || 'aibe_brain',
    schema: process.env.BRAIN_SCHEMA || 'abacia_core',
    error: null
  };
}

function _address(agentName, hamUid) {
  var agent = String(agentName || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  var ham = String(hamUid || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  if (!agent || !ham) return null;
  return 'agent.' + agent + '.last_run.' + ham;
}

function _edges(hamUid) {
  return [{ type: 'feeds', target: 'ham_' + String(hamUid).toLowerCase() + '.pai.next_cycle' }];
}

function _boundedList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(function (item) { return String(item || '').slice(0, 200); }).filter(Boolean);
}

function _parseContent(content) {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string' || !content) return Object.create(null);
  try { return JSON.parse(content); } catch (_error) { return Object.create(null); }
}

// ⬡B:core.active_awareness:FUNCTION:read_last_run_receipt:20260715⬡
async function readLastRunWithReceipt(agentName, hamUid) {
  var target = _brainTarget();
  var source = _address(agentName, hamUid);
  var receipt = {
    ok: false,
    attempted: false,
    found: false,
    reads: 0,
    status: null,
    id: null,
    receiptId: null,
    source: source,
    createdAt: null,
    data: null,
    edges: [],
    error: null
  };
  if (!source) {
    receipt.error = 'invalid_active_awareness_address';
    return receipt;
  }
  if (!target.url || !target.key) {
    receipt.error = target.error || 'brain_target_unconfigured';
    return receipt;
  }

  receipt.attempted = true;
  try {
    var result = await find([{
      stamp_type: 'LAST_RUN',
      source_prefix: source,
      ham_uid: String(hamUid).toUpperCase(),
      limit: 1
    }]);
    receipt.reads = Number(result && result.reads) || 0;
    if (!result || result.read_ok !== true) {
      var failure = result && Array.isArray(result.read_failures) ? result.read_failures[0] : null;
      receipt.status = failure ? failure.status : null;
      receipt.error = String(failure && failure.error || 'last_run_read_unverified').slice(0, 300);
      return receipt;
    }
    receipt.status = 200;
    receipt.ok = true;
    var rows = Array.isArray(result.beads) ? result.beads : [];
    var row = rows.find(function (candidate) { return candidate && candidate.source === source; });
    if (!row) return receipt;
    receipt.found = true;
    receipt.id = row.id != null ? row.id : null;
    receipt.receiptId = receipt.id;
    receipt.createdAt = row.created_at || null;
    receipt.data = _parseContent(row.content);
    receipt.edges = Array.isArray(row.edges)
      ? row.edges
      : (receipt.data && Array.isArray(receipt.data.edges) ? receipt.data.edges : []);
    if (receipt.id == null) {
      receipt.ok = false;
      receipt.error = 'receipt_id_missing';
    }
  } catch (error) {
    receipt.error = String(error && error.message || error).slice(0, 300);
  }
  return receipt;
}

// ⬡B:core.active_awareness:FUNCTION:write_last_run_receipt:20260715⬡
async function writeLastRunWithReceipt(agentName, hamUid, cycleData) {
  var target = _brainTarget();
  var source = _address(agentName, hamUid);
  var receipt = {
    ok: false,
    attempted: false,
    persisted: false,
    status: null,
    id: null,
    receiptId: null,
    source: source,
    error: null
  };
  if (!source) {
    receipt.error = 'invalid_active_awareness_address';
    return receipt;
  }
  if (!target.url || !target.key) {
    receipt.error = target.error || 'brain_target_unconfigured';
    return receipt;
  }

  var data = cycleData && typeof cycleData === 'object' ? cycleData : {};
  var at = Date.now();
  var graphEdges = _edges(hamUid);
  var summary = String(data.summary || 'cycle complete').slice(0, 240);
  var content = {
    agent: String(agentName),
    hamUid: String(hamUid),
    timestamp: new Date(at).toISOString(),
    cycleId: data.cycleId || null,
    previousReceiptId: data.previousReceiptId != null ? data.previousReceiptId : null,
    summary: summary,
    status: String(data.status || 'DONE').slice(0, 40),
    channel: data.channel ? String(data.channel).slice(0, 40) : null,
    done: _boundedList(data.done),
    found: _boundedList(data.found),
    flagged: _boundedList(data.flagged),
    handedOff: _boundedList(data.handedOff),
    incomplete: _boundedList(data.incomplete),
    nextCycle: _boundedList(data.nextCycle),
    toolsUsed: _boundedList(data.toolsUsed),
    toolExecutions: Array.isArray(data.toolExecutions) ? data.toolExecutions.slice(0, 20) : [],
    edges: graphEdges
  };
  var bead = {
    ham_uid: String(hamUid).toUpperCase(),
    agent_global: String(agentName),
    stamp_type: 'LAST_RUN',
    acl_stamp: '\u2b21B:core.active_awareness:LAST_RUN:pai_cycle:' + at + '\u2b21',
    source: source,
    summary: '[LAST_RUN] ' + String(agentName) + ': ' + summary,
    content: JSON.stringify(content),
    importance: 4
  };
  if (target.table !== 'aibe_brain') {
    bead.spawned_by = String(agentName);
    bead.edges = graphEdges;
  }

  receipt.attempted = true;
  try {
    var response = await fetch(target.url + '/rest/v1/' + target.table, {
      method: 'POST',
      headers: {
        apikey: target.key,
        Authorization: 'Bearer ' + target.key,
        'Accept-Profile': target.schema,
        'Content-Profile': target.schema,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(bead)
    });
    receipt.status = response.status;
    var responseText = String(await response.text());
    if (!response.ok) {
      receipt.error = responseText.slice(0, 300);
      return receipt;
    }
    var rows = [];
    try { rows = responseText ? JSON.parse(responseText) : []; } catch (_error) {}
    var row = Array.isArray(rows) ? rows[0] : rows;
    receipt.id = row && row.id != null ? row.id : null;
    receipt.receiptId = receipt.id;
    receipt.persisted = receipt.id != null;
    receipt.ok = receipt.persisted;
    if (!receipt.persisted) receipt.error = 'receipt_id_missing';
  } catch (error) {
    receipt.error = String(error && error.message || error).slice(0, 300);
  }
  return receipt;
}

var readLastRun = readLastRunWithReceipt;
var writeLastRun = writeLastRunWithReceipt;

module.exports = {
  readLastRunWithReceipt,
  writeLastRunWithReceipt,
  readLastRun,
  writeLastRun
};
