// ⬡B:core.reachFunnel:MODULE:reversible_reach_funnel_to_command_center:20260708⬡
// THE REACH FUNNEL. Founder doctrine pt1 + pt6, 20260708, his own words:
// "for now... all reach funnels there [the CLAIR Command Center]... you reach out to
//  the command center with what you were going to say, the method, and why...
//  something simple, highly reversible, a little scaffold for a few days."
//
// WHAT IT IS: one brain-backed flag (FUNNEL_FLAG bead), cold code, same posture as the
// unified kill switch. When ON, reach that WOULD have fired (call/text) does not fire;
// instead the full decision -- WHAT she was going to say, HOW (the proposed channel),
// WHY (the judgment reason + importance), and proof the cycle ran -- lands as a
// FUNNELED_REACH bead that the CLAIR Command Center pins, so the founder judges her
// channel judgment against reality and corrects the wall. When OFF, reach behaves
// exactly as before. NOT a credential strip -- the February nuclear key-kill lesson.
//
// DIFFERENT FROM THE KILL SWITCH: the kill switch silences (nothing surfaces anywhere,
// safety stop). The funnel REDIRECTS (everything surfaces, in one reviewable place).
// Kill switch answers "stop talking to me." Funnel answers "show me what you WOULD
// have said, and how, so I can teach you."
//
// WONDER: entrance = who flipped it and why; exit = every funneled item carries the
// full decision; notes = the funneled bead itself is the note. Reversible via
// deactivate() or the 7-day auto-expiry (a temporary scaffold must not become a
// permanent silent state by accident -- same reasoning as the kill switch's 24h cap,
// longer here because the founder said "a few days").
'use strict';
// ⬡B:core.reachFunnel:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}


const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;
const MAX_HOURS = 7 * 24; // "a few days" -- auto-expires so it can never become forever by accident

function bh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { return Object.assign({}, bh(), { 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=representation' }); }

function exactRow(row, expected) {
  return !!(row && expected
    && row.ham_uid === expected.ham_uid
    && row.agent_global === expected.agent_global
    && row.stamp_type === expected.stamp_type
    && row.acl_stamp === expected.acl_stamp
    && row.source === expected.source
    && row.summary === expected.summary
    && row.content === expected.content
    && Number(row.importance) === Number(expected.importance));
}

// ⬡B:core.reachFunnel:GUARD:represented_exact_write_and_readback:20260715⬡
// A redirect is not real because PostgREST accepted bytes. It is real only
// when the represented row and a second exact HAM+source read agree with the
// full decision. This helper owns every funnel flag/item write so no sibling
// route can quietly return an optimistic success shape.
async function persistExact(row) {
  var post = await fetch(_bu() + '/rest/v1/' + _tbl(), {
    method:'POST', headers:wh(), body:JSON.stringify(row)
  });
  if (!post.ok) return { ok:false, reason:'funnel_write_failed_' + post.status };
  var represented = await post.json().catch(function () { return null; });
  if (!Array.isArray(represented) || represented.length !== 1
      || !exactRow(represented[0], row)) {
    return { ok:false, reason:'funnel_write_unrepresented' };
  }
  var read = await fetch(_bu() + '/rest/v1/' + _tbl()
    + '?ham_uid=eq.' + encodeURIComponent(row.ham_uid)
    + '&source=eq.' + encodeURIComponent(row.source)
    + '&select=id,ham_uid,agent_global,stamp_type,acl_stamp,source,summary,content,importance',
    { headers:bh() });
  if (!read.ok) return { ok:false, reason:'funnel_readback_failed_' + read.status };
  var rows = await read.json().catch(function () { return null; });
  if (!Array.isArray(rows) || rows.length !== 1 || !exactRow(rows[0], row)) {
    return { ok:false, reason:'funnel_readback_mismatch' };
  }
  return { ok:true, source:row.source, rowId:rows[0].id || represented[0].id || null,
    readback_verified:true };
}

async function isActive(hamUid) {
  if (!_bu() || !_bk() || !hamUid) return { active: false };
  try {
    const r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?stamp_type=eq.FUNNEL_FLAG&ham_uid=eq.' + encodeURIComponent(hamUid)
      + '&order=created_at.desc&limit=1&select=created_at,content', { headers: bh() });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return { active: false };
    let c = rows[0].content; try { c = JSON.parse(c); } catch (e) { c = {}; }
    if (c.deactivated) return { active: false };
    const ageHours = (Date.now() - new Date(rows[0].created_at).getTime()) / 3600000;
    if (ageHours > MAX_HOURS) return { active: false, expired: true };
    return { active: true, reason: c.reason || '', via: c.via || 'unknown', ageHours: Math.round(ageHours) };
  } catch (e) { return { active: false, error: e.message }; }
}

async function activate(hamUid, reason, via) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no_brain_or_ham' };
  try {
    const ts = Date.now();
    return await persistExact({
      ham_uid: String(hamUid).toUpperCase(), agent_global: 'OVERSEER', stamp_type: 'FUNNEL_FLAG',
      acl_stamp: '\u2b21B:core.reachFunnel:FUNNEL_FLAG:on:' + ts + '\u2b21',
      source: 'reachfunnel.flag.' + ts,
      summary: '[REACH FUNNEL ON] All reach now lands in the CLAIR Command Center with what/how/why. Reversible; auto-expires in 7 days.',
      content: JSON.stringify({ active: true, reason: reason || 'founder directive', via: via || 'api', activatedAt: new Date(ts).toISOString() }),
      importance: 8
    });
  } catch (e) { return { ok: false, error: e.message }; }
}

async function deactivate(hamUid, via) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no_brain_or_ham' };
  try {
    const ts = Date.now();
    return await persistExact({
      ham_uid: String(hamUid).toUpperCase(), agent_global: 'OVERSEER', stamp_type: 'FUNNEL_FLAG',
      acl_stamp: '\u2b21B:core.reachFunnel:FUNNEL_FLAG:off:' + ts + '\u2b21',
      source: 'reachfunnel.flag.' + ts,
      summary: '[REACH FUNNEL OFF] Reach behaves normally again.',
      content: JSON.stringify({ deactivated: true, via: via || 'api', deactivatedAt: new Date(ts).toISOString() }),
      importance: 7
    });
  } catch (e) { return { ok: false, error: e.message }; }
}

// Called by outreach when the funnel is ON and reach would otherwise have fired.
// Stamps the FULL decision so the command center can pin it: what, how, why, proof.
async function funnelInsteadOfSend(hamUid, judgment, proposedChannel, cycleProof) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false };
  try {
    const ts = Date.now();
    return await persistExact({
      ham_uid: String(hamUid).toUpperCase(), agent_global: 'ANEW', stamp_type: 'FUNNELED_REACH',
      acl_stamp: '\u2b21B:core.reachFunnel:FUNNELED_REACH:' + ts + '\u2b21',
      source: 'reachfunnel.item.' + ts,
      summary: '[FUNNELED] would have used ' + proposedChannel + ' (importance ' + (judgment.importance || '?') + '): ' + String(judgment.message || '').slice(0, 90),
      content: JSON.stringify({
        what: judgment.message || '',
        how: proposedChannel,
        why: judgment.reason || '',
        importance: judgment.importance,
        cycleProof: cycleProof || null,
        funneledAt: new Date(ts).toISOString()
      }),
      importance: Math.min(judgment.importance || 5, 7) // surfaces, never triggers reach math itself
    });
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { isActive, activate, deactivate, funnelInsteadOfSend };
