"use client";

import { useRef, useEffect, useCallback } from "react";
import { getAnalyser, getFrequencyData } from "@/lib/audioEngine";

interface TrackCanvasProps {
  isActive: boolean;
  isPlaying: boolean;
  currentStyle?: string | null;
  styleVariant?: string | null;
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

// ── iPod 2001: LCD pixel grid + segmented frequency bars ─────────────────

interface IpodBar {
  targetH: number;
  currentH: number;
}

// Smoothed iPod bars for animation
const ipodSmoothBars = new Float32Array(64);

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

  // ── Simple blue backlight glow (CSS handles the LCD scanline effect) ──
  ctx.fillStyle = `rgba(42,127,255,${0.02 + bass * 0.03})`;
  ctx.fillRect(0, 0, w, h);

  const barCount = Math.min(32, Math.floor(w / 10));
  const segH = 5; // height of each segment
  const segGap = 1;
  const barW = Math.max(4, Math.floor((w * 0.75) / barCount) - 2);
  const gap = 2;
  const totalW = barCount * (barW + gap) - gap;
  const startX = (w - totalW) / 2;
  const bottomY = h * 0.82;
  const maxSegs = Math.floor((h * 0.6) / (segH + segGap));

  // Ensure enough bars
  while (smoothedBars.length < barCount) {
    smoothedBars.push({ targetH: 0, currentH: 0 });
  }

  for (let i = 0; i < barCount; i++) {
    const freqIdx = Math.floor((i / barCount) * freqData.length * 0.8);
    const raw = freqData[freqIdx] / 255;

    // Smooth
    ipodSmoothBars[i] += (raw - ipodSmoothBars[i]) * 0.25;
    const val = ipodSmoothBars[i];

    const activeSegs = Math.max(0, Math.round(val * maxSegs));
    const x = startX + i * (barW + gap);

    for (let s = 0; s < activeSegs; s++) {
      const sy = bottomY - s * (segH + segGap);
      const intensity = 0.4 + (s / maxSegs) * 0.6;
      const segBrightness = val > 0.7 && s > activeSegs * 0.8 ? 1 : intensity;

      // Segment bar
      ctx.fillStyle = `rgba(42,127,255,${segBrightness * 0.85})`;
      ctx.fillRect(x, sy, barW, segH);

      // Bright highlight on top edge of segment
      ctx.fillStyle = `rgba(120,190,255,${segBrightness * 0.3})`;
      ctx.fillRect(x, sy, barW, 1);
    }

    // Dim baseline pixel
    ctx.fillStyle = "rgba(42,127,255,0.12)";
    ctx.fillRect(x, bottomY, barW, 1);
  }

  // ── Center divider line (like iPod display border) ────────────────────
  ctx.fillStyle = "rgba(42,127,255,0.06)";
  ctx.fillRect(w * 0.08, bottomY + 4, w * 0.84, 1);

  // ── Bottom text: "NOW PLAYING" ────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "10px 'ChicagoFLF', 'Geneva', 'Helvetica Neue', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("\u266A NOW PLAYING", w / 2, h * 0.93);

  // ── Top progress bar (iPod style) ─────────────────────────────────────
  const timeProgress = (t * 0.1) % 1;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(w * 0.1, h * 0.05, w * 0.8, 3);
  ctx.fillStyle = "rgba(42,127,255,0.2)";
  ctx.fillRect(w * 0.1, h * 0.05, w * 0.8 * timeProgress, 3);
  ctx.fillStyle = "rgba(100,180,255,0.5)";
  ctx.fillRect(w * 0.1 + w * 0.8 * timeProgress - 2, h * 0.05, 2, 3);

  // ── Frequency response meter (right side) ─────────────────────────────
  const meterH = h * 0.4;
  const meterW = 3;
  const meterX = w * 0.92;
  const meterY = (h - meterH) * 0.5;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.fillStyle = "rgba(42,127,255,0.35)";
  ctx.fillRect(meterX, meterY + meterH * (1 - bass), meterW, meterH * bass);

  // ── LCD vignette ─────────────────────────────────────────────────────
  const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}

// ── Japan: Audio-reactive ink zen + frequency brush ─────────────────────

interface InkRipple {
  x: number; y: number; radius: number; maxRadius: number;
  alpha: number; speed: number; thickness: number;
}

// Ink drops for Japan
interface InkDrop {
  x: number; y: number; size: number; alpha: number;
  vx: number; vy: number; life: number; maxLife: number;
}

const japanSmoothed = new Float32Array(32);

function drawJapanCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
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
  ctx.strokeStyle = "rgba(139,34,82,0.025)";
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  for (let x = gridSize; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = gridSize; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // ── Audio-reactive ink brush stroke (center) ──────────────────────────
  const cx = w * 0.5;
  const cy = h * 0.45;
  const inkCount = 32;

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < inkCount; i++) {
    const freqIdx = Math.floor((i / inkCount) * freqData.length * 0.7);
    const raw = freqData[freqIdx] / 255;
    japanSmoothed[i] += (raw - japanSmoothed[i]) * 0.15;
    const val = japanSmoothed[i];

    const angle = (i / inkCount) * Math.PI * 2 + t * 0.1;
    const baseLen = Math.min(w, h) * 0.15;
    const brushLen = baseLen + val * baseLen * 1.5;
    const startR = Math.min(w, h) * (0.08 + bass * 0.05);

    const x1 = cx + Math.cos(angle) * startR;
    const y1 = cy + Math.sin(angle) * startR;
    const x2 = cx + Math.cos(angle) * (startR + brushLen);
    const y2 = cy + Math.sin(angle) * (startR + brushLen);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    // Slight curve for brush feel
    const cpx = (x1 + x2) / 2 + Math.sin(angle + t * 0.3) * val * 20;
    const cpy = (y1 + y2) / 2 + Math.cos(angle + t * 0.3) * val * 20;
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.strokeStyle = `rgba(26,26,26,${0.04 + val * 0.12})`;
    ctx.lineWidth = 1 + val * 4;
    ctx.stroke();
  }
  ctx.restore();

  // ── Zen circle (ensō) — size reacts to bass ───────────────────────────
  const ensoSize = Math.min(w, h) * (0.2 + bass * 0.2);

  ctx.save();
  ctx.globalAlpha = 0.1 + bass * 0.12;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2 + bass * 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  const startAngle = -Math.PI * 0.8 + Math.sin(t * 0.2) * 0.1;
  const endAngle = Math.PI * 1.4 + Math.cos(t * 0.15) * 0.1;
  ctx.arc(cx, cy, ensoSize, startAngle, endAngle);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Spawn ripples on bass hits ────────────────────────────────────────
  if (bass > 0.55 && Math.random() > 0.6) {
    ripples.push({
      x: cx + (Math.random() - 0.5) * ensoSize * 1.5,
      y: cy + (Math.random() - 0.5) * ensoSize * 1.5,
      radius: 10,
      maxRadius: 60 + bass * 100,
      alpha: 0.25 + bass * 0.15,
      speed: 1.2 + bass * 1.5,
      thickness: 1 + bass * 1.5,
    });
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += r.speed;
    r.alpha *= 0.987;
    if (r.alpha < 0.01 || r.radius > r.maxRadius) {
      ripples.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(139,34,82,${r.alpha})`;
    ctx.lineWidth = r.thickness;
    ctx.stroke();
  }
  if (ripples.length > 30) ripples.splice(0, ripples.length - 30);

  // ── Floating cherry blossom petals ────────────────────────────────────
  const petalCount = 14;
  for (let i = 0; i < petalCount; i++) {
    const px = (w * 0.1) + (w * 0.8) * ((i * 0.618 + t * 0.018 * (0.5 + i * 0.1)) % 1);
    const py = (h * 0.05) + (h * 0.9) * ((i * 0.381 + t * 0.012 * (0.3 + i * 0.08)) % 1);
    const sway = Math.sin(t * 0.5 + i * 1.3) * 18;
    const rot = t * 0.3 + i * 0.8;
    const size = 4 + Math.sin(t * 0.8 + i * 2.1) * 2;

    ctx.save();
    ctx.translate(px + sway, py);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.12 + mid * 0.18;

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

  // ── Ink brush strokes at bottom — react to mid ────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.05 + mid * 0.06;
  ctx.fillStyle = "#1a1a1a";
  for (let i = 0; i < 6; i++) {
    const bx = w * (0.15 + i * 0.13);
    const bh = 15 + mid * 50 + Math.sin(t * 0.3 + i) * 8;
    const bw = 12 + mid * 25;
    ctx.beginPath();
    ctx.ellipse(bx, h - 10, bw, bh, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Red seal stamp (hanko) — top right ────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#8b2252";
  const sealSize = 22 + bass * 6;
  ctx.fillRect(w - sealSize - 25, 25, sealSize, sealSize);
  ctx.globalAlpha = 0.35;
  ctx.font = `${Math.floor(sealSize * 0.5)}px serif`;
  ctx.fillStyle = "#f0ebe3";
  ctx.textAlign = "center";
  ctx.fillText("\u697d", w - 25 - sealSize / 2, 25 + sealSize * 0.6);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Vertical text (kanji) on the left ──────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.06 + high * 0.06;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "14px serif";
  ctx.textAlign = "center";
  const kanji = ["\u97f3", "\u697d", "\u98a8"];
  kanji.forEach((ch, i) => {
    ctx.fillText(ch, 18, h * 0.3 + i * 22);
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Swag: Liquid Mercury — morphing blob + ripple rings + metallic threads ──

interface SwagParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number; angle: number;
}

// Ripple rings expanding from center
interface MercuryRipple {
  radius: number; maxRadius: number; alpha: number; speed: number;
}

const swagPlasmaSmooth = new Float32Array(32);
const mercuryRipples: MercuryRipple[] = [];

function drawSwagCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  particles: SwagParticle[],
  lastBassHit: { value: number },
  isLight = false
) {
  // Background
  const bg = isLight ? "#f2f2f5" : "#07070a";
  const silverR = isLight ? 90 : 176;
  const silverG = isLight ? 90 : 176;
  const silverB = isLight ? 100 : 184;
  const brightR = isLight ? 60 : 208;
  const brightG = isLight ? 60 : 208;
  const brightB = isLight ? 70 : 216;
  const dimR = isLight ? 140 : 107;
  const dimG = isLight ? 140 : 107;
  const dimB = isLight ? 150 : 120;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);

  // ── Ambient mercury glow pulsing with bass ──────────────────────
  const glowR = minDim * 0.5;
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  const glowAlpha = isLight ? (0.03 + bass * 0.04) : (0.04 + bass * 0.06);
  glowGrad.addColorStop(0, `rgba(${silverR},${silverG},${silverB},${glowAlpha})`);
  glowGrad.addColorStop(0.5, `rgba(${silverR},${silverG},${silverB},${glowAlpha * 0.3})`);
  glowGrad.addColorStop(1, `rgba(${silverR},${silverG},${silverB},0)`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Mercury blob — morphing circle with wobble ────────────────────
  const blobBaseR = minDim * (0.12 + bass * 0.06);
  const blobPoints = 64;
  const blobLayers = 3;

  for (let layer = 0; layer < blobLayers; layer++) {
    const layerScale = 1 - layer * 0.25;
    const layerAlpha = isLight
      ? (0.06 - layer * 0.015 + bass * 0.04)
      : (0.08 - layer * 0.02 + bass * 0.06);
    const layerBright = 1 + layer * 0.15;

    ctx.beginPath();
    for (let i = 0; i <= blobPoints; i++) {
      const angle = (i / blobPoints) * Math.PI * 2;
      const freqIdx = Math.floor((i / blobPoints) * freqData.length * 0.6);
      const raw = freqData[freqIdx] / 255;
      swagPlasmaSmooth[i % 32] += (raw - swagPlasmaSmooth[i % 32]) * 0.12;
      const val = swagPlasmaSmooth[i % 32];

      // Wobble: multi-frequency deformation
      const wobble1 = Math.sin(angle * 3 + t * (1.2 + layer * 0.3) + layer) * (4 + val * 14 + bass * 8) * layerScale;
      const wobble2 = Math.sin(angle * 5 - t * 0.8 + layer * 2) * (2 + mid * 8) * layerScale;
      const wobble3 = Math.cos(angle * 7 + t * 1.5) * (1 + high * 5) * layerScale;
      const r = blobBaseR * layerScale + wobble1 + wobble2 + wobble3;

      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Mercury gradient fill
    const blobGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, blobBaseR * layerScale * 1.2);
    const br = Math.min(255, Math.round(brightR * layerBright));
    const bg2 = Math.min(255, Math.round(brightG * layerBright));
    const bb = Math.min(255, Math.round(brightB * layerBright));
    blobGrad.addColorStop(0, `rgba(${br},${bg2},${bb},${layerAlpha})`);
    blobGrad.addColorStop(0.6, `rgba(${silverR},${silverG},${silverB},${layerAlpha * 0.5})`);
    blobGrad.addColorStop(1, `rgba(${silverR},${silverG},${silverB},0)`);
    ctx.fillStyle = blobGrad;
    ctx.fill();

    // Thin edge stroke
    ctx.strokeStyle = `rgba(${brightR},${brightG},${brightB},${layerAlpha * 0.6})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // ── Center specular highlight ─────────────────────────────────────
  const specSize = minDim * 0.03;
  const specGrad = ctx.createRadialGradient(cx - specSize * 0.3, cy - specSize * 0.3, 0, cx, cy, specSize);
  specGrad.addColorStop(0, `rgba(${brightR},${brightG},${brightB},${0.08 + high * 0.15})`);
  specGrad.addColorStop(1, `rgba(${brightR},${brightG},${brightB},0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, specSize, 0, Math.PI * 2);
  ctx.fillStyle = specGrad;
  ctx.fill();

  // ── Expanding ripple rings on bass hits ─────────────────────────────
  if (bass > 0.5 && bass - lastBassHit.value > 0.1) {
    mercuryRipples.push({
      radius: blobBaseR * 0.8,
      maxRadius: minDim * (0.35 + bass * 0.15),
      alpha: 0.15 + bass * 0.12,
      speed: 0.8 + bass * 1.2,
    });
  }
  lastBassHit.value = bass;

  for (let i = mercuryRipples.length - 1; i >= 0; i--) {
    const rp = mercuryRipples[i];
    rp.radius += rp.speed;
    rp.alpha *= 0.985;
    if (rp.alpha < 0.005 || rp.radius > rp.maxRadius) {
      mercuryRipples.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rp.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${silverR},${silverG},${silverB},${rp.alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (mercuryRipples.length > 8) mercuryRipples.splice(0, mercuryRipples.length - 8);

  // ── Metallic threads: 24 thin lines from blob surface to outer ring ─
  const threadCount = 24;
  const outerR = minDim * 0.38;

  for (let i = 0; i < threadCount; i++) {
    const angle = (i / threadCount) * Math.PI * 2 + t * 0.03;
    const freqIdx = Math.floor((i / threadCount) * freqData.length * 0.7);
    const raw = freqData[freqIdx] / 255;
    const val = raw;

    // Inner point on blob surface (wobbles)
    const innerR = blobBaseR * (0.9 + val * 0.3 + Math.sin(angle * 3 + t * 1.2) * 0.08);
    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;

    // Outer point
    const outerWobble = Math.sin(t * 0.4 + i * 1.3) * 6 * (1 + val);
    const outerDist = outerR + outerWobble;
    const x2 = cx + Math.cos(angle) * outerDist;
    const y2 = cy + Math.sin(angle) * outerDist;

    // Control point for curve
    const midR = (innerR + outerDist) * 0.55;
    const curveOffset = Math.sin(t * 0.6 + i * 0.9) * 15 * (0.5 + val);
    const cpx = cx + Math.cos(angle + 0.05) * midR + Math.cos(angle + Math.PI * 0.5) * curveOffset;
    const cpy = cy + Math.sin(angle + 0.05) * midR + Math.sin(angle + Math.PI * 0.5) * curveOffset;

    const threadAlpha = isLight ? (0.03 + val * 0.06) : (0.03 + val * 0.1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.strokeStyle = `rgba(${silverR},${silverG},${silverB},${threadAlpha})`;
    ctx.lineWidth = 0.5 + val * 0.5;
    ctx.stroke();

    // Tiny dot at outer end
    if (val > 0.3) {
      ctx.beginPath();
      ctx.arc(x2, y2, 1 + val, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${brightR},${brightG},${brightB},${threadAlpha * 0.8})`;
      ctx.fill();
    }
  }

  // ── Outer containment ring ────────────────────────────────────────
  const ringPulse = outerR * (1 + bass * 0.02);
  ctx.beginPath();
  ctx.arc(cx, cy, ringPulse, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${silverR},${silverG},${silverB},${isLight ? 0.06 : 0.04 + bass * 0.06})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // ── Bass hit — spawn mercury droplets ─────────────────────────────
  if (bass > 0.55 && bass - lastBassHit.value > 0.08) {
    const count = 1 + Math.floor(bass * 2);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = blobBaseR + Math.random() * outerR * 0.4;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * (0.1 + Math.random() * 0.4),
        vy: Math.sin(angle) * (0.1 + Math.random() * 0.4),
        size: 0.8 + Math.random() * 1.5,
        life: 0,
        maxLife: 60 + Math.random() * 80,
        alpha: 0.1 + Math.random() * 0.2,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  // ── Update & draw particles — small mercury drops ──────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.995;
    p.vy *= 0.995;
    p.angle += 0.01;
    p.life++;
    if (p.life > p.maxLife) {
      particles.splice(i, 1);
      continue;
    }
    const lifeRatio = 1 - p.life / p.maxLife;
    const fade = lifeRatio < 0.15 ? lifeRatio / 0.15 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);
    const a = fade * p.alpha;

    // Small circle (mercury drop)
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${brightR},${brightG},${brightB},${a})`;
    ctx.fill();
  }
  if (particles.length > 60) particles.splice(0, particles.length - 60);
}

// ── Neon: Tron grid + circular spectrum + neon particles ─────────────
interface NeonParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number; color: string;
}
const neonSmoothed = new Float32Array(32);

function drawNeonCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  particles: NeonParticle[],
  lastBassHit: { value: number },
  isLight = false
) {
  const bgColor = isLight ? "#f0f8f4" : "#0a0a14";
  const gR = isLight ? 0 : 0, gG = isLight ? 170 : 255, gB = isLight ? 102 : 136;
  const pR = isLight ? 200 : 255, pG = isLight ? 0 : 0, pB = isLight ? 80 : 102;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);

  // ── Rotating hexagonal grid pulsing with bass ───────────────────
  ctx.save();
  const hexAlpha = isLight ? (0.04 + bass * 0.03) : (0.025 + bass * 0.02);
  ctx.globalAlpha = hexAlpha;
  ctx.strokeStyle = `rgb(${gR},${gG},${gB})`;
  ctx.lineWidth = 0.5;

  const hexR = minDim * 0.35;
  const hexRot = t * 0.08;
  const hexSides = 6;
  for (let ring = 0; ring < 3; ring++) {
    const r = hexR * (0.5 + ring * 0.25) * (1 + bass * 0.05);
    ctx.beginPath();
    for (let s = 0; s <= hexSides; s++) {
      const angle = (s / hexSides) * Math.PI * 2 + hexRot + ring * 0.3;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // Radial spokes
    for (let s = 0; s < hexSides; s++) {
      const angle = (s / hexSides) * Math.PI * 2 + hexRot + ring * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── Circular frequency spectrum (32 segments) with neon glow ────
  const specR = minDim * 0.18;
  const barCount = 32;

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, specR + minDim * 0.13, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${gR},${gG},${gB},${0.04 + bass * 0.06})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  for (let i = 0; i < barCount; i++) {
    const freqIdx = Math.floor((i / barCount) * freqData.length * 0.75);
    const raw = freqData[freqIdx] / 255;
    neonSmoothed[i] += (raw - neonSmoothed[i]) * 0.18;
    const val = neonSmoothed[i];

    const angle = (i / barCount) * Math.PI * 2 - Math.PI * 0.5;
    const maxBarH = minDim * 0.16;
    const barH = val * maxBarH;

    const x1 = cx + Math.cos(angle) * specR;
    const y1 = cy + Math.sin(angle) * specR;
    const x2 = cx + Math.cos(angle) * (specR + barH);
    const y2 = cy + Math.sin(angle) * (specR + barH);

    const isTip = val > 0.7;

    // Soft outer glow pass
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (isTip) {
      ctx.strokeStyle = `rgba(${pR},${pG},${pB},${val * 0.15})`;
    } else {
      ctx.strokeStyle = `rgba(${gR},${gG},${gB},${val * 0.12})`;
    }
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();

    // Bright core pass
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (isTip) {
      ctx.strokeStyle = `rgba(${pR},${pG},${pB},${0.35 + val * 0.5})`;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = `rgba(${gR},${gG},${gB},${0.2 + val * 0.5})`;
      ctx.lineWidth = 2;
    }
    ctx.lineCap = "round";
    ctx.stroke();

    // Glow dot at bar tip
    if (val > 0.5) {
      const dotR = 2 + val;
      const dotGrad = ctx.createRadialGradient(x2, y2, 0, x2, y2, dotR * 2);
      if (isTip) {
        dotGrad.addColorStop(0, `rgba(${pR},${pG},${pB},${val * 0.25})`);
        dotGrad.addColorStop(1, `rgba(${pR},${pG},${pB},0)`);
      } else {
        dotGrad.addColorStop(0, `rgba(${gR},${gG},${gB},${val * 0.2})`);
        dotGrad.addColorStop(1, `rgba(${gR},${gG},${gB},0)`);
      }
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(x2, y2, dotR * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, specR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${gR},${gG},${gB},${0.06 + mid * 0.08})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Center glow
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, specR);
  glowGrad.addColorStop(0, `rgba(${gR},${gG},${gB},${0.02 + bass * 0.04})`);
  glowGrad.addColorStop(1, `rgba(${gR},${gG},${gB},0)`);
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, specR, 0, Math.PI * 2);
  ctx.fill();

  // ── Bass hit — spawn neon particles ─────────────────────────────
  if (bass > 0.5 && bass - lastBassHit.value > 0.08) {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = specR * 0.8 + Math.random() * minDim * 0.15;
      const isPink = Math.random() > 0.5;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * (0.2 + Math.random() * 0.6),
        vy: Math.sin(angle) * (0.2 + Math.random() * 0.6),
        size: 2 + Math.random() * 3,
        life: 0,
        maxLife: 60 + Math.random() * 80,
        alpha: 0.3 + Math.random() * 0.4,
        color: isPink ? "pink" : "green",
      });
    }
  }
  lastBassHit.value = bass;

  // ── Update & draw neon particles (max 40) ───────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.995; p.vy *= 0.995;
    p.life++;
    if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
    const lifeRatio = 1 - p.life / p.maxLife;
    const fade = lifeRatio < 0.15 ? lifeRatio / 0.15 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);
    const a = fade * p.alpha;
    const isPink = p.color === "pink";
    const gr = isPink ? pR : gR, gg = isPink ? pG : gG, gb = isPink ? pB : gB;

    // Larger glow
    const glowR = p.size * 4;
    const gd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
    gd.addColorStop(0, `rgba(${gr},${gg},${gb},${a * 0.4})`);
    gd.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = gd;
    ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${gr},${gg},${gb},${a})`;
    ctx.fill();
  }
  if (particles.length > 40) particles.splice(0, particles.length - 40);

  // Outer ring
  const outerR = (specR + minDim * 0.13) * (1 + bass * 0.03);
  ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${gR},${gG},${gB},${0.03 + bass * 0.06})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

// ── Minimal: Thin undulating lines + center dot ───────────────────────
const minimalSmoothed = new Float32Array(16);

function drawMinimalCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  isLight = false,
) {
  // Background
  const bg = isLight ? "#ffffff" : "#fafafa";
  const lineR = isLight ? 200 : 17, lineG = isLight ? 200 : 17, lineB = isLight ? 210 : 17;
  const dotR = isLight ? 180 : 17, dotG = isLight ? 180 : 17, dotB = isLight ? 190 : 17;
  const gridDotR = isLight ? 210 : 17, gridDotG = isLight ? 210 : 17, gridDotB = isLight ? 220 : 17;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;

  // ── Subtle dot grid pattern ──────────────────────────────────────
  const dotSpacing = 28;
  const gridDotSize = 0.8;
  ctx.fillStyle = `rgba(${gridDotR},${gridDotG},${gridDotB},0.06)`;
  for (let x = dotSpacing; x < w; x += dotSpacing) {
    for (let y = dotSpacing; y < h; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, gridDotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── 5-7 undulating lines with varying opacities ────────────────
  const lines = [
    { yFrac: 0.2, speed: 0.25, freq: 1.8, alphaBase: 0.04, freqIdx: 0.1 },
    { yFrac: 0.33, speed: 0.4, freq: 2.5, alphaBase: 0.06, freqIdx: 0.2 },
    { yFrac: 0.46, speed: 0.5, freq: 3.0, alphaBase: 0.08, freqIdx: 0.35 },
    { yFrac: 0.58, speed: 0.35, freq: 2.2, alphaBase: 0.06, freqIdx: 0.5 },
    { yFrac: 0.7, speed: 0.3, freq: 1.5, alphaBase: 0.05, freqIdx: 0.65 },
    { yFrac: 0.82, speed: 0.45, freq: 2.8, alphaBase: 0.04, freqIdx: 0.8 },
  ];

  for (let li = 0; li < lines.length; li++) {
    const freqIdx = Math.floor(lines[li].freqIdx * freqData.length * 0.6);
    const raw = freqData[freqIdx] / 255;
    if (li < 8) minimalSmoothed[li] += (raw - minimalSmoothed[li]) * 0.18;
    const val = minimalSmoothed[li];

    const baseY = h * lines[li].yFrac;
    const speed = lines[li].speed;
    const freq = lines[li].freq;
    // Slight warm gray tone variation per line
    const warmth = li * 3;
    const lr = Math.min(255, lineR + warmth);
    const lg = Math.min(255, lineG + warmth);
    const lb = Math.min(255, lineB - warmth);
    const alpha = lines[li].alphaBase + val * 0.08;

    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const xn = x / w;
      const y = baseY
        + Math.sin(t * speed + xn * freq * Math.PI) * (3 + val * 14)
        + Math.sin(t * speed * 1.7 + xn * freq * 1.5 * Math.PI) * (1 + val * 6)
        + Math.cos(t * speed * 0.5 + xn * freq * 0.7 * Math.PI) * (0.5 + val * 3);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
    ctx.lineWidth = 0.8 + val * 0.3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── Center dot with pulse ring ──────────────────────────────────
  const bassFreqIdx = Math.floor(0.06 * freqData.length);
  const rawBass = freqData[bassFreqIdx] / 255;
  if (minimalSmoothed.length < 16) { /* already big enough */ }
  minimalSmoothed[8] += (rawBass - minimalSmoothed[8]) * 0.2;
  const bassVal = minimalSmoothed[8];

  const dotSize = 3 + bassVal * 2.5;
  const dotAlpha = 0.1 + bassVal * 0.35;

  ctx.beginPath();
  ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${dotR},${dotG},${dotB},${dotAlpha})`;
  ctx.fill();

  // Pulse ring on bass hits
  if (bassVal > 0.35) {
    const pulseR = dotSize + 8 + bassVal * 15;
    const pulseAlpha = bassVal * 0.12;;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${dotR},${dotG},${dotB},${pulseAlpha})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

// ── Liquid Glass: Apple-style displacement, refraction, chromatic aberration ──

// Offscreen canvas for displacement map (lazily initialized)
let _dispCanvas: HTMLCanvasElement | null = null;
let _dispCtx: CanvasRenderingContext2D | null = null;
let _bgCanvas: HTMLCanvasElement | null = null;
let _bgCtx: CanvasRenderingContext2D | null = null;

interface GlassParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number; hue: number;
}

interface GlassBlob {
  x: number; y: number; radius: number;
  hue: number; sat: number; vx: number; vy: number;
  phase: number; pulseSpeed: number;
}

const liquidGlassSmoothed = new Float32Array(32);

// Pre-create glass blobs (persistent state)
const glassBlobs: GlassBlob[] = [];
for (let i = 0; i < 5; i++) {
  glassBlobs.push({
    x: 0, y: 0, radius: 0,
    hue: [210, 250, 280, 310, 195][i],
    sat: [0.6, 0.5, 0.45, 0.4, 0.55][i],
    vx: 0, vy: 0,
    phase: i * 1.3,
    pulseSpeed: 0.2 + i * 0.08,
  });
}

function drawLiquidGlassCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  particles: GlassParticle[],
  lastBassHit: { value: number },
) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);

  // ── Lazy-init offscreen canvases ──────────────────────────────────────────
  if (!_dispCanvas || _dispCanvas.width !== w || _dispCanvas.height !== h) {
    _dispCanvas = document.createElement("canvas");
    _dispCanvas.width = w;
    _dispCanvas.height = h;
    _dispCtx = _dispCanvas.getContext("2d");
  }
  if (!_bgCanvas || _bgCanvas.width !== w || _bgCanvas.height !== h) {
    _bgCanvas = document.createElement("canvas");
    _bgCanvas.width = w;
    _bgCanvas.height = h;
    _bgCtx = _bgCanvas.getContext("2d");
  }
  const dispCtx = _dispCtx!;
  const bgCtx = _bgCtx!;

  // ── 1. Draw rich background to offscreen canvas (content to be distorted) ──
  bgCtx.fillStyle = "#080c18";
  bgCtx.fillRect(0, 0, w, h);

  // Animated gradient orbs (colorful source content)
  const bgOrbs = [
    { hue: 210, xFrac: 0.25, yFrac: 0.35, rFrac: 0.45, alpha: 0.25 },
    { hue: 260, xFrac: 0.72, yFrac: 0.30, rFrac: 0.40, alpha: 0.22 },
    { hue: 300, xFrac: 0.50, yFrac: 0.65, rFrac: 0.38, alpha: 0.18 },
    { hue: 195, xFrac: 0.15, yFrac: 0.70, rFrac: 0.32, alpha: 0.15 },
    { hue: 340, xFrac: 0.80, yFrac: 0.75, rFrac: 0.28, alpha: 0.12 },
  ];

  bgCtx.globalCompositeOperation = "lighter";
  for (const orb of bgOrbs) {
    const ox = w * orb.xFrac + Math.sin(t * 0.15 + orb.hue) * w * 0.04;
    const oy = h * orb.yFrac + Math.cos(t * 0.12 + orb.hue * 0.5) * h * 0.03;
    const pulseR = minDim * orb.rFrac * (1 + bass * 0.2 + mid * 0.1);
    const a = orb.alpha + bass * 0.08;

    const g = bgCtx.createRadialGradient(ox, oy, 0, ox, oy, pulseR);
    g.addColorStop(0, hslToRgba(orb.hue, 0.7, 0.55, a));
    g.addColorStop(0.4, hslToRgba(orb.hue, 0.6, 0.45, a * 0.6));
    g.addColorStop(1, hslToRgba(orb.hue, 0.5, 0.35, 0));
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, w, h);
  }
  bgCtx.globalCompositeOperation = "source-over";

  // Frequency bars as background texture (source for distortion)
  const barCount = 32;
  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor((i / barCount) * freqData.length * 0.7);
    const raw = freqData[idx] / 255;
    liquidGlassSmoothed[i] += (raw - liquidGlassSmoothed[i]) * 0.15;
    const val = liquidGlassSmoothed[i];
    if (val < 0.05) continue;

    const x = (i / barCount) * w;
    const barW = w / barCount;
    const barH = val * h * 0.25;
    const hue = 210 + (i / barCount) * 100;

    const barGrad = bgCtx.createLinearGradient(x, h, x, h - barH);
    barGrad.addColorStop(0, hslToRgba(hue, 0.6, 0.5, val * 0.3));
    barGrad.addColorStop(1, hslToRgba(hue, 0.5, 0.4, 0));
    bgCtx.fillStyle = barGrad;
    bgCtx.fillRect(x, h - barH, barW - 1, barH);
  }

  // Horizontal aurora bands
  for (let b = 0; b < 3; b++) {
    const baseY = h * (0.25 + b * 0.2) + Math.sin(t * 0.12 + b * 2) * h * 0.04;
    const bandH = h * (0.08 + mid * 0.06);
    bgCtx.beginPath();
    bgCtx.moveTo(0, baseY);
    bgCtx.bezierCurveTo(
      w * 0.33, baseY + Math.sin(t * 0.2 + b) * 25 - bandH * 0.4,
      w * 0.66, baseY + Math.cos(t * 0.15 + b) * 20 + bandH * 0.3,
      w, baseY - Math.sin(t * 0.18 + b) * 15,
    );
    bgCtx.lineTo(w, baseY + bandH);
    bgCtx.bezierCurveTo(
      w * 0.66, baseY + bandH + Math.cos(t * 0.13 + b) * 18,
      w * 0.33, baseY + bandH - Math.sin(t * 0.17 + b) * 12,
      0, baseY + bandH,
    );
    bgCtx.closePath();
    const hue1 = 210 + b * 50;
    const hue2 = hue1 + 40;
    const ag = bgCtx.createLinearGradient(0, baseY, w, baseY + bandH);
    const aa = 0.08 + mid * 0.06;
    ag.addColorStop(0, hslToRgba(hue1, 0.7, 0.5, aa * 0.4));
    ag.addColorStop(0.5, hslToRgba((hue1 + hue2) / 2, 0.65, 0.55, aa));
    ag.addColorStop(1, hslToRgba(hue2, 0.6, 0.5, aa * 0.4));
    bgCtx.fillStyle = ag;
    bgCtx.fill();
  }

  // Center ring
  const ringR = minDim * (0.2 + bass * 0.06);
  bgCtx.beginPath();
  bgCtx.arc(cx, cy, ringR, 0, Math.PI * 2);
  const ringGrad = bgCtx.createRadialGradient(cx, cy, ringR - 6, cx, cy, ringR + 6);
  ringGrad.addColorStop(0, `rgba(150,180,255,0)`);
  ringGrad.addColorStop(0.5, `rgba(150,180,255,${0.12 + bass * 0.15})`);
  ringGrad.addColorStop(1, `rgba(150,180,255,0)`);
  bgCtx.strokeStyle = `rgba(150,180,255,${0.2 + bass * 0.3})`;
  bgCtx.lineWidth = 1.5;
  bgCtx.stroke();

  // Circular spectrum inside ring
  const specBars = 48;
  for (let i = 0; i < specBars; i++) {
    const idx = Math.floor((i / specBars) * freqData.length * 0.6);
    const val = freqData[idx] / 255;
    if (val < 0.08) continue;
    const angle = (i / specBars) * Math.PI * 2 - Math.PI * 0.5;
    const x1 = cx + Math.cos(angle) * ringR;
    const y1 = cy + Math.sin(angle) * ringR;
    const barH = val * minDim * 0.08;
    const x2 = cx + Math.cos(angle) * (ringR + barH);
    const y2 = cy + Math.sin(angle) * (ringR + barH);
    bgCtx.beginPath();
    bgCtx.moveTo(x1, y1);
    bgCtx.lineTo(x2, y2);
    const hue = 210 + (i / specBars) * 120;
    bgCtx.strokeStyle = hslToRgba(hue, 0.7, 0.6, val * 0.4);
    bgCtx.lineWidth = 2;
    bgCtx.lineCap = "round";
    bgCtx.stroke();
  }

  // ── 2. Generate displacement map (perlin-like noise via sine interference) ──
  dispCtx.fillStyle = "#808080"; // neutral gray = zero displacement
  dispCtx.fillRect(0, 0, w, h);

  // Draw glass blobs as displacement sources
  for (let i = 0; i < glassBlobs.length; i++) {
    const blob = glassBlobs[i];
    // Smooth position with organic movement
    blob.x = w * (0.3 + 0.4 * Math.sin(t * 0.06 + blob.phase) * Math.cos(t * 0.04 + blob.phase * 0.7));
    blob.y = h * (0.3 + 0.4 * Math.cos(t * 0.05 + blob.phase * 1.3) * Math.sin(t * 0.07 + blob.phase * 0.5));
    blob.radius = minDim * (0.18 + bass * 0.06 + Math.sin(t * blob.pulseSpeed + blob.phase) * 0.03);

    // Displacement gradient: lighter = push right/down, darker = push left/up
    const dg = dispCtx.createRadialGradient(
      blob.x - blob.radius * 0.15, blob.y - blob.radius * 0.15, 0,
      blob.x, blob.y, blob.radius,
    );
    // Asymmetric gradient creates lens-like refraction
    const strength = 0.3 + bass * 0.2 + mid * 0.1;
    dg.addColorStop(0, `rgba(${180 + Math.floor(strength * 75)},${128 + Math.floor(strength * 50)},${128 + Math.floor(strength * 50)},0.9)`);
    dg.addColorStop(0.4, `rgba(160,130,140,0.5)`);
    dg.addColorStop(0.7, `rgba(120,110,120,0.2)`);
    dg.addColorStop(1, "rgba(128,128,128,0)");

    dispCtx.fillStyle = dg;
    dispCtx.beginPath();
    // Slightly egg-shaped blob for more organic distortion
    dispCtx.ellipse(blob.x, blob.y, blob.radius * 1.1, blob.radius * 0.9, t * 0.05 + blob.phase, 0, Math.PI * 2);
    dispCtx.fill();
  }

  // Add audio-reactive ripple distortions
  const rippleCount = 3;
  for (let r = 0; r < rippleCount; r++) {
    const rx = w * (0.3 + r * 0.2) + Math.sin(t * 0.1 + r) * w * 0.05;
    const ry = h * 0.5 + Math.cos(t * 0.08 + r * 1.5) * h * 0.1;
    const rr = minDim * (0.08 + bass * 0.04 + r * 0.03);
    const rg = dispCtx.createRadialGradient(rx, ry, rr * 0.5, rx, ry, rr);
    rg.addColorStop(0, `rgba(200,140,140,${0.15 + bass * 0.1})`);
    rg.addColorStop(0.5, `rgba(140,160,200,${0.08 + mid * 0.06})`);
    rg.addColorStop(1, "rgba(128,128,128,0)");
    dispCtx.fillStyle = rg;
    dispCtx.beginPath();
    dispCtx.arc(rx, ry, rr, 0, Math.PI * 2);
    dispCtx.fill();
  }

  // Fine noise layer for glass texture
  const noiseSize = 4;
  for (let nx = 0; nx < w; nx += noiseSize) {
    for (let ny = 0; ny < h; ny += noiseSize) {
      const n = Math.sin(nx * 0.05 + t * 0.3) * Math.cos(ny * 0.04 + t * 0.2) * 0.5 + 0.5;
      const v = Math.floor(128 + (n - 0.5) * 16);
      dispCtx.fillStyle = `rgba(${v},${v},${v},0.3)`;
      dispCtx.fillRect(nx, ny, noiseSize, noiseSize);
    }
  }

  // ── 3. Apply displacement filter to background ───────────────────────────
  // Use SVG feDisplacementMap via ctx.filter
  const scale = Math.floor(20 + bass * 30 + mid * 10);
  ctx.filter = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='d'%3E%3CfeImage href='data:image/png;base64,${canvasToBase64(_dispCanvas)}' result='dm'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='dm' scale='${scale}' xChannelSelector='R' yChannelSelector='G'/%3E%3C/filter%3E%3C/svg%3E#d") blur(${Math.max(0, 0.3 + bass * 0.5)}px)`;

  // Draw background through displacement
  ctx.drawImage(_bgCanvas, 0, 0);
  ctx.filter = "none";

  // ── 4. Glass surface highlights (after displacement) ────────────────────
  // Top-left specular highlight on each glass blob
  for (const blob of glassBlobs) {
    const hlX = blob.x - blob.radius * 0.25;
    const hlY = blob.y - blob.radius * 0.3;
    const hlR = blob.radius * 0.5;
    const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
    hlGrad.addColorStop(0, `rgba(255,255,255,${0.04 + high * 0.04})`);
    hlGrad.addColorStop(0.5, `rgba(200,220,255,${0.015 + high * 0.02})`);
    hlGrad.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.ellipse(hlX, hlY, hlR * 1.2, hlR * 0.7, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Edge highlight — bright thin arc on top of each blob
  for (const blob of glassBlobs) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(blob.x, blob.y, blob.radius * 1.05, blob.radius * 0.88, t * 0.05 + blob.phase, -Math.PI * 0.8, -Math.PI * 0.15);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + high * 0.04})`;
    ctx.lineWidth = 1 + high;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  // ── 5. Chromatic aberration — subtle RGB channel offset ──────────────────
  if (bass > 0.3) {
    const aberration = bass * 3;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.04 + bass * 0.04;

    // Red channel shift
    ctx.drawImage(_bgCanvas, aberration, 0, w, h);
    ctx.drawImage(_bgCanvas, -aberration, 0, w, h);

    ctx.restore();
  }

  // ── 6. Light refraction streaks ──────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 3; i++) {
    const baseY = cy + (i - 1) * minDim * 0.18 + Math.sin(t * 0.1 + i * 2) * 10;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const xn = x / w;
      const y = baseY
        + Math.sin(xn * (1.5 + i * 0.5) * Math.PI + t * 0.15 + i) * h * 0.08
        + Math.cos(xn * 2.5 * Math.PI + t * 0.1) * 5;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(200,215,255,${0.02 + high * 0.015})`;
    ctx.lineWidth = 1 + bass * 0.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();

  // ── 7. Glass particles ───────────────────────────────────────────────────
  if (bass > 0.45 && bass - lastBassHit.value > 0.08 && particles.length < 35) {
    const count = 1 + Math.floor(bass * 2);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = ringR * 0.5 + Math.random() * minDim * 0.15;
      const hues = [210, 250, 280, 310, 195];
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * (0.03 + Math.random() * 0.1),
        vy: Math.sin(angle) * (0.03 + Math.random() * 0.1) - 0.02,
        size: 1 + Math.random() * 2.5,
        life: 0,
        maxLife: 80 + Math.random() * 100,
        alpha: 0.03 + Math.random() * 0.05,
        hue: hues[Math.floor(Math.random() * hues.length)],
      });
    }
  }
  lastBassHit.value = bass;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.998; p.vy *= 0.998;
    p.vy -= 0.001; // gentle float up
    p.life++;
    if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
    const lr = 1 - p.life / p.maxLife;
    const fade = lr < 0.2 ? lr / 0.2 : (lr > 0.6 ? (1 - lr) / 0.4 : 1);
    const a = fade * p.alpha;
    const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * fade);
    pg.addColorStop(0, hslToRgba(p.hue, 0.6, 0.65, a));
    pg.addColorStop(0.6, hslToRgba(p.hue, 0.5, 0.5, a * 0.4));
    pg.addColorStop(1, hslToRgba(p.hue, 0.4, 0.4, 0));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fill();
  }
  if (particles.length > 35) particles.splice(0, particles.length - 35);

  // ── 8. Vignette ──────────────────────────────────────────────────────────
  const vigGrad = ctx.createRadialGradient(cx, cy, minDim * 0.2, cx, cy, Math.max(w, h) * 0.65);
  vigGrad.addColorStop(0, "rgba(8,12,24,0)");
  vigGrad.addColorStop(1, "rgba(8,12,24,0.5)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}

// Helper: convert offscreen canvas to base64 PNG for SVG filter
function canvasToBase64(canvas: HTMLCanvasElement): string {
  // Use a small downscaled version for performance
  const scale = 0.25;
  const sw = Math.floor(canvas.width * scale);
  const sh = Math.floor(canvas.height * scale);
  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  const tc = tmp.getContext("2d");
  if (!tc) return "";
  tc.drawImage(canvas, 0, 0, sw, sh);
  return tmp.toDataURL("image/png").split(",")[1] || "";
}

// ── Default: Enhanced gradient orbs + frequency ring + particles ───────────

// Default particle trails
interface DefaultParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  hue: number;
}
const defaultParticles: DefaultParticle[] = [];

function drawDefaultOrbs(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bass: number, mid: number, high: number,
  isPlaying: boolean,
  t: number,
  accentHex: string,
  freqData: Uint8Array<ArrayBuffer>,
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

  ctx.globalCompositeOperation = "source-over";

  // ── Frequency ring outline ────────────────────────────────────────────
  const ringR = minDim * 0.32;
  const segCount = 48;
  const segAngle = (Math.PI * 2) / segCount;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < segCount; i++) {
    const freqIdx = Math.floor((i / segCount) * freqData.length * 0.6);
    const val = freqData[freqIdx] / 255;
    if (val < 0.05) continue;

    const angle = i * segAngle - Math.PI * 0.5;
    const x1 = w * 0.5 + Math.cos(angle) * ringR;
    const y1 = h * 0.45 + Math.sin(angle) * ringR;
    const outerR = ringR + val * minDim * 0.1;
    const x2 = w * 0.5 + Math.cos(angle) * outerR;
    const y2 = h * 0.45 + Math.sin(angle) * outerR;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = hslToRgba(accentHue, accentSat, 0.5, val * 0.15);
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();

  // ── Particle trails from center ───────────────────────────────────────
  if (bass > 0.45 && Math.random() > 0.5 && defaultParticles.length < 50) {
    const angle = Math.random() * Math.PI * 2;
    defaultParticles.push({
      x: w * 0.5, y: h * 0.45,
      vx: Math.cos(angle) * (0.5 + bass * 2),
      vy: Math.sin(angle) * (0.5 + bass * 2),
      size: 1 + Math.random() * 2,
      life: 0, maxLife: 40 + Math.random() * 60,
      hue: accentHue + (Math.random() - 0.5) * 60,
    });
  }
  for (let i = defaultParticles.length - 1; i >= 0; i--) {
    const p = defaultParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.98; p.vy *= 0.98;
    p.life++;
    if (p.life > p.maxLife) { defaultParticles.splice(i, 1); continue; }
    const lifeRatio = 1 - p.life / p.maxLife;
    const fade = lifeRatio < 0.3 ? lifeRatio / 0.3 : lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
    ctx.fillStyle = hslToRgba(p.hue, accentSat, 0.6, fade * 0.3);
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

export default function TrackCanvas({ isActive, isPlaying, currentStyle, styleVariant }: TrackCanvasProps) {
  const isLight = styleVariant === "light";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const freqDataRef = useRef(new Uint8Array(128));
  const smoothBassRef = useRef(0);
  const smoothMidRef = useRef(0);
  const smoothHighRef = useRef(0);

  // Per-style state
  const ipodBarsRef = useRef<IpodBar[]>([]);
  const japanRipplesRef = useRef<InkRipple[]>([]);
  const swagParticlesRef = useRef<SwagParticle[]>([]);
  const swagBassHitRef = useRef({ value: 0 });
  const neonParticlesRef = useRef<NeonParticle[]>([]);
  const neonBassHitRef = useRef({ value: 0 });
  const glassParticlesRef = useRef<GlassParticle[]>([]);
  const glassBassHitRef = useRef({ value: 0 });

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

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const draw = (timestamp: number) => {
      animRef.current = requestAnimationFrame(draw);

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
          drawJapanCanvas(ctx, w, h, freqData, bass, mid, high, t, japanRipplesRef.current);
          break;

        case "swag":
          drawSwagCanvas(ctx, w, h, freqData, bass, mid, high, t, swagParticlesRef.current, swagBassHitRef.current, isLight);
          break;

        case "neon":
          drawNeonCanvas(ctx, w, h, freqData, bass, mid, high, t, neonParticlesRef.current, neonBassHitRef.current, isLight);
          break;

        case "liquid-glass":
          drawLiquidGlassCanvas(ctx, w, h, freqData, bass, mid, high, t, glassParticlesRef.current, glassBassHitRef.current);
          break;

        case "minimal":
          drawMinimalCanvas(ctx, w, h, freqData, bass, mid, high, t, isLight);
          break;

        default: {
          // Default: enhanced orb visualization
          const accentHex = getAccentColor();
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);
          drawDefaultOrbs(ctx, w, h, bass, mid, high, isPlaying, t, accentHex, freqData);
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
  }, [isActive, isPlaying, currentStyle, styleVariant, getAccentColor]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 2 }}
    />
  );
}
