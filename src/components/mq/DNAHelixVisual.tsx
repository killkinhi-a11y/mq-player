"use client";

import { useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";

interface DNAHelixVisualProps {
  isPlaying: boolean;
  genre?: string;
  /** compact mode for embedding in panels */
  compact?: boolean;
}

// Genre-based color palettes
const GENRE_COLORS: Record<string, [string, string]> = {
  pop: ["#f472b6", "#c084fc"],
  rock: ["#ef4444", "#f97316"],
  "hip-hop": ["#f59e0b", "#ef4444"],
  rap: ["#f59e0b", "#ef4444"],
  electronic: ["#06b6d4", "#8b5cf6"],
  edm: ["#8b5cf6", "#ec4899"],
  jazz: ["#d97706", "#f59e0b"],
  classical: ["#a78bfa", "#818cf8"],
  ambient: ["#2dd4bf", "#06b6d4"],
  "lo-fi": ["#fb923c", "#fbbf24"],
  lofi: ["#fb923c", "#fbbf24"],
  indie: ["#34d399", "#a78bfa"],
  soul: ["#f97316", "#fb923c"],
  blues: ["#3b82f6", "#6366f1"],
  metal: ["#dc2626", "#374151"],
  punk: ["#f43f5e", "#fb923c"],
  "r&b": ["#ec4899", "#f472b6"],
  rnb: ["#ec4899", "#f472b6"],
  folk: ["#84cc16", "#22c55e"],
  house: ["#0ea5e9", "#06b6d4"],
  techno: ["#64748b", "#334155"],
  trance: ["#7c3aed", "#a78bfa"],
  chill: ["#4ade80", "#2dd4bf"],
  default: ["#e03131", "#f97316"],
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export default function DNAHelixVisual({ isPlaying, genre, compact }: DNAHelixVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number; size: number;
    r: number; g: number; b: number;
  }>>([]);
  // Touch tracking for interactive rotation
  const touchActiveRef = useRef(false);
  const touchAngleRef = useRef(0);

  const getColors = useCallback(() => {
    const key = (genre || "").toLowerCase().trim();
    return GENRE_COLORS[key] || GENRE_COLORS.default;
  }, [genre]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = getColors();
    const [c1, c2] = colors;
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);

    // Smooth mouse position with lerp
    const smoothMouse = { x: 0.5, y: 0.5 };

    // Pointer interaction (mouse + touch unified)
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      smoothMouse.x = (e.clientX - rect.left) / rect.width;
      smoothMouse.y = (e.clientY - rect.top) / rect.height;
    };
    const handlePointerDown = (e: PointerEvent) => {
      touchActiveRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      touchAngleRef.current = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
    };
    const handlePointerUp = () => {
      touchActiveRef.current = false;
    };
    const handlePointerLeave = () => {
      touchActiveRef.current = false;
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    // Prevent scrolling on touch
    canvas.style.touchAction = "none";

    // Initialize particles
    const particleCount = compact ? 20 : 40;
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < particleCount; i++) {
        particlesRef.current.push({
          x: 0, y: 0, z: Math.random(),
          vx: (Math.random() - 0.5) * 0.002,
          vy: (Math.random() - 0.5) * 0.002,
          vz: 0.002 + Math.random() * 0.003,
          life: Math.random(),
          maxLife: 0.6 + Math.random() * 0.4,
          size: 1 + Math.random() * 2,
          r: Math.random() > 0.5 ? r1 : r2,
          g: Math.random() > 0.5 ? g1 : g2,
          b: Math.random() > 0.5 ? b1 : b2,
        });
      }
    }

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      const t = performance.now() / 1000;

      // Smooth mouse interpolation for fluid response
      mouseRef.current.x += (smoothMouse.x - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (smoothMouse.y - mouseRef.current.y) * 0.08;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Speed multiplier based on playing state
      const speedMul = isPlaying ? 1 : 0.3;

      // Touch drag adds extra rotation
      const touchBoost = touchActiveRef.current ? 0.6 : 0;

      // Mouse influence on helix tilt and position
      const tiltX = (my - 0.5) * 0.4;
      const offsetX = (mx - 0.5) * (compact ? 12 : 20);
      const tiltEffect = tiltX * Math.PI * 0.15; // perspective foreshortening

      const cx = w / 2 + offsetX;
      const cy = h / 2;
      const numNodes = compact ? 18 : 28;
      const helixHeight = h * (compact ? 0.82 : 0.85);
      const startY = cy - helixHeight / 2;
      const radius = Math.min(w * (compact ? 0.28 : 0.22), compact ? 35 : 60);
      const twistSpeed = (compact ? 0.6 : 0.8) * speedMul + touchBoost;

      // Draw connecting "rungs" first (behind strands)
      for (let i = 0; i < numNodes; i++) {
        const frac = i / (numNodes - 1);
        const yBase = startY + frac * helixHeight;

        // Apply tilt perspective to Y
        const y = cy + (yBase - cy) * Math.cos(tiltEffect);

        const angle = frac * Math.PI * (compact ? 3 : 4) + t * twistSpeed;

        const x1 = cx + Math.cos(angle) * radius;
        const z1 = Math.sin(angle);
        const x2 = cx + Math.cos(angle + Math.PI) * radius;
        const z2 = Math.sin(angle + Math.PI);

        // Only draw rungs that are roughly in front
        const avgZ = (z1 + z2) / 2;
        if (avgZ > -0.2) {
          const alpha = (compact ? 0.12 : 0.06) + 0.08 * (avgZ + 0.2);
          const mixFrac = frac;
          const rr = Math.round(r1 + (r2 - r1) * mixFrac);
          const gg = Math.round(g1 + (g2 - g1) * mixFrac);
          const bb = Math.round(b1 + (b2 - b1) * mixFrac);

          // Bezier rung with slight curve
          const midX = (x1 + x2) / 2;
          const curve = Math.sin(angle * 2) * (compact ? 2.5 : 4);

          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.quadraticCurveTo(midX, y + curve, x2, y);
          ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          ctx.lineWidth = compact ? 1.5 : 1;
          ctx.stroke();

          // Center node on rung — glow in compact mode
          const nodeAlpha = (compact ? 0.15 : 0.08) + 0.08 * avgZ;
          if (compact) {
            const ngGrad = ctx.createRadialGradient(midX, y + curve * 0.5, 0, midX, y + curve * 0.5, 5);
            ngGrad.addColorStop(0, `rgba(${rr},${gg},${bb},${nodeAlpha})`);
            ngGrad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
            ctx.beginPath();
            ctx.arc(midX, y + curve * 0.5, 5, 0, Math.PI * 2);
            ctx.fillStyle = ngGrad;
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(midX, y + curve * 0.5, compact ? 2.5 : 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${nodeAlpha * 1.5})`;
          ctx.fill();
        }
      }

      // Sort nodes by Z for proper depth rendering
      const nodes: Array<{ x: number; y: number; z: number; strand: number; frac: number; scale: number }> = [];

      for (let i = 0; i < numNodes; i++) {
        const frac = i / (numNodes - 1);
        const yBase = startY + frac * helixHeight;
        const y = cy + (yBase - cy) * Math.cos(tiltEffect);
        const angle = frac * Math.PI * (compact ? 3 : 4) + t * twistSpeed;

        for (let strand = 0; strand < 2; strand++) {
          const strandAngle = angle + strand * Math.PI;
          const x = cx + Math.cos(strandAngle) * radius;
          const z = Math.sin(strandAngle);
          const scale = 1 / (1 - z * 0.3);

          nodes.push({ x, y, z, strand, frac, scale });
        }
      }

      // Sort by Z (back to front)
      nodes.sort((a, b) => a.z - b.z);

      // Draw nodes
      for (const node of nodes) {
        const baseSize = compact ? 3.5 : 3;
        const size = (baseSize + node.z * 1.5) * node.scale;
        const alpha = (compact ? 0.25 : 0.15) + (node.z + 1) * (compact ? 0.3 : 0.25);
        const mixFrac = node.frac;

        // Blend between two colors based on position
        const rr = Math.round(r1 + (r2 - r1) * mixFrac);
        const gg = Math.round(g1 + (g2 - g1) * mixFrac);
        const bb = Math.round(b1 + (b2 - b1) * mixFrac);

        // Outer glow
        const glowSize = size * (compact ? 4 : 3);
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize);
        glow.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha * 0.35})`);
        glow.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(1, size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha + 0.1})`;
        ctx.fill();

        // Bright center
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0.5, size * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
        ctx.fill();
      }

      // Floating particles
      for (const p of particlesRef.current) {
        p.z += p.vz * speedMul;
        if (p.z > 1) {
          p.z = 0;
          const pFrac = Math.random();
          const pY = startY + pFrac * helixHeight;
          const helixAngle = pFrac * Math.PI * (compact ? 3 : 4) + t * twistSpeed;
          const strand = Math.random() > 0.5 ? 0 : Math.PI;
          p.x = cx + Math.cos(helixAngle + strand) * radius * (0.7 + Math.random() * 0.6);
          p.y = cy + (pY - cy) * Math.cos(tiltEffect);
          p.vx = (Math.random() - 0.5) * 0.3;
          p.vy = (Math.random() - 0.5) * 0.3;
          p.r = Math.random() > 0.5 ? r1 : r2;
          p.g = Math.random() > 0.5 ? g1 : g2;
          p.b = Math.random() > 0.5 ? b1 : b2;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Fade in/out based on life
        const fadeIn = Math.min(1, p.z * 3);
        const fadeOut = Math.min(1, (1 - p.z) * 3);
        const pAlpha = fadeIn * fadeOut * (compact ? 0.5 : 0.4);

        const pSize = p.size * (1 + p.z * 0.5);

        // Particle glow
        const pgGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pSize * 2);
        pgGrad.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${pAlpha})`);
        pgGrad.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, pSize * 2, 0, Math.PI * 2);
        ctx.fillStyle = pgGrad;
        ctx.fill();
      }

      // Subtle center glow
      const glowR = radius * (compact ? 1.8 : 1.5);
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      centerGlow.addColorStop(0, `rgba(${r1},${g1},${b1},${isPlaying ? (compact ? 0.06 : 0.04) : 0.015})`);
      centerGlow.addColorStop(0.5, `rgba(${r2},${g2},${b2},${isPlaying ? (compact ? 0.03 : 0.02) : 0.008})`);
      centerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = centerGlow;
      ctx.fill();
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [isPlaying, genre, getColors, compact]);

  if (compact) {
    return (
      <canvas
        ref={canvasRef}
        className="pointer-events-auto rounded-xl w-full"
        style={{
          height: 180,
          opacity: isPlaying ? 0.9 : 0.4,
          transition: "opacity 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    );
  }

  // Full-screen mode (legacy, for FullTrackView right side)
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-auto hidden lg:block"
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "40%",
        height: "100%",
        opacity: isPlaying ? 0.8 : 0.35,
        transition: "opacity 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: 2,
      }}
    />
  );
}
