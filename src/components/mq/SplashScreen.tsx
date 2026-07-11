"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SplashScreen v2 — виниловая пластинка.
 *
 * Концепция: минималистичная, элегантная отсылка к музыкальному плееру.
 * Виниловая пластинка медленно вращается (3.5s за оборот) — это спокойная,
 * ритмичная анимация, которая не отвлекает и не выглядит как «загрузка
 * 90-х». Работает в любой теме, не использует ярких цветов.
 *
 * Структура:
 *  - Пластинка: тёмный круг с бороздками (radial-gradient)
 *  - Центральная наклейка: круг accent-цвета с надписью «mq»
 *  - Отверстие в центре (как у настоящего винила)
 *  - Тонкая подпись под пластинкой
 *  - Опциональный прогресс-бар (тонкая линия под пластинкой)
 *
 * Принципы дизайна:
 *  - Только design tokens, никаких хардкод-цветов
 *  - Фирменная easing-кривая cubic-bezier(0.22, 1, 0.36, 1)
 *  - showDelay 200мс — на быстрой гидратации сплеш не показывается
 *  - z-index 300 — выше всего
 */

interface SplashScreenProps {
  /** Опциональный прогресс 0-100. Если не указан — бесконечное вращение. */
  progress?: number;
  /** Подпись под пластинкой. */
  label?: string;
  /** Задержка перед показом в мс. По умолчанию 200. */
  showDelay?: number;
}

export default function SplashScreen({
  progress,
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

  return (
    <motion.div
      key="mq-splash-vinyl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-7 px-6"
      style={{
        backgroundColor: "var(--mq-bg, #0e0e0e)",
      }}
    >
      {/* ── Виниловая пластинка ── */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
        style={{ width: 120, height: 120 }}
      >
        {/* Вращающаяся часть (сам винил) */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            // Бороздки винила — repeating-radial-gradient даёт реалистичный эффект
            background: `
              repeating-radial-gradient(
                circle at center,
                color-mix(in srgb, var(--mq-text) 8%, transparent) 0px,
                color-mix(in srgb, var(--mq-text) 8%, transparent) 1px,
                transparent 1px,
                transparent 3px
              ),
              radial-gradient(
                circle at center,
                color-mix(in srgb, var(--mq-bg) 50%, var(--mq-text)) 0%,
                var(--mq-bg) 100%
              )
            `,
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 1px var(--mq-border-thin)",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "linear", // винил крутится равномерно
          }}
        >
          {/* Блик света — лёгкий градиент сверху, имитация освещения */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.04) 100%)",
            }}
          />
        </motion.div>

        {/* Центральная наклейка (не вращается визуально, но это ок) */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            backgroundColor: "var(--mq-accent, #e03131)",
            boxShadow:
              "0 0 0 1px color-mix(in srgb, var(--mq-accent) 50%, transparent), 0 4px 12px color-mix(in srgb, var(--mq-accent) 25%, transparent)",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <span
            className="text-sm font-black tracking-tight"
            style={{ color: "var(--mq-text-on-accent, #ffffff)" }}
          >
            mq
          </span>
        </motion.div>

        {/* Центральное отверстие (как у настоящего винила) */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: 6,
            height: 6,
            backgroundColor: "var(--mq-bg, #0e0e0e)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
            zIndex: 2,
          }}
        />
      </motion.div>

      {/* ── Подпись + прогресс ── */}
      <div className="flex flex-col items-center gap-3">
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="text-xs font-medium tracking-wide"
          style={{ color: "var(--mq-text-muted, #888)" }}
        >
          {label}
          {typeof progress === "number" && (
            <span
              className="ml-1.5 font-mono tabular-nums"
              style={{ color: "var(--mq-text)" }}
            >
              {Math.round(progress)}%
            </span>
          )}
        </motion.p>

        {/* Тонкий прогресс-бар — только если указан progress */}
        {typeof progress === "number" && (
          <div
            className="w-32 h-px rounded-full overflow-hidden"
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
