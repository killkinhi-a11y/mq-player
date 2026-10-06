"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  /** Section title */
  title: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Optional action button(s) on the right */
  action?: ReactNode;
  /** Margin bottom for the header itself */
  className?: string;
}

/**
 * Unified section header for MainView.
 * Ensures consistent icon badge, title typography, and right-side action layout
 * across all sections (Playlists, Trending, Recent, Activity, etc.).
 */
export default function SectionHeader({
  title,
  icon: Icon,
  action,
  className = "mb-4",
}: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            /* RED ACCENT FIX: section icon chip was accent-red tint — tonal
               text tone, same language as every other icon chip. */
            backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--mq-text) 10%, transparent)",
          }}
        >
          <Icon className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
        </div>
        <h2
          className="truncate"
          style={{
            color: "var(--mq-text)",
            fontSize: "var(--mq-text-xl)",
            fontWeight: "var(--mq-font-bold)",
            letterSpacing: "var(--mq-tracking-tight)",
          }}
        >
          {title}
        </h2>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
