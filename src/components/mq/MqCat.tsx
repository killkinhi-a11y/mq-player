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

const SIZE_PX: Record<string, number> = {
  small: 80,
  medium: 110,
  large: 144,
};

const BLINK_INTERVAL = 3500;
const BLINK_DURATION = 180;
const WALK_SPEED_MIN = 0.3; // px per frame
const WALK_SPEED_MAX = 1.2;
const WALK_PAUSE_MIN = 3000;
const WALK_PAUSE_MAX = 8000;
const LIFT_SCALE = 1.25;
const LIFT_SHADOW = 20;
const PHRASE_DISPLAY_MS = 4000;

// ══════════════════════════════════════════════════════════════════
// SPRITE FRAME DEFINITIONS
// ══════════════════════════════════════════════════════════════════

interface FrameParams {
  eyeOpen: number;
  pupilDx: number;
  pupilDy: number;
  browAngleL: number;
  browAngleR: number;
  browRaiseL: number;
  browRaiseR: number;
  mouthCurve: number;
  mouthOpen: number;
  tongueShow: number;
  blushAlpha: number;
  sweatAlpha: number;
  sweatSize: number;
  sparkleAlpha: number;
  sparkleCount: number;
  motionAlpha: number;
  motionSide: "left" | "right" | "both";
  legRaiseR: number;
  armAngleL: number;
  armAngleR: number;
  walkCycle: number; // 0=standing, 1=full walk stride
}

const FRAMES: Record<string, FrameParams> = {
  neutral: {
    eyeOpen: 1, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  smile: {
    eyeOpen: 0, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.05, browRaiseR: -0.05,
    mouthCurve: 1, mouthOpen: 0.3, tongueShow: 0,
    blushAlpha: 0.35, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  motion: {
    eyeOpen: 1, pupilDx: -0.15, pupilDy: 0,
    browAngleL: -0.05, browAngleR: 0.05, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0.3, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 1, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  angry: {
    eyeOpen: 0.7, pupilDx: 0, pupilDy: 0.1,
    browAngleL: -0.35, browAngleR: 0.35, browRaiseL: 0.1, browRaiseR: 0.1,
    mouthCurve: -0.6, mouthOpen: 0.2, tongueShow: 0,
    blushAlpha: 0.5, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  sweat: {
    eyeOpen: 0.85, pupilDx: 0.15, pupilDy: -0.1,
    browAngleL: 0.1, browAngleR: -0.15, browRaiseL: 0.08, browRaiseR: 0,
    mouthCurve: -0.2, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0.1, sweatAlpha: 1, sweatSize: 1.3, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  sparkle: {
    eyeOpen: 0, pupilDx: 0, pupilDy: 0,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.08, browRaiseR: -0.08,
    mouthCurve: 1, mouthOpen: 0.4, tongueShow: 0,
    blushAlpha: 0.45, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 1, sparkleCount: 3,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0.15, armAngleR: -0.15,
    walkCycle: 0,
  },
  surprised: {
    eyeOpen: 1.2, pupilDx: 0, pupilDy: -0.15,
    browAngleL: 0, browAngleR: 0, browRaiseL: -0.2, browRaiseR: -0.2,
    mouthCurve: 0, mouthOpen: 1, tongueShow: 1,
    blushAlpha: 0.3, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0, motionSide: "both", legRaiseR: 0, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  leg_raise: {
    eyeOpen: 1, pupilDx: 0.1, pupilDy: 0,
    browAngleL: 0, browAngleR: -0.08, browRaiseL: 0, browRaiseR: -0.06,
    mouthCurve: 0.5, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0.6, motionSide: "right", legRaiseR: 0.45, armAngleL: 0, armAngleR: 0,
    walkCycle: 0,
  },
  walk_left: {
    eyeOpen: 0.8, pupilDx: 0.2, pupilDy: 0,
    browAngleL: 0.02, browAngleR: -0.02, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0.1, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0.3, motionSide: "right", legRaiseR: 0.5, armAngleL: 0.4, armAngleR: -0.2,
    walkCycle: 1,
  },
  walk_right: {
    eyeOpen: 0.8, pupilDx: -0.2, pupilDy: 0,
    browAngleL: -0.02, browAngleR: 0.02, browRaiseL: 0, browRaiseR: 0,
    mouthCurve: 0.1, mouthOpen: 0, tongueShow: 0,
    blushAlpha: 0, sweatAlpha: 0, sweatSize: 1, sparkleAlpha: 0, sparkleCount: 0,
    motionAlpha: 0.3, motionSide: "left", legRaiseR: 0, armAngleL: -0.2, armAngleR: 0.4,
    walkCycle: 1,
  },
};

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
    "legRaiseR", "armAngleL", "armAngleR", "walkCycle",
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
// CANVAS DRAWING
// ══════════════════════════════════════════════════════════════════

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  size: number,
  p: FrameParams,
  phase: number,
  accentColor: string,
  isPlaying: boolean,
  walkPhase: number, // 0..1 walk cycle for leg/arm animation
  isLifted: boolean,
) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2 + s * 0.02;

  ctx.clearRect(0, 0, s, s);
  ctx.save();

  const acR = parseInt(accentColor.slice(1, 3), 16);
  const acG = parseInt(accentColor.slice(3, 5), 16);
  const acB = parseInt(accentColor.slice(5, 7), 16);

  // Micro-bounce at 60fps (reduced when lifted)
  const bounceScale = isLifted ? 0.3 : 1;
  const microBounce = Math.sin(phase * 3.2) * s * 0.006 * bounceScale;
  const microArmL = Math.sin(phase * 2.5) * 0.04;
  const microArmR = Math.sin(phase * 2.5 + 1.3) * 0.04;
  const microLeg = Math.sin(phase * 4.0) * 1.2;

  // Walk cycle overrides
  const isWalking = (p.walkCycle || 0) > 0.1;
  const walkStride = isWalking ? Math.sin(phase * 6) * 0.35 : 0;
  const walkBounce = isWalking ? Math.abs(Math.sin(phase * 6)) * s * 0.012 : 0;

  ctx.translate(0, microBounce - walkBounce);

  // ── Proportions ──
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
  // GROUND SHADOW (bigger when lifted)
  // ═══════════════════════════════
  const shadowScale = isLifted ? 1.4 : 1;
  const shadowAlpha = isLifted ? 0.04 : 0.08;
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + bh + s * 0.14, bw * 0.72 * shadowScale, s * 0.018 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
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
  const laAngle = -0.1 + (p.armAngleL || 0) + microArmL + walkStride;
  ctx.save();
  ctx.translate(cx - bw * 0.92, armOriginY);
  ctx.rotate(laAngle);
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
  ctx.beginPath();
  ctx.arc(-armLen, 0, armThick * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = OL;
  ctx.lineWidth = outlineW;
  ctx.stroke();
  ctx.restore();

  // Right arm
  const raAngle = 0.1 - (p.armAngleR || 0) - microArmR - walkStride;
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
  const leftLegX = cx - bw * 0.22 + microLeg + (isWalking ? walkStride * 4 : 0);
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

  // Right leg
  const rLegRaise = p.legRaiseR || 0;
  const rightLegX = cx + bw * 0.22 - microLeg - (isWalking ? walkStride * 4 : 0);
  ctx.save();
  ctx.translate(rightLegX, legOriginY);
  ctx.rotate(-rLegRaise - (isWalking ? walkStride * 0.3 : 0));
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

  // Shirt details
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, bw - outlineW, bh - outlineW, 0, 0, Math.PI * 2);
  ctx.clip();
  const shirtTop = bodyY + bh * 0.1;
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - bw, shirtTop, bw * 2, bh * 2);
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

  // Collar
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

  // Tie
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

  // "USA" text
  ctx.font = `bold ${Math.max(7, s * 0.065)}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("USA", cx - bw * 0.25, bodyY + bh * 0.45);

  // ═══════════════════════════════
  // HAIR — golden comb-over
  // ═══════════════════════════════
  const hairBaseY = bodyY - bh * 0.88;

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

  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.28, hairBaseY + bh * 0.22);
  ctx.quadraticCurveTo(cx - bw * 0.15, hairBaseY - bh * 0.1, cx + bw * 0.02, hairBaseY + bh * 0.02);
  ctx.strokeStyle = HAIR_LIGHT;
  ctx.lineWidth = Math.max(1.5, s * 0.018);
  ctx.lineCap = "round";
  ctx.stroke();

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
  // HEADPHONES (when music is playing)
  // ═══════════════════════════════
  if (isPlaying) {
    const hpColor = "#333333";
    const hpAccent = accentColor;
    const hpPadColor = "#555555";
    const headY = bodyY - bh * 0.55;
    const headW = bw * 0.75;
    const hpBandH = s * 0.035;
    const hpPadW = bw * 0.12;
    const hpPadH = bh * 0.28;

    // Headband arc
    ctx.beginPath();
    ctx.ellipse(cx, headY - bh * 0.18, headW, bh * 0.35, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = hpColor;
    ctx.lineWidth = hpBandH;
    ctx.lineCap = "round";
    ctx.stroke();

    // Headband highlight
    ctx.beginPath();
    ctx.ellipse(cx, headY - bh * 0.18, headW * 0.95, bh * 0.32, 0, Math.PI * 1.15, Math.PI * 1.45);
    ctx.strokeStyle = hpAccent;
    ctx.lineWidth = hpBandH * 0.35;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Left ear pad
    const lpadX = cx - headW - hpPadW * 0.2;
    const lpadY = headY + bh * 0.02;
    ctx.beginPath();
    ctx.roundRect(lpadX - hpPadW / 2, lpadY - hpPadH / 2, hpPadW, hpPadH, hpPadW * 0.25);
    ctx.fillStyle = hpColor;
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW * 0.6;
    ctx.stroke();
    // Pad cushion
    ctx.beginPath();
    ctx.roundRect(lpadX - hpPadW * 0.3, lpadY - hpPadH * 0.4, hpPadW * 0.6, hpPadH * 0.8, hpPadW * 0.2);
    ctx.fillStyle = hpPadColor;
    ctx.fill();
    // Accent ring
    ctx.beginPath();
    ctx.roundRect(lpadX - hpPadW * 0.35, lpadY - hpPadH * 0.45, hpPadW * 0.7, hpPadH * 0.9, hpPadW * 0.25);
    ctx.strokeStyle = hpAccent;
    ctx.lineWidth = Math.max(0.8, s * 0.006);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Right ear pad
    const rpadX = cx + headW + hpPadW * 0.2;
    ctx.beginPath();
    ctx.roundRect(rpadX - hpPadW / 2, lpadY - hpPadH / 2, hpPadW, hpPadH, hpPadW * 0.25);
    ctx.fillStyle = hpColor;
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW * 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(rpadX - hpPadW * 0.3, lpadY - hpPadH * 0.4, hpPadW * 0.6, hpPadH * 0.8, hpPadW * 0.2);
    ctx.fillStyle = hpPadColor;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rpadX - hpPadW * 0.35, lpadY - hpPadH * 0.45, hpPadW * 0.7, hpPadH * 0.9, hpPadW * 0.25);
    ctx.strokeStyle = hpAccent;
    ctx.lineWidth = Math.max(0.8, s * 0.006);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ═══════════════════════════════
  // FACE
  // ═══════════════════════════════
  const faceY = bodyY - bh * 0.18;
  const eyeSpacing = bw * 0.26;
  const eyeW = bw * 0.11;
  const eyeH = bw * 0.15;

  // Eyebrows
  const browLen = eyeW * 1.3;
  const browThick = Math.max(2, s * 0.018);

  ctx.save();
  ctx.translate(cx - eyeSpacing, faceY - eyeH * 0.7 - (p.browRaiseL || 0) * eyeH);
  ctx.rotate(p.browAngleL || 0);
  ctx.beginPath();
  ctx.roundRect(-browLen * 0.5, -browThick * 0.5, browLen, browThick, browThick * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx + eyeSpacing, faceY - eyeH * 0.7 - (p.browRaiseR || 0) * eyeH);
  ctx.rotate(p.browAngleR || 0);
  ctx.beginPath();
  ctx.roundRect(-browLen * 0.5, -browThick * 0.5, browLen, browThick, browThick * 0.3);
  ctx.fillStyle = OL;
  ctx.fill();
  ctx.restore();

  // Eyes
  const drawEye = (ex: number, ey: number) => {
    const openness = Math.max(0, Math.min(1.2, p.eyeOpen));

    if (openness < 0.15) {
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
    const clipH = eyeH * openness;
    ctx.beginPath();
    ctx.rect(ex - eyeW * 1.5, ey - clipH * 0.4, eyeW * 3, clipH * 1.4);
    ctx.clip();

    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();

    const pupilR = eyeW * 0.52;
    const px = ex + (p.pupilDx || 0) * eyeW * 0.5;
    const py = ey + (p.pupilDy || 0) * eyeH * 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py, pupilR * 0.85, pupilR, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    const hlR = pupilR * 0.35;
    ctx.beginPath();
    ctx.arc(px + pupilR * 0.35, py - pupilR * 0.4, hlR, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - pupilR * 0.25, py + pupilR * 0.35, hlR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();

    ctx.restore();
  };

  drawEye(cx - eyeSpacing, faceY);
  drawEye(cx + eyeSpacing, faceY);

  // Mouth
  const mouthY = faceY + eyeH * 1.5;
  const mouthW = eyeW * 0.9;

  if ((p.mouthOpen || 0) > 0.15) {
    const openH = eyeH * 0.35 * (p.mouthOpen || 0);
    const curve = (p.mouthCurve || 0);
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + openH * 0.2, mouthW * (0.8 + curve * 0.3), openH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3D2020";
    ctx.fill();
    ctx.strokeStyle = OL;
    ctx.lineWidth = outlineW;
    ctx.stroke();

    if ((p.tongueShow || 0) > 0.1) {
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + openH * 0.5, mouthW * 0.4 * (p.tongueShow || 0), openH * 0.4, 0, 0, Math.PI);
      ctx.fillStyle = "#E85D5D";
      ctx.fill();
    }
  } else {
    const curve = p.mouthCurve || 0;
    ctx.beginPath();
    ctx.moveTo(cx - mouthW * 0.7, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + curve * eyeH * 0.4, cx + mouthW * 0.7, mouthY);
    ctx.strokeStyle = OL;
    ctx.lineWidth = Math.max(1.2, outlineW * 0.8);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Cheek blush
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

  // Sweat drop
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
    ctx.beginPath();
    ctx.arc(swX - swW * 0.2, swY - swH * 0.15, swW * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Sparkle stars
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

  // Motion lines
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

  // Accent glow
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
// ANIMATION ENGINE
// ══════════════════════════════════════════════════════════════════

function useFrameSequencer(
  mood: string,
  isPetting: boolean,
  isBlinking: boolean,
  isWalking: boolean,
  walkDirection: number, // -1 left, 0 none, 1 right
) {
  const stateRef = useRef({
    sequence: MOOD_SEQUENCES.friendly,
    stepIndex: 0,
    stepElapsed: 0,
    currentParams: { ...FRAMES.neutral },
    targetParams: { ...FRAMES.neutral },
    transitionProgress: 1,
    prevFrameKey: "neutral" as string,
    prevMood: "friendly" as string,
  });

  const isBlinkingRef = useRef(isBlinking);
  isBlinkingRef.current = isBlinking;
  const isWalkingRef = useRef(isWalking);
  isWalkingRef.current = isWalking;
  const walkDirRef = useRef(walkDirection);
  walkDirRef.current = walkDirection;

  useEffect(() => {
    const st = stateRef.current;
    if (isPetting) {
      st.sequence = PET_SEQUENCE;
      st.stepIndex = 0;
      st.stepElapsed = 0;
    } else if (st.prevMood !== mood) {
      // Mood changed — blend to new sequence
      st.prevMood = mood;
      st.sequence = MOOD_SEQUENCES[mood] || MOOD_SEQUENCES.friendly;
      // Don't reset stepIndex — let it wrap naturally for smooth transition
    }
  }, [mood, isPetting]);

  const update = useCallback((dt: number): FrameParams => {
    const st = stateRef.current;

    // If walking, override with walk frame
    if (isWalkingRef.current) {
      const walkFrame = walkDirRef.current >= 0 ? FRAMES.walk_right : FRAMES.walk_left;
      // Blend walk frame with current mood frame
      const [frameKey] = st.sequence[st.stepIndex];
      const moodFrame = FRAMES[frameKey] || FRAMES.neutral;
      return { ...moodFrame, walkCycle: 1, eyeOpen: moodFrame.eyeOpen, mouthCurve: moodFrame.mouthCurve };
    }

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
    if (isBlinkingRef.current) {
      st.currentParams = { ...st.currentParams, eyeOpen: 0 };
    }

    return st.currentParams;
  }, []);

  return update;
}

// ── Canvas Component ──
function CanvasMascot({
  size,
  mood,
  isPetting,
  isBlinking,
  isPlaying,
  isLifted,
  isWalking,
  walkDirection,
}: {
  size: number;
  mood: string;
  isPetting: boolean;
  isBlinking: boolean;
  isPlaying: boolean;
  isLifted: boolean;
  isWalking: boolean;
  walkDirection: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const updateFrame = useFrameSequencer(mood, isPetting, isBlinking, isWalking, walkDirection);

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

      drawCharacter(ctx, size, params, phaseRef.current, "#e03131", isPlaying, 0, isLifted);
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animRef.current);
  }, [size, updateFrame, isPlaying, isLifted]);

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
  const catMood = useAppStore((s) => s.catMood);
  const catSize = useAppStore((s) => s.catSize);
  const petCat = useAppStore((s) => s.petCat);
  const isPlaying = useAppStore((s) => s.isPlaying);

  const [phrase, setPhrase] = useState("");
  const [showPetEffect, setShowPetEffect] = useState(false);
  const [isPetting, setIsPetting] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // Walking state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isWalking, setIsWalking] = useState(false);
  const [walkDirection, setWalkDirection] = useState(1); // 1=right, -1=left
  const [isLifted, setIsLifted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const petTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state
  const isDragging = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const posRef = useRef({ x: 0, y: 0 });

  const size = SIZE_PX[catSize] ?? 100;

  // Initialize position to bottom-right
  useEffect(() => {
    if (!catEnabled) return;
    const margin = 16;
    const initX = window.innerWidth - size - margin;
    const initY = window.innerHeight - size - 140 - margin; // above player bar
    setPos({ x: initX, y: initY });
    posRef.current = { x: initX, y: initY };
  }, [catEnabled, size]);

  // ── Walking logic ──
  useEffect(() => {
    if (!catEnabled || isLifted) return;

    const startWalk = () => {
      if (isDragging.current) {
        scheduleNextWalk();
        return;
      }

      // Pick a random target position
      const margin = 20;
      const targetX = margin + Math.random() * (window.innerWidth - size - margin * 2);
      const targetY = margin + Math.random() * (window.innerHeight - size - 180 - margin);

      const dx = targetX - posRef.current.x;
      const dy = targetY - posRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        scheduleNextWalk();
        return;
      }

      setWalkDirection(dx > 0 ? 1 : -1);
      setIsWalking(true);

      const speed = WALK_SPEED_MIN + Math.random() * (WALK_SPEED_MAX - WALK_SPEED_MIN);
      const duration = (dist / speed) * 16; // approximate frames
      const steps = Math.ceil(duration / 16);
      const stepX = dx / steps;
      const stepY = dy / steps;

      let step = 0;
      const walkInterval = setInterval(() => {
        if (isDragging.current) {
          clearInterval(walkInterval);
          setIsWalking(false);
          scheduleNextWalk();
          return;
        }
        step++;
        const newX = posRef.current.x + stepX;
        const newY = posRef.current.y + stepY;
        posRef.current = { x: newX, y: newY };
        setPos({ x: newX, y: newY });

        if (step >= steps) {
          clearInterval(walkInterval);
          setIsWalking(false);
          // Show a random phrase sometimes
          if (Math.random() < 0.3) {
            const list = PHRASES[useAppStore.getState().catMood] ?? PHRASES.friendly;
            const newPhrase = list[Math.floor(Math.random() * list.length)];
            setPhrase(newPhrase);
            if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
            phraseTimerRef.current = setTimeout(() => setPhrase(""), PHRASE_DISPLAY_MS);
          }
          scheduleNextWalk();
        }
      }, 16);
    };

    const scheduleNextWalk = () => {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      const delay = WALK_PAUSE_MIN + Math.random() * (WALK_PAUSE_MAX - WALK_PAUSE_MIN);
      walkTimerRef.current = setTimeout(startWalk, delay);
    };

    // Start first walk after a short delay
    walkTimerRef.current = setTimeout(startWalk, 2000 + Math.random() * 3000);

    return () => {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, [catEnabled, isLifted, size]);

  // ── Blink loop ──
  useEffect(() => {
    if (!catEnabled) return;
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
  }, [catEnabled]);

  const handlePet = useCallback(() => {
    petCat();
    setShowPetEffect(true);
    setIsPetting(true);
    const resp = PET_RESPONSES[Math.floor(Math.random() * PET_RESPONSES.length)];
    setPhrase(resp);
    if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
    if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    petTimeoutRef.current = setTimeout(() => setIsPetting(false), 2200);
    phraseTimerRef.current = setTimeout(() => setPhrase(""), PHRASE_DISPLAY_MS);
  }, [petCat]);

  const handlePetEffectDone = useCallback(() => setShowPetEffect(false), []);

  // ── Drag handlers ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // left click only
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDragging.current = true;
    setIsLifted(true);
    setIsWalking(false);

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: posRef.current.x,
      posY: posRef.current.y,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const margin = 10;
    const newX = Math.max(margin, Math.min(window.innerWidth - size - margin, dragStartRef.current.posX + dx));
    const newY = Math.max(margin, Math.min(window.innerHeight - size - margin, dragStartRef.current.posY + dy));

    posRef.current = { x: newX, y: newY };
    setPos({ x: newX, y: newY });
  }, [size]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    const totalMove = Math.sqrt(dx * dx + dy * dy);

    // If barely moved — it was a click/pet
    if (totalMove < 5) {
      handlePet();
    }

    isDragging.current = false;
    setIsLifted(false);
  }, [handlePet]);

  if (!catEnabled) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        key="mq-cat"
        className="fixed z-[40] mq-no-transition select-none touch-none"
        style={{
          left: pos.x,
          top: pos.y,
          width: size,
          height: size,
          cursor: isLifted ? "grabbing" : "grab",
        }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{
          opacity: 1,
          scale: isLifted ? LIFT_SCALE : 1,
        }}
        transition={{
          opacity: { duration: 0.3 },
          scale: { type: "spring", stiffness: 400, damping: 25 },
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Lift shadow effect */}
        {isLifted && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: `0 ${LIFT_SHADOW}px ${LIFT_SHADOW * 2}px rgba(0,0,0,0.2)`,
              borderRadius: "50%",
              transform: `translateY(${LIFT_SHADOW * 0.5}px)`,
            }}
          />
        )}

        <CanvasMascot
          size={size}
          mood={catMood}
          isPetting={isPetting}
          isBlinking={isBlinking}
          isPlaying={isPlaying}
          isLifted={isLifted}
          isWalking={isWalking}
          walkDirection={walkDirection}
        />

        {/* Pet effect */}
        {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}

        {/* Phrase bubble */}
        <AnimatePresence>
          {phrase && (
            <motion.div
              key={phrase}
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none mq-no-transition"
              style={{
                bottom: "calc(100% + 8px)",
                whiteSpace: "nowrap",
              }}
            >
              <div
                className="px-3 py-1.5 rounded-2xl text-xs font-medium"
                style={{
                  backgroundColor: "rgba(30,30,30,0.92)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {phrase}
                {/* Bubble tail */}
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: "100%",
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "6px solid rgba(30,30,30,0.92)",
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
