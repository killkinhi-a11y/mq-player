# Fasti Production Guardian Checklist

Print this list before every deployment. Check every box.

## Code
- [ ] TypeScript clean (`npx tsc --noEmit` → 0 errors)
- [ ] Unit tests pass (`npm test` → N/N passed, baseline 331)
- [ ] Migration safety (any `SCHEMA_VERSION` bump has non-destructive migration in `src/lib/storage.ts` + test in `tests/migration.test.ts`)
- [ ] Build success (`npm run build` → `dist/version.json` + `dist/sw.js` + `dist/index.html`)
- [ ] No new npm dependencies without justification (check `package.json` diff)

## UI
- [ ] Mobile 375×812 (iPhone 13 mini) — agent-browser snapshot
- [ ] Mobile 390×844 (iPhone 13/14)
- [ ] Mobile 430×932 (iPhone 14 Pro Max)
- [ ] Desktop 1280×720
- [ ] Desktop 1440×900
- [ ] Desktop 1920×1080
- [ ] Console: no errors, no warnings
- [ ] Critical network requests: 200 OK (HTML, JS bundles, SW, version.json, AI endpoints)
- [ ] Accessibility: keyboard nav, focus visible, ARIA labels, screen reader announcements (timer has aria summary, NOT per-second updates)
- [ ] Visual hierarchy: status > timer > progress > CTA > phase > nutrition > water > plan
- [ ] Dark/Light themes both render

## Performance
- [ ] Total bundle < 5MB (`du -sh dist/`)
- [ ] Main bundle < 500KB (largest `dist/assets/index-*.js`)
- [ ] Lazy loading intact: FastingPage, NutritionPage, ProgressPage, charts all in separate chunks
- [ ] Supabase NOT in main bundle (lazy-loaded or server-side only)
- [ ] No `z-ai-web-dev-sdk` in any bundle
- [ ] recharts only in lazy charts chunk, not in main bundle
- [ ] React rerenders minimal (no obvious thrash in dev tools)

## Security
- [ ] Secret scan on `dist/assets/*.js`: 0 matches for SDK/internal-api/keys/tokens
- [ ] `git ls-files | grep -E '\.(env|vercel_token|pem|key|p12)$'` → only `.env.example`
- [ ] `.env.example` contains only placeholders
- [ ] `api/ai/_zai.js` not imported from any `src/**` file (server-only)
- [ ] Vercel deployment bundle (via REST API) contains no `.env`, `.vercel_token`, `*.pem`, `*.key`
- [ ] Live production HTML/JS: no `vcp_*`, no JWT (`eyJhbGc`), no `ZAI_API_KEY` literal
- [ ] AI endpoints never echo API key in error responses (verify in tests/aiEndpoints.test.ts)

## AI
- [ ] `/api/ai/chat` → HTTP 200, JSON `{available, mode, answer, intent}`
- [ ] `/api/ai/plan` → HTTP 200, JSON (single-day `{meals,days:null,totals,plan.meals}` / weekly `{days:[7],meals:[7],totals,plan.days:[7]}`)
- [ ] `/api/ai/analyze-food` → HTTP 200, JSON `{food,ingredients,serving,calories,protein,carbs,fat,confidence,estimate}` (single) or arrays (multi)
- [ ] Honest fallback: if `ZAI_API_KEY` missing/invalid → `{available: false, reason: 'invalid_credentials' or 'ai_unavailable'}` — NEVER `{available: true}` with mock content
- [ ] Local mode (no API key) — UI shows Local mode, not a fake "AI response"
- [ ] Retry policy: 1 retry on 408/429/5xx/network, NO retry on 400/401/403
- [ ] Timeouts: chat 15s, vision 25s, plan 20-40s
- [ ] API key never logged

## PWA / Service Worker
- [ ] `/version.json` → HTTP 200, contains `{version, build, generatedAt}`, build ID differs from previous deploy
- [ ] `/sw.js` → HTTP 200, `Cache-Control: public, max-age=0, must-revalidate`
- [ ] `public/sw.js` path stable (never `sw.<hash>.js`)
- [ ] Update Manager detects build mismatch on next user request
- [ ] BroadcastChannel posts "update-available"
- [ ] UpdateBanner shows on mismatch
- [ ] Stale chunk recovery: lazy route 404 → recover via reload
- [ ] Vercel cache headers: assets immutable (31536000), HTML/SW/version.json must-revalidate (0)
- [ ] Old browser context (A deployment): open new deployment (B) without cache wipe → update flow triggers

## Deployment Architecture (DO NOT TOUCH)
- [ ] `public/sw.js` — build-scoped SW (not modified)
- [ ] `src/lib/deployment.ts` — Build ID reader (not modified)
- [ ] `src/lib/appUpdateManager.ts` — Update Manager (not modified)
- [ ] `src/components/system/UpdateBanner.tsx` — Update UI (not modified)
- [ ] `vercel.json` — cache headers (not modified without verification)
- [ ] Stale chunk recovery logic in SW (not modified)

## Existing Browser
- [ ] Old browser with active fast + user data + SW registered (A deployment)
- [ ] Open new deployment (B) — NO cache wipe, NO SW unregister, NO localStorage delete
- [ ] Verify: update banner appears, automatic update triggers, lazy routes load new chunks, user data preserved

## Multiple Tabs
- [ ] Open Fasti in 2+ tabs
- [ ] Trigger update in tab 1
- [ ] Verify: BroadcastChannel propagates update to all tabs

## User Data Preservation
- [ ] `fasti:sessions` key stable
- [ ] `fasti:activeSession` key stable
- [ ] `fasti:settings` key stable
- [ ] `fasti:schemaVersion` migration non-destructive (lazy fill defaults on read)
- [ ] No localStorage.clear() calls in code (search: `grep -rn 'localStorage.clear' src/`)

## Final
- [ ] All gates pass
- [ ] Report saved to `/home/z/my-project/worklog.md`
- [ ] Production URL confirmed: `https://fasti-seven.vercel.app`
- [ ] Version + build ID recorded
