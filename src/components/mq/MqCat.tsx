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
  small: 80,
  medium: 110,
  large: 144,
};

const AUTO_DISMISS_MS = [8_000, 12_000];
const BLINK_INTERVAL = 3500;
const BLINK_DURATION = 180;
const SMILE_HOLD_DURATION = 2500;

// ══════════════════════════════════════════════════════════════════
// SPRITE FRAME DEFINITIONS
// 8 frames from sprite sheet, each with interpolated params
// ══════════════════════════════════════════════════════════════════

interface FrameParams {
  eyeOpen: number;       // 0=closed arc, 1=full open
  pupilDx: number;       // pupil offset x
  pupilDy: number;       // pupil offset y
  browAngleL: number;    // radians, 0=neutral
  browAngleR: number;
  browRaiseL: number;    // extra y offset
  browRaiseR: number;
  mouthCurve: number;    // -1=frown, 0=flat, 1=smile
  mouthOpen: number;     // 0=closed, 1=open
  tongueShow: number;    // 0=hidden, 1=visible
  blushAlpha: number;
  sweatAlpha: number;    // sweat drop visibility
  sweatSize: number;
  sparkleAlpha: number;  // sparkle stars visibility
  sparkleCount: number;
  motionAlpha: number;   // motion lines
  motionSide: "left" | "right" | "both";
  legRaiseR: number;     // right leg raise angle (rad)
  armAngleL: number;     // arm raise angle (rad)
  armAngleR: number;
}

const FRAMES: Record<string, FrameParams> = {
  neutral: {
    eyeOpen: 1, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  smile: {
    eyeOpen: 0, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.05, browRaiseR: -0.05,
    mouthCurve: 1, mouthOpen: 0.3, tongueShow: 0,
    blushAlpha: 0.35, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  motion: {
    eyeOpen: 1, pupilDx: -0.15, pupilDy: 0,
    browAngleL: -0.05, browAngleR: 0.05, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0.3, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 1, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  angry: {
    eyeOpen: 0.7, pupilDx: 0, pupilDy: 0.1,
    browAngleL: -0.35, browAngleR: 0.35, browRaiseL: 0.1, browRaiseR: 0.1,
    mouthCurve: -0.6, mouthOpen: 0.2, tongueShow: 0,
    blushAlpha: 0.5, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  sweat: {
    eyeOpen: 0.85, pupilDx: 0.15, pupilDy: -0.1,
    browAngleL: 0.1, browAngleR: -0.15, browRaiseL: 0.08, browRaiseR: 0,
    mouthCurve: -0.2, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0.1, sweatAlpha: 1, sweatSize: 1.3, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  sparkle: {
    eyeOpen: 0, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.08, browRaiseR: -0.08,
    mouthCurve: 1, mouthOpen: 0.4, tongueShow: 0,
    blushAlpha: 0.45, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 1, sparkleCount: 3,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0.15, armAngleR: -0.15,
  },
  surprised: {
    eyeOpen: 1.2, pupilDx: 0, pupilDy: -0.15,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.2, browRaiseR: -0.2,
    mouthCurve: 0, mouthOpen: 1, tongueShow: 1,
    blushAlpha: 0.3, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
  },
  leg_raise: {
    eyeOpen: 1, pupilDx: 0.1, pupilDy: 0,
    browAngleL: 0, browAngleR: -0.08, browRaiseL: 0, browRaiseR: -0.06,
    mouthCurve: 0.5, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0.6, motionSide: "right", legRaiseR: 0.45, armAngleL: 0, armAngleR: 0,
  },
};

// ── Animation sequences per mood ──
// Each entry: [frameKey, durationMs]
type AnimStep = [string, number];
const MOOD_SEQUENCES: Record<string, AnimStep[]> = {
  friendly: [
    ["neutral", 3000], ["smile", 800], ["neutral", 2500],
    ["smile", 700], ["neutral", 3500],
  ],
  excited: [
    ["neutral", 600], ["sparkle", 1200], ["surprised", 900],
    ["sparkle", 1000], ["leg_raise", 800], ["sparkle", 1200],
    ["neutral", 1000],
  ],
  sassy: [
    ["neutral", 2500], ["sweat", 1800], ["angry", 1500],
    ["sweat", 1200], ["neutral", 3000],
  ],
  sleepy: [
    ["neutral", 5000], ["sweat", 3000], ["neutral", 6000],
  ],
};

const PET_SEQUENCE: AnimStep[] = [
  ["surprised", 400], ["sparkle", 600], ["smile", 800],
  ["sparkle", 500], ["smile", 600], ["neutral", 500],
];

// ══════════════════════════════════════════════════════════════════
// INTERPOLATION ENGINE
// ══════════════════════════════════════════════════════════════════

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpParams(a: FrameParams, b: FrameParams, t: number): FrameParams {
  const r: FrameParams = {
    ...a,
    motionSide: t < 0.5 ? a.motionSide : b.motionSide,
  };
  const numKeys: (keyof FrameParams)[] = [
    "eyeOpen", "pupilDx", "pupilDy",
    "browAngleL", "browAngleR", "browRaiseL", "browRaiseR",
    "mouthCurve", "mouthOpen", "tongueShow",
    "blushAlpha", "sweatAlpha", "sweatSize",
    "sparkleAlpha", "sparkleCount", "motionAlpha",
    "legRaiseR", "armAngleL", "armAngleR",
  ];
  for (const key of numKeys) {
    (r as any)[key] = lerp(a[key] as number, b[key] as number, t);
  }
  return r;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ══════════════════════════════════════════════════════════════════
// CANVAS DRAWING — exact character from sprite sheet
// ══════════════════════════════════════════════════════════════════

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  size: number,
  p: FrameParams,
  phase: number,
  accentColor: string,
) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2 + s * 0.02;

  ctx.clearRect(0, 0, s, s);
  ctx.save();

  const acR = parseInt(accentColor.slice(1, 3), 16);
  const acG = parseInt(accentColor.slice(3, 5), 16);
  const acB = parseInt(accentColor.slice(5, 7), 16);

  // Continuous micro-bounce at 60fps
  const microBounce = Math.sin(phase * 3.2) * s * 0.006;
  // Micro arm sway
  const microArmL = Math.sin(phase * 2.5) * 0.04;
  const microArmR = Math.sin(phase * 2.5 + 1.3) * 0.04;
  // Micro leg sway
  const microLeg = Math.sin(phase * 4.0) * 1.2;

  ctx.translate(0, microBounce);

  // ── Proportions (exact from sprite) ──
  const bw = s * 0.38;
  const bh = s * 0.30;
  const bodyY = cy;

  const OL = "#000000";
  const outlineW = Math.max(1.8, s * 0.018);
  const SKIN = "#FEF8EC";
  const SKIN_DARK = "#F5ECD5";
  const HAIR_MAIN = "#F8C400";
  const HAIR_LIGHT = "#FCCC08";
  const HAIR_DARK = "#CC9000";
  const HAIR_EDGE = "#311800";

  // ═══════════════════════════════
  // GROUND SHADOW
  // ═══════════════════════════════
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + bh + s * 0.14, bw * 0.72, s * 0.018, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fill();

  // ═══════════════════════════════
  // ARMS (behind body)
  // ═══════════════════════════════
  const armLen = bw * 0.52;
  const armThick = Math.max(3, s * 0.028);
  const armOriginY = bodyY - bh * 0.1;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Left arm
  const laAngle = -0.1 + (p.armAngleL || 0) + microArmL;
  ctx.save();
  ctx.translate(cx - bw * 0.92, armOriginY);
  ctx.rotate(laAngle);
  // Arm shape (tapered rectangle)
  ctx.beginPath();
  ctx.moveTo(0, -armThick * 0.6);
  ctx.lineTo(-armLen, -armThick * 0.3);
  ctx.arc(-armLen, 0, armThick * 0.35, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.lineTo(0, armThick * 0.6);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  // Hand
  ctx.beginPath();
  ctx.arc(-armLen, 0, armThick * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();

  // Right arm
  const raAngle = 0.1 - (p.armAngleR || 0) - microArmR;
  ctx.save();
  ctx.translate(cx + bw * 0.92, armOriginY);
  ctx.rotate(raAngle);
  ctx.beginPath();
  ctx.moveTo(0, -armThick * 0.6);
  ctx.lineTo(armLen, -armThick * 0.3);
  ctx.arc(armLen, 0, armThick * 0.35, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.lineTo(0, armThick * 0.6);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(armLen, 0, armThick * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();

  // ═══════════════════════════════
  // LEGS
  // ═══════════════════════════════
  const legLen = s * 0.12;
  const legThick = Math.max(4, s * 0.032);
  const legOriginY = bodyY + bh * 0.8;

  // Left leg
  const leftLegX = cx - bw * 0.22 + microLeg;
  ctx.beginPath();
  ctx.moveTo(leftLegX - legThick * 0.5, legOriginY);
  ctx.lineTo(leftLegX - legThick * 0.45, legOriginY + legLen);
  ctx.lineTo(leftLegX + legThick * 0.55, legOriginY + legLen);
  ctx.lineTo(leftLegX + legThick * 0.5, legOriginY);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  // Left foot
  const footW = legThick * 1.6;
  const footH = legThick * 0.9;
  ctx.beginPath();
  const lfx = leftLegX - footW * 0.4;
  const lfy = legOriginY + legLen - footH * 0.2;
  ctx.moveTo(lfx + footH * 0.4, lfy);
  ctx.lineTo(lfx + footW - footH * 0.4, lfy);
  ctx.arc(lfx + footW - footH * 0.4, lfy + footH * 0.4, footH * 0.4, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.lineTo(lfx + footH * 0.4, lfy + footH);
  ctx.arc(lfx + footH * 0.4, lfy + footH * 0.4, footH * 0.4, Math.PI * 0.5, -Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // Right leg (may be raised)
  const rLegRaise = p.legRaiseR || 0;
  const rightLegX = cx + bw * 0.22 - microLeg;
  ctx.save();
  ctx.translate(rightLegX, legOriginY);
  ctx.rotate(-rLegRaise);
  ctx.beginPath();
  ctx.moveTo(-legThick * 0.5, 0);
  ctx.lineTo(-legThick * 0.45, legLen);
  ctx.lineTo(legThick * 0.55, legLen);
  ctx.lineTo(legThick * 0.5, 0);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  // Right foot
  const rfx = -footW * 0.4;
  const rfy = legLen - footH * 0.2;
  ctx.beginPath();
  ctx.moveTo(rfx + footH * 0.4, rfy);
  ctx.lineTo(rfx + footW - footH * 0.4, rfy);
  ctx.arc(rfx + footW - footH * 0.4, rfy + footH * 0.4, footH * 0.4, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.lineTo(rfx + footH * 0.4, rfy + footH);
  ctx.arc(rfx + footH * 0.4, rfy + footH * 0.4, footH * 0.4, Math.PI * 0.5, -Math.PI * 0.5);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();

  // ═══════════════════════════════
  // BODY — egg oval
  // ═══════════════════════════════
  const bodyGrad = ctx.createRadialGradient(
    cx - bw * 0.15, bodyY - bh * 0.3, bh * 0.08,
    cx, bodyY, bw * 1.1
  );
  bodyGrad.addColorStop(0, "#FFFCF2");
  bodyGrad.addColorStop(0.45, SKIN);
  bodyGrad.addColorStop(1, SKIN_DARK);

  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bw, bh, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ═══════════════════════════════
  // SHIRT DETAILS (lower half)
  // ═══════════════════════════════
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bw - outlineW, bh - outlineW, 0, 0, Math.PI * 2);
  ctx.clip();

  const shirtTop = bodyY + bh * 0.1;
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - bw, shirtTop, bw * 2, bh * 2);

  // Subtle shirt fold
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = Math.max(0.5, s * 0.004);
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.08, shirtTop + bh * 0.05);
  ctx.lineTo(cx - bw * 0.12, shirtTop + bh * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + bw * 0.06, shirtTop + bh * 0.03);
  ctx.lineTo(cx + bw * 0.1, shirtTop + bh * 0.5);
  ctx.stroke();

  ctx.restore();

  // ── Collar (V-neck) ──
  const collarW = bw * 0.32;
  const collarY = bodyY + bh * 0.05;
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - collarW, bodyY - bh * 0.05);
  ctx.lineTo(cx - collarW * 0.15, collarY + bh * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + collarW, bodyY - bh * 0.05);
  ctx.lineTo(cx + collarW * 0.15, collarY + bh * 0.12);
  ctx.stroke();

  // ── Tie ──
  const tieW = bw * 0.09;
  const tieH = bh * 0.42;
  const tieTop = bodyY - bh * 0.02;
  ctx.beginPath();
  ctx.moveTo(cx - tieW, tieTop);
  ctx.lineTo(cx + tieW, tieTop);
  ctx.lineTo(cx + tieW * 0.65, tieTop + tieH);
  ctx.lineTo(cx, tieTop + tieH + bh * 0.08);
  ctx.lineTo(cx - tieW * 0.65, tieTop + tieH);
  ctx.closePath();
  ctx.fillStyle = "#000000";
  ctx.fill();

  // ── "USA" text ──
  ctx.font = `bold ${Math.max(7, s * 0.065)}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("USA", cx - bw * 0.25, bodyY + bh * 0.45);

  // ═══════════════════════════════
  // HAIR — golden comb-over
  // ═══════════════════════════════
  const hairBaseY = bodyY - bh * 0.88;

  // Hair dark edge (shadow layer)
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.42, hairBaseY + bh * 0.38);
  ctx.bezierCurveTo(
    cx - bw * 0.65, hairBaseY - bh * 0.15,
    cx - bw * 0.3, hairBaseY - bh * 0.35,
    cx + bw * 0.1, hairBaseY - bh * 0.2
  );
  ctx.bezierCurveTo(
    cx + bw * 0.45, hairBaseY - bh * 0.05,
    cx + bw * 0.55, hairBaseY + bh * 0.2,
    cx + bw * 0.48, hairBaseY + bh * 0.38
  );
  ctx.quadraticCurveTo(cx + bw * 0.15, hairBaseY + bh * 0.55, cx - bw * 0.42, hairBaseY + bh * 0.38);
  ctx.closePath();
  ctx.fillStyle = HAIR_EDGE;
  ctx.fill();

  // Hair main body
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.38, hairBaseY + bh * 0.34);
  ctx.bezierCurveTo(
    cx - bw * 0.58, hairBaseY - bh * 0.1,
    cx - bw * 0.25, hairBaseY - bh * 0.32,
    cx + bw * 0.08, hairBaseY - bh * 0.17
  );
  ctx.bezierCurveTo(
    cx + bw * 0.4, hairBaseY - bh * 0.02,
    cx + bw * 0.5, hairBaseY + bh * 0.18,
    cx + bw * 0.43, hairBaseY + bh * 0.34
  );
  ctx.quadraticCurveTo(cx + bw * 0.12, hairBaseY + bh * 0.5, cx - bw * 0.38, hairBaseY + bh * 0.34);
  ctx.closePath();
  ctx.fillStyle = HAIR_DARK;
  ctx.fill();

  // Hair bright fill
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.34, hairBaseY + bh * 0.30);
  ctx.bezierCurveTo(
    cx - bw * 0.52, hairBaseY - bh * 0.07,
    cx - bw * 0.2, hairBaseY - bh * 0.28,
    cx + bw * 0.06, hairBaseY - bh * 0.14
  );
  ctx.bezierCurveTo(
    cx + bw * 0.36, hairBaseY,
    cx + bw * 0.46, hairBaseY + bh * 0.16,
    cx + bw * 0.39, hairBaseY + bh * 0.30
  );
  ctx.quadraticCurveTo(cx + bw * 0.08, hairBaseY + bh * 0.46, cx - bw * 0.34, hairBaseY + bh * 0.30);
  ctx.closePath();
  ctx.fillStyle = HAIR_MAIN;
  ctx.fill();

  // Hair highlight streak
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.28, hairBaseY + bh * 0.22);
  ctx.quadraticCurveTo(cx - bw * 0.15, hairBaseY - bh * 0.1, cx + bw * 0.02, hairBaseY + bh * 0.02);
  ctx.strokeStyle = HAIR_LIGHT;
  ctx.lineWidth = Math.max(1.5, s * 0.018);
  ctx.lineCap = "round";
  ctx.stroke();

  // Hair outline
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.38, hairBaseY + bh * 0.34);
  ctx.bezierCurveTo(
    cx - bw * 0.58, hairBaseY - bh * 0.1,
    cx - bw * 0.25, hairBaseY - bh * 0.32,
    cx + bw * 0.08, hairBaseY - bh * 0.17
  );
  ctx.bezierCurveTo(
    cx + bw * 0.4, hairBaseY - bh * 0.02,
    cx + bw * 0.5, hairBaseY + bh * 0.18,
    cx + bw * 0.43, hairBaseY + bh * 0.34
  );
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();

  // ═══════════════════════════════
  // FACE
  // ═══════════════════════════════
  const faceY = bodyY - bh * 0.18;
  const eyeSpacing = bw * 0.26;
  const eyeW = bw * 0.11;
  const eyeH = bw * 0.15;

  // ── Eyebrows (solid black bars) ──
  const browLen = eyeW * 1.3;
  const browThick = Math.max(2, s * 0.018);

  // Left eyebrow
  ctx.save();
  ctx.translate(cx - eyeSpacing, faceY - eyeH * 0.7 - (p.browRaiseL || 0) * eyeH);
  ctx.rotate(p.browAngleL || 0);
  ctx.beginPath();
  ctx.roundRect(-browLen * 0.5, -browThick * 0.5, browLen, browThick, browThick * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  // Right eyebrow
  ctx.save();
  ctx.translate(cx + eyeSpacing, faceY - eyeH * 0.7 - (p.browRaiseR || 0) * eyeH);
  ctx.rotate(p.browAngleR || 0);
  ctx.beginPath();
  ctx.roundRect(-browLen * 0.5, -browThick * 0.5, browLen, browThick, browThick * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  // ── Eyes ──
  const drawEye = (ex: number, ey: number) => {
    const openness = Math.max(0, Math.min(1.2, p.eyeOpen));

    if (openness < 0.15) {
      // Closed eye — upward arc (like ^_^)
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.8, ey);
      ctx.quadraticCurveTo(ex, ey - eyeH * 0.4 * (1 - openness / 0.15), ex + eyeW * 0.8, ey);
      ctx.strokeStyle = OL;
      ctx.lineWidth = Math.max(1.5, outlineW);
      ctx.lineCap = "round";
      ctx.stroke();
      return;
    }

    ctx.save();
    // Clip for openness
    const clipH = eyeH * openness;
    ctx.beginPath();
    ctx.rect(ex - eyeW * 1.5, ey - clipH * 0.4, eyeW * 3, clipH * 1.4);
    ctx.clip();

    // White sclera
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();

    // Black pupil (solid, large — chibi style)
    const pupilR = eyeW * 0.52;
    const px = ex + (p.pupilDx || 0) * eyeW * 0.5;
    const py = ey + (p.pupilDy || 0) * eyeH * 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py, pupilR * 0.85, pupilR, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    // White highlight (upper-right)
    const hlR = pupilR * 0.35;
    ctx.beginPath();
    ctx.arc(px + pupilR * 0.35, py - pupilR * 0.4, hlR, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Second smaller highlight (lower-left)
    ctx.beginPath();
    ctx.arc(px - pupilR * 0.25, py + pupilR * 0.35, hlR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();

    ctx.restore();
  };

  drawEye(cx - eyeSpacing, faceY);
  drawEye(cx + eyeSpacing, faceY);

  // ── Mouth ──
  const mouthY = faceY + eyeH * 1.5;
  const mouthW = eyeW * 0.9;

  if ((p.mouthOpen || 0) > 0.15) {
    // Open mouth (ellipse)
    const openH = eyeH * 0.35 * (p.mouthOpen || 0);
    const curve = (p.mouthCurve || 0);
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + openH * 0.2, mouthW * (0.8 + curve * 0.3), openH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3D2020";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();

    // Tongue
    if ((p.tongueShow || 0) > 0.1) {
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + openH * 0.5, mouthW * 0.4 * (p.tongueShow || 0), openH * 0.4, 0, 0, Math.PI);
      ctx.fillStyle = "#E85D5D";
      ctx.fill();
    }
  } else {
    // Line mouth
    const curve = p.mouthCurve || 0;
    ctx.beginPath();
    ctx.moveTo(cx - mouthW * 0.7, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + curve * eyeH * 0.4, cx + mouthW * 0.7, mouthY);
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.2, outlineW * 0.8);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── Cheek blush ──
  if ((p.blushAlpha || 0) > 0.01) {
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpacing - eyeW * 0.4, faceY + eyeH * 0.7, eyeW * 0.55, eyeH * 0.28, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,130,130,${p.blushAlpha})`;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeSpacing + eyeW * 0.4, faceY + eyeH * 0.7, eyeW * 0.55, eyeH * 0.28, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,130,130,${p.blushAlpha})`;
    ctx.fill();
  }

  // ═══════════════════════════════
  // SWEAT DROP
  // ═══════════════════════════════
  if ((p.sweatAlpha || 0) > 0.01) {
    const swX = cx + bw * 0.65;
    const swY = bodyY - bh * 0.65 + Math.sin(phase * 2) * s * 0.008;
    const swScale = p.sweatSize || 1;
    const swW = bw * 0.07 * swScale;
    const swH = bw * 0.12 * swScale;

    ctx.globalAlpha = p.sweatAlpha || 0;
    ctx.beginPath();
    ctx.moveTo(swX, swY - swH);
    ctx.quadraticCurveTo(swX + swW * 1.2, swY, swX, swY + swH * 0.5);
    ctx.quadraticCurveTo(swX - swW * 1.2, swY, swX, swY - swH);
    ctx.closePath();
    ctx.fillStyle = "#B3E5FC";
    ctx.fill();
    ctx.strokeStyle = "#64B5F6";
    ctx.lineWidth = Math.max(0.5, s * 0.005);
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(swX - swW * 0.2, swY - swH * 0.15, swW * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ═══════════════════════════════
  // SPARKLE STARS
  // ═══════════════════════════════
  if ((p.sparkleAlpha || 0) > 0.01) {
    const sp = phase * 3;
    const count = p.sparkleCount || 3;
    const positions = [
      { x: cx - bw * 0.8, y: bodyY - bh * 0.55 },
      { x: cx + bw * 0.85, y: bodyY - bh * 0.5 },
      { x: cx + bw * 0.05, y: bodyY - bh * 1.0 },
      { x: cx - bw * 0.5, y: bodyY - bh * 0.9 },
      { x: cx + bw * 0.55, y: bodyY - bh * 0.85 },
    ];
    const drawStar = (sx: number, sy: number, sr: number, ph: number) => {
      const alpha = (0.5 + Math.sin(ph) * 0.4) * (p.sparkleAlpha || 0);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ph * 0.6);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a1 = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a1) * sr, Math.sin(a1) * sr);
        else ctx.lineTo(Math.cos(a1) * sr, Math.sin(a1) * sr);
        ctx.lineTo(Math.cos(a2) * sr * 0.3, Math.sin(a2) * sr * 0.3);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.fill();
      ctx.restore();
    };
    for (let i = 0; i < Math.min(count, positions.length); i++) {
      drawStar(positions[i].x, positions[i].y, s * 0.028 + i * s * 0.003, sp + i * 1.8);
    }
  }

  // ═══════════════════════════════
  // MOTION LINES
  // ═══════════════════════════════
  if ((p.motionAlpha || 0) > 0.01) {
    const mAlpha = p.motionAlpha || 0;
    ctx.strokeStyle = `rgba(0,0,0,${0.15 * mAlpha})`;
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.lineCap = "round";

    const sides = p.motionSide === "both" ? [-1, 1] : p.motionSide === "left" ? [-1] : [1];
    for (const side of sides) {
      for (let i = 0; i < 3; i++) {
        const lx = cx + side * (bw * 0.95 + i * s * 0.015);
        const ly = bodyY - bh * 0.3 + i * bh * 0.25;
        const lLen = s * 0.06 + i * s * 0.01;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + side * lLen, ly);
        ctx.stroke();
      }
    }
  }

  // ═══════════════════════════════
  // Zzz (sleepy overlay)
  // ═══════════════════════════════
  // (drawn by mood overlay system below)

  // ── Subtle accent glow ──
  const glowR = bw * 1.2;
  const glowGrad = ctx.createRadialGradient(cx, bodyY, glowR * 0.3, cx, bodyY, glowR);
  glowGrad.addColorStop(0, `rgba(${acR},${acG},${acB},0.03)`);
  glowGrad.addColorStop(1, `rgba(${acR},${acG},${acB},0)`);
  ctx.beginPath();
  ctx.arc(cx, bodyY, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  ctx.restore();
}

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
// ANIMATION ENGINE — frame sequencer at 60fps
// ══════════════════════════════════════════════════════════════════

function useFrameSequencer(
  mood: string,
  isPetting: boolean,
  isBlinking: boolean,
) {
  const stateRef = useRef({
    sequence: MOOD_SEQUENCES.friendly,
    stepIndex: 0,
    stepElapsed: 0,
    currentParams: FRAMES.neutral,
    targetParams: FRAMES.neutral,
    transitionProgress: 1,
    prevFrameKey: "neutral" as string,
  });

  useEffect(() => {
    const st = stateRef.current;
    if (isPetting) {
      st.sequence = PET_SEQUENCE;
    } else {
      st.sequence = MOOD_SEQUENCES[mood] || MOOD_SEQUENCES.friendly;
    }
    // Don't reset step — let it continue smoothly
  }, [mood, isPetting]);

  const update = useCallback((dt: number): FrameParams => {
    const st = stateRef.current;

    // Advance sequence step
    st.stepElapsed += dt * 1000;
    const [frameKey, duration] = st.sequence[st.stepIndex];
    if (st.stepElapsed >= duration) {
      st.stepElapsed -= duration;
      st.stepIndex = (st.stepIndex + 1) % st.sequence.length;
      const [nextKey] = st.sequence[st.stepIndex];
      st.prevFrameKey = frameKey;
      st.targetParams = FRAMES[nextKey] || FRAMES.neutral;
      st.transitionProgress = 0;
    }

    // Smooth transition (200ms ease)
    if (st.transitionProgress < 1) {
      st.transitionProgress = Math.min(1, st.transitionProgress + dt * 5);
      st.currentParams = lerpParams(
        FRAMES[st.prevFrameKey] || FRAMES.neutral,
        st.targetParams,
        easeInOut(st.transitionProgress)
      );
    } else {
      st.currentParams = st.targetParams;
    }

    // Blink override
    if (isBlinking) {
      st.currentParams = { ...st.currentParams, eyeOpen: 0 };
    }

    return st.currentParams;
  }, [isBlinking]);

  return update;
}

// ── Canvas Component ──
function CanvasMascot({
  size,
  mood,
  isPetting,
  isBlinking,
}: {
  size: number;
  mood: string;
  isPetting: boolean;
  isBlinking: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const updateFrame = useFrameSequencer(mood, isPetting, isBlinking);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    lastTimeRef.current = performance.now();

    const draw = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      phaseRef.current += dt;
      const params = updateFrame(dt);

      drawCharacter(ctx, size, params, phaseRef.current, "#e03131");
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animRef.current);
  }, [size, mood, isPetting, isBlinking, updateFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="mq-no-transition"
      draggable={false}
    />
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

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
        if (Math.random() < 0.25) setTimeout(doBlink, 300);
      }, BLINK_INTERVAL + Math.random() * 1500);
    }, initialDelay);
    return () => {
      clearTimeout(first);
      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
    };
  }, [isVisible]);

  // ── Smile flash (not used for frame control but kept for pet) ──
  useEffect(() => {
    if (!isVisible || catMood === "sassy" || catMood === "sleepy") return;
    const interval = setInterval(() => {
      if (Math.random() < 0.3 && !isPetting) {
        setIsSmiling(true);
        setTimeout(() => setIsSmiling(false), SMILE_HOLD_DURATION);
      }
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
    dismissTimerRef.current = setTimeout(() => setIsVisible(false), getRandomDismiss());
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
    petTimeoutRef.current = setTimeout(() => setIsPetting(false), 2200);
    smileTimerRef.current = setTimeout(() => setIsSmiling(false), 2500);
  }, [petCat]);

  const handlePetEffectDone = useCallback(() => setShowPetEffect(false), []);

  const moodFloat = useMemo(() => {
    switch (catMood) {
      case "sleepy":
        return { y: [0, -1, 0.5, 0], rotate: [0, 1, 0.5, 0] };
      case "excited":
        return { y: [0, -4, -1, -5, -0.5, -2.5, 0], rotate: [0, 1.5, -1, 1.2, -0.6, 0.8, 0] };
      case "sassy":
        return { y: [0, -2, -0.5, -3, 0], rotate: [0, -1, 0, -1.5, 0] };
      default:
        return { y: [0, -3, -1, -4, -0.5, -2.5, 0], rotate: [0, 0.5, -0.3, 0.4, -0.2, 0.4, 0] };
    }
  }, [catMood]);

  const moodDuration = catMood === "sleepy" ? 6 : catMood === "excited" ? 2 : catMood === "sassy" ? 3.5 : 4;

  // Schedule appearance
  useEffect(() => {
    if (!catEnabled) {
      setIsVisible(false);
      setIsPetting(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const initialDelay = getRandomDelay(catFrequency);
    const firstTimer = setTimeout(() => showCat(), initialDelay);
    intervalRef.current = setInterval(() => {
      if (!isVisible && Math.random() < 0.7) showCat();
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
      const timer = setTimeout(() => showCat(), delay);
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
          transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.7 }}
        >
          {/* Speech bubble */}
          <motion.div
            className="absolute mq-no-transition"
            style={{ bottom: "100%", right: 0, marginBottom: "12px", width: "max-content", maxWidth: "220px" }}
            initial={{ opacity: 0, y: 12, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.8 }}
            transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
                style={{ backgroundColor: "var(--mq-border)", color: "var(--mq-text-muted)", lineHeight: 1, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                aria-label="Закрыть"
              >x</button>
              <div className="absolute -bottom-[6px] right-5 w-3 h-3 rotate-45" style={{ backgroundColor: "var(--mq-card)", borderRight: "1px solid var(--mq-border)", borderBottom: "1px solid var(--mq-border)" }} />
              <span>{phrase}</span>
            </div>
          </motion.div>

          {/* Mascot body */}
          <motion.button
            onClick={handlePet}
            className="relative cursor-pointer outline-none mq-no-transition"
            style={{ width: size, height: size, background: "transparent", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.45))" }}
            whileTap={{ scale: 0.85 }}
            aria-label="Погладить маскота"
          >
            <motion.div
              className="w-full h-full relative mq-no-transition"
              animate={
                isPetting
                  ? { y: [0, -5, 0, -4, 0], rotate: [0, -6, 4, -3, 0], scale: [1, 1.06, 1.02, 1.08, 1] }
                  : moodFloat
              }
              transition={isPetting
                ? { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
                : { duration: moodDuration, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <CanvasMascot size={size} mood={catMood} isPetting={isPetting} isBlinking={isBlinking} />
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
                <motion.span className="text-sm mq-no-transition" style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -14, -6], opacity: [0.4, 0.8, 0.2], rotate: [0, 12, -6] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                >♪</motion.span>
              </div>
            )}
            {!isPetting && catMood === "excited" && (
              <div className="absolute -top-2 -right-2 pointer-events-none mq-no-transition">
                <motion.span className="text-xs mq-no-transition" style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -12, -4], opacity: [0.3, 0.9, 0.1], rotate: [0, -10, 8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >♫</motion.span>
              </div>
            )}

            {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
