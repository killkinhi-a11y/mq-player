"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Star, CloudMoon, Play, Pause, X, Clock } from "lucide-react";

const presets = [
  { label: "15 мин", value: 15 },
  { label: "30 мин", value: 30 },
  { label: "45 мин", value: 45 },
  { label: "60 мин", value: 60 },
];

export default function SleepTimerView() {
  const {
    sleepTimerActive, sleepTimerRemaining, sleepTimerMinutes,
    startSleepTimer, stopSleepTimer, updateSleepTimer,
    isPlaying, togglePlay, animationsEnabled,
  } = useAppStore();
  const [customMinutes, setCustomMinutes] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  // Generate stars for background
  const stars = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 3,
  }));

  useEffect(() => {
    if (!sleepTimerActive) return;
    const interval = setInterval(updateSleepTimer, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerActive, updateSleepTimer]);

  const handleStart = (minutes: number) => {
    startSleepTimer(minutes);
    if (!isPlaying) togglePlay();
    setShowCustom(false);
  };

  const totalTime = sleepTimerMinutes * 60;
  const progress = totalTime > 0 ? sleepTimerRemaining / totalTime : 0;
  const minutes = Math.floor(sleepTimerRemaining / 60);
  const seconds = sleepTimerRemaining % 60;

  const radius = 110;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div
      className="min-h-screen p-4 lg:p-6 pb-40 lg:pb-28 flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      {/* Stars background */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              backgroundColor: "var(--mq-accent)",
              opacity: 0.4,
            }}
            animate={
              animationsEnabled
                ? {
                    opacity: [0.2, 0.8, 0.2],
                    scale: [1, 1.5, 1],
                  }
                : undefined
            }
            transition={{
              duration: 2 + star.delay,
              repeat: Infinity,
              delay: star.delay,
            }}
          />
        ))}
      </div>

      {/* Moon */}
      <motion.div
        className="mb-6"
        animate={
          animationsEnabled && sleepTimerActive
            ? {
                y: [0, -8, 0],
                rotate: [0, 5, -5, 0],
              }
            : undefined
        }
        transition={{ duration: 4, repeat: Infinity }}
      >
        <CloudMoon className="w-16 h-16" style={{ color: "var(--mq-accent)", opacity: 0.7 }} />
      </motion.div>

      <h1 className="text-2xl font-bold mb-8 relative z-10" style={{ color: "var(--mq-text)" }}>
        Таймер сна
      </h1>

      {/* Circular timer */}
      <div className="relative mb-8">
        <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="140"
            cy="140"
            r={radius}
            fill="none"
            stroke="var(--mq-border)"
            strokeWidth="8"
            opacity="0.3"
          />
          {/* Progress circle */}
          <motion.circle
            cx="140"
            cy="140"
            r={radius}
            fill="none"
            stroke="var(--mq-accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              filter: sleepTimerActive ? `drop-shadow(0 0 12px var(--mq-glow))` : "none",
            }}
            transition={{ duration: 0.5 }}
          />
        </svg>

        {/* Glow effect */}
        {sleepTimerActive && (
          <motion.div
            className="absolute inset-4 rounded-full"
            style={{
              background: "radial-gradient(circle, var(--mq-glow) 0%, transparent 70%)",
            }}
            animate={
              animationsEnabled
                ? {
                    opacity: [0.3, 0.6, 0.3],
                    scale: [0.95, 1.05, 0.95],
                  }
                : undefined
            }
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {sleepTimerActive ? (
            <>
              <motion.span
                className="text-5xl font-bold font-mono"
                style={{ color: "var(--mq-text)" }}
                key={`${minutes}:${seconds}`}
                initial={animationsEnabled ? { scale: 1.1 } : undefined}
                animate={{ scale: 1 }}
              >
                {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
              </motion.span>
              <span className="text-xs mt-2" style={{ color: "var(--mq-text-muted)" }}>
                осталось
              </span>
              <motion.div
                className="flex items-center gap-1 mt-2"
                animate={animationsEnabled ? { opacity: [0.5, 1, 0.5] } : undefined}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Moon className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                <span className="text-xs" style={{ color: "var(--mq-accent)" }}>
                  Активен
                </span>
              </motion.div>
            </>
          ) : (
            <>
              <Moon className="w-8 h-8 mb-2" style={{ color: "var(--mq-text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Выберите время
              </span>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      {!sleepTimerActive ? (
        <div className="space-y-4 w-full max-w-xs">
          <div className="grid grid-cols-2 gap-3">
            {presets.map((preset) => (
              <motion.button
                key={preset.value}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleStart(preset.value)}
                className="rounded-xl p-4 flex flex-col items-center gap-1 min-h-[60px]"
                style={{
                  backgroundColor: "var(--mq-card)",
                  border: "1px solid var(--mq-border)",
                }}
              >
                <Clock className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                  {preset.label}
                </span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2"
              >
                <input
                  type="number"
                  placeholder="Минуты"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="flex-1 rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                  min="1"
                  max="180"
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const m = parseInt(customMinutes);
                    if (m > 0 && m <= 180) handleStart(m);
                  }}
                  className="px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  Старт
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowCustom(!showCustom)}
            className="w-full text-sm py-2"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {showCustom ? "Скрыть" : "Другое время..."}
          </button>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={stopSleepTimer}
          className="flex items-center gap-2 px-6 py-3 rounded-xl"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: "var(--mq-text)",
          }}
        >
          <X className="w-4 h-4" />
          Отменить таймер
        </motion.button>
      )}
    </div>
  );
}
