"use client";

import { useEffect, useRef, memo } from "react";

/**
 * CursorParticleField — частицы, летящие за курсором.
 *
 * Лёгкий particle trail на Canvas 2D:
 * - 30 частиц с инерцией
 * - Accent-цвет из CSS variable
 * - Fade out через прозрачность
 * - Auto-disable на touch + reduced-motion
 * - 60fps через RAF
 */

interface CursorParticleFieldProps {
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export const CursorParticleField = memo(function CursorParticleField({
  className = "",
}: CursorParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 });
  const activeRef = useRef(false);

  useEffect(() => {
    // Disable on touch / reduced motion
    if (
      !window.matchMedia("(hover: hover)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = window.devicePixelRatio || 1;

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

    const getAccent = () => {
      const style = getComputedStyle(document.documentElement);
      return style.getPropertyValue("--mq-accent").trim() || "#e03131";
    };
    let accent = getAccent();
    const colorInterval = setInterval(() => {
      accent = getAccent();
    }, 2000);

    const MAX_PARTICLES = 30;

    const spawnParticle = (x: number, y: number, dx: number, dy: number) => {
      const particles = particlesRef.current;
      if (particles.length >= MAX_PARTICLES) {
        particles.shift();
      }
      const speed = Math.sqrt(dx * dx + dy * dy);
      particles.push({
        x,
        y,
        vx: dx * 0.1 + (Math.random() - 0.5) * 0.5,
        vy: dy * 0.1 + (Math.random() - 0.5) * 0.5,
        life: 0,
        maxLife: 40 + Math.random() * 20,
        size: 1.5 + Math.random() * 2.5,
      });
      void speed;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;

      const dx = mouseRef.current.x - mouseRef.current.prevX;
      const dy = mouseRef.current.y - mouseRef.current.prevY;

      // Only spawn when mouse is within canvas bounds
      if (
        mouseRef.current.x >= 0 &&
        mouseRef.current.x <= w &&
        mouseRef.current.y >= 0 &&
        mouseRef.current.y <= h &&
        (Math.abs(dx) > 1 || Math.abs(dy) > 1)
      ) {
        spawnParticle(mouseRef.current.x, mouseRef.current.y, dx, dy);
        activeRef.current = true;
      }

      mouseRef.current.prevX = mouseRef.current.x;
      mouseRef.current.prevY = mouseRef.current.y;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      } else if (activeRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const alive: Particle[] = [];

      ctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;

        if (p.life >= p.maxLife) continue;

        const t = p.life / p.maxLife;
        const opacity = (1 - t) * 0.6;
        const size = p.size * (1 - t * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = opacity;
        ctx.fill();

        // Glow
        if (size > 1) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.globalAlpha = opacity * 0.1;
          ctx.fill();
        }

        alive.push(p);
      }

      particlesRef.current = alive;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (alive.length === 0) {
        activeRef.current = false;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    // Start animation when mouse moves
    const startCheck = setInterval(() => {
      if (particlesRef.current.length > 0 && !rafRef.current) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }, 100);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(colorInterval);
      clearInterval(startCheck);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
});
