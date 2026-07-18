// ⬡B:core.rooms:MODULE:phase4_instant_communication:20260709⬡
// INSTANT COMMUNICATION. Business Plan Doctrine pt1, the founder's double-exclamation
// 911: "each level streaming back up to the level before it... the element that
// commissioned that spot could be sending new orders... they can have a conversation
// with their peers running in loop... They commission a safe space."
//
// THE SHAPE (digest-checkpoint, per the cost research: ~1.2-1.5x tokens, not the
// 5-10x of raw context mirroring): a commissioned room is a lineage-scoped strand in
// the Memory Bank. Stations POST compact working-state digests at cycle checkpoints
// (upward streaming). The commissioner reads the room on ITS wake and can INJECT
// orders mid-run. Peers in the same lineage read and speak in the same room.
// Consumption is wired at the ONE chokepoint every station cycle passes through,
// the same pattern the self-reminder law proved.
'use strict';
// ⬡B:core.rooms:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}

var BU = process.env.AIBE_BRAIN_URL;
var BK = process.env.AIBE_BRAIN_KEY;
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }; }

async function stamp(hamUid, agent, type, source, summary, content, importance) {
  // ⬡B:core.rooms:WIRE:local_stamp_copy_was_an_orphan_factory:20260718⬡
  // Founder-caught 20260718. This is one of EIGHT local stamp() copies
  // (ham-contact, dispatch, tracker, cycle.handoff, rooms, outreach, synthesize,
  // outbound.trace), each raw-fetching the bead table and each born edgeless. Every
  // bead they write lands in a 337,987-row graph as an orphan. rooms.stamp() alone
  // produces the ROOM_DIGEST / ROOM / ROOM_ORDER orphans.
  // Same lesson as the door repair (⬡B:core.brain_client:WIRE:
  // the_antiorphan_throw_made_the_orphans:20260718⬡): GUARANTEE lineage, do not
  // demand it. agent and source are always in scope here, so PRODUCED_BY is always
  // derivable and never a guess -- it names who wrote the bead. content.room, when
  // present, is a real prior bead id, so RELATES_TO points at it. Vocabulary is
  // REQUIRED_EDGE_TYPES per CODA's ruling 20260717 (bead 365943): RELATES_TO /
  // PRODUCED_BY / CAUSED_BY, not the JD's contains/related_to/part_of.
  var _edges = [{ type: 'PRODUCED_BY', target: 'pai.agent.' + String(agent || 'unknown').toLowerCase() }];
  if (content && content.room) _edges.push({ type: 'RELATES_TO', target: content.room });
  return fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: wh(), body: JSON.stringify({
    ham_uid: hamUid, agent_global: agent, stamp_type: type,
    acl_stamp: '\u2b21B:core.rooms:' + type + ':' + Date.now() + '\u2b21',
    source: source, summary: summary.slice(0, 200), edges: _edges,
    content: JSON.stringify(content || {}), importance: importance || 5 }) });
}

// 4.1 Commission a room: lineage-scoped safe space.
async function openRoom(hamUid, commissioner, station, purpose) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var id = 'room.' + String(station).toLowerCase() + '.' + Date.now();
  var w = await stamp(hamUid, String(commissioner).toUpperCase(), 'ROOM', id,
    '[ROOM OPEN] ' + commissioner + ' commissioned ' + station + ': ' + (purpose || ''),
    { commissioner: commissioner, station: station, lineage: [commissioner, station], purpose: purpose || null, status: 'open' }, 7);
  return { ok: w.ok, room: id };
}

// 4.2 Upward streaming: station posts a compact digest at a checkpoint.
async function postDigest(hamUid, room, station, digest, checkpoint) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var w = await stamp(hamUid, String(station).toUpperCase(), 'ROOM_DIGEST',
    room + '.digest.' + Date.now(),
    '[UP ' + (checkpoint || 'checkpoint') + '] ' + String(digest).slice(0, 150),
    { room: room, station: station, checkpoint: checkpoint || null, digest: String(digest).slice(0, 1200) }, 5);
  return { ok: w.ok };
}

// 4.2 Commissioner injects an order mid-run.
async function injectOrder(hamUid, room, commissioner, order) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var w = await stamp(hamUid, String(commissioner).toUpperCase(), 'ROOM_ORDER',
    room + '.order.' + Date.now(),
    '[ORDER] ' + String(order).slice(0, 160),
    { room: room, from: commissioner, order: String(order).slice(0, 800), consumed: false }, 8);
  return { ok: w.ok };
}

// 4.3 Read the room: digests + orders + peer talk, newest first.
async function readRoom(hamUid, room, limit) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain', items: [] };
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=like.' + encodeURIComponent(room) + '*'
      + '&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&order=created_at.desc&limit=' + (limit || 20)
      + '&select=agent_global,stamp_type,summary,content,created_at,source', { headers: rh() });
    var rows = r.ok ? await r.json() : [];
    return { ok: true, items: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { ok: false, reason: e.message, items: [] }; }
}

// Consumption at the chokepoint: pending unconsumed orders for a station's rooms,
// folded into the cycle intent, then marked consumed (supersede-only PATCH).
async function pendingOrders(hamUid, station) {
  if (!_bu() || !_bk()) return [];
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.ROOM_ORDER'
      + '&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&source=like.room.' + encodeURIComponent(String(station).toLowerCase()) + '.*'
      + '&order=created_at.asc&limit=5&select=id,source,summary,content', { headers: rh() });
    var rows = r.ok ? await r.json() : [];
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var c = {}; try { c = JSON.parse(rows[i].content || '{}'); } catch (e) {}
      if (c.consumed) continue;
      out.push({ id: rows[i].id, source: rows[i].source, order: c.order || rows[i].summary, content: c });
    }
    return out;
  } catch (e) { return []; }
}

async function markConsumed(orderRow) {
  try {
    var c = orderRow.content || {}; c.consumed = true; c.consumedAt = new Date().toISOString();
    await fetch(_bu() + '/rest/v1/' + _tbl() + '?id=eq.' + orderRow.id,
      { method: 'PATCH', headers: wh(), body: JSON.stringify({ content: JSON.stringify(c) }) });
  } catch (e) {}
}

module.exports = { openRoom: openRoom, postDigest: postDigest, injectOrder: injectOrder,
  readRoom: readRoom, pendingOrders: pendingOrders, markConsumed: markConsumed };
