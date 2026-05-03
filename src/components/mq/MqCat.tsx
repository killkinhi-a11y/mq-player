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
  small: 64,
  medium: 96,
  large: 128,
};

const AUTO_DISMISS_MS = [8_000, 12_000];

// ── Pet Effect (floating hearts / paws) ──
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

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const petTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const size = SIZE_PX[catSize] ?? 96;

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

    const resp = PET_RESPONSES[Math.floor(Math.random() * PET_RESPONSES.length)];
    setPhrase(resp);

    if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
    petTimeoutRef.current = setTimeout(() => {
      setIsPetting(false);
    }, 2200);
  }, [petCat]);

  const handlePetEffectDone = useCallback(() => {
    setShowPetEffect(false);
  }, []);

  // Mood-based visual tweaks
  const moodFilter = useMemo(() => {
    switch (catMood) {
      case "sleepy":
        return "brightness(0.85) saturate(0.8)";
      case "excited":
        return "brightness(1.05) saturate(1.1)";
      default:
        return "none";
    }
  }, [catMood]);

  const moodRotation = useMemo(() => {
    switch (catMood) {
      case "sassy":
        return -3;
      case "sleepy":
        return 4;
      default:
        return 0;
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
          initial={{ opacity: 0, y: 60, x: 40, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, x: 40, scale: 0.6 }}
          transition={{
            type: "spring",
            stiffness: 240,
            damping: 20,
            mass: 0.8,
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
              delay: 0.25,
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
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04) inset",
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer mq-no-transition"
                style={{
                  backgroundColor: "var(--mq-border)",
                  color: "var(--mq-text-muted)",
                  lineHeight: 1,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}
                aria-label="Закрыть"
              >
                x
              </button>

              {/* Bubble tail */}
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

          {/* Cat body (clickable) */}
          <motion.button
            onClick={handlePet}
            className="relative cursor-pointer rounded-2xl outline-none mq-no-transition overflow-hidden"
            style={{
              width: size,
              height: size,
              borderRadius: size * 0.28,
              filter: `drop-shadow(0 6px 20px rgba(0,0,0,0.35))`,
              background: "var(--mq-card)",
              padding: "4px",
            }}
            whileTap={{ scale: 0.88 }}
            aria-label="Погладить кота"
          >
            <motion.div
              className="w-full h-full relative mq-no-transition"
              animate={
                isPetting
                  ? {
                      y: [0, -4, 0, -3, 0],
                      rotate: [0, -5, 3, -2, 0],
                    }
                  : {
                      y: [0, -6, 0],
                    }
              }
              transition={
                isPetting
                  ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
                  : {
                      duration: 3.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.5, 1],
                    }
              }
            >
              {/* Cat image */}
              <img
                src="/mq-cat.png"
                alt=""
                className="w-full h-full object-cover rounded-[inherit] mq-no-transition"
                style={{
                  filter: isPetting ? "brightness(1.1) saturate(1.15)" : moodFilter,
                  transition: "filter 0.5s ease",
                }}
                draggable={false}
              />

              {/* Mood overlay for sleepy */}
              {catMood === "sleepy" && !isPetting && (
                <div
                  className="absolute inset-0 rounded-[inherit] mq-no-transition"
                  style={{
                    background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.15) 100%)",
                  }}
                />
              )}

              {/* Pet glow */}
              {isPetting && (
                <div
                  className="absolute inset-0 rounded-[inherit] mq-no-transition"
                  style={{
                    boxShadow: "inset 0 0 20px rgba(224,49,49,0.2)",
                    animation: "mq-cat-pet-glow 0.8s ease-in-out infinite alternate",
                  }}
                />
              )}
            </motion.div>

            {/* Pet effect */}
            {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
