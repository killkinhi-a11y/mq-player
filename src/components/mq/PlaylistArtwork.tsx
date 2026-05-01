"use client";

interface PlaylistArtworkProps {
  playlistId: string;
  size?: number;
  rounded?: string;
  className?: string;
}

// Each playlist = unique arrangement of soft glowing orbs
// Colors shift from accent via CSS hue-rotate — no hardcoded hex
type Orb = { x: string; y: string; size: string; hueRotate: number; brightness: number; saturation: number };

const PLAYLIST_VISUALS: Record<string, {
  bg: string;
  orbs: Orb[];
}> = {
  "for-you": {
    bg: "#1a1a1e",
    orbs: [
      { x: "5%",  y: "10%", size: "60%", hueRotate: 0,   brightness: 1.15, saturation: 1.0 },
      { x: "50%", y: "50%", size: "80%", hueRotate: -25, brightness: 1.0,  saturation: 1.1 },
      { x: "70%", y: "70%", size: "50%", hueRotate: -50, brightness: 0.9,  saturation: 0.9 },
    ],
  },
  discoveries: {
    bg: "#181820",
    orbs: [
      { x: "60%", y: "-10%", size: "70%", hueRotate: 40,  brightness: 1.1, saturation: 1.2 },
      { x: "10%", y: "60%", size: "65%", hueRotate: -15, brightness: 1.0,  saturation: 1.0 },
    ],
  },
  "new-releases": {
    bg: "#1a1c1e",
    orbs: [
      { x: "20%", y: "70%", size: "55%", hueRotate: -35, brightness: 1.1, saturation: 0.9 },
      { x: "70%", y: "15%", size: "50%", hueRotate: 15,  brightness: 1.0, saturation: 1.1 },
      { x: "45%", y: "45%", size: "40%", hueRotate: -60, brightness: 0.85, saturation: 1.0 },
    ],
  },
  "daily-1": {
    bg: "#1c1a1e",
    orbs: [
      { x: "40%", y: "30%", size: "75%", hueRotate: 30,  brightness: 1.1, saturation: 1.0 },
      { x: "-5%", y: "55%", size: "50%", hueRotate: -30, brightness: 1.0, saturation: 1.15 },
    ],
  },
  chill: {
    bg: "#18191e",
    orbs: [
      { x: "50%", y: "40%", size: "85%", hueRotate: 50,  brightness: 0.95, saturation: 0.8 },
      { x: "10%", y: "80%", size: "45%", hueRotate: 20,  brightness: 1.1,  saturation: 0.9 },
    ],
  },
  energy: {
    bg: "#1e1a1a",
    orbs: [
      { x: "25%", y: "25%", size: "50%", hueRotate: -10, brightness: 1.2,  saturation: 1.3 },
      { x: "65%", y: "55%", size: "60%", hueRotate: -40, brightness: 1.0,  saturation: 1.1 },
      { x: "50%", y: "90%", size: "40%", hueRotate: 20,  brightness: 0.9,  saturation: 1.0 },
    ],
  },
  "hip-hop": {
    bg: "#1c1a1a",
    orbs: [
      { x: "60%", y: "20%", size: "55%", hueRotate: 35,  brightness: 1.15, saturation: 1.2 },
      { x: "15%", y: "65%", size: "65%", hueRotate: -20, brightness: 1.0,  saturation: 1.0 },
    ],
  },
  electronic: {
    bg: "#1a1a1e",
    orbs: [
      { x: "30%", y: "50%", size: "70%", hueRotate: -45, brightness: 1.1,  saturation: 1.15 },
      { x: "70%", y: "30%", size: "55%", hueRotate: 25,  brightness: 1.0,  saturation: 1.0 },
      { x: "10%", y: "10%", size: "35%", hueRotate: -70, brightness: 0.85, saturation: 0.9 },
    ],
  },
  "rnb-soul": {
    bg: "#1c1a1e",
    orbs: [
      { x: "45%", y: "35%", size: "70%", hueRotate: -20, brightness: 1.1,  saturation: 0.9 },
      { x: "75%", y: "75%", size: "45%", hueRotate: 30,  brightness: 0.95, saturation: 1.1 },
    ],
  },
  rock: {
    bg: "#1e1a18",
    orbs: [
      { x: "20%", y: "80%", size: "60%", hueRotate: 20,  brightness: 1.15, saturation: 1.2 },
      { x: "70%", y: "20%", size: "50%", hueRotate: -25, brightness: 1.0,  saturation: 1.0 },
      { x: "50%", y: "50%", size: "35%", hueRotate: 50,  brightness: 0.8,  saturation: 0.8 },
    ],
  },
  jazz: {
    bg: "#1a1c1e",
    orbs: [
      { x: "55%", y: "45%", size: "65%", hueRotate: 45,  brightness: 1.0,  saturation: 0.85 },
      { x: "10%", y: "20%", size: "50%", hueRotate: -15, brightness: 1.1,  saturation: 1.0 },
    ],
  },
  classical: {
    bg: "#1e1e1e",
    orbs: [
      { x: "40%", y: "50%", size: "60%", hueRotate: 60,  brightness: 0.9,  saturation: 0.7 },
      { x: "65%", y: "25%", size: "45%", hueRotate: 30,  brightness: 1.05, saturation: 0.8 },
      { x: "15%", y: "75%", size: "40%", hueRotate: -30, brightness: 0.85, saturation: 0.75 },
    ],
  },
};

const FALLBACK = {
  bg: "#1a1a1e",
  orbs: [
    { x: "40%", y: "40%", size: "70%", hueRotate: 0, brightness: 1.1, saturation: 1.0 },
    { x: "70%", y: "70%", size: "50%", hueRotate: -30, brightness: 1.0, saturation: 0.9 },
  ],
};

export default function PlaylistArtwork({ playlistId, size, rounded = "rounded-2xl", className = "" }: PlaylistArtworkProps) {
  const vis = PLAYLIST_VISUALS[playlistId] || FALLBACK;

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{
        width: size || "100%",
        height: size || "100%",
        aspectRatio: "1/1",
        background: vis.bg,
      }}
    >
      {vis.orbs.map((orb, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: "var(--mq-accent)",
            filter: `blur(28px) hue-rotate(${orb.hueRotate}deg) brightness(${orb.brightness}) saturate(${orb.saturation})`,
            opacity: 0.85,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {/* Subtle inner light — white core on each orb position */}
      {vis.orbs.map((orb, i) => (
        <div
          key={`c-${i}`}
          className="absolute"
          style={{
            left: orb.x,
            top: orb.y,
            width: `calc(${orb.size} * 0.35)`,
            height: `calc(${orb.size} * 0.35)`,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            filter: "blur(12px)",
            opacity: 0.7,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}
