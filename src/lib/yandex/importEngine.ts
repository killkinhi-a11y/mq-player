/**
 * Yandex import engine — serverless-safe job state machine.
 *
 * There are no background workers on Vercel, so the job advances in bounded
 * chunks: the frontend polls POST /api/yandex/import/[id]/advance and each
 * call performs ONE unit of work:
 *
 *   pending → fetching   (one playlist's tracks per call, via the adapter)
 *           → matching   (up to MATCH_CHUNK tracks per call, SoundCloud search
 *                          + scoring via src/lib/yandex/matching.ts)
 *           → importing  (one MQ playlist created/merged per call, ORDER
 *                          preserved exactly as in Yandex)
 *           → completed | completed_with_errors | failed
 *
 * Everything is persisted in YandexImportJob.data between calls, so jobs are
 * resumable and retry-safe. Duplicate Yandex tracks keep their original
 * semantics (MQ playlists are JSON arrays — duplicates allowed, order kept).
 */

import type { NextRequest } from "next/server";
import type { Track } from "@/lib/musicApi";
import { searchSCTracks } from "@/lib/soundcloud";
import {
  adapterPlaylistTracks,
  adapterPlaylistsList,
} from "./adapter";
import { matchTrack, searchQueries, type MatchResult } from "./matching";
import type { YandexTrackMeta, YandexPlaylistBrief } from "./types";
import { YandexError } from "./types";
import {
  getJob,
  getTokenForUser,
  updateJob,
  type JobStatus,
} from "./store";
import { isTurso, getTursoClient, tursoQuery } from "@/lib/database";

/**
 * Execute a Turso statement through tursoQuery — the codebase's auto
 * schema-init pattern (catches "no such table" → ensureTursoSchema → retry).
 */
async function texec(
  sql: string,
  args: Array<string | number | null>
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const t = getTursoClient();
  const r = await tursoQuery(() => t.execute({ sql, args }));
  return { rows: (r.rows as unknown as Array<Record<string, unknown>>) || [] };
}

import { randomUUID } from "crypto";

export const MAX_PLAYLISTS_PER_JOB = 50;
export const MAX_TRACKS_PER_PLAYLIST = 1000;
const MATCH_CHUNK = 6;          // tracks per advance call
const SEARCH_CONCURRENCY = 3;   // parallel SoundCloud searches inside a chunk
const SEARCH_LIMIT = 6;         // candidates requested per query

export type PlaylistConflictMode = "copy" | "merge";

export interface JobPlaylist {
  kind: number;
  uid: number | null;
  title: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  ownerLogin: string;
  conflictMode: PlaylistConflictMode;
  // runtime
  fetched: boolean;
  fetchAttempts?: number;
  error?: string | null;
  tracks?: YandexTrackMeta[];
  matchCursor: number; // index into matches
  matches?: MatchEntry[];
  imported: boolean;
  createdPlaylistId?: string | null;
  createdName?: string | null;
}

export interface MatchEntry {
  position: number;
  sourceTrackId: string;
  sourceAlbumId: string | null;
  yandexTitle: string;
  yandexArtists: string[];
  yandexDurationSec: number;
  status: "pending" | "matched" | "ambiguous" | "unmatched" | "resolved";
  score?: number;
  exact?: boolean;
  mqTrack?: Track | null;   // chosen track (auto for matched, manual for resolved)
  candidates?: Track[];     // top alternatives (ambiguous) for manual resolution
}

export interface ImportReport {
  playlistsTotal: number;
  playlistsImported: number;
  playlistsFailed: number;
  tracksFound: number;
  tracksImported: number;
  tracksMatched: number;
  tracksAmbiguous: number;
  tracksUnmatched: number;
  duplicates: number;
  skippedExisting: number;
  createdPlaylists: Array<{ kind: number; playlistId: string; name: string }>;
  failures: Array<{ kind: number; title: string; error: string }>;
}

export interface ImportJobData {
  playlists: JobPlaylist[];
  phase: "fetching" | "matching" | "importing" | "done";
  report: ImportReport;
}

export function newReport(): ImportReport {
  return {
    playlistsTotal: 0,
    playlistsImported: 0,
    playlistsFailed: 0,
    tracksFound: 0,
    tracksImported: 0,
    tracksMatched: 0,
    tracksAmbiguous: 0,
    tracksUnmatched: 0,
    duplicates: 0,
    skippedExisting: 0,
    createdPlaylists: [],
    failures: [],
  };
}

// ── Progress snapshot (client contract — compact, no heavy blobs) ────────────

export interface ImportSnapshot {
  id: string;
  status: JobStatus;
  phase: ImportJobData["phase"] | null;
  progress: { done: number; total: number; unit: "playlists" | "tracks"; currentTitle: string };
  playlists: Array<{
    kind: number;
    title: string;
    trackCount: number;
    status: "pending" | "fetching" | "fetched" | "matching" | "imported" | "failed";
    imported: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    error?: string | null;
  }>;
  report: ImportReport | null;
}

export function buildSnapshot(id: string, status: JobStatus, data: ImportJobData): ImportSnapshot {
  const playlists = data.playlists.map((p) => {
    const matches = p.matches ?? [];
    let doneP = false;
    let st: ImportSnapshot["playlists"][number]["status"] = "pending";
    if (p.imported) {
      st = "imported";
      doneP = true;
    } else if (p.error) {
      st = "failed";
      doneP = true;
    } else if (p.fetched) {
      const pending = matches.filter((m) => m.status === "pending").length;
      st = pending === 0 ? "fetched" : "matching";
    }
    void doneP;
    return {
      kind: p.kind,
      title: p.title,
      trackCount: p.trackCount,
      status: st,
      imported: matches.filter((m) => m.status === "matched" || m.status === "resolved").length,
      matched: matches.filter((m) => m.status === "matched" || m.status === "resolved").length,
      ambiguous: matches.filter((m) => m.status === "ambiguous").length,
      unmatched: matches.filter((m) => m.status === "unmatched").length,
      error: p.error ?? null,
    };
  });

  let done = 0;
  let total = 0;
  let unit: "playlists" | "tracks" = "playlists";
  let currentTitle = "";

  if (data.phase === "fetching") {
    unit = "playlists";
    total = data.playlists.length;
    done = data.playlists.filter((p) => p.fetched || p.error).length;
    const next = data.playlists.find((p) => !p.fetched && !p.error);
    currentTitle = next?.title ?? "";
  } else if (data.phase === "matching") {
    unit = "tracks";
    const allMatches = data.playlists.flatMap((p) => p.matches ?? []);
    total = allMatches.length;
    done = allMatches.filter((m) => m.status !== "pending").length;
    const current = data.playlists.find((p) => (p.matches ?? []).some((m) => m.status === "pending"));
    currentTitle = current?.title ?? "";
  } else if (data.phase === "importing") {
    unit = "playlists";
    total = data.playlists.filter((p) => !p.error).length;
    done = data.playlists.filter((p) => p.imported).length;
    currentTitle = data.playlists.find((p) => !p.imported && !p.error)?.title ?? "";
  } else if (data.phase === "done") {
    unit = "playlists";
    total = data.playlists.length;
    done = data.playlists.filter((p) => p.imported || p.error).length;
  }

  const terminal = status === "completed" || status === "completed_with_errors" || status === "failed" || status === "cancelled";
  return {
    id,
    status,
    phase: terminal ? null : data.phase,
    progress: { done, total, unit, currentTitle },
    playlists,
    report: terminal ? data.report : null,
  };
}

// ── Job advancement ───────────────────────────────────────────────────────────

const runningJobs = new Map<string, Promise<ImportSnapshot>>();

/** Advance a job by one bounded chunk. Concurrent calls for the same job serialize. */
export async function advanceImportJob(userId: string, jobId: string, req?: NextRequest): Promise<ImportSnapshot> {
  const existing = runningJobs.get(jobId);
  if (existing) return existing;
  const task = (async () => {
    try {
      const job = await getJob(userId, jobId);
      if (!job) throw new YandexError("job_not_found", "Задача импорта не найдена.", 404);
      const data = JSON.parse(job.data) as ImportJobData;
      if (!data || !Array.isArray(data.playlists)) {
        throw new YandexError("internal_error", "Задача импорта повреждена.", 500);
      }
      if (!data.report) data.report = newReport();

      const terminal: JobStatus[] = ["completed", "completed_with_errors", "failed", "cancelled"];
      if (!terminal.includes(job.status)) {
        const result = await runChunk(userId, job, data, req);
        await updateJob(userId, jobId, { status: result.status, data, error: result.error ?? null, completed: result.completed });
        return buildSnapshot(jobId, result.status, data);
      }
      return buildSnapshot(jobId, job.status, data);
    } finally {
      runningJobs.delete(jobId);
    }
  })();
  runningJobs.set(jobId, task);
  return task;
}

async function runChunk(
  userId: string,
  job: { id: string; status: JobStatus },
  data: ImportJobData,
  req?: NextRequest
): Promise<{ status: JobStatus; completed: boolean; error?: string }> {
  try {
    if (job.status === "pending") {
      data.report.playlistsTotal = data.playlists.length;
      data.phase = "fetching";
    }

    // ── Phase 1: fetch tracks for the next playlist ──
    if (data.phase === "fetching") {
      const next = data.playlists.find((p) => !p.fetched && !p.error);
      if (!next) {
        data.phase = "matching";
      } else {
        const token = await requireToken(userId);
        try {
          const fetched = await adapterPlaylistTracks(token, next.kind, req);
          const tracks = (fetched.tracks ?? []).slice(0, MAX_TRACKS_PER_PLAYLIST);
          next.tracks = tracks;
          next.matches = tracks.map((t) => ({
            position: t.position,
            sourceTrackId: t.trackId,
            sourceAlbumId: t.albumId,
            yandexTitle: t.title,
            yandexArtists: t.artists,
            yandexDurationSec: Math.round((t.durationMs || 0) / 1000),
            status: "pending" as const,
          }));
          next.matchCursor = 0;
          next.fetched = true;
          if (fetched.title) next.title = fetched.title;
          if (fetched.description) next.description = fetched.description;
          if (fetched.coverUrl) next.coverUrl = fetched.coverUrl;
          data.report.tracksFound += tracks.length;
          // duplicate detection within the source playlist
          const seen = new Set<string>();
          let dups = 0;
          for (const t of tracks) {
            const key = `${t.trackId}:${t.albumId ?? ""}`;
            if (seen.has(key)) dups++;
            seen.add(key);
          }
          data.report.duplicates += dups;
        } catch (err) {
          const yerr = err as YandexError;
          if (yerr.code === "yandex_unauthorized") throw err; // whole job dies — re-auth needed
          next.fetchAttempts = (next.fetchAttempts ?? 0) + 1;
          if (next.fetchAttempts < 2) {
            // transient failure — retry this playlist on the next advance call
            return { status: job.status === "pending" ? "fetching" : job.status, completed: false };
          }
          next.error = yerr.message || "Не удалось получить треки плейлиста.";
          data.report.playlistsFailed += 1;
          data.report.failures.push({ kind: next.kind, title: next.title, error: next.error });
        }
        return { status: job.status === "pending" ? "fetching" : job.status, completed: false };
      }
    }

    // ── Phase 2: match the next chunk of tracks ──
    if (data.phase === "matching") {
      const target = data.playlists.find((p) => p.fetched && !p.error && (p.matches ?? []).some((m) => m.status === "pending"));
      if (!target) {
        data.phase = "importing";
      } else {
        await matchChunk(data, target);
        return { status: "matching", completed: false };
      }
    }

    // ── Phase 3: create/merge the next playlist ──
    if (data.phase === "importing") {
      const next = data.playlists.find((p) => p.fetched && !p.error && !p.imported);
      if (!next) {
        data.phase = "done";
        const failed = data.report.playlistsFailed;
        const status: JobStatus = failed > 0 ? "completed_with_errors" : "completed";
        return { status, completed: true };
      }
      await importPlaylist(userId, data, next);
      return { status: "importing", completed: false };
    }

    return { status: job.status, completed: true };
  } catch (err) {
    const yerr = err as YandexError;
    return { status: "failed", completed: true, error: `${yerr.code || "internal_error"}: ${yerr.message || "Неизвестная ошибка"}` };
  }
}

async function requireToken(userId: string): Promise<string> {
  const token = await getTokenForUser(userId);
  if (!token) {
    throw new YandexError("yandex_unauthorized", "Аккаунт Яндекс.Музыки не подключён или токен истёк. Повторите вход.", 401);
  }
  return token;
}

// ── Matching ─────────────────────────────────────────────────────────────────

async function matchChunk(data: ImportJobData, playlist: JobPlaylist): Promise<void> {
  const matches = playlist.matches!;
  const pending = matches.filter((m) => m.status === "pending").slice(0, MATCH_CHUNK);
  const queryCache = new Map<string, Track[]>();

  // Reuse results for duplicated source tracks (same yandex track twice)
  const doneByKey = new Map<string, MatchEntry>();
  for (const m of matches) {
    if (m.status !== "pending") {
      doneByKey.set(`${m.sourceTrackId}:${m.sourceAlbumId ?? ""}`, m);
    }
  }

  // Batch keys are POSITION-based (always unique per entry) — degenerate
  // track ids can never collide and corrupt a whole batch.
  const batch = pending.map((entry) => ({ entry, key: `#${entry.position}` }));
  const dupKey = (e: { sourceTrackId: string; sourceAlbumId: string | null }) =>
    `${e.sourceTrackId}:${e.sourceAlbumId ?? ""}`;
  const toSearch = batch.filter((b) => !doneByKey.has(dupKey(b.entry)));

  // Run searches with limited concurrency
  const searchResults = new Map<string, Track[]>();
  for (let i = 0; i < toSearch.length; i += SEARCH_CONCURRENCY) {
    const slice = toSearch.slice(i, i + SEARCH_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async ({ entry }) => {
        const meta: YandexTrackMeta = {
          position: entry.position,
          trackId: entry.sourceTrackId,
          albumId: entry.sourceAlbumId,
          title: entry.yandexTitle,
          artists: entry.yandexArtists,
          albumTitle: "",
          albumIdFull: null,
          durationMs: entry.yandexDurationSec * 1000,
          available: true,
        };
        const queries = searchQueries(meta);
        let candidates: Track[] = [];
        for (const q of queries) {
          const cached = queryCache.get(q);
          if (cached) {
            candidates = cached;
            break;
          }
          try {
            const found = await searchSCTracks(q, SEARCH_LIMIT);
            queryCache.set(q, found);
            if (found.length) {
              candidates = found;
              break;
            }
          } catch {
            // search failure → empty candidates for this query variant
          }
        }
        return { entry, candidates };
      })
    );
    for (const r of results) searchResults.set(`#${r.entry.position}`, r.candidates);
  }

  for (const { entry, key } of batch) {
    const prior = doneByKey.get(dupKey(entry));
    if (prior && prior.status !== "unmatched") {
      // Duplicate of an already-processed track: same decision, same track
      entry.status = prior.status;
      entry.score = prior.score;
      entry.exact = prior.exact;
      entry.mqTrack = prior.mqTrack ? { ...prior.mqTrack } : null;
      if (prior.status === "ambiguous") entry.candidates = prior.candidates?.map((c) => ({ ...c }));
      continue;
    }
    const candidates = searchResults.get(key) ?? [];
    const meta: YandexTrackMeta = {
      position: entry.position,
      trackId: entry.sourceTrackId,
      albumId: entry.sourceAlbumId,
      title: entry.yandexTitle,
      artists: entry.yandexArtists,
      albumTitle: "",
      albumIdFull: null,
      durationMs: entry.yandexDurationSec * 1000,
      available: true,
    };
    const result: MatchResult = matchTrack(meta, candidates);
    entry.status = result.status;
    entry.score = result.best?.score;
    entry.exact = result.exact;
    entry.mqTrack = result.status === "matched" && result.best ? slimTrack(result.best.track) : null;
    if (result.status === "ambiguous") {
      entry.candidates = (result.candidates ?? []).slice(0, 3).map((c) => slimTrack(c.track));
    }
    if (!entry.mqTrack && result.best && result.status === "matched") {
      // matched but track slim failed — treat as unmatched (shouldn't happen)
      entry.status = "unmatched";
    }
  }
}

/** Keep only the fields MQ needs — keeps job blobs small. */
function slimTrack(t: Track): Track {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album || "",
    duration: t.duration || 0,
    cover: t.cover || "",
    genre: t.genre || "",
    audioUrl: t.audioUrl || "",
    previewUrl: "",
    source: "soundcloud" as const,
    scTrackId: t.scTrackId,
    scStreamPolicy: t.scStreamPolicy,
    scIsFull: t.scIsFull,
  };
}

// ── Playlist creation (order-preserving) ─────────────────────────────────────

function sourceTag(kind: number, entry: MatchEntry): Record<string, unknown> {
  return {
    _src: "yandex_music",
    _srcTrackId: entry.sourceTrackId,
    _srcAlbumId: entry.sourceAlbumId ?? null,
    _srcPlaylistKind: kind,
  };
}

async function importPlaylist(userId: string, data: ImportJobData, p: JobPlaylist): Promise<void> {
  const matches = p.matches ?? [];
  const chosen = matches.filter((m) => (m.status === "matched" || m.status === "resolved") && m.mqTrack);
  const tracksJson = chosen.map((m) => ({ ...m.mqTrack!, ...sourceTag(p.kind, m) }));

  const counts = {
    matched: matches.filter((m) => m.status === "matched" || m.status === "resolved").length,
    ambiguous: matches.filter((m) => m.status === "ambiguous").length,
    unmatched: matches.filter((m) => m.status === "unmatched").length,
  };

  if (p.conflictMode === "merge") {
    const existing = await findPlaylistByName(userId, p.title);
    if (existing) {
      const { id, tracksJson: existingJson } = existing;
      const existingTracks = safeParseArray(existingJson);
      const existingIds = new Set(existingTracks.map((t) => String((t as unknown as Track).id)));
      const toAdd = tracksJson.filter((t) => !existingIds.has(String((t as unknown as Track).id)));
      data.report.skippedExisting += tracksJson.length - toAdd.length;
      const merged = [...existingTracks, ...toAdd];
      await writePlaylistTracks(id, merged);
      p.imported = true;
      p.createdPlaylistId = id;
      p.createdName = p.title;
      data.report.playlistsImported += 1;
      data.report.tracksImported += toAdd.length;
      data.report.createdPlaylists.push({ kind: p.kind, playlistId: id, name: p.title });
      accumulateCounts(data, counts);
      return;
    }
    // merge target vanished mid-import → fall through to copy semantics
  }

  // copy semantics (or merge without an existing playlist)
  const name = await uniquePlaylistName(userId, p.title);
  const description = [p.description?.trim(), `Импортировано из Яндекс.Музыки${p.ownerLogin ? ` · ${p.ownerLogin}` : ""}`]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 2000);
  const id = await createPlaylistRow(userId, name, description, p.coverUrl, tracksJson);
  p.imported = true;
  p.createdPlaylistId = id;
  p.createdName = name;
  data.report.playlistsImported += 1;
  data.report.tracksImported += tracksJson.length;
  data.report.createdPlaylists.push({ kind: p.kind, playlistId: id, name });
  accumulateCounts(data, counts);
}

function accumulateCounts(data: ImportJobData, counts: { matched: number; ambiguous: number; unmatched: number }): void {
  data.report.tracksMatched += counts.matched;
  data.report.tracksAmbiguous += counts.ambiguous;
  data.report.tracksUnmatched += counts.unmatched;
}

function safeParseArray(json: string): Array<Record<string, unknown>> {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function findPlaylistByName(
  userId: string,
  name: string
): Promise<{ id: string; tracksJson: string } | null> {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  if (isTurso()) {
    const r = await texec("SELECT id, tracksJson FROM Playlist WHERE userId = ? AND LOWER(TRIM(name)) = ? LIMIT 1", [userId, target]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), tracksJson: String(row.tracksJson ?? "[]") };
  }
  const { db } = await import("@/lib/db");
  const rows = await db.playlist.findMany({ where: { userId }, select: { id: true, name: true, tracksJson: true } });
  const hit = rows.find((row) => row.name.trim().toLowerCase() === target);
  return hit ? { id: hit.id, tracksJson: hit.tracksJson } : null;
}

async function uniquePlaylistName(userId: string, base: string): Promise<string> {
  let name = base.trim() || "Плейлист Яндекс.Музыки";
  if (await findPlaylistByName(userId, name)) {
    name = `${base.trim()} (Яндекс)`;
    let i = 2;
    while (await findPlaylistByName(userId, name)) {
      name = `${base.trim()} (Яндекс ${i})`;
      i += 1;
      if (i > 50) break;
    }
  }
  return name.slice(0, 200);
}

async function createPlaylistRow(
  userId: string,
  name: string,
  description: string,
  cover: string,
  tracks: Array<Record<string, unknown>>
): Promise<string> {
  const id = `y${Date.now().toString(36)}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const now = new Date().toISOString();
  if (isTurso()) {
    await texec(`INSERT INTO Playlist (id, userId, name, description, cover, isPublic, tags, tracksJson, playCount, createdAt, updatedAt)
            VALUES (?,?,?,?,?,0,'',?,0,?,?)`, [id, userId, name, description, cover, JSON.stringify(tracks), now, now]);
    return id;
  }
  const { db } = await import("@/lib/db");
  await db.playlist.create({
    data: {
      id,
      userId,
      name,
      description,
      cover,
      isPublic: false,
      tags: "",
      tracksJson: JSON.stringify(tracks),
    },
  });
  return id;
}

async function writePlaylistTracks(id: string, tracks: Array<Record<string, unknown>>): Promise<void> {
  const now = new Date().toISOString();
  if (isTurso()) {
    await texec("UPDATE Playlist SET tracksJson = ?, updatedAt = ? WHERE id = ?", [JSON.stringify(tracks), now, id]);
    return;
  }
  const { db } = await import("@/lib/db");
  await db.playlist.update({ where: { id }, data: { tracksJson: JSON.stringify(tracks) } });
}

// ── Manual resolution of an ambiguous track (appends to the created playlist) ─

export async function resolveAmbiguousTrack(
  userId: string,
  jobId: string,
  kind: number,
  position: number,
  track: Track
): Promise<{ ok: true }> {
  const job = await getJob(userId, jobId);
  if (!job) throw new YandexError("job_not_found", "Задача импорта не найдена.", 404);
  const data = JSON.parse(job.data) as ImportJobData;
  const p = data.playlists.find((x) => x.kind === kind);
  if (!p || !p.imported || !p.createdPlaylistId) {
    throw new YandexError("bad_request", "Плейлист ещё не импортирован — разрешение споров недоступно.", 400);
  }
  const entry = (p.matches ?? []).find((m) => m.position === position && m.status === "ambiguous");
  if (!entry) throw new YandexError("bad_request", "Спорный трек не найден или уже разрешён.", 400);
  if (!track || typeof track.id !== "string" || !track.id.startsWith("sc_")) {
    throw new YandexError("bad_request", "Некорректный трек для разрешения спора.", 400);
  }
  entry.status = "resolved";
  entry.mqTrack = slimTrack(track);
  entry.candidates = undefined;
  // fix counts
  data.report.tracksAmbiguous = Math.max(0, data.report.tracksAmbiguous - 1);
  data.report.tracksMatched += 1;
  data.report.tracksImported += 1;
  // append to the created playlist (order: after the last imported track)
  const current = await readPlaylistTracks(p.createdPlaylistId);
  const tagged = { ...entry.mqTrack, ...sourceTag(kind, entry) };
  await writePlaylistTracks(p.createdPlaylistId, [...current, tagged]);
  await updateJob(userId, jobId, { data });
  return { ok: true };
}

async function readPlaylistTracks(playlistId: string): Promise<Array<Record<string, unknown>>> {
  if (isTurso()) {
    const r = await texec("SELECT tracksJson FROM Playlist WHERE id = ?", [playlistId]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    return safeParseArray(String(row?.tracksJson ?? "[]"));
  }
  const { db } = await import("@/lib/db");
  const p = await db.playlist.findUnique({ where: { id: playlistId }, select: { tracksJson: true } });
  return safeParseArray(p?.tracksJson ?? "[]");
}

/** Full detail for the result screen (matched list / candidates / unmatched). */
export interface ImportDetail {
  snapshot: ImportSnapshot;
  playlists: Array<{
    kind: number;
    title: string;
    createdPlaylistId: string | null;
    createdName: string | null;
    error: string | null;
    matches: MatchEntry[];
  }>;
}

export async function getImportDetail(userId: string, jobId: string): Promise<ImportDetail> {
  const job = await getJob(userId, jobId);
  if (!job) throw new YandexError("job_not_found", "Задача импорта не найдена.", 404);
  const data = JSON.parse(job.data) as ImportJobData;
  return {
    snapshot: buildSnapshot(jobId, job.status, data),
    playlists: data.playlists.map((p) => ({
      kind: p.kind,
      title: p.title,
      createdPlaylistId: p.createdPlaylistId ?? null,
      createdName: p.createdName ?? null,
      error: p.error ?? null,
      matches: (p.matches ?? []).map((m) => ({
        ...m,
        candidates: m.status === "ambiguous" ? (m.candidates ?? []).slice(0, 3) : undefined,
      })),
    })),
  };
}

/** Adapter passthrough used by the playlists list route (re-export for routes). */
export async function listYandexPlaylistsForUser(userId: string, req?: NextRequest): Promise<YandexPlaylistBrief[]> {
  const token = await requireToken(userId);
  return adapterPlaylistsList(token, req);
}
