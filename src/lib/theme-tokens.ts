/**
 * Platform-neutral theme tokens derived from src/lib/themes.ts. Serialized to
 * shared/design/themes.json by scripts/gen-theme-tokens.mts and consumed by the
 * Android generator / drift tests.
 */
import { themes } from "@/lib/themes";

const COLOR_FIELDS = ["background", "card", "cardHover", "accent", "text", "textMuted", "border", "inputBg", "playerBg", "navBg"] as const;
const AMBIENT_COLOR_FIELDS = ["glass", "platinum", "waveBase"] as const;

/** Any CSS color used in themes.ts → canonical "#rrggbbaa". */
export function toHex8(css: string): string {
  const s = css.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return `#${m[1]}${m[2] ?? "ff"}`;
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (m) {
    const h = (n: number) => n.toString(16).padStart(2, "0");
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${h(Math.round(a * 255))}`;
  }
  throw new Error(`unsupported color ${css}`);
}

function luminance(hex8: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex8.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function buildTokens() {
  return {
    version: 1,
    source: "src/lib/themes.ts",
    themes: Object.values(themes).map((t) => {
      const colors = Object.fromEntries(COLOR_FIELDS.map((f) => [f, toHex8(t[f])]));
      return {
        id: t.id,
        name: t.name,
        ...colors,
        isDark: luminance(colors.background) < 0.5,
        onAccent: luminance(colors.accent) > 0.8 ? "#000000ff" : "#ffffffff",
        ambient: {
          ...Object.fromEntries(AMBIENT_COLOR_FIELDS.map((f) => [f, toHex8(t.ambient[f])])),
          waveHue: t.ambient.waveHue,
        },
      };
    }),
  };
}

