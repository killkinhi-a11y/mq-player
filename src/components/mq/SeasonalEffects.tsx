"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type SeasonalTheme = "halloween" | "newyear" | "valentine" | "spring" | "summer" | "autumn" | "stpatrick" | "easter" | null;

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  type: "fall" | "float" | "rise" | "drift";
  // Shape data
  shape: "snowflake" | "sparkle" | "heart" | "petal" | "leaf" | "star" | "firefly" | "clover" | "egg" | "candy" | "confetti" | "ghost" | "bat" | "web" | "pumpkin";
  color: string;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmplitude: number;
  scale: number;
  // Trail for some effects
  trail?: { x: number; y: number; opacity: number }[];
}

interface EffectConfig {
  particleCount: number;
  bgGlow: string;
  overlayGradient?: string;
  borderGlow?: string;
  particleTypes: {
    shape: Particle["shape"];
    colors: string[];
    sizeRange: [number, number];
    speedRange: [number, number];
    weight: number;
    motionType: "fall" | "float" | "rise" | "drift";
  }[];
}

// ── Draw shape functions ──
function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.5;

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const ex = Math.cos(angle) * size;
    const ey = Math.sin(angle) * size;
    ctx.lineTo(ex, ey);
    // Small branches
    const branchLen = size * 0.35;
    const branchPos = 0.6;
    const bx = Math.cos(angle) * size * branchPos;
    const by = Math.sin(angle) * size * branchPos;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(angle + 0.5) * branchLen, by + Math.sin(angle + 0.5) * branchLen);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(angle - 0.5) * branchLen, by + Math.sin(angle - 0.5) * branchLen);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.8;

  // 4-pointed star
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 * Math.PI) / 180;
    const r = i % 2 === 0 ? size : size * 0.25;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(size / 30, size / 30);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.bezierCurveTo(-15, -28, -35, -5, 0, 22);
  ctx.moveTo(0, -8);
  ctx.bezierCurveTo(15, -28, 35, -5, 0, 22);
  ctx.fill();
  ctx.restore();
}

function drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;

  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.4, size, 0, 0, Math.PI * 2);
  ctx.fill();
  // Center vein
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity * 0.3;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.6, -size * 0.5, size * 0.5, size * 0.5, 0, size);
  ctx.bezierCurveTo(-size * 0.5, size * 0.5, -size * 0.6, -size * 0.5, 0, -size);
  ctx.fill();

  // Stem
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = opacity * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size * 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.6;

  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = (i * 72 - 90) * Math.PI / 180;
    const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
    ctx.lineTo(Math.cos(outerAngle) * size, Math.sin(outerAngle) * size);
    ctx.lineTo(Math.cos(innerAngle) * size * 0.4, Math.sin(innerAngle) * size * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity;

  // Outer glow
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.3, color.replace(")", ",0.4)").replace("rgb", "rgba"));
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = "#fff";
  ctx.shadowColor = color;
  ctx.shadowBlur = size;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClover(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;

  // 3 heart-shaped leaves
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * 120 * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.5, -size * 0.3, size * 0.4, -size, 0, -size * 0.7);
    ctx.bezierCurveTo(-size * 0.4, -size, -size * 0.5, -size * 0.3, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  // Stem
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.1);
  ctx.lineTo(0, size * 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawEgg(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;

  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.65, size, 0, 0, Math.PI * 2);
  ctx.fill();

  // Decorative stripe
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = opacity * 0.3;
  ctx.lineWidth = size * 0.15;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.1, size * 0.45, size * 0.15, 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawConfetti(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 2;

  // Rectangle confetti piece
  ctx.fillRect(-size * 0.2, -size * 0.6, size * 0.4, size * 1.2);
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.8;

  // Body
  ctx.beginPath();
  ctx.arc(0, -size * 0.2, size * 0.5, Math.PI, 0);
  ctx.lineTo(size * 0.5, size * 0.5);
  // Wavy bottom
  ctx.quadraticCurveTo(size * 0.35, size * 0.3, size * 0.2, size * 0.5);
  ctx.quadraticCurveTo(size * 0.05, size * 0.3, -size * 0.1, size * 0.5);
  ctx.quadraticCurveTo(-size * 0.25, size * 0.3, -size * 0.5, size * 0.5);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#000";
  ctx.globalAlpha = opacity * 0.6;
  ctx.beginPath();
  ctx.arc(-size * 0.15, -size * 0.25, size * 0.08, 0, Math.PI * 2);
  ctx.arc(size * 0.15, -size * 0.25, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.15, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings
  ctx.beginPath();
  ctx.moveTo(-size * 0.15, -size * 0.1);
  ctx.quadraticCurveTo(-size * 0.7, -size * 0.6, -size * 0.8, 0);
  ctx.quadraticCurveTo(-size * 0.6, size * 0.1, -size * 0.4, size * 0.05);
  ctx.quadraticCurveTo(-size * 0.5, -size * 0.2, -size * 0.15, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.15, -size * 0.1);
  ctx.quadraticCurveTo(size * 0.7, -size * 0.6, size * 0.8, 0);
  ctx.quadraticCurveTo(size * 0.6, size * 0.1, size * 0.4, size * 0.05);
  ctx.quadraticCurveTo(size * 0.5, -size * 0.2, size * 0.15, 0);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#ff6600";
  ctx.globalAlpha = opacity * 0.8;
  ctx.beginPath();
  ctx.arc(-size * 0.06, -size * 0.15, size * 0.04, 0, Math.PI * 2);
  ctx.arc(size * 0.06, -size * 0.15, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWeb(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity * 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  // Concentric web
  const rings = 4;
  const spokes = 6;
  for (let r = 1; r <= rings; r++) {
    const radius = (size / rings) * r;
    ctx.beginPath();
    for (let s = 0; s <= spokes; s++) {
      const angle = (s / spokes) * Math.PI * 2;
      const wobble = s % 2 === 0 ? 0 : radius * 0.1;
      ctx.lineTo(Math.cos(angle) * (radius + wobble), Math.sin(angle) * (radius + wobble));
    }
    ctx.stroke();
  }
  // Spokes
  for (let s = 0; s < spokes; s++) {
    const angle = (s / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPumpkin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string, opacity: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.shadowColor = "#ff6600";
  ctx.shadowBlur = size * 0.5;

  // Pumpkin body (3 overlapping ellipses)
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * size * 0.25, 0, size * 0.35, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stem
  ctx.fillStyle = "#4a7c04";
  ctx.fillRect(-size * 0.05, -size * 0.5, size * 0.1, size * 0.15);

  // Face (eyes and mouth)
  ctx.fillStyle = "#000";
  ctx.globalAlpha = opacity * 0.7;
  // Eyes
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, -size * 0.1);
  ctx.lineTo(-size * 0.15, -size * 0.2);
  ctx.lineTo(-size * 0.05, -size * 0.1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.05, -size * 0.1);
  ctx.lineTo(size * 0.15, -size * 0.2);
  ctx.lineTo(size * 0.25, -size * 0.1);
  ctx.fill();
  // Mouth
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, size * 0.1);
  ctx.lineTo(-size * 0.1, size * 0.05);
  ctx.lineTo(0, size * 0.15);
  ctx.lineTo(size * 0.1, size * 0.05);
  ctx.lineTo(size * 0.2, size * 0.1);
  ctx.stroke();
  ctx.restore();
}

const drawFunctions: Record<string, typeof drawSnowflake> = {
  snowflake: drawSnowflake,
  sparkle: drawSparkle,
  heart: drawHeart,
  petal: drawPetal,
  leaf: drawLeaf,
  star: drawStar,
  firefly: drawFirefly,
  clover: drawClover,
  egg: drawEgg,
  confetti: drawConfetti,
  ghost: drawGhost,
  bat: drawBat,
  web: drawWeb,
  pumpkin: drawPumpkin,
  candy: drawSparkle, // reuse sparkle for candy
};

const themeConfigs: Record<string, EffectConfig> = {
  halloween: {
    particleCount: 30,
    bgGlow: "radial-gradient(ellipse at 50% 100%, rgba(255,102,0,0.06) 0%, transparent 60%)",
    overlayGradient: "linear-gradient(180deg, rgba(13,10,0,0) 0%, rgba(40,20,0,0.15) 100%)",
    borderGlow: "0 0 30px rgba(255,102,0,0.15)",
    particleTypes: [
      { shape: "pumpkin", colors: ["#ff6600", "#ff8800", "#cc4400"], sizeRange: [20, 35], speedRange: [0.3, 0.6], weight: 2, motionType: "float" },
      { shape: "bat", colors: ["#2a1a3a", "#1a1025", "#3a2045"], sizeRange: [15, 25], speedRange: [1.0, 2.5], weight: 3, motionType: "drift" },
      { shape: "ghost", colors: ["rgba(255,255,255,0.7)", "rgba(220,220,255,0.6)", "rgba(200,200,240,0.5)"], sizeRange: [18, 30], speedRange: [0.2, 0.5], weight: 2, motionType: "rise" },
      { shape: "web", colors: ["rgba(255,255,255,0.15)"], sizeRange: [40, 70], speedRange: [0, 0], weight: 1, motionType: "float" },
      { shape: "sparkle", colors: ["#ff6600", "#ffaa00", "#ffcc00"], sizeRange: [3, 7], speedRange: [0, 0.3], weight: 2, motionType: "float" },
    ],
  },
  newyear: {
    particleCount: 40,
    bgGlow: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.05) 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, rgba(239,68,68,0.04) 0%, transparent 40%)",
    overlayGradient: "linear-gradient(180deg, rgba(10,5,16,0) 0%, rgba(30,15,40,0.1) 100%)",
    borderGlow: "0 0 40px rgba(251,191,36,0.12)",
    particleTypes: [
      { shape: "snowflake", colors: ["#ffffff", "#e0f2fe", "#bfdbfe", "#dbeafe"], sizeRange: [8, 20], speedRange: [0.3, 1.0], weight: 4, motionType: "fall" },
      { shape: "sparkle", colors: ["#fbbf24", "#fde68a", "#ffffff", "#f59e0b"], sizeRange: [3, 8], speedRange: [0, 0.3], weight: 3, motionType: "float" },
      { shape: "star", colors: ["#fbbf24", "#f59e0b", "#ef4444", "#ffffff"], sizeRange: [6, 12], speedRange: [0.1, 0.4], weight: 2, motionType: "drift" },
      { shape: "confetti", colors: ["#ef4444", "#fbbf24", "#22c55e", "#3b82f6", "#a78bfa", "#f472b6"], sizeRange: [4, 8], speedRange: [0.5, 1.5], weight: 3, motionType: "fall" },
    ],
  },
  valentine: {
    particleCount: 35,
    bgGlow: "radial-gradient(ellipse at 50% 80%, rgba(244,63,94,0.06) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(21,8,16,0) 0%, rgba(60,15,30,0.1) 100%)",
    particleTypes: [
      { shape: "heart", colors: ["#f43f5e", "#fb7185", "#fda4af", "#e11d48", "#f472b6"], sizeRange: [8, 18], speedRange: [0.3, 0.8], weight: 4, motionType: "rise" },
      { shape: "petal", colors: ["#f9a8d4", "#f472b6", "#fda4af", "#fce7f3"], sizeRange: [6, 14], speedRange: [0.2, 0.6], weight: 3, motionType: "drift" },
      { shape: "sparkle", colors: ["#f43f5e", "#fbbf24"], sizeRange: [2, 5], speedRange: [0, 0.2], weight: 2, motionType: "float" },
    ],
  },
  spring: {
    particleCount: 28,
    bgGlow: "radial-gradient(ellipse at 50% 100%, rgba(74,222,128,0.05) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(10,18,10,0) 0%, rgba(20,40,20,0.1) 100%)",
    particleTypes: [
      { shape: "petal", colors: ["#f9a8d4", "#f472b6", "#fce7f3", "#fda4af", "#fff1f2"], sizeRange: [6, 14], speedRange: [0.2, 0.7], weight: 3, motionType: "drift" },
      { shape: "leaf", colors: ["#4ade80", "#86efac", "#bbf7d0"], sizeRange: [8, 16], speedRange: [0.3, 0.8], weight: 2, motionType: "fall" },
      { shape: "sparkle", colors: ["#fbbf24", "#4ade80"], sizeRange: [2, 5], speedRange: [0, 0.2], weight: 2, motionType: "float" },
      { shape: "firefly", colors: ["#fbbf24", "#4ade80", "#a78bfa"], sizeRange: [4, 8], speedRange: [0.1, 0.4], weight: 2, motionType: "float" },
    ],
  },
  summer: {
    particleCount: 22,
    bgGlow: "radial-gradient(ellipse at 80% 20%, rgba(250,204,21,0.06) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(21,16,8,0) 0%, rgba(50,35,10,0.08) 100%)",
    particleTypes: [
      { shape: "firefly", colors: ["#fbbf24", "#f59e0b", "#34d399"], sizeRange: [5, 12], speedRange: [0.1, 0.4], weight: 3, motionType: "float" },
      { shape: "sparkle", colors: ["#fbbf24", "#fb923c", "#38bdf8"], sizeRange: [2, 6], speedRange: [0, 0.3], weight: 2, motionType: "float" },
      { shape: "star", colors: ["#fbbf24", "#ffffff"], sizeRange: [4, 10], speedRange: [0.05, 0.2], weight: 2, motionType: "drift" },
    ],
  },
  autumn: {
    particleCount: 28,
    bgGlow: "radial-gradient(ellipse at 30% 80%, rgba(217,119,6,0.06) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(18,10,5,0) 0%, rgba(45,25,10,0.1) 100%)",
    particleTypes: [
      { shape: "leaf", colors: ["#d97706", "#ea580c", "#dc2626", "#b45309", "#92400e", "#f59e0b"], sizeRange: [10, 20], speedRange: [0.4, 1.0], weight: 4, motionType: "fall" },
      { shape: "sparkle", colors: ["#d97706", "#fbbf24"], sizeRange: [2, 5], speedRange: [0, 0.2], weight: 2, motionType: "float" },
    ],
  },
  stpatrick: {
    particleCount: 25,
    bgGlow: "radial-gradient(ellipse at 50% 50%, rgba(34,197,94,0.06) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(5,13,5,0) 0%, rgba(15,35,15,0.08) 100%)",
    particleTypes: [
      { shape: "clover", colors: ["#22c55e", "#4ade80", "#86efac", "#16a34a"], sizeRange: [10, 18], speedRange: [0.2, 0.6], weight: 3, motionType: "drift" },
      { shape: "sparkle", colors: ["#fbbf24", "#4ade80"], sizeRange: [3, 7], speedRange: [0, 0.3], weight: 2, motionType: "float" },
      { shape: "firefly", colors: ["#4ade80", "#fbbf24"], sizeRange: [4, 8], speedRange: [0.1, 0.3], weight: 2, motionType: "float" },
    ],
  },
  easter: {
    particleCount: 25,
    bgGlow: "radial-gradient(ellipse at 50% 80%, rgba(192,132,252,0.06) 0%, transparent 50%)",
    overlayGradient: "linear-gradient(180deg, rgba(15,10,18,0) 0%, rgba(35,20,45,0.08) 100%)",
    particleTypes: [
      { shape: "egg", colors: ["#c084fc", "#e879f9", "#f0abfc", "#fbbf24", "#a78bfa", "#f472b6", "#34d399"], sizeRange: [8, 16], speedRange: [0.2, 0.6], weight: 3, motionType: "float" },
      { shape: "sparkle", colors: ["#fbbf24", "#c084fc", "#4ade80"], sizeRange: [3, 7], speedRange: [0, 0.3], weight: 2, motionType: "float" },
      { shape: "confetti", colors: ["#c084fc", "#f0abfc", "#fbbf24", "#4ade80", "#f472b6"], sizeRange: [3, 6], speedRange: [0.3, 0.8], weight: 2, motionType: "fall" },
    ],
  },
};

function pickWeightedShape(types: EffectConfig["particleTypes"]): { shape: Particle["shape"]; color: string } {
  const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  for (const type of types) {
    random -= type.weight;
    if (random <= 0) {
      const color = type.colors[Math.floor(Math.random() * type.colors.length)];
      return { shape: type.shape, color };
    }
  }
  return { shape: types[0].shape, color: types[0].colors[0] };
}

export default function SeasonalEffects({ theme }: { theme: SeasonalTheme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState(true);

  const config = theme ? themeConfigs[theme] : null;

  const createParticle = useCallback((width: number, height: number): Particle => {
    if (!config) {
      return {
        x: 0, y: 0, size: 0, speedX: 0, speedY: 0,
        opacity: 0, rotation: 0, rotationSpeed: 0,
        life: 0, maxLife: 0, type: "fall",
        shape: "sparkle", color: "", wobblePhase: 0, wobbleSpeed: 0, wobbleAmplitude: 0, scale: 1,
      };
    }

    const { shape, color } = pickWeightedShape(config.particleTypes);
    const pType = config.particleTypes.find(p => p.shape === shape)!;
    const size = pType.sizeRange[0] + Math.random() * (pType.sizeRange[1] - pType.sizeRange[0]);
    const maxLife = 400 + Math.random() * 500;
    const speed = pType.speedRange[0] + Math.random() * (pType.speedRange[1] - pType.speedRange[0]);

    let x: number, y: number, speedX: number, speedY: number;

    switch (pType.motionType) {
      case "fall":
        x = Math.random() * width;
        y = -size - Math.random() * 120;
        speedX = (Math.random() - 0.5) * 0.5;
        speedY = speed;
        break;
      case "rise":
        x = Math.random() * width;
        y = height + size + Math.random() * 80;
        speedX = (Math.random() - 0.5) * 0.8;
        speedY = -speed;
        break;
      case "float":
        x = Math.random() * width;
        y = Math.random() * height;
        speedX = (Math.random() - 0.5) * 0.3;
        speedY = (Math.random() - 0.5) * 0.3;
        break;
      case "drift":
      default:
        x = Math.random() < 0.5 ? -size : width + size;
        y = Math.random() * height;
        speedX = x < 0 ? speed : -speed;
        speedY = (Math.random() - 0.5) * 0.3;
        break;
    }

    return {
      x, y, size, speedX, speedY,
      opacity: 0,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 2,
      shape,
      color,
      life: 0,
      maxLife,
      type: pType.motionType,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.03,
      wobbleAmplitude: 0.5 + Math.random() * 1.5,
      scale: 0.8 + Math.random() * 0.4,
    };
  }, [config]);

  // Clear canvas when effects are hidden (so particles disappear, not freeze)
  useEffect(() => {
    if (isVisible || !theme || !config) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    // Clear particle array so they don't linger
    particlesRef.current = [];
  }, [isVisible, theme, config]);

  useEffect(() => {
    if (!theme || !config || !isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    particlesRef.current = [];
    for (let i = 0; i < config.particleCount; i++) {
      const p = createParticle(canvas.width, canvas.height);
      p.life = Math.random() * p.maxLife * 0.5;
      particlesRef.current.push(p);
    }

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;

        // Wobble
        p.wobblePhase += p.wobbleSpeed;
        const wobbleOffset = Math.sin(p.wobblePhase) * p.wobbleAmplitude;

        p.x += p.speedX + wobbleOffset * 0.3;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        // Fade in/out
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio < 0.1) {
          p.opacity = lifeRatio / 0.1;
        } else if (lifeRatio > 0.8) {
          p.opacity = (1 - lifeRatio) / 0.2;
        } else {
          p.opacity = 1;
        }

        // Subtle breathing scale
        const breathe = 1 + Math.sin(p.life * 0.02) * 0.08;
        const finalSize = p.size * p.scale * breathe;

        // Max opacity varies by shape
        const maxOpacity = p.shape === "web" ? 0.25 : p.shape === "firefly" ? 0.7 : 0.55;
        p.opacity = Math.min(p.opacity, maxOpacity);

        // Reset if expired or out of bounds
        const isOutOfBounds =
          p.y > canvas.height + 60 ||
          p.y < -120 ||
          p.x > canvas.width + 120 ||
          p.x < -120;

        if (p.life >= p.maxLife || isOutOfBounds) {
          particles[i] = createParticle(canvas.width, canvas.height);
          continue;
        }

        // Draw
        const drawFn = drawFunctions[p.shape];
        if (drawFn) {
          if (p.shape === "web") {
            drawFn(ctx, p.x, p.y, finalSize, 0, p.color, p.opacity);
          } else if (p.shape === "firefly") {
            // Fireflies pulse
            const pulse = 0.4 + Math.sin(p.life * 0.05) * 0.6;
            drawFn(ctx, p.x, p.y, finalSize * 0.5, 0, p.color, p.opacity * pulse);
          } else {
            drawFn(ctx, p.x, p.y, finalSize, p.rotation, p.color, p.opacity);
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [theme, config, isVisible, createParticle]);

  if (!theme || !config) return null;

  return (
    <>
      {/* Background glow */}
      {isVisible && config.bgGlow && (
        <div
          className="fixed inset-0 pointer-events-none z-[1]"
          style={{ background: config.bgGlow }}
        />
      )}

      {/* Overlay gradient */}
      {isVisible && config.overlayGradient && (
        <div
          className="fixed inset-0 pointer-events-none z-[2]"
          style={{ background: config.overlayGradient }}
        />
      )}

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[60]"
      />

      {/* Close button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-20 right-4 z-[61] w-9 h-9 rounded-full flex items-center justify-center text-xs transition-all"
        style={{
          backgroundColor: isVisible ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: isVisible ? "var(--mq-text-muted)" : "var(--mq-text-muted)",
          opacity: isVisible ? 0.8 : 0.3,
          backdropFilter: "blur(12px)",
          boxShadow: isVisible ? (config.borderGlow || "none") : "none",
        }}
        title={isVisible ? "Скрыть эффекты" : "Показать эффекты"}
      >
        {isVisible ? "✨" : "👁"}
      </button>
    </>
  );
}
