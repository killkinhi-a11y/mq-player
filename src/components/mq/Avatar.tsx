"use client";

import { useState, type CSSProperties } from "react";

/**
 * Shared Avatar component (P3.1).
 *
 * Previously duplicated in MessengerView.tsx (line 71) and FriendsView.tsx
 * (line 37) with slightly different fallback logic. This is the single
 * source of truth.
 *
 * Usage:
 *   <Avatar src={user.avatar} alt={user.username} size="md" />
 *   <Avatar src={user.avatar} alt={user.username} className="w-10 h-10" />
 */

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "w-6 h-6 text-[11px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-20 h-20 text-2xl",
};

interface AvatarProps {
  src?: string;
  alt: string;
  size?: AvatarSize;
  className?: string;
  style?: CSSProperties;
  /** Show online indicator dot (green) */
  online?: boolean;
  /** Ring border color (e.g. for stories) */
  ring?: boolean;
}

export function Avatar({
  src,
  alt,
  size = "md",
  className = "",
  style,
  online = false,
  ring = false,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = alt?.charAt(0)?.toUpperCase() || "?";
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold ${ring ? "ring-2" : ""} ${sizeClass} ${className}`}
      style={style}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            backgroundColor: "var(--mq-accent, #e03131)",
            color: "#fff",
          }}
        >
          {initials}
        </div>
      )}
      {online && (
        <div
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
          style={{
            backgroundColor: "#22c55e",
            borderColor: "var(--mq-card, #1a1a1a)",
          }}
        />
      )}
    </div>
  );
}
