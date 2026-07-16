// ⬡B:agents.ham-contact:MODULE:real_brain:20260624⬡
'use strict';
// ⬡B:agents.ham-contact:WIRE:funneled_20260712⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}

function founderEnvironmentContact(hamUid){
  var founder=String(process.env.FOUNDER_HAM_UID||process.env.OVERSEER_HAM_UID||'').trim().toUpperCase();
  if(!founder||String(hamUid||'').trim().toUpperCase()!==founder)return null;
  var phone=process.env.FOUNDER_PHONE||process.env.BRANDON_PHONE||'';
  var email=process.env.FOUNDER_EMAIL||process.env.BRANDON_EMAIL||'';
  if(!phone&&!email)return null;
  return{phone:phone,email:email,name:process.env.FOUNDER_NAME||process.env.BRANDON_NAME||null,
    world:process.env.FOUNDER_WORLD||null};
}

async function getContact(hamUid){
  var fallback=founderEnvironmentContact(hamUid);
  if (!_bu() || !_bk()) return fallback;
  var source=encodeURIComponent('ham.'+String(hamUid||'').trim().toUpperCase()+'.contact');
  var r=await fetch(_bu() + '/rest/v1/' + _tbl() + '?source=eq.'+source+'&limit=1',
    {headers:{'apikey': _bk(),'Authorization':'Bearer ' + _bk(),'Accept-Profile':_schema()}}).then(function(x){return x.json();}).catch(function(){return[];});
  if(!r||!r[0]) return fallback;
  try{
    var contact=JSON.parse(r[0].content||'{}');
    return contact&&(contact.phone||contact.email)?contact:fallback;
  }catch(e){return fallback;}
}
async function stampContact(hamUid,email,phone,name,world){
  var BU=process.env.AIBE_BRAIN_URL,BK=process.env.AIBE_BRAIN_KEY;
  if (!_bu() || !_bk()) return {ok:false};
  var uid=String(hamUid||'').trim().toUpperCase();
  var bead={stamp_type:'DIRECTIVE',source:'ham.'+uid+'.contact',ham_uid:uid,agent_global:'SYSTEM',importance:10,
    acl_stamp:'B:ham.'+uid+'.contact:DIRECTIVE:reach:20260624',
    summary:'HAM contact for '+uid,content:JSON.stringify({email:email,phone:phone,name:name,world:world||null})};
  var r=await fetch(_bu() + '/rest/v1/' + _tbl() + '',{method:'POST',headers:{'apikey': _bk(),'Authorization':'Bearer ' + _bk(),'Content-Type':'application/json','Accept-Profile':_schema(),'Content-Profile':_schema(),'Prefer':'return=minimal'},body:JSON.stringify(bead)}).catch(function(){return null;});
  return {ok:!!(r&&r.ok)};
}
module.exports={getContact,stampContact,_test:{founderEnvironmentContact}};
