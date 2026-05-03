"use client";

import { useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";

interface DNAHelixVisualProps {
  isPlaying: boolean;
  genre?: string;
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

export default function DNAHelixVisual({ isPlaying, genre }: DNAHelixVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number; size: number;
    r: number; g: number; b: number;
  }>>([]);

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

    // Mouse interaction
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / rect.width;
      mouseRef.current.y = (e.clientY - rect.top) / rect.height;
    };
    const handleMouseLeave = () => {
      mouseRef.current.x = 0.5;
      mouseRef.current.y = 0.5;
    };
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    // Initialize particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 40; i++) {
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
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Speed multiplier based on playing state
      const speedMul = isPlaying ? 1 : 0.3;

      // Mouse influence on helix tilt and position
      const tiltX = (my - 0.5) * 0.3;
      const offsetX = (mx - 0.5) * 20;

      const cx = w / 2 + offsetX;
      const cy = h / 2;
      const numNodes = 28;
      const helixHeight = h * 0.85;
      const startY = cy - helixHeight / 2;
      const radius = Math.min(w * 0.22, 60);
      const twistSpeed = 0.8 * speedMul;
      const perspective = 200;

      // Draw connecting "rungs" first (behind strands)
      for (let i = 0; i < numNodes; i++) {
        const frac = i / (numNodes - 1);
        const y = startY + frac * helixHeight;
        const angle = frac * Math.PI * 4 + t * twistSpeed;

        const x1 = cx + Math.cos(angle) * radius;
        const z1 = Math.sin(angle);
        const x2 = cx + Math.cos(angle + Math.PI) * radius;
        const z2 = Math.sin(angle + Math.PI);

        // Perspective scale
        const scale1 = 1 / (1 - z1 * 0.3);
        const scale2 = 1 / (1 - z2 * 0.3);

        // Only draw rungs that are roughly in front
        const avgZ = (z1 + z2) / 2;
        if (avgZ > -0.2) {
          const alpha = 0.06 + 0.04 * (avgZ + 0.2);
          const mixFrac = frac;
          const rr = Math.round(r1 + (r2 - r1) * mixFrac);
          const gg = Math.round(g1 + (g2 - g1) * mixFrac);
          const bb = Math.round(b1 + (b2 - b1) * mixFrac);

          // Bezier rung with slight curve
          const midX = (x1 + x2) / 2;
          const curve = Math.sin(angle * 2) * 4;

          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.quadraticCurveTo(midX, y + curve, x2, y);
          ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Center node on rung
          const nodeAlpha = 0.08 + 0.06 * avgZ;
          ctx.beginPath();
          ctx.arc(midX, y + curve * 0.5, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${nodeAlpha})`;
          ctx.fill();
        }
      }

      // Sort nodes by Z for proper depth rendering
      interface HelixNode {
        x: number; y: number; z: number;
        strand: number; frac: number; scale: number;
      }
      const nodes: HelixNode[] = [];

      for (let i = 0; i < numNodes; i++) {
        const frac = i / (numNodes - 1);
        const y = startY + frac * helixHeight;
        const angle = frac * Math.PI * 4 + t * twistSpeed;

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
        const size = (3 + node.z * 1.5) * node.scale;
        const alpha = 0.15 + (node.z + 1) * 0.25;
        const mixFrac = node.frac;

        // Blend between two colors based on position
        const rr = Math.round(r1 + (r2 - r1) * mixFrac);
        const gg = Math.round(g1 + (g2 - g1) * mixFrac);
        const bb = Math.round(b1 + (b2 - b1) * mixFrac);

        // Outer glow
        const glowSize = size * 3;
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize);
        glow.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha * 0.3})`);
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
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.3})`;
        ctx.fill();
      }

      // Floating particles
      for (const p of particlesRef.current) {
        p.z += p.vz * speedMul;
        if (p.z > 1) {
          p.z = 0;
          const angle = Math.random() * Math.PI * 2;
          const pFrac = Math.random();
          const pY = startY + pFrac * helixHeight;
          const helixAngle = pFrac * Math.PI * 4 + t * twistSpeed;
          const strand = Math.random() > 0.5 ? 0 : Math.PI;
          p.x = cx + Math.cos(helixAngle + strand) * radius * (0.7 + Math.random() * 0.6);
          p.y = pY;
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
        const pAlpha = fadeIn * fadeOut * 0.4;

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
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
      centerGlow.addColorStop(0, `rgba(${r1},${g1},${b1},${isPlaying ? 0.04 : 0.015})`);
      centerGlow.addColorStop(0.5, `rgba(${r2},${g2},${b2},${isPlaying ? 0.02 : 0.008})`);
      centerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = centerGlow;
      ctx.fill();
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isPlaying, genre, getColors]);

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
        transition: "opacity 0.8s ease",
        zIndex: 2,
      }}
    />
  );
}
