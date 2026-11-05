/**
 * Task D: the 7 import cycles (6 in lib/wave, 1 in lib/playback) were broken by
 * moving shared types. These checks keep the two back-edges from returning.
 * CI also runs madge against .github/cycle-baseline.json (scripts/ci).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const imports = (code: string) => [...code.matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe("import cycles stay broken", () => {
  it("lib/wave/types.ts imports nothing from the wave engine modules", () => {
    const deps = imports(src("lib/wave/types.ts")).filter((d) => d.startsWith("./"));
    expect(deps).toEqual([]);
  });
  it("lib/playback/fullLength.ts does not import the resolver", () => {
    expect(imports(src("lib/playback/fullLength.ts"))).not.toContain("./resolver");
  });
  it("moved types are still exported from their old modules", async () => {
    const relevance = src("lib/wave/relevance.ts");
    const resolver = src("lib/playback/resolver.ts");
    expect(relevance).toMatch(/export type \{ GateVerdict \} from "\.\/types"/);
    expect(resolver).toMatch(/export type \{ CatalogTrack, PlaybackCandidate \} from "\.\/catalogTypes"/);
  });
});
