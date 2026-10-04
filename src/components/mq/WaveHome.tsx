"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Play, Pause, Heart, SkipForward, Sparkles, Minus, X, Waves,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { formatDuration, type Track } from "@/lib/musicApi";
import { waveReasonText as engineReasonText, waveSeedLabel } from "@/lib/wave/reasons";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";

/* ══════════════════════════════════════════════════════════════════════════
   WaveHome — the dedicated Wave experience block (§14).

   Rendered on Home while the Wave session is active. Shows:
     • seed chip (what the wave is built from — honest)
     • now playing + reason (why this track — honest attribution only)
     • real progress — driven by the EXISTING unified audio clock
       (store progress/duration, §27 — no second timer here)
     • next up — the logical wave queue with reasons
     • controls: Like · Skip · More like this · Less like this · Stop

   The full queue drawer stays in PlayerBar (single owner, §12) — WaveHome
   is the wave's home surface, not a second queue UI.

   Mobile (390×844): single column, 44px+ touch targets, controls at the
   bottom of the card (thumb zone). Desktop: two columns (now + next up).
   ══════════════════════════════════════════════════════════════════════════ */

export default function WaveHome() {
  const wave = useWaveEngine();
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const playTrack = useAppStore((s) => s.playTrack);
  const isTrackLiked = useAppStore((s) => s.isTrackLiked);

  const [menu, setMenu] = useState<{ track: Track; x: number; y: number } | null>(null);

  const seedChip = useMemo(() => {
    if (!wave.waveSession) return "Волна";
    return waveSeedLabel(wave.waveSession.seed.kind, wave.waveSession.seed.label);
  }, [wave.waveSession]);

  const currentReasonText = useMemo(() => {
    if (!currentTrack) return "";
    const t = currentTrack as Track & { _reason?: string; _seedArtist?: string };
    if (t._reason) {
      // New engine reasons — full honest texts with attribution.
      const known = ["similar_track", "similar_artist", "favorite_artist", "favorite_genre", "recent_listening", "taste_profile", "exploration"];
      if (known.includes(t._reason)) {
        return engineReasonText(t._reason as Parameters<typeof engineReasonText>[0], t._seedArtist);
      }
    }
    return "";
  }, [currentTrack]);

  const handlePlayNextUp = useCallback(
    (track: Track) => {
      const queueTracks = wave.nextUpPreview.map((q) => q.track);
      const idx = queueTracks.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        playTrack(track, queueTracks.slice(idx));
      } else {
        playTrack(track, [track]);
      }
    },
    [playTrack, wave.nextUpPreview],
  );

  if (!wave.radioMode) return null;

  const liked = currentTrack ? isTrackLiked(currentTrack.id) : false;
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <section
      className="mb-6 rounded-3xl overflow-hidden relative"
      style={{
        background: "var(--mq-card)",
        border: "1px solid var(--mq-border-thin)",
      }}
      aria-label="Волна — персональное радио"
      data-testid="wave-home"
    >
      {/* Accent edge — matches FeaturedCard language */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: "var(--mq-accent)" }}
        aria-hidden="true"
      />

      {/* ── Header: seed chip + stop ── */}
      <div className="flex items-center justify-between gap-3 pl-5 pr-3 sm:pr-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Waves className="w-4 h-4 shrink-0" style={{ color: "var(--mq-accent)" }} />
          <span
            className="mq-t-label mq-t-meta-2 uppercase tracking-[0.12em] truncate"
            style={{ color: "var(--mq-accent)" }}
          >
            {seedChip}
          </span>
          {isPlaying && (
            <span className="hidden sm:inline-flex" aria-hidden="true">
              <NowPlayingEqualizer size="sm" />
            </span>
          )}
        </div>
        <button
          onClick={wave.stopWave}
          className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
          aria-label="Остановить Волну"
        >
          <X className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      </div>

      <div className="px-4 sm:px-5 pb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        {/* ── Now playing + controls (left / mobile-first) ── */}
        <div className="min-w-0">
          {currentTrack ? (
            <>
              <div className="flex items-start gap-3.5">
                {/* Artwork */}
                <button
                  onClick={() => useAppStore.getState().setFullTrackViewOpen(true)}
                  className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl overflow-hidden shrink-0"
                  style={{ border: "1px solid var(--mq-border-thin)" }}
                  aria-label="Открыть плеер"
                >
                  {currentTrack.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentTrack.cover}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg))" }}
                    >
                      <Waves className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="mq-t-title font-semibold leading-tight line-clamp-2" style={{ color: "var(--mq-text)" }}>
                    {currentTrack.title}
                  </p>
                  <p className="mq-t-body text-sm mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {currentTrack.artist}
                  </p>
                  {(currentReasonText || wave.currentReason) && (
                    <p
                      className="mq-t-meta text-xs mt-1.5 truncate"
                      style={{ color: "var(--mq-accent)" }}
                      data-testid="wave-current-reason"
                    >
                      {currentReasonText || "Волна · играет"}
                    </p>
                  )}
                </div>
              </div>

              {/* Progress — EXISTING unified audio clock (§27), no own timers */}
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="mq-t-num mq-t-meta-2 tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                  {formatDuration(progress)}
                </span>
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--mq-border-thin)" }}
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Прогресс трека"
                >
                  <div className="h-full" style={{ width: `${pct}%`, backgroundColor: "var(--mq-accent)" }} />
                </div>
                <span className="mq-t-num mq-t-meta-2 tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                  {formatDuration(duration || currentTrack.duration)}
                </span>
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="mq-t-body text-sm" style={{ color: "var(--mq-text-muted)" }}>
                {wave.waveLoading ? "Подбираем музыку для вас…" : "Волна остановлена"}
              </p>
            </div>
          )}

          {/* ── Controls — 44px targets, thumb zone on mobile ── */}
          <div className="mt-4 flex items-center gap-2" role="group" aria-label="Управление Волной">
            <button
              onClick={wave.likeTrack}
              disabled={!currentTrack}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: liked
                  ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                  : "color-mix(in srgb, var(--mq-text) 8%, transparent)",
              }}
              aria-label={liked ? "Убрать лайк" : "Лайк"}
              aria-pressed={liked}
            >
              <Heart
                className="w-[19px] h-[19px]"
                style={{ color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                fill={liked ? "var(--mq-accent)" : "none"}
              />
            </button>

            <button
              onClick={() => (isPlaying ? wave.pauseWave() : wave.startWave())}
              disabled={wave.waveLoading}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
              aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
            >
              {wave.waveLoading ? (
                <div
                  className="mq-spin w-5 h-5 border-2 rounded-full"
                  style={{ borderColor: "var(--mq-text-on-accent, #fff)", borderTopColor: "transparent" }}
                />
              ) : isPlaying ? (
                <Pause className="w-6 h-6" fill="currentColor" />
              ) : (
                <Play className="w-6 h-6 translate-x-[1px]" fill="currentColor" />
              )}
            </button>

            <button
              onClick={wave.skipTrack}
              disabled={wave.waveLoading}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
              aria-label="Пропустить"
            >
              <SkipForward className="w-[19px] h-[19px]" style={{ color: "var(--mq-text)" }} />
            </button>

            <div className="flex-1" />

            <button
              onClick={() => wave.moreLikeThis()}
              disabled={!currentTrack}
              className="h-11 px-3.5 rounded-full flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--mq-accent) 30%, transparent)",
              }}
              aria-label="Больше такого"
              title="Больше такого — следующий выбор ближе к этому звучанию"
            >
              <Sparkles className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              <span className="mq-t-label text-xs font-medium" style={{ color: "var(--mq-accent)" }}>
                Больше такого
              </span>
            </button>

            <button
              onClick={() => wave.lessLikeThis()}
              disabled={!currentTrack}
              className="w-11 h-11 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
              aria-label="Меньше такого"
              title="Меньше такого — временно ослабить похожие сигналы"
            >
              <Minus className="w-[19px] h-[19px]" style={{ color: "var(--mq-text-muted)" }} />
            </button>
          </div>

          {wave.waveError && (
            <p className="mq-t-meta text-xs mt-2.5" style={{ color: "#e5484d" }} role="alert">
              {wave.waveError}
            </p>
          )}
        </div>

        {/* ── Next up — honest reasons per track (§14, §15) ── */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="mq-t-label mq-t-meta-2 uppercase tracking-[0.12em]" style={{ color: "var(--mq-text-muted)" }}>
              Дальше в Волне
            </p>
            <span className="mq-t-num mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
              {wave.waveQueueLength}
            </span>
          </div>

          {wave.nextUpPreview.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-5 text-center"
              style={{ border: "1px dashed var(--mq-border-thin)" }}
            >
              <p className="mq-t-body text-xs" style={{ color: "var(--mq-text-muted)" }}>
                {wave.waveLoading ? "Подбираем следующие треки…" : "Запас пополняется — продолжайте слушать"}
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5" data-testid="wave-next-up">
              {wave.nextUpPreview.map((item, i) => (
                <li key={item.track.id}>
                  <button
                    onClick={() => handlePlayNextUp(item.track)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ track: item.track, x: e.clientX, y: e.clientY });
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-2xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_5%,transparent)]"
                    aria-label={`${item.track.title} — ${item.track.artist}`}
                  >
                    <span
                      className="mq-t-num mq-t-meta-2 w-5 text-center shrink-0"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="w-10 h-10 rounded-xl overflow-hidden shrink-0"
                      style={{ border: "1px solid var(--mq-border-thin)" }}
                      aria-hidden="true"
                    >
                      {item.track.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                      ) : (
                        <span
                          className="w-full h-full flex items-center justify-center"
                          style={{ background: "color-mix(in srgb, var(--mq-accent) 14%, var(--mq-bg))" }}
                        >
                          <Waves className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mq-t-body text-sm font-medium block truncate" style={{ color: "var(--mq-text)" }}>
                        {item.track.title}
                      </span>
                      <span className="mq-t-meta text-xs block truncate" style={{ color: "var(--mq-text-muted)" }}>
                        {item.track.artist}
                      </span>
                    </span>
                    <span
                      className="mq-t-meta mq-t-meta-2 text-[11px] px-2 py-1 rounded-full shrink-0 max-w-[45%] truncate"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)",
                        color: "var(--mq-accent)",
                      }}
                    >
                      {engineReasonText(item.reason, item.seedRef)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Session stats — honest, real counters (§31-adjacent UX) */}
          {wave.waveSession && (wave.waveSession.stats.skipped > 0 || wave.waveSession.stats.completed > 0) && (
            <p className="mq-t-meta mq-t-meta-2 text-[11px] mt-2.5" style={{ color: "var(--mq-text-muted)" }}>
              {`Сессия: ${wave.waveSession.stats.started} треков · ${wave.waveSession.stats.completed} дослушано · ${wave.waveSession.stats.skipped} пропущено`}
            </p>
          )}
        </div>
      </div>

      {/* Track context menu (wave context → "Не интересно" = less_like_this) */}
      {menu && (
        <ContextMenu
          track={menu.track}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          context={{
            kind: "wave",
            onNotInterested: () => {
              wave.lessLikeThis(menu.track);
              useAppStore.getState().removeWaveItems([menu.track.id]);
            },
          }}
        />
      )}
    </section>
  );
}
