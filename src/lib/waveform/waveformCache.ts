/**
 * Waveform persistent cache — IndexedDB `mq-waveform-cache` (store
 * `waveforms`, keyPath `key`). Peaks are a few KB each, so an entry cap is
 * the only constraint needed; pruning is LRU-by-updatedAt.
 *
 * Key = trackId + audioFingerprint + waveformVersion (spec §6): algorithm
 * changes bump WAVEFORM_VERSION and old entries become unreachable garbage,
 * collected on the next prune pass.
 */

import type { WaveformData } from "./types";
import { WAVEFORM_VERSION } from "./types";

const DB_NAME = "mq-waveform-cache";
const DB_VERSION = 1;
const STORE = "waveforms";
const MAX_ENTRIES = 150;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
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

interface StoredWaveform extends Omit<WaveformData, "peaks"> {
  /** Stored as ArrayBuffer (structured-clone keeps Float32Array too, but
   *  ArrayBuffer round-trips through every IDB implementation safely). */
  peaksBuf: ArrayBuffer;
}

function toStored(data: WaveformData): StoredWaveform {
  const copy = new Float32Array(data.peaks); // copy so the live array stays usable
  return { ...data, peaksBuf: copy.buffer };
}

function fromStored(rec: StoredWaveform): WaveformData {
  return {
    key: rec.key,
    trackId: rec.trackId,
    version: rec.version,
    fingerprint: rec.fingerprint,
    bucketCount: rec.bucketCount,
    durationSec: rec.durationSec,
    peaks: new Float32Array(rec.peaksBuf),
    coverage: rec.coverage,
    complete: rec.complete,
    updatedAt: rec.updatedAt,
  };
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
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

export async function getWaveformFromCache(key: string): Promise<WaveformData | null> {
  const rec = await tx<StoredWaveform | undefined>("readonly", (s) => s.get(key));
  if (!rec) return null;
  try {
    const data = fromStored(rec);
    if (data.version !== WAVEFORM_VERSION) return null; // stale algorithm
    return data;
  } catch {
    return null;
  }
}

export async function putWaveformToCache(data: WaveformData): Promise<void> {
  await tx("readwrite", (s) => s.put(toStored(data)));
  // Fire-and-forget prune — never blocks the caller's path.
  void pruneCache();
}

export async function deleteWaveformFromCache(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

/** Drop every entry whose version isn't current + enforce the entry cap. */
export async function pruneCache(): Promise<void> {
  const all = await tx<StoredWaveform[]>("readonly", (s) => s.getAll());
  if (!all || !all.length) return;
  const stale = all.filter((r) => (r.version ?? 0) !== WAVEFORM_VERSION).map((r) => r.key);
  let list = all.filter((r) => (r.version ?? 0) === WAVEFORM_VERSION);
  const excess = Math.max(0, list.length - MAX_ENTRIES);
  if (excess > 0) {
    list = [...list].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
    for (let i = 0; i < excess; i++) stale.push(list[i].key);
  }
  if (!stale.length) return;
  await tx("readwrite", (s) => {
    for (const key of stale) s.delete(key);
    return s.getAllKeys(); // dummy request to keep the transaction alive
  });
}

/** Test hook: wipe the DB completely. */
export async function clearWaveformCache(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}
