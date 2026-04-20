"use client";

import { useRef, useEffect, useCallback } from "react";
import { getAnalyser, getFrequencyData } from "@/lib/audioEngine";

interface TrackCanvasProps {
  isActive: boolean;
  isPlaying: boolean;
  currentStyle?: string | null;
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

// ── Orb definition (used by Default) ───────────────────────────────────────

interface Orb {
  hueShift: number; satMul: number; lightBase: number; baseRadiusFrac: number;
  xPhase: number; yPhase: number; xSpeed: number; ySpeed: number;
  xAmp: number; yAmp: number; pulsePhase: number; pulseSpeed: number;
  highFreqSensitivity: number;
}

const ORB_CONFIGS: Orb[] = [
  { hueShift: 0,   satMul: 1.0, lightBase: 0.35, baseRadiusFrac: 0.45, xPhase: 0,    yPhase: 1.2, xSpeed: 0.15, ySpeed: 0.12, xAmp: 0.18, yAmp: 0.14, pulsePhase: 0,   pulseSpeed: 0.4, highFreqSensitivity: 0.3 },
  { hueShift: 180, satMul: 0.8, lightBase: 0.30, baseRadiusFrac: 0.38, xPhase: 2.0,  yPhase: 0.5, xSpeed: 0.20, ySpeed: 0.18, xAmp: 0.22, yAmp: 0.16, pulsePhase: 1.5, pulseSpeed: 0.5, highFreqSensitivity: 0.6 },
  { hueShift: 30,  satMul: 0.9, lightBase: 0.28, baseRadiusFrac: 0.32, xPhase: 4.0,  yPhase: 3.0, xSpeed: 0.12, ySpeed: 0.22, xAmp: 0.15, yAmp: 0.20, pulsePhase: 3.0, pulseSpeed: 0.35, highFreqSensitivity: 0.8 },
  { hueShift: -30, satMul: 0.7, lightBase: 0.25, baseRadiusFrac: 0.28, xPhase: 1.0,  yPhase: 4.5, xSpeed: 0.25, ySpeed: 0.10, xAmp: 0.20, yAmp: 0.12, pulsePhase: 4.5, pulseSpeed: 0.6,  highFreqSensitivity: 1.0 },
];

// ── iPod 2001: LCD-style frequency spectrum ────────────────────────────────
// Vertical bars like the classic iPod battery/signal meter, audio-reactive

interface IpodBar {
  targetH: number;
  currentH: number;
}

function drawIpodCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  smoothedBars: IpodBar[]
) {
  // Black LCD background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const barCount = Math.min(64, Math.floor(w / 8));
  const barW = Math.max(3, Math.floor((w * 0.8) / barCount) - 2);
  const gap = 2;
  const totalW = barCount * (barW + gap) - gap;
  const startX = (w - totalW) / 2;
  const bottomY = h * 0.85;

  // Ensure enough bars
  while (smoothedBars.length < barCount) {
    smoothedBars.push({ targetH: 0, currentH: 0 });
  }

  for (let i = 0; i < barCount; i++) {
    const freqIdx = Math.floor((i / barCount) * freqData.length * 0.8);
    const raw = freqData[freqIdx] / 255;
    const smoothed = smoothedBars[i];

    smoothed.targetH = raw * h * 0.65;
    // Instant for iPod (no smoothing — LCD feel)
    smoothed.currentH = smoothed.targetH;

    const barH = Math.max(2, smoothed.currentH);
    const x = startX + i * (barW + gap);

    // Blue gradient bar
    const grad = ctx.createLinearGradient(x, bottomY, x, bottomY - barH);
    grad.addColorStop(0, "rgba(42,127,255,0.9)");
    grad.addColorStop(0.3, "rgba(42,127,255,0.7)");
    grad.addColorStop(0.7, "rgba(42,127,255,0.4)");
    grad.addColorStop(1, "rgba(42,127,255,0.15)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, bottomY - barH, barW, barH);

    // Bright tip
    if (barH > 4) {
      ctx.fillStyle = "rgba(100,180,255,0.9)";
      ctx.fillRect(x, bottomY - barH, barW, 2);
    }

    // Baseline
    ctx.fillStyle = "rgba(42,127,255,0.15)";
    ctx.fillRect(x, bottomY, barW, 1);
  }

  // iPod-style bottom text: "Now Playing"
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "11px 'ChicagoFLF', 'Geneva', 'Helvetica Neue', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("♪ NOW PLAYING", w / 2, h * 0.95);

  // Top: subtle time marker bars (like iPod progress)
  const timeProgress = (t * 0.1) % 1;
  ctx.fillStyle = "rgba(42,127,255,0.08)";
  ctx.fillRect(w * 0.1, h * 0.06, w * 0.8 * timeProgress, 2);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(w * 0.1, h * 0.06, w * 0.8, 2);

  // Subtle vignette
  const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}

// ── Japan: Zen ink circles + ripple effect ─────────────────────────────────

interface InkRipple {
  x: number; y: number; radius: number; maxRadius: number;
  alpha: number; speed: number; thickness: number;
}

function drawJapanCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bass: number, mid: number, high: number,
  t: number,
  ripples: InkRipple[]
) {
  // Warm parchment gradient background
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.6);
  bgGrad.addColorStop(0, "#f0ebe3");
  bgGrad.addColorStop(1, "#e8e0d4");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle paper texture grid (washi)
  ctx.strokeStyle = "rgba(196,30,58,0.03)";
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  for (let x = gridSize; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = gridSize; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Zen circle (ensō) — size reacts to bass
  const ensoSize = Math.min(w, h) * (0.2 + bass * 0.25);
  const cx = w * 0.5;
  const cy = h * 0.45;

  ctx.save();
  ctx.globalAlpha = 0.12 + bass * 0.15;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3 + bass * 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  // Incomplete circle (wabi-sabi)
  const startAngle = -Math.PI * 0.8 + Math.sin(t * 0.2) * 0.1;
  const endAngle = Math.PI * 1.4 + Math.cos(t * 0.15) * 0.1;
  ctx.arc(cx, cy, ensoSize, startAngle, endAngle);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Spawn ripples on bass hits
  if (bass > 0.6 && Math.random() > 0.7) {
    ripples.push({
      x: cx + (Math.random() - 0.5) * ensoSize * 1.5,
      y: cy + (Math.random() - 0.5) * ensoSize * 1.5,
      radius: 10,
      maxRadius: 80 + bass * 120,
      alpha: 0.3 + bass * 0.2,
      speed: 1.5 + bass * 2,
      thickness: 1 + bass * 2,
    });
  }

  // Draw and update ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += r.speed;
    r.alpha *= 0.985;
    if (r.alpha < 0.01 || r.radius > r.maxRadius) {
      ripples.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(196,30,58,${r.alpha})`;
    ctx.lineWidth = r.thickness;
    ctx.stroke();
  }
  // Keep ripples array manageable
  if (ripples.length > 30) ripples.splice(0, ripples.length - 30);

  // Floating cherry blossom petals
  const petalCount = 12;
  for (let i = 0; i < petalCount; i++) {
    const px = (w * 0.15) + (w * 0.7) * ((i * 0.618 + t * 0.02 * (0.5 + i * 0.1)) % 1);
    const py = (h * 0.1) + (h * 0.8) * ((i * 0.381 + t * 0.015 * (0.3 + i * 0.08)) % 1);
    const sway = Math.sin(t * 0.5 + i * 1.3) * 15;
    const rot = t * 0.3 + i * 0.8;
    const size = 4 + Math.sin(t * 0.8 + i * 2.1) * 2;

    ctx.save();
    ctx.translate(px + sway, py);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.15 + mid * 0.2;

    // Petal: two overlapping ellipses
    ctx.fillStyle = "rgba(232,180,188,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245,210,215,0.3)";
    ctx.beginPath();
    ctx.ellipse(size * 0.3, 0, size * 0.5, size * 0.3, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Ink brush strokes at bottom — react to mid frequencies
  ctx.save();
  ctx.globalAlpha = 0.06 + mid * 0.08;
  ctx.fillStyle = "#1a1a1a";
  for (let i = 0; i < 5; i++) {
    const bx = w * (0.2 + i * 0.15);
    const bh = 20 + mid * 60 + Math.sin(t * 0.3 + i) * 10;
    const bw = 15 + mid * 30;
    ctx.beginPath();
    ctx.ellipse(bx, h - 10, bw, bh, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Red seal stamp (hanko) — top right
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#c41e3a";
  const sealSize = 24 + bass * 8;
  ctx.fillRect(w - sealSize - 30, 30, sealSize, sealSize);
  ctx.globalAlpha = 0.4;
  ctx.font = `${Math.floor(sealSize * 0.5)}px serif`;
  ctx.fillStyle = "#f0ebe3";
  ctx.textAlign = "center";
  ctx.fillText("楽", w - 30 - sealSize / 2, 30 + sealSize * 0.6);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Swag: Minimal silver EQ + subtle floating dots ───────────────────────

interface SilverDot {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number;
}

function drawSwagCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  particles: SilverDot[],
  lastBassHit: { value: number }
) {
  // Near-black with cool undertone
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, w, h);

  // Subtle silver radial glow reactive to bass
  const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.6, 0, w * 0.5, h * 0.6, Math.max(w, h) * 0.5);
  glowGrad.addColorStop(0, `rgba(161,161,170,${0.02 + bass * 0.05})`);
  glowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // Clean symmetric EQ bars — silver monochrome
  const barCount = 48;
  const totalBarW = w * 0.85;
  const barW = totalBarW / barCount * 0.55;
  const barGap = totalBarW / barCount * 0.45;
  const startX = (w - totalBarW) / 2;
  const centerY = h * 0.5;

  for (let i = 0; i < barCount; i++) {
    const freqIdx = Math.floor((i / barCount) * freqData.length * 0.75);
    const raw = freqData[freqIdx] / 255;
    const dist = Math.abs(i - barCount / 2) / (barCount / 2);
    const barH = Math.max(1, raw * h * 0.6 * (1 - dist * 0.3));
    const x = startX + i * (barW + barGap);

    // Silver — single color, clean
    const alpha = 0.15 + raw * 0.45;
    ctx.fillStyle = `rgba(161,161,170,${alpha})`;
    ctx.fillRect(x, centerY - barH, barW, barH);

    // Mirror downward (more faded)
    ctx.fillStyle = `rgba(161,161,170,${alpha * 0.4})`;
    ctx.fillRect(x, centerY, barW, barH * 0.7);
  }

  // Subtle center line
  ctx.fillStyle = `rgba(161,161,170,${0.06 + bass * 0.08})`;
  ctx.fillRect(startX, centerY - 0.5, totalBarW, 1);

  // Bass hit → spawn subtle floating dots
  if (bass > 0.55 && bass - lastBassHit.value > 0.1) {
    const count = Math.floor(2 + bass * 5);
    for (let j = 0; j < count; j++) {
      particles.push({
        x: w * 0.5 + (Math.random() - 0.5) * w * 0.5,
        y: centerY + (Math.random() - 0.5) * h * 0.3,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(0.3 + Math.random() * 1.5),
        size: 1 + Math.random() * 2,
        life: 0,
        maxLife: 50 + Math.random() * 80,
        alpha: 0.3 + Math.random() * 0.4,
      });
    }
  }
  lastBassHit.value = bass;

  // Update & draw dots — subtle, minimal
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.005; // slow float up
    p.life++;
    if (p.life > p.maxLife) {
      particles.splice(i, 1);
      continue;
    }
    const lifeRatio = 1 - p.life / p.maxLife;
    const fade = lifeRatio < 0.3 ? lifeRatio / 0.3 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);
    const a = fade * p.alpha;
    ctx.fillStyle = `rgba(161,161,170,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  if (particles.length > 100) particles.splice(0, particles.length - 100);
}

// ── Default: Gradient orbs (original) ─────────────────────────────────────

function drawDefaultOrbs(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bass: number, mid: number, high: number,
  isPlaying: boolean,
  t: number,
  accentHex: string,
) {
  const [ar, ag, ab] = parseHex(accentHex);
  const [accentHue, accentSat, accentLight] = rgbToHsl(ar, ag, ab);
  const minDim = Math.min(w, h);

  ctx.globalCompositeOperation = "lighter";
  for (const orb of ORB_CONFIGS) {
    const hue = accentHue + orb.hueShift;
    const sat = accentSat * orb.satMul;
    const pulseFactor = 1 + bass * 0.6 * Math.sin(t * orb.pulseSpeed + orb.pulsePhase);
    const radius = Math.max(10, minDim * orb.baseRadiusFrac * pulseFactor);
    const driftBoost = 1 + mid * 0.5;
    const x = w * (0.5 + orb.xAmp * driftBoost * Math.sin(t * orb.xSpeed + orb.xPhase));
    const y = h * (0.5 + orb.yAmp * driftBoost * Math.cos(t * orb.ySpeed + orb.yPhase));
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
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrackCanvas({ isActive, isPlaying, currentStyle }: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const freqDataRef = useRef(new Uint8Array(128));
  const smoothBassRef = useRef(0);
  const smoothMidRef = useRef(0);
  const smoothHighRef = useRef(0);

  // Per-style state
  const ipodBarsRef = useRef<IpodBar[]>([]);
  const japanRipplesRef = useRef<InkRipple[]>([]);
  const swagParticlesRef = useRef<SilverDot[]>([]);
  const swagBassHitRef = useRef({ value: 0 });

  const getAccentColor = useCallback(() => {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim();
      if (val && val.startsWith("#") && val.length >= 7) return val;
    } catch {}
    return "#e03131";
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let lastFrame = 0;
    const targetInterval = 1000 / 30;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const draw = (timestamp: number) => {
      animRef.current = requestAnimationFrame(draw);

      if (timestamp - lastFrame < targetInterval) return;
      lastFrame = timestamp;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w === 0 || h === 0) return;

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
        for (let i = 0; i < freqData.length; i++) {
          freqData[i] = Math.floor(freqData[i] * 0.9);
        }
      }

      const rawBass = bandAverage(freqData, 0, 0.12);
      const rawMid = bandAverage(freqData, 0.12, 0.5);
      const rawHigh = bandAverage(freqData, 0.5, 1.0);

      const smoothFactor = isPlaying ? 0.18 : 0.05;
      smoothBassRef.current = lerp(smoothBassRef.current, rawBass, smoothFactor);
      smoothMidRef.current = lerp(smoothMidRef.current, rawMid, smoothFactor);
      smoothHighRef.current = lerp(smoothHighRef.current, rawHigh, smoothFactor);

      const bass = smoothBassRef.current;
      const mid = smoothMidRef.current;
      const high = smoothHighRef.current;
      const t = performance.now() / 1000;

      // ── Style-specific rendering ─────────────────────────────────────
      switch (currentStyle) {
        case "ipod-2001":
          drawIpodCanvas(ctx, w, h, freqData, bass, mid, high, t, ipodBarsRef.current);
          break;

        case "japan":
          drawJapanCanvas(ctx, w, h, bass, mid, high, t, japanRipplesRef.current);
          break;

        case "swag":
          drawSwagCanvas(ctx, w, h, freqData, bass, mid, high, t, swagParticlesRef.current, swagBassHitRef.current);
          break;

        default: {
          // Default: original orb visualization
          const accentHex = getAccentColor();
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);
          drawDefaultOrbs(ctx, w, h, bass, mid, high, isPlaying, t, accentHex);
          // Vignette
          ctx.globalCompositeOperation = "source-over";
          const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
          vigGrad.addColorStop(0, "rgba(0,0,0,0)");
          vigGrad.addColorStop(1, "rgba(0,0,0,0.5)");
          ctx.fillStyle = vigGrad;
          ctx.fillRect(0, 0, w, h);
          break;
        }
      }
    };

    draw(performance.now());

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isActive, isPlaying, currentStyle, getAccentColor]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 2 }}
    />
  );
}
