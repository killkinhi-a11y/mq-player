"use client";

import React, { useCallback, useEffect, useRef, memo } from "react";

// ═════════════════════════════════════════════════════════════════════════
// RangeSlider — generic smooth slider using native input[type=range]
//
// Uses native input for buttery-smooth hardware-accelerated thumb movement.
// onChange is throttled via RAF to prevent store flooding.
// Fill is rendered via CSS gradient on the runnable-track.
// ═════════════════════════════════════════════════════════════════════════

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  label?: string;
  showValue?: boolean;
  valueSuffix?: string;
  minLabel?: string;
  maxLabel?: string;
}

function RangeSliderBase({
  value,
  min,
  max,
  step = 1,
  onChange,
  className = "",
  label,
  showValue = false,
  valueSuffix = "",
  minLabel,
  maxLabel,
}: RangeSliderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const rafIdRef = useRef(0);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      onChangeRef.current(v);
    });
  }, []);

  useEffect(() => {
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, []);

  const pct = ((value - min) / (max - min)) * 100;
  const accent = "var(--mq-accent)";
  const sliderId = useRef(`mq-range-${Math.random().toString(36).slice(2, 9)}`).current;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {minLabel && (
        <span className="text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{minLabel}</span>
      )}
      {label && !minLabel && (
        <span className="text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{label}</span>
      )}
      <input
        ref={inputRef}
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className={`mq-range-${sliderId} flex-1`}
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
        <span className="text-xs font-mono w-12 text-right flex-shrink-0" style={{ color: "var(--mq-accent)" }}>
          {value}{valueSuffix}
        </span>
      )}
      {maxLabel && (
        <span className="text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{maxLabel}</span>
      )}
      <style>{`
        .mq-range-${sliderId}::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(to right,
            ${accent} 0%, ${accent} ${pct}%,
            rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%);
        }
        .mq-range-${sliderId}::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${accent};
          margin-top: -5px;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .mq-range-${sliderId}:active::-webkit-slider-thumb {
          transform: scale(1.3);
        }
        .mq-range-${sliderId}::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
        }
        .mq-range-${sliderId}::-moz-range-progress {
          height: 8px;
          border-radius: 4px;
          background: ${accent};
        }
        .mq-range-${sliderId}::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid ${accent};
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default memo(RangeSliderBase);
