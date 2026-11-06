/**
 * Pure merge rules for /api/sync (web ⇄ server ⇄ Android).
 *
 * Kotlin twin: android/app/src/main/kotlin/com/mq1/player/data/sync/SyncMerge.kt.
 * Golden cases: shared/test-fixtures/sync-merge.cases.json (run by both).
 *
 * Server storage is per-key last-write-wins (POST /api/sync upserts each key
 * it receives), so EVERY client must pull → merge → push; pushing a local-only
 * view would erase what the other platform wrote.
 *
 * Rules (unchanged web behaviour, now shared):
 *  - id lists (likedTracks / dislikedTracks): union, server order first.
 *  - track lists (*TracksData): local order first, then server tracks missing locally.
 *  - history: server entries missing locally first, then local; capped.
 *  - server items without a usable track id are dropped (deliberately lenient:
 *    full contract validation could drop historical tracks with an older
 *    shape — that would lose user data on merge).
 *  - NEW (optional, used by Android): ids removed locally since the last
 *    successful sync (`localRemoved`) win over the server copy, so an unlike
 *    is not resurrected by the next pull.
 */
export interface SyncTrack { id: string; [k: string]: unknown }
export interface SyncHistoryEntry { track: SyncTrack; playedAt?: number; playCount?: number; [k: string]: unknown }

export const SYNC_MANAGED_KEYS = [
  "history", "likedTracks", "dislikedTracks", "likedTracksData", "dislikedTracksData",
] as const;

const isValidTrack = (t: unknown): t is SyncTrack =>
  typeof t === "object" && t !== null && typeof (t as SyncTrack).id === "string" && (t as SyncTrack).id.length > 0;

export function mergeIds(
  server: readonly unknown[],
  local: readonly string[],
  localRemoved: readonly string[] = [],
): string[] {
  const removed = new Set(localRemoved);
  const serverIds = server.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set([...serverIds, ...local])].filter((id) => !removed.has(id) || local.includes(id));
}

export function mergeTracks(
  local: readonly SyncTrack[],
  server: readonly unknown[],
  localRemoved: readonly string[] = [],
): SyncTrack[] {
  const removed = new Set(localRemoved);
  const localIds = new Set(local.map((t) => t.id));
  const merged: SyncTrack[] = [...local];
  for (const t of server) {
    if (!isValidTrack(t)) continue;
    if (localIds.has(t.id) || removed.has(t.id)) continue;
    localIds.add(t.id);
    merged.push(t);
  }
  return merged;
}

export function mergeHistory(
  local: readonly SyncHistoryEntry[],
  server: readonly unknown[],
  max: number,
): SyncHistoryEntry[] {
  const localIds = new Set(local.map((h) => h.track?.id));
  const seen = new Set<string>();
  const fromServer: SyncHistoryEntry[] = [];
  for (const e of server) {
    const entry = e as SyncHistoryEntry | null;
    if (!entry || typeof entry !== "object" || !isValidTrack(entry.track)) continue;
    const id = entry.track.id;
    if (localIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    fromServer.push(entry);
  }
  return [...fromServer, ...local].slice(0, max);
}
