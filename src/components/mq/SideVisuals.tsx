"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAnalyser } from "@/lib/audioEngine";

/**
 * Side panels — bold, visible audio visualizer:
 * - Full-height equalizer bars (thick, gradient-filled)
 * - Circular wave rings emanating from center-bottom
 * - Flowing vertical gradient that breathes
 * - Mouse glow
 * All colors from --mq-accent theme variable.
 */

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

function parseAccent(raw: string): [number, number, number] {
  if (raw.startsWith("#") && raw.length >= 7) return hexToRgb(raw);
  const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [224, 49, 49];
}

export default function SideVisuals() {
  const lcRef = useRef<HTMLCanvasElement>(null);
  const rcRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const animRef = useRef(0);
  const accentRef = useRef<[number, number, number]>([224, 49, 49]);

  const readAccent = useCallback(() => {
    if (typeof document === "undefined") return;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--mq-accent").trim();
    if (raw) accentRef.current = parseAccent(raw);
  }, []);

  useEffect(() => {
    readAccent();
    const id = setInterval(readAccent, 2000);
    return () => clearInterval(id);
  }, [readAccent]);

  useEffect(() => {
    const onMouse = (e: MouseEvent) =>
      (mouseRef.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMouse, { passive: true });
    return () => window.removeEventListener("mousemove", onMouse);
  }, []);

  useEffect(() => {
    const lc = lcRef.current;
    const rc = rcRef.current;
    if (!lc || !rc) return;
    const ctxL = lc.getContext("2d");
    const ctxR = rc.getContext("2d");
    if (!ctxL || !ctxR) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resize = () => {
      const vw = window.innerWidth;
      const sw = vw < 1024 ? 0 : Math.max(60, Math.min(200, (vw - 896) / 2));
      if (sw === 0) { lc.style.display = "none"; rc.style.display = "none"; return; }
      lc.style.display = "block"; rc.style.display = "block";
      w = sw; h = window.innerHeight;
      [lc, rc].forEach((c) => {
        c.width = w * dpr; c.height = h * dpr;
        c.style.width = `${w}px`; c.style.height = `${h}px`;
        const cx = c.getContext("2d"); if (cx) cx.scale(dpr, dpr);
      });
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(128);
    // smoothed values for silky animation
    const smoothed = new Float32Array(64).fill(0);
    let t = 0;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      t += 0.016;
      if (w === 0) return;

      const an = getAnalyser();
      if (an) an.getByteFrequencyData(freq);

      // smooth frequency data
      for (let i = 0; i < 64; i++) {
        smoothed[i] += ((freq[i] || 0) / 255 - smoothed[i]) * 0.15;
      }

      let energy = 0, bass = 0;
      for (let i = 0; i < 32; i++) energy += smoothed[i];
      energy /= 32;
      for (let i = 0; i < 8; i++) bass += smoothed[i];
      bass /= 8;

      const [ar, ag, ab] = accentRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const vw = window.innerWidth;

      // helper: lerp color toward lighter for gradient tops
      const lr = Math.min(255, ar + 60);
      const lg = Math.min(255, ag + 60);
      const lb = Math.min(255, ab + 60);
      // darker
      const dr = Math.round(ar * 0.5);
      const dg = Math.round(ag * 0.5);
      const db = Math.round(ab * 0.5);

      [ctxL, ctxR].forEach((ctx, side) => {
        ctx.clearRect(0, 0, w, h);

        // ═══════════════════════════════════
        // 1. FLOWING GRADIENT BACKGROUND — breathes
        // ═══════════════════════════════════
        const breathPhase = Math.sin(t * 0.6) * 0.5 + 0.5;
        const gradX = w * (0.3 + breathPhase * 0.4);
        const gradY = h * (0.3 + Math.sin(t * 0.4 + 1) * 0.2);
        const bgGrad = ctx.createRadialGradient(gradX, gradY, 0, gradX, gradY, w * 2);
        bgGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${0.08 + energy * 0.12})`);
        bgGrad.addColorStop(0.5, `rgba(${dr},${dg},${db},${0.04 + energy * 0.06})`);
        bgGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // second glow blob, offset
        const g2x = w * (0.7 - breathPhase * 0.3);
        const g2y = h * (0.7 + Math.cos(t * 0.5) * 0.15);
        const bg2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, w * 1.5);
        bg2.addColorStop(0, `rgba(${lr},${lg},${lb},${0.05 + bass * 0.08})`);
        bg2.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
        ctx.fillStyle = bg2;
        ctx.fillRect(0, 0, w, h);

        // ═══════════════════════════════════
        // 2. EQUALIZER BARS — bold, centered, gradient-filled
        // ═══════════════════════════════════
        const barCount = Math.max(6, Math.min(16, Math.floor(w / 10)));
        const gap = Math.max(2, w * 0.04);
        const barW = (w - gap * (barCount + 1)) / barCount;

        for (let i = 0; i < barCount; i++) {
          // use different frequency ranges for variety
          const fi = Math.min(63, Math.floor((i / barCount) * 48 + (side === 0 ? 0 : 16)));
          const val = smoothed[fi];
          const barH = Math.max(4, val * h * 0.75);
          const x = gap + i * (barW + gap);
          const y = h / 2 - barH / 2;

          // gradient from accent → lighter → accent
          const bGrad = ctx.createLinearGradient(x, y, x, y + barH);
          bGrad.addColorStop(0, `rgba(${dr},${dg},${db},${0.4 + val * 0.4})`);
          bGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},${0.6 + val * 0.35})`);
          bGrad.addColorStop(0.5, `rgba(${lr},${lg},${lb},${0.7 + val * 0.3})`);
          bGrad.addColorStop(0.7, `rgba(${ar},${ag},${ab},${0.6 + val * 0.35})`);
          bGrad.addColorStop(1, `rgba(${dr},${dg},${db},${0.4 + val * 0.4})`);

          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, Math.min(barW / 2, 4));
          ctx.fill();

          // glow behind each bar
          if (val > 0.3) {
            ctx.shadowColor = `rgba(${ar},${ag},${ab},${val * 0.4})`;
            ctx.shadowBlur = 8 + val * 12;
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${val * 0.15})`;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, Math.min(barW / 2, 4));
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        // ═══════════════════════════════════
        // 3. WAVE RINGS — concentric arcs from center
        // ═══════════════════════════════════
        const ringCount = 4;
        const cx = w / 2;
        const cy = h / 2;

        for (let r = 0; r < ringCount; r++) {
          const baseR = 20 + r * 25;
          const pulse = baseR + smoothed[r * 8] * 40;
          const alpha = 0.12 + smoothed[r * 8] * 0.25 - r * 0.03;
          if (alpha <= 0) continue;

          ctx.beginPath();
          ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
          ctx.lineWidth = 1.5 - r * 0.2;
          ctx.stroke();
        }

        // ═══════════════════════════════════
        // 4. MOUSE GLOW
        // ═══════════════════════════════════
        const glowX = side === 0
          ? Math.min(w, mx) : Math.max(0, mx - (vw - w));
        const glowY = Math.min(h, Math.max(0, my));
        const dist = Math.abs(glowX - w / 2) + Math.abs(glowY - h / 2);
        const glowA = Math.max(0, 0.2 + energy * 0.2 - dist / 1200);

        if (glowA > 0.01) {
          const mGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w);
          mGrad.addColorStop(0, `rgba(${lr},${lg},${lb},${glowA})`);
          mGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${glowA * 0.4})`);
          mGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = mGrad;
          ctx.fillRect(0, 0, w, h);
        }

        // ═══════════════════════════════════
        // 5. INNER EDGE LINE — accent border
        // ═══════════════════════════════════
        const edgeX = side === 0 ? w - 1.5 : 0;
        const eGrad = ctx.createLinearGradient(0, 0, 0, h);
        eGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        eGrad.addColorStop(0.2, `rgba(${ar},${ag},${ab},${0.15 + energy * 0.2})`);
        eGrad.addColorStop(0.5, `rgba(${lr},${lg},${lb},${0.25 + energy * 0.25})`);
        eGrad.addColorStop(0.8, `rgba(${ar},${ag},${ab},${0.15 + energy * 0.2})`);
        eGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = eGrad;
        ctx.fillRect(edgeX, 0, 1.5, h);
      });
    };

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <>
      <canvas ref={lcRef} className="fixed left-0 top-0 z-[1] pointer-events-none" style={{ display: "none" }} />
      <canvas ref={rcRef} className="fixed right-0 top-0 z-[1] pointer-events-none" style={{ display: "none" }} />
    </>
  );
}
