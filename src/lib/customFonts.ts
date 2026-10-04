"use client";

/**
 * Custom lyrics fonts — user-uploaded font files (.woff2/.woff/.ttf/.otf).
 *
 * Storage: IndexedDB `mq-custom-fonts` (store `fonts`, keyPath `id`) — font
 * files are too large for localStorage. Registered into the document via the
 * FontFace API under a SAFE internal family (`MQFont_<id>`) — user-supplied
 * display names never touch CSS, so no injection surface exists.
 *
 * Validation is defense-in-depth: extension + size limit + magic bytes.
 */

const DB_NAME = "mq-custom-fonts";
const DB_VERSION = 1;
const STORE = "fonts";
export const MAX_FONT_SIZE = 15 * 1024 * 1024; // 15 MB

export type FontFormat = "woff2" | "woff" | "ttf" | "otf";

export interface StoredFontMeta {
  id: string;
  /** Internal CSS family — ALWAYS `MQFont_<id>` (never user input). */
  family: string;
  /** User-facing name (file name or entered label). */
  displayName: string;
  format: FontFormat;
  size: number;
  createdAt: number;
}

interface StoredFontRecord extends StoredFontMeta {
  data: ArrayBuffer;
}

export type FontValidationError =
  | "invalid_extension"
  | "invalid_format"
  | "too_large"
  | "read_error"
  | "duplicate";

export type FontValidationResult =
  | { ok: true; format: FontFormat }
  | { ok: false; error: FontValidationError };

let dbPromise: Promise<IDBDatabase | null> | null = null;
const registeredFamilies = new Set<string>();
/** Guards the self-heal path against loops (one repair per process). */
let healedOnce = false;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = openDBOnce().catch(() => null);
  return dbPromise;
}

function openDBOnce(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(STORE) || healedOnce) {
          resolve(db);
          return;
        }
        // Self-heal: a `mq-custom-fonts` DB exists WITHOUT the fonts store
        // (created by an external no-version open, an interrupted upgrade,
        // or corruption). Transactions against the missing store throw and
        // every save would fail forever — recreate the DB from scratch.
        healedOnce = true;
        db.close();
        const reopen = () => {
          openDBOnce().then((again) => {
            dbPromise = Promise.resolve(again);
            resolve(again);
          });
        };
        const del = indexedDB.deleteDatabase(DB_NAME);
        del.onsuccess = reopen;
        del.onerror = reopen;
        del.onblocked = reopen;
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** Sniff the container format from magic bytes. */
export function sniffFontFormat(bytes: Uint8Array): FontFormat | null {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);
  // woff2: "wOF2" (0x77 0x4F 0x46 0x32)
  if (startsWith([0x77, 0x4f, 0x46, 0x32])) return "woff2";
  // woff: "wOFF"
  if (startsWith([0x77, 0x4f, 0x46, 0x46])) return "woff";
  // OTTO (CFF-based OpenType)
  if (startsWith([0x4f, 0x54, 0x54, 0x4f])) return "otf";
  // TrueType sfnt version 0x00010000, or 'true' (legacy Apple)
  if (startsWith([0x00, 0x01, 0x00, 0x00]) || startsWith([0x74, 0x72, 0x75, 0x65])) return "ttf";
  // ttcf = collection — not a single face; reject.
  return null;
}

/** Validate a picked file BEFORE storing: extension + size + magic bytes. */
export async function validateFontFile(file: File): Promise<FontValidationResult> {
  if (file.size > MAX_FONT_SIZE) return { ok: false, error: "too_large" };
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["woff2", "woff", "ttf", "otf"].includes(ext)) {
    return { ok: false, error: "invalid_extension" };
  }
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const sniffed = sniffFontFormat(head);
    if (!sniffed) return { ok: false, error: "invalid_format" };
    // Extension/sniff mismatch (e.g. .ttf holding woff2) — accept the ACTUAL
    // container (the sniff is authoritative), but reject obvious lies that
    // would confuse the UI (e.g. .otf file that is actually woff2).
    if (sniffed !== ext) {
      const equivalent = (sniffed === "ttf" && ext === "otf") || (sniffed === "otf" && ext === "ttf");
      if (!equivalent) return { ok: false, error: "invalid_format" };
    }
    return { ok: true, format: sniffed };
  } catch {
    return { ok: false, error: "read_error" };
  }
}

// ─── Registration (FontFace) ────────────────────────────────────────────────

/** Register one font into the document (idempotent). */
async function registerFontFace(rec: StoredFontRecord): Promise<boolean> {
  if (typeof FontFace === "undefined" || !document?.fonts) return false;
  if (registeredFamilies.has(rec.family)) return true;
  try {
    const face = new FontFace(rec.family, rec.data.slice(0));
    await face.load();
    (document.fonts as FontFaceSet).add(face);
    registeredFamilies.add(rec.family);
    return true;
  } catch {
    return false;
  }
}

/** Load + register every stored font (AppShell boot). Idempotent. */
export async function ensureFontsLoaded(): Promise<StoredFontMeta[]> {
  const all = await listFontRecords();
  for (const rec of all) {
    await registerFontFace(rec);
  }
  return all.map(({ data: _d, ...meta }) => meta);
}

async function listFontRecords(): Promise<StoredFontRecord[]> {
  const all = await tx<StoredFontRecord[]>("readonly", (s) => s.getAll());
  return (all ?? []).filter((r) => r && r.id && r.data);
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveFontFile(
  displayName: string,
  file: File,
): Promise<{ ok: true; meta: StoredFontMeta } | { ok: false; error: FontValidationError }> {
  const validation = await validateFontFile(file);
  if (!validation.ok) return validation;
  const id = newId();
  const family = `MQFont_${id}`;
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "read_error" };
  }
  const rec: StoredFontRecord = {
    id,
    family,
    displayName: (displayName || file.name || "Font").slice(0, 64),
    format: validation.format,
    size: file.size,
    createdAt: Date.now(),
    data,
  };
  const put = await tx("readwrite", (s) => s.put(rec));
  if (put === null && typeof indexedDB !== "undefined") {
    return { ok: false, error: "read_error" };
  }
  await registerFontFace(rec);
  const meta = { ...rec } as StoredFontMeta;
  delete (meta as { data?: unknown }).data;
  return { ok: true, meta };
}

export async function listFonts(): Promise<StoredFontMeta[]> {
  return (await listFontRecords()).map(({ data: _d, ...meta }) => meta);
}

export async function deleteFont(id: string): Promise<void> {
  const all = await listFontRecords();
  const rec = all.find((r) => r.id === id);
  await tx("readwrite", (s) => s.delete(id));
  if (rec) {
    registeredFamilies.delete(rec.family);
    // FontFaceSet has no reliable unregister — the face stays loaded until
    // reload, but the family is no longer referenced by any preference.
  }
}

/** Test hook: wipe everything. */
export async function clearAllFonts(): Promise<void> {
  registeredFamilies.clear();
  await tx("readwrite", (s) => s.clear());
}
