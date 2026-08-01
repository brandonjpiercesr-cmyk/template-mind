// ⬡B:core.agent_find:WONDER:per_seat_truth_beacon_before_deliberation:20260801⬡
// Agent FIND is the named decoder-navigator in front of a seated model. It does not replace
// core/find.js or core/fcw.builder.js. Those remain the one query carrier and the one FCW
// assembler. This capability binds their complete result to the requesting registry seat,
// adds that seat's own employment record and recent cycle truth, and files one typed,
// edge-bearing truth beacon before paid deliberation is allowed to begin.
// Cost: C0. No model, provider, timer, or reach call exists in this module.
'use strict';

const crypto = require('node:crypto');
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

function list(value) {
  return Array.isArray(value) ? value.map(function (item) { return clean(item, 500); })
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
  return output;
}

function recentTruthQueries(node, hamUid, viewerTier) {
  const configured = node && node.metadata && node.metadata.agent_find &&
    node.metadata.agent_find.recent_truth;
  // Every registered seat gets an executable default rather than an unresolved toolbelt
  // string. A seat can narrow this in registry metadata. The default remains exact-HAM,
  // indexed, bounded, and successful-empty aware.
  const suffix = clean(node && node.id, 160).split('.').pop()
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const source = Array.isArray(configured) && configured.length ? configured
    : suffix ? [{source_prefix:suffix + '.',limit:12}] : [];
  if (!source.length) return {ok:false,reason:'agent_find_recent_truth_contract_missing'};
  const queries = source.map(function (query) {
    return copyQuery(query, hamUid, viewerTier);
  }).filter(function (query) {
    return query.stamp_type || query.source || query.source_prefix || query.agent_global;
  });
  return queries.length ? {ok:true,queries:queries}
    : {ok:false,reason:'agent_find_recent_truth_contract_invalid'};
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
  const built = recentTruthQueries(node, hamUid, value.viewer_tier);
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
  return {ok:true,available:true,partial:found.partial === true,beads:found.beads,
    count:found.beads.length,ms:Number(found.ms || 0),queries:built.queries,
    failures:Array.isArray(found.failures) ? found.failures : []};
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
      source:clean(row && row.source, 500),
      stamp_type:clean(row && row.stamp_type, 120),
      summary:clean(row && row.summary, 500),
      created_at:clean(row && row.created_at, 80) || null
    };
  });
  return {available:true,partial:result && result.partial === true,count:rows.length,rows:rows,
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
    'REQUESTING SEAT: ' + record.node_id + ' (' + record.display_name + ') on provider seat ' +
      record.capabilities.provider_seat + '.',
    'OWNER: ' + record.owner_wonder_id + '. REPORTS TO: ' + record.reports_to +
      '. RETURN GATE: ' + record.rules.return_gate + '.',
    'SHARED MISSION: ' + record.shared_mission,
    'PERSONA BASE:',
    personaLines.map(function (line) { return '- ' + line; }).join('\n'),
    'YOUR SEAT DIFFERENTIA: ' + clean(record.persona && record.persona.differentia, 2000),
    'YOUR TEMPERAMENT: ' + clean(record.persona && record.persona.temperament, 1000),
    'YOUR JOB: ' + clean(record.jd && record.jd.summary, 2000),
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
    recent.length ? recent.join('\n') : '- AVAILABLE, SUCCESSFUL EMPTY. No prior cycle rows matched.',
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
  if (fcw.partial === true || list(fcw.unavailableContributors).length ||
      list(fcw.partialContributors).length) {
    return {ok:false,available:false,reason:'agent_find_wall_incomplete'};
  }
  if (!hamUid || !cycleId || !requestId || !providerSeat || !target || !self ||
      self.lifecycle !== 'active' || (target.lifecycle !== 'active' && target.lifecycle !== 'contained')) {
    return {ok:false,available:false,reason:'agent_find_seat_binding_invalid'};
  }
  const recent = value.recent_cycle_truth;
  if (!recent || recent.ok !== true || recent.available !== true) {
    return {ok:false,available:false,
      reason:clean(recent && recent.reason || 'agent_find_recent_truth_unavailable', 160)};
  }
  if (recent.partial === true || (Array.isArray(recent.failures) && recent.failures.length)) {
    return {ok:false,available:false,reason:'agent_find_recent_truth_partial'};
  }
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
  const augmentedContributors = Object.assign({}, fcw.contributors || {}, {
    agentFindSeat:true,agentFindRecentCycleTruth:true
  });
  const augmentedAvailability = Object.assign({}, fcw.contributorAvailability || {}, {
    agentFindSeat:{available:true,partial:false,reason:null},
    agentFindRecentCycleTruth:{available:true,partial:truth.partial === true,reason:null}
  });
  const priorResolved = Number(fcw.contributorsResolved);
  const promptAppendix = employmentPrompt(employment, truth);
  try {
    require('./spend.guard.js').rememberAgentFindBinding({ham_uid:hamUid,cycle_id:cycleId,
      request_id:requestId,seat:providerSeat,owner_node_id:target.id,source:built.source,
      readback_verified:true});
  } catch (error) {}
  return Object.assign({}, fcw, {
    system_prompt:fcw.system_prompt + promptAppendix,
    contributors:augmentedContributors,
    contributorAvailability:augmentedAvailability,
    contributorsAvailable:Object.keys(augmentedAvailability).filter(function (name) {
      return augmentedAvailability[name] && augmentedAvailability[name].available === true;
    }).length,
    contributorsTotal:Object.keys(augmentedContributors).length,
    contributorsResolved:(Number.isFinite(priorResolved) ? priorResolved : 0) + 2,
    agent_find:{
      ok:true,schema:'envolve.agent-find.wake.v1',node_id:AGENT_FIND_NODE_ID,
      seat_name:providerSeat,seat_node_id:target.id,employment_record:employment,
      recent_cycle_truth:truth,truth_beacon:{source:built.source,
        stamp_type:built.beacon.stamp_type,row_id:existing.id || null,readback_verified:true},
      prompt_appendix:promptAppendix
    }
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

// The provider boundary is the universal last door shared by the active model estate.
// It binds the exact already-assembled provider context to the registered owner seat, adds
// the verified employment wake as model context, and returns a cloned request. Raw prompt
// bytes never enter the beacon. Non-chat paid transports are not LLM seats and pass through.
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
  const tierModule = opts.peopleTier || require('./privacy/people.tier.js');
  const tierFact = tierModule.resolveViewerTier(null,hamUid);
  const viewerTier = tierModule.effectiveTier(tierFact && tierFact.tier);
  const recent = await readRecentCycleTruth({ham_uid:hamUid,seat_node_id:seatNodeId,
    viewer_tier:viewerTier},{registry:registry,find:opts.find || defaultFind.find});
  if (!recent.ok) return {ok:false,bound:false,reason:recent.reason};
  const facts = messageFacts(body.messages);
  const fcw = {ok:true,available:true,partial:false,system_prompt:'provider_context_bound',
    viewer_tier:viewerTier,contributors:{providerContext:true},
    contributorAvailability:{providerContext:{available:true,partial:false,reason:null}},
    contributorsResolved:1,contributorsTotal:1,unavailableContributors:[],
    partialContributors:[],context_sha256:facts.context_sha256,
    context_locator:'provider.context.' + hamUid + '.' + cycleId + '.' + requestId,
    message_count:facts.message_count};
  const bound = await bindWall({fcw:fcw,recent_cycle_truth:recent,ham_uid:hamUid,
    cycle_id:cycleId,request_id:requestId,channel:attribution.component,
    seat_name:seatName,seat_node_id:seatNodeId,observed_at:value.observed_at},
  {registry:registry,brain:opts.brain || defaultBrain});
  if (!bound.ok || !bound.agent_find || !bound.agent_find.prompt_appendix) {
    return {ok:false,bound:false,reason:bound.reason || 'agent_find_provider_bind_failed'};
  }
  const nextBody = Object.assign({},body,{messages:[{role:'system',
    content:bound.agent_find.prompt_appendix.trim()}].concat(body.messages)});
  const nextInit = Object.assign({},value.init,{body:JSON.stringify(nextBody)});
  return {ok:true,bound:true,init:nextInit,prompt_appendix:bound.agent_find.prompt_appendix,
    truth_beacon:bound.agent_find.truth_beacon,
    seat_node_id:seatNodeId,seat_name:seatName,context_sha256:facts.context_sha256};
}

module.exports = {AGENT_FIND_NODE_ID:AGENT_FIND_NODE_ID,
  readRecentCycleTruth:readRecentCycleTruth,bindWall:bindWall,
  bindProviderRequest:bindProviderRequest,
  _test:{recentTruthQueries:recentTruthQueries,employmentRecord:employmentRecord,
    recentTruthRecord:recentTruthRecord,wallRecord:wallRecord,employmentPrompt:employmentPrompt,
    parseProviderBody:parseProviderBody,messageFacts:messageFacts,digest:digest}};
