"use client";

import { memo, useEffect, useRef } from "react";

/**
 * LikeBurst — particle burst анимация при лайке трека.
 *
 * Hearts/particles разлетаются из точки клика.
 * Canvas 2D, 60fps, auto-cleanup.
 */

interface LikeBurstProps {
  trigger: number; // increment to trigger burst
  x?: number;
  y?: number;
  color?: string;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  vr: number;
}

export const LikeBurst = memo(function LikeBurst({
  trigger,
  x,
  y,
  color = "var(--mq-accent, #e03131)",
}: LikeBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<BurstParticle[]>([]);
  const triggerRef = useRef(trigger);

  useEffect(() => {
    if (trigger === triggerRef.current) return;
    triggerRef.current = trigger;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.scale(dpr, dpr);

    const cx = x ?? window.innerWidth / 2;
    const cy = y ?? window.innerHeight / 2;

    // Spawn 12 particles in burst pattern
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const speed = 3 + Math.random() * 4;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // slight upward bias
        life: 0,
        maxLife: 30 + Math.random() * 15,
        size: 4 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
      });
    }

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const particles = particlesRef.current;
      const alive: BurstParticle[] = [];

      for (const p of particles) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.98;
        p.rotation += p.vr;

        if (p.life >= p.maxLife) continue;

        const t = p.life / p.maxLife;
        const opacity = 1 - t;
        const size = p.size * (1 - t * 0.3);

        // Draw heart shape
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.beginPath();
        // Simple heart: two circles + triangle
        const s = size;
        ctx.arc(-s * 0.3, -s * 0.2, s * 0.4, 0, Math.PI * 2);
        ctx.arc(s * 0.3, -s * 0.2, s * 0.4, 0, Math.PI * 2);
        ctx.moveTo(-s * 0.65, 0);
        ctx.lineTo(s * 0.65, 0);
        ctx.lineTo(0, s * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        alive.push(p);
      }

      particlesRef.current = alive;
      ctx.globalAlpha = 1;

      if (alive.length === 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [trigger, x, y, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 999,
      }}
      aria-hidden="true"
    />
  );
});
