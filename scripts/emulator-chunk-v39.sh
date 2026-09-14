#!/bin/bash
# Chunk v39 — DEMO TEST, clean COLD BOOT (no snapshot load/save at all —
# snapshot loading is broken in this sandbox: non-ext4 rootfs disables
# QuickbootFileBacked => vmstate 'ram' section mismatch; a failed load also
# poisons the gfx pipeline => empty screencaps. v38b-run1 proved both).
# Timeline target: boot<=365 health<=385 blobs<=395 launch+pid<=460
# render<=485 shots+dialog<=515 scroll+coords<=540 TAP watch<=585 capture<=598
MAX=${1:-575}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/tmp/my-project/scripts
OUT=$STATE/chunk-v39.log
HEALTH=$STATE/health-v39.log
mkdir -p $STATE
: > $OUT
echo "=== chunk v39 DEMO TEST (clean cold boot) $(date -u +%H:%M:%SZ) ===" >> $OUT

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
  > $STATE/boot-v39-emulator.log 2>&1 &
EMUPID=$!

for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1

# ---- boot wait (health logged inline) ----
BOOTED=0
: > $HEALTH
while [ $(EL) -lt 470 ]; do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    B=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
    echo "t=$(EL)s adb=device boot=$B system_server=${SS:-none}" >> $HEALTH
    [ "$B" = "1" ] && { BOOTED=1; break; }
  else
    echo "t=$(EL)s adb=${SA:-none}" >> $HEALTH
  fi
  sleep 6
done
echo "boot_completed=$BOOTED at $(EL)s" >> $OUT
[ "$BOOTED" != "1" ] && { echo "BOOT TIMEOUT" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"; { date -u +%FT%TZ; echo "v39: BOOT_TIMEOUT"; } > $STATE/last_checkpoint.txt; exit 3; }

# ---- PHASE 1: quick health baseline ----
{
  echo "sys.boot_completed=$($ADB shell getprop sys.boot_completed | tr -d '\r')"
  echo "ro.build.version.release=$($ADB shell getprop ro.build.version.release | tr -d '\r')"
  echo "ro.product.cpu.abi=$($ADB shell getprop ro.product.cpu.abi | tr -d '\r')"
  echo "ro.build.version.sdk=$($ADB shell getprop ro.build.version.sdk | tr -d '\r')"
  echo "package=$($ADB shell pm list packages com.mq1.player | tr -d '\r')"
  echo "versionCode=$($ADB shell dumpsys package com.mq1.player 2>/dev/null | grep -m1 versionCode | tr -d '\r')"
  echo "system_server=$($ADB shell pidof system_server | tr -d '\r')"
} > $STATE/device-baseline.txt 2>&1
echo "PHASE1 done at $(EL)s" >> $OUT

# ---- gesture blobs ----
python3 $S/evdev_blobs.py tap $STATE/blob-allow 160 351 >> $OUT 2>&1
python3 $S/evdev_blobs.py swipe $STATE/blob-scroll 160 540 380 6 >> $OUT 2>&1
$ADB push $STATE/blob-allow-p0.bin /data/local/tmp/b0.bin >/dev/null 2>&1
$ADB push $STATE/blob-allow-p1.bin /data/local/tmp/b1.bin >/dev/null 2>&1
i=0
for f in $STATE/blob-scroll-p*.bin; do i=$((i+1)); $ADB push $f /data/local/tmp/s$i.bin >/dev/null 2>&1; done
NSCROLL=$i
$ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
$ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
echo "blobs ready at $(EL)s" >> $OUT

blobtap() { for b in "$@"; do
    $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in b0*|d0*) sleep 0.08;; *) sleep 0.03;; esac
  done; }

# ---- screenshot helper: retry + guest-side fallback, verify non-trivial size ----
shot() {  # $1 = host path, $2 = guest name
  local G=${2:-gshot.png}; local ok=0
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
  [ $(stat -c %s $1 2>/dev/null || echo 0) -gt 3000 ] || echo "  SHOT FAILED: $1 ($(stat -c %s $1 2>/dev/null || echo 0)B)" >> $OUT
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

# ---- launch app ----
$ADB logcat -c 2>/dev/null
$ADB shell am start --user 0 -n com.mq1.player/.MainActivity >> $OUT 2>&1
APP_PID=""
for i in $(seq 1 14); do
  sleep 6
  APP_PID=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "app_pid=${APP_PID:-NONE} at $(EL)s" >> $OUT
[ -z "$APP_PID" ] && { $ADB logcat -d -v time > $STATE/logcat-startup-fail.txt 2>/dev/null; echo "APP DID NOT START" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; { date -u +%FT%TZ; echo "v39: APP_NO_START"; } > $STATE/last_checkpoint.txt; exit 4; }
sleep 24

# ---- launch screenshot + dialog check ----
shot $STATE/scr-launch.png
DB=$(bright $STATE/scr-launch.png 220 440)
echo "t=$(EL)s launch: dialog-band=$DB" >> $OUT
if [ "${DB:-0}" -ge 150 ] 2>/dev/null; then
  echo "dialog PRESENT - blob ALLOW" >> $OUT
  blobtap b0.bin b1.bin; sleep 8
  shot $STATE/scr-postdialog.png
  echo "post-dismiss band=$(bright $STATE/scr-postdialog.png 220 440)" >> $OUT
fi
SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r'); echo "t=$(EL)s system_server=$SS" >> $OUT

# ---- SCROLL UP ----
SCROLL_ARGS=""
for j in $(seq 0 $NSCROLL); do SCROLL_ARGS="$SCROLL_ARGS s$j.bin"; done
blobtap $SCROLL_ARGS
sleep 6
shot $STATE/scrolled-1.png
python3 $S/find_text.py $STATE/scrolled-1.png 420 640 > $STATE/footer-bands.txt 2>/dev/null
echo "--- footer bands ---" >> $OUT; cat $STATE/footer-bands.txt >> $OUT

# ---- Демо coordinates: pixel analysis (dump post-hoc) ----
DEMO_X=""; DEMO_Y=""
COORD=$(python3 -c "
import re
best=None
for ln in open('$STATE/footer-bands.txt'):
    m = re.match(r'y\[(\d+)\.\.(\d+)\] h=\d+: (.*)', ln.strip())
    if not m: continue
    y1,y2,rest = int(m.group(1)), int(m.group(2)), m.group(3)
    cxs = [int(x) for x in re.findall(r'cx=(\d+)', rest)]
    left = [c for c in cxs if c < 150]; right = [c for c in cxs if c >= 150]
    if left and right and y2 > 500:
        cy=(y1+y2)//2; cx=sum(left)//len(left); best=(cx,cy)
if best: print(f'{best[0]} {best[1]}')
" 2>/dev/null)
if [ -z "$COORD" ]; then
  blobtap $SCROLL_ARGS
  sleep 6
  shot $STATE/scrolled-2.png
  python3 $S/find_text.py $STATE/scrolled-2.png 420 640 > $STATE/footer-bands2.txt 2>/dev/null
  COORD=$(python3 -c "
import re
best=None
for ln in open('$STATE/footer-bands2.txt'):
    m = re.match(r'y\[(\d+)\.\.(\d+)\] h=\d+: (.*)', ln.strip())
    if not m: continue
    y1,y2,rest = int(m.group(1)), int(m.group(2)), m.group(3)
    cxs = [int(x) for x in re.findall(r'cx=(\d+)', rest)]
    left = [c for c in cxs if c < 150]; right = [c for c in cxs if c >= 150]
    if left and right and y2 > 480:
        cy=(y1+y2)//2; cx=sum(left)//len(left); best=(cx,cy)
if best: print(f'{best[0]} {best[1]}')
" 2>/dev/null)
fi
if [ -n "$COORD" ]; then DEMO_X=$(echo $COORD | cut -d' ' -f1); DEMO_Y=$(echo $COORD | cut -d' ' -f2); fi
[ -z "$DEMO_Y" ] && { DEMO_X=60; DEMO_Y=560; }
echo "t=$(EL)s ДЕМО coords: (${DEMO_X},${DEMO_Y})" >> $OUT

# ---- THE DEMO TAP ----
python3 $S/evdev_blobs.py tap $STATE/blob-demo $DEMO_X $DEMO_Y >> $OUT 2>&1
$ADB push $STATE/blob-demo-p0.bin /data/local/tmp/d0.bin >/dev/null 2>&1
$ADB push $STATE/blob-demo-p1.bin /data/local/tmp/d1.bin >/dev/null 2>&1
shot $STATE/pre-demo.png
$ADB logcat -c 2>/dev/null
echo "=== DEMO TAP (${DEMO_X},${DEMO_Y}) at t=$(EL)s ===" >> $OUT
blobtap d0.bin d1.bin
TAPT=$(EL)

# ---- watch 45s ----
DEADAT=""
for w in 1 2 3; do
  sleep 15
  P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s +$(( $(EL) - TAPT ))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $OUT
  echo "[$(date -u +%H:%M:%S)] +$(( $(EL) - TAPT ))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
  [ $w -eq 1 ] && shot $STATE/demo-15s.png
  [ -z "$P" ] && { DEADAT=$(EL); break; }
done
shot $STATE/post-demo.png

# ---- classification + capture ----
PFINAL=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SSFINAL=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
DIFF=$(python3 -c "
from PIL import Image, ImageChops
try:
    a=Image.open('$STATE/pre-demo.png').convert('RGB'); b=Image.open('$STATE/post-demo.png').convert('RGB')
    if a.size!=b.size: print('SIZE_DIFF')
    else:
        g=ImageChops.difference(a,b).convert('L'); hist=g.histogram()
        print(f'{100.0*sum(hist[26:])/(a.size[0]*a.size[1]):.1f}')
except Exception: print('ERR')
" 2>/dev/null)
echo "classify: app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} diff=${DIFF:-ERR}%" >> $OUT
RESULT="UNKNOWN"
if [ -z "$SSFINAL" ]; then RESULT="ENVIRONMENT_FAILURE_system_server_died"
elif [ -z "$PFINAL" ]; then RESULT="APP_CRASH"
elif [ "${DIFF:-0}" -gt 3 ] 2>/dev/null; then RESULT="DEMO_STARTED_UI_CHANGED"
else RESULT="NO_UI_CHANGE_input_or_app"; fi
echo "$RESULT" > $STATE/demo-result.txt
echo "**** DEMO RESULT: $RESULT ****" >> $OUT

$ADB logcat -d -v time > $STATE/logcat-demo.txt 2>/dev/null
grep -E "MqCrash|MqBoot|MqApp|MqDemo|MqAuth|AndroidRuntime|FATAL|DeadSystem" $STATE/logcat-demo.txt > $STATE/crash.log 2>/dev/null
awk '/FATAL EXCEPTION|Process: com.mq1/{p=1} p{print; c++; if(c>120){p=0;c=0}}' $STATE/logcat-demo.txt > $STATE/crash-blocks.txt 2>/dev/null
$ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/last_crash.txt 2>/dev/null
$ADB shell "ls -t /data/tombstones 2>/dev/null | head -2" > $STATE/tombstones.list 2>/dev/null
echo "capture done t=$(EL)s crash.log=$(wc -l < $STATE/crash.log 2>/dev/null)" >> $OUT

kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 1
{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v39: result=$RESULT app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} diff=${DIFF:-ERR} elapsed=$(EL)s"; } > $STATE/last_checkpoint.txt
echo "**** v39 RESULT: $RESULT (t=$(EL)s) ****"
echo "--- crash blocks ---"; head -40 $STATE/crash-blocks.txt 2>/dev/null
echo "--- last_crash ---"; head -25 $STATE/last_crash.txt 2>/dev/null
tail -16 $OUT