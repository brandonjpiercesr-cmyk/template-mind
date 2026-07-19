// ⬡B:pai.stations.span:BUILD:span_wonder_independent_thinking_station_C2_organ_B2:20260718⬡
// WONDER DOCTRINE build B2 (A'NU tracks it; CLAIR owns the code). SPAN is the worked
// example the doctrine (383016) uses to teach the three terms:
//   SPAN = a WONDER = an Independent Thinking Station = a C2 = an organ (one thing).
// The general law SPAN demonstrates: in a PAI cycle, EVERY agent and EVERY independent
// thinking station gets the chance to READ the full master FCW wall, then DECIDE if it
// has anything from its own cycle worth UPDATING as its version on that wall.
//
// SPAN is an ORGAN, not cold code: it THINKS with an LLM through the ONE ladder (never a
// rogue model call, never a banned host -- the boundary/ladder own that). Cold code here
// only does plumbing: read the wall it was handed, read SPAN's own last version, write
// the new version back. The JUDGMENT of "is there anything worth updating" is the organ's,
// per the doctrine that cold code is a helper and never a result.
//
// Entrance: called each PAI cycle with the assembled wall (the 6-contributor context).
// Exit: SPAN's version -- a short independent read of the situation -- returned to the
//   cycle and stamped as a versioned bead the next cycle can read. Or a quiet no-update
//   when SPAN has nothing new (silence over hollow).
// Notes: every version write is a bead with lineage, so SPAN self-heals and its
//   version history is greppable.

var ladder = require('../core/model.ladder.js');

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }

// Read SPAN's own most recent version off the wall (its last independent read).
async function readOwnVersion(hamUid) {
  try {
    var url = _bu() + '/rest/v1/' + _tbl() +
      '?select=id,summary,content,created_at&source=eq.span.station.version.' + String(hamUid).toUpperCase() +
      '&order=id.desc&limit=1';
    var r = await fetch(url, { headers: {
      apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema()
    }, signal: AbortSignal.timeout(8000) });
    var d = await r.json();
    return (Array.isArray(d) && d[0]) ? d[0] : null;
  } catch (e) { return null; }
}

// Write SPAN's new version back to the wall as a versioned bead with lineage.
async function writeVersion(hamUid, versionText, priorId) {
  try {
    var bead = {
      ham_uid: String(hamUid).toUpperCase(),
      agent_global: 'SPAN',
      stamp_type: 'STATION_VERSION',
      acl_stamp: '\u2b21B:span.station.version:STATION_VERSION:independent_thinking_station_read:' +
        new Date().toISOString().slice(0,10).replace(/-/g,'') + '\u2b21',
      source: 'span.station.version.' + String(hamUid).toUpperCase(),
      summary: '[SPAN] ' + versionText.slice(0, 280),
      importance: 5,
      spawned_by: 'span.station.cycle',
      content: JSON.stringify({ version: versionText, prior_version_id: priorId || null, at: Date.now() })
    };
    var r = await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Type': 'application/json',
        'Content-Profile': _schema(), 'Accept-Profile': _schema(), Prefer: 'return=representation' },
      body: JSON.stringify(bead), signal: AbortSignal.timeout(10000)
    });
    var d = await r.json();
    return (Array.isArray(d) && d[0]) ? d[0].id : null;
  } catch (e) { return null; }
}

// Compact the handed wall into the few facts SPAN thinks against -- plumbing, not judgment.
function summarizeWall(wall) {
  if (!wall) return '(no wall)';
  var c = wall.contributors || {};
  var present = Object.keys(c).filter(function (k) { return c[k]; });
  var focus = (wall.question || wall.questionFocus || '').toString().slice(0, 200);
  return 'wall contributors present: ' + present.join(', ') +
    '; resolved ' + (wall.contributorsResolved != null ? wall.contributorsResolved : '?') +
    '; current focus: ' + (focus || '(none)');
}

// THE ORGAN. SPAN reads the wall + its own last version and decides, by thinking,
// whether it has a new independent read worth posting. The decision is the LLM's.
// SPAN.run(wall, hamUid) -> { updated: bool, version: string|null, versionId: id|null }
async function run(wall, hamUid) {
  hamUid = hamUid || (wall && wall.hamUid) || process.env.HAM_UID;
  if (!hamUid) return { updated: false, version: null, reason: 'no_ham_uid' };

  var prior = await readOwnVersion(hamUid);
  var priorText = prior && prior.content
    ? (function () { try { return JSON.parse(prior.content).version; } catch (e) { return prior.summary; } })()
    : '(no prior version)';

  var system = 'You are SPAN, an Independent Thinking Station in a PAI cycle. You read the ' +
    'master context wall and hold ONE short independent read of the situation -- your ' +
    'version. Each cycle you decide whether anything changed enough to update your version. ' +
    'Reply with a JSON object only: {"updated": true|false, "version": "<=40 words"}. ' +
    'Set updated=false and repeat the prior version verbatim if nothing meaningful changed ' +
    '(silence over noise). Your version is a standing read, not a task list.';
  var user = 'WALL: ' + summarizeWall(wall) + '\nYOUR PRIOR VERSION: ' + priorText +
    '\nDecide: update your version, or keep it?';

  var out;
  try {
    out = await ladder.deliberate(system, user, { max_tokens: 200, temperature: 0.3, json: true, timeout: 20000 });
  } catch (e) { return { updated: false, version: priorText, reason: 'organ_error:' + e.message }; }

  var text = out && out.content != null ? out.content : (typeof out === 'string' ? out : '');
  var parsed = null;
  try { parsed = JSON.parse(String(text).replace(/```json|```/g, '').trim()); } catch (e) { parsed = null; }
  if (!parsed || typeof parsed.version !== 'string' || !parsed.version.trim()) {
    // organ gave nothing usable -> keep prior, quiet (fails open, silence over hollow)
    return { updated: false, version: priorText, reason: 'no_usable_read' };
  }
  if (parsed.updated === false || parsed.version.trim() === String(priorText).trim()) {
    return { updated: false, version: parsed.version.trim() };
  }
  var id = await writeVersion(hamUid, parsed.version.trim(), prior && prior.id);
  return { updated: true, version: parsed.version.trim(), versionId: id };
}

module.exports = { run: run, _test: { summarizeWall: summarizeWall, readOwnVersion: readOwnVersion } };
