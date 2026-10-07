#!/usr/bin/env python3
"""Inject the new SEARCH HOME discovery block into SearchView.tsx (V2 §1).
Replaces the old discovery-state block (quick picks + history rows + chips +
cold-start hero) with the new editorial composition, and appends the
DiscoveryFeaturedCard component after TopResultCard.
"""
import re, sys

P = "src/components/mq/SearchView.tsx"
s = open(P).read()

start_marker = "      {/* ═══ DISCOVERY STATE (§9) — no query yet: a real place to start ═══"
end_marker = "\n    </div>\n  );\n}"

si = s.find(start_marker)
ei = s.find(end_marker, si)
assert si > 0 and ei > si, (si, ei)

new_block = open("scripts/final-design-v2/new-discovery-block.txt").read().strip()
# Extract the template literal between the first backtick after NEW_BLOCK = and the final backtick
kb = new_block.find("const NEW_BLOCK = `") + len("const NEW_BLOCK = `")
ke = new_block.rfind("`")
assert kb > 0 and ke > kb
block = new_block[kb:ke]
# unescape template literals that were escaped for the .txt wrapper
block = block.replace("\\`", "`").replace("\\${", "${")

s = s[:si] + block + s[ei + len(end_marker):]
open(P, "w").write(s)
print("discovery block injected")
