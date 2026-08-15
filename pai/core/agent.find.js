// ⬡B:core.agent_find:WONDER:per_seat_truth_beacon_before_deliberation:20260801⬡
// Agent FIND is the named decoder-navigator in front of a seated model. It does not replace
// core/find.js or core/fcw.builder.js. Those remain the one query carrier and the one FCW
// assembler. This capability binds their complete result to the requesting registry seat,
// adds that seat's own employment record and recent cycle truth, and files one typed,
// edge-bearing truth beacon before paid deliberation is allowed to begin.
// Cost: C0. No model, provider, timer, or reach call exists in this module.
'use strict';

const crypto = require('node:crypto');
const v8 = require('node:v8');
const defaultRegistry = require('./wonders/registry.js');
const defaultFind = require('./find.js');
const defaultBrain = require('./brain.client.js');
const truthBeacons = require('./truth.beacon.js');

const AGENT_FIND_NODE_ID = 'station.agent_find';

function clean(value, max) {
  const out = String(value || '').trim();
  return max ? out.slice(0, max) : out;
}

function exactHam(value) { return clean(value, 160).toUpperCase(); }

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

// The paid boundary hashes the provider message array exactly as it crosses fetch. Closed-world
// seats add Agent FIND's employment appendix before that boundary, so admission must name the
// digest of those final bytes, not the normalized evidence digest stored in the truth beacon.
// Raw messages are never persisted. Only this opaque digest crosses the asynchronous scope.
function providerMessageDigest(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  try {
    return crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex');
  } catch (error) { return null; }
}

function list(value) {
  return Array.isArray(value) ? value.map(function (item) { return clean(item); })
    .filter(Boolean) : [];
}

function copyQuery(query, hamUid, viewerTier) {
  const input = plain(query) ? query : {};
  const output = {};
  ['stamp_type','source','source_prefix','source_not_prefix','agent_global','importance_gte',
    'select','order','limit'].forEach(function (key) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') {
      output[key] = input[key];
    }
  });
  // The requesting world and its tier are boundary facts, never registry configuration.
  output.ham_uid = hamUid;
  output.viewer_tier = viewerTier;
  // The registry owns how much recent seat truth belongs on this wake. A declared per-seat
  // limit is not replaced by a lifetime materialization; only an explicitly unbounded contract
  // uses the full-history path.
  if (output.limit == null) output.exhaustive = true;
  return output;
}

function recentTruthQueries(node, input) {
  const value = input || {};
  const hamUid = exactHam(value.ham_uid);
  const viewerTier = value.viewer_tier;
  const cycleId = clean(value.cycle_id, 220);
  const requestId = clean(value.request_id, 220);
  const configured = node && node.metadata && node.metadata.agent_find &&
    node.metadata.agent_find.recent_truth;
  // Every registered seat gets an executable default rather than an unresolved toolbelt
  // string. A seat can narrow this in registry metadata. The default remains exact-HAM,
  // indexed, exhaustively paginated, and successful-empty aware.
  const suffix = clean(node && node.id, 160).split('.').pop()
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const source = Array.isArray(configured) && configured.length ? configured
    : suffix ? [{source_prefix:suffix + '.'}] : [];
  if (!source.length) return {ok:false,reason:'agent_find_recent_truth_contract_missing'};
  const queries = source.map(function (query) {
    const cycleScope = clean(query && query.cycle_scope, 80);
    if (cycleScope === 'current_request') {
      if (!cycleId || !requestId) return null;
      return copyQuery(Object.assign({}, query, {
        source:'pai.cycle.' + cycleId,source_prefix:null
      }), hamUid, viewerTier);
    }
    return copyQuery(query, hamUid, viewerTier);
  }).filter(function (query) {
    return query && (query.stamp_type || query.source || query.source_prefix || query.agent_global);
  });
  if (source.some(function (query) { return clean(query && query.cycle_scope, 80) ===
      'current_request'; }) && (!cycleId || !requestId)) {
    return {ok:false,reason:'agent_find_recent_truth_cycle_scope_missing'};
  }
  return queries.length ? {ok:true,queries:queries,cycle_id:cycleId,request_id:requestId,
    current_request_only:source.some(function (query) {
      return clean(query && query.cycle_scope,80)==='current_request';
    })}
    : {ok:false,reason:'agent_find_recent_truth_contract_invalid'};
}

function parsedRowContent(row) {
  if (plain(row && row.content)) return row.content;
  try {
    const parsed = JSON.parse(row && row.content || 'null');
    return plain(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function belongsToRequest(row, cycleId, requestId) {
  if (!cycleId || clean(row && row.source) !== 'pai.cycle.' + cycleId) return false;
  const content = parsedRowContent(row);
  const contentCycle = clean(content && (content.cycleId || content.cycle_id), 220);
  const contentRequest = clean(content && (content.requestId || content.request_id), 220);
  return contentCycle === cycleId && !!requestId && contentRequest === requestId;
}

function scopedRecentRows(rows, built) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter(function (row) {
    if (built.current_request_only && !belongsToRequest(row, built.cycle_id, built.request_id)) {
      return false;
    }
    const key = [clean(row && row.id),clean(row && row.source),clean(row && row.stamp_type),
      clean(row && row.created_at, 80),clean(row && row.summary, 500)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readRecentCycleTruth(input, options) {
  const value = input || {};
  const opts = options || {};
  const registry = opts.registry || defaultRegistry;
  const finder = opts.find || defaultFind.find;
  const hamUid = exactHam(value.ham_uid);
  const node = registry.resolve(value.seat_node_id);
  if (!hamUid || !node) return {ok:false,available:false,
    reason:'agent_find_seat_binding_invalid',beads:[]};
  const built = recentTruthQueries(node, {ham_uid:hamUid,viewer_tier:value.viewer_tier,
    cycle_id:value.cycle_id,request_id:value.request_id});
  if (!built.ok) return {ok:false,available:false,reason:built.reason,beads:[]};
  let found;
  try { found = await finder(built.queries); }
  catch (error) { return {ok:false,available:false,reason:'agent_find_recent_truth_read_failed',
    error:clean(error && error.message || error, 160),beads:[]}; }
  if (!found || found.ok !== true || found.available === false || !Array.isArray(found.beads)) {
    return {ok:false,available:false,
      reason:clean(found && found.reason || 'agent_find_recent_truth_unavailable', 160),
      failures:found && found.failures || [],beads:[]};
  }
  const beads = scopedRecentRows(found.beads, built);
  return {ok:true,available:true,partial:found.partial === true,beads:beads,
    count:beads.length,ms:Number(found.ms || 0),queries:built.queries,
    scope:{cycle_id:built.cycle_id || null,request_id:built.request_id || null,
      cross_cycle_mode:built.current_request_only ? 'excluded' : 'seat_history'},
    failures:Array.isArray(found.failures) ? found.failures : []};
}

function questionTerms(value) {
  const stop = new Set(['about','after','again','also','been','being','could','from','have','into',
    'just','like','more','that','their','them','then','there','these','they','this','what','when',
    'where','which','with','would','your']);
  return clean(value, 12000).toLowerCase().split(/[^a-z0-9_]+/).filter(function (term) {
    return term.length >= 3 && !stop.has(term);
  }).filter(function (term, index, all) { return all.indexOf(term) === index; });
}

function candidateFacts(row, receipt, terms, anchors) {
  const contributor = clean(receipt && receipt.contributor, 80);
  const text = [row && row.source,row && row.summary,row && row.stamp_type,
    row && row.agent_global].map(function (item) { return clean(item, 4000).toLowerCase(); }).join(' ');
  const hits = terms.filter(function (term) { return text.indexOf(term) >= 0; });
  const reasons = hits.map(function (term) { return 'question_term:' + term; });
  let score = hits.length * 200 + Math.max(0, Number(row && row.importance || 0));
  if (!anchors.has(contributor)) {
    anchors.add(contributor);
    score += 500;
    reasons.push('contributor_anchor');
  }
  if (contributor === 'identity' || contributor === 'profile') {
    score += 900;
    reasons.push('exact_ham_identity');
  } else if (contributor === 'agentJDs') {
    score += 600;
    reasons.push('seat_employment_context');
  } else if (contributor === 'namedAgentRecords') {
    score += 800;
    reasons.push('question_named_seat');
  } else if (contributor === 'preferences' || contributor === 'wonderGames') {
    score += 700;
    reasons.push('question_triggered_contributor');
  }
  return {contributor:contributor,reasons:reasons,score:score,text:text};
}

function compareCandidates(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  const created = String(b.created_at || '').localeCompare(String(a.created_at || ''));
  return created || String(a.id).localeCompare(String(b.id));
}

function runtimeContextBudgets(value) {
  const heapLimit = Number(v8.getHeapStatistics().heap_size_limit || 0);
  const heapUsed = Number(process.memoryUsage().heapUsed || 0);
  const headroom = Math.max(0, heapLimit - heapUsed);
  const requestedCompact = Number(value && value.compact_byte_budget);
  const requestedFcw = Number(value && value.fcw_byte_budget);
  const compact = Number.isFinite(requestedCompact) && requestedCompact >= 16384
    ? requestedCompact : Math.max(16384, Math.floor(headroom / 128));
  // ⬡B:core.agent.find:FIX:the_default_wall_budget_binds_to_the_model_not_the_heap:20260802⬡
  // headroom/32 on a multi-GB heap is a budget in the tens of megabytes: a bound that never
  // binds. Measured live 20260802 on the founder's own world: 2,012 beads and a 3,076,009
  // character prompt sailed past this function and died downstream at the provider window,
  // which is not capability, it is a dead turn. This is NOT a cap on her thinking, and the
  // distinction is the whole point: an explicit seat context policy still names its own budget
  // and is never touched here, and the ceiling itself lives in env, never a literal person or
  // seat. All this does is stop the DEFAULT from promising a wall no provider can accept.
  const modelWindowRaw = Number(process.env.FCW_MODEL_CONTEXT_BYTES);
  const modelWindow = Number.isFinite(modelWindowRaw) && modelWindowRaw >= 16384
    ? modelWindowRaw : 786432;
  const fcw = Number.isFinite(requestedFcw) && requestedFcw >= 16384
    ? requestedFcw : Math.max(16384, Math.min(modelWindow, Math.floor(headroom / 32)));
  return {compact_bytes:compact,fcw_bytes:fcw,heap_limit_bytes:heapLimit,
    heap_used_bytes:heapUsed,source:Number.isFinite(requestedFcw) && requestedFcw >= 16384
      ? 'requesting_seat_context_policy' : 'node_v8_heap_headroom'};
}

// Agent FIND now runs before FCW body expansion. It mechanically routes compact indexed facts
// for the exact question and requesting seat, keeps a bounded metadata heap on the indexed hot
// path, then expands only the selected row IDs. It makes no semantic ruling and calls no
// model. The receipt exposes every selected ID, inclusion reason, query time, byte envelope, and
// observed heap high-water so a later cycle can expand instead of pretending omitted history did
// not exist.
async function planWallEvidence(input, options) {
  const value = input || {};
  const opts = options || {};
  const finder = opts.findModule || defaultFind;
  const hamUid = exactHam(value.ham_uid);
  const seatNodeId = clean(value.seat_node_id, 160);
  if (!hamUid || !seatNodeId || typeof finder.scanFcwEvidence !== 'function' ||
      typeof finder.expandFcwEvidence !== 'function') {
    return {ok:false,available:false,reason:'agent_find_navigator_unavailable'};
  }
  const started = Date.now();
  const heapStart = process.memoryUsage().heapUsed;
  let heapHighWater = heapStart;
  let compactBytes = 0;
  let candidatesSeen = 0;
  const budgets = runtimeContextBudgets(value);
  const compactBudget = budgets.compact_bytes;
  const questionOnlyTerms = questionTerms(value.question);
  const terms = questionOnlyTerms.concat(questionTerms([value.seat_node_id,value.seat_name]
    .join(' '))).filter(function (term, index, all) { return all.indexOf(term) === index; });
  const selected = new Map();
  const compactOmitted = new Map();
  const anchors = new Set();
  const scan = await finder.scanFcwEvidence({ham_uid:hamUid,viewer_tier:value.viewer_tier,
    named_agents:value.named_agents,include_preferences:value.include_preferences,
    include_wonder_games:value.include_wonder_games,question_terms:questionOnlyTerms},
    {signal:opts.signal,
      onPage:async function (rows, receipt) {
        heapHighWater = Math.max(heapHighWater, process.memoryUsage().heapUsed);
        rows.forEach(function (row) {
          candidatesSeen += 1;
          if (!row || row.id == null) return;
          const facts = candidateFacts(row, receipt, terms, anchors);
          if (!facts.score) return;
          const key = String(row.id);
          const prior = selected.get(key);
          if (prior) {
            if (prior.contributors.indexOf(facts.contributor) < 0) {
              prior.contributors.push(facts.contributor);
            }
            facts.reasons.forEach(function (reason) {
              if (prior.reasons.indexOf(reason) < 0) prior.reasons.push(reason);
            });
            prior.score = Math.max(prior.score, facts.score);
            return;
          }
          const entry = {id:row.id,ham_uid:hamUid,contributors:[facts.contributor],
            reasons:facts.reasons,score:facts.score,created_at:row.created_at || null,
            source:row.source || null};
          entry.compact_bytes = Buffer.byteLength(stableStringify(entry), 'utf8');
          selected.set(key, entry);
          compactOmitted.delete(key);
          compactBytes += entry.compact_bytes;
          if (compactBytes > compactBudget) {
            const ordered = Array.from(selected.values()).sort(compareCandidates);
            while (compactBytes > compactBudget && ordered.length > 1) {
              const dropped = ordered.pop();
              selected.delete(String(dropped.id));
              compactBytes -= dropped.compact_bytes;
              compactOmitted.set(String(dropped.id), {id:dropped.id,
                contributors:dropped.contributors,reasons:dropped.reasons,
                reason:'agent_find_compact_byte_envelope_reached'});
            }
          }
        });
      }});
  heapHighWater = Math.max(heapHighWater, process.memoryUsage().heapUsed);
  if (!scan || scan.ok !== true || scan.available !== true) {
    return {ok:false,available:false,reason:clean(scan && scan.reason ||
      'agent_find_compact_scan_unavailable',160),scan:scan || null};
  }
  const selection = Array.from(selected.values()).sort(compareCandidates);
  const expanded = await finder.expandFcwEvidence(selection, value.viewer_tier, {
    signal:opts.signal,max_bytes:budgets.fcw_bytes,
    last_air_fact_sink:opts.last_air_fact_sink
  });
  heapHighWater = Math.max(heapHighWater, process.memoryUsage().heapUsed);
  if (!expanded || expanded.ok !== true || expanded.available !== true) return expanded;
  const labels = ['identity','agentJDs','context','recent','doctrine','profile','statedPlans',
    'namedAgentRecords','preferences','wonderGames'];
  const failures = Array.isArray(scan.failures) ? scan.failures : [];
  const contributors = {};
  labels.forEach(function (label) {
    const rows = expanded.by_contributor[label] || [];
    const failed = failures.filter(function (failure) { return failure.contributor === label; });
    contributors[label] = {ok:failed.length === 0 || rows.length > 0,
      available:failed.length === 0 || rows.length > 0,partial:failed.length > 0,
      reason:failed.length && !rows.length ? failed[0].reason : null,
      failures:failed,beads:rows,count:rows.length,ms:Date.now() - started};
  });
  const compactOmissions = Array.from(compactOmitted.values()).filter(function (entry) {
    return !selected.has(String(entry.id));
  });
  const partial = scan.partial === true || expanded.envelope_reached === true ||
    compactOmissions.length > 0;
  return {ok:true,available:true,complete:!partial,partial:partial,
    active_truth_enforced:scan.active_truth_enforced !== false,
    storage_limitations:list(scan.storage_limitations),
    schema:'envolve.agent-find.evidence-plan.v1',
    ham_uid:hamUid,seat_node_id:seatNodeId,question_sha256:digest(clean(value.question,12000)),
    query_ms:Date.now() - started,candidates_seen:candidatesSeen,compact_pages:scan.pages,
    compact_bytes:compactBytes,compact_byte_budget:compactBudget,
    selected_row_ids:selection.map(function (entry) { return entry.id; }),
    selections:selection.map(function (entry) { return {id:entry.id,
      contributors:entry.contributors,reasons:entry.reasons}; }),
    fcw_bytes:expanded.retained_bytes,fcw_byte_budget:expanded.max_bytes,
    context_budget_source:budgets.source,heap_limit_bytes:budgets.heap_limit_bytes,
    byte_envelope_reached:expanded.envelope_reached,omitted:expanded.omitted,
    compact_omitted:compactOmissions,
    continuations:Array.isArray(scan.continuations) ? scan.continuations : [],
    full_history_expansion_available:typeof finder.walkFcwEvidence === 'function',
    last_air_cycle:expanded.last_air_cycle || null,
    last_air_cycle_progressive:expanded.last_air_cycle_progressive === true,
    last_air_cycle_sink:expanded.last_air_cycle_sink || null,
    heap_start_bytes:heapStart,heap_high_water_bytes:heapHighWater,
    contributors:contributors,scan:scan};
}

function employmentRecord(registry, node, providerSeat) {
  const base = registry.personaBase(node.id);
  return {
    node_id:node.id,
    display_name:node.display_name,
    kind:node.kind,
    lifecycle:node.lifecycle,
    owner_wonder_id:node.owner_wonder_id,
    reports_to:node.reports_to,
    shared_mission:registry.sharedMission(),
    persona_base:base,
    persona:node.persona,
    jd:node.jd,
    goals:list(node.goals),
    rules:{
      context_policy:node.context_policy,
      authority_policy:node.authority_policy,
      cycle:node.cycle,
      return_gate:node.return_gate,
      never:node.jd && list(node.jd.never)
    },
    capabilities:{
      provider_seat:clean(providerSeat, 120),
      toolbelt:list(node.toolbelt),
      may_summon:list(node.may_summon),
      may_recommend:list(node.may_recommend),
      wakes:list(node.wakes),
      hands_to:list(node.hands_to)
    }
  };
}

function recentTruthRecord(result) {
  const rows = (result && Array.isArray(result.beads) ? result.beads : []).map(function (row) {
    return {
      source:clean(row && row.source),
      stamp_type:clean(row && row.stamp_type),
      summary:clean(row && row.summary),
      created_at:clean(row && row.created_at, 80) || null
    };
  });
  const policyExcluded = !!(result && result.policy_excluded === true);
  const scope = plain(result && result.scope) ? {
    cycle_id:clean(result.scope.cycle_id, 220) || null,
    request_id:clean(result.scope.request_id, 220) || null,
    cross_cycle_mode:clean(result.scope.cross_cycle_mode, 80) || null
  } : null;
  return {available:policyExcluded ? false : true,policy_excluded:policyExcluded,
    exclusion_reason:policyExcluded ? clean(result && result.exclusion_reason, 240) : null,
    partial:result && result.partial === true,count:rows.length,rows:rows,
    scope:scope,
    query_count:result && Array.isArray(result.queries) ? result.queries.length : 0,
    failures:result && Array.isArray(result.failures) ? result.failures : []};
}

function wallRecord(fcw) {
  const contributors = plain(fcw && fcw.contributors) ? Object.assign({}, fcw.contributors) : {};
  const availability = plain(fcw && fcw.contributorAvailability)
    ? Object.keys(fcw.contributorAvailability).sort().reduce(function (out, key) {
      const state = fcw.contributorAvailability[key] || {};
      out[key] = {available:state.available === true,partial:state.partial === true,
        reason:state.reason || null};
      return out;
    }, {}) : {};
  const output = {
    available:fcw && fcw.available !== false,
    partial:fcw && fcw.partial === true,
    viewer_tier:fcw && fcw.viewer_tier,
    contributors:contributors,
    contributor_availability:availability,
    contributors_resolved:Number(fcw && fcw.contributorsResolved || 0),
    contributors_total:Number(fcw && fcw.contributorsTotal || Object.keys(contributors).length),
    unavailable_contributors:list(fcw && fcw.unavailableContributors),
    partial_contributors:list(fcw && fcw.partialContributors)
  };
  if(fcw&&fcw.agent_find&&typeof fcw.agent_find.active_truth_enforced==='boolean'){
    output.active_truth_enforced=fcw.agent_find.active_truth_enforced;
    output.storage_limitations=list(fcw.agent_find.storage_limitations);
  }
  if (clean(fcw && fcw.wall_scope, 80)) output.wall_scope=clean(fcw.wall_scope,80);
  if (clean(fcw && fcw.context_policy, 160)) {
    output.context_policy=clean(fcw.context_policy,160);
  }
  if (clean(fcw && fcw.closed_world_reason, 160)) {
    output.closed_world_reason=clean(fcw.closed_world_reason,160);
  }
  if (/^[a-f0-9]{64}$/.test(clean(fcw && fcw.evidence_refs_sha256,64))) {
    output.evidence_refs_sha256=clean(fcw.evidence_refs_sha256,64);
  }
  if (/^[a-f0-9]{64}$/.test(clean(fcw && fcw.context_sha256, 64))) {
    output.context_sha256 = clean(fcw.context_sha256, 64);
  }
  if (clean(fcw && fcw.context_locator, 500)) {
    output.context_locator = clean(fcw.context_locator, 500);
  }
  if (Number.isInteger(fcw && fcw.message_count) && fcw.message_count >= 0) {
    output.message_count = fcw.message_count;
  }
  return output;
}

function lines(label, values) {
  const entries = list(values);
  return label + ': ' + (entries.length ? entries.join('; ') : 'none');
}

function employmentPrompt(record, truth) {
  const personaLines = record.persona_base && list(record.persona_base.lines);
  const duties = record.jd && list(record.jd.duties);
  const never = record.jd && list(record.jd.never);
  const recent = truth.rows.map(function (row) {
    return '- ' + (row.created_at ? row.created_at + ' ' : '') + row.stamp_type + ' ' +
      row.source + (row.summary ? ': ' + row.summary : '');
  });
  return [
    '',
    'AGENT FIND WAKE RECORD, verified before this deliberation:',
    'REQUESTING SEAT: ' + record.node_id + ' (' + record.display_name + ').',
    'OWNER: ' + record.owner_wonder_id + '. REPORTS TO: ' + record.reports_to +
      '. RETURN GATE: ' + record.rules.return_gate + '.',
    'SHARED MISSION: ' + record.shared_mission,
    'PERSONA BASE:',
    personaLines.map(function (line) { return '- ' + line; }).join('\n'),
    'YOUR SEAT DIFFERENTIA: ' + clean(record.persona && record.persona.differentia),
    'YOUR TEMPERAMENT: ' + clean(record.persona && record.persona.temperament),
    'YOUR JOB: ' + clean(record.jd && record.jd.summary),
    lines('YOUR DUTIES', duties),
    lines('YOUR HARD NEVERS', never),
    lines('YOUR GOALS', record.goals),
    'AUTHORITY POLICY: ' + record.rules.authority_policy +
      '. CONTEXT POLICY: ' + record.rules.context_policy + '.',
    lines('TOOLS YOU WAKE HOLDING', record.capabilities.toolbelt),
    lines('SEATS YOU MAY SUMMON', record.capabilities.may_summon),
    lines('SEATS YOU MAY ONLY RECOMMEND', record.capabilities.may_recommend),
    lines('RUN OF SHOW, WAKES', record.capabilities.wakes),
    lines('RUN OF SHOW, HANDS TO', record.capabilities.hands_to),
    'RECENT CYCLE TRUTH FROM THE WALL' + (truth.partial ? ' (PARTIAL READ)' : '') + ':',
    truth.policy_excluded
      ? '- POLICY EXCLUDED FOR THIS CLOSED-WORLD DELIBERATION: ' + truth.exclusion_reason +
        '. Use only the exact evidence in this request.'
      : (recent.length ? recent.join('\n')
        : (truth.partial
          ? '- EMPTY ON AN INCOMPLETE READ. Zero rows arrived, and not every query completed, '
            + 'so this emptiness is NOT proof of an empty record.'
          : '- AVAILABLE, SUCCESSFUL EMPTY. No prior cycle rows matched.')),
    (!truth.policy_excluded && truth.partial)
      ? '- PARTIAL READ: not every recent-truth query completed'
        + ((Array.isArray(truth.failures) && truth.failures.length)
          ? ' (' + truth.failures.map(function (failure) {
            return clean(failure && failure.reason, 120) || 'reason unrecorded';
          }).join('; ') + ')' : '')
        + '. The rows above are what carried through, not the whole record. Never treat a row '
        + 'you do not see here as proof it does not exist, and say plainly if this gap matters.'
      : '',
    'This wake record is internal context. Never narrate Agent FIND, registry ids, policies, or '
      + 'cycle rows to the person. Use them to do the job, and return through the registered gate.',
    ''
  ].join('\n');
}

function parsedContent(row) {
  if (row && plain(row.content)) return row.content;
  try { return JSON.parse(row && row.content || 'null'); }
  catch (error) { return null; }
}

async function bindWall(input, options) {
  const value = input || {};
  const opts = options || {};
  const registry = opts.registry || defaultRegistry;
  const brain = opts.brain || defaultBrain;
  const fcw = value.fcw;
  const hamUid = exactHam(value.ham_uid);
  const cycleId = clean(value.cycle_id, 220);
  const requestId = clean(value.request_id, 220);
  const providerSeat = clean(value.seat_name, 120);
  const target = registry.resolve(value.seat_node_id);
  const self = registry.resolve(AGENT_FIND_NODE_ID);
  if (!fcw || fcw.ok !== true || typeof fcw.system_prompt !== 'string' || !fcw.system_prompt) {
    return {ok:false,available:false,reason:'agent_find_wall_unavailable'};
  }
  // ⬡B:core.agent_find:FIX:one_missing_contributor_may_not_cost_her_the_whole_cycle:20260802⬡
  // FOUNDER-FELT OUTAGE, diagnosed live 20260802: every cycle on every channel was returning
  // memory_bank_build_failed, detail agent_find_wall_incomplete. Chat, the command center,
  // advisors, worlds, and "she says I ain't got no memory" on text were all THIS LINE.
  // The gate below used to refuse the wall outright whenever ANY single contributor was
  // unavailable or partial. One slow or failing read out of many, and she could not think at
  // all, anywhere. In the sandbox every contributor resolves, so it never fired locally and the
  // defect was invisible from a developer machine for a full day.
  // That is cold code deciding she does not get a cycle, which is the exact shape the founder
  // has been naming: do not cap her, do not limit her, do not gate her behind something she
  // cannot see. Integrity is served by her KNOWING the wall was thin, not by her being silenced.
  // The estate already contemplates exactly this state and has a handler for it: tool.loop.js
  // stamps a NEEDS_CLAIR gap reading "ran on thin context," which can only ever happen if she is
  // permitted to run on thin context in the first place.
  // So a thin wall no longer refuses. It rides through as a NAMED GAP on the returned wall, so
  // the deliberation can see precisely what was missing and say so rather than guessing, and the
  // gap is observable instead of silent. A wall that is entirely absent or unusable is still
  // refused above; that is a different fact and it stays refused.
  const wallGaps = {
    partial: fcw.partial === true,
    unavailable: list(fcw.unavailableContributors),
    degraded: list(fcw.partialContributors),
    storage_limitations:list(fcw.agent_find&&fcw.agent_find.storage_limitations)
  };
  if (wallGaps.partial || wallGaps.unavailable.length || wallGaps.degraded.length) {
    console.error('[agent.find] wall is thin, proceeding on named gaps rather than silencing her:',
      JSON.stringify({unavailable: wallGaps.unavailable, degraded: wallGaps.degraded,
        storage_limitations:wallGaps.storage_limitations}).slice(0, 300));
  }
  if (!hamUid || !cycleId || !requestId || !providerSeat || !target || !self ||
      self.lifecycle !== 'active' || (target.lifecycle !== 'active' && target.lifecycle !== 'contained')) {
    return {ok:false,available:false,reason:'agent_find_seat_binding_invalid'};
  }
  const recent = value.recent_cycle_truth;
  const policyExcluded=!!(recent&&recent.ok===true&&recent.available===false&&
    recent.policy_excluded===true&&clean(recent.exclusion_reason,240));
  if (!recent || recent.ok !== true || (recent.available !== true && !policyExcluded)) {
    return {ok:false,available:false,
      reason:clean(recent && recent.reason || 'agent_find_recent_truth_unavailable', 160)};
  }
  // ⬡B:core.agent_find:FIX:a_partial_recent_truth_read_may_not_cost_her_the_whole_cycle:20260815⬡
  // This is the SAME disease the founder-felt 20260802 outage cured for the FCW wall directly
  // above, left uncured here. A slow or failing recent-truth query does not make the rows that
  // DID arrive false; it makes the read incomplete. Refusing over it was not a small drop:
  // bindWall returning ok:false is the wake boundary, and tool.loop refuses every non-ok wall
  // before its first provider call, so one thin sub-read was killing the entire cycle.
  //
  // Carry, never classify (founder Doctrine Drop 20260815): the gap rides through NAMED instead.
  // recentTruthRecord already threads partial and failures, and employmentPrompt already renders
  // "(PARTIAL READ)" beside the rows that did arrive; that carrying code was unreachable because
  // this refusal fired first. No row is dropped and the section is never withheld for being
  // incomplete. She is told plainly what did not complete and judges from there.
  //
  // The branch ABOVE stays refusing on purpose, and it is a different fact, exactly as this
  // file's own 20260802 comment already draws the line: when available is false there are no
  // rows at all to carry, so there is nothing to hand her but a refusal.
  const employment = employmentRecord(registry, target, providerSeat);
  const truth = recentTruthRecord(recent);
  const wall = wallRecord(fcw);
  const built = truthBeacons.buildAgentFindReceipt({
    ham_uid:hamUid,cycle_id:cycleId,request_id:requestId,
    channel:value.channel,seat_name:providerSeat,seat_node_id:target.id,
    employment_record:employment,wall:wall,recent_cycle_truth:truth,
    observed_at:value.observed_at,
    privacy:{tier:fcw.viewer_tier}
  });
  if (!built.ok) return {ok:false,available:false,reason:built.reason};
  let existing;
  try { existing = await brain.findBySource(built.source, hamUid); }
  catch (error) { return {ok:false,available:false,reason:'agent_find_truth_beacon_read_failed'}; }
  if (!existing) {
    try { await brain.writeBead(built.spec); }
    catch (error) { return {ok:false,available:false,reason:'agent_find_truth_beacon_write_failed',
      detail:clean(error && error.message || error, 160)}; }
    try { existing = await brain.findBySource(built.source, hamUid); }
    catch (error) { return {ok:false,available:false,reason:'agent_find_truth_beacon_readback_failed'}; }
  }
  const checked = truthBeacons.validateAgentFindRow(existing, {
    source:built.source,ham_uid:hamUid,cycle_id:cycleId,request_id:requestId,
    seat_name:providerSeat,seat_node_id:target.id
  });
  if (!checked.ok || parsedContent(existing) === null) {
    return {ok:false,available:false,reason:checked.reason || 'agent_find_truth_beacon_readback_mismatch'};
  }
  const truthContributor=truth.policy_excluded?'agentFindContextPolicy':'agentFindRecentCycleTruth';
  const augmentedContributors = Object.assign({}, fcw.contributors || {}, {agentFindSeat:true});
  augmentedContributors[truthContributor]=true;
  const augmentedAvailability = Object.assign({}, fcw.contributorAvailability || {}, {
    agentFindSeat:{available:true,partial:false,reason:null}
  });
  augmentedAvailability[truthContributor]={available:true,partial:truth.partial === true,
    reason:truth.policy_excluded?truth.exclusion_reason:null};
  const priorResolved = Number(fcw.contributorsResolved);
  const promptAppendix = employmentPrompt(employment, truth);
  try {
    require('./spend.guard.js').rememberAgentFindBinding({ham_uid:hamUid,cycle_id:cycleId,
      request_id:requestId,seat:providerSeat,owner_node_id:target.id,source:built.source,
      readback_verified:true,wall_scope:wall.wall_scope||'full_fcw',
      context_sha256:wall.context_sha256||null});
  } catch (error) {}
  // The thin-wall gap rides on the returned wall so nothing downstream has to guess whether it
  // is looking at a complete picture, and so a thin turn is distinguishable from a full one in
  // the receipt rather than only in a log line.
  const storageGap=wallGaps.storage_limitations.indexOf('legacy_supersession_unavailable')>=0
    ? ' This memory store could not verify whether an older record was later corrected. Treat '
      + 'its history as useful but not complete current truth, and say that plainly if it matters.'
    : '';
  const gapAppendix = (wallGaps.partial || wallGaps.unavailable.length ||
    wallGaps.degraded.length || wallGaps.storage_limitations.length)
    ? ('\n\nSome of what you normally read was not available for this turn' +
       (wallGaps.unavailable.length ? ', missing: ' + wallGaps.unavailable.join(', ') : '') +
       (wallGaps.degraded.length ? ', incomplete: ' + wallGaps.degraded.join(', ') : '') +
       '. Answer on what you do have and say plainly what you could not check. Never fill a gap ' +
       'with a guess.'+storageGap)
    : '';
  return Object.assign({}, fcw, {
    agent_find_wall_gaps: wallGaps,
    system_prompt:fcw.system_prompt + promptAppendix + gapAppendix,
    contributors:augmentedContributors,
    contributorAvailability:augmentedAvailability,
    contributorsAvailable:Object.keys(augmentedAvailability).filter(function (name) {
      return augmentedAvailability[name] && augmentedAvailability[name].available === true;
    }).length,
    contributorsTotal:Object.keys(augmentedContributors).length,
    contributorsResolved:(Number.isFinite(priorResolved) ? priorResolved : 0) + 2,
    agent_find:Object.assign({}, fcw.agent_find || {}, {
      ok:true,schema:'envolve.agent-find.wake.v1',node_id:AGENT_FIND_NODE_ID,
      seat_name:providerSeat,seat_node_id:target.id,employment_record:employment,
      recent_cycle_truth:truth,truth_beacon:{source:built.source,
        stamp_type:built.beacon.stamp_type,row_id:existing.id || null,readback_verified:true},
      prompt_appendix:promptAppendix
    })
  });
}

function parseProviderBody(init) {
  try {
    const body = JSON.parse(init && init.body || 'null');
    return plain(body) && Array.isArray(body.messages) ? body : null;
  } catch (error) { return null; }
}

function messageFacts(messages) {
  const normalized = messages.map(function (message) {
    const value = plain(message) ? message : {};
    return {role:clean(value.role, 40),content:value.content};
  });
  return {context_sha256:digest(normalized),message_count:normalized.length};
}

function closedWorldRecent(reason) {
  return {ok:true,available:false,policy_excluded:true,partial:false,beads:[],count:0,ms:0,
    queries:[],failures:[],exclusion_reason:clean(reason,240)};
}

async function bindClosedWorld(input, options) {
  const value=input||{},opts=options||{},registry=opts.registry||defaultRegistry;
  const target=registry.resolve(value.seat_node_id);
  const messages=Array.isArray(value.messages)?value.messages:null;
  const contextPolicy=clean(value.context_policy,160);
  const reason=clean(value.closed_world_reason,160);
  if(!target||!messages||!messages.length||!contextPolicy||
      contextPolicy!==clean(target.context_policy,160)||!reason){
    return {ok:false,available:false,reason:'agent_find_closed_world_contract_invalid'};
  }
  const facts=messageFacts(messages);
  const refs=list(value.evidence_refs).sort();
  const tierModule=opts.peopleTier||require('./privacy/people.tier.js');
  const tierFact=tierModule.resolveViewerTier(null,exactHam(value.ham_uid));
  const viewerTier=tierModule.effectiveTier(tierFact&&tierFact.tier);
  const fcw={ok:true,available:true,partial:false,system_prompt:'closed_world_context_bound',
    wall_scope:'closed_world',context_policy:contextPolicy,closed_world_reason:reason,
    viewer_tier:viewerTier,contributors:{closedWorldEvidence:true,registryContextPolicy:true},
    contributorAvailability:{closedWorldEvidence:{available:true,partial:false,reason:null},
      registryContextPolicy:{available:true,partial:false,reason:null}},
    contributorsResolved:2,contributorsTotal:2,unavailableContributors:[],
    partialContributors:[],context_sha256:facts.context_sha256,
    evidence_refs_sha256:digest(refs),
    context_locator:'closed.world.'+exactHam(value.ham_uid)+'.'+clean(value.cycle_id,220)+'.'+
      clean(value.request_id,220),message_count:facts.message_count};
  const bound=await bindWall({fcw:fcw,recent_cycle_truth:closedWorldRecent(reason),
    ham_uid:value.ham_uid,cycle_id:value.cycle_id,request_id:value.request_id,
    channel:value.channel,seat_name:value.seat_name,seat_node_id:value.seat_node_id,
    observed_at:value.observed_at},{registry:registry,brain:opts.brain||defaultBrain});
  if(!bound.ok)return bound;
  const appendix=clean(bound.agent_find&&bound.agent_find.prompt_appendix);
  const providerContextSha=providerMessageDigest([
    {role:'system',content:appendix}
  ].concat(messages));
  if(!appendix||!providerContextSha)return{ok:false,available:false,
    reason:'agent_find_closed_world_provider_digest_invalid'};
  try {
    require('./spend.guard.js').rememberAgentFindBinding({ham_uid:value.ham_uid,
      cycle_id:value.cycle_id,request_id:value.request_id,seat:value.seat_name,
      owner_node_id:value.seat_node_id,source:bound.agent_find.truth_beacon.source,
      readback_verified:true,wall_scope:'closed_world',context_sha256:providerContextSha});
  } catch (error) {}
  return Object.assign({},bound,{bound:true,context_sha256:facts.context_sha256,
    provider_context_sha256:providerContextSha});
}

// The provider boundary is the universal last door shared by the active model estate. A seat
// whose registry context policy is explicitly bounded can graduate the exact request into a
// closed-world FCW here. A full-context seat must arrive with its complete FCW already bound.
// Raw prompt bytes never enter the beacon. Non-chat paid transports are not LLM seats.
async function bindProviderRequest(input, options) {
  const value = input || {};
  const opts = options || {};
  const body = parseProviderBody(value.init);
  if (!body) return {ok:true,bound:false,reason:'agent_find_non_chat_transport',
    init:value.init};
  const attribution = plain(value.attribution) ? value.attribution : {};
  const registry = opts.registry || defaultRegistry;
  const hamUid = exactHam(attribution.ham_uid);
  const cycleId = clean(attribution.cycle_id, 220);
  const requestId = clean(attribution.request_id, 220);
  const seatName = clean(attribution.seat, 120);
  const seatNodeId = clean(attribution.owner_node_id, 160);
  const target = registry.resolve(seatNodeId);
  if (!hamUid || !cycleId || !requestId || !seatName || !target ||
      !new Set(['active','contained']).has(target.lifecycle)) {
    return {ok:false,bound:false,reason:'agent_find_provider_binding_invalid'};
  }
  const contextPolicy=clean(target.context_policy,160);
  if(!contextPolicy||/\.full\./.test(contextPolicy))return{ok:false,bound:false,
    reason:'agent_find_complete_fcw_binding_required'};
  const bound=await bindClosedWorld({messages:body.messages,ham_uid:hamUid,cycle_id:cycleId,
    request_id:requestId,channel:attribution.component,seat_name:seatName,
    seat_node_id:seatNodeId,context_policy:contextPolicy,
    closed_world_reason:'registry_context_policy',
    evidence_refs:[attribution.component,attribution.request_id],observed_at:value.observed_at},
  {registry:registry,brain:opts.brain||defaultBrain,peopleTier:opts.peopleTier});
  if (!bound.ok || !bound.agent_find || !bound.agent_find.prompt_appendix) {
    return {ok:false,bound:false,reason:bound.reason || 'agent_find_provider_bind_failed'};
  }
  return {ok:true,bound:true,init:value.init,prompt_appendix:bound.agent_find.prompt_appendix,
    truth_beacon:bound.agent_find.truth_beacon,
    seat_node_id:seatNodeId,seat_name:seatName,context_sha256:bound.context_sha256};
}

// Agent FIND owns the organic closure observation. CATHY may point at her immutable audit and
// checkout, but she cannot author this row or supply its facts. Agent FIND replays every source,
// protected-main, focused-test, merge, and two-service live proof before the canonical writer is
// allowed to persist the exact edge-bearing receipt.
async function recordExternalClosureVerification(input, original, options) {
  const opts=options||{},brain=opts.brain||defaultBrain,proof=opts.deliveryProof;
  if(!proof||typeof proof.verifyExternalCandidate!=='function')return{ok:false,
    reason:'agent_find_external_closure_delivery_proof_missing'};
  const candidate=await proof.verifyExternalCandidate(
      input,original,Object.assign({},opts,{brain:brain}));
  if(!candidate||candidate.ok!==true||candidate.schema!==
      'envolve.cathy-shadow-external-candidate.v1')return candidate||{ok:false,
        reason:'agent_find_external_closure_candidate_invalid'};
  const external=candidate.result.external,
    built=truthBeacons.buildExternalClosureReceipt({ham_uid:original.row.ham_uid,
      original_incident_source:original.row.source,
      original_finding_source:original.context.cold_audit_source,
      classification_id:original.finding.classification_id,repository:original.repository,
      path:original.path,target_wonder:original.finding.target_wonder,
      pr_number:external.pr_number,head_sha:external.head_sha,merge_sha:external.merge_sha,
      protected_main_sha:candidate.source.main_head_sha,
      focused_checkout_source:candidate.result.focused_row.source,
      focused_checkout_sha256:candidate.focused_checkout_sha256,
      focused_test_token:candidate.focused_test_token,
      live_service_ids:external.live_service_ids,live_sha:external.live_sha,
      live_deployments:candidate.live.deployments,
      verified_at:opts.observed_at||new Date(opts.now||Date.now()).toISOString()});
  if(!built.ok)return built;
  let row;
  try { row=await brain.findBySource(built.source,exactHam(original.row.ham_uid)); }
  catch(error){return{ok:false,reason:'agent_find_external_closure_read_failed'};}
  if(!row){
    try { await brain.writeBead(built.spec); }
    catch(error){return{ok:false,reason:'agent_find_external_closure_write_failed'};}
    try { row=await brain.findBySource(built.source,exactHam(original.row.ham_uid)); }
    catch(error){return{ok:false,reason:'agent_find_external_closure_readback_failed'};}
  }
  const expected={source:built.source,ham_uid:exactHam(original.row.ham_uid),
    original_incident_source:original.row.source,
    original_finding_source:original.context.cold_audit_source,
    classification_id:original.finding.classification_id,repository:original.repository,
    path:original.path,target_wonder:original.finding.target_wonder,
    pr_number:Number(external.pr_number),head_sha:external.head_sha,merge_sha:external.merge_sha,
    protected_main_sha:candidate.source.main_head_sha,
    focused_checkout_source:candidate.result.focused_row.source,
    focused_checkout_sha256:candidate.focused_checkout_sha256,
    focused_test_token:candidate.focused_test_token,
    live_service_ids:external.live_service_ids.slice().sort(),live_sha:external.live_sha,
    live_deployments:candidate.live.deployments.map(function (row) {
      return {service_id:clean(row&&row.service_id,160),deploy_id:clean(row&&row.deploy_id,220),
        commit_sha:clean(row&&row.commit_sha,40).toLowerCase(),status:clean(row&&row.status,40)};
    }).sort(function (a,b) { return a.service_id.localeCompare(b.service_id); })};
  const checked=truthBeacons.validateExternalClosureRow(row,expected);
  if(!checked.ok)return{ok:false,reason:'agent_find_external_closure_readback_mismatch',
    detail:checked.reason};
  return{ok:true,source:built.source,row:row,expected:expected,candidate:candidate,
    readback_verified:true};
}

module.exports = {AGENT_FIND_NODE_ID:AGENT_FIND_NODE_ID,
  readRecentCycleTruth:readRecentCycleTruth,planWallEvidence:planWallEvidence,bindWall:bindWall,
  bindClosedWorld:bindClosedWorld,bindProviderRequest:bindProviderRequest,
  providerMessageDigest:providerMessageDigest,
  recordExternalClosureVerification:recordExternalClosureVerification,
  _test:{recentTruthQueries:recentTruthQueries,employmentRecord:employmentRecord,
    recentTruthRecord:recentTruthRecord,wallRecord:wallRecord,employmentPrompt:employmentPrompt,
    parseProviderBody:parseProviderBody,messageFacts:messageFacts,closedWorldRecent:closedWorldRecent,
    scopedRecentRows:scopedRecentRows,belongsToRequest:belongsToRequest,
    questionTerms:questionTerms,candidateFacts:candidateFacts,compareCandidates:compareCandidates,
    runtimeContextBudgets:runtimeContextBudgets,
    digest:digest}};
