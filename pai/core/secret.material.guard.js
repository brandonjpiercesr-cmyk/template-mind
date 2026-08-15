// ⬡B:core.secret_material_guard:MODULE:credential_material_never_enters_model_evidence:20260804⬡
'use strict';

const PATTERNS = Object.freeze([
  {reason:'authorization_header',pattern:/\b(?:authorization|proxy-authorization)\b["']?\s*:\s*["']?(?:bearer|token|key|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i},
  {reason:'named_credential',pattern:/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password)\b["']?\s*[:=]\s*["']?[^\s"',;]{8,}/i},
  {reason:'known_token_shape',pattern:/\b(?:(?:sk[-_]|gsk_|hf_|rnd_)[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{35}|sbp_[A-Fa-f0-9]{32,}|sb_(?:secret|service_role)_[A-Za-z0-9_-]{20,}|nyk_v\d+_[A-Za-z0-9_-]{20,}|FDV1\.[A-Za-z0-9._-]{20,})\b/},
  {reason:'jwt_shape',pattern:/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/},
  {reason:'credentialed_database_url',pattern:/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/i},
  {reason:'private_key_block',pattern:/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/},
  // ⬡B:core.secret_material_guard:FIX:three_real_shapes_this_canonical_list_could_not_see:20260815⬡
  // FOUND BY MAKING THIS THE ONE SOURCE. core/synthesize.js kept its own hand-maintained
  // credential list, and when I collapsed the two I measured BOTH directions rather than assuming
  // the canonical one dominated. It did not. This list missed three shapes the local one caught,
  // so a straight swap would have quietly LOST them:
  //   AKIA...        AWS access key id
  //   xoxb-/xoxp-... Slack bot and user tokens
  //   nyk_v0_...     Nylas, at the length this estate's own keys actually use
  // (The reverse was far worse and is why the collapse happened at all: the local list could not
  // see sk-or-v1-, this estate's LIVE shared OpenRouter key, nor sk-ant-, github_pat_, a
  // credentialed database URL, or a PEM block. It blocked the harmless and passed the dangerous.)
  //
  // THE SLACK PATTERN IS TIGHTER THAN THE ONE IT INHERITS, on purpose. The old
  // /xox[baprs]-[A-Za-z0-9-]{10,}/ matched Slack's OWN DOCS PLACEHOLDER, so a coder writing
  // "SLACK_BOT_TOKEN=xoxb-your-token-here" had their whole answer refused. A real Slack token is
  // a prefix, then AT LEAST ONE digit group, then the secret, and the placeholder has no digits
  // in it at all. That is SHAPE, not an allowlist: nothing here classifies which values are safe,
  // which is the line carry-never-classify draws. (My first attempt demanded TWO digit groups and
  // missed the estate's own test fixture, which carries one. Measured, tightened, re-measured.)
  // THE AWS PATTERN DELIBERATELY STILL MATCHES AKIAIOSFODNN7EXAMPLE, AWS's published sample. It
  // is shape-identical to a live key, and on an anchor guarding an irreversible person-effect the
  // safe error is the false positive. Named here so it is a decision and not an accident.
  {reason:'aws_access_key_id',pattern:/\bAKIA[0-9A-Z]{16}\b/},
  {reason:'slack_token',pattern:/\bxox[baprs]-\d{6,}-[A-Za-z0-9-]{8,}\b/},
  {reason:'nylas_key',pattern:/\bnyk_v\d+_[A-Za-z0-9_-]{10,}\b/}
]);

function stringReason(value) {
  const text = String(value == null ? '' : value);
  const hit = PATTERNS.find(function (entry) { return entry.pattern.test(text); });
  return hit ? hit.reason : null;
}

function find(value, path, seen) {
  const at = path || '$';
  if (typeof value === 'string') {
    const reason = stringReason(value);
    return reason ? {found:true,reason:reason,path:at} : null;
  }
  if (!value || typeof value !== 'object') return null;
  const visited = seen || new Set();
  if (visited.has(value)) return {found:true,reason:'cyclic_input',path:at};
  visited.add(value);
  for (const key of Object.keys(value)) {
    if (/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password|authorization)$/i.test(key) &&
        String(value[key] == null ? '' : value[key]).trim()) {
      return {found:true,reason:'named_credential_field',path:at + '.' + key};
    }
    const hit = find(value[key],at + '.' + key,visited);
    if (hit) return hit;
  }
  visited.delete(value);
  return null;
}

module.exports = {find,stringReason,PATTERNS};
