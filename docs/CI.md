# CI — how the monorepo is checked

The repository holds four products that share one GitHub repo:

| Platform | Path | Toolchain |
|---|---|---|
| Web (Next.js) | `src/`, `public/`, `prisma/` | Node 22, npm, Vitest |
| Desktop (Tauri 2 + Vite) | `desktop/` (+ shared `src/`) | Node 22, Rust stable, Windows runner |
| Audio engine | `audio-engine/` | Rust stable, wasm32 target |
| Android (Kotlin / Compose) | `android/` | JDK 17, Gradle 8.14, AGP 8.7, Robolectric |

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `ci.yml` | every PR, push to `main`/`master`/`develop`, manual | Checks only, no secrets (fork-safe). One job per platform, skipped when the PR does not touch that platform. |
| `vercel-deploy.yml` | same triggers as the old CI deploy jobs | Vercel preview (PR) / production (push to `main`) through Actions. Runs only when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets exist; otherwise prints a notice and skips. Real deploys are made by the Vercel Git integration. |
| `security.yml` | weekly, lockfile changes, manual | `npm audit --audit-level=high` for root and `desktop/` (production deps). |
| `bundle-analysis.yml` | PRs to main/develop touching `src/` or deps, manual | `ANALYZE=true next build`, uploads report artifact. Informational. |
| `build-android.yml` | push to `main`, tags `v*`, manual | **Legacy, unchanged.** Capacitor-based; cannot build the current native Gradle project (see "Known issues"). |
| `build-electron.yml` | tags / manual | Legacy, unchanged. |
| `setup-turso.yml` | manual | Unchanged. |

## `ci.yml` jobs

| Job | Runs when | Steps |
|---|---|---|
| `changes` | always | `dorny/paths-filter` → `web` / `desktop` / `rust` / `android` flags. Push and manual runs set all to `true`. |
| `web-lint` | web | `eslint . --ignore-pattern "desktop/**"` |
| `web-typecheck` | web | `tsc --noEmit` (root `tsconfig.json`) |
| `web-test` | web | `vitest run` |
| `web-build` | web, after the three above | `npm run build` with placeholder `DATABASE_URL` / `JWT_SECRET` |
| `desktop-web` | desktop or `src/` | root + `desktop/` `npm ci`, `eslint desktop`, `tsc -p desktop/tsconfig.json`, `vite build` → artifact `desktop-dist` |
| `desktop-tauri` | desktop or `src/` | Windows runner: `cargo fmt --check`, `cargo check --locked` in `desktop/src-tauri` (needs `desktop-dist`) |
| `rust-audio` | `audio-engine/` | `cargo fmt --check`, `cargo clippy --workspace --all-targets` (deny-level lints fail, warnings are reported), `cargo test --workspace`, `cargo check --target wasm32-unknown-unknown -p audio-wasm -p codec-wasm` |
| `android` | `android/` or parity refs | `./gradlew testDebugUnitTest -PmqApiBase=http://127.0.0.1:8717` (tests use the local `ParityStub` server, not production), then `./gradlew assembleDebug` with the default API base; uploads test reports and debug APK |
| `repo-structure` | always | `scripts/ci/check-repo-structure.mjs` (below) |
| `ci-summary` | always | Table of job results in the run summary; fails if any job failed. Use it as the single required status check. |

`src/` changes also trigger the desktop jobs because `desktop/tsconfig.json`
compiles the shared `../src` components.

### Repo structure check

`node scripts/ci/check-repo-structure.mjs [--base <ref>] [--write-baseline]`

1. **Import cycles** — `madge --circular` over `src/`. Fails on any cycle that
   is not in `.github/cycle-baseline.json`. When a cycle is fixed, run with
   `--write-baseline` and commit the smaller baseline.
2. **Large files** — on PRs, files added/modified relative to the base branch
   must be ≤ 5 MB (binaries belong in GitHub Releases, see `docs/REPO_HYGIENE_PROPOSAL.md`).
3. **Parity references** — `download/screens/parity/web-*.png` must exist
   (Android parity tests compare against them).

## Type-check scope

The root `tsconfig.json` excludes:

- `desktop/` — has its own `tsconfig.json`, checked in `desktop-web`;
- `skills/`, `.agents/` — vendored agent tooling, not part of the app build.
  `skills/` used the z-ai SDK with an image field shape (`images: [{url}]`)
  that differs from the SDK typings (`image?: string`); it cannot be verified
  at runtime here, so it is left as is and not type-checked.

## Running locally

```bash
# web
npm ci && npx eslint . --ignore-pattern "desktop/**" && npx tsc --noEmit && npm test
# desktop
(cd desktop && npm ci --ignore-scripts && npx tsc --noEmit -p tsconfig.json && npx vite build)
# audio engine
(cd audio-engine && cargo fmt --all -- --check && cargo clippy --workspace --all-targets && cargo test --workspace)
# android (JDK 17 + Android SDK 35)
(cd android && ./gradlew testDebugUnitTest -PmqApiBase=http://127.0.0.1:8717 && ./gradlew assembleDebug)
# structure
node scripts/ci/check-repo-structure.mjs --base origin/main
```

Android parity tests read reference screenshots from
`download/screens/parity` (Gradle passes the absolute path as the
`mq.parityDir` system property; previously it was a hard-coded machine path).

## Known issues / follow-ups

- **Rust clippy warnings**: 77 warnings in `audio-engine` (unnecessary `unsafe`,
  excessive float precision, needless range loops, …). Not errors; left for a
  dedicated cleanup PR.
- **Android unit tests**: see the PR description for the current local result.
- **`build-android.yml`** still uses Capacitor (`npx cap add/sync`) and JDK 21,
  but `android/` is a native Gradle project, so it fails on every push to
  `main`. Proposed replacement (needs owner approval because it changes the
  release process): native `./gradlew assembleRelease bundleRelease` on `v*`
  tags and manual runs only, signing from the existing `ANDROID_*` secrets via
  `keystore.properties`, refuse to publish unsigned builds, asset name
  `MQPlayer.apk` (the web app links to `releases/latest/download/MQPlayer.apk`;
  the old workflow uploads `mq-player.apk`, which does not match).
- **npm audit (root) fails**: 5 critical / 13 high advisories in production
  dependencies (incl. `next`, `@sentry/nextjs`, `tar`, `proxy-addr`,
  `@capacitor/android`). The old CI hid this with `continue-on-error`.
  `security.yml` reports it honestly; it is not part of `ci.yml`, so it does
  not block merges. Upgrades need a separate, tested PR (`next` is a
  framework update). `desktop/` audit passes.
- **Node matrix**: the old CI ran Node 20 and 22; now a single Node 22. Add a matrix back if Node 20 support matters.
