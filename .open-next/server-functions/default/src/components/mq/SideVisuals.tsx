"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAnalyser } from "@/lib/audioEngine";

/**
 * Side panels — glowing neon lines that flow with music:
 * - 3 smooth flowing curves per side, each from a different frequency range
 * - Lines glow (shadow blur) and pulse with audio
 * - Subtle vertical gradient atmosphere
 * - Mouse glow on hover
 * Theme-aware via --mq-accent.
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
    const smooth = new Float32Array(64).fill(0);
    let t = 0;

    // Each line: color (rgb), freqOffset, speed, base amplitude, width, glow
    type LineDef = {
      cr: number; cg: number; cb: number;
      freqStart: number; freqEnd: number;
      speed: number;
      amp: number;
      lineW: number;
      glow: number;
      phaseOffset: number;
      sideMirror: boolean;
    };

    const drawLine = (
      ctx: CanvasRenderingContext2D,
      line: LineDef,
      w: number, h: number,
      smooth: Float32Array,
      t: number, side: number
    ) => {
      // Get average of this line's frequency range
      let val = 0;
      const count = line.freqEnd - line.freqStart;
      for (let i = line.freqStart; i < line.freqEnd; i++) val += smooth[i];
      val /= Math.max(1, count);

      const { cr, cg, cb, speed, amp, lineW, glow, phaseOffset, sideMirror } = line;

      // Base X position (shifts per line)
      const baseX = w * (0.25 + (sideMirror ? 0.15 : 0));

      ctx.beginPath();
      ctx.lineWidth = lineW + val * 1.5;

      // Draw smooth path top to bottom
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const y = (h / steps) * i;
        const normalY = i / steps;

        // Multiple sine waves for organic movement
        const wave1 = Math.sin(normalY * 5 + t * speed + phaseOffset) * amp;
        const wave2 = Math.sin(normalY * 8 + t * speed * 0.7 + phaseOffset * 1.5) * amp * 0.4;
        const wave3 = Math.sin(normalY * 3 + t * speed * 1.3 + phaseOffset * 0.8) * amp * 0.6;

        // Audio modulation
        const freqIdx = line.freqStart + Math.floor(normalY * count);
        const localVal = smooth[Math.min(63, freqIdx)];
        const audioWave = localVal * amp * 2.5;

        const x = baseX + (wave1 + wave2 + wave3 + audioWave) * (1 + val * 0.5);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Main stroke
      const alpha = 0.35 + val * 0.55;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.shadowColor = `rgba(${cr},${cg},${cb},${glow * (0.4 + val * 0.6)})`;
      ctx.shadowBlur = glow * (8 + val * 20);
      ctx.stroke();

      // Bright core (thinner, brighter)
      ctx.lineWidth = Math.max(0.5, (lineW + val * 1.5) * 0.4);
      ctx.strokeStyle = `rgba(${Math.min(255, cr + 80)},${Math.min(255, cg + 80)},${Math.min(255, cb + 80)},${alpha * 0.7})`;
      ctx.shadowBlur = glow * 4;
      ctx.stroke();

      ctx.shadowBlur = 0;
    };

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      t += 0.016;
      if (w === 0) return;

      const an = getAnalyser();
      if (an) an.getByteFrequencyData(freq);
      for (let i = 0; i < 64; i++) smooth[i] += ((freq[i] || 0) / 255 - smooth[i]) * 0.12;

      let energy = 0;
      for (let i = 0; i < 32; i++) energy += smooth[i];
      energy /= 32;

      const [ar, ag, ab] = accentRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const vw = window.innerWidth;

      // Lighter version for secondary lines
      const lr = Math.min(255, ar + 40);
      const lg = Math.min(255, ag + 40);
      const lb = Math.min(255, ab + 40);
      // Muted/darker for tertiary
      const mr = Math.round(ar * 0.6 + 40);
      const mg = Math.round(ag * 0.6 + 40);
      const mb = Math.round(ab * 0.6 + 40);

      // Line definitions: bass, mids, highs
      const lines: LineDef[] = [
        // Bass line — main accent, thick
        { cr: ar, cg: ag, cb: ab, freqStart: 0, freqEnd: 8, speed: 0.8, amp: w * 0.15, lineW: 2.5, glow: 1, phaseOffset: 0, sideMirror: false },
        // Mid line — lighter
        { cr: lr, cg: lg, cb: lb, freqStart: 8, freqEnd: 28, speed: 1.1, amp: w * 0.12, lineW: 1.8, glow: 0.8, phaseOffset: 2.1, sideMirror: true },
        // High line — muted, thin
        { cr: mr, cg: mg, cb: mb, freqStart: 28, freqEnd: 52, speed: 1.5, amp: w * 0.08, lineW: 1.2, glow: 0.6, phaseOffset: 4.2, sideMirror: false },
      ];

      [ctxL, ctxR].forEach((ctx, side) => {
        ctx.clearRect(0, 0, w, h);

        // ── Subtle background atmosphere ──
        const bgGrad = ctx.createLinearGradient(
          side === 0 ? w : 0, 0,
          side === 0 ? 0 : w, 0
        );
        bgGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${0.03 + energy * 0.05})`);
        bgGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},0)`);
        bgGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // ── Draw the 3 neon lines ──
        for (const line of lines) {
          drawLine(ctx, line, w, h, smooth, t, side);
        }

        // ── Inner edge glow ──
        const edgeX = side === 0 ? w - 1 : 0.5;
        const eGrad = ctx.createLinearGradient(0, 0, 0, h);
        eGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        eGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},${0.08 + energy * 0.12})`);
        eGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.15 + energy * 0.2})`);
        eGrad.addColorStop(0.7, `rgba(${ar},${ag},${ab},${0.08 + energy * 0.12})`);
        eGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = eGrad;
        ctx.fillRect(edgeX, 0, 1.5, h);

        // ── Mouse glow ──
        const glowX = side === 0
          ? Math.min(w, mx) : Math.max(0, mx - (vw - w));
        const glowY = Math.min(h, Math.max(0, my));
        const dist = Math.hypot(glowX - w / 2, glowY - h / 2);
        const glowA = Math.max(0, 0.15 + energy * 0.15 - dist / 1000);

        if (glowA > 0.01) {
          const mGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w * 1.2);
          mGrad.addColorStop(0, `rgba(${lr},${lg},${lb},${glowA})`);
          mGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${glowA * 0.3})`);
          mGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = mGrad;
          ctx.fillRect(0, 0, w, h);
        }
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
