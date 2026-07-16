// ⬡B:logful.index:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
// ⬡B:logful.index:MODULE:logful_backbone:20260630⬡
// ⬡B:logful.index:FIX:logfulStore_export_added:20260630⬡
// LOGFUL -- the backbone. Everything that gets stored is LOGFUL.
// When WRAPSMITH saves a session, it goes to LOGFUL.
// When IMAN processes email, it goes to LOGFUL.
// When TASTE captures audio, it goes to LOGFUL.
// When agents produce first-person meeting minutes, they go to LOGFUL.
// LOGFUL is the difference between a system that forgets and a system that learns.
//
// CLAIR Phase 2 fix: agents/session1.logful.js was writing to global.brain.beads
// (in-memory only, lost on every restart). 4 callers were silently losing all data.
// All callers use { logfulStore } import shape -- this file now exports that name.

// Every caller of logfulStore is itself door-resolved (ABAHAM) before it ever reaches
// this file, and everything stored here eventually surfaces back out through a real
// channel to a HAM (MESSAGES, CHATTER, RESULT) -- LOGFUL is the backbone underneath
// those channels, not a channel-facing file itself.
async function logfulStore(entry) {
  // entry: {hamUid, data, summary?, importance?, agent?, type?}
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return { ok: false, reason: 'no brain' };
  var ts = Date.now();
  var hamUid = entry.hamUid || entry.ham_uid || 'SYSTEM';
  var agent = entry.agent || 'LOGFUL';
  var entryType = entry.type || 'entry';
  var summary = entry.summary || (entry.data && typeof entry.data === 'object' ? JSON.stringify(entry.data).slice(0, 80) : String(entry.data || '').slice(0, 80));
  var rawContent = typeof entry.data === 'string' ? entry.data : (entry.data || {});
  // ⬡B:logful.index:WIRE:lineage_on_the_backbone:20260712⬡
  // Two Command Centers step 4: this is the real chokepoint (57 callers funnel through
  // logfulStore, RIDER/TAP are separate agent-specific writers, not this backbone). One
  // wire here covers the vast majority of LOGFUL beads with lineage + audience, instead
  // of touching every caller. LOGFUL's own doc: "everything stored here eventually
  // surfaces back out through a real channel to a HAM" -- so this IS the reach path.
  var content;
  try {
    var lin = require('../core/lineage.attach.js');
    var payload = (typeof rawContent === 'object' && rawContent !== null) ? rawContent : { data: rawContent };
    content = JSON.stringify(lin.attachLineage(payload, {
      chain: [agent, 'LOGFUL'], deliveredBy: agent, why: summary.slice(0, 160),
      // caller can force user-facing with entry.audience = 'user'; default builder,
      // since most LOGFUL writes are internal system memory, not founder-facing.
      audience: entry.audience === 'user' ? 'user' : 'builder'
    }));
  } catch (eLin) { content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent); }
  var bead = {
    ham_uid: hamUid,
    agent_global: agent,
    acl_stamp: '⬡B:logful.' + String(entryType).toLowerCase() + ':RESULT:stored:20260630⬡',
    stamp_type: entry.stampType || 'RESULT', // ⬡B:logful.index:FIX:optional_stamp_type:20260703⬡ CHATTER and others opt in via entry.stampType; every existing caller that never sets it keeps getting RESULT exactly as before, nothing here changes for them.
    source: 'logful.' + String(entryType).toLowerCase() + '.' + ts,
    content: content,
    summary: '[LOGFUL] ' + summary.slice(0, 80),
    importance: entry.importance || 5
  };
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST',
      headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(bead)
    }).then(function(x) { return x.json(); });
    return { ok: true, id: (r[0] || {}).id };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Legacy alias -- store() still works for any code that called it directly
var store = logfulStore;

module.exports = { logfulStore: logfulStore, store: store };
