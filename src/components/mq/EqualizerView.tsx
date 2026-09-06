"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, RotateCcw, Power, AudioWaveform, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX } from "@/lib/eq";
import { getAnalyser, getCompressorReduction } from "@/lib/audioEngine";
import { wasmDiagnostics, isWasmActive } from "@/lib/wasm-audio";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

/**
 * EqualizerView v4 — professional channel-strip redesign.
 *
 * v3 had vertical faders + presets + bypass + limiter, but read as a
 * consumer "EQ dialog". v4 rebuilds the visual language as a real audio
 * tool — WITHOUT fake controls:
 *
 *  - Left: real dB scale (+12…-12, 3dB ticks) aligned to fader geometry
 *  - Center: 10 vertical faders (pointer events) + frequency-response
 *    spline measured from live DOM geometry
 *  - Right: OUT meters — REAL time-domain peak from the active analyser
 *    (works on both element and WASM backends), peak-hold needle,
 *    LUFS-S / true-peak readouts on the WASM path (real engine stats)
 *  - GR (gain-reduction) meter for the limiter: real telemetry —
 *    wasmDiagnostics.gainReductionDb (Rust look-ahead limiter) on the
 *    WASM path, DynamicsCompressorNode.reduction on the element path
 *  - Presets (real), bypass (real), limiter threshold (real, -12..0 dB)
 *  - Q is NOT user-controllable in the engine → not rendered as a
 *    control; the actual per-band Q is disclosed in the fader tooltip
 *
 * Meter updates bypass React state (single rAF loop writes refs) — no
 * per-frame re-renders of the fader bank.
 */

const TRACK_HEIGHT = 160;
const RANGE = EQ_MAX - EQ_MIN; // 24 dB
const DB_TICKS = [12, 9, 6, 3, 0, -3, -6, -9, -12];

// Output meter mapping: -60…0 dB → 0…1
const PEAK_FLOOR_DB = -60;
const peakPct = (db: number) =>
  Math.max(0, Math.min(1, (db - PEAK_FLOOR_DB) / -PEAK_FLOOR_DB));
// GR mapping: 0…24 dB reduction → 0…1
const GR_MAX_DB = 24;
const grPct = (gr: number) => Math.max(0, Math.min(1, gr / GR_MAX_DB));

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

  // ── Frequency-response curve geometry (measured from the live tracks) ──
  const bandsWrapRef = useRef<HTMLDivElement>(null);
  const [curvePath, setCurvePath] = useState("");
  const [curveZeroY, setCurveZeroY] = useState(0);
  const [curveSize, setCurveSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!show || !eqEnabled) return;
    let raf = 0;
    const update = () => {
      const wrap = bandsWrapRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      if (wrapRect.width < 10) return;
      const tracks = Array.from(wrap.querySelectorAll<HTMLElement>(".eq-band-track"));
      if (tracks.length !== EQ_BANDS.length) return;
      const pts: { x: number; y: number }[] = [];
      let zeroY = 0;
      tracks.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const value = eqBands[i] ?? 0;
        const pct = (value - EQ_MIN) / (EQ_MAX - EQ_MIN); // 0..1
        const y = r.top - wrapRect.top + (1 - pct) * r.height;
        pts.push({ x: r.left - wrapRect.left + r.width / 2, y });
        if (i === 0) zeroY = r.top - wrapRect.top + r.height / 2;
      });
      setCurveSize({ w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) });
      setCurveZeroY(Math.round(zeroY));
      setCurvePath(catmullRomPath(pts));
    };
    update();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    if (bandsWrapRef.current) ro.observe(bandsWrapRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [show, eqEnabled, eqBands]);

  // ── Metering refs (rAF-driven, no React re-renders) ──────────────────────
  // Vertical (>=640px) and horizontal (<640px) meter variants mount
  // exclusively, so refs always point at the live DOM.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const on = () => setIsNarrow(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);

  const peakBarVRef = useRef<HTMLDivElement>(null);   // vertical fill
  const peakHoldVRef = useRef<HTMLDivElement>(null);  // vertical hold needle
  const grBarVRef = useRef<HTMLDivElement>(null);     // vertical GR fill
  const peakBarHRef = useRef<HTMLDivElement>(null);   // horizontal fill
  const peakHoldHRef = useRef<HTMLDivElement>(null);  // horizontal hold
  const grBarHRef = useRef<HTMLDivElement>(null);     // horizontal GR fill
  const peakNumRef = useRef<HTMLSpanElement>(null);   // numeric peak dB
  const grNumRef = useRef<HTMLSpanElement>(null);     // numeric GR
  const lufsNumRef = useRef<HTMLSpanElement>(null);   // LUFS-S (WASM)
  const tpNumRef = useRef<HTMLSpanElement>(null);     // true peak (WASM)

  useEffect(() => {
    if (!show) return;
    const buf = new Float32Array(2048);
    let raf = 0;
    let holdPeak = -120;
    let holdAt = 0;
    let lastNumAt = 0;

    const tick = () => {
      const an = getAnalyser();
      let peak = 0;
      if (an) {
        try {
          const n = Math.min(buf.length, an.fftSize || 2048);
          if (typeof an.getFloatTimeDomainData === "function") {
            an.getFloatTimeDomainData(buf);
          } else {
            const b = new Uint8Array(n);
            an.getByteTimeDomainData(b);
            for (let i = 0; i < n; i++) buf[i] = (b[i] - 128) / 128;
          }
          let p = 0;
          for (let i = 0; i < n; i++) {
            const a = Math.abs(buf[i]);
            if (a > p) p = a;
          }
          peak = p;
        } catch { /* analyser mid-rewire — keep last values */ }
      }
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -120;

      // Peak-hold: hold the max ~900 ms, then fall ~24 dB/s
      const now = performance.now();
      if (peakDb >= holdPeak) {
        holdPeak = peakDb;
        holdAt = now;
      } else if (now - holdAt > 900) {
        holdPeak = Math.max(peakDb, holdPeak - 0.4);
      }

      // Real GR: Rust limiter telemetry on WASM, compressor on element
      const gr = isWasmActive()
        ? (wasmDiagnostics.gainReductionDb || 0)
        : getCompressorReduction();

      // Bar writes (every frame)
      const pp = peakPct(peakDb);
      const hp = peakPct(holdPeak);
      const gp = grPct(gr);
      if (peakBarVRef.current) peakBarVRef.current.style.transform = `scaleY(${pp})`;
      if (peakHoldVRef.current) peakHoldVRef.current.style.top = `${(1 - hp) * 100}%`;
      if (grBarVRef.current) grBarVRef.current.style.transform = `scaleY(${gp})`;
      if (peakBarHRef.current) peakBarHRef.current.style.transform = `scaleX(${pp})`;
      if (peakHoldHRef.current) peakHoldHRef.current.style.left = `${hp * 100}%`;
      if (grBarHRef.current) grBarHRef.current.style.transform = `scaleX(${gp})`;

      // Numeric writes (throttled ~8 Hz)
      if (now - lastNumAt > 125) {
        lastNumAt = now;
        const fmt = (db: number) => (db <= -100 ? "-∞" : `${db <= -60 ? "-60" : db.toFixed(1)}`);
        if (peakNumRef.current) peakNumRef.current.textContent = `${fmt(Math.max(peakDb, PEAK_FLOOR_DB))} dB`;
        if (grNumRef.current) grNumRef.current.textContent = gr >= 0.1 ? `−${gr.toFixed(1)} dB` : "0 dB";
        const wasm = isWasmActive();
        if (lufsNumRef.current) {
          const l = wasm ? wasmDiagnostics.lufsShort : null;
          lufsNumRef.current.textContent = l != null && l !== 0 ? `${l.toFixed(1)}` : "—";
        }
        if (tpNumRef.current) {
          const t = wasm ? wasmDiagnostics.truePeakDb : null;
          tpNumRef.current.textContent = t != null && t !== 0 ? `${t.toFixed(1)}` : "—";
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

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
            role="dialog"
            aria-modal="true"
            aria-label="Эквалайзер"
          >
            {/* ── Header: identity + EQ power (bypass) + reset + close ── */}
            <div
              className="flex items-center justify-between px-5 py-4 gap-3"
              style={{ borderBottom: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 25%, transparent)",
                  }}
                >
                  <AudioWaveform className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold leading-tight" style={{ color: "var(--mq-text)" }}>
                    Эквалайзер
                  </h2>
                  <p className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    10 полос · {eqEnabled ? "активен" : "байпас"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* EQ power — pro bypass switch */}
                <button
                  onClick={() => setEqEnabled(!eqEnabled)}
                  className="h-9 px-3 rounded-full flex items-center gap-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: eqEnabled ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-glass-bg)",
                    border: `1px solid ${eqEnabled ? "color-mix(in srgb, var(--mq-accent) 45%, transparent)" : "var(--mq-border-thin)"}`,
                    color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
                  }}
                  role="switch"
                  aria-checked={eqEnabled}
                  aria-label="Включить эквалайзер"
                  title="Bypass (обработка вкл/выкл)"
                >
                  <Power className="w-3.5 h-3.5" />
                  {eqEnabled ? "ON" : "OFF"}
                </button>
                <button
                  onClick={handleReset}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ color: "var(--mq-text-muted)" }}
                  title="Сбросить все полосы в 0"
                  aria-label="Сбросить"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ color: "var(--mq-text-muted)" }}
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Presets ── */}
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
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
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

            {/* ── Channel strip: dB scale | faders | OUT meters ── */}
            <div className="px-4 sm:px-5 py-5">
              <div className="flex gap-2 sm:gap-3">
                {/* dB scale (>=sm) — aligned to the fader track geometry */}
                <div className="hidden sm:flex flex-col items-end justify-between h-[184px] pt-3 pb-[21px] w-8 shrink-0 select-none" aria-hidden="true">
                  {DB_TICKS.map((db) => (
                    <span
                      key={db}
                      className="text-[11px] font-mono tabular-nums leading-none"
                      style={{
                        color: db === 0 ? "var(--mq-text-muted)" : "var(--mq-text-faint, var(--mq-text-muted))",
                        opacity: db === 0 ? 0.9 : 0.6,
                        fontWeight: db === 0 ? 600 : 400,
                      }}
                    >
                      {db > 0 ? `+${db}` : db}
                    </span>
                  ))}
                </div>

                {/* Fader bank + frequency-response curve */}
                <div ref={bandsWrapRef} className="relative flex-1 min-w-0">
                  <div
                    className="flex items-end justify-between gap-0.5 sm:gap-1"
                    style={{
                      opacity: eqEnabled ? 1 : 0.45,
                      transition: "opacity 200ms cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    {EQ_BANDS.map((band, i) => (
                      <EqBandSlider
                        key={i}
                        label={band.frequency >= 1000 ? `${band.frequency / 1000}k` : `${band.frequency}`}
                        bandInfo={`${band.frequency >= 1000 ? `${band.frequency / 1000} кГц` : `${band.frequency} Гц`} · ${band.labelRu} · Q ${band.Q}`}
                        value={eqBands[i] ?? 0}
                        disabled={!eqEnabled}
                        onChange={(v) => handleBandChange(i, v)}
                      />
                    ))}
                  </div>
                  {eqEnabled && curvePath && curveSize.w > 0 && (
                    <svg
                      className="absolute inset-0 pointer-events-none"
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${curveSize.w} ${curveSize.h}`}
                      preserveAspectRatio="none"
                      style={{ zIndex: 5, overflow: "visible" }}
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="eq-curve-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--mq-accent)" stopOpacity="0.30" />
                          <stop offset="50%" stopColor="var(--mq-accent)" stopOpacity="0.10" />
                          <stop offset="100%" stopColor="var(--mq-accent)" stopOpacity="0.30" />
                        </linearGradient>
                      </defs>
                      {curveZeroY > 0 && (
                        <path d={`${curvePath} L ${curveSize.w} ${curveZeroY} L 0 ${curveZeroY} Z`} fill="url(#eq-curve-fill)" />
                      )}
                      <path
                        d={curvePath}
                        fill="none"
                        stroke="var(--mq-accent)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.9"
                      />
                    </svg>
                  )}
                </div>

                {/* OUT meters (>=sm) — REAL peak from the live analyser +
                    GR from the limiter telemetry */}
                <div className="hidden sm:flex flex-col gap-1.5 w-12 shrink-0 pt-3" aria-label="Измерители">
                  {/* Peak meter */}
                  <div className="flex items-stretch gap-1.5">
                    <div
                      className="relative w-3.5 rounded-[3px] overflow-hidden"
                      style={{ height: TRACK_HEIGHT, backgroundColor: "var(--mq-glass-bg)", boxShadow: "var(--mq-shadow-inner-glow)" }}
                    >
                      <div
                        ref={peakBarVRef}
                        className="absolute inset-x-0 bottom-0 origin-bottom"
                        style={{
                          height: "100%",
                          background: "linear-gradient(180deg, #e03131 0%, #e8590c 18%, #f08c00 38%, #2f9e44 100%)",
                          opacity: 0.95,
                        }}
                      />
                      <div
                        ref={peakHoldVRef}
                        className="absolute inset-x-0 h-px"
                        style={{ top: "100%", backgroundColor: "var(--mq-text)", opacity: 0.75 }}
                      />
                    </div>
                    {/* GR meter */}
                    <div className="flex flex-col gap-1">
                      <div
                        className="relative w-2.5 rounded-[3px] overflow-hidden"
                        style={{ height: TRACK_HEIGHT, backgroundColor: "var(--mq-glass-bg)", boxShadow: "var(--mq-shadow-inner-glow)" }}
                      >
                        <div
                          ref={grBarVRef}
                          className="absolute inset-x-0 top-0 origin-top"
                          style={{
                            height: "100%",
                            backgroundColor: "var(--mq-accent)",
                            opacity: 0.85,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* meter labels */}
                  <div className="flex gap-1.5">
                    <span className="flex-1 text-center text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>OUT</span>
                    <span className="w-2.5 text-center text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>GR</span>
                  </div>
                </div>
              </div>

              {/* Frequency labels */}
              <div className="flex sm:pl-9 sm:pr-14 mt-2.5 select-none" aria-hidden="true">
                {EQ_BANDS.map((band, i) => (
                  <span key={i} className="flex-1 min-w-0 text-center text-[11px] font-semibold tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                    {band.frequency >= 1000 ? `${band.frequency / 1000}k` : `${band.frequency}`}
                  </span>
                ))}
              </div>

              {/* Mobile meters — horizontal, same real data */}
              {isNarrow && (
                <div className="mt-4 flex flex-col gap-1.5" aria-label="Измерители">
                  <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-glass-bg)" }}>
                    <div
                      ref={peakBarHRef}
                      className="absolute inset-y-0 left-0 origin-left"
                      style={{ width: "100%", background: "linear-gradient(90deg, #2f9e44 0%, #f08c00 70%, #e03131 100%)", opacity: 0.95 }}
                    />
                    <div ref={peakHoldHRef} className="absolute inset-y-0 w-px" style={{ left: "0%", backgroundColor: "var(--mq-text)", opacity: 0.75 }} />
                  </div>
                  <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-glass-bg)" }}>
                    <div
                      ref={grBarHRef}
                      className="absolute inset-y-0 left-0 origin-left"
                      style={{ width: "100%", backgroundColor: "var(--mq-accent)", opacity: 0.85 }}
                    />
                  </div>
                </div>
              )}

              {/* Numeric metering — real values only */}
              <div className="mt-4 flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }} ref={peakNumRef}>— dB</span>
                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                  <span title="Short-term громкость (LUFS-S, WASM-движок)">LUFS <span ref={lufsNumRef}>—</span></span>
                  <span title="True peak (дБ, WASM-движок)">TP <span ref={tpNumRef}>—</span></span>
                  <span title="Gain reduction лимитера (реальная телеметрия)">GR <span ref={grNumRef} style={{ color: limiterEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>0 dB</span></span>
                </div>
              </div>
            </div>

            {/* ── Look-ahead limiter (Rust DSP on the WASM path; brickwall
                compressor on the element path — real peak control on both) ── */}
            <div
              className="px-4 sm:px-5 py-4 flex items-center justify-between gap-4"
              style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: limiterEnabled
                      ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                      : "var(--mq-glass-bg)",
                  }}
                >
                  <ShieldAlert className="w-3.5 h-3.5" style={{ color: limiterEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                    Лимитер
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {limiterEnabled
                      ? `Потолок ${limiterThreshold} дБ · GR реальный`
                      : "Выключен — пики не ограничиваются"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLimiterEnabled(!limiterEnabled)}
                className="relative w-11 h-6 rounded-full shrink-0"
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

            {/* Limiter threshold */}
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
                style={{ backgroundColor: "var(--mq-border-thin)", accentColor: "var(--mq-accent)" }}
              />
              <div className="flex justify-between mt-1.5 px-0.5 select-none" aria-hidden="true">
                {[-12, -9, -6, -3, 0].map((v) => (
                  <span key={v} className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>{v}</span>
                ))}
              </div>
            </div>

            {/* Footer hint */}
            <div
              className="px-5 py-3 flex items-center justify-center gap-2"
              style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
            >
              <span className="text-[11px] text-center" style={{ color: "var(--mq-text-muted)" }}>
                Двойной тап — сброс полосы · ←/→ или ↑/↓ — шаг 0.5 дБ
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Vertical Band Fader ───────────────────────────────────────────────────

interface EqBandSliderProps {
  label: string;
  bandInfo: string;
  value: number; // -12 to +12
  disabled: boolean;
  onChange: (v: number) => void;
}

/** Catmull-Rom → cubic bezier smooth path through points (pro-EQ curve). */
function catmullRomPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function EqBandSlider({ label, bandInfo, value, disabled, onChange }: EqBandSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const valuePercent = (value - EQ_MIN) / RANGE; // 0 at -12, 0.5 at 0, 1 at +12
  const thumbTop = (1 - valuePercent) * TRACK_HEIGHT;

  const updateFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const clamped = Math.max(0, Math.min(rect.height, y));
      const pct = 1 - clamped / rect.height;
      const newValue = EQ_MIN + pct * RANGE;
      const rounded = Math.round(newValue * 2) / 2;
      onChange(rounded);
    },
    [onChange]
  );

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
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(value + 0.5);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
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

  const isPositive = value > 0;
  const isNegative = value < 0;
  const fillHeight = Math.abs(value) / RANGE * TRACK_HEIGHT;
  const zeroLineTop = TRACK_HEIGHT / 2;

  return (
    <div className="flex-1 flex flex-col items-center gap-2 min-w-0" title={bandInfo}>
      {/* Gain readout — always visible (pro fader) */}
      <span
        className="text-[11px] font-mono font-semibold tabular-nums leading-none"
        style={{
          color: isPositive
            ? "var(--mq-accent)"
            : isNegative
              ? "color-mix(in srgb, var(--mq-text-muted) 80%, var(--mq-accent) 20%)"
              : "var(--mq-text-muted)",
          opacity: isDragging || isHovered ? 1 : 0.85,
          transition: "opacity 150ms",
        }}
      >
        {value > 0 ? `+${value}` : value === 0 ? "0" : `${value}`}
      </span>

      {/* Fader track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={EQ_MIN}
        aria-valuemax={EQ_MAX}
        aria-valuenow={value}
        aria-label={`${bandInfo}, усиление ${value} дБ`}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="eq-band-track relative rounded-full touch-none select-none flex items-center justify-center"
        style={{
          height: TRACK_HEIGHT,
          // Wide hit area (<=44px, shrinks on narrow screens); drag math
          // is vertical-only via getBoundingClientRect — width-agnostic.
          width: "100%",
          maxWidth: 44,
          outline: "none",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {/* Visible rail — 6px column centered in the hit area */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
          style={{
            height: "100%",
            width: 6,
            backgroundColor: "var(--mq-glass-bg)",
            boxShadow: "var(--mq-shadow-inner-glow)",
          }}
        />

        {/* 0 dB detent */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3.5 h-px pointer-events-none"
          style={{
            top: zeroLineTop,
            backgroundColor: "var(--mq-border-default)",
            opacity: 0.7,
          }}
        />

        {/* Gain fill — from 0 dB line to the fader */}
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

        {/* Fader cap — 16px pro cap with center line */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-[5px] pointer-events-none flex items-center justify-center"
          style={{
            top: thumbTop - 8,
            width: 16,
            height: 16,
            backgroundColor: "var(--mq-card)",
            border: `2px solid ${isDragging || isHovered ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 60%, var(--mq-card))"}`,
            boxShadow: isDragging
              ? "var(--mq-shadow-accent-hover), 0 0 0 6px color-mix(in srgb, var(--mq-accent) 18%, transparent)"
              : "var(--mq-shadow-sm)",
            opacity: disabled ? 0.5 : 1,
            transition: isDragging
              ? "none"
              : "top 120ms cubic-bezier(0.4,0,0.2,1), border-color 150ms, box-shadow 150ms",
          }}
        >
          <span
            className="block rounded-full"
            style={{ width: 8, height: 2, backgroundColor: "var(--mq-text-muted)" }}
          />
        </div>
      </div>

      {/* Frequency label — visually hidden here (rendered once below the
          bank to avoid double rows); kept for a11y on the control title. */}
      <span className="sr-only">{label}</span>
    </div>
  );
}
