#!/bin/bash
# Build APK web assets — TRUE standalone app (not WebView wrapper)
#
# Strategy:
# - Download /play HTML + all JS/CSS chunks from mq1.vercel.app
# - Bundle them locally in out/
# - Inject a small JS shim that rewrites fetch('/api/...') to absolute URL
#   (https://mq1.vercel.app/api/...) — this way the app works offline for UI
#   but makes live API calls for data
# - No <base href> — chunks are served locally, only API is proxied
#
# Usage: ./scripts/build-apk-web.sh

set -e
cd "$(dirname "$0")/.."

PROD_URL="https://mq1.vercel.app"
OUTPUT_DIR="out"

echo "==> Fetching production HTML from $PROD_URL/play..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Fetch the main page HTML
curl -sL --max-time 30 "$PROD_URL/play" -o "$OUTPUT_DIR/index.html"
echo "   Downloaded index.html ($(wc -c < $OUTPUT_DIR/index.html) bytes)"

# Extract all referenced _next/static/* assets
echo "==> Extracting chunk references..."
CHUNKS=$(grep -oE '/_next/static/[^"]+' "$OUTPUT_DIR/index.html" | sort -u)
echo "   Found $(echo "$CHUNKS" | wc -l) unique chunks"

# Download each chunk locally
echo "==> Downloading chunks..."
mkdir -p "$OUTPUT_DIR/_next/static"
COUNT=0
TOTAL=$(echo "$CHUNKS" | wc -l)
for chunk in $CHUNKS; do
  COUNT=$((COUNT + 1))
  chunk_path="$OUTPUT_DIR$chunk"
  chunk_dir=$(dirname "$chunk_path")
  mkdir -p "$chunk_dir"
  if ! curl -sL --max-time 30 "$PROD_URL$chunk" -o "$chunk_path" 2>/dev/null; then
    echo "   FAIL: $chunk"
    continue
  fi
  # Sanitize filename — replace ~ with _ (Gradle doesn't like ~)
  if [[ "$chunk_path" == *"~"* ]]; then
    new_path="${chunk_path//\~/_}"
    mv "$chunk_path" "$new_path"
  fi
  if [ $((COUNT % 20)) -eq 0 ]; then
    echo "   $COUNT/$TOTAL downloaded..."
  fi
done
echo "   $COUNT/$TOTAL chunks downloaded"

# Sanitize ~ and \ in index.html references
echo "==> Sanitizing chunk URLs in index.html..."
sed -i 's/~/_/g' "$OUTPUT_DIR/index.html"
# Remove trailing backslashes from media filenames (Next.js turbopack artifact)
sed -i 's/\\//g' "$OUTPUT_DIR/index.html"

# Also download media files (fonts, woff2)
echo "==> Downloading media assets..."
MEDIA=$(grep -oE '/_next/static/media/[^"]+' "$OUTPUT_DIR/index.html" | sort -u)
for media in $MEDIA; do
  media_path="$OUTPUT_DIR$media"
  media_dir=$(dirname "$media_path")
  mkdir -p "$media_dir"
  curl -sL --max-time 15 "$PROD_URL$media" -o "$media_path" 2>/dev/null || true
  # Sanitize
  if [[ "$media_path" == *"~"* ]]; then
    new_path="${media_path//\~/_}"
    mv "$media_path" "$new_path"
  fi
done
sed -i 's/~/_/g' "$OUTPUT_DIR/index.html"
sed -i 's/\\//g' "$OUTPUT_DIR/index.html"

# Download other static assets
echo "==> Downloading static assets..."
for asset in favicon.ico apple-touch-icon.png icon-192.png icon-512.png manifest.json sw.js; do
  curl -sL --max-time 15 "$PROD_URL/$asset" -o "$OUTPUT_DIR/$asset" 2>/dev/null || true
done

# Inject API proxy shim — rewrites fetch('/api/...') to absolute URL
echo "==> Injecting API proxy shim..."
cat > /tmp/apk-shim.html << 'SHIMEOF'
<script>
(function(){
  var API_BASE = "https://mq1.vercel.app";
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === "string" && input.indexOf("/api/") === 0) {
      input = API_BASE + input;
    } else if (input && input.url && input.url.indexOf("/api/") === 0) {
      input = new Request(API_BASE + input.url, input);
    }
    return originalFetch.call(this, input, init);
  };
  var OriginalEventSource = window.EventSource;
  window.EventSource = function(url, config) {
    if (typeof url === "string" && url.indexOf("/api/") === 0) {
      url = API_BASE + url;
    }
    return new OriginalEventSource(url, config);
  };
  window.EventSource.prototype = OriginalEventSource.prototype;
})();
</script>
SHIMEOF

# Insert shim before </head> using python (sed chokes on special chars)
python3 -c "
import sys
with open('$OUTPUT_DIR/index.html', 'r') as f:
    html = f.read()
with open('/tmp/apk-shim.html', 'r') as f:
    shim = f.read()
html = html.replace('</head>', shim + '</head>')
with open('$OUTPUT_DIR/index.html', 'w') as f:
    f.write(html)
print('   Shim injected')
"

echo "==> Done!"
echo "==> Total size: $(du -sh $OUTPUT_DIR | cut -f1)"
echo "==> File count: $(find $OUTPUT_DIR -type f | wc -l)"
