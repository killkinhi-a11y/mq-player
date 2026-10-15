"use client";

import { useEffect, useRef, memo } from "react";
import { getAnalyser } from "@/lib/audioEngine";
import { subscribeClock, wakeClock } from "@/lib/playback/clock";

/**
 * AudioVisualizer — 3D particle sphere на РЕАЛЬНЫХ данных Web Audio analyser.
 *
 * v12 — качество и эффективность:
 * - Частотные полосы по ЛОГАРИФМИЧЕСКОЙ шкале (раньше линейный маппинг давал
 *   «всю энергию в басах» и мёртвые верхние частицы) — сфера живая по всему
 *   спектру; каждая частица усредняет своё окно бинов.
 * - Асимметричное сглаживание биений: быстрая атака (0.32) / медленный
 *   спад (0.08) — пульс музыкальный, а не «плавающая каша».
 * - Кометные трейлы через destination-out затухание (вместо жёсткого
 *   clearRect) — premium-ощущение движения без лишних частиц.
 * - Depth-затенение: дальние частицы компактнее и тусклее — читаемая глубина.
 * - ТАКТОВКА: при воспроизведении кадры приходят из ОБЩЕГО PlaybackClock
 *   (один rAF на приложение — §13); на паузе собственный low-fps тикер
 *   (~12 fps) для медленной idle-ротации вместо полных 60 fps; в скрытом
 *   табе всё останавливается (visibilitychange + guard в тиках).
 * - dpr cap 2 — retina-чёткость без 3× GPU-нагрузки.
 * - Fallback-пульсация при CORS-недоступном analyser остаётся честно
 *   декоративной (задокументировано), амплитуда консервативна.
 */

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

const PARTICLE_COUNT = 150;
/** Paused-idle ticker: smooth enough for the slow drift, ~5× cheaper than rAF. */
const IDLE_FPS_MS = 83;
/** Asymmetric beat smoothing: fast attack, slow release. */
const PULSE_ATTACK = 0.32;
const PULSE_RELEASE = 0.08;

export const AudioVisualizer = memo(function AudioVisualizer({
  isPlaying,
  className = "",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotationRef = useRef({ x: 0, y: 0 });
  const pulseRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) wakeClock();
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.max(1, Math.round(w * dpr));
      const targetH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Fibonacci sphere; particle→band mapping is resolved per-frame against
    // the ACTUAL analyser size (log-spaced when real data exists).
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        size: 1 + Math.random() * 2,
        /** Log-space position 0..1 across the usable spectrum. */
        bandT: i / PARTICLE_COUNT,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const getAccent = () => {
      const style = getComputedStyle(document.documentElement);
      return style.getPropertyValue("--mq-accent").trim() || "#e03131";
    };

    let accentColor = getAccent();
    const colorInterval = setInterval(() => {
      accentColor = getAccent();
    }, 2000);

    /** Log-spaced bin window for a particle (averaged, not a single bin). */
    const bandWindow = (t: number, binCount: number): [number, number] => {
      const minBin = 2;
      const maxBin = Math.max(minBin + 8, Math.min(binCount * 0.5, 512));
      const lo = Math.round(minBin * Math.pow(maxBin / minBin, t));
      const hi = Math.max(lo + 1, Math.round(minBin * Math.pow(maxBin / minBin, Math.min(1, t + 1 / PARTICLE_COUNT))));
      return [lo, Math.min(hi, binCount)];
    };

    const drawFrame = () => {
      if (document.hidden) return;

      const analyser = getAnalyser();
      let freqData: Uint8Array | null = null;
      if (analyser && isPlayingRef.current) {
        if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
          freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        analyser.getByteFrequencyData(freqDataRef.current);
        freqData = freqDataRef.current;
      }

      // Smooth pulse: real data if available, simulated otherwise (documented
      // decorative fallback for CORS-blocked streams).
      let targetPulse = 0;
      if (isPlayingRef.current) {
        if (freqData && freqData.length > 0) {
          let sum = 0;
          const sampleCount = Math.min(32, freqData.length);
          for (let i = 0; i < sampleCount; i++) sum += freqData[i];
          targetPulse = sum / sampleCount / 255; // 0..1
        } else {
          targetPulse = 0.5 + 0.3 * Math.sin(Date.now() * 0.004);
        }
      } else {
        targetPulse = 0.05;
      }
      // Fast attack / slow release — beats PUNCH, tails ring out.
      const k = targetPulse > pulseRef.current ? PULSE_ATTACK : PULSE_RELEASE;
      pulseRef.current += (targetPulse - pulseRef.current) * k;

      const rotSpeed = isPlayingRef.current ? 0.003 + pulseRef.current * 0.004 : 0.0005;
      rotationRef.current.y += rotSpeed;
      rotationRef.current.x += rotSpeed * 0.5;

      // Motion trails: fade the previous frame toward transparency instead
      // of erasing it — comet tails for the bright particles, zero cost.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.3;

      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);
      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);
      const now = Date.now();

      for (const p of particles) {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        // Per-particle energy from its (log-spaced, averaged) band.
        let particlePulse = pulseRef.current;
        if (freqData && freqData.length > 4) {
          const [lo, hi] = bandWindow(p.bandT, freqData.length);
          let sum = 0;
          for (let b = lo; b < hi; b++) sum += freqData[b];
          particlePulse = (sum / (hi - lo)) / 255;
        }

        const pulseMul = 1 + particlePulse * 0.5 * Math.sin(now * 0.003 + p.phase + p.x * 5);
        const r = baseRadius * pulseMul;

        const perspective = 1 / (1.5 - z2 * 0.5);
        const px = cx + x1 * r * perspective;
        const py = cy + y2 * r * perspective;

        const depth = (z2 + 1) / 2;
        const size = p.size * perspective * (0.5 + depth * 0.5) * (0.3 + particlePulse * 0.7);
        const opacity = (0.2 + depth * 0.6) * (0.3 + particlePulse * 0.7);

        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = opacity;
        ctx.fill();

        if (particlePulse > 0.4 && size > 1) {
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.5, size * 3), 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.globalAlpha = opacity * 0.1;
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // ── Clocking: ONE shared rAF while playing; cheap idle ticker otherwise.
    const unsubClock = subscribeClock(drawFrame, { throttleMs: 0 });
    const startIdle = () => {
      if (idleTimerRef.current) return;
      idleTimerRef.current = setInterval(drawFrame, IDLE_FPS_MS);
    };
    const stopIdle = () => {
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
    // The clock only ticks while playing — the idle ticker covers the rest.
    if (!isPlayingRef.current) startIdle();
    const playingProbe = setInterval(() => {
      if (isPlayingRef.current) stopIdle();
      else startIdle();
    }, 500);

    return () => {
      unsubClock();
      stopIdle();
      clearInterval(playingProbe);
      ro.disconnect();
      clearInterval(colorInterval);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
      aria-hidden="true"
    />
  );
});
