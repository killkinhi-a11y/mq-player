#!/bin/bash
# V3 QA — PHASE 35: PREVIEW deployment QA (real Vercel preview URL)
set -u
OUT=download/qa-v3
mkdir -p "$OUT"
PREVIEW="https://mq1-git-v3-preview-killkinhi-5353s-projects.vercel.app"
AB="agent-browser --session v3prev"

echo "=== API checks ==="
echo -n "search: "; curl -s --max-time 25 "$PREVIEW/api/music/search?q=weeknd" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('tracks',[]); print(len(t), 'tracks; first:', (t[0]['title'] if t else 'NONE'))" 2>/dev/null
echo -n "catalog: "; curl -s --max-time 25 "$PREVIEW/api/catalog/search?q=weeknd&limit=3" | python3 -c "import json,sys; d=json.load(sys.stdin); print('provider=', d.get('provider'), 'tracks=', len(d.get('tracks',[])))" 2>/dev/null
echo -n "lyrics probe: "; curl -s --max-time 25 "$PREVIEW/api/lyrics?artist=The%20Weeknd&title=Blinding%20Lights" -o /dev/null -w "%{http_code}\n" 2>/dev/null
echo -n "providers: "; curl -s --max-time 25 "$PREVIEW/api/spotify/config" | head -c 120; echo

echo "=== resolve API (preview rejection §6!) ==="
curl -s --max-time 30 -X POST "$PREVIEW/api/resolve" -H "Content-Type: application/json" -d '{
  "catalogProvider": "deezer",
  "track": { "title": "Blinding Lights", "artist": "The Weeknd", "durationSec": 200 }
}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
best=d.get('best')
alts=d.get('alternatives',[])
print('best:', (best or {}).get('provider'), (best or {}).get('sourceId'), 'conf=', (best or {}).get('confidence'), 'fullLength=', (best or {}).get('isFullLength', 'n/a'))
previews=[a for a in alts if a.get('isFullLength') is False]
print('alternatives:', len(alts), '| flagged previews in alternatives:', len(previews))
if best is None and alts: print('LOW-CONFIDENCE honest state (no autoplay)')
"

echo "=== BROWSER: preview deployment ==="
$AB set viewport 1440 900 > /dev/null 2>&1
$AB open "$PREVIEW/" > /dev/null 2>&1
sleep 3
$AB find text "Демо-режим" click 2>&1 | tail -1
sleep 3
$AB screenshot $OUT/40-preview-home.png 2>&1 | tail -1
$AB find text "Поиск" click > /dev/null 2>&1; sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  if (!inp) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'starboy');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 5
$AB screenshot $OUT/41-preview-search.png 2>&1 | tail -1
echo -n "preview search rows: "; $AB eval "document.querySelectorAll('.mq-row').length" 2>/dev/null

echo "=== PLAY on preview + full player + wave ==="
$AB eval "document.querySelectorAll('.mq-row')[0]?.click() || 'no row'" > /dev/null 2>&1
sleep 6
$AB find role button click --name "Открыть полный плеер" > /dev/null 2>&1
sleep 3
$AB screenshot $OUT/42-preview-fullplayer-wave.png 2>&1 | tail -1
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  return JSON.stringify({ wave: wf?.getAttribute('data-wave-state') ?? null, status: wf?.getAttribute('data-status') ?? null });
})()" 2>/dev/null

echo "=== skip events live on preview ==="
$AB eval "
(() => {
  const raw = localStorage.getItem('mq:v3:listeningEvents');
  return raw ? ('events=' + JSON.parse(raw).length) : 'no events yet';
})()" 2>/dev/null

echo "=== mobile 390 on preview ==="
$AB press Escape > /dev/null 2>&1; sleep 1
$AB set viewport 390 844 > /dev/null 2>&1; sleep 2
$AB screenshot $OUT/43-preview-mobile.png 2>&1 | tail -1
$AB errors 2>&1 | grep -cv "^✗ *$" | xargs -I{} echo "non-empty error lines: {}"

echo "PREVIEW-QA DONE"
