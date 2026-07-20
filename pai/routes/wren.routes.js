// ⬡B:routes.wren:MODULE:wren_routes:20260630⬡
// ⬡B:routes.wren:FIX:dead_resolve_call_removed:20260630⬡
// CLAIR wiring fix: removed the local resolveHam() that called this service's
// own /resolve (a route that was never confirmed to exist) before handleReply ran.
// handleReply() in core/wren/reply.js never reads body.hamUid -- it does its own
// correct resolution against the real ATMOSPHERE service every time. The local
// call did nothing but add a network round trip and latency on every inbound text.
// This route's real entry gate is ATMOSPHERE, the ABAHAM-equivalent door for the
// WREN channel: no PAI cycle runs and no outbound notify to a HAM's phone leaves
// this file until that resolution returns a real HAM. Every reply that does leave
// is an outbound message on the WREN channel.
const { handleReply } = require('../core/wren/reply.js');
const webhookGuard = require('../core/webhook.guard.js');

function registerWrenRoutes(app) {
  // ⬡B:routes.wren:REPAIR:retire_open_reply_endpoint:20260703⬡
  // /wren/reply had zero authentication and would run a full PAI cycle and a
  // real Blooio send for any POST that resolved to a real HAM. Blooio's own
  // webhook registry confirms /wren/blooio is the one and only real target
  // (last_triggered: null on file, meaning no genuine inbound ever needed this
  // second route). Something internal was calling it directly, unrated, for
  // many hours, using the founder's real phone as its default test contact.
  // Retired, not deleted -- matches the CODEMAP precedent for the last dead
  // second handler found in this exact family of bug.
  app.post('/wren/reply',async(req,res)=>{
    res.status(410).json({ok:false,reason:'retired_endpoint',use:'/wren/blooio (real Blooio webhook only)'});
  });

  // ⬡B:routes.wren:FIX:async_webhook:20260630⬡
  // Respond 200 immediately -- Blooio webhooks timeout ~5s. Reply fires async.
  app.post('/wren/blooio',async(req,res)=>{
    const body=req.body||{};
    // ⬡B:routes.wren:GUARD:blooio_hmac_and_durable_replay_claim:20260715⬡
    // X-Blooio-Signature authenticates timestamp + exact raw body. The durable
    // claim is acquired before PAI, TAP, or any other effect can start.
    const auth=webhookGuard.verifyBlooio(req,process.env.BLOOIO_WEBHOOK_SECRET);
    if(!auth.ok)return res.status(auth.reason==='blooio_webhook_secret_unconfigured'?503:401)
      .json({ok:false,reason:auth.reason});
    // Authenticated message lifecycle events close autonomous REACH truth.
    // They never enter the inbound PAI/reply path and never treat queued/sent
    // provider states as delivery.
    const deliverySaga=require('../core/reach/provider.delivery.saga.js');
    const terminal=deliverySaga.parseBlooioTerminal(body,req.headers||{});
    if(terminal){
      if(!terminal.providerMessageId)return res.status(422)
        .json({ok:false,reason:'blooio_terminal_message_id_missing'});
      const recorded=await deliverySaga.recordTerminalEvent(terminal);
      if(recorded.ok)return res.status(200).json({ok:true,status:recorded.orphaned
        ?'terminal_event_buffered_for_binding':recorded.delivered
          ?'reach_delivery_recorded':recorded.failed
            ?'reach_failure_recorded':'terminal_event_recorded'});
      return res.status(/mismatch|ambiguous|invalid/.test(recorded.reason||'')?409:503)
        .json({ok:false,reason:recorded.reason||'blooio_terminal_receipt_unverified'});
    }
    const d=body.data||{};
    const providerId=body.event_id||body.webhook_id||body.message_id||body.id||
      d.event_id||d.message_id||d.id||'';
    const claim=await webhookGuard.claimWebhook('blooio',webhookGuard.eventKey(req,providerId));
    if(!claim.ok)return res.status(503).json({ok:false,reason:claim.reason});
    if(claim.duplicate)return res.json({ok:true,status:'duplicate_ignored'});
    res.json({ok:true,status:'processing'});
    setImmediate(async()=>{
      try{
        await handleReply(body);
      }catch(e){console.error('[wren/blooio]',e.message);}
    });
  });
}

module.exports=registerWrenRoutes;
