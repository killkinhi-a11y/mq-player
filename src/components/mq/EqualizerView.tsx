"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX, EQ_STEP } from "@/lib/eq";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

export default function EqualizerView({ show, onClose }: EqualizerViewProps) {
  const { eqEnabled, eqBands, eqPreset, setEqEnabled, setEqBand, setEqPreset } = useAppStore();

  const handleBandChange = useCallback((bandIndex: number, rawValue: number) => {
    // Snap to 0.5 step
    const snapped = Math.round(rawValue / EQ_STEP) * EQ_STEP;
    const clamped = Math.max(EQ_MIN, Math.min(EQ_MAX, snapped));
    setEqBand(bandIndex, clamped);
  }, [setEqBand]);

  const handlePresetClick = useCallback((presetId: string) => {
    if (presetId === eqPreset && eqEnabled) {
      // Clicking active preset: disable EQ
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

  // Normalize band value (0-24 → 0-1) for slider position
  const normalize = (v: number) => (v - EQ_MIN) / (EQ_MAX - EQ_MIN);
  // Denormalize slider position (0-1 → -12 to +12)
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
      const pct = 1 - (y / rect.height); // invert: top = max, bottom = min
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
                    5-полосный параметрический
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* EQ Toggle */}
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

            {/* EQ Bands — vertical sliders */}
            <div
              className={`px-5 py-4 flex items-end justify-around gap-2 ${!eqEnabled ? "opacity-40 pointer-events-none" : ""}`}
              style={{ height: 240 }}
            >
              {EQ_BANDS.map((band, idx) => {
                const value = eqBands[idx];
                const norm = normalize(value);
                const isPositive = value > 0;
                const isZero = value === 0;

                return (
                  <div key={band.frequency} className="flex flex-col items-center gap-1.5 flex-1 h-full">
                    {/* dB value */}
                    <span
                      className="text-[10px] font-mono font-bold tabular-nums"
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

                    {/* Slider track */}
                    <div
                      className="relative flex-1 w-full flex items-center cursor-pointer rounded-full overflow-hidden"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handleSliderDown(idx, e)}
                    >
                      {/* Background track */}
                      <div
                        className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 rounded-full"
                        style={{ backgroundColor: "var(--mq-border)" }}
                      />
                      {/* Zero line */}
                      <div
                        className="absolute left-0 right-0 h-[1px] -translate-y-1/2 z-[1]"
                        style={{
                          top: `${normalize(0) * 100}%`,
                          backgroundColor: "var(--mq-text-muted)",
                          opacity: 0.3,
                        }}
                      />
                      {/* Active fill — from zero line to current value */}
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
                      {/* Thumb */}
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

                    {/* Frequency label */}
                    <span
                      className="text-[9px] font-medium text-center leading-tight"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {band.labelRu}
                    </span>
                    <span
                      className="text-[8px] text-center leading-tight"
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
