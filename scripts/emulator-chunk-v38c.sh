#!/bin/bash
# Chunk v38c — GOOGLE LOGIN TEST on the "booted" snapshot.
# Launch app -> dismiss dialog -> find "Продолжить с Google" (top of card,
# no scroll needed) -> verify guest network -> blob tap -> watch 120s:
# MqAuth checkpoints (GOOGLE_02 nonce -> GOOGLE_04 provider -> passes) ->
# classify the EXACT failing step (CASE A..I). AOSP has no GMS -> full flow
# expected BLOCKED, but verified with runtime evidence up to that point.
MAX=${1:-560}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=/tmp/my-project/avd
ADB=$SDK/platform-tools/adb
AVD=$ANDROID_AVD_HOME/mq35x.avd
STATE=/tmp/my-project/android-runtime/state
S=/tmp/my-project/scripts
OUT=$STATE/chunk-v38c.log
HEALTH=$STATE/health-v38c.log
mkdir -p $STATE
: > $OUT
echo "=== chunk v38c GOOGLE TEST $(date -u +%H:%M:%SZ) ===" >> $OUT

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
  > $STATE/boot-v38c-emulator.log 2>&1 &
EMUPID=$!

for i in $(seq 1 20); do [ -S $STATE/qemu-mon.sock ] && break; kill -0 $EMUPID 2>/dev/null || break; sleep 2; done
[ -S $STATE/qemu-mon.sock ] && python3 $S/hmp.py $STATE/qemu-mon.sock "set_link virtio-net-pci.0 on" >> $OUT 2>&1

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

hline() { echo "[$(date -u +%H:%M:%S)] $*" >> $HEALTH; }
: > $HEALTH
SS0=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
hline "baseline: system_server=$SS0 boot=1"
echo "PHASE1: system_server=$SS0" >> $OUT

( while kill -0 $EMUPID 2>/dev/null; do
    P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
    SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
    hline "poll: app=${P:-DEAD} system_server=${SS:-DEAD}"
    sleep 12
  done ) &
POLLPID=$!

# gesture blobs: dialog ALLOW tap
python3 $S/evdev_blobs.py tap $STATE/blob-gallow 160 351 >> $OUT 2>&1
$ADB push $STATE/blob-gallow-p0.bin /data/local/tmp/b0.bin >/dev/null 2>&1
$ADB push $STATE/blob-gallow-p1.bin /data/local/tmp/b1.bin >/dev/null 2>&1
$ADB push $S/sendblob.sh /data/local/tmp/sendblob.sh >/dev/null 2>&1
$ADB shell chmod 755 /data/local/tmp/sendblob.sh >/dev/null 2>&1
blobtap() { for b in "$@"; do
    $ADB shell /data/local/tmp/sendblob.sh /data/local/tmp/$b >/dev/null 2>&1
    case "$b" in b0*|g0*) sleep 0.08;; *) sleep 0.025;; esac
  done; }

# ---- guest network verification (needed for GOOGLE_02 nonce) ----
{
  echo "--- guest net ---"
  $ADB shell ip addr show 2>/dev/null | grep -E "eth0|inet "
  $ADB shell ping -c 1 -W 6 mq1.vercel.app 2>&1 | tail -2
} > $STATE/guest-network.txt 2>&1
echo "guest network: $(tail -2 $STATE/guest-network.txt | tr '\n' ' ')" >> $OUT

# ---- fresh app state (LoginScreen guaranteed even if v38b demo logged in) ----
$ADB shell pm clear com.mq1.player >> $OUT 2>&1
$ADB shell pm grant com.mq1.player android.permission.POST_NOTIFICATIONS >> $OUT 2>&1
echo "pm clear + grant done at $(( $(date +%s) - T0 ))s" >> $OUT

# ---- launch app ----
$ADB logcat -c 2>/dev/null
APP_PID=""
for attempt in 1 2 3 4 5; do
  $ADB shell am start --user 0 -n com.mq1.player/.MainActivity >> $OUT 2>&1
  sleep 9
  APP_PID=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  [ -n "$APP_PID" ] && break
done
echo "app_pid=${APP_PID:-NONE} at $(( $(date +%s) - T0 ))s" >> $OUT
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

shot $STATE/gscr-launch.png
DB=$(bright $STATE/gscr-launch.png 220 440)
echo "launch dialog-band=$DB" >> $OUT
if [ "${DB:-0}" -ge 150 ] 2>/dev/null; then
  echo "permission dialog PRESENT - blob tap ALLOW" >> $OUT
  blobtap b0.bin b1.bin
  sleep 9
  shot $STATE/gscr-postdialog.png
  DB2=$(bright $STATE/gscr-postdialog.png 220 440)
  echo "post-dismiss dialog-band=$DB2" >> $OUT
  if [ "${DB2:-0}" -ge 150 ] 2>/dev/null; then
    blobtap b0.bin b1.bin; sleep 9
    shot $STATE/gscr-postdialog2.png
    echo "post-dismiss-2 dialog-band=$(bright $STATE/gscr-postdialog2.png 220 440)" >> $OUT
  fi
fi
sleep 4
shot $STATE/glogin-1.png

# ---- find Google button coordinates ----
GX=""; GY=""
$ADB shell rm -f /data/local/tmp/ui.xml 2>/dev/null; rm -f $STATE/ui-v38c.xml
$ADB shell uiautomator dump /data/local/tmp/ui.xml >/dev/null 2>&1
sleep 2
$ADB pull /data/local/tmp/ui.xml $STATE/ui-v38c.xml >/dev/null 2>&1
if [ -s $STATE/ui-v38c.xml ]; then
  B=$(grep -o 'text="Продолжить с Google"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' $STATE/ui-v38c.xml | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | tr -d '[]' | head -1)
  if [ -n "$B" ]; then
    X1=$(echo $B | cut -d, -f1); Y1=$(echo $B | cut -d, -f2); X2=$(echo $B | cut -d, -f3); Y2=$(echo $B | cut -d, -f4)
    GX=$(( (X1 + X2) / 2 )); GY=$(( (Y1 + Y2) / 2 ))
    echo "dump Google bounds=[$X1,$Y1][$X2,$Y2] -> ($GX,$GY)" >> $OUT
  fi
fi
if [ -z "$GY" ]; then
  # pixel: white button = the widest bright band in y 150..280
  GY=$(python3 -c "
from PIL import Image
im = Image.open('$STATE/glogin-1.png').convert('RGB'); w,h = im.size; px = im.load()
best=None
for y in range(150, min(290,h)):
    xs = [x for x in range(w) if sum(px[x,y]) > 600]
    if len(xs) > 150:
        if best is None: best=[y,y]
        else: best[1]=y
if best: print((best[0]+best[1])//2)
" 2>/dev/null)
  GX=160
  echo "pixel Google button center=(160,${GY:-none})" >> $OUT
fi
[ -z "$GY" ] && { GX=160; GY=207; echo "fallback Google=(160,207)" >> $OUT; }
echo "FINAL google tap coords: ($GX,$GY)" >> $OUT

# ---- THE GOOGLE TAP ----
python3 $S/evdev_blobs.py tap $STATE/blob-google $GX $GY >> $OUT 2>&1
$ADB push $STATE/blob-google-p0.bin /data/local/tmp/g0.bin >/dev/null 2>&1
$ADB push $STATE/blob-google-p1.bin /data/local/tmp/g1.bin >/dev/null 2>&1
shot $STATE/pre-google.png
$ADB logcat -c 2>/dev/null
echo "=== GOOGLE TAP ($GX,$GY) at $(( $(date +%s) - T0 ))s ===" >> $OUT
blobtap g0.bin g1.bin

# watch 120s (nonce is a network call on TCG; picker would take time)
for w in $(seq 1 10); do
  sleep 12
  P=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
  SS=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
  hline "google +$((w*12))s: app=${P:-DEAD} system_server=${SS:-DEAD}"
  echo "  +$((w*12))s: app=${P:-DEAD} system_server=${SS:-DEAD}" >> $OUT
  [ $w -eq 2 ] && shot $STATE/google-24s.png
  [ $w -eq 5 ] && shot $STATE/google-60s.png
  [ $w -eq 9 ] && shot $STATE/google-108s.png
  [ -z "$P" ] && break
done
shot $STATE/post-google.png
$ADB logcat -d -v time > $STATE/logcat-google.txt 2>/dev/null

# ---- evidence + step classification ----
grep -E "MqAuth|MqCrash|MqBoot|MqApp|AndroidRuntime|FATAL|CredentialManager|googleid|credentials" $STATE/logcat-google.txt > $STATE/google-crash.log 2>/dev/null
grep -E "MqAuth" $STATE/logcat-google.txt > $STATE/mqauth-steps.log 2>/dev/null
$ADB shell "cat /data/data/com.mq1.player/files/crash/last_crash.txt 2>/dev/null" > $STATE/glast_crash.txt 2>/dev/null

GRESULT="UNKNOWN"
PFINAL=$($ADB shell pidof com.mq1.player 2>/dev/null | tr -d '\r')
SSFINAL=$($ADB shell pidof system_server 2>/dev/null | tr -d '\r')
NMQAUTH=$(wc -l < $STATE/mqauth-steps.log 2>/dev/null || echo 0)
if [ -z "$SSFINAL" ]; then
  GRESULT="ENVIRONMENT_FAILURE_system_server_died"
elif [ -z "$PFINAL" ]; then
  GRESULT="APP_CRASH_ON_GOOGLE"
elif [ "$NMQAUTH" -eq 0 ]; then
  GRESULT="CASE_A_no_flow_logs_click_or_config_unknown"
elif rg -q "status=provider_unavailable" $STATE/mqauth-steps.log 2>/dev/null; then
  GRESULT="CASE_B_provider_unavailable"
elif rg -q "no_authorized_account pass=1" $STATE/mqauth-steps.log 2>/dev/null; then
  if rg -q "pass=2" $STATE/mqauth-steps.log 2>/dev/null; then
    GRESULT="CASE_C_pass1_fallback_pass2_executed"
  else
    GRESULT="CASE_C_pass1_no_credential_no_fallback_evidence"
  fi
elif rg -q "NetworkError|nonce" $STATE/mqauth-steps.log 2>/dev/null; then
  GRESULT="GOOGLE_02_nonce_network_failure"
else
  GRESULT="FLOW_PROGRESSING_see_mqauth_steps"
fi
echo "$GRESULT" > $STATE/google-result.txt
echo "**** GOOGLE RESULT: $GRESULT (MqAuth lines: $NMQAUTH) ****" >> $OUT

kill $POLLPID 2>/dev/null
kill -9 $EMUPID 2>/dev/null
pkill -9 -f "qemu-system.*mq35x" 2>/dev/null; pkill -9 -f "emulator.*mq35x" 2>/dev/null
pkill -9 -f netsimd 2>/dev/null; pkill -9 -f crashpad_handler 2>/dev/null
sleep 2
{ date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "v38c: result=$GRESULT app=${PFINAL:-DEAD} ss=${SSFINAL:-DEAD} mqauth_lines=$NMQAUTH elapsed=$(( $(date +%s) - T0 ))s"; } > $STATE/last_checkpoint.txt

echo "**** CHUNK v38c RESULT: $GRESULT ****"
echo "--- MqAuth steps ---"; cat $STATE/mqauth-steps.log 2>/dev/null | head -30
echo "--- google-crash tail ---"; tail -20 $STATE/google-crash.log 2>/dev/null
tail -20 $OUT