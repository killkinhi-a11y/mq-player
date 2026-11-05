"use client";

// Extracted from MainView.tsx (Stage III decomposition) — moved verbatim.
import { Clock, Music, Pause, Play, Search, SkipForward, User, Waves } from "lucide-react";
import CoverImage from "../CoverImage";
import { NowPlayingEqualizer } from "../NowPlayingEqualizer";
import { ProviderBadge } from "../ui/ProviderBadge";
import { type Track, formatDuration } from "@/lib/musicApi";
import { TrackMoreButton } from "../ui/TrackMoreButton";
import { displayGenre } from "@/lib/tasteProfile";
import { getWaveGradient, waveReasonText } from "./homeUtils";
import { motion } from "framer-motion";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { useWaveEngine } from "@/hooks/useWaveEngine";

// ═════════════════════════════════════════════════════════════════════════
// PHASE O HOME — new card components
//
// Five card types, used where each genuinely fits (§3.5):
// FeaturedCard — one dominant block for the featured track
// ContinueListeningCard— current track + real progress
// QuickActionGrid — dense navigation with real counts
// HorizontalTrackRow — wide row card (personal picks)
// CompactTrackCard — small square card (discovery rows, recent)
// ChartRow — numbered ranked row (trending / charts)
// No glow, no decorative blur, no fake metrics. All states real.
// ═════════════════════════════════════════════════════════════════════════

export function FeaturedCard({
  track,
  reason,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  onMore,
  animationsEnabled,
}: {
  track: Track;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  onMore: (e: React.MouseEvent) => void;
  animationsEnabled: boolean;
}) {
  return (
    <article
      className="relative overflow-hidden mb-6"
      style={{
        /* V2.5 LEVEL 3 interactive surface: quiet fill + hairline edge.
           The old 3px solid accent bar is replaced by a 2px LIQUID
           PLATINUM light edge (hero action = rare material).
           FINAL: solid fill + the quiet interactive-card shadow. */
        backgroundColor: "var(--mq-mat-3-bg)",
        border: "1px solid var(--mq-mat-3-edge)",
        borderRadius: "var(--mq-mat-radius-float, 18px)",
        boxShadow: "var(--mq-mat-3-shadow)",
      }}
      aria-label={`Рекомендованный трек: ${track.title}`}
    >
      {/* Cold-light left edge — the recommended identity mark (V2 §10:
         single-color fade, no metallic two-tone gradient) */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, var(--mq-platinum-hi, #e9edf5) 60%, transparent), color-mix(in srgb, var(--mq-platinum-hi, #e9edf5) 22%, transparent))",
        }}
      />
      <div className="flex flex-col sm:flex-row">
        {/* Artwork — 40% on desktop, full-width 16:9 crop on mobile */}
        <button
          onClick={onPlay}
          className="relative sm:w-[42%] lg:w-[40%] aspect-square sm:aspect-auto sm:min-h-[220px] overflow-hidden shrink-0 group"
          aria-label={isPlaying ? "Пауза" : "Слушать"}
        >
          {track.cover ? (
            <img
              src={track.cover}
              alt=""
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-mat-2-bg)" }}>
              <Music className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {isPlaying && (
            /* FINAL §12: the equalizer alone carries now-playing — no text
               badge on top of the artwork. */
            <div
              className="absolute bottom-2 left-2 flex items-center justify-center w-7 h-7 rounded-full"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
              aria-hidden="true"
            >
              <NowPlayingEqualizer />
            </div>
          )}
        </button>

        {/* Info + actions */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 flex flex-col justify-center gap-3">
          <div>
            {/* FINAL: reason reads as quiet editorial context (§19 — accent
                stays rare; the red eyebrow was shouting over the title). */}
            <p className="mq-t-label mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
              {reason}
            </p>
            <h2 className="mq-t-display text-xl sm:text-2xl lg:text-[1.75rem] line-clamp-2" style={{ color: "var(--mq-text)" }}>
              {track.title}
            </h2>
            <button
              onClick={onArtistClick}
              className="mq-artist-link mq-artist-link--block mq-t-artist mt-1 hover:underline text-left truncate"
            >
              {track.artist}
            </button>
          </div>

          {/* Metadata — real fields only */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {track.duration > 0 && (
              <span className="mq-t-num flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                <Clock className="w-3 h-3" />{formatDuration(track.duration)}
              </span>
            )}
            {track.genre && (
              <span className="mq-t-meta" style={{ color: "var(--mq-text-muted)" }}>
                {displayGenre(track.genre)}
              </span>
            )}
            <span className="mq-t-meta">
              {track.source === "soundcloud" ? "SoundCloud" : track.source === "audius" ? "Audius" : "mq"}
            </span>
          </div>

          {/* Primary + secondary actions */}
          <div className="flex items-center gap-2.5 mt-1">
            <motion.button

              onClick={onPlay}
              className="mq-platinum-btn h-11 px-6 rounded-xl flex items-center gap-2 mq-t-btn transition-colors"
              /* FINAL CORRECTION §7: the hero's primary play CTA belongs to
                  LIQUID PLATINUM (the signature accent), not the red utility
                  accent — primary play is platinum app-wide. Flat by design. */
              aria-label={isPlaying ? "Пауза" : "Слушать"}
            >
              {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
              {isCurrent ? (isPlaying ? "Пауза" : "Продолжить") : "Слушать"}
            </motion.button>
            <button
              onClick={onArtistClick}
              className="h-11 px-4 rounded-xl flex items-center gap-2 mq-t-btn mq-icon-btn"
              style={{ ["--mq-rest-bg" as string]: "var(--mq-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
            >
              <User className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              К артисту
            </button>
            <TrackMoreButton onOpen={onMore} size="lg" alwaysVisible label={`Действия: ${track.title}`} className="ml-auto" />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTINUE LISTENING (V4.1 premium pass) — the desktop Home band that
   returns the user to the ONE thing they were really hearing.
   Honest data contract:
   • The card shows the CURRENT track with its LIVE position — the audio
     element holds that position, so «Продолжить» is a real resume.
   • History tracks have NO saved position in MQ (HistoryEntry carries
     track/playedAt/playCount only) — they never get a fake progress bar
     or a fake Resume; they live in the «Недавно» row as honest Plays.
   • Artwork is the visual anchor; progress + timecodes are real; the
     provider badge mirrors the actual attribution (catalog vs playback).
   ══════════════════════════════════════════════════════════════════════════ */
export function ContinueListeningCard({
  track,
  duration,
  isPlaying,
  radioMode,
  onToggle,
  onSkip,
  onMore,
  onOpenFull,
  onGoSearch,
}: {
  track: Track | null;
  duration: number;
  isPlaying: boolean;
  radioMode: boolean;
  onToggle: () => void;
  onSkip: () => void;
  onMore: (e: React.MouseEvent) => void;
  onOpenFull: () => void;
  onGoSearch: () => void;
}) {
  /* P0 FIX: live position from the unified PlaybackClock (the store's
     `progress` never ticks during playback). */
  const progress = usePlaybackProgress(500);
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // Honest empty state — V4 structured empty with a REAL CTA.
  if (!track) {
    return (
      <div
        className="rounded-[var(--mq-mat-radius,14px)] p-4 sm:p-5 flex items-center gap-4 min-w-0"
        style={{ backgroundColor: "var(--mq-mat-2-bg)", border: "1px solid var(--mq-mat-2-edge)", boxShadow: "var(--mq-mat-2-shadow)" }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
          aria-hidden
        >
          <Play className="w-6 h-6" style={{ color: "var(--mq-accent)" }} fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mq-t-section text-sm" style={{ color: "var(--mq-text)" }}>Продолжить прослушивание</p>
          <p className="mq-t-meta text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            Включите трек — он появится здесь с текущей позицией
          </p>
        </div>
        <button
          onClick={onGoSearch}
          className="mq-platinum-btn mq-hit44 hidden sm:flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-semibold shrink-0"
          aria-label="Найти музыку"
        >
          <Search className="w-3.5 h-3.5" />
          Найти музыку
        </button>
      </div>
    );
  }

  const provider =
    track.catalogProvider === "deezer" || track.catalogProvider === "spotify"
      ? track.catalogProvider
      : track.playbackProvider || (track.source === "audius" || track.source === "soundcloud" ? track.source : null);

  return (
    <div
      className="group/cl rounded-[var(--mq-mat-radius-float,18px)] p-4 sm:p-5 flex items-center gap-4 min-w-0 transition-colors duration-150"
      style={{ backgroundColor: "var(--mq-mat-3-bg)", border: "1px solid var(--mq-mat-3-edge)", boxShadow: "var(--mq-mat-3-shadow)" }}
    >
      {/* Artwork — the visual anchor; opens the full player (real action) */}
      <button
        onClick={onOpenFull}
        className="relative w-[88px] h-[88px] rounded-[var(--mq-r-art)] overflow-hidden shrink-0 mq-art"
        style={{ backgroundColor: "var(--mq-surface-2)", boxShadow: "var(--mq-mat-2-shadow)" }}
        aria-label={`Открыть плеер: ${track.title}`}
      >
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="w-full h-full flex items-center justify-center">
            <Music className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
          </span>
        )}
        {isPlaying && (
          <span
            className="absolute bottom-1.5 left-1.5 flex items-center justify-center w-6 h-6 rounded-full"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            aria-hidden
          >
            <NowPlayingEqualizer size="xs" variant="inline" />
          </span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="mq-t-label mq-t-meta-2 text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--mq-text-muted)" }}>
          Продолжить прослушивание
        </p>
        <p className="mq-t-track text-[15px] truncate mt-1" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="mq-t-artist truncate">{track.artist}</span>
          {track.album && (
            <>
              <span style={{ color: "var(--mq-text-muted)" }}>·</span>
              <span className="mq-t-meta truncate">{track.album}</span>
            </>
          )}
          {provider && (
            <span className="shrink-0 ml-0.5"><ProviderBadge provider={provider} size="xs" /></span>
          )}
        </div>
        {/* Real progress — live position of the current track */}
        <div className="mt-2.5 flex items-center gap-2.5">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--mq-border-thin)" }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Позиция трека"
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--mq-platinum-progress)" }} />
          </div>
          <span className="mq-t-num text-xs shrink-0 tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Actions: real resume (audio element holds the position) + more */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onToggle}
          className="mq-platinum-btn mq-platinum-btn--hero mq-press w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          /* V2 §10.5 contract (pinned by tests): flat liquid-glass primary
             play with INLINE backdrop blur — Lightning-class engines strip
             backdrop-filter from stylesheets, so the blur rides the inline
             style (MenuCore pattern). */
          aria-label={isPlaying ? "Пауза" : "Продолжить"}
          style={{ backdropFilter: "var(--mq-blur-md)", WebkitBackdropFilter: "var(--mq-blur-md)" }}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" fill="currentColor" />
          ) : (
            <Play className="w-5 h-5 translate-x-[1px]" fill="currentColor" />
          )}
        </button>
        {radioMode && (
          <button
            onClick={onSkip}
            className="mq-hit44 w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--mq-overlay-hover)]"
            style={{ border: "1px solid var(--mq-border-thin)" }}
            aria-label="Следующий в WAVE"
          >
            <SkipForward className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        )}
        <TrackMoreButton onOpen={onMore} alwaysVisible label={`Действия: ${track.title}`} />
      </div>
    </div>
  );
}

export function MobileNowHero({
  track,
  fallbackTrack,
  fallbackReason,
  isPlaying,
  duration,
  radioMode,
  onToggle,
  onPrev,
  onNext,
  onPlayFallback,
  onArtistClick,
  onOpenFull,
  onMore,
}: {
  track: Track | null;
  fallbackTrack: Track | null;
  fallbackReason: string;
  isPlaying: boolean;
  duration: number;
  radioMode: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayFallback: () => void;
  onArtistClick: (artist: string) => void;
  onOpenFull: () => void;
  onMore: (e: React.MouseEvent) => void;
}) {
  /* P0 FIX: the edge progress strip rode the static store `progress`
     (never ticked) — subscribe to the unified PlaybackClock instead. */
  const liveProgress = usePlaybackProgress(500);
  const hero = track || fallbackTrack;
  const isNow = !!track; // true → real "now playing"; false → pick + play CTA
  const pct = isNow && duration > 0 ? Math.min(100, (liveProgress / duration) * 100) : 0;

  // Honest empty state: no track, no recommendation → compact Wave card,
  // same 76px geometry as the now-card (one primary action, no dead zones).
  if (!hero) {
    return (
      <div
        data-mq-hero
        className="mb-4 rounded-2xl overflow-hidden"
        style={{ background: getWaveGradient(), border: "1px solid var(--mq-border-hairline)" }}
        aria-label="WAVE"
      >
        <HeroWaveCTA compact />
      </div>
    );
  }

  // ── Compact horizontal NOW card (2026-09 redesign) ──────────────────────
  // Was: full-width 42vh artwork + title + progress + 3 transport buttons
  // ≈ 500px of vertical space ("a Now-Playing overlay, not a dashboard").
  // Now: ONE 76px row — 68px art, eyebrow reason, 1-line identity,
  // thumb-side play/next, progress as a 2.5px edge strip. The immersive
  // experience lives in the full player; Home is a dashboard again.
  return (
    <section data-mq-hero className="mb-4" aria-label={isNow ? "Текущий трек" : "Рекомендация"}>
      <div
        className="relative rounded-[var(--mq-mat-radius,14px)] flex items-center gap-3 pl-2.5 pr-2 py-2.5 overflow-hidden"
        style={{ backgroundColor: "var(--mq-mat-2-bg)", border: "1px solid var(--mq-mat-2-edge)", boxShadow: "var(--mq-mat-2-shadow)" }}
      >
        {/* Artwork — tap opens the full player (immersive layer lives there) */}
        <button
          onClick={onOpenFull}
          className="relative w-[68px] h-[68px] rounded-[14px] overflow-hidden flex-shrink-0"
          aria-label={isNow ? "Открыть плеер" : "Открыть трек"}
        >
          {hero.cover ? (
            <CoverImage
              src={hero.cover}
              title={hero.title}
              eager
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: getWaveGradient() }}>
              <Music className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {isNow && isPlaying && (
            <span className="absolute left-1 top-1"><NowPlayingEqualizer size="xs" variant="overlay" /></span>
          )}
        </button>

        {/* Identity — tap opens the full player; artist row navigates */}
        <button
          onClick={onOpenFull}
          className="flex-1 min-w-0 text-left py-0.5"
          aria-label={`Открыть плеер: ${hero.title}`}
        >
          <p
            className="mq-t-label truncate mb-0.5"
            /* FINAL §19: reason is secondary context — muted, never accent.
               The equalizer on the artwork already says now-playing. */
            style={{ color: "var(--mq-text-muted)" }}
          >
            {isNow
              ? waveReasonText(hero)
              : fallbackReason || "Подобрано для тебя"}
          </p>
          <p className="mq-t-track truncate" style={{ color: "var(--mq-text)" }}>
            {hero.title}
          </p>
          <span
            onClick={(e) => { e.stopPropagation(); onArtistClick(hero.artist); }}
            className="mq-artist-link mq-artist-link--block mq-t-artist truncate max-w-full"
            aria-label={`Артист: ${hero.artist}`}
          >
            {hero.artist}
          </span>
        </button>

        {/* Thumb-side transport: play/pause + next (44px targets) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={isNow ? onToggle : onPlayFallback}
            /* FINAL §1+§7: primary play = FLAT Liquid Platinum (interface,
               not a physical object). The old red disc read loud + generic. */
            className="mq-platinum-btn w-11 h-11 rounded-full flex items-center justify-center"
            aria-label={isNow ? (isPlaying ? "Пауза" : "Продолжить") : "Слушать"}
          >
            {isNow && isPlaying ? (
              <Pause className="w-[18px] h-[18px]" fill="currentColor" />
            ) : (
              <Play className="w-[18px] h-[18px] translate-x-[1px]" fill="currentColor" />
            )}
          </button>
          {isNow && (
            <button
              onClick={onNext}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-transform"
              style={{ color: "var(--mq-text-muted)" }}
              aria-label="Следующий трек"
            >
              <SkipForward className="w-5 h-5" fill="currentColor" />
            </button>
          )}
          <TrackMoreButton onOpen={onMore} alwaysVisible label={`Действия: ${hero.title}`} />
        </div>

        {/* Progress — 2.5px accent strip on the card's bottom edge */}
        {isNow && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[2.5px]"
            style={{ backgroundColor: "var(--mq-border-thin)" }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Прогресс трека"
          >
            <div className="h-full" style={{ width: `${pct}%`, background: "var(--mq-platinum-progress)" }} />
          </div>
        )}
      </div>
    </section>
  );
}

// Wave CTA inside the empty hero — calls the real wave engine (no timers).
// compact → one 76px row (icon + label + action) matching the now-card
// geometry; default → the standalone full-width button.
export function HeroWaveCTA({ compact = false }: { compact?: boolean }) {
  const wave = useWaveEngine();
  if (compact) {
    return (
      <button
        onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
        disabled={wave.waveLoading}
        className="w-full flex items-center gap-3 px-3 py-3.5 transition-transform disabled:opacity-60 text-left"
        aria-label={wave.radioMode ? "Пауза WAVE" : "Запустить WAVE"}
      >
        <div
          className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
        >
          {wave.waveLoading ? (
            <div className="mq-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-text-muted)", borderTopColor: "transparent" }} />
          ) : (
            <Waves className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="mq-t-meta mq-t-meta-2 uppercase tracking-[0.12em] mb-0.5" style={{ color: "var(--mq-text-muted)" }}>
            Персональное радио
          </p>
          <p className="mq-t-title mq-t-section font-semibold leading-tight" style={{ color: "var(--mq-text)" }}>
            {wave.waveLoading ? "Подбираем музыку…" : "Запустить WAVE"}
          </p>
          <p className="mq-t-body text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            по истории, лайкам и любимым артистам
          </p>
        </div>
        <span
          className="mq-platinum-btn w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          /* V2 §10.4: flat liquid-glass play disc (mq-platinum-btn class). */
          aria-hidden="true"
        >
          <Play className="w-[18px] h-[18px] translate-x-[1px]" fill="currentColor" />
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
      disabled={wave.waveLoading}
      className="mq-platinum-btn w-full h-12 rounded-2xl flex items-center justify-center gap-2.5 transition-transform disabled:opacity-60"
      aria-label="Запустить WAVE"
    >
      {wave.waveLoading ? (
        <div className="mq-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "currentColor", borderTopColor: "transparent" }} />
      ) : (
        <Waves className="w-5 h-5" />
      )}
      <span className="mq-t-label text-sm font-semibold">
        {wave.waveLoading ? "Подбираем музыку…" : wave.radioMode ? "Пауза WAVE" : "Запустить WAVE"}
      </span>
    </button>
  );
}
