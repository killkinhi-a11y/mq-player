"use client";

import { useState } from "react";
import { Music, Waves } from "lucide-react";

/**
 * CoverImage — an artwork <img> that can NEVER render as a broken/black tile.
 *
 * P0 FIX (black square after «Следующий в WAVE»): remote covers (CDN /
 * image-proxy) 403/404/timeout often enough that the WAVE hero and the
 * mini-players regularly showed a dead black square. On load error this
 * component swaps — same geometry — to a deterministic quiet fallback:
 * a muted two-stop gradient keyed off the title, with the track's initials
 * (large tiles) or a small wave glyph (small tiles).
 *
 * Also carries the P2 perf contract: `loading="lazy"` + `decoding="async"`
 * by default (list cells); pass `eager` for the primary hero surfaces.
 */

function titleHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) % 360;
  }
  return h;
}

function initials(title: string): string {
  return (
    title
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "♪"
  );
}

export function CoverFallbackTile({
  title,
  variant = "icon",
  wave = false,
  className = "",
  style,
}: {
  title?: string;
  /** "initials" for hero-sized art (≥120px), "icon" for list cells. */
  variant?: "initials" | "icon";
  /** WAVE surfaces use the platinum wave glyph instead of the music note. */
  wave?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hue = titleHue(title || "mq");
  const Glyph = wave ? Waves : Music;
  return (
    <span
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 22% 20%), hsl(${(hue + 40) % 360} 20% 11%))`,
        ...style,
      }}
      aria-hidden="true"
    >
      {variant === "initials" && title ? (
        <span
          className="font-semibold select-none"
          style={{
            color: "color-mix(in srgb, var(--mq-text) 62%, transparent)",
            fontSize: "clamp(20px, 26cqw, 56px)",
            letterSpacing: "0.04em",
          }}
        >
          {initials(title)}
        </span>
      ) : (
        <Glyph
          className="w-1/3 h-1/3"
          style={{ color: "var(--mq-text-muted)" }}
        />
      )}
    </span>
  );
}

export default function CoverImage({
  src,
  title,
  variant = "icon",
  wave = false,
  className = "",
  style,
  eager = false,
  alt = "",
  draggable = false,
}: {
  src?: string | null;
  title?: string;
  variant?: "initials" | "icon";
  wave?: boolean;
  className?: string;
  style?: React.CSSProperties;
  eager?: boolean;
  alt?: string;
  draggable?: boolean;
}) {
  // The last-seen src lives INSIDE the state object ("storing information
  // from previous renders" — the official pattern; no refs during render,
  // which react-hooks/refs forbids).
  const [state, setState] = useState<{ src: string | null | undefined; failed: boolean }>(
    () => ({ src, failed: false }),
  );

  // src swap (track change) → retry the NEW url (adjust-state-during-render,
  // guarded + idempotent — a failed url must not poison the next track).
  if (state.src !== src) {
    setState({ src, failed: false });
  }

  if (!src || state.failed) {
    return (
      <CoverFallbackTile
        title={title}
        variant={variant}
        wave={wave}
        className={className}
        style={style}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={draggable}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setState((s) => (s.failed ? s : { ...s, failed: true }))}
      className={className}
      style={{ display: "block", ...style }}
    />
  );
}
