// ⬡B:core.find:MODULE:microsecond_brain_search:20260630⬡
// FIND — Mount Rushmore. Always on. Stamp-based precision queries.
// No ilike wildcards. No full-table scans. Filter by stamp_type, source prefix, ham_uid.
// Runs in parallel via Promise.all. Target: <100ms for any query set.
// ANYHAM test: ham_uid parameter drives all reads. No HAM hardcoded here.
// Cost: C0 — pure Supabase REST, zero LLM calls.

// ⬡B:core.find:FIX:restore_organ_after_8b_lobotomy:20260703⬡
// Commit a66c148 (an 8B fallback build, pre model-chain fix fa58b0a) REPLACED this
// entire file with a 50-line generic stub, severing all six named finders from 34+
// dependents; every Memory Bank assembly then threw 'findIdentity is not a function' and
// every turn on every channel ran on a generic prompt -- caught live by a test-HAM
// regression turn (logful pai.memorybank_fallback regression turn, source ts 1783039989311). This is the
// last good version restored verbatim from f8cfe19 (which already carried the
// order:asc capability and the findContext/findPersonProfile work). Restoration of
// lost code, zero new behavior.
'use strict';
var crypto = require('node:crypto');
// ⬡B:core.find:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}
var identityProvenance = require('./identity.provenance.js');

// ⬡B:core.find:FIX:a_threshold_on_his_own_doctrine_had_no_owner:20260815⬡
// THE ONE SOURCE for every number in this estate that rules on quality or worth:
// core/judgment.SETTING.a_threshold_has_an_owner.20260731.js. Four legal answers, and the two
// that are not FOUNDER or LANE mean nobody chose, which means there is no threshold to apply.
var judgment = require('./judgment.SETTING.a_threshold_has_an_owner.20260731.js');

// How important a DOCTRINE row must be before it may reach her wall.
//
// WHAT WAS HERE: a bare `importance_gte: 8`, hand-copied to five places in this file, deciding
// which of the founder's OWN doctrine she is allowed to read. No owner, no name, no comment on
// any of the five. Meanwhile the sibling ROADMAP read one line below carries no importance
// predicate at all, which is the asymmetry that gives the number away: nobody chose 8 for a
// reason, it was copied.
//
// AND THE WRITERS NEVER AGREED WITH IT. scripts/doctrine_ingest.js writes his corrected doctrine
// archive at importance 6, and says in its own comment that it deliberately refuses to out-guess
// the reader ("Keeper's mind ranks relevance at read time... so cold code here does not try to
// out-guess it per file"). agents/advisor_scw.js defaults world doctrine to 7. BOTH scripted
// writers land under 8. The writer declined to make the judgment; the reader made it anyway,
// with a number nobody picked, and the doctrine section of her wall has been structurally empty
// for every row either of them ever wrote.
//
// This is the shape CLAUDE.md 20260815 names: "never filter a row, never cap her read." The
// predicate is a PostgREST `importance=gte.` on the database call (see queryPath below), so the
// rows never came back at all and she never learned they existed. Importance is ALREADY a
// ranking input one layer up at core/agent.find.js#191, so this predicate bought nothing the
// ranking did not already do, except make rows unknowable.
//
// UNSET MEANS NO FLOOR: this returns null, never a number, when nobody chose. queryPath appends
// the predicate only when it is non-null, so an unowned setting REMOVES the filter rather than
// inventing a value. That is not an unbounded read: capacity is a different animal and is
// unchanged, core/agent.find.js#runtimeContextBudgets still binds the expanded wall by
// FCW_MODEL_CONTEXT_BYTES and still REPORTS every row it omitted. A bound on what a process can
// hold is a fact; a ruling on what is worth seeing is a judgment. Only the judgment moves here.
var DOCTRINE_WALL_FLOOR_SETTING = 'ANU_DOCTRINE_WALL_IMPORTANCE_FLOOR';
function doctrineWallFloor(runtime) {
  var gate = judgment.readJudgmentSetting(DOCTRINE_WALL_FLOOR_SETTING,
    { integer: true, min: 0, max: 10 }, runtime);
  return (gate.chosen_by === judgment.CHOSEN_BY.FOUNDER
    || gate.chosen_by === judgment.CHOSEN_BY.LANE) ? gate.value : null;
}

var LAST_AIR_CYCLE_SCHEMA = 'anew.find.last-air-cycle-readback.v1';
var LAST_AIR_STREAM_MODE = 'DURABLE_READBACK_NOT_LIVE_STREAM';
var LAST_AIR_CHUNK_SCHEMA = 'anew.find.last-air-cycle-context-chunk.v1';
var LAST_AIR_PROGRESSIVE_FACT_SCHEMA = 'anew.find.last-air-cycle-progressive-fact.v1';
var LAST_AIR_CHUNK_BYTES = 4096;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsedObject(value) {
  if (plainObject(value)) return value;
  try {
    var parsed = JSON.parse(value || 'null');
    return plainObject(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
  return value;
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

function digestText(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function digestObject(value) { return digestText(stableStringify(value)); }

// The deployed legacy table predates these columns. Sending even one unknown column in a
// PostgREST select or predicate rejects the entire read with HTTP 400, which used to make every
// ordinary A'NU turn fail before deliberation. Canonical memory_bank.beads owns active-truth
// supersession. Legacy aibe_brain cannot express that state, so it must not be queried as if it
// can. This is a physical storage capability boundary, never a semantic choice.
var NEW_BANK_ONLY_COLUMNS = Object.freeze({
  superseded_by:true, edges:true, spawned_by:true, abcd_tag:true
});
function supportsActiveTruth() { return _tbl() !== 'aibe_brain'; }
function activeTruthPredicate(parts, query) {
  if (supportsActiveTruth() && (!query || query.include_superseded !== true)) {
    parts.push('superseded_by=is.null');
  }
}
function compatibleSelect(value, requireActiveTruthColumn) {
  var seen=Object.create(null), columns=String(value||'').split(',').map(function(column){
    return column.trim();
  }).filter(function(column){
    if(!column||seen[column])return false;
    if(!supportsActiveTruth()&&NEW_BANK_ONLY_COLUMNS[column])return false;
    seen[column]=true;return true;
  });
  if(requireActiveTruthColumn&&supportsActiveTruth()&&!seen.superseded_by){
    columns.push('superseded_by');
  }
  return columns.join(',');
}


function bh() {
  var BU = _bu();
  var BK = _bk();
  return {
    url: BU,
    hdrs: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }
  };
}

function bq(path, signal) {
  var b = bh();
  // ⬡B:core.find:GUARD:generic_read_availability_is_explicit:20260730⬡
  // An unavailable bank and a successful empty query are different facts. Every generic FIND
  // read now carries that distinction while retaining the bounded fail-soft behavior: a single
  // failed query can still coexist with successful siblings, but it can no longer impersonate
  // an empty human history.
  if (!b.url || !b.hdrs.apikey) return Promise.resolve({
    ok:false, available:false, reason:'brain_unconfigured', rows:[]
  });
  return new Promise(function(resolve) {
    var settled = false;
    var abortHandler = null;
    function finish(result) {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort',abortHandler);
      resolve(result);
    }
    if (signal) {
      abortHandler = function(){finish({ok:false,available:false,reason:'brain_timeout',rows:[]});};
      if (signal.aborted) return abortHandler();
      signal.addEventListener('abort',abortHandler,{once:true});
    }
    Promise.resolve().then(function() {
      var request = {headers:b.hdrs};
      if (signal) request.signal = signal;
      return fetch(b.url + '/rest/v1/' + _tbl() + '?' + path, request);
    }).then(function(response) {
      // A real WHATWG Response exposes `ok`, but the long-lived internal bank adapters and
      // focused contract doubles predate that property and expose a successful JSON body
      // directly. Preserve that compatible success shape while still failing closed on an
      // explicit non-OK response or a numeric error status.
      var status = Number(response && response.status);
      if (!response || response.ok === false || (Number.isFinite(status) && status >= 400)) {
        finish({ ok:false, available:false, reason:'brain_http_error',
          status:response && response.status || null, rows:[] });
        return null;
      }
      return Promise.resolve(response.json()).then(function(rows) {
        if (!Array.isArray(rows)) {
          finish({ ok:false, available:false, reason:'brain_payload_invalid', rows:[] });
          return;
        }
        finish({ ok:true, available:true, rows:rows });
      }, function() {
        finish({ ok:false, available:false, reason:'brain_payload_invalid', rows:[] });
      });
    }).catch(function() {
      finish({ok:false,available:false,
        reason:signal && signal.aborted ? 'brain_timeout' : 'brain_transport_error',rows:[]});
    });
  });
}

// PostgREST can return a finite transport page even when the matching memory set is larger.
// A page size is an I/O batch, not a cognition ceiling: exhaustive readers keep walking until
// the provider returns the terminal short page.
var PROVIDER_PAGE_SIZE = 1000;

// ⬡B:core.find:FIX:exhaustive_read_needs_a_process_memory_bound_20260802⬡
// LIVE 911 20260802, SECOND OCCURRENCE: this exact cap was added and merged as anew#1611 to
// stop a real production OOM crash loop (SIGABRT, V8 heap-out-of-memory, confirmed live on
// Render). #1620 ("Repair FCW OOM with question-bound Agent FIND") rewrote readAllPages to add
// walkAllPages beside it and silently dropped this cap in the process, restoring the exact
// unbounded-growth shape that caused the original crash. walkAllPages is a true streaming
// primitive (the caller's onPage consumer owns each page, nothing accumulates), so it does not
// need this bound. readAllPages still materializes every page into one `rows` array before
// returning, so a HAM with a large accumulated bead history can still exhaust the process heap
// across several concurrent exhaustive callers (findIdentity, findAgentJDs, etc). Restoring the
// same bound, same headroom (50 pages, 50,000 rows), so no real HAM's identity/context read
// should ever hit it in practice.
var MAX_EXHAUSTIVE_PAGES = 50;

async function readAllPages(query, pathBuilder, reader) {
  var rows = [];
  var offset = 0;
  var previousPageKey = null;
  var pageCount = 0;
  while (true) {
    var result = await reader(pathBuilder(query, {
      limit:PROVIDER_PAGE_SIZE, offset:offset
    }));
    if (!result || result.ok !== true || result.available !== true) return result;
    var page = Array.isArray(result.rows) ? result.rows : [];
    var first = page[0], last = page[page.length - 1];
    var pageKey = page.length + '|' + String(first && first.id || first && first.source || '')
      + '|' + String(last && last.id || last && last.source || '');
    // A provider or test adapter that ignores offset must fail explicitly instead of spinning.
    // This is a progress invariant, not a page-count or row-count ceiling.
    if (offset > 0 && page.length && pageKey === previousPageKey) {
      return {ok:false, available:false, reason:'brain_pagination_stalled', rows:[]};
    }
    previousPageKey = pageKey;
    rows = rows.concat(page);
    pageCount += 1;
    if (page.length < PROVIDER_PAGE_SIZE) {
      return {ok:true, available:true, rows:rows};
    }
    if (pageCount >= MAX_EXHAUSTIVE_PAGES) {
      return {ok:true, available:true, rows:rows, truncated:true, reason:'brain_pagination_max_pages'};
    }
    offset += page.length;
  }
}

// Full-history expansion is a cursor walk, not a materialized array. The consumer owns each
// page and can persist, reduce, or stream it before the next page arrives. There is no page or
// row ceiling and therefore no ok:true partial history. The stable created_at/id cursor makes
// progress deterministic while writes continue behind the walk.
async function walkAllPages(query, pathBuilder, reader, onPage) {
  if (typeof onPage !== 'function') {
    return {ok:false,available:false,reason:'brain_page_consumer_required',rows:[]};
  }
  var cursor = null;
  var pages = 0;
  var rowsSeen = 0;
  var previousCursor = null;
  while (true) {
    var result = await reader(pathBuilder(query, {limit:PROVIDER_PAGE_SIZE,cursor:cursor}));
    if (!result || result.ok !== true || result.available !== true) return result;
    var page = Array.isArray(result.rows) ? result.rows : [];
    if (page.length) {
      var last = page[page.length - 1];
      cursor = {created_at:last && last.created_at,id:last && last.id};
      if (!cursor.created_at || cursor.id == null) {
        return {ok:false,available:false,reason:'brain_cursor_columns_missing',rows:[]};
      }
      var cursorKey = String(cursor.created_at) + '|' + String(cursor.id);
      if (cursorKey === previousCursor) {
        return {ok:false,available:false,reason:'brain_pagination_stalled',rows:[]};
      }
      previousCursor = cursorKey;
      await onPage(page, {page:pages,cursor:cursor});
      rowsSeen += page.length;
    }
    pages += 1;
    if (page.length < PROVIDER_PAGE_SIZE) {
      return {ok:true,available:true,rows:[],streamed:true,pages:pages,rows_seen:rowsSeen,
        cursor:null};
    }
  }
}

function lastAirFailure(reason) {
  return deepFreeze({schema:LAST_AIR_CYCLE_SCHEMA,ok:false,available:false,
    reason:String(reason || 'last_air_cycle_unavailable'),mode:LAST_AIR_STREAM_MODE,
    producer_completeness_certified:false,provider_effect:null,human_effect:null});
}

function lastAirSuccessfulEmpty() {
  return deepFreeze({schema:LAST_AIR_CYCLE_SCHEMA,ok:true,available:true,empty:true,
    reason:'last_air_cycle_successful_empty',mode:LAST_AIR_STREAM_MODE,
    producer_completeness_certified:false,provider_effect:null,human_effect:null});
}

function exactHam(value) { return String(value || '').trim().toUpperCase(); }
function rowContent(value) { return parsedObject(value && value.content); }
function rowIdentity(value) { return String(value && value.id == null ? '' : value.id); }

function exactCycleSource(source, cycleSource) {
  var value = String(source || '');
  return value === cycleSource || value === cycleSource + '.receipt' ||
    value.indexOf(cycleSource + '.stage.') === 0;
}

function canonicalObservedRow(row) {
  var content = rowContent(row);
  return {id:row.id,ham_uid:row.ham_uid,source:row.source,stamp_type:row.stamp_type,
    agent_global:row.agent_global == null ? null : row.agent_global,
    acl_stamp:row.acl_stamp == null ? null : row.acl_stamp,
    importance:row.importance == null ? null : Number(row.importance),
    created_at:row.created_at == null ? null : row.created_at,
    summary:row.summary == null ? null : row.summary,
    content:content === null ? row.content : content,
    edges:row.edges == null ? null : row.edges};
}

function compareObservedRows(left, right) {
  var created = String(left && left.created_at || '').localeCompare(
    String(right && right.created_at || ''));
  if (created) return created;
  var source = String(left && left.source || '').localeCompare(String(right && right.source || ''));
  if (source) return source;
  var stamp = String(left && left.stamp_type || '').localeCompare(
    String(right && right.stamp_type || ''));
  return stamp || rowIdentity(left).localeCompare(rowIdentity(right));
}

function canonicalSourceStream(rows) {
  var text = '';
  var spans = [];
  var byteOffset = 0;
  (rows || []).forEach(function (row, index) {
    var encoded = stableStringify(canonicalObservedRow(row));
    var bytes = Buffer.byteLength(encoded, 'utf8');
    text += (index ? '\n' : '') + encoded;
    if (index) byteOffset += 1;
    spans.push({row_id:row.id,source:row.source,stamp_type:row.stamp_type,
      line_start:index + 1,line_end:index + 1,byte_start:byteOffset,
      byte_end:byteOffset + bytes,raw_sha256:digestText(encoded)});
    byteOffset += bytes;
  });
  return {text:text,spans:spans,bytes:byteOffset,sha256:digestText(text)};
}

function latestTurnPath(hamUid, viewerTier) {
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  return evidenceQueryPath({source_prefix:contract.TURN_SOURCE_PREFIX,ham_uid:hamUid,
    stamp_type:contract.TURN_STAMP_TYPE,viewer_tier:viewerTier,
    select:evidenceSelect(true)}, {limit:1});
}

async function readLastAirCycleCandidate(input, options) {
  var value = input || {};
  var opts = options || {};
  var hamUid = exactHam(value.ham_uid);
  if (!hamUid) return lastAirFailure('last_air_cycle_ham_uid_required');
  var reader = typeof opts.read_latest === 'function'
    ? opts.read_latest : function (path) { return bq(path, opts.signal); };
  var read;
  try { read = await reader(latestTurnPath(hamUid, value.viewer_tier)); }
  catch (error) { return lastAirFailure('last_air_cycle_anchor_read_failed'); }
  if (!read || read.ok !== true || read.available !== true) {
    return lastAirFailure(String(read && read.reason || 'last_air_cycle_anchor_unavailable'));
  }
  var rows = Array.isArray(read.rows) ? read.rows
    : Array.isArray(read.beads) ? read.beads : [];
  if (!rows.length) return lastAirSuccessfulEmpty();
  if (rows.length !== 1) return lastAirFailure('last_air_cycle_anchor_ambiguous');
  var anchor = rows[0];
  var content = rowContent(anchor);
  var entrance = content && content.entrance;
  var exit = content && content.exit;
  var cycleId = String(entrance && entrance.cycle_id || '').trim();
  var requestId = String(entrance && entrance.request_id || '').trim();
  var receiptSource = String(entrance && entrance.receipt_source || '').trim();
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  var council = require('./pai.outbound.council.js');
  var sources = cycleId && requestId ? council.councilSources(cycleId, requestId) : null;
  // ⬡B:core.find:FIX:a_low_importance_anchor_was_hard_failing_the_whole_readback:20260825⬡
  // This check used to include `Number(anchor.importance) < contract.READER_IMPORTANCE_FLOOR`,
  // and it did not merely skip a low-importance anchor: it returned last_air_cycle_anchor_invalid
  // for the ENTIRE read. A legacy delivered turn stamped at importance 5 by
  // routes/stream.routes.js, sitting as the newest anchor, therefore broke the last-AIR-cycle
  // readback outright. Every clause left below is a STRUCTURAL fact about whether this row is
  // the turn record it claims to be (right person, right stamp, right source shape, a parseable
  // turn schema, a receipt that matches its own council sources). Importance is not one of
  // those facts, it is a weight a writer chose, so it is carried to the reading mind rather than
  // ruled on here. See core/memory.keeper.js, the retired-floor law.
  if (exactHam(anchor && anchor.ham_uid) !== hamUid || anchor.stamp_type !==
      contract.TURN_STAMP_TYPE || String(anchor.source || '').indexOf(
        contract.TURN_SOURCE_PREFIX + hamUid + '.') !== 0 ||
      !content || content.schema !== 'anew.memory.turn.v1' || !plainObject(entrance) ||
      !plainObject(exit) || !cycleId || !requestId || !receiptSource || !sources ||
      receiptSource !== sources.finalSource || !rowIdentity(anchor)) {
    return lastAirFailure('last_air_cycle_anchor_invalid');
  }
  return {ok:true,available:true,ham_uid:hamUid,cycle_id:cycleId,request_id:requestId,
    receipt_source:receiptSource,anchor:anchor,tools_used:Array.isArray(exit.tools_used)
      ? exit.tools_used.slice() : []};
}

function reconstructCouncilPair(finalRow, stampRow, council) {
  var finalContent = rowContent(finalRow);
  var receipt = finalContent && finalContent.receipt;
  var stampContent = rowContent(stampRow);
  if (!receipt || !stampContent || finalContent.schema !== council.RECEIPT_SCHEMA ||
      finalContent.receipt_digest !== receipt.receipt_digest ||
      finalRow.stamp_type !== 'CYCLE_RECEIPT' || stampRow.stamp_type !== 'PAI_STAGE') {
    return {ok:false,reason:'last_air_cycle_commit_rows_invalid'};
  }
  var sources = council.councilSources(receipt.cycle_id, receipt.request_id);
  if (finalRow.source !== sources.finalSource ||
      stampRow.source !== sources.stageSources[council.STAGE_ORDER.length - 1]) {
    return {ok:false,reason:'last_air_cycle_commit_sources_invalid'};
  }
  var stage = stampContent.stage;
  var endedAt = stage && stage.ended_at;
  if (!endedAt || !Number.isFinite(Date.parse(endedAt))) {
    return {ok:false,reason:'last_air_cycle_stamp_time_invalid'};
  }
  var proofCore = {schema:council.STAMP_PROOF_SCHEMA,ok:true,ham_uid:receipt.ham_uid,
    request_id:receipt.request_id,cycle_id:receipt.cycle_id,
    request_source:receipt.request_source,question_bytes:receipt.question_bytes,
    question_digest:receipt.question_digest,
    deliberation_input_bytes:receipt.deliberation_input_bytes,
    deliberation_input_digest:receipt.deliberation_input_digest,
    answer_digest:receipt.answer_digest,
    identity_provenance_required:receipt.identity_provenance_required,
    identity_evidence_receipt:receipt.identity_evidence_receipt,
    stamp_source:sources.stageSources[council.STAGE_ORDER.length - 1],
    stamp_row_id:stampRow.id,final_source:sources.finalSource,
    final_receipt_row_id:finalRow.id,final_receipt_content_digest:digestObject(finalContent),
    prepared_receipt_digest:receipt.receipt_digest,stage:stage,commit:stampContent.commit,
    stamp_content_digest:digestObject(stampContent),readback_verified:true,
    read_back_at:new Date(Date.parse(endedAt)).toISOString()};
  ['pending_effects_count','pending_effects_digest','delivery_target_bytes',
    'delivery_target_digest'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(receipt, key)) proofCore[key] = receipt[key];
  });
  var proof = Object.assign({}, proofCore, {proof_digest:digestObject(proofCore)});
  var expected = {hamUid:receipt.ham_uid,requestId:receipt.request_id,
    cycleId:receipt.cycle_id,question:receipt.question,
    deliberationInput:receipt.deliberation_input,answer:receipt.answer};
  if (!council.verifyCommittedCouncil(receipt, proof, expected)) {
    return {ok:false,reason:'last_air_cycle_commit_pair_invalid'};
  }
  return {ok:true,council_receipt:receipt,stamp_proof:proof};
}

async function readLastCompletedAirCycle(input, options) {
  var value = input || {};
  var opts = options || {};
  var hamUid = exactHam(value.ham_uid);
  if (!hamUid) return lastAirFailure('last_air_cycle_ham_uid_required');
  var candidate = await readLastAirCycleCandidate(value, opts);
  if (!candidate || candidate.ok !== true) return candidate;
  if (candidate.empty === true) return candidate;
  var anchor = candidate.anchor;
  var exit = rowContent(anchor).exit;
  var council = require('./pai.outbound.council.js');
  var sources = council.councilSources(candidate.cycle_id, candidate.request_id);
  var observed = [];
  var seenRows = Object.create(null);
  function keepObserved(page, allowed) {
    (page || []).forEach(function (row) {
      if (!row || exactHam(row.ham_uid) !== hamUid || !allowed(row)) {
        throw new Error('last_air_cycle_row_scope_mismatch');
      }
      var id = rowIdentity(row);
      if (!id) throw new Error('last_air_cycle_row_identity_missing');
      var digest = digestObject(canonicalObservedRow(row));
      if (seenRows[id] && seenRows[id] !== digest) {
        throw new Error('last_air_cycle_row_identity_collision');
      }
      if (!seenRows[id]) { seenRows[id] = digest; observed.push(row); }
    });
  }
  var walkQuery = typeof opts.walk_query === 'function' ? opts.walk_query
    : function (query, onPage) {
      return walkAllPages(query, evidenceQueryPath,
        function (path) { return bq(path, opts.signal); }, onPage);
    };
  try {
    var cycleRead = await walkQuery({source_prefix:sources.cycleSource,ham_uid:hamUid,
      viewer_tier:value.viewer_tier,select:evidenceSelect(true)}, function (rows) {
      keepObserved(rows, function (row) {
        return exactCycleSource(row.source, sources.cycleSource);
      });
    });
    if (!cycleRead || cycleRead.ok !== true || cycleRead.available !== true) {
      return lastAirFailure(String(cycleRead && cycleRead.reason ||
        'last_air_cycle_rows_unavailable'));
    }
    var requestRead = await walkQuery({source:sources.requestSource,ham_uid:hamUid,
      viewer_tier:value.viewer_tier,select:evidenceSelect(true)}, function (rows) {
      keepObserved(rows, function (row) { return row.source === sources.requestSource; });
    });
    if (!requestRead || requestRead.ok !== true || requestRead.available !== true) {
      return lastAirFailure(String(requestRead && requestRead.reason ||
        'last_air_request_row_unavailable'));
    }
    keepObserved([anchor], function (row) { return row === anchor; });
  } catch (error) {
    return lastAirFailure(String(error && error.message || 'last_air_cycle_rows_rejected'));
  }
  var finalRows = observed.filter(function (row) { return row.source === sources.finalSource; });
  var stampRows = observed.filter(function (row) {
    return row.source === sources.stageSources[council.STAGE_ORDER.length - 1];
  });
  if (finalRows.length !== 1 || stampRows.length !== 1) {
    return lastAirFailure('last_air_cycle_commit_pair_missing');
  }
  var recovered = reconstructCouncilPair(finalRows[0], stampRows[0], council);
  if (!recovered || recovered.ok !== true || recovered.council_receipt.ham_uid !== hamUid ||
      recovered.council_receipt.cycle_id !== candidate.cycle_id ||
      recovered.council_receipt.request_id !== candidate.request_id ||
      recovered.council_receipt.persistence.final_source !== candidate.receipt_source) {
    return lastAirFailure(String(recovered && recovered.reason ||
      'last_air_cycle_commit_pair_invalid'));
  }
  var requiredSources = [sources.requestSource].concat(
    recovered.council_receipt.persistence.stage_sources || [], [sources.finalSource]);
  var sourceCounts = Object.create(null);
  observed.forEach(function (row) {
    sourceCounts[String(row.source)] = (sourceCounts[String(row.source)] || 0) + 1;
  });
  if (requiredSources.some(function (source) { return sourceCounts[source] !== 1; })) {
    return lastAirFailure('last_air_cycle_structural_rows_incomplete');
  }
  observed.sort(compareObservedRows);
  var stream = canonicalSourceStream(observed);
  return deepFreeze({schema:LAST_AIR_CYCLE_SCHEMA,ok:true,available:true,
    mode:LAST_AIR_STREAM_MODE,ham_uid:hamUid,cycle_id:candidate.cycle_id,
    request_id:candidate.request_id,
    anchor:{row_id:anchor.id,source:anchor.source,created_at:anchor.created_at || null,
      receipt_source:candidate.receipt_source},
    council:{final_receipt_row_id:finalRows[0].id,stamp_row_id:stampRows[0].id,
      final_source:candidate.receipt_source,
      receipt_digest:recovered.council_receipt.receipt_digest,
      committed:true,readback_verified:true},
    source_stream_utf8:stream.text,source_stream_sha256:stream.sha256,
    source_stream_bytes:stream.bytes,source_spans:stream.spans,
    observed_row_count:observed.length,
    tools_used:Array.isArray(exit.tools_used) ? exit.tools_used.slice() : [],
    producer_completeness_certified:false,
    producer_completeness_reason:'cycle_step_writes_are_fire_and_forget',
    effect_truth:{find_live_stream_proven:false,supabase_live_microhop_proven:false,
      provider_effect:null,human_effect:null},provider_effect:null,human_effect:null});
}

function splitUtf8(value) {
  var input = String(value || '');
  var chunks = [];
  var current = '';
  var bytes = 0;
  var start = 0;
  for (var index = 0; index < input.length;) {
    var symbol = String.fromCodePoint(input.codePointAt(index));
    var symbolBytes = Buffer.byteLength(symbol, 'utf8');
    if (bytes && bytes + symbolBytes > LAST_AIR_CHUNK_BYTES) {
      chunks.push({utf8:current,byte_start:start,byte_end:start + bytes});
      start += bytes; current = ''; bytes = 0;
    }
    current += symbol; bytes += symbolBytes; index += symbol.length;
  }
  if (bytes || !chunks.length) chunks.push({utf8:current,byte_start:start,byte_end:start + bytes});
  return chunks;
}

function lastAirContextRows(observation) {
  if (!observation || observation.ok !== true || observation.schema !== LAST_AIR_CYCLE_SCHEMA ||
      observation.mode !== LAST_AIR_STREAM_MODE ||
      observation.producer_completeness_certified !== false ||
      !observation.effect_truth || observation.effect_truth.find_live_stream_proven !== false ||
      observation.effect_truth.supabase_live_microhop_proven !== false ||
      !Array.isArray(observation.source_spans) ||
      observation.source_spans.length !== observation.observed_row_count) {
    return {ok:false,reason:'last_air_cycle_context_contract_invalid'};
  }
  var stream = String(observation.source_stream_utf8 || '');
  var streamBytes = Buffer.from(stream, 'utf8');
  if (streamBytes.length !== observation.source_stream_bytes ||
      digestText(stream) !== observation.source_stream_sha256) {
    return {ok:false,reason:'last_air_cycle_context_stream_invalid'};
  }
  var rows = [];
  observation.source_spans.forEach(function (span, lineIndex) {
    var prior = lineIndex ? observation.source_spans[lineIndex - 1] : null;
    if (!span || !Number.isInteger(span.byte_start) || !Number.isInteger(span.byte_end) ||
        span.byte_start < 0 || span.byte_end < span.byte_start ||
        span.byte_end > streamBytes.length || span.line_start !== lineIndex + 1 ||
        span.line_end !== lineIndex + 1 ||
        (prior ? span.byte_start !== prior.byte_end + 1 : span.byte_start !== 0)) {
      throw new Error('last_air_cycle_context_span_invalid');
    }
    var raw = streamBytes.subarray(span.byte_start, span.byte_end).toString('utf8');
    if (digestText(raw) !== span.raw_sha256) {
      throw new Error('last_air_cycle_context_span_digest_invalid');
    }
    var parts = splitUtf8(raw);
    parts.forEach(function (part, partIndex) {
      var payload = {schema:LAST_AIR_CHUNK_SCHEMA,mode:LAST_AIR_STREAM_MODE,
        ham_uid:observation.ham_uid,cycle_id:observation.cycle_id,
        request_id:observation.request_id,
        source_stream_sha256:observation.source_stream_sha256,
        source_stream_bytes:observation.source_stream_bytes,
        line_index:lineIndex + 1,line_count:observation.source_spans.length,
        row_id:span.row_id,row_source:span.source,row_stamp_type:span.stamp_type,
        row_raw_sha256:span.raw_sha256,part_index:partIndex + 1,part_count:parts.length,
        byte_start:span.byte_start + part.byte_start,
        byte_end:span.byte_start + part.byte_end,chunk_sha256:digestText(part.utf8),
        chunk_utf8:part.utf8,producer_completeness_certified:false,
        effect_truth:{find_live_stream_proven:false,supabase_live_microhop_proven:false,
          provider_effect:null,human_effect:null}};
      var suffix = String(lineIndex + 1).padStart(8, '0') + '.' +
        String(partIndex + 1).padStart(6, '0');
      rows.push(deepFreeze({id:'last-air:' + observation.source_stream_sha256 + ':' + suffix,
        ham_uid:observation.ham_uid,agent_global:'FIND',stamp_type:'FIND_READBACK_CHUNK',
        source:'anew.find.last-air-cycle.chunk.' + observation.source_stream_sha256 + '.' + suffix,
        summary:'[LAST AIR OBSERVED FACT CHUNK; durable readback, not live stream; '
          + 'producer completeness uncertified] ' + stableStringify(payload),
        content:stableStringify({schema:LAST_AIR_CHUNK_SCHEMA,
          source_stream_sha256:observation.source_stream_sha256,
          line_index:lineIndex + 1,part_index:partIndex + 1}),
        importance:7,created_at:observation.anchor.created_at || null,superseded_by:null}));
    });
  });
  var manifest = {schema:'anew.find.last-air-cycle-context-manifest.v1',
    mode:LAST_AIR_STREAM_MODE,ham_uid:observation.ham_uid,cycle_id:observation.cycle_id,
    request_id:observation.request_id,source_stream_sha256:observation.source_stream_sha256,
    source_stream_bytes:observation.source_stream_bytes,
    observed_row_count:observation.observed_row_count,
    source_span_count:observation.source_spans.length,context_chunk_count:rows.length,
    producer_completeness_certified:false,
    producer_completeness_reason:observation.producer_completeness_reason,
    effect_truth:observation.effect_truth,provider_effect:null,human_effect:null};
  rows.unshift(deepFreeze({id:'last-air:' + observation.source_stream_sha256 + ':manifest',
    ham_uid:observation.ham_uid,agent_global:'FIND',stamp_type:'FIND_READBACK_MANIFEST',
    source:'anew.find.last-air-cycle.manifest.' + observation.source_stream_sha256,
    summary:'[LAST COMPLETED AIR CYCLE FACTUAL READBACK MANIFEST] ' +
      stableStringify(manifest),content:stableStringify(manifest),importance:7,
    created_at:observation.anchor.created_at || null,superseded_by:null}));
  return {ok:true,rows:rows,manifest:deepFreeze(manifest)};
}

async function streamLastAirProjection(projection, sink) {
  var rows = projection && Array.isArray(projection.rows) ? projection.rows : [];
  if (typeof sink !== 'function') {
    return deepFreeze({ok:false,available:false,
      reason:'last_air_cycle_progressive_sink_unseated',facts_total:rows.length,
      facts_accepted:0,facts_failed:0,failures:[],provider_effect:null,human_effect:null});
  }
  var accepted = 0;
  var failures = [];
  var chain = digestText('');
  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    var rowDigest = digestObject(row);
    var fact = deepFreeze({schema:LAST_AIR_PROGRESSIVE_FACT_SCHEMA,
      fact_ordinal:index,fact_count:rows.length,row_sha256:rowDigest,row:row,
      provider_effect:null,human_effect:null});
    try {
      await sink(fact);
      accepted += 1;
      chain = digestObject({prior_sha256:chain,fact_ordinal:index,row_sha256:rowDigest});
    } catch (error) {
      failures.push({fact_ordinal:index,reason:'last_air_cycle_progressive_sink_rejected'});
    }
  }
  return deepFreeze({ok:failures.length === 0,available:true,
    reason:failures.length ? 'last_air_cycle_progressive_sink_partial' : null,
    facts_total:rows.length,facts_accepted:accepted,facts_failed:failures.length,
    accepted_chain_sha256:chain,failures:failures,provider_effect:null,human_effect:null});
}

// ⬡B:core.find:GUARD:identity_read_availability_is_explicit:20260715⬡
// Generic FIND intentionally fails soft for ordinary context. Identity provenance
// cannot: an unavailable bank is not evidence of an empty bank. This strict lane
// reports configuration, timeout, HTTP, payload, and transport failures explicitly.
function identityBq(path, timeoutMs) {
  var b = bh();
  if (!b.url || !b.hdrs.apikey) return Promise.resolve({
    ok:false, available:false, reason:'identity_brain_unconfigured', rows:[]
  });
  var wait = Number(timeoutMs);
  return new Promise(function(resolve) {
    var settled = false;
    var timer = null;
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    }
    if (Number.isFinite(wait) && wait > 0) {
      timer = setTimeout(function() {
        finish({ ok:false, available:false, reason:'identity_brain_timeout', rows:[] });
      }, wait);
    }
    Promise.resolve().then(function() {
      return fetch(b.url + '/rest/v1/' + _tbl() + '?' + path, { headers:b.hdrs });
    }).then(function(response) {
      if (!response || response.ok !== true) {
        finish({ ok:false, available:false, reason:'identity_brain_http_error',
          status:response && response.status || null, rows:[] });
        return null;
      }
      return Promise.resolve(response.json()).then(function(rows) {
        if (!Array.isArray(rows)) {
          finish({ ok:false, available:false, reason:'identity_brain_payload_invalid', rows:[] });
          return;
        }
        finish({ ok:true, available:true, rows:rows });
      });
    }).catch(function(error) {
      finish({ ok:false, available:false, reason:'identity_brain_error',
        error:String(error && error.message || error || 'unknown').slice(0, 160), rows:[] });
    });
  });
}

function identityQueryPath(query, page) {
  var q = query || {};
  var parts = [];
  activeTruthPredicate(parts,q);
  if (q.stamp_type) parts.push('stamp_type=eq.' + encodeURIComponent(q.stamp_type));
  if (q.source) parts.push('source=eq.' + encodeURIComponent(q.source));
  else if (q.source_prefix) parts.push('source=like.' + encodeURIComponent(q.source_prefix) + '*');
  if (q.ham_uid) parts.push('ham_uid=eq.' + encodeURIComponent(q.ham_uid));
  if (q.agent_global) parts.push('agent_global=eq.' + encodeURIComponent(q.agent_global));
  if (q.importance_gte != null) parts.push('importance=gte.' + q.importance_gte);
  if (q.viewer_tier != null) {
    var tierFilter = require('./privacy/people.tier.js').structuralFilter(q.viewer_tier);
    if (tierFilter) parts.push(tierFilter);
  }
  parts.push('order=' + (q.order === 'asc' ? 'source.asc' : 'created_at.desc'));
  var requested = page && page.limit != null ? page.limit : (q.limit || 10);
  parts.push('limit=' + requested);
  if (page && page.offset) parts.push('offset=' + page.offset);
  return parts.join('&');
}

function identityRead(query) {
  var read = query && query.exhaustive === true
    ? readAllPages(query, identityQueryPath, identityBq)
    : identityBq(identityQueryPath(query));
  return Promise.resolve(read).then(function (result) {
    if (!result || !Array.isArray(result.rows) || query && query.include_superseded === true) {
      return result;
    }
    result.rows = result.rows.filter(function (row) { return row && row.superseded_by == null; });
    return result;
  });
}

function scopedQuery(query, viewerTier) {
  var copy = Object.assign({}, query || {});
  // Named memory helpers are security boundaries, including when an older/direct caller
  // has not yet resolved a tier. An omitted value therefore means T4, never "leave the
  // predicate out". Founder callers must prove T0 before entering the helper.
  copy.viewer_tier = require('./privacy/people.tier.js').effectiveTier(viewerTier);
  return copy;
}

function scopedQueries(queries, viewerTier) {
  return (Array.isArray(queries) ? queries : [queries]).map(function (query) {
    return scopedQuery(query, viewerTier);
  });
}

// FIND entry point — run multiple queries in parallel, merge, dedupe by id
// queries: array of { stamp_type?, source?, source_prefix?, ham_uid?, importance_gte?,
//   limit?, exhaustive? }. `limit` preserves explicit newest-singleton and tool contracts;
//   `exhaustive` walks every provider page and ignores a caller-supplied result ceiling.
async function find(queries, options) {
  if (!Array.isArray(queries)) queries = [queries];
  var t0 = Date.now();
  var opts = options || {};

  function queryPath(q, page) {
    var parts = [];
    activeTruthPredicate(parts,q);
    if (q.stamp_type) parts.push('stamp_type=eq.' + encodeURIComponent(q.stamp_type));
    // Exact doctrine/provenance readers must not let a prefix-colliding child row impersonate
    // the source they requested. `source` and `source_prefix` are intentionally exclusive.
    if (q.source) parts.push('source=eq.' + encodeURIComponent(q.source));
    else if (q.source_prefix) parts.push('source=like.' + encodeURIComponent(q.source_prefix) + '*');
    // \u2b21B:core.find:WIRE:source_not_prefix_keeps_two_lanes_from_crowding_each_other:20260726\u2b21
    // Added with the memory keeper (core/memory.keeper.js). Every committed turn now writes a
    // RESULT bead in the conversation lane (source prefix pai.minutes.), which is what finally
    // makes findContext live on text and voice. Without this clause that conversation would
    // also swamp findRecentResults, whose whole job is the OTHER lane: what her advisers and
    // agents produced. Same equality-class performance as the rest of this builder, no
    // wildcard scan beyond the anchored prefix the positive form already uses.
    if (q.source_not_prefix) parts.push('source=not.like.' + encodeURIComponent(q.source_not_prefix) + '*');
    if (q.ham_uid) parts.push('ham_uid=eq.' + encodeURIComponent(q.ham_uid));
    // \u2b21B:core.find:FIX:agent_global_exact_match_topic_search:20260711\u2b21
    // FOUNDER, most important question of all time: 'whenever I talk to her I never
    // get the amazing results you seem to get -- why?' Traced it live: find_in_brain
    // has NO way to search by topic/org (mediators, bdif, gmg...), only six rigid
    // stamp_type buckets, none of which fit an ordinary 'how's X going' question.
    // Real content existed; the tool structurally could not find it. This is the
    // fix: agent_global is an EXACT known set of values (MEDIATORS_ADVISOR,
    // BDIF_ADVISOR, ELI...) -- an equality filter, same performance class as
    // stamp_type=eq., NOT an ilike scan. The no-wildcards law is honored.
    if (q.agent_global) parts.push('agent_global=eq.' + encodeURIComponent(q.agent_global));
    if (q.importance_gte != null) parts.push('importance=gte.' + q.importance_gte);
    // ⬡B:core.find:GUARD:a_world_reads_beneath_its_own_tier_and_the_database_enforces_it:20260726⬡
    // PER-WORLD FILTERING, STRUCTURAL. The founder's inverted people ladder (T0 founder,
    // T1 highest circle, T2 ENVOLVE only, each tier inheriting everything beneath it) is
    // enforced HERE, in the predicate PostgREST sends to the database, and not by trimming
    // a string somewhere downstream. The difference is the whole point: content above the
    // reader's tier is never SELECTED, so it never travels the wire, never lands in a
    // variable, never reaches a log line, and cannot be leaked by the next person who
    // forgets to call the filter.
    //
    // A bead with no privacy envelope yields NULL for content->privacy->>tier, and NULL
    // >= '1' is NULL in SQL, so PostgREST drops the row. Unclassified legacy memory is
    // therefore INVISIBLE to every non-T0 reader by construction: fail closed at the
    // storage layer. Verified live against the bank.
    //
    // Generic find() keeps viewer_tier explicit because some internal catalogs are not
    // person-facing reads. Every world-facing owner resolves and passes it; all named memory
    // helpers above fail closed to T4 when an older direct caller omits it. T0 passes no filter
    // because the founder holds everything, including every bead written before the mark existed.
    // See core/privacy/people.tier.js for the ladder itself.
    if (q.viewer_tier != null) {
      var _tierFilter = require('./privacy/people.tier.js').structuralFilter(q.viewer_tier);
      if (_tierFilter) parts.push(_tierFilter);
    }
    // ⬡B:core.find:WIRE:select_columns_so_catalogs_dont_pull_whole_libraries:20260721⬡
    // The KEEPER's catalog pass needs source+summary for ~100 canon beads whose
    // content runs to hundreds of KB each; without column selection that catalog
    // read pulls the whole library over the wire to use one line per book. Callers
    // that pass q.select get only those columns; every existing caller is untouched.
    // ⬡B:core.find:FIX:select_must_carry_id_or_dedup_collapses_to_one:20260721⬡
    // find() dedupes the merged result by row.id (below). A caller-supplied select
    // that omits id makes every row's id undefined, so seen[undefined] keeps only
    // the FIRST row and silently discards the rest — the Keeper's live catalog came
    // back as 1 of 76 this way. Always carry id when a select is present.
    if (q.select) {
      var _sel = String(q.select);
      if (!/(^|,)\s*id\s*(,|$)/.test(_sel)) _sel = 'id,' + _sel;
      _sel=compatibleSelect(_sel,true);
      parts.push('select=' + encodeURIComponent(_sel));
    }
    // ⬡B:core.find:FIX:order_parameter:20260702⬡
    // Live incident: asked for the OPENING line of a multi-part journal document,
    // every retrieval returned a middle-or-later chunk because created_at.desc was
    // the only order this function could ever produce -- there was no way to ask
    // for the earliest match, so "the beginning of anything" was structurally
    // unreachable. Source names are lexicographically ordered within a document
    // (part01, part02...), so source.asc genuinely means "from the start."
    // Generic capability, not a one-off patch: any caller, any HAM, any document.
    parts.push('order=' + (q.order === 'asc' ? 'source.asc' : 'created_at.desc'));
    var requested = page && page.limit != null ? page.limit : q.limit;
    if (requested == null) requested = PROVIDER_PAGE_SIZE;
    parts.push('limit=' + requested);
    if (page && page.offset) parts.push('offset=' + page.offset);
    return parts.join('&');
  }

  var promises = queries.map(function(q) {
    var readPage = function(path){return bq(path,opts.signal);};
    return q && (q.exhaustive === true || q.limit == null)
      ? readAllPages(q, queryPath, readPage)
      : readPage(queryPath(q));
  });

  var results = await Promise.all(promises);

  // Merge + dedupe by id
  var seen = {};
  var merged = [];
  results.forEach(function(result, index) {
    ((result && result.rows) || []).filter(function (row) {
      return queries[index] && queries[index].include_superseded === true
        ? true : row && row.superseded_by == null;
    }).forEach(function(row) {
      if (!seen[row.id]) {
        seen[row.id] = true;
        merged.push(row);
      }
    });
  });
  var failures = results.map(function(result, index) {
    if (result && result.available === true && result.ok === true) return null;
    return { query_index:index, reason:String(result && result.reason || 'brain_read_unavailable'),
      status:result && result.status != null ? result.status : null };
  }).filter(Boolean);
  var queriesAvailable = results.length - failures.length;
  var available = results.length === 0 || queriesAvailable > 0;
  var activeTruthRequested=queries.some(function(query){
    return !query||query.include_superseded!==true;
  });

  return { ok:available, available:available, partial:available && failures.length > 0,
    active_truth_enforced:!activeTruthRequested||supportsActiveTruth(),
    reason:available ? null : String(failures[0] && failures[0].reason || 'brain_read_unavailable'),
    beads:merged, ms:Date.now() - t0, count:merged.length,
    queriesTotal:results.length, queriesAvailable:queriesAvailable, failures:failures };
}

var EVIDENCE_BASE_SELECT = 'id,ham_uid,stamp_type,source,summary,agent_global,importance,created_at';
// Full FCW expansion needs the human-authored body, never the vector used to locate it.
// Keeping `embedding` off this transport prevents a selected evidence batch from rebuilding
// the same heap pressure Agent FIND exists to remove.
function evidenceSelect(includeBody){
  return compatibleSelect(EVIDENCE_BASE_SELECT+(includeBody?',content':''),true);
}

function evidenceQueryPath(query, page) {
  var q = query || {};
  var parts = [];
  activeTruthPredicate(parts,q);
  if (q.ids && q.ids.length) {
    var ids = q.ids.map(function (id) { return String(id).replace(/[^A-Za-z0-9_-]/g, ''); })
      .filter(Boolean);
    parts.push('id=in.(' + ids.map(encodeURIComponent).join(',') + ')');
  }
  if (q.stamp_type) parts.push('stamp_type=eq.' + encodeURIComponent(q.stamp_type));
  if (q.source) parts.push('source=eq.' + encodeURIComponent(q.source));
  else if (q.source_prefix) parts.push('source=like.' + encodeURIComponent(q.source_prefix) + '*');
  if (q.source_not_prefix) {
    parts.push('source=not.like.' + encodeURIComponent(q.source_not_prefix) + '*');
  }
  if (q.ham_uid) parts.push('ham_uid=eq.' + encodeURIComponent(q.ham_uid));
  if (q.agent_global) parts.push('agent_global=eq.' + encodeURIComponent(q.agent_global));
  if (q.importance_gte != null) parts.push('importance=gte.' + q.importance_gte);
  if (Array.isArray(q.summary_terms) && q.summary_terms.length) {
    var terms = q.summary_terms.map(function (term) {
      return String(term || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    }).filter(Boolean);
    if (terms.length) parts.push('or=(' + terms.map(function (term) {
      // memory_bank.beads.find_summary_trgm_idx owns this wildcard predicate. It is the
      // indexed question hop, not an unindexed whole-table ilike scan.
      return 'summary.ilike.*' + encodeURIComponent(term) + '*';
    }).join(',') + ')');
  }
  if (q.viewer_tier != null) {
    var tierFilter = require('./privacy/people.tier.js').structuralFilter(q.viewer_tier);
    if (tierFilter) parts.push(tierFilter);
  }
  if (page && page.cursor) {
    var c = page.cursor;
    var created = encodeURIComponent(String(c.created_at));
    var id = encodeURIComponent(String(c.id));
    parts.push('or=(created_at.lt.' + created + ',and(created_at.eq.' + created + ',id.lt.' + id + '))');
  }
  if (q.select) parts.push('select=' + encodeURIComponent(compatibleSelect(q.select,true)));
  parts.push('order=created_at.desc,id.desc');
  parts.push('limit=' + (page && page.limit != null ? page.limit
    : (q.limit != null ? q.limit : PROVIDER_PAGE_SIZE)));
  return parts.join('&');
}

function fcwEvidenceQueries(input) {
  var value = input || {};
  var hamUid = String(value.ham_uid || '').toUpperCase();
  var viewerTier = value.viewer_tier;
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  // Every distinct question term remains visible to the indexed hop. A provider that cannot
  // carry the resulting request must return an explicit unavailable receipt through bq; silently
  // dropping later terms would make an incomplete question look fully searched.
  var terms = Array.isArray(value.question_terms) ? value.question_terms : [];
  function q(contributor, query, anchor) {
    return Object.assign({contributor:contributor,viewer_tier:viewerTier,
      select:evidenceSelect(false),summary_terms:anchor ? [] : terms,
      anchor:anchor === true,limit:anchor ? 1 : PROVIDER_PAGE_SIZE}, query || {});
  }
  var queries = [
    q('identity',{stamp_type:'DIRECTIVE',ham_uid:hamUid}),
    q('identity',{stamp_type:'HAM_IDENTIFIER',ham_uid:hamUid},true),
    q('agentJDs',{stamp_type:'AGENT_JD'}),
    q('agentJDs',{source_prefix:'agent.jd'}),
    q('agentJDs',{stamp_type:'SCW',ham_uid:hamUid}),
    q('agentJDs',{stamp_type:'AGENT_JD'},true),
    q('context',{source_prefix:contract.TURN_SOURCE_PREFIX,ham_uid:hamUid,
      stamp_type:contract.TURN_STAMP_TYPE}),
    q('context',{stamp_type:contract.TURN_STAMP_TYPE,ham_uid:hamUid}),
    // The unqualified source-prefix anchor forced PostgREST to walk the entire turn namespace
    // before it could return one row. On the live bank that read can time out, which leaves a
    // successfully saved text turn outside the next FCW. Turn records carry one exact stamp, so
    // the stamp_type predicate stays on the anchor: it is a selectivity fact about the lane, not
    // a ruling on which rows are worth seeing. The importance predicate that used to ride here
    // came off 20260825 (see core/memory.keeper.js, the retired-floor law).
    q('context',{source_prefix:contract.TURN_SOURCE_PREFIX,ham_uid:hamUid,
      stamp_type:contract.TURN_STAMP_TYPE},true),
    q('recent',{stamp_type:'RESULT',ham_uid:hamUid,
      source_not_prefix:contract.TURN_SOURCE_PREFIX}),
    q('recent',{stamp_type:'RESULT',ham_uid:hamUid,
      source_not_prefix:contract.TURN_SOURCE_PREFIX},true),
    q('doctrine',{stamp_type:'ROADMAP',ham_uid:hamUid}),
    q('doctrine',{stamp_type:'DOCTRINE',ham_uid:hamUid,importance_gte:doctrineWallFloor()}),
    q('doctrine',{stamp_type:'DOCTRINE',ham_uid:hamUid,importance_gte:doctrineWallFloor()},true),
    q('profile',{source_prefix:'scw.person_profile.' + hamUid,ham_uid:hamUid},true),
    q('statedPlans',{source_prefix:contract.GIFT_SOURCE_PREFIX,ham_uid:hamUid}),
    q('statedPlans',{stamp_type:contract.GIFT_STAMP_TYPE,ham_uid:hamUid}),
    q('statedPlans',{source_prefix:contract.GIFT_SOURCE_PREFIX,ham_uid:hamUid},true)
  ];
  (Array.isArray(value.named_agents) ? value.named_agents : []).forEach(function (name) {
    if (/^[A-Z][A-Z0-9_]{2,31}$/.test(name)) {
      queries.push(q('namedAgentRecords',{agent_global:name,ham_uid:hamUid},true));
    }
  });
  if (value.include_preferences) queries.push(q('preferences',{
    stamp_type:'PREFERENCE',ham_uid:hamUid},true));
  if (value.include_wonder_games) {
    queries.push(q('wonderGames',{stamp_type:'WONDER_GAMES',ham_uid:hamUid},true));
    queries.push(q('wonderGames',{source_prefix:'wonder_games.',ham_uid:hamUid}));
    queries.push(q('wonderGames',{stamp_type:'DOCTRINE',ham_uid:hamUid,importance_gte:doctrineWallFloor()}));
  }
  return queries.filter(function (query) { return query.anchor || terms.length > 0; });
}

// Ordinary Agent FIND uses the live HAM/stamp/source and summary gin_trgm indexes to retrieve
// one compact question-bound page per lane. A full page is not called complete: it carries a
// stable continuation cursor for the explicit full-history walker below.
async function scanFcwEvidence(input, options) {
  var opts = options || {};
  if (typeof opts.onPage !== 'function') {
    return {ok:false,available:false,reason:'agent_find_page_consumer_required'};
  }
  var queries = fcwEvidenceQueries(input);
  var totalRows = 0;
  var totalPages = 0;
  var failures = [];
  var continuations = [];
  var candidateReader = typeof opts.read_last_air_candidate === 'function'
    ? opts.read_last_air_candidate : readLastAirCycleCandidate;
  var lastAirCandidate;
  try {
    lastAirCandidate = await candidateReader(input, {signal:opts.signal,
      read_latest:opts.read_latest});
  } catch (candidateError) {
    lastAirCandidate = lastAirFailure('last_air_cycle_candidate_read_failed');
  }
  if (lastAirCandidate && lastAirCandidate.ok === true && lastAirCandidate.anchor) {
    var compactAnchor = Object.assign({}, lastAirCandidate.anchor, {
      summary:'[LAST COMPLETED AIR CYCLE CANDIDATE] exact durable turn anchor; '
        + 'receipt and observed source rows verify during same-wake expansion'});
    totalRows += 1;
    totalPages += 1;
    await opts.onPage([compactAnchor], {contributor:'context',query_index:-1,page:0,
      cursor:null,last_air_cycle_candidate:true});
  } else if (!(lastAirCandidate && lastAirCandidate.ok === true &&
      lastAirCandidate.empty === true)) {
    failures.push({contributor:'context',query_index:-1,optional_effect:'last_air_cycle',
      reason:String(lastAirCandidate && lastAirCandidate.reason ||
        'last_air_cycle_candidate_unavailable')});
  }
  for (var index = 0; index < queries.length; index += 1) {
    var query = queries[index];
    var compactReader = typeof opts.read_compact === 'function'
      ? opts.read_compact : function (path) { return bq(path, opts.signal); };
    var result = await compactReader(evidenceQueryPath(query, {limit:query.limit}));
    if (!result || result.ok !== true || result.available !== true) {
      failures.push({contributor:query.contributor,query_index:index,
        reason:String(result && result.reason || 'brain_read_unavailable')});
    } else {
      var rows = (Array.isArray(result.rows) ? result.rows : []).filter(function (row) {
        return query.include_superseded === true ? true : row && row.superseded_by == null;
      });
      totalRows += rows.length;
      totalPages += 1;
      await opts.onPage(rows, {contributor:query.contributor,query_index:index,page:0,
        cursor:null});
      if (!query.anchor && rows.length === query.limit && rows.length) {
        var last = rows[rows.length - 1];
        continuations.push({contributor:query.contributor,query_index:index,
          cursor:{created_at:last.created_at,id:last.id}});
      }
    }
  }
  var ordinaryFailures=failures.filter(function(failure){return failure.query_index>=0;});
  var available=ordinaryFailures.length < queries.length;
  var unavailableReason=null;
  if(!available){
    unavailableReason=ordinaryFailures.length&&ordinaryFailures.every(function(failure){
      return failure.reason==='brain_unconfigured';
    })?'memory_bank_unavailable':'agent_find_compact_scan_unavailable';
  }
  var activeTruthEnforced=supportsActiveTruth();
  return {ok:available,available:available,reason:unavailableReason,
    partial:failures.length > 0 || continuations.length > 0 || !activeTruthEnforced,
    active_truth_enforced:activeTruthEnforced,
    storage_limitations:activeTruthEnforced?[]:['legacy_supersession_unavailable'],failures:failures,
    continuations:continuations,queries_total:queries.length + 1,pages:totalPages,
    rows_seen:totalRows,last_air_cycle_state:lastAirCandidate};
}

async function walkFcwEvidence(input, options) {
  var opts = options || {};
  if (typeof opts.onPage !== 'function') {
    return {ok:false,available:false,reason:'agent_find_page_consumer_required'};
  }
  var queries = fcwEvidenceQueries(input).filter(function (query) { return !query.anchor; });
  var receipts = [];
  for (var index = 0; index < queries.length; index += 1) {
    var query = queries[index];
    var result = await walkAllPages(query, evidenceQueryPath,
      function (path) { return bq(path, opts.signal); },
      function (rows, page) {
        var activeRows = (rows || []).filter(function (row) {
          return query.include_superseded === true ? true : row && row.superseded_by == null;
        });
        return opts.onPage(activeRows, {contributor:query.contributor,query_index:index,
          page:page.page,cursor:page.cursor});
      });
    receipts.push({contributor:query.contributor,query_index:index,result:result});
    if (!result || result.ok !== true) return {ok:false,available:false,receipts:receipts,
      reason:String(result && result.reason || 'agent_find_expansion_failed')};
  }
  return {ok:true,available:true,receipts:receipts};
}

// Expand only the IDs Agent FIND selected. The byte envelope is explicit in the receipt and
// bounds the one FCW being assembled, while scanFcwEvidence remains capable of traversing the
// entire history. Batches bound transport memory only; they do not truncate the selected set.
async function expandFcwEvidence(selections, viewerTier, options) {
  var opts = options || {};
  var selected = Array.isArray(selections) ? selections : [];
  var maxBytes = Number(opts.max_bytes);
  if (!Number.isFinite(maxBytes) || maxBytes < 16384) {
    return {ok:false,available:false,reason:'agent_find_context_budget_required',rows:[],
      by_contributor:{}};
  }
  var byId = Object.create(null);
  selected.forEach(function (entry) { byId[String(entry.id)] = entry; });
  var ids = Object.keys(byId);
  var rows = [];
  var omitted = [];
  var retainedBytes = 0;
  var candidateSelections = selected.filter(function (entry) {
    return entry && Array.isArray(entry.contributors) &&
      entry.contributors.indexOf('context') >= 0 && Array.isArray(entry.reasons) &&
      entry.reasons.indexOf('contributor_anchor') >= 0 &&
      String(entry.source || '').indexOf('pai.minutes.') === 0;
  });
  var lastAirCycle = null;
  var lastAirProjection = null;
  var lastAirSinkReceipt = null;
  if (candidateSelections.length === 1) {
    var candidateSelection = candidateSelections[0];
    var candidateHamUid = exactHam(candidateSelection.ham_uid);
    var fullReader = typeof opts.read_last_air_cycle === 'function'
      ? opts.read_last_air_cycle : readLastCompletedAirCycle;
    try {
      lastAirCycle = candidateHamUid
        ? await fullReader({ham_uid:candidateHamUid,viewer_tier:viewerTier},
          {signal:opts.signal,read_latest:opts.read_latest,walk_query:opts.walk_query})
        : lastAirFailure('last_air_cycle_ham_uid_required');
    } catch (lastAirError) {
      lastAirCycle = lastAirFailure('last_air_cycle_expansion_failed');
    }
    if (lastAirCycle && lastAirCycle.ok === true &&
        exactHam(lastAirCycle.ham_uid) === candidateHamUid &&
        String(lastAirCycle.anchor.row_id) === String(candidateSelection.id) &&
        lastAirCycle.anchor.source === candidateSelection.source) {
      try { lastAirProjection = lastAirContextRows(lastAirCycle); }
      catch (projectionError) {
        lastAirCycle = lastAirFailure(String(projectionError && projectionError.message ||
          'last_air_cycle_context_projection_failed'));
      }
    } else if (lastAirCycle && lastAirCycle.ok === true) {
      lastAirCycle = lastAirFailure('last_air_cycle_anchor_changed_during_expansion');
    }
  }
  var factualBytes = 0;
  if (lastAirProjection && lastAirProjection.ok === true) {
    lastAirSinkReceipt = await streamLastAirProjection(lastAirProjection,
      opts.last_air_fact_sink);
    lastAirProjection.rows.forEach(function (row) {
      var bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
      factualBytes += bytes;
      var reasons = [row.stamp_type === 'FIND_READBACK_MANIFEST'
        ? 'last_air_cycle_exact_manifest' : 'last_air_cycle_exact_chunk'];
      if (retainedBytes + bytes > maxBytes) {
        omitted.push({id:row.id,contributors:['context'],reasons:reasons,
          reason:'last_air_cycle_fcw_byte_envelope_reached',bytes:bytes});
        return;
      }
      retainedBytes += bytes;
      rows.push({row:row,contributors:['context'],reasons:reasons,bytes:bytes});
    });
  }
  for (var offset = 0; offset < ids.length; offset += 50) {
    var batch = ids.slice(offset, offset + 50);
    var evidenceReader = typeof opts.read_evidence === 'function'
      ? opts.read_evidence : function (path) { return bq(path, opts.signal); };
    var read = await evidenceReader(evidenceQueryPath({ids:batch,viewer_tier:viewerTier,
      select:evidenceSelect(true)}, {limit:batch.length}));
    if (!read || read.ok !== true || read.available !== true) {
      return {ok:false,available:false,reason:String(read && read.reason ||
        'agent_find_evidence_expansion_failed'),rows:[],by_contributor:{}};
    }
    (read.rows || []).filter(function (row) { return row && row.superseded_by == null; })
      .forEach(function (row) {
      var entry = byId[String(row.id)];
      if (!entry) return;
      if (lastAirProjection && lastAirProjection.ok === true &&
          String(lastAirCycle.anchor.row_id) === String(row.id) &&
          lastAirCycle.anchor.source === row.source) return;
      var bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
      if (retainedBytes + bytes > maxBytes) {
        omitted.push({id:row.id,contributors:entry.contributors,
          reason:'fcw_byte_envelope_reached',bytes:bytes});
        return;
      }
      retainedBytes += bytes;
      rows.push({row:row,contributors:entry.contributors,reasons:entry.reasons,
        bytes:bytes});
    });
  }
  var byContributor = Object.create(null);
  rows.forEach(function (entry) {
    entry.contributors.forEach(function (name) {
      if (!byContributor[name]) byContributor[name] = [];
      byContributor[name].push(entry.row);
    });
  });
  var activeTruthEnforced=supportsActiveTruth();
  return {ok:true,available:true,rows:rows,by_contributor:byContributor,
    active_truth_enforced:activeTruthEnforced,
    storage_limitations:activeTruthEnforced?[]:['legacy_supersession_unavailable'],
    retained_bytes:retainedBytes,max_bytes:maxBytes,envelope_reached:omitted.length > 0,
    omitted:omitted,last_air_cycle:lastAirProjection && lastAirProjection.ok === true
      ? lastAirProjection.manifest : lastAirCycle,
    last_air_cycle_progressive:!!(lastAirProjection && lastAirProjection.ok === true &&
      lastAirSinkReceipt && lastAirSinkReceipt.ok === true),
    last_air_cycle_sink:lastAirSinkReceipt,
    last_air_cycle_factual_bytes:factualBytes,
    last_air_cycle_chunk_count:lastAirProjection && lastAirProjection.ok === true
      ? lastAirProjection.manifest.context_chunk_count : 0};
}

// Named FIND patterns used by the Memory Bank builder
function callerWindow(query, limit) {
  var copy = Object.assign({}, query || {});
  var requested = Number(limit);
  if (limit != null && Number.isFinite(requested) && requested > 0) copy.limit = requested;
  else copy.exhaustive = true;
  return copy;
}

// Identity: who is this HAM, their context and trust
async function findIdentity(hamUid, viewerTier) {
  return find(scopedQueries([
    { stamp_type: 'DIRECTIVE', ham_uid: hamUid, exhaustive:true },
    { stamp_type: 'HAM_IDENTIFIER', ham_uid: hamUid, exhaustive:true }
  ], viewerTier));
}

// Agent JDs: all agent definitions available to this HAM.
async function findAgentJDs(hamUid, viewerTier) {
  // ⬡B:core.find:FIX:new_world_agent_jds_from_ham_scw:20260715⬡
  // Live New World Bank proof: AGENT_JD and agent.jd are empty there, while the
  // same HAM's real adviser births live as SCW rows (scw.<world>.<hamUid>).
  // Keep the historical definitions when present, and read the already-wired,
  // per-HAM station records in the same parallel FIND. This is a schema bridge,
  // not a static roster: the HAM owns which worlds appear. Non-station SCWs such
  // as person profiles and feature inventories are excluded because they do not
  // declare content.world. Repeated snapshots of one world collapse to the newest.
  var queries = [
    { stamp_type: 'AGENT_JD', exhaustive:true },
    { source_prefix: 'agent.jd', exhaustive:true }
  ];
  if (hamUid) queries.push({ stamp_type: 'SCW', ham_uid: hamUid, exhaustive:true });
  var result = await find(scopedQueries(queries, viewerTier));
  var seenWorld = {};
  result.beads = (result.beads || []).filter(function (bead) {
    if (bead && (bead.stamp_type === 'AGENT_JD' || String(bead.source || '').indexOf('agent.jd') === 0)) return true;
    if (!bead || bead.stamp_type !== 'SCW' || String(bead.source || '').indexOf('scw.') !== 0) return false;
    var content = bead.content;
    try { if (typeof content === 'string') content = JSON.parse(content); } catch (e) { return false; }
    var world = content && String(content.world || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!world || seenWorld[world]) return false;
    seenWorld[world] = true;
    return true;
  });
  result.count = result.beads.length;
  return result;
}

// Exact newest record for every valid agent name explicitly present in the current ask.
async function findNamedAgentRecords(hamUid, agentGlobals, viewerTier) {
  // ⬡B:core.find:WIRE:question_named_agents_exact_ham_read:20260715⬡
  // The model cannot reliably invent the right tool arguments for a name it has
  // never seen. The builder supplies only literal uppercase tokens from this turn;
  // this finder keeps the read deterministic: exact agent_global, exact HAM, one
  // newest row per name. No alias map or roster lives here.
  // ⬡B:core.find:FIX:fanout_bound_is_a_resource_guard_not_a_cognition_cap_20260802⬡
  // LIVE 911 20260802 (see readAllPages above, same PR #1609): each entry here becomes
  // its own concurrent outbound brain request. Bounding how many names one turn can fan
  // out to is a process resource guard (outstanding-connection ceiling), not a
  // founder-facing name-count ceiling; a real question naming more than this many exact
  // agents in one turn is not a real-world shape this needs to serve today.
  var MAX_NAMED_AGENT_FANOUT = 64;
  var seen = {};
  var names = (Array.isArray(agentGlobals) ? agentGlobals : []).map(function (name) {
    return String(name || '').trim();
  }).filter(function (name) {
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(name) || seen[name]) return false;
    seen[name] = true;
    return true;
  }).slice(0, MAX_NAMED_AGENT_FANOUT);
  if (!hamUid || !names.length) return { beads: [], ms: 0, count: 0 };
  return find(scopedQueries(names.map(function (name) {
    return { agent_global: name, ham_uid: hamUid, limit: 1 };
  }), viewerTier));
}

// ⬡B:core.find:WONDER:bounded_identity_provenance_read:20260715⬡
// A who-is turn needs more than the newest operational row for an uppercase
// agent. Read bounded exact-HAM definition classes plus recent role-bearing
// memory, then classify only exact question subjects. Mixed-case names travel
// through the same path. No roster, alias map, fuzzy scan, or answer lives here.
async function findIdentityEvidence(hamUid, question, viewerTier) {
  var started = Date.now();
  var exactHam = String(hamUid || '').toUpperCase();
  var subjects = identityProvenance.extractIdentitySubjects(question);
  if (!exactHam || !subjects.length) return {
    schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
    ok:true, available:true, ham_uid:exactHam || null, subjects:subjects, records:[],
    count:0, ms:Date.now() - started
  };
  var queries = subjects.filter(function (subject) {
    return /^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(subject);
  }).map(function (subject) {
    return { agent_global:subject.toUpperCase(), ham_uid:exactHam, exhaustive:true };
  });
  queries = scopedQueries(queries.concat([
    { stamp_type:'HAM_IDENTIFIER', ham_uid:exactHam, exhaustive:true },
    { source_prefix:'scw.person_profile.' + exactHam, ham_uid:exactHam, exhaustive:true },
    { stamp_type:'AGENT_JD', ham_uid:exactHam, exhaustive:true },
    { stamp_type:'SCW', ham_uid:exactHam, exhaustive:true },
    { stamp_type:'DOCTRINE', ham_uid:exactHam, exhaustive:true },
    { stamp_type:'LOGFUL', ham_uid:exactHam, exhaustive:true }
  ]), viewerTier);
  try {
    var reads = await Promise.all(queries.map(function (query) {
      return identityRead(query);
    }));
    var unavailable = reads.find(function (read) { return !read || read.ok !== true; });
    if (unavailable) return {
      schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:false, available:false, ham_uid:exactHam, subjects:subjects, records:[],
      count:0, reason:String(unavailable.reason || 'identity_brain_error'),
      status:unavailable.status == null ? null : unavailable.status,
      error:unavailable.error || null, ms:Date.now() - started
    };
    var seen = Object.create(null);
    var rows = [];
    reads.forEach(function (read) {
      read.rows.forEach(function (row) {
        var key = String(row && row.id == null
          ? (row && row.source || '') + '|' + (row && row.stamp_type || '')
          : row.id);
        if (seen[key]) return;
        seen[key] = true;
        rows.push(row);
      });
    });
    var records = identityProvenance.buildStoredEvidence(rows, subjects, exactHam);
    return { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:true, available:true, ham_uid:exactHam, subjects:subjects,
      records:records, count:records.length, ms:Date.now() - started };
  } catch (error) {
    return { schema:identityProvenance.EVIDENCE_RESULT_SCHEMA,
      ok:false, available:false, ham_uid:exactHam, subjects:subjects,
      records:[], count:0, reason:'identity_brain_error',
      error:String(error && error.message || error || 'unknown').slice(0, 160),
      ms:Date.now() - started };
  }
}

// Recent context: the conversation lane for a HAM
async function findContext(hamUid, limit, viewerTier) {
  // ⬡B:core.find:FIX:conversation_context_not_machinery:20260702⬡
  // Was: all MINUTES for the ham, which is dominated by Overseer's every-3-minute
  // "air flowed through the ventilation system" machinery stamps. Her MEMORY_BANK context was
  // wall-to-wall ventilation, so she parroted it in every reply (screenshot evidence:
  // same phrase repeated across texts and emails). Now: conversation minutes
  // (pai.minutes.*) and high-importance results, what was actually said and done.
  // ⬡B:core.find:FIX:this_read_finally_has_a_writer_on_every_channel:20260726⬡
  // FOUNDER, loudest complaint: "I still don't think she really memorizes and has memory."
  // Verified mechanical cause: for weeks the ONLY writer of the 'pai.minutes.' prefix this
  // line queries was routes/stream.routes.js, the browser stream. SMS, voice and every
  // non-stream /cara/chat turn wrote nothing this read could ever return, and leg 2
  // (stamp_type RESULT at the importance floor) was never written by a turn at all, so on the
  // channels he actually uses BOTH legs of her conversation memory pointed at things nothing
  // wrote. The writer is now core/memory.keeper.js, at the ONE common PAI exit, on every
  // channel, and it emits EXACTLY the contract both legs below query: stamp_type RESULT,
  // source prefix pai.minutes. THE CONTRACT LIVES IN ONE PLACE:
  // core/memory.keeper.js MEMORY_CONTRACT. Read it before you change either string here.
  // ⬡B:core.find:FIX:the_reader_importance_floor_came_off_her_conversation_memory:20260825⬡
  // Both legs used to carry importance_gte: contract.READER_IMPORTANCE_FLOOR. That predicate is
  // gone. It was never a sort or a capacity bound, it was a PostgREST importance=gte.7 that made
  // the rows not come back at all, with no count of what was withheld, so no mind ever learned
  // those turns existed. routes/stream.routes.js stamped every genuinely delivered browser-stream
  // turn at importance 5 for weeks, and this read could not see one of them. The full reasoning
  // and the standing refusal to reintroduce it under a smaller number live in one place:
  // core/memory.keeper.js, the retired-floor law under MEMORY_CONTRACT.
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  return find(scopedQueries([
    callerWindow({ source_prefix: contract.TURN_SOURCE_PREFIX, ham_uid: hamUid,
      stamp_type: contract.TURN_STAMP_TYPE }, limit),
    callerWindow({ stamp_type: contract.TURN_STAMP_TYPE, ham_uid: hamUid }, limit)
  ], viewerTier));
}

// Semantic search: topic-specific brain reads
async function findBySource(sourcePrefix, limit) {
  return find([{ source_prefix: sourcePrefix, limit: limit || 10 }]);
}

// ⬡B:core.find:FIX:recent_results_are_ham_scoped_the_feb2026_leak:20260722⬡
// Recent RESULT beads for THIS ham. This feeds the always-on Memory Bank turn context
// (core/fcw.builder.js), where every sibling read is ham-scoped — this one was not, so
// one HAM's RESULT summaries (what was said and done) bled into another HAM's prompt:
// the exact cross-HAM incident class the founder was burned by in Feb 2026. Now
// ham-scoped and FAIL-CLOSED — no ham, no read, never cross-HAM. (The old signature was
// findRecentResults(limit); the sole caller passes hamUid now.)
// ⬡B:core.find:WIRE:the_adviser_lane_is_not_the_conversation_lane:20260726⬡
// Since 20260726 every committed turn writes a RESULT bead in the conversation lane (source
// prefix pai.minutes., core/memory.keeper.js). findContext already returns that lane. If this
// finder returned it too, a talkative hour would push every adviser and agent RESULT off the
// wall entirely, and the founder would have traded "she forgets what I said" for "she forgot
// what her advisers did". Excluding the conversation prefix here keeps both lanes alive: this
// one is what her stations produced, findContext is what the two of them said.
async function findRecentResults(hamUid, limit, viewerTier) {
  if (!hamUid) return { beads: [] };
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  return find(scopedQueries([callerWindow({ stamp_type: 'RESULT', ham_uid: hamUid,
    source_not_prefix: contract.TURN_SOURCE_PREFIX }, limit)], viewerTier));
}

// ⬡B:core.find:WIRE:findDoctrine_20260701⬡
// ROADMAP + DOCTRINE beads for a HAM's world. Added after a real live gap: asked
// "what is the most important thing on our roadmap" over text, she answered
// "I don't have any information on our roadmap" — the Memory Bank loaded identity, agent
// JDs, and recent minutes but never doctrine or roadmap. ANYHAM test: hamUid drives
// the read, any HAM gets their own doctrine.
async function findDoctrine(hamUid, limit, viewerTier) {
  return find(scopedQueries([
    callerWindow({ stamp_type: 'ROADMAP', ham_uid: hamUid }, limit),
    callerWindow({ stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: doctrineWallFloor() }, limit)
  ], viewerTier));
}

function normalizeDoctrineQuery(value) {
  return String(value||'').replace(/[\\%*_(),]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
}

function encodeDoctrineCursor(row) {
  if(!row||row.id===undefined||!row.source)return null;
  return Buffer.from(JSON.stringify({source:String(row.source),id:String(row.id)}),'utf8')
    .toString('base64url');
}

function decodeDoctrineCursor(value) {
  if(value===undefined||value===null||value==='')return null;
  var token=String(value);
  if(token.length>1000||!/^[A-Za-z0-9_-]+$/.test(token))return false;
  try{
    var decoded=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
    var source=decoded&&String(decoded.source||''),id=decoded&&String(decoded.id||'');
    if(!/^[A-Za-z0-9._:/-]{1,500}$/.test(source)||
        !/^[A-Za-z0-9._:-]{1,180}$/.test(id))return false;
    var canonical=Buffer.from(JSON.stringify({source:source,id:id}),'utf8').toString('base64url');
    return canonical===token?{source:source,id:id}:false;
  }catch(error){return false;}
}

function doctrinePagePath(hamUid, input, viewerTier) {
  var request=input||{};
  var parts=['select='+encodeURIComponent(compatibleSelect(
    'id,source,stamp_type,summary,importance,created_at,content,edges,ham_uid,acl_tier,superseded_by',
    true)),
    'ham_uid=eq.'+encodeURIComponent(hamUid)];
  activeTruthPredicate(parts,request);
  if(request.stamp_type)parts.push('stamp_type=eq.'+encodeURIComponent(request.stamp_type));
  else parts.push('stamp_type=in.(ROADMAP,DOCTRINE)');
  if(request.source)parts.push('source=eq.'+encodeURIComponent(request.source));
  if(request.query){
    var literal=normalizeDoctrineQuery(request.query);
    parts.push('or=(source.ilike.*'+encodeURIComponent(literal)+
      '*,summary.ilike.*'+encodeURIComponent(literal)+'*)');
  }
  if(request.after)parts.push('or=(source.gt.'+encodeURIComponent(request.after.source)+
    ',and(source.eq.'+encodeURIComponent(request.after.source)+
    ',id.gt.'+encodeURIComponent(request.after.id)+'))');
  var tier=require('./privacy/people.tier.js').effectiveTier(viewerTier);
  var filter=require('./privacy/people.tier.js').structuralFilter(tier);
  if(filter)parts.push(filter);
  parts.push('order=source.asc,id.asc');
  parts.push('limit='+(Number(request.limit)+1));
  return parts.join('&');
}

async function findDoctrinePage(hamUid, input, viewerTier) {
  var request=Object.assign({},input||{});
  var after=decodeDoctrineCursor(request.cursor);
  if(after===false)return {ok:false,available:true,reason:'doctrine_cursor_invalid',rows:[]};
  request.after=after;
  var read=await bq(doctrinePagePath(hamUid,request,viewerTier));
  if(!read||read.ok!==true||read.available!==true)return read;
  var rows=(Array.isArray(read.rows)?read.rows:[]).filter(function(row){
    return request.include_superseded===true?true:row&&row.superseded_by==null;
  });
  if(request.source){
    if(rows.length!==1||rows[0].ham_uid!==hamUid||rows[0].source!==request.source){
      return {ok:false,available:true,reason:rows.length?'doctrine_source_ambiguous':
        'doctrine_source_not_found',rows:[]};
    }
    return {ok:true,available:true,mode:'read',rows:[rows[0]],cursor:null,next_cursor:null,
      complete:true,readback_verified:true,active_truth_enforced:supportsActiveTruth(),
      storage_limitations:supportsActiveTruth()?[]:['legacy_supersession_unavailable']};
  }
  var page=rows.slice(0,request.limit),hasMore=rows.length>request.limit;
  return {ok:true,available:true,mode:request.query?'search':'inventory',rows:page,
    cursor:request.cursor||null,next_cursor:hasMore?encodeDoctrineCursor(page[page.length-1]):null,
    complete:!hasMore,readback_verified:true,active_truth_enforced:supportsActiveTruth(),
    storage_limitations:supportsActiveTruth()?[]:['legacy_supersession_unavailable']};
}

// ⬡B:core.find:WIRE:findPersonProfile:20260702⬡
// Rich identity: who this person actually IS, from their scw.person_profile bead.
// Founder said, verbatim: "she should know me bro". Name + tier is not knowing
// someone. UNIVERSALITY: keyed by ham_uid — any HAM gets their own profile.
async function findPersonProfile(hamUid, viewerTier) {
  return find(scopedQueries([{ source_prefix: 'scw.person_profile.' + hamUid,
    ham_uid: hamUid, limit: 1 }], viewerTier));
}

// ⬡B:core.find:WIRE:findPreferences_20260711⬡
// The person's own tastes/favorites (favorite team, food, etc). Real live bug:
// 'who is my favorite team' intermittently returned no-info even though the
// PREFERENCE bead exists -- the model sometimes called find_in_brain without the
// PREFERENCE filter (tool-argument variance). Cold fix: MEMORY_BANK pre-loads these into
// the wall so the answer is already in context and the model never has to guess a
// filter. UNIVERSALITY: keyed by ham_uid, any HAM gets their own preferences.
async function findPreferences(hamUid, limit, viewerTier) {
  return find(scopedQueries([
    callerWindow({ stamp_type: 'PREFERENCE', ham_uid: hamUid }, limit)
  ], viewerTier));
}

// ⬡B:core.find:WIRE:findWonderGames_20260714⬡
// The same class of bug as findPreferences, caught by the founder live: 'what is
// Wonder Games / the coding cook-off' returned no-info even though 11+ real
// WONDER_GAMES/DOCTRINE/DIRECTIVE beads exist, because the model doesn't reliably
// call find_in_brain with the right stamp_type for a feature-explanation question.
// Cold fix, same pattern as preferences: MEMORY_BANK pre-loads these into the wall so the
// answer is already present and the model never has to guess a filter.
// UNIVERSALITY: keyed by ham_uid, works for any HAM, no hardcoded content.
async function findWonderGames(hamUid, limit, viewerTier) {
  return find(scopedQueries([
    callerWindow({ stamp_type: 'WONDER_GAMES', ham_uid: hamUid }, limit),
    callerWindow({ source_prefix: 'wonder_games.', ham_uid: hamUid }, limit),
    callerWindow({ stamp_type: 'DOCTRINE', ham_uid: hamUid, importance_gte: doctrineWallFloor() }, limit)
  ], viewerTier));
}

// ⬡B:core.find:WIRE:findStatedCommitments_20260725⬡
// WHAT THIS PERSON TOLD HER DIRECTLY, read back. Founder-caught live, demo-critical:
// he told her his Saturday plan through her own gate, she received it and confirmed the
// specifics back with a committed cycle receipt, and hours later, asked where things
// stood, she said his day was open with no meetings locked in.
// ⬡B:core.find:FIX:the_comment_here_used_to_lie_about_its_own_writer:20260726⬡
// WHAT THIS COMMENT USED TO SAY, and it was FALSE when it was written: "the capture side
// already works. core/synthesize.js's memory keeper stamps a MEMORY bead (importance 9)
// carrying their exact words every time a person hands over something to keep." It did not.
// The synthesize keeper had been removed on 20260725 as a detached model call and a detached
// brain write escaping the council (⬡COLD:act:remove:PAI_SYNTHESIS_PROJECTION⬡), and nothing
// replaced it. 'memory.gifted.' had five references in the whole repo: two comments swearing
// the writer existed, one test fixture, and the two READS on the lines below. NO WRITER. So
// this read was correct and pointed at nothing, and the comment above it told every coder who
// looked that capture was solved and to move on. That is the actual mechanism behind "she
// still doesn't really memorize": not that nobody looked, but that the code lied to everyone
// who did. THE WRITER NOW EXISTS: core/memory.keeper.js, at the ONE common PAI exit, on every
// channel, awaited inside the cycle with a verified readback, ruled by a mind and leashed to
// the person's own words. If you are reading this comment to decide whether capture works,
// open that file and check that core/tool.loop.js still calls keepTurn. Do not trust prose.
// ONE SOURCE: this reads the exact bead that keeper writes, addressed by the one shared
// MEMORY_CONTRACT, so the read string and the write string can never drift apart again.
//
// MERGE NOTE 20260727: main independently patched this same function while this branch's
// memory.keeper.js work was in flight, removing the source_prefix 'memory.gifted.' clause as
// dead (true on main at the time: nothing wrote that prefix). That is no longer true on this
// branch. core/memory.keeper.js's keepGift now writes exactly that prefix
// (MEMORY_CONTRACT.GIFT_SOURCE_PREFIX), so the clause below is live, not dead, and dropping it
// would silently regress this branch's own fix. Kept both contract-driven clauses.
// Fails closed without a ham (the Feb-2026 cross-HAM law, same as findRecentResults),
// and ham_uid scopes every query, so one person's stated plans can never surface in
// another person's wall. The importance floor that used to sit on the second leg came off
// 20260825: it kept the low-importance MEMORY housekeeping stamps out of the wall by making
// them unknowable, and a bookkeeping row belongs on the wall LABELLED as a bookkeeping row so
// the reading mind can skip it in a quarter of a token. The read-back writer fence in
// core/fcw.builder.js carries that label. See core/memory.keeper.js, the retired-floor law.
// UNIVERSALITY: keyed by ham_uid, any HAM gets their own. No person, no content hardcoded.
async function findStatedCommitments(hamUid, limit, viewerTier) {
  if (!hamUid) return { beads: [] };
  var contract = require('./memory.keeper.js').MEMORY_CONTRACT;
  return find(scopedQueries([
    callerWindow({ source_prefix: contract.GIFT_SOURCE_PREFIX, ham_uid: hamUid }, limit),
    callerWindow({ stamp_type: contract.GIFT_STAMP_TYPE, ham_uid: hamUid }, limit)
  ], viewerTier));
}

// ⬡B:core.find:WIRE:the_one_door_a_non_founder_world_reads_through:20260726⬡
// THE WORLD READ. Every read on behalf of a world that is NOT the founder's own goes
// through here, so the tier ceiling cannot be forgotten by a caller: it is applied to
// every query in the batch, not to whichever ones the caller remembered. An unresolved
// tier lands at STRICTEST inside people.tier.effectiveTier, never at T0. This is the
// query-side half; board/pam/pam.js pamRelease is the judgment-side half, and a world
// read is meant to pass through both.
async function findForWorld(viewerTier, queries) {
  var tiers = require('./privacy/people.tier.js');
  var t = tiers.effectiveTier(viewerTier);
  var list = (Array.isArray(queries) ? queries : [queries]).map(function (q) {
    return Object.assign({}, q || {}, { viewer_tier: t });
  });
  // ⬡B:core.find:GUARD:an_unenforceable_ceiling_is_reported_loudly_not_returned_as_empty:20260726⬡
  // bq() fails SOFT by design: a slow or erroring bank returns [] so a founder turn degrades
  // instead of hanging. That is right for ordinary context and WRONG here, because on a world
  // read an empty result and an unenforceable ceiling look identical from the outside. If
  // migrations/0004 has not been applied, PostgREST answers the acl_tier predicate with a 400
  // and the soft path would hand back a clean, empty, entirely reassuring [] while the gate
  // was never actually applied. So the world read probes the ceiling ONCE against the live
  // bank first and reports the failure. Closed AND legible beats closed and silent: the
  // founder sees "the tier column is not there", not four mysteriously empty worlds.
  if (t > tiers.T0) {
    var probe = await _tierColumnReachable(t);
    if (!probe.ok) {
      return { ok: false, available:false, beads: [], count: 0, ms: 0, viewer_tier: t,
        reason: probe.reason,
        remedy: 'apply migrations/0004_acl_tier_structural_people_ladder.sql via POST /admin/migrate' };
    }
  }
  var res = await find(list);
  res.viewer_tier = t;
  return res;
}

// One cheap head-style read that exercises the tier predicate and nothing else, so an
// unenforceable ceiling is discovered before any content is selected.
async function _tierColumnReachable(tier) {
  var b = bh();
  if (!b.url || !b.hdrs.apikey) return { ok: false, reason: 'bank_unconfigured' };
  var filter = require('./privacy/people.tier.js').structuralFilter(tier);
  if (!filter) return { ok: true };
  try {
    var r = await fetch(b.url + '/rest/v1/' + _tbl() + '?select=id&' + filter + '&limit=1',
      { headers: b.hdrs });
    if (r.ok) return { ok: true };
    return { ok: false, reason: 'tier_ceiling_unenforceable_http_' + r.status };
  } catch (e) {
    return { ok: false, reason: 'tier_ceiling_unenforceable_transport' };
  }
}

module.exports = { find, findForWorld, findIdentity, findAgentJDs, findNamedAgentRecords, findIdentityEvidence, findContext, findBySource, findRecentResults, findDoctrine, findDoctrinePage, findPersonProfile, findPreferences, findWonderGames, findStatedCommitments,
  readLastCompletedAirCycle:readLastCompletedAirCycle,
  // Exported so the SIXTH hand-copied 8 (core/tool.loop.js) can stop being a copy and read the
  // named setting instead. That file is held by another lane right now, so this change stops at
  // this file's edge and the remaining literal is named out loud in the PR rather than left for
  // someone to find. One source means the source has to be reachable.
  doctrineWallFloor:doctrineWallFloor,
  DOCTRINE_WALL_FLOOR_SETTING:DOCTRINE_WALL_FLOOR_SETTING,
  scanFcwEvidence:scanFcwEvidence,walkFcwEvidence:walkFcwEvidence,
  expandFcwEvidence:expandFcwEvidence,
  _test:{ bq:bq, identityBq:identityBq, identityQueryPath:identityQueryPath,
    readAllPages:readAllPages,walkAllPages:walkAllPages,evidenceQueryPath:evidenceQueryPath,
    readLastAirCycleCandidate:readLastAirCycleCandidate,
    canonicalObservedRow:canonicalObservedRow,canonicalSourceStream:canonicalSourceStream,
    lastAirContextRows:lastAirContextRows,
    fcwEvidenceQueries:fcwEvidenceQueries,doctrinePagePath:doctrinePagePath,
    normalizeDoctrineQuery:normalizeDoctrineQuery,encodeDoctrineCursor:encodeDoctrineCursor,
    decodeDoctrineCursor:decodeDoctrineCursor,
    providerPageSize:PROVIDER_PAGE_SIZE,lastAirCycleSchema:LAST_AIR_CYCLE_SCHEMA } };
