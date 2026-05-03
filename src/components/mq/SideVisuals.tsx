"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAnalyser } from "@/lib/audioEngine";

/**
 * Animated side panels with theme-aware colors:
 * - Aurora / northern lights flowing effect
 * - Vertical light pillars pulsing with bass
 * - Flowing neon bezier curves
 * - Mouse-following glow
 * - Audio-reactive mini equalizer along inner edge
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function parseAccentColor(raw: string): [number, number, number] {
  if (raw.startsWith("#") && raw.length >= 7) return hexToRgb(raw);
  const m = raw.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [224, 49, 49];
}

/** Shift a hue from base rgb by offset degrees */
function shiftHue(r: number, g: number, b: number, offset: number): [number, number, number] {
  // Simple approximation: rotate through rgb channels
  const cos = Math.cos((offset * Math.PI) / 180);
  const sin = Math.sin((offset * Math.PI) / 180);
  const nr = Math.min(255, Math.max(0, r * (0.6 + 0.4 * cos) + g * (-0.4 * sin) + b * 0.1));
  const ng = Math.min(255, Math.max(0, r * (0.4 * sin) + g * (0.6 + 0.4 * cos) + b * 0.1));
  const nb = Math.min(255, Math.max(0, r * 0.1 + g * 0.1 + b * (0.6 + 0.4 * cos)));
  return [Math.round(nr), Math.round(ng), Math.round(nb)];
}

export default function SideVisuals() {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const accentRef = useRef<[number, number, number]>([224, 49, 49]);

  const readAccent = useCallback(() => {
    if (typeof document === "undefined") return;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--mq-accent")
      .trim();
    if (raw) accentRef.current = parseAccentColor(raw);
  }, []);

  useEffect(() => {
    readAccent();
    const interval = setInterval(readAccent, 2000);
    return () => clearInterval(interval);
  }, [readAccent]);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse, { passive: true });
    return () => window.removeEventListener("mousemove", onMouse);
  }, []);

  useEffect(() => {
    const lc = leftCanvasRef.current;
    const rc = rightCanvasRef.current;
    if (!lc || !rc) return;
    const ctxL = lc.getContext("2d");
    const ctxR = rc.getContext("2d");
    if (!ctxL || !ctxR) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resize = () => {
      const vw = window.innerWidth;
      const sideW = vw < 1024 ? 0 : Math.max(60, Math.min(200, (vw - 896) / 2));
      const vh = window.innerHeight;
      if (sideW === 0) {
        lc.style.display = "none";
        rc.style.display = "none";
        return;
      }
      lc.style.display = "block";
      rc.style.display = "block";
      w = sideW;
      h = vh;
      [lc, rc].forEach((c) => {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        const cx = c.getContext("2d");
        if (cx) cx.scale(dpr, dpr);
      });
    };

    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(128);
    let t = 0;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      t += 0.016;
      if (w === 0) return;

      const an = getAnalyser();
      if (an) an.getByteFrequencyData(freq);

      let energy = 0;
      for (let i = 0; i < 32; i++) energy += freq[i];
      energy /= 32 * 255;

      let bass = 0;
      for (let i = 0; i < 8; i++) bass += freq[i];
      bass /= 8 * 255;

      let mid = 0;
      for (let i = 8; i < 24; i++) mid += freq[i];
      mid /= 16 * 255;

      let high = 0;
      for (let i = 24; i < 64; i++) high += freq[i];
      high /= 40 * 255;

      const [ar, ag, ab] = accentRef.current;
      // secondary color (hue-shifted for aurora layers)
      const [sr, sg, sb] = shiftHue(ar, ag, ab, 40);
      const [tr, tg, tb] = shiftHue(ar, ag, ab, -30);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const vw = window.innerWidth;

      [ctxL, ctxR].forEach((ctx, side) => {
        ctx.clearRect(0, 0, w, h);

        // ═══════════════════════════════════════
        // 1. AURORA — flowing organic color bands
        // ═══════════════════════════════════════
        const auroraBands = 3;
        for (let band = 0; band < auroraBands; band++) {
          const phaseOffset = band * 2.1 + (side === 1 ? Math.PI : 0);
          const bandAlpha = (0.03 + energy * 0.04) * (1 - band * 0.25);

          // Pick color per band
          let br: number, bg2: number, bb: number;
          if (band === 0) { br = ar; bg2 = ag; bb = ab; }
          else if (band === 1) { br = sr; bg2 = sg; bb = sb; }
          else { br = tr; bg2 = tg; bb = tb; }

          ctx.beginPath();
          ctx.moveTo(0, h);

          // Build smooth curve across the width
          for (let y = h; y >= 0; y -= 3) {
            const normalY = y / h;
            const wave1 = Math.sin(normalY * 4 + t * 0.8 + phaseOffset) * w * 0.3;
            const wave2 = Math.sin(normalY * 7 + t * 1.2 + phaseOffset * 1.5) * w * 0.15;
            const wave3 = Math.sin(normalY * 2 + t * 0.5 + phaseOffset * 0.7) * w * 0.2;

            // Audio modulation — bass makes waves bigger
            const audioMod = 1 + bass * 1.5 + mid * 0.8;
            const x = w * 0.3 + (wave1 + wave2 + wave3) * audioMod;
            ctx.lineTo(x, y);
          }

          ctx.lineTo(w + 5, 0);
          ctx.lineTo(w + 5, h);
          ctx.closePath();

          // Gradient fill from accent to transparent
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, `rgba(${br},${bg2},${bb},${bandAlpha * 0.2})`);
          grad.addColorStop(0.4, `rgba(${br},${bg2},${bb},${bandAlpha})`);
          grad.addColorStop(0.7, `rgba(${br},${bg2},${bb},${bandAlpha * 0.5})`);
          grad.addColorStop(1, `rgba(${br},${bg2},${bb},0)`);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // ═══════════════════════════════════════
        // 2. LIGHT PILLARS — vertical beams pulsing with bass
        // ═══════════════════════════════════════
        const pillarCount = Math.max(2, Math.floor(w / 50));
        for (let i = 0; i < pillarCount; i++) {
          const px = (w / (pillarCount + 1)) * (i + 1);
          const freqIdx = Math.floor((i / pillarCount) * 16);
          const val = freq[freqIdx] / 255;

          const pillarAlpha = 0.015 + val * 0.05;
          const pillarW = 2 + val * 6;
          const pulseSpeed = t * 3 + i * 0.5;
          const intensity = (Math.sin(pulseSpeed) * 0.5 + 0.5) * (1 + val);

          const pGrad = ctx.createLinearGradient(0, 0, 0, h);
          pGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
          pGrad.addColorStop(0.2, `rgba(${ar},${ag},${ab},${pillarAlpha * intensity})`);
          pGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${pillarAlpha * intensity * 1.5})`);
          pGrad.addColorStop(0.8, `rgba(${ar},${ag},${ab},${pillarAlpha * intensity})`);
          pGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);

          ctx.fillStyle = pGrad;
          ctx.fillRect(px - pillarW / 2, 0, pillarW, h);
        }

        // ═══════════════════════════════════════
        // 3. FLOWING NEON CURVES — smooth bezier ribbons
        // ═══════════════════════════════════════
        const curveCount = 4;
        for (let c = 0; c < curveCount; c++) {
          const curvePhase = c * 1.7 + (side === 1 ? 2.5 : 0);
          const curveAlpha = 0.04 + energy * 0.06 + (c === 0 ? 0.02 : 0);

          let cr: number, cg: number, cb: number;
          if (c % 3 === 0) { cr = ar; cg = ag; cb = ab; }
          else if (c % 3 === 1) { cr = sr; cg = sg; cb = sb; }
          else { cr = tr; cg = tg; cb = tb; }

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${curveAlpha})`;
          ctx.lineWidth = 1 + (c === 0 ? energy * 2 : 0.5);

          const startX = w * (0.2 + Math.sin(t * 0.3 + curvePhase) * 0.15);

          ctx.moveTo(startX, 0);

          // Bezier segments going down
          const segments = 6;
          for (let s = 0; s < segments; s++) {
            const sy1 = (h / segments) * s;
            const sy2 = (h / segments) * (s + 1);
            const midY = (sy1 + sy2) / 2;

            const freqVal = freq[Math.floor((s / segments) * 32)] / 255;
            const wave = Math.sin(t * (1 + c * 0.3) + s * 1.2 + curvePhase) * (15 + freqVal * 25);
            const wave2 = Math.cos(t * 0.7 + s * 0.8 + curvePhase * 1.3) * (8 + bass * 15);

            const cp1x = startX + wave;
            const cp1y = midY - 15;
            const cp2x = startX + wave2;
            const cp2y = midY + 15;
            const ex = startX + (wave + wave2) / 2;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, sy2);
          }
          ctx.stroke();

          // Glow version (wider, more transparent)
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${curveAlpha * 0.3})`;
          ctx.lineWidth = 4 + (c === 0 ? energy * 4 : 1);
          ctx.stroke();
        }

        // ═══════════════════════════════════════
        // 4. MINI EQUALIZER along inner edge
        // ═══════════════════════════════════════
        const barCount = 20;
        const barGap = 1.5;
        const barW = Math.max(1, (w * 0.25) / barCount - barGap);
        const barBaseX = side === 0 ? w - barW * barCount - barGap * (barCount - 1) : 0;

        for (let i = 0; i < barCount; i++) {
          const fi = Math.floor((i / barCount) * 48);
          const val = freq[fi] / 255;

          // Centered bar
          const barH = Math.max(1, val * h * 0.35);
          const x = barBaseX + i * (barW + barGap);
          const y = h / 2 - barH / 2;

          const bGrad = ctx.createLinearGradient(0, y, 0, y + barH);
          bGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
          bGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},${0.15 + val * 0.25})`);
          bGrad.addColorStop(0.5, `rgba(${sr},${sg},${sb},${0.2 + val * 0.3})`);
          bGrad.addColorStop(0.7, `rgba(${ar},${ag},${ab},${0.15 + val * 0.25})`);
          bGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, barW / 2);
          ctx.fill();
        }

        // ═══════════════════════════════════════
        // 5. MOUSE-FOLLOWING GLOW
        // ═══════════════════════════════════════
        const glowX =
          side === 0 ? Math.min(w, mx) : Math.max(0, mx - (vw - w));
        const glowY = Math.min(h, Math.max(0, my));
        const glowDist = Math.sqrt(
          (glowX - w / 2) ** 2 + (glowY - h / 2) ** 2
        );
        const glowOp = Math.max(0, 0.06 + energy * 0.08 - glowDist / 600);

        if (glowOp > 0.005) {
          const gGrad = ctx.createRadialGradient(
            glowX, glowY, 0, glowX, glowY, w * 1.5
          );
          gGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${glowOp})`);
          gGrad.addColorStop(0.4, `rgba(${sr},${sg},${sb},${glowOp * 0.3})`);
          gGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = gGrad;
          ctx.fillRect(0, 0, w, h);
        }

        // ═══════════════════════════════════════
        // 6. BREATHING EDGE LINE — subtle inner border
        // ═══════════════════════════════════════
        const breathe = Math.sin(t * 1.5) * 0.5 + 0.5;
        const edgeAlpha = 0.03 + breathe * 0.04 + energy * 0.03;
        const edgeX = side === 0 ? w - 1 : 0;
        const eGrad = ctx.createLinearGradient(0, 0, 0, h);
        eGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        eGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},${edgeAlpha})`);
        eGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${edgeAlpha * 1.5})`);
        eGrad.addColorStop(0.7, `rgba(${ar},${ag},${ab},${edgeAlpha})`);
        eGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = eGrad;
        ctx.fillRect(edgeX, 0, 1, h);
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
      <canvas
        ref={leftCanvasRef}
        className="fixed left-0 top-0 z-[1] pointer-events-none"
        style={{ display: "none" }}
      />
      <canvas
        ref={rightCanvasRef}
        className="fixed right-0 top-0 z-[1] pointer-events-none"
        style={{ display: "none" }}
      />
    </>
  );
}
