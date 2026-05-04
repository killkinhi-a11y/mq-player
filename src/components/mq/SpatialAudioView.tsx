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

// Pre-computed positions for 5 bands around a listener in an arc
const BAND_ARC_POSITIONS = [
  { angle: -Math.PI * 0.7, dist: 0.38 },
  { angle: -Math.PI * 0.35, dist: 0.32 },
  { angle: 0, dist: 0.42 },
  { angle: Math.PI * 0.35, dist: 0.32 },
  { angle: Math.PI * 0.7, dist: 0.38 },
];

const BAND_COLORS = [
  "#f97316", "#ef4444", "#eab308", "#22c55e", "#3b82f6",
];

const BAND_LABELS = ["Sub-bass", "Bass", "Mid", "High-mid", "Treble"];

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

  // ── Canvas animation loop ──
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

    const smoothedLevels = [0, 0, 0, 0, 0];

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      resize();

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;
      const { r, g, b } = getAccent();

      const rawLevels = getFrequencyBandLevels();
      for (let i = 0; i < 5; i++) {
        smoothedLevels[i] += (rawLevels[i] - smoothedLevels[i]) * 0.15;
      }
      setBandLevels([...smoothedLevels]);

      const spatialConfig = getCurrentSpatialConfig();

      const centerX = w / 2;
      const listenerY = h * 0.78;
      const radius = Math.min(w, h) * 0.4;

      // Background grid
      ctx.strokeStyle = `rgba(${r},${g},${b},0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, listenerY, radius * (i / 3), -Math.PI, 0);
        ctx.stroke();
      }

      // Connecting lines
      for (let i = 0; i < 5; i++) {
        const arc = BAND_ARC_POSITIONS[i];
        const bandConfig = spatialConfig?.bands[i];
        const panOffset = bandConfig ? bandConfig.pan * 0.3 : 0;
        const angle = arc.angle + panOffset;
        const dist = arc.dist + (smoothedLevels[i] / 255) * 0.08;

        const bx = centerX + Math.sin(angle) * radius * dist;
        const by = listenerY - Math.cos(angle) * radius * dist;

        const lineAlpha = 0.08 + (smoothedLevels[i] / 255) * 0.15;
        ctx.beginPath();
        ctx.moveTo(centerX, listenerY);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha})`;
        ctx.lineWidth = 1 + (smoothedLevels[i] / 255) * 1.5;
        ctx.stroke();
      }

      // Band circles
      for (let i = 0; i < 5; i++) {
        const arc = BAND_ARC_POSITIONS[i];
        const bandConfig = spatialConfig?.bands[i];
        const panOffset = bandConfig ? bandConfig.pan * 0.3 : 0;
        const angle = arc.angle + panOffset;
        const dist = arc.dist + (smoothedLevels[i] / 255) * 0.08;

        const bx = centerX + Math.sin(angle) * radius * dist;
        const by = listenerY - Math.cos(angle) * radius * dist;

        const level = smoothedLevels[i] / 255;
        const baseRadius = compactMode ? 12 : 16;
        const pulseRadius = baseRadius + level * (compactMode ? 10 : 14);
        const glowRadius = pulseRadius + 8 + level * 6;

        const bc = BAND_COLORS[i];
        const br = parseInt(bc.slice(1, 3), 16);
        const bg = parseInt(bc.slice(3, 5), 16);
        const bb = parseInt(bc.slice(5, 7), 16);

        // Outer glow
        const glowGrad = ctx.createRadialGradient(bx, by, pulseRadius * 0.5, bx, by, glowRadius);
        glowGrad.addColorStop(0, `rgba(${br},${bg},${bb},${0.15 + level * 0.2})`);
        glowGrad.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Circle
        const circleGrad = ctx.createRadialGradient(bx, by, 0, bx, by, pulseRadius);
        circleGrad.addColorStop(0, `rgba(${br},${bg},${bb},${0.6 + level * 0.3})`);
        circleGrad.addColorStop(0.7, `rgba(${br},${bg},${bb},${0.3 + level * 0.2})`);
        circleGrad.addColorStop(1, `rgba(${br},${bg},${bb},0.1)`);
        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(bx, by, pulseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${0.4 + level * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        ctx.fillStyle = `rgba(${br},${bg},${bb},${0.6 + level * 0.4})`;
        ctx.font = `${compactMode ? 9 : 10}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(BAND_LABELS[i], bx, by + pulseRadius + 14);
      }

      // Listener icon
      const listenerSize = compactMode ? 14 : 18;

      const listenerGlow = ctx.createRadialGradient(centerX, listenerY, 0, centerX, listenerY, listenerSize * 2.5);
      listenerGlow.addColorStop(0, `rgba(${r},${g},${b},0.15)`);
      listenerGlow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = listenerGlow;
      ctx.beginPath();
      ctx.arc(centerX, listenerY, listenerSize * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
      ctx.beginPath();
      ctx.arc(centerX, listenerY - listenerSize * 0.3, listenerSize * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(centerX, listenerY + listenerSize * 0.5, listenerSize * 0.55, listenerSize * 0.35, 0, -Math.PI, 0);
      ctx.fill();

      // Floating particles
      for (let i = 0; i < 15; i++) {
        const seed = i * 137.5;
        const px = centerX + Math.sin(t * 0.3 + seed) * radius * 0.8;
        const py = listenerY - Math.abs(Math.cos(t * 0.2 + seed)) * radius * 0.7;
        const alpha = 0.03 + 0.05 * Math.sin(t * 0.5 + seed * 0.7);
        const size = 1 + Math.sin(t * 0.4 + seed) * 0.5;

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [spatialAudioEnabled, spatialMood, compactMode]);

  // ── Parse mood color to RGB ──
  const moodRgb = activeMoodInfo
    ? { r: parseInt(activeMoodInfo.color.slice(1, 3), 16), g: parseInt(activeMoodInfo.color.slice(3, 5), 16), b: parseInt(activeMoodInfo.color.slice(5, 7), 16) }
    : { r: 224, g: 49, b: 49 };

  return (
    <div className="p-4 lg:p-6 pb-44 lg:pb-28 space-y-5 max-w-2xl mx-auto">
      {/* ── Header ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: spatialAudioEnabled
              ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.15)`
              : "rgba(255,255,255,0.04)",
          }}
        >
          {spatialAudioEnabled ? (
            <motion.span
              className="text-lg"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {activeMoodInfo?.icon || "🌀"}
            </motion.span>
          ) : (
            <span className="text-lg opacity-40">🎧</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate" style={{ color: "var(--mq-text)" }}>
            Spatial Audio
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            3D-пространственный звук для наушников
          </p>
        </div>
      </motion.div>

      {/* ── Main Status Card — big, clear ON/OFF ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onClick={() => handleToggle(!spatialAudioEnabled)}
        className="relative cursor-pointer select-none overflow-hidden"
        style={{
          borderRadius: 20,
          border: spatialAudioEnabled
            ? `1.5px solid rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.35)`
            : "1.5px solid var(--mq-border)",
        }}
      >
        {/* Animated glow behind the card when ON */}
        {spatialAudioEnabled && (
          <motion.div
            className="absolute inset-0 -z-10"
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.98, 1.02, 0.98] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            style={{
              borderRadius: 22,
              background: `radial-gradient(ellipse at 50% 50%, rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.15) 0%, transparent 70%)`,
            }}
          />
        )}

        <div
          className="flex items-center justify-between px-5 py-4"
          style={{
            backgroundColor: spatialAudioEnabled
              ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.06)`
              : "var(--mq-card)",
          }}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Pulsing ring when ON */}
            <div className="relative shrink-0">
              {spatialAudioEnabled && (
                <motion.div
                  className="absolute -inset-1.5 rounded-full"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  style={{ backgroundColor: `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.25)` }}
                />
              )}
              <div
                className="relative w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: spatialAudioEnabled
                    ? `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.18)`
                    : "rgba(255,255,255,0.04)",
                  border: spatialAudioEnabled
                    ? `1.5px solid rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.3)`
                    : "1.5px solid var(--mq-border)",
                }}
              >
                <span className="text-xl">
                  {spatialAudioEnabled ? (activeMoodInfo?.icon || "🌀") : "🔇"}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: spatialAudioEnabled ? "var(--mq-text)" : "var(--mq-text-muted)" }}
                >
                  {spatialAudioEnabled ? "Включено" : "Выключено"}
                </span>
                {spatialAudioEnabled && (
                  <motion.span
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.15)`,
                      color: activeMoodInfo?.color || "var(--mq-accent)",
                    }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: activeMoodInfo?.color || "var(--mq-accent)" }}
                    />
                    {activeMoodInfo?.label || spatialMood}
                  </motion.span>
                )}
              </div>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                {spatialAudioEnabled
                  ? `Пространственный звук: ${activeMoodInfo?.label || spatialMood}`
                  : "Нажмите чтобы включить"}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <div
            className="relative w-14 h-8 rounded-full transition-colors duration-300 shrink-0"
            style={{
              backgroundColor: spatialAudioEnabled
                ? (activeMoodInfo?.color || "var(--mq-accent)")
                : "var(--mq-border)",
            }}
          >
            <div
              className="absolute top-1 w-6 h-6 rounded-full transition-transform duration-300 shadow-md"
              style={{
                backgroundColor: "#fff",
                transform: spatialAudioEnabled ? "translateX(30px)" : "translateX(4px)",
              }}
            >
              {/* ON icon inside the thumb */}
              {spatialAudioEnabled && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeMoodInfo?.color || "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-[6px] ml-[6px]">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Canvas Visualization ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div
          className="relative"
          style={{
            height: compactMode ? 200 : 280,
            background: spatialAudioEnabled
              ? `radial-gradient(ellipse at 50% 80%, rgba(${moodRgb.r},${moodRgb.g},${moodRgb.b},0.04) 0%, transparent 70%)`
              : "none",
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: "block" }}
          />

          {/* OFF overlay */}
          <AnimatePresence>
            {!spatialAudioEnabled && (
              <motion.div
                key="off-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span className="text-3xl opacity-50">🎧</span>
                </div>
                <div className="text-center px-6">
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Визуализация недоступна
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
                    Включите Spatial Audio выше
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Band levels bar */}
        {spatialAudioEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-end justify-center gap-1.5 px-5 pb-3.5 pt-1"
            style={{ height: 32 }}
          >
            {BAND_LABELS.map((label, i) => {
              const level = bandLevels[i] / 255;
              return (
                <div key={label} className="flex-1 group relative">
                  <div
                    className="w-full rounded-full transition-all duration-150"
                    style={{
                      height: `${Math.max(3, level * 24)}px`,
                      backgroundColor: BAND_COLORS[i],
                      opacity: 0.35 + level * 0.65,
                    }}
                  />
                </div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* ── Mood Selector ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span className="text-xs font-semibold" style={{ color: "var(--mq-text)" }}>
            Настроение
          </span>

          {/* Auto-detect toggle with label */}
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
            <span className="text-[11px]" style={{ color: spatialAutoDetect ? "var(--mq-text)" : "var(--mq-text-muted)" }}>
              Авто
            </span>
            <div
              className="relative w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: spatialAutoDetect
                  ? (activeMoodInfo?.color || "var(--mq-accent)")
                  : "var(--mq-border)",
              }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200 shadow-sm"
                style={{
                  backgroundColor: "#fff",
                  transform: spatialAutoDetect ? "translateX(18px)" : "translateX(2px)",
                }}
              />
            </div>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MOOD_INFO.map((info) => {
            const isActive = spatialMood === info.mood;
            const infoRgb = { r: parseInt(info.color.slice(1, 3), 16), g: parseInt(info.color.slice(3, 5), 16), b: parseInt(info.color.slice(5, 7), 16) };

            return (
              <motion.button
                key={info.mood}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleSelectMood(info.mood)}
                className="relative flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all duration-200"
                style={{
                  backgroundColor: isActive ? `rgba(${infoRgb.r},${infoRgb.g},${infoRgb.b},0.1)` : "var(--mq-card)",
                  border: isActive
                    ? `1.5px solid rgba(${infoRgb.r},${infoRgb.g},${infoRgb.b},0.4)`
                    : "1px solid var(--mq-border)",
                }}
              >
                <span className="text-xl">{info.icon}</span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: isActive ? info.color : "var(--mq-text-muted)" }}
                >
                  {info.label}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <motion.div
                    layoutId="mood-indicator"
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full shadow-sm"
                    style={{
                      backgroundColor: info.color,
                      boxShadow: `0 0 8px rgba(${infoRgb.r},${infoRgb.g},${infoRgb.b},0.5)`,
                    }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
