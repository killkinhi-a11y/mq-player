/**
 * WaveAmbientBackground — liquid ambient backdrop contract tests.
 *
 * Covers:
 *  - palette derivation: artwork hue preserved (blue→navy, red→burgundy,
 *    green→deep teal), darkness ALWAYS enforced, achromatic covers fall
 *    back to the cold indigo family;
 *  - CSS variable publication (--wave-color-1/2/3, --wave-highlight);
 *  - component lifecycle: inactive/active, WebGL vs CSS-fallback mode,
 *    reduced-motion static composition, unmount cleanup (rAF cancelled,
 *    GL context released);
 *  - QA hook shape (window.__mqWaveAmbient).
 *
 * Rendering: react-dom/client directly — the project's test suite has no
 * @testing-library/react dependency (pure-function + store testing
 * convention); a tiny createRoot helper keeps it that way.
 *
 * jsdom has no WebGL → the component naturally exercises the CSS fallback
 * path; a GL stub flips it onto the WebGL path for the engine tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ReactElement } from "react";

// React 19 act() environment flag (no test renderer in use)
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock the extraction module (jsdom: Image.onload never fires and the
//    real implementation would sit on its 3s timeout per call). ──
const extractColorsMock = vi.fn();
vi.mock("@/hooks/useDominantColor", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/hooks/useDominantColor")>();
  return { ...orig, extractColors: (...a: unknown[]) => extractColorsMock(...a) };
});

import {
  DEFAULT_WAVE_PALETTE,
  deriveWavePalette,
  lerpPalette,
  paletteToCss,
  hexToRgb,
  rgbToHex,
} from "@/components/mq/wave-ambient-palette";
import type { DominantColors } from "@/hooks/useDominantColor";
import type { Track } from "@/lib/musicApi";
import { WaveAmbientBackground } from "@/components/mq/WaveAmbientBackground";
import { useAppStore } from "@/store/useAppStore";

/* ─────────────────────────── helpers ─────────────────────────── */

const dc = (primary: string, secondary = "#1a1a2e", vibrant = "#ffffff"): DominantColors => ({
  primary,
  secondary,
  muted: "#2d2d3d",
  vibrant,
  dark: "#0a0a0a",
  rgb: { r: 0, g: 0, b: 0 },
});

const hueOf = (c: [number, number, number]) => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
};

const maxChannel = (c: [number, number, number]) => Math.max(c[0], c[1], c[2]);

const track = (id: string, cover: string): Track => ({
  id,
  title: "T",
  artist: "A",
  album: "",
  duration: 100,
  cover,
  genre: "",
  audioUrl: "",
  source: "demo",
});

/** Minimal react-dom render helper (rerender + unmount, act-wrapped). */
function renderEl(el: ReactElement): {
  container: HTMLElement;
  rerender: (next: ReactElement) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return {
    container,
    rerender: (next: ReactElement) => {
      act(() => {
        root.render(next);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Flush microtasks + pending effects so store/promise updates land. */
async function flushAsync() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function waitForCond(cond: () => void, timeoutMs = 2000) {
  const t0 = Date.now();
  for (;;) {
    try {
      cond();
      return;
    } catch (e) {
      if (Date.now() - t0 > timeoutMs) throw e;
    }
    await flushAsync();
  }
}

/** Minimal WebGL stub sufficient for LiquidEngine to come up. */
function makeWebGLStub() {
  const loseContext = vi.fn();
  const gl = {
    createShader: () => ({}),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: () => ({}),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    useProgram: vi.fn(),
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    createBuffer: () => ({}),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    uniform3f: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
    // WebGL constants used by the engine
    TRIANGLES: 4,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
  };
  return { gl, loseContext };
}

/* ═══════════════════ PART A — palette math ═══════════════════ */

describe("deriveWavePalette — artwork → DARK liquid palette", () => {
  it("blue artwork → navy family, hue preserved, dark enforced", () => {
    const p = deriveWavePalette(dc("#3355ff"));
    expect(Math.abs(hueOf(p.c2) - 225)).toBeLessThanOrEqual(20);
    expect(maxChannel(p.c1)).toBeLessThanOrEqual(40);
    expect(maxChannel(p.c2)).toBeLessThanOrEqual(78);
    expect(maxChannel(p.c3)).toBeLessThanOrEqual(56);
  });

  it("red artwork → dark burgundy (hue stays ~350, never turns neon)", () => {
    const p = deriveWavePalette(dc("#e03131"));
    const hue = hueOf(p.c2);
    expect(hue >= 335 || hue <= 10).toBe(true);
    expect(maxChannel(p.c2)).toBeLessThanOrEqual(78);
  });

  it("green artwork → emerald / deep teal (hue ~150 preserved)", () => {
    const p = deriveWavePalette(dc("#22cc66"));
    expect(Math.abs(hueOf(p.c2) - 145)).toBeLessThanOrEqual(18);
    expect(maxChannel(p.c2)).toBeLessThanOrEqual(78);
  });

  it("BRIGHT yellow artwork → still dark (lightness is crushed, not just the hue)", () => {
    const p = deriveWavePalette(dc("#ffdd00"));
    expect(maxChannel(p.c2)).toBeLessThanOrEqual(78);
    expect(maxChannel(p.c3)).toBeLessThanOrEqual(56);
    expect(maxChannel(p.c1)).toBeLessThanOrEqual(40);
  });

  it("violet artwork → violet/indigo accent", () => {
    const p = deriveWavePalette(dc("#7a3fd6"));
    expect(Math.abs(hueOf(p.c2) - 270)).toBeLessThanOrEqual(25);
  });

  it("achromatic (grey/white) cover → cold indigo family fallback", () => {
    const p = deriveWavePalette(dc("#f2f2f2"));
    // cold family: blue channel dominates c2
    expect(p.c2[2]).toBeGreaterThan(p.c2[0]);
    expect(maxChannel(p.c2)).toBeLessThanOrEqual(78);
  });

  it("the highlight keeps a whisper of the artwork hue but stays silver", () => {
    const p = deriveWavePalette(dc("#3355ff"));
    const l = (0.299 * p.hl[0] + 0.587 * p.hl[1] + 0.114 * p.hl[2]) / 255;
    expect(l).toBeGreaterThan(0.7);
  });

  it("DEFAULT_WAVE_PALETTE is a dark cold navy composition", () => {
    expect(maxChannel(DEFAULT_WAVE_PALETTE.c1)).toBeLessThanOrEqual(40);
    expect(maxChannel(DEFAULT_WAVE_PALETTE.c2)).toBeLessThanOrEqual(78);
    expect(DEFAULT_WAVE_PALETTE.c2[2]).toBeGreaterThan(DEFAULT_WAVE_PALETTE.c2[0]);
  });
});

describe("palette utilities", () => {
  it("hexToRgb/rgbToHex round-trip", () => {
    expect(hexToRgb("#162a54")).toEqual([22, 42, 84]);
    expect(rgbToHex([22, 42, 84])).toBe("#162a54");
    expect(rgbToHex(hexToRgb("#d6e2ff"))).toBe("#d6e2ff");
  });

  it("paletteToCss publishes all four variables", () => {
    const css = paletteToCss(DEFAULT_WAVE_PALETTE);
    expect(css.c1).toMatch(/^#[0-9a-f]{6}$/i);
    expect(css.c2).toMatch(/^#[0-9a-f]{6}$/i);
    expect(css.c3).toMatch(/^#[0-9a-f]{6}$/i);
    expect(css.hl).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("lerpPalette hits the target at t=1 and the start at t=0", () => {
    const a = DEFAULT_WAVE_PALETTE;
    const b = deriveWavePalette(dc("#e03131"));
    expect(lerpPalette(a, b, 0)).toEqual(a);
    expect(lerpPalette(a, b, 1)).toEqual(b);
    const mid = lerpPalette(a, b, 0.5);
    expect(mid.c2[0]).toBeCloseTo((a.c2[0] + b.c2[0]) / 2, 5);
  });
});

/* ═══════════════════ PART B — component lifecycle (CSS fallback) ═══════════════════ */

describe("WaveAmbientBackground — component", () => {
  beforeEach(() => {
    extractColorsMock.mockReset();
    extractColorsMock.mockResolvedValue(dc("#3355ff"));
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--wave-color-1");
    document.documentElement.style.removeProperty("--wave-color-2");
    document.documentElement.style.removeProperty("--wave-color-3");
    document.documentElement.style.removeProperty("--wave-highlight");
    delete (window as unknown as Record<string, unknown>).__mqWaveAmbient;
  });

  it("renders hidden when inactive", () => {
    const r = renderEl(<WaveAmbientBackground active={false} currentTrack={null} />);
    try {
      const wrap = r.container.querySelector<HTMLElement>(".mq-wave-liquid");
      expect(wrap).not.toBeNull();
      expect(wrap?.dataset.active).toBe("false");
      expect(wrap?.getAttribute("aria-hidden")).toBe("true");
    } finally {
      r.unmount();
    }
  });

  it("CSS-fallback mode when WebGL is unavailable (jsdom): five layers + two scrims", () => {
    const r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
    try {
      const wrap = r.container.querySelector<HTMLElement>(".mq-wave-liquid");
      expect(wrap?.dataset.active).toBe("true");
      expect(wrap?.dataset.mode).toBe("css");
      expect(r.container.querySelector(".mq-wave-fallback")).not.toBeNull();
      expect(
        r.container.querySelectorAll(
          ".mq-wf-base, .mq-wf-liquid, .mq-wf-depth, .mq-wf-streak, .mq-wf-grain",
        ).length,
      ).toBe(5);
      expect(r.container.querySelectorAll(".mq-wave-scrim").length).toBe(2);
    } finally {
      r.unmount();
    }
  });

  it("publishes the default palette as CSS variables on <html>", () => {
    const r = renderEl(<WaveAmbientBackground active={false} currentTrack={null} />);
    try {
      const root = document.documentElement;
      expect(root.style.getPropertyValue("--wave-color-1")).toBe(rgbToHex(DEFAULT_WAVE_PALETTE.c1));
      expect(root.style.getPropertyValue("--wave-color-2")).toBe(rgbToHex(DEFAULT_WAVE_PALETTE.c2));
      expect(root.style.getPropertyValue("--wave-color-3")).toBe(rgbToHex(DEFAULT_WAVE_PALETTE.c3));
      expect(root.style.getPropertyValue("--wave-highlight")).toBe(rgbToHex(DEFAULT_WAVE_PALETTE.hl));
    } finally {
      r.unmount();
    }
  });

  it("derives the palette from the artwork (dark red cover → dark red family) and follows track changes", async () => {
    extractColorsMock.mockResolvedValue(dc("#e03131"));
    const r = renderEl(
      <WaveAmbientBackground active={true} currentTrack={track("t1", "https://x/red.jpg")} />,
    );
    try {
      await waitForCond(() => {
        expect(document.documentElement.style.getPropertyValue("--wave-color-2")).not.toBe(
          rgbToHex(DEFAULT_WAVE_PALETTE.c2),
        );
      });
      const c2 = hexToRgb(document.documentElement.style.getPropertyValue("--wave-color-2"));
      // dark + red-dominant family
      expect(c2[0]).toBeGreaterThan(c2[1]);
      expect(maxChannel(c2)).toBeLessThanOrEqual(78);

      // track change → new palette
      extractColorsMock.mockResolvedValue(dc("#22cc66"));
      r.rerender(
        <WaveAmbientBackground active={true} currentTrack={track("t2", "https://x/green.jpg")} />,
      );
      await waitForCond(() => {
        const hex = document.documentElement.style.getPropertyValue("--wave-color-2");
        const c = hexToRgb(hex);
        expect(c[1]).toBeGreaterThan(c[0]);
      });
    } finally {
      r.unmount();
    }
  });

  it("no track → default palette, no extraction call", async () => {
    const r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
    try {
      await flushAsync();
      expect(extractColorsMock).not.toHaveBeenCalled();
      expect(document.documentElement.style.getPropertyValue("--wave-color-1")).toBe(
        rgbToHex(DEFAULT_WAVE_PALETTE.c1),
      );
    } finally {
      r.unmount();
    }
  });

  it("reduced-motion (store) → static composition on wrapper + fallback", () => {
    act(() => {
      useAppStore.setState({ reduceMotion: true });
    });
    let r: ReturnType<typeof renderEl> | null = null;
    try {
      r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
      expect(r.container.querySelector<HTMLElement>(".mq-wave-liquid")?.dataset.waveMotion).toBe("static");
      expect(r.container.querySelector<HTMLElement>(".mq-wave-fallback")?.dataset.waveMotion).toBe("static");
    } finally {
      act(() => {
        useAppStore.setState({ reduceMotion: false });
      });
      r?.unmount();
    }
  });

  it("exposes the QA hook window.__mqWaveAmbient", async () => {
    const r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
    try {
      await flushAsync();
      const hook = (window as unknown as { __mqWaveAmbient?: Record<string, unknown> })
        .__mqWaveAmbient;
      expect(hook).toMatchObject({ mode: "css", motion: "live", active: true, scale: 1 });
      expect(hook?.palette).toHaveProperty("c1");
    } finally {
      r.unmount();
    }
  });
});

/* ═══════════════════ PART C — WebGL engine path (GL stub) ═══════════════════ */

describe("WaveAmbientBackground — WebGL engine", () => {
  let restoreAll: () => void;
  let loseContext: ReturnType<typeof vi.fn>;
  let rafSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origRAF = window.requestAnimationFrame;
    const origCancel = window.cancelAnimationFrame;

    const stub = makeWebGLStub();
    loseContext = stub.loseContext;
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = ((
      type: string,
      ...rest: unknown[]
    ) => {
      if (type === "webgl" || type === "experimental-webgl") return stub.gl;
      return origGetContext.call(HTMLCanvasElement.prototype, type, ...rest);
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    // rAF that actually delivers frames (setTimeout-driven) AND actually
    // cancels them, so loops run for real and self-parking behaviour is
    // observable. Real timers — vi.useFakeTimers() would hijack rAF itself.
    let rafId = 0;
    const pending = new Map<number, ReturnType<typeof setTimeout>>();
    rafSpy = vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafId;
      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          cb(performance.now());
        }, 16),
      );
      return id;
    });
    cancelSpy = vi.fn((id?: number) => {
      if (id !== undefined && pending.has(id)) {
        clearTimeout(pending.get(id));
        pending.delete(id);
      }
    });
    window.requestAnimationFrame = rafSpy as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = cancelSpy as unknown as typeof window.cancelAnimationFrame;

    restoreAll = () => {
      (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext =
        origGetContext;
      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame = origCancel;
    };

    extractColorsMock.mockReset();
    extractColorsMock.mockResolvedValue(dc("#3355ff"));
  });

  afterEach(() => {
    restoreAll();
    delete (window as unknown as Record<string, unknown>).__mqWaveAmbient;
  });

  it("uses WebGL when available and runs the rAF loop (outside React)", async () => {
    const r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
    try {
      const wrap = r.container.querySelector<HTMLElement>(".mq-wave-liquid");
      expect(wrap?.dataset.mode).toBe("webgl");
      expect(r.container.querySelector("canvas.mq-wave-canvas")).not.toBeNull();
      // live mode: the loop keeps scheduling frames
      await new Promise((res) => setTimeout(res, 120));
      const c1 = rafSpy.mock.calls.length;
      expect(c1).toBeGreaterThanOrEqual(3);
      await new Promise((res) => setTimeout(res, 120));
      expect(rafSpy.mock.calls.length).toBeGreaterThan(c1);
    } finally {
      r.unmount();
    }
  });

  it("static mode: only the self-parking colour-transition loop — no continuous animation", async () => {
    act(() => {
      useAppStore.setState({ reduceMotion: true });
    });
    let r: ReturnType<typeof renderEl> | null = null;
    try {
      r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
      expect(r.container.querySelector<HTMLElement>(".mq-wave-liquid")?.dataset.waveMotion).toBe(
        "static",
      );
      // the 950 ms palette transition legitimately runs a short loop…
      await new Promise((res) => setTimeout(res, 400));
      expect(rafSpy.mock.calls.length).toBeGreaterThan(0);
      // …then the engine parks itself: the count freezes
      await new Promise((res) => setTimeout(res, 1000)); // past 950 ms lerp
      const parked = rafSpy.mock.calls.length;
      await new Promise((res) => setTimeout(res, 350));
      expect(rafSpy.mock.calls.length).toBe(parked);
    } finally {
      act(() => {
        useAppStore.setState({ reduceMotion: false });
      });
      r?.unmount();
    }
  });

  it("deactivating parks the engine; unmount cancels rAF and releases the GL context", async () => {
    const r = renderEl(<WaveAmbientBackground active={true} currentTrack={null} />);
    try {
      await new Promise((res) => setTimeout(res, 100));
      expect(rafSpy.mock.calls.length).toBeGreaterThan(0);

      r.rerender(<WaveAmbientBackground active={false} currentTrack={null} />);
      await new Promise((res) => setTimeout(res, 1400)); // past the 1200 ms park delay
      const parked = rafSpy.mock.calls.length;
      await new Promise((res) => setTimeout(res, 250));
      expect(rafSpy.mock.calls.length).toBe(parked); // engine parked, no frames

      // the park itself cancelled the pending frame (halt → cancelAnimationFrame)
      expect(cancelSpy.mock.calls.length).toBeGreaterThan(0);

      r.unmount();
      expect(loseContext).toHaveBeenCalled(); // GL context released
      expect((window as unknown as Record<string, unknown>).__mqWaveAmbient).toBeUndefined();
    } finally {
      r.unmount();
    }
  });
});
