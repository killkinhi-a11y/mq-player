"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SplashScreen — минималистичная геометрическая анимация.
 *
 * Концепция: три концентрических круга плавно пульсируют.
 * Никаких букв, слов, логотипов — чистая геометрия.
 *
 * Используется только для hydration (пока Zustand не hydrat'нулся).
 * showDelay 150мс — на быстрой гидратации не показывается вообще.
 *
 * Принципы:
 *  - Только design tokens — работает в любой теме
 *  - Фирменная кривая cubic-bezier(0.22, 1, 0.36, 1)
 *  - Никакого текста, никаких букв, никаких логотипов
 */

interface SplashScreenProps {
  showDelay?: number;
}

export default function SplashScreen({ showDelay = 150 }: SplashScreenProps) {
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
      key="mq-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      {/* Три концентрических круга — плавная пульсация */}
      <div className="relative" style={{ width: 80, height: 80 }}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: 80,
              height: 80,
              marginLeft: -40,
              marginTop: -40,
              border: "1.5px solid var(--mq-accent, #e03131)",
            }}
            animate={{
              scale: [0.4, 1.4],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
              delay: i * 0.66,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
