// ⬡B:reach.reach.department:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}
function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}
// ⬡B:reach.department:MODULE:reach_wonder_birth:20260711⬡
// THE REACH DEPARTMENT, birthed per Rebirth Doctrine Pt 6. Reach is not a cold ladder.
// The cold ladder in core/outreach.js defines the channel PURPOSES and cheap signals;
// this department is the wonder on top of it: when a decision is borderline it
// deliberates the ONE channel that truly serves, refuses to double-fire (call AND text)
// without a named escalation reason, always honors an explicit request from the founder,
// and AUDITS its own recent reach for performance (over-reaching, wrong channel, silence).
//
// IDENTITY: the founder resolves through the ABAHAM door via env, never a literal UID in
// this file. The department is per-founder by env, not hardcoded.

function founderUid() { return (process.env.FOUNDER_HAM_UID || process.env.OVERSEER_HAM_UID || '').toUpperCase(); }

// Defined channel purposes (the cold frame the deliberation reasons within).
var CHANNEL_PURPOSES = {
  voice: 'A live call. ONLY when something is urgent and needs the founder right now, or when he explicitly asked to be called. Never for something he can read later.',
  text: 'A short text. Time-sensitive and glanceable, something he should see soon but need not act on this second.',
  email: 'An email. Substantive and detailed, needs his read, but not urgent.',
  command_center: 'Logged in the CLAIR Command Center. Needs his decision or review but must NOT interrupt him. The default resting place.',
  portal: 'Ambient in the portal. Low-importance context that surfaces when he next looks. No push.'
};
function purposesText() {
  return Object.keys(CHANNEL_PURPOSES).map(function (k) { return k.toUpperCase() + ': ' + CHANNEL_PURPOSES[k]; }).join('\n');
}

async function llm(system, user, maxTokens) {
  var key = process.env.GROQ_API_KEY;
  if (!key) return '';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL_C1 || 'openai/gpt-oss-20b', max_tokens: maxTokens || 120, temperature: 0.1,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    }).then(function (x) { return x.json(); });
    return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
  } catch (e) { return ''; }
}

// The wonder. Given a reach judgment and the cold ladder's suggestion, decide the ONE
// channel that best serves. Honors explicit requests cold; deliberates the rest.
async function decideReach(judgment, ladderChannel, ctx) {
  ctx = ctx || {};
  judgment = judgment || {};
  var imp = judgment.importance || 0;
  var txt = ((judgment.reason || '') + ' ' + (judgment.message || '') + ' '
    + (ctx.verifiedEvidence || '')).toLowerCase();
  // COLD: an explicit ask wins, that is its defined purpose.
  if (/\b(call|ring|phone) (?:me|you|him|her)\b|\bgiv(?:e|ing) (?:me|you|him|her) (?:\w+ ){0,3}call\b|\bcan you call\b/.test(txt) || ctx.userRequestedChannel === 'voice') {
    return { channel: 'voice', why: 'the founder explicitly asked to be called', escalate: false, source: 'explicit_request' };
  }
  // COLD floor: trivial never pushes; trust the ladder there.
  if (imp <= 2) return { channel: ladderChannel || 'portal', why: 'low importance, ambient', escalate: false, source: 'cold_floor' };
  // WONDER: deliberate within the defined purposes; the ladder is the starting suggestion.
  var sys = 'You are the Reach department for A NEW. Pick the ONE channel that best serves reaching the founder, using ONLY these defined purposes:\n' + purposesText()
    + '\nRules: do NOT pick voice unless it is genuinely urgent and needs him now. NEVER pick more than one channel unless there is a real escalation reason, and if so name it after ESCALATE:. A cold ladder already suggested "' + (ladderChannel || 'command_center') + '"; keep it unless a purpose clearly fits better. Reply exactly: CHANNEL | one short why.';
  var out = await llm(sys, 'Importance ' + imp + '/10. Reason: ' + (judgment.reason || '') + '\nMessage: ' + (judgment.message || ''), 120);
  var m = /(voice\+text|voice|text|email|command_center|portal)/i.exec(out || '');
  var channel = m ? m[1].toLowerCase() : (ladderChannel || 'command_center');
  var why = ((out || '').split('|')[1] || judgment.reason || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  var escalate = /escalate:/i.test(out || '');
  return { channel: channel, why: why, escalate: escalate, source: 'deliberated', ladder: ladderChannel };
}

// Audit recent reach for performance: is she over-reaching, using the wrong channels,
// or going silent when she should surface. Command-center-only, never an outbound.
async function auditReach() {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return { ok: false, reason: 'no_brain' };
  var sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    // ⬡B:reach.department:FIX:precise_channel_count_not_substring_match:20260712⬡
    // Was counting the word "call" appearing anywhere in a summary (false positives:
    // it matched other audit beads talking ABOUT calls, not actual channel decisions).
    // Fixed: parse the real proposedChannel/lineage.channel off OUTREACH bead content,
    // the same field the decision itself wrote, not a guess from prose.
    var r = await fetch(_bu() + '/rest/v1/' + _tbl() + '?select=content,created_at&stamp_type=eq.OUTREACH&created_at=gte.' + sinceIso + '&order=created_at.desc&limit=200',
      { headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Accept-Profile': _schema() } });
    var rows = r.ok ? await r.json() : [];
    var sent = 0, held = 0, calls = 0, texts = 0, emails = 0, funneled = 0;
    rows.forEach(function (b) {
      var c = {}; try { c = JSON.parse(b.content || '{}'); } catch (e) {}
      var ch = (c.lineage && c.lineage.channel) || c.proposedChannel || '';
      if (c.sent) sent++; else held++;
      if (ch.indexOf('voice') >= 0) calls++;
      else if (ch === 'text') texts++;
      else if (ch === 'email') emails++;
      if (c.reason === 'funneled_to_command_center') funneled++;
    });
    var findings = [];
    if (calls > 3) findings.push('reached by voice ' + calls + ' times in 24h, calls should be rare');
    if (sent > 12) findings.push('pushed ' + sent + ' outbound in 24h, likely over-reaching');

    // ⬡B:reach.department:WIRE:candidate_pool_flood_detector:20260712⬡
    // The recurring disease (founder had to catch it live): a new stamp_type comes into
    // heavy use, is never added to the reach exclusion list, and floods the candidate
    // pool so everything reads as urgent. Catch it here: if one stamp_type dominates the
    // imp>=8 founder pool, flag it by name so the next leak is caught automatically.
    try {
      var fu = founderUid();
      if (fu) {
        var pr = await fetch(_bu() + '/rest/v1/' + _tbl() + '?ham_uid=eq.' + fu + '&importance=gte.8&created_at=gte.'
          + encodeURIComponent(new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
          + '&select=stamp_type&order=created_at.desc&limit=200', { headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Accept-Profile': _schema() } });
        var pool = pr.ok ? await pr.json() : [];
        if (pool.length >= 15) {
          var byType = {};
          pool.forEach(function (b) { var t = b.stamp_type || '?'; byType[t] = (byType[t] || 0) + 1; });
          var top = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; })[0];
          if (top && byType[top] / pool.length > 0.6) {
            findings.push('reach candidate pool flooded by stamp_type ' + top + ' (' + byType[top] + '/' + pool.length + ' in 6h), likely a new type leaking into reach, exclude it at the source');
          }
        }
      }
    } catch (ePool) { /* flood check best-effort */ }

    var verdict = findings.length ? 'REVIEW' : 'HEALTHY';
    await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
      method: 'POST', headers: { 'apikey': _bk(), 'Authorization': 'Bearer ' + _bk(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ham_uid: founderUid() || 'SYSTEM', agent_global: 'REACH', stamp_type: 'REACH_AUDIT',
        acl_stamp: '\u2b21B:reach.department:REACH_AUDIT:performance:' + ymd() + '\u2b21',
        source: 'reach.department.audit.' + Date.now(),
        summary: '[REACH AUDIT] ' + verdict + ' -- 24h: ' + sent + ' sent, ' + calls + ' calls, ' + texts + ' texts, ' + funneled + ' funneled' + (findings.length ? ' | ' + findings.join('; ') : ''),
        importance: findings.length ? 7 : 3,
        content: (function () {
          var payload = { verdict: verdict, sent: sent, calls: calls, texts: texts, funneled: funneled, findings: findings, window: '24h' };
          try {
            var lin = require('../core/lineage.attach.js');
            return JSON.stringify(lin.attachLineage(payload, { chain: ['REACH', 'ANEW'], deliveredBy: 'REACH self-audit', why: findings.length ? findings.join('; ').slice(0, 180) : 'reach healthy, 24h', audience: 'builder' }));
          } catch (e) { return JSON.stringify(payload); }
        })() })
    });
    return { ok: true, verdict: verdict, findings: findings };
  } catch (e) { return { ok: false, error: e.message }; }
}

var _timer = null;
function start() {
  var interval = parseInt(process.env.REACH_AUDIT_MS || String(6 * 60 * 60 * 1000), 10); // every 6h
  setTimeout(function () { auditReach().catch(function (e) { console.error('[REACH DEPT] audit boot error:', e.message); }); }, 45000);
  _timer = setInterval(function () { auditReach().catch(function (e) { console.error('[REACH DEPT] audit error:', e.message); }); }, interval);
  console.log('[REACH DEPT] born, self-audit every ' + Math.round(interval / 3600000) + 'h');
  return { ok: true, started: true };
}

module.exports = { decideReach: decideReach, auditReach: auditReach, start: start, CHANNEL_PURPOSES: CHANNEL_PURPOSES, auditRecentDecisions: require('./reach.wonder.js').auditRecentDecisions };
