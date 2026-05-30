"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAnalyser, getFrequencyData, recordFrameTime } from "@/lib/audioEngine";

interface VisualizerCanvasProps {
  currentStyle: string;
  styleVariant: string;
  trackId?: string;
}

export default function VisualizerCanvas({ currentStyle, styleVariant, trackId }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniEqRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const isPlayingRef = useRef(false);

  // Sync isPlaying ref
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      isPlayingRef.current = state.isPlaying;
    });
    isPlayingRef.current = useAppStore.getState().isPlaying;
    return unsub;
  }, []);

  // ── Style-Aware Canvas Visualization ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;

    // Helper: resize canvas to match display
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    // Helper: get accent color RGB — cached for 60fps, refreshed every 2s
    let cachedAccent = { r: 224, g: 49, b: 49 };
    const updateCachedAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        cachedAccent = { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
      }
    };
    updateCachedAccent();
    const accentInterval = setInterval(updateCachedAccent, 2000);
    const getAccent = () => cachedAccent;

    // ── Shared audio data helpers ──
    // analyser fftSize=512 → frequencyBinCount=256. Use all available bins.
    const FFT_SIZE = 256;
    const freqDataRaw = new Uint8Array(FFT_SIZE);
    const freqDataSmooth = new Float32Array(FFT_SIZE);
    let bassHitCooldown = 0;
    let rmsHistory = 0;

    // Pre-computed logarithmic frequency bin lookup table.
    // Maps linear visual index [0..totalBins-1] → logarithmic frequency bin [1..maxBin].
    // Gives more resolution to bass/mids, less to treble — matching human hearing.
    const buildLogBinLookup = (totalBins: number, maxBin: number): Uint8Array => {
      const lookup = new Uint8Array(totalBins);
      const minLog = Math.log(1);
      const maxLog = Math.log(maxBin);
      for (let i = 0; i < totalBins; i++) {
        lookup[i] = Math.max(1, Math.min(maxBin, Math.floor(Math.pow(Math.E, minLog + (maxLog - minLog) * (i / (totalBins - 1))))));
      }
      return lookup;
    };
    // Build for common bar/segment counts (used across all draw functions)
    const MAX_FREQ_BIN = FFT_SIZE - 1;

    /** Fill frequency data arrays; returns true when analyser is active */
    const fetchAudioData = (): boolean => {
      const analyser = getAnalyser();
      if (analyser) {
        getFrequencyData(freqDataRaw);
      }
      // Adaptive smoothing — bass responds faster (attacks), treble is smoother
      for (let i = 0; i < FFT_SIZE; i++) {
        const freqRatio = i / FFT_SIZE;
        // Bass: fast attack (0.35), Treble: smooth (0.15)
        const attackSpeed = 0.35 - freqRatio * 0.20;
        const raw = freqDataRaw[i] || 0;
        const diff = raw - freqDataSmooth[i];
        // Faster attack, slower release for natural decay
        const speed = diff > 0 ? attackSpeed : attackSpeed * 0.5;
        freqDataSmooth[i] += diff * speed;
      }
      // Noise gate: zero out values below the noise floor
      const NOISE_FLOOR = 3;
      for (let i = 0; i < FFT_SIZE; i++) {
        if (freqDataSmooth[i] < NOISE_FLOOR) freqDataSmooth[i] = 0;
      }
      // Auto-normalization (RMS-based) for consistent visual amplitude across tracks
      let rmsSum = 0;
      for (let i = 0; i < FFT_SIZE; i++) rmsSum += freqDataSmooth[i] * freqDataSmooth[i];
      const rms = Math.sqrt(rmsSum / FFT_SIZE);
      rmsHistory += (rms - rmsHistory) * 0.01;
      const targetRms = 80;
      if (rmsHistory > 5) {
        const gain = targetRms / rmsHistory;
        const clampedGain = Math.min(2.5, Math.max(0.5, gain));
        for (let i = 0; i < FFT_SIZE; i++) {
          freqDataSmooth[i] = Math.min(255, freqDataSmooth[i] * clampedGain);
        }
      }
      return !!analyser;
    };

    /** Get average energy of a frequency range [start..end) normalized to 0-1 */
    const bandEnergy = (start: number, end: number) => {
      let sum = 0;
      const count = Math.max(1, end - start);
      for (let i = start; i < end && i < FFT_SIZE; i++) sum += freqDataSmooth[i];
      return sum / count / 255;
    };

    // Beat detection using energy history comparison over a longer window
    const bassHistory = new Float32Array(30); // ~0.5s at 60fps
    let bassHistoryIdx = 0;
    const detectBassHit = (bass: number): number => {
      bassHistory[bassHistoryIdx] = bass;
      bassHistoryIdx = (bassHistoryIdx + 1) % bassHistory.length;
      // Calculate average of recent history
      let avg = 0;
      for (let i = 0; i < bassHistory.length; i++) avg += bassHistory[i];
      avg /= bassHistory.length;
      // Beat = current bass significantly above recent average
      if (bassHitCooldown > 0) bassHitCooldown--;
      const hit = bass > 0.35 && bass > avg * 1.4 && bassHitCooldown <= 0;
      if (hit) bassHitCooldown = 10;
      return hit ? 1.0 : 0.0;
    };

    /** Generate a gentle idle value (used when not playing or no analyser) */
    const idleVal = (t: number, i: number, seed: number) =>
      0.5 + Math.sin(t * 0.6 + seed + i * 0.3) * 0.2 + Math.sin(t * 0.9 + seed * 2 + i * 0.15) * 0.1;

    // ═══════════════════════════════════════════════════════════════════
    // Default — Audio-Reactive Multi-Band Waves
    // 5 layered waves mapped to frequency bands with gradient fill,
    // glow/bloom, sparkle particles on peaks, and reflection
    // ═══════════════════════════════════════════════════════════════════
    // Wave config: each maps to a non-overlapping frequency band range
    // fftSize=512, sampleRate≈44100 → bin Hz = 44100/1024 ≈ 43 Hz per bin
    // Sub-bass: bins 1-6 (20-260 Hz), Bass: 6-18 (260-780 Hz), Mid: 18-50 (780-2150 Hz),
    // High-mid: 50-120 (2150-5160 Hz), Treble: 120-220 (5160-9460 Hz)
    const waveBands = [
      { freqStart: 1,   freqEnd: 6,   segs: 48, speed: 0.4, amp: 0.42, phase: 0,   yOff: 0.52, alpha: 0.55, lw: 1.8, lerp: 0.18 },   // Sub-bass
      { freqStart: 6,   freqEnd: 18,  segs: 55, speed: 0.65, amp: 0.32, phase: 1.2, yOff: 0.50, alpha: 0.38, lw: 1.4, lerp: 0.20 },   // Bass
      { freqStart: 18,  freqEnd: 50,  segs: 65, speed: 0.85, amp: 0.24, phase: 2.5, yOff: 0.48, alpha: 0.28, lw: 1.1, lerp: 0.22 },   // Mid
      { freqStart: 50,  freqEnd: 120, segs: 75, speed: 1.1,  amp: 0.16, phase: 3.8, yOff: 0.50, alpha: 0.18, lw: 0.9, lerp: 0.24 },   // High-mid
      { freqStart: 120, freqEnd: 220, segs: 80, speed: 1.4,  amp: 0.10, phase: 5.0, yOff: 0.50, alpha: 0.12, lw: 0.7, lerp: 0.26 },   // Treble
    ];
    // Per-wave smoothed data
    const waveSmooth = waveBands.map(() => new Float32Array(128));

    const sparkleParticles = Array.from({ length: 25 }, () => ({
      waveIdx: Math.floor(Math.random() * waveBands.length),
      xFrac: Math.random(),
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.8 + Math.random() * 2.0,
    }));

    /** Draw a smooth cubic bezier path through an array of points (Catmull-Rom → Bezier) */
    const drawSmoothPath = (ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], tension: number = 0.3) => {
      if (points.length < 2) return;
      ctx.moveTo(points[0].x, points[0].y);
      if (points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
        return;
      }
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    };

    const drawDefault = () => {
      const now = performance.now();
      recordFrameTime(now); // Adaptive performance tracking
      // ── Pause animation when tab is hidden (saves CPU) ──
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(drawDefault);
        return;
      }
      animFrameRef.current = requestAnimationFrame(drawDefault);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const { r, g, b } = getAccent();
      const t = now / 1000;
      const playing = isPlayingRef.current;
      const hasAnalyser = fetchAudioData();
      const bass = playing && hasAnalyser ? bandEnergy(1, 18) : 0;

      // ── Subtle ambient glow at bottom when playing ──
      if (playing) {
        const glowIntensity = 0.04 + bass * 0.08;
        const ambientGrad = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.6);
        ambientGrad.addColorStop(0, `rgba(${r},${g},${b},${glowIntensity})`);
        ambientGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, w, h);
      }

      for (let wi = 0; wi < waveBands.length; wi++) {
        const wave = waveBands[wi];
        const smooth = waveSmooth[wi];

        // Build wave points
        const points: { x: number; y: number; val: number }[] = [];
        for (let i = 0; i < wave.segs; i++) {
          const xn = i / (wave.segs - 1);
          const x = xn * w;

          let yNorm: number;
          if (playing && hasAnalyser) {
            // Map segment to frequency bin range
            const binIdx = Math.floor(xn * (wave.freqEnd - wave.freqStart)) + wave.freqStart;
            const raw = freqDataSmooth[Math.min(binIdx, FFT_SIZE - 1)] / 255;
            smooth[i] += (raw - smooth[i]) * wave.lerp;
            yNorm = smooth[i];
            // Add subtle time-based wobble for organic feel
            yNorm += Math.sin(t * wave.speed * 0.3 + wave.phase + xn * Math.PI * 2) * 0.05;
          } else {
            // Gentle idle animation
            const idle = 0.08
              + Math.sin(t * wave.speed * 0.5 + wave.phase + 0.7 * xn * Math.PI * 2) * 0.06
              + Math.sin(t * wave.speed * 0.3 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2) * 0.03;
            smooth[i] += (idle - smooth[i]) * 0.05;
            yNorm = smooth[i];
          }

          const y = wave.yOff * h - yNorm * wave.amp * h;
          points.push({ x, y, val: yNorm });
        }

        // ── Glow layer (thick, semi-transparent, with shadowBlur) ──
        ctx.beginPath();
        drawSmoothPath(ctx, points, 0.25);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.2})`;
        ctx.lineWidth = wave.lw + 6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = `rgba(${r},${g},${b},${wave.alpha * 0.35})`;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Main bright line (smooth bezier) ──
        ctx.beginPath();
        drawSmoothPath(ctx, points, 0.25);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.stroke();

        // ── Gradient fill under wave (smooth bezier) ──
        const gradient = ctx.createLinearGradient(0, wave.yOff * h - wave.amp * h, 0, h);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.18})`);
        gradient.addColorStop(0.5, `rgba(${r},${g},${b},${wave.alpha * 0.06})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        drawSmoothPath(ctx, points, 0.25);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // ── Reflection (mirrored, faded, smooth bezier) ──
        const reflPoints = points.map(p => ({ x: p.x, y: Math.min(2 * h - p.y, h) }));
        ctx.save();
        ctx.globalAlpha = wave.alpha * 0.1;
        ctx.beginPath();
        drawSmoothPath(ctx, reflPoints, 0.25);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.lineWidth = wave.lw * 0.6;
        ctx.stroke();
        ctx.restore();
      }

      // ── Sparkle particles on wave peaks ──
      for (const p of sparkleParticles) {
        const wi = p.waveIdx;
        const wave = waveBands[wi];
        const smooth = waveSmooth[wi];
        const xn = p.xFrac;
        const si = Math.min(Math.floor(xn * (wave.segs - 1)), wave.segs - 1);
        const val = smooth[si];

        // Calculate y position using same logic as above
        let yNorm: number;
        if (playing && hasAnalyser) {
          yNorm = val + Math.sin(t * wave.speed * 0.3 + wave.phase + xn * Math.PI * 2) * 0.05;
        } else {
          yNorm = val;
        }
        const px = xn * w;
        const py = wave.yOff * h - yNorm * wave.amp * h;

        // Only show sparkles when there's energy (peaks)
        const energyBoost = playing && hasAnalyser ? val : 0.3;
        const tw = 0.3 + 0.7 * Math.pow(Math.sin(t * p.twinkle + p.phase), 2);
        const alpha = tw * energyBoost * wave.alpha * 0.8;
        if (alpha < 0.05) continue;
        const size = p.size * (0.4 + tw * 0.6) * (0.5 + energyBoost);

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},${alpha})`;
        ctx.shadowColor = `rgba(${r},${g},${b},${alpha * 0.6})`;
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Pixel Flower — Pixelated Garden Visualization
    // Pixel art flowers with lavender/purple/pink petals, golden center,
    // dark purple stems on a clean background. Audio-reactive bloom & drift.
    // ═══════════════════════════════════════════════════════════════════
    // Dark/light color palettes
    const isDarkPF = styleVariant !== "light";
    const PETAL_COLORS = isDarkPF
      ? ["#a693af", "#8e7ea3", "#724774", "#93778d"]
      : ["#B8A9C9", "#9B7DB8", "#D4A5B5"];
    const CENTER_COLOR = isDarkPF ? "#c88c68" : "#E8C547";
    const CENTER_COLOR_INNER = isDarkPF ? "#ba8163" : "#D4A832";
    const CENTER_DOT = isDarkPF ? "#d49570" : "#F5DC6A";
    const STEM_COLOR = isDarkPF ? "#3D5A35" : "#6B4C7A";
    const LEAF_COLOR = isDarkPF ? "#2E5A28" : "#8BAF7A";
    const BG_COLOR = isDarkPF ? "#0d0b11" : "#FAFAFA";
    const GRID_COLOR = isDarkPF ? "rgba(155,109,255,0.03)" : "rgba(0,0,0,0.03)";
    const GRASS_COLOR_1 = isDarkPF ? "#2E4A28" : "#C8D8B8";
    const GRASS_COLOR_2 = isDarkPF ? "#1E3A1A" : "#A8C498";

    // Pixel flower data structure
    interface PixelFlower {
      xFrac: number;      // x position as fraction of canvas width
      yFrac: number;      // y base position as fraction of canvas height
      baseScale: number;  // base pixel size for this flower
      petalCount: number; // number of petal rings
      phase: number;      // animation phase offset
    }

    // 5 pre-positioned pixel flowers at various sizes
    const pixelFlowers: PixelFlower[] = [
      { xFrac: 0.15, yFrac: 0.72, baseScale: 1.1, petalCount: 3, phase: 0 },
      { xFrac: 0.38, yFrac: 0.65, baseScale: 1.6, petalCount: 4, phase: 1.2 },
      { xFrac: 0.55, yFrac: 0.75, baseScale: 0.9, petalCount: 3, phase: 2.5 },
      { xFrac: 0.75, yFrac: 0.68, baseScale: 1.3, petalCount: 4, phase: 3.8 },
      { xFrac: 0.92, yFrac: 0.73, baseScale: 1.0, petalCount: 3, phase: 5.0 },
    ];

    // Drifting petal particles spawned by bass hits
    interface DriftPetal {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; life: number; maxLife: number;
    }
    const driftPetals: DriftPetal[] = [];

    /** Draw a single pixel flower at a given position and scale */
    const drawSinglePixelFlower = (
      cx: number, cy: number, px: number, scale: number,
      audioBass: number, audioMid: number
    ) => {
      const s = Math.max(1, Math.round(px * scale));

      // Stem (3px wide, going down)
      const stemH = Math.round(s * (6 + audioBass * 3));
      ctx.fillStyle = STEM_COLOR;
      ctx.fillRect(cx - s, cy + s * 2, s * 3, stemH);
      // Small leaves on stem
      ctx.fillStyle = LEAF_COLOR;
      ctx.fillRect(cx + s * 2, cy + s * 4, s * 2, s);
      ctx.fillRect(cx + s * 2, cy + s * 5, s, s);
      ctx.fillRect(cx - s * 3, cy + s * 6, s * 2, s);
      ctx.fillRect(cx - s * 2, cy + s * 7, s, s);

      // Determine extra petals based on mid frequency
      const extraRings = Math.floor(audioMid * 3);
      const totalRings = 2 + extraRings;

      // Draw petal rings from outermost to innermost
      for (let ring = totalRings; ring >= 1; ring--) {
        const ringScale = ring === 1 ? 1.0 : 0.65 + (ring / totalRings) * 0.45;
        const petalSize = Math.round(s * ringScale * (1.2 + audioBass * 0.5));
        const dist = Math.round(s * ringScale * (1.0 + ring * 0.3));
        const colorIdx = (ring - 1) % PETAL_COLORS.length;
        const color = PETAL_COLORS[colorIdx];

        // Draw 6 petals around the center for each ring
        for (let p = 0; p < 6; p++) {
          const angle = (p / 6) * Math.PI * 2 + ring * 0.3;
          const px2 = cx + Math.round(Math.cos(angle) * dist) * s / s;
          const py2 = cy + Math.round(Math.sin(angle) * dist) * s / s;

          // Pixel-art petal: a cross/diamond shape made of small rects
          ctx.fillStyle = color;
          const half = Math.max(1, Math.round(petalSize / 2));
          // Center pixel
          ctx.fillRect(px2 * 1 - half * s / 2, py2 * 1 - half * s / 2, half, half);
          // Top
          ctx.fillRect(px2 * 1 - half * s / 2, py2 * 1 - half * s / 2 - s, half, s);
          // Bottom
          ctx.fillRect(px2 * 1 - half * s / 2, py2 * 1 + half * s / 2, half, s);
          // Left
          ctx.fillRect(px2 * 1 - half * s / 2 - s, py2 * 1 - half * s / 2, s, half);
          // Right
          ctx.fillRect(px2 * 1 + half * s / 2, py2 * 1 - half * s / 2, s, half);
          // Diagonal corners for rounder pixel look
          ctx.fillRect(px2 * 1 - half * s / 2 - s, py2 * 1 - half * s / 2 - s, s, s);
          ctx.fillRect(px2 * 1 + half * s / 2, py2 * 1 - half * s / 2 - s, s, s);
          ctx.fillRect(px2 * 1 - half * s / 2 - s, py2 * 1 + half * s / 2, s, s);
          ctx.fillRect(px2 * 1 + half * s / 2, py2 * 1 + half * s / 2, s, s);
        }
      }

      // Golden center stamen — cross pattern
      const centerSize = Math.max(1, Math.round(s * (0.8 + audioBass * 0.4)));
      ctx.fillStyle = CENTER_COLOR;
      ctx.fillRect(cx - centerSize, cy - centerSize, centerSize * 2 + 1, centerSize * 2 + 1);
      // Inner darker gold ring
      ctx.fillStyle = CENTER_COLOR_INNER;
      ctx.fillRect(cx - Math.max(1, centerSize - s), cy - Math.max(1, centerSize - s),
        Math.max(1, (centerSize - s) * 2 + 1), Math.max(1, (centerSize - s) * 2 + 1));
      // Bright center dot
      ctx.fillStyle = CENTER_DOT;
      const dotR = Math.max(1, Math.round(s * 0.4));
      ctx.fillRect(cx - dotR, cy - dotR, dotR * 2 + 1, dotR * 2 + 1);
    };

    const drawPixelFlower = () => {
      const now = performance.now();
      recordFrameTime(now); // Adaptive performance tracking
      animFrameRef.current = requestAnimationFrame(drawPixelFlower);
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const t = now / 1000;
      const playing = isPlayingRef.current;
      const hasAnalyser = fetchAudioData();

      const bass = playing && hasAnalyser ? bandEnergy(1, 18) : idleVal(t, 0, 20) * 0.3;
      const mid = playing && hasAnalyser ? bandEnergy(18, 80) : idleVal(t, 5, 21) * 0.3;
      const high = playing && hasAnalyser ? bandEnergy(80, 180) : idleVal(t, 8, 22) * 0.2;
      const bassHit = playing && hasAnalyser ? detectBassHit(bass) : 0;

      // ── Clean background ──
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      // ── Subtle pixel grid overlay ──
      const gridSize = 4;
      ctx.fillStyle = GRID_COLOR;
      for (let gx = 0; gx < w; gx += gridSize) {
        for (let gy = 0; gy < h; gy += gridSize) {
          // Only draw grid dots at intersections for a cleaner look
          if ((Math.floor(gx / gridSize) + Math.floor(gy / gridSize)) % 3 === 0) {
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
      }

      // ── Spawn drifting petals on bass hits ──
      if (bassHit > 0) {
        const spawnCount = 3 + Math.floor(Math.random() * 5);
        for (let sp = 0; sp < spawnCount; sp++) {
          const sx = Math.random() * w;
          const sy = h * 0.3 + Math.random() * h * 0.4;
          driftPetals.push({
            x: sx, y: sy,
            vx: (Math.random() - 0.5) * 2,
            vy: -(0.3 + Math.random() * 1.2),
            size: 2 + Math.random() * 3,
            color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
            life: 0,
            maxLife: 40 + Math.random() * 50,
          });
        }
        if (driftPetals.length > 60) driftPetals.splice(0, driftPetals.length - 60);
      }

      // ── Update and draw drifting petals ──
      for (let di = driftPetals.length - 1; di >= 0; di--) {
        const dp = driftPetals[di];
        dp.x += dp.vx;
        dp.y += dp.vy;
        dp.vy += 0.015; // gentle gravity
        dp.vx += Math.sin(t * 2 + dp.x * 0.01) * 0.02; // sway
        dp.life++;
        if (dp.life > dp.maxLife) { driftPetals.splice(di, 1); continue; }
        const fade = 1 - dp.life / dp.maxLife;
        const alpha = fade * 0.7;
        // Pixel-art style: draw as a small filled rectangle
        const ps = Math.max(1, Math.round(dp.size * fade));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dp.color;
        // Cross-shaped pixel petal
        ctx.fillRect(dp.x - ps, dp.y, ps * 2 + 1, ps);
        ctx.fillRect(dp.x, dp.y - ps, ps, ps * 2 + 1);
        ctx.globalAlpha = 1;
      }

      // ── Draw pixel flowers ──
      const basePixel = Math.max(2, Math.round(Math.min(w, h) / 40));
      for (const flower of pixelFlowers) {
        const cx = flower.xFrac * w;
        const cy = flower.yFrac * h;
        // Audio-reactive scale: pulse with bass, bloom with mids
        const scalePulse = 1 + bass * 0.5 + Math.sin(t * 1.5 + flower.phase) * 0.08;
        const scale = flower.baseScale * scalePulse;
        // Gentle sway
        const swayX = Math.sin(t * 0.8 + flower.phase) * basePixel * 0.5;
        drawSinglePixelFlower(cx + swayX, cy, basePixel, scale, bass, mid);
      }

      // ── Ground grass pixels ──
      const grassY = h * 0.82;
      ctx.fillStyle = GRASS_COLOR_1;
      for (let gx = 0; gx < w; gx += gridSize) {
        const grassH = 2 + Math.floor(Math.sin(gx * 0.05 + t * 0.5) * 1.5 + 1.5);
        ctx.fillRect(gx, grassY - grassH, gridSize - 1, grassH + Math.floor(h * 0.18));
      }
      // Darker grass patches
      ctx.fillStyle = GRASS_COLOR_2;
      for (let gx = gridSize * 2; gx < w; gx += gridSize * 4) {
        const grassH = 1 + Math.floor(Math.sin(gx * 0.03 + t * 0.3 + 1) * 1);
        ctx.fillRect(gx, grassY - grassH, gridSize * 2 - 1, grassH + Math.floor(h * 0.18) + gridSize);
      }

      // ── Tiny floating pollen/sparkle pixels ──
      const sparkleCount = playing && hasAnalyser ? 8 + Math.floor(high * 15) : 4;
      for (let sp = 0; sp < sparkleCount; sp++) {
        const sx = (Math.sin(t * 0.4 + sp * 2.1) * 0.5 + 0.5) * w;
        const sy = (Math.cos(t * 0.3 + sp * 1.7) * 0.5 + 0.5) * h * 0.7;
        const twinkle = Math.pow(Math.sin(t * 2.5 + sp * 1.3), 2);
        const alpha = twinkle * (playing && hasAnalyser ? 0.4 + high * 0.5 : 0.2);
        if (alpha < 0.05) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = CENTER_COLOR;
        ctx.fillRect(Math.round(sx / gridSize) * gridSize, Math.round(sy / gridSize) * gridSize, gridSize, gridSize);
        ctx.globalAlpha = 1;
      }
    };

    // ── Choose renderer based on style ──
    switch (currentStyle) {
      case "pixel-flower": drawPixelFlower(); break;
      default: drawDefault(); break;
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      clearInterval(accentInterval);
    };
  }, [trackId, currentStyle, styleVariant]);

  // ── Mini Equalizer — Canvas-based audio-reactive bars (60fps, GPU-composited) ──
  // Uses Canvas for zero-reflow rendering with requestAnimationFrame.
  // Effect runs once (no deps) so the rAF loop never restarts on isPlaying toggle.
  // The canvas is always in DOM (CSS opacity controls visibility) to avoid ref timing issues.
  // Includes fallback time-based animation when no audio data is available.
  useEffect(() => {
    const canvas = miniEqRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const BAR_COUNT = 5;
    const BAR_GAP = 2;
    const BAR_WIDTH = 2;
    const CANVAS_W = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP;
    const CANVAS_H = 14;

    // Set canvas dimensions for HiDPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    ctx.scale(dpr, dpr);

    // Frequency band indices for bars: sub-bass, bass, low-mid, high-mid, treble
    const BAND_INDICES = [2, 8, 24, 64, 128];
    const smooth = new Float32Array(BAR_COUNT);
    const bufLen = 256;
    const data = new Uint8Array(bufLen);
    let rafId = 0;
    let lastDataSum = 0; // Track whether we're getting real data
    let fallbackPhase = 0; // For time-based fallback animation

    // Cache accent color — update every 2s, not every frame
    let cachedAccentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
    const accentUpdateInterval = setInterval(() => {
      cachedAccentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
    }, 2000);

    const tick = () => {
      // ── Pause mini-eq rendering when tab is hidden (saves CPU) ──
      if (document.hidden) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const now = performance.now() / 1000;

      if (isPlayingRef.current) {
        getFrequencyData(data);

        // Check if we got any real data
        let sum = 0;
        for (let i = 0; i < BAR_COUNT; i++) sum += data[BAND_INDICES[i]];
        lastDataSum = sum;

        for (let i = 0; i < BAR_COUNT; i++) {
          const raw = data[BAND_INDICES[i]] / 255;

          // If no real frequency data (all zeros), use time-based fallback
          if (sum === 0) {
            fallbackPhase += 0.001;
            const fallback = 0.3 + 0.4 * Math.sin(now * (2.5 + i * 0.7) + i * 1.3) *
              (0.5 + 0.5 * Math.sin(now * 1.1 + i * 0.9));
            const speed = fallback > smooth[i] ? 0.4 : 0.12;
            smooth[i] += (fallback - smooth[i]) * speed;
          } else {
            const speed = raw > smooth[i] ? 0.5 : 0.1;
            smooth[i] += (raw - smooth[i]) * speed;
          }
        }
      } else {
        // Paused: subtle idle breathing animation
        for (let i = 0; i < BAR_COUNT; i++) {
          const idle = 0.15 + 0.1 * Math.sin(now * 0.8 + i * 0.6);
          smooth[i] += (idle - smooth[i]) * 0.05;
        }
      }

      // Draw bars — cached accent color for 60fps
      for (let i = 0; i < BAR_COUNT; i++) {
        const barHeight = Math.max(2, smooth[i] * CANVAS_H);
        const x = i * (BAR_WIDTH + BAR_GAP);
        const y = CANVAS_H - barHeight;

        // Use slightly reduced opacity when paused for visual feedback
        const alpha = isPlayingRef.current ? 1 : 0.4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = cachedAccentColor;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, BAR_WIDTH, barHeight, 1);
        } else {
          ctx.rect(x, y, BAR_WIDTH, barHeight);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafId); clearInterval(accentUpdateInterval); };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 1, pointerEvents: "none" }}
      />
      <canvas ref={miniEqRef} className="hidden" style={{ width: 0, height: 0 }} />
    </>
  );
}
