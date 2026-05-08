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

// ══════════════════════════════════════════════════════════════════════════════
// Pixel Flower — Pointillist Particle Visualization
// ─────────────────────────────────────────────────────────────────────────────
// Exact recreation of the screenshot style:
//   • White background (#ffffff)
//   • Organic flower shapes formed by thousands of tiny 1px colored dots
//   • Palette: lavender (#a693af), mauve (#93778d), deep purple (#684e7d),
//     light orchid (#ffc1ff), near-white lavender (#ffe8ff)
//   • Warm peach/salmon center dots (#c88c68, #e1a084)
//   • Soft gaussian density falloff at edges
//   • Purple vine/stem connecting flowers
//   • No chunky pixel blocks, no leaves, no sparkles
// ══════════════════════════════════════════════════════════════════════════════

interface PF_Flower {
  x: number; y: number;
  rx: number; ry: number; // ellipse radii
  particles: Array<{ dx: number; dy: number; color: string; alpha: number }>;
  hasCenter: boolean;
}

interface PF_VineNode {
  x: number; y: number;
  w: number; // width
}

const pixelFlowerSmooth = new Float32Array(16);

// Seeded random for deterministic flower generation
function pfRand(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Palette from screenshot analysis — 18 colors
const PF_PETAL_PALETTE = [
  [255, 232, 255], // #ffe8ff — lightest lavender
  [255, 231, 255], // #ffe7ff
  [255, 240, 255], // #fff0ff — near-white pink
  [255, 193, 255], // #ffc1ff — medium lavender-pink
  [222, 184, 241], // #deb8f1 — light orchid
  [192, 168, 182], // #c0a8b6 — soft mauve
  [182, 158, 172], // #b69eac — mauve/dusty rose
  [166, 147, 175], // #a693af — DOMINANT primary purple
  [167, 146, 179], // #a792b3
  [168, 149, 177], // #a895b1
  [164, 127, 168], // #a47fa8 — violet
  [163, 131, 152], // #a38398 — pink accent
  [154, 125, 155], // #9a7d9b — muted purple
  [146, 117, 147], // #927593 — purple-mauve
  [142, 126, 163], // #8e7ea3 — deeper purple
  [138, 111, 142], // #8a6f8e — darker purple
  [114, 71, 116],  // #724774 — dark purple-magenta
  [104, 78, 125],  // #684e7d — darkest purple
];

const PF_CENTER_PALETTE = [
  [200, 140, 104], // #c88c68 — warm peach
  [225, 160, 132], // #e1a084 — salmon
  [202, 140, 103], // #ca8c67
  [218, 152, 118], // #da9876
];

const PF_STEM_PALETTE = [
  [142, 126, 163], // #8e7ea3
  [138, 111, 142], // #8a6f8e
  [114, 71, 116],  // #724774
];

// Generate flower particles once
function generateFlowerParticles(
  cx: number, cy: number, rx: number, ry: number,
  count: number, hasCenter: boolean, seed: number
): PF_Flower {
  const particles: PF_Flower['particles'] = [];
  let s = seed;

  // Main flower body — gaussian distribution in ellipse
  for (let i = 0; i < count; i++) {
    s += 1.0;
    // Box-Muller for gaussian
    const u1 = pfRand(s) || 0.001;
    const u2 = pfRand(s + 0.5);
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    // Scale to ellipse — clip at 2.5 sigma for soft edge
    const dx = Math.max(-2.5, Math.min(2.5, z0)) * rx * 0.4;
    const dy = Math.max(-2.5, Math.min(2.5, z1)) * ry * 0.4;

    // Check if inside ellipse (with soft falloff)
    const normDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (normDist > 1.0) continue;

    // Alpha falls off near edge
    const edgeFade = normDist < 0.6 ? 1.0 : 1.0 - (normDist - 0.6) / 0.4;

    // Color — blend from dark center to light edges
    const colorIdx = Math.floor(pfRand(s + 100) * PF_PETAL_PALETTE.length);
    const [r, g, b] = PF_PETAL_PALETTE[colorIdx];

    // Add slight random variation per particle
    const vr = Math.max(0, Math.min(255, r + Math.floor((pfRand(s + 200) - 0.5) * 20)));
    const vg = Math.max(0, Math.min(255, g + Math.floor((pfRand(s + 300) - 0.5) * 20)));
    const vb = Math.max(0, Math.min(255, b + Math.floor((pfRand(s + 400) - 0.5) * 20)));

    particles.push({
      dx, dy,
      color: `rgb(${vr},${vg},${vb})`,
      alpha: edgeFade * (0.3 + pfRand(s + 500) * 0.7),
    });
  }

  // Warm center dots
  if (hasCenter) {
    const centerCount = Math.floor(count * 0.08);
    for (let i = 0; i < centerCount; i++) {
      s += 1.0;
      const u1 = pfRand(s) || 0.001;
      const u2 = pfRand(s + 0.5);
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      const dx = Math.max(-2, Math.min(2, z0)) * rx * 0.12;
      const dy = Math.max(-2, Math.min(2, z1)) * ry * 0.12;
      const ci = Math.floor(pfRand(s + 600) * PF_CENTER_PALETTE.length);
      const [r, g, b] = PF_CENTER_PALETTE[ci];
      const vr = Math.max(0, Math.min(255, r + Math.floor((pfRand(s + 700) - 0.5) * 30)));
      const vg = Math.max(0, Math.min(255, g + Math.floor((pfRand(s + 800) - 0.5) * 30)));
      const vb = Math.max(0, Math.min(255, b + Math.floor((pfRand(s + 900) - 0.5) * 30)));
      particles.push({
        dx, dy,
        color: `rgb(${vr},${vg},${vb})`,
        alpha: 0.4 + pfRand(s + 1000) * 0.6,
      });
    }
  }

  return { x: cx, y: cy, rx, ry, particles, hasCenter };
}

// Generate vine particles between two points
function generateVineParticles(
  x1: number, y1: number, x2: number, y2: number,
  width: number, count: number, seed: number
): Array<{ x: number; y: number; color: string; alpha: number }> {
  const particles: Array<{ x: number; y: number; color: string; alpha: number }> = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s += 1.0;
    const t = pfRand(s);
    // Bezier curve with slight bend
    const mx = (x1 + x2) / 2 + (pfRand(s + 1) - 0.5) * 40;
    const my = (y1 + y2) / 2 + (pfRand(s + 2) - 0.5) * 20;
    const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
    // Perpendicular offset for width
    const dx = x2 - mx;
    const dy = y2 - my;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (pfRand(s + 3) - 0.5) * width;
    const px = bx + nx * offset;
    const py = by + ny * offset;
    const ci = Math.floor(pfRand(s + 4) * PF_STEM_PALETTE.length);
    const [r, g, b] = PF_STEM_PALETTE[ci];
    const vr = Math.max(0, Math.min(255, r + Math.floor((pfRand(s + 5) - 0.5) * 15)));
    const vg = Math.max(0, Math.min(255, g + Math.floor((pfRand(s + 6) - 0.5) * 15)));
    const vb = Math.max(0, Math.min(255, b + Math.floor((pfRand(s + 7) - 0.5) * 15)));
    particles.push({
      x: px, y: py,
      color: `rgb(${vr},${vg},${vb})`,
      alpha: 0.2 + pfRand(s + 8) * 0.5,
    });
  }
  return particles;
}

interface PF_Scene {
  flowers: PF_Flower[];
  vineParticles: Array<{ x: number; y: number; color: string; alpha: number }>;
  driftPetals: Array<{ x: number; y: number; vx: number; vy: number; color: string; life: number; maxLife: number }>;
  initialized: boolean;
}

const pfScene: PF_Scene = {
  flowers: [],
  vineParticles: [],
  driftPetals: [],
  initialized: false,
};

function initPFScene(w: number, h: number, isDark: boolean) {
  // ── Flowers (positions matching screenshot layout) ──
  // Upper flower — left side, smaller, rounder
  const upperFlower = generateFlowerParticles(
    w * 0.15, h * 0.38,
    w * 0.18, h * 0.22,
    3500, true, 42
  );

  // Lower flower — center-right, larger, wider
  const lowerFlower = generateFlowerParticles(
    w * 0.52, h * 0.52,
    w * 0.28, h * 0.28,
    6000, false, 77
  );

  // Small bud — right side
  const budFlower = generateFlowerParticles(
    w * 0.78, h * 0.72,
    w * 0.06, h * 0.08,
    800, false, 133
  );

  pfScene.flowers = [upperFlower, lowerFlower, budFlower];

  // ── Vine connecting upper to lower flower ──
  pfScene.vineParticles = [
    ...generateVineParticles(
      upperFlower.x + upperFlower.rx * 0.3, upperFlower.y + upperFlower.ry * 0.8,
      lowerFlower.x - lowerFlower.rx * 0.3, lowerFlower.y - lowerFlower.ry * 0.5,
      50, 1200, 200
    ),
    // Vine from lower flower down to bud
    ...generateVineParticles(
      lowerFlower.x + lowerFlower.rx * 0.5, lowerFlower.y + lowerFlower.ry * 0.7,
      budFlower.x - budFlower.rx, budFlower.y - budFlower.ry * 0.5,
      30, 600, 300
    ),
  ];

  pfScene.initialized = true;
}

function drawPixelFlowerCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  _flowers: PixelFlower[],
  lastBassHit: { value: number },
  isDark: boolean = true,
) {
  // ── Background ────────────────────────────────────────────────────
  if (isDark) {
    ctx.fillStyle = "#0d0b11";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  // ── Initialize scene once ─────────────────────────────────────────
  if (!pfScene.initialized) {
    initPFScene(w, h, isDark);
  }

  // ── Audio smoothing ───────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const freqIdx = Math.floor((i / 8) * freqData.length * 0.6);
    const raw = freqData[freqIdx] / 255;
    pixelFlowerSmooth[i] += (raw - pixelFlowerSmooth[i]) * 0.15;
  }

  // ── Gentle bloom from audio ───────────────────────────────────────
  const bloomScale = 1 + bass * 0.08 + mid * 0.04;
  const breathe = 1 + Math.sin(t * 0.3) * 0.015; // subtle idle breathing

  // ── Draw vine particles ───────────────────────────────────────────
  for (const vp of pfScene.vineParticles) {
    ctx.globalAlpha = vp.alpha * (isDark ? 0.6 : 0.4);
    ctx.fillStyle = vp.color;
    const sx = vp.x * bloomScale * breathe;
    const sy = vp.y;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }

  // ── Draw flower particles ─────────────────────────────────────────
  for (const fl of pfScene.flowers) {
    const flBloom = bloomScale * breathe;
    for (const p of fl.particles) {
      // Subtle oscillation
      const osc = Math.sin(t * 0.5 + p.dx * 0.02 + p.dy * 0.02) * 1.5;
      const px = Math.round(fl.x + p.dx * flBloom + osc);
      const py = Math.round(fl.y + p.dy * flBloom + osc * 0.5);

      const alpha = p.alpha * (isDark ? 0.55 : 0.75);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(px, py, 1, 1);
    }
  }

  // ── Bass hit — spawn drifting petal dots ───────────────────────────
  if (bass > 0.5 && bass - lastBassHit.value > 0.1) {
    const fl = pfScene.flowers[Math.floor(Math.random() * pfScene.flowers.length)];
    const count = 3 + Math.floor(bass * 5);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = fl.rx * (0.5 + Math.random() * 0.8);
      const ci = Math.floor(Math.random() * PF_PETAL_PALETTE.length);
      const [r, g, b] = PF_PETAL_PALETTE[ci];
      pfScene.driftPetals.push({
        x: fl.x + Math.cos(angle) * dist,
        y: fl.y + Math.sin(angle) * dist * 0.7,
        vx: Math.cos(angle) * (0.2 + Math.random() * 0.5),
        vy: -0.15 - Math.random() * 0.4,
        color: `rgb(${r},${g},${b})`,
        life: 0,
        maxLife: 60 + Math.random() * 80,
      });
    }
  }
  lastBassHit.value = bass;

  // ── Draw drifting petal dots ──────────────────────────────────────
  for (let i = pfScene.driftPetals.length - 1; i >= 0; i--) {
    const dp = pfScene.driftPetals[i];
    dp.x += dp.vx;
    dp.y += dp.vy;
    dp.vy += 0.003;
    dp.vx += Math.sin(t + dp.x * 0.01) * 0.01;
    dp.life++;
    if (dp.life > dp.maxLife) {
      pfScene.driftPetals.splice(i, 1);
      continue;
    }
    const lifeRatio = 1 - dp.life / dp.maxLife;
    const fade = lifeRatio < 0.15 ? lifeRatio / 0.15 : lifeRatio > 0.5 ? (1 - lifeRatio) / 0.5 : 1;
    ctx.globalAlpha = fade * 0.5 * (isDark ? 0.5 : 0.65);
    ctx.fillStyle = dp.color;
    ctx.fillRect(Math.round(dp.x), Math.round(dp.y), 1, 1);
  }
  ctx.globalAlpha = 1;
  if (pfScene.driftPetals.length > 100) pfScene.driftPetals.splice(0, pfScene.driftPetals.length - 100);
}

// Placeholder interface (kept for API compatibility)
interface PixelFlower {
  x: number; y: number; size: number; petalCount: number;
  hue: number; phase: number; rotSpeed: number;
}

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

  // Per-style state (kept for API compat)
  const pixelFlowersRef = useRef<PixelFlower[]>([]);
  const pixelFlowerLastBassHitRef = useRef({ value: 0 });

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

    // Reset scene on resize
    pfScene.initialized = false;

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
        pfScene.initialized = false; // regenerate on resize
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

      switch (currentStyle) {
        case "pixel-flower": {
          const isLight = styleVariant === "light";
          drawPixelFlowerCanvas(ctx, w, h, freqData, bass, mid, high, t, pixelFlowersRef.current, pixelFlowerLastBassHitRef.current, !isLight);
          break;
        }

        default: {
          const accentHex = getAccentColor();
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);
          drawDefaultOrbs(ctx, w, h, bass, mid, high, isPlaying, t, accentHex, freqData);
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
