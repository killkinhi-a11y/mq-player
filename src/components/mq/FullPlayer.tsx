"use client";

/*
 * FullPlayer — v8 dispatcher (Full Player Themes).
 *
 *   FullPlayer
 *    ├── ClassicFullPlayer      (existing FullTrackView, desktop)
 *    ├── ClassicFullPlayerMobile(existing FullTrackViewMobile, mobile)
 *    └── SpatialFullPlayer      (new reference depth-carousel mode)
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

  if (mode === "spatial") {
    return (
      <Suspense fallback={null}>
        <SpatialFullPlayer />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      {isMobile ? <ClassicFullPlayerMobile /> : <ClassicFullPlayer />}
    </Suspense>
  );
}
