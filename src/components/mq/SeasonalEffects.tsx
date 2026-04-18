"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type SeasonalTheme = "halloween" | "newyear" | "valentine" | "spring" | "summer" | "autumn" | "stpatrick" | "easter" | null;

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  char: string;
  color: string;
  life: number;
  maxLife: number;
  type: "fall" | "float" | "rise" | "drift";
}

const themeConfig: Record<string, {
  chars: string[];
  colors: string[];
  particleCount: number;
  type: "fall" | "float" | "rise" | "drift";
  bgGlow?: string;
}> = {
  halloween: {
    chars: ["🎃", "🦇", "👻", "🕷", "🕸", "💀", "🧛", "🌕"],
    colors: ["#ff6600", "#ff8800", "#ffaa00", "#cc4400", "#993300"],
    particleCount: 25,
    type: "drift",
    bgGlow: "radial-gradient(ellipse at 50% 100%, rgba(255,102,0,0.06) 0%, transparent 60%)",
  },
  newyear: {
    chars: ["❄", "✦", "✧", "⭐", "🎁", "🎄", "🔔", "⛄", "🎆"],
    colors: ["#ffffff", "#ffed4a", "#ff6b6b", "#fbbf24", "#a78bfa", "#38bdf8"],
    particleCount: 35,
    type: "fall",
    bgGlow: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.05) 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, rgba(239,68,68,0.04) 0%, transparent 40%)",
  },
  valentine: {
    chars: ["❤", "💕", "💗", "💖", "💝", "🌹", "💘", "🩷"],
    colors: ["#f43f5e", "#fb7185", "#fda4af", "#f472b6", "#e11d48"],
    particleCount: 30,
    type: "rise",
    bgGlow: "radial-gradient(ellipse at 50% 80%, rgba(244,63,94,0.06) 0%, transparent 50%)",
  },
  spring: {
    chars: ["🌸", "🌷", "🌼", "🦋", "🌿", "☘", "🌻", "🍒"],
    colors: ["#f9a8d4", "#f472b6", "#a78bfa", "#4ade80", "#fbbf24"],
    particleCount: 25,
    type: "drift",
    bgGlow: "radial-gradient(ellipse at 50% 100%, rgba(74,222,128,0.05) 0%, transparent 50%)",
  },
  summer: {
    chars: ["☀", "🌊", "🏖", "🌺", "🐚", "🌻", "🐝", "🌈"],
    colors: ["#fbbf24", "#fb923c", "#f59e0b", "#34d399", "#38bdf8"],
    particleCount: 20,
    type: "float",
    bgGlow: "radial-gradient(ellipse at 80% 20%, rgba(250,204,21,0.06) 0%, transparent 50%)",
  },
  autumn: {
    chars: ["🍂", "🍁", "🌾", "🍄", "🦊", "🌰", "🐿"],
    colors: ["#d97706", "#ea580c", "#dc2626", "#b45309", "#92400e"],
    particleCount: 25,
    type: "fall",
    bgGlow: "radial-gradient(ellipse at 30% 80%, rgba(217,119,6,0.06) 0%, transparent 50%)",
  },
  stpatrick: {
    chars: ["🍀", "🌈", "💰", "🪙", "☘️", "🎩"],
    colors: ["#22c55e", "#4ade80", "#86efac", "#fbbf24", "#16a34a"],
    particleCount: 22,
    type: "drift",
    bgGlow: "radial-gradient(ellipse at 50% 50%, rgba(34,197,94,0.06) 0%, transparent 50%)",
  },
  easter: {
    chars: ["🐣", "🐰", "🥚", "🌸", "🌷", "🧺", "🐱"],
    colors: ["#c084fc", "#e879f9", "#f0abfc", "#fbbf24", "#a78bfa"],
    particleCount: 22,
    type: "float",
    bgGlow: "radial-gradient(ellipse at 50% 80%, rgba(192,132,252,0.06) 0%, transparent 50%)",
  },
};

export default function SeasonalEffects({ theme }: { theme: SeasonalTheme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState(true);

  const config = theme ? themeConfig[theme] : null;

  const createParticle = useCallback((width: number, height: number): Particle => {
    if (!config) {
      return {
        x: 0, y: 0, size: 0, speedX: 0, speedY: 0,
        opacity: 0, rotation: 0, rotationSpeed: 0, char: "",
        color: "", life: 0, maxLife: 0, type: "fall",
      };
    }

    const char = config.chars[Math.floor(Math.random() * config.chars.length)];
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    const size = 10 + Math.random() * 16;
    const maxLife = 300 + Math.random() * 400;

    let x: number, y: number, speedX: number, speedY: number;

    switch (config.type) {
      case "fall":
        x = Math.random() * width;
        y = -size - Math.random() * 100;
        speedX = (Math.random() - 0.5) * 0.5;
        speedY = 0.3 + Math.random() * 0.8;
        break;
      case "rise":
        x = Math.random() * width;
        y = height + size + Math.random() * 50;
        speedX = (Math.random() - 0.5) * 0.8;
        speedY = -(0.4 + Math.random() * 0.6);
        break;
      case "float":
        x = Math.random() * width;
        y = Math.random() * height;
        speedX = (Math.random() - 0.5) * 0.3;
        speedY = (Math.random() - 0.5) * 0.3;
        break;
      case "drift":
      default:
        x = Math.random() < 0.5 ? -size : width + size;
        y = Math.random() * height;
        speedX = x < 0 ? (0.2 + Math.random() * 0.5) : -(0.2 + Math.random() * 0.5);
        speedY = (Math.random() - 0.5) * 0.3;
        break;
    }

    return {
      x, y, size, speedX, speedY,
      opacity: 0,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 1.5,
      char,
      color,
      life: 0,
      maxLife,
      type: config.type,
    };
  }, [config]);

  useEffect(() => {
    if (!theme || !config || !isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    particlesRef.current = [];
    for (let i = 0; i < config.particleCount; i++) {
      const p = createParticle(canvas.width, canvas.height);
      p.life = Math.random() * p.maxLife * 0.5; // stagger initial positions
      particlesRef.current.push(p);
    }

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        // Fade in/out based on life
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio < 0.1) {
          p.opacity = lifeRatio / 0.1;
        } else if (lifeRatio > 0.8) {
          p.opacity = (1 - lifeRatio) / 0.2;
        } else {
          p.opacity = 1;
        }
        p.opacity = Math.min(p.opacity, 0.6);

        // Reset particle if out of bounds or expired
        const isOutOfBounds =
          p.y > canvas.height + 50 ||
          p.y < -100 ||
          p.x > canvas.width + 100 ||
          p.x < -100;

        if (p.life >= p.maxLife || isOutOfBounds) {
          particles[i] = createParticle(canvas.width, canvas.height);
          continue;
        }

        // Draw particle
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Add subtle shadow for depth
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [theme, config, isVisible, createParticle]);

  if (!theme || !config) return null;

  return (
    <>
      {/* Background glow */}
      {config.bgGlow && (
        <div
          className="fixed inset-0 pointer-events-none z-[1]"
          style={{ background: config.bgGlow }}
        />
      )}

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[60]"
        style={{ opacity: 1 }}
      />

      {/* Close button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-20 right-4 z-[61] w-8 h-8 rounded-full flex items-center justify-center text-xs transition-opacity"
        style={{
          backgroundColor: isVisible ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: isVisible ? "var(--mq-text-muted)" : "var(--mq-text-muted)",
          opacity: isVisible ? 0.7 : 0.3,
          backdropFilter: "blur(8px)",
        }}
        title={isVisible ? "Скрыть эффекты" : "Показать эффекты"}
      >
        {isVisible ? theme === "halloween" ? "🎃" : theme === "newyear" ? "❄" : "✨" : "👁"}
      </button>
    </>
  );
}
