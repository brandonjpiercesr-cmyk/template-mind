// ⬡B:logful.index:WIRE:funneled_20260713⬡
// ⬡B:logful.index:FIX:derive_table_and_schema_from_the_selected_bank_signal:20260722⬡
// The backbone must land in whichever bank is actually selected. The URL/key already
// prefer the live memory bank (MEMORY_BANK_* over the retired AIBE_BRAIN_*); the table and
// schema now derive from the SAME signal, exactly as core/brain.client.js (the proven live
// writer) does: when MEMORY_BANK_URL is set the world is the live bank (memory_bank.beads),
// otherwise the retired brain (abacia_core.aibe_brain). Before this, table/schema hardcoded
// the retired defaults, so any inherited world that set only MEMORY_BANK_URL/KEY (a fresh
// template deploy, a per-HAM born world) would silently POST every memory-of-work bead to a
// abacia_core.aibe_brain table that does not exist in its live project and lose it. The
// founder's own world only escaped because its env pins BEAD_TABLE/BRAIN_SCHEMA explicitly;
// a stranger's world inherits the template, not that env. LOGFUL is "the difference between a
// system that forgets and a system that learns" -- it must remember in every world, not one.
// ⬡B:logful.index:911:the_backbone_date_was_frozen_at_20260630:20260726⬡
// Every bead LOGFUL has ever written carried the literal date 20260630, hand-typed
// into the acl_stamp below, so the whole memory-of-work backbone claimed to have
// been stamped on one day in June no matter when it actually ran. A stamp whose date
// is a constant cannot be traced, which is the exact opposite of what the backbone
// is for. The date now comes from the one canonical stamp builder
// (core/brain.client.js buildStamp), which is also where the four-colon law is held,
// so LOGFUL and every other writer share one stamp source instead of two.
var _brainStamp = require('../core/brain.client.js').buildStamp;
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}
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
  if (!_bu() || !_bk()) return { ok: false, reason: 'no brain' };
  var ts = Date.now();
  var hamUid = entry.hamUid || entry.ham_uid || 'SYSTEM';
  var agent = entry.agent || 'LOGFUL';
  var entryType = entry.type || 'entry';
  var summary = entry.summary || (entry.data && typeof entry.data === 'object' ? JSON.stringify(entry.data).slice(0, 80) : String(entry.data || '').slice(0, 80));
  var rawContent = typeof entry.data === 'string' ? entry.data : (entry.data || {});
  var tiers = require('../core/privacy/people.tier.js');
  var readAuthority = entry.readAuthority;
  if (!tiers.isReadAuthority(readAuthority, hamUid)) {
    readAuthority = await tiers.resolveReadTier(null, hamUid);
  }
  var memoryTier = tiers.effectiveTier(readAuthority && readAuthority.tier);
  var privacy = tiers.buildEnvelope(tiers.MARKS.UNCLASSIFIED, memoryTier,
    'exact-HAM LOGFUL memory follows the reader people tier', 'logful');
  // ⬡B:logful.index:WIRE:lineage_on_the_backbone:20260712⬡
  // Two Command Centers step 4: this is the real chokepoint (57 callers funnel through
  // logfulStore, RIDER/TAP are separate agent-specific writers, not this backbone). One
  // wire here covers the vast majority of LOGFUL beads with lineage + audience, instead
  // of touching every caller. LOGFUL's own doc: "everything stored here eventually
  // surfaces back out through a real channel to a HAM" -- so this IS the reach path.
  var content;
  try {
    var lin = require('../core/lineage.attach.js');
    var payload = (typeof rawContent === 'object' && rawContent !== null)
      ? Object.assign({}, rawContent) : { data: rawContent };
    payload.privacy = privacy;
    content = JSON.stringify(lin.attachLineage(payload, {
      chain: [agent, 'LOGFUL'], deliveredBy: agent, why: summary.slice(0, 160),
      // caller can force user-facing with entry.audience = 'user'; default builder,
      // since most LOGFUL writes are internal system memory, not founder-facing.
      audience: entry.audience === 'user' ? 'user' : 'builder'
    }));
  } catch (eLin) {
    var fallbackPayload = (typeof rawContent === 'object' && rawContent !== null)
      ? Object.assign({}, rawContent) : { data: rawContent };
    fallbackPayload.privacy = privacy;
    content = JSON.stringify(fallbackPayload);
  }
  var bead = {
    ham_uid: hamUid,
    agent_global: agent,
    acl_stamp: _brainStamp('logful.' + String(entryType).toLowerCase(), 'RESULT', 'stored'),
    stamp_type: entry.stampType || 'RESULT', // ⬡B:logful.index:FIX:optional_stamp_type:20260703⬡ CHATTER and others opt in via entry.stampType; every existing caller that never sets it keeps getting RESULT exactly as before, nothing here changes for them.
    source: 'logful.' + String(entryType).toLowerCase() + '.' + ts,
    content: content,
    summary: '[LOGFUL] ' + summary.slice(0, 80),
    acl_tier: memoryTier,
    importance: entry.importance || 5
  };
  if (_tbl() !== 'aibe_brain') bead.spawned_by = 'logful';
  try {
    // ⬡B:logful.index:FIX:http_error_is_not_success:20260724⬡ An HTTP error body
    // parsed as JSON used to return ok:true while the bead was silently lost, the
    // exact silent-memory-loss class the 20260722 bank fix was written about.
    var res = await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST',
      headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(bead)
    });
    if (!res.ok) return { ok: false, error: 'brain_write_http_' + res.status };
    var r = await res.json();
    return { ok: true, id: (r[0] || {}).id };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Legacy alias -- store() still works for any code that called it directly
var store = logfulStore;

module.exports = { logfulStore: logfulStore, store: store };
