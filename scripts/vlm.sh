#!/bin/bash
# vlm.sh <prompt> <image> — run VLM, print content field only
cd /home/z/my-project
OUT=$(mktemp /tmp/vlm-XXXX.json)
z-ai vision -p "$1" -i "$2" > "$OUT" 2>/dev/null
python3 - "$OUT" <<'EOF'
import json, re, sys
raw = open(sys.argv[1]).read()
m = re.search(r'\{.*\}', raw, re.S)
if not m:
    print("PARSE FAIL:", raw[:300]); sys.exit(1)
try:
    d = json.loads(m.group(0))
    print(d["choices"][0]["message"]["content"])
except Exception as e:
    # content may contain braces; try to grab "content" field directly
    c = re.search(r'"content":\s*"((?:[^"\\]|\\.)*)"', raw, re.S)
    print(c.group(1).encode().decode("unicode_escape") if c else f"ERR {e}")
EOF
rm -f "$OUT"
