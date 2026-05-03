"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

// ── Image URLs with cache-buster ──
const CAT_NORMAL = `/mq-cat.png?v=4`;
const CAT_BLINK = `/mq-cat-blink.png?v=4`;
const CAT_SMILE = `/mq-cat-smile.png?v=4`;

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

// ── Animated Tail (CSS waggling SVG tail) — stays with the body ──
function CatTail({ mood, isPetting }: { mood: string; isPetting: boolean }) {
  const tailSpeed = isPetting
    ? "0.25s"
    : mood === "excited"
      ? "0.45s"
      : mood === "sassy"
        ? "1.4s"
        : mood === "sleepy"
          ? "2s"
          : "0.8s";
  const tailDir = mood === "sassy" ? "normal" : "alternate";

  return (
    <div
      className="absolute pointer-events-none mq-no-transition"
      style={{
        bottom: "10%",
        right: "2%",
        width: "32%",
        height: "28%",
        transformOrigin: "0% 100%",
        animation: `mq-cat-wag ${tailSpeed} ease-in-out infinite ${tailDir}`,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.25))",
      }}
    >
      <svg viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Tail curve */}
        <path
          d="M 10 110 C 10 60, 50 20, 80 10 C 90 6, 95 12, 88 20 C 78 32, 40 65, 15 100 Z"
          fill="currentColor"
          className="mq-no-transition"
          style={{ color: "#e8a44a" }}
        />
        {/* Tail tip darker stripe */}
        <path
          d="M 80 10 C 90 6, 95 12, 88 20 C 82 28, 70 40, 62 50 C 68 38, 76 24, 80 10 Z"
          fill="currentColor"
          className="mq-no-transition"
          style={{ color: "#d4893a" }}
        />
      </svg>
    </div>
  );
}

// ── Main Component ──
export default function MqCat() {
  const catEnabled = useAppStore((s) => s.catEnabled);
  const catFrequency = useAppStore((s) => s.catFrequency);
  const catMood = useAppStore((s) => s.catMood);
  const catSize = useAppStore((s) => s.catSize);
  const catPetCount = useAppStore((s) => s.catPetCount);
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

    // Randomize first blink
    const initialDelay = BLINK_INTERVAL + Math.random() * 2000;
    const first = setTimeout(() => {
      doBlink();
      blinkTimerRef.current = setInterval(() => {
        // Double blink sometimes
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
    setIsSmiling(true); // Smile when petted

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

  // Mood animation config — gentle, subtle, no extreme rotations
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

  // Determine which image to show
  const currentImage = isBlinking ? CAT_BLINK : isSmiling ? CAT_SMILE : CAT_NORMAL;

  // Very subtle mood tint — no aggressive brightness/saturation changes
  const moodFilter = useMemo(() => {
    switch (catMood) {
      case "sleepy": return "brightness(0.88)";
      case "excited": return "brightness(1.05)";
      case "sassy": return "brightness(0.96)";
      default: return "none";
    }
  }, [catMood]);

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
          {/* Sleepy Zzz */}
          {catMood === "sleepy" && !isPetting && (
            <div className="absolute -top-6 right-2 pointer-events-none mq-no-transition">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute mq-no-transition text-xs font-bold"
                  style={{ color: "var(--mq-text-muted)", left: `${i * 12}px` }}
                  animate={{ y: [0, -18, -10], opacity: [0, 0.6, 0], scale: [0.6, 1, 0.8] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: i * 0.8 }}
                >z</motion.span>
              ))}
            </div>
          )}

          {/* Excited sparkles */}
          {catMood === "excited" && !isPetting && (
            <>
              <div className="absolute -top-4 -left-2 pointer-events-none mq-no-transition">
                <motion.span
                  className="text-sm mq-no-transition"
                  style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -14, -6], opacity: [0.4, 0.9, 0.2], rotate: [0, 15, -10] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >✦</motion.span>
              </div>
              <div className="absolute -top-1 -right-3 pointer-events-none mq-no-transition">
                <motion.span
                  className="text-xs mq-no-transition"
                  style={{ color: "var(--mq-accent)" }}
                  animate={{ y: [0, -10, -3], opacity: [0.3, 0.7, 0.1], rotate: [0, -12, 8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                >✦</motion.span>
              </div>
            </>
          )}

          {/* Sassy ._. */}
          {catMood === "sassy" && !isPetting && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 pointer-events-none mq-no-transition">
              <motion.span
                className="text-[10px] mq-no-transition"
                animate={{ opacity: [0, 0.5, 0], y: [2, -4, -8] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeOut", delay: 2 }}
              >._.</motion.span>
            </div>
          )}

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

          {/* Cat body */}
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
              {/* Cat image — crossfades between normal/blink/smile */}
              <div className="w-full h-full relative mq-no-transition">
                <img
                  src={CAT_NORMAL}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain mq-no-transition"
                  style={{
                    filter: moodFilter,
                    transition: "filter 0.8s ease, opacity 0.05s ease-in",
                    opacity: currentImage === CAT_NORMAL ? 1 : 0,
                  }}
                  draggable={false}
                />
                <img
                  src={CAT_BLINK}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain mq-no-transition"
                  style={{
                    filter: moodFilter,
                    transition: "filter 0.8s ease, opacity 0.05s ease-in",
                    opacity: currentImage === CAT_BLINK ? 1 : 0,
                  }}
                  draggable={false}
                />
                <img
                  src={CAT_SMILE}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain mq-no-transition"
                  style={{
                    filter: isPetting ? "brightness(1.08)" : moodFilter,
                    transition: "filter 0.8s ease, opacity 0.15s ease-out",
                    opacity: currentImage === CAT_SMILE ? 1 : 0,
                  }}
                  draggable={false}
                />
              </div>

              {/* Tail INSIDE the floating wrapper so it moves with the body */}
              <CatTail mood={catMood} isPetting={isPetting} />

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

            {/* Tail is now inside the floating wrapper above */}

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
