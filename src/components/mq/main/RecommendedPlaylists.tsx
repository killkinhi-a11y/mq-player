"use client";

// Extracted from MainView.tsx (Stage III decomposition) — moved verbatim.
import { ArrowUpRight, Compass, Flame, ListMusic, Music, Pause, Play, Sparkles, TrendingUp } from "lucide-react";
import { HScroll } from "./TrackRows";
import { NowPlayingEqualizer } from "../NowPlayingEqualizer";
import ScrollReveal from "../ScrollReveal";
import type { Track } from "@/lib/musicApi";
import { TrackMoreButton } from "../ui/TrackMoreButton";
import { motion } from "framer-motion";
import { pluralRu } from "./homeUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

// ═════════════════════════════════════════════════════════════════════════
// QUICK STAT
// ═════════════════════════════════════════════════════════════════════════

export // ═════════════════════════════════════════════════════════════════════════
// TRACK CARD — universal card for tracks (recommendations, recently, trending preview)
// ═════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════
// RECOMMENDED PLAYLISTS (EDITORIAL) — the reference composition driven by   ═
// the reference's own interaction. Data comes from the app's REAL
// recommendation sources only (public taste-based picks + the curated
// feed Home already receives) — never from the user's library, never
// static. The reference pin is a VIDEO: its choreography is an accordion —
// activating a narrow strip EXPANDS it to the featured width while the
// previous featured card collapses back to a strip, neighbours reflow
// smoothly, the row width never changes, and the expanded card reveals
// its description while the vertical title persists.
// ═════════════════════════════════════════════════════════════════════════

type RecPlItem = {
  id: string;
  name: string;
  subtitle: string;
  covers: string[];
  tracks: Track[];
};

export function recommendedCoverSources(head: (string | null | undefined)[], tracks: Track[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...head, ...tracks.map((t) => t?.cover)]) {
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    if (out.length >= 4) break;
  }
  return out;
}

export function RecommendedPlaylistsEditorial({
  items,
  currentTrackId,
  isPlaying,
  animationsEnabled,
  onPlay,
  onOpen,
  onMore,
}: {
  items: RecPlItem[];
  currentTrackId?: string;
  isPlaying: boolean;
  animationsEnabled: boolean;
  onPlay: (it: RecPlItem) => void;
  onOpen: (it: RecPlItem) => void;
  onMore: (it: RecPlItem, e: React.MouseEvent) => void;
}) {
  const isMobile = useIsMobile();
  // Accordion state: which recommended playlist is expanded. null = the
  // resting featured slot (the top recommendation) — the reference pin's
  // static state.
  const [activeId, setActiveId] = useState<string | null>(null);
  const featured = items.find((it) => it.id === activeId) ?? items[0];
  const isPlayingIt = (it: RecPlItem) =>
    !!currentTrackId && isPlaying && it.tracks.some((t) => t.id === currentTrackId);

  // Headline subtext — REAL aggregate, honest recommendation framing.
  const sub = `${items.length} ${pluralRu(items.length, "подборка", "подборки", "подборок")} · подобрано по вашему вкусу`;

  const headlineBlock = (
    <div className={isMobile ? "text-center pt-1 pb-5" : "absolute text-center"}
      style={isMobile ? undefined : { top: "15.6%", left: "50%", transform: "translateX(-50%)", width: "min(66%, 620px)" }}
    >
      {/* Reference scale: headline ≈ 2.6% of canvas width, subtext ≈ 1% —
          with a minimal readability uplift on the subtext only. */}
      <h2
        className="mq-text-headline font-bold tracking-tight"
        style={{ color: "var(--mq-text)", fontSize: isMobile ? 22 : "clamp(22px, 2vw, 28px)" }}
      >
        Рекомендованные плейлисты
      </h2>
      <p className={isMobile ? "mt-1.5 text-[11px]" : "mt-2.5 text-[11.5px]"}
        style={{ color: "color-mix(in srgb, var(--mq-text) 62%, transparent)", lineHeight: 1.6 }}
      >
        {sub}
      </p>
    </div>
  );

  if (isMobile) {
    // Mobile translation of the reference composition: the featured card
    // takes the top slot, the remaining picks stay narrow vertical strips
    // on one shared card line below. Tapping a strip EXPANDS it into the
    // featured slot (framer layoutId morph — the card visibly grows from
    // its strip position), the previous featured card collapses back into
    // the strip row. Tapping the ALREADY-expanded featured card opens the
    // playlist's full page (the strip tap already covers "expand"; the
    // always-visible 36px play circle and the «Слушать» CTA keep playback
    // one tap away). Same interaction, touch ergonomics.
    const strips = items.filter((it) => it.id !== featured.id).slice(0, 7);
    return (
      <section aria-label="Рекомендованные плейлисты" className="relative" style={{ overflowX: "clip" }}>
        {/* Headline — centered (reference) */}
        {headlineBlock}
        {/* Featured — the reference's expanded card, aspect 0.9 */}
        <RecommendedCard
          key={featured.id}
          item={featured}
          active
          layoutId={"recpl-" + featured.id}
          isPlayingThis={isPlayingIt(featured)}
          onClickCard={() => onOpen(featured)}
          onPlay={() => onPlay(featured)}
          onMore={(e) => onMore(featured, e)}
          animationsEnabled={animationsEnabled}
          className="w-full"
          style={{ width: "100%", aspectRatio: "0.9" }}
        />
        {/* Strips — same height as the featured card (one shared card
            line, as in the reference), scrolling horizontally */}
        {strips.length > 0 && (
          <HScroll className="mt-3.5 flex gap-3 overflow-x-auto scrollbar-none -mx-3.5 px-3.5">
            {strips.map((it) => (
              <RecommendedCard
                key={it.id}
                item={it}
                active={false}
                layoutId={"recpl-" + it.id}
                isPlayingThis={isPlayingIt(it)}
                onClickCard={() => setActiveId(it.id)}
                onPlay={() => onPlay(it)}
                onMore={(e) => onMore(it, e)}
                animationsEnabled={animationsEnabled}
                className="shrink-0"
                style={{ width: "23.04%", aspectRatio: "0.2074" }}
              />
            ))}
          </HScroll>
        )}
      </section>
    );
  }

  // Desktop: the breakout <section> sits OUTSIDE ScrollReveal — the reveal
  // wrapper clips (overflow:hidden + contain:paint) and would cut the
  // negative-margin breakout back to the 640px column.
  const row = items.slice(0, 7);
  const activeIdx = Math.max(0, row.findIndex((it) => it.id === featured.id));
  // Reference rhythm (measured off the pin): expanded card 37.3% of the
  // row, strips 8.6%, gaps 1.2% — with the slightly wider 2.2% breath
  // after the expanded card. In the resting state this reproduces the
  // static pin exactly; when another card is activated the SAME track
  // list simply re-maps (hero/strip values swap places), so
  // grid-template-columns interpolates and the row reflows as one
  // accordion — the reference video's choreography.
  const parts: string[] = [];
  row.forEach((it, i) => {
    if (i > 0) parts.push(i - 1 === activeIdx ? "2.2%" : "1.2%");
    parts.push(it.id === featured.id ? "37.3%" : "8.6%");
  });
  const template = parts.join(" ");
  return (
    <section
      aria-label="Рекомендованные плейлисты"
      className="relative"
      style={{
        // Break out of the 640px home column up to the main area's width
        // (viewport minus sidebar; −8px/side safety for the scrollbar),
        // clamped so it never exceeds what actually fits → overflowX = 0.
        marginInline: "calc(-1 * min(420px, max(0px, (100vw - var(--mq-sidebar-w, 248px) - 640px) / 2 - 8px)))",
        overflowX: "clip",
      }}
    >
      <ScrollReveal direction="up" delay={0.05}>
        {/* Canvas — aspect-locked to the reference composition (headline +
            card row; the pin's bottom artwork band is NOT part of this
            design), capped to stay within one comfortable look */}
        <div
          className="relative mx-auto"
          style={{ width: "min(100%, calc(76vh * 1.85), 1280px)", aspectRatio: "1702 / 920" }}
        >
          {/* Headline — centered block (reference y 11.8% of 1219 → 15.6%
              of the band-less canvas) */}
          {headlineBlock}

          {/* Card row — x 13.1→86.5%, y 29.9→72.6% of the reference
              (rebased to the shorter canvas). Hovering/focusing a strip
              expands it; leaving the row collapses back to the resting
              featured state. Clicking a card (or Enter/Space on focus)
              opens that playlist's FULL page — the existing
              public-playlist view; playback stays on the «Слушать» CTA
              and the actions menu. Heights are fixed → zero reflow/CLS. */}
          <div className="absolute" style={{ left: "13.1%", right: "13.5%", top: "39.6%", height: "56.5%" }}>
            <div
              className="grid h-full"
              style={{
                gridTemplateColumns: template,
                transition: animationsEnabled ? "grid-template-columns 500ms cubic-bezier(0.25, 1, 0.3, 1)" : undefined,
              }}
              onMouseLeave={() => setActiveId(null)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActiveId(null);
              }}
            >
              {row.flatMap((it, i) => [
                // Gap spacer — occupies the template's dedicated gap track
                ...(i > 0 ? [<div key={"g" + it.id} aria-hidden="true" />] : []),
                <RecommendedCard
                  key={it.id}
                  item={it}
                  active={it.id === featured.id}
                  isPlayingThis={isPlayingIt(it)}
                  onClickCard={() => onOpen(it)}
                  onMouseEnter={() => setActiveId(it.id)}
                  onFocus={() => setActiveId(it.id)}
                  onPlay={() => onPlay(it)}
                  onMore={(e) => onMore(it, e)}
                  animationsEnabled={animationsEnabled}
                  className="h-full"
                />,
              ])}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

export function recDurationLabel(tracks: Track[]): string {
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

export function RecommendedCard({
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
      className={`group relative overflow-hidden text-left cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--mq-text)_55%,transparent)] transition-[border-radius] duration-500 ${className}`}
      style={{
        borderRadius: active ? 14 : 8,
        border: `1px solid ${isPlayingThis ? "color-mix(in srgb, var(--mq-platinum-hi) 35%, transparent)" : "var(--mq-border-hairline)"}`,
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
        className="absolute inset-0 transition-opacity duration-150"
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
            CLAMPED at 13px: at rest it tracks the strip's width via cqw,
            but during the accordion animation (when this card is the one
            expanding) the width — and with it the raw cqw — grows 4×;
            the clamp freezes the visual mass so the fading strip title
            never reads as stretching. 9px readability floor. */}
        <p
          title={item.name}
          className="absolute left-1/2 -translate-x-1/2 font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis [writing-mode:vertical-rl] rotate-180"
          style={{ top: "6.5%", height: "52%", fontSize: "clamp(9px, 14.8cqw, 13px)", color: "color-mix(in srgb, var(--mq-text) 88%, transparent)" }}
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
        {/* Desktop note: no hover play circle here — hovering a strip
            EXPANDS it (reference interaction); the play affordance is the
            expanded card's «Слушать» CTA + the actions menu, while a card
            CLICK opens the playlist's full page. */}
        {/* Mobile: always-visible play circle, 36px (touch parity) */}
        {item.tracks.length > 0 && (
          <button
            type="button"
            tabIndex={active ? -1 : 0}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            aria-label={`Играть — ${item.name}`}
            className="md:hidden absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform z-10"
            style={{ top: "74%", backgroundColor: "var(--mq-platinum-lift)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}
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
        className="absolute inset-0 transition-opacity duration-200"
        style={{ opacity: active ? 1 : 0, transitionDelay: active ? "200ms" : "0ms", pointerEvents: active ? undefined : "none" }}
      >
        {/* Vertical title — at the left edge, reading bottom-up (reference).
            Reference: 16px on a 466px card = 3.43% of its width (locked
            via cqw, capped at 12px, floored at 9px so the collapsing
            animation never crushes it to an unreadable size). Inset ≈ 9%. */}
        <p
          title={item.name}
          className="absolute font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis [writing-mode:vertical-rl] rotate-180"
          style={{ left: "9%", top: "7%", height: "40%", fontSize: "clamp(9px, 3.83cqw, 12px)", color: "var(--mq-text)" }}
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
              className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold transition-transform active:scale-95 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--mq-text)_55%,transparent)]"
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

// ═════════════════════════════════════════════════════════════════════════
// REC HERO — featured track at the top of the "Для вас" section
// Uses the currently-playing track (if it's in recs) or the first track of
// the first category. Mirrors Spotify's "Featured" / Apple Music's hero card
// pattern with a blurred cover backdrop.
// ═════════════════════════════════════════════════════════════════════════

export // ═════════════════════════════════════════════════════════════════════════
// REC STRIP — horizontal scroll of track cards for one category
// Replaces the old Hero+Tabs+List design with a simpler Spotify-home layout
// ═════════════════════════════════════════════════════════════════════════

// ─── RecCard — visual card (cover + title + artist) ───────────────────────

// ═════════════════════════════════════════════════════════════════════════
// RECS — Reasoning helper
// ═════════════════════════════════════════════════════════════════════════

function reasonForRec(categoryId: string): string {
  switch (categoryId) {
    case "spotify_top": return "Топ-чарт Spotify";
    case "apple_top": return "Топ-чарт страны";
    case "trending_now": return "Популярно сейчас";
    case "fallback": return "Подобрано для вас";
    default: return "Похоже на ваше";
  }
}

// Icon per category id — used in RecsTabs tab chips
export function iconForRec(categoryId: string): React.ElementType {
  switch (categoryId) {
    case "spotify_top": return Music;
    case "apple_top": return Flame;
    case "trending_now": return TrendingUp;
    case "for_you":
    case "fallback": return Sparkles;
    case "discover": return Compass;
    default: return Sparkles;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RECS SKELETON — loading state
// ═════════════════════════════════════════════════════════════════════════

export function RecsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton */}
      <div
        className="relative rounded-3xl overflow-hidden p-5 flex items-center gap-4"
        style={{ backgroundColor: "var(--mq-card)" }}
      >
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl mq-shimmer flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded mq-shimmer" />
          <div className="h-5 w-3/4 rounded mq-shimmer" />
          <div className="h-3 w-1/2 rounded mq-shimmer" />
          <div className="h-5 w-32 rounded-full mq-shimmer mt-2" />
        </div>
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-lg mq-shimmer" />
        ))}
      </div>
      {/* List skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <div className="w-6 h-3 rounded mq-shimmer" />
            <div className="w-11 h-11 rounded-lg mq-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded mq-shimmer" />
              <div className="h-2.5 w-1/3 rounded mq-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS EMPTY STATE — when recommendations failed or returned nothing
// ═════════════════════════════════════════════════════════════════════════

export function RecsEmptyState({ onRetry, errorType }: { onRetry: () => void; errorType?: "offline" | "api" | "empty" | null }) {
  const messages = {
    offline: {
      title: "Нет интернета",
      desc: "Проверьте подключение к сети",
    },
    api: {
      title: "Сервис недоступен",
      desc: "Попробуйте через минуту",
    },
    empty: {
      // UX Core #1 (Эвристика доступности): без императива "послушайте и
      // поставьте лайки" (долг). Позитивная формулировка снижает барьер.
      title: "Пока пусто",
      desc: "Запустите WAVE или лайкните трек — и здесь появятся похожие",
    },
  };
  const msg = messages[errorType || "empty"] || messages.empty;
  return (
    <div
      className="text-center py-10 rounded-2xl"
      style={{ backgroundColor: "var(--mq-card)" }}
    >
      <Sparkles
        className="w-9 h-9 mx-auto mb-3"
        style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
      />
      <p
        className="text-sm font-medium mb-1"
        style={{ color: "var(--mq-text)" }}
      >
        {msg.title}
      </p>
      <p
        className="text-xs mb-4 px-4"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {msg.desc}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
        /* FINAL CORRECTION §7: retry is a utility action — quiet tonal
            treatment, not a red alarm button. */
        style={{
          backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, var(--mq-bg))",
          color: "var(--mq-text)",
          border: "1px solid var(--mq-mat-2-edge)",
        }}
      >
        Повторить
      </button>
    </div>
  );
}
