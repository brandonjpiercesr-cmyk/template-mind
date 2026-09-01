// ⬡B:core.memory.keeper:MODULE:the_memory_keeper_wonder:20260726⬡
// ⬡B:core.memory.keeper:LAW:one_memory_contract_for_every_writer_and_every_reader:20260726⬡
// entered through the ABAHAM door at the ONE common PAI exit, serving EVERY channel
//
// THE MEMORY KEEPER. The write side of memory, on every turn, on every channel.
//
// WHY THIS FILE EXISTS, and read this before you touch anything below.
// Her memory READ one string and WROTE another, for weeks, and three separate comments in
// this codebase asserted the opposite:
//   1. core/find.js findContext reads source prefix 'pai.minutes.'. The ONLY writer of that
//      prefix was routes/stream.routes.js, the browser stream. A text, a phone call, and every
//      non-stream /cara/chat turn wrote NOTHING that any wall contributor later queried.
//   2. core/find.js findStatedCommitments reads a MEMORY bead at importance >= 7 and the
//      source prefix 'memory.gifted.'. Its writer lived in core/synthesize.js and was removed
//      on 20260725 (⬡COLD:act:remove:PAI_SYNTHESIS_PROJECTION⬡) because it was a DETACHED
//      model call and a DETACHED brain write escaping the council. That removal was correct.
//      Nothing replaced it, so from that day whether she kept what a person told her was a
//      coin flip on the model electing to call write_to_brain.
//   3. core/fcw.builder.js and core/find.js both still CLAIMED, in prose, that "synthesize.js's
//      memory keeper stamps a MEMORY bead with his exact words every turn." A comment claiming
//      a wire exists is how this survived four audits. Those comments now point here.
//
// WHAT THIS IS. A wonder, not cold code wearing a wonder's name:
//   ENTRANCE  the committed turn: the person's exact words, her committed answer, the cycle
//             and request ids, and the durable council receipt source.
//   MIND      an LLM decides whether the person handed something over to KEEP, and returns
//             THEIR OWN WORDS for it. No keyword list. No regex. No importance threshold
//             standing in for judgment. (Founder law: cold code never does a mind's job.)
//   LEASH     cold code verifies the quoted words actually occur in what the person said. A
//             mind that paraphrases or invents is overruled and the full message is kept
//             instead. The keeper can never put words in a person's mouth.
//   COLD      cold code stores and stamps: the exact bead the reader already queries, with a
//             verified readback, typed edges back to the cycle receipt, and an honest receipt.
//   EXIT      a receipt with entrance, exit and notes, returned to the cycle and carried in
//             the turn bead's own content so a later trace-back can see what was kept and why.
//
// IT IS NOT DETACHED. It runs INSIDE runPAIInner, after the council receipt and STAMP
// readback, inside the cycle's own spend attribution, and it is awaited. Nothing escapes the
// cycle here: that was the whole reason the 20260725 removal happened, and re-committing the
// same sin in a new file would be worse than leaving it broken.
//
// ANYHAM: hamUid drives every read and write. No person, no world, no content hardcoded.
'use strict';

// ⬡B:core.memory.keeper:LAW:THE_MEMORY_CONTRACT:20260726⬡
// ============================ THE MEMORY CONTRACT =============================
// THIS OBJECT IS THE SINGLE POINT OF TRUTH FOR HOW MEMORY IS ADDRESSED. Every writer
// emits these exact values and every reader queries these exact values. If you change one
// number or one string here you have changed what she can remember, so change it HERE and
// nowhere else, and make core/find.js read the same constants.
//
// TURN RECORD, written on EVERY committed human-facing turn, every channel:
//   stamp_type  RESULT           <- so find.js findContext leg 2 (stamp_type RESULT,
//                                   importance >= 7) finally matches a conversation turn.
//                                   Before this, runPAI never stamped a RESULT at all and
//                                   that read was dead for conversation on every channel.
//   source      pai.minutes.<HAM>.<ms>
//                                <- the prefix findContext leg 1 has always queried. KEPT,
//                                   not renamed, so every historical MINUTES row written by
//                                   the browser stream still reads back under the same lane.
//   importance  7                <- a WEIGHT, never a verdict. It says a real turn carries
//                                   about this much weight next to a housekeeping marker.
//                                   NO READER MAY TURN IT INTO A CUTOFF. See the retired
//                                   READER_IMPORTANCE_FLOOR note below the contract.
//
// GIFT, written only when a mind rules the person handed something over to keep:
//   stamp_type  MEMORY
//   source      memory.gifted.<HAM>.<ms>
//   importance  9                <- above the turn record, because a thing a person chose to
//                                   tell her outranks the transcript it arrived in.
//
// Both readers of both lanes live in core/find.js: findContext, findRecentResults and
// findStatedCommitments. findRecentResults deliberately EXCLUDES the turn-record lane
// (source_not_prefix) so the conversation cannot crowd the advisor/agent result lane out of
// the wall. Two lanes, one contract, no collision.
// ==============================================================================
var MEMORY_CONTRACT = Object.freeze({
  TURN_STAMP_TYPE: 'RESULT',
  TURN_SOURCE_PREFIX: 'pai.minutes.',
  TURN_IMPORTANCE: 7,
  GIFT_STAMP_TYPE: 'MEMORY',
  GIFT_SOURCE_PREFIX: 'memory.gifted.',
  GIFT_IMPORTANCE: 9,
  // ⬡B:core.memory.keeper:LAW:an_abandoned_turn_is_labelled_not_hidden:20260825⬡
  // FOUNDER_ACTIONS_OUTSTANDING item 12. The turn record above is written unconditionally,
  // before core/tool.loop.js knows whether the turn it belongs to actually reached the
  // person: a cancellation or a failed post-council effect can still end the cycle after
  // this row is durably read back. abandonTurn demotes exactly that row to this importance.
  //
  // WHAT THIS VALUE MEANS NOW, and it changed on 20260825. It used to mean "hidden": the
  // demotion worked only because every reader ran an importance >= READER_IMPORTANCE_FLOOR
  // predicate, so an abandoned turn simply stopped coming back. That predicate is gone (see
  // the retired-floor note below), so this value no longer hides anything. It is an EXACT,
  // SINGLE-VALUE FACT that a presenter reads and LABELS: core/goals/keeper.js and
  // core/fcw.builder.js both check `importance === ABANDONED_IMPORTANCE` and say on the line
  // that this row is a turn record for an exchange the person never received. Hiding a thing
  // that happened is its own small forgery; saying what it is out loud is not.
  //
  // Never compare against it with < or >=. Two different facts share the low end of this
  // scale: routes/stream.routes.js stamped real, genuinely DELIVERED browser-stream turns at
  // importance 5 for weeks, and a floor comparison mislabels every one of those as abandoned.
  // Only the exact value written here means abandonment.
  ABANDONED_IMPORTANCE: 2,
  AGENT_GLOBAL: 'PAI'
});

// ⬡B:core.memory.keeper:LAW:READER_IMPORTANCE_FLOOR_is_retired_and_never_comes_back:20260825⬡
// RETIRED 20260825. `READER_IMPORTANCE_FLOOR: 7` used to live in the frozen contract above and
// every memory reader in the estate turned it into a PostgREST predicate, `importance=gte.7`.
// That is not a sort and it is not a bound on what a process can hold. It is a hard filter: the
// rows never came back, no count of what was withheld came back either, and no mind at any layer
// was ever told a row existed.
//
// It had to go because a cold hand was on both ends of it. TURN_IMPORTANCE, GIFT_IMPORTANCE and
// ABANDONED_IMPORTANCE are all coder-typed constants, so cold code assigned the weight AND cold
// code converted that weight into a verdict on what she is allowed to know exists. Even the one
// path where a mind picks its own number (core/tool.loop.js write_to_brain) proved the defect
// rather than escaping it: a mind that deliberately wrote something at 5, meaning "modest, but
// real, keep it", had that row silently deleted from every future read of its own memory. The
// mind expressed a WEIGHT. The floor converted it into a VISIBILITY VERDICT nobody issued.
//
// The live harm is on the record and is not theoretical: routes/stream.routes.js stamped every
// genuinely DELIVERED browser-stream turn at importance 5 for weeks. Those turns really happened,
// really reached the person, are still in the bank, and `importance=gte.7` meant she could not
// see a single one of them.
//
// The identical defect on the identical column was already ruled on once in this estate and
// already cured six lines away: core/find.js#doctrineWallFloor, whose own comment states the line
// this retirement follows. "A bound on what a process can hold is a fact; a ruling on what is
// worth seeing is a judgment." The byte budget stays (core/agent.find.js#runtimeContextBudgets
// still binds the wall and still REPORTS every row it omits). The relevance verdict goes.
//
// DO NOT REINTRODUCE IT, and do not reintroduce it wearing a smaller number or an env var with a
// default. Lowering the floor to 5, or to 3, or making it configurable, is the same hand on the
// same pen picking a fourth number. Importance is still doing real work where a weight belongs:
// core/agent.find.js#candidateFacts folds it into the ranking score additively, never as a
// cutoff, so ordering by importance is fine and excluding by importance is not.
//
// WHAT REPLACED IT. The read-back fence, which is the thing that makes the removal safe: every
// presenter that feeds stored rows into a mind's prompt carries, per line, the writer that
// stamped the row and the weight that writer chose, and tells the reading mind plainly that a
// writer name is the MODULE that stamped the row and never proof of who authored the words, that
// importance is a weight a writer chose and never a ruling on whether the row matters, and that
// SHE judges which is which. Carry, never classify: no whitelist of trusted writers, no sorting
// rows into hers and not-hers, no row filtered out, no cap on her read.

// ⬡B:core.memory.keeper:WIRE:bank_derived_from_the_selected_bank_never_a_dead_literal:20260726⬡
// The proven-correct shape (core/brain.client.js): table and schema derive from the SAME
// signal as the URL, so an inherited world that sets only MEMORY_BANK_URL/KEY writes into its
// OWN bank instead of silently losing every bead to a retired table it does not have.
function _bu() { return process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL; }
function _bk() { return process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY; }
function _memorySelected() { return !!(process.env.MEMORY_BANK_URL || process.env.MEMORY_BANK_KEY); }
function _tbl() { return process.env.BEAD_TABLE || (_memorySelected() ? 'beads' : 'aibe_brain'); }
function _schema() { return process.env.BRAIN_SCHEMA || (_memorySelected() ? 'memory_bank' : 'abacia_core'); }

function ymd(at) { return new Date(at || Date.now()).toISOString().slice(0, 10).replace(/-/g, ''); }

// Four-colon stamp, the only format core/decoder.js and core/wonder.gate.js accept.
function aclStamp(type, descriptor, at) {
  return '⬡B:core.memory.keeper:' + String(type).toUpperCase() + ':'
    + String(descriptor).replace(/[^a-z0-9_.]/gi, '_') + ':' + ymd(at) + '⬡';
}

function writeHeaders(representation) {
  var key = _bk();
  return { apikey: key, Authorization: 'Bearer ' + key,
    'Accept-Profile': _schema(), 'Content-Profile': _schema(),
    'Content-Type': 'application/json',
    Prefer: representation ? 'return=representation' : 'return=minimal' };
}

function memoryIoTimeoutMs() {
  var raw = Number(process.env.MEMORY_KEEPER_IO_TIMEOUT_MS || 5000);
  if (!Number.isFinite(raw)) return 5000;
  return Math.max(100, Math.min(15000, Math.floor(raw)));
}

// Every network operation gets its OWN deadline. Reusing the POST timeout signal for the
// independent GET readback can hand GET a signal whose clock already expired while the write
// body was being parsed. A fresh composite preserves a caller cancellation while starting a
// new bounded I/O window for this exact request.
function freshRequestSignal(parentSignal) {
  var localDeadline = AbortSignal.timeout(memoryIoTimeoutMs());
  if (!parentSignal) return localDeadline;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parentSignal, localDeadline]);
  }
  var controller = new AbortController();
  function carry(source) {
    if (!controller.signal.aborted) controller.abort(source.reason);
  }
  if (parentSignal.aborted) carry(parentSignal);
  else parentSignal.addEventListener('abort', function () { carry(parentSignal); }, { once:true });
  if (localDeadline.aborted) carry(localDeadline);
  else localDeadline.addEventListener('abort', function () { carry(localDeadline); }, { once:true });
  return controller.signal;
}

function canonicalField(value) {
  var parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch (e) { return value; }
  }
  function sort(input) {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== 'object') return input;
    var out = {};
    Object.keys(input).sort().forEach(function (key) { out[key] = sort(input[key]); });
    return out;
  }
  try { return JSON.stringify(sort(parsed)); } catch (e) { return String(value); }
}

function sameStoredBead(row, expected) {
  if (!row || !expected) return false;
  if (String(row.ham_uid || '').toUpperCase() !== String(expected.ham_uid || '').toUpperCase()) return false;
  if (String(row.source || '') !== String(expected.source || '')) return false;
  if (String(row.stamp_type || '') !== String(expected.stamp_type || '')) return false;
  if (String(row.acl_stamp || '') !== String(expected.acl_stamp || '')) return false;
  if (String(row.agent_global || '') !== String(expected.agent_global || '')) return false;
  if (String(row.summary || '') !== String(expected.summary || '')) return false;
  if (Number(row.importance) !== Number(expected.importance)) return false;
  if (canonicalField(row.content) !== canonicalField(expected.content)) return false;
  if (expected.spawned_by !== undefined && String(row.spawned_by || '') !== String(expected.spawned_by)) return false;
  if (expected.edges !== undefined && canonicalField(row.edges) !== canonicalField(expected.edges)) return false;
  if (expected.acl_tier !== undefined && Number(row.acl_tier) !== Number(expected.acl_tier)) return false;
  return true;
}

// Cold store. One POST, then one independent exact GET of the source we asked for. A write that
// cannot prove itself from storage is reported ok:false, never assumed. If the bank has no edges column
// the row is retried once without edges rather than losing the memory over a schema detail.
async function storeBead(bead, signal) {
  if (!_bu() || !_bk()) return { ok: false, reason: 'memory_bank_unconfigured' };
  // ⬡B:core.memory.keeper:FIX:spawned_by_required_on_the_new_bank_20260727⬡
  // core/brain.client.js:171 sets this on every write that is not the legacy aibe_brain
  // table, because the new bank's beads table requires it. This is the one write path every
  // committed turn and gift goes through (keepTurn -> store -> storeBead), so on any world
  // where _tbl() resolves to 'beads' (including the founder's own, since both legacy and new
  // env vars are configured there) every turn and gift write was failing this column and
  // storeBead was correctly returning memory_write_unverified on every single call. Found by
  // the same class of review that caught it in routes/omi.routes.js.
  if (_tbl() !== 'aibe_brain' && bead.spawned_by === undefined) {
    bead.spawned_by = (bead.source && String(bead.source).split('.')[0]) || 'memory.keeper';
  }
  // Privacy authority is embedded in content by the deciding Wonder. This cold boundary only
  // mirrors a valid T0..T4 value into the structural column. Raw acl_tier input without a valid
  // envelope is discarded so null, blank, or boolean values cannot become founder T0 through
  // JavaScript numeric coercion.
  try {
    var privacyContent = bead.content;
    if (typeof privacyContent === 'string') privacyContent = JSON.parse(privacyContent);
    var privacyTier = require('./privacy/people.tier.js')
      .parseTier(privacyContent && privacyContent.privacy && privacyContent.privacy.tier);
    if (privacyTier != null) bead.acl_tier = privacyTier;
    else if (bead.acl_tier !== undefined) delete bead.acl_tier;
  } catch (privacyError) {
    if (bead.acl_tier !== undefined) delete bead.acl_tier;
  }
  var requestStage = 'write';
  async function post(body) {
    requestStage = 'write';
    var response = await fetch(_bu() + '/rest/v1/' + _tbl(), { method: 'POST',
      headers: writeHeaders(true), body: JSON.stringify(body),
      signal:freshRequestSignal(signal || null) });
    var rows = response.ok ? await response.json().catch(function () { return null; }) : null;
    return { response: response, rows: rows, body: body };
  }
  try {
    var attempt = await post(bead);
    if (!attempt.response.ok && bead.edges) {
      var withoutEdges = Object.assign({}, bead);
      delete withoutEdges.edges;
      attempt = await post(withoutEdges);
      if (attempt.response.ok) attempt.edges_dropped = true;
    }
    if (!attempt.response.ok || !Array.isArray(attempt.rows) || attempt.rows.length !== 1
        || !sameStoredBead(attempt.rows[0], attempt.body)) {
      return { ok: false, reason: 'memory_write_unverified',
        status: attempt.response && attempt.response.status || null };
    }
    // ⬡B:core.memory.keeper:GUARD:representation_is_not_a_durable_readback:20260730⬡
    // PostgREST's returned representation proves only what the write response said. Read the row
    // again by exact HAM and source, require uniqueness, and compare the fields future FIND reads.
    requestStage = 'readback';
    var readResponse = await fetch(_bu() + '/rest/v1/' + _tbl()
      + '?ham_uid=eq.' + encodeURIComponent(attempt.body.ham_uid)
      + '&source=eq.' + encodeURIComponent(attempt.body.source) + '&limit=2',
    { headers:writeHeaders(false), signal:freshRequestSignal(signal || null) });
    var readRows = readResponse.ok
      ? await readResponse.json().catch(function () { return null; }) : null;
    if (!readResponse.ok || !Array.isArray(readRows) || readRows.length !== 1
        || !sameStoredBead(readRows[0], attempt.body)) {
      return { ok:false, reason:'memory_readback_unverified',
        status:readResponse && readResponse.status || null };
    }
    return { ok: true, id: attempt.rows[0].id, source: bead.source,
      stamp_type: bead.stamp_type, importance: bead.importance,
      edges_dropped: !!attempt.edges_dropped, readback_verified:true };
  } catch (error) {
    var timeout = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, reason: timeout
        ? (requestStage === 'readback' ? 'memory_readback_timeout' : 'memory_write_timeout')
        : (requestStage === 'readback' ? 'memory_readback_threw' : 'memory_write_threw'),
      error: String(error && error.message || error || 'unknown').slice(0, 160) };
  }
}

function normalizeForLeash(text) {
  return String(text || '').toLowerCase().replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

function parseMindJson(content) {
  try {
    var value = JSON.parse(content);
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : null;
  } catch (error) { return null; }
}

// ⬡B:core.memory.keeper:MIND:an_llm_decides_what_is_worth_keeping_not_a_keyword_list:20260726⬡
// The judgment, and the ONLY judgment in this file. It reads what the person actually said and
// rules whether they handed something over to keep. It may quote them; it may not speak for
// them, invent a fact, or decide anything about reaching a human. Its verdict is a ruling on
// the person's own words and nothing else, and cold code files it.
var KEEPER_SYSTEM = 'You are the MEMORY KEEPER of a person\'s own assistant. You are shown one '
  + 'thing the person just said to her, and the answer she gave. Rule on ONE question: did this '
  + 'person hand her something to KEEP? A plan, a decision, a commitment, a name or rename, a '
  + 'fact about their life or work, a preference, a person they mentioned, a moment they wanted '
  + 'held, or an explicit instruction to remember. A question, a lookup request, a greeting, an '
  + 'acknowledgement, a correction of her wording, or small talk is NOT a gift. Err toward '
  + 'keeping when they stated something about their own life as a fact or a plan: the cost of '
  + 'keeping too much is noise, the cost of keeping too little is that she loses what they told '
  + 'her. When you keep, quote THEIR OWN WORDS: copy the exact span from their message '
  + 'verbatim, character for character, never your paraphrase of it. Reply ONLY JSON: '
  + '{"keep":true|false,"their_words":"the exact verbatim span from their message, or empty '
  + 'when keep is false","gist":"one short line naming what is being kept, in their voice",'
  + '"why":"one short line on why this is or is not a gift"}';

async function decideGift(question, answer, deliberate, signal) {
  var started = Date.now();
  var out = null;
  try {
    out = await deliberate(KEEPER_SYSTEM,
      'THEY SAID:\n' + String(question || '').slice(0, 6000)
        + '\n\nSHE ANSWERED:\n' + String(answer || '').slice(0, 2000),
      { json: true, max_tokens: 400, temperature: 0, timeout: 9000, tightTimeout: true,
        signal: signal || undefined });
  } catch (error) { out = null; }
  if (!out || !out.content) {
    // Mind down. FAIL CLOSED on the gift: cold code does not get to decide what a person
    // meant to give her. Nothing is lost from the wall, because the turn record below is
    // written unconditionally and carries their full message verbatim.
    return { ok: false, reason: 'keeper_mind_unavailable', ms: Date.now() - started };
  }
  var ruled = parseMindJson(out.content);
  if (!ruled) return { ok: false, reason: 'keeper_verdict_unparsable', model: out.model,
    via: out.via, ms: Date.now() - started };
  return { ok: true, keep: ruled.keep === true,
    their_words: String(ruled.their_words == null ? '' : ruled.their_words),
    gist: String(ruled.gist == null ? '' : ruled.gist).slice(0, 240),
    why: String(ruled.why == null ? '' : ruled.why).slice(0, 240),
    model: out.model, via: out.via, ms: Date.now() - started };
}

// ⬡B:core.memory.keeper:LEASH:she_can_only_keep_words_they_actually_said:20260726⬡
// The mind proposes a span; cold code proves it. A quote that does not occur in what the
// person actually said is overruled and the whole message is kept instead, so the bead can
// never carry a sentence this person never uttered. A made-up memory is a lie.
function leashToTheirWords(proposed, actualMessage) {
  var message = String(actualMessage || '');
  var quote = String(proposed || '').trim();
  if (quote && normalizeForLeash(message).indexOf(normalizeForLeash(quote)) >= 0) {
    return { words: quote, leash: 'verbatim' };
  }
  return { words: message, leash: quote ? 'overruled_quote_not_in_message' : 'no_quote_offered' };
}

function turnSummary(channel, question, answer) {
  return ('[TURN ' + (channel || 'na') + '] THEY SAID: ' + String(question || '').slice(0, 420)
    + ' || SHE ANSWERED: ' + String(answer || '').slice(0, 420)).replace(/\s+/g, ' ').trim();
}

// ⬡B:core.memory.keeper:WIRE:the_cycle_receipt_finally_gets_read_by_something:20260726⬡
// CYCLE_RECEIPT has been written at importance 10 with typed edges on every committed turn
// and nothing outside delivery replay ever read it. It is NOT put on her recall wall: its
// summary is '[PAI OUTBOUND PREPARED] cycle X, request Y', pure machinery, and pouring that
// into RECENT CONTEXT is the exact ventilation-stamp defect core/find.js:308 already fixed
// once. It earns its place here instead, as the lineage anchor: every memory bead this keeper
// writes points back at the durable receipt that proves the turn really committed, so a
// trace-back can walk from a remembered fact to the exact cycle that heard it.
function turnEdges(receiptSource, cycleId, requestId) {
  var edges = [{ type: 'PRODUCED_BY', target: 'core.memory.keeper' }];
  if (receiptSource) edges.push({ type: 'CAUSED_BY', target: receiptSource });
  if (cycleId) edges.push({ type: 'RELATES_TO', target: 'pai.cycle.' + cycleId });
  if (requestId) edges.push({ type: 'RELATES_TO', target: 'pai.request.' + requestId });
  return edges;
}

// ============================== THE WONDER ====================================
// keepTurn(entrance) -> receipt. Called once, at the ONE common exit of the PAI cycle
// (core/tool.loop.js runPAIInner), for every channel: text, voice, portal, stream, api.
// It NEVER throws and it NEVER changes the answer. A keeper that cannot write says so.
async function keepTurn(entrance) {
  var started = Date.now();
  var input = entrance || {};
  var hamUid = String(input.hamUid || '').trim().toUpperCase();
  var question = String(input.question || '');
  var answer = String(input.answer || '');
  var channel = String(input.channel || '') || null;
  var deliberate = input.deliberate || require('./model.ladder.js').deliberate;
  var store = input.store || storeBead;
  var signal = input.abortSignal || null;
  var privacyTiers = require('./privacy/people.tier.js');
  var parsedViewerTier = privacyTiers.parseTier(input.viewerTier);
  var memoryTier = parsedViewerTier != null ? parsedViewerTier : privacyTiers.STRICTEST;
  var memoryPrivacy = privacyTiers.buildEnvelope(privacyTiers.MARKS.UNCLASSIFIED,
    memoryTier, 'exact-HAM conversation memory follows the reader\'s proven people tier',
    'memory_keeper');

  var receipt = {
    schema: 'anew.memory.keeper.receipt.v1',
    ham_uid: hamUid, channel: channel, viewer_tier: memoryTier,
    cycle_id: input.cycleId || null, request_id: input.requestId || null,
    entrance: { question_bytes: Buffer.byteLength(question, 'utf8'),
      answer_bytes: Buffer.byteLength(answer, 'utf8'),
      receipt_source: input.receiptSource || null },
    turn_record: null, gift: null, mind: null, notes: '', ms: 0
  };
  if (!hamUid || !question.trim() || !answer.trim()) {
    receipt.ok = false; receipt.reason = 'memory_keeper_input_invalid';
    receipt.notes = 'nothing was kept: the keeper was handed an incomplete turn';
    receipt.ms = Date.now() - started;
    return receipt;
  }
  if (!_bu() || !_bk()) {
    receipt.ok = false; receipt.reason = 'memory_bank_unconfigured';
    receipt.notes = 'nothing was kept: this world has no memory bank configured, so this '
      + 'turn is genuinely unrecorded. That is an unavailable bank, not an empty person.';
    receipt.ms = Date.now() - started;
    return receipt;
  }

  var at = Date.now();
  var edges = turnEdges(input.receiptSource, input.cycleId, input.requestId);

  // 1. THE TURN RECORD. Unconditional, cold, no judgment: what was said and what she
  //    answered, in full, in the one lane every wall reader queries. This is the leg that
  //    was missing on SMS, on voice, and on every non-stream /cara/chat turn.
  var turnBead = {
    ham_uid: hamUid,
    agent_global: MEMORY_CONTRACT.AGENT_GLOBAL,
    stamp_type: MEMORY_CONTRACT.TURN_STAMP_TYPE,
    source: MEMORY_CONTRACT.TURN_SOURCE_PREFIX + hamUid + '.' + at,
    acl_stamp: aclStamp('RESULT', 'turn_kept', at),
    summary: turnSummary(channel, question, answer),
    content: JSON.stringify({
      schema: 'anew.memory.turn.v1',
      entrance: { channel: channel, their_words: question,
        cycle_id: input.cycleId || null, request_id: input.requestId || null,
        receipt_source: input.receiptSource || null },
      exit: { her_answer: answer, tools_used: Array.isArray(input.toolsUsed) ? input.toolsUsed : [],
        ms: input.turnMs || null },
      note: 'The conversation record for this turn, written by the memory keeper at the one '
        + 'common PAI exit so every channel lands in the same lane. If she ever fails to '
        + 'remember this exchange, start here and check whether this row reached the wall.',
      kept_at: new Date(at).toISOString(),
      privacy: memoryPrivacy
    }),
    edges: edges,
    importance: MEMORY_CONTRACT.TURN_IMPORTANCE
  };
  receipt.turn_record = await store(turnBead, signal);

  // The turn record is the required durable leg. If its independent readback did not prove the
  // exact row, this cycle will be held by tool.loop and there is no authorized reason to buy a
  // second model decision about an optional gift. Stop here before decideGift, with the failed
  // storage receipt intact and an explicit no-spend disposition.
  if (!receipt.turn_record || receipt.turn_record.ok !== true ||
      receipt.turn_record.readback_verified !== true) {
    receipt.ok = false;
    receipt.reason = String(receipt.turn_record && receipt.turn_record.reason
      || 'memory_turn_record_unverified');
    receipt.mind = { ok:false, skipped:true, reason:'turn_record_unverified',
      model:null, via:null, ms:0, why:null };
    receipt.gift = { kept:false, skipped:true, reason:'turn_record_unverified' };
    receipt.notes = 'the required turn record was NOT durably read back, so the optional '
      + 'keeper judgment did not run and no model spend was incurred';
    receipt.ms = Date.now() - started;
    return receipt;
  }

  // 2. THE GIFT. The mind rules; cold code leashes and files.
  var verdict = await decideGift(question, answer, deliberate, signal);
  receipt.mind = { ok: verdict.ok, reason: verdict.reason || null, model: verdict.model || null,
    via: verdict.via || null, ms: verdict.ms || 0, why: verdict.why || null };
  if (!verdict.ok) {
    receipt.gift = { kept: false, reason: verdict.reason };
    receipt.ok = !!(receipt.turn_record && receipt.turn_record.ok);
    receipt.notes = 'the turn record was ' + (receipt.ok ? 'kept' : 'NOT kept')
      + '; the keeper mind was unavailable on this turn (' + verdict.reason + '), so no gift '
      + 'was ruled on. Their full words are still on the turn record above.';
    receipt.ms = Date.now() - started;
    return receipt;
  }
  if (!verdict.keep) {
    receipt.gift = { kept: false, reason: 'not_a_gift', why: verdict.why || null };
    receipt.ok = !!(receipt.turn_record && receipt.turn_record.ok);
    receipt.notes = 'the turn record was ' + (receipt.ok ? 'kept' : 'NOT kept')
      + '; the keeper ruled this turn was not a gift: ' + (verdict.why || 'no reason given');
    receipt.ms = Date.now() - started;
    return receipt;
  }

  var leashed = leashToTheirWords(verdict.their_words, question);
  var giftAt = at + 1;
  var giftBead = {
    ham_uid: hamUid,
    agent_global: MEMORY_CONTRACT.AGENT_GLOBAL,
    stamp_type: MEMORY_CONTRACT.GIFT_STAMP_TYPE,
    source: MEMORY_CONTRACT.GIFT_SOURCE_PREFIX + hamUid + '.' + giftAt,
    acl_stamp: aclStamp('MEMORY', 'gifted', giftAt),
    summary: ('[MEMORY, given to me] ' + (verdict.gist || leashed.words)).replace(/\s+/g, ' ')
      .trim().slice(0, 600),
    content: JSON.stringify({
      schema: 'anew.memory.gift.v1',
      // their_words is the field core/fcw.builder.js renders into WHAT THEY TOLD YOU.
      their_words: leashed.words,
      gist: verdict.gist || '',
      my_confirmation: answer,
      channel: channel,
      kept_at: new Date(giftAt).toISOString(),
      entrance: { cycle_id: input.cycleId || null, request_id: input.requestId || null,
        receipt_source: input.receiptSource || null },
      exit: { ruled_by: verdict.model || 'keeper_mind', via: verdict.via || null,
        leash: leashed.leash },
      note: 'A person handed this over. The keeper mind ruled it a gift because: '
        + (verdict.why || 'no reason given') + '. The words above are '
        + (leashed.leash === 'verbatim' ? 'their exact verbatim span'
          : 'their entire message, because the proposed quote could not be proved against it')
        + '.',
      privacy: memoryPrivacy
    }),
    edges: edges,
    importance: MEMORY_CONTRACT.GIFT_IMPORTANCE
  };
  var stored = await store(giftBead, signal);
  receipt.gift = { kept: stored.ok === true, reason: stored.ok ? null : stored.reason,
    id: stored.id || null, source: giftBead.source,
    stamp_type: giftBead.stamp_type, importance: giftBead.importance,
    leash: leashed.leash, gist: verdict.gist || '' };
  receipt.ok = !!(receipt.turn_record && receipt.turn_record.ok) && stored.ok === true;
  receipt.notes = 'turn record ' + ((receipt.turn_record && receipt.turn_record.ok) ? 'kept' : 'NOT kept')
    + '; gift ' + (stored.ok ? 'kept' : 'NOT kept') + ' at importance '
    + MEMORY_CONTRACT.GIFT_IMPORTANCE + ' (' + leashed.leash + ')';
  receipt.ms = Date.now() - started;
  return receipt;
}

// ⬡B:core.memory.keeper:FIX:an_abandoned_turn_must_not_read_back_as_kept:20260803⬡
// FOUNDER_ACTIONS_OUTSTANDING item 12: "the memory keeper can persist a turn that was
// cancelled or whose effect failed." keepTurn's own turn record write above is unconditional
// and already durable by the time core/tool.loop.js can even ask this question, so the
// honest fix is not pretending the row was never written. abandonTurn is called from
// tool.loop.js's own cancellation and post-council-effect-failure exits, the ones that run
// AFTER keepTurn already started. It demotes the exact row this turn wrote to
// MEMORY_CONTRACT.ABANDONED_IMPORTANCE, which is the one exact value that means "this turn
// never reached the person." As of 20260825 that row is no longer EXCLUDED from any read:
// the presenters carry it and say on the line what it is, and the reading mind decides what
// an abandoned exchange is worth. It never throws and it never touches a row this turn did
// not itself durably write.
async function abandonTurn(turnRecord, outcome, signal) {
  if (!turnRecord || turnRecord.ok !== true || !turnRecord.id || !turnRecord.source) {
    return { ok: false, reason: 'nothing_to_abandon' };
  }
  if (!_bu() || !_bk()) return { ok: false, reason: 'memory_bank_unconfigured' };
  try {
    var response = await fetch(_bu() + '/rest/v1/' + _tbl()
        + '?id=eq.' + encodeURIComponent(turnRecord.id),
      { method: 'PATCH', headers: writeHeaders(true),
        body: JSON.stringify({ importance: MEMORY_CONTRACT.ABANDONED_IMPORTANCE }),
        signal: freshRequestSignal(signal || null) });
    var rows = response.ok ? await response.json().catch(function () { return null; }) : null;
    if (!response.ok || !Array.isArray(rows) || rows.length !== 1) {
      return { ok: false, reason: 'memory_abandon_unverified',
        status: response && response.status || null };
    }
    return { ok: true, id: turnRecord.id, source: turnRecord.source,
      outcome: String(outcome || 'abandoned').slice(0, 60),
      importance: MEMORY_CONTRACT.ABANDONED_IMPORTANCE };
  } catch (error) {
    return { ok: false, reason: 'memory_abandon_threw',
      error: String(error && error.message || error || 'unknown').slice(0, 160) };
  }
}

module.exports = {
  MEMORY_CONTRACT: MEMORY_CONTRACT,
  keepTurn: keepTurn,
  abandonTurn: abandonTurn,
  // ⬡B:core.memory.keeper:BUILD:the_one_cold_store_is_not_a_test_only_name:20260728⬡
  // storeBead is the ONE verified cold write in this estate (one POST, one readback of the
  // exact source asked for, plus the 20260727 spawned_by fix the new bank requires). It was
  // reachable only through the _test bag, so core/world.birth.js would have had to either
  // reach into a test-only name or hand-maintain a SECOND writer, and a twinned writer would
  // have rediscovered that spawned_by defect live in front of a room. Promoted to a real
  // export, purely additive: the _test entry stays exactly as it was so every existing caller
  // keeps working. Supersede, never delete; one source, never two hand-maintained copies.
  storeBead: storeBead,
  _test: { storeBead: storeBead, sameStoredBead:sameStoredBead,
    freshRequestSignal:freshRequestSignal, memoryIoTimeoutMs:memoryIoTimeoutMs,
    decideGift: decideGift, leashToTheirWords: leashToTheirWords,
    turnSummary: turnSummary, turnEdges: turnEdges, aclStamp: aclStamp, KEEPER_SYSTEM: KEEPER_SYSTEM }
};
