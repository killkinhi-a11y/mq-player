// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.

export const SEARCH_HISTORY_KEY = "mq-search-history";

export const MAX_HISTORY = 15;

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSearchHistory(items: string[]) {
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}
