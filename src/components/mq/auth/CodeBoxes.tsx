"use client";

// Extracted from AuthView.tsx (Stage III decomposition) — moved verbatim.
import { useRef } from "react";

/** Reusable 6-digit code input (email confirmation / password reset). */
export function CodeBoxes({
  value,
  onChange,
  onAutoSubmit,
  disabled,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onAutoSubmit?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "");
    if (!digit) {
      onChange(value.map((d, i) => (i === index ? "" : d)));
      return;
    }
    const next = value.map((d, i) => (i === index ? digit[0] : d));
    onChange(next);
    if (index < 5) refs.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && onAutoSubmit) {
      setTimeout(() => onAutoSubmit(next.join("")), 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (value[index] === "" && index > 0) {
        refs.current[index - 1]?.focus();
        onChange(value.map((d, i) => (i === index - 1 ? "" : d)));
      } else {
        onChange(value.map((d, i) => (i === index ? "" : d)));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...value];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    onChange(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6 && onAutoSubmit) {
      setTimeout(() => onAutoSubmit(pasted), 200);
    }
  };

  return (
    <div className="flex justify-center gap-2.5 sm:gap-3">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleInput(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          disabled={disabled}
          className="mq-auth-code w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl outline-none transition-all duration-200"
          style={{
            /* V13: inset well — dark translucent fill, filled digits get a
               platinum hairline + slight lift; focus ring is NEUTRAL light
               (red stays exclusive to real errors). */
            backgroundColor: digit
              ? "color-mix(in srgb, var(--mq-platinum-lift, #c8ccd4) 9%, transparent)"
              : "color-mix(in srgb, #000000 26%, transparent)",
            border: `2px solid ${error ? '#ef4444' : digit ? 'color-mix(in srgb, var(--mq-platinum-hi, #d7dade) 38%, transparent)' : 'color-mix(in srgb, var(--mq-text, #f0f0f0) 12%, transparent)'}`,
            boxShadow: digit && !error
              ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 10px rgba(0,0,0,0.25)"
              : "inset 0 2px 6px rgba(0,0,0,0.28)",
            color: "var(--mq-text)",
            caretColor: "color-mix(in srgb, var(--mq-text, #f0f0f0) 70%, transparent)",
          }}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
