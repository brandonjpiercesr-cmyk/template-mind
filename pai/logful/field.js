// ⬡B:logful.field:MODULE:reminders_through_logful:20260724⬡
// FIELD, the reminders organ. Declared in logful/.acl since 20260617, absent on disk until
// now. Doctrine (Life Assistant pt 4, Governors Doctrine): reminders run through LOGFUL.
// She reads her own brain and decides what is overdue. No cron decides, no cold code
// reaches. This file only carries: it stores reminder beads and returns due ones UP into
// the cycle for the LLM to deliberate. The reminder-to-self primitive is first class:
// "in a week, remind YOURSELF to check if anyone responded" is forWhom:'self'.
// Anyham law: no identity literals; every caller is door-resolved through ABAHAM before
// it reaches this file, so the hamUid arrives already resolved from that door. Due
// reminders surface only through the cycle to a real channel wonder; never from here.
'use strict';
var logful = require('./index');

function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||(process.env.MEMORY_BANK_URL?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(process.env.MEMORY_BANK_URL?'memory_bank':'abacia_core');}

async function fieldAuthority(hamUid, authority) {
  var tiers = require('../core/privacy/people.tier.js');
  if (tiers.isReadAuthority(authority, hamUid)) return authority;
  return tiers.resolveReadTier(null, hamUid);
}

// Store a reminder. entry: {hamUid, note, dueAt (ms or ISO), forWhom ('ham'|'self'),
// setBy (the owning wonder that decided this reminder should exist), importance}
// The DECISION that a reminder should exist belongs to the calling LLM, never to this file.
async function fieldRemind(entry) {
  if (!entry || !entry.hamUid || !entry.note || !entry.dueAt) {
    return { ok: false, reason: 'fieldRemind requires hamUid, note, dueAt' };
  }
  var due = typeof entry.dueAt === 'number' ? entry.dueAt : Date.parse(entry.dueAt);
  if (!due || isNaN(due)) return { ok: false, reason: 'dueAt did not parse' };
  var fieldId = 'field_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  var readAuthority = await fieldAuthority(entry.hamUid, entry.readAuthority);
  var r = await logful.logfulStore({
    hamUid: entry.hamUid,
    agent: entry.setBy || 'FIELD',
    type: 'field',
    stampType: 'FIELD',
    importance: entry.importance || 6,
    readAuthority: readAuthority,
    summary: '[FIELD] due ' + new Date(due).toISOString() + ': ' + String(entry.note).slice(0, 60),
    data: {
      fieldId: fieldId,
      note: String(entry.note),
      dueAt: due,
      forWhom: entry.forWhom === 'self' ? 'self' : 'ham',
      setBy: entry.setBy || 'UNKNOWN_WONDER',
      status: 'open'
    }
  });
  return r && r.ok ? { ok: true, fieldId: fieldId, id: r.id } : (r || { ok: false });
}

// Resolve a reminder: supersede-only, never UPDATE, never DELETE. A resolution is a new
// bead pointing at the fieldId; fieldCheck drops any due reminder that has a resolution.
async function fieldResolve(hamUid, fieldId, outcome, authority) {
  if (!hamUid || !fieldId) return { ok: false, reason: 'fieldResolve requires hamUid, fieldId' };
  var readAuthority = await fieldAuthority(hamUid, authority);
  return logful.logfulStore({
    hamUid: hamUid,
    agent: 'FIELD',
    type: 'field',
    stampType: 'FIELD',
    importance: 4,
    readAuthority: readAuthority,
    summary: '[FIELD] resolved ' + fieldId,
    data: { fieldId: fieldId, status: 'resolved', outcome: String(outcome || 'done') }
  });
}

// Return every open reminder due by `now` for this HAM, UP into the cycle. This function
// never sends anything anywhere. The caller is the cycle; the LLM decides what a due
// reminder means, which channel deserves it, or whether it waits. Cold code only fetches.
// ⬡B:logful.field:WIRE:bounded_fetch_this_is_a_live_cycle_tool_read:20260727⬡
// This is now called from inside a live turn (core/tool.loop.js read_reminders), the same
// class of call as the REMINDER read beside it, which is already timeout-bounded so one
// slow fetch can never hang a turn. This read gets the same real bound, own timeout
// value so a slow FIELD table never eats the REMINDER read's own budget.
async function fieldCheck(hamUid, now, timeoutMs, authority) {
  if (!_bu() || !_bk() || !hamUid) return { ok: false, reason: 'no brain or no ham', due: [] };
  var tiers = require('../core/privacy/people.tier.js');
  var readAuthority = await fieldAuthority(hamUid, authority);
  var viewerTier = tiers.effectiveTier(readAuthority && readAuthority.tier);
  var tierFilter = tiers.structuralFilter(viewerTier);
  var ts = now || Date.now();
  var url = _bu() + '/rest/v1/' + _tbl() +
    '?ham_uid=eq.' + encodeURIComponent(hamUid) +
    '&stamp_type=eq.FIELD' + (tierFilter ? '&' + tierFilter : '') +
    '&order=created_at.desc&limit=200';
  var rows;
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 4000) : null;
  try {
    rows = await fetch(url, {
      headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Accept-Profile': _schema() },
      signal: controller ? controller.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : []; });
  } catch (e) { return { ok: false, reason: e.message, due: [] }; }
  finally { if (timer) clearTimeout(timer); }
  var resolved = {};
  var open = [];
  (rows || []).forEach(function (row) {
    var c = row.content;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
    var d = (c && (c.data || c)) || {};
    if (!d.fieldId) return;
    if (d.status === 'resolved') { resolved[d.fieldId] = true; return; }
    if (d.status === 'open' && d.dueAt && d.dueAt <= ts) open.push({ bead: row.id, fieldId: d.fieldId, note: d.note, dueAt: d.dueAt, forWhom: d.forWhom, setBy: d.setBy });
  });
  var due = open.filter(function (o) { return !resolved[o.fieldId]; });
  return { ok: true, due: due };
}

module.exports = { fieldRemind: fieldRemind, fieldCheck: fieldCheck, fieldResolve: fieldResolve };
