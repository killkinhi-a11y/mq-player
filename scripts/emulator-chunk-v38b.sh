#!/bin/bash
# Chunk v38b — DEMO TEST on the "booted" snapshot.
# Load snapshot (fast, no full boot) -> Phase 1 health check -> launch app
# -> dialog dismiss (blob tap ALLOW) -> fresh dump/pixel coords -> SCROLL UP
# -> blob tap "Демо-режим" -> pid + system_server watch (12s cadence)
# -> screenshot before/after + PIL diff -> classification:
#    A demo started | B APP CRASH | C system_server died (ENV) | D input fail | E ANR
# No uiautomator STALE dumps: rm before each dump; only trust fresh files.
MAX=${1:-560}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
AVD=$ANDROID_AVD_HOME/mq35x.avd
STATE=/tmp/my-project/android-runtime/state
S=/tmp/my-project/scripts
OUT=$STATE/chunk-v38b.log
HEALTH=$STATE/health-v38b.log
mkdir -p $STATE
: > $OUT
echo "=== chunk v38b DEMO TEST $(date -u +%H:%M:%SZ) ===" >> $OUT

pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { echo "EMULATOR STILL ALIVE - ABORT" >> $OUT; exit 9; }

$ADB kill-server 2>/dev/null
$ADB start-server >/dev/null 2>&1

T0=$(date +%s)
timeout -s KILL $((MAX + 20)) $SDK/emulator/emulator -avd mq35x \
  -snapshot booted -no-snapshot-save -no-accel -no-window -no-boot-anim \
  -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -shell-serial tcp::4444,server,nowait \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v38b-emulator.log 2>&1 &
EMUPID=$!

for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1

# wait for adb device (adbd resumes inside snapshot)
READY=0
for i in $(seq 1 50); do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    B=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$B" = "1" ] && { READY=1; break; }
  fi
  sleep 6
done
echo "adb_ready=$READY at $(( $(date +%s) - T0 ))s" >> $OUT
[ "$READY" != "1" ] && { echo "SNAPSHOT LOAD FAILED / NO ADB" >> $OUT; kill -9 $EMUPID 2>/dev/null; exit 3; }

# ---- PHASE 1: RUNTIME HEALTH CHECK ----
hline() { echo "[$(date -u +%H:%M:%S)] $*" >> $HEALTH; }
: > $HEALTH
{
  echo "--- getprops ---"
  $ADB shell getprop sys.boot_completed
  $ADB shell getprop ro.build.version.release
  $ADB shell getprop ro.product.cpu.abi
  echo "--- system_server ---"
  $ADB shell pidof system_server
  echo "--- services (package/input/activity counts) ---"
  $ADB shell service list 2>/dev/null | grep -cE "package|input" 
  $ADB shell service check package 2>/dev/null
  $ADB shell service check input 2>/dev/null
  echo "--- meminfo ---"
  $ADB shell cat /proc/meminfo 2>/dev/null | head -3
  echo "--- package ---"
  $ADB shell pm list packages com.mq1.player
  $ADB shell dumpsys package com.mq1.player 2>/dev/null | grep -m3 -E "versionCode|versionName|firstInstallTime"
} > $STATE/health-baseline.txt 2>&1
SS0=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
hline "baseline: system_server=$SS0 boot=1"
echo "PHASE1 health done at $(( $(date +%s) - T0 ))s ss=$SS0" >> $OUT

# background health poll: system_server alive every 12s
( while kill -0 $EMUPID 2>/dev/null; do
    P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
    SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
    hline "poll: app=${P:-DEAD} system_server=${SS:-DEAD}"
    sleep 12
  done ) &
POLLPID=$!

# gesture blobs: dialog ALLOW tap (160,351), scroll swipe (160,540->380), demo tap (TBD coords)
python3 $S/evdev_blobs.py tap $STATE/blob-allow 160 351 >> $OUT 2>&1
python3 $S/evdev_blobs.py swipe $STATE/blob-scroll 160 540 380 6 >> $OUT 2>&1
$ADB push $STATE/blob-allow-p0.bin /data/local/tmp/b0.bin >/dev/null 2>&1
$ADB push $STATE/blob-allow-p1.bin /data/local/tmp/b1.bin >/dev/null 2>&1
i=0
for f in $STATE/blob-scroll-p*.bin; do
  i=$((i+1)); $ADB push $f /data/local/tmp/s$i.bin >/dev/null 2>&1
done
NSCROLL=$i
$ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
$ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
blobtap() {  # $1..$n = guest blob files (phases in order)
  for b in "$@"; do
    $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in b0*|d0*) sleep 0.08;; *) sleep 0.025;; esac
  done
}

# ---- PHASE 2: LAUNCH ----
$ADB logcat -c 2>/dev/null
APP_PID=""
for attempt in 1 2 3 4 5; do
  $ADB shell am start --user 0 -n com.mq1.player/.MainActivity >> $OUT 2>&1
  sleep 9
  APP_PID=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "app_pid=${APP_PID:-NONE} at $(( $(date +%s) - T0 ))s" >> $OUT
[ -z "$APP_PID" ] && { echo "APP FAILED TO START - see logcat-startup" >> $OUT; }
sleep 32

shot() { $ADB exec-out screencap -p > $1 2>/dev/null; }
bright() { python3 -c "
from PIL import Image
try:
    im = Image.open('$1').convert('RGB'); w,h = im.size; px = im.load()
    tot=n=0
    for y in range($2, min($3,h)):
        for x in range(0, w, 8): tot += sum(px[x,y]); n += 3
    print(f'{tot/n:.0f}')
except Exception: print('ERR')" 2>/dev/null; }

shot $STATE/scr-launch.png
LB=$(bright $STATE/scr-launch.png 60 95)
DB=$(bright $STATE/scr-launch.png 220 440)
echo "launch screen: logo-band=$LB dialog-band=$DB" >> $OUT

# ---- dialog dismissal (if present) ----
if [ "${DB:-0}" -ge 150 ] 2>/dev/null; then
  echo "permission dialog PRESENT - blob tap ALLOW (160,351)" >> $OUT
  blobtap b0.bin b1.bin
  sleep 9
  shot $STATE/scr-postdialog.png
  DB2=$(bright $STATE/scr-postdialog.png 220 440)
  echo "post-dismiss dialog-band=$DB2" >> $OUT
  if [ "${DB2:-0}" -ge 150 ] 2>/dev/null; then
    blobtap b0.bin b1.bin
    sleep 9
    shot $STATE/scr-postdialog2.png
    DB2=$(bright $STATE/scr-postdialog2.png 220 440)
    echo "post-dismiss-2 dialog-band=$DB2" >> $OUT
  fi
fi

# ---- login render check ----
shot $STATE/login-1.png
LB=$(bright $STATE/login-1.png 55 95)
echo "login logo-band=$LB (>=60 = rendered)" >> $OUT

# ---- SCROLL UP to reveal the footer ----
SCROLL_ARGS=""
for j in $(seq 0 $NSCROLL); do SCROLL_ARGS="$SCROLL_ARGS s$j.bin"; done
blobtap $SCROLL_ARGS
sleep 5
shot $STATE/scrolled-1.png

# ---- FRESH uiautomator dump AFTER scroll (bounds directly tappable) ----
# NEVER trust stale files: rm both sides, then verify the pulled file is new.
$ADB shell rm -f /data/local/tmp/ui.xml 2>/dev/null; rm -f $STATE/ui-v38b.xml
$ADB shell uiautomator dump /data/local/tmp/ui.xml >/dev/null 2>&1
sleep 2
$ADB pull /data/local/tmp/ui.xml $STATE/ui-v38b.xml >/dev/null 2>&1
UIFRESH=0
if [ -s $STATE/ui-v38b.xml ]; then
  M1=$(stat -c %Y $STATE/ui-v38b.xml 2>/dev/null || echo 0)
  NOW=$(date +%s)
  [ $((NOW - M1)) -lt 180 ] && UIFRESH=1
fi
echo "uiautomator fresh dump=$UIFRESH" >> $OUT
DEMO_X=""; DEMO_Y=""
if [ "$UIFRESH" = "1" ]; then
  B=$(grep -o 'text="Демо-режим"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' $STATE/ui-v38b.xml | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | tr -d '[]' | head -1)
  if [ -n "$B" ]; then
    X1=$(echo $B | cut -d, -f1); Y1=$(echo $B | cut -d, -f2); X2=$(echo $B | cut -d, -f3); Y2=$(echo $B | cut -d, -f4)
    DEMO_X=$(( (X1 + X2) / 2 )); DEMO_Y=$(( (Y1 + Y2) / 2 ))
    echo "dump(post-scroll) Демо bounds=[$X1,$Y1][$X2,$Y2] -> tap ($DEMO_X,$DEMO_Y)" >> $OUT
  fi
fi
if [ -z "$DEMO_Y" ]; then
  python3 $S/find_text.py $STATE/scrolled-1.png 430 640 > $STATE/footer-bands.txt 2>/dev/null
  echo "--- footer bands after scroll 1 ---" >> $OUT; cat $STATE/footer-bands.txt >> $OUT
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
        cy = (y1+y2)//2; cx = sum(left)//len(left)
        best = (cx, cy)
if best: print(f'{best[0]} {best[1]}')
" 2>/dev/null)
  if [ -n "$COORD" ]; then
    DEMO_X=$(echo $COORD | cut -d' ' -f1); DEMO_Y=$(echo $COORD | cut -d' ' -f2)
    echo "pixel Демо center=($DEMO_X,$DEMO_Y)" >> $OUT
  else
    # second scroll + retry
    blobtap $SCROLL_ARGS
    sleep 5
    shot $STATE/scrolled-2.png
    python3 $S/find_text.py $STATE/scrolled-2.png 430 640 > $STATE/footer-bands2.txt 2>/dev/null
    echo "--- footer bands after scroll 2 ---" >> $OUT; cat $STATE/footer-bands2.txt >> $OUT
    DEMO_X=60; DEMO_Y=565
    echo "fallback Демо center=(60,565)" >> $OUT
  fi
fi
echo "FINAL demo tap coords: (${DEMO_X:-60},${DEMO_Y:-565})" >> $OUT

# ---- THE DEMO TAP ----
python3 $S/evdev_blobs.py tap $STATE/blob-demo ${DEMO_X:-60} ${DEMO_Y:-565} >> $OUT 2>&1
$ADB push $STATE/blob-demo-p0.bin /data/local/tmp/d0.bin >/dev/null 2>&1
$ADB push $STATE/blob-demo-p1.bin /data/local/tmp/d1.bin >/dev/null 2>&1
shot $STATE/pre-demo.png
$ADB logcat -c 2>/dev/null
echo "=== DEMO TAP (${DEMO_X:-60},${DEMO_Y:-565}) at $(( $(date +%s) - T0 ))s ===" >> $OUT
blobtap d0.bin d1.bin
TAPTIME=$(date +%s)

# watch: 60s, screencaps at +20/+40
APPEVER="$APP_PID"
for w in 1 2 3 4 5; do
  sleep 12
  P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  hline "post-tap +$((w*12))s: app=${P:-DEAD} system_server=${SS:-DEAD}"
  echo "  +$((w*12))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $OUT
  [ $w -eq 2 ] && shot $STATE/demo-20s.png
  [ $w -eq 4 ] && shot $STATE/demo-48s.png
done
shot $STATE/post-demo.png

# ---- CLASSIFICATION ----
PFINAL=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SSFINAL=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
$ADB logcat -d -v time > $STATE/logcat-demo.txt 2>/dev/null
DIFF=$(python3 -c "
from PIL import Image, ImageChops
try:
    a=Image.open('$STATE/pre-demo.png').convert('RGB'); b=Image.open('$STATE/post-demo.png').convert('RGB')
    if a.size!=b.size:
        print('SIZE_DIFF')
    else:
        g=ImageChops.difference(a,b).convert('L')
        hist=g.histogram()
        changed=sum(hist[26:])
        print(f'{100.0*changed/(a.size[0]*a.size[1]):.1f}')
except Exception:
    print('ERR')
" 2>/dev/null)
echo "classification inputs: app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} diff=${DIFF:-ERR}%" >> $OUT

RESULT="UNKNOWN"
if [ -z "$SSFINAL" ]; then
  RESULT="ENVIRONMENT_FAILURE_system_server_died"
elif [ -z "$PFINAL" ]; then
  RESULT="APP_CRASH"
else
  if [ "${DIFF:-0}" -gt 3 ] 2>/dev/null; then RESULT="DEMO_STARTED_UI_CHANGED"; else RESULT="NO_UI_CHANGE_input_or_app"; fi
fi
echo "**** DEMO RESULT: $RESULT ****" >> $OUT
echo "$RESULT" > $STATE/demo-result.txt

# ---- evidence capture ----
grep -E "MqCrash|MqBoot|MqApp|MqDemo|MqAuth|AndroidRuntime|FATAL|DeadSystem" $STATE/logcat-demo.txt > $STATE/crash.log 2>/dev/null
awk '/FATAL EXCEPTION|Process: com.mq1/{p=1} p{print; c++; if(c>120){p=0;c=0}}' $STATE/logcat-demo.txt > $STATE/crash-blocks.txt 2>/dev/null
$ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/last_crash.txt 2>/dev/null
$ADB shell "ls -t /data/tombstones 2>/dev/null | head -3" > $STATE/tombstones.list 2>/dev/null
NEWTOMB=$($ADB shell "ls -t /data/tombstones 2>/dev/null | head -1" | tr -d '\r')
[ -n "$NEWTOMB" ] && [ "$NEWTOMB" != "" ] && $ADB shell "head -120 /data/tombstones/$NEWTOMB 2>/dev/null" > $STATE/tombstone-newest.txt 2>/dev/null
$ADB shell dumpsys activity processes 2>/dev/null | grep -A3 "com.mq1.player" > $STATE/app-procs.txt 2>/dev/null
echo "evidence: crash.log=$(wc -l < $STATE/crash.log) blocks=$(wc -l < $STATE/crash-blocks.txt) last_crash=$(wc -c < $STATE/last_crash.txt)B" >> $OUT

# if demo started: quick nav sweep (Phase 6, best effort)
if [ "$RESULT" = "DEMO_STARTED_UI_CHANGED" ]; then
  NAVY=$($ADB shell dumpsys window 2>/dev/null | grep -m1 "mCurrentFocus" | tr -d '\r')
  echo "focus after demo: $NAVY" >> $OUT
  for nx in 40 115 190 265; do
    python3 $S/evdev_blobs.py tap $STATE/blob-nav$nx $nx 612 >> $OUT 2>&1
    $ADB push $STATE/blob-nav$nx-p0.bin /data/local/tmp/n0.bin >/dev/null 2>&1
    $ADB push $STATE/blob-nav$nx-p1.bin /data/local/tmp/n1.bin >/dev/null 2>&1
    blobtap n0.bin n1.bin
    sleep 8
    shot $STATE/nav-x$nx.png
    P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
    echo "nav tap x=$nx: app=${P:-DEAD}" >> $OUT
    [ -z "$P" ] && { echo "APP DIED DURING NAV SWEEP at x=$nx" >> $OUT; break; }
  done
fi

kill $POLLPID 2>/dev/null
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 2
{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v38b: result=$RESULT app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} diff=${DIFF:-ERR} elapsed=$(( $(date +%s) - T0 ))s"; } > $STATE/last_checkpoint.txt

echo "**** CHUNK v38b RESULT: $RESULT ****"
echo "--- crash blocks ---"; head -50 $STATE/crash-blocks.txt 2>/dev/null
echo "--- last_crash ---"; head -30 $STATE/last_crash.txt 2>/dev/null
echo "--- health tail ---"; tail -20 $HEALTH
tail -25 $OUT