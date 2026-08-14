// ⬡B:core.brand:MODULE:one_source_for_backgrounds_and_the_real_mark:20260727⬡
//
// THE FOUNDER ORDER, 20260727, in his own words:
//   "Where's my backgrounds at? There should never be any portal or any page that doesn't
//    have my backgrounds. Like, not even sign in page."
//   "I want my real logo... it used to be called ABA conscious. Now it's called maybe
//    A NU conscious. I find it ridiculous that we still don't have the right logo."
//
// He answered the priority question himself: immersion belongs at frame ONE. The signed-in
// portal already carries the real photographic set and looks right. Every door BEFORE it was
// painting a flat gradient over black. This module is the one place a pre-authentication
// surface reads the real set and the real mark from, so raising one door raises them all.
//
// MEASURED 20260727, before this file existed:
//   GET https://anu-anew.com/          200, zero i.imgur.com references, body #0b0a12
//   GET https://anu-anew.com/deck      200, zero i.imgur.com references, body #08080f
//   GET https://anu-anew.com/advisors  200, thirteen i.imgur.com references, correct
// The design was never missing. It was applied after sign-in and nowhere before it.
//
// ---------------------------------------------------------------------------------------
// THE BACKGROUNDS. THE APPROVED SET, AND IT IS SHORT ON PURPOSE.
//
// ⬡B:core.brand:LAW:only_the_founder_approved_backgrounds_render_anywhere:20260728⬡
//
// THE FOUNDER ORDER, 20260728, in his own words, after seeing the old rotation on his own
// front doors:
//   "Those are not my backgrounds. We should always be using pink smoke, wet city, and
//    probably beach. I don't want to see anything other than that because I'm working on
//    getting us some real cinematic backgrounds that we can animate. But I really shouldn't
//    be seeing any of this other shit. ... It damn sure ain't no galaxy or no vortex or any
//    of that."
//
// What stood here until today was a thirteen-image mirror of the upstream ccwa-core set,
// carried on the argument that upstream was the source of record so this file could not
// question it. That argument is retired. Upstream is the source of record for what the URLS
// ARE. The founder is the source of record for WHICH ONES RENDER. Those are two different
// authorities and this file had been letting the first one answer the second.
//
// HOW THE SET WAS DECIDED, because he does not make technical calls and this one was left to
// the coder. He named three and said "maybe there's like one or two more that look really
// really good", so the rule applied was: keep his three by name, then admit only images that
// are genuinely photographic and cinematic, and cut everything else. Every one of the fifteen
// URLs in this repo was FETCHED AND LOOKED AT before the call rather than judged from its id,
// because several ids describe their image badly. See 'mountain-snow' below.
//
// KEPT, five:
//   pink-smoke     his, by name. Pink ink blooming in dark water, deep magenta on near black.
//   wet-city       his, by name. Neon reflected in a puddle on wet night asphalt.
//   beach          his, by name. Sea stacks and surf at dusk under a violet and teal sky.
//   glass-windows  one of the "one or two more". Rain on a window with neon bokeh behind it.
//                  The same night-and-neon photography as wet-city and it sits beside it
//                  cleanly rather than changing the mood when the rotation turns.
//   mountain-snow  the other. A fog-filled evergreen valley under low cloud, blue-grey, reads
//                  like a film still. NOTE the id is inherited from upstream and is wrong
//                  about the picture: there is no snow and no summit in it. The id is kept
//                  verbatim anyway, because the ALIVE SPA resolves BY ID and renaming it here
//                  would break that lookup rather than fix anything.
//
// CUT, ten, and why each one goes:
//   nebula          a deep-space nebula. He named galaxies specifically.
//   black-landscape a night crater lake, so close to pure black that under the scrim below it
//                   paints an empty page. Photographic, but it is not a background, it is the
//                   absence of one.
//   storm-clouds    dark thunderhead with lightning. This is the dark churning smoke he saw
//                   in his screenshots and said was not his.
//   motion          dark ink tendrils on black. Same capture technique as pink-smoke and the
//                   opposite result: murky and colourless. The abstract shape he rejected.
//   particle-lights purple bokeh dots on black, which reads as a starfield. Galaxy family.
//   embers          an orange blur. No subject at all, a pure abstract wash.
//   unity           not a photograph. An illustrated poster with the words SOLIDARITY,
//                   EQUALITY and FREEDOM set into the artwork. A background carrying its own
//                   headline will always fight the page's real headline.
//   three-goats     not a background either. A basketball poster of three named athletes with
//                   team and footwear marks and the words GOAT, MAMBA and KING burned in.
//                   Third-party likeness and trademark, on a template that ships to strangers
//                   as every new world's first paint. This one was never shippable on any
//                   grounds, aesthetic or otherwise.
//   A44TxCq         a black hole and its accretion disk. Literally the vortex he named.
//   NOXQ3aM         aurora seen from orbit. Space again.
// The last two never had ids. They were loose URLs in chat, three-ray and budget only.
//
// THE URLS THEMSELVES ARE STILL NOT INVENTED. Every one of the five below is copied verbatim
// from aba-shared/packages/ccwa-core/src/backgrounds.js, stamped
// ⬡B:aba_shared.ccwa_core.backgrounds:CONST:imgur_canonical_set:20260503⬡. That package is a
// separate repo shipping ESM, so this service cannot require across the estate boundary. What
// changed today is the length of the list, never a URL. Never Unsplash, never an invented URL.
//
// ADDING THE ANIMATED CINEMATIC SET HE IS PRODUCING: append entries to BACKGROUNDS below and
// nothing else in this repo changes. That is the entire edit. Every surface in this service
// reads this one array, and tests/founder.backgrounds.only.test.js derives its allowlist from
// it, so the guard accepts a new background the moment it appears here and not before. If they
// arrive as video rather than stills, stageCss/stageHtml/stageBootJs in this same file are
// where the <img> becomes a <video>, again in one place.
//
// ONE SURFACE THIS MODULE CANNOT REACH, said plainly rather than left to be discovered: GET
// /alive is a proxy (routes/alive.portal.proxy.routes.js) onto a compiled SPA at ALIVE_ORIGIN,
// built from the ccwa-core repo, and its thirteen URLs are baked into that bundle. The proxy
// now injects a firewall that swaps an unapproved image for an approved one in the browser,
// which is real and verifiable, but the permanent fix is one edit to backgrounds.js in the
// ccwa-core repo. That edit is not in this repo and this lane did not have it.
//
// ---------------------------------------------------------------------------------------
// THE MARK. ALSO NOT INVENTED, AND ALREADY IN THIS REPO.
//
// The thing he calls "ABA conscious" and now "A'NU conscious" is not an image file. It is a
// canvas animation, and routes/os.presence.routes.js already carries a faithful port of it
// into this service, served at GET /os/presence.js as window.AnuPresence. That file's own
// header records the founder correction of 20260710: "a flat CSS circle is never her. This
// file exists so no surface ever paints one again." The pre-auth doors were painting exactly
// that. They now load the real one.
//
// The lineage, for anyone who needs to verify it rather than trust it:
//   oneaba-source/apps/shell/src/components/aba/ABAConsciousness.jsx   the original, whose
//     header carries the spec in his voice: "LIKE ENERGY INSIDE OF ENERGY! LIFE MOVING
//     ABSTRACT" and "NO SPHERE NO CIRCLE NO DOTS!!!!!!!!", and which exports the logo API
//     itself as ABALogoSmall/Medium/Large/Hero. The logo IS the component.
//   routes/os.presence.routes.js                                      the port, live here
//   oneaba-source/apps/shell/src/config/theme.constants.js:124         the standing rule:
//     "Never use static icon for main displays. Always use ABAConsciousness."
//
// So the living mark is what a main display gets. The static PNG below is the sanctioned
// flattened frame of the same artwork and is used only where a canvas cannot go, which in
// practice means the favicon. Both are the real assets, neither is a placeholder, and this
// module never falls back to drawing a circle.
'use strict';

// THE APPROVED SET. This array is the only place in this service that decides what a person
// sees behind anything. Ordered as he said them: his three first, then the two that earned
// their place. Adding his animated cinematic set is an append here and nowhere else.
var BACKGROUNDS = [
  { id: 'pink-smoke',    name: 'Pink Smoke',    url: 'https://i.imgur.com/3RkebB2.jpeg' },
  { id: 'wet-city',      name: 'Wet City',      url: 'https://i.imgur.com/h8zNCw1.jpeg' },
  { id: 'beach',         name: 'Beach',         url: 'https://i.imgur.com/YaH4lbp.jpeg' },
  { id: 'glass-windows', name: 'Glass Windows', url: 'https://i.imgur.com/Kjjs7nt.jpeg' },
  { id: 'mountain-snow', name: 'Mountain Snow', url: 'https://i.imgur.com/7Ffjcy2.png'  }
];

var BACKGROUND_URLS = BACKGROUNDS.map(function (b) { return b.url; });
var BACKGROUND_IDS = BACKGROUNDS.map(function (b) { return b.id; });

// The one background a surface paints when it needs exactly one and has no reason to prefer
// another. His first-named. A caller that wants a fixed still rather than a rotation reads
// this instead of pasting a URL, which is how the pasted copies got out of hand in the first
// place.
var DEFAULT_BACKGROUND = BACKGROUNDS[0];

// The refusal side of the same one source. tests/founder.backgrounds.only.test.js scans the
// repo with these rather than a list of its own, so the guard can never disagree with the
// roster: change the roster and the guard changes with it in the same commit.
function isApprovedBackgroundUrl(url) {
  return BACKGROUND_URLS.indexOf(String(url || '').trim()) !== -1;
}

function isApprovedBackgroundId(id) {
  return BACKGROUND_IDS.indexOf(String(id || '').trim()) !== -1;
}

// Given anything a surface or an upstream bundle offers, return something approved. An
// approved input is returned untouched; anything else becomes the default rather than
// rendering. Used by the /alive proxy firewall and by any surface handed a background id it
// did not choose itself, so that an unapproved value degrades to his own image instead of
// painting what he rejected or leaving a hole.
function approvedUrlOr(url, fallbackUrl) {
  if (isApprovedBackgroundUrl(url)) return String(url).trim();
  return isApprovedBackgroundUrl(fallbackUrl) ? String(fallbackUrl).trim() : DEFAULT_BACKGROUND.url;
}

// The living mark, served by routes/os.presence.routes.js. Same-origin on both the face and
// the mind, so a pre-auth page can load it without a cross-origin hop and without a key.
var PRESENCE_SRC = '/os/presence.js';

// The sanctioned flattened frame of the same artwork, ABA_LOGO_STATIC in ccwa-core. Favicon
// only: a canvas cannot render into a tab icon. Verified 200 image/png, 1024x1024.
var MARK_STATIC_URL = 'https://i.imgur.com/0be7HCF.png';

// The Envolve, Inc. company logo, ENVOLVE_LOGO in ccwa-core. Verified 200 image/png. Kept
// here so the name is resolvable from one place rather than pasted, and so a surface that
// needs the company mark rather than her presence has somewhere real to read it from.
var ENVOLVE_LOGO_URL = 'https://i.imgur.com/I2F4EWs.png';

// ---------------------------------------------------------------------------------------
// THE BACKGROUND STAGE.
//
// The treatment is the one already proven on /advisors and on the signed-in portal: a photo
// layer under a scrim, cross faded on a slow interval with a ken burns drift. Copied in
// behaviour so a guest crossing from a pre-auth door into their world does not see the look
// change under them. Three parts because a caller has to place them in three places, and
// they are returned as strings rather than written into a template so that a surface built
// out of string concatenation and a surface built out of a static file can both use them.

function stageCss(opts) {
  opts = opts || {};
  // The scrim is what keeps text legible over a photograph. It is deliberately heavier than
  // the portal's, because these doors carry a form rather than a conversation and an input
  // field has to stay readable against every one of the thirteen.
  var scrim = opts.scrim || 'rgba(8,7,14,0.62)';
  // zIndex is an option and not a constant because the two kinds of caller need different
  // answers. A door built out of string concatenation owns its own stacking and raises its
  // content to 1, so 0 is right there. A static file adopted from the outside cannot be
  // trusted to have positioned its content at all, and a statically positioned block would
  // render UNDER a z-index 0 fixed layer. Those callers pass -1 and paint behind everything.
  var z = (opts.zIndex === undefined || opts.zIndex === null) ? 0 : Number(opts.zIndex);
  if (!Number.isFinite(z)) z = 0;
  return '.bg-stage{position:fixed;inset:0;z-index:' + z + ';overflow:hidden;pointer-events:none;'
    + 'background:#08070e;}'
    + '.bg-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
    + 'opacity:0;transition:opacity 1.6s ease;animation:kenBurns 44s ease-in-out infinite;}'
    + '.bg-layer.on{opacity:1;}'
    + '.bg-scrim{position:absolute;inset:0;background:' + scrim + ';}'
    + '@keyframes kenBurns{0%{transform:scale(1) translate(0,0)}'
    + '50%{transform:scale(1.10) translate(-1.5%,-1%)}100%{transform:scale(1) translate(0,0)}}'
    + '@media(prefers-reduced-motion:reduce){.bg-layer{animation:none}}';
}

function stageHtml() {
  return '<div class="bg-stage" aria-hidden="true">'
    + '<img class="bg-layer" id="bgLayer" alt="">'
    + '<div class="bg-scrim"></div></div>';
}

// A complete script element. It opens once and closes once, on purpose.
//
// RULINGS 20260725, ⬡B:routes.advisor.face:FIX:unnest_bg_stage_script_each_block_closes_once⬡:
// the identical helper on /advisors was injected INSIDE a still-open page script, so the
// browser closed the page script at this block's close tag and the whole page script died
// unparsed, which killed the sign-in button on four pages. Any caller must close its own
// script before injecting this one.
// The rotation itself, as bare JavaScript with no script tags around it. It lives apart from
// stageScript() so that the two kinds of caller share ONE body of logic rather than two that
// drift: a concatenated door wraps this in a tag below, and routes/os.brand.routes.js serves
// it as the body of a real .js file to the static surfaces, which cannot require this module.
// Whoever changes the cross fade changes it once, here, and both kinds of door move together.
function stageBootJs() {
  return 'var imgs=' + JSON.stringify(BACKGROUND_URLS) + ';'
    + 'var el=document.getElementById("bgLayer");if(!el)return;'
    + 'var i=Math.floor(Math.random()*imgs.length);'
    + 'function show(n){el.onload=function(){el.classList.add("on")};el.src=imgs[n];'
    + 'if(el.complete&&el.naturalWidth>0)el.classList.add("on")}'
    + 'show(i);'
    + 'setInterval(function(){el.classList.remove("on");'
    + 'setTimeout(function(){i=(i+1)%imgs.length;show(i)},900)},38000);';
}

function stageScript() {
  return '<script>(function(){' + stageBootJs() + '})();</script>';
}

// ---------------------------------------------------------------------------------------
// THE FIREWALL, for a surface whose imagery this service does not compile.
//
// ⬡B:core.brand:GUARD:an_unapproved_background_is_swapped_in_the_browser:20260728⬡
//
// GET /alive is a proxy onto a compiled SPA at ALIVE_ORIGIN, built from the ccwa-core repo,
// and all thirteen of the old URLs are baked into its bundle. Measured 20260728:
//   GET https://anu-anew.com/alive/assets/index-Br-3V3gt.js  -> 13 i.imgur.com references
// No require reaches inside a bundle this service did not build, so the roster above cannot
// fix that page the way it fixed every other one. What this service DOES control is the HTML
// the proxy hands to the browser, and it already rewrites that HTML to inject window.__ANU_HAM.
// This rides the same seam.
//
// It swaps rather than hides, so the page is never left with a hole where a background was:
// an unapproved imgur URL is mapped to an approved one, deterministically by its own
// characters, so a rotation that used to move through thirteen still moves through five
// instead of pinning every slot to a single image. An approved URL is left alone, and
// anything that is not an imgur background URL at all is never touched.
//
// STATED PLAINLY: this is a real, verifiable correction and it is still a patch over someone
// else's build output. The permanent fix is one edit to backgrounds.js in the ccwa-core repo
// and a redeploy of that SPA. That repo was not available to this lane. When it lands, this
// firewall becomes a no-op rather than a thing to unpick, because it only ever acts on a URL
// that is not in the roster.
function stageFirewallJs() {
  return 'try{'
    + 'var OK=' + JSON.stringify(BACKGROUND_URLS) + ';'
    + 'var okMap={};for(var i=0;i<OK.length;i++)okMap[OK[i]]=1;'
    // Only i.imgur.com background URLs are in scope. An avatar, an icon or any other asset the
    // SPA loads from anywhere else is none of this function's business.
    + 'function isBg(u){return typeof u==="string"&&u.indexOf("i.imgur.com/")!==-1;}'
    + 'function pick(u){var h=0;for(var j=0;j<u.length;j++){h=(h*31+u.charCodeAt(j))>>>0;}return OK[h%OK.length];}'
    + 'function fix(u){if(!isBg(u))return null;var t=u.trim();if(okMap[t])return null;return pick(t);}'
    // The src property setter catches an assignment before the browser starts the fetch, so an
    // unapproved image is never requested rather than being requested and then replaced.
    + 'var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");'
    + 'if(d&&d.set&&d.get){Object.defineProperty(HTMLImageElement.prototype,"src",{configurable:true,enumerable:d.enumerable,'
    + 'get:function(){return d.get.call(this);},'
    + 'set:function(v){var r=fix(String(v));d.set.call(this,r||v);}});}'
    // Anything set through markup, setAttribute or a CSS background-image is caught on the
    // sweep instead. Cheap: it only reads attributes and only writes when there is a swap.
    + 'function sweep(root){try{'
    + 'var imgs=(root||document).querySelectorAll?(root||document).querySelectorAll("img[src]"):[];'
    + 'for(var a=0;a<imgs.length;a++){var r=fix(imgs[a].getAttribute("src"));if(r)imgs[a].setAttribute("src",r);}'
    + 'var els=(root||document).querySelectorAll?(root||document).querySelectorAll("[style*=\\"imgur\\"]"):[];'
    + 'for(var b=0;b<els.length;b++){var st=els[b].getAttribute("style")||"";'
    + 'var out=st.replace(/https?:\\/\\/i\\.imgur\\.com\\/[A-Za-z0-9]+\\.[A-Za-z0-9]+/g,function(m){return fix(m)||m;});'
    + 'if(out!==st)els[b].setAttribute("style",out);}'
    + '}catch(e){}}'
    + 'function start(){sweep(document);'
    + 'try{new MutationObserver(function(ms){for(var k=0;k<ms.length;k++){var m=ms[k];'
    + 'if(m.type==="attributes"&&m.target)sweep(m.target.parentNode||document);'
    + 'else for(var n=0;n<m.addedNodes.length;n++){var nd=m.addedNodes[n];if(nd&&nd.nodeType===1)sweep(nd);}}})'
    + '.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src","style"]});}catch(e){}}'
    + 'if(document.documentElement)start();'
    + 'else document.addEventListener("DOMContentLoaded",start);'
    + '}catch(e){}';
}

// ---------------------------------------------------------------------------------------
// THE MARK, as three parts, same reasoning as the stage.

function markCss(size) {
  var px = Number(size) || 96;
  return '.anu-mark{width:' + px + 'px;height:' + px + 'px;margin:0 auto 14px;'
    + 'display:flex;align-items:center;justify-content:center;}'
    + '.anu-mark canvas{display:block;}';
}

function markHtml() {
  return '<div class="anu-mark" id="anuMark" aria-hidden="true"></div>';
}

// If /os/presence.js does not load, this paints NOTHING and the wordmark carries the page
// alone. That is the whole point of routes/os.presence.routes.js: a flat circle is never
// her, so the honest empty box beats a drawn stand-in.
// Same split and the same reason as stageBootJs. This is the mounting only: it assumes
// window.AnuPresence is already loaded and paints nothing if it is not, which keeps the
// honest empty box described above. The caller is responsible for loading PRESENCE_SRC,
// because a concatenated door can use a plain tag and a static surface has to fetch it.
// selector is a parameter so the static door can mount every marked host on a page rather
// than the single id the concatenated doors emit through markHtml().
function markBootJs(size, selector) {
  var px = Number(size) || 96;
  var sel = JSON.stringify(selector || '#anuMark');
  return 'if(typeof window.AnuPresence!=="function")return;'
    + 'var hosts=document.querySelectorAll(' + sel + ');'
    + 'for(var h=0;h<hosts.length;h++){'
    + 'var host=hosts[h];if(host.getAttribute("data-anu-mark-on")==="1")continue;'
    + 'host.setAttribute("data-anu-mark-on","1");'
    // A host may state its own size in the data attribute. That is how a surface adopting
    // this from the outside asks for a 40px corner mark and a 120px hero from one script,
    // rather than the one size a build time constant could give it. Bounded so a typo in a
    // static file cannot ask the canvas for a 40000px square.
    + 'var px=parseInt(host.getAttribute("data-anu-mark"),10);'
    + 'if(!(px>=8&&px<=512))px=' + px + ';'
    + 'var c=document.createElement("canvas");host.appendChild(c);'
    + 'new window.AnuPresence(c,{size:px,state:"idle"});}';
}

function markScript(size) {
  return '<script src="' + PRESENCE_SRC + '"></script>'
    + '<script>(function(){' + markBootJs(size, '#anuMark') + '})();</script>';
}

function faviconHtml() {
  return '<link rel="icon" type="image/png" href="' + MARK_STATIC_URL + '">';
}

module.exports = {
  BACKGROUNDS: BACKGROUNDS,
  BACKGROUND_URLS: BACKGROUND_URLS,
  BACKGROUND_IDS: BACKGROUND_IDS,
  DEFAULT_BACKGROUND: DEFAULT_BACKGROUND,
  isApprovedBackgroundUrl: isApprovedBackgroundUrl,
  isApprovedBackgroundId: isApprovedBackgroundId,
  approvedUrlOr: approvedUrlOr,
  PRESENCE_SRC: PRESENCE_SRC,
  MARK_STATIC_URL: MARK_STATIC_URL,
  ENVOLVE_LOGO_URL: ENVOLVE_LOGO_URL,
  stageCss: stageCss,
  stageHtml: stageHtml,
  stageScript: stageScript,
  stageBootJs: stageBootJs,
  stageFirewallJs: stageFirewallJs,
  markCss: markCss,
  markHtml: markHtml,
  markScript: markScript,
  markBootJs: markBootJs,
  faviconHtml: faviconHtml
};
