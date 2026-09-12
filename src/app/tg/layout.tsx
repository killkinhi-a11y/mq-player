export const metadata = {
  title: "mq — Telegram Mini App",
  description: "Музыкальный плеер mq прямо в Telegram",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
  themeColor: "#0e0e0e",
};

// Telegram Mini App — disable static generation, always render dynamically
// so the page reflects the current request environment.
export const dynamic = "force-dynamic";

export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Inline diagnostic script — runs BEFORE React hydrates.
          Captures environment state + any errors that happen during page
          load, so we can diagnose white-screen issues on PC and mobile.

          The script writes to window.__TG_DIAG__ which page.tsx reads
          and displays in the debug panel. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var diag = {
                  start: Date.now(),
                  ua: navigator.userAgent,
                  url: location.href,
                  origin: location.origin,
                  hasTelegram: typeof window.Telegram !== 'undefined',
                  hasWebApp: !!(window.Telegram && window.Telegram.WebApp),
                  initData: (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '',
                  errors: [],
                };
                window.__TG_DIAG__ = diag;

                window.addEventListener('error', function(e) {
                  diag.errors.push({
                    time: Date.now() - diag.start,
                    type: 'error',
                    message: e.message,
                    filename: e.filename,
                    line: e.lineno,
                    col: e.colno,
                  });
                  showFallbackIfStuck();
                });

                window.addEventListener('unhandledrejection', function(e) {
                  diag.errors.push({
                    time: Date.now() - diag.start,
                    type: 'unhandledrejection',
                    message: e.reason && e.reason.message ? e.reason.message : String(e.reason),
                  });
                });

                console.log('[tg-diag] Diagnostic script loaded', diag);

                // If React hasn't rendered anything within 8 seconds, show
                // a fallback screen so the user doesn't stare at white.
                var rendered = false;
                var observer = new MutationObserver(function(mutations) {
                  for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
                      rendered = true;
                      break;
                    }
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });

                function showFallbackIfStuck() {
                  setTimeout(function() {
                    if (!rendered && !document.querySelector('[data-tg-app]')) {
                      var div = document.createElement('div');
                      div.style.cssText = 'position:fixed;inset:0;background:#0e0e0e;color:#f0f0f0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,sans-serif;z-index:9999;';
                      div.innerHTML = '<div style="font-size:48px;margin-bottom:16px">⏳</div>' +
                        '<h2 style="font-size:18px;font-weight:700;margin:0 0 8px">Mini App не загружается</h2>' +
                        '<p style="font-size:14px;color:#9a9a9a;max-width:320px;line-height:1.5;margin:0 0 16px">' +
                        'React не смог отрендерить интерфейс за 8 секунд. Возможные причины: проблема с сетью, ошибка в JS-чанке, блокировка WebView.' +
                        '</p>' +
                        '<button onclick="location.reload()" style="background:#e03131;color:#fff;border:none;padding:12px 24px;border-radius:12;font-size:16px;font-weight:600;cursor:pointer;max-width:280px;width:100%">Перезагрузить</button>' +
                        '<a href="/" style="display:inline-block;margin-top:8px;color:#9a9a9a;font-size:14px;text-decoration:underline">Открыть обычную версию</a>' +
                        '<details style="margin-top:16px;max-width:400px;width:100%;text-align:left;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;font-size:12px;color:#9a9a9a"><summary style="cursor:pointer;font-weight:600;color:#f0f0f0">Диагностика</summary><pre style="font-family:monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:8px 0 0;color:#9a9a9a" id="tg-diag-output"></pre></details>';
                      document.body.appendChild(div);
                      var pre = document.getElementById('tg-diag-output');
                      if (pre) {
                        pre.textContent = JSON.stringify(diag, null, 2);
                      }
                    }
                  }, 8000);
                }
                showFallbackIfStuck();
              } catch (e) {
                document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0e0e0e;color:#f0f0f0;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif"><div><h2>Критическая ошибка</h2><pre style="color:#e03131;font-size:12px">' + String(e) + '</pre></div></div>';
              }
            })();
          `,
        }}
      />
      {children}
    </>
  );
}
