#!/bin/bash
# Robust Temurin 21 download (resume + retries) then extract to /home/z/jdk-21
set -e
BASE=/home/z
JDK_DIR=$BASE/jdk-21
TARBALL=$BASE/.toolcache/temurin21.tar.gz
URL="https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir -p $BASE/.toolcache
for attempt in 1 2 3 4 5 6 7 8; do
  echo "[try $attempt] downloading/resuming Temurin 21..."
  curl -L -C - --retry 3 --retry-delay 2 -o "$TARBALL" "$URL" && break
  sleep 3
done
# verify it's a complete gzip (tar -tzf succeeds)
tar -tzf "$TARBALL" > /dev/null
rm -rf "$JDK_DIR"
mkdir -p "$JDK_DIR"
tar -xzf "$TARBALL" -C "$JDK_DIR" --strip-components=1
"$JDK_DIR/bin/javac" -version
echo "JDK OK: $JDK_DIR"
