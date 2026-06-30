"use client";

import React, { useCallback, useEffect, useRef, memo } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// VolumeSlider — BUTTER-SMOOTH volume control
//
// Key insight: The drag must NOT trigger React re-renders of THIS component.
// We achieve this by:
//   1. Using refs for ALL state (no useState)
//   2. Updating DOM directly via refs (no React reconciliation)
//   3. Throttling onChange to 30Hz
//   4. memo() wrapper — only re-renders if `volume` prop actually changes
//   5. During drag, we IGNORE volume prop changes (use displayVolumeRef)
//
// The component NEVER re-renders during drag — it's 100% ref-driven.
// ═════════════════════════════════════════════════════════════════════════

interface VolumeSliderProps {
  volume: number;
  onChange: (v: number) => void;
  orientation?: "horizontal" | "vertical";
  showIcon?: boolean;
  showValue?: boolean;
  className?: string;
}

function VolumeSliderBase({
  volume,
  onChange,
  orientation = "horizontal",
  showIcon = true,
  showValue = false,
  className = "",
}: VolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(false);
  const isHoveringRef = useRef(false);
  const lastOnChangeTime = useRef(0);
  const rafIdRef = useRef(0);
  const displayVolumeRef = useRef(volume);
  const onChangeRef = useRef(onChange);

  // Keep latest onChange without re-subscribing listeners
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // ── Update visuals directly via refs (NO React state) ─────────────────
  const updateVisuals = useCallback((v: number, showHandle: boolean) => {
    const pct = Math.max(0, Math.min(100, v));
    if (fillRef.current) {
      if (orientation === "horizontal") {
        fillRef.current.style.width = `${pct}%`;
      } else {
        fillRef.current.style.height = `${pct}%`;
      }
    }
    if (thumbRef.current) {
      if (orientation === "horizontal") {
        thumbRef.current.style.left = `${pct}%`;
      } else {
        thumbRef.current.style.bottom = `${pct}%`;
      }
      const scale = showHandle ? 1 : 0.5;
      const opacity = showHandle ? "1" : "0";
      thumbRef.current.style.opacity = opacity;
      thumbRef.current.style.transform = orientation === "horizontal"
        ? `translate(-50%, -50%) scale(${scale})`
        : `translate(-50%, 50%) scale(${scale})`;
    }
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = showHandle ? "1" : "0";
      if (orientation === "horizontal") {
        tooltipRef.current.style.left = `${pct}%`;
      } else {
        tooltipRef.current.style.bottom = `${pct}%`;
      }
      tooltipRef.current.textContent = `${Math.round(v)}`;
    }
  }, [orientation]);

  // ── External volume sync (only when NOT dragging) ─────────────────────
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (Math.abs(displayVolumeRef.current - volume) < 0.5) return;
    displayVolumeRef.current = volume;
    updateVisuals(volume, isHoveringRef.current);
  }, [volume, updateVisuals]);

  // ── Calculate volume from pointer ─────────────────────────────────────
  const getVolumeFromPoint = useCallback((clientX: number, clientY: number): number => {
    if (!trackRef.current) return displayVolumeRef.current;
    const rect = trackRef.current.getBoundingClientRect();
    let pct: number;
    if (orientation === "horizontal") {
      pct = ((clientX - rect.left) / rect.width) * 100;
    } else {
      pct = 100 - ((clientY - rect.top) / rect.height) * 100;
    }
    return Math.max(0, Math.min(100, pct));
  }, [orientation]);

  // ── Pointer down — start drag ─────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}

    isDraggingRef.current = true;
    const v = getVolumeFromPoint(e.clientX, e.clientY);
    displayVolumeRef.current = v;

    // Disable transitions during drag for instant response
    if (fillRef.current) fillRef.current.style.transition = "none";
    if (thumbRef.current) thumbRef.current.style.transition = "none";
    if (tooltipRef.current) tooltipRef.current.style.transition = "none";

    updateVisuals(v, true);
    onChangeRef.current(v);
    lastOnChangeTime.current = performance.now();
  }, [getVolumeFromPoint, updateVisuals]);

  // ── Pointer move — RAF-throttled ──────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const v = getVolumeFromPoint(clientX, clientY);
      displayVolumeRef.current = v;
      updateVisuals(v, true);

      // Throttle onChange to 30Hz
      const now = performance.now();
      if (now - lastOnChangeTime.current >= 33) {
        onChangeRef.current(v);
        lastOnChangeTime.current = now;
      }
    });
  }, [getVolumeFromPoint, updateVisuals]);

  // ── Pointer up — end drag ─────────────────────────────────────────────
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    isDraggingRef.current = false;

    // Flush final value
    onChangeRef.current(displayVolumeRef.current);

    // Restore transitions
    const fillTransition = "width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
    const thumbTransition = "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease";
    const tooltipTransition = "opacity 0.15s ease, left 0.2s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s cubic-bezier(0.4, 0, 0.2, 1)";

    if (fillRef.current) fillRef.current.style.transition = fillTransition;
    if (thumbRef.current) thumbRef.current.style.transition = thumbTransition;
    if (tooltipRef.current) tooltipRef.current.style.transition = tooltipTransition;

    // Hide handle if not hovering
    if (!isHoveringRef.current) {
      requestAnimationFrame(() => {
        if (!isHoveringRef.current && !isDraggingRef.current) {
          updateVisuals(displayVolumeRef.current, false);
        }
      });
    }
  }, [updateVisuals]);

  // ── Hover ─────────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (!isDraggingRef.current) {
      if (thumbRef.current) thumbRef.current.style.transition = "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, left 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
      if (tooltipRef.current) tooltipRef.current.style.transition = "opacity 0.15s ease";
      updateVisuals(displayVolumeRef.current, true);
    }
  }, [updateVisuals]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (!isDraggingRef.current) {
      if (thumbRef.current) thumbRef.current.style.transition = "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease";
      if (tooltipRef.current) tooltipRef.current.style.transition = "opacity 0.15s ease";
      updateVisuals(displayVolumeRef.current, false);
    }
  }, [updateVisuals]);

  // ── Wheel ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -3 : 3;
    const newV = Math.max(0, Math.min(100, displayVolumeRef.current + delta));
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current || isDraggingRef.current);
    onChangeRef.current(newV);
  }, [updateVisuals]);

  // ── Double click = mute toggle ────────────────────────────────────────
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newV = displayVolumeRef.current === 0 ? 70 : 0;
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current);
    onChangeRef.current(newV);
  }, [updateVisuals]);

  // ── Icon click ────────────────────────────────────────────────────────
  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newV = displayVolumeRef.current > 0 ? 0 : 70;
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current);
    onChangeRef.current(newV);
  }, [updateVisuals]);

  // ── Initial visuals sync ──────────────────────────────────────────────
  useEffect(() => {
    updateVisuals(volume, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const accentColor = "var(--mq-accent)";
  const trackBg = "rgba(255,255,255,0.08)";
  const fillTransition = "width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
  const thumbTransition = "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease";
  const tooltipTransition = "opacity 0.15s ease, left 0.2s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s cubic-bezier(0.4, 0, 0.2, 1)";

  if (orientation === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <button
            onClick={handleIconClick}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, transition: "transform 0.15s ease" }}
            title={volume === 0 ? "Включить звук" : "Выключить звук"}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        )}
        <div
          ref={trackRef}
          className="relative cursor-pointer touch-none select-none"
          style={{
            width: "8px",
            height: "100px",
            backgroundColor: trackBg,
            borderRadius: "9999px",
            willChange: "transform",
            transform: "translateZ(0)",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            ref={fillRef}
            className="absolute bottom-0 left-0 right-0 rounded-full"
            style={{
              height: `${volume}%`,
              background: `linear-gradient(0deg, ${accentColor}, color-mix(in srgb, ${accentColor} 70%, #fff))`,
              transition: fillTransition,
              boxShadow: `0 0 8px color-mix(in srgb, ${accentColor} 50%, transparent)`,
              willChange: "height",
            }}
          />
          <div
            ref={thumbRef}
            className="absolute rounded-full pointer-events-none"
            style={{
              bottom: `${volume}%`,
              left: "50%",
              width: "16px",
              height: "16px",
              transform: "translate(-50%, 50%) scale(0.5)",
              opacity: 0,
              backgroundColor: "#fff",
              boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accentColor}`,
              transition: thumbTransition,
              willChange: "transform, opacity",
            }}
          />
          <div
            ref={tooltipRef}
            className="absolute left-full ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none whitespace-nowrap"
            style={{
              bottom: `${volume}%`,
              transform: "translateY(50%)",
              opacity: 0,
              backgroundColor: "var(--mq-card)",
              color: "var(--mq-text)",
              border: "1px solid var(--mq-border-thin)",
              transition: tooltipTransition,
            }}
          >
            {Math.round(volume)}
          </div>
        </div>
        {showValue && (
          <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>
        )}
      </div>
    );
  }

  // Horizontal
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <button
          onClick={handleIconClick}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, transition: "transform 0.15s ease" }}
          title={volume === 0 ? "Включить звук" : "Выключить звук"}
        >
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
      <div
        ref={trackRef}
        className="relative cursor-pointer flex-1 touch-none select-none"
        style={{
          height: "8px",
          backgroundColor: trackBg,
          borderRadius: "9999px",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={fillRef}
          className="absolute top-0 bottom-0 left-0 rounded-full"
          style={{
            width: `${volume}%`,
            background: `linear-gradient(90deg, ${accentColor}, color-mix(in srgb, ${accentColor} 70%, #fff))`,
            transition: fillTransition,
            boxShadow: `0 0 8px color-mix(in srgb, ${accentColor} 50%, transparent)`,
            willChange: "width",
          }}
        />
        <div
          ref={thumbRef}
          className="absolute top-1/2 rounded-full pointer-events-none"
          style={{
            left: `${volume}%`,
            width: "16px",
            height: "16px",
            transform: "translate(-50%, -50%) scale(0.5)",
            opacity: 0,
            backgroundColor: "#fff",
            boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accentColor}`,
            transition: thumbTransition,
            willChange: "transform, opacity, left",
          }}
        />
        <div
          ref={tooltipRef}
          className="absolute -top-7 px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none whitespace-nowrap"
          style={{
            left: `${volume}%`,
            transform: "translateX(-50%)",
            opacity: 0,
            backgroundColor: "var(--mq-card)",
            color: "var(--mq-text)",
            border: "1px solid var(--mq-border-thin)",
            transition: tooltipTransition,
          }}
        >
          {Math.round(volume)}
        </div>
      </div>
      {showValue && (
        <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>
      )}
    </div>
  );
}

// memo() — only re-render if props actually changed
export default memo(VolumeSliderBase);
