"use client";

import { memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ProviderChain, SpotifyOfficialBadge, trackAttribution } from "./ProviderBadge";
import type { Track } from "@/lib/musicApi";

/**
 * PlaybackSourceBadge — honest source transparency (V2 §15) for compact
 * surfaces (mini player bar, spatial identity block).
 *
 * Delegates to the unified provider-badge system:
 *  - playbackMode "spotify" → SpotifyOfficialBadge (Web Playback SDK owns
 *    audio — full official track; no invented bitrate, §22)
 *  - otherwise → ProviderChain (catalog → playback attribution)
 */
export const PlaybackSourceBadge = memo(function PlaybackSourceBadge({
  variant = "mini",
}: {
  variant?: "mini" | "full";
}) {
  const playbackMode = useAppStore((s) => s.playbackMode);
  const currentTrack = useAppStore((s) => s.currentTrack);

  if (playbackMode === "idle" || !currentTrack) return null;

  if (playbackMode === "spotify") {
    return <SpotifyOfficialBadge />;
  }

  const attribution = trackAttribution(currentTrack as Track);
  return (
    <ProviderChain
      catalog={attribution.catalog}
      playback={attribution.playback}
      withLabels={variant === "full"}
    />
  );
});
