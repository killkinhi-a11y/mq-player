"use client";

// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.
import { Music, Play } from "lucide-react";
import type { Track } from "@/lib/musicApi";

// ═════════════════════════════════════════════════════════════════════════
// DISCOVERY FEATURED CARD (V2 §1.2) — the anchor of Search Home.
// The ONE dominant discovery item (last played / catalog pick): a solid
// featured card (CONTENT CARD = SOLID, same family as the Top Result —
// one design language before and after the query). Compact on mobile
// (horizontal), vertical on desktop.
// ═════════════════════════════════════════════════════════════════════════

export function DiscoveryFeaturedCard({
  track,
  eyebrow,
  onPlay,
}: {
  track: Track;
  eyebrow: string;
  onPlay: () => void;
}) {
  return (
    <div className="mq-card-feature group" data-mq-search-featured>
      {/* Desktop (lg+): vertical composition — eyebrow, art, title, meta, play */}
      <div className="hidden lg:block">
        <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--mq-text-muted)" }}>
          {eyebrow}
        </p>
        <div
          className="mq-art mt-3 w-full aspect-square"
          style={{ borderRadius: "var(--mq-r-card)", backgroundColor: "var(--mq-surface-2)" }}
          aria-hidden="true"
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <Music className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
            </span>
          )}
        </div>
        <h3
          className="mq-t-display text-[19px] leading-tight mt-3 break-words"
          style={{ color: "var(--mq-text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {track.title}
        </h3>
        <p className="mq-t-meta mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onPlay}
            className="mq-platinum-btn flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-semibold"
            aria-label={`Слушать ${track.title}`}
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            Слушать
          </button>
        </div>
      </div>

      {/* Mobile (<lg): compact horizontal composition — art 96px + text + play */}
      <div className="lg:hidden flex items-center gap-3.5">
        <div
          className="mq-art flex-shrink-0"
          style={{ width: 96, height: 96, borderRadius: "var(--mq-r-card)", backgroundColor: "var(--mq-surface-2)" }}
          aria-hidden="true"
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <Music className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--mq-text-muted)" }}>
            {eyebrow}
          </p>
          <h3 className="mq-t-display text-[17px] leading-tight mt-1 break-words" style={{ color: "var(--mq-text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {track.title}
          </h3>
          <p className="mq-t-meta mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
        </div>
        <button
          onClick={onPlay}
          className="mq-platinum-btn w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ padding: 0 }}
          aria-label={`Слушать ${track.title}`}
        >
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
