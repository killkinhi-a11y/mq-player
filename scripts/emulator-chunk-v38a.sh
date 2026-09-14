#!/bin/bash
# Chunk v38a — COLD BOOT (no snapshot load, no serial reboot) -> boot_completed
# -> health baseline -> package verify + POST_NOTIFICATIONS grant -> CONSOLE
# SNAPSHOT SAVE "booted" (set_link off first to keep slirp quiescent).
# All state under /tmp/my-project (survives sandbox re-syncs).
MAX=${1:-560}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
AVD=$ANDROID_AVD_HOME/mq35x.avd
STATE=/tmp/my-project/android-runtime/state
OUT=$STATE/chunk-v38a.log
BOOTLOG=$STATE/boot-v38a-emulator.log
HEALTH=$STATE/boot-health.log
mkdir -p $STATE
: > $OUT
echo "=== chunk v38a COLD BOOT + SAVE started $(date -u +%H:%M:%SZ) ===" >> $OUT

# preflight: no stale qemu, qcow2 present, disk space
pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { echo "EMULATOR STILL ALIVE - ABORT" >> $OUT; exit 9; }
ls -la $AVD/userdata-qemu.img.qcow2 >> $OUT 2>&1
df -h /tmp | tail -1 >> $OUT

$ADB kill-server 2>/dev/null
$ADB start-server >/dev/null 2>&1

T0=$(date +%s)
timeout -s KILL $((MAX + 20)) $SDK/emulator/emulator -avd mq35x \
  -no-snapshot-load -no-accel -no-window -no-boot-anim \
  -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -shell-serial tcp::4444,server,nowait \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $BOOTLOG 2>&1 &
EMUPID=$!

# wait for monitor socket, then bring the network link UP (was saved off)
for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 /tmp/my-project/scripts/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1

# boot wait: poll adb -> device -> sys.boot_completed, log health every poll
BOOTED=0
: > $HEALTH
i=0
while [ $(( $(date +%s) - T0 )) -lt $((MAX - 60)) ]; do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    B=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
    echo "t=$(( $(date +%s) - T0 ))s adb=device boot=$B system_server=${SS:-none}" >> $HEALTH
    [ "$B" = "1" ] && { BOOTED=1; break; }
  else
    echo "t=$(( $(date +%s) - T0 ))s adb=${SA:-none}" >> $HEALTH
  fi
  i=$((i+1))
  sleep 6
done
echo "boot_completed=$BOOTED at $(( $(date +%s) - T0 ))s" >> $OUT
echo "boot_completed=$BOOTED at $(( $(date +%s) - T0 ))s" >> $HEALTH

if [ "$BOOTED" != "1" ]; then
  echo "BOOT TIMEOUT - no snapshot saved (honest)" >> $OUT
  kill -9 $EMUPID 2>/dev/null
  pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
  pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
  { date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v38a: BOOT_TIMEOUT booted=0 saved=0 elapsed=$(( $(date +%s) - T0 ))s"; } > $STATE/last_checkpoint.txt
  exit 3
fi

# device verification (Phase 3 evidence)
$ADB root >/dev/null 2>&1
for i in $(seq 1 8); do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "device" ] && break; sleep 3
done
{
  echo "--- getprops ---"
  $ADB shell getprop sys.boot_completed
  $ADB shell getprop ro.build.version.release
  $ADB shell getprop ro.product.cpu.abi
  $ADB shell getprop ro.build.version.sdk
  echo "--- package ---"
  $ADB shell pm list packages com.mq1.player
  echo "--- health ---"
  $ADB shell pidof system_server
} > $STATE/device-baseline.txt 2>&1
$ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
echo "grant issued at $(( $(date +%s) - T0 ))s" >> $OUT

# CONSOLE SNAPSHOT SAVE "booted"
AUTH=$(cat ~/.emulator_console_auth_token 2>/dev/null)
SAVED=0
if [ -n "$AUTH" ]; then
  python3 /tmp/my-project/scripts/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 off" >> $OUT 2>&1
  {
    exec 4<>/dev/tcp/127.0.0.1/5554
    printf 'auth %s\n' "$AUTH" >&4
    sleep 1
    printf 'avd snapshot save booted\n' >&4
    timeout 45 cat <&4
    exec 4<&-
  } > $STATE/console-save.log 2>&1
  # verify: ram.bin exists and stops growing (save completed)
  for i in $(seq 1 30); do
    [ -s $AVD/snapshots/booted/ram.bin ] && break
    sleep 2
  done
  if [ -s $AVD/snapshots/booted/ram.bin ]; then
    SZ1=1; SZ2=0
    while [ "$SZ1" != "$SZ2" ] && [ $(( $(date +%s) - T0 )) -lt $((MAX + 10)) ]; do
      SZ1=$(stat -c %s $AVD/snapshots/booted/ram.bin 2>/dev/null || echo 0)
      sleep 3
      SZ2=$(stat -c %s $AVD/snapshots/booted/ram.bin 2>/dev/null || echo 0)
    done
    [ "$SZ1" = "$SZ2" ] && [ "$SZ1" -gt 100000000 ] && SAVED=1
  fi
fi
echo "snapshot booted saved=$SAVED at $(( $(date +%s) - T0 ))s" >> $OUT
ls -la $AVD/snapshots/booted/ >> $OUT 2>&1

kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 2

{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v38a: booted=1 saved=$SAVED elapsed=$(( $(date +%s) - T0 ))s"; } > $STATE/last_checkpoint.txt
echo "CHUNK v38a RESULT: booted=1 snapshot_saved=$SAVED elapsed=$(( $(date +%s) - T0 ))s"
echo "--- baseline ---"; head -20 $STATE/device-baseline.txt
echo "--- console-save tail ---"; tail -6 $STATE/console-save.log 2>/dev/null
tail -12 $OUT