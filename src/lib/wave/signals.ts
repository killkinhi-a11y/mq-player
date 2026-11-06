/**
 * Pure WAVE signal builder (§29 request body) shared with Android.
 *
 * Kotlin twin: android/app/src/main/kotlin/com/mq1/player/data/wave/WaveSignalsBuilder.kt.
 * Golden cases: shared/test-fixtures/wave-signals.cases.json (both platforms).
 * The server re-applies the same caps in parseSignals (route-helpers.ts), so
 * a client can never send more than these limits.
 */
import type { WaveEvent, WaveSeed, WaveSignals } from "./types";

interface TrackLike { id?: string; title?: string; artist?: string; genre?: string; scTrackId?: number | null }

export interface WaveSignalsInput {
  history: { track?: TrackLike | null }[];
  likedTracksData: TrackLike[];
  dislikedTracksData: TrackLike[];
  dislikedTrackIds: string[];
  queueIds: string[];
  waveQueueIds: string[];
  favoriteArtistNames: string[];
  /** Precomputed taste profile (web: extractTasteProfile; Android: onboarding genres). */
  taste: { topGenres: string[]; topArtists: string[]; language?: WaveSignals["language"] };
  sessionEvents: WaveEvent[];
  waveMemory?: { artists?: { value: string }[]; genres?: { value: string }[]; tracks?: { value: string }[] } | null;
  seed?: WaveSeed | null;
  debug?: boolean;
}

export const WAVE_SIGNAL_LIMITS = {
  likedArtists: 10, likedGenres: 10, dislikedArtists: 10, likedScIds: 5, historyScIds: 12,
  historyArtistsWindow: 20, historyArtists: 12, historyGenresWindow: 30, historyGenres: 12,
  tasteGenres: 6, tasteArtists: 5, sessionEvents: 120, excludeHistoryWindow: 100, excludeIds: 150,
  excludeScIds: 50, recentWaveArtists: 25, recentWaveGenres: 15, recentWaveTrackIds: 60,
  likedTexts: 12, historyTexts: 16, textLength: 120,
} as const;

const L = WAVE_SIGNAL_LIMITS;
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const nonEmpty = (x: string | undefined | null): x is string => typeof x === "string" && x.length > 0;
const scId = (x: number | null | undefined): x is number => typeof x === "number" && x !== 0 && Number.isFinite(x);
const text = (t: TrackLike | null | undefined) => `${t?.title || ""} ${t?.artist || ""}`.trim().slice(0, L.textLength);

export function buildWaveSignals(i: WaveSignalsInput): WaveSignals {
  const history = i.history || [];
  const liked = i.likedTracksData || [];
  const disliked = i.dislikedTracksData || [];
  const excludeIds = [
    ...i.queueIds,
    ...history.slice(0, L.excludeHistoryWindow).map((h) => h.track?.id),
    ...i.waveQueueIds,
    ...i.dislikedTrackIds,
  ].filter(nonEmpty);
  const out: WaveSignals = {
    likedArtists: uniq(liked.map((t) => t.artist).filter(nonEmpty)).slice(0, L.likedArtists),
    likedGenres: uniq(liked.map((t) => t.genre).filter(nonEmpty)).slice(0, L.likedGenres),
    dislikedArtists: uniq(disliked.map((t) => t.artist).filter(nonEmpty)).slice(0, L.dislikedArtists),
    likedScIds: liked.map((t) => t.scTrackId).filter(scId).slice(0, L.likedScIds),
    historyScIds: history.map((h) => h.track?.scTrackId).filter(scId).slice(0, L.historyScIds),
    historyArtists: history.slice(0, L.historyArtistsWindow).map((h) => h.track?.artist).filter(nonEmpty).slice(0, L.historyArtists),
    historyGenres: history.slice(0, L.historyGenresWindow).map((h) => h.track?.genre).filter(nonEmpty).slice(0, L.historyGenres),
    tasteGenres: i.taste.topGenres.slice(0, L.tasteGenres),
    tasteArtists: uniq([...i.favoriteArtistNames, ...i.taste.topArtists].filter(nonEmpty)).slice(0, L.tasteArtists),
    language: i.taste.language,
    sessionEvents: (i.sessionEvents || []).slice(-L.sessionEvents),
    excludeIds: uniq(excludeIds).slice(0, L.excludeIds),
    excludeScIds: disliked.map((t) => t.scTrackId).filter(scId).slice(0, L.excludeScIds),
    recentWaveArtists: (i.waveMemory?.artists || []).map((e) => e.value).slice(0, L.recentWaveArtists),
    recentWaveGenres: (i.waveMemory?.genres || []).map((e) => e.value).slice(0, L.recentWaveGenres),
    recentWaveTrackIds: (i.waveMemory?.tracks || []).map((e) => e.value).slice(0, L.recentWaveTrackIds),
    seed: i.seed || undefined,
    likedTexts: liked.slice(0, L.likedTexts).map(text).filter(Boolean),
    historyTexts: history.slice(0, L.historyTexts).map((h) => text(h.track)).filter(Boolean),
    debug: i.debug || undefined,
  };
  return out;
}
