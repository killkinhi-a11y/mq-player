import { describe, expect, it } from "vitest";
import signalCases from "../../../shared/test-fixtures/wave-signals.cases.json";
import paletteCases from "../../../shared/test-fixtures/wave-palette.cases.json";
import themeTokens from "../../../shared/design/themes.json";
import { buildWaveSignals, WAVE_SIGNAL_LIMITS, type WaveSignalsInput } from "@/lib/wave/signals";
import { parseSignals } from "@/lib/wave/route-helpers";
import { WAVE_CONFIG } from "@/lib/wave";
import {
  DEFAULT_WAVE_ANCHOR_HUE, DEFAULT_WAVE_PALETTE, defaultPaletteForHue, deriveWavePalette, lerpPalette, paletteToCss,
} from "@/components/mq/wave-ambient-palette";
import { buildTokens } from "@/lib/theme-tokens";
import { themes } from "@/lib/themes";

describe("WAVE signals (shared with Android WaveSignalsBuilder)", () => {
  for (const c of signalCases.cases) {
    it(`${c.id}: ${c.description}`, () => {
      const out = JSON.parse(JSON.stringify(buildWaveSignals(c.input as unknown as WaveSignalsInput)));
      expect(out).toEqual(c.expected);
      // the server's own caps never truncate what a conforming client sends
      const { debug: _debug, ...parsed } = parseSignals(out);
      expect(_debug).toBe(false);
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(out);
    });
  }
  it("client limits match the engine config", () => {
    expect(WAVE_SIGNAL_LIMITS.sessionEvents).toBe(WAVE_CONFIG.feedback.maxSessionEvents);
  });
});

describe("WAVE ambient palette (shared with Android WavePalette)", () => {
  it("documents the same constants the WebGL scene uses", () => {
    expect(paletteCases.defaultAnchorHue).toBe(DEFAULT_WAVE_ANCHOR_HUE);
    expect(paletteCases.paletteLerpMs).toBe(950);
  });
  for (const c of paletteCases.cases as { id: string; fn: string; input: Record<string, unknown>; expected: unknown }[]) {
    it(c.id, () => {
      const i = c.input;
      const p =
        c.fn === "deriveWavePalette"
          ? deriveWavePalette({ primary: i.primary } as never, (i.anchorHueDeg as number | null) ?? undefined)
          : c.fn === "defaultPaletteForHue"
            ? defaultPaletteForHue(i.hueDeg as number)
            : lerpPalette(DEFAULT_WAVE_PALETTE, defaultPaletteForHue(i.bHue as number), i.t as number);
      expect(paletteToCss(p)).toEqual(c.expected);
    });
  }
});

describe("theme tokens (shared/design/themes.json ↔ src/lib/themes.ts)", () => {
  it("shared JSON is regenerated from the web themes (no drift)", () => {
    expect(themeTokens).toEqual(JSON.parse(JSON.stringify(buildTokens())));
  });
  it("covers every web theme id", () => {
    expect(themeTokens.themes.map((t) => t.id)).toEqual(Object.values(themes).map((t) => t.id));
  });
});
