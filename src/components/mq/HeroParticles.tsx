"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  hue: number;
  life: number;
  maxLife: number;
}

export default function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animRef = useRef<number>(0);
  const accentRef = useRef({ r: 224, g: 49, b: 49 });

  // Skip entirely on mobile — canvas particles burn battery and are barely visible on small screens
  if (typeof window !== "undefined" && window.innerWidth < 640) {
    return null;
  }

  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    const count = Math.min(Math.floor((w * h) / 8000), 80);
    const isMob = w < 640;
    const mobileCount = Math.min(Math.floor((w * h) / 20000), 25);
    const finalCount = isMob ? mobileCount : count;
    for (let i = 0; i < (isMob ? mobileCount : count); i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2.5 + 0.8,
        opacity: Math.random() * 0.5 + 0.15,
        hue: Math.random() * 60 - 10,
        life: Math.random() * 200,
        maxLife: 200 + Math.random() * 300,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const parent = canvas.parentElement;
    const resize = () => {
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.offsetWidth * dpr;
      canvas.height = parent.offsetHeight * dpr;
      canvas.style.width = parent.offsetWidth + "px";
      canvas.style.height = parent.offsetHeight + "px";
      ctx.scale(dpr, dpr);
      if (particlesRef.current.length === 0) {
        initParticles(parent.offsetWidth, parent.offsetHeight);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);

    // Cache canvas rect — update on resize only, NOT every mousemove
    let canvasRect = canvas.getBoundingClientRect();
    const roCallback = () => { canvasRect = canvas.getBoundingClientRect(); };
    const ro2 = new ResizeObserver(roCallback);
    ro2.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchmove", (e) => {
      const touch = e.touches[0];
      mouseRef.current = { x: touch.clientX - canvasRect.left, y: touch.clientY - canvasRect.top };
    });
    canvas.addEventListener("touchend", onMouseLeave);

    // Cache accent color — refresh every 2s, NOT every frame
    const updateAccent = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--mq-accent").trim() || "#e03131";
      if (c.startsWith("#") && c.length >= 7) {
        accentRef.current = {
          r: parseInt(c.slice(1, 3), 16),
          g: parseInt(c.slice(3, 5), 16),
          b: parseInt(c.slice(5, 7), 16),
        };
      }
    };
    updateAccent();
    const accentInterval = setInterval(updateAccent, 2000);

    const animate = () => {
      const w = parent?.offsetWidth || 400;
      const h = parent?.offsetHeight || 200;
      const isMobile = (parent?.offsetWidth || 400) < 640;
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const isNear = mx > -500;

      // Use cached accent color (no DOM reads in rAF loop!)
      const accentR = accentRef.current.r;
      const accentG = accentRef.current.g;
      const accentB = accentRef.current.b;

      for (const p of particlesRef.current) {
        // Mouse interaction: attract gently
        if (isNear) {
          const dx = mx - p.x;
          const dy = my - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && dist > 1) {
            const force = (120 - dist) / 120;
            p.vx += (dx / dist) * force * 0.02;
            p.vy += (dy / dist) * force * 0.02;
          }
        }

        // Update
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.life++;

        // Bounce off edges
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        if (p.x > w) { p.x = w; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        if (p.y > h) { p.y = h; p.vy *= -1; }

        // Fade in/out based on life
        const lifeRatio = p.life / p.maxLife;
        let alpha = p.opacity;
        if (lifeRatio < 0.1) alpha *= lifeRatio / 0.1;
        else if (lifeRatio > 0.8) alpha *= (1 - lifeRatio) / 0.2;

        // Draw particle with glow
        const r = Math.min(255, accentR + p.hue);
        const g = Math.min(255, accentG + p.hue * 0.3);
        const b = Math.min(255, accentB + p.hue * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();

        // Glow effect for larger particles
        if (p.radius > 1.8) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.1})`;
          ctx.fill();
        }

        // Reset dead particles
        if (p.life >= p.maxLife) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.vx = (Math.random() - 0.5) * 0.4;
          p.vy = (Math.random() - 0.5) * 0.4;
          p.life = 0;
          p.maxLife = 200 + Math.random() * 300;
          p.radius = Math.random() * 2.5 + 0.8;
          p.opacity = Math.random() * 0.5 + 0.15;
        }
      }

      // Draw connecting lines between close particles (skip on mobile for performance)
      const particles = particlesRef.current;
      if (!isMobile) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
              const lineAlpha = (1 - dist / 100) * 0.08;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${lineAlpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      // Draw connection to mouse (skip on mobile for performance)
      if (!isMobile && isNear) {
        for (const p of particles) {
          const dx = mx - p.x;
          const dy = my - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const lineAlpha = (1 - dist / 100) * 0.15;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mx, my);
            ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(accentInterval);
      ro.disconnect();
      ro2.disconnect();
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ zIndex: 1, contain: "layout style paint", willChange: "transform" }}
    />
  );
}
