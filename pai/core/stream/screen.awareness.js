// ⬡B:core.stream.screen_awareness:MODULE:she_knows_the_glass_exists:20260709⬡
// entered via the ABAHAM door, serving channel MESSAGES (her own words move the founder's screen)
// THE DISCONNECT, killed on the screen. Founder 20260709: "she can do backgrounds,
// she can skywrite, she can do all these commands, but she's never doing it because
// she really doesn't know. Nothing's forcing her." Correct: a capability that is not
// in her context does not exist for her. This module closes both halves:
//   KNOW  — promptAddendum(hamUid): when this HAM has a LIVE screen right now, a
//           compact capabilities block joins the system prompt: the canonical
//           background names (from the shared identity list, never invented), the
//           layout presets, skywriting, the voice surface, and the exact syntax
//           to use them. No live screen = empty string = zero prompt cost, and
//           she is never taught to speak to a screen that is not there.
//   ACT   — applyScreenBlock(hamUid, answer): her answer may end with one
//           [[SCREEN {json} ]] block. It is extracted, validated hard, converted
//           to real directives, and pushed to her live sessions through the same
//           gate stack as everything else. The spoken/text answer returned to the
//           channel is the answer WITHOUT the block, so voice and text stay human.
//           A malformed block is dropped in silence: the answer still flows,
//           the screen simply does not move. Silence over garbage, always.
// This is exactly the founder's Jarvis combination: she speaks back, and what she
// knows is what changes the screen, while the ambient cycle keeps its own path.
'use strict';

const registry = require('./session.registry');
const vocab = require('../directive/vocabulary');
const agui = require('./agui'); // ⬡B AG-UI standard event layer (doctrine 798)
function BU_PUBLIC() { return process.env.SELF_BASE_URL || 'https://aibebase.onrender.com'; }
const reflex = require('./reflex');
const consumer = require('../reach/screen.consumer');

// The canonical identity backgrounds. Mirrors the shared repo list
// (aba-shared/packages/ccwa-core/src/backgrounds.js) by id; the frontend resolves
// ids to its own canonical URLs, so no URL and no invention lives here.
const BACKGROUND_IDS = ['black-landscape','nebula','storm-clouds','glass-windows','motion','mountain-snow','particle-lights','wet-city','beach','embers','pink-smoke','unity','three-goats'];

function hasLiveScreen(hamUid) {
  return consumer.hasLiveSession(hamUid);
}

function promptAddendum(hamUid, uiPortal) {
  if (!hasLiveScreen(hamUid)) return '';
  const presets = Object.keys(reflex.PRESETS).join(', ');
  const isCoding = uiPortal === 'ccwa';
  const flavor = isCoding
    ? 'This is the CODING portal. What you surface here should be coding and build relevant: '
      + 'recent decisions, build status, audit findings, queue depth, things from her own record with stamp_type '
      + 'RESULT, EXIT_DECISION, MILESTONE, RESPEC. Keep cards technical and short.'
    : 'This is a life portal. You may surface richer, more personal cards: sports, articles, and news the '
      + 'person actually cares about, drawn ONLY from things you genuinely know about them (stamped preferences, '
      + 'prior conversation) -- never invent an interest you have not actually seen. An image card needs a real '
      + 'url you actually have; never fabricate one. If you do not have a real image url, use a text card instead.';
  return '\n\nLIVE SCREEN: the person is looking at your glass right now, and you control it. ' + flavor + '\n'
    + 'When they ask you to change something on the screen, call the update_screen tool -- do not ask "how about X, '
    + 'let me know" or describe the change in words and wait; call the tool and it happens immediately. If it tells '
    + 'you something was rejected (an invalid background id, for example), fix it and call the tool again in the '
    + 'same turn. background must be a real id from: ' + BACKGROUND_IDS.join(', ') + '. preset must be one of: '
    + presets + '. Never invent a background name that is not on that real list. '
    + 'Cards need real content you actually have -- never a placeholder or invented photo url; omit cards entirely '
    + 'rather than send something fake. An email draft goes in the card email field (to, subject, body), a chart of '
    + 'real numbers goes in the card chart field (title, series of label+value); a draft or chart placed in plain '
    + 'items or text will not render as one. For a chart of build or deploy data, call get_recent_builds FIRST and '
    + 'chart the real counts. HARD HONESTY RULE: never tell the person something is on their screen unless the '
    + 'update_screen tool returned Screen updated in THIS turn; describing a screen change in words without the '
    + 'tool call is a failure, not a substitute. LAYOUTS AND PIECES: when they name real pieces or a real layout '
    + 'clearly, ACT -- to save, call save_layout with the pieces they named; to change a saved one, call edit_layout '
    + 'with the add/remove they named; to show pieces, call update_screen with the piece or pieces. Do not ask '
    + '"which pieces?" or "should I save it?" when they already told you; only ask if their words are genuinely '
    + 'ambiguous. CRITICAL: after you edit or save a layout, DISPLAY it in the same turn (call update_screen with '
    + 'that layout) so they SEE the result, and confirm in ONE short past-tense sentence (Done, your day one now '
    + 'shows calendar, today, and reminders). NEVER narrate future intent (I will, I am ready to, let me know and '
    + 'I will) -- that is the failure they hate; act, show, confirm in past tense. If they ask did you do it, do '
    + 'not re-explain -- re-run the action and show it. The word reminders as a piece means their reminders list, '
    + 'not something you must fill; never ask what reminders to put in. Speak in plain natural words; never mention the '
    + 'tool, the schema, or the mechanics of how the screen updates.';
}

// Extract [[SCREEN {...} ]] from anywhere in an answer. Returns { answer, block|null }.
function extract(answer) {
  const text = String(answer || '');
  // \u2b21B:core.stream.screen_awareness:FIX:leak_confirmed_live_20260709\u2b21 founder-caught,
  // real receipt: her raw [[SCREEN {...}]] text rendered visibly on the founder's screen.
  // Root cause: the old regex anchored the block to the literal end of the string ($),
  // so any natural closing line after it ("Let me know if you'd like more changes!") --
  // completely ordinary conversational behavior -- broke the match, and the entire raw
  // block leaked through untouched. Fixed to find the block ANYWHERE and splice it out,
  // regardless of what comes before or after it.
  const m = text.match(/\[\[\s*SCREEN\s*(\{[\s\S]*?\})\s*\]\]/);
  if (!m) return { answer: text, block: null };
  let block = null;
  try { block = JSON.parse(m[1]); } catch (e) { block = null; }
  const cleaned = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  return { answer: cleaned, block: block };
}

// A value that still contains unfilled placeholder syntax (<...>) means the model
// echoed the prompt's template instead of filling it in. Never let that reach the glass.
function isRealValue(v) {
  return typeof v === 'string' && v.trim().length > 0 && !/[<>]/.test(v);
}

// Convert a validated block into directives and push to every live session of the HAM.
async function push(hamUid, block) { // ⬡B async: pulls real live pieces before rendering
  if (!block || typeof block !== 'object') return { pushed: 0, applied: [] };
  const applied = [];
  const toHam = function (dir) { return registry.pushToHam(hamUid, 'directive', dir); };
  let pushed = 0;
  const send = function (dir) {
    const r = consumer.gatedPush(hamUid, toHam, dir, 'pai_screen_block');
    if (r.ok) pushed++;
    return r;
  };

  if (isRealValue(block.background) && BACKGROUND_IDS.indexOf(block.background) !== -1) {
    send(vocab.updateComponents('__ambience__', [{ type: 'background', name: block.background }]));
    applied.push('background');
  }
  if (isRealValue(block.preset) && reflex.PRESETS[block.preset]) {
    send(reflex.layoutDirective(reflex.PRESETS[block.preset]));
    applied.push('preset');
  }
  if (isRealValue(block.skywrite)) {
    send(vocab.updateComponents('__ambience__', [{ type: 'skywrite', text: block.skywrite.trim().slice(0, 140) }]));
    applied.push('skywrite');
  }
  if (block.voice === true) {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (agentId) {
      send(vocab.createSurface('vara_session', { region: 'center', title: 'VARA' }));
      send(vocab.updateComponents('vara_session', [{ type: 'vara_embed', agentId: agentId, llmPath: '/vara/llm' }]));
    }
  }
  if (Array.isArray(block.cards)) {
    var _cardsList = block.cards.slice(0, 4);
    for (var _ci = 0; _ci < _cardsList.length; _ci++) {
      var card = _cardsList[_ci], idx = _ci;
      if (!card || typeof card !== 'object') continue;
      const title = isRealValue(card.title) ? String(card.title).slice(0, 60) : 'A\u2019NU';
      const region = ['left', 'center', 'right'].indexOf(card.region) !== -1 ? card.region : 'right';
      const sid = 'anu_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + idx;
      const comps = [];
      var piecePromises = [];
      // \u2b21B:core.stream.screen_awareness:BUILD:cinematic_cards_1b_20260710\u2b21 1B shapes.
      // email_draft: her real drafted words render and TYPE themselves on the glass;
      // this lane renders only, it can never send (draft is not send, the standing law).
      if (card.email && typeof card.email === 'object') {
        var em = card.email;
        if (isRealValue(em.body) || isRealValue(em.subject)) {
          comps.push({ type: 'email_draft',
            to: isRealValue(em.to) ? String(em.to).slice(0, 120) : '',
            subject: isRealValue(em.subject) ? String(em.subject).slice(0, 160) : '',
            body: isRealValue(em.body) ? String(em.body).slice(0, 4000) : '' });
        }
      }
      // chart: real finite numbers only; a series item that is not a number is dropped,
      // and a chart with nothing real left does not render at all. Fewer bars beat fake bars.
      // \u2b21B:core.stream.screen_awareness:BUILD:app_window_surfacing_20260711\u2b21
      // THE JARVIS LEAP the founder asked to SEE: she can open a real app of his
      // world as a live window on the glass. STRICT allowlist of portals that
      // actually exist (UNIVERSALITY law: no invented apps); anything else is
      // silently dropped. The window is the real deployed app, not a mock.
      // \u2b21B:core.stream.screen_awareness:BUILD:she_places_her_own_face_20260711\u2b21
      // Founder hates the fixed box: the face window is now movable by BOTH of them.
      // He drags it; SHE places it on command through this field. Positions are a
      // fixed vocabulary; anything else is silently dropped.
      if (isRealValue(card.face)) {
        var FACE_POS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'hide', 'show'];
        var fp = String(card.face).toLowerCase().trim();
        if (FACE_POS.indexOf(fp) !== -1) comps.push({ type: 'face_control', position: fp });
      }
      // ⬡B:core.stream.screen_awareness:BUILD:pull_real_piece_20260712⬡ component-control:
      // pull a REAL piece of his life (budget numbers, advisor messages) as a live
      // component filled from the actual source; hollow-skip if the piece is empty.
      if (isRealValue(card.piece)) {
        piecePromises.push((async function () {
          try {
            var pr = require('./piece.registry');
            var pieceName = pr.match(card.piece) || String(card.piece).toLowerCase().trim();
            var comp = await pr.pull(pieceName, hamUid, BU_PUBLIC(), {});
            if (comp) comps.push(comp);
          } catch (ePiece) { /* hollow-skip */ }
        })());
      }
      // ⬡B:core.stream.screen_awareness:BUILD:dashboard_compose_20260712⬡ the Jarvis
      // cook-me-a-dashboard move: several real pieces pulled at once into one composed
      // surface, each filled with real data, each hollow-skipping if empty. Order is
      // preserved as she asked; duplicates ignored.
      // ⬡B:core.stream.screen_awareness:BUILD:recall_saved_layout_20260712⬡ recall: a
      // saved layout name expands into its real pieces, each pulled live and hollow-
      // skipped if empty, so a saved dashboard reassembles with fresh data every time.
      if (isRealValue(card.layout)) {
        piecePromises.push((async function () {
          try {
            var lm = require('./layout.memory');
            var pr = require('./piece.registry');
            var names = await lm.recall(hamUid, card.layout);
            if (names && names.length) {
              for (var li = 0; li < names.length; li++) {
                var comp = await pr.pull(pr.match(names[li]) || names[li], hamUid, BU_PUBLIC(), {});
                if (comp) comps.push(comp);
              }
            }
          } catch (eL) { /* hollow-skip: unknown layout draws nothing */ }
        })());
      }
      if (Array.isArray(card.pieces) && card.pieces.length) {
        var seen = {};
        card.pieces.slice(0, 5).forEach(function (rawName) {
          if (!isRealValue(rawName)) return;
          piecePromises.push((async function () {
            try {
              var pr = require('./piece.registry');
              var nm = pr.match(rawName) || String(rawName).toLowerCase().trim();
              if (seen[nm]) return; seen[nm] = 1;
              var comp = await pr.pull(nm, hamUid, BU_PUBLIC(), {});
              if (comp) comps.push(comp);
            } catch (eP) { /* hollow-skip one piece, the rest still compose */ }
          })());
        });
      }
      if (isRealValue(card.app)) {
        var APPS = { ccwa: 'https://ccwa-dev.onrender.com', coding: 'https://ccwa-dev.onrender.com',
          life: 'https://myaba-cip-dev.onrender.com', myaba: 'https://myaba-cip-dev.onrender.com',
          gmgu: 'https://gmgu-standalone-dev.onrender.com', seer: 'https://gmgu-standalone-dev.onrender.com',
          tryaba: 'https://tryaba-portal-dev.onrender.com' };
        var appKey = String(card.app).toLowerCase().trim();
        if (APPS[appKey]) comps.push({ type: 'app_window', app: appKey, url: APPS[appKey] });
      }
      if (card.chart && typeof card.chart === 'object' && Array.isArray(card.chart.series)) {
        var series = card.chart.series
          .filter(function (it) { return it && isRealValue(String(it.label || '')) && isFinite(Number(it.value)); })
          .slice(0, 12)
          .map(function (it) { return { label: String(it.label).slice(0, 18), value: Number(it.value) }; });
        if (series.length) {
          comps.push({ type: 'chart', title: isRealValue(card.chart.title) ? String(card.chart.title).slice(0, 80) : '', series: series });
        }
      }
      if (isRealValue(card.image) && /^https:\/\//.test(card.image)) {
        comps.push({ type: 'image', url: card.image, caption: isRealValue(card.caption) ? String(card.caption).slice(0, 140) : '' });
      }
      (Array.isArray(card.items) ? card.items : []).filter(isRealValue).slice(0, 8).forEach(function (it) { comps.push({ type: 'card', text: String(it).slice(0, 240) }); });
      if (piecePromises.length) { const __r = await Promise.all(piecePromises); }
      if (!comps.length && isRealValue(card.text)) comps.push({ type: 'card', text: String(card.text).slice(0, 400) });
      if (!comps.length) continue; // hollow-skip: no empty surfaces, and never a fabricated or echoed placeholder
      const c = send(vocab.createSurface(sid, { region: region, title: title }));
      if (c.ok) {
        send(vocab.updateComponents(sid, comps));
        // ⬡B:core.stream.screen_awareness:BUILD:agui_state_delta_emit_20260711⬡ ALSO
        // emit the same surface as an AG-UI STATE_DELTA (RFC6902 patch) so the glass
        // can consume the industry-standard event. Non-breaking: legacy components
        // still flow above; this is the standard path a compliant player reads.
        try {
          var surface = { cards: comps.filter(function (k) { return k.type !== 'face_control' && k.type !== 'app_window'; }),
            apps: comps.filter(function (k) { return k.type === 'app_window'; }),
            face: (comps.find(function (k) { return k.type === 'face_control'; }) || {}).position };
          send({ event: 'agui', payload: agui.stateDelta(surface) });
        } catch (eAg) { /* standard path is additive; legacy already delivered */ }
        comps.forEach(function (k) { if (applied.indexOf('card:' + k.type) === -1) applied.push('card:' + k.type); });
      }
    }
  }
  return { pushed: pushed, applied: applied };
}

// The one call sites use: clean the answer, move the glass if she asked to.
async function applyScreenBlock(hamUid, rawAnswer) {
  const ex = extract(rawAnswer);
  // Belt-and-suspenders: whatever extract() did or didn't catch, a raw [[SCREEN
  // fragment must never reach a person's eyes. Confirmed live incident: it did.
  const safe = ex.answer.replace(/\[\[\s*SCREEN[\s\S]*$/i, '').trim();
  if (!ex.block) return { answer: safe, pushed: 0 };
  if (!hasLiveScreen(hamUid)) return { answer: safe, pushed: 0 }; // screen left while she thought: words still flow
  const r = await push(hamUid, ex.block);
  return { answer: safe, pushed: r.pushed };
}

module.exports = { promptAddendum, applyScreenBlock, extract, push, hasLiveScreen, BACKGROUND_IDS };
