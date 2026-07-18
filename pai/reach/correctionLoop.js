// ⬡B:reach.correction_loop:MODULE:founder_corrections_shape_future_decisions:20260711⬡
// THE CORRECTION LOOP. Doctrine, founder's own words: 'all reach funnels there while
// system is perfected... she indicates what SHOULD have been text vs call vs email
// and we correct the wall the LLM reads from.' Confirmed live: nothing did this
// before tonight -- FUNNELED_REACH decisions sat on the wall, reviewed or not, never
// looped back into future scoring. This closes that loop.
//
// SHAPE: cold code detects and applies (finding + matching corrections is
// mechanical, no judgment needed); AI deliberates only on whether a NEW correction
// generalizes into a standing rule or is a one-off exception -- the actual judgment
// call, kept honest per the self-audit this session (cold-code-as-wonder was the
// violation; this module puts deliberation exactly where a real decision is made).
'use strict';
// ⬡B:reach.correctionLoop:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}

var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
var GROQ = process.env.GROQ_API_KEY;
function rh() { return { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() }; }
function wh() { var h = rh(); h['Content-Profile'] = _schema(); h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; return h; }
function ymd() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

async function llm(system, user, tokens) {
  if (!GROQ) return null;
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL_C2 || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: tokens || 200, temperature: 0.2 })
    });
    var d = await r.json();
    return d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  } catch (e) { return null; }
}

// WRITE SIDE: the founder (via the command center 'talk to her about this' path, or
// direct) tells reach a specific FUNNELED_REACH decision should have gone a
// different way. Real deliberation: does this generalize (a standing rule change)
// or was this one specific case unusual? The AI's judgment rides the CORRECTION
// bead so the read side (below) can weigh generalizable corrections higher.
async function recordCorrection(hamUid, originalSource, shouldHaveBeenChannel, why) {
  if (!_bu() || !_bk() || !hamUid || !originalSource || !shouldHaveBeenChannel) {
    return { ok: false, reason: 'missing_fields' };
  }
  var HAM = String(hamUid).toUpperCase();
  var original = null;
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + HAM + '&source=eq.' + encodeURIComponent(originalSource) + '&select=content,summary', { headers: rh() });
    var rows = r.ok ? await r.json() : [];
    original = rows && rows[0];
  } catch (e) {}
  var originalChannel = 'unknown', importance = null;
  if (original) { try { var c = JSON.parse(original.content || '{}'); originalChannel = c.how || 'unknown'; importance = c.importance; } catch (e) {} }

  var generalizes = false, deliberation = '';
  var out = await llm(
    'You judge founder corrections to a reach system. Given what channel was proposed, what the founder says it should have been, and why, decide: does this correction describe a STANDING RULE (should apply to similar future decisions) or a ONE-OFF (this specific case only, do not generalize)? Reply exactly "STANDING: <one sentence rule>" or "ONE-OFF: <one sentence why>".',
    'Proposed channel: ' + originalChannel + ' (importance ' + importance + ')\nFounder says it should have been: ' + shouldHaveBeenChannel + '\nFounder\'s reason: ' + (why || 'none given'), 150);
  if (out) {
    generalizes = /^\s*STANDING/i.test(out);
    deliberation = out.replace(/^\s*(STANDING|ONE-OFF):\s*/i, '').trim();
  }

  await fetch(_bu() + '/rest/v1/' + _tbl() + '', { method: 'POST', headers: wh(), body: JSON.stringify({
    ham_uid: HAM, agent_global: 'REACH', stamp_type: 'CORRECTION',
    acl_stamp: '\u2b21B:reach.correction_loop:CORRECTION:channel_corrected:' + ymd() + '\u2b21',
    source: 'reach.correction.' + Date.now(),
    summary: '[REACH CORRECTION] ' + originalChannel + ' -> ' + shouldHaveBeenChannel + ' (' + (generalizes ? 'standing rule' : 'one-off') + ')',
    content: JSON.stringify({ originalSource: originalSource, originalChannel: originalChannel, importance: importance,
      correctedTo: shouldHaveBeenChannel, why: why || null, generalizes: generalizes, deliberation: deliberation }),
    importance: 6 }) }).catch(function () {});
  return { ok: true, generalizes: generalizes, deliberation: deliberation };
}

// READ SIDE: cold code, called before outreach.js finalizes a channel. Checks recent
// STANDING corrections that match this decision's shape (same original-channel
// tier, importance within 1). If the founder has corrected this shape before and
// judged it a standing rule, follow the correction instead of the static ladder.
// Pure lookup + match, no LLM needed here -- the judgment already happened at write time.
async function applyCorrections(hamUid, judgment, ladderChannel) {
  if (!_bu() || !_bk() || !hamUid) return ladderChannel;
  var HAM = String(hamUid).toUpperCase();
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + HAM
      + '&stamp_type=eq.CORRECTION&agent_global=eq.REACH&order=created_at.desc&limit=20&select=content', { headers: rh() });
    var rows = r.ok ? await r.json() : [];
    for (var i = 0; i < rows.length; i++) {
      var c = {}; try { c = JSON.parse(rows[i].content || '{}'); } catch (e) { continue; }
      if (!c.generalizes) continue;
      if (c.originalChannel !== ladderChannel) continue;
      if (typeof c.importance === 'number' && Math.abs(c.importance - (judgment.importance || 0)) > 1) continue;
      return c.correctedTo; // most recent matching standing correction wins
    }
  } catch (e) {}
  return ladderChannel;
}

module.exports = { recordCorrection: recordCorrection, applyCorrections: applyCorrections };
