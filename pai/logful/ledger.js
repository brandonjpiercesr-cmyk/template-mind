// ⬡B:logful.ledger:MODULE:grandmother_911_track_and_trace:20260724⬡
// THE GRANDMOTHER 911 LEDGER. Founder law, Governors Doctrine (Electrolytes drop,
// 20260723): "I need her to always be able to track and trace what she did, what she
// responded to, what cycle ran, where she had room for improvement, and what the next
// steps are, and which wonder is now owning this."
// Six fields, all required. A ledger entry with a missing field is refused loudly, never
// stored hollow: ok:false over a hollow stamp. Entries ride core/brain.client.writeBead,
// the edge-enforcing path, so ledger beads are never orphans and FIND can traverse the
// trail. This file only carries and refuses; the CONTENT of every field is the calling
// LLM's deliberation, never generated here. Every caller is door-resolved through ABAHAM
// before it reaches this file. The trail surfaces to a HAM only through the cycle and a
// real channel (CCWA board, portal); this file never reaches outbound itself.
// Spec: docs/specs/LOGFUL_WONDER_RECONSTRUCTION.md
'use strict';
var brain = require('../core/brain.client.js');

var SIX_FIELDS = ['did', 'respondedTo', 'cycle', 'improvement', 'nextSteps', 'owner'];

// entry: {hamUid, did, respondedTo, cycle, improvement, nextSteps, owner,
//         agent?, importance?, refSources?[],
//         ownerDisplay?, ownerReason?, ownerDecidedBy?}
// ⬡B:logful.ledger:WIRE:field_six_carries_its_own_provenance:20260726⬡
// Field six is a DECISION now, not a constant, so the entry carries who decided it
// and why: ownerDisplay is the roster's product-facing name, ownerReason is the
// deciding mind's one factual sentence, ownerDecidedBy is the model and provider
// that ruled. Three optional passthroughs, no field is invented here. A caller that
// supplies none still stores exactly what it always did.
// refSources: sources of the beads this work touched; each becomes a typed edge so the
// trail is walkable ("she asked my favorite color at a slow moment" traces to the wonder
// that decided it, the cycle that ran, and what it surfaced).
async function ledgerStamp(entry) {
  entry = entry || {};
  if (!entry.hamUid) return { ok: false, reason: 'ledgerStamp requires hamUid' };
  var missing = SIX_FIELDS.filter(function (f) {
    return entry[f] === undefined || entry[f] === null || String(entry[f]).trim() === '';
  });
  if (missing.length) {
    return { ok: false, reason: 'grandmother 911 refuses a hollow ledger entry, missing: ' + missing.join(', ') };
  }
  var ts = Date.now();
  var edges = [{ type: 'PRODUCED_BY', target: String(entry.owner) }];
  (Array.isArray(entry.refSources) ? entry.refSources : []).forEach(function (s) {
    if (s) edges.push({ type: 'RELATES_TO', target: String(s) });
  });
  if (entry.cycle) edges.push({ type: 'CAUSED_BY', target: 'cycle.' + String(entry.cycle) });
  try {
    var r = await brain.writeBead({
      hamUid: entry.hamUid,
      agentGlobal: entry.agent || 'LOGFUL',
      source: 'ham_' + String(entry.hamUid).toLowerCase() + '.logful.ledger.' + ts,
      type: 'LOGFUL',
      importance: entry.importance || 6,
      summary: '[LEDGER] ' + String(entry.did).slice(0, 70),
      content: {
        ledger: true,
        did: String(entry.did),
        respondedTo: String(entry.respondedTo),
        cycle: String(entry.cycle),
        improvement: String(entry.improvement),
        nextSteps: String(entry.nextSteps),
        owner: String(entry.owner),
        ownerDisplay: entry.ownerDisplay ? String(entry.ownerDisplay) : null,
        ownerReason: entry.ownerReason ? String(entry.ownerReason) : null,
        ownerDecidedBy: entry.ownerDecidedBy ? String(entry.ownerDecidedBy) : null,
        stampedAt: new Date(ts).toISOString()
      },
      edges: edges
    });
    return { ok: true, id: r && r.id, source: 'ham_' + String(entry.hamUid).toLowerCase() + '.logful.ledger.' + ts };
  } catch (e) { return { ok: false, reason: e.message }; }
}

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}

// Read the trail back, newest first. Fetch only; the caller deliberates. This is what the
// CCWA board, the advisors portal "what did you do and why", and her own next-cycle
// self-improvement read (she reads her own improvement field before she cooks again).
async function ledgerTrace(hamUid, limit) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no brain or no ham', trail: [] };
  var url = _bu() + '/rest/v1/' + _tbl() +
    '?ham_uid=eq.' + encodeURIComponent(hamUid) +
    '&stamp_type=eq.LOGFUL&source=like.*.logful.ledger.*&order=created_at.desc&limit=' + (limit || 50);
  try {
    var rows = await fetch(url, { headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() } })
      .then(function (r) { return r.ok ? r.json() : []; });
    var trail = (rows || []).map(function (row) {
      var c = row.content;
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
      return {
        source: row.source, at: row.created_at,
        did: c.did, respondedTo: c.respondedTo, cycle: c.cycle,
        improvement: c.improvement, nextSteps: c.nextSteps, owner: c.owner,
        ownerDisplay: c.ownerDisplay || null, ownerReason: c.ownerReason || null,
        ownerDecidedBy: c.ownerDecidedBy || null
      };
    }).filter(function (t) { return t.did; });
    return { ok: true, trail: trail };
  } catch (e) { return { ok: false, reason: e.message, trail: [] }; }
}

module.exports = { ledgerStamp: ledgerStamp, ledgerTrace: ledgerTrace, SIX_FIELDS: SIX_FIELDS };
