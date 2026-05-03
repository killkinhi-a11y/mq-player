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
// Draws a cute cartoon cat on canvas with different expressions
function drawCat(
  ctx: CanvasRenderingContext2D,
  size: number,
  state: "normal" | "blink" | "smile",
  mood: string,
  isPetting: boolean,
  tailPhase: number,
  accentColor: string
) {
  const s = size; // base size
  const cx = s / 2;
  const cy = s / 2 + 4;

  ctx.clearRect(0, 0, s, s);
  ctx.save();

  // ── Body (rounded) ──
  const bodyR = s * 0.38;
  const bodyGrad = ctx.createRadialGradient(cx, cy + 2, bodyR * 0.2, cx, cy + 2, bodyR * 1.1);
  bodyGrad.addColorStop(0, "#f5c26b");
  bodyGrad.addColorStop(0.7, "#e8a44a");
  bodyGrad.addColorStop(1, "#d4893a");

  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, bodyR, bodyR * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Belly (lighter oval)
  const bellyR = bodyR * 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy + bodyR * 0.15, bellyR, bellyR * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fbe4c0";
  ctx.fill();

  // ── Ears ──
  const earW = bodyR * 0.4;
  const earH = bodyR * 0.55;
  const earInnerW = earW * 0.6;
  const earInnerH = earH * 0.7;

  // Left ear
  ctx.beginPath();
  ctx.moveTo(cx - bodyR * 0.55, cy - bodyR * 0.45);
  ctx.lineTo(cx - bodyR * 0.8, cy - bodyR * 0.45 - earH);
  ctx.lineTo(cx - bodyR * 0.15, cy - bodyR * 0.7);
  ctx.closePath();
  ctx.fillStyle = "#e8a44a";
  ctx.fill();

  // Left ear inner
  ctx.beginPath();
  ctx.moveTo(cx - bodyR * 0.52, cy - bodyR * 0.5);
  ctx.lineTo(cx - bodyR * 0.7, cy - bodyR * 0.45 - earH * 0.7);
  ctx.lineTo(cx - bodyR * 0.25, cy - bodyR * 0.65);
  ctx.closePath();
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(cx + bodyR * 0.55, cy - bodyR * 0.45);
  ctx.lineTo(cx + bodyR * 0.8, cy - bodyR * 0.45 - earH);
  ctx.lineTo(cx + bodyR * 0.15, cy - bodyR * 0.7);
  ctx.closePath();
  ctx.fillStyle = "#e8a44a";
  ctx.fill();

  // Right ear inner
  ctx.beginPath();
  ctx.moveTo(cx + bodyR * 0.52, cy - bodyR * 0.5);
  ctx.lineTo(cx + bodyR * 0.7, cy - bodyR * 0.45 - earH * 0.7);
  ctx.lineTo(cx + bodyR * 0.25, cy - bodyR * 0.65);
  ctx.closePath();
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // ── Eyes ──
  const eyeSpacing = bodyR * 0.32;
  const eyeY = cy - bodyR * 0.15;
  const eyeW = bodyR * 0.15;
  const eyeH = state === "blink" ? bodyR * 0.02 : bodyR * 0.17;

  // Eye whites
  if (state !== "blink") {
    // Left eye white
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Right eye white
    ctx.beginPath();
    ctx.ellipse(cx + eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Pupils
    const pupilR = eyeH * 0.55;
    ctx.beginPath();
    ctx.arc(cx - eyeSpacing, eyeY + pupilR * 0.1, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#2d1b0e";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + eyeSpacing, eyeY + pupilR * 0.1, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#2d1b0e";
    ctx.fill();

    // Eye shine
    const shineR = pupilR * 0.35;
    ctx.beginPath();
    ctx.arc(cx - eyeSpacing + shineR * 0.8, eyeY - shineR * 0.6, shineR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + eyeSpacing + shineR * 0.8, eyeY - shineR * 0.6, shineR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
  } else {
    // Blink — horizontal lines
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpacing - eyeW, eyeY);
    ctx.quadraticCurveTo(cx - eyeSpacing, eyeY + eyeW * 0.3, cx - eyeSpacing + eyeW, eyeY);
    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(1, bodyR * 0.04);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + eyeSpacing - eyeW, eyeY);
    ctx.quadraticCurveTo(cx + eyeSpacing, eyeY + eyeW * 0.3, cx + eyeSpacing + eyeW, eyeY);
    ctx.strokeStyle = "#2d1b0e";
    ctx.lineWidth = Math.max(1, bodyR * 0.04);
    ctx.stroke();
  }

  // ── Nose ──
  const noseY = eyeY + bodyR * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx, noseY - bodyR * 0.05);
  ctx.lineTo(cx - bodyR * 0.06, noseY + bodyR * 0.03);
  ctx.lineTo(cx + bodyR * 0.06, noseY + bodyR * 0.03);
  ctx.closePath();
  ctx.fillStyle = "#f7b8d0";
  ctx.fill();

  // ── Mouth ──
  if (state === "smile" || isPetting) {
    // Happy open mouth
    ctx.beginPath();
    ctx.ellipse(cx, noseY + bodyR * 0.1, bodyR * 0.1, bodyR * 0.07, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f7b8d0";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, noseY + bodyR * 0.1, bodyR * 0.1, bodyR * 0.07, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(1, bodyR * 0.02);
    ctx.stroke();
  } else {
    // W-shaped mouth
    const mouthY = noseY + bodyR * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - bodyR * 0.12, mouthY);
    ctx.quadraticCurveTo(cx - bodyR * 0.04, mouthY + bodyR * 0.06, cx, mouthY + bodyR * 0.02);
    ctx.quadraticCurveTo(cx + bodyR * 0.04, mouthY + bodyR * 0.06, cx + bodyR * 0.12, mouthY);
    ctx.strokeStyle = "#c47a5a";
    ctx.lineWidth = Math.max(1, bodyR * 0.025);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── Whiskers ──
  const whiskerY = noseY + bodyR * 0.08;
  ctx.strokeStyle = "rgba(80,50,30,0.3)";
  ctx.lineWidth = Math.max(0.5, bodyR * 0.015);

  // Left whiskers
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - bodyR * 0.2, whiskerY + i * bodyR * 0.06);
    ctx.lineTo(cx - bodyR * 0.6, whiskerY + i * bodyR * 0.1 - bodyR * 0.02);
    ctx.stroke();
  }
  // Right whiskers
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + bodyR * 0.2, whiskerY + i * bodyR * 0.06);
    ctx.lineTo(cx + bodyR * 0.6, whiskerY + i * bodyR * 0.1 - bodyR * 0.02);
    ctx.stroke();
  }

  // ── Cheek blush ──
  if (state === "smile" || isPetting || mood === "excited") {
    ctx.beginPath();
    ctx.ellipse(cx - bodyR * 0.45, noseY + bodyR * 0.02, bodyR * 0.1, bodyR * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,150,150,0.25)";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx + bodyR * 0.45, noseY + bodyR * 0.02, bodyR * 0.1, bodyR * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,150,150,0.25)";
    ctx.fill();
  }

  // ── Tail (animated) ──
  const tailBaseX = cx + bodyR * 0.75;
  const tailBaseY = cy + bodyR * 0.5;
  const tailSwing = Math.sin(tailPhase) * bodyR * 0.2;
  const tailTipX = tailBaseX + bodyR * 0.5 + tailSwing;
  const tailTipY = tailBaseY - bodyR * 0.6;

  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.bezierCurveTo(
    tailBaseX + bodyR * 0.2 + tailSwing * 0.3, tailBaseY - bodyR * 0.1,
    tailTipX - bodyR * 0.1, tailTipY + bodyR * 0.3,
    tailTipX, tailTipY
  );
  ctx.strokeStyle = "#e8a44a";
  ctx.lineWidth = Math.max(2, bodyR * 0.12);
  ctx.lineCap = "round";
  ctx.stroke();

  // Tail tip
  ctx.beginPath();
  ctx.arc(tailTipX, tailTipY, bodyR * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#d4893a";
  ctx.fill();

  // ── Sleepy mood: Zzz ──
  if (mood === "sleepy" && !isPetting) {
    const zPhase = (tailPhase * 0.5) % (Math.PI * 2);
    ctx.font = `bold ${bodyR * 0.22}px sans-serif`;
    ctx.fillStyle = "rgba(128,128,128,0.5)";
    ctx.fillText("z", cx + bodyR * 0.5, cy - bodyR * 0.5 + Math.sin(zPhase) * 3);
    ctx.font = `bold ${bodyR * 0.28}px sans-serif`;
    ctx.fillStyle = "rgba(128,128,128,0.4)";
    ctx.fillText("z", cx + bodyR * 0.65, cy - bodyR * 0.7 + Math.sin(zPhase + 1) * 3);
    ctx.font = `bold ${bodyR * 0.35}px sans-serif`;
    ctx.fillStyle = "rgba(128,128,128,0.3)";
    ctx.fillText("Z", cx + bodyR * 0.8, cy - bodyR * 0.95 + Math.sin(zPhase + 2) * 3);
  }

  // ── Sassy mood: ._. ──
  if (mood === "sassy" && !isPetting) {
    ctx.font = `${bodyR * 0.2}px monospace`;
    ctx.fillStyle = "rgba(128,128,128,0.5)";
    ctx.textAlign = "center";
    ctx.fillText("._.", cx, cy - bodyR * 0.85);
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
