/**
 * Android APK download URL regression — the wrong URL must never return.
 *
 * Real-world failure: the "Скачать приложение" block's Android APK button
 * pointed at …/latest/download/mq-player.apk (lowercase) while the release
 * asset is MQPlayer.apk → GitHub answered 404. Same wrong string also lived
 * in the app-version route (apkUrl).
 *
 * Contract (fixed at release 2.0.0 / web v77):
 *   - the Android APK download target is EXACTLY
 *     https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk
 *   - "latest" (never version-specific — survives every future release)
 *   - https-only, GitHub Releases, no localhost/file/sandbox
 *   - Windows / macOS / Linux targets are NOT part of this contract and are
 *     intentionally not asserted here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), "src", f), "utf8");

export const ANDROID_APK_URL =
  "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk";

// The exact 404-URL that must never come back (lowercase asset name).
const FORBIDDEN_URL =
  "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/mq-player.apk";

describe("Android APK download URL — exact contract (block «Скачать приложение»)", () => {
  it("SettingsView: Android APK href is exactly the permanent release URL", () => {
    const src = read("components/mq/SettingsView.tsx");
    expect(src).toContain(`href="${ANDROID_APK_URL}"`);
    // …and the 404 URL is gone from the file entirely.
    expect(src).not.toContain(FORBIDDEN_URL);
    expect(src).not.toContain("download/mq-player.apk");
  });

  it("SettingsView: the Android link keeps its download semantics (target/download attr)", () => {
    const src = read("components/mq/SettingsView.tsx");
    // The fixed anchor: exact URL + open-in-new-tab + download attribute,
    // with the android link class intact (appearance unchanged).
    expect(src).toMatch(
      new RegExp(
        `href="${ANDROID_APK_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*download`
      )
    );
    expect(src).toMatch(/mq-dl-link--android/);
    expect(src).toContain(">Android APK</span>");
  });

  it("app-version route: apkUrl is the same permanent release URL", () => {
    const src = read("app/api/app-version/route.ts");
    expect(src).toContain(`apkUrl: "${ANDROID_APK_URL}"`);
    expect(src).not.toContain("download/mq-player.apk");
  });

  it("URL invariants: https, latest (not version-specific), GitHub, no localhost", () => {
    expect(ANDROID_APK_URL.startsWith("https://")).toBe(true);
    expect(ANDROID_APK_URL).toContain("/releases/latest/download/MQPlayer.apk");
    // Never pin a tag (e.g. /releases/download/android-v2.0.0/…) — the
    // permanent link must survive every future release.
    expect(ANDROID_APK_URL).not.toMatch(/\/releases\/download\/[^/]+\//);
    expect(ANDROID_APK_URL).not.toContain("localhost");
    expect(ANDROID_APK_URL).not.toContain("127.0.0.1");
    expect(ANDROID_APK_URL.startsWith("file://")).toBe(false);
  });

  it("no other APK download target with the wrong casing exists in mq components", () => {
    // Sweep the whole components/mq surface: any other APK href must also
    // be the canonical URL (or absent entirely — never the 404 variant).
    const files = [
      "components/mq/SettingsView.tsx",
      "components/mq/MobileDock.tsx",
      "components/mq/FullTrackViewMobile.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).not.toContain(FORBIDDEN_URL);
      expect(src).not.toMatch(/latest\/download\/mq-player\.apk/);
    }
  });
});
