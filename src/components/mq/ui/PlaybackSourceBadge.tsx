"use client";

import { memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ProviderChain, trackAttribution } from "./ProviderBadge";
import type { Track } from "@/lib/musicApi";

/**
 * PlaybackSourceBadge — honest source transparency for compact surfaces
 * (mini player bar, spatial identity block).
 *
 * Free playback mode: ALWAYS the catalog → playback ProviderChain (e.g.
 * «Spotify → SoundCloud» — metadata from the Spotify catalog, audio streamed
 * from SoundCloud / Audius). There is no official SDK mode anymore.
 */
export const PlaybackSourceBadge = memo(function PlaybackSourceBadge({
  variant = "mini",
}: {
  variant?: "mini" | "full";
}) {
  const playbackMode = useAppStore((s) => s.playbackMode);
  const currentTrack = useAppStore((s) => s.currentTrack);

  if (playbackMode === "idle" || !currentTrack) return null;

  const attribution = trackAttribution(currentTrack as Track);
  return (
    <ProviderChain
      catalog={attribution.catalog}
      playback={attribution.playback}
      withLabels={variant === "full"}
    />
  );
});
