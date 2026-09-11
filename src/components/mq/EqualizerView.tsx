"use client";

import { useCallback, useRef, useEffect, useState, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, RotateCcw, Power, AudioWaveform, ShieldAlert, Gauge, Zap } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { EQ_BANDS, EQ_PRESETS, EQ_MIN, EQ_MAX } from "@/lib/eq";
import { getAnalyser, getCompressorReduction } from "@/lib/audioEngine";
import { wasmDiagnostics, isWasmActive } from "@/lib/wasm-audio";

interface EqualizerViewProps {
  show: boolean;
  onClose: () => void;
}

/**
 * EqualizerView v6 — MIXER as a real digital audio control surface.
 *
 * v5 was a centered max-w-lg(512px) modal — at 1280/1440/1600 it wasted
 * two-thirds of the viewport, the master module sat under the fader bank
 * as "one more card", there was no output-level control, no clipping
 * indication, and mobile was the desktop modal squeezed.
 *
 * v6 composition:
 *
 *  Desktop (≥1024, max-w-[880px]) — TWO ZONES side by side:
 *  ┌ Header: identity · STATE chip · CLIP led · engine tag · power/reset/× ┐
 *  ├ Eq bank (flex-1)              │ MASTER · OUTPUT (w-[292px], distinct  │
 *  │ presets · dB scale · 10 faders │ surface + left hairline):            │
 *  │ + response spline + freq row   │ OUTPUT fader (real volume→DSP) ·     │
 *  ├                                │ OUT meter + GR meter · PEAK/TP/LUFS/ │
 *  │                                │ GR readouts · LIMITER + threshold    │
 *  └ Footer: interaction hints + engine truth ────────────────────────────┘
 *
 *  Mobile (<640) — REBUILT, not squeezed: full-height sheet, sticky header,
 *  10 full-width faders (vertical drag = accurate even at 32px columns),
 *  compact 5-tick dB scale, master module as horizontal stack: OUTPUT
 *  horizontal fader → OUT/GR horizontal meters → 2×2 readouts → limiter.
 *
 *  Everything the user must read in ONE second:
 *  · signal state  → OUT meter position + peak-hold needle
 *  · level         → PEAK / TRUE PEAK numbers + hold marks
 *  · limiter       → LIMITER ON/OFF chip + GR meter alive
 *  · clipping      → CLIP led latches red 1.5 s + PEAK value red
 *  · preset        → header chip + preset pill accent
 *  · edited bands  → gain fill + accent cap + nonzero readout color
 *
 *  DSP is UNTOUCHED. The OUTPUT fader writes the real master volume
 *  (store volume → audio.volume / wasmBackend.setVolume). Metering is
 *  rAF-driven with ref writes — zero React re-renders per frame.
 */

const TRACK_HEIGHT = 168;
const RANGE = EQ_MAX - EQ_MIN; // 24 dB
const DB_TICKS = [12, 9, 6, 3, 0, -3, -6, -9, -12];
const DB_TICKS_COMPACT = [12, 6, 0, -6, -12];

// Output meter mapping: -60…0 dB → 0…1
const PEAK_FLOOR_DB = -60;
const peakPct = (db: number) =>
  Math.max(0, Math.min(1, (db - PEAK_FLOOR_DB) / -PEAK_FLOOR_DB));
// GR mapping: 0…24 dB reduction → 0…1
const GR_MAX_DB = 24;
const grPct = (gr: number) => Math.max(0, Math.min(1, gr / GR_MAX_DB));

// Vertical/horizontal meter tick scale (pro convention)
const OUT_TICKS = [-60, -40, -24, -12, -6, 0];

// Master (output volume) mapping — the REAL DSP chain applies this as
// amplitude: audio.volume = v/100 (element) / wasm setVolume(v).
// Fader geometry is dB-linear (what ears hear), the store keeps integer %.
const MASTER_MIN_DB = -60;
const MASTER_MAX_DB = 0;
const MASTER_DEFAULT_PCT = 70;
const volumeToDb = (v: number) =>
  v > 0 ? 20 * Math.log10(Math.max(1, v) / 100) : -Infinity;
const dbToVolume = (db: number) => {
  const clamped = Math.max(MASTER_MIN_DB, Math.min(MASTER_MAX_DB, db));
  return Math.round(Math.pow(10, clamped / 20) * 100);
};
const fmtDb = (db: number) =>
  !isFinite(db) ? "−∞" : db <= MASTER_MIN_DB ? "−60" : db >= -0.05 ? "0" : db.toFixed(1);
const MASTER_TICKS = [-60, -40, -24, -12, -6, 0];

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
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);

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
  const clipLedRef = useRef<HTMLSpanElement>(null);   // CLIP indicator

  useEffect(() => {
    if (!show) return;
    const buf = new Float32Array(2048);
    let raf = 0;
    let holdPeak = -120;
    let holdAt = 0;
    let lastNumAt = 0;
    let clipUntil = 0;

    const setClip = (on: boolean) => {
      const led = clipLedRef.current;
      if (!led) return;
      led.dataset.clip = on ? "1" : "0";
    };

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

      // Clipping: sample-peak ≥ -0.1 dBFS, or WASM true-peak ≥ -0.1 dBTP.
      // Latches ~1.5 s so a single hot transient is actually seen.
      const tp = isWasmActive() ? (wasmDiagnostics.truePeakDb ?? -120) : -120;
      if (peakDb >= -0.1 || tp >= -0.1) clipUntil = now + 1500;
      setClip(clipUntil > now);

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
        const shown = Math.max(peakDb, PEAK_FLOOR_DB);
        if (peakNumRef.current) {
          peakNumRef.current.textContent = `${fmt(shown)} dB`;
          peakNumRef.current.style.color = clipUntil > now ? "var(--mq-danger, #e03131)" : "";
        }
        if (grNumRef.current) grNumRef.current.textContent = gr >= 0.1 ? `−${gr.toFixed(1)} dB` : "0 dB";
        const wasm = isWasmActive();
        if (lufsNumRef.current) {
          const l = wasm ? wasmDiagnostics.lufsShort : null;
          lufsNumRef.current.textContent = l != null && l !== 0 ? `${l.toFixed(1)} LU` : "—";
        }
        if (tpNumRef.current) {
          const t = wasm ? wasmDiagnostics.truePeakDb : null;
          tpNumRef.current.textContent = t != null && t !== 0 ? `${t.toFixed(1)} dB` : "—";
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  // ── State chips: preset / custom / bypass (instantly readable) ──
  const presetName = eqPreset === "custom" ? "Свои настройки" : (EQ_PRESETS.find(p => p.id === eqPreset)?.name ?? eqPreset);
  const stateChip = !eqEnabled
    ? { text: "БАЙПАС", tone: "muted" as const }
    : eqPreset === "custom"
      ? { text: "СВОИ", tone: "custom" as const }
      : { text: presetName.toUpperCase(), tone: "preset" as const };

  const masterDb = volumeToDb(volume);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
          style={{ backgroundColor: "var(--mq-overlay-scrim)", backdropFilter: "blur(8px) saturate(120%)", WebkitBackdropFilter: "blur(8px) saturate(120%)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 24, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            /* Mobile: full-height sheet (rebuilt layout, not a squeezed modal).
               ≥640: centered card. ≥1024: wide two-zone control surface. */
            className="w-full max-w-lg sm:max-w-2xl lg:max-w-[880px]
                       h-[100dvh] sm:h-auto
                       rounded-none sm:rounded-3xl
                       overflow-hidden
                       flex flex-col"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "var(--mq-shadow-dramatic)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Эквалайзер и микшер"
          >
            {/* ── Header: identity + STATE + CLIP + engine + power/reset/× ── */}
            <div
              className="flex items-center justify-between px-4 sm:px-5 py-3.5 gap-3 shrink-0"
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold leading-tight" style={{ color: "var(--mq-text)" }}>
                      Эквалайзер
                    </h2>
                    {/* State chip — preset/custom/bypass is obvious at a glance */}
                    <span
                      className="px-2 py-0.5 rounded-full mq-t-meta-2 font-bold tracking-wide shrink-0"
                      style={{
                        backgroundColor:
                          stateChip.tone === "muted"
                            ? "color-mix(in srgb, var(--mq-text-muted) 14%, transparent)"
                            : stateChip.tone === "custom"
                              ? "color-mix(in srgb, var(--mq-text) 12%, transparent)"
                              : "color-mix(in srgb, var(--mq-accent) 16%, transparent)",
                        color:
                          stateChip.tone === "muted"
                            ? "var(--mq-text-muted)"
                            : stateChip.tone === "custom"
                              ? "var(--mq-text)"
                              : "var(--mq-accent)",
                        border: `1px solid ${
                          stateChip.tone === "preset"
                            ? "color-mix(in srgb, var(--mq-accent) 40%, transparent)"
                            : "var(--mq-border-thin)"
                        }`,
                      }}
                    >
                      {stateChip.text}
                    </span>
                    {/* CLIP led — latches red on digital overs, else quiet */}
                    <span
                      ref={clipLedRef}
                      data-clip="0"
                      title="Клиппинг: пик выше −0.1 дБ"
                      className="eq-clip-led px-2 py-0.5 rounded-full mq-t-meta-2 font-bold tracking-wide shrink-0"
                    >
                      CLIP
                    </span>
                  </div>
                  <p className="mq-t-meta-2 leading-tight mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    10 полос · {eqEnabled ? presetName : "обработка выключена"} · движок: {isWasmActive() ? "WASM (Rust DSP)" : "WebAudio"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* EQ power — pro bypass switch */}
                <button
                  onClick={() => setEqEnabled(!eqEnabled)}
                  className="h-9 px-3 rounded-full flex items-center gap-2 text-xs font-semibold mq-icon-btn"
                  style={{
                    ["--mq-rest-bg" as string]: "var(--mq-glass-bg)",
                    ["--mq-active-bg" as string]: "color-mix(in srgb, var(--mq-accent) 16%, transparent)",
                    border: `1px solid ${eqEnabled ? "color-mix(in srgb, var(--mq-accent) 45%, transparent)" : "var(--mq-border-thin)"}`,
                    color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
                  }}
                  role="switch"
                  aria-checked={eqEnabled}
                  data-active={eqEnabled}
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

            {/* Body — desktop: EQ bank | master side by side; mobile: stacked scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-visible">
              <div className="lg:flex lg:items-start lg:gap-0">
                {/* ══ §1 ПОЛОСЫ — fader bank ══ */}
                <div className="px-4 sm:px-5 pt-4 pb-1 lg:flex-1 lg:min-w-0">
                  <div className="flex items-center gap-2 mb-3" aria-hidden="true">
                    <Sliders className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="mq-t-meta-2 font-bold tracking-[0.14em] uppercase" style={{ color: "var(--mq-text-muted)" }}>
                      Полосы · {EQ_BANDS.length}
                    </span>
                    <span className="flex-1 h-px" style={{ backgroundColor: "var(--mq-border-hairline)" }} />
                    <span className="mq-t-num" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                      ±{EQ_MAX} dB
                    </span>
                  </div>

                  {/* Presets — custom state highlighted via store */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {EQ_PRESETS.map((preset) => {
                      const isActive = preset.id === eqPreset && eqEnabled;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handlePresetClick(preset.id)}
                          className="px-3 min-h-[32px] sm:min-h-[30px] rounded-full text-xs font-medium mq-icon-btn"
                          style={{
                            ["--mq-rest-bg" as string]: "var(--mq-glass-bg)",
                            ["--mq-active-bg" as string]: "color-mix(in srgb, var(--mq-accent) 18%, transparent)",
                            border: isActive
                              ? "1px solid color-mix(in srgb, var(--mq-accent) 45%, transparent)"
                              : "1px solid var(--mq-border-thin)",
                            color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                          }}
                          data-active={isActive}
                          aria-pressed={isActive}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                    {/* Custom pill — explicit state, not a hidden mode */}
                    <button
                      onClick={() => { if (!eqEnabled) setEqEnabled(true); setEqPreset("custom"); }}
                      className="px-3 min-h-[32px] sm:min-h-[30px] rounded-full text-xs font-medium mq-icon-btn"
                      style={{
                        ["--mq-rest-bg" as string]: "var(--mq-glass-bg)",
                        ["--mq-active-bg" as string]: "color-mix(in srgb, var(--mq-text) 12%, transparent)",
                        border: `1px solid ${eqPreset === "custom" && eqEnabled ? "color-mix(in srgb, var(--mq-text) 30%, transparent)" : "var(--mq-border-thin)"}`,
                        color: eqPreset === "custom" && eqEnabled ? "var(--mq-text)" : "var(--mq-text-muted)",
                      }}
                      data-active={eqPreset === "custom" && eqEnabled}
                      aria-pressed={eqPreset === "custom" && eqEnabled}
                    >
                      Свои
                    </button>
                  </div>

                  {/* Channel strip: dB scale | faders | curve */}
                  <div className="flex gap-2 sm:gap-3">
                    {/* dB scale — desktop full, mobile compact 5-tick column */}
                    <div className="hidden lg:flex flex-col items-end justify-between h-[192px] pt-3 pb-[21px] w-8 shrink-0 select-none" aria-hidden="true">
                      {DB_TICKS.map((db) => (
                        <span
                          key={db}
                          className="mq-t-num leading-none"
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
                    <div className="lg:hidden flex flex-col items-end justify-between h-[196px] pt-3 pb-[25px] w-5 shrink-0 select-none" aria-hidden="true">
                      {DB_TICKS_COMPACT.map((db) => (
                        <span
                          key={db}
                          className="mq-t-num leading-none"
                          style={{
                            color: db === 0 ? "var(--mq-text-muted)" : "var(--mq-text-faint, var(--mq-text-muted))",
                            opacity: db === 0 ? 0.9 : 0.55,
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
                  </div>

                  {/* Frequency labels */}
                  <div className="flex lg:pl-9 pl-6 mt-2.5 select-none" aria-hidden="true">
                    {EQ_BANDS.map((band, i) => (
                      <span key={i} className="flex-1 min-w-0 text-center mq-t-num font-semibold" style={{ color: "var(--mq-text-muted)" }}>
                        {band.frequency >= 1000 ? `${band.frequency / 1000}k` : `${band.frequency}`}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ══ §2 МАСТЕР · ВЫХОД — the separated control room ══ */}
                <div
                  className="px-4 sm:px-5 pb-4 pt-3 lg:w-[292px] lg:shrink-0"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)", marginTop: 12 }}
                  data-master-module
                >
                  <div
                    className="rounded-2xl p-4 lg:p-4 lg:mt-4"
                    style={{
                      backgroundColor: "var(--mq-surface-1)",
                      border: "1px solid var(--mq-edge-strong)",
                    }}
                    aria-label="Мастер и выход"
                  >
                    <div className="flex items-center gap-2 mb-3.5" aria-hidden="true">
                      <Gauge className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                      <span className="mq-t-meta-2 font-bold tracking-[0.14em] uppercase" style={{ color: "var(--mq-text-muted)" }}>
                        Мастер · Выход
                      </span>
                      <span className="flex-1 h-px" style={{ backgroundColor: "var(--mq-border-hairline)" }} />
                      {/* Limiter status — one glance */}
                      <span
                        className="px-2 py-0.5 rounded-full mq-t-meta-2 font-bold tracking-wide"
                        style={{
                          backgroundColor: limiterEnabled ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "color-mix(in srgb, var(--mq-text-muted) 12%, transparent)",
                          color: limiterEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
                        }}
                      >
                        LIMITER {limiterEnabled ? "ON" : "OFF"}
                      </span>
                    </div>

                    {/* ── OUTPUT fader (desktop: vertical, beside meters) ── */}
                    <div className="hidden lg:flex gap-3.5">
                      <MasterFaderV volume={volume} onChange={setVolume} masterDb={masterDb} />
                      {/* Meters column with dB tick scale */}
                      <div className="flex gap-2.5 shrink-0">
                        {/* OUT peak meter */}
                        <div className="flex gap-1" aria-label="Пиковый метр выхода">
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
                          {/* dB tick scale beside the meter */}
                          <div className="flex flex-col justify-between h-[168px] py-0 select-none" aria-hidden="true">
                            {OUT_TICKS.map(t => (
                              <span key={t} className="mq-t-num leading-none" style={{ color: "var(--mq-text-muted)", opacity: 0.65 }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* GR meter */}
                        <div className="flex flex-col items-center gap-1" aria-label="Gain reduction">
                          <div
                            className="relative w-2.5 rounded-[3px] overflow-hidden"
                            style={{
                              height: TRACK_HEIGHT,
                              backgroundColor: "var(--mq-glass-bg)",
                              boxShadow: "var(--mq-shadow-inner-glow)",
                              opacity: limiterEnabled ? 1 : 0.45,
                              transition: "opacity 200ms",
                            }}
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
                          <span className="mq-t-num font-bold" style={{ color: "var(--mq-text-muted)" }}>GR</span>
                        </div>
                      </div>
                      <span className="mq-t-num font-bold self-start pt-3" style={{ color: "var(--mq-text-muted)" }}>OUT</span>
                    </div>

                    {/* ── OUTPUT fader (mobile/tablet: horizontal, above meters) ── */}
                    <div className="lg:hidden mb-3">
                      <MasterFaderH volume={volume} onChange={setVolume} masterDb={masterDb} />
                    </div>

                    {/* Mobile (<sm): horizontal meters */}
                    <div className="lg:hidden flex flex-col gap-1.5 mb-3" aria-label="Измерители">
                      <div className="flex items-center gap-2">
                        <span className="mq-t-num font-bold w-7 shrink-0" style={{ color: "var(--mq-text-muted)" }}>OUT</span>
                        <div className="relative flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-glass-bg)" }}>
                          <div
                            ref={peakBarHRef}
                            className="absolute inset-y-0 left-0 origin-left"
                            style={{ width: "100%", background: "linear-gradient(90deg, #2f9e44 0%, #f08c00 70%, #e03131 100%)", opacity: 0.95 }}
                          />
                          <div ref={peakHoldHRef} className="absolute inset-y-0 w-px" style={{ left: "0%", backgroundColor: "var(--mq-text)", opacity: 0.75 }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2" style={{ opacity: limiterEnabled ? 1 : 0.45, transition: "opacity 200ms" }}>
                        <span className="mq-t-num font-bold w-7 shrink-0" style={{ color: "var(--mq-text-muted)" }}>GR</span>
                        <div className="relative flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-glass-bg)" }}>
                          <div
                            ref={grBarHRef}
                            className="absolute inset-y-0 left-0 origin-left"
                            style={{ width: "100%", backgroundColor: "var(--mq-accent)", opacity: 0.85 }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Readout cluster — 2×2, tabular numerals, instantly readable */}
                    <div className="grid grid-cols-2 gap-2 mt-3" role="status" aria-label="Показатели выхода">
                      <Readout label="PEAK" ref={peakNumRef} value="— dB" title="Пиковый уровень выхода (красный = клиппинг)" />
                      <Readout label="LUFS-S" ref={lufsNumRef} value="—" title="Short-term громкость — только с WASM-движком" />
                      <Readout label="TRUE PEAK" ref={tpNumRef} value="—" title="True peak (дБ) — только с WASM-движком" />
                      <Readout label="GAIN RED" ref={grNumRef} value="0 dB" accent={limiterEnabled} dimmed={!limiterEnabled} title="Gain reduction лимитера (реальная телеметрия)" />
                    </div>

                    {/* Limiter: switch + threshold in one row */}
                    <div
                      className="rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 mt-3"
                      style={{ backgroundColor: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: limiterEnabled ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "var(--mq-glass-bg)",
                          }}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" style={{ color: limiterEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                        </div>
                        <div className="min-w-0">
                          <p className="mq-t-body font-semibold" style={{ color: "var(--mq-text)" }}>Лимитер</p>
                          <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {limiterEnabled ? `Потолок ${limiterThreshold} дБ` : "Пики не ограничиваются"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setLimiterEnabled(!limiterEnabled)}
                        className="relative w-11 h-6 rounded-full shrink-0 transition-colors"
                        style={{
                          backgroundColor: limiterEnabled ? "var(--mq-accent)" : "var(--mq-border-thin)",
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

                    {/* Threshold with dB scale */}
                    <div
                      className="mt-3"
                      style={{
                        opacity: limiterEnabled ? 1 : 0.45,
                        transition: "opacity 200ms cubic-bezier(0.4,0,0.2,1)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>Порог</span>
                        <span className="mq-t-num font-bold" style={{ color: "var(--mq-text)", fontSize: 13 }}>{limiterThreshold} dB</span>
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={0}
                        step={0.5}
                        value={limiterThreshold}
                        onChange={(e) => setLimiterThreshold(Number(e.target.value))}
                        onDoubleClick={() => setLimiterThreshold(-1)}
                        disabled={!limiterEnabled}
                        aria-label="Порог лимитера"
                        title="Двойной клик — сброс на −1 дБ"
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
                        style={{ backgroundColor: "var(--mq-border-thin)", accentColor: "var(--mq-accent)" }}
                      />
                      <div className="flex justify-between mt-1 px-0.5 select-none" aria-hidden="true">
                        {[-12, -9, -6, -3, 0].map((v) => (
                          <span key={v} className="mq-t-num" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>{v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div
              className="px-5 py-3 flex items-center justify-center gap-2 shrink-0"
              style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
            >
              <span className="mq-t-meta-2 text-center" style={{ color: "var(--mq-text-muted)" }}>
                Двойной клик — сброс полосы / мастера · ←/→ или ↑/↓ — шаг 0.5 дБ
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Readout — labeled numeric value (tabular, instantly readable) ───
function Readout({ label, value, title, accent, dimmed, ref }: {
  label: string;
  value: string;
  title: string;
  accent?: boolean;
  dimmed?: boolean;
  ref: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 min-w-0"
      style={{
        backgroundColor: "var(--mq-surface-2)",
        border: `1px solid ${accent ? "color-mix(in srgb, var(--mq-accent) 30%, transparent)" : "var(--mq-edge)"}`,
        opacity: dimmed ? 0.6 : 1,
        transition: "opacity 200ms",
      }}
      title={title}
    >
      <p className="mq-t-meta-2 font-bold tracking-[0.1em] uppercase leading-none mb-1" style={{ color: "var(--mq-text-muted)" }}>
        {label}
      </p>
      <span ref={ref} className="mq-t-num font-bold block truncate leading-none" style={{ color: accent ? "var(--mq-accent)" : "var(--mq-text)", fontSize: 15 }}>
        {value}
      </span>
    </div>
  );
}

// ─── Master OUTPUT fader (vertical — desktop master module) ───────────────
function MasterFaderV({ volume, onChange, masterDb }: {
  volume: number;
  onChange: (v: number) => void;
  masterDb: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromClientY = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const pct = 1 - y / rect.height;
    const db = MASTER_MIN_DB + pct * (MASTER_MAX_DB - MASTER_MIN_DB);
    onChange(dbToVolume(db));
  }, [onChange]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      updateFromClientY(e.clientY);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, updateFromClientY]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(100, volume + 2));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(0, volume - 2));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(100);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(MASTER_DEFAULT_PCT);
    }
  };

  const pct = (volumeToDb(volume) - MASTER_MIN_DB) / (MASTER_MAX_DB - MASTER_MIN_DB);
  const capTop = (1 - pct) * TRACK_HEIGHT;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      {/* Output level readout — the one big number of the master section */}
      <span className="mq-t-num font-bold leading-none" style={{ color: "var(--mq-text)", fontSize: 13 }}>
        {fmtDb(masterDb)}
      </span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volume}
        aria-label="Выход — общая громкость"
        aria-valuetext={`${volume}% (${fmtDb(masterDb)} дБ)`}
        onPointerDown={(e) => { e.preventDefault(); setIsDragging(true); updateFromClientY(e.clientY); }}
        onDoubleClick={() => onChange(MASTER_DEFAULT_PCT)}
        onKeyDown={handleKeyDown}
        title="Выход · двойной клик — 70%"
        className="eq-band-track relative rounded-full touch-none select-none flex items-center justify-center cursor-pointer"
        style={{ height: TRACK_HEIGHT, width: "100%", maxWidth: 44, outline: "none" }}
      >
        {/* Visible rail */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
          style={{ height: "100%", width: 6, backgroundColor: "var(--mq-glass-bg)", boxShadow: "var(--mq-shadow-inner-glow)" }}
        />
        {/* 0 dB (unity) detent at the top */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3.5 h-px pointer-events-none"
          style={{ top: 1, backgroundColor: "var(--mq-border-default)", opacity: 0.7 }}
        />
        {/* Fill from bottom to the cap */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-0 rounded-full pointer-events-none"
          style={{
            height: (1 - capTop / TRACK_HEIGHT) * TRACK_HEIGHT,
            width: 6,
            backgroundColor: "var(--mq-accent)",
            opacity: isDragging ? 1 : 0.9,
            transition: isDragging ? "none" : "height 120ms cubic-bezier(0.4,0,0.2,1)",
          }}
        />
        {/* Cap */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-[5px] pointer-events-none flex items-center justify-center"
          style={{
            top: capTop - 8,
            width: 16,
            height: 16,
            backgroundColor: "var(--mq-card)",
            border: `2px solid ${isDragging ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 60%, var(--mq-card))"}`,
            boxShadow: isDragging
              ? "var(--mq-shadow-accent-hover), 0 0 0 6px color-mix(in srgb, var(--mq-accent) 18%, transparent)"
              : "var(--mq-shadow-sm)",
            transition: isDragging ? "none" : "top 120ms cubic-bezier(0.4,0,0.2,1), border-color 150ms, box-shadow 150ms",
          }}
        >
          <span className="block rounded-full" style={{ width: 8, height: 2, backgroundColor: "var(--mq-text-muted)" }} />
        </div>
      </div>
      {/* dB tick scale (left of fader is busy — ticks under the label col) */}
      <div className="flex flex-col justify-between h-[150px] select-none shrink-0" aria-hidden="true">
        {MASTER_TICKS.slice().reverse().map(t => (
          <span key={t} className="mq-t-num leading-none text-right w-6" style={{ color: "var(--mq-text-muted)", opacity: 0.65 }}>
            {t}
          </span>
        ))}
      </div>
      <span className="mq-t-meta-2 font-bold tracking-wide uppercase" style={{ color: "var(--mq-accent)" }}>OUT</span>
    </div>
  );
}

// ─── Master OUTPUT fader (horizontal — mobile master module) ──────────────
function MasterFaderH({ volume, onChange, masterDb }: {
  volume: number;
  onChange: (v: number) => void;
  masterDb: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = x / rect.width;
    const db = MASTER_MIN_DB + pct * (MASTER_MAX_DB - MASTER_MIN_DB);
    onChange(dbToVolume(db));
  }, [onChange]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      updateFromClientX(e.clientX);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, updateFromClientX]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(100, volume + 2));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(0, volume - 2));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(100);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(MASTER_DEFAULT_PCT);
    }
  };

  const pct = (volumeToDb(volume) - MASTER_MIN_DB) / (MASTER_MAX_DB - MASTER_MIN_DB);
  const valuePct = Math.max(0, Math.min(1, pct));

  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{ backgroundColor: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}
      aria-label="Выход — общая громкость"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="mq-t-meta-2 font-bold tracking-[0.14em] uppercase" style={{ color: "var(--mq-text-muted)" }}>
          Выход
        </span>
        <span className="mq-t-num font-bold leading-none" style={{ color: "var(--mq-text)", fontSize: 13 }}>
          {fmtDb(masterDb)} <span className="mq-t-meta-2" style={{ fontWeight: 500 }}>дБ · {volume}%</span>
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volume}
        aria-label="Выход — общая громкость"
        aria-valuetext={`${volume}% (${fmtDb(masterDb)} дБ)`}
        onPointerDown={(e) => { e.preventDefault(); setIsDragging(true); updateFromClientX(e.clientX); }}
        onDoubleClick={() => onChange(MASTER_DEFAULT_PCT)}
        onKeyDown={handleKeyDown}
        title="Выход · двойной клик — 70%"
        className="relative h-8 rounded-full touch-none select-none cursor-pointer"
        style={{ backgroundColor: "var(--mq-glass-bg)" }}
      >
        {/* dB tick marks */}
        {MASTER_TICKS.map(t => {
          const p = (t - MASTER_MIN_DB) / (MASTER_MAX_DB - MASTER_MIN_DB);
          return (
            <div
              key={t}
              className="absolute w-px h-1.5 top-0.5 pointer-events-none"
              style={{ left: `${p * 100}%`, backgroundColor: "var(--mq-text-muted)", opacity: t === 0 ? 0.5 : 0.25 }}
            />
          );
        })}
        {/* Fill */}
        <div
          className="absolute inset-y-1 left-1 rounded-full pointer-events-none"
          style={{
            width: `calc(${valuePct * 100}% - 4px)`,
            backgroundColor: "var(--mq-accent)",
            opacity: 0.9,
            transition: isDragging ? "none" : "width 120ms cubic-bezier(0.4,0,0.2,1)",
          }}
        />
        {/* Cap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-[5px] pointer-events-none flex items-center justify-center"
          style={{
            left: `calc(${valuePct * 100}% - 9px)`,
            width: 18,
            height: 18,
            backgroundColor: "var(--mq-card)",
            border: `2px solid ${isDragging ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 60%, var(--mq-card))"}`,
            boxShadow: isDragging ? "var(--mq-shadow-accent-hover)" : "var(--mq-shadow-sm)",
            transition: isDragging ? "none" : "left 120ms cubic-bezier(0.4,0,0.2,1), border-color 150ms",
          }}
        >
          <span className="block rounded-full" style={{ width: 2, height: 8, backgroundColor: "var(--mq-text-muted)" }} />
        </div>
      </div>
    </div>
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
    const c1y = p1.y + (p2.y - p1.y) / 6;
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
        className="mq-t-num font-bold leading-none"
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
