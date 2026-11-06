import { describe, expect, it } from "vitest";
import fixtures from "../../../shared/test-fixtures/sync-merge.cases.json";
import { mergeHistory, mergeIds, mergeTracks, type SyncHistoryEntry, type SyncTrack } from "@/lib/sync/merge";

type A = Record<string, unknown>;
const run: Record<string, (a: A) => unknown> = {
  mergeIds: (a) => mergeIds(a.server as unknown[], a.local as string[], a.localRemoved as string[]),
  mergeTracks: (a) => mergeTracks(a.local as SyncTrack[], a.server as unknown[], a.localRemoved as string[]),
  mergeHistory: (a) => mergeHistory(a.local as SyncHistoryEntry[], a.server as unknown[], a.max as number),
};

describe("shared sync merge rules (web)", () => {
  for (const c of fixtures.cases as { id: string; description: string; fn: string; input: A; expected: unknown }[]) {
    it(`${c.id}: ${c.description}`, () => {
      expect(run[c.fn], c.fn).toBeTypeOf("function");
      expect(run[c.fn](c.input)).toEqual(c.expected);
    });
  }
});
