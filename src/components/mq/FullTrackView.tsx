"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, X, Heart, ThumbsDown, ListMusic, Music, ChevronLeft, FileText, ExternalLink, Download, Moon, Clock, MessageSquare, Sparkles
} from "lucide-react";
import { formatDuration, searchTracks, type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { getAudioElement, resumeAudioContext } from "@/lib/audioEngine";
import TrackCommentsPanel from "./TrackCommentsPanel";
import TrackCanvas from "./TrackCanvas";

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
    currentStyle,
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

    // Swag gold particles for wave canvas
    interface WaveGoldParticle { x: number; y: number; vx: number; vy: number; size: number; life: number; maxLife: number; }
    const swagGoldParticles: WaveGoldParticle[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * 2000, y: 600 + Math.random() * 600,
      vx: (Math.random() - 0.5) * 2, vy: -(0.5 + Math.random() * 2),
      size: 1 + Math.random() * 3, life: Math.random() * 100,
      maxLife: 60 + Math.random() * 100,
    }));

    // iPod scanline particles
    interface ScanDot { x: number; y: number; targetAlpha: number; alpha: number; }
    const ipodScanDots: ScanDot[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1200,
      targetAlpha: 0.1 + Math.random() * 0.3, alpha: 0,
    }));

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
      // iPod 2001 wave: monochrome blue signal bars + scanline dots
      // ═══════════════════════════════════════════════════════════════════
      if (style === "ipod-2001") {
        // Subtle pulsing blue glow center
        const pulseAlpha = 0.02 + 0.015 * Math.sin(0.8 * t);
        const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.35);
        glowGrad.addColorStop(0, `rgba(42,127,255,${pulseAlpha})`);
        glowGrad.addColorStop(1, "rgba(42,127,255,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Thin horizontal signal lines
        for (let i = 0; i < 5; i++) {
          const yBase = h * (0.2 + i * 0.15);
          ctx.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const xn = x / w;
            const y = yBase + Math.sin(t * (1.5 + i * 0.3) + xn * 8 + i * 2) * h * 0.04
              + Math.cos(t * (0.7 + i * 0.2) + xn * 5) * h * 0.02;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(42,127,255,${0.08 + i * 0.02})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Scanline dots flickering
        for (const dot of ipodScanDots) {
          dot.alpha += (dot.targetAlpha - dot.alpha) * 0.05;
          if (Math.random() > 0.98) dot.targetAlpha = Math.random() > 0.5 ? 0.2 + Math.random() * 0.3 : 0;
          ctx.fillStyle = `rgba(42,127,255,${dot.alpha})`;
          ctx.fillRect(dot.x % w, dot.y % h, 2, 2);
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Japan wave: ink wash waves + cherry blossom petals
      // ═══════════════════════════════════════════════════════════════════
      if (style === "japan") {
        // Ink wash wave at bottom
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const y = h * 0.75 + Math.sin(t * 0.5 + x * 0.005) * h * 0.1
            + Math.sin(t * 0.8 + x * 0.012) * h * 0.05;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const waveGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
        waveGrad.addColorStop(0, "rgba(196,30,58,0.04)");
        waveGrad.addColorStop(1, "rgba(196,30,58,0.01)");
        ctx.fillStyle = waveGrad;
        ctx.fill();

        // Second ink wave (lighter, higher)
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const y = h * 0.6 + Math.sin(t * 0.3 + x * 0.007 + 1) * h * 0.08
            + Math.cos(t * 0.6 + x * 0.01) * h * 0.04;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const waveGrad2 = ctx.createLinearGradient(0, h * 0.5, 0, h);
        waveGrad2.addColorStop(0, "rgba(196,30,58,0.02)");
        waveGrad2.addColorStop(1, "rgba(196,30,58,0.005)");
        ctx.fillStyle = waveGrad2;
        ctx.fill();

        // Red accent wave line
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = h * 0.55 + Math.sin(t * 0.5 + x * 0.005) * h * 0.1
            + Math.sin(t * 0.8 + x * 0.012) * h * 0.05;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(196,30,58,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cherry blossom petals
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

        // Subtle vermillion radial glow
        const jpPulse = 0.02 + 0.015 * Math.sin(0.4 * t);
        const jpGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.3);
        jpGrad.addColorStop(0, `rgba(196,30,58,${jpPulse})`);
        jpGrad.addColorStop(1, "rgba(196,30,58,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = jpGrad;
        ctx.fill();

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Swag wave: minimal silver lines + floating dots
      // ═══════════════════════════════════════════════════════════════════
      if (style === "swag") {
        // Subtle silver glow pulse
        const swPulse = 0.015 + 0.01 * Math.sin(0.4 * t);
        const swGrad = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.35);
        swGrad.addColorStop(0, `rgba(161,161,170,${swPulse})`);
        swGrad.addColorStop(1, "rgba(161,161,170,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.55, Math.max(w, h) * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = swGrad;
        ctx.fill();

        // Clean silver horizontal lines
        const lineCount = 12;
        for (let i = 0; i < lineCount; i++) {
          const dist = Math.abs(i - lineCount / 2) / (lineCount / 2);
          const y = h * 0.2 + (h * 0.6) * (i / lineCount);
          const xAmp = w * 0.35 * (1 - dist * 0.5);
          const xCenter = w * 0.5;

          ctx.beginPath();
          for (let x = -1; x <= 1; x += 0.02) {
            const px = xCenter + x * xAmp;
            const wave = Math.sin(t * (1.5 + i * 0.12) + x * 5 + i) * 5 * (1 - dist * 0.4);
            if (x <= -0.99) ctx.moveTo(px, y + wave); else ctx.lineTo(px, y + wave);
          }
          ctx.strokeStyle = `rgba(161,161,170,${0.04 + (1 - dist) * 0.05})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Subtle floating silver dots
        for (const p of swagGoldParticles) {
          p.x += p.vx;
          p.y += p.vy;
          p.life++;
          if (p.life > p.maxLife || p.y < -20) {
            p.x = Math.random() * w;
            p.y = h + 10;
            p.life = 0;
            p.maxLife = 80 + Math.random() * 120;
            p.vy = -(0.3 + Math.random() * 1);
            p.vx = (Math.random() - 0.5) * 0.8;
          }
          const lifeRatio = 1 - p.life / p.maxLife;
          const alpha = lifeRatio < 0.2 ? lifeRatio / 0.2 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);
          ctx.fillStyle = `rgba(161,161,170,${alpha * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Default: original accent-colored waves + sparkles
      // ═══════════════════════════════════════════════════════════════════
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      let r = 224, g = 49, b = 49;
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        r = parseInt(accentColor.slice(1, 3), 16);
        g = parseInt(accentColor.slice(3, 5), 16);
        b = parseInt(accentColor.slice(5, 7), 16);
      }

      // Central radial glow pulse
      const pulseAlpha = 0.04 + 0.03 * Math.sin(0.6 * t);
      const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.35);
      glowGrad.addColorStop(0, `rgba(${r},${g},${b},${pulseAlpha})`);
      glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

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

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.25})`;
        ctx.lineWidth = wave.lw + 5;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, (wave.yOff - wave.amp) * h, 0, h);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.08})`);
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
          {currentTrack.cover && (
            <img src={currentTrack.cover} alt="" className="w-full h-full object-cover blur-3xl opacity-20 scale-110" />
          )}
          <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.85 }} />
        </div>

        {/* Canvas visualization (Spotify-like video background) */}
        {canvasMode && (
          <TrackCanvas isActive={canvasMode} isPlaying={isPlaying} currentStyle={currentStyle} />
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
                <img src={currentTrack.cover} alt={currentTrack.album} className="w-full h-full object-cover" />
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
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowSimilar(!showSimilar); setShowLyrics(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showSimilar ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showSimilar ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <ListMusic className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showLyrics ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showLyrics ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <FileText className="w-[18px] h-[18px]" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); }}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: showComments ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: showComments ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              <MessageSquare className="w-[18px] h-[18px]" />
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
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "50vh", backgroundColor: "var(--mq-card)", borderTop: "1px solid var(--mq-border)" }}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--mq-text)" }}>
                    Похожие треки
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(224,49,49,0.1)", color: "var(--mq-accent)" }}>AI</span>
                  </h3>
                  <button onClick={() => setShowSimilar(false)} style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {similarTracksLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                    ))}
                  </div>
                ) : similarTracks.length > 0 ? (
                  <div className="space-y-1 overflow-y-auto" style={{ maxHeight: "35vh" }}>
                    {similarTracks.map((track, i) => (
                      <TrackCard key={track.id} track={track} index={i} queue={similarTracks} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить похожие треки</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
