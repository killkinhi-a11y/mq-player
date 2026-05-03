"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAudioElement, getAnalyser } from "@/lib/audioEngine";

/**
 * Animated side panels with:
 * - Floating particles that drift upward
 * - Audio-reactive bars that pulse with the music
 * - Subtle mouse-following glow
 * All rendered on canvas for performance.
 */
export default function SideVisuals() {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const isMobileRef = useRef(false);

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number;
    maxLife: number;
    hue: number;
  }

  const initParticles = useCallback((width: number, height: number) => {
    const count = isMobileRef.current ? 15 : 30;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(width, height, true));
    }
    particlesRef.current = particles;
  }, []);

  const createParticle = (w: number, h: number, randomY = false): Particle => ({
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + Math.random() * 20,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -(Math.random() * 0.5 + 0.2),
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.4 + 0.1,
    life: 0,
    maxLife: Math.random() * 300 + 200,
    hue: Math.random() * 30, // slight hue variation around accent
  });

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 1024;

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouse, { passive: true });

    const resize = () => {
      isMobileRef.current = window.innerWidth < 1024;
    };
    window.addEventListener("resize", resize, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftCanvas || !rightCanvas) return;

    const ctxL = leftCanvas.getContext("2d");
    const ctxR = rightCanvas.getContext("2d");
    if (!ctxL || !ctxR) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resizeCanvases = () => {
      const vw = window.innerWidth;
      const isMobile = vw < 1024;

      // Side panels are ~160px wide on desktop, hidden on mobile
      const sideW = isMobile ? 0 : Math.max(60, Math.min(200, (vw - 896) / 2));
      const vh = window.innerHeight;

      if (sideW === 0) {
        leftCanvas.style.display = "none";
        rightCanvas.style.display = "none";
        return;
      }

      leftCanvas.style.display = "block";
      rightCanvas.style.display = "block";

      w = sideW;
      h = vh;

      [leftCanvas, rightCanvas].forEach((canvas) => {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
      });

      initParticles(w, h);
    };

    resizeCanvases();
    window.addEventListener("resize", resizeCanvases);

    // Audio frequency data
    const freqData = new Uint8Array(128);

    let time = 0;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      time += 0.016;

      if (w === 0) return;

      const analyser = getAnalyser();
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
      }

      // Compute audio energy (0-1)
      let energy = 0;
      for (let i = 0; i < 32; i++) energy += freqData[i];
      energy = energy / (32 * 255);

      // Compute bass energy
      let bass = 0;
      for (let i = 0; i < 8; i++) bass += freqData[i];
      bass = bass / (8 * 255);

      // Mouse proximity factor for left/right glow
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const vw = window.innerWidth;

      // Draw both canvases
      [ctxL, ctxR].forEach((ctx, side) => {
        ctx.clearRect(0, 0, w, h);

        // ── Subtle gradient background glow ──
        const glowX = side === 0
          ? Math.min(w, mx)
          : Math.max(0, mx - (vw - w));
        const glowY = Math.min(h, Math.max(0, my));
        const glowDist = Math.sqrt(
          (glowX - w / 2) ** 2 + (glowY - h / 2) ** 2
        );
        const glowOpacity = Math.max(0, 0.04 + energy * 0.06 - glowDist / 800);

        if (glowOpacity > 0.005) {
          const grad = ctx.createRadialGradient(
            glowX, glowY, 0,
            glowX, glowY, w * 1.2
          );
          grad.addColorStop(0, `rgba(224, 49, 49, ${glowOpacity})`);
          grad.addColorStop(0.5, `rgba(224, 49, 49, ${glowOpacity * 0.3})`);
          grad.addColorStop(1, "rgba(224, 49, 49, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        // ── Audio-reactive vertical bars along the inner edge ──
        const barCount = 16;
        const barGap = 2;
        const barW = Math.max(1, (w * 0.3) / barCount - barGap);
        const barX = side === 0 ? w - barW * barCount - barGap * (barCount - 1) : 0;

        for (let i = 0; i < barCount; i++) {
          const freqIdx = Math.floor((i / barCount) * 32);
          const val = freqData[freqIdx] / 255;
          const barH = Math.max(2, val * h * 0.4 + Math.sin(time * 2 + i * 0.4) * 4);

          const x = barX + i * (barW + barGap);
          const y = h / 2 - barH / 2 + Math.sin(time * 1.5 + i * 0.3) * 10;

          ctx.fillStyle = `rgba(224, 49, 49, ${0.08 + val * 0.15})`;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, barW / 2);
          ctx.fill();
        }

        // ── Wave line ──
        ctx.beginPath();
        ctx.strokeStyle = `rgba(224, 49, 49, ${0.06 + energy * 0.08})`;
        ctx.lineWidth = 1;

        const waveX = side === 0 ? w * 0.5 : w * 0.5;
        for (let y = 0; y < h; y += 2) {
          const freqIdx = Math.floor((y / h) * 64);
          const val = freqData[freqIdx] / 255;
          const wave = Math.sin(y * 0.02 + time * 2) * (8 + val * 20)
            + Math.sin(y * 0.01 + time * 1.3) * (4 + bass * 12);
          if (y === 0) ctx.moveTo(waveX + wave, y);
          else ctx.lineTo(waveX + wave, y);
        }
        ctx.stroke();

        // ── Floating particles ──
        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life++;

          // Audio boost: particles move faster when music plays
          const audioBoost = 1 + energy * 2;
          p.x += p.vx * audioBoost + Math.sin(time + i) * 0.1;
          p.y += p.vy * audioBoost;

          // Mouse attraction (subtle)
          if (side === 0 && mx < w * 2) {
            p.x += (mx - p.x) * 0.001;
          } else if (side === 1 && mx > vw - w * 2) {
            p.x += ((vw - w * 2) - p.x) * 0.001;
          }

          // Fade based on life
          const lifeRatio = p.life / p.maxLife;
          const fadeIn = Math.min(1, p.life / 30);
          const fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1;
          const alpha = p.opacity * fadeIn * fadeOut * (0.5 + energy * 0.5);

          if (p.life >= p.maxLife || p.y < -10) {
            particles[i] = createParticle(w, h, false);
            continue;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + bass * 0.5), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(224, 49, 49, ${alpha})`;
          ctx.fill();

          // Glow around particle
          if (p.size > 1) {
            const glowGrad = ctx.createRadialGradient(
              p.x, p.y, 0,
              p.x, p.y, p.size * 3
            );
            glowGrad.addColorStop(0, `rgba(224, 49, 49, ${alpha * 0.3})`);
            glowGrad.addColorStop(1, "rgba(224, 49, 49, 0)");
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ── Horizontal scan line (subtle) ──
        const scanY = (time * 30) % h;
        const scanGrad = ctx.createLinearGradient(0, scanY - 2, 0, scanY + 2);
        scanGrad.addColorStop(0, "rgba(224, 49, 49, 0)");
        scanGrad.addColorStop(0.5, `rgba(224, 49, 49, ${0.03 + energy * 0.04})`);
        scanGrad.addColorStop(1, "rgba(224, 49, 49, 0)");
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 2, w, 4);
      });
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvases);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [initParticles]);

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
