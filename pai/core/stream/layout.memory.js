// ⬡B:core.stream.layout_memory:BUILD:saved_dashboard_layouts_20260712⬡
// entered via the ABAHAM door, serving channel MESSAGES (her hands on the glass)
// SAVED LAYOUTS: the person names a set of pieces once ("this is my morning setup")
// and she reassembles it on command ("pull up my morning setup"). Stored as a real
// brain bead per-ham (stamp_type DASHBOARD_LAYOUT), read back by name. Nothing
// hardcoded, nothing invented: a layout is only ever the real pieces the person
// chose, and recall hollow-skips any piece whose data is empty at recall time.
'use strict';
// ⬡B:core.stream.layout.memory:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json', 'Content-Profile': _schema(), 'Accept-Profile': _schema() }; }

async function cancelled(options) {
  options = options || {};
  if (options.abortSignal && options.abortSignal.aborted) return true;
  if (typeof options.isCancelled !== 'function') return false;
  try { return await options.isCancelled() === true; } catch (e) { return true; }
}

// save a named layout (list of piece names) for a ham
async function save(hamUid, name, pieces, options) {
  options = options || {};
  if (!_bu() || !_bk() || !hamUid || !name || !Array.isArray(pieces) || !pieces.length) return { ok: false, reason: 'name and pieces required' };
  var clean = pieces.map(function (p) { return String(p).toLowerCase().trim(); }).filter(Boolean).slice(0, 6);
  if (!clean.length) return { ok: false, reason: 'no real pieces' };
  var body = [{ ham_uid: hamUid, agent_global: 'A_NU', stamp_type: 'DASHBOARD_LAYOUT',
    source: 'layout.' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
    summary: String(name).slice(0, 60), content: JSON.stringify({ name: name, pieces: clean }), importance: 4 }];
  if (await cancelled(options)) return { ok:false, reason:'voice_turn_cancelled' };
  var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: rh(),
    body: JSON.stringify(body), signal:options.abortSignal }).catch(function () { return null; });
  return { ok: !!(r && r.ok), name: name, pieces: clean };
}

// recall a layout by name (fuzzy on the stored name), returns the piece list or null
async function recall(hamUid, name) {
  if (!_bu() || !_bk() || !hamUid || !name) return null;
  var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=summary,content&ham_uid=eq.' + encodeURIComponent(hamUid)
    + '&stamp_type=eq.DASHBOARD_LAYOUT&order=created_at.desc&limit=20', { headers: rh() })
    .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  var want = String(name).toLowerCase().trim();
  var hit = null;
  (rows || []).forEach(function (r) {
    var nm = String(r.summary || '').toLowerCase();
    if (!hit && (nm === want || nm.indexOf(want) !== -1 || want.indexOf(nm) !== -1)) {
      try { hit = JSON.parse(r.content || '{}'); } catch (e) {}
    }
  });
  return hit && Array.isArray(hit.pieces) && hit.pieces.length ? hit.pieces : null;
}

// update a saved layout: add and/or remove pieces, re-save under the same name
async function update(hamUid, name, addPieces, removePieces, options) {
  options = options || {};
  if (!_bu() || !_bk() || !hamUid || !name) return { ok: false, reason: 'name required' };
  var current = await recall(hamUid, name);
  if (await cancelled(options)) return { ok:false, reason:'voice_turn_cancelled' };
  if (!current) return { ok: false, reason: 'no layout named that' };
  var set = current.slice();
  (addPieces || []).forEach(function (p) { var n = String(p).toLowerCase().trim(); if (n && set.indexOf(n) === -1) set.push(n); });
  (removePieces || []).forEach(function (p) { var n = String(p).toLowerCase().trim(); set = set.filter(function (x) { return x !== n; }); });
  set = set.slice(0, 6);
  if (!set.length) return { ok: false, reason: 'a layout cannot be empty' };
  return await save(hamUid, name, set, options);
}

// list saved layout names for a ham
async function list(hamUid) {
  if (!_bu() || !_bk() || !hamUid) return [];
  var rows = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=summary&ham_uid=eq.' + encodeURIComponent(hamUid)
    + '&stamp_type=eq.DASHBOARD_LAYOUT&order=created_at.desc&limit=20', { headers: rh() })
    .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  var seen = {}, names = [];
  (rows || []).forEach(function (r) { var n = String(r.summary || '').trim(); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; names.push(n); } });
  return names;
}

module.exports = { save, recall, list, update };
