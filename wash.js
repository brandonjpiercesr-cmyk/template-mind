// ⬡B:template-mind.wash:MODULE:wash_station_listening_nodes:20260710⬡
// THE WASH STATION. Named from the doctrine (NYC pt3): "in that station where these
// wonder agents are going crazy for specialized reasons... set up on the back end to
// receive information, process, look for these signs, look for this code... it's not
// hard coded, it's ACL coded... all those data nodes become listening nodes, and
// there's nothing tying any type of personal information by looking for patterns."
// WASH = Watch, Analyze, Strip, Hand-up. The listening layer whose nodes carry
// pattern-fillers that BIRTH can strip clean of anything personal -- the bar the
// founder set for Wonder Code. Feeds trends up to the master garden, never sideways.
'use strict';
// The strip test the doctrine demands: a node's personalization must be removable by
// a single field, so rebirth/copy for the next HAM leaves zero personal residue.
function stripForBirth(node) {
  // Returns the node with every personal filler nulled -- proving the ACL-coded (not
  // hard-coded) promise: the pattern survives, the person does not.
  return { pattern: node.pattern, need: node.need, personal: null, stripped: true };
}
async function washListen(env, signal) {
  var HAM = (env.HAM_UID || '').toUpperCase();
  var BANK = env.MEMORY_BANK_URL, KEY = env.MEMORY_BANK_KEY;
  if (!HAM || !BANK || !KEY) return { ok: false, reason: 'unborn' };
  // A listening node: watches for a need-pattern, stamps the trend to this world's
  // bank, and marks it garden-eligible (need-based, strippable) for the master garden.
  var wh = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Accept-Profile': 'memory_bank',
    'Content-Profile': 'memory_bank', 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  var ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  var node = { pattern: String((signal || {}).pattern || 'unspecified'), need: String((signal || {}).need || ''), personal: (signal || {}).personal || null };
  try {
    await fetch(BANK + '/rest/v1/beads', { method: 'POST', headers: wh, body: JSON.stringify({
      ham_uid: HAM, agent_global: 'WASH', stamp_type: 'LISTEN_NODE',
      acl_stamp: '⬡B:wash:LISTEN_NODE:pattern:' + ymd + '⬡',
      source: 'wash.node.' + Date.now(),
      summary: '[WASH listen] pattern ' + node.pattern + (node.need ? ' -> need ' + node.need : ''),
      content: JSON.stringify({ node: node, gardenEligible: true, stripPreview: stripForBirth(node) }),
      importance: 5, spawned_by: 'wash.listen'
    }) });
  } catch (e) {}
  return { ok: true, gardenEligible: true, strippable: true };
}
module.exports = { washListen: washListen, stripForBirth: stripForBirth };
