// ⬡B:core.ham_session_authorization:MODULE:signed_ham_session_boundary:20260717⬡
// entered via the ABAHAM door, serving the authenticated MESSAGES portal path to a HAM
'use strict';

const crypto = require('node:crypto');

const COOKIE_NAME = 'anu_ham';
const HAM_PATTERN = /^[A-Z0-9._:-]{2,160}$/;

// ⬡B:core.ham_session_authorization:BUILD:two_tiers_one_signer_because_a_typed_id_is_not_a_password:20260728⬡
//
// THE FOUNDER ORDER, 20260728, in his own words: "Nobody would ever have these keys unless I
// gave it to them... I want them to be able to enter in that UID to get to their world. It
// becomes their world. I absolutely want that. Add that back... If the sign-in link works it
// works, but we have multiple ways, and UID is one of those."
//
// THE PROBLEM THAT MAKES THIS HARD, and it is not a hypothetical. PR #1275 closed a measured
// P0: POST /os/wake/<anything> answered 200 plus a signed THIRTY DAY cookie for any string a
// stranger could type, on both origins. RULINGS #1087 states the law it broke: "A public
// per-HAM URL must never mint its own trusted session, and 'the page already trusts the URL'
// is not an argument, it is the hole." Simply putting that behavior back would hand any
// passer-by a permanent full trust credential for any world whose id they glimpse in a URL
// bar, in every stranger's inherited world, forever. That is not a trade this estate can make.
//
// THE RESOLUTION, and it is the only one that serves both facts at once: A TYPED WORLD ID DOES
// OPEN THE WORLD, AND WHAT IT OPENS IT WITH IS NOT THE SAME CREDENTIAL A SIGN-IN OPENS IT WITH.
// There are now two tiers, and they are produced and verified by ONE signer in ONE file, which
// is this one. There is no second session module and there is no second cookie.
//
//   sign_in    what the emailed HMAC link, the Google callback and the arrival invite code
//              mint. Full trust, 30 days, unchanged in every byte. This is the credential
//              every sensitive door in the estate has always meant when it said "a session".
//
//   world_id   what a typed world id mints. TWELVE HOURS, and marked as such INSIDE the signed
//              payload, so the tier is a signed fact and not a claim a caller can edit. It
//              opens the world's own surfaces and it is refused by every door that can spend,
//              provision, change identity, or reach a human. See signInTierGuard below.
//
// WHY THE TIER IS IN THE SIGNED PAYLOAD RATHER THAN IN A SECOND COOKIE. A second cookie is a
// second thing a caller controls, and "which cookie did you send" is not a question a security
// boundary may ask a stranger. The payload is inside the MAC, so downgrading a world_id token
// to a bare sign_in one, or pushing its expiry out, changes the bytes the MAC was computed over
// and the token stops verifying at all. Tested in tests/world.id.opens.a.weaker.door.test.js.
//
// WHY THE SEPARATOR IS '~'. HAM_PATTERN admits A-Z, 0-9, dot, underscore, colon and hyphen and
// nothing else, so a tilde can never occur inside a real world id. That means the split is
// unambiguous and no world id can ever be typed in a way that forges a tier field. A legacy
// payload has no tilde in it at all, which is exactly why every cookie already in a browser
// keeps working and keeps its full trust.
//
// THE ENUMERATION SIGNAL, STATED PLAINLY RATHER THAN HIDDEN. Requirement four of this order is
// that a string which is not a real world gets a refusal, so a real id and a made up id now
// answer differently at the world id door. That IS an existence oracle for world ids, it is
// inherent to being told "a typed id must open a real world and refuse a fake one", and it is
// accepted with open eyes rather than papered over with a fake 200. It is written into
// docs/RULINGS.md as an accepted cost, not as an oversight, so the next coder does not "fix"
// it by making the door lie. What it leaks is which ids exist. What it does not leak, because
// of the tier split below, is anything that costs money, sends anything to a human, or changes
// who anybody is.
const TIER_SIGN_IN = 'sign_in';
const TIER_WORLD_ID = 'world_id';
const TIER_SEPARATOR = '~';
const WORLD_ID_MARK = 'w1';
const WORLD_ID_TTL_SECONDS = 12 * 60 * 60;
// ⬡B:core.ham_session_authorization:FIX:uppercasing_before_checking_let_case_folding_invent_a_world:20260726⬡
// The SAME shape of the world ID pattern, but written to be tested against the input BEFORE
// it is uppercased, which is the whole point of its existing.
//
// normalizeHamUid used to uppercase first and test second. toUpperCase() is Unicode case
// folding, not an ASCII operation, and several characters EXPAND or change under it:
//   'ß'  -> 'SS'      so worldIdForPage('ß')  returned the real world ID SS
//   'ßß' -> 'SSSS'    so two of them returned SSSS
//   'ﬁx' -> 'FIX'     so a ligature returned FIX
// Every one of those passed HAM_PATTERN afterwards, because by then they WERE plain ASCII.
// So the canon written to stop one person's world being silently renamed into another's was
// itself renaming worlds, by the exact mechanism it exists to refuse, and the value it
// invented was a legal ID that another person may actually hold. Worse than the page bug it
// replaced: the old strip-then-uppercase produced an empty string here and refused.
//
// This is not only a page concern. normalizeHamUid is what signHamSession and
// verifySessionToken normalize through, so the fold sat on the session path too.
//
// Checking the raw input first closes it: a character that is not already one of the canon's
// own characters, in either case, never reaches toUpperCase() and never gets the chance to
// become one. Found by external review (Codex, anew#1171).
const HAM_INPUT_PATTERN = /^[A-Za-z0-9._:-]{2,160}$/;
const MAC_PATTERN = /^[a-f0-9]{64}$/;

// Preserve the signed-session key order already used by advisor.face.routes.
// MEMORY_BANK_KEY is the migration-compatible fallback when the legacy bank key
// is not present. Both are existing server-only environment values.
function signingSecret() {
  return process.env.AIBE_BRAIN_KEY || process.env.MEMORY_BANK_KEY || '';
}

function normalizeHamUid(value) {
  // The input is judged as it arrived. Only something already made of the canon's characters
  // is allowed to be case folded, so folding can never manufacture an ID that was not typed.
  const raw = String(value || '').trim();
  if (!HAM_INPUT_PATTERN.test(raw)) return null;
  const hamUid = raw.toUpperCase();
  return HAM_PATTERN.test(hamUid) ? hamUid : null;
}

// The one place a MAC is computed, for both tiers. Whatever string is handed here is what the
// signature covers, so a field that is not part of this string is not a signed fact.
function macFor(payload) {
  const secret = signingSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// THE FULL TRUST TIER, byte identical to what this function has always produced. The payload is
// the bare normalized world id with no tier field in it, which is what makes every session
// cookie already sitting in a real browser keep working and keep its full trust across this
// change. A legacy token is a sign_in token; that is a decision, and it is the safe direction,
// because the only things that could ever mint one are the emailed link, the OAuth callback,
// the invite code and this server's own internal leg.
function signHamSession(hamUid) {
  const normalized = normalizeHamUid(hamUid);
  const mac = normalized ? macFor(normalized) : null;
  if (!normalized || !mac) return null;
  return normalized + '.' + mac;
}

// THE WEAKER TIER. Same signer, same secret, same cookie name, same verifier. Three differences
// and every one of them is deliberate:
//   1. the payload carries the tier mark, so the verifier knows this is a typed-id credential
//      and the guard below can refuse it at the doors that matter;
//   2. the payload carries an absolute expiry in whole seconds, enforced at verify time, so
//      this credential dies on its own twelve hours later with nothing to revoke;
//   3. it is minted only by core/world.id.entry.js, which proves the world EXISTS first.
// Existing is not owning. That is precisely why this tier is weaker rather than equal.
// ⬡B:core.ham_session_authorization:FIX:the_ttl_clamp_read_zero_as_absent_and_kept_fractions:20260728⬡
// FOUND BY CATHY (Codex) on template-mind #313, and the same expression was written twice, so it
// was wrong twice and could drift apart later as well. Two defects in one line:
//
//   Number((opts && opts.ttlSeconds) || DEFAULT) || DEFAULT
//
//   1. `||` cannot tell an OMITTED ttl from a ttl of ZERO, and zero is falsy, so a caller asking
//      for the shortest possible credential got the twelve hour default instead of the sixty
//      second floor. The clamp below reads as if it enforces a minimum; on that one input it
//      granted the maximum. A guard that inverts on its own edge case is worse than no guard,
//      because the call site looks careful.
//   2. A fractional ttl survived the clamp, and an expiry with a decimal point in it is not
//      what parseSessionPayload accepts, so the credential was minted and then rejected by its
//      own verifier: a token that exists and cannot be used.
//
// Normalized once, here, and both call sites read it. Omitted or unusable falls back to the
// default; a real number is floored to whole seconds and clamped into [60, WORLD_ID_TTL_SECONDS].
// The ceiling matters as much as the floor: no caller may widen this tier past twelve hours.
function normalizedTtlSeconds(opts) {
  const raw = opts ? opts.ttlSeconds : undefined;
  const asked = (raw === undefined || raw === null || raw === '') ? WORLD_ID_TTL_SECONDS : Number(raw);
  const whole = Number.isFinite(asked) ? Math.floor(asked) : WORLD_ID_TTL_SECONDS;
  return Math.max(60, Math.min(whole, WORLD_ID_TTL_SECONDS));
}

function signWorldIdSession(hamUid, opts) {
  const normalized = normalizeHamUid(hamUid);
  if (!normalized) return null;
  const ttl = normalizedTtlSeconds(opts);
  const nowSeconds = Math.floor(((opts && opts.now) || Date.now()) / 1000);
  const payload = normalized + TIER_SEPARATOR + WORLD_ID_MARK + TIER_SEPARATOR + (nowSeconds + ttl);
  const mac = macFor(payload);
  if (!mac) return null;
  return payload + '.' + mac;
}

// The ready made Set-Cookie value for the weaker tier, so no route file hand writes cookie
// attributes for a credential whose whole point is that it is narrower than the other one. A
// door that spelled its own Max-Age could silently grant thirty days again.
function worldIdSessionCookie(hamUid, opts) {
  const token = signWorldIdSession(hamUid, opts);
  if (!token) return null;
  // The SAME normalizer the token used, not a second copy of the arithmetic. When these were
  // two expressions, a Max-Age and the expiry inside the signed payload could disagree, and the
  // browser would keep sending a cookie the verifier had already stopped accepting.
  const ttl = normalizedTtlSeconds(opts);
  return COOKIE_NAME + '=' + encodeURIComponent(token)
    + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + ttl;
}

// Reads a payload back into its parts and states the CANONICAL bytes the MAC must be checked
// against. Returning the canonical form rather than re-serialising at the call site is what
// stops a lenient parser from accepting one string and verifying a different one.
function parseSessionPayload(payload) {
  if (payload.indexOf(TIER_SEPARATOR) === -1) {
    const hamUid = normalizeHamUid(payload);
    if (!hamUid) return null;
    return { hamUid:hamUid, via:TIER_SIGN_IN, expiresAt:null, canonical:hamUid };
  }
  const parts = payload.split(TIER_SEPARATOR);
  if (parts.length !== 3) return null;
  if (parts[1] !== WORLD_ID_MARK) return null;
  if (!/^[0-9]{1,12}$/.test(parts[2])) return null;
  const hamUid = normalizeHamUid(parts[0]);
  if (!hamUid) return null;
  return {
    hamUid: hamUid,
    via: TIER_WORLD_ID,
    expiresAt: Number(parts[2]),
    canonical: hamUid + TIER_SEPARATOR + WORLD_ID_MARK + TIER_SEPARATOR + parts[2]
  };
}

function verifySessionToken(token) {
  const secret = signingSecret();
  if (!secret) return { ok:false, status:503, reason:'ham_session_secret_unconfigured' };
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw || raw.length > 320) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return { ok:false, status:401, reason:'ham_session_invalid' };
  const parsed = parseSessionPayload(raw.slice(0, separator));
  const suppliedMac = raw.slice(separator + 1).toLowerCase();
  if (!parsed || !MAC_PATTERN.test(suppliedMac)) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  const expectedMac = macFor(parsed.canonical);
  const supplied = Buffer.from(suppliedMac, 'hex');
  const expected = Buffer.from(String(expectedMac || ''), 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return { ok:false, status:401, reason:'ham_session_invalid' };
  }
  // THE EXPIRY IS CHECKED AFTER THE SIGNATURE, never before: an unsigned expiry is a number a
  // stranger typed. Only the sign_in tier has no expiry here, and that is the pre-existing
  // 30 day cookie lifetime the browser enforces, which is a separate question this change
  // deliberately does not reopen.
  if (parsed.via === TIER_WORLD_ID && !(parsed.expiresAt * 1000 > Date.now())) {
    return { ok:false, status:401, reason:'world_id_session_expired' };
  }
  return { ok:true, hamUid:parsed.hamUid, via:parsed.via, expiresAt:parsed.expiresAt };
}

function cookieToken(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (e) { return null; }
}

function bearerToken(authorization) {
  if (typeof authorization !== 'string') return null;
  const match = authorization.match(/^Bearer[ \t]+([^ \t]+)[ \t]*$/i);
  return match ? match[1] : null;
}

function sessionTokenFromRequest(req) {
  const requestHeaders = req && req.headers || {};
  const authorization = requestHeaders.authorization || requestHeaders.Authorization;
  if (authorization !== undefined) return bearerToken(authorization);
  return cookieToken(requestHeaders.cookie || requestHeaders.Cookie);
}

function forwardSessionHeaders(req, headers) {
  const out = headers || {};
  const token = sessionTokenFromRequest(req);
  if (token) out.Authorization = 'Bearer ' + token;
  return out;
}

// Authenticate the signed session before a route reads caller-selected identity.
// Routes whose HAM lives in a path/body use authorizeHamRequest below to add the
// exact-HAM comparison. Session-owned doors such as /cib use this form and take
// the HAM only from the verified credential.
function authorizeSessionRequest(req) {
  const requestHeaders = req && req.headers || {};
  const authorization = requestHeaders.authorization || requestHeaders.Authorization;
  let credential = null;
  let kind = null;
  if (authorization !== undefined) {
    credential = bearerToken(authorization);
    kind = 'bearer';
    // An explicit Authorization header is authoritative. Never downgrade an
    // invalid bearer to a cookie that happened to ride beside it.
    if (!credential) return { ok:false, status:401, reason:'ham_session_invalid' };
  } else {
    credential = cookieToken(requestHeaders.cookie || requestHeaders.Cookie);
    kind = 'cookie';
  }
  if (!credential) return { ok:false, status:401, reason:'ham_session_required' };
  const verified = verifySessionToken(credential);
  if (!verified.ok) return verified;
  return { ok:true, hamUid:verified.hamUid, kind:kind, via:verified.via,
    expiresAt:verified.expiresAt };
}

function authorizeHamRequest(req, expectedHamUid) {
  const expected = normalizeHamUid(expectedHamUid);
  if (!expected) return { ok:false, status:400, reason:'valid_ham_uid_required' };
  const verified = authorizeSessionRequest(req);
  if (!verified.ok) return verified;
  if (verified.hamUid !== expected) {
    return { ok:false, status:403, reason:'ham_session_forbidden' };
  }
  return { ok:true, hamUid:expected, kind:verified.kind, via:verified.via,
    expiresAt:verified.expiresAt };
}

// Signed-session authentication is the proof. Atmosphere then canonicalizes the
// authenticated HAM and supplies its world context. A caller-selected alias may
// never resolve to a different HAM for an exact-HAM protected read.
async function authorizeExactHamRequest(req, expectedHamUid, deps) {
  const session = authorizeHamRequest(req, expectedHamUid);
  if (!session.ok) return session;
  const resolveAtmosphere = deps && deps.resolveAtmosphere
    || require('./atmosphere.gate.js').resolveAtmosphere;
  let envelope;
  try { envelope = await resolveAtmosphere({ hamUid:session.hamUid }); }
  catch (e) { return { ok:false, status:503, reason:'atmosphere_unavailable' }; }
  const resolved = normalizeHamUid(envelope && envelope.ham_uid);
  if (!resolved) return { ok:false, status:401, reason:'identity_unresolved' };
  if (resolved !== session.hamUid) {
    return { ok:false, status:409, reason:'ham_uid_mismatch' };
  }
  return { ok:true, hamUid:resolved, kind:session.kind, via:session.via,
    expiresAt:session.expiresAt, envelope:envelope };
}

// ⬡B:core.ham_session_authorization:WIRE:internal_callers_sign_the_same_session:20260725⬡
// THE INTERNAL LEG OF THE SAME ONE SOURCE. The mind calls its own founder-scoped OS
// doors over SELF_BASE_URL (alive.arrive, alive.pulse, the screen piece registry, the
// dawn agent). Those hops leave this process and come back in over the public internet,
// so they are indistinguishable from a stranger at the door and CANNOT be recognized by
// origin. Before this, that was the whole reason those doors could not be closed: closing
// them would have blinded A'NU to the founder's own calendar.
//
// So the internal caller proves itself with the SAME signed session a browser carries,
// minted here from the SAME server-only secret, verified by the SAME verifySessionToken.
// No second idiom, no shared "internal key", no new environment variable: a server that
// already holds the signing secret can always mint a token for the HAM it is serving,
// and a server that does not hold it gets null and is refused like anyone else.
//
// Returns null (never a partial or empty header bag) when the secret or the HAM is
// missing, so a caller that spreads it into a fetch sends nothing rather than sending a
// header that looks like credentials and is not.
function internalSessionHeaders(hamUid) {
  const token = signHamSession(hamUid);
  if (!token) return null;
  return { Authorization: 'Bearer ' + token };
}

function requireHamSession(req, res, expectedHamUid) {
  const authorized = authorizeHamRequest(req, expectedHamUid);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

async function requireExactHamSession(req, res, expectedHamUid, deps) {
  const authorized = await authorizeExactHamRequest(req, expectedHamUid, deps);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

function requireAnyHamSession(req, res) {
  const authorized = authorizeSessionRequest(req);
  if (!authorized.ok) {
    if (authorized.status === 401 && res && typeof res.set === 'function') {
      res.set('WWW-Authenticate', 'Bearer realm="A\'NU Command Center"');
    }
    res.status(authorized.status || 401).json({ ok:false, reason:authorized.reason });
    return null;
  }
  if (res && typeof res.set === 'function') {
    res.set('Cache-Control', 'private, no-store');
  }
  return authorized;
}

// ⬡B:core.ham_session_authorization:BUILD:the_tier_is_enforced_by_default_deny_not_by_memory:20260728⬡
//
// WHAT A world_id CREDENTIAL MAY DO, decided here, once, for the whole estate.
//
// The order this was built to says: "Anything that can spend, provision, change identity, or
// reach a human still requires the full sign-in tier. Find those doors and gate them on the
// tier, not on mere presence of a cookie... If you are unsure whether a door belongs in this
// list, gate it (fail closed)."
//
// A HAND WRITTEN LIST OF DANGEROUS DOORS IS THE WRONG SHAPE AND THIS FILE ALREADY KNOWS IT.
// scripts/check_entry_mount_symmetry.js says it about itself in its own header: "a gate that
// guards a fixed pair guards that pair and nothing else, so every door added afterwards is
// unguarded by construction." Fifty-one files in this repo read a signed session. Enumerating
// the risky ones means a door added next week is open to a typed world id because nobody
// remembered to add it, which is the exact defect shape docs/RULINGS.md keeps recording.
//
// SO THE POLICY IS INVERTED AND STATED AS ONE RULE: A TYPED WORLD ID GRANTS READING, NOT DOING.
// Anything that changes state, which on this estate means any method other than GET, HEAD or
// OPTIONS, is refused to a world_id credential unless it is on the short, explicit,
// individually reasoned list below. A new spending door, a new outbound reach, a new
// provisioning door, a new credential rotation: every one of them is refused the day it is
// written, by construction, with nobody having to notice it exists. That is what fail closed
// means, and it is the property a list can never have.
//
// THE LIST OF WRITES A TYPED WORLD ID MAY STILL MAKE, one line of reasoning each. These are
// the only writes needed to open a world and stand in it. Nothing here moves money to a
// recipient the person names, sends anything to a human, or changes who anybody is.
//
//   POST /auth/home/ham        the world id door itself. Refusing it would be refusing the
//                              order this whole change exists to serve.
//   POST /os/wake/:hamUid      the same door on the other surface, one shared implementation.
//   POST /os/sleep             clears the cookie. Being able to leave is never a privilege.
//   POST /auth/advisor/request asks for the emailed sign-in link. It is open to callers with
//                              NO credential at all, so refusing it to a weaker one grants an
//                              attacker nothing and would strand the one person it serves: a
//                              reader who opened with a world id and now wants to sign in
//                              properly. It also names no recipient the caller chooses, it
//                              resolves the address through the bank.
//   POST /door/where           the world page's own render decision, and the reason it is here
//   POST /arrive/decide        rather than refused deserves the argument rather than a wave.
//                              Both run the arrival wonder, which is a model call, which costs
//                              money, and "anything that can spend" is on the refuse list. The
//                              distinction being drawn is DIRECTED spend versus the cost of
//                              rendering the page the person is already allowed to see. These
//                              two doors take no recipient, no amount, no destination and no
//                              free text; they answer "which surface does this world open on",
//                              exactly once per page load, for the world the credential already
//                              names. Refusing them makes requirement one of the order
//                              impossible, because the world would not actually open. The
//                              spend that IS refused is the spend a person aims: POST
//                              /cara/chat and every voice and reach door are absent from this
//                              list and are therefore closed to a typed world id.
//
// AND SOME PATHS ARE REFUSED IN EVERY METHOD, INCLUDING GET.
//
// ⬡B:core.ham_session_authorization:FIX:a_get_that_mints_or_spends_is_not_a_read:20260728⬡
// The method-based exemption below treats GET as safe, and that is true of a GET that returns
// bytes this world already owns. It is NOT true of a GET whose side effect is a credential or
// a provider bill, and this list is where that distinction gets written down instead of being
// re-derived by whoever adds the next route.
//
// FOUND BY CATHY (Codex) on #1301, and it was a real hole rather than a style note.
// GET /vara/convai/url is guarded only by requireHamSession, so the blanket GET exemption let a
// typed world id through it. That handler asks ElevenLabs for a SIGNED CONVERSATION URL and
// returns it, which is both provider usage and a second credential handed to the caller, on a
// tier whose entire promise is that it cannot spend and cannot mint. Everything else about the
// tier was correct and this one door undid the promise, which is exactly the shape a blanket
// allow produces: the guard was right, its exemption was a category error.
//
// THE RULE FOR THE NEXT CODER, stated so this is not found a third time: a GET belongs on this
// list when answering it costs money or hands back anything that authorizes a later call. It
// does not belong here merely for being sensitive; the world_id tier is allowed to read the
// world it names.
//
// /arrive/provision is on the list for a different reason and both reasons are real: reading it
// is already the harm, because it renders the host operator surface for creating worlds. Its
// own gate compares the session to the env named host, and a world_id credential for the host's
// own world would have satisfied that comparison. core/world.birth.js now checks the tier
// itself as well, so this is defense in depth and not the only lock.
// ⬡B:core.ham_session_authorization:FIX:the_first_sweep_grepped_for_the_wrong_words:20260728⬡
// The two file download doors were found by CATHY (Codex) AFTER the ConvAI fix above, and the
// miss is worth recording because the rule was already written and the sweep still missed them.
// That sweep grepped handler bodies for `/object/sign` and `createSignedUrl`; the CLAIR door
// calls `store.signedUrl(key, 300)` through a helper, so it matched no pattern and read as
// clean. Grepping for the SPELLING of a side effect finds the doors that spell it your way.
// The second pass enumerated every app.get in routes/ and read what each handler actually does,
// which is the only version of this sweep that is worth anything.
//
// Both doors sign a five minute storage URL and REDIRECT the caller to it. That URL is bearer
// authority: it carries no cookie, so once handed over it works for anyone holding the string,
// which is squarely the "hands back something that authorizes a later call" case.
//
// Checked and deliberately NOT added, so the next lane does not re-litigate them:
//   GET /auth/advisor/enter   mints the FULL tier, and must stay reachable. It is gated on the
//                             emailed token, not on the cookie, and it is the one path by which
//                             a person holding a typed world id upgrades to a real sign in.
//                             Refusing it here would make the weaker tier a trap.
//   GET /seer/veer/providers  reports which providers are CONFIGURED as booleans, no call.
//   GET /seated/api/status    same shape, a boolean off an env var.
//   GET /vara/call/status     reads a worker health endpoint, mints nothing.
//   GET /stream/live/:token   CONSUMES a credential rather than issuing one.
const SIGN_IN_TIER_ONLY_PATHS = [
  /^\/arrive\/provision(\/|$)/i,
  /^\/vara\/convai\/url(\/|$)/i,
  /^\/cara\/files\/[^/]+\/download(\/|$)/i,
  /^\/clair\/[^/]+\/files\/download(\/|$)/i
];

// ⬡B:core.ham_session_authorization:FIX:the_wall_blocked_the_upgrade_the_page_advertised:20260728⬡
// CATHY (Codex) on #1301, and this one was caused by the fix directly above it, which is the
// honest way to record it. Letting a typed world id see the root form again put the Google
// button back in front of that person, and the Google leg finishes at POST
// /auth/advisor/resolve, which was NOT on this list. So the wall refused the very upgrade the
// page had just offered: a button that is visible, enabled, and answers 403.
//
// Allowing it is not a loosening, and the reason is the test to apply to anything added here.
// That handler takes an access token, verifies it against the provider, reads the email the
// PROVIDER attests to, and resolves that email to a world. Nothing the caller says about
// themselves is believed. It is the same shape as /auth/advisor/request and the emailed link,
// and it is the shape every upgrade door must have: it proves a credential the weaker tier
// cannot forge BEFORE it mints anything. A door that merely writes something is not eligible.
const WORLD_ID_MAY_WRITE_PATHS = [
  /^\/auth\/home\/ham$/i,
  /^\/auth\/advisor\/request$/i,
  /^\/auth\/advisor\/resolve$/i,
  /^\/os\/wake\/[^/]+$/i,
  /^\/os\/sleep$/i,
  /^\/door\/where$/i,
  /^\/arrive\/decide$/i
];

// ⬡B:core.ham_session_authorization:FIX:a_read_that_re_enters_the_router_as_a_post:20260728⬡
// CATHY (Codex) on #1301. GET /api/awa/jobs?assignee=<world> passes this guard as the read it
// is, and then routes/air.compat.routes.js rewrites req.method to POST and req.url to
// /awa/<world>/canvas and calls app.handle again. The second pass sees a POST that is on no
// list and refuses, so the weaker tier could not open a surface that only reads.
//
// KEPT AS ITS OWN LIST RATHER THAN ADDED TO THE ONE ABOVE, deliberately. That list is doors
// this tier may ACT through. This one is reads that happen to be spelled POST because the
// request carries a body. Merging them would lose the distinction the whole guard rests on,
// and the next coder would read a write door as blessed.
//
// THE REJECTED ALTERNATIVE, written down so it is not retried as an improvement: marking the
// request as already judged and skipping the second pass. It is more general and it is wrong.
// The guard's question is what this credential CAUSES, not how many times a router saw it, so
// a future alias that rewrote a GET into a door that writes would sail through on a marker
// saying an earlier read was fine. Judging the final path every time is the property worth
// keeping; the fix belongs in what the final path is allowed to be.
//
// EACH ENTRY IS A CLAIM ABOUT A HANDLER, and the claim is verified rather than assumed:
// routes/awa.routes.js POST /awa/:hamUid/canvas reads AWA_JOB beads through Agent FIND and
// composes panels. No insert, no update, no delete, no model call, no outbound reach. The test
// beside this file reads that handler's source and fails if it ever gains one, because an
// allowlist entry whose claim has quietly stopped being true is a hole with a comment on it.
const WORLD_ID_READ_SHAPED_POSTS = [
  /^\/awa\/[^/]+\/canvas$/i
];

const READ_ONLY_METHODS = { GET:true, HEAD:true, OPTIONS:true };

// The verdict, as a pure function of the three facts it depends on, so a test can drive every
// combination without an HTTP server. Returns null when there is nothing to refuse.
function worldIdTierRefusal(method, urlPath, via) {
  if (via !== TIER_WORLD_ID) return null;
  const path = String(urlPath || '').split('?')[0];
  for (const pattern of SIGN_IN_TIER_ONLY_PATHS) {
    if (pattern.test(path)) {
      return { status:403, reason:'sign_in_required_for_this' };
    }
  }
  if (READ_ONLY_METHODS[String(method || '').toUpperCase()]) return null;
  for (const pattern of WORLD_ID_READ_SHAPED_POSTS) {
    if (pattern.test(path)) return null;
  }
  for (const pattern of WORLD_ID_MAY_WRITE_PATHS) {
    if (pattern.test(path)) return null;
  }
  return { status:403, reason:'sign_in_required_for_this' };
}

// Mounted on BOTH entry points, ahead of every route, so there is no door on either surface it
// does not stand in front of. It judges nothing about callers who hold the full tier or no
// credential at all: those requests reach exactly the gates they always did.
function signInTierGuard(req, res, next) {
  const session = authorizeSessionRequest(req);
  if (!session.ok) return next();
  const refusal = worldIdTierRefusal(req.method, req.path || req.url, session.via);
  if (!refusal) return next();
  res.status(refusal.status);
  if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store');
  return res.json({ ok:false, reason:refusal.reason,
    stamp:'⬡B:core.ham_session_authorization:RESULT:world_id_tier_may_read_not_do:20260728⬡' });
}

// For a door that wants to state the requirement itself rather than lean on the guard above.
// core/world.birth.js is the first caller and the reason this exists: a lock worth having is
// worth having twice.
function requireSignInTier(session) {
  if (!session || !session.ok) return session || { ok:false, status:401, reason:'ham_session_required' };
  if (session.via !== TIER_SIGN_IN) {
    return { ok:false, status:403, reason:'sign_in_required_for_this' };
  }
  return session;
}

// ⬡B:core.ham_session_authorization:FIX:the_door_was_wide_and_every_room_was_narrow:20260726⬡
// WHY THIS EXISTS. HAM_PATTERN above is the one shape a world ID has in this estate, and it
// allows a dot and a colon: BDIF.ADVISOR is a real world. Thirteen page builders did not ask
// for that shape. Each carried its own private line, some spelled esc(), some spelled inline,
// all of them the same: String(x).replace(/[^A-Za-z0-9_-]/g,'').toUpperCase(). That line does
// not reject a world it fails to recognize. It EDITS it. BDIF.ADVISOR was proven at the door,
// handed to the page, and quietly rewritten to BDIFADVISOR before it was baked into the
// markup, so every fetch the page then made asked the engine about a world that does not
// exist and got nothing back. The person saw an empty room and no error, because from cold
// code's point of view nothing had failed.
//
// WHAT THIS IS FOR. A page builder interpolates a world ID into HTML text and into a
// double-quoted JS string literal, so it does need a guarantee about the characters. It gets
// one here, from the canon shape rather than from a private guess: HAM_PATTERN admits only
// A-Z, 0-9, dot, underscore, colon and hyphen. None of those can close a string literal, open
// a tag, or start an entity, so a value that PASSES is safe to interpolate as-is.
//
// The difference that matters is what happens to a value that does not pass. This refuses it
// and returns null. It never returns a repaired one. Editing an identity until it fits is how
// one person's world silently became a different address, and a room is allowed to say it did
// not recognize somebody; it is not allowed to quietly decide they are somebody else.
function worldIdForPage(value) {
  return normalizeHamUid(value);
}

module.exports = {
  COOKIE_NAME,
  TIER_SIGN_IN,
  TIER_WORLD_ID,
  WORLD_ID_TTL_SECONDS,
  signingSecret,
  normalizeHamUid,
  worldIdForPage,
  signHamSession,
  signWorldIdSession,
  worldIdSessionCookie,
  worldIdTierRefusal,
  signInTierGuard,
  requireSignInTier,
  verifySessionToken,
  sessionTokenFromRequest,
  forwardSessionHeaders,
  authorizeSessionRequest,
  authorizeHamRequest,
  authorizeExactHamRequest,
  internalSessionHeaders,
  requireHamSession,
  requireExactHamSession,
  requireAnyHamSession,
  _test:{ cookieToken, bearerToken }
};
