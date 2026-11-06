#!/usr/bin/env node
/**
 * Live check of every GitHub Releases download link in docs + clients.
 * Follows redirects and requests 1 byte (Range) — never downloads a build.
 * Usage: node scripts/ci/check-release-links.mjs   (exit 1 on any non-2xx)
 */
import { readFileSync } from "node:fs";

const SURFACES = [
  "README.md",
  "SALE.md",
  "android/README.md",
  "android/app/src/main/kotlin/com/mq1/player/ui/screens/SettingsScreen.kt",
  "android/app/src/main/kotlin/com/mq1/player/data/AppRelease.kt",
  "src/components/mq/SettingsView.tsx",
  "src/lib/androidRelease.ts",
  "desktop/updates/latest.json",
];
const RE = /https:\/\/github\.com\/killkinhi-a11y\/mq-player\/releases\/(?:latest\/)?download\/[^\s"'`)<>]+/g;

const found = new Map();
for (const f of SURFACES) {
  for (const url of readFileSync(f, "utf8").match(RE) ?? []) {
    if (!found.has(url)) found.set(url, new Set());
    found.get(url).add(f);
  }
}
let failed = 0;
for (const [url, files] of found) {
  let status = 0;
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" }, redirect: "follow" });
    status = res.status;
    await res.body?.cancel();
  } catch (e) {
    status = `ERR ${e.message}`;
  }
  const ok = typeof status === "number" && status >= 200 && status < 300;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${status} ${url}  ← ${[...files].join(", ")}`);
}
process.exit(failed ? 1 : 0);
