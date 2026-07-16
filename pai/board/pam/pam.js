// ⬡B:board.pam:MODULE:privacy_gate_canonical:20260630⬡
// ⬡B:board.pam:FIX:merged_from_board_pam_root:20260630⬡
// PAM -- Privacy Gate. Canonical. Merged from board/pam.js + board/pam/pam.js.
// board/pam.js (root) had: credential check + meta-commentary check
// board/pam/pam.js had: EBC WORLD_PATTERNS + more complete credential set
// This file merges both. board/pam.js root is now a re-export of this file.
// Cold regex only. No LLM. No async. ANYHAM: no hardcoded identity.

// World domain patterns for EBC firewall
var WORLD_PATTERNS = {
  bdif: ['briandawkins', 'brian dawkins', 'bdif', 'dawkins impact'],
  mediators: ['mediator', 'mediatorsfoundation', 'mediators foundation', 'better together america'],
  mh_action: ['mhaction', 'mh_action', 'mh action', 'mhany', 'tidescenter'],
  gmg: ['globalmajority', 'globalmajoritygroup', 'global majority']
};

// Credential patterns to block outbound (regex)
var CREDENTIAL_PATTERNS = [
  { pattern: /gsk_[A-Za-z0-9]{20,}/g, name: 'groq_key' },
  { pattern: /ghp_[A-Za-z0-9]{20,}/g, name: 'github_token' },
  { pattern: /github_pat_[A-Za-z0-9]{30,}/g, name: 'github_fine_grained_pat' },
  { pattern: /rnd_[A-Za-z0-9]{20,}/g, name: 'render_key' },
  { pattern: /sk-or-v1-[a-z0-9]{40,}/g, name: 'openrouter_key' },
  { pattern: /\+1[0-9]{10}/g, name: 'phone_number' },
  { pattern: /https:\/\/[a-z]{15,}\.supabase\.co/g, name: 'supabase_url' },
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/g, name: 'jwt_token' }
];

// ⬡B:board.pam:FIX:grounded_inability_is_not_model_meta_commentary:20260715⬡
// Meta-commentary is self-description as an AI/model or an appeal to training or
// cutoff, not every ordinary first-person statement of uncertainty. Bare
// "I cannot" / "I am unable" also occur in honest evidence-bounded answers such
// as being unable to determine a fact from stored records. Holding those phrases
// by themselves converts grounded uncertainty into a privacy failure.
var META_PATTERNS = [
  'as an AI', 'I am an AI', "I'm an AI", 'I’m an AI',
  'my training', 'my knowledge cutoff',
  'as a language model', 'I am a language model', "I'm a language model", 'I’m a language model',
  'my AI limitations', 'my model limitations'
];

function checkCredentials(content) {
  var str = typeof content === 'string' ? content : JSON.stringify(content || '');
  for (var i = 0; i < CREDENTIAL_PATTERNS.length; i++) {
    var p = CREDENTIAL_PATTERNS[i];
    if (p.pattern.test(str)) {
      p.pattern.lastIndex = 0; // reset stateful regex
      return { ok: false, reason: 'credential_in_outbound', credential_type: p.name };
    }
    p.pattern.lastIndex = 0;
  }
  return { ok: true };
}

function checkMetaCommentary(content) {
  var str = (typeof content === 'string' ? content : JSON.stringify(content || '')).toLowerCase();
  for (var i = 0; i < META_PATTERNS.length; i++) {
    if (str.indexOf(META_PATTERNS[i].toLowerCase()) >= 0) {
      return { ok: false, reason: 'meta_commentary_detected', phrase: META_PATTERNS[i] };
    }
  }
  return { ok: true };
}

function checkEbcFirewall(content, activeWorld) {
  if (!activeWorld) return { ok: true };
  var str = (typeof content === 'string' ? content : JSON.stringify(content || '')).toLowerCase();
  var myPatterns = WORLD_PATTERNS[activeWorld] || [];
  for (var world in WORLD_PATTERNS) {
    if (world === activeWorld) continue;
    var otherPatterns = WORLD_PATTERNS[world];
    for (var i = 0; i < otherPatterns.length; i++) {
      if (str.indexOf(otherPatterns[i]) >= 0) {
        return { ok: false, reason: 'ebc_cross_world_leak', from_world: world, active_world: activeWorld };
      }
    }
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
  var flags = [];

  var credCheck = checkCredentials(content);
  if (!credCheck.ok) flags.push(credCheck);

  var metaCheck = checkMetaCommentary(content);
  if (!metaCheck.ok) flags.push(metaCheck);

  var ebcCheck = checkEbcFirewall(content, activeWorld);
  if (!ebcCheck.ok) flags.push(ebcCheck);

  return {
    ok: flags.length === 0,
    verdict: flags.length === 0 ? 'PAM_PASS' : 'PAM_HOLD',
    flags: flags
  };
}

module.exports = { pamCheck: pamCheck, checkCredentials: checkCredentials, checkMetaCommentary: checkMetaCommentary, checkEbcFirewall: checkEbcFirewall, WORLD_PATTERNS: WORLD_PATTERNS };
