// core/contacts.js
// ⬡B:core.contacts:MODULE:per_ham_contact_resolver:20260713⬡
//
// PER-HAM CONTACT RESOLVER  (Wonder rehaul G5, built via the COOK-OFF)
// -------------------------------------------------------------------------
// Provenance: this file is the CORRECTED WINNER of a real cook-off run
// (wonder.cookoff.run 20260713). Three models competed on this exact task; Fable 5
// judged and named glm-5.2 the winner as the only complete entry (working resolve, list,
// scoring, timeout, never throws), and wrote two corrections, both applied here:
//   1. use the built-in fetch, not a hand-rolled https client
//   2. strip a leading "my " from the query so relationship phrases match exactly
// CLAIR ships the corrected winner; the contest did the design work.
//
// WHAT IT DOES: resolves a name or relationship phrase ("BJ", "my brother", "mom") to a
// real contact for this HAM, read from CONTACT beads in the brain. Foundation for
// third-party reach (G1): "text my brother" resolves here first, then sends.
//
// UNIVERSALITY: hamUid drives every read, no hardcoded identity, no hardcoded roster.
// SAFETY: never throws, returns null on any error, 6s timeout so a slow brain never hangs
// a turn.
//
// DOCTRINE (entry + reach): this resolver is never a side gate. It runs inside the one PAI
// cycle, whose entry is always A'NEW through the ABAHAM door. Its reach path to the HAM is
// the find_contact tool: the HAM asks over any channel (text, voice, email, portal), the
// cycle calls find_contact, and the answer streams back through A'NU. No channel assembles
// anything itself; the MESSAGES reach path carries it.

function _bu(){ return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk(){ return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _tbl(){ return process.env.BEAD_TABLE || 'aibe_brain'; }
function _schema(){ return process.env.BRAIN_SCHEMA || 'abacia_core'; }

// Read all CONTACT beads for this HAM. Returns an array of {name, relationship, phone,
// email} objects (empty on any failure). Built-in fetch, 6s timeout, never throws.
async function _readContacts(hamUid){
  var BU = _bu(), BK = _bk();
  if (!BU || !BK || !hamUid) return [];
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ try { ctrl.abort(); } catch(e){} }, 6000) : null;
  try {
    var url = BU + '/rest/v1/' + _tbl()
      + '?stamp_type=eq.CONTACT&ham_uid=eq.' + encodeURIComponent(String(hamUid).toUpperCase())
      + '&select=content&order=created_at.desc&limit=500';
    var r = await fetch(url, {
      headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': _schema() },
      signal: ctrl ? ctrl.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!r.ok) return [];
    var rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map(function(row){
      try {
        var c = JSON.parse(row.content || '{}');
        return { name: c.name || '', relationship: c.relationship || '', phone: c.phone || '', email: c.email || '' };
      } catch(e){ return null; }
    }).filter(Boolean);
  } catch (e) {
    if (timer) clearTimeout(timer);
    return [];
  }
}

// Fable correction 2: strip a leading "my " so "my brother" matches the "brother"
// relationship exactly. Also lowercases and trims for a case-insensitive compare.
function _norm(s){
  return String(s || '').trim().toLowerCase().replace(/^my\s+/, '');
}

// Score one contact against the query. Higher is better; 0 means no match.
function _score(contact, q){
  var name = _norm(contact.name);
  var rel  = _norm(contact.relationship);
  if (!q) return 0;
  if (name === q || rel === q) return 100;                 // exact name or relationship
  if (name && (name.indexOf(q) === 0 || q.indexOf(name) === 0)) return 70; // name prefix either way
  if (rel && (rel.indexOf(q) === 0 || q.indexOf(rel) === 0)) return 65;    // relationship prefix
  if (name && name.indexOf(q) !== -1) return 40;           // name contains
  if (rel && rel.indexOf(q) !== -1) return 35;             // relationship contains
  return 0;
}

// Resolve a query (a name or a relationship phrase) to the single best contact, or null.
async function resolveContact(hamUid, query){
  try {
    var q = _norm(query);
    if (!q) return null;
    var contacts = await _readContacts(hamUid);
    var best = null, bestScore = 0;
    contacts.forEach(function(c){
      var s = _score(c, q);
      if (s > bestScore) { bestScore = s; best = c; }
    });
    return bestScore > 0 ? best : null;
  } catch (e) {
    return null;
  }
}

// List every contact for this HAM (for "who are my contacts" and for reach tools).
async function listContacts(hamUid){
  try { return await _readContacts(hamUid); } catch (e) { return []; }
}

module.exports = { resolveContact, listContacts };
