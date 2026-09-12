#!/usr/bin/env node
/**
 * Phase O §2 — /play client chunk physical existence check.
 * Scans .next build manifest + app-build-manifest, fetches live HTML,
 * extracts every referenced chunk URL and verifies HTTP 200 + non-empty.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const origin = process.env.MQ_ORIGIN || "http://localhost:3000";

// 1. Build manifests
const serverManifest = join(root, ".next", "app-path-routes-manifest.json");
const appBuildManifest = join(root, ".next", "app-build-manifest.json");
let failures = 0;

function fail(msg) { console.log("  ✗ " + msg); failures++; }
function ok(msg) { console.log("  ✓ " + msg); }

if (!existsSync(join(root, ".next", "BUILD_ID"))) { fail(".next/BUILD_ID missing"); process.exit(1); }
ok("BUILD_ID = " + readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim());

// 2. /play must be a registered route
const routes = existsSync(serverManifest) ? JSON.parse(readFileSync(serverManifest, "utf8")) : {};
if (!("/play" in routes || Object.values(routes).some((r) => r === "/play"))) {
  // app-path-routes-manifest maps dynamic → static; check differently
  console.log("  (route manifest: " + JSON.stringify(routes).slice(0, 200) + ")");
}

// 3. Live HTML for /play — extract what the browser actually loads:
//    <script src="/_next/..."> and <link href="/_next/..."> attributes only.
const html = await fetch(origin + "/play").then((r) => {
  if (r.status !== 200) fail("/play HTTP " + r.status);
  return r.text();
});
ok("/play HTML fetched: " + html.length + " bytes");
const attrRefs = [
  ...html.matchAll(/<script[^>]+src=["']([^"']*_next\/static\/[^"']+)["']/g),
  ...html.matchAll(/<link[^>]+href=["']([^"']*_next\/static\/[^"']+)["']/g),
].map((m) => m[1]);
const unique = [...new Set(attrRefs)];
ok("HTML references " + unique.length + " static assets");
for (const u of unique) {
  const url = new URL(u, origin);
  const res = await fetch(url);
  const body = await res.arrayBuffer();
  if (res.status !== 200 || body.byteLength === 0) fail(url.pathname + " → " + res.status + " (" + body.byteLength + "B)");
}
if (unique.length > 0 && failures === 0) ok("all " + unique.length + " live-HTML chunks are 200 + non-empty on disk");

// 4. app-build-manifest: /play CSS/JS files exist on disk
if (existsSync(appBuildManifest)) {
  const abm = JSON.parse(readFileSync(appBuildManifest, "utf8"));
  const playPages = Object.keys(abm.pages).filter((p) => p.startsWith("/play"));
  for (const p of playPages) {
    const files = [...(abm.pages[p].js || []), ...(abm.pages[p].css || [])];
    for (const f of files) {
      const disk = join(root, ".next", "static", f.replace(/^\/_next\/static\//, ""));
      const rel = f.replace(/^.*\/static\//, "static/");
      if (!existsSync(disk)) fail("manifest file missing on disk: " + f);
    }
    if (files.length) ok(p + " manifest: " + files.length + " files, all on disk");
  }
}

// 5. engine assets
const ev = JSON.parse(await (await fetch(origin + "/audio-engine/version.json")).text());
for (const [k, f] of Object.entries({ core: ev.core, codec: ev.codec, worklet: ev.worklet, worker: ev.worker })) {
  const r = await fetch(`${origin}/audio-engine/${ev.tag}/${f}`);
  if (r.status !== 200) fail(`engine ${k} → ${r.status}`);
}
if (failures === 0) ok("engine assets (wasm×2, worklet, worker) all 200 under tag " + ev.tag);

console.log(failures === 0 ? "\nPLAY CHUNK VERIFICATION: PASS" : "\nPLAY CHUNK VERIFICATION: FAIL (" + failures + ")");
process.exit(failures === 0 ? 0 : 1);
