"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SplashScreen — минималистичная геометрическая анимация.
 *
 * Концепция: «дышащий» круг. Один акцентный круг плавно пульсирует
 * (масштаб + прозрачность), создавая ритмичную, медленную анимацию.
 * Никаких букв, слов, логотипов — чистая геометрия.
 *
 * Используется только для hydration (пока Zustand не hydrat'нулся).
 * showDelay 150мс — на быстрой гидратации не показывается вообще.
 *
 * Принципы:
 *  - Только design tokens — работает в любой теме
 *  - Фирменная кривая cubic-bezier(0.22, 1, 0.36, 1)
 *  - Никакого текста, никаких букв, никаких логотипов
 *  - GPU-accelerated (transform + opacity)
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
      {/* «Дышащий» круг — основной элемент */}
      <motion.div
        className="rounded-full"
        style={{
          width: 48,
          height: 48,
          backgroundColor: "var(--mq-accent, #e03131)",
        }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.8, 0.3, 0.8],
        }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </motion.div>
  );
}
