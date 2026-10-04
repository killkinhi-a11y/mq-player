import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sniffFontFormat,
  validateFontFile,
  saveFontFile,
  listFonts,
  deleteFont,
  clearAllFonts,
  MAX_FONT_SIZE,
  type FontFormat,
} from "@/lib/customFonts";
import { installFakeIndexedDB } from "../helpers/fakeIDB";

/** Real magic-byte font headers. */
function fontBytes(format: FontFormat): Uint8Array {
  switch (format) {
    case "woff2":
      return new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00]); // "wOF2"
    case "woff":
      return new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0x00, 0x01, 0x00, 0x00]); // "wOFF"
    case "otf":
      return new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0x00, 0x01, 0x00, 0x00]); // "OTTO"
    case "ttf":
      return new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x20]); // sfnt 1.0
  }
}

function fontFile(name: string, bytes: Uint8Array, type = "font/woff2"): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

describe("Custom fonts — format sniffing (magic bytes)", () => {
  it("recognizes woff2 / woff / ttf / otf", () => {
    expect(sniffFontFormat(fontBytes("woff2"))).toBe("woff2");
    expect(sniffFontFormat(fontBytes("woff"))).toBe("woff");
    expect(sniffFontFormat(fontBytes("ttf"))).toBe("ttf");
    expect(sniffFontFormat(fontBytes("otf"))).toBe("otf");
  });

  it("rejects non-font payloads", () => {
    expect(sniffFontFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(sniffFontFormat(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(sniffFontFormat(new Uint8Array([0x74, 0x74, 0x63, 0x66]))).toBeNull(); // ttcf collection
  });
});

describe("Custom fonts — validation", () => {
  it("accepts a valid woff2 with matching extension", async () => {
    const res = await validateFontFile(fontFile("My.woff2", fontBytes("woff2")));
    expect(res).toEqual({ ok: true, format: "woff2" });
  });

  it("accepts ttf/otf cross-extension (equivalent sfnt containers)", async () => {
    expect(await validateFontFile(fontFile("My.ttf", fontBytes("otf")))).toEqual({ ok: true, format: "otf" });
  });

  it("rejects wrong extensions (invalid_extension)", async () => {
    const res = await validateFontFile(fontFile("virus.exe", fontBytes("woff2")));
    expect(res).toEqual({ ok: false, error: "invalid_extension" });
  });

  it("rejects content that is not a font even with a font extension (invalid_format)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await validateFontFile(fontFile("fake.woff2", png, "font/woff2"));
    expect(res).toEqual({ ok: false, error: "invalid_format" });
  });

  it("enforces the size limit (too_large)", async () => {
    const big = new Uint8Array(8);
    const file = new File([big], "big.woff2", { type: "font/woff2" });
    Object.defineProperty(file, "size", { value: MAX_FONT_SIZE + 1 });
    const res = await validateFontFile(file);
    expect(res).toEqual({ ok: false, error: "too_large" });
    expect(MAX_FONT_SIZE).toBe(15 * 1024 * 1024);
  });
});

describe("Custom fonts — persistence (IndexedDB)", () => {
  let fake: ReturnType<typeof installFakeIndexedDB>;

  beforeEach(() => {
    fake = installFakeIndexedDB({ stores: ["fonts"] });
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    fake.uninstall();
  });

  it("save → list → delete round-trip", async () => {
    const saved = await saveFontFile("Мой шрифт", fontFile("My.woff2", fontBytes("woff2")));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // Internal family is generated — user names never touch CSS (injection-safe).
    expect(saved.meta.family).toMatch(/^MQFont_/);
    expect(saved.meta.displayName).toBe("Мой шрифт");

    const list = await listFonts();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.meta.id);

    await deleteFont(saved.meta.id);
    expect(await listFonts()).toHaveLength(0);
  });

  it("refuses to store an invalid file (nothing persisted)", async () => {
    const bad = await saveFontFile("evil", fontFile("evil.woff2", new TextEncoder().encode("<script>")));
    expect(bad.ok).toBe(false);
    expect(await listFonts()).toHaveLength(0);
  });

  it("clearAllFonts wipes the store", async () => {
    await saveFontFile("A", fontFile("a.woff2", fontBytes("woff2")));
    await saveFontFile("B", fontFile("b.ttf", fontBytes("ttf")));
    expect((await listFonts()).length).toBeGreaterThan(0);
    await clearAllFonts();
    expect(await listFonts()).toHaveLength(0);
  });
});

describe("Custom fonts — DB self-heal (v11.1)", () => {
  it("recovers when the DB exists WITHOUT the fonts store (external no-version open)", async () => {
    // Real-world poison: anything calling indexedDB.open("mq-custom-fonts")
    // with no version (a diagnostic console line, a broken older build)
    // creates the DB at v1 with NO stores. The app's own versioned open then
    // never sees onupgradeneeded (DB already at v1) and every transaction
    // against the missing store throws → all font saves fail forever.
    // The self-heal path: detect the missing store, delete + recreate the DB.
    vi.resetModules();
    const fake = installFakeIndexedDB({ stores: [] });
    try {
      // 1. Poison: create the DB at v1 without any store (no upgrade handler).
      await new Promise<void>((resolve) => {
        const idb = (globalThis as { indexedDB: unknown }).indexedDB as {
          open: (n: string, v?: number) => { onsuccess: (() => void) | null };
        };
        const req = idb.open("mq-custom-fonts", 1);
        req.onsuccess = () => resolve();
      });

      // 2. Fresh module instance (the dbPromise/healedOnce cache is per-process).
      const fresh = await import("@/lib/customFonts");

      // 3. The save must SUCCEED via the heal (delete + recreate with store).
      const saved = await fresh.saveFontFile("Healed", fontFile("h.woff2", fontBytes("woff2")));
      expect(saved.ok).toBe(true);
      if (saved.ok) {
        expect(saved.meta.family).toMatch(/^MQFont_/);
        expect(await fresh.listFonts()).toHaveLength(1);
      }
    } finally {
      fake.uninstall();
      vi.resetModules();
    }
  });
});
