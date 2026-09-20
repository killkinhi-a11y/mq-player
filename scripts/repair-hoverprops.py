#!/usr/bin/env python3
"""Repair the broken hoverProps tails: whileHover={hoverProps({ X }})}
-> whileHover={hoverProps({ X })}   (f-string brace bug produced }}})."""
import re
import glob
import os

ROOT = "/home/z/my-project/src/components/mq"
pattern = re.compile(r"whileHover=\{hoverProps\(\{(.*?)\}\)\}", re.S)

total = 0
for path in sorted(glob.glob(os.path.join(ROOT, "*.tsx"))):
    src = open(path).read()
    if "hoverProps({{" not in src:
        continue
    new, n = pattern.subn(lambda m: "whileHover={hoverProps({" + m.group(1) + "})}", src)
    if n:
        open(path, "w").write(new)
        total += n
        print(f"  {os.path.basename(path)}: {n} repaired")
print("total repaired:", total)

# MainView lifts -4 -> -2 (previous replace no-op'd on broken strings)
p = os.path.join(ROOT, "MainView.tsx")
s = open(p).read()
n = s.count("hoverProps({ y: -4,")
s = s.replace("hoverProps({ y: -4,", "hoverProps({ y: -2,")
open(p, "w").write(s)
print(f"MainView lifts -4->-2: {n}")
