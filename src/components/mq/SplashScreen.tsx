"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import "./auth-motion.css";

/**
 * SplashScreen — minimalist MQ brand pulse.
 *
 * Concept: «звуковая волна» от логотипа-марки. Акцентный квадрат MQ
 * «дышит» (glow из auth-motion.css), от него расходятся тонкие
 * концентрические кольца (тот же паттерн, что на auth-экране), под ним
 * появляется wordmark с раскрытием letter-spacing — стилистика входа MQ
 * синхронизирована 1:1 (AuthView + auth-motion.css).
 *
 * Используется только для hydration (пока Zustand не hydrat'нулся).
 * showDelay 150мс — на быстрой гидратации не показывается вообще.
 * Время показа НЕ добавляется: скрывается по гидрации store, как раньше.
 *
 * Принципы:
 *  - Только design tokens — работает в любой теме
 *  - Фирменная кривая cubic-bezier(0.22, 1, 0.36, 1)
 *  - GPU-accelerated (transform + opacity); кольца — CSS keyframes
 *  - prefers-reduced-motion: кольца/glow отключены (CSS media),
 *    вход — только opacity 120мс
 */

interface SplashScreenProps {
  showDelay?: number;
}

export default function SplashScreen({ showDelay = 150 }: SplashScreenProps) {
  const [visible, setVisible] = useState(showDelay === 0);
  const prefersReducedMotion = useReducedMotion();

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
      key="mq-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      <div className="flex flex-col items-center gap-4 select-none" aria-hidden="true">
        {/* Логотип-марка + пульс волны (кольца) */}
        <motion.div
          className="relative flex items-center justify-center"
          style={{ width: 56, height: 56 }}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={prefersReducedMotion ? { duration: 0.12 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {!prefersReducedMotion && (
            <>
              <span className="mq-auth-ring" style={{ animationDelay: "0s" }} />
              <span className="mq-auth-ring" style={{ animationDelay: "1.2s" }} />
              <span className="mq-auth-ring" style={{ animationDelay: "2.4s" }} />
            </>
          )}
          <div
            className="mq-auth-logo relative z-10 w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
          >
            <span
              className="text-lg font-black text-white"
              style={{ fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
            >
              mq
            </span>
          </div>
        </motion.div>

        {/* Wordmark — letter-spacing раскрытие, как на auth-экране */}
        <motion.span
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, letterSpacing: "0.3em" }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, letterSpacing: "0.08em" }}
          transition={prefersReducedMotion ? { duration: 0.12 } : { delay: 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm font-semibold"
          style={{ color: "var(--mq-text-muted, #888)", fontFamily: "var(--mq-font-serif, Georgia, serif)" }}
        >
          MQ
        </motion.span>
      </div>
    </motion.div>
  );
}
