"use client";

/*
 * SpatialFullPlayer — v8 «Новый» Full Player (reference-driven).
 *
 * REFERENCE COMPOSITION (spec, owner-approved):
 *   - immersive full-screen environment built FROM the current artwork
 *     (enlarged cover, strong blur, dark overlay, vignette — never
 *     competing with the center card);
 *   - spatial/depth CAROUSEL: the current track's card is large, in
 *     front (z highest), rounded, glass info strip with title/metadata
 *     INSIDE the card; prev/next cards from the REAL queue sit behind,
 *     partially overlapped by the center card — smaller scale, lower
 *     opacity, more blur, slight rotation (deck-of-cards depth);
 *   - minimal top nav (close / eyebrow / share);
 *   - v9: auxiliary actions (Like / Dislike / More) live in a floating
 *     vertical glass pill BESIDE the carousel (left by default, right via
 *     Settings — one component, position prop, never duplicated);
 *   - v10: side cards get a calm desktop HOVER PREVIEW (slightly larger,
 *     brighter, less blur — "this card is selectable") and a softer
 *     keyboard-focus twin; hover is desktop-only, ~200ms in/out;
 *   - v10: the background environment is drawn through a tiny CANVAS
 *     (cover → 144px canvas, blur baked at tiny resolution, smooth
 *     bilinear upscale). The old full-screen <img filter:blur(72px)>
 *     produced GPU-blur banding — periodic brightness staircases on the
 *     smooth dark gradients (measured: ~96 flat→jump steps per line at
 *     the top of the screen). Baking the blur small and upscaling kills
 *     the artifact at the SOURCE (no masking overlay);
 *   - v10 MOBILE: Spatial mobile is a NORMAL mobile player (big artwork,
 *     identity + like/dislike, progress, transport, secondary row) —
 *     the depth carousel is a desktop composition; Left/Right setting
 *     applies to the desktop rail only;
 *   - separate compact glass control area at the bottom (thin progress /
 *     prev-play-next primary / lyrics-queue-volume secondary — a floating
 *     object, NOT a full-width standard player bar);
 *   - premium calm carousel transition ~500ms (scale/opacity/blur/
 *     position/z all move together; no jumps) on next/prev/queue jump;
 *   - mobile 390×844: normal player layout — center artwork dominant,
 *     thumb-reachable controls, no h-scroll, safe areas.
 *
 * Playback state is the app store's — this component only READS it and
 * calls the same store actions as the Classic players (togglePlay,
 * nextTrack, prevTrack, playTrack, setVolume…). Zero audio logic here.
 *
 * Architecture: the outer component stays MOUNTED forever (it owns the
 * AnimatePresence); the actual screen lives in <SpatialPlayerScreen/>
 * INSIDE the AnimatePresence, so it fully unmounts when the player
 * closes — every overlay (queue/lyrics/menus) and all local state reset
 * naturally on close→reopen (the v72 stale-drawer lesson, structurally).
 *
 * Reduced motion (OS setting, animationsEnabled=false or reduceMotion
 * user setting): spatial transitions collapse to instant swaps; all
 * functionality stays.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart, ThumbsDown,
  Volume2, VolumeX, Volume1, Music, ListMusic, Share2, Mic2,
  MoreHorizontal, Loader2, X, User as UserIcon, ListPlus,
  Copy, Download, Users,
} from "lucide-react";
import { useAppStore, getLastVolume } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";
import { seekPlayback, currentPlaybackPosition, isWasmActive } from "@/lib/wasm-audio";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import VolumeSlider from "@/components/ui/volume-slider";
import { fetchLyrics } from "@/lib/lyrics-client";
import { LyricsView, type LyricLine } from "@/components/mq/LyricsView";
import LiquidTitle from "@/components/mq/LiquidTitle";
import MenuCore, { MenuHeader, type MenuElement } from "@/components/mq/ui/MenuCore";
import { shareTrackUrl, openInAppTrackUrl } from "@/lib/share-urls";

// ═════════════════════════════════════════════════════════════════════════
// GEOMETRY — reference anatomy, fixed as numbers (pure + unit-tested)
// ═════════════════════════════════════════════════════════════════════════

/** Carousel transition — premium calm, within the 450–550ms spec band. */
export const SPATIAL_TRANSITION_MS = 500;
export const SPATIAL_EASE: [number, number, number, number] = [0.25, 0.85, 0.25, 1];
/** How many cards are visible on EACH side of the center (deck depth). */
export const SPATIAL_DEPTH = 2;

export interface SpatialCardGeom {
  /** Horizontal offset as % of card width (mirrored by sign). */
  xPct: number;
  /** Vertical offset as % of card width. */
  yPct: number;
  scale: number;
  opacity: number;
  blurPx: number;
  rotateZDeg: number;
  rotateYDeg: number;
  zIndex: number;
}

// Desktop deck: side cards peek from BEHIND the center card (x < 50% of
// card width keeps the inner edge covered by the center card), receding
// with scale/opacity/blur/rotation per depth step.
const GEOM_DESKTOP: SpatialCardGeom[] = [
  { xPct: 0,   yPct: 0,   scale: 1,    opacity: 1,    blurPx: 0,   rotateZDeg: 0,  rotateYDeg: 0,  zIndex: 30 },
  { xPct: 46,  yPct: 2.5, scale: 0.68, opacity: 0.55, blurPx: 1.5, rotateZDeg: 6,  rotateYDeg: 13, zIndex: 20 },
  { xPct: 92,  yPct: 5,   scale: 0.52, opacity: 0.30, blurPx: 3,   rotateZDeg: 10, rotateYDeg: 21, zIndex: 10 },
];

// Mobile deck: tighter — side cards crop harder behind the center card.
const GEOM_MOBILE: SpatialCardGeom[] = [
  { xPct: 0,   yPct: 0,   scale: 1,    opacity: 1,    blurPx: 0,   rotateZDeg: 0,  rotateYDeg: 0,  zIndex: 30 },
  { xPct: 34,  yPct: 2,   scale: 0.62, opacity: 0.45, blurPx: 2,   rotateZDeg: 5,  rotateYDeg: 11, zIndex: 20 },
  { xPct: 66,  yPct: 4,   scale: 0.50, opacity: 0.24, blurPx: 3,   rotateZDeg: 9,  rotateYDeg: 19, zIndex: 10 },
];

/** Card geometry for a carousel offset (-SPATIAL_DEPTH..+SPATIAL_DEPTH). */
export function spatialCardGeom(offset: number, mobile: boolean): SpatialCardGeom {
  const steps = mobile ? GEOM_MOBILE : GEOM_DESKTOP;
  const a = Math.abs(offset);
  const idx = Math.min(a, steps.length - 1);
  const s = steps[idx];
  const sign = offset < 0 ? -1 : 1;
  return {
    xPct: s.xPct * sign,
    yPct: s.yPct,
    scale: s.scale,
    opacity: s.opacity,
    blurPx: s.blurPx,
    rotateZDeg: s.rotateZDeg * sign,
    rotateYDeg: s.rotateYDeg * sign,
    zIndex: s.zIndex,
  };
}

/** Real neighbouring tracks from the queue (no fake artwork, ever). */
export function spatialQueueWindow(queue: Track[], queueIndex: number): { track: Track; offset: number }[] {
  const out: { track: Track; offset: number }[] = [];
  if (!Array.isArray(queue) || queue.length === 0) return out;
  if (queueIndex < 0 || queueIndex >= queue.length) return out;
  for (let o = -SPATIAL_DEPTH; o <= SPATIAL_DEPTH; o++) {
    const i = queueIndex + o;
    if (i < 0 || i >= queue.length) continue;
    out.push({ track: queue[i], offset: o });
  }
  return out;
}

/** Master motion switch (pure — unit-tested): user animation setting,
 *  user reduce-motion setting, OS prefers-reduced-motion. When false,
 *  spatial transitions collapse (duration 0) but functionality stays. */
export function spatialMotionOn(
  animationsEnabled: boolean,
  reduceMotion: boolean,
  prefersReduced: boolean | null,
): boolean {
  return animationsEnabled && !reduceMotion && !prefersReduced;
}

// ── v10 hover preview geometry (pure — unit-tested) ──

/** Hover preview transition for the side cards — calm, inside the
 *  180–250ms spec band (enter AND leave). */
export const SPATIAL_HOVER_MS = 200;

/** Hover-preview target geometry for a NEIGHBOUR card (desktop only):
 *  a touch larger, noticeably more present (opacity up), less blurred —
 *  "this card is selectable" — while staying a quiet deck member, never
 *  a loud button. Center cards and mobile never get a hover state. */
export function spatialHoverGeom(g: SpatialCardGeom, mobile: boolean): SpatialCardGeom {
  if (mobile) return g;
  return {
    ...g,
    scale: Math.min(0.76, g.scale + 0.055),
    opacity: Math.min(0.82, g.opacity + 0.22),
    blurPx: Math.max(0.5, g.blurPx - 1.0),
  };
}

/** Keyboard-focus twin of the hover preview — same language, one notch
 *  quieter (a focused card is “pointed at”, not “picked up”). */
export function spatialFocusGeom(g: SpatialCardGeom, mobile: boolean): SpatialCardGeom {
  if (mobile) return g;
  return {
    ...g,
    scale: Math.min(0.74, g.scale + 0.035),
    opacity: Math.min(0.76, g.opacity + 0.14),
    blurPx: Math.max(0.7, g.blurPx - 0.8),
  };
}

// ── v9 action rail geometry (pure — unit-tested) ──

/** Width of the desktop vertical action rail (44px target + 2×6 padding). */
export const SPATIAL_RAIL_W = 56;

/** Horizontal placement (px from the stage's left edge) of the DESKTOP
 *  vertical action rail. It floats just outside the outermost visible
 *  side card — within the player composition, never pinned blindly to the
 *  viewport: on narrow desktops the value clamps to a safe inset so the
 *  rail can never leave the screen or cause horizontal overflow. */
export function spatialRailLeft(
  cardW: number,
  stageW: number,
  position: "left" | "right",
): number {
  // outermost visible card extent from the deck centre
  let outer = 0;
  for (let o = 1; o <= SPATIAL_DEPTH; o++) {
    const g = spatialCardGeom(o, false);
    outer = Math.max(outer, (g.xPct / 100) * cardW + (g.scale * cardW) / 2);
  }
  outer += 16; // breathing room between rail and outermost card
  const half = stageW / 2;
  const minInset = 10;
  if (position === "left") {
    const ideal = Math.round(half - outer - SPATIAL_RAIL_W);
    return Math.max(minInset, Math.min(half - SPATIAL_RAIL_W - 12, ideal));
  }
  const idealR = Math.round(half + outer);
  return Math.min(stageW - minInset - SPATIAL_RAIL_W, Math.max(half + 12, idealR));
}

/** Mount/unmount position — slightly deeper than the outermost step, so
 *  cards entering/leaving the ±DEPTH window flow in/out of the depth
 *  instead of popping. */
function deeperThan(g: SpatialCardGeom): SpatialCardGeom {
  return { ...g, xPct: g.xPct * 1.18, scale: g.scale * 0.92, opacity: 0, blurPx: g.blurPx + 1.5 };
}

// ═════════════════════════════════════════════════════════════════════════
// OUTER COMPONENT — persistent shell + AnimatePresence gate
// ═════════════════════════════════════════════════════════════════════════

export default function SpatialFullPlayer() {
  const isOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const prefersReduced = useReducedMotion();
  const motionOn = spatialMotionOn(animationsEnabled, reduceMotion, prefersReduced);

  return (
    <SpatialStyles>
      <AnimatePresence>
        {isOpen && currentTrack && (
          <SpatialPlayerScreen key="spatial-root" motionOn={motionOn} />
        )}
      </AnimatePresence>
    </SpatialStyles>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SCREEN — mounted only while the player is open (fresh state per open)
// ═════════════════════════════════════════════════════════════════════════

function SpatialPlayerScreen({ motionOn }: { motionOn: boolean }) {
  // ── Store bindings (same single playback state as Classic) ──
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const volume = useAppStore((s) => s.volume);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const spatialActionsPosition = useAppStore((s) => s.spatialActionsPosition);
  const playbackState = useAppStore((s) => s.playbackState);
  const radioMode = useAppStore((s) => s.radioMode);
  const playlists = useAppStore((s) => s.playlists);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);

  const setOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const playTrack = useAppStore((s) => s.playTrack);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const openShareSheet = useAppStore((s) => s.openShareSheet);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);

  const isMobile = useIsMobile();

  // ── Overlay state (panels) — reset naturally by unmount on close ──
  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  // v10.2 GAP#1 fix: the volume popup's fixed inset-0 close-overlay is
  // INSIDE the glass control panel, and the panel's backdrop-filter makes
  // it the containing block for fixed descendants — so the overlay only
  // covered the panel itself. Clicks on the artwork / main stage (outside
  // the panel) never reached it and the popup stayed open (reproduced in
  // the V10.2 production audit). A capture-phase document pointerdown
  // closes it regardless of stacking contexts; clicks on the popup or the
  // volume button (both inside the wrapper ref) are excluded.
  const volumeWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showVolume) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && volumeWrapRef.current?.contains(t)) return;
      setShowVolume(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [showVolume]);

  // ── Lyrics: derived-key pattern (NO sync setState in effect — the
  //    "stale vs current" question is answered at render time; the effect
  //    only writes async fetch results). ──
  const [lyricsKey, setLyricsKey] = useState(0);
  const [lyricsData, setLyricsData] = useState<{
    key: string; lines: LyricLine[]; plain: string; error: string | null;
  }>({ key: "", lines: [], plain: "", error: null });
  const currentLyricsKey = `${currentTrack?.id ?? ""}#${lyricsKey}`;
  const lyricsForTrack = lyricsData.key === currentLyricsKey
    ? lyricsData
    : { key: currentLyricsKey, lines: [] as LyricLine[], plain: "", error: null };
  const lyricsLoading = lyricsOpen && lyricsData.key !== currentLyricsKey;

  useEffect(() => {
    if (!lyricsOpen || !currentTrack) return;
    let cancelled = false;
    fetchLyrics(currentTrack.artist, currentTrack.title)
      .then((result) => {
        if (cancelled) return;
        setLyricsData({
          key: currentLyricsKey,
          lines: result?.lyrics ?? [],
          plain: result?.plainText ?? "",
          error: !result || (result.lyrics.length === 0 && !result.plainText)
            ? "Текст не найден"
            : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLyricsData({ key: currentLyricsKey, lines: [], plain: "", error: "Не удалось загрузить текст" });
        }
      });
    return () => { cancelled = true; };
  }, [lyricsOpen, currentTrack, currentLyricsKey]);

  // LyricsView retry button → bump the key → re-fetch
  useEffect(() => {
    const onRetry = () => setLyricsKey((k) => k + 1);
    window.addEventListener("mq-lyrics-retry", onRetry);
    return () => window.removeEventListener("mq-lyrics-retry", onRetry);
  }, []);

  // ── Viewport → card size (numeric px; artwork stays a true square) ──
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const stripH = 88;
  const cardW = useMemo(() => {
    const w = Math.max(280, Math.min(vp.w, vp.h * 1.2));
    if (isMobile) {
      // v10 normal mobile composition (no deck strip): big square artwork
      // that still leaves room for identity + like/dislike, progress and
      // the glass control panel on short phones.
      return Math.round(Math.min(w * 0.86, vp.h * 0.52));
    }
    return Math.round(Math.min(w * 0.4, vp.h * 0.48, 480));
  }, [vp, isMobile]);

  // ── Carousel window (real queue neighbours; fallback = solo card) ──
  const cards = useMemo(() => {
    const win = spatialQueueWindow(queue, queueIndex);
    if (win.length === 0 && currentTrack) return [{ track: currentTrack, offset: 0 }];
    return win;
  }, [queue, queueIndex, currentTrack]);

  // ── Seek: visual-only during drag, commit on release (WASM-aware) ──
  const seekInputRef = useRef<HTMLInputElement>(null);
  const timeCurrentRef = useRef<HTMLSpanElement>(null);
  const timeRemainingRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);
  const durationRef = useRef(duration);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  useEffect(() => {
    let rafId = 0;
    let lastSecond = -1;
    let lastTrackId: string | null = null;
    const tick = () => {
      if (!isDraggingRef.current) {
        const pos = currentPlaybackPosition();
        const dur = durationRef.current || 0;
        const tid = useAppStore.getState().currentTrack?.id ?? null;
        if (tid !== lastTrackId) { lastTrackId = tid; lastSecond = -1; }
        if (isFinite(pos) && pos >= 0) {
          const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
          if (seekInputRef.current && document.activeElement !== seekInputRef.current) {
            seekInputRef.current.value = String(pct);
            seekInputRef.current.style.setProperty("--mq-seek-pct", `${pct}%`);
          }
          const sec = Math.floor(pos);
          if (sec !== lastSecond && timeCurrentRef.current) {
            lastSecond = sec;
            timeCurrentRef.current.textContent = formatDuration(sec);
            if (timeRemainingRef.current) {
              timeRemainingRef.current.textContent = dur > 0
                ? "−" + formatDuration(Math.max(0, dur - sec))
                : "—";
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    isDraggingRef.current = true;
    e.target.style.setProperty("--mq-seek-pct", `${v}%`);
  }, []);

  const commitSeek = useCallback((e: React.PointerEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    const v = Number(e.currentTarget.value);
    isDraggingRef.current = false;
    e.currentTarget.style.setProperty("--mq-seek-pct", `${v}%`);
    const audio = getAudioElement();
    const dur = audio?.duration && isFinite(audio.duration) ? audio.duration : (durationRef.current || 0);
    if (dur > 0) {
      seekPlayback((v / 100) * dur);
      setProgress((v / 100) * dur);
    }
  }, [setProgress]);

  const seekToTime = useCallback((time: number) => {
    seekPlayback(time);
    setProgress(time);
  }, [setProgress]);

  // ── Volume wheel (desktop, not over scrollable panels) ──
  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.closest('[data-scrollable="true"]')) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -4 : 4;
    const v = useAppStore.getState().volume;
    useAppStore.getState().setVolume(Math.max(0, Math.min(100, v + delta)));
  }, []);
  useEffect(() => {
    if (isMobile) return;
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [isMobile, handleWheel]);

  // ── Actions ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  const handleLike = useCallback(() => {
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  // Same semantics as Classic: the store itself skips to the next track
  // when the disliked track is the one playing (established behaviour).
  const handleDislike = useCallback(() => {
    if (currentTrack) toggleDislike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleDislike]);

  const handleShare = useCallback(() => {
    if (!currentTrack) return;
    openShareSheet({
      url: shareTrackUrl(currentTrack),
      title: currentTrack.title,
      subtitle: currentTrack.artist,
      cover: currentTrack.cover,
      openInAppUrl: openInAppTrackUrl(currentTrack) || undefined,
    });
  }, [currentTrack, openShareSheet]);

  const handleArtist = useCallback(() => {
    if (currentTrack?.artist) {
      setSelectedArtist({ name: currentTrack.artist });
      setOpen(false);
    }
  }, [currentTrack, setSelectedArtist, setOpen]);

  const handleAddToPlaylist = useCallback((playlistId: string) => {
    if (!currentTrack) return;
    addToPlaylist(playlistId, currentTrack);
    setShowPlaylistPicker(false);
    toast({ title: "Добавлено в плейлист" });
  }, [currentTrack, addToPlaylist]);

  // ── v10 More actions — the SAME actions that already exist in Classic
  //    FullTrackView's menu and the unified ContextMenu (audit §3): copy
  //    name / download / add-to-queue / artist subscription. No new
  //    behaviour invented here — same store actions, same semantics. ──

  const handleCopyName = useCallback(() => {
    if (!currentTrack) return;
    try {
      navigator.clipboard
        ?.writeText(`${currentTrack.title} — ${currentTrack.artist}`)
        ?.catch(() => {});
    } catch {
      /* clipboard unavailable (non-secure context) — toast still shows */
    }
    toast({ title: "Название скопировано" });
  }, [currentTrack]);

  const handleDownload = useCallback(async () => {
    const audio = getAudioElement();
    if (!currentTrack || !audio || !audio.src) return;
    const name = `${currentTrack.artist} - ${currentTrack.title}.mp3`;
    try {
      const res = await fetch(audio.src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement("a");
      a.href = audio.src;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [currentTrack]);

  // Same insertion semantics as the unified ContextMenu: right after the
  // currently playing track.
  const handleAddToQueue = useCallback(() => {
    if (!currentTrack) return;
    const state = useAppStore.getState();
    const newQueue = [...state.queue];
    const at = state.queueIndex + 1;
    if (newQueue.some((t, i) => i >= at && t.id === currentTrack.id)) {
      // already queued next — don't stack duplicates
      const dup = newQueue.findIndex((t, i) => i >= at && t.id === currentTrack.id);
      if (dup === at) { toast({ title: "Уже следующий в очереди" }); return; }
    }
    newQueue.splice(at, 0, currentTrack);
    useAppStore.setState({ queue: newQueue });
    toast({ title: "Добавлено в очередь" });
  }, [currentTrack]);

  const isSubscribed = currentTrack
    ? favoriteArtists.some((a) => a.username.toLowerCase() === currentTrack.artist.toLowerCase())
    : false;

  const handleToggleSubscribe = useCallback(() => {
    if (!currentTrack) return;
    if (isSubscribed) {
      const fav = favoriteArtists.find(
        (a) => a.username.toLowerCase() === currentTrack.artist.toLowerCase()
      );
      if (fav) removeFavoriteArtist(fav.id);
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: currentTrack.artist,
        avatar: currentTrack.cover || "",
        genre: currentTrack.genre || "",
        followers: 0,
        trackCount: 0,
      });
    }
  }, [currentTrack, isSubscribed, favoriteArtists, addFavoriteArtist, removeFavoriteArtist]);

  // ── Swipe (carousel stage): horizontal = prev/next, down = close ──
  const swipe = useRef({ x: 0, y: 0, t: 0 });
  const onStageTouchStart = useCallback((e: React.TouchEvent) => {
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);
  const onStageTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipe.current.x;
    const dy = e.changedTouches[0].clientY - swipe.current.y;
    const dt = Date.now() - swipe.current.t;
    if (dy > 80 && dy > Math.abs(dx) * 1.5 && dt < 600) { setOpen(false); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) {
      if (dx < 0) nextTrack(); else prevTrack();
    }
  }, [setOpen, nextTrack, prevTrack]);

  // ── Keyboard shortcuts (mirrors Classic where applicable) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // v10.3 fix: Escape BEFORE the input guard — after the user clicks the
      // volume popup slider (range input keeps focus), Escape was swallowed
      // by the guard and the volume popup never closed.
      if (e.key === "Escape") {
        e.preventDefault();
        // Layered dismissal: overlays close first, player second.
        if (showPlaylistPicker) setShowPlaylistPicker(false);
        else if (moreMenu) setMoreMenu(null);
        else if (showVolume) setShowVolume(false);
        else if (lyricsOpen) setLyricsOpen(false);
        else if (queueOpen) setQueueOpen(false);
        else setOpen(false);
        return;
      }
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      switch (e.code) {
        case "Space":
          e.preventDefault(); togglePlay(); break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) nextTrack();
          else if (getAudioElement()?.src || isWasmActive()) {
            const t = Math.min(duration, currentPlaybackPosition() + 5);
            seekPlayback(t); setProgress(t);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) prevTrack();
          else if (getAudioElement()?.src || isWasmActive()) {
            const t = Math.max(0, currentPlaybackPosition() - 5);
            seekPlayback(t); setProgress(t);
          }
          break;
        case "ArrowUp":
          e.preventDefault(); setVolume(Math.min(100, useAppStore.getState().volume + 5)); break;
        case "ArrowDown":
          e.preventDefault(); setVolume(Math.max(0, useAppStore.getState().volume - 5)); break;
        case "KeyM":
          e.preventDefault();
          // v10.3: unmute restores the last audible level (was hardcoded 70)
          { const v = useAppStore.getState().volume; setVolume(v > 0 ? 0 : getLastVolume()); } break;
        case "KeyL":
          e.preventDefault(); handleLike(); break;
        case "KeyN":
          e.preventDefault(); nextTrack(); break;
        case "KeyP":
          e.preventDefault(); prevTrack(); break;
        case "KeyF":
          e.preventDefault(); setLyricsOpen(o => !o); break;
        case "KeyQ":
          e.preventDefault(); setQueueOpen(o => !o); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nextTrack, prevTrack, setProgress, setVolume, handleLike, setOpen, duration, lyricsOpen, queueOpen, showVolume, moreMenu, showPlaylistPicker]);

  if (!currentTrack) return null;

  // v10 — ONE More menu, same action set as Classic FullTrackView's menu
  // + the unified ContextMenu (audit §3). Order mirrors Classic where the
  // sections overlap (Трек → Поделиться / Копировать название / Скачать).
  // Like/Dislike/Lyrics/Queue live directly on screen (rail / control
  // bar / identity row) and are NOT duplicated here.
  const moreElements: MenuElement[] = [
    { type: "label", text: "Трек" },
    { type: "item", id: "share", icon: Share2, label: "Поделиться", onSelect: handleShare },
    { type: "item", id: "copy", icon: Copy, label: "Копировать название", onSelect: handleCopyName },
    { type: "item", id: "download", icon: Download, label: "Скачать", onSelect: () => { void handleDownload(); } },
    { type: "separator" },
    { type: "item", id: "artist", icon: UserIcon, label: "К исполнителю", onSelect: handleArtist },
    {
      type: "item",
      id: "subscribe",
      icon: Users,
      label: isSubscribed ? "Отписаться от артиста" : "Подписаться на артиста",
      active: isSubscribed,
      onSelect: handleToggleSubscribe,
    },
    { type: "separator" },
    { type: "item", id: "add-queue", icon: ListPlus, label: "Добавить в очередь", onSelect: handleAddToQueue },
    { type: "item", id: "playlist", icon: ListMusic, label: "Добавить в плейлист", onSelect: () => setShowPlaylistPicker(true) },
  ];

  const progressFraction = duration > 0 ? Math.min(1, progress / duration) : 0;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={motionOn ? { type: "spring", stiffness: 300, damping: 32 } : { duration: 0.15 }}
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ background: "#050508" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Полноэкранный плеер: ${currentTrack.title} - ${currentTrack.artist}`}
      data-mq-spatial="root"
    >
      {/* ═══ BACKGROUND — environment built from the artwork.
          v10: drawn through a TINY CANVAS (cover → 144px, blur baked at
          that resolution, smooth bilinear upscale via CSS). The previous
          full-screen <img filter:blur(72px)> produced GPU-blur banding —
          periodic brightness staircases on smooth dark gradients — because
          the compositor renders large blurs at reduced resolution. Baking
          the blur small removes the artifact at the source (this is the
          fix, not a masking overlay). ═══ */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence>
            <motion.div
              key={currentTrack.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionOn ? 0.9 : 0 }}
            >
              <SpatialBackdrop src={currentTrack.cover || ""} />
            </motion.div>
          </AnimatePresence>
        </div>
        {/* dark overlay — the environment must never compete with the card */}
        <div className="absolute inset-0" style={{ background: "rgba(6, 6, 10, 0.55)" }} />
        {/* vignette — physical space, foreground/background separation */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(118% 92% at 50% 42%, transparent 36%, rgba(0,0,0,0.62) 100%)" }} />
        {/* readability gradients for top nav + bottom controls */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, transparent 20%), linear-gradient(0deg, rgba(0,0,0,0.48) 0%, transparent 26%)" }} />
      </div>

      <div className="relative z-10 h-full flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* ═══ TOP NAV — minimal (mobile: More instead of Share — share
            lives in the menu, the ⋯ target is the primary overflow) ═══ */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-2 flex-shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="w-11 h-11 rounded-full flex items-center justify-center mq-icon-btn mq-press"
            aria-label="Закрыть"
          >
            <ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} />
          </button>
          <div className="text-center min-w-0 px-2">
            <p className="mq-text-eyebrow mq-t-meta-2 uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
              {radioMode ? "Волна" : isLoading ? "Загрузка" : isPlaying ? "Играет" : "Пауза"}
            </p>
            <p className="text-xs font-medium truncate max-w-[180px] sm:max-w-xs" style={{ color: "color-mix(in srgb, var(--mq-text-muted) 72%, transparent)" }}>
              {currentTrack.album || currentTrack.artist}
            </p>
          </div>
          {isMobile ? (
            <button
              onClick={(e) => setMoreMenu({ x: e.clientX, y: e.clientY })}
              className="w-11 h-11 rounded-full flex items-center justify-center mq-icon-btn mq-press"
              aria-label="Ещё"
            >
              <MoreHorizontal className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
            </button>
          ) : (
            <button
              onClick={handleShare}
              className="w-11 h-11 rounded-full flex items-center justify-center mq-icon-btn mq-press"
              aria-label="Поделиться"
            >
              <Share2 className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
            </button>
          )}
        </header>

        {/* ═══ DESKTOP — SPATIAL CAROUSEL (depth deck + hover preview) ═══ */}
        {!isMobile && (
          <main
            className="relative flex-1 min-h-0 flex items-center justify-center px-4"
            style={{ perspective: "1400px" }}
            data-mq-spatial="stage"
          >
            <div
              className="relative"
              style={{ width: cardW, height: cardW + stripH }}
              data-mq-spatial="deck"
            >
              <AnimatePresence>
                {cards.map(({ track, offset }) => {
                  // Stable identity per physical queue slot: a card keeps
                  // its key while its OFFSET changes → framer animates the
                  // deck smoothly instead of remounting every card.
                  const absPos = queueIndex + offset;
                  return (
                    <SpatialCard
                      key={`${track.id}@${absPos}`}
                      track={track}
                      offset={offset}
                      cardW={cardW}
                      stripH={stripH}
                      motionOn={motionOn}
                      isPlaying={isPlaying}
                      progressFraction={progressFraction}
                      onCenterPlayPause={() => togglePlay()}
                      onSidePlay={(t) => playTrack(t, queue)}
                    />
                  );
                })}
              </AnimatePresence>
            </div>

            {/* v9 — floating action rail (desktop): vertical glass pill
                (Like / Dislike / More) beside the carousel, vertically
                centred on the composition; side comes from the user
                setting; clamped so it can never leave the stage. */}
            <div
              className="absolute"
              style={{
                top: "50%",
                left: spatialRailLeft(cardW, vp.w, spatialActionsPosition),
                transform: "translateY(-50%)",
                zIndex: 40,
              }}
              aria-hidden={false}
            >
              <SpatialActionRail
                position={spatialActionsPosition}
                orientation="vertical"
                isLiked={isLiked}
                isDisliked={isDisliked}
                onLike={() => handleLike()}
                onDislike={() => handleDislike()}
                onMore={(e) => setMoreMenu({ x: e.clientX, y: e.clientY })}
              />
            </div>
          </main>
        )}

        {/* ═══ MOBILE — NORMAL PLAYER COMPOSITION (v10).
            Not a shrunken desktop carousel: a proper mobile music player —
            big centered artwork (swipeable), identity + Like/Dislike under
            it, then progress and the glass control panel in the footer.
            The Left/Right rail setting is desktop-only and intentionally
            has no effect here. ═══ */}
        {isMobile && (
          <main
            className="relative flex-1 min-h-0 flex flex-col px-4"
            onTouchStart={onStageTouchStart}
            onTouchEnd={onStageTouchEnd}
            data-mq-spatial="mobile-stage"
          >
            {/* artwork — the hero of the screen; sits CLOSE to the
                identity row (native mobile anatomy — free space pools
                above, never between artwork and its metadata) */}
            <div className="flex-1 min-h-0 flex items-end justify-center" style={{ paddingBottom: 18 }}>
              <div
                data-mq-spatial="mobile-artwork"
                className="relative overflow-hidden flex-shrink-0"
                style={{
                  width: cardW,
                  height: cardW,
                  borderRadius: 24,
                  boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)",
                }}
              >
                <AnimatePresence>
                  <motion.div
                    key={currentTrack.id}
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: motionOn ? 0.35 : 0, ease: SPATIAL_EASE }}
                  >
                    {currentTrack.cover ? (
                      <img
                        src={currentTrack.cover}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="eager"
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 55%, #000))" }}>
                        <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.7)" }} />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* identity + Like / Dislike (44px targets) */}
            <div className="flex items-end justify-between gap-1 flex-shrink-0" style={{ paddingBottom: 12 }} data-mq-spatial="mobile-identity">
              <div className="min-w-0 flex-1">
                <LiquidTitle
                  text={currentTrack.title}
                  swapKey={currentTrack.id}
                  playing={isPlaying}
                  progressFraction={progressFraction}
                  motionEnabled={motionOn}
                  className="mq-text-display font-bold text-[21px] leading-tight tracking-[-0.01em]"
                />
                <button
                  type="button"
                  onClick={handleArtist}
                  className="text-[14px] mt-0.5 truncate max-w-full text-left flex items-center"
                  style={{ color: "var(--mq-text-muted)", padding: 0, border: "none", background: "transparent", font: "inherit", cursor: "pointer", minHeight: 44 }}
                >
                  {currentTrack.artist}
                  {currentTrack.album ? ` · ${currentTrack.album}` : ""}
                </button>
              </div>
              <SpIconButton
                onClick={() => handleLike()}
                label={isLiked ? "Убрать из избранного" : "Нравится"}
                pressed={isLiked}
              >
                <Heart
                  className="w-[21px] h-[21px]"
                  style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                  fill={isLiked ? "currentColor" : "none"}
                />
              </SpIconButton>
              <SpIconButton
                onClick={() => handleDislike()}
                label={isDisliked ? "Убрать отметку «Не нравится»" : "Не нравится"}
                pressed={isDisliked}
              >
                <ThumbsDown
                  className="w-[19px] h-[19px]"
                  style={{
                    color: isDisliked ? "var(--mq-error, #ef4444)" : "var(--mq-text-muted)",
                    ...(isDisliked ? { fill: "currentColor" } : {}),
                  }}
                />
              </SpIconButton>
            </div>
          </main>
        )}

        {/* ═══ BOTTOM — compact floating glass control bar. Desktop: the
            reference-like 3-row stack inside the glass panel. Mobile: a
            normal player arrangement — full-width progress + times ABOVE
            the panel, then the glass panel with transport + secondary.
            Like/Dislike live in the rail (desktop) / identity row
            (mobile), NOT here. ═══ */}
        <footer
          className="relative z-20 flex-shrink-0 px-3 sm:px-4"
          style={{ paddingTop: 2, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          data-mq-spatial="controls"
        >
          {/* mobile — progress ABOVE the panel (normal mobile player anatomy) */}
          {isMobile && (
            <div className="flex items-center gap-2.5 mx-auto w-full" style={{ maxWidth: 400, paddingBottom: 10 }}>
              <span ref={timeCurrentRef} className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--mq-text-muted)", minWidth: 36, textAlign: "left" }}>0:00</span>
              <input
                ref={seekInputRef}
                type="range"
                min={0}
                max={100}
                step={0.05}
                defaultValue={0}
                onChange={handleSeekChange}
                onPointerUp={commitSeek}
                onKeyUp={commitSeek}
                aria-label="Позиция воспроизведения"
                className="mq-sp-seek flex-1 min-w-0"
              />
              <span ref={timeRemainingRef} className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--mq-text-muted)", minWidth: 36, textAlign: "right" }}>−0:00</span>
            </div>
          )}
          <div
            className="mx-auto w-full rounded-[28px]"
            style={{
              maxWidth: isMobile ? 340 : 400,
              backgroundColor: "rgba(12, 12, 17, 0.45)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
              padding: isMobile ? "6px 10px 4px" : "8px 14px 6px",
            }}
          >
            {/* row 1 — progress / track time: DESKTOP only (mobile moved it
                above the panel); thin, minimal, integrated */}
            {!isMobile && (
              <div className="flex items-center gap-2.5">
                <span ref={timeCurrentRef} className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--mq-text-muted)", minWidth: 36, textAlign: "left" }}>0:00</span>
                <input
                  ref={seekInputRef}
                  type="range"
                  min={0}
                  max={100}
                  step={0.05}
                  defaultValue={0}
                  onChange={handleSeekChange}
                  onPointerUp={commitSeek}
                  onKeyUp={commitSeek}
                  aria-label="Позиция воспроизведения"
                  className="mq-sp-seek flex-1 min-w-0"
                />
                <span ref={timeRemainingRef} className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--mq-text-muted)", minWidth: 36, textAlign: "right" }}>−0:00</span>
              </div>
            )}

            {/* row 2 — primary transport: prev · play/pause · next */}
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              <SpIconButton onClick={() => prevTrack()} label="Предыдущий трек">
                <SkipBack className="w-[22px] h-[22px]" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
              </SpIconButton>
              <button
                onClick={() => togglePlay()}
                aria-label={isPlaying ? "Пауза" : "Играть"}
                className="mq-icon-btn mq-press flex items-center justify-center"
                style={{
                  width: isMobile ? 50 : 54,
                  height: isMobile ? 50 : 54,
                  borderRadius: "9999px",
                  backgroundColor: "var(--mq-accent)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  boxShadow: "0 10px 26px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                }}
              >
                {isLoading
                  ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                  : (
                    <span key={isPlaying ? "pause" : "play"} className="mq-icon-swap flex items-center justify-center">
                      {isPlaying
                        ? <Pause className="w-6 h-6" style={{ color: "var(--mq-text-on-accent, #fff)" }} fill="currentColor" />
                        : <Play className="w-6 h-6 translate-x-[1px]" style={{ color: "var(--mq-text-on-accent, #fff)" }} fill="currentColor" />}
                    </span>
                  )}
              </button>
              <SpIconButton onClick={() => nextTrack()} label="Следующий трек">
                <SkipForward className="w-[22px] h-[22px]" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
              </SpIconButton>
            </div>

            {/* row 3 — secondary controls: subtle, small, quiet icons */}
            <div className="flex items-center justify-center gap-0.5">
              <SpIconButton
                onClick={() => { setLyricsOpen(true); setQueueOpen(false); }}
                label="Текст песни"
              >
                <Mic2 className="w-[19px] h-[19px]" style={{ color: lyricsOpen ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              </SpIconButton>
              <SpIconButton
                onClick={() => { setQueueOpen(true); setLyricsOpen(false); }}
                label="Очередь"
              >
                <ListMusic className="w-[19px] h-[19px]" style={{ color: queueOpen ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              </SpIconButton>
              <div className="relative" ref={volumeWrapRef}>
                  <SpIconButton
                    onClick={() => setShowVolume(o => !o)}
                    label={`Громкость: ${Math.round(volume)}%`}
                    expanded={showVolume}
                  >
                    <VolumeIcon className="w-[19px] h-[19px]" style={{ color: "var(--mq-text-muted)" }} />
                  </SpIconButton>
                  <AnimatePresence>
                    {showVolume && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowVolume(false)} aria-hidden="true" />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.18 }}
                          className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 z-40 rounded-2xl p-3 w-[200px]"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--mq-surface-1) 82%, transparent)",
                            backdropFilter: "var(--mq-blur-md)",
                            WebkitBackdropFilter: "var(--mq-blur-md)",
                            border: "1px solid var(--mq-edge-strong)",
                            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                          }}
                          role="group"
                          aria-label="Громкость"
                        >
                          <VolumeSlider volume={volume} onChange={setVolume} showValue className="w-full" />
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* ═══ QUEUE DRAWER — desktop: right slide-in / mobile: bottom sheet ═══ */}
      <AnimatePresence>
        {queueOpen && (
          <>
            <motion.div
              key="sp-queue-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-30"
              style={{ background: "rgba(4,4,8,0.45)", backdropFilter: "blur(3px)" }}
              onClick={() => setQueueOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="sp-queue"
              initial={isMobile ? { y: "100%" } : { x: 380, opacity: 0.6 }}
              animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { x: 380, opacity: 0.6 }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className={
                isMobile
                  ? "absolute inset-x-0 bottom-0 z-40 max-h-[74%] flex flex-col"
                  : "absolute inset-y-0 right-0 z-40 w-[340px] flex flex-col py-3 pr-3"
              }
              role="complementary"
              aria-label="Очередь воспроизведения"
              data-mq-spatial="queue"
            >
              <div
                className={isMobile ? "flex-1 min-h-0 flex flex-col rounded-t-[24px] overflow-hidden" : "flex-1 min-h-0 flex flex-col rounded-[20px] overflow-hidden"}
                style={{
                  backgroundColor: "rgba(14, 14, 19, 0.88)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Очередь · {queue.length}
                  </p>
                  <button onClick={() => setQueueOpen(false)} aria-label="Закрыть очередь" className="mq-icon-btn mq-press w-11 h-11 rounded-full flex items-center justify-center">
                    <X className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto" data-scrollable="true">
                  {queue.map((t, i) => {
                    const isCurrent = i === queueIndex;
                    return (
                      <button
                        key={`${t.id}-${i}`}
                        onClick={() => { playTrack(t, queue); setQueueOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left"
                        style={{
                          background: isCurrent ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "transparent",
                          transition: "background 0.15s ease",
                        }}
                        aria-label={`Играть: ${t.title} — ${t.artist}`}
                        aria-current={isCurrent ? "true" : undefined}
                      >
                        <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 relative" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                          {t.cover
                            ? <img src={t.cover} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
                            : <Music className="absolute inset-0 m-auto w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>{t.title}</p>
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p>
                        </div>
                        {isCurrent && isPlaying && (
                          <span className="flex items-end gap-[2px] h-4 flex-shrink-0" aria-hidden="true">
                            <span className="mq-sp-bar w-[3px] rounded-full" style={{ background: "var(--mq-accent)", height: "60%", animation: "mqSpBar 1s ease-in-out infinite" }} />
                            <span className="mq-sp-bar w-[3px] rounded-full" style={{ background: "var(--mq-accent)", height: "100%", animation: "mqSpBar 1s ease-in-out 0.25s infinite" }} />
                            <span className="mq-sp-bar w-[3px] rounded-full" style={{ background: "var(--mq-accent)", height: "40%", animation: "mqSpBar 1s ease-in-out 0.5s infinite" }} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ═══ LYRICS OVERLAY ═══ */}
      <AnimatePresence>
        {lyricsOpen && (
          <motion.div
            key="sp-lyrics"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 z-40 flex flex-col"
            style={{ background: "rgba(5,5,9,0.88)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)" }}
            role="complementary"
            aria-label="Текст песни"
            data-mq-spatial="lyrics"
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-2 flex-shrink-0" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate max-w-[240px] sm:max-w-md" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                <p className="text-xs truncate max-w-[240px] sm:max-w-md" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
              </div>
              <button onClick={() => setLyricsOpen(false)} aria-label="Закрыть текст песни" className="mq-icon-btn mq-press w-11 h-11 rounded-full flex items-center justify-center">
                <X className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto" data-scrollable="true">
              <div className="max-w-[760px] mx-auto w-full px-4 sm:px-6 py-4">
                <LyricsView
                  lines={lyricsForTrack.lines}
                  plainText={lyricsForTrack.plain}
                  currentTime={progress}
                  isLoading={lyricsLoading}
                  error={lyricsForTrack.error}
                  onSeek={seekToTime}
                  cover={currentTrack.cover || undefined}
                  duration={duration}
                  variant="full"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MORE MENU (MenuCore portal) — v10: header with track art +
          the full audited action set (same handlers as Classic) ═══ */}
      {moreMenu && (
        <MenuCore
          anchor={moreMenu}
          onClose={() => setMoreMenu(null)}
          elements={moreElements}
          width={280}
          ariaLabel="Действия с треком"
          side="above"
          header={
            <MenuHeader
              cover={currentTrack.cover}
              title={currentTrack.title}
              subtitle={currentTrack.artist}
              fallbackIcon={Music}
            />
          }
        />
      )}

      {/* ═══ PLAYLIST PICKER ═══ */}
      <AnimatePresence>
        {showPlaylistPicker && (
          <motion.div
            key="sp-picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-40 flex items-center justify-center p-6"
            style={{ background: "rgba(4,4,8,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowPlaylistPicker(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Добавить в плейлист"
            data-mq-spatial="picker"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-[380px] max-h-[60%] flex flex-col rounded-[20px] overflow-hidden"
              style={{
                backgroundColor: "var(--mq-surface-1)",
                border: "1px solid var(--mq-edge)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--mq-border-thin)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Добавить в плейлист</p>
                <button onClick={() => setShowPlaylistPicker(false)} aria-label="Закрыть" className="mq-icon-btn mq-press w-11 h-11 rounded-full flex items-center justify-center">
                  <X className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" data-scrollable="true">
                {playlists.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--mq-text-muted)" }}>Нет плейлистов</p>
                ) : playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddToPlaylist(p.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    aria-label={`Добавить в ${p.name}`}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                      {p.tracks[0]?.cover
                        ? <img src={p.tracks[0].cover} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
                        : <Music className="absolute inset-0 m-auto w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--mq-text)" }}>{p.name}</p>
                      <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{p.tracks.length} треков</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SHARED BITS
// ═════════════════════════════════════════════════════════════════════════

/** v10 — BACKGROUND environment from the artwork, drawn through a tiny
 *  canvas so the blur is baked at SMALL resolution and upscaled with the
 *  browser's smooth bilinear filtering. This removes GPU-blur banding
 *  (periodic brightness staircases) that a full-screen
 *  <img filter:blur(72px)> produced on smooth dark gradients — the
 *  compositor renders huge blurs at reduced internal resolution. The
 *  canvas is opaque; failure (no ctx / broken image) just leaves the
 *  solid dark base — no fallback artifacts. */
function SpatialBackdrop({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c || !src) return;
    setReady(false);
    // intrinsic size first (survives even where getContext is unsupported —
    // e.g. jsdom — the element is still a tiny canvas)
    const S = 144; // tiny square — the CSS upscale smooths everything
    c.width = S;
    c.height = S;
    // jsdom: getContext returns null → stays dark, no crash
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, S, S);
        // blur baked at tiny resolution (6px here ≈ 60px on a 1440 screen)
        ctx.filter = "blur(6px) saturate(112%)";
        // cover-crop the artwork into the tiny square
        const ar = img.width / img.height;
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (ar > 1) { sw = img.height; sx = (img.width - sw) / 2; }
        else { sh = img.width; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, S, S);
        ctx.filter = "none";
        setReady(true);
      } catch {
        /* tainted canvas draw is fine; anything else → keep dark base */
      }
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit: "cover",
        // grow past the edges so the blurred border zones stay off-screen
        transform: "scale(1.45)",
        opacity: ready ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    />
  );
}

/** v10 — ONE carousel card with the desktop hover preview + keyboard-focus
 *  twin. Geometry: side cards sit quieter (deck members); hovering a side
 *  card lifts it a notch (a touch larger, brighter, less blur — the pure
 *  spatialHoverGeom), focusing it lifts one notch less (spatialFocusGeom).
 *  Hover/focus is DESKTOP-ONLY (mobile gets plain cards — no hover-only
 *  states on touch). Timing: 200ms in AND out; the 500ms carousel ease is
 *  untouched. The preview is transform/opacity/filter only — no layout
 *  shift — and the click behaviour is unchanged (center = play/pause,
 *  side = switch to that track). */
function SpatialCard({
  track,
  offset,
  cardW,
  stripH,
  motionOn,
  isPlaying,
  progressFraction,
  onCenterPlayPause,
  onSidePlay,
}: {
  track: Track;
  offset: number;
  cardW: number;
  stripH: number;
  motionOn: boolean;
  isPlaying: boolean;
  progressFraction: number;
  onCenterPlayPause: () => void;
  onSidePlay: (t: Track) => void;
}) {
  const g = spatialCardGeom(offset, false);
  const deeper = deeperThan(g);
  const isCenter = offset === 0;

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hoverActive = !isCenter && hovered;
  const focusActive = !isCenter && focused && !hovered;
  const isPreview = hoverActive || focusActive;
  const target = hoverActive
    ? spatialHoverGeom(g, false)
    : focusActive
      ? spatialFocusGeom(g, false)
      : g;

  // 200ms for preview enter AND leave (spec: 180–250ms both ways); the
  // 500ms carousel ease stays for deck motion. The latch is armed in the
  // EVENT HANDLERS (never in render/effects) and decays after the hover
  // window — so the leave transition is fast too, then deck motion
  // returns to its 500ms calm.
  const [previewLatch, setPreviewLatch] = useState(false);
  const latchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armLatch = () => {
    setPreviewLatch(true);
    if (latchTimer.current) clearTimeout(latchTimer.current);
    latchTimer.current = setTimeout(() => setPreviewLatch(false), SPATIAL_HOVER_MS);
  };
  useEffect(() => () => {
    if (latchTimer.current) clearTimeout(latchTimer.current);
  }, []);
  const transitionSec = isPreview || previewLatch
    ? SPATIAL_HOVER_MS / 1000
    : motionOn
      ? SPATIAL_TRANSITION_MS / 1000
      : 0;

  const filterStr = isPreview
    ? `blur(${target.blurPx}px) brightness(1.07)`
    : `blur(${target.blurPx}px)`;

  return (
    <motion.div
      className="absolute"
      style={{
        // CSS centering via margins (NOT transform — framer owns the
        // transform during animation)
        left: "50%",
        top: "50%",
        marginLeft: -cardW / 2,
        marginTop: -(cardW + stripH) / 2,
        width: cardW,
        height: cardW + stripH,
        zIndex: g.zIndex,
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: isCenter
          ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)"
          : isPreview
            ? "0 22px 52px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.10)"
            : "0 18px 44px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
        WebkitTapHighlightColor: "transparent",
      }}
      initial={{
        opacity: deeper.opacity,
        scale: offset === 0 ? 0.94 : deeper.scale,
        x: (deeper.xPct / 100) * cardW,
        y: (deeper.yPct / 100) * cardW,
        rotate: deeper.rotateZDeg,
        rotateY: deeper.rotateYDeg,
        filter: `blur(${deeper.blurPx}px)`,
      }}
      animate={{
        opacity: target.opacity,
        scale: target.scale,
        x: (target.xPct / 100) * cardW,
        y: (target.yPct / 100) * cardW,
        rotate: target.rotateZDeg,
        rotateY: target.rotateYDeg,
        filter: filterStr,
      }}
      exit={{
        opacity: deeper.opacity,
        scale: deeper.scale,
        x: (deeper.xPct / 100) * cardW,
        y: (deeper.yPct / 100) * cardW,
        rotate: deeper.rotateZDeg,
        rotateY: deeper.rotateYDeg,
        filter: `blur(${deeper.blurPx}px)`,
      }}
      transition={{ duration: transitionSec, ease: SPATIAL_EASE }}
      // hover preview — desktop pointers only, never on the center card;
      // every enter/leave also arms the 200ms transition latch
      onMouseEnter={isCenter ? undefined : () => { setHovered(true); armLatch(); }}
      onMouseLeave={isCenter ? undefined : () => { setHovered(false); armLatch(); }}
      // keyboard focus bubbles from the inner button to here
      onFocus={isCenter ? undefined : () => { setFocused(true); armLatch(); }}
      onBlur={isCenter ? undefined : () => { setFocused(false); armLatch(); }}
      data-mq-spatial-card={offset}
      data-mq-hover={hoverActive ? "true" : undefined}
      data-mq-focus={focusActive ? "true" : undefined}
      data-track-id={track.id}
    >
      <button
        type="button"
        onClick={() => {
          if (isCenter) onCenterPlayPause();
          else onSidePlay(track);
        }}
        className="w-full h-full flex flex-col text-left cursor-pointer"
        style={{ padding: 0, border: "none", background: "transparent", font: "inherit" }}
        aria-label={isCenter
          ? `${isPlaying ? "Пауза" : "Играть"}: ${track.title}`
          : `Переключиться на: ${track.title} — ${track.artist}`}
      >
        {/* artwork — real cover, true square, never cropped */}
        <div className="w-full flex-shrink-0 relative" style={{ height: cardW }}>
          {track.cover ? (
            <img
              src={track.cover}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 55%, #000))" }}>
              <Music className="w-14 h-14" style={{ color: "rgba(255,255,255,0.7)" }} />
            </div>
          )}
          {/* v10 — soft glass highlight + barely-there directional glow
              toward the deck centre. Appears only on hover/focus preview,
              200ms fade, pointer-transparent, zero layout impact. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: isPreview ? 1 : 0,
              transition: `opacity ${SPATIAL_HOVER_MS}ms ease`,
              background: `linear-gradient(${offset < 0 ? "to left" : "to right"}, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.03) 26%, transparent 58%)`,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.09)",
            }}
          />
        </div>
        {/* glass info strip — title/metadata live INSIDE the card */}
        {isCenter ? (
          <div
            className="w-full flex-1 min-h-0 flex flex-col justify-center min-w-0"
            style={{
              background: "rgba(10, 10, 14, 0.42)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              padding: "10px 18px",
            }}
          >
            <LiquidTitle
              text={track.title}
              swapKey={track.id}
              playing={isPlaying}
              progressFraction={progressFraction}
              motionEnabled={motionOn}
              className="mq-text-display font-bold leading-tight text-[22px] tracking-[-0.01em]"
            />
            <p
              className="truncate text-sm mt-1"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
              {track.album ? ` · ${track.album}` : ""}
            </p>
          </div>
        ) : (
          /* side cards: quiet glass foot — presence, not info */
          <div
            className="w-full flex-1 min-h-0"
            style={{
              background: "rgba(10, 10, 14, 0.38)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          />
        )}
      </button>
    </motion.div>
  );
}

/** 44×44 icon button (a11y target size), theme-token styled. */
function SpIconButton({
  onClick,
  label,
  pressed,
  expanded,
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  pressed?: boolean;
  /** v10.3: popup toggles expose aria-expanded + aria-haspopup (matches the
   *  mobile player's volume button semantics). */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      className="mq-icon-btn mq-press flex items-center justify-center"
      style={{
        width: 44,
        height: 44,
        borderRadius: "9999px",
        backgroundColor: pressed ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)" : "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/** v9 — ONE floating glass control for the auxiliary actions
 *  (Like / Dislike / More), reference-style: a vertical rounded pill
 *  floating beside the carousel. Position: "left" | "right" — the user
 *  setting (desktop Spatial only; the v10 mobile composition keeps
 *  Like/Dislike in the identity row instead of a rail). Reads the exact
 *  same store actions as Classic (toggleLike / toggleDislike / existing
 *  More menu) — no new logic, no new menu. */
function SpatialActionRail({
  position,
  orientation,
  isLiked,
  isDisliked,
  onLike,
  onDislike,
  onMore,
}: {
  position: "left" | "right";
  orientation: "vertical" | "horizontal";
  isLiked: boolean;
  isDisliked: boolean;
  onLike: () => void;
  onDislike: () => void;
  onMore: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const vertical = orientation === "vertical";
  return (
    <div
      data-mq-spatial="action-rail"
      data-mq-position={position}
      data-mq-orientation={orientation}
      role="group"
      aria-label="Действия с треком"
      className="flex"
      style={{
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        gap: 2,
        padding: 6,
        borderRadius: 9999,
        backgroundColor: "rgba(12, 12, 17, 0.42)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
      }}
    >
      <SpIconButton
        onClick={() => onLike()}
        label={isLiked ? "Убрать из избранного" : "Нравится"}
        pressed={isLiked}
      >
        <Heart
          className="w-[21px] h-[21px]"
          style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          fill={isLiked ? "currentColor" : "none"}
        />
      </SpIconButton>
      <span
        aria-hidden="true"
        style={vertical
          ? { width: 26, height: 1, background: "rgba(255,255,255,0.09)" }
          : { width: 1, height: 26, background: "rgba(255,255,255,0.09)" }}
      />
      <SpIconButton
        onClick={() => onDislike()}
        label={isDisliked ? "Убрать отметку «Не нравится»" : "Не нравится"}
        pressed={isDisliked}
      >
        <ThumbsDown
          className="w-[19px] h-[19px]"
          style={{
            color: isDisliked ? "var(--mq-error, #ef4444)" : "var(--mq-text-muted)",
            ...(isDisliked ? { fill: "currentColor" } : {}),
          }}
        />
      </SpIconButton>
      <span
        aria-hidden="true"
        style={vertical
          ? { width: 26, height: 1, background: "rgba(255,255,255,0.09)" }
          : { width: 1, height: 26, background: "rgba(255,255,255,0.09)" }}
      />
      <SpIconButton onClick={(e) => onMore(e)} label="Ещё">
        <MoreHorizontal className="w-[21px] h-[21px]" style={{ color: "var(--mq-text-muted)" }} />
      </SpIconButton>
    </div>
  );
}

/** Scoped CSS: seek input + queue bars (component-local, same token DNA). */
function SpatialStyles({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes mqSpBar {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mq-sp-bar { animation: none !important; }
        }
        /* v10.2 GAP#3 fix: same cascade bug as the classic mobile seek —
           the global input[type="range"] 6px rule beat this class selector
           (0,1,0 < 0,1,1), so the spatial seek hit box rendered 6px tall
           (measured on production). Element selector ties specificity and
           this later source order wins. Touch: 44px halo, -8px margins
           keep the visual geometry identical. */
        input.mq-sp-seek {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 28px;
          background: transparent;
          outline: none;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: none;
        }
        @media (hover: none) {
          input.mq-sp-seek {
            height: 44px;
            margin: -8px 0;
          }
        }
        input.mq-sp-seek::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right,
            var(--mq-accent) 0%, var(--mq-accent) var(--mq-seek-pct, 0%),
            rgba(255,255,255,0.14) var(--mq-seek-pct, 0%), rgba(255,255,255,0.14) 100%);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }
        input.mq-sp-seek::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 5px;
          background: var(--mq-card, #17171c);
          border: 2px solid color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card, #17171c));
          margin-top: -5px;
          cursor: pointer;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
        }
        input.mq-sp-seek::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.14);
        }
        input.mq-sp-seek::-moz-range-progress {
          height: 6px;
          border-radius: 3px;
          background: var(--mq-accent);
        }
        input.mq-sp-seek::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background: var(--mq-card, #17171c);
          border: 2px solid var(--mq-accent);
          cursor: pointer;
        }
        [data-mq-spatial] button:focus-visible,
        [data-mq-spatial] input:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--mq-bg, #0a0a0d), 0 0 0 4px var(--mq-accent);
        }
      `}</style>
      {children}
    </>
  );
}
