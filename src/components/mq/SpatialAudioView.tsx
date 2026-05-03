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
  type SpatialBand,
} from "@/lib/spatialAudio";
import type { Track } from "@/lib/musicApi";

interface SpatialAudioViewProps {
  currentTrack: Track | null;
}

const MOOD_INFO = getAvailableMoods();

// Pre-computed positions for 5 bands around a listener in an arc
// (angle in radians from top, distance factor)
const BAND_ARC_POSITIONS = [
  { angle: -Math.PI * 0.7, dist: 0.38 },  // Sub-bass (far left)
  { angle: -Math.PI * 0.35, dist: 0.32 },  // Bass (mid-left)
  { angle: 0, dist: 0.42 },                // Mid (top center)
  { angle: Math.PI * 0.35, dist: 0.32 },   // High-mid (mid-right)
  { angle: Math.PI * 0.7, dist: 0.38 },    // Treble (far right)
];

const BAND_COLORS = [
  "#f97316", // Sub-bass — orange
  "#ef4444", // Bass — red
  "#eab308", // Mid — yellow
  "#22c55e", // High-mid — green
  "#3b82f6", // Treble — blue
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
  const [config, setConfig] = useState<ReturnType<typeof getCurrentSpatialConfig>>(null);

  // ── Toggle spatial audio on/off ──
  const handleToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      const ok = initSpatialAudio();
      if (ok) {
        enableSpatialAudio(true);
        // Apply current or detected mood
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

    // Helper: get accent color
    const getAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
      }
      return { r: 224, g: 49, b: 49 };
    };

    // Smoothed band levels for animation
    const smoothedLevels = [0, 0, 0, 0, 0];

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      resize();

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;
      const { r, g, b } = getAccent();

      // Get current levels
      const rawLevels = getFrequencyBandLevels();
      for (let i = 0; i < 5; i++) {
        smoothedLevels[i] += (rawLevels[i] - smoothedLevels[i]) * 0.15;
      }
      setBandLevels([...smoothedLevels]);

      // Get current config
      const spatialConfig = getCurrentSpatialConfig();
      if (spatialConfig) setConfig(spatialConfig);

      // ── Layout ──
      const centerX = w / 2;
      const listenerY = h * 0.78;
      const radius = Math.min(w, h) * 0.4;

      // ── Background grid / atmosphere ──
      ctx.strokeStyle = `rgba(${r},${g},${b},0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, listenerY, radius * (i / 3), -Math.PI, 0);
        ctx.stroke();
      }

      // ── Draw connecting lines from listener to each band ──
      for (let i = 0; i < 5; i++) {
        const arc = BAND_ARC_POSITIONS[i];
        const bandConfig = spatialConfig?.bands[i];
        // Pan affects the angle: pan -1 = full left, +1 = full right
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

      // ── Draw band circles ──
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

        // Parse band color
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

      // ── Listener icon (head silhouette) ──
      const listenerSize = compactMode ? 14 : 18;

      // Listener glow
      const listenerGlow = ctx.createRadialGradient(centerX, listenerY, 0, centerX, listenerY, listenerSize * 2.5);
      listenerGlow.addColorStop(0, `rgba(${r},${g},${b},0.15)`);
      listenerGlow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = listenerGlow;
      ctx.beginPath();
      ctx.arc(centerX, listenerY, listenerSize * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Head circle
      ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
      ctx.beginPath();
      ctx.arc(centerX, listenerY - listenerSize * 0.3, listenerSize * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Shoulders
      ctx.beginPath();
      ctx.ellipse(centerX, listenerY + listenerSize * 0.5, listenerSize * 0.55, listenerSize * 0.35, 0, -Math.PI, 0);
      ctx.fill();

      // Label
      ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.font = `${compactMode ? 9 : 10}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("LISTENER", centerX, listenerY + listenerSize + 8);

      // ── Current mood label ──
      const moodLabel = spatialConfig?.mood || spatialMood || "none";
      const moodInfo = MOOD_INFO.find(m => m.mood === moodLabel);
      ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.font = `600 ${compactMode ? 14 : 18}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        `${moodInfo?.icon || ""} ${moodLabel.charAt(0).toUpperCase() + moodLabel.slice(1)}`,
        centerX, h * 0.08 + (compactMode ? 12 : 18)
      );

      // ── Floating particles ──
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

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-40 lg:pb-28 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"} max-w-2xl mx-auto`}
    >
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
          Spatial Audio
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          3D spatial positioning that adapts to your music&apos;s mood
        </p>
      </motion.div>

      {/* Main Toggle */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: spatialAudioEnabled ? "rgba(224,49,49,0.15)" : "var(--mq-surface, #1a1a1a)",
                border: `1px solid ${spatialAudioEnabled ? "rgba(224,49,49,0.3)" : "var(--mq-border)"}`,
              }}
            >
              <span className="text-lg">{spatialAudioEnabled ? "🌀" : "🔇"}</span>
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>
                Spatial Audio
              </p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                {spatialAudioEnabled
                  ? `Active — ${spatialMood || "melodic"} mode`
                  : "Disabled"
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle(!spatialAudioEnabled)}
            className="relative w-12 h-6 rounded-full transition-colors duration-300"
            style={{ backgroundColor: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-border)" }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full transition-transform duration-300"
              style={{
                backgroundColor: "#fff",
                transform: spatialAudioEnabled ? "translateX(24px)" : "translateX(2px)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </button>
        </div>
      </motion.div>

      {/* 3D Spatial Canvas */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
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
            height: compactMode ? 260 : 340,
            background: "radial-gradient(ellipse at 50% 80%, rgba(224,49,49,0.03) 0%, transparent 70%)",
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: "block" }}
          />

          {!spatialAudioEnabled && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Enable Spatial Audio to see the visualization
              </p>
            </div>
          )}
        </div>

        {/* Band levels bar */}
        {spatialAudioEnabled && (
          <div className="flex items-end justify-center gap-2 p-3" style={{ height: 40 }}>
            {BAND_LABELS.map((label, i) => {
              const level = bandLevels[i] / 255;
              return (
                <div key={label} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-full rounded-sm transition-all duration-150"
                    style={{
                      height: `${Math.max(4, level * 28)}px`,
                      backgroundColor: BAND_COLORS[i],
                      opacity: 0.5 + level * 0.5,
                    }}
                  />
                  <span className="text-[8px]" style={{ color: "var(--mq-text-muted)" }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Mood Selector */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>
            Mood Preset
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              Auto-detect
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
              className="relative w-8 h-4 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: spatialAutoDetect ? "var(--mq-accent)" : "var(--mq-border)",
              }}
            >
              <div
                className="absolute top-0.5 w-3 h-3 rounded-full transition-transform duration-200"
                style={{
                  backgroundColor: "#fff",
                  transform: spatialAutoDetect ? "translateX(16px)" : "translateX(2px)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                }}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MOOD_INFO.map((info) => {
            const isActive = spatialMood === info.mood;
            return (
              <motion.button
                key={info.mood}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelectMood(info.mood)}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: isActive ? `${info.color}18` : "transparent",
                  border: isActive ? `1px solid ${info.color}50` : "1px solid transparent",
                }}
              >
                <span className="text-lg">{info.icon}</span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: isActive ? info.color : "var(--mq-text-muted)" }}
                >
                  {info.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="mood-indicator"
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: info.color }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Spatial Config Details */}
      {spatialAudioEnabled && config && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl p-4"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          <p className="font-semibold text-sm mb-3" style={{ color: "var(--mq-text)" }}>
            Frequency Band Positioning
          </p>
          <div className="space-y-2">
            {config.bands.map((band: SpatialBand, i: number) => (
              <div key={band.name} className="flex items-center gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: BAND_COLORS[i] }}
                />
                <span className="text-xs w-16 flex-shrink-0" style={{ color: "var(--mq-text)" }}>
                  {band.name}
                </span>
                <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${((band.pan + 1) / 2) * 100}%`,
                      backgroundColor: BAND_COLORS[i],
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span className="text-[10px] w-20 text-right flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                  {(band.pan * 45).toFixed(0)}° &middot; {band.frequency}Hz &middot; ×{band.gain.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Info */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
          Spatial Audio positions each frequency band in a 3D space around you.
          The system analyzes track metadata to detect mood and automatically adjusts
          the positioning — bass-heavy genres center the low end, while dreamy
          tracks spread instruments wide for an ethereal experience.
        </p>
      </motion.div>
    </div>
  );
}
