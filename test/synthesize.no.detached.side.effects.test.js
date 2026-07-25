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
