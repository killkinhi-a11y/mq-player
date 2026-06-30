"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// VolumeSlider — premium custom volume control (SMOOTH)
// - Smooth width/height transitions on fill
// - Hover-reveal handle with smooth scale
// - Wheel support
// - Double-click to reset
// - Tooltip with smooth fade
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
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const updateFromClient = useCallback((clientX: number, clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    let pct: number;
    if (orientation === "horizontal") {
      pct = ((clientX - rect.left) / rect.width) * 100;
    } else {
      pct = 100 - ((clientY - rect.top) / rect.height) * 100;
    }
    onChange(clamp(pct));
  }, [orientation, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    updateFromClient(e.clientX, e.clientY);
  }, [updateFromClient]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
  }, [updateFromClient]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => updateFromClient(e.clientX, e.clientY);
    const onMouseUp = () => setIsDragging(false);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => setIsDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, updateFromClient]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -3 : 3;
    onChange(clamp(volume + delta));
  }, [volume, onChange]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(volume === 0 ? 70 : 0);
  }, [volume, onChange]);

  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(volume > 0 ? 0 : 70);
  }, [volume, onChange]);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const displayValue = Math.round(volume);
  const accentColor = "var(--mq-accent)";
  const trackBg = "rgba(255,255,255,0.08)";

  // Smooth transition — only when NOT dragging (so dragging feels instant)
  const fillTransition = isDragging ? "none" : "width 0.18s cubic-bezier(0.4, 0, 0.2, 1), height 0.18s cubic-bezier(0.4, 0, 0.2, 1)";
  const handleTransition = isDragging ? "transform 0.05s ease-out" : "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), left 0.18s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.18s cubic-bezier(0.4, 0, 0.2, 1)";

  if (orientation === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleIconClick}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            title={volume === 0 ? "Включить звук" : "Выключить звук"}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </motion.button>
        )}
        <div
          ref={trackRef}
          className="relative cursor-pointer"
          style={{
            width: "6px",
            height: "100px",
            backgroundColor: trackBg,
            borderRadius: "9999px",
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Fill */}
          <div
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
            className="absolute left-1/2 rounded-full pointer-events-none"
            style={{
              bottom: `calc(${volume}% - 8px)`,
              width: "16px",
              height: "16px",
              marginLeft: "-5px",
              backgroundColor: "#fff",
              boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accentColor}`,
              opacity: isHovering || isDragging ? 1 : 0,
              transform: `scale(${isHovering || isDragging ? 1 : 0.5})`,
              transition: handleTransition + ", opacity 0.18s ease",
            }}
          />
          {/* Tooltip */}
          <AnimatePresence>
            {(isHovering || isDragging) && (
              <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none whitespace-nowrap"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text)",
                  border: "1px solid var(--mq-border-thin)",
                }}
              >
                {displayValue}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {showValue && (
          <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{displayValue}</span>
        )}
      </div>
    );
  }

  // Horizontal
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleIconClick}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          title={volume === 0 ? "Включить звук" : "Выключить звук"}
        >
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </motion.button>
      )}
      <div
        ref={trackRef}
        className="relative cursor-pointer flex-1"
        style={{
          height: "6px",
          backgroundColor: trackBg,
          borderRadius: "9999px",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Fill */}
        <div
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
          className="absolute top-1/2 rounded-full pointer-events-none"
          style={{
            left: `calc(${volume}% - 8px)`,
            width: "16px",
            height: "16px",
            marginTop: "-5px",
            backgroundColor: "#fff",
            boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accentColor}`,
            opacity: isHovering || isDragging ? 1 : 0,
            transform: `translateY(0) scale(${isHovering || isDragging ? 1 : 0.5})`,
            transition: handleTransition + ", opacity 0.18s ease",
          }}
        />
        {/* Tooltip */}
        <AnimatePresence>
          {(isHovering || isDragging) && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-7 px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none whitespace-nowrap"
              style={{
                left: `${volume}%`,
                transform: "translateX(-50%)",
                backgroundColor: "var(--mq-card)",
                color: "var(--mq-text)",
                border: "1px solid var(--mq-border-thin)",
              }}
            >
              {displayValue}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {showValue && (
        <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{displayValue}</span>
      )}
    </div>
  );
}
