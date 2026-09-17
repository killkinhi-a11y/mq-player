#!/usr/bin/env bash
# PROMOTE MQ Player 2.3.4-RC → SITE DOWNLOAD  — EXECUTES ONLY WITH --confirm
#
# Preconditions (checked, not assumed):
#   * owner's explicit order to deploy this version to the site
#     (device acceptance for 2.3.4 still pending — run sheet applies)
#   * asset bytes = the verified 2.3.4 RC (SHA-256 pinned below, matches
#     the apksigner-verified assembleRelease artifact from ux-pass-234)
#
# Actions:
#   1. create tag android-v2.3.4 at the same commit as android-v2.3.4-rc
#   2. create a full (non-prerelease) release with the SAME APK bytes
#      under the site asset name MQPlayer.apk
#   3. verify releases/latest → android-v2.3.4
#   4. verify site download path end-to-end (redirect → 200 → SHA-256)
#
# The site needs NO redeploy: /api/app-version and the download button use
# the permanent releases/latest/download/MQPlayer.apk URL which follows
# the latest release automatically.
set -euo pipefail

GITHUB_REPO="killkinhi-a11y/mq-player"
RC_TAG="android-v2.3.4-rc"
STABLE_TAG="android-v2.3.4"
ASSET_NAME="MQPlayer.apk"
EXPECT_SHA256="885c1bac1e4cbb1c9d50aefd647815e9d394b99c9cca67a5b8ee675544b0b886"
[ "${1:-}" = "--confirm" ] || { echo "dry-run only: pass --confirm to promote"; exit 0; }
TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN must be set in the environment}"

api() { curl -s -m 60 -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

# 0. integrity of the local artifact we upload
LOCAL_APK="/home/z/my-project/download/mq-player-v2.3.4-rc.apk"
[ "$(sha256sum "$LOCAL_APK" | cut -d' ' -f1)" = "$EXPECT_SHA256" ] || { echo "FATAL: local APK SHA mismatch"; exit 1; }

# 0b. the RC release asset on GitHub must be the same bytes (round-trip check)
RC_ASSET_URL=$(api "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$RC_TAG" | python3 -c "
import json,sys
rel=json.load(sys.stdin)
print(rel['assets'][0]['browser_download_url']) if rel.get('assets') else sys.exit(1)")
curl -sL -m 120 "$RC_ASSET_URL" -o /tmp/rc-check-234.apk
RC_GOT=$(sha256sum /tmp/rc-check-234.apk | cut -d' ' -f1)
rm -f /tmp/rc-check-234.apk
[ "$RC_GOT" = "$EXPECT_SHA256" ] || { echo "FATAL: RC release asset on GitHub SHA mismatch ($RC_GOT)"; exit 1; }
echo "RC release asset verified: same bytes as local artifact"

# 1. commit of the RC tag — handles BOTH tag kinds:
#    annotated: /git/ref returns the TAG object sha -> dereference /git/tags/{sha}
#    lightweight: /git/ref returns the COMMIT sha directly
TAG_INFO=$(api "https://api.github.com/repos/$GITHUB_REPO/git/ref/tags/$RC_TAG")
TAG_TYPE=$(printf '%s' "$TAG_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['type'])")
TAG_SHA=$(printf '%s' "$TAG_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['sha'])")
if [ "$TAG_TYPE" = "tag" ]; then
  SHA=$(api "https://api.github.com/repos/$GITHUB_REPO/git/tags/$TAG_SHA" | python3 -c "import json,sys; d=json.load(sys.stdin)['object']; print(d['sha'] if d['type']=='commit' else '')")
else
  SHA="$TAG_SHA"
fi
[ -n "$SHA" ] || { echo "FATAL: could not resolve RC tag to a commit"; exit 1; }
echo "RC tag type: $TAG_TYPE, commit: $SHA"

# 2. create stable release (fails cleanly if the tag/release already exists)
RESP=$(mktemp); STATUS=$(curl -s -m 120 -o "$RESP" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -X POST "https://api.github.com/repos/$GITHUB_REPO/releases" -d @- <<JSON
{
  "tag_name": "$STABLE_TAG",
  "target_commitish": "$SHA",
  "name": "MQ Player Android 2.3.4",
  "body": "Stable 2.3.4 — mobile UX / visual quality pass (web mobile = source of truth):\n\n- context-menu grabber fix + mini player and dock now stay visible on every screen\n- long-press opens the track menu; queue sheet closes on pick; history seeks the existing queue entry\n- Settings: on-screen back, state survives tab switches, real sort dropdown\n- Full Player web parity: 28/800 title, times above the bar, 56/76 transport, artwork r20\n- square ripples clipped, touch targets >= 36-48dp, Full Player empty state\n\nSHA-256: $EXPECT_SHA256\nSigning cert SHA-1: 70:3F:B1:FD:5E:C1:61:05:E3:1E:F8:04:D9:0E:8B:AC:AE:5E:FC:E7 (unchanged — installs over 2.3.3).",
  "draft": false,
  "prerelease": false
}
JSON
)
echo "release create: HTTP $STATUS"
if [ "$STATUS" != "201" ]; then python3 -c "import json; d=json.load(open('$RESP')); print('  already-exists?' if d.get('errors') and 'already_exists' in str(d) else '  body:', str(d)[:400])"; fi
[ "$STATUS" = "201" ] || [ "$STATUS" = "422" ] || { python3 -c "print(open('$RESP').read()[:400])"; rm -f "$RESP"; echo "FATAL: release creation failed"; exit 1; }
rm -f "$RESP"

# 3. upload the same bytes as MQPlayer.apk (the name the site's permanent URL expects)
RELEASE_ID=$(api "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$STABLE_TAG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
api -m 300 -X POST -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary "@$LOCAL_APK" \
  "https://uploads.github.com/repos/$GITHUB_REPO/releases/$RELEASE_ID/assets?name=$ASSET_NAME" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('asset:', d.get('state'), d.get('browser_download_url'))"

# 4. end-to-end verification
echo "waiting for CDN..."; sleep 10
echo -n "releases/latest -> "; curl -s -m 30 -o /dev/null -w "%{redirect_url}\n" "https://github.com/$GITHUB_REPO/releases/latest"
curl -sL -m 120 "https://github.com/$GITHUB_REPO/releases/latest/download/$ASSET_NAME" -o /tmp/promoted-234.apk
GOT=$(sha256sum /tmp/promoted-234.apk | cut -d' ' -f1)
echo "downloaded SHA-256: $GOT"
[ "$GOT" = "$EXPECT_SHA256" ] && echo "PROMOTION VERIFIED" || { echo "FATAL: promoted asset SHA mismatch"; exit 1; }
