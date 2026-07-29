// ⬡B:routes.iman.routes:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _memorySelected(){return !!(process.env.MEMORY_BANK_URL||process.env.MEMORY_BANK_KEY);}
function _tbl(){return process.env.BEAD_TABLE||(_memorySelected()?'beads':'aibe_brain');}
function _schema(){return process.env.BRAIN_SCHEMA||(_memorySelected()?'memory_bank':'abacia_core');}
function ymd(){return new Date().toISOString().slice(0,10).replace(/-/g,'');}
// ⬡B:routes.iman.routes:ROUTE:inbound_pai:20260630⬡
// entered via the ABAHAM door, serving channel MESSAGES (IMAN email reach)
// IMAN inbound webhook. Resolves the real HAM through ATMOSPHERE, runs full PAI,
// replies via Nylas. Email is now a real channel, same engine as text.
// ANYHAM: any HAM who emails gets the full cycle. No hardcode.
// ⬡B:routes.iman:FIX:restore_live_channel_after_replacement_round4:20260703⬡
// Fourth replacement of this same file by a build task, same disease each time.
// Restored verbatim from 9d564eb again. The systemic additive-only guard task
// (ADDITIVE_ONLY_BUILD_LAW) landed its logic in anew's own core/build.js, which
// canew's build endpoint in a separate repo cannot require -- so it never had a
// chance to catch this. Moving that guard into canew's actual commit chokepoint
// directly, same turn, since the placement mistake is now understood precisely.
const { resolve } = require('../core/abaham.resolve');
const { runPAI } = require('../core/tool.loop.js');
const outboundCouncil = require('../core/pai.outbound.council.js');
const webhookGuard = require('../core/webhook.guard.js');

var ATM_URL = process.env.ATMOSPHERE_URL || 'https://atmosphere-x2oi.onrender.com';

// Resolve HAM via ATMOSPHERE first (fast legacy brain), fall back to abaham.resolve
// ⬡B:routes.iman:FIX:apply_ham_alias_20260701⬡
// Same alias map already proven live on text (core/wren/reply.js) and voice
// (routes/vara.llm.routes.js) was never applied here. Real incident: a 19:37 email
// from Brandon processed under ghost ham_uid the founder value, now from env while the same-hour text
// correctly resolved to the founder value, now from env, same bug class, third channel, found by reading
// the actual pai.minutes beads side by side, not assumed.
// ⬡B:routes.iman:WIRE:one_gate:20260701⬡, private resolver + alias copy replaced by
// the shared ATMOSPHERE gate. One gate, every channel, founder doctrine 20260701.
async function resolveHam(email) {
  var { resolveAtmosphere } = require('../core/atmosphere.gate.js');
  var envelope = await resolveAtmosphere({ email: email });
  if (!envelope || !envelope.ham_uid) return null;
  // ⬡B:routes.iman:GUARD:resolved_ham_kill_switch_fail_closed:20260715⬡
  // The switch belongs to the resolved sender world, not an env-default HAM.
  // A failed read is uncertainty, never permission to email.
  try {
    var state = await require('../core/killswitch.js').isActive(envelope.ham_uid);
    if (!state || typeof state.active !== 'boolean' || state.error) {
      return { ok:false, held:true, reason:'kill_switch_unverified' };
    }
    if (state.active) return { ok:false, held:true, reason:'kill_switch_active' };
  } catch (eKS) { return { ok:false, held:true, reason:'kill_switch_unverified' }; }
  return envelope;
}

// Send email reply via Nylas, grant resolved server-side, never hardcoded
// ⬡B:routes.iman:FIX:anu_from_name:20260702⬡
// Screenshot evidence: replies arrived as "Claudette Aims", the grant is Claudette's
// mailbox (live Nylas list confirms NO aba@/anu@ grant exists on either app; the env grant
// was mislabeled ABA from day one). A new grant needs a human OAuth login, which CLAIR
// cannot do. What CAN be fixed now: the send carries an explicit from-name so she
// presents as A'NU, not as Claudette. Grant email is fetched once and cached, the
// from email must match the grant, only the display name is hers.
var _grantEmailCache = {};
async function grantEmail(key, g) {
  if (_grantEmailCache[g]) return _grantEmailCache[g];
  try {
    var r = await fetch('https://api.us.nylas.com/v3/grants/' + g, { headers: { Authorization: 'Bearer ' + (typeof grantId !== 'undefined' ? keyForGrant(grantId) : key) } });
    var d = await r.json();
    var em = d && d.data && d.data.email;
    if (em) _grantEmailCache[g] = em;
    return em || null;
  } catch(e) { return null; }
}
// ⬡B:routes.iman:WIRE:grant_to_world_for_firewall:20260711⬡
// Reverse-map a grant to its EBC world so the firewall can be checked on the
// inbound auto-reply path. ABA and GMG grants are both the GMG world.
function worldForGrant(g) {
  var m = {};
  m[process.env.NYLAS_BDIF_GRANT] = 'bdif';
  m[process.env.NYLAS_MEDIATORS_GRANT] = 'mediators';
  m[process.env.NYLAS_MH_ACTION_GRANT] = 'mh_action';
  m[process.env.NYLAS_GMG_GRANT] = 'gmg';
  m[process.env.NYLAS_ABA_GRANT] = 'gmg';
  return m[g] || null;
}

async function sendEmailReply(toEmail, subject, body, grant, replyToId, hamUid, councilResult) {
  var key = process.env.NYLAS_API_KEY; // default; per-grant below
  // ⬡B:routes.iman:WIRE:grant_to_key_resolver:20260709⬡ the right app key per grant, always
  var keyForGrant = require('../core/nylasKeys.js').keyForGrant;
  var g = grant || process.env.NYLAS_ABA_GRANT;
  if (!key || !g) return { ok: false, reason: 'no_nylas_config' };
  var grantKey = keyForGrant(g) || key;
  // ⬡B:routes.iman:WIRE:ebc_firewall_guard_on_reply:20260711⬡
  // Live breach 2026-07-11 01:44: this exact path auto-replied FROM the GMG world
  // naming MH Action, Mediators, AND BDIF in one message, and read the firewall
  // aloud. This path bypassed the guarded reach/iman.send entirely. Guard it here:
  // a reply from a world may not name a sibling world or the firewall itself.
  try {
    var _pam = require('../board/pam/pam.js');
    var _world = worldForGrant(g);
    var _scan = String(subject || '') + ' ' + String(body || '');
    if (_world) {
      var _fw = _pam.checkEbcFirewall(_scan, _world);
      if (!_fw.ok) return { ok: false, blocked: true, reason: 'ebc_firewall_block: ' + _world + ' reply named the ' + _fw.from_world + ' world' };
    }
    if (/\bebc\b|firewall/i.test(_scan)) return { ok: false, blocked: true, reason: 'ebc_firewall_block: reply referenced the firewall itself' };
  } catch (eFw) { return { ok: false, blocked: true, reason: 'ebc_firewall_guard_unavailable' }; }
  var payload = {
    subject: subject || 'Re: your message',
    body: body,
    to: [{ email: toEmail, name: '' }]
  };
  // ⬡B:routes.iman:FIX:from_address_was_alias_not_real_account:20260704⬡
  // Founder correction, direct and repeated, live tonight: Nylas' own grant
  // lookup reports the grant's own mailbox address as this grant's email,
  // but in Google Workspace the real account username can differ, and the alias
  // is only a send-as alias layered on top -- backwards from what Nylas
  // auto-detected. An explicit override takes priority over the grant's own
  // (wrong, for this account) self-reported address; falls back to the old
  // auto-detected behavior only if the override isn't configured.
  var fromEm = process.env.NYLAS_ABA_FROM_EMAIL || await grantEmail(key, g);
  if (fromEm) payload.from = [{ name: process.env.ANU_FROM_NAME || "A'NU", email: fromEm }];
  if (replyToId) payload.reply_to_message_id = replyToId;
  var receipt = councilResult && (councilResult.council_receipt || councilResult.councilReceipt);
  if (!receipt || String(receipt.ham_uid || '').toUpperCase() !== String(hamUid || '').toUpperCase()) {
    return { ok:false, reason:'email_receipt_ham_mismatch' };
  }
  var deliveryCommit = outboundCouncil.requireVerifiedCouncilDelivery(councilResult,
    { kind:'email', value:toEmail }, councilResult && councilResult.answer);
  if (!deliveryCommit || deliveryCommit.ok !== true) {
    return { ok:false, reason:'email_delivery_target_unverified' };
  }
  try {
    if (!_bu() || !_bk()) return { ok:false, reason:'kill_switch_unverified' };
    var state = await require('../core/killswitch.js').isActive(hamUid);
    if (!state || typeof state.active !== 'boolean' || state.error) {
      return { ok:false, reason:'kill_switch_unverified' };
    }
    if (state.active) return { ok:false, reason:'kill_switch_active' };
  } catch (eKill) { return { ok:false, reason:'kill_switch_unverified' }; }
  try {
    var r = await fetch('https://api.us.nylas.com/v3/grants/' + g + '/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + grantKey,
        'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    var d = await r.json().catch(function(){ return { ok: false }; });
    var messageId = d.data && d.data.id;
    return { ok: !!(r.ok && messageId), message_id: messageId || null,
      reason: r.ok && !messageId ? 'provider_ack_missing_message_id' : undefined };
  } catch(e) { return { ok:false, reason:'provider_uncertain' }; }
}

// Process inbound email through PAI (async, after 200 response)
async function processInbound(obj, fromEmail, hamData) {
  var hamUid = hamData.ham_uid;
  var subject = String(obj.subject || '');
  var rawBody = obj.plaintext_body != null ? obj.plaintext_body
    : obj.body != null ? obj.body : obj.snippet || '';
  var bodyText = String(rawBody);
  var replyToId = obj.id || null;

  if (!bodyText.trim()) return;

  // ⬡B:routes.iman:WIRE:world_scope_inbound_pai:20260711⬡
  // Root of the 01:44 firewall breach: an email to a WORLD grant ran the founder's
  // all-seeing PAI, whose brain read spans every world, so a GMG reply surfaced MH
  // Action, Mediators, and BDIF. Scope the cycle to the receiving world up front so
  // the reasoning stays in-world. The send-side firewall guard remains the hard,
  // fail-closed backstop; this stops the cross-world content from ever being formed.
  var _replyWorld = (typeof worldForGrant === 'function') ? worldForGrant(hamData.nylas_grant) : null;
  var _scope = _replyWorld
    ? '[WORLD SCOPE, ABSOLUTE: You are operating strictly inside the ' + _replyWorld.toUpperCase()
      + ' world. Reference ONLY ' + _replyWorld.toUpperCase() + '. You must NEVER read, name, mention, or compare any other client, foundation, organization, or world, and never mention any firewall or internal system. If the inbound is not about ' + _replyWorld.toUpperCase()
      + ', keep the reply strictly about ' + _replyWorld.toUpperCase() + ' and say nothing else.]\n\n'
    : '';

  // ⬡B:routes.iman:GUARD:exact_committed_email_bytes:20260715⬡
  // Full PAI cycle, same as text. The exact sender content is the request claim;
  // the world-scope instruction is deliberation input and may never replace it in
  // the durable receipt.
  var exactMessage = subject + '\n\n' + bodyText;
  var replySubject = subject.toLowerCase().indexOf('re:') === 0 ? subject : 'Re: ' + subject;
  var groundedBody = bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
  var deliberationInput = _scope
    + 'Compose the exact email artifact A\'NU should send. Return exactly this format, with no text before it:\n'
    + 'SUBJECT: <one-line subject>\nBODY:\n<plain-text body>\n\n'
    + 'Use this reply subject unless a truthful correction is required: ' + replySubject + '\n'
    + 'Reply directly to the inbound email below. Do not narrate the process.\n\n'
    + 'INBOUND EMAIL:\n' + subject + '\n\n' + groundedBody;
  var emailIdentity = Object.assign({}, hamData || {}, {
    user_message: exactMessage,
    world: _replyWorld || hamData && hamData.world || null,
    delivery: { external:true },
    council_context: Object.assign({}, hamData && hamData.council_context || {}, {
      mode: 'email',
      original_user_message: exactMessage,
      active_world: _replyWorld || null,
      delivery_target: { kind:'email', value:fromEmail }
    })
  });
  var paiResult = await runPAI(hamUid, deliberationInput, 'email', emailIdentity);
  if (!paiResult || !paiResult.ok) return;
  var requestId = paiResult.requestId || paiResult.request_id;
  var cycleId = paiResult.cycleId || paiResult.cycle_id;
  var committed = outboundCouncil.requireVerifiedCouncilResult(paiResult, {
    hamUid: hamUid,
    requestId: requestId,
    cycleId: cycleId,
    question: exactMessage,
    deliberationInput: deliberationInput,
    answer: paiResult.answer,
    deliveryTarget: { kind:'email', value:fromEmail }
  });
  var councilProof = outboundCouncil.compactCouncilProof(paiResult);
  if (!committed || committed.ok !== true || committed.answer !== paiResult.answer ||
      !councilProof || councilProof.committed !== true || councilProof.readback_verified !== true ||
      councilProof.row_count !== 9) return;

  // ⬡B:routes.iman:GUARD:approved_email_artifact_transport:20260715⬡
  // Subject and body are parsed as exact substrings of the committed artifact.
  // No HTML escaping, paragraph wrapping, trimming, or prefixing occurs after STAMP.
  var artifact = committed.answer.match(/^SUBJECT:[ \t]*([^\r\n]+)\r?\nBODY:\r?\n([\s\S]+)$/);
  if (!artifact || !artifact[1] || !artifact[2] || !artifact[2].trim()) return;
  var approvedSubject = artifact[1];
  var approvedBody = artifact[2];
  // ⬡B:routes.iman:WIRE:shared_hollow_gate:20260706⬡ L4: email had NO hollow
  // check; a canned holding line the text channel refused could still ship by
  // email. Same law, same gate, silence over hollow.
  var hollowCheck = require('../core/hollow.gate.js').isHollow(approvedBody);
  if (hollowCheck.hollow) {
    require('../core/outbound.trace.js').stampOutbound({ hamUid: hamUid, channel: 'email', silent: true, reason: 'refused_hollow_' + hollowCheck.reason }).catch(function(){});
    return;
  }

  // Grant from HAM registration if EBC world, else default ABA grant
  var grant = hamData.nylas_grant || null;
  var sendRes = await sendEmailReply(fromEmail, approvedSubject, approvedBody, grant,
    replyToId, hamUid, paiResult);
  if (!sendRes || sendRes.ok !== true) return;
  require('../core/outbound.trace.js').stampOutbound({ hamUid: hamUid, channel: 'email', sent: true, textPreview: approvedBody }).catch(function(){});
  require('../logful/index.js').logfulStore({ hamUid: hamUid, agent: 'ANU', type: 'channel_turn',
    data: { channel: 'email', inputData: exactMessage, subject: approvedSubject,
      answer: approvedBody, councilProof: councilProof },
    summary: '[EMAIL turn] ' + String(subject).slice(0, 80), importance: 5 }).catch(function(){}); // \u2b21B:memory.unification:BUILD:every_channel_saves_full_turns_20260710\u2b21
}

module.exports = function(app) {
  // ⬡B:routes.iman:DOOR:canonical_outbound_email_boundary:20260715⬡
  // Standalone MESSAGES proxies here. The existing IMAN module owns identity,
  // full PAI finalization, target binding, kill switch, effect claim, and Nylas.
  app.post('/iman/send', async function(req, res) {
    try {
      var b = req.body || {};
      var routeAuthorization = await require('../core/pai.outbound.authorization.js')
        .consumeInternalEffectRequest(req, '/iman/send');
      if (!routeAuthorization.ok) {
        var authStatus = routeAuthorization.reason === 'internal_effect_authorization_unconfigured'
          || routeAuthorization.reason === 'internal_effect_request_claim_uncertain' ? 503
          : routeAuthorization.reason === 'internal_effect_request_replayed' ? 409 : 401;
        return res.status(authStatus).json({ ok:false, sent:false,
          reason:routeAuthorization.reason });
      }
      if (!b.hamUid || !b.to || !b.world || typeof b.subject !== 'string' ||
          typeof b.body !== 'string') {
        return res.status(400).json({ ok:false, reason:'hamUid_to_subject_body_world_required' });
      }
      var requestId = b.requestId || b.request_id ||
        req.headers['idempotency-key'] || req.headers['x-anu-request-id'];
      var out = await require('../reach/iman.js').send(b.to, b.subject, b.body, b.world,
        { hamUid:b.hamUid, requestId:requestId });
      return res.status(out && out.ok === true ? 200 : 502).json(out ||
        { ok:false, reason:'iman_boundary_unverified' });
    } catch (eSend) {
      return res.status(500).json({ ok:false, reason:'iman_boundary_failed' });
    }
  });

  // Webhook verification: echo the challenge on GET so Nylas accepts the URL.
  app.get('/iman/inbound', (req, res) => {
    const challenge = req.query && req.query.challenge;
    if (challenge) return res.status(200).send(challenge);
    return res.status(200).json({ ok: true, service: 'IMAN' });
  });

  app.post('/iman/inbound', async (req, res) => {
    try {
      const b = req.body || {};
      // ⬡B:routes.iman:GUARD:nylas_hmac_and_durable_replay_claim:20260715⬡
      // Nylas signs the exact raw body with the destination webhook secret.
      // Authenticate and atomically claim that delivery before any brain write,
      // PAI turn, or reply. Provider retries receive a harmless duplicate ack.
      var secretList = [process.env.NYLAS_WEBHOOK_SECRET,
        process.env.NYLAS_PRODUCTION_WEBHOOK_SECRET,
        process.env.NYLAS_SANDBOX_WEBHOOK_SECRET]
        .concat(String(process.env.NYLAS_WEBHOOK_SECRETS || '').split(','))
        .map(function(x){ return String(x || '').trim(); }).filter(Boolean);
      var auth = webhookGuard.verifyNylas(req, secretList);
      if (!auth.ok) return res.status(auth.reason === 'nylas_webhook_secret_unconfigured' ? 503 : 401)
        .json({ ok:false, reason:auth.reason });
      // Nylas immediate-send acceptance is not delivery. Only an exact tracked
      // opened/replied event, or a bounce failure, may close an autonomous
      // REACH email. Handle these authenticated raw events before the generic
      // inbound-mail claim so they can never trigger an inbound PAI reply.
      var deliverySaga = require('../core/reach/provider.delivery.saga.js');
      var terminal = deliverySaga.parseNylasTerminal(b);
      if (terminal) {
        if (!terminal.providerMessageId) return res.status(422)
          .json({ ok:false, reason:'nylas_terminal_message_id_missing' });
        var terminalReceipt = await deliverySaga.recordTerminalEvent(terminal);
        if (terminalReceipt.ok) return res.status(200).json({ ok:true,
          status:terminalReceipt.orphaned ? 'terminal_event_buffered_for_binding'
            : terminalReceipt.delivered ? 'reach_positive_receipt_recorded'
              : terminalReceipt.failed ? 'reach_bounce_recorded' : 'terminal_event_recorded' });
        return res.status(/mismatch|ambiguous|invalid/.test(terminalReceipt.reason || '') ? 409 : 503)
          .json({ ok:false, reason:terminalReceipt.reason || 'nylas_terminal_receipt_unverified' });
      }
      var providerEventId = b.id || b.event_id || b.data && b.data.id ||
        b.data && b.data.object && b.data.object.id || '';
      var claim = await webhookGuard.claimWebhook('nylas',
        webhookGuard.eventKey(req, providerEventId));
      if (!claim.ok) return res.status(503).json({ ok:false, reason:claim.reason });
      if (claim.duplicate) return res.status(200).json({ ok:true, status:'duplicate_ignored' });
      res.status(200).json({ ok:true, status:'received' });
      // ⬡B:routes.iman:WIRE:grant_lifecycle_webhooks_l6:20260706⬡
      // Nylas sends grant.expired / grant.updated on the same webhook. Before
      // this, an expired grant was invisible until sends started failing
      // silently. Now: an ALERT bead lands immediately, importance 9, naming
      // the grant, so Overseer's next read sees the reach channel dying while
      // it can still be saved.
      const evType = b.type || (b.data && b.data.type) || '';
      if (evType === 'grant.expired' || evType === 'grant.updated') {
        const gObj = (b.data && b.data.object) ? b.data.object : {};
        const gid = gObj.grant_id || gObj.id || 'unknown';
        const ts = Date.now();
        // ⬡B:routes.iman:WIRE:auto_reauth_link_l6:20260706⬡
        // A dead grant is useless as an alert with no cure. Nylas hosted auth
        // produces a one-tap re-consent URL; the alert now CARRIES it so the
        // exit council can text the founder a link that fixes email in one tap
        // instead of a dead-end 'reach is down' notice. env-driven, degrades to
        // the console link if client config is absent.
        const nylasBase = process.env.NYLAS_API_URI || 'https://api.us.nylas.com';
        const clientId = process.env.NYLAS_CLIENT_ID || '';
        const redirect = process.env.NYLAS_REDIRECT_URI || 'https://aibebase.onrender.com/iman/oauth/callback';
        const reauthUrl = clientId
          ? nylasBase + '/v3/connect/auth?client_id=' + encodeURIComponent(clientId)
              + '&redirect_uri=' + encodeURIComponent(redirect)
              + '&response_type=code&provider=google&login_hint=' + encodeURIComponent(gObj.email || '')
          : 'https://dashboard-v3.nylas.com/ (re-auth grant ' + gid + ' manually)';
        await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
          method: 'POST',
          headers: { apikey: process.env.AIBE_BRAIN_KEY, Authorization: 'Bearer ' + process.env.AIBE_BRAIN_KEY,
            'Accept-Profile': _schema(), 'Content-Profile': _schema(),
            'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            ham_uid: process.env.DEFAULT_HAM_UID || 'unknown', agent_global: 'IMAN',
            stamp_type: 'ALERT', importance: evType === 'grant.expired' ? 9 : 6,
            acl_stamp: '⬡B:routes.iman:ALERT:' + evType.replace('.', '_') + ':' + ts + '⬡',
            source: 'iman.grant_lifecycle.' + gid + '.' + ts,
            summary: '[IMAN ' + evType.toUpperCase() + '] grant ' + gid + (evType === 'grant.expired' ? ' EXPIRED, email reach on this grant is DOWN until re-auth' : ' updated'),
            content: JSON.stringify({ event: evType, grant_id: gid, reauth_url: reauthUrl })
          })
        }).catch(function(){});
        return;
      }
      const obj = (b.data && b.data.object) ? b.data.object : b;
      // ⬡B:routes.iman:FIX:sender_extraction_and_self_mail:20260703⬡
      // Live failure 20260703: a real founder email arrived and fromEmail resolved to
      // the grant's own mailbox address, so the real sender never resolved and the
      // unresolved stamp carried nothing but that address.
      // Three real causes closed here together:
      // 1. The old chain ended in `|| obj.from` -- when Nylas sends from as a bare string
      //    or an unexpected shape, whole objects/strings leaked through unvalidated.
      // 2. The folder skip compared against uppercase 'SENT'/'DRAFT', but Nylas v3 folder
      //    values are not reliably uppercase -- our own sent mail (from = our own grant
      //    address) sailed straight through and became the "inbound".
      // 3. The unresolved stamp recorded only {from}, leaving nothing to diagnose with.
      var fromEmail = '';
      if (Array.isArray(obj.from) && obj.from[0] && obj.from[0].email) fromEmail = obj.from[0].email;
      else if (obj.from && typeof obj.from === 'object' && obj.from.email) fromEmail = obj.from.email;
      else if (typeof obj.from_email === 'string') fromEmail = obj.from_email;
      else if (typeof obj.from === 'string') fromEmail = obj.from;
      fromEmail = String(fromEmail || '').trim().toLowerCase();

      // Skip our own sent mail -- case-insensitive folder check
      var folders = (obj.folders || []).map(function(f){ return String(f).toUpperCase(); });
      if (folders.indexOf('SENT') >= 0 || folders.indexOf('DRAFT') >= 0) return;

      // Self-mail guard: if the "sender" is one of our own grant mailboxes, this is our
      // own outbound echoing back through the webhook, never a real inbound. The mailbox list
      // is env-only, per-world (founder-PII leak-guard law): OWN_MAILBOXES is a comma-separated
      // env var, so no world's real addresses are baked into the shared template.
      var OWN_MAILBOXES = String(process.env.OWN_MAILBOXES || '').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
      if (OWN_MAILBOXES.indexOf(String(fromEmail || '').toLowerCase()) >= 0) return;

      // Resolve HAM
      const hamData = await resolveHam(fromEmail);
      if (!hamData || !hamData.ham_uid) {
        if (hamData && hamData.held) return;
        // Unknown sender, log, never route
        const BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
        if (_bu() && _bk()) {
          try {
            await fetch(_bu() + '/rest/v1/' + _tbl() + '', {
              method: 'POST',
              headers: { apikey: _bk(), Authorization: 'Bearer ' + _bk(), 'Content-Profile': _schema(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ ham_uid: 'unknown', agent_global: 'IMAN', stamp_type: 'UNRESOLVED_INBOUND', acl_stamp: 'CORE:IMAN:UNRESOLVED:' + Date.now(), source: 'iman.unresolved.' + Date.now(), summary: '[IMAN] unresolved inbound from ' + fromEmail + ' -- subject: ' + String(obj.subject || '(none)').slice(0, 80), importance: 6, content: JSON.stringify({ from: fromEmail, subject: String(obj.subject || '').slice(0, 200), snippet: String(obj.snippet || obj.body || '').replace(/<[^>]*>/g, ' ').slice(0, 300) }) })
            });
          } catch (e) {}
        }
        return;
      }

      // EBC firewall, if this HAM is firewalled, don't cross worlds
      if (hamData.ebc_firewall) return;

      // Run the full PAI cycle and reply
      await processInbound(obj, fromEmail, hamData);
    } catch (err) {
      console.error('[IMAN] inbound error:', err.message);
    }
  });
};
