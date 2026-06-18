/**
 * Lyrics translation support (M5.5).
 *
 * Translates non-Russian lyrics to Russian using the Z-AI LLM.
 * Translations are cached in IndexedDB (client-side) keyed by
 * track ISRC or title+artist hash. This avoids repeated API calls
 * for the same track.
 *
 * Usage:
 *   import { getTranslatedLyrics, clearLyricsCache } from "@/lib/lyricsTranslation";
 *   const translated = await getTranslatedLyrics(originalLyrics, "english", track);
 */

const DB_NAME = "mq-lyrics-cache";
const STORE_NAME = "translations";
const DB_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  lyrics: string;
  translated: string;
  language: string;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function makeCacheKey(lyrics: string, language: string): string {
  // Simple hash — good enough for cache key
  let hash = 0;
  const str = `${language}:${lyrics.slice(0, 500)}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `lyrics_${Math.abs(hash).toString(36)}`;
}

async function getCached(key: string): Promise<CacheEntry | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result as (CacheEntry & { key: string }) | undefined;
        if (result && Date.now() - result.timestamp < CACHE_TTL_MS) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setCached(key: string, entry: CacheEntry): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, ...entry });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Translate lyrics to Russian using Z-AI LLM.
 * Returns the translated text, or null if translation failed.
 *
 * @param lyrics Original lyrics text (plain text or LRC format)
 * @param sourceLanguage Detected language of the lyrics ("english", "japanese", etc.)
 * @returns Translated lyrics in Russian, or null
 */
export async function translateLyrics(
  lyrics: string,
  sourceLanguage: string,
): Promise<string | null> {
  if (!lyrics || lyrics.trim().length < 10) return null;
  if (sourceLanguage === "russian") return null; // already Russian

  // Check cache
  const cacheKey = makeCacheKey(lyrics, sourceLanguage);
  const cached = await getCached(cacheKey);
  if (cached) return cached.translated;

  try {
    const res = await fetch("/api/lyrics/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyrics, sourceLanguage }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.translated) return null;

    // Cache the result
    await setCached(cacheKey, {
      lyrics,
      translated: data.translated,
      language: sourceLanguage,
      timestamp: Date.now(),
    });

    return data.translated;
  } catch {
    return null;
  }
}

/**
 * Detect the language of lyrics text.
 * Simple heuristic: if >40% Cyrillic → Russian, >60% Latin → English, else "other".
 */
export function detectLyricsLanguage(lyrics: string): string {
  if (!lyrics) return "unknown";
  const cyrillic = (lyrics.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (lyrics.match(/[a-zA-Z]/g) || []).length;
  const cjk = (lyrics.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || []).length;
  const total = cyrillic + latin + cjk;
  if (total === 0) return "unknown";
  if (cyrillic / total > 0.4) return "russian";
  if (cjk / total > 0.3) return "cjk";
  if (latin / total > 0.6) return "english";
  return "other";
}

/**
 * Clear the lyrics translation cache.
 */
export async function clearLyricsCache(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Check if lyrics have LRC time tags.
 */
export function isLRCLyrics(lyrics: string): boolean {
  return /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);
}

/**
 * Strip LRC time tags to get plain text lyrics.
 */
export function stripLRCTags(lyrics: string): string {
  return lyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "").trim();
}
