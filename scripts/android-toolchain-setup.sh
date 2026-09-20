#!/bin/bash
# Android toolchain setup (idempotent): Temurin JDK 21 + Android SDK
# (cmdline-tools, platform-35, build-tools 35.0.0). Re-run safe.
set -e
BASE=/home/z
JDK_DIR=/home/z/jdk-21
SDK_DIR=$BASE/android-sdk

# ── 1. Temurin JDK 21 (system JRE lacks javac) ─────────────────────────────
if [ ! -x "$JDK_DIR/bin/javac" ]; then
  echo "[jdk] downloading Temurin 21…"
  mkdir -p $BASE/.toolcache
  curl -sL -o $BASE/.toolcache/temurin21.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  rm -rf $JDK_DIR
  mkdir -p $JDK_DIR
  tar -xzf $BASE/.toolcache/temurin21.tar.gz -C $JDK_DIR --strip-components=1
fi
$JDK_DIR/bin/javac -version

# ── 2. Android SDK cmdline-tools ───────────────────────────────────────────
CT=$SDK_DIR/cmdline-tools/latest
if [ ! -x "$CT/bin/sdkmanager" ]; then
  echo "[sdk] downloading cmdline-tools…"
  mkdir -p $SDK_DIR/cmdline-tools
  curl -sL -o $SDK_DIR/ct.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  rm -rf $CT
  mkdir -p $CT
  unzip -q $SDK_DIR/ct.zip -d $SDK_DIR/cmdline-tools-tmp
  mv $SDK_DIR/cmdline-tools-tmp/cmdline-tools/* $CT/
  rm -rf $SDK_DIR/cmdline-tools-tmp $SDK_DIR/ct.zip
fi

export JAVA_HOME=$JDK_DIR
export ANDROID_HOME=$SDK_DIR

# ── 3. Licenses + packages ─────────────────────────────────────────────────
yes | $CT/bin/sdkmanager --licenses > /dev/null 2>&1 || true
$CT/bin/sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools" > /dev/null
echo "[sdk] installed: $(ls $SDK_DIR/platforms) / $(ls $SDK_DIR/build-tools)"

# ── 4. local.properties for the project ────────────────────────────────────
echo "sdk.dir=$SDK_DIR" > /home/z/my-project/android/local.properties
echo "TOOLCHAIN OK: JDK=$JDK_DIR SDK=$SDK_DIR"
