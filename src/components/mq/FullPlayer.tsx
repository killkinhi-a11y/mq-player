"use client";

/*
 * FullPlayer — v8 dispatcher (Full Player Themes).
 *
 *   FullPlayer
 *    ├── ClassicFullPlayer      (existing FullTrackView, desktop)
 *    ├── ClassicFullPlayerMobile(existing FullTrackViewMobile, mobile)
 *    └── SpatialFullPlayer      (reference depth-carousel mode, DESKTOP ONLY)
 *
 * v10.1 ROUTING: MOBILE ALWAYS RENDERS THE CLASSIC MOBILE PLAYER
 * (FullTrackViewMobile — the restored pre-Spatial visual). The Spatial
 * (reference) player is a desktop-only experience: no carousel, no rail,
 * no desktop composition shrunken onto a phone. The «Вид полного плеера»
 * setting still applies — but only on desktop; on mobile both values
 * render the same familiar restored player, and the Left/Right rail
 * setting intentionally has no mobile effect.
 *
 * The mode comes from the persisted store preference
 * (Settings → Оформление → «Вид полного плеера», default "classic" so
 * existing users see no change). Switching the setting while the player
 * is open swaps the tree live — safe because ALL playback state lives in
 * the store + audio engine, never in these components: track, position,
 * queue, volume, EQ, lyrics state all survive the swap.
 */

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useIsMobile } from "@/hooks/use-mobile";

const ClassicFullPlayer = dynamic(() => import("./FullTrackView"), { ssr: false });
const ClassicFullPlayerMobile = dynamic(() => import("./FullTrackViewMobile"), { ssr: false });
const SpatialFullPlayer = dynamic(() => import("./fullplayer/SpatialFullPlayer"), { ssr: false });

export default function FullPlayer() {
  const mode = useAppStore((s) => s.fullPlayerMode);
  const isMobile = useIsMobile();

  // v10.1: mobile = the restored classic player in BOTH modes.
  if (isMobile) {
    return (
      <Suspense fallback={null}>
        <ClassicFullPlayerMobile />
      </Suspense>
    );
  }
  if (mode === "spatial") {
    return (
      <Suspense fallback={null}>
        <SpatialFullPlayer />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <ClassicFullPlayer />
    </Suspense>
  );
}
