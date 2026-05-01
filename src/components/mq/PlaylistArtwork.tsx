"use client";

import { Music2, Compass, Sparkles, Sun, Waves, Zap, Mic2, Radio, Heart, Guitar, Piano, Music4 } from "lucide-react";

interface PlaylistArtworkProps {
  playlistId: string;
  size?: number;        // CSS width/height in px
  rounded?: string;     // border-radius class
  className?: string;
  showLabel?: boolean;
}

// ── Per-playlist visual identity ──
const PLAYLIST_VISUALS: Record<string, {
  gradient: string;
  icon: React.ElementType;
  iconColor: string;
  shapes: { type: "circle" | "ring" | "blob"; x: string; y: string; size: string; opacity: string; color?: string }[];
  pattern: string;
}> = {
  "for-you": {
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    icon: Sparkles,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "10%", y: "15%", size: "40%", opacity: "0.15", color: "#fff" },
      { type: "ring", x: "60%", y: "55%", size: "35%", opacity: "0.10" },
      { type: "blob", x: "30%", y: "65%", size: "25%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 30% 40%, rgba(255,255,255,0.06) 0%, transparent 60%)",
  },
  discoveries: {
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    icon: Compass,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "70%", y: "10%", size: "30%", opacity: "0.12", color: "#fff" },
      { type: "ring", x: "15%", y: "60%", size: "40%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  "new-releases": {
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    icon: Music2,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "5%", y: "70%", size: "35%", opacity: "0.12", color: "#fff" },
      { type: "ring", x: "65%", y: "20%", size: "30%", opacity: "0.10" },
    ],
    pattern: "radial-gradient(circle at 50% 80%, rgba(255,255,255,0.06) 0%, transparent 50%)",
  },
  "daily-1": {
    gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    icon: Sun,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "65%", y: "65%", size: "35%", opacity: "0.12", color: "#fff" },
      { type: "ring", x: "10%", y: "10%", size: "45%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 40%)",
  },
  chill: {
    gradient: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
    icon: Waves,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "blob", x: "20%", y: "50%", size: "50%", opacity: "0.10" },
      { type: "ring", x: "70%", y: "70%", size: "30%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  energy: {
    gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    icon: Zap,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "75%", y: "15%", size: "25%", opacity: "0.15", color: "#fff" },
      { type: "ring", x: "5%", y: "5%", size: "50%", opacity: "0.06" },
      { type: "circle", x: "20%", y: "80%", size: "20%", opacity: "0.10", color: "#fff" },
    ],
    pattern: "radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 40%)",
  },
  "hip-hop": {
    gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    icon: Mic2,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "60%", y: "70%", size: "30%", opacity: "0.12", color: "#fff" },
      { type: "ring", x: "10%", y: "20%", size: "35%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  electronic: {
    gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    icon: Radio,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "ring", x: "50%", y: "50%", size: "60%", opacity: "0.08" },
      { type: "circle", x: "10%", y: "80%", size: "25%", opacity: "0.10", color: "#fff" },
    ],
    pattern: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 50%)",
  },
  "rnb-soul": {
    gradient: "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)",
    icon: Heart,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "70%", y: "25%", size: "30%", opacity: "0.10", color: "#fff" },
      { type: "blob", x: "10%", y: "60%", size: "40%", opacity: "0.06" },
    ],
    pattern: "radial-gradient(circle at 70% 70%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  rock: {
    gradient: "linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)",
    icon: Guitar,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "circle", x: "15%", y: "15%", size: "35%", opacity: "0.12", color: "#fff" },
      { type: "ring", x: "65%", y: "65%", size: "30%", opacity: "0.08" },
    ],
    pattern: "radial-gradient(circle at 20% 70%, rgba(255,255,255,0.08) 0%, transparent 50%)",
  },
  jazz: {
    gradient: "linear-gradient(135deg, #ffd89b 0%, #19547b 100%)",
    icon: Piano,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "blob", x: "60%", y: "20%", size: "45%", opacity: "0.08" },
      { type: "ring", x: "10%", y: "70%", size: "30%", opacity: "0.10" },
    ],
    pattern: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 40%)",
  },
  classical: {
    gradient: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)",
    icon: Music4,
    iconColor: "rgba(255,255,255,0.95)",
    shapes: [
      { type: "ring", x: "50%", y: "50%", size: "50%", opacity: "0.08" },
      { type: "circle", x: "15%", y: "15%", size: "20%", opacity: "0.06", color: "#fff" },
    ],
    pattern: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.05) 0%, transparent 50%)",
  },
};

// Fallback for unknown playlists
const FALLBACK_VISUAL = {
  gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  icon: Music2,
  iconColor: "rgba(255,255,255,0.95)",
  shapes: [
    { type: "circle" as const, x: "50%", y: "50%", size: "40%", opacity: "0.10", color: "#fff" },
  ],
  pattern: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 50%)",
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
        background: vis.gradient,
        aspectRatio: "1/1",
      }}
    >
      {/* Background pattern overlay */}
      <div className="absolute inset-0" style={{ background: vis.pattern }} />

      {/* Noise texture overlay for depth */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      {/* Decorative shapes */}
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
            borderRadius: shape.type === "blob" ? "60% 40% 30% 70% / 60% 30% 70% 40%" : shape.type === "ring" ? "50%" : "50%",
            background: shape.type === "ring"
              ? "transparent"
              : (shape.color || "rgba(255,255,255,0.8)"),
            border: shape.type === "ring" ? "2px solid rgba(255,255,255,0.3)" : "none",
            transform: shape.type === "blob" ? "rotate(-15deg)" : "none",
          }}
        />
      ))}

      {/* Center icon with soft glow */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          width: "40%",
          height: "40%",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
      >
        <Icon className="w-1/2 h-1/2" style={{ color: vis.iconColor }} strokeWidth={1.8} />
      </div>
    </div>
  );
}
