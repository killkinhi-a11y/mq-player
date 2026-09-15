#!/bin/bash
# ============================================================================
# chunk v41e — COMPLETION of v41 (same protocol, evidence-calibrated detection)
# Learnings baked in from v41b:
#  - boot 366s on idle host with -no-audio; app pid at am start +32s;
#    LoginScreen renders ~pid+30s (splash before that); NO permission dialog
#    (pm grant works); LoginScreen is LIGHT theme; footer row «Демо-режим» |
#    «Регистрация» after 140px scroll = y621-631, Демо-режим cluster x40-124
#    cx≈82; screencap costs 3-8s per shot (budgeted); input swipe scrolls.
# Protocol: cold boot, link ON, settle >=120s, health-gated, screencap truth,
#    am start -W exact flags, streaming logcat before tap, CASE 1-5.
# ============================================================================
MAX=${1:-588}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
STATE=/tmp/my-project/android-runtime/state
S=/home/z/my-project/scripts
OUT=$STATE/chunk-v41e.log
HEALTH=$STATE/health-v41.log
LOGCAT=$STATE/logcat-demo.txt
APK=/tmp/my-project/android-runtime/exact-release-2.3.1.apk
mkdir -p $STATE
: > $OUT; : > $HEALTH
rm -f $STATE/scr-launch.png $STATE/scrolled-*.png $STATE/pre-demo.png $STATE/post-demo.png \
      $STATE/demo-*s.png $STATE/demo-result.txt $STATE/start-W.txt $STATE/crash.log \
      $STATE/crash-blocks.txt $STATE/last_crash.txt $STATE/footer-bands.txt \
      $STATE/nav-*.png $STATE/X-DELETED-X 2>/dev/null

echo "=== v41e FINAL RUN $(date -u +%FT%TZ) ===" >> $OUT
progress() { echo "[$(date -u +%H:%M:%S)] $*"; echo "[$(date -u +%H:%M:%S)] $*" >> $OUT; }
pgrep -f "qemu-system.*mq35x" >/dev/null 2>&1 && { progress "EMULATOR STILL ALIVE - ABORT"; exit 9; }
rm -f $STATE/qemu-mon.sock
$ADB kill-server 2>/dev/null; $ADB start-server >/dev/null 2>&1
python3 $S/evdev_blobs.py swipe $STATE/blob-scroll 160 520 380 6 >> $OUT 2>&1

T0=$(date +%s)
EL() { echo $(( $(date +%s) - T0 )); }

timeout -s KILL $((MAX + 20)) $SDK/emulator/emulator -avd mq35x \
  -no-snapshot-load -no-snapshot-save -no-accel -no-window -no-boot-anim \
  -no-audio -show-kernel -gpu swiftshader_indirect -memory 1536 -cores 2 -no-metrics \
  -feature -VirtioWifi \
  -qemu -monitor unix:$STATE/qemu-mon.sock,server,nowait \
  > $STATE/boot-v41e-emulator.log 2>&1 &
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
  echo "v41e: BLOCKED boot not completed in 510s" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: EMULATOR BLOCKED (boot timeout)"
  exit 3
fi
if [ "$ROOTED" != "1" ]; then
  timeout 10 $ADB root >/dev/null 2>&1
  for i in $(seq 1 6); do
    SA=$(timeout 10 $ADB devices 2>/dev/null | grep emulator-5554 | tr -d '\r' | awk '{print $2}')
    [ "$SA" = "device" ] && break; sleep 2
  done
fi

# ---- SETTLE >=120s (all prep inside) ----
SETTLE_START=$(EL)
SS_START=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')
echo "t=$(EL)s SETTLE start: system_server=${SS_START:-DEAD}" >> $HEALTH
timeout 12 $ADB shell device_config put activity_manager service_timeout 120000 >> $OUT 2>&1
timeout 12 $ADB shell device_config put activity_manager service_foreground_timeout 180000 >> $OUT 2>&1
timeout 15 $ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
APKG=$(timeout 15 $ADB shell pm path com.mq1.player 2>/dev/null | tr -d '\r' | head -1)
echo "t=$(EL)s package: ${APKG:-MISSING}" >> $HEALTH
if [ -z "$APKG" ]; then
  progress "APK MISSING - installing exact 2.3.1"
  timeout 75 $ADB install -r $APK >> $OUT 2>&1
  APKG=$(timeout 15 $ADB shell pm path com.mq1.player 2>/dev/null | tr -d '\r' | head -1)
  [ -z "$APKG" ] && { echo "EMULATOR_BLOCKED_APK_INSTALL_FAIL" > $STATE/demo-result.txt; echo "v41e: BLOCKED install fail" > $STATE/last_checkpoint.txt; $ADB kill-server 2>/dev/null; kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; echo "RESULT: EMULATOR BLOCKED (install)"; exit 6; }
fi
for f in $STATE/blob-scroll-p*.bin; do
  timeout 15 $ADB push "$f" /data/local/tmp/$(basename $f) >/dev/null 2>&1
done
NETPS=$(timeout 10 $ADB shell "ps -A 2>/dev/null | grep -iE 'network|connectiv' | head -3" 2>/dev/null | tr -d '\r')
echo "t=$(EL)s netprocs: ${NETPS:-none}" >> $HEALTH

SS_DIED=0
while [ $(( $(EL) - SETTLE_START )) -lt 120 ]; do
  sleep 12
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
  echo "t=$(EL)s settle: system_server=${SS:-DEAD}" >> $HEALTH
  [ -z "$SS" ] && { SS_DIED=1; break; }
done
if [ "$SS_DIED" = "1" ]; then
  progress "SYSTEM_SERVER DIED IN SETTLE - ENVIRONMENT FAILURE"
  timeout 25 $ADB logcat -d -b all -v time > $STATE/logcat-envdeath.txt 2>/dev/null
  echo "ENVIRONMENT_FAILURE_settle_ss_died_before_launch" > $STATE/demo-result.txt
  echo "v41e: ENV settle" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: ENVIRONMENT FAILURE (system_server died in settle)"
  exit 5
fi
SS_END=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
echo "t=$(EL)s SETTLE end: system_server=${SS_END:-DEAD}(start=${SS_START})" >> $HEALTH
progress "settle done t=$(EL)s ss=${SS_END:-DEAD}"
if [ $(EL) -gt 550 ]; then
  progress "settle ended too late (EL=$(EL)) - BLOCKED(infra)"
  echo "EMULATOR_BLOCKED_INFRA_NO_TEST_WINDOW" > $STATE/demo-result.txt
  echo "v41e: BLOCKED infra (settle end $(EL)s)" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: EMULATOR BLOCKED (no test window)"
  exit 7
fi

# ---- helpers ----
blobtap() { for b in "$@"; do
    timeout 12 $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in *p0*|*s0*) sleep 0.10;; *) sleep 0.04;; esac
  done; }
timeout 15 $ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
timeout 12 $ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
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
# theme-aware footer detector: dark-text two-cluster row in y[560..640]
footer2() { python3 -c "
from PIL import Image
import sys
try:
    im = Image.open('$1').convert('RGB'); w,h = im.size; px = im.load()
    best=None
    for y0 in range(440, h-10, 4):
        xs=set()
        for y in range(y0, min(y0+16, h)):
            for x in range(w):
                r,g,b = px[x,y]
                if r+g+b < 600: xs.add(x)
        if not xs: continue
        xs=sorted(xs); cl=[[xs[0]]]
        for x in xs[1:]:
            if x-cl[-1][-1] > 20: cl.append([x])
            else: cl[-1].append(x)
        wide=[c for c in cl if c[-1]-c[0] > 25]
        if len(wide) >= 2:
            L=wide[0]; R=wide[-1]
            lcx=(L[0]+L[-1])//2; rcx=(R[0]+R[-1])//2
            if lcx < 130 and rcx > 190 and (rcx-lcx) > 90:
                cy=y0+7
                if best is None or cy > best[1]: best=(lcx, cy, len(wide))
    if best: print(f'{best[0]} {best[1]}')
except Exception: pass" 2>/dev/null; }

# ---- LAUNCH ----
nohup timeout 80 $ADB shell am start -W \
  -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n com.mq1.player/.MainActivity > $STATE/start-W.txt 2>&1 &
progress "am start -W issued t=$(EL)s"
APP_PID=""
for i in $(seq 1 14); do
  sleep 4
  APP_PID=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "t=$(EL)s app_pid=${APP_PID:-NONE}" >> $HEALTH
if [ -z "$APP_PID" ]; then
  progress "APP DID NOT START"
  timeout 25 $ADB logcat -d -b all -v time > $STATE/logcat-startup-fail.txt 2>/dev/null
  echo "CASEX_APP_NO_START" > $STATE/demo-result.txt
  echo "v41e: no-start ss=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r')" > $STATE/last_checkpoint.txt
  $ADB kill-server 2>/dev/null
  kill -9 $EMUPID 2>/dev/null; pkill -9 -f "qemu-system.*mq35x"; pkill -9 -f "emulator.*mq35x"
  echo "RESULT: APP DID NOT START"
  exit 4
fi
progress "app pid=$APP_PID t=$(EL)s; waiting for LoginScreen render (splash->login ~30s)"

# ---- render-confirm loop (max 3 shots) ----
RENDERED=0
for r in 1 2 3; do
  sleep $(( r == 1 ? 24 : 10 ))
  shot $STATE/scr-render-$r.png rr$r.png
  RB=$(python3 -c "
from PIL import Image
try:
    im=Image.open('$STATE/scr-render-$r.png').convert('RGB'); w,h=im.size; px=im.load()
    bright=sum(1 for y in range(0,h,4) for x in range(0,w,4) if sum(px[x,y])>600)
    tot=len(range(0,h,4))*len(range(0,w,4))
    print(f'{100*bright/tot:.0f}')
except Exception: print('ERR')" 2>/dev/null)
  echo "t=$(EL)s render-shot$r bright%=${RB:-ERR}" >> $HEALTH
  if [ "${RB:-0}" -ge 25 ] 2>/dev/null; then RENDERED=1; BASE=$STATE/scr-render-$r.png; break; fi
done
echo "rendered=$RENDERED (bright%=${RB:-ERR}) t=$(EL)s" >> $HEALTH

# ---- footer detect: RENDER shot first, swipe only if needed ----
if [ -z "$BASE" ]; then BASE=$STATE/scr-render-1.png; fi
if [ ! -f $BASE ]; then shot $BASE rb.png; fi
echo "baseline=$BASE" >> $HEALTH
COORD=$(footer2 $BASE)
FB=RENDER
if [ -z "$COORD" ]; then
  progress "footer not on render shot - input swipe"
  timeout 20 $ADB shell input swipe 160 520 160 380 250 >/dev/null 2>&1
  sleep 4
  shot $STATE/scrolled-1.png sc1.png
  COORD=$(footer2 $STATE/scrolled-1.png); FB=SWIPED
fi
if [ -z "$COORD" ]; then
  progress "footer not found after swipe - blob swipe"
  blobtap blob-scroll-p0.bin blob-scroll-p1.bin blob-scroll-p2.bin blob-scroll-p3.bin blob-scroll-p4.bin blob-scroll-p5.bin blob-scroll-p6.bin blob-scroll-p7.bin
  sleep 4
  shot $STATE/scrolled-2.png sc2.png
  COORD=$(footer2 $STATE/scrolled-2.png); FB=BLOBSWIPED
fi
if [ -z "$COORD" ]; then
  progress "footer not found (all attempts) - measured fallback (82,635)"
  DEMO_X=82; DEMO_Y=635; FB=FALLBACK
else
  DEMO_X=${COORD% *}; DEMO_Y=${COORD#* }; 
fi
progress "DEMO coords: (${DEMO_X},${DEMO_Y}) [$FB] t=$(EL)s"

# ---- streaming logcat BEFORE tap ----
rm -f $LOGCAT
nohup timeout 130 $ADB logcat -b all -v time > $LOGCAT 2>/dev/null &
STREAMER=$!

# ---- THE DEMO TAP (baseline = $BASE) ----
progress "*** DEMO TAP (${DEMO_X},${DEMO_Y}) t=$(EL)s ***"
TAPT=$(EL)
timeout 20 $ADB shell input tap $DEMO_X $DEMO_Y >/dev/null 2>&1
TAPCMD=input

# ---- watch +5/+15/+30 (adaptive), pids every ~8s ----
W_DEAD_APP=0; W_DEAD_SS=0; TRUNC=0
sleep 5
P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
[ -z "$P" ] && W_DEAD_APP=1
[ -z "$SS" ] && W_DEAD_SS=1
[ $(EL) -lt 578 ] && shot $STATE/demo-5s.png d5s.png
if [ "$W_DEAD_APP" = "0" ] && [ "$W_DEAD_SS" = "0" ]; then
  sleep 10
  P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
  echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
  [ -z "$P" ] && W_DEAD_APP=1
  [ -z "$SS" ] && W_DEAD_SS=1
  [ $(EL) -lt 578 ] && shot $STATE/demo-15s.png d15s.png
fi
if [ "$W_DEAD_APP" = "0" ] && [ "$W_DEAD_SS" = "0" ] && [ $(EL) -lt 562 ]; then
  sleep 15
  P=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
  echo "t=$(EL)s +$(($(EL)-TAPT))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $HEALTH
  [ -z "$P" ] && W_DEAD_APP=1
  [ -z "$SS" ] && W_DEAD_SS=1
  [ $(EL) -lt 578 ] && shot $STATE/demo-30s.png d30s.png
fi
[ -f $STATE/demo-30s.png ] || TRUNC=1

# ---- classification CASE 1-5 ----
PFIN=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SSFIN=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
POST=$STATE/demo-30s.png; [ -f $POST ] || POST=$STATE/demo-15s.png; [ -f $POST ] || POST=$STATE/demo-5s.png; [ -f $POST ] || POST=$BASE
DIFF=$(pdiff $BASE $POST)
RESULT="UNKNOWN"; NOTE=""
if [ -z "$SSFIN" ]; then
  RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="system_server died during/after tap"
elif [ -z "$PFIN" ]; then
  RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app process died, system_server alive"
elif [ "${DIFF:-0}" -ge 8 ] 2>/dev/null; then
  RESULT="CASE1_DEMO_PASS"; NOTE="ui change ${DIFF}%"
else
  # footer gone => navigated away
  FGONE=$(footer2 $POST | wc -l)
  echo "post-tap footer rows: $FGONE" >> $HEALTH
  if [ "$FGONE" -eq 0 ] 2>/dev/null; then
    RESULT="CASE1_DEMO_PASS"; NOTE="footer row gone after tap"
  else
    CLICKED=$(grep -ac "auth.onLoggedIn demo=true" $LOGCAT 2>/dev/null || echo 0)
    echo "demo-click-logcat-evidence=$CLICKED" >> $HEALTH
    if [ "${CLICKED:-0}" -ge 1 ]; then
      if [ $(EL) -lt 552 ]; then
        progress "click HANDLED (MqBoot onLoggedIn) - extended watch +15s"
        sleep 15
        shot $STATE/demo-45s.png d45s.png
        D3=$(pdiff $BASE $STATE/demo-45s.png)
        P3=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
        SS3=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
        if [ -z "$SS3" ]; then RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="ss died late"
        elif [ -z "$P3" ]; then RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app died late (post-click)"
        elif [ "${D3:-0}" -ge 8 ] 2>/dev/null; then RESULT="CASE1_DEMO_PASS"; NOTE="delayed nav ui ${D3}% at +45s"
        else RESULT="CASE5_APP_HUNG"; NOTE="click handled, no nav by +45s - ANR suspect"
        fi
        DIFF=${D3:-$DIFF}
      else
        RESULT="CASE5_APP_HUNG_OR_TCG_SLOW"; NOTE="click handled (logcat), no nav by +30s, budget exhausted"
      fi
    elif [ $(EL) -lt 545 ]; then
      progress "no click evidence - blob tap retry"
      python3 $S/evdev_blobs.py tap $STATE/blob-demo $DEMO_X $DEMO_Y >/dev/null 2>&1
      timeout 15 $ADB push $STATE/blob-demo-p0.bin /data/local/tmp/db0.bin >/dev/null 2>&1
      timeout 15 $ADB push $STATE/blob-demo-p1.bin /data/local/tmp/db1.bin >/dev/null 2>&1
      blobtap db0.bin db1.bin
      sleep 12
      shot $STATE/demo-blob-retry.png dbr.png
      P2=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
      SS2=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
      D2=$(pdiff $BASE $STATE/demo-blob-retry.png)
      if [ -z "$SS2" ]; then RESULT="CASE3_ENVIRONMENT_FAILURE"; NOTE="ss died after blob retry"
      elif [ -z "$P2" ]; then RESULT="CASE2_REAL_APP_FAILURE"; NOTE="app died after blob tap"
      elif [ "${D2:-0}" -ge 8 ] 2>/dev/null; then RESULT="CASE1_DEMO_PASS"; NOTE="blob tap ui change ${D2}%"
      else RESULT="CASE4_INPUT_UI_TEST_FAILURE"; NOTE="no click evidence, no ui change (diff ${DIFF}%/${D2}%)"
      fi
    else
      RESULT="CASE4_INPUT_UI_TEST_FAILURE"; NOTE="no click evidence, no ui change (diff ${DIFF}%), budget exhausted"
    fi
  fi
fi
[ "$TRUNC" = "1" ] && NOTE="$NOTE [truncated: no +30s shot]"

echo "$RESULT" > $STATE/demo-result.txt
PF2=$(timeout 12 $ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SS2F=$(timeout 12 $ADB shell pidof system_server 2>/dev/null | tr -d '\r' | awk '{print $1}')
echo "result=$RESULT note=$NOTE app_final=${PF2:-DEAD} ss_final=${SS2F:-DEAD} diff=${DIFF:-ERR}% tapcmd=$TAPCMD coords=$FB elapsed=$(EL)s" > $STATE/last_checkpoint.txt
progress "RESULT: $RESULT ($NOTE) app=${PF2:-DEAD} ss=${SS2F:-DEAD} diff=${DIFF:-ERR}%"

kill $STREAMER 2>/dev/null
[ -f $LOGCAT ] && grep -aE "MqCrash|MqBoot|MqApp|MqDemo|MqAuth|AndroidRuntime|FATAL|DeadSystem|ANR in|Displayed com.mq1" $LOGCAT > $STATE/crash.log 2>/dev/null
[ -f $LOGCAT ] && awk '/FATAL EXCEPTION|Process: com.mq1/{p=1} p{print; c++; if(c>150){p=0;c=0}}' $LOGCAT > $STATE/crash-blocks.txt 2>/dev/null
if [[ "$RESULT" == *REAL_APP_FAILURE* ]] || [[ "$RESULT" == *HUNG* ]]; then
  timeout 15 $ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/last_crash.txt 2>/dev/null
  timeout 15 $ADB shell "ls -t /data/tombstones 2>/dev/null | head -3; ls /data/anr 2>/dev/null | head -3" > $STATE/tombstones.list 2>/dev/null
fi

# ---- bonus: nav probes if PASS with budget ----
if [[ "$RESULT" == CASE1* ]] && [ $(EL) -lt 545 ]; then
  progress "PASS - probing bottom nav Profile (96,612) then Search (224,612)"
  shot $STATE/nav-before.png nb.png
  timeout 20 $ADB shell input tap 96 612 >/dev/null 2>&1
  sleep 8
  shot $STATE/nav-profile.png np.png
  echo "nav-profile diff=$(pdiff $STATE/nav-before.png $STATE/nav-profile.png)%" >> $HEALTH
  timeout 20 $ADB shell input tap 224 612 >/dev/null 2>&1
  sleep 8
  shot $STATE/nav-search.png ns.png
  echo "nav-search diff=$(pdiff $STATE/nav-profile.png $STATE/nav-search.png)%" >> $HEALTH
fi

$ADB kill-server 2>/dev/null
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 1
progress "v41e COMPLETE: $RESULT"
echo "================ RESULT: $RESULT ================"
echo "note: $NOTE"
echo "app=${PF2:-DEAD} system_server=${SS2F:-DEAD} diff=${DIFF:-ERR}% tapcmd=$TAPCMD elapsed=$(EL)s"
echo "--- start-W ---"; cat $STATE/start-W.txt 2>/dev/null
echo "--- crash blocks (top 30) ---"; head -30 $STATE/crash-blocks.txt 2>/dev/null
echo "--- last_crash (top 20) ---"; head -20 $STATE/last_crash.txt 2>/dev/null
exit 0
