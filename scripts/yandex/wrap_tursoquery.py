#!/usr/bin/env python3
"""Wrap src/lib/yandex store+engine Turso calls in tursoQuery (auto schema init).

Transforms the regular pattern:
    const t = getTursoClient();
    await t.execute({ sql: `...`, args: [...] });
into:
    await texec(`...`, [...]);
where texec() routes through tursoQuery() — the codebase's auto-init pattern.
"""
import re

FILES = ["src/lib/yandex/store.ts", "src/lib/yandex/importEngine.ts"]

CALL_RE = re.compile(
    r"await t\.execute\(\{\s*sql:\s*(`(?:[^`\\]|\\.)*`)\s*,\s*args:\s*(\[[\s\S]*?\])\s*,?\s*\}\)",
)

HELPER = '''/**
 * Execute a Turso statement through tursoQuery — the codebase's auto
 * schema-init pattern (catches "no such table" → ensureTursoSchema → retry).
 */
async function texec(
  sql: string,
  args: Array<string | number | null>
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const t = getTursoClient();
  const r = await tursoQuery(() => t.execute({ sql, args }));
  return { rows: (r.rows as unknown as Array<Record<string, unknown>>) || [] };
}
'''


def transform(path: str) -> None:
    s = open(path).read()
    before = s.count("await t.execute(")

    def repl(m: re.Match) -> str:
        sql, args = m.group(1), m.group(2)
        args_flat = re.sub(r"\s+", " ", args).strip()
        return f"await texec({sql}, {args_flat})"

    s = CALL_RE.sub(repl, s)

    remaining_execute = len(re.findall(r"(?<!\w)t\.execute\(", s))
    if remaining_execute == 0:
        s = s.replace("    const t = getTursoClient();\n", "")

    if "async function texec" not in s:
        anchor = 'import { tryDecryptSecret } from "./token-crypto";\n'
        if anchor in s:
            s = s.replace(anchor, anchor + "\n" + HELPER + "\n", 1)
        else:
            anchor2 = 'import { isTurso, getTursoClient } from "@/lib/database";\n'
            assert anchor2 in s, f"no anchor in {path}"
            s = s.replace(anchor2, anchor2 + "\n" + HELPER + "\n", 1)

    open(path, "w").write(s)
    print(f"{path}: {before} execute -> {s.count('await t.execute(')} remaining, texec calls={s.count('await texec(')}")


for f in FILES:
    transform(f)
print("done")
