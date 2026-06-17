"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Lightweight virtualized list (M4) — renders only items visible in the
 * viewport + a small overscan buffer. No external dependencies.
 *
 * Uses IntersectionObserver on sentinel elements at the top/bottom of the
 * list to detect when the user is near the edges, then expands the visible
 * range. This is NOT true windowing (where scroll position maps to item
 * index) — it's progressive rendering. True windowing requires measuring
 * item heights, which is complex for variable-height rows.
 *
 * Progressive rendering is good enough for the player's use case (200-track
 * history, 500-track favorites) and avoids the complexity of
 * @tanstack/react-virtual or react-window.
 *
 * Usage:
 *   <ProgressiveList
 *     items={tracks}
 *     initialCount={20}
 *     step={20}
 *     renderItem={(track, index) => <TrackRow key={track.id} track={track} />}
 *   />
 */

interface ProgressiveListProps<T> {
  items: T[];
  initialCount?: number;
  step?: number;
  maxVisible?: number;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string | number;
  emptyState?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ProgressiveList<T>({
  items,
  initialCount = 20,
  step = 20,
  maxVisible = 500,
  renderItem,
  keyExtractor,
  emptyState,
  className,
  style,
}: ProgressiveListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset visible count when items array identity changes (e.g. new search)
  useEffect(() => {
    setVisibleCount(initialCount);
  }, [items, initialCount]);

  // Watch the sentinel — when it becomes visible, load more items
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (visibleCount >= Math.min(items.length, maxVisible)) return;

    // Disconnect previous observer if any
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((prev) => Math.min(prev + step, items.length, maxVisible));
          }
        }
      },
      { rootMargin: "200px" }, // start loading 200px before the sentinel enters viewport
    );
    observer.observe(sentinelRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [visibleCount, items.length, step, maxVisible]);

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length && visibleCount < maxVisible;

  return (
    <div className={className} style={style}>
      {visibleItems.map((item, index) => (
        <div key={keyExtractor(item, index)}>{renderItem(item, index)}</div>
      ))}
      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          style={{ height: 1, width: "100%", pointerEvents: "none" }}
        />
      )}
      {hasMore && (
        <div
          style={{
            textAlign: "center",
            padding: "12px",
            color: "var(--mq-text-muted, #888)",
            fontSize: 12,
          }}
          aria-live="polite"
        >
          Загружено {visibleCount} из {items.length}…
        </div>
      )}
    </div>
  );
}
