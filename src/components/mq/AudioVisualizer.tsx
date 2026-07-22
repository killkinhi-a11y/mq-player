"use client";

import { useEffect, useRef, memo } from "react";
import { getAnalyser } from "@/lib/audioEngine";

/**
 * AudioVisualizer — 3D particle sphere с реальным Web Audio API analyser.
 *
 * Inspirado en: "WebGL: как сделать сайт с интерактивной 3D-графикой"
 *
 * - 150 частиц на Fibonacci sphere
 * - Реальные frequency data от AnalyserNode (если доступен)
 * - Fallback: симуляция пульсации когда analyser недоступен (CORS stream)
 * - Accent-цвет синхронизирован с темой
 * - 60fps через requestAnimationFrame
 * - Page Visibility API: pause когда tab hidden
 */

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

const PARTICLE_COUNT = 150;

export const AudioVisualizer = memo(function AudioVisualizer({
  isPlaying,
  className = "",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0 });
  const pulseRef = useRef(0);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Fibonacci sphere
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        size: 1 + Math.random() * 2,
        // Map particle to frequency band (0-1)
        freqIndex: Math.floor((i / PARTICLE_COUNT) * 128),
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

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // Try to get real frequency data from Web Audio API analyser
      const analyser = getAnalyser();
      let freqData: Uint8Array | null = null;
      if (analyser && isPlayingRef.current) {
        if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
          freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqDataRef.current);
        freqData = freqDataRef.current;
      }

      // Smooth pulse: real data if available, simulated otherwise
      let targetPulse = 0;
      if (isPlayingRef.current) {
        if (freqData && freqData.length > 0) {
          // Calculate average energy from low-mid frequencies (bass + beat)
          let sum = 0;
          const sampleCount = Math.min(32, freqData.length);
          for (let i = 0; i < sampleCount; i++) {
            sum += freqData[i];
          }
          targetPulse = (sum / sampleCount) / 255; // 0 to 1
        } else {
          // Fallback: simulated pulse when analyser not available (CORS)
          targetPulse = 0.5 + 0.3 * Math.sin(Date.now() * 0.004);
        }
      } else {
        targetPulse = 0.05;
      }
      pulseRef.current += (targetPulse - pulseRef.current) * 0.1;

      const rotSpeed = isPlayingRef.current ? 0.003 + pulseRef.current * 0.004 : 0.0005;
      rotationRef.current.y += rotSpeed;
      rotationRef.current.x += rotSpeed * 0.5;

      // Clear canvas (fix: was fillRect with black → canvas turned black over time)
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.3;

      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);
      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);

      ctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        // Rotate around Y
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        // Rotate around X
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        // Per-particle pulse from real frequency data
        let particlePulse = pulseRef.current;
        if (freqData && freqData.length > p.freqIndex) {
          particlePulse = (freqData[p.freqIndex] / 255) * 0.8 + 0.2;
        }

        const pulseMul = 1 + particlePulse * 0.5 * Math.sin(Date.now() * 0.003 + p.x * 5);
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

        // Glow for bright particles
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

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
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
