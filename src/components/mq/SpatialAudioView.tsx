"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type Mood } from "@/store/useAppStore";
import {
  initSpatialAudio,
  enableSpatialAudio,
  setMoodPreset,
  detectMoodFromTrack,
  getCurrentSpatialConfig,
  getFrequencyBandLevels,
  getAvailableMoods,
} from "@/lib/spatialAudio";
import type { Track } from "@/lib/musicApi";

interface SpatialAudioViewProps {
  currentTrack: Track | null;
}

const MOOD_INFO = getAvailableMoods();

// Band colors for the 5 frequency ranges
const BAND_COLORS = [
  "#f97316", "#ef4444", "#eab308", "#22c55e", "#3b82f6",
];

// ── Custom SVG: spatial sound wave icon (no emoji) ──
function SoundSpaceIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="12" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="14" cy="14" r="8" stroke={color} strokeWidth="1" opacity="0.2" />
      <circle cx="14" cy="14" r="3.5" fill={color} opacity="0.8" />
      {/* Left wave */}
      <path d="M8 9 C5 11, 5 17, 8 19" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <path d="M5.5 7 C2 10, 2 18, 5.5 21" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity="0.3" />
      {/* Right wave */}
      <path d="M20 9 C23 11, 23 17, 20 19" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <path d="M22.5 7 C26 10, 26 18, 22.5 21" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

// ── Inline SVG: power icon for ON/OFF ──
function PowerIcon({ active, size = 20 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v8" stroke={active ? "currentColor" : "currentColor"} strokeWidth="2.5" />
      <path
        d="M18.36 6.64a9 9 0 1 1-12.73 0"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function SpatialAudioView({ currentTrack }: SpatialAudioViewProps) {
  const {
    spatialAudioEnabled,
    spatialMood,
    spatialAutoDetect,
    setSpatialAudioEnabled,
    setSpatialMood,
    setSpatialAutoDetect,
    animationsEnabled,
    compactMode,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [bandLevels, setBandLevels] = useState<number[]>([0, 0, 0, 0, 0]);

  const activeMoodInfo = MOOD_INFO.find(m => m.mood === spatialMood);

  // ── Toggle spatial audio on/off ──
  const handleToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      const ok = initSpatialAudio();
      if (ok) {
        enableSpatialAudio(true);
        const mood = spatialMood || (currentTrack ? detectMoodFromTrack(currentTrack.title, currentTrack.genre) : "chill");
        setMoodPreset(mood);
        setSpatialMood(mood);
        setSpatialAudioEnabled(true);
      }
    } else {
      enableSpatialAudio(false);
      setSpatialAudioEnabled(false);
    }
  }, [spatialMood, currentTrack, setSpatialAudioEnabled, setSpatialMood]);

  // ── Auto-detect mood when track changes ──
  useEffect(() => {
    if (!spatialAudioEnabled || !spatialAutoDetect || !currentTrack) return;
    const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
    setMoodPreset(mood);
    setSpatialMood(mood);
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply mood manually ──
  const handleSelectMood = useCallback((mood: Mood) => {
    setMoodPreset(mood);
    setSpatialMood(mood);
    setSpatialAutoDetect(false);
  }, [setSpatialMood, setSpatialAutoDetect]);

  // ── Mood color helper ──
  const moodColor = activeMoodInfo?.color || "var(--mq-accent)";
  const moodRgb = activeMoodInfo
    ? { r: parseInt(activeMoodInfo.color.slice(1, 3), 16), g: parseInt(activeMoodInfo.color.slice(3, 5), 16), b: parseInt(activeMoodInfo.color.slice(5, 7), 16) }
    : { r: 224, g: 49, b: 49 };

  // ── Canvas: ring-based spatial visualization ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    const getAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
      }
      return { r: 224, g: 49, b: 49 };
    };

    const smoothed = [0, 0, 0, 0, 0];
    const particles = Array.from({ length: 20 }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: 0.5 + Math.random() * 0.5,
      speed: 0.1 + Math.random() * 0.3,
      size: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      resize();

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      if (!spatialAudioEnabled) return;

      const t = performance.now() / 1000;
      const { r, g, b } = getAccent();
      const mc = moodRgb;

      const rawLevels = getFrequencyBandLevels();
      for (let i = 0; i < 5; i++) smoothed[i] += (rawLevels[i] - smoothed[i]) * 0.12;
      setBandLevels([...smoothed]);

      const spatialConfig = getCurrentSpatialConfig();
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.32;

      // ── Outer ambient ring ──
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius + 30, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${mc.r},${mc.g},${mc.b},0.04)`;
      ctx.lineWidth = 20;
      ctx.stroke();

      // ── 5 Band arcs around the circle ──
      const bandAngles = [
        { start: -Math.PI * 0.85, end: -Math.PI * 0.55 },
        { start: -Math.PI * 0.45, end: -Math.PI * 0.15 },
        { start: -Math.PI * 0.05, end: Math.PI * 0.05 },
        { start: Math.PI * 0.15, end: Math.PI * 0.45 },
        { start: Math.PI * 0.55, end: Math.PI * 0.85 },
      ];

      for (let i = 0; i < 5; i++) {
        const level = smoothed[i] / 255;
        const bc = BAND_COLORS[i];
        const br = parseInt(bc.slice(1, 3), 16);
        const bg = parseInt(bc.slice(3, 5), 16);
        const bb = parseInt(bc.slice(5, 7), 16);

        const bandConfig = spatialConfig?.bands[i];
        const panShift = bandConfig ? bandConfig.pan * 0.08 : 0;
        const arcStart = bandAngles[i].start + panShift + t * 0.05;
        const arcEnd = bandAngles[i].end + panShift + t * 0.05;

        // Outer glow arc
        const glowR = baseRadius + 8 + level * 14;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, arcStart, arcEnd);
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${0.08 + level * 0.12})`;
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.stroke();

        // Main arc
        const arcR = baseRadius + 2 + level * 10;
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, arcStart, arcEnd);
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${0.3 + level * 0.6})`;
        ctx.lineWidth = 3 + level * 2;
        ctx.lineCap = "round";
        ctx.stroke();

        // Bright core arc
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, arcStart + 0.02, arcEnd - 0.02);
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${0.6 + level * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pan direction indicator — small dot at arc midpoint
        const midAngle = (arcStart + arcEnd) / 2;
        const dotR = baseRadius + 20 + level * 8;
        const dx = cx + Math.cos(midAngle) * dotR;
        const dy = cy + Math.sin(midAngle) * dotR;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.5 + level * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${br},${bg},${bb},${0.3 + level * 0.5})`;
        ctx.fill();
      }

      // ── Inner circle — pulsing core ──
      const avgLevel = smoothed.reduce((a, b) => a + b, 0) / (5 * 255);
      const coreR = 18 + avgLevel * 8;

      // Core glow
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
      coreGrad.addColorStop(0, `rgba(${mc.r},${mc.g},${mc.b},${0.08 + avgLevel * 0.1})`);
      coreGrad.addColorStop(1, `rgba(${mc.r},${mc.g},${mc.b},0)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core ring
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${mc.r},${mc.g},${mc.b},${0.06 + avgLevel * 0.08})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${mc.r},${mc.g},${mc.b},${0.2 + avgLevel * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Core wave indicator — 3 bars in center
      const barW = 2;
      const barGap = 4;
      const totalBarW = barW * 3 + barGap * 2;
      const barBaseY = cy + 6;
      for (let i = 0; i < 3; i++) {
        const barLevel = i === 0 ? smoothed[0] / 255 : i === 1 ? (smoothed[1] + smoothed[2]) / (2 * 255) : smoothed[4] / 255;
        const barH = 3 + barLevel * 10;
        const bx = cx - totalBarW / 2 + i * (barW + barGap);

        ctx.fillStyle = `rgba(${mc.r},${mc.g},${mc.b},${0.5 + barLevel * 0.4})`;
        ctx.fillRect(bx, barBaseY - barH, barW, barH);
        // Mirror bar
        ctx.fillStyle = `rgba(${mc.r},${mc.g},${mc.b},${0.2 + barLevel * 0.2})`;
        ctx.fillRect(bx, barBaseY + 2, barW, barH * 0.6);
      }

      // ── Orbiting particles ──
      for (const p of particles) {
        p.angle += p.speed * 0.008;
        const pDist = baseRadius + 25 + Math.sin(t * 0.5 + p.phase) * 20;
        const px = cx + Math.cos(p.angle) * pDist;
        const py = cy + Math.sin(p.angle) * pDist;
        const alpha = 0.06 + 0.1 * Math.sin(t * 0.7 + p.phase);

        ctx.fillStyle = `rgba(${mc.r},${mc.g},${mc.b},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [spatialAudioEnabled, spatialMood, compactMode, moodRgb.r, moodRgb.g, moodRgb.b]);

  return (
    <div className="p-4 lg:p-6 pb-44 lg:pb-28 space-y-5 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: spatialAudioEnabled
              ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.12)`
              : "rgba(255,255,255,0.03)",
          }}
        >
          <SoundSpaceIcon
            color={spatialAudioEnabled ? moodColor : "var(--mq-text-muted)"}
            size={20}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold" style={{ color: "var(--mq-text)" }}>
            Пространственный звук
          </h1>
          <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
            Обработка звука для наушников
          </p>
        </div>
      </motion.div>

      {/* ── Power Toggle + Status ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        onClick={() => handleToggle(!spatialAudioEnabled)}
        className="relative cursor-pointer select-none overflow-hidden"
        style={{
          borderRadius: 16,
          backgroundColor: spatialAudioEnabled
            ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.06)`
            : "var(--mq-card)",
          border: spatialAudioEnabled
            ? `1px solid rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.25)`
            : "1px solid var(--mq-border)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3.5">
          {/* Left: icon + text */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Animated power icon */}
            <div className="relative shrink-0">
              {spatialAudioEnabled && (
                <motion.div
                  className="absolute -inset-2 rounded-full"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.05, 0.25] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  style={{ backgroundColor: `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.3)` }}
                />
              )}
              <div
                className="relative w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: spatialAudioEnabled
                    ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.15)`
                    : "rgba(255,255,255,0.03)",
                  border: spatialAudioEnabled
                    ? `1px solid rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.3)`
                    : "1px solid var(--mq-border)",
                  color: spatialAudioEnabled ? moodColor : "var(--mq-text-muted)",
                }}
              >
                <PowerIcon active={spatialAudioEnabled} size={20} />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: spatialAudioEnabled ? "var(--mq-text)" : "var(--mq-text-muted)" }}
                >
                  {spatialAudioEnabled ? "Активно" : "Выключено"}
                </span>
                {spatialAudioEnabled && activeMoodInfo && (
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-[10px] font-semibold px-2 py-[1px] rounded-md"
                    style={{
                      backgroundColor: `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.14)`,
                      color: moodColor,
                    }}
                  >
                    {activeMoodInfo.label}
                  </motion.span>
                )}
              </div>
              <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                {spatialAudioEnabled ? `${activeMoodInfo?.label || "Standard"} preset` : "Нажмите для включения"}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <motion.div
            className="relative w-[50px] h-[28px] rounded-full shrink-0"
            style={{
              backgroundColor: spatialAudioEnabled ? moodColor : "var(--mq-border)",
            }}
            layout
          >
            <motion.div
              className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-md"
              animate={{ x: spatialAudioEnabled ? 25 : 3 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {spatialAudioEnabled && (
                <motion.svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke={moodColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-[5px] ml-[5px]"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.polyline points="20 6 9 17 4 12" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: 0.05 }} />
                </motion.svg>
              )}
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Circular Visualization ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: spatialAudioEnabled ? `1px solid rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.15)` : "1px solid var(--mq-border)",
        }}
      >
        <div className="relative" style={{ height: compactMode ? 240 : 300 }}>
          <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />

          {/* OFF state overlay */}
          <AnimatePresence>
            {!spatialAudioEnabled && (
              <motion.div
                key="off"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <SoundSpaceIcon color="rgba(255,255,255,0.2)" size={28} />
                </div>
                <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  Включите для визуализации
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Frequency bands mini-bar */}
        {spatialAudioEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end justify-center gap-2 px-5 pb-3 pt-1"
            style={{ height: 28 }}
          >
            {[0, 1, 2, 3, 4].map(i => {
              const level = bandLevels[i] / 255;
              return (
                <div key={i} className="flex-1">
                  <div
                    className="w-full rounded-full"
                    style={{
                      height: `${Math.max(2, level * 22)}px`,
                      backgroundColor: BAND_COLORS[i],
                      opacity: 0.25 + level * 0.6,
                      transition: "height 120ms, opacity 120ms",
                    }}
                  />
                </div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* ── Mood Presets ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <span className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>
            Профиль звука
          </span>

          <button
            onClick={() => {
              const next = !spatialAutoDetect;
              setSpatialAutoDetect(next);
              if (next && currentTrack) {
                const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
                setMoodPreset(mood);
                setSpatialMood(mood);
              }
            }}
            className="flex items-center gap-2"
          >
            <span className="text-[11px] font-medium" style={{ color: spatialAutoDetect ? moodColor : "var(--mq-text-muted)" }}>
              Авто
            </span>
            <div
              className="relative w-8 h-[18px] rounded-full transition-colors duration-200"
              style={{
                backgroundColor: spatialAutoDetect ? moodColor : "var(--mq-border)",
              }}
            >
              <div
                className="absolute top-[2px] w-[14px] h-[14px] rounded-full transition-transform duration-200 shadow-sm"
                style={{
                  backgroundColor: "#fff",
                  transform: spatialAutoDetect ? "translateX(16px)" : "translateX(2px)",
                }}
              />
            </div>
          </button>
        </div>

        {/* Mood chips — 2 rows of 4, clean dots + labels */}
        <div className="grid grid-cols-4 gap-2">
          {MOOD_INFO.map((info) => {
            const isActive = spatialMood === info.mood;
            const ir = parseInt(info.color.slice(1, 3), 16);
            const ig = parseInt(info.color.slice(3, 5), 16);
            const ib = parseInt(info.color.slice(5, 7), 16);

            return (
              <motion.button
                key={info.mood}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelectMood(info.mood)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: isActive ? `rgba(${ir},${ig},${ib},0.1)` : "var(--mq-card)",
                  border: isActive
                    ? `1px solid rgba(${ir},${ig},${ib},0.35)`
                    : "1px solid var(--mq-border)",
                }}
              >
                {/* Color dot */}
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-all duration-200"
                  style={{
                    backgroundColor: info.color,
                    opacity: isActive ? 1 : 0.35,
                    boxShadow: isActive ? `0 0 6px rgba(${ir},${ig},${ib},0.5)` : "none",
                  }}
                />
                <span
                  className="text-[11px] font-medium truncate"
                  style={{ color: isActive ? info.color : "var(--mq-text-muted)" }}
                >
                  {info.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
