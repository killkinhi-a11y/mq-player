import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "mq — Музыкальный плеер",
  description: "MQ Player — современный музыкальный плеер с зашифрованным мессенджером, таймером сна и кастомизацией",
  keywords: ["MQ Player", "music", "player", "мессенджер", "шифрование"],
  authors: [{ name: "MQ Player Team" }],
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// Force this page to never be cached by CDN / browser
export const revalidate = 0;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        {/* PWA meta tags */}
        <meta name="theme-color" content="#e03131" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="mq" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="mq" />
        <meta name="msapplication-TileColor" content="#0e0e0e" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try{
                // === CACHE-BUST v7 (safe) ===
                var BUILD_ID="mq-build-v49";
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
            })()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
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
    })()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${spaceGrotesk.variable} antialiased`}
        style={{ backgroundColor: "var(--mq-bg, #0e0e0e)", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
