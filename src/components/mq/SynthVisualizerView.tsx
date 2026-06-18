"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Activity, BarChart3, Waves } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
  getAnalyser,
  getFrequencyData,
  getTimeDomainData,
  getAudioElement,
  getAdaptiveCanvasScale,
  recordFrameTime,
} from "@/lib/audioEngine";

interface SynthVisualizerViewProps {
  show: boolean;
  onClose: () => void;
}

type VisTab = "oscilloscope" | "spectrum" | "spectrogram";

/**
 * Synth Visualizer — осциллограф + спектрограмма + спектр
 * Вдохновлено видео "ESSENTIALS OF SYNTHESIS" от Wanderwave
 * Показывает форму волны, гармонический спектр и спектрограмму в реальном времени
 */
export default function SynthVisualizerView({ show, onClose }: SynthVisualizerViewProps) {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const [activeTab, setActiveTab] = useState<VisTab>("oscilloscope");

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 460, h: 340 });

  // Spectrogram scroll buffer
  const spectrogramRef = useRef<{
    offscreen: HTMLCanvasElement | null;
    x: number;
  }>({ offscreen: null, x: 0 });

  // CSS variable cache
  const cssCacheRef = useRef({ accent: "#E53E3E", accentRgb: "229, 62, 62", time: 0 });

  // ── ResizeObserver ──
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

  // ── Update CSS cache ──
  const updateCssCache = useCallback(() => {
    const now = performance.now();
    if (now - cssCacheRef.current.time < 2000) return;
    cssCacheRef.current.time = now;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--mq-accent")
      .trim() || "#E53E3E";
    cssCacheRef.current.accent = raw;
    const tempEl = document.createElement("div");
    tempEl.style.color = raw;
    document.body.appendChild(tempEl);
    const computed = getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);
    const match = computed.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      cssCacheRef.current.accentRgb = `${match[1]}, ${match[2]}, ${match[3]}`;
    }
  }, []);

  // ── Main visualization loop ──
  useEffect(() => {
    if (!show) return;

    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const analyser = getAnalyser();
    const binCount = analyser?.frequencyBinCount || 1024;
    const freqArray = new Uint8Array(binCount);
    const timeArray = new Uint8Array(binCount);

    // Initialize spectrogram offscreen canvas
    if (!spectrogramRef.current.offscreen) {
      spectrogramRef.current.offscreen = document.createElement("canvas");
      spectrogramRef.current.offscreen.width = canvasSize.w;
      spectrogramRef.current.offscreen.height = canvasSize.h;
      spectrogramRef.current.x = 0;
    }

    const draw = (timestamp: number) => {
      recordFrameTime(timestamp);
      updateCssCache();

      const width = canvas.width;
      const height = canvas.height;
      const accentRgb = cssCacheRef.current.accentRgb;

      // Clear
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);

      // Get audio data
      if (analyser) {
        getFrequencyData(freqArray);
        getTimeDomainData(timeArray);
      }

      if (activeTab === "oscilloscope") {
        drawOscilloscope(ctx, timeArray, freqArray, width, height, accentRgb);
      } else if (activeTab === "spectrum") {
        drawSpectrum(ctx, freqArray, binCount, width, height, accentRgb);
      } else if (activeTab === "spectrogram") {
        drawSpectrogram(ctx, freqArray, binCount, width, height, accentRgb);
      }

      // Info overlay
      drawInfoOverlay(ctx, width, height, accentRgb);

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [show, activeTab, canvasSize, updateCssCache]);

  // ── Oscilloscope: real-time waveform + harmonic series overlay ──
  const drawOscilloscope = (
    ctx: CanvasRenderingContext2D,
    timeArray: Uint8Array,
    freqArray: Uint8Array,
    w: number, h: number,
    accentRgb: string,
  ) => {
    const centerY = h * 0.45;
    const amplitude = h * 0.32;
    const padding = 30;
    const drawW = w - padding * 2;

    // ── Grid ──
    ctx.save();
    ctx.strokeStyle = `rgba(${accentRgb}, 0.06)`;
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(padding, centerY);
    ctx.lineTo(w - padding, centerY);
    ctx.stroke();

    // Vertical lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (drawW / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, centerY - amplitude - 10);
      ctx.lineTo(x, centerY + amplitude + 10);
      ctx.stroke();
    }

    // Horizontal amplitude lines (+/- 0.5, +/- 1.0)
    for (const mult of [-1, -0.5, 0.5, 1]) {
      const y = centerY - mult * amplitude;
      ctx.strokeStyle = `rgba(${accentRgb}, ${Math.abs(mult) === 1 ? 0.1 : 0.04})`;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    }

    // Labels
    ctx.font = `${Math.max(9, Math.round(h * 0.028))}px monospace`;
    ctx.fillStyle = `rgba(${accentRgb}, 0.3)`;
    ctx.textAlign = "right";
    ctx.fillText("+1", padding - 4, centerY - amplitude + 3);
    ctx.fillText("0", padding - 4, centerY + 3);
    ctx.fillText("-1", padding - 4, centerY + amplitude + 3);
    ctx.restore();

    // ── Main waveform ──
    ctx.save();
    // Glow
    ctx.shadowColor = `rgba(${accentRgb}, 0.5)`;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(${accentRgb}, 0.9)`;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = drawW / timeArray.length;
    let x = padding;

    for (let i = 0; i < timeArray.length; i++) {
      const v = (timeArray[i] - 128) / 128; // -1..1
      const y = centerY - v * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

    // Second pass: brighter, thinner line on top
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${accentRgb}, 0.6)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    x = padding;
    for (let i = 0; i < timeArray.length; i++) {
      const v = (timeArray[i] - 128) / 128;
      const y = centerY - v * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    ctx.restore();

    // ── Harmonic peaks (bottom section) ──
    const harmonicsY = h * 0.78;
    const harmonicsH = h * 0.18;
    const numHarmonics = 32;

    ctx.save();
    ctx.font = `${Math.max(8, Math.round(h * 0.024))}px monospace`;
    ctx.fillStyle = `rgba(${accentRgb}, 0.25)`;
    ctx.textAlign = "left";
    ctx.fillText("Гармоники", padding, harmonicsY - 6);

    for (let i = 0; i < numHarmonics; i++) {
      const binIndex = Math.floor(Math.pow(i / numHarmonics, 1.3) * freqArray.length * 0.5);
      const value = freqArray[Math.min(binIndex, freqArray.length - 1)] / 255;
      const barW = (drawW / numHarmonics) * 0.7;
      const barGap = (drawW / numHarmonics) * 0.3;
      const bx = padding + i * (barW + barGap);
      const barH = value * harmonicsH;

      const alpha = 0.2 + value * 0.8;
      const gradient = ctx.createLinearGradient(bx, harmonicsY + harmonicsH, bx, harmonicsY + harmonicsH - barH);
      gradient.addColorStop(0, `rgba(${accentRgb}, ${alpha * 0.3})`);
      gradient.addColorStop(1, `rgba(${accentRgb}, ${alpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(bx, harmonicsY + harmonicsH - barH, barW, barH);
    }

    // Baseline
    ctx.strokeStyle = `rgba(${accentRgb}, 0.1)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, harmonicsY + harmonicsH);
    ctx.lineTo(w - padding, harmonicsY + harmonicsH);
    ctx.stroke();
    ctx.restore();
  };

  // ── Spectrum: detailed FFT with peak tracking ──
  const drawSpectrum = (
    ctx: CanvasRenderingContext2D,
    freqArray: Uint8Array,
    binCount: number,
    w: number, h: number,
    accentRgb: string,
  ) => {
    const padding = 40;
    const drawW = w - padding;
    const drawH = h - 30;
    const topPad = 15;

    // ── Grid ──
    ctx.save();
    ctx.strokeStyle = `rgba(${accentRgb}, 0.06)`;
    ctx.lineWidth = 1;
    ctx.font = `${Math.max(8, Math.round(h * 0.025))}px monospace`;
    ctx.fillStyle = `rgba(${accentRgb}, 0.2)`;
    ctx.textAlign = "right";

    // dB scale
    for (let db = 0; db >= -48; db -= 12) {
      const norm = (db + 48) / 48;
      const y = topPad + (1 - norm) * drawH;
      ctx.strokeStyle = `rgba(${accentRgb}, 0.05)`;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db} дБ`, padding - 4, y + 3);
    }

    // Frequency labels
    ctx.textAlign = "center";
    const freqLabels = [100, 500, 1000, 2000, 5000, 10000, 20000];
    for (const f of freqLabels) {
      const minLog = Math.log10(20);
      const maxLog = Math.log10(22050);
      const pos = (Math.log10(f) - minLog) / (maxLog - minLog);
      const x = padding + pos * drawW;
      if (x < padding || x > w) continue;
      ctx.strokeStyle = `rgba(${accentRgb}, 0.05)`;
      ctx.beginPath();
      ctx.moveTo(x, topPad);
      ctx.lineTo(x, topPad + drawH);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}к` : `${f}`, x, topPad + drawH + 12);
    }
    ctx.restore();

    // ── FFT bars with logarithmic mapping ──
    const barCount = 200;
    const barTotalW = drawW / barCount;
    const barW = barTotalW * 0.75;
    const minLog = Math.log10(20);
    const maxLog = Math.log10(22050);

    ctx.save();
    for (let i = 0; i < barCount; i++) {
      const logPos = i / barCount;
      const freq = Math.pow(10, minLog + logPos * (maxLog - minLog));
      const binIndex = Math.floor((freq / 22050) * binCount);
      const value = freqArray[Math.min(binIndex, binCount - 1)] / 255;

      const x = padding + i * barTotalW;
      const dbNorm = (20 * Math.log10(Math.max(value, 1e-6)) + 48) / 48;
      const barH = Math.max(1, dbNorm * drawH);

      const alpha = 0.15 + value * 0.85;
      const gradient = ctx.createLinearGradient(x, topPad + drawH, x, topPad + drawH - barH);
      gradient.addColorStop(0, `rgba(${accentRgb}, ${alpha * 0.2})`);
      gradient.addColorStop(0.4, `rgba(${accentRgb}, ${alpha * 0.5})`);
      gradient.addColorStop(1, `rgba(${accentRgb}, ${alpha})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, topPad + drawH - barH, barW, barH);

      // Glow for loud bars
      if (value > 0.5) {
        ctx.shadowColor = `rgba(${accentRgb}, ${value * 0.4})`;
        ctx.shadowBlur = value * 10;
        ctx.fillRect(x, topPad + drawH - barH, barW, barH);
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();

    // ── Spectral centroid indicator ──
    let centroidSum = 0;
    let magSum = 0;
    for (let i = 0; i < binCount; i++) {
      const v = freqArray[i] / 255;
      centroidSum += i * v;
      magSum += v;
    }
    if (magSum > 0) {
      const centroid = centroidSum / magSum / binCount;
      const cx = padding + centroid * drawW;
      ctx.save();
      ctx.fillStyle = `rgba(${accentRgb}, 0.6)`;
      ctx.beginPath();
      ctx.moveTo(cx, topPad);
      ctx.lineTo(cx - 5, topPad + 8);
      ctx.lineTo(cx + 5, topPad + 8);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(${accentRgb}, 0.15)`;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, topPad + 8);
      ctx.lineTo(cx, topPad + drawH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };

  // ── Spectrogram: waterfall frequency display over time ──
  const drawSpectrogram = (
    ctx: CanvasRenderingContext2D,
    freqArray: Uint8Array,
    binCount: number,
    w: number, h: number,
    accentRgb: string,
  ) => {
    const offscreen = spectrogramRef.current.offscreen;
    if (!offscreen) return;

    // Resize offscreen if needed
    if (offscreen.width !== w || offscreen.height !== h) {
      offscreen.width = w;
      offscreen.height = h;
      spectrogramRef.current.x = 0;
    }

    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const columnWidth = 2;
    const currentX = spectrogramRef.current.x;

    // Scroll: shift existing content left
    if (currentX + columnWidth > w) {
      const imageData = offCtx.getImageData(columnWidth, 0, w - columnWidth, h);
      offCtx.putImageData(imageData, 0, 0);
      offCtx.fillStyle = "#0a0a0f";
      offCtx.fillRect(w - columnWidth, 0, columnWidth, h);
    }

    // Draw new column
    const drawX = Math.min(currentX, w - columnWidth);
    const numBands = Math.min(h, 256);

    for (let y = 0; y < numBands; y++) {
      // Map y position to frequency bin (logarithmic)
      const freqPos = 1 - y / numBands; // bottom = low, top = high
      const minLog = Math.log10(20);
      const maxLog = Math.log10(22050);
      const freq = Math.pow(10, minLog + freqPos * (maxLog - minLog));
      const binIndex = Math.floor((freq / 22050) * binCount);
      const value = freqArray[Math.min(binIndex, binCount - 1)] / 255;

      // Color mapping: black → accent color → white
      let r: number, g: number, b: number;
      const [ar, ag, ab] = accentRgb.split(",").map(v => parseInt(v.trim()));

      if (value < 0.3) {
        const t = value / 0.3;
        r = Math.round(10 + t * ar * 0.3);
        g = Math.round(10 + t * ag * 0.3);
        b = Math.round(15 + t * ab * 0.3);
      } else if (value < 0.7) {
        const t = (value - 0.3) / 0.4;
        r = Math.round(ar * 0.3 + t * (ar - ar * 0.3));
        g = Math.round(ag * 0.3 + t * (ag - ag * 0.3));
        b = Math.round(ab * 0.3 + t * (ab - ab * 0.3));
      } else {
        const t = (value - 0.7) / 0.3;
        r = Math.round(ar + t * (255 - ar));
        g = Math.round(ag + t * (255 - ag));
        b = Math.round(ab + t * (255 - ab));
      }

      offCtx.fillStyle = `rgb(${r},${g},${b})`;
      offCtx.fillRect(drawX, y, columnWidth, 1);
    }

    spectrogramRef.current.x = currentX + columnWidth;
    if (spectrogramRef.current.x >= w) {
      spectrogramRef.current.x = w - columnWidth;
    }

    // Copy offscreen to main canvas
    ctx.drawImage(offscreen, 0, 0);

    // ── Frequency scale overlay ──
    ctx.save();
    ctx.font = `${Math.max(8, Math.round(h * 0.024))}px monospace`;
    ctx.fillStyle = `rgba(255, 255, 255, 0.35)`;
    ctx.textAlign = "left";

    const freqLabels = [20, 100, 500, 1000, 5000, 10000, 20000];
    const minLog = Math.log10(20);
    const maxLog = Math.log10(22050);
    for (const f of freqLabels) {
      const pos = 1 - (Math.log10(f) - minLog) / (maxLog - minLog);
      const y = pos * h;
      if (y < 10 || y > h - 10) continue;
      ctx.fillText(f >= 1000 ? `${f / 1000}кГц` : `${f}Гц`, 6, y + 3);
      ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(40, y);
      ctx.stroke();
    }

    // Time indicator
    ctx.fillStyle = `rgba(255, 255, 255, 0.25)`;
    ctx.textAlign = "right";
    ctx.fillText("время →", w - 8, h - 6);
    ctx.restore();

    // ── Current position line ──
    ctx.save();
    ctx.strokeStyle = `rgba(${accentRgb}, 0.4)`;
    ctx.lineWidth = 1;
    const lineX = Math.min(spectrogramRef.current.x, w - 1);
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, h);
    ctx.stroke();
    ctx.restore();
  };

  // ── Info overlay ──
  const drawInfoOverlay = (
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    accentRgb: string,
  ) => {
    ctx.save();
    ctx.font = `${Math.max(8, Math.round(h * 0.022))}px monospace`;
    ctx.fillStyle = `rgba(${accentRgb}, 0.3)`;
    ctx.textAlign = "right";

    const trackName = currentTrack?.title || "Нет трека";
    const truncated = trackName.length > 30 ? trackName.substring(0, 27) + "..." : trackName;
    ctx.fillText(truncated, w - 10, h - 8);

    ctx.restore();
  };

  const tabs: { id: VisTab; label: string; icon: typeof Activity }[] = [
    { id: "oscilloscope", label: "Осциллограф", icon: Activity },
    { id: "spectrum", label: "Спектр", icon: BarChart3 },
    { id: "spectrogram", label: "Спектрограмма", icon: Waves },
  ];

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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative z-10 rounded-3xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              width: "min(580px, 94vw)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    transition: "background-color 0.2s",
                  }}
                >
                  <Waves className="w-4 h-4" style={{ color: "var(--mq-bg)" }} />
                </div>
                <div>
                  <span className="text-sm font-bold block" style={{ color: "var(--mq-text)" }}>
                    Синтез-визуализатор
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    Осциллограф &bull; Спектр &bull; Спектрограмма
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-5 pb-3">
              <div className="flex gap-1.5">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <motion.button
                      key={tab.id}
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setActiveTab(tab.id);
                        // Reset spectrogram position when switching
                        if (tab.id === "spectrogram") {
                          spectrogramRef.current.x = 0;
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                      style={{
                        backgroundColor: isActive ? "var(--mq-accent)" : "var(--mq-input-bg)",
                        color: isActive ? "var(--mq-bg)" : "var(--mq-text-muted)",
                        border: `1px solid ${isActive ? "var(--mq-accent)" : "transparent"}`,
                        boxShadow: isActive ? "0 2px 8px var(--mq-glow)" : "none",
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      {tab.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Canvas area */}
            <div ref={containerRef} className="relative px-4 pb-4" style={{ height: 360 }}>
              <canvas
                ref={mainCanvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                className="absolute inset-0 w-full h-full rounded-2xl"
                style={{
                  willChange: "transform",
                }}
              />
            </div>

            {/* Info bar */}
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: isPlaying ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      boxShadow: isPlaying ? "0 0 6px var(--mq-glow)" : "none",
                    }}
                  />
                  <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>
                    {isPlaying ? "LIVE" : "PAUSED"}
                  </span>
                </div>
                <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
                  Web Audio API &bull; AnalyserNode FFT 2048
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
