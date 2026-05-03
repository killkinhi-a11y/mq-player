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
  const targetMouseRef = useRef({ x: 0.5, y: 0.5 });
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
  const prevTouchAngleRef = useRef(0);
  const touchDeltaRef = useRef(0);

  const getColors = useCallback(() => {
    const key = (genre || "").toLowerCase().trim();
    return GENRE_COLORS[key] || GENRE_COLORS.default;
  }, [genre]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const colors = getColors();
    const [c1, c2] = colors;
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);

    // Pre-compute lerp speed based on target FPS (60fps = ~16.67ms per frame)
    const LERP_SPEED = 0.12; // Smooth but responsive interpolation

    // Pointer interaction (mouse + touch unified)
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseRef.current.x = (e.clientX - rect.left) / rect.width;
      targetMouseRef.current.y = (e.clientY - rect.top) / rect.height;

      // Touch drag rotation
      if (touchActiveRef.current) {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const newAngle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
        touchDeltaRef.current += newAngle - prevTouchAngleRef.current;
        prevTouchAngleRef.current = newAngle;
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      touchActiveRef.current = true;
      touchDeltaRef.current = 0;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const angle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
      touchAngleRef.current = angle;
      prevTouchAngleRef.current = angle;
    };
    const handlePointerUp = () => {
      touchActiveRef.current = false;
    };
    const handlePointerLeave = () => {
      touchActiveRef.current = false;
      // Smoothly return to center
      targetMouseRef.current.x = 0.5;
      targetMouseRef.current.y = 0.5;
    };

    canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp, { passive: true });
    canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    // Prevent scrolling on touch
    canvas.style.touchAction = "none";

    // Initialize particles
    const particleCount = compact ? 15 : 30;
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

    // Pre-allocate node sorting array
    const numNodes = compact ? 18 : 28;
    const nodePool: Array<{ x: number; y: number; z: number; strand: number; frac: number; scale: number }> = new Array(numNodes * 2);

    // Frame timing for consistent 60fps feel
    let lastTime = 0;
    let touchBoostDecay = 0; // Decays smoothly

    const draw = (timestamp: number) => {
      animRef.current = requestAnimationFrame(draw);

      // Delta time for frame-rate independent animation
      const dt = lastTime ? Math.min((timestamp - lastTime) / 16.667, 3) : 1; // normalize to 60fps, cap at 3x
      lastTime = timestamp;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      const t = timestamp / 1000;

      // Smooth mouse interpolation for fluid response (lerp)
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * LERP_SPEED * dt;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * LERP_SPEED * dt;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Speed multiplier based on playing state
      const speedMul = isPlaying ? 1 : 0.3;

      // Touch drag: smooth boost with decay
      if (touchActiveRef.current) {
        touchBoostDecay = Math.min(touchBoostDecay + 0.08 * dt, 0.6);
      } else {
        touchBoostDecay *= Math.pow(0.96, dt); // Exponential decay
        if (touchBoostDecay < 0.01) touchBoostDecay = 0;
      }

      // Mouse influence on helix tilt and position
      const tiltX = (my - 0.5) * 0.4;
      const offsetX = (mx - 0.5) * (compact ? 12 : 20);
      const tiltEffect = tiltX * Math.PI * 0.15; // perspective foreshortening

      const cx = w / 2 + offsetX;
      const cy = h / 2;
      const helixHeight = h * (compact ? 0.82 : 0.85);
      const startY = cy - helixHeight / 2;
      const radius = Math.min(w * (compact ? 0.28 : 0.22), compact ? 35 : 60);
      const twistSpeed = (compact ? 0.6 : 0.8) * speedMul + touchBoostDecay;

      // Draw connecting "rungs" first (behind strands) — lightweight version
      for (let i = 0; i < numNodes; i++) {
        const frac = i / (numNodes - 1);
        const yBase = startY + frac * helixHeight;
        const y = cy + (yBase - cy) * Math.cos(tiltEffect);
        const angle = frac * Math.PI * (compact ? 3 : 4) + t * twistSpeed;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const x1 = cx + cosA * radius;
        const z1 = sinA;
        const x2 = cx + Math.cos(angle + Math.PI) * radius;
        const z2 = Math.sin(angle + Math.PI);

        const avgZ = (z1 + z2) / 2;
        if (avgZ > -0.2) {
          const alpha = (compact ? 0.12 : 0.06) + 0.08 * (avgZ + 0.2);
          const mixFrac = frac;
          const rr = (r1 + (r2 - r1) * mixFrac) | 0;
          const gg = (g1 + (g2 - g1) * mixFrac) | 0;
          const bb = (b1 + (b2 - b1) * mixFrac) | 0;

          const midX = (x1 + x2) * 0.5;
          const curve = Math.sin(angle * 2) * (compact ? 2.5 : 4);

          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.quadraticCurveTo(midX, y + curve, x2, y);
          ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          ctx.lineWidth = compact ? 1.5 : 1;
          ctx.stroke();

          // Center node on rung — simple dot in compact mode
          const nodeAlpha = (compact ? 0.15 : 0.08) + 0.08 * avgZ;
          ctx.beginPath();
          ctx.arc(midX, y + curve * 0.5, compact ? 2.5 : 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${nodeAlpha * 1.5})`;
          ctx.fill();
        }
      }

      // Sort nodes by Z for proper depth rendering
      let nodeCount = 0;
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

          nodePool[nodeCount++] = { x, y, z, strand, frac, scale };
        }
      }

      // Sort by Z (back to front) — in-place insertion sort for small arrays
      for (let i = 1; i < nodeCount; i++) {
        const key = nodePool[i];
        let j = i - 1;
        while (j >= 0 && nodePool[j].z < key.z) {
          nodePool[j + 1] = nodePool[j];
          j--;
        }
        nodePool[j + 1] = key;
      }

      // Draw nodes — optimized: reduce gradient calls
      for (let i = 0; i < nodeCount; i++) {
        const node = nodePool[i];
        const baseSize = compact ? 3.5 : 3;
        const size = Math.max(1, (baseSize + node.z * 1.5) * node.scale);
        const alpha = (compact ? 0.25 : 0.15) + (node.z + 1) * (compact ? 0.3 : 0.25);

        const mixFrac = node.frac;
        const rr = (r1 + (r2 - r1) * mixFrac) | 0;
        const gg = (g1 + (g2 - g1) * mixFrac) | 0;
        const bb = (b1 + (b2 - b1) * mixFrac) | 0;

        // Outer glow — only for front-facing nodes (z > 0) to save GPU
        if (node.z > -0.3) {
          const glowSize = size * (compact ? 3.5 : 2.5);
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize);
          glow.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha * 0.3})`);
          glow.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha + 0.1})`;
        ctx.fill();

        // Bright center — only for front nodes
        if (node.z > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(0.5, size * 0.4), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
          ctx.fill();
        }
      }

      // Floating particles — lightweight
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        p.z += p.vz * speedMul * dt;
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

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Fade in/out based on life
        const fadeIn = Math.min(1, p.z * 3);
        const fadeOut = Math.min(1, (1 - p.z) * 3);
        const pAlpha = fadeIn * fadeOut * (compact ? 0.5 : 0.4);

        const pSize = p.size * (1 + p.z * 0.5);

        // Simple particle dot (no gradient — much faster)
        ctx.beginPath();
        ctx.arc(p.x, p.y, pSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${pAlpha})`;
        ctx.fill();
      }

      // Subtle center glow — single gradient
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

    draw(performance.now());

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
