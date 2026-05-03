"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

// ── Phrases ──
const PHRASES: Record<string, string[]> = {
  friendly: [
    "Привет! Как музыка?",
    "Отличный вкус!",
    "Мяу~",
    "Давай послушаем что-нибудь новое!",
    "Ты сегодня в отличном настроении!",
    "Как насчёт чилл-плейлиста?",
    "*мурчит* Музыка — это жизнь~",
  ],
  sassy: [
    "*зевает* Опять попса?",
    "Я бы лучше спал...",
    "Это лучшее, что ты смог найти?",
    "Мяу... серьёзно?",
    "У меня лапки, а я подбираю музыку лучше",
    "*хмурится* Не то...",
    "Может, включим что-нибудь приличное?",
  ],
  sleepy: [
    "*засыпает*... мяу...",
    "Zzz... *мурчит*...",
    "Разбуди меня для хорошего трека...",
    "*свернулся клубочком*",
    "Мурр... ещё пять минут...",
    "Сон — лучшая музыка...",
    "*сонно открывает один глаз*...",
  ],
  excited: [
    "Новый трек! Новый трек!!",
    "МЯЯЯУУ!!",
    "Я ТАК РАД!!",
    "Включай скорее!!",
    "Это мой любимый!!",
    "ТАНЕЦ МЯУ!!",
    "Не могу усидеть на месте!!",
  ],
};

const PET_RESPONSES = [
  "Мурр~",
  "*мурчит громче*",
  "Ещё! Ещё!",
  "Мрррр~",
  "*трётся о руку*",
  "Мяяяу!",
  "*закрывает глаза от удовольствия*",
  "*мурлычет*",
];

const MILESTONES: Record<number, string> = {
  10: "10 погладили! Обожаю!",
  50: "50 погладили!! Ты лучший!",
  100: "100 погладили!!! ЛЕГЕНДА!!",
};

const FREQUENCY_MS: Record<string, [number, number]> = {
  rare: [300_000, 480_000],
  normal: [120_000, 240_000],
  often: [60_000, 120_000],
};

const SIZE_PX: Record<string, number> = {
  small: 72,
  medium: 100,
  large: 132,
};

const AUTO_DISMISS_MS = [8_000, 12_000];

// ── Blink timing (ms) ──
const BLINK_INTERVAL = 3500;
const BLINK_DURATION = 180;
const SMILE_HOLD_DURATION = 2500;

// ── Pet Effect ──
function PetEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [onDone]);

  const symbols = useMemo(
    () => [
      { sym: "\u2764", offset: -18 },
      { sym: "\uD83D\uDC3E", offset: -7 },
      { sym: "\u2728", offset: 4 },
      { sym: "\uD83D\uDC9C", offset: 15 },
      { sym: "\u2665", offset: 26 },
    ],
    []
  );

  return (
    <div className="absolute -top-4 left-1/2 -translate-x-1/2 pointer-events-none mq-no-transition">
      {symbols.map((item, i) => (
        <span
          key={i}
          className="absolute mq-no-transition"
          style={{
            fontSize: `${13 + i * 2}px`,
            left: `${item.offset}px`,
            animation: `mq-cat-pet-float 1.6s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.1}s both`,
            willChange: "transform, opacity",
          }}
        >
          {item.sym}
        </span>
      ))}
    </div>
  );
}

// ── Canvas Cat Drawing ──
// Kawaii/chibi-style cat inspired by Open Design's hatch-pet sprite aesthetic.
// Chunky readable silhouettes, simple expressive faces, flat cel shading, limited palette.
function drawCat(
  ctx: CanvasRenderingContext2D,
  size: number,
  state: "normal" | "blink" | "smile",
  mood: string,
  isPetting: boolean,
  tailPhase: number,
  accentColor: string
) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2 + 2;

  ctx.clearRect(0, 0, s, s);
  ctx.save();

  // Parse accent color to rgba helper
  const acR = parseInt(accentColor.slice(1, 3), 16);
  const acG = parseInt(accentColor.slice(3, 5), 16);
  const acB = parseInt(accentColor.slice(5, 7), 16);
  const acRGBA = (a: number) => `rgba(${acR},${acG},${acB},${a})`;

  // ══════════════════════════════════════════════════════
  // Chibi proportions: big head (~60%), small round body
  // ══════════════════════════════════════════════════════
  const headR = s * 0.34;
  const headY = cy - s * 0.07;
  const bodyR = s * 0.21;
  const bodyY = cy + s * 0.2;

  // ── 8. Accent color glow (subtle) ──
  const glowR = s * 0.47;
  const glowGrad = ctx.createRadialGradient(cx, cy, glowR * 0.5, cx, cy, glowR);
  glowGrad.addColorStop(0, acRGBA(0.08));
  glowGrad.addColorStop(0.6, acRGBA(0.04));
  glowGrad.addColorStop(1, acRGBA(0));
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // ── 9. Tail (thicker, expressive curve with round tip) — behind body ──
  const tailBaseX = cx + bodyR * 0.65;
  const tailBaseY = bodyY + bodyR * 0.2;
  const tailSwing = Math.sin(tailPhase) * bodyR * 0.45;
  const tailMidX = tailBaseX + bodyR * 0.5 + tailSwing * 0.5;
  const tailMidY = tailBaseY - bodyR * 0.7;
  const tailTipX = tailMidX + tailSwing * 0.4;
  const tailTipY = tailMidY - bodyR * 0.45;

  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.bezierCurveTo(
    tailBaseX + bodyR * 0.3 + tailSwing * 0.2, tailBaseY - bodyR * 0.15,
    tailMidX - bodyR * 0.15, tailMidY + bodyR * 0.25,
    tailTipX, tailTipY
  );
  ctx.strokeStyle = "#e8a44a";
  ctx.lineWidth = Math.max(3, bodyR * 0.3);
  ctx.lineCap = "round";
  ctx.stroke();

  // Tail tip (bigger round blob)
  ctx.beginPath();
  ctx.arc(tailTipX, tailTipY, Math.max(2, bodyR * 0.16), 0, Math.PI * 2);
  ctx.fillStyle = "#d4893a";
  ctx.fill();
  // Tiny highlight on tail tip
  ctx.beginPath();
  ctx.arc(tailTipX - bodyR * 0.04, tailTipY - bodyR * 0.05, Math.max(1, bodyR * 0.06), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fill();

  // ── 2. Body (softer, rounder, smaller chibi body) ──
  const bodyGrad = ctx.createRadialGradient(cx - bodyR * 0.15, bodyY - bodyR * 0.15, bodyR * 0.1, cx, bodyY, bodyR * 1.1);
  bodyGrad.addColorStop(0, "#f5c26b");
  bodyGrad.addColorStop(0.65, "#e8a44a");
  bodyGrad.addColorStop(1, "#d4893a");

  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bodyR, bodyR * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Belly patch (flat cel-shading — lighter oval)
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + bodyR * 0.06, bodyR * 0.58, bodyR * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fbe4c0";
  ctx.fill();

  // ── 7. Paws (small oval shapes at bottom of body) ──
  const pawY = bodyY + bodyR * 0.72;
  const pawRx = bodyR * 0.2;
  const pawRy = bodyR * 0.14;

  // Left paw
  ctx.beginPath();
  ctx.ellipse(cx - bodyR * 0.35, pawY, pawRx, pawRy, -0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#e8a44a";
  ctx.fill();
  // Left paw pad
  ctx.beginPath();
  ctx.ellipse(cx - bodyR * 0.35, pawY + pawRy * 0.25, pawRx * 0.45, pawRy * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // Right paw
  ctx.beginPath();
  ctx.ellipse(cx + bodyR * 0.35, pawY, pawRx, pawRy, 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#e8a44a";
  ctx.fill();
  // Right paw pad
  ctx.beginPath();
  ctx.ellipse(cx + bodyR * 0.35, pawY + pawRy * 0.25, pawRx * 0.45, pawRy * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // ── Head (big round chibi head, overlaps body) ──
  const headGrad = ctx.createRadialGradient(cx - headR * 0.12, headY - headR * 0.15, headR * 0.08, cx, headY, headR);
  headGrad.addColorStop(0, "#f5c26b");
  headGrad.addColorStop(0.55, "#e8a44a");
  headGrad.addColorStop(1, "#d4893a");

  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();

  // ── 3. Ears (rounder tips with visible fur tufts inside) ──
  const earH = headR * 0.5;

  // --- Left ear (rounder using quadratic curves) ---
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.62, headY - headR * 0.48);
  ctx.quadraticCurveTo(cx - headR * 0.82, headY - headR * 0.48 - earH * 0.65, cx - headR * 0.66, headY - headR * 0.48 - earH);
  ctx.quadraticCurveTo(cx - headR * 0.42, headY - headR * 0.48 - earH * 0.75, cx - headR * 0.15, headY - headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = "#e8a44a";
  ctx.fill();

  // Left ear inner pink
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.56, headY - headR * 0.53);
  ctx.quadraticCurveTo(cx - headR * 0.72, headY - headR * 0.53 - earH * 0.5, cx - headR * 0.6, headY - headR * 0.53 - earH * 0.72);
  ctx.quadraticCurveTo(cx - headR * 0.42, headY - headR * 0.53 - earH * 0.6, cx - headR * 0.24, headY - headR * 0.68);
  ctx.closePath();
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // Left ear fur tufts (3 small strokes)
  ctx.strokeStyle = "#fbe4c0";
  ctx.lineWidth = Math.max(0.7, headR * 0.022);
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const tx = cx - headR * 0.56 + (i - 1) * headR * 0.07;
    const ty = headY - headR * 0.56;
    const angle = -Math.PI / 2 + (i - 1) * 0.25;
    const len = headR * 0.09 + (1 - Math.abs(i - 1)) * headR * 0.03;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(angle) * len * 0.4, ty + Math.sin(angle) * len);
    ctx.stroke();
  }

  // --- Right ear ---
  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.62, headY - headR * 0.48);
  ctx.quadraticCurveTo(cx + headR * 0.82, headY - headR * 0.48 - earH * 0.65, cx + headR * 0.66, headY - headR * 0.48 - earH);
  ctx.quadraticCurveTo(cx + headR * 0.42, headY - headR * 0.48 - earH * 0.75, cx + headR * 0.15, headY - headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = "#e8a44a";
  ctx.fill();

  // Right ear inner pink
  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.56, headY - headR * 0.53);
  ctx.quadraticCurveTo(cx + headR * 0.72, headY - headR * 0.53 - earH * 0.5, cx + headR * 0.6, headY - headR * 0.53 - earH * 0.72);
  ctx.quadraticCurveTo(cx + headR * 0.42, headY - headR * 0.53 - earH * 0.6, cx + headR * 0.24, headY - headR * 0.68);
  ctx.closePath();
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // Right ear fur tufts
  ctx.strokeStyle = "#fbe4c0";
  ctx.lineWidth = Math.max(0.7, headR * 0.022);
  for (let i = 0; i < 3; i++) {
    const tx = cx + headR * 0.56 + (i - 1) * headR * 0.07;
    const ty = headY - headR * 0.56;
    const angle = -Math.PI / 2 + (i - 1) * 0.25;
    const len = headR * 0.09 + (1 - Math.abs(i - 1)) * headR * 0.03;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(angle) * len * 0.4, ty + Math.sin(angle) * len);
    ctx.stroke();
  }

  // ══════════════════════════════════════════════════════
  // 1 & 5. Eyes — big anime-style with enhanced expressions
  // ══════════════════════════════════════════════════════
  const eyeSpacing = headR * 0.32;
  const eyeY = headY + headR * 0.03;
  const eyeW = headR * 0.24; // ~30% of face diameter → kawaii big eyes
  const eyeH = headR * 0.29;

  const isSleepy = mood === "sleepy" && !isPetting;
  const isSassy = mood === "sassy" && !isPetting;

  // ── Helper: draw one big anime eye ──
  const drawBigEye = (ex: number, ey: number, slant: number) => {
    ctx.save();

    // Droopy/happy eye outline (slightly heavier on top for anime feel)
    const topCurve = -headR * 0.04 + slant;
    const botCurve = headR * 0.95;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, ey + eyeH * 0.1);
    ctx.quadraticCurveTo(ex, ey + topCurve, ex + eyeW, ey + eyeH * 0.05 + slant);
    ctx.quadraticCurveTo(ex, ey + botCurve, ex - eyeW, ey + eyeH * 0.1);
    ctx.closePath();
    ctx.clip();

    // White sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey + eyeH * 0.38, eyeW * 1.05, eyeH * 1.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Large colored iris (cat-green, cel-shaded)
    const irisR = eyeH * 0.62;
    const irisCY = ey + eyeH * 0.42;
    const irisGrad = ctx.createRadialGradient(ex - irisR * 0.15, irisCY - irisR * 0.15, irisR * 0.08, ex, irisCY, irisR);
    irisGrad.addColorStop(0, "#6dd85a");
    irisGrad.addColorStop(0.45, "#3da82e");
    irisGrad.addColorStop(1, "#2a7520");
    ctx.beginPath();
    ctx.arc(ex, irisCY, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Dark pupil (vertical cat-slit)
    const pupilRx = irisR * 0.3;
    const pupilRy = irisR * 0.7;
    ctx.beginPath();
    ctx.ellipse(ex, irisCY, pupilRx, pupilRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#140b03";
    ctx.fill();

    // Sparkle highlight #1 — big (top-right, bright)
    const s1R = irisR * 0.28;
    ctx.beginPath();
    ctx.ellipse(ex + irisR * 0.3, irisCY - irisR * 0.3, s1R, s1R * 0.85, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();

    // Sparkle highlight #2 — small (bottom-left)
    const s2R = irisR * 0.13;
    ctx.beginPath();
    ctx.arc(ex - irisR * 0.2, irisCY + irisR * 0.4, s2R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();

    ctx.restore();

    // Eye outline (drawn after restore so it's on top)
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, ey + eyeH * 0.1);
    ctx.quadraticCurveTo(ex, ey + topCurve, ex + eyeW, ey + eyeH * 0.05 + slant);
    ctx.quadraticCurveTo(ex, ey + botCurve, ex - eyeW, ey + eyeH * 0.1);
    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(1, headR * 0.03);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  // ── Helper: half-closed sleepy eye ──
  const drawSleepyEye = (ex: number, ey: number) => {
    ctx.save();
    // Clip to only show top ~55% of eye
    ctx.beginPath();
    ctx.rect(ex - eyeW * 1.3, ey - eyeH * 0.2, eyeW * 2.6, eyeH * 0.85);
    ctx.clip();

    // Sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey + eyeH * 0.38, eyeW * 1.05, eyeH * 1.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Iris
    const irisR = eyeH * 0.62;
    const irisCY = ey + eyeH * 0.42;
    const irisGrad = ctx.createRadialGradient(ex - irisR * 0.15, irisCY - irisR * 0.15, irisR * 0.08, ex, irisCY, irisR);
    irisGrad.addColorStop(0, "#6dd85a");
    irisGrad.addColorStop(0.45, "#3da82e");
    irisGrad.addColorStop(1, "#2a7520");
    ctx.beginPath();
    ctx.arc(ex, irisCY, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.ellipse(ex, irisCY, irisR * 0.3, irisR * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#140b03";
    ctx.fill();

    // Big sparkle
    const s1R = irisR * 0.28;
    ctx.beginPath();
    ctx.ellipse(ex + irisR * 0.3, irisCY - irisR * 0.3, s1R, s1R * 0.85, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();

    // Small sparkle
    ctx.beginPath();
    ctx.arc(ex - irisR * 0.2, irisCY + irisR * 0.4, irisR * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();

    ctx.restore();

    // Droopy eyelid — curved line closing the bottom
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.15, ey + eyeH * 0.12);
    ctx.quadraticCurveTo(ex, ey + eyeH * 0.22, ex + eyeW * 1.15, ey + eyeH * 0.08);
    ctx.strokeStyle = "#d4893a";
    ctx.lineWidth = Math.max(1.8, headR * 0.045);
    ctx.lineCap = "round";
    ctx.stroke();
    // Thin dark line on eyelid edge
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.15, ey + eyeH * 0.12);
    ctx.quadraticCurveTo(ex, ey + eyeH * 0.22, ex + eyeW * 1.15, ey + eyeH * 0.08);
    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(0.6, headR * 0.015);
    ctx.stroke();
  };

  // ── Draw eyes based on state & mood ──
  if (state === "blink" && !isSleepy) {
    // 5b. Blink: cute ^_^ style arched lines (upward curves)
    const blinkArcH = eyeH * 0.28;
    const lx = cx - eyeSpacing;
    const rx = cx + eyeSpacing;

    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(1.3, headR * 0.035);
    ctx.lineCap = "round";

    // Left blink arc (upward)
    ctx.beginPath();
    ctx.moveTo(lx - eyeW, eyeY + eyeH * 0.35);
    ctx.quadraticCurveTo(lx, eyeY - blinkArcH, lx + eyeW, eyeY + eyeH * 0.35);
    ctx.stroke();

    // Right blink arc (upward)
    ctx.beginPath();
    ctx.moveTo(rx - eyeW, eyeY + eyeH * 0.35);
    ctx.quadraticCurveTo(rx, eyeY - blinkArcH, rx + eyeW, eyeY + eyeH * 0.35);
    ctx.stroke();
  } else if (state === "smile" || isPetting) {
    // 5c. Smile: closed happy eyes like ◠‿◠ (wider upward arcs)
    const lx = cx - eyeSpacing;
    const rx = cx + eyeSpacing;

    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(1.5, headR * 0.04);
    ctx.lineCap = "round";

    // Left happy arc
    ctx.beginPath();
    ctx.moveTo(lx - eyeW, eyeY + eyeH * 0.3);
    ctx.quadraticCurveTo(lx, eyeY - eyeH * 0.35, lx + eyeW, eyeY + eyeH * 0.3);
    ctx.stroke();

    // Right happy arc
    ctx.beginPath();
    ctx.moveTo(rx - eyeW, eyeY + eyeH * 0.3);
    ctx.quadraticCurveTo(rx, eyeY - eyeH * 0.35, rx + eyeW, eyeY + eyeH * 0.3);
    ctx.stroke();
  } else if (isSleepy) {
    // 10a. Sleepy: half-closed eyes
    drawSleepyEye(cx - eyeSpacing, eyeY);
    drawSleepyEye(cx + eyeSpacing, eyeY);
  } else {
    // 5a. Normal: big sparkly eyes
    drawBigEye(cx - eyeSpacing, eyeY, 0);

    // 10b. Sassy: right eye slanted, left eye has raised eyebrow
    const sassySlant = isSassy ? -headR * 0.08 : 0;
    drawBigEye(cx + eyeSpacing, eyeY, sassySlant);

    if (isSassy) {
      // Raised eyebrow on left eye
      ctx.beginPath();
      ctx.moveTo(cx - eyeSpacing - eyeW * 0.85, eyeY - eyeH * 0.12);
      ctx.quadraticCurveTo(cx - eyeSpacing, eyeY - eyeH * 0.42, cx - eyeSpacing + eyeW * 0.85, eyeY - eyeH * 0.2);
      ctx.strokeStyle = "#2d1b0e";
      ctx.lineWidth = Math.max(1, headR * 0.025);
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  // ── 10c. Excited: star-shaped eye sparkles ──
  if (mood === "excited" && !isPetting) {
    const sp = tailPhase * 2;
    const drawStar = (sx: number, sy: number, sr: number, phase: number) => {
      const alpha = 0.45 + Math.sin(phase) * 0.3;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(phase * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a1 = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a1) * sr, Math.sin(a1) * sr);
        else ctx.lineTo(Math.cos(a1) * sr, Math.sin(a1) * sr);
        ctx.lineTo(Math.cos(a2) * sr * 0.32, Math.sin(a2) * sr * 0.32);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255,230,100,${alpha})`;
      ctx.fill();
      ctx.restore();
    };
    drawStar(cx - eyeSpacing - eyeW * 1.35, eyeY - eyeH * 0.15, headR * 0.08, sp);
    drawStar(cx + eyeSpacing + eyeW * 1.35, eyeY - eyeH * 0.05, headR * 0.065, sp + 1.2);
    drawStar(cx, eyeY - eyeH * 1.15, headR * 0.055, sp + 2.4);
  }

  // ── Nose (small rounded pink triangle) ──
  const noseY = eyeY + headR * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, noseY - headR * 0.04);
  ctx.quadraticCurveTo(cx - headR * 0.048, noseY + headR * 0.022, cx, noseY + headR * 0.028);
  ctx.quadraticCurveTo(cx + headR * 0.048, noseY + headR * 0.022, cx, noseY - headR * 0.04);
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // ── 4. Mouth ──
  const mouthY = noseY + headR * 0.02;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state === "smile" || isPetting) {
    // 5c cont. Bigger open mouth with tiny fang
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + headR * 0.065, headR * 0.085, headR * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f7b8d0";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + headR * 0.065, headR * 0.085, headR * 0.06, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(0.7, headR * 0.016);
    ctx.stroke();

    // Tiny cute fang (left side)
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.028, mouthY + headR * 0.04);
    ctx.lineTo(cx - headR * 0.022, mouthY + headR * 0.075);
    ctx.lineTo(cx - headR * 0.012, mouthY + headR * 0.04);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
  } else {
    // 4. ω-shaped cat mouth (like :3 but rounder)
    const omegaR = headR * 0.055;
    const omegaY = mouthY + headR * 0.045;

    // Center vertical line from nose down
    ctx.beginPath();
    ctx.moveTo(cx, noseY + headR * 0.028);
    ctx.lineTo(cx, omegaY);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(0.6, headR * 0.014);
    ctx.stroke();

    // Left ω bump
    ctx.beginPath();
    ctx.arc(cx - omegaR, omegaY, omegaR, 0, Math.PI);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(0.7, headR * 0.018);
    ctx.stroke();

    // Right ω bump
    ctx.beginPath();
    ctx.arc(cx + omegaR, omegaY, omegaR, 0, Math.PI);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(0.7, headR * 0.018);
    ctx.stroke();
  }

  // ── 6. Whiskers (slightly curved, natural) ──
  const whiskerY = noseY + headR * 0.07;
  ctx.strokeStyle = "rgba(80,50,30,0.22)";
  ctx.lineWidth = Math.max(0.5, headR * 0.013);
  ctx.lineCap = "round";

  // Left whiskers (curved via quadratic)
  const whiskerDy = [headR * 0.065, 0, -headR * 0.065];
  for (let i = 0; i < 3; i++) {
    const sy = whiskerY + whiskerDy[i];
    const ex2 = cx - headR * 0.68;
    const ey2 = sy + whiskerDy[i] * 0.4;
    const cpx = cx - headR * 0.4;
    const cpy = sy + whiskerDy[i] * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.22, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex2, ey2);
    ctx.stroke();
  }
  // Right whiskers
  for (let i = 0; i < 3; i++) {
    const sy = whiskerY + whiskerDy[i];
    const ex2 = cx + headR * 0.68;
    const ey2 = sy + whiskerDy[i] * 0.4;
    const cpx = cx + headR * 0.4;
    const cpy = sy + whiskerDy[i] * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.22, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex2, ey2);
    ctx.stroke();
  }

  // ── Cheek blush (always subtle, stronger on smile/excited) ──
  const blushA = (state === "smile" || isPetting || mood === "excited") ? 0.28 : 0.1;
  ctx.beginPath();
  ctx.ellipse(cx - headR * 0.44, noseY + headR * 0.06, headR * 0.095, headR * 0.055, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + headR * 0.44, noseY + headR * 0.06, headR * 0.095, headR * 0.055, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();

  // ── 10a. Sleepy mood: smaller Zzz ──
  if (mood === "sleepy" && !isPetting) {
    const zPhase = (tailPhase * 0.5) % (Math.PI * 2);
    ctx.font = `bold ${headR * 0.15}px sans-serif`;
    ctx.fillStyle = "rgba(128,128,128,0.35)";
    ctx.fillText("z", cx + headR * 0.6, headY - headR * 0.55 + Math.sin(zPhase) * 2);
    ctx.font = `bold ${headR * 0.19}px sans-serif`;
    ctx.fillStyle = "rgba(128,128,128,0.25)";
    ctx.fillText("Z", cx + headR * 0.75, headY - headR * 0.78 + Math.sin(zPhase + 1) * 2);
  }

  // ── 10b. Sassy mood: ._. ──
  if (mood === "sassy" && !isPetting) {
    ctx.font = `${headR * 0.17}px monospace`;
    ctx.fillStyle = "rgba(128,128,128,0.45)";
    ctx.textAlign = "center";
    ctx.fillText("._.", cx, headY - headR * 1.0);
  }

  ctx.restore();
}

// ── Canvas Cat Component ──
function CanvasCat({
  size,
  state,
  mood,
  isPetting,
}: {
  size: number;
  state: "normal" | "blink" | "smile";
  mood: string;
  isPetting: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tailPhaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let lastTime = performance.now();
    // Tail speed based on mood
    const getTailSpeed = () => {
      if (isPetting) return 8;
      switch (mood) {
        case "excited": return 4;
        case "sassy": return 1.5;
        case "sleepy": return 1;
        default: return 2.5;
      }
    };

    const draw = (timestamp: number) => {
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      tailPhaseRef.current += getTailSpeed() * dt;

      drawCat(ctx, size, state, mood, isPetting, tailPhaseRef.current, "#e03131");
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [size, state, mood, isPetting]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
      }}
      className="mq-no-transition"
      draggable={false}
    />
  );
}

// ── Main Component ──
export default function MqCat() {
  const catEnabled = useAppStore((s) => s.catEnabled);
  const catFrequency = useAppStore((s) => s.catFrequency);
  const catMood = useAppStore((s) => s.catMood);
  const catSize = useAppStore((s) => s.catSize);
  const petCat = useAppStore((s) => s.petCat);

  const [isVisible, setIsVisible] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [showPetEffect, setShowPetEffect] = useState(false);
  const [isPetting, setIsPetting] = useState(false);

  // Animation states
  const [isBlinking, setIsBlinking] = useState(false);
  const [isSmiling, setIsSmiling] = useState(false);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const petTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const size = SIZE_PX[catSize] ?? 100;

  const getRandomPhrase = useCallback((mood: string) => {
    const list = PHRASES[mood] ?? PHRASES.friendly;
    return list[Math.floor(Math.random() * list.length)];
  }, []);

  const getRandomDelay = useCallback((freq: string) => {
    const [min, max] = FREQUENCY_MS[freq] ?? FREQUENCY_MS.normal;
    return min + Math.random() * (max - min);
  }, []);

  const getRandomDismiss = useCallback(() => {
    const [min, max] = AUTO_DISMISS_MS;
    return min + Math.random() * (max - min);
  }, []);

  // ── Blink loop ──
  useEffect(() => {
    if (!isVisible) return;

    const doBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), BLINK_DURATION);
    };

    const initialDelay = BLINK_INTERVAL + Math.random() * 2000;
    const first = setTimeout(() => {
      doBlink();
      blinkTimerRef.current = setInterval(() => {
        doBlink();
        if (Math.random() < 0.25) {
          setTimeout(doBlink, 300);
        }
      }, BLINK_INTERVAL + Math.random() * 1500);
    }, initialDelay);

    return () => {
      clearTimeout(first);
      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
    };
  }, [isVisible]);

  // ── Random smile flash (friendly/excited moods) ──
  useEffect(() => {
    if (!isVisible || catMood === "sassy" || catMood === "sleepy") return;

    const doSmile = () => {
      setIsSmiling(true);
      setTimeout(() => setIsSmiling(false), SMILE_HOLD_DURATION);
    };

    const interval = setInterval(() => {
      if (Math.random() < 0.4 && !isPetting) doSmile();
    }, 5000);

    return () => clearInterval(interval);
  }, [isVisible, catMood, isPetting]);

  const showCat = useCallback(() => {
    const milestoneKey = [10, 50, 100].find(
      (m) => useAppStore.getState().catPetCount === m
    );
    const newPhrase = milestoneKey
      ? MILESTONES[milestoneKey]
      : getRandomPhrase(useAppStore.getState().catMood);

    setPhrase(newPhrase);
    setIsVisible(true);

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, getRandomDismiss());
  }, [getRandomPhrase, getRandomDismiss]);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  const handlePet = useCallback(() => {
    petCat();
    setShowPetEffect(true);
    setIsPetting(true);
    setIsSmiling(true);

    const resp = PET_RESPONSES[Math.floor(Math.random() * PET_RESPONSES.length)];
    setPhrase(resp);

    if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
    if (smileTimerRef.current) clearTimeout(smileTimerRef.current);
    petTimeoutRef.current = setTimeout(() => {
      setIsPetting(false);
    }, 2200);
    smileTimerRef.current = setTimeout(() => {
      setIsSmiling(false);
    }, 2500);
  }, [petCat]);

  const handlePetEffectDone = useCallback(() => {
    setShowPetEffect(false);
  }, []);

  // Mood animation config
  const moodFloat = useMemo(() => {
    switch (catMood) {
      case "sleepy":
        return { y: [0, -1.5, 0.5, 0], rotate: [0, 1.5, 0.5, 0] };
      case "excited":
        return { y: [0, -6, -2, -7, -1, -4, 0], rotate: [0, 1.5, -1, 1, -0.5, 0.8, 0] };
      case "sassy":
        return { y: [0, -3, -1, -4, 0], rotate: [0, -1.5, 0, -2, 0] };
      default:
        return { y: [0, -5, -2, -6, -1, -4, 0], rotate: [0, 0.8, -0.5, 0.5, -0.3, 0.6, 0] };
    }
  }, [catMood]);

  const moodDuration = catMood === "sleepy" ? 6 : catMood === "excited" ? 2 : catMood === "sassy" ? 3.5 : 4;

  // Determine cat expression state
  const catState: "normal" | "blink" | "smile" = isBlinking ? "blink" : isSmiling ? "smile" : "normal";

  // Schedule appearance
  useEffect(() => {
    if (!catEnabled) {
      setIsVisible(false);
      setIsPetting(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const initialDelay = getRandomDelay(catFrequency);
    const firstTimer = setTimeout(() => {
      showCat();
    }, initialDelay);

    intervalRef.current = setInterval(() => {
      if (!isVisible) {
        if (Math.random() < 0.7) {
          showCat();
        }
      }
    }, 30_000);

    return () => {
      clearTimeout(firstTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
      if (smileTimerRef.current) clearTimeout(smileTimerRef.current);
    };
  }, [catEnabled, catFrequency, isVisible, showCat, getRandomDelay]);

  useEffect(() => {
    if (!isVisible && catEnabled) {
      const delay = getRandomDelay(catFrequency);
      const timer = setTimeout(() => {
        showCat();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isVisible, catEnabled, catFrequency, showCat, getRandomDelay]);

  if (!catEnabled) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="mq-cat"
          className="fixed z-[40] mq-no-transition"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 56px + 8px)",
            right: "16px",
          }}
          initial={{ opacity: 0, y: 80, scale: 0.3 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.3 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 22,
            mass: 0.7,
          }}
        >
          {/* Speech bubble */}
          <motion.div
            className="absolute mq-no-transition"
            style={{
              bottom: "100%",
              right: 0,
              marginBottom: "12px",
              width: "max-content",
              maxWidth: "220px",
            }}
            initial={{ opacity: 0, y: 12, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.8 }}
            transition={{
              delay: 0.3,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div
              className="relative rounded-2xl px-4 py-2.5 text-xs leading-relaxed"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
                backdropFilter: "blur(12px)",
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer mq-no-transition"
                style={{
                  backgroundColor: "var(--mq-border)",
                  color: "var(--mq-text-muted)",
                  lineHeight: 1,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
                aria-label="Закрыть"
              >x</button>

              <div
                className="absolute -bottom-[6px] right-5 w-3 h-3 rotate-45"
                style={{
                  backgroundColor: "var(--mq-card)",
                  borderRight: "1px solid var(--mq-border)",
                  borderBottom: "1px solid var(--mq-border)",
                }}
              />
              <span>{phrase}</span>
            </div>
          </motion.div>

          {/* Cat body — canvas based */}
          <motion.button
            onClick={handlePet}
            className="relative cursor-pointer outline-none mq-no-transition"
            style={{
              width: size,
              height: size,
              background: "transparent",
              filter: `drop-shadow(0 4px 16px rgba(0,0,0,0.45))`,
            }}
            whileTap={{ scale: 0.85 }}
            aria-label="Погладить кота"
          >
            {/* Floating animation wrapper */}
            <motion.div
              className="w-full h-full relative mq-no-transition"
              animate={
                isPetting
                  ? { y: [0, -6, 0, -5, 0], rotate: [0, -8, 5, -4, 0], scale: [1, 1.08, 1.02, 1.1, 1] }
                  : moodFloat
              }
              transition={
                isPetting
                  ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: moodDuration, repeat: Infinity, ease: "easeInOut" }
              }
            >
              {/* Canvas Cat */}
              <CanvasCat
                size={size}
                state={catState}
                mood={catMood}
                isPetting={isPetting}
              />

              {/* Pet glow */}
              {isPetting && (
                <motion.div
                  className="absolute inset-0 mq-no-transition"
                  style={{ borderRadius: "50%" }}
                  animate={{
                    boxShadow: [
                      "inset 0 0 20px rgba(224,49,49,0.2), 0 0 20px rgba(224,49,49,0.15)",
                      "inset 0 0 30px rgba(224,49,49,0.35), 0 0 30px rgba(224,49,49,0.25)",
                    ],
                  }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
                />
              )}
            </motion.div>

            {/* Music notes */}
            {!isPetting && (catMood === "friendly" || catMood === "excited") && (
              <div className="absolute -top-3 -left-1 pointer-events-none mq-no-transition">
                <motion.span
                  className="text-sm mq-no-transition"
                  style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -14, -6], opacity: [0.4, 0.8, 0.2], rotate: [0, 12, -6] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                >♪</motion.span>
              </div>
            )}
            {!isPetting && catMood === "excited" && (
              <div className="absolute -top-2 -right-2 pointer-events-none mq-no-transition">
                <motion.span
                  className="text-xs mq-no-transition"
                  style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -12, -4], opacity: [0.3, 0.9, 0.1], rotate: [0, -10, 8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >♫</motion.span>
              </div>
            )}

            {/* Pet effect */}
            {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
