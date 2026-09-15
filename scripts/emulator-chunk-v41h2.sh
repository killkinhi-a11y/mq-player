#!/bin/bash
# ============================================================================
# chunk v41h2 — WIPE-DATA RECOVERY BOOT (no test; infrastructure repair)
# Two consecutive mid-boot guest deaths (dirty ext4 journal from unclean
# tool-timeout kills) poisoned the userdata cycle. Fix: -wipe-data (fresh
# userdata + encryptionkey via the emulator's own creation path), then a
# full boot + GRACEFUL shutdown so the NEXT boot starts from a clean
# journal. The app (fixed 2.3.2) gets installed in the NEXT chunk.
# ============================================================================
MAX=${1:-590}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/home/z/my-project/scripts
OUT=$STATE/chunk-v41h2.log
HEALTH=$STATE/health-v41.log
mkdir -p $STATE
: > $OUT; : > $HEALTH
echo "=== v41h2 WIPE BOOT $(date -u +%FT%TZ) ===" >> $OUT
progress() { echo "[$(date -u +%H:%M:%S)] $*"; echo "[$(date -u +%H:%M:%S)] $*" >> $OUT; }
pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { progress "EMULATOR STILL ALIVE - ABORT"; exit 9; }
rm -f $STATE/qemu-mon.sock
$ADB kill-server 2>/dev/null; $ADB start-server >/dev/null 2>&1

T0=$(date +%s)
EL() { echo $(( $(date +%s) - T0 )); }

timeout -s KILL $((MAX + 5)) $SDK/emulator/emulator -avd mq35x \
  -wipe-data -no-snapshot -no-accel -no-window -no-boot-anim \
  -no-audio -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -qemu -m 2048 -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v41h2-emulator.log 2>&1 &
EMUPID=$!
for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1
progress "wipe-data emulator started (pid $EMUPID), link ON"

BOOTED=0; ROOTED=0
while [ $(EL) -lt 545 ]; do
  SA=$(timeout 10 $ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && timeout 5 $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    if [ "$ROOTED" = "0" ]; then timeout 10 $ADB root >/dev/null 2>&1 && ROOTED=1; fi
    B=$(timeout 10 $ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$B" = "1" ] && { BOOTED=1; break; }
  fi
  QRSS=$(ps -o rss= -p $(pgrep -f "qemu-system.*mq35x" | head -1) 2>/dev/null | tr -d ' ')
  echo "t=$(EL)s adb=${SA:-none} rooted=$ROOTED qemu_rss=$(( ${QRSS:-0} / 1024 ))MB" >> $HEALTH
  sleep 4
done
progress "boot_completed=$BOOTED at t=$(EL)s"
if [ "$BOOTED" != "1" ]; then
  # log as much as we can before dying
  SA=$(timeout 10 $ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "device" ] && timeout 25 $ADB logcat -d -b all -v time > $STATE/logcat-wipeboot-fail.txt 2>/dev/null
  echo "v41h2: WIPE BOOT FAILED (no boot_completed by $(EL)s, adb=$SA)" > $STATE/last_checkpoint.txt
  timeout 20 $ADB emu kill >/dev/null 2>&1
  for i in $(seq 1 8); do kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: WIPE BOOT FAILED"
  exit 3
fi

SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
progress "booted fresh userdata: system_server=${SS:-?} qemu_rss monitored"
P1=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
echo "t=$(EL)s post-settle ss=${P1:-DEAD}" >> $HEALTH
PKG=$(timeout 15 $ADB shell pm list packages 2>/dev/null | wc -l)
echo "t=$(EL)s packages=$PKG" >> $HEALTH

# GRACEFUL shutdown — clean journal for the next boot
progress "graceful shutdown (adb emu kill)"
timeout 25 $ADB emu kill >/dev/null 2>&1
for i in $(seq 1 10); do kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
$ADB kill-server 2>/dev/null
echo "v41h2: WIPE BOOT SUCCESS ss=${P1:-DEAD} packages=$PKG clean-shutdown=attempted" > $STATE/last_checkpoint.txt
progress "v41h2 COMPLETE: fresh userdata booted + graceful shutdown"
echo "================ WIPE BOOT SUCCESS ================"
echo "system_server=${P1:-DEAD} packages=$PKG elapsed=$(EL)s"
exit 0
