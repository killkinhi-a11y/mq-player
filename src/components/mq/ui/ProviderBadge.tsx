"use client";

import { memo } from "react";

/**
 * ProviderBadge — unified provider attribution chip.
 *
 * Surfaces: Search · TrackCard · Queue · Player · Artist · Album · Playlist ·
 * Lyrics · Context menu. Two modes:
 *
 *   <ProviderBadge provider="spotify" />                 → [Spotify]
 *   <ProviderBadge catalog="spotify" playback="soundcloud" /> → Spotify → SoundCloud
 *
 * Catalog ≠ playback and the UI never hides the difference: metadata may come
 * from the Spotify catalog while audio streams from SoundCloud / Audius.
 */

export type ProviderId = "spotify" | "soundcloud" | "audius" | "deezer" | "mq" | "local" | "yandex";

const PROVIDER_META: Record<ProviderId, { label: string; fg: string; bg: string; ring: string }> = {
  spotify: { label: "Spotify", fg: "#1db954", bg: "rgba(29,185,84,0.10)", ring: "rgba(29,185,84,0.35)" },
  soundcloud: { label: "SoundCloud", fg: "#ff7700", bg: "rgba(255,119,0,0.10)", ring: "rgba(255,119,0,0.35)" },
  audius: { label: "Audius", fg: "#cc0fe0", bg: "rgba(204,15,224,0.10)", ring: "rgba(204,15,224,0.35)" },
  deezer: { label: "Deezer", fg: "#a238ff", bg: "rgba(162,56,255,0.10)", ring: "rgba(162,56,255,0.35)" },
  mq: { label: "MQ", fg: "#8b5cf6", bg: "rgba(139,92,246,0.10)", ring: "rgba(139,92,246,0.35)" },
  local: { label: "Локально", fg: "#64748b", bg: "rgba(100,116,139,0.10)", ring: "rgba(100,116,139,0.35)" },
  yandex: { label: "Яндекс", fg: "#ffcc00", bg: "rgba(255,204,0,0.10)", ring: "rgba(255,204,0,0.35)" },
};

/** Map a Track.source to its provider id for badges. */
export function providerFromSource(source?: string, catalogProvider?: string): ProviderId {
  if (catalogProvider === "spotify") return "spotify";
  if (catalogProvider === "deezer") return "deezer";
  switch (source) {
    case "soundcloud": return "soundcloud";
    case "audius": return "audius";
    case "spotify": return "spotify";
    case "local": return "local";
    case "demo": return "mq";
    default: return "mq";
  }
}

interface BadgeProps {
  provider: ProviderId;
  /** Compact single chip (default) — "Spotify". */
  size?: "xs" | "sm";
  title?: string;
}

export const ProviderBadge = memo(function ProviderBadge({ provider, size = "xs", title }: BadgeProps) {
  const meta = PROVIDER_META[provider] || PROVIDER_META.mq;
  return (
    <span
      title={title || meta.label}
      data-mq-provider-badge={provider}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: size === "xs" ? "1px 6px" : "2px 8px",
        borderRadius: "6px",
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.ring}`,
        fontSize: size === "xs" ? "10px" : "11px",
        lineHeight: 1.35,
        fontWeight: 600,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
});

interface ChainProps {
  catalog: ProviderId;
  playback?: ProviderId;
  /** Show explicit "Каталог → Звук" labels (track details context). */
  withLabels?: boolean;
}

/** Catalog → Playback chain: "Spotify → SoundCloud". */
export const ProviderChain = memo(function ProviderChain({ catalog, playback, withLabels }: ChainProps) {
  if (!playback || playback === catalog) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }} data-mq-provider-chain="single">
        {withLabels && (
          <span style={{ fontSize: 11, opacity: 0.65 }}>Источник:</span>
        )}
        <ProviderBadge provider={catalog} />
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }} data-mq-provider-chain="dual">
      {withLabels && <span style={{ fontSize: 11, opacity: 0.65 }}>Каталог:</span>}
      <ProviderBadge provider={catalog} />
      <span style={{ opacity: 0.5, fontSize: 11 }}>→</span>
      {withLabels && <span style={{ fontSize: 11, opacity: 0.65 }}>Звук:</span>}
      <ProviderBadge provider={playback} />
    </span>
  );
});

/** Attribution line for a Track: catalog → playback from its fields. */
export function trackAttribution(track: {
  source?: string;
  catalogProvider?: string;
  playbackProvider?: string;
}): { catalog: ProviderId; playback?: ProviderId } {
  const catalog = providerFromSource(
    track.catalogProvider === "spotify" ? "spotify" : track.source,
    track.catalogProvider,
  );
  let playback: ProviderId | undefined;
  if (track.playbackProvider === "soundcloud" || track.playbackProvider === "audius") {
    playback = track.playbackProvider;
  } else if (!track.catalogProvider && track.source) {
    // Native provider track — single-source attribution.
    playback = providerFromSource(track.source);
  }
  if (playback === catalog) playback = undefined;
  return { catalog, playback };
}

/**
 * SpotifyOfficialBadge — V2 Mode A marker: the Web Playback SDK owns the
 * audio device (full official track, user PKCE + Premium). Distinct from the
 * catalog badges: no bitrate claims (§22 — Spotify does not expose quality
 * to web clients), just the honest playback mode.
 */
export const SpotifyOfficialBadge = memo(function SpotifyOfficialBadge() {
  return (
    <span
      data-mq-provider-badge="spotify-official"
      title="Полное официальное воспроизведение Spotify (Web Playback SDK)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#1db954",
        background: "rgba(29,185,84,0.10)",
        border: "1px solid rgba(29,185,84,0.35)",
        borderRadius: 6,
        padding: "2px 7px",
        lineHeight: 1.4,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1db954" }} aria-hidden />
      Spotify • Official
    </span>
  );
});
