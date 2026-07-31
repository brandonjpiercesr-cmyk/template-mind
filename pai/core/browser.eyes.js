// ⬡B:core.browser.eyes:MODULE:a_real_browser_that_reports_facts_and_judges_nothing:20260727⬡
// THE EYES. Founder order, 20260727: "If she can look at her own stuff after she gets done
// working on it, and she can install a browser, we need to do that... Don't you think
// WATCHDOG could use that? Think about how much better that will make coding."
//
// This organ opens a real headless Chromium on a real URL and brings back what was actually
// there: the HTTP status, the URL it ended on after redirects, the page title, the visible
// text, the console errors, the network requests that failed, and a screenshot stored as a
// real object with a signed URL.
//
// LAWS honored:
// - GRANDDADDY 911. Cold code never decides what a page MEANS. Every field below is a
//   measurement. There is no verdict field, no pass, no fail, no "looks fine", no severity.
//   The cycle reads these facts and SHE says what they mean. This module is a WORK that feeds
//   the wonder; it never speaks and it never concludes.
// - ONE SOURCE. Screenshots go to core/clair.files.store.js, the store that already exists
//   and already mints short lived signed URLs. No second bucket, no second signer, and never
//   a base64 blob dumped into a bead.
// - REAL RECEIPTS ONLY. Every miss returns a NAMED reason. Nothing here throws at a caller
//   and nothing here returns a hollow ok:true.
// - IDENTITY IS ENV ONLY. No person, no HAM UID, no host, no address is written into this
//   file. The world is whatever the caller proved.
// - DEFAULT OFF. BROWSER_EYES_ENABLED is unset by default and this organ refuses until a
//   deploy sets it. It is not flipped on anywhere in this repo.
//
// SAFETY. A browser that fetches whatever URL an input names is a server side request forgery
// engine. The refusals in this file are the point of this file, not decoration around it:
// scheme allowlist, no credentials in the URL, port allowlist, hostname suffix refusals, full
// DNS resolution with every returned address checked against the private, loopback, link local,
// carrier grade NAT, multicast and reserved ranges, cloud metadata endpoints refused by the
// ranges that contain them, and the SAME guard re-run on every single request the page makes
// so a public page cannot redirect or fetch its way inside.
'use strict';

var dns = require('node:dns').promises;
var net = require('node:net');

var brain = null;
try { brain = require('./brain.client.js'); } catch (eBrain) { brain = null; }
var fileStore = null;
try { fileStore = require('./clair.files.store.js'); } catch (eStore) { fileStore = null; }

// ---------------------------------------------------------------------------
// THE FLAG. Default off, read at call time so a deploy can arm it without a restart
// of anything that required this file early.
// ---------------------------------------------------------------------------
function truthy(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
function enabled(env) { return truthy((env || process.env).BROWSER_EYES_ENABLED); }

// A LOCAL ONLY knob, also default off, and deliberately separate from the main flag.
// It exists so this organ can be proved against a page served on 127.0.0.1 by a test or a
// coder at their desk. It is env only: no argument, no request body, and no tool call can
// reach it, because an argument controlled loopback bypass IS the SSRF hole this file refuses.
function loopbackAllowed(env) { return truthy((env || process.env).BROWSER_EYES_ALLOW_LOOPBACK); }

function numberEnv(env, key, fallback, min, max) {
  var raw = Number((env || process.env)[key]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

var TIMEOUT_FLOOR_MS = 1000;
var TIMEOUT_CEILING_MS = 30000;
var DEFAULT_TIMEOUT_MS = 15000;
var DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
var DEFAULT_MAX_TEXT = 20000;
var BEAD_TEXT_CAP = 4000;
var MAX_URL_LENGTH = 2048;
var MAX_CONSOLE_ERRORS = 40;
var MAX_FAILED_REQUESTS = 40;
var MAX_REDIRECTS = 10;
var MAX_CONCURRENCY_CEILING = 2;
var DEFAULT_CLEANUP_TIMEOUT_MS = 2000;
var MAX_VIEWPORT_WIDTH = 1920;
var MAX_VIEWPORT_HEIGHT = 1200;
var MAX_FULL_PAGE_HEIGHT = 4000;
var activeObservations = 0;
var CLEANUP_OWNER_MISSING = Object.freeze({ reason: 'browser_eyes_process_owner_missing' });
// Every unverified owned process remains independently accountable. The value is the exact
// exit listener registered for that child, which lets the race closure remove stale listeners.
var cleanupQuarantine = new Map();
var runtimeProbeCache = { value: null, expires_at: 0, inflight: null };

// Ports a public web page is actually served on. Anything else is a scan, not a look.
var ALLOWED_PORTS = { '80': true, '443': true, '8080': true, '8443': true };

// Chromium is a substantial child process and the active mind is a bounded service, not a
// browser farm. Default to one look at a time and refuse excess work instead of letting parallel
// launches turn one observation into a whole-service out-of-memory restart.
function observationCapacity(env) {
  return numberEnv(env || process.env, 'BROWSER_EYES_MAX_CONCURRENCY', 1, 1,
    MAX_CONCURRENCY_CEILING);
}
function reserveObservation(env) {
  var limit = observationCapacity(env);
  if (cleanupQuarantine.size > 0) {
    return { ok: false, reason: 'browser_eyes_cleanup_unverified',
      active: activeObservations, limit: limit };
  }
  if (activeObservations >= limit) {
    return { ok: false, reason: 'browser_eyes_busy', active: activeObservations, limit: limit };
  }
  activeObservations += 1;
  return { ok: true, active: activeObservations, limit: limit };
}
function releaseObservation() {
  activeObservations = Math.max(0, activeObservations - 1);
}
function concurrencyStatus(env) {
  return { active: activeObservations, limit: observationCapacity(env),
    cleanup_blocked: cleanupQuarantine.size > 0 };
}

function childHasExited(child) {
  return !!child && (child.exitCode !== null && child.exitCode !== undefined ||
    child.signalCode !== null && child.signalCode !== undefined);
}

function waitForChildExit(child, timeoutMs, dependencies) {
  if (!child || childHasExited(child)) return Promise.resolve(true);
  var deps = dependencies || {};
  var arm = deps.setTimeout || setTimeout;
  var disarm = deps.clearTimeout || clearTimeout;
  return new Promise(function (resolve) {
    var settled = false;
    var timer = null;
    function finish(value) {
      if (settled) return;
      settled = true;
      if (timer !== null) disarm(timer);
      if (typeof child.removeListener === 'function') child.removeListener('exit', onExit);
      resolve(value);
    }
    function onExit() { finish(true); }
    if (typeof child.once === 'function') child.once('exit', onExit);
    timer = arm(function () { finish(childHasExited(child)); }, Math.max(0, timeoutMs));
  });
}

function setCleanupQuarantine(child) {
  if (!child) {
    cleanupQuarantine.set(CLEANUP_OWNER_MISSING, null);
    return;
  }
  // ⬡B:core.browser_eyes:FIX:exit_cannot_hide_between_wait_and_quarantine:20260730⬡
  // A real ChildProcess sets exitCode or signalCode before it emits exit. Check both before and
  // after arming the listener so an exit in either boundary window cannot leave a dead child in
  // permanent quarantine. The listener owns its own cleanup when the second check wins.
  if (childHasExited(child)) {
    var staleListener = cleanupQuarantine.get(child);
    if (staleListener && typeof child.removeListener === 'function') {
      child.removeListener('exit', staleListener);
    }
    cleanupQuarantine.delete(child);
    return;
  }
  if (cleanupQuarantine.has(child)) return;
  cleanupQuarantine.set(child, null);
  if (typeof child.once !== 'function') return;
  function clearQuarantine() {
    cleanupQuarantine.delete(child);
  }
  cleanupQuarantine.set(child, clearQuarantine);
  child.once('exit', clearQuarantine);
  if (childHasExited(child)) {
    if (typeof child.removeListener === 'function') child.removeListener('exit', clearQuarantine);
    clearQuarantine();
  }
}

// Browser cleanup has one process owner. Graceful closes get the first half of the bound. If
// any of them reject or never settle, the owned child receives SIGKILL and must emit exit in
// the remaining half. Capacity is released only after that exit is verified. If even SIGKILL
// cannot be verified, every owned child gets an identity-keyed quarantine. New launches remain
// refused until every tracked child has exited, so one exit cannot hide a second leaked process.
async function settleBrowserCleanup(context, lease, env, dependencies) {
  var deps = dependencies || {};
  var requested = Number(deps.cleanupTimeoutMs);
  var timeoutMs = Number.isFinite(requested)
    ? Math.max(0, Math.min(5000, Math.floor(requested)))
    : numberEnv(env || process.env, 'BROWSER_EYES_CLEANUP_TIMEOUT_MS',
      DEFAULT_CLEANUP_TIMEOUT_MS, 250, 5000);
  var owned = lease && Object.prototype.hasOwnProperty.call(lease, 'browser') ? lease : {
    browser: lease || null, server: deps.server || null, child: deps.child || null };
  var closers = [];
  if (context && typeof context.close === 'function') {
    closers.push(function () { return context.close(); });
  }
  if (owned.browser && typeof owned.browser.close === 'function') {
    closers.push(function () { return owned.browser.close(); });
  }
  if (owned.server && typeof owned.server.close === 'function') {
    closers.push(function () { return owned.server.close(); });
  }
  if (!closers.length && !owned.child) return { settled: true, attempted: 0, exited: true };

  var work = Promise.allSettled(closers.map(function (close) {
    return Promise.resolve().then(close);
  })).then(function () {
    return { settled: true, attempted: closers.length };
  });
  var arm = deps.setTimeout || setTimeout;
  var disarm = deps.clearTimeout || clearTimeout;
  var gracefulMs = Math.floor(timeoutMs / 2);
  var timer = null;
  var gracefulTimeout = new Promise(function (resolve) {
    timer = arm(function () { resolve({ settled: false, attempted: closers.length }); },
      gracefulMs);
  });
  var graceful;
  try {
    graceful = await Promise.race([work, gracefulTimeout]);
  } finally {
    if (timer !== null) disarm(timer);
  }
  if (!owned.child && owned.ownershipMissing) {
    setCleanupQuarantine(null);
    return { settled: graceful.settled, attempted: closers.length, exited: false };
  }
  if (!owned.child || childHasExited(owned.child)) {
    return { settled: graceful.settled, attempted: closers.length, exited: true };
  }
  try { owned.child.kill('SIGKILL'); } catch (eKill) {}
  var exited = await waitForChildExit(owned.child, timeoutMs - gracefulMs, deps);
  if (!exited) setCleanupQuarantine(owned.child);
  return { settled: graceful.settled, attempted: closers.length, exited: exited };
}

async function launchOwnedBrowser(chromium, options) {
  if (!chromium || typeof chromium.launchServer !== 'function' ||
      typeof chromium.connect !== 'function') {
    throw new Error('browser_eyes_owned_launch_unavailable');
  }
  var server = await chromium.launchServer(options);
  var child = server && typeof server.process === 'function' ? server.process() : null;
  if (!server || !child || typeof child.kill !== 'function' ||
      typeof server.wsEndpoint !== 'function') {
    var ownerError = new Error('browser_eyes_process_owner_missing');
    ownerError.browserEyesLease = { browser: null, server: server || null,
      child: child || null, ownershipMissing: true };
    throw ownerError;
  }
  try {
    var browser = await chromium.connect(server.wsEndpoint(), { timeout: options.timeout });
    return { browser: browser, server: server, child: child };
  } catch (eConnect) {
    var connectError = eConnect instanceof Error ? eConnect : new Error(String(eConnect));
    connectError.browserEyesLease = { browser: null, server: server, child: child };
    throw connectError;
  }
}

// ---------------------------------------------------------------------------
// ADDRESS REFUSALS. Every one of these is a range a public page has no business
// resolving to. Named individually so a refusal can say which wall it hit.
// ---------------------------------------------------------------------------
function v4Refusal(ip) {
  var p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 255; })) {
    return 'address_unparseable';
  }
  var a = p[0], b = p[1], c = p[2], d = p[3];
  if (a === 0) return 'this_network_refused';
  if (a === 10) return 'private_network_refused';
  if (a === 127) return 'loopback_refused';
  // 169.254/16 carries the link local range AND every major cloud metadata endpoint
  // (169.254.169.254 on AWS, GCP and Azure, 169.254.170.2 on ECS task roles).
  if (a === 169 && b === 254) return 'link_local_or_cloud_metadata_refused';
  if (a === 172 && b >= 16 && b <= 31) return 'private_network_refused';
  if (a === 192 && b === 168) return 'private_network_refused';
  if (a === 192 && b === 0 && c === 0) return 'ietf_protocol_assignment_refused';
  // 100.64/10, carrier grade NAT, and the range holding the Alibaba metadata
  // endpoint at 100.100.100.200.
  if (a === 100 && b >= 64 && b <= 127) return 'carrier_grade_nat_or_cloud_metadata_refused';
  if (a === 198 && (b === 18 || b === 19)) return 'benchmark_network_refused';
  if (a === 192 && b === 0 && c === 2) return 'documentation_network_refused';
  if (a === 198 && b === 51 && c === 100) return 'documentation_network_refused';
  if (a === 203 && b === 0 && c === 113) return 'documentation_network_refused';
  if (a === 192 && b === 88 && c === 99) return 'six_to_four_relay_refused';
  if (a >= 224 && a <= 239) return 'multicast_refused';
  if (a >= 240) return 'reserved_network_refused';
  if (a === 255 && b === 255 && c === 255 && d === 255) return 'broadcast_refused';
  return null;
}

// An IPv6 address is judged by its eight real groups, never by its text. This function
// exists because the first version of this guard matched the TEXT of an IPv4 mapped
// address, and tests/browser.eyes.test.js caught the bypass before this ever shipped:
// the WHATWG URL parser rewrites http://[::ffff:127.0.0.1]/ into ::ffff:7f00:1, hex, no
// dots left to match, so a dotted-form regex waved loopback straight through. Expanding
// first and comparing numbers closes that whole class rather than that one spelling.
function expandV6(raw) {
  var s = String(raw == null ? '' : raw).toLowerCase().split('%')[0];
  if (!s) return null;
  // A dotted tail is legal IPv6 text. Fold it into two hex groups before expanding.
  var dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    var quad = dotted[2].split('.').map(Number);
    if (quad.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 255; })) return null;
    s = dotted[1] + (((quad[0] << 8) | quad[1]).toString(16)) + ':' +
      (((quad[2] << 8) | quad[3]).toString(16));
  }
  var halves = s.split('::');
  if (halves.length > 2) return null;
  var head = halves[0] ? halves[0].split(':') : [];
  var tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  var groups;
  if (halves.length === 2) {
    var fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = head.concat(new Array(fill).fill('0'), tail);
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  var out = [];
  for (var i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
    out.push(parseInt(groups[i], 16));
  }
  return out;
}

function v4FromGroups(hi, lo) {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
}

function v6Refusal(ip) {
  var g = expandV6(ip);
  if (!g) return 'address_unparseable';
  var topFourZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0;
  var topFiveZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  // ::ffff:0:0/96, IPv4 mapped. It IS an IPv4 address, so it gets the IPv4 verdict.
  if (topFiveZero && g[5] === 0xffff) return v4Refusal(v4FromGroups(g[6], g[7]));
  // ::ffff:0:0:0/96, IPv4 translated. This is a different prefix from mapped IPv4 and
  // must receive the same embedded-address verdict rather than passing as global IPv6.
  if (topFourZero && g[4] === 0xffff && g[5] === 0) {
    return v4Refusal(v4FromGroups(g[6], g[7]));
  }
  if (topFiveZero && g[5] === 0) {
    if (g[6] === 0 && g[7] === 0) return 'unspecified_address_refused';
    if (g[6] === 0 && g[7] === 1) return 'loopback_refused';
    // ::a.b.c.d, IPv4 compatible. Deprecated, still reaches the IPv4 host.
    return v4Refusal(v4FromGroups(g[6], g[7]));
  }
  // 64:ff9b::/96, the well known NAT64 prefix. It translates to an IPv4 destination too.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    var translated = v4Refusal(v4FromGroups(g[6], g[7]));
    if (translated) return translated;
  }
  // 64:ff9b:1::/48 is the local-use NAT64 prefix. Unlike the well-known /96, its
  // embedding layout varies by prefix length, so public-only policy refuses it whole.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return 'local_use_nat64_refused';
  // IPv6 special-purpose ranges that are not public destinations.
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) {
    return 'discard_only_refused';
  }
  if (g[0] === 0x2001 && g[1] === 2 && g[2] === 0) return 'benchmark_network_refused';
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'documentation_network_refused';
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return 'documentation_network_refused';
  if (g[0] === 0x2002) return 'six_to_four_refused';
  if (g[0] === 0x2001 && (g[1] & 0xfe00) === 0) {
    return 'ietf_protocol_assignment_refused';
  }
  // fc00::/7 unique local, fe80::/10 link local, fec0::/10 site local, ff00::/8 multicast.
  if ((g[0] & 0xfe00) === 0xfc00) return 'unique_local_refused';
  if ((g[0] & 0xffc0) === 0xfe80) return 'link_local_or_cloud_metadata_refused';
  if ((g[0] & 0xffc0) === 0xfec0) return 'site_local_refused';
  if ((g[0] & 0xff00) === 0xff00) return 'multicast_refused';
  return null;
}

// The one place an address is judged. A null return means nothing refused it.
function addressRefusal(ip) {
  var family = net.isIP(ip);
  if (family === 4) return v4Refusal(ip);
  if (family === 6) return v6Refusal(ip);
  return 'address_unparseable';
}

// Hostname suffixes that never point at the public web. Checked before DNS, so a name
// that resolves nowhere still gets a named refusal instead of a timeout.
var REFUSED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa', '.lan', '.intranet'];
var REFUSED_HOST_EXACT = { localhost: true, metadata: true, 'instance-data': true,
  'metadata.google.internal': true, 'metadata.goog': true };

function hostnameRefusal(hostname) {
  var h = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return 'hostname_missing';
  if (h.length > 253) return 'hostname_too_long';
  if (REFUSED_HOST_EXACT[h]) return 'internal_hostname_refused';
  for (var i = 0; i < REFUSED_HOST_SUFFIXES.length; i++) {
    if (h.slice(-REFUSED_HOST_SUFFIXES[i].length) === REFUSED_HOST_SUFFIXES[i]) {
      return 'internal_hostname_refused';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE URL GUARD. Synchronous shape checks first, then real DNS resolution with
// EVERY returned address judged. One address inside a refused range fails the whole
// hostname, because a name that resolves to both a public and a private address is
// exactly the rebinding shape this exists to stop.
// ---------------------------------------------------------------------------
function inspectUrlShape(raw, options) {
  options = options || {};
  var env = options.env || process.env;
  var text = String(raw == null ? '' : raw).trim();
  if (!text) return { ok: false, reason: 'url_missing' };
  if (text.length > MAX_URL_LENGTH) return { ok: false, reason: 'url_too_long' };
  var url;
  try { url = new URL(text); } catch (eParse) { return { ok: false, reason: 'url_unparseable' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme_refused', scheme: url.protocol.replace(':', '') };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url_refused' };
  var hostname = url.hostname.replace(/^\[|\]$/g, '');
  var permitLoopback = loopbackAllowed(env);
  var nameRefusal = hostnameRefusal(hostname);
  var literal = net.isIP(hostname) !== 0;
  var literalRefusal = literal ? addressRefusal(hostname) : null;
  var isLoopbackTarget = (nameRefusal === 'internal_hostname_refused' && String(hostname).toLowerCase() === 'localhost')
    || literalRefusal === 'loopback_refused';
  if (isLoopbackTarget && permitLoopback) { nameRefusal = null; literalRefusal = null; }
  if (nameRefusal) return { ok: false, reason: nameRefusal, hostname: hostname };
  if (literalRefusal) return { ok: false, reason: literalRefusal, hostname: hostname };
  var port = url.port || (url.protocol === 'https:' ? '443' : '80');
  // The loopback exception carries its own port exception, because a local self check
  // is served on whatever port the test happened to bind. It reaches nothing but this host.
  if (!ALLOWED_PORTS[port] && !(isLoopbackTarget && permitLoopback)) {
    return { ok: false, reason: 'port_refused', port: port };
  }
  return { ok: true, url: url, hostname: hostname, port: port, literal: literal,
    loopbackPermitted: isLoopbackTarget && permitLoopback };
}

async function guardUrl(raw, options) {
  options = options || {};
  var shape = inspectUrlShape(raw, options);
  if (!shape.ok) return shape;
  // A literal address already had the only check that exists for it. A name has to be resolved.
  if (shape.literal || shape.loopbackPermitted) {
    return { ok: true, url: shape.url.toString(), hostname: shape.hostname,
      addresses: shape.literal ? [shape.hostname] : [] };
  }
  var records;
  try {
    var lookup = typeof options.lookup === 'function' ? options.lookup : dns.lookup;
    records = await lookup(shape.hostname, { all: true, verbatim: true });
  } catch (eDns) {
    return { ok: false, reason: 'hostname_does_not_resolve', hostname: shape.hostname };
  }
  var addresses = (records || []).map(function (r) { return r && r.address; }).filter(Boolean);
  if (!addresses.length) return { ok: false, reason: 'hostname_does_not_resolve', hostname: shape.hostname };
  for (var i = 0; i < addresses.length; i++) {
    var refusal = addressRefusal(addresses[i]);
    if (refusal) return { ok: false, reason: refusal, hostname: shape.hostname, address: addresses[i] };
  }
  return { ok: true, url: shape.url.toString(), hostname: shape.hostname, addresses: addresses };
}

// ---------------------------------------------------------------------------
// THE DRIVER. Loaded lazily and guarded, so a world without playwright installed
// answers with a named reason instead of failing to boot.
// ---------------------------------------------------------------------------
function loadDriver() {
  try { return { ok: true, chromium: require('playwright').chromium }; }
  catch (ePlaywright) {
    try { return { ok: true, chromium: require('playwright-core').chromium }; }
    catch (eCore) {
      return { ok: false, reason: 'browser_eyes_driver_missing',
        detail: String(ePlaywright && ePlaywright.message || ePlaywright).slice(0, 200) };
    }
  }
}

function resolveExecutable(env, chromium, dependencies) {
  var e = env || process.env;
  var deps = dependencies || {};
  var explicit = String(e.BROWSER_EYES_CHROMIUM_PATH || e.PLAYWRIGHT_CHROMIUM_PATH || '').trim();
  if (explicit) return { path: explicit, source: 'explicit_env' };

  // ⬡B:core.browser_eyes:FIX:a_driver_that_only_finds_the_build_it_shipped_with_is_blind:20260727⬡
  // Playwright's default headless launch can look for a headless shell even when a full
  // Chromium was deliberately installed. Browser Eyes needs the full renderer for screenshots,
  // so resolve that executable first on every supported build layout.
  try {
    var fs = deps.fs || require('node:fs');
    var path = deps.path || require('node:path');
    var root = String(e.PLAYWRIGHT_BROWSERS_PATH || '').trim();
    if (root && fs.existsSync(root)) {
      var candidates = [];
      fs.readdirSync(root).forEach(function (dir) {
        if (!/^chromium/.test(dir)) return;
        ['chrome-linux/chrome', 'chrome-linux/headless_shell',
         'chrome-linux64/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell',
         'chrome-win64/chrome.exe',
         'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
         'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
         'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
        ].forEach(function (rel) {
          var full = path.join(root, dir, rel);
          if (fs.existsSync(full)) {
            candidates.push({ full: full, full_build: rel.indexOf('headless') === -1 });
          }
        });
      });
      candidates.sort(function (a, b) { return (b.full_build ? 1 : 0) - (a.full_build ? 1 : 0); });
      if (candidates.length) return { path: candidates[0].full, source: 'playwright_browsers_path' };
    }
  } catch (eResolve) { /* fall through to the driver's exact full Chromium path */ }

  if (chromium && typeof chromium.executablePath === 'function') {
    try {
      var driverPath = chromium.executablePath();
      if (driverPath) return { path: driverPath, source: 'playwright_driver' };
    } catch (eDriverPath) {
      return { path: null, source: null, reason: 'browser_eyes_executable_unresolved',
        detail: String(eDriverPath && eDriverPath.message || eDriverPath).slice(0, 200) };
    }
  }
  return { path: null, source: null, reason: 'browser_eyes_executable_unresolved' };
}

function browserProcessEnvironment(env) {
  var e = env || process.env;
  // Do not hand the renderer the mind service's provider keys, database credentials, or
  // operator sessions. Chromium gets only the operating-system values required to start.
  return {
    PATH: String(e.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'),
    HOME: String(e.BROWSER_EYES_HOME || '/tmp/browser-eyes-home'),
    TMPDIR: String(e.BROWSER_EYES_TMPDIR || '/tmp/browser-eyes-tmp'),
    LANG: String(e.LANG || 'C.UTF-8'),
    LC_ALL: String(e.LC_ALL || e.LANG || 'C.UTF-8'),
    TZ: String(e.TZ || 'UTC')
  };
}

function prepareBrowserDirectories(browserEnv, dependencies) {
  var deps = dependencies || {};
  var fs = deps.fs || require('node:fs');
  [browserEnv.HOME, browserEnv.TMPDIR].forEach(function (dir) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  });
}

function launchOptions(env, pin, chromium) {
  var e = env || process.env;
  var processEnvironment = browserProcessEnvironment(e);
  prepareBrowserDirectories(processEnvironment);
  var opts = {
    headless: true,
    // Browser Eyes visits caller-selected pages. The renderer therefore runs as an
    // unprivileged user WITH Chromium's sandbox, and without the mind service's environment.
    chromiumSandbox: true,
    env: processEnvironment,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1',
      '--js-flags=--max-old-space-size=64', '--dns-prefetch-disable',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-features=NetworkPrediction,PreconnectToSearch,Reporting,NetworkErrorLogging,Prerender2',
      '--disable-blink-features=WebRTC,WebTransport']
  };
  // ⬡B:core.browser_eyes:911:the_address_we_checked_must_be_the_address_we_contact:20260727⬡
  // FOUND BY CODEX on #1207. guardUrl resolves the hostname through Node and judges every
  // address it gets back, and then Chromium RESOLVED THE SAME NAME AGAIN on its own. Between
  // those two lookups an attacker who controls the authoritative DNS can answer public the
  // first time and private the second, so the address we approved is not the address the
  // browser dials, and the whole guard becomes decoration. That is DNS rebinding, and the
  // per-host verdict cache made it worse by skipping the recheck entirely on later requests.
  //
  // The cure is to stop resolving twice. Chromium's own resolver is pinned to the exact
  // addresses that passed inspection, so the name cannot mean anything else inside this
  // browser no matter what DNS says next. The per-request guard stays as the second fence:
  // a page that navigates to a DIFFERENT host is still judged on its own.
  if (pin && pin.hostname && pin.addresses && pin.addresses.length) {
    var mapped = pin.addresses.slice(0, 4).map(function (a) {
      return 'MAP ' + pin.hostname + ' ' + a;
    }).join(',');
    // HTTP context routing remains the named decision wall, but every Chromium network stack
    // also receives a resolver that knows ONLY the already-approved host. A forgotten future
    // protocol therefore cannot resolve a second hostname behind the route layer.
    opts.args = opts.args.concat(['--host-resolver-rules=' + mapped + ',MAP * ~NOTFOUND']);
  }
  var executable = resolveExecutable(e, chromium);
  if (executable.path) opts.executablePath = executable.path;
  return opts;
}

// A loaded driver is only half a browser. Playwright can be present while the exact Chromium
// revision it expects is absent, which used to make the authenticated status door report
// driver_present:true for an organ that still could not look. Resolve and execute-check the
// same path observe() will use so build verification and live status share one truth source.
async function probeRuntimeStatus(env, dependencies) {
  var e = env || process.env;
  var deps = dependencies || {};
  var driver = typeof deps.loadDriver === 'function' ? deps.loadDriver() : loadDriver();
  if (!driver || driver.ok !== true || !driver.chromium) {
    return {
      ok: false,
      runtime_ready: false,
      driver_present: false,
      chromium_present: false,
      reason: driver && driver.reason || 'browser_eyes_driver_missing',
      executable_source: null,
      executable_path: null
    };
  }

  var executable = resolveExecutable(e, driver.chromium, deps);
  var executablePath = executable.path || null;
  var source = executable.source || null;

  if (!executablePath) {
    return {
      ok: false,
      runtime_ready: false,
      driver_present: true,
      chromium_present: false,
      reason: executable.reason || 'browser_eyes_executable_unresolved',
      executable_source: null,
      executable_path: null,
      detail: executable.detail || null
    };
  }

  var fs = deps.fs || require('node:fs');
  try {
    fs.accessSync(executablePath, fs.constants.X_OK);
  } catch (eAccess) {
    return {
      ok: false,
      runtime_ready: false,
      driver_present: true,
      chromium_present: false,
      reason: 'browser_eyes_executable_missing',
      executable_source: source,
      executable_path: executablePath
    };
  }
  var lease = null;
  var result = null;
  var capacity = reserveObservation(e);
  if (!capacity.ok) {
    return {
      ok: false,
      runtime_ready: false,
      driver_present: true,
      chromium_present: true,
      launch_verified: false,
      browser_version: null,
      reason: capacity.reason || 'browser_eyes_probe_busy',
      executable_source: source,
      executable_path: executablePath
    };
  }
  try {
    var probeOptions = launchOptions(e, null, driver.chromium);
    probeOptions.timeout = numberEnv(e, 'BROWSER_EYES_RUNTIME_PROBE_TIMEOUT_MS', 15000,
      1000, 30000);
    lease = await launchOwnedBrowser(driver.chromium, probeOptions);
    var browser = lease.browser;
    var version = browser && typeof browser.version === 'function'
      ? String(browser.version() || '').trim() : '';
    if (!browser || typeof browser.close !== 'function' || !version) {
      throw new Error('chromium_launch_readback_missing');
    }
    result = {
      ok: true,
      runtime_ready: true,
      driver_present: true,
      chromium_present: true,
      launch_verified: true,
      browser_version: version,
      reason: null,
      executable_source: source,
      executable_path: executablePath
    };
  } catch (eLaunch) {
    if (!lease && eLaunch && eLaunch.browserEyesLease) lease = eLaunch.browserEyesLease;
    result = {
      ok: false,
      runtime_ready: false,
      driver_present: true,
      chromium_present: true,
      launch_verified: false,
      browser_version: null,
      reason: 'browser_eyes_launch_failed',
      detail: trim(eLaunch && eLaunch.message || eLaunch, 300),
      executable_source: source,
      executable_path: executablePath
    };
  } finally {
    var cleanup = await settleBrowserCleanup(null, lease, e, deps);
    releaseObservation();
    if (!cleanup.exited && result && result.ok) {
      result = Object.assign({}, result, { ok: false, runtime_ready: false,
        launch_verified: false, reason: 'browser_eyes_cleanup_unverified' });
    }
  }
  return result;
}

function runtimePresenceStatus(env, dependencies) {
  var e = env || process.env;
  var deps = dependencies || {};
  var driver = typeof deps.loadDriver === 'function' ? deps.loadDriver() : loadDriver();
  if (!driver || driver.ok !== true || !driver.chromium) {
    return { ok: false, runtime_ready: false, driver_present: false,
      chromium_present: false, launch_verified: false,
      reason: driver && driver.reason || 'browser_eyes_driver_missing',
      executable_source: null, executable_path: null };
  }
  var executable = resolveExecutable(e, driver.chromium, deps);
  if (!executable.path) {
    return { ok: false, runtime_ready: false, driver_present: true,
      chromium_present: false, launch_verified: false,
      reason: executable.reason || 'browser_eyes_executable_unresolved',
      executable_source: executable.source || null, executable_path: null };
  }
  var fs = deps.fs || require('node:fs');
  try {
    fs.accessSync(executable.path, fs.constants.X_OK);
  } catch (eAccess) {
    return { ok: false, runtime_ready: false, driver_present: true,
      chromium_present: false, launch_verified: false,
      reason: 'browser_eyes_executable_missing',
      executable_source: executable.source || null, executable_path: executable.path };
  }
  return { ok: true, runtime_ready: false, driver_present: true,
    chromium_present: true, launch_verified: false,
    reason: 'browser_eyes_probe_disabled',
    executable_source: executable.source || null, executable_path: executable.path };
}

async function runtimeStatus(env, dependencies) {
  var e = env || process.env;
  var deps = dependencies || {};
  // Default-off means no Chromium process, including status probes. The immutable presence
  // receipt remains visible, while only an armed service may spend the bounded launch probe.
  if (!enabled(e)) return runtimePresenceStatus(e, dependencies);
  if (cleanupQuarantine.size > 0) {
    return Object.assign({}, runtimePresenceStatus(e, dependencies), {
      ok: false, runtime_ready: false, launch_verified: false,
      reason: 'browser_eyes_cleanup_unverified'
    });
  }
  // Injected probes are unit-isolated and must never share global state. Live status callers
  // share one bounded launch and its short receipt so repeated health reads cannot fan out a
  // fleet of Chromium children next to the mind.
  var cache = deps.runtimeProbeCache || runtimeProbeCache;
  if (dependencies && !deps.runtimeProbeCache) return probeRuntimeStatus(env, dependencies);
  var now = Date.now();
  if (cache.value && cache.expires_at > now) {
    return Object.assign({}, cache.value, { probe_cached: true });
  }
  if (cache.inflight) return cache.inflight;
  cache.inflight = probeRuntimeStatus(e, dependencies).then(function (value) {
    var ttl = numberEnv(e, 'BROWSER_EYES_RUNTIME_PROBE_TTL_MS', 60000, 5000, 300000);
    var receipt = Object.assign({}, value, {
      probe_cached: false,
      probed_at: new Date().toISOString()
    });
    cache.value = receipt;
    cache.expires_at = Date.now() + ttl;
    return receipt;
  }).finally(function () { cache.inflight = null; });
  return cache.inflight;
}

// ---------------------------------------------------------------------------
// THE OBSERVATION. Facts only.
// ---------------------------------------------------------------------------
function trim(value, cap) {
  var s = String(value == null ? '' : value);
  return s.length > cap ? s.slice(0, cap) : s;
}

async function observe(input) {
  input = input || {};
  var env = input.env || process.env;
  var startedAt = Date.now();
  // The whole-observation deadline. Every stage lives inside it, not just navigation.
  var deadlineAt = 0;
  if (!enabled(env)) {
    return { ok: false, reason: 'browser_eyes_disabled',
      note: 'BROWSER_EYES_ENABLED is not set on this service.' };
  }
  var requestedWidth = Math.floor(Number(input.width) || 1280);
  var requestedHeight = Math.floor(Number(input.height) || 800);
  if (requestedWidth > MAX_VIEWPORT_WIDTH || requestedHeight > MAX_VIEWPORT_HEIGHT) {
    return { ok: false, reason: 'viewport_too_large',
      max_width: MAX_VIEWPORT_WIDTH, max_height: MAX_VIEWPORT_HEIGHT };
  }
  var initialShape = inspectUrlShape(input.url, { env: env });
  if (!initialShape.ok) {
    return { ok: false, reason: initialShape.reason, refused_url: trim(input.url, 300),
      hostname: initialShape.hostname || null, address: initialShape.address || null,
      refused_by: 'browser_eyes_url_guard' };
  }
  // Own the one browser/DNS lane before any potentially blocking resolution. Authenticated
  // request floods therefore cannot fan out resolver work ahead of the Chromium gate.
  var capacity = reserveObservation(env);
  if (!capacity.ok) return capacity;
  var guard;
  try {
    guard = await guardUrl(input.url, { env: env });
  } catch (eGuard) {
    releaseObservation();
    return { ok: false, reason: 'browser_eyes_url_guard_failed',
      detail: trim(eGuard && eGuard.message || eGuard, 300) };
  }
  if (!guard.ok) {
    releaseObservation();
    return { ok: false, reason: guard.reason, refused_url: trim(input.url, 300),
      hostname: guard.hostname || null, address: guard.address || null,
      refused_by: 'browser_eyes_url_guard' };
  }
  var driver = loadDriver();
  if (!driver.ok) {
    releaseObservation();
    return { ok: false, reason: driver.reason, detail: driver.detail };
  }

  deadlineAt = startedAt + numberEnv(env, 'BROWSER_EYES_TIMEOUT_MS', DEFAULT_TIMEOUT_MS,
    TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS) + 5000;
  var timeout = numberEnv(env, 'BROWSER_EYES_TIMEOUT_MS', DEFAULT_TIMEOUT_MS,
    TIMEOUT_FLOOR_MS, TIMEOUT_CEILING_MS);
  if (Number.isFinite(Number(input.timeout_ms))) {
    timeout = Math.max(TIMEOUT_FLOOR_MS, Math.min(timeout, Math.floor(Number(input.timeout_ms))));
  }
  var maxBytes = numberEnv(env, 'BROWSER_EYES_MAX_BYTES', DEFAULT_MAX_BYTES, 65536, 64 * 1024 * 1024);
  var maxText = numberEnv(env, 'BROWSER_EYES_MAX_TEXT', DEFAULT_MAX_TEXT, 500, 200000);
  var width = Math.max(320, Math.min(MAX_VIEWPORT_WIDTH, requestedWidth));
  var height = Math.max(320, Math.min(MAX_VIEWPORT_HEIGHT, requestedHeight));

  var lease = null;
  var browser = null;
  var context = null;
  var consoleErrors = [];
  var pageErrors = [];
  var failedRequests = [];
  var declaredBytes = 0;
  var receivedBytes = 0;
  var encodedBytes = 0;
  var byteCapHit = false;
  var byteCapAbort = null;
  var blockedRequests = [];
  var hostVerdicts = Object.create(null);
  // The one host whose resolution Chromium was pinned to at launch. Anything else cannot be
  // pinned after the fact, so it is refused above rather than dialed on an unchecked lookup.
  // Pinned by HOSTNAME, never host:port. Chromium's resolver is pinned per NAME and stays
  // pinned across ports, so treating http://host:80 redirecting to https://host:443 as a
  // different, unpinnable host refused the single most common redirect on the web. The port
  // still matters and is still judged, by the port allowlist inside the URL guard below.
  var pinnedHost = guard.hostname;
  try {
    var ownedLaunchOptions = launchOptions(env,
      { hostname: guard.hostname, addresses: guard.addresses }, driver.chromium);
    ownedLaunchOptions.timeout = timeout;
    lease = await launchOwnedBrowser(driver.chromium, ownedLaunchOptions);
    browser = lease.browser;
    context = await browser.newContext({
      viewport: { width: width, height: height },
      userAgent: String(env.BROWSER_EYES_USER_AGENT || '').trim() || undefined,
      javaScriptEnabled: true,
      // BrowserContext routing cannot see requests already claimed by a Service Worker.
      // A fresh observation never needs persistent worker state, so block registration and
      // keep every network request inside the same governed context route below.
      serviceWorkers: 'block'
    });
    context.setDefaultTimeout(timeout);
    context.setDefaultNavigationTimeout(timeout);

    // THE SAME GUARD, ON EVERY REQUEST. A public page that redirects to 169.254.169.254,
    // or pulls an image from 10.0.0.5, gets stopped here. Verdicts are memoized per host
    // so one page does not cost one DNS lookup per asset. This belongs to the CONTEXT, not
    // the first page: context routing also owns the first navigation of popups and every
    // additional page the observed document can create.
    await context.route('**/*', async function (route, request) {
      var target = request.url();
      if (page) {
        try {
          if (request.frame().page() !== page) {
            blockedRequests.push({ url: trim(target, 300), reason: 'popup_request_refused' });
            try { await route.abort('blockedbyclient'); } catch (eAbortPopup) {}
            return;
          }
        } catch (eRequestPage) {
          // Playwright intentionally exposes no Frame for the first request of a popup.
          // Context routing still owns that request, so the unproven page is refused and named.
          blockedRequests.push({ url: trim(target, 300), reason: 'popup_request_refused' });
          try { await route.abort('blockedbyclient'); } catch (eAbortPage) {}
          return;
        }
      }
      var shape = inspectUrlShape(target, { env: env });
      if (!shape.ok) {
        blockedRequests.push({ url: trim(target, 300), reason: shape.reason });
        try { await route.abort('blockedbyclient'); } catch (eAbortShape) {}
        return;
      }
      var key = shape.hostname + ':' + shape.port;
      // ⬡B:core.browser_eyes:911:a_host_we_cannot_pin_is_a_host_we_do_not_dial:20260727⬡
      // Pinning Chromium's resolver closes the rebinding window only for the hostname pinned
      // at LAUNCH, and host-resolver-rules cannot be extended once the browser is running. So a
      // redirect or subresource on a SECOND hostname would be resolved twice: once by guardUrl
      // through Node, and again by Chromium, which is the same hole one name over.
      //
      // A host discovered mid flight cannot be pinned, so it is REFUSED. Unconditionally.
      //
      // AN ESCAPE HATCH HERE WAS A REAL MISTAKE AND IT IS DELETED. The first version of this
      // guard carried BROWSER_EYES_ALLOW_CROSS_HOST so a deploy could let ordinary CDN backed
      // pages load their fonts. Codex caught what that actually was: a switch that reopens the
      // exact rebinding path this block exists to close, and one that would be reached for the
      // moment a page looked wrong, which is precisely when nobody is thinking about SSRF. A
      // safety guard with a documented way around it is not a guard, it is a suggestion. The
      // honest cost is named instead: a page pulling assets from another host has those
      // requests listed in blocked_requests, and the screenshot shows the page without them.
      // That is a visible, truthful limitation rather than an invisible hole.
      if (shape.hostname !== pinnedHost) {
        blockedRequests.push({ url: trim(target, 300), reason: 'cross_host_request_unpinnable_refused' });
        try { await route.abort('blockedbyclient'); } catch (eAbortCross) {}
        return;
      }
      if (hostVerdicts[key] === undefined) {
        var checked = await guardUrl(target, { env: env });
        hostVerdicts[key] = checked.ok ? null : checked.reason;
      }
      if (hostVerdicts[key]) {
        blockedRequests.push({ url: trim(target, 300), reason: hostVerdicts[key] });
        try { await route.abort('blockedbyclient'); } catch (eAbortHost) {}
        return;
      }
      if (byteCapHit) {
        try { await route.abort('blockedbyclient'); } catch (eAbortCap) {}
        return;
      }
      try { await route.continue(); } catch (eContinue) {}
    });

    if (typeof context.routeWebSocket !== 'function') {
      throw new Error('browser_eyes_websocket_guard_unavailable');
    }
    await context.routeWebSocket(/.*/, async function (webSocketRoute) {
      var target = '';
      try { target = webSocketRoute.url(); } catch (eSocketUrl) {}
      blockedRequests.push({ url: trim(target, 300), reason: 'websocket_request_refused' });
      // Deliberately never call connectToServer(). A routed WebSocket is only a local mock
      // until that call, so closing this side guarantees the target receives no connection.
      try {
        await webSocketRoute.close({ code: 1008,
          reason: 'Browser Eyes blocks WebSocket egress' });
      } catch (eSocketClose) {}
    });

    // HTTP, WebSocket and Service Worker traffic are governed above. WebRTC/STUN and
    // WebTransport are separate Chromium network stacks that never enter those routes, while
    // workers create fresh JavaScript realms. Remove those constructors before any document
    // or child-frame script runs. The launch policy independently disables direct WebRTC UDP.
    await context.addInitScript(function () {
      ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport', 'Worker', 'SharedWorker']
        .forEach(function (name) {
          try {
            Object.defineProperty(globalThis, name, { value: undefined, writable: false,
              configurable: false });
          } catch (eCapability) {}
        });
    });

    var page = await context.newPage();
    var cdp = null;
    try {
      cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
    } catch (eCdp) {
      throw new Error('browser_eyes_byte_guard_unavailable: ' +
        trim(eCdp && eCdp.message || eCdp, 200));
    }
    cdp.on('Network.dataReceived', function (event) {
      if (byteCapHit) return;
      var decoded = Number(event && event.dataLength);
      var encoded = Number(event && event.encodedDataLength);
      if (Number.isFinite(decoded) && decoded > 0) receivedBytes += decoded;
      if (Number.isFinite(encoded) && encoded > 0) encodedBytes += encoded;
      // dataLength is the decoded body size. Capping it also stops compressed responses whose
      // small wire body expands into an unsafe renderer allocation.
      if (receivedBytes > maxBytes) {
        byteCapHit = true;
        byteCapAbort = page.close({ runBeforeUnload: false }).catch(function () {});
      }
    });

    page.on('console', function (message) {
      try {
        if (message.type() !== 'error' || consoleErrors.length >= MAX_CONSOLE_ERRORS) return;
        var loc = message.location() || {};
        consoleErrors.push({ text: trim(message.text(), 500),
          url: trim(loc.url || '', 300), line: loc.lineNumber == null ? null : loc.lineNumber });
      } catch (eConsole) {}
    });
    page.on('pageerror', function (error) {
      if (pageErrors.length >= MAX_CONSOLE_ERRORS) return;
      pageErrors.push({ message: trim(error && error.message || error, 500) });
    });
    page.on('requestfailed', function (request) {
      try {
        if (failedRequests.length >= MAX_FAILED_REQUESTS) return;
        var failure = request.failure();
        failedRequests.push({ url: trim(request.url(), 300),
          method: request.method(), resource_type: request.resourceType(),
          failure: trim(failure && failure.errorText || 'unknown', 200) });
      } catch (eFailed) {}
    });
    page.on('response', function (response) {
      try {
        var declared = Number((response.headers() || {})['content-length']);
        if (Number.isFinite(declared) && declared > 0) declaredBytes += declared;
        if (declaredBytes > maxBytes) byteCapHit = true;
      } catch (eResponse) {}
    });

    var navigation = null;
    var navigationError = null;
    try {
      navigation = await page.goto(guard.url, { waitUntil: 'domcontentloaded', timeout: timeout });
    } catch (eGoto) {
      navigationError = trim(eGoto && eGoto.message || eGoto, 400);
    }
    if (byteCapHit) {
      if (byteCapAbort) await byteCapAbort;
      return { ok: false, reason: 'response_bytes_cap_exceeded',
        requested_url: guard.url, response_bytes_received: receivedBytes,
        response_bytes_encoded: encodedBytes, response_bytes_cap: maxBytes,
        elapsed_ms: Date.now() - startedAt };
    }
    if (!navigation && navigationError) {
      return { ok: false, reason: 'page_did_not_load', requested_url: guard.url,
        detail: navigationError, elapsed_ms: Date.now() - startedAt };
    }
    // A short settle so client rendered pages have their text. Never fatal: a page that
    // keeps a socket open forever is still a page that loaded.
    try { await page.waitForLoadState('networkidle', { timeout: Math.min(4000, timeout) }); }
    catch (eIdle) {}
    if (byteCapHit) {
      if (byteCapAbort) await byteCapAbort;
      return { ok: false, reason: 'response_bytes_cap_exceeded',
        requested_url: guard.url, response_bytes_received: receivedBytes,
        response_bytes_encoded: encodedBytes, response_bytes_cap: maxBytes,
        elapsed_ms: Date.now() - startedAt };
    }

    // The redirect chain, walked from the response that actually answered.
    var redirectChain = [];
    try {
      var request = navigation.request();
      var hop = request.redirectedFrom();
      var hops = 0;
      while (hop && hops < MAX_REDIRECTS) {
        var hopResponse = await hop.response();
        redirectChain.unshift({ url: trim(hop.url(), 300),
          status: hopResponse ? hopResponse.status() : null });
        hop = hop.redirectedFrom();
        hops++;
      }
    } catch (eChain) {}

    var title = '';
    try { title = trim(await page.title(), 400); } catch (eTitle) { title = ''; }
    var visibleText = { text: '', truncated: false, measured_length: 0 };
    try {
      visibleText = await page.evaluate(function (limit) {
        if (!document.body) return { text: '', truncated: false, measured_length: 0 };
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        var chunks = [];
        var length = 0;
        var truncated = false;
        var visited = 0;
        var node;
        while ((node = walker.nextNode())) {
          visited += 1;
          if (visited > 5000) { truncated = true; break; }
          var parent = node.parentElement;
          if (parent) {
            var style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
          }
          var remaining = limit - length;
          if (remaining <= 0) { truncated = true; break; }
          var raw = String(node.nodeValue || '');
          var piece = raw.slice(0, remaining).replace(/\s+/g, ' ');
          if (piece) {
            chunks.push(piece);
            length += piece.length;
          }
          if (raw.length > remaining) { truncated = true; break; }
        }
        if (!truncated && walker.nextNode()) truncated = true;
        return { text: chunks.join(' ').slice(0, limit).trim(),
          truncated: truncated, measured_length: length };
      }, maxText);
    } catch (eText) { visibleText = { text: '', truncated: false, measured_length: 0 }; }
    var text = String(visibleText.text || '');

    var documentHeight = height;
    if (input.full_page === true) {
      try {
        documentHeight = await page.evaluate(function () {
          return Math.max(document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0);
        });
      } catch (eHeight) { documentHeight = MAX_FULL_PAGE_HEIGHT + 1; }
      if (!Number.isFinite(documentHeight) || documentHeight > MAX_FULL_PAGE_HEIGHT) {
        return { ok: false, reason: 'full_page_height_exceeded',
          requested_url: guard.url, document_height: documentHeight,
          max_full_page_height: MAX_FULL_PAGE_HEIGHT,
          elapsed_ms: Date.now() - startedAt };
      }
    }

    var shot = null;
    var shotReason = null;
    try {
      shot = await page.screenshot({ type: 'png', fullPage: input.full_page === true });
    } catch (eShot) { shotReason = trim(eShot && eShot.message || eShot, 200); }

    var observation = {
      ok: true,
      requested_url: guard.url,
      final_url: trim(page.url(), 500),
      status: navigation ? navigation.status() : null,
      status_text: navigation ? trim(navigation.statusText(), 120) : null,
      redirected: !!redirectChain.length,
      redirect_chain: redirectChain,
      title: title,
      text: text,
      text_truncated: visibleText.truncated === true,
      text_length: visibleText.measured_length,
      text_length_exact: visibleText.truncated !== true,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      failed_requests: failedRequests,
      blocked_requests: blockedRequests,
      response_bytes_declared: declaredBytes,
      response_bytes_received: receivedBytes,
      response_bytes_encoded: encodedBytes,
      response_bytes_cap: maxBytes,
      response_bytes_cap_hit: byteCapHit,
      viewport: { width: width, height: height },
      timeout_ms: timeout,
      elapsed_ms: Date.now() - startedAt,
      at: new Date().toISOString()
    };
    if (navigationError) observation.navigation_note = navigationError;

    observation.screenshot = shot
      // ⬡B:core.browser_eyes:FIX:the_deadline_cancels_the_work_it_times_out:20260730⬡
      // One abort signal owns upload and signing. The timer is cleared on every settled path,
      // and a deadline abort is awaited before the browser capacity is released, so no loser
      // timer or uncancelled late storage operation survives the returned observation.
      ? await storeScreenshotBeforeDeadline(shot, input.hamUid, guard.hostname, env, deadlineAt)
      : { ok: false, reason: 'screenshot_failed', detail: shotReason };

    observation.receipt = await recordObservation(observation, input);
    return observation;
  } catch (eRun) {
    if (!lease && eRun && eRun.browserEyesLease) lease = eRun.browserEyesLease;
    return { ok: false, reason: 'browser_eyes_run_failed',
      detail: trim(eRun && eRun.message || eRun, 400),
      requested_url: guard.url, elapsed_ms: Date.now() - startedAt };
  } finally {
    var cleanupRemaining = Math.max(0, deadlineAt - Date.now());
    var cleanup = await settleBrowserCleanup(context, lease, env, { cleanupTimeoutMs: Math.min(
      numberEnv(env, 'BROWSER_EYES_CLEANUP_TIMEOUT_MS', DEFAULT_CLEANUP_TIMEOUT_MS, 250, 5000),
      cleanupRemaining) });
    releaseObservation();
    if (!cleanup.exited) {
      return { ok: false, reason: 'browser_eyes_cleanup_unverified',
        requested_url: guard.url, elapsed_ms: Date.now() - startedAt };
    }
  }
}

// ---------------------------------------------------------------------------
// THE SCREENSHOT. Stored as a real object in the store that already exists, and
// referenced by key plus a short lived signed URL. Never base64 into a bead.
// ---------------------------------------------------------------------------
async function storeScreenshot(bytes, hamUid, hostname, env, options) {
  var opts = options || {};
  var storage = opts.fileStore || fileStore;
  var signal = opts.signal;
  if (!storage) return { ok: false, reason: 'file_lane_module_missing', bytes: bytes.length };
  if (signal && signal.aborted) {
    return { ok: false, reason: 'screenshot_store_deadline_exceeded', bytes: bytes.length };
  }
  if (!storage.configured()) {
    return { ok: false, reason: 'file_lane_storage_unconfigured', bytes: bytes.length,
      note: 'The look ran and the image exists in memory. Nothing stored it because the object store is not configured on this service.' };
  }
  var label = String(hostname || 'page').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  var key = storage.buildObjectKey(hamUid, 'browser-eyes_' + label + '.png');
  var put = await storage.putObject({ key: key, bytes: bytes, content_type: 'image/png',
    signal: signal });
  if (!put.ok) return { ok: false, reason: put.reason, detail: put.detail || null, bytes: bytes.length };
  if (signal && signal.aborted) {
    return { ok: false, reason: 'screenshot_store_deadline_exceeded', bytes: bytes.length };
  }
  var expires = numberEnv(env, 'BROWSER_EYES_SIGNED_URL_TTL', 900, 60, 86400);
  var signed = await storage.signedUrl(key, expires, { signal: signal });
  return { ok: true, key: key, bucket: put.bucket, bytes: put.bytes, content_type: 'image/png',
    url: signed.ok ? signed.url : null,
    url_reason: signed.ok ? null : signed.reason,
    url_expires_in_seconds: signed.ok ? expires : null };
}

async function storeScreenshotBeforeDeadline(bytes, hamUid, hostname, env, deadlineAt,
  dependencies) {
  var deps = dependencies || {};
  var now = typeof deps.now === 'function' ? deps.now() : Date.now();
  var remaining = Number(deadlineAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { ok: false, reason: 'screenshot_store_deadline_exceeded', bytes: bytes.length };
  }
  var Controller = deps.AbortController || AbortController;
  var controller = new Controller();
  var arm = deps.setTimeout || setTimeout;
  var disarm = deps.clearTimeout || clearTimeout;
  var timedOut = false;
  var timer = null;
  var timeout = new Promise(function (resolve) {
    timer = arm(function () {
      timedOut = true;
      controller.abort(new Error('screenshot_store_deadline_exceeded'));
      resolve({ kind: 'deadline' });
    }, remaining);
  });
  // Resolve every branch into a value before racing it. If a noncooperative store settles or
  // rejects after the deadline, there is no unhandled loser and its late result cannot change
  // the observation that already returned. storeScreenshot checks the shared signal between
  // upload and signing, so a late upload settlement can never start a signed URL request.
  var work = storeScreenshot(bytes, hamUid, hostname, env, {
    signal: controller.signal,
    fileStore: deps.fileStore
  }).then(function (stored) {
    return { kind: 'stored', value: stored };
  }, function (error) {
    return { kind: 'error', error: error };
  });
  try {
    var winner = await Promise.race([work, timeout]);
    var finishedAt = typeof deps.now === 'function' ? deps.now() : Date.now();
    if (winner.kind === 'deadline' || timedOut || controller.signal.aborted ||
        finishedAt >= deadlineAt) {
      if (!controller.signal.aborted) {
        controller.abort(new Error('screenshot_store_deadline_exceeded'));
      }
      return { ok: false, reason: 'screenshot_store_deadline_exceeded', bytes: bytes.length };
    }
    if (winner.kind === 'stored') return winner.value;
    var eStore = winner.error;
    if (eStore && eStore.name === 'AbortError') {
      return { ok: false, reason: 'screenshot_store_deadline_exceeded', bytes: bytes.length };
    }
    return { ok: false, reason: 'file_lane_upload_unreachable',
      detail: trim(eStore && eStore.message || eStore, 200), bytes: bytes.length };
  } finally {
    if (timer !== null) disarm(timer);
  }
}

// ---------------------------------------------------------------------------
// THE RECEIPT. A look is part of her record, so it lands as a bead. The bead carries
// the facts and the screenshot KEY, never the image bytes. A failed bead write never
// costs the caller the observation it already has.
// ---------------------------------------------------------------------------
async function recordObservation(observation, input) {
  if (!brain || typeof brain.writeBead !== 'function') {
    return { ok: false, reason: 'brain_client_missing' };
  }
  var hamUid = String(input && input.hamUid || '').trim();
  if (!hamUid) return { ok: false, reason: 'ham_uid_required_for_receipt' };
  var source = 'browser_eyes.' + hamUid.toLowerCase() + '.observe.' + Date.now();
  var shot = observation.screenshot || {};
  try {
    var written = await brain.writeBead({
      hamUid: hamUid,
      agentGlobal: 'BROWSER_EYES',
      source: source,
      type: 'BROWSER_OBSERVATION',
      summary: 'Looked at ' + observation.final_url + ', HTTP ' + observation.status +
        ', ' + observation.console_errors.length + ' console error(s), ' +
        observation.failed_requests.length + ' failed request(s).',
      importance: 4,
      content: {
        requested_url: observation.requested_url,
        final_url: observation.final_url,
        status: observation.status,
        redirect_chain: observation.redirect_chain,
        title: observation.title,
        text_excerpt: trim(observation.text, BEAD_TEXT_CAP),
        text_length: observation.text_length,
        console_errors: observation.console_errors,
        page_errors: observation.page_errors,
        failed_requests: observation.failed_requests,
        blocked_requests: observation.blocked_requests,
        viewport: observation.viewport,
        elapsed_ms: observation.elapsed_ms,
        screenshot_key: shot.key || null,
        screenshot_bucket: shot.bucket || null,
        screenshot_reason: shot.ok ? null : (shot.reason || null),
        looked_because: trim(input && input.reason || '', 400) || null,
        at: observation.at
      },
      edges: [
        { type: 'observed_url', target: observation.final_url },
        { type: 'belongs_to_ham', target: hamUid }
      ]
    });
    return { ok: !!(written && written.ok), source: source };
  } catch (eBead) {
    return { ok: false, reason: 'bead_write_failed', source: source,
      detail: trim(eBead && eBead.message || eBead, 200) };
  }
}

module.exports = {
  observe: observe,
  guardUrl: guardUrl,
  enabled: enabled,
  runtimeStatus: runtimeStatus,
  verifyPresence: runtimePresenceStatus,
  verifyRuntime: probeRuntimeStatus,
  concurrencyStatus: concurrencyStatus,
  _test: { inspectUrlShape, addressRefusal, v4Refusal, v6Refusal, expandV6, hostnameRefusal,
    loopbackAllowed, loadDriver, resolveExecutable, browserProcessEnvironment,
    prepareBrowserDirectories, launchOptions, runtimePresenceStatus, probeRuntimeStatus,
    runtimeStatus, storeScreenshot, storeScreenshotBeforeDeadline, settleBrowserCleanup,
    launchOwnedBrowser, childHasExited, waitForChildExit, setCleanupQuarantine,
    observationCapacity, reserveObservation, releaseObservation, concurrencyStatus, ALLOWED_PORTS,
    MAX_VIEWPORT_WIDTH, MAX_VIEWPORT_HEIGHT, MAX_FULL_PAGE_HEIGHT,
    DEFAULT_TIMEOUT_MS, TIMEOUT_CEILING_MS }
};
