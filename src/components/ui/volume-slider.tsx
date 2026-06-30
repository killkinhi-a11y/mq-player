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
    rafRef.current = requestAnimationFrame(() => onChangeRef.current(v));
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleIconClick = useCallback(() => {
    onChangeRef.current(volumeRef.current > 0 ? 0 : 70);
  }, []);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const accent = "var(--mq-accent)";
  const volPct = `${volume}%`;

  if (orientation === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <button onClick={handleIconClick} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} title="Mute">
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        )}
        <div style={{ position: "relative", width: "8px", height: "100px" }}>
          <input
            ref={inputRef}
            type="range" min={0} max={100} value={volume} onChange={handleChange}
            className="mq-vslider-input"
            style={{
              "--mq-vol": volPct, "--mq-accent-color": accent,
              WebkitAppearance: "none", appearance: "none",
              position: "absolute", top: "50%", left: "50%",
              width: "100px", height: "8px",
              background: "transparent", outline: "none", cursor: "pointer",
              transform: "rotate(-90deg)", transformOrigin: "center",
              marginTop: "-4px", marginLeft: "-50px",
            } as React.CSSProperties}
          />
        </div>
        {showValue && <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
        <style>{`
          .mq-vslider-input::-webkit-slider-runnable-track {
            height: 8px; border-radius: 4px;
            background: linear-gradient(to right, var(--mq-accent-color) 0%, var(--mq-accent-color) var(--mq-vol), rgba(255,255,255,0.08) var(--mq-vol), rgba(255,255,255,0.08) 100%);
          }
          .mq-vslider-input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px var(--mq-accent-color); margin-top: -4px; cursor: pointer; }
          .mq-vslider-input::-moz-range-track { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); }
          .mq-vslider-input::-moz-range-progress { height: 8px; border-radius: 4px; background: var(--mq-accent-color); }
          .mq-vslider-input::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid var(--mq-accent-color); cursor: pointer; }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && (
        <button onClick={handleIconClick} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }} title="Mute">
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
      <input
        ref={inputRef}
        type="range" min={0} max={100} value={volume} onChange={handleChange}
        className="mq-hslider-input flex-1"
        style={{
          "--mq-vol": volPct, "--mq-accent-color": accent,
          WebkitAppearance: "none", appearance: "none",
          height: "8px", background: "transparent", outline: "none", cursor: "pointer",
        } as React.CSSProperties}
      />
      {showValue && <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}</span>}
      <style>{`
        .mq-hslider-input::-webkit-slider-runnable-track {
          height: 8px; border-radius: 4px;
          background: linear-gradient(to right, var(--mq-accent-color) 0%, var(--mq-accent-color) var(--mq-vol), rgba(255,255,255,0.08) var(--mq-vol), rgba(255,255,255,0.08) 100%);
        }
        .mq-hslider-input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px var(--mq-accent-color); margin-top: -4px; cursor: pointer; transition: transform 0.15s ease; }
        .mq-hslider-input:active::-webkit-slider-thumb { transform: scale(1.3); }
        .mq-hslider-input::-moz-range-track { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); }
        .mq-hslider-input::-moz-range-progress { height: 8px; border-radius: 4px; background: var(--mq-accent-color); }
        .mq-hslider-input::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid var(--mq-accent-color); cursor: pointer; }
      `}</style>
    </div>
  );
}

export default memo(VolumeSliderBase);
