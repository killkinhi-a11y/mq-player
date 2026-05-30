/**
 * Client-side local track upload storage using IndexedDB.
 *
 * On Vercel, server-side /tmp is ephemeral — files saved by one serverless
 * function invocation are unavailable in the next. This module stores uploaded
 * audio files directly in the browser's IndexedDB and provides blob URLs for
 * playback, so no server storage is needed.
 */

const DB_NAME = "mq-local-tracks";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

export interface StoredTrackMeta {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

// In-memory cache of blob URLs to avoid recreating them
const blobUrlCache = new Map<string, string>();

// ── DB helpers ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(store: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return store.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Store an uploaded file in IndexedDB and return a track-compatible object.
 * The blob URL is cached in memory for immediate playback.
 */
export async function storeLocalTrack(file: File): Promise<{
  id: string;
  title: string;
  audioUrl: string;
}> {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  const arrayBuffer = await file.arrayBuffer();

  const db = await openDB();
  const store = tx(db, "readwrite");

  await new Promise<void>((resolve, reject) => {
    const req = store.put({
      id,
      title,
      fileName: file.name,
      mimeType: file.type || "audio/mpeg",
      size: file.size,
      data: arrayBuffer,
      createdAt: Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Create a blob URL for immediate playback
  const blob = new Blob([arrayBuffer], { type: file.type || "audio/mpeg" });
  const audioUrl = URL.createObjectURL(blob);
  blobUrlCache.set(id, audioUrl);

  return { id, title, audioUrl };
}

/**
 * Get a blob URL for a stored local track.
 * Uses in-memory cache if available, otherwise reads from IndexedDB.
 * Returns null if the track doesn't exist in storage.
 */
export async function getLocalTrackUrl(trackId: string): Promise<string | null> {
  // Check cache first
  const cached = blobUrlCache.get(trackId);
  if (cached) return cached;

  try {
    const db = await openDB();
    const store = tx(db, "readonly");

    const record: { data: ArrayBuffer; mimeType: string } | undefined =
      await new Promise((resolve, reject) => {
        const req = store.get(trackId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

    if (!record) return null;

    const blob = new Blob([record.data], { type: record.mimeType || "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(trackId, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Check if a track ID represents a locally uploaded track.
 */
export function isLocalTrack(trackId: string): boolean {
  return trackId.startsWith("local_");
}

/**
 * Preload blob URLs for a list of local track IDs (e.g. on app startup).
 * Populates the in-memory cache so playback starts immediately.
 */
export async function preloadLocalTracks(trackIds: string[]): Promise<void> {
  const localIds = trackIds.filter(isLocalTrack);
  if (localIds.length === 0) return;

  try {
    const db = await openDB();
    const store = tx(db, "readonly");

    const records: { id: string; data: ArrayBuffer; mimeType: string }[] =
      await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

    for (const rec of records) {
      if (localIds.includes(rec.id) && !blobUrlCache.has(rec.id)) {
        const blob = new Blob([rec.data], { type: rec.mimeType || "audio/mpeg" });
        blobUrlCache.set(rec.id, URL.createObjectURL(blob));
      }
    }
  } catch {
    // Silent fail — tracks will be loaded on-demand when played
  }
}

/**
 * Delete a local track from IndexedDB and revoke its blob URL.
 */
export async function deleteLocalTrack(trackId: string): Promise<void> {
  // Revoke cached blob URL
  const cached = blobUrlCache.get(trackId);
  if (cached) {
    URL.revokeObjectURL(cached);
    blobUrlCache.delete(trackId);
  }

  try {
    const db = await openDB();
    const store = tx(db, "readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(trackId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silent fail
  }
}

/**
 * Get metadata for all stored local tracks.
 */
export async function listLocalTracks(): Promise<StoredTrackMeta[]> {
  try {
    const db = await openDB();
    const store = tx(db, "readonly");

    const records: StoredTrackMeta[] = await new Promise<StoredTrackMeta[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const mapped = (req.result || []).map((r: any) => ({
          id: r.id,
          title: r.title,
          fileName: r.fileName,
          mimeType: r.mimeType,
          size: r.size,
          createdAt: r.createdAt,
        }));
        resolve(mapped);
      };
      req.onerror = () => reject(req.error);
    });

    return records.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}
