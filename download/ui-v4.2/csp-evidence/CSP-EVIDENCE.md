# CSP Evidence — 4 live violations reproduced on production (BEFORE fix)

**Date:** 2026-10-13
**Target:** https://mq1.vercel.app (commit `7f8ac460`, buildId `mq-build-7f8ac460`)
**Method:** headless Chromium (agent-browser), `securitypolicyviolation` event listener on the live auth page (`/play`, Telegram step, `providers.telegramWidget=true`, `telegramBotName=mq_auth_bot`)

## Header BEFORE (production, live)

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
```

## Violations captured (verbatim event payloads)

| # | violatedDirective | blockedURI | Root cause |
|---|---|---|---|
| 1 | `script-src-elem` | `https://telegram.org/js/telegram-widget.js` | telegram.org absent from script-src — Telegram Login Widget never executes (script tag present in DOM, 0 iframes, `window.TelegramLoginWidget` undefined) |
| 2 | `script-src-elem` | `https://challenges.cloudflare.com/turnstile/v0/api.js` | challenges.cloudflare.com absent from script-src — Turnstile cannot load (CobaltTurnstile → no cobalt JWT → SNIP bypass broken) |
| 3 | `frame-src` | `https://challenges.cloudflare.com` | no frame-src directive → falls back to `default-src 'self'` — Turnstile iframe blocked even if script were allowed |
| 4 | `frame-src` | `https://oauth.telegram.org` | same fallback issue — Telegram Login Widget renders its button in an `oauth.telegram.org` iframe |

## DOM-state proof (login page, Telegram step)

- Script tag injected by `AuthView.tsx`: `["https://telegram.org/js/telegram-widget.js?22"]` (present)
- Iframes on page: `[]` (widget never rendered)
- `typeof window.TelegramLoginWidget`: `"undefined"` (script body never executed)
- Network log: `GET https://telegram.org/js/telegram-widget.js?22 (Script)` — requested once, blocked by CSP

## Why not other root causes

- Not CORS: the requests are script/iframe loads (no `fetch` involved), and CSP `securitypolicyviolation` events fired with the exact directives above.
- Not cookies/callback: the widget script itself never loaded, so callback flow was never reached.
- Not a single CSP: one global CSP in `next.config.ts` `headers()` (no `vercel.json` headers, no `_headers` CSP, no middleware) — confirmed by grep over the repo.
- Google login unaffected: `window.location.href = "/api/auth/google"` (server-side redirect; navigation is not gated by this CSP).

## Fix (next.config.ts)

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://telegram.org
frame-src 'self' https://challenges.cloudflare.com https://oauth.telegram.org
```

- `'unsafe-eval'` removed → `'wasm-unsafe-eval'` (only WASM compile needed, by `WasmAudioBackend.ts` `WebAssembly.compile`)
- `script-src 'unsafe-inline'` kept — Next.js App Router inline RSC bootstrap scripts; nonce-based CSP would require adding middleware + dynamic rendering everywhere (architectural change, out of hotfix scope). Documented in next.config.ts.
- `frame-src 'self'` preserves prior same-origin frame capability (was `default-src 'self'`).
- All existing protections kept: `frame-ancestors 'none'`, `base-uri`, `form-action`, X-Frame-Options DENY, nosniff, HSTS.

## Verification plan

- Regression test: `src/__tests__/config/csp.test.ts` (token-precise directive assertions)
- Local production-build browser check: widget script loads, iframe renders, Turnstile api.js loads
- Post-deploy production check: same + full auth smoke
