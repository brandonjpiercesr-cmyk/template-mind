// ⬡B:board.pam:MODULE:privacy_gate_canonical:20260630⬡
// ⬡B:board.pam:FIX:merged_from_board_pam_root:20260630⬡
// PAM -- Privacy Gate. Canonical. Merged from board/pam.js + board/pam/pam.js.
// board/pam.js (root) had: credential check + meta-commentary check
// board/pam/pam.js had: EBC WORLD_PATTERNS + more complete credential set
// This file merges both. board/pam.js root is now a re-export of this file.
// Cold regex only. No LLM. No async. ANYHAM: no hardcoded identity.

// World domain patterns for EBC firewall
var WORLD_PATTERNS = Object.freeze({
  bdif: Object.freeze(['briandawkins', 'brian dawkins', 'bdif', 'dawkins impact']),
  mediators: Object.freeze(['mediator', 'mediatorsfoundation', 'mediators foundation', 'better together america']),
  mh_action: Object.freeze(['mhaction', 'mh_action', 'mh action', 'mhany', 'tidescenter']),
  gmg: Object.freeze(['globalmajority', 'globalmajoritygroup', 'global majority'])
});

// Credential patterns to block outbound (regex)
var CREDENTIAL_PATTERNS = [
  { pattern: /gsk_[A-Za-z0-9]{20,}/, name: 'groq_key' },
  { pattern: /ghp_[A-Za-z0-9]{20,}/, name: 'github_token' },
  { pattern: /github_pat_[A-Za-z0-9]{30,}/, name: 'github_fine_grained_pat' },
  { pattern: /rnd_[A-Za-z0-9]{20,}/, name: 'render_key' },
  { pattern: /sk-or-v1-[a-z0-9]{40,}/, name: 'openrouter_key' },
  { pattern: /\+1[0-9]{10}/, name: 'phone_number' },
  { pattern: /https:\/\/[a-z]{15,}\.supabase\.co/, name: 'supabase_url' },
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, name: 'jwt_token' }
];

function safeContentText(content) {
  try {
    if (typeof content === 'string') return { ok:true, text:content };
    if (content == null) return { ok:true, text:'' };
    var encoded = JSON.stringify(content);
    return typeof encoded === 'string' ? { ok:true, text:encoded }
      : { ok:false, text:'' };
  } catch (e) {
    return { ok:false, text:'' };
  }
}

function checkCredentials(content) {
  try {
    var scan = safeContentText(content);
    if (!scan.ok) return { ok:false, reason:'credential_scan_unavailable' };
    var str = scan.text;
    for (var i = 0; i < CREDENTIAL_PATTERNS.length; i++) {
      var p = CREDENTIAL_PATTERNS[i];
      if (p.pattern.test(str)) {
        return { ok: false, reason: 'credential_in_outbound', credential_type: p.name };
      }
    }
  } catch (e) {
    return { ok:false, reason:'credential_scan_unavailable' };
  }
  return { ok: true };
}

// ⬡B:board.pam:BOUNDARY:meta_commentary_belongs_to_its_council_stage:20260719⬡
// Compatibility only. PAM owns deterministic privacy facts; the dedicated
// META_COMMENTARY council stage owns the meaning judgment and its healer.
function checkMetaCommentary() {
  return { ok: true, advisory: true, stage: 'META_COMMENTARY',
    reason: 'meta_commentary_deferred' };
}

function checkEbcFirewall(content, activeWorld) {
  try {
    if (typeof activeWorld !== 'string') return { ok:true };
    var normalizedWorld = activeWorld.trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(WORLD_PATTERNS, normalizedWorld)) return { ok:true };
    var scan = safeContentText(content);
    if (!scan.ok) return { ok:false, reason:'ebc_scan_unavailable',
      active_world:normalizedWorld };
    var str = scan.text.toLowerCase();
    for (var world in WORLD_PATTERNS) {
      if (world === normalizedWorld) continue;
      var otherPatterns = WORLD_PATTERNS[world];
      for (var i = 0; i < otherPatterns.length; i++) {
        if (str.indexOf(otherPatterns[i]) >= 0) {
          return { ok: false, reason: 'ebc_cross_world_leak', from_world: world,
            active_world: normalizedWorld };
        }
      }
    }
  } catch (e) {
    return { ok:false, reason:'ebc_scan_unavailable', active_world:
      typeof activeWorld === 'string' ? activeWorld.trim().toLowerCase() : null };
  }
  return { ok: true };
}

/**
 * PAM Privacy Check
 * @param {string|object} content - outbound content to check
 * @param {string} [activeWorld] - active EBC world (bdif, mediators, mh_action, gmg) or null
 * @returns {{ ok: boolean, verdict: string, flags: Array }}
 */
function pamCheck(content, activeWorld) {
  try {
    var flags = [];
    var credCheck = checkCredentials(content);
    if (!credCheck.ok) flags.push(credCheck);
    var ebcCheck = checkEbcFirewall(content, activeWorld);
    if (!ebcCheck.ok) flags.push(ebcCheck);
    return { ok: flags.length === 0,
      verdict: flags.length === 0 ? 'PAM_PASS' : 'PAM_HOLD', flags: flags };
  } catch (e) {
    return { ok:false, verdict:'PAM_HOLD',
      flags:[{ ok:false, reason:'pam_security_check_fault' }] };
  }
}

module.exports = { pamCheck: pamCheck, checkCredentials: checkCredentials, checkMetaCommentary: checkMetaCommentary, checkEbcFirewall: checkEbcFirewall, WORLD_PATTERNS: WORLD_PATTERNS };
