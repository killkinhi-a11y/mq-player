"use client";

// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.
import { ChevronRight, Clock, ListMusic, Play, Radio, Search, User } from "lucide-react";
import type { SuggestionItem } from "@/lib/search-suggestions";

// ═════════════════════════════════════════════════════════════════════════
// SEARCH SUGGESTIONS — autocomplete-style dropdown (W02, real data)
//
// The list is computed by the PARENT from real user state (search history,
// listening history, favorite artists, playlists, genres) — this component
// only RENDERS it. Rows are grouped visually by kind, keyboard-active row
// is highlighted (aria-activedescendant), mouse hover syncs the keyboard
// cursor. No invented "popular" entries, no fake numbers.
// ═════════════════════════════════════════════════════════════════════════

export const SUGGESTION_ICONS: Record<SuggestionItem["icon"], React.ReactNode> = {
  search: <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  track: <Play className="w-3.5 h-3.5 flex-shrink-0 ml-0.5" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />,
  artist: <User className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  playlist: <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  genre: <Radio className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
};

export const SUGGESTION_GROUP_LABEL: Partial<Record<SuggestionItem["kind"], string>> = {
  search: "Недавние запросы",
  track: "Треки",
  artist: "Артисты",
  playlist: "Плейлисты",
  genre: "Жанры",
};

export function SearchSuggestions({
  query,
  items,
  activeIndex,
  onHover,
  onSelect,
}: {
  query: string;
  items: SuggestionItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SuggestionItem) => void;
}) {
  // Group-boundary flags computed immutably BEFORE the render loop (the
  // react-compiler rule forbids reassigning a let across map iterations).
  const showGroupFlags = items.map(
    (item, i) => i === 0 || items[i - 1].kind !== item.kind
  );
  return (
    <div
      className="mt-1 rounded-[var(--mq-r-card)] overflow-hidden"
      style={{
        backgroundColor: "var(--mq-surface-1)",
        border: "1px solid var(--mq-edge-strong)",
        boxShadow: "var(--mq-elev-dialog)",
      }}
    >
      {/* Direct search for the current query — always first when typing */}
      {query && (
        <button
          id="mq-suggest-direct"
          role="option"
          aria-selected={activeIndex === -1}
          onMouseEnter={() => onHover(-1)}
          onClick={() => onSelect({ kind: "search", label: query, icon: "search" })}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--mq-text)" }}>
            {/* FINAL §19: the query is emphasis — weight, not red */}
            Искать <span className="font-semibold">«{query}»</span>
          </span>
          <kbd className="ml-auto mq-t-meta-2 px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--mq-border-thin)", color: "var(--mq-text-muted)" }}>Enter</kbd>
        </button>
      )}

      {/* Real suggestion rows grouped by kind */}
      <div role="listbox" aria-label="Поисковые подсказки">
        {items.map((item, i) => {
          const showGroup = showGroupFlags[i];
          const isActive = i === activeIndex;
          return (
            <div key={item.kind + ":" + item.label}>
              {showGroup && (
                <p
                  className="px-4 pt-2 pb-1 mq-t-meta-2 font-semibold uppercase tracking-wider border-t"
                  style={{ color: "var(--mq-text-muted)", borderColor: "var(--mq-border-hairline)" }}
                >
                  {SUGGESTION_GROUP_LABEL[item.kind]}
                </p>
              )}
              <button
                id={`mq-suggest-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                style={isActive ? { backgroundColor: "var(--mq-overlay-hover)" } : undefined}
              >
                {item.cover ? (
                  <img src={item.cover} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)" }}>
                    {SUGGESTION_ICONS[item.icon]}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate" style={{ color: "var(--mq-text)" }}>{item.label}</span>
                  {item.sub && (
                    <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>{item.sub}</span>
                  )}
                </span>
                {item.kind === "track" && (
                  <span className="mq-t-meta-2 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>Слушать</span>
                )}
                {item.kind === "artist" && (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Empty state — no real matches: honest hint, no fake suggestions */}
      {items.length === 0 && !query && (
        <div className="px-4 py-3">
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Начните вводить запрос — подсказки появятся из вашей истории
          </p>
        </div>
      )}
    </div>
  );
}
