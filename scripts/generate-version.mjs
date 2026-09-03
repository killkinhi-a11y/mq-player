#!/usr/bin/env node
/**
 * generate-version.mjs — Phase M build identity generator.
 *
 * Runs as `prebuild` (npm lifecycle) BEFORE `next build`.
 * Writes two artifacts that MUST stay in sync:
 *   1. public/version.json   — runtime version metadata (served with
 *      Cache-Control: no-store; the UpdateManager fetches it to detect
 *      new deployments). Never immutable — always revalidates.
 *   2. .mq-build-id          — read by next.config.ts generateBuildId() so
 *      `__NEXT_DATA__.buildId` (baked into every HTML page) equals the
 *      buildId in version.json. Same build → same id, by construction.
 *
 * Version detection compares:
 *   page buildId  (window.__NEXT_DATA__.buildId — what the RUNNING page is)
 *   vs
 *   version.json  (what is CURRENTLY deployed on the server)
 *   → different = new deployment exists → UpdateBanner.
 *
 * Fallbacks: no git / no VERCEL_* env → timestamp-based ids so local builds
 * still work and never collide with deployed ones.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function safeExec(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

// ── Commit hash: Vercel env first, then git ──
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  safeExec("git rev-parse HEAD") ||
  null;
const commitShort = commit ? commit.slice(0, 8) : null;

// ── Build id: mq-build-<sha8> (or timestamp fallback) ──
// Deterministic per commit: two CI retries of the same commit produce the
// same id — important so a re-deploy of the SAME commit is NOT reported as
// an update to already-open tabs.
const buildId = commitShort
  ? `mq-build-${commitShort}`
  : `mq-build-local-${Date.now().toString(36)}`;

// ── Human version number: monotonically increasing ──
// 1) explicit override, 2) previous version.json + 1, 3) git commit count, 4) epoch-derived
function nextVersionNumber() {
  if (process.env.MQ_VERSION) return process.env.MQ_VERSION;
  const prevPath = join(root, "public", "version.json");
  if (existsSync(prevPath)) {
    try {
      const prev = JSON.parse(readFileSync(prevPath, "utf8"));
      const n = parseInt(prev.version, 10);
      if (Number.isFinite(n)) {
        // If same buildId, keep same version (idempotent local re-builds)
        if (prev.buildId === buildId) return String(n);
        return String(n + 1);
      }
    } catch {}
  }
  const count = safeExec("git rev-list --count HEAD");
  if (count && Number.isFinite(parseInt(count, 10))) return String(parseInt(count, 10));
  return "1";
}

const version = nextVersionNumber();
const releasedAt = new Date().toISOString();

const payload = { version, buildId, commit: commit || buildId, releasedAt };

writeFileSync(join(root, "public", "version.json"), JSON.stringify(payload, null, 2) + "\n");
writeFileSync(join(root, ".mq-build-id"), buildId + "\n");

// .mq-build-id must not be committed (it is per-build, regenerated on CI)
const gitignorePath = join(root, ".gitignore");
if (existsSync(gitignorePath)) {
  const gi = readFileSync(gitignorePath, "utf8");
  if (!gi.includes(".mq-build-id")) {
    writeFileSync(gitignorePath, gi.replace(/\s*$/, "\n") + ".mq-build-id\n");
  }
}

console.log(`[generate-version] buildId=${buildId} version=${version} commit=${(commit || "n/a").slice(0, 12)}`);
