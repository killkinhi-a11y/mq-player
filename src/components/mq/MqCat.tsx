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
  small: 56,
  medium: 80,
  large: 110,
};

const AUTO_DISMISS_MS = [8_000, 12_000];

// ── Animated Cat SVG ──
function CatSVG({ size, isPetting, mood }: { size: number; isPetting: boolean; mood: string }) {
  const breathOffset = 0.6; // breathing amplitude
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ willChange: "transform", overflow: "visible" }}
    >
      <defs>
        {/* Glow filter for accent elements */}
        <filter id="mq-cat-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Soft shadow */}
        <filter id="mq-cat-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.25)" />
        </filter>
      </defs>

      {/* ── Ground shadow ── */}
      <ellipse
        className="mq-cat-ground-shadow"
        cx="60"
        cy="112"
        rx="28"
        ry="5"
        fill="rgba(0,0,0,0.12)"
      />

      {/* ── TAIL ── */}
      <g className="mq-cat-tail-group">
        <path
          className="mq-cat-tail"
          d="M 82 85 Q 105 70 102 48 Q 100 35 90 40"
          stroke="var(--mq-text-muted)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Tail tip accent */}
        <circle
          className="mq-cat-tail-tip"
          cx="90"
          cy="40"
          r="3"
          fill="var(--mq-accent)"
          opacity="0.6"
        />
      </g>

      {/* ── BODY ── */}
      <g className="mq-cat-body-group">
        <ellipse
          className="mq-cat-body"
          cx="60"
          cy="82"
          rx="24"
          ry="22"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.5"
          filter="url(#mq-cat-shadow)"
        />
        {/* Belly patch */}
        <ellipse
          className="mq-cat-belly"
          cx="60"
          cy="86"
          rx="14"
          ry="12"
          fill="var(--mq-card)"
          opacity="0.5"
        />
      </g>

      {/* ── PAWS (behind body partially) ── */}
      <g className="mq-cat-paws-group">
        {/* Back left paw */}
        <ellipse
          className="mq-cat-paw mq-cat-paw-bl"
          cx="40"
          cy="100"
          rx="8"
          ry="5"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.2"
        />
        {/* Back right paw */}
        <ellipse
          className="mq-cat-paw mq-cat-paw-br"
          cx="72"
          cy="100"
          rx="8"
          ry="5"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.2"
        />
        {/* Paw pads */}
        <circle className="mq-cat-pawpad" cx="40" cy="101" r="2" fill="var(--mq-accent)" opacity="0.35" />
        <circle className="mq-cat-pawpad" cx="72" cy="101" r="2" fill="var(--mq-accent)" opacity="0.35" />
      </g>

      {/* ── HEAD ── */}
      <g className="mq-cat-head-group">
        {/* Main head */}
        <circle
          className="mq-cat-head"
          cx="60"
          cy="48"
          r="22"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.5"
          filter="url(#mq-cat-shadow)"
        />

        {/* ── EARS ── */}
        {/* Left ear outer */}
        <path
          className="mq-cat-ear mq-cat-ear-left"
          d="M 42 34 L 33 8 L 54 28 Z"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        {/* Left ear inner */}
        <path
          className="mq-cat-ear-inner mq-cat-ear-inner-left"
          d="M 44 32 L 37 13 L 52 28 Z"
          fill="var(--mq-accent)"
          opacity="0.45"
        />

        {/* Right ear outer */}
        <path
          className="mq-cat-ear mq-cat-ear-right"
          d="M 78 34 L 87 8 L 66 28 Z"
          fill="var(--mq-card)"
          stroke="var(--mq-border)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        {/* Right ear inner */}
        <path
          className="mq-cat-ear-inner mq-cat-ear-inner-right"
          d="M 76 32 L 83 13 L 68 28 Z"
          fill="var(--mq-accent)"
          opacity="0.45"
        />

        {/* ── FACE ── */}

        {/* Cheek blush */}
        <ellipse
          className="mq-cat-blush mq-cat-blush-left"
          cx="40"
          cy="53"
          rx="6"
          ry="3.5"
          fill="var(--mq-accent)"
          opacity={isPetting ? 0.35 : 0.12}
          style={{ transition: "opacity 0.6s ease" }}
        />
        <ellipse
          className="mq-cat-blush mq-cat-blush-right"
          cx="80"
          cy="53"
          rx="6"
          ry="3.5"
          fill="var(--mq-accent)"
          opacity={isPetting ? 0.35 : 0.12}
          style={{ transition: "opacity 0.6s ease" }}
        />

        {/* ── EYES ── */}
        {mood === "sleepy" ? (
          /* Sleepy eyes — half-closed lines */
          <>
            <path
              className="mq-cat-eye mq-cat-eye-l"
              d="M 47 44 Q 51 46 55 44"
              stroke="var(--mq-text)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="mq-cat-eye mq-cat-eye-r"
              d="M 65 44 Q 69 46 73 44"
              stroke="var(--mq-text)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : mood === "excited" ? (
          /* Excited eyes — big and sparkly */
          <>
            <g className="mq-cat-eye mq-cat-eye-l">
              <circle cx="51" cy="44" r="5.5" fill="var(--mq-text)" />
              <circle cx="52.5" cy="42" r="2" fill="white" opacity="0.9" />
              <circle cx="49" cy="45.5" r="1" fill="white" opacity="0.5" />
              {/* Star sparkle */}
              <path
                className="mq-cat-eye-sparkle"
                d="M 55 40 L 56 38 L 57 40 L 59 41 L 57 42 L 56 44 L 55 42 L 53 41 Z"
                fill="var(--mq-accent)"
                opacity="0.8"
                transform="scale(0.7) translate(24, 12)"
              />
            </g>
            <g className="mq-cat-eye mq-cat-eye-r">
              <circle cx="69" cy="44" r="5.5" fill="var(--mq-text)" />
              <circle cx="70.5" cy="42" r="2" fill="white" opacity="0.9" />
              <circle cx="67" cy="45.5" r="1" fill="white" opacity="0.5" />
              <path
                className="mq-cat-eye-sparkle"
                d="M 73 40 L 74 38 L 75 40 L 77 41 L 75 42 L 74 44 L 73 42 L 71 41 Z"
                fill="var(--mq-accent)"
                opacity="0.8"
                transform="scale(0.7) translate(32, 12)"
              />
            </g>
          </>
        ) : (
          /* Normal / friendly / sassy eyes with blink */
          <>
            <g className="mq-cat-eye mq-cat-eye-l">
              <ellipse cx="51" cy="44" rx="3.8" ry="4.2" fill="var(--mq-text)" />
              {/* Highlight */}
              <circle cx="52.5" cy="42.5" r="1.4" fill="white" opacity="0.85" />
              <circle cx="49.5" cy="45" r="0.7" fill="white" opacity="0.4" />
              {/* Eyelid for blink */}
              <ellipse
                className="mq-cat-eyelid mq-cat-eyelid-l"
                cx="51"
                cy="42"
                rx="5"
                ry="6"
                fill="var(--mq-card)"
              />
            </g>
            <g className="mq-cat-eye mq-cat-eye-r">
              <ellipse cx="69" cy="44" rx="3.8" ry="4.2" fill="var(--mq-text)" />
              <circle cx="70.5" cy="42.5" r="1.4" fill="white" opacity="0.85" />
              <circle cx="67.5" cy="45" r="0.7" fill="white" opacity="0.4" />
              <ellipse
                className="mq-cat-eyelid mq-cat-eyelid-r"
                cx="69"
                cy="42"
                rx="5"
                ry="6"
                fill="var(--mq-card)"
              />
            </g>
          </>
        )}

        {/* ── NOSE ── */}
        <path
          className="mq-cat-nose"
          d="M 60 51 L 57.5 54 L 62.5 54 Z"
          fill="var(--mq-accent)"
          opacity="0.8"
        />

        {/* ── MOUTH ── */}
        <path
          className="mq-cat-mouth"
          d="M 57.5 54 Q 60 58 62.5 54"
          stroke="var(--mq-text-muted)"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        {/* Pet mouth — happy open smile */}
        {isPetting && (
          <path
            d="M 55 54 Q 60 60 65 54"
            stroke="var(--mq-text-muted)"
            strokeWidth="0.8"
            fill="var(--mq-accent)"
            opacity="0.2"
            strokeLinecap="round"
            className="mq-cat-happy-mouth"
            style={{ transition: "opacity 0.4s ease" }}
          />
        )}

        {/* ── WHISKERS ── */}
        <g className="mq-cat-whiskers">
          {/* Left */}
          <line className="mq-cat-whisker mq-cat-whisker-l1" x1="16" y1="49" x2="38" y2="52" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <line className="mq-cat-whisker mq-cat-whisker-l2" x1="17" y1="55" x2="38" y2="55" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <line className="mq-cat-whisker mq-cat-whisker-l3" x1="16" y1="61" x2="38" y2="58" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          {/* Right */}
          <line className="mq-cat-whisker mq-cat-whisker-r1" x1="82" y1="52" x2="104" y2="49" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <line className="mq-cat-whisker mq-cat-whisker-r2" x1="82" y1="55" x2="103" y2="55" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <line className="mq-cat-whisker mq-cat-whisker-r3" x1="82" y1="58" x2="104" y2="61" stroke="var(--mq-text-muted)" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
        </g>

        {/* ── Musical note floating (when excited) ── */}
        {mood === "excited" && (
          <g className="mq-cat-music-note">
            <text
              x="88"
              y="32"
              fontSize="14"
              fill="var(--mq-accent)"
              opacity="0.7"
              style={{ animation: "mq-cat-note-float 2s ease-in-out infinite" }}
            >
              &#9835;
            </text>
          </g>
        )}

        {/* Zzz for sleepy */}
        {mood === "sleepy" && (
          <g className="mq-cat-zzz">
            <text
              x="85"
              y="28"
              fontSize="10"
              fill="var(--mq-text-muted)"
              opacity="0.5"
              style={{ animation: "mq-cat-zzz-float 3s ease-in-out infinite" }}
            >
              z
            </text>
            <text
              x="93"
              y="20"
              fontSize="13"
              fill="var(--mq-text-muted)"
              opacity="0.35"
              style={{ animation: "mq-cat-zzz-float 3s ease-in-out 0.5s infinite" }}
            >
              Z
            </text>
            <text
              x="100"
              y="12"
              fontSize="16"
              fill="var(--mq-text-muted)"
              opacity="0.2"
              style={{ animation: "mq-cat-zzz-float 3s ease-in-out 1s infinite" }}
            >
              Z
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

// ── Pet Effect (floating hearts / paws) ──
function PetEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1500);
    return () => clearTimeout(id);
  }, [onDone]);

  const symbols = useMemo(
    () => [
      { sym: "\u2764", offset: -16 },
      { sym: "\uD83D\uDC3E", offset: -6 },
      { sym: "\u2728", offset: 4 },
      { sym: "\uD83D\uDC9C", offset: 14 },
      { sym: "\u2665", offset: 24 },
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
            fontSize: `${12 + i * 2}px`,
            left: `${item.offset}px`,
            animation: `mq-cat-pet-float 1.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.08}s both`,
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

  const size = SIZE_PX[catSize] ?? 80;

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
    }, 2000);
  }, [petCat]);

  const handlePetEffectDone = useCallback(() => {
    setShowPetEffect(false);
  }, []);

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
          initial={{ opacity: 0, y: 50, x: 30, scale: 0.7, rotate: -10 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, y: 40, x: 30, scale: 0.7, rotate: 5 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 22,
            mass: 0.9,
          }}
        >
          {/* Speech bubble */}
          <motion.div
            className="absolute mq-no-transition"
            style={{
              bottom: "100%",
              right: 0,
              marginBottom: "10px",
              width: "max-content",
              maxWidth: "220px",
            }}
            initial={{ opacity: 0, y: 10, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.85 }}
            transition={{
              delay: 0.2,
              duration: 0.35,
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
                  "0 4px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.03) inset",
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
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
                aria-label="Закрыть"
              >
                x
              </button>

              {/* Bubble tail */}
              <div
                className="absolute -bottom-[6px] right-4 w-3 h-3 rotate-45"
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
            className="relative cursor-pointer rounded-full outline-none mq-no-transition"
            style={{
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))",
            }}
            whileTap={{ scale: 0.92 }}
            aria-label="Погладить кота"
          >
            <motion.div
              className="mq-no-transition"
              animate={
                isPetting
                  ? {
                      y: [0, -3, 0, -2, 0],
                      rotate: [0, -3, 2, -1, 0],
                    }
                  : {
                      y: [0, -5, 0],
                    }
              }
              transition={
                isPetting
                  ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
                  : {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.5, 1],
                    }
              }
            >
              <CatSVG size={size} isPetting={isPetting} mood={catMood} />
            </motion.div>

            {/* Pet effect */}
            {showPetEffect && <PetEffect onDone={handlePetEffectDone} />}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
