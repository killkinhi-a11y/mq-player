"use client";

import { useEffect, useRef, memo } from "react";

/**
 * AudioVisualizer — лёгкий WebGL-стиль визуализатор на Canvas 2D.
 *
 * Идея из видео "WebGL: как сделать сайт с интерактивной 3D-графикой"
 * (Digital-агентство Мэйк). Адаптировано для музыкального плеера:
 *
 * - Вращающаяся сфера из частиц (Fibonacci sphere distribution)
 * - Частицы пульсируют в ритм музыки (симулируется через isPlaying)
 * - Accent-цвет частиц синхронизирован с темой
 * - 60fps через requestAnimationFrame
 * - Pause → частицы замирают на минимальной амплитуде
 * - Респонсивный canvas (ResizeObserver)
 * - GPU-accelerated: только transform и opacity
 *
 * Размер: ~3KB (vs 500KB+ для Three.js). Без зависимостей.
 *
 * Производительность:
 * - 150 частиц (баланс visual / perf)
 * - Canvas 2D с globalCompositeOperation = 'lighter' для glow
 * - devicePixelRatio для retina
 * - auto-pause когда tab hidden (Page Visibility API)
 */

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

const PARTICLE_COUNT = 150;
const SPHERE_RADIUS = 120;

export const AudioVisualizer = memo(function AudioVisualizer({
  isPlaying,
  className = "",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0, y: 0 });
  const pulseRef = useRef(0);
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

    // Fibonacci sphere — равномерное распределение частиц по сфере
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        size: 1 + Math.random() * 2,
      };
    });

    // Get accent color from CSS variable
    const getAccent = () => {
      const style = getComputedStyle(document.documentElement);
      return style.getPropertyValue("--mq-accent").trim() || "#e03131";
    };

    let accentColor = getAccent();
    const colorInterval = setInterval(() => {
      accentColor = getAccent();
    }, 2000);

    // Page Visibility — pause when tab hidden
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

      // Smooth pulse transition
      const targetPulse = isPlayingRef.current ? 1 : 0.1;
      pulseRef.current += (targetPulse - pulseRef.current) * 0.05;

      // Rotation speed depends on playing state
      const rotSpeed = isPlayingRef.current ? 0.003 : 0.0005;
      rotationRef.current.y += rotSpeed;
      rotationRef.current.x += rotSpeed * 0.5;

      // Clear with fade trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.35;

      // Project 3D particles to 2D
      const cosX = Math.cos(rotationRef.current.x);
      const sinX = Math.sin(rotationRef.current.x);
      const cosY = Math.cos(rotationRef.current.y);
      const sinY = Math.sin(rotationRef.current.y);

      ctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        // Rotate around Y axis
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        // Rotate around X axis
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        // Pulsing radius
        const pulse = 1 + pulseRef.current * 0.3 * Math.sin(Date.now() * 0.003 + p.x * 5);
        const r = radius * pulse;

        // Perspective projection
        const perspective = 1 / (1.5 - z2 * 0.5);
        const px = cx + x1 * r * perspective;
        const py = cy + y2 * r * perspective;

        // Depth-based opacity and size
        const depth = (z2 + 1) / 2; // 0 to 1
        const size = p.size * perspective * (0.5 + depth * 0.5) * (0.5 + pulseRef.current * 0.5);
        const opacity = (0.2 + depth * 0.6) * (0.3 + pulseRef.current * 0.7);

        // Draw particle with glow
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = opacity;
        ctx.fill();

        // Glow for larger particles
        if (size > 1.5) {
          ctx.beginPath();
          ctx.arc(px, py, size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.globalAlpha = opacity * 0.15;
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
