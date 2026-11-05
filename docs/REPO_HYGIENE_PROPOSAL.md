# Stage I — Repo hygiene: analysis & proposal

> Analysis only. This PR does **not** delete files, rewrite history or force-push.
> Every action below needs owner approval and is to be done in separate PRs.

## Facts (measured on a mirror clone, main @ 7d4e2d2)

| Item | Value |
|---|---|
| Packed repo (all history) | **~648 MB**, 24 984 objects, 13 701 blobs |
| `download/` in working tree | 1 594 tracked files, ~619 MB (≈530 MB images, ≈77 MB binaries: apk/aab/exe/sig) |
| `download/screens/parity` | ~3.3 MB — **used by Android parity tests** (`ParityHarness.kt`, `ParityScreenshotsTest.kt`) — KEEP |
| `skills/` | 1 139 files, ~72 MB (incl. 20 MB html templates, 10.7 MB `tectonic` binary) — not imported by app code |
| `.agents/` | 1 491 files, ~14 MB — agent tooling, not used by app |
| History only (already untracked) | `.next/` ~152 MB, `tsconfig.tsbuildinfo` ~35 MB (89 versions), `.open-next/` ~18 MB, `worklog.md` ~55 MB cumulative (166 versions) |
| `out/` | 7 files (static stub: index.html, sw.js, icons) |
| Sandbox-specific scripts | `keep-alive.sh`, `restart.sh`, `start.sh`, `scripts/repo-hygiene-prepush.sh` hardcode `/home/z/my-project` |
| Notes in root | `worklog.md` (722 KB), `worklog-dc.md`, `worklog-phase4b.md`, `SALE.md`, `agent-ctx/` |
| Secrets scan (paths) | only `.env.example` files in history; no `.env` committed (content scan not done — recommend gitleaks) |

`.gitignore` already covers `.next/`, `.open-next/`, `*.tsbuildinfo`; `vercel.json` excludes `download/`, `skills/`, `agent-ctx/` from functions, so prod is not affected by these folders.

## Proposals (ordered by risk, lowest first)

1. **Release binaries → GitHub Releases** (apk/aab/exe/sig, ~77 MB). App already points to
   `releases/latest/download/MQPlayer.apk` and `releases/download/desktop-v1.0.0/...`. Verify these release assets exist, then `git rm` binaries from `download/` + add `download/**/*.{apk,aab,exe,sig}` to `.gitignore`.
2. **QA screenshots (`download/qa-*`, `ui-v*`, `ref-analysis`, `v9-qa`, …, ~500 MB)** → move to an archive (GitHub Release asset zip, or separate `mq-qa-artifacts` repo, or Git LFS). Keep `download/screens/parity/` in repo (test fixtures) — ideally relocate to `android/app/src/test/resources/parity/` in a later PR with test path update.
3. **`skills/`, `.agents/`, `agent-ctx/`** → not app code. Move to a separate repo or ignore; confirm no build/CI step uses them (only `scripts/repo-hygiene-prepush.sh` references them).
4. **Root notes** → `worklog*.md`, `SALE.md`, `AUDIO_ENGINE_ARCHITECTURE.md`, `MOBILE_OPTIMIZATION_PLAN.md` → `docs/` (keep content, git mv preserves history).
5. **Sandbox scripts** (`keep-alive.sh`, `restart.sh`, `start.sh`, `repo-hygiene-prepush.sh`) → `scripts/legacy/` or delete; not used by Vercel.
6. **`out/`** → check whether anything serves it (Capacitor/Tauri `frontendDist`?); if not, remove + ignore.
7. **History rewrite** (optional, *only with explicit approval*): `git filter-repo --strip-blobs-bigger-than 1M` or path-based removal of `download/`, `.next/`, `tsconfig.tsbuildinfo`, `.open-next/` would cut the pack from ~648 MB to an estimated <100 MB. Requires force-push, all clones re-clone, open PRs rebased. **Not done.**

## Not done / needs owner decision
- Whether QA screenshots have archival value (which ones to keep).
- Whether GitHub Releases already contain all binaries referenced in `download/`.
- Any history rewrite.
