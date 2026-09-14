#!/bin/bash
# Chunk v41 — THE DEMO TEST, single chunk, clean cold boot.
# Environment hardening (all evidence-driven):
#  - link ON during boot (v38a: idle+linkON survived +113s; v40a linkOFF died idle at +90s)
#  - device_config service_timeout raised right after boot_completed (networkstack
#    TetheringService ANR 20s -> 120s insurance; v39 died from that ANR cascade)
#  - settle 70s post-boot before launching the app (v39: app@+45s contended -> ANR)
#  - adb root (required for /dev/input evdev writes; v39 missed it)
#  - screenshots with retry + guest-pull fallback; streaming logcat BEFORE the tap
#    so evidence survives even if the outer 600s timeout truncates the script.
MAX=${1:-585}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/tmp/my-project/scripts
OUT=$STATE/chunk-v41.log
HEALTH=$STATE/health-v41.log
LOGCAT=$STATE/logcat-demo.txt
mkdir -p $STATE
: > $OUT
echo "=== chunk v41 DEMO TEST $(date -u +%H:%M:%SZ) ===" >> $OUT

pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { echo "EMULATOR STILL ALIVE - ABORT" >> $OUT; exit 9; }
rm -f $STATE/qemu-mon.sock

$ADB kill-server 2>/dev/null
$ADB start-server >/dev/null 2>&1

T0=$(date +%s)
EL() { echo $(( $(date +%s) - T0 )); }
timeout -s KILL $((MAX + 10)) $SDK/emulator/emulator -avd mq35x \
  -no-snapshot-load -no-snapshot-save -no-accel -no-window -no-boot-anim \
  -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -shell-serial tcp::4444,server,nowait \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v41-emulator.log 2>&1 &
EMUPID=$!

for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1

BOOTED=0
ROOTED=0
: > $HEALTH
while [ $(EL) -lt 470 ]; do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    B=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$ROOTED" = "0" ]; then $ADB root >/dev/null 2>&1 && ROOTED=1; fi
    [ "$B" = "1" ] && { BOOTED=1; break; }
  fi
  echo "t=$(EL)s adb=${SA:-none} rooted=$ROOTED" >> $HEALTH
  sleep 6
done
echo "boot_completed=$BOOTED at $(EL)s" >> $OUT
[ "$BOOTED" != "1" ] && { echo "BOOT TIMEOUT" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"; { date -u +%FT%TZ; echo "v41: BOOT_TIMEOUT"; } > $STATE/last_checkpoint.txt; exit 3; }

$ADB root >/dev/null 2>&1
for i in $(seq 1 8); do
  SA=$($ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "device" ] && break; sleep 3
done
$ADB shell device_config put activity_manager service_timeout 120000 >> $OUT 2>&1
$ADB shell device_config put activity_manager service_foreground_timeout 180000 >> $OUT 2>&1
$ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
echo "root+config+grant done at $(EL)s" >> $OUT

# ---- blobs ----
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
    sleep 3
  done
  if [ "$ok" != "1" ]; then
    $ADB shell screencap -p /data/local/tmp/$G >/dev/null 2>&1
    sleep 2
    $ADB pull /data/local/tmp/$G $1 >/dev/null 2>&1
  fi
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

# ---- SETTLE 70s (networkstack ANR window passes; link ON) ----
SEST0=$(EL)
while [ $(( $(EL) - SEST0 )) -lt 70 ]; do
  sleep 12
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s settle: system_server=${SS:-DEAD}" >> $HEALTH
  [ -z "$SS" ] && break
done
SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
echo "settle done at $(EL)s ss=${SS:-DEAD}" >> $OUT
[ -z "$SS" ] && { echo "SYSTEM DIED IN SETTLE" >> $OUT; $ADB logcat -d -v time > $STATE/logcat-envdeath.txt 2>/dev/null; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; { date -u +%FT%TZ; echo "v41: SYSTEM_DIED_IN_SETTLE"; } > $STATE/last_checkpoint.txt; exit 5; }

# ---- LAUNCH ----
$ADB logcat -c 2>/dev/null
$ADB shell am start --user 0 -n com.mq1.player/.MainActivity >> $OUT 2>&1
APP_PID=""
for i in $(seq 1 10); do
  sleep 6
  APP_PID=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "app_pid=${APP_PID:-NONE} at $(EL)s" >> $OUT
[ -z "$APP_PID" ] && { $ADB logcat -d -v time > $STATE/logcat-startup-fail.txt 2>/dev/null; echo "APP DID NOT START" >> $OUT; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"; { date -u +%FT%TZ; echo "v41: APP_NO_START"; } > $STATE/last_checkpoint.txt; exit 4; }
sleep 22

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

# ---- SCROLL UP ----
SCROLL_ARGS=""
for j in $(seq 0 $NSCROLL); do SCROLL_ARGS="$SCROLL_ARGS s$j.bin"; done
blobtap $SCROLL_ARGS
sleep 6
shot $STATE/scrolled-1.png
python3 $S/find_text.py $STATE/scrolled-1.png 400 640 > $STATE/footer-bands.txt 2>/dev/null
echo "--- footer bands ---" >> $OUT; cat $STATE/footer-bands.txt >> $OUT

# ---- Демо coords: two-cluster footer row (left = Демо-режим) ----
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
    if left and right and y2 > 460:
        cy=(y1+y2)//2; cx=sum(left)//len(left); best=(cx,cy)
if best: print(f'{best[0]} {best[1]}')
" 2>/dev/null)
if [ -n "$COORD" ]; then DEMO_X=$(echo $COORD | cut -d' ' -f1); DEMO_Y=$(echo $COORD | cut -d' ' -f2); fi
[ -z "$DEMO_Y" ] && { DEMO_X=60; DEMO_Y=560; echo "fallback coords (60,560)" >> $OUT; }
echo "t=$(EL)s ДЕМО tap coords: (${DEMO_X},${DEMO_Y})" >> $OUT

# ---- streaming logcat (evidence survives any truncation) ----
nohup $ADB logcat -v time > $LOGCAT 2>/dev/null &
STREAMER=$!

# ---- THE DEMO TAP ----
python3 $S/evdev_blobs.py tap $STATE/blob-demo $DEMO_X $DEMO_Y >> $OUT 2>&1
$ADB push $STATE/blob-demo-p0.bin /data/local/tmp/d0.bin >/dev/null 2>&1
$ADB push $STATE/blob-demo-p1.bin /data/local/tmp/d1.bin >/dev/null 2>&1
shot $STATE/pre-demo.png
echo "=== DEMO TAP (${DEMO_X},${DEMO_Y}) at t=$(EL)s ===" >> $OUT
TAPT=$(EL)
blobtap d0.bin d1.bin

# ---- watch ~50s: pid + system_server + shots ----
for w in 1 2 3 4 5; do
  sleep 10
  P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s +$(( $(EL) - TAPT ))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $OUT
  echo "[$(date -u +%H:%M:%S)] +$(( $(EL) - TAPT ))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
  [ $w -eq 2 ] && shot $STATE/demo-20s.png
  [ $w -eq 4 ] && shot $STATE/demo-40s.png
done
shot $STATE/post-demo.png

# ---- classification ----
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

# ---- evidence ----
grep -E "MqCrash|MqBoot|MqApp|MqDemo|MqAuth|AndroidRuntime|FATAL|DeadSystem|ANR in" $LOGCAT > $STATE/crash.log 2>/dev/null
awk '/FATAL EXCEPTION|Process: com.mq1/{p=1} p{print; c++; if(c>120){p=0;c=0}}' $LOGCAT > $STATE/crash-blocks.txt 2>/dev/null
$ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/last_crash.txt 2>/dev/null
$ADB shell "ls -t /data/tombstones 2>/dev/null | head -2" > $STATE/tombstones.list 2>/dev/null
echo "evidence: crash.log=$(wc -l < $STATE/crash.log 2>/dev/null) last_crash=$(wc -c < $STATE/last_crash.txt 2>/dev/null)B" >> $OUT

kill $STREAMER 2>/dev/null
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 1
{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v41: result=$RESULT app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} diff=${DIFF:-ERR} elapsed=$(EL)s"; } > $STATE/last_checkpoint.txt
echo "**** v41 RESULT: $RESULT (t=$(EL)s) ****"
echo "--- crash blocks ---"; head -40 $STATE/crash-blocks.txt 2>/dev/null
echo "--- last_crash ---"; head -25 $STATE/last_crash.txt 2>/dev/null
tail -14 $OUT