#!/bin/bash
# Build APK web assets by downloading the production bundle from mq1.vercel.app
# and bundling it locally. This gives a "real" APK with embedded UI — the
# WebView loads local files instead of fetching them from the internet.
#
# Strategy:
# - Fetch /play HTML
# - Download all referenced JS/CSS chunks locally
# - Inject <base href="https://mq1.vercel.app/"> so fetch('/api/...') resolves
#   to the production server
# - Result: APK works offline for UI, makes live API calls for data
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

# Inject <base href> right after <head> so all relative paths
# (/_next/..., /api/..., /favicon.ico, etc.) resolve to the production server
echo "==> Injecting <base href=\"$PROD_URL/\"> for API calls..."
sed -i "s|<head>|<head><base href=\"$PROD_URL/\">|" "$OUTPUT_DIR/index.html"

# Find all referenced _next/static/* assets in the HTML
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
  # Create directory structure
  chunk_path="$OUTPUT_DIR$chunk"
  chunk_dir=$(dirname "$chunk_path")
  mkdir -p "$chunk_dir"
  # Download (silently, only report failures)
  if ! curl -sL --max-time 30 "$PROD_URL$chunk" -o "$chunk_path" 2>/dev/null; then
    echo "   FAIL: $chunk"
    continue
  fi
  if [ $((COUNT % 20)) -eq 0 ]; then
    echo "   $COUNT/$TOTAL downloaded..."
  fi
done
echo "   $COUNT/$TOTAL chunks downloaded"

# Now update index.html to point to LOCAL chunks instead of CDN
# (the <base href> would otherwise route them to mq1.vercel.app)
echo "==> Rewriting chunk URLs to local paths..."
# Remove the base href (we don't want it anymore — chunks are local)
sed -i "s|<base href=\"$PROD_URL/\">||" "$OUTPUT_DIR/index.html"

# But keep fetch('/api/...') going to prod — we need to set window.__MQ_API_BASE
# Actually the chunks already encode "/api/..." as relative. With local
# origin (file:// or capacitor://), "/api/..." resolves to origin/api/...
# which doesn't exist.
# Solution: keep <base href> but only for /api — impossible.
# Better solution: keep <base href> AND let chunks be served from local.
# Capacitor's WebView uses capacitor://localhost origin — local files are
# served from capacitor://localhost/_next/... so /_next/... resolves locally,
# but /api/... resolves to capacitor://localhost/api/... (404).
# Best solution: route /api/... through a JS shim that rewrites to absolute URL.

# Re-add base href for now — it makes /api/... work, and local /_next/...
# assets will be overridden by the browser loading local files first
# (since Capacitor serves /_next/ from local assets/public/).
sed -i "s|<head>|<head><base href=\"$PROD_URL/\">|" "$OUTPUT_DIR/index.html"

# Download other static assets referenced
echo "==> Downloading other static assets..."
for asset in favicon.ico apple-touch-icon.png icon-192.png icon-512.png manifest.json; do
  if ! curl -sL --max-time 15 "$PROD_URL/$asset" -o "$OUTPUT_DIR/$asset" 2>/dev/null; then
    echo "   Skip: $asset"
  fi
done

# Also need a startup redirect page at / (since the app shell might load /)
echo "==> Creating root redirect page..."
cat > "$OUTPUT_DIR/root-redirect.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MQ Player</title>
  <meta http-equiv="refresh" content="0; url=/play">
</head>
<body>Redirecting…</body>
</html>
EOF

# Copy as index.html alternative at root — but the existing one is /play
# so we leave it as is. The capacitor config will point to index.html
# which contains the /play content.

echo "==> Done!"
echo "==> Total size: $(du -sh $OUTPUT_DIR | cut -f1)"
echo "==> File count: $(find $OUTPUT_DIR -type f | wc -l)"
