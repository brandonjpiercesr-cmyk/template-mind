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

test('unset ceilings use safe defaults while values above hard maxima close',function(){
  delete process.env.DAILY_MODEL_CALL_CEIL;delete process.env.DAILY_IMAGE_CALL_CEIL;
  let guard=require(path);assert.equal(guard._test.configuredCeil('text'),1500);
  assert.equal(guard._test.configuredCeil('image'),300);
  process.env.DAILY_MODEL_CALL_CEIL='10001';process.env.DAILY_IMAGE_CALL_CEIL='2001';
  assert.equal(guard._test.configuredCeil('text'),10000,'one over the maximum clamps, it does not mute');
  assert.equal(guard._test.configuredCeil('image'),2000);
  assert.equal(guard._test.ceilDetail('text').source,'env_clamped');
  assert.equal(guard._test.ceilDetail('text').requested,10001);
});

test('a digit run too long to be an exact number still clamps, it does not mute',function(){
  // The reviewer caught this: rejecting for imprecision reintroduced the exact mute the
  // clamp exists to remove. Every positive integer that cannot be represented exactly is
  // necessarily above the maximum, so size decides and precision is irrelevant.
  process.env.DAILY_MODEL_CALL_CEIL='999999999999999999999';delete require.cache[path];
  const guard=require(path);
  assert.equal(guard._test.configuredCeil('text'),10000);
  assert.equal(guard._test.ceilDetail('text').source,'env_clamped');
  assert.equal(guard._test.ceilDetail('text').requested,null,'an inexact number is never reported as exact');
  assert.equal(guard.allow('text'),true,'she speaks');
});

test('a blank or whitespace ceiling means nobody chose, not a typo',function(){
  process.env.DAILY_MODEL_CALL_CEIL='   ';delete require.cache[path];
  const guard=require(path);
  assert.equal(guard._test.configuredCeil('text'),1500);
  assert.equal(guard._test.ceilDetail('text').source,'built_in_default');
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
