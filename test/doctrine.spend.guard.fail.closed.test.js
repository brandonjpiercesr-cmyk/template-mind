// ⬡B:tests.spend_guard_fail_closed:TEST:bad_ceiling_never_opens_paid_egress:20260725⬡
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require.resolve('../pai/core/spend.guard.js');
const keys=['DAILY_MODEL_CALL_CEIL','DAILY_IMAGE_CALL_CEIL'];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));

test.afterEach(function(){keys.forEach(k=>saved[k]===undefined?delete process.env[k]:process.env[k]=saved[k]);delete require.cache[path];});

// ⬡B:tests.spend_guard_fail_closed:911:oversized_is_not_invalid_and_refusing_it_muted_her:20260726⬡
// '999999999999999999999', '10001' and '2001' used to live in these lists as invalid. They
// are not invalid; they are OVERSIZED, and refusing one muted her live on 20260726 while the
// founder was RAISING the budget. Oversized clamps to the maximum and she keeps speaking; a
// value nobody can READ still fails closed, which is what this suite is actually for. The
// clamp is asserted below rather than dropped, so the coverage does not shrink.
test('invalid text ceilings fail closed without recording a provider attempt',function(){
  const invalid=['0','-1','NaN','Infinity','1.5','1e3','12abc','2,000'];
  invalid.forEach(function(value){
    process.env.DAILY_MODEL_CALL_CEIL=value;delete require.cache[path];
    const guard=require(path);
    assert.equal(guard.allow('text'),false,'admission must close for '+value);
    assert.equal(guard.allow('text',{egress:true}),false,'egress must close for '+value);
    assert.equal(guard.usageToday(),0);
  });
});

test('invalid image policy fails closed while valid local telemetry stays non-authoritative',function(){
  process.env.DAILY_IMAGE_CALL_CEIL='not a number';
  let guard=require(path);
  assert.equal(guard.allow('image',{egress:true}),false);
  assert.equal(guard.usageToday(),0);
  process.env.DAILY_IMAGE_CALL_CEIL='2';delete require.cache[path];guard=require(path);
  assert.equal(guard.allow('image',{egress:true}),true);
  assert.equal(guard.allow('image',{egress:true}),true);
  assert.equal(guard.allow('image',{egress:true}),true,
    'only the atomic bank claim may refuse a shared daily slot');
  assert.equal(guard.usageToday(),3);
  assert.equal(guard.ceilDetail('image').value,2);
});

// ⬡B:tests.spend_guard_fail_closed:LAW:no_default_and_no_maximum_survive_here:20260731⬡
// These three tests used to assert four literals by name: two built in defaults and two upper
// bounds. All four were coder literals, none of them a decision, and the founder had been told
// the upper two were hard maximums. His 20260731 order removed them, so the assertions that
// pinned them are replaced by assertions that they can never come back.
test('nothing configured means NO ceiling, and it says nobody chose it',function(){
  delete process.env.DAILY_MODEL_CALL_CEIL;delete process.env.DAILY_IMAGE_CALL_CEIL;
  delete require.cache[path];
  const guard=require(path);
  ['text','image'].forEach(function(kind){
    const d=guard._test.ceilDetail(kind);
    assert.equal(d.chosen_by,'nobody_yet','an unconfigured ceiling belongs to nobody');
    assert.equal(d.unlimited,true,'no ceiling is in force, so nothing may be enforced');
    assert.equal(d.configured,false);
    assert.equal(d.needs_review,true,'a gap that reads as a clean run is how the defect survives');
    assert.equal(guard.allow(kind),true,'an unowned ceiling never mutes her');
  });
});

test('a number far above the old maximum is enforced exactly, not trimmed',function(){
  // These two values used to be trimmed. They are his numbers and they run at his size now,
  // because this system holds no maximum on them at all.
  process.env.DAILY_MODEL_CALL_CEIL='10001';process.env.DAILY_IMAGE_CALL_CEIL='2001';
  delete require.cache[path];
  const guard=require(path);
  assert.equal(guard._test.configuredCeil('text'),10001,'his number, not a trimmed one');
  assert.equal(guard._test.configuredCeil('image'),2001);
  assert.equal(guard._test.ceilDetail('text').chosen_by,'the founder');
  assert.equal(guard._test.ceilDetail('text').requested,10001);
  assert.equal(guard._test.ceilDetail('text').limited_by,null,'nothing limited it');
});

test('a digit run too long to be an exact number still never mutes her',function(){
  // The 20260726 reviewer finding survives the removal of the maximum: refusing an imprecise
  // value reintroduces the exact mute this whole line of work exists to remove. What is in
  // force is now the arithmetic edge rather than a coder's cap, and it says so out loud.
  process.env.DAILY_MODEL_CALL_CEIL='999999999999999999999';delete require.cache[path];
  const guard=require(path);
  assert.equal(guard._test.configuredCeil('text'),Number.MAX_SAFE_INTEGER);
  assert.equal(guard._test.ceilDetail('text').chosen_by,'the founder');
  assert.equal(guard._test.ceilDetail('text').limited_by,'exact_integer_range');
  assert.equal(guard._test.ceilDetail('text').unlimited,true);
  assert.equal(guard._test.ceilDetail('text').requested,null,'an inexact number is never reported as exact');
  assert.equal(guard.allow('text'),true,'she speaks');
});

test('a blank or whitespace ceiling means nobody chose, not a typo and not a default',function(){
  process.env.DAILY_MODEL_CALL_CEIL='   ';delete require.cache[path];
  const guard=require(path);
  assert.equal(guard._test.ceilDetail('text').chosen_by,'nobody_yet');
  assert.equal(guard._test.ceilDetail('text').unlimited,true);
  assert.equal(guard.allow('text'),true);
});

test('real egress ownership reconciles exactly and never counts admission',async function(){
  process.env.DAILY_MODEL_CALL_CEIL='100';delete require.cache[path];
  const guard=require(path);
  assert.equal(guard.allow('text'),true,'admission is not egress');
  await guard.withAttribution({ham_uid:'HAM.SECRET',cycle_id:'cycle.secret',
    request_id:'request.secret',seat:'c2_organ',component:'pai.cycle'},async function(){
    assert.equal(guard.allow('text',{egress:true}),true);
  });
  assert.equal(guard.allow('text',{egress:true}),true);
  const owners=guard.usageAttribution();
  assert.equal(owners.total,guard.usageToday());
  assert.equal(owners.total,2);
  assert.equal(owners.by_component.reduce((sum,row)=>sum+row.count,0),2);
  assert.equal(owners.by_seat.reduce((sum,row)=>sum+row.count,0),2);
  assert.deepEqual(owners.by_component,[{owner:'pai',count:1},{owner:'unattributed',count:1}]);
  assert.deepEqual(owners.by_seat,[{owner:'c2_organ',count:1},{owner:'unattributed',count:1}]);
  assert.equal(JSON.stringify(owners).includes('HAM.SECRET'),false);
  assert.equal(JSON.stringify(owners).includes('request.secret'),false);
});

test('a fallback attempt reconciles to the canonical seat that owns its wallet',async function(){
  process.env.DAILY_MODEL_CALL_CEIL='100';delete require.cache[path];
  const guard=require(path);
  await guard.withAttribution({seat:'c2_organ.fallback',component:'pai.cycle'},async function(){
    assert.equal(guard.allow('text',{egress:true}),true);
  });
  assert.deepEqual(guard.usageAttribution().by_seat,[{owner:'c2_organ',count:1}]);
});

test('public seat ownership is cardinality bounded with the remainder rolled up',async function(){
  process.env.DAILY_MODEL_CALL_CEIL='100';delete require.cache[path];
  const guard=require(path);
  const names=require('../pai/core/seat.map.js').seatNames();
  for(const seat of names){
    await guard.withAttribution({seat:seat,component:'pai.cycle'},async function(){
      assert.equal(guard.allow('text',{egress:true}),true);
    });
  }
  const rows=guard.usageAttribution().by_seat;
  assert.ok(rows.length<=12);
  assert.equal(rows.reduce((sum,row)=>sum+row.count,0),names.length);
  assert.ok(rows.some(row=>row.owner==='other'),'overflow owners must remain counted');
});
