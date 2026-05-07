"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Star, Play, X, Pause, Clock, Sunrise, Zap, ChevronRight } from "lucide-react";

// ── Time presets ──
const timeOptions = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 150, 180];
const quickPresets = [15, 30, 45, 60, 90, 120];

function formatOption(val: number): string {
  if (val < 60) return `${val} мин`;
  const h = Math.floor(val / 60);
  const m = val % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

// ── Sleep cycle phases (90-minute cycles) ──
const SLEEP_CYCLE_MINUTES = 90;

interface SleepPhase {
  name: string;
  startMin: number;
  endMin: number;
  color: string;
  label: string;
}

const SLEEP_PHASES: SleepPhase[] = [
  { name: "light1", startMin: 0, endMin: 15, color: "#8b5cf6", label: "Лёгкий сон" },
  { name: "deep1", startMin: 15, endMin: 45, color: "#6366f1", label: "Глубокий сон" },
  { name: "light2", startMin: 45, endMin: 60, color: "#8b5cf6", label: "Лёгкий сон" },
  { name: "rem", startMin: 60, endMin: 75, color: "#06b6d4", label: "Фаза БДГ" },
  { name: "deep2", startMin: 75, endMin: 85, color: "#6366f1", label: "Глубокий сон" },
  { name: "wake", startMin: 85, endMin: 90, color: "#a78bfa", label: "Пробуждение" },
];

function getSleepPhase(elapsedMinutes: number): SleepPhase {
  const pos = elapsedMinutes % SLEEP_CYCLE_MINUTES;
  for (const phase of SLEEP_PHASES) {
    if (pos >= phase.startMin && pos < phase.endMin) return phase;
  }
  return SLEEP_PHASES[0];
}

// ── Sleep cycle recommendations ──
function getSleepCycleRecommendations(): { cycles: number; wakeTime: string; duration: string; quality: string; qualityColor: string }[] {
  const now = new Date();
  const fallAsleepMinutes = 14; // average
  const results: { cycles: number; wakeTime: string; duration: string; quality: string; qualityColor: string }[] = [];

  for (let cycles = 3; cycles <= 7; cycles++) {
    const sleepMinutes = cycles * SLEEP_CYCLE_MINUTES;
    const wakeTime = new Date(now.getTime() + (fallAsleepMinutes + sleepMinutes) * 60000);
    const qualityMap: Record<number, { quality: string; qualityColor: string }> = {
      3: { quality: "Мало", qualityColor: "#f87171" },
      4: { quality: "Нормально", qualityColor: "#fbbf24" },
      5: { quality: "Хорошо", qualityColor: "#34d399" },
      6: { quality: "Отлично", qualityColor: "#60a5fa" },
      7: { quality: "Много", qualityColor: "#a78bfa" },
    };
    const q = qualityMap[cycles] || qualityMap[5];
    results.push({
      cycles,
      wakeTime: wakeTime.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      duration: formatOption(sleepMinutes),
      quality: q.quality,
      qualityColor: q.qualityColor,
    });
  }
  return results;
}

// ── ScrollPicker (mobile) ──
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
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemHeight = 48;

  useEffect(() => {
    const idx = options.indexOf(selected);
    if (idx >= 0 && scrollRef.current) {
      const targetScroll = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2);
      scrollRef.current.scrollTop = targetScroll;
    }
  }, [selected, options]);

  const handleScroll = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {}, 150);
  }, []);

  const handleScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollCenter = el.scrollTop + 192 / 2;
    const idx = Math.floor((scrollCenter - 72) / itemHeight);
    if (idx >= 0 && idx < options.length) {
      onSelect(options[idx]);
      const targetScroll = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2);
      el.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }, [options, onSelect]);

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
    <div className="relative h-[192px] overflow-hidden rounded-2xl lg:hidden" style={{ backgroundColor: "var(--mq-card)" }}>
      <div className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-t-2xl" style={{ background: "linear-gradient(var(--mq-card), transparent)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-b-2xl" style={{ background: "linear-gradient(transparent, var(--mq-card))" }} />
      <div className="absolute left-3 right-3 h-12 pointer-events-none z-[5] rounded-xl" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.12, border: "1px solid var(--mq-accent)", top: "calc(50% - 24px)" }} />
      <div ref={scrollRef} onScroll={handleScroll} onTouchEnd={handleScrollEnd} onMouseUp={handleScrollEnd} className="h-full overflow-y-auto px-4" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        <div style={{ height: 72 }} />
        {options.map((val, idx) => (
          <div key={val} className="h-12 flex items-center justify-center cursor-pointer select-none" style={{ opacity: getOpacity(idx), transform: `scale(${getScale(idx)})`, transition: "opacity 0.15s ease, transform 0.15s ease" }} onClick={() => { onSelect(val); if (scrollRef.current) { const t = 72 + idx * itemHeight - (192 / 2 - itemHeight / 2); scrollRef.current.scrollTo({ top: t, behavior: "smooth" }); } }}>
            <span className="text-lg font-semibold tracking-wide" style={{ color: selected === val ? "var(--mq-accent)" : "var(--mq-text)" }}>{formatOption(val)}</span>
          </div>
        ))}
        <div style={{ height: 72 }} />
      </div>
    </div>
  );
}

// ── Circular Timer Ring (PC) ──
function CircularTimer({ size = 280, progress, remainingSeconds, isRunning, isPaused }: { size?: number; progress: number; remainingSeconds: number; isRunning: boolean; isPaused: boolean }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  // Sleep phase
  const elapsedMinutes = progress > 0 ? (1 - progress) * (remainingSeconds / 60 + (1 - progress) * remainingSeconds / 60) : 0;
  const totalSetMinutes = remainingSeconds > 0 ? Math.round(remainingSeconds / (1 - progress + 0.001) / 60) : 0;
  const actualElapsed = totalSetMinutes > 0 ? totalSetMinutes * progress : 0;
  const phase = isRunning ? getSleepPhase(actualElapsed) : null;
  const currentCycle = totalSetMinutes > 0 ? Math.floor(actualElapsed / SLEEP_CYCLE_MINUTES) + 1 : 0;

  return (
    <div className={`relative ${isRunning ? "timer-glow-pc" : ""}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--mq-border)" strokeWidth="6" opacity={0.3} />
        {/* Progress ring */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#timerGradPc)" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-1000 ease-linear" />
        {/* Glow track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#timerGradPc)" strokeWidth="2" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-1000 ease-linear" style={{ filter: "blur(6px)", opacity: 0.4 }} />
        <defs>
          <linearGradient id="timerGradPc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isPaused ? (
          <div className="flex items-center gap-2 mb-1">
            <Pause className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--mq-accent)" }}>Пауза</span>
          </div>
        ) : null}
        <span className="font-bold font-mono tracking-wider" style={{ fontSize: hours > 0 ? "2.5rem" : "3.2rem", color: "var(--mq-text)", lineHeight: 1 }}>
          {hours > 0 && <span className="text-2xl font-light" style={{ color: "var(--mq-text-muted)" }}>{hours}:</span>}
          {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
        </span>
        {phase && isRunning && (
          <motion.div key={phase.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-center">
            <p className="text-[11px] font-medium" style={{ color: phase.color }}>Цикл {currentCycle} · {phase.label}</p>
            <div className="w-14 h-1 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ backgroundColor: phase.color, width: `${((phase.endMin / SLEEP_CYCLE_MINUTES) * 100)}%` }} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Current Time Display ──
function CurrentTimeDisplay() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <span className="font-mono tracking-wide" style={{ color: "var(--mq-text-muted)", fontSize: "0.85rem" }}>
      {time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      <span style={{ opacity: 0.5 }}>:{time.getSeconds().toString().padStart(2, "0")}</span>
    </span>
  );
}

// ── Main View ──
export default function SleepTimerView() {
  const {
    sleepTimerActive,
    sleepTimerRemaining,
    sleepTimerMinutes,
    sleepTimerEndTime,
    startSleepTimer,
    stopSleepTimer,
    updateSleepTimer,
    isPlaying,
    togglePlay,
    animationsEnabled,
  } = useAppStore();

  const [selectedMinutes, setSelectedMinutes] = useState(30);

  const stars = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, size: Math.random() * 1.5 + 0.5, delay: Math.random() * 4 })), []);

  useEffect(() => { if (!sleepTimerActive) return; const i = setInterval(updateSleepTimer, 1000); return () => clearInterval(i); }, [sleepTimerActive, updateSleepTimer]);

  const handleStart = (minutes: number) => { startSleepTimer(minutes); if (!isPlaying) togglePlay(); };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); if (sleepTimerActive) stopSleepTimer(); else handleStart(selectedMinutes); }
      if (e.code === "Escape" && sleepTimerActive) { e.preventDefault(); stopSleepTimer(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sleepTimerActive, selectedMinutes, stopSleepTimer, handleStart, isPlaying, togglePlay]);

  const totalTime = sleepTimerMinutes * 60;
  const progress = totalTime > 0 ? 1 - sleepTimerRemaining / totalTime : 0;
  const wakeTimeStr = sleepTimerEndTime ? new Date(sleepTimerEndTime).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  // Recommendations
  const recommendations = useMemo(() => getSleepCycleRecommendations(), []);

  return (
    <div className="min-h-screen px-4 pt-6 pb-40 lg:pb-28 flex flex-col items-center relative overflow-hidden" style={{ backgroundColor: "var(--mq-bg)" }}>
      {/* Stars background */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((star) => (
          <motion.div key={star.id} className="absolute rounded-full" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, backgroundColor: "var(--mq-accent)", opacity: 0.2 }} animate={animationsEnabled ? { opacity: [0.1, 0.4, 0.1], scale: [1, 1.3, 1] } : undefined} transition={{ duration: 3 + star.delay, repeat: Infinity, delay: star.delay, ease: "easeInOut" }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {!sleepTimerActive ? (
          /* ═══════════════════════════ PICKER MODE ═══════════════════════════ */
          <motion.div key="picker" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="flex flex-col items-center w-full max-w-2xl flex-1">
            {/* Header */}
            <motion.div className="flex flex-col items-center mb-6" animate={animationsEnabled ? { y: [0, -4, 0] } : undefined} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
              <Moon className="w-10 h-10 mb-3" style={{ color: "var(--mq-accent)", opacity: 0.8 }} />
              <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>Таймер сна</h1>
              <div className="flex items-center gap-2 mt-1">
                <CurrentTimeDisplay />
              </div>
            </motion.div>

            {/* Desktop: Grid presets (PC-optimized) */}
            <div className="hidden lg:grid grid-cols-6 gap-2 w-full mb-6">
              {quickPresets.map((val) => (
                <motion.button key={val} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => setSelectedMinutes(val)} className="py-3 rounded-xl text-sm font-semibold transition-all" style={{ backgroundColor: selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-card)", color: selectedMinutes === val ? "var(--mq-bg)" : "var(--mq-text-muted)", border: "1px solid", borderColor: selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-border)", boxShadow: selectedMinutes === val ? "0 4px 16px var(--mq-glow)" : "none" }}>
                  {formatOption(val)}
                </motion.button>
              ))}
            </div>

            {/* Mobile: Scroll picker */}
            <div className="w-full mb-6">
              <ScrollPicker options={timeOptions} selected={selectedMinutes} onSelect={setSelectedMinutes} />
            </div>

            {/* Mobile: Quick presets */}
            <div className="flex gap-2 mb-6 flex-wrap justify-center lg:hidden">
              {[15, 30, 60, 90].map((val) => (
                <motion.button key={val} whileTap={{ scale: 0.93 }} onClick={() => setSelectedMinutes(val)} className="px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-card)", color: selectedMinutes === val ? "var(--mq-bg)" : "var(--mq-text-muted)", border: "1px solid", borderColor: selectedMinutes === val ? "var(--mq-accent)" : "var(--mq-border)" }}>
                  {formatOption(val)}
                </motion.button>
              ))}
            </div>

            {/* Start button */}
            <motion.button whileHover={{ scale: 1.03, boxShadow: "0 8px 24px var(--mq-glow)" }} whileTap={{ scale: 0.97 }} onClick={() => handleStart(selectedMinutes)} className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold shadow-lg w-full max-w-sm" style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-bg)" }}>
              <Play className="w-5 h-5" />
              Начать {formatOption(selectedMinutes)}
            </motion.button>

            {/* Desktop: Sleep cycle recommendations */}
            <div className="hidden lg:block w-full mt-8">
              <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Циклы сна</h3>
                  <span className="text-[10px] ml-auto" style={{ color: "var(--mq-text-muted)" }}>~90 мин/цикл · 14 мин на засыпание</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {recommendations.map((rec) => (
                    <motion.div key={rec.cycles} whileHover={{ y: -2 }} className="rounded-xl p-3 text-center cursor-pointer transition-all" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--mq-border)" }} onClick={() => { setSelectedMinutes(rec.cycles * SLEEP_CYCLE_MINUTES); }}>
                      <p className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>{rec.wakeTime}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{rec.cycles} цикл</p>
                      <p className="text-[10px] mt-1 font-medium" style={{ color: rec.qualityColor }}>{rec.quality}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Keyboard shortcuts hint (PC) */}
            <div className="hidden lg:flex gap-4 mt-4 text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>Space</kbd>Старт</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>Esc</kbd>Стоп</span>
            </div>
          </motion.div>
        ) : (
          /* ═══════════════════════════ ACTIVE MODE ═══════════════════════════ */
          <motion.div key="active" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }} className="flex flex-col items-center w-full max-w-2xl flex-1">
            {/* Header */}
            <div className="flex flex-col items-center mb-6">
              <motion.div animate={animationsEnabled ? { y: [0, -6, 0], rotate: [0, 5, -5, 0] } : undefined} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
                <Moon className="w-12 h-12 mb-3" style={{ color: "var(--mq-accent)" }} />
              </motion.div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>Таймер сна</h1>
              <div className="flex items-center gap-1.5" style={{ color: "var(--mq-accent)" }}>
                <motion.div animate={animationsEnabled ? { opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] } : undefined} transition={{ duration: 1.5, repeat: Infinity }}><Star className="w-3 h-3" fill="var(--mq-accent)" /></motion.div>
                <span className="text-sm font-medium">Активен</span>
                <motion.div animate={animationsEnabled ? { opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] } : undefined} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}><Star className="w-3 h-3" fill="var(--mq-accent)" /></motion.div>
              </div>
            </div>

            {/* Desktop: Circular Timer + Info side by side */}
            <div className="hidden lg:flex items-center gap-10 w-full justify-center mb-6">
              {/* Circular Timer */}
              <CircularTimer size={300} progress={progress} remainingSeconds={sleepTimerRemaining} isRunning={true} isPaused={false} />
              {/* Info panel */}
              <div className="space-y-5 flex-1 max-w-xs">
                {/* Wake time */}
                <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sunrise className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>Пробуждение</span>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: "var(--mq-text)" }}>{wakeTimeStr}</p>
                </div>

                {/* Duration */}
                <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>Длительность</span>
                  </div>
                  <p className="text-lg font-semibold" style={{ color: "var(--mq-text)" }}>{formatOption(sleepTimerMinutes)}</p>
                </div>

                {/* Current sleep cycle */}
                <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Moon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>Цикл</span>
                  </div>
                  <SleepCycleBar progress={progress} totalMinutes={sleepTimerMinutes} />
                </div>
              </div>
            </div>

            {/* Mobile: Timer display (original style) */}
            <div className="lg:hidden flex flex-col items-center mb-8">
              <motion.span className="text-6xl font-bold font-mono tracking-wider" style={{ color: "var(--mq-text)" }} key={`${Math.floor(sleepTimerRemaining / 60)}:${sleepTimerRemaining % 60}`} initial={animationsEnabled ? { scale: 1.05, opacity: 0.8 } : undefined} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
                {Math.floor(sleepTimerRemaining / 60).toString().padStart(2, "0")}:{(sleepTimerRemaining % 60).toString().padStart(2, "0")}
              </motion.span>
              <span className="text-sm mt-2" style={{ color: "var(--mq-text-muted)" }}>осталось</span>
              {/* Progress bar */}
              <div className="w-full h-2 rounded-full overflow-hidden mt-4 mb-2" style={{ backgroundColor: "var(--mq-border)", opacity: 0.4 }}>
                <motion.div className="h-full rounded-full" style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 0 12px var(--mq-glow)" }} initial={{ width: "0%" }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.5, ease: "linear" }} />
              </div>
              <div className="flex justify-between w-full">
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Пробуждение: {wakeTimeStr}</span>
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{formatOption(sleepTimerMinutes)}</span>
              </div>
            </div>

            {/* Stop button */}
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={stopSleepTimer} className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold w-full max-w-sm" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}>
              <X className="w-5 h-5" />
              Отменить таймер
            </motion.button>

            {/* Desktop keyboard hint */}
            <div className="hidden lg:flex gap-4 mt-4 text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>Space</kbd>Стоп</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sleep Cycle Progress Bar ──
function SleepCycleBar({ progress, totalMinutes }: { progress: number; totalMinutes: number }) {
  const elapsed = totalMinutes * progress;
  const cycleNum = Math.floor(elapsed / SLEEP_CYCLE_MINUTES) + 1;
  const totalCycles = Math.ceil(totalMinutes / SLEEP_CYCLE_MINUTES);
  const phase = getSleepPhase(elapsed);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: phase.color }}>{phase.label}</span>
        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Цикл {cycleNum} из {totalCycles}</span>
      </div>
      {/* Phase bar */}
      <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-border)", opacity: 0.4 }}>
        {SLEEP_PHASES.map((p) => {
          const widthPct = ((p.endMin - p.startMin) / SLEEP_CYCLE_MINUTES) * 100;
          const posInCycle = (elapsed % SLEEP_CYCLE_MINUTES);
          const isCurrentPhase = posInCycle >= p.startMin && posInCycle < p.endMin;
          return (
            <div key={p.name} className="h-full transition-opacity duration-500" style={{ width: `${widthPct}%`, backgroundColor: isCurrentPhase ? p.color : p.color, opacity: isCurrentPhase ? 1 : 0.25 }} />
          );
        })}
        {/* Position marker */}
        <div className="absolute h-3 w-0.5 rounded-full -translate-y-0.5 transition-all duration-1000" style={{ left: `${(elapsed % SLEEP_CYCLE_MINUTES) / SLEEP_CYCLE_MINUTES * 100}%`, backgroundColor: "#fff", top: "0", boxShadow: "0 0 6px rgba(255,255,255,0.5)", position: "relative" }} />
      </div>
    </div>
  );
}
