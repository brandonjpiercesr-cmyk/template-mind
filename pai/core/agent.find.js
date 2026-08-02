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
  const policyExcluded = !!(result && result.policy_excluded === true);
  return {available:policyExcluded ? false : true,policy_excluded:policyExcluded,
    exclusion_reason:policyExcluded ? clean(result && result.exclusion_reason, 240) : null,
    partial:result && result.partial === true,count:rows.length,rows:rows,
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
    truth.policy_excluded
      ? '- POLICY EXCLUDED FOR THIS CLOSED-WORLD DELIBERATION: ' + truth.exclusion_reason +
        '. Use only the exact evidence in this request.'
      : (recent.length ? recent.join('\n')
        : '- AVAILABLE, SUCCESSFUL EMPTY. No prior cycle rows matched.'),
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
  const policyExcluded=!!(recent&&recent.ok===true&&recent.available===false&&
    recent.policy_excluded===true&&clean(recent.exclusion_reason,240));
  if (!recent || recent.ok !== true || (recent.available !== true && !policyExcluded)) {
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
  return Object.assign({},bound,{bound:true,context_sha256:facts.context_sha256});
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
  const opts=options||{},brain=opts.brain||defaultBrain,proof=opts.deliveryProof||
    require('./coda/repair.delivery.proof.js'),candidate=await proof.verifyExternalCandidate(
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
  readRecentCycleTruth:readRecentCycleTruth,bindWall:bindWall,
  bindClosedWorld:bindClosedWorld,bindProviderRequest:bindProviderRequest,
  recordExternalClosureVerification:recordExternalClosureVerification,
  _test:{recentTruthQueries:recentTruthQueries,employmentRecord:employmentRecord,
    recentTruthRecord:recentTruthRecord,wallRecord:wallRecord,employmentPrompt:employmentPrompt,
    parseProviderBody:parseProviderBody,messageFacts:messageFacts,closedWorldRecent:closedWorldRecent,
    digest:digest}};
