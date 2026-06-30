"use client";

import { useEffect, useRef } from "react";
import { getAudioElement } from "@/lib/audioEngine";

/**
 * useSmoothProgress — drives a progress bar fill + time label at true 60fps
 * by reading audio.currentTime directly from the <audio> element.
 *
 * The store's `progress` only updates ~1Hz (throttled), which makes the bar
 * jump in 1-second steps. This hook reads the actual audio element's
 * currentTime every frame for butter-smooth visual movement.
 *
 * Usage:
 *   const fillRef = useRef<HTMLDivElement>(null);
 *   const timeRef = useRef<HTMLSpanElement>(null);
 *   useSmoothProgress(fillRef, timeRef);
 */
export function useSmoothProgress(
  fillRef: React.RefObject<HTMLDivElement | null>,
  timeRef?: React.RefObject<HTMLSpanElement | null>,
  enabled: boolean = true
) {
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const audio = getAudioElement();
      if (audio && audio.src && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        const pct = (audio.currentTime / audio.duration) * 100;
        if (fillRef.current) {
          fillRef.current.style.width = `${pct}%`;
        }
        if (timeRef?.current) {
          const m = Math.floor(audio.currentTime / 60);
          const s = Math.floor(audio.currentTime % 60);
          timeRef.current.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, fillRef, timeRef]);
}
