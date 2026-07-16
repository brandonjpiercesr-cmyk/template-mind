// core/capabilities.js
// ⬡B:core.capabilities:MODULE:wonder_surface_awareness:20260713⬡
//
// CAPABILITY SELF-AWARENESS  (from the Wonder rehaul, 2026-07-13)
// -------------------------------------------------------------------------
// The rehaul mapped every ask into 12 Wonders and seeded them as WONDER beads in the
// brain (?stamp_type=eq.WONDER). This module reads that registry so A'NU actually KNOWS
// her own surface: what she can do right now, and what is still a gap. Without this she
// either hallucinates a capability she does not have, or goes silent on it. With it, she
// names the gap honestly ("I cannot scan your calendar yet, I have logged it") and the
// tracker records it. The registry is the source of truth; this is the read side of it.
//
// UNIVERSALITY: WONDER beads are ham_uid SYSTEM (they describe the system, not a person),
// so every HAM's cycle sees the same surface. Safe no-op if the brain is down.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema(){ return process.env.BRAIN_SCHEMA || 'abacia_core'; }

var _cache = null, _at = 0;
var TTL_MS = 10 * 60 * 1000; // the registry changes rarely; read it at most every 10 min

// Returns { can: [short labels], cannot: [short gap labels] } or null.
async function loadSurface(){
  var now = Date.now();
  if (_cache && (now - _at) < TTL_MS) return _cache;
  var BU = _bu(), BK = _bk();
  if (!BU || !BK) return null;
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.WONDER&select=summary,content&order=importance.desc&limit=20',
      { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': _schema() } });
    var rows = r.ok ? await r.json() : [];
    var can = [], cannot = [];
    (rows || []).forEach(function(row){
      var c = {};
      try { c = JSON.parse(row.content || '{}'); } catch(e) {}
      if (!c.wonder || c.wonder === undefined) return;      // skip the _INDEX bead
      var caps = String(c.capabilities || '').split(',')[0].trim(); // lead capability, short
      if (c.status === 'LIVE') { if (caps) can.push(caps); }
      else if (Array.isArray(c.gaps)) {
        c.gaps.forEach(function(g){ cannot.push(String(g).split(':')[0].split('--')[0].trim().slice(0, 60)); });
      }
    });
    _cache = { can: can, cannot: cannot };
    _at = now;
    return _cache;
  } catch (e) { return null; }
}

// A compact prompt line: what she can do, and the honest gap posture. Kept short so it
// never bloats the wall. Returns '' if the registry is unavailable.
async function capabilityLine(){
  var s = await loadSurface();
  if (!s) return '';
  var out = [];
  if (s.can.length) out.push('You can do these directly: ' + s.can.slice(0, 8).join('; ') + '.');
  if (s.cannot.length) out.push('You cannot do these YET (say so plainly and log it, never fake it or go silent): ' + s.cannot.slice(0, 6).join('; ') + '.');
  return out.join(' ');
}

module.exports = { loadSurface, capabilityLine };
