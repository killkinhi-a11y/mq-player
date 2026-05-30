"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX, EQ_STEP } from "@/lib/eq";
import {
  getAnalyser,
  getFrequencyData,
  getAudioElement,
  getTimeDomainData,
  getAdaptiveBarCount,
  getAdaptiveCanvasScale,
  recordFrameTime,
} from "@/lib/audioEngine";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

// ── dB scale lines configuration ──
const DB_SCALE_LINES = [
  { db: 12, label: "+12" },
  { db: 6, label: "+6" },
  { db: 0, label: "0" },
  { db: -6, label: "-6" },
  { db: -12, label: "-12" },
];

/**
 * Convert a normalised 0–1 bar value to an approximate dB scale.
 * 0 → -∞ (silence), ~0.004 → -48 dB, 1.0 → 0 dB.
 * We map the canvas area so that the top ≈ +12 dB and bottom ≈ -48 dB.
 */
function valueToDbNorm(value: number): number {
  // Map 0..1 → -48..0 dB range (logarithmic perception)
  if (value <= 0) return 0;
  const db = 20 * Math.log10(Math.max(value, 1e-6)); // -48..0
  // Normalise into 0..1 where 0 = bottom (-48 dB), 1 = top (+12 dB)
  return (db + 48) / 60; // 60 dB range (-48 to +12)
}

/**
 * Live FFT Equalizer Component — Enhanced
 *
 * Draws real-time frequency spectrum on a canvas using Web Audio API AnalyserNode.
 * Features: waveform display, peak hold, adaptive bar count, glow effects,
 * dB scale markings, spectral centroid indicator, and smooth resize handling.
 *
 * Audio pipeline: Source → Gain → [EQ Chain] → AnalyserNode → Canvas FFT
 */
export default function EqualizerView({ show, onClose }: EqualizerViewProps) {
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqBands = useAppStore((s) => s.eqBands);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const setEqEnabled = useAppStore((s) => s.setEqEnabled);
  const setEqBand = useAppStore((s) => s.setEqBand);
  const setEqPreset = useAppStore((s) => s.setEqPreset);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const fftCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const smoothedDataRef = useRef<Float32Array | null>(null);
  const peakHoldRef = useRef<Float32Array | null>(null);
  const spectralCentroidRef = useRef<number>(0.5); // 0..1 position
  const barCountRef = useRef<number>(64); // current bar count (adaptive)
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 460, h: 240 });

  // ── ResizeObserver for smooth canvas resize ──────────────────────────────
  useEffect(() => {
    if (!show) return;
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = getAdaptiveCanvasScale() * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      setCanvasSize({
        w: Math.round(rect.width * dpr),
        h: Math.round(rect.height * dpr),
      });
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [show]);

  // ── Live FFT Visualization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!show) return;

    const canvas = fftCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const analyser = getAnalyser();
    const binCount = analyser?.frequencyBinCount || 1024; // 2048 fftSize → 1024 bins
    const dataArray = new Uint8Array(binCount);
    const waveformArray = new Uint8Array(analyser?.frequencyBinCount || 1024);

    // Update bar count adaptively
    barCountRef.current = getAdaptiveBarCount();
    const BAR_COUNT = barCountRef.current;

    // Initialize smoothed data buffer
    if (!smoothedDataRef.current || smoothedDataRef.current.length !== BAR_COUNT) {
      smoothedDataRef.current = new Float32Array(BAR_COUNT);
    }

    // Initialize peak hold buffer
    if (!peakHoldRef.current || peakHoldRef.current.length !== BAR_COUNT) {
      peakHoldRef.current = new Float32Array(BAR_COUNT);
    }

    // Cache CSS variable values (re-read periodically for theme changes)
    let cachedAccent = "#E53E3E";
    let cachedAccentRgb = "229, 62, 62";
    let cssCacheTime = 0;

    const updateCssCache = () => {
      const now = performance.now();
      if (now - cssCacheTime > 2000) { // refresh every 2s
        cssCacheTime = now;
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--mq-accent")
          .trim() || "#E53E3E";
        cachedAccent = raw;
        // Try to extract RGB components for rgba usage
        const tempEl = document.createElement("div");
        tempEl.style.color = raw;
        document.body.appendChild(tempEl);
        const computed = getComputedStyle(tempEl).color;
        document.body.removeChild(tempEl);
        const match = computed.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          cachedAccentRgb = `${match[1]}, ${match[2]}, ${match[3]}`;
        }
      }
    };

    const draw = (timestamp: number) => {
      // Record frame time for adaptive performance
      recordFrameTime(timestamp);

      // Re-check adaptive bar count (performance level may change)
      const newBarCount = getAdaptiveBarCount();
      if (newBarCount !== BAR_COUNT) {
        // Will be picked up on next effect cycle
        barCountRef.current = newBarCount;
      }

      const width = canvas.width;
      const height = canvas.height;
      updateCssCache();

      // ── Layout: FFT area (top 70%), waveform area (bottom 20%), gap 10% ──
      const fftHeight = height * 0.68;
      const waveformTop = height * 0.78;
      const waveformHeight = height * 0.18;
      const SCALE_LEFT = 30; // left margin for dB labels
      const drawWidth = width - SCALE_LEFT;

      ctx.clearRect(0, 0, width, height);

      // ── dB Scale Markings ──
      ctx.save();
      ctx.font = `${Math.max(8, Math.round(height * 0.04))}px monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const line of DB_SCALE_LINES) {
        const norm = valueToDbNorm(Math.pow(10, line.db / 20)); // convert dB to linear then to canvas position
        const y = fftHeight - norm * fftHeight;
        if (y < 0 || y > fftHeight) continue;
        // Subtle horizontal grid line
        ctx.strokeStyle = `rgba(${cachedAccentRgb}, 0.08)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SCALE_LEFT, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        // Label
        ctx.fillStyle = `rgba(${cachedAccentRgb}, 0.25)`;
        ctx.fillText(line.label, SCALE_LEFT - 4, y);
      }
      ctx.restore();

      // ── Get frequency data ──
      if (analyser) {
        getFrequencyData(dataArray);
      }

      // ── Draw FFT Bars ──
      const currentBarCount = barCountRef.current;
      const barTotalWidth = drawWidth / currentBarCount;
      const barWidth = barTotalWidth * 0.72;
      const gap = barTotalWidth * 0.28;

      // Spectral centroid calculation accumulators
      let centroidFreqSum = 0;
      let centroidMagSum = 0;

      for (let i = 0; i < currentBarCount; i++) {
        // Logarithmic mapping: more resolution in lower frequencies
        const logIndex = Math.pow(i / currentBarCount, 1.5) * binCount;
        const binIndex = Math.min(Math.floor(logIndex), binCount - 1);

        // Average a few bins around the target for smoother data
        let sum = 0;
        let count = 0;
        const spread = Math.max(1, Math.floor(binCount / currentBarCount / 2));
        for (let j = Math.max(0, binIndex - spread); j <= Math.min(binCount - 1, binIndex + spread); j++) {
          sum += dataArray[j];
          count++;
        }
        const rawValue = sum / count / 255; // Normalize to 0-1

        // Smooth the data to prevent jitter
        if (!smoothedDataRef.current || smoothedDataRef.current.length !== currentBarCount) {
          smoothedDataRef.current = new Float32Array(currentBarCount);
        }
        const prev = smoothedDataRef.current[i] || 0;
        const smoothed = prev * 0.7 + rawValue * 0.3; // Exponential smoothing
        smoothedDataRef.current[i] = smoothed;

        // ── Peak hold with slow decay ──
        if (!peakHoldRef.current || peakHoldRef.current.length !== currentBarCount) {
          peakHoldRef.current = new Float32Array(currentBarCount);
        }
        const currentPeak = peakHoldRef.current[i] || 0;
        if (smoothed > currentPeak) {
          peakHoldRef.current[i] = smoothed;
        } else {
          // Slow decay: peak falls gradually
          peakHoldRef.current[i] = Math.max(smoothed, currentPeak - 0.003);
        }

        // ── Spectral centroid accumulators ──
        centroidFreqSum += (i / currentBarCount) * smoothed;
        centroidMagSum += smoothed;

        // ── Map bar to closest EQ band for coloring ──
        const freq = (i / currentBarCount) * 20000;
        const bandIdx = getClosestBandIndex(freq);
        const bandValue = eqBands[bandIdx] || 0;

        // ── Bar dimensions ──
        const x = SCALE_LEFT + i * (barWidth + gap);
        const dbNorm = valueToDbNorm(smoothed);
        const barHeight = Math.max(1, dbNorm * fftHeight);

        // ── Color: CSS variable --mq-accent with alpha ──
        const alpha = 0.3 + smoothed * 0.7;
        const accentRgba = `rgba(${cachedAccentRgb}, ${alpha})`;
        const accentLow = `rgba(${cachedAccentRgb}, ${alpha * 0.3})`;
        const accentMid = `rgba(${cachedAccentRgb}, ${alpha * 0.6})`;

        // Gradient bar
        const gradient = ctx.createLinearGradient(x, fftHeight, x, fftHeight - barHeight);
        gradient.addColorStop(0, accentLow);
        gradient.addColorStop(0.5, accentMid);
        gradient.addColorStop(1, accentRgba);

        // ── Glow effect for loud bars ──
        if (smoothed > 0.5) {
          ctx.save();
          ctx.shadowColor = `rgba(${cachedAccentRgb}, ${smoothed * 0.5})`;
          ctx.shadowBlur = smoothed * 12;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = gradient;
          ctx.fillRect(x, fftHeight - barHeight, barWidth, barHeight);
          ctx.restore();
        } else {
          ctx.fillStyle = gradient;
          ctx.fillRect(x, fftHeight - barHeight, barWidth, barHeight);
        }

        // ── Reflection / mirror effect at bottom ──
        const reflectionHeight = Math.min(barHeight * 0.25, height - fftHeight - 2);
        if (reflectionHeight > 1) {
          const reflGradient = ctx.createLinearGradient(x, fftHeight, x, fftHeight + reflectionHeight);
          reflGradient.addColorStop(0, `rgba(${cachedAccentRgb}, ${alpha * 0.15})`);
          reflGradient.addColorStop(1, `rgba(${cachedAccentRgb}, 0)`);
          ctx.fillStyle = reflGradient;
          ctx.fillRect(x, fftHeight, barWidth, reflectionHeight);
        }

        // ── Peak hold indicator line ──
        const peakValue = peakHoldRef.current[i];
        if (peakValue > 0.02) {
          const peakDbNorm = valueToDbNorm(peakValue);
          const peakY = fftHeight - peakDbNorm * fftHeight;
          ctx.fillStyle = `rgba(${cachedAccentRgb}, ${0.6 + peakValue * 0.4})`;
          ctx.fillRect(x, peakY - 1.5, barWidth, 2);
        }

        // ── Apply EQ band gain visual indicator ──
        if (bandValue !== 0) {
          const gainIndicator = (bandValue / EQ_MAX) * 0.5;
          ctx.fillStyle = bandValue > 0
            ? `rgba(${cachedAccentRgb}, ${Math.abs(gainIndicator) * 0.15})`
            : `rgba(249, 115, 22, ${Math.abs(gainIndicator) * 0.15})`;
          ctx.fillRect(x, 0, barWidth, fftHeight);
        }
      }

      // ── Spectral centroid indicator ──
      if (centroidMagSum > 0) {
        const rawCentroid = centroidFreqSum / centroidMagSum;
        // Smooth the centroid movement
        spectralCentroidRef.current = spectralCentroidRef.current * 0.85 + rawCentroid * 0.15;
        const centroidX = SCALE_LEFT + spectralCentroidRef.current * drawWidth;

        // Draw centroid indicator: a small triangle at the top
        ctx.save();
        ctx.fillStyle = `rgba(${cachedAccentRgb}, 0.7)`;
        ctx.beginPath();
        ctx.moveTo(centroidX, 2);
        ctx.lineTo(centroidX - 4, 10);
        ctx.lineTo(centroidX + 4, 10);
        ctx.closePath();
        ctx.fill();

        // Vertical line
        ctx.strokeStyle = `rgba(${cachedAccentRgb}, 0.12)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(centroidX, 10);
        ctx.lineTo(centroidX, fftHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── EQ band frequency markers ──
      const bandPositions = EQ_BANDS.map((band) => {
        const minLog = Math.log10(20);
        const maxLog = Math.log10(20000);
        const freqLog = Math.log10(band.frequency);
        return (freqLog - minLog) / (maxLog - minLog);
      });

      ctx.strokeStyle = `rgba(${cachedAccentRgb}, 0.12)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const pos of bandPositions) {
        const x = SCALE_LEFT + pos * drawWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, fftHeight);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // ── Waveform (time-domain) display ──
      if (analyser) {
        getTimeDomainData(waveformArray);
      }

      ctx.save();
      ctx.globalAlpha = 0.3; // Subtle opacity
      ctx.strokeStyle = `rgba(${cachedAccentRgb}, 0.6)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();

      const sliceWidth = drawWidth / waveformArray.length;
      let wx = SCALE_LEFT;

      for (let i = 0; i < waveformArray.length; i++) {
        const v = waveformArray[i] / 255;
        const y = waveformTop + v * waveformHeight;
        if (i === 0) {
          ctx.moveTo(wx, y);
        } else {
          ctx.lineTo(wx, y);
        }
        wx += sliceWidth;
      }
      ctx.stroke();

      // Subtle baseline at center
      ctx.strokeStyle = `rgba(${cachedAccentRgb}, 0.1)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(SCALE_LEFT, waveformTop + waveformHeight / 2);
      ctx.lineTo(width, waveformTop + waveformHeight / 2);
      ctx.stroke();
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [show, eqEnabled, eqBands, isPlaying]);

  // ── Helper: find closest EQ band index for a frequency ──
  const getClosestBandIndex = (freq: number): number => {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const dist = Math.abs(Math.log10(freq) - Math.log10(EQ_BANDS[i].frequency));
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  };

  const handleBandChange = useCallback((bandIndex: number, rawValue: number) => {
    const snapped = Math.round(rawValue / EQ_STEP) * EQ_STEP;
    const clamped = Math.max(EQ_MIN, Math.min(EQ_MAX, snapped));
    setEqBand(bandIndex, clamped);
  }, [setEqBand]);

  const handlePresetClick = useCallback((presetId: string) => {
    if (presetId === eqPreset && eqEnabled) {
      setEqEnabled(false);
      setEqPreset("flat");
    } else {
      setEqPreset(presetId);
      if (!eqEnabled) setEqEnabled(true);
    }
  }, [eqPreset, eqEnabled, setEqPreset, setEqEnabled]);

  const handleToggleEQ = useCallback(() => {
    setEqEnabled(!eqEnabled);
  }, [eqEnabled, setEqEnabled]);

  const normalize = (v: number) => (v - EQ_MIN) / (EQ_MAX - EQ_MIN);
  const denormalize = (v: number) => v * (EQ_MAX - EQ_MIN) + EQ_MIN;

  const formatDb = (v: number) => {
    if (v === 0) return "0";
    return v > 0 ? `+${v}` : `${v}`;
  };

  const handleSliderDown = useCallback((bandIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const updateValue = (clientY: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = clientY - rect.top;
      const pct = 1 - (y / rect.height);
      const raw = denormalize(pct);
      handleBandChange(bandIndex, raw);
    };

    updateValue(e.clientY);

    const onMove = (ev: PointerEvent) => updateValue(ev.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [handleBandChange]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative z-10 rounded-3xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              width: "min(520px, 94vw)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: eqEnabled ? "var(--mq-accent)" : "var(--mq-input-bg)",
                    transition: "background-color 0.2s",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="10" width="2" height="4" rx="1" fill={eqEnabled ? "var(--mq-bg)" : "var(--mq-text-muted)"} />
                    <rect x="5" y="7" width="2" height="7" rx="1" fill={eqEnabled ? "var(--mq-bg)" : "var(--mq-text-muted)"} />
                    <rect x="9" y="4" width="2" height="10" rx="1" fill={eqEnabled ? "var(--mq-bg)" : "var(--mq-text-muted)"} />
                    <rect x="13" y="2" width="2" height="12" rx="1" fill={eqEnabled ? "var(--mq-bg)" : "var(--mq-text-muted)"} />
                  </svg>
                </div>
                <div>
                  <span className="text-sm font-bold block" style={{ color: "var(--mq-text)" }}>
                    Эквалайзер
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    10-полосный параметрический &bull; Live FFT
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleEQ}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: eqEnabled ? "var(--mq-accent)" : "var(--mq-input-bg)",
                    color: eqEnabled ? "var(--mq-bg)" : "var(--mq-text-muted)",
                    border: `1px solid ${eqEnabled ? "var(--mq-accent)" : "var(--mq-border)"}`,
                  }}
                >
                  {eqEnabled ? "ВКЛ" : "ВЫКЛ"}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Presets */}
            <div className="px-5 pb-3">
              <div className="flex gap-1.5 flex-wrap">
                {EQ_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handlePresetClick(preset.id)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                    style={{
                      backgroundColor: eqPreset === preset.id && eqEnabled
                        ? "var(--mq-accent)"
                        : "var(--mq-input-bg)",
                      color: eqPreset === preset.id && eqEnabled
                        ? "var(--mq-bg)"
                        : "var(--mq-text-muted)",
                      border: `1px solid ${eqPreset === preset.id && eqEnabled
                        ? "var(--mq-accent)"
                        : "transparent"}`,
                      boxShadow: eqPreset === preset.id && eqEnabled
                        ? "0 2px 8px var(--mq-glow)"
                        : "none",
                    }}
                  >
                    {preset.name}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Live FFT Canvas — behind the EQ sliders */}
            <div ref={containerRef} className="relative px-4" style={{ height: 300 }}>
              <canvas
                ref={fftCanvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                className="absolute inset-0 w-full h-full rounded-xl"
                style={{
                  opacity: eqEnabled ? 0.6 : 0.15,
                  willChange: "transform",
                }}
              />

              {/* EQ Bands — vertical sliders overlay */}
              <div
                className={`relative z-10 py-3 flex items-end justify-around gap-1 ${!eqEnabled ? "opacity-40 pointer-events-none" : ""}`}
                style={{ height: 300 }}
              >
                {EQ_BANDS.map((band, idx) => {
                  const value = eqBands[idx];
                  const norm = normalize(value);
                  const isPositive = value > 0;
                  const isZero = value === 0;

                  return (
                    <div key={band.frequency} className="flex flex-col items-center gap-1 flex-1 h-full min-w-0">
                      <span
                        className="text-[9px] font-mono font-bold tabular-nums"
                        style={{
                          color: isZero
                            ? "var(--mq-text-muted)"
                            : isPositive
                              ? "var(--mq-accent)"
                              : "#f97316",
                        }}
                      >
                        {formatDb(value)}
                      </span>

                      <div
                        className="relative flex-1 w-full flex items-center cursor-pointer rounded-full overflow-hidden"
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => handleSliderDown(idx, e)}
                      >
                        <div
                          className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 rounded-full"
                          style={{ backgroundColor: "var(--mq-border)" }}
                        />
                        <div
                          className="absolute left-0 right-0 h-[1px] -translate-y-1/2 z-[1]"
                          style={{
                            top: `${normalize(0) * 100}%`,
                            backgroundColor: "var(--mq-text-muted)",
                            opacity: 0.3,
                          }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2 w-[3px] rounded-full z-[2] transition-all duration-75"
                          style={{
                            backgroundColor: isZero
                              ? "var(--mq-accent)"
                              : isPositive
                                ? "var(--mq-accent)"
                                : "#f97316",
                            boxShadow: isZero
                              ? "0 0 4px var(--mq-glow)"
                              : isPositive
                                ? "0 0 6px var(--mq-glow)"
                                : "0 0 6px rgba(249,115,22,0.3)",
                            top: `${Math.min(norm, normalize(0)) * 100}%`,
                            bottom: `${(1 - Math.max(norm, normalize(0))) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full z-[3] border-2 transition-all duration-75"
                          style={{
                            top: `calc(${norm * 100}% - 8px)`,
                            backgroundColor: "var(--mq-card)",
                            borderColor: isZero ? "var(--mq-accent)" : isPositive ? "var(--mq-accent)" : "#f97316",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          }}
                        />
                      </div>

                      <span
                        className="text-[8px] font-medium text-center leading-tight truncate w-full"
                        style={{ color: "var(--mq-text-muted)" }}
                      >
                        {band.labelRu}
                      </span>
                      <span
                        className="text-[7px] text-center leading-tight"
                        style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
                      >
                        {band.frequency >= 1000
                          ? `${band.frequency / 1000}к`
                          : `${band.frequency}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* dB scale labels */}
            <div className="px-5 pb-4">
              <div className="flex justify-between text-[9px]" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>
                <span>+{EQ_MAX} дБ</span>
                <span>0 дБ</span>
                <span>{EQ_MIN} дБ</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
