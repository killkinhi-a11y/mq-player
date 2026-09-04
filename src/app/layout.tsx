import type { Metadata } from "next";
import { Geist_Mono, Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// ── CENTRALIZED TYPOGRAPHY (Phase O §11) ──
// THREE families, each with a job; the previous six-font setup mixed
// latin-only faces (Geist/Outfit/Space Grotesk) ahead of Manrope, so RU
// text rendered in a different typeface than EN text in the same UI.
//   --font-manrope  → --mq-font-primary  (ALL text, latin + cyrillic)
//   --font-geist-mono → --mq-font-mono   (numerals, timestamps, code)
//   --font-playfair-display → --mq-font-serif (editorial display accents)
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // rupert-seo-optimizer: title 50-60 chars, include primary keyword + brand
  title: "mq — музыкальный плеер с рекомендациями и чатом",
  description: "mq — стриминговый плеер с умными рекомендациями, эквалайзером, мессенджером и кастомными темами. Слушай музыку, открывай новых артистов, общайся с друзьями.",
  keywords: ["mq", "музыкальный плеер", "стриминг", "музыка", "эквалайзер", "рекомендации", "плейлисты", "music player", "streaming"],
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
  // rupert-seo-optimizer: Open Graph for social sharing
  openGraph: {
    title: "mq — музыкальный плеер с рекомендациями и чатом",
    description: "Стриминговый плеер с умными рекомендациями, эквалайзером, мессенджером и кастомными темами.",
    type: "website",
    locale: "ru_RU",
    siteName: "mq",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "mq — музыкальный плеер",
      },
    ],
  },
  // rupert-seo-optimizer: Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "mq — музыкальный плеер",
    description: "Стриминг с умными рекомендациями, эквалайзером и мессенджером",
    images: ["/icon-512.png"],
  },
  // rupert-seo-optimizer: canonical URL
  alternates: {
    canonical: process.env.NEXT_PUBLIC_APP_URL || "https://mq-player.vercel.app",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
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
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="msapplication-TileColor" content="#0e0e0e" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Inline CSS — accessibility fix (WCAG 2.2 / ui-ux-design skill).
            OLD: killed ALL focus outlines globally with `outline: none !important`
            — violated WCAG 2.4.7 (Focus Visible) and made keyboard navigation
            impossible for visually-impaired users.
            NEW: hide default outlines only on mouse focus (:focus), but show
            a visible accent ring on keyboard focus (:focus-visible) with 3:1
            contrast ratio per WCAG 2.2. Also kill tap highlight (mobile only). */}
        <style dangerouslySetInnerHTML={{ __html: `
          *, *::before, *::after {
            -webkit-tap-highlight-color: transparent !important;
          }
          /* Mouse focus — suppress default ring (we use custom hover states) */
          *:focus:not(:focus-visible) {
            outline: none !important;
            --tw-ring-shadow: 0 0 #0000 !important;
            --tw-ring-offset-shadow: 0 0 #0000 !important;
            --tw-ring-color: transparent !important;
          }
          /* Keyboard focus — visible accent ring, 3:1 contrast (WCAG 2.2) */
          *:focus-visible {
            outline: 2px solid var(--mq-accent, #e03131) !important;
            outline-offset: 2px !important;
            border-radius: 4px;
          }
          input:focus-visible, textarea:focus-visible, select:focus-visible {
            outline: 2px solid var(--mq-accent, #e03131) !important;
            outline-offset: 2px !important;
          }
        `}} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              // === SAFE BUILD-ID CHECK (v2) ===
              // Previously this script ran localStorage.clear() + sessionStorage.clear()
              // whenever the build ID changed — which wiped the user's queue, liked tracks,
              // history and messenger cache on EVERY build. Now we just record the new
              // build ID; the Zustand persist layer handles its own migration via
              // STORE_VERSION in useAppStore.ts.
              //
              // Phase M: BUILD_ID is now server-inlined (NEXT_PUBLIC_MQ_BUILD_ID —
              // App Router has no window.__NEXT_DATA__.buildId). Unique per commit,
              // matching /version.json on the server.
              try{
                var BUILD_ID = ${JSON.stringify(process.env.NEXT_PUBLIC_MQ_BUILD_ID || "mq-build-v58")};
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
        // TDZ recovery
        if(/can\\'t access.*lexical declaration/i.test(msg)){
          console.warn('[MQ] TDZ chunk error detected, auto-recovering...');
          var key='mq-tdz-recovered';
          try{
            if(sessionStorage.getItem(key))return;
            sessionStorage.setItem(key,'1');
          }catch(ex){return}
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
        // Chunk loading error recovery
        if(msg.indexOf('Failed to load chunk')>=0||msg.indexOf('Loading chunk')>=0||msg.indexOf('Loading CSS chunk')>=0){
          console.warn('[MQ] Chunk loading error detected, auto-reloading...');
          var ckey='mq-chunk-recovered';
          try{
            if(sessionStorage.getItem(ckey))return;
            sessionStorage.setItem(ckey,'1');
          }catch(ex){return}
          window.location.reload();
        }
        // React #300/#310/#185 recovery — auto-reload once
        if(msg.indexOf('Minified React error #300')>=0||msg.indexOf('Minified React error #310')>=0||msg.indexOf('Minified React error #185')>=0){
          console.warn('[MQ] React error detected, auto-reloading...');
          var rkey='mq-react-recovered';
          try{
            if(sessionStorage.getItem(rkey))return;
            sessionStorage.setItem(rkey,'1');
          }catch(ex){return}
          // Clear service worker cache to get fresh chunks
          if(navigator.serviceWorker){
            navigator.serviceWorker.getRegistrations().then(function(regs){
              regs.forEach(function(r){r.unregister()});
            });
          }
          setTimeout(function(){window.location.reload()},100);
        }
      },true);
    })()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      {/* rupert-seo-optimizer: structured data (JSON-LD) for MusicApplication.
          Helps Google understand the site is a music app, enables rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicApplication",
            name: "mq",
            applicationCategory: "MusicApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            description: "Стриминговый плеер с умными рекомендациями, эквалайзером, мессенджером и кастомными темами.",
            featureList: [
              "Стриминг музыки",
              "Умные рекомендации",
              "10-полосный эквалайзер",
              "Мессенджер",
              "Кастомные темы оформления",
              "Плейлисты",
            ],
          }),
        }}
      />
      </head>
      <body
        className={`${geistMono.variable} ${playfairDisplay.variable} ${manrope.variable} antialiased`}
        style={{ backgroundColor: "var(--mq-bg, #0e0e0e)", fontFamily: "var(--mq-font-primary)" }}
        suppressHydrationWarning
      >
        {/* Skip-to-content link for keyboard / screen-reader users (M4.3 a11y).
            Visually hidden until focused, then appears top-left. Pure CSS —
            see `.mq-skip-link` in globals.css. NO event handlers here because
            RootLayout is a Server Component (cannot use onFocus/onBlur). */}
        <a href="#main-content" className="mq-skip-link">
          Перейти к основному контенту
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
