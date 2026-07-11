import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";

interface UseProgressDragParams {
  progressRef: React.RefObject<HTMLDivElement | null>;
  duration: number;
}

export function useProgressDrag({ progressRef, duration }: UseProgressDragParams) {
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const progressTimeRef = useRef<HTMLDivElement>(null);
  const progressPctRef = useRef(0);
  const progressSliderWidthRef = useRef(0);

  // Cache slider width on mount and update on resize
  useEffect(() => {
    const update = () => {
      if (progressRef.current) {
        progressSliderWidthRef.current = progressRef.current.offsetWidth;
      }
    };
    update();
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(update)
      : null;
    if (ro && progressRef.current) ro.observe(progressRef.current);
    return () => { if (ro) ro.disconnect(); };
  }, [progressRef]);

  const updateProgressDOM = useCallback((pct: number) => {
    // Update fill width
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${pct}%`;
    }
    // Update thumb position
    if (progressThumbRef.current) {
      progressThumbRef.current.style.left = `${pct}%`;
    }
    // Update time tooltip
    if (progressTimeRef.current && duration > 0) {
      progressTimeRef.current.textContent = formatDuration(Math.floor((pct / 100) * duration));
    }
    progressPctRef.current = pct;
  }, [duration]);

  const seekToPosition = useCallback((clientX: number) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;
    const barLeft = rect.left + 16;
    const barWidth = rect.width - 32;
    const x = clientX - barLeft;
    const pct = Math.max(0, Math.min(100, (x / barWidth) * 100));
    const time = (pct / 100) * duration;

    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    useAppStore.getState().setProgress(time);
    updateProgressDOM(pct);
  }, [duration, progressRef, updateProgressDOM]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    seekToPosition(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingRef.current) seekToPosition(ev.clientX);
    };
    const onMouseUp = (ev: MouseEvent) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      seekToPosition(ev.clientX);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [seekToPosition]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    const touch = e.touches[0];
    seekToPosition(touch.clientX);

    const onTouchMove = (ev: TouchEvent) => {
      if (isDraggingRef.current && ev.touches.length > 0) {
        seekToPosition(ev.touches[0].clientX);
      }
    };
    const onTouchEnd = (ev: TouchEvent) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      if (ev.changedTouches.length > 0) {
        seekToPosition(ev.changedTouches[0].clientX);
      }
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    // react-best-practices rule client-passive-event-listeners: touchmove
    // and touchend don't call preventDefault here, so mark as passive to
    // avoid scroll jank on mobile.
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
  }, [seekToPosition]);

  return {
    isDragging,
    setIsDragging,
    isDraggingRef,
    progressFillRef,
    progressThumbRef,
    progressTimeRef,
    progressPctRef,
    updateProgressDOM,
    seekToPosition,
    handleProgressMouseDown,
    handleProgressTouchStart,
  };
}
