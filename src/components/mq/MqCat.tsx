"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

// ── Phrases ──
const PHRASES: Record<string, string[]> = {
  friendly: [
    "Привет! Как музыка?",
    "Отличный вкус!",
    "Хей~",
    "Давай послушаем что-нибудь новое!",
    "Ты сегодня в отличном настроении!",
    "Как насчёт чилл-плейлиста?",
    "Музыка — это жизнь~",
  ],
  sassy: [
    "*зевает* Опять попса?",
    "Я бы лучше спал...",
    "Это лучшее, что ты смог найти?",
    "...серьёзно?",
    "У меня нет рук, а я подбираю музыку лучше",
    "*хмурится* Не то...",
    "Может, включим что-нибудь приличное?",
  ],
  sleepy: [
    "*засыпает*... хррр...",
    "Zzz...",
    "Разбуди меня для хорошего трека...",
    "*свернулся*",
    "Ещё пять минут...",
    "Сон — лучшая музыка...",
    "*сонно открывает один глаз*...",
  ],
  excited: [
    "Новый трек! Новый трек!!",
    "УРААА!!",
    "Я ТАК РАД!!",
    "Включай скорее!!",
    "Это мой любимый!!",
    "ТАНЕЦ!!",
    "Не могу усидеть на месте!!",
  ],
};

const PET_RESPONSES = [
  "Спасибо~",
  "*радуется*",
  "Ещё! Ещё!",
  "Круто!",
  "*подпрыгивает*",
  "Ура!",
  "*счастлив*",
  "Класс!",
];

const MILESTONES: Record<number, string> = {
  10: "10 раз! Обожаю!",
  50: "50 раз!! Ты лучший!",
  100: "100 раз!!! ЛЕГЕНДА!!",
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
      { sym: "\u2B50", offset: -7 },
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

// ══════════════════════════════════════════════════════════════════
// Canvas Countryball Drawing
// Cream oval body, golden comb-over hair, stick limbs,
// shirt + tie, simple face with mood expressions.
// phase drives all continuous animations (bounce, arms, sweat drop).
// ══════════════════════════════════════════════════════════════════
function drawBall(
  ctx: CanvasRenderingContext2D,
  size: number,
  state: "normal" | "blink" | "smile",
  mood: string,
  isPetting: boolean,
  phase: number,
  accentColor: string
) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2 + 4;

  ctx.clearRect(0, 0, s, s);
  ctx.save();

  const acR = parseInt(accentColor.slice(1, 3), 16);
  const acG = parseInt(accentColor.slice(3, 5), 16);
  const acB = parseInt(accentColor.slice(5, 7), 16);
  const acRGBA = (a: number) => `rgba(${acR},${acG},${acB},${a})`;

  // ── Proportions ──
  const bw = s * 0.44;      // body half-width
  const bh = s * 0.34;      // body half-height
  const bodyY = cy - s * 0.02;

  const outlineW = Math.max(1.4, s * 0.016);
  const OL = "#333333";      // outline color

  // ── Mood-driven parameters ──
  const isSleepy = mood === "sleepy" && !isPetting;
  const isSassy = mood === "sassy" && !isPetting;
  const isExcited = mood === "excited" && !isPetting;

  // Bounce amplitude per mood
  const bounceAmp = isPetting ? 3.5 : isExcited ? 5 : isSleepy ? 1 : 2.2;
  const bounceSpeed = isPetting ? 7 : isExcited ? 5 : isSleepy ? 1.2 : 3;
  const bounce = Math.sin(phase * bounceSpeed) * bounceAmp;

  // Arm wave per mood
  const armWaveAmp = isPetting ? 18 : isExcited ? 12 : isSassy ? 4 : 3;
  const armWaveSpeed = isPetting ? 6 : isExcited ? 4.5 : isSassy ? 1.5 : 2.5;
  const leftArmAngle = Math.sin(phase * armWaveSpeed) * armWaveAmp * (Math.PI / 180);
  const rightArmAngle = isPetting
    ? Math.sin(phase * armWaveSpeed + Math.PI) * armWaveAmp * (Math.PI / 180)
    : Math.sin(phase * armWaveSpeed + 1.2) * (armWaveAmp * 0.6) * (Math.PI / 180);

  // Leg wobble
  const legWobble = Math.sin(phase * 4) * 1.5 * (isPetting ? 2 : 1);

  // Sweat drop bob (always, speed varies)
  const sweatSpeed = isSassy ? 2 : 1.8;
  const sweatBob = Math.sin(phase * sweatSpeed) * 2.5;

  ctx.translate(0, bounce);

  // ═══════════════════════════════════════════
  // GROUND SHADOW
  // ═══════════════════════════════════════════
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + bh + s * 0.12, bw * 0.7, s * 0.02, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fill();

  // ═══════════════════════════════════════════
  // ARMS (behind body)
  // ═══════════════════════════════════════════
  const armLen = bw * 0.55;
  const armThick = Math.max(2.5, s * 0.022);
  const armOriginY = bodyY - bh * 0.05;

  ctx.lineCap = "round";

  // Left arm
  ctx.save();
  ctx.translate(cx - bw, armOriginY);
  ctx.rotate(-0.15 + leftArmAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-armLen, 0);
  ctx.strokeStyle = OL;
  ctx.lineWidth = armThick + outlineW;
  ctx.stroke();
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = armThick;
  ctx.stroke();
  // Left hand
  ctx.beginPath();
  ctx.arc(-armLen, 0, armThick * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  // Right arm
  ctx.save();
  ctx.translate(cx + bw, armOriginY);
  ctx.rotate(0.15 - rightArmAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(armLen, 0);
  ctx.strokeStyle = OL;
  ctx.lineWidth = armThick + outlineW;
  ctx.stroke();
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = armThick;
  ctx.stroke();
  // Right hand
  ctx.beginPath();
  ctx.arc(armLen, 0, armThick * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  // ═══════════════════════════════════════════
  // LEGS (behind body bottom)
  // ═══════════════════════════════════════════
  const legLen = s * 0.14;
  const legThick = Math.max(3, s * 0.026);
  const legOriginY = bodyY + bh * 0.85;

  // Left leg
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.32 + legWobble, legOriginY);
  ctx.lineTo(cx - bw * 0.35 + legWobble, legOriginY + legLen);
  ctx.strokeStyle = OL;
  ctx.lineWidth = legThick + outlineW;
  ctx.lineCap = "round";
  ctx.stroke();

  // Left foot
  ctx.beginPath();
  const footSize = legThick * 1.4;
  roundRect(ctx, cx - bw * 0.35 + legWobble - footSize * 0.7, legOriginY + legLen - footSize * 0.3, footSize * 1.4, footSize, footSize * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(cx + bw * 0.32 - legWobble, legOriginY);
  ctx.lineTo(cx + bw * 0.35 - legWobble, legOriginY + legLen);
  ctx.strokeStyle = OL;
  ctx.lineWidth = legThick + outlineW;
  ctx.stroke();

  // Right foot
  ctx.beginPath();
  roundRect(ctx, cx + bw * 0.35 - legWobble - footSize * 0.7, legOriginY + legLen - footSize * 0.3, footSize * 1.4, footSize, footSize * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();

  // ═══════════════════════════════════════════
  // BODY — oval, cream upper + white shirt lower
  // ═══════════════════════════════════════════
  const bodyGrad = ctx.createRadialGradient(cx - bw * 0.15, bodyY - bh * 0.25, bh * 0.1, cx, bodyY, bw * 1.1);
  bodyGrad.addColorStop(0, "#FFFDE7");
  bodyGrad.addColorStop(0.55, "#FFF8DC");
  bodyGrad.addColorStop(1, "#F0E6D2");

  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bw, bh, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ── Shirt area (lower half) ──
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bw - outlineW, bh - outlineW, 0, 0, Math.PI * 2);
  ctx.clip();

  const shirtY = bodyY + bh * 0.15;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - bw, shirtY, bw * 2, bh * 2);

  // Subtle shirt fold lines
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = Math.max(0.5, s * 0.005);
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.1, shirtY + bh * 0.05);
  ctx.lineTo(cx - bw * 0.15, shirtY + bh * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + bw * 0.08, shirtY + bh * 0.03);
  ctx.lineTo(cx + bw * 0.12, shirtY + bh * 0.5);
  ctx.stroke();

  ctx.restore();

  // ── Collar (inverted triangle) ──
  const collarTipY = bodyY + bh * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx, bodyY + bh * 0.05);
  ctx.lineTo(cx - bw * 0.28, collarTipY);
  ctx.lineTo(cx + bw * 0.28, collarTipY);
  ctx.closePath();
  ctx.fillStyle = "#F5F5F5";
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ── Tie ──
  const tieW = bw * 0.1;
  const tieH = bh * 0.35;
  const tieY = bodyY + bh * 0.08;
  ctx.beginPath();
  ctx.moveTo(cx - tieW, tieY);
  ctx.lineTo(cx + tieW, tieY);
  ctx.lineTo(cx + tieW * 0.7, tieY + tieH);
  ctx.lineTo(cx, tieY + tieH + bh * 0.06);
  ctx.lineTo(cx - tieW * 0.7, tieY + tieH);
  ctx.closePath();
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = Math.max(0.5, outlineW * 0.5);
  ctx.stroke();

  // ── "USA" text ──
  ctx.font = `bold ${Math.max(8, s * 0.075)}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("USA", cx + bw * 0.3, bodyY + bh * 0.5);

  // ═══════════════════════════════════════════
  // HAIR — golden comb-over sweep
  // ═══════════════════════════════════════════
  const hairY = bodyY - bh * 0.92;

  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.35, hairY + bh * 0.45);
  ctx.quadraticCurveTo(cx - bw * 0.55, hairY - bh * 0.1, cx - bw * 0.3, hairY - bh * 0.05);
  ctx.quadraticCurveTo(cx - bw * 0.05, hairY - bh * 0.2, cx + bw * 0.15, hairY + bh * 0.05);
  ctx.quadraticCurveTo(cx + bw * 0.35, hairY + bh * 0.25, cx + bw * 0.45, hairY + bh * 0.4);
  // Close back along head curve
  ctx.quadraticCurveTo(cx + bw * 0.5, hairY + bh * 0.55, cx + bw * 0.3, hairY + bh * 0.5);
  ctx.quadraticCurveTo(cx, hairY + bh * 0.58, cx - bw * 0.35, hairY + bh * 0.45);
  ctx.closePath();
  ctx.fillStyle = "#FFC107";
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Hair highlight
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.25, hairY + bh * 0.3);
  ctx.quadraticCurveTo(cx - bw * 0.1, hairY, cx + bw * 0.05, hairY + bh * 0.1);
  ctx.strokeStyle = "rgba(255,235,59,0.5)";
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();

  // ═══════════════════════════════════════════
  // FACE
  // ═══════════════════════════════════════════
  const faceY = bodyY - bh * 0.12;
  const eyeSpacing = bw * 0.3;
  const eyeW = bw * 0.13;
  const eyeH = bw * 0.18;

  // ── Eyebrows ──
  const browY = faceY - eyeH * 0.55;
  const browLen = eyeW * 1.1;
  ctx.strokeStyle = OL;
  ctx.lineWidth = Math.max(1.2, s * 0.014);
  ctx.lineCap = "round";

  if (isSassy && !isPetting) {
    // Left brow raised
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - browLen * 0.5, browY - eyeH * 0.2);
    ctx.lineTo(cx - eyeSpacing + browLen * 0.5, browY - eyeH * 0.35);
    ctx.stroke();
    // Right brow neutral/slightly down
    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - browLen * 0.5, browY - eyeH * 0.15);
    ctx.lineTo(cx + eyeSpacing + browLen * 0.5, browY - eyeH * 0.05);
    ctx.stroke();
  } else if (isSleepy) {
    // Droopy brows
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - browLen * 0.5, browY);
    ctx.lineTo(cx - eyeSpacing + browLen * 0.5, browY + eyeH * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - browLen * 0.5, browY);
    ctx.lineTo(cx + eyeSpacing + browLen * 0.5, browY + eyeH * 0.12);
    ctx.stroke();
  } else {
    // Normal brows
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - browLen * 0.5, browY - eyeH * 0.05);
    ctx.lineTo(cx - eyeSpacing + browLen * 0.5, browY - eyeH * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - browLen * 0.5, browY - eyeH * 0.1);
    ctx.lineTo(cx + eyeSpacing + browLen * 0.5, browY - eyeH * 0.05);
    ctx.stroke();
  }

  // ── Eyes ──
  const drawNormalEye = (ex: number, ey: number) => {
    // White sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();
    // Black pupil
    const pupilR = eyeW * 0.5;
    ctx.beginPath();
    ctx.arc(ex + eyeW * 0.08, ey + eyeH * 0.05, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
    // Tiny highlight
    ctx.beginPath();
    ctx.arc(ex + eyeW * 0.2, ey - eyeH * 0.2, pupilR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();
  };

  const drawSleepyEye = (ex: number, ey: number) => {
    // Half-lid covered eye
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex - eyeW * 1.5, ey - eyeH * 1.2, eyeW * 3, eyeH * 1.6);
    ctx.clip();
    drawNormalEye(ex, ey);
    ctx.restore();
    // Droopy lid
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.2, ey + eyeH * 0.1);
    ctx.quadraticCurveTo(ex, ey + eyeH * 0.35, ex + eyeW * 1.2, ey + eyeH * 0.05);
    ctx.strokeStyle = "#FFF8DC";
    ctx.lineWidth = Math.max(2.5, eyeH * 0.25);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();
  };

  if (state === "blink" && !isSleepy) {
    // Blink: horizontal dashes
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - eyeW * 0.7, faceY);
    ctx.lineTo(cx - eyeSpacing + eyeW * 0.7, faceY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - eyeW * 0.7, faceY);
    ctx.lineTo(cx + eyeSpacing + eyeW * 0.7, faceY);
    ctx.stroke();
  } else if (state === "smile" || isPetting) {
    // Happy closed eyes — upward arcs like ^_^
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.6, s * 0.02);
    ctx.lineCap = "round";
    const arcH = eyeH * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - eyeW * 0.8, faceY + eyeH * 0.15);
    ctx.quadraticCurveTo(cx - eyeSpacing, faceY - arcH, cx - eyeSpacing + eyeW * 0.8, faceY + eyeH * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - eyeW * 0.8, faceY + eyeH * 0.15);
    ctx.quadraticCurveTo(cx + eyeSpacing, faceY - arcH, cx + eyeSpacing + eyeW * 0.8, faceY + eyeH * 0.15);
    ctx.stroke();
  } else if (isSleepy) {
    drawSleepyEye(cx - eyeSpacing, faceY);
    drawSleepyEye(cx + eyeSpacing, faceY);
  } else {
    // Normal eyes
    drawNormalEye(cx - eyeSpacing, faceY);
    drawNormalEye(cx + eyeSpacing, faceY);
  }

  // ── Mouth ──
  const mouthY = faceY + eyeH * 1.2;

  if (state === "smile" || isPetting) {
    // Wide happy grin
    ctx.beginPath();
    ctx.arc(cx, mouthY - eyeH * 0.1, eyeW * 1.0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.3, s * 0.016);
    ctx.lineCap = "round";
    ctx.stroke();
  } else if (isSassy) {
    // Wavy/frown mouth
    ctx.beginPath();
    ctx.moveTo(cx - eyeW * 0.8, mouthY);
    ctx.quadraticCurveTo(cx - eyeW * 0.2, mouthY + eyeH * 0.15, cx, mouthY - eyeH * 0.05);
    ctx.quadraticCurveTo(cx + eyeW * 0.3, mouthY - eyeH * 0.2, cx + eyeW * 0.8, mouthY - eyeH * 0.08);
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.2, s * 0.014);
    ctx.lineCap = "round";
    ctx.stroke();
  } else if (isSleepy) {
    // Slightly open sleepy mouth (small "o")
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, eyeW * 0.3, eyeH * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(0.8, s * 0.01);
    ctx.stroke();
  } else {
    // Neutral straight line
    ctx.beginPath();
    ctx.moveTo(cx - eyeW * 0.65, mouthY);
    ctx.lineTo(cx + eyeW * 0.65, mouthY);
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.1, s * 0.014);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── Cheek blush ──
  const blushA = (state === "smile" || isPetting || isExcited) ? 0.22 : 0.08;
  ctx.beginPath();
  ctx.ellipse(cx - eyeSpacing - eyeW * 0.3, faceY + eyeH * 0.6, eyeW * 0.6, eyeH * 0.3, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + eyeSpacing + eyeW * 0.3, faceY + eyeH * 0.6, eyeW * 0.6, eyeH * 0.3, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,150,150,${blushA})`;
  ctx.fill();

  // ═══════════════════════════════════════════
  // SWEAT DROP — animated bob
  // ═══════════════════════════════════════════
  const showSweat = isSassy || (mood === "friendly" && !isPetting);
  if (showSweat) {
    const swX = cx + bw * 0.7;
    const swY = bodyY - bh * 0.7 + sweatBob;
    const swW = bw * 0.09;
    const swH = bw * 0.14;

    // Teardrop shape
    ctx.beginPath();
    ctx.moveTo(swX, swY - swH);
    ctx.quadraticCurveTo(swX + swW, swY, swX, swY + swH * 0.4);
    ctx.quadraticCurveTo(swX - swW, swY, swX, swY - swH);
    ctx.closePath();
    ctx.fillStyle = "#E0F7FA";
    ctx.fill();
    ctx.strokeStyle = "rgba(100,180,200,0.5)";
    ctx.lineWidth = Math.max(0.5, s * 0.006);
    ctx.stroke();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(swX - swW * 0.2, swY - swH * 0.2, swW * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();
  }

  // ═══════════════════════════════════════════
  // EXCITED: star sparkles
  // ═══════════════════════════════════════════
  if (isExcited) {
    const sp = phase * 2.5;
    const drawStar = (sx: number, sy: number, sr: number, ph: number) => {
      const alpha = 0.5 + Math.sin(ph) * 0.35;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ph * 0.5);
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
    drawStar(cx - bw * 0.85, bodyY - bh * 0.6, s * 0.035, sp);
    drawStar(cx + bw * 0.9, bodyY - bh * 0.5, s * 0.03, sp + 1.5);
    drawStar(cx + bw * 0.1, bodyY - bh * 1.05, s * 0.025, sp + 3);
  }

  // ═══════════════════════════════════════════
  // MOOD OVERLAYS
  // ═══════════════════════════════════════════

  // Sleepy: Zzz
  if (isSleepy) {
    const zPhase = (phase * 0.5) % (Math.PI * 2);
    ctx.font = `bold ${s * 0.07}px sans-serif`;
    ctx.fillStyle = "rgba(100,100,100,0.3)";
    ctx.textAlign = "left";
    ctx.fillText("z", cx + bw * 0.55, bodyY - bh * 0.65 + Math.sin(zPhase) * 2);
    ctx.font = `bold ${s * 0.09}px sans-serif`;
    ctx.fillStyle = "rgba(100,100,100,0.2)";
    ctx.fillText("Z", cx + bw * 0.72, bodyY - bh * 0.9 + Math.sin(zPhase + 1) * 2);
  }

  // Sassy: ._. above head
  if (isSassy) {
    ctx.font = `${s * 0.07}px monospace`;
    ctx.fillStyle = "rgba(100,100,100,0.35)";
    ctx.textAlign = "center";
    ctx.fillText("._.", cx, bodyY - bh * 1.15);
  }

  // ── Accent glow ──
  const glowR = bw * 1.3;
  const glowGrad = ctx.createRadialGradient(cx, bodyY, glowR * 0.3, cx, bodyY, glowR);
  glowGrad.addColorStop(0, acRGBA(isPetting ? 0.12 : 0.04));
  glowGrad.addColorStop(0.6, acRGBA(0.02));
  glowGrad.addColorStop(1, acRGBA(0));
  ctx.beginPath();
  ctx.arc(cx, bodyY, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  ctx.restore();
}

// ── Rounded rectangle helper ──
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// ── Canvas Ball Component ──
function CanvasBall({
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
  const phaseRef = useRef(0);

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

    const getAnimSpeed = () => {
      if (isPetting) return 6;
      switch (mood) {
        case "excited": return 4;
        case "sassy": return 1.8;
        case "sleepy": return 1;
        default: return 2.8;
      }
    };

    const draw = (timestamp: number) => {
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      phaseRef.current += getAnimSpeed() * dt;

      drawBall(ctx, size, state, mood, isPetting, phaseRef.current, "#e03131");
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

  // ── Random smile flash ──
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
        return { y: [0, -1, 0.5, 0], rotate: [0, 1, 0.5, 0] };
      case "excited":
        return { y: [0, -5, -1.5, -6, -0.5, -3, 0], rotate: [0, 2, -1.5, 1.5, -0.8, 1, 0] };
      case "sassy":
        return { y: [0, -2.5, -0.5, -3, 0], rotate: [0, -1.2, 0, -1.5, 0] };
      default:
        return { y: [0, -4, -1.5, -5, -0.5, -3, 0], rotate: [0, 0.6, -0.3, 0.4, -0.2, 0.5, 0] };
    }
  }, [catMood]);

  const moodDuration = catMood === "sleepy" ? 6 : catMood === "excited" ? 2 : catMood === "sassy" ? 3.5 : 4;

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

          {/* Ball body — canvas based */}
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
            aria-label="Погладить"
          >
            {/* Floating animation wrapper */}
            <motion.div
              className="w-full h-full relative mq-no-transition"
              animate={
                isPetting
                  ? { y: [0, -5, 0, -4, 0], rotate: [0, -6, 4, -3, 0], scale: [1, 1.06, 1.02, 1.08, 1] }
                  : moodFloat
              }
              transition={
                isPetting
                  ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: moodDuration, repeat: Infinity, ease: "easeInOut" }
              }
            >
              {/* Canvas Ball */}
              <CanvasBall
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
