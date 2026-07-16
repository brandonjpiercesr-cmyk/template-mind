// core/title.js
// ⬡B:core.title:MODULE:per_ham_title_variable:20260713⬡
//
// PER-HAM TITLE VARIABLE  (Architect's directive, 2026-07-13)
// -------------------------------------------------------------------------
// His words: "call me architect from now on... I like when you call me founder... when
// I'm in coding mode I want my girl to call me architect too... and I like founder
// everywhere else. And remember that has to be tricky because when we swap over the
// system... we got KJ and BJ and Aric and all of them, we wouldn't want them to be
// called that stuff. So there is a dynamic variable at play here, just to make sure
// that's not hardcoded."
//
// THE RULE, built exactly as intended:
//   - A per-HAM title, resolved from the brain, NEVER hardcoded to any identity.
//   - The CODING channel may carry a different title than everywhere else. For the
//     founder: Architect while coding, Founder everywhere else.
//   - A HAM with NO title bead gets NO title -- addressed by their name only. So
//     "Architect"/"Founder" can never leak onto Humbert, KJ, BJ, Eric, or any other
//     HAM when the system swaps worlds. UNIVERSALITY-clean by construction.
//
// STORAGE -- one HAM_TITLE bead per ham:
//   content = { default_title: "Founder", coding_title: "Architect" }   (either may be null)
// RESOLUTION:
//   coding channel  -> coding_title || default_title || null
//   other channels  -> default_title || null

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema(){ return process.env.BRAIN_SCHEMA || 'abacia_core'; }

// Channels that count as "coding mode" -- the command center / CCWA coding surface where
// the Architect builds with CLAIR. Everything else is an "everywhere else" channel.
var CODING_CHANNELS = ['ccwa', 'coding', 'command_center', 'clair', 'console'];

// Small TTL cache so this is one cheap read at most every few minutes per ham, not a
// brain hit every single turn. Titles change almost never.
var _cache = {}; // hamUid -> { at: ms, title: {default_title, coding_title} | null }
var TTL_MS = 5 * 60 * 1000;

async function _load(hamUid){
  var now = Date.now();
  var c = _cache[hamUid];
  if (c && (now - c.at) < TTL_MS) return c.title;
  var BU = _bu(), BK = _bk();
  if (!BU || !BK) return null;
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.HAM_TITLE&ham_uid=eq.' + encodeURIComponent(String(hamUid).toUpperCase())
      + '&select=content&order=created_at.desc&limit=1',
      { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': _schema() } });
    var rows = r.ok ? await r.json() : [];
    var title = null;
    if (rows && rows[0]) {
      try { title = JSON.parse(rows[0].content || 'null'); } catch(e) { title = null; }
    }
    _cache[hamUid] = { at: now, title: title };
    return title;
  } catch (e) {
    return null; // resolution failure must never break a turn -- fall back to name-only
  }
}

// Returns the resolved title string for this ham+channel, or null if none is configured.
async function resolveTitle(hamUid, channel){
  if (!hamUid) return null;
  var t = await _load(String(hamUid).toUpperCase());
  if (!t) return null;
  var isCoding = CODING_CHANNELS.indexOf(String(channel || '').toLowerCase()) !== -1;
  var chosen = isCoding ? (t.coding_title || t.default_title) : t.default_title;
  return (chosen && String(chosen).trim()) ? String(chosen).trim() : null;
}

module.exports = { resolveTitle, CODING_CHANNELS };
