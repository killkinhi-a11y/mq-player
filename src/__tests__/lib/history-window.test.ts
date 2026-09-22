/**
 * History incremental-render windowing (W03) — pure math tests.
 */
import { describe, it, expect } from "vitest";
import { windowGroups, HISTORY_PAGE_SIZE } from "@/lib/history-window";

const g = (label: string, n: number) => ({
  label,
  items: Array.from({ length: n }, (_, i) => `${label}-${i}`),
});

describe("windowGroups", () => {
  it("keeps everything when visibleCount covers the whole list", () => {
    const groups = [g("Сегодня", 3), g("Вчера", 4)];
    const out = windowGroups(groups, 10);
    expect(out.map((x) => x.items.length)).toEqual([3, 4]);
  });

  it("slices across group boundaries: first group full, second partial", () => {
    const groups = [g("Сегодня", 30), g("Вчера", 30)];
    const out = windowGroups(groups, 50);
    expect(out[0].items.length).toBe(30);
    expect(out[1].items.length).toBe(20);
  });

  it("drops groups outside the window (no empty groups rendered)", () => {
    const groups = [g("Сегодня", 50), g("Вчера", 30), g("Раньше", 40)];
    const out = windowGroups(groups, 60);
    expect(out.map((x) => x.label)).toEqual(["Сегодня", "Вчера"]);
    expect(out[1].items.length).toBe(10);
  });

  it("renders exactly visibleCount rows when data is larger", () => {
    const groups = [g("Сегодня", 80), g("Раньше", 120)];
    const out = windowGroups(groups, HISTORY_PAGE_SIZE);
    const total = out.reduce((sum, x) => sum + x.items.length, 0);
    expect(total).toBe(HISTORY_PAGE_SIZE);
  });

  it("does not mutate the input groups", () => {
    const groups = [g("Сегодня", 10)];
    windowGroups(groups, 3);
    expect(groups[0].items.length).toBe(10);
  });

  it("visibleCount 0 → nothing rendered", () => {
    const out = windowGroups([g("Сегодня", 5)], 0);
    expect(out).toEqual([]);
  });
});
