"use client";

import React, { useCallback, useEffect, useRef, memo } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// VolumeSlider — native input[type=range] for buttery smoothness
//
// Why native input? On Android WebView, custom div-based sliders feel janky
// because JS-driven visual updates (even at 60fps) can't match the browser's
// native thumb rendering which is hardware-accelerated and runs on the
// compositor thread.
//
// The native input handles the thumb movement 100% in native code.
// We only intercept `onChange` and throttle it via RAF to avoid store floods.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const rafIdRef = useRef(0);
  const lastValueRef = useRef(volume);

  // Keep latest onChange without re-subscribing
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Throttled onChange via RAF — avoids flooding the store
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    lastValueRef.current = v;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      onChangeRef.current(v);
    });
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const handleIconClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newV = volume > 0 ? 0 : 70;
    onChangeRef.current(newV);
  }, [volume]);

  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const displayValue = Math.round(volume);
  const accent = "var(--mq-accent)";

  if (orientation === "vertical") {
    // Vertical mode — rotate a native horizontal input 90deg
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {showIcon && (
          <button
            onClick={handleIconClick}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
            title={volume === 0 ? "Включить звук" : "Выключить звук"}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        )}
        <div style={{ position: "relative", width: "100px", height: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <input
            ref={inputRef}
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={handleChange}
            className="mq-vslider-input"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
              width: "100px",
              height: "8px",
              background: "transparent",
              outline: "none",
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            }}
          />
        </div>
        {showValue && (
          <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{displayValue}</span>
        )}
        <style>{`
          .mq-vslider-input::-webkit-slider-runnable-track {
            height: 8px;
            border-radius: 4px;
            background: linear-gradient(to right,
              ${accent} 0%, ${accent} ${volume}%,
              rgba(255,255,255,0.08) ${volume}%, rgba(255,255,255,0.08) 100%);
          }
          .mq-vslider-input::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accent};
            margin-top: -4px;
            cursor: pointer;
          }
          .mq-vslider-input::-moz-range-track {
            height: 8px;
            border-radius: 4px;
            background: rgba(255,255,255,0.08);
          }
          .mq-vslider-input::-moz-range-progress {
            height: 8px;
            border-radius: 4px;
            background: ${accent};
          }
          .mq-vslider-input::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid ${accent};
            cursor: pointer;
          }
        `}</style>
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
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
          title={volume === 0 ? "Включить звук" : "Выключить звук"}
        >
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={handleChange}
        className="mq-hslider-input flex-1"
        style={{
          WebkitAppearance: "none",
          appearance: "none",
          height: "8px",
          background: "transparent",
          outline: "none",
          cursor: "pointer",
        }}
      />
      {showValue && (
        <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--mq-text-muted)" }}>{displayValue}</span>
      )}
      <style>{`
        .mq-hslider-input::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(to right,
            ${accent} 0%, ${accent} ${volume}%,
            rgba(255,255,255,0.08) ${volume}%, rgba(255,255,255,0.08) 100%);
        }
        .mq-hslider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accent};
          margin-top: -4px;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .mq-hslider-input:active::-webkit-slider-thumb {
          transform: scale(1.3);
        }
        .mq-hslider-input::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
        }
        .mq-hslider-input::-moz-range-progress {
          height: 8px;
          border-radius: 4px;
          background: ${accent};
        }
        .mq-hslider-input::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid ${accent};
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default memo(VolumeSliderBase);
