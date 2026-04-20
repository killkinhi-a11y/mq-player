"use client";

import { useRef, useEffect, useCallback } from "react";
import { getAnalyser, getFrequencyData } from "@/lib/audioEngine";

interface TrackCanvasProps {
  isActive: boolean;
  isPlaying: boolean;
}

// ── Color helpers ──────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)      { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else              { r1 = c; b1 = x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Orb definition ─────────────────────────────────────────────────────────

interface Orb {
  hueShift: number;       // offset from accent hue
  satMul: number;         // saturation multiplier
  lightBase: number;      // base lightness
  baseRadiusFrac: number; // fraction of min(w,h)
  xPhase: number;         // sine phase for X drift
  yPhase: number;         // sine phase for Y drift
  xSpeed: number;         // X drift speed
  ySpeed: number;         // Y drift speed
  xAmp: number;           // X amplitude (fraction of w)
  yAmp: number;           // Y amplitude (fraction of h)
  pulsePhase: number;     // phase for pulse
  pulseSpeed: number;     // pulse speed
  highFreqSensitivity: number; // how much it reacts to treble
}

const ORB_CONFIGS: Orb[] = [
  { hueShift: 0,   satMul: 1.0, lightBase: 0.35, baseRadiusFrac: 0.45, xPhase: 0,    yPhase: 1.2, xSpeed: 0.15, ySpeed: 0.12, xAmp: 0.18, yAmp: 0.14, pulsePhase: 0,   pulseSpeed: 0.4, highFreqSensitivity: 0.3 },
  { hueShift: 180, satMul: 0.8, lightBase: 0.30, baseRadiusFrac: 0.38, xPhase: 2.0,  yPhase: 0.5, xSpeed: 0.20, ySpeed: 0.18, xAmp: 0.22, yAmp: 0.16, pulsePhase: 1.5, pulseSpeed: 0.5, highFreqSensitivity: 0.6 },
  { hueShift: 30,  satMul: 0.9, lightBase: 0.28, baseRadiusFrac: 0.32, xPhase: 4.0,  yPhase: 3.0, xSpeed: 0.12, ySpeed: 0.22, xAmp: 0.15, yAmp: 0.20, pulsePhase: 3.0, pulseSpeed: 0.35, highFreqSensitivity: 0.8 },
  { hueShift: -30, satMul: 0.7, lightBase: 0.25, baseRadiusFrac: 0.28, xPhase: 1.0,  yPhase: 4.5, xSpeed: 0.25, ySpeed: 0.10, xAmp: 0.20, yAmp: 0.12, pulsePhase: 4.5, pulseSpeed: 0.6,  highFreqSensitivity: 1.0 },
];

// ── Frequency band helpers ─────────────────────────────────────────────────

function bandAverage(data: Uint8Array<ArrayBuffer>, from: number, to: number): number {
  let sum = 0, count = 0;
  const start = Math.floor(from * data.length);
  const end = Math.floor(to * data.length);
  for (let i = start; i < end && i < data.length; i++) {
    sum += data[i];
    count++;
  }
  return count > 0 ? sum / count / 255 : 0;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrackCanvas({ isActive, isPlaying }: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const freqDataRef = useRef(new Uint8Array(128));
  // Smoothed values for interpolation (avoid jitter)
  const smoothBassRef = useRef(0);
  const smoothMidRef = useRef(0);
  const smoothHighRef = useRef(0);

  // Read accent color from CSS — cached per frame in render
  const getAccentColor = useCallback(() => {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim();
      if (val && val.startsWith("#") && val.length >= 7) return val;
    } catch {}
    return "#e03131";
  }, []);

  // ── Main render loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let lastFrame = 0;
    const targetInterval = 1000 / 30; // ~30fps
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const draw = (timestamp: number) => {
      animRef.current = requestAnimationFrame(draw);

      // Throttle to ~30fps
      if (timestamp - lastFrame < targetInterval) return;
      lastFrame = timestamp;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w === 0 || h === 0) return;

      // Resize canvas if needed
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ── Get audio data ────────────────────────────────────────────────
      const analyser = getAnalyser();
      const freqData = freqDataRef.current;

      if (analyser) {
        getFrequencyData(freqData);
      } else {
        // Decay to zero when no analyser
        for (let i = 0; i < freqData.length; i++) {
          freqData[i] = Math.floor(freqData[i] * 0.9);
        }
      }

      const rawBass = bandAverage(freqData, 0, 0.12);
      const rawMid = bandAverage(freqData, 0.12, 0.5);
      const rawHigh = bandAverage(freqData, 0.5, 1.0);

      // Smooth interpolation
      const smoothFactor = isPlaying ? 0.18 : 0.05;
      smoothBassRef.current = lerp(smoothBassRef.current, rawBass, smoothFactor);
      smoothMidRef.current = lerp(smoothMidRef.current, rawMid, smoothFactor);
      smoothHighRef.current = lerp(smoothHighRef.current, rawHigh, smoothFactor);

      const bass = smoothBassRef.current;
      const mid = smoothMidRef.current;
      const high = smoothHighRef.current;

      // ── Parse accent color ────────────────────────────────────────────
      const accentHex = getAccentColor();
      const [ar, ag, ab] = parseHex(accentHex);
      const [accentHue, accentSat, accentLight] = rgbToHsl(ar, ag, ab);

      const t = performance.now() / 1000;

      // ── Clear with dark background ────────────────────────────────────
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // ── Draw gradient orbs ────────────────────────────────────────────
      const minDim = Math.min(w, h);

      // Set composite for additive blending
      ctx.globalCompositeOperation = "lighter";

      for (const orb of ORB_CONFIGS) {
        const hue = accentHue + orb.hueShift;
        const sat = accentSat * orb.satMul;

        // Low freq → size/pulse
        const pulseFactor = 1 + bass * 0.6 * Math.sin(t * orb.pulseSpeed + orb.pulsePhase);
        const radius = Math.max(10, minDim * orb.baseRadiusFrac * pulseFactor);

        // Mid freq → position drift amplitude
        const driftBoost = 1 + mid * 0.5;
        const x = w * (0.5 + orb.xAmp * driftBoost * Math.sin(t * orb.xSpeed + orb.xPhase));
        const y = h * (0.5 + orb.yAmp * driftBoost * Math.cos(t * orb.ySpeed + orb.yPhase));

        // High freq → color intensity / lightness
        const lightBoost = orb.lightBase + high * orb.highFreqSensitivity * 0.25;
        const alpha = 0.12 + bass * 0.15 + high * orb.highFreqSensitivity * 0.08;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, hslToRgba(hue, sat, Math.min(0.55, lightBoost + 0.15), Math.min(0.6, alpha)));
        grad.addColorStop(0.4, hslToRgba(hue, sat, lightBoost, Math.min(0.45, alpha * 0.7)));
        grad.addColorStop(0.7, hslToRgba(hue, sat * 0.7, lightBoost * 0.6, Math.min(0.2, alpha * 0.3)));
        grad.addColorStop(1, hslToRgba(hue, sat * 0.5, lightBoost * 0.3, 0));

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // ── Ambient idle pulse when not playing ──────────────────────────
      if (!isPlaying) {
        const idlePulse = 0.03 + 0.02 * Math.sin(t * 0.8);
        const idleGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, minDim * 0.5);
        idleGrad.addColorStop(0, hslToRgba(accentHue, accentSat, 0.35, idlePulse));
        idleGrad.addColorStop(1, hslToRgba(accentHue, accentSat, 0.2, 0));
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.45, minDim * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = idleGrad;
        ctx.fill();
      }

      // ── Subtle vignette ──────────────────────────────────────────────
      ctx.globalCompositeOperation = "source-over";
      const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, minDim * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // Cover art is intentionally NOT drawn here.
      // When canvasMode is active, the cover <img> in FullTrackView is hidden,
      // and only the abstract visual effects (orbs, gradients) are shown.
    };

    draw(performance.now());

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isActive, isPlaying]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 2 }}
    />
  );
}
