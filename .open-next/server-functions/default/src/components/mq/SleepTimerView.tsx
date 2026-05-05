"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Star, Play, X } from "lucide-react";

const timeOptions = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 150, 180];

function formatOption(val: number): string {
  if (val < 60) return `${val} мин`;
  const h = Math.floor(val / 60);
  const m = val % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function ScrollPicker({
  options,
  selected,
  onSelect,
}: {
  options: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemHeight = 48;

  useEffect(() => {
    const idx = options.indexOf(selected);
    if (idx >= 0 && scrollRef.current) {
      // Center the selected item: total padding = 2 * paddingOffset
      // scrollTop = paddingOffset + idx * itemHeight - (containerHeight / 2 - itemHeight / 2)
      // containerHeight = 192, paddingOffset = 72
      const targetScroll = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2);
      scrollRef.current.scrollTop = targetScroll;
    }
  }, [selected, options]);

  const handleScroll = useCallback(() => {
    isScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isScrolling.current = false;
    }, 150);
  }, []);

  const handleScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollCenter = el.scrollTop + 192 / 2;
    const idx = Math.floor((scrollCenter - 72) / itemHeight);
    if (idx >= 0 && idx < options.length) {
      onSelect(options[idx]);
      // Snap to center
      const targetScroll = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2);
      el.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }, [options, onSelect]);

  // Compute opacity for each item based on distance from center
  const getOpacity = useCallback(
    (idx: number) => {
      if (!scrollRef.current) return idx === options.indexOf(selected) ? 1 : 0.35;
      const scrollCenter = scrollRef.current.scrollTop + 192 / 2;
      const itemCenter = 72 + idx * itemHeight + itemHeight / 2;
      const distance = Math.abs(scrollCenter - itemCenter);
      if (distance < itemHeight / 2) return 1;
      if (distance > itemHeight * 2.5) return 0.15;
      return 0.35 + 0.65 * Math.max(0, 1 - distance / (itemHeight * 2.5));
    },
    [selected, options]
  );

  const getScale = useCallback(
    (idx: number) => {
      if (!scrollRef.current) return idx === options.indexOf(selected) ? 1 : 0.9;
      const scrollCenter = scrollRef.current.scrollTop + 192 / 2;
      const itemCenter = 72 + idx * itemHeight + itemHeight / 2;
      const distance = Math.abs(scrollCenter - itemCenter);
      if (distance < itemHeight / 2) return 1;
      if (distance > itemHeight * 2) return 0.85;
      return 0.85 + 0.15 * Math.max(0, 1 - distance / (itemHeight * 2));
    },
    [selected, options]
  );

  return (
    <div className="relative h-[192px] overflow-hidden rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
      {/* Top fade */}
      <div
        className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-t-2xl"
        style={{ background: "linear-gradient(var(--mq-card), transparent)" }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-b-2xl"
        style={{ background: "linear-gradient(transparent, var(--mq-card))" }}
      />

      {/* Center highlight */}
      <div
        className="absolute left-3 right-3 h-12 pointer-events-none z-[5] rounded-xl"
        style={{
          backgroundColor: "var(--mq-accent)",
          opacity: 0.12,
          border: "1px solid var(--mq-accent)",
          top: "calc(50% - 24px)",
        }}
      />

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchEnd={handleScrollEnd}
        onMouseUp={handleScrollEnd}
        className="h-full overflow-y-auto px-4"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {/* Top spacer to allow centering of first item */}
        <div style={{ height: 72 }} />
        {options.map((val, idx) => (
          <div
            key={val}
            className="h-12 flex items-center justify-center cursor-pointer select-none"
            style={{
              opacity: getOpacity(idx),
              transform: `scale(${getScale(idx)})`,
              transition: "opacity 0.15s ease, transform 0.15s ease",
            }}
            onClick={() => {
              onSelect(val);
              if (scrollRef.current) {
                const targetScroll = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2);
                scrollRef.current.scrollTo({ top: targetScroll, behavior: "smooth" });
              }
            }}
          >
            <span
              className="text-lg font-semibold tracking-wide"
              style={{
                color: selected === val ? "var(--mq-accent)" : "var(--mq-text)",
              }}
            >
              {formatOption(val)}
            </span>
          </div>
        ))}
        {/* Bottom spacer */}
        <div style={{ height: 72 }} />
      </div>
    </div>
  );
}

export default function SleepTimerView() {
  const {
    sleepTimerActive,
    sleepTimerRemaining,
    sleepTimerMinutes,
    startSleepTimer,
    stopSleepTimer,
    updateSleepTimer,
    isPlaying,
    togglePlay,
    animationsEnabled,
  } = useAppStore();

  const [selectedMinutes, setSelectedMinutes] = useState(30);

  // Generate subtle stars for background
  const stars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 1.5 + 0.5,
        delay: Math.random() * 4,
      })),
    []
  );

  useEffect(() => {
    if (!sleepTimerActive) return;
    const interval = setInterval(updateSleepTimer, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerActive, updateSleepTimer]);

  const handleStart = (minutes: number) => {
    startSleepTimer(minutes);
    if (!isPlaying) togglePlay();
  };

  const handleStop = () => {
    stopSleepTimer();
  };

  const totalTime = sleepTimerMinutes * 60;
  const progress = totalTime > 0 ? sleepTimerRemaining / totalTime : 0;
  const minutes = Math.floor(sleepTimerRemaining / 60);
  const seconds = sleepTimerRemaining % 60;

  return (
    <div
      className="min-h-screen px-4 pt-6 pb-40 lg:pb-28 flex flex-col items-center relative overflow-hidden"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      {/* Subtle stars background */}
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
              opacity: 0.2,
            }}
            animate={
              animationsEnabled
                ? {
                    opacity: [0.1, 0.4, 0.1],
                    scale: [1, 1.3, 1],
                  }
                : undefined
            }
            transition={{
              duration: 3 + star.delay,
              repeat: Infinity,
              delay: star.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {!sleepTimerActive ? (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full max-w-sm flex-1"
          >
            {/* Header */}
            <motion.div
              className="flex flex-col items-center mb-8"
              animate={
                animationsEnabled
                  ? {
                      y: [0, -4, 0],
                    }
                  : undefined
              }
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Moon className="w-10 h-10 mb-3" style={{ color: "var(--mq-accent)", opacity: 0.8 }} />
              <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                Таймер сна
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
                Выберите время
              </p>
            </motion.div>

            {/* Scroll Picker */}
            <div className="w-full mb-6">
              <ScrollPicker
                options={timeOptions}
                selected={selectedMinutes}
                onSelect={setSelectedMinutes}
              />
            </div>

            {/* Quick presets row */}
            <div className="flex gap-2 mb-8 flex-wrap justify-center">
              {[15, 30, 60, 90].map((val) => (
                <motion.button
                  key={val}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setSelectedMinutes(val)}
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor:
                      selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-card)",
                    color: selectedMinutes === val ? "var(--mq-bg)" : "var(--mq-text-muted)",
                    border: "1px solid",
                    borderColor:
                      selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-border)",
                  }}
                >
                  {formatOption(val)}
                </motion.button>
              ))}
            </div>

            {/* Start button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleStart(selectedMinutes)}
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold shadow-lg w-full max-w-xs"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "var(--mq-bg)",
              }}
            >
              <Play className="w-5 h-5" />
              Начать {formatOption(selectedMinutes)}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full max-w-sm flex-1"
          >
            {/* Header */}
            <div className="flex flex-col items-center mb-10">
              <motion.div
                animate={
                  animationsEnabled
                    ? {
                        y: [0, -6, 0],
                        rotate: [0, 5, -5, 0],
                      }
                    : undefined
                }
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Moon className="w-12 h-12 mb-4" style={{ color: "var(--mq-accent)" }} />
              </motion.div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
                Таймер сна
              </h1>
              <div
                className="flex items-center gap-1.5 mt-1"
                style={{ color: "var(--mq-accent)" }}
              >
                <motion.div
                  animate={
                    animationsEnabled
                      ? {
                          opacity: [0.4, 1, 0.4],
                          scale: [0.8, 1.2, 0.8],
                        }
                      : undefined
                  }
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Star className="w-3 h-3" fill="var(--mq-accent)" />
                </motion.div>
                <span className="text-sm font-medium">Активен</span>
                <motion.div
                  animate={
                    animationsEnabled
                      ? {
                          opacity: [0.4, 1, 0.4],
                          scale: [0.8, 1.2, 0.8],
                        }
                      : undefined
                  }
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                >
                  <Star className="w-3 h-3" fill="var(--mq-accent)" />
                </motion.div>
              </div>
            </div>

            {/* Time display */}
            <div className="flex flex-col items-center mb-8">
              <motion.span
                className="text-6xl font-bold font-mono tracking-wider"
                style={{ color: "var(--mq-text)" }}
                key={`${minutes}:${seconds}`}
                initial={animationsEnabled ? { scale: 1.05, opacity: 0.8 } : undefined}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
              </motion.span>
              <span className="text-sm mt-2" style={{ color: "var(--mq-text-muted)" }}>
                осталось
              </span>
            </div>

            {/* Progress bar */}
            <div
              className="w-full h-2 rounded-full overflow-hidden mb-4"
              style={{ backgroundColor: "var(--mq-border)", opacity: 0.4 }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  boxShadow: "0 0 12px var(--mq-glow)",
                }}
                initial={{ width: "0%" }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.5, ease: "linear" }}
              />
            </div>

            {/* Set duration info */}
            <p className="text-xs mb-10" style={{ color: "var(--mq-text-muted)" }}>
              Время: {formatOption(sleepTimerMinutes)}
            </p>

            {/* Stop button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStop}
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold w-full max-w-xs"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            >
              <X className="w-5 h-5" />
              Отменить таймер
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
