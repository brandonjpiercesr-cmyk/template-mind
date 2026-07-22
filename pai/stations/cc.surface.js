// ⬡B:pai.stations.cc.surface:BUILD:agents_surface_to_command_center_via_real_CC_NOTE_beads:20260719⬡
// THE REAL COMMAND CENTER WIRE. The Command Center feed (/api/cc/list in anew's
// cc.api.routes) serves beads with stamp_type IN (DRAFT_PENDING, REMINDER, CC_NOTE) plus
// EXIT_DECISION rows marked EXIT COMMAND_CENTER. The proactive agents were calling
// outreach.outreachPassForHam(hamUid, {message,...}) -- but that function's real signature is
// (hamUid, force, options); the payload object was landing in the `force` arg and doing
// NOTHING, so no tip ever reached the desk. This helper writes the CORRECT bead the feed
// actually reads: a CC_NOTE. One shared door so every agent surfaces the same real way.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }
function ymd(){ return new Date().toISOString().slice(0,10).replace(/-/g,''); }

// Surface one item to the Command Center as a real CC_NOTE bead the feed serves. Fails open.
// agent = originating agent (HUNCH/DAWN/BURST...), title = short headline, body = detail,
// kind = 'tip'|'briefing'|'alert'|'founder' (the feed maps it to a display kind).
async function surfaceToCommandCenter(hamUid, agent, title, body, kind, importance) {
  try {
    var bead = {
      ham_uid: hamUid, agent_global: agent || 'ANEW',
      acl_stamp: '\u2b21B:cc.note:CC_NOTE:' + String(agent||'anew').toLowerCase() + '_to_desk:' + ymd() + '\u2b21',
      stamp_type: 'CC_NOTE',
      source: 'cc.note.' + String(hamUid).toLowerCase() + '.' + Date.now(),
      summary: '[CC NOTE] ' + String(title || body || '').slice(0, 120),
      content: JSON.stringify({ kind: kind || 'note', title: String(title||'').slice(0,160), body: String(body||'').slice(0), origin: agent }),
      importance: isFinite(importance) ? importance : 5,
      spawned_by: String(agent||'anew').toLowerCase() + '.cc.' + hamUid
    };
    var r = await fetch(_bu() + '/rest/v1/' + _tbl(), {
      method: 'POST',
      headers: { apikey:_bk(), Authorization:'Bearer '+_bk(), 'Content-Type':'application/json',
        'Content-Profile':_schema(), 'Accept-Profile':_schema(), Prefer:'return=minimal' },
      body: JSON.stringify(bead), signal: AbortSignal.timeout(8000)
    });
    return r && r.ok;
  } catch (e) { return false; }
}

module.exports = { surfaceToCommandCenter: surfaceToCommandCenter };
