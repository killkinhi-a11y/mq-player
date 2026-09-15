#!/bin/bash
# ============================================================================
# chunk v41b — RETRY of the FINAL emulator runtime experiment (same protocol).
# Changes vs v41a: -no-audio (skip pulseaudio init), boot deadline 510s,
# critical path compressed (render 10s, evidence guest-reads only on crash),
# adaptive watch truncation when late, service-check probes inside settle,
# adb kill-server on every exit (no inherited-pipe hang), BLOCKED verdict
# on infrastructure failure per protocol §1/§14.
# ============================================================================
MAX=${1:-588}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/home/z/my-project/scripts
OUT=$STATE/chunk-v41b.log
HEALTH=$STATE/health-v41.log
LOGCAT=$STATE/logcat-demo.txt
APK=/tmp/my-project/android-runtime/exact-release-2.3.1.apk
mkdir -p $STATE
: > $OUT; : > $HEALTH

rm -f $STATE/scr-launch.png $STATE/scr-postdialog.png $STATE/scrolled-*.png \
      $STATE/pre-demo.png $STATE/post-demo.png $STATE/demo-*s.png $STATE/demo-result.txt \
      $STATE/start-W.txt $STATE/crash.log $STATE/crash-blocks.txt \
      $STATE/last_crash.txt $STATE/footer-bands.txt $STATE/post-bands.txt \
      $STATE/nav-*.png $STATE/run-v41b-console.log 2>/dev/null

echo "=== v41b FINAL RUN $(date -u +%FT%TZ) ===" >> $OUT
progress() { echo "[$(date -u +%H:%M:%S)] $*"; echo "[$(date -u +%H:%M:%S)] $*" >> $OUT; }

pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { progress "EMULATOR STILL ALIVE - ABORT"; exit 9; }
rm -f $STATE/qemu-mon.sock
$ADB kill-server 2>/dev/null; $ADB start-server >/dev/null 2>&1

python3 $S/evdev_blobs.py tap   $STATE/blob-allow    160 351 >> $OUT 2>&1
python3 $S/evdev_blobs.py swipe $STATE/blob-scroll   160 520 380 6   >> $OUT 2>&1
python3 $S/evdev_blobs.py tap   $STATE/blob-fallback 60  560         >> $OUT 2>&1

T0=$(date +%s)
EL() { echo $(( $(date +%s) - T0 )); }

# ---- COLD BOOT (no snapshot, link ON, no audio) ----
timeout -s KILL $((MAX + 20)) $SDK/emulator/emulator -avd mq35x \
  -no-snapshot-load -no-snapshot-save -no-accel -no-window -no-boot-anim \
  -no-audio -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v41b-emulator.log 2>&1 &
EMUPID=$!
for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1
progress "emulator started (pid $EMUPID), link ON, no-audio"

BOOTED=0; ROOTED=0
while [ $(EL) -lt 510 ]; do
  SA=$(timeout 10 $ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "offline" ] && timeout 5 $ADB reconnect offline >/dev/null 2>&1
  if [ "$SA" = "device" ]; then
    if [ "$ROOTED" = "0" ]; then timeout 10 $ADB root >/dev/null 2>&1 && ROOTED=1; fi
    B=$(timeout 10 $ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$B" = "1" ] && { BOOTED=1; break; }
  fi
  echo "t=$(EL)s adb=${SA:-none} rooted=$ROOTED" >> $HEALTH
  sleep 4
done
progress "boot_completed=$BOOTED at t=$(EL)s"
if [ "$BOOTED" != "1" ]; then
  echo "EMULATOR_BLOCKED_BOOT_TIMEOUT" > $STATE/demo-result.txt
  echo "v41b: BLOCKED boot not completed in 510s (TCG too slow today)" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: EMULATOR BLOCKED (boot timeout)"
  exit 3
fi

timeout 10 $ADB root >/dev/null 2>&1
for i in $(seq 1 10); do
  SA=$(timeout 10 $ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
  [ "$SA" = "device" ] && break; sleep 2
done

# ---- SETTLE (>=120s) — all prep work folded inside ----
SETTLE_START=$(EL)
SS_START=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
NS_START=$(timeout 12 $ADB shell pidof com.android.networkstack 2>/dev/null | tr -d '\r')
echo "t=$(EL)s SETTLE start: system_server=${SS_START:-DEAD} networkstack=${NS_START:-DEAD}" >> $HEALTH
timeout 12 $ADB shell device_config put activity_manager service_timeout 120000 >> $OUT 2>&1
timeout 12 $ADB shell device_config put activity_manager service_foreground_timeout 180000 >> $OUT 2>&1
timeout 15 $ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
APKG=$(timeout 15 $ADB shell pm path com.mq1.player 2>/dev/null | tr -d '\r' | head -1)
echo "t=$(EL)s package: ${APKG:-MISSING} grant=attempted" >> $HEALTH
if [ -z "$APKG" ]; then
  progress "APK MISSING - installing exact 2.3.1"
  timeout 75 $ADB install -r $APK >> $OUT 2>&1
  APKG=$(timeout 15 $ADB shell pm path com.mq1.player 2>/dev/null | tr -d '\r' | head -1)
  [ -z "$APKG" ] && { echo "EMULATOR_BLOCKED_APK_INSTALL_FAIL" > $STATE/demo-result.txt; echo "v41b: BLOCKED install fail" > $STATE/last_checkpoint.txt; $ADB kill-server 2>/dev/null; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; echo "RESULT: EMULATOR BLOCKED (install)"; exit 6; }
fi
for f in $STATE/blob-allow-p0.bin $STATE/blob-allow-p1.bin \
         $STATE/blob-scroll-p0.bin $STATE/blob-scroll-p1.bin $STATE/blob-scroll-p2.bin \
         $STATE/blob-scroll-p3.bin $STATE/blob-scroll-p4.bin $STATE/blob-scroll-p5.bin \
         $STATE/blob-scroll-p6.bin $STATE/blob-scroll-p7.bin \
         $STATE/blob-fallback-p0.bin $STATE/blob-fallback-p1.bin; do
  [ -f "$f" ] && timeout 15 $ADB push "$f" /data/local/tmp/$(basename $f) >/dev/null 2>&1
done
timeout 15 $ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
timeout 12 $ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
# light service probes (package/activity alive)
PKGSVC=$(timeout 8 $ADB shell service check package 2>/dev/null | tr -d '\r')
ACTSVC=$(timeout 8 $ADB shell service check activity 2>/dev/null | tr -d '\r')
echo "t=$(EL)s services: package=$(echo $PKGSVC | head -c 40) activity=$(echo $ACTSVC | head -c 40)" >> $HEALTH

SS_DIED=0
while [ $(( $(EL) - SETTLE_START )) -lt 120 ]; do
  sleep 12
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  NS=$(timeout 12 $ADB shell pidof com.android.networkstack 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s settle: system_server=${SS:-DEAD} networkstack=${NS:-DEAD}" >> $HEALTH
  [ -z "$SS" ] && { SS_DIED=1; break; }
done
if [ "$SS_DIED" = "1" ]; then
  progress "SYSTEM_SERVER DIED IN SETTLE - ENVIRONMENT FAILURE"
  timeout 25 $ADB logcat -d -b all -v time > $STATE/logcat-envdeath.txt 2>/dev/null
  echo "ENVIRONMENT_FAILURE_settle_ss_died_before_launch" > $STATE/demo-result.txt
  echo "v41b: ENV settle" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: ENVIRONMENT FAILURE (system_server died in settle)"
  exit 5
fi
SS_END=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
INP=$(timeout 8 $ADB shell dumpsys input 2>/dev/null | head -2 | tail -1 | tr -d '\r')
echo "t=$(EL)s SETTLE end: system_server=${SS_END:-DEAD}(start=${SS_START}) input=${INP:-?}" >> $HEALTH
progress "settle done t=$(EL)s ss=${SS_END:-DEAD}"
if [ $(EL) -gt 555 ]; then
  progress "settle ended too late (EL=$(EL)) - no budget for app test - BLOCKED(infra)"
  echo "EMULATOR_BLOCKED_INFRA_NO_TEST_WINDOW" > $STATE/demo-result.txt
  echo "v41b: BLOCKED infra (settle end $(EL)s leaves no test window)" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: EMULATOR BLOCKED (no test window after 120s settle)"
  exit 7
fi

# ---- helpers ----
blobtap() { for b in "$@"; do
    timeout 12 $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in b0*|d0*|db0*|f0*) sleep 0.10;; *) sleep 0.04;; esac
  done; }
shot() { local G=${2:-gshot.png}; local ok=0
  for t in 1 2 3; do
    timeout 20 $ADB exec-out screencap -p > $1 2>/dev/null
    [ $(stat -c %s $1 2>/dev/null || echo 0) -gt 3000 ] && { ok=1; break; }
    sleep 3
  done
  if [ "$ok" != "1" ]; then
    timeout 15 $ADB shell screencap -p /data/local/tmp/$G >/dev/null 2>&1
    sleep 2; timeout 15 $ADB pull /data/local/tmp/$G $1 >/dev/null 2>&1
  fi
}
pdiff() { python3 -c "
from PIL import Image, ImageChops
try:
    a=Image.open('$1').convert('RGB'); b=Image.open('$2').convert('RGB')
    if a.size!=b.size: print('SIZE_DIFF')
    else:
        g=ImageChops.difference(a,b).convert('L'); hist=g.histogram()
        print(f'{100.0*sum(hist[26:])/(a.size[0]*a.size[1]):.2f}')
except Exception: print('ERR')" 2>/dev/null; }
footerfind() { python3 $S/find_text.py "$1" 420 640 > $STATE/footer-bands.txt 2>/dev/null
  python3 $S/footerfind.py $STATE/footer-bands.txt 2>/dev/null; }

# ---- LAUNCH ----
nohup timeout 80 $ADB shell am start -W \
  -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n com.mq1.player/.MainActivity > $STATE/start-W.txt 2>&1 &
progress "am start -W issued t=$(EL)s"
APP_PID=""
for i in $(seq 1 12); do
  sleep 4
  APP_PID=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "t=$(EL)s app_pid=${APP_PID:-NONE}" >> $HEALTH
if [ -z "$APP_PID" ]; then
  progress "APP DID NOT START"
  timeout 25 $ADB logcat -d -b all -v time > $STATE/logcat-startup-fail.txt 2>/dev/null
  echo "CASEX_APP_NO_START" > $STATE/demo-result.txt
  echo "v41b: no-start ss=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: APP DID NOT START"
  exit 4
fi
progress "app pid=$APP_PID t=$(EL)s"
sleep 10

# ---- dialog check ----
shot $STATE/scr-launch.png launch.png
DBAND=$(python3 -c "
from PIL import Image
try:
    im=Image.open('$STATE/scr-launch.png').convert('RGB'); w,h=im.size; px=im.load()
    tot=n=0
    for y in range(220,min(440,h)):
        for x in range(0,w,8): tot+=sum(px[x,y]); n+=3
    print(f'{tot/n:.0f}')
except Exception: print('ERR')" 2>/dev/null)
echo "t=$(EL)s dialog-band=${DBAND:-ERR}" >> $HEALTH
if [ "${DBAND:-0}" -ge 150 ] 2>/dev/null; then
  progress "permission dialog PRESENT - dismissing"
  timeout 20 $ADB shell input tap 160 351 >/dev/null 2>&1
  sleep 5
  shot $STATE/scr-postdialog.png pd.png
  DB2=$(python3 -c "
from PIL import Image
try:
    im=Image.open('$STATE/scr-postdialog.png').convert('RGB'); w,h=im.size; px=im.load()
    tot=n=0
    for y in range(220,min(440,h)):
        for x in range(0,w,8): tot+=sum(px[x,y]); n+=3
    print(f'{tot/n:.0f}')
except Exception: print('ERR')" 2>/dev/null)
  if [ "${DB2:-0}" -ge 150 ] 2>/dev/null; then
    progress "input-tap dismiss failed - blob fallback"
    blobtap blob-allow-p0.bin blob-allow-p1.bin
    sleep 5
  fi
fi

# ---- SCROLL ----
timeout 20 $ADB shell input swipe 160 520 160 380 250 >/dev/null 2>&1
sleep 4
shot $STATE/scrolled-1.png sc1.png
COORD=$(footerfind $STATE/scrolled-1.png)
if [ -z "$COORD" ]; then
  progress "footer not found after input swipe - blob swipe fallback"
  blobtap blob-scroll-p0.bin blob-scroll-p1.bin blob-scroll-p2.bin blob-scroll-p3.bin blob-scroll-p4.bin blob-scroll-p5.bin blob-scroll-p6.bin blob-scroll-p7.bin
  sleep 4
  shot $STATE/scrolled-2.png sc2.png
  COORD=$(footerfind $STATE/scrolled-2.png)
fi
DEMO_X=""; DEMO_Y=""
if [ -n "$COORD" ]; then DEMO_X=${COORD% *}; DEMO_Y=${COORD#* }; fi
if [ -z "$DEMO_Y" ] || [ "$DEMO_Y" = "0" ] 2>/dev/null; then
  DEMO_X=60; DEMO_Y=560; progress "footer detection FAILED - fallback coords (60,560)"
fi
progress "DEMO tap coords: (${DEMO_X},${DEMO_Y}) t=$(EL)s"

# ---- streaming logcat BEFORE tap ----
rm -f $LOGCAT
nohup timeout 120 $ADB logcat -b all -v time > $LOGCAT 2>/dev/null &
STREAMER=$!

# ---- THE DEMO TAP ----
shot $STATE/pre-demo.png predemo.png
progress "*** DEMO TAP (${DEMO_X},${DEMO_Y}) t=$(EL)s ***"
TAPT=$(EL)
timeout 20 $ADB shell input tap $DEMO_X $DEMO_Y >/dev/null 2>&1
TAPCMD=input
shot $STATE/demo-0s.png d0s.png

# ---- adaptive watch: +5/+15/+30 when budget allows ----
W_DEAD_APP=0; W_DEAD_SS=0
shot_at() { [ $(EL) -lt 578 ] && shot $1 $2; }
sleep 5
P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
[ -z "$P" ] && W_DEAD_APP=1
[ -z "$SS" ] && W_DEAD_SS=1
shot_at $STATE/demo-5s.png d5s.png
if [ "$W_DEAD_APP" = "0" ] && [ "$W_DEAD_SS" = "0" ]; then
  sleep 10
  P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
  [ -z "$P" ] && W_DEAD_APP=1
  [ -z "$SS" ] && W_DEAD_SS=1
  shot_at $STATE/demo-15s.png d15s.png
fi
if [ "$W_DEAD_APP" = "0" ] && [ "$W_DEAD_SS" = "0" ] && [ $(EL) -lt 568 ]; then
  sleep 15
  P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  NS=$(timeout 12 $ADB shell pidof com.android.networkstack 2>/dev/null | tr -d '\r')
  echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD} networkstack=${NS:-DEAD}" >> $HEALTH
  [ -z "$P" ] && W_DEAD_APP=1
  [ -z "$SS" ] && W_DEAD_SS=1
  shot_at $STATE/demo-30s.png d30s.png
fi
TRUNC=0
[ -f $STATE/demo-30s.png ] || TRUNC=1

# ---- classification ----
PFIN=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SSFIN=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
POST=$STATE/demo-30s.png; [ -f $POST ] || POST=$STATE/demo-15s.png; [ -f $POST ] || POST=$STATE/demo-5s.png; [ -f $POST ] || POST=$STATE/demo-0s.png
DIFF=$(pdiff $STATE/pre-demo.png $POST)
RESULT="UNKNOWN"; NOTE=""
if [ -z "$SSFIN" ]; then
  RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="system_server died during/after tap"
elif [ -z "$PFIN" ]; then
  RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app process died, system_server alive"
elif [ "${DIFF:-0}" -ge 10 ] 2>/dev/null; then
  RESULT="CASE1_DEMO_PASS"; NOTE="ui change ${DIFF}%"
else
  POSTGONE=$(python3 $S/find_text.py $POST 420 640 2>/dev/null | python3 $S/footerfind.py /dev/stdin 2>/dev/null | wc -l)
  echo "post-tap footer rows: $POSTGONE" >> $HEALTH
  if [ "$POSTGONE" -eq 0 ] 2>/dev/null; then
    RESULT="CASE1_DEMO_PASS"; NOTE="footer row gone after tap (nav away)"
  else
    CLICKED=$(grep -ac "auth.onLoggedIn demo=true" $LOGCAT 2>/dev/null || echo 0)
    echo "demo-click-logcat-evidence=$CLICKED" >> $HEALTH
    if [ "${CLICKED:-0}" -ge 1 ]; then
      progress "demo click HANDLED (MqBoot onLoggedIn) - extending watch"
      if [ $(EL) -lt 560 ]; then
        sleep 15
        shot $STATE/demo-45s.png d45s.png
        D3=$(pdiff $STATE/pre-demo.png $STATE/demo-45s.png)
        P3=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
        SS3=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
        if [ -z "$SS3" ]; then RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="ss died late"
        elif [ -z "$P3" ]; then RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app died late (post-click)"
        elif [ "${D3:-0}" -ge 10 ] 2>/dev/null; then RESULT="CASE1_DEMO_PASS"; NOTE="delayed nav ui ${D3}% at +45s"
        else RESULT="CASE5_APP_HUNG"; NOTE="click handled, no nav by +45s, app+ss alive - ANR suspect"
        fi
        DIFF=${D3:-$DIFF}
      else
        RESULT="CASE5_APP_HUNG_OR_TCG_SLOW"; NOTE="click handled (logcat), no nav by +30s, budget exhausted"
      fi
    elif [ "$TAPCMD" = "input" ] && [ $(EL) -lt 552 ]; then
      progress "no click evidence - blob tap retry"
      python3 $S/evdev_blobs.py tap $STATE/blob-demo $DEMO_X $DEMO_Y >/dev/null 2>&1
      timeout 15 $ADB push $STATE/blob-demo-p0.bin /data/local/tmp/db0.bin >/dev/null 2>&1
      timeout 15 $ADB push $STATE/blob-demo-p1.bin /data/local/tmp/db1.bin >/dev/null 2>&1
      blobtap db0.bin db1.bin
      sleep 12
      shot $STATE/demo-blob-retry.png dbr.png
      P2=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
      SS2=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
      D2=$(pdiff $STATE/pre-demo.png $STATE/demo-blob-retry.png)
      if [ -z "$SS2" ]; then RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="ss died after blob retry"
      elif [ -z "$P2" ]; then RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app died after blob tap"
      elif [ "${D2:-0}" -ge 10 ] 2>/dev/null; then RESULT="CASE1_DEMO_PASS"; NOTE="blob tap ui change ${D2}%"
      else RESULT="CASE5_APP_HUNG_OR_INPUT_FAILURE"; NOTE="app alive, no ui change input+blob (diff ${DIFF}%/${D2}%)"
      fi
    else
      RESULT="CASE4_INPUT_UI_TEST_FAILURE"; NOTE="no click evidence, no ui change (diff ${DIFF}%)"
    fi
  fi
fi
[ "$TRUNC" = "1" ] && NOTE="$NOTE [watch truncated: no +30s shot]"

echo "$RESULT" > $STATE/demo-result.txt
PF2=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SS2F=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
echo "result=$RESULT note=$NOTE app_final=${PF2:-DEAD} ss_final=${SS2F:-DEAD} diff=${DIFF:-ERR}% tapcmd=$TAPCMD elapsed=$(EL)s" > $STATE/last_checkpoint.txt
progress "RESULT: $RESULT ($NOTE) app=${PF2:-DEAD} ss=${SS2F:-DEAD} diff=${DIFF:-ERR}%"

kill $STREAMER 2>/dev/null
[ -f $LOGCAT ] && grep -aE "MqCrash|MqBoot|MqApp|MqDemo|MqAuth|AndroidRuntime|FATAL|DeadSystem|ANR in|Displayed com.mq1" $LOGCAT > $STATE/crash.log 2>/dev/null
[ -f $LOGCAT ] && awk '/FATAL EXCEPTION|Process: com.mq1/{p=1} p{print; c++; if(c>150){p=0;c=0}}' $LOGCAT > $STATE/crash-blocks.txt 2>/dev/null
# guest reads only in crash branches (budget protection)
if [[ "$RESULT" == *REAL_APP_FAILURE* ]] || [[ "$RESULT" == *HUNG* ]]; then
  timeout 15 $ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/last_crash.txt 2>/dev/null
  timeout 15 $ADB shell "ls -t /data/tombstones 2>/dev/null | head -3; ls /data/anr 2>/dev/null | head -3" > $STATE/tombstones.list 2>/dev/null
fi
echo "evidence: crash.log=$(wc -l < $STATE/crash.log 2>/dev/null || echo 0) lines" >> $OUT

# ---- bonus nav probe (Profile) only with budget ----
if [[ "$RESULT" == CASE1* ]] && [ $(EL) -lt 540 ]; then
  progress "PASS with budget - nav probe Profile (80,612)"
  shot $STATE/nav-before.png nb.png
  timeout 20 $ADB shell input tap 80 612 >/dev/null 2>&1
  sleep 8
  shot $STATE/nav-profile.png np.png
  echo "nav-profile diff=$(pdiff $STATE/nav-before.png $STATE/nav-profile.png)%" >> $HEALTH
fi

$ADB kill-server 2>/dev/null
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 1
progress "v41b COMPLETE: $RESULT"
echo "================ RESULT: $RESULT ================"
echo "note: $NOTE"
echo "app=${PF2:-DEAD} system_server=${SS2F:-DEAD} diff=${DIFF:-ERR}% elapsed=$(EL)s"
echo "--- start-W ---"; cat $STATE/start-W.txt 2>/dev/null
echo "--- crash blocks (top 30) ---"; head -30 $STATE/crash-blocks.txt 2>/dev/null
echo "--- last_crash (top 20) ---"; head -20 $STATE/last_crash.txt 2>/dev/null
exit 0
