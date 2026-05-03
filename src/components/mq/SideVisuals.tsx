"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAnalyser } from "@/lib/audioEngine";

/**
 * Animated side panels with theme-aware colors:
 * - Geometric grid lines that pulse with audio
 * - Ripple circles emanating from random points
 * - Diagonal light streaks
 * - Subtle mouse-following glow
 * - Audio-reactive vertical bars along inner edge
 * All colors read from --mq-accent CSS variable.
 */

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

interface Streak {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  angle: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function parseAccentColor(raw: string): [number, number, number] {
  if (raw.startsWith("#") && raw.length >= 7) return hexToRgb(raw);
  // fallback: try to extract rgb from getComputedStyle value
  const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [224, 49, 49]; // fallback red
}

export default function SideVisuals() {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const ripplesRef = useRef<Ripple[]>([]);
  const streaksRef = useRef<Streak[]>([]);
  const accentRef = useRef<[number, number, number]>([224, 49, 49]);

  const createRipple = (w: number, h: number): Ripple => ({
    x: Math.random() * w,
    y: Math.random() * h,
    radius: 0,
    maxRadius: Math.random() * 80 + 40,
    opacity: Math.random() * 0.15 + 0.05,
  });

  const createStreak = (w: number, h: number): Streak => ({
    x: Math.random() * w * 1.5 - w * 0.25,
    y: -Math.random() * 40,
    length: Math.random() * 60 + 20,
    speed: Math.random() * 1.5 + 0.5,
    opacity: Math.random() * 0.06 + 0.02,
    angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
  });

  const readAccent = useCallback(() => {
    if (typeof document === "undefined") return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim();
    if (raw) accentRef.current = parseAccentColor(raw);
  }, []);

  useEffect(() => {
    readAccent();
    // Re-read accent every 2 seconds to catch theme changes
    const interval = setInterval(readAccent, 2000);
    return () => clearInterval(interval);
  }, [readAccent]);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouse, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouse);
  }, []);

  useEffect(() => {
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftCanvas || !rightCanvas) return;

    const ctxL = leftCanvas.getContext("2d");
    const ctxR = rightCanvas.getContext("2d");
    if (!ctxL || !ctxR) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resizeCanvases = () => {
      const vw = window.innerWidth;
      const isMobile = vw < 1024;
      const sideW = isMobile ? 0 : Math.max(60, Math.min(200, (vw - 896) / 2));
      const vh = window.innerHeight;

      if (sideW === 0) {
        leftCanvas.style.display = "none";
        rightCanvas.style.display = "none";
        return;
      }

      leftCanvas.style.display = "block";
      rightCanvas.style.display = "block";

      w = sideW;
      h = vh;

      [leftCanvas, rightCanvas].forEach((canvas) => {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
      });

      // Init ripples
      const rippleCount = Math.max(3, Math.floor(h / 200));
      ripplesRef.current = Array.from({ length: rippleCount }, () => ({
        ...createRipple(w, h),
        radius: Math.random() * 60,
      }));

      // Init streaks
      const streakCount = Math.max(2, Math.floor(h / 250));
      streaksRef.current = Array.from({ length: streakCount }, () => ({
        ...createStreak(w, h),
        y: Math.random() * h,
      }));
    };

    resizeCanvases();
    window.addEventListener("resize", resizeCanvases);

    const freqData = new Uint8Array(128);
    let time = 0;
    let rippleTimer = 0;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      time += 0.016;

      if (w === 0) return;

      const analyser = getAnalyser();
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
      }

      // Audio energy (0-1)
      let energy = 0;
      for (let i = 0; i < 32; i++) energy += freqData[i];
      energy = energy / (32 * 255);

      // Bass energy
      let bass = 0;
      for (let i = 0; i < 8; i++) bass += freqData[i];
      bass = bass / (8 * 255);

      const [ar, ag, ab] = accentRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const vw = window.innerWidth;

      rippleTimer += 0.016;

      [ctxL, ctxR].forEach((ctx, side) => {
        ctx.clearRect(0, 0, w, h);

        // ── Subtle gradient background glow (mouse-following) ──
        const glowX = side === 0
          ? Math.min(w, mx)
          : Math.max(0, mx - (vw - w));
        const glowY = Math.min(h, Math.max(0, my));
        const glowDist = Math.sqrt(
          (glowX - w / 2) ** 2 + (glowY - h / 2) ** 2
        );
        const glowOpacity = Math.max(0, 0.04 + energy * 0.06 - glowDist / 800);

        if (glowOpacity > 0.005) {
          const grad = ctx.createRadialGradient(
            glowX, glowY, 0,
            glowX, glowY, w * 1.2
          );
          grad.addColorStop(0, `rgba(${ar},${ag},${ab},${glowOpacity})`);
          grad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${glowOpacity * 0.3})`);
          grad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        // ── Geometric grid lines (subtle) ──
        const gridSpacing = 40;
        const gridPulse = 0.02 + energy * 0.03;
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${gridPulse})`;
        ctx.lineWidth = 0.5;

        // Vertical grid lines
        for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
          ctx.stroke();
        }

        // Horizontal grid lines with subtle wave distortion
        for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
          ctx.beginPath();
          for (let px = 0; px <= w; px += 4) {
            const waveDistort = Math.sin(px * 0.03 + time * 1.5 + gy * 0.01) * (1 + bass * 3);
            if (px === 0) ctx.moveTo(px, gy + waveDistort);
            else ctx.lineTo(px, gy + waveDistort);
          }
          ctx.stroke();
        }

        // Grid intersection dots (audio-reactive glow)
        for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
          for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
            const freqIdx = Math.floor(((gx + gy) / (w + h)) * 32);
            const val = freqData[freqIdx] / 255;
            const dotSize = 1 + val * 2;
            const dotAlpha = 0.05 + val * 0.12;
            ctx.beginPath();
            ctx.arc(gx, gy, dotSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${dotAlpha})`;
            ctx.fill();
          }
        }

        // ── Ripple circles ──
        const ripples = ripplesRef.current;
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          r.radius += 0.3 + energy * 1.5;

          if (r.radius >= r.maxRadius) {
            ripples[i] = createRipple(w, h);
            continue;
          }

          const progress = r.radius / r.maxRadius;
          const fade = 1 - progress;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${r.opacity * fade})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Inner ring
          if (r.radius > 10) {
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${ar},${ag},${ab},${r.opacity * fade * 0.4})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        // Spawn new ripple periodically
        if (rippleTimer > 3 + Math.random() * 2) {
          rippleTimer = 0;
          if (ripples.length < 8) {
            ripples.push(createRipple(w, h));
          }
        }

        // ── Diagonal light streaks ──
        const streaks = streaksRef.current;
        for (let i = streaks.length - 1; i >= 0; i--) {
          const s = streaks[i];
          s.y += s.speed * (1 + energy * 2);

          if (s.y > h + 50) {
            streaks[i] = createStreak(w, h);
            continue;
          }

          const endX = s.x + Math.cos(s.angle) * s.length;
          const endY = s.y + Math.sin(s.angle) * s.length;

          const grad = ctx.createLinearGradient(s.x, s.y, endX, endY);
          grad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
          grad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${s.opacity * (0.5 + energy)})`);
          grad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // ── Audio-reactive vertical bars along inner edge ──
        const barCount = 16;
        const barGap = 2;
        const barW = Math.max(1, (w * 0.3) / barCount - barGap);
        const barX = side === 0 ? w - barW * barCount - barGap * (barCount - 1) : 0;

        for (let i = 0; i < barCount; i++) {
          const freqIdx = Math.floor((i / barCount) * 32);
          const val = freqData[freqIdx] / 255;
          const barH = Math.max(2, val * h * 0.4 + Math.sin(time * 2 + i * 0.4) * 4);

          const x = barX + i * (barW + barGap);
          const y = h / 2 - barH / 2 + Math.sin(time * 1.5 + i * 0.3) * 10;

          ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.08 + val * 0.15})`;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, barW / 2);
          ctx.fill();
        }

        // ── Wave line ──
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.06 + energy * 0.08})`;
        ctx.lineWidth = 1;

        const waveX = w * 0.5;
        for (let y = 0; y < h; y += 2) {
          const freqIdx = Math.floor((y / h) * 64);
          const val = freqData[freqIdx] / 255;
          const wave = Math.sin(y * 0.02 + time * 2) * (8 + val * 20)
            + Math.sin(y * 0.01 + time * 1.3) * (4 + bass * 12);
          if (y === 0) ctx.moveTo(waveX + wave, y);
          else ctx.lineTo(waveX + wave, y);
        }
        ctx.stroke();

        // ── Horizontal scan line ──
        const scanY = (time * 30) % h;
        const scanGrad = ctx.createLinearGradient(0, scanY - 2, 0, scanY + 2);
        scanGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        scanGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.03 + energy * 0.04})`);
        scanGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 2, w, 4);
      });
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvases);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <>
      <canvas
        ref={leftCanvasRef}
        className="fixed left-0 top-0 z-[1] pointer-events-none"
        style={{ display: "none" }}
      />
      <canvas
        ref={rightCanvasRef}
        className="fixed right-0 top-0 z-[1] pointer-events-none"
        style={{ display: "none" }}
      />
    </>
  );
}
