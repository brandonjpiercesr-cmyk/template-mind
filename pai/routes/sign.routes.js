// ⬡B:routes.sign:MODULE:the_document_signing_portal:20260807⬡
//
// THE SIGNING PORTAL. The founder's ask, 20260807, in his own words: "My team is
// asking for us to do this through DocuSign. I'm obviously not going to do that.
// I think we can build something... They arrive, they indicate who they are, and
// then they sign. It's personalized to them. They fill in details. You got to
// verify that it goes to the right spot."
//
// Three doors, no more:
//   GET  /sign         the portal page a contractor opens: pink smoke, glass,
//                      the full agreement personalized to them, a real
//                      signature, and an executed PDF back in their hands.
//   POST /sign/submit  records the execution durably in this world's memory
//                      bank, then emails the executed PDF to the recipients
//                      configured in env, through the guarded IMAN send path.
//   GET  /sign/verify  the receipt door: proves where a signature will go
//                      (recipients configured, mailbox resolvable, bank and
//                      table reachable) without exposing a full address.
//
// IDENTITY IS ENV-ONLY, the standing law of this repo. No recipient, name, or
// address lives in this file. Configuration:
//   SIGN_NOTIFY_EMAILS        comma separated recipients the executed PDF goes
//                             to. Unset means /sign/submit refuses honestly.
//   SIGN_SENDER_WORLD         which world's Nylas grant sends (default gmg).
//   SIGN_COMPANY_STATE        the company's state of organization blank.
//   SIGN_COMPANY_ENTITY_TYPE  the company's entity type blank.
//   SIGN_GOVERNING_LAW_STATE  the governing law blank.
// An unset company blank renders as an underscored blank, exactly like the
// circulated document, never an invented fact.
//
// Every effect reports its own truth: the submit response says separately
// whether the record landed in the bank and whether the email went, ok:false
// with a reason over a hollow success, and the record is written BEFORE the
// email is attempted so a mail failure can never lose a signature.
'use strict';

var crypto = require('node:crypto');
var brand = require('../core/brand.js');
var signPdf = require('../core/sign.pdf.js');

function bankUrl() { return (process.env.MEMORY_BANK_URL || '').replace(/\/$/, ''); }
function bankKey() { return process.env.MEMORY_BANK_KEY || ''; }
function bankHeaders(write) {
  var h = { apikey: bankKey(), Authorization: 'Bearer ' + bankKey(), 'Accept-Profile': 'memory_bank' };
  if (write) {
    h['Content-Profile'] = 'memory_bank';
    h['Content-Type'] = 'application/json';
    h['Prefer'] = 'return=representation';
  }
  return h;
}

function recipients() {
  return String(process.env.SIGN_NOTIFY_EMAILS || '')
    .split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); });
}

function senderWorld() { return (process.env.SIGN_SENDER_WORLD || 'gmg').trim(); }

function companyFill() {
  return {
    companyState: process.env.SIGN_COMPANY_STATE || '',
    entityType: process.env.SIGN_COMPANY_ENTITY_TYPE || '',
    governingState: process.env.SIGN_GOVERNING_LAW_STATE || ''
  };
}

function maskEmail(addr) {
  var at = String(addr).indexOf('@');
  if (at < 1) return '***';
  var local = addr.slice(0, at), domain = addr.slice(at + 1);
  return local.charAt(0) + '***@' + domain.charAt(0) + '***' + domain.slice(domain.lastIndexOf('.'));
}

function clientIp(req) {
  var fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || '';
}

function str(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
  return s.slice(0, max || 200);
}

// ---------------------------------------------------------------------------
// THE PAGE. One self-contained document: the founder's pink smoke still behind
// a scrim (core/brand.js is the one source; no URL is pasted here), a premium
// glass card, and a three step flow: who you are, the agreement personalized to
// you, then your signature. Every word on it is for the contractor reading it.
function portalHtml() {
  var sections = signPdf.agreementSections(companyFill());
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
  + '<meta name="robots" content="noindex">\n'
  + '<title>' + signPdf.COMPANY_NAME + ' | ' + signPdf.AGREEMENT_TITLE + '</title>\n'
  + '<style>\n'
  + '*{box-sizing:border-box;margin:0;padding:0}\n'
  + 'html,body{min-height:100%}\n'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;'
  + 'color:#f3eef7;background:#08070e;-webkit-font-smoothing:antialiased}\n'
  + brand.stageCss({ scrim: 'rgba(10,6,16,0.66)', zIndex: 0 }) + '\n'
  + '.wrap{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:48px 20px 80px}\n'
  + '.crest{text-align:center;margin-bottom:34px;opacity:0;animation:rise .9s ease .1s forwards}\n'
  + '.crest .org{font-size:12px;letter-spacing:.42em;text-transform:uppercase;color:rgba(243,238,247,.72)}\n'
  + '.crest h1{margin-top:10px;font-size:clamp(26px,4.6vw,40px);font-weight:650;letter-spacing:.01em}\n'
  + '.crest .sub{margin-top:10px;font-size:14.5px;color:rgba(243,238,247,.66)}\n'
  + '.glass{background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.045));'
  + 'border:1px solid rgba(255,255,255,.16);border-radius:24px;'
  + 'box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.14);'
  + 'backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);'
  + 'padding:clamp(24px,4.5vw,44px);opacity:0;animation:rise .9s ease .25s forwards}\n'
  + '@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}\n'
  + '.dots{display:flex;gap:10px;justify-content:center;margin-bottom:28px}\n'
  + '.dots span{width:34px;height:4px;border-radius:2px;background:rgba(255,255,255,.18);transition:background .4s}\n'
  + '.dots span.on{background:linear-gradient(90deg,#f19bd6,#c86bb8)}\n'
  + '.step{display:none}.step.on{display:block;animation:rise .55s ease forwards}\n'
  + 'h2{font-size:21px;font-weight:620;margin-bottom:8px}\n'
  + '.lead{font-size:14.5px;line-height:1.6;color:rgba(243,238,247,.72);margin-bottom:22px}\n'
  + 'label{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,238,247,.6);margin:16px 0 6px}\n'
  + 'input[type=text],input[type=email],input[type=tel]{width:100%;padding:13px 15px;font-size:15.5px;color:#fff;'
  + 'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:12px;outline:none;transition:border .25s,background .25s}\n'
  + 'input:focus{border-color:rgba(241,155,214,.65);background:rgba(255,255,255,.10)}\n'
  + '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}\n'
  + '@media(max-width:600px){.grid2{grid-template-columns:1fr}}\n'
  + '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:26px;padding:14px 30px;'
  + 'font-size:15.5px;font-weight:600;color:#1d0b18;background:linear-gradient(120deg,#f6b6e0,#e07cc4);'
  + 'border:0;border-radius:999px;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 10px 30px rgba(224,124,196,.35)}\n'
  + '.btn:hover{transform:translateY(-1px);box-shadow:0 14px 36px rgba(224,124,196,.45)}\n'
  + '.btn:disabled{opacity:.55;cursor:default;transform:none}\n'
  + '.btn.ghost{background:rgba(255,255,255,.08);color:#f3eef7;border:1px solid rgba(255,255,255,.2);box-shadow:none}\n'
  + '.row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}\n'
  + '.agree{max-height:44vh;overflow-y:auto;padding:22px;margin:6px 0 4px;background:rgba(8,6,14,.5);'
  + 'border:1px solid rgba(255,255,255,.12);border-radius:16px;font-size:14px;line-height:1.68;color:rgba(246,242,250,.88)}\n'
  + '.agree h4{font-size:13.5px;margin:18px 0 6px;color:#fff}\n'
  + '.agree p{margin-bottom:10px}\n'
  + '.agree .note{padding:10px 14px;margin:4px 0 10px;border-left:2px solid rgba(241,155,214,.6);'
  + 'background:rgba(241,155,214,.07);border-radius:0 10px 10px 0;font-style:italic;color:rgba(246,242,250,.78)}\n'
  + '.scrollHint{font-size:12px;color:rgba(243,238,247,.5);margin:8px 2px 0}\n'
  + '.sigTabs{display:flex;gap:8px;margin:6px 0 12px}\n'
  + '.sigTabs button{padding:8px 18px;font-size:13px;border-radius:999px;border:1px solid rgba(255,255,255,.2);'
  + 'background:transparent;color:rgba(243,238,247,.75);cursor:pointer}\n'
  + '.sigTabs button.on{background:rgba(241,155,214,.16);border-color:rgba(241,155,214,.6);color:#fff}\n'
  + '.padWrap{background:#fff;border-radius:14px;overflow:hidden;position:relative}\n'
  + '#pad{display:block;width:100%;height:190px;touch-action:none;cursor:crosshair}\n'
  + '.padLine{position:absolute;left:8%;right:8%;bottom:44px;border-bottom:1.5px solid #cdb8c8;pointer-events:none}\n'
  + '.padX{position:absolute;left:8%;bottom:48px;color:#b39aac;font-size:18px;pointer-events:none}\n'
  + '#typedPreview{font-family:"Snell Roundhand","Segoe Script","Brush Script MT",cursive;font-size:34px;color:#241428;'
  + 'background:#fff;border-radius:14px;min-height:110px;display:flex;align-items:center;justify-content:center;padding:16px}\n'
  + '.consent{display:flex;gap:12px;align-items:flex-start;margin-top:20px;font-size:13.5px;line-height:1.55;color:rgba(243,238,247,.8)}\n'
  + '.consent input{margin-top:3px;width:17px;height:17px;accent-color:#e07cc4}\n'
  + '.err{display:none;margin-top:16px;padding:12px 16px;border-radius:12px;font-size:13.5px;'
  + 'background:rgba(255,86,120,.12);border:1px solid rgba(255,86,120,.4);color:#ffd4de}\n'
  + '.done{text-align:center;padding:14px 0}\n'
  + '.done .seal{width:74px;height:74px;margin:4px auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
  + 'background:radial-gradient(circle at 32% 28%,#f6b6e0,#c05ba6);box-shadow:0 12px 40px rgba(224,124,196,.5);animation:pop .7s cubic-bezier(.2,1.6,.4,1) forwards}\n'
  + '@keyframes pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}\n'
  + '.done .seal svg{width:34px;height:34px}\n'
  + '.fine{font-size:12.5px;line-height:1.6;color:rgba(243,238,247,.55);margin-top:22px}\n'
  + '</style>\n</head>\n<body>\n'
  + brand.stageHtml() + '\n'
  + '<div class="wrap">\n'
  + '<div class="crest"><div class="org">' + signPdf.COMPANY_NAME + '</div>'
  + '<h1>' + signPdf.AGREEMENT_TITLE + '</h1>'
  + '<div class="sub">A few minutes, one signature, and a copy of everything for your records.</div></div>\n'
  + '<div class="glass">\n'
  + '<div class="dots"><span id="d1" class="on"></span><span id="d2"></span><span id="d3"></span></div>\n'

  + '<div class="step on" id="step1">\n'
  + '<h2>First, tell us who you are</h2>\n'
  + '<div class="lead">Your name appears in the agreement itself, so enter it exactly as it reads on your tax documents.</div>\n'
  + '<label for="fullName">Full legal name</label><input id="fullName" type="text" autocomplete="name" maxlength="140">\n'
  + '<label for="email">Email address</label><input id="email" type="email" autocomplete="email" maxlength="140">\n'
  + '<button class="btn" id="toStep2">Continue</button>\n'
  + '<div class="err" id="err1"></div>\n'
  + '</div>\n'

  + '<div class="step" id="step2">\n'
  + '<h2 id="agreeTitle">Your agreement</h2>\n'
  + '<div class="lead">Read it through, then complete your details underneath. If anything is unclear, ask before you sign. We would rather answer a question now than have somebody sign something they did not fully understand.</div>\n'
  + '<div class="agree" id="agreeBody"></div>\n'
  + '<div class="scrollHint">Scroll through the full agreement above.</div>\n'
  + '<div class="grid2">\n'
  + '<div><label for="entityName">Business or entity name, if you will be paid through one</label><input id="entityName" type="text" maxlength="140" placeholder="Optional"></div>\n'
  + '<div><label for="phone">Phone</label><input id="phone" type="tel" autocomplete="tel" maxlength="40"></div>\n'
  + '<div><label for="street">Street address</label><input id="street" type="text" autocomplete="street-address" maxlength="140"></div>\n'
  + '<div><label for="cityStateZip">City, State, ZIP</label><input id="cityStateZip" type="text" maxlength="140"></div>\n'
  + '</div>\n'
  + '<div class="row"><button class="btn ghost" id="back1">Back</button><button class="btn" id="toStep3">Continue to signing</button></div>\n'
  + '<div class="err" id="err2"></div>\n'
  + '</div>\n'

  + '<div class="step" id="step3">\n'
  + '<h2>Sign your agreement</h2>\n'
  + '<div class="lead" id="signLead">Draw your signature below, or switch to typing it.</div>\n'
  + '<div class="sigTabs"><button id="tabDraw" class="on" type="button">Draw</button><button id="tabType" type="button">Type</button></div>\n'
  + '<div id="drawBox"><div class="padWrap"><canvas id="pad"></canvas><div class="padLine"></div><div class="padX">&#10007;</div></div>\n'
  + '<div class="row" style="margin-top:10px"><button class="btn ghost" id="clearPad" type="button">Clear</button></div></div>\n'
  + '<div id="typeBox" style="display:none"><div id="typedPreview">&nbsp;</div>'
  + '<label for="typedName">Type your full name as your signature</label><input id="typedName" type="text" maxlength="140"></div>\n'
  + '<div class="consent"><input type="checkbox" id="consent"><span>I agree that my electronic signature is the legal equivalent of my handwritten signature, that I intend to be bound by this Agreement, and that I have read it in full.</span></div>\n'
  + '<div class="row"><button class="btn ghost" id="back2">Back</button><button class="btn" id="submitBtn">Sign the agreement</button></div>\n'
  + '<div class="err" id="err3"></div>\n'
  + '</div>\n'

  + '<div class="step" id="step4">\n'
  + '<div class="done">\n'
  + '<div class="seal"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="#2a0f22" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>\n'
  + '<h2 id="doneTitle">You are all set</h2>\n'
  + '<div class="lead" id="doneLead">Your signed agreement has been recorded and delivered to ' + signPdf.COMPANY_NAME + '.</div>\n'
  + '<button class="btn" id="downloadBtn">Download your signed copy</button>\n'
  + '<div class="fine">One more thing for your records: no payment can be issued without an IRS Form W-9 on file. You can download a blank W-9 at irs.gov, complete it, and send it to your ' + signPdf.COMPANY_NAME + ' contact so it is ready ahead of time.</div>\n'
  + '</div></div>\n'

  + '</div>\n'
  + '<div class="fine" style="text-align:center">Signed electronically under Section 12.6 of the Agreement. Your details are used only to complete this document.</div>\n'
  + '</div>\n'
  + '<script>window.__SECTIONS=' + JSON.stringify(sections).replace(/</g, '\\u003c') + ';</script>\n'
  + '<script>(function(){\n'
  // The founder's still: pink smoke only on this door, from the one approved
  // roster core/brand.js serves. The stage markup and ken burns drift are the
  // same treatment as every other door in this world.
  + 'var el=document.getElementById("bgLayer");if(el){el.onload=function(){el.classList.add("on")};'
  + 'el.src=' + JSON.stringify(brand.DEFAULT_BACKGROUND.url) + ';'
  + 'if(el.complete&&el.naturalWidth)el.classList.add("on");}\n'
  + 'var state={name:"",email:""};\n'
  + 'function $(id){return document.getElementById(id)}\n'
  + 'function showErr(id,msg){var e=$(id);e.textContent=msg;e.style.display="block"}\n'
  + 'function hideErr(id){$(id).style.display="none"}\n'
  + 'function goto(n){[1,2,3,4].forEach(function(i){$("step"+i).classList.toggle("on",i===n);var d=$("d"+Math.min(i,3));if(d)d.classList.toggle("on",i<=n)});window.scrollTo({top:0,behavior:"smooth"})}\n'
  + 'function renderAgreement(){var box=$("agreeBody");box.textContent="";window.__SECTIONS.forEach(function(s,i){\n'
  + 'if(s.heading){var h=document.createElement("h4");h.textContent=s.heading;box.appendChild(h)}\n'
  + 's.paragraphs.forEach(function(t){var p=document.createElement("p");\n'
  + 'if(i===0&&state.name){t=t.replace("the individual identified below",state.name)}\n'
  + 'p.textContent=t;box.appendChild(p)});\n'
  + 'if(s.note){var n=document.createElement("p");n.className="note";n.textContent="Plain language: "+s.note;box.appendChild(n)}})}\n'
  + '$("toStep2").onclick=function(){var name=$("fullName").value.trim(),email=$("email").value.trim();\n'
  + 'if(name.length<3){showErr("err1","Please enter your full legal name.");return}\n'
  + 'if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){showErr("err1","Please enter a valid email address.");return}\n'
  + 'hideErr("err1");state.name=name;state.email=email;\n'
  + '$("agreeTitle").textContent="Your agreement, "+name.split(" ")[0];\n'
  + '$("signLead").textContent="Sign as "+name+". Draw your signature below, or switch to typing it.";\n'
  + 'renderAgreement();goto(2)};\n'
  + '$("back1").onclick=function(){goto(1)};\n'
  + '$("toStep3").onclick=function(){\n'
  + 'if(!$("street").value.trim()||!$("cityStateZip").value.trim()){showErr("err2","Please complete your street address and city, state, ZIP.");return}\n'
  + 'if(!$("phone").value.trim()){showErr("err2","Please enter your phone number.");return}\n'
  // The pad sizes itself from its rendered box, and the box is display:none
  // until this step opens, so the sizing runs on entry rather than at load.
  + 'hideErr("err2");goto(3);setTimeout(function(){if(!drawn)sizePad()},50)};\n'
  + '$("back2").onclick=function(){goto(2)};\n'
  // Signature pad. White ground first, always: a JPEG export of an unpainted
  // canvas turns transparent pixels black.
  + 'var pad=$("pad"),ctx=pad.getContext("2d"),drawn=false,drawing=false,last=null,mode="draw";\n'
  + 'function sizePad(){var r=pad.getBoundingClientRect(),d=window.devicePixelRatio||1;pad.width=Math.round(r.width*d);pad.height=Math.round(190*d);ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle="#fff";ctx.fillRect(0,0,r.width,190);ctx.lineWidth=2.2;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#241428";drawn=false}\n'
  + 'function pos(ev){var r=pad.getBoundingClientRect();var t=ev.touches?ev.touches[0]:ev;return{x:t.clientX-r.left,y:t.clientY-r.top}}\n'
  + 'function down(ev){drawing=true;last=pos(ev);ev.preventDefault()}\n'
  + 'function move(ev){if(!drawing)return;var p=pos(ev);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;drawn=true;ev.preventDefault()}\n'
  + 'function up(){drawing=false}\n'
  + 'pad.addEventListener("pointerdown",down);pad.addEventListener("pointermove",move);window.addEventListener("pointerup",up);\n'
  + '$("clearPad").onclick=function(){sizePad()};\n'
  + 'window.addEventListener("resize",function(){if(mode==="draw"&&!drawn)sizePad()});\n'
  + 'setTimeout(sizePad,60);\n'
  + '$("tabDraw").onclick=function(){mode="draw";this.classList.add("on");$("tabType").classList.remove("on");$("drawBox").style.display="";$("typeBox").style.display="none";setTimeout(sizePad,30)};\n'
  + '$("tabType").onclick=function(){mode="type";this.classList.add("on");$("tabDraw").classList.remove("on");$("drawBox").style.display="none";$("typeBox").style.display="";$("typedName").value=$("typedName").value||state.name;$("typedPreview").textContent=$("typedName").value||"\\u00a0"};\n'
  + '$("typedName").addEventListener("input",function(){$("typedPreview").textContent=this.value||"\\u00a0"});\n'
  + 'var resultPdf=null;\n'
  + '$("submitBtn").onclick=function(){var btn=this;hideErr("err3");\n'
  + 'if(!$("consent").checked){showErr("err3","Please confirm the signature consent box to continue.");return}\n'
  + 'var payload={fullLegalName:state.name,email:state.email,entityName:$("entityName").value.trim(),street:$("street").value.trim(),cityStateZip:$("cityStateZip").value.trim(),phone:$("phone").value.trim(),consent:true,clientDate:new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})};\n'
  + 'if(mode==="draw"){if(!drawn){showErr("err3","Please draw your signature, or switch to typing it.");return}\n'
  + 'payload.signatureJpegBase64=pad.toDataURL("image/jpeg",0.92).split(",")[1]}\n'
  + 'else{var t=$("typedName").value.trim();if(t.length<3){showErr("err3","Please type your full name as your signature.");return}payload.typedSignature=t}\n'
  + 'btn.disabled=true;btn.textContent="Signing...";\n'
  + 'fetch("/sign/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})\n'
  + '.then(function(r){return r.json()}).then(function(res){\n'
  + 'btn.disabled=false;btn.textContent="Sign the agreement";\n'
  + 'if(!res||res.ok!==true){showErr("err3",(res&&res.message)||"Something went wrong while signing. Please try again.");return}\n'
  + 'resultPdf=res.pdf_base64||null;\n'
  + '$("doneTitle").textContent="You are all set, "+state.name.split(" ")[0];\n'
  + 'if(res.emailed&&res.emailed.ok!==true){$("doneLead").textContent="Your signed agreement has been recorded. Delivery to the team is still in progress, and your download below is your executed copy."}\n'
  + 'goto(4)})\n'
  + '.catch(function(){btn.disabled=false;btn.textContent="Sign the agreement";showErr("err3","We could not reach the signing service. Please check your connection and try again.")})};\n'
  + '$("downloadBtn").onclick=function(){if(!resultPdf)return;\n'
  + 'var bin=atob(resultPdf),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);\n'
  + 'var blob=new Blob([arr],{type:"application/pdf"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);\n'
  + 'a.download="' + signPdf.COMPANY_NAME.replace(/ /g, '_') + '_Independent_Contractor_Agreement_Signed.pdf";a.click()};\n'
  + '})();</script>\n'
  + '</body>\n</html>';
}

// ---------------------------------------------------------------------------
module.exports = function mountSignRoutes(app) {

  app.get('/sign', function (req, res) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(portalHtml());
  });

  app.post('/sign/submit', async function (req, res) {
    try {
      var b = req.body || {};
      var fullLegalName = str(b.fullLegalName, 140);
      var email = str(b.email, 140);
      var street = str(b.street, 140);
      var cityStateZip = str(b.cityStateZip, 140);
      var phone = str(b.phone, 40);
      var entityName = str(b.entityName, 140);
      var typedSignature = str(b.typedSignature, 140);
      var signatureJpegBase64 = typeof b.signatureJpegBase64 === 'string' ? b.signatureJpegBase64.replace(/^data:image\/jpeg;base64,/, '') : '';

      if (b.consent !== true) return res.status(400).json({ ok: false, reason: 'consent_required', message: 'The signature consent box was not confirmed.' });
      if (fullLegalName.length < 3) return res.status(400).json({ ok: false, reason: 'name_required', message: 'Please enter your full legal name.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, reason: 'email_invalid', message: 'Please enter a valid email address.' });
      if (!street || !cityStateZip) return res.status(400).json({ ok: false, reason: 'address_required', message: 'Please complete your address.' });
      if (!phone) return res.status(400).json({ ok: false, reason: 'phone_required', message: 'Please enter your phone number.' });
      if (signatureJpegBase64 && signatureJpegBase64.length > 700000) return res.status(400).json({ ok: false, reason: 'signature_too_large', message: 'The drawn signature is too large. Please clear the pad and sign again.' });
      if (!signatureJpegBase64 && typedSignature.length < 3) return res.status(400).json({ ok: false, reason: 'signature_required', message: 'Please draw or type your signature.' });

      var notify = recipients();
      if (!notify.length) return res.status(503).json({ ok: false, reason: 'no_recipients_configured', message: 'The signing service is not fully configured yet. Please let your contact know.' });

      var fill = Object.assign({
        contractorName: fullLegalName,
        entityName: entityName,
        street: street,
        cityStateZip: cityStateZip,
        email: email,
        phone: phone
      }, companyFill());

      var recordId = crypto.randomUUID();
      var signedAt = new Date();
      var agreementSha = signPdf.agreementSha256(fill);
      var ip = clientIp(req);
      var userAgent = str(req.headers['user-agent'], 300);

      var pdf = signPdf.buildExecutedPdf({
        fill: fill,
        signatureJpegBase64: signatureJpegBase64 || null,
        typedSignature: typedSignature || null,
        signedAtIso: signedAt.toISOString(),
        signedAtDate: str(b.clientDate, 60) || signedAt.toISOString().slice(0, 10),
        recordId: recordId,
        ip: ip,
        userAgent: userAgent,
        agreementSha256: agreementSha
      });
      var pdfSha = crypto.createHash('sha256').update(pdf).digest('hex');

      // 1. THE RECORD, before any email, so a mail failure can never lose a
      // signature. It lands in THIS world's memory bank, env-addressed.
      var recorded = { ok: false, reason: 'bank_not_configured' };
      if (bankUrl() && bankKey()) {
        try {
          var ins = await fetch(bankUrl() + '/rest/v1/signing_records', {
            method: 'POST',
            headers: bankHeaders(true),
            body: JSON.stringify({
              id: recordId,
              ham_uid: (process.env.HAM_UID || '').toUpperCase() || 'UNBOUND',
              agreement_key: signPdf.AGREEMENT_KEY,
              signer: { full_legal_name: fullLegalName, entity_name: entityName || null, street: street, city_state_zip: cityStateZip, email: email, phone: phone },
              signature_jpeg_base64: signatureJpegBase64 || null,
              typed_signature: typedSignature || null,
              agreement_sha256: agreementSha,
              pdf_sha256: pdfSha,
              ip: ip,
              user_agent: userAgent,
              signed_at: signedAt.toISOString()
            })
          });
          recorded = ins.ok ? { ok: true } : { ok: false, reason: 'bank_insert_failed_' + ins.status, detail: (await ins.text().catch(function () { return ''; })).slice(0, 200) };
        } catch (eIns) {
          recorded = { ok: false, reason: 'bank_unreachable', detail: String(eIns.message || '').slice(0, 200) };
        }
      }

      // 2. THE DELIVERY, through the guarded IMAN path (council, kill switch,
      // attachment manifest inside the claim), never a raw provider call.
      var emailed = { ok: false, reason: 'not_attempted' };
      try {
        var subject = 'Signed: ' + signPdf.AGREEMENT_TITLE + ', ' + fullLegalName;
        var body = fullLegalName + ' signed the ' + signPdf.COMPANY_NAME + ' ' + signPdf.AGREEMENT_TITLE
          + ' on ' + signedAt.toUTCString() + '.\n\n'
          + 'The executed copy is attached as a PDF, including the contractor details, the signature, and the signing certificate.\n\n'
          + 'Signer email: ' + email + '\nSigner phone: ' + phone + '\nRecord ID: ' + recordId + '\n\n'
          + 'The same record is stored durably in the world memory bank under signing_records.';
        emailed = await require('../reach/iman.js').send(notify, subject, body, senderWorld(), {
          hamUid: process.env.HAM_UID || '',
          attachments: [{
            filename: signPdf.COMPANY_NAME.replace(/ /g, '_') + '_Independent_Contractor_Agreement_' + fullLegalName.replace(/[^A-Za-z0-9]+/g, '_') + '.pdf',
            content_type: 'application/pdf',
            base64: pdf.toString('base64')
          }]
        });
      } catch (eMail) {
        emailed = { ok: false, reason: 'send_threw', detail: String(eMail.message || '').slice(0, 200) };
      }

      // 3. THE RECEIPT, back onto the record, so the row itself says whether
      // delivery happened rather than leaving that truth only in a response body.
      if (recorded.ok) {
        try {
          await fetch(bankUrl() + '/rest/v1/signing_records?id=eq.' + encodeURIComponent(recordId), {
            method: 'PATCH',
            headers: bankHeaders(true),
            body: JSON.stringify({ email_receipt: { ok: emailed.ok === true, reason: emailed.ok === true ? null : (emailed.reason || 'unknown'), message_id: emailed.messageId || null, at: new Date().toISOString() } })
          });
        } catch (ePatch) { /* the response below still carries the truth */ }
      }

      // ok:true requires at least one durable effect. A signature that reached
      // neither the bank nor the recipients exists only in the signer's browser,
      // and calling that success would be the hollow reply this estate refuses.
      if (recorded.ok !== true && emailed.ok !== true) {
        return res.status(502).json({
          ok: false,
          reason: 'nothing_durable',
          recorded: recorded,
          emailed: { ok: false, reason: emailed.reason || 'unknown' },
          message: 'We could not record your signature just now. Nothing was lost on your side. Please try again in a moment.'
        });
      }
      res.json({
        ok: true,
        recordId: recordId,
        recorded: recorded,
        emailed: emailed.ok === true ? { ok: true, messageId: emailed.messageId || null } : { ok: false, reason: emailed.reason || 'unknown' },
        pdf_base64: pdf.toString('base64')
      });
    } catch (e) {
      res.status(500).json({ ok: false, reason: 'submit_failed', message: 'Something went wrong while signing. Please try again.', detail: String(e.message || '').slice(0, 200) });
    }
  });

  // The receipt door. "You got to verify that it goes to the right spot": this
  // proves the destination configuration live, addresses masked, no secret out.
  app.get('/sign/verify', async function (req, res) {
    var notify = recipients();
    var world = senderWorld();
    var grantConfigured = false;
    try { grantConfigured = !!require('../reach/iman.js').resolveGrant(world); } catch (e) { grantConfigured = false; }
    var bank = { configured: !!(bankUrl() && bankKey()), table_reachable: false };
    if (bank.configured) {
      try {
        var probe = await fetch(bankUrl() + '/rest/v1/signing_records?select=id&limit=1', { headers: bankHeaders(false) });
        bank.table_reachable = probe.ok;
        if (!probe.ok) bank.detail = 'status_' + probe.status;
      } catch (eProbe) { bank.detail = 'unreachable'; }
    }
    var ok = notify.length > 0 && grantConfigured && bank.configured && bank.table_reachable;
    res.status(ok ? 200 : 503).json({
      ok: ok,
      recipients: { configured: notify.length, masked: notify.map(maskEmail) },
      sender_world: world,
      sender_grant_configured: grantConfigured,
      bank: bank,
      world: (process.env.HAM_UID || '').toUpperCase() || 'unbound'
    });
  });
};
