#!/usr/bin/env bash
# Rebuild the audio-engine public asset tag after a JS-only change (worker/
# worklet). The wasm binaries are copied from the current tag unchanged —
# no Rust toolchain needed. The tag follows build-audio-engine.sh's formula:
#   tag = core[0:6]-codec[0:6]-js[0:6]  (sha256 of the 4 artifacts)
set -euo pipefail
cd /home/z/my-project/mq-player

SRC_JS=audio-engine/js
PUB=public/audio-engine
OLD_TAG=$(python3 -c "import json;print(json.load(open('$PUB/version.json'))['tag'])")
OLD_DIR="$PUB/$OLD_TAG"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$OLD_DIR/audio_wasm.wasm" "$TMP/audio_wasm.wasm"
cp "$OLD_DIR/codec_wasm.wasm" "$TMP/codec_wasm.wasm"
cp "$SRC_JS/mq-audio-worklet.js" "$TMP/mq-audio-worklet.js"
cp "$SRC_JS/mq-decode-worker.js" "$TMP/mq-decode-worker.js"

HASH_CORE=$(sha256sum "$TMP/audio_wasm.wasm" | cut -c1-8)
HASH_CODEC=$(sha256sum "$TMP/codec_wasm.wasm" | cut -c1-8)
HASH_JS=$(cat "$TMP/mq-audio-worklet.js" "$TMP/mq-decode-worker.js" | sha256sum | cut -c1-8)
TAG="${HASH_CORE:0:6}-${HASH_CODEC:0:6}-${HASH_JS:0:6}"

if [ -d "$PUB/$TAG" ]; then
  echo "tag $TAG already exists — refreshing files"
fi
DEST="$PUB/$TAG"
mkdir -p "$DEST"
cp "$TMP/audio_wasm.wasm" "$DEST/audio_wasm.wasm"
cp "$TMP/codec_wasm.wasm" "$DEST/codec_wasm.wasm"
cp "$SRC_JS/mq-audio-worklet.js" "$DEST/mq-audio-worklet.js"
cp "$SRC_JS/mq-decode-worker.js" "$DEST/mq-decode-worker.js"

CORE_SIZE=$(stat -c%s "$DEST/audio_wasm.wasm")
CODEC_SIZE=$(stat -c%s "$DEST/codec_wasm.wasm")

cat > "$PUB/version.json" << EOF
{
  "tag": "$TAG",
  "core": "audio_wasm.wasm",
  "codec": "codec_wasm.wasm",
  "worklet": "mq-audio-worklet.js",
  "worker": "mq-decode-worker.js",
  "coreBytes": $CORE_SIZE,
  "codecBytes": $CODEC_SIZE,
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "simd": true
}
EOF

# keep old tag dir (one previous) + new
ls -dt "$PUB"/[0-9a-f]*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf
echo "new tag: $TAG (old: $OLD_TAG)"
