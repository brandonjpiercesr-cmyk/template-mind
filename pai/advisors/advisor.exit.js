// ⬡B:advisors.advisor.exit:BUILD:shared_advisor_exit_rally_reconcile_and_cc_surface:20260719⬡
// THE ADVISOR EXIT. The advisors were fire-and-forget: each stamped a RESULT and stopped,
// never coming back to close its own loop, and never surfacing to the Command Center desk
// (so the founder never saw their work). This shared helper gives every advisor the same
// wonder-standard exit the proactive department got:
//   (1) SURFACE: an important advisor RESULT lands on the CC desk as a CC_NOTE the feed serves.
//   (2) RECONCILE (exit/rally): each cycle the advisor reviews its own recent RESULTs and
//       closes the ones now stale/superseded, so its lane on the desk does not pile up.
// One shared door so all advisors behave identically, never a per-file variation.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain'); }
function _schema(){ return process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core'); }
function ymd(){ return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function rh(){ return { apikey:_bk(), Authorization:'Bearer '+_bk(), 'Accept-Profile':_schema() }; }
function wh(){ var h=rh(); h['Content-Profile']=_schema(); h['Content-Type']='application/json'; h.Prefer='return=minimal'; return h; }

// (1) SURFACE an advisor result to the Command Center desk as a CC_NOTE the /api/cc/list feed
// serves. Only genuinely useful results should surface (the advisor decides importance).
async function surfaceToDesk(hamUid, advisor, title, body, importance) {
  try {
    var bead = { ham_uid:hamUid, agent_global:String(advisor||'ADVISOR').toUpperCase(),
      acl_stamp:'\u2b21B:cc.note:CC_NOTE:'+String(advisor||'advisor').toLowerCase()+'_to_desk:'+ymd()+'\u2b21',
      stamp_type:'CC_NOTE', source:'cc.note.'+String(hamUid).toLowerCase()+'.'+Date.now(),
      summary:'[CC NOTE] '+String(title||body||'').slice(0,120),
      content:JSON.stringify({ kind:'advisor', title:String(title||'').slice(0,160), body:String(body||'').slice(0), origin:advisor }),
      importance: isFinite(importance)?importance:5, spawned_by:String(advisor||'advisor').toLowerCase()+'.cc.'+hamUid };
    var r = await fetch(_bu()+'/rest/v1/'+_tbl(), { method:'POST', headers:wh(), body:JSON.stringify(bead), signal:AbortSignal.timeout(8000) });
    return r && r.ok;
  } catch(e){ return false; }
}

// (2) RECONCILE: review this advisor's own recent RESULTs; supersede the stale ones (older than
// a window, or superseded by a newer RESULT on the same topic) so its lane does not pile up.
// Judgment of "stale" is deterministic here (age + newer-same-source), cold code, fails open.
async function reconcile(hamUid, advisorGlobal) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+'?ham_uid=eq.'+String(hamUid).toUpperCase()
      + '&agent_global=eq.'+encodeURIComponent(advisorGlobal)
      + '&stamp_type=eq.RESULT&order=created_at.desc&limit=20&select=id,summary,content,created_at';
    var r = await fetch(url, { headers:rh(), signal:AbortSignal.timeout(9000) });
    var rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || rows.length < 2) return { reviewed:rows.length||0, closed:0 };
    // keep the newest; supersede older RESULTs beyond a keep-count or older than the window.
    var keep = parseInt(process.env.ADVISOR_KEEP_RESULTS,10); if (!isFinite(keep)) keep = 3;
    var windowMs = (parseInt(process.env.ADVISOR_STALE_DAYS,10)||14) * 24*3600*1000;
    var now = Date.now(), closed = 0;
    for (var i=0;i<rows.length;i++){
      var stale = (i >= keep) || (now - new Date(rows[i].created_at).getTime() > windowMs);
      if (!stale) continue;
      var c = {}; try { c = JSON.parse(rows[i].content||'{}'); } catch(e){}
      if (c && c._status === 'closed') continue;
      c._status = 'closed'; c._closed_at = new Date().toISOString();
      await fetch(_bu()+'/rest/v1/'+_tbl()+'?id=eq.'+rows[i].id, { method:'PATCH', headers:wh(),
        body:JSON.stringify({ content:JSON.stringify(c) }), signal:AbortSignal.timeout(8000) }).catch(function(){});
      closed++;
    }
    return { reviewed:rows.length, closed:closed };
  } catch(e){ return { reviewed:0, closed:0 }; }
}


// (3) RECONCILE DRAFT_PENDING (EBC-walled advisors: BDIF/GMG/MEDIATORS/MH_ACTION). These
// advisors already surface correctly via DRAFT_PENDING (the Command Center feed reads it
// directly) but NOTHING ever closed an old one -- every draft ever written was still sitting
// on the desk. This closes a DRAFT_PENDING once it is older than the keep window OR a newer
// DRAFT_PENDING from the same advisor has landed (superseded), so the desk does not fill with
// stale duplicate "N reply draft(s) ready" notes. Supersede-only, never delete.
async function reconcileDrafts(hamUid, advisorGlobal) {
  try {
    var url = _bu()+'/rest/v1/'+_tbl()+'?ham_uid=eq.'+String(hamUid).toUpperCase()
      + '&agent_global=eq.'+encodeURIComponent(advisorGlobal)
      + '&stamp_type=eq.DRAFT_PENDING&order=created_at.desc&limit=20&select=id,summary,content,created_at';
    var r = await fetch(url, { headers:rh(), signal:AbortSignal.timeout(9000) });
    var rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || rows.length < 2) return { reviewed:rows.length||0, closed:0 };
    var keep = parseInt(process.env.ADVISOR_KEEP_DRAFTS,10); if (!isFinite(keep)) keep = 1; // keep only the newest draft note live
    var windowMs = (parseInt(process.env.ADVISOR_DRAFT_STALE_DAYS,10)||3) * 24*3600*1000;
    var now = Date.now(), closed = 0;
    for (var i=0;i<rows.length;i++){
      var stale = (i >= keep) || (now - new Date(rows[i].created_at).getTime() > windowMs);
      if (!stale) continue;
      var c = {}; try { c = JSON.parse(rows[i].content||'{}'); } catch(e){}
      if (c && c.status === 'closed') continue;
      c.status = 'closed'; c._closed_at = new Date().toISOString(); c._closed_reason = 'superseded_or_stale';
      await fetch(_bu()+'/rest/v1/'+_tbl()+'?id=eq.'+rows[i].id, { method:'PATCH', headers:wh(),
        body:JSON.stringify({ content:JSON.stringify(c) }), signal:AbortSignal.timeout(8000) }).catch(function(){});
      closed++;
    }
    return { reviewed:rows.length, closed:closed };
  } catch(e){ return { reviewed:0, closed:0 }; }
}

module.exports = { surfaceToDesk:surfaceToDesk, reconcile:reconcile, reconcileDrafts:reconcileDrafts };
