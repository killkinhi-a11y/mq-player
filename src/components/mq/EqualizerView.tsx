"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, RotateCcw, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX } from "@/lib/eq";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

/**
 * EqualizerView v3 — полная переработка с нуля.
 *
 * v1: 697 строк, canvas FFT анимация — перегруженный.
 * v2: 237 строк, использовал input[type=range] с appearance:slider-vertical —
 *     устаревший подход (deprecated в Chrome 124+, ломается в Firefox).
 * v3: ТЕКУЩАЯ — кастомные вертикальные слайдеры на pointer events.
 *
 * Особенности:
 *  - 10 вертикальных слайдеров, кастомный рендер (pointer events)
 *  - Пресеты в виде чипов (12 штук)
 *  - Включение/выключение одним тапом
 *  - Сброс к плоской
 *  - Дизайн полностью на design tokens (--mq-accent, --mq-card, etc.)
 *  - Поддержка клавиатуры (Esc — закрыть, стрелки на слайдере — ±0.5dB)
 *  - Двойной тап по слайдеру — сброс полосы в 0
 *  - Адаптивный layout: 10 полос всегда помещаются
 */
export default function EqualizerView({ show, onClose }: EqualizerViewProps) {
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqBands = useAppStore((s) => s.eqBands);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const setEqEnabled = useAppStore((s) => s.setEqEnabled);
  const setEqPreset = useAppStore((s) => s.setEqPreset);
  const setEqBand = useAppStore((s) => s.setEqBand);
  const limiterEnabled = useAppStore((s) => s.limiterEnabled);
  const limiterThreshold = useAppStore((s) => s.limiterThreshold);
  const setLimiterEnabled = useAppStore((s) => s.setLimiterEnabled);
  const setLimiterThreshold = useAppStore((s) => s.setLimiterThreshold);

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
    const clamped = Math.max(EQ_MIN, Math.min(EQ_MAX, value));
    setEqBand(index, clamped);
    if (eqPreset !== "custom") {
      setEqPreset("custom");
    }
  }, [setEqBand, eqPreset, setEqPreset]);

  const handleReset = useCallback(() => {
    for (let i = 0; i < EQ_BANDS.length; i++) {
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
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4"
          style={{ backgroundColor: "var(--mq-overlay-scrim)", backdropFilter: "blur(8px) saturate(120%)", WebkitBackdropFilter: "blur(8px) saturate(120%)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 24, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "var(--mq-shadow-dramatic)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 25%, transparent)",
                  }}
                >
                  <Sliders className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                </div>
                <div>
                  <h2 className="text-base font-bold leading-tight" style={{ color: "var(--mq-text)" }}>
                    Эквалайзер
                  </h2>
                  <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    {EQ_BANDS.length}-полосный · {eqEnabled ? "включён" : "выключен"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Reset */}
                <button
                  onClick={handleReset}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--mq-text-muted)" }}
                  title="Сбросить"
                  aria-label="Сбросить"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                {/* Close */}
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--mq-text-muted)" }}
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Presets */}
            <div
              className="px-5 py-3"
              style={{ borderBottom: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex flex-wrap gap-1.5">
                {EQ_PRESETS.map((preset) => {
                  const isActive = preset.id === eqPreset && eqEnabled;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetClick(preset.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: isActive
                          ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                          : "var(--mq-glass-bg)",
                        border: isActive
                          ? "1px solid color-mix(in srgb, var(--mq-accent) 45%, transparent)"
                          : "1px solid var(--mq-border-thin)",
                        color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                        transition: "background-color 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1), color 200ms cubic-bezier(0.4,0,0.2,1)",
                      }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Enabled toggle */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: eqEnabled
                      ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                      : "var(--mq-glass-bg)",
                  }}
                >
                  <Sparkles
                    className="w-3.5 h-3.5"
                    style={{ color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Эквалайзер
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    {eqEnabled ? "Активен — применяет настройки к звуку" : "Выключен — звук без изменений"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEqEnabled(!eqEnabled)}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  backgroundColor: eqEnabled ? "var(--mq-accent)" : "var(--mq-border-thin)",
                  transition: "background-color 200ms cubic-bezier(0.4,0,0.2,1)",
                }}
                role="switch"
                aria-checked={eqEnabled}
                aria-label="Включить эквалайзер"
              >
                <motion.div
                  layout
                  className="absolute top-0.5 w-5 h-5 rounded-full"
                  style={{
                    left: eqEnabled ? 22 : 2,
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              </button>
            </div>

            {/* Band sliders */}
            <div className="px-4 sm:px-5 py-5">
              <div
                className="flex items-end justify-between gap-1 sm:gap-1.5"
                style={{
                  opacity: eqEnabled ? 1 : 0.45,
                  transition: "opacity 200ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {EQ_BANDS.map((band, i) => (
                  <EqBandSlider
                    key={i}
                    label={band.frequency >= 1000 ? `${band.frequency / 1000}k` : `${band.frequency}`}
                    value={eqBands[i] ?? 0}
                    disabled={!eqEnabled}
                    onChange={(v) => handleBandChange(i, v)}
                  />
                ))}
              </div>

              {/* dB scale hint */}
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>+{EQ_MAX} dB</span>
                <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>0</span>
                <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{EQ_MIN} dB</span>
              </div>
            </div>

            {/* ── Look-ahead limiter (Rust DSP on the WASM path; brickwall-mode
                compressor on the element path — real peak control on both) ── */}
            <div
              className="px-4 sm:px-5 py-4 flex items-center justify-between gap-4"
              style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                  Лимитер
                </p>
                <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  {limiterEnabled
                    ? `Ограничение пиков на ${limiterThreshold} дБ`
                    : "Выключен — пики не ограничиваются"}
                </p>
              </div>
              <button
                onClick={() => setLimiterEnabled(!limiterEnabled)}
                className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                style={{
                  backgroundColor: limiterEnabled ? "var(--mq-accent)" : "var(--mq-border-thin)",
                  transition: "background-color 200ms cubic-bezier(0.4,0,0.2,1)",
                }}
                role="switch"
                aria-checked={limiterEnabled}
                aria-label="Включить лимитер"
              >
                <motion.div
                  layout
                  className="absolute top-0.5 w-5 h-5 rounded-full"
                  style={{
                    left: limiterEnabled ? 22 : 2,
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              </button>
            </div>

            {/* Limiter threshold slider */}
            <div
              className="px-4 sm:px-5 pb-5"
              style={{
                opacity: limiterEnabled ? 1 : 0.45,
                transition: "opacity 200ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  Порог
                </span>
                <span className="text-[11px] font-mono" style={{ color: "var(--mq-text)" }}>
                  {limiterThreshold} dB
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={0}
                step={0.5}
                value={limiterThreshold}
                onChange={(e) => setLimiterThreshold(Number(e.target.value))}
                disabled={!limiterEnabled}
                aria-label="Порог лимитера"
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--mq-border-thin)", }}
              />
            </div>

            {/* Footer hint */}
            <div
              className="px-5 py-3 flex items-center justify-center gap-2"
              style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                Двойной тап по слайдеру сбрасывает полосу в 0
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Vertical Band Slider ───────────────────────────────────────────────────

interface EqBandSliderProps {
  label: string;
  value: number; // -12 to +12
  disabled: boolean;
  onChange: (v: number) => void;
}

function EqBandSlider({ label, value, disabled, onChange }: EqBandSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Slider geometry: track is 160px tall, value range is [-12, +12]
  // 0 dB is in the middle.
  const TRACK_HEIGHT = 160;
  const RANGE = EQ_MAX - EQ_MIN; // 24
  // Percent of value from min (0..1)
  const valuePercent = (value - EQ_MIN) / RANGE; // 0 at -12, 0.5 at 0, 1 at +12
  // Position of thumb from top: 0 at +12 (top), TRACK_HEIGHT at -12 (bottom)
  const thumbTop = (1 - valuePercent) * TRACK_HEIGHT;

  const updateFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const clamped = Math.max(0, Math.min(TRACK_HEIGHT, y));
      const pct = 1 - clamped / TRACK_HEIGHT; // 0 at bottom, 1 at top
      const newValue = EQ_MIN + pct * RANGE;
      // Round to 0.5
      const rounded = Math.round(newValue * 2) / 2;
      onChange(rounded);
    },
    [onChange]
  );

  // Pointer events for drag
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      updateFromClientY(e.clientY);
    };
    const onUp = () => {
      setIsDragging(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, updateFromClientY]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    updateFromClientY(e.clientY);
  };

  const handleDoubleClick = () => {
    if (disabled) return;
    onChange(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(value + 0.5);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(value - 0.5);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(EQ_MAX);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(EQ_MIN);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(0);
    }
  };

  // Color band value: positive = accent, negative = muted blue, 0 = neutral
  const isPositive = value > 0;
  const isNegative = value < 0;
  const fillHeight = Math.abs(value) / RANGE * TRACK_HEIGHT; // height of the "fill" portion from 0 line
  const zeroLineTop = TRACK_HEIGHT / 2;

  return (
    <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
      {/* Value label */}
      <span
        className="text-[11px] font-mono font-semibold tabular-nums"
        style={{
          color: isPositive
            ? "var(--mq-accent)"
            : isNegative
              ? "color-mix(in srgb, var(--mq-text-muted) 80%, var(--mq-accent) 20%)"
              : "var(--mq-text-muted)",
          opacity: isDragging || isHovered ? 1 : 0.7,
          transition: "opacity 150ms",
        }}
      >
        {value > 0 ? `+${value}` : value === 0 ? "0" : `${value}`}
      </span>

      {/* Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={EQ_MIN}
        aria-valuemax={EQ_MAX}
        aria-valuenow={value}
        aria-label={`${label} Hz`}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative rounded-full cursor-pointer touch-none select-none flex items-center justify-center"
        style={{
          height: TRACK_HEIGHT,
          // Touch target: 44px wide (WCAG 2.5.8 / mobile usability) — the
          // VISIBLE track is the 6px child; the drag math is vertical-only
          // so a wide hit area does not change the value mapping.
          width: 44,
          outline: "none",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {/* Visible track — 6px visual column centered in the hit area */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
          style={{
            height: TRACK_HEIGHT,
            width: 6,
            backgroundColor: "var(--mq-glass-bg)",
            boxShadow: "var(--mq-shadow-inner-glow)",
          }}
        />

        {/* Zero line — subtle horizontal marker at 0 dB */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3 h-px pointer-events-none"
          style={{
            top: zeroLineTop,
            backgroundColor: "var(--mq-border-default)",
            opacity: 0.6,
          }}
        />

        {/* Fill — from 0 line to current value */}
        {!disabled && value !== 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              top: isPositive ? thumbTop : zeroLineTop,
              height: fillHeight,
              width: 6,
              backgroundColor: "var(--mq-accent)",
              opacity: isDragging ? 1 : 0.9,
              transition: isDragging ? "none" : "top 120ms cubic-bezier(0.4,0,0.2,1), height 120ms cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        )}

        {/* Thumb */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: thumbTop - 7,
            width: 14,
            height: 14,
            backgroundColor: "#fff",
            border: "2px solid var(--mq-accent)",
            boxShadow: isDragging
              ? "var(--mq-shadow-accent-hover), 0 0 0 6px color-mix(in srgb, var(--mq-accent) 18%, transparent)"
              : isHovered
                ? "var(--mq-shadow-accent), 0 0 0 3px color-mix(in srgb, var(--mq-accent) 12%, transparent)"
                : "var(--mq-shadow-sm)",
            opacity: disabled ? 0.5 : 1,
            transition: isDragging
              ? "none"
              : "top 120ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1)",
            cursor: disabled ? "default" : "grab",
          }}
        />
      </div>

      {/* Frequency label */}
      <span
        className="text-[11px] font-semibold text-center tabular-nums"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {label}
      </span>
    </div>
  );
}
