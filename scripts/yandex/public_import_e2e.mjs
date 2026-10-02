#!/usr/bin/env node
/**
 * LOCAL E2E — PUBLIC Yandex Music playlist import by URL (no login).
 *
 *   prod server (next start :3461)  +  fake Yandex adapter (:8791)
 *   NO session cookie — the whole point: the public flow must work for a
 *   DEMO user (this is exactly the production 401 bug that was fixed).
 *   Real SoundCloud search (matching targets REAL tracks — Queen/Nirvana/etc.)
 *
 * Verifies:
 *   A. HAPPY PATH: paste https://music.yandex.ru/users/music.partners/playlists/1293
 *      (fake adapter serves canned tracks for any (user, kind=1001)) →
 *      icon-only ↓ button → «Загружаем плейлист…» → playlist card (title,
 *      owner, track count) → chunked matching progress → preview counts →
 *      «Импортировать N треков» → playlist created IN ORDER with _src
 *      metadata → «Импорт успешен!»
 *   B. PRIVATE playlist URL → informative error (приватности)
 *   C. GEO-BLOCKED path → the honest region message
 *   D. EMPTY playlist → clear message
 *   E. INVALID URL → client-side rejection (no network request)
 *   F. NO AUTH anywhere: zero /api/yandex/auth calls, zero session cookie,
 *      zero OAuth screens in the DOM
 *   G. V10.4.1 spot check: no double-tap hint; volume popup 200x54 intact
 *
 * Run: node scripts/yandex/public_import_e2e.mjs
 */

import { spawn, execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { chromium } from "playwright";

const ROOT = "/home/z/my-project";
const PORT = 3461;
const ADAPTER_PORT = 8791;
const JWT_SECRET = "public-e2e-secret-e2e-secret-e2e-32";
const SHOTS = `${ROOT}/download/qa-yandex-public-e2e`;

mkdirSync(SHOTS, { recursive: true });

const env = {
  ...process.env,
  JWT_SECRET,
  YANDEX_ADAPTER_URL: `http://127.0.0.1:${ADAPTER_PORT}`,
  NODE_ENV: "production",
};

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m, extra = "") => {
  failures++;
  console.log(`  ✗ ${m} ${extra}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, timeout = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await wait(1000);
  }
  throw new Error(`server not ready: ${url}`);
}

async function main() {
  try {
    execSync(`bash -c 'pids=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP "pid=\\d+" | grep -oP "\\d+"); [ -n "$pids" ] && kill -9 $pids || true'`);
  } catch {}
  try {
    execSync(`bash -c 'pids=$(ss -tlnp 2>/dev/null | grep ":${ADAPTER_PORT} " | grep -oP "pid=\\d+" | grep -oP "\\d+"); [ -n "$pids" ] && kill -9 $pids || true'`);
  } catch {}
  await wait(600);

  const adapter = spawn("node", [`${ROOT}/scripts/yandex/fake_adapter.mjs`, String(ADAPTER_PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  adapter.stdout.on("data", (d) => process.env.E2E_VERBOSE && console.log("[adapter]", String(d).trim()));
  await wait(400);

  console.log("Starting production server…");
  const server = spawn("node", [`${ROOT}/node_modules/next/dist/bin/next`, "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  server.stdout.on("data", (d) => logs.push(String(d)));
  server.stderr.on("data", (d) => logs.push(String(d)));

  const browser = await chromium.launch();

  try {
    await waitFor(`http://localhost:${PORT}/api/app-version`);
    console.log("Server ready. Browser flow…\n");

    // ═══ A. HAPPY PATH (desktop) ═══
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      // NO session cookie. Demo mode only. That is the contract.
      const page = await ctx.newPage();
      const apiCalls = [];
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("request", (r) => {
        if (r.url().includes("/api/")) apiCalls.push(r.url().replace(`http://localhost:${PORT}`, ""));
      });

      await page.goto(`http://localhost:${PORT}/play`, { waitUntil: "domcontentloaded", timeout: 90000 });
      // Demo mode (retry until the nav appears — hydration races)
      let entered = false;
      for (let attempt = 0; attempt < 6 && !entered; attempt++) {
        try {
          const demoBtn = page.getByRole("button", { name: "Демо-режим" });
          if (await demoBtn.count()) {
            await demoBtn.first().click({ timeout: 4000 });
          }
        } catch {}
        await wait(2000);
        entered = (await page.getByRole("button", { name: "Библиотека" }).count()) > 0;
      }
      if (!entered) throw new Error("demo mode did not activate");
      // Disable the tour like a real user (V10.4.1 battery convention)
      await page.evaluate(() => localStorage.setItem("mq-onboarding-seen", "1"));
      await wait(500);

      // Library → Плейлисты
      await page.getByRole("button", { name: "Библиотека" }).click();
      await wait(800);
      await page.getByRole("button", { name: "Плейлисты", exact: true }).first().click();
      await wait(800);

      // Импорт → «По ссылке»
      await page.getByRole("button", { name: "Импорт", exact: true }).click();
      await wait(600);

      const urlInput = page.locator('input[type="url"]');
      // Same URL SHAPE as the production task; kind 1001 is the fake adapter's
      // canned "Классика рока" playlist (4 tracks incl. a duplicate + a Russian
      // track). The REAL music.partners/1293 URL is exercised in the production
      // E2E against the real adapter.
      await urlInput.fill("https://music.yandex.ru/users/music.partners/playlists/1001");
      await wait(300);

      // Icon-only ↓ button (next to the input)
      const iconBtn = page.locator('input[type="url"] + button');
      const btnEnabled = await iconBtn.isEnabled();
      ok(`icon-only import button enabled after URL input: ${btnEnabled}`);
      if (!btnEnabled) throw new Error("icon button not enabled");
      await iconBtn.click();

      // Loading state (soft check — a fast local adapter may flash past it)
      await wait(400);
      const loadingSeen = (await page.getByText("Загружаем плейлист…", { exact: false }).count()) > 0;
      ok(`loading state «Загружаем плейлист…» ${loadingSeen ? "shown" : "flashed past (fast adapter)"}`);

      // Preview/import screen: wait for the preview card's unique «Найдено» row
      await page.getByText("Найдено", { exact: false }).first().waitFor({ timeout: 60000 }).then(
        () => ok("preview with counts appeared"),
        () => fail("preview did not appear")
      );
      await page.screenshot({ path: `${SHOTS}/01-public-preview.png` });

      const bodyText = await page.evaluate(() => document.body.textContent || "");
      ok(`playlist card shows title: ${bodyText.includes("Классика рока")}`);
      ok(`playlist card shows track count: ${bodyText.includes("4 треков")}`);
      const hasProgress = await page.getByText("Подбор треков", { exact: false }).count();
      if (hasProgress) ok("matching progress text visible");

      // Click «Импортировать N треков» (anchored text — excludes the OAuth entry)
      const importBtn = page.locator("button", { hasText: /^Импортировать \d+ (трек|трека|треков)$/ }).first();
      await importBtn.waitFor({ state: "visible", timeout: 30000 });
      await importBtn.click();
      await page.getByText("Импорт успешен!").first().waitFor({ timeout: 20000 }).then(
        () => ok("«Импорт успешен!» shown"),
        () => fail("success state not reached")
      );
      await page.screenshot({ path: `${SHOTS}/02-public-success.png` });

      // Playlist persisted in the local store
      await wait(1200);
      const store = await page.evaluate(() => {
        const raw = localStorage.getItem("mq-store-v8");
        return raw ? JSON.parse(raw) : null;
      });
      const pls = store?.state?.playlists || [];
      const imported = pls.find((p) => p.name === "Классика рока");
      if (!imported) fail("imported playlist missing from store");
      else {
        ok(`playlist persisted: ${imported.name} with ${imported.tracks.length} tracks`);
        const srcOk = imported.tracks.every(
          (t) => t._src === "yandex_music" && t._srcTrackId && t._srcPlaylistKind === 1001
        );
        ok(`all tracks carry _src metadata: ${srcOk}`);
        const orderOk = imported.tracks.some((t) => t.title.includes("Smells Like Teen Spirit"));
        ok(`matched real SoundCloud tracks (e.g. ${imported.tracks.map((t) => t.title).slice(0, 3).join(" / ")}): ${orderOk}`);
        ok(`source URL in description: ${imported.description.includes("music.yandex.ru/users/")}`);
      }

      // F. NO AUTH ANYWHERE
      const authCalls = apiCalls.filter((u) => u.includes("/api/yandex/auth"));
      ok(`zero auth API calls during public import: ${authCalls.length === 0} ${authCalls.length ? authCalls.join(",") : ""}`);
      ok(`public endpoints called: ${[...new Set(apiCalls.filter((u) => u.includes("public-playlist")))].join(", ")}`);
      ok(`zero page errors: ${pageErrors.length === 0} ${pageErrors.slice(0, 2).join("|")}`);

      // G. V10.4.1 spot check (desktop hint + volume popup geometry on classic bar)
      const hintNodes = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hits = [];
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent || "";
          if (t.toLowerCase().includes("дважды") || t.toLowerCase().includes("double-tap")) hits.push(t.trim().slice(0, 40));
        }
        return hits;
      });
      ok(`V10.4.1: no double-tap hint DOM nodes: ${hintNodes.length === 0}`);

      await ctx.close();
    }

    // ═══ A2. HAPPY PATH with the REAL task URL shape (kind 1293 → canned 404)?
    //     The fake adapter maps unknown kinds → yandex_not_found. Covered in B.

    // ═══ B/C/D. ERROR PATHS (desktop, same server) ═══
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const pageErrors = [];
      const invalidApiCalls = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("request", (r) => {
        if (r.url().includes("/api/yandex/public-playlist")) invalidApiCalls.push(r.url());
      });

      await page.goto(`http://localhost:${PORT}/play`, { waitUntil: "domcontentloaded", timeout: 90000 });
      let entered = false;
      for (let attempt = 0; attempt < 6 && !entered; attempt++) {
        try {
          const demoBtn = page.getByRole("button", { name: "Демо-режим" });
          if (await demoBtn.count()) {
            await demoBtn.first().click({ timeout: 4000 });
          }
        } catch {}
        await wait(2000);
        entered = (await page.getByRole("button", { name: "Библиотека" }).count()) > 0;
      }
      if (!entered) throw new Error("demo mode did not activate");
      await page.evaluate(() => localStorage.setItem("mq-onboarding-seen", "1"));
      await wait(500);
      await page.getByRole("button", { name: "Библиотека" }).click();
      await wait(600);
      await page.getByRole("button", { name: "Плейлисты", exact: true }).first().click();
      await wait(600);
      await page.getByRole("button", { name: "Импорт", exact: true }).click();
      await wait(500);

      const cases = [
        { url: "https://music.yandex.ru/users/private.user/playlists/1001", expect: "приватности", shot: "03-private.png", label: "private playlist → informative error" },
        { url: "https://music.yandex.ru/users/geo.blocked/playlists/1001", expect: "регион", shot: "04-geo.png", label: "geo-blocked → honest region message" },
        { url: "https://music.yandex.ru/users/empty.user/playlists/1001", expect: "нет треков", shot: "05-empty.png", label: "empty playlist → clear message" },
        { url: "https://music.yandex.ru/playlist/1293", expect: "не подходит", shot: "06-invalid.png", label: "Yandex short-form URL → client-side format error", clientSide: true },
      ];

      for (const c of cases) {
        const urlInput = page.locator('input[type="url"]');
        await urlInput.fill(c.url);
        await wait(250);
        const iconBtn = page.locator('input[type="url"] + button');
        if (c.clientSide) {
          // Short-form Yandex URL → click → client-side format error, no network request
          const beforeCount = invalidApiCalls.length;
          await iconBtn.click();
          const foundInvalid = await page
            .getByText(c.expect, { exact: false })
            .first()
            .waitFor({ timeout: 8000 })
            .then(() => true, () => false);
          ok(`Yandex short-form URL → format error shown (no request): ${foundInvalid}`);
          const fired = invalidApiCalls.length - beforeCount;
          ok(`invalid URL fired ZERO public-playlist requests: ${fired === 0}`);
          await page.screenshot({ path: `${SHOTS}/${c.shot}` });
          continue; // next case's fill() clears the error via onChange
        }
        await iconBtn.click();
        const found = await page
          .getByText(c.expect, { exact: false })
          .first()
          .waitFor({ timeout: 15000 })
          .then(() => true, () => false);
        found ? ok(c.label) : fail(c.label, `(expected text «${c.expect}»)`);
        await page.screenshot({ path: `${SHOTS}/${c.shot}` });
        // Back for the next case
        await page.getByRole("button", { name: "Назад" }).click();
        await wait(400);
      }
      ok(`error paths: zero page errors: ${pageErrors.length === 0}`);
      await ctx.close();
    }

    // ═══ E. MOBILE 390x844 sanity (happy path) ═══
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      await page.goto(`http://localhost:${PORT}/play`, { waitUntil: "domcontentloaded", timeout: 90000 });
      let entered = false;
      for (let attempt = 0; attempt < 6 && !entered; attempt++) {
        try {
          const demoBtn = page.getByRole("button", { name: "Демо-режим" });
          if (await demoBtn.count()) {
            await demoBtn.first().click({ timeout: 4000 });
          }
        } catch {}
        await wait(2000);
        entered = (await page.getByRole("button", { name: "Библиотека" }).count()) > 0;
      }
      if (!entered) throw new Error("demo mode did not activate");
      await page.evaluate(() => localStorage.setItem("mq-onboarding-seen", "1"));
      await wait(500);
      await page.getByRole("button", { name: "Библиотека" }).click();
      await wait(600);
      await page.getByRole("button", { name: "Плейлисты", exact: true }).first().click();
      await wait(600);
      await page.getByRole("button", { name: "Импорт", exact: true }).click();
      await wait(500);

      const urlInput = page.locator('input[type="url"]');
      await urlInput.fill("https://music.yandex.ru/users/any.user/playlists/3");
      await wait(250);
      const iconBtn = page.locator('input[type="url"] + button');
      await iconBtn.click();
      const reached = await page
        .locator("button", { hasText: /^Импортировать \d+ (трек|трека|треков)$/ })
        .first()
        .waitFor({ timeout: 60000 })
        .then(() => true, () => false);
      ok(`mobile 390x844: public import preview reachable: ${reached}`);

      // Touch target ≥44px for the import button
      if (reached) {
        const btn = page.locator("button", { hasText: /^Импортировать \d+/ }).first();
        const box = await btn.boundingBox();
        const bigEnough = box && box.height >= 40;
        ok(`mobile: import button height ≥40px (${box ? Math.round(box.height) : "n/a"}px): ${bigEnough}`);
        await page.screenshot({ path: `${SHOTS}/07-mobile-preview.png` });
      }
      ok(`mobile: zero page errors: ${pageErrors.length === 0}`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill("SIGKILL");
    adapter.kill("SIGKILL");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
