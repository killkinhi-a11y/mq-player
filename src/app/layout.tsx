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
  title: "mq",
  description: "mq — музыкальный плеер с мессенджером, таймером сна и кастомизацией",
  keywords: ["mq", "music", "player", "мессенджер"],
  authors: [{ name: "mq Team" }],
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  other: {
    "mobile-web-app-capable": "yes",
  },
  themeColor: "#e03131",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "mq",
  },
  applicationName: "mq",
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
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="msapplication-TileColor" content="#0e0e0e" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              // === SAFE BUILD-ID CHECK (v2) ===
              // Previously this script ran localStorage.clear() + sessionStorage.clear()
              // whenever the build ID changed — which wiped the user's queue, liked tracks,
              // history and messenger cache on EVERY build. Now we just record the new
              // build ID; the Zustand persist layer handles its own migration via
              // STORE_VERSION in useAppStore.ts.
              try{
                var BUILD_ID = (window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId)
                  || 'mq-build-v54';
                var prevBuild = localStorage.getItem('mq-build-id');
                if(prevBuild && prevBuild !== BUILD_ID){
                  // Build changed — record it but DO NOT wipe user data.
                  // Zustand migrate() (see useAppStore.ts partialize/migrate)
                  // handles schema upgrades per-slice.
                  localStorage.setItem('mq-build-id', BUILD_ID);
                  // Soft reload once so new chunks load cleanly.
                  if(!sessionStorage.getItem('mq-build-reloaded')){
                    sessionStorage.setItem('mq-build-reloaded', '1');
                    window.location.replace(window.location.pathname);
                    return;
                  }
                }
                if(!prevBuild){
                  localStorage.setItem('mq-build-id', BUILD_ID);
                }
                // Clear the one-shot reload guard so a future build change can reload again.
                sessionStorage.removeItem('mq-build-reloaded');
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
        suppressHydrationWarning
      >
        {/* Skip-to-content link for keyboard / screen-reader users (M4.3 a11y).
            Visually hidden until focused, then appears top-left. */}
        <a
          href="#main-content"
          className="mq-skip-link"
          style={{
            position: "absolute",
            left: -9999,
            top: 0,
            zIndex: 100000,
            padding: "8px 16px",
            background: "var(--mq-accent, #e03131)",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "0 0 8px 0",
            fontSize: 14,
            fontWeight: 500,
          }}
          onFocus={(e) => {
            e.currentTarget.style.left = "0";
          }}
          onBlur={(e) => {
            e.currentTarget.style.left = "-9999px";
          }}
        >
          Перейти к основному контенту
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
