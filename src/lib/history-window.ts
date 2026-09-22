/**
 * History incremental-render windowing (W03) — pure, testable.
 *
 * The History view renders a WINDOW over the full filtered list: the first
 * `visibleCount` entries are shown, more append on demand. Group headers
 * are computed over the FULL list by the caller; this helper only slices
 * each group's rendered rows so the cumulative total equals visibleCount.
 */

export interface WindowedGroup<T> {
  items: T[];
  [key: string]: unknown;
}

export function windowGroups<G extends { items: unknown[] }>(
  groups: G[],
  visibleCount: number
): G[] {
  let remaining = Math.max(0, visibleCount);
  return groups
    .map((g) => {
      const items = remaining <= 0 ? [] : g.items.slice(0, remaining);
      remaining -= items.length;
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
}

/** Page size used by the History view (client-side pagination). */
export const HISTORY_PAGE_SIZE = 50;
