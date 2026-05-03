"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, X, Heart, ThumbsDown, ListMusic, Music, ChevronLeft, FileText, ExternalLink, Download, Moon, Clock, MessageSquare, Sparkles, PictureInPicture2, Waves, Dna
} from "lucide-react";
import SongDNA from "./SongDNA";
import { formatDuration, searchTracks, type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { getAudioElement, resumeAudioContext } from "@/lib/audioEngine";
import { openPiPPopup, closePiPPopup } from "@/lib/pipManager";
import TrackCommentsPanel from "./TrackCommentsPanel";
import TrackCanvas from "./TrackCanvas";
import PlaylistArtwork from "./PlaylistArtwork";

export default function FullTrackView() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    isFullTrackViewOpen, setFullTrackViewOpen, animationsEnabled,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
    similarTracks, setSimilarTracks, similarTracksLoading, setSimilarTracksLoading,
    playTrack, queue, showSimilarRequested, clearShowSimilarRequest,
    showLyricsRequested, clearShowLyricsRequest,
    sleepTimerActive, sleepTimerRemaining, startSleepTimer, stopSleepTimer, updateSleepTimer,
    currentStyle, styleVariant, currentPlaylistId,
    isPiPActive, setPiPActive, pipMode,
    radioMode, toggleRadioMode, releaseRadarTracks, fetchReleaseRadar, likedTracksData,
  } = useAppStore();

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveAnimRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDNA, setShowDNA] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [lyricsLines, setLyricsLines] = useState<{ time: number; text: string }[]>([]);
  const [lyricsPlainText, setLyricsPlainText] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);

  // Native wheel handler for volume section (fix passive listener issue)
  useEffect(() => {
    const el = volumeSectionRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -5 : 5;
      useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Handle showSimilarRequested from store
  useEffect(() => {
    if (showSimilarRequested) {
      setShowSimilar(true);
      setShowLyrics(false);
      clearShowSimilarRequest();
    }
  }, [showSimilarRequested, clearShowSimilarRequest]);

  // Handle showLyricsRequested from store
  useEffect(() => {
    if (showLyricsRequested) {
      setShowLyrics(true);
      setShowSimilar(false);
      clearShowLyricsRequest();
    }
  }, [showLyricsRequested, clearShowLyricsRequest]);

  // Fetch lyrics when lyrics panel opens or track changes
  useEffect(() => {
    if (!showLyrics || !currentTrack) return;
    const artist = currentTrack.artist;
    const title = currentTrack.title;
    if (!artist || !title) return;

    let cancelled = false;
    setLyricsLoading(true);
    setLyricsLines([]);
    setLyricsPlainText("");
    setActiveLineIndex(-1);

    fetch(`/api/music/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setLyricsLines(data.lyrics || []);
        setLyricsPlainText(data.plainText || "");
      })
      .catch(() => {
        if (!cancelled) { setLyricsLines([]); setLyricsPlainText(""); }
      })
      .finally(() => { if (!cancelled) setLyricsLoading(false); });

    return () => { cancelled = true; };
  }, [showLyrics, currentTrack?.id, currentTrack?.artist, currentTrack?.title]);

  // Sync lyrics with playback progress
  useEffect(() => {
    if (lyricsLines.length === 0 || !isPlaying) return;
    // Find the current active line
    let idx = -1;
    for (let i = lyricsLines.length - 1; i >= 0; i--) {
      if (progress >= lyricsLines[i].time) { idx = i; break; }
    }
    if (idx !== activeLineIndex) setActiveLineIndex(idx);
  }, [progress, lyricsLines, isPlaying, activeLineIndex]);

  // Auto-scroll active lyrics line into view
  useEffect(() => {
    if (activeLineRef.current && lyricsScrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex]);

  // Fetch similar tracks using the smart similarity algorithm
  useEffect(() => {
    if (!currentTrack || !showSimilar) return;
    let cancelled = false;
    const fetchSimilar = async () => {
      setSimilarTracksLoading(true);
      try {
        // Build params for the similarity API
        const store = useAppStore.getState();
        const dislikedIds = store.dislikedTrackIds || [];
        const dislikedTracksData = store.likedTracksData || [];
        const historyData = store.history || [];

        // Collect disliked artists and genres
        const dislikedArtistsSet = new Set<string>();
        const dislikedGenresSet = new Set<string>();
        const allKnown = [...dislikedTracksData, ...historyData.slice(0, 100).map((h: any) => h.track)];
        for (const t of allKnown) {
          if (dislikedIds.includes(t.id)) {
            if (t.artist) dislikedArtistsSet.add(t.artist);
            if (t.genre) dislikedGenresSet.add(t.genre);
          }
        }

        const params = new URLSearchParams({
          title: currentTrack.title || "",
          artist: currentTrack.artist || "",
          genre: currentTrack.genre || "",
          duration: String(currentTrack.duration || 0),
          excludeId: currentTrack.id,
          limit: "8",
          dislikedIds: dislikedIds.join(","),
          dislikedArtists: [...dislikedArtistsSet].join(","),
          dislikedGenres: [...dislikedGenresSet].join(","),
        });

        const res = await fetch(`/api/music/similar?${params}`);
        const data = await res.json();
        const tracks: Track[] = (data.tracks || []).filter((t: Track) => t.id !== currentTrack.id);

        if (!cancelled) setSimilarTracks(tracks.slice(0, 8));
      } catch {
        // Fallback to simple artist search
        try {
          const res = await fetch(`/api/music/search?q=${encodeURIComponent(currentTrack.artist)}&limit=8`);
          const data = await res.json();
          const tracks: Track[] = (data.tracks || []).filter((t: Track) => t.id !== currentTrack.id);
          if (!cancelled) setSimilarTracks(tracks.slice(0, 6));
        } catch {
          if (!cancelled) setSimilarTracks([]);
        }
      } finally {
        if (!cancelled) setSimilarTracksLoading(false);
      }
    };
    fetchSimilar();
    return () => { cancelled = true; };
  }, [currentTrack, showSimilar, setSimilarTracks, setSimilarTracksLoading]);

  // ── Ambient visualization — style-aware, composite waves ──
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !isFullTrackViewOpen) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Default waves
    const waves = [
      { segs: 50, speed: 0.5, amp: 0.18, phase: 0, yOff: 0.3, alpha: 0.25, lw: 1.2 },
      { segs: 60, speed: 0.7, amp: 0.22, phase: 1.5, yOff: 0.5, alpha: 0.35, lw: 1.5 },
      { segs: 45, speed: 0.4, amp: 0.15, phase: 3.0, yOff: 0.65, alpha: 0.2, lw: 1.0 },
      { segs: 80, speed: 1.0, amp: 0.1, phase: 4.5, yOff: 0.45, alpha: 0.12, lw: 0.8 },
      { segs: 35, speed: 0.3, amp: 0.25, phase: 2.0, yOff: 0.8, alpha: 0.18, lw: 1.3 },
    ];
    const sparkles = Array.from({ length: 30 }, () => ({
      waveIdx: Math.floor(Math.random() * waves.length),
      xFrac: Math.random(),
      size: 1 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 2.0,
    }));

    // Japan petals for wave canvas
    interface WavePetal { x: number; y: number; size: number; speed: number; sway: number; phase: number; rot: number; rotSpeed: number; opacity: number; }
    const japanPetals: WavePetal[] = Array.from({ length: 20 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1200 - 600,
      size: 3 + Math.random() * 6, speed: 0.4 + Math.random() * 0.6,
      sway: 0.3 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.02,
      opacity: 0.15 + Math.random() * 0.35,
    }));

    // Swag constellation particles for wave canvas
    interface ConstellationNode { x: number; y: number; vx: number; vy: number; size: number; angle: number; rotSpeed: number; alpha: number; pulsePhase: number; }
    const swagConstellation: ConstellationNode[] = Array.from({ length: 35 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1200,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2,
      size: 1.5 + Math.random() * 3, angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.01, alpha: 0.08 + Math.random() * 0.2,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    // iPod scan dots removed for performance (CSS handles LCD effect)

    const draw = () => {
      waveAnimRef.current = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;

      const style = currentStyle || "default";

      // ═══════════════════════════════════════════════════════════════════
      // iPod 2001 wave: LCD grid + signal waveform + scanlines
      // ═══════════════════════════════════════════════════════════════════
      if (style === "ipod-2001") {
        // Blue backlight pulse (CSS handles LCD pixel grid)
        const pulseAlpha = 0.02 + 0.015 * Math.sin(0.8 * t);
        const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.4);
        glowGrad.addColorStop(0, `rgba(42,127,255,${pulseAlpha})`);
        glowGrad.addColorStop(1, "rgba(42,127,255,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Audio waveform lines (horizontal, different frequencies)
        for (let i = 0; i < 4; i++) {
          const yBase = h * (0.15 + i * 0.1);
          const amplitude = h * (0.02 + i * 0.005) * (1 + 0.5 * Math.sin(t * 0.3 + i));
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = yBase
              + Math.sin(t * (1.2 + i * 0.25) + xn * 6 + i * 1.5) * amplitude
              + Math.cos(t * (0.6 + i * 0.15) + xn * 4) * amplitude * 0.5
              + Math.sin(t * 2 + xn * 10) * amplitude * 0.2;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(42,127,255,${0.06 + (1 - i / 4) * 0.08})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Vertical scanline sweep
        const sweepX = (t * 0.08 % 1) * w;
        ctx.fillStyle = "rgba(42,127,255,0.03)";
        ctx.fillRect(sweepX - 2, 0, 4, h);

        // Bottom progress indicator
        const timeProgress = (t * 0.1) % 1;
        ctx.fillStyle = "rgba(42,127,255,0.06)";
        ctx.fillRect(w * 0.1, h * 0.94, w * 0.8, 2);
        ctx.fillStyle = "rgba(42,127,255,0.2)";
        ctx.fillRect(w * 0.1, h * 0.94, w * 0.8 * timeProgress, 2);

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Japan wave: ink wash waves + cherry blossom petals + koi
      // ═══════════════════════════════════════════════════════════════════
      if (style === "japan") {
        // Subtle vermillion radial glow
        const jpPulse = 0.02 + 0.015 * Math.sin(0.4 * t);
        const jpGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.3);
        jpGrad.addColorStop(0, `rgba(139,34,82,${jpPulse})`);
        jpGrad.addColorStop(1, "rgba(139,34,82,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = jpGrad;
        ctx.fill();

        // Three-layered ink wash waves
        for (let layer = 0; layer < 3; layer++) {
          const yBase = h * (0.55 + layer * 0.12);
          const speed = 0.3 + layer * 0.15;
          const freq = 0.004 + layer * 0.002;
          const alpha = 0.04 - layer * 0.01;

          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 3) {
            const y = yBase
              + Math.sin(t * speed + x * freq + layer) * h * 0.08
              + Math.sin(t * speed * 1.5 + x * freq * 2.5) * h * 0.03;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          const waveGrad = ctx.createLinearGradient(0, yBase - h * 0.1, 0, h);
          waveGrad.addColorStop(0, `rgba(139,34,82,${alpha})`);
          waveGrad.addColorStop(1, `rgba(139,34,82,${alpha * 0.2})`);
          ctx.fillStyle = waveGrad;
          ctx.fill();
        }

        // Red accent wave line (crisp)
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = h * 0.5 + Math.sin(t * 0.5 + x * 0.005) * h * 0.1
            + Math.sin(t * 0.8 + x * 0.012) * h * 0.05;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(139,34,82,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Koi fish silhouettes (2 fish)
        for (let k = 0; k < 2; k++) {
          const kx = w * (0.3 + k * 0.4) + Math.sin(t * 0.2 + k * 3) * w * 0.1;
          const ky = h * (0.4 + k * 0.15) + Math.sin(t * 0.15 + k * 2) * h * 0.08;
          const kAngle = Math.sin(t * 0.2 + k * 3) * 0.3;
          const kSize = 12 + k * 4;

          ctx.save();
          ctx.translate(kx, ky);
          ctx.rotate(kAngle);
          ctx.globalAlpha = 0.06 + k * 0.02;
          ctx.fillStyle = k === 0 ? "rgba(139,34,82,0.4)" : "rgba(255,120,100,0.3)";

          // Fish body (ellipse)
          ctx.beginPath();
          ctx.ellipse(0, 0, kSize * 1.5, kSize * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tail
          ctx.beginPath();
          ctx.moveTo(-kSize * 1.3, 0);
          ctx.lineTo(-kSize * 2.2, -kSize * 0.6);
          ctx.lineTo(-kSize * 2.2, kSize * 0.6);
          ctx.closePath();
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Cherry blossom petals (more varied)
        for (const p of japanPetals) {
          p.y += p.speed;
          p.x += Math.sin(t * p.sway + p.phase) * 0.5;
          p.rot += p.rotSpeed;
          if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
          if (p.x < -30) p.x = w + 15;
          if (p.x > w + 30) p.x = -15;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.opacity;

          ctx.fillStyle = "rgba(232,180,188,0.5)";
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(245,210,215,0.3)";
          ctx.beginPath();
          ctx.ellipse(p.size * 0.3, 0, p.size * 0.5, p.size * 0.3, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Floating kanji (right side, vertical)
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#1a1a1a";
        ctx.font = "16px serif";
        ctx.textAlign = "center";
        const chars = ["\u97f3", "\u697d", "\u98a8", "\u6708"];
        chars.forEach((ch, i) => {
          const cy = h * 0.2 + i * 28 + Math.sin(t * 0.3 + i) * 3;
          ctx.fillText(ch, w - 20, cy);
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Swag wave: Plasma Drift — flowing waves + chrome orbs + energy lines
      // ═══════════════════════════════════════════════════════════════════
      if (style === "swag") {
        // Deep black bg with subtle silver radial pulse
        const swPulse = 0.012 + 0.008 * Math.sin(0.35 * t);
        const swGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.4);
        swGrad.addColorStop(0, `rgba(176,176,184,${swPulse})`);
        swGrad.addColorStop(1, "rgba(176,176,184,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = swGrad;
        ctx.fill();

        // 6 flowing horizontal sine-composite wave lines
        const plasmaWaves = [
          { speed: 0.3, ampBase: 0.015, yOff: 0.15, alpha: 0.02, freq1: 2.5, freq2: 5.2 },
          { speed: 0.45, ampBase: 0.02, yOff: 0.3, alpha: 0.03, freq1: 3.0, freq2: 6.0 },
          { speed: 0.2, ampBase: 0.012, yOff: 0.45, alpha: 0.025, freq1: 2.0, freq2: 4.5 },
          { speed: 0.55, ampBase: 0.025, yOff: 0.58, alpha: 0.04, freq1: 3.5, freq2: 7.0 },
          { speed: 0.35, ampBase: 0.018, yOff: 0.72, alpha: 0.03, freq1: 2.8, freq2: 5.8 },
          { speed: 0.5, ampBase: 0.022, yOff: 0.88, alpha: 0.035, freq1: 3.2, freq2: 6.5 },
        ];
        for (const pw of plasmaWaves) {
          const ampMul = isPlaying ? 2.5 : 1;
          const amp = h * pw.ampBase * ampMul;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = pw.yOff * h
              + Math.sin(t * pw.speed + xn * pw.freq1 * Math.PI) * amp
              + Math.sin(t * pw.speed * 1.6 + xn * pw.freq2 * Math.PI) * amp * 0.4
              + Math.cos(t * pw.speed * 0.7 + xn * 2) * amp * 0.2;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(176,176,184,${pw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 15 floating chrome orbs drifting slowly upward
        const orbCount = 15;
        for (let oi = 0; oi < orbCount; oi++) {
          const orbX = w * ((oi * 0.618 + t * 0.008 * (0.3 + oi * 0.04)) % 1);
          const orbY = h - ((t * (0.02 + oi * 0.005) + oi * 0.07) % 1) * h;
          const orbR = 2 + (oi % 4);
          const orbAlpha = 0.03 + 0.05 * Math.sin(t * 0.5 + oi * 1.7);
          const orbGrad = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbR);
          orbGrad.addColorStop(0, `rgba(208,208,216,${orbAlpha})`);
          orbGrad.addColorStop(1, `rgba(176,176,184,0)`);
          ctx.beginPath();
          ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
          ctx.fillStyle = orbGrad;
          ctx.fill();
        }

        // 8 thin vertical gradient energy lines drifting horizontally
        for (let ei = 0; ei < 8; ei++) {
          const eX = w * ((ei * 0.125 + t * 0.006 * (0.5 + ei * 0.1)) % 1);
          const eY = h * (0.15 + ei * 0.1);
          const eH = 40 + (ei % 3) * 20;
          const eAlpha = 0.015 + 0.015 * Math.sin(t * 0.4 + ei * 2);
          const eGrad = ctx.createLinearGradient(eX, eY, eX, eY + eH);
          eGrad.addColorStop(0, `rgba(176,176,184,0)`);
          eGrad.addColorStop(0.3, `rgba(176,176,184,${eAlpha})`);
          eGrad.addColorStop(0.7, `rgba(176,176,184,${eAlpha})`);
          eGrad.addColorStop(1, `rgba(176,176,184,0)`);
          ctx.fillStyle = eGrad;
          ctx.fillRect(eX - 0.5, eY, 1, eH);
        }

        // Constellation nodes — simple circles (cheaper than hexagons)
        for (const node of swagConstellation) {
          node.x += node.vx;
          node.y += node.vy;
          node.angle += node.rotSpeed;
          // Wrap around
          if (node.x < -20) node.x = w + 20;
          if (node.x > w + 20) node.x = -20;
          if (node.y < -20) node.y = h + 20;
          if (node.y > h + 20) node.y = -20;

          const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + node.pulsePhase);
          const a = node.alpha * pulse;

          // Simple circle node
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(208,208,216,${a * 0.5})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(176,176,184,${a})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Constellation lines between nearby nodes (<100px)
        for (let i = 0; i < swagConstellation.length; i++) {
          for (let j = i + 1; j < swagConstellation.length; j++) {
            const dx = swagConstellation[i].x - swagConstellation[j].x;
            const dy = swagConstellation[i].y - swagConstellation[j].y;
            const distSq = dx * dx + dy * dy;
            const maxDist = 100;
            if (distSq < maxDist * maxDist) {
              const dist = Math.sqrt(distSq);
              const lineAlpha = (1 - dist / maxDist) * 0.03;
              ctx.beginPath();
              ctx.moveTo(swagConstellation[i].x, swagConstellation[i].y);
              ctx.lineTo(swagConstellation[j].x, swagConstellation[j].y);
              ctx.strokeStyle = `rgba(176,176,184,${lineAlpha})`;
              ctx.lineWidth = 0.3;
              ctx.stroke();
            }
          }
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Neon wave: Neon Pulse — green radial pulse + neon wave lines + dots + scan
      // ═══════════════════════════════════════════════════════════════════
      if (style === "neon") {
        // Subtle green radial pulse
        const neonPulse = 0.015 + 0.01 * Math.sin(0.4 * t);
        const neonGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.35);
        neonGrad.addColorStop(0, `rgba(0,255,136,${neonPulse})`);
        neonGrad.addColorStop(1, "rgba(0,255,136,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = neonGrad;
        ctx.fill();

        // 4 horizontal neon wave lines at low alpha
        const neonWaves = [
          { speed: 0.25, ampBase: 0.012, yOff: 0.2, alpha: 0.03, freq: 2.5 },
          { speed: 0.4, ampBase: 0.018, yOff: 0.38, alpha: 0.05, freq: 3.2 },
          { speed: 0.3, ampBase: 0.014, yOff: 0.6, alpha: 0.04, freq: 2.8 },
          { speed: 0.5, ampBase: 0.02, yOff: 0.8, alpha: 0.06, freq: 3.8 },
        ];
        for (const nw of neonWaves) {
          const ampMul = isPlaying ? 2 : 1;
          const amp = h * nw.ampBase * ampMul;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = nw.yOff * h
              + Math.sin(t * nw.speed + xn * nw.freq * Math.PI) * amp
              + Math.sin(t * nw.speed * 1.6 + xn * nw.freq * 1.5 * Math.PI) * amp * 0.3;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(0,255,136,${nw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 12 floating neon dots that drift slowly
        for (let di = 0; di < 12; di++) {
          const dx = w * ((di * 0.618 + t * 0.006 * (0.3 + di * 0.04)) % 1);
          const dy = h * (0.1 + ((di * 0.381 + t * 0.004 * (0.2 + di * 0.03)) % 0.8));
          const dSize = 2 + (di % 3);
          const dAlpha = 0.02 + 0.03 * Math.sin(t * 0.5 + di * 1.7);
          const color = di % 3 === 0 ? `rgba(255,0,102,${dAlpha})` : `rgba(0,255,136,${dAlpha})`;
          const gGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dSize * 2);
          if (di % 3 === 0) {
            gGrad.addColorStop(0, `rgba(255,0,102,${dAlpha})`);
            gGrad.addColorStop(1, "rgba(255,0,102,0)");
          } else {
            gGrad.addColorStop(0, `rgba(0,255,136,${dAlpha})`);
            gGrad.addColorStop(1, "rgba(0,255,136,0)");
          }
          ctx.fillStyle = gGrad;
          ctx.beginPath();
          ctx.arc(dx, dy, dSize * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dx, dy, dSize * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Occasional vertical scan line that sweeps across
        const sweepX = ((t * 0.06) % 1) * w;
        const scanGrad = ctx.createLinearGradient(sweepX - 2, 0, sweepX + 2, 0);
        scanGrad.addColorStop(0, "rgba(0,255,136,0)");
        scanGrad.addColorStop(0.5, "rgba(0,255,136,0.04)");
        scanGrad.addColorStop(1, "rgba(0,255,136,0)");
        ctx.fillStyle = scanGrad;
        ctx.fillRect(sweepX - 3, 0, 6, h);

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Minimal wave: Minimal Drift — light bg + 2 sine waves + 6 dots
      // ═══════════════════════════════════════════════════════════════════
      if (style === "minimal") {
        // 2 horizontal sine wave lines at very low alpha
        const minWaves = [
          { speed: 0.2, ampBase: 0.008, yOff: 0.35, alpha: 0.04, freq: 1.8 },
          { speed: 0.35, ampBase: 0.01, yOff: 0.65, alpha: 0.05, freq: 2.5 },
        ];
        for (const mw of minWaves) {
          const amp = h * mw.ampBase;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const xn = x / w;
            const y = mw.yOff * h
              + Math.sin(t * mw.speed + xn * mw.freq * Math.PI) * amp;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(17,17,17,${mw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 6 small dots that drift slowly
        for (let mi = 0; mi < 6; mi++) {
          const mx = w * ((mi * 0.618 + t * 0.005 * (0.2 + mi * 0.03)) % 1);
          const my = h * (0.15 + ((mi * 0.381 + t * 0.003 * (0.15 + mi * 0.02)) % 0.7));
          const mSize = 1.5 + (mi % 2);
          const mAlpha = 0.06 + 0.04 * Math.sin(t * 0.4 + mi * 1.5);
          ctx.beginPath();
          ctx.arc(mx, my, mSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(17,17,17,${mAlpha})`;
          ctx.fill();
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Default: aurora/nebula waves + floating sparkles + energy trails
      // ═══════════════════════════════════════════════════════════════════
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      let r = 224, g = 49, b = 49;
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        r = parseInt(accentColor.slice(1, 3), 16);
        g = parseInt(accentColor.slice(3, 5), 16);
        b = parseInt(accentColor.slice(5, 7), 16);
      }

      // Central radial glow pulse — larger, more nebula-like
      const pulseAlpha = 0.05 + 0.04 * Math.sin(0.6 * t);
      const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.45);
      glowGrad.addColorStop(0, `rgba(${r},${g},${b},${pulseAlpha})`);
      glowGrad.addColorStop(0.5, `rgba(${r},${g},${b},${pulseAlpha * 0.3})`);
      glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.45, Math.max(w, h) * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Aurora-style gradient waves (thicker, more layered)
      for (const wave of waves) {
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < wave.segs; i++) {
          const x = (i / (wave.segs - 1)) * w;
          const xn = i / (wave.segs - 1);
          const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
            + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
            + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
          const y = wave.yOff * h - yNorm * wave.amp * h;
          points.push({ x, y });
        }

        // Thick glow layer
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.2})`;
        ctx.lineWidth = wave.lw + 8;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Main line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Gradient fill below wave
        const gradient = ctx.createLinearGradient(0, (wave.yOff - wave.amp) * h, 0, h);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.06})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Energy trails — flowing vertical particles
      const trailCount = 15;
      for (let i = 0; i < trailCount; i++) {
        const tx = w * ((i * 0.618 + t * 0.01) % 1);
        const trailLen = h * 0.15 + h * 0.1 * Math.sin(t * 0.5 + i * 2);
        const ty = h * 0.2 + Math.sin(t * 0.3 + i) * h * 0.3;
        const trailAlpha = 0.03 + 0.02 * Math.sin(t + i * 1.5);

        const trailGrad = ctx.createLinearGradient(tx, ty, tx, ty + trailLen);
        trailGrad.addColorStop(0, `rgba(${r},${g},${b},${trailAlpha})`);
        trailGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = trailGrad;
        ctx.fillRect(tx - 0.5, ty, 1, trailLen);
      }

      // Floating sparkles on waves
      for (const sp of sparkles) {
        const wave = waves[sp.waveIdx];
        const xn = sp.xFrac;
        const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
          + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
          + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
        const px = xn * w;
        const py = wave.yOff * h - yNorm * wave.amp * h;
        const tw = 0.2 + 0.8 * Math.pow(Math.sin(t * sp.twinkle + sp.phase), 2);
        const alpha = tw * 0.6;
        const size = sp.size * (0.5 + tw * 0.5);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }
    };
    draw();
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); };
  }, [isFullTrackViewOpen, currentTrack?.id, currentStyle]);

  // Fetch release radar when component mounts and liked tracks are available
  useEffect(() => {
    if (likedTracksData.length > 0 && releaseRadarTracks.length === 0) {
      fetchReleaseRadar();
    }
  }, [likedTracksData.length]);

  // ── Sleep timer ──────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimerActive) return;
    const interval = setInterval(updateSleepTimer, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerActive, updateSleepTimer]);

  // Progress drag
  const seekToPosition = useCallback((clientX: number) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setProgress(pct * duration);
    const audio = getAudioElement();
    if (audio) audio.currentTime = pct * duration;
  }, [duration, setProgress]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    seekToPosition(e.clientX);
    const handleMouseMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [seekToPosition]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekToPosition(e.touches[0].clientX);
    const handleTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekToPosition(ev.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setIsDragging(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [seekToPosition]);

  const handleVolumeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setVolume(Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100))));
  }, [setVolume]);

  // Download track via fetch+blob
  const handleDownload = useCallback(async () => {
    const track = useAppStore.getState().currentTrack;
    if (!track) return;
    const audio = getAudioElement();
    if (audio && audio.src) {
      try {
        const res = await fetch(audio.src);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.artist} - ${track.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        const a = document.createElement('a');
        a.href = audio.src;
        a.download = `${track.artist} - ${track.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
  }, []);

  if (!currentTrack || !isFullTrackViewOpen) return null;

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const safeLikedIds = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const safeDislikedIds = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const isLiked = currentTrack ? safeLikedIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? safeDislikedIds.includes(currentTrack.id) : false;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ backgroundColor: "var(--mq-bg)" }}
      >
        {/* Wave line visualization canvas — behind everything */}
        <canvas
          ref={waveCanvasRef}
          className="absolute inset-0 z-[1] w-full h-full pointer-events-none"
          style={{ opacity: isPlaying ? 0.7 : 0.15, transition: "opacity 0.5s" }}
        />

        {/* Blurred background */}
        <div className="absolute inset-0 z-0" style={{ pointerEvents: "none" }}>
          {currentPlaylistId ? (
            <>
              <PlaylistArtwork
                playlistId={currentPlaylistId}
                size={400}
                rounded="rounded-none"
                className="!w-[150%] !h-[150%] !-top-[25%] !-left-[25%]"
                animated={true}
                isPlaying={isPlaying}
              />
              <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.7 }} />
            </>
          ) : (
            <>
              {currentTrack.cover && (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover blur-3xl opacity-20 scale-110" />
              )}
              <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.85 }} />
            </>
          )}
        </div>

        {/* Canvas visualization (Spotify-like video background) */}
        {canvasMode && (
          <TrackCanvas isActive={canvasMode} isPlaying={isPlaying} currentStyle={currentStyle} styleVariant={styleVariant} />
        )}

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setFullTrackViewOpen(false); setShowSimilar(false); setShowComments(false); }}
            className="p-2" style={{ color: "var(--mq-text)" }}>
            <ChevronLeft className="w-6 h-6" />
          </motion.button>
          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
            Сейчас играет
          </span>
          <motion.button whileTap={{ scale: 0.9 }} onClick={async () => {
            if (isPiPActive) {
              closePiPPopup();
              setPiPActive(false);
            } else {
              const opened = await openPiPPopup();
              setPiPActive(true, opened ? 'popup' : 'overlay');
            }
          }}
            className="p-2" style={{ color: isPiPActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} title="Мини-плеер">
            <PictureInPicture2 className="w-5 h-5" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleDownload}
            className="p-2" style={{ color: "var(--mq-text-muted)" }} title="Скачать">
            <Download className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto w-full">
          {/* Album art — hidden when canvas mode is active (canvas draws its own cover) */}
          {!canvasMode && (
            <motion.div
              initial={animationsEnabled ? { scale: 0.8, opacity: 0 } : undefined}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mb-8 flex items-center justify-center"
            >
              <div className="w-56 h-56 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl relative z-10"
                style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                {currentPlaylistId ? (
                  <PlaylistArtwork
                    playlistId={currentPlaylistId}
                    size={320}
                    rounded="rounded-none"
                    className="!w-full !h-full"
                    animated={true}
                    isPlaying={isPlaying}
                  />
                ) : (
                  <img src={currentTrack.cover} alt={currentTrack.album} className="w-full h-full object-cover" />
                )}
              </div>
            </motion.div>
          )}
          {/* Invisible spacer to keep layout stable when canvas hides album art */}
          {canvasMode && <div className="mb-8" style={{ height: "clamp(14rem, 40vh, 20rem)" }} />}

          {/* Track info */}
          <div className="text-center mb-6 w-full">
            <h2 className="text-xl font-bold mb-1 truncate" style={{ color: "var(--mq-text)" }}>
              {currentTrack.title}
            </h2>
            <p className="text-sm mb-1 truncate" style={{ color: "var(--mq-text-muted)" }}>
              {currentTrack.artist}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
              {currentTrack.album}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full mb-6">
            <div ref={progressRef}
              onMouseDown={handleProgressMouseDown}
              onTouchStart={handleProgressTouchStart}
              className="w-full h-2 rounded-full cursor-pointer relative"
              style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full transition-all duration-100"
                style={{ width: `${progressPct}%`, backgroundColor: "var(--mq-accent)", boxShadow: "0 0 8px var(--mq-glow)" }} />
              <div className="absolute top-1/2 w-4 h-4 rounded-full"
                style={{ left: `${progressPct}%`, backgroundColor: "var(--mq-accent)", transform: "translate(-50%, -50%)", boxShadow: "0 0 8px var(--mq-glow)" }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(Math.floor(progress))}</span>
              <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => currentTrack && toggleLike(currentTrack.id, currentTrack)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isLiked ? "rgba(239,68,68,0.15)" : "var(--mq-card)",
                border: `1px solid ${isLiked ? "rgba(239,68,68,0.4)" : "var(--mq-border)"}`,
                color: isLiked ? "#ef4444" : "var(--mq-text-muted)",
              }}>
              <Heart className={`w-[18px] h-[18px] ${isLiked ? "fill-current" : ""}`} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => currentTrack && toggleDislike(currentTrack.id, currentTrack)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "var(--mq-card)",
                border: `1px solid ${isDisliked ? "rgba(239,68,68,0.4)" : "var(--mq-border)"}`,
                color: isDisliked ? "#ef4444" : "var(--mq-text-muted)",
              }}>
              <ThumbsDown className={`w-[18px] h-[18px] ${isDisliked ? "fill-current" : ""}`} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showSimilar ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showSimilar ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <ListMusic className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showLyrics ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showLyrics ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <FileText className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); setShowDNA(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showComments ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showComments ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <MessageSquare className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowDNA(!showDNA); setShowSimilar(false); setShowLyrics(false); setShowComments(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showDNA ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showDNA ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <Dna className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCanvasMode(!canvasMode)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: canvasMode ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: canvasMode ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <Sparkles className="w-[18px] h-[18px]" />
            </motion.button>
            {/* Wave Mode Button */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => toggleRadioMode()}
              title={radioMode ? "Выключить волну" : "Волна"}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: radioMode ? "var(--mq-accent)" : "var(--mq-card)",
                border: radioMode ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                color: radioMode ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
            >
              <Waves className="w-[18px] h-[18px]" />
            </motion.button>
            <button onClick={() => setVolume(volume > 0 ? 0 : 70)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}>
              {volume === 0 ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
            </button>
            {/* Sleep timer */}
            <div className="relative">
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowSleepTimer(!showSleepTimer)}
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center relative"
                style={{
                  backgroundColor: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-card)",
                  border: `1px solid ${sleepTimerActive ? "var(--mq-accent)" : "var(--mq-border)"}`,
                  color: sleepTimerActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                }}>
                <Moon className="w-[18px] h-[18px]" />
                {sleepTimerActive && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full text-[8px] flex items-center justify-center"
                    style={{ backgroundColor: "var(--mq-text)", color: "var(--mq-accent)" }}>
                    {Math.floor(sleepTimerRemaining / 60)}
                  </span>
                )}
              </motion.button>
              <AnimatePresence>
                {showSleepTimer && (
                  <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center"
                    onClick={() => setShowSleepTimer(false)}>
                    <div className="absolute inset-0 bg-black/40" />
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative z-10 p-4 rounded-2xl w-56 shadow-xl"
                      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
                      onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs font-medium mb-3 text-center" style={{ color: "var(--mq-text-muted)" }}>Таймер сна</p>
                      {sleepTimerActive ? (
                        <div className="space-y-3">
                          <p className="text-lg text-center font-mono" style={{ color: "var(--mq-accent)" }}>
                            {Math.floor(sleepTimerRemaining / 60)}:{(sleepTimerRemaining % 60).toString().padStart(2, "0")}
                          </p>
                          <button onClick={() => { stopSleepTimer(); setShowSleepTimer(false); }}
                            className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm"
                            style={{ backgroundColor: "rgba(224,49,49,0.15)", color: "#ff6b6b" }}>
                            <X className="w-4 h-4" /> Отменить
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {[15, 30, 45, 60].map((m) => (
                            <button key={m} onClick={() => { startSleepTimer(m); setShowSleepTimer(false); }}
                              className="flex items-center justify-center gap-1 py-3 rounded-xl text-sm"
                              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}>
                              <Clock className="w-3.5 h-3.5" /> {m} мин
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Main playback controls */}
          <div className="flex items-center gap-6 mb-4">
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle}
              style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              <Shuffle className="w-5 h-5" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={prevTrack} style={{ color: "var(--mq-text)" }}>
              <SkipBack className="w-6 h-6" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={togglePlay}
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", boxShadow: isPlaying ? "0 0 30px var(--mq-glow)" : "none" }}>
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={nextTrack} style={{ color: "var(--mq-text)" }}>
              <SkipForward className="w-6 h-6" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat}
              style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </motion.button>
          </div>

          {/* Volume slider — scroll-safe */}
          <div
            ref={volumeSectionRef}
            className="flex items-center gap-3 w-full max-w-xs"
          >
            <div ref={volumeRef} onClick={handleVolumeClick}
              className="flex-1 h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full" style={{ width: `${volume}%`, backgroundColor: "var(--mq-accent)" }} />
            </div>
            <span className="text-[10px] w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span>
          </div>
        </div>

        {/* Lyrics panel — slides up from bottom */}
        <AnimatePresence>
          {showLyrics && (
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "50vh", backgroundColor: "var(--mq-card)", borderTop: "1px solid var(--mq-border)" }}>
              <div className="flex items-center justify-between p-4 pb-2">
                <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>Текст песни</h3>
                <button onClick={() => setShowLyrics(false)} style={{ color: "var(--mq-text-muted)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {lyricsLoading ? (
                <div className="px-4 pb-4 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-4 rounded animate-pulse" style={{ backgroundColor: "var(--mq-input-bg)", width: `${60 + Math.random() * 40}%` }} />
                  ))}
                </div>
              ) : lyricsLines.length > 0 ? (
                <div ref={lyricsScrollRef} className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "40vh" }}>
                  {lyricsLines.map((line, i) => (
                    <p key={i}
                      ref={activeLineIndex === i ? activeLineRef : undefined}
                      className="py-1.5 text-sm transition-all duration-300 cursor-pointer hover:opacity-80"
                      style={{
                        fontSize: activeLineIndex === i ? "1rem" : "0.875rem",
                        fontWeight: activeLineIndex === i ? 600 : 400,
                        color: activeLineIndex === i ? "var(--mq-accent)" :
                          i < activeLineIndex ? "var(--mq-text-muted)" : "rgba(128,128,128,0.4)",
                        transform: activeLineIndex === i ? "scale(1.02)" : "scale(1)",
                      }}
                      onClick={() => {
                        const audio = getAudioElement();
                        if (audio) { audio.currentTime = line.time; setProgress(line.time); }
                      }}
                    >
                      {line.text || "\u266A"}
                    </p>
                  ))}
                </div>
              ) : lyricsPlainText ? (
                <div className="overflow-y-auto px-4 pb-4 whitespace-pre-line" style={{ maxHeight: "40vh" }}>
                  {lyricsPlainText.split("\n").map((line, i) => (
                    <p key={i} className="py-1 text-sm" style={{ color: "var(--mq-text-muted)" }}>{line}</p>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                  <p className="text-sm mb-4" style={{ color: "var(--mq-text-muted)" }}>
                    Текст не найден автоматически
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => window.open(`https://genius.com/search?q=${encodeURIComponent((currentTrack?.title || "") + " " + (currentTrack?.artist || ""))}`, "_blank")}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                      <ExternalLink className="w-3 h-3" /> Genius
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.95 }}
                      onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((currentTrack?.title || "") + " " + (currentTrack?.artist || "") + " lyrics текст")}`, "_blank")}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}>
                      <ExternalLink className="w-3 h-3" /> Google
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Track comments panel */}
        {currentTrack.scTrackId && (
          <TrackCommentsPanel
            trackId={currentTrack.scTrackId}
            currentProgress={progress}
            onSeek={(time) => {
              setProgress(time);
              const audio = getAudioElement();
              if (audio) audio.currentTime = time;
            }}
            isOpen={showComments}
            onClose={() => setShowComments(false)}
          />
        )}

        {/* Similar tracks panel */}
        <AnimatePresence>
          {showSimilar && (
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring" as const, damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "55vh", backgroundColor: "var(--mq-card)", borderTop: "1px solid var(--mq-border)" }}>
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--mq-text)" }}>
                    Похожие треки
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(224,49,49,0.1)", color: "var(--mq-accent)" }}>AI</span>
                  </h3>
                  <button onClick={() => setShowSimilar(false)} style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Drag handle */}
                <div className="flex justify-center mb-2">
                  <div className="w-8 h-1 rounded-full" style={{ backgroundColor: "var(--mq-border)" }} />
                </div>
              </div>

              {similarTracksLoading ? (
                <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                  ))}
                </div>
              ) : similarTracks.length > 0 ? (
                <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: "42vh" }}>
                  {/* Compact grid of similar tracks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {similarTracks.map((track, i) => (
                      <motion.div
                        key={track.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.25 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => playTrack(track, similarTracks)}
                        onContextMenu={(e) => e.preventDefault()}
                        className="flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-colors duration-150 group relative overflow-hidden"
                        style={{
                          backgroundColor: currentTrack?.id === track.id ? "var(--mq-accent)" : "transparent",
                          border: `1px solid ${currentTrack?.id === track.id ? "var(--mq-accent)" : "var(--mq-border)"}`,
                        }}
                      >
                        {/* Mini cover */}
                        <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                            {currentTrack?.id === track.id && isPlaying
                              ? <Pause className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                              : <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: "#fff" }} />}
                          </div>
                          {currentTrack?.id === track.id && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity"
                              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                              <Pause className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                            </div>
                          )}
                        </div>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] sm:text-xs font-medium truncate leading-tight"
                            style={{ color: currentTrack?.id === track.id ? "var(--mq-text)" : "var(--mq-text)" }}>
                            {track.title}
                          </p>
                          <p className="text-[10px] truncate mt-0.5"
                            style={{ color: currentTrack?.id === track.id ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
                            {track.artist}
                          </p>
                          {track.genre && (
                            <span className="inline-block text-[9px] mt-1 px-1.5 py-0.5 rounded-md truncate max-w-full"
                              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--mq-text-muted)" }}>
                              {track.genre}
                            </span>
                          )}
                        </div>

                        {/* Quick actions */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
                            className="p-1 rounded-lg active:scale-90 transition-transform"
                            style={{ color: (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? "#ef4444" : "var(--mq-text-muted)" }}>
                            <Heart className="w-3.5 h-3.5" style={(Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? { fill: "#ef4444" } : {}} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDislike(track.id, track); }}
                            className="p-1 rounded-lg active:scale-90 transition-transform"
                            style={{ color: (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? "#ef4444" : "var(--mq-text-muted)" }}>
                            <ThumbsDown className="w-3 h-3.5" style={(Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? { fill: "#ef4444" } : {}} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Release Radar — New releases from liked artists */}
                  {releaseRadarTracks.length > 0 && (
                    <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--mq-border)" }}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Sparkles className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                        <h4 className="text-xs font-bold" style={{ color: "var(--mq-text)" }}>
                          Новые релизы
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {releaseRadarTracks.slice(0, 4).map((track, i) => (
                          <motion.div
                            key={track.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05, duration: 0.2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => playTrack(track, releaseRadarTracks)}
                            className="flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-colors duration-150 group"
                            style={{ border: "1px solid var(--mq-border)" }}
                          >
                            <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                              <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                                <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: "#fff" }} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] sm:text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                              <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
                              className="p-1 rounded-lg active:scale-90 transition-transform flex-shrink-0"
                              style={{ color: (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? "#ef4444" : "var(--mq-text-muted)" }}>
                              <Heart className="w-3.5 h-3.5" style={(Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? { fill: "#ef4444" } : {}} />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 pb-4">
                  <p className="text-xs text-center py-6" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить похожие треки</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Song DNA panel */}
        <SongDNA
          track={currentTrack}
          isOpen={showDNA}
          onClose={() => setShowDNA(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
}
