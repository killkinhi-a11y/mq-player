#!/usr/bin/env python3
"""Parse agent-browser eval JSON output (double-encoded) and print audit summary."""
import json, sys

path = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else path
raw = open(path).read()
d = json.loads(raw)
if isinstance(d, str):
    d = json.loads(d)

real = [p for p in d.get('problems', []) if any('not-clickable' not in i for i in p['issues'])]
nc = [p for p in d.get('problems', []) if all('not-clickable' in i for i in p.get('issues', []))]
print(f"{label}: rows={d['summary']['rows']} realProblems={len(real)} notClickableOnly(hover-env)={len(nc)} overflowX={d['pageOverflowX']}")
print(f"  like={d.get('likeSizeConsistency')} art={d.get('artworkSizeConsistency')} heights={d.get('rowHeightConsistency')}")
for p in real[:8]:
    print('  P:', json.dumps(p, ensure_ascii=False)[:220])
# mobile action visibility if requested
if len(sys.argv) > 3 and sys.argv[3] == 'mobile':
    hidden = [(r['i'], a['label']) for r in d['rows'] for a in r['actions'] if float(a['opacity']) < 0.9]
    print('  mobileActionsHidden:', hidden[:6])
