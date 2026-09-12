"use client";

import React, { useCallback, useEffect, useId, useRef, memo } from "react";

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
  // useId() — SSR-stable unique id (Math.random() during render broke
  // hydration determinism). Colons stripped because they are invalid in
  // the generated CSS class selectors below.
  const sliderId = useId().replace(/[^a-zA-Z0-9]/g, "");

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
          height: "24px",
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
        input.mq-range-${sliderId}::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right,
            ${accent} 0%, ${accent} ${pct}%,
            var(--mq-glass-bg) ${pct}%, var(--mq-glass-bg) 100%);
          box-shadow: var(--mq-shadow-inner-glow);
        }
        input.mq-range-${sliderId}:focus-visible::-webkit-slider-runnable-track {
          box-shadow:
            0 0 0 2px color-mix(in srgb, var(--mq-accent) 30%, transparent),
            var(--mq-shadow-inner-glow);
        }
        /* MQ signature fader cap — same DNA as the EQ bank (v71).
           No scale-on-press: the accent border + halo is grab state. */
        input.mq-range-${sliderId}::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 5px;
          background-color: var(--mq-card);
          background-image: linear-gradient(var(--mq-text-muted), var(--mq-text-muted));
          background-size: 8px 2px;
          background-position: center;
          background-repeat: no-repeat;
          border: 2px solid color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card));
          box-shadow: var(--mq-shadow-sm);
          margin-top: -5px;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        input.mq-range-${sliderId}:hover::-webkit-slider-thumb,
        input.mq-range-${sliderId}:active::-webkit-slider-thumb,
        input.mq-range-${sliderId}:focus-visible::-webkit-slider-thumb {
          border-color: ${accent};
        }
        .mq-range-${sliderId}:active::-webkit-slider-thumb {
          box-shadow: var(--mq-shadow-accent-hover),
            0 0 0 5px color-mix(in srgb, var(--mq-accent) 16%, transparent);
        }
        input.mq-range-${sliderId}::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: var(--mq-glass-bg);
          box-shadow: var(--mq-shadow-inner-glow);
        }
        input.mq-range-${sliderId}::-moz-range-progress {
          height: 6px;
          border-radius: 3px;
          background: ${accent};
        }
        input.mq-range-${sliderId}::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 5px;
          background-color: var(--mq-card);
          background-image: linear-gradient(var(--mq-text-muted), var(--mq-text-muted));
          background-size: 8px 2px;
          background-position: center;
          background-repeat: no-repeat;
          border: 2px solid color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card));
          box-shadow: var(--mq-shadow-sm);
          cursor: pointer;
        }
        input.mq-range-${sliderId}:hover::-moz-range-thumb,
        input.mq-range-${sliderId}:active::-moz-range-thumb {
          border-color: ${accent};
        }
        .mq-range-${sliderId}:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default memo(RangeSliderBase);
