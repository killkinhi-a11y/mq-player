"use client";

import { Music2, Compass, Sparkles, Sun, Waves, Zap, Mic2, Radio, Heart, Guitar, Piano, Music4 } from "lucide-react";

interface PlaylistArtworkProps {
  playlistId: string;
  size?: number;
  rounded?: string;
  className?: string;
}

// Each playlist has a unique icon + subtle gradient mood
// All base colors come from var(--mq-accent) — minimal and clean
const PLAYLIST_VISUALS: Record<string, {
  icon: React.ElementType;
  darkFactor: number;  // 0–0.5: how much to darken (creates visual variety)
}> = {
  "for-you":      { icon: Sparkles, darkFactor: 0.28 },
  discoveries:    { icon: Compass,  darkFactor: 0.08 },
  "new-releases": { icon: Music2,   darkFactor: 0.42 },
  "daily-1":      { icon: Sun,      darkFactor: 0.15 },
  chill:          { icon: Waves,    darkFactor: 0.20 },
  energy:         { icon: Zap,      darkFactor: 0.40 },
  "hip-hop":      { icon: Mic2,     darkFactor: 0.35 },
  electronic:     { icon: Radio,    darkFactor: 0.12 },
  "rnb-soul":     { icon: Heart,    darkFactor: 0.25 },
  rock:           { icon: Guitar,   darkFactor: 0.45 },
  jazz:           { icon: Piano,    darkFactor: 0.30 },
  classical:      { icon: Music4,   darkFactor: 0.48 },
};

const FALLBACK = { icon: Music2, darkFactor: 0.28 };

export default function PlaylistArtwork({ playlistId, size, rounded = "rounded-2xl", className = "" }: PlaylistArtworkProps) {
  const vis = PLAYLIST_VISUALS[playlistId] || FALLBACK;
  const Icon = vis.icon;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${rounded} ${className}`}
      style={{
        width: size || "100%",
        height: size || "100%",
        aspectRatio: "1/1",
        background: "var(--mq-accent)",
      }}
    >
      {/* Subtle gradient for depth — darker at bottom */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, transparent 20%, rgba(0,0,0,${vis.darkFactor}) 100%)` }}
      />

      {/* Soft light spot at top for dimension */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,255,255,0.10) 0%, transparent 100%)",
        }}
      />

      {/* Icon — clean, centered, white */}
      <Icon
        className="relative z-10"
        style={{
          width: "32%",
          height: "32%",
          color: "rgba(255,255,255,0.90)",
          strokeWidth: 1.5,
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.20))",
        }}
      />
    </div>
  );
}
