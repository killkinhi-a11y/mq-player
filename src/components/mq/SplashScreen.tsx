"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SplashScreen — унифицированная сплеш-анимация для mq-player.
 *
 * Используется в двух местах:
 *  1. AppShell: пока Zustand не hydrat'нулся (первый рендер)
 *  2. AppShell: во время demo loading (когда гость входит в приложение)
 *
 * Дизайн-принципы:
 *  - Чистый фон var(--mq-bg) — без хардкод-цветов, работает в любой теме
 *  - Логотип «mq» в круге с accent-цветом — фирменный знак
 *  - Под логотипом 5 эквалайзер-баров — визуальная отсылка к продукту
 *    (музыкальный плеер), не статичный спиннер
 *  - Циклическая волна расходится от логотипа — лёгкая, не отвлекает
 *  - Прогресс-бар внизу — опциональный, для случаев когда известен прогресс
 *  - Тайм-аут 200мс перед показом — избегает «флеша» сплеша на быстрых
 *    загрузках (если hydration < 200мс, сплеш вообще не показывается)
 *
 * Анимация: cubic-bezier(0.22, 1, 0.36, 1) — фирменная easing-кривая проекта
 * (--mq-spring-smooth). Никаких linear/ease-in-out.
 */

interface SplashScreenProps {
  /** Опциональный прогресс 0-100. Если не указан — показывается бесконечная анимация. */
  progress?: number;
  /** Подпись под логотипом. По умолчанию «Загрузка». */
  label?: string;
  /** Задержка перед показом в мс. По умолчанию 200 — скрывает сплеш на быстрых загрузках. */
  showDelay?: number;
}

export default function SplashScreen({
  progress,
  label = "Загрузка",
  showDelay = 200,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(showDelay === 0);

  // tiny delay — skip splash entirely on instant hydration
  useEffect(() => {
    if (showDelay === 0) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), showDelay);
    return () => clearTimeout(t);
  }, [showDelay]);

  if (!visible) return null;

  // 5 эквалайзер-баров с разными задержками и высотами — паттерн реального
  // аудио-спектра. Используем transform: scaleY для GPU-ускорения.
  const eqBars = [0, 1, 2, 3, 4];
  const eqKeyframes = [0.25, 0.85, 0.45, 1, 0.35, 0.65];

  return (
    <motion.div
      key="mq-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-8 px-6"
      style={{
        backgroundColor: "var(--mq-bg, #0e0e0e)",
      }}
    >
      {/* ── Логотип с волной ── */}
      <div className="relative flex items-center justify-center">
        {/* Расходящиеся волны — 3 круга с задержкой */}
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 96,
              height: 96,
              border: "1.5px solid var(--mq-accent, #e03131)",
              opacity: 0,
            }}
            animate={{
              scale: [1, 1.8],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeOut",
              delay: i * 0.8,
            }}
          />
        ))}

        {/* Сам логотип — круг с «mq» */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--mq-accent, #e03131)",
            boxShadow:
              "0 8px 32px color-mix(in srgb, var(--mq-accent) 35%, transparent), 0 0 0 1px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
          }}
        >
          <span
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--mq-text-on-accent, #ffffff)" }}
          >
            mq
          </span>

          {/* Лёгкий внутренний блик */}
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)",
            }}
          />
        </motion.div>
      </div>

      {/* ── Эквалайзер-индикатор ── */}
      <div className="flex items-end justify-center gap-1 h-6">
        {eqBars.map((i) => (
          <motion.span
            key={i}
            className="w-1 rounded-full"
            style={{
              height: 22,
              backgroundColor: "var(--mq-accent, #e03131)",
              transformOrigin: "bottom",
              opacity: 0.5 + i * 0.1, // плавный градиент прозрачности
            }}
            animate={{ scaleY: eqKeyframes }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              repeatType: "reverse",
              delay: i * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>

      {/* ── Подпись + прогресс ── */}
      <div className="flex flex-col items-center gap-3">
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="text-sm font-medium"
          style={{ color: "var(--mq-text-muted, #888)" }}
        >
          {label}
          {typeof progress === "number" && (
            <span className="ml-1.5 font-mono tabular-nums" style={{ color: "var(--mq-text)" }}>
              {Math.round(progress)}%
            </span>
          )}
        </motion.p>

        {/* Прогресс-бар — только если указан progress */}
        {typeof progress === "number" && (
          <div
            className="w-40 h-0.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--mq-glass-bg, rgba(255,255,255,0.06))" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
              animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
