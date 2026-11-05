#!/usr/bin/env node
// Repository structure gate (CI job "repo-structure").
//  1. Circular imports in src/: no NEW cycle vs .github/cycle-baseline.json
//     (fixed cycles are reported so the baseline can be tightened).
//  2. Large files: a PR must not add/modify files > MAX_MB outside the allow-list.
//  3. Parity references: download/screens/parity must keep its web-*.png
//     references (used by the Android visual-parity tests).
// Usage: node scripts/ci/check-repo-structure.mjs [--base <git-ref>] [--write-baseline]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : process.env.BASE_REF || "";
const writeBaseline = args.includes("--write-baseline");
const MAX_MB = Number(process.env.MAX_FILE_MB || 5);
const ALLOW_LARGE = [/^download\/screens\/parity\//, /^public\/.*\.(wasm)$/];
const BASELINE = ".github/cycle-baseline.json";
let failed = false;
const fail = (msg) => { failed = true; console.log(`::error::${msg}`); };

// ── 1. cycles ────────────────────────────────────────────────────────────
// madge exits 1 when cycles exist; the JSON is still on stdout.
let madgeOut;
try {
  madgeOut = execFileSync("npx", ["-y", "madge@8.0.0", "--circular", "--json", "--extensions", "ts,tsx", "--ts-config", "tsconfig.json", "src"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  if (!err.stdout) throw err;
  madgeOut = err.stdout;
}
const cycles = JSON.parse(madgeOut).map((c) => c.join(" > ")).sort();
if (writeBaseline) {
  writeFileSync(BASELINE, JSON.stringify({ note: "Known circular-import chains in src/. CI fails on any chain not listed here. Remove entries when cycles are fixed.", cycles }, null, 2) + "\n");
  console.log(`baseline written: ${cycles.length} cycles`);
} else {
  const known = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).cycles : [];
  const added = cycles.filter((c) => !known.includes(c));
  const fixed = known.filter((c) => !cycles.includes(c));
  console.log(`cycles: ${cycles.length} (baseline ${known.length})`);
  for (const c of added) fail(`new circular import: ${c}`);
  for (const c of fixed) console.log(`::notice::cycle fixed — remove from baseline: ${c}`);
}

// ── 2. large files ───────────────────────────────────────────────────────
if (base) {
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  let big = 0;
  for (const f of changed) {
    if (!existsSync(f)) continue;
    const mb = statSync(f).size / 1e6;
    if (mb > MAX_MB && !ALLOW_LARGE.some((r) => r.test(f))) { big++; fail(`large file (${mb.toFixed(1)} MB > ${MAX_MB} MB): ${f} — use GitHub Releases / CI artifacts`); }
  }
  console.log(`changed files checked: ${changed.length}, oversized: ${big}`);
} else {
  console.log("large-file check skipped (no --base / BASE_REF; runs on pull requests)");
}

// ── 3. parity references ─────────────────────────────────────────────────
const parity = "download/screens/parity";
const refs = existsSync(parity) ? readdirSync(parity).filter((f) => /^web-.*\.png$/.test(f)) : [];
if (refs.length === 0) fail(`${parity} has no web-*.png references (required by Android parity tests)`);
else console.log(`parity references: ${refs.length} web-*.png`);

process.exit(failed ? 1 : 0);
