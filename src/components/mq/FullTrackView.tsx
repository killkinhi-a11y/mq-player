"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1, Repeat, Repeat1,
  Shuffle, X, Heart, ThumbsDown, ListMusic, Music, ChevronDown, ChevronLeft, FileText, ExternalLink, Download, Moon, Clock, MessageSquare, Sparkles, Waves, Dna, MoreVertical, Headphones, Radio, Mic2, Sunrise, Star, Gauge, SlidersHorizontal, Repeat2, Share2, ArrowRight, Check, Languages, Loader2
} from "lucide-react";
import SongDNA from "./SongDNA";
import { formatDuration, searchTracks, type Track } from "@/lib/musicApi";
import { detectInterestingMoments } from "@/lib/music-utils";
import Image from "next/image";
import TrackCard from "./TrackCard";
import { getAudioElement, resumeAudioContext, getAnalyser, getInactiveAudio } from "@/lib/audioEngine";
import TrackCommentsPanel from "./TrackCommentsPanel";
import TrackCanvas from "./TrackCanvas";
import PlaylistArtwork from "./PlaylistArtwork";
import EqualizerView from "./EqualizerView";
import SynthVisualizerView from "./SynthVisualizerView";
import {
  enableCompressor, disableCompressor, enableReverb, disableReverb, setReverbMix,
  isCompressorEnabled, isReverbEnabled, getReverbMix,
} from "@/lib/audioEngine";
import { toast } from "@/hooks/use-toast";
import { translateLyrics, detectLyricsLanguage } from "@/lib/lyricsTranslation";

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
    4: { quality: "Нормально", qualityColor: "var(--mq-wake-color, #fbbf24)" },
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
                      <Moon className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
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
                        <Sunrise className="w-4 h-4" style={{ color: "var(--mq-wake-color, #fbbf24)" }} />
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
                            <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                              {rec.cycles} циклов
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-bold block" style={{ color: "var(--mq-text)" }}>
                              {rec.wakeTime}
                            </span>
                            <span className="text-[11px] font-medium" style={{ color: rec.qualityColor }}>
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
                          <Sunrise className="w-4 h-4" style={{ color: "var(--mq-wake-color, #fbbf24)" }} />
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
                            color: selected === val ? "var(--mq-accent)" : "var(--mq-text-muted)",
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
                      <Moon className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                    </motion.div>
                    <div>
                      <span className="text-sm font-bold block" style={{ color: "var(--mq-text)" }}>Таймер сна</span>
                      <div className="flex items-center gap-1.5">
                        <motion.div animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
                          transition={{ duration: 1.5, repeat: Infinity }}><Star className="w-2.5 h-2.5" fill="var(--mq-accent)" style={{ color: "var(--mq-accent)" }} /></motion.div>
                        <span className="text-[11px] font-medium" style={{ color: "var(--mq-accent)" }}>Активен</span>
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
                          <stop offset="0%" stopColor="var(--mq-accent)" />
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
                      <span className="text-[11px] mt-1" style={{ color: "var(--mq-text-muted)" }}>осталось</span>
                    </div>
                  </div>

                  {/* Info cards */}
                  <div className="flex-1 space-y-2.5">
                    <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sunrise className="w-3 h-3" style={{ color: "var(--mq-wake-color, #fbbf24)" }} />
                        <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Пробуждение</span>
                      </div>
                      <span className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                        {getWakeTimeForMinutes(timerMinutes)}
                      </span>
                    </div>
                    <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                        <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Длительность</span>
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
                          <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>Циклы</span>
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
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    Пробуждение: {getWakeTimeForMinutes(timerMinutes)}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
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
  // ── Zustand selectors (prevents re-renders from unrelated store changes) ──
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const volume = useAppStore((s) => s.volume);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const shuffle = useAppStore((s) => s.shuffle);
  const repeat = useAppStore((s) => s.repeat);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const setDuration = useAppStore((s) => s.setDuration);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const similarTracks = useAppStore((s) => s.similarTracks);
  const setSimilarTracks = useAppStore((s) => s.setSimilarTracks);
  const similarTracksLoading = useAppStore((s) => s.similarTracksLoading);
  const setSimilarTracksLoading = useAppStore((s) => s.setSimilarTracksLoading);
  const playTrack = useAppStore((s) => s.playTrack);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const showSimilarRequested = useAppStore((s) => s.showSimilarRequested);
  const clearShowSimilarRequest = useAppStore((s) => s.clearShowSimilarRequest);
  const showLyricsRequested = useAppStore((s) => s.showLyricsRequested);
  const clearShowLyricsRequest = useAppStore((s) => s.clearShowLyricsRequest);
  const sleepTimerActive = useAppStore((s) => s.sleepTimerActive);
  const sleepTimerRemaining = useAppStore((s) => s.sleepTimerRemaining);
  const sleepTimerMinutes = useAppStore((s) => s.sleepTimerMinutes);
  const startSleepTimer = useAppStore((s) => s.startSleepTimer);
  const stopSleepTimer = useAppStore((s) => s.stopSleepTimer);
  const updateSleepTimer = useAppStore((s) => s.updateSleepTimer);
  const currentStyle = useAppStore((s) => s.currentStyle);
  const styleVariant = useAppStore((s) => s.styleVariant);
  const currentPlaylistId = useAppStore((s) => s.currentPlaylistId);
  const radioMode = useAppStore((s) => s.radioMode);
  const toggleRadioMode = useAppStore((s) => s.toggleRadioMode);
  const releaseRadarTracks = useAppStore((s) => s.releaseRadarTracks);
  const fetchReleaseRadar = useAppStore((s) => s.fetchReleaseRadar);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled);
  const setView = useAppStore((s) => s.setView);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const abRepeat = useAppStore((s) => s.abRepeat);
  const setAbRepeatPoint = useAppStore((s) => s.setAbRepeatPoint);
  const clearAbRepeat = useAppStore((s) => s.clearAbRepeat);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);

  // Swipe gesture refs — store touch coords in refs instead of DOM properties
  // to avoid React error #300 when track change triggers re-render during touch
  const swipeStartRef = useRef({ x: 0, y: 0 });

  const sliderRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveAnimRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const rafRunningRef = useRef(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDNA, setShowDNA] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState<{top: number; right: number}>({top: 0, right: 0});
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [showEQ, setShowEQ] = useState(false);
  const [showSynthVis, setShowSynthVis] = useState(false);
  const [compressorOn, setCompressorOn] = useState(false);
  const [reverbOn, setReverbOn] = useState(false);
  const [reverbMixVal, setReverbMixVal] = useState(0.3);

  const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  // ── A-B Repeat toggle handler ──
  const handleAbToggle = useCallback(() => {
    const st = useAppStore.getState();
    if (st.abRepeat.active) {
      // Active → clear
      st.clearAbRepeat();
    } else if (st.abRepeat.pointA !== null) {
      // Point A set → set point B
      st.setAbRepeatPoint('B');
    } else {
      // Off → set point A
      st.setAbRepeatPoint('A');
    }
  }, []);


  // Re-apply playback rate when track changes or rate changes
  useEffect(() => {
    if (currentTrack?.id) {
      const audio = getAudioElement();
      if (audio) audio.playbackRate = playbackRate;
      const inactive = getInactiveAudio();
      if (inactive) inactive.playbackRate = playbackRate;
    }
  }, [currentTrack?.id, playbackRate]);

  // Reset A-B repeat when track changes (separate effect so rate changes don't clear it)
  useEffect(() => {
    useAppStore.getState().clearAbRepeat();
  }, [currentTrack?.id]);

  const cyclePlaybackSpeed = () => {
    const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextIdx = (currentIdx + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIdx];
    setPlaybackRate(nextSpeed);
  };

  // Track mobile viewport (ref-based to avoid re-renders on every resize)
  const isMobileRef = useRef(false);
  useEffect(() => {
    const check = () => { isMobileRef.current = window.innerWidth < 640; };
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
      setShowEQ(false);
      setShowSynthVis(false);
    }
    prevFullTrackOpenRef.current = isFullTrackViewOpen;
  }, [isFullTrackViewOpen]);

  // P1-fix: Removed body/documentElement overflow lock + touchmove/wheel preventDefault.
  // FullTrackView is `position: fixed inset-0 overflow-hidden` (line 1924) which
  // already prevents background scroll. The overflow lock on documentElement caused:
  //   - iOS Safari: page jumps to top on open, scroll-stuck after close
  //   - rubber-band glitches
  // The touchmove/wheel preventDefault with {passive:false} also killed scrolling
  // INSIDE the player's own scrollable areas (lyrics, comments) on some devices.
  // The `.mq-scroll-view` / `[data-scrollable]` exception was fragile.
  useEffect(() => {
    if (!isFullTrackViewOpen) return;
    // Only lock body (not documentElement — documentElement lock causes iOS issues)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullTrackViewOpen]);

  // Close more menu on Escape key
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMoreMenu(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showMoreMenu]);

  const [lyricsLines, setLyricsLines] = useState<{ time: number; text: string }[]>([]);
  const [lyricsPlainText, setLyricsPlainText] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [translatedLyrics, setTranslatedLyrics] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const activeLineIndexRef = useRef(-1);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const lyricsVisCanvasRef = useRef<HTMLCanvasElement>(null);

  // Cache slider widths on mount + resize (avoids getBoundingClientRect in rAF/drag)
  useEffect(() => {
    const updateWidths = () => {
      if (volumeRef.current) volumeSliderWidthRef.current = volumeRef.current.getBoundingClientRect().width;
      if (sliderRef.current) progressSliderWidthRef.current = sliderRef.current.getBoundingClientRect().width;
    };
    updateWidths();
    window.addEventListener("resize", updateWidths);
    return () => window.removeEventListener("resize", updateWidths);
  }, []);

  // Sync isDragging state to ref for RAF loop access
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // ── RAF-based progress sync for smooth 60fps progress bar ──
  // Reads audio.currentTime directly via getAudioElement() and updates DOM,
  // bypassing React state to eliminate re-renders from progress changes.
  useEffect(() => {
    if (!isPlaying || !isFullTrackViewOpen) return;
    let running = true;
    rafRunningRef.current = true;
    let lastTimeUpdate = 0;
    const tick = () => {
      if (!running) return;
      // P1-fix: skip DOM updates when tab is hidden (saves CPU)
      if (document.hidden) {
        if (running) requestAnimationFrame(tick);
        return;
      }
      // Skip DOM updates while user is dragging the progress bar
      if (isDraggingRef.current) {
        if (running) requestAnimationFrame(tick);
        return;
      }
      const audio = getAudioElement();
      if (audio && !audio.paused && audio.duration && isFinite(audio.duration)) {
        const ct = audio.currentTime;
        const dur = audio.duration;
        const pct = dur > 0 ? ct / dur : 0;

        // Update progress bar fill directly (0 re-renders)
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${pct})`;
        }
        // Update thumb position directly
        if (progressThumbRef.current) {
          const sliderWidth = progressSliderWidthRef.current || sliderRef.current?.getBoundingClientRect().width || 200;
          progressThumbRef.current.style.transform = `translateX(${pct * sliderWidth}px) translateY(-50%)`;
        }
        // Update glow element (next sibling of progress fill)
        const glowEl = progressFillRef.current?.nextElementSibling as HTMLDivElement | null;
        if (glowEl) {
          glowEl.style.transform = `scaleX(${pct})`;
        }
        // Update time display text (throttled to ~2Hz to avoid layout thrash)
        if (ct - lastTimeUpdate >= 0.5 && timeDisplayRef.current) {
          timeDisplayRef.current.textContent = formatDuration(Math.floor(ct));
          lastTimeUpdate = ct;
        }
      }
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
      rafRunningRef.current = false;
    };
  }, [isPlaying, isFullTrackViewOpen]);

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
  }, [volumeSectionRef]);

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
    setTranslatedLyrics(null);
    setShowTranslation(false);
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
    if (idx !== activeLineIndexRef.current) {
      activeLineIndexRef.current = idx;
      setActiveLineIndex(idx);
    }
  }, [progress, lyricsLines, isPlaying]);

  // Auto-scroll active lyrics line into view
  useEffect(() => {
    if (activeLineRef.current && lyricsScrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex]);

  // Lyrics visualization — audio-reactive frequency bars & wave
  // P1-fix: pause canvas drawing when tab is hidden to save CPU
  useEffect(() => {
    const canvas = lyricsVisCanvasRef.current;
    if (!canvas || !showLyrics) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // P1-fix: skip drawing when tab is hidden
    let tabHidden = false;
    const onVisChange = () => { tabHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisChange);

    const analyser = getAnalyser();
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    let animId: number;
    // Cache accent color — avoid getComputedStyle on every frame for 60fps
    let cachedAccent = { r: 224, g: 49, b: 49 };
    const updateAccent = () => {
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (accentColor.startsWith("#") && accentColor.length >= 7) {
        cachedAccent = {
          r: parseInt(accentColor.slice(1, 3), 16),
          g: parseInt(accentColor.slice(3, 5), 16),
          b: parseInt(accentColor.slice(5, 7), 16),
        };
      }
    };
    updateAccent();
    // P1-fix: poll accent color less frequently (was 2s, now 5s — accent rarely changes)
    const accentInterval = setInterval(updateAccent, 5000);

    const draw = () => {
      if (tabHidden) { animId = requestAnimationFrame(draw); return; }
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
      const { r, g, b } = cachedAccent;

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
    return () => { cancelAnimationFrame(animId); clearInterval(accentInterval); document.removeEventListener("visibilitychange", onVisChange); };
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
          limit: "50",
          dislikedIds: dislikedIds.join(","),
          dislikedArtists: [...dislikedArtistsSet].join(","),
          dislikedGenres: [...dislikedGenresSet].join(","),
        });

        const res = await fetch(`/api/music/similar?${params}`);
        const data = await res.json();
        const tracks: Track[] = (data.tracks || []).filter((t: Track) => t.id !== currentTrack.id);

        if (!cancelled) setSimilarTracks(tracks.slice(0, 50));
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

    // Cache accent color for 60fps — avoid getComputedStyle on every frame
    let waveAccent = { r: 224, g: 49, b: 49 };
    const updateWaveAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        waveAccent = { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
      }
    };
    updateWaveAccent();
    // P1-fix: poll accent color less frequently (was 2s, now 5s)
    const waveAccentInterval = setInterval(updateWaveAccent, 5000);

    const draw = () => {
      waveAnimRef.current = requestAnimationFrame(draw);
      if (document.hidden) return; // P1-fix: skip drawing when tab hidden
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
      const { r, g, b } = waveAccent;

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
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); clearInterval(waveAccentInterval); };
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

  // Progress drag — direct DOM manipulation for 0-lag during drag
  const progressPctRef = useRef<number | null>(null);
  const progressSliderWidthRef = useRef<number>(0);

  const updateProgressDOM = useCallback((pct: number) => {
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${pct})`;
    }
    if (progressThumbRef.current) {
      const sliderWidth = progressSliderWidthRef.current || sliderRef.current?.getBoundingClientRect().width || 200;
      progressThumbRef.current.style.transform = `translateX(${pct * sliderWidth}px) translateY(-50%)`;
    }
    progressPctRef.current = pct;
  }, []);

  const seekToPosition = useCallback((clientX: number) => {
    if (!sliderRef.current || !duration) return;
    const rect = sliderRef.current.getBoundingClientRect();
    progressSliderWidthRef.current = rect.width;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    updateProgressDOM(pct);
    // Update audio position in real-time for immediate feedback
    const audio = getAudioElement();
    if (audio) audio.currentTime = pct * duration;
  }, [duration, updateProgressDOM]);

  const handleSliderHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current || !duration) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(pct * duration);
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);
    const handleMouseMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const handleMouseUp = () => {
      setIsDragging(false);
      // Commit final position to store
      if (progressPctRef.current !== null && duration) {
        setProgress(progressPctRef.current * duration);
        progressPctRef.current = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [seekToPosition, duration, setProgress]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekToPosition(e.touches[0].clientX);
    const handleTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekToPosition(ev.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setIsDragging(false);
      // Commit final position to store
      if (progressPctRef.current !== null && duration) {
        setProgress(progressPctRef.current * duration);
        progressPctRef.current = null;
      }
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [seekToPosition, duration, setProgress]);

  const handleVolumeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setVolume(Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100))));
  }, [setVolume]);

  // ── Volume remember & mute toggle ──────────────────────
  const prevVolumeFullRef = useRef(70);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const isVolumeDraggingRef = useRef(false);
  // Direct DOM refs for lag-free volume dragging
  const volumeFillRef = useRef<HTMLDivElement>(null);
  const volumeThumbRefFull = useRef<HTMLDivElement>(null);
  const volumePctRef = useRef<number | null>(null);

  // Keep prevVolumeFullRef in sync when volume changes (non-zero)
  useEffect(() => {
    if (volume > 0) prevVolumeFullRef.current = volume;
  }, [volume]);

  const handleMuteToggle = useCallback(() => {
    if (volume > 0) {
      prevVolumeFullRef.current = volume;
      setVolume(0);
    } else {
      setVolume(prevVolumeFullRef.current || 70);
    }
  }, [volume, setVolume]);

  // ── Volume drag — direct DOM manipulation for 0-lag ────
  const volumeSliderWidthRef = useRef<number>(0);

  const updateVolumeDOM = useCallback((pct: number) => {
    if (volumeFillRef.current) {
      volumeFillRef.current.style.transform = `scaleX(${pct / 100})`;
    }
    if (volumeThumbRefFull.current) {
      const sliderWidth = volumeSliderWidthRef.current || 200;
      volumeThumbRefFull.current.style.transform = `translateX(${pct / 100 * sliderWidth}px) translateY(-50%)`;
    }
    volumePctRef.current = pct;
    // Update audio volume in real-time for immediate feedback
    const vol = Math.pow(pct / 100, 2);
    const audio = getAudioElement();
    if (audio) audio.volume = vol;
  }, []);

  const seekVolumeTo = useCallback((clientX: number) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    // Cache slider width for the entire drag session
    volumeSliderWidthRef.current = rect.width;
    const x = clientX - rect.left;
    const pct = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    updateVolumeDOM(pct);
  }, [updateVolumeDOM]);

  const handleVolumeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isVolumeDraggingRef.current = true;
    setIsVolumeDragging(true);
    seekVolumeTo(e.clientX);
    const onMove = (ev: MouseEvent) => seekVolumeTo(ev.clientX);
    const onUp = () => {
      isVolumeDraggingRef.current = false;
      setIsVolumeDragging(false);
      // Commit the final volume to the store
      if (volumePctRef.current !== null) {
        setVolume(volumePctRef.current);
        volumePctRef.current = null;
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [seekVolumeTo, setVolume]);

  const handleVolumeTouchStart = useCallback((e: React.TouchEvent) => {
    isVolumeDraggingRef.current = true;
    setIsVolumeDragging(true);
    seekVolumeTo(e.touches[0].clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekVolumeTo(ev.touches[0].clientX);
    };
    const onEnd = () => {
      isVolumeDraggingRef.current = false;
      setIsVolumeDragging(false);
      if (volumePctRef.current !== null) {
        setVolume(volumePctRef.current);
        volumePctRef.current = null;
      }
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [seekVolumeTo]);

  // Volume icon helper
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

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

  // ── useMemo hooks MUST be before any conditional return (Rules of Hooks) ──
  // Deterministic waveform bar heights (avoids Math.random() in render)
  const waveformBarHeights = useMemo(() =>
    Array.from({ length: 80 }, (_, i) => 6 + Math.sin(i * 0.3) * 8 + Math.cos(i * 0.7) * 4 + (((i * 7 + 13) % 17) / 17) * 3),
  []);
  // Deterministic skeleton widths (avoids Math.random() in render)
  const skeletonWidths = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => 40 + (((i * 11 + 7) % 13) / 13) * 50),
  []);
  // Interesting moment markers (moved from inline useMemo in JSX — Rules of Hooks)
  const interestingMoments = useMemo(
    () => duration > 0 ? detectInterestingMoments(duration, currentTrack?.source) : [],
    [duration, currentTrack?.source],
  );

  if (!currentTrack || !isFullTrackViewOpen) return null;

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const safeLikedIds = Array.isArray(likedTrackIds) ? likedTrackIds : [];
  const safeDislikedIds = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
  const isLiked = currentTrack ? safeLikedIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? safeDislikedIds.includes(currentTrack.id) : false;

  const fullTrackContent = (
    <AnimatePresence>
      <motion.div
        key={currentTrack?.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }}
        exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }}
        className="fixed inset-0 flex flex-col overflow-hidden"
        style={{ zIndex: 200, backgroundColor: "var(--mq-bg, rgba(0,0,0,0.97))", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", willChange: "opacity", contain: "layout style paint" }}
      >
        {/* ── Background: Cinematic layered blurred album art with depth ── */}
        <div className="absolute inset-0 z-0" style={{ pointerEvents: "none" }}>
          {currentPlaylistId ? (
            <>
              <PlaylistArtwork
                playlistId={currentPlaylistId}
                size={400}
                rounded="rounded-none"
                className="!w-[200%] !h-[200%] !-top-[50%] !-left-[50%]"
                animated={true}
                isPlaying={isPlaying}
              />
              <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.75 }} />
            </>
          ) : (
            <>
              {/* Blurred album art base */}
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1.15 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                className="absolute inset-0"
              >
                {currentTrack.cover && (
                  <Image src={currentTrack.cover} alt="" fill className="w-full h-full object-cover blur-[80px] opacity-50" unoptimized />
                )}
              </motion.div>
              {/* Deep vertical gradient — cinematic fade */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0.95) 100%)" }} />
              {/* Radial accent glow — top center with atmosphere animation */}
              <div className="absolute inset-0 mq-atmosphere-animated" style={{ opacity: isPlaying ? 1 : 0.3, transition: "opacity 1.5s ease" }} />
              {/* Secondary gradient — bottom warm */}
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 90%, color-mix(in srgb, var(--mq-accent) 5%, transparent), transparent)", transition: "opacity 1.5s ease", opacity: isPlaying ? 1 : 0.5 } } />
              {/* Vignette effect — darkened edges */}
              <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 200px 60px rgba(0,0,0,0.6)" }} />
            </>
          )}
        </div>

        {/* ── Audio-reactive canvas visualizer — subtle background layer ── */}
        <canvas
          ref={waveCanvasRef}
          className="absolute inset-0 z-[1] w-full h-full pointer-events-none"
          style={{ opacity: isPlaying ? 0.2 : 0.04, transition: "opacity 0.5s", willChange: "opacity" }}
        />

        {/* Canvas visualization mode (full-screen) */}
        {canvasMode && (
          <TrackCanvas isActive={canvasMode} isPlaying={isPlaying} currentStyle={currentStyle} styleVariant={styleVariant} />
        )}

        {/* ── Animated accent gradient background ── */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <motion.div
            animate={{
              opacity: 1
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--mq-accent) 6%, transparent), transparent 60%)",
              willChange: "opacity",
            }}
          />
        </div>

        {/* ── Top bar: Close (chevron-down) + Now Playing + More ── */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1 sm:px-6 sm:pt-4">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setFullTrackViewOpen(false); setShowSimilar(false); setShowLyrics(false); setShowSleepTimer(false); setShowComments(false); setShowDNA(false); setCanvasMode(false); setShowMoreMenu(false); }}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 group/close"
            style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-glass-bg)", backdropFilter: "var(--mq-glass-blur)", WebkitBackdropFilter: "var(--mq-glass-blur)", border: "1px solid var(--mq-glass-border)" }}>
            <motion.div
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            >
              <ChevronDown className="w-6 h-6" />
            </motion.div>
          </motion.button>
          <div className="flex flex-col items-center">
            <span className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--mq-text-muted)" }}>
              Сейчас играет
            </span>
          </div>
          {/* Desktop more button */}
          <div className="relative hidden sm:block">
            <motion.button ref={moreBtnRef} whileTap={{ scale: 0.9 }} onClick={() => {
              if (!showMoreMenu && moreBtnRef.current) {
                const rect = moreBtnRef.current.getBoundingClientRect();
                setMoreMenuPos({ top: Math.min(rect.bottom + 8, window.innerHeight - 400), right: window.innerWidth - rect.right });
              }
              setShowMoreMenu(!showMoreMenu);
            }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors" style={{ color: "var(--mq-text-muted)" }}>
              <MoreVertical className="w-5 h-5" />
            </motion.button>
          </div>
          {/* Mobile spacer */}
          <div className="sm:hidden w-10" />
        </div>

        {/* ── Main content area: side-by-side on desktop, stacked on mobile ── */}
        <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center px-4 sm:px-6 lg:px-10 xl:px-16 gap-3 lg:gap-10 min-h-0 overflow-hidden">

          {/* ── Album artwork section ── */}
          {!canvasMode && (
            <motion.div
              initial={animationsEnabled ? { scale: 0.9, opacity: 0 } : undefined}
              animate={{
                scale: isPlaying ? 1 : 0.97,
                opacity: 1,
              }}
              transition={{ type: "spring", stiffness: 120, damping: 30, mass: 0.8 }}
              className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{ perspective: "800px" }}
            >
              {/* Animated gradient border wrapper + accent glow */}
              <motion.div
                className="relative group/artwork"
                whileHover={{ rotateY: 3, rotateX: -2, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
              >
                {/* Ambient glow behind artwork — pulses when playing */}
                <motion.div
                  className="absolute -inset-6 rounded-3xl blur-3xl"
                  style={{ backgroundColor: "var(--mq-accent)" }}
                  animate={isPlaying ? { opacity: [0.25, 0.4, 0.25], scale: [1, 1.05, 1] } : { opacity: 0.15 }}
                  transition={isPlaying ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.8 }}
                />
                <div className="relative p-[2px] rounded-2xl overflow-hidden"
                  style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 40%, transparent), rgba(255,255,255,0.1), color-mix(in srgb, var(--mq-accent) 40%, transparent), var(--mq-accent))", backgroundSize: "300% 300%", animation: "mqGradientBorder 6s ease infinite", willChange: "background-position" }}>
                  <div
                    className="w-64 h-64 sm:w-[320px] sm:h-[320px] md:w-[22rem] md:h-[22rem] lg:w-[24rem] lg:h-[24rem] xl:w-[26rem] xl:h-[26rem] rounded-2xl overflow-hidden relative mq-cover-shadow-lg touch-none"
                    onTouchStart={(e) => {
                      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    }}
                    onTouchEnd={(e) => {
                      const startX = swipeStartRef.current.x;
                      const startY = swipeStartRef.current.y;
                      const endX = e.changedTouches[0].clientX;
                      const endY = e.changedTouches[0].clientY;
                      const dx = endX - startX;
                      const dy = Math.abs(endY - startY);
                      if (Math.abs(dx) > 60 && dy < 40) {
                        // Defer track change to next frame to avoid React error #300
                        // from cascading state updates during touch event handling
                        requestAnimationFrame(() => {
                          if (dx > 0) prevTrack();
                          else nextTrack();
                        });
                        try { navigator.vibrate?.(10); } catch {}
                      }
                    }}
                  >
                    {currentPlaylistId ? (
                      <PlaylistArtwork
                        playlistId={currentPlaylistId}
                        size={400}
                        rounded="rounded-none"
                        className="!w-full !h-full"
                        animated={true}
                        isPlaying={isPlaying}
                      />
                    ) : (
                      <Image src={currentTrack.cover} alt={currentTrack.album || ""} fill className="w-full h-full object-cover" unoptimized />
                    )}
                  </div>
                </div>
                {/* Reflection effect below artwork */}
                <div className="relative mt-1 overflow-hidden rounded-b-2xl" style={{ height: "60px", maxHeight: "20%" }}>
                  <div className="absolute inset-0" style={{ transform: "scaleY(-1)", transformOrigin: "top", filter: "blur(6px)", opacity: 0.15, maskImage: "linear-gradient(to top, transparent, black 20%, transparent 80%)", WebkitMaskImage: "linear-gradient(to top, transparent, black 20%, transparent 80%)" }}>
                    {currentPlaylistId ? (
                      <PlaylistArtwork
                        playlistId={currentPlaylistId}
                        size={400}
                        rounded="rounded-none"
                        className="!w-full !h-full"
                        animated={true}
                        isPlaying={isPlaying}
                      />
                    ) : (
                      currentTrack.cover && <Image src={currentTrack.cover} alt="" fill className="w-full h-full object-cover" unoptimized />
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
          {canvasMode && <div className="flex-shrink-0" style={{ height: "clamp(10rem, 30vh, 16rem)" }} />}

          {/* ── Controls section ── */}
          <div className="w-full max-w-md lg:max-w-sm xl:max-w-md flex flex-col gap-4 sm:gap-5 flex-shrink-0 pb-4">

            {/* Track info + like/dislike — cinematic typography hierarchy */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <motion.h2
                  key={currentTrack.id}
                  initial={animationsEnabled ? { opacity: 0, y: 8, filter: "blur(4px)" } : undefined}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className={`text-2xl sm:text-3xl lg:text-4xl truncate leading-tight ${isPlaying ? "mq-gradient-text" : ""}`}
                  style={{
                    fontSize: "var(--mq-text-headline)",
                    fontWeight: "var(--mq-font-bold)",
                    letterSpacing: "var(--mq-tracking-tight)",
                    lineHeight: "var(--mq-leading-tight)",
                    color: isPlaying ? undefined : "var(--mq-text)",
                  }}>
                  {currentTrack.title}
                </motion.h2>
                <motion.button
                  key={currentTrack.id + "-artist"}
                  initial={animationsEnabled ? { opacity: 0, y: 4 } : undefined}
                  animate={{ opacity: 0.7, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                  className="cursor-pointer hover:underline underline-offset-4 transition-all duration-200 mt-1.5 block"
                  style={{
                    fontSize: "var(--mq-text-lg)",
                    color: "var(--mq-text-muted)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                  }}
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
                </motion.button>
                {currentTrack.album && (
                  <motion.p
                    key={currentTrack.id + "-album"}
                    initial={animationsEnabled ? { opacity: 0 } : undefined}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>
                    {currentTrack.album}
                  </motion.p>
                )}
              </div>

            </div>

            {/* Progress bar — premium slider with glow, waveform, and glass tooltips */}
            <div className="w-full">
              <div ref={sliderRef} onMouseMove={handleSliderHover} onMouseLeave={() => setHoverTime(null)}
                onMouseDown={handleProgressMouseDown}
                onTouchStart={handleProgressTouchStart}
                role="slider"
                aria-label="Прогресс воспроизведения"
                aria-valuemin={0}
                aria-valuemax={Math.floor(duration)}
                aria-valuenow={Math.floor(progress)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!duration) return;
                  const step = e.shiftKey ? 30 : 5;
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const audio = getAudioElement();
                    const newTime = Math.min(duration, progress + step);
                    if (audio) audio.currentTime = newTime;
                    setProgress(newTime);
                  }
                  if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const audio = getAudioElement();
                    const newTime = Math.max(0, progress - step);
                    if (audio) audio.currentTime = newTime;
                    setProgress(newTime);
                  }
                }}
                className="relative group cursor-pointer touch-none">
                {/* A-B Repeat visual indicator */}
                {duration > 0 && abRepeat.pointA !== null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[4px] sm:h-[3px] rounded-sm z-[1] pointer-events-none"
                    style={{
                      left: `${(abRepeat.pointA / duration) * 100}%`,
                      width: abRepeat.pointB !== null
                        ? `${Math.max(0, ((abRepeat.pointB - abRepeat.pointA) / duration) * 100)}%`
                        : `${Math.max(0, ((progress - abRepeat.pointA) / duration) * 100)}%`,
                      backgroundColor: abRepeat.active ? "var(--mq-accent)" : "rgba(139,92,246,0.3)",
                      opacity: abRepeat.active ? 0.25 : 0.15,
                    }}
                  />
                )}
                {/* Subtle waveform visualization behind progress bar */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 overflow-hidden pointer-events-none" style={{ opacity: 0.2 }}>
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 32">
                    {Array.from({ length: 80 }).map((_, i) => {
                      const h = waveformBarHeights[i];
                      const x = (i / 80) * 200;
                      const pct = duration > 0 ? progress / duration : 0;
                      const passed = (i / 80) <= pct;
                      return (
                        <rect key={i} x={x} y={16 - h / 2} width="1.5" height={h} rx="0.75"
                          fill={passed ? "var(--mq-accent)" : "rgba(255,255,255,0.25)"} />
                      );
                    })}
                  </svg>
                </div>
                {/* Track background — premium thick bar */}
                <div className="w-full h-[6px] sm:h-[6px] rounded-full relative transition-all duration-150 group-hover:h-[8px]" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                  {/* Active fill — scaleX for 0-reflow */}
                  <div ref={progressFillRef} className="h-full rounded-full overflow-hidden"
                    style={{
                      width: "100%",
                      background: "linear-gradient(to right, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 70%, white))",
                      transform: `scaleX(${duration > 0 ? progress / duration : 0})`,
                      transformOrigin: "left center",
                      willChange: "transform",
                    }}
                  />
                  {/* Accent glow under progress fill */}
                  <div className="absolute bottom-0 left-0 h-full rounded-full pointer-events-none mq-progress-glow"
                    style={{
                      width: "100%",
                      transform: `scaleX(${duration > 0 ? progress / duration : 0})`,
                      transformOrigin: "left center",
                      willChange: "transform",
                    }}
                  />
                  {/* ── Interesting moment markers (always-visible tick marks) ── */}
                  {interestingMoments.map((moment) => {
                    const pct = (moment.time / duration) * 100;
                    const passed = progress >= moment.time;
                    return (
                      <div
                        key={moment.key}
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: `${pct}%`,
                          width: 2,
                          height: 10,
                          marginLeft: -1,
                          borderRadius: 1,
                          backgroundColor: passed
                            ? "var(--mq-accent)"
                            : "rgba(255,255,255,0.4)",
                          transform: "translateY(-50%)",
                          transition: "background-color 0.3s",
                          pointerEvents: "none",
                          zIndex: 3,
                        }}
                      />
                    );
                  })}
                </div>
                {/* Thumb dot — positioned at left:0, moved via translateX */}
                <div ref={progressThumbRef} className="absolute left-0 top-1/2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: "white",
                    boxShadow: `0 0 10px color-mix(in srgb, var(--mq-accent) 50%, transparent), 0 2px 8px rgba(0,0,0,0.4)`,
                    transform: `translateX(${duration > 0 ? (progress / duration) * (progressSliderWidthRef.current || 200) : 0}px) translateY(-50%)`,
                    willChange: "transform",
                    pointerEvents: "none",
                  }}
                />
                {/* Hover area enlarger for easier grabbing */}
                <div className="absolute inset-x-0 -top-3 -bottom-3" />
                {/* Glass-morphism timestamp tooltip */}
                {hoverTime !== null && !isDragging && (
                  <div className="absolute -top-11 pointer-events-none px-3 py-1.5 rounded-xl text-xs font-mono font-semibold z-10"
                    style={{
                      backgroundColor: "rgba(30,30,30,0.85)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      color: "var(--mq-text)",
                      border: "1px solid var(--mq-glass-border)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                      left: `${Math.max(8, Math.min(92, (hoverTime / (duration || 1)) * 100))}%`, transform: "translateX(-50%)" }}>
                    {/* Tooltip arrow */}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45"
                      style={{ backgroundColor: "rgba(30,30,30,0.85)", borderRight: "1px solid var(--mq-glass-border)", borderBottom: "1px solid var(--mq-glass-border)" }} />
                    {formatDuration(Math.floor(hoverTime))}
                  </div>
                )}
              </div>
              <div className="flex justify-between mt-2">
                <span ref={timeDisplayRef} className="text-xs tabular-nums font-semibold" style={{ color: isDragging ? "var(--mq-accent)" : "var(--mq-text-muted)", opacity: isDragging ? 1 : 0.7 }}>{formatDuration(Math.floor(progress))}</span>
                <span className="text-xs tabular-nums font-semibold" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>

            {/* Main playback controls — minimal Spotify/Apple Music style */}
            <div className="flex items-center justify-between px-6 sm:px-10">
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle}
                className="p-2 rounded-full transition-colors duration-150"
                style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                <Shuffle className="w-4 h-4" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={prevTrack}
                className="p-2 rounded-full transition-colors duration-150"
                style={{ color: "var(--mq-text)" }}>
                <SkipBack className="w-6 h-6" fill="currentColor" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.93 }}
                whileHover={{ scale: 1.04 }}
                onClick={togglePlay}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-text)", color: "var(--mq-bg)" }}
              >
                {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" style={{ marginLeft: 1.5 }} />}
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={nextTrack}
                className="p-2 rounded-full transition-colors duration-150"
                style={{ color: "var(--mq-text)" }}>
                <SkipForward className="w-6 h-6" fill="currentColor" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat}
                className="p-2 rounded-full transition-colors duration-150 relative"
                style={{ color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                {repeat === "one" && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-bg)" }}>1</span>
                )}
              </motion.button>
            </div>

            {/* Action row — minimal icon-only strip */}
            <div className="flex items-center justify-center gap-5 px-4">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => currentTrack && toggleLike(currentTrack.id, currentTrack)}
                className="p-2.5 rounded-full transition-colors duration-150"
                style={{ color: isLiked ? "var(--mq-like-color, #ef4444)" : "var(--mq-text-muted)" }}
                aria-label={isLiked ? "Убрать из избранного" : "Добавить в избранное"}
                aria-pressed={isLiked}>
                <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
              </motion.button>

              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); }}
                className="p-2.5 rounded-full transition-colors duration-150"
                style={{ color: showLyrics ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                aria-label="Текст песни">
                <FileText className="w-4 h-4" />
              </motion.button>

              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); }}
                className="p-2.5 rounded-full transition-colors duration-150"
                style={{ color: showSimilar ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                aria-label="Похожие треки">
                <ListMusic className="w-4 h-4" />
              </motion.button>

              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2.5 rounded-full transition-colors duration-150"
                style={{ color: showMoreMenu ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                aria-label="Дополнительные действия">
                <MoreVertical className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Volume — thin minimal slider */}
            <div
              ref={volumeSectionRef}
              className="flex items-center gap-2 w-full max-w-[200px] mx-auto mt-1"
            >
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleMuteToggle}
                className="flex-shrink-0 p-1 transition-colors" style={{ color: volume === 0 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                <VolumeIcon className="w-3.5 h-3.5" />
              </motion.button>
              <div ref={volumeRef}
                onMouseDown={handleVolumeMouseDown}
                onTouchStart={handleVolumeTouchStart}
                className="flex-1 h-1 rounded-full cursor-pointer relative group/vol touch-none"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                <div ref={volumeFillRef} className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                  style={{
                    width: "100%",
                    backgroundColor: "var(--mq-accent)",
                    transform: `scaleX(${volume / 100})`,
                    transformOrigin: "left center",
                    willChange: "transform",
                  }}
                />
                <div ref={volumeThumbRefFull} className="absolute left-0 top-1/2 rounded-full opacity-0 group-hover/vol:opacity-100 transition-opacity duration-150"
                  style={{
                    width: isVolumeDragging ? 14 : 10,
                    height: isVolumeDragging ? 14 : 10,
                    backgroundColor: "white",
                    boxShadow: "0 0 4px rgba(0,0,0,0.2)",
                    transform: `translateX(${volume / 100 * (volumeSliderWidthRef.current || 200)}px) translateY(-50%)`,
                    willChange: "transform",
                  }} />
                <div className="absolute inset-x-0 -top-3 -bottom-3" />
              </div>
            </div>

            {/* ── Up Next / Queue preview ── */}
            {queue.length > 1 && (
              <div className="mt-1 sm:mt-2" data-tour="queue">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: "var(--mq-text-muted)" }}>Далее</span>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowSimilar(true); setShowLyrics(false); }}
                    className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: "var(--mq-accent)" }}>
                    Ещё <ArrowRight className="w-3 h-3" />
                  </motion.button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                  {queue.slice((queueIndex ?? 0) + 1, (queueIndex ?? 0) + 4).map((track, i) => (
                    <motion.div
                      key={track.id + '-' + i}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => playTrack(track, queue)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl cursor-pointer transition-colors flex-shrink-0 min-w-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", maxWidth: "180px" }}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                        <Image src={track.cover} alt="" width={32} height={32} className="w-full h-full object-cover" loading="lazy" unoptimized />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate leading-tight" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Panels (positioned absolutely/fixed, independent of main layout) ── */}

        {/* Sleep Timer Popover */}
        <SleepTimerPopover
          show={showSleepTimer}
          onClose={() => setShowSleepTimer(false)}
          active={sleepTimerActive}
          remaining={sleepTimerRemaining}
          timerMinutes={sleepTimerMinutes}
          onStart={startSleepTimer}
          onStop={stopSleepTimer}
        />

        {/* ── Desktop Context Menu — rendered via portal to escape stacking context ── */}
        {showMoreMenu && !isMobileRef.current && typeof document !== "undefined" && createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: 250, pointerEvents: "auto" }}
              onClick={() => setShowMoreMenu(false)}
              onContextMenu={(e) => { e.preventDefault(); setShowMoreMenu(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
              className="fixed w-64 rounded-2xl shadow-2xl overflow-hidden"
              style={{
                zIndex: 260,
                top: moreMenuPos.top,
                right: moreMenuPos.right,
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                pointerEvents: "auto",
              }}
            >
              <div className="py-2 px-1.5">
                {/* Section: Воспроизведение */}
                <div className="px-3 pt-1 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Воспроизведение
                  </span>
                </div>
                {[
                  { icon: FileText, label: "Текст песни", active: showLyrics, action: () => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                  { icon: ListMusic, label: "Похожие треки", active: showSimilar, action: () => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                  { icon: Dna, label: "ДНК трека", active: showDNA, action: () => { setShowDNA(!showDNA); setShowSimilar(false); setShowLyrics(false); setShowComments(false); setShowMoreMenu(false); } },
                  { icon: MessageSquare, label: "Комментарии", active: showComments, action: () => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); setShowDNA(false); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-all duration-150 rounded-xl hover:bg-white/[0.06]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.active && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Check className="w-3 h-3" style={{ color: "var(--mq-card)" }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="my-1.5 mx-3 h-px" style={{ backgroundColor: "var(--mq-border)", opacity: 0.5 }} />

                {/* Section: Настройки */}
                <div className="px-3 pt-1 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Настройки
                  </span>
                </div>
                {[
                  { icon: SlidersHorizontal, label: eqEnabled ? "Эквалайзер вкл" : "Эквалайзер", active: eqEnabled, action: () => { setShowEQ(true); setShowMoreMenu(false); } },
                  { icon: Waves, label: "Синтез-визуализатор", active: showSynthVis, action: () => { setShowSynthVis(true); setShowMoreMenu(false); } },
                  { icon: Gauge, label: compressorOn ? "Компрессор вкл" : "Компрессор", active: compressorOn, action: () => { if (compressorOn) { disableCompressor(); setCompressorOn(false); } else { enableCompressor(); setCompressorOn(true); } setShowMoreMenu(false); } },
                  { icon: Sparkles, label: reverbOn ? "Реверб вкл" : "Реверб", active: reverbOn, action: () => { if (reverbOn) { disableReverb(); setReverbOn(false); } else { enableReverb(); setReverbOn(true); } setShowMoreMenu(false); } },
                  { icon: Repeat2, label: abRepeat.active ? "A-B повтор вкл" : abRepeat.pointA !== null ? "Точка A задана" : "A-B повтор", active: abRepeat.active, action: () => { handleAbToggle(); setShowMoreMenu(false); } },
                  { icon: Moon, label: sleepTimerActive ? "Таймер сна вкл" : "Таймер сна", active: sleepTimerActive, action: () => { setShowSleepTimer(true); setShowMoreMenu(false); } },
                  { icon: Headphones, label: "Spatial Audio", active: spatialAudioEnabled, action: () => { setSpatialAudioEnabled(!spatialAudioEnabled); setShowMoreMenu(false); } },
                  { icon: Waves, label: radioMode ? "Волна вкл" : "Радио режим", active: radioMode, action: () => { toggleRadioMode(); setShowMoreMenu(false); } },
                  { icon: Gauge, label: `Скорость ${playbackRate.toFixed(1)}x`, active: playbackRate !== 1.0, action: () => { cyclePlaybackSpeed(); setShowMoreMenu(false); } },
                  { icon: Sparkles, label: "Canvas режим", active: canvasMode, action: () => { setCanvasMode(!canvasMode); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-all duration-150 rounded-xl hover:bg-white/[0.06]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.active && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Check className="w-3 h-3" style={{ color: "var(--mq-card)" }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="my-1.5 mx-3 h-px" style={{ backgroundColor: "var(--mq-border)", opacity: 0.5 }} />

                {/* Section: Действия */}
                <div className="px-3 pt-1 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Действия
                  </span>
                </div>
                {[
                  { icon: Download, label: "Скачать", active: false, action: () => { handleDownload(); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-left cursor-pointer active:opacity-70 transition-all duration-150 rounded-xl hover:bg-white/[0.06]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>,
          document.body
        )}

        {/* ── Mobile Bottom Sheet — rendered via portal to escape stacking context ── */}
        {showMoreMenu && isMobileRef.current && typeof document !== "undefined" && createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50"
              style={{ zIndex: 250, pointerEvents: "auto" }}
              onClick={() => setShowMoreMenu(false)}
              onContextMenu={(e) => { e.preventDefault(); setShowMoreMenu(false); }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }}
              className="fixed bottom-0 left-0 right-0 rounded-t-3xl shadow-2xl max-h-[75vh] overflow-hidden"
              style={{
                zIndex: 260,
                backgroundColor: "var(--mq-card)",
                borderTop: "1px solid var(--mq-border)",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
                pointerEvents: "auto",
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-0.5">
                <div className="w-9 h-[3px] rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 30%, var(--mq-border))" }} />
              </div>

              {/* Track mini-preview header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: "color-mix(in srgb, var(--mq-border) 50%, transparent)" }}>
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-md">
                  {currentTrack?.cover && <Image src={currentTrack.cover} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>{currentTrack?.title || "—"}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{currentTrack?.artist || "—"}</p>
                </div>
              </div>

              <div className="px-2 pb-6 pt-1 overflow-y-auto" style={{ maxHeight: "calc(75vh - 6rem)" }}>
                {/* Section: Воспроизведение */}
                <div className="px-3 pt-2 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Воспроизведение
                  </span>
                </div>
                {[
                  { icon: FileText, label: "Текст песни", active: showLyrics, action: () => { setShowLyrics(!showLyrics); setShowSimilar(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                  { icon: ListMusic, label: "Похожие треки", active: showSimilar, action: () => { setShowSimilar(!showSimilar); setShowLyrics(false); setShowComments(false); setShowDNA(false); setShowMoreMenu(false); } },
                  { icon: Dna, label: "ДНК трека", active: showDNA, action: () => { setShowDNA(!showDNA); setShowSimilar(false); setShowLyrics(false); setShowComments(false); setShowMoreMenu(false); } },
                  { icon: MessageSquare, label: "Комментарии", active: showComments, action: () => { setShowComments(!showComments); setShowSimilar(false); setShowLyrics(false); setShowDNA(false); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3.5 px-3 py-4 text-sm text-left cursor-pointer transition-colors rounded-xl active:bg-white/[0.08]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-4 h-4" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.active && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Check className="w-3 h-3" style={{ color: "var(--mq-card)" }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="my-1 mx-3 h-px" style={{ backgroundColor: "var(--mq-border)", opacity: 0.4 }} />

                {/* Section: Настройки */}
                <div className="px-3 pt-2 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Настройки
                  </span>
                </div>
                {[
                  { icon: SlidersHorizontal, label: eqEnabled ? "Эквалайзер вкл" : "Эквалайзер", active: eqEnabled, action: () => { setShowEQ(true); setShowMoreMenu(false); } },
                  { icon: Waves, label: "Синтез-визуализатор", active: showSynthVis, action: () => { setShowSynthVis(true); setShowMoreMenu(false); } },
                  { icon: Gauge, label: compressorOn ? "Компрессор вкл" : "Компрессор", active: compressorOn, action: () => { if (compressorOn) { disableCompressor(); setCompressorOn(false); } else { enableCompressor(); setCompressorOn(true); } setShowMoreMenu(false); } },
                  { icon: Sparkles, label: reverbOn ? "Реверб вкл" : "Реверб", active: reverbOn, action: () => { if (reverbOn) { disableReverb(); setReverbOn(false); } else { enableReverb(); setReverbOn(true); } setShowMoreMenu(false); } },
                  { icon: Repeat2, label: abRepeat.active ? "A-B повтор вкл" : abRepeat.pointA !== null ? "Точка A задана" : "A-B повтор", active: abRepeat.active, action: () => { handleAbToggle(); setShowMoreMenu(false); } },
                  { icon: Moon, label: sleepTimerActive ? "Таймер сна вкл" : "Таймер сна", active: sleepTimerActive, action: () => { setShowSleepTimer(true); setShowMoreMenu(false); } },
                  { icon: Headphones, label: "Spatial Audio", active: spatialAudioEnabled, action: () => { setSpatialAudioEnabled(!spatialAudioEnabled); setShowMoreMenu(false); } },
                  { icon: Waves, label: radioMode ? "Волна вкл" : "Радио режим", active: radioMode, action: () => { toggleRadioMode(); setShowMoreMenu(false); } },
                  { icon: Gauge, label: `Скорость ${playbackRate.toFixed(1)}x`, active: playbackRate !== 1.0, action: () => { cyclePlaybackSpeed(); setShowMoreMenu(false); } },
                  { icon: Sparkles, label: "Canvas режим", active: canvasMode, action: () => { setCanvasMode(!canvasMode); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3.5 px-3 py-4 text-sm text-left cursor-pointer transition-colors rounded-xl active:bg-white/[0.08]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-4 h-4" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.active && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Check className="w-3 h-3" style={{ color: "var(--mq-card)" }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="my-1 mx-3 h-px" style={{ backgroundColor: "var(--mq-border)", opacity: 0.4 }} />

                {/* Section: Действия */}
                <div className="px-3 pt-2 pb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: "var(--mq-text-muted)", letterSpacing: "0.14em" }}>
                    Действия
                  </span>
                </div>
                {[
                  { icon: Download, label: "Скачать", active: false, action: () => { handleDownload(); setShowMoreMenu(false); } },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => { e.stopPropagation(); item.action(); }}
                      className="w-full flex items-center gap-3.5 px-3 py-4 text-sm text-left cursor-pointer transition-colors rounded-xl active:bg-white/[0.08]"
                      style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text)", touchAction: "manipulation" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.active ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)" : "var(--mq-input-bg)" }}>
                        <Icon className="w-4 h-4" style={{ color: item.active ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      </div>
                      <span className="flex-1 font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>,
          document.body
        )}

        {/* EQ Modal */}
        <EqualizerView show={showEQ} onClose={() => setShowEQ(false)} />

        {/* Synth Visualizer Modal */}
        <SynthVisualizerView show={showSynthVis} onClose={() => setShowSynthVis(false)} />

        {/* Immersive Lyrics Panel */}
        <AnimatePresence mode="wait">
          {showLyrics && (
            <motion.div
              initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
              className="absolute inset-0 z-50 flex flex-col"
              style={{ backgroundColor: "var(--mq-bg)" }}
            >
              {/* Background blur + gradient */}
              <div className="absolute inset-0 z-0 pointer-events-none">
                {currentTrack.cover && (
                  <Image src={currentTrack.cover} alt="" fill className="w-full h-full object-cover blur-[80px] opacity-20 scale-125" unoptimized />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, var(--mq-bg) 0%, transparent 30%, transparent 70%, var(--mq-bg) 100%)", opacity: 0.9 }} />
                <div className="absolute inset-0" style={{ backgroundColor: "var(--mq-bg)", opacity: 0.6 }} />
              </div>

              {/* Visualization canvas behind lyrics */}
              <canvas
                ref={lyricsVisCanvasRef}
                className="absolute inset-0 z-[1] pointer-events-none w-full h-full"
                style={{ opacity: isPlaying ? 0.5 : 0.15, transition: "opacity 0.5s", willChange: "opacity" }}
              />

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                  <p className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                </div>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowLyrics(false)}
                  className="p-2 rounded-full" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                  <X className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
                </motion.button>
              </div>

              {/* Lyrics content */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden">
                {lyricsLoading ? (
                  <div className="px-8 py-12 space-y-4 w-full max-w-md">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-5 rounded-full animate-pulse mx-auto" style={{ backgroundColor: "var(--mq-input-bg)", width: `${skeletonWidths[i]}%` }} />
                    ))}
                  </div>
                ) : lyricsLines.length > 0 ? (
                  <div ref={lyricsScrollRef} className="w-full max-w-lg px-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "70vh", scrollbarWidth: "none" }}>
                    <div className="py-24 flex flex-col items-center gap-2">
                      {lyricsLines.map((line, i) => {
                        const isActive = activeLineIndex === i;
                        const isPast = i < activeLineIndex;
                        const isNear = Math.abs(i - activeLineIndex) <= 2;
                        return (
                          <motion.p
                            key={i}
                            ref={isActive ? activeLineRef : undefined}
                            className="text-center cursor-pointer rounded-2xl leading-relaxed transition-all duration-500 ease-out py-2 px-6"
                            style={{
                              fontSize: isActive ? "1.7rem" : isPast ? "0.95rem" : isNear ? "1.05rem" : "1rem",
                              fontWeight: isActive ? 800 : isPast ? 400 : isNear ? 500 : 400,
                              color: isActive ? "var(--mq-accent)" : isPast ? "var(--mq-text-muted)" : "rgba(128,128,128,0.3)",
                              opacity: isActive ? 1 : isPast ? 0.35 : isNear ? 0.3 : 0.2,
                              transform: isActive ? "scale(1.06)" : "scale(1)",
                              textShadow: isActive ? "0 0 40px var(--mq-glow)" : "none",
                              maxWidth: "100%",
                              backgroundColor: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                              letterSpacing: isActive ? "0.01em" : "normal",
                            }}
                            onClick={() => {
                              const audio = getAudioElement();
                              if (audio) { audio.currentTime = line.time; setProgress(line.time); }
                            }}
                          >
                            {line.text || "\u266A"}
                          </motion.p>
                        );
                      })}
                    </div>
                  </div>
                ) : lyricsPlainText ? (
                  <div className="overflow-y-auto px-8 py-12 whitespace-pre-line text-center" style={{ maxHeight: "70vh", scrollbarWidth: "none" }}>
                    {lyricsPlainText.split("\n").map((line, i) => (
                      <p key={i} className="py-2 text-lg leading-relaxed transition-colors duration-300" style={{ color: line.trim() ? "var(--mq-text)" : "transparent", opacity: line.trim() ? 0.75 : 0 }}>{line || "\u00A0"}</p>
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

                {/* Translate button (M5.5) */}
                {(lyricsLines.length > 0 || lyricsPlainText) && !showTranslation && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={async () => {
                      const fullText = lyricsPlainText || lyricsLines.map(l => l.text).join("\n");
                      const lang = detectLyricsLanguage(fullText);
                      if (lang === "russian") { toast({ title: "Текст уже на русском" }); return; }
                      setTranslationLoading(true);
                      const translated = await translateLyrics(fullText, lang);
                      setTranslationLoading(false);
                      if (translated) { setTranslatedLyrics(translated); setShowTranslation(true); }
                      else { toast({ title: "Не удалось перевести" }); }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium mb-3"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)",
                      color: "var(--mq-accent)",
                      border: "1px solid color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                    }}
                  >
                    {translationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                    {translationLoading ? "Перевод…" : "Перевести на русский"}
                  </motion.button>
                )}

                {/* Translated lyrics overlay */}
                {showTranslation && translatedLyrics && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 flex flex-col"
                    style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
                  >
                    <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
                      <span className="text-xs font-medium" style={{ color: "var(--mq-accent)" }}>Перевод</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowTranslation(false)} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "var(--mq-text-muted)" }}>Оригинал</button>
                        <button onClick={() => { setShowTranslation(false); setTranslatedLyrics(null); }} className="p-1 rounded-lg" style={{ color: "var(--mq-text-muted)" }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "none" }}>
                      {translatedLyrics.split("\n").map((line, i) => (
                        <p key={i} className="py-1.5 text-center text-base leading-relaxed"
                          style={{ color: line.trim() ? "var(--mq-text)" : "transparent", opacity: line.trim() ? 0.85 : 0 }}>
                          {line || "\u00A0"}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Progress indicator at bottom */}
              <div className="relative z-10 px-8 pb-6">
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-border)", opacity: 0.3 }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: "var(--mq-accent)", boxShadow: "0 0 8px var(--mq-glow)" }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[11px] tabular-nums font-medium" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>{formatDuration(Math.floor(progress))}</span>
                  <span className="text-[11px] tabular-nums font-medium" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>{formatDuration(Math.floor(duration))}</span>
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
        <AnimatePresence mode="wait">
          {showSimilar && (
            <motion.div
              initial={{ y: "100%", opacity: 0, filter: "blur(4px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "100%", opacity: 0, filter: "blur(4px)" }}
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
                          <Image src={track.cover} alt="" width={44} height={44} className="w-full h-full object-cover" loading="lazy" unoptimized />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                            {currentTrack?.id === track.id && isPlaying
                              ? <Pause className="w-3.5 h-3.5" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                              : <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: "var(--mq-text-on-accent, #fff)" }} />}
                          </div>
                          {currentTrack?.id === track.id && isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity"
                              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                              <Pause className="w-3.5 h-3.5" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                            </div>
                          )}
                        </div>

                        {/* Track info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] sm:text-xs font-medium truncate leading-tight"
                            style={{ color: currentTrack?.id === track.id ? "var(--mq-text)" : "var(--mq-text)" }}>
                            {track.title}
                          </p>
                          <p className="text-[11px] truncate mt-0.5"
                            style={{ color: currentTrack?.id === track.id ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)" }}>
                            {track.artist}
                          </p>
                          {track.genre && (
                            <span className="inline-block text-[11px] mt-1 px-1.5 py-0.5 rounded-md truncate max-w-full"
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
                            style={{ color: (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? "var(--mq-like-color, #ef4444)" : "var(--mq-text-muted)" }}>
                            <Heart className="w-3.5 h-3.5" style={(Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(track.id) ? { fill: "var(--mq-like-color, #ef4444)" } : {}} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDislike(track.id, track); }}
                            className="p-1 rounded-lg active:scale-90 transition-transform"
                            style={{ color: (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? "var(--mq-like-color, #ef4444)" : "var(--mq-text-muted)" }}>
                            <ThumbsDown className="w-3 h-3.5" style={(Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(track.id) ? { fill: "var(--mq-like-color, #ef4444)" } : {}} />
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

  return typeof document !== "undefined" ? createPortal(fullTrackContent, document.body) : null;
}
