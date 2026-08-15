// ⬡B:tests.fcw_memory_availability:GUARD:unavailable_is_not_empty:20260730⬡
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIND = path.join(ROOT, 'pai', 'core', 'find.js');
const BUILDER = path.join(ROOT, 'pai', 'core', 'fcw.builder.js');
const TITLE = path.join(ROOT, 'pai', 'core', 'title.js');
const CAPABILITIES = path.join(ROOT, 'pai', 'core', 'capabilities.js');
const TIMEZONE = path.join(ROOT, 'pai', 'core', 'ham.timezone.js');
const BANK_ENV = ['MEMORY_BANK_URL', 'MEMORY_BANK_KEY', 'AIBE_BRAIN_URL', 'AIBE_BRAIN_KEY'];

function restore(t, modules) {
  const oldFetch = global.fetch;
  const oldEnv = {};
  BANK_ENV.forEach(function (key) { oldEnv[key] = process.env[key]; });
  t.after(function () {
    global.fetch = oldFetch;
    BANK_ENV.forEach(function (key) {
      if (oldEnv[key] == null) delete process.env[key]; else process.env[key] = oldEnv[key];
    });
    modules.forEach(function (file) { delete require.cache[file]; });
  });
}

function armFind(t) {
  restore(t, [FIND]);
  process.env.MEMORY_BANK_URL = 'https://memory.test.invalid';
  process.env.MEMORY_BANK_KEY = 'test-key-not-a-real-secret';
  delete process.env.AIBE_BRAIN_URL;
  delete process.env.AIBE_BRAIN_KEY;
  delete require.cache[FIND];
  return require(FIND);
}

test('generic FIND separates valid empty, HTTP, transport, payload, and unconfigured reads', async function (t) {
  const find = armFind(t);

  global.fetch = async function () { return {ok:true,status:200,json:async function () { return []; }}; };
  let out = await find.find([{stamp_type:'EMPTY',ham_uid:'HAM.TEST',limit:1}]);
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.count, 0);
  assert.equal(out.queriesAvailable, 1);

  let exactSourceUrl = '';
  global.fetch = async function (url) {
    exactSourceUrl = String(url);
    return {ok:true,status:200,json:async function () { return []; }};
  };
  out = await find.find([{source:'os.canon.a',source_prefix:'os.canon.a',ham_uid:'HAM.TEST',limit:1}]);
  assert.match(exactSourceUrl, /source=eq\.os\.canon\.a/);
  assert.doesNotMatch(exactSourceUrl, /source=like\./,
    'an exact source read must never degrade to a prefix when both fields are present');

  global.fetch = async function () { return {ok:false,status:503,json:async function () { return []; }}; };
  out = await find.find([
    {stamp_type:'HTTP_A',ham_uid:'HAM.TEST',limit:1},
    {stamp_type:'HTTP_B',ham_uid:'HAM.TEST',limit:1}
  ]);
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.reason, 'brain_http_error');
  assert.equal(out.queriesAvailable, 0);
  assert.equal(out.failures.length, 2);
  assert.equal(out.failures[0].reason, 'brain_http_error');
  assert.equal(out.failures[0].status, 503);

  global.fetch = async function () { throw new Error('transport down'); };
  out = await find.find([{stamp_type:'TRANSPORT',ham_uid:'HAM.TEST',limit:1}]);
  assert.equal(out.available, false);
  assert.equal(out.failures[0].reason, 'brain_transport_error');

  global.fetch = async function () { return {ok:true,status:200,json:async function () { return {rows:[]}; }}; };
  out = await find.find([{stamp_type:'PAYLOAD',ham_uid:'HAM.TEST',limit:1}]);
  assert.equal(out.available, false);
  assert.equal(out.failures[0].reason, 'brain_payload_invalid');

  delete process.env.MEMORY_BANK_URL;
  delete process.env.MEMORY_BANK_KEY;
  out = await find.find([{stamp_type:'UNCONFIGURED',ham_uid:'HAM.TEST',limit:1}]);
  assert.equal(out.available, false);
  assert.equal(out.failures[0].reason, 'brain_unconfigured');
});

test('generic FIND timeout is explicit instead of becoming an empty history', async function (t) {
  const find = armFind(t);
  global.fetch = function () { return new Promise(function () {}); };
  const controller = new AbortController();
  const abortTimer = setTimeout(function () { controller.abort(); },10);
  t.after(function () { clearTimeout(abortTimer); });
  const out = await find.find([
    {stamp_type:'TIMEOUT_A',ham_uid:'HAM.TEST',limit:1},
    {stamp_type:'TIMEOUT_B',ham_uid:'HAM.TEST',limit:1}
  ],{signal:controller.signal});
  assert.equal(out.ok, false);
  assert.equal(out.available, false);
  assert.equal(out.reason, 'brain_timeout');
  assert.equal(out.queriesAvailable, 0);
  assert.equal(out.failures.length, 2);
  assert.equal(out.failures[0].reason, 'brain_timeout');
});

test('a mixed FIND batch retains good rows and names partial availability', async function (t) {
  const find = armFind(t);
  global.fetch = async function (url) {
    if (String(url).indexOf('stamp_type=eq.GOOD') >= 0) {
      return {ok:true,status:200,json:async function () {
        return [{id:1,stamp_type:'GOOD',summary:'real row'}];
      }};
    }
    return {ok:false,status:503,json:async function () { return []; }};
  };
  const out = await find.find([
    {stamp_type:'GOOD',ham_uid:'HAM.TEST',limit:1},
    {stamp_type:'BAD',ham_uid:'HAM.TEST',limit:1}
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.partial, true);
  assert.equal(out.queriesAvailable, 1);
  assert.deepEqual(out.beads.map(function (row) { return row.id; }), [1]);

  global.fetch = async function () { return {ok:false,status:503,json:async function () { return []; }}; };
  const world = await find.findForWorld(0, [{stamp_type:'BAD',ham_uid:'HAM.TEST',limit:1}]);
  assert.equal(world.ok, false, 'findForWorld must not overwrite an unavailable result');
  assert.equal(world.available, false);
});

function buildWith(t, canonical, optionalIdentity, optionalReads) {
  restore(t, [FIND, BUILDER, TITLE, CAPABILITIES, TIMEZONE]);
  optionalReads = optionalReads || {};
  BANK_ENV.forEach(function (key) { delete process.env[key]; });
  const labels = ['identity', 'agentJDs', 'context', 'recent', 'doctrine', 'profile', 'statedPlans'];
  const values = {};
  labels.forEach(function (label, index) { values[label] = canonical[index]; });
  require.cache[FIND] = {id:FIND,filename:FIND,loaded:true,exports:{
    findIdentity:async function () { return values.identity; },
    findAgentJDs:async function () { return values.agentJDs; },
    findContext:async function () { return values.context; },
    findRecentResults:async function () { return values.recent; },
    findDoctrine:async function () { return values.doctrine; },
    findPersonProfile:async function () { return values.profile; },
    findStatedCommitments:async function () { return values.statedPlans; },
    findNamedAgentRecords:async function () { return optionalReads.namedAgentRecords ||
      {ok:true,available:true,partial:false,beads:[],ms:1}; },
    findIdentityEvidence:async function () { return optionalIdentity || {
      schema:'anew.identity.evidence.result.v1',ok:true,available:true,
      ham_uid:'HAM.TEST',subjects:[],records:[],count:0,ms:1}; },
    findPreferences:async function () { return optionalReads.preferences ||
      {ok:true,available:true,partial:false,beads:[],ms:1}; },
    findWonderGames:async function () { return optionalReads.wonderGames ||
      {ok:true,available:true,partial:false,beads:[],ms:1}; }
  }};
  require.cache[TITLE] = {id:TITLE,filename:TITLE,loaded:true,exports:{resolveTitle:async function () { return null; }}};
  require.cache[CAPABILITIES] = {id:CAPABILITIES,filename:CAPABILITIES,loaded:true,
    exports:{capabilityLine:async function () { return ''; }}};
  require.cache[TIMEZONE] = {id:TIMEZONE,filename:TIMEZONE,loaded:true,
    exports:{resolveHamTimezone:async function () { return 'UTC'; }}};
  delete require.cache[BUILDER];
  return require(BUILDER);
}

function unavailable(label) {
  return {ok:false,available:false,reason:'brain_' + label + '_unavailable',beads:[],ms:1};
}

function empty() {
  return {ok:true,available:true,partial:false,failures:[],beads:[],count:0,ms:1};
}

test('all seven canonical reads unavailable refuses the memory wall', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(unavailable);
  const builder = buildWith(t, values);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'ordinary question',
    {ham_uid:'HAM.TEST',user_message:'ordinary question'});
  assert.equal(wall.ok, false);
  assert.equal(wall.reason, 'memory_bank_unavailable');
  assert.equal(wall.contributorsAvailable, 0);
  assert.equal(wall.system_prompt, undefined);
});

test('one successful empty read cannot impersonate the critical memory quorum', async function (t) {
  const failed = ['identity','agents','context','recent','doctrine','profile','plans'].map(unavailable);
  const one = failed.slice();
  one[2] = empty();
  const builder = buildWith(t, one);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'ordinary question',
    {ham_uid:'HAM.TEST',user_message:'ordinary question'});
  assert.equal(wall.ok, false);
  assert.equal(wall.reason, 'memory_bank_insufficient');
  assert.equal(wall.contributorsAvailable, 1);
  assert.deepEqual(wall.missingCriticalContributors, ['identity', 'doctrine']);
  assert.equal(wall.system_prompt, undefined);
});

test('optional evidence cannot rescue an unavailable canonical memory substrate', async function (t) {
  const failed = ['identity','agents','context','recent','doctrine','profile','plans'].map(unavailable);
  const builder = buildWith(t, failed, {schema:'anew.identity.evidence.result.v1',ok:true,
    available:true,ham_uid:'HAM.TEST',subjects:['Cathy'],records:[],count:0,ms:1});
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'Who is Cathy?',
    {ham_uid:'HAM.TEST',user_message:'Who is Cathy?'});
  assert.equal(wall.ok, false);
  assert.equal(wall.reason, 'memory_bank_unavailable');
});

test('critical quorum can build on successful empty reads without calling them unavailable', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(unavailable);
  values[0] = empty();
  values[2] = empty();
  values[4] = empty();
  const builder = buildWith(t, values);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'ordinary question',
    {ham_uid:'HAM.TEST',user_message:'ordinary question'});
  assert.equal(wall.ok, true);
  assert.equal(wall.partial, true);
  assert.equal(wall.contributorsAvailable, 3);
  assert.match(wall.system_prompt,
    /MEMORY READ AVAILABILITY \(truth gate for this turn\):/);
  assert.match(wall.system_prompt,
    /identity: AVAILABLE, SUCCESSFUL EMPTY\. The read completed and returned no records\./);
  assert.match(wall.system_prompt,
    /roadmap and doctrine: AVAILABLE, SUCCESSFUL EMPTY\. The read completed and returned no records\./);
  assert.match(wall.system_prompt,
    /ROADMAP AND DOCTRINE[\s\S]*SUCCESSFUL EMPTY: the roadmap-and-doctrine read completed/);
  assert.doesNotMatch(wall.system_prompt, /\(loading\.\.\.\)|\(none loaded\)|\(no recent context\)/);
});

test('doctrine unavailable blocks the wall while successful-empty doctrine is a distinct state', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(function () {
    return empty();
  });
  values[4] = unavailable('doctrine');
  const builder = buildWith(t, values);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'ordinary question',
    {ham_uid:'HAM.TEST',user_message:'ordinary question'});
  assert.equal(wall.ok, false);
  assert.equal(wall.reason, 'memory_bank_insufficient');
  assert.deepEqual(wall.missingCriticalContributors, ['doctrine']);
  assert.equal(wall.system_prompt, undefined);
});

test('nested partial FIND failures survive into the FCW receipt and prompt', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(function () {
    return empty();
  });
  values[4] = {ok:true,available:true,partial:true,
    failures:[{query_index:1,reason:'brain_http_error',status:503}],
    beads:[{id:'doctrine-1',stamp_type:'DOCTRINE',summary:'real doctrine',content:'real text'}],
    count:1,ms:1};
  const builder = buildWith(t, values);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'ordinary question',
    {ham_uid:'HAM.TEST',user_message:'ordinary question'});
  assert.equal(wall.ok, true);
  assert.equal(wall.partial, true);
  assert.deepEqual(wall.partialContributors, ['doctrine']);
  assert.equal(wall.contributorAvailability.doctrine.partial, true);
  assert.deepEqual(wall.contributorAvailability.doctrine.failures,
    [{query_index:1,reason:'brain_http_error',status:503}]);
  assert.match(wall.system_prompt,
    /roadmap and doctrine: PARTIAL READ; 1 record\(s\) returned, but brain_http_error HTTP 503/);
  assert.match(wall.system_prompt,
    /READ STATUS FOR THIS SECTION:[\s\S]*roadmap and doctrine: PARTIAL READ/);
  // The doctrine row still reaches the wall; the bracket now also names the writer that
  // stamped it, per the 20260815 pen-on-her-mind fence. Asserting the writer clause too, so
  // this stays a test of the fence rather than only of the content surviving.
  assert.match(wall.system_prompt, /\[DOCTRINE \| written by [^\]]+\] real doctrine/);
});

test('a triggered preference outage is named partial instead of becoming no preference', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(empty);
  const preferenceFailure = {ok:false,available:false,partial:false,beads:[],
    reason:'brain_http_error',failures:[{query_index:0,reason:'brain_http_error',status:503}],ms:1};
  const builder = buildWith(t, values, null, {preferences:preferenceFailure});
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'what is my favorite team?',
    {ham_uid:'HAM.TEST',user_message:'what is my favorite team?'});
  assert.equal(wall.ok, true);
  assert.equal(wall.partial, true);
  assert.equal(wall.contributorAvailability.preferences.available, false);
  assert.ok(wall.unavailableContributors.includes('preferences'));
  assert.equal(wall.contributorsTotal, 8);
  assert.match(wall.system_prompt,
    /question-matched preferences: UNAVAILABLE \(brain_http_error\).*not an empty result/s);
  assert.deepEqual(wall.context, []);
});

test('a triggered Wonder Games partial read keeps its rows and names the missing evidence', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(empty);
  const wonderPartial = {ok:true,available:true,partial:true,
    failures:[{query_index:1,reason:'brain_timeout',status:null}],
    beads:[{stamp_type:'WONDER_GAMES',summary:'real contest result'}],count:1,ms:1};
  const builder = buildWith(t, values, null, {wonderGames:wonderPartial});
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'what happened in Wonder Games?',
    {ham_uid:'HAM.TEST',user_message:'what happened in Wonder Games?'});
  assert.equal(wall.ok, true);
  assert.equal(wall.partial, true);
  assert.deepEqual(wall.partialContributors, ['wonderGames']);
  assert.equal(wall.context[0].summary, 'real contest result');
  assert.match(wall.system_prompt,
    /question-matched Wonder Games records: PARTIAL READ; 1 record\(s\) returned, but brain_timeout/);
});

test('a triggered named-agent outage is present in the wall receipt and prompt', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(empty);
  const namedFailure = {ok:false,available:false,partial:false,beads:[],
    reason:'brain_transport_error',failures:[{query_index:0,reason:'brain_transport_error',status:null}],ms:1};
  const builder = buildWith(t, values, null, {namedAgentRecords:namedFailure});
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'What did ELI decide?',
    {ham_uid:'HAM.TEST',user_message:'What did ELI decide?'});
  assert.equal(wall.ok, true);
  assert.equal(wall.partial, true);
  assert.equal(wall.contributorAvailability.namedAgentRecords.available, false);
  assert.ok(wall.unavailableContributors.includes('namedAgentRecords'));
  assert.match(wall.system_prompt,
    /question-matched named agent records: UNAVAILABLE \(brain_transport_error\)/);
});

test('nonempty identity evidence is counted as records and never labeled successfully empty', async function (t) {
  const values = ['identity','agents','context','recent','doctrine','profile','plans'].map(empty);
  const evidence = {schema:'anew.identity.evidence.result.v1',ok:true,available:true,partial:false,
    ham_uid:'HAM.TEST',subjects:['Cathy'],records:[{kind:'definition',subject:'Cathy'}],count:1,ms:1};
  const builder = buildWith(t, values, evidence);
  const wall = await builder.buildMemoryBank('HAM.TEST', 'cara', 'Who is Cathy?',
    {ham_uid:'HAM.TEST',user_message:'Who is Cathy?'});
  assert.equal(wall.ok, true);
  assert.equal(wall.contributors.identityEvidence, true);
  assert.match(wall.system_prompt,
    /question-matched identity evidence: AVAILABLE; 1 record\(s\) returned\./);
  assert.doesNotMatch(wall.system_prompt,
    /question-matched identity evidence: AVAILABLE, SUCCESSFUL EMPTY/);
});
