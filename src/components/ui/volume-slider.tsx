"use client";

import React, { useCallback, useEffect, useRef, memo } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { getLastVolume } from "@/store/useAppStore";

interface VolumeSliderProps {
  volume: number;
  onChange: (v: number) => void;
  orientation?: "horizontal" | "vertical";
  showIcon?: boolean;
  showValue?: boolean;
  className?: string;
}

function VolumeSliderBase({ volume, onChange, orientation = "horizontal", showIcon = true, showValue = false, className = "" }: VolumeSliderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const rafRef = useRef(0);
  const volumeRef = useRef(volume);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onChangeRef.current(v);
      // Update CSS var for fill gradient
      e.target.style.setProperty("--mq-vol", `${v}%`);
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // v10.3 fix: unmute restores the LAST audible level (store memory) instead
  // of a hardcoded 70 — mute@27 → unmute → 27, not 70. Matches the mini
  // PlayerBar behavior and the user-perceived value.
  const handleIconClick = useCallback(() => {
    onChangeRef.current(volumeRef.current > 0 ? 0 : getLastVolume());
  }, []);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const volPct = `${volume}%`;

  if (orientation === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <button onClick={handleIconClick} aria-label={volume === 0 ? "Включить звук" : "Выключить звук"} className="mq-volmute mq-icon-btn mq-press flex items-center justify-center flex-shrink-0" style={{ border: "none", cursor: "pointer", padding: 0 }}>
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        )}
        <div style={{ position: "relative", width: "8px", height: "100px" }}>
          <input
            ref={inputRef}
            type="range" min={0} max={100} value={volume} onChange={handleChange}
            className="mq-vslider-input"
            style={{
              "--mq-vol": volPct,
              position: "absolute", top: "50%", left: "50%",
              width: "100px", height: "20px",
              transform: "rotate(-90deg)", transformOrigin: "center",
              marginTop: "-10px", marginLeft: "-50px",
            } as React.CSSProperties}
          />
        </div>
        {showValue && <span className="mq-t-meta-2 font-mono" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <button onClick={handleIconClick} aria-label={volume === 0 ? "Включить звук" : "Выключить звук"} className="mq-volmute mq-icon-btn mq-press w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: "none", cursor: "pointer", padding: 0 }}>
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
      <input
        ref={inputRef}
        type="range" min={0} max={100} value={volume} onChange={handleChange}
        className="mq-hslider-input flex-1"
        style={{ "--mq-vol": volPct } as React.CSSProperties}
      />
      {showValue && <span className="mq-t-meta-2 font-mono w-7 text-right flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
    </div>
  );
}

export default memo(VolumeSliderBase);
