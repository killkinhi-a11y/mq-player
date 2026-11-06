/**
 * Release download links in docs + native clients (Stage V, task H).
 *
 * Fact base (GitHub Releases API, checked at Stage V):
 *  - latest release = android-v2.3.5, its only asset is `MQPlayer.apk`
 *    → `releases/latest/download/mq-player.apk` is a 404;
 *  - the current Windows build is the Tauri installer of `desktop-v1.0.0`
 *    (`MQ.Player_1.0.0_x64-setup.exe`) — the same target the web Settings
 *    and the desktop updater (desktop/updates/latest.json) use. The old
 *    `v1.0.1/MQ-Player-Setup.zip` is the April Electron build.
 *
 * Live availability is checked by `node scripts/ci/check-release-links.mjs`
 * (network); this test is the offline guard against regressions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), "utf8");

const REPO = "https://github.com/killkinhi-a11y/mq-player";
export const ANDROID_APK_URL = `${REPO}/releases/latest/download/MQPlayer.apk`;
export const WINDOWS_SETUP_URL = `${REPO}/releases/download/desktop-v1.0.0/MQ.Player_1.0.0_x64-setup.exe`;

const FORBIDDEN = [
  `${REPO}/releases/latest/download/mq-player.apk`,
  `${REPO}/releases/download/v1.0.1/MQ-Player-Setup.zip`,
];

const SURFACES = [
  "README.md",
  "SALE.md",
  "android/README.md",
  "android/app/src/main/kotlin/com/mq1/player/ui/screens/SettingsScreen.kt",
  "android/app/src/main/kotlin/com/mq1/player/data/AppRelease.kt",
  "src/components/mq/SettingsView.tsx",
  "src/lib/androidRelease.ts",
];

describe("release links — docs and clients point at real, current assets", () => {
  it.each(SURFACES)("%s contains no known-404 / outdated download URL", (f) => {
    const src = read(f);
    for (const bad of FORBIDDEN) expect(src, `${f} still links ${bad}`).not.toContain(bad);
  });

  it("README and SALE link the permanent Android APK and the current Windows installer", () => {
    for (const f of ["README.md", "SALE.md"]) {
      const src = read(f);
      expect(src).toContain(ANDROID_APK_URL);
      expect(src).toContain(WINDOWS_SETUP_URL);
    }
  });

  it("web Settings and Android Settings offer the SAME Windows installer", () => {
    expect(read("src/components/mq/SettingsView.tsx")).toContain(WINDOWS_SETUP_URL);
    expect(read("android/app/src/main/kotlin/com/mq1/player/ui/screens/SettingsScreen.kt")).toContain(WINDOWS_SETUP_URL);
  });

  it("the Windows link matches the asset the desktop updater installs", () => {
    const latest = JSON.parse(read("desktop/updates/latest.json")) as {
      platforms: Record<string, { url: string }>;
    };
    const urls = Object.values(latest.platforms).map((p) => p.url);
    expect(urls).toContain(WINDOWS_SETUP_URL);
  });

  it("the link checker covers every surface", () => {
    const checker = read("scripts/ci/check-release-links.mjs");
    for (const f of SURFACES) expect(checker).toContain(f);
  });
});
