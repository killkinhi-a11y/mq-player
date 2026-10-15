"use client";

/**
 * Lyrics persistence layer — IndexedDB `mq-lyrics-store`.
 *
 * Two object stores:
 *  - `fetched`: server/provider results (LyricsResult) with a TTL — makes
 *    repeat plays and page reloads instant and survives the old in-memory
 *    cache (which died on every reload). Negative results are cached too,
 *    briefly, to stop not-found hammering.
 *  - `local`: USER-IMPORTED synced documents (TTML/QRC/enhanced LRC/SRT)
 *    keyed by track. These are user data: no TTL, never pruned by LRU —
 *    only explicit deletion.
 *
 * All operations resolve to null on any failure (IDB missing, quota,
 * corruption) — lyrics are an enhancement, never a blocker.
 */

import type { LyricsResult } from "./types";
import { syncLevelOf } from "./types";
import { parseSyncedDocument } from "./wordLevel";

const DB_NAME = "mq-lyrics-store";
const DB_VERSION = 1;
const FETCHED_STORE = "fetched";
const LOCAL_STORE = "local";
const FETCHED_TTL_MS = 14 * 24 * 3600 * 1000; // 14 days
const NEGATIVE_TTL_MS = 6 * 3600 * 1000; // 6 h for not_found
const MAX_FETCHED_ENTRIES = 400;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FETCHED_STORE)) {
          db.createObjectStore(FETCHED_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(LOCAL_STORE)) {
          db.createObjectStore(LOCAL_STORE, { keyPath: "trackKey" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = run(t.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// ─── Fetched (provider) cache ────────────────────────────────────────────────

interface StoredFetched {
  key: string;
  result: LyricsResult;
  storedAt: number;
}

/** Look up a cached provider result. Expired entries read as misses. */
export async function getFetchedLyrics(key: string): Promise<LyricsResult | null> {
  const rec = await tx<StoredFetched>(FETCHED_STORE, "readonly", (s) =>
    s.get(key) as IDBRequest<StoredFetched>,
  );
  if (!rec || !rec.result) return null;
  const ttl =
    rec.result.error === "not_found" ? NEGATIVE_TTL_MS : FETCHED_TTL_MS;
  if (Date.now() - rec.storedAt > ttl) return null;
  return rec.result;
}

/** Store a provider result (best-effort, fire-and-forget safe). */
export async function putFetchedLyrics(key: string, result: LyricsResult): Promise<void> {
  if (!result) return;
  await tx(FETCHED_STORE, "readwrite", (s) =>
    s.put({ key, result, storedAt: Date.now() } satisfies StoredFetched),
  );
  // Opportunistic prune — cheap enough on a write path.
  void pruneFetched();
}

async function pruneFetched(): Promise<void> {
  const all = await tx<StoredFetched[]>(FETCHED_STORE, "readonly", (s) =>
    s.getAll() as IDBRequest<StoredFetched[]>,
  );
  if (!all || all.length <= MAX_FETCHED_ENTRIES) return;
  const sorted = [...all].sort((a, b) => a.storedAt - b.storedAt);
  const doomed = sorted.slice(0, all.length - MAX_FETCHED_ENTRIES);
  await tx(FETCHED_STORE, "readwrite", (s) => {
    for (const d of doomed) s.delete(d.key);
    return s.count();
  });
}

// ─── Local (user-imported) documents ─────────────────────────────────────────

export interface LocalLyricsRecord {
  trackKey: string;
  /** Raw document text exactly as imported (for re-parse/migration). */
  raw: string;
  format: string;
  syncLevel: string;
  importedAt: number;
}

function localTrackKeyOf(artist: string, title: string): string {
  return `${(artist || "").trim().toLowerCase()}|${(title || "").trim().toLowerCase()}`;
}

export { localTrackKeyOf as localTrackKey };

/** Parse an imported document and persist it for a track. Returns the
 *  parsed outcome (or null when the document has no usable content). */
export async function saveLocalLyrics(
  artist: string,
  title: string,
  raw: string,
  durationMs?: number,
): Promise<{ lines: import("./types").LyricLine[]; syncLevel: import("./types").SyncLevel; format: string } | null> {
  const parsed = parseSyncedDocument(raw, { durationMs });
  if (parsed.syncLevel === "plain" && parsed.lines.length === 0) {
    // Plain text import is still useful — store it as the plain text body.
    const text = raw.trim();
    if (!text) return null;
    await tx(LOCAL_STORE, "readwrite", (s) =>
      s.put({
        trackKey: localTrackKeyOf(artist, title),
        raw,
        format: "plain",
        syncLevel: "plain",
        importedAt: Date.now(),
      } satisfies LocalLyricsRecord),
    );
    return { lines: [], syncLevel: "plain", format: "plain" };
  }
  if (parsed.lines.length === 0) return null;
  await tx(LOCAL_STORE, "readwrite", (s) =>
    s.put({
      trackKey: localTrackKeyOf(artist, title),
      raw,
      format: parsed.format,
      syncLevel: parsed.syncLevel,
      importedAt: Date.now(),
    } satisfies LocalLyricsRecord),
  );
  return { lines: parsed.lines, syncLevel: parsed.syncLevel, format: parsed.format };
}

/** Read the user-imported document for a track, parsed into a LyricsResult. */
export async function getLocalLyrics(
  artist: string,
  title: string,
  durationMs?: number,
): Promise<LyricsResult | null> {
  const rec = await tx<LocalLyricsRecord>(LOCAL_STORE, "readonly", (s) =>
    s.get(localTrackKeyOf(artist, title)) as IDBRequest<LocalLyricsRecord>,
  );
  if (!rec) return null;
  const parsed = parseSyncedDocument(rec.raw, { durationMs });
  const plainText = parsed.lines.length === 0 ? rec.raw.trim() : "";
  const lines = parsed.lines;
  return {
    lines,
    lyrics: lines.map((l) => ({ time: (l.startMs ?? 0) / 1000, text: l.text })),
    plainText,
    synced: lines.length > 0,
    source: "local",
    syncLevel: syncLevelOf(lines, !!plainText),
  };
}

/** Remove the user-imported document for a track. */
export async function deleteLocalLyrics(artist: string, title: string): Promise<void> {
  await tx(LOCAL_STORE, "readwrite", (s) =>
    s.delete(localTrackKeyOf(artist, title)),
  );
}

/** Metadata only (for UI badges) — no parse. */
export async function getLocalLyricsMeta(
  artist: string,
  title: string,
): Promise<LocalLyricsRecord | null> {
  return tx<LocalLyricsRecord>(LOCAL_STORE, "readonly", (s) =>
    s.get(localTrackKeyOf(artist, title)) as IDBRequest<LocalLyricsRecord>,
  );
}
