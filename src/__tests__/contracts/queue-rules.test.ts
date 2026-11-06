import { describe, expect, it } from "vitest";
import fixtures from "../../../shared/test-fixtures/queue.cases.json";
import * as Q from "@/lib/core/queue";

type Args = Record<string, unknown>;
interface Case { id: string; description: string; fn: string; input: Args; expected: unknown }

const brokenIdx = (a: Args) => { const s = new Set(a.broken as number[]); return (i: number) => s.has(i); };

const run: Record<string, (a: Args) => unknown> = {
  nextIndex: (a) => Q.nextIndex(a.length as number, a.index as number, a.repeat as Q.RepeatMode, brokenIdx(a)),
  autoAdvanceIndex: (a) => Q.autoAdvanceIndex(a.length as number, a.index as number, a.repeat as Q.RepeatMode, brokenIdx(a)),
  previousAction: (a) => Q.previousAction(a.length as number, a.index as number, a.repeat as Q.RepeatMode, a.progressSec as number),
  playNextInsertIndex: (a) => Q.playNextInsertIndex(a.currentIndex as number, a.pending as number),
  pendingAfterTransition: (a) => Q.pendingAfterTransition(a.pending as number, a.oldIndex as number, a.newIndex as number),
  consumeUpNext: (a) => {
    const broken = new Set(a.broken as string[]);
    return Q.consumeUpNext(a.queue as string[], a.index as number, a.upNext as string[], (t) => broken.has(t));
  },
  indexAfterMove: (a) => Q.indexAfterMove(a.from as number, a.to as number, a.current as number),
  indexAfterRemove: (a) => Q.indexAfterRemove(a.removed as number, a.current as number, a.length as number),
  persistWindow: (a) => Q.persistWindow(a.queue as string[], a.index as number, a.max as number),
  restoreIndex: (a) => Q.restoreIndex(a.ids as string[], a.index as number, a.currentId as string | null),
  repeatToMedia3: (a) => Q.repeatToMedia3(a.mode as Q.RepeatMode),
  repeatFromMedia3: (a) => Q.repeatFromMedia3(a.mode as number),
};

describe("shared queue rules (web)", () => {
  const cases = fixtures.cases as Case[];
  it("every fixture function is implemented", () => {
    for (const c of cases) expect(run[c.fn], c.fn).toBeTypeOf("function");
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });
  for (const c of cases) {
    it(`${c.id}: ${c.description}`, () => {
      expect(run[c.fn](c.input)).toEqual(c.expected);
    });
  }
});
