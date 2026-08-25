// ⬡B:core.writ_meaning_shadow:WONDER:penny_shadow_challenges_final_human_meaning:20260806⬡
'use strict';

const crypto = require('node:crypto');
const normalizeHamUid = require('./ham.uid.validator.js').normalizeHamUid;

const SCHEMA = 'anew.writ-meaning-shadow.v1';
const ATTEMPT_SCHEMA = 'anew.writ-meaning-shadow-attempt.v1';
const TYPE = 'WRIT_MEANING_SHADOW_VERDICT';
const ATTEMPT_TYPE = 'WRIT_MEANING_SHADOW_ATTEMPT';
const DECISIONS = new Set(['AGREE','DISAGREE','UNCERTAIN']);

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable(value[key]);
  }).join(',') + '}';
}

function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function clean(value, limit) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit || 1200);
}

function parse(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  var text = String(value || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  try {
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

function transport(value) {
  if (value && value.content != null) return value.content;
  if (value && value.text != null) return value.text;
  if (value && value.answer != null) return value.answer;
  return value && value.choices && value.choices[0] && value.choices[0].message
    ? value.choices[0].message.content : null;
}

function binding(input) {
  var ham = normalizeHamUid(String(input && input.ham_uid || '').trim());
  var request = clean(input && input.request_id, 180);
  var cycle = clean(input && input.cycle_id, 220);
  if (!ham || !/^[A-Za-z0-9._:-]{8,180}$/.test(request) ||
      !/^[A-Za-z0-9._:-]{8,220}$/.test(cycle)) return null;
  return {ham_uid:ham,request_id:request,cycle_id:cycle};
}

function exactText(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return {text:value,digest:digest(value),bytes:Buffer.byteLength(value,'utf8')};
}

function receiptText(value) {
  return {digest:value.digest,bytes:value.bytes};
}

function receiptVerdict(value) {
  return {decision:value.decision,reason_digest:digest(value.reason),
    reason_bytes:Buffer.byteLength(value.reason,'utf8'),model:value.model,via:value.via};
}

function packet(input, bound) {
  var pre = exactText(input && input.pre_writ_draft);
  var writ = exactText(input && input.writ_output);
  var meta = exactText(input && input.post_meta_candidate);
  var released = exactText(input && input.final_human_output);
  if (!pre || !writ || !meta || !released) return null;
  return {binding:bound,pre_writ_draft:pre,writ_output:writ,post_meta_candidate:meta,
    final_human_output:released};
}

function verdict(value) {
  var parsed = parse(transport(value));
  var decision = clean(parsed && parsed.decision, 24).toUpperCase();
  var reason = clean(parsed && parsed.reason, 1200);
  if (!DECISIONS.has(decision) || !reason) return null;
  // SHADOW REBUILD 20260807 (founder: "get it right, not hold it," never silence her on
  // tone). FAIL-CLOSED: a disagreement is presumed CONSEQUENTIAL (material: a changed fact,
  // number, date, name, commitment, authority, or WHO owns/does/receives) and is held, exactly
  // as the live cycle already holds it. Her voice ships THROUGH a disagreement only when SHADOW
  // AFFIRMATIVELY clears it as a tone, warmth, length, or ordinary wording nuance
  // (consequential:false). Presuming material is strictly safer-or-equal to the old blank-on-any
  // -disagreement: it never ships a material change, it only stops blanking her on pure tone.
  var consequential = !(parsed && parsed.consequential === false);
  return {decision:decision,reason:reason,consequential:consequential,
    model:clean(value && value.model,160)||null,
    via:clean(value && (value.via || value.provider),160)||null};
}

function completionTruth(value) {
  var choice = value && value.choices && value.choices[0];
  if (!choice) return {complete:true,finish_reason:null,native_finish_reason:null};
  var finish = clean(choice.finish_reason, 80).toLowerCase() || null;
  var native = clean(choice.native_finish_reason, 80).toLowerCase() || null;
  var finishComplete = finish === null || finish === 'stop';
  var nativeComplete = native === null || ['stop','eos','eos_token'].includes(native);
  return {complete:finishComplete && nativeComplete,finish_reason:finish,
    native_finish_reason:native};
}

function opaqueTransportReceipt(value) {
  var carried = transport(value);
  if (carried == null) return {digest:null,bytes:0};
  var represented = typeof carried === 'string' ? carried : stable(carried);
  return {digest:digest(represented),bytes:Buffer.byteLength(represented,'utf8')};
}

function rowField(row, snake, camel) {
  return row && row[snake] != null ? row[snake] : row && row[camel];
}

async function persist(exactPacket, judged, options, independentReview) {
  var bound = exactPacket.binding;
  var edges = [
    {type:'ABOUT',target:'pai.cycle.' + bound.cycle_id},
    {type:'PRODUCED_BY',target:'agent.penny_shadow'},
    {type:'CHALLENGES',target:'station.writ'},
    {type:'RELATES_TO',target:'station.meta_commentary'}
  ];
  var resume = judged.decision === 'AGREE' ? null :
    'Resume only from a changed source draft or a new WRIT or Meta candidate with a new exact byte packet.';
  var content = {schema:SCHEMA,binding:bound,shadow_node_id:'agent.penny_shadow',
    pre_writ_draft:receiptText(exactPacket.pre_writ_draft),
    writ_output:receiptText(exactPacket.writ_output),
    post_meta_candidate:receiptText(exactPacket.post_meta_candidate),
    shadow_verdict:receiptVerdict(judged),
    final_human_output:receiptText(exactPacket.final_human_output),
    decision:judged.decision,resume_condition:resume,edges:edges};
  if (independentReview) content.independent_review = independentReview;
  content.receipt_digest = digest(content);
  var source = 'writ.meaning.shadow.' + bound.ham_uid.toLowerCase() + '.' + content.receipt_digest;
  var brain = options.brain || require('./brain.client.js');
  var writeUncertain = false;
  try {
    await brain.writeBead({hamUid:bound.ham_uid,agentGlobal:'PENNY_SHADOW',source:source,
      type:TYPE,content:content,summary:'PENNY SHADOW challenged the final writing meaning.',
      importance:8,edges:edges});
  } catch (error) {
    writeUncertain = true;
  }
  try {
    var row = await brain.findBySource(source,bound.ham_uid);
    var read = parse(row && row.content);
    if (!row || row.source !== source ||
        String(rowField(row,'ham_uid','hamUid') || '').toUpperCase() !== bound.ham_uid ||
        String(rowField(row,'agent_global','agentGlobal') || '').toUpperCase() !== 'PENNY_SHADOW' ||
        String(rowField(row,'stamp_type','type') || '') !== TYPE ||
        stable(read) !== stable(content)) {
      return {ok:false,reason:'writ_meaning_shadow_receipt_readback_mismatch'};
    }
    return {ok:true,source:source,digest:content.receipt_digest,content:content,
      recovered_after_write_uncertainty:writeUncertain};
  } catch (error) {
    return {ok:false,reason:'writ_meaning_shadow_receipt_unverified'};
  }
}

async function persistInvalidAttempt(exactPacket, raw, invalidReason, options) {
  var bound = exactPacket.binding;
  var completion = completionTruth(raw);
  var carried = opaqueTransportReceipt(raw);
  var edges = [
    {type:'ABOUT',target:'pai.cycle.' + bound.cycle_id},
    {type:'PRODUCED_BY',target:'agent.penny_shadow'},
    {type:'CHALLENGES',target:'station.writ'}
  ];
  var content = {schema:ATTEMPT_SCHEMA,binding:bound,shadow_node_id:'agent.penny_shadow',
    pre_writ_draft:receiptText(exactPacket.pre_writ_draft),
    writ_output:receiptText(exactPacket.writ_output),
    post_meta_candidate:receiptText(exactPacket.post_meta_candidate),
    final_human_output:receiptText(exactPacket.final_human_output),
    invalid_reason:invalidReason,finish_reason:completion.finish_reason,
    native_finish_reason:completion.native_finish_reason,transport_digest:carried.digest,
    transport_bytes:carried.bytes,model:clean(raw && raw.model,160)||null,
    via:clean(raw && (raw.via || raw.provider),160)||null,
    provider_request_id:clean(raw && raw.id,240)||null,
    usage:{prompt_tokens:Number.isSafeInteger(raw && raw.usage && raw.usage.prompt_tokens)
        ? raw.usage.prompt_tokens:null,
      completion_tokens:Number.isSafeInteger(raw && raw.usage && raw.usage.completion_tokens)
        ? raw.usage.completion_tokens:null,
      reasoning_tokens:Number.isSafeInteger(raw && raw.usage && raw.usage.completion_tokens_details &&
        raw.usage.completion_tokens_details.reasoning_tokens)
        ? raw.usage.completion_tokens_details.reasoning_tokens:null,
      reported_cost:raw && raw.usage && Number.isFinite(raw.usage.cost)
        ? String(raw.usage.cost):null},verdict_valid:false,decision:null,edges:edges};
  content.receipt_digest = digest(content);
  var source = 'writ.meaning.shadow.attempt.' + bound.ham_uid.toLowerCase() + '.' +
    content.receipt_digest;
  var brain = options.brain || require('./brain.client.js');
  var writeUncertain = false;
  try {
    await brain.writeBead({hamUid:bound.ham_uid,agentGlobal:'PENNY_SHADOW',source:source,
      type:ATTEMPT_TYPE,content:content,
      summary:'PENNY SHADOW returned no usable meaning verdict.',importance:8,edges:edges});
  } catch (error) {
    writeUncertain = true;
  }
  try {
    var row = await brain.findBySource(source,bound.ham_uid);
    var read = parse(row && row.content);
    if (!row || row.source !== source ||
        String(rowField(row,'ham_uid','hamUid') || '').toUpperCase() !== bound.ham_uid ||
        String(rowField(row,'agent_global','agentGlobal') || '').toUpperCase() !== 'PENNY_SHADOW' ||
        String(rowField(row,'stamp_type','type') || '') !== ATTEMPT_TYPE ||
        stable(read) !== stable(content)) {
      return {ok:false,reason:'writ_meaning_shadow_attempt_readback_mismatch'};
    }
    return {ok:true,source:source,digest:content.receipt_digest,content:content,
      recovered_after_write_uncertainty:writeUncertain};
  } catch (error) {
    return {ok:false,reason:'writ_meaning_shadow_attempt_unverified'};
  }
}

async function judge(input, options) {
  var opts = options || {};
  var bound = binding(input);
  if (!bound) return {ok:false,reason:'writ_meaning_shadow_binding_invalid'};
  var exactPacket = packet(input,bound);
  if (!exactPacket) return {ok:false,reason:'writ_meaning_shadow_packet_invalid'};

  var system = 'You are PENNY SHADOW, an independent low-cost Wonder. Compare four exact texts: '
    + 'the pre-WRIT draft, WRIT output, post-Meta candidate, and final human output. Decide whether the final output '
    + 'preserves the meaning, outcomes, entities, relationships, causality, commitments, uncertainty, '
    + 'and material implications of the source draft. WRIT owns expression and Meta Commentary owns '
    + 'internal-process cleanup. You do not rewrite either Wonder. You only challenge whether their '
    + 'combined result materially preserved meaning. '
    + 'Do not decide from word overlap, keyword lists, length, or surface similarity. '
    + 'Do not penalize harmless second-person adaptation or ordinary synonyms. A wording '
    + 'or point-of-view change is not a disagreement unless it materially changes who owns, does, '
    + 'receives, promises, or experiences something. Challenge any internal process narration or system vocabulary introduced '
    + 'by Meta or the final transport when it was absent from the source. Return strict JSON only: '
    + '{"decision":"AGREE|DISAGREE|UNCERTAIN",'
    + '"consequential":true or false,'
    + '"reason":"one concrete explanation"}. On DISAGREE, set consequential true ONLY when the '
    + 'final output changes a fact, number, date, name, commitment, authority, or WHO owns, does, '
    + 'receives, promises, or experiences something. A tone, warmth, length, or ordinary wording '
    + 'nuance is consequential false. Use UNCERTAIN whenever the comparison cannot be made '
    + 'honestly. Never address the person.';
  var user = JSON.stringify({binding:bound,pre_writ_draft:exactPacket.pre_writ_draft.text,
    writ_output:exactPacket.writ_output.text,
    post_meta_candidate:exactPacket.post_meta_candidate.text,
    final_human_output:exactPacket.final_human_output.text});
  // ⬡B:core.writ_meaning_shadow:911:an_unreachable_judge_was_deleting_her_answer:20260815⬡
  // THIS IS THE 32 SECONDS OF SILENCE ON A LIVE PHONE CALL, traced end to end.
  //
  // This judge rode ONE seat with NO second wallet. model.router.js#chatSeat builds a chain of
  // the primary plus the seat's OWN declared fallbackModel, which rides the SAME key, and
  // c1_cellm declares none at all, so the chain is length one. c1_cellm's $2/day ceiling is
  // shared with board/pam, reach.department, tim, logful/gate, the gauntlet panel, tool.loop
  // and model.shadow.executor. When that shared wallet is spent, openrouter.seat.spend raises
  // openrouter_seat_daily_dollar_cap_reached, chatSeat throws, and this catch reported
  // writ_meaning_shadow_unavailable. The exit gate in pai.outbound.council then set her
  // composed, WRIT-rendered, PAM-clean answer to the empty string and the caller heard nothing.
  //
  // So a shared wallet running dry was silently converted into "she had nothing to say". Cold
  // code deciding she was finished, on a fact it never had.
  //
  // WHY THIS IS NOT A WEAKENING, and the distinction is the whole point. It would have been
  // easy and wrong to release her bytes when the judge is unreachable. That is not what this
  // does. A first UNCERTAIN asks C4 for one independent verdict on the same packet. It is not
  // a clearance by itself. An unresolved or second UNCERTAIN still holds, because UNCERTAIN is
  // a judgment a mind FORMED after looking. UNREACHABLE is the absence of any judgment at all.
  // The repair is not to decide in the judge's place. It is to make the judge REACHABLE.
  //
  // NOTHING ABOUT THE QUESTION CHANGES. The system prompt and the user payload above are passed
  // byte-identically to the second attempt. No hint, no summary of the first failure, no
  // suggested verdict, no "the primary was unavailable so be lenient". The second seat receives
  // exactly what the first would have received and forms its own view from the same evidence.
  // A planted expectation here would be the pen on her mind one door over.
  //
  // c4_watch is the same baked model at the same price on its OWN key under its OWN ceiling, so
  // this is a second WALLET and not merely a second name. A failover onto the same exhausted
  // key is not a failover. If both wallets are gone the answer is still
  // writ_meaning_shadow_unavailable and the gate still holds, exactly as before.
  //
  // The receipt names the seat that ACTUALLY answered. Stamping c1_cellm on bytes bought by
  // c4_watch would be a lie in a durable record.
  var raw;
  var judgeSeats = ['c1_cellm', 'c4_watch'];
  var lastJudgeError = null;
  var answeringSeat = null;
  var chatSeat = opts.chatSeat || require('./model.router.js').chatSeat;
  var askSeat = async function (judgeSeat) {
    return await chatSeat(judgeSeat,[
      {role:'system',content:system},{role:'user',content:user}
    ],{temperature:0,maxTokens:320,reasoning:{effort:'none',exclude:true},
      requireParameters:true,signal:opts.signal || undefined,
      attribution:{component:'writ.meaning.shadow',
      ham_uid:bound.ham_uid,request_id:bound.request_id + '.writ-meaning-shadow',
      cycle_id:bound.cycle_id,seat:judgeSeat,owner_node_id:'agent.penny_shadow',
      target_wonder_id:'agent.penny_shadow'}});
  };
  for (var seatIndex = 0; seatIndex < judgeSeats.length; seatIndex++) {
    var judgeSeat = judgeSeats[seatIndex];
    try {
      raw = await askSeat(judgeSeat);
      lastJudgeError = null;
      answeringSeat = judgeSeat;
      break;
    } catch (error) {
      lastJudgeError = error;
      raw = null;
      // ⬡B:core.writ_meaning_shadow:FIX:a_cancelled_judgment_is_not_an_unreachable_one:20260815⬡
      // CAUGHT BY AN EXISTING TEST, not by me: my first version of this failover retried on
      // EVERY error including cancellation, so a turn the caller had already abandoned bought a
      // second paid call on a second wallet. The existing pin
      // "a cancelled final meaning judgment releases the C1 seat for the next turn" went red,
      // which is exactly what it was written to do.
      //
      // Cancellation is a DECISION ALREADY MADE, not a wallet that ran dry. The estate's own
      // rule is do not retry an unknown effect merely because a gateway went away. A second
      // wallet is the repair for "no mind could be reached"; it is not a licence to re-ask a
      // question nobody is waiting for the answer to.
      if (opts.signal && opts.signal.aborted) break;
      var errName = String(error && error.name || '');
      var errText = String(error && error.message || '');
      if (errName === 'AbortError' || errName === 'TimeoutError'
        || /abort|cancel/i.test(errText)) break;
    }
  }
  if (lastJudgeError) {
    return {ok:false,reason:'writ_meaning_shadow_unavailable'};
  }
  var completion = completionTruth(raw);
  var judged = completion.complete ? verdict(raw) : null;
  if (!judged) {
    var invalidReason = completion.complete ? 'writ_meaning_shadow_invalid_verdict' :
      'writ_meaning_shadow_incomplete_verdict';
    var attempt = await persistInvalidAttempt(exactPacket,raw,invalidReason,opts);
    if (!attempt.ok) return {ok:false,reason:attempt.reason};
    return {ok:false,reason:invalidReason,attempt:attempt};
  }
  // A valid C1 uncertainty is a formed semantic judgment, not a transport failure.
  // It therefore cannot release the answer on its own. C4 receives the same frozen
  // four-text packet once, with no hint about C1's conclusion, and may independently
  // clear or hold it. A missing, malformed, or uncertain C4 review preserves C1's hold.
  // This is one second opinion, not a retry loop and not a code-authored clearance.
  var independentReview = null;
  if (judged.decision === 'UNCERTAIN' && answeringSeat === 'c1_cellm' &&
      !(opts.signal && opts.signal.aborted)) {
    var firstUncertain = receiptVerdict(judged);
    try {
      var reviewRaw = await askSeat('c4_watch');
      var reviewCompletion = completionTruth(reviewRaw);
      var reviewJudged = reviewCompletion.complete ? verdict(reviewRaw) : null;
      if (reviewJudged) {
        independentReview = {initial_uncertain:firstUncertain,reviewer_seat:'c4_watch',
          outcome:'verdict',reviewer_verdict:receiptVerdict(reviewJudged)};
        judged = reviewJudged;
      } else {
        independentReview = {initial_uncertain:firstUncertain,reviewer_seat:'c4_watch',
          outcome:reviewCompletion.complete ? 'invalid' : 'incomplete'};
      }
    } catch (reviewError) {
      independentReview = {initial_uncertain:firstUncertain,reviewer_seat:'c4_watch',
        outcome:'unavailable'};
    }
  }
  var receipt = await persist(exactPacket,judged,opts,independentReview);
  var publicShadow = receiptVerdict(judged);
  if (!receipt.ok) return {ok:false,reason:receipt.reason,shadow:publicShadow};
  if (judged.decision !== 'AGREE') return {ok:false,
    reason:judged.decision === 'DISAGREE' ? 'writ_meaning_shadow_disagreement' :
      'writ_meaning_shadow_uncertain',
    decision:judged.decision, consequential:judged.consequential === true,
    shadow:publicShadow,receipt:receipt};
  return {ok:true,reason:'writ_meaning_shadow_agreement',
    decision:'AGREE', consequential:false, shadow:publicShadow,receipt:receipt};
}

module.exports = {SCHEMA:SCHEMA,ATTEMPT_SCHEMA:ATTEMPT_SCHEMA,TYPE:TYPE,
  ATTEMPT_TYPE:ATTEMPT_TYPE,DECISIONS:DECISIONS,judge:judge,
  _test:{stable:stable,digest:digest,parse:parse,binding:binding,packet:packet,
    verdict:verdict,completionTruth:completionTruth,opaqueTransportReceipt:opaqueTransportReceipt,
    persist:persist,persistInvalidAttempt:persistInvalidAttempt,receiptText:receiptText,
    receiptVerdict:receiptVerdict}};
