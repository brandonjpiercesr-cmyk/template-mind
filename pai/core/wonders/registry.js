// ⬡B:core.wonders.registry:MODULE:critical_operational_graph_v1:20260720⬡
// This is the machine-resolvable ownership spine for the first Great Reset
// vertical slice. It extends the mounted Wonder Agent anatomy with operational
// owners, authority, cycle, gates, and honest lifecycle state.
// The ABAHAM door resolves HAM before this graph is consulted. Outbound work
// must follow each node's registered return gate to an authorized channel.
'use strict';

const contract = require('./contract.js');

function wire(target, type) {
  return { type: type || 'code', target: target };
}

const NODES = [
  {
    id:'wonder.anu', display_name:"A'NU", kind:'wonder', lifecycle:'active',
    owner_wonder_id:null, reports_to:null, ham_scope:'dynamic',
    technical_role:'Resolve the HAM, convene the governed mind, and return through the active face.',
    product_role:'Embodied life assistant and final product voice.',
    cycle:{triggers:['ham.turn','wonder.result'],coordinator:'station.pai'},
    context_policy:'context.anu.full.v1', authority_policy:'authority.anu.v1',
    return_gate:'gate.ham.active_channel',
    metadata:{wiring:[wire('anu.index.js'),wire('routes/chat.bridge.routes.js')]}
  },
  {
    id:'station.agent_find', display_name:'Agent FIND', kind:'wonder_agent', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'station.pai', ham_scope:'inherited',
    technical_role:'Bind the complete world wall and recent cycle truth to the requesting seat before deliberation.',
    product_role:'The decoder navigator that makes sure each seated mind wakes in the right world and job.',
    cycle:{triggers:['seat.wake','ham.turn'],coordinator:'station.pai'},
    context_policy:'context.agent_find.per_seat_fcw.v1',
    authority_policy:'authority.agent_find.read_bind_stamp_only.v1',
    return_gate:'gate.ham.active_channel',metadata:{wiring:[wire('core/agent.find.js#bindWall'),
      wire('core/find.js#find'),wire('core/fcw.builder.js#buildMemoryBank'),
      wire('core/truth.beacon.js'),wire('core/tool.loop.js#runPAI')],truth_beacon_id:'agent.find'}
  },
  {
    id:'station.pai', display_name:'PAI', kind:'independent_thinking_station', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'wonder.anu', ham_scope:'inherited',
    technical_role:'Run the interactive council, tools, steps, and cycle receipt.',
    product_role:"A'NU's governed reasoning and action cycle.",
    cycle:{triggers:['ham.turn','subordinate.hitch'],coordinator:'station.pai'},
    context_policy:'context.pai.full.v1', authority_policy:'authority.pai.v1',
    return_gate:'gate.ham.active_channel', metadata:{wiring:[wire('core/tool.loop.js#runPAI')],
      agent_find:{recent_truth:[{stamp_type:'CYCLE_STEP',source_prefix:'pai.cycle.',limit:12}]}}
  },
  {
    id:'station.coda', display_name:'CODA', kind:'independent_thinking_station', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'station.pai', ham_scope:'inherited',
    technical_role:'Lead coding judgment, evidence review, bounded dispatch, and repair disposition.',
    product_role:'Head of the coding department.',
    cycle:{triggers:['coding.ask','roadmap.activated','incident.normalized'],coordinator:'station.pai'},
    context_policy:'context.coda.bcw.v1', authority_policy:'authority.coda.r0_r3_policy_r4_human.v1',
    return_gate:'gate.coda.result',
    metadata:{wiring:[wire('advisors/coding.js'),wire('core/coda/mind.js'),
      wire('core/coda/wall.js'),wire('core/tool.loop.js#consult_coda')],
      agent_find:{recent_truth:[{stamp_type:'CODA_WONDER_RESULT',source_prefix:'coda.result.',limit:6}]}}
  },
  {
    id:'agent.span', display_name:'SPAN', kind:'wonder_agent', lifecycle:'contained',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Decompose approved roadmaps into bounded, owned, dependency-aware tasks.',
    product_role:'Coding department planner and coordinator.',
    cycle:{triggers:['coda.plan.approved'],coordinator:'station.coda'},
    context_policy:'context.span.task.v1', authority_policy:'authority.span.plan_only.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('coding-department/span/span.js')]}
  },
  {
    id:'agent.mace', display_name:'MACE', kind:'wonder_agent', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Read owned repositories and execute scope-bound grants through isolated branches and draft PRs.',
    product_role:'Coding department implementation hands.',
    cycle:{triggers:['span.task.approved'],coordinator:'station.coda'},
    context_policy:'context.mace.task.v1', authority_policy:'authority.mace.r2_r3_consumed_grant.v1',
    return_gate:'gate.coda.result',
    metadata:{wiring:[wire('core/coda/hands.js'),wire('core/coda/approval.store.js'),
      wire('core/tool.loop.js#consult_mace'),wire('MACE_URL','service_env')]}
  },
  {
    id:'guardian.canon', display_name:'CANON', kind:'guardian', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Grade code, Wonder constraints, split boundaries, tests, and acceptance evidence.',
    product_role:'Coding department release gate.',
    cycle:{triggers:['patch.ready','pr.updated'],coordinator:'station.coda'},
    context_policy:'context.canon.diff.v1', authority_policy:'authority.canon.verdict_only.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('routes/canon.routes.js'),wire('core/canon.js')]}
  },
  {
    id:'guardian.clair', display_name:'CLAIR', kind:'guardian', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'wonder.anu', ham_scope:'inherited',
    technical_role:'Watch governed cycles, contradictions, stalls, and evidence gaps without taking the worker seat.',
    product_role:'Outside watcher and escalation layer.',
    cycle:{triggers:['cycle.started','cycle.stalled','gate.failed'],coordinator:'station.pai'},
    context_policy:'context.clair.watch.v1', authority_policy:'authority.clair.observe_escalate.v1',
    return_gate:'gate.clair.command_center',
    metadata:{wiring:[wire('routes/three-ray.routes.js'),wire('routes/clair.console.routes.js')]}
  },
  {
    id:'station.wonder_games', display_name:'Wonder Games', kind:'independent_thinking_station', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Classify code ownership, Wonder fit, and pre-build contract impact.',
    product_role:'Junior coding fraternity and Wonder classifier.',
    cycle:{triggers:['code.proposed','capability.requested'],coordinator:'station.coda'},
    context_policy:'context.wonder_games.case.v1', authority_policy:'authority.wonder_games.recommend.v1',
    return_gate:'gate.coda.result',
    metadata:{wiring:[wire('core/wonder.games.js'),wire('routes/wonder.games.routes.js')]}
  },
  {
    id:'station.cookoff', display_name:'Coding Cookoff', kind:'independent_thinking_station', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Produce and compare implementation proposals when consequence justifies the cost.',
    product_role:'Senior coding proposal competition.',
    cycle:{triggers:['coda.cookoff.requested'],coordinator:'station.coda'},
    context_policy:'context.cookoff.problem.v1', authority_policy:'authority.cookoff.propose_only.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('routes/cookoff.routes.js')]}
  },
  {
    id:'sensor.github', display_name:'GitHub Sensor', kind:'sensor', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Receive verified repository events and reconcile current repository truth.',
    product_role:"CODA's GitHub eyes.",
    cycle:{triggers:['github.webhook','github.reconcile.tick'],coordinator:'station.coda'},
    context_policy:'context.sensor.github.v1', authority_policy:'authority.sensor.read_only.v1',
    return_gate:'gate.coda.sensor_event',
    metadata:{wiring:[wire('core/coda/github.sensor.js'),wire('core/webhook.guard.js#verifyGithub'),
      wire('routes/coda.sensor.routes.js')]}
  },
  {
    id:'sensor.render', display_name:'Render Sensor', kind:'sensor', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Read service, deploy, health, and targeted log evidence without mutating infrastructure.',
    product_role:"CODA's Render eyes.",
    cycle:{triggers:['render.webhook','render.reconcile.tick'],coordinator:'station.coda'},
    context_policy:'context.sensor.render.v1', authority_policy:'authority.sensor.read_only.v1',
    return_gate:'gate.coda.sensor_event',
    metadata:{wiring:[wire('core/coda/render.sensor.js'),wire('core/tools/render.logs.js'),
      wire('core/tools/render.deploy.js#getServiceDetails'),wire('core/webhook.guard.js#verifyRender'),
      wire('routes/coda.sensor.routes.js')]}
  },
  {
    id:'tool.github.patch', display_name:'GitHub Patch Tool', kind:'tool', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'agent.mace', ham_scope:'inherited',
    technical_role:'Commit a complete approved file replacement to an isolated branch.',
    product_role:"A'NU's protected code-writing hand.",
    cycle:{triggers:['mace.patch.approved'],coordinator:'station.coda'},
    context_policy:'context.tool.patch.v1', authority_policy:'authority.mutation.r2.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/tools/github.fix.js')]}
  },
  {
    id:'tool.github.pr', display_name:'GitHub Draft PR Tool', kind:'tool', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'agent.mace', ham_scope:'inherited',
    technical_role:'Expose one exact isolated branch as a read-back verified draft PR.',
    product_role:"A'NU's protected review hand.",
    cycle:{triggers:['mace.branch.graded'],coordinator:'station.coda'},
    context_policy:'context.tool.pr.v1', authority_policy:'authority.mutation.r3.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/tools/github.pr.js')]}
  },
  {
    id:'tool.github.merge', display_name:'GitHub Merge Tool', kind:'tool', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'guardian.canon', ham_scope:'inherited',
    technical_role:'Merge one exact reviewed PR head through protected main after explicit R4 grant.',
    product_role:"A'NU's protected publication hand.",
    cycle:{triggers:['pr.review.approved'],coordinator:'station.coda'},
    context_policy:'context.tool.merge.v1', authority_policy:'authority.mutation.r4.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/tools/github.merge.js')]}
  },
  {
    id:'tool.render.deploy', display_name:'Render Deploy Tool', kind:'tool', lifecycle:'contained',
    owner_wonder_id:'station.coda', reports_to:'agent.mace', ham_scope:'system',
    technical_role:'Trigger and observe an approved deployment for one registered service.',
    product_role:"A'NU's protected deploy hand.",
    cycle:{triggers:['repair.merge.verified'],coordinator:'station.coda'},
    context_policy:'context.tool.deploy.v1', authority_policy:'authority.mutation.r4.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/tools/render.deploy.js')]}
  },
  {
    id:'tool.render.rollback', display_name:'Render Rollback Tool', kind:'tool', lifecycle:'contained',
    owner_wonder_id:'station.coda', reports_to:'guardian.canon', ham_scope:'system',
    technical_role:'Return one registered service to a verified last-known-good deploy under explicit authority.',
    product_role:'Production recovery hand.',
    cycle:{triggers:['repair.verify.failed'],coordinator:'station.coda'},
    context_policy:'context.tool.rollback.v1', authority_policy:'authority.mutation.r4.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/deploy.guard.js#rollbackToLastGood')]}
  },
  {
    id:'wonder.inbox_zero', display_name:'Inbox Zero', kind:'wonder', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'station.pai', ham_scope:'dynamic',
    technical_role:'For one advisor world resolved as a parameter, read every unread email in full (thread, sent, attachments), check that advisor\'s own IMB, judge with the LLM organ what each needs, draft owed replies in the principal\'s voice, and rest them in the Command Center. Escalations route backward to the Overseer; nothing sends by the cycle.',
    product_role:'The universal per-advisor inbox-zero cycle, one source for every world.',
    cycle:{triggers:['inbox.review.requested','schedule.daily.world'],coordinator:'station.pai'},
    context_policy:'context.advisor.world.v1', authority_policy:'authority.draft_only.overseer_clears_reach.v1',
    return_gate:'gate.ham.active_channel',
    metadata:{universal:true, one_source:true, wiring:[wire('core/inbox.zero.js#runInboxZero'),
      wire('reach/iman.js#getThread'), wire('routes','via index.js registerInboxZero')]}
  },
  {
    id:'sensor.deploy_sentinel', display_name:'Deploy Sentinel', kind:'sensor', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'system',
    technical_role:'Proactive freshness heartbeat: compare the running commit to main HEAD and provider deploy state; stamp stuck-ness as deduplicated evidence into the sensor-event gate. Senses only; never deploys, never reaches.',
    product_role:"CODA's eyes on whether merged work actually went live.",
    cycle:{triggers:['sentinel.heartbeat','operator.ask'],coordinator:'station.coda'},
    context_policy:'context.sensor.event.v1', authority_policy:'authority.gate.accept_only.v1',
    return_gate:'gate.coda.sensor_event',
    metadata:{wiring:[wire('core/deploy.sentinel.js#runSentinel')],
      doctrine:'the mind that senses is not the mind that fixes; findings submit back to CODA, whose cycle dispatches the hand'}
  },
  {
    id:'tool.render.hook_deploy', display_name:'Render Deploy-Hook Hand', kind:'tool', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'system',
    technical_role:'POST one env-configured Render Deploy Hook; the least-privilege deploy hand, capable only of triggering a deploy of the configured branch.',
    product_role:"CODA's everyday muscle to make a merge actually go live.",
    cycle:{triggers:['coda.dispatch.deploy'],coordinator:'station.coda'},
    context_policy:'context.tool.deploy.v1', authority_policy:'authority.mutation.r2.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/tools/render.hook.deploy.js#triggerViaHook')]}
  },
  {
    id:'gate.coda.sensor_event', display_name:'CODA Sensor Event Gate', kind:'gate', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.coda', ham_scope:'inherited',
    technical_role:'Accept normalized, deduplicated, read-only operational evidence.',
    product_role:"CODA's incoming operational mailbox.",
    cycle:{triggers:['sensor.event.normalized'],coordinator:'station.coda'},
    context_policy:'context.sensor.event.v1', authority_policy:'authority.gate.accept_only.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/coda/sensor.store.js')]}
  },
  {
    id:'gate.coda.approval', display_name:'CODA Approval Gate', kind:'gate', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.pai', ham_scope:'inherited',
    technical_role:'Bind proposal, risk, scope, grant, one-time consumption, and terminal result to exact HAM receipts.',
    product_role:"The accountable boundary around A'NU's coding hands.",
    cycle:{triggers:['mutation.proposed','mutation.granted','mutation.completed'],coordinator:'station.coda'},
    context_policy:'context.approval.scope.v1', authority_policy:'authority.gate.persist_only.v1',
    return_gate:'gate.coda.result', metadata:{wiring:[wire('core/coda/approval.store.js'),
      wire('core/coda/hands.js'),wire('core/coda/preflight.store.js'),
      wire('routes/coda.hands.routes.js')]}
  },
  {
    id:'gate.coda.result', display_name:'CODA Result Gate', kind:'gate', lifecycle:'active',
    owner_wonder_id:'station.coda', reports_to:'station.pai', ham_scope:'inherited',
    technical_role:'Persist a terminal coding result and return it to its parent cycle.',
    product_role:"CODA's durable return path.",
    cycle:{triggers:['wonder.result'],coordinator:'station.pai'},
    context_policy:'context.result.readback.v1', authority_policy:'authority.gate.persist_only.v1',
    return_gate:'gate.ham.active_channel',
    metadata:{wiring:[wire('core/coda/result.store.js'),wire('routes/coda.mind.routes.js')]}
  },
  {
    id:'gate.ham.active_channel', display_name:'HAM Active Channel Gate', kind:'gate', lifecycle:'active',
    owner_wonder_id:'wonder.anu', reports_to:'wonder.anu', ham_scope:'dynamic',
    technical_role:'Return authorized results through the channel that owns the active HAM turn.',
    product_role:'The final path back to the person.',
    cycle:{triggers:['cycle.result.ready'],coordinator:'station.pai'},
    context_policy:'context.ham.channel.v1', authority_policy:'authority.gate.deliver.v1',
    return_gate:'gate.ham.active_channel', metadata:{wiring:[wire('core/tool.loop.js#runPAI')]}
  },
  {
    id:'gate.clair.command_center', display_name:'CLAIR Command Center Gate', kind:'gate', lifecycle:'active',
    owner_wonder_id:'guardian.clair', reports_to:'wonder.anu', ham_scope:'inherited',
    technical_role:'Expose builder-facing evidence and lineage without becoming decision authority.',
    product_role:'Outside operational view.',
    cycle:{triggers:['builder.result'],coordinator:'station.pai'},
    context_policy:'context.clair.command_center.v1', authority_policy:'authority.gate.read_only.v1',
    return_gate:'gate.ham.active_channel', metadata:{wiring:[wire('routes/three-ray.routes.js')]}
  }
];

const BY_ID = Object.create(null);
NODES.forEach(function (node) { BY_ID[node.id] = Object.freeze(node); });

const SHARED_MISSION='Turn real world truth into governed, proactive human service through the complete PAI cycle.';
const PERSONA_BASE=Object.freeze({lines:Object.freeze([
  'You are a working seat inside ENVOLVE, powered by Proactive Assisting Intelligence.',
  'Use the evidence in this world, stay inside your registered authority, and return through your gate.'
])});
const AGENT_FIND_LEGS=Object.freeze({
  'station.agent_find':Object.freeze({persona:{differentia:'You decode and navigate the complete wall before another seat thinks.',temperament:'Fast, literal, silent, and exact about provenance.'},jd:{summary:'Bind the complete FCW, recent truth, and employment record to one requesting seat before deliberation.',duties:['Run canonical FIND reads.','Preserve every FCW contributor.','Stamp and verify one typed truth beacon.'],never:['Never call a model.','Never decide what evidence means.','Never turn an unavailable read into empty truth.']},goals:['Every deliberation starts from a complete, seat-bound wall.'],toolbelt:['tool.brain.find'],may_summon:[],may_recommend:[],wakes:['station.pai','station.coda'],hands_to:['station.pai','station.coda']}),
  'station.pai':Object.freeze({persona:{differentia:'You coordinate the governed reasoning cycle.',temperament:'Deliberate and evidence led.'},jd:{summary:'Run the interactive PAI cycle end to end.',duties:['Read the world wall.','Use governed tools and councils.','Return through the active channel.'],never:['Never invent unavailable evidence.']},goals:['Complete each admitted cycle with durable truth.'],toolbelt:['tool.brain.find'],may_summon:['station.coda'],may_recommend:['guardian.clair'],wakes:['station.coda'],hands_to:['gate.ham.active_channel']}),
  'station.coda':Object.freeze({persona:{differentia:'You lead coding judgment and repair disposition.',temperament:'Exact, practical, and verification hungry.'},jd:{summary:'Convert evidence-backed coding work through the governed coding cycle.',duties:['Read exact repair evidence.','Choose a typed disposition.','Return through the CODA result gate.'],never:['Never claim a repair without source and readback.']},goals:['Every admitted repair reaches a durable disposition.'],toolbelt:['tool.brain.find'],may_summon:['agent.span','agent.mace'],may_recommend:['guardian.clair'],wakes:['agent.span','agent.mace'],hands_to:['gate.coda.result']})
});

function personaBase() { return {lines:PERSONA_BASE.lines.slice()}; }
function sharedMission() { return SHARED_MISSION; }

function resolve(id) {
  const raw=BY_ID[String(id||'')]||null,legs=raw&&AGENT_FIND_LEGS[raw.id];
  return raw&&legs?Object.assign({},raw,legs):raw;
}

function list(options) {
  const opts = options || {};
  return NODES.filter(function (node) {
    if (opts.lifecycle && node.lifecycle !== opts.lifecycle) return false;
    if (opts.owner_wonder_id && node.owner_wonder_id !== opts.owner_wonder_id) return false;
    if (opts.kind && node.kind !== opts.kind) return false;
    return true;
  }).slice();
}

function validateRegistry() {
  const reasons = [];
  const seen = new Set();
  NODES.forEach(function (node) {
    if (seen.has(node.id)) reasons.push('duplicate_node:' + node.id);
    seen.add(node.id);
    const checked = contract.validateNode(node);
    checked.reasons.forEach(function (reason) { reasons.push(node.id + ':' + reason); });
    if (node.owner_wonder_id && !BY_ID[node.owner_wonder_id]) reasons.push(node.id + ':unknown_owner:' + node.owner_wonder_id);
    if (node.reports_to && !BY_ID[node.reports_to]) reasons.push(node.id + ':unknown_reports_to:' + node.reports_to);
    if (node.return_gate && !BY_ID[node.return_gate]) reasons.push(node.id + ':unknown_return_gate:' + node.return_gate);
  });
  return { ok:reasons.length === 0, contract_version:contract.VERSION, count:NODES.length, reasons:reasons };
}

function snapshot() {
  return {
    contract_version:contract.VERSION,
    validation:validateRegistry(),
    nodes:list().map(function (node) { return JSON.parse(JSON.stringify(node)); })
  };
}

// ⬡B:core.wonders.registry:BUILD:departments_derived_never_twinned:20260731⬡
// The wonder-department view, DERIVED from the one registry rather than a second
// hand-maintained org chart. Every owner chain in this registry tops out at one executive
// root, so grouping by root collapses the whole estate into a single useless block. The
// real department heads are the STATIONS: a node's department is the nearest node in its
// owner chain (itself included) whose kind is station; nodes with no station above them
// form the executive department under their root. Cycles cannot loop (each id visits once).
// Measured on this template: 24 nodes across 4 stations.
//
// This lands here because the paired core/tool.loop.js exposes a read_wonder_departments
// tool that calls registry.departments(). That file is byte-identical with the canonical
// side by law, so the template inherited the tool in the same window. Without this
// function the inherited tool would have answered ok:false forever, which is a hollow
// tool wearing a working tool's name. The implementation is kept identical to the
// canonical side so the two never drift into two behaviours under one name.
function departmentRoot(node) {
  var STATION = 'independent_thinking_station';
  // Nearest station STRICTLY above wins; a station with no station above is its own
  // department head; everything else rolls up to the executive root.
  var current = node, hops = 0, seen = {}, root = node;
  while (current && hops < 16) {
    if (current !== node && current.kind === STATION) return current;
    root = current;
    var ownerId = current.owner_wonder_id;
    if (!ownerId || ownerId === current.id || seen[ownerId]) break;
    seen[current.id] = true;
    var owner = BY_ID[ownerId];
    if (!owner) break;
    current = owner;
    hops++;
  }
  if (node.kind === STATION) return node;
  return root;
}

function departments() {
  var groups = {};
  NODES.forEach(function (node) {
    var root = departmentRoot(node);
    var key = root.id;
    if (!groups[key]) {
      groups[key] = { department_id: root.id, department_name: root.display_name || root.id,
        members: [] };
    }
    groups[key].members.push({ id: node.id, name: node.display_name || node.id,
      kind: node.kind, lifecycle: node.lifecycle,
      role: node.product_role || node.technical_role || '' });
  });
  return Object.keys(groups).sort().map(function (key) { return groups[key]; });
}

module.exports = {
  CONTRACT_VERSION:contract.VERSION,
  resolve:resolve,
  list:list,
  validateRegistry:validateRegistry,
  snapshot:snapshot,
  departments:departments,
  personaBase:personaBase,
  sharedMission:sharedMission,
  _test:{departmentRoot:departmentRoot}
};
