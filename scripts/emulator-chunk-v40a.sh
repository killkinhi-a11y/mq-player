#!/bin/bash
# Chunk v40a — LOGIN COORDINATE DISCOVERY (clean cold boot, settle, launch,
# scroll, screencap + dump). NO TAP in this chunk.
# Root causes handled:
#  - networkstack TetheringService ANR (>20s under TCG+contention) killed
#    system_server via "Lost network stack" cascade at app-launch +45s (v39)
#    and +60s (03:52 run). FIX: settle 130s after boot_completed BEFORE
#    launching the app + device_config service_timeout insurance.
#  - adb root REQUIRED for /dev/input evdev blob writes (v39 missed it).
#  - screenshots: retry + guest-side fallback (empty PNGs when gfx unhappy).
MAX=${1:-575}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/tmp/my-project/scripts
OUT=$STATE/chunk-v40a.log
HEALTH=$STATE/health-v40a.log
mkdir -p $STATE
: > $OUT
echo "=== chunk v40a LOGIN DISCOVERY $(date -u +%H:%M:%SZ) ===" >> $OUT

pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { echo "EMULATOR STILL ALIVE - ABORT" >> $OUT; exit 9; }
rm -f $STATE/qemu-mon.sock

$ADB kill-server 2>/dev/null
$ADB start-server >/dev/null 2>&1

T0=$(date +%s)
EL() { echo $(( $(date +%s) - T0 )); }
timeout -s KILL $((MAX + 15)) $SDK/emulator/emulator -avd mq35x \
  -no-snapshot-load -no-snapshot-save -no-accel -no-window -no-boot-anim \
  -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -shell-serial tcp::4444,server,nowait \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v40a-emulator.log 2>&1 &
EMUPID=$!

for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
# network stays OFF for the demo chunks (no slirp churn; app does not need
# network on the login screen; requests fail instantly instead of hanging)
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 off" >> $OUT 2>&1

BOOTED=0
ROOTED=0
: > $HEALTH
while [ $(EL) -lt 470 ]; do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    B=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$B" = "1" ] && { BOOTED=1; break; }
    if [ "$ROOTED" = "0" ]; then
      $ADB root >/dev/null 2>&1 && ROOTED=1
    fi
  fi
  echo "t=$(EL)s adb=${SA:-none} boot=${B:-no}" >> $HEALTH
  sleep 6
done
echo "boot_completed=$BOOTED at $(EL)s (rooted=$ROOTED)" >> $OUT
[ "$BOOTED" != "1" ] && { echo "BOOT TIMEOUT" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"; { date -u +%FT%TZ; echo "v40a: BOOT_TIMEOUT"; } > $STATE/last_checkpoint.txt; exit 3; }

# re-root after boot (adbd restarts)
$ADB root >/dev/null 2>&1
for i in $(seq 1 8); do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "device" ] && break; sleep 3
done
# insurance: extend service ANR timeout (protects networkstack under TCG)
$ADB shell device_config put activity_manager service_timeout 120000 >/dev/null 2>&1
$ADB shell device_config put activity_manager service_foreground_timeout 180000 >/dev/null 2>&1
$ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
echo "root+config+grant at $(EL)s" >> $OUT

# ---- gesture blobs (tap for dialog ALLOW just in case + scroll) ----
python3 $S/evdev_blobs.py tap $STATE/blob-allow 160 351 >> $OUT 2>&1
python3 $S/evdev_blobs.py swipe $STATE/blob-scroll 160 540 380 6 >> $OUT 2>&1
$ADB push $STATE/blob-allow-p0.bin /data/local/tmp/b0.bin >/dev/null 2>&1
$ADB push $STATE/blob-allow-p1.bin /data/local/tmp/b1.bin >/dev/null 2>&1
i=0
for f in $STATE/blob-scroll-p*.bin; do i=$((i+1)); $ADB push $f /data/local/tmp/s$i.bin >/dev/null 2>&1; done
NSCROLL=$i
$ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
$ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
blobtap() { for b in "$@"; do
    $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in b0*|d0*) sleep 0.08;; *) sleep 0.03;; esac
  done; }

shot() { local G=${2:-gshot.png}; local ok=0
  for t in 1 2 3; do
    $ADB exec-out screencap -p > $1 2>/dev/null
    [ $(stat -c %s $1 2>/dev/null || echo 0) -gt 3000 ] && { ok=1; break; }
    sleep 4
  done
  if [ "$ok" != "1" ]; then
    $ADB shell screencap -p /data/local/tmp/$G >/dev/null 2>&1
    sleep 2
    $ADB pull /data/local/tmp/$G $1 >/dev/null 2>&1
  fi
  [ $(stat -c %s $1 2>/dev/null || echo 0) -gt 3000 ] || echo "  SHOT FAILED: $1" >> $OUT
}
bright() { python3 -c "
from PIL import Image
try:
    im = Image.open('$1').convert('RGB'); w,h = im.size; px = im.load()
    tot=n=0
    for y in range($2, min($3,h)):
        for x in range(0, w, 8): tot += sum(px[x,y]); n += 3
    print(f'{tot/n:.0f}')
except Exception: print('ERR')" 2>/dev/null; }

# ---- SETTLE: 130s of quiet (networkstack ANR window must pass, no app) ----
SEST0=$(EL)
while [ $(( $(EL) - SEST0 )) -lt 130 ]; do
  sleep 10
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  NS=$($ADB shell pidof com.android.networkstack.process 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s settle: system_server=${SS:-DEAD} networkstack=${NS:-none}" >> $HEALTH
  [ -z "$SS" ] && { echo "SYSTEM DIED DURING SETTLE at $(EL)s" >> $OUT; break; }
done
echo "settle done at $(EL)s" >> $OUT
SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
[ -z "$SS" ] && { echo "SYSTEM DEAD - ABORT" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; { date -u +%FT%TZ; echo "v40a: SYSTEM_DIED_IN_SETTLE"; } > $STATE/last_checkpoint.txt; exit 5; }

# ---- LAUNCH ----
$ADB logcat -c 2>/dev/null
$ADB shell am start --user 0 -n com.mq1.player/.MainActivity >> $OUT 2>&1
APP_PID=""
for i in $(seq 1 12); do
  sleep 6
  APP_PID=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "app_pid=${APP_PID:-NONE} at $(EL)s" >> $OUT
[ -z "$APP_PID" ] && { $ADB logcat -d -v time > $STATE/logcat-startup-fail.txt 2>/dev/null; echo "APP DID NOT START" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"; { date -u +%FT%TZ; echo "v40a: APP_NO_START"; } > $STATE/last_checkpoint.txt; exit 4; }

# health watch for 45s post-launch (survival proof) + render
LNT0=$(EL)
while [ $(( $(EL) - LNT0 )) -lt 45 ]; do
  sleep 15
  P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s post-launch: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
done
SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
[ -z "$SS" ] && { echo "SYSTEM DIED POST-LAUNCH" >> $OUT; $ADB logcat -d -v time > $STATE/logcat-envdeath.txt 2>/dev/null; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; { date -u +%FT%TZ; echo "v40a: SYSTEM_DIED_POST_LAUNCH"; } > $STATE/last_checkpoint.txt; exit 6; }
echo "app survived 45s; system alive at $(EL)s" >> $OUT

# ---- dialog check ----
shot $STATE/scr-launch.png
DB=$(bright $STATE/scr-launch.png 220 440)
echo "t=$(EL)s dialog-band=$DB" >> $OUT
if [ "${DB:-0}" -ge 150 ] 2>/dev/null; then
  echo "dialog PRESENT - blob ALLOW" >> $OUT
  blobtap b0.bin b1.bin
  sleep 8
  shot $STATE/scr-postdialog.png
  echo "post-dismiss band=$(bright $STATE/scr-postdialog.png 220 440)" >> $OUT
fi

# ---- SCROLL UP to reveal the footer ----
SCROLL_ARGS=""
for j in $(seq 0 $NSCROLL); do SCROLL_ARGS="$SCROLL_ARGS s$j.bin"; done
blobtap $SCROLL_ARGS
sleep 6
shot $STATE/scrolled-1.png
python3 $S/find_text.py $STATE/scrolled-1.png 400 640 > $STATE/footer-bands.txt 2>/dev/null
echo "--- footer bands ---" >> $OUT; cat $STATE/footer-bands.txt >> $OUT

# ---- fresh uiautomator dump (post-scroll, exact bounds) ----
$ADB shell rm -f /data/local/tmp/ui.xml 2>/dev/null; rm -f $STATE/ui-v40a.xml
$ADB shell uiautomator dump /data/local/tmp/ui.xml >/dev/null 2>&1
sleep 3
$ADB pull /data/local/tmp/ui.xml $STATE/ui-v40a.xml >/dev/null 2>&1
[ -s $STATE/ui-v40a.xml ] && echo "dump ok ($(wc -c < $STATE/ui-v40a.xml)B)" >> $OUT || echo "dump failed" >> $OUT

# ---- evidence + end (NO TAP in this chunk) ----
$ADB logcat -d -v time > $STATE/logcat-v40a.txt 2>/dev/null
shot $STATE/final-state.png
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 1
{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v40a: discovery done app=${APP_PID} elapsed=$(EL)s"; } > $STATE/last_checkpoint.txt
echo "**** v40a DISCOVERY DONE at $(EL)s ****"
echo "--- footer bands ---"; cat $STATE/footer-bands.txt 2>/dev/null
rg -o 'text="[^"]*"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' $STATE/ui-v40a.xml 2>/dev/null | head -25
tail -14 $OUT