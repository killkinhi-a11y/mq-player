"use client";

import { useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   ArtworkImage — v10.1 artwork decode skeleton (§12).

   Shimmer under the cover until it decodes, then a 200ms fade-in.
   The component is KEYED BY TRACK ID by its callers (or lives inside a
   keyed wrapper) — remount resets the state, so no reset effects are
   needed (React-compiler-clean). Cached covers fire onLoad on the first
   frames — no artificial delay, no skeleton flash. onError also commits
   the fade so a broken URL degrades to the plain empty box (baseline
   behaviour) instead of an eternal shimmer.

   Reduced motion: the fade transition is disabled via the .mq-art-fade
   CSS guard; the shimmer itself goes static (§14 global guard).
   ══════════════════════════════════════════════════════════════════════════ */

export function ArtworkImage({
  src,
  alt = "",
  className = "w-full h-full object-cover",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 mq-shimmer" aria-hidden="true" data-mq-skeleton="artwork" />
      )}
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="eager"
        className={`${className} mq-art-fade`}
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
}

export default ArtworkImage;
