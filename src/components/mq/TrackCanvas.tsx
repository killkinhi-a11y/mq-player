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

  // ── LCD pixel grid overlay ────────────────────────────────────────────
  const pixelSize = 2;
  ctx.fillStyle = "rgba(30,30,40,0.4)";
  for (let gx = 0; gx < w; gx += pixelSize * 2) {
    for (let gy = 0; gy < h; gy += pixelSize * 2) {
      ctx.fillRect(gx, gy, pixelSize, pixelSize);
    }
  }

  // ── Blue backlight glow ───────────────────────────────────────────────
  const backlightGrad = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.6);
  backlightGrad.addColorStop(0, `rgba(42,127,255,${0.03 + bass * 0.04})`);
  backlightGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = backlightGrad;
  ctx.fillRect(0, 0, w, h);

  const barCount = Math.min(48, Math.floor(w / 8));
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
  ctx.strokeStyle = "rgba(196,30,58,0.025)";
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
    ctx.strokeStyle = `rgba(196,30,58,${r.alpha})`;
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
  ctx.fillStyle = "#c41e3a";
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

// ── Swag: Radial spectrum ring + constellation particles ────────────────

interface SwagParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number; angle: number;
}

// Smoothed ring values for animation
const swagRingSmooth = new Float32Array(64);

function drawSwagCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  particles: SwagParticle[],
  lastBassHit: { value: number }
) {
  // Deep black background
  ctx.fillStyle = "#07070a";
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const minDim = Math.min(w, h);
  const baseRadius = minDim * 0.22;
  const maxBarLen = minDim * 0.22;

  // ── Subtle silver radial glow ───────────────────────────────────────
  const glowGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, baseRadius + maxBarLen * 1.3);
  glowGrad.addColorStop(0, `rgba(176,176,184,${0.025 + bass * 0.04})`);
  glowGrad.addColorStop(0.5, `rgba(176,176,184,${0.01 + bass * 0.02})`);
  glowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Radial spectrum ring ────────────────────────────────────────────
  const segCount = 64;
  const segAngle = (Math.PI * 2) / segCount;

  for (let i = 0; i < segCount; i++) {
    const freqIdx = Math.floor((i / segCount) * freqData.length * 0.7);
    const raw = freqData[freqIdx] / 255;
    // Smooth the bar values for fluid animation
    swagRingSmooth[i] += (raw - swagRingSmooth[i]) * 0.18;
    const val = swagRingSmooth[i];

    const angle = i * segAngle - Math.PI * 0.5; // start from top
    const barLen = Math.max(2, val * maxBarLen);
    const innerR = baseRadius + 2;
    const outerR = innerR + barLen;

    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * outerR;
    const y2 = cy + Math.sin(angle) * outerR;

    // Silver bar — brighter at tip
    const alpha = 0.12 + val * 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(176,176,184,${alpha})`;
    ctx.lineWidth = Math.max(1.5, (minDim / segCount) * 0.35);
    ctx.lineCap = "round";
    ctx.stroke();

    // Bright tip glow
    if (val > 0.3) {
      ctx.beginPath();
      ctx.arc(x2, y2, 1.5 + val * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(208,208,216,${val * 0.25})`;
      ctx.fill();
    }
  }

  // ── Inner ring outline ──────────────────────────────────────────────
  const ringPulse = 1 + bass * 0.06;
  const ringR = baseRadius * ringPulse;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(176,176,184,${0.06 + bass * 0.08})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Second outer ring (faint) ───────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius + maxBarLen * 0.15, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(176,176,184,0.025)`;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── Center dot pulsing with bass ────────────────────────────────────
  const dotR = 3 + bass * 5;
  const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR);
  dotGrad.addColorStop(0, `rgba(208,208,216,${0.15 + bass * 0.3})`);
  dotGrad.addColorStop(1, "rgba(208,208,216,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = dotGrad;
  ctx.fill();

  // ── Bass hit → spawn constellation particles ────────────────────────
  if (bass > 0.5 && bass - lastBassHit.value > 0.08) {
    const count = Math.floor(1 + bass * 4);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = baseRadius + Math.random() * maxBarLen * 0.8;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * (0.2 + Math.random() * 0.8),
        vy: Math.sin(angle) * (0.2 + Math.random() * 0.8),
        size: 0.8 + Math.random() * 1.8,
        life: 0,
        maxLife: 60 + Math.random() * 100,
        alpha: 0.2 + Math.random() * 0.35,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }
  lastBassHit.value = bass;

  // ── Draw constellation lines between close particles ────────────────
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const distSq = dx * dx + dy * dy;
      const maxDist = 60;
      if (distSq < maxDist * maxDist) {
        const dist = Math.sqrt(distSq);
        const lineAlpha = (1 - dist / maxDist) * 0.08 * Math.min(particles[i].alpha, particles[j].alpha);
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(176,176,184,${lineAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // ── Update & draw particles — diamond-shaped ────────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.995;
    p.vy *= 0.995;
    p.angle += 0.02;
    p.life++;
    if (p.life > p.maxLife) {
      particles.splice(i, 1);
      continue;
    }
    const lifeRatio = 1 - p.life / p.maxLife;
    const fade = lifeRatio < 0.2 ? lifeRatio / 0.2 : (lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1);
    const a = fade * p.alpha;

    // Diamond shape
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = `rgba(208,208,216,${a})`;
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.6, 0);
    ctx.lineTo(0, p.size);
    ctx.lineTo(-p.size * 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (particles.length > 80) particles.splice(0, particles.length - 80);
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
  const swagParticlesRef = useRef<SwagParticle[]>([]);
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
          drawJapanCanvas(ctx, w, h, freqData, bass, mid, high, t, japanRipplesRef.current);
          break;

        case "swag":
          drawSwagCanvas(ctx, w, h, freqData, bass, mid, high, t, swagParticlesRef.current, swagBassHitRef.current);
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
