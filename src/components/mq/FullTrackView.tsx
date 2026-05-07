"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1,
  Shuffle, X, Heart, ThumbsDown, ListMusic, Music, ChevronLeft, FileText, ExternalLink, Download, Moon, Clock, MessageSquare, Sparkles, Waves, Dna, MoreVertical, Headphones, Radio, Mic2, Sunrise, Star, Gauge
} from "lucide-react";
import SongDNA from "./SongDNA";
import { Slider } from "@/components/ui/slider";
import { formatDuration, searchTracks, type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { getAudioElement, resumeAudioContext, getAnalyser, getInactiveAudio } from "@/lib/audioEngine";
import TrackCommentsPanel from "./TrackCommentsPanel";
import TrackCanvas from "./TrackCanvas";
import PlaylistArtwork from "./PlaylistArtwork";

// ── Sleep Timer Wheel Picker (scrollable drum-style) ──
const SLEEP_TIME_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 150, 180];

function formatSleepTime(val: number): string {
  if (val < 60) return `${val} мин`;
  const h = Math.floor(val / 60);
  const m = val % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function SleepTimerWheel({ options, selected, onSelect }: {
  options: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemHeight = 48;
  const containerHeight = 192;
  const paddingOffset = 72;

  useEffect(() => {
    const idx = options.indexOf(selected);
    if (idx >= 0 && scrollRef.current) {
      const targetScroll = paddingOffset + idx * itemHeight - (containerHeight / 2 - itemHeight / 2);
      scrollRef.current.scrollTop = targetScroll;
    }
  }, [selected, options]);

  const handleScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollCenter = el.scrollTop + containerHeight / 2;
    const idx = Math.floor((scrollCenter - paddingOffset) / itemHeight);
    if (idx >= 0 && idx < options.length) {
      onSelect(options[idx]);
      const targetScroll = paddingOffset + idx * itemHeight - (containerHeight / 2 - itemHeight / 2);
      el.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }, [options, onSelect]);

  const getOpacity = useCallback((idx: number) => {
    if (!scrollRef.current) return idx === options.indexOf(selected) ? 1 : 0.35;
    const scrollCenter = scrollRef.current.scrollTop + containerHeight / 2;
    const itemCenter = paddingOffset + idx * itemHeight + itemHeight / 2;
    const distance = Math.abs(scrollCenter - itemCenter);
    if (distance < itemHeight / 2) return 1;
    if (distance > itemHeight * 2.5) return 0.15;
    return 0.35 + 0.65 * Math.max(0, 1 - distance / (itemHeight * 2.5));
  }, [selected, options]);

  const getScale = useCallback((idx: number) => {
    if (!scrollRef.current) return idx === options.indexOf(selected) ? 1 : 0.9;
    const scrollCenter = scrollRef.current.scrollTop + containerHeight / 2;
    const itemCenter = paddingOffset + idx * itemHeight + itemHeight / 2;
    const distance = Math.abs(scrollCenter - itemCenter);
    if (distance < itemHeight / 2) return 1;
    if (distance > itemHeight * 2) return 0.85;
    return 0.85 + 0.15 * Math.max(0, 1 - distance / (itemHeight * 2));
  }, [selected, options]);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: containerHeight, backgroundColor: "var(--mq-card)" }}>
      <div className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-t-2xl"
        style={{ background: "linear-gradient(var(--mq-card), transparent)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-16 z-10 pointer-events-none rounded-b-2xl"
        style={{ background: "linear-gradient(transparent, var(--mq-card))" }} />
      <div className="absolute left-3 right-3 pointer-events-none z-[5] rounded-xl"
        style={{ backgroundColor: "var(--mq-accent)", opacity: 0.12, border: "1px solid var(--mq-accent)", height: itemHeight, top: "calc(50% - 24px)" }} />
      <div ref={scrollRef} onTouchEnd={handleScrollEnd} onMouseUp={handleScrollEnd}
        className="h-full overflow-y-auto px-4" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        <div style={{ height: paddingOffset }} />
        {options.map((val, idx) => (
          <div key={val} className="h-12 flex items-center justify-center cursor-pointer select-none"
            style={{ opacity: getOpacity(idx), transform: `scale(${getScale(idx)})`, transition: "opacity 0.15s ease, transform 0.15s ease" }}
            onClick={() => {
              onSelect(val);
              if (scrollRef.current) {
                const targetScroll = paddingOffset + idx * itemHeight - (containerHeight / 2 - itemHeight / 2);
                scrollRef.current.scrollTo({ top: targetScroll, behavior: "smooth" });
              }
            }}>
            <span className="text-lg font-semibold tracking-wide"
              style={{ color: selected === val ? "var(--mq-accent)" : "var(--mq-text)" }}>
              {formatSleepTime(val)}
            </span>
          </div>
        ))}
        <div style={{ height: paddingOffset }} />
      </div>
    </div>
  );
}

// ── Sleep cycle helpers ──
const SLEEP_CYCLE_MIN = 90;
const FALL_ASLEEP_MIN = 14;

interface SleepCycleRec {
  cycles: number;
  totalMin: number;
  wakeTime: string;
  quality: string;
  qualityColor: string;
}

function getSleepCycleRecs(): SleepCycleRec[] {
  const now = new Date();
  const results: SleepCycleRec[] = [];
  const qMap: Record<number, { quality: string; qualityColor: string }> = {
    3: { quality: "Мало", qualityColor: "#f87171" },
    4: { quality: "Нормально", qualityColor: "#fbbf24" },
    5: { quality: "Хорошо", qualityColor: "#34d399" },
    6: { quality: "Отлично", qualityColor: "#60a5fa" },
    7: { quality: "Много", qualityColor: "#a78bfa" },
  };
  for (let c = 3; c <= 7; c++) {
    const total = c * SLEEP_CYCLE_MIN;
    const wake = new Date(now.getTime() + (FALL_ASLEEP_MIN + total) * 60000);
    const q = qMap[c] || qMap[5];
    results.push({
      cycles: c,
      totalMin: total,
      wakeTime: wake.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      quality: q.quality,
      qualityColor: q.qualityColor,
    });
  }
  return results;
}

function getWakeTimeForMinutes(minutes: number): string {
  const now = new Date();
  const wake = new Date(now.getTime() + minutes * 60000);
  return wake.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function SleepTimerPopover({ show, onClose, active, remaining, timerMinutes, onStart, onStop }: {
  show: boolean;
  onClose: () => void;
  active: boolean;
  remaining: number;
  timerMinutes: number;
  onStart: (m: number) => void;
  onStop: () => void;
}) {
  const [selected, setSelected] = useState(30);
  const [customMin, setCustomMin] = useState("");
  const [tab, setTab] = useState<"presets" | "cycles" | "custom">("presets");
  const cycleRecs = useMemo(() => getSleepCycleRecs(), []);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = timerMinutes > 0 ? ((timerMinutes * 60 - remaining) / (timerMinutes * 60)) : 0;

  const applyCustom = () => {
    const val = parseInt(customMin, 10);
    if (val >= 1 && val <= 480) {
      setSelected(val);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          onClick={onClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative z-10 rounded-3xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              width: "min(480px, 92vw)",
            }}
            onClick={(e) => e.stopPropagation()}>

            {!active ? (
              /* ═══════ PICKER MODE (desktop-optimized) ═══════ */
              <div className="p-5 sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(139,92,246,0.12)" }}>
                      <Moon className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                    </div>
                    <div>
                      <span className="text-sm font-bold block" style={{ color: "var(--mq-text)" }}>Таймер сна</span>
                      <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                        {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} сейчас
                      </span>
                    </div>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tab switcher (desktop only) */}
                <div className="hidden sm:flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                  {([
                    { id: "presets" as const, label: "Пресеты" },
                    { id: "cycles" as const, label: "Циклы сна" },
                    { id: "custom" as const, label: "Вручную" },
                  ]).map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: tab === t.id ? "var(--mq-accent)" : "transparent",
                        color: tab === t.id ? "var(--mq-bg)" : "var(--mq-text-muted)",
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Desktop: Tab content */}
                {tab === "presets" && (
                  <div className="hidden sm:block">
                    {/* Preset grid */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {SLEEP_TIME_OPTIONS.map((val) => (
                        <motion.button key={val} whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.96 }}
                          onClick={() => setSelected(val)}
                          className="py-3 rounded-xl text-sm font-semibold transition-all"
                          style={{
                            backgroundColor: selected === val ? "var(--mq-accent)" : "var(--mq-input-bg)",
                            color: selected === val ? "var(--mq-bg)" : "var(--mq-text-muted)",
                            border: `1px solid ${selected === val ? "var(--mq-accent)" : "transparent"}`,
                            boxShadow: selected === val ? "0 4px 16px rgba(139,92,246,0.25)" : "none",
                          }}>
                          {formatSleepTime(val)}
                        </motion.button>
                      ))}
                    </div>
                    {/* Wake-up preview */}
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-4" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center gap-2">
                        <Sunrise className="w-4 h-4" style={{ color: "#fbbf24" }} />
                        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Пробуждение</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>
                        {getWakeTimeForMinutes(selected)}
                      </span>
                    </div>
                  </div>
                )}

                {tab === "cycles" && (
                  <div className="hidden sm:block">
                    <p className="text-xs mb-3" style={{ color: "var(--mq-text-muted)" }}>
                      Научные циклы сна по 90 мин + ~14 мин на засыпание
                    </p>
                    <div className="space-y-2 mb-4">
                      {cycleRecs.map((rec) => (
                        <motion.button key={rec.cycles} whileHover={{ scale: 1.01, x: 2 }} whileTap={{ scale: 0.98 }}
                          onClick={() => setSelected(rec.totalMin)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                          style={{
                            backgroundColor: selected === rec.totalMin ? "rgba(139,92,246,0.1)" : "var(--mq-input-bg)",
                            border: `1px solid ${selected === rec.totalMin ? "rgba(139,92,246,0.4)" : "transparent"}`,
                          }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: `${rec.qualityColor}20`, color: rec.qualityColor }}>
                            {rec.cycles}
                          </div>
                          <div className="flex-1 text-left">
                            <span className="text-sm font-semibold block" style={{ color: "var(--mq-text)" }}>
                              {formatSleepTime(rec.totalMin)}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                              {rec.cycles} циклов
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-bold block" style={{ color: "var(--mq-text)" }}>
                              {rec.wakeTime}
                            </span>
                            <span className="text-[10px] font-medium" style={{ color: rec.qualityColor }}>
                              {rec.quality}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "custom" && (
                  <div className="hidden sm:block">
                    <p className="text-xs mb-3" style={{ color: "var(--mq-text-muted)" }}>
                      Введите время в минутах (1 – 480)
                    </p>
                    <div className="flex gap-2 mb-4">
                      <input type="number" min={1} max={480} placeholder="Например: 45"
                        value={customMin} onChange={(e) => setCustomMin(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { applyCustom(); } }}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold outline-none"
                        style={{
                          backgroundColor: "var(--mq-input-bg)",
                          border: "1px solid var(--mq-border)",
                          color: "var(--mq-text)",
                        }} />
                      <motion.button whileTap={{ scale: 0.95 }} onClick={applyCustom}
                        className="px-4 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-bg)" }}>
                        Применить
                      </motion.button>
                    </div>
                    {parseInt(customMin, 10) >= 1 && parseInt(customMin, 10) <= 480 && (
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-4" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                        <div className="flex items-center gap-2">
                          <Sunrise className="w-4 h-4" style={{ color: "#fbbf24" }} />
                          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Пробуждение</span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>
                          {getWakeTimeForMinutes(parseInt(customMin, 10))}
                        </span>
                      </div>
                    )}
                    {/* Quick custom shortcuts */}
                    <div className="flex gap-2 flex-wrap">
                      {[10, 20, 45, 75, 120, 180, 240, 360].map((val) => (
                        <button key={val} onClick={() => { setSelected(val); setCustomMin(String(val)); }}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                          style={{
                            backgroundColor: selected === val ? "rgba(139,92,246,0.15)" : "var(--mq-input-bg)",
                            color: selected === val ? "#8b5cf6" : "var(--mq-text-muted)",
                            border: `1px solid ${selected === val ? "rgba(139,92,246,0.3)" : "transparent"}`,
                          }}>
                          {formatSleepTime(val)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mobile: Scroll picker + quick presets */}
                <div className="sm:hidden">
                  <SleepTimerWheel options={SLEEP_TIME_OPTIONS} selected={selected} onSelect={setSelected} />
                  <div className="flex gap-2 mt-4 flex-wrap justify-center">
                    {[15, 30, 60, 90].map((val) => (
                      <button key={val} onClick={() => setSelected(val)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: selected === val ? "var(--mq-accent)" : "var(--mq-input-bg)",
                          color: selected === val ? "var(--mq-bg)" : "var(--mq-text-muted)",
                          border: `1px solid ${selected === val ? "var(--mq-accent)" : "var(--mq-border)"}`,
                        }}>
                        {formatSleepTime(val)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start button */}
                <motion.button whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(139,92,246,0.3)" }}
                  whileTap={{ scale: 0.97 }} onClick={() => { onStart(selected); onClose(); }}
                  className="w-full mt-5 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold shadow-lg"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-bg)" }}>
                  <Play className="w-4 h-4" />
                  Начать {formatSleepTime(selected)}
                  <span className="text-xs opacity-70 ml-1">→ {getWakeTimeForMinutes(selected)}</span>
                </motion.button>
              </div>
            ) : (
              /* ═══════ ACTIVE MODE (desktop-optimized) ═══════ */
              <div className="p-5 sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
                      <Moon className="w-5 h-5" style={{ color: "#8b5cf6" }} />
                    </motion.div>
                    <div>
                      <span className="text-sm font-bold block" style={{ color: "var(--mq-text)" }}>Таймер сна</span>
                      <div className="flex items-center gap-1.5">
                        <motion.div animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
                          transition={{ duration: 1.5, repeat: Infinity }}><Star className="w-2.5 h-2.5" fill="#8b5cf6" style={{ color: "#8b5cf6" }} /></motion.div>
                        <span className="text-[11px] font-medium" style={{ color: "#8b5cf6" }}>Активен</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Timer + info side by side on desktop */}
                <div className="hidden sm:flex items-center gap-6 mb-5">
                  {/* Circular timer */}
                  <div className="relative flex-shrink-0">
                    <svg width="160" height="160" className="transform -rotate-90">
                      <circle cx="80" cy="80" r="70" fill="none" stroke="var(--mq-border)" strokeWidth="5" opacity={0.25} />
                      <circle cx="80" cy="80" r="70" fill="none" stroke="url(#stGrad)" strokeWidth="5"
                        strokeLinecap="round" strokeDasharray={2 * Math.PI * 70}
                        strokeDashoffset={2 * Math.PI * 70 * (1 - progress)}
                        className="transition-all duration-1000 ease-linear" />
                      <circle cx="80" cy="80" r="70" fill="none" stroke="url(#stGrad)" strokeWidth="2"
                        strokeLinecap="round" strokeDasharray={2 * Math.PI * 70}
                        strokeDashoffset={2 * Math.PI * 70 * (1 - progress)}
                        className="transition-all duration-1000 ease-linear"
                        style={{ filter: "blur(5px)", opacity: 0.35 }} />
                      <defs>
                        <linearGradient id="stGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="50%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                    </svg>
                    {/* Center time */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold font-mono tracking-wider" style={{ color: "var(--mq-text)", lineHeight: 1 }}>
                        {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
                      </span>
                      <span className="text-[10px] mt-1" style={{ color: "var(--mq-text-muted)" }}>осталось</span>
                    </div>
                  </div>

                  {/* Info cards */}
                  <div className="flex-1 space-y-2.5">
                    <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sunrise className="w-3 h-3" style={{ color: "#fbbf24" }} />
                        <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Пробуждение</span>
                      </div>
                      <span className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                        {getWakeTimeForMinutes(timerMinutes)}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                        <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Длительность</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                        {formatSleepTime(timerMinutes)}
                      </span>
                    </div>
                    {/* Sleep cycles info */}
                    <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Moon className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                          <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Циклы</span>
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
                          ~{Math.round(timerMinutes / SLEEP_CYCLE_MIN)} циклов
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile: Simple countdown */}
                <div className="sm:hidden flex flex-col items-center py-4">
                  <span className="text-5xl font-bold font-mono tracking-wider" style={{ color: "var(--mq-text)" }}>
                    {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
                  </span>
                  <span className="text-xs mt-2" style={{ color: "var(--mq-text-muted)" }}>осталось</span>
                </div>

                {/* Progress bar (shared) */}
                <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--mq-border)", opacity: 0.3 }}>
                  <div className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progress * 100}%`, backgroundColor: "var(--mq-accent)", boxShadow: "0 0 8px var(--mq-glow)" }} />
                </div>
                <div className="flex justify-between mb-5 sm:mb-4">
                  <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    Пробуждение: {getWakeTimeForMinutes(timerMinutes)}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    {formatSleepTime(timerMinutes)}
                  </span>
                </div>

                {/* Stop button */}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { onStop(); onClose(); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}>
                  <X className="w-4 h-4" /> Отменить таймер
                </motion.button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function FullTrackView() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    isFullTrackViewOpen, setFullTrackViewOpen, animationsEnabled,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
    similarTracks, setSimilarTracks, similarTracksLoading, setSimilarTracksLoading,
    playTrack, queue, showSimilarRequested, clearShowSimilarRequest,
    showLyricsRequested, clearShowLyricsRequest,
    sleepTimerActive, sleepTimerRemaining, sleepTimerMinutes, startSleepTimer, stopSleepTimer, updateSleepTimer,
    currentStyle, styleVariant, currentPlaylistId,
    radioMode, toggleRadioMode, releaseRadarTracks, fetchReleaseRadar, likedTracksData,
    spatialAudioEnabled, setSpatialAudioEnabled, setView,
    setSelectedArtist,
  } = useAppStore();

  const progressRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveAnimRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDNA, setShowDNA] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  // Reset playback speed when track changes
  useEffect(() => {
    setPlaybackSpeed(1.0);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = 1.0;
    const inactive = getInactiveAudio();
    if (inactive) inactive.playbackRate = 1.0;
  }, [currentTrack?.id]);

  const cyclePlaybackSpeed = () => {
    const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIdx = (currentIdx + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIdx];
    setPlaybackSpeed(nextSpeed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = nextSpeed;
    const inactive = getInactiveAudio();
    if (inactive) inactive.playbackRate = nextSpeed;
  };

  // Track mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close all local panels when navigating away from full track view
  const prevFullTrackOpenRef = useRef(isFullTrackViewOpen);
  useEffect(() => {
    if (prevFullTrackOpenRef.current && !isFullTrackViewOpen) {
      setShowSimilar(false);
      setShowLyrics(false);
      setShowSleepTimer(false);
      setShowComments(false);
      setShowDNA(false);
      setCanvasMode(false);
      setShowMoreMenu(false);
    }
    prevFullTrackOpenRef.current = isFullTrackViewOpen;
  }, [isFullTrackViewOpen]);

  const [lyricsLines, setLyricsLines] = useState<{ time: number; text: string }[]>([]);
  const [lyricsPlainText, setLyricsPlainText] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const lyricsVisCanvasRef = useRef<HTMLCanvasElement>(null);

  // Native wheel handler for volume section (fix passive listener issue)
  useEffect(() => {
    const el = volumeSectionRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -5 : 5;
      useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Handle showSimilarRequested from store
  useEffect(() => {
    if (showSimilarRequested) {
      setShowSimilar(true);
      setShowLyrics(false);
      clearShowSimilarRequest();
    }
  }, [showSimilarRequested, clearShowSimilarRequest]);

  // Handle showLyricsRequested from store
  useEffect(() => {
    if (showLyricsRequested) {
      setShowLyrics(true);
      setShowSimilar(false);
      clearShowLyricsRequest();
    }
  }, [showLyricsRequested, clearShowLyricsRequest]);

  // Fetch lyrics when lyrics panel opens or track changes
  useEffect(() => {
    if (!showLyrics || !currentTrack) return;
    const artist = currentTrack.artist;
    const title = currentTrack.title;
    if (!artist || !title) return;

    let cancelled = false;
    setLyricsLoading(true);
    setLyricsLines([]);
    setLyricsPlainText("");
    setActiveLineIndex(-1);

    fetch(`/api/music/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setLyricsLines(data.lyrics || []);
        setLyricsPlainText(data.plainText || "");
      })
      .catch(() => {
        if (!cancelled) { setLyricsLines([]); setLyricsPlainText(""); }
      })
      .finally(() => { if (!cancelled) setLyricsLoading(false); });

    return () => { cancelled = true; };
  }, [showLyrics, currentTrack?.id, currentTrack?.artist, currentTrack?.title]);

  // Sync lyrics with playback progress
  useEffect(() => {
    if (lyricsLines.length === 0 || !isPlaying) return;
    // Find the current active line
    let idx = -1;
    for (let i = lyricsLines.length - 1; i >= 0; i--) {
      if (progress >= lyricsLines[i].time) { idx = i; break; }
    }
    if (idx !== activeLineIndex) setActiveLineIndex(idx);
  }, [progress, lyricsLines, isPlaying, activeLineIndex]);

  // Auto-scroll active lyrics line into view
  useEffect(() => {
    if (activeLineRef.current && lyricsScrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex]);

  // Lyrics visualization — audio-reactive frequency bars & wave
  useEffect(() => {
    const canvas = lyricsVisCanvasRef.current;
    if (!canvas || !showLyrics) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = getAnalyser();
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    let animId: number;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;
      const cx = w / 2;
      const cy = h / 2;
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      let r = 224, g = 49, b = 49;
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        r = parseInt(accentColor.slice(1, 3), 16);
        g = parseInt(accentColor.slice(3, 5), 16);
        b = parseInt(accentColor.slice(5, 7), 16);
      }

      // Get real frequency data
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      }

      // Calculate bass, mid, treble averages from frequency data
      const bassEnd = Math.floor(bufferLength * 0.1);
      const midEnd = Math.floor(bufferLength * 0.5);
      let bassAvg = 0, midAvg = 0, trebleAvg = 0;
      let totalEnergy = 0;
      for (let i = 0; i < bufferLength; i++) {
        totalEnergy += dataArray[i];
        if (i < bassEnd) bassAvg += dataArray[i];
        else if (i < midEnd) midAvg += dataArray[i];
        else trebleAvg += dataArray[i];
      }
      bassAvg = bassAvg / Math.max(1, bassEnd);
      midAvg = midAvg / Math.max(1, midEnd - bassEnd);
      trebleAvg = trebleAvg / Math.max(1, bufferLength - midEnd);
      totalEnergy = totalEnergy / Math.max(1, bufferLength);

      const energyNorm = totalEnergy / 255; // 0..1

      // ── Layer 1: Central glow ──
      const glowRadius = Math.min(w, h) * (0.15 + energyNorm * 0.08);
      const glowAlpha = isPlaying ? (0.04 + energyNorm * 0.06) : 0.015;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glow.addColorStop(0, `rgba(${r},${g},${b},${glowAlpha})`);
      glow.addColorStop(0.5, `rgba(${r},${g},${b},${glowAlpha * 0.3})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // ── Layer 2: Radial frequency bars (circular equalizer) ──
      const barCount = 64;
      const innerRadius = Math.min(w, h) * 0.16;
      const maxBarHeight = Math.min(w, h) * 0.14;

      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const freqIndex = Math.floor((i / barCount) * bufferLength * 0.7);
        const value = dataArray[freqIndex] || 0;
        const barHeight = (value / 255) * maxBarHeight * (isPlaying ? 1 : 0.15);

        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * (innerRadius + barHeight);
        const y2 = cy + Math.sin(angle) * (innerRadius + barHeight);

        const barAlpha = isPlaying ? (0.15 + (value / 255) * 0.35) : 0.05;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${barAlpha})`;
        ctx.lineWidth = Math.max(1, (Math.PI * 2 * innerRadius) / barCount * 0.6);
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // ── Layer 3: Smooth waveform circle (time-domain wave) ──
      const waveRadius = innerRadius + maxBarHeight + 20;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const angle = (i / 360) * Math.PI * 2;
        const freqIndex = Math.floor((i / 360) * bufferLength * 0.5);
        const value = dataArray[freqIndex] || 0;
        const offset = (value / 255) * 12 * (isPlaying ? 1 : 0.1);
        // Smooth with neighbor averaging
        const prevIdx = Math.max(0, freqIndex - 2);
        const nextIdx = Math.min(bufferLength - 1, freqIndex + 2);
        const smooth = ((dataArray[prevIdx] || 0) + value + (dataArray[nextIdx] || 0)) / 3;
        const smoothOffset = (smooth / 255) * 12 * (isPlaying ? 1 : 0.1);
        const radius = waveRadius + smoothOffset;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${r},${g},${b},${isPlaying ? 0.08 : 0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── Layer 4: Floating particles reacting to bass ──
      const particleCount = 12;
      for (let i = 0; i < particleCount; i++) {
        const baseAngle = (i / particleCount) * Math.PI * 2;
        const orbitRadius = waveRadius + 30 + Math.sin(t * 0.5 + i * 1.3) * 20;
        const bassBoost = (bassAvg / 255) * 25;
        const px = cx + Math.cos(baseAngle + t * 0.2 * (i % 2 === 0 ? 1 : -1)) * (orbitRadius + bassBoost);
        const py = cy + Math.sin(baseAngle + t * 0.2 * (i % 2 === 0 ? 1 : -1)) * (orbitRadius + bassBoost);
        const size = 2 + (midAvg / 255) * 3;

        const particleGlow = ctx.createRadialGradient(px, py, 0, px, py, size * 3);
        particleGlow.addColorStop(0, `rgba(${r},${g},${b},${isPlaying ? 0.2 : 0.05})`);
        particleGlow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(px, py, size * 3, 0, Math.PI * 2);
        ctx.fillStyle = particleGlow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${isPlaying ? 0.5 : 0.1})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [showLyrics, isPlaying, currentTrack?.id]);

  // Fetch similar tracks using the smart similarity algorithm
  useEffect(() => {
    if (!currentTrack || !showSimilar) return;
    let cancelled = false;
    const fetchSimilar = async () => {
      setSimilarTracksLoading(true);
      try {
        // Build params for the similarity API
        const store = useAppStore.getState();
        const dislikedIds = store.dislikedTrackIds || [];
        const dislikedTracksData = store.dislikedTracksData || [];
        const historyData = store.history || [];

        // Collect disliked artists and genres
        const dislikedArtistsSet = new Set<string>();
        const dislikedGenresSet = new Set<string>();
        const allKnown = [...dislikedTracksData, ...historyData.slice(0, 100).map((h: any) => h.track)];
        for (const t of allKnown) {
          if (dislikedIds.includes(t.id)) {
            if (t.artist) dislikedArtistsSet.add(t.artist);
            if (t.genre) dislikedGenresSet.add(t.genre);
          }
        }

        const params = new URLSearchParams({
          title: currentTrack.title || "",
          artist: currentTrack.artist || "",
          genre: currentTrack.genre || "",
          duration: String(currentTrack.duration || 0),
          scTrackId: String(currentTrack.scTrackId || ""),
          excludeId: currentTrack.id,
          limit: "8",
          dislikedIds: dislikedIds.join(","),
          dislikedArtists: [...dislikedArtistsSet].join(","),
          dislikedGenres: [...dislikedGenresSet].join(","),
        });

        const res = await fetch(`/api/music/similar?${params}`);
        const data = await res.json();
        const tracks: Track[] = (data.tracks || []).filter((t: Track) => t.id !== currentTrack.id);

        if (!cancelled) setSimilarTracks(tracks.slice(0, 8));
      } catch {
        // Fallback to simple artist search
        try {
          const res = await fetch(`/api/music/search?q=${encodeURIComponent(currentTrack.artist)}&limit=8`);
          const data = await res.json();
          const tracks: Track[] = (data.tracks || []).filter((t: Track) => t.id !== currentTrack.id);
          if (!cancelled) setSimilarTracks(tracks.slice(0, 6));
        } catch {
          if (!cancelled) setSimilarTracks([]);
        }
      } finally {
        if (!cancelled) setSimilarTracksLoading(false);
      }
    };
    fetchSimilar();
    return () => { cancelled = true; };
  }, [currentTrack, showSimilar, setSimilarTracks, setSimilarTracksLoading]);



  // ── Ambient visualization — style-aware, composite waves ──
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !isFullTrackViewOpen) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Default waves
    const waves = [
      { segs: 50, speed: 0.5, amp: 0.18, phase: 0, yOff: 0.3, alpha: 0.25, lw: 1.2 },
      { segs: 60, speed: 0.7, amp: 0.22, phase: 1.5, yOff: 0.5, alpha: 0.35, lw: 1.5 },
      { segs: 45, speed: 0.4, amp: 0.15, phase: 3.0, yOff: 0.65, alpha: 0.2, lw: 1.0 },
      { segs: 80, speed: 1.0, amp: 0.1, phase: 4.5, yOff: 0.45, alpha: 0.12, lw: 0.8 },
      { segs: 35, speed: 0.3, amp: 0.25, phase: 2.0, yOff: 0.8, alpha: 0.18, lw: 1.3 },
    ];
    const sparkles = Array.from({ length: 30 }, () => ({
      waveIdx: Math.floor(Math.random() * waves.length),
      xFrac: Math.random(),
      size: 1 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 2.0,
    }));

    // Japan petals for wave canvas
    interface WavePetal { x: number; y: number; size: number; speed: number; sway: number; phase: number; rot: number; rotSpeed: number; opacity: number; }
    const japanPetals: WavePetal[] = Array.from({ length: 20 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1200 - 600,
      size: 3 + Math.random() * 6, speed: 0.4 + Math.random() * 0.6,
      sway: 0.3 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.02,
      opacity: 0.15 + Math.random() * 0.35,
    }));

    // Swag constellation particles for wave canvas
    interface ConstellationNode { x: number; y: number; vx: number; vy: number; size: number; angle: number; rotSpeed: number; alpha: number; pulsePhase: number; }
    const swagConstellation: ConstellationNode[] = Array.from({ length: 35 }, () => ({
      x: Math.random() * 2000, y: Math.random() * 1200,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2,
      size: 1.5 + Math.random() * 3, angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.01, alpha: 0.08 + Math.random() * 0.2,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    // iPod scan dots removed for performance (CSS handles LCD effect)

    const draw = () => {
      waveAnimRef.current = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;

      const style = currentStyle || "default";

      // ═══════════════════════════════════════════════════════════════════
      // iPod 2001 wave: LCD grid + signal waveform + scanlines
      // ═══════════════════════════════════════════════════════════════════
      if (style === "ipod-2001") {
        // Blue backlight pulse (CSS handles LCD pixel grid)
        const pulseAlpha = 0.02 + 0.015 * Math.sin(0.8 * t);
        const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.4);
        glowGrad.addColorStop(0, `rgba(42,127,255,${pulseAlpha})`);
        glowGrad.addColorStop(1, "rgba(42,127,255,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Audio waveform lines (horizontal, different frequencies)
        for (let i = 0; i < 4; i++) {
          const yBase = h * (0.15 + i * 0.1);
          const amplitude = h * (0.02 + i * 0.005) * (1 + 0.5 * Math.sin(t * 0.3 + i));
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = yBase
              + Math.sin(t * (1.2 + i * 0.25) + xn * 6 + i * 1.5) * amplitude
              + Math.cos(t * (0.6 + i * 0.15) + xn * 4) * amplitude * 0.5
              + Math.sin(t * 2 + xn * 10) * amplitude * 0.2;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(42,127,255,${0.06 + (1 - i / 4) * 0.08})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Vertical scanline sweep
        const sweepX = (t * 0.08 % 1) * w;
        ctx.fillStyle = "rgba(42,127,255,0.03)";
        ctx.fillRect(sweepX - 2, 0, 4, h);

        // Bottom progress indicator
        const timeProgress = (t * 0.1) % 1;
        ctx.fillStyle = "rgba(42,127,255,0.06)";
        ctx.fillRect(w * 0.1, h * 0.94, w * 0.8, 2);
        ctx.fillStyle = "rgba(42,127,255,0.2)";
        ctx.fillRect(w * 0.1, h * 0.94, w * 0.8 * timeProgress, 2);

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Japan wave: ink wash waves + cherry blossom petals + koi
      // ═══════════════════════════════════════════════════════════════════
      if (style === "japan") {
        // Subtle vermillion radial glow
        const jpPulse = 0.02 + 0.015 * Math.sin(0.4 * t);
        const jpGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.3);
        jpGrad.addColorStop(0, `rgba(139,34,82,${jpPulse})`);
        jpGrad.addColorStop(1, "rgba(139,34,82,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = jpGrad;
        ctx.fill();

        // Three-layered ink wash waves
        for (let layer = 0; layer < 3; layer++) {
          const yBase = h * (0.55 + layer * 0.12);
          const speed = 0.3 + layer * 0.15;
          const freq = 0.004 + layer * 0.002;
          const alpha = 0.04 - layer * 0.01;

          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 3) {
            const y = yBase
              + Math.sin(t * speed + x * freq + layer) * h * 0.08
              + Math.sin(t * speed * 1.5 + x * freq * 2.5) * h * 0.03;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          const waveGrad = ctx.createLinearGradient(0, yBase - h * 0.1, 0, h);
          waveGrad.addColorStop(0, `rgba(139,34,82,${alpha})`);
          waveGrad.addColorStop(1, `rgba(139,34,82,${alpha * 0.2})`);
          ctx.fillStyle = waveGrad;
          ctx.fill();
        }

        // Red accent wave line (crisp)
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = h * 0.5 + Math.sin(t * 0.5 + x * 0.005) * h * 0.1
            + Math.sin(t * 0.8 + x * 0.012) * h * 0.05;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(139,34,82,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Koi fish silhouettes (2 fish)
        for (let k = 0; k < 2; k++) {
          const kx = w * (0.3 + k * 0.4) + Math.sin(t * 0.2 + k * 3) * w * 0.1;
          const ky = h * (0.4 + k * 0.15) + Math.sin(t * 0.15 + k * 2) * h * 0.08;
          const kAngle = Math.sin(t * 0.2 + k * 3) * 0.3;
          const kSize = 12 + k * 4;

          ctx.save();
          ctx.translate(kx, ky);
          ctx.rotate(kAngle);
          ctx.globalAlpha = 0.06 + k * 0.02;
          ctx.fillStyle = k === 0 ? "rgba(139,34,82,0.4)" : "rgba(255,120,100,0.3)";

          // Fish body (ellipse)
          ctx.beginPath();
          ctx.ellipse(0, 0, kSize * 1.5, kSize * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tail
          ctx.beginPath();
          ctx.moveTo(-kSize * 1.3, 0);
          ctx.lineTo(-kSize * 2.2, -kSize * 0.6);
          ctx.lineTo(-kSize * 2.2, kSize * 0.6);
          ctx.closePath();
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Cherry blossom petals (more varied)
        for (const p of japanPetals) {
          p.y += p.speed;
          p.x += Math.sin(t * p.sway + p.phase) * 0.5;
          p.rot += p.rotSpeed;
          if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
          if (p.x < -30) p.x = w + 15;
          if (p.x > w + 30) p.x = -15;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.opacity;

          ctx.fillStyle = "rgba(232,180,188,0.5)";
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(245,210,215,0.3)";
          ctx.beginPath();
          ctx.ellipse(p.size * 0.3, 0, p.size * 0.5, p.size * 0.3, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Floating kanji (right side, vertical)
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#1a1a1a";
        ctx.font = "16px serif";
        ctx.textAlign = "center";
        const chars = ["\u97f3", "\u697d", "\u98a8", "\u6708"];
        chars.forEach((ch, i) => {
          const cy = h * 0.2 + i * 28 + Math.sin(t * 0.3 + i) * 3;
          ctx.fillText(ch, w - 20, cy);
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Swag wave: Plasma Drift — flowing waves + chrome orbs + energy lines
      // ═══════════════════════════════════════════════════════════════════
      if (style === "swag") {
        // Deep black bg with subtle silver radial pulse
        const swPulse = 0.012 + 0.008 * Math.sin(0.35 * t);
        const swGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.4);
        swGrad.addColorStop(0, `rgba(176,176,184,${swPulse})`);
        swGrad.addColorStop(1, "rgba(176,176,184,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = swGrad;
        ctx.fill();

        // 6 flowing horizontal sine-composite wave lines
        const plasmaWaves = [
          { speed: 0.3, ampBase: 0.015, yOff: 0.15, alpha: 0.02, freq1: 2.5, freq2: 5.2 },
          { speed: 0.45, ampBase: 0.02, yOff: 0.3, alpha: 0.03, freq1: 3.0, freq2: 6.0 },
          { speed: 0.2, ampBase: 0.012, yOff: 0.45, alpha: 0.025, freq1: 2.0, freq2: 4.5 },
          { speed: 0.55, ampBase: 0.025, yOff: 0.58, alpha: 0.04, freq1: 3.5, freq2: 7.0 },
          { speed: 0.35, ampBase: 0.018, yOff: 0.72, alpha: 0.03, freq1: 2.8, freq2: 5.8 },
          { speed: 0.5, ampBase: 0.022, yOff: 0.88, alpha: 0.035, freq1: 3.2, freq2: 6.5 },
        ];
        for (const pw of plasmaWaves) {
          const ampMul = isPlaying ? 2.5 : 1;
          const amp = h * pw.ampBase * ampMul;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = pw.yOff * h
              + Math.sin(t * pw.speed + xn * pw.freq1 * Math.PI) * amp
              + Math.sin(t * pw.speed * 1.6 + xn * pw.freq2 * Math.PI) * amp * 0.4
              + Math.cos(t * pw.speed * 0.7 + xn * 2) * amp * 0.2;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(176,176,184,${pw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 15 floating chrome orbs drifting slowly upward
        const orbCount = 15;
        for (let oi = 0; oi < orbCount; oi++) {
          const orbX = w * ((oi * 0.618 + t * 0.008 * (0.3 + oi * 0.04)) % 1);
          const orbY = h - ((t * (0.02 + oi * 0.005) + oi * 0.07) % 1) * h;
          const orbR = 2 + (oi % 4);
          const orbAlpha = 0.03 + 0.05 * Math.sin(t * 0.5 + oi * 1.7);
          const orbGrad = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbR);
          orbGrad.addColorStop(0, `rgba(208,208,216,${orbAlpha})`);
          orbGrad.addColorStop(1, `rgba(176,176,184,0)`);
          ctx.beginPath();
          ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
          ctx.fillStyle = orbGrad;
          ctx.fill();
        }

        // 8 thin vertical gradient energy lines drifting horizontally
        for (let ei = 0; ei < 8; ei++) {
          const eX = w * ((ei * 0.125 + t * 0.006 * (0.5 + ei * 0.1)) % 1);
          const eY = h * (0.15 + ei * 0.1);
          const eH = 40 + (ei % 3) * 20;
          const eAlpha = 0.015 + 0.015 * Math.sin(t * 0.4 + ei * 2);
          const eGrad = ctx.createLinearGradient(eX, eY, eX, eY + eH);
          eGrad.addColorStop(0, `rgba(176,176,184,0)`);
          eGrad.addColorStop(0.3, `rgba(176,176,184,${eAlpha})`);
          eGrad.addColorStop(0.7, `rgba(176,176,184,${eAlpha})`);
          eGrad.addColorStop(1, `rgba(176,176,184,0)`);
          ctx.fillStyle = eGrad;
          ctx.fillRect(eX - 0.5, eY, 1, eH);
        }

        // Constellation nodes — simple circles (cheaper than hexagons)
        for (const node of swagConstellation) {
          node.x += node.vx;
          node.y += node.vy;
          node.angle += node.rotSpeed;
          // Wrap around
          if (node.x < -20) node.x = w + 20;
          if (node.x > w + 20) node.x = -20;
          if (node.y < -20) node.y = h + 20;
          if (node.y > h + 20) node.y = -20;

          const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + node.pulsePhase);
          const a = node.alpha * pulse;

          // Simple circle node
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(208,208,216,${a * 0.5})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(176,176,184,${a})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Constellation lines between nearby nodes (<100px)
        for (let i = 0; i < swagConstellation.length; i++) {
          for (let j = i + 1; j < swagConstellation.length; j++) {
            const dx = swagConstellation[i].x - swagConstellation[j].x;
            const dy = swagConstellation[i].y - swagConstellation[j].y;
            const distSq = dx * dx + dy * dy;
            const maxDist = 100;
            if (distSq < maxDist * maxDist) {
              const dist = Math.sqrt(distSq);
              const lineAlpha = (1 - dist / maxDist) * 0.03;
              ctx.beginPath();
              ctx.moveTo(swagConstellation[i].x, swagConstellation[i].y);
              ctx.lineTo(swagConstellation[j].x, swagConstellation[j].y);
              ctx.strokeStyle = `rgba(176,176,184,${lineAlpha})`;
              ctx.lineWidth = 0.3;
              ctx.stroke();
            }
          }
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Neon wave: Neon Pulse — green radial pulse + neon wave lines + dots + scan
      // ═══════════════════════════════════════════════════════════════════
      if (style === "neon") {
        // Subtle green radial pulse
        const neonPulse = 0.015 + 0.01 * Math.sin(0.4 * t);
        const neonGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.35);
        neonGrad.addColorStop(0, `rgba(0,255,136,${neonPulse})`);
        neonGrad.addColorStop(1, "rgba(0,255,136,0)");
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.max(w, h) * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = neonGrad;
        ctx.fill();

        // 4 horizontal neon wave lines at low alpha
        const neonWaves = [
          { speed: 0.25, ampBase: 0.012, yOff: 0.2, alpha: 0.03, freq: 2.5 },
          { speed: 0.4, ampBase: 0.018, yOff: 0.38, alpha: 0.05, freq: 3.2 },
          { speed: 0.3, ampBase: 0.014, yOff: 0.6, alpha: 0.04, freq: 2.8 },
          { speed: 0.5, ampBase: 0.02, yOff: 0.8, alpha: 0.06, freq: 3.8 },
        ];
        for (const nw of neonWaves) {
          const ampMul = isPlaying ? 2 : 1;
          const amp = h * nw.ampBase * ampMul;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const xn = x / w;
            const y = nw.yOff * h
              + Math.sin(t * nw.speed + xn * nw.freq * Math.PI) * amp
              + Math.sin(t * nw.speed * 1.6 + xn * nw.freq * 1.5 * Math.PI) * amp * 0.3;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(0,255,136,${nw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 12 floating neon dots that drift slowly
        for (let di = 0; di < 12; di++) {
          const dx = w * ((di * 0.618 + t * 0.006 * (0.3 + di * 0.04)) % 1);
          const dy = h * (0.1 + ((di * 0.381 + t * 0.004 * (0.2 + di * 0.03)) % 0.8));
          const dSize = 2 + (di % 3);
          const dAlpha = 0.02 + 0.03 * Math.sin(t * 0.5 + di * 1.7);
          const color = di % 3 === 0 ? `rgba(255,0,102,${dAlpha})` : `rgba(0,255,136,${dAlpha})`;
          const gGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dSize * 2);
          if (di % 3 === 0) {
            gGrad.addColorStop(0, `rgba(255,0,102,${dAlpha})`);
            gGrad.addColorStop(1, "rgba(255,0,102,0)");
          } else {
            gGrad.addColorStop(0, `rgba(0,255,136,${dAlpha})`);
            gGrad.addColorStop(1, "rgba(0,255,136,0)");
          }
          ctx.fillStyle = gGrad;
          ctx.beginPath();
          ctx.arc(dx, dy, dSize * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dx, dy, dSize * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Occasional vertical scan line that sweeps across
        const sweepX = ((t * 0.06) % 1) * w;
        const scanGrad = ctx.createLinearGradient(sweepX - 2, 0, sweepX + 2, 0);
        scanGrad.addColorStop(0, "rgba(0,255,136,0)");
        scanGrad.addColorStop(0.5, "rgba(0,255,136,0.04)");
        scanGrad.addColorStop(1, "rgba(0,255,136,0)");
        ctx.fillStyle = scanGrad;
        ctx.fillRect(sweepX - 3, 0, 6, h);

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Minimal wave: Minimal Drift — light bg + 2 sine waves + 6 dots
      // ═══════════════════════════════════════════════════════════════════
      if (style === "minimal") {
        // 2 horizontal sine wave lines at very low alpha
        const minWaves = [
          { speed: 0.2, ampBase: 0.008, yOff: 0.35, alpha: 0.04, freq: 1.8 },
          { speed: 0.35, ampBase: 0.01, yOff: 0.65, alpha: 0.05, freq: 2.5 },
        ];
        for (const mw of minWaves) {
          const amp = h * mw.ampBase;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const xn = x / w;
            const y = mw.yOff * h
              + Math.sin(t * mw.speed + xn * mw.freq * Math.PI) * amp;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(17,17,17,${mw.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 6 small dots that drift slowly
        for (let mi = 0; mi < 6; mi++) {
          const mx = w * ((mi * 0.618 + t * 0.005 * (0.2 + mi * 0.03)) % 1);
          const my = h * (0.15 + ((mi * 0.381 + t * 0.003 * (0.15 + mi * 0.02)) % 0.7));
          const mSize = 1.5 + (mi % 2);
          const mAlpha = 0.06 + 0.04 * Math.sin(t * 0.4 + mi * 1.5);
          ctx.beginPath();
          ctx.arc(mx, my, mSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(17,17,17,${mAlpha})`;
          ctx.fill();
        }

        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Default: aurora/nebula waves + floating sparkles + energy trails
      // ═══════════════════════════════════════════════════════════════════
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      let r = 224, g = 49, b = 49;
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        r = parseInt(accentColor.slice(1, 3), 16);
        g = parseInt(accentColor.slice(3, 5), 16);
        b = parseInt(accentColor.slice(5, 7), 16);
      }

      // Central radial glow pulse — larger, more nebula-like
      const pulseAlpha = 0.05 + 0.04 * Math.sin(0.6 * t);
      const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.45);
      glowGrad.addColorStop(0, `rgba(${r},${g},${b},${pulseAlpha})`);
      glowGrad.addColorStop(0.5, `rgba(${r},${g},${b},${pulseAlpha * 0.3})`);
      glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.45, Math.max(w, h) * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Aurora-style gradient waves (thicker, more layered)
      for (const wave of waves) {
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < wave.segs; i++) {
          const x = (i / (wave.segs - 1)) * w;
          const xn = i / (wave.segs - 1);
          const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
            + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
            + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
          const y = wave.yOff * h - yNorm * wave.amp * h;
          points.push({ x, y });
        }

        // Thick glow layer
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha * 0.2})`;
        ctx.lineWidth = wave.lw + 8;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Main line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${wave.alpha})`;
        ctx.lineWidth = wave.lw;
        ctx.lineJoin = "bevel";
        ctx.lineCap = "round";
        ctx.stroke();

        // Gradient fill below wave
        const gradient = ctx.createLinearGradient(0, (wave.yOff - wave.amp) * h, 0, h);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${wave.alpha * 0.06})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Energy trails — flowing vertical particles
      const trailCount = 15;
      for (let i = 0; i < trailCount; i++) {
        const tx = w * ((i * 0.618 + t * 0.01) % 1);
        const trailLen = h * 0.15 + h * 0.1 * Math.sin(t * 0.5 + i * 2);
        const ty = h * 0.2 + Math.sin(t * 0.3 + i) * h * 0.3;
        const trailAlpha = 0.03 + 0.02 * Math.sin(t + i * 1.5);

        const trailGrad = ctx.createLinearGradient(tx, ty, tx, ty + trailLen);
        trailGrad.addColorStop(0, `rgba(${r},${g},${b},${trailAlpha})`);
        trailGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = trailGrad;
        ctx.fillRect(tx - 0.5, ty, 1, trailLen);
      }

      // Floating sparkles on waves
      for (const sp of sparkles) {
        const wave = waves[sp.waveIdx];
        const xn = sp.xFrac;
        const yNorm = 0.6 * Math.sin(t * wave.speed + wave.phase + 0.7 * xn * Math.PI * 2)
          + 0.3 * Math.sin(t * wave.speed * 1.7 + 0.5 * wave.phase + 1.3 * xn * Math.PI * 2)
          + 0.1 * Math.cos(t * wave.speed * 0.5 + 2.1 * xn * Math.PI * 2);
        const px = xn * w;
        const py = wave.yOff * h - yNorm * wave.amp * h;
        const tw = 0.2 + 0.8 * Math.pow(Math.sin(t * sp.twinkle + sp.phase), 2);
        const alpha = tw * 0.6;
        const size = sp.size * (0.5 + tw * 0.5);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }
    };
    draw();
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); };
  }, [isFullTrackViewOpen, currentTrack?.id, currentStyle]);

  // Fetch release radar when component mounts and liked tracks are available
  useEffect(() => {
    if (likedTracksData.length > 0 && releaseRadarTracks.length === 0) {
      fetchReleaseRadar();
    }
  }, [likedTracksData.length]);

  // ── Sleep timer ──────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimerActive) return;
    const interval = setInterval(updateSleepTimer, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerActive, updateSleepTimer]);

  // Progress drag
  const seekToPosition = useCallback((clientX: number) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setProgress(pct * duration);
    const audio = getAudioElement();
    if (audio) audio.currentTime = pct * duration;
  }, [duration, setProgress]);

  const handleSliderChange = useCallback((value: number[]) => {
    if (!duration) return;
    const newTime = value[0];
    setProgress(newTime);
    const audio = getAudioElement();
    if (audio) audio.currentTime = newTime;
  }, [duration, setProgress]);

  const handleSliderCommit = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSliderHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current || !duration) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(pct * duration);
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    seekToPosition(e.clientX);
    const handleMouseMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [seekToPosition]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekToPosition(e.touches[0].clientX);
    const handleTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekToPosition(ev.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setIsDragging(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [seekToPosition]);

  const handleVolumeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setVolume(Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100))));
  }, [setVolume]);

  // Download track via fetch+blob
  const handleDownload = useCallback(async () => {
    const track = useAppStore.getState().currentTrack;
    if (!track) return;
    const audio = getAudioElement();
    if (audio && audio.src) {
      try {
        const res = await fetch(audio.src);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.artist} - ${track.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        const a = document.createElement('a');
        a.href = audio.src;
        a.download = `${track.artist} - ${track.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
  }, []);

  if (!currentTrack || !isFullTrackViewOpen) return null;

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const safeLikedIds = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const safeDislikedIds = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const isLiked = currentTrack ? safeLikedIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? safeDislikedIds.includes(currentTrack.id) : false;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }}
        exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }}
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ backgroundColor: "var(--mq-bg)" }}
      >
        {/* Wave line visualization canvas — behind everything */}
        <canvas
          ref={waveCanvasRef}
          className="absolute inset-0 z-[1] w-full h-full pointer-events-none"
          style={{ opacity: isPlaying ? 0.7 : 0.15, transition: "opacity 0.5s" }}
        />

        {/* Interactive DNA Helix — now embedded in SongDNA panel */}

        {/* Blurred background */}
        <div className="absolute inset-0 z-0" style={{ pointerEvents: "none" }}>
          {currentPlaylistId ? (
            <>
              <PlaylistArtwork
                playlistId={currentPlaylistId}
                size={400}
                rounded="rounded-none"
                className="!w-[150%] !h-[150%] !-top-[25%] !-left-[25%]"
                animated={true}
                isPlaying={isPlaying}
              />
              <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.7 }} />
            </>
          ) : (
            <>
              {currentTrack.cover && (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover blur-3xl opacity-20 scale-110" />
              )}
              <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.85 }} />
            </>
          )}
        </div>

        {/* Canvas visualization (full-screen background) */}
        {canvasMode && (
          <TrackCanvas isActive={canvasMode} isPlaying={isPlaying} currentStyle={currentStyle} styleVariant={styleVariant} />
        )}

        {/* Header — simplified: back + badge + more */}
        <div className="relative z-10 flex items-center justify-between p-4">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setFullTrackViewOpen(false); setShowSimilar(false); setShowLyrics(false); setShowSleepTimer(false); setShowComments(false); setShowDNA(false); setCanvasMode(false); setShowMoreMenu(false); }}
            className="p-2" style={{ color: "var(--mq-text)" }}>
            <ChevronLeft className="w-6 h-6" />
          </motion.button>
          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
            Сейчас играет
          </span>
          {/* Desktop-only header more button (mobile uses the one in secondary actions row) */}
          <div className="relative hidden sm:block">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2" style={{ color: "var(--mq-text-muted)" }}>
              <MoreVertical className="w-5 h-5" />
            </motion.button>
            <AnimatePresence>
              {showMoreMenu && !isMobile && (
                <>
                  <div className="fixed inset-0 z-[150]" onClick={() => setShowMoreMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 top-10 z-[160] w-52 rounded-2xl shadow-2xl overflow-hidden"
                    style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
                  >
                    <div className="py-1">
                      {[
                        { icon: FileText, label: "Текст песни", active: showLyrics, action: () => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                        { icon: ListMusic, label: "Похожие треки", active: showSimilar, action: () => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                        { icon: Dna, label: "ДНК трека", active: showDNA, action: () => { setShowDNA(!showDNA); setShowSimilar(false); setShowLyrics(false); setShowComments(false); setShowMoreMenu(false); } },
                        { icon: MessageSquare, label: "Комментарии", active: showComments, action: () => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); setShowDNA(false); setShowMoreMenu(false); } },
                        { icon: Moon, label: sleepTimerActive ? "Таймер сна вкл" : "Таймер сна", active: sleepTimerActive, action: () => { setShowSleepTimer(true); setShowMoreMenu(false); } },
                        { icon: Sparkles, label: "Canvas режим", active: canvasMode, action: () => { setCanvasMode(!canvasMode); setShowMoreMenu(false); } },
                        { icon: Headphones, label: "Spatial Audio", active: spatialAudioEnabled, action: () => { setSpatialAudioEnabled(!spatialAudioEnabled); setShowMoreMenu(false); } },
                        { icon: Waves, label: radioMode ? "Волна вкл" : "Радио режим", active: radioMode, action: () => { toggleRadioMode(); setShowMoreMenu(false); } },
                        { icon: Gauge, label: `Скорость ${playbackSpeed.toFixed(1)}x`, active: playbackSpeed !== 1.0, action: () => { cyclePlaybackSpeed(); setShowMoreMenu(false); } },
                        { icon: Download, label: "Скачать", active: false, action: () => { handleDownload(); setShowMoreMenu(false); } },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.label}
                            onClick={item.action}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-opacity"
                            style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)" }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          {/* Spacer on mobile to keep header layout */}
          <div className="sm:hidden w-9" />
        </div>

        {/* Mobile bottom sheet for "more" menu */}
        <AnimatePresence>
          {showMoreMenu && isMobile && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[150] bg-black/50"
                onClick={() => setShowMoreMenu(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[160] rounded-t-2xl shadow-2xl max-h-[70vh] overflow-hidden"
                style={{ backgroundColor: "var(--mq-card)", borderTop: "1px solid var(--mq-border)" }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--mq-border)" }} />
                </div>
                <div className="px-2 pb-4 pt-1 overflow-y-auto" style={{ maxHeight: "calc(70vh - 2rem)" }}>
                  {[
                    { icon: FileText, label: "Текст песни", active: showLyrics, action: () => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                    { icon: ListMusic, label: "Похожие треки", active: showSimilar, action: () => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                    { icon: Dna, label: "ДНК трека", active: showDNA, action: () => { setShowDNA(!showDNA); setShowSimilar(false); setShowLyrics(false); setShowComments(false); setShowMoreMenu(false); } },
                    { icon: MessageSquare, label: "Комментарии", active: showComments, action: () => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); setShowDNA(false); setShowMoreMenu(false); } },
                    { icon: Moon, label: sleepTimerActive ? "Таймер сна вкл" : "Таймер сна", active: sleepTimerActive, action: () => { setShowSleepTimer(true); setShowMoreMenu(false); } },
                    { icon: Sparkles, label: "Canvas режим", active: canvasMode, action: () => { setCanvasMode(!canvasMode); setShowMoreMenu(false); } },
                    { icon: Headphones, label: "Spatial Audio", active: spatialAudioEnabled, action: () => { setSpatialAudioEnabled(!spatialAudioEnabled); setShowMoreMenu(false); } },
                    { icon: Waves, label: radioMode ? "Волна вкл" : "Радио режим", active: radioMode, action: () => { toggleRadioMode(); setShowMoreMenu(false); } },
                    { icon: Gauge, label: `Скорость ${playbackSpeed.toFixed(1)}x`, active: playbackSpeed !== 1.0, action: () => { cyclePlaybackSpeed(); setShowMoreMenu(false); } },
                    { icon: Download, label: "Скачать", active: false, action: () => { handleDownload(); setShowMoreMenu(false); } },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 text-sm text-left cursor-pointer active:opacity-70 transition-colors rounded-xl"
                        style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)" }}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 max-w-lg mx-auto w-full">
          {/* Album art — hidden when canvas mode is active */}
          {!canvasMode && (
            <motion.div
              initial={animationsEnabled ? { scale: 0.8, opacity: 0 } : undefined}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mb-3 sm:mb-5 flex items-center justify-center"
            >
              <div className="w-36 h-36 sm:w-52 sm:h-52 lg:w-72 lg:h-72 rounded-2xl overflow-hidden shadow-2xl relative z-10"
                style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                {currentPlaylistId ? (
                  <PlaylistArtwork
                    playlistId={currentPlaylistId}
                    size={320}
                    rounded="rounded-none"
                    className="!w-full !h-full"
                    animated={true}
                    isPlaying={isPlaying}
                  />
                ) : (
                  <img src={currentTrack.cover} alt={currentTrack.album} className="w-full h-full object-cover" />
                )}
              </div>
            </motion.div>
          )}
          {/* Invisible spacer to keep layout stable when canvas hides album art */}
          {canvasMode && <div className="mb-8" style={{ height: "clamp(14rem, 40vh, 20rem)" }} />}

          {/* Track info — always visible, never truncated on important info */}
          <div className="text-center mb-2 sm:mb-4 w-full px-2">
            <h2 className="text-lg sm:text-xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
              {currentTrack.title}
            </h2>
            <button
              className="text-sm mb-0.5 cursor-pointer hover:underline transition-colors"
              style={{ color: "var(--mq-text-muted)", background: "none", border: "none", padding: 0, font: "inherit" }}
              onClick={(e) => {
                e.stopPropagation();
                setFullTrackViewOpen(false);
                setShowSimilar(false);
                setShowLyrics(false);
                setShowSleepTimer(false);
                setShowComments(false);
                setShowDNA(false);
                setCanvasMode(false);
                setShowMoreMenu(false);
                setSelectedArtist({ name: currentTrack.artist, avatar: currentTrack.cover });
              }}
            >
              {currentTrack.artist}
            </button>
            <p className="text-xs" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
              {currentTrack.album}
            </p>
          </div>

          {/* Progress bar — interactive Shadcn Slider */}
          <div className="w-full mb-3 sm:mb-4">
            <div ref={sliderRef} onMouseMove={handleSliderHover} onMouseLeave={() => setHoverTime(null)} className="relative group">
              <Slider
                value={[progress]}
                min={0}
                max={duration || 100}
                step={0.1}
                onPointerDown={() => setIsDragging(true)}
                onValueChange={handleSliderChange}
                onValueCommit={handleSliderCommit}
                className="w-full [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-[var(--mq-border)] [&_[data-slot=slider-range]]:bg-[var(--mq-accent)] [&_[data-slot=slider-range]]:shadow-[0_0_8px_var(--mq-glow)] [&_[data-slot=slider-thumb]]:opacity-0 group-hover:[&_[data-slot=slider-thumb]]:opacity-100 [&_[data-slot=slider-thumb]]:transition-opacity [&_[data-slot=slider-thumb]]:duration-200 [&_[data-slot=slider-thumb]]:bg-[var(--mq-accent)] [&_[data-slot=slider-thumb]]:shadow-[0_0_8px_var(--mq-glow)] [&_[data-slot=slider-thumb]]:border-[var(--mq-accent)] [&_[data-slot=slider-thumb]]:w-4 [&_[data-slot=slider-thumb]]:h-4 [&_[data-slot=slider-thumb]]:border-0"
              />
              {hoverTime !== null && !isDragging && (
                <div className="absolute -top-8 pointer-events-none px-2 py-1 rounded text-xs font-mono"
                  style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)",
                    left: `${(hoverTime / (duration || 1)) * 100}%`, transform: "translateX(-50%)" }}>
                  {formatDuration(Math.floor(hoverTime))}
                </div>
              )}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs tabular-nums" style={{ color: isDragging ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{formatDuration(Math.floor(progress))}</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--mq-text-muted)" }}>-{formatDuration(Math.floor(Math.max(0, duration - progress)))}</span>
            </div>
          </div>

          {/* Secondary actions row: like, dislike, more on mobile */}
          <div className="flex items-center justify-center gap-3 mb-2 sm:mb-3">
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => currentTrack && toggleLike(currentTrack.id, currentTrack)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isLiked ? "rgba(239,68,68,0.15)" : "var(--mq-card)",
                border: `1px solid ${isLiked ? "rgba(239,68,68,0.4)" : "var(--mq-border)"}`,
                color: isLiked ? "#ef4444" : "var(--mq-text-muted)",
              }}>
              <Heart className={`w-[18px] h-[18px] ${isLiked ? "fill-current" : ""}`} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => currentTrack && toggleDislike(currentTrack.id, currentTrack)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "var(--mq-card)",
                border: `1px solid ${isDisliked ? "rgba(239,68,68,0.4)" : "var(--mq-border)"}`,
                color: isDisliked ? "#ef4444" : "var(--mq-text-muted)",
              }}>
              <ThumbsDown className={`w-[18px] h-[18px] ${isDisliked ? "fill-current" : ""}`} />
            </motion.button>
            {/* Sleep Timer Button - always visible on all screen sizes */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowSleepTimer(true)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center relative"
              style={{
                backgroundColor: sleepTimerActive ? "rgba(139,92,246,0.15)" : "var(--mq-card)",
                border: `1px solid ${sleepTimerActive ? "rgba(139,92,246,0.4)" : "var(--mq-border)"}`,
                color: sleepTimerActive ? "#8b5cf6" : "var(--mq-text-muted)",
                touchAction: "manipulation",
              }}>
              <Moon className="w-[18px] h-[18px]" />
              {sleepTimerActive && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
              )}
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center sm:hidden"
              style={{
                backgroundColor: showMoreMenu ? "var(--mq-accent)" : "var(--mq-card)",
                border: `1px solid ${showMoreMenu ? "var(--mq-accent)" : "var(--mq-border)"}`,
                color: showMoreMenu ? "var(--mq-text)" : "var(--mq-text-muted)",
                boxShadow: showMoreMenu ? "0 0 12px var(--mq-glow)" : "none",
              }}>
              <MoreVertical className="w-[18px] h-[18px]" />
            </motion.button>
            {/* Mobile volume toggle */}
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setVolume(volume > 0 ? 0 : 70)}
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center sm:hidden"
              style={{
                backgroundColor: volume === 0 ? "var(--mq-accent)" : "var(--mq-card)",
                border: `1px solid ${volume === 0 ? "var(--mq-accent)" : "var(--mq-border)"}`,
                color: volume === 0 ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}>
              {volume === 0 ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
            </motion.button>
          </div>

          {/* Desktop-only secondary actions — removed, accessible via header more menu */}

          {/* Sleep Timer Popover — rendered outside desktop-only section so it works on mobile too */}
          <SleepTimerPopover
            show={showSleepTimer}
            onClose={() => setShowSleepTimer(false)}
            active={sleepTimerActive}
            remaining={sleepTimerRemaining}
            timerMinutes={sleepTimerMinutes}
            onStart={startSleepTimer}
            onStop={stopSleepTimer}
          />

          {/* Main playback controls */}
          <div className="flex items-center gap-4 sm:gap-6 mb-2 sm:mb-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle}
              style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              <Shuffle className="w-5 h-5" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={prevTrack} style={{ color: "var(--mq-text)" }}>
              <SkipBack className="w-6 h-6" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={togglePlay}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", boxShadow: isPlaying ? "0 0 30px var(--mq-glow)" : "none" }}>
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={nextTrack} style={{ color: "var(--mq-text)" }}>
              <SkipForward className="w-6 h-6" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat}
              style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
              {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </motion.button>
          </div>

          {/* Volume slider — scroll-safe, hidden on very small screens */}
          <div
            ref={volumeSectionRef}
            className="flex items-center gap-3 w-full max-w-xs hidden sm:flex"
          >
            <div ref={volumeRef} onClick={handleVolumeClick}
              className="flex-1 h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: "var(--mq-border)" }}>
              <div className="h-full rounded-full" style={{ width: `${volume}%`, backgroundColor: "var(--mq-accent)" }} />
            </div>
            <span className="text-[10px] w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span>
          </div>
        </div>

        {/* Immersive Lyrics Panel */}
        <AnimatePresence>
          {showLyrics && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-50 flex flex-col"
              style={{ backgroundColor: "var(--mq-bg)" }}
            >
              {/* Background blur + gradient */}
              <div className="absolute inset-0 z-0 pointer-events-none">
                {currentTrack.cover && (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover blur-[80px] opacity-20 scale-125" />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, var(--mq-bg) 0%, transparent 30%, transparent 70%, var(--mq-bg) 100%)", opacity: 0.9 }} />
                <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.6 }} />
              </div>

              {/* Visualization canvas behind lyrics */}
              <canvas
                ref={lyricsVisCanvasRef}
                className="absolute inset-0 z-[1] pointer-events-none w-full h-full"
                style={{ opacity: isPlaying ? 0.5 : 0.15, transition: "opacity 0.5s" }}
              />

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                  <p className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                </div>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowLyrics(false)}
                  className="p-2 rounded-full" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                  <X className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
                </motion.button>
              </div>

              {/* Lyrics content */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden">
                {lyricsLoading ? (
                  <div className="px-8 py-12 space-y-4 w-full max-w-md">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-5 rounded-full animate-pulse mx-auto" style={{ backgroundColor: "var(--mq-input-bg)", width: `${40 + Math.random() * 50}%` }} />
                    ))}
                  </div>
                ) : lyricsLines.length > 0 ? (
                  <div ref={lyricsScrollRef} className="w-full max-w-lg px-6 overflow-y-auto" style={{ maxHeight: "70vh", scrollbarWidth: "none" }}>
                    <div className="py-16 flex flex-col items-center gap-2">
                      {lyricsLines.map((line, i) => (
                        <motion.p
                          key={i}
                          ref={activeLineIndex === i ? activeLineRef : undefined}
                          className="text-center cursor-pointer transition-all duration-500 py-1 px-4 rounded-xl leading-relaxed"
                          style={{
                            fontSize: activeLineIndex === i ? "1.5rem" : "1rem",
                            fontWeight: activeLineIndex === i ? 700 : 400,
                            color: activeLineIndex === i ? "var(--mq-accent)" :
                              i < activeLineIndex ? "var(--mq-text-muted)" : "rgba(128,128,128,0.35)",
                            opacity: activeLineIndex === i ? 1 : (i < activeLineIndex ? 0.4 : 0.25),
                            transform: activeLineIndex === i ? "scale(1.05)" : "scale(1)",
                            textShadow: activeLineIndex === i ? "0 0 30px var(--mq-glow)" : "none",
                            maxWidth: "100%",
                          }}
                          onClick={() => {
                            const audio = getAudioElement();
                            if (audio) { audio.currentTime = line.time; setProgress(line.time); }
                          }}
                        >
                          {line.text || "\u266A"}
                        </motion.p>
                      ))}
                    </div>
                  </div>
                ) : lyricsPlainText ? (
                  <div className="overflow-y-auto px-8 py-12 whitespace-pre-line text-center" style={{ maxHeight: "70vh" }}>
                    {lyricsPlainText.split("\n").map((line, i) => (
                      <p key={i} className="py-1 text-base leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Mic2 className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.2 }} />
                    <p className="text-base font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
                      Текст не найден автоматически
                    </p>
                    <p className="text-xs mb-6" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
                      Попробуйте найти текст на одном из сервисов
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <motion.button whileTap={{ scale: 0.95 }}
                        onClick={() => window.open(`https://genius.com/search?q=${encodeURIComponent((currentTrack?.title || "") + " " + (currentTrack?.artist || ""))}`, "_blank")}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                        <ExternalLink className="w-3.5 h-3.5" /> Genius
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.95 }}
                        onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((currentTrack?.title || "") + " " + (currentTrack?.artist || "") + " lyrics текст")}`, "_blank")}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}>
                        <ExternalLink className="w-3.5 h-3.5" /> Google
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress indicator at bottom */}
              <div className="relative z-10 px-8 pb-6">
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-border)", opacity: 0.3 }}>
                  <div className="h-full rounded-full" style={{ width: `${progressPct}%`, backgroundColor: "var(--mq-accent)" }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Track comments panel */}
        {currentTrack.scTrackId && (
          <TrackCommentsPanel
            trackId={currentTrack.scTrackId}
            currentProgress={progress}
            onSeek={(time) => {
              setProgress(time);
              const audio = getAudioElement();
              if (audio) audio.currentTime = time;
            }}
            isOpen={showComments}
            onClose={() => setShowComments(false)}
          />
        )}

        {/* Similar tracks panel */}
        <AnimatePresence>
          {showSimilar && (
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring" as const, damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "55vh", backgroundColor: "var(--mq-card)", borderTop: "1px solid var(--mq-border)" }}>
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--mq-text)" }}>
                    Похожие треки
                  </h3>
                  <button onClick={() => setShowSimilar(false)} style={{ color: "var(--mq-text-muted)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Drag handle */}
                <div className="flex justify-center mb-2">
                  <div className="w-8 h-1 rounded-full" style={{ backgroundColor: "var(--mq-border)" }} />
                </div>
              </div>

              {similarTracksLoading ? (
                <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                  ))}
                </div>
              ) : similarTracks.length > 0 ? (
                <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: "42vh" }}>
                  {/* Compact grid of similar tracks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {similarTracks.map((track, i) => (
                      <motion.div
                        key={track.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.25 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => playTrack(track, similarTracks)}
                        onContextMenu={(e) => e.preventDefault()}
                        className="flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-colors duration-150 group relative overflow-hidden"
                        style={{
                          backgroundColor: currentTrack?.id === track.id ? "var(--mq-accent)" : "transparent",
                          border: `1px solid ${currentTrack?.id === track.id ? "var(--mq-accent)" : "var(--mq-border)"}`,
                        }}
                      >
                        {/* Mini cover */}
                        <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
                          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                            {currentTrack?.id === track.id && isPlaying
                              ? <Pause className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                              : <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: "#fff" }} />}
                          </div>
                          {currentTrack?.id === track.id && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity"
                              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                              <Pause className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                            </div>
                          )}
                        </div>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] sm:text-xs font-medium truncate leading-tight"
                            style={{ color: currentTrack?.id === track.id ? "var(--mq-text)" : "var(--mq-text)" }}>
                            {track.title}
                          </p>
                          <p className="text-[10px] truncate mt-0.5"
                            style={{ color: currentTrack?.id === track.id ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
                            {track.artist}
                          </p>
                          {track.genre && (
                            <span className="inline-block text-[9px] mt-1 px-1.5 py-0.5 rounded-md truncate max-w-full"
                              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--mq-text-muted)" }}>
                              {track.genre}
                            </span>
                          )}
                        </div>

                        {/* Quick actions */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
                            className="p-1 rounded-lg active:scale-90 transition-transform"
                            style={{ color: (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? "#ef4444" : "var(--mq-text-muted)" }}>
                            <Heart className="w-3.5 h-3.5" style={(Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? { fill: "#ef4444" } : {}} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDislike(track.id, track); }}
                            className="p-1 rounded-lg active:scale-90 transition-transform"
                            style={{ color: (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? "#ef4444" : "var(--mq-text-muted)" }}>
                            <ThumbsDown className="w-3 h-3.5" style={(Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? { fill: "#ef4444" } : {}} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                </div>
              ) : (
                <div className="px-4 pb-4">
                  <p className="text-xs text-center py-6" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить похожие треки</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Song DNA panel */}
        <SongDNA
          track={currentTrack}
          isOpen={showDNA}
          onClose={() => setShowDNA(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
}
