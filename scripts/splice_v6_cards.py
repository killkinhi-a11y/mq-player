#!/usr/bin/env python3
"""Splice MainView.tsx: replace old band + card components (lines 1980-2576) with RecommendedCard."""
import io

PATH = "/home/z/my-project/src/components/mq/MainView.tsx"

with io.open(PATH, "r", encoding="utf-8") as f:
    lines = f.readlines()

# lines are 0-indexed; replace lines[1979:2576] (file lines 1980..2576)
start, end = 1979, 2576
assert lines[start].startswith("function playlistCoverSources"), lines[start]
assert lines[end - 1].rstrip() == "}", repr(lines[end - 1])
assert "REC HERO" in lines[end + 2], lines[end + 2]

NEW = r'''function recDurationLabel(tracks: Track[]): string {
  const total = tracks.reduce((acc, t) => acc + (t?.duration || 0), 0);
  if (total <= 0) return "";
  const mins = Math.round(total / 60);
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// ─── RECOMMENDED CARD — one card, two reference states. The container's ──
// width is driven from OUTSIDE (desktop: the accordion grid animates
// grid-template-columns; mobile: the framer layoutId morph), so the card
// itself only cross-fades between its two content layers while the
// border-radius eases — exactly the behaviour visible in the reference
// video: the vertical title persists, the expanded card's description
// and CTA fade in just AFTER the width starts growing, the collapsed
// card keeps its centered vertical title + foot icon.

function RecommendedCard({
  item,
  active,
  isPlayingThis,
  onClickCard,
  onMouseEnter,
  onFocus,
  onPlay,
  onMore,
  animationsEnabled,
  layoutId,
  className = "",
  style,
}: {
  item: RecPlItem;
  active: boolean;
  isPlayingThis: boolean;
  onClickCard: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  onPlay: () => void;
  onMore: (e: React.MouseEvent) => void;
  animationsEnabled: boolean;
  layoutId?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const covers = item.covers;
  const duration = recDurationLabel(item.tracks);
  const trackWord = pluralRu(item.tracks.length, "трек", "трека", "треков");
  const meta = `${item.tracks.length} ${trackWord}${duration ? ` · ${duration}` : ""}`;
  return (
    <motion.div
      role="button"
      tabIndex={0}
      layoutId={layoutId}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClickCard(); } }}
      onClick={onClickCard}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      whileTap={{ scale: 0.99 }}
      transition={{ layout: animationsEnabled ? { duration: 0.5, ease: [0.25, 1, 0.3, 1] } : { duration: 0 } }}
      aria-label={`Рекомендованный плейлист: ${item.name}, ${meta}`}
      className={`group relative overflow-hidden text-left cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mq-accent)] transition-[border-radius] duration-500 ${className}`}
      style={{
        borderRadius: active ? 14 : 8,
        border: `1px solid ${isPlayingThis ? "color-mix(in srgb, var(--mq-accent) 45%, transparent)" : "var(--mq-border-hairline)"}`,
        backgroundColor: "color-mix(in srgb, var(--mq-card) 85%, transparent)",
        containerType: "inline-size",
        ...style,
      }}
    >
      {/* Atmosphere — faint downward gradient (reference card surface) */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--mq-text) 5%, transparent), transparent 45%)" }} />

      {/* ── STRIP STATE — the reference's extreme card (≈1:4.8): flat dark
          surface, one centered vertical title near the top, one small
          line-icon at the foot. Covers do NOT tile the card at rest (the
          row reads typographic); the real artwork only whispers in on
          hover. */}
      <div
        aria-hidden={active || undefined}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: active ? 0 : 1, pointerEvents: active ? "none" : undefined }}
      >
        {covers[0] && (
          <div className="absolute inset-x-0 bottom-0 h-[46%] overflow-hidden opacity-25 md:opacity-0 md:group-hover:opacity-40 transition-opacity duration-500">
            <img
              src={covers[0]}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              style={{ filter: "grayscale(0.75) brightness(1.05) blur(6px)", transform: "scale(1.3)" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, var(--mq-card) 0%, transparent 60%)" }} />
          </div>
        )}
        {/* Vertical title — centered, near the top, bottom-up (reference:
            ≈16px on a 108px strip = 14.8% of card width, normal tracking).
            cqw keeps the visual mass tracking the card's width as it
            animates; 9px readability floor. */}
        <p
          title={item.name}
          className="absolute left-1/2 -translate-x-1/2 font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis [writing-mode:vertical-rl] rotate-180"
          style={{ top: "6.5%", height: "52%", fontSize: "max(9px, 14.8cqw)", color: "color-mix(in srgb, var(--mq-text) 88%, transparent)" }}
        >
          {item.name}
        </p>
        {/* Foot — one small line-icon, centered (reference); eq while playing */}
        <div aria-hidden="true" className="absolute bottom-[5.5%] left-1/2 -translate-x-1/2 pointer-events-none">
          {isPlayingThis ? (
            <NowPlayingEqualizer size="xs" variant="overlay" />
          ) : (
            <ListMusic className="w-3.5 h-3.5" style={{ color: "color-mix(in srgb, var(--mq-text) 38%, transparent)" }} />
          )}
        </div>
        {/* Desktop: glass play circle on hover (keyboard-focusable) */}
        {item.tracks.length > 0 && (
          <div
            role="button"
            tabIndex={active ? -1 : 0}
            aria-label={`Играть — ${item.name}`}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onPlay(); } }}
            className="hidden md:flex absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none transition-opacity z-10"
            style={{ top: "74%", backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.16)" }}
          >
            {isPlayingThis
              ? <Pause className="w-4 h-4 text-white" fill="currentColor" />
              : <Play className="w-4 h-4 text-white ml-px" fill="currentColor" />}
          </div>
        )}
        {/* Mobile: always-visible play circle, 36px (touch parity) */}
        {item.tracks.length > 0 && (
          <button
            type="button"
            tabIndex={active ? -1 : 0}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            aria-label={`Играть — ${item.name}`}
            className="md:hidden absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform z-10"
            style={{ top: "74%", backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}
          >
            {isPlayingThis
              ? <Pause className="w-4 h-4 text-white" fill="currentColor" />
              : <Play className="w-4 h-4 text-white ml-px" fill="currentColor" />}
          </button>
        )}
      </div>

      {/* ── EXPANDED STATE — reference Card 1: vertical title at the left
          edge, an EMPTY middle (negative space is part of the design),
          then a short description + circle-icon CTA, and a silver-washed
          preview of the real cover bleeding to the card's bottom edge
          (21% of its height). Fades in just after the width starts
          growing — the reference video's reveal timing. */}
      <div
        aria-hidden={!active || undefined}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: active ? 1 : 0, transitionDelay: active ? "110ms" : "0ms", pointerEvents: active ? undefined : "none" }}
      >
        {/* Vertical title — at the left edge, reading bottom-up (reference).
            Reference: 16px on a 466px card = 3.43% of its width (locked
            via cqw, capped at 12px). Inset ≈ 9% from the left. */}
        <p
          title={item.name}
          className="absolute font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis [writing-mode:vertical-rl] rotate-180"
          style={{ left: "9%", top: "7%", height: "40%", fontSize: "min(12px, 3.83cqw)", color: "var(--mq-text)" }}
        >
          {item.name}
        </p>

        {/* (the card's middle stays deliberately EMPTY — reference) */}

        {/* Bottom stack: description + circle-icon CTA (reference) */}
        <div className="absolute" style={{ left: "7.5%", right: "7.5%", bottom: "calc(21% + 7%)" }}>
          <p className="line-clamp-2 text-[11px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--mq-text) 74%, transparent)" }}>
            {item.subtitle}
          </p>
          <p className="mt-1 text-[10.5px]" style={{ color: "color-mix(in srgb, var(--mq-text) 45%, transparent)" }}>
            {meta}
          </p>
          {item.tracks.length > 0 && (
            <button
              type="button"
              tabIndex={active ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              aria-label={isPlayingThis ? `Пауза — ${item.name}` : `Слушать — ${item.name}`}
              className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold transition-transform active:scale-95 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mq-accent)]"
              style={{ color: "var(--mq-text)" }}
            >
              <span
                className="w-[20px] h-[20px] rounded-full flex items-center justify-center"
                style={{ border: "1px solid color-mix(in srgb, var(--mq-text) 55%, transparent)" }}
              >
                {isPlayingThis
                  ? <Pause className="w-2.5 h-2.5" fill="currentColor" />
                  : <ArrowUpRight className="w-2.5 h-2.5" />}
              </span>
              {isPlayingThis ? "Пауза" : "Слушать"}
            </button>
          )}
        </div>

        {/* Preview band — the real cover, silver-washed, bleeding to the
            card's bottom edge (reference light preview: a genuinely LIGHT
            band on the dark card) */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: "21%" }}>
          {covers[0] && (
            <img
              src={covers[0]}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              style={{ filter: "grayscale(1) brightness(1.05) contrast(1.02)" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--mq-bg) 28%, transparent) 0%, color-mix(in srgb, #ffffff 20%, transparent) 55%, color-mix(in srgb, #ffffff 30%, transparent) 100%)" }} />
        </div>
      </div>

      {/* More — top-right (existing playlist actions) */}
      <div
        className="absolute top-1.5 right-1.5 z-10 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <TrackMoreButton onOpen={onMore} size="sm" label={`Действия: ${item.name}`} className="!text-white" />
      </div>
    </motion.div>
  );
}
'''

lines[start:end] = [NEW]
with io.open(PATH, "w", encoding="utf-8") as f:
    f.writelines(lines)
print("spliced OK; new length:", len(lines))
