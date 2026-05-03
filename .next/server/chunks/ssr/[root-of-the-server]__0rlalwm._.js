module.exports=[89578,a=>{a.v({className:"geist_a71539c9-module__T19VSG__className",variable:"geist_a71539c9-module__T19VSG__variable"})},35214,a=>{a.v({className:"geist_mono_8d43a2aa-module__8Li5zG__className",variable:"geist_mono_8d43a2aa-module__8Li5zG__variable"})},32441,a=>{a.v({className:"outfit_cbfa4884-module__hWmOPq__className",variable:"outfit_cbfa4884-module__hWmOPq__variable"})},33496,a=>{a.v({className:"space_grotesk_1d8c5cc8-module__-5dOoa__className",variable:"space_grotesk_1d8c5cc8-module__-5dOoa__variable"})},4849,a=>{"use strict";a.s(["Toaster",()=>b]);let b=(0,a.i(11857).registerClientReference)(function(){throw Error("Attempted to call Toaster() from the server but Toaster is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/components/ui/toaster.tsx <module evaluation>","Toaster")},42432,a=>{"use strict";a.s(["Toaster",()=>b]);let b=(0,a.i(11857).registerClientReference)(function(){throw Error("Attempted to call Toaster() from the server but Toaster is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/src/components/ui/toaster.tsx","Toaster")},48450,a=>{"use strict";a.i(4849);var b=a.i(42432);a.n(b)},27572,a=>{"use strict";var b=a.i(7997),c=a.i(89578);let d={className:c.default.className,style:{fontFamily:"'Geist', 'Geist Fallback'",fontStyle:"normal"}};null!=c.default.variable&&(d.variable=c.default.variable);var e=a.i(35214);let f={className:e.default.className,style:{fontFamily:"'Geist Mono', 'Geist Mono Fallback'",fontStyle:"normal"}};null!=e.default.variable&&(f.variable=e.default.variable);var g=a.i(32441);let h={className:g.default.className,style:{fontFamily:"'Outfit', 'Outfit Fallback'",fontStyle:"normal"}};null!=g.default.variable&&(h.variable=g.default.variable);var i=a.i(33496);let j={className:i.default.className,style:{fontFamily:"'Space Grotesk', 'Space Grotesk Fallback'",fontStyle:"normal"}};null!=i.default.variable&&(j.variable=i.default.variable);var k=a.i(48450);a.s(["default",0,function({children:a}){return(0,b.jsxs)("html",{lang:"ru",suppressHydrationWarning:!0,children:[(0,b.jsxs)("head",{children:[(0,b.jsx)("meta",{"http-equiv":"Cache-Control",content:"no-cache, no-store, must-revalidate"}),(0,b.jsx)("meta",{"http-equiv":"Pragma",content:"no-cache"}),(0,b.jsx)("meta",{"http-equiv":"Expires",content:"0"}),(0,b.jsx)("meta",{name:"theme-color",content:"#e03131"}),(0,b.jsx)("meta",{name:"apple-mobile-web-app-capable",content:"yes"}),(0,b.jsx)("meta",{name:"apple-mobile-web-app-status-bar-style",content:"black-translucent"}),(0,b.jsx)("meta",{name:"apple-mobile-web-app-title",content:"mq"}),(0,b.jsx)("meta",{name:"mobile-web-app-capable",content:"yes"}),(0,b.jsx)("meta",{name:"application-name",content:"mq"}),(0,b.jsx)("meta",{name:"msapplication-TileColor",content:"#0e0e0e"}),(0,b.jsx)("link",{rel:"apple-touch-icon",href:"/icon-192.png"}),(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:`(function(){
              try{
                // === CACHE-BUST v7 (safe) ===
                var BUILD_ID="mq-build-v50";
                var prevBuild=localStorage.getItem('mq-build-id');
                if(prevBuild && prevBuild!==BUILD_ID){
                  // Stale build — clear old data and reload once
                  try{localStorage.clear()}catch(e){}
                  try{sessionStorage.clear()}catch(e){}
                  window.location.replace(window.location.pathname+'?_fresh='+Date.now());
                  return;
                }
                if(!prevBuild){
                  // First visit or cleared — just set the build ID
                  localStorage.setItem('mq-build-id',BUILD_ID);
                }
              }catch(e){
                // localStorage blocked — continue silently
              }
            })()`}}),(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:`(function(){
      // ── Global TDZ / chunk-loading error recovery ──
      // Catches "can't access lexical declaration 'X' before initialization"
      // which happens when old+new JS chunks are mixed due to caching.
      // Runs BEFORE React hydrates, so it can auto-recover before the error boundary.
      window.addEventListener('error',function(e){
        var msg=(e&&e.message)||'';
        if(/can\\'t access.*lexical declaration/i.test(msg)){
          console.warn('[MQ] TDZ chunk error detected, auto-recovering...');
          // Only auto-reload once per session to prevent loops
          var key='mq-tdz-recovered';
          try{
            if(sessionStorage.getItem(key))return;
            sessionStorage.setItem(key,'1');
          }catch(ex){return}
          // Clear all caches and reload
          if(navigator.serviceWorker){
            navigator.serviceWorker.getRegistrations().then(function(regs){
              regs.forEach(function(r){r.unregister()});
            });
          }
          if(window.caches){
            window.caches.keys().then(function(ks){
              Promise.all(ks.map(function(k){return window.caches.delete(k)})).then(function(){
                window.location.replace(window.location.pathname+'?_tdz='+Date.now());
              });
            });
            return;
          }
          window.location.replace(window.location.pathname+'?_tdz='+Date.now());
        }
      },true);

      function initSplash(){
        if(!document.body){document.addEventListener('DOMContentLoaded',initSplash);return}
        var splash=document.createElement('div');
        splash.id='mq-splash';
        splash.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0e0e0e;';
        splash.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:16px"><div style="display:flex;gap:4px"><div style="width:6px;height:6px;border-radius:50%;background:#e03131;animation:mqDot 1.2s ease-in-out infinite;animation-delay:0s"></div><div style="width:6px;height:6px;border-radius:50%;background:#e03131;animation:mqDot 1.2s ease-in-out infinite;animation-delay:0.15s"></div><div style="width:6px;height:6px;border-radius:50%;background:#e03131;animation:mqDot 1.2s ease-in-out infinite;animation-delay:0.3s"></div></div><span style="font-size:14px;font-weight:300;color:rgba(255,255,255,0.25);font-family:var(--font-outfit),system-ui,sans-serif;letter-spacing:4px">mq</span></div>';
        var style=document.createElement('style');
        style.textContent='@keyframes mqDot{0%,80%,100%{transform:scale(0.4);opacity:0.3}40%{transform:scale(1);opacity:1}}';
        document.head.appendChild(style);
        document.body.appendChild(splash);
        window.__mqRemoveSplash=function(){splash.style.transition='opacity 0.3s ease';splash.style.opacity='0';setTimeout(function(){splash.remove()},300)};
        setTimeout(function(){if(splash.parentNode){splash.style.transition='opacity 0.3s ease';splash.style.opacity='0';setTimeout(function(){splash.remove()},300)}},2500);
      }
      initSplash();
    })()`}}),(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:"if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}"}})]}),(0,b.jsxs)("body",{className:`${d.variable} ${f.variable} ${h.variable} ${j.variable} antialiased`,style:{backgroundColor:"var(--mq-bg, #0e0e0e)",fontFamily:"var(--font-geist-sans), system-ui, sans-serif"},children:[a,(0,b.jsx)(k.Toaster,{})]})]})},"metadata",0,{title:"mq",description:"mq — музыкальный плеер с зашифрованным мессенджером, таймером сна и кастомизацией",keywords:["mq","music","player","мессенджер","шифрование"],authors:[{name:"mq Team"}],icons:{icon:"/favicon.ico",apple:"/apple-touch-icon.png"},manifest:"/manifest.json",other:{"mobile-web-app-capable":"yes"}},"revalidate",0,0],27572)},50645,a=>{a.n(a.i(27572))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0rlalwm._.js.map