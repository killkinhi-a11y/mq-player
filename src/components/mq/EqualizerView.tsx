"use client";

import { useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS } from "@/lib/eq";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

/**
 * EqualizerView v2 — полная переработка с нуля.
 *
 * Старый: 697 строк с canvas FFT анимацией, peak hold, spectral centroid,
 * waveform — перегруженный и сложный.
 *
 * Новый: ~200 строк, чистый и минималистичный:
 * - 10 вертикальных слайдеров с метками частот
 * - Пресеты в виде чипов
 * - Включение/выключение одним тапом
 * - Сброс к плоской
 * - Дизайн в стиле проекта (glassmorphic, accent)
 */

export default function EqualizerView({ show, onClose }: EqualizerViewProps) {
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqBands = useAppStore((s) => s.eqBands);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const setEqEnabled = useAppStore((s) => s.setEqEnabled);
  const setEqPreset = useAppStore((s) => s.setEqPreset);
  const setEqBand = useAppStore((s) => s.setEqBand);

  const handlePresetClick = useCallback((presetId: string) => {
    if (presetId === eqPreset && eqEnabled) {
      setEqEnabled(false);
      setEqPreset("flat");
    } else {
      setEqPreset(presetId);
      if (!eqEnabled) setEqEnabled(true);
    }
  }, [eqPreset, eqEnabled, setEqPreset, setEqEnabled]);

  const handleBandChange = useCallback((index: number, value: number) => {
    setEqBand(index, value);
    // Changing a band manually means it's no longer a preset
    if (eqPreset !== "custom") {
      setEqPreset("custom");
    }
  }, [setEqBand, eqPreset, setEqPreset]);

  const handleReset = useCallback(() => {
    // Reset all bands to 0 manually
    for (let i = 0; i < 10; i++) {
      setEqBand(i, 0);
    }
    setEqPreset("flat");
  }, [setEqBand, setEqPreset]);

  // Close on Escape
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
                  <Sliders className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--mq-text)" }}>Эквалайзер</h2>
                  <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>10-полосный</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Reset */}
                <button
                  onClick={handleReset}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: "var(--mq-text-muted)" }}
                  title="Сброс"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                {/* Close */}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Presets */}
            <div className="px-5 py-3 border-b" style={{ borderColor: "var(--mq-border-hairline)" }}>
              <div className="flex flex-wrap gap-2">
                {EQ_PRESETS.map((preset) => {
                  const isActive = preset.id === eqPreset && eqEnabled;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetClick(preset.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: isActive
                          ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                          : "var(--mq-bg)",
                        border: isActive
                          ? "1px solid color-mix(in srgb, var(--mq-accent) 35%, transparent)"
                          : "1px solid var(--mq-border-thin)",
                        color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                        transition: "all 0.2s var(--ease-out, ease-out)",
                      }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* EQ Bands */}
            <div className="px-5 py-6">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Эквалайзер</span>
                <button
                  onClick={() => setEqEnabled(!eqEnabled)}
                  className="relative w-11 h-6 rounded-full"
                  style={{
                    backgroundColor: eqEnabled ? "var(--mq-accent)" : "var(--mq-border-thin)",
                    transition: "background-color 0.2s",
                  }}
                >
                  <motion.div
                    layout
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                    style={{ left: eqEnabled ? 22 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {/* Band sliders */}
              <div
                className="flex items-end justify-between gap-1 sm:gap-2"
                style={{ opacity: eqEnabled ? 1 : 0.4, transition: "opacity 0.2s", height: 180 }}
              >
                {EQ_BANDS.map((band, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    {/* Value label */}
                    <span className="text-[10px] font-mono font-semibold" style={{ color: "var(--mq-text-muted)" }}>
                      {eqBands[i] > 0 ? `+${eqBands[i]}` : eqBands[i]}
                    </span>

                    {/* Slider */}
                    <div className="relative flex-1 w-full" style={{ minHeight: 120 }}>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={eqBands[i]}
                        onChange={(e) => handleBandChange(i, parseInt(e.target.value))}
                        disabled={!eqEnabled}
                        className="eq-slider"
                        style={{
                          writingMode: "vertical-lr" as any,
                          direction: "rtl" as any,
                          width: "100%",
                          height: "100%",
                          appearance: "slider-vertical" as any,
                          WebkitAppearance: "slider-vertical" as any,
                          accentColor: "var(--mq-accent)",
                        }}
                      />
                    </div>

                    {/* Frequency label */}
                    <span className="text-[9px] sm:text-[10px] font-medium text-center" style={{ color: "var(--mq-text-muted)" }}>
                      {band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t" style={{ borderColor: "var(--mq-border-hairline)" }}>
              <p className="text-[11px] text-center" style={{ color: "var(--mq-text-muted)" }}>
                {eqEnabled ? "Эквалайзер активен" : "Эквалайзер выключен — звук без изменений"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
