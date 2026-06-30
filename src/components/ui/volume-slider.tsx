"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// VolumeSlider — TRULY SMOOTH volume control (zero re-renders during drag)
//
// How it works:
// - The fill width and thumb position are controlled directly via refs
// - Drag events update refs via requestAnimationFrame (60fps)
// - React state is NEVER touched during drag → no re-renders
// - onChange callback is throttled to ~30Hz during drag
// - The only re-render is when `volume` prop changes externally (mute, etc)
//
// Result: butter-smooth drag even on low-end Android
// ═════════════════════════════════════════════════════════════════════════

interface VolumeSliderProps {
  volume: number;
  onChange: (v: number) => void;
  orientation?: "horizontal" | "vertical";
  showIcon?: boolean;
  showValue?: boolean;
  className?: string;
}

export default function VolumeSlider({
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

  // Track dragging state via refs (no React state)
  const isDraggingRef = useRef(false);
  const isHoveringRef = useRef(false);
  const lastOnChangeTime = useRef(0);
  const rafIdRef = useRef(0);

  // Current volume display (kept in sync via prop and during drag)
  const displayVolumeRef = useRef(volume);

  // ── Sync refs when volume changes externally ─────────────────────────
  useEffect(() => {
    if (isDraggingRef.current) return; // don't override during drag
    displayVolumeRef.current = volume;
    updateVisuals(volume, false);
  }, [volume]);

  // ── Update fill/thumb/tooltip DOM directly ───────────────────────────
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
      // Show/hide handle on hover/drag
      if (showHandle) {
        thumbRef.current.style.opacity = "1";
        thumbRef.current.style.transform = orientation === "horizontal"
          ? "translate(-50%, -50%) scale(1)"
          : "translate(-50%, 50%) scale(1)";
      } else {
        thumbRef.current.style.opacity = "0";
        thumbRef.current.style.transform = orientation === "horizontal"
          ? "translate(-50%, -50%) scale(0.5)"
          : "translate(-50%, 50%) scale(0.5)";
      }
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

  // ── Calculate volume from pointer position ───────────────────────────
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

  // ── Pointer down — start dragging ────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    const v = getVolumeFromPoint(e.clientX, e.clientY);
    displayVolumeRef.current = v;
    // Disable transition during drag for instant response
    if (fillRef.current) fillRef.current.style.transition = "none";
    if (thumbRef.current) thumbRef.current.style.transition = "none";
    updateVisuals(v, true);
    // Immediate onChange on pointer down
    onChange(v);
    lastOnChangeTime.current = performance.now();
  }, [getVolumeFromPoint, updateVisuals, onChange]);

  // ── Pointer move — RAF-throttled drag ────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Cancel any pending RAF
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

    // Schedule visual update on next frame
    rafIdRef.current = requestAnimationFrame(() => {
      const v = getVolumeFromPoint(clientX, clientY);
      displayVolumeRef.current = v;
      updateVisuals(v, true);

      // Throttle onChange to ~30Hz (every 33ms) — avoids flooding React store
      const now = performance.now();
      if (now - lastOnChangeTime.current >= 33) {
        onChange(v);
        lastOnChangeTime.current = now;
      }
    });
  }, [getVolumeFromPoint, updateVisuals, onChange]);

  // ── Pointer up — end dragging, restore transition, flush final value ─
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    isDraggingRef.current = false;

    // Flush final value
    const v = displayVolumeRef.current;
    onChange(v);

    // Restore smooth transition
    const transition = "width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
    if (fillRef.current) fillRef.current.style.transition = transition;
    if (thumbRef.current) {
      thumbRef.current.style.transition = "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease";
      // Hide handle if not hovering
      if (!isHoveringRef.current) {
        setTimeout(() => {
          if (!isHoveringRef.current && !isDraggingRef.current && thumbRef.current) {
            thumbRef.current.style.opacity = "0";
            thumbRef.current.style.transform = orientation === "horizontal"
              ? "translate(-50%, -50%) scale(0.5)"
              : "translate(-50%, 50%) scale(0.5)";
          }
        }, 100);
      }
    }
  }, [onChange, orientation]);

  // ── Hover handlers ───────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (!isDraggingRef.current) updateVisuals(displayVolumeRef.current, true);
  }, [updateVisuals]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (!isDraggingRef.current) {
      // Fade out handle
      if (thumbRef.current) {
        thumbRef.current.style.opacity = "0";
        thumbRef.current.style.transform = orientation === "horizontal"
          ? "translate(-50%, -50%) scale(0.5)"
          : "translate(-50%, 50%) scale(0.5)";
      }
      if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
    }
  }, [orientation]);

  // ── Wheel support ────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -3 : 3;
    const newV = Math.max(0, Math.min(100, displayVolumeRef.current + delta));
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current || isDraggingRef.current);
    onChange(newV);
  }, [onChange, updateVisuals]);

  // ── Double-click to mute/unmute ──────────────────────────────────────
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newV = displayVolumeRef.current === 0 ? 70 : 0;
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current);
    onChange(newV);
  }, [onChange, updateVisuals]);

  // ── Icon click ───────────────────────────────────────────────────────
  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newV = displayVolumeRef.current > 0 ? 0 : 70;
    displayVolumeRef.current = newV;
    updateVisuals(newV, isHoveringRef.current);
    onChange(newV);
  }, [onChange, updateVisuals]);

  // Cleanup RAF on unmount
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
          {/* Fill */}
          <div
            ref={fillRef}
            className="absolute bottom-0 left-0 right-0 rounded-full"
            style={{
              height: `${volume}%`,
              background: `linear-gradient(0deg, ${accentColor}, color-mix(in srgb, ${accentColor} 70%, #fff))`,
              transition: fillTransition,
              boxShadow: `0 0 8px color-mix(in srgb, ${accentColor} 50%, transparent)`,
            }}
          />
          {/* Drag handle */}
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
            }}
          />
          {/* Tooltip */}
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
              transition: "opacity 0.15s ease",
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
        {/* Fill */}
        <div
          ref={fillRef}
          className="absolute top-0 bottom-0 left-0 rounded-full"
          style={{
            width: `${volume}%`,
            background: `linear-gradient(90deg, ${accentColor}, color-mix(in srgb, ${accentColor} 70%, #fff))`,
            transition: fillTransition,
            boxShadow: `0 0 8px color-mix(in srgb, ${accentColor} 50%, transparent)`,
          }}
        />
        {/* Drag handle */}
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
          }}
        />
        {/* Tooltip */}
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
            transition: "opacity 0.15s ease",
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
