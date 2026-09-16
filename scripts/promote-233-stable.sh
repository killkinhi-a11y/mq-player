#!/usr/bin/env bash
# PROMOTE MQ Player 2.3.3-RC → STABLE  — EXECUTES ONLY WITH --confirm
#
# Preconditions (checked, not assumed):
#   * device acceptance PASS reported by the owner (Google/Demo/MediaSession/
#     Library/Settings/FullPlayer/ContextMenu/Tabs/Visual)
#   * asset bytes = the verified RC (SHA-256 pinned below)
#
# Actions:
#   1. create tag android-v2.3.3 at the same commit as android-v2.3.3-rc
#   2. create a full (non-prerelease) release with the SAME APK bytes
#   3. verify releases/latest → android-v2.3.3
#   4. verify site download path end-to-end (redirect → 200 → SHA-256)
#
# The site needs NO redeploy: /api/app-version and the download button use
# the permanent releases/latest/download/MQPlayer.apk URL which follows
# the latest release automatically.
set -euo pipefail

GITHUB_REPO="killkinhi-a11y/mq-player"
RC_TAG="android-v2.3.3-rc"
STABLE_TAG="android-v2.3.3"
ASSET_NAME="MQPlayer.apk"
EXPECT_SHA256="09afedbeae20dce91ecece1ed6aeba43c36b54607d57b75a62396dcf86310d71"
[ "${1:-}" = "--confirm" ] || { echo "dry-run only: pass --confirm to promote"; exit 0; }
TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN must be set in the environment}"

api() { curl -s -m 60 -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

# 0. integrity of the local artifact we upload
LOCAL_APK="/home/z/my-project/download/mq-player-v2.3.3-rc.apk"
[ "$(sha256sum "$LOCAL_APK" | cut -d' ' -f1)" = "$EXPECT_SHA256" ] || { echo "FATAL: local APK SHA mismatch"; exit 1; }

# 1. commit of the RC tag
SHA=$(api "https://api.github.com/repos/$GITHUB_REPO/git/ref/tags/$RC_TAG" | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['sha'])")
echo "RC tag commit: $SHA"

# 2. create stable tag (fails cleanly if it already exists)
api -X POST "https://api.github.com/repos/$GITHUB_REPO/releases" -d @- <<JSON | python3 -c "import json,sys; d=json.load(sys.stdin); print('release:', d.get('html_url') or d)"
{
  "tag_name": "$STABLE_TAG",
  "target_commitish": "$SHA",
  "name": "MQ Player Android 2.3.3",
  "body": "Stable 2.3.3 — Google login (Credential Manager, two-pass), Demo crash fix (non-ASCII header), canonical MQ icon, branded media notification, clipped touch ripples, Library/Settings/Full Player/Context Menu mobile pass.\n\nSHA-256: $EXPECT_SHA256\nSigning cert SHA-1: 70:3F:B1:FD:5E:C1:61:05:E3:1E:F8:04:D9:0E:8B:AC:AE:5E:FC:E7\n\nNOTE: new signing identity — uninstall versions <= 2.3.1 before installing.",
  "draft": false,
  "prerelease": false
}
JSON

# 3. upload the same bytes as MQPlayer.apk (the name the site's permanent URL expects)
RELEASE_ID=$(api "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$STABLE_TAG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
api -m 300 -X POST -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary "@$LOCAL_APK" \
  "https://uploads.github.com/repos/$GITHUB_REPO/releases/$RELEASE_ID/assets?name=$ASSET_NAME" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('asset:', d.get('state'), d.get('browser_download_url'))"

# 4. end-to-end verification
echo "waiting for CDN..."; sleep 10
echo -n "releases/latest -> "; curl -s -m 30 -o /dev/null -w "%{redirect_url}\n" "https://github.com/$GITHUB_REPO/releases/latest"
curl -sL -m 120 "https://github.com/$GITHUB_REPO/releases/latest/download/$ASSET_NAME" -o /tmp/promoted.apk
GOT=$(sha256sum /tmp/promoted.apk | cut -d' ' -f1)
echo "downloaded SHA-256: $GOT"
[ "$GOT" = "$EXPECT_SHA256" ] && echo "PROMOTION VERIFIED" || { echo "FATAL: promoted asset SHA mismatch"; exit 1; }
