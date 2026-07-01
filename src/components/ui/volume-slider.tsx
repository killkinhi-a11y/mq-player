"use client";

import React, { useCallback, useEffect, useRef, memo } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

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
      e.target.style.setProperty("--mq-vol", `${v}%`);
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleIconClick = useCallback(() => {
    onChangeRef.current(volumeRef.current > 0 ? 0 : 70);
  }, []);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const volPct = `${volume}%`;

  if (orientation === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <button onClick={handleIconClick} aria-label="Mute" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
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
        {showValue && <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <button onClick={handleIconClick} aria-label="Mute" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
      <input
        ref={inputRef}
        type="range" min={0} max={100} value={volume} onChange={handleChange}
        className="mq-hslider-input flex-1"
        style={{ "--mq-vol": volPct } as React.CSSProperties}
      />
      {showValue && <span className="text-[10px] font-mono w-7 text-right flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
    </div>
  );
}

export default memo(VolumeSliderBase);
