"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SplashScreen — единая сплеш-анимация для mq-player.
 *
 * Концепция: минималистичный wordmark. Ничего лишнего.
 * Буквы «mq» мягко появляются по одной, под ними тонкая линия
 * прогресса пульсирует. Никаких спиннеров, винилов, скелетов.
 *
 * Используется в двух случаях:
 *  1. Hydration — пока Zustand не hydrat'нулся
 *  2. Demo loading — пока грузится демо-контент
 *
 * Принципы:
 *  - Только design tokens — работает в любой теме
 *  - Фирменная кривая cubic-bezier(0.22, 1, 0.36, 1)
 *  - showDelay — не показывает сплеш на быстрых загрузках
 *  - z-index 300 — выше всего
 */

interface SplashScreenProps {
  label?: string;
  showDelay?: number;
}

export default function SplashScreen({
  label = "Загрузка",
  showDelay = 200,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(showDelay === 0);

  useEffect(() => {
    if (showDelay === 0) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), showDelay);
    return () => clearTimeout(t);
  }, [showDelay]);

  if (!visible) return null;

  const letters = ["m", "q"];

  return (
    <motion.div
      key="mq-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-8"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      {/* ── Wordmark «mq» — буквы появляются по одной ── */}
      <div className="flex items-center justify-center">
        {letters.map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
              delay: i * 0.12,
            }}
            className="text-6xl font-black tracking-tight"
            style={{ color: "var(--mq-accent, #e03131)" }}
          >
            {letter}
          </motion.span>
        ))}
      </div>

      {/* ── Тонкая пульсирующая линия ── */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{
          duration: 0.8,
          ease: [0.22, 1, 0.36, 1],
          delay: 0.3,
        }}
        className="h-px rounded-full"
        style={{
          width: 48,
          backgroundColor: "var(--mq-accent, #e03131)",
          transformOrigin: "center",
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* ── Подпись ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
        className="text-xs font-medium tracking-wide"
        style={{ color: "var(--mq-text-muted, #888)" }}
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
