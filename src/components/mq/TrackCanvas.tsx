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

// ── Pixel Flower: Pixelated flower garden visualization ────────────────────

interface PixelFlower {
  x: number; y: number; size: number; petalCount: number;
  hue: number; phase: number; rotSpeed: number;
}

// Drifting pixel petals spawned on bass hits
interface DriftPetal {
  x: number; y: number; vx: number; vy: number;
  color: string; life: number; maxLife: number; size: number;
}

const pixelFlowerSmooth = new Float32Array(16);
const driftPetals: DriftPetal[] = [];

// Pre-configured flower positions (normalized 0-1)
function createInitialFlowers(w: number, h: number): PixelFlower[] {
  const positions = [
    { xf: 0.15, yf: 0.25, size: 22, petals: 6, hue: 270, phase: 0, rot: 0.3 },
    { xf: 0.35, yf: 0.18, size: 28, petals: 7, hue: 330, phase: 1.2, rot: -0.2 },
    { xf: 0.55, yf: 0.22, size: 20, petals: 5, hue: 290, phase: 2.5, rot: 0.15 },
    { xf: 0.78, yf: 0.20, size: 25, petals: 6, hue: 310, phase: 0.8, rot: -0.35 },
    { xf: 0.22, yf: 0.55, size: 18, petals: 8, hue: 280, phase: 3.1, rot: 0.25 },
    { xf: 0.50, yf: 0.50, size: 32, petals: 7, hue: 340, phase: 1.7, rot: -0.1 },
    { xf: 0.75, yf: 0.52, size: 24, petals: 5, hue: 300, phase: 4.0, rot: 0.4 },
    { xf: 0.90, yf: 0.38, size: 16, petals: 6, hue: 320, phase: 2.2, rot: -0.28 },
  ];
  return positions.map(p => ({
    x: Math.floor(w * p.xf),
    y: Math.floor(h * p.yf),
    size: p.size,
    petalCount: p.petals,
    hue: p.hue,
    phase: p.phase,
    rotSpeed: p.rot,
  }));
}

function drawPixelFlowerCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  freqData: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, high: number,
  t: number,
  flowers: PixelFlower[],
  lastBassHit: { value: number },
) {
  const PX = 3; // pixel block size for retro feel

  // ── Warm white background ────────────────────────────────────────────
  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(0, 0, w, h);

  // ── Subtle pixel grid overlay ────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.018)";
  for (let gx = 0; gx < w; gx += PX) {
    ctx.fillRect(gx, 0, 1, h);
  }
  for (let gy = 0; gy < h; gy += PX) {
    ctx.fillRect(0, gy, w, 1);
  }

  // ── Color palette ────────────────────────────────────────────────────
  const petalColors = ["#B8A9C9", "#9B7DB8", "#D4A5B5", "#E8C5D0"];
  const centerColors = ["#E8C547", "#D4A830"];
  const stemColors = ["#4A6741", "#3D5A35"];
  const leafColors = ["#5A7A4F", "#4A6741", "#6B8C5E"];
  const sparkleColors = ["#E8C547", "#D4A5B5", "#B8A9C9", "#FFFFFF"];

  // ── Smoothing some frequency bands ───────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const freqIdx = Math.floor((i / 8) * freqData.length * 0.6);
    const raw = freqData[freqIdx] / 255;
    pixelFlowerSmooth[i] += (raw - pixelFlowerSmooth[i]) * 0.15;
  }

  // ── Ensure flowers are initialized ───────────────────────────────────
  if (flowers.length === 0) {
    const init = createInitialFlowers(w, h);
    flowers.push(...init);
  }

  // ── Bass hit detection — spawn drifting petals ──────────────────────
  // We use a local mutable array for drift petals stored on the module
  if (bass > 0.5 && bass - lastBassHit.value > 0.1) {
    // Pick a random flower to spawn petals from
    const fi = Math.floor(Math.random() * flowers.length);
    const fl = flowers[fi];
    const count = 2 + Math.floor(bass * 4);
    for (let j = 0; j < count; j++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = fl.size * (0.8 + Math.random() * 0.6);
      driftPetals.push({
        x: fl.x + Math.cos(angle) * dist,
        y: fl.y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * (0.3 + Math.random() * 0.8),
        vy: -0.2 - Math.random() * 0.6,
        color: petalColors[Math.floor(Math.random() * petalColors.length)],
        life: 0,
        maxLife: 80 + Math.random() * 60,
        size: PX,
      });
    }
  }
  lastBassHit.value = bass;

  // ── Draw & update drifting petals ────────────────────────────────────
  for (let i = driftPetals.length - 1; i >= 0; i--) {
    const dp = driftPetals[i];
    dp.x += dp.vx;
    dp.y += dp.vy;
    dp.vy += 0.005; // gentle gravity
    dp.vx *= 0.995;
    dp.life++;
    if (dp.life > dp.maxLife) {
      driftPetals.splice(i, 1);
      continue;
    }
    const lifeRatio = 1 - dp.life / dp.maxLife;
    const fade = lifeRatio < 0.2 ? lifeRatio / 0.2 : lifeRatio > 0.6 ? (1 - lifeRatio) / 0.4 : 1;
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = dp.color;
    // Slight rotation drift
    const wobble = Math.sin(dp.life * 0.15) * PX * 0.5;
    ctx.fillRect(
      Math.floor(dp.x + wobble),
      Math.floor(dp.y),
      dp.size,
      dp.size
    );
  }
  ctx.globalAlpha = 1;
  if (driftPetals.length > 80) driftPetals.splice(0, driftPetals.length - 80);

  // ── Draw each flower ────────────────────────────────────────────────
  for (const fl of flowers) {
    const bloomScale = 1 + bass * 0.35 + pixelFlowerSmooth[0] * 0.2;
    const glowIntensity = mid * 0.6;
    const sparkleChance = high * 0.8;
    const rotation = t * fl.rotSpeed + fl.phase;

    // Flower radius in pixels
    const flowerR = fl.size * bloomScale;
    const petalR = flowerR * 0.55;
    const centerR = flowerR * 0.2;

    // ── Soft shadow under flower ────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    const shadowOffX = flowerR * 0.08;
    const shadowOffY = flowerR * 0.12;
    for (let si = -2; si <= 2; si++) {
      for (let sj = -1; sj <= 1; sj++) {
        ctx.fillRect(
          Math.floor(fl.x - centerR + shadowOffX + si * PX),
          Math.floor(fl.y - centerR + shadowOffY + sj * PX),
          PX, PX
        );
      }
    }

    // ── Stem (going downward) ───────────────────────────────────────
    const stemLen = flowerR * 2.5 + PX * 4;
    const stemW = PX;
    const stemSway = Math.sin(t * 0.5 + fl.phase) * PX * 2;

    ctx.fillStyle = stemColors[0];
    // Draw stem with slight curve using stacked rectangles
    for (let sy = 0; sy < stemLen; sy += PX) {
      const progress = sy / stemLen;
      const sway = stemSway * progress;
      ctx.fillRect(
        Math.floor(fl.x - stemW / 2 + sway),
        Math.floor(fl.y + flowerR * 0.3 + sy),
        stemW, PX
      );
      // Alternate stem color for texture
      if (sy % (PX * 3) === 0) {
        ctx.fillStyle = stemColors[1];
      } else if (sy % (PX * 3) === PX) {
        ctx.fillStyle = stemColors[0];
      }
    }

    // ── Leaves on stem ──────────────────────────────────────────────
    const leafPositions = [0.25, 0.55];
    for (const leafFrac of leafPositions) {
      const ly = Math.floor(fl.y + flowerR * 0.3 + stemLen * leafFrac);
      const lxProgress = leafFrac;
      const lxSway = stemSway * lxProgress;
      const lxBase = Math.floor(fl.x + lxSway);
      const leafSide = leafFrac === 0.25 ? 1 : -1;
      const leafSize = PX * 2 + Math.floor(mid * PX);

      ctx.fillStyle = leafColors[0];
      // Main leaf body (3 pixel wide branch)
      ctx.fillRect(
        Math.floor(lxBase + leafSide * PX),
        ly - PX, PX * 2, PX
      );
      ctx.fillRect(
        Math.floor(lxBase + leafSide * PX * 2),
        ly - PX * 2, PX, PX
      );
      ctx.fillStyle = leafColors[1];
      // Leaf tip
      ctx.fillRect(
        Math.floor(lxBase + leafSide * PX * 3),
        ly - PX * 3, PX, PX
      );
      // Extra leaf pixel
      ctx.fillStyle = leafColors[2];
      ctx.fillRect(
        Math.floor(lxBase + leafSide * PX),
        ly, PX, PX
      );
    }

    // ── Petals (pixel art circle around center) ─────────────────────
    const petalColorIdx = Math.floor(fl.hue / 90) % petalColors.length;
    const petalGlow = glowIntensity * 0.3;

    for (let pi = 0; pi < fl.petalCount; pi++) {
      const petalAngle = (pi / fl.petalCount) * Math.PI * 2 + rotation;
      // Each petal is a cluster of overlapping rectangles
      const petalDist = flowerR * 0.45;

      for (let px = -1; px <= 1; px++) {
        for (let py = -1; py <= 1; py++) {
          const dist = Math.sqrt(px * px + py * py);
          if (dist > 1.3) continue;

          const bx = Math.floor(
            fl.x + Math.cos(petalAngle) * petalDist + px * PX
          );
          const by = Math.floor(
            fl.y + Math.sin(petalAngle) * petalDist + py * PX
          );

          // Petal color with optional glow
          const baseColor = petalColors[(petalColorIdx + pi) % petalColors.length];
          ctx.fillStyle = baseColor;

          // Glow: draw a slightly larger dim pixel behind
          if (petalGlow > 0.1 && dist < 0.8) {
            ctx.globalAlpha = petalGlow * (1 - dist);
            ctx.fillRect(bx - 1, by - 1, PX + 2, PX + 2);
            ctx.globalAlpha = 1;
          }

          ctx.fillStyle = baseColor;
          ctx.fillRect(bx, by, PX, PX);
        }
      }

      // Extra petal extension pixels for roundness
      const extAngle = petalAngle;
      const extDist = petalDist + PX * 0.8;
      const ebx = Math.floor(fl.x + Math.cos(extAngle) * extDist);
      const eby = Math.floor(fl.y + Math.sin(extAngle) * extDist);
      const extColor = petalColors[(petalColorIdx + pi + 1) % petalColors.length];
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = extColor;
      ctx.fillRect(ebx, eby, PX, PX);
      ctx.globalAlpha = 1;
    }

    // ── Inner petal ring (smaller, lighter) ─────────────────────────
    const innerPetalCount = Math.max(3, fl.petalCount - 1);
    for (let pi = 0; pi < innerPetalCount; pi++) {
      const petalAngle = (pi / innerPetalCount) * Math.PI * 2 + rotation + Math.PI / fl.petalCount;
      const petalDist = flowerR * 0.25;

      const bx = Math.floor(fl.x + Math.cos(petalAngle) * petalDist);
      const by = Math.floor(fl.y + Math.sin(petalAngle) * petalDist);

      const lightColor = petalColors[(petalColorIdx + pi + 2) % petalColors.length];
      ctx.fillStyle = lightColor;
      ctx.fillRect(bx, by, PX, PX);
    }

    // ── Flower center (golden) ──────────────────────────────────────
    ctx.fillStyle = centerColors[0];
    // Center cluster of gold pixels
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) {
        if (Math.abs(cx) + Math.abs(cy) > 1.5) continue;
        ctx.fillRect(
          Math.floor(fl.x + cx * PX),
          Math.floor(fl.y + cy * PX),
          PX, PX
        );
      }
    }
    // Darker gold accent
    ctx.fillStyle = centerColors[1];
    ctx.fillRect(
      Math.floor(fl.x - PX),
      Math.floor(fl.y),
      PX, PX
    );
    ctx.fillRect(
      Math.floor(fl.x + PX),
      Math.floor(fl.y),
      PX, PX
    );
    ctx.fillRect(
      Math.floor(fl.x),
      Math.floor(fl.y - PX),
      PX, PX
    );
    ctx.fillRect(
      Math.floor(fl.x),
      Math.floor(fl.y + PX),
      PX, PX
    );

    // ── Sparkle pixels on high frequencies ──────────────────────────
    if (high > 0.2) {
      const sparkleCount = Math.floor(high * 6);
      for (let si = 0; si < sparkleCount; si++) {
        const sAngle = (si / sparkleCount) * Math.PI * 2 + t * 2;
        const sDist = centerR + PX + Math.random() * petalR * 0.8;
        const sx = Math.floor(fl.x + Math.cos(sAngle) * sDist);
        const sy = Math.floor(fl.y + Math.sin(sAngle) * sDist);
        const sColor = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
        ctx.globalAlpha = high * (0.4 + Math.random() * 0.4);
        ctx.fillStyle = sColor;
        ctx.fillRect(sx, sy, PX, PX);
      }
      ctx.globalAlpha = 1;
    }

    // ── Subtle pulsing glow ring around flower (bass reactive) ──────
    if (bass > 0.3) {
      const glowR = flowerR + PX * 2;
      ctx.globalAlpha = bass * 0.06;
      ctx.strokeStyle = petalColors[0];
      ctx.lineWidth = PX;
      ctx.beginPath();
      // Draw pixelated circle approximation
      const steps = Math.max(8, fl.petalCount * 3);
      for (let si = 0; si < steps; si++) {
        const a = (si / steps) * Math.PI * 2;
        const gx = Math.floor(fl.x + Math.cos(a) * glowR);
        const gy = Math.floor(fl.y + Math.sin(a) * glowR);
        ctx.fillRect(gx, gy, PX, PX);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── Ground line at bottom (subtle) ───────────────────────────────────
  ctx.fillStyle = "rgba(74,103,65,0.08)";
  ctx.fillRect(0, Math.floor(h * 0.88), w, PX);
  ctx.fillStyle = "rgba(74,103,65,0.04)";
  ctx.fillRect(0, Math.floor(h * 0.88) + PX, w, PX);

  // ── Idle sway animation (when no music) ─────────────────────────────
  for (const fl of flowers) {
    fl.phase += 0.002; // Very subtle idle drift
  }
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
        case "pixel-flower":
          drawPixelFlowerCanvas(ctx, w, h, freqData, bass, mid, high, t, pixelFlowersRef.current, pixelFlowerLastBassHitRef.current);
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
