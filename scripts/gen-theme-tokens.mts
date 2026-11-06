/**
 * Theme tokens: web src/lib/themes.ts (source of truth) → shared/design/themes.json
 * → Android generated block in ui/theme/MqThemes.kt.
 *
 *   npx tsx scripts/gen-theme-tokens.mts           # write both
 *   npx tsx scripts/gen-theme-tokens.mts --check   # exit 1 if either is stale
 *
 * Drift is also caught by tests on both sides (src/__tests__/contracts/theme-tokens.test.ts,
 * android ThemeTokensParityTest). Supersedes scripts/gen_mq_themes.py.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildTokens } from "../src/lib/theme-tokens.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = path.join(root, "shared/design/themes.json");
const KT_PATH = path.join(root, "android/app/src/main/kotlin/com/mq1/player/ui/theme/MqThemes.kt");
const BEGIN = "// <generated:theme-tokens> — DO NOT EDIT: npx tsx scripts/gen-theme-tokens.mts";
const END = "// </generated:theme-tokens>";

type Tok = ReturnType<typeof buildTokens>["themes"][number];
const kc = (hex8: string) => `Color(0x${(hex8.slice(7, 9) + hex8.slice(1, 7)).toUpperCase()})`;
const ident = (id: string) => "_" + id.split(/[-_]/).map((p) => p[0].toUpperCase() + p.slice(1)).join("");

function kotlinBlock(tokens: ReturnType<typeof buildTokens>): string {
  const out: string[] = [BEGIN];
  for (const t of tokens.themes as Tok[]) {
    out.push(
      `private val ${ident(t.id)} = MqPalette(`,
      `    id = "${t.id}", name = "${t.name}",`,
      `    background = ${kc(t.background)}, surface = ${kc(t.card)},`,
      `    surfaceHigh = ${kc(t.cardHover)}, accent = ${kc(t.accent)},`,
      `    onAccent = ${kc(t.onAccent)},`,
      `    text = ${kc(t.text)}, textMuted = ${kc(t.textMuted)},`,
      `    outline = ${kc(t.border)}, inputBg = ${kc(t.inputBg)},`,
      `    playerBg = ${kc(t.playerBg)}, navBg = ${kc(t.navBg)},`,
      `    isDark = ${t.isDark},`,
      `    glass = ${kc(t.ambient.glass)}, platinum = ${kc(t.ambient.platinum)},`,
      `    waveBase = ${kc(t.ambient.waveBase)}, waveHue = ${t.ambient.waveHue}f,`,
      `)`,
      ``,
    );
  }
  out.push(`val mqThemes: List<MqPalette> = listOf(${(tokens.themes as Tok[]).map((t) => ident(t.id)).join(", ")})`);
  out.push(END);
  return out.join("\n");
}

function render() {
  const tokens = buildTokens();
  const json = JSON.stringify(tokens, null, 2) + "\n";
  const kt = readFileSync(KT_PATH, "utf8");
  const b = kt.indexOf(BEGIN);
  const e = kt.indexOf(END);
  if (b < 0 || e < 0) throw new Error(`markers not found in ${KT_PATH}`);
  const nextKt = kt.slice(0, b) + kotlinBlock(tokens) + kt.slice(e + END.length);
  return { json, kt, nextKt };
}

const { json, kt, nextKt } = render();
const current = (() => { try { return readFileSync(JSON_PATH, "utf8"); } catch { return ""; } })();
if (process.argv.includes("--check")) {
  const stale = [current !== json && JSON_PATH, kt !== nextKt && KT_PATH].filter(Boolean);
  if (stale.length) {
    console.error(`theme tokens are stale: ${stale.join(", ")} — run npx tsx scripts/gen-theme-tokens.mts`);
    process.exit(1);
  }
  console.log("theme tokens up to date");
} else {
  writeFileSync(JSON_PATH, json);
  writeFileSync(KT_PATH, nextKt);
  console.log(`wrote ${JSON_PATH} and ${KT_PATH}`);
}
