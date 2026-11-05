/**
 * Source-contract tests read component/store files as text. After the
 * Stage III decomposition a "module" = the entry file + its extracted
 * feature folder, so contracts keep checking the same code, wherever it moved.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, isAbsolute, dirname, basename, extname } from "node:path";

const DECOMPOSED: Record<string, string> = {
  "components/mq/MainView.tsx": "components/mq/main",
  "components/mq/SearchView.tsx": "components/mq/search",
  "components/mq/MessengerView.tsx": "components/mq/messenger",
  "components/mq/AuthView.tsx": "components/mq/auth",
  "store/useAppStore.ts": "store",
};

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}

export function readModuleSource(file: string): string {
  const abs = isAbsolute(file) ? file : join(process.cwd(), file);
  const main = readFileSync(abs, "utf8");
  const key = Object.keys(DECOMPOSED).find((k) => abs.endsWith(join("src", k)));
  if (!key) return main;
  const srcRoot = abs.slice(0, abs.length - key.length);
  const folder = join(srcRoot, DECOMPOSED[key]);
  if (!existsSync(folder)) return main;
  const extra = walk(folder).filter((p) => p !== abs && !(dirname(p) === dirname(abs) && basename(p, extname(p)) === basename(abs, extname(abs))));
  return [main, ...extra.map((p) => readFileSync(p, "utf8"))].join("\n");
}
