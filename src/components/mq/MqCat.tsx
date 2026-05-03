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
// Dark anime-style cat with golden eyes, white collar, red bow tie.
// Sitting upright, clean black outlines, soft cel-shading.
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
  // Anime proportions: large round head, compact sitting body
  // ══════════════════════════════════════════════════════
  const headR = s * 0.32;
  const headY = cy - s * 0.09;
  const bodyR = s * 0.22;
  const bodyY = cy + s * 0.22;

  // Common line settings for black outlines
  const outlineW = Math.max(1.2, s * 0.014);
  const outlineColor = "#000000";

  // ── Subtle accent glow ──
  const glowR = s * 0.48;
  const glowGrad = ctx.createRadialGradient(cx, cy, glowR * 0.4, cx, cy, glowR);
  glowGrad.addColorStop(0, acRGBA(0.06));
  glowGrad.addColorStop(0.5, acRGBA(0.03));
  glowGrad.addColorStop(1, acRGBA(0));
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // ══════════════════════════════════════════
  // TAIL — S-curve with stripes, behind body
  // ══════════════════════════════════════════
  const tailBaseX = cx + bodyR * 0.55;
  const tailBaseY = bodyY + bodyR * 0.15;
  const tailSwing = Math.sin(tailPhase) * bodyR * 0.35;
  // S-curve control points
  const cp1x = tailBaseX + bodyR * 0.6 + tailSwing * 0.3;
  const cp1y = tailBaseY - bodyR * 0.8;
  const cp2x = tailBaseX + bodyR * 0.15 + tailSwing * 0.6;
  const cp2y = tailBaseY - bodyR * 1.4;
  const tipX = tailBaseX + bodyR * 0.5 + tailSwing * 0.5;
  const tipY = tailBaseY - bodyR * 1.7;

  // Tail stroke
  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tipX, tipY);
  ctx.strokeStyle = "#1A1A1A";
  ctx.lineWidth = Math.max(3.5, bodyR * 0.28);
  ctx.lineCap = "round";
  ctx.stroke();

  // Tail outline (slightly wider, drawn underneath)
  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tipX, tipY);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = Math.max(4.5, bodyR * 0.34);
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "destination-over";
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  // Tail stripes (3 dark gray bands)
  const stripeColor = "#222222";
  for (let t = 0.25; t <= 0.75; t += 0.25) {
    const t1 = t - 0.03;
    const t2 = t + 0.03;
    // Sample bezier at t1 and t2
    const bx = bezierPoint(tailBaseX, cp1x, cp2x, tipX, t);
    const by = bezierPoint(tailBaseY, cp1y, cp2y, tipY, t);
    const ex2 = bezierPoint(tailBaseX, cp1x, cp2x, tipX, t + 0.06);
    const ey2 = bezierPoint(tailBaseY, cp1y, cp2y, tipY, t + 0.06);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex2, ey2);
    ctx.strokeStyle = stripeColor;
    ctx.lineWidth = Math.max(4, bodyR * 0.3);
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  // ══════════════════════════════════════════
  // BODY — dark charcoal with lighter chest
  // ══════════════════════════════════════════
  const bodyGrad = ctx.createRadialGradient(cx - bodyR * 0.12, bodyY - bodyR * 0.2, bodyR * 0.1, cx, bodyY, bodyR * 1.15);
  bodyGrad.addColorStop(0, "#2D2D2D");
  bodyGrad.addColorStop(0.5, "#1A1A1A");
  bodyGrad.addColorStop(1, "#111111");

  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bodyR, bodyR * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Chest patch (lighter gray oval, cel-shading)
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + bodyR * 0.04, bodyR * 0.52, bodyR * 0.58, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2D2D2D";
  ctx.fill();

  // ══════════════════════════════════════════
  // PAWS — tucked under body
  // ══════════════════════════════════════════
  const pawY = bodyY + bodyR * 0.7;
  const pawRx = bodyR * 0.22;
  const pawRy = bodyR * 0.15;

  // Left paw
  ctx.beginPath();
  ctx.ellipse(cx - bodyR * 0.38, pawY, pawRx, pawRy, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  // Left paw pad
  ctx.beginPath();
  ctx.ellipse(cx - bodyR * 0.38, pawY + pawRy * 0.2, pawRx * 0.4, pawRy * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#FFB6C1";
  ctx.fill();

  // Right paw
  ctx.beginPath();
  ctx.ellipse(cx + bodyR * 0.38, pawY, pawRx, pawRy, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  // Right paw pad
  ctx.beginPath();
  ctx.ellipse(cx + bodyR * 0.38, pawY + pawRy * 0.2, pawRx * 0.4, pawRy * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#FFB6C1";
  ctx.fill();

  // ══════════════════════════════════════════
  // HEAD — large round, slightly forward tilt
  // ══════════════════════════════════════════
  const headGrad = ctx.createRadialGradient(cx - headR * 0.1, headY - headR * 0.15, headR * 0.08, cx, headY, headR);
  headGrad.addColorStop(0, "#2D2D2D");
  headGrad.addColorStop(0.5, "#1A1A1A");
  headGrad.addColorStop(1, "#111111");

  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ══════════════════════════════════════════
  // EARS — triangular with rounded tips, pink inner
  // ══════════════════════════════════════════
  const earH = headR * 0.55;

  // --- Left ear ---
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.65, headY - headR * 0.5);
  ctx.quadraticCurveTo(cx - headR * 0.88, headY - headR * 0.5 - earH * 0.6, cx - headR * 0.7, headY - headR * 0.5 - earH);
  ctx.quadraticCurveTo(cx - headR * 0.44, headY - headR * 0.5 - earH * 0.8, cx - headR * 0.12, headY - headR * 0.76);
  ctx.closePath();
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Left ear inner pink
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.58, headY - headR * 0.56);
  ctx.quadraticCurveTo(cx - headR * 0.76, headY - headR * 0.56 - earH * 0.45, cx - headR * 0.64, headY - headR * 0.56 - earH * 0.7);
  ctx.quadraticCurveTo(cx - headR * 0.42, headY - headR * 0.56 - earH * 0.62, cx - headR * 0.2, headY - headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = "#FFB6C1";
  ctx.fill();

  // Left ear stripes (3 thin black lines)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = Math.max(0.6, headR * 0.018);
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const startX = cx - headR * 0.72 + i * headR * 0.1;
    const startY = headY - headR * 0.65 - i * earH * 0.2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + headR * 0.03, startY - earH * 0.18);
    ctx.stroke();
  }

  // --- Right ear ---
  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.65, headY - headR * 0.5);
  ctx.quadraticCurveTo(cx + headR * 0.88, headY - headR * 0.5 - earH * 0.6, cx + headR * 0.7, headY - headR * 0.5 - earH);
  ctx.quadraticCurveTo(cx + headR * 0.44, headY - headR * 0.5 - earH * 0.8, cx + headR * 0.12, headY - headR * 0.76);
  ctx.closePath();
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Right ear inner pink
  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.58, headY - headR * 0.56);
  ctx.quadraticCurveTo(cx + headR * 0.76, headY - headR * 0.56 - earH * 0.45, cx + headR * 0.64, headY - headR * 0.56 - earH * 0.7);
  ctx.quadraticCurveTo(cx + headR * 0.42, headY - headR * 0.56 - earH * 0.62, cx + headR * 0.2, headY - headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = "#FFB6C1";
  ctx.fill();

  // Right ear stripes
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = Math.max(0.6, headR * 0.018);
  for (let i = 0; i < 3; i++) {
    const startX = cx + headR * 0.72 - i * headR * 0.1;
    const startY = headY - headR * 0.65 - i * earH * 0.2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX - headR * 0.03, startY - earH * 0.18);
    ctx.stroke();
  }

  // ══════════════════════════════════════════
  // EYES — big golden anime eyes with black pupils
  // ══════════════════════════════════════════
  const eyeSpacing = headR * 0.34;
  const eyeY = headY + headR * 0.02;
  const eyeW = headR * 0.22;
  const eyeH = headR * 0.28;

  const isSleepy = mood === "sleepy" && !isPetting;
  const isSassy = mood === "sassy" && !isPetting;

  // ── Helper: draw golden anime eye ──
  const drawBigEye = (ex: number, ey: number, slant: number) => {
    ctx.save();

    const topCurve = -headR * 0.04 + slant;
    const botCurve = headR * 0.92;

    // Eye outline path
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, ey + eyeH * 0.08);
    ctx.quadraticCurveTo(ex, ey + topCurve, ex + eyeW, ey + eyeH * 0.04 + slant);
    ctx.quadraticCurveTo(ex, ey + botCurve, ex - eyeW, ey + eyeH * 0.08);
    ctx.closePath();
    ctx.clip();

    // White sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey + eyeH * 0.35, eyeW * 1.08, eyeH * 1.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Golden yellow iris (gradient cel-shaded)
    const irisR = eyeH * 0.6;
    const irisCY = ey + eyeH * 0.38;
    const irisGrad = ctx.createRadialGradient(ex - irisR * 0.12, irisCY - irisR * 0.12, irisR * 0.06, ex, irisCY, irisR);
    irisGrad.addColorStop(0, "#FFE44D");
    irisGrad.addColorStop(0.35, "#FFD700");
    irisGrad.addColorStop(0.7, "#E6B800");
    irisGrad.addColorStop(1, "#CC9900");
    ctx.beginPath();
    ctx.arc(ex, irisCY, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Dark round pupil
    const pupilR = irisR * 0.42;
    ctx.beginPath();
    ctx.arc(ex, irisCY, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    // Primary sparkle highlight — top-right (bright white dot)
    const s1R = irisR * 0.22;
  ctx.beginPath();
    ctx.arc(ex + irisR * 0.32, irisCY - irisR * 0.32, s1R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();

    // Secondary sparkle — bottom-left (smaller)
    const s2R = irisR * 0.11;
    ctx.beginPath();
    ctx.arc(ex - irisR * 0.22, irisCY + irisR * 0.38, s2R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();

    ctx.restore();

    // Eye outline on top
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, ey + eyeH * 0.08);
    ctx.quadraticCurveTo(ex, ey + topCurve, ex + eyeW, ey + eyeH * 0.04 + slant);
    ctx.quadraticCurveTo(ex, ey + botCurve, ex - eyeW, ey + eyeH * 0.08);
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(1.2, headR * 0.03);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Thin eyelid with subtle pink inner lining
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, ey + eyeH * 0.08);
    ctx.quadraticCurveTo(ex, ey + topCurve, ex + eyeW, ey + eyeH * 0.04 + slant);
    ctx.strokeStyle = "rgba(255,182,193,0.3)";
    ctx.lineWidth = Math.max(0.5, headR * 0.012);
    ctx.stroke();
  };

  // ── Helper: half-closed sleepy eye ──
  const drawSleepyEye = (ex: number, ey: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex - eyeW * 1.3, ey - eyeH * 0.2, eyeW * 2.6, eyeH * 0.8);
    ctx.clip();

    // Sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey + eyeH * 0.35, eyeW * 1.08, eyeH * 1.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Golden iris
    const irisR = eyeH * 0.6;
    const irisCY = ey + eyeH * 0.38;
    const irisGrad = ctx.createRadialGradient(ex - irisR * 0.12, irisCY - irisR * 0.12, irisR * 0.06, ex, irisCY, irisR);
    irisGrad.addColorStop(0, "#FFE44D");
    irisGrad.addColorStop(0.35, "#FFD700");
    irisGrad.addColorStop(0.7, "#E6B800");
    irisGrad.addColorStop(1, "#CC9900");
    ctx.beginPath();
    ctx.arc(ex, irisCY, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(ex, irisCY, irisR * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    // Sparkle
    ctx.beginPath();
    ctx.arc(ex + irisR * 0.32, irisCY - irisR * 0.32, irisR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();

    ctx.restore();

    // Droopy eyelid
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.2, ey + eyeH * 0.1);
    ctx.quadraticCurveTo(ex, ey + eyeH * 0.2, ex + eyeW * 1.2, ey + eyeH * 0.06);
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = Math.max(2, headR * 0.05);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(0.8, headR * 0.018);
    ctx.stroke();
  };

  // ── Draw eyes based on state & mood ──
  if (state === "blink" && !isSleepy) {
    // Blink: cute ^_^ upward arcs
    const blinkArcH = eyeH * 0.3;
    const lx = cx - eyeSpacing;
    const rx = cx + eyeSpacing;

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(1.4, headR * 0.035);
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(lx - eyeW, eyeY + eyeH * 0.35);
    ctx.quadraticCurveTo(lx, eyeY - blinkArcH, lx + eyeW, eyeY + eyeH * 0.35);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rx - eyeW, eyeY + eyeH * 0.35);
    ctx.quadraticCurveTo(rx, eyeY - blinkArcH, rx + eyeW, eyeY + eyeH * 0.35);
    ctx.stroke();
  } else if (state === "smile" || isPetting) {
    // Smile: closed happy ◠‿◠ arcs
    const lx = cx - eyeSpacing;
    const rx = cx + eyeSpacing;

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(1.6, headR * 0.04);
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(lx - eyeW, eyeY + eyeH * 0.3);
    ctx.quadraticCurveTo(lx, eyeY - eyeH * 0.38, lx + eyeW, eyeY + eyeH * 0.3);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rx - eyeW, eyeY + eyeH * 0.3);
    ctx.quadraticCurveTo(rx, eyeY - eyeH * 0.38, rx + eyeW, eyeY + eyeH * 0.3);
    ctx.stroke();
  } else if (isSleepy) {
    drawSleepyEye(cx - eyeSpacing, eyeY);
    drawSleepyEye(cx + eyeSpacing, eyeY);
  } else {
    // Normal: big sparkly golden eyes
    drawBigEye(cx - eyeSpacing, eyeY, 0);

    const sassySlant = isSassy ? -headR * 0.08 : 0;
    drawBigEye(cx + eyeSpacing, eyeY, sassySlant);

    if (isSassy) {
      ctx.beginPath();
      ctx.moveTo(cx - eyeSpacing - eyeW * 0.85, eyeY - eyeH * 0.14);
      ctx.quadraticCurveTo(cx - eyeSpacing, eyeY - eyeH * 0.44, cx - eyeSpacing + eyeW * 0.85, eyeY - eyeH * 0.22);
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = Math.max(1.1, headR * 0.028);
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  // ── Excited: star sparkles around eyes ──
  if (mood === "excited" && !isPetting) {
    const sp = tailPhase * 2;
    const drawStar = (sx: number, sy: number, sr: number, phase: number) => {
      const alpha = 0.5 + Math.sin(phase) * 0.35;
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
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.fill();
      ctx.restore();
    };
    drawStar(cx - eyeSpacing - eyeW * 1.4, eyeY - eyeH * 0.15, headR * 0.075, sp);
    drawStar(cx + eyeSpacing + eyeW * 1.4, eyeY - eyeH * 0.05, headR * 0.06, sp + 1.2);
    drawStar(cx, eyeY - eyeH * 1.2, headR * 0.05, sp + 2.4);
  }

  // ══════════════════════════════════════════
  // NOSE — small pink triangle
  // ══════════════════════════════════════════
  const noseY = eyeY + headR * 0.32;
  ctx.beginPath();
  ctx.moveTo(cx, noseY - headR * 0.045);
  ctx.quadraticCurveTo(cx - headR * 0.05, noseY + headR * 0.024, cx, noseY + headR * 0.03);
  ctx.quadraticCurveTo(cx + headR * 0.05, noseY + headR * 0.024, cx, noseY - headR * 0.045);
  ctx.fillStyle = "#FFB6C1";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = Math.max(0.5, headR * 0.01);
  ctx.stroke();

  // ══════════════════════════════════════════
  // MOUTH — ω shape or smile
  // ══════════════════════════════════════════
  const mouthY = noseY + headR * 0.02;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state === "smile" || isPetting) {
    // Open smile with tiny fang
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + headR * 0.07, headR * 0.09, headR * 0.065, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFB6C1";
    ctx.fill();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(0.6, headR * 0.015);
    ctx.stroke();

    // Tiny fang (left)
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.03, mouthY + headR * 0.04);
    ctx.lineTo(cx - headR * 0.024, mouthY + headR * 0.08);
    ctx.lineTo(cx - headR * 0.014, mouthY + headR * 0.04);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 0.4;
    ctx.stroke();
  } else {
    // ω-shaped cat mouth
    const omegaR = headR * 0.052;
    const omegaY = mouthY + headR * 0.048;

    ctx.beginPath();
    ctx.moveTo(cx, noseY + headR * 0.03);
    ctx.lineTo(cx, omegaY);
    ctx.strokeStyle = "rgba(200,200,200,0.35)";
    ctx.lineWidth = Math.max(0.6, headR * 0.014);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - omegaR, omegaY, omegaR, 0, Math.PI);
    ctx.strokeStyle = "rgba(200,200,200,0.35)";
    ctx.lineWidth = Math.max(0.7, headR * 0.017);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx + omegaR, omegaY, omegaR, 0, Math.PI);
    ctx.strokeStyle = "rgba(200,200,200,0.35)";
    ctx.lineWidth = Math.max(0.7, headR * 0.017);
    ctx.stroke();
  }

  // ══════════════════════════════════════════
  // WHISKERS — white, 6 per side (3 upper, 3 lower)
  // ══════════════════════════════════════════
  const whiskerY = noseY + headR * 0.08;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.6, headR * 0.014);
  ctx.lineCap = "round";

  // Left whiskers (3)
  const whDy = [headR * 0.09, 0, -headR * 0.09];
  for (let i = 0; i < 3; i++) {
    const sy = whiskerY + whDy[i];
    const wx = cx - headR * 0.72;
    const wy = sy + whDy[i] * 0.5;
    const cpx = cx - headR * 0.42;
    const cpy = sy + whDy[i] * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.24, sy);
    ctx.quadraticCurveTo(cpx, cpy, wx, wy);
    ctx.stroke();
  }
  // Right whiskers (3)
  for (let i = 0; i < 3; i++) {
    const sy = whiskerY + whDy[i];
    const wx = cx + headR * 0.72;
    const wy = sy + whDy[i] * 0.5;
    const cpx = cx + headR * 0.42;
    const cpy = sy + whDy[i] * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.24, sy);
    ctx.quadraticCurveTo(cpx, cpy, wx, wy);
    ctx.stroke();
  }

  // ══════════════════════════════════════════
  // CHEEK BLUSH — subtle pink ovals
  // ══════════════════════════════════════════
  const blushA = (state === "smile" || isPetting || mood === "excited") ? 0.3 : 0.12;
  ctx.beginPath();
  ctx.ellipse(cx - headR * 0.48, noseY + headR * 0.06, headR * 0.1, headR * 0.055, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + headR * 0.48, noseY + headR * 0.06, headR * 0.1, headR * 0.055, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();

  // ══════════════════════════════════════════
  // COLLAR — white band around neck
  // ══════════════════════════════════════════
  const collarY = headY + headR * 0.72;
  const collarW = headR * 0.75;
  const collarH = headR * 0.12;

  ctx.beginPath();
  ctx.ellipse(cx, collarY, collarW, collarH, 0, 0, Math.PI);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Top edge of collar (hidden behind head but gives shape)
  ctx.beginPath();
  ctx.ellipse(cx, collarY - collarH * 0.3, collarW * 0.92, collarH * 0.4, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = "#F0F0F0";
  ctx.fill();

  // ══════════════════════════════════════════
  // BOW TIE — red, centered below collar
  // ══════════════════════════════════════════
  const bowY = collarY + collarH * 0.6;
  const bowW = headR * 0.26;
  const bowH = headR * 0.16;
  const knotR = headR * 0.045;

  // Left wing
  ctx.beginPath();
  ctx.moveTo(cx - knotR, bowY);
  ctx.quadraticCurveTo(cx - bowW * 0.6, bowY - bowH * 0.8, cx - bowW, bowY - bowH * 0.2);
  ctx.quadraticCurveTo(cx - bowW * 1.1, bowY + bowH * 0.15, cx - bowW, bowY + bowH * 0.35);
  ctx.quadraticCurveTo(cx - bowW * 0.5, bowY + bowH * 0.9, cx - knotR, bowY);
  ctx.closePath();
  ctx.fillStyle = "#DC143C";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Right wing
  ctx.beginPath();
  ctx.moveTo(cx + knotR, bowY);
  ctx.quadraticCurveTo(cx + bowW * 0.6, bowY - bowH * 0.8, cx + bowW, bowY - bowH * 0.2);
  ctx.quadraticCurveTo(cx + bowW * 1.1, bowY + bowH * 0.15, cx + bowW, bowY + bowH * 0.35);
  ctx.quadraticCurveTo(cx + bowW * 0.5, bowY + bowH * 0.9, cx + knotR, bowY);
  ctx.closePath();
  ctx.fillStyle = "#DC143C";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Center knot
  ctx.beginPath();
  ctx.arc(cx, bowY, knotR, 0, Math.PI * 2);
  ctx.fillStyle = "#B01030";
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ══════════════════════════════════════════
  // MOOD OVERLAYS
  // ══════════════════════════════════════════

  // Sleepy: floating Zzz
  if (mood === "sleepy" && !isPetting) {
    const zPhase = (tailPhase * 0.5) % (Math.PI * 2);
    ctx.font = `bold ${headR * 0.15}px sans-serif`;
    ctx.fillStyle = "rgba(200,200,200,0.3)";
    ctx.fillText("z", cx + headR * 0.62, headY - headR * 0.55 + Math.sin(zPhase) * 2);
    ctx.font = `bold ${headR * 0.19}px sans-serif`;
    ctx.fillStyle = "rgba(200,200,200,0.2)";
    ctx.fillText("Z", cx + headR * 0.78, headY - headR * 0.78 + Math.sin(zPhase + 1) * 2);
  }

  // Sassy: ._. above head
  if (mood === "sassy" && !isPetting) {
    ctx.font = `${headR * 0.17}px monospace`;
    ctx.fillStyle = "rgba(200,200,200,0.4)";
    ctx.textAlign = "center";
    ctx.fillText("._.", cx, headY - headR * 1.05);
  }

  ctx.restore();
}

// ── Bezier helper: evaluate cubic bezier at t ──
function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
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
