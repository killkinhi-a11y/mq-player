"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Play, Pause, Heart, SkipForward, Sparkles, Minus, X, Waves, MoreHorizontal,
  Maximize2, Radio,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { formatDuration, type Track } from "@/lib/musicApi";
import { waveReasonText as engineReasonText, waveSeedLabel } from "@/lib/wave/reasons";
import type { WaveRelevanceDebug } from "@/lib/wave";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import MenuCore, { type MenuElement } from "./ui/MenuCore";

/* ══════════════════════════════════════════════════════════════════════════
   WaveHome V2 — the personal music station hero.

   The Wave must feel like MY endless personal stream — not a queue panel,
   not a recommendation dashboard. The composition follows the listening
   moment:

     • ARTWORK is the dominant object (desktop clamp 280–420px, mobile
       min(78vw, 340px)) with a layered crossfade on track change and a
       soft shadow dyed by the track's ambient palette.
     • Identity block — title, artist, quiet reason ("Потому что тебе
       нравится X") — reads like a sentence, never shouts in red.
     • TRANSPORT — ♥ / ▶ / ⏭ with the correct hierarchy: Play is the only
       filled button; "Больше/Меньше такого" live in the secondary ⋯ menu.
     • UP NEXT — a compact visual flow (56px covers, no index numbers,
       quiet per-track reasons).
     • ONE progress line — WaveHome is not a mini-player.

   Ambient background: local wash built from the --mq-ambient-* vars the
   app's AmbientBackground publishes from the current cover's dominant
   colors — @property-registered, so they cross-fade ~2.6s automatically.

   Motion: compositor-only (opacity/transform), all gated by
   prefers-reduced-motion (globals.css .mq-wave-* rules).

   Progress stays driven by the EXISTING unified audio clock (store
   progress/duration) — no second timer here (§27).
   The full queue drawer stays in PlayerBar (single owner, §12).

   Dev/debug mode (PART 11): localStorage 'mq_wave_debug' = '1' → the
   request ships relevance metadata and WaveHome renders score chips.
   ══════════════════════════════════════════════════════════════════════════ */

const KNOWN_REASONS = [
  "similar_track", "similar_artist", "favorite_artist", "favorite_genre",
  "recent_listening", "taste_profile", "exploration",
] as const;

type ReasonKey = (typeof KNOWN_REASONS)[number];

function readDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("mq_wave_debug") === "1";
  } catch {
    return false;
  }
}

/** Live-subscribed debug flag (no setState-in-effect, no hydration drift). */
function useWaveDebugMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => readDebugMode(),
    () => false,
  );
}

/* ── Artwork crossfade ────────────────────────────────────────────────────
   Layers keyed by track id: the newest fades in over the previous one
   (old stays underneath, removed after the transition). Reduced motion
   disables the transition in CSS — the swap is then instant. */

function CrossfadeArtwork({
  track,
  onOpen,
  onSwipeLeft,
}: {
  track: Track | null;
  onOpen: () => void;
  onSwipeLeft?: () => void;
}) {
  const activeId = track?.id || null;
  const [state, setState] = useState<{ activeId: string | null; layers: Array<{ id: string; cover?: string }> }>(
    () => (activeId ? { activeId, layers: [{ id: activeId, cover: track?.cover }] } : { activeId: null, layers: [] }),
  );
  const [lastSeen, setLastSeen] = useState(activeId);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Track changed → push the new layer (official adjust-state-during-render
  // pattern: guarded, idempotent, no effect needed for the swap itself).
  if (activeId !== lastSeen) {
    setLastSeen(activeId);
    setState((s) =>
      activeId
        ? { activeId, layers: [...s.layers.filter((l) => l.id !== activeId), { id: activeId, cover: track?.cover }].slice(-2) }
        : { activeId: null, layers: [] },
    );
  }

  // Superseded layers retire once the crossfade has settled (async —
  // never a synchronous setState inside the effect).
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      setState((s) => (s.layers.length <= 1 ? s : { ...s, layers: s.layers.slice(-1) }));
    }, 640);
    return () => clearTimeout(t);
  }, [activeId]);

  return (
    <button
      type="button"
      onClick={onOpen}
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        if (!touchStart.current) return;
        const dx = e.changedTouches[0].clientX - touchStart.current.x;
        const dy = e.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;
        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          if (dx < 0) onSwipeLeft?.();
        }
      }}
      className="mq-wave-art block w-full aspect-square"
      aria-label={track ? `Открыть плеер: ${track.title}` : "Открыть плеер"}
    >
      {state.layers.length === 0 ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "var(--mq-mat-2-bg)" }}
          aria-hidden="true"
        >
          <Waves className="w-12 h-12" style={{ color: "var(--mq-text-muted)" }} />
        </span>
      ) : (
        state.layers.map((l) => (
          <span
            key={l.id}
            className="mq-wave-art-layer"
            data-active={l.id === activeId || undefined}
            aria-hidden="true"
          >
            {l.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.cover} alt="" draggable={false} />
            ) : (
              <span
                className="w-full h-full flex items-center justify-center"
                style={{ background: "var(--mq-mat-2-bg)" }}
              >
                <Waves className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} />
              </span>
            )}
          </span>
        ))
      )}
    </button>
  );
}

/* ── Quiet reason line — secondary, never shouting ── */
function ReasonLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p
      className="mq-t-meta inline-flex items-center gap-1.5 min-w-0"
      style={{ color: "var(--mq-text-muted)" }}
      data-testid="wave-current-reason"
    >
      <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--mq-accent)", opacity: 0.75 }} aria-hidden="true" />
      <span className="truncate">{text}</span>
    </p>
  );
}

/* ── Debug chips (dev mode only, PART 11) ── */
function DebugChips({ debug }: { debug?: WaveRelevanceDebug | null }) {
  if (!debug) return null;
  const items: Array<[string, string]> = [
    ["anchor", debug.anchor || "—"],
    ["final", String(debug.finalScore)],
    ["artist", String(debug.artistScore)],
    ["genre", String(debug.genreScore)],
    ["session", String(debug.sessionScore)],
    ["lang", String(debug.languageScore)],
    ["neg", String(debug.negativeScore)],
  ];
  return (
    <div className="flex flex-wrap gap-1 mt-1.5" data-testid="wave-debug-chips">
      {items.map(([k, v]) => (
        <span
          key={k}
          className="mq-t-num text-[11px] px-1.5 py-0.5 rounded"
          style={{ background: "color-mix(in srgb, var(--mq-text) 7%, transparent)", color: "var(--mq-text-muted)" }}
        >
          {k}:{v}
        </span>
      ))}
    </div>
  );
}

/* ── Up-next presentations ──
   Card (desktop shelf): vertical — 72px art above, identity + quiet reason
   below. Fixed width keeps the shelf rhythm; snap scroll = stream feel.
   Row (mobile list): 56px art, two lines + reason, full-width tap target. */

type NextUpItem = NonNullable<ReturnType<typeof useWaveEngine>["nextUpPreview"]>[number];

function NextUpArtwork({ src }: { src?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />;
  }
  return (
    <span
      className="w-full h-full flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--mq-accent) 14%, var(--mq-bg))" }}
    >
      <Waves className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
    </span>
  );
}

function NextUpCard({ item, onPlay, debugMode }: { item: NextUpItem; onPlay: () => void; debugMode: boolean }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="w-[188px] flex flex-col gap-2 p-2 rounded-2xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_5%,transparent)]"
      aria-label={`${item.track.title} — ${item.track.artist}`}
    >
      <span
        className="block w-[172px] h-[172px] rounded-xl overflow-hidden"
        style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
        aria-hidden="true"
      >
        <NextUpArtwork src={item.track.cover} />
      </span>
      <span className="min-w-0 px-0.5">
        <span className="mq-t-track block truncate" style={{ color: "var(--mq-text)" }}>
          {item.track.title}
        </span>
        <span className="mq-t-meta block truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
          {item.track.artist}
        </span>
        <span className="mq-t-meta-2 block truncate mt-0.5" style={{ color: "var(--mq-text-muted)", opacity: 0.72 }}>
          {engineReasonText(item.reason, item.seedRef)}
        </span>
        {debugMode && item.debug && (
          <span className="mq-t-num text-[11px] block mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            {`final ${item.debug.finalScore} · anchor ${item.debug.anchor || "—"}`}
          </span>
        )}
      </span>
    </button>
  );
}

function NextUpRow({
  item,
  onPlay,
  onContextMenu,
  debugMode,
}: {
  item: NextUpItem;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  debugMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      onContextMenu={onContextMenu}
      className="w-full flex items-center gap-3 p-2 -mx-1 rounded-xl text-left transition-colors hover:bg-[color-mix(in_srgb,var(--mq-text)_5%,transparent)]"
      aria-label={`${item.track.title} — ${item.track.artist}`}
    >
      <span
        className="w-14 h-14 rounded-xl overflow-hidden shrink-0"
        style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
        aria-hidden="true"
      >
        <NextUpArtwork src={item.track.cover} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mq-t-track block truncate" style={{ color: "var(--mq-text)" }}>
          {item.track.title}
        </span>
        <span className="mq-t-meta block truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
          {item.track.artist}
        </span>
        <span className="mq-t-meta-2 block truncate mt-0.5" style={{ color: "var(--mq-text-muted)", opacity: 0.72 }}>
          {engineReasonText(item.reason, item.seedRef)}
        </span>
        {debugMode && item.debug && (
          <span className="mq-t-num text-[11px] block mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            {`final ${item.debug.finalScore} · anchor ${item.debug.anchor || "—"}${item.debug.relevancePassed ? "" : " · REJECTED"}`}
          </span>
        )}
      </span>
    </button>
  );
}

export default function WaveHome() {
  const wave = useWaveEngine();
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const playTrack = useAppStore((s) => s.playTrack);
  const isTrackLiked = useAppStore((s) => s.isTrackLiked);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);

  const [menu, setMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<{ x: number; y: number } | null>(null);
  const debugMode = useWaveDebugMode();

  const seedChip = useMemo(() => {
    if (!wave.waveSession) return "WAVE";
    return waveSeedLabel(wave.waveSession.seed.kind, wave.waveSession.seed.label);
  }, [wave.waveSession]);

  const currentReasonText = useMemo(() => {
    if (!currentTrack) return "";
    const t = currentTrack as Track & { _reason?: string; _seedArtist?: string };
    if (t._reason && (KNOWN_REASONS as readonly string[]).includes(t._reason)) {
      return engineReasonText(t._reason as ReasonKey, t._seedArtist);
    }
    return "";
  }, [currentTrack]);

  const currentDebug = useMemo(() => {
    const t = currentTrack as (Track & { _debug?: WaveRelevanceDebug }) | null;
    return t?._debug ?? null;
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

  const openFullPlayer = useCallback(() => {
    useAppStore.getState().setFullTrackViewOpen(true);
  }, []);

  const moreMenu: MenuElement[] = useMemo(() => [
    {
      type: "item",
      id: "more-like",
      icon: Sparkles,
      label: "Больше такого",
      hint: "следующие — ближе к этому звучанию",
      disabled: !currentTrack,
      onSelect: () => wave.moreLikeThis(),
    },
    {
      type: "item",
      id: "less-like",
      icon: Minus,
      label: "Меньше такого",
      hint: "реже похожее в этой сессии",
      disabled: !currentTrack,
      onSelect: () => wave.lessLikeThis(),
    },
    { type: "separator" },
    {
      type: "item",
      id: "open-player",
      icon: Maximize2,
      label: "Открыть в плеере",
      onSelect: openFullPlayer,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [currentTrack, openFullPlayer, wave.moreLikeThis, wave.lessLikeThis]);

  if (!wave.radioMode) return null;

  const liked = currentTrack ? isTrackLiked(currentTrack.id) : false;
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const trackKey = currentTrack?.id ?? "empty";

  return (
    <section
      className="mq-wave"
      aria-label="WAVE — персональное радио"
      data-testid="wave-home"
      /* V2.5: mark as the mobile hero owner — MobileDock's hero detection
         ([data-mq-hero]) hides its mini player while the wave hero is in
         view, so the now-playing surface never duplicates on phones. */
      data-mq-hero=""
    >
      {/* Ambient wash — derived from the current track's cover palette */}
      <div className="mq-wave-ambient" aria-hidden="true" />

      {/* ── Header: identity + transport shortcuts ── */}
      <div className="relative flex items-center justify-between gap-3 px-5 sm:px-7 pt-5 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* V2.5: bare identity icon (no chip-box) + LIQUID PLATINUM
              wordmark — Wave identity as the rare material, quiet and cold. */}
          <Radio className="w-[18px] h-[18px] shrink-0" style={{ color: "var(--mq-accent)" }} aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="mq-platinum-text mq-t-label truncate"
                style={{ fontSize: 13, letterSpacing: "0.34em", fontWeight: 700, textTransform: "none" }}
              >
                WAVE
              </h2>
              {isPlaying && (
                <span aria-hidden="true"><NowPlayingEqualizer size="xs" /></span>
              )}
            </div>
            <p className="mq-t-meta-2 truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
              {seedChip.replace(/^WAVE\s*/, "") || "музыка, которая подстраивается под тебя"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => (isPlaying ? wave.pauseWave() : wave.startWave())}
            disabled={wave.waveLoading}
            className="mq-wave-btn w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-50"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)",
              color: "var(--mq-text)",
            }}
            aria-label={isPlaying ? "Пауза" : "Продолжить"}
          >
            {isPlaying ? <Pause className="w-[18px] h-[18px]" fill="currentColor" /> : <Play className="w-[18px] h-[18px] translate-x-[1px]" fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={wave.stopWave}
            className="mq-wave-btn w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)",
              color: "var(--mq-text-muted)",
            }}
            aria-label="Остановить WAVE"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {currentTrack ? (
        <div className="relative px-5 sm:px-7 pb-6 grid gap-6 lg:gap-7 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
          {/* ARTWORK — the dominant object, framed in Liquid Glass,
              with the huge editorial WAVE wordmark breathing behind it. */}
          <div
            className="relative mx-auto w-full max-w-[340px] lg:mx-0 lg:w-[clamp(280px,26vw,400px)] lg:max-w-none"
            style={{ containerType: "inline-size" }}
          >
            <span
              aria-hidden="true"
              className="mq-t-display-xl absolute pointer-events-none select-none"
              style={{
                fontSize: "clamp(96px, 44cqw, 300px)",
                left: "-14%",
                top: "-11%",
                color: "var(--mq-text)",
                opacity: 0.04,
                whiteSpace: "nowrap",
                zIndex: 0,
              }}
            >
              WAVE
            </span>
            <div className="relative" style={{ zIndex: 1 }}>
            <CrossfadeArtwork
              track={currentTrack}
              onOpen={openFullPlayer}
              onSwipeLeft={wave.skipTrack}
            />
            </div>
          </div>

          {/* NOW — identity + transport + progress (desktop: right of the
              artwork, vertically distributed across the artwork height —
              title up top, transport in the flow, progress anchored low) */}
          <div className="min-w-0 flex flex-col lg:min-h-[clamp(280px,26vw,400px)] lg:pt-2 lg:pb-2">
            {/* V2.5 §3: no now-playing status eyebrow — the title IS
                the now; the reason line carries the context. */}
            <div key={trackKey} className="mq-wave-meta-in min-w-0 text-center lg:text-left">
              <h3
                className="font-extrabold leading-[1.12] tracking-[-0.02em] line-clamp-2 text-[clamp(1.35rem,4.6vw,2rem)] lg:text-[clamp(1.6rem,2.4vw,2.25rem)]"
                style={{ color: "var(--mq-text)" }}
              >
                {currentTrack.title}
              </h3>
              <button
                type="button"
                onClick={() => currentTrack.artist && setSelectedArtist({ name: currentTrack.artist })}
                className="mq-t-body text-[clamp(0.95rem,3.4vw,1.15rem)] mt-1.5 inline-flex items-center min-w-0 max-w-full hover:underline underline-offset-4"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <span className="truncate">{currentTrack.artist}</span>
              </button>
              <div className="mt-2.5 flex justify-center lg:justify-start">
                <ReasonLine text={currentReasonText || "Продолжение твоего потока"} />
              </div>
              {debugMode && <DebugChips debug={currentDebug} />}
            </div>

            {/* Breathing room — desktop: the transport sits mid-column */}
            <div className="flex-1 min-h-5" aria-hidden="true" />

            {/* TRANSPORT — correct hierarchy: one filled button, the rest quiet */}
            <div className="mt-4 lg:mt-0 flex items-center justify-center lg:justify-start gap-3" role="group" aria-label="Управление WAVE">
              <button
                type="button"
                onClick={wave.likeTrack}
                disabled={!currentTrack}
                className="mq-wave-btn w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{
                  backgroundColor: liked
                    ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                    : "color-mix(in srgb, var(--mq-text) 8%, transparent)",
                }}
                aria-label={liked ? "Убрать лайк" : "Лайк"}
                aria-pressed={liked}
              >
                <Heart
                  className="w-[22px] h-[22px]"
                  style={{ color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                  fill={liked ? "var(--mq-accent)" : "none"}
                />
              </button>

              {/* V2.5: LIQUID PLATINUM — the primary playback control as
                  the rare premium material (dark silver + cold white specular
                  + blue/violet reflection). */}
              <button
                type="button"
                onClick={() => (isPlaying ? wave.pauseWave() : wave.startWave())}
                disabled={wave.waveLoading}
                className="mq-platinum-btn w-[72px] h-[72px] rounded-full flex items-center justify-center disabled:opacity-70"
                aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
              >
                {wave.waveLoading ? (
                  <span
                    className="mq-spin w-6 h-6 border-2 rounded-full"
                    style={{ borderColor: "currentColor", borderTopColor: "transparent" }}
                    aria-hidden="true"
                  />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7" fill="currentColor" />
                ) : (
                  <Play className="w-7 h-7 translate-x-[2px]" fill="currentColor" />
                )}
              </button>

              <button
                type="button"
                onClick={wave.skipTrack}
                disabled={wave.waveLoading}
                className="mq-wave-btn w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)",
                  color: "var(--mq-text)",
                }}
                aria-label="Пропустить"
              >
                <SkipForward className="w-[22px] h-[22px]" fill="currentColor" />
              </button>

              {/* Secondary interactions — ⋯ menu (Больше/Меньше такого) */}
              <button
                type="button"
                onClick={(e) => setMoreAnchor({ x: e.clientX, y: e.clientY })}
                className="mq-wave-btn w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)",
                  color: "var(--mq-text-muted)",
                }}
                aria-label="Ещё"
                aria-haspopup="menu"
              >
                <MoreHorizontal className="w-[20px] h-[20px]" />
              </button>
            </div>

            {/* PROGRESS — one quiet line (unified audio clock, §27) */}
            <div className="mt-5 lg:mt-7 flex items-center gap-3">
              <span className="mq-t-time tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(progress)}
              </span>
              <div
                className="flex-1 h-[3px] rounded-full overflow-hidden"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 12%, transparent)" }}
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогресс трека"
              >
                <div
                  className="mq-wave-progress-fill h-full"
                  style={{
                    width: `${pct}%`,
                    background: "var(--mq-platinum-progress)",
                  }}
                />
              </div>
              <span className="mq-t-time tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(duration || currentTrack.duration)}
              </span>
            </div>

            {wave.waveError && (
              <p className="mq-t-meta text-xs mt-3 text-center lg:text-left" style={{ color: "#e5484d" }} role="alert">
                {wave.waveError}
              </p>
            )}
          </div>

          {/* UP NEXT — compact visual flow.
              Desktop (lg+): horizontal snap shelf under the main row — reads
              as an endless stream running off-screen. Mobile: vertical list. */}
          <div className="min-w-0 lg:col-span-2 lg:mt-6">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="mq-t-label uppercase tracking-[0.14em]" style={{ color: "var(--mq-text-muted)" }}>
                Дальше в WAVE
              </p>
              <span className="mq-t-num" style={{ color: "var(--mq-text-muted)" }}>
                {wave.waveQueueLength}
              </span>
            </div>

            {wave.nextUpPreview.length === 0 ? (
              <div
                className="rounded-2xl px-4 py-5 text-center"
                style={{ border: "1px dashed var(--mq-border-thin)" }}
              >
                <p className="mq-t-meta" style={{ color: "var(--mq-text-muted)" }}>
                  {wave.waveLoading ? "Подбираем следующие треки…" : "Запас пополняется — продолжайте слушать"}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop shelf */}
                <ul
                  className="hidden lg:flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 [scrollbar-width:thin]"
                  data-testid="wave-next-up"
                >
                  {wave.nextUpPreview.map((item) => (
                    <li key={item.track.id} className="mq-wave-next-row snap-start shrink-0">
                      <NextUpCard item={item} onPlay={() => handlePlayNextUp(item.track)} debugMode={debugMode} />
                    </li>
                  ))}
                </ul>
                {/* Mobile list */}
                <ul className="lg:hidden space-y-1" data-testid="wave-next-up-mobile">
                  {wave.nextUpPreview.map((item) => (
                    <li key={item.track.id} className="mq-wave-next-row">
                      <NextUpRow
                        item={item}
                        onPlay={() => handlePlayNextUp(item.track)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ track: item.track, x: e.clientX, y: e.clientY });
                        }}
                        debugMode={debugMode}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Session stats — honest, real counters */}
            {wave.waveSession && (wave.waveSession.stats.skipped > 0 || wave.waveSession.stats.completed > 0) && (
              <p className="mq-t-meta-2 mt-3" style={{ color: "var(--mq-text-muted)" }}>
                {`Сессия: ${wave.waveSession.stats.started} треков · ${wave.waveSession.stats.completed} дослушано · ${wave.waveSession.stats.skipped} пропущено`}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative px-6 pb-10 pt-6 text-center">
          <div
            className="mq-spin w-8 h-8 border-2 rounded-full mx-auto"
            style={{ borderColor: "var(--mq-accent)", borderTopColor: "transparent" }}
            aria-hidden="true"
          />
          <p className="mq-t-body mt-4" style={{ color: "var(--mq-text-muted)" }}>
            {wave.waveLoading ? "Подбираем музыку для тебя…" : "WAVE остановлена"}
          </p>
          {wave.waveError && (
            <p className="mq-t-meta mt-2" style={{ color: "#e5484d" }} role="alert">
              {wave.waveError}
            </p>
          )}
        </div>
      )}

      {/* ⋯ menu — Больше/Меньше такого (secondary, PART 2) */}
      {moreAnchor && (
        <MenuCore
          anchor={moreAnchor}
          onClose={() => setMoreAnchor(null)}
          elements={moreMenu}
          ariaLabel="Действия WAVE"
        />
      )}

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
