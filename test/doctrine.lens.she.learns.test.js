// ⬡B:tests.lens_she_learns:TEST:a_lens_is_a_posture_never_a_character:20260726⬡
// The founder order of 20260726 is add on personas she can LEARN TO ADAPT, and the whole
// design lives in one distinction: a lens is an internal way of THINKING, never a character
// who shows up to a HAM. These tests hold that line in code, and they hold the two other
// promises this build made: cold code never picks, and an unarmed world is untouched.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const lens = require(path.join(ROOT, 'pai', 'core', 'lens.js'));

function goodLensRow(extra) {
  const content = Object.assign({
    posture: 'Read where the real decision sits before answering, name the hard part first, and move on the thing that actually unblocks them instead of the thing that is easiest to say.',
    fits: 'A room where something has already gone wrong and somebody has to say so plainly.',
    learned_from: 'Three turns in a row where the soft version of the answer cost a day.'
  }, extra || {});
  return { source: 'lens.test.1', importance: 7, acl_tier: 4,
    content: JSON.stringify(content) };
}

// ---------------------------------------------------------------- inert at birth

test('a world that has not armed lenses is byte identical to a world without them', async () => {
  assert.equal(lens.armed({}), false);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: '' }), false);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: '0' }), false);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: 'no' }), false);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: '1' }), true);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: 'true' }), true);
  assert.equal(lens.armed({ ANU_LENSES_ARMED: 'ON' }), true);
});

test('unarmed, the offer is empty and the brain is never even read', async () => {
  let touched = false;
  const priorFetch = global.fetch;
  global.fetch = async function () { touched = true; throw new Error('the brain must not be read while unarmed'); };
  try {
    const out = await lens.lensOffer('TESTHAM', 'ccwa', {
      MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'k'
    });
    assert.equal(out, '');
    assert.equal(touched, false);
  } finally { global.fetch = priorFetch; }
});

test('armed but with a dry brain, the offer is empty and nothing throws', async () => {
  const out = await lens.lensOffer('TESTHAM', 'ccwa', { ANU_LENSES_ARMED: '1' });
  assert.equal(out, '');
});

// ---------------------------------------------------------- a lens is never a character

test('a lens that reaches for a name, a voice, or a line to say is refused in code', () => {
  const costumes = [
    { name: 'the steward' },
    { character: 'a butler' },
    { persona: 'a fixer' },
    { voice: 'dry and clipped' },
    { greeting: 'Good evening.' },
    { catchphrase: 'It is handled.' },
    { speaks_as: 'somebody else' },
    { script: 'first say this, then that' },
    { accent: 'British' },
    { sign_off: 'Always at your service.' }
  ];
  for (const costume of costumes) {
    const verdict = lens.normalizeLens(goodLensRow(costume));
    assert.equal(verdict.ok, false, 'a costume passed the guard: ' + JSON.stringify(costume));
    assert.match(verdict.reason, /^lens_is_character_shaped:/);
  }
});

test('a posture that claims an identity in prose is refused too', () => {
  const claims = [
    'Speak as the fixer who already knows where the bodies are.',
    'Introduce yourself as the house steward.',
    'Your name is different in this posture.',
    'Call yourself the second pair of hands.',
    'Pretend to be someone who has done this a hundred times.',
    'Play the role of the one who cleans it up.'
  ];
  for (const claim of claims) {
    const verdict = lens.normalizeLens(goodLensRow({ posture: claim }));
    assert.equal(verdict.ok, false, 'an identity claim passed: ' + claim);
    assert.equal(verdict.reason, 'lens_claims_an_identity');
  }
});

test('a posture with no real evidence behind it is not a learned lens', () => {
  for (const field of ['posture', 'fits', 'learned_from']) {
    const content = JSON.parse(goodLensRow().content);
    delete content[field];
    const verdict = lens.normalizeLens({ source: 's', content: JSON.stringify(content) });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'lens_missing_' + field);
  }
});

test('a retired posture is never offered again, and it is never deleted either', () => {
  const verdict = lens.normalizeLens(goodLensRow({ retired: true }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'lens_retired');
});

test('unparseable or absent content is refused with a named reason, never guessed at', () => {
  assert.equal(lens.normalizeLens({ source: 's', content: '{not json' }).reason, 'lens_content_unparseable');
  assert.equal(lens.normalizeLens({ source: 's' }).reason, 'lens_content_missing');
  assert.equal(lens.normalizeLens({ source: 's', content: '[]' }).reason, 'lens_content_not_an_object');
});

test('a real posture survives, and it carries how play lands without carrying a joke', () => {
  const verdict = lens.normalizeLens(goodLensRow({
    play: 'Dry, short, and only after the real thing is settled, never instead of it.'
  }));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.lens.weight, 7);
  assert.ok(verdict.lens.posture.length > 0);
  assert.ok(verdict.lens.play.indexOf('Dry, short') === 0);
});

// ------------------------------------------------------------ cold code never picks

test('the offer hands her every surviving posture and picks none of them', () => {
  const lenses = [
    { posture: 'p one', fits: 'f one', learned_from: 'l one', weight: 3 },
    { posture: 'p two', fits: 'f two', learned_from: 'l two', weight: 9 },
    { posture: 'p three', fits: 'f three', learned_from: 'l three', weight: 6 }
  ];
  const block = lens.buildOffer(lenses);
  for (const l of lenses) assert.ok(block.includes(l.posture), 'a posture was dropped by cold code');
  // Highest weight leads, because ordering is not choosing.
  assert.ok(block.indexOf('p two') < block.indexOf('p three'));
  assert.ok(block.indexOf('p three') < block.indexOf('p one'));
});

test('the offer tells her she may use none, and forbids naming or performing one', () => {
  const block = lens.buildOffer([{ posture: 'p', fits: 'f', learned_from: 'l', weight: 1 }]);
  assert.match(block, /use none/i);
  assert.match(block, /never say a posture out loud/i);
  assert.match(block, /never perform one/i);
  assert.match(block, /never let one become a character/i);
  assert.match(block, /your voice never changes/i);
  assert.match(block, /only ever meets you/i);
});

test('the offer is capped so a learned habit can never crowd out her actual wall', () => {
  const many = [];
  for (let i = 0; i < 12; i++) many.push({ posture: 'p' + i, fits: 'f' + i, learned_from: 'l' + i, weight: i });
  const block = lens.buildOffer(many);
  const count = (block.match(/WHEN IT FITS:/g) || []).length;
  assert.equal(count, lens.OFFER_CAP);
});

test('no postures means no block at all, never an empty heading', () => {
  assert.equal(lens.buildOffer([]), '');
  assert.equal(lens.buildOffer(null), '');
  assert.equal(lens.buildOffer([{ posture: '', fits: 'f', learned_from: 'l' }]), '');
});

test('the block she generates from obeys the house voice law', () => {
  const block = lens.buildOffer([{
    posture: 'p', fits: 'f', learned_from: 'l', play: 'q', weight: 1
  }]);
  assert.equal(block.includes('—'), false, 'em dash in the wall');
  assert.equal(block.includes('–'), false, 'en dash in the wall');
  assert.equal(block.includes(' - '), false, 'spaced dash in the wall');
});

// ------------------------------------------------------ she is the one who learns them

test('armed with a live brain, she is told she may keep a posture she earned', async () => {
  const priorFetch = global.fetch;
  global.fetch = async function () { return { ok: true, json: async () => [] }; };
  try {
    const out = await lens.lensOffer('AAAA1111', 'ccwa', {
      ANU_LENSES_ARMED: '1', MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'k'
    });
    assert.match(out, /FORMING A NEW POSTURE/);
    // Even with zero postures stored, the loop can start, which is the difference between
    // a system she learns and a shelf somebody stocked for her.
    assert.equal(out.includes('WHEN IT FITS:'), false);
  } finally { global.fetch = priorFetch; }
});

test('a posture is kept by her own tool call, never minted by cold code', () => {
  const clause = lens.formationClause();
  assert.match(clause, /write_to_brain/);
  assert.match(clause, /stamp_type LENS/);
  assert.match(clause, /more than one/i);
  assert.match(clause, /never a person, a name, a voice, a greeting, or a line to say/i);
  assert.match(clause, /never mention any of this to the person/i);
  assert.equal(clause.includes('—'), false);
  assert.equal(clause.includes(' - '), false);
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'lens.js'), 'utf8');
  // The organ reads postures. It has no write path of its own beyond its own trace bead,
  // so cold code cannot author a way she thinks.
  assert.equal(/stamp_type['"]?\s*:\s*['"]LENS/.test(src), false, 'cold code writes LENS beads');
});

// -------------------------------------------------------------- one room, one HAM

test('a posture learned in one person room never leaks into a stranger turn', async () => {
  let asked = '';
  const priorFetch = global.fetch;
  global.fetch = async function (url) {
    asked = String(url);
    return { ok: true, json: async () => [] };
  };
  try {
    await lens.loadLenses('AAAA1111', { MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'k' });
    assert.match(asked, /stamp_type=eq\.LENS/);
    assert.match(asked, /ham_uid=in\.\(AAAA1111%2CSYSTEM\)|ham_uid=in\.\(AAAA1111,SYSTEM\)/);
  } finally { global.fetch = priorFetch; }
});

test('a brain that answers with garbage produces no postures and no throw', async () => {
  const priorFetch = global.fetch;
  global.fetch = async function () { return { ok: true, json: async () => [
    { source: 'bad', content: '{oops', acl_tier:4 }, goodLensRow()
  ] }; };
  try {
    const out = await lens.loadLenses('AAAA1111', { MEMORY_BANK_URL: 'https://brain.invalid', MEMORY_BANK_KEY: 'k' });
    assert.equal(out.offered.length, 1);
    assert.equal(out.refused.length, 1);
    assert.equal(out.refused[0].reason, 'lens_content_unparseable');
  } finally { global.fetch = priorFetch; }
});

test('a T2 lens read is structurally filtered and cannot accept a synthetic T0 row', async () => {
  const priorFetch = global.fetch;
  const saved = {
    MEMORY_BANK_URL: process.env.MEMORY_BANK_URL,
    MEMORY_BANK_KEY: process.env.MEMORY_BANK_KEY,
    FOUNDER_HAM_UID: process.env.FOUNDER_HAM_UID
  };
  process.env.MEMORY_BANK_URL = 'https://brain.invalid';
  process.env.MEMORY_BANK_KEY = 'k';
  delete process.env.FOUNDER_HAM_UID;
  let lensQuery = '';
  global.fetch = async function (url) {
    const asked = String(url);
    if (/stamp_type=eq\.BIRTH/.test(asked)) {
      return { ok:true, json:async () => [{ content:{ people_tier:2 } }] };
    }
    lensQuery = asked;
    return { ok:true, json:async () => [
      Object.assign({}, goodLensRow(), { source:'lens.t0', acl_tier:0 }),
      Object.assign({}, goodLensRow(), { source:'lens.t2', acl_tier:2 })
    ] };
  };
  try {
    const out = await lens.loadLenses('AAAA1111', {
      MEMORY_BANK_URL:'https://brain.invalid', MEMORY_BANK_KEY:'k'
    });
    assert.match(lensQuery, /acl_tier=gte\.2/);
    assert.deepEqual(out.offered.map((item) => item.source), ['lens.t2']);
    assert.equal(out.refused[0].reason, 'lens_not_visible_to_viewer');
  } finally {
    global.fetch = priorFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

// ----------------------------------------------- this is not the scaffold that was deleted

test('core/lens.js ships zero character content, which is the whole point', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'lens.js'), 'utf8');
  // core/persona.js records that it REPLACED a scaffold of fake template personas wired to
  // nothing. This build does not resurrect it. The postures live in the brain, learned from
  // real turns; a character name in this file would mean the scaffold came back.
  for (const character of ['Alfred', 'Jarvis', 'JARVIS', 'Olivia', 'Pope', 'Batman', 'Butler']) {
    assert.equal(src.includes(character), false, 'a character name reappeared in core/lens.js: ' + character);
  }
});

test('the lens organ never touches her voice', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'lens.js'), 'utf8');
  assert.equal(/require\(['"]\.\/persona/.test(src), false, 'the lens organ reached for the one voice');
  assert.equal(/voicePrompt|applyPersona/.test(src), false, 'the lens organ reached for the one voice');
});

test('the offer rides in the wall she generates from, not in the outbound path', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'fcw.builder.js'), 'utf8');
  assert.match(builder, /require\('\.\/lens\.js'\)\.lensOffer/);
  assert.match(builder, /_lensBlock/);
  // The council shapes what she already said. A posture belongs upstream of that, in her
  // deliberation, or it is a costume applied after the thinking is over.
  const council = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'pai.outbound.council.js'), 'utf8');
  assert.equal(council.includes('lens.js'), false, 'a posture leaked into the outbound path');
});

// ------------------------------------------------------------- the crossover hook

test('the crossover doctrine hook is inert and says exactly what it waits for', () => {
  const binding = lens.crossoverBinding();
  assert.equal(binding.ok, false);
  assert.equal(binding.reason, 'crossover_doctrine_not_delivered');
  assert.match(binding.waiting_for, /crossover doctrine/i);
  assert.match(binding.binds, /core\/lens\.js/);
});

test('nothing in the lens path behaves as if the crossover doctrine were in force', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pai', 'core', 'lens.js'), 'utf8');
  // crossoverBinding is declared and exported, and called by no decision anywhere.
  const calls = (src.match(/crossoverBinding\(\)/g) || []).length;
  assert.equal(calls, 1, 'the inert hook is being called by something');
});
