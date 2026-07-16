// ⬡B:coding-department.bcw:WIRE:funneled_world_agnostic_20260712⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
// ⬡B:coding-department.bcw:WIRE:relay_law_from_canonical_contract:20260715⬡
var codingRelay = require('../core/coding.relay.contract.js');
// ⬡B:coding-department.bcw:MODULE:building_context_window_port:20260712⬡
// THE BCW, Building Context Window, ported to this system (it lived on the deprecated
// canew service). It arms a build BEFORE it starts: it packs the live doctrine, the
// standards, the burn book of past mistakes, the proof checklist, and a pathway scan
// (what already exists on the topic) so existing ground gets upgraded, never twinned.
// When the founder chats in the CLAIR command center in coding mode, she is handed
// this armory so her answers are grounded in how this system actually builds. Enhance
// it by sharpening what it pulls; every future coding turn sharpens with it, no deploy.
//
// IDENTITY: system-scoped. It arms builds for whichever HAM is passed by the caller;
// identity resolves through the ABAHAM door upstream, never hardcoded here.
//
// REACH PATH TO A HAM: this armory reaches the founder (a HAM) two ways. It is consumed
// by the CLAIR command center coding-mode chat (routes/chat.bridge.routes.js), which arms
// her PAI cycle with this context before she answers him in that channel; and GET /bcw
// below exposes it as its own HAM-facing endpoint to any lane or human. It is never
// a dead-end module: every assembly ends up in front of the founder through the chat.

function bh() {
  var BK = process.env.AIBE_BRAIN_KEY;
  return { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Accept-Profile': _schema() };
}

var BCW_READ_TIMEOUT_MS = parseInt(process.env.BCW_READ_TIMEOUT_MS || '4000', 10);

async function pull(name, query, limit) {
  try {
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?' + query + '&order=created_at.desc&limit=' + (limit || 6) + '&select=summary,source,content,created_at',
      { headers: bh(), signal: AbortSignal.timeout(BCW_READ_TIMEOUT_MS) });
    if (!r.ok) return { ok:false, available:false, name:name, reason:'http_error',
      status:r.status || null, rows:[] };
    var rows = await r.json();
    if (!Array.isArray(rows)) return { ok:false, available:false, name:name,
      reason:'invalid_payload', rows:[] };
    return { ok:true, available:true, name:name, rows:rows };
  } catch (e) {
    return { ok:false, available:false, name:name,
      reason:e && (e.name === 'TimeoutError' || e.name === 'AbortError')
        ? 'timeout' : 'transport_error', rows:[] };
  }
}

function hamFilter(hamUid) {
  return hamUid ? '&ham_uid=eq.' + encodeURIComponent(String(hamUid).toUpperCase()) : '';
}

function rowLine(b, max) {
  return '- ' + (b.source ? b.source + ': ' : '') + String(b.summary || '').slice(0, max || 260);
}

function packLine(b) {
  var detail = '';
  try {
    var content = typeof b.content === 'string' ? JSON.parse(b.content) : b.content;
    if (content && typeof content === 'object') {
      detail = content.text || content.law || content.instructions || content.scan_recipe || '';
      if (detail && typeof detail !== 'string') detail = JSON.stringify(detail);
    }
  } catch (e) {}
  return rowLine(b, 360) + (detail ? '\n  ' + String(detail).slice(0, 900) : '');
}

function newestBySource(rows) {
  var seen = {};
  return (rows || []).filter(function (row) {
    var key = row.source || ('row.' + JSON.stringify(row));
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function isTranscriptTask(row) {
  return /^span\.task\.transcript\./i.test(String(row && row.source || ''));
}

function topicNamesTranscript(topic, row) {
  var q = String(topic || '').toLowerCase();
  if (!q) return false;
  var words = String(row && row.summary || '').toLowerCase().match(/[a-z0-9_'-]{5,}/g) || [];
  var stop = { about:1, action:1, items:1, source:1, transcript:1, system:1, roadmap:1 };
  var matches = words.filter(function (word) { return !stop[word] && q.indexOf(word) !== -1; });
  return matches.length >= 2;
}

function historicalRoadmap(row) {
  return /\b(?:named\s*,?\s*not built|not built|zero implementation|zero code exists|does not exist)\b/i
    .test(String(row && row.summary || '') + ' ' + String(row && row.content || ''));
}

function roadmapLine(row) {
  if (historicalRoadmap(row)) return '- ' + (row.source || 'roadmap')
    + ': Historical roadmap snapshot. Current implementation status is withheld until newer receipts and live repository evidence are reconciled.';
  return rowLine(row, 320);
}

// Assemble the armory. topic is optional; when given, the pathway scan focuses on it.
// hamUid is optional for backward compatibility, but every live coding entrance passes it.
async function assembleBCW(topic, hamUid) {
  if (!_bu() || !_bk()) return { ok:false, reason:'bcw_brain_unconfigured', bcw:'',
    hamUid:hamUid || null, availability:{ configured:false } };
  var t = String(topic || '').trim();

  // The doctrine has always named bcw.pack.* as the source of truth, but this port
  // never queried those rows. Pull the real packs plus per-HAM roadmap/SPAN state.
  // Global packs stay global; roadmap and sequencing evidence stay isolated by HAM.
  var reads = await Promise.all([
    pull('packs', 'source=like.bcw.pack.*', 16),
    pull('doctrine', 'stamp_type=eq.DOCTRINE', 5),
    pull('burns', 'or=(stamp_type.eq.LESSON,stamp_type.eq.CORRECTION,stamp_type.eq.BURN)', 8),
    pull('standards', 'or=(source.ilike.*writing_standard*,source.ilike.*build_law*,source.ilike.*standard*)', 4),
    pull('roadmaps', 'stamp_type=eq.ROADMAP' + hamFilter(hamUid), 4),
    pull('span', 'agent_global=eq.SPAN' + hamFilter(hamUid), 6),
    t ? pull('pathway', 'summary=ilike.*' + encodeURIComponent(t.slice(0, 30)) + '*' + hamFilter(hamUid), 6)
      : Promise.resolve({ ok:true, available:true, name:'pathway', rows:[], skipped:true })
  ]);
  var unavailable = reads.filter(function (read) { return !read || read.available !== true; });
  var availability = {};
  reads.forEach(function (read) {
    if (!read || !read.name) return;
    availability[read.name] = { available:read.available === true,
      reason:read.reason || null, status:read.status || null,
      count:Array.isArray(read.rows) ? read.rows.length : 0,
      skipped:read.skipped === true };
  });
  if (unavailable.length) return { ok:false, reason:'bcw_evidence_unavailable', bcw:'',
    hamUid:hamUid || null, unavailable:unavailable.map(function (read) {
      return { name:read && read.name || 'unknown', reason:read && read.reason || 'unknown',
        status:read && read.status || null };
    }), availability:availability };
  var rows = reads.map(function (read) { return read.rows; });
  var packs = newestBySource(rows[0]).slice(0, 10), doctrine = rows[1], burns = rows[2], standards = rows[3];
  var roadmaps = rows[4], span = rows[5].filter(function (row) {
    return !isTranscriptTask(row) || topicNamesTranscript(t, row);
  }), pathway = rows[6];

  var parts = [];
  parts.push('=== BUILDING CONTEXT WINDOW (you are armed before you build) ===');
  parts.push('CODING RELAY LAW: ' + codingRelay.line());
  if (packs.length) parts.push('LIVE BCW PACKS (source of truth):\n' + packs.map(packLine).join('\n'));
  // ⬡B:coding-department.bcw:FIX:truncation_was_gutting_doctrine_20260713⬡
  // Founder-caught live: a coding-mode answer on the 90/10 law came back
  // confidently wrong even though the real doctrine was in this pull. Root
  // cause, measured against production: real DOCTRINE summaries run 900-1400
  // chars (dense, several clauses each); slicing to 150 cut every one of them
  // off mid-sentence before the actual answer ever appeared, every single
  // time, for every doctrine. Only 5 DOCTRINE beads get pulled at all, so the
  // cost of showing them close to whole is small and the cost of truncating
  // them to noise was the real bug. Burns/standards get more room too, same
  // reasoning at smaller scale; pathway stays tight since it is a scan, not
  // a read.
  if (doctrine.length) parts.push('LIVE DOCTRINE (obey it -- if asked about a named law or doctrine by name, state its actual definition precisely from what is below, never paraphrase loosely into your own words):\n' + doctrine.map(function (b) { return '- ' + (b.summary || ''); }).join('\n'));
  parts.push('THE FLOOR (non-negotiable): no scaffold, no stub, no hardcoded identity, no rogue orphan, no cold code that is not wired to a wonder, no em dash in output, honor the ABAHAM door, run through the council and CANON, verify it persists before calling it done.');
  if (burns.length) parts.push('BURN BOOK (mistakes already made, never repeat):\n' + burns.map(function (b) { return '- ' + (b.summary || '').slice(0, 220); }).join('\n'));
  if (standards.length) parts.push('STANDARDS:\n' + standards.map(function (b) { return '- ' + (b.summary || '').slice(0, 200); }).join('\n'));
  if (roadmaps.length || span.length) parts.push('LIVE SPAN AND ROADMAP EVIDENCE (SPAN decides sequence; never silently substitute your own ranking):\n'
    + roadmaps.map(roadmapLine).concat(span.map(function (b) { return rowLine(b, 320); })).join('\n'));
  parts.push('PATHWAY SCAN' + (t ? ' for "' + t + '"' : '') + ' (CHECK FIRST, upgrade what exists, never build a duplicate):\n' + (pathway.length ? pathway.map(function (b) { return '- exists: ' + (b.source || '') + ' -- ' + (b.summary || '').slice(0, 150); }).join('\n') : '- no existing work found on this topic; still search the code before building.'));
  parts.push('PROOF CHECKLIST before you ship: council PASS, CANON_PASS or GAP, boots clean, persisted in origin/main, deployed live.');

  var bcw = parts.join('\n\n');
  return { ok: true, bcw: bcw, chars: bcw.length, hamUid: hamUid || null,
    availability: availability,
    packs: { named: packs.length, doctrine: doctrine.length, burns: burns.length,
      standards: standards.length, roadmaps: roadmaps.length, span: span.length,
      pathway: pathway.length } };
}

// Express mount: GET /bcw?topic=... exposes the armory to any lane or human.
module.exports = function (app) {
  app.get('/bcw', async function (req, res) {
    var out = await assembleBCW(req.query.topic || '', req.query.hamUid || '');
    res.json(out);
  });
};
module.exports.assembleBCW = assembleBCW;
