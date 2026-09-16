---
name: fasti-production-guardian
description: Pre-deployment guardian for the Fasti PWA (Vite + React + TypeScript + PWA on Vercel, AI via Z.AI public API). Use this skill BEFORE every major code change and BEFORE every Vercel deployment to verify TypeScript clean, unit tests pass, bundle has no secret leaks, lazy loading intact, Service Worker + version.json + Update Manager + BroadcastChannel + stale chunk recovery are not broken, AI endpoints respond honestly (no fake "available:true"), and A/B deployment preserves user data without cache wipe. Trigger when the user mentions "deploy", "ship", "release", "production", "fasti deploy", "vercel", or any Fasti code/UI change. Also trigger when the user asks for a security audit, performance audit, or production verification of Fasti. Never skip this skill for Fasti deployments — production breaks are expensive.
---

# Fasti Production Guardian

This skill is the **non-negotiable pre-deployment gate** for Fasti.
Its job: catch any regression that breaks production BEFORE the user sees it.

## When to use

Run this skill BEFORE:

- Any Vercel deployment (`vercel deploy --prod`).
- Any change to `src/lib/deployment.ts`, `public/sw.js`, `version.json`, `vite.config.ts`, `vercel.json`, `api/ai/*`, `src/lib/appUpdateManager.ts`.
- Any change to data models in `src/types/index.ts` or storage in `src/lib/storage.ts` (migration safety check).
- Any change to AI endpoints or AI client (`api/ai/_zai.js`).
- Any UX/UI change that affects the dashboard, fasting card, plan selector, or pause system.
- Final production status declaration.
- A/B deployment test.

Run after any of these to verify nothing regressed.

## Workflow (always in this order)

### 1. Pre-deploy code gate

Run `scripts/guardian.sh pre-deploy` from the project root `/home/z/my-project`:

- **TypeScript clean**: `npx tsc --noEmit` returns 0 errors.
- **Unit tests pass**: `npm test` returns `Tests N/N passed` (baseline 331).
- **Migration safety**: any change to `SCHEMA_VERSION` in `src/lib/storage.ts` MUST have a non-destructive migration step. Verify in `tests/migration.test.ts`.
- **Build success**: `npm run build` produces `dist/` with `version.json`, `sw.js`, `index.html`, `manifest.webmanifest`, `assets/`.
- **No new dependencies without reason**: check `package.json` diff — every new dep must be justified by code that uses it.

If ANY of these fail → STOP. Fix before proceeding.

### 2. Security audit

Run `scripts/security_scan.sh` from `/home/z/my-project`:

- **Secret scan on dist bundle**: grep `dist/assets/*.js` for `z-ai-web-dev-sdk`, `internal-api\.z\.ai`, `/etc/\.z-ai-config`, `ZAI_API_KEY`, `X-Z-AI-From`, `vcp_[A-Za-z0-9]{10,}`, `eyJhbGc` (JWT prefix). Expect 0 matches.
- **Secret scan on git tracking**: `git ls-files | grep -E '\.(env|vercel_token|pem|key|p12)$'` should only return `.env.example`.
- **Secret scan in .env.example**: must contain only placeholder values, never real keys.
- **AI client never in browser bundle**: confirm `api/ai/_zai.js` is NOT imported from any `src/**` file.
- **Vercel deployment bundle audit**: `scripts/deploy_verify.sh bundle <deployment_id>` queries Vercel REST API for the deployment's file list and greps for `.env`, `.vercel_token`, `*.pem`, `*.key`.
- **Live HTML / assets**: grep production HTML and JS for `vcp_*`, `Z.ai`, `internal-api`, `api.z.ai` (the latter is fine in client code if it's only a fetch URL, NOT if it includes an API key).

If ANY critical leak → STOP. Rotate the leaked secret, fix the bundling, re-build, re-test.

### 3. Performance audit

Run `scripts/performance_audit.sh` from `/home/z/my-project`:

- **Total bundle size**: `du -sh dist/` should be < 5MB. Alert if > 10MB.
- **Main bundle size**: the largest `dist/assets/index-*.js` should be < 500KB. Alert if > 1MB.
- **Lazy loading intact**: `dist/assets/FastingPage-*.js`, `NutritionPage-*.js`, `ProgressPage-*.js`, `charts-*.js` exist as separate chunks (code-split routes).
- **Supabase NOT in main bundle**: `grep -c 'supabase' dist/assets/index-*.js` should be 0 (Supabase is only used in `src/lib/supabase.ts` and `src/lib/cloudRepository.ts` — must be lazy-loaded or never imported by the main entry).
- **AI SDK NOT in bundle**: 0 matches for `z-ai-web-dev-sdk` (Fasti removed this dep in v5.2.1).
- **recharts only in lazy chunks**: grep `dist/assets/charts-*.js` (lazy) for `recharts` — should be present there; grep `dist/assets/index-*.js` (main) for `recharts` — should be 0 (lazy-loaded).

### 4. Production deployment gate

Run `scripts/deploy_verify.sh deploy <production_url>` from `/home/z/my-project`:

- **Deploy**: `vercel deploy --prod --yes --token=$VERCEL_TOKEN`.
- **version.json**: GET `/version.json` → HTTP 200 with `{version, build, generatedAt}`. Build ID must differ from previous deployment.
- **sw.js**: GET `/sw.js` → HTTP 200, `Content-Type: application/javascript`, `Cache-Control: public, max-age=0, must-revalidate` (NOT long-cached — Update Manager must be able to detect changes).
- **index.html**: GET `/` → HTTP 200, contains the expected module script tag pointing at the new bundle hash.
- **AI endpoints**: POST `/api/ai/chat` with `{"messages":[{"role":"user","content":"hi"}],"intent":"general"}` → HTTP 200, JSON response. If `available: false`, reason must be one of: `ai_unavailable`, `invalid_credentials`, `invalid_model`, `rate_limited`, `timeout`, `provider_error`. NEVER `available: true` with mock content (mocks are forbidden in production).
- **/api/ai/plan** and **/api/ai/analyze-food**: same contract.
- **manifest.webmanifest**: GET `/manifest.webmanifest` → HTTP 200, valid JSON.
- **Vercel cache headers**: HEAD `/assets/<any-bundle>` → `Cache-Control: public, max-age=31536000, immutable`. HEAD `/sw.js` → `max-age=0, must-revalidate`.

If ANY critical endpoint returns wrong status, body, or fake content → STOP. Find root cause, fix, redeploy, re-verify.

### 5. A/B deployment test

Run `scripts/ab_test.sh <previous_build_id> <new_build_id>`:

- **Build ID mismatch**: previous `version.json.build` ≠ new `version.json.build`. SW Update Manager will detect mismatch on next user request and trigger update flow.
- **Storage keys unchanged**: localStorage keys (`fasti:sessions`, `fasti:activeSession`, `fasti:settings`, `fasti:schemaVersion`, etc.) must be identical between A and B. Verify by reading `src/lib/storage.ts` for key constants.
- **Schema migration non-destructive**: if `SCHEMA_VERSION` changed (e.g., 5→6), the migration step in `storage.ts` must be lazy and non-destructive (fill defaults on read, never overwrite aggressively).
- **sw.js not renamed**: `public/sw.js` path must be stable (never `/sw.<hash>.js`) — Update Manager fetches `/sw.js` to detect new versions.
- **Update flow simulation**: open old browser context, hit new deployment → SW Update Manager detects build mismatch → BroadcastChannel posts "update-available" → user sees UpdateBanner → on reload, lazy routes fetch new chunks (stale chunk recovery handles 404 on old chunks).

### 6. Final report

Run `scripts/guardian.sh report` to print a summary with pass/fail for each gate:

```
=== Fasti Production Guardian Report ===
TypeScript:        PASS
Unit tests:        PASS (331/331)
Migration safety:  PASS
Build success:     PASS
Security scan:     PASS (0 leaks in bundle, 0 secrets in git)
Performance:       PASS (1.8MB total, 384KB main, lazy chunks intact)
Production:        PASS (/version.json 5.3.0, /sw.js 200, /api/ai/chat 200)
A/B:               PASS (build mismatch, storage keys stable, schema 6 migration non-destructive)
=======================================
ALL GATES PASSED — production ready
```

## Critical rules

### NEVER accept workarounds

If deployment breaks, do NOT:

- Tell the user to "clear cache".
- Tell the user to "open incognito".
- Tell the user to "delete Service Worker".
- Tell the user to "delete localStorage".

These are NOT fixes. Find root cause, fix in code, redeploy, re-verify.

### NEVER fake AI responses

Production AI endpoints MUST call the real Z.AI public API at `https://api.z.ai/api/paas/v4`. If `ZAI_API_KEY` is missing/invalid, the endpoint MUST honestly return `{available: false, reason: 'invalid_credentials'}` (or `ai_unavailable` if unset). NEVER return `{available: true, answer: 'mock response'}`.

### NEVER break the deployment architecture

The following are load-bearing and must not be touched without explicit verification:

- `public/sw.js` — build-scoped Service Worker.
- `public/version.json` (auto-generated by Vite build).
- `src/lib/deployment.ts` — Build ID reader.
- `src/lib/appUpdateManager.ts` — Update Manager (detects SW mismatch via BroadcastChannel).
- `src/components/system/UpdateBanner.tsx` — user-visible update prompt.
- `vercel.json` — cache headers (immutable assets, must-revalidate HTML/SW/version.json).
- Stale chunk recovery — when SW detects new version but old lazy chunks are 404, app must recover gracefully (re-fetch new chunk or reload).

### NEVER skip the gate

If the user says "just deploy" or "skip checks", still run the guardian. Explain why each gate matters. The user can override individual gates only with explicit confirmation that they understand the risk.

## References

- `references/checklist.md` — full production guardian checklist (print before every deploy).
- `scripts/guardian.sh` — orchestrator.
- `scripts/security_scan.sh` — security audit.
- `scripts/performance_audit.sh` — performance audit.
- `scripts/deploy_verify.sh` — production endpoint verification + bundle audit via Vercel REST API.
- `scripts/ab_test.sh` — A/B deployment comparison.
