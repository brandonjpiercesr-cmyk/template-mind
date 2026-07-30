// ⬡B:tests.privacy.world_release:TEST:three_marks_one_room_four_worlds:20260726⬡
// THE TEST THAT MATTERS MOST, and it runs against the LIVE bank, not a fixture.
//
// It seeds three real beads into the real brain under a throwaway test HAM:
//   PRIVATE       explicitly marked by the founder. Must never appear ANYWHERE, including
//                 in error messages, reason strings, counts-by-name, or logs.
//   SANCTIONED    explicitly marked by the founder. Must appear, verbatim, untouched.
//   UNCLASSIFIED  nobody marked it and it is obviously sensitive. Must be TONED DOWN by a
//                 mind, not refused, and the toned version must not carry the detail.
//
// Then it reads AS A T1 WORLD and asserts all three behaviours, and asserts that PAM FAILS
// CLOSED when its model call fails, which is the single property that makes four
// personalised worlds safe in one room.
//
// SUPERSEDE, NEVER DELETE: the seeded beads are marked terminal with a SUPERSEDED update at
// the end of the run. Nothing is DELETEd from the bank.
//
// IDENTITY ENV-ONLY: the test HAM is a synthetic literal that belongs to no person, and the
// seeded "sensitive" facts are invented for this test about a fictional owner. No real
// person, income, employer or family member appears anywhere in this file.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const tiers = require('../pai/core/privacy/people.tier.js');
const pam = require('../pai/board/pam/pam.js');
const find = require('../pai/core/find.js');

const BU = process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL;
const BK = process.env.MEMORY_BANK_KEY || process.env.AIBE_BRAIN_KEY;
const TBL = process.env.BEAD_TABLE || (process.env.MEMORY_BANK_URL ? 'beads' : 'aibe_brain');
const SCHEMA = process.env.BRAIN_SCHEMA || (process.env.MEMORY_BANK_URL ? 'memory_bank' : 'abacia_core');
const LIVE = !!(BU && BK);

const TEST_HAM = 'HAM.PRIVACYGATE.TEST';
const RUN = Date.now();

// The three seeds. The private one carries a distinctive token so the assertion can sweep
// the ENTIRE serialized response for it, not just the fields we remembered to check.
const PRIVATE_TOKEN = 'ZQPRIVATEMARKER' + RUN;
const SEEDS = [
  { key: 'private', mark: tiers.MARKS.PRIVATE, tier: 0,
    summary: 'The owner is quietly interviewing elsewhere and has told no one, ref ' + PRIVATE_TOKEN,
    text: 'Third round scheduled. Nobody at the current company knows. ' + PRIVATE_TOKEN },
  { key: 'sanctioned', mark: tiers.MARKS.SANCTIONED, tier: 1,
    summary: 'The doctrine the owner deliberately opened for the team to dig into',
    text: 'AIR CODE: cold code is renamed for what it is, air. Its whole job is to carry oxygen to the brain so the brain can think and the hands can reach.' },
  { key: 'unclassified', mark: tiers.MARKS.UNCLASSIFIED, tier: 1,
    summary: 'Owner mentioned the grant money and what it is covering at home',
    text: 'The fellowship paid out and it is covering four months of the mortgage plus the medical bill from the spring.' }
];

function hdrs(write) {
  const h = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': SCHEMA };
  if (write) { h['Content-Profile'] = SCHEMA; h['Content-Type'] = 'application/json'; h.Prefer = 'return=minimal'; }
  return h;
}

// Seeded with the same bead shape core/brain.client.js writes, including the acl_tier column
// it now populates from the privacy envelope. The seed POSTs directly rather than calling
// writeBead only because the legacy aibe_brain table predates writeBead's abcd_tag column and
// rejects it, which is a pre-existing gap unrelated to this gate; the separate test below
// proves writeBead itself puts acl_tier on the payload.
async function seed() {
  for (const s of SEEDS) {
    const envelope = tiers.buildEnvelope(s.mark, s.tier, 'seeded by the privacy gate test', 'test');
    const body = {
      ham_uid: TEST_HAM, agent_global: 'PRIVACY_TEST', stamp_type: 'DOCTRINE', importance: 5,
      acl_stamp: '⬡B:tests.privacy.world_release:SEED:' + s.key + ':' + RUN + '⬡',
      source: 'privacy.test.' + RUN + '.' + s.key, summary: s.summary,
      content: { text: s.text, privacy: envelope },
      acl_tier: envelope.tier
    };
    const r = await fetch(BU + '/rest/v1/' + TBL, { method: 'POST', headers: hdrs(true), body: JSON.stringify(body) });
    assert.ok(r.ok, 'seed ' + s.key + ' failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }
  // Prove the column landed, so a later empty result can never be mistaken for a working gate.
  const r = await fetch(BU + '/rest/v1/' + TBL + '?select=source,acl_tier&ham_uid=eq.' +
    encodeURIComponent(TEST_HAM) + '&source=like.privacy.test.' + RUN + '*', { headers: hdrs(false) });
  const rows = await r.json();
  console.log('seeded acl_tier column values: ' + JSON.stringify(rows.map(x => [x.source.split('.').pop(), x.acl_tier])));
  assert.equal(rows.length, 3, 'all three seeds must land');
  assert.ok(rows.every(x => x.acl_tier !== null), 'the acl_tier column must be populated');
}

test('the one canonical bead write mirrors the privacy envelope out to the acl_tier column', async function () {
  const brain = require('../pai/core/brain.client.js');
  const realFetch = global.fetch;
  let posted = null;
  global.fetch = async function (url, init) {
    posted = JSON.parse(init.body);
    return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
  };
  try {
    await brain.writeBead({
      hamUid: TEST_HAM, agentGlobal: 'PRIVACY_TEST', type: 'DOCTRINE', importance: 5,
      source: 'privacy.writepath.' + RUN, summary: 'write path probe',
      content: { text: 'x', privacy: tiers.buildEnvelope('sanctioned', 2, '', 'founder_mark') },
      edges: [{ type: 'PROBE', target: 'privacy.writepath' }]
    });
  } finally { global.fetch = realFetch; }
  console.log('writeBead payload acl_tier: ' + JSON.stringify(posted.acl_tier));
  assert.equal(posted.acl_tier, 2, 'a privacy envelope must populate the real column');

  // And a bead with no envelope must leave the column absent, which reads as NULL, which is
  // invisible to every reader above T0. Silence means closed.
  let posted2 = null;
  global.fetch = async function (url, init) { posted2 = JSON.parse(init.body); return { ok: true, status: 201, text: async () => '', json: async () => ({}) }; };
  try {
    await brain.writeBead({ hamUid: TEST_HAM, agentGlobal: 'PRIVACY_TEST', type: 'DOCTRINE',
      source: 'privacy.writepath.plain.' + RUN, summary: 'no envelope', content: { text: 'x' },
      edges: [{ type: 'PROBE', target: 'privacy.writepath' }] });
  } finally { global.fetch = realFetch; }
  console.log('no-envelope payload acl_tier: ' + JSON.stringify(posted2.acl_tier));
  assert.equal(posted2.acl_tier, undefined, 'an unclassified bead must leave the column NULL');

  // Null-like values must not cross the canonical write boundary as T0. Number(null),
  // Number(false), and Number('   ') are all zero in JavaScript, which is founder privilege on
  // this inverted ladder.
  for (const invalidTier of [null, false, '   ']) {
    let invalidPosted = null;
    global.fetch = async function (url, init) {
      invalidPosted = JSON.parse(init.body);
      return { ok:true, status:201, text:async function () { return ''; },
        json:async function () { return {}; } };
    };
    try {
      await brain.writeBead({ hamUid:TEST_HAM, agentGlobal:'PRIVACY_TEST', type:'DOCTRINE',
        source:'privacy.writepath.invalid.' + RUN + '.' + String(invalidTier), summary:'invalid tier',
        content:{ text:'x', privacy:{ mark:'sanctioned', tier:invalidTier } },
        edges:[{type:'PROBE',target:'privacy.writepath'}] });
    } finally { global.fetch = realFetch; }
    assert.equal(invalidPosted.acl_tier, undefined,
      'null-like tier ' + JSON.stringify(invalidTier) + ' must remain unclassified, never T0');
  }
});

// SUPERSEDE, NEVER DELETE. The seeds stay in the bank; they are marked terminal.
async function supersede() {
  await fetch(BU + '/rest/v1/' + TBL + '?ham_uid=eq.' + encodeURIComponent(TEST_HAM) +
    '&source=like.privacy.test.' + RUN + '*', {
    method: 'PATCH', headers: hdrs(true),
    body: JSON.stringify({ summary: '[SUPERSEDED test seed, run ' + RUN + '] terminal', importance: 0 })
  }).catch(function () {});
}

// A stand-in for the C1 seat used ONLY here, at the test boundary. Shippable code has no
// seam: board/pam/pam.js resolves core/model.router.js chatSeat itself unless a test hands
// it one. The live seat needs OR_KEY_C1_CELLM funded, which this environment does not have.
function seatSaying(fn) {
  return async function (name, messages) {
    assert.equal(name, 'c1_cellm', 'the release gate must sit on the cheap seat');
    const user = messages[messages.length - 1].content;
    return { choices: [{ message: { role: 'assistant', content: JSON.stringify(fn(user)) } }] };
  };
}
const MIND_TONES_DOWN = seatSaying(function () {
  return { decision: 'tone_down',
    text: 'Some funding came through recently and it took real pressure off at home.' };
});
const MIND_IS_DOWN = async function () { throw new Error('seat unreachable'); };

test('the structural filter is a real database predicate, and it fails closed on unstamped beads', function () {
  assert.equal(tiers.structuralFilter(0), null, 'T0 holds everything, no filter');
  // A real indexed COLUMN, not a path into content: content is TEXT on the legacy bank, so a
  // content-path predicate silently matched nothing there, including rows that genuinely
  // carried a tier. See migrations/0004_acl_tier_structural_people_ladder.sql.
  assert.equal(tiers.structuralFilter(1), 'acl_tier=gte.1');
  // The whole fail-closed claim: an unresolved reader is the LEAST privileged, never T0.
  assert.equal(tiers.effectiveTier(null), 4);
  assert.equal(tiers.effectiveTier(undefined), 4);
  assert.equal(tiers.effectiveTier('0'), 4, 'a string is not a tier');
  assert.equal(tiers.structuralFilter(null), 'acl_tier=gte.4');
  assert.equal(tiers.parseTier(null), null);
  assert.equal(tiers.parseTier(false), null);
  assert.equal(tiers.parseTier('   '), null);
  assert.equal(tiers.envelopeOf({acl_tier:null,content:{}}), null,
    'a NULL structural column is unclassified, never a T0 envelope');
  assert.equal(tiers.buildEnvelope('sanctioned', null, '', 'test').tier, 1,
    'an omitted sanctioned tier uses the sanctioned default, never Number(null) T0');
});

test('a T1 world: private never appears, sanctioned does, unclassified is toned down', { skip: !LIVE && 'no live bank env' }, async function (t) {
  await seed();
  t.after(supersede);

  // READ AS A T1 WORLD. The ceiling is applied in the database by findForWorld.
  const found = await find.findForWorld(1, [{ source_prefix: 'privacy.test.' + RUN, ham_uid: TEST_HAM, limit: 20 }]);
  console.log('T1 query returned ' + found.beads.length + ' of 3 seeded beads (viewer_tier '
    + found.viewer_tier + '), sources: ' + found.beads.map(b => b.source).join(', '));

  // The private bead is stamped tier 0, and 0 >= 1 is false, so the DATABASE dropped it.
  // It never travelled the wire.
  assert.equal(found.beads.length, 2, 'the T0 bead must not survive the query');

  const gate = await pam.pamRelease(found.beads, { viewerTier: 1, hamUid: TEST_HAM },
    { chatSeat: MIND_TONES_DOWN });
  console.log('PAM verdict: ' + gate.verdict + ', released ' + gate.released.length
    + ', toned ' + gate.toned + ', withheld ' + gate.withheld + ', gate_ms ' + gate.gate_ms);

  // THE ASSERTION THAT MATTERS: sweep the ENTIRE serialized result, every field, for the
  // private marker. Not the fields we remembered to check. All of them.
  const everything = JSON.stringify({ found: found, gate: gate });
  assert.equal(everything.indexOf(PRIVATE_TOKEN), -1,
    'the private fact leaked into some field of the response');
  assert.equal(everything.toLowerCase().indexOf('interviewing'), -1,
    'the private fact leaked in paraphrase');

  const released = gate.released.map(b => String(b.summary || '') + ' ' + JSON.stringify(b.content || ''));
  const sanctioned = released.filter(s => s.indexOf('AIR CODE') !== -1);
  assert.equal(sanctioned.length, 1, 'the sanctioned doctrine must surface');
  assert.ok(sanctioned[0].indexOf('carry oxygen to the brain') !== -1,
    'the sanctioned doctrine must surface VERBATIM, not softened');
  assert.equal(gate.released.filter(b => b.pam_toned).length, 0 + 1,
    'exactly the unclassified bead should be toned');

  const toned = gate.released.find(b => b.pam_toned);
  assert.ok(toned, 'the unclassified sensitive bead must be RELEASED toned down, not refused');
  const tonedText = String(toned.summary);
  console.log('toned down to: ' + tonedText);
  assert.equal(tonedText.toLowerCase().indexOf('mortgage'), -1, 'the detail must be gone');
  assert.equal(tonedText.toLowerCase().indexOf('medical'), -1, 'the detail must be gone');
  assert.equal(/can.?t|cannot|not able|private|withheld|restricted/i.test(tonedText), false,
    'a toned answer must never announce that a boundary exists');
  assert.ok(tonedText.length > 20, 'a toned answer must still say something true and real');
});

test('PAM FAILS CLOSED when its model call fails', async function () {
  const unclassified = [{ id: 1, source: 'x', summary: 'an unclassified sensitive fact',
    content: { text: 'an unclassified sensitive fact', privacy: tiers.buildEnvelope('unclassified', 1, '', 'test') } }];

  const down = await pam.pamRelease(unclassified, { viewerTier: 1 }, { chatSeat: MIND_IS_DOWN });
  console.log('mind down -> ' + JSON.stringify({ ok: down.ok, verdict: down.verdict,
    released: down.released.length, withheld: down.withheld }));
  assert.equal(down.released.length, 0, 'a dead mind must release NOTHING');
  assert.equal(down.verdict, 'PAM_HOLD');
  assert.equal(down.withheld, 1);

  // A mind that answers with garbage is the same as a mind that is down.
  const garbage = await pam.pamRelease(unclassified, { viewerTier: 1 },
    { chatSeat: async () => ({ choices: [{ message: { content: 'sure, sounds fine to me' } }] }) });
  console.log('mind garbles -> ' + JSON.stringify({ verdict: garbage.verdict, released: garbage.released.length }));
  assert.equal(garbage.released.length, 0, 'an unparseable verdict must release NOTHING');

  // No mind supplied at all, and no funded seat in this environment: still closed.
  const noSeat = await pam.pamRelease(unclassified, { viewerTier: 1 });
  console.log('no funded seat -> ' + JSON.stringify({ verdict: noSeat.verdict, released: noSeat.released.length }));
  assert.equal(noSeat.released.length, 0, 'an unconfigured seat must release NOTHING');
});

test('PAM never announces a private bead that reaches it, even by accident', async function () {
  // Defense in depth: if a private bead ever gets past the query filter (a caller that
  // forgot findForWorld), PAM must still drop it AND must not name it.
  const rows = [
    { id: 9, source: 'leak.candidate', summary: 'private thing ' + PRIVATE_TOKEN,
      content: { text: PRIVATE_TOKEN, privacy: tiers.buildEnvelope('private', 0, '', 'founder_mark') } },
    { id: 10, source: 'ok.candidate', summary: 'open doctrine line',
      content: { text: 'open doctrine line', privacy: tiers.buildEnvelope('sanctioned', 1, '', 'founder_mark') } }
  ];
  const gate = await pam.pamRelease(rows, { viewerTier: 1 }, { chatSeat: MIND_IS_DOWN });
  const everything = JSON.stringify(gate);
  console.log('bypass attempt -> ' + JSON.stringify({ verdict: gate.verdict,
    released: gate.released.length, withheld: gate.withheld }));
  assert.equal(everything.indexOf(PRIVATE_TOKEN), -1, 'PAM named the private bead');
  assert.equal(gate.released.length, 1);
  assert.equal(gate.released[0].source, 'ok.candidate');
  assert.equal(gate.withheld, 1, 'withheld is an aggregate integer and nothing more');
});

test('transport privacy tiers never coerce null-like values into founder T0', async function () {
  const rows = [
    {id:20,source:'transport.sanctioned',summary:'open doctrine line',
      privacy:{mark:'sanctioned',tier:null}},
    {id:21,source:'transport.unclassified',summary:'unclassified line',
      privacy:{mark:'unclassified',tier:false}}
  ];
  const gate = await pam.pamRelease(rows, {viewerTier:1}, {chatSeat:MIND_IS_DOWN});
  assert.equal(gate.released.length, 1,
    'an unstated sanctioned tier defaults to T1 while invalid unclassified data stays closed');
  assert.equal(gate.released[0].source, 'transport.sanctioned');
  assert.equal(gate.withheld, 1);
});

test('the founder explicit mark is filed by cold code with no model in the loop', async function () {
  const wonder = require('../pai/core/privacy.WONDER.classification.20260726.js');
  let seatCalled = false;
  const spy = async function () { seatCalled = true; throw new Error('should never be reached'); };

  const priv = await wonder.classify({ text: 'anything at all', founderMark: 'private' }, { chatSeat: spy });
  const sanc = await wonder.classify({ text: 'anything at all', founderMark: 'sanctioned' }, { chatSeat: spy });
  console.log('explicit marks -> ' + JSON.stringify([priv.envelope, sanc.envelope]));
  assert.equal(seatCalled, false, 'a model must never get a vote on an explicit founder mark');
  assert.equal(priv.envelope.mark, 'private');
  assert.equal(priv.envelope.tier, 0, 'private is T0 only');
  assert.equal(priv.source, 'founder_mark');
  assert.equal(sanc.envelope.mark, 'sanctioned');
  assert.equal(sanc.envelope.tier, 1, 'an unstated sanction lands at T1, never wide open');

  for (const invalidTier of [null, false, '   ']) {
    const invalidSanction = await wonder.classify({text:'anything at all',
      founderMark:'sanctioned',founderTier:invalidTier}, {chatSeat:spy});
    assert.equal(invalidSanction.envelope.tier, 1,
      'null-like explicit tier must use the sanctioned default, never founder T0');
  }

  // And the unmarked path fails closed to T0 when the seat is unreachable.
  const closed = await wonder.classify({ text: 'an unmarked sensitive fact' },
    { chatSeat: async () => { throw new Error('seat unreachable'); } });
  console.log('classifier down -> ' + JSON.stringify(closed.envelope) + ' ok=' + closed.ok);
  assert.equal(closed.ok, false);
  assert.equal(closed.envelope.tier, 0, 'an unjudged fact must land at T0, never shareable');

  const nullVerdict = await wonder.classify({text:'an unmarked fact'}, {chatSeat:async function () {
    return {choices:[{message:{content:JSON.stringify({tier:null,tone_down:false,
      toned:'',reason:'invalid null tier'})}}]};
  }});
  assert.equal(nullVerdict.ok, false);
  assert.equal(nullVerdict.envelope.tier, 0,
    'a model null tier is invalid and must take the fail-closed path, never Number(null)');
});

test('the people ladder is the INVERTED one, T0 founder, and visibleTo points that way', function () {
  const t0 = tiers.buildEnvelope('sanctioned', 0, '', 'founder_mark');
  const t1 = tiers.buildEnvelope('sanctioned', 1, '', 'founder_mark');
  const t2 = tiers.buildEnvelope('sanctioned', 2, '', 'founder_mark');
  const priv = tiers.buildEnvelope('private', 0, '', 'founder_mark');

  assert.equal(tiers.visibleTo(t0, 0), true, 'T0 holds everything');
  assert.equal(tiers.visibleTo(priv, 0), false, 'private is never visible even to a T0 reader through this gate');
  assert.equal(tiers.visibleTo(t0, 1), false, 'a T1 world must NOT see T0 content');
  assert.equal(tiers.visibleTo(t1, 1), true, 'a T1 world sees T1');
  assert.equal(tiers.visibleTo(t2, 1), true, 'each tier inherits everything beneath it');
  assert.equal(tiers.visibleTo(t1, 2), false, 'a T2 world must NOT see T1 content');
  assert.equal(tiers.visibleTo(t1, null), false, 'an unresolved reader sees nothing it has not been cleared for');
});
