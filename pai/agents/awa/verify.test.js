// ⬡B:agents.awa.verify:TEST:real_postings_20260716:20260716⬡
// Fixtures are 11 REAL Idealist postings pulled 20260716, not invented.
// Two of them publish TELECOMMUTE + Country:US and then state a residency lock in
// prose. If this test ever goes green on those, the filter has regressed to the
// 20260716 failure where 96 of 97 live postings were wrongly rejected.
'use strict';
var assert = require('assert');
var v = require('./verify.js');

var NOW = '2026-07-16';
var SPEC = { tracks: [
  { id:'ED-FT', employment:'FULL_TIME', titles:['executive director','chief executive officer','president and ceo'], exclude:['assistant','deputy'] },
  { id:'ED-PT', employment:'PART_TIME', titles:['executive director','chief executive officer'], exclude:['assistant','deputy'] },
  { id:'DOD', employment:null, titles:['director of development','chief advancement officer','senior development director','principal, client engagements'], exclude:[] },
  { id:'PT-DEV', employment:null, titles:['development associate','fundraising specialist','grant writer'], exclude:[] }
]};

function run(p){ return v.verify(p, { nowISO: NOW, trackSpec: SPEC, requireNationwideRemote: true }); }

// 1. Structured TELECOMMUTE + Country US, prose says Illinois only -> DROP
var bdai = run({ title:'Executive Director', employmentType:'FULL_TIME', validThrough:'2026-08-13',
  jobLocationType:'TELECOMMUTE', applicantLocationRequirements:{'@type':'Country',name:'US'},
  descriptionText:'Location\n: Fully remote*, must reside in Illinois\nFull-time exempt\n: 40 hours per week' });
assert.strictEqual(bdai.keep, false, 'BDAI must be dropped');
assert.strictEqual(bdai.drop_reason, 'state_locked:Illinois');

// 2. Structured TELECOMMUTE + Country US, prose says MO/TX/KS -> DROP
var pf = run({ title:'Senior Development Director', employmentType:'FULL_TIME', validThrough:'2026-08-16',
  jobLocationType:'TELECOMMUTE', applicantLocationRequirements:{'@type':'Country',name:'US'},
  descriptionText:'Location:            Remote - (Candidate to reside in MO, TX, KS)' });
assert.strictEqual(pf.keep, false, 'Parkinsons Great Plains must be dropped');
assert.ok(String(pf.drop_reason).indexOf('state_locked') === 0);

// 3. Genuinely nationwide remote -> KEEP
var aldf = run({ title:'Chief Advancement Officer', employmentType:'FULL_TIME', validThrough:'2026-08-01',
  jobLocationType:'TELECOMMUTE', applicantLocationRequirements:{'@type':'Country',name:'US'},
  descriptionText:'The Chief Advancement Officer is a member of the Senior Leadership Team.' });
assert.strictEqual(aldf.keep, true, 'ALDF must be kept');
assert.strictEqual(aldf.track, 'DOD');

// 4. No telecommute flag -> DROP (this is the 20260716 lesson: absence is not remote)
var scf = run({ title:'Director of Development', employmentType:'PART_TIME,CONTRACTOR', validThrough:'2026-07-16',
  jobLocationType:'', applicantLocationRequirements:null, descriptionText:'Los Angeles based.' });
assert.strictEqual(scf.keep, false);

// 5. Deadline in the past -> DROP
var expired = run({ title:'Executive Director', employmentType:'FULL_TIME', validThrough:'2026-07-08',
  jobLocationType:'TELECOMMUTE', applicantLocationRequirements:{'@type':'Country',name:'US'}, descriptionText:'' });
assert.strictEqual(expired.drop_reason, 'deadline_passed');

// 6. No deadline is unknown, never "open" -> DROP
var nodl = run({ title:'Executive Director', employmentType:'FULL_TIME', validThrough:'',
  jobLocationType:'TELECOMMUTE', applicantLocationRequirements:{'@type':'Country',name:'US'}, descriptionText:'' });
assert.strictEqual(nodl.drop_reason, 'no_deadline_stated');

// 7. "must reside in the United States" is NOT a lock
assert.strictEqual(v.residencyLock('You must reside in the United States to apply.'), null);

// 8. Universality: no HAM, no grant, no org roster reaches this module.
var src = require('fs').readFileSync(__dirname + '/verify.js', 'utf8');
assert.ok(src.indexOf('DC499D0C') === -1, 'no hardcoded HAM');
assert.ok(src.indexOf('nyk_') === -1 && src.indexOf('api.us.nylas') === -1, 'no credentials or reach');
assert.ok(src.indexOf('groq') === -1 && src.indexOf('GROQ') === -1, 'C0: no LLM');

console.log('AWA verify: 8/8 pass');
