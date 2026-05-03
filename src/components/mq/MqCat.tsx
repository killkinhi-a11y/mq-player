"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

// ── Phrases ──
const PHRASES: Record<string, string[]> = {
  friendly: [
    "Привет! Как музыка?",
    "Отличный вкус!",
    "Мяу~ 🎵",
    "Давай послушаем что-нибудь новое!",
    "Ты сегодня в отличном настроении!",
    "Как насчёт чилл-плейлиста?",
  ],
  sassy: [
    "*зевает* Опять попса?",
    "Я бы лучше спал...",
    "Это лучшее, что ты смог найти?",
    "Мяу... серьёзно?",
    "У меня лапки, а я подбираю музыку лучше",
    "*хмурится* Не то...",
  ],
  sleepy: [
    "*засыпает*... мяу...",
    "Zzz... *мурчит*...",
    "Разбуди меня для хорошего трека...",
    "*свернулся клубочком*",
    "Мурр... ещё пять минут...",
    "Сон — лучшая музыка...",
  ],
  excited: [
    "Новый трек! Новый трек!!",
    "МЯЯЯУУ!! 🎉",
    "Я ТАК РАД!!",
    "Включай скорее!!",
    "Это мой любимый!!",
    "ТАНЕЦ МЯУ!! 💃",
  ],
};

const PET_RESPONSES = [
  "Мурр~ 💕",
  "*мурчит*",
  "Ещё! Ещё! 😸",
  "Мрррр~",
  "*трётся о руку* 💕",
  "Мяяяу! 😻",
];

const MILESTONES: Record<number, string> = {
  10: "10 погладили! 🎉",
  50: "50 погладили!! Ты лучший! 💖",
  100: "100 погладили!!! ЛЕГЕНДА!! 🏆",
};

const FREQUENCY_MS: Record<string, [number, number]> = {
  rare: [300_000, 480_000],    // 5-8 min
  normal: [120_000, 240_000],  // 2-4 min
  often: [60_000, 120_000],    // 1-2 min
};

const SIZE_PX: Record<string, number> = {
  small: 48,
  medium: 64,
  large: 80,
};

const AUTO_DISMISS_MS = [8_000, 12_000]; // 8-12 seconds

// ── Cat SVG Component ──
function CatSVG({ size }: { size: number }) {
  const s = size;
  const scale = s / 64; // base design is 64x64

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ willChange: "transform" }}
    >
      {/* Tail */}
      <path
        className="mq-cat-tail"
        d="M 48 50 Q 60 38 56 24 Q 54 16 48 18"
        stroke="var(--mq-text-muted)"
        strokeWidth={2.5 * scale}
        strokeLinecap="round"
        fill="none"
      />

      {/* Body */}
      <ellipse
        cx="30"
        cy="44"
        rx="16"
        ry="14"
        fill="var(--mq-card)"
        stroke="var(--mq-border)"
        strokeWidth={1.2 * scale}
      />

      {/* Head */}
      <circle
        cx="28"
        cy="24"
        r="13"
        fill="var(--mq-card)"
        stroke="var(--mq-border)"
        strokeWidth={1.2 * scale}
      />

      {/* Left ear */}
      <path
        d="M 18 15 L 14 2 L 25 11 Z"
        fill="var(--mq-card)"
        stroke="var(--mq-border)"
        strokeWidth={1.2 * scale}
        strokeLinejoin="round"
      />
      {/* Left inner ear */}
      <path
        d="M 19 13 L 16.5 5 L 24 11 Z"
        fill="var(--mq-accent)"
        opacity="0.5"
      />

      {/* Right ear */}
      <path
        d="M 38 15 L 42 2 L 31 11 Z"
        fill="var(--mq-card)"
        stroke="var(--mq-border)"
        strokeWidth={1.2 * scale}
        strokeLinejoin="round"
      />
      {/* Right inner ear */}
      <path
        d="M 37 13 L 39.5 5 L 32 11 Z"
        fill="var(--mq-accent)"
        opacity="0.5"
      />

      {/* Eyes */}
      <circle cx="23" cy="22" r="1.8" fill="var(--mq-text)" />
      <circle cx="33" cy="22" r="1.8" fill="var(--mq-text)" />

      {/* Nose */}
      <path
        d="M 28 27 L 26.5 29 L 29.5 29 Z"
        fill="var(--mq-accent)"
      />

      {/* Mouth */}
      <path
        d="M 26.5 29 Q 28 31 29.5 29"
        stroke="var(--mq-text-muted)"
        strokeWidth={0.8 * scale}
        fill="none"
        strokeLinecap="round"
      />

      {/* Whiskers — left */}
      <line x1="6" y1="25" x2="18" y2="27" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />
      <line x1="7" y1="29" x2="18" y2="29" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />
      <line x1="6" y1="33" x2="18" y2="31" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />

      {/* Whiskers — right */}
      <line x1="38" y1="27" x2="50" y2="25" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />
      <line x1="38" y1="29" x2="49" y2="29" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />
      <line x1="38" y1="31" x2="50" y2="33" stroke="var(--mq-text-muted)" strokeWidth={0.6 * scale} strokeLinecap="round" />

      {/* Paws */}
      <ellipse cx="20" cy="55" rx="5" ry="3" fill="var(--mq-card)" stroke="var(--mq-border)" strokeWidth={1 * scale} />
      <ellipse cx="38" cy="55" rx="5" ry="3" fill="var(--mq-card)" stroke="var(--mq-border)" strokeWidth={1 * scale} />
    </svg>
  );
}

// ── Pet Effect (heart / paw float) ──
function PetEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1200);
    return () => clearTimeout(id);
  }, [onDone]);

  const symbols = useMemo(() => ["💕", "🐾", "✨", "💕"], []);

  return (
    <div className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none mq-no-transition">
      {symbols.map((sym, i) => (
        <span
          key={i}
          className="absolute mq-no-transition"
          style={{
            fontSize: "14px",
            left: `${(i - 1.5) * 14}px`,
            animation: `mq-cat-pet-float 1.2s ease-out ${i * 0.1}s both`,
            willChange: "transform, opacity",
          }}
        >
          {sym}
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
  const [petBounce, setPetBounce] = useState(false);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const size = SIZE_PX[catSize] ?? 64;

  // Pick a random phrase for the current mood
  const getRandomPhrase = useCallback((mood: string) => {
    const list = PHRASES[mood] ?? PHRASES.friendly;
    return list[Math.floor(Math.random() * list.length)];
  }, []);

  // Pick a random delay based on frequency
  const getRandomDelay = useCallback((freq: string) => {
    const [min, max] = FREQUENCY_MS[freq] ?? FREQUENCY_MS.normal;
    return min + Math.random() * (max - min);
  }, []);

  // Pick a random auto-dismiss time
  const getRandomDismiss = useCallback(() => {
    const [min, max] = AUTO_DISMISS_MS;
    return min + Math.random() * (max - min);
  }, []);

  // Show the cat with a new phrase
  const showCat = useCallback(() => {
    // Check milestones first
    const milestoneKey = [10, 50, 100].find(
      (m) => useAppStore.getState().catPetCount === m
    );
    const newPhrase = milestoneKey
      ? MILESTONES[milestoneKey]
      : getRandomPhrase(useAppStore.getState().catMood);

    setPhrase(newPhrase);
    setIsVisible(true);

    // Auto dismiss
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, getRandomDismiss());
  }, [getRandomPhrase, getRandomDismiss]);

  // Dismiss manually
  const dismiss = useCallback(() => {
    setIsVisible(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  // Pet the cat
  const handlePet = useCallback(() => {
    petCat();
    setShowPetEffect(true);
    setPetBounce(true);

    // Show a pet response in the bubble
    const resp = PET_RESPONSES[Math.floor(Math.random() * PET_RESPONSES.length)];
    setPhrase(resp);

    // Reset pet bounce after animation
    setTimeout(() => setPetBounce(false), 400);
  }, [petCat]);

  // Handle pet effect done
  const handlePetEffectDone = useCallback(() => {
    setShowPetEffect(false);
  }, []);

  // Schedule appearance
  useEffect(() => {
    if (!catEnabled) {
      setIsVisible(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // First appearance: after a random delay
    const initialDelay = getRandomDelay(catFrequency);
    const firstTimer = setTimeout(() => {
      showCat();
    }, initialDelay);

    // Then re-schedule after each dismiss
    intervalRef.current = setInterval(() => {
      if (!isVisible) {
        // Cat is hidden — maybe show it
        if (Math.random() < 0.7) {
          showCat();
        }
      }
    }, 30_000); // Check every 30s

    return () => {
      clearTimeout(firstTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [catEnabled, catFrequency, isVisible, showCat, getRandomDelay]);

  // Re-schedule when cat becomes hidden
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
          initial={{ opacity: 0, y: 40, x: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, x: 20, scale: 0.8 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
            mass: 0.8,
          }}
        >
          {/* Speech bubble */}
          <motion.div
            className="absolute mq-no-transition"
            style={{
              bottom: "100%",
              right: 0,
              marginBottom: "8px",
              width: "max-content",
              maxWidth: "200px",
            }}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ delay: 0.15, duration: 0.2 }}
          >
            <div
              className="relative rounded-xl px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] cursor-pointer mq-no-transition"
                style={{
                  backgroundColor: "var(--mq-border)",
                  color: "var(--mq-text-muted)",
                  lineHeight: 1,
                }}
                aria-label="Закрыть"
              >
                ×
              </button>

              {/* Bubble tail */}
              <div
                className="absolute -bottom-1.5 right-3 w-3 h-3 rotate-45"
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
          <button
            onClick={handlePet}
            className="relative cursor-pointer rounded-full outline-none mq-no-transition"
            style={{
              willChange: petBounce ? "transform" : undefined,
              animation: petBounce
                ? "mq-cat-bounce 0.4s ease"
                : "mq-cat-float 3s ease-in-out infinite",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
            }}
            aria-label="Погладить кота"
          >
            <CatSVG size={size} />

            {/* Pet effect */}
            {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
