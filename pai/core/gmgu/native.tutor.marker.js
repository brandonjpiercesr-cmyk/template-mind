'use strict';

const MARKER=Symbol('anew.gmgu.native.tutor');

function bind(identity,hamUid,requestId){
  if(!identity||typeof identity!=='object')return false;
  const ham=String(hamUid||'').trim().toUpperCase();
  const request=String(requestId||'').trim();
  if(!ham||String(identity.uid||'').trim().toUpperCase()!==ham||
      !request||String(identity.request_id||'').trim()!==request)return false;
  Object.defineProperty(identity,MARKER,{enumerable:false,configurable:false,
    writable:false,value:Object.freeze({ham_uid:ham,request_id:request})});
  return true;
}

function verify(identity,hamUid){
  const proof=identity&&identity[MARKER];
  return !!(proof&&proof.ham_uid===String(hamUid||'').trim().toUpperCase()&&
    proof.request_id===String(identity.request_id||'').trim());
}

module.exports={bind:bind,verify:verify};
