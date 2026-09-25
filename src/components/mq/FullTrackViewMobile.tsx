"use client";

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { seekPlayback, currentPlaybackPosition } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, ChevronUp, Heart, Shuffle, Repeat, Repeat1, Music, ListMusic, Share2, Loader2, Mic2, ThumbsDown, History, X, MoreHorizontal, Volume2, Volume1, VolumeX, Timer, Gauge, AirVent, ListPlus, Sliders, User as UserIcon, Users, Copy, Download } from "lucide-react";
import ContextMenu from "./ContextMenu";
import { TrackMoreButton } from "./ui/TrackMoreButton";
import { LyricsView, type LyricLine } from "./LyricsView";
import { shareTrackUrl } from "@/lib/share-urls";
import MenuCore, { MenuHeader, backLabelSpec, type MenuElement } from "./ui/MenuCore";
import { TextSwap } from "./ui/TextSwap";
import VolumeSlider from "@/components/ui/volume-slider";
import { ArtworkImage } from "./ui/ArtworkImage";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE (2026-09 redesign)
//
// Premium mobile composition (NOT a shrunk desktop):
//   header: close ▽ · context label · more ⋯
//   dominant artwork (ambient accent glow, no blur — GPU-cheap)
//   2-line title + artist link
//   action row: like · dislike · add-to-playlist (44px targets)
//   seek (28px touch, 16px thumb) + tabular times
//   transport: shuffle 44 · prev 56 · PLAY 76 (accent) · next 56 · repeat 44
//   chips: Текст · Очередь · История · Поделиться
//
// PERFORMANCE RULES (unchanged):
// 1. NO layout-affecting animations — transform/opacity only.
// 2. Progress fill = CSS gradient var (--mq-seek-pct), NOT width reflow.
// 3. Time labels update only when the second changes.
// 4. Position source is PLAYBACK-ROUTED: currentPlaybackPosition() reads the
//    WASM engine stats when wasm owns playback and the <audio> element
//    otherwise. The old code read audio.currentTime directly → on the WASM
//    path (the default backend) the bar and clock were FROZEN at 0:00.
// 5. Cover fixed square, object-cover, no parallax.
// 6. Buttons use CSS :active, no JS state.
// 7. Open animation translateY 250ms only.
// ═════════════════════════════════════════════════════════════════════════

// v78: the local inline SyncedLyrics is gone — mobile renders the SAME
// shared LyricsView/LiquidLyrics as desktop (one visual language, §18),
// full variant. LyricLine type is imported above.

function EscapeHandler({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onEscape]);
  return null;
}

function FullTrackViewMobileInner() {
  const isOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const duration = useAppStore((s) => s.duration);
  const volume = useAppStore((s) => s.volume);
  const shuffle = useAppStore((s) => s.shuffle);
  const repeat = useAppStore((s) => s.repeat);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const playbackState = useAppStore((s) => s.playbackState);
  const radioMode = useAppStore((s) => s.radioMode);
  const history = useAppStore((s) => s.history);

  const setOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const playTrack = useAppStore((s) => s.playTrack);
  const playlists = useAppStore((s) => s.playlists);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled);
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);
  const sleepTimerActive = useAppStore((s) => s.sleepTimerActive);
  const sleepTimerRemaining = useAppStore((s) => s.sleepTimerRemaining);
  const startSleepTimer = useAppStore((s) => s.startSleepTimer);
  const stopSleepTimer = useAppStore((s) => s.stopSleepTimer);

  const [panel, setPanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [trackMenu, setTrackMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  // v10.1: unified MenuCore More (bottom sheet on mobile) replaces the
  // custom inline sheet — same actions as desktop Classic + the v10
  // audited additions, one menu engine for the whole app.
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);
  const [morePage, setMorePage] = useState<"root" | "speed" | "sleep">("root");
  // v10.1: volume popup above the player bar (was buried in the old More
  // sheet) — first-class control with icon-by-level + animated opening.
  const [showVolume, setShowVolume] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  // v10.1: lyrics/queue/history panel exit animation (close slid the
  // panel away instead of hard-unmounting).
  const [panelClosing, setPanelClosing] = useState(false);
  // Exit animation: close paths set closing=true, the overlay plays
  // mqFtSlideDown, and onAnimationEnd flips the store open flag. Mobile
  // previously hard-unmounted with no exit — desktop springs out.
  const [closing, setClosing] = useState(false);

  // v72 FIX: the player stays MOUNTED while closed (early return below does
  // not unmount it), so panel/picker/menu state survived a close→reopen —
  // reopening the player showed the queue drawer still covering everything.
  // Reset all overlay state the moment the player closes.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setPanel(null);
      setPanelClosing(false);
      setShowPlaylistPicker(false);
      setMoreMenu(null);
      setMorePage("root");
      setShowVolume(false);
      setTrackMenu(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // ── Refs for progress ──
  const seekInputRef = useRef<HTMLInputElement>(null);
  const timeCurrentRef = useRef<HTMLSpanElement>(null);
  const timeRemainingRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);
  // Latest duration without re-creating the RAF loop on every track:
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // ── RAF: update seek input + time label (WASM-aware position source) ──
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    let lastSecond = -1;
    let lastTrackId: string | null = null;

    const tick = () => {
      if (!isDraggingRef.current) {
        // currentPlaybackPosition() routes: WASM stats when the wasm backend
        // owns playback, <audio>.currentTime otherwise. Reading the element
        // directly froze the bar at 0:00 on the wasm path.
        const pos = currentPlaybackPosition();
        const dur = durationRef.current || 0;
        // v69: reset the second-latch on track switch so a new track starts
        // its label from 0 instead of inheriting the old track's timestamp.
        const tid = useAppStore.getState().currentTrack?.id ?? null;
        if (tid !== lastTrackId) {
          lastTrackId = tid;
          lastSecond = -1;
        }
        // v69: position updates even when duration is still unknown (0) —
        // the OLD `dur > 0` gate froze the label at 0:00 while audio was
        // audibly playing on tracks with missing metadata.
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
              // Unknown duration → honest “—”, never a fake −0:00 countdown.
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
  }, [isOpen]);

  // ── Seek: visual-only during drag, commit on release ──
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    isDraggingRef.current = true;
    e.target.style.setProperty("--mq-seek-pct", `${v}%`);
  }, []);

  const commitSeek = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
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

  // ── Cover gestures: swipe down=close, swipe left/right=skip ──
  const coverSwipe = useRef({ x: 0, y: 0, t: 0 });
  const handleCoverTouchStart = useCallback((e: React.TouchEvent) => {
    coverSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);
  const handleCoverTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - coverSwipe.current.x;
    const dy = e.changedTouches[0].clientY - coverSwipe.current.y;
    const dt = Date.now() - coverSwipe.current.t;
    if (dy > 80 && dy > Math.abs(dx) * 1.5 && dt < 600) { setOpen(false); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) { if (dx < 0) nextTrack(); else prevTrack(); }
  }, [setOpen, nextTrack, prevTrack]);

  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  const upcoming = queue.length ? queue.slice(queueIndex + 1, queueIndex + 6) : [];
  const recent = (() => {
    if (!currentTrack) return [];
    const seen = new Set([currentTrack.id]); const out: Track[] = [];
    for (let i = history.length - 1; i >= 0 && out.length < 5; i--) { const t = history[i].track; if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } }
    return out;
  })();

  useEffect(() => {
    if (!isOpen || !currentTrack || panel !== "lyrics") return;
    setLyrics([]); setPlainLyrics(""); setLyricsLoading(true); setLyricsError(null);
    let cancelled = false;
    // Client-side fetch directly from lrclib.net (CORS-enabled) — bypasses
    // Vercel serverless which is IP-blocked by lrclib.net's WAF.
    import("@/lib/lyrics-client").then(({ fetchLyrics }) => {
      if (cancelled) return;
      return fetchLyrics(currentTrack.artist, currentTrack.title);
    }).then(d => {
      if (cancelled || !d) return;
      if (d.lyrics.length > 0) {
        setLyrics(d.lyrics);
      } else if (d.plainText) {
        setPlainLyrics(d.plainText);
      } else {
        setLyricsError("Текст не найден");
      }
    }).catch(() => {
      if (!cancelled) setLyricsError("Ошибка загрузки текста");
    }).finally(() => {
      if (!cancelled) setLyricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [panel, isOpen, currentTrack]);

  useEffect(() => { setLyrics([]); setPlainLyrics(""); setLyricsError(null); }, [currentTrack?.id]);
  // Artwork skeleton: the artwork subtree is KEYED BY TRACK ID below —
  // <ArtworkImage> remounts per track and owns its loading state.

  const handleLike = useCallback(() => { if (currentTrack) toggleLike(currentTrack.id, currentTrack); }, [currentTrack, toggleLike]);
  const handleDislike = useCallback(() => { if (currentTrack) { toggleDislike(currentTrack.id, currentTrack); /* toggleDislike already calls nextTrack() internally */ } }, [currentTrack, toggleDislike]);
  const openShareSheet = useAppStore((s) => s.openShareSheet);
  const handleShare = useCallback(() => {
    if (!currentTrack) return;
    // v78: opens the global QR share sheet (canonical URL; demo/local
    // tracks honestly report "no public link" instead of a dead /track/id)
    openShareSheet({
      url: shareTrackUrl(currentTrack),
      title: currentTrack.title,
      subtitle: currentTrack.artist,
      cover: currentTrack.cover,
    });
  }, [currentTrack, openShareSheet]);
  const handleArtist = useCallback(() => { if (currentTrack?.artist) { setSelectedArtist({ name: currentTrack.artist }); setOpen(false); } }, [currentTrack, setSelectedArtist, setOpen]);

  // ── v10.1 More actions — the SAME audited handlers that already exist
  //    in desktop Classic's MenuCore menu and the unified ContextMenu /
  //    Spatial More (v10 audit). No new behaviour invented here — same
  //    store actions, same semantics, same order as Classic. ──
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);

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

  // Same insertion semantics as the unified ContextMenu: right after
  // the currently playing track.
  const handleAddToQueue = useCallback(() => {
    if (!currentTrack) return;
    const state = useAppStore.getState();
    const newQueue = [...state.queue];
    const at = state.queueIndex + 1;
    if (newQueue.some((t, i) => i >= at && t.id === currentTrack.id)) {
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

  // Speed/sleep handlers for the More menu picker pages
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = speed;
  }, [setPlaybackRate]);
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);
  const sleepRemainingMin = Math.ceil(sleepTimerRemaining / 60);

  // v10.1: volume icon reflects the level (0 → muted icon, <50 → low).
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ── v10.1 More menu elements — root + speed/sleep picker sub-pages.
  // Root order mirrors desktop Classic (Трек → share/copy/download →
  // artist/subscribe → queue/playlist → Воспроизведение) with the v10
  // audited additions. Selecting a speed/sleep value applies it and
  // closes; the Back row keeps the menu open (MenuCore pattern). ──
  const moreElements: MenuElement[] = morePage === "speed"
    ? [
        backLabelSpec("Скорость", () => setMorePage("root")),
        ...speedOptions.map((s) => ({
          type: "item" as const,
          id: `speed-${s}`,
          icon: Gauge,
          label: `${s}x`,
          checked: playbackRate === s,
          onSelect: () => handleSpeedChange(s),
        })),
      ]
    : morePage === "sleep"
      ? [
          backLabelSpec("Таймер сна", () => setMorePage("root")),
          ...sleepOptions.map((m) => ({
            type: "item" as const,
            id: `sleep-${m}`,
            icon: Timer,
            label: `${m} мин`,
            onSelect: () => handleSleepSet(m),
          })),
          ...(sleepTimerActive
            ? [{
                type: "item" as const,
                id: "sleep-off",
                icon: X,
                label: "Отменить",
                destructive: true,
                onSelect: () => { stopSleepTimer(); toast({ title: "Таймер отменён" }); },
              }]
            : []),
        ]
      : [
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
          { type: "separator" },
          { type: "label", text: "Воспроизведение" },
          {
            type: "item",
            id: "eq",
            icon: Sliders,
            label: "Эквалайзер",
            active: eqEnabled,
            hint: eqEnabled ? "ВКЛ" : undefined,
            onSelect: () => setEqOpen(true),
          },
          {
            type: "item",
            id: "spatial",
            icon: AirVent,
            label: "Пространственное аудио",
            checked: spatialAudioEnabled,
            onSelect: () => setSpatialAudioEnabled(!spatialAudioEnabled),
          },
          {
            type: "item",
            id: "speed",
            icon: Gauge,
            label: "Скорость",
            active: playbackRate !== 1,
            hint: `${playbackRate}x`,
            keepOpen: true,
            onSelect: () => setMorePage("speed"),
          },
          {
            type: "item",
            id: "sleep",
            icon: Timer,
            label: "Таймер сна",
            active: sleepTimerActive,
            hint: sleepTimerActive ? `${sleepRemainingMin}м` : undefined,
            keepOpen: true,
            onSelect: () => setMorePage("sleep"),
          },
        ];

  // v10.1: volume keys for hardware keyboards / tablets — ArrowUp/Down ±5,
  // M mute (mirrors the desktop players). Skipped while typing in inputs;
  // the range input handles its own arrows natively when focused.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "ArrowUp") {
        e.preventDefault();
        setVolume(Math.min(100, useAppStore.getState().volume + 5));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setVolume(Math.max(0, useAppStore.getState().volume - 5));
      } else if (e.key === "m" || e.key === "M" || e.key === "ь") {
        const v = useAppStore.getState().volume;
        setVolume(v > 0 ? 0 : 70);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setVolume]);

  if (!isOpen || !currentTrack) return null;

  // Route every close through the exit animation (idempotent while running).
  const requestClose = () => setClosing(true);
  // v10.1: layered close — panel exit anim, then unmount on animation end.
  const closePanel = () => setPanelClosing(true);

  // Escape closes the mobile full player too (matches desktop; helps
  // tablet + keyboard users). Rendered via a dedicated component so hooks
  // stay unconditional.
  const iconBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", padding: 0 };

  const contextLabel = isLoading ? "ЗАГРУЗКА" : isPlaying ? "СЕЙЧАС ИГРАЕТ" : "ПАУЗА";
  const queueName = radioMode ? "Волна" : queue.length > 1 ? "Очередь" : "";

  return (
    <>
    <EscapeHandler
      active={isOpen}
      onEscape={() => {
        // v10.1 layered Escape: volume popup → panel → player. MenuCore
        // closes itself first (capture-phase listener + stopPropagation).
        if (showVolume) setShowVolume(false);
        else if (panel) closePanel();
        else requestClose();
      }}
    />
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`Полноэкранный плеер: ${currentTrack.title} - ${currentTrack.artist}`}
      onAnimationEnd={(e) => {
        // animationend bubbles from children (mqFtRise etc.) — only the
        // ROOT's own slide-down finishes the close.
        if (closing && e.target === e.currentTarget) {
          setOpen(false);
          setClosing(false);
        }
      }}
      style={{
      background: "var(--mq-bg)",
      // Open: translateY only (GPU-composited, no layout). Close: slide
      // back down 200ms — short, never blocks the next interaction.
      animation: closing
        ? "mqFtSlideDown 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards"
        : "mqFtSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
    }}>
      <style>{`
        @keyframes mqFtSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes mqFtSlideDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes mqFtArtIn {
          from { transform: translateY(14px) scale(0.965); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes mqFtRise {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mq-ft-anim { animation: none !important; }
        }
        .mq-ft-btn {
          transition: transform 0.1s ease;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
        }
        /* §PRESS (v71): press-scale removed — hover/focus feedback only */
        /* v10.2 GAP#3 fix: input[type="range"] in globals.css sets
           height:6px at (0,1,1) specificity and silently beat this
           class rule (0,1,0) — the seek hit box rendered 6px tall on
           PRODUCTION (measured). Element selector restores the tie and
           this LATER source order wins → 28px as designed. Touch
           devices get a 44px grab halo with negative margins so the
           visual bar geometry (and the player bar height) is unchanged. */
        input.mq-ft-seek-input {
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
          input.mq-ft-seek-input {
            height: 44px;
            margin: -8px 0;
          }
        }
        input.mq-ft-seek-input::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right,
            var(--mq-accent) 0%, var(--mq-accent) var(--mq-seek-pct, 0%),
            var(--mq-glass-bg) var(--mq-seek-pct, 0%), var(--mq-glass-bg) 100%);
          box-shadow: var(--mq-shadow-inner-glow);
        }
        input.mq-ft-seek-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          /* MQ signature fader cap — v71 unified 16px family */
          width: 16px;
          height: 16px;
          border-radius: 5px;
          background: var(--mq-card);
          border: 2px solid color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card));
          margin-top: -5px;
          cursor: pointer;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35), 0 0 0 4px color-mix(in srgb, var(--mq-accent) 20%, transparent);
        }
        input.mq-ft-seek-input::-moz-range-track {
          height: 5px;
          border-radius: 3px;
          background: var(--mq-glass-bg-hover);
        }
        input.mq-ft-seek-input::-moz-range-progress {
          height: 5px;
          border-radius: 3px;
          background: var(--mq-accent);
        }
        input.mq-ft-seek-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background: var(--mq-card);
          border: 2px solid var(--mq-accent);
          cursor: pointer;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 22%, transparent);
        }
      `}</style>

      {/* Ambient glow behind the artwork — one radial accent pool.
          Pure CSS (no filter:blur) — GPU-composited, theme-token based. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-[8%] bottom-[30%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 42%, color-mix(in srgb, var(--mq-accent) 16%, transparent) 0%, transparent 72%)",
        }}
      />

      <div className="relative z-10 h-full flex flex-col">

        {/* ── Header: close · context · more ── */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(10px, env(safe-area-inset-top))", paddingBottom: 6, flexShrink: 0 }}>
          <button onClick={requestClose} aria-label="Закрыть" className="mq-ft-btn mq-press" style={iconBtn}><ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
          <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5">
            {isPlaying && <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} aria-hidden="true" />}
            <p className="mq-t-meta mq-t-meta-2 font-semibold uppercase tracking-[0.18em] truncate" style={{ color: "var(--mq-text-muted)" }}>
              {contextLabel}{queueName ? ` · ${queueName}` : ""}
            </p>
            <span className="flex-1 h-px max-w-14" style={{ backgroundColor: "var(--mq-border-thin)" }} aria-hidden="true" />
          </div>
          <button
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMorePage("root");
              setMoreMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            aria-label="Ещё"
            aria-haspopup="menu"
            aria-expanded={!!moreMenu}
            className="mq-ft-btn mq-press"
            style={iconBtn}
          ><MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
        </div>

        {/* ── Dominant artwork (fills the leftover space) ──
            §C redesign: NO white hairline edge (the old 1px border read as
            a "sticker" outline — VLM critique) — pure grounded shadow.
            v10.1: skeleton shimmer under the cover until it decodes, then
            a 200ms fade-in (cached covers load instantly — no flash). */}
        <div className="flex-1 flex items-center justify-center px-4 min-h-0" style={{ paddingTop: 6, paddingBottom: 10 }}>
          <div
            key={currentTrack.id}
            className="mq-ft-anim relative rounded-[20px] overflow-hidden"
            style={{
              width: "min(92vw, 58vh)",
              aspectRatio: "1 / 1",
              boxShadow: "var(--mq-art-shadow)",
              // Artwork entrance replays on track change (key remount) —
              // previously the image just swapped src with no transition.
              animation: "mqFtArtIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onTouchStart={handleCoverTouchStart}
            onTouchEnd={handleCoverTouchEnd}
            data-mq-artwork=""
          >
            {currentTrack.cover ? (
              <ArtworkImage key={currentTrack.id} src={currentTrack.cover} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                <Music className="w-16 h-16" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
              </div>
            )}
            {isPlaying && (
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 32%, transparent)" }} />
            )}
          </div>
        </div>

        {/* ── TRACK IDENTITY: title + artist (left) + LIKE (right) ──
            §C redesign: the like action lives HERE, anchored to identity,
            instead of a glass-button row wedged between title and progress.
            Weight contrast: title 800 / artist regular-muted.
            v10.1: TextSwap = the project's canonical 260ms track-change
            gesture for title/artist; Like gets the micro-pop + accent fade. */}
        <div className="mq-ft-anim px-4 flex items-end justify-between gap-3" style={{ flexShrink: 0, animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 60ms backwards" }}>
          <div className="min-w-0 flex-1">
            <TextSwap
              as="h1"
              text={currentTrack.title}
              swapKey={currentTrack.id}
              multiline
              className="mq-text-display text-[28px] leading-[1.12] tracking-[-0.02em] font-extrabold"
              style={{ color: "var(--mq-text)" }}
            />
            <button onClick={handleArtist} className="mq-t-body text-sm mt-1.5 flex items-center gap-1 max-w-full text-left group" style={{ color: "var(--mq-text-muted)" }}>
              <TextSwap text={currentTrack.artist} swapKey={currentTrack.id} className="min-w-0 flex-1" />
              <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 rotate-90 opacity-60" />
            </button>
          </div>
          <button
            onClick={handleLike}
            aria-label={isLiked ? "Убрать из избранного" : "Нравится"}
            aria-pressed={isLiked}
            className="mq-ft-btn mq-press flex-shrink-0 mb-1"
            style={{ width: 44, height: 44, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-glass-bg)", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span key={isLiked ? "on" : "off"} className="mq-icon-pop flex items-center justify-center">
              <Heart className="w-[22px] h-[22px] mq-color-fade" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </span>
          </button>
        </div>

        {/* Playlist picker sheet */}
        {showPlaylistPicker && currentTrack && (
          <div className="px-5 mt-3" style={{ flexShrink: 0 }}>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--mq-border-thin)" }}>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Добавить в плейлист
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      Нет плейлистов
                    </p>
                  </div>
                ) : (
                  playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        addToPlaylist(pl.id, currentTrack);
                        setShowPlaylistPicker(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
                        {pl.cover ? (
                          <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ListMusic className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>
                          {pl.name}
                        </p>
                        <p className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
                          {pl.tracks.length} треков
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── v10.1 PLAYER BAR — one premium glass surface for the whole
            control deck: progress + transport + secondary actions. Same
            buttons, same order, same 44px+ targets as the restored
            baseline — only the surface became a bar (premium glass,
            thin border, soft shadow). Compact on 360/390/412px. ── */}
        <div
          className="relative flex-shrink-0"
          style={{ margin: "12px 12px max(12px, env(safe-area-inset-bottom))" }}
          data-mq-playerbar=""
        >
          <div
            className="mq-ft-anim rounded-[26px] overflow-hidden"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-surface-1) 58%, transparent)",
              backdropFilter: "var(--mq-blur-md)",
              WebkitBackdropFilter: "var(--mq-blur-md)",
              border: "1px solid var(--mq-edge-strong)",
              boxShadow: "0 16px 44px rgba(0, 0, 0, 0.38)",
              animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 150ms backwards",
            }}
          >
            {/* progress: times + seek (28px touch) — baseline visual, now
                inside the bar; current time 26px editorial, honest “—”. */}
            <div className="px-4 pt-3">
              <div className="flex items-baseline justify-between">
                <span ref={timeCurrentRef} className="text-[26px] tabular-nums font-bold leading-none tracking-tight shrink-0" style={{ color: "var(--mq-text)" }}>0:00</span>
                <span ref={timeRemainingRef} className="mq-t-body tabular-nums shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)" }}>{duration > 0 ? `−${formatDuration(duration)}` : "—"}</span>
              </div>
              <input
                ref={seekInputRef}
                type="range"
                min={0}
                max={100}
                step={0.1}
                defaultValue={0}
                onChange={handleSeekChange}
                onPointerDown={() => { isDraggingRef.current = true; }}
                onPointerUp={commitSeek}
                onPointerCancel={() => { isDraggingRef.current = false; }}
                aria-label="Позиция воспроизведения"
                className="mq-ft-seek-input"
              />
            </div>

            {/* transport: shuffle 44 · prev 56 · PLAY 76 · next 56 · repeat 44 */}
            <div className="flex items-center justify-between px-4 mt-1">
              <button onClick={toggleShuffle} aria-label="Перемешать" aria-pressed={shuffle} className="mq-ft-btn mq-press" style={{ ...iconBtn, borderRadius: 14, backgroundColor: shuffle ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : iconBtn.backgroundColor, boxShadow: shuffle ? "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "none" }}>
                <Shuffle className="w-5 h-5 mq-color-fade" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              </button>
              <button onClick={prevTrack} aria-label="Предыдущий трек" className="mq-ft-btn mq-press" style={{ ...iconBtn, width: 56, height: 56, borderRadius: 18 }}>
                <SkipBack className="w-8 h-8" style={{ color: "var(--mq-text)" }} fill="currentColor" />
              </button>
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                className="mq-ft-btn mq-press"
                style={{
                  width: 76, height: 76, borderRadius: "9999px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "var(--mq-accent)", border: "none", cursor: "pointer", padding: 0,
                  boxShadow: "0 10px 30px -8px color-mix(in srgb, var(--mq-accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
                data-mq-playbtn=""
              >
                {isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                ) : (
                  <span key={isPlaying ? "pause" : "play"} className="mq-icon-swap flex items-center justify-center">
                    {isPlaying
                      ? <Pause className="w-8 h-8" fill="currentColor" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                      : <Play className="w-8 h-8 ml-1" fill="currentColor" style={{ color: "var(--mq-text-on-accent, #fff)" }} />}
                  </span>
                )}
              </button>
              <button onClick={nextTrack} aria-label="Следующий трек" className="mq-ft-btn mq-press" style={{ ...iconBtn, width: 56, height: 56, borderRadius: 18 }}>
                <SkipForward className="w-8 h-8" style={{ color: "var(--mq-text)" }} fill="currentColor" />
              </button>
              <button onClick={toggleRepeat} aria-label="Повтор" aria-pressed={repeat !== "off"} className="mq-ft-btn mq-press" style={{ ...iconBtn, borderRadius: 14, backgroundColor: repeat !== "off" ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : iconBtn.backgroundColor, boxShadow: repeat !== "off" ? "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "none" }}>
                {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} /> : <Repeat className="w-5 h-5 mq-color-fade" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
              </button>
            </div>

            {/* secondary: dislike · playlist · lyrics · queue · history · volume
                (§C hierarchy: after transport; like lives up in identity,
                share lives in More — volume got its own first-class slot). */}
            <div
              className="flex items-center justify-between px-5 pt-2.5 pb-3"
              data-mq-secondary=""
            >
              {([
                { id: "dislike", icon: ThumbsDown, label: "Не нравится", on: isDisliked, danger: true, onClick: handleDislike },
                { id: "playlist", icon: ListPlus, label: "В плейлист", on: showPlaylistPicker, danger: false, onClick: () => setShowPlaylistPicker(v => !v) },
                { id: "lyrics", icon: Mic2, label: "Текст", on: panel === "lyrics", danger: false, onClick: () => { setPanelClosing(false); setPanel(p => (p === "lyrics" ? null : "lyrics")); } },
                { id: "queue", icon: ListMusic, label: "Очередь", on: panel === "queue", danger: false, onClick: () => { setPanelClosing(false); setPanel(p => (p === "queue" ? null : "queue")); } },
                { id: "history", icon: History, label: "История", on: panel === "history", danger: false, onClick: () => { setPanelClosing(false); setPanel(p => (p === "history" ? null : "history")); } },
              ] as const).map(({ id, icon: Icon, label, on, danger, onClick }) => (
                <button
                  key={id}
                  onClick={onClick}
                  aria-label={label}
                  aria-pressed={on || undefined}
                  title={label}
                  className="mq-ft-btn mq-press w-11 h-11 rounded-[14px] flex items-center justify-center"
                  style={{
                    backgroundColor: on
                      ? danger
                        ? "color-mix(in srgb, var(--mq-error) 15%, transparent)"
                        : "color-mix(in srgb, var(--mq-accent) 16%, transparent)"
                      : "transparent",
                    color: on
                      ? danger
                        ? "var(--mq-error, #ef4444)"
                        : "var(--mq-accent)"
                      : "var(--mq-text-muted)",
                  }}
                >
                  <span key={on ? "on" : "off"} className="mq-icon-pop flex items-center justify-center">
                    <Icon className="w-[19px] h-[19px] mq-color-fade" fill={on && (id === "dislike") ? "currentColor" : "none"} style={{ color: "inherit" }} />
                  </span>
                </button>
              ))}
              {/* volume — opens the popup above the bar */}
              <button
                onClick={() => setShowVolume(v => !v)}
                aria-label={`Громкость: ${Math.round(volume)}%`}
                aria-expanded={showVolume}
                aria-haspopup="dialog"
                title="Громкость"
                className="mq-ft-btn mq-press w-11 h-11 rounded-[14px] flex items-center justify-center"
                style={{
                  backgroundColor: showVolume ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "transparent",
                  color: showVolume ? "var(--mq-accent)" : "var(--mq-text-muted)",
                }}
                data-mq-volbtn=""
              >
                <VolumeIcon className="w-[19px] h-[19px] mq-color-fade" style={{ color: "inherit" }} />
              </button>
            </div>
          </div>

          {/* volume popup — OUTSIDE the overflow-hidden bar (not clipped).
              Opens with opacity 0→1 / scale 0.96→1 / translateY→0 in
              ~180ms; closes on outside click; Escape is layered (popup →
              panel → player). */}
          <AnimatePresence>
            {showVolume && (
              <>
                <motion.div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowVolume(false)}
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-[calc(100%+10px)] right-0 z-40 rounded-2xl p-3 w-[220px]"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--mq-surface-1) 82%, transparent)",
                    backdropFilter: "var(--mq-blur-md)",
                    WebkitBackdropFilter: "var(--mq-blur-md)",
                    border: "1px solid var(--mq-edge-strong)",
                    boxShadow: "var(--mq-elev-dialog)",
                  }}
                  role="group"
                  aria-label="Громкость"
                  data-mq-volpopup=""
                >
                  <VolumeSlider volume={volume} onChange={setVolume} showValue className="w-full" />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* ── Panel overlay (lyrics/queue/history) ──
            v10.1: close = slide-down exit (was a hard unmount). */}
        {panel && (
          <div
            className="absolute inset-0 z-20 flex flex-col"
            data-mq-panel={panel}
            style={{
              background: "var(--mq-bg)",
              paddingTop: "max(16px, env(safe-area-inset-top))",
              animation: panelClosing
                ? "mqFtSlideDown 0.16s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "mqFtSlideUp 0.2s ease-out",
            }}
            onAnimationEnd={(e) => {
              if (panelClosing && e.target === e.currentTarget) {
                setPanel(null);
                setPanelClosing(false);
              }
            }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ flexShrink: 0 }}>
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>{panel === "lyrics" ? "Текст песни" : panel === "queue" ? "Очередь" : "Недавно играло"}</p>
              <button onClick={closePanel} aria-label="Закрыть" className="mq-ft-btn mq-press" style={iconBtn}><X className="w-5 h-5" style={{ color: "var(--mq-text)" }} /></button>
            </div>
            {/* v78: lyrics branch = flex fill (LiquidLyrics scrolls itself);
                queue/history keep the outer scrolling container */}
            <div className={panel === "lyrics" ? "flex-1 min-h-0 flex flex-col px-4 pb-4" : "flex-1 overflow-y-auto px-4 pb-4"}>
              {/* live position read at render — LiquidLyrics' rAF loop is
                  the real time source; this only seeds the first paint
                  without adding a ~1 Hz store re-render to the player */}
              {panel === "lyrics" && (
                <LyricsView
                  lines={lyrics}
                  plainText={plainLyrics}
                  currentTime={currentPlaybackPosition()}
                  isLoading={lyricsLoading}
                  error={lyricsError}
                  onSeek={seekToTime}
                  cover={currentTrack?.cover}
                  duration={duration}
                  variant="full"
                />
              )}
              {panel === "queue" && (upcoming.length ? upcoming.map((t, i) => (
                <div key={t.id + i} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playTrack?.(t, queue); closePanel(); } }} onClick={() => { playTrack?.(t, queue); closePanel(); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  {/* v69 duration contract: queue rows keep duration (shrink-0) */}
                  {t.duration > 0 && (
                    <span className="mq-t-num shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)", opacity: 0.75 }}>{formatDuration(t.duration)}</span>
                  )}
                  <TrackMoreButton onOpen={(e) => { e.stopPropagation(); setTrackMenu({ track: t, x: e.clientX, y: e.clientY }); }} size="sm" label={`Действия: ${t.title}`} />
                </div>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>)}
              {panel === "history" && (recent.length ? recent.map((t, i) => (
                <div key={t.id + i} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playTrack?.(t, [t]); closePanel(); } }} onClick={() => { playTrack?.(t, [t]); closePanel(); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  {/* v69 duration contract: history rows keep duration (shrink-0) */}
                  {t.duration > 0 && (
                    <span className="mq-t-num shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)", opacity: 0.75 }}>{formatDuration(t.duration)}</span>
                  )}
                  <TrackMoreButton onOpen={(e) => { e.stopPropagation(); setTrackMenu({ track: t, x: e.clientX, y: e.clientY }); }} size="sm" label={`Действия: ${t.title}`} />
                </div>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>)}
            </div>
          </div>
        )}

        {/* ── v10.1 MORE — unified MenuCore (bottom sheet on mobile) with the
            full audited action set: same handlers/order as desktop Classic
            + the v10 audited additions (artist / subscribe / add-to-queue).
            Speed & sleep are picker sub-pages (backLabelSpec pattern).
            Volume lives in its own bar slot — NOT duplicated here. ── */}
        {moreMenu && currentTrack && (
          <MenuCore
            anchor={moreMenu}
            onClose={() => { setMoreMenu(null); setMorePage("root"); }}
            elements={moreElements}
            width={300}
            ariaLabel="Действия с треком"
            side="below"
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
      </div>
      </div>

      {/* v68: unified context menu (portal) for queue/history rows */}
      {trackMenu && (
        <ContextMenu
          track={trackMenu.track}
          x={trackMenu.x}
          y={trackMenu.y}
          onClose={() => setTrackMenu(null)}
          side="above"
          bottomInset={120}
        />
      )}
    </>
  );
}

export default memo(FullTrackViewMobileInner);
