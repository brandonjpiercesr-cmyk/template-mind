// ⬡B:core.os.registry:MODULE:single_source_of_truth:20260710⬡
// CANON L0 DOOR + CHANNEL DECLARATION: ABAHAM DOOR: this roster serves the
// CIB/CIP surfaces whose turns enter the mind through the ABAHAM door; the
// registry itself carries no identity, HAM rides the URL and is resolved at
// that door. CHANNEL PATH TO A HAM: the roster is the return leg of the OS
// surface channel (the MESSAGES-equivalent path presence and the ask ride).
// NOTE 20260711: legacy product names below (CCWA, AWA long labels) are
// the founder's own product names, pending his scrub-lane rename decision.
// A'NU OS app registry, the ONE source both surfaces read (CIP launcher and
// CIB desktop), the direct descendant of oneaba-source
// apps/shell/src/config/app-registry.js, the sealed pattern: add one entry
// here and the app appears in the dock, the launcher grid, and cmd-K search.
// FOUNDER DIRECT OVERRIDE 20260710, CLAIR pen authorized, rebuild after the
// 20260710 scaffold rejection (bead clair.911 RESPEC, id c37b2614).
//
// LAWS HELD IN THIS FILE:
// - No invented apps. Every LIVE entry points at a route mounted on the face
//   tonight (anu.index.js read at HEAD before writing this).
// - The full OneABA roster is carried HONESTLY: apps not yet ported to the
//   new world appear with status 'porting' and their oneaba-source reference,
//   never hidden, never faked as live, never invented.
// - 847392 clean: hamUid is a parameter everywhere, no identity in code.
// - Brain overlay: per-HAM os.registry beads (pins, order, hidden) compose
//   over this roster at read time, so the OS bends per HAM without a commit.

'use strict';

// Real names, real colors, real keywords, carried from the legacy registry.
// path(H) returns a LIVE per-HAM route on the face origin.
const LIVE = [
  { id: 'chat',     label: 'Chat',               mark: 'C', color: '#8B5CF6',
    keywords: ['chat', 'cara', 'talk', 'ask', 'messages'],
    aliases: ['Chat', 'CARA'], path: function (H) { return '/chat/' + H; } },
  { id: 'budget',   label: 'Budget OS',          mark: 'B', color: '#10B981',
    keywords: ['budget', 'money', 'ledger', 'finance', 'bills', 'spend'],
    aliases: ['Budget', 'Budget OS', 'LEDGER'], path: function (H) { return '/budget/' + H; } },
  { id: 'advisors', label: 'Advisors',           mark: 'A', color: '#F59E0B',
    keywords: ['advisors', 'advisor', 'legal', 'financial', 'life', 'coding', 'stock', 'council'],
    aliases: ['Advisors'], path: function (H) { return '/advisors/' + H; } },
  { id: 'jobs',     label: 'Jobs Pipeline',      mark: 'J', color: '#8B5CF6',
    keywords: ['jobs', 'pipeline', 'career', 'awa', 'apply with aba', 'hunter', 'applications'],
    aliases: ['Jobs', 'AWA'], path: function (H) { return '/awa/' + H; } },
  { id: 'ccwa',     label: 'Come Code', mark: 'K', color: '#22D3EE',
    keywords: ['ccwa', 'code', 'developer', 'coding', 'terminal', 'dev'],
    aliases: ['CCWA', 'Code', 'Developer'], path: function () { return '/ccwa'; } },
  { id: 'alive',    label: 'Alive',              mark: 'L', color: '#EC4899',
    keywords: ['alive', 'canvas', 'live', 'surface', 'heartbeat'],
    aliases: ['Alive', 'Alive Canvas'], path: function (H) { return '/alive-view/' + H; } }, // ⬡B:os.registry:REPOINT:her_narrated_alive_20260711⬡
  { id: 'command',  label: 'Command Center',     mark: 'M', color: '#EC4899',
    keywords: ['command', 'command center', 'dashboard', 'ceecee', 'agents', 'cycle'],
    aliases: ['Command Center', 'ceecee'], path: function (H) { return '/command-center/' + H; } },
  { id: 'today',    label: 'Today',              mark: 'T', color: '#F97316',
    keywords: ['today', 'now', 'hunches', 'reminders', 'widgets', 'daily'],
    aliases: ['Today'], path: function (H) { return '/os/today/' + H; } },
  { id: 'schedule', label: 'Schedule',           mark: 'S', color: '#06B6D4',
    keywords: ['schedule', 'booking', 'meeting', 'calendar link', 'book'],
    aliases: ['Schedule', 'Booking'], path: function (H) { return '/schedule/' + H; } },
  { id: 'guide',    label: 'Guide',              mark: 'G', color: '#14B8A6',
    keywords: ['guide', 'navigate', 'directions', 'landmark', 'walk', 'where'],
    aliases: ['Guide', 'Agent Guide'], path: function (H) { return '/guide/' + H; } },
  { id: 'email',    label: 'Email',              mark: 'E', color: '#EF4444',
    keywords: ['email', 'mail', 'inbox', 'iman'],
    aliases: ['Email', 'IMAN'], path: function (H) { return '/email-view/' + H; } },
  { id: 'calendar', label: 'Calendar',           mark: 'R', color: '#F59E0B',
    keywords: ['calendar', 'schedule', 'events', 'radar', 'meetings'],
    aliases: ['Calendar', 'RADAR'], path: function (H) { return '/calendar-view/' + H; } },
  { id: 'circle',   label: 'Circle',             mark: '1', color: '#8B5CF6', keywords: ['circle','friends','people','presence'], aliases: ['Circle'], path: function (H) { return '/circle-view/' + H; } },
  { id: 'music',    label: 'Music',              mark: '2', color: '#10B981', keywords: ['music','vinyl','play','song'], aliases: ['Music','VINYL'], path: function (H) { return '/music-view/' + H; } },
  { id: 'logful',   label: 'LogFul',             mark: 'Z', color: '#F97316', keywords: ['logful','history','memory','turns'], aliases: ['LogFul'], path: function (H) { return '/logful-view/' + H; } },
  { id: 'roster',   label: 'Agent Roster',       mark: '3', color: '#8B5CF6', keywords: ['roster','agents','who'], aliases: ['Roster','Agent Roster'], path: function (H) { return '/roster-view/' + H; } },
  { id: 'soul',     label: 'SOUL',               mark: '4', color: '#F5D99A', keywords: ['soul','spiritual','prayer','scripture','faith'], aliases: ['SOUL','Spiritual'], path: function (H) { return '/soul-view/' + H; } },
  { id: 'documents',label: 'Documents',          mark: 'O', color: '#6366F1', keywords: ['documents','files','attachments'], aliases: ['Documents'], path: function (H) { return '/documents-view/' + H; } },
  // ⬡B:os.registry:LIVE:editor_cover_letters_resumes_phase1_6:20260720⬡ Phase 1.6:
  // the Google-Docs editor, one document model saved to /os/doc, current on both surfaces.
  { id: 'editor',   label: 'Editor',             mark: 'W', color: '#3B82F6', keywords: ['editor','write','document','cover letter','resume','doc','writing'], aliases: ['Editor','Docs','Writer'], path: function (H) { return '/editor/' + H; } },
  // ⬡B:os.registry:LIVE:references_manager_phase3_5:20260720⬡ Phase 3.5: the job pipeline references manager, per person.
  { id: 'jobrefs',  label: 'References',          mark: 'R', color: '#0EA5E9', keywords: ['references','referees','job references','recommenders','contacts'], aliases: ['References','Job References'], path: function (H) { return '/jobrefs/' + H; } },
  // ⬡B:os.registry:LIVE:kanban_pipeline_board_phase3_4:20260720⬡ Phase 3.4: the kanban board where job cards move between columns.
  { id: 'pipeline', label: 'Pipeline',            mark: 'P', color: '#8B5CF6', keywords: ['pipeline','kanban','board','jobs board','applications board','columns'], aliases: ['Pipeline','Board','Kanban'], path: function (H) { return '/pipeline/' + H; } },
  // ⬡B:os.registry:LIVE:contacts_manager_phase6_2:20260720⬡ Phase 6.2: the contacts app, per-owner, ROLO-resolvable.
  { id: 'contacts', label: 'Contacts',            mark: 'C', color: '#F97316', keywords: ['contacts','people','address book','rolo','phone book','who'], aliases: ['Contacts','People','ROLO'], path: function (H) { return '/contacts/' + H; } },
  // ⬡B:os.registry:LIVE:tasks_notes_journal_surface_phase7:20260720⬡ Phase 7.2/7.5.
  { id: 'tasks',    label: 'Tasks',               mark: 'T', color: '#22C55E', keywords: ['tasks','todo','to-do','notes','journal','follow up','action items'], aliases: ['Tasks','To Do','Notes'], path: function (H) { return '/tasks/' + H; } },
  { id: 'journal',  label: 'Journal',            mark: 'N', color: '#EC4899', keywords: ['journal','reflection','diary'], aliases: ['Journal'], path: function (H) { return '/journal-view/' + H; } },
  { id: 'team',     label: 'Team',               mark: 'U', color: '#06B6D4', keywords: ['team','collective','colleagues','brothers'], aliases: ['Team'], path: function (H) { return '/team/' + H; } },
  { id: 'coffee',   label: 'Coffee with ED',     mark: 'H', color: '#F59E0B', keywords: ['coffee','ed email','daily note','team email'], aliases: ['Coffee'], path: function (H) { return '/coffee-view/' + H; } },
  { id: 'writing',  label: 'Writing Analyzer',    mark: 'Y', color: '#EF4444', keywords: ['writing','analyzer','writ','ai detection','draft'], aliases: ['Writing','WRIT'], path: function (H) { return '/writing-view/' + H; } },
  { id: 'inbox-manager', label: 'Inbox Manager',  mark: 'X', color: '#06B6D4', keywords: ['inbox','triage','priority','email manager'], aliases: ['Inbox Manager'], path: function (H) { return '/inbox-manager-view/' + H; } },
  { id: 'references', label: 'References',        mark: 'F', color: '#14B8A6', keywords: ['references','citations','sources','library'], aliases: ['References'], path: function (H) { return '/references-view/' + H; } },
  // ⬡B:os.registry:REPOINT:meeting_interview_to_three_panel_copilot_phase5:20260720⬡
  { id: 'meeting',  label: 'Meeting Mode',        mark: 'W', color: '#EF4444', keywords: ['meeting','mesa','notes','minutes','transcript','copilot'], aliases: ['Meeting','MESA'], path: function (H) { return '/meeting/' + H; } },
  { id: 'interview',label: 'Interview Mode',      mark: 'I', color: '#F59E0B', keywords: ['interview','iris','prep','job','mock'], aliases: ['Interview','IRIS'], path: function (H) { return '/interview/' + H; } },
  { id: 'gmg-university', label: 'GMG University',   mark: 'V', color: '#EC4899', keywords: ['gmg university','guru','curriculum','learn','course'], aliases: ['GMG University','GURU'], path: function (H) { return '/gmg-university-view/' + H; } },
  { id: 'memos',    label: 'Memos',              mark: 'Z', color: '#8B5CF6', keywords: ['memos','notes','memo'], aliases: ['Memos'], path: function (H) { return '/memos-view/' + H; } },
  { id: 'reading',  label: 'Reading',            mark: 'P', color: '#8B5CF6', keywords: ['reading','page','books','library'], aliases: ['Reading','PAGE'], path: function (H) { return '/reading-view/' + H; } },
  { id: 'atter',    label: 'ATTER',              mark: 'A', color: '#14B8A6', keywords: ['atter','capture','voice','record'], aliases: ['ATTER'], path: function (H) { return '/atter-view/' + H; } },
  { id: 'sync',     label: 'Sync',               mark: '6', color: '#22D3EE', keywords: ['sync','onboarding','setup','connect'], aliases: ['Sync'], path: function (H) { return '/sync-view/' + H; } },
  { id: 'sports',   label: 'Sports',             mark: '5', color: '#F97316',
    keywords: ['sports', 'nash', 'nba', 'nfl', 'game', 'score', 'lakers'],
    aliases: ['Sports', 'NASH'], path: function (H) { return '/sports-view/' + H; } }, // ⬡B:os.registry:LIVE:sports_phase_c_port_20260716⬡
  { id: 'phone',    label: 'Dials',              mark: 'D', color: '#10B981', keywords: ['phone','dials','vara','voice','call','talk'], aliases: ['Phone','VARA','Dials'], path: function (H) { return '/phone-view/' + H; } } // ⬡B:os.registry:LIVE:calendar_radar_her_narrated_20260711⬡ // ⬡B:os.registry:LIVE:email_first_legacy_app_reborn_20260711⬡
];

// The rest of the sealed OneABA roster, not yet ported to the new world.
// Source of record: oneaba-source apps/shell/src/config/app-registry.js.
// These render greyed with a porting tag. They are the checklist, never faked.
const PORTING = [
];

// The canonical identity background set, the sealed house canon carried by
// ccwa-core backgrounds.js (wet city, pink smoke and family). Never Unsplash,
// never invented URLs.
const BACKGROUNDS = [
  { id: 'wet-city',        url: 'https://i.imgur.com/h8zNCw1.jpeg' },
  { id: 'pink-smoke',      url: 'https://i.imgur.com/3RkebB2.jpeg' },
  { id: 'nebula',          url: 'https://i.imgur.com/nLBRQ82.jpeg' },
  { id: 'black-landscape', url: 'https://i.imgur.com/ZwVdgzN.jpeg' },
  { id: 'motion',          url: 'https://i.imgur.com/3hG18cp.jpeg' },
  { id: 'storm-clouds',    url: 'https://i.imgur.com/RRKjvgR.jpeg' },
  { id: 'particle-lights', url: 'https://i.imgur.com/wLi9sGD.jpeg' },
  { id: 'glass-windows',   url: 'https://i.imgur.com/Kjjs7nt.jpeg' },
  { id: 'embers',          url: 'https://i.imgur.com/9HZYnlX.png'  },
  { id: 'unity',           url: 'https://i.imgur.com/IJAeq7t.png'  }
];

function brainHeaders(profile) {
  const key = process.env.AIBE_BRAIN_KEY || '';
  return {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Accept-Profile': profile,
    'Content-Type': 'application/json'
  };
}

function brainUrl() { return (process.env.AIBE_BRAIN_URL || '').replace(/\/$/, ''); }

// The per-HAM Memory Bank first (Memory is per HAM, full stop, the July 9
// law): ham_{uid}.abacia read directly. The abacia_core union view is the
// fallback for HAMs whose schema is not exposed on this brain.
async function latestBead(hamUid, stampLike) {
  const u = brainUrl();
  const uid = String(hamUid);
  // ⬡B:registry:FIX:identity_reads_the_new_bank_first:20260718⬡ Founder set his title but it
  // read Boss because this only queried the legacy brain, while the new world writes his
  // profile to MEMORY_BANK. The new bank is where live per-HAM writes land now, so check it
  // first, then fall through to legacy archive. No behavior change for anything already found.
  const nbUrl = (process.env.MEMORY_BANK_URL || '').replace(/\/$/, '');
  const nbKey = process.env.MEMORY_BANK_KEY || '';
  if (nbUrl && nbKey) {
    try {
      const q = nbUrl + '/rest/v1/' + (process.env.BEAD_TABLE || 'beads')
        + '?select=content,created_at&ham_uid=eq.' + encodeURIComponent(uid)
        + '&acl_stamp=ilike.' + encodeURIComponent('*' + stampLike + '*')
        + '&order=created_at.desc&limit=1';
      const r = await fetch(q, { headers: { apikey: nbKey, Authorization: 'Bearer ' + nbKey,
        'Accept-Profile': (process.env.BRAIN_SCHEMA_NEW || 'memory_bank') } });
      if (r.ok) { const rows = await r.json(); if (rows.length && rows[0].content) return rows[0].content; }
    } catch (_) { /* fall through to legacy */ }
  }
  if (!u) return null;
  const attempts = [
    { table: 'abacia',     profile: 'ham_' + uid.toLowerCase(), byHam: false },
    { table: 'aibe_brain', profile: 'abacia_core',              byHam: true }
  ];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const a = attempts[i];
      let q = u + '/rest/v1/' + a.table
        + '?select=content,created_at'
        + '&acl_stamp=ilike.' + encodeURIComponent('*' + stampLike + '*')
        + '&order=created_at.desc&limit=1';
      if (a.byHam) q += '&ham_uid=eq.' + encodeURIComponent(uid);
      const r = await fetch(q, { headers: brainHeaders(a.profile) });
      if (!r.ok) continue;
      const rows = await r.json();
      if (rows.length && rows[0].content) return rows[0].content;
    } catch (_) { /* try next */ }
  }
  return null;
}

// Per-HAM overlay from the brain: the latest os.registry bead may pin, hide,
// or reorder. Supersede-only, the newest bead wins. Absent bead means the
// code roster serves untouched.
async function fetchOverlay(hamUid) {
  const raw = await latestBead(hamUid, 'os.registry');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// The HAM's identity from the brain: latest ham.profile bead. Falls back to
// the UID itself, NEVER a generic word, that was the 20260710 scaffold sin.
async function fetchIdentity(hamUid) {
  const out = { hamUid: hamUid, name: hamUid, resolved: false, title: null, first: null, timezone: null };
  const raw = await latestBead(hamUid, 'ham.profile');
  if (!raw) return out;
  let profile = null;
  try { profile = JSON.parse(raw); } catch (_) { return out; }
  // ⬡B:registry:BUILD:per_ham_timezone_rides_identity:20260725⬡ A HAM's timezone is part of
  // who they are, resolved from their own record like their name and title, never a global
  // env for everyone. core/ham.timezone.js reads it here, so a HAM's stored IANA zone (when
  // they set one) grounds A'NU's sense of THEIR local time. Absent today; the door is ready.
  if (profile) out.timezone = (profile.timezone || profile.tz || null);
  if (profile && profile.name) {
    out.name = String(profile.name);
    out.full = profile.full || null;
    out.resolved = true;
    // ⬡B:registry:BUILD:per_ham_title_20260718⬡ Founder's wonder: every HAM can set how she
    // addresses them. Dr Eric Lane -> "Dr Lane", someone else -> a chosen title, and if none
    // is set she uses their first name, or for the founder specifically, who never set one,
    // his standing instruction is "Boss". No hardcoded identity: title and first come from
    // his own profile bead; the only default is the founder's own explicit "Boss".
    out.title = (profile.title && String(profile.title).slice(0, 40)) || null;
    out.first = (profile.first || String(out.name).split(' ')[0] || '').slice(0, 40) || null;
    if (!out.title && String(hamUid).toUpperCase() === String(process.env.FOUNDER_HAM_UID || '').toUpperCase()) {
      out.title = 'Boss';
    }
  }
  return out;
}

async function composeRegistry(hamUid) {
  const overlay = await fetchOverlay(hamUid);
  const hidden = new Set((overlay && overlay.hidden) || []);
  const pins = (overlay && overlay.pins) || [];

  const live = LIVE
    .filter(function (a) { return !hidden.has(a.id); })
    .map(function (a) {
      return {
        id: a.id, label: a.label, mark: a.mark, color: a.color,
        keywords: a.keywords, aliases: a.aliases,
        path: a.path(hamUid), status: 'live',
        pinned: pins.indexOf(a.id) !== -1
      };
    });

  // Pins float to the front, brain order wins.
  live.sort(function (x, y) {
    const px = pins.indexOf(x.id), py = pins.indexOf(y.id);
    if (px !== -1 && py !== -1) return px - py;
    if (px !== -1) return -1;
    if (py !== -1) return 1;
    return 0;
  });

  const porting = PORTING
    .filter(function (a) { return !hidden.has(a.id); })
    .map(function (a) {
      return {
        id: a.id, label: a.label, mark: a.mark, color: a.color,
        aliases: a.aliases, status: 'porting', source: 'oneaba-source'
      };
    });

  // ⬡B:core.os.registry:ADD:overlay_echoed_so_the_surface_can_edit_it:20260720⬡ The
  // surface needs the current pins/hidden to change them without wiping the rest
  // (a hidden app is filtered OUT of live, so the client cannot otherwise see it to
  // preserve it). Echoing the overlay lets pin/hide post the full next state. Also
  // surface the hidden apps' labels so the drawer can offer to unhide them.
  const hiddenApps = LIVE.filter(function (a) { return hidden.has(a.id); })
    .map(function (a) { return { id: a.id, label: a.label, mark: a.mark, color: a.color }; });

  return { hamUid: hamUid, live: live, porting: porting, backgrounds: BACKGROUNDS,
    overlay: { pins: pins.slice(), hidden: Array.from(hidden) }, hiddenApps: hiddenApps };
}

module.exports = { composeRegistry, fetchIdentity, BACKGROUNDS };
