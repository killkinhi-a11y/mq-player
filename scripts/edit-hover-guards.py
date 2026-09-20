#!/usr/bin/env python3
"""Transform 1: gate all literal whileHover objects behind hoverProps()
(touch devices get {} — no hover flash on tap).
Transform 2: MainView card lift -4 -> -2 (subtle hover, matches CSS doc).
Transform 3: cap unbounded stagger delays (index*0.04 -> min(.., 0.4)).
Run from repo root: python3 scripts/edit-hover-guards.py"""
import re
import glob
import os

ROOT = "/home/z/my-project/src/components/mq"
IMPORT = 'import { hoverProps } from "@/lib/hoverCapability";'


def transform_whilehover(src: str) -> tuple[str, int]:
    """whileHover={{ ... }} -> whileHover={hoverProps({ ... })} via brace counting."""
    out = []
    i = 0
    count = 0
    token = "whileHover={{"
    while i < len(src):
        j = src.find(token, i)
        if j == -1:
            out.append(src[i:])
            break
        # find matching closing "}}" for this object literal
        k = j + len(token)  # position after "{{
        depth = 2  # inside the outer { of the prop + inner { of object
        while k < len(src) and depth > 0:
            c = src[k]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            k += 1
        if depth != 0:
            out.append(src[i:])
            break
        # k is one past the last '}' consumed. src[j+len(token)-1:k] == "{{ ... }}"
        inner = src[j + len(token) - 1 + 1: k - 2]  # between {{ and }}
        # skip dynamic / non-literal content (functions, ternaries)
        if "=>" in inner or "?" in inner and ":" in inner and "transition" not in inner:
            out.append(src[i:j + len(token)])
            i = j + len(token)
            continue
        # safety: inner must not contain "}}" (nested template) — brace counting handled it
        replaced = f"whileHover={{hoverProps({{{inner}}})}}"
        out.append(src[i:j])
        out.append(replaced)
        count += 1
        i = k
    return "".join(out), count


def add_import(src: str) -> str:
    if 'hoverProps' in src and "@/lib/hoverCapability" in src:
        return src  # already imported (or only usage inside comments)
    # insert after the last import line
    lines = src.split("\n")
    last_import = 0
    for idx, line in enumerate(lines[:80]):
        if line.startswith("import ") or (line.strip().startswith('} from "') and line.rstrip().endswith(";")):
            last_import = idx
    lines.insert(last_import + 1, IMPORT)
    return "\n".join(lines)


total = 0
touched = []
for path in sorted(glob.glob(os.path.join(ROOT, "*.tsx"))):
    src = open(path).read()
    if "whileHover={{" not in src:
        continue
    new, n = transform_whilehover(src)
    if n:
        new = add_import(new)
        open(path, "w").write(new)
        total += n
        touched.append((os.path.basename(path), n))

print("files touched:")
for name, n in touched:
    print(f"  {name}: {n}")
print("total whileHover gated:", total)

# ── MainView specifics: lift -4 -> -2, cap unbounded staggers ──
p = os.path.join(ROOT, "MainView.tsx")
s = open(p).read()
n_lift = s.count("whileHover={hoverProps({ y: -4,")
s = s.replace(
    "whileHover={hoverProps({ y: -4, transition: { duration: 0.15, ease: \"easeOut\" } })}",
    "whileHover={hoverProps({ y: -2, transition: { duration: 0.15, ease: \"easeOut\" } })}",
)
# cap stagger: delay: index * 0.04  ->  Math.min(index * 0.04, 0.4)
n_stag = len(re.findall(r"delay: index \* 0\.04", s))
s = s.replace("delay: index * 0.04", "delay: Math.min(index * 0.04, 0.4)")
open(p, "w").write(s)
print(f"MainView: {n_lift} lifts -4->-2, {n_stag} staggers capped")

# PublicPlaylistsView stagger: delay: index * 0.1 (audit: unbounded)
p2 = os.path.join(ROOT, "PublicPlaylistsView.tsx")
if os.path.exists(p2):
    s2 = open(p2).read()
    n2 = len(re.findall(r"delay: index \* 0\.1\b", s2))
    s2 = re.sub(r"delay: index \* 0\.1\b", "delay: Math.min(index * 0.1, 0.4)", s2)
    open(p2, "w").write(s2)
    print(f"PublicPlaylistsView: {n2} staggers capped")
