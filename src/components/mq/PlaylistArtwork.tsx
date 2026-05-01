"use client";

import { Music2, Compass, Sparkles, Sun, Waves, Zap, Mic2, Radio, Heart, Guitar, Piano, Music4 } from "lucide-react";

interface PlaylistArtworkProps {
  playlistId: string;
  size?: number;
  rounded?: string;
  className?: string;
}

// ── Per-playlist visual identity ──
// All colours derive from var(--mq-accent) — overlays create unique moods per playlist
type ShapeType = "circle" | "ring" | "blob";

const PLAYLIST_VISUALS: Record<string, {
  angle: number;                          // gradient direction (deg)
  tint: string;                           // white/black overlay for color shift
  icon: React.ElementType;
  shapes: { type: ShapeType; x: string; y: string; size: string; opacity: string; white?: boolean }[];
  glow: string;                           // radial glow position
  iconBg: string;                         // icon backdrop opacity
}> = {
  "for-you": {
    angle: 135,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.45) 100%)",
    icon: Sparkles,
    shapes: [
      { type: "circle", x: "10%", y: "15%", size: "40%", opacity: "0.15", white: true },
      { type: "ring", x: "60%", y: "55%", size: "35%", opacity: "0.10", white: true },
      { type: "blob", x: "30%", y: "65%", size: "25%", opacity: "0.08", white: true },
    ],
    glow: "circle at 30% 40%",
    iconBg: "0.14",
  },
  discoveries: {
    angle: 120,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(0,0,0,0.15) 100%)",
    icon: Compass,
    shapes: [
      { type: "circle", x: "70%", y: "10%", size: "30%", opacity: "0.12", white: true },
      { type: "ring", x: "15%", y: "60%", size: "40%", opacity: "0.10", white: true },
    ],
    glow: "circle at 70% 30%",
    iconBg: "0.18",
  },
  "new-releases": {
    angle: 160,
    tint: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)",
    icon: Music2,
    shapes: [
      { type: "circle", x: "5%", y: "70%", size: "35%", opacity: "0.12", white: true },
      { type: "ring", x: "65%", y: "20%", size: "30%", opacity: "0.10", white: true },
    ],
    glow: "circle at 50% 80%",
    iconBg: "0.12",
  },
  "daily-1": {
    angle: 145,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(0,0,0,0.25) 100%)",
    icon: Sun,
    shapes: [
      { type: "circle", x: "65%", y: "65%", size: "35%", opacity: "0.12", white: true },
      { type: "ring", x: "10%", y: "10%", size: "45%", opacity: "0.08", white: true },
    ],
    glow: "circle at 80% 20%",
    iconBg: "0.20",
  },
  chill: {
    angle: 200,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(0,0,0,0.30) 100%)",
    icon: Waves,
    shapes: [
      { type: "blob", x: "20%", y: "50%", size: "50%", opacity: "0.10", white: true },
      { type: "ring", x: "70%", y: "70%", size: "30%", opacity: "0.08", white: true },
    ],
    glow: "circle at 20% 80%",
    iconBg: "0.16",
  },
  energy: {
    angle: 45,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.50) 100%)",
    icon: Zap,
    shapes: [
      { type: "circle", x: "75%", y: "15%", size: "25%", opacity: "0.15", white: true },
      { type: "ring", x: "5%", y: "5%", size: "50%", opacity: "0.06", white: true },
      { type: "circle", x: "20%", y: "80%", size: "20%", opacity: "0.10", white: true },
    ],
    glow: "circle at 80% 80%",
    iconBg: "0.10",
  },
  "hip-hop": {
    angle: 170,
    tint: "linear-gradient(160deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.50) 100%)",
    icon: Mic2,
    shapes: [
      { type: "circle", x: "60%", y: "70%", size: "30%", opacity: "0.12", white: true },
      { type: "ring", x: "10%", y: "20%", size: "35%", opacity: "0.08", white: true },
    ],
    glow: "circle at 30% 20%",
    iconBg: "0.10",
  },
  electronic: {
    angle: 225,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0.10) 100%)",
    icon: Radio,
    shapes: [
      { type: "ring", x: "50%", y: "50%", size: "60%", opacity: "0.08", white: true },
      { type: "circle", x: "10%", y: "80%", size: "25%", opacity: "0.10", white: true },
    ],
    glow: "circle at 50% 50%",
    iconBg: "0.22",
  },
  "rnb-soul": {
    angle: 130,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.35) 100%)",
    icon: Heart,
    shapes: [
      { type: "circle", x: "70%", y: "25%", size: "30%", opacity: "0.10", white: true },
      { type: "blob", x: "10%", y: "60%", size: "40%", opacity: "0.06", white: true },
    ],
    glow: "circle at 70% 70%",
    iconBg: "0.14",
  },
  rock: {
    angle: 180,
    tint: "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 100%)",
    icon: Guitar,
    shapes: [
      { type: "circle", x: "15%", y: "15%", size: "35%", opacity: "0.12", white: true },
      { type: "ring", x: "65%", y: "65%", size: "30%", opacity: "0.08", white: true },
    ],
    glow: "circle at 20% 70%",
    iconBg: "0.08",
  },
  jazz: {
    angle: 150,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(0,0,0,0.40) 100%)",
    icon: Piano,
    shapes: [
      { type: "blob", x: "60%", y: "20%", size: "45%", opacity: "0.08", white: true },
      { type: "ring", x: "10%", y: "70%", size: "30%", opacity: "0.10", white: true },
    ],
    glow: "circle at 80% 50%",
    iconBg: "0.16",
  },
  classical: {
    angle: 190,
    tint: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.55) 100%)",
    icon: Music4,
    shapes: [
      { type: "ring", x: "50%", y: "50%", size: "50%", opacity: "0.08", white: true },
      { type: "circle", x: "15%", y: "15%", size: "20%", opacity: "0.06", white: true },
    ],
    glow: "circle at 50% 30%",
    iconBg: "0.08",
  },
};

const FALLBACK_VISUAL = {
  angle: 135,
  tint: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.45) 100%)",
  icon: Music2,
  shapes: [
    { type: "circle" as ShapeType, x: "50%", y: "50%", size: "40%", opacity: "0.10", white: true },
  ],
  glow: "circle at 50% 50%",
  iconBg: "0.14",
};

export default function PlaylistArtwork({ playlistId, size, rounded = "rounded-2xl", className = "" }: PlaylistArtworkProps) {
  const vis = PLAYLIST_VISUALS[playlistId] || FALLBACK_VISUAL;
  const Icon = vis.icon;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${rounded} ${className}`}
      style={{
        width: size || "100%",
        height: size || "100%",
        aspectRatio: "1/1",
      }}
    >
      {/* Layer 1: Base accent color */}
      <div className="absolute inset-0" style={{ background: "var(--mq-accent)" }} />

      {/* Layer 2: Color tint overlay — creates unique shade per playlist */}
      <div className="absolute inset-0" style={{ background: vis.tint }} />

      {/* Layer 3: Radial glow for depth */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(${vis.glow}, rgba(255,255,255,0.08) 0%, transparent 55%)` }} />

      {/* Layer 4: Noise texture */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      {/* Layer 5: Decorative shapes */}
      {vis.shapes.map((shape, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
            opacity: shape.opacity,
            borderRadius: shape.type === "blob"
              ? "60% 40% 30% 70% / 60% 30% 70% 40%"
              : "50%",
            background: shape.type === "ring"
              ? "transparent"
              : "rgba(255,255,255,0.85)",
            border: shape.type === "ring" ? "2px solid rgba(255,255,255,0.3)" : "none",
            transform: shape.type === "blob" ? "rotate(-15deg)" : "none",
          }}
        />
      ))}

      {/* Layer 6: Center icon with glass backdrop */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          width: "38%",
          height: "38%",
          borderRadius: "50%",
          background: `rgba(255,255,255,${vis.iconBg})`,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        }}
      >
        <Icon
          className="w-1/2 h-1/2"
          style={{ color: "rgba(255,255,255,0.95)" }}
          strokeWidth={1.8}
        />
      </div>
    </div>
  );
}
