#!/usr/bin/env bash
# MQ Audio Engine — WASM build pipeline.
#
# Builds the two Rust/WASM modules, optimizes them with wasm-opt (binaryen),
# validates the export surface, and installs everything under a
# content-hashed directory in public/audio-engine/ (SW-cache-safe: immutable
# URLs) + a version.json manifest the TS bootstrap reads.
#
# Modules:
#   audio_wasm.wasm  — realtime DSP core (AudioWorklet)
#   codec_wasm.wasm  — Symphonia streaming decoder (Decode Worker)
#
# The built artifacts are COMMITTED to the repo (public/audio-engine/):
# Vercel serves them as static assets — no Rust toolchain in the deploy
# pipeline. version.json is fetched with cache:no-store by the TS bootstrap,
# so JS↔WASM pairing is always consistent (see §35.9/§35.10).
set -euo pipefail

ENGINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIO_CRATES="$ENGINE_ROOT/audio-engine"
PUBLIC_DIR="$ENGINE_ROOT/public/audio-engine"
TARGET_DIR="$AUDIO_CRATES/target/wasm32-unknown-unknown/release"

export PATH="$HOME/.cargo/bin:$HOME/.npm-global/bin:$PATH"

echo "==> Building Rust/WASM audio engine (SIMD enabled)…"
cd "$AUDIO_CRATES"
RUSTFLAGS="-C target-feature=+simd128" \
  cargo build -p audio-wasm -p codec-wasm --release --target wasm32-unknown-unknown

# wasm-opt pass (binaryen): strips DWARF/name sections + size-optimizes.
# Falls back to the raw artifact when binaryen is unavailable.
OPTIMIZE() {
  local src="$1" dst="$2"
  if command -v wasm-opt >/dev/null 2>&1; then
    if wasm-opt -O4 --strip-dwarf --strip-producers "$src" -o "$dst" 2>/dev/null; then
      # Validation: the optimizer must keep the export surface intact.
      return 0
    fi
    echo "    wasm-opt failed — using unoptimized artifact"
  fi
  cp "$src" "$dst"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OPTIMIZE "$TARGET_DIR/audio_wasm.wasm" "$TMP/audio_wasm.wasm"
OPTIMIZE "$TARGET_DIR/codec_wasm.wasm" "$TMP/codec_wasm.wasm"

# Export-surface validation (fail the build on a broken ABI):
node -e "
const fs = require('fs');
(async () => {
  const need = {
    audio_wasm: ['memory','mq_engine_new','mq_engine_drop','mq_cmd','mq_process_out','mq_process_ins','mq_stats','mq_ring_write_available','mq_ring_write_offset','mq_ring_capacity','mq_ring_commit_write','mq_set_eof','mq_is_drained','mq_scratch_ptr','mq_abi_version','mq_version','mq_has_simd'],
    codec_wasm: ['memory','mq_dec_new','mq_dec_drop','mq_dec_push','mq_dec_eof','mq_dec_pop_pcm','mq_dec_reset','mq_dec_started','mq_dec_sample_rate','mq_dec_channels','mq_dec_queued','mq_scratch_ptr','mq_abi_version','mq_version'],
  };
  for (const [name, names] of Object.entries(need)) {
    const mod = await WebAssembly.compile(fs.readFileSync('$TMP/' + name + '.wasm'));
    const have = new Set(WebAssembly.Module.exports(mod).map(e => e.name));
    const missing = names.filter(n => !have.has(n));
    if (missing.length) { console.error(name + ' missing exports: ' + missing.join(',')); process.exit(1); }
  }
  console.log('    export surface OK (core+codec)');
})().catch(e => { console.error(e); process.exit(1); });
"

# Content tag: hashes of ALL FOUR artifacts (wasm × 2 + worklet + worker).
# Any change to any asset → new tag → new immutable URLs (never a stale mix
# of old JS + new WASM under the same URL — §35.10).
HASH_CORE=$(sha256sum "$TMP/audio_wasm.wasm" | cut -c1-8)
HASH_CODEC=$(sha256sum "$TMP/codec_wasm.wasm" | cut -c1-8)
HASH_JS=$(cat "$AUDIO_CRATES/js/mq-audio-worklet.js" "$AUDIO_CRATES/js/mq-decode-worker.js" | sha256sum | cut -c1-8)
TAG="${HASH_CORE:0:6}-${HASH_CODEC:0:6}-${HASH_JS:0:6}"
DEST="$PUBLIC_DIR/$TAG"

echo "==> Installing to $DEST"
mkdir -p "$DEST"
cp "$TMP/audio_wasm.wasm" "$DEST/audio_wasm.wasm"
cp "$TMP/codec_wasm.wasm" "$DEST/codec_wasm.wasm"
cp "$AUDIO_CRATES/js/mq-audio-worklet.js" "$DEST/mq-audio-worklet.js"
cp "$AUDIO_CRATES/js/mq-decode-worker.js" "$DEST/mq-decode-worker.js"

CORE_SIZE=$(stat -c%s "$DEST/audio_wasm.wasm")
CODEC_SIZE=$(stat -c%s "$DEST/codec_wasm.wasm")

# Manifest — single source of truth for the TS bootstrap (no hardcoded URLs
# anywhere in app code → old JS can never pair with new WASM).
cat > "$PUBLIC_DIR/version.json" << EOF
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

# Prune stale build directories (keep the current tag + one previous)
ls -dt "$PUBLIC_DIR"/[0-9a-f]*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf

echo "==> Audio engine build complete: tag=$TAG"
echo "    audio_wasm.wasm: $CORE_SIZE bytes"
echo "    codec_wasm.wasm: $CODEC_SIZE bytes"
