// ⬡B:core.truth_beacon:MODULE:typed_truth_beacon_registry:20260801⬡
// The one registry for evidence carriers that are allowed to call themselves truth beacons.
// A beacon is not a verdict and it never speaks. It binds one live observation to the
// capability that produced it, the seat that consumes it, and the cycle that asked for it.
'use strict';

const crypto=require('node:crypto');
function stableStringify(value){if(value===null)return'null';if(Array.isArray(value))return'['+
  value.map(stableStringify).join(',')+']';if(typeof value==='object')return'{'+
  Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+
  '}';return JSON.stringify(value);}
function digest(value){return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');}

const BEACONS = Object.freeze({
  'agent.find': Object.freeze({
    id:'agent.find',
    schema:'envolve.truth-beacon.agent-find.v1',
    stamp_type:'AGENT_FIND_TRUTH_BEACON',
    owner_node_id:'station.agent_find',
    producer:'core/agent.find.js',
    lifecycle:'active'
  })
});

function text(value, max) {
  const out = String(value || '').trim();
  return max ? out.slice(0, max) : out;
}

function ham(value) { return text(value, 160).toUpperCase(); }

function validId(value, max) {
  const out = text(value, max || 220);
  return !!out && /^[A-Za-z0-9._:-]+$/.test(out);
}

function parseContent(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function resolve(id) { return BEACONS[text(id)] || null; }

function buildAgentFindReceipt(input) {
  const beacon = resolve('agent.find');
  const value = input || {};
  const exactHam = ham(value.ham_uid);
  const cycleId = text(value.cycle_id, 220);
  const requestId = text(value.request_id, 220);
  const seatName = text(value.seat_name, 120);
  const seatNodeId = text(value.seat_node_id, 160);
  if (!exactHam || !validId(cycleId) || !validId(requestId) ||
      !validId(seatName, 120) || !validId(seatNodeId, 160)) {
    return {ok:false,reason:'agent_find_truth_beacon_identity_invalid'};
  }
  if (!value.wall || typeof value.wall !== 'object' || Array.isArray(value.wall) ||
      !value.employment_record || typeof value.employment_record !== 'object' ||
      Array.isArray(value.employment_record) ||
      !value.recent_cycle_truth || typeof value.recent_cycle_truth !== 'object' ||
      Array.isArray(value.recent_cycle_truth)) {
    return {ok:false,reason:'agent_find_truth_beacon_evidence_invalid'};
  }
  const observedAt = text(value.observed_at, 40) || new Date().toISOString();
  const core = {
    schema:beacon.schema,
    beacon_id:beacon.id,
    receipt_type:beacon.stamp_type,
    status:'READY_FOR_DELIBERATION',
    ham_uid:exactHam,
    cycle_id:cycleId,
    request_id:requestId,
    channel:text(value.channel, 80) || 'unknown',
    seat_name:seatName,
    seat_node_id:seatNodeId,
    observed_at:observedAt,
    employment_record_sha256:digest(value.employment_record),
    wall_sha256:digest(value.wall),
    recent_cycle_truth_sha256:digest(value.recent_cycle_truth),
    wall:value.wall,
    recent_cycle_truth:value.recent_cycle_truth,
    privacy:value.privacy && typeof value.privacy === 'object' && !Array.isArray(value.privacy)
      ? value.privacy : undefined
  };
  const content = Object.assign({}, core, {receipt_sha256:digest(core)});
  const source = 'agent.find.' + exactHam + '.' + digest({
    cycle_id:cycleId, request_id:requestId, seat_name:seatName,
    seat_node_id:seatNodeId, receipt_sha256:content.receipt_sha256
  });
  const edges = [
    {type:'PRODUCED_BY',target:beacon.owner_node_id},
    {type:'SERVES',target:seatNodeId},
    {type:'BINDS_CYCLE',target:'pai.cycle.' + cycleId},
    {type:'READS_WALL',target:'ham.' + exactHam + '.fcw'},
    {type:'RETURNS_TO',target:seatNodeId}
  ];
  return {ok:true,beacon:beacon,source:source,content:content,edges:edges,spec:{
    hamUid:exactHam,agentGlobal:'AGENT_FIND',source:source,type:beacon.stamp_type,
    summary:'[AGENT FIND] truth beacon bound ' + seatName + ' to ' + cycleId,
    content:content,importance:6,edges:edges,abcdTag:beacon.stamp_type
  }};
}

function validateAgentFindRow(row, expected) {
  const beacon = resolve('agent.find');
  const content = parseContent(row && row.content);
  if (!row || row.stamp_type !== beacon.stamp_type || row.agent_global !== 'AGENT_FIND' ||
      !content || content.schema !== beacon.schema || content.beacon_id !== beacon.id ||
      content.receipt_type !== beacon.stamp_type || content.status !== 'READY_FOR_DELIBERATION') {
    return {ok:false,reason:'agent_find_truth_beacon_row_invalid'};
  }
  const receipt = Object.assign({}, content);
  delete receipt.receipt_sha256;
  delete receipt.edges;
  if (!/^[a-f0-9]{64}$/.test(String(content.receipt_sha256 || '')) ||
      digest(receipt) !== content.receipt_sha256) {
    return {ok:false,reason:'agent_find_truth_beacon_digest_invalid'};
  }
  const want = expected || {};
  if (want.source && row.source !== want.source ||
      want.ham_uid && ham(row.ham_uid) !== ham(want.ham_uid) ||
      want.cycle_id && content.cycle_id !== want.cycle_id ||
      want.request_id && content.request_id !== want.request_id ||
      want.seat_name && content.seat_name !== want.seat_name ||
      want.seat_node_id && content.seat_node_id !== want.seat_node_id) {
    return {ok:false,reason:'agent_find_truth_beacon_binding_mismatch'};
  }
  const edges = Array.isArray(row.edges) ? row.edges : content.edges;
  const required = [
    ['PRODUCED_BY', beacon.owner_node_id],
    ['SERVES', content.seat_node_id],
    ['BINDS_CYCLE', 'pai.cycle.' + content.cycle_id],
    ['READS_WALL', 'ham.' + content.ham_uid + '.fcw'],
    ['RETURNS_TO', content.seat_node_id]
  ];
  if (!Array.isArray(edges) || required.some(function (pair) {
    return !edges.some(function (edge) {
      return edge && edge.type === pair[0] && edge.target === pair[1];
    });
  })) return {ok:false,reason:'agent_find_truth_beacon_edges_invalid'};
  return {ok:true,content:content,edges:edges};
}

function validateRegistry() {
  const reasons = [];
  Object.keys(BEACONS).forEach(function (id) {
    const beacon = BEACONS[id];
    if (beacon.id !== id) reasons.push(id + ':id_mismatch');
    if (!validId(beacon.schema, 160)) reasons.push(id + ':schema_invalid');
    if (!/^[A-Z][A-Z0-9_]+$/.test(beacon.stamp_type)) reasons.push(id + ':stamp_type_invalid');
    if (!validId(beacon.owner_node_id, 160)) reasons.push(id + ':owner_invalid');
    if (beacon.lifecycle !== 'active') reasons.push(id + ':not_active');
  });
  return {ok:reasons.length === 0,count:Object.keys(BEACONS).length,reasons:reasons};
}

module.exports = {BEACONS:BEACONS,resolve:resolve,buildAgentFindReceipt:buildAgentFindReceipt,
  validateAgentFindRow:validateAgentFindRow,validateRegistry:validateRegistry,
  _test:{parseContent:parseContent,validId:validId}};
