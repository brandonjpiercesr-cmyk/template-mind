// ⬡B:tests.synthesize_projection:TEST:no_detached_paid_memory_classifier:20260725⬡
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('synthesis cannot launch detached provider calls or brain writes',function(){
  const source=fs.readFileSync(path.join(__dirname,'..','pai','core','synthesize.js'),'utf8');
  assert.doesNotMatch(source,/TOGETHER_API_KEY|RUNPOD_API_KEY|ANTHROPIC_API_KEY/);
  assert.doesNotMatch(source,/callOrnith|keepGiftedMemory|stampMinutes|\bfetch\s*\(/);
  assert.doesNotMatch(source,/process\.env\.(?:AIBE_BRAIN|MEMORY_BANK)|memory\.gifted/);
});

test('memory gifts remain a governed PAI effect after detached classifier retirement',function(){
  const loop=fs.readFileSync(path.join(__dirname,'..','pai','core','tool.loop.js'),'utf8');
  const fcw=fs.readFileSync(path.join(__dirname,'..','pai','core','fcw.builder.js'),'utf8');
  assert.match(loop,/write_to_brain:true/);
  assert.match(loop,/phase:\s*'commit'/);
  assert.match(fcw,/Use write_to_brain immediately/);
});

test('low trust PAM distinguishes collective accountability from financial details',function(){
  const synth=require(path.join(__dirname,'..','pai','core','synthesize.js'));
  const ordinary=synth.pamGate(
    'Collective accountability names an owner and the next visible step.',0);
  assert.equal(ordinary.gated,false,
    'accountability is ordinary lesson language, not an account record');

  for(const sensitive of [
    'The account record contains private information.',
    'A bank record contains private information.',
    'The balance is $4250.',
    'An SSN is private information.',
    'A social security number is private information.'
  ]){
    const held=synth.pamGate(sensitive,0);
    assert.equal(held.gated,true,'low trust PAM must still hold: '+sensitive);
    assert.equal(held.reason,'sensitive_content_below_trust5');
  }
});
